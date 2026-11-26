import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeVariantId,
} from '../components/auth/loginThreeVariants.ts';
import type {
  LoginThreeController,
  LoginThreeOverlayRenderContext,
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
  type ActiveStageId,
  type HeroMarblePhysicsPort,
  type MoodMode,
  type StageId,
  type StageInteractionState,
  type ThemeMode,
} from '../three/ainvtryStageDirector.ts';
import {
  createStageMarbleMesh,
  createStudioEnvMap,
  disposeStudioEnvMap,
  setSoftwareGlGlassFallback,
  type StageMarbleHandle,
} from '../three/stages/stageMaterials.ts';
import { isIosSafariRuntime } from '../utils/iosSafariCompat.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import type { SiteTheme } from './siteContent.ts';
import { getLoadedStageFactory, preloadStageModule } from './stageModuleLoader.ts';

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

interface LightingTargets {
  readonly ambientColor: THREE.Color;
  readonly keyColor: THREE.Color;
  readonly rimColor: THREE.Color;
  ambientIntensity: number;
  keyIntensity: number;
  rimIntensity: number;
  exposure: number;
}

interface StageDirectorRig {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  envMap: THREE.Texture;
  readonly ambientLight: THREE.AmbientLight;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly lightingTarget: LightingTargets;
  currentExposure: number;
  readonly stageMarble: StageMarbleHandle;
  readonly director: AinvtryStageDirector;
  readonly dockColliders: DomDockColliderSync;
  readonly startWallMs: number;
  lastElapsed: number;
  heroReturnPending: boolean;
  heroReturnTargetScale: number;
  heroReturnRevealed: boolean;
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

function updateStudioLighting(
  rig: StageDirectorRig,
  mood: MoodMode,
  theme: ThemeMode,
  immediate = false
): void {
  const isDark = theme === 'dark';
  const isAurora = mood === 'aurora';
  const t = rig.lightingTarget;

  t.ambientColor.setHex(isAurora ? 0xe8effa : 0xf7f2e8);
  t.ambientIntensity = isDark ? 0.56 : 0.82;

  t.keyColor.setHex(isAurora ? 0xedf4ff : 0xfff0da);
  t.keyIntensity = isDark ? 1.56 : 1.36;

  t.rimColor.setHex(isAurora ? 0x8ec0f8 : 0xe4cca3);
  t.rimIntensity = isDark ? (isAurora ? 1.15 : 0.94) : 0.72;
  t.exposure = isDark ? 1.1 : 1.04;

  if (immediate) {
    rig.ambientLight.color.copy(t.ambientColor);
    rig.ambientLight.intensity = t.ambientIntensity;
    rig.keyLight.color.copy(t.keyColor);
    rig.keyLight.intensity = t.keyIntensity;
    rig.rimLight.color.copy(t.rimColor);
    rig.rimLight.intensity = t.rimIntensity;
    rig.currentExposure = t.exposure;
  }
}

function stepStudioLighting(rig: StageDirectorRig, dt: number, reducedMotion: boolean): void {
  const alpha = reducedMotion ? 1 : 1 - Math.exp(-7.5 * Math.min(Math.max(dt, 0), 0.05));
  const t = rig.lightingTarget;
  rig.ambientLight.color.lerp(t.ambientColor, alpha);
  rig.ambientLight.intensity = THREE.MathUtils.lerp(rig.ambientLight.intensity, t.ambientIntensity, alpha);
  rig.keyLight.color.lerp(t.keyColor, alpha);
  rig.keyLight.intensity = THREE.MathUtils.lerp(rig.keyLight.intensity, t.keyIntensity, alpha);
  rig.rimLight.color.lerp(t.rimColor, alpha);
  rig.rimLight.intensity = THREE.MathUtils.lerp(rig.rimLight.intensity, t.rimIntensity, alpha);
  rig.currentExposure = THREE.MathUtils.lerp(rig.currentExposure, t.exposure, alpha);
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
  const isSpecsThreeBackground =
    activeStage === 'specs' &&
    (interaction.specsSubtab === 'fitting' || interaction.specsSubtab === 'care');
  const effectiveThreeStage: StageId =
    activeStage === 'studio'
      ? 'hero'
      : isSpecsThreeBackground
        ? 'studio'
        : activeStage;
  const effectiveInteraction: StageInteractionState = useMemo(
    () =>
      isSpecsThreeBackground
        ? {
            ...interaction,
            studioSubtab: interaction.specsSubtab === 'care' ? 'intelligence' : 'atelier',
          }
        : interaction,
    [interaction, isSpecsThreeBackground]
  );

  const controllerRef = useRef<LoginThreeController | null>(null);
  const rigRef = useRef<StageDirectorRig | null>(null);
  const loadingStagesRef = useRef<Set<ActiveStageId>>(new Set());
  const activeStageRef = useRef<StageId>(effectiveThreeStage);
  const themeRef = useRef<ThemeMode>(theme);
  const moodRef = useRef<MoodMode>(mood);
  const glassPercentRef = useRef<number>(glassPercent);
  const interactionRef = useRef<StageInteractionState>(effectiveInteraction);
  const onStageUiSyncRef = useRef(onStageUiSync);
  const tmpStartVecRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const tmpHeroCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const tmpHeroTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Sync refs synchronously on render so rAF overlay passes never see a stale stage or subtab
  activeStageRef.current = effectiveThreeStage;
  themeRef.current = theme;
  moodRef.current = mood;
  glassPercentRef.current = glassPercent;
  interactionRef.current = effectiveInteraction;
  onStageUiSyncRef.current = onStageUiSync;

  const getTargetRoot = useCallback(
    (stageEl: HTMLElement) => viewportRootRef.current ?? stageEl.parentElement,
    [viewportRootRef]
  );

  const syncStageTransition = useCallback(
    (rig: StageDirectorRig, nextStage: StageId, fromRenderPass = false) => {
      const currentStage = rig.director.getActiveStage();
      if (currentStage === nextStage) return;

      const ctrl = controllerRef.current;

      if (nextStage === 'hero') {
        rig.stageMarble.group.visible = true;
        rig.stageMarble.group.scale.setScalar(1);
        rig.heroReturnPending = true;
        rig.heroReturnRevealed = false;
        ctrl?.resetHeroMarble?.();

        const restSnap = ctrl?.getMarbleSnapshot?.();
        const heroCamPos = rig.director.getHeroCameraPosition(tmpHeroCamPosRef.current);
        const halfH =
          Math.tan(THREE.MathUtils.degToRad(rig.camera.fov * 0.5)) * Math.abs(heroCamPos.z);
        const halfW = halfH * rig.camera.aspect;

        let heroTargetPos = tmpHeroTargetPosRef.current.copy(HERO_MARBLE_WELL);
        if (restSnap) {
          heroTargetPos = tmpHeroTargetPosRef.current.set(
            (restSnap.u * 2 - 1) * halfW,
            (restSnap.v * 2 - 1) * halfH,
            0
          );
          rig.heroReturnTargetScale = THREE.MathUtils.clamp(
            (restSnap.radiusNormY * 2.0 * 0.91 * halfH) / 0.18,
            0.48,
            1.35
          );
        } else {
          rig.heroReturnTargetScale = 1;
        }

        const wallNowSec =
          typeof performance !== 'undefined'
            ? Math.max(rig.lastElapsed, (performance.now() - rig.startWallMs) / 1000)
            : rig.lastElapsed;
        rig.director.returnToHero(wallNowSec, heroTargetPos);
        if (!rig.director.isTransitionActive()) {
          rig.heroReturnPending = false;
          rig.heroReturnRevealed = false;
          rig.stageMarble.group.visible = false;
          rig.stageMarble.group.scale.setScalar(1);
          ctrl?.setExternalMarbleHidden?.(false);
        } else {
          ctrl?.setExternalMarbleHidden?.(true);
        }
        if (!fromRenderPass) {
          ctrl?.requestRender?.();
        }
        return;
      }

      // Instantiate synchronously if the stage module is already cached; otherwise load on demand
      if (!rig.director.getStage(nextStage)) {
        const cachedFactory = getLoadedStageFactory(nextStage);
        if (cachedFactory) {
          const stageMod = cachedFactory({
            onModelLoaded: () => {
              controllerRef.current?.requestRender?.();
            },
          });
          rig.director.registerStage(stageMod);
        } else {
          if (!loadingStagesRef.current.has(nextStage)) {
            loadingStagesRef.current.add(nextStage);
            void preloadStageModule(nextStage)
              .then((factory) => {
                loadingStagesRef.current.delete(nextStage);
                if (rigRef.current !== rig) {
                  return;
                }
                if (!rig.director.getStage(nextStage)) {
                  const stageMod = factory({
                    onModelLoaded: () => {
                      controllerRef.current?.requestRender?.();
                    },
                  });
                  rig.director.registerStage(stageMod);
                }
                if (activeStageRef.current === nextStage) {
                  syncStageTransition(rig, nextStage);
                }
              })
              .catch((err) => {
                loadingStagesRef.current.delete(nextStage);
                console.warn(`[SiteMarbleHero] Failed to load 3D stage "${nextStage}":`, err);
              });
          }
          return;
        }
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

      const wallNowSec =
        typeof performance !== 'undefined'
          ? Math.max(rig.lastElapsed, (performance.now() - rig.startWallMs) / 1000)
          : rig.lastElapsed;
      // Sync latest interaction (e.g. studioSubtab = 'atelier' for Specs -> Three.js 3D) BEFORE onEnter runs
      const prePatch = diffStageInteraction(rig.director.getInteraction(), interactionRef.current);
      if (prePatch) {
        rig.director.updateInteraction(prePatch);
      }
      rig.heroReturnPending = false;
      rig.heroReturnRevealed = false;
      rig.stageMarble.group.scale.setScalar(1);
      rig.stageMarble.group.visible = true;
      // Transition director state BEFORE toggling external marble so reduced-motion renders see updated stage
      rig.director.transitionTo(nextStage, wallNowSec, launchWorldPos);
      ctrl?.setExternalMarbleHidden?.(true);
      if (!fromRenderPass) {
        ctrl?.requestRender?.();
      }
    },
    []
  );

  const ensureRig = useCallback(
    (
      renderer: THREE.WebGLRenderer,
      width: number,
      height: number,
      reducedMotion: boolean,
      isSoftwareGl: boolean
    ): StageDirectorRig => {
      if (rigRef.current) return rigRef.current;

      THREE.Cache.enabled = true;
      setSoftwareGlGlassFallback(isSoftwareGl || isIosSafariRuntime());

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
          initialWidth: width,
          transitionDurationSec: 0.85,
          reducedMotion,
        }
      );

      director.setViewportSize(width, height);
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
        lightingTarget: {
          ambientColor: new THREE.Color(0xf7f2e8),
          keyColor: new THREE.Color(0xfff0da),
          rimColor: new THREE.Color(0xe4cca3),
          ambientIntensity: 0.56,
          keyIntensity: 1.56,
          rimIntensity: 0.94,
          exposure: 1.1,
        },
        currentExposure: 1.1,
        stageMarble,
        director,
        dockColliders,
        startWallMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        lastElapsed: 0,
        heroReturnPending: false,
        heroReturnTargetScale: 1,
        heroReturnRevealed: false,
      };

      updateStudioLighting(rig, moodRef.current, themeRef.current, true);
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
      if (isSoftwareGl || isIosSafariRuntime()) {
        setSoftwareGlGlassFallback(true);
      }
      // Defer creating StageDirectorRig + PMREM studio envMap until the user actually enters a 3D stage
      if (!rigRef.current && activeStageRef.current === 'hero') {
        return;
      }
      const reducedMotion = Boolean(
        typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
      const rig = ensureRig(renderer, width, height, reducedMotion, isSoftwareGl);
      const aspect = width / Math.max(1, height);
      rig.camera.aspect = aspect;
      rig.camera.updateProjectionMatrix();
      rig.director.setViewportSize(width, height);
    },
    [ensureRig]
  );

  const handleOverlayRender = useCallback(
    (ctx: LoginThreeOverlayRenderContext): boolean => {
      if (ctx.isSoftwareGl || isIosSafariRuntime()) {
        setSoftwareGlGlassFallback(true);
      }
      if (!rigRef.current && activeStageRef.current === 'hero') {
        return false;
      }
      const rig = ensureRig(ctx.renderer, ctx.width, ctx.height, ctx.reducedMotion, ctx.isSoftwareGl);
      const wallElapsed =
        typeof performance !== 'undefined'
          ? Math.max(ctx.elapsed, (performance.now() - rig.startWallMs) / 1000)
          : ctx.elapsed;
      rig.lastElapsed = wallElapsed;
      rig.director.setReducedMotion(ctx.reducedMotion);

      if (rig.director.getActiveStage() !== activeStageRef.current) {
        syncStageTransition(rig, activeStageRef.current, true);
      }

      const shouldRender =
        rig.director.getActiveStage() !== 'hero' ||
        rig.director.isTransitionActive() ||
        rig.heroReturnPending;

      if (!shouldRender) {
        return false;
      }

      stepStudioLighting(rig, ctx.dt, ctx.reducedMotion);
      rig.director.update(ctx.dt, wallElapsed);

      let marbleFade = 1;
      if (rig.heroReturnPending && rig.director.getActiveStage() === 'hero') {
        const progress = rig.director.getTransitionProgress();
        const smoothT = progress * progress * (3 - 2 * progress);
        rig.stageMarble.group.scale.setScalar(
          THREE.MathUtils.lerp(1, rig.heroReturnTargetScale, smoothT)
        );

        if (progress >= 0.76 && !rig.heroReturnRevealed) {
          rig.heroReturnRevealed = true;
          controllerRef.current?.setExternalMarbleHidden?.(false);
          const landingSnap = controllerRef.current?.getMarbleSnapshot?.();
          if (landingSnap) {
            controllerRef.current?.triggerPulse?.(
              landingSnap.u * 2 - 1,
              landingSnap.v * 2 - 1,
              0.42
            );
          }
        }

        if (progress > 0.76) {
          marbleFade = 1 - THREE.MathUtils.smoothstep(progress, 0.76, 1.0);
        }

        if (!rig.director.isTransitionActive()) {
          rig.heroReturnPending = false;
          rig.heroReturnRevealed = false;
          rig.stageMarble.group.visible = false;
          rig.stageMarble.group.scale.setScalar(1);
          controllerRef.current?.setExternalMarbleHidden?.(false);
          return false;
        }
      }

      rig.stageMarble.updateVisual(
        moodRef.current,
        themeRef.current,
        glassPercentRef.current / 100,
        ctx.elapsed,
        marbleFade
      );

      // Isolate ACESFilmic tone mapping strictly to the 3D stage overlay pass so
      // the HERO silk fluid and App Login screen shaders remain 100% untouched.
      const prevToneMapping = ctx.renderer.toneMapping;
      const prevExposure = ctx.renderer.toneMappingExposure;
      ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      ctx.renderer.toneMappingExposure = rig.currentExposure;
      try {
        ctx.renderer.render(rig.scene, rig.camera);
      } finally {
        ctx.renderer.toneMapping = prevToneMapping;
        ctx.renderer.toneMappingExposure = prevExposure;
      }
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
    paused: activeStage === 'studio',
    motionVariant,
    variantChangeOrigin,
    cooldownResetKey: effectiveThreeStage,
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
    deferBootUntilPaint: false,
    onOverlayRender: handleOverlayRender,
    onOverlayResize: handleOverlayResize,
    onOverlayDispose: handleOverlayDispose,
    onOverlayContextRestored: handleOverlayContextRestored,
    onControllerReady: handleControllerReady,
  });

  // Sync HUD interaction changes into active 3D stage BEFORE stage transitions run
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const patch = diffStageInteraction(rig.director.getInteraction(), effectiveInteraction);
    if (!patch) return;
    rig.director.updateInteraction(patch);
    controllerRef.current?.requestRender?.();
  }, [effectiveInteraction]);

  // Sync stage transitions (including Specs -> 3D Fitting/Care live Three.js background)
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) {
      if (effectiveThreeStage === 'hero') {
        controllerRef.current?.setExternalMarbleHidden?.(false);
        return;
      }

      if (getLoadedStageFactory(effectiveThreeStage)) {
        controllerRef.current?.setExternalMarbleHidden?.(true);
        controllerRef.current?.requestRender?.();
        return;
      }

      let cancelled = false;
      void preloadStageModule(effectiveThreeStage)
        .then(() => {
          if (cancelled || activeStageRef.current !== effectiveThreeStage) return;
          const liveRig = rigRef.current;
          if (liveRig) {
            syncStageTransition(liveRig, effectiveThreeStage);
          } else {
            controllerRef.current?.setExternalMarbleHidden?.(true);
            controllerRef.current?.requestRender?.();
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn(
              `[SiteMarbleHero] Failed to preload 3D stage "${effectiveThreeStage}":`,
              err
            );
          }
        });
      return () => {
        cancelled = true;
      };
    }
    syncStageTransition(rig, effectiveThreeStage);
    return undefined;
  }, [effectiveThreeStage, syncStageTransition]);

  // Proactively pre-warm & register hidden studioStage when entering Specs so Three.js 3D opens instantly
  useEffect(() => {
    if (activeStage !== 'specs') return undefined;
    let cancelled = false;
    void preloadStageModule('studio')
      .then((factory) => {
        if (cancelled) return;
        const liveRig = rigRef.current;
        if (!liveRig || liveRig.director.getStage('studio')) return;
        const stageMod = factory({
          onModelLoaded: () => {
            controllerRef.current?.requestRender?.();
          },
        });
        liveRig.director.registerStage(stageMod);
        if (activeStageRef.current === 'studio') {
          syncStageTransition(liveRig, 'studio');
        }
      })
      .catch(() => {
        // Best-effort prefetch; clicking Three.js 3D retries on demand if offline
      });
    return () => {
      cancelled = true;
    };
  }, [activeStage, syncStageTransition]);

  // Sync Luxury/Aurora mood & Dark/Light theme into active 3D stage and studio lights
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.director.setVisualMode(mood, theme);
    updateStudioLighting(rig, mood, theme, false);
    controllerRef.current?.requestRender?.();
  }, [mood, theme]);

  // Sync Glass % wheel/slider into smoked-glass PBR materials
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.director.setGlassPercent(glassPercent);
    controllerRef.current?.requestRender?.();
  }, [glassPercent]);

  // Open 3D viewport direct pointer gestures (Zero HUD interference) + double-tap 0° reset
  useEffect(() => {
    if (effectiveThreeStage === 'hero' || typeof window === 'undefined') return undefined;

    let activePointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let totalMoved = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

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
          const now = performance.now();
          const isDoubleTap =
            now - lastTapTime < 310 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 28;
          if (isDoubleTap) {
            lastTapTime = 0;
            rig.director.handleLeftPointerDoubleTap(coords.ndcX, coords.ndcY);
          } else {
            lastTapTime = now;
            lastTapX = e.clientX;
            lastTapY = e.clientY;
            rig.director.handleLeftPointerTap(coords.ndcX, coords.ndcY);
          }
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
  }, [effectiveThreeStage, canvasRef, stageRef]);

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
