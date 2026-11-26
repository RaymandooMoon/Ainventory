/**
 * Apple iOS Safari / WebKit runtime detection & safe compatibility primitives.
 *
 * Isolates iPhone / iPad Safari workarounds (GPU memory & DPR bounds, WebGL
 * single-pass glass fast path, canvas WebP encoder fallback, safe pointer
 * capture) without altering desktop Chrome or Android behavior.
 */

export interface NavigatorLike {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly maxTouchPoints?: number;
}

function getDefaultNavigator(): NavigatorLike | null {
  if (typeof navigator === 'undefined') return null;
  return navigator;
}

/**
 * Returns true on iPhone, iPad, iPod, and iPadOS desktop-mode Safari
 * (`Macintosh` user-agent with multi-touch `maxTouchPoints > 1`).
 */
export function isIosTouchDevice(nav: NavigatorLike | null = getDefaultNavigator()): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true;
  }
  const platform = nav.platform ?? '';
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  return (platform === 'MacIntel' || /Macintosh/i.test(ua)) && touchPoints > 1;
}

/**
 * Returns true when running on Apple iOS WebKit (Safari and all iOS browsers,
 * which all use Apple WebKit / Metal ANGLE under iOS).
 */
export function isIosSafariRuntime(nav: NavigatorLike | null = getDefaultNavigator()): boolean {
  if (!nav) return false;
  if (!isIosTouchDevice(nav)) return false;
  const ua = nav.userAgent ?? '';
  return /AppleWebKit/i.test(ua) || ua.length === 0;
}

/**
 * Tags `<html data-ios-safari="true">` once on iOS Safari runtimes so CSS can
 * tune backdrop blur radius and skip entry-animation opacity stalls safely.
 */
export function applyIosSafariDocumentFlag(
  nav: NavigatorLike | null = getDefaultNavigator()
): boolean {
  const isIos = isIosSafariRuntime(nav);
  if (isIos && typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.iosSafari = 'true';
  }
  return isIos;
}

let cachedCanvasWebpSupport: boolean | null = null;

/**
 * Feature-detects whether HTMLCanvasElement supports `image/webp` encoding.
 * Older / certain WebKit builds silently fall back to PNG or return null from
 * `canvas.toBlob(..., 'image/webp')`; callers can use `'image/png'` instead.
 */
export function supportsCanvasWebpEncode(): boolean {
  if (cachedCanvasWebpSupport !== null) {
    return cachedCanvasWebpSupport;
  }
  if (typeof document === 'undefined') {
    cachedCanvasWebpSupport = false;
    return false;
  }
  try {
    const probe = document.createElement('canvas');
    probe.width = 2;
    probe.height = 2;
    const encoded = probe.toDataURL('image/webp', 0.9);
    cachedCanvasWebpSupport = encoded.startsWith('data:image/webp');
  } catch {
    cachedCanvasWebpSupport = false;
  }
  return cachedCanvasWebpSupport;
}

/**
 * Safely invokes `setPointerCapture` without throwing `InvalidStateError`
 * on canceled or synthetic touch pointers in iOS Safari.
 */
export function safeSetPointerCapture(
  el: Element | null | undefined,
  pointerId: number
): boolean {
  if (!el || typeof (el as HTMLElement).setPointerCapture !== 'function') {
    return false;
  }
  try {
    (el as HTMLElement).setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely invokes `releasePointerCapture` if currently captured.
 */
export function safeReleasePointerCapture(
  el: Element | null | undefined,
  pointerId: number
): void {
  if (!el || typeof (el as HTMLElement).releasePointerCapture !== 'function') {
    return;
  }
  try {
    const target = el as HTMLElement;
    if (typeof target.hasPointerCapture !== 'function' || target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore pointer capture state mismatches on WebKit touch cancel
  }
}
