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
const REQUEST_TIMEOUT_MS = 7000;

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

function resolveNewsletterEndpoints(): {
  subscribeUrl: string;
  unsubscribeUrl: string;
  isStaticOnly: boolean;
} {
  const env = import.meta.env as Record<string, string | undefined>;
  const customEndpoint = String(env.VITE_NEWSLETTER_ENDPOINT || '').trim();
  if (customEndpoint) {
    if (customEndpoint.startsWith('/') && !customEndpoint.startsWith('//')) {
      const clean = customEndpoint.replace(/\/+$/, '');
      return {
        subscribeUrl: clean,
        unsubscribeUrl: clean.replace(/\/subscribe$/, '/unsubscribe'),
        isStaticOnly: false,
      };
    }
    try {
      const parsed = new URL(customEndpoint);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        const clean = parsed.toString().replace(/\/+$/, '');
        return {
          subscribeUrl: clean,
          unsubscribeUrl: clean.replace(/\/subscribe$/, '/unsubscribe'),
          isStaticOnly: false,
        };
      }
    } catch {
      // Ignore malformed custom endpoint and fall back to runtime API base
    }
  }

  const runtime = resolveApiRuntimeConfig(env);
  return {
    subscribeUrl: `${runtime.apiBaseUrl}/newsletter/subscribe`,
    unsubscribeUrl: `${runtime.apiBaseUrl}/newsletter/unsubscribe`,
    isStaticOnly: runtime.isStaticStandaloneWithoutApi,
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

export async function subscribeToNewsletter(params: {
  readonly email: string;
  readonly consent: boolean;
  readonly lang: SiteLang;
  readonly source: NewsletterSource;
  readonly website?: string;
}): Promise<NewsletterSubscribeResult> {
  const email = normalizeClientEmail(params.email);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }
  if (!params.consent) {
    return { ok: false, code: 'CONSENT_REQUIRED' };
  }

  const { subscribeUrl, isStaticOnly } = resolveNewsletterEndpoints();
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        consent: true,
        lang: params.lang,
        source: params.source,
        website: params.website || '',
      }),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // Static-only Cloudflare / SPA hosts return HTML or 404/405 for /api/* routes
    if (!isJson && (response.status === 404 || response.status === 405 || response.ok)) {
      const record: StoredNewsletterSubscription = {
        email,
        lang: params.lang,
        status: 'offline_saved',
        subscribedAt: new Date().toISOString(),
      };
      writeStoredNewsletterSubscription(record);
      return { ok: true, status: 'offline_saved', email };
    }

    const data = isJson
      ? ((await response.json().catch(() => null)) as {
          ok?: boolean;
          status?: string;
          code?: string;
          error?: string;
          email?: string;
        } | null)
      : null;

    if (response.status === 429 || data?.code === 'RATE_LIMITED') {
      return { ok: false, code: 'RATE_LIMITED', error: data?.error };
    }
    if (response.status === 400 && data?.code === 'INVALID_EMAIL') {
      return { ok: false, code: 'INVALID_EMAIL', error: data?.error };
    }
    if (response.status === 400 && data?.code === 'CONSENT_REQUIRED') {
      return { ok: false, code: 'CONSENT_REQUIRED', error: data?.error };
    }
    if (!response.ok || !data?.ok) {
      return { ok: false, code: 'SERVER_ERROR', error: data?.error };
    }

    const finalStatus = data.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
    const resolvedEmail = typeof data.email === 'string' ? data.email : email;
    writeStoredNewsletterSubscription({
      email: resolvedEmail,
      lang: params.lang,
      status: finalStatus,
      subscribedAt: new Date().toISOString(),
    });
    return { ok: true, status: finalStatus, email: resolvedEmail };
  } catch {
    const record: StoredNewsletterSubscription = {
      email,
      lang: params.lang,
      status: 'offline_saved',
      subscribedAt: new Date().toISOString(),
    };
    writeStoredNewsletterSubscription(record);
    return { ok: true, status: 'offline_saved', email };
  } finally {
    clearTimeout(timer);
  }
}

export async function unsubscribeFromNewsletter(
  rawEmail: string
): Promise<NewsletterUnsubscribeResult> {
  const email = normalizeClientEmail(rawEmail);
  if (!email) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }

  const { unsubscribeUrl, isStaticOnly } = resolveNewsletterEndpoints();
  clearStoredNewsletterSubscription();
  if (isStaticOnly) {
    return { ok: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(unsubscribeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    if (response.status === 429) {
      return { ok: false, code: 'RATE_LIMITED' };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
}
