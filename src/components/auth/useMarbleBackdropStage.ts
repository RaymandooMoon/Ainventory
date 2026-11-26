import type * as THREE from 'three';
import { useEffect, useRef, useState } from 'react';
import { observeOpenModalDialogs } from '../../utils/adaptiveFramePacer.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { scheduleAfterFirstPaint } from '../../utils/resourcePriority.ts';
import type {
  LoginThreeController,
  LoginThreeOverlayRenderContext,
  MarbleStepSnapshot,
} from './loginThreeScenes.ts';
import {
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeVariantId,
} from './loginThreeVariants.ts';
import {
  computeFloorInsetWorld,
  computeMarbleTargetHit,
  toStageNormalizedCoords,
} from './marbleBackdropMath.ts';

interface DeviceOrientationConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export interface MarbleHitParams {
  readonly impactStrength: number;
  readonly minBounceSpeed: number;
  readonly extraStageCooldownMs?: number;
}

export interface UseMarbleBackdropStageOptions {
  readonly isDark: boolean;
  readonly stage?: 'intro' | 'auth' | 'portal';
  readonly paused?: boolean;
  readonly motionVariant?: LoginThreeVariantId;
  readonly variantChangeOrigin?: { readonly x: number; readonly y: number; readonly seq: number } | null;
  readonly portalSurgeOrigin?: { readonly x: number; readonly y: number } | null;
  readonly cooldownResetKey?: string | number;
  readonly cooldownResetMs?: number;
  readonly getTargetRoot: (stageEl: HTMLElement) => HTMLElement | null;
  readonly getTargetSelector: () => string;
  readonly hitRadiusScale?: number;
  readonly minStrikeSpeed?: number;
  readonly globalHitCooldownMs?: number;
  readonly perTargetCooldownMs?: number;
  readonly pushPaddingPx?: number;
  readonly maxPushRadiusMultiple?: number;
  readonly wheelImpulseScale?: number;
  readonly ignorePointerDownSelector?: string;
  readonly ignoreHoverOverSelector?: string;
  readonly manualTargetSelector?: string;
  readonly isEventExcluded?: (target: EventTarget | null) => boolean;
  readonly shouldDispatchClick?: (el: HTMLElement) => boolean;
  readonly getHitParams?: (el: HTMLElement) => MarbleHitParams;
  readonly onPointerNormalized?: (nx: number, ny: number, stageEl: HTMLElement) => void;
  readonly onPointerLeaveReset?: (stageEl: HTMLElement) => void;
  readonly listenDocumentScroll?: boolean;
  /** Optional website-only bottom floor rail selector for physical marble containment. */
  readonly floorRailSelector?: string;
  /** Optional single-canvas Pass 4 3D stage overlay callbacks (website-only; unused on Login). */
  readonly onOverlayRender?: (ctx: LoginThreeOverlayRenderContext) => boolean;
  readonly onOverlayResize?: (
    width: number,
    height: number,
    renderer: THREE.WebGLRenderer,
    isSoftwareGl?: boolean
  ) => void;
  readonly onOverlayDispose?: () => void;
  readonly onOverlayContextRestored?: (renderer: THREE.WebGLRenderer) => void;
  readonly externalMarbleHidden?: boolean;
  readonly disableHeroMarbleInput?: boolean;
  readonly deferBootUntilPaint?: boolean;
  readonly onControllerReady?: (ctrl: LoginThreeController | null) => void;
}

export interface UseMarbleBackdropStageResult {
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly webglFallback: boolean;
}

interface CachedTarget {
  readonly el: HTMLElement;
  readonly rect: DOMRect;
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

function isDisabledOrBusyButton(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-busy') === 'true') {
    return true;
  }
  return 'disabled' in el && Boolean((el as HTMLButtonElement).disabled);
}

/**
 * Shared 3D Silk Cloth + Rolling Glass Marble Backdrop Stage Hook.
 * Powers BOTH the app login screen (`LoginBackdropCanvas`) and the official website (`SiteMarbleHero`),
 * ensuring shader, marble physics, gyroscope tilt, touch swipe, modal 0fps auto-pause, and button
 * collision updates automatically stay 100% synchronized across both surfaces.
 */
export function useMarbleBackdropStage(
  options: UseMarbleBackdropStageOptions
): UseMarbleBackdropStageResult {
  const {
    isDark,
    stage = 'intro',
    paused = false,
    motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
    variantChangeOrigin = null,
    portalSurgeOrigin = null,
    cooldownResetKey,
    cooldownResetMs = 680,
    floorRailSelector,
    externalMarbleHidden,
    disableHeroMarbleInput = false,
  } = options;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<LoginThreeController | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);

  const optionsRef = useRef(options);
  const initialDarkRef = useRef(isDark);
  const initialStageRef = useRef<'intro' | 'auth' | 'portal'>(stage);
  const initialVariantRef = useRef<LoginThreeVariantId>(motionVariant);
  const stageModeRef = useRef<'intro' | 'auth' | 'portal'>(stage);
  const propPausedRef = useRef(paused);
  const modalPausedRef = useRef(false);
  const pausedModeRef = useRef(paused);
  const stageCooldownUntilRef = useRef(0);
  const prevResetKeyRef = useRef<string | number | undefined>(cooldownResetKey);
  const invalidateCacheRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  const syncEffectivePause = () => {
    const effective = propPausedRef.current || modalPausedRef.current || document.hidden;
    pausedModeRef.current = effective;
    controllerRef.current?.setPaused(effective);
  };

  useEffect(() => {
    const isViewTransitioning =
      typeof document !== 'undefined' && document.documentElement.dataset.themeTransitioning === '1';
    controllerRef.current?.setTheme(isDark, isViewTransitioning);
  }, [isDark]);

  useEffect(() => {
    if (stageModeRef.current !== stage) {
      stageModeRef.current = stage;
      stageCooldownUntilRef.current = performance.now() + cooldownResetMs;
      invalidateCacheRef.current?.();
    }
    controllerRef.current?.setStage(stage);
  }, [stage, cooldownResetMs]);

  useEffect(() => {
    if (prevResetKeyRef.current !== cooldownResetKey) {
      prevResetKeyRef.current = cooldownResetKey;
      stageCooldownUntilRef.current = performance.now() + cooldownResetMs;
      invalidateCacheRef.current?.();
    }
  }, [cooldownResetKey, cooldownResetMs]);

  useEffect(() => {
    propPausedRef.current = paused;
    const effective = propPausedRef.current || modalPausedRef.current || document.hidden;
    pausedModeRef.current = effective;
    controllerRef.current?.setPaused(effective);
  }, [paused]);

  useEffect(() => {
    controllerRef.current?.setVariant(
      motionVariant,
      variantChangeOrigin?.x,
      variantChangeOrigin?.y
    );
  }, [motionVariant, variantChangeOrigin]);

  useEffect(() => {
    if (!portalSurgeOrigin) return;
    controllerRef.current?.triggerLoginSurge(portalSurgeOrigin.x, portalSurgeOrigin.y);
  }, [portalSurgeOrigin]);

  useEffect(() => {
    if (typeof externalMarbleHidden !== 'boolean') return;
    controllerRef.current?.setExternalMarbleHidden?.(externalMarbleHidden);
  }, [externalMarbleHidden]);

  useEffect(() => {
    if (disableHeroMarbleInput) {
      controllerRef.current?.setPointerDown?.(false);
      controllerRef.current?.setTilt(0, 0, 0, 0);
    }
  }, [disableHeroMarbleInput]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stageEl = stageRef.current;
    if (!canvas || !stageEl || typeof window === 'undefined') return undefined;

    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reducedMotion = Boolean(reducedMotionQuery?.matches);

    let cachedTargets: CachedTarget[] = [];
    let cachedStageRect: DOMRect | null = null;
    let cacheTimestamp = 0;
    let globalHitCooldownUntil = 0;
    let floorRailCooldownUntil = 0;
    const perTargetCooldown = new WeakMap<HTMLElement, number>();
    const activeTimers = new Set<number>();

    const invalidateCache = () => {
      cacheTimestamp = 0;
    };
    invalidateCacheRef.current = invalidateCache;

    const refreshTargets = (now: number) => {
      cachedStageRect = stageEl.getBoundingClientRect();
      const opts = optionsRef.current;
      const rootEl = opts.getTargetRoot(stageEl);
      if (
        !rootEl ||
        stageModeRef.current === 'portal' ||
        !cachedStageRect.width ||
        !cachedStageRect.height
      ) {
        cachedTargets = [];
        cacheTimestamp = now;
        return;
      }

      const selector = opts.getTargetSelector();
      if (!selector) {
        cachedTargets = [];
        cacheTimestamp = now;
        return;
      }

      const candidates = rootEl.querySelectorAll<HTMLElement>(selector);
      const next: CachedTarget[] = [];
      for (let i = 0; i < candidates.length; i += 1) {
        const el = candidates[i];
        if (isDisabledOrBusyButton(el)) continue;
        if (el.closest('[inert], [aria-hidden="true"], .is-hidden, .is-dismissed')) continue;
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
        if (
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          style.pointerEvents === 'none'
        ) {
          continue;
        }
        if (Number.parseFloat(style.opacity || '1') < 0.25) continue;
        next.push({ el, rect });
      }

      cachedTargets = next;
      cacheTimestamp = now;
    };

    const handleMarbleStep = (snap: MarbleStepSnapshot) => {
      const ctrl = controllerRef.current;
      if (!ctrl || pausedModeRef.current || document.hidden || stageModeRef.current === 'portal') {
        return;
      }

      const opts = optionsRef.current;
      if (opts.disableHeroMarbleInput) return;
      const minStrikeSpeed = snap.isGrabbing ? 0.04 : (opts.minStrikeSpeed ?? 0.16);
      if (!snap.userDriven || snap.elapsed < 0.45 || snap.speed < minStrikeSpeed) return;

      const now = performance.now();
      if (now < globalHitCooldownUntil || now < stageCooldownUntilRef.current) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;

      if (now - cacheTimestamp > 90 || !cachedStageRect) {
        refreshTargets(now);
      }
      const stageRect = cachedStageRect;
      if (!stageRect || !stageRect.width || !stageRect.height || cachedTargets.length === 0) {
        return;
      }

      const mx = stageRect.left + snap.u * stageRect.width;
      const my = stageRect.top + (1 - snap.v) * stageRect.height;
      const radiusPx = snap.radiusNormY * stageRect.height;
      const hitRadiusPx = radiusPx * (opts.hitRadiusScale ?? 0.9);
      const pxPerWorld = stageRect.height * 0.5;
      const velPxX = snap.vx * pxPerWorld;
      const velPxY = -snap.vy * pxPerWorld;

      for (let i = 0; i < cachedTargets.length; i += 1) {
        const { el, rect } = cachedTargets[i];
        if (now < (perTargetCooldown.get(el) || 0)) continue;

        const hit = computeMarbleTargetHit({ mx, my, hitRadiusPx, velPxX, velPxY, rect });
        if (!hit) continue;
        if (isDisabledOrBusyButton(el)) continue;

        const hitParams = opts.getHitParams?.(el) ?? {
          impactStrength: 0.84,
          minBounceSpeed: 0.64,
        };
        const worldPerPx = 2.0 / Math.max(1, stageRect.height);
        const pushPad = opts.pushPaddingPx ?? 3;
        const maxPushMult = opts.maxPushRadiusMultiple ?? 2.2;
        const pushPx = Math.min(hit.overlapPx + pushPad, radiusPx * maxPushMult);

        ctrl.bounceMarble?.(
          hit.nxPx,
          -hit.nyPx,
          hit.nxPx * pushPx * worldPerPx,
          -hit.nyPx * pushPx * worldPerPx,
          hitParams.impactStrength,
          hitParams.minBounceSpeed
        );

        globalHitCooldownUntil = now + (opts.globalHitCooldownMs ?? 340);
        perTargetCooldown.set(el, now + (opts.perTargetCooldownMs ?? 950));
        if (hitParams.extraStageCooldownMs) {
          stageCooldownUntilRef.current = now + hitParams.extraStageCooldownMs;
        }
        invalidateCache();

        el.classList.remove('is-marble-hit');
        void el.offsetWidth;
        el.classList.add('is-marble-hit');
        const hitTimer = window.setTimeout(() => {
          el.classList.remove('is-marble-hit');
          activeTimers.delete(hitTimer);
        }, 380);
        activeTimers.add(hitTimer);

        triggerHaptic('selection');

        const allowClick = opts.shouldDispatchClick ? opts.shouldDispatchClick(el) : true;
        if (allowClick) {
          try {
            el.dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: hit.cx,
                clientY: hit.cy,
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

    const handleFloorBounce = () => {
      if (!floorRailSelector) return;
      const now = performance.now();
      if (now < floorRailCooldownUntil) return;
      floorRailCooldownUntil = now + 260;
      const rootEl = optionsRef.current.getTargetRoot(stageEl);
      const railEl = rootEl?.querySelector<HTMLElement>(floorRailSelector);
      if (!railEl) return;
      railEl.classList.remove('is-rail-hit');
      void railEl.offsetWidth;
      railEl.classList.add('is-rail-hit');
      const timer = window.setTimeout(() => {
        railEl.classList.remove('is-rail-hit');
        activeTimers.delete(timer);
      }, 280);
      activeTimers.add(timer);
    };

    let disposed = false;
    let cleanupRuntime: (() => void) | null = null;

    const bootThreeController = async () => {
      let createControllerFn:
        | typeof import('./loginThreeScenes.ts').createLoginThreeController
        | null = null;
      try {
        const mod = await import('./loginThreeScenes.ts');
        createControllerFn = mod.createLoginThreeController;
      } catch {
        if (!disposed) {
          setWebglFallback(true);
          optionsRef.current.onControllerReady?.(null);
        }
        return;
      }

      if (disposed || !createControllerFn) return;

      const initialOpts = optionsRef.current;
      const controller = createControllerFn(canvas, {
        initialDark: initialDarkRef.current,
        initialStage: initialStageRef.current,
        initialVariant: initialVariantRef.current,
        reducedMotion,
        onMarbleStep: handleMarbleStep,
        onFloorBounce: floorRailSelector ? handleFloorBounce : undefined,
        onOverlayRender: initialOpts.onOverlayRender
          ? (ctx) => optionsRef.current.onOverlayRender?.(ctx) ?? false
          : undefined,
        onOverlayResize: initialOpts.onOverlayResize
          ? (w, h, renderer, isSoftwareGl) =>
              optionsRef.current.onOverlayResize?.(w, h, renderer, isSoftwareGl)
          : undefined,
        onOverlayDispose: initialOpts.onOverlayDispose
          ? () => optionsRef.current.onOverlayDispose?.()
          : undefined,
        onOverlayContextRestored: initialOpts.onOverlayContextRestored
          ? (renderer) => optionsRef.current.onOverlayContextRestored?.(renderer)
          : undefined,
      });

      if (!controller) {
        setWebglFallback(true);
        optionsRef.current.onControllerReady?.(null);
        return;
      }

      if (disposed) {
        controller.dispose();
        return;
      }

      controllerRef.current = controller;
      controller.setTheme(optionsRef.current.isDark, true);
      controller.setStage(stageModeRef.current);
      if (optionsRef.current.motionVariant) {
        controller.setVariant(optionsRef.current.motionVariant);
      }
      if (typeof optionsRef.current.externalMarbleHidden === 'boolean') {
        controller.setExternalMarbleHidden?.(optionsRef.current.externalMarbleHidden);
      }
      optionsRef.current.onControllerReady?.(controller);

      // Auto-pause WebGL loop at 0fps whenever any modal dialog opens (shared across Login & Website)
      const stopModalObserver = observeOpenModalDialogs((hasOpenModal) => {
        modalPausedRef.current = hasOpenModal;
        syncEffectivePause();
      });
      syncEffectivePause();

    // Website-only bottom floor rail physical containment (never runs when floorRailSelector is unset)
    let observedFloorEl: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const syncFloorBounds = () => {
      if (!floorRailSelector) return;
      const stageRect = stageEl.getBoundingClientRect();
      if (stageRect.height <= 0) return;
      const rootEl = optionsRef.current.getTargetRoot(stageEl);
      const floorEl = rootEl?.querySelector<HTMLElement>(floorRailSelector) ?? null;
      if (!floorEl) {
        if (observedFloorEl && resizeObserver) {
          resizeObserver.unobserve(observedFloorEl);
          observedFloorEl = null;
        }
        controller.setPlayBounds?.({ bottomInsetWorld: 0 });
        return;
      }
      if (resizeObserver && floorEl !== observedFloorEl) {
        if (observedFloorEl) resizeObserver.unobserve(observedFloorEl);
        resizeObserver.observe(floorEl);
        observedFloorEl = floorEl;
      }
      const floorRect = floorEl.getBoundingClientRect();
      const bottomInsetWorld = computeFloorInsetWorld(
        stageRect.bottom,
        stageRect.height,
        floorRect.top
      );
      controller.setPlayBounds?.({ bottomInsetWorld });
    };

    let lastNormX = 0;
    let lastNormY = 0;

    const getNormalizedPointer = (clientX: number, clientY: number) =>
      toStageNormalizedCoords(clientX, clientY, stageEl.getBoundingClientRect());

    const pushPointer = (clientX: number, clientY: number, allowBrush = true) => {
      if (document.hidden || pausedModeRef.current) return;
      const { nx, ny } = getNormalizedPointer(clientX, clientY);
      const velocity = allowBrush ? Math.hypot(nx - lastNormX, ny - lastNormY) : 0;
      lastNormX = nx;
      lastNormY = ny;
      controller.setPointer(nx, ny, velocity);
      optionsRef.current.onPointerNormalized?.(nx, ny, stageEl);
    };

    const onWheel = (e: WheelEvent) => {
      if (document.hidden || pausedModeRef.current || !Number.isFinite(e.deltaY) || e.deltaY === 0) {
        return;
      }
      if (optionsRef.current.disableHeroMarbleInput) return;
      if (optionsRef.current.isEventExcluded?.(e.target)) return;
      const clientX = Number.isFinite(e.clientX) && e.clientX > 0 ? e.clientX : 0;
      const scrollX =
        clientX > 0 ? getNormalizedPointer(clientX, e.clientY).nx : lastNormX;
      const scale = optionsRef.current.wheelImpulseScale ?? 1.0;
      controller.pushScrollImpulse(scrollX, e.deltaY * scale);
    };

    let activeTouchId: number | null = null;
    let lastNativeTouchAt = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchTotalMovedPx = 0;

    const findTouchById = (list: TouchList, id: number): Touch | null => {
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].identifier === id) return list[i];
      }
      return null;
    };

    const isSuppressedTouchPointer = (e: PointerEvent): boolean =>
      e.pointerType === 'touch' &&
      (activeTouchId !== null || performance.now() - lastNativeTouchAt < 800);

    const shouldIgnoreStartTarget = (
      rawTarget: EventTarget | null,
      opts: UseMarbleBackdropStageOptions
    ): boolean => {
      const target = rawTarget as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return false;
      if (opts.manualTargetSelector) {
        const marbleTarget = target.closest<HTMLElement>(opts.manualTargetSelector);
        if (marbleTarget) {
          const now = performance.now();
          perTargetCooldown.set(marbleTarget, now + 1500);
          globalHitCooldownUntil = Math.max(globalHitCooldownUntil, now + 500);
          return true;
        }
      }
      const ignoreSelector =
        opts.ignorePointerDownSelector ?? 'button, input, a, select, label, textarea';
      return Boolean(target.closest(ignoreSelector));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isSuppressedTouchPointer(e)) return;
      if (document.hidden || pausedModeRef.current) return;
      const opts = optionsRef.current;
      if (opts.disableHeroMarbleInput) return;
      if (opts.isEventExcluded?.(e.target)) return;
      if (shouldIgnoreStartTarget(e.target, opts)) return;

      const { nx, ny } = getNormalizedPointer(e.clientX, e.clientY);
      controller.setPointerDown?.(true, nx, ny);
      pushPointer(e.clientX, e.clientY, false);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isSuppressedTouchPointer(e)) return;
      if (document.hidden || pausedModeRef.current) return;
      const opts = optionsRef.current;
      if (opts.disableHeroMarbleInput) return;
      if (opts.isEventExcluded?.(e.target)) return;
      if (e.buttons === 0 && opts.ignoreHoverOverSelector) {
        const target = e.target as HTMLElement | null;
        if (target && typeof target.closest === 'function' && target.closest(opts.ignoreHoverOverSelector)) {
          return;
        }
      }
      pushPointer(e.clientX, e.clientY, true);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isSuppressedTouchPointer(e)) return;
      controller.setPointerDown?.(false);
    };

    const onPointerCancel = (e: PointerEvent) => {
      // On iOS Safari/Chrome, WebKit may emit pointercancel while native TouchEvents continue.
      // Never cancel an active native touch drag when activeTouchId is still tracking the finger.
      if (isSuppressedTouchPointer(e)) return;
      controller.setPointerDown?.(false);
    };

    const onPointerLeave = (e: PointerEvent) => {
      if (isSuppressedTouchPointer(e)) return;
      controller.setPointerDown?.(false);
      if (optionsRef.current.onPointerLeaveReset) {
        controller.setPointer(0, 0, 0);
        optionsRef.current.onPointerLeaveReset(stageEl);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      lastNativeTouchAt = performance.now();
      if (document.hidden || pausedModeRef.current) return;
      const opts = optionsRef.current;
      if (opts.disableHeroMarbleInput) {
        if (activeTouchId !== null) {
          activeTouchId = null;
          controller.setPointerDown?.(false);
        }
        return;
      }
      if (e.touches.length !== 1) {
        if (activeTouchId !== null) {
          activeTouchId = null;
          controller.setPointerDown?.(false);
        }
        return;
      }
      if (opts.isEventExcluded?.(e.target)) return;
      if (shouldIgnoreStartTarget(e.target, opts)) return;

      const t = e.touches[0];
      activeTouchId = t.identifier;
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchTotalMovedPx = 0;

      const { nx, ny } = getNormalizedPointer(t.clientX, t.clientY);
      controller.setPointerDown?.(true, nx, ny);
      pushPointer(t.clientX, t.clientY, false);
    };

    const onTouchMove = (e: TouchEvent) => {
      lastNativeTouchAt = performance.now();
      if (document.hidden || pausedModeRef.current || activeTouchId === null) {
        return;
      }
      if (optionsRef.current.disableHeroMarbleInput) {
        activeTouchId = null;
        controller.setPointerDown?.(false);
        return;
      }
      const t = findTouchById(e.touches, activeTouchId);
      if (!t) return;
      touchTotalMovedPx = Math.max(
        touchTotalMovedPx,
        Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY)
      );
      pushPointer(t.clientX, t.clientY, true);
    };

    const onTouchEnd = (e: TouchEvent) => {
      lastNativeTouchAt = performance.now();
      if (activeTouchId === null) return;
      if (findTouchById(e.touches, activeTouchId)) return;
      activeTouchId = null;
      controller.setPointerDown?.(false);
    };

    // Mobile Gyroscope / DeviceOrientation exclusively for rolling the glass marble
    let gyroAttached = false;
    let gyroPermissionInFlight = false;
    let gyroPermissionResolved = false;
    let calibSamples = 0;
    let baseBeta = 0;
    let baseGamma = 0;
    let prevTiltX = 0;
    let prevTiltY = 0;

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (document.hidden || pausedModeRef.current) return;
      if (optionsRef.current.disableHeroMarbleInput) return;
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
    const isTopLevelWindow = (() => {
      try {
        return window.self === window.top;
      } catch {
        return false;
      }
    })();

    const GYRO_IGNORE_SELECTOR =
      'button, a, input, select, textarea, label, [role="button"], [role="tab"], [role="dialog"], [aria-modal="true"], [data-hud-surface="true"], [data-no-marble="true"]';

    const detachGyroPermissionListeners = () => {
      window.removeEventListener('click', requestIosGyro, false);
      stageEl.removeEventListener('touchend', requestIosGyroOnStageTap, false);
    };

    const requestIosGyro = (event: Event) => {
      if (
        gyroPermissionResolved ||
        gyroPermissionInFlight ||
        !requiresIosPermission ||
        !devOrientCtor?.requestPermission
      ) {
        return;
      }
      if (optionsRef.current.disableHeroMarbleInput) {
        return;
      }
      if (optionsRef.current.isEventExcluded?.(event.target)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest(GYRO_IGNORE_SELECTOR)) {
        return;
      }
      gyroPermissionInFlight = true;
      try {
        const resultPromise = devOrientCtor.requestPermission();
        if (resultPromise && typeof resultPromise.then === 'function') {
          void resultPromise
            .then((state) => {
              gyroPermissionInFlight = false;
              if (state === 'granted') {
                gyroPermissionResolved = true;
                detachGyroPermissionListeners();
                attachGyro();
              } else if (state === 'denied') {
                gyroPermissionResolved = true;
                detachGyroPermissionListeners();
              }
            })
            .catch(() => {
              // iOS Safari rejects non-activation gestures (such as prevented drags) with
              // NotAllowedError; keep listeners armed so the user's next clean tap prompts normally.
              gyroPermissionInFlight = false;
            });
        } else {
          gyroPermissionInFlight = false;
        }
      } catch {
        gyroPermissionInFlight = false;
      }
    };

    const requestIosGyroOnStageTap = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      if (touchTotalMovedPx >= 14) return;
      requestIosGyro(event);
    };

    // Guard single-finger drags strictly on stageEl (sibling of .site-shell / modals)
    // so iOS Safari never hijacks marble rolling or 3D stage orbiting with viewport rubber-band.
    const onStageTouchMove = (e: TouchEvent) => {
      if (document.hidden || pausedModeRef.current || e.touches.length !== 1) return;
      if (optionsRef.current.isEventExcluded?.(e.target)) return;
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    if (!reducedMotion && devOrientCtor) {
      if (requiresIosPermission) {
        if (isTopLevelWindow) {
          window.addEventListener('click', requestIosGyro, false);
          stageEl.addEventListener('touchend', requestIosGyroOnStageTap, { passive: true });
        }
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
      syncFloorBounds();
    };

    const handleVisibility = () => {
      syncEffectivePause();
      if (!document.hidden) invalidateCache();
    };

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(stageEl);
    }

    if (floorRailSelector) {
      syncFloorBounds();
      const initialBoundsTimer = window.setTimeout(syncFloorBounds, 120);
      activeTimers.add(initialBoundsTimer);
    }

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      controller.setReducedMotion?.(reducedMotion);
      if (reducedMotion && gyroAttached) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
        gyroAttached = false;
        controller.setTilt(0, 0, 0, 0);
      } else if (!reducedMotion && devOrientCtor && !gyroAttached && !requiresIosPermission) {
        attachGyro();
      }
    };
    if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    }

    const listenScroll = Boolean(optionsRef.current.listenDocumentScroll);
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    if (listenScroll) {
      document.addEventListener('scroll', invalidateCache, { passive: true, capture: true });
    }
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    stageEl.addEventListener('touchmove', onStageTouchMove, { passive: false });

      cleanupRuntime = () => {
        if (reducedMotionQuery && typeof reducedMotionQuery.removeEventListener === 'function') {
          reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
        }
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibility);
        if (listenScroll) {
          document.removeEventListener('scroll', invalidateCache, true);
        }
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
        stageEl.removeEventListener('touchmove', onStageTouchMove);
        stageEl.removeEventListener('touchend', requestIosGyroOnStageTap, false);
        window.removeEventListener('click', requestIosGyro, false);
        if (gyroAttached) {
          window.removeEventListener('deviceorientation', onDeviceOrientation);
        }
        resizeObserver?.disconnect();
        stopModalObserver();
        modalPausedRef.current = false;
        optionsRef.current.onControllerReady?.(null);
        controller.dispose();
        controllerRef.current = null;
      };
    };

    const shouldDefer = optionsRef.current.deferBootUntilPaint !== false;
    const cancelScheduledBoot = shouldDefer
      ? scheduleAfterFirstPaint(() => {
          if (!disposed) {
            void bootThreeController();
          }
        })
      : (() => {
          void bootThreeController();
          return () => {};
        })();

    return () => {
      disposed = true;
      cancelScheduledBoot();
      invalidateCacheRef.current = null;
      activeTimers.forEach((tid) => window.clearTimeout(tid));
      activeTimers.clear();
      cleanupRuntime?.();
      cleanupRuntime = null;
    };
  }, [floorRailSelector]);

  return { stageRef, canvasRef, webglFallback };
}
