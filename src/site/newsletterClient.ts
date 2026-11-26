import { resolveApiRuntimeConfig } from '../utils/apiRuntimeConfig.ts';
import type { SiteLang } from './siteContent.ts';

export type NewsletterSource = 'site_footer' | 'site_about' | 'site_hero' | 'site_modal';

export interface StoredNewsletterSubscription {
  readonly email: string;
  readonly lang: SiteLang;
  readonly status: 'subscribed' | 'already_subscribed' | 'offline_saved';
  readonly subscribedAt: string;
}

export interface PendingNewsletterVerification {
  readonly email: string;
  readonly lang: SiteLang;
  readonly source: NewsletterSource;
  readonly expiresAt: number;
  readonly cooldownUntil: number;
  readonly challengeToken?: string;
  readonly devPreviewCode?: string;
}

export type NewsletterErrorCode =
  | 'INVALID_EMAIL'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'RESEND_COOLDOWN'
  | 'INVALID_CODE'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'NO_PENDING_VERIFICATION'
  | 'EMAIL_DELIVERY_NOT_CONFIGURED'
  | 'EMAIL_SEND_FAILED'
  | 'SERVER_ERROR';

export type NewsletterSubscribeResult =
  | {
      readonly ok: true;
      readonly status: 'pending_verification';
      readonly email: string;
      readonly expiresInSec: number;
      readonly cooldownSec: number;
      readonly challengeToken?: string;
      readonly devPreviewCode?: string;
      readonly storage?: string;
    }
  | {
      readonly ok: true;
      readonly status: 'subscribed' | 'already_subscribed' | 'offline_saved';
      readonly email: string;
      readonly storage?: string;
    }
  | {
      readonly ok: false;
      readonly code: NewsletterErrorCode;
      readonly error?: string;
      readonly retryAfterSec?: number;
    };

export type NewsletterVerifyResult =
  | {
      readonly ok: true;
      readonly status: 'subscribed' | 'already_subscribed';
      readonly email: string;
      readonly storage?: string;
    }
  | {
      readonly ok: false;
      readonly code: NewsletterErrorCode;
      readonly error?: string;
      readonly remainingAttempts?: number;
      readonly retryAfterSec?: number;
    };

export type NewsletterUnsubscribeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'INVALID_EMAIL' | 'RATE_LIMITED' | 'SERVER_ERROR' };

export interface NewsletterRequestOptions {
  readonly fetchImpl?: typeof fetch;
  readonly envOverride?: Record<string, string | undefined>;
  readonly hostnameOverride?: string;
  readonly timeoutMs?: number;
}

const STORAGE_KEY = 'ainvtry_newsletter_sub_v1';
const PENDING_STORAGE_KEY = 'ainvtry_newsletter_pending_v1';
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[a-z]{2,63}$/i;
const REQUEST_TIMEOUT_MS = 28_000;
const PUBLIC_PRODUCTION_API_BASE = 'https://ainventory-api.onrender.com/api';
const PUBLIC_SITE_HOSTS = new Set([
  'ainvtry.com',
  'www.ainvtry.com',
  'raymandoomoon.github.io',
]);

export function normalizeClientEmail(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  if (/[\r\n\u0000-\u001f]/.test(raw)) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || normalized.includes('..')) return null;
  if (!EMAIL_RE.test(normalized)) return null;
  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart || localPart.length > 64 || domainPart.length > 190) return null;
  return normalized;
}

export interface ResolvedNewsletterEndpoints {
  readonly subscribeUrls: readonly string[];
  readonly verifyUrls: readonly string[];
  readonly resendUrls: readonly string[];
  readonly unsubscribeUrls: readonly string[];
  readonly isStaticOnly: boolean;
}

function deriveActionUrl(subscribeUrl: string, action: 'verify' | 'resend' | 'unsubscribe'): string {
  return subscribeUrl.replace(/\/subscribe$/, `/${action}`);
}

export function resolveNewsletterEndpoints(
  envOverride?: Record<string, string | undefined>,
  hostnameOverride?: string
): ResolvedNewsletterEndpoints {
  const env = (envOverride ?? (import.meta.env as Record<string, string | undefined>)) || {};
  const hostname =
    hostnameOverride !== undefined
      ? hostnameOverride.toLowerCase()
      : typeof window !== 'undefined'
        ? String(window.location?.hostname || '').toLowerCase()
        : '';

  const customEndpoint = String(env.VITE_NEWSLETTER_ENDPOINT || '').trim();
  if (customEndpoint) {
    if (customEndpoint.startsWith('/') && !customEndpoint.startsWith('//')) {
      const clean = customEndpoint.replace(/\/+$/, '');
      return {
        subscribeUrls: [clean],
        verifyUrls: [deriveActionUrl(clean, 'verify')],
        resendUrls: [deriveActionUrl(clean, 'resend')],
        unsubscribeUrls: [deriveActionUrl(clean, 'unsubscribe')],
        isStaticOnly: false,
      };
    }
    try {
      const parsed = new URL(customEndpoint);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        const clean = parsed.toString().replace(/\/+$/, '');
        return {
          subscribeUrls: [clean],
          verifyUrls: [deriveActionUrl(clean, 'verify')],
          resendUrls: [deriveActionUrl(clean, 'resend')],
          unsubscribeUrls: [deriveActionUrl(clean, 'unsubscribe')],
          isStaticOnly: false,
        };
      }
    } catch {
      // Ignore malformed custom endpoint and fall back to runtime API base
    }
  }

  const runtime = resolveApiRuntimeConfig(env);
  const primarySubscribe = `${runtime.apiBaseUrl}/newsletter/subscribe`;
  const primaryVerify = `${runtime.apiBaseUrl}/newsletter/verify`;
  const primaryResend = `${runtime.apiBaseUrl}/newsletter/resend`;
  const primaryUnsubscribe = `${runtime.apiBaseUrl}/newsletter/unsubscribe`;
  const isPublicHosted = PUBLIC_SITE_HOSTS.has(hostname);

  const subscribeUrls: string[] = [primarySubscribe];
  const verifyUrls: string[] = [primaryVerify];
  const resendUrls: string[] = [primaryResend];
  const unsubscribeUrls: string[] = [primaryUnsubscribe];

  if (isPublicHosted && primarySubscribe.startsWith('/')) {
    subscribeUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/subscribe`);
    verifyUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/verify`);
    resendUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/resend`);
    unsubscribeUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/unsubscribe`);
  }

  return {
    subscribeUrls,
    verifyUrls,
    resendUrls,
    unsubscribeUrls,
    isStaticOnly: runtime.isStaticStandaloneWithoutApi && !isPublicHosted,
  };
}

export function readStoredNewsletterSubscription(): StoredNewsletterSubscription | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredNewsletterSubscription> | null;
    if (!parsed || typeof parsed.email !== 'string') return null;
    const validEmail = normalizeClientEmail(parsed.email);
    if (!validEmail) return null;
    const status =
      parsed.status === 'already_subscribed' || parsed.status === 'offline_saved'
        ? parsed.status
        : 'subscribed';
    return {
      email: validEmail,
      lang: parsed.lang === 'en' ? 'en' : 'ko',
      status,
      subscribedAt:
        typeof parsed.subscribedAt === 'string' ? parsed.subscribedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeStoredNewsletterSubscription(sub: StoredNewsletterSubscription): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sub));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredNewsletterSubscription(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function readPendingNewsletterVerification(): PendingNewsletterVerification | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingNewsletterVerification> | null;
    if (!parsed || typeof parsed.email !== 'string') return null;
    const email = normalizeClientEmail(parsed.email);
    if (!email) return null;
    if (typeof parsed.expiresAt !== 'number' || Date.now() >= parsed.expiresAt) {
      window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
      return null;
    }
    return {
      email,
      lang: parsed.lang === 'en' ? 'en' : 'ko',
      source:
        parsed.source === 'site_footer' ||
        parsed.source === 'site_about' ||
        parsed.source === 'site_hero' ||
        parsed.source === 'site_modal'
          ? parsed.source
          : 'site_modal',
      expiresAt: parsed.expiresAt,
      cooldownUntil: typeof parsed.cooldownUntil === 'number' ? parsed.cooldownUntil : 0,
      challengeToken: typeof parsed.challengeToken === 'string' ? parsed.challengeToken : undefined,
      devPreviewCode: typeof parsed.devPreviewCode === 'string' ? parsed.devPreviewCode : undefined,
    };
  } catch {
    return null;
  }
}

export function writePendingNewsletterVerification(pending: PendingNewsletterVerification): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Ignore sessionStorage errors
  }
}

export function clearPendingNewsletterVerification(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage errors
  }
}

interface RawNewsletterApiResponse {
  ok?: boolean;
  status?: string;
  code?: string;
  error?: string;
  email?: string;
  storage?: string;
  expiresInSec?: number;
  cooldownSec?: number;
  retryAfterSec?: number;
  remainingAttempts?: number;
  challengeToken?: string;
  devPreviewCode?: string;
}

async function postJsonWithTimeout(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<{
  readonly kind: 'json' | 'non_json' | 'network_error';
  readonly status: number;
  readonly data: RawNewsletterApiResponse | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { kind: 'non_json', status: response.status, data: null };
    }
    const data = (await response.json().catch(() => null)) as RawNewsletterApiResponse | null;
    return { kind: 'json', status: response.status, data };
  } catch {
    return { kind: 'network_error', status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

function mapServerErrorCode(rawCode: string | undefined, httpStatus: number): NewsletterErrorCode {
  switch (rawCode) {
    case 'INVALID_EMAIL':
    case 'CONSENT_REQUIRED':
    case 'RATE_LIMITED':
    case 'RESEND_COOLDOWN':
    case 'INVALID_CODE':
    case 'OTP_EXPIRED':
    case 'OTP_ATTEMPTS_EXCEEDED':
    case 'NO_PENDING_VERIFICATION':
    case 'EMAIL_DELIVERY_NOT_CONFIGURED':
    case 'EMAIL_SEND_FAILED':
      return rawCode;
    default:
      if (httpStatus === 429) return 'RATE_LIMITED';
      return 'SERVER_ERROR';
  }
}

export async function subscribeToNewsletter(
  params: {
    readonly email: string;
    readonly consent: boolean;
    readonly lang: SiteLang;
    readonly source: NewsletterSource;
    readonly website?: string;
  },
  options?: NewsletterRequestOptions
): Promise<NewsletterSubscribeResult> {
  const email = normalizeClientEmail(params.email);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }
  if (!params.consent) {
    return { ok: false, code: 'CONSENT_REQUIRED' };
  }

  const { subscribeUrls, isStaticOnly } = resolveNewsletterEndpoints(
    options?.envOverride,
    options?.hostnameOverride
  );
  if (isStaticOnly) {
    const record: StoredNewsletterSubscription = {
      email,
      lang: params.lang,
      status: 'offline_saved',
      subscribedAt: new Date().toISOString(),
    };
    writeStoredNewsletterSubscription(record);
    return { ok: true, status: 'offline_saved', email };
  }

  const payload = {
    email,
    consent: true,
    lang: params.lang,
    source: params.source,
    website: params.website || '',
  };

  let sawRetryableFailure = false;

  for (let i = 0; i < subscribeUrls.length; i += 1) {
    const url = subscribeUrls[i];
    const hasNextFallback = i < subscribeUrls.length - 1;
    const attempt = await postJsonWithTimeout(
      url,
      payload,
      options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options?.fetchImpl ?? fetch
    );

    if (attempt.kind === 'non_json' || attempt.kind === 'network_error') {
      sawRetryableFailure = true;
      if (hasNextFallback) continue;
      break;
    }

    const { status, data } = attempt;
    if (status === 429) {
      return {
        ok: false,
        code: mapServerErrorCode(data?.code, status),
        error: data?.error,
        retryAfterSec: typeof data?.retryAfterSec === 'number' ? data.retryAfterSec : undefined,
      };
    }

    if (status === 400) {
      return {
        ok: false,
        code: mapServerErrorCode(data?.code, status),
        error: data?.error,
      };
    }

    if (data?.code === 'EMAIL_DELIVERY_NOT_CONFIGURED' || data?.code === 'EMAIL_SEND_FAILED') {
      return {
        ok: false,
        code: data.code,
        error: data.error,
      };
    }

    if (status >= 200 && status < 300 && data?.ok) {
      const resolvedEmail = typeof data.email === 'string' ? data.email : email;

      if (data.status === 'pending_verification') {
        const expiresInSec = typeof data.expiresInSec === 'number' ? data.expiresInSec : 600;
        const cooldownSec = typeof data.cooldownSec === 'number' ? data.cooldownSec : 60;
        const now = Date.now();
        writePendingNewsletterVerification({
          email: resolvedEmail,
          lang: params.lang,
          source: params.source,
          expiresAt: now + expiresInSec * 1000,
          cooldownUntil: now + cooldownSec * 1000,
          challengeToken: typeof data.challengeToken === 'string' ? data.challengeToken : undefined,
          devPreviewCode: typeof data.devPreviewCode === 'string' ? data.devPreviewCode : undefined,
        });
        return {
          ok: true,
          status: 'pending_verification',
          email: resolvedEmail,
          expiresInSec,
          cooldownSec,
          challengeToken: typeof data.challengeToken === 'string' ? data.challengeToken : undefined,
          devPreviewCode: typeof data.devPreviewCode === 'string' ? data.devPreviewCode : undefined,
          storage: typeof data.storage === 'string' ? data.storage : undefined,
        };
      }

      const finalStatus =
        data.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
      clearPendingNewsletterVerification();
      writeStoredNewsletterSubscription({
        email: resolvedEmail,
        lang: params.lang,
        status: finalStatus,
        subscribedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        status: finalStatus,
        email: resolvedEmail,
        storage: typeof data.storage === 'string' ? data.storage : undefined,
      };
    }

    if (status >= 500) {
      sawRetryableFailure = true;
      if (hasNextFallback) continue;
    }
  }

  if (sawRetryableFailure) {
    const record: StoredNewsletterSubscription = {
      email,
      lang: params.lang,
      status: 'offline_saved',
      subscribedAt: new Date().toISOString(),
    };
    writeStoredNewsletterSubscription(record);
    return { ok: true, status: 'offline_saved', email };
  }

  return { ok: false, code: 'SERVER_ERROR' };
}

export async function verifyNewsletterEmail(
  params: {
    readonly email: string;
    readonly code?: string;
    readonly token?: string;
    readonly challengeToken?: string;
    readonly lang?: SiteLang;
  },
  options?: NewsletterRequestOptions
): Promise<NewsletterVerifyResult> {
  const email = normalizeClientEmail(params.email);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }
  const cleanCode = typeof params.code === 'string' ? params.code.replace(/\D+/g, '').slice(0, 6) : '';
  const cleanToken = typeof params.token === 'string' ? params.token.trim() : '';
  if (cleanCode.length !== 6 && !cleanToken) {
    return { ok: false, code: 'INVALID_CODE' };
  }

  const { verifyUrls } = resolveNewsletterEndpoints(
    options?.envOverride,
    options?.hostnameOverride
  );
  const payload: Record<string, unknown> = { email };
  if (cleanCode.length === 6) payload.code = cleanCode;
  if (cleanToken) payload.token = cleanToken;
  if (params.challengeToken) payload.challengeToken = params.challengeToken;

  for (let i = 0; i < verifyUrls.length; i += 1) {
    const hasNextFallback = i < verifyUrls.length - 1;
    const attempt = await postJsonWithTimeout(
      verifyUrls[i],
      payload,
      options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options?.fetchImpl ?? fetch
    );

    if (attempt.kind === 'non_json' || attempt.kind === 'network_error') {
      if (hasNextFallback) continue;
      return { ok: false, code: 'SERVER_ERROR' };
    }

    const { status, data } = attempt;
    if (status >= 200 && status < 300 && data?.ok) {
      const resolvedEmail = typeof data.email === 'string' ? data.email : email;
      const finalStatus =
        data.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
      clearPendingNewsletterVerification();
      writeStoredNewsletterSubscription({
        email: resolvedEmail,
        lang: params.lang === 'en' ? 'en' : 'ko',
        status: finalStatus,
        subscribedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        status: finalStatus,
        email: resolvedEmail,
        storage: typeof data.storage === 'string' ? data.storage : undefined,
      };
    }

    if (status >= 500 && hasNextFallback) {
      continue;
    }

    return {
      ok: false,
      code: mapServerErrorCode(data?.code, status),
      error: data?.error,
      remainingAttempts:
        typeof data?.remainingAttempts === 'number' ? data.remainingAttempts : undefined,
      retryAfterSec: typeof data?.retryAfterSec === 'number' ? data.retryAfterSec : undefined,
    };
  }

  return { ok: false, code: 'SERVER_ERROR' };
}

export async function resendNewsletterVerification(
  params: {
    readonly email: string;
    readonly lang: SiteLang;
    readonly source: NewsletterSource;
  },
  options?: NewsletterRequestOptions
): Promise<NewsletterSubscribeResult> {
  const email = normalizeClientEmail(params.email);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }

  const { resendUrls } = resolveNewsletterEndpoints(
    options?.envOverride,
    options?.hostnameOverride
  );
  const payload = {
    email,
    lang: params.lang,
    source: params.source,
  };

  for (let i = 0; i < resendUrls.length; i += 1) {
    const hasNextFallback = i < resendUrls.length - 1;
    const attempt = await postJsonWithTimeout(
      resendUrls[i],
      payload,
      options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options?.fetchImpl ?? fetch
    );

    if (attempt.kind === 'non_json' || attempt.kind === 'network_error') {
      if (hasNextFallback) continue;
      return { ok: false, code: 'SERVER_ERROR' };
    }

    const { status, data } = attempt;
    if (status >= 200 && status < 300 && data?.ok) {
      const resolvedEmail = typeof data.email === 'string' ? data.email : email;
      if (data.status === 'already_subscribed') {
        clearPendingNewsletterVerification();
        writeStoredNewsletterSubscription({
          email: resolvedEmail,
          lang: params.lang,
          status: 'already_subscribed',
          subscribedAt: new Date().toISOString(),
        });
        return { ok: true, status: 'already_subscribed', email: resolvedEmail };
      }
      const expiresInSec = typeof data.expiresInSec === 'number' ? data.expiresInSec : 600;
      const cooldownSec = typeof data.cooldownSec === 'number' ? data.cooldownSec : 60;
      const now = Date.now();
      writePendingNewsletterVerification({
        email: resolvedEmail,
        lang: params.lang,
        source: params.source,
        expiresAt: now + expiresInSec * 1000,
        cooldownUntil: now + cooldownSec * 1000,
        challengeToken: typeof data.challengeToken === 'string' ? data.challengeToken : undefined,
        devPreviewCode: typeof data.devPreviewCode === 'string' ? data.devPreviewCode : undefined,
      });
      return {
        ok: true,
        status: 'pending_verification',
        email: resolvedEmail,
        expiresInSec,
        cooldownSec,
        challengeToken: typeof data.challengeToken === 'string' ? data.challengeToken : undefined,
        devPreviewCode: typeof data.devPreviewCode === 'string' ? data.devPreviewCode : undefined,
        storage: typeof data.storage === 'string' ? data.storage : undefined,
      };
    }

    if (status >= 500 && hasNextFallback) continue;
    return {
      ok: false,
      code: mapServerErrorCode(data?.code, status),
      error: data?.error,
      retryAfterSec: typeof data?.retryAfterSec === 'number' ? data.retryAfterSec : undefined,
    };
  }

  return { ok: false, code: 'SERVER_ERROR' };
}

/**
 * Attempts to upgrade a previously device-saved (`offline_saved`) subscription
 * by initiating server-side email verification or confirming an already-verified address.
 */
export async function syncOfflineNewsletterSubscription(
  sub: StoredNewsletterSubscription,
  source: NewsletterSource = 'site_about',
  options?: NewsletterRequestOptions
): Promise<NewsletterSubscribeResult> {
  const result = await subscribeToNewsletter(
    {
      email: sub.email,
      consent: true,
      lang: sub.lang,
      source,
    },
    options
  );
  if (result.ok && result.status === 'pending_verification') {
    clearStoredNewsletterSubscription();
  }
  return result;
}

export async function unsubscribeFromNewsletter(
  rawEmail: string,
  options?: NewsletterRequestOptions
): Promise<NewsletterUnsubscribeResult> {
  const email = normalizeClientEmail(rawEmail);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }

  const { unsubscribeUrls, isStaticOnly } = resolveNewsletterEndpoints(
    options?.envOverride,
    options?.hostnameOverride
  );
  clearStoredNewsletterSubscription();
  clearPendingNewsletterVerification();
  if (isStaticOnly) {
    return { ok: true };
  }

  for (let i = 0; i < unsubscribeUrls.length; i += 1) {
    const attempt = await postJsonWithTimeout(
      unsubscribeUrls[i],
      { email },
      options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options?.fetchImpl ?? fetch
    );
    if (attempt.kind === 'json') {
      if (attempt.status === 429) {
        return { ok: false, code: 'RATE_LIMITED' };
      }
      if (attempt.status >= 200 && attempt.status < 300) {
        return { ok: true };
      }
    }
  }
  return { ok: true };
}
