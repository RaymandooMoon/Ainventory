/**
 * Shared client resource prioritization, deferred paint/idle scheduling,
 * staggered image preloading, and progressive list batching helpers.
 *
 * Designed to keep first-paint, Login -> Demo transition, Wardrobe cards,
 * and AI character frames responsive by preventing offscreen images and
 * heavy Three.js/WebGL initialization from saturating the main thread or sockets.
 */

export type ImageFetchPriority = 'high' | 'low' | 'auto';

export interface ImageLoadingProps {
  readonly loading: 'eager' | 'lazy';
  readonly decoding: 'async' | 'sync' | 'auto';
  readonly fetchPriority: ImageFetchPriority;
}

export interface ResolveImageLoadingOptions {
  readonly eager?: boolean;
  readonly priority?: ImageFetchPriority;
}

export interface StaggeredPreloadOptions {
  readonly activeUrl?: string | null;
  readonly delayMs?: number;
}

interface IdleCallbackWindow {
  requestIdleCallback?: (
    cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout?: number }
  ) => number;
  cancelIdleCallback?: (id: number) => void;
}

/**
 * Resolves consistent HTML `<img>` loading/decoding/fetchPriority attributes.
 * Never uses synchronous decoding for non-critical images so decode work stays off the critical path.
 */
export function resolveImageLoadingProps(
  options: ResolveImageLoadingOptions = {}
): ImageLoadingProps {
  const eager = Boolean(options.eager);
  const priority: ImageFetchPriority =
    options.priority ?? (eager ? 'high' : 'low');
  return {
    loading: eager || priority === 'high' ? 'eager' : 'lazy',
    decoding: 'async',
    fetchPriority: priority,
  };
}

/**
 * Schedules non-critical work (chunk pre-warming, background prefetch, secondary WebGL layers)
 * during browser idle time with a safe timer fallback.
 */
export function scheduleIdleTask(task: () => void, timeoutMs = 600): () => void {
  if (typeof window === 'undefined') {
    const timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
  }
  const idleWin = window as unknown as IdleCallbackWindow;
  if (typeof idleWin.requestIdleCallback === 'function') {
    let cancelled = false;
    const id = idleWin.requestIdleCallback(
      () => {
        if (!cancelled) task();
      },
      { timeout: Math.max(50, timeoutMs) }
    );
    return () => {
      cancelled = true;
      idleWin.cancelIdleCallback?.(id);
    };
  }
  const timer = window.setTimeout(task, Math.min(220, Math.max(40, Math.round(timeoutMs * 0.35))));
  return () => window.clearTimeout(timer);
}

/**
 * Defers heavy setup (e.g. WebGL context creation, shader compilation, PMREM lighting)
 * until after the browser commits its first DOM paint frame.
 */
export function scheduleAfterFirstPaint(task: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timer = setTimeout(task, 16);
    return () => clearTimeout(timer);
  }
  let cancelled = false;
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    if (cancelled) return;
    raf2 = window.requestAnimationFrame(() => {
      if (!cancelled) task();
    });
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
  };
}

/**
 * Computes the next visible item count for progressive IntersectionObserver windowing.
 */
export function computeNextVisibleBatch(
  currentCount: number,
  totalCount: number,
  batchSize = 20
): number {
  const safeTotal = Math.max(0, Math.floor(totalCount));
  const safeCurrent = Math.max(0, Math.floor(currentCount));
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.min(safeTotal, safeCurrent + safeBatch);
}

function triggerSingleImagePreload(url: string, priority: ImageFetchPriority): void {
  if (typeof Image === 'undefined' || !url) return;
  const img = new Image();
  img.decoding = 'async';
  if ('fetchPriority' in img) {
    try {
      (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = priority;
    } catch {
      // Ignore read-only environments
    }
  }
  img.src = url;
  if (typeof img.decode === 'function') {
    img.decode().catch(() => {});
  }
}

/**
 * Preloads the active URL immediately at high priority, then lazily staggers
 * secondary URLs (e.g. 7 remaining turnaround angles) one-by-one during idle
 * so they never block the primary character frame or wardrobe grid images.
 */
export function staggeredImagePreload(
  urls: ReadonlyArray<string | null | undefined>,
  options: StaggeredPreloadOptions = {}
): () => void {
  if (typeof Image === 'undefined' || !Array.isArray(urls) || urls.length === 0) {
    return () => {};
  }

  const seen = new Set<string>();
  const activeUrl =
    typeof options.activeUrl === 'string' && options.activeUrl.trim().length > 0
      ? options.activeUrl.trim()
      : null;

  if (activeUrl) {
    seen.add(activeUrl);
    triggerSingleImagePreload(activeUrl, 'high');
  }

  const secondary: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    secondary.push(clean);
  }

  if (secondary.length === 0) {
    return () => {};
  }

  const delayMs = Math.max(24, options.delayMs ?? 90);
  let cancelled = false;
  let idx = 0;
  let cancelCurrent: (() => void) | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const loadNext = () => {
    if (cancelled || idx >= secondary.length) return;
    const nextUrl = secondary[idx];
    idx += 1;
    triggerSingleImagePreload(nextUrl, 'low');
    if (idx < secondary.length && !cancelled) {
      timerId = setTimeout(() => {
        timerId = null;
        if (cancelled) return;
        cancelCurrent = scheduleIdleTask(loadNext, 450);
      }, delayMs);
    }
  };

  cancelCurrent = scheduleIdleTask(loadNext, activeUrl ? 650 : 250);

  return () => {
    cancelled = true;
    cancelCurrent?.();
    cancelCurrent = null;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
}
