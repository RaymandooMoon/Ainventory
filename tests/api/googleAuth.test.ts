import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-google-auth-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-ainventory-google.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.VITE_GOOGLE_CLIENT_ID;

const [{ default: express }, { createApiRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/db.js'),
]);

describe('POST /api/auth/google - API Integration Tests', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  const mockClientId = 'test-mock-client-id.apps.googleusercontent.com';

  // Configurable mock verifier
  let mockVerifierOutcome: 'success' | 'aud_mismatch' | 'invalid_token' = 'success';
  let mockSub = 'google_sub_test_001';
  let mockEmail = 'atelier_tester@gmail.com';

  const fakeGoogleVerifier = async (credential: string, expectedClientId: string) => {
    if (mockVerifierOutcome === 'invalid_token') {
      throw new Error('Invalid token');
    }
    if (mockVerifierOutcome === 'aud_mismatch') {
      throw new Error('Google token audience mismatch');
    }
    return {
      sub: mockSub,
      email: mockEmail,
      email_verified: true,
      name: '아틀리에 테스트 회원',
      aud: expectedClientId,
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  };

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(
      '/api',
      createApiRouter({
        verifyGoogleIdToken: fakeGoogleVerifier,
      })
    );
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 400 MALFORMED_CREDENTIAL on empty or invalid credential format', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;

    const res1 = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: '' }),
    });
    assert.equal(res1.status, 400);
    const body1 = await res1.json();
    assert.equal(body1.success, false);

    const res2 = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'not-a-valid-jwt' }),
    });
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.equal(body2.success, false);
    assert.equal(body2.code, 'MALFORMED_CREDENTIAL');
  });

  it('returns 503 google_sign_in_not_configured when GOOGLE_CLIENT_ID is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;

    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'part1.part2.part3' }),
    });

    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'google_sign_in_not_configured');
    assert.equal(body.code, 'GOOGLE_AUTH_NOT_CONFIGURED');
  });

  it('returns 401 on verifier failure (e.g. audience mismatch or invalid signature)', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;
    mockVerifierOutcome = 'aud_mismatch';

    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'part1.part2.part3' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'INVALID_GOOGLE_TOKEN');
  });

  it('successfully creates new user and issues session on valid Google ID token', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;
    mockVerifierOutcome = 'success';
    mockSub = 'google_unique_sub_12345';
    mockEmail = 'atelier_user12345@gmail.com';

    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'header.payload.signature' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.token);
    assert.ok(body.user);
    assert.equal(body.user.email, mockEmail);
    assert.equal(body.user.displayName, '아틀리에 테스트 회원');

    // Subsequent login returns existing user with same sub
    const res2 = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'header.payload.signature' }),
    });

    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.ok, true);
    assert.equal(body2.user.username, body.user.username);
  });
});
