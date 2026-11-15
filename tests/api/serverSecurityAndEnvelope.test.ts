import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-api-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-ainventory.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
delete process.env.ALLOW_MOCK_APPLE_AUTH;
delete process.env.ALLOW_DEV_OTP_PREVIEW;
delete process.env.NODE_ENV;

const [
  { default: express },
  { createApiRouter },
  { createVtonRouter },
  dbMod,
  { analyzeShoppingCandidate },
] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/vtonRouter.js'),
  import('../../server/db.js'),
  import('../../server/engine.js'),
]);

describe('Server API Security, JSON Error Envelope & Persistence', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api/vton', createVtonRouter());
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
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

  it('uses isolated AINVENTORY_DB_PATH and exports closeAndFlushDatabase', () => {
    assert.equal(dbMod.DB_PATH, isolatedDbPath);
    assert.equal(typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase, 'function');
  });

  it('returns structured 400 JSON envelope on malformed JSON body instead of HTML', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"identifier": "broken-json',
    });
    assert.equal(res.status, 400);
    const contentType = res.headers.get('content-type') || '';
    assert.match(contentType, /application\/json/i);
    const body = (await res.json()) as { error?: string };
    assert.equal(typeof body.error, 'string');
    assert.ok((body.error?.length ?? 0) > 0);
  });

  it('fails closed on mock Apple sign-in unless ALLOW_MOCK_APPLE_AUTH=true outside production', async () => {
    delete process.env.ALLOW_MOCK_APPLE_AUTH;
    delete process.env.NODE_ENV;

    const deniedRes = await fetch(`${baseUrl}/api/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appleSub: 'apple.test.failclosed.001',
        email: 'failclosed@privaterelay.appleid.com',
        fullName: 'Fail Closed Tester',
      }),
    });
    assert.ok(
      deniedRes.status === 401 || deniedRes.status === 503,
      `Expected 401 or 503 when ALLOW_MOCK_APPLE_AUTH is unset, got ${deniedRes.status}`
    );

    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MOCK_APPLE_AUTH = 'true';
    const allowedRes = await fetch(`${baseUrl}/api/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appleSub: 'apple.test.sandbox.002',
        email: 'sandbox002@privaterelay.appleid.com',
        fullName: 'Sandbox Apple Tester',
      }),
    });
    assert.equal(allowedRes.status, 200);
    const allowedBody = (await allowedRes.json()) as { ok?: boolean; token?: string };
    assert.equal(allowedBody.ok, true);
    assert.equal(typeof allowedBody.token, 'string');
  });

  it('omits devPreviewCode unless ALLOW_DEV_OTP_PREVIEW=true outside production', async () => {
    delete process.env.ALLOW_DEV_OTP_PREVIEW;
    process.env.NODE_ENV = 'development';

    const hiddenRes = await fetch(`${baseUrl}/api/auth/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'otp-hidden@example.com' }),
    });
    assert.equal(hiddenRes.status, 200);
    const hiddenJson = (await hiddenRes.json()) as { devPreviewCode?: string };
    assert.equal(hiddenJson.devPreviewCode, undefined);

    process.env.ALLOW_DEV_OTP_PREVIEW = 'true';
    const previewRes = await fetch(`${baseUrl}/api/auth/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'otp-preview@example.com' }),
    });
    assert.equal(previewRes.status, 200);
    const previewJson = (await previewRes.json()) as { devPreviewCode?: string };
    assert.match(String(previewJson.devPreviewCode || ''), /^\d{6}$/);
  });

  it('requires confirmPermanentDelete=true on DELETE /api/auth/account before purging', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_MOCK_APPLE_AUTH = 'true';

    const loginRes = await fetch(`${baseUrl}/api/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appleSub: 'apple.delete.guard.003',
        email: 'deleteguard003@privaterelay.appleid.com',
        fullName: 'Delete Guard User',
      }),
    });
    assert.equal(loginRes.status, 200);
    const { token } = (await loginRes.json()) as { token: string };

    const missingConfirmRes = await fetch(`${baseUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(missingConfirmRes.status, 400);

    const confirmedRes = await fetch(`${baseUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmPermanentDelete: true }),
    });
    assert.equal(confirmedRes.status, 200);
    const purgeBody = (await confirmedRes.json()) as { ok?: boolean; purged?: boolean };
    assert.equal(purgeBody.ok, true);
    assert.equal(purgeBody.purged, true);

    const meAfterRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meAfterRes.status, 401);
  });

  it('evaluates shopping duplicate candidates deterministically', () => {
    const closet = [
      {
        id: 1,
        name: '블랙 캐시미어 크루넥 니트',
        category: 'top',
        subcategory: 'knit',
        color_name: '블랙',
        color_hex: '#1D1D1F',
        fabric: 'cashmere',
        formality: 'smart',
        seasons: ['가을', '겨울'],
        wear_count: 1,
        price: 180000,
        status: 'active',
      },
      {
        id: 2,
        name: '차콜 메리노 크루넥 니트',
        category: 'top',
        subcategory: 'knit',
        color_name: '차콜',
        color_hex: '#222225',
        fabric: 'wool',
        formality: 'smart',
        seasons: ['가을', '겨울'],
        wear_count: 0,
        price: 140000,
        status: 'active',
      },
    ];

    const analysis = analyzeShoppingCandidate(
      {
        name: '블랙 울 니트',
        category: 'top',
        subcategory: 'knit',
        color_hex: '#1E1E20',
        color_name: '블랙',
        fabric: 'wool',
        formality: 'smart',
        price: 159000,
      },
      closet
    );
    assert.ok(analysis.maxSimilarity >= 75);
    assert.ok(analysis.similarCount >= 1);
    assert.ok(['skip', 'consider'].includes(analysis.verdict));
  });

  it('rejects unauthenticated /api/vton/synthesize requests with 401 before parsing JSON body', async () => {
    const unauthMalformedRes = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"unterminated_unauth_payload":',
    });
    assert.equal(unauthMalformedRes.status, 401);
  });
});
