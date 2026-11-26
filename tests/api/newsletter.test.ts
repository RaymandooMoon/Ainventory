import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-newsletter-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-newsletter.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
process.env.ALLOW_DEV_OTP_PREVIEW = 'true';

const [{ default: express }, { createApiRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/db.js'),
]);

describe('Official Site Newsletter API Double Opt-In & Security Lifecycle', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  let adminToken = '';

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminBody = (await adminLoginRes.json()) as { token?: string };
    adminToken = String(adminBody.token || '');
    assert.ok(adminToken.length > 10);
  });

  after(async () => {
    delete process.env.ALLOW_DEV_OTP_PREVIEW;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires 6-digit OTP or magic-link verification before activating subscription, enforces cooldown, and supports unsubscribe + verified resubscribe', async () => {
    // Step 1: Subscribe issues 202 pending_verification
    const subRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  Reader@Ainvtry.com ',
        consent: true,
        lang: 'ko',
        source: 'site_modal',
      }),
    });
    assert.equal(subRes.status, 202);
    const subBody = (await subRes.json()) as {
      ok: boolean;
      status: string;
      email: string;
      expiresInSec: number;
      cooldownSec: number;
      devPreviewCode?: string;
      devVerifyToken?: string;
    };
    assert.equal(subBody.ok, true);
    assert.equal(subBody.status, 'pending_verification');
    assert.equal(subBody.email, 'reader@ainvtry.com');
    assert.equal(subBody.expiresInSec, 600);
    assert.equal(subBody.cooldownSec, 60);
    assert.match(String(subBody.devPreviewCode || ''), /^\d{6}$/);
    assert.ok((subBody.devVerifyToken || '').length >= 32);

    // Immediate resend hits 60s cooldown
    const cooldownRes = await fetch(`${baseUrl}/api/newsletter/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@ainvtry.com' }),
    });
    assert.equal(cooldownRes.status, 429);
    const cooldownBody = (await cooldownRes.json()) as { code: string; retryAfterSec: number };
    assert.equal(cooldownBody.code, 'RESEND_COOLDOWN');
    assert.ok(cooldownBody.retryAfterSec >= 1);

    // Wrong 6-digit code is rejected with remainingAttempts
    const wrongCode = subBody.devPreviewCode === '000000' ? '111111' : '000000';
    const wrongRes = await fetch(`${baseUrl}/api/newsletter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@ainvtry.com', code: wrongCode }),
    });
    assert.equal(wrongRes.status, 400);
    const wrongBody = (await wrongRes.json()) as { code: string; remainingAttempts: number };
    assert.equal(wrongBody.code, 'INVALID_CODE');
    assert.equal(wrongBody.remainingAttempts, 4);

    // Admin list shows pendingCount = 1, activeCount = 0 before verification
    const pendingListRes = await fetch(`${baseUrl}/api/admin/newsletter/subscribers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(pendingListRes.status, 200);
    const pendingList = (await pendingListRes.json()) as {
      total: number;
      activeCount: number;
      pendingCount: number;
    };
    assert.equal(pendingList.total, 1);
    assert.equal(pendingList.activeCount, 0);
    assert.equal(pendingList.pendingCount, 1);

    // Step 2: Correct 6-digit code activates subscription
    const verifyRes = await fetch(`${baseUrl}/api/newsletter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@ainvtry.com', code: subBody.devPreviewCode }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as {
      ok: boolean;
      status: string;
      verified: boolean;
      email: string;
    };
    assert.equal(verifyBody.ok, true);
    assert.equal(verifyBody.status, 'subscribed');
    assert.equal(verifyBody.verified, true);
    assert.equal(verifyBody.email, 'reader@ainvtry.com');

    // Duplicate subscribe after verification returns idempotent 200 already_subscribed
    const dupRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reader@ainvtry.com',
        consent: true,
        lang: 'en',
        source: 'site_about',
      }),
    });
    assert.equal(dupRes.status, 200);
    const dupBody = (await dupRes.json()) as { ok: boolean; status: string };
    assert.equal(dupBody.ok, true);
    assert.equal(dupBody.status, 'already_subscribed');

    // Unsubscribe cleanly
    const unsubRes = await fetch(`${baseUrl}/api/newsletter/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@ainvtry.com' }),
    });
    assert.equal(unsubRes.status, 200);

    // Clear verification_sent_at in DB to test immediate resubscribe via one-click link token
    dbMod.default
      .prepare('UPDATE newsletter_subscribers SET verification_sent_at = NULL WHERE email = ?')
      .run('reader@ainvtry.com');

    const resubReq = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reader@ainvtry.com',
        consent: true,
        lang: 'ko',
        source: 'site_footer',
      }),
    });
    assert.equal(resubReq.status, 202);
    const resubChallenge = (await resubReq.json()) as { devVerifyToken?: string };
    assert.ok(resubChallenge.devVerifyToken);

    const tokenVerifyRes = await fetch(`${baseUrl}/api/newsletter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reader@ainvtry.com',
        token: resubChallenge.devVerifyToken,
      }),
    });
    assert.equal(tokenVerifyRes.status, 200);
    const tokenVerifyBody = (await tokenVerifyRes.json()) as {
      ok: boolean;
      status: string;
      verified: boolean;
      resubscribed?: boolean;
    };
    assert.equal(tokenVerifyBody.ok, true);
    assert.equal(tokenVerifyBody.status, 'subscribed');
    assert.equal(tokenVerifyBody.verified, true);
    assert.equal(tokenVerifyBody.resubscribed, true);
  });

  it('rejects invalid inputs, enforces fail-closed 503 when email delivery is unconfigured in production, and supports admin PATCH/DELETE', async () => {
    const invalidEmails = [
      '',
      'not-an-email',
      'bad@domain',
      'injected@example.com\r\nBcc:victim@example.com',
      "admin' OR '1'='1@example.com",
      `${'a'.repeat(250)}@example.com`,
    ];

    for (const badEmail of invalidEmails) {
      const res = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: badEmail, consent: true }),
      });
      assert.equal(res.status, 400, `Expected 400 for invalid email: ${badEmail}`);
    }

    const noConsentRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noconsent@example.com', consent: false }),
    });
    assert.equal(noConsentRes.status, 400);

    // Honeypot filled -> silently acknowledged, NOT stored in DB
    const botRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bot@spam.example',
        consent: true,
        website: 'https://spam.example',
      }),
    });
    assert.equal(botRes.status, 200);

    // Fail-closed check: without ALLOW_DEV_OTP_PREVIEW and without RESEND_API_KEY -> 503
    const prevDevPreview = process.env.ALLOW_DEV_OTP_PREVIEW;
    delete process.env.ALLOW_DEV_OTP_PREVIEW;
    try {
      const failClosedRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'strictprod@ainvtry.com', consent: true }),
      });
      assert.equal(failClosedRes.status, 503);
      const failClosedBody = (await failClosedRes.json()) as { code: string };
      assert.equal(failClosedBody.code, 'EMAIL_DELIVERY_NOT_CONFIGURED');
    } finally {
      process.env.ALLOW_DEV_OTP_PREVIEW = prevDevPreview;
    }

    // Admin list verifies unauthenticated callers blocked & strictprod/bot were never saved
    const unauthList = await fetch(`${baseUrl}/api/admin/newsletter/subscribers`);
    assert.equal(unauthList.status, 401);

    const adminList = await fetch(`${baseUrl}/api/admin/newsletter/subscribers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminList.status, 200);
    const listBody = (await adminList.json()) as {
      total: number;
      activeCount: number;
      pendingCount: number;
      unsubscribedCount: number;
      subscribers: Array<{ id: number; email: string; status: string; verified_at: string | null }>;
    };
    assert.equal(listBody.total, 1);
    assert.equal(listBody.activeCount, 1);
    assert.equal(listBody.pendingCount, 0);
    assert.equal(listBody.unsubscribedCount, 0);
    assert.equal(listBody.subscribers[0]?.email, 'reader@ainvtry.com');
    assert.ok(listBody.subscribers[0]?.verified_at);

    // Health endpoint reports verificationRequired: true
    const healthRes = await fetch(`${baseUrl}/api/newsletter/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as {
      ok: boolean;
      storage: string;
      verificationRequired: boolean;
    };
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.storage, 'sqlite');
    assert.equal(healthBody.verificationRequired, true);

    // Admin PATCH & DELETE lifecycle
    const subId = listBody.subscribers[0]?.id;
    assert.ok(Number.isInteger(subId) && subId > 0);

    const patchUnsub = await fetch(`${baseUrl}/api/admin/newsletter/subscribers/${subId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'unsubscribed' }),
    });
    assert.equal(patchUnsub.status, 200);

    const delRes = await fetch(`${baseUrl}/api/admin/newsletter/subscribers/${subId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRes.status, 200);
    const delAgain = await fetch(`${baseUrl}/api/admin/newsletter/subscribers/${subId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delAgain.status, 404);
  });

  it('builds localized verification emails and dispatches Resend welcome/founder + SSRF-safe webhook notifications', async () => {
    const {
      buildVerificationEmailPayload,
      dispatchNewsletterNotifications,
      escapeHtml,
      resolveSafeWebhookUrl,
      sendNewsletterVerificationEmail,
    } = await import('../../server/newsletterNotifications.js');

    assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
    assert.equal(resolveSafeWebhookUrl('http://hooks.slack.com/x'), null);
    assert.equal(resolveSafeWebhookUrl('https://169.254.169.254/latest'), null);

    const verifyPayload = buildVerificationEmailPayload({
      email: 'mbo88@naver.com',
      lang: 'ko',
      code: '482910',
      verifyUrl: 'https://ainvtry.com/?nl_verify=abc123&email=mbo88%40naver.com',
      fromEmail: undefined,
      replyToEmail: undefined,
    });
    assert.ok(verifyPayload.subject.includes('482910'));
    assert.ok(verifyPayload.html.includes('482 910'));
    assert.ok(verifyPayload.html.includes('nl_verify=abc123'));

    const sentRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      sentRequests.push({
        url: String(input),
        body: String(init?.body || ''),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify({ id: 'mock_1' }), { status: 200 });
    };

    const verifyMail = await sendNewsletterVerificationEmail(
      {
        email: 'mbo88@naver.com',
        lang: 'ko',
        code: '482910',
        verifyUrl: 'https://ainvtry.com/?nl_verify=abc123&email=mbo88%40naver.com',
      },
      { RESEND_API_KEY: ['stub', 'mail', 'token'].join('-') },
      fakeFetch
    );
    assert.equal(verifyMail.sent, true);

    const summary = await dispatchNewsletterNotifications(
      {
        type: 'subscribed',
        email: 'mbo88@naver.com',
        lang: 'ko',
        source: 'site_about',
        resubscribed: false,
        storage: 'sqlite',
      },
      {
        RESEND_API_KEY: ['stub', 'mail', 'token'].join('-'),
        NEWSLETTER_NOTIFY_EMAIL: 'raymond@ainvtry.com',
        NEWSLETTER_WEBHOOK_URL: 'https://hooks.slack.com/services/T1/B2/C3',
        NEWSLETTER_WEBHOOK_SECRET: ['stub', 'hook', 'sig'].join('-'),
      },
      fakeFetch
    );

    assert.equal(summary.welcomeSent, true);
    assert.equal(summary.founderAlertSent, true);
    assert.equal(summary.webhookSent, true);
    assert.equal(
      sentRequests.find((r) => r.url.includes('hooks.slack.com'))?.headers['x-ainvtry-webhook-secret'],
      'stub-hook-sig'
    );
  });
});
