import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  createWorkerHandler,
  resetWorkerRateLimitsForTests,
  resolveSafeHttpsUrl,
} from '../../worker/index.js';

interface RecordedFetch {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

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

function createFakeD1() {
  let nextId = 1;
  const rows = new Map<
    string,
    { id: number; email: string; lang: string; source: string; status: string }
  >();
  let ddlCalls = 0;

  return {
    get ddlCalls() {
      return ddlCalls;
    },
    get rows() {
      return rows;
    },
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          args = params;
          return stmt;
        },
        async first() {
          if (sql.includes('SELECT id, status FROM newsletter_subscribers WHERE email = ?')) {
            const email = String(args[0] || '');
            const found = rows.get(email);
            return found ? { id: found.id, status: found.status } : null;
          }
          return null;
        },
        async run() {
          if (sql.includes('CREATE TABLE IF NOT EXISTS newsletter_subscribers')) {
            ddlCalls += 1;
            return { success: true };
          }
          if (sql.includes('INSERT INTO newsletter_subscribers')) {
            const [email, lang, source] = args.map(String);
            rows.set(email, { id: nextId++, email, lang, source, status: 'subscribed' });
            return { success: true };
          }
          if (sql.includes("status = 'subscribed', lang = ?, source = ?")) {
            const [lang, source, id] = args;
            for (const row of rows.values()) {
              if (row.id === Number(id)) {
                row.status = 'subscribed';
                row.lang = String(lang);
                row.source = String(source);
              }
            }
            return { success: true };
          }
          if (sql.includes('SET lang = ?, source = ?')) {
            const [lang, source, id] = args;
            for (const row of rows.values()) {
              if (row.id === Number(id)) {
                row.lang = String(lang);
                row.source = String(source);
              }
            }
            return { success: true };
          }
          if (sql.includes("status = 'unsubscribed'")) {
            const email = String(args[0] || '');
            const row = rows.get(email);
            if (row) row.status = 'unsubscribed';
            return { success: true };
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function createFakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    async put(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

describe('Cloudflare Worker Edge Newsletter API (worker/index.js)', () => {
  beforeEach(() => {
    resetWorkerRateLimitsForTests();
  });

  it('enforces strict CORS preflight with null 204 body and blocks untrusted origins', async () => {
    const worker = createWorkerHandler(async () => makeJsonResponse({ ok: true }));

    const allowedRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'OPTIONS',
        headers: { Origin: 'https://ainvtry.com' },
      }),
      {}
    );
    assert.equal(allowedRes.status, 204);
    assert.equal(await allowedRes.text(), '');
    assert.equal(allowedRes.headers.get('Access-Control-Allow-Origin'), 'https://ainvtry.com');

    const blockedRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
      {}
    );
    assert.equal(blockedRes.status, 204);
    assert.equal(blockedRes.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('reports accurate health storage tier and integration readiness without leaking secrets', async () => {
    const worker = createWorkerHandler(async () => makeJsonResponse({ ok: true }));

    const upstreamHealth = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/health'),
      {}
    );
    assert.equal(upstreamHealth.status, 200);
    const upstreamJson = (await upstreamHealth.json()) as Record<string, unknown>;
    assert.equal(upstreamJson.ok, true);
    assert.equal(upstreamJson.storage, 'upstream');
    assert.equal(upstreamJson.emailConfigured, false);
    assert.equal(upstreamJson.webhookConfigured, false);

    const mockToken = ['stub', 'never', 'echoed'].join('-');
    const d1Health = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/health'),
      {
        NEWSLETTER_DB: createFakeD1(),
        RESEND_API_KEY: mockToken,
        NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/XXXX',
      }
    );
    const rawText = await d1Health.text();
    assert.ok(!rawText.includes(mockToken));
    const d1Json = JSON.parse(rawText) as Record<string, unknown>;
    assert.equal(d1Json.storage, 'd1');
    assert.equal(d1Json.emailConfigured, true);
    assert.equal(d1Json.webhookConfigured, true);

    const kvHealth = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/health'),
      { NEWSLETTER_KV: createFakeKv() }
    );
    const kvJson = (await kvHealth.json()) as Record<string, unknown>;
    assert.equal(kvJson.storage, 'kv');
  });

  it('validates inputs, drops honeypot silently, rejects oversized payloads, and enforces rate limits', async () => {
    const calls: RecordedFetch[] = [];
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ ok: true, status: 'subscribed', email: 'ok@ainvtry.com' }, 201);
    });

    const badEmail = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
        body: JSON.stringify({ email: 'bad\r\nBcc:x@y.com', consent: true }),
      }),
      {}
    );
    assert.equal(badEmail.status, 400);

    const noConsent = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.11' },
        body: JSON.stringify({ email: 'valid@ainvtry.com', consent: false }),
      }),
      {}
    );
    assert.equal(noConsent.status, 400);

    const oversized = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.12' },
        body: JSON.stringify({ email: 'a@b.com', consent: true, pad: 'x'.repeat(9000) }),
      }),
      {}
    );
    assert.equal(oversized.status, 413);

    const honeypot = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.13' },
        body: JSON.stringify({ email: 'bot@spam.test', consent: true, website: 'https://spam.test' }),
      }),
      {}
    );
    assert.equal(honeypot.status, 200);
    assert.equal(calls.length, 0);

    // Trigger rate limit on same IP (12 allowed, 13th returns 429 + Retry-After)
    for (let i = 0; i < 12; i += 1) {
      const ok = await worker.fetch(
        new Request('https://ainvtry.com/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
          body: JSON.stringify({ email: `u${i}@ainvtry.com`, consent: true }),
        }),
        {}
      );
      assert.equal(ok.status, 201);
    }
    const limited = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
        body: JSON.stringify({ email: 'u13@ainvtry.com', consent: true }),
      }),
      {}
    );
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
  });

  it('persists full subscribe -> duplicate -> unsubscribe -> resubscribe lifecycle in Cloudflare D1 + fires Resend & Webhook notifications', async () => {
    const calls: RecordedFetch[] = [];
    const d1 = createFakeD1();
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ ok: true, status: 'subscribed' }, 201);
    });

    const env = {
      NEWSLETTER_DB: d1,
      RESEND_API_KEY: ['stub', 'mail', 'key'].join('-'),
      NEWSLETTER_NOTIFY_EMAIL: 'raymond@ainvtry.com',
      NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T01/B02/SECRET',
      NEWSLETTER_WEBHOOK_SECRET: ['stub', 'hook', '123'].join('-'),
    };

    const wait1 = createWaitUntilCollector();
    const first = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({ email: 'MBO88@Naver.com', consent: true, lang: 'ko', source: 'site_about' }),
      }),
      env,
      wait1.ctx
    );
    await wait1.flush();

    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as { ok: boolean; status: string; storage: string; email: string };
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.status, 'subscribed');
    assert.equal(firstBody.storage, 'd1');
    assert.equal(firstBody.email, 'mbo88@naver.com');
    assert.equal(d1.ddlCalls, 1);

    // Resend called twice (welcome + founder alert), webhook called once, upstream mirror called with dedup header
    const resendCalls = calls.filter((c) => c.url === 'https://api.resend.com/emails');
    assert.equal(resendCalls.length, 2);
    assert.ok(resendCalls.some((c) => c.body.includes('mbo88@naver.com')));
    assert.ok(resendCalls.some((c) => c.body.includes('raymond@ainvtry.com')));

    const webhookCalls = calls.filter((c) => c.url.includes('hooks.slack.com'));
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0]?.headers['x-ainvtry-webhook-secret'], 'stub-hook-123');

    const mirrorCalls = calls.filter((c) => c.url.includes('ainventory-api.onrender.com'));
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0]?.headers['x-newsletter-notify-handled'], '1');

    // Duplicate subscription MUST NOT re-send welcome/founder emails
    const beforeDupResendCount = resendCalls.length;
    const wait2 = createWaitUntilCollector();
    const dup = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.22' },
        body: JSON.stringify({ email: 'mbo88@naver.com', consent: true, lang: 'en', source: 'site_footer' }),
      }),
      env,
      wait2.ctx
    );
    await wait2.flush();
    assert.equal(dup.status, 200);
    const dupBody = (await dup.json()) as { status: string };
    assert.equal(dupBody.status, 'already_subscribed');
    assert.equal(
      calls.filter((c) => c.url === 'https://api.resend.com/emails').length,
      beforeDupResendCount
    );

    // Unsubscribe -> Resubscribe reactivates record
    const wait3 = createWaitUntilCollector();
    const unsub = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.23' },
        body: JSON.stringify({ email: 'mbo88@naver.com' }),
      }),
      env,
      wait3.ctx
    );
    await wait3.flush();
    assert.equal(unsub.status, 200);
    assert.equal(d1.rows.get('mbo88@naver.com')?.status, 'unsubscribed');

    const wait4 = createWaitUntilCollector();
    const resub = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.24' },
        body: JSON.stringify({ email: 'mbo88@naver.com', consent: true, lang: 'ko', source: 'site_modal' }),
      }),
      env,
      wait4.ctx
    );
    await wait4.flush();
    assert.equal(resub.status, 200);
    const resubBody = (await resub.json()) as { status: string; resubscribed?: boolean };
    assert.equal(resubBody.status, 'subscribed');
    assert.equal(resubBody.resubscribed, true);
  });

  it('persists subscribe -> duplicate -> unsubscribe -> resubscribe lifecycle in Cloudflare KV', async () => {
    const kv = createFakeKv();
    const worker = createWorkerHandler(async () => makeJsonResponse({ ok: true, status: 'subscribed' }, 201));
    const env = { NEWSLETTER_KV: kv };

    const wait1 = createWaitUntilCollector();
    const r1 = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.31' },
        body: JSON.stringify({ email: 'kvuser@ainvtry.com', consent: true, lang: 'en', source: 'site_hero' }),
      }),
      env,
      wait1.ctx
    );
    await wait1.flush();
    assert.equal(r1.status, 201);
    const b1 = (await r1.json()) as { storage: string; status: string };
    assert.equal(b1.storage, 'kv');
    assert.equal(b1.status, 'subscribed');

    const r2 = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.32' },
        body: JSON.stringify({ email: 'kvuser@ainvtry.com', consent: true }),
      }),
      env
    );
    assert.equal(r2.status, 200);
    assert.equal(((await r2.json()) as { status: string }).status, 'already_subscribed');

    const r3 = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.33' },
        body: JSON.stringify({ email: 'kvuser@ainvtry.com' }),
      }),
      env
    );
    assert.equal(r3.status, 200);
    const storedAfterUnsub = JSON.parse(kv.store.get('newsletter:sub:kvuser@ainvtry.com') || '{}') as {
      status?: string;
    };
    assert.equal(storedAfterUnsub.status, 'unsubscribed');
  });

  it('retries Render upstream once on 503 cold-start hiccup and succeeds without dropping the subscription', async () => {
    let attempts = 0;
    const worker = createWorkerHandler(async (url) => {
      if (String(url).includes('/api/newsletter/subscribe')) {
        attempts += 1;
        if (attempts === 1) {
          return new Response('Service Waking Up', { status: 503 });
        }
        return makeJsonResponse({ ok: true, status: 'subscribed', email: 'mbo88@naver.com' }, 201);
      }
      return makeJsonResponse({ ok: true });
    });

    const res = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.41' },
        body: JSON.stringify({ email: 'mbo88@naver.com', consent: true, lang: 'ko', source: 'site_about' }),
      }),
      {}
    );
    assert.equal(attempts, 2);
    assert.equal(res.status, 201);
    const body = (await res.json()) as { ok: boolean; status: string; storage: string };
    assert.equal(body.ok, true);
    assert.equal(body.status, 'subscribed');
    assert.equal(body.storage, 'upstream');
  });

  it('uses last-resort Resend/Webhook relay when upstream returns 503 twice and blocks SSRF webhook URLs', async () => {
    // Verify SSRF protection rejects private/loopback/metadata/http URLs
    assert.equal(resolveSafeHttpsUrl('http://hooks.slack.com/services/a/b/c'), null);
    assert.equal(resolveSafeHttpsUrl('https://127.0.0.1/hook'), null);
    assert.equal(resolveSafeHttpsUrl('https://169.254.169.254/latest/meta-data/'), null);
    assert.equal(resolveSafeHttpsUrl('https://10.0.0.5/internal'), null);
    assert.equal(resolveSafeHttpsUrl('https://user:pass@hooks.slack.com/x'), null);
    assert.ok(resolveSafeHttpsUrl('https://hooks.slack.com/services/T/B/X'));

    const worker = createWorkerHandler(async (url) => {
      if (String(url).includes('ainventory-api.onrender.com')) {
        return new Response('Upstream Down', { status: 503 });
      }
      if (String(url) === 'https://api.resend.com/emails') {
        return makeJsonResponse({ id: 'email_123' }, 200);
      }
      return new Response('Not Found', { status: 404 });
    });

    const res = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.51' },
        body: JSON.stringify({ email: 'relay@ainvtry.com', consent: true, lang: 'ko', source: 'site_about' }),
      }),
      { RESEND_API_KEY: ['stub', 'relay', 'key'].join('-') }
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as { ok: boolean; status: string; storage: string };
    assert.equal(body.ok, true);
    assert.equal(body.storage, 'relay');
  });

  it('passes non-/api/* requests directly through to Cloudflare ASSETS binding', async () => {
    let assetCalled = false;
    const worker = createWorkerHandler(async () => makeJsonResponse({ ok: true }));
    const res = await worker.fetch(new Request('https://ainvtry.com/'), {
      ASSETS: {
        async fetch() {
          assetCalled = true;
          return new Response('<html>ainvtry</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        },
      },
    });
    assert.equal(assetCalled, true);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('ainvtry'));
  });
});
