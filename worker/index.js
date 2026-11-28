/**
 * worker/index.js
 * ---------------------------------------------------------------------------
 * Cloudflare Worker Edge API + Static Assets Router for https://ainvtry.com
 *
 * - Serves static site assets directly via Cloudflare Static Assets (`run_worker_first: ["/api/*"]`).
 * - Enforces real email ownership verification (Double Opt-In: 6-digit OTP + one-click magic link)
 *   across all 3 deployment tiers:
 *     1) Cloudflare D1 (`env.NEWSLETTER_DB`) when bound (stateful edge SQL)
 *     2) Cloudflare KV (`env.NEWSLETTER_KV`) when bound (stateful edge KV)
 *     3) Zero-config Default:
 *        - If `env.RESEND_API_KEY` is configured on Cloudflare: HMAC-SHA256 signed stateless
 *          verification challenge (`challengeToken` + one-click `nlv1.*` link) + Resend delivery
 *          + optional HMAC-signed mirror to Render SQLite (`env.NEWSLETTER_SYNC_SECRET`).
 *        - If `env.RESEND_API_KEY` is configured on Render instead: transparent cold-start-tolerant
 *          proxy of `/api/newsletter/{subscribe,verify,resend,unsubscribe}` to Render Express.
 * - Never leaks verification codes or allows unverified addresses into `subscribed` status.
 * - Dispatches non-blocking Resend welcome/founder emails and SSRF-safe webhook alerts AFTER
 *   verification succeeds via `ctx.waitUntil`.
 */

import {
  buildForbiddenScraperResponse,
  buildRemovedSitemapResponse,
  handleInvestorApiRoute,
  handleProtectedIrRoute,
  isAuthorizedBrowserBundleFetch,
  isBlockedAiScraper,
  isInvestorDeckPath,
  isJsBundleAssetPath,
  resetInvestorShieldForTests,
} from './investorShield.js';

export { isAuthorizedBrowserBundleFetch, isBlockedAiScraper };

const DEFAULT_UPSTREAM_ORIGIN = 'https://ainventory-api.onrender.com';
const DEFAULT_SITE_ORIGIN = 'https://ainvtry.com';
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
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_FAILS = 5;
const UPSTREAM_TIMEOUT_MS = 26_000;
const NOTIFY_TIMEOUT_MS = 8_000;
const KV_INDEX_KEY = 'newsletter:index:v1';
const KV_SUB_PREFIX = 'newsletter:sub:';

const rateBuckets = new Map();
const resendCooldowns = new Map();
const edgeVerifyFails = new Map();
const consumedEdgeNonces = new Map();
const initializedD1Instances = new WeakSet();

export function resetWorkerRateLimitsForTests() {
  rateBuckets.clear();
  resendCooldowns.clear();
  edgeVerifyFails.clear();
  consumedEdgeNonces.clear();
  resetInvestorShieldForTests();
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

function resolveSiteOrigin(env) {
  const candidate = resolveSafeHttpsUrl(env?.SITE_PUBLIC_ORIGIN || DEFAULT_SITE_ORIGIN);
  if (!candidate) return DEFAULT_SITE_ORIGIN;
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

/* ==========================================================================
 * WebCrypto Security Primitives (SHA-256, HMAC-SHA256, CSPRNG OTP/Token)
 * ========================================================================== */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(b64u) {
  const padded = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return textDecoder.decode(bytes);
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(input)));
  return bytesToHex(new Uint8Array(buf));
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(String(message)));
  return bytesToHex(new Uint8Array(sig));
}

function generateSixDigitCode() {
  // Rejection sampling for uniform [0, 900000) + 100000 => [100000, 999999]
  const limit = Math.floor(0x100000000 / 900000) * 900000;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return String(100000 + (buf[0] % 900000));
    }
  }
}

function generateRandomHex(byteLen = 24) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashNewsletterSecret(email, rawSecret) {
  return sha256Hex(`ainvtry-nl-v1:${email}:${String(rawSecret || '').trim()}`);
}

function resolveSigningSecret(env) {
  return String(env?.NEWSLETTER_SIGNING_SECRET || env?.RESEND_API_KEY || '').trim();
}

async function signEdgeToken(prefix, payload, secret) {
  const encoded = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const sig = await hmacHex(secret, `${prefix}.${encoded}`);
  return `${prefix}.${encoded}.${sig}`;
}

async function verifyEdgeToken(prefix, rawToken, secret) {
  if (typeof rawToken !== 'string' || !secret) return null;
  const parts = rawToken.trim().split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig || encoded.length > 2048 || sig.length !== 64) return null;
  const expected = await hmacHex(secret, `${prefix}.${encoded}`);
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecodeToString(encoded));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function checkEdgeRateLimit(key, maxRequests = RATE_MAX_REQUESTS, now = Date.now()) {
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
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function checkResendCooldown(email, now = Date.now()) {
  const sentAt = resendCooldowns.get(email);
  if (sentAt && now - sentAt < RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (now - sentAt)) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function markResendCooldown(email, now = Date.now()) {
  resendCooldowns.set(email, now);
  if (resendCooldowns.size > 2000) {
    for (const [k, v] of resendCooldowns.entries()) {
      if (now - v >= RESEND_COOLDOWN_MS) resendCooldowns.delete(k);
    }
  }
}

function parseIsoMs(raw) {
  if (!raw) return 0;
  const str = String(raw).trim();
  const iso = str.includes('T') ? str : `${str.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
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
 * Edge Email Delivery (Verification Email + Verified Welcome/Founder/Webhook)
 * ========================================================================== */

async function sendEdgeVerificationEmail({ email, lang, code, verifyUrl }, env, fetchImpl) {
  const resendKey = String(env?.RESEND_API_KEY || '').trim();
  if (!resendKey) {
    return { sent: false, configured: false };
  }
  const fromEmail = String(env?.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim() || DEFAULT_FROM_EMAIL;
  const replyTo =
    String(env?.NEWSLETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL).trim() || DEFAULT_NOTIFY_EMAIL;
  const isEn = lang === 'en';
  const safeEmail = escapeHtml(email);
  const safeUrl = escapeHtml(verifyUrl);
  const spacedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  const payload = {
    from: fromEmail,
    to: [email],
    reply_to: replyTo,
    subject: isEn ? `[iNVTRY] Your verification code: ${code}` : `[iNVTRY] 이메일 인증코드: ${code}`,
    text: isEn
      ? `Verify your iNVTRY newsletter email (${email}).\n6-digit code: ${code} (valid 10 min)\nOr click: ${verifyUrl}`
      : `iNVTRY 뉴스레터 이메일 인증 (${email})\n6자리 인증코드: ${code} (10분 유효)\n또는 원클릭 인증: ${verifyUrl}`,
    html: `<div style="background:#09090b;color:#f5f5f7;padding:28px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;border-radius:14px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;color:#d6b889;font-weight:700;">iNVTRY · EMAIL VERIFICATION</p>
      <h1 style="margin:0 0 10px;font-size:19px;">${isEn ? 'Confirm your email address' : '이메일 주소를 인증해 주세요'}</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d1d1d6;">${
        isEn
          ? `Enter this 6-digit code on ainvtry.com or click the button below to confirm <strong>${safeEmail}</strong>.`
          : `<strong>${safeEmail}</strong> 주소가 본인의 이메일이 맞는지 확인하기 위해 아래 6자리 인증코드를 입력하거나 버튼을 눌러 주세요.`
      }</p>
      <div style="margin:0 0 16px;padding:16px;background:#18181d;border:1px solid rgba(214,184,137,0.34);border-radius:12px;text-align:center;">
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:0.18em;color:#f5f5f7;">${spacedCode}</div>
      </div>
      <div style="text-align:center;margin-bottom:14px;">
        <a href="${safeUrl}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#f5f5f7;color:#101013;font-size:13px;font-weight:650;text-decoration:none;">${
          isEn ? 'Verify Email in One Click' : '원클릭으로 이메일 인증 완료'
        }</a>
      </div>
      <p style="margin:0;font-size:12px;color:#8e8e93;">${
        isEn ? 'Valid for 10 minutes. Ignore if you did not request this.' : '10분간 유효합니다. 본인이 요청하지 않으셨다면 무시해 주세요.'
      }</p>
    </div>`,
  };

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
    return { sent: res.ok, configured: true, status: res.status };
  } catch {
    return { sent: false, configured: true, status: 0 };
  }
}

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
            : '[iNVTRY] 이메일 인증 및 뉴스레터 구독이 완료되었습니다',
          text: isEn
            ? `Your email (${event.email}) is verified and subscribed to the iNVTRY newsletter. Unsubscribe anytime at https://ainvtry.com.`
            : `${event.email} 이메일 인증 및 iNVTRY 뉴스레터 구독이 완료되었습니다. 언제든 https://ainvtry.com 에서 수신 거부할 수 있습니다.`,
          html: `<div style="background:#09090b;color:#f5f5f7;padding:28px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;border-radius:14px;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;color:#d6b889;font-weight:700;">iNVTRY · NEWSLETTER</p>
            <h1 style="margin:0 0 12px;font-size:19px;">${
              isEn ? 'Email verified & subscribed.' : '이메일 인증 및 구독이 완료되었습니다.'
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
      const actionLabel = event.resubscribed ? '인증 재구독' : '인증 신규 구독';
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
        : `[iNVTRY Newsletter] ${event.resubscribed ? '인증 재구독' : '인증 신규 구독'}: ${event.email} (${event.lang} · ${event.source})`;
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
                verified: event.type === 'subscribed',
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
 * Optional Edge Storage Drivers (Cloudflare D1 & Cloudflare KV)
 * ========================================================================== */

async function ensureD1NewsletterTable(db) {
  if (initializedD1Instances.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         email TEXT UNIQUE NOT NULL,
         lang TEXT NOT NULL DEFAULT 'ko',
         source TEXT NOT NULL DEFAULT 'site_about',
         status TEXT NOT NULL DEFAULT 'pending',
         consent_at TEXT NOT NULL DEFAULT (datetime('now')),
         verified_at TEXT DEFAULT NULL,
         verification_code_hash TEXT DEFAULT NULL,
         verification_token_hash TEXT DEFAULT NULL,
         verification_expires_at TEXT DEFAULT NULL,
         verification_sent_at TEXT DEFAULT NULL,
         verification_fail_count INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         unsubscribed_at TEXT DEFAULT NULL
       )`
    )
    .run();
  initializedD1Instances.add(db);
}

async function startD1Verification(db, { email, lang, source }) {
  await ensureD1NewsletterTable(db);
  const existing = await db
    .prepare('SELECT id, status, verification_sent_at FROM newsletter_subscribers WHERE email = ?')
    .bind(email)
    .first();

  if (existing && existing.status === 'subscribed') {
    await db
      .prepare("UPDATE newsletter_subscribers SET lang = ?, source = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(lang, source, existing.id)
      .run();
    return { alreadySubscribed: true };
  }

  if (existing && existing.verification_sent_at) {
    const elapsed = Date.now() - parseIsoMs(existing.verification_sent_at);
    if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
      return {
        cooldown: true,
        retryAfterSec: Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)),
      };
    }
  }

  return { existing, alreadySubscribed: false, cooldown: false };
}

async function saveD1PendingChallenge(db, existing, { email, lang, source, codeHash, tokenHash, nowIso, expiresIso }) {
  if (existing) {
    await db
      .prepare(
        `UPDATE newsletter_subscribers
         SET status = 'pending', lang = ?, source = ?, consent_at = datetime('now'),
             verification_code_hash = ?, verification_token_hash = ?,
             verification_expires_at = ?, verification_sent_at = ?,
             verification_fail_count = 0, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(lang, source, codeHash, tokenHash, expiresIso, nowIso, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO newsletter_subscribers (
           email, lang, source, status,
           verification_code_hash, verification_token_hash,
           verification_expires_at, verification_sent_at, verification_fail_count
         ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 0)`
      )
      .bind(email, lang, source, codeHash, tokenHash, expiresIso, nowIso)
      .run();
  }
}

async function verifyInD1(db, { email, code, token }) {
  await ensureD1NewsletterTable(db);
  const row = await db
    .prepare(
      `SELECT id, lang, source, status, unsubscribed_at,
              verification_code_hash, verification_token_hash,
              verification_expires_at, verification_fail_count
       FROM newsletter_subscribers WHERE email = ?`
    )
    .bind(email)
    .first();

  if (!row) return { ok: false, status: 400, code: 'NO_PENDING_VERIFICATION' };
  if (row.status === 'subscribed') return { ok: true, alreadySubscribed: true, lang: row.lang, source: row.source };
  if (row.status !== 'pending' || (!row.verification_code_hash && !row.verification_token_hash)) {
    return { ok: false, status: 400, code: 'NO_PENDING_VERIFICATION' };
  }

  const expiresMs = parseIsoMs(row.verification_expires_at);
  if (!expiresMs || Date.now() > expiresMs) {
    await db
      .prepare("UPDATE newsletter_subscribers SET verification_code_hash = NULL, verification_token_hash = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run();
    return { ok: false, status: 400, code: 'OTP_EXPIRED' };
  }

  const fails = Number(row.verification_fail_count || 0);
  if (fails >= MAX_VERIFY_FAILS) {
    return { ok: false, status: 429, code: 'OTP_ATTEMPTS_EXCEEDED', remainingAttempts: 0 };
  }

  const codeMatched =
    Boolean(code) &&
    Boolean(row.verification_code_hash) &&
    timingSafeEqual(row.verification_code_hash, await hashNewsletterSecret(email, code));
  const tokenMatched =
    Boolean(token) &&
    Boolean(row.verification_token_hash) &&
    timingSafeEqual(row.verification_token_hash, await hashNewsletterSecret(email, token));

  if (!codeMatched && !tokenMatched) {
    const nextFails = fails + 1;
    if (nextFails >= MAX_VERIFY_FAILS) {
      await db
        .prepare("UPDATE newsletter_subscribers SET verification_fail_count = ?, verification_code_hash = NULL, verification_token_hash = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(nextFails, row.id)
        .run();
      return { ok: false, status: 429, code: 'OTP_ATTEMPTS_EXCEEDED', remainingAttempts: 0 };
    }
    await db
      .prepare("UPDATE newsletter_subscribers SET verification_fail_count = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(nextFails, row.id)
      .run();
    return { ok: false, status: 400, code: 'INVALID_CODE', remainingAttempts: MAX_VERIFY_FAILS - nextFails };
  }

  await db
    .prepare(
      `UPDATE newsletter_subscribers
       SET status = 'subscribed', verified_at = datetime('now'), consent_at = datetime('now'),
           unsubscribed_at = NULL, verification_code_hash = NULL, verification_token_hash = NULL,
           verification_expires_at = NULL, verification_fail_count = 0, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(row.id)
    .run();

  return {
    ok: true,
    alreadySubscribed: false,
    resubscribed: Boolean(row.unsubscribed_at),
    lang: row.lang || 'ko',
    source: row.source || 'site_modal',
  };
}

async function unsubscribeInD1(db, email) {
  await ensureD1NewsletterTable(db);
  await db
    .prepare(
      "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now'), verification_code_hash = NULL, verification_token_hash = NULL, updated_at = datetime('now') WHERE email = ?"
    )
    .bind(email)
    .run();
}

async function checkKvBeforeChallenge(kv, email) {
  const raw = await kv.get(`${KV_SUB_PREFIX}${email}`, 'json');
  if (raw && raw.status === 'subscribed') return { alreadySubscribed: true, raw };
  if (raw && raw.verification_sent_at) {
    const elapsed = Date.now() - parseIsoMs(raw.verification_sent_at);
    if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
      return {
        cooldown: true,
        retryAfterSec: Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)),
        raw,
      };
    }
  }
  return { alreadySubscribed: false, cooldown: false, raw };
}

async function saveKvPendingChallenge(kv, existing, { email, lang, source, codeHash, tokenHash, nowIso, expiresIso }) {
  const key = `${KV_SUB_PREFIX}${email}`;
  const record = {
    ...(existing || {}),
    email,
    lang,
    source,
    status: 'pending',
    consent_at: nowIso,
    created_at: existing?.created_at || nowIso,
    updated_at: nowIso,
    verification_code_hash: codeHash,
    verification_token_hash: tokenHash,
    verification_expires_at: expiresIso,
    verification_sent_at: nowIso,
    verification_fail_count: 0,
  };
  await kv.put(key, JSON.stringify(record));
}

async function verifyInKv(kv, { email, code, token }) {
  const key = `${KV_SUB_PREFIX}${email}`;
  const raw = await kv.get(key, 'json');
  if (!raw) return { ok: false, status: 400, code: 'NO_PENDING_VERIFICATION' };
  if (raw.status === 'subscribed') {
    return { ok: true, alreadySubscribed: true, lang: raw.lang || 'ko', source: raw.source || 'site_modal' };
  }
  if (raw.status !== 'pending' || (!raw.verification_code_hash && !raw.verification_token_hash)) {
    return { ok: false, status: 400, code: 'NO_PENDING_VERIFICATION' };
  }

  const expiresMs = parseIsoMs(raw.verification_expires_at);
  if (!expiresMs || Date.now() > expiresMs) {
    await kv.put(
      key,
      JSON.stringify({ ...raw, verification_code_hash: null, verification_token_hash: null, updated_at: new Date().toISOString() })
    );
    return { ok: false, status: 400, code: 'OTP_EXPIRED' };
  }

  const fails = Number(raw.verification_fail_count || 0);
  if (fails >= MAX_VERIFY_FAILS) {
    return { ok: false, status: 429, code: 'OTP_ATTEMPTS_EXCEEDED', remainingAttempts: 0 };
  }

  const codeMatched =
    Boolean(code) &&
    Boolean(raw.verification_code_hash) &&
    timingSafeEqual(raw.verification_code_hash, await hashNewsletterSecret(email, code));
  const tokenMatched =
    Boolean(token) &&
    Boolean(raw.verification_token_hash) &&
    timingSafeEqual(raw.verification_token_hash, await hashNewsletterSecret(email, token));

  if (!codeMatched && !tokenMatched) {
    const nextFails = fails + 1;
    const exhausted = nextFails >= MAX_VERIFY_FAILS;
    await kv.put(
      key,
      JSON.stringify({
        ...raw,
        verification_fail_count: nextFails,
        verification_code_hash: exhausted ? null : raw.verification_code_hash,
        verification_token_hash: exhausted ? null : raw.verification_token_hash,
        updated_at: new Date().toISOString(),
      })
    );
    return {
      ok: false,
      status: exhausted ? 429 : 400,
      code: exhausted ? 'OTP_ATTEMPTS_EXCEEDED' : 'INVALID_CODE',
      remainingAttempts: Math.max(0, MAX_VERIFY_FAILS - nextFails),
    };
  }

  const now = new Date().toISOString();
  const wasResubscribed = Boolean(raw.unsubscribed_at);
  await kv.put(
    key,
    JSON.stringify({
      ...raw,
      status: 'subscribed',
      verified_at: now,
      consent_at: now,
      unsubscribed_at: null,
      verification_code_hash: null,
      verification_token_hash: null,
      verification_expires_at: null,
      verification_fail_count: 0,
      updated_at: now,
    })
  );
  try {
    const rawIdx = (await kv.get(KV_INDEX_KEY, 'json')) || [];
    const list = Array.isArray(rawIdx) ? rawIdx.filter((e) => e !== email) : [];
    list.unshift(email);
    await kv.put(KV_INDEX_KEY, JSON.stringify(list.slice(0, 1000)));
  } catch {
    // Non-fatal
  }
  return {
    ok: true,
    alreadySubscribed: false,
    resubscribed: wasResubscribed,
    lang: raw.lang || 'ko',
    source: raw.source || 'site_modal',
  };
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
      verification_code_hash: null,
      verification_token_hash: null,
      updated_at: now,
    })
  );
}

/* ==========================================================================
 * Upstream Render Express Proxy & Optional HMAC-Signed Verified Mirror
 * ========================================================================== */

async function forwardNewsletterToUpstream(pathSuffix, payload, env, fetchImpl, extraHeaders = {}) {
  const upstreamOrigin = resolveUpstreamOrigin(env);
  const url = `${upstreamOrigin}/api/newsletter/${pathSuffix}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };

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
      return { ok: res.ok, status: res.status, data };
    } catch {
      lastStatus = 504;
    }
  }
  return { ok: false, status: lastStatus, data: null };
}

async function mirrorVerifiedToUpstream({ email, lang, source }, env, fetchImpl) {
  const syncSecret = String(env?.NEWSLETTER_SYNC_SECRET || '').trim();
  if (syncSecret.length < 16) return;
  const ts = String(Date.now());
  const sig = await hmacHex(syncSecret, `${ts}:${email}:subscribed`);
  await forwardNewsletterToUpstream(
    'sync-verified',
    { email, lang, source },
    env,
    fetchImpl,
    {
      'X-Newsletter-Sync-Ts': ts,
      'X-Newsletter-Sync-Signature': sig,
    }
  );
}

/* ==========================================================================
 * Edge Newsletter Route Handlers (Subscribe / Resend / Verify / Unsubscribe)
 * ========================================================================== */

async function handleNewsletterSubscribeOrResend(request, env, _ctx, fetchImpl, isResend) {
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
  if (!isResend && typeof body.website === 'string' && body.website.trim().length > 0) {
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

  if (!isResend && body.consent !== true) {
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
  const hasEdgeResend = Boolean(String(env?.RESEND_API_KEY || '').trim());
  const hasD1 = Boolean(env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function');
  const hasKv = Boolean(env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function');

  // If Edge has Resend configured (with D1, KV, or stateless HMAC challenge), own verification at the edge!
  if (hasD1 || hasKv || hasEdgeResend) {
    if (!hasEdgeResend) {
      return buildJsonResponse(
        {
          ok: false,
          error: '이메일 인증 발송 서비스(RESEND_API_KEY)가 아직 설정되지 않았습니다.',
          code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
        },
        503,
        request,
        env
      );
    }

    const emailRate = checkEdgeRateLimit(`otp:${email}`, 5);
    if (!emailRate.allowed) {
      return buildJsonResponse(
        {
          ok: false,
          error: '인증 메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
          code: 'RATE_LIMITED',
          retryAfterSec: emailRate.retryAfterSec,
        },
        429,
        request,
        env,
        { 'Retry-After': String(emailRate.retryAfterSec) }
      );
    }

    const code = generateSixDigitCode();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresMs = nowMs + OTP_TTL_MS;
    const expiresIso = new Date(expiresMs).toISOString();
    const siteOrigin = resolveSiteOrigin(env);

    // Tier 1: Cloudflare D1
    if (hasD1) {
      const check = await startD1Verification(env.NEWSLETTER_DB, {
        email,
        lang,
        source,
      });
      if (check.alreadySubscribed) {
        return buildJsonResponse({ ok: true, status: 'already_subscribed', email, storage: 'd1' }, 200, request, env);
      }
      if (check.cooldown) {
        return buildJsonResponse(
          {
            ok: false,
            error: `인증코드를 방금 발송했습니다. ${check.retryAfterSec}초 후에 다시 요청해 주세요.`,
            code: 'RESEND_COOLDOWN',
            retryAfterSec: check.retryAfterSec,
          },
          429,
          request,
          env,
          { 'Retry-After': String(check.retryAfterSec) }
        );
      }

      const rawToken = generateRandomHex(24);
      const verifyUrl = `${siteOrigin}/?nl_verify=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;
      const mail = await sendEdgeVerificationEmail({ email, lang, code, verifyUrl }, env, fetchImpl);
      if (!mail.sent) {
        return buildJsonResponse(
          { ok: false, error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'EMAIL_SEND_FAILED' },
          502,
          request,
          env
        );
      }

      const [codeHash, tokenHash] = await Promise.all([
        hashNewsletterSecret(email, code),
        hashNewsletterSecret(email, rawToken),
      ]);
      await saveD1PendingChallenge(env.NEWSLETTER_DB, check.existing, {
        email,
        lang,
        source,
        codeHash,
        tokenHash,
        nowIso,
        expiresIso,
      });

      return buildJsonResponse(
        {
          ok: true,
          status: 'pending_verification',
          email,
          expiresInSec: Math.floor(OTP_TTL_MS / 1000),
          cooldownSec: Math.floor(RESEND_COOLDOWN_MS / 1000),
          storage: 'd1',
          delivery: 'email',
        },
        202,
        request,
        env
      );
    }

    // Tier 2: Cloudflare KV
    if (hasKv) {
      const check = await checkKvBeforeChallenge(env.NEWSLETTER_KV, email);
      if (check.alreadySubscribed) {
        return buildJsonResponse({ ok: true, status: 'already_subscribed', email, storage: 'kv' }, 200, request, env);
      }
      if (check.cooldown) {
        return buildJsonResponse(
          {
            ok: false,
            error: `인증코드를 방금 발송했습니다. ${check.retryAfterSec}초 후에 다시 요청해 주세요.`,
            code: 'RESEND_COOLDOWN',
            retryAfterSec: check.retryAfterSec,
          },
          429,
          request,
          env,
          { 'Retry-After': String(check.retryAfterSec) }
        );
      }

      const rawToken = generateRandomHex(24);
      const verifyUrl = `${siteOrigin}/?nl_verify=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;
      const mail = await sendEdgeVerificationEmail({ email, lang, code, verifyUrl }, env, fetchImpl);
      if (!mail.sent) {
        return buildJsonResponse(
          { ok: false, error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'EMAIL_SEND_FAILED' },
          502,
          request,
          env
        );
      }

      const [codeHash, tokenHash] = await Promise.all([
        hashNewsletterSecret(email, code),
        hashNewsletterSecret(email, rawToken),
      ]);
      await saveKvPendingChallenge(env.NEWSLETTER_KV, check.raw, {
        email,
        lang,
        source,
        codeHash,
        tokenHash,
        nowIso,
        expiresIso,
      });

      return buildJsonResponse(
        {
          ok: true,
          status: 'pending_verification',
          email,
          expiresInSec: Math.floor(OTP_TTL_MS / 1000),
          cooldownSec: Math.floor(RESEND_COOLDOWN_MS / 1000),
          storage: 'kv',
          delivery: 'email',
        },
        202,
        request,
        env
      );
    }

    // Tier 3A: Edge HMAC-SHA256 Signed Verification Challenge (Zero DB binding required!)
    const cooldown = checkResendCooldown(email, nowMs);
    if (!cooldown.allowed) {
      return buildJsonResponse(
        {
          ok: false,
          error: `인증코드를 방금 발송했습니다. ${cooldown.retryAfterSec}초 후에 다시 요청해 주세요.`,
          code: 'RESEND_COOLDOWN',
          retryAfterSec: cooldown.retryAfterSec,
        },
        429,
        request,
        env,
        { 'Retry-After': String(cooldown.retryAfterSec) }
      );
    }

    const secret = resolveSigningSecret(env);
    const nonce = generateRandomHex(12);
    const saltedCodeHash = await sha256Hex(`${email}:${code}:${nonce}`);
    const [challengeToken, linkToken] = await Promise.all([
      signEdgeToken('nlc1', { e: email, l: lang, s: source, n: nonce, exp: expiresMs, h: saltedCodeHash }, secret),
      signEdgeToken('nlv1', { e: email, l: lang, s: source, n: nonce, exp: expiresMs, m: 'link' }, secret),
    ]);

    const verifyUrl = `${siteOrigin}/?nl_verify=${encodeURIComponent(linkToken)}&email=${encodeURIComponent(email)}`;
    const mail = await sendEdgeVerificationEmail({ email, lang, code, verifyUrl }, env, fetchImpl);
    if (!mail.sent) {
      return buildJsonResponse(
        { ok: false, error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: 'EMAIL_SEND_FAILED' },
        502,
        request,
        env
      );
    }

    markResendCooldown(email, nowMs);
    edgeVerifyFails.delete(nonce);

    return buildJsonResponse(
      {
        ok: true,
        status: 'pending_verification',
        email,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        cooldownSec: Math.floor(RESEND_COOLDOWN_MS / 1000),
        challengeToken,
        storage: 'edge_hmac',
        delivery: 'email',
      },
      202,
      request,
      env
    );
  }

  // Tier 3B: Transparent proxy to Render Express backend (when RESEND_API_KEY lives on Render)
  const upstream = await forwardNewsletterToUpstream(
    isResend ? 'resend' : 'subscribe',
    isResend ? { email, lang, source } : { email, consent: true, lang, source },
    env,
    fetchImpl
  );

  if (upstream.data) {
    return buildJsonResponse(
      { ...upstream.data, storage: upstream.data.storage || 'upstream' },
      upstream.status,
      request,
      env
    );
  }

  return buildJsonResponse(
    {
      ok: false,
      error: '구독 인증 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      code: 'UPSTREAM_UNAVAILABLE',
    },
    503,
    request,
    env
  );
}

async function handleNewsletterVerify(request, env, ctx, fetchImpl) {
  const clientIp = String(request.headers.get('cf-connecting-ip') || 'edge').slice(0, 64);
  const ipRate = checkEdgeRateLimit(`verify:${clientIp}`, RATE_MAX_REQUESTS * 2);
  if (!ipRate.allowed) {
    return buildJsonResponse(
      {
        ok: false,
        error: '인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      },
      429,
      request,
      env,
      { 'Retry-After': String(ipRate.retryAfterSec) }
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
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '').trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken.trim() : '';

  if (!email) {
    return buildJsonResponse(
      { ok: false, error: '올바른 이메일 주소를 입력해 주세요.', code: 'INVALID_EMAIL' },
      400,
      request,
      env
    );
  }

  if (!/^\d{6}$/.test(code) && !token) {
    return buildJsonResponse(
      { ok: false, error: '6자리 인증코드 또는 인증 링크가 필요합니다.', code: 'INVALID_CODE' },
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

  const hasD1 = Boolean(env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function');
  const hasKv = Boolean(env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function');

  // Tier 1: Cloudflare D1
  if (hasD1) {
    const result = await verifyInD1(env.NEWSLETTER_DB, { email, code, token });
    if (!result.ok) {
      return buildJsonResponse(
        {
          ok: false,
          code: result.code,
          remainingAttempts: result.remainingAttempts,
          error:
            result.code === 'OTP_EXPIRED'
              ? '인증 유효시간(10분)이 만료되었습니다. 인증코드를 다시 요청해 주세요.'
              : result.code === 'OTP_ATTEMPTS_EXCEEDED'
                ? '인증 시도 횟수를 초과했습니다. 인증코드를 다시 발송해 주세요.'
                : result.code === 'NO_PENDING_VERIFICATION'
                  ? '진행 중인 이메일 인증 내역이 없습니다.'
                  : '인증코드가 일치하지 않습니다.',
        },
        result.status,
        request,
        env
      );
    }
    if (!result.alreadySubscribed) {
      schedule(
        dispatchEdgeNotifications(
          {
            type: 'subscribed',
            email,
            lang: result.lang,
            source: result.source,
            resubscribed: Boolean(result.resubscribed),
            storage: 'd1',
          },
          env,
          fetchImpl
        )
      );
      schedule(mirrorVerifiedToUpstream({ email, lang: result.lang, source: result.source }, env, fetchImpl));
    }
    return buildJsonResponse(
      {
        ok: true,
        status: result.alreadySubscribed ? 'already_subscribed' : 'subscribed',
        verified: true,
        resubscribed: result.resubscribed || undefined,
        email,
        storage: 'd1',
      },
      200,
      request,
      env
    );
  }

  // Tier 2: Cloudflare KV
  if (hasKv) {
    const result = await verifyInKv(env.NEWSLETTER_KV, { email, code, token });
    if (!result.ok) {
      return buildJsonResponse(
        {
          ok: false,
          code: result.code,
          remainingAttempts: result.remainingAttempts,
          error:
            result.code === 'OTP_EXPIRED'
              ? '인증 유효시간(10분)이 만료되었습니다. 인증코드를 다시 요청해 주세요.'
              : result.code === 'OTP_ATTEMPTS_EXCEEDED'
                ? '인증 시도 횟수를 초과했습니다. 인증코드를 다시 발송해 주세요.'
                : result.code === 'NO_PENDING_VERIFICATION'
                  ? '진행 중인 이메일 인증 내역이 없습니다.'
                  : '인증코드가 일치하지 않습니다.',
        },
        result.status,
        request,
        env
      );
    }
    if (!result.alreadySubscribed) {
      schedule(
        dispatchEdgeNotifications(
          {
            type: 'subscribed',
            email,
            lang: result.lang,
            source: result.source,
            resubscribed: Boolean(result.resubscribed),
            storage: 'kv',
          },
          env,
          fetchImpl
        )
      );
      schedule(mirrorVerifiedToUpstream({ email, lang: result.lang, source: result.source }, env, fetchImpl));
    }
    return buildJsonResponse(
      {
        ok: true,
        status: result.alreadySubscribed ? 'already_subscribed' : 'subscribed',
        verified: true,
        resubscribed: result.resubscribed || undefined,
        email,
        storage: 'kv',
      },
      200,
      request,
      env
    );
  }

  // Tier 3A: Edge HMAC-SHA256 Signed Verification (when verified using nlv1.* link or nlc1.* challengeToken)
  const secret = resolveSigningSecret(env);
  if (secret && (token.startsWith('nlv1.') || challengeToken.startsWith('nlc1.'))) {
    let verifiedPayload = null;
    if (token.startsWith('nlv1.')) {
      const p = await verifyEdgeToken('nlv1', token, secret);
      if (!p || p.e !== email || p.m !== 'link') {
        return buildJsonResponse(
          { ok: false, error: '유효하지 않은 인증 링크입니다.', code: 'INVALID_CODE' },
          400,
          request,
          env
        );
      }
      if (!Number.isFinite(p.exp) || Date.now() > p.exp) {
        return buildJsonResponse(
          { ok: false, error: '인증 유효시간(10분)이 만료되었습니다. 다시 요청해 주세요.', code: 'OTP_EXPIRED' },
          400,
          request,
          env
        );
      }
      verifiedPayload = p;
    } else {
      const p = await verifyEdgeToken('nlc1', challengeToken, secret);
      if (!p || p.e !== email || !p.h || !p.n) {
        return buildJsonResponse(
          { ok: false, error: '인증 세션이 유효하지 않습니다. 인증코드를 다시 요청해 주세요.', code: 'NO_PENDING_VERIFICATION' },
          400,
          request,
          env
        );
      }
      if (!Number.isFinite(p.exp) || Date.now() > p.exp) {
        return buildJsonResponse(
          { ok: false, error: '인증 유효시간(10분)이 만료되었습니다. 인증코드를 다시 요청해 주세요.', code: 'OTP_EXPIRED' },
          400,
          request,
          env
        );
      }
      const fails = Number(edgeVerifyFails.get(p.n) || 0);
      if (fails >= MAX_VERIFY_FAILS) {
        return buildJsonResponse(
          { ok: false, error: '인증 시도 횟수를 초과했습니다. 인증코드를 다시 발송해 주세요.', code: 'OTP_ATTEMPTS_EXCEEDED', remainingAttempts: 0 },
          429,
          request,
          env
        );
      }
      const candidateHash = await sha256Hex(`${email}:${code}:${p.n}`);
      if (!timingSafeEqual(p.h, candidateHash)) {
        const nextFails = fails + 1;
        edgeVerifyFails.set(p.n, nextFails);
        const exhausted = nextFails >= MAX_VERIFY_FAILS;
        return buildJsonResponse(
          {
            ok: false,
            code: exhausted ? 'OTP_ATTEMPTS_EXCEEDED' : 'INVALID_CODE',
            remainingAttempts: Math.max(0, MAX_VERIFY_FAILS - nextFails),
            error: exhausted
              ? '인증 시도 횟수를 초과했습니다. 인증코드를 다시 발송해 주세요.'
              : `인증코드가 일치하지 않습니다. (남은 시도 ${Math.max(0, MAX_VERIFY_FAILS - nextFails)}회)`,
          },
          exhausted ? 429 : 400,
          request,
          env
        );
      }
      verifiedPayload = p;
    }

    const nonce = String(verifiedPayload.n || '');
    const alreadyConsumed = nonce && consumedEdgeNonces.has(nonce);
    if (nonce) {
      consumedEdgeNonces.set(nonce, Date.now());
      edgeVerifyFails.delete(nonce);
    }
    const lang = verifiedPayload.l === 'en' ? 'en' : 'ko';
    const source = ALLOWED_SOURCES.has(verifiedPayload.s) ? verifiedPayload.s : 'site_modal';

    if (!alreadyConsumed) {
      schedule(
        dispatchEdgeNotifications(
          { type: 'subscribed', email, lang, source, resubscribed: false, storage: 'edge_hmac' },
          env,
          fetchImpl
        )
      );
      schedule(mirrorVerifiedToUpstream({ email, lang, source }, env, fetchImpl));
    }

    return buildJsonResponse(
      {
        ok: true,
        status: alreadyConsumed ? 'already_subscribed' : 'subscribed',
        verified: true,
        email,
        storage: 'edge_hmac',
      },
      200,
      request,
      env
    );
  }

  // Tier 3B: Transparent proxy to Render Express backend
  const upstream = await forwardNewsletterToUpstream(
    'verify',
    { email, code: code || undefined, token: token || undefined },
    env,
    fetchImpl
  );
  if (upstream.data) {
    return buildJsonResponse(
      { ...upstream.data, storage: upstream.data.storage || 'upstream' },
      upstream.status,
      request,
      env
    );
  }

  return buildJsonResponse(
    {
      ok: false,
      error: '인증 확인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
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
    schedule(forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, { 'X-Newsletter-Notify-Handled': '1' }));
    schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'd1' }, env, fetchImpl));
    return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
  }

  if (env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function') {
    await unsubscribeInKv(env.NEWSLETTER_KV, email);
    schedule(forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, { 'X-Newsletter-Notify-Handled': '1' }));
    schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'kv' }, env, fetchImpl));
    return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
  }

  await forwardNewsletterToUpstream('unsubscribe', { email }, env, fetchImpl, { 'X-Newsletter-Notify-Handled': '1' });
  schedule(dispatchEdgeNotifications({ type: 'unsubscribed', email, storage: 'upstream' }, env, fetchImpl));
  return buildJsonResponse({ ok: true, status: 'unsubscribed' }, 200, request, env);
}

const APP_FULL_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob: https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://accounts.google.com/gsi/",
  "connect-src 'self' blob: data: https://accounts.google.com/gsi/ https://api.open-meteo.com https://appleid.apple.com https://staticimgly.com https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function copyMultiSetCookieHeaders(sourceHeaders, targetHeaders) {
  if (typeof sourceHeaders?.getSetCookie !== 'function') return;
  const cookies = sourceHeaders.getSetCookie();
  if (!Array.isArray(cookies) || cookies.length <= 1) return;
  targetHeaders.delete('set-cookie');
  for (const cookie of cookies) {
    targetHeaders.append('set-cookie', cookie);
  }
}

function buildForwardedProxyHeaders(request, incomingUrl, allowedNames) {
  const forwardHeaders = new Headers();
  for (const name of allowedNames) {
    const val = request.headers.get(name);
    if (val) forwardHeaders.set(name, val);
  }
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    '';
  if (clientIp) {
    forwardHeaders.set('x-forwarded-for', clientIp);
  }
  forwardHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', '') || 'https');
  forwardHeaders.set('x-forwarded-host', incomingUrl.host);
  return forwardHeaders;
}

async function proxyApiRequest(request, env, fetchImpl) {
  const incomingUrl = new URL(request.url);
  const upstreamOrigin = resolveUpstreamOrigin(env);
  const targetUrl = `${upstreamOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const forwardHeaders = buildForwardedProxyHeaders(request, incomingUrl, [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'cookie',
    'origin',
    'user-agent',
    'x-demo-mode',
    'x-profile-key',
  ]);

  const init = {
    method: request.method,
    headers: forwardHeaders,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstreamRes = await fetchWithTimeout(fetchImpl, targetUrl, init, UPSTREAM_TIMEOUT_MS);
    const respHeaders = new Headers(upstreamRes.headers);
    copyMultiSetCookieHeaders(upstreamRes.headers, respHeaders);
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

async function proxyUploadsRequest(request, env, fetchImpl) {
  if (request.method === 'OPTIONS') {
    return buildJsonResponse({}, 204, request, env);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const incomingUrl = new URL(request.url);
  const upstreamOrigin = resolveUpstreamOrigin(env);
  const targetUrl = `${upstreamOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const forwardHeaders = buildForwardedProxyHeaders(request, incomingUrl, [
    'accept',
    'authorization',
    'cookie',
    'if-none-match',
    'if-modified-since',
    'user-agent',
  ]);

  try {
    const upstreamRes = await fetchWithTimeout(
      fetchImpl,
      targetUrl,
      {
        method: request.method,
        headers: forwardHeaders,
        redirect: 'manual',
      },
      UPSTREAM_TIMEOUT_MS
    );
    const respHeaders = new Headers(upstreamRes.headers);
    respHeaders.set('Content-Security-Policy', "default-src 'none'; sandbox");
    respHeaders.set('X-Content-Type-Options', 'nosniff');
    respHeaders.set('X-Robots-Tag', 'noindex, nofollow, noai, noimageai');
    if (!respHeaders.get('cache-control')) {
      respHeaders.set('Cache-Control', 'private, max-age=300');
    }
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: respHeaders,
    });
  } catch {
    return new Response('Upstream image storage unavailable', { status: 503 });
  }
}

function isFullAppSpaPath(pathname) {
  if (pathname === '/app' || pathname === '/app/') return true;
  if (!pathname.startsWith('/app/')) return false;
  return !/\.[a-zA-Z0-9]{2,8}$/.test(pathname);
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

      // Canonicalize www.ainvtry.com/app* -> https://ainvtry.com/app* so OAuth cookies & redirect_uri stay single-origin
      if (
        url.hostname.toLowerCase() === 'www.ainvtry.com' &&
        (url.pathname === '/app' || url.pathname.startsWith('/app/'))
      ) {
        return new Response(null, {
          status: 301,
          headers: {
            Location: `https://ainvtry.com${url.pathname}${url.search}`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      if (url.pathname === '/sitemap.xml' || url.pathname === '/sitemap_index.xml') {
        return buildRemovedSitemapResponse();
      }

      if (url.pathname.startsWith('/api/')) {
        if (request.method === 'OPTIONS') {
          return buildJsonResponse({}, 204, request, env);
        }

        if (url.pathname.startsWith('/api/investor/')) {
          return handleInvestorApiRoute(request, url, env, ctx, fetchImpl, {
            buildJsonResponse,
            readJsonBody,
            sha256Hex,
            timingSafeEqual,
            signEdgeToken,
            verifyEdgeToken,
            resolveSafeHttpsUrl,
            fetchWithTimeout,
          });
        }

        if (url.pathname === '/api/newsletter/health' && request.method === 'GET') {
          const storage =
            env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function'
              ? 'd1'
              : env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function'
                ? 'kv'
                : String(env?.RESEND_API_KEY || '').trim()
                  ? 'edge_hmac'
                  : 'upstream';
          return buildJsonResponse(
            {
              ok: true,
              service: 'ainvtry-edge-newsletter',
              storage,
              verificationRequired: true,
              emailConfigured: Boolean(String(env?.RESEND_API_KEY || '').trim()),
              webhookConfigured: Boolean(resolveSafeHttpsUrl(env?.NEWSLETTER_WEBHOOK_URL)),
            },
            200,
            request,
            env
          );
        }

        if (url.pathname === '/api/newsletter/subscribe' && request.method === 'POST') {
          return handleNewsletterSubscribeOrResend(request, env, ctx, fetchImpl, false);
        }

        if (url.pathname === '/api/newsletter/resend' && request.method === 'POST') {
          return handleNewsletterSubscribeOrResend(request, env, ctx, fetchImpl, true);
        }

        if (url.pathname === '/api/newsletter/verify' && request.method === 'POST') {
          return handleNewsletterVerify(request, env, ctx, fetchImpl);
        }

        if (url.pathname === '/api/newsletter/unsubscribe' && request.method === 'POST') {
          return handleNewsletterUnsubscribe(request, env, ctx, fetchImpl);
        }

        return proxyApiRequest(request, env, fetchImpl);
      }

      if (url.pathname.startsWith('/uploads/')) {
        return proxyUploadsRequest(request, env, fetchImpl);
      }

      if (isInvestorDeckPath(url.pathname)) {
        return handleProtectedIrRoute(request, url, env, { sha256Hex, verifyEdgeToken }, ctx);
      }

      if (isBlockedAiScraper(request.headers.get('user-agent'))) {
        return buildForbiddenScraperResponse();
      }

      const isJsBundle = isJsBundleAssetPath(url.pathname);
      if (isJsBundle && !isAuthorizedBrowserBundleFetch(request)) {
        return buildForbiddenScraperResponse();
      }

      if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
        if (isFullAppSpaPath(url.pathname)) {
          // Request `/app/` directly from Static Assets to avoid Cloudflare auto-trailing-slash 307 redirect loops
          const appShellRequest = new Request(
            new URL(`/app/${url.search}`, url.origin),
            request
          );
          const appAssetRes = await env.ASSETS.fetch(appShellRequest);
          const headers = new Headers(appAssetRes.headers);
          headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          headers.set('X-Frame-Options', 'DENY');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
          headers.set('Content-Security-Policy', APP_FULL_CSP);
          headers.set('X-Content-Type-Options', 'nosniff');
          headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          headers.set('X-Robots-Tag', 'noindex, nofollow, noai, noimageai');
          headers.set('Vary', 'User-Agent');
          return new Response(appAssetRes.body, {
            status: appAssetRes.status,
            statusText: appAssetRes.statusText,
            headers,
          });
        }

        const isMinigameEntry =
          url.pathname === '/minigame' ||
          url.pathname === '/minigame/' ||
          url.pathname === '/minigame/index.html';
        // Cloudflare Static Assets (auto-trailing-slash) 307-redirects `/minigame/index.html`
        // back to `/minigame/`. Request `/minigame/` directly so both `/minigame` and `/minigame/`
        // return 200 OK with zero redirect loops.
        const assetRequest =
          url.pathname === '/minigame'
            ? new Request(new URL(`/minigame/${url.search}`, url.origin), request)
            : request;
        const assetRes = await env.ASSETS.fetch(assetRequest);
        if (isJsBundle || isMinigameEntry || url.pathname === '/' || url.pathname === '/index.html') {
          const headers = new Headers(assetRes.headers);
          headers.set(
            'X-Robots-Tag',
            isJsBundle ? 'noindex, noai, noimageai' : 'noai, noimageai'
          );
          headers.set(
            'Vary',
            isJsBundle ? 'User-Agent, Sec-Fetch-Site, Sec-Fetch-Dest, Referer' : 'User-Agent'
          );
          return new Response(assetRes.body, {
            status: assetRes.status,
            statusText: assetRes.statusText,
            headers,
          });
        }
        return assetRes;
      }
      return new Response('Not Found', { status: 404 });
    },
  };
}

export default createWorkerHandler();
