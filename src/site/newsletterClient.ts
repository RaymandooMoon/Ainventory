import { resolveApiRuntimeConfig } from '../utils/apiRuntimeConfig.ts';
import type { SiteLang } from './siteContent.ts';

export type NewsletterSource = 'site_footer' | 'site_about' | 'site_hero' | 'site_modal';

export interface StoredNewsletterSubscription {
  readonly email: string;
  readonly lang: SiteLang;
  readonly status: 'subscribed' | 'already_subscribed' | 'offline_saved';
  readonly subscribedAt: string;
}

export type NewsletterSubscribeResult =
  | {
      readonly ok: true;
      readonly status: 'subscribed' | 'already_subscribed' | 'offline_saved';
      readonly email: string;
      readonly storage?: string;
    }
  | {
      readonly ok: false;
      readonly code: 'INVALID_EMAIL' | 'CONSENT_REQUIRED' | 'RATE_LIMITED' | 'SERVER_ERROR';
      readonly error?: string;
    };

export type NewsletterUnsubscribeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'INVALID_EMAIL' | 'RATE_LIMITED' | 'SERVER_ERROR' };

const STORAGE_KEY = 'ainvtry_newsletter_sub_v1';
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
  readonly unsubscribeUrls: readonly string[];
  readonly isStaticOnly: boolean;
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
        unsubscribeUrls: [clean.replace(/\/subscribe$/, '/unsubscribe')],
        isStaticOnly: false,
      };
    }
    try {
      const parsed = new URL(customEndpoint);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        const clean = parsed.toString().replace(/\/+$/, '');
        return {
          subscribeUrls: [clean],
          unsubscribeUrls: [clean.replace(/\/subscribe$/, '/unsubscribe')],
          isStaticOnly: false,
        };
      }
    } catch {
      // Ignore malformed custom endpoint and fall back to runtime API base
    }
  }

  const runtime = resolveApiRuntimeConfig(env);
  const primarySubscribe = `${runtime.apiBaseUrl}/newsletter/subscribe`;
  const primaryUnsubscribe = `${runtime.apiBaseUrl}/newsletter/unsubscribe`;
  const isPublicHosted = PUBLIC_SITE_HOSTS.has(hostname);

  const subscribeUrls: string[] = [primarySubscribe];
  const unsubscribeUrls: string[] = [primaryUnsubscribe];

  // On hosted ainvtry.com / github.io, keep Render API as an automatic backup if same-origin /api is unavailable
  if (isPublicHosted && primarySubscribe.startsWith('/')) {
    subscribeUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/subscribe`);
    unsubscribeUrls.push(`${PUBLIC_PRODUCTION_API_BASE}/newsletter/unsubscribe`);
  }

  return {
    subscribeUrls,
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
    // Ignore storage quota or sandboxed iframe storage errors
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

async function postJsonWithTimeout(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<{
  readonly kind: 'json' | 'non_json' | 'network_error';
  readonly status: number;
  readonly data: {
    ok?: boolean;
    status?: string;
    code?: string;
    error?: string;
    email?: string;
    storage?: string;
  } | null;
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
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      status?: string;
      code?: string;
      error?: string;
      email?: string;
      storage?: string;
    } | null;
    return { kind: 'json', status: response.status, data };
  } catch {
    return { kind: 'network_error', status: 0, data: null };
  } finally {
    clearTimeout(timer);
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
  options?: {
    readonly fetchImpl?: typeof fetch;
    readonly envOverride?: Record<string, string | undefined>;
    readonly hostnameOverride?: string;
    readonly timeoutMs?: number;
  }
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

    if (attempt.kind === 'network_error' || attempt.kind === 'non_json') {
      sawRetryableFailure = true;
      if (hasNextFallback) continue;
      break;
    }

    const { status, data } = attempt;
    if (status === 429 || data?.code === 'RATE_LIMITED') {
      return { ok: false, code: 'RATE_LIMITED', error: data?.error };
    }
    if (status === 400 && data?.code === 'INVALID_EMAIL') {
      return { ok: false, code: 'INVALID_EMAIL', error: data?.error };
    }
    if (status === 400 && data?.code === 'CONSENT_REQUIRED') {
      return { ok: false, code: 'CONSENT_REQUIRED', error: data?.error };
    }
    if ((status >= 500 || status === 404 || status === 405) && hasNextFallback) {
      sawRetryableFailure = true;
      continue;
    }
    if (status >= 200 && status < 300 && data?.ok) {
      const finalStatus = data.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
      const resolvedEmail = typeof data.email === 'string' ? data.email : email;
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
      break;
    }
    return { ok: false, code: 'SERVER_ERROR', error: data?.error };
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

/**
 * Attempts to upgrade a previously device-saved (`offline_saved`) subscription
 * to a real server-persisted subscription once the live edge/API server is reachable.
 */
export async function syncOfflineNewsletterSubscription(
  sub: StoredNewsletterSubscription,
  source: NewsletterSource = 'site_about',
  options?: {
    readonly fetchImpl?: typeof fetch;
    readonly envOverride?: Record<string, string | undefined>;
    readonly hostnameOverride?: string;
    readonly timeoutMs?: number;
  }
): Promise<NewsletterSubscribeResult> {
  return subscribeToNewsletter(
    {
      email: sub.email,
      consent: true,
      lang: sub.lang,
      source,
    },
    options
  );
}

export async function unsubscribeFromNewsletter(
  rawEmail: string,
  options?: {
    readonly fetchImpl?: typeof fetch;
    readonly envOverride?: Record<string, string | undefined>;
    readonly hostnameOverride?: string;
    readonly timeoutMs?: number;
  }
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
