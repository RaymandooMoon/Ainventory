const APP_ROUTE_BASE = '/app';
const GH_PAGES_BASE = '/Ainventory';

function getWindowPathname(): string {
  if (typeof window === 'undefined') return '/';
  return String(window.location?.pathname || '/');
}

function getWindowSearch(): string {
  if (typeof window === 'undefined') return '';
  return String(window.location?.search || '');
}

/**
 * Detects the active SPA base path (`'/app'` on ainvtry.com/app, `'/Ainventory'` on GitHub Pages, `''` on root).
 */
export function detectAppBasePath(pathname?: string): string {
  const path = String(pathname ?? getWindowPathname()).trim() || '/';
  if (path === APP_ROUTE_BASE || path.startsWith(`${APP_ROUTE_BASE}/`)) {
    return APP_ROUTE_BASE;
  }
  if (path === GH_PAGES_BASE || path.startsWith(`${GH_PAGES_BASE}/`)) {
    return GH_PAGES_BASE;
  }
  return '';
}

/**
 * Returns true when the application is mounted under the canonical `/app` path on `ainvtry.com`.
 */
export function isMountedUnderAppRoute(pathname?: string): boolean {
  return detectAppBasePath(pathname) === APP_ROUTE_BASE;
}

/**
 * Strips the detected (or explicit) base path from a pathname and returns an internal app route starting with `'/'`.
 */
export function stripAppBasePath(pathname?: string, basePath?: string): string {
  const raw = String(pathname ?? getWindowPathname()).trim() || '/';
  const resolvedBase = basePath !== undefined ? basePath : detectAppBasePath(raw);
  if (!resolvedBase) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  if (raw === resolvedBase || raw === `${resolvedBase}/`) {
    return '/';
  }
  if (raw.startsWith(`${resolvedBase}/`)) {
    const stripped = raw.slice(resolvedBase.length);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Joins an internal app route (e.g. `'/'`, `'/closet'`, `'/item/12'`) with the active base path.
 */
export function toAppPath(subPath: string, basePath?: string): string {
  const resolvedBase = basePath !== undefined ? basePath : detectAppBasePath();
  const cleanSub = String(subPath || '/').trim();
  const normalizedSub = cleanSub.startsWith('/') ? cleanSub : `/${cleanSub}`;
  if (!resolvedBase) {
    return normalizedSub;
  }
  if (normalizedSub === '/') {
    return resolvedBase === GH_PAGES_BASE ? `${GH_PAGES_BASE}/` : resolvedBase;
  }
  return `${resolvedBase}${normalizedSub}`;
}

/**
 * Resolves the canonical login path for the active mount (`'/app/login'` under `/app`, `'/?auth=1'` at root).
 */
export function buildAppLoginPath(basePath?: string): string {
  const resolvedBase = basePath !== undefined ? basePath : detectAppBasePath();
  if (resolvedBase === APP_ROUTE_BASE) {
    return `${APP_ROUTE_BASE}/login`;
  }
  return `${toAppPath('/', resolvedBase)}?auth=1`;
}

/**
 * Builds the server-side Google OAuth 2.0 PKCE start URL on the same origin.
 */
export function buildGoogleOAuthStartUrl(options?: {
  returnTo?: string;
  mode?: 'login' | 'link';
  apiBaseUrl?: string;
}): string {
  const apiBase = String(options?.apiBaseUrl || '/api').replace(/\/+$/, '');
  const returnTo = options?.returnTo || APP_ROUTE_BASE;
  const params = new URLSearchParams({ returnTo });
  if (options?.mode === 'link') {
    params.set('mode', 'link');
  }
  return `${apiBase}/auth/google/start?${params.toString()}`;
}

export interface OAuthCallbackParams {
  authResult: string | null;
  authError: string | null;
}

/**
 * Extracts `auth_result` and `auth_error` callback parameters from a query string.
 */
export function parseOAuthCallbackParams(search?: string): OAuthCallbackParams {
  const params = new URLSearchParams(search ?? getWindowSearch());
  const authResult = params.get('auth_result');
  const authError = params.get('auth_error');
  return {
    authResult: authResult ? authResult.trim() : null,
    authError: authError ? authError.trim() : null,
  };
}

/**
 * Maps Google OAuth callback error codes to localized user-facing messages.
 */
export function formatOAuthErrorMessage(errorCode: string, lang: string = 'ko'): string {
  const isEn = lang === 'en';
  switch (String(errorCode || '').toLowerCase()) {
    case 'account_email_conflict':
      return isEn
        ? 'An account with this email already exists. Please sign in with your existing method and link Google in Account Settings.'
        : '이미 다른 방식으로 가입된 이메일 계정입니다. 기존 로그인 방식으로 로그인한 뒤 계정 설정에서 Google 계정을 연결해 주세요.';
    case 'identity_already_linked':
      return isEn
        ? 'This Google account is already linked to another iNVTRY account.'
        : '이 Google 계정은 이미 다른 iNVTRY 계정에 연결되어 있습니다.';
    case 'admin_social_forbidden':
      return isEn
        ? 'Social sign-in is disabled for administrator accounts.'
        : '관리자 계정은 소셜 로그인 연동이 허용되지 않습니다.';
    case 'access_denied':
      return isEn
        ? 'Google sign-in was cancelled. You can try again anytime.'
        : 'Google 로그인이 취소되었습니다. 원하실 때 다시 시도해 주세요.';
    case 'oauth_state_mismatch':
    case 'oauth_state_invalid':
      return isEn
        ? 'Login verification expired. Please tap Continue with Google again.'
        : '보안 인증 상태가 만료되었습니다. Google로 계속하기를 다시 눌러 주세요.';
    case 'google_not_configured':
      return isEn
        ? 'Google sign-in is not yet configured on this server.'
        : '현재 서버에 Google 로그인 설정이 완료되지 않았습니다.';
    case 'rate_limited':
      return isEn
        ? 'Too many sign-in attempts. Please try again in a moment.'
        : '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return isEn
        ? 'Google sign-in could not be completed. Please try again.'
        : 'Google 로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

export interface InAppBrowserInfo {
  readonly isInApp: boolean;
  readonly appName: string | null;
  readonly isAndroid: boolean;
  readonly isIos: boolean;
}

const IN_APP_BROWSER_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly name: string }> = [
  { pattern: /KAKAOTALK/i, name: 'KakaoTalk' },
  { pattern: /Instagram/i, name: 'Instagram' },
  { pattern: /FBAN|FBAV/i, name: 'Facebook' },
  { pattern: /NAVER\(/i, name: 'Naver' },
  { pattern: /Line\//i, name: 'LINE' },
  { pattern: /DaumApps/i, name: 'Daum' },
  { pattern: /Threads/i, name: 'Threads' },
  { pattern: /EVERYTIME/i, name: 'Everytime' },
  { pattern: /MicroMessenger/i, name: 'WeChat' },
];

/**
 * Detects embedded social/messenger in-app WebViews where Google OAuth blocks
 * sign-in (`403 disallowed_useragent`), without flagging standard browsers or Capacitor.
 */
export function detectInAppBrowser(userAgent?: string): InAppBrowserInfo {
  const ua =
    userAgent !== undefined
      ? String(userAgent)
      : typeof navigator !== 'undefined'
        ? String(navigator.userAgent || '')
        : '';
  const isAndroid = /Android/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);

  for (const entry of IN_APP_BROWSER_PATTERNS) {
    if (entry.pattern.test(ua)) {
      return { isInApp: true, appName: entry.name, isAndroid, isIos };
    }
  }
  return { isInApp: false, appName: null, isAndroid, isIos };
}

/**
 * Builds an external-browser deep link when supported by the host in-app WebView
 * (KakaoTalk external scheme or Android Chrome intent). Returns `null` when the
 * user should copy the URL and open it manually in Safari/Chrome.
 */
export function buildExternalBrowserUrl(currentUrl: string, userAgent?: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const info = detectInAppBrowser(userAgent);
  if (!info.isInApp) {
    return null;
  }

  const safeHref = parsed.toString();
  if (info.appName === 'KakaoTalk') {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(safeHref)}`;
  }

  if (info.isAndroid) {
    const scheme = parsed.protocol.slice(0, -1);
    const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `intent://${hostPath}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(safeHref)};end`;
  }

  return null;
}

