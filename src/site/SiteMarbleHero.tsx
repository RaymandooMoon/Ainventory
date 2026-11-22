import { memo, useEffect, useRef, useState } from 'react';
import {
  createLoginThreeController,
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeController,
  type LoginThreeVariantId,
  type MarbleStepSnapshot,
} from '../components/auth/loginThreeScenes.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import type { SiteTheme } from './siteContent.ts';

export interface SiteMarbleHeroProps {
  readonly theme: SiteTheme;
  readonly motionVariant: LoginThreeVariantId;
  readonly variantChangeOrigin: { readonly x: number; readonly y: number; readonly seq: number } | null;
  readonly heroRootRef: React.RefObject<HTMLElement | null>;
}

interface DeviceOrientationConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  const screenAngle = window.screen?.orientation?.angle;
  if (typeof screenAngle === 'number' && Number.isFinite(screenAngle)) {
    return screenAngle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : 0;
}

/**
 * Full-viewport Hero Intro 3D Silk Cloth + Rolling Glass Marble Canvas.
 * Reuses the exact Three.js shader & physics engine from the Ainventory login intro
 * (`createLoginThreeController`) with bounding-rect coordinates, marble-to-button
 * collision bounces, mobile gyroscope tilt, and IntersectionObserver GPU pause.
 */
const SiteMarbleHero = memo(function SiteMarbleHero({
  theme,
  motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
  variantChangeOrigin = null,
  heroRootRef,
}: SiteMarbleHeroProps) {
  const isDark = theme === 'dark';
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<LoginThreeController | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);

  const initialDarkRef = useRef(isDark);
  const initialVariantRef = useRef<LoginThreeVariantId>(motionVariant);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    controllerRef.current?.setTheme(isDark, false);
  }, [isDark]);

  useEffect(() => {
    controllerRef.current?.setVariant(
      motionVariant,
      variantChangeOrigin?.x,
      variantChangeOrigin?.y
    );
  }, [motionVariant, variantChangeOrigin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stageEl = stageRef.current;
    if (!canvas || !stageEl || typeof window === 'undefined') return undefined;

    const reducedMotion = Boolean(
      typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    interface CachedButtonTarget {
      readonly el: HTMLElement;
      readonly rect: DOMRect;
    }

    let cachedTargets: CachedButtonTarget[] = [];
    let cachedStageRect: DOMRect | null = null;
    let cacheTimestamp = 0;
    let globalHitCooldownUntil = 0;
    const perTargetCooldown = new WeakMap<HTMLElement, number>();
    const activeHitTimers = new Set<number>();

    const invalidateCache = () => {
      cacheTimestamp = 0;
    };

    const refreshTargets = (now: number) => {
      cachedStageRect = stageEl.getBoundingClientRect();
      const heroEl = heroRootRef.current ?? stageEl.parentElement;
      if (!heroEl || !cachedStageRect.width || !cachedStageRect.height) {
        cachedTargets = [];
        cacheTimestamp = now;
        return;
      }

      const nodes = heroEl.querySelectorAll<HTMLElement>('[data-marble-target="true"]');
      const next: CachedButtonTarget[] = [];
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (el.getAttribute('aria-disabled') === 'true') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 16) continue;
        if (
          rect.bottom <= cachedStageRect.top ||
          rect.top >= cachedStageRect.bottom ||
          rect.right <= cachedStageRect.left ||
          rect.left >= cachedStageRect.right
        ) {
          continue;
        }
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        next.push({ el, rect });
      }
      cachedTargets = next;
      cacheTimestamp = now;
    };

    const handleMarbleStep = (snap: MarbleStepSnapshot) => {
      const ctrl = controllerRef.current;
      if (!ctrl || !isVisibleRef.current) return;
      const minStrikeSpeed = snap.isGrabbing ? 0.04 : 0.16;
      if (!snap.userDriven || snap.elapsed < 0.45 || snap.speed < minStrikeSpeed) return;

      const now = performance.now();
      if (now < globalHitCooldownUntil) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;

      if (now - cacheTimestamp > 100 || !cachedStageRect) {
        refreshTargets(now);
      }
      const stageRect = cachedStageRect;
      if (!stageRect || !stageRect.width || !stageRect.height || cachedTargets.length === 0) {
        return;
      }

      const mx = stageRect.left + snap.u * stageRect.width;
      const my = stageRect.top + (1 - snap.v) * stageRect.height;
      const radiusPx = snap.radiusNormY * stageRect.height;
      const hitRadiusPx = radiusPx * 0.9;
      const hitRadiusSq = hitRadiusPx * hitRadiusPx;
      const pxPerWorld = stageRect.height * 0.5;
      const velPxX = snap.vx * pxPerWorld;
      const velPxY = -snap.vy * pxPerWorld;

      for (let i = 0; i < cachedTargets.length; i += 1) {
        const { el, rect } = cachedTargets[i];
        if (now < (perTargetCooldown.get(el) || 0)) continue;

        const cx = Math.max(rect.left, Math.min(mx, rect.right));
        const cy = Math.max(rect.top, Math.min(my, rect.bottom));
        const dx = mx - cx;
        const dy = my - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq > hitRadiusSq) continue;

        let nxPx = 0;
        let nyPx = -1;
        let overlapPx = 0;
        let isInsideRect = false;

        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          nxPx = dx / dist;
          nyPx = dy / dist;
          overlapPx = hitRadiusPx - dist;
        } else {
          isInsideRect = true;
          const dTop = Math.abs(my - rect.top);
          const dBottom = Math.abs(rect.bottom - my);
          const dLeft = Math.abs(mx - rect.left);
          const dRight = Math.abs(rect.right - mx);
          const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
          if (minEdge === dTop) {
            nyPx = -1;
            overlapPx = dTop + hitRadiusPx;
          } else if (minEdge === dBottom) {
            nyPx = 1;
            overlapPx = dBottom + hitRadiusPx;
          } else if (minEdge === dLeft) {
            nxPx = -1;
            nyPx = 0;
            overlapPx = dLeft + hitRadiusPx;
          } else {
            nxPx = 1;
            nyPx = 0;
            overlapPx = dRight + hitRadiusPx;
          }
        }

        const approachDot = velPxX * nxPx + velPxY * nyPx;
        if (!isInsideRect && approachDot > 24) continue;

        const worldPerPx = 2.0 / Math.max(1, stageRect.height);
        const pushPx = Math.min(overlapPx + 3, radiusPx * 2.2);
        ctrl.bounceMarble?.(
          nxPx,
          -nyPx,
          nxPx * pushPx * worldPerPx,
          -nyPx * pushPx * worldPerPx,
          0.88,
          0.68
        );

        globalHitCooldownUntil = now + 360;
        perTargetCooldown.set(el, now + 950);
        invalidateCache();

        el.classList.remove('is-marble-hit');
        void el.offsetWidth;
        el.classList.add('is-marble-hit');
        const hitTimer = window.setTimeout(() => {
          el.classList.remove('is-marble-hit');
          activeHitTimers.delete(hitTimer);
        }, 380);
        activeHitTimers.add(hitTimer);

        triggerHaptic('selection');

        // Only trigger toggle controls (silk/theme/lang) on marble hit; CTA buttons bounce without surprise scroll jumps
        if (el.dataset.marbleAction === 'click') {
          try {
            el.dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: cx,
                clientY: cy,
                view: window,
              })
            );
          } catch {
            el.click();
          }
        }
        return;
      }
    };

    const controller = createLoginThreeController(canvas, {
      initialDark: initialDarkRef.current,
      initialStage: 'intro',
      initialVariant: initialVariantRef.current,
      reducedMotion,
      onMarbleStep: handleMarbleStep,
    });

    if (!controller) {
      setWebglFallback(true);
      return undefined;
    }

    controllerRef.current = controller;

    // Normalize pointer coordinates against the hero stage bounds (handles scroll offset cleanly)
    let lastNormX = 0;
    let lastNormY = 0;

    const toHeroNorm = (clientX: number, clientY: number) => {
      const rect = stageEl.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const nx = ((clientX - rect.left) / w) * 2 - 1;
      const ny = -(((clientY - rect.top) / h) * 2 - 1);
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      return { nx, ny, inside };
    };

    const pushPointer = (clientX: number, clientY: number, allowBrush = true) => {
      if (!isVisibleRef.current) return;
      const { nx, ny, inside } = toHeroNorm(clientX, clientY);
      if (!inside) return;
      const velocity = allowBrush ? Math.hypot(nx - lastNormX, ny - lastNormY) : 0;
      lastNormX = nx;
      lastNormY = ny;
      controller.setPointer(nx, ny, velocity);
    };

    const onWheel = (e: WheelEvent) => {
      if (!isVisibleRef.current || !Number.isFinite(e.deltaY) || e.deltaY === 0) return;
      const { nx, inside } = toHeroNorm(e.clientX, e.clientY);
      if (!inside) return;
      controller.pushScrollImpulse(nx, e.deltaY * 0.6);
    };

    let touchFallbackActive = false;
    let lastTouchNx = 0;
    let lastTouchNy = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (!isVisibleRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function') {
        const marbleTarget = target.closest<HTMLElement>('[data-marble-target="true"]');
        if (marbleTarget) {
          const now = performance.now();
          perTargetCooldown.set(marbleTarget, now + 1500);
          globalHitCooldownUntil = Math.max(globalHitCooldownUntil, now + 500);
          return;
        }
        if (target.closest('button, a, input')) {
          return;
        }
      }
      const { nx, ny, inside } = toHeroNorm(e.clientX, e.clientY);
      if (!inside) return;
      touchFallbackActive = false;
      controller.setPointerDown?.(true, nx, ny);
      pushPointer(e.clientX, e.clientY, false);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) {
        const target = e.target as HTMLElement | null;
        if (target && typeof target.closest === 'function' && target.closest('button, a, input')) {
          return;
        }
      }
      pushPointer(e.clientX, e.clientY, true);
    };

    const onPointerUp = () => {
      touchFallbackActive = false;
      controller.setPointerDown?.(false);
    };

    const onPointerCancel = () => {
      controller.setPointerDown?.(false);
      touchFallbackActive = true;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!isVisibleRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const { nx, ny, inside } = toHeroNorm(t.clientX, t.clientY);
      if (!inside) return;
      lastTouchNx = nx;
      lastTouchNy = ny;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isVisibleRef.current || !touchFallbackActive || e.touches.length !== 1) return;
      const t = e.touches[0];
      const { nx, ny, inside } = toHeroNorm(t.clientX, t.clientY);
      if (!inside) return;
      const dx = nx - lastTouchNx;
      const dy = ny - lastTouchNy;
      lastTouchNx = nx;
      lastTouchNy = ny;
      controller.pushDirectionalSwipe?.(dx, dy);
    };

    const onTouchEnd = () => {
      touchFallbackActive = false;
    };

    // Mobile Gyroscope / DeviceOrientation with Auto-Zero posture calibration
    let gyroAttached = false;
    let gyroPermissionRequested = false;
    let calibSamples = 0;
    let baseBeta = 0;
    let baseGamma = 0;
    let prevTiltX = 0;
    let prevTiltY = 0;

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (!isVisibleRef.current) return;
      if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;
      if (!Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;

      if (calibSamples < 5) {
        calibSamples += 1;
        baseBeta += (e.beta - baseBeta) / calibSamples;
        baseGamma += (e.gamma - baseGamma) / calibSamples;
        return;
      }

      const relGamma = e.gamma - baseGamma;
      const relBeta = e.beta - baseBeta;
      const angle = getScreenOrientationAngle();
      let rawX = relGamma / 24;
      let rawY = -relBeta / 24;
      if (angle === 90) {
        rawX = relBeta / 24;
        rawY = relGamma / 24;
      } else if (angle === -90 || angle === 270) {
        rawX = -relBeta / 24;
        rawY = -relGamma / 24;
      } else if (angle === 180) {
        rawX = -rawX;
        rawY = -rawY;
      }

      const tx = Math.max(-1, Math.min(1, rawX));
      const ty = Math.max(-1, Math.min(1, rawY));
      const dtx = tx - prevTiltX;
      const dty = ty - prevTiltY;
      prevTiltX = tx;
      prevTiltY = ty;

      if (Math.abs(rawX) < 0.14 && Math.abs(rawY) < 0.14) {
        baseBeta += (e.beta - baseBeta) * 0.004;
        baseGamma += (e.gamma - baseGamma) * 0.004;
      }
      controller.setTilt(tx, ty, dtx, dty);
    };

    const attachGyro = () => {
      if (gyroAttached) return;
      gyroAttached = true;
      window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    };

    const devOrientCtor =
      typeof window.DeviceOrientationEvent !== 'undefined'
        ? (window.DeviceOrientationEvent as unknown as DeviceOrientationConstructorWithPermission)
        : null;
    const requiresIosPermission = typeof devOrientCtor?.requestPermission === 'function';

    const requestIosGyro = () => {
      if (gyroPermissionRequested || !requiresIosPermission || !devOrientCtor?.requestPermission) {
        return;
      }
      gyroPermissionRequested = true;
      window.removeEventListener('click', requestIosGyro, true);
      window.removeEventListener('touchend', requestIosGyro, true);
      try {
        const resultPromise = devOrientCtor.requestPermission();
        if (resultPromise && typeof resultPromise.then === 'function') {
          void resultPromise
            .then((state) => {
              if (state === 'granted') attachGyro();
            })
            .catch(() => {
              // Permission denied — seamlessly fall back to pointer/touch interaction
            });
        }
      } catch {
        // Ignore restricted environments
      }
    };

    if (!reducedMotion && devOrientCtor) {
      if (requiresIosPermission) {
        window.addEventListener('click', requestIosGyro, true);
        window.addEventListener('touchend', requestIosGyro, true);
      } else {
        attachGyro();
      }
    }

    const handleResize = () => {
      invalidateCache();
      const rect = stageEl.getBoundingClientRect();
      controller.resize(
        Math.max(1, Math.round(rect.width || window.innerWidth)),
        Math.max(1, Math.round(rect.height || window.innerHeight))
      );
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(stageEl);
    }

    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const visible = Boolean(entry && entry.isIntersecting);
          isVisibleRef.current = visible;
          controller.setPaused(!visible);
          if (visible) invalidateCache();
        },
        { threshold: 0.02 }
      );
      intersectionObserver.observe(stageEl);
    }

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', invalidateCache, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      activeHitTimers.forEach((tid) => window.clearTimeout(tid));
      activeHitTimers.clear();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', invalidateCache);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('click', requestIosGyro, true);
      window.removeEventListener('touchend', requestIosGyro, true);
      if (gyroAttached) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
      }
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [heroRootRef]);

  return (
    <div
      ref={stageRef}
      className={`site-marble-stage ${webglFallback ? 'is-webgl-fallback' : ''}`}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-motion-variant={motionVariant}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="site-marble-canvas" />
      <div className="site-marble-veil" />
    </div>
  );
});

export default SiteMarbleHero;
