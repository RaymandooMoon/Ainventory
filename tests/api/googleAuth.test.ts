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
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.OAUTH_STATE_SECRET;

const [{ default: express }, { createApiRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/db.js'),
]);

function extractCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function getCookiePair(cookies: string[], name: string): string {
  const found = cookies.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0] : '';
}

describe('Google OAuth 2.0 / OIDC (PKCE + ID Token + Account Linking) API Integration Tests', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  const mockClientId = 'test-mock-client-id.apps.googleusercontent.com';
  const mockClientSecret = 'test-mock-google-client-secret-value';

  // Configurable mock verifier & code exchanger
  let mockVerifierOutcome: 'success' | 'aud_mismatch' | 'invalid_token' = 'success';
  let mockSub = 'google_sub_test_001';
  let mockEmail = 'atelier_tester@gmail.com';
  let mockName = '아틀리에 테스트 회원';
  let lastExpectedNonce: string | undefined;
  let lastExchangedVerifier: string | undefined;

  const fakeGoogleVerifier = async (
    _credential: string,
    expectedClientId: string,
    opts?: { expectedNonce?: string }
  ) => {
    lastExpectedNonce = opts?.expectedNonce;
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
      name: mockName,
      aud: expectedClientId,
      iss: 'https://accounts.google.com',
      nonce: opts?.expectedNonce,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  };

  const fakeGoogleCodeExchanger = async ({
    code,
    codeVerifier,
  }: {
    code: string;
    codeVerifier: string;
  }) => {
    lastExchangedVerifier = codeVerifier;
    if (code === 'bad_code') {
      throw new Error('Google token exchange failed (400)');
    }
    return { idToken: 'mock_header.mock_payload.mock_sig' };
  };

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(
      '/api',
      createApiRouter({
        verifyGoogleIdToken: fakeGoogleVerifier,
        exchangeGoogleAuthCode: fakeGoogleCodeExchanger,
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
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.OAUTH_STATE_SECRET;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof dbMod.closeAndFlushDatabase === 'function') {
      await Promise.resolve(dbMod.closeAndFlushDatabase());
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

    const cfgRes = await fetch(`${baseUrl}/api/auth/config`);
    assert.equal(cfgRes.status, 200);
    const cfg = await cfgRes.json();
    assert.equal(cfg.googleEnabled, false);
    assert.equal(cfg.googleOAuthCodeFlowEnabled, false);

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

    const startRes = await fetch(`${baseUrl}/api/auth/google/start`, { redirect: 'manual' });
    assert.equal(startRes.status, 503);
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

  it('successfully creates new user (with profileCompleted=false) and issues session on valid Google ID token', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;
    mockVerifierOutcome = 'success';
    mockSub = 'google_unique_sub_12345';
    mockEmail = 'atelier_user12345@gmail.com';
    mockName = '아틀리에 테스트 회원';

    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'header.payload.signature' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.isNewUser, true);
    assert.ok(body.token);
    assert.ok(body.user);
    assert.equal(body.user.email, mockEmail);
    assert.equal(body.user.displayName, '아틀리에 테스트 회원');
    assert.equal(body.user.profileCompleted, false);
    assert.ok(Array.isArray(body.user.linkedProviders));
    assert.ok(
      body.user.linkedProviders.some((p: { provider: string }) => p.provider === 'google')
    );

    // Google-only account cannot unlink its last auth method
    const unlinkRes = await fetch(`${baseUrl}/api/auth/providers/google`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${body.token}` },
    });
    assert.equal(unlinkRes.status, 400);
    const unlinkBody = await unlinkRes.json();
    assert.equal(unlinkBody.code, 'LAST_AUTH_METHOD');

    // Subsequent login returns existing user with same sub
    const res2 = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'header.payload.signature' }),
    });

    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.ok, true);
    assert.equal(body2.isNewUser, false);
    assert.equal(body2.user.username, body.user.username);
  });

  it('completes OAuth 2.0 PKCE start -> callback flow with HttpOnly session cookie, state CSRF check, and Open Redirect protection', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;
    process.env.GOOGLE_CLIENT_SECRET = mockClientSecret;
    mockVerifierOutcome = 'success';
    mockSub = 'google_pkce_sub_999';
    mockEmail = 'pkce_member@gmail.com';
    mockName = 'PKCE Member';

    // 1. Discovery reports PKCE flow enabled
    const cfgRes = await fetch(`${baseUrl}/api/auth/config`);
    const cfg = await cfgRes.json();
    assert.equal(cfg.googleEnabled, true);
    assert.equal(cfg.googleOAuthCodeFlowEnabled, true);

    // 2. Start with malicious returnTo -> sanitized back to /app
    const startRes = await fetch(
      `${baseUrl}/api/auth/google/start?returnTo=${encodeURIComponent('https://evil.com/phish')}`,
      { redirect: 'manual' }
    );
    assert.equal(startRes.status, 302);
    const authLocation = new URL(startRes.headers.get('location') || '');
    assert.equal(authLocation.origin, 'https://accounts.google.com');
    assert.equal(authLocation.searchParams.get('code_challenge_method'), 'S256');
    const state = authLocation.searchParams.get('state') || '';
    const nonce = authLocation.searchParams.get('nonce') || '';
    assert.ok(state.length >= 16);
    assert.ok(nonce.length >= 16);

    const startCookies = extractCookies(startRes);
    const oauthCookiePair = getCookiePair(startCookies, 'ainv_google_oauth');
    assert.ok(oauthCookiePair.startsWith('ainv_google_oauth='));
    assert.match(startCookies.join('\n'), /HttpOnly/i);
    assert.match(startCookies.join('\n'), /SameSite=Lax/i);

    // 3. State mismatch is rejected cleanly without setting session cookie
    const badStateRes = await fetch(
      `${baseUrl}/api/auth/google/callback?code=ok_code&state=wrong_state`,
      {
        redirect: 'manual',
        headers: { Cookie: oauthCookiePair },
      }
    );
    assert.equal(badStateRes.status, 302);
    assert.equal(
      badStateRes.headers.get('location'),
      '/app/login?auth_error=oauth_state_mismatch'
    );
    assert.equal(getCookiePair(extractCookies(badStateRes), 'ainventory_token'), '');

    // 4. Valid callback creates user with profileCompleted=false, issues HttpOnly session cookie, clears state cookie
    const cbRes = await fetch(
      `${baseUrl}/api/auth/google/callback?code=valid_code_123&state=${encodeURIComponent(state)}`,
      {
        redirect: 'manual',
        headers: { Cookie: oauthCookiePair },
      }
    );
    assert.equal(cbRes.status, 302);
    assert.equal(cbRes.headers.get('location'), '/app?auth_result=google_new');
    assert.equal(lastExpectedNonce, nonce);
    assert.ok(lastExchangedVerifier && lastExchangedVerifier.length >= 32);

    const cbCookies = extractCookies(cbRes);
    const sessionCookiePair = getCookiePair(cbCookies, 'ainventory_token');
    assert.ok(sessionCookiePair.startsWith('ainventory_token='));
    assert.ok(
      cbCookies.some((c) => c.startsWith('ainv_google_oauth=') && c.includes('Max-Age=0')),
      'must immediately expire one-time OAuth state cookie'
    );

    // 5. Session cookie authenticates GET /api/auth/me seamlessly
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookiePair },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.email, 'pkce_member@gmail.com');
    assert.equal(meBody.user.profileCompleted, false);
  });

  it('blocks email-collision ATO on Google login and allows explicit authenticated account linking & unlinking', async () => {
    process.env.GOOGLE_CLIENT_ID = mockClientId;
    process.env.GOOGLE_CLIENT_SECRET = mockClientSecret;
    process.env.ALLOW_DEV_OTP_PREVIEW = 'true';

    const conflictEmail = 'existing_email_owner@example.com';

    // 1. Register verified email/password account first
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'emailowner',
        email: conflictEmail,
        password: 'StrongPassword123!',
        displayName: 'Email Owner',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: regBody.verificationToken,
        issueSession: true,
      }),
    });
    assert.equal(verifyRes.status, 200);
    const emailSessionCookie = getCookiePair(extractCookies(verifyRes), 'ainventory_token');
    assert.ok(emailSessionCookie);

    // 2. Unauthenticated Google login with colliding email -> 409 ACCOUNT_EMAIL_CONFLICT (ATO prevented)
    mockVerifierOutcome = 'success';
    mockSub = 'google_sub_for_existing_email';
    mockEmail = conflictEmail;
    const directRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'h.p.s' }),
    });
    assert.equal(directRes.status, 409);
    const directBody = await directRes.json();
    assert.equal(directBody.code, 'ACCOUNT_EMAIL_CONFLICT');

    // 3. Explicit authenticated link flow (mode=link) succeeds
    const linkStartRes = await fetch(
      `${baseUrl}/api/auth/google/start?mode=link&returnTo=${encodeURIComponent('/app/closet')}`,
      {
        redirect: 'manual',
        headers: { Cookie: emailSessionCookie },
      }
    );
    assert.equal(linkStartRes.status, 302);
    const linkUrl = new URL(linkStartRes.headers.get('location') || '');
    const linkState = linkUrl.searchParams.get('state') || '';
    const linkOAuthCookie = getCookiePair(extractCookies(linkStartRes), 'ainv_google_oauth');

    const linkCbRes = await fetch(
      `${baseUrl}/api/auth/google/callback?code=link_code&state=${encodeURIComponent(linkState)}`,
      {
        redirect: 'manual',
        headers: { Cookie: linkOAuthCookie },
      }
    );
    assert.equal(linkCbRes.status, 302);
    assert.equal(linkCbRes.headers.get('location'), '/app/closet?auth_result=google_linked');

    // 4. GET /api/auth/providers lists google with canUnlinkGoogle=true
    const providersRes = await fetch(`${baseUrl}/api/auth/providers`, {
      headers: { Cookie: emailSessionCookie },
    });
    assert.equal(providersRes.status, 200);
    const providersBody = await providersRes.json();
    assert.equal(providersBody.hasPassword, true);
    assert.equal(providersBody.canUnlinkGoogle, true);
    assert.equal(providersBody.providers.length, 1);
    assert.equal(providersBody.providers[0].provider, 'google');

    // 5. Subsequent Google login now signs into the linked email account cleanly
    const postLinkLogin = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'h.p.s' }),
    });
    assert.equal(postLinkLogin.status, 200);
    const postLinkBody = await postLinkLogin.json();
    assert.equal(postLinkBody.user.username, 'emailowner');

    // 6. Unlinking Google succeeds since account still has email/password login
    const unlinkRes = await fetch(`${baseUrl}/api/auth/providers/google`, {
      method: 'DELETE',
      headers: { Cookie: emailSessionCookie },
    });
    assert.equal(unlinkRes.status, 200);
    const afterUnlink = await (
      await fetch(`${baseUrl}/api/auth/providers`, { headers: { Cookie: emailSessionCookie } })
    ).json();
    assert.equal(afterUnlink.providers.length, 0);

    // 7. Signed upload URL endpoint blocks invalid names and unowned files
    const badFileRes = await fetch(`${baseUrl}/api/uploads/signed-url/..%2Fsecret.txt`, {
      headers: { Cookie: emailSessionCookie },
    });
    assert.equal(badFileRes.status, 400);
    const missingFileRes = await fetch(`${baseUrl}/api/uploads/signed-url/not_owned_1234.webp`, {
      headers: { Cookie: emailSessionCookie },
    });
    assert.equal(missingFileRes.status, 404);
  });
});
