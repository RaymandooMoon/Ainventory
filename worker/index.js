/**
 * worker/index.js
 * ---------------------------------------------------------------------------
 * Cloudflare Worker Edge API + Static Assets Router for https://ainvtry.com
 *
 * - Serves static site assets directly via Cloudflare Static Assets (`run_worker_first: ["/api/*"]`).
 * - Handles `/api/newsletter/*` at the edge with strict validation, honeypot,
 *   per-IP sliding-window rate limiting, and 3-tier storage:
 *     1) Cloudflare D1 (`env.NEWSLETTER_DB`) when bound (permanent edge SQL)
 *     2) Cloudflare KV (`env.NEWSLETTER_KV`) when bound (permanent edge KV)
 *     3) Render Express upstream (`env.API_UPSTREAM_ORIGIN`) by default with
 *        cold-start-tolerant retry so it works immediately with zero dashboard setup!
 * - Dispatches non-blocking Resend welcome/founder emails (`env.RESEND_API_KEY`)
 *   and SSRF-validated webhook alerts (`env.NEWSLETTER_WEBHOOK_URL`) via `ctx.waitUntil`.
 * - Proxies remaining `/api/*` requests cleanly to `env.API_UPSTREAM_ORIGIN`.
 */

const DEFAULT_UPSTREAM_ORIGIN = 'https://ainventory-api.onrender.com';
const DEFAULT_FROM_EMAIL = 'iNVTRY <newsletter@ainvtry.com>';
const DEFAULT_NOTIFY_EMAIL = 'raymond@ainvtry.com';
const RESEND_API_URL = 'https://api.resend.com/emails';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[a-z]{2,63}$/i;
const ALLOWED_SOURCES = new Set(['site_footer', 'site_about', 'site_hero', 'site_modal']);
const ALLOWED_ORIGINS = new Set([
  'https://ainvtry.com',
  'https://www.ainvtry.com',
  'https://raymandoomoon.github.io',
]);

const MAX_BODY_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 12;
const UPSTREAM_TIMEOUT_MS = 26_000;
const NOTIFY_TIMEOUT_MS = 8_000;
const KV_INDEX_KEY = 'newsletter:index:v1';
const KV_SUB_PREFIX = 'newsletter:sub:';

const rateBuckets = new Map();

export function resetWorkerRateLimitsForTests() {
  rateBuckets.clear();
}

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  if (/[\r\n\u0000-\u001f]/.test(raw)) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || normalized.includes('..')) return null;
  if (!EMAIL_RE.test(normalized)) return null;
  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart || localPart.length > 64 || domainPart.length > 190) return null;
  return normalized;
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

export function resolveSafeHttpsUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveUpstreamOrigin(env) {
  const candidate = resolveSafeHttpsUrl(env?.API_UPSTREAM_ORIGIN || DEFAULT_UPSTREAM_ORIGIN);
  if (!candidate) return DEFAULT_UPSTREAM_ORIGIN;
  return new URL(candidate).origin;
}

function resolveCorsOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  const extra = String(env?.CORS_ALLOWED_ORIGINS || '').split(',');
  for (const item of extra) {
    const t = item.trim();
    if (t && t === origin) return origin;
  }
  return null;
}

function buildJsonResponse(body, status, request, env, extraHeaders = {}) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  if (status !== 204) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  const corsOrigin = resolveCorsOrigin(request, env);
  if (corsOrigin) {
    headers.set('Access-Control-Allow-Origin', corsOrigin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Demo-Mode, X-Profile-Key');
    headers.set('Vary', 'Origin');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function checkEdgeRateLimit(key, now = Date.now()) {
  const entry = rateBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > 2000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (now >= v.resetAt) rateBuckets.delete(k);
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= RATE_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

async function readJsonBody(request) {
  const lenHeader = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(lenHeader) && lenHeader > MAX_BODY_BYTES) {
    return { errorStatus: 413, errorCode: 'PAYLOAD_TOO_LARGE', errorMessage: '요청 본문이 너무 큽니다.' };
  }
  let text = '';
  try {
    text = await request.text();
  } catch {
    return { errorStatus: 400, errorCode: 'INVALID_JSON', errorMessage: '잘못된 요청 본문입니다.' };
  }
  if (text.length > MAX_BODY_BYTES) {
    return { errorStatus: 413, errorCode: 'PAYLOAD_TOO_LARGE', errorMessage: '요청 본문이 너무 큽니다.' };
  }
  try {
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { errorStatus: 400, errorCode: 'INVALID_JSON', errorMessage: '잘못된 JSON 형식입니다.' };
    }
    return { body: parsed };
  } catch {
    return { errorStatus: 400, errorCode: 'INVALID_JSON', errorMessage: '잘못된 JSON 요청 본문입니다.' };
  }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ==========================================================================
 * Optional Edge Storage Drivers (Cloudflare D1 & Cloudflare KV)
 * ========================================================================== */

const initializedD1Instances = new WeakSet();

async function ensureD1NewsletterTable(db) {
  if (initializedD1Instances.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         email TEXT UNIQUE NOT NULL,
         lang TEXT NOT NULL DEFAULT 'ko',
         source TEXT NOT NULL DEFAULT 'site_about',
         status TEXT NOT NULL DEFAULT 'subscribed',
         consent_at TEXT NOT NULL DEFAULT (datetime('now')),
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         unsubscribed_at TEXT DEFAULT NULL
       )`
    )
    .run();
  initializedD1Instances.add(db);
}

async function subscribeInD1(db, { email, lang, source }) {
  await ensureD1NewsletterTable(db);
  const existing = await db
    .prepare('SELECT id, status FROM newsletter_subscribers WHERE email = ?')
    .bind(email)
    .first();

  if (existing) {
    if (existing.status === 'subscribed') {
      await db
        .prepare(
          "UPDATE newsletter_subscribers SET lang = ?, source = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(lang, source, existing.id)
        .run();
      return { httpStatus: 200, status: 'already_subscribed', resubscribed: false, email, storage: 'd1' };
    }
    await db
      .prepare(
        "UPDATE newsletter_subscribers SET status = 'subscribed', lang = ?, source = ?, consent_at = datetime('now'), updated_at = datetime('now'), unsubscribed_at = NULL WHERE id = ?"
      )
      .bind(lang, source, existing.id)
      .run();
    return { httpStatus: 200, status: 'subscribed', resubscribed: true, email, storage: 'd1' };
  }

  await db
    .prepare(
      "INSERT INTO newsletter_subscribers (email, lang, source, status) VALUES (?, ?, ?, 'subscribed')"
    )
    .bind(email, lang, source)
    .run();
  return { httpStatus: 201, status: 'subscribed', resubscribed: false, email, storage: 'd1' };
}

async function unsubscribeInD1(db, email) {
  await ensureD1NewsletterTable(db);
  await db
    .prepare(
      "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now'), updated_at = datetime('now') WHERE email = ?"
    )
    .bind(email)
    .run();
}

async function subscribeInKv(kv, { email, lang, source }) {
  const now = new Date().toISOString();
  const key = `${KV_SUB_PREFIX}${email}`;
  const raw = await kv.get(key, 'json');

  let result;
  let record;
  if (raw && raw.status === 'subscribed') {
    record = { ...raw, lang, source, updated_at: now };
    result = { httpStatus: 200, status: 'already_subscribed', resubscribed: false, email, storage: 'kv' };
  } else if (raw) {
    record = {
      ...raw,
      email,
      lang,
      source,
      status: 'subscribed',
      consent_at: now,
      updated_at: now,
      unsubscribed_at: null,
    };
    result = { httpStatus: 200, status: 'subscribed', resubscribed: true, email, storage: 'kv' };
  } else {
    record = {
      email,
      lang,
      source,
      status: 'subscribed',
      consent_at: now,
      created_at: now,
      updated_at: now,
      unsubscribed_at: null,
    };
    result = { httpStatus: 201, status: 'subscribed', resubscribed: false, email, storage: 'kv' };
  }

  await kv.put(key, JSON.stringify(record));
  try {
    const rawIdx = (await kv.get(KV_INDEX_KEY, 'json')) || [];
    const list = Array.isArray(rawIdx) ? rawIdx.filter((e) => e !== email) : [];
    list.unshift(email);
    await kv.put(KV_INDEX_KEY, JSON.stringify(list.slice(0, 1000)));
  } catch {
    // Non-fatal index update
  }
  return result;
}

async function unsubscribeInKv(kv, email) {
  const key = `${KV_SUB_PREFIX}${email}`;
  const raw = await kv.get(key, 'json');
  if (!raw) return;
  const now = new Date().toISOString();
  await kv.put(
    key,
    JSON.stringify({
      ...raw,
      status: 'unsubscribed',
      unsubscribed_at: now,
      updated_at: now,
    })
  );
}

/* ==========================================================================
 * Edge Notifications (Resend Welcome + Founder Alert + SSRF-Safe Webhook)
 * ========================================================================== */

async function dispatchEdgeNotifications(event, env, fetchImpl) {
  const summary = { welcomeSent: false, founderAlertSent: false, webhookSent: false };
  const resendKey = String(env?.RESEND_API_KEY || '').trim();
  const fromEmail = String(env?.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim() || DEFAULT_FROM_EMAIL;
  const notifyEmail =
    String(env?.NEWSLETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL).trim() || DEFAULT_NOTIFY_EMAIL;
  const webhookUrl = resolveSafeHttpsUrl(env?.NEWSLETTER_WEBHOOK_URL);
  const webhookSecret = String(env?.NEWSLETTER_WEBHOOK_SECRET || '').trim();

  const tasks = [];

  if (resendKey && event.type === 'subscribed') {
    const isEn = event.lang === 'en';
    const safeEmail = escapeHtml(event.email);
    const sendEmail = async (payload, flag) => {
      try {
        const res = await fetchWithTimeout(
          fetchImpl,
          RESEND_API_URL,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
          NOTIFY_TIMEOUT_MS
        );
        if (res.ok) summary[flag] = true;
      } catch {
        // Non-blocking
      }
    };

    tasks.push(
      sendEmail(
        {
          from: fromEmail,
          to: [event.email],
          reply_to: notifyEmail,
          subject: isEn
            ? '[iNVTRY] Welcome to the iNVTRY Newsletter'
            : '[iNVTRY] 뉴스레터 구독이 완료되었습니다',
          text: isEn
            ? `Your email (${event.email}) is subscribed to the iNVTRY newsletter. Unsubscribe anytime at https://ainvtry.com.`
            : `${event.email} 주소로 iNVTRY 뉴스레터 구독이 완료되었습니다. 언제든 https://ainvtry.com 에서 수신 거부할 수 있습니다.`,
          html: `<div style="background:#09090b;color:#f5f5f7;padding:28px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;border-radius:14px;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;color:#d6b889;font-weight:700;">iNVTRY · NEWSLETTER</p>
            <h1 style="margin:0 0 12px;font-size:19px;">${
              isEn ? 'You are subscribed.' : '뉴스레터 구독이 완료되었습니다.'
            }</h1>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d1d1d6;">${
              isEn
                ? `<strong>${safeEmail}</strong> will receive iNVTRY private beta invitations and release notes.`
                : `<strong>${safeEmail}</strong> 주소로 프라이빗 베타 초대와 주요 업데이트 소식을 보내 드리겠습니다.`
            }</p>
            <p style="margin:0;font-size:12px;color:#8e8e93;">${
              isEn
                ? 'Unsubscribe anytime on <a href="https://ainvtry.com" style="color:#d6b889;">ainvtry.com</a>.'
                : '언제든 <a href="https://ainvtry.com" style="color:#d6b889;">ainvtry.com</a> 소통 탭에서 수신 거부할 수 있습니다.'
            }</p>
          </div>`,
        },
        'welcomeSent'
      )
    );

    if (notifyEmail.toLowerCase() !== event.email.toLowerCase()) {
      const actionLabel = event.resubscribed ? '재구독' : '신규 구독';
      tasks.push(
        sendEmail(
          {
            from: fromEmail,
            to: [notifyEmail],
            reply_to: event.email,
            subject: `[iNVTRY Newsletter] ${actionLabel}: ${event.email}`,
            text: `iNVTRY 뉴스레터 ${actionLabel}: ${event.email} (${event.lang} · ${event.source} · ${event.storage})`,
          },
          'founderAlertSent'
        )
      );
    }
  }

  if (webhookUrl && (event.type === 'subscribed' || event.type === 'unsubscribed')) {
    const text =
      event.type === 'unsubscribed'
        ? `[iNVTRY Newsletter] 수신 거부: ${event.email}`
        : `[iNVTRY Newsletter] ${event.resubscribed ? '재구독' : '신규 구독'}: ${event.email} (${event.lang} · ${event.source})`;
    const headers = { 'Content-Type': 'application/json' };
    if (webhookSecret) headers['X-Ainvtry-Webhook-Secret'] = webhookSecret;

    tasks.push(
      (async () => {
        try {
          const res = await fetchWithTimeout(
            fetchImpl,
            webhookUrl,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                event: `newsletter.${event.type}`,
                email: event.email,
                lang: event.lang,
                source: event.source,
                resubscribed: Boolean(event.resubscribed),
                storage: event.storage,
                timestamp: new Date().toISOString(),
                text,
                content: text,
              }),
            },
            NOTIFY_TIMEOUT_MS
          );
          if (res.ok) summary.webhookSent = true;
        } catch {
          // Non-blocking
        }
      })()
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
  return summary;
}

/* ==========================================================================
 * Upstream Render Express Proxy (Cold-Start Tolerant)
 * ========================================================================== */

async function forwardNewsletterToUpstream(pathSuffix, payload, env, fetchImpl, notifyHandledAtEdge) {
  const upstreamOrigin = resolveUpstreamOrigin(env);
  const url = `${upstreamOrigin}/api/newsletter/${pathSuffix}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (notifyHandledAtEdge) {
    headers['X-Newsletter-Notify-Handled'] = '1';
  }

  // Up to 2 attempts to tolerate transient Render 502/503 cold-start hiccups
  let lastStatus = 503;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        UPSTREAM_TIMEOUT_MS
      );
      lastStatus = res.status;
      if (attempt === 0 && (res.status === 502 || res.status === 503 || res.status === 504)) {
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      return { ok: res.ok && Boolean(data?.ok), status: res.status, data };
    } catch {
      lastStatus = 504;
    }
  }
  return { ok: false, status: lastStatus, data: null };
}

async function handleNewsletterSubscribe(request, env, ctx, fetchImpl) {
  const clientIp = String(request.headers.get('cf-connecting-ip') || 'edge').slice(0, 64);
  const rate = checkEdgeRateLimit(`sub:${clientIp}`);
  if (!rate.allowed) {
    return buildJsonResponse(
      {
        ok: false,
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
      },
      429,
      request,
      env,
      { 'Retry-After': String(rate.retryAfterSec) }
    );
  }

  const parsed = await readJsonBody(request);
  if (parsed.errorStatus) {
    return buildJsonResponse(
      { ok: false, error: parsed.errorMessage, code: parsed.errorCode },
      parsed.errorStatus,
      request,
      env
    );
  }

  const body = parsed.body;
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return buildJsonResponse({ ok: true, status: 'subscribed' }, 200, request, env);
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return buildJsonResponse(
      { ok: false, error: '올바른 이메일 주소를 입력해 주세요.', code: 'INVALID_EMAIL' },
      400,
      request,
      env
    );
  }

  if (body.consent !== true) {
    return buildJsonResponse(
      { ok: false, error: '뉴스레터 수신 및 개인정보 수집 동의가 필요합니다.', code: 'CONSENT_REQUIRED' },
      400,
      request,
      env
    );
  }

  const lang = body.lang === 'en' ? 'en' : 'ko';
  const rawSource = typeof body.source === 'string' ? body.source.trim() : 'site_modal';
  const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : 'site_modal';

  const hasEdgeNotification = Boolean(
    String(env?.RESEND_API_KEY || '').trim() || resolveSafeHttpsUrl(env?.NEWSLETTER_WEBHOOK_URL)
  );
  const schedule = (promise) => {
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
    } else {
      void promise;
    }
  };

  // Tier 1: Permanent Cloudflare D1 binding
  if (env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function') {
    const saved = await subscribeInD1(env.NEWSLETTER_DB, { email, lang, source });
    if (saved.status === 'subscribed') {
      schedule(
        dispatchEdgeNotifications(
          { type: 'subscribed', email, lang, source, resubscribed: saved.resubscribed, storage: 'd1' },
          env,
          fetchImpl
        )
      );
    }
    schedule(
      forwardNewsletterToUpstream(
        'subscribe',
        { email, consent: true, lang, source },
        env,
        fetchImpl,
        true
      )
    );
    return buildJsonResponse(
      {
        ok: true,
        status: saved.status,
        resubscribed: saved.resubscribed || undefined,
        email,
        storage: 'd1',
      },
      saved.httpStatus,
      request,
      env
    );
  }

  // Tier 2: Permanent Cloudflare KV binding
  if (env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function') {
    const saved = await subscribeInKv(env.NEWSLETTER_KV, { email, lang, source });
    if (saved.status === 'subscribed') {
      schedule(
        dispatchEdgeNotifications(
          { type: 'subscribed', email, lang, source, resubscribed: saved.resubscribed, storage: 'kv' },
          env,
          fetchImpl
        )
      );
    }
    schedule(
      forwardNewsletterToUpstream(
        'subscribe',
        { email, consent: true, lang, source },
        env,
        fetchImpl,
        true
      )
    );
    return buildJsonResponse(
      {
        ok: true,
        status: saved.status,
        resubscribed: saved.resubscribed || undefined,
        email,
        storage: 'kv',
      },
      saved.httpStatus,
      request,
      env
    );
  }

  // Tier 3: Zero-config Render Express Upstream Proxy (+ Edge Resend/Webhook relay)
  const upstream = await forwardNewsletterToUpstream(
    'subscribe',
    { email, consent: true, lang, source },
    env,
    fetchImpl,
    hasEdgeNotification
  );

  if (upstream.ok && upstream.data) {
    const finalStatus =
      upstream.data.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
    if (finalStatus === 'subscribed' && hasEdgeNotification) {
      schedule(
        dispatchEdgeNotifications(
          {
            type: 'subscribed',
            email,
            lang,
            source,
            resubscribed: Boolean(upstream.data.resubscribed),
            storage: 'upstream',
          },
          env,
          fetchImpl
        )
      );
    }
    return buildJsonResponse(
      {
        ok: true,
        status: finalStatus,
        resubscribed: upstream.data.resubscribed || undefined,
        email: typeof upstream.data.email === 'string' ? upstream.data.email : email,
        storage: 'upstream',
      },
      upstream.status,
      request,
      env
    );
  }

  if (upstream.status === 400 || upstream.status === 429) {
    return buildJsonResponse(
      upstream.data || { ok: false, code: upstream.status === 429 ? 'RATE_LIMITED' : 'INVALID_EMAIL' },
      upstream.status,
      request,
      env
    );
  }

  // Last-resort durable relay: if upstream is temporarily sleeping/unreachable but Resend/Webhook is live
  if (hasEdgeNotification) {
    const notifyResult = await dispatchEdgeNotifications(
      { type: 'subscribed', email, lang, source, resubscribed: false, storage: 'relay' },
      env,
      fetchImpl
    );
    if (notifyResult.welcomeSent || notifyResult.founderAlertSent || notifyResult.webhookSent) {
      return buildJsonResponse(
        { ok: true, status: 'subscribed', email, storage: 'relay' },
        201,
        request,
        env
      );
    }
  }

  return buildJsonResponse(
    {
      ok: false,
      error: '구독 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      code: 'UPSTREAM_UNAVAILABLE',
    },
    503,
    request,
    env
  );
}

async function handleNewsletterUnsubscribe(request, env, ctx, fetchImpl) {
  const clientIp = String(request.headers.get('cf-connecting-ip') || 'edge').slice(0, 64);
  const rate = checkEdgeRateLimit(`unsub:${clientIp}`);
  if (!rate.allowed) {
    return buildJsonResponse(
      {
        ok: false,
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
      },
      429,
      request,
      env,
      { 'Retry-After': String(rate.retryAfterSec) }
    );
  }

  const parsed = await readJsonBody(request);
  if (parsed.errorStatus) {
    return buildJsonResponse(
      { ok: false, error: parsed.errorMessage, code: parsed.errorCode },
      parsed.errorStatus,
      request,
      env
    );
  }

  const email = normalizeEmail(parsed.body.email);
  if (!email) {
    return buildJsonResponse(
      { ok: false, error: '올바른 이메일 주소를 입력해 주세요.', code: 'INVALID_EMAIL' },
      400,
      request,
      env
    );
  }

  const schedule = (promise) => {
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
    } else {
      void promise;
    }
  };

  if (env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function') {
    await unsubscribeInD1(env.NEWSLETTER_DB, email);
    schedule(forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, true));
    schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'd1' }, env, fetchImpl));
    return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
  }

  if (env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function') {
    await unsubscribeInKv(env.NEWSLETTER_KV, email);
    schedule(forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, true));
    schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'kv' }, env, fetchImpl));
    return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
  }

  await forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, true);
  schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'upstream' }, env, fetchImpl));
  return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
}

async function proxyApiRequest(request, env, fetchImpl) {
  const incomingUrl = new URL(request.url);
  const upstreamOrigin = resolveUpstreamOrigin(env);
  const targetUrl = `${upstreamOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const forwardHeaders = new Headers();
  for (const name of ['accept', 'authorization', 'content-type', 'cookie', 'x-demo-mode', 'x-profile-key']) {
    const val = request.headers.get(name);
    if (val) forwardHeaders.set(name, val);
  }

  const init = {
    method: request.method,
    headers: forwardHeaders,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstreamRes = await fetchWithTimeout(fetchImpl, targetUrl, init, UPSTREAM_TIMEOUT_MS);
    const respHeaders = new Headers(upstreamRes.headers);
    respHeaders.set('Cache-Control', 'no-store');
    const corsOrigin = resolveCorsOrigin(request, env);
    if (corsOrigin) {
      respHeaders.set('Access-Control-Allow-Origin', corsOrigin);
      respHeaders.set('Vary', 'Origin');
    }
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: respHeaders,
    });
  } catch {
    return buildJsonResponse(
      { ok: false, error: '업스트림 API에 연결할 수 없습니다.', code: 'UPSTREAM_UNAVAILABLE' },
      503,
      request,
      env
    );
  }
}

export function createWorkerHandler(fetchImpl = fetch) {
  return {
    /**
     * @param {Request} request
     * @param {Record<string, any>} [env]
     * @param {{ waitUntil?: (promise: Promise<unknown>) => void } | null} [ctx]
     */
    async fetch(request, env = {}, ctx = null) {
      const url = new URL(request.url);

      if (url.pathname.startsWith('/api/')) {
        if (request.method === 'OPTIONS') {
          return buildJsonResponse({}, 204, request, env);
        }

        if (url.pathname === '/api/newsletter/health' && request.method === 'GET') {
          const storage =
            env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function'
              ? 'd1'
              : env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function'
                ? 'kv'
                : 'upstream';
          return buildJsonResponse(
            {
              ok: true,
              service: 'ainvtry-edge-newsletter',
              storage,
              emailConfigured: Boolean(String(env?.RESEND_API_KEY || '').trim()),
              webhookConfigured: Boolean(resolveSafeHttpsUrl(env?.NEWSLETTER_WEBHOOK_URL)),
            },
            200,
            request,
            env
          );
        }

        if (url.pathname === '/api/newsletter/subscribe' && request.method === 'POST') {
          return handleNewsletterSubscribe(request, env, ctx, fetchImpl);
        }

        if (url.pathname === '/api/newsletter/unsubscribe' && request.method === 'POST') {
          return handleNewsletterUnsubscribe(request, env, ctx, fetchImpl);
        }

        return proxyApiRequest(request, env, fetchImpl);
      }

      if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return env.ASSETS.fetch(request);
      }
      return new Response('Not Found', { status: 404 });
    },
  };
}

export default createWorkerHandler();
