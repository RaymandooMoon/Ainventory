import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  AinvtryStageDirector,
  computeResponsiveCameraPreset,
  DEFAULT_STAGE_INTERACTION_STATE,
  DomDockColliderSync,
  HERO_CAMERA_PRESET,
  HERO_MARBLE_WELL,
  STAGE_CAMERA_PRESETS,
  type ActiveStageId,
  type HeroMarblePhysicsPort,
  type MoodMode,
  type StageContext,
  type StageId,
  type StageInteractionState,
  type StageModule,
  type ThemeMode,
} from '../../src/three/ainvtryStageDirector.ts';
import { createAboutStage } from '../../src/three/stages/aboutStage.ts';
import { createArchitectureStage } from '../../src/three/stages/architectureStage.ts';
import { createSpecsStage } from '../../src/three/stages/specsStage.ts';
import { createStudioStage } from '../../src/three/stages/studioStage.ts';

interface MockRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function makeFakeElement(rect: MockRect): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

interface MockStageSpies {
  readonly module: StageModule;
  readonly events: string[];
  glassHistory: number[];
  visualHistory: Array<{ mood: MoodMode; theme: ThemeMode }>;
  interactionHistory: Array<Partial<StageInteractionState>>;
  dragCalls: Array<{ dx: number; dy: number }>;
  moveCalls: Array<{ ndcX: number; ndcY: number }>;
  tapCalls: Array<{ ndcX: number; ndcY: number }>;
  updateCount: number;
  disposed: boolean;
  lastCtx: StageContext | null;
}

function createMockStage(id: ActiveStageId, anchor: THREE.Vector3): MockStageSpies {
  const group = new THREE.Group();
  group.name = `mock-${id}`;
  const events: string[] = [];
  const spies: MockStageSpies = {
    module: null as unknown as StageModule,
    events,
    glassHistory: [],
    visualHistory: [],
    interactionHistory: [],
    dragCalls: [],
    moveCalls: [],
    tapCalls: [],
    updateCount: 0,
    disposed: false,
    lastCtx: null,
  };

  const module: StageModule = {
    id,
    group,
    cameraPreset: STAGE_CAMERA_PRESETS[id],
    getMarbleAnchor: (_elapsed: number, _state: StageInteractionState) => anchor.clone(),
    onEnter: (ctx: StageContext) => {
      spies.lastCtx = ctx;
      events.push('enter');
    },
    onExit: (ctx: StageContext) => {
      spies.lastCtx = ctx;
      events.push('exit');
    },
    onGlassChange: (ratio: number) => {
      spies.glassHistory.push(ratio);
      events.push(`glass:${ratio.toFixed(2)}`);
    },
    onVisualModeChange: (mood: MoodMode, theme: ThemeMode) => {
      spies.visualHistory.push({ mood, theme });
      events.push(`visual:${mood}:${theme}`);
    },
    onInteractionChange: (patch: Partial<StageInteractionState>, ctx: StageContext) => {
      spies.lastCtx = ctx;
      spies.interactionHistory.push(patch);
    },
    onPointerMove: (ndcX: number, ndcY: number, ctx: StageContext) => {
      spies.lastCtx = ctx;
      spies.moveCalls.push({ ndcX, ndcY });
    },
    onPointerDrag: (dx: number, dy: number, ctx: StageContext) => {
      spies.lastCtx = ctx;
      spies.dragCalls.push({ dx, dy });
    },
    onPointerTap: (ndcX: number, ndcY: number, ctx: StageContext) => {
      spies.lastCtx = ctx;
      spies.tapCalls.push({ ndcX, ndcY });
    },
    update: (_dt: number, _elapsed: number, ctx: StageContext) => {
      spies.lastCtx = ctx;
      spies.updateCount += 1;
    },
    dispose: () => {
      spies.disposed = true;
      events.push('dispose');
    },
  };

  (spies as { module: StageModule }).module = module;
  return spies;
}

function createHeroPhysicsStub(initialPos = HERO_MARBLE_WELL.clone()): {
  port: HeroMarblePhysicsPort;
  position: THREE.Vector3;
  enabledHistory: boolean[];
  resetCount: number;
} {
  const stub = {
    position: initialPos.clone(),
    enabledHistory: [] as boolean[],
    resetCount: 0,
    port: null as unknown as HeroMarblePhysicsPort,
  };

  stub.port = {
    setPhysicsEnabled: (enabled: boolean) => {
      stub.enabledHistory.push(enabled);
    },
    resetToCenterWell: () => {
      stub.resetCount += 1;
      stub.position.copy(HERO_MARBLE_WELL);
    },
    getWorldPosition: (target: THREE.Vector3) => target.copy(stub.position),
    getRadius: () => 0.18,
  };

  return stub;
}

function createHarness(options: { reducedMotion?: boolean; aspect?: number } = {}) {
  const aspect = options.aspect ?? 1440 / 900;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
  camera.position.copy(HERO_CAMERA_PRESET.position);
  camera.lookAt(HERO_CAMERA_PRESET.lookAt);
  camera.updateMatrixWorld();

  const marbleMesh = new THREE.Group();
  marbleMesh.position.copy(HERO_MARBLE_WELL);
  scene.add(marbleMesh);

  const canvasEl = makeFakeElement({
    left: 0,
    top: 0,
    right: 1440,
    bottom: 900,
    width: 1440,
    height: 900,
  });

  const dockColliders = new DomDockColliderSync(camera, canvasEl, 0);
  const heroPhysics = createHeroPhysicsStub();

  const stageChanges: Array<{ next: StageId; prev: StageId }> = [];
  const dockRipples: ActiveStageId[] = [];
  const uiSyncPatches: Array<Partial<StageInteractionState>> = [];

  const director = new AinvtryStageDirector(
    scene,
    camera,
    marbleMesh,
    heroPhysics.port,
    dockColliders,
    {
      onStageChange: (next, prev) => stageChanges.push({ next, prev }),
      onDockRipple: (stageId) => dockRipples.push(stageId),
      onUiSync: (patch) => uiSyncPatches.push(patch),
    },
    {
      initialAspect: aspect,
      transitionDurationSec: 0.85,
      reducedMotion: options.reducedMotion ?? false,
    }
  );

  const mocks = {
    studio: createMockStage('studio', new THREE.Vector3(-0.6, -1.12, 2.08)),
    architecture: createMockStage('architecture', new THREE.Vector3(0.0, 0.25, 0.45)),
    specs: createMockStage('specs', new THREE.Vector3(-0.8, 0.6, 0.2)),
    about: createMockStage('about', new THREE.Vector3(0.4, -0.35, 1.35)),
  };

  director.registerStage(mocks.studio.module);
  director.registerStage(mocks.architecture.module);
  director.registerStage(mocks.specs.module);
  director.registerStage(mocks.about.module);

  return {
    scene,
    camera,
    marbleMesh,
    dockColliders,
    heroPhysics,
    director,
    mocks,
    stageChanges,
    dockRipples,
    uiSyncPatches,
  };
}

describe('computeResponsiveCameraPreset', () => {
  it('preserves left-58% +X camera shift on wide desktop aspects (>= 1.0)', () => {
    const outPos = new THREE.Vector3();
    const outLook = new THREE.Vector3();

    computeResponsiveCameraPreset(STAGE_CAMERA_PRESETS.studio, 1440 / 900, outPos, outLook, false);
    assert.ok(outPos.equals(STAGE_CAMERA_PRESETS.studio.position));
    assert.ok(outLook.equals(STAGE_CAMERA_PRESETS.studio.lookAt));
    assert.ok(outPos.x > 0, 'Desktop preset shifts +X so 3D centerpiece frames cleanly on left 58%');
  });

  it('re-centers X = 0, lowers lookAt Y, and pulls Z back on narrow portrait mobile aspects (390x844)', () => {
    const base = STAGE_CAMERA_PRESETS.architecture;
    const outPos = new THREE.Vector3();
    const outLook = new THREE.Vector3();

    computeResponsiveCameraPreset(base, 390 / 844, outPos, outLook, false);
    assert.equal(outPos.x, 0);
    assert.equal(outLook.x, 0);
    assert.ok(Math.abs(outLook.y - (base.lookAt.y - 0.42)) < 1e-6);
    assert.ok(outPos.z > base.position.z * 1.4, 'Portrait framing must pull camera Z back');
    assert.ok(outPos.z <= base.position.z * 1.82 + 1e-6, 'Portrait pullback must remain clamped');

    // HERO portrait pullback
    const heroPos = new THREE.Vector3();
    const heroLook = new THREE.Vector3();
    computeResponsiveCameraPreset(HERO_CAMERA_PRESET, 390 / 844, heroPos, heroLook, true);
    assert.ok(heroPos.z > HERO_CAMERA_PRESET.position.z);
    assert.ok(heroPos.z <= HERO_CAMERA_PRESET.position.z * 1.38 + 1e-6);
  });

  it('smoothly blends intermediate aspects and guards against non-positive or NaN aspect ratios', () => {
    const base = STAGE_CAMERA_PRESETS.specs;
    const midPos = new THREE.Vector3();
    const midLook = new THREE.Vector3();

    computeResponsiveCameraPreset(base, 0.925, midPos, midLook, false);
    assert.ok(midPos.x > 0 && midPos.x < base.position.x);
    assert.ok(midPos.z > base.position.z);

    const safePos = new THREE.Vector3();
    const safeLook = new THREE.Vector3();
    computeResponsiveCameraPreset(base, Number.NaN, safePos, safeLook, false);
    assert.ok(safePos.equals(base.position), 'Invalid aspect should fall back cleanly to 16:9 desktop');
    assert.ok(safeLook.equals(base.lookAt));
  });

  it('activates centered mobile sheet framing below 860px width to match CSS bottom-sheet breakpoint', () => {
    const base = STAGE_CAMERA_PRESETS.studio;
    const compactPos = new THREE.Vector3();
    const compactLook = new THREE.Vector3();
    computeResponsiveCameraPreset(base, 800 / 700, compactPos, compactLook, false, 1.48, 800);
    assert.equal(compactPos.x, 0, '800px compact tablet (<860px) must center X = 0 for bottom sheet');
    assert.equal(compactLook.x, 0);

    const desktopPos = new THREE.Vector3();
    const desktopLook = new THREE.Vector3();
    computeResponsiveCameraPreset(base, 1280 / 800, desktopPos, desktopLook, false, 1.48, 1280);
    assert.ok(desktopPos.equals(base.position), '1280px desktop (>=860px) keeps left-58% +X offset');
  });
});

describe('DomDockColliderSync', () => {
  it('projects DOM pill rects onto z=0 world space, detects marble hits with cooldown, and clears cleanly', () => {
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.1, 100);
    camera.position.copy(HERO_CAMERA_PRESET.position);
    camera.lookAt(HERO_CAMERA_PRESET.lookAt);
    camera.updateMatrixWorld();

    const canvasEl = makeFakeElement({
      left: 0,
      top: 0,
      right: 1440,
      bottom: 900,
      width: 1440,
      height: 900,
    });

    const sync = new DomDockColliderSync(camera, canvasEl, 0);
    // Center-bottom pill at screen center X = 720, Y = 780
    const studioBtn = makeFakeElement({
      left: 650,
      top: 760,
      right: 790,
      bottom: 800,
      width: 140,
      height: 40,
    });
    const aboutBtn = makeFakeElement({
      left: 1050,
      top: 760,
      right: 1190,
      bottom: 800,
      width: 140,
      height: 40,
    });

    sync.registerButtons({ studio: studioBtn, about: aboutBtn, specs: null });

    // Compute exact world-space center of studioBtn via raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, -((780 / 900) * 2 - 1)), camera);
    const worldHit = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), worldHit);

    // Far away -> miss
    assert.equal(sync.detectHit(new THREE.Vector3(-8, 5, 0), 0.18, 1000), null);

    // Direct intersection -> hits studio
    assert.equal(sync.detectHit(worldHit, 0.18, 1000, 700), 'studio');

    // Within cooldown window -> suppressed
    assert.equal(sync.detectHit(worldHit, 0.18, 1500, 700), null);

    // After cooldown -> triggers again
    assert.equal(sync.detectHit(worldHit, 0.18, 1800, 700), 'studio');

    // Clear removes all targets
    sync.clear();
    assert.equal(sync.detectHit(worldHit, 0.18, 3000, 700), null);
  });
});

describe('AinvtryStageDirector', () => {
  it('registers all 4 stages hidden in scene and guards duplicate or unregistered transitions', () => {
    const h = createHarness();
    assert.equal(h.director.getActiveStage(), 'hero');
    assert.equal(h.director.isTransitionActive(), false);

    for (const id of ['studio', 'architecture', 'specs', 'about'] as const) {
      const stage = h.director.getStage(id);
      assert.ok(stage, `Stage ${id} must be registered`);
      assert.equal(stage.group.visible, false);
      assert.equal(stage.group.parent, h.scene);
    }

    // No-op when transitioning to current stage
    h.director.transitionTo('hero', 0);
    assert.equal(h.stageChanges.length, 0);

    // Unregistered stage does not mutate active state
    const freshScene = new THREE.Scene();
    const freshCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const freshDirector = new AinvtryStageDirector(
      freshScene,
      freshCam,
      new THREE.Group(),
      createHeroPhysicsStub().port,
      new DomDockColliderSync(
        freshCam,
        makeFakeElement({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 })
      )
    );
    freshDirector.transitionTo('studio', 0);
    assert.equal(freshDirector.getActiveStage(), 'hero');
  });

  it('executes 0.85s cubic interpolation, Bezier marble flight arc, Stage->Stage switch, and returnToHero', () => {
    const h = createHarness();
    const startPos = new THREE.Vector3(-1.2, -1.5, 0);
    const studioAnchor = h.mocks.studio.module.getMarbleAnchor(0, DEFAULT_STAGE_INTERACTION_STATE);

    // HERO -> Studio
    h.director.transitionTo('studio', 0, startPos);
    assert.equal(h.director.getActiveStage(), 'studio');
    assert.equal(h.director.isTransitionActive(), true);
    assert.equal(h.mocks.studio.module.group.visible, true);
    assert.deepEqual(h.heroPhysics.enabledHistory, [false]);
    assert.deepEqual(h.dockRipples, ['studio']);
    assert.deepEqual(h.stageChanges, [{ next: 'studio', prev: 'hero' }]);
    assert.deepEqual(h.mocks.studio.events, ['glass:0.50', 'visual:luxury:dark', 'enter']);

    // Advance half of 0.85s (8.5 steps -> 9 * 0.047222 = 0.425s; keep dt <= 0.05)
    for (let i = 0; i < 9; i += 1) {
      h.director.update(0.425 / 9, i * 0.05);
    }
    assert.equal(h.director.isTransitionActive(), true);

    // At t = 0.5, Bezier midpoint lifts marble in +Z (control point +1.25z) and +Y (+0.35y)
    // Quadratic Bezier at t=0.5 is 0.25*v0 + 0.5*v1 + 0.25*v2 = chordMid + 0.5*(0, 0.35, 1.25)
    const chordMid = startPos.clone().lerp(studioAnchor, 0.5);
    assert.ok(
      h.marbleMesh.position.z > chordMid.z + 0.5,
      `Expected Bezier Z arc lift above chord (${h.marbleMesh.position.z} vs ${chordMid.z})`
    );
    assert.ok(
      h.marbleMesh.position.y > chordMid.y + 0.12,
      `Expected Bezier Y arc lift above chord (${h.marbleMesh.position.y} vs ${chordMid.y})`
    );
    // Camera is halfway between HERO and Studio preset
    const midCamX = (HERO_CAMERA_PRESET.position.x + STAGE_CAMERA_PRESETS.studio.position.x) * 0.5;
    assert.ok(Math.abs(h.camera.position.x - midCamX) < 1e-3);

    // Finish remaining 0.425s (plus one tick to guarantee rawT >= 1)
    for (let i = 0; i < 10; i += 1) {
      h.director.update(0.05, 0.45 + i * 0.05);
    }
    assert.equal(h.director.isTransitionActive(), false);
    assert.ok(h.camera.position.distanceTo(STAGE_CAMERA_PRESETS.studio.position) < 1e-3);
    assert.ok(h.marbleMesh.position.distanceTo(studioAnchor) < 1e-3);

    // Next active frame updates studio stage
    h.director.update(0.016, 1.0);
    assert.ok(h.mocks.studio.updateCount >= 1);

    // Studio -> Architecture
    h.director.transitionTo('architecture', 1.1);
    assert.equal(h.mocks.studio.module.group.visible, false);
    assert.ok(h.mocks.studio.events.includes('exit'));
    assert.equal(h.mocks.architecture.module.group.visible, true);
    assert.equal(h.director.getActiveStage(), 'architecture');

    // Return to HERO
    h.director.returnToHero(1.2);
    assert.equal(h.director.getActiveStage(), 'hero');
    assert.equal(h.mocks.architecture.module.group.visible, false);
    assert.equal(h.director.isTransitionActive(), true);

    for (let i = 0; i < 18; i += 1) {
      h.director.update(0.05, 1.2 + i * 0.05);
    }
    assert.equal(h.director.isTransitionActive(), false);
    assert.equal(h.heroPhysics.resetCount, 1);
    assert.equal(h.heroPhysics.enabledHistory.at(-1), true);
    assert.ok(h.camera.position.distanceTo(HERO_CAMERA_PRESET.position) < 1e-3);
    assert.ok(h.marbleMesh.position.distanceTo(HERO_MARBLE_WELL) < 1e-3);
  });

  it('auto-triggers stage transition when HERO marble collides with a synced DOM dock pill', (t) => {
    t.mock.method(performance, 'now', () => 2000);
    const h = createHarness();
    const specsBtn = makeFakeElement({
      left: 650,
      top: 760,
      right: 790,
      bottom: 800,
      width: 140,
      height: 40,
    });
    h.dockColliders.registerButtons({ specs: specsBtn });

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, -((780 / 900) * 2 - 1)), h.camera);
    const pillWorld = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), pillWorld);
    h.heroPhysics.position.copy(pillWorld);

    h.director.update(0.016, 0.2);
    assert.equal(h.director.getActiveStage(), 'specs');
    assert.deepEqual(h.dockRipples, ['specs']);
  });

  it('syncs Glass %, Luxury/Aurora + Dark/Light visual mode, interaction patches (googleApiIndex, aboutJourneyIndex), and emitUiSync', () => {
    const h = createHarness({ reducedMotion: true });
    h.director.transitionTo('architecture', 0);
    assert.equal(h.director.isTransitionActive(), false, 'reducedMotion must complete transitions immediately');

    // Glass % clamping
    h.director.setGlassPercent(80);
    h.director.setGlassPercent(150);
    h.director.setGlassPercent(-10);
    assert.deepEqual(h.mocks.architecture.glassHistory.slice(-3), [0.8, 1, 0]);

    // Visual mode propagation
    h.director.setVisualMode('aurora', 'light');
    assert.deepEqual(h.mocks.architecture.visualHistory.at(-1), {
      mood: 'aurora',
      theme: 'light',
    });

    // Interaction patches including googleApiIndex and aboutJourneyIndex
    const before = h.director.getInteraction();
    h.director.updateInteraction({
      googleApiIndex: 3,
      weatherMood: 'wind',
      architectureMode: 'prod',
      aboutJourneyIndex: 4,
    });
    const after = h.director.getInteraction();
    assert.notEqual(before, after, 'Interaction state must be updated immutably');
    assert.equal(after.googleApiIndex, 3);
    assert.equal(after.weatherMood, 'wind');
    assert.equal(after.architectureMode, 'prod');
    assert.equal(after.aboutJourneyIndex, 4);
    assert.equal(h.mocks.architecture.interactionHistory.length, 1);
    assert.equal(h.mocks.architecture.interactionHistory[0].googleApiIndex, 3);

    // Stage -> HUD emitUiSync callback round-trip
    h.mocks.architecture.lastCtx?.emitUiSync({ architectureTier: 1 });
    assert.equal(h.director.getInteraction().architectureTier, 1);
    assert.deepEqual(h.uiSyncPatches, [{ architectureTier: 1 }]);

    // Newly entered stage receives persisted glass & visual state
    h.director.transitionTo('about', 1.0);
    assert.equal(h.mocks.about.glassHistory.at(-1), 0);
    assert.deepEqual(h.mocks.about.visualHistory.at(-1), { mood: 'aurora', theme: 'light' });
    h.director.updateInteraction({ aboutJourneyIndex: 5, aboutLoopPaused: true });
    assert.equal(h.director.getInteraction().aboutJourneyIndex, 5);
    assert.equal(h.mocks.about.interactionHistory.at(-1)?.aboutJourneyIndex, 5);
  });

  it('forwards left-viewport pointer Drag/Move/Tap only when active and not mid-transition', () => {
    const h = createHarness();

    // Ignored on HERO
    h.director.handleLeftPointerDrag(0.2, 0.1);
    h.director.handleLeftPointerMove(0.1, 0.2);
    h.director.handleLeftPointerTap(0.1, 0.2);
    assert.equal(h.mocks.studio.dragCalls.length, 0);
    assert.equal(h.mocks.studio.moveCalls.length, 0);
    assert.equal(h.mocks.studio.tapCalls.length, 0);

    // Start transition to Studio
    h.director.transitionTo('studio', 0);
    assert.equal(h.director.isTransitionActive(), true);

    // During transition: Drag and Tap are gated; Move still updates hover parallax
    h.director.handleLeftPointerDrag(0.3, -0.1);
    h.director.handleLeftPointerTap(-0.2, 0.1);
    h.director.handleLeftPointerMove(-0.4, 0.25);
    assert.equal(h.mocks.studio.dragCalls.length, 0);
    assert.equal(h.mocks.studio.tapCalls.length, 0);
    assert.deepEqual(h.mocks.studio.moveCalls, [{ ndcX: -0.4, ndcY: 0.25 }]);

    // Complete transition via setReducedMotion(true)
    h.director.setReducedMotion(true);
    assert.equal(h.director.isTransitionActive(), false);

    h.director.handleLeftPointerDrag(0.25, 0.05);
    h.director.handleLeftPointerTap(-0.3, 0.15);
    assert.deepEqual(h.mocks.studio.dragCalls, [{ dx: 0.25, dy: 0.05 }]);
    assert.deepEqual(h.mocks.studio.tapCalls, [{ ndcX: -0.3, ndcY: 0.15 }]);
  });

  it('updates responsive camera framing when viewport switches between desktop and portrait aspect', () => {
    const h = createHarness({ reducedMotion: true, aspect: 1440 / 900 });
    h.director.transitionTo('studio', 0);
    assert.ok(h.camera.position.x > 0.5, 'Desktop studio camera keeps +X shift');

    h.director.setViewportAspect(390 / 844);
    assert.equal(h.camera.position.x, 0, 'Portrait studio camera centers X = 0');
    assert.ok(
      h.camera.position.z > STAGE_CAMERA_PRESETS.studio.position.z * 1.4,
      'Portrait studio camera pulls Z back'
    );

    h.director.setViewportAspect(1440 / 900);
    assert.ok(h.camera.position.equals(STAGE_CAMERA_PRESETS.studio.position));
  });

  it('runs real Studio/Architecture/Specs/About 3D stage modules end-to-end and disposes cleanly', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.1, 100);
    camera.position.copy(HERO_CAMERA_PRESET.position);
    const marble = new THREE.Group();
    scene.add(marble);
    const colliders = new DomDockColliderSync(
      camera,
      makeFakeElement({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 })
    );
    const director = new AinvtryStageDirector(
      scene,
      camera,
      marble,
      createHeroPhysicsStub().port,
      colliders,
      {},
      { reducedMotion: true, initialAspect: 1440 / 900 }
    );

    const realStages = [
      createStudioStage(),
      createArchitectureStage(),
      createSpecsStage(),
      createAboutStage(),
    ];
    for (const st of realStages) {
      director.registerStage(st);
    }

    for (const id of ['studio', 'architecture', 'specs', 'about'] as const) {
      director.transitionTo(id, 0.5);
      director.setGlassPercent(65);
      director.setVisualMode('aurora', 'light');
      director.update(0.016, 0.6);
      director.handleLeftPointerMove(-0.2, 0.1);
      director.handleLeftPointerDrag(0.12, 0);
      director.handleLeftPointerTap(-0.2, 0.1);
      director.update(0.016, 0.65);
      assert.equal(director.getActiveStage(), id);
    }

    director.returnToHero(1.0);
    assert.equal(director.getActiveStage(), 'hero');

    director.dispose();
    for (const st of realStages) {
      assert.equal(st.group.parent, null, `Stage ${st.id} must be detached from scene on dispose`);
      assert.equal(director.getStage(st.id), undefined);
    }
  });

  it('defaults Studio subtab to 3D Fitting (atelier) in DEFAULT_STAGE_INTERACTION_STATE', () => {
    assert.equal(DEFAULT_STAGE_INTERACTION_STATE.studioSubtab, 'atelier');
  });

  it('animates studio-orbital-rings with live 3D gyroscopic precession & spin when reducedMotion is false and holds still when reducedMotion is true', () => {
    const stage = createStudioStage();
    const scene = new THREE.Scene();
    scene.add(stage.group);
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.1, 100);
    const marble = new THREE.Group();

    const makeCtx = (reducedMotion: boolean): StageContext => ({
      scene,
      camera,
      marbleMesh: marble,
      glassRatio: 0.5,
      mood: 'luxury',
      theme: 'dark',
      viewportAspect: 1440 / 900,
      reducedMotion,
      interaction: { ...DEFAULT_STAGE_INTERACTION_STATE },
      emitUiSync: () => {},
    });

    const orbitalsGroup = stage.group.getObjectByName('studio-orbital-rings');
    assert.ok(orbitalsGroup, 'studio-orbital-rings group must exist');
    const outerPivot = orbitalsGroup.getObjectByName('studio-orbital-outer-pivot') ?? orbitalsGroup.children[0];
    const outerSpin = outerPivot?.getObjectByName('studio-orbital-outer-spin') ?? outerPivot?.children[0];
    const innerPivot = orbitalsGroup.getObjectByName('studio-orbital-inner-pivot') ?? orbitalsGroup.children[1];
    const innerSpin = innerPivot?.getObjectByName('studio-orbital-inner-spin') ?? innerPivot?.children[0];
    assert.ok(outerPivot && outerSpin && innerPivot && innerSpin, 'Outer and inner orbital pivots/spins must exist');

    // Live motion: rings must visibly precess, counter-spin, and breathe across elapsed ticks
    const liveCtx = makeCtx(false);
    stage.onEnter(liveCtx);
    stage.update(0.016, 0.1, liveCtx);
    const outerPivotY1 = outerPivot.rotation.y;
    const outerSpinZ1 = outerSpin.rotation.z;
    const innerPivotY1 = innerPivot.rotation.y;
    const innerSpinZ1 = innerSpin.rotation.z;
    const orbitY1 = orbitalsGroup.position.y;

    stage.update(0.016, 1.6, liveCtx);
    const outerPivotY2 = outerPivot.rotation.y;
    const outerSpinZ2 = outerSpin.rotation.z;
    const innerPivotY2 = innerPivot.rotation.y;
    const innerSpinZ2 = innerSpin.rotation.z;
    const orbitY2 = orbitalsGroup.position.y;

    assert.ok(
      Math.abs(outerPivotY2 - outerPivotY1) > 0.5,
      `Expected live outer gyroscopic precession (delta=${Math.abs(outerPivotY2 - outerPivotY1)})`
    );
    assert.ok(
      Math.abs(outerSpinZ2 - outerSpinZ1) > 1.2,
      `Expected live outer orbital sweep spin (delta=${Math.abs(outerSpinZ2 - outerSpinZ1)})`
    );
    assert.ok(
      Math.abs(innerPivotY2 - innerPivotY1) > 0.6,
      `Expected live inner counter-precession (delta=${Math.abs(innerPivotY2 - innerPivotY1)})`
    );
    assert.ok(
      Math.abs(innerSpinZ2 - innerSpinZ1) > 1.5,
      `Expected live inner counter-spin (delta=${Math.abs(innerSpinZ2 - innerSpinZ1)})`
    );
    assert.ok(
      Math.abs(orbitY2 - orbitY1) > 0.01,
      `Expected live vertical orbital breathing float (delta=${Math.abs(orbitY2 - orbitY1)})`
    );

    // Reduced motion: rings must remain completely stationary across elapsed ticks
    const reducedCtx = makeCtx(true);
    stage.update(0.016, 0.1, reducedCtx);
    const staticSnapshot = {
      outerPivotX: outerPivot.rotation.x,
      outerPivotY: outerPivot.rotation.y,
      outerPivotZ: outerPivot.rotation.z,
      outerSpinZ: outerSpin.rotation.z,
      innerPivotX: innerPivot.rotation.x,
      innerPivotY: innerPivot.rotation.y,
      innerPivotZ: innerPivot.rotation.z,
      innerSpinZ: innerSpin.rotation.z,
      orbitY: orbitalsGroup.position.y,
    };

    stage.update(0.016, 1.6, reducedCtx);
    assert.deepEqual(
      {
        outerPivotX: outerPivot.rotation.x,
        outerPivotY: outerPivot.rotation.y,
        outerPivotZ: outerPivot.rotation.z,
        outerSpinZ: outerSpin.rotation.z,
        innerPivotX: innerPivot.rotation.x,
        innerPivotY: innerPivot.rotation.y,
        innerPivotZ: innerPivot.rotation.z,
        innerSpinZ: innerSpin.rotation.z,
        orbitY: orbitalsGroup.position.y,
      },
      staticSnapshot,
      'Orbital rings must remain stationary when reducedMotion is true'
    );

    stage.dispose();
  });

  it('keeps studio-orbital-rings translucent with depthWrite off, synced to menu Glass % (10 -> 50 -> 90), and preserved across aurora/light mode', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.1, 100);
    camera.position.copy(HERO_CAMERA_PRESET.position);
    const marble = new THREE.Group();
    scene.add(marble);
    const colliders = new DomDockColliderSync(
      camera,
      makeFakeElement({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 })
    );
    const director = new AinvtryStageDirector(
      scene,
      camera,
      marble,
      createHeroPhysicsStub().port,
      colliders,
      {},
      { reducedMotion: true, initialAspect: 1440 / 900 }
    );

    const studioStage = createStudioStage();
    director.registerStage(studioStage);
    director.transitionTo('studio', 0);

    const orbitalsGroup = studioStage.group.getObjectByName('studio-orbital-rings');
    assert.ok(orbitalsGroup, 'studio-orbital-rings group must exist');

    const materials = new Set<THREE.Material>();
    let meshCount = 0;
    orbitalsGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshCount += 1;
      assert.equal(mesh.renderOrder, 3, 'Every orbital mesh must use renderOrder = 3');
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat) materials.add(mat);
      }
    });

    assert.ok(meshCount >= 10, `Expected orbital meshes, got ${meshCount}`);
    assert.ok(materials.size >= 3, `Expected at least 3 orbital materials, got ${materials.size}`);

    const matList = Array.from(materials);
    const sampleOpacities = (): number[] =>
      matList.map((mat) => {
        assert.equal(mat.transparent, true, 'Orbital material must have transparent === true');
        assert.equal(mat.depthWrite, false, 'Orbital material must have depthWrite === false');
        return mat.opacity;
      });

    director.setGlassPercent(10);
    const op10 = sampleOpacities();

    director.setGlassPercent(50);
    const op50 = sampleOpacities();

    director.setGlassPercent(90);
    const op90 = sampleOpacities();

    for (let i = 0; i < matList.length; i += 1) {
      assert.ok(
        op10[i] > op50[i] && op50[i] > op90[i],
        `Expected orbital material[${i}] opacity to strictly decrease as Glass % rises 10 -> 50 -> 90 (${op10[i]} -> ${op50[i]} -> ${op90[i]})`
      );
      assert.ok(
        op90[i] > 0 && op90[i] < 0.4,
        `Expected orbital material[${i}] to whisper translucently at Glass 90% (got ${op90[i]})`
      );
    }

    // Switching to Aurora + Light mode must never overwrite translucency
    director.setVisualMode('aurora', 'light');
    director.update(0.016, 0.5);
    const opAuroraLight90 = sampleOpacities();
    for (let i = 0; i < matList.length; i += 1) {
      assert.ok(
        opAuroraLight90[i] > 0 && opAuroraLight90[i] < 0.45,
        `Expected orbital material[${i}] to remain translucent in aurora/light at Glass 90% (got ${opAuroraLight90[i]})`
      );
    }

    director.dispose();
  });

  it('sizes unfolded studio-champagne-umbrella to compact luxury fashion proportions (width <= 1.25)', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.1, 100);
    camera.position.copy(HERO_CAMERA_PRESET.position);
    const marble = new THREE.Group();
    scene.add(marble);
    const colliders = new DomDockColliderSync(
      camera,
      makeFakeElement({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 })
    );
    const director = new AinvtryStageDirector(
      scene,
      camera,
      marble,
      createHeroPhysicsStub().port,
      colliders,
      {},
      { reducedMotion: true, initialAspect: 1440 / 900 }
    );

    const studioStage = createStudioStage();
    director.registerStage(studioStage);
    director.transitionTo('studio', 0);
    director.updateInteraction({ studioPose: 'rain' });
    director.update(0.016, 0.5);

    const umbrellaGroup = studioStage.group.getObjectByName('studio-champagne-umbrella');
    assert.ok(umbrellaGroup, 'studio-champagne-umbrella group must exist');
    assert.equal(umbrellaGroup.visible, true, 'Umbrella must be visible in rain pose');
    assert.ok(
      umbrellaGroup.scale.x >= 0.99,
      `Expected umbrella to be fully unfolded (scale.x=${umbrellaGroup.scale.x})`
    );

    studioStage.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(umbrellaGroup);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    assert.ok(
      size.x > 0.8 && size.x <= 1.25,
      `Expected compact luxury umbrella width in (0.8, 1.25], got size.x=${size.x.toFixed(3)}`
    );
    assert.ok(
      size.z > 0.8 && size.z <= 1.25,
      `Expected compact luxury umbrella depth in (0.8, 1.25], got size.z=${size.z.toFixed(3)}`
    );

    director.dispose();
  });

  it('references a versioned cache-busted avatar GLB containing Stand, Walk, and Rain animation clips', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const studioSrc = fs.readFileSync(
      path.resolve('src/three/stages/studioStage.ts'),
      'utf8'
    );
    const match = studioSrc.match(
      /const\s+HF_FASHION_AVATAR_GLB_URL\s*=\s*'(\/assets\/models\/hf-fashion-avatar-v(\d+)\.glb)'/
    );
    assert.ok(match, 'studioStage.ts must declare a versioned HF_FASHION_AVATAR_GLB_URL');
    const [, urlPath, versionStr] = match;
    assert.ok(
      Number(versionStr) >= 3,
      `Expected cache-busted avatar version >= 3 for immutable /assets/* caching, got v${versionStr}`
    );

    const glbFile = path.resolve('site/public', urlPath.replace(/^\//, ''));
    assert.ok(fs.existsSync(glbFile), `Expected avatar GLB to exist at ${glbFile}`);

    const buf = fs.readFileSync(glbFile);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF', 'Avatar GLB must have valid glTF magic header');
    const jsonChunkLen = buf.readUInt32LE(12);
    const gltfJson = JSON.parse(buf.subarray(20, 20 + jsonChunkLen).toString('utf8')) as {
      animations?: Array<{ name?: string }>;
    };
    const clipNames = (gltfJson.animations ?? []).map((clip) => clip.name);
    assert.ok(clipNames.includes('Stand'), `Expected Stand clip in ${urlPath}, got ${clipNames.join(', ')}`);
    assert.ok(clipNames.includes('Walk'), `Expected Walk clip in ${urlPath}, got ${clipNames.join(', ')}`);
    assert.ok(clipNames.includes('Rain'), `Expected Rain clip in ${urlPath}, got ${clipNames.join(', ')}`);
  });
});

