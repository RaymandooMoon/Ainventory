import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  createWorkerHandler,
  isAuthorizedBrowserBundleFetch,
  isBlockedAiScraper,
  resetWorkerRateLimitsForTests,
} from '../../worker/index.js';

function createWaitUntilCollector() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(Promise.resolve(promise));
      },
    },
    async flush() {
      await Promise.allSettled(pending);
    },
  };
}

function createFakeAssets() {
  const requestedPaths: string[] = [];
  return {
    requestedPaths,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      requestedPaths.push(url.pathname);
      if (url.pathname === '/ir/' || url.pathname === '/ir/index.html') {
        return new Response('<html><body>CONFIDENTIAL 18-SLIDE IR DECK</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname.endsWith('.js')) {
        return new Response('console.log("bundle");', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      }
      return new Response('<html><body>PUBLIC LANDING</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  };
}

describe('Cloudflare Worker Anti-Scraper Shield & Investor Data-Room Passcode Gate', () => {
  beforeEach(() => {
    resetWorkerRateLimitsForTests();
  });

  it('blocks known AI crawlers and scripted HTTP scrapers while allowing real browsers and link preview bots on /', async () => {
    for (const ua of [
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      'ChatGPT-User/1.0',
      'ClaudeBot/1.0; +claudebot@anthropic.com',
      'PerplexityBot/1.0',
      'Google-Extended',
      'python-requests/2.32.3',
      'curl/8.5.0',
      'Go-http-client/2.0',
    ]) {
      assert.equal(isBlockedAiScraper(ua), true, `Expected AI/scraper UA to be blocked: ${ua}`);
    }

    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'facebookexternalhit/1.1',
      'kakaotalk-scrap/1.0',
      'Slackbot-LinkExpanding 1.0',
    ]) {
      assert.equal(isBlockedAiScraper(ua), false, `Expected browser/preview UA to be allowed: ${ua}`);
    }

    const assets = createFakeAssets();
    const worker = createWorkerHandler(async () => new Response('{}', { status: 200 }));

    const blockedRoot = await worker.fetch(
      new Request('https://www.ainvtry.com/', {
        headers: { 'User-Agent': 'ChatGPT-User/1.0' },
      }),
      { ASSETS: assets }
    );
    assert.equal(blockedRoot.status, 403);
    assert.match(blockedRoot.headers.get('X-Robots-Tag') || '', /noai/i);
    assert.equal(assets.requestedPaths.length, 0);

    const blockedIr = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/', {
        headers: { 'User-Agent': 'GPTBot/1.2' },
      }),
      { ASSETS: assets, IR_ACCESS_PASSCODE: 'test-passcode-99' }
    );
    assert.equal(blockedIr.status, 403);
    assert.equal(assets.requestedPaths.length, 0);

    const browserRoot = await worker.fetch(
      new Request('https://www.ainvtry.com/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        },
      }),
      { ASSETS: assets }
    );
    assert.equal(browserRoot.status, 200);
    assert.match(browserRoot.headers.get('X-Robots-Tag') || '', /noai/);
    assert.match(browserRoot.headers.get('Vary') || '', /User-Agent/);
  });

  it('blocks direct non-browser JS bundle scraping and removes /sitemap.xml with 404', async () => {
    const assets = createFakeAssets();
    const worker = createWorkerHandler(async () => new Response('{}', { status: 200 }));
    const browserUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

    const sitemapRes = await worker.fetch(
      new Request('https://www.ainvtry.com/sitemap.xml', { headers: { 'User-Agent': browserUa } }),
      { ASSETS: assets }
    );
    assert.equal(sitemapRes.status, 404);
    assert.match(sitemapRes.headers.get('X-Robots-Tag') || '', /noindex/);

    // Plain HTTP fetch of JS bundle (no Sec-Fetch headers and no Referer) -> 403
    const directJsReq = new Request('https://www.ainvtry.com/assets/main-deadbeef.js', {
      headers: { 'User-Agent': browserUa },
    });
    assert.equal(isAuthorizedBrowserBundleFetch(directJsReq), false);
    const blockedJsRes = await worker.fetch(directJsReq, { ASSETS: assets });
    assert.equal(blockedJsRes.status, 403);
    assert.equal(assets.requestedPaths.length, 0);

    // Genuine modern browser module load (Sec-Fetch-Site: same-origin, Sec-Fetch-Dest: script) -> 200
    const browserJsReq = new Request('https://www.ainvtry.com/assets/main-deadbeef.js', {
      headers: {
        'User-Agent': browserUa,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Dest': 'script',
      },
    });
    assert.equal(isAuthorizedBrowserBundleFetch(browserJsReq), true);
    const allowedJsRes = await worker.fetch(browserJsReq, { ASSETS: assets });
    assert.equal(allowedJsRes.status, 200);
    assert.match(allowedJsRes.headers.get('X-Robots-Tag') || '', /noindex.*noai/);
    assert.match(allowedJsRes.headers.get('Vary') || '', /Sec-Fetch-Dest/);

    // Legacy Safari fallback with same-origin Referer -> 200
    const safariJsReq = new Request('https://www.ainvtry.com/assets/vendor-react-1234.js', {
      headers: {
        'User-Agent': browserUa,
        Referer: 'https://www.ainvtry.com/',
      },
    });
    assert.equal(isAuthorizedBrowserBundleFetch(safariJsReq), true);
    const safariJsRes = await worker.fetch(safariJsReq, { ASSETS: assets });
    assert.equal(safariJsRes.status, 200);
  });

  it('fails closed on /ir/* and /api/investor/* when IR_ACCESS_PASSCODE is not yet configured', async () => {
    const assets = createFakeAssets();
    const worker = createWorkerHandler(async () => new Response('{}', { status: 200 }));
    const browserUa = 'Mozilla/5.0 Safari/605.1.15';

    const irRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/?lang=en&theme=light', {
        headers: { 'User-Agent': browserUa, Accept: 'text/html' },
      }),
      { ASSETS: assets }
    );
    assert.equal(irRes.status, 401);
    assert.equal(irRes.headers.get('X-Frame-Options'), 'DENY');
    assert.match(irRes.headers.get('X-Robots-Tag') || '', /noindex, nofollow, noarchive/);
    const html = await irRes.text();
    assert.match(html, /Investor Data Room/);
    assert.doesNotMatch(html, /CONFIDENTIAL 18-SLIDE IR DECK/);
    assert.equal(assets.requestedPaths.length, 0);

    const irJsRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/ir-deck.js', { headers: { 'User-Agent': browserUa } }),
      { ASSETS: assets }
    );
    assert.equal(irJsRes.status, 401);

    const briefRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/brief?lang=ko', {
        headers: { 'User-Agent': browserUa },
      }),
      { ASSETS: assets }
    );
    assert.equal(briefRes.status, 401);

    const unlockRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': browserUa },
        body: JSON.stringify({ passcode: 'anything' }),
      }),
      { ASSETS: assets }
    );
    assert.equal(unlockRes.status, 503);
    const unlockJson = (await unlockRes.json()) as { code?: string };
    assert.equal(unlockJson.code, 'GATE_NOT_CONFIGURED');
  });

  it('enforces passcode verification, rate-limits brute force, unlocks /ir/* & confidential brief via HttpOnly cookie, and notifies founder without leaking passcode', async () => {
    const assets = createFakeAssets();
    const notifications: Array<{ url: string; body: string }> = [];
    const worker = createWorkerHandler(async (url, init) => {
      notifications.push({ url: String(url), body: String(init?.body || '') });
      return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
    });

    const passcode = ['invtry', 'demo', 'gate', '2026'].join('-');
    const env = {
      ASSETS: assets,
      IR_ACCESS_PASSCODE: passcode,
      NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T1/B2/C3',
    };
    const browserUa = 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36';

    // 1. Brute-force 5 wrong attempts from attacker IP -> 401 x4 then 429
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const badRes = await worker.fetch(
        new Request('https://www.ainvtry.com/api/investor/unlock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': browserUa,
            'cf-connecting-ip': '198.51.100.77',
          },
          body: JSON.stringify({ passcode: `wrong-${attempt}` }),
        }),
        env
      );
      assert.equal(badRes.status, attempt === 5 ? 429 : 401);
    }

    // 6th attempt even with correct passcode from same rate-limited IP is still blocked with 429
    const lockedOutRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': browserUa,
          'cf-connecting-ip': '198.51.100.77',
        },
        body: JSON.stringify({ passcode }),
      }),
      env
    );
    assert.equal(lockedOutRes.status, 429);
    assert.ok(Number(lockedOutRes.headers.get('Retry-After')) > 0);

    // 2. Legitimate investor unlocks from clean IP
    const collector = createWaitUntilCollector();
    const unlockRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': browserUa,
          'cf-connecting-ip': '203.0.113.55',
          'cf-ipcountry': 'KR',
        },
        body: JSON.stringify({ passcode, label: 'Alpha Ventures', path: '/ir/' }),
      }),
      env,
      collector.ctx
    );
    assert.equal(unlockRes.status, 200);
    const setCookie = unlockRes.headers.get('Set-Cookie') || '';
    assert.match(setCookie, /^invtry_ir_session=irv1\./);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);

    await collector.flush();
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].body, /Alpha Ventures/);
    assert.ok(
      !notifications[0].body.includes(passcode),
      'Audit notification must never log or leak the raw passcode'
    );

    const cookiePair = setCookie.split(';')[0];

    // 3. Authenticated cookie unlocks status, confidential brief (KO & EN), and /ir/ deck
    const statusRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/status', {
        headers: { 'User-Agent': browserUa, Cookie: cookiePair },
      }),
      env
    );
    assert.equal(statusRes.status, 200);
    assert.deepEqual(await statusRes.json(), { ok: true, unlocked: true, configured: true });

    const briefKoRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/brief?lang=ko', {
        headers: { 'User-Agent': browserUa, Cookie: cookiePair },
      }),
      env
    );
    assert.equal(briefKoRes.status, 200);
    assert.match(briefKoRes.headers.get('Cache-Control') || '', /private, no-store/);
    const briefKo = (await briefKoRes.json()) as {
      ok: boolean;
      brief: { businessModel: { marginValue: string }; revenuePillars: Array<{ mechanism: string }> };
    };
    assert.equal(briefKo.ok, true);
    assert.equal(briefKo.brief.businessModel.marginValue, '원가 통제');
    assert.match(briefKo.brief.revenuePillars[0].mechanism, /단가 협의 중/);
    assert.doesNotMatch(JSON.stringify(briefKo), /70%\+|무제한|\[TBD\]|₩0/);

    const irUnlockedRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/', {
        headers: { 'User-Agent': browserUa, Cookie: cookiePair },
      }),
      env
    );
    assert.equal(irUnlockedRes.status, 200);
    assert.match(irUnlockedRes.headers.get('Cache-Control') || '', /private, no-store/);
    assert.match(irUnlockedRes.headers.get('X-Robots-Tag') || '', /noindex, nofollow, noarchive/);
    assert.match(await irUnlockedRes.text(), /CONFIDENTIAL 18-SLIDE IR DECK/);

    // 4. Tampered cookie fails closed with 401
    const tamperedCookie = `${cookiePair.slice(0, -4)}0000`;
    const tamperedRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/', {
        headers: { 'User-Agent': browserUa, Cookie: tamperedCookie },
      }),
      env
    );
    assert.equal(tamperedRes.status, 401);

    // 5. Logout clears session cookie
    const logoutRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/logout', {
        method: 'POST',
        headers: { 'User-Agent': browserUa, Cookie: cookiePair },
      }),
      env
    );
    assert.equal(logoutRes.status, 200);
    assert.match(logoutRes.headers.get('Set-Cookie') || '', /Max-Age=0/);
  });

  it('removes Google hint from gate HTML (KO & EN), shows 22-slide count and privacy notice, records KV access logs, and protects /api/investor/logs', async () => {
    const assets = createFakeAssets();
    const browserUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
    const kvStore = new Map<string, string>();
    const mockKv = {
      async get(key: string) {
        return kvStore.has(key) ? kvStore.get(key)! : null;
      },
      async put(key: string, value: string) {
        kvStore.set(key, value);
      },
    };
    const passcode = ['vc', 'ir', 'gate', '2026'].join('-');
    const adminSecret = 'super-secret-admin-log-key';
    const worker = createWorkerHandler(async () => new Response('ok', { status: 200 }));
    const collector = createWaitUntilCollector();
    const env = {
      ASSETS: assets,
      IR_ACCESS_PASSCODE: passcode,
      IR_ADMIN_SECRET: adminSecret,
      NEWSLETTER_KV: mockKv,
    };

    // 1. Gate HTML (KO & EN) omits Google hint, shows 22 slides, and discloses viewer collection purpose
    const gateRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/?lang=ko', {
        headers: { 'User-Agent': browserUa, Accept: 'text/html' },
      }),
      env,
      collector.ctx
    );
    assert.equal(gateRes.status, 401);
    const gateHtml = await gateRes.text();
    assert.doesNotMatch(gateHtml, /Google/i);
    assert.match(gateHtml, /22장/);
    assert.match(gateHtml, /데이터룸 열람 기록 목적으로만 수집/);

    const gateEnRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/?lang=en', {
        headers: { 'User-Agent': browserUa, Accept: 'text/html' },
      }),
      env,
      collector.ctx
    );
    assert.equal(gateEnRes.status, 401);
    const gateEnHtml = await gateEnRes.text();
    assert.doesNotMatch(gateEnHtml, /Google/i);
    assert.match(gateEnHtml, /22-slide/);
    assert.match(gateEnHtml, /never shared with third parties/);

    // 2. Unlock as invited investor
    const unlockRes = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/unlock', {
        method: 'POST',
        headers: {
          'User-Agent': browserUa,
          Origin: 'https://www.ainvtry.com',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.77',
          'CF-IPCountry': 'US',
        },
        body: JSON.stringify({ passcode, label: 'Google', path: '/ir/' }),
      }),
      env,
      collector.ctx
    );
    assert.equal(unlockRes.status, 200);
    await collector.flush();
    const setCookie = unlockRes.headers.get('Set-Cookie') || '';
    const cookiePair = setCookie.split(';')[0];

    // 3. View /ir/ so view event is also logged
    const irRes = await worker.fetch(
      new Request('https://www.ainvtry.com/ir/', {
        headers: { 'User-Agent': browserUa, Cookie: cookiePair, 'CF-IPCountry': 'US' },
      }),
      env,
      collector.ctx
    );
    assert.equal(irRes.status, 200);
    await collector.flush();

    // 4. /api/investor/logs rejects unauthenticated requests
    const unauthLogs = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/logs', {
        headers: { 'User-Agent': browserUa },
      }),
      env,
      collector.ctx
    );
    assert.equal(unauthLogs.status, 401);

    // 5. /api/investor/logs returns recorded events when authorized
    const authLogs = await worker.fetch(
      new Request('https://www.ainvtry.com/api/investor/logs?limit=10', {
        headers: {
          'User-Agent': browserUa,
          Authorization: `Bearer ${adminSecret}`,
        },
      }),
      env,
      collector.ctx
    );
    assert.equal(authLogs.status, 200);
    const body = (await authLogs.json()) as {
      ok: boolean;
      source: string;
      logs: Array<{ event: string; label: string; googleReviewer: boolean; country: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.source, 'kv');
    assert.ok(body.logs.length >= 2);
    assert.equal(body.logs[0].event, 'investor.data_room_viewed');
    assert.equal(body.logs[0].label, 'Google');
    assert.equal(body.logs[0].googleReviewer, true);
    assert.equal(body.logs[1].event, 'investor.data_room_unlocked');
    assert.equal(body.logs[1].googleReviewer, true);
  });
});
