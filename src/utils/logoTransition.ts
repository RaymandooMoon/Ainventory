export type AppNavTab = 'closet' | 'outfits' | 'calendar' | 'stats';

export interface LogoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PendingLogoFlight {
  rect: LogoRect;
  timestamp: number;
}

export interface LogoFlipTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  transformCss: string;
}

export const MAX_LOGO_FLIGHT_AGE_MS = 2500;

let pendingLogoFlight: PendingLogoFlight | null = null;

export function capturePendingLogoFlight(
  element: { getBoundingClientRect: () => LogoRect } | null | undefined,
  now: number = Date.now()
): PendingLogoFlight | null {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    pendingLogoFlight = null;
    return null;
  }
  const r = element.getBoundingClientRect();
  if (!Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width <= 0 || r.height <= 0) {
    pendingLogoFlight = null;
    return null;
  }
  pendingLogoFlight = {
    rect: {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    },
    timestamp: now,
  };
  return pendingLogoFlight;
}

export function consumePendingLogoFlight(now: number = Date.now()): LogoRect | null {
  const current = pendingLogoFlight;
  pendingLogoFlight = null;
  if (!current) return null;
  if (now - current.timestamp > MAX_LOGO_FLIGHT_AGE_MS || now < current.timestamp) {
    return null;
  }
  return current.rect;
}

export function clearPendingLogoFlight(): void {
  pendingLogoFlight = null;
}

export function computeLogoFlipTransform(
  sourceRect: LogoRect | null | undefined,
  targetRect: LogoRect | null | undefined
): LogoFlipTransform | null {
  if (!sourceRect || !targetRect) return null;
  if (
    targetRect.width <= 0 ||
    targetRect.height <= 0 ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0
  ) {
    return null;
  }

  const sourceCx = sourceRect.left + sourceRect.width / 2;
  const sourceCy = sourceRect.top + sourceRect.height / 2;
  const targetCx = targetRect.left + targetRect.width / 2;
  const targetCy = targetRect.top + targetRect.height / 2;

  const translateX = Number((sourceCx - targetCx).toFixed(2));
  const translateY = Number((sourceCy - targetCy).toFixed(2));
  const scaleX = Number((sourceRect.width / targetRect.width).toFixed(4));
  const scaleY = Number((sourceRect.height / targetRect.height).toFixed(4));

  return {
    translateX,
    translateY,
    scaleX,
    scaleY,
    transformCss: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`,
  };
}

export function resolveInitialTabFromPath(pathname: string): AppNavTab {
  const normalized = String(pathname || '/').trim() || '/';
  if (normalized === '/' || normalized.startsWith('/outfits')) {
    return 'outfits';
  }
  if (normalized.startsWith('/closet') || /^\/item\/-?\d+\/?$/.test(normalized)) {
    return 'closet';
  }
  if (normalized.startsWith('/calendar')) {
    return 'calendar';
  }
  if (normalized.startsWith('/stats')) {
    return 'stats';
  }
  return 'outfits';
}

export function getPathForTab(tab: AppNavTab): string {
  if (tab === 'closet') return '/closet';
  if (tab === 'calendar') return '/calendar';
  if (tab === 'stats') return '/stats';
  return '/';
}
