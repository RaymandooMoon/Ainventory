import { flushSync } from 'react-dom';

export interface CircleOrigin {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ResolveCircleOriginParams {
  rect?: RectLike | null;
  clientX?: number;
  clientY?: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

/**
 * Resolves the circular ripple origin `(cx, cy)` from the clicked button center,
 * falling back to pointer coordinates or the top-right utility control zone.
 */
export function resolveCircleOrigin({
  rect,
  clientX,
  clientY,
  viewportWidth,
  viewportHeight,
}: ResolveCircleOriginParams): CircleOrigin {
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);

  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      x: Math.round(rect.left + rect.width * 0.5),
      y: Math.round(rect.top + rect.height * 0.5),
    };
  }

  if (
    typeof clientX === 'number' &&
    typeof clientY === 'number' &&
    Number.isFinite(clientX) &&
    Number.isFinite(clientY) &&
    (clientX > 0 || clientY > 0)
  ) {
    return {
      x: Math.round(Math.max(0, Math.min(vw, clientX))),
      y: Math.round(Math.max(0, Math.min(vh, clientY))),
    };
  }

  return {
    x: Math.max(24, Math.round(vw - 64)),
    y: Math.min(vh - 24, 38),
  };
}

/**
 * Computes the exact farthest-corner radius so the circular reveal completely
 * covers every corner of the viewport without clipping.
 */
export function computeCircleRevealRadius(
  cx: number,
  cy: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  const dx = Math.max(cx, Math.max(0, viewportWidth - cx));
  const dy = Math.max(cy, Math.max(0, viewportHeight - cy));
  return Math.ceil(Math.hypot(dx, dy));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function extractRectFromEvent(event?: unknown): RectLike | null {
  if (!event || typeof event !== 'object') return null;
  const ev = event as {
    currentTarget?: { getBoundingClientRect?: () => RectLike } | null;
    target?: { closest?: (sel: string) => { getBoundingClientRect?: () => RectLike } | null; getBoundingClientRect?: () => RectLike } | null;
  };
  const ctRect = ev.currentTarget?.getBoundingClientRect?.();
  if (ctRect && ctRect.width > 0 && ctRect.height > 0) return ctRect;

  const btnEl = ev.target?.closest?.('button, [role="button"]');
  const btnRect = btnEl?.getBoundingClientRect?.() ?? ev.target?.getBoundingClientRect?.();
  if (btnRect && btnRect.width > 0 && btnRect.height > 0) return btnRect;
  return null;
}

function spawnFallbackRippleWave(x: number, y: number, maxRadius: number): void {
  if (typeof document === 'undefined' || !document.body) return;
  const ring = document.createElement('span');
  ring.className = 'atelier-theme-ripple-ring';
  const diameter = maxRadius * 2;
  ring.style.width = `${diameter}px`;
  ring.style.height = `${diameter}px`;
  ring.style.left = `${x - maxRadius}px`;
  ring.style.top = `${y - maxRadius}px`;
  document.body.appendChild(ring);
  window.setTimeout(() => {
    ring.remove();
  }, 660);
}

export interface RunCircularThemeTransitionOptions {
  event?: unknown;
  applyTheme: () => void;
  durationMs?: number;
}

/**
 * Transitions theme via an expanding circular clip-path originating from the
 * clicked toggle button center `(cx, cy)` using the View Transitions API.
 */
export function runCircularThemeTransition({
  event,
  applyTheme,
  durationMs = 640,
}: RunCircularThemeTransitionOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    applyTheme();
    return;
  }

  const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const evObj = (event && typeof event === 'object' ? event : {}) as {
    clientX?: number;
    clientY?: number;
  };
  const origin = resolveCircleOrigin({
    rect: extractRectFromEvent(event),
    clientX: evObj.clientX,
    clientY: evObj.clientY,
    viewportWidth: vw,
    viewportHeight: vh,
  });
  const maxRadius = computeCircleRevealRadius(origin.x, origin.y, vw, vh);

  const rootEl = document.documentElement;
  rootEl.dataset.themeOrigin = `${origin.x},${origin.y}`;
  rootEl.dataset.themeRadius = String(maxRadius);

  if (prefersReducedMotion()) {
    applyTheme();
    return;
  }

  const doc = document as DocumentWithViewTransition;
  if (typeof doc.startViewTransition !== 'function') {
    rootEl.dataset.themeTransitioning = '1';
    applyTheme();
    spawnFallbackRippleWave(origin.x, origin.y, maxRadius);
    window.setTimeout(() => {
      delete rootEl.dataset.themeTransitioning;
    }, 80);
    return;
  }

  rootEl.dataset.themeTransitioning = '1';
  let transition: ViewTransitionLike;
  try {
    transition = doc.startViewTransition(() => {
      flushSync(() => {
        applyTheme();
      });
    });
  } catch {
    delete rootEl.dataset.themeTransitioning;
    applyTheme();
    spawnFallbackRippleWave(origin.x, origin.y, maxRadius);
    return;
  }

  void transition.ready
    .then(() => {
      delete rootEl.dataset.themeTransitioning;
      rootEl.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${maxRadius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: durationMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
          fill: 'both',
        }
      );
    })
    .catch(() => {
      delete rootEl.dataset.themeTransitioning;
    });

  void transition.finished.finally(() => {
    delete rootEl.dataset.themeTransitioning;
  });
}
