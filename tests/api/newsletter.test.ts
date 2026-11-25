import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-newsletter-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-newsletter.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;

const [{ default: express }, { createApiRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/db.js'),
]);

describe('Official Site Newsletter API Security & Lifecycle', () => {
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
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('subscribes a valid email, handles duplicate idempotently, and supports unsubscribe + resubscribe', async () => {
    const firstRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  Reader@Ainvtry.com ',
        consent: true,
        lang: 'ko',
        source: 'site_modal',
      }),
    });
    assert.equal(firstRes.status, 201);
    const firstBody = (await firstRes.json()) as { ok: boolean; status: string; email: string };
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.status, 'subscribed');
    assert.equal(firstBody.email, 'reader@ainvtry.com');

    // Duplicate signup returns idempotent 200 already_subscribed
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
    const unsubBody = (await unsubRes.json()) as { ok: boolean; status: string };
    assert.equal(unsubBody.ok, true);
    assert.equal(unsubBody.status, 'unsubscribed');

    // Re-subscribe reactivates the record cleanly
    const resubRes = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reader@ainvtry.com',
        consent: true,
        lang: 'ko',
        source: 'site_footer',
      }),
    });
    assert.equal(resubRes.status, 200);
    const resubBody = (await resubRes.json()) as {
      ok: boolean;
      status: string;
      resubscribed?: boolean;
    };
    assert.equal(resubBody.ok, true);
    assert.equal(resubBody.status, 'subscribed');
    assert.equal(resubBody.resubscribed, true);
  });

  it('rejects invalid emails, header-injection payloads, missing consent, and ignores honeypot bots', async () => {
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

    // Admin list verifies bot was never saved and blocks unauthenticated callers
    const unauthList = await fetch(`${baseUrl}/api/admin/newsletter/subscribers`);
    assert.equal(unauthList.status, 401);

    const adminList = await fetch(`${baseUrl}/api/admin/newsletter/subscribers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminList.status, 200);
    const listBody = (await adminList.json()) as {
      total: number;
      activeCount: number;
      subscribers: Array<{ email: string; status: string }>;
    };
    assert.equal(listBody.total, 1);
    assert.equal(listBody.activeCount, 1);
    assert.equal(listBody.subscribers[0]?.email, 'reader@ainvtry.com');
  });
});
