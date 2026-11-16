/**
 * Pure, testable Google Identity Services (GIS) Client Service
 *
 * Implements client-side Google OAuth 2.0 / OpenID Connect token requests
 * using Google Identity Services (https://accounts.google.com/gsi/client).
 *
 * Security & Design Rules:
 * 1. ZERO client secrets. Only the public OAuth Web Client ID is used.
 * 2. Strict origin isolation (authorized javascript origins).
 * 3. Lazy script injection with promise caching and timeout handling.
 * 4. Safe base64url payload decoding for client-side optimistic UI/previews.
 */

export interface GoogleCredentialPayload {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
  given_name?: string;
  family_name?: string;
  locale?: string;
  [key: string]: unknown;
}

export type GoogleSignInRejectReason =
  | 'not_configured'
  | 'script_failed'
  | 'dismissed'
  | 'popup_blocked';

export interface RequestGoogleIdTokenOptions {
  clientId?: string;
  timeoutMs?: number;
}

const GOOGLE_GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SCRIPT_TIMEOUT_MS = 8000;
const PROMPT_TIMEOUT_MS = 60000;

let scriptLoadingPromise: Promise<void> | null = null;

/**
 * Validates and retrieves the public Google Client ID from environment.
 * Rejects empty strings, placeholders, and template values.
 */
export function getGoogleClientId(customEnv?: string): string | null {
  const raw =
    customEnv !== undefined
      ? customEnv
      : typeof import.meta !== 'undefined' && import.meta.env
        ? (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
        : undefined;

  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.startsWith('your_') ||
    trimmed.startsWith('your-') ||
    trimmed.startsWith('TODO') ||
    trimmed.toLowerCase().includes('placeholder') ||
    trimmed.length < 8
  ) {
    return null;
  }

  return trimmed;
}

/**
 * Returns true if Google Sign-In is configured with a valid client ID.
 */
export function isGoogleSignInConfigured(): boolean {
  return getGoogleClientId() !== null;
}

/**
 * Lazily and idempotently injects the Google Identity Services SDK script into the DOM.
 */
export function loadGoogleIdentityScript(timeoutMs = SCRIPT_TIMEOUT_MS): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser environment.'));
  }

  // If already loaded
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    // Check if script tag already exists in document
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${GOOGLE_GSI_SCRIPT_URL}"]`
    );

    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      cleanup();
      scriptLoadingPromise = null;
      reject(new Error('Google Identity script load timed out.'));
    }, timeoutMs);

    const onScriptLoad = () => {
      cleanup();
      if (window.google?.accounts?.id) {
        resolve();
      } else {
        scriptLoadingPromise = null;
        reject(new Error('Google Identity SDK failed to initialize after script load.'));
      }
    };

    const onScriptError = () => {
      cleanup();
      scriptLoadingPromise = null;
      reject(new Error('Failed to load Google Identity script.'));
    };

    if (existing) {
      if (window.google?.accounts?.id) {
        cleanup();
        resolve();
        return;
      }
      existing.addEventListener('load', onScriptLoad, { once: true });
      existing.addEventListener('error', onScriptError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = onScriptLoad;
    script.onerror = onScriptError;

    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Safely decodes a Google Credential JWT payload without verifying signatures.
 * (Cryptographic verification is performed strictly on the server or in standalone fallback).
 */
export function decodeGoogleCredentialPayload(jwt: string): GoogleCredentialPayload | null {
  if (!jwt || typeof jwt !== 'string') {
    return null;
  }

  const parts = jwt.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const rawPayload = parts[1];
    // Base64Url to Base64
    const base64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64.padEnd(base64.length + padLen, '=');

    // Decode in browser or Node environment
    let decodedJson = '';
    if (typeof atob === 'function') {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      decodedJson = new TextDecoder('utf-8').decode(bytes);
    } else if (typeof Buffer !== 'undefined') {
      decodedJson = Buffer.from(padded, 'base64').toString('utf8');
    } else {
      return null;
    }

    const parsed = JSON.parse(decodedJson);
    if (!parsed || typeof parsed !== 'object' || !parsed.sub) {
      return null;
    }

    return parsed as GoogleCredentialPayload;
  } catch {
    return null;
  }
}

/**
 * Requests a Google ID Token via Google Identity Services One Tap / popup prompt.
 * Rejects with typed reason ('not_configured' | 'script_failed' | 'dismissed' | 'popup_blocked')
 */
export async function requestGoogleIdToken(
  options: RequestGoogleIdTokenOptions = {}
): Promise<string> {
  const clientId = options.clientId || getGoogleClientId();
  if (!clientId) {
    const err = new Error('Google Client ID is not configured.');
    (err as Error & { reason: GoogleSignInRejectReason }).reason = 'not_configured';
    throw err;
  }

  try {
    await loadGoogleIdentityScript(options.timeoutMs || SCRIPT_TIMEOUT_MS);
  } catch (cause) {
    const err = new Error('Google Identity Services script could not be loaded.', { cause });
    (err as Error & { reason: GoogleSignInRejectReason }).reason = 'script_failed';
    throw err;
  }

  const googleId = window.google?.accounts?.id;
  if (!googleId) {
    const err = new Error('Google Identity Services is unavailable in this environment.');
    (err as Error & { reason: GoogleSignInRejectReason }).reason = 'script_failed';
    throw err;
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      if (!settled) {
        cleanup();
        const err = new Error('Google Sign-In prompt timed out.');
        (err as Error & { reason: GoogleSignInRejectReason }).reason = 'dismissed';
        reject(err);
      }
    }, options.timeoutMs || PROMPT_TIMEOUT_MS);

    try {
      googleId.initialize({
        client_id: clientId,
        callback: (response) => {
          if (settled) return;
          cleanup();
          if (response?.credential) {
            resolve(response.credential);
          } else {
            const err = new Error('No credential returned by Google.');
            (err as Error & { reason: GoogleSignInRejectReason }).reason = 'dismissed';
            reject(err);
          }
        },
        ux_mode: 'popup',
        auto_select: false,
        use_fedcm_for_prompt: true,
      });

      googleId.prompt((notification) => {
        if (settled) return;

        if (notification.isNotDisplayed()) {
          cleanup();
          const reasonCode = notification.getNotDisplayedReason();
          const reason: GoogleSignInRejectReason =
            reasonCode === 'browser_not_supported' || reasonCode === 'suppressed_by_user'
              ? 'popup_blocked'
              : 'dismissed';
          const err = new Error(`Google prompt not displayed: ${reasonCode}`);
          (err as Error & { reason: GoogleSignInRejectReason }).reason = reason;
          reject(err);
        } else if (notification.isDismissedMoment()) {
          cleanup();
          const reasonCode = notification.getDismissedReason();
          const err = new Error(`Google prompt dismissed: ${reasonCode}`);
          (err as Error & { reason: GoogleSignInRejectReason }).reason = 'dismissed';
          reject(err);
        } else if (notification.isSkippedMoment()) {
          cleanup();
          const reasonCode = notification.getSkippedReason();
          const err = new Error(`Google prompt skipped: ${reasonCode}`);
          (err as Error & { reason: GoogleSignInRejectReason }).reason = 'dismissed';
          reject(err);
        }
      });
    } catch (caught) {
      if (!settled) {
        cleanup();
        const err = new Error('Failed to launch Google Sign-In prompt.', { cause: caught });
        (err as Error & { reason: GoogleSignInRejectReason }).reason = 'script_failed';
        reject(err);
      }
    }
  });
}
