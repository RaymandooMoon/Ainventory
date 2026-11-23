import { memo, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeController,
  type LoginThreeOverlayRenderContext,
  type LoginThreeVariantId,
} from '../components/auth/loginThreeScenes.ts';
import {
  useMarbleBackdropStage,
  type MarbleHitParams,
} from '../components/auth/useMarbleBackdropStage.ts';
import {
  AinvtryStageDirector,
  DomDockColliderSync,
  HERO_CAMERA_PRESET,
  HERO_MARBLE_WELL,
  type HeroMarblePhysicsPort,
  type MoodMode,
  type StageId,
  type StageInteractionState,
  type ThemeMode,
} from '../three/ainvtryStageDirector.ts';
import { createAboutStage } from '../three/stages/aboutStage.ts';
import { createArchitectureStage } from '../three/stages/architectureStage.ts';
import { createSpecsStage } from '../three/stages/specsStage.ts';
import {
  createStageMarbleMesh,
  createStudioEnvMap,
  disposeStudioEnvMap,
  setSoftwareGlGlassFallback,
  type StageMarbleHandle,
} from '../three/stages/stageMaterials.ts';
import { createStudioStage } from '../three/stages/studioStage.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import type { SiteTheme } from './siteContent.ts';

export interface SiteMarbleHeroProps {
  readonly theme: SiteTheme;
  readonly motionVariant: LoginThreeVariantId;
  readonly variantChangeOrigin: { readonly x: number; readonly y: number; readonly seq: number } | null;
  readonly activeStage: StageId;
  readonly glassPercent: number;
  readonly interaction: StageInteractionState;
  readonly onStageUiSync: (patch: Partial<StageInteractionState>) => void;
  readonly viewportRootRef: React.RefObject<HTMLElement | null>;
}

interface StageDirectorRig {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  envMap: THREE.Texture;
  readonly ambientLight: THREE.AmbientLight;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly stageMarble: StageMarbleHandle;
  readonly director: AinvtryStageDirector;
  readonly dockColliders: DomDockColliderSync;
  lastElapsed: number;
  heroReturnPending: boolean;
}

const SITE_MARBLE_TARGET_SELECTOR = '[data-marble-target="true"]';
const SITE_FLOOR_RAIL_SELECTOR = '[data-marble-floor="true"]';
const SITE_HIT_PARAMS: MarbleHitParams = {
  impactStrength: 0.96,
  minBounceSpeed: 0.84,
};

const STAGE_POINTER_EXCLUDE_SELECTOR =
  '[data-hud-surface="true"], button, a, input, select, textarea, [role="dialog"], [aria-modal="true"], [data-no-marble="true"]';

function isMarbleExcludedElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('[data-no-marble="true"], [role="dialog"], [aria-modal="true"]'));
}

function isStagePointerExcluded(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest(STAGE_POINTER_EXCLUDE_SELECTOR));
}

const getSiteTargetSelector = () => SITE_MARBLE_TARGET_SELECTOR;
const getSiteHitParams = () => SITE_HIT_PARAMS;
const shouldSiteDispatchClick = (el: HTMLElement) => el.dataset.marbleAction === 'click';

const UNPROJECT_RAYCASTER = new THREE.Raycaster();
const UNPROJECT_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const UNPROJECT_NDC = new THREE.Vector2();

function unprojectUvToWorldZ0(
  u: number,
  v: number,
  camera: THREE.PerspectiveCamera,
  out: THREE.Vector3
): THREE.Vector3 {
  UNPROJECT_NDC.set(u * 2 - 1, v * 2 - 1);
  camera.updateMatrixWorld();
  UNPROJECT_RAYCASTER.setFromCamera(UNPROJECT_NDC, camera);
  const hit = UNPROJECT_RAYCASTER.ray.intersectPlane(UNPROJECT_PLANE, out);
  if (!hit) {
    out.copy(HERO_MARBLE_WELL);
  }
  return out;
}

function updateStudioLighting(rig: StageDirectorRig, mood: MoodMode, theme: ThemeMode): void {
  const isDark = theme === 'dark';
  const isAurora = mood === 'aurora';

  rig.ambientLight.color.setHex(isAurora ? 0xe8effa : 0xf7f2e8);
  rig.ambientLight.intensity = isDark ? 0.56 : 0.78;

  rig.keyLight.color.setHex(isAurora ? 0xedf4ff : 0xfff0da);
  rig.keyLight.intensity = isDark ? 1.55 : 1.38;

  rig.rimLight.color.setHex(isAurora ? 0x8ec0f8 : 0xe4cca3);
  rig.rimLight.intensity = isDark ? (isAurora ? 1.15 : 0.92) : 0.72;
}

function diffStageInteraction(
  prev: Readonly<StageInteractionState>,
  next: Readonly<StageInteractionState>
): Partial<StageInteractionState> | null {
  let hasDiff = false;
  const patch: Partial<Record<keyof StageInteractionState, StageInteractionState[keyof StageInteractionState]>> = {};

  (Object.keys(next) as Array<keyof StageInteractionState>).forEach((key) => {
    if (prev[key] !== next[key]) {
      patch[key] = next[key];
      hasDiff = true;
    }
  });

  return hasDiff ? (patch as Partial<StageInteractionState>) : null;
}

/**
 * Persistent Single-Canvas 3D Silk + Rolling Glass Marble + 4-Stage Director Host.
 * Shares ONE WebGL `<canvas>` and ONE `THREE.WebGLRenderer` across HERO and all 4 interactive
 * 3D stages (`Studio`, `Architecture`, `Specs`, `About`) via `useMarbleBackdropStage`'s Pass 4
 * overlay callbacks while keeping the App Login screen 100% untouched.
 */
const SiteMarbleHero = memo(function SiteMarbleHero({
  theme,
  motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
  variantChangeOrigin = null,
  activeStage,
  glassPercent,
  interaction,
  onStageUiSync,
  viewportRootRef,
}: SiteMarbleHeroProps) {
  const isDark = theme === 'dark';
  const mood: MoodMode = motionVariant;

  const controllerRef = useRef<LoginThreeController | null>(null);
  const rigRef = useRef<StageDirectorRig | null>(null);
  const activeStageRef = useRef<StageId>(activeStage);
  const themeRef = useRef<ThemeMode>(theme);
  const moodRef = useRef<MoodMode>(mood);
  const glassPercentRef = useRef<number>(glassPercent);
  const interactionRef = useRef<StageInteractionState>(interaction);
  const onStageUiSyncRef = useRef(onStageUiSync);
  const tmpStartVecRef = useRef<THREE.Vector3>(new THREE.Vector3());

  useEffect(() => {
    activeStageRef.current = activeStage;
    themeRef.current = theme;
    moodRef.current = mood;
    glassPercentRef.current = glassPercent;
    interactionRef.current = interaction;
    onStageUiSyncRef.current = onStageUiSync;
  });

  const getTargetRoot = useCallback(
    (stageEl: HTMLElement) => viewportRootRef.current ?? stageEl.parentElement,
    [viewportRootRef]
  );

  const syncStageTransition = useCallback((rig: StageDirectorRig, nextStage: StageId) => {
    const currentStage = rig.director.getActiveStage();
    if (currentStage === nextStage) return;

    const ctrl = controllerRef.current;

    if (nextStage === 'hero') {
      rig.stageMarble.group.visible = true;
      rig.heroReturnPending = true;
      ctrl?.setExternalMarbleHidden?.(true);
      rig.director.returnToHero(rig.lastElapsed);
      if (!rig.director.isTransitionActive()) {
        rig.heroReturnPending = false;
        rig.stageMarble.group.visible = false;
        ctrl?.resetHeroMarble?.();
        ctrl?.setExternalMarbleHidden?.(false);
      }
      ctrl?.requestRender?.();
      return;
    }

    // Launching into an interactive 3D stage
    let launchWorldPos: THREE.Vector3 | undefined;
    if (currentStage === 'hero' && !rig.heroReturnPending) {
      const snap = ctrl?.getMarbleSnapshot?.();
      if (snap) {
        launchWorldPos = unprojectUvToWorldZ0(snap.u, snap.v, rig.camera, tmpStartVecRef.current);
      } else {
        launchWorldPos = tmpStartVecRef.current.copy(HERO_MARBLE_WELL);
      }
    } else {
      launchWorldPos = tmpStartVecRef.current.copy(rig.stageMarble.group.position);
    }

    rig.heroReturnPending = false;
    rig.stageMarble.group.visible = true;
    ctrl?.setExternalMarbleHidden?.(true);
    rig.director.transitionTo(nextStage, rig.lastElapsed, launchWorldPos);
    ctrl?.requestRender?.();
  }, []);

  const ensureRig = useCallback(
    (
      renderer: THREE.WebGLRenderer,
      width: number,
      height: number,
      reducedMotion: boolean,
      isSoftwareGl: boolean
    ): StageDirectorRig => {
      if (rigRef.current) return rigRef.current;

      setSoftwareGlGlassFallback(isSoftwareGl);

      const safeAspect = width / Math.max(1, height);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, safeAspect, 0.1, 100);
      camera.position.copy(HERO_CAMERA_PRESET.position);
      camera.lookAt(HERO_CAMERA_PRESET.lookAt);

      const envMap = createStudioEnvMap(renderer);
      scene.environment = envMap;

      const ambientLight = new THREE.AmbientLight(0xf7f2e8, 0.56);
      const keyLight = new THREE.DirectionalLight(0xfff0da, 1.55);
      keyLight.position.set(-3.8, 5.2, 5.4);
      const rimLight = new THREE.DirectionalLight(0xe4cca3, 0.92);
      rimLight.position.set(5.2, 2.6, -4.4);
      scene.add(ambientLight, keyLight, rimLight);

      const stageMarble = createStageMarbleMesh();
      stageMarble.group.visible = false;
      scene.add(stageMarble.group);

      const heroPhysics: HeroMarblePhysicsPort = {
        setPhysicsEnabled: () => {
          // Handled explicitly via controller.setExternalMarbleHidden & disableHeroMarbleInput
        },
        resetToCenterWell: () => {
          controllerRef.current?.resetHeroMarble?.();
        },
        getWorldPosition: (target: THREE.Vector3) => {
          const snap = controllerRef.current?.getMarbleSnapshot?.();
          if (snap) {
            return unprojectUvToWorldZ0(snap.u, snap.v, camera, target);
          }
          return target.copy(HERO_MARBLE_WELL);
        },
        getRadius: () => 0.18,
      };

      const dockColliders = new DomDockColliderSync(camera, renderer.domElement, 0);

      const director = new AinvtryStageDirector(
        scene,
        camera,
        stageMarble.group,
        heroPhysics,
        dockColliders,
        {
          onUiSync: (patch) => {
            onStageUiSyncRef.current(patch);
          },
        },
        {
          initialAspect: safeAspect,
          transitionDurationSec: 0.85,
          reducedMotion,
        }
      );

      director.registerStage(
        createStudioStage({
          onModelLoaded: () => {
            controllerRef.current?.requestRender?.();
          },
        })
      );
      director.registerStage(createArchitectureStage());
      director.registerStage(createSpecsStage());
      director.registerStage(createAboutStage());

      director.setVisualMode(moodRef.current, themeRef.current);
      director.setGlassPercent(glassPercentRef.current);
      director.updateInteraction(interactionRef.current);

      const rig: StageDirectorRig = {
        scene,
        camera,
        envMap,
        ambientLight,
        keyLight,
        rimLight,
        stageMarble,
        director,
        dockColliders,
        lastElapsed: 0,
        heroReturnPending: false,
      };

      updateStudioLighting(rig, moodRef.current, themeRef.current);
      rigRef.current = rig;

      if (activeStageRef.current !== 'hero') {
        syncStageTransition(rig, activeStageRef.current);
      }

      return rig;
    },
    [syncStageTransition]
  );

  const handleOverlayResize = useCallback(
    (width: number, height: number, renderer: THREE.WebGLRenderer, isSoftwareGl = false) => {
      const reducedMotion = Boolean(
        typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
      if (isSoftwareGl) {
        setSoftwareGlGlassFallback(true);
      }
      const rig = ensureRig(renderer, width, height, reducedMotion, isSoftwareGl);
      const aspect = width / Math.max(1, height);
      rig.camera.aspect = aspect;
      rig.camera.updateProjectionMatrix();
      rig.director.setViewportAspect(aspect);
    },
    [ensureRig]
  );

  const handleOverlayRender = useCallback(
    (ctx: LoginThreeOverlayRenderContext): boolean => {
      if (ctx.isSoftwareGl) {
        setSoftwareGlGlassFallback(true);
      }
      const rig = ensureRig(ctx.renderer, ctx.width, ctx.height, ctx.reducedMotion, ctx.isSoftwareGl);
      rig.lastElapsed = ctx.elapsed;
      rig.director.setReducedMotion(ctx.reducedMotion);

      if (rig.director.getActiveStage() !== activeStageRef.current) {
        syncStageTransition(rig, activeStageRef.current);
      }

      const shouldRender =
        rig.director.getActiveStage() !== 'hero' ||
        rig.director.isTransitionActive() ||
        rig.heroReturnPending;

      if (!shouldRender) {
        return false;
      }

      rig.director.update(ctx.dt, ctx.elapsed);

      if (
        rig.heroReturnPending &&
        rig.director.getActiveStage() === 'hero' &&
        !rig.director.isTransitionActive()
      ) {
        rig.heroReturnPending = false;
        rig.stageMarble.group.visible = false;
        controllerRef.current?.resetHeroMarble?.();
        controllerRef.current?.setExternalMarbleHidden?.(false);
        return false;
      }

      rig.stageMarble.updateVisual(
        moodRef.current,
        themeRef.current,
        glassPercentRef.current / 100,
        ctx.elapsed
      );
      ctx.renderer.render(rig.scene, rig.camera);
      return true;
    },
    [ensureRig, syncStageTransition]
  );

  const handleOverlayContextRestored = useCallback((renderer: THREE.WebGLRenderer) => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.scene.environment = null;
    disposeStudioEnvMap(rig.envMap);
    rig.envMap = createStudioEnvMap(renderer);
    rig.scene.environment = rig.envMap;
  }, []);

  const handleOverlayDispose = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.director.dispose();
    rig.stageMarble.dispose();
    rig.scene.environment = null;
    disposeStudioEnvMap(rig.envMap);
    rigRef.current = null;
  }, []);

  const handleControllerReady = useCallback((ctrl: LoginThreeController | null) => {
    controllerRef.current = ctrl;
  }, []);

  const { stageRef, canvasRef, webglFallback } = useMarbleBackdropStage({
    isDark,
    stage: 'intro',
    motionVariant,
    variantChangeOrigin,
    cooldownResetKey: activeStage,
    cooldownResetMs: 620,
    getTargetRoot,
    getTargetSelector: getSiteTargetSelector,
    hitRadiusScale: 1.06,
    minStrikeSpeed: 0.14,
    globalHitCooldownMs: 380,
    perTargetCooldownMs: 980,
    pushPaddingPx: 4,
    maxPushRadiusMultiple: 2.4,
    wheelImpulseScale: 0.45,
    ignorePointerDownSelector: 'button, a, input, textarea, select',
    ignoreHoverOverSelector: 'button, a, input',
    manualTargetSelector: SITE_MARBLE_TARGET_SELECTOR,
    isEventExcluded: isMarbleExcludedElement,
    shouldDispatchClick: shouldSiteDispatchClick,
    getHitParams: getSiteHitParams,
    floorRailSelector: SITE_FLOOR_RAIL_SELECTOR,
    disableHeroMarbleInput: activeStage !== 'hero',
    onOverlayRender: handleOverlayRender,
    onOverlayResize: handleOverlayResize,
    onOverlayDispose: handleOverlayDispose,
    onOverlayContextRestored: handleOverlayContextRestored,
    onControllerReady: handleControllerReady,
  });

  // Sync stage transitions
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    syncStageTransition(rig, activeStage);
  }, [activeStage, syncStageTransition]);

  // Sync Luxury/Aurora mood & Dark/Light theme into active 3D stage and studio lights
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.director.setVisualMode(mood, theme);
    updateStudioLighting(rig, mood, theme);
    controllerRef.current?.requestRender?.();
  }, [mood, theme]);

  // Sync Glass % wheel/slider into smoked-glass PBR materials
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.director.setGlassPercent(glassPercent);
    controllerRef.current?.requestRender?.();
  }, [glassPercent]);

  // Sync HUD interaction changes into active 3D stage (diffed to avoid feedback loops)
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const patch = diffStageInteraction(rig.director.getInteraction(), interaction);
    if (!patch) return;
    rig.director.updateInteraction(patch);
    controllerRef.current?.requestRender?.();
  }, [interaction]);

  // Left-58% (Desktop) / Top-44% (Mobile) direct 3D stage pointer gestures (Zero HUD interference)
  useEffect(() => {
    if (activeStage === 'hero' || typeof window === 'undefined') return undefined;

    let activePointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let totalMoved = 0;

    const toNdc = (clientX: number, clientY: number): { ndcX: number; ndcY: number; rect: DOMRect } | null => {
      const el = canvasRef.current ?? stageRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        ndcX: ((clientX - rect.left) / rect.width) * 2 - 1,
        ndcY: -(((clientY - rect.top) / rect.height) * 2 - 1),
        rect,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isStagePointerExcluded(e.target)) return;
      activePointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      totalMoved = 0;
      controllerRef.current?.requestRender?.();
    };

    const onPointerMove = (e: PointerEvent) => {
      const rig = rigRef.current;
      if (!rig) return;

      const coords = toNdc(e.clientX, e.clientY);
      if (!coords) return;

      if (activePointerId === e.pointerId) {
        const dxPx = e.clientX - lastX;
        const dyPx = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        totalMoved += Math.hypot(dxPx, dyPx);

        const stage = rig.director.getActiveStage();
        const usesNormalizedDrag = stage === 'studio' || stage === 'about';
        const dx = usesNormalizedDrag ? dxPx / Math.max(240, coords.rect.width) : dxPx;
        const dy = usesNormalizedDrag ? dyPx / Math.max(240, coords.rect.height) : dyPx;

        rig.director.handleLeftPointerDrag(dx, dy);
        rig.director.handleLeftPointerMove(coords.ndcX, coords.ndcY);
        controllerRef.current?.requestRender?.();
        return;
      }

      if (isStagePointerExcluded(e.target)) return;
      rig.director.handleLeftPointerMove(coords.ndcX, coords.ndcY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      const wasTap = totalMoved < 8;
      activePointerId = null;

      if (wasTap && !isStagePointerExcluded(e.target)) {
        const rig = rigRef.current;
        const coords = toNdc(e.clientX, e.clientY);
        if (rig && coords) {
          rig.director.handleLeftPointerTap(coords.ndcX, coords.ndcY);
          triggerHaptic('selection');
          controllerRef.current?.requestRender?.();
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (activePointerId === e.pointerId) {
        activePointerId = null;
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [activeStage, canvasRef, stageRef]);

  return (
    <div
      ref={stageRef}
      className={`site-marble-stage ${webglFallback ? 'is-webgl-fallback' : ''}`}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-motion-variant={motionVariant}
      data-active-stage={activeStage}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="site-marble-canvas" />
      <div className="site-marble-veil" />
    </div>
  );
});

export default SiteMarbleHero;
