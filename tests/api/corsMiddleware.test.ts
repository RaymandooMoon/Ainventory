import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createCorsMiddleware, parseAllowedOrigins } from '../../server/cors.js';

describe('Server CORS Middleware for External Static Frontends (GitHub Pages)', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(
      '/api',
      createCorsMiddleware({
        allowedOrigins: 'https://raymandoomoon.github.io, http://localhost:5173/ignored-path, invalid-url',
      })
    );
    app.get('/api/vton/status', (_req, res) => {
      res.status(200).json({ ok: true, geminiConfigured: true });
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('normalizes valid http(s) origins and ignores invalid entries', () => {
    const parsed = parseAllowedOrigins(
      'https://raymandoomoon.github.io/Ainventory, http://localhost:3000/, javascript:alert(1), , ftp://bad.example'
    );
    assert.deepEqual(Array.from(parsed), [
      'https://raymandoomoon.github.io',
      'http://localhost:3000',
    ]);
  });

  it('answers OPTIONS preflight for allowed GitHub Pages origin with required VTON headers', async () => {
    const res = await fetch(`${baseUrl}/api/vton/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://raymandoomoon.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, x-demo-mode, x-profile-key',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://raymandoomoon.github.io');
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
    assert.match(res.headers.get('vary') || '', /Origin/i);
    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(allowHeaders.includes('authorization'));
    assert.ok(allowHeaders.includes('x-demo-mode'));
    assert.ok(allowHeaders.includes('x-profile-key'));
  });

  it('sets CORS headers on allowed GET requests and blocks untrusted origins from receiving ACAO', async () => {
    const allowedRes = await fetch(`${baseUrl}/api/vton/status`, {
      headers: { Origin: 'https://raymandoomoon.github.io' },
    });
    assert.equal(allowedRes.status, 200);
    assert.equal(
      allowedRes.headers.get('access-control-allow-origin'),
      'https://raymandoomoon.github.io'
    );
    assert.match(allowedRes.headers.get('vary') || '', /Origin/i);

    const untrustedRes = await fetch(`${baseUrl}/api/vton/status`, {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(untrustedRes.status, 200);
    assert.equal(untrustedRes.headers.get('access-control-allow-origin'), null);
    assert.match(untrustedRes.headers.get('vary') || '', /Origin/i);

    const untrustedPreflight = await fetch(`${baseUrl}/api/vton/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(untrustedPreflight.status, 204);
    assert.equal(untrustedPreflight.headers.get('access-control-allow-origin'), null);
    assert.match(untrustedPreflight.headers.get('vary') || '', /Origin/i);
  });
});
