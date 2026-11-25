/**
 * ainvtryStageDirector.ts
 * ---------------------------------------------------------------------------
 * Production TypeScript State Machine & Single-Canvas Director for ainvtry.com
 * Target runtime: Three.js 0.187 (WebGL2) + React/DOM Stitch HUD Overlay
 *
 * Design principles:
 * 1. Keep ONE persistent Three.js <canvas> across HERO and all 4 3D stages.
 * 2. Reuse the glowing champagne-gold marble mesh as the physical controller
 *    inside every opened stage, launching seamlessly from its exact HERO world
 *    position along a tactile Bezier arc.
 * 3. Sync DOM pill button hitboxes (Studio, Architecture, Specs, About) into
 *    3D world space so the HERO marble-rolling collision trigger stays intact.
 * 4. Frame 3D centerpieces cleanly in the left 58% viewport on desktop and
 *    re-center with responsive Z pullback on narrow portrait viewports.
 */

import * as THREE from 'three';

/* ==========================================================================
 * 1. Shared Contracts (Frozen & Exported to Parallel Stage Engineers C1~C4)
 * ========================================================================== */

export type StageId = 'hero' | 'studio' | 'architecture' | 'specs' | 'about';
export type ActiveStageId = Exclude<StageId, 'hero'>;
export type MoodMode = 'luxury' | 'aurora';
export type ThemeMode = 'dark' | 'light';

export interface CameraPreset {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface StageInteractionState {
  studioSubtab: 'preview' | 'atelier' | 'intelligence';
  studioPreviewScreen: 'outfits' | 'closet' | 'stats' | 'profile';
  studioPose: 'stand' | 'walk' | 'rain';
  studioModelMode: 'dressform' | 'mannequin';
  studioAngleRad: number;
  architectureSubtab: 'blueprint' | 'privacy' | 'maps';
  architectureTier: number; // 0..5
  architectureMode: 'mvp' | 'prod';
  googleApiIndex: number; // 0..5
  weatherMood: 'sunny' | 'rain' | 'wind';
  specsSubtab: 'kpi' | 'matrix';
  specsFocusedIndex: number; // 0..5
  aboutSubtab: 'journey' | 'mission' | 'founder';
  aboutJourneyIndex: number; // 0..5
  aboutLoopIndex: number; // 0..4
  aboutLoopPaused: boolean;
}

export const DEFAULT_STAGE_INTERACTION_STATE: Readonly<StageInteractionState> = {
  studioSubtab: 'atelier',
  studioPreviewScreen: 'outfits',
  studioPose: 'stand',
  studioModelMode: 'mannequin',
  studioAngleRad: 0,
  architectureSubtab: 'blueprint',
  architectureTier: 3, // 04 iNVTRY Core active by default
  architectureMode: 'mvp',
  googleApiIndex: 0,
  weatherMood: 'rain',
  specsSubtab: 'kpi',
  specsFocusedIndex: 0,
  aboutSubtab: 'journey',
  aboutJourneyIndex: 0,
  aboutLoopIndex: 0,
  aboutLoopPaused: false,
};

export interface StageContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  marbleMesh: THREE.Object3D;
  glassRatio: number; // 0.0 .. 1.0 (synced with bottom-right Glass % wheel)
  mood: MoodMode;
  theme: ThemeMode;
  viewportAspect: number;
  reducedMotion: boolean;
  interaction: StageInteractionState;
  /** Notify React / Stitch HUD when a 3D interaction updates shared UI state */
  emitUiSync: (patch: Partial<StageInteractionState>) => void;
}

/**
 * Every parallel Three.js stage subagent (C1~C4) implements this interface
 * inside its own isolated file: src/three/stages/<stage>Stage.ts
 */
export interface StageModule {
  readonly id: ActiveStageId;
  readonly group: THREE.Group;
  readonly cameraPreset: CameraPreset;

  /**
   * Returns the world-space position where the reused gold marble should
   * dock or animate while this stage is active.
   */
  getMarbleAnchor(elapsed: number, state: StageInteractionState): THREE.Vector3;

  onEnter(ctx: StageContext): void;
  onExit(ctx: StageContext): void;
  onGlassChange(glassRatio: number): void;
  onVisualModeChange(mood: MoodMode, theme: ThemeMode): void;
  onInteractionChange?(patch: Partial<StageInteractionState>, ctx: StageContext): void;
  onPointerMove?(ndcX: number, ndcY: number, ctx: StageContext): void;
  onPointerDrag?(dx: number, dy: number, ctx: StageContext): void;
  onPointerTap?(ndcX: number, ndcY: number, ctx: StageContext): void;
  onPointerDoubleTap?(ndcX: number, ndcY: number, ctx: StageContext): void;
  update(dt: number, elapsed: number, ctx: StageContext): void;
  dispose(): void;
}

export type CameraLayoutMode = 'split' | 'sheet';

/**
 * Adapter around the existing HERO marble physics controller so the director
 * can pause free-rolling physics during transitions and resume on HERO return.
 */
export interface HeroMarblePhysicsPort {
  setPhysicsEnabled(enabled: boolean): void;
  resetToCenterWell(): void;
  getWorldPosition(target: THREE.Vector3): THREE.Vector3;
  getRadius(): number;
}

export interface DirectorCallbacks {
  onStageChange?: (next: StageId, prev: StageId) => void;
  onDockRipple?: (stageId: ActiveStageId) => void;
  onUiSync?: (patch: Partial<StageInteractionState>) => void;
}

export interface DirectorOptions {
  readonly reducedMotion?: boolean;
  readonly transitionDurationSec?: number;
  readonly initialAspect?: number;
  readonly initialWidth?: number;
}

/* ==========================================================================
 * 2. Camera Presets & Responsive Split / Bottom-Sheet Framing Solver
 * ========================================================================== */

export const HERO_CAMERA_PRESET: CameraPreset = {
  position: new THREE.Vector3(0, 0, 7.5),
  lookAt: new THREE.Vector3(0, 0, 0),
};

export const HERO_MARBLE_WELL = new THREE.Vector3(0, -1.55, 0);

export const STAGE_CAMERA_PRESETS: Record<ActiveStageId, CameraPreset> = {
  // Close full-height 3/4 framing; computeResponsiveCameraPreset centers X in the open left column
  studio: {
    position: new THREE.Vector3(1.55, 0.14, 5.45),
    lookAt: new THREE.Vector3(1.55, -0.18, 0),
  },
  architecture: {
    position: new THREE.Vector3(2.02, 0.52, 7.65),
    lookAt: new THREE.Vector3(1.68, -0.02, 0),
  },
  specs: {
    position: new THREE.Vector3(2.05, 1.38, 7.25),
    lookAt: new THREE.Vector3(1.70, -0.14, 0),
  },
  about: {
    position: new THREE.Vector3(1.92, 0.48, 6.40),
    lookAt: new THREE.Vector3(1.66, -0.10, 0),
  },
};

const PORTRAIT_ASPECT_THRESHOLD = 0.85;
const ABOUT_SHEET_MAX_WIDTH = 520;
const DEFAULT_PORTRAIT_LOOK_Y_OFFSET = 0.06;
const MOBILE_DRAWER_PORTRAIT_LOOK_Y_OFFSET = 0.06;
const SHEET_PORTRAIT_LOOK_Y_OFFSET = 0.64;
const CAMERA_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(20));

function estimateRightPanelFraction(viewportWidth?: number, safeAspect = 16 / 9): number {
  if (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    if (viewportWidth < 640) {
      // Compact mobile split view: right explanation drawer occupies ~54%, left 3D gets ~46%
      return 0.54;
    }
    if (viewportWidth < 860) {
      const panelPx = Math.min(400, Math.max(260, viewportWidth * 0.54 - 8)) + 8;
      return THREE.MathUtils.clamp(panelPx / viewportWidth, 0.44, 0.54);
    }
    const insetPx = Math.min(34, Math.max(16, viewportWidth * 0.024));
    const panelPx = Math.min(536, Math.max(390, viewportWidth * 0.37)) + insetPx;
    return THREE.MathUtils.clamp(panelPx / viewportWidth, 0.34, 0.46);
  }
  return safeAspect < PORTRAIT_ASPECT_THRESHOLD ? 0.54 : 0.4;
}

/**
 * Computes responsive camera position and lookAt vectors:
 * - `layoutMode === 'split'`: centers the 3D subject cleanly inside the open LEFT column
 *   across desktop, foldable, and mobile right-split drawers without HUD overlap.
 * - `layoutMode === 'sheet'`: centers X = 0 and elevates the subject above the bottom
 *   glass sheet (used on smartphone About stage <= 520px).
 */
export function computeResponsiveCameraPreset(
  base: CameraPreset,
  aspect: number,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
  isHero = false,
  portraitLookYOffset = 0.06,
  viewportWidth?: number,
  layoutMode: CameraLayoutMode = 'split'
): void {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 16 / 9;

  if (isHero) {
    outPos.copy(base.position);
    outLook.copy(base.lookAt);
    if (safeAspect < PORTRAIT_ASPECT_THRESHOLD || (viewportWidth !== undefined && viewportWidth < 860)) {
      const pull = THREE.MathUtils.clamp(PORTRAIT_ASPECT_THRESHOLD / safeAspect, 1.0, 1.32);
      outPos.z = base.position.z * pull;
    }
    return;
  }

  if (layoutMode === 'sheet') {
    const pull = THREE.MathUtils.clamp(0.84 / safeAspect, 1.32, 1.78);
    const posZ = base.position.z * pull;
    const lookDrop = Math.max(SHEET_PORTRAIT_LOOK_Y_OFFSET, portraitLookYOffset);
    outPos.set(0, base.position.y - lookDrop * 0.24, posZ);
    outLook.set(0, base.lookAt.y - lookDrop, base.lookAt.z);
    return;
  }

  const panelFraction = estimateRightPanelFraction(viewportWidth, safeAspect);
  const leftFraction = Math.max(0.42, 1 - panelFraction);
  const effectiveLeftAspect = safeAspect * leftFraction;

  // Pull Z back generously on narrow portrait splits so full-width 3D assemblies clear the right drawer
  const zScale = THREE.MathUtils.clamp(0.35 / Math.max(effectiveLeftAspect, 0.16), 1.0, 1.54);
  const posZ = base.position.z * zScale;

  // Center world X=0 squarely in the open LEFT column
  const visibleHalfWidth = posZ * CAMERA_HALF_FOV_TAN * safeAspect;
  const targetLookX = THREE.MathUtils.clamp(panelFraction * visibleHalfWidth * 1.02, 0.62, 2.62);

  const parallaxScale = THREE.MathUtils.clamp((safeAspect - 0.45) / 0.75, 0.28, 1.0);
  const parallaxX = (base.position.x - base.lookAt.x) * parallaxScale;

  const isCompact =
    safeAspect < PORTRAIT_ASPECT_THRESHOLD || (viewportWidth !== undefined && viewportWidth < 640);
  const yOffset = isCompact ? portraitLookYOffset : 0;

  outPos.set(targetLookX + parallaxX, base.position.y - yOffset * 0.35, posZ);
  outLook.set(targetLookX, base.lookAt.y - yOffset, base.lookAt.z);
}

/* ==========================================================================
 * 3. DOM Pill Button -> 3D World Collider Synchronizer
 * ========================================================================== */

interface WorldDockTarget {
  readonly id: ActiveStageId;
  readonly element: HTMLElement;
  readonly worldCenter: THREE.Vector3;
  worldRadius: number;
}

export class DomDockColliderSync {
  private targets: WorldDockTarget[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z = 0 marble plane
  private readonly tmpNdc = new THREE.Vector2();
  private readonly tmpEdge = new THREE.Vector3();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private lastTriggerAt = -Infinity;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    planeZ = 0
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.plane.constant = -planeZ;
  }

  public registerButtons(buttonMap: Partial<Record<ActiveStageId, HTMLElement | null>>): void {
    this.targets = [];
    const entries = Object.entries(buttonMap) as Array<[ActiveStageId, HTMLElement | null]>;
    for (const [id, element] of entries) {
      if (!element) continue;
      this.targets.push({
        id,
        element,
        worldCenter: new THREE.Vector3(),
        worldRadius: 0.45,
      });
    }
    this.sync();
  }

  public clear(): void {
    this.targets = [];
  }

  /** Call on window resize or layout change to keep hitboxes accurate. */
  public sync(): void {
    const canvasRect = this.domElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    for (const target of this.targets) {
      const rect = target.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const cx = ((rect.left + rect.width * 0.5 - canvasRect.left) / canvasRect.width) * 2 - 1;
      const cy = -((rect.top + rect.height * 0.5 - canvasRect.top) / canvasRect.height) * 2 + 1;

      this.tmpNdc.set(cx, cy);
      this.raycaster.setFromCamera(this.tmpNdc, this.camera);
      const centerHit = this.raycaster.ray.intersectPlane(this.plane, target.worldCenter);
      if (!centerHit) continue;

      // Compute approximate world radius from pill half-width
      const ex = ((rect.right - canvasRect.left) / canvasRect.width) * 2 - 1;
      this.tmpNdc.set(ex, cy);
      this.raycaster.setFromCamera(this.tmpNdc, this.camera);
      const edgeHit = this.raycaster.ray.intersectPlane(this.plane, this.tmpEdge);
      if (edgeHit) {
        target.worldRadius = Math.max(0.3, target.worldCenter.distanceTo(this.tmpEdge) * 0.85);
      }
    }
  }

  /** Returns the touched ActiveStageId if the rolling marble intersects a pill button. */
  public detectHit(
    marblePos: THREE.Vector3,
    marbleRadius: number,
    nowMs = performance.now(),
    cooldownMs = 700
  ): ActiveStageId | null {
    if (nowMs - this.lastTriggerAt < cooldownMs) return null;

    for (const target of this.targets) {
      const dx = marblePos.x - target.worldCenter.x;
      const dy = marblePos.y - target.worldCenter.y;
      const hitDist = target.worldRadius + marbleRadius;
      if (dx * dx + dy * dy <= hitDist * hitDist) {
        this.lastTriggerAt = nowMs;
        return target.id;
      }
    }
    return null;
  }
}

/* ==========================================================================
 * 4. Single-Canvas Stage Director (State Machine + Camera & Marble Flight)
 * ========================================================================== */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class AinvtryStageDirector {
  private activeStage: StageId = 'hero';
  private readonly stages = new Map<ActiveStageId, StageModule>();
  private readonly stageFactories = new Map<ActiveStageId, () => StageModule>();

  // Camera interpolation state
  private readonly camFromPos = HERO_CAMERA_PRESET.position.clone();
  private readonly camToPos = HERO_CAMERA_PRESET.position.clone();
  private readonly camFromLook = HERO_CAMERA_PRESET.lookAt.clone();
  private readonly camToLook = HERO_CAMERA_PRESET.lookAt.clone();
  private readonly currentLookAt = HERO_CAMERA_PRESET.lookAt.clone();

  // Marble flight arc state (smooth Bezier flight from HERO/dock -> stage anchor)
  private readonly marbleArc = new THREE.QuadraticBezierCurve3(
    HERO_MARBLE_WELL.clone(),
    new THREE.Vector3(0, 0, 1.5),
    HERO_MARBLE_WELL.clone()
  );

  // Pre-allocated scratch vectors to keep the 60/120fps update loop allocation-free
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpStartPos = new THREE.Vector3();
  private readonly tmpArcMid = new THREE.Vector3();

  private isTransitioning = false;
  private transitionElapsed = 0;
  private transitionStartElapsed = 0;
  private readonly transitionDurationSec: number;
  private viewportWidth: number | undefined;

  private readonly heroPhysics: HeroMarblePhysicsPort;
  private readonly dockColliders: DomDockColliderSync;
  private readonly callbacks: DirectorCallbacks;
  private readonly ctx: StageContext;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    marbleMesh: THREE.Object3D,
    heroPhysics: HeroMarblePhysicsPort,
    dockColliders: DomDockColliderSync,
    callbacks: DirectorCallbacks = {},
    options: DirectorOptions = {}
  ) {
    this.heroPhysics = heroPhysics;
    this.dockColliders = dockColliders;
    this.callbacks = callbacks;

    const initialAspect =
      typeof options.initialAspect === 'number' && options.initialAspect > 0
        ? options.initialAspect
        : camera.aspect || 16 / 9;

    this.viewportWidth =
      typeof options.initialWidth === 'number' &&
      Number.isFinite(options.initialWidth) &&
      options.initialWidth > 0
        ? options.initialWidth
        : undefined;

    this.transitionDurationSec =
      typeof options.transitionDurationSec === 'number' && options.transitionDurationSec > 0
        ? options.transitionDurationSec
        : 0.85;

    this.ctx = {
      scene,
      camera,
      marbleMesh,
      glassRatio: 0.5,
      mood: 'luxury',
      theme: 'dark',
      viewportAspect: initialAspect,
      reducedMotion: Boolean(options.reducedMotion),
      interaction: { ...DEFAULT_STAGE_INTERACTION_STATE },
      emitUiSync: (patch) => {
        this.ctx.interaction = { ...this.ctx.interaction, ...patch };
        this.callbacks.onUiSync?.(patch);
      },
    };

    computeResponsiveCameraPreset(
      HERO_CAMERA_PRESET,
      initialAspect,
      this.camToPos,
      this.camToLook,
      true,
      DEFAULT_PORTRAIT_LOOK_Y_OFFSET,
      this.viewportWidth
    );
    this.camFromPos.copy(this.camToPos);
    this.camFromLook.copy(this.camToLook);
    this.currentLookAt.copy(this.camToLook);
  }

  /** Register each subagent's stage module without cross-file coupling. */
  public registerStage(stage: StageModule): void {
    stage.group.visible = false;
    this.ctx.scene.add(stage.group);
    this.stages.set(stage.id, stage);
  }

  /** Register a lazy stage factory instantiated on first visit to reduce startup GPU/CPU stall. */
  public registerStageFactory(id: ActiveStageId, factory: () => StageModule): void {
    this.stageFactories.set(id, factory);
  }

  private ensureStage(id: ActiveStageId): StageModule | undefined {
    const existing = this.stages.get(id);
    if (existing) return existing;
    const factory = this.stageFactories.get(id);
    if (!factory) return undefined;
    this.stageFactories.delete(id);
    const created = factory();
    this.registerStage(created);
    return created;
  }

  private resolveLayoutMode(stage: StageId): CameraLayoutMode {
    if (stage !== 'about') return 'split';
    if (this.viewportWidth !== undefined) {
      return this.viewportWidth <= ABOUT_SHEET_MAX_WIDTH ? 'sheet' : 'split';
    }
    return this.ctx.viewportAspect < 0.65 ? 'sheet' : 'split';
  }

  public getStage(id: ActiveStageId): StageModule | undefined {
    return this.stages.get(id);
  }

  public getActiveStage(): StageId {
    return this.activeStage;
  }

  public getInteraction(): Readonly<StageInteractionState> {
    return this.ctx.interaction;
  }

  public isTransitionActive(): boolean {
    return this.isTransitioning;
  }

  public getTransitionProgress(): number {
    if (!this.isTransitioning) return 1;
    return THREE.MathUtils.clamp(this.transitionElapsed / this.transitionDurationSec, 0, 1);
  }

  public getHeroCameraPosition(outPos: THREE.Vector3): THREE.Vector3 {
    computeResponsiveCameraPreset(
      HERO_CAMERA_PRESET,
      this.ctx.viewportAspect,
      outPos,
      this.tmpVec,
      true,
      DEFAULT_PORTRAIT_LOOK_Y_OFFSET,
      this.viewportWidth
    );
    return outPos;
  }

  public setReducedMotion(enabled: boolean): void {
    this.ctx.reducedMotion = enabled;
    if (enabled && this.isTransitioning) {
      this.finishTransitionImmediately();
    }
  }

  /**
   * Re-computes responsive framing using exact viewport pixel dimensions so
   * desktop, foldable split-drawer, and smartphone About bottom-sheet framing
   * match CSS breakpoints cleanly.
   */
  public setViewportSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    this.viewportWidth = width;
    this.applyViewportFraming(width / height);
  }

  /**
   * Re-computes responsive framing when the viewport aspect ratio changes.
   */
  public setViewportAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.viewportWidth = undefined;
    this.applyViewportFraming(aspect);
  }

  private applyViewportFraming(aspect: number): void {
    this.ctx.viewportAspect = aspect;

    const targetPreset =
      this.activeStage === 'hero'
        ? HERO_CAMERA_PRESET
        : (this.stages.get(this.activeStage)?.cameraPreset ??
          STAGE_CAMERA_PRESETS[this.activeStage]);

    computeResponsiveCameraPreset(
      targetPreset,
      aspect,
      this.camToPos,
      this.camToLook,
      this.activeStage === 'hero',
      MOBILE_DRAWER_PORTRAIT_LOOK_Y_OFFSET,
      this.viewportWidth,
      this.resolveLayoutMode(this.activeStage)
    );

    if (this.ctx.reducedMotion && !this.isTransitioning) {
      this.ctx.camera.position.copy(this.camToPos);
      this.currentLookAt.copy(this.camToLook);
      this.ctx.camera.lookAt(this.currentLookAt);
    }
  }

  /**
   * Called by DOM button click OR automatically by marble dock collision.
   * Passing `startMarbleWorldPos` spawns the 3D marble at the exact projected
   * HERO world position for zero-pop continuity.
   */
  public transitionTo(
    nextStage: StageId,
    elapsed = 0,
    startMarbleWorldPos?: THREE.Vector3,
    heroEndMarbleWorldPos?: THREE.Vector3
  ): void {
    if (nextStage === this.activeStage) return;

    const prevStage = this.activeStage;

    // Validate & lazily instantiate target before mutating active stage state
    const nextModule = nextStage === 'hero' ? undefined : this.ensureStage(nextStage);
    if (nextStage !== 'hero' && !nextModule) {
      return;
    }

    // Exit previous 3D stage
    if (prevStage !== 'hero') {
      const prevModule = this.stages.get(prevStage);
      prevModule?.onExit(this.ctx);
      if (prevModule) prevModule.group.visible = false;
    }

    // Snapshot camera start
    this.camFromPos.copy(this.ctx.camera.position);
    this.camFromLook.copy(this.currentLookAt);

    // Snapshot marble start (prefer explicit world pos, or live HERO physics position)
    if (startMarbleWorldPos) {
      this.tmpStartPos.copy(startMarbleWorldPos);
      this.ctx.marbleMesh.position.copy(this.tmpStartPos);
    } else if (prevStage === 'hero') {
      this.heroPhysics.getWorldPosition(this.tmpStartPos);
      this.ctx.marbleMesh.position.copy(this.tmpStartPos);
    } else {
      this.tmpStartPos.copy(this.ctx.marbleMesh.position);
    }

    if (nextStage === 'hero') {
      computeResponsiveCameraPreset(
        HERO_CAMERA_PRESET,
        this.ctx.viewportAspect,
        this.camToPos,
        this.camToLook,
        true,
        DEFAULT_PORTRAIT_LOOK_Y_OFFSET,
        this.viewportWidth
      );
      this.setupMarbleArc(this.tmpStartPos, heroEndMarbleWorldPos ?? HERO_MARBLE_WELL);
    } else if (nextModule) {
      this.heroPhysics.setPhysicsEnabled(false);
      nextModule.group.visible = true;
      nextModule.onGlassChange(this.ctx.glassRatio);
      nextModule.onVisualModeChange(this.ctx.mood, this.ctx.theme);
      nextModule.onEnter(this.ctx);

      computeResponsiveCameraPreset(
        nextModule.cameraPreset,
        this.ctx.viewportAspect,
        this.camToPos,
        this.camToLook,
        false,
        MOBILE_DRAWER_PORTRAIT_LOOK_Y_OFFSET,
        this.viewportWidth,
        this.resolveLayoutMode(nextStage)
      );

      const anchor = nextModule.getMarbleAnchor(elapsed, this.ctx.interaction);
      this.setupMarbleArc(this.tmpStartPos, anchor);
      this.callbacks.onDockRipple?.(nextStage);
    }

    this.activeStage = nextStage;
    this.transitionElapsed = 0;
    this.transitionStartElapsed = elapsed;

    if (this.ctx.reducedMotion) {
      this.finishTransitionImmediately();
    } else {
      this.isTransitioning = true;
    }

    this.callbacks.onStageChange?.(nextStage, prevStage);
  }

  /** Bound to top-left iNVTRY logo click or Escape key. */
  public returnToHero(elapsed = 0, heroEndMarbleWorldPos?: THREE.Vector3): void {
    this.transitionTo('hero', elapsed, undefined, heroEndMarbleWorldPos);
  }

  /** Syncs bottom-right Glass % wheel controller (0..100) to active 3D stage. */
  public setGlassPercent(percent: number): void {
    this.ctx.glassRatio = THREE.MathUtils.clamp(percent / 100, 0, 1);
    if (this.activeStage !== 'hero') {
      this.stages.get(this.activeStage)?.onGlassChange(this.ctx.glassRatio);
    }
  }

  /** Syncs top bar Luxury/Aurora and Light/Dark toggles to active 3D stage. */
  public setVisualMode(mood: MoodMode, theme: ThemeMode): void {
    this.ctx.mood = mood;
    this.ctx.theme = theme;
    if (this.activeStage !== 'hero') {
      this.stages.get(this.activeStage)?.onVisualModeChange(mood, theme);
    }
  }

  /** Called by right-side Stitch HUD controls (e.g., Stand/Walk/Rain, MVP/Prod). */
  public updateInteraction(patch: Partial<StageInteractionState>): void {
    this.ctx.interaction = { ...this.ctx.interaction, ...patch };
    if (this.activeStage !== 'hero') {
      this.stages.get(this.activeStage)?.onInteractionChange?.(patch, this.ctx);
    }
  }

  /** Forward pointer drag in open 3D viewport to active 3D stage. */
  public handleLeftPointerDrag(dx: number, dy: number): void {
    if (this.activeStage === 'hero' || this.isTransitioning) return;
    this.stages.get(this.activeStage)?.onPointerDrag?.(dx, dy, this.ctx);
  }

  /** Forward pointer hover/move (NDC -1..1) in open 3D viewport to active 3D stage. */
  public handleLeftPointerMove(ndcX: number, ndcY: number): void {
    if (this.activeStage === 'hero') return;
    this.stages.get(this.activeStage)?.onPointerMove?.(ndcX, ndcY, this.ctx);
  }

  /** Forward click/tap (NDC -1..1) in open 3D viewport to active 3D stage. */
  public handleLeftPointerTap(ndcX: number, ndcY: number): void {
    if (this.activeStage === 'hero' || this.isTransitioning) return;
    this.stages.get(this.activeStage)?.onPointerTap?.(ndcX, ndcY, this.ctx);
  }

  /** Forward double-tap / double-click (NDC -1..1) to reset active 3D turntable or focus. */
  public handleLeftPointerDoubleTap(ndcX: number, ndcY: number): void {
    if (this.activeStage === 'hero' || this.isTransitioning) return;
    this.stages.get(this.activeStage)?.onPointerDoubleTap?.(ndcX, ndcY, this.ctx);
  }

  /** Call once per requestAnimationFrame inside the existing WebGL render loop. */
  public update(dt: number, elapsed: number): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);

    // 1. Check HERO marble collision with bottom 4 DOM pill buttons
    if (this.activeStage === 'hero' && !this.isTransitioning) {
      this.heroPhysics.getWorldPosition(this.tmpVec);
      const hitStage = this.dockColliders.detectHit(this.tmpVec, this.heroPhysics.getRadius());
      if (hitStage) {
        this.transitionTo(hitStage, elapsed, this.tmpVec);
      }
    }

    // 2. Drive camera + marble flight transition (wall-clock synced), or smooth aspect damping
    if (this.isTransitioning) {
      const progressElapsed = Math.max(
        this.transitionElapsed + safeDt,
        elapsed - this.transitionStartElapsed
      );
      this.transitionElapsed += safeDt;
      const rawT = THREE.MathUtils.clamp(progressElapsed / this.transitionDurationSec, 0, 1);
      const easedT = easeInOutCubic(rawT);

      this.ctx.camera.position.lerpVectors(this.camFromPos, this.camToPos, easedT);
      this.currentLookAt.lerpVectors(this.camFromLook, this.camToLook, easedT);
      this.ctx.camera.lookAt(this.currentLookAt);

      this.marbleArc.getPoint(easedT, this.ctx.marbleMesh.position);

      if (rawT >= 1) {
        this.isTransitioning = false;
        if (this.activeStage === 'hero') {
          this.heroPhysics.resetToCenterWell();
          this.heroPhysics.setPhysicsEnabled(true);
        }
      }
    } else {
      // 3. Smoothly damp camera after responsive aspect changes
      const camLerp = this.ctx.reducedMotion ? 1 : 1 - Math.exp(-8 * safeDt);
      if (
        this.ctx.camera.position.distanceToSquared(this.camToPos) > 1e-6 ||
        this.currentLookAt.distanceToSquared(this.camToLook) > 1e-6
      ) {
        this.ctx.camera.position.lerp(this.camToPos, camLerp);
        this.currentLookAt.lerp(this.camToLook, camLerp);
        this.ctx.camera.lookAt(this.currentLookAt);
      }
    }

    // 4. Stage-specific update (always animate continuously, including during 0.85s fly-in)
    if (this.activeStage !== 'hero') {
      const current = this.stages.get(this.activeStage);
      if (current) {
        current.update(safeDt, elapsed, this.ctx);
        if (!this.isTransitioning) {
          const targetAnchor = current.getMarbleAnchor(elapsed, this.ctx.interaction);
          const marbleLerp = this.ctx.reducedMotion ? 1 : 1 - Math.exp(-10 * safeDt);
          this.ctx.marbleMesh.position.lerp(targetAnchor, marbleLerp);
        }
      }
    }
  }

  public dispose(): void {
    this.stages.forEach((stage) => {
      stage.dispose();
      this.ctx.scene.remove(stage.group);
    });
    this.stages.clear();
    this.stageFactories.clear();
    this.dockColliders.clear();
  }

  private finishTransitionImmediately(): void {
    this.isTransitioning = false;
    this.transitionElapsed = this.transitionDurationSec;
    this.ctx.camera.position.copy(this.camToPos);
    this.currentLookAt.copy(this.camToLook);
    this.ctx.camera.lookAt(this.currentLookAt);
    this.ctx.marbleMesh.position.copy(this.marbleArc.v2);
    if (this.activeStage === 'hero') {
      this.heroPhysics.resetToCenterWell();
      this.heroPhysics.setPhysicsEnabled(true);
    }
  }

  private setupMarbleArc(start: THREE.Vector3, end: THREE.Vector3): void {
    this.tmpArcMid.copy(start).lerp(end, 0.5);
    this.tmpArcMid.z += 1.25; // Lift toward camera during flight for tactile depth
    this.tmpArcMid.y += 0.35;
    this.marbleArc.v0.copy(start);
    this.marbleArc.v1.copy(this.tmpArcMid);
    this.marbleArc.v2.copy(end);
  }
}
