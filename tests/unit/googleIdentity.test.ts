import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeGoogleCredentialPayload,
  getGoogleClientId,
  isGoogleSignInConfigured,
} from '../../src/services/googleIdentity.ts';

describe('Google Identity Service - Unit Tests', () => {
  describe('getGoogleClientId & isGoogleSignInConfigured', () => {
    it('returns null when env is undefined or empty', () => {
      assert.equal(getGoogleClientId(''), null);
      assert.equal(getGoogleClientId('   '), null);
      assert.equal(getGoogleClientId(undefined), null);
    });

    it('rejects placeholders and TODO tokens', () => {
      assert.equal(getGoogleClientId('your_client_id_here'), null);
      assert.equal(getGoogleClientId('your-google-client-id'), null);
      assert.equal(getGoogleClientId('TODO: replace with client id'), null);
      assert.equal(getGoogleClientId('GOOGLE_CLIENT_ID_PLACEHOLDER'), null);
      assert.equal(getGoogleClientId('null'), null);
      assert.equal(getGoogleClientId('undefined'), null);
      assert.equal(getGoogleClientId('short'), null);
    });

    it('accepts valid OAuth client ID strings', () => {
      const validId = '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';
      assert.equal(getGoogleClientId(validId), validId);
    });

    it('checks isGoogleSignInConfigured accurately', () => {
      // Default import.meta.env in test environment without VITE_GOOGLE_CLIENT_ID
      const configured = isGoogleSignInConfigured();
      assert.equal(typeof configured, 'boolean');
    });
  });

  describe('decodeGoogleCredentialPayload', () => {
    it('returns null on empty or non-string inputs', () => {
      assert.equal(decodeGoogleCredentialPayload(''), null);
      // @ts-expect-error test non-string input
      assert.equal(decodeGoogleCredentialPayload(null), null);
      // @ts-expect-error test non-string input
      assert.equal(decodeGoogleCredentialPayload(undefined), null);
    });

    it('returns null on malformed JWT (not 3 dot-separated parts)', () => {
      assert.equal(decodeGoogleCredentialPayload('abc.def'), null);
      assert.equal(decodeGoogleCredentialPayload('abc'), null);
      assert.equal(decodeGoogleCredentialPayload('a.b.c.d'), null);
    });

    it('returns null if payload is not valid base64url JSON or lacks sub', () => {
      assert.equal(decodeGoogleCredentialPayload('abc.invalid-payload.sig'), null);
      // Valid JSON but lacks sub: {"name": "test"} -> eyJuYW1lIjogInRlc3QifQ
      assert.equal(decodeGoogleCredentialPayload('header.eyJuYW1lIjogInRlc3QifQ.sig'), null);
    });

    it('correctly decodes valid Google credential JWT payload', () => {
      const claims = {
        iss: 'https://accounts.google.com',
        sub: 'google_user_1092830192',
        aud: '12345.apps.googleusercontent.com',
        email: 'atelier.member@gmail.com',
        email_verified: true,
        name: '홍길동',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
        exp: 1893456000,
      };

      const payloadB64Url = Buffer.from(JSON.stringify(claims), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${payloadB64Url}.fake_signature_part`;
      const decoded = decodeGoogleCredentialPayload(fakeJwt);

      assert.ok(decoded);
      assert.equal(decoded.sub, 'google_user_1092830192');
      assert.equal(decoded.email, 'atelier.member@gmail.com');
      assert.equal(decoded.name, '홍길동');
      assert.equal(decoded.email_verified, true);
      assert.equal(decoded.aud, '12345.apps.googleusercontent.com');
      assert.equal(decoded.exp, 1893456000);
    });
  });
});
