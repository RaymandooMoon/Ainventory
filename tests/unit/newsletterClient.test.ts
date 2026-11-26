import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  resolveNewsletterEndpoints,
  subscribeToNewsletter,
  syncOfflineNewsletterSubscription,
} from '../../src/site/newsletterClient.ts';
import { buildNewsletterSubscribersCsv, sanitizeCsvCell } from '../../src/utils/newsletterCsv.ts';

describe('Newsletter Client Resilience, CSV Export & Cloudflare Worker Config Contract', () => {
  it('configures wrangler.jsonc with Worker entry point and /api/* run_worker_first routing', () => {
    const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');
    const raw = fs.readFileSync(wranglerPath, 'utf8');
    // Strip JSONC comments before JSON.parse
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    const config = JSON.parse(stripped) as {
      main?: string;
      assets?: {
        directory?: string;
        binding?: string;
        run_worker_first?: string[];
      };
      vars?: Record<string, string>;
    };

    assert.equal(config.main, 'worker/index.js');
    assert.equal(config.assets?.directory, './dist-site');
    assert.equal(config.assets?.binding, 'ASSETS');
    assert.ok(Array.isArray(config.assets?.run_worker_first));
    assert.ok(config.assets?.run_worker_first?.includes('/api/*'));
    assert.equal(config.vars?.API_UPSTREAM_ORIGIN, 'https://ainventory-api.onrender.com');
  });

  it('attaches automatic Render production API fallback only on hosted public domains', () => {
    const prod = resolveNewsletterEndpoints({}, 'ainvtry.com');
    assert.equal(prod.isStaticOnly, false);
    assert.deepEqual(prod.subscribeUrls, [
      '/api/newsletter/subscribe',
      'https://ainventory-api.onrender.com/api/newsletter/subscribe',
    ]);

    const wwwProd = resolveNewsletterEndpoints({}, 'www.ainvtry.com');
    assert.equal(wwwProd.subscribeUrls.length, 2);

    const ghPages = resolveNewsletterEndpoints({ VITE_STATIC_SITE: 'true' }, 'raymandoomoon.github.io');
    assert.equal(ghPages.isStaticOnly, false);
    assert.equal(ghPages.subscribeUrls[1], 'https://ainventory-api.onrender.com/api/newsletter/subscribe');

    const local = resolveNewsletterEndpoints({}, 'localhost');
    assert.deepEqual(local.subscribeUrls, ['/api/newsletter/subscribe']);
  });

  it('falls back seamlessly from same-origin HTML/503 to Render backup API before ever returning offline_saved', async () => {
    const visitedUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      visitedUrls.push(url);
      if (url === '/api/newsletter/subscribe') {
        // Simulate old static SPA HTML fallback
        return new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          status: 'subscribed',
          email: 'mbo88@naver.com',
          storage: 'upstream',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const result = await subscribeToNewsletter(
      {
        email: 'mbo88@naver.com',
        consent: true,
        lang: 'ko',
        source: 'site_about',
      },
      {
        fetchImpl: mockFetch,
        envOverride: {},
        hostnameOverride: 'ainvtry.com',
        timeoutMs: 3000,
      }
    );

    assert.equal(visitedUrls.length, 2);
    assert.equal(visitedUrls[0], '/api/newsletter/subscribe');
    assert.equal(visitedUrls[1], 'https://ainventory-api.onrender.com/api/newsletter/subscribe');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'subscribed');
      assert.equal(result.email, 'mbo88@naver.com');
    }
  });

  it('upgrades previously offline_saved local records to subscribed when syncOfflineNewsletterSubscription reaches the server', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          status: 'subscribed',
          email: 'mbo88@naver.com',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    const synced = await syncOfflineNewsletterSubscription(
      {
        email: 'mbo88@naver.com',
        lang: 'ko',
        status: 'offline_saved',
        subscribedAt: '2026-11-26T00:00:00.000Z',
      },
      'site_about',
      {
        fetchImpl: mockFetch,
        envOverride: {},
        hostnameOverride: 'ainvtry.com',
        timeoutMs: 3000,
      }
    );

    assert.equal(synced.ok, true);
    if (synced.ok) {
      assert.equal(synced.status, 'subscribed');
      assert.equal(synced.email, 'mbo88@naver.com');
    }
  });

  it('sanitizes spreadsheet formula-injection cells and emits UTF-8 BOM in CSV exports', () => {
    assert.equal(sanitizeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"` );
    assert.equal(sanitizeCsvCell('+1+1'), "'+1+1");
    assert.equal(sanitizeCsvCell('-2+3'), "'-2+3");
    assert.equal(sanitizeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
    assert.equal(sanitizeCsvCell('normal@ainvtry.com'), 'normal@ainvtry.com');

    const csv = buildNewsletterSubscribersCsv([
      {
        id: 7,
        email: 'mbo88@naver.com',
        status: 'subscribed',
        lang: 'ko',
        source: 'site_about',
        created_at: '2026-11-26 09:46:48',
        updated_at: '2026-11-26 09:46:48',
        unsubscribed_at: null,
      },
      {
        id: 8,
        email: '=HYPERLINK("https://evil.test","click")',
        status: 'unsubscribed',
        lang: 'en',
        source: 'site_footer',
        created_at: '2026-11-26 10:00:00',
        updated_at: '2026-11-26 10:05:00',
        unsubscribed_at: '2026-11-26 10:05:00',
      },
    ]);

    assert.ok(csv.startsWith('\uFEFFid,email,status,lang,source,created_at,updated_at,unsubscribed_at\r\n'));
    assert.ok(csv.includes('7,mbo88@naver.com,subscribed,ko,site_about'));
    assert.ok(csv.includes(`8,"'=HYPERLINK(""https://evil.test"",""click"")",unsubscribed,en,site_footer`));
  });
});
