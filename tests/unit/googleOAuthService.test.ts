import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  buildGoogleAuthorizationUrl,
  createPkceChallenge,
  resetGoogleJwksCacheForTests,
  sanitizeAppReturnTo,
  signOAuthStateCookie,
  verifyGoogleIdTokenJwks,
  verifyOAuthStateCookie,
} from '../../server/googleOAuthService.js';

function createRsaKeyPairWithJwk(kid: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return {
    privateKey,
    jwk: {
      ...jwk,
      kid,
      alg: 'RS256',
      use: 'sig',
    },
  };
}

function signTestJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject
): string {
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKey);
  return `${signingInput}.${sig.toString('base64url')}`;
}

describe('server/googleOAuthService — PKCE, State Cookie, ReturnTo Sanitizer & Local RS256 JWKS', () => {
  const CLIENT_ID = 'ainvtry-test-client.apps.googleusercontent.com';

  it('generates RFC 7636 PKCE S256 verifier and matching SHA-256 challenge', () => {
    const pkce = createPkceChallenge();
    assert.equal(pkce.method, 'S256');
    assert.ok(pkce.codeVerifier.length >= 43);
    const expected = crypto.createHash('sha256').update(pkce.codeVerifier).digest('base64url');
    assert.equal(pkce.codeChallenge, expected);
  });

  it('strictly sanitizes post-OAuth returnTo paths to prevent Open Redirect', () => {
    assert.equal(sanitizeAppReturnTo('/app'), '/app');
    assert.equal(sanitizeAppReturnTo('/app/closet'), '/app/closet');
    assert.equal(sanitizeAppReturnTo('/app/item/42'), '/app/item/42');
    assert.equal(sanitizeAppReturnTo('https://evil.example/app'), '/app');
    assert.equal(sanitizeAppReturnTo('//evil.example/app'), '/app');
    assert.equal(sanitizeAppReturnTo('/app-evil'), '/app');
    assert.equal(sanitizeAppReturnTo('/app@evil.com'), '/app');
    assert.equal(sanitizeAppReturnTo('/app\r\nSet-Cookie: x=1'), '/app');
    assert.equal(sanitizeAppReturnTo('/ir'), '/app');
  });

  it('signs and verifies HMAC state cookies while rejecting tampering and expiry', () => {
    const secret = 'test-oauth-state-signing-secret-32chars';
    const cookieVal = signOAuthStateCookie(
      { state: 'st_1', nonce: 'nc_1', codeVerifier: 'ver_1', returnTo: '/app/closet' },
      secret
    );
    assert.ok(cookieVal.startsWith('goa1.'));
    const parsed = verifyOAuthStateCookie(cookieVal, secret);
    assert.equal(parsed?.state, 'st_1');
    assert.equal(parsed?.returnTo, '/app/closet');

    // Tampered signature
    const tampered = `${cookieVal.slice(0, -1)}${cookieVal.endsWith('0') ? '1' : '0'}`;
    assert.equal(verifyOAuthStateCookie(tampered, secret), null);

    // Wrong secret
    assert.equal(verifyOAuthStateCookie(cookieVal, 'wrong-secret-0000000000000000'), null);

    // Expired payload
    const expiredCookie = signOAuthStateCookie(
      { state: 'st_exp', exp: Date.now() - 1000 },
      secret
    );
    assert.equal(verifyOAuthStateCookie(expiredCookie, secret), null);
  });

  it('builds Google OAuth authorization URL with PKCE S256 and openid email profile scope', () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://ainvtry.com/api/auth/google/callback',
        state: 'state_abc',
        nonce: 'nonce_xyz',
        codeChallenge: 'challenge_123',
      })
    );
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge_123');
    assert.equal(url.searchParams.get('state'), 'state_abc');
    assert.equal(url.searchParams.get('nonce'), 'nonce_xyz');
  });

  it('cryptographically verifies RS256 Google ID tokens via JWKS cache and refreshes on key rotation', async () => {
    resetGoogleJwksCacheForTests();
    const key1 = createRsaKeyPairWithJwk('google-kid-1');
    const key2 = createRsaKeyPairWithJwk('google-kid-2');

    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount += 1;
      const keys = fetchCount === 1 ? [key1.jwk] : [key1.jwk, key2.jwk];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'cache-control': 'public, max-age=3600' }),
        json: async () => ({ keys }),
      };
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const token1 = signTestJwt(
      { alg: 'RS256', kid: 'google-kid-1', typ: 'JWT' },
      {
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        azp: CLIENT_ID,
        sub: 'sub_jwks_001',
        email: 'jwks@example.com',
        email_verified: true,
        name: 'JWKS User',
        nonce: 'nonce_match_1',
        exp: nowSec + 3600,
        iat: nowSec,
      },
      key1.privateKey
    );

    const verified1 = await verifyGoogleIdTokenJwks(token1, CLIENT_ID, {
      expectedNonce: 'nonce_match_1',
      fetchImpl: mockFetch,
    });
    assert.equal(verified1.sub, 'sub_jwks_001');
    assert.equal(fetchCount, 1);

    // Second call with same kid uses cached JWKS without extra fetch
    await verifyGoogleIdTokenJwks(token1, CLIENT_ID, {
      expectedNonce: 'nonce_match_1',
      fetchImpl: mockFetch,
    });
    assert.equal(fetchCount, 1);

    // Key rotation: unknown kid triggers one refresh and succeeds
    const token2 = signTestJwt(
      { alg: 'RS256', kid: 'google-kid-2', typ: 'JWT' },
      {
        iss: 'accounts.google.com',
        aud: CLIENT_ID,
        sub: 'sub_jwks_002',
        email: 'rotated@example.com',
        email_verified: true,
        exp: nowSec + 3600,
      },
      key2.privateKey
    );
    const verified2 = await verifyGoogleIdTokenJwks(token2, CLIENT_ID, {
      fetchImpl: mockFetch,
    });
    assert.equal(verified2.sub, 'sub_jwks_002');
    assert.equal(fetchCount, 2);
  });

  it('rejects tampered signatures, wrong aud/iss/nonce, expired tokens, unverified emails, and alg downgrade', async () => {
    const key1 = createRsaKeyPairWithJwk('kid-strict');
    const nowSec = Math.floor(Date.now() / 1000);
    const baseClaims = {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      sub: 'sub_strict',
      email: 'strict@example.com',
      email_verified: true,
      nonce: 'expected_nonce',
      exp: nowSec + 3600,
    };

    const opts = { jwksKeysOverride: [key1.jwk], expectedNonce: 'expected_nonce' };

    // Valid baseline
    const valid = signTestJwt({ alg: 'RS256', kid: 'kid-strict' }, baseClaims, key1.privateKey);
    const ok = await verifyGoogleIdTokenJwks(valid, CLIENT_ID, opts);
    assert.equal(ok.sub, 'sub_strict');

    // Tampered payload
    const [h, , s] = valid.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...baseClaims, email: 'admin@ainvtry.com' }),
      'utf8'
    ).toString('base64url');
    await assert.rejects(
      () => verifyGoogleIdTokenJwks(`${h}.${forgedPayload}.${s}`, CLIENT_ID, opts),
      /signature/i
    );

    // Algorithm downgrade (HS256)
    const hsToken = signTestJwt({ alg: 'HS256', kid: 'kid-strict' }, baseClaims, key1.privateKey);
    await assert.rejects(() => verifyGoogleIdTokenJwks(hsToken, CLIENT_ID, opts), /algorithm/i);

    // Wrong audience
    const badAud = signTestJwt(
      { alg: 'RS256', kid: 'kid-strict' },
      { ...baseClaims, aud: 'other-client.apps.googleusercontent.com' },
      key1.privateKey
    );
    await assert.rejects(() => verifyGoogleIdTokenJwks(badAud, CLIENT_ID, opts), /audience/i);

    // Wrong issuer
    const badIss = signTestJwt(
      { alg: 'RS256', kid: 'kid-strict' },
      { ...baseClaims, iss: 'https://evil.example' },
      key1.privateKey
    );
    await assert.rejects(() => verifyGoogleIdTokenJwks(badIss, CLIENT_ID, opts), /issuer/i);

    // Expired
    const expired = signTestJwt(
      { alg: 'RS256', kid: 'kid-strict' },
      { ...baseClaims, exp: nowSec - 10 },
      key1.privateKey
    );
    await assert.rejects(() => verifyGoogleIdTokenJwks(expired, CLIENT_ID, opts), /expired/i);

    // Unverified email
    const unverified = signTestJwt(
      { alg: 'RS256', kid: 'kid-strict' },
      { ...baseClaims, email_verified: false },
      key1.privateKey
    );
    await assert.rejects(() => verifyGoogleIdTokenJwks(unverified, CLIENT_ID, opts), /verified/i);

    // Nonce mismatch
    const badNonce = signTestJwt(
      { alg: 'RS256', kid: 'kid-strict' },
      { ...baseClaims, nonce: 'wrong_nonce' },
      key1.privateKey
    );
    await assert.rejects(() => verifyGoogleIdTokenJwks(badNonce, CLIENT_ID, opts), /nonce/i);
  });
});
