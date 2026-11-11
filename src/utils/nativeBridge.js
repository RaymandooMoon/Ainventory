/**
 * Mobile Native Bridge, Hardware Back Stack, Micro-Haptics & Apple HIG Theme/Status Bus
 * (Requirements 9.a, 11.a, 13.b, 14.b)
 */

const THEME_KEY = 'ainventory_theme_pref';
const CAMERA_NOTICE_KEY = 'ainventory_camera_rationale_ack';
const BIOMETRIC_CONSENT_KEY = 'ainventory_biometric_consent_ack';

const backHandlers = [];
let capBackListenerBound = false;
const statusListeners = new Set();

export async function initNativeBackBridge() {
  if (capBackListenerBound || typeof window === 'undefined') return;
  capBackListenerBound = true;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
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
          CapApp.exitApp();
        }
      });
    }
  } catch {
    // Running in standard browser environment
  }
}

export function pushBackHandler(handlerFn) {
  backHandlers.push(handlerFn);
  return () => {
    const idx = backHandlers.lastIndexOf(handlerFn);
    if (idx >= 0) backHandlers.splice(idx, 1);
  };
}

export async function triggerHaptic(kind = 'light') {
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
      navigator.vibrate(kind === 'medium' ? 10 : 5);
    }
  } catch {
    // ignore
  }
}

// Dynamic Island-style silent top Status Capsule pub/sub (Requirement 13.b)
export function subscribeStatusCapsule(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function emitStatusCapsule(payload) {
  const normalized =
    typeof payload === 'string'
      ? { message: payload, icon: 'check', id: Date.now() + Math.random() }
      : { icon: 'check', ...payload, id: Date.now() + Math.random() };
  triggerHaptic(normalized.haptic || 'selection');
  for (const fn of statusListeners) {
    try {
      fn(normalized);
    } catch {
      // ignore
    }
  }
}

// Apple HIG Light / Dark / System Theme Engine (Requirement 11.a)
export function getThemePreference() {
  if (typeof localStorage === 'undefined') return 'light';
  return localStorage.getItem(THEME_KEY) || 'light';
}

export function resolveEffectiveTheme(pref = getThemePreference()) {
  if (pref === 'dark' || pref === 'light') return pref;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyThemePreference(pref = getThemePreference()) {
  if (typeof document === 'undefined') return 'light';
  localStorage.setItem(THEME_KEY, pref);
  const effective = resolveEffectiveTheme(pref);
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', effective === 'dark' ? '#000000' : '#FFFFFF');
  }
  return effective;
}

// Requirement 14.b: Automatic Vibrancy degradation when 3D WebGL FPS drops
export function setVibrancySolidFallback(enabled) {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.dataset.vibrancyFallback = 'solid';
  } else {
    delete document.documentElement.dataset.vibrancyFallback;
  }
}

// Requirement 10.c: Pre-permission rationale & biometric local-processing consent flags
export function hasAcknowledgedCameraNotice() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(CAMERA_NOTICE_KEY) === '1';
}

export function setAcknowledgedCameraNotice() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CAMERA_NOTICE_KEY, '1');
}

export function hasBiometricConsent() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(BIOMETRIC_CONSENT_KEY) === '1';
}

export function setBiometricConsent(granted = true) {
  if (typeof localStorage === 'undefined') return;
  if (granted) localStorage.setItem(BIOMETRIC_CONSENT_KEY, '1');
  else localStorage.removeItem(BIOMETRIC_CONSENT_KEY);
}
export const getStoredThemePreference = getThemePreference;
export const acknowledgeCameraNotice = setAcknowledgedCameraNotice;
