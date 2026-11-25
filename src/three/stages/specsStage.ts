/**
 * specsStage.ts
 * ---------------------------------------------------------------------------
 * Specs 3D Stage Module for ainvtry.com (Three.js 0.187 / WebGL2)
 *
 * 1. Reflective obsidian floor (`y = -1.35`) with radial-faded architectural
 *    grid lines and 3 expanding luminous champagne-gold concentric ripple rings.
 * 2. 6 sculpted smoked-glass metric pillars (`5-STAGE`, `0B FACE`, `210+ TESTS`,
 *    `4 APIs`, `21-BONE`, `EXIF -96%`), pivoted at `y = 0`, with champagne-gold
 *    wireframe edges, bottom-weighted inner warm glow cores, 2× Retina floating
 *    labels tracking live elevated height, and 68 rising golden sparkle particles.
 * 3. Smooth foreground marble glide (`y = -1.04`) tracking pointer hover/drag or
 *    HUD `specsFocusedIndex`, real-time Euclidean XZ proximity wave elevation
 *    (+0.78 peak boost), and direct 3D pillar tap raycasting back to the HUD.
 */

import * as THREE from 'three';
import { SPECS_3D_PILLAR_LABELS } from '../../data/content.ts';
import {
  STAGE_CAMERA_PRESETS,
  type MoodMode,
  type StageContext,
  type StageInteractionState,
  type StageModule,
  type ThemeMode,
} from '../ainvtryStageDirector.ts';
import {
  STAGE_PALETTE,
  applyGoldModeState,
  applySmokedGlassState,
  createChampagneGoldMaterial,
  createFloatingLabelSprite,
  createSmokedGlassMaterial,
  disposeObject3D,
  type FloatingLabelHandle,
} from './stageMaterials.ts';

/* ==========================================================================
 * 1. Constants, Asymmetric Gallery Coordinates & Theme Palette
 * ========================================================================== */

const FLOOR_Y = -1.35;
const MARBLE_Y = -1.04;
const GRID_YAW = 0.25;
const PILLAR_WIDTH = 0.42;
const MAX_PROXIMITY_BOOST = 0.72;
const PROXIMITY_NEAR_DIST = 0.95;
const PROXIMITY_FAR_DIST = 2.35;
const SPARKLE_COUNT = 68;
const RIPPLE_RING_COUNT = 3;
const LABEL_TOP_CLEARANCE = 0.2;
const POINTER_DRAG_SENSITIVITY = 0.0085;
const CLUSTER_ORIGIN_X = -0.52;
const CLUSTER_ORIGIN_Z = -0.35;
const COS_YAW = Math.cos(GRID_YAW);
const SIN_YAW = Math.sin(GRID_YAW);

// 2-Phase Architecture -> Specs Opening Choreography:
// Phase 1 (0 -> INTRO_HOLD_STACK): Present the 6 glass modules stacked vertically like the 6-tier Architecture tower
// Phase 2 (INTRO_HOLD_STACK -> INTRO_UNFOLD_END): Fan each tier down onto the benchmark grid and rise into 6 metric pillars
const INTRO_HOLD_STACK = 0.68;
const INTRO_UNFOLD_END = 1.92;
const ARCH_STACK_SLAB_SCALE_XZ = 3.15;
const ARCH_STACK_SLAB_HEIGHT = 0.21;
const ARCH_STACK_STEP_Y = 0.34;
const ARCH_STACK_BASE_Y = FLOOR_Y + 0.34;
const ARCH_STACK_YAW = 0.44;

type PillarIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface PillarLayoutSpec {
  readonly index: PillarIndex;
  readonly label: string;
  readonly baseHeight: number;
  readonly x: number;
  readonly z: number;
}

function projectGridToWorld(u: number, v: number): { readonly x: number; readonly z: number } {
  return {
    x: CLUSTER_ORIGIN_X + u * COS_YAW + v * SIN_YAW,
    z: CLUSTER_ORIGIN_Z - u * SIN_YAW + v * COS_YAW,
  };
}

/**
 * 6 sculpted glass pillars arranged tightly enough to fit the left split lane
 * without clipping; the selected pillar surges taller, wider, and steps forward.
 */
const PILLAR_LAYOUTS: readonly PillarLayoutSpec[] = [
  { index: 0, label: SPECS_3D_PILLAR_LABELS[0], baseHeight: 1.05, ...projectGridToWorld(-1.35, -0.06) },
  { index: 1, label: SPECS_3D_PILLAR_LABELS[1], baseHeight: 1.22, ...projectGridToWorld(-0.81, -0.04) },
  { index: 2, label: SPECS_3D_PILLAR_LABELS[2], baseHeight: 1.38, ...projectGridToWorld(-0.27, -0.02) },
  { index: 3, label: SPECS_3D_PILLAR_LABELS[3], baseHeight: 1.28, ...projectGridToWorld(0.27, 0.02) },
  { index: 4, label: SPECS_3D_PILLAR_LABELS[4], baseHeight: 1.14, ...projectGridToWorld(0.81, 0.04) },
  { index: 5, label: SPECS_3D_PILLAR_LABELS[5], baseHeight: 1.02, ...projectGridToWorld(1.35, 0.06) },
];

const ARC_MIN_X = PILLAR_LAYOUTS[0].x;
const ARC_MAX_X = PILLAR_LAYOUTS[5].x;
const ARC_MID_X = (ARC_MIN_X + ARC_MAX_X) * 0.5;
const ARC_HALF_SPAN = (ARC_MAX_X - ARC_MIN_X) * 0.5;

interface SpecsColorScheme {
  readonly floor: number;
  readonly floorEmissive: number;
  readonly grid: number;
  readonly rail: number;
  readonly glow: number;
  readonly rippleInner: number;
  readonly rippleOuter: number;
  readonly edge: number;
  readonly core: number;
  readonly filament: number;
  readonly filamentEmissive: number;
  readonly sparkle: number;
  readonly marbleLight: number;
  readonly rimLight: number;
}

const SPECS_SCHEMES: Readonly<Record<`${MoodMode}-${ThemeMode}`, SpecsColorScheme>> = {
  'luxury-dark': {
    floor: 0x0b0b10, floorEmissive: 0x171109, grid: 0xd8c19a,
    rail: STAGE_PALETTE.champagneGold, glow: STAGE_PALETTE.champagneGoldBright,
    rippleInner: 0xf3dca8, rippleOuter: STAGE_PALETTE.champagneGoldBright,
    edge: STAGE_PALETTE.champagneGoldBright, core: 0xf4d79e, filament: 0xfff1d6,
    filamentEmissive: STAGE_PALETTE.champagneEmissiveDark, sparkle: 0xf4ddb0,
    marbleLight: 0xf2d49a, rimLight: 0xe7cca0,
  },
  'aurora-dark': {
    floor: 0x0a0e18, floorEmissive: 0x0d182b, grid: 0xa5c2ea,
    rail: STAGE_PALETTE.auroraSilverGold, glow: 0x9ec4f8,
    rippleInner: 0xdceaff, rippleOuter: STAGE_PALETTE.auroraEmissiveDark,
    edge: STAGE_PALETTE.auroraSilverGold, core: 0xa4c8fa, filament: 0xe8f2ff,
    filamentEmissive: STAGE_PALETTE.auroraEmissiveDark, sparkle: 0xd0e4ff,
    marbleLight: 0xa9cbf8, rimLight: 0x9ac0f2,
  },
  'luxury-light': {
    floor: 0xebe5dc, floorEmissive: 0xf4eee5, grid: 0x8b724f,
    rail: STAGE_PALETTE.champagneGoldLightTheme, glow: 0xc09652,
    rippleInner: 0xb28744, rippleOuter: STAGE_PALETTE.champagneGoldLightTheme,
    edge: STAGE_PALETTE.champagneGoldLightTheme, core: 0xbd9048, filament: 0xfff1d6,
    filamentEmissive: STAGE_PALETTE.champagneEmissiveLight, sparkle: 0xb08643,
    marbleLight: 0xd9b372, rimLight: 0xebd8b8,
  },
  'aurora-light': {
    floor: 0xe4ecf6, floorEmissive: 0xeef4fc, grid: 0x627aa0,
    rail: STAGE_PALETTE.auroraSilverLightTheme, glow: 0x7093c7,
    rippleInner: 0x6788bc, rippleOuter: STAGE_PALETTE.auroraSilverLightTheme,
    edge: STAGE_PALETTE.auroraSilverLightTheme, core: 0x6285ba, filament: 0xe8f2ff,
    filamentEmissive: STAGE_PALETTE.auroraEmissiveLight, sparkle: 0x5c80b8,
    marbleLight: 0x7a9fd4, rimLight: 0xb8cfee,
  },
};

const getScheme = (mood: MoodMode, theme: ThemeMode): SpecsColorScheme =>
  SPECS_SCHEMES[`${mood}-${theme}`];

function clampPillarIndex(index: number): PillarIndex {
  return THREE.MathUtils.clamp(Math.round(Number.isFinite(index) ? index : 0), 0, 5) as PillarIndex;
}

function computeArcZ(x: number): number {
  const t = THREE.MathUtils.clamp((x - ARC_MID_X) / ARC_HALF_SPAN, -1, 1);
  return 0.36 + 0.16 * t * t;
}

function computeProximityWeight(distXZ: number): number {
  const norm = THREE.MathUtils.clamp(
    (distXZ - PROXIMITY_NEAR_DIST) / (PROXIMITY_FAR_DIST - PROXIMITY_NEAR_DIST),
    0,
    1
  );
  return Math.pow(1 - norm, 1.85);
}

function extractPillarIndex(obj: THREE.Object3D | null): PillarIndex | null {
  let cursor: THREE.Object3D | null = obj;
  while (cursor) {
    const raw = cursor.userData.pillarIndex;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 5) {
      return raw as PillarIndex;
    }
    cursor = cursor.parent;
  }
  return null;
}

function setMaterialBlending(mat: THREE.Material, blending: THREE.Blending): void {
  if (mat.blending !== blending) {
    mat.blending = blending;
    mat.needsUpdate = true;
  }
}

/* ==========================================================================
 * 2. Procedural Textures (Zero Network Fetches, SSR-Safe Fallback)
 * ========================================================================== */

type ColorStop = readonly [number, string];

function createCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  fallbackRgba: readonly [number, number, number, number],
  srgb = true
): THREE.Texture {
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array(fallbackRgba), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createRadialTexture(
  size: number,
  stops: readonly ColorStop[],
  fallbackRgba: readonly [number, number, number, number],
  srgb = true
): THREE.Texture {
  return createCanvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const half = w * 0.5;
      const grad = ctx.createRadialGradient(half, h * 0.5, 0, half, h * 0.5, half);
      for (const [offset, color] of stops) grad.addColorStop(offset, color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    fallbackRgba,
    srgb
  );
}

function createVerticalCoreGradientTexture(): THREE.Texture {
  return createCanvasTexture(
    32,
    128,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0.0, 'rgba(255, 240, 204, 0.96)');
      grad.addColorStop(0.24, 'rgba(236, 202, 146, 0.78)');
      grad.addColorStop(0.58, 'rgba(218, 184, 132, 0.30)');
      grad.addColorStop(0.88, 'rgba(214, 184, 137, 0.08)');
      grad.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    [232, 204, 152, 200]
  );
}

/* ==========================================================================
 * 3. Architectural Reflective Floor, Grid & Concentric Ripple Rings
 * ========================================================================== */

interface FloorRig {
  readonly floorGlowMesh: THREE.Mesh;
  readonly applyTheme: (scheme: SpecsColorScheme, theme: ThemeMode, glassRatio: number) => void;
}

function buildRadialGridGeometry(
  halfLines: number,
  cellSize: number,
  fadeRadius: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const extent = halfLines * cellSize;
  const segmentsPerLine = 22;

  const pushSegment = (x1: number, z1: number, x2: number, z2: number): void => {
    const a1 = THREE.MathUtils.clamp(1 - Math.hypot(x1, z1) / fadeRadius, 0, 1);
    const a2 = THREE.MathUtils.clamp(1 - Math.hypot(x2, z2) / fadeRadius, 0, 1);
    if (a1 <= 0.001 && a2 <= 0.001) return;
    const f1 = a1 * a1;
    const f2 = a2 * a2;
    positions.push(x1, 0, z1, x2, 0, z2);
    colors.push(f1, f1, f1, f2, f2, f2);
  };

  for (let i = -halfLines; i <= halfLines; i++) {
    const coord = i * cellSize;
    for (let s = 0; s < segmentsPerLine; s++) {
      const t0 = -extent + (2 * extent * s) / segmentsPerLine;
      const t1 = -extent + (2 * extent * (s + 1)) / segmentsPerLine;
      pushSegment(coord, t0, coord, t1);
      pushSegment(t0, coord, t1, coord);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function buildArchitecturalFloor(parent: THREE.Group, glowTexture: THREE.Texture): FloorRig {
  const floorAlphaMap = createRadialTexture(
    256,
    [
      [0.0, 'rgba(255, 255, 255, 1.0)'],
      [0.42, 'rgba(255, 255, 255, 0.94)'],
      [0.72, 'rgba(255, 255, 255, 0.36)'],
      [1.0, 'rgba(255, 255, 255, 0.0)'],
    ],
    [255, 255, 255, 255],
    false
  );

  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b0b10,
    emissive: 0x16110a,
    emissiveIntensity: 0.16,
    roughness: 0.14,
    metalness: 0.32,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.84,
    alphaMap: floorAlphaMap,
    depthWrite: false,
    envMapIntensity: 1.35,
  });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 9.6), floorMat);
  floorMesh.name = 'specs-reflective-floor';
  floorMesh.rotation.x = -Math.PI * 0.5;
  floorMesh.position.set(0, FLOOR_Y, -0.2);
  parent.add(floorMesh);

  const gridMat = new THREE.LineBasicMaterial({
    color: 0xd8c19a,
    vertexColors: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const gridLines = new THREE.LineSegments(buildRadialGridGeometry(8, 0.72, 4.9), gridMat);
  gridLines.name = 'specs-architectural-grid';
  gridLines.position.set(CLUSTER_ORIGIN_X, FLOOR_Y + 0.003, CLUSTER_ORIGIN_Z + 0.45);
  gridLines.rotation.y = GRID_YAW;
  parent.add(gridLines);

  const railPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = THREE.MathUtils.lerp(ARC_MIN_X, ARC_MAX_X, i / 40);
    railPoints.push(new THREE.Vector3(x, FLOOR_Y + 0.005, computeArcZ(x)));
  }
  const railMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGold,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const railLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(railPoints), railMat);
  railLine.name = 'specs-marble-rail';
  parent.add(railLine);

  const floorGlowMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const floorGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.85), floorGlowMat);
  floorGlowMesh.name = 'specs-marble-floor-glow';
  floorGlowMesh.rotation.x = -Math.PI * 0.5;
  floorGlowMesh.position.set(ARC_MID_X, FLOOR_Y + 0.006, computeArcZ(ARC_MID_X));
  parent.add(floorGlowMesh);

  const applyTheme = (scheme: SpecsColorScheme, theme: ThemeMode, glassRatio: number): void => {
    const g = THREE.MathUtils.clamp(glassRatio, 0, 1);
    const isDark = theme === 'dark';
    floorMat.color.setHex(scheme.floor);
    floorMat.emissive.setHex(scheme.floorEmissive);
    floorMat.emissiveIntensity = isDark ? 0.16 : 0.12;
    floorMat.metalness = isDark ? 0.34 : 0.12;
    floorMat.opacity = THREE.MathUtils.lerp(isDark ? 0.88 : 0.72, isDark ? 0.72 : 0.52, g);
    floorMat.roughness = THREE.MathUtils.lerp(0.24, 0.09, g);
    floorMat.clearcoat = THREE.MathUtils.lerp(0.76, 1.0, g);
    floorMat.envMapIntensity = THREE.MathUtils.lerp(isDark ? 1.15 : 0.85, isDark ? 1.65 : 1.2, g);

    gridMat.color.setHex(scheme.grid);
    gridMat.opacity = isDark ? 0.28 : 0.24;
    railMat.color.setHex(scheme.rail);
    railMat.opacity = isDark ? 0.26 : 0.34;
    floorGlowMat.color.setHex(scheme.glow);
    floorGlowMat.opacity = isDark ? 0.62 : 0.32;
    setMaterialBlending(floorGlowMat, isDark ? THREE.AdditiveBlending : THREE.NormalBlending);
  };

  return { floorGlowMesh, applyTheme };
}

interface RippleRig {
  readonly group: THREE.Group;
  readonly update: (elapsed: number, glideVel: number, reduced: boolean, isDark: boolean) => void;
  readonly applyTheme: (scheme: SpecsColorScheme, theme: ThemeMode) => void;
}

function buildRippleRig(parent: THREE.Group): RippleRig {
  const group = new THREE.Group();
  group.name = 'specs-gold-ripples';
  group.position.set(ARC_MID_X, FLOOR_Y + 0.008, computeArcZ(ARC_MID_X));

  const seatRingMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const seatRing = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.235, 56), seatRingMat);
  seatRing.rotation.x = -Math.PI * 0.5;
  seatRing.position.y = 0.005;
  group.add(seatRing);

  const sharedRingGeo = new THREE.RingGeometry(0.945, 1.0, 72);
  const rings: Array<{
    readonly mesh: THREE.Mesh;
    readonly material: THREE.MeshBasicMaterial;
    readonly phaseOffset: number;
  }> = [];

  for (let i = 0; i < RIPPLE_RING_COUNT; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(sharedRingGeo, material);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = i * 0.0012;
    group.add(mesh);
    rings.push({ mesh, material, phaseOffset: i / RIPPLE_RING_COUNT });
  }
  parent.add(group);

  const staticRadii = [0.38, 0.66, 0.96] as const;
  const staticOpacities = [0.72, 0.44, 0.22] as const;

  const update = (elapsed: number, glideVel: number, reduced: boolean, isDark: boolean): void => {
    const themeScale = isDark ? 1.0 : 0.74;
    const motionBoost = THREE.MathUtils.clamp(glideVel * 0.14, 0, 0.26);

    if (reduced) {
      seatRingMat.opacity = 0.76 * themeScale;
      seatRing.scale.setScalar(1);
      for (let i = 0; i < rings.length; i++) {
        const radius = staticRadii[i] ?? 0.5;
        rings[i].mesh.scale.set(radius, radius, 1);
        rings[i].material.opacity = (staticOpacities[i] ?? 0.3) * themeScale;
      }
      return;
    }

    const breath = 0.5 + 0.5 * Math.sin(elapsed * 2.6);
    seatRingMat.opacity = (0.68 + breath * 0.22 + motionBoost * 0.4) * themeScale;
    const seatScale = 0.96 + breath * 0.07;
    seatRing.scale.set(seatScale, seatScale, 1);

    for (const entry of rings) {
      const phase = (elapsed * 0.38 + entry.phaseOffset) % 1;
      const radius = THREE.MathUtils.lerp(0.25, 1.08, 1 - (1 - phase) * (1 - phase));
      entry.mesh.scale.set(radius, radius, 1);
      const fadeIn = THREE.MathUtils.smoothstep(phase, 0.0, 0.14);
      const fadeOut = Math.pow(1 - phase, 1.55);
      entry.material.opacity = fadeIn * fadeOut * (0.82 + motionBoost) * themeScale;
    }
  };

  const applyTheme = (scheme: SpecsColorScheme, theme: ThemeMode): void => {
    const blending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    seatRingMat.color.setHex(scheme.rippleInner);
    setMaterialBlending(seatRingMat, blending);
    for (const entry of rings) {
      entry.material.color.setHex(scheme.rippleOuter);
      setMaterialBlending(entry.material, blending);
    }
  };

  return { group, update, applyTheme };
}

/* ==========================================================================
 * 4. Smoked-Glass Metric Pillars & Golden Sparkle Dust Builders
 * ========================================================================== */

interface PillarEntry {
  readonly spec: PillarLayoutSpec;
  readonly root: THREE.Group;
  readonly glassMesh: THREE.Mesh;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly label: FloatingLabelHandle;
  currentHeight: number;
  readonly resetToBase: () => void;
  readonly applyTheme: (
    scheme: SpecsColorScheme,
    mood: MoodMode,
    theme: ThemeMode,
    glassRatio: number,
    isClosest: boolean
  ) => void;
  readonly applyDynamic: (
    proximity: number,
    isClosest: boolean,
    dt: number,
    theme: ThemeMode,
    reducedMotion: boolean,
    introUnfoldT: number,
    stackOriginX: number,
    stackOriginZ: number
  ) => void;
}

interface SharedPillarGeometries {
  readonly boxGeo: THREE.BoxGeometry;
  readonly edgesGeo: THREE.EdgesGeometry;
  readonly innerGlowGeo: THREE.CylinderGeometry;
  readonly innerFilamentGeo: THREE.BoxGeometry;
  readonly basePlinthGeo: THREE.BoxGeometry;
  readonly basePoolGeo: THREE.PlaneGeometry;
}

function createSharedPillarGeometries(): SharedPillarGeometries {
  const boxGeo = new THREE.BoxGeometry(PILLAR_WIDTH, 1.0, PILLAR_WIDTH);
  boxGeo.translate(0, 0.5, 0);
  const edgesGeo = new THREE.EdgesGeometry(boxGeo);

  // Open-ended 4-sided square prism avoids top-cap UV seam on vertical glow core
  const innerRadius = PILLAR_WIDTH * 0.62 * Math.SQRT1_2;
  const innerGlowGeo = new THREE.CylinderGeometry(innerRadius, innerRadius, 0.94, 4, 1, true);
  innerGlowGeo.rotateY(Math.PI * 0.25);
  innerGlowGeo.translate(0, 0.47, 0);

  const innerFilamentGeo = new THREE.BoxGeometry(PILLAR_WIDTH * 0.18, 0.88, PILLAR_WIDTH * 0.18);
  innerFilamentGeo.translate(0, 0.44, 0);

  const basePlinthGeo = new THREE.BoxGeometry(PILLAR_WIDTH + 0.024, 0.016, PILLAR_WIDTH + 0.024);
  basePlinthGeo.translate(0, 0.008, 0);

  const basePoolGeo = new THREE.PlaneGeometry(PILLAR_WIDTH * 1.15, PILLAR_WIDTH * 1.15);
  return { boxGeo, edgesGeo, innerGlowGeo, innerFilamentGeo, basePlinthGeo, basePoolGeo };
}

function buildMetricPillar(
  spec: PillarLayoutSpec,
  sharedGeos: SharedPillarGeometries,
  coreGradientTex: THREE.Texture,
  softGlowTex: THREE.Texture,
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): PillarEntry {
  const root = new THREE.Group();
  root.name = `specs-pillar-${spec.index}`;
  root.position.set(spec.x, FLOOR_Y, spec.z);
  root.rotation.y = GRID_YAW;
  root.userData.pillarIndex = spec.index;

  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(sharedGeos.boxGeo, glassMat);
  glassMesh.name = `specs-pillar-glass-${spec.index}`;
  glassMesh.scale.y = spec.baseHeight;
  glassMesh.renderOrder = 3;
  glassMesh.userData.pillarIndex = spec.index;
  root.add(glassMesh);

  const edgesMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const edgesLine = new THREE.LineSegments(sharedGeos.edgesGeo, edgesMat);
  edgesLine.scale.y = spec.baseHeight;
  edgesLine.renderOrder = 4;
  edgesLine.userData.pillarIndex = spec.index;
  root.add(edgesLine);

  const innerGlowMat = new THREE.MeshBasicMaterial({
    map: coreGradientTex,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const innerGlowMesh = new THREE.Mesh(sharedGeos.innerGlowGeo, innerGlowMat);
  innerGlowMesh.scale.y = spec.baseHeight;
  innerGlowMesh.renderOrder = 1;
  root.add(innerGlowMesh);

  const innerFilamentMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d4,
    emissive: STAGE_PALETTE.champagneEmissiveDark,
    emissiveIntensity: 0.42,
    roughness: 0.3,
    metalness: 0.25,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const innerFilamentMesh = new THREE.Mesh(sharedGeos.innerFilamentGeo, innerFilamentMat);
  innerFilamentMesh.scale.y = spec.baseHeight;
  innerFilamentMesh.renderOrder = 2;
  root.add(innerFilamentMesh);

  const basePlinthMat = createChampagneGoldMaterial(mood, theme, 0.24);
  const basePlinth = new THREE.Mesh(sharedGeos.basePlinthGeo, basePlinthMat);
  basePlinth.userData.pillarIndex = spec.index;
  root.add(basePlinth);

  const basePoolMat = new THREE.MeshBasicMaterial({
    map: softGlowTex,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const basePool = new THREE.Mesh(sharedGeos.basePoolGeo, basePoolMat);
  basePool.rotation.x = -Math.PI * 0.5;
  basePool.position.y = 0.018;
  root.add(basePool);

  const label = createFloatingLabelSprite(spec.label, { worldHeight: 0.21 });
  const baseLabelScaleX = label.sprite.scale.x;
  const baseLabelScaleY = label.sprite.scale.y;
  label.sprite.position.set(0, spec.baseHeight + LABEL_TOP_CLEARANCE, 0);
  label.sprite.userData.pillarIndex = spec.index;
  label.sprite.renderOrder = 6;
  root.add(label.sprite);

  let currentProximity = 0;

  const applyTheme = (
    scheme: SpecsColorScheme,
    nextMood: MoodMode,
    nextTheme: ThemeMode,
    nextGlass: number,
    isClosest: boolean
  ): void => {
    const glowBlending = nextTheme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    applySmokedGlassState(glassMat, nextGlass, nextMood, nextTheme);
    applyGoldModeState(basePlinthMat, nextMood, nextTheme, 0.24);
    edgesMat.color.setHex(scheme.edge);
    innerGlowMat.color.setHex(scheme.core);
    setMaterialBlending(innerGlowMat, glowBlending);
    basePoolMat.color.setHex(scheme.core);
    setMaterialBlending(basePoolMat, glowBlending);
    innerFilamentMat.color.setHex(scheme.filament);
    innerFilamentMat.emissive.setHex(scheme.filamentEmissive);
    label.setHighlight(isClosest, nextTheme);
  };

  const entry: PillarEntry = {
    spec,
    root,
    glassMesh,
    glassMat,
    label,
    currentHeight: spec.baseHeight,
    resetToBase: () => {
      entry.currentHeight = spec.baseHeight;
      currentProximity = 0;
    },
    applyTheme,
    applyDynamic: (
      proximity: number,
      isClosest: boolean,
      dt: number,
      nextTheme: ThemeMode,
      reducedMotion: boolean,
      introUnfoldT: number,
      stackOriginX: number,
      stackOriginZ: number
    ): void => {
      const isDark = nextTheme === 'dark';
      const damp = reducedMotion ? 1 : 1 - Math.exp(-8.5 * dt);
      const t = THREE.MathUtils.clamp(introUnfoldT, 0, 1);

      // Selected pillar glides to center and rises cleanly below the top bar; unselected settle smaller
      const targetHeight = isClosest
        ? Math.max(2.05, spec.baseHeight + MAX_PROXIMITY_BOOST)
        : spec.baseHeight * 0.65 + proximity * 0.14;
      const targetWidthScale = isClosest ? 1.24 : 0.86;
      const targetPosZ = spec.z + (isClosest ? 0.28 : 0);

      entry.currentHeight = THREE.MathUtils.lerp(entry.currentHeight, targetHeight, damp);
      currentProximity = THREE.MathUtils.lerp(currentProximity, isClosest ? 1 : proximity * 0.35, damp);

      // Morph smoothly from 6-tier vertical Architecture glass slab (t=0) -> upright benchmark pillar (t=1)
      const stackY = ARCH_STACK_BASE_Y + (5 - spec.index) * ARCH_STACK_STEP_Y;
      const arcLift = Math.sin(t * Math.PI) * 0.24;
      const settledX = spec.x;
      const settledZ = THREE.MathUtils.lerp(root.position.z, targetPosZ, damp);
      const liveX = THREE.MathUtils.lerp(stackOriginX, settledX, t);
      const liveY = THREE.MathUtils.lerp(stackY, FLOOR_Y, t) + arcLift;
      const liveZ = THREE.MathUtils.lerp(stackOriginZ, settledZ, t);
      root.position.set(liveX, liveY, liveZ);
      root.rotation.y = THREE.MathUtils.lerp(ARCH_STACK_YAW, GRID_YAW, t);

      const settledWidth = THREE.MathUtils.lerp(
        glassMesh.scale.x > 1.8 ? targetWidthScale : glassMesh.scale.x,
        targetWidthScale,
        damp
      );
      const liveWidth = THREE.MathUtils.lerp(ARCH_STACK_SLAB_SCALE_XZ, settledWidth, t);
      const liveHeight = THREE.MathUtils.lerp(ARCH_STACK_SLAB_HEIGHT, entry.currentHeight, t);

      const emphasis = isClosest ? Math.max(currentProximity, 0.96) : currentProximity * 0.32;
      const stackGlowBoost = (1 - t) * 0.42;
      glassMesh.scale.set(liveWidth, liveHeight, liveWidth);
      edgesLine.scale.set(liveWidth, liveHeight, liveWidth);
      innerGlowMesh.scale.set(liveWidth, liveHeight, liveWidth);
      innerFilamentMesh.scale.set(liveWidth, liveHeight, liveWidth);
      basePlinth.scale.set(liveWidth, 1, liveWidth);
      basePool.scale.set(liveWidth * t, liveWidth * t, 1);

      edgesMat.opacity = Math.min(1, THREE.MathUtils.lerp(isDark ? 0.26 : 0.34, 1.0, emphasis) + stackGlowBoost);
      innerGlowMat.opacity = THREE.MathUtils.lerp(isDark ? 0.08 : 0.06, isDark ? 0.84 : 0.52, emphasis) * (0.35 + 0.65 * t);
      innerFilamentMat.opacity =
        THREE.MathUtils.lerp(isDark ? 0.14 : 0.1, isDark ? 0.9 : 0.62, emphasis) * t;
      innerFilamentMat.emissiveIntensity = THREE.MathUtils.lerp(
        isDark ? 0.22 : 0.16,
        isDark ? 2.1 : 1.15,
        emphasis
      );
      basePoolMat.opacity = THREE.MathUtils.lerp(isDark ? 0.1 : 0.08, isDark ? 0.82 : 0.46, emphasis) * t;
      basePlinthMat.emissiveIntensity = THREE.MathUtils.lerp(
        isDark ? 0.14 : 0.1,
        isDark ? 0.88 : 0.56,
        emphasis
      );

      const labelReveal = THREE.MathUtils.smoothstep(t, 0.58, 0.98);
      label.sprite.position.y = liveHeight + LABEL_TOP_CLEARANCE + (isClosest ? 0.06 : 0);
      const labelScale = isClosest ? 1.12 : 0.72;
      label.sprite.scale.set(baseLabelScaleX * labelScale, baseLabelScaleY * labelScale, 1);
      label.sprite.material.opacity =
        THREE.MathUtils.lerp(label.sprite.material.opacity, isClosest ? 1.0 : 0.3, damp) * labelReveal;
      label.sprite.visible = label.sprite.material.opacity > 0.015;
      label.sprite.material.depthTest = !isClosest;
      label.sprite.renderOrder = isClosest ? 26 : 6;
      label.setHighlight(isClosest, nextTheme);
    },
  };

  return entry;
}

interface SparkleField {
  readonly update: (dt: number, elapsed: number, reducedMotion: boolean) => void;
  readonly applyTheme: (scheme: SpecsColorScheme, theme: ThemeMode) => void;
}

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildSparkleField(parent: THREE.Group): SparkleField {
  const positions = new Float32Array(SPARKLE_COUNT * 3);
  const liveHeights = new Float32Array(SPARKLE_COUNT);
  const seeds: Array<{
    readonly pillarIndex: PillarIndex;
    readonly offsetX: number;
    readonly offsetZ: number;
    readonly maxY: number;
    readonly riseSpeed: number;
    readonly swirlRadius: number;
    readonly swirlFreq: number;
    readonly phase: number;
  }> = [];

  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const pillarIndex = (i % 6) as PillarIndex;
    const layout = PILLAR_LAYOUTS[pillarIndex];
    const r1 = deterministicRand(i * 7 + 1);
    const r2 = deterministicRand(i * 7 + 2);
    const r3 = deterministicRand(i * 7 + 3);
    const r4 = deterministicRand(i * 7 + 4);
    const r5 = deterministicRand(i * 7 + 5);

    const offsetX = (r1 - 0.5) * 0.72;
    const offsetZ = (r2 - 0.5) * 0.72;
    const maxY = layout.baseHeight + 0.92;
    const initialY = 0.08 + r3 * maxY;

    liveHeights[i] = initialY;
    seeds.push({
      pillarIndex,
      offsetX,
      offsetZ,
      maxY,
      riseSpeed: 0.14 + r4 * 0.24,
      swirlRadius: 0.035 + r5 * 0.065,
      swirlFreq: 0.8 + r1 * 1.1,
      phase: r2 * Math.PI * 2,
    });
    positions[i * 3] = layout.x + offsetX;
    positions[i * 3 + 1] = FLOOR_Y + initialY;
    positions[i * 3 + 2] = layout.z + offsetZ;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);

  const sparkleTex = createRadialTexture(
    64,
    [
      [0.0, 'rgba(255, 253, 244, 1.0)'],
      [0.22, 'rgba(246, 224, 178, 0.85)'],
      [0.55, 'rgba(218, 186, 134, 0.22)'],
      [1.0, 'rgba(218, 186, 134, 0.0)'],
    ],
    [245, 226, 186, 220]
  );

  const material = new THREE.PointsMaterial({
    map: sparkleTex,
    color: 0xf4ddb0,
    size: 0.095,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, material);
  points.name = 'specs-golden-sparkles';
  points.renderOrder = 5;
  parent.add(points);

  const update = (dt: number, elapsed: number, reducedMotion: boolean): void => {
    if (reducedMotion) return;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const seed = seeds[i];
      const layout = PILLAR_LAYOUTS[seed.pillarIndex];
      let h = liveHeights[i] + seed.riseSpeed * dt;
      if (h > seed.maxY) h -= seed.maxY - 0.05;
      liveHeights[i] = h;

      const angle = elapsed * seed.swirlFreq + seed.phase;
      positions[i * 3] = layout.x + seed.offsetX + Math.cos(angle) * seed.swirlRadius;
      positions[i * 3 + 1] = FLOOR_Y + h;
      positions[i * 3 + 2] = layout.z + seed.offsetZ + Math.sin(angle) * seed.swirlRadius;
    }
    posAttr.needsUpdate = true;
  };

  const applyTheme = (scheme: SpecsColorScheme, theme: ThemeMode): void => {
    const isDark = theme === 'dark';
    setMaterialBlending(material, isDark ? THREE.AdditiveBlending : THREE.NormalBlending);
    material.color.setHex(scheme.sparkle);
    material.opacity = isDark ? 0.82 : 0.63;
  };

  return { update, applyTheme };
}

/* ==========================================================================
 * 5. Exported Stage Factory — createSpecsStage()
 * ========================================================================== */

export function createSpecsStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'ainvtry-stage-specs';

  let currentGlassRatio = 0.5;
  let currentMood: MoodMode = 'luxury';
  let currentTheme: ThemeMode = 'dark';
  let reducedMotionEnabled = false;
  let focusedIndex: PillarIndex = 0;
  let closestIndex: PillarIndex = 0;
  let carouselOffsetX = -PILLAR_LAYOUTS[0].x;
  let carouselOffsetZ = -PILLAR_LAYOUTS[0].z * 0.4;
  let dragAccumX = 0;
  let prevMarbleX = 0;
  let prevMarbleZ = 0.48;
  let introClock = INTRO_UNFOLD_END;
  let stageActive = false;
  let disposed = false;

  // Pre-allocated scratch buffers (zero heap allocations per animation frame)
  const marbleAnchor = new THREE.Vector3(0, MARBLE_Y, 0.48);
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pillarDistances = new Float32Array(6);

  const softGlowTex = createRadialTexture(
    128,
    [
      [0.0, 'rgba(255, 250, 238, 1.0)'],
      [0.28, 'rgba(244, 222, 180, 0.72)'],
      [0.6, 'rgba(218, 186, 134, 0.22)'],
      [1.0, 'rgba(218, 186, 134, 0.0)'],
    ],
    [238, 214, 174, 200]
  );
  const coreGradientTex = createVerticalCoreGradientTexture();
  const sharedGeos = createSharedPillarGeometries();

  const floorRig = buildArchitecturalFloor(group, softGlowTex);
  const rippleRig = buildRippleRig(group);
  let hoveredIndex: PillarIndex | null = null;

  const carouselGroup = new THREE.Group();
  carouselGroup.name = 'specs-pillar-carousel';
  carouselGroup.position.set(carouselOffsetX, 0, carouselOffsetZ);
  group.add(carouselGroup);

  const pillars: PillarEntry[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  for (const spec of PILLAR_LAYOUTS) {
    const entry = buildMetricPillar(
      spec,
      sharedGeos,
      coreGradientTex,
      softGlowTex,
      currentGlassRatio,
      currentMood,
      currentTheme
    );
    carouselGroup.add(entry.root);
    pillars.push(entry);
    raycastTargets.push(entry.glassMesh, entry.label.sprite);
  }

  // Opening choreography bridge banner showing 6-Tier Architecture unfolding into 6 Specs pillars
  const introBanner = createFloatingLabelSprite('6-TIER ARCHITECTURE → SPECS', {
    accent: true,
    width: 344,
    height: 54,
    worldHeight: 0.22,
  });
  introBanner.sprite.name = 'specs-intro-arch-bridge-banner';
  introBanner.sprite.position.set(0, ARCH_STACK_BASE_Y + 6 * ARCH_STACK_STEP_Y + 0.22, 0.55);
  introBanner.sprite.material.depthTest = false;
  introBanner.sprite.renderOrder = 30;
  introBanner.sprite.material.opacity = 0;
  introBanner.sprite.visible = false;
  group.add(introBanner.sprite);

  const sparkleField = buildSparkleField(carouselGroup);

  const marbleGlowLight = new THREE.PointLight(STAGE_PALETTE.champagneGoldBright, 0, 5.4, 1.8);
  marbleGlowLight.position.set(0, MARBLE_Y + 0.14, 0.48);
  group.add(marbleGlowLight);

  const galleryRimLight = new THREE.PointLight(0xeed7ae, 0, 9.2, 1.5);
  galleryRimLight.position.set(-0.28, 1.75, -2.25);
  group.add(galleryRimLight);

  const syncLightVisuals = (scheme: SpecsColorScheme): void => {
    const isDark = currentTheme === 'dark';
    const activeFactor = stageActive ? 1 : 0;
    marbleGlowLight.color.setHex(scheme.marbleLight);
    galleryRimLight.color.setHex(scheme.rimLight);
    marbleGlowLight.intensity = activeFactor * (isDark ? 2.15 : 1.15);
    galleryRimLight.intensity = activeFactor * (isDark ? 1.45 : 0.72);
  };

  const syncAllVisuals = (): void => {
    const scheme = getScheme(currentMood, currentTheme);
    floorRig.applyTheme(scheme, currentTheme, currentGlassRatio);
    rippleRig.applyTheme(scheme, currentTheme);
    sparkleField.applyTheme(scheme, currentTheme);
    introBanner.setHighlight(true, currentTheme);
    syncLightVisuals(scheme);
    for (const pillar of pillars) {
      pillar.applyTheme(
        scheme,
        currentMood,
        currentTheme,
        currentGlassRatio,
        pillar.spec.index === closestIndex
      );
    }
  };

  syncAllVisuals();

  return {
    id: 'specs',
    group,
    cameraPreset: STAGE_CAMERA_PRESETS.specs,

    getMarbleAnchor(elapsed: number, state: StageInteractionState): THREE.Vector3 {
      focusedIndex = clampPillarIndex(state.specsFocusedIndex);
      const bobY = reducedMotionEnabled ? 0 : Math.sin(elapsed * 2.2) * 0.022;
      const activeSpec = PILLAR_LAYOUTS[focusedIndex];
      const centeredX = activeSpec.x + carouselOffsetX;
      marbleAnchor.set(centeredX, MARBLE_Y + bobY, 0.48);
      return marbleAnchor;
    },

    onEnter(ctx: StageContext): void {
      stageActive = true;
      currentGlassRatio = ctx.glassRatio;
      currentMood = ctx.mood;
      currentTheme = ctx.theme;
      reducedMotionEnabled = ctx.reducedMotion;
      focusedIndex = clampPillarIndex(ctx.interaction.specsFocusedIndex);
      closestIndex = focusedIndex;
      dragAccumX = 0;
      introClock = ctx.reducedMotion ? INTRO_UNFOLD_END : 0;

      const activeSpec = PILLAR_LAYOUTS[focusedIndex];
      carouselOffsetX = -activeSpec.x;
      carouselOffsetZ = -activeSpec.z * 0.4;
      carouselGroup.position.set(carouselOffsetX, 0, carouselOffsetZ);

      const anchorZ = 0.48;
      rippleRig.group.position.set(0, FLOOR_Y + 0.008, anchorZ);
      floorRig.floorGlowMesh.position.set(0, FLOOR_Y + 0.006, anchorZ);
      marbleGlowLight.position.set(0, MARBLE_Y + 0.14, anchorZ);
      prevMarbleX = 0;
      prevMarbleZ = anchorZ;

      syncAllVisuals();
      const initUnfold = ctx.reducedMotion ? 1 : 0;
      introBanner.sprite.material.opacity = ctx.reducedMotion ? 0 : 0.96;
      introBanner.sprite.visible = !ctx.reducedMotion;

      for (let i = 0; i < pillars.length; i++) {
        const pillar = pillars[i];
        pillar.resetToBase();
        const wx = pillar.spec.x + carouselOffsetX;
        const wz = pillar.spec.z + carouselOffsetZ;
        const dist = Math.hypot(wx, anchorZ - wz);
        pillar.applyDynamic(
          ctx.reducedMotion ? computeProximityWeight(dist) : 0,
          i === closestIndex,
          0,
          currentTheme,
          ctx.reducedMotion,
          initUnfold,
          -carouselOffsetX,
          -carouselOffsetZ
        );
      }
      rippleRig.update(0, 0, ctx.reducedMotion, currentTheme === 'dark');
    },

    onExit(_ctx: StageContext): void {
      stageActive = false;
      dragAccumX = 0;
      hoveredIndex = null;
      introBanner.sprite.material.opacity = 0;
      introBanner.sprite.visible = false;
      syncLightVisuals(getScheme(currentMood, currentTheme));
    },

    onGlassChange(glassRatio: number): void {
      currentGlassRatio = THREE.MathUtils.clamp(glassRatio, 0, 1);
      floorRig.applyTheme(getScheme(currentMood, currentTheme), currentTheme, currentGlassRatio);
      for (const pillar of pillars) {
        applySmokedGlassState(pillar.glassMat, currentGlassRatio, currentMood, currentTheme);
      }
    },

    onVisualModeChange(mood: MoodMode, theme: ThemeMode): void {
      currentMood = mood;
      currentTheme = theme;
      syncAllVisuals();
    },

    onInteractionChange(patch: Partial<StageInteractionState>, _ctx: StageContext): void {
      if (typeof patch.specsFocusedIndex === 'number') {
        focusedIndex = clampPillarIndex(patch.specsFocusedIndex);
        introClock = INTRO_UNFOLD_END;
      } else if (patch.specsSubtab !== undefined) {
        introClock = INTRO_UNFOLD_END;
      }
    },

    onPointerMove(ndcX: number, ndcY: number, ctx: StageContext): void {
      if (disposed || !stageActive) return;
      carouselGroup.updateMatrixWorld(true);
      pointerNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(pointerNdc, ctx.camera);

      const hits = raycaster.intersectObjects(raycastTargets, false);
      let nextHovered: PillarIndex | null = null;
      for (const hit of hits) {
        const idx = extractPillarIndex(hit.object);
        if (idx !== null) {
          nextHovered = idx;
          break;
        }
      }
      hoveredIndex = nextHovered;
    },

    onPointerDrag(dx: number, _dy: number, ctx: StageContext): void {
      if (!Number.isFinite(dx) || dx === 0) return;
      dragAccumX += dx * POINTER_DRAG_SENSITIVITY;
      const stepThreshold = 0.42;
      if (Math.abs(dragAccumX) >= stepThreshold) {
        const dir = dragAccumX < 0 ? 1 : -1;
        dragAccumX = 0;
        const nextIdx = ((focusedIndex + dir + 6) % 6) as PillarIndex;
        focusedIndex = nextIdx;
        ctx.emitUiSync({ specsFocusedIndex: nextIdx });
      }
    },

    onPointerTap(ndcX: number, ndcY: number, ctx: StageContext): void {
      carouselGroup.updateMatrixWorld(true);
      pointerNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(pointerNdc, ctx.camera);

      const hits = raycaster.intersectObjects(raycastTargets, false);
      let tappedIndex: PillarIndex | null = null;
      for (const hit of hits) {
        const idx = extractPillarIndex(hit.object);
        if (idx !== null) {
          tappedIndex = idx;
          break;
        }
      }
      if (tappedIndex === null) return;

      focusedIndex = tappedIndex;
      ctx.emitUiSync({ specsFocusedIndex: tappedIndex });
    },

    update(dt: number, elapsed: number, ctx: StageContext): void {
      if (disposed) return;
      reducedMotionEnabled = ctx.reducedMotion;

      if (ctx.reducedMotion) {
        introClock = INTRO_UNFOLD_END;
      } else if (introClock < INTRO_UNFOLD_END) {
        introClock = Math.min(INTRO_UNFOLD_END, introClock + dt);
      }

      const rawUnfold = THREE.MathUtils.clamp(
        (introClock - INTRO_HOLD_STACK) / (INTRO_UNFOLD_END - INTRO_HOLD_STACK),
        0,
        1
      );
      const bannerAlpha = ctx.reducedMotion
        ? 0
        : (0.55 + 0.45 * THREE.MathUtils.smoothstep(introClock, 0, 0.16)) *
          (1 - THREE.MathUtils.smoothstep(rawUnfold, 0.12, 0.55));
      introBanner.sprite.material.opacity = bannerAlpha * 0.96;
      introBanner.sprite.visible = bannerAlpha > 0.015;
      if (introBanner.sprite.visible) {
        introBanner.sprite.position.y =
          ARCH_STACK_BASE_Y + 6 * ARCH_STACK_STEP_Y + 0.22 + Math.sin(elapsed * 2.0) * 0.025;
      }

      const nextFocused = clampPillarIndex(ctx.interaction.specsFocusedIndex);
      if (nextFocused !== focusedIndex) {
        focusedIndex = nextFocused;
      }
      closestIndex = focusedIndex;

      // Smoothly glide the carousel so the selected pillar sits dead-center in the left 3D column
      const activeSpec = PILLAR_LAYOUTS[focusedIndex];
      const targetOffsetX = -activeSpec.x;
      const targetOffsetZ = -activeSpec.z * 0.4;
      const carouselDamp = ctx.reducedMotion ? 1 : 1 - Math.exp(-7.5 * dt);
      carouselOffsetX = THREE.MathUtils.lerp(carouselOffsetX, targetOffsetX, carouselDamp);
      carouselOffsetZ = THREE.MathUtils.lerp(carouselOffsetZ, targetOffsetZ, carouselDamp);
      carouselGroup.position.set(carouselOffsetX, 0, carouselOffsetZ);

      const liveX = ctx.marbleMesh.position.x;
      const liveZ = ctx.marbleMesh.position.z;
      const glideSpeed = dt > 1e-4 ? Math.hypot(liveX - prevMarbleX, liveZ - prevMarbleZ) / dt : 0;
      prevMarbleX = liveX;
      prevMarbleZ = liveZ;

      rippleRig.group.position.set(liveX, FLOOR_Y + 0.008, liveZ);
      floorRig.floorGlowMesh.position.set(liveX, FLOOR_Y + 0.006, liveZ);
      marbleGlowLight.position.set(
        liveX,
        Math.max(MARBLE_Y + 0.14, ctx.marbleMesh.position.y + 0.12),
        liveZ
      );
      rippleRig.update(elapsed, glideSpeed, ctx.reducedMotion, currentTheme === 'dark');

      for (let i = 0; i < pillars.length; i++) {
        const spec = pillars[i].spec;
        const wx = spec.x + carouselOffsetX;
        const wz = spec.z + carouselOffsetZ;
        pillarDistances[i] = Math.hypot(liveX - wx, liveZ - wz);
      }

      const hoverLiftLerp = ctx.reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      const stackOriginX = -carouselOffsetX;
      const stackOriginZ = -carouselOffsetZ;
      for (let i = 0; i < pillars.length; i++) {
        const isHovered = hoveredIndex === i;
        const baseWeight = computeProximityWeight(pillarDistances[i]);
        const effectiveWeight = isHovered ? Math.min(1, Math.max(baseWeight, 0.72)) : baseWeight;

        // Per-tier cascade unfold from Tier 01 down to Tier 06
        const tierStart = INTRO_HOLD_STACK + i * 0.045;
        const tierSpan = Math.max(0.35, INTRO_UNFOLD_END - INTRO_HOLD_STACK - 5 * 0.045);
        const tierRaw = ctx.reducedMotion
          ? 1
          : THREE.MathUtils.clamp((introClock - tierStart) / tierSpan, 0, 1);
        const tierEase =
          tierRaw < 0.5 ? 4 * tierRaw * tierRaw * tierRaw : 1 - Math.pow(-2 * tierRaw + 2, 3) / 2;

        pillars[i].applyDynamic(
          effectiveWeight,
          i === closestIndex || isHovered,
          dt,
          currentTheme,
          ctx.reducedMotion,
          tierEase,
          stackOriginX,
          stackOriginZ
        );
        if (tierEase >= 0.99) {
          const targetLiftY = isHovered && !ctx.reducedMotion ? 0.045 : 0;
          pillars[i].root.position.y = THREE.MathUtils.lerp(
            pillars[i].root.position.y,
            FLOOR_Y + targetLiftY,
            hoverLiftLerp
          );
        }
      }
      sparkleField.update(dt, elapsed, ctx.reducedMotion);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      stageActive = false;
      introBanner.dispose();
      for (const pillar of pillars) {
        pillar.root.remove(pillar.label.sprite);
        pillar.label.dispose();
      }
      disposeObject3D(group);
    },
  };
}
