/**
 * worker/investorShield.js
 * ---------------------------------------------------------------------------
 * Edge Anti-Scraper Shield & Investor Data-Room Passcode Gate for ainvtry.com.
 *
 * Security invariants:
 * - Zero hardcoded passcodes or secrets; reads `env.IR_ACCESS_PASSCODE` at runtime.
 * - Fails closed when `env.IR_ACCESS_PASSCODE` is unset (never serves /ir/* or brief publicly).
 * - Uses SHA-256 pre-hashing + constant-time comparison so passcode lengths cannot leak.
 * - Mints HMAC-SHA256 signed `HttpOnly; Secure; SameSite=Lax` session cookies (12h TTL).
 * - Blocks known AI crawlers & direct non-browser JS bundle scrapers with HTTP 403.
 */

const IR_COOKIE_NAME = 'invtry_ir_session';
const IR_TOKEN_PREFIX = 'irv1';
const IR_SESSION_TTL_SEC = 12 * 60 * 60;
const IR_FAIL_WINDOW_MS = 10 * 60 * 1000;
const IR_MAX_UNLOCK_FAILS = 5;
const NOTIFY_TIMEOUT_MS = 8_000;
const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'iNVTRY <newsletter@ainvtry.com>';
const DEFAULT_NOTIFY_EMAIL = 'raymond@ainvtry.com';

const AI_SCRAPER_UA_RE =
  /\b(?:GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|Applebot-Extended|CCBot|Bytespider|Diffbot|Meta-ExternalAgent|Meta-ExternalFetcher|cohere-ai|Amazonbot|YouBot|Omgilibot|AI2Bot|DuckAssistBot|MistralAI-User|Firecrawl|Scrapy|python-requests|python-urllib|httpx|aiohttp|Go-http-client|libwww-perl)\b|curl\/|wget\//i;

const JS_BUNDLE_PATH_RE = /^\/assets\/[^/]+\.(?:m?js)$/i;

const irUnlockFailBuckets = new Map();

export function resetInvestorShieldForTests() {
  irUnlockFailBuckets.clear();
}

export function isBlockedAiScraper(userAgent) {
  return AI_SCRAPER_UA_RE.test(String(userAgent || ''));
}

export function isJsBundleAssetPath(pathname) {
  return JS_BUNDLE_PATH_RE.test(String(pathname || ''));
}

export function isInvestorDeckPath(pathname) {
  const clean = String(pathname || '');
  return clean === '/ir' || clean.startsWith('/ir/');
}

export function isAuthorizedBrowserBundleFetch(request) {
  const secFetchSite = String(request.headers.get('sec-fetch-site') || '')
    .trim()
    .toLowerCase();
  const secFetchDest = String(request.headers.get('sec-fetch-dest') || '')
    .trim()
    .toLowerCase();

  if (
    secFetchSite === 'same-origin' &&
    (secFetchDest === 'script' ||
      secFetchDest === 'worker' ||
      secFetchDest === 'sharedworker' ||
      secFetchDest === 'empty')
  ) {
    return true;
  }

  const referer = String(request.headers.get('referer') || '').trim();
  if (!referer) return false;

  try {
    const refOrigin = new URL(referer).origin;
    const reqOrigin = new URL(request.url).origin;
    if (
      refOrigin === reqOrigin ||
      refOrigin === 'https://ainvtry.com' ||
      refOrigin === 'https://www.ainvtry.com' ||
      refOrigin.startsWith('http://localhost:') ||
      refOrigin.startsWith('http://127.0.0.1:')
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function buildForbiddenScraperResponse() {
  return new Response('Forbidden', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noai, noimageai',
      Vary: 'User-Agent, Sec-Fetch-Site, Sec-Fetch-Dest, Referer',
    },
  });
}

export function buildRemovedSitemapResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noai, noimageai',
    },
  });
}

function parseCookieHeader(rawCookie) {
  const cookies = new Map();
  const str = String(rawCookie || '');
  if (!str) return cookies;
  for (const part of str.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) cookies.set(key, val);
  }
  return cookies;
}

function resolveInvestorPasscode(env) {
  return String(env?.IR_ACCESS_PASSCODE || '').trim();
}

async function resolveInvestorSessionSecret(env, sha256Hex) {
  const explicit = String(env?.IR_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const passcode = resolveInvestorPasscode(env);
  if (!passcode) return '';
  return sha256Hex(`ainvtry-ir-session-key-v1:${passcode}`);
}

async function verifyPasscodeConstantTime(candidate, expected, sha256Hex, timingSafeEqual) {
  const cleanCandidate = String(candidate || '').trim();
  const cleanExpected = String(expected || '').trim();
  if (!cleanCandidate || !cleanExpected) return false;
  const [leftHash, rightHash] = await Promise.all([
    sha256Hex(`ainvtry-ir-pass-v1:${cleanCandidate}`),
    sha256Hex(`ainvtry-ir-pass-v1:${cleanExpected}`),
  ]);
  return timingSafeEqual(leftHash, rightHash);
}

function getUnlockFailState(ipKey, now = Date.now()) {
  const entry = irUnlockFailBuckets.get(ipKey);
  if (!entry || now >= entry.resetAt) {
    irUnlockFailBuckets.delete(ipKey);
    return { count: 0, blocked: false, retryAfterSec: 0 };
  }
  const blocked = entry.count >= IR_MAX_UNLOCK_FAILS;
  return {
    count: entry.count,
    blocked,
    retryAfterSec: blocked ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0,
  };
}

function recordUnlockFailure(ipKey, now = Date.now()) {
  const entry = irUnlockFailBuckets.get(ipKey);
  if (!entry || now >= entry.resetAt) {
    const next = { count: 1, resetAt: now + IR_FAIL_WINDOW_MS };
    irUnlockFailBuckets.set(ipKey, next);
    if (irUnlockFailBuckets.size > 2000) {
      for (const [k, v] of irUnlockFailBuckets.entries()) {
        if (now >= v.resetAt) irUnlockFailBuckets.delete(k);
      }
    }
    return next.count;
  }
  entry.count += 1;
  return entry.count;
}

function buildInvestorCookieHeader(token, maxAgeSec, isSecure) {
  const parts = [
    `${IR_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecure) parts.splice(3, 0, 'Secure');
  return parts.join('; ');
}

export async function verifyInvestorSession(request, env, cryptoDeps) {
  const passcode = resolveInvestorPasscode(env);
  if (!passcode) {
    return { authenticated: false, configured: false, label: '' };
  }

  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const rawToken = cookies.get(IR_COOKIE_NAME);
  if (!rawToken) {
    return { authenticated: false, configured: true, label: '' };
  }

  const sessionSecret = await resolveInvestorSessionSecret(env, cryptoDeps.sha256Hex);
  const payload = await cryptoDeps.verifyEdgeToken(IR_TOKEN_PREFIX, rawToken, sessionSecret);
  if (!payload || payload.v !== 1 || Number(payload.exp || 0) <= Date.now()) {
    return { authenticated: false, configured: true, label: '' };
  }

  return {
    authenticated: true,
    configured: true,
    label: String(payload.lb || '').slice(0, 64),
  };
}

const CONFIDENTIAL_INVESTOR_BRIEF = {
  en: {
    revenueNote: 'Confidential Investor Brief · Freemium acquisition to compounding multi-stream LTV',
    revenuePillars: [
      {
        id: 'pro',
        icon: 'crown',
        num: '01',
        title: 'iNVTRY Pro Subscription',
        mechanism: 'ARR · ₩6.9–9.9K/mo',
        detail:
          'Unlimited 4+ layer 8-angle VTON, real Street View staging, CPW & idle asset analytics, tag OCR & bleed alerts, plus 20% annual discount.',
      },
      {
        id: 'affiliate',
        icon: 'shoppingBag',
        num: '02',
        title: 'Gap Commerce',
        mechanism: 'CPS · 5–12%',
        detail:
          'AI detects the single missing garment in your closet, verifies fit against owned layers, and links to partner stores (Musinsa, 29CM, D2C) to cut returns.',
      },
      {
        id: 'resale-bm',
        icon: 'badgeCheck',
        num: '03',
        title: 'Authentic Resale & Care O2O',
        mechanism: 'GMV · 3–8%',
        detail:
          '90+ day idle detection bundles existing cutout photos, receipts & wear history for 1-tap authentic resale alongside doorstep laundry pickup.',
      },
      {
        id: 'b2b-sdk',
        icon: 'server',
        num: '04',
        title: 'Brand VTON SDK',
        mechanism: 'B2B · SaaS + CPC',
        detail:
          'Onboards boutique and designer collections as digital garment seeds and embeds try-on widgets to lower brand return costs (2027 H2+).',
      },
    ],
    businessModel: {
      eyebrow: 'INVESTOR DATA ROOM · UNIT ECONOMICS',
      headline: 'Subscription × Gap Commerce × Authentic Resale × B2B SDK',
      funnelTitle: 'Conversion & Lock-In Flywheel',
      funnelSteps: [
        { step: '01', label: 'Free Acquisition', value: '₩0 WASM' },
        { step: '02', label: '20-Item Closet', value: 'Data Lock-in' },
        { step: '03', label: 'Pro + Gap Buy', value: 'ARR + CPS' },
        { step: '04', label: '1-Tap Resale', value: 'Pays Annual Sub' },
      ],
      costTitle: '3-Layer AI Cost Defense',
      marginValue: '70%+',
      marginLabel: 'Target Margin',
      costDefenses: [
        {
          title: 'On-Device WASM Inference',
          metric: '₩0 Server GPU',
          detail: 'Garment cutout, EXIF strip & skin-tone analysis run locally on client devices.',
        },
        {
          title: 'WebP -96% Bandwidth Cut',
          metric: '582→24 KB',
          detail: 'Cuts storage & AI payload bandwidth by 96% with local IndexedDB caching.',
        },
        {
          title: 'Outfit Hash Cache & Quotas',
          metric: '0 Re-Inference',
          detail: 'Reuses cached 8-angle outfit renders across revisits with disciplined Free quotas.',
        },
      ],
      footnote:
        '* Confidential investor preview. Final pricing and 3-year P&L lock after private beta cohort metrics.',
    },
  },
  ko: {
    revenueNote: '투자자 전용 상세 지표 · 무료 유입에서 복합 LTV로 전환되는 순환 수익 구조',
    revenuePillars: [
      {
        id: 'pro',
        icon: 'crown',
        num: '01',
        title: 'iNVTRY Pro 구독',
        mechanism: 'ARR · ₩6.9~9.9K/월',
        detail:
          '무제한 4겹+ 8방향 가상 피팅, 거리뷰 무대, 1회 착용 비용(CPW) · 휴면 자산 리포트, 택 OCR · 이염 경고를 제공하며 연간 결제 시 20% 할인을 적용합니다.',
      },
      {
        id: 'affiliate',
        icon: 'shoppingBag',
        num: '02',
        title: '갭(Gap) 커머스',
        mechanism: 'CPS · 5~12%',
        detail:
          '보유 옷장에 없는 공백 1벌을 기존 의류와 AI 사전 조합 검증한 뒤 제휴 몰(무신사 · 29CM · 자사몰)로 연결해 중복 구매와 반품률을 동시에 낮춥니다.',
      },
      {
        id: 'resale-bm',
        icon: 'badgeCheck',
        num: '03',
        title: '인증 리셀 · 세탁 O2O',
        mechanism: 'GMV · 3~8%',
        detail:
          '90일+ 장기 휴면 의류를 자동 감지해 보유 배경 제거 사진 · 영수증 · 착용 이력을 묶은 1탭 정품 인증 리셀과 문 앞 비대면 세탁 방문수거를 연결합니다.',
      },
      {
        id: 'b2b-sdk',
        icon: 'server',
        num: '04',
        title: '브랜드 VTON SDK',
        mechanism: 'B2B · 월정액+CPC',
        detail:
          '편집숍 · 디자이너 브랜드 신상을 디지털 시드로 입점하고 가상 피팅 위젯을 공급해 브랜드의 온라인 반품 원가를 절감합니다 (2027 H2+).',
      },
    ],
    businessModel: {
      eyebrow: 'INVESTOR DATA ROOM · UNIT ECONOMICS',
      headline: '구독 × 갭 커머스 × 인증 리셀 × B2B 4중 수익 엔진',
      funnelTitle: '무료 유입 → 복합 LTV 전환 구조',
      funnelSteps: [
        { step: '01', label: '무료 유입', value: '₩0 WASM' },
        { step: '02', label: '옷장 20벌', value: '데이터 Lock-in' },
        { step: '03', label: 'Pro · 갭 구매', value: 'ARR + CPS' },
        { step: '04', label: '1벌 리셀', value: '연 구독 회수' },
      ],
      costTitle: 'AI 3중 원가 방어 메커니즘',
      marginValue: '70%+',
      marginLabel: '목표 총이익률',
      costDefenses: [
        {
          title: '온디바이스 WASM 추론',
          metric: '서버 GPU ₩0',
          detail: '의류 배경 제거 · EXIF 제거 · 피부톤 분석을 클라이언트에서 처리해 사용자 비례 적자를 차단합니다.',
        },
        {
          title: 'WebP -96% 대역폭 절감',
          metric: '582→24 KB',
          detail: '원본 대비 96% 경량화와 IndexedDB 로컬 캐시로 저장 · AI 전송 비용을 최소화합니다.',
        },
        {
          title: '착장 해시 캐시 · 쿼터 제어',
          metric: '중복 추론 0',
          detail: '동일 착장 재조회 시 기존 8방향 결과를 재활용하고 Free 월 쿼터로 원가를 방어합니다.',
        },
      ],
      footnote:
        '* 투자자 전용 기밀 브리프입니다. 요금 [TBD] 및 3개년 손익은 프라이빗 베타 실측 코호트 반영 후 확정 예정.',
    },
  },
};

function isGoogleLabel(label) {
  return /\bgoogle\b/i.test(String(label || ''));
}

async function recordInvestorAccessLog(
  { event, label, country, path, ipHash, userAgent, timestamp },
  env
) {
  const safeLabel = String(label || 'Anonymous').slice(0, 64);
  const safeCountry = String(country || 'Unknown').slice(0, 16);
  const safePath = String(path || '/ir/').slice(0, 120);
  const safeIpHash = String(ipHash || '').slice(0, 24);
  const safeUa = String(userAgent || '').slice(0, 180);
  const googleReviewer = isGoogleLabel(safeLabel);

  const entry = {
    event,
    label: safeLabel,
    googleReviewer,
    country: safeCountry,
    path: safePath,
    ipHash: safeIpHash,
    userAgent: safeUa,
    timestamp,
  };

  if (event === 'investor.unlock_failed') {
    console.warn(JSON.stringify(entry));
  } else {
    console.info(JSON.stringify(entry));
  }

  // Persist to Cloudflare D1 when bound
  if (env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function') {
    try {
      await env.NEWSLETTER_DB.prepare(
        `CREATE TABLE IF NOT EXISTS investor_access_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event TEXT NOT NULL,
          label TEXT NOT NULL,
          google_reviewer INTEGER NOT NULL DEFAULT 0,
          country TEXT NOT NULL,
          path TEXT NOT NULL,
          ip_hash TEXT NOT NULL,
          user_agent TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      ).run();
      await env.NEWSLETTER_DB.prepare(
        `INSERT INTO investor_access_logs (event, label, google_reviewer, country, path, ip_hash, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          event,
          safeLabel,
          googleReviewer ? 1 : 0,
          safeCountry,
          safePath,
          safeIpHash,
          safeUa,
          timestamp
        )
        .run();
    } catch {
      // Non-fatal: logging failure must never block IR access
    }
  }

  // Persist rolling recent-100 list to Cloudflare KV when bound
  if (
    env?.NEWSLETTER_KV &&
    typeof env.NEWSLETTER_KV.get === 'function' &&
    typeof env.NEWSLETTER_KV.put === 'function'
  ) {
    try {
      const raw = await env.NEWSLETTER_KV.get('ir_logs:recent');
      const existing = raw ? JSON.parse(raw) : [];
      const next = [entry, ...(Array.isArray(existing) ? existing : [])].slice(0, 100);
      await env.NEWSLETTER_KV.put('ir_logs:recent', JSON.stringify(next));
    } catch {
      // Non-fatal
    }
  }
}

async function notifyFounderInvestorAccess(
  { label, country, path, ipHash, userAgent },
  env,
  fetchImpl,
  resolveSafeHttpsUrl,
  fetchWithTimeout
) {
  const resendKey = String(env?.RESEND_API_KEY || '').trim();
  const fromEmail = String(env?.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim() || DEFAULT_FROM_EMAIL;
  const notifyEmail =
    String(env?.NEWSLETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL).trim() || DEFAULT_NOTIFY_EMAIL;
  const webhookUrl = resolveSafeHttpsUrl(env?.NEWSLETTER_WEBHOOK_URL);
  const webhookSecret = String(env?.NEWSLETTER_WEBHOOK_SECRET || '').trim();

  const who = label || 'Passcode Verified (No label)';
  const googleReviewer = isGoogleLabel(who);
  const region = country || 'Unknown';
  const timestamp = new Date().toISOString();
  const prefix = googleReviewer ? '[GOOGLE REVIEWER] ' : '';
  const text = `${prefix}[iNVTRY IR Data Room] 열람 인증 완료 — ${who} (${region}) · ${path} · ${timestamp}${userAgent ? ` · UA: ${String(userAgent).slice(0, 120)}` : ''}`;

  const tasks = [
    recordInvestorAccessLog(
      {
        event: 'investor.data_room_unlocked',
        label: who,
        country: region,
        path,
        ipHash,
        userAgent,
        timestamp,
      },
      env
    ),
  ];

  if (resendKey) {
    tasks.push(
      fetchWithTimeout(
        fetchImpl,
        RESEND_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [notifyEmail],
            subject: `${prefix}[iNVTRY IR Access] ${who} (${region})`,
            text,
          }),
        },
        NOTIFY_TIMEOUT_MS
      ).catch(() => {})
    );
  }

  if (webhookUrl) {
    const headers = { 'Content-Type': 'application/json' };
    if (webhookSecret) headers['X-Ainvtry-Webhook-Secret'] = webhookSecret;
    tasks.push(
      fetchWithTimeout(
        fetchImpl,
        webhookUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event: 'investor.data_room_unlocked',
            label: who,
            googleReviewer,
            country: region,
            path,
            ipHash,
            timestamp,
            text,
            content: text,
          }),
        },
        NOTIFY_TIMEOUT_MS
      ).catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
}

export function renderInvestorGateHtml({ lang = 'ko', theme = 'light', configured = true }) {
  const isEn = lang === 'en';
  const isLight = theme === 'light';
  const bg = isLight ? '#f5f5f7' : '#09090b';
  const surface = isLight ? '#ffffff' : '#121216';
  const ink = isLight ? '#111114' : '#f5f5f7';
  const muted = isLight ? '#52525b' : '#a1a1aa';
  const hairline = isLight ? 'rgba(17,17,20,0.12)' : 'rgba(255,255,255,0.12)';
  const inputBg = isLight ? '#f4f4f6' : '#18181e';
  const btnBg = isLight ? '#111114' : '#f5f5f7';
  const btnFg = isLight ? '#ffffff' : '#09090b';
  const gold = isLight ? '#8a6b38' : '#d6b889';

  const title = isEn ? 'iNVTRY — Private Investor Data Room' : 'iNVTRY — 투자자 전용 데이터룸';
  const heading = isEn ? 'Investor Data Room' : '투자자 전용 사업계획서';
  const subtitle = configured
    ? isEn
      ? 'This 14-slide Business Plan (+ 5-slide Appendix, 19 slides total) is restricted to invited investors and partners. Enter your access passcode to unlock for 12 hours.'
      : '본 사업계획서(본문 14장 · 부록 5장, 총 19장)는 초대된 투자자 · 파트너 전용 자료입니다. 전달받으신 접근 코드를 입력하시면 12시간 동안 열람하실 수 있습니다.'
    : isEn
      ? 'This 14-slide Business Plan (+ 5-slide Appendix) is shared privately by direct founder invitation. Request an access passcode via email below.'
      : '본 사업계획서(본문 14장 · 부록 5장)는 창업자 직접 초대를 통해서만 열람하실 수 있습니다. 아래 이메일로 열람 코드를 요청해 주세요.';
  const privacyNotice = isEn
    ? 'Viewer name and organization are collected solely to verify invitations and log data-room access, and are never shared with third parties.'
    : '입력하신 성함과 소속은 초대 확인 및 데이터룸 열람 기록 목적으로만 수집되며 외부에 제공되지 않습니다.';

  const formHtml = configured
    ? `<form id="ir-gate-form" novalidate>
        <label class="field-label" for="ir-passcode">${isEn ? 'Access Passcode' : '접근 코드'}</label>
        <input id="ir-passcode" name="passcode" type="password" autocomplete="one-time-code" required placeholder="${isEn ? 'Enter investor passcode' : '투자자 접근 코드를 입력하세요'}" />
        <label class="field-label" for="ir-label">${isEn ? 'Name / Organization (Optional)' : '성함 / 소속 (선택)'}</label>
        <input id="ir-label" name="label" type="text" maxlength="64" autocomplete="organization" placeholder="${isEn ? 'e.g. Kim · Partner VC' : '예: 홍길동 · ○○벤처스'}" />
        <p class="privacy-note">${privacyNotice}</p>
        <p id="ir-gate-error" class="error-msg" role="alert" aria-live="polite"></p>
        <button id="ir-gate-submit" type="submit" class="btn-primary">${isEn ? 'Unlock Business Plan' : '사업계획서 열람하기'}</button>
      </form>`
    : '';

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'ko'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noai, noimageai" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: ${bg};
      color: ${ink};
      font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      width: 100%;
      max-width: 420px;
      padding: 32px 28px;
      border-radius: 20px;
      background: ${surface};
      border: 1px solid ${hairline};
      box-shadow: 0 24px 64px rgba(0, 0, 0, ${isLight ? '0.08' : '0.45'});
    }
    .kicker {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${gold};
      margin: 0 0 10px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .sub {
      margin: 0 0 24px;
      font-size: 13.5px;
      line-height: 1.6;
      color: ${muted};
    }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 6px;
      color: ${muted};
    }
    input {
      width: 100%;
      height: 44px;
      padding: 0 14px;
      margin: 0 0 14px;
      border-radius: 12px;
      border: 1px solid ${hairline};
      background: ${inputBg};
      color: ${ink};
      font-size: 14px;
      outline: none;
    }
    input:focus {
      border-color: ${gold};
    }
    .btn-primary {
      width: 100%;
      height: 46px;
      margin-top: 4px;
      border: none;
      border-radius: 999px;
      background: ${btnBg};
      color: ${btnFg};
      font-size: 14px;
      font-weight: 650;
      cursor: pointer;
    }
    .btn-primary:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    .privacy-note {
      margin: -6px 0 12px;
      font-size: 11.5px;
      line-height: 1.5;
      color: ${muted};
    }
    .error-msg {
      min-height: 18px;
      margin: 0 0 10px;
      font-size: 12.5px;
      color: #ef4444;
    }
    .footer-links {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid ${hairline};
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 12.5px;
    }
    .footer-links a {
      color: ${muted};
      text-decoration: none;
    }
    .footer-links a.accent {
      color: ${gold};
      font-weight: 600;
    }
    .footer-links a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <main class="card">
    <p class="kicker">iNVTRY · CONFIDENTIAL</p>
    <h1>${heading}</h1>
    <p class="sub">${subtitle}</p>
    ${formHtml}
    <div class="footer-links">
      <a href="/">${isEn ? '← Back to ainvtry.com' : '← ainvtry.com으로 돌아가기'}</a>
      <a class="accent" href="mailto:raymond@ainvtry.com?subject=${encodeURIComponent('iNVTRY Investor Data Room Access Request')}">${isEn ? 'Request Passcode' : '열람 코드 요청'}</a>
    </div>
  </main>
  ${
    configured
      ? `<script>
    (function () {
      var form = document.getElementById('ir-gate-form');
      var codeInput = document.getElementById('ir-passcode');
      var labelInput = document.getElementById('ir-label');
      var errEl = document.getElementById('ir-gate-error');
      var submitBtn = document.getElementById('ir-gate-submit');
      if (!form) return;
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var passcode = (codeInput.value || '').trim();
        if (!passcode) {
          errEl.textContent = ${JSON.stringify(isEn ? 'Please enter your access passcode.' : '접근 코드를 입력해 주세요.')};
          codeInput.focus();
          return;
        }
        submitBtn.disabled = true;
        try {
          var res = await fetch('/api/investor/unlock', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              passcode: passcode,
              label: (labelInput.value || '').trim(),
              path: window.location.pathname
            })
          });
          var data = await res.json().catch(function () { return {}; });
          if (res.ok && data.ok) {
            window.location.reload();
            return;
          }
          errEl.textContent = data.error || ${JSON.stringify(isEn ? 'Invalid passcode. Please check and try again.' : '접근 코드가 올바르지 않습니다.')};
          codeInput.focus();
          codeInput.select();
        } catch (_err) {
          errEl.textContent = ${JSON.stringify(isEn ? 'Network error. Please try again.' : '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')};
        } finally {
          submitBtn.disabled = false;
        }
      });
    })();
  </script>`
      : ''
  }
</body>
</html>`;
}

export async function handleInvestorApiRoute(request, url, env, ctx, fetchImpl, deps) {
  const {
    buildJsonResponse,
    readJsonBody,
    sha256Hex,
    timingSafeEqual,
    signEdgeToken,
    verifyEdgeToken,
    resolveSafeHttpsUrl,
    fetchWithTimeout,
  } = deps;

  if (isBlockedAiScraper(request.headers.get('user-agent'))) {
    return buildForbiddenScraperResponse();
  }

  const cryptoDeps = { sha256Hex, verifyEdgeToken };
  const extraNoIndex = {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noai, noimageai',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  };

  if (url.pathname === '/api/investor/status' && request.method === 'GET') {
    const session = await verifyInvestorSession(request, env, cryptoDeps);
    return buildJsonResponse(
      {
        ok: true,
        unlocked: session.authenticated,
        configured: session.configured,
      },
      200,
      request,
      env,
      extraNoIndex
    );
  }

  if (url.pathname === '/api/investor/logout' && request.method === 'POST') {
    const clearCookie = buildInvestorCookieHeader('', 0, url.protocol === 'https:');
    return buildJsonResponse(
      { ok: true, unlocked: false },
      200,
      request,
      env,
      { ...extraNoIndex, 'Set-Cookie': clearCookie }
    );
  }

  if (url.pathname === '/api/investor/unlock' && request.method === 'POST') {
    const expectedPasscode = resolveInvestorPasscode(env);
    if (!expectedPasscode) {
      return buildJsonResponse(
        {
          ok: false,
          code: 'GATE_NOT_CONFIGURED',
          error: '투자자 열람 코드는 창업자 직접 초대(raymond@ainvtry.com)로 발급됩니다.',
        },
        503,
        request,
        env,
        extraNoIndex
      );
    }

    const clientIp = String(request.headers.get('cf-connecting-ip') || 'edge').slice(0, 64);
    const failState = getUnlockFailState(clientIp);
    if (failState.blocked) {
      return buildJsonResponse(
        {
          ok: false,
          code: 'IR_RATE_LIMITED',
          retryAfterSec: failState.retryAfterSec,
          error: '인증 시도 횟수를 초과했습니다. 10분 후 다시 시도하거나 raymond@ainvtry.com으로 문의해 주세요.',
        },
        429,
        request,
        env,
        { ...extraNoIndex, 'Retry-After': String(failState.retryAfterSec) }
      );
    }

    const parsed = await readJsonBody(request);
    if (parsed.errorStatus) {
      return buildJsonResponse(
        { ok: false, code: parsed.errorCode, error: parsed.errorMessage },
        parsed.errorStatus,
        request,
        env,
        extraNoIndex
      );
    }

    const candidate = String(parsed.body.passcode || '').trim();
    const label = Array.from(String(parsed.body.label || ''))
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('')
      .trim()
      .slice(0, 64);
    const accessPath = String(parsed.body.path || '/ir/').slice(0, 120);

    const matched = await verifyPasscodeConstantTime(
      candidate,
      expectedPasscode,
      sha256Hex,
      timingSafeEqual
    );

    const country = String(request.headers.get('cf-ipcountry') || request.cf?.country || '').slice(
      0,
      16
    );
    const userAgent = String(request.headers.get('user-agent') || '').slice(0, 180);
    const ipHash = (await sha256Hex(`ainvtry-ir-ip-v1:${clientIp}`)).slice(0, 16);

    if (!matched) {
      const fails = recordUnlockFailure(clientIp);
      const remaining = Math.max(0, IR_MAX_UNLOCK_FAILS - fails);
      const failLogPromise = recordInvestorAccessLog(
        {
          event: 'investor.unlock_failed',
          label: label || 'Unverified Attempt',
          country,
          path: accessPath,
          ipHash,
          userAgent,
          timestamp: new Date().toISOString(),
        },
        env
      );
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(failLogPromise);
      } else {
        void failLogPromise;
      }
      return buildJsonResponse(
        {
          ok: false,
          code: remaining === 0 ? 'IR_RATE_LIMITED' : 'INVALID_PASSCODE',
          remainingAttempts: remaining,
          error:
            remaining === 0
              ? '인증 시도 횟수를 초과했습니다. 10분 후 다시 시도해 주세요.'
              : `접근 코드가 일치하지 않습니다. (남은 시도 ${remaining}회)`,
        },
        remaining === 0 ? 429 : 401,
        request,
        env,
        extraNoIndex
      );
    }

    irUnlockFailBuckets.delete(clientIp);
    const sessionSecret = await resolveInvestorSessionSecret(env, sha256Hex);
    const exp = Date.now() + IR_SESSION_TTL_SEC * 1000;
    const token = await signEdgeToken(IR_TOKEN_PREFIX, { v: 1, exp, lb: label }, sessionSecret);
    const cookieHeader = buildInvestorCookieHeader(
      token,
      IR_SESSION_TTL_SEC,
      url.protocol === 'https:'
    );

    const notifyPromise = notifyFounderInvestorAccess(
      { label, country, path: accessPath, ipHash, userAgent },
      env,
      fetchImpl,
      resolveSafeHttpsUrl,
      fetchWithTimeout
    );
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(notifyPromise);
    } else {
      void notifyPromise;
    }

    return buildJsonResponse(
      {
        ok: true,
        unlocked: true,
        expiresInSec: IR_SESSION_TTL_SEC,
      },
      200,
      request,
      env,
      { ...extraNoIndex, 'Set-Cookie': cookieHeader }
    );
  }

  if (url.pathname === '/api/investor/brief' && request.method === 'GET') {
    const session = await verifyInvestorSession(request, env, cryptoDeps);
    if (!session.authenticated) {
      return buildJsonResponse(
        {
          ok: false,
          code: session.configured ? 'IR_AUTH_REQUIRED' : 'GATE_NOT_CONFIGURED',
          error: '투자자 접근 코드 인증이 필요합니다.',
        },
        401,
        request,
        env,
        extraNoIndex
      );
    }

    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
    return buildJsonResponse(
      {
        ok: true,
        unlocked: true,
        lang,
        brief: CONFIDENTIAL_INVESTOR_BRIEF[lang],
      },
      200,
      request,
      env,
      { ...extraNoIndex, Vary: 'Cookie' }
    );
  }

  if (url.pathname === '/api/investor/logs' && request.method === 'GET') {
    const adminSecret = String(env?.IR_ADMIN_SECRET || env?.NEWSLETTER_SYNC_SECRET || '').trim();
    if (!adminSecret) {
      return buildJsonResponse(
        { ok: false, code: 'LOGS_ADMIN_NOT_CONFIGURED', error: 'Admin secret is not configured.' },
        503,
        request,
        env,
        extraNoIndex
      );
    }
    const authHeader = String(request.headers.get('authorization') || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const supplied = bearer || String(request.headers.get('x-investor-admin-secret') || '').trim();
    const matched = await verifyPasscodeConstantTime(
      supplied,
      adminSecret,
      sha256Hex,
      timingSafeEqual
    );
    if (!matched) {
      return buildJsonResponse(
        { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized' },
        401,
        request,
        env,
        extraNoIndex
      );
    }

    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50));
    if (env?.NEWSLETTER_DB && typeof env.NEWSLETTER_DB.prepare === 'function') {
      try {
        const res = await env.NEWSLETTER_DB.prepare(
          `SELECT id, event, label, google_reviewer, country, path, ip_hash, user_agent, created_at
           FROM investor_access_logs
           ORDER BY id DESC
           LIMIT ?`
        )
          .bind(limit)
          .all();
        return buildJsonResponse(
          { ok: true, source: 'd1', logs: Array.isArray(res?.results) ? res.results : [] },
          200,
          request,
          env,
          extraNoIndex
        );
      } catch {
        // Table may not exist yet before first access
        return buildJsonResponse({ ok: true, source: 'd1', logs: [] }, 200, request, env, extraNoIndex);
      }
    }

    if (env?.NEWSLETTER_KV && typeof env.NEWSLETTER_KV.get === 'function') {
      try {
        const raw = await env.NEWSLETTER_KV.get('ir_logs:recent');
        const list = raw ? JSON.parse(raw) : [];
        return buildJsonResponse(
          { ok: true, source: 'kv', logs: Array.isArray(list) ? list.slice(0, limit) : [] },
          200,
          request,
          env,
          extraNoIndex
        );
      } catch {
        return buildJsonResponse({ ok: true, source: 'kv', logs: [] }, 200, request, env, extraNoIndex);
      }
    }

    return buildJsonResponse(
      {
        ok: true,
        source: 'worker_logs_only',
        logs: [],
        note: 'Bind NEWSLETTER_DB or NEWSLETTER_KV to query persisted logs via API; otherwise inspect Cloudflare Workers Observability logs.',
      },
      200,
      request,
      env,
      extraNoIndex
    );
  }

  return buildJsonResponse(
    { ok: false, code: 'NOT_FOUND', error: 'Not Found' },
    404,
    request,
    env,
    extraNoIndex
  );
}

export async function handleProtectedIrRoute(request, url, env, cryptoDeps, ctx) {
  if (isBlockedAiScraper(request.headers.get('user-agent'))) {
    return buildForbiddenScraperResponse();
  }

  const session = await verifyInvestorSession(request, env, cryptoDeps);
  const privateHeaders = {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noai, noimageai',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Cookie',
  };

  if (!session.authenticated) {
    const isHtmlDoc =
      url.pathname === '/ir' ||
      url.pathname === '/ir/' ||
      url.pathname === '/ir/index.html' ||
      String(request.headers.get('accept') || '').includes('text/html');

    if (isHtmlDoc) {
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
      const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
      return new Response(
        renderInvestorGateHtml({ lang, theme, configured: session.configured }),
        {
          status: 401,
          headers: {
            ...privateHeaders,
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'DENY',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        code: session.configured ? 'IR_AUTH_REQUIRED' : 'GATE_NOT_CONFIGURED',
        error: 'Investor passcode required.',
      }),
      {
        status: 401,
        headers: {
          ...privateHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  const isHtmlDoc =
    url.pathname === '/ir' ||
    url.pathname === '/ir/' ||
    url.pathname === '/ir/index.html';
  if (isHtmlDoc && typeof cryptoDeps?.sha256Hex === 'function') {
    const clientIp = String(request.headers.get('cf-connecting-ip') || 'edge').slice(0, 64);
    const country = String(request.headers.get('cf-ipcountry') || request.cf?.country || '').slice(0, 16);
    const userAgent = String(request.headers.get('user-agent') || '').slice(0, 180);
    const viewLogPromise = cryptoDeps
      .sha256Hex(`ainvtry-ir-ip-v1:${clientIp}`)
      .then((hash) =>
        recordInvestorAccessLog(
          {
            event: 'investor.data_room_viewed',
            label: session.label || 'Authenticated Session',
            country,
            path: url.pathname,
            ipHash: hash.slice(0, 16),
            userAgent,
            timestamp: new Date().toISOString(),
          },
          env
        )
      )
      .catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(viewLogPromise);
    } else {
      void viewLogPromise;
    }
  }

  if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const assetRes = await env.ASSETS.fetch(request);
    const headers = new Headers(assetRes.headers);
    for (const [k, v] of Object.entries(privateHeaders)) {
      headers.set(k, v);
    }
    return new Response(assetRes.body, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    });
  }

  return new Response('Not Found', { status: 404, headers: privateHeaders });
}
