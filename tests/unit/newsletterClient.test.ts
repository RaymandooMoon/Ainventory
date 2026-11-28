import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  resolveNewsletterEndpoints,
  subscribeToNewsletter,
  verifyNewsletterEmail,
} from '../../src/site/newsletterClient.ts';
import { buildNewsletterSubscribersCsv, sanitizeCsvCell } from '../../src/utils/newsletterCsv.ts';

describe('Newsletter Client Double Opt-In Resilience, CSV Export & Cloudflare Worker Config Contract', () => {
  it('configures wrangler.jsonc with Worker entry point and /api/* run_worker_first routing', () => {
    const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');
    const raw = fs.readFileSync(wranglerPath, 'utf8');
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
    assert.ok(config.assets?.run_worker_first?.includes('/api/*'));
    assert.equal(
      config.vars?.API_UPSTREAM_ORIGIN,
      'https://ainventory-api-2xrmog66nq-du.a.run.app'
    );
  });

  it('attaches automatic Seoul Cloud Run production API fallback for subscribe, verify, resend, and unsubscribe on hosted domains', () => {
    const prod = resolveNewsletterEndpoints({}, 'ainvtry.com');
    assert.equal(prod.isStaticOnly, false);
    assert.deepEqual(prod.subscribeUrls, [
      '/api/newsletter/subscribe',
      'https://ainventory-api-2xrmog66nq-du.a.run.app/api/newsletter/subscribe',
    ]);
    assert.deepEqual(prod.verifyUrls, [
      '/api/newsletter/verify',
      'https://ainventory-api-2xrmog66nq-du.a.run.app/api/newsletter/verify',
    ]);
    assert.deepEqual(prod.resendUrls, [
      '/api/newsletter/resend',
      'https://ainventory-api-2xrmog66nq-du.a.run.app/api/newsletter/resend',
    ]);

    const local = resolveNewsletterEndpoints({}, 'localhost');
    assert.deepEqual(local.subscribeUrls, ['/api/newsletter/subscribe']);
    assert.deepEqual(local.verifyUrls, ['/api/newsletter/verify']);
  });

  it('completes 2-step subscribe (pending_verification) -> verifyNewsletterEmail with hosted fallback', async () => {
    const visitedUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      visitedUrls.push(url);
      if (url === '/api/newsletter/subscribe') {
        return new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.endsWith('/newsletter/subscribe')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'pending_verification',
            email: 'mbo88@naver.com',
            expiresInSec: 600,
            cooldownSec: 60,
            challengeToken: 'nlc1.mock.sig',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/newsletter/verify')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'subscribed',
            verified: true,
            email: 'mbo88@naver.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const step1 = await subscribeToNewsletter(
      { email: 'mbo88@naver.com', consent: true, lang: 'ko', source: 'site_about' },
      { fetchImpl: mockFetch, envOverride: {}, hostnameOverride: 'ainvtry.com', timeoutMs: 3000 }
    );
    assert.equal(step1.ok, true);
    if (step1.ok) {
      assert.equal(step1.status, 'pending_verification');
      if (step1.status === 'pending_verification') {
        assert.equal(step1.challengeToken, 'nlc1.mock.sig');
      }
    }

    const step2 = await verifyNewsletterEmail(
      { email: 'mbo88@naver.com', code: '482910', challengeToken: 'nlc1.mock.sig', lang: 'ko' },
      { fetchImpl: mockFetch, envOverride: {}, hostnameOverride: 'ainvtry.com', timeoutMs: 3000 }
    );
    assert.equal(step2.ok, true);
    if (step2.ok) {
      assert.equal(step2.status, 'subscribed');
      assert.equal(step2.email, 'mbo88@naver.com');
    }
    assert.ok(
      visitedUrls.includes('https://ainventory-api-2xrmog66nq-du.a.run.app/api/newsletter/subscribe')
    );
  });

  it('propagates EMAIL_DELIVERY_NOT_CONFIGURED cleanly without silently falling back to offline_saved', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
          error: 'RESEND_API_KEY required',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );

    const res = await subscribeToNewsletter(
      { email: 'mbo88@naver.com', consent: true, lang: 'ko', source: 'site_modal' },
      { fetchImpl: mockFetch, envOverride: {}, hostnameOverride: 'ainvtry.com', timeoutMs: 3000 }
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'EMAIL_DELIVERY_NOT_CONFIGURED');
    }
  });

  it('sanitizes spreadsheet formula-injection cells and emits verified_at + UTF-8 BOM in CSV exports', () => {
    assert.equal(sanitizeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
    assert.equal(sanitizeCsvCell('+1+1'), "'+1+1");
    assert.equal(sanitizeCsvCell('-2+3'), "'-2+3");
    assert.equal(sanitizeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");

    const csv = buildNewsletterSubscribersCsv([
      {
        id: 7,
        email: 'mbo88@naver.com',
        status: 'subscribed',
        lang: 'ko',
        source: 'site_about',
        verified_at: '2026-11-26 09:47:10',
        created_at: '2026-11-26 09:46:48',
        updated_at: '2026-11-26 09:47:10',
        unsubscribed_at: null,
      },
      {
        id: 8,
        email: '=HYPERLINK("https://evil.test","click")',
        status: 'pending',
        lang: 'en',
        source: 'site_footer',
        verified_at: null,
        created_at: '2026-11-26 10:00:00',
        updated_at: '2026-11-26 10:00:00',
        unsubscribed_at: null,
      },
    ]);

    assert.ok(
      csv.startsWith(
        '\uFEFFid,email,status,lang,source,verified_at,created_at,updated_at,unsubscribed_at\r\n'
      )
    );
    assert.ok(csv.includes('7,mbo88@naver.com,subscribed,ko,site_about,2026-11-26 09:47:10'));
    assert.ok(csv.includes(`8,"'=HYPERLINK(""https://evil.test"",""click"")",pending,en,site_footer`));
  });
});
