/**
 * Mobile Native Bridge, Hardware Back Stack, Micro-Haptics & Apple HIG Theme/Status Bus
 * (Requirements 9.a, 11.a, 13.b, 14.b)
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning';

export interface StatusCapsulePayload {
  id: number;
  message: string;
  icon?: string;
  haptic?: HapticKind;
  durationMs?: number;
}

export type StatusCapsuleInput =
  | string
  | {
      message: string;
      icon?: string;
      haptic?: HapticKind;
      durationMs?: number;
      id?: number;
    };

export type BackHandlerFn = () => boolean | void;
export type StatusCapsuleListener = (payload: StatusCapsulePayload) => void;
export type ThemeChangeListener = (effective: EffectiveTheme, pref: ThemePreference) => void;

const THEME_KEY = 'ainventory_theme_pref';
const CAMERA_NOTICE_KEY = 'ainventory_camera_rationale_ack';
const BIOMETRIC_CONSENT_KEY = 'ainventory_biometric_consent_ack';

const backHandlers: BackHandlerFn[] = [];
let capBackListenerBound = false;
let capBackBindingInFlight: Promise<void> | null = null;
const statusListeners = new Set<StatusCapsuleListener>();
const themeListeners = new Set<ThemeChangeListener>();
let systemMediaBound = false;

function normalizeThemePref(raw: string | null | undefined): ThemePreference {
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return 'light';
}

function notifyThemeListeners(effective: EffectiveTheme, pref: ThemePreference): void {
  for (const fn of themeListeners) {
    try {
      fn(effective, pref);
    } catch {
      // ignore listener error
    }
  }
}

function ensureSystemMediaListener(): void {
  if (systemMediaBound || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (!mql || typeof mql.addEventListener !== 'function') return;
  systemMediaBound = true;
  mql.addEventListener('change', () => {
    const currentPref = getThemePreference();
    if (currentPref === 'system') {
      const effective = syncDomTheme(currentPref);
      notifyThemeListeners(effective, currentPref);
    }
  });
}

function syncDomTheme(pref: ThemePreference): EffectiveTheme {
  const effective = resolveEffectiveTheme(pref);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.colorScheme = effective === 'dark' ? 'dark' : 'only light';
    if (document.documentElement.getAttribute('data-vibrancy-fallback') !== 'solid') {
      document.documentElement.setAttribute('data-vibrancy-fallback', 'blur');
    }
    const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaColorScheme) {
      metaColorScheme.setAttribute('content', effective === 'dark' ? 'dark' : 'light only');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', effective === 'dark' ? '#000000' : '#FFFFFF');
    }
  }
  return effective;
}

export async function initNativeBackBridge(): Promise<void> {
  if (capBackListenerBound || typeof window === 'undefined') return;
  if (capBackBindingInFlight) return capBackBindingInFlight;

  capBackBindingInFlight = (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        return;
      }
      const { App: CapApp } = await import('@capacitor/app');
      await CapApp.addListener('backButton', ({ canGoBack }) => {
        // Drain LIFO back handler stack (modals -> sheets -> drawers -> sub-tabs)
        while (backHandlers.length > 0) {
          const topFn = backHandlers[backHandlers.length - 1];
          const handled = topFn?.();
          if (handled !== false) return;
          backHandlers.pop();
        }
        if (canGoBack) {
          window.history.back();
        } else {
          void CapApp.exitApp();
        }
      });
      capBackListenerBound = true;
    } catch {
      // Running in standard browser environment or listener failed; allow future retry
    } finally {
      capBackBindingInFlight = null;
    }
  })();

  return capBackBindingInFlight;
}

export function pushBackHandler(handlerFn: BackHandlerFn): () => void {
  backHandlers.push(handlerFn);
  return () => {
    const idx = backHandlers.lastIndexOf(handlerFn);
    if (idx >= 0) backHandlers.splice(idx, 1);
  };
}

export async function triggerHaptic(kind: HapticKind | string = 'light'): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'selection') {
        await Haptics.selectionChanged();
      } else if (kind === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (kind === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (kind === 'heavy') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (kind === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
      return;
    }
  } catch {
    // Fall through to subtle Web Vibration API on supported Android browsers
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'heavy' ? 15 : kind === 'medium' ? 10 : 5);
    }
  } catch {
    // ignore
  }
}

// Dynamic Island-style silent top Status Capsule pub/sub (Requirement 13.b)
export function subscribeStatusCapsule(fn: StatusCapsuleListener): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

export function emitStatusCapsule(payload: StatusCapsuleInput): void {
  const normalized: StatusCapsulePayload =
    typeof payload === 'string'
      ? { message: payload, icon: 'check', id: Date.now() + Math.random() }
      : {
          icon: payload.icon || 'check',
          message: payload.message,
          haptic: payload.haptic,
          durationMs: payload.durationMs,
          id: payload.id ?? Date.now() + Math.random(),
        };
  void triggerHaptic(normalized.haptic || 'selection');
  for (const fn of statusListeners) {
    try {
      fn(normalized);
    } catch {
      // ignore
    }
  }
}

// Apple HIG Light / Dark / System Theme Engine (Requirement 11.a)
export function getThemePreference(): ThemePreference {
  try {
    if (typeof localStorage !== 'undefined') {
      return normalizeThemePref(localStorage.getItem(THEME_KEY));
    }
  } catch {
    // ignore storage access error
  }
  return 'light';
}

export function resolveEffectiveTheme(pref: string = getThemePreference()): EffectiveTheme {
  if (pref === 'dark' || pref === 'light') return pref;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyThemePreference(pref: string = getThemePreference()): EffectiveTheme {
  const normalized = normalizeThemePref(pref);
  ensureSystemMediaListener();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, normalized);
    }
  } catch {
    // ignore storage write error
  }
  const effective = syncDomTheme(normalized);
  notifyThemeListeners(effective, normalized);
  return effective;
}

export function subscribeThemeChange(listener: ThemeChangeListener): () => void {
  ensureSystemMediaListener();
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

// Requirement 14.b: Automatic Vibrancy degradation when 3D WebGL FPS drops
export function setVibrancySolidFallback(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-vibrancy-fallback', enabled ? 'solid' : 'blur');
}

// Requirement 10.c: Pre-permission rationale & biometric local-processing consent flags
export function hasAcknowledgedCameraNotice(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CAMERA_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAcknowledgedCameraNotice(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAMERA_NOTICE_KEY, '1');
    }
  } catch {
    // ignore
  }
}

export function hasBiometricConsent(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(BIOMETRIC_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBiometricConsent(granted = true): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (granted) localStorage.setItem(BIOMETRIC_CONSENT_KEY, '1');
    else localStorage.removeItem(BIOMETRIC_CONSENT_KEY);
  } catch {
    // ignore
  }
}

export const getStoredThemePreference = getThemePreference;
export const acknowledgeCameraNotice = setAcknowledgedCameraNotice;

const RAW_PUBLIC_BASE_URL = String(import.meta.env?.BASE_URL || '/');
const PUBLIC_BASE_PREFIX =
  RAW_PUBLIC_BASE_URL === '/' ? '' : RAW_PUBLIC_BASE_URL.replace(/\/+$/, '');

/**
 * Resolves root-relative public static assets (`/seed/...`, `/uploads/...`, `/icon.svg`)
 * against Vite's `BASE_URL` (e.g. `/Ainventory/` on GitHub Pages) while staying a zero-overhead
 * identity function when `BASE_URL === '/'`.
 */
export function withPublicBaseUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  if (!PUBLIC_BASE_PREFIX) return rawUrl;
  if (
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl === PUBLIC_BASE_PREFIX ||
    rawUrl.startsWith(`${PUBLIC_BASE_PREFIX}/`)
  ) {
    return rawUrl;
  }
  if (rawUrl.startsWith('/')) {
    return `${PUBLIC_BASE_PREFIX}${rawUrl}`;
  }
  return rawUrl;
}

function prefixSubpathRouteUrl(url: string | URL | null | undefined): string | URL | null | undefined {
  if (!PUBLIC_BASE_PREFIX || !url || typeof url !== 'string') return url;
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  if (url === PUBLIC_BASE_PREFIX || url.startsWith(`${PUBLIC_BASE_PREFIX}/`)) return url;
  return `${PUBLIC_BASE_PREFIX}${url}`;
}

if (PUBLIC_BASE_PREFIX && typeof window !== 'undefined' && window.history) {
  const win = window as Window & { __ainventoryBasePatched?: boolean };
  if (!win.__ainventoryBasePatched) {
    win.__ainventoryBasePatched = true;
    const origPushState = window.history.pushState.bind(window.history);
    const origReplaceState = window.history.replaceState.bind(window.history);

    // Allow direct subpath deep-links (e.g. /Ainventory/outfits?demo_vton=1 via 404.html)
    // to match App.jsx's root-relative parseAppLocation() on initial mount, then restore prefix.
    const initialPath = window.location.pathname || '/';
    if (initialPath.startsWith(`${PUBLIC_BASE_PREFIX}/`)) {
      const strippedPath = initialPath.slice(PUBLIC_BASE_PREFIX.length) || '/';
      if (strippedPath !== '/') {
        const suffix = `${window.location.search || ''}${window.location.hash || ''}`;
        origReplaceState(window.history.state, '', `${strippedPath}${suffix}`);
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => {
            if (window.location.pathname === strippedPath) {
              origReplaceState(
                window.history.state,
                '',
                `${PUBLIC_BASE_PREFIX}${strippedPath}${suffix}`
              );
            }
          });
        }
      }
    }

    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      origPushState(data, unused, prefixSubpathRouteUrl(url));
    };
    window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      origReplaceState(data, unused, prefixSubpathRouteUrl(url));
    };
  }
}


