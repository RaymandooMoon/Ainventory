import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkerHandler } from '../../worker/index.js';

function createMockAssetsBinding() {
  const seenPaths: string[] = [];
  return {
    seenPaths,
    ASSETS: {
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        seenPaths.push(url.pathname);
        // Emulate Cloudflare Static Assets auto-trailing-slash 307 if `/app/index.html` is requested directly
        if (url.pathname === '/app/index.html') {
          return new Response(null, {
            status: 307,
            headers: { Location: '/app/' },
          });
        }
        if (url.pathname === '/app/') {
          return new Response('<!doctype html><title>iNVTRY App</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        if (url.pathname === '/app.html') {
          return new Response(null, {
            status: 307,
            headers: { Location: '/app' },
          });
        }
        if (url.pathname === '/studio-embed/') {
          return new Response('<!doctype html><title>iNVTRY Live Embed</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };
}

describe('Cloudflare Worker — ainvtry.com/app SPA, OAuth Reverse Proxy & Sandboxed /uploads', () => {
  it('redirects www.ainvtry.com/app* to canonical apex https://ainvtry.com/app* with 301', async () => {
    const worker = createWorkerHandler();
    const res = await worker.fetch(
      new Request('https://www.ainvtry.com/app/closet?tab=top'),
      {}
    );
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://ainvtry.com/app/closet?tab=top');
  });

  it('serves /app, /app/, /app/login, /app/closet, /app/item/42 with 200 OK, zero 307 loop, and hardened headers', async () => {
    const worker = createWorkerHandler();
    const mock = createMockAssetsBinding();

    for (const path of ['/app', '/app/', '/app/login', '/app/closet', '/app/item/42']) {
      const res = await worker.fetch(
        new Request(`https://ainvtry.com${path}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15' },
        }),
        { ASSETS: mock.ASSETS }
      );
      assert.equal(res.status, 200, `expected 200 for ${path}`);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
      assert.equal(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
      assert.match(res.headers.get('x-robots-tag') || '', /noindex/i);
      assert.match(res.headers.get('content-security-policy') || '', /accounts\.google\.com\/gsi/);
      assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    }

    assert.ok(
      mock.seenPaths.every((p) => p === '/app/'),
      `must always request /app/ from ASSETS to prevent 307 loop, got: ${mock.seenPaths.join(', ')}`
    );
  });

  it('keeps /app.html marketing Live Studio embed at 200 OK without 307 redirect and blocks AI scrapers on /app', async () => {
    const worker = createWorkerHandler();
    const mock = createMockAssetsBinding();

    const embedRes = await worker.fetch(
      new Request('https://ainvtry.com/app.html?embed=1', {
        headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36' },
      }),
      { ASSETS: mock.ASSETS }
    );
    assert.equal(embedRes.status, 200);
    assert.equal(embedRes.headers.get('x-frame-options'), null);
    assert.match(
      embedRes.headers.get('content-security-policy') || '',
      /frame-ancestors 'self' https:\/\/ainvtry\.com https:\/\/www\.ainvtry\.com/
    );
    assert.match(await embedRes.text(), /Live Embed/);
    assert.equal(mock.seenPaths[0], '/studio-embed/');

    const botRes = await worker.fetch(
      new Request('https://ainvtry.com/app/login', {
        headers: { 'User-Agent': 'GPTBot/1.0' },
      }),
      { ASSETS: mock.ASSETS }
    );
    assert.equal(botRes.status, 403);
  });

  it('proxies OAuth /api/auth/google/* with redirect:manual, X-Forwarded-* headers, and multiple Set-Cookie headers intact', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedUrl = String(input);
      capturedInit = init;
      const headers = new Headers();
      headers.set('Location', '/app?auth_result=google_new');
      headers.append(
        'Set-Cookie',
        'ainv_google_oauth=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0; Secure'
      );
      headers.append(
        'Set-Cookie',
        'ainventory_token=tok_abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure'
      );
      return new Response(null, { status: 302, headers });
    };

    const worker = createWorkerHandler(mockFetch as typeof fetch);
    const res = await worker.fetch(
      new Request('https://ainvtry.com/api/auth/google/callback?code=c1&state=s1', {
        headers: {
          Cookie: 'ainv_google_oauth=goa1.signed.val',
          'cf-connecting-ip': '203.0.113.42',
        },
      }),
      { API_UPSTREAM_ORIGIN: 'https://ainventory-api-seoul.run.app' }
    );

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/app?auth_result=google_new');
    assert.equal(
      capturedUrl,
      'https://ainventory-api-seoul.run.app/api/auth/google/callback?code=c1&state=s1'
    );
    assert.equal(capturedInit?.redirect, 'manual');

    const sentHeaders = new Headers(capturedInit?.headers);
    assert.equal(sentHeaders.get('x-forwarded-for'), '203.0.113.42');
    assert.equal(sentHeaders.get('x-forwarded-proto'), 'https');
    assert.equal(sentHeaders.get('x-forwarded-host'), 'ainvtry.com');
    assert.equal(sentHeaders.get('cookie'), 'ainv_google_oauth=goa1.signed.val');

    const resHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = typeof resHeaders.getSetCookie === 'function' ? resHeaders.getSetCookie() : [];
    assert.equal(setCookies.length, 2);
    assert.ok(setCookies.some((c) => c.startsWith('ainv_google_oauth=')));
    assert.ok(setCookies.some((c) => c.startsWith('ainventory_token=tok_abc123')));
  });

  it('proxies /uploads/* with cookie/auth forwarding and sandbox CSP while rejecting non-GET mutations', async () => {
    let forwardedCookie = '';
    const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      forwardedCookie = new Headers(init?.headers).get('cookie') || '';
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    };

    const worker = createWorkerHandler(mockFetch as typeof fetch);

    const getRes = await worker.fetch(
      new Request('https://ainvtry.com/uploads/closet_user_123.webp', {
        headers: { Cookie: 'ainventory_token=tok_img_1' },
      }),
      { API_UPSTREAM_ORIGIN: 'https://ainventory-api-seoul.run.app' }
    );
    assert.equal(getRes.status, 200);
    assert.equal(forwardedCookie, 'ainventory_token=tok_img_1');
    assert.equal(getRes.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(getRes.headers.get('x-content-type-options'), 'nosniff');
    assert.match(getRes.headers.get('x-robots-tag') || '', /noindex/i);

    const postRes = await worker.fetch(
      new Request('https://ainvtry.com/uploads/evil.html', { method: 'POST', body: '<script>' }),
      { API_UPSTREAM_ORIGIN: 'https://ainventory-api-seoul.run.app' }
    );
    assert.equal(postRes.status, 405);
  });
});
