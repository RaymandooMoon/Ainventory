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
    {
      id: number;
      email: string;
      lang: string;
      source: string;
      status: string;
      unsubscribed_at: string | null;
      verification_code_hash: string | null;
      verification_token_hash: string | null;
      verification_expires_at: string | null;
      verification_sent_at: string | null;
      verification_fail_count: number;
    }
  >();

  return {
    rows,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          args = params;
          return stmt;
        },
        async first() {
          if (sql.includes('FROM newsletter_subscribers WHERE email = ?')) {
            const email = String(args[0] || '');
            return rows.get(email) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO newsletter_subscribers')) {
            const [email, lang, source, codeHash, tokenHash, expiresIso, nowIso] = args.map(String);
            rows.set(email, {
              id: nextId++,
              email,
              lang,
              source,
              status: 'pending',
              unsubscribed_at: null,
              verification_code_hash: codeHash,
              verification_token_hash: tokenHash,
              verification_expires_at: expiresIso,
              verification_sent_at: nowIso,
              verification_fail_count: 0,
            });
            return { success: true };
          }
          if (sql.includes("SET status = 'pending'")) {
            const [lang, source, codeHash, tokenHash, expiresIso, nowIso, id] = args;
            for (const row of rows.values()) {
              if (row.id === Number(id)) {
                row.status = 'pending';
                row.lang = String(lang);
                row.source = String(source);
                row.verification_code_hash = String(codeHash);
                row.verification_token_hash = String(tokenHash);
                row.verification_expires_at = String(expiresIso);
                row.verification_sent_at = String(nowIso);
                row.verification_fail_count = 0;
              }
            }
            return { success: true };
          }
          if (sql.includes("SET status = 'subscribed'")) {
            const id = Number(args[0]);
            for (const row of rows.values()) {
              if (row.id === id) {
                row.status = 'subscribed';
                row.unsubscribed_at = null;
                row.verification_code_hash = null;
                row.verification_token_hash = null;
                row.verification_expires_at = null;
                row.verification_fail_count = 0;
              }
            }
            return { success: true };
          }
          if (sql.includes('SET verification_fail_count = ?')) {
            const [fails, id] = args;
            for (const row of rows.values()) {
              if (row.id === Number(id)) {
                row.verification_fail_count = Number(fails);
                if (sql.includes('verification_code_hash = NULL')) {
                  row.verification_code_hash = null;
                  row.verification_token_hash = null;
                }
              }
            }
            return { success: true };
          }
          if (sql.includes("SET status = 'unsubscribed'")) {
            const email = String(args[0] || '');
            const row = rows.get(email);
            if (row) {
              row.status = 'unsubscribed';
              row.unsubscribed_at = new Date().toISOString();
              row.verification_code_hash = null;
              row.verification_token_hash = null;
            }
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

function extractCodeAndLinkFromResendBody(bodyJson: string): { code: string; token: string } {
  const parsed = JSON.parse(bodyJson) as { text?: string; html?: string; subject?: string };
  const codeMatch = String(parsed.subject || parsed.text || '').match(/\b(\d{6})\b/);
  const tokenMatch = String(parsed.text || parsed.html || '').match(/nl_verify=([^&\s"']+)/);
  assert.ok(codeMatch?.[1], `Could not find 6-digit code in Resend email: ${bodyJson}`);
  assert.ok(tokenMatch?.[1], `Could not find nl_verify token in Resend email: ${bodyJson}`);
  return {
    code: codeMatch[1],
    token: decodeURIComponent(tokenMatch[1]),
  };
}

describe('Cloudflare Worker Edge Newsletter Double Opt-In API (worker/index.js)', () => {
  beforeEach(() => {
    resetWorkerRateLimitsForTests();
  });

  it('enforces strict CORS preflight with null 204 body and reports accurate health readiness', async () => {
    const worker = createWorkerHandler(async () => makeJsonResponse({ ok: true }));

    const allowed = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'OPTIONS',
        headers: { Origin: 'https://ainvtry.com' },
      }),
      {}
    );
    assert.equal(allowed.status, 204);
    assert.equal(await allowed.text(), '');
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://ainvtry.com');

    const mockToken = ['stub', 'never', 'echoed'].join('-');
    const health = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/health'),
      {
        RESEND_API_KEY: mockToken,
        NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T1/B2/C3',
      }
    );
    const rawText = await health.text();
    assert.ok(!rawText.includes(mockToken));
    const json = JSON.parse(rawText) as Record<string, unknown>;
    assert.equal(json.ok, true);
    assert.equal(json.verificationRequired, true);
    assert.equal(json.storage, 'edge_hmac');
    assert.equal(json.emailConfigured, true);
    assert.equal(json.webhookConfigured, true);
  });

  it('validates inputs, rejects oversized payloads, drops honeypot bots, and enforces SSRF checks', async () => {
    assert.equal(resolveSafeHttpsUrl('http://hooks.slack.com/x'), null);
    assert.equal(resolveSafeHttpsUrl('https://127.0.0.1/hook'), null);
    assert.equal(resolveSafeHttpsUrl('https://169.254.169.254/latest/meta-data/'), null);
    assert.ok(resolveSafeHttpsUrl('https://hooks.slack.com/services/T/B/X'));

    const calls: RecordedFetch[] = [];
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ ok: true, status: 'pending_verification' }, 202);
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

    const oversized = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.11' },
        body: JSON.stringify({ email: 'a@b.com', consent: true, pad: 'x'.repeat(9000) }),
      }),
      {}
    );
    assert.equal(oversized.status, 413);

    const bot = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.12' },
        body: JSON.stringify({ email: 'bot@spam.test', consent: true, website: 'https://spam.test' }),
      }),
      {}
    );
    assert.equal(bot.status, 200);
    assert.equal(calls.length, 0);
  });

  it('completes zero-config Edge HMAC Double Opt-In via 6-digit OTP AND one-click magic link without D1/KV', async () => {
    const calls: RecordedFetch[] = [];
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ id: 'resend_ok' }, 200);
    });

    const env = {
      RESEND_API_KEY: ['stub', 'edge', 'resend'].join('-'),
      NEWSLETTER_NOTIFY_EMAIL: 'raymond@ainvtry.com',
      NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T1/B2/C3',
      NEWSLETTER_WEBHOOK_SECRET: ['stub', 'hook', '999'].join('-'),
    };

    const subRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({ email: 'MBO88@Naver.com', consent: true, lang: 'ko', source: 'site_about' }),
      }),
      env
    );
    assert.equal(subRes.status, 202);
    const subBody = (await subRes.json()) as {
      ok: boolean;
      status: string;
      storage: string;
      challengeToken: string;
    };
    assert.equal(subBody.ok, true);
    assert.equal(subBody.status, 'pending_verification');
    assert.equal(subBody.storage, 'edge_hmac');
    assert.ok(subBody.challengeToken.startsWith('nlc1.'));

    // Extract code & one-click token from the actual verification email sent to Resend
    assert.equal(calls.length, 1);
    const { code, token } = extractCodeAndLinkFromResendBody(calls[0]!.body);
    // Challenge token MUST NOT expose plaintext 6-digit code
    assert.ok(!subBody.challengeToken.includes(code));

    // Wrong code is rejected
    const badVerify = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({
          email: 'mbo88@naver.com',
          code: code === '000000' ? '111111' : '000000',
          challengeToken: subBody.challengeToken,
        }),
      }),
      env
    );
    assert.equal(badVerify.status, 400);

    // Tampered challenge token is rejected
    const tampered = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({
          email: 'mbo88@naver.com',
          code,
          challengeToken: `${subBody.challengeToken.slice(0, -4)}ffff`,
        }),
      }),
      env
    );
    assert.equal(tampered.status, 400);

    // Correct code succeeds & triggers Welcome + Founder Alert + Webhook
    const wait = createWaitUntilCollector();
    const okVerify = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({
          email: 'mbo88@naver.com',
          code,
          challengeToken: subBody.challengeToken,
        }),
      }),
      env,
      wait.ctx
    );
    await wait.flush();
    assert.equal(okVerify.status, 200);
    const okBody = (await okVerify.json()) as { ok: boolean; status: string; verified: boolean };
    assert.equal(okBody.ok, true);
    assert.equal(okBody.status, 'subscribed');
    assert.equal(okBody.verified, true);

    const resendCalls = calls.filter((c) => c.url === 'https://api.resend.com/emails');
    assert.equal(resendCalls.length, 3); // 1 verification + 1 welcome + 1 founder alert
    const webhookCalls = calls.filter((c) => c.url.includes('hooks.slack.com'));
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0]?.headers['x-ainvtry-webhook-secret'], 'stub-hook-999');

    // Replaying the same one-click link token returns idempotent already_subscribed without re-sending emails
    const replayRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({ email: 'mbo88@naver.com', token }),
      }),
      env
    );
    assert.equal(replayRes.status, 200);
    assert.equal(((await replayRes.json()) as { status: string }).status, 'already_subscribed');
    assert.equal(calls.filter((c) => c.url === 'https://api.resend.com/emails').length, 3);
  });

  it('completes D1 Double Opt-In lifecycle and blocks unverified setup when RESEND_API_KEY is missing', async () => {
    const d1 = createFakeD1();
    const calls: RecordedFetch[] = [];
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ id: 'ok' }, 200);
    });

    // Fail-closed 503 if D1 bound without RESEND_API_KEY
    const noKeyRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.31' },
        body: JSON.stringify({ email: 'd1user@ainvtry.com', consent: true }),
      }),
      { NEWSLETTER_DB: d1 }
    );
    assert.equal(noKeyRes.status, 503);
    assert.equal(((await noKeyRes.json()) as { code: string }).code, 'EMAIL_DELIVERY_NOT_CONFIGURED');

    const env = {
      NEWSLETTER_DB: d1,
      RESEND_API_KEY: ['stub', 'd1', 'mail'].join('-'),
    };
    const subRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.32' },
        body: JSON.stringify({ email: 'd1user@ainvtry.com', consent: true, lang: 'en', source: 'site_footer' }),
      }),
      env
    );
    assert.equal(subRes.status, 202);
    assert.equal(d1.rows.get('d1user@ainvtry.com')?.status, 'pending');

    const { code } = extractCodeAndLinkFromResendBody(calls[0]!.body);
    const wait = createWaitUntilCollector();
    const verRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.32' },
        body: JSON.stringify({ email: 'd1user@ainvtry.com', code }),
      }),
      env,
      wait.ctx
    );
    await wait.flush();
    assert.equal(verRes.status, 200);
    assert.equal(d1.rows.get('d1user@ainvtry.com')?.status, 'subscribed');
  });

  it('completes KV Double Opt-In via one-click verification link token', async () => {
    const kv = createFakeKv();
    const calls: RecordedFetch[] = [];
    const worker = createWorkerHandler(async (url, init) => {
      calls.push({
        url: String(url),
        method: String(init?.method || 'GET'),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body || ''),
      });
      return makeJsonResponse({ id: 'ok' }, 200);
    });

    const env = {
      NEWSLETTER_KV: kv,
      RESEND_API_KEY: ['stub', 'kv', 'mail'].join('-'),
    };
    const subRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.41' },
        body: JSON.stringify({ email: 'kvuser@ainvtry.com', consent: true, lang: 'ko', source: 'site_hero' }),
      }),
      env
    );
    assert.equal(subRes.status, 202);
    const { token } = extractCodeAndLinkFromResendBody(calls[0]!.body);

    const wait = createWaitUntilCollector();
    const verRes = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.41' },
        body: JSON.stringify({ email: 'kvuser@ainvtry.com', token }),
      }),
      env,
      wait.ctx
    );
    await wait.flush();
    assert.equal(verRes.status, 200);
    const stored = JSON.parse(kv.store.get('newsletter:sub:kvuser@ainvtry.com') || '{}') as {
      status?: string;
      verified_at?: string;
    };
    assert.equal(stored.status, 'subscribed');
    assert.ok(stored.verified_at);
  });

  it('proxies subscribe & verify transparently to Render upstream with cold-start retry when RESEND_API_KEY lives on Render', async () => {
    let subAttempts = 0;
    const worker = createWorkerHandler(async (url) => {
      if (String(url).includes('/api/newsletter/subscribe')) {
        subAttempts += 1;
        if (subAttempts === 1) return new Response('Waking Up', { status: 503 });
        return makeJsonResponse(
          { ok: true, status: 'pending_verification', email: 'mbo88@naver.com', expiresInSec: 600, cooldownSec: 60 },
          202
        );
      }
      if (String(url).includes('/api/newsletter/verify')) {
        return makeJsonResponse({ ok: true, status: 'subscribed', verified: true, email: 'mbo88@naver.com' }, 200);
      }
      return makeJsonResponse({ ok: true });
    });

    const sub = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.51' },
        body: JSON.stringify({ email: 'mbo88@naver.com', consent: true }),
      }),
      {}
    );
    assert.equal(subAttempts, 2);
    assert.equal(sub.status, 202);

    const ver = await worker.fetch(
      new Request('https://ainvtry.com/api/newsletter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.51' },
        body: JSON.stringify({ email: 'mbo88@naver.com', code: '123456' }),
      }),
      {}
    );
    assert.equal(ver.status, 200);
    assert.equal(((await ver.json()) as { status: string }).status, 'subscribed');
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
  });
});
