/**
 * aboutStage.ts
 * ---------------------------------------------------------------------------
 * Subagent C4 — About 3D Stage (`iNVTRY LOOP`)
 *
 * Sculptural tilted interlocking smoked-glass & champagne-gold circular loop
 * stage synchronized with the About multi-tab HUD (`01 User Journey` 6-cut
 * cycle, `02 Mission & Roadmap` 5-node circular loop + pause, `03 BM & Founder`).
 *
 * Visual & Interaction Highlights:
 * 1. Primary tilted smoked-glass torus track (`R = 2.05`, `tube = 0.085`)
 *    flanked by crisp champagne-gold outer/inner trim rings and a tapered
 *    two-layer golden comet wake trailing smoothly behind the gold marble.
 * 2. Secondary oblique interlocking sculptural metallic-glass ring
 *    (`R = 1.22`, `tube = 0.11`) precessing smoothly through the center
 *    with >0.5u surface clearance across the full precession cycle.
 * 3. Five interactive circular loop nodes (`Closet`, `Weather`, `360° Fit`,
 *    `Calendar`, `CPW`) plus a foreground-bottom `iNVTRY LOOP` emblem sprite,
 *    supporting direct raycast hover/tap and horizontal drag scrubbing.
 * 4. Allocation-free 60/120fps update loop, live `Glass %`, `Luxury / Aurora`,
 *    and `Dark / Light` sync, and complete GPU resource disposal.
 */

import * as THREE from 'three';
import {
  DEFAULT_STAGE_INTERACTION_STATE,
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
  isSoftwareGlGlassFallback,
  type FloatingLabelHandle,
} from './stageMaterials.ts';

/* ==========================================================================
 * 1. Geometry, Layout, Palette & Motion Constants
 * ========================================================================== */

const TWO_PI = Math.PI * 2;
const OUTER_RING_RADIUS = 2.05;
const OUTER_RING_TUBE = 0.085;
const OUTER_TRIM_OUTER_RADIUS = 2.13;
const OUTER_TRIM_INNER_RADIUS = 1.97;
const INNER_GYRO_RADIUS = 1.22;
const INNER_GYRO_TUBE = 0.11;
const COMET_ARC_RAD = 0.95;

// Negative X tilt angles the XY torus into an elevated tabletop plane facing
// upward & toward the camera so the bottom rim (`iNVTRY LOOP` + gold marble)
// sits prominently in the foreground; `ZXY` order tilts the ellipse by -0.14 rad.
const BASE_OUTER_TILT_X = -1.06;
const BASE_OUTER_TILT_Z = -0.14;
const BASE_GYRO_TILT_X = -0.22;
const BASE_GYRO_TILT_Y = 0.78;
const BASE_GYRO_TILT_Z = 0.56;

const EMBLEM_ANGLE_RAD = -Math.PI * 0.56;
const MISSION_ORBIT_SPEED = 0.42;
const FOUNDER_ORBIT_SPEED = 0.22;
const DRAG_SCRUB_RAD_PER_UNIT = 3.8;

interface LoopNodeSpec {
  readonly index: number;
  readonly label: string;
  readonly width: number;
  readonly labelOffset: readonly [number, number, number];
}

// Calibrated to avoid right-HUD overlap on 16:9 desktop & edge clipping on 390px portrait
const LOOP_NODE_SPECS: readonly LoopNodeSpec[] = [
  { index: 0, label: 'Closet', width: 150, labelOffset: [-0.06, 0.28, 0.28] },
  { index: 1, label: 'Weather', width: 168, labelOffset: [0.12, 0.36, 0.26] },
  { index: 2, label: '360° Fit', width: 166, labelOffset: [-0.26, 0.32, 0.26] },
  { index: 3, label: 'Calendar', width: 178, labelOffset: [0.06, 0.26, 0.26] },
  { index: 4, label: 'CPW', width: 132, labelOffset: [0.22, -0.22, 0.22] },
];

interface ModeAccentPalette {
  readonly railColor: number;
  readonly railEmissive: number;
  readonly cometGlow: number;
  readonly cometCore: number;
  readonly emblemGem: number;
  readonly emblemEmissive: number;
  readonly emblemGlow: number;
  readonly beadColor: number;
  readonly beadEmissive: number;
  readonly beadIridescence: number;
  readonly coreColor: number;
  readonly coreEmissive: number;
  readonly nodeGlow: number;
}

const MODE_ACCENT_PALETTES: Record<`${MoodMode}:${ThemeMode}`, ModeAccentPalette> = {
  'luxury:dark': {
    railColor: STAGE_PALETTE.champagneGoldBright,
    railEmissive: STAGE_PALETTE.champagneEmissiveDark,
    cometGlow: STAGE_PALETTE.champagneGoldBright,
    cometCore: 0xfff4de,
    emblemGem: 0xfff2d8,
    emblemEmissive: STAGE_PALETTE.champagneGoldBright,
    emblemGlow: STAGE_PALETTE.champagneGoldBright,
    beadColor: STAGE_PALETTE.champagneGoldBright,
    beadEmissive: STAGE_PALETTE.champagneEmissiveDark,
    beadIridescence: 0.1,
    coreColor: 0xfff5e2,
    coreEmissive: STAGE_PALETTE.champagneGoldBright,
    nodeGlow: STAGE_PALETTE.champagneGoldBright,
  },
  'luxury:light': {
    railColor: STAGE_PALETTE.champagneGoldLightTheme,
    railEmissive: STAGE_PALETTE.champagneEmissiveLight,
    cometGlow: 0xc89a52,
    cometCore: 0xdcb36c,
    emblemGem: 0xdfc18d,
    emblemEmissive: STAGE_PALETTE.champagneEmissiveLight,
    emblemGlow: 0xc79c5a,
    beadColor: 0xcfaa70,
    beadEmissive: STAGE_PALETTE.champagneEmissiveLight,
    beadIridescence: 0.1,
    coreColor: 0xfff5e2,
    coreEmissive: STAGE_PALETTE.champagneEmissiveLight,
    nodeGlow: 0xc89f5e,
  },
  'aurora:dark': {
    railColor: STAGE_PALETTE.auroraSilverGold,
    railEmissive: STAGE_PALETTE.auroraEmissiveDark,
    cometGlow: 0x9bc4f8,
    cometCore: 0xf2f7ff,
    emblemGem: 0xf2f7ff,
    emblemEmissive: 0x99c4f8,
    emblemGlow: 0xa3c9f8,
    beadColor: 0xdce6fa,
    beadEmissive: STAGE_PALETTE.auroraEmissiveDark,
    beadIridescence: 0.72,
    coreColor: 0xf3f7ff,
    coreEmissive: 0xa2c8f8,
    nodeGlow: 0xa5cbf8,
  },
  'aurora:light': {
    railColor: STAGE_PALETTE.auroraSilverLightTheme,
    railEmissive: STAGE_PALETTE.auroraEmissiveLight,
    cometGlow: 0x628bc4,
    cometCore: 0x89afe0,
    emblemGem: 0xc0d4f0,
    emblemEmissive: 0x5c84bc,
    emblemGlow: 0x7399ce,
    beadColor: 0xb5c8e6,
    beadEmissive: STAGE_PALETTE.auroraEmissiveLight,
    beadIridescence: 0.72,
    coreColor: 0xf3f7ff,
    coreEmissive: 0x678dc4,
    nodeGlow: 0x759bd0,
  },
};

interface LoopNodeEntry {
  readonly index: number;
  readonly beadMesh: THREE.Mesh;
  readonly beadMat: THREE.MeshPhysicalMaterial;
  readonly coreMesh: THREE.Mesh;
  readonly coreMat: THREE.MeshStandardMaterial;
  readonly haloMesh: THREE.Mesh;
  readonly haloMat: THREE.MeshStandardMaterial;
  readonly glowSprite: THREE.Sprite;
  readonly glowMat: THREE.SpriteMaterial;
  readonly labelHandle: FloatingLabelHandle;
  activeWeight: number;
  tapPulse: number;
}

interface OuterRingRig {
  readonly group: THREE.Group;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly innerRailMat: THREE.MeshStandardMaterial;
  readonly trimMat: THREE.MeshStandardMaterial;
  readonly cometGroup: THREE.Group;
  readonly cometGlowMat: THREE.MeshBasicMaterial;
  readonly cometCoreMat: THREE.MeshBasicMaterial;
}

interface InnerGyroRig {
  readonly pivot: THREE.Group;
  readonly ring: THREE.Group;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly coreMat: THREE.MeshStandardMaterial;
  readonly rimMat: THREE.MeshStandardMaterial;
}

interface EmblemRig {
  readonly gemMat: THREE.MeshStandardMaterial;
  readonly haloMesh: THREE.Mesh;
  readonly haloMat: THREE.MeshStandardMaterial;
  readonly glowMat: THREE.SpriteMaterial;
  readonly labelHandle: FloatingLabelHandle;
}

/* ==========================================================================
 * 2. Pure Math & Procedural Geometry / Texture Helpers
 * ========================================================================== */

function getLoopNodeAngle(index: number): number {
  const count = LOOP_NODE_SPECS.length;
  const safeIndex = ((Math.round(index) % count) + count) % count;
  return (safeIndex / count) * TWO_PI;
}

function getJourneyCutAngle(index: number): number {
  return (THREE.MathUtils.clamp(Math.round(index), 0, 5) / 6) * TWO_PI - Math.PI * 0.45;
}

function shortestAngleDelta(current: number, target: number): number {
  let delta = (target - current) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

function findNearestLoopNodeIndex(angle: number): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < LOOP_NODE_SPECS.length; i += 1) {
    const dist = Math.abs(shortestAngleDelta(angle, getLoopNodeAngle(i)));
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function createTaperedCometGeometry(
  majorRadius: number,
  maxTubeRadius: number,
  radialSegments: number,
  tubularSegments: number,
  arc: number
): THREE.TorusGeometry {
  const geo = new THREE.TorusGeometry(majorRadius, maxTubeRadius, radialSegments, tubularSegments, arc);
  const posAttr = geo.getAttribute('position');
  const uvAttr = geo.getAttribute('uv');
  if (posAttr && uvAttr) {
    for (let i = 0; i < posAttr.count; i += 1) {
      const t = THREE.MathUtils.clamp(uvAttr.getX(i), 0, 1);
      const theta = t * arc;
      const cx = majorRadius * Math.cos(theta);
      const cy = majorRadius * Math.sin(theta);
      const taper = 0.14 + 0.86 * Math.pow(t, 0.72);
      posAttr.setXYZ(
        i,
        cx + (posAttr.getX(i) - cx) * taper,
        cy + (posAttr.getY(i) - cy) * taper,
        posAttr.getZ(i) * taper
      );
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

function createCometAlphaTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const width = 16;
    const data = new Uint8Array(width * 4);
    for (let i = 0; i < width; i += 1) {
      const v = Math.round(Math.pow(i / (width - 1), 1.8) * 255);
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const fallback = new THREE.DataTexture(data, width, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0.0, 'rgb(0, 0, 0)');
    grad.addColorStop(0.28, 'rgb(26, 26, 26)');
    grad.addColorStop(0.62, 'rgb(120, 120, 120)');
    grad.addColorStop(0.92, 'rgb(255, 255, 255)');
    grad.addColorStop(1.0, 'rgb(232, 232, 232)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createNodeGlowTexture(size = 96): THREE.Texture {
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([235, 212, 174, 180]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 248, 232, 1.0)');
    grad.addColorStop(0.28, 'rgba(232, 210, 170, 0.65)');
    grad.addColorStop(0.6, 'rgba(214, 184, 137, 0.20)');
    grad.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function setMaterialBlending(mat: THREE.Material, next: THREE.Blending): void {
  if (mat.blending !== next) {
    mat.blending = next;
    mat.needsUpdate = true;
  }
}

/* ==========================================================================
 * 3. Modular Assembly Builders
 * ========================================================================== */

function buildOuterRingRig(glassRatio: number, mood: MoodMode, theme: ThemeMode): OuterRingRig {
  const group = new THREE.Group();
  group.name = 'about-outer-ring';
  group.rotation.order = 'ZXY';
  group.rotation.set(BASE_OUTER_TILT_X, 0, BASE_OUTER_TILT_Z);

  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(
    new THREE.TorusGeometry(OUTER_RING_RADIUS, OUTER_RING_TUBE, 24, 96),
    glassMat
  );
  glassMesh.name = 'about-outer-glass-track';
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  const innerRailMat = new THREE.MeshStandardMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    emissive: STAGE_PALETTE.champagneEmissiveDark,
    emissiveIntensity: 0.24,
    metalness: 0.72,
    roughness: 0.28,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const innerRailMesh = new THREE.Mesh(
    new THREE.TorusGeometry(OUTER_RING_RADIUS, 0.028, 12, 96),
    innerRailMat
  );
  innerRailMesh.renderOrder = 1;
  group.add(innerRailMesh);

  const trimMat = createChampagneGoldMaterial(mood, theme, 0.34);
  group.add(
    new THREE.Mesh(new THREE.TorusGeometry(OUTER_TRIM_OUTER_RADIUS, 0.016, 12, 96), trimMat),
    new THREE.Mesh(new THREE.TorusGeometry(OUTER_TRIM_INNER_RADIUS, 0.014, 12, 96), trimMat)
  );

  const cometAlphaTex = createCometAlphaTexture();
  const cometGroup = new THREE.Group();
  cometGroup.name = 'about-comet-trail';
  group.add(cometGroup);

  const cometGlowMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    alphaMap: cometAlphaTex,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cometGlowMesh = new THREE.Mesh(
    createTaperedCometGeometry(OUTER_RING_RADIUS, 0.064, 14, 48, COMET_ARC_RAD),
    cometGlowMat
  );
  cometGlowMesh.renderOrder = 4;

  const cometCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3dc,
    alphaMap: cometAlphaTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cometCoreMesh = new THREE.Mesh(
    createTaperedCometGeometry(OUTER_RING_RADIUS, 0.024, 10, 48, COMET_ARC_RAD),
    cometCoreMat
  );
  cometCoreMesh.renderOrder = 5;
  cometGroup.add(cometGlowMesh, cometCoreMesh);

  return { group, glassMat, innerRailMat, trimMat, cometGroup, cometGlowMat, cometCoreMat };
}

function buildInnerGyroRig(glassRatio: number, mood: MoodMode, theme: ThemeMode): InnerGyroRig {
  const pivot = new THREE.Group();
  pivot.name = 'about-inner-gyro-pivot';
  pivot.position.set(-0.14, 0.24, 0.05);
  pivot.rotation.order = 'ZXY';
  pivot.rotation.set(BASE_GYRO_TILT_X, BASE_GYRO_TILT_Y, BASE_GYRO_TILT_Z);

  const ring = new THREE.Group();
  ring.name = 'about-inner-gyro-ring';
  pivot.add(ring);

  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(
    new THREE.TorusGeometry(INNER_GYRO_RADIUS, INNER_GYRO_TUBE, 24, 80),
    glassMat
  );
  glassMesh.renderOrder = 3;

  const coreMat = createChampagneGoldMaterial(mood, theme, 0.2);
  const coreMesh = new THREE.Mesh(new THREE.TorusGeometry(INNER_GYRO_RADIUS, 0.048, 16, 80), coreMat);
  coreMesh.renderOrder = 1;

  const rimMat = createChampagneGoldMaterial(mood, theme, 0.36);
  ring.add(
    glassMesh,
    coreMesh,
    new THREE.Mesh(new THREE.TorusGeometry(INNER_GYRO_RADIUS + INNER_GYRO_TUBE, 0.015, 12, 80), rimMat),
    new THREE.Mesh(new THREE.TorusGeometry(INNER_GYRO_RADIUS - INNER_GYRO_TUBE, 0.014, 12, 80), rimMat)
  );

  return { pivot, ring, glassMat, coreMat, rimMat };
}

function buildLoopNodes(
  parent: THREE.Group,
  nodeGlowTex: THREE.Texture,
  mood: MoodMode,
  theme: ThemeMode
): {
  readonly nodes: LoopNodeEntry[];
  readonly pickTargets: THREE.Object3D[];
  readonly labelHandles: FloatingLabelHandle[];
} {
  const beadGeo = new THREE.SphereGeometry(0.108, 22, 18);
  const coreGeo = new THREE.SphereGeometry(0.046, 12, 10);
  const haloGeo = new THREE.TorusGeometry(0.162, 0.011, 10, 36);
  const hitGeo = new THREE.SphereGeometry(0.32, 12, 10);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  const nodes: LoopNodeEntry[] = [];
  const pickTargets: THREE.Object3D[] = [];
  const labelHandles: FloatingLabelHandle[] = [];

  for (const spec of LOOP_NODE_SPECS) {
    const angle = getLoopNodeAngle(spec.index);
    const root = new THREE.Group();
    root.name = `about-loop-node-${spec.index}`;
    root.position.set(Math.cos(angle) * OUTER_RING_RADIUS, Math.sin(angle) * OUTER_RING_RADIUS, 0);
    parent.add(root);

    const useSoftGlass = isSoftwareGlGlassFallback();
    const beadMat = new THREE.MeshPhysicalMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      emissive: STAGE_PALETTE.champagneEmissiveDark,
      emissiveIntensity: 0.32,
      roughness: 0.14,
      metalness: 0.18,
      transmission: useSoftGlass ? 0 : 0.36,
      thickness: useSoftGlass ? 0 : 0.32,
      ior: 1.48,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: useSoftGlass ? 0.78 : 0.92,
      envMapIntensity: 1.6,
    });
    const beadMesh = new THREE.Mesh(beadGeo, beadMat);
    beadMesh.userData.nodeIndex = spec.index;

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfff5e2,
      emissive: STAGE_PALETTE.champagneGoldBright,
      emissiveIntensity: 0.82,
      roughness: 0.24,
      metalness: 0.3,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);

    const haloMat = createChampagneGoldMaterial(mood, theme, 0.32);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.userData.nodeIndex = spec.index;

    const glowMat = new THREE.SpriteMaterial({
      map: nodeGlowTex,
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(0.56, 0.56, 1);
    glowSprite.renderOrder = 5;

    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData.nodeIndex = spec.index;

    const labelHandle = createFloatingLabelSprite(spec.label, {
      width: spec.width,
      height: 50,
      worldHeight: 0.245,
    });
    labelHandle.sprite.material.depthTest = false;
    labelHandle.sprite.position.set(spec.labelOffset[0], spec.labelOffset[1], spec.labelOffset[2]);
    labelHandle.sprite.userData.nodeIndex = spec.index;
    labelHandle.sprite.renderOrder = 25;

    root.add(beadMesh, coreMesh, haloMesh, glowSprite, hitMesh, labelHandle.sprite);
    labelHandles.push(labelHandle);
    pickTargets.push(hitMesh, beadMesh, haloMesh, labelHandle.sprite);
    nodes.push({
      index: spec.index,
      beadMesh,
      beadMat,
      coreMesh,
      coreMat,
      haloMesh,
      haloMat,
      glowSprite,
      glowMat,
      labelHandle,
      activeWeight: spec.index === 0 ? 1 : 0,
      tapPulse: 0,
    });
  }

  return { nodes, pickTargets, labelHandles };
}

function buildEmblemRig(
  parent: THREE.Group,
  nodeGlowTex: THREE.Texture,
  mood: MoodMode,
  theme: ThemeMode
): EmblemRig {
  const emblemGroup = new THREE.Group();
  emblemGroup.name = 'about-invtry-loop-emblem';
  emblemGroup.position.set(
    Math.cos(EMBLEM_ANGLE_RAD) * OUTER_RING_RADIUS,
    Math.sin(EMBLEM_ANGLE_RAD) * OUTER_RING_RADIUS,
    0
  );
  parent.add(emblemGroup);

  const gemMat = new THREE.MeshStandardMaterial({
    color: 0xfff2d8,
    emissive: STAGE_PALETTE.champagneGoldBright,
    emissiveIntensity: 0.9,
    roughness: 0.16,
    metalness: 0.45,
  });
  const haloMat = createChampagneGoldMaterial(mood, theme, 0.42);
  const haloMesh = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.009, 10, 32), haloMat);

  const glowMat = new THREE.SpriteMaterial({
    map: nodeGlowTex,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.set(0.46, 0.46, 1);
  glowSprite.renderOrder = 5;

  const labelHandle = createFloatingLabelSprite('iNVTRY LOOP', {
    accent: true,
    width: 228,
    height: 52,
    worldHeight: 0.255,
  });
  labelHandle.sprite.material.depthTest = false;
  labelHandle.sprite.position.set(-0.04, 0.24, 0.22);
  labelHandle.sprite.renderOrder = 26;

  emblemGroup.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), gemMat),
    haloMesh,
    glowSprite,
    labelHandle.sprite
  );
  return { gemMat, haloMesh, haloMat, glowMat, labelHandle };
}

/* ==========================================================================
 * 4. About 3D Stage Factory (`StageModule`)
 * ========================================================================== */

export function createAboutStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'stage-about';
  group.position.set(0, 0.04, 0);

  let currentGlassRatio = 0.5;
  let currentMood: MoodMode = 'luxury';
  let currentTheme: ThemeMode = 'dark';
  let isDisposed = false;

  let orbitAngle = getJourneyCutAngle(0);
  let lastOrbitAngle = orbitAngle;
  let smoothedAngularSpeed = 0;
  let precessionPhase = 0;
  let manualScrubActive = false;
  let hoveredNodeIndex = -1;

  let parallaxTargetX = 0;
  let parallaxTargetY = 0;
  let parallaxCurrentX = 0;
  let parallaxCurrentY = 0;

  const raycaster = new THREE.Raycaster();
  const tmpNdc = new THREE.Vector2();
  const marbleAnchorOut = new THREE.Vector3();

  const outerRig = buildOuterRingRig(currentGlassRatio, currentMood, currentTheme);
  const gyroRig = buildInnerGyroRig(currentGlassRatio, currentMood, currentTheme);
  group.add(outerRig.group, gyroRig.pivot);

  const nodeGlowTex = createNodeGlowTexture(96);
  const { nodes, pickTargets, labelHandles } = buildLoopNodes(
    outerRig.group,
    nodeGlowTex,
    currentMood,
    currentTheme
  );
  const emblemRig = buildEmblemRig(outerRig.group, nodeGlowTex, currentMood, currentTheme);
  labelHandles.push(emblemRig.labelHandle);

  const syncGlassMaterials = (): void => {
    const g = currentGlassRatio;
    const isDark = currentTheme === 'dark';
    applySmokedGlassState(outerRig.glassMat, g, currentMood, currentTheme);
    applySmokedGlassState(gyroRig.glassMat, g, currentMood, currentTheme);
    outerRig.innerRailMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.22 : 0.18,
      isDark ? 0.48 : 0.34,
      g
    );
    const useSoftGlass = isSoftwareGlGlassFallback();
    for (const node of nodes) {
      node.beadMat.roughness = THREE.MathUtils.lerp(0.22, 0.06, g);
      if (useSoftGlass) {
        node.beadMat.transparent = true;
        node.beadMat.transmission = 0;
        node.beadMat.thickness = 0;
        node.beadMat.opacity = THREE.MathUtils.lerp(0.84, 0.58, g);
        node.beadMat.clearcoat = 1.0;
        node.beadMat.envMapIntensity = 1.6;
      } else {
        node.beadMat.transmission = THREE.MathUtils.lerp(0.18, 0.54, g);
        node.beadMat.thickness = 0.32;
        node.beadMat.opacity = 0.92;
      }
    }
  };

  const syncVisualMaterials = (): void => {
    const isDark = currentTheme === 'dark';
    const nextBlending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    const palette = MODE_ACCENT_PALETTES[`${currentMood}:${currentTheme}`];

    syncGlassMaterials();

    applyGoldModeState(outerRig.trimMat, currentMood, currentTheme, 0.34);
    applyGoldModeState(gyroRig.coreMat, currentMood, currentTheme, 0.2);
    applyGoldModeState(gyroRig.rimMat, currentMood, currentTheme, 0.36);
    applyGoldModeState(emblemRig.haloMat, currentMood, currentTheme, 0.42);

    outerRig.innerRailMat.color.setHex(palette.railColor);
    outerRig.innerRailMat.emissive.setHex(palette.railEmissive);

    setMaterialBlending(outerRig.cometGlowMat, nextBlending);
    setMaterialBlending(outerRig.cometCoreMat, nextBlending);
    setMaterialBlending(emblemRig.glowMat, nextBlending);

    outerRig.cometGlowMat.color.setHex(palette.cometGlow);
    outerRig.cometCoreMat.color.setHex(palette.cometCore);
    emblemRig.gemMat.color.setHex(palette.emblemGem);
    emblemRig.gemMat.emissive.setHex(palette.emblemEmissive);
    emblemRig.glowMat.color.setHex(palette.emblemGlow);
    emblemRig.glowMat.opacity = isDark ? 0.56 : 0.28;
    emblemRig.labelHandle.setHighlight(true, currentTheme);

    for (const node of nodes) {
      node.beadMat.color.setHex(palette.beadColor);
      node.beadMat.emissive.setHex(palette.beadEmissive);
      node.beadMat.iridescence = palette.beadIridescence;
      node.coreMat.color.setHex(palette.coreColor);
      node.coreMat.emissive.setHex(palette.coreEmissive);
      node.glowMat.color.setHex(palette.nodeGlow);
      setMaterialBlending(node.glowMat, nextBlending);
      applyGoldModeState(node.haloMat, currentMood, currentTheme, 0.32);
      node.labelHandle.setHighlight(
        node.activeWeight >= 0.5 || node.index === hoveredNodeIndex,
        currentTheme
      );
    }
  };

  const resolveActiveNodeIndex = (state: StageInteractionState): number => {
    if (state.aboutSubtab !== 'journey' && state.aboutLoopPaused && !manualScrubActive) {
      const count = LOOP_NODE_SPECS.length;
      return ((Math.round(state.aboutLoopIndex) % count) + count) % count;
    }
    return findNearestLoopNodeIndex(orbitAngle);
  };

  const syncNodeHighlights = (
    activeNodeIndex: number,
    dt: number,
    elapsed: number,
    reducedMotion: boolean
  ): void => {
    const isDark = currentTheme === 'dark';
    const blend = reducedMotion ? 1 : 1 - Math.exp(-9 * dt);
    const pulseDecay = reducedMotion ? 1 : Math.exp(-5.5 * dt);

    for (const node of nodes) {
      const isPrimary = node.index === activeNodeIndex;
      const isHovered = node.index === hoveredNodeIndex;
      const targetWeight = isPrimary ? 1 : isHovered ? 0.65 : 0;

      node.activeWeight += (targetWeight - node.activeWeight) * blend;
      node.tapPulse = reducedMotion ? 0 : node.tapPulse * pulseDecay;

      const w = node.activeWeight;
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 2.8 + node.index * 1.1);
      const tapBoost = node.tapPulse * 0.24;

      node.beadMesh.scale.setScalar(1 + w * 0.22 + tapBoost);
      node.coreMesh.scale.setScalar(0.92 + w * 0.24 + pulse * 0.08 + tapBoost);
      node.haloMesh.scale.setScalar(1 + w * 0.26 + pulse * (0.04 + w * 0.06) + tapBoost * 1.2);
      node.haloMesh.rotation.z = elapsed * (0.35 + w * 0.45) + node.index;

      node.beadMat.emissiveIntensity = (isDark ? 0.24 : 0.16) + w * (isDark ? 0.46 : 0.28) + tapBoost;
      node.coreMat.emissiveIntensity = (isDark ? 0.62 : 0.42) + w * (isDark ? 0.72 : 0.46) + tapBoost;
      node.haloMat.emissiveIntensity = (isDark ? 0.24 : 0.16) + w * (isDark ? 0.55 : 0.34) + tapBoost;

      const glowScale = 0.5 + w * 0.38 + pulse * 0.06 + tapBoost * 0.6;
      node.glowSprite.scale.set(glowScale, glowScale, 1);
      node.glowMat.opacity =
        (isDark ? 0.3 : 0.16) + w * (isDark ? 0.46 : 0.24) + node.tapPulse * 0.25;

      node.labelHandle.setHighlight(isPrimary || isHovered, currentTheme);
    }
  };

  const raycastLoopNode = (ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): number => {
    tmpNdc.set(ndcX, ndcY);
    raycaster.setFromCamera(tmpNdc, camera);
    const hits = raycaster.intersectObjects(pickTargets, false);
    for (const hit of hits) {
      const idx = hit.object.userData.nodeIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < LOOP_NODE_SPECS.length) {
        return idx;
      }
    }
    return -1;
  };

  const syncCometTransform = (dt: number, elapsed: number, reducedMotion: boolean): void => {
    outerRig.cometGroup.rotation.z = orbitAngle - COMET_ARC_RAD;
    const rawSpeed = dt > 1e-5 ? Math.abs(shortestAngleDelta(lastOrbitAngle, orbitAngle)) / dt : 0;
    lastOrbitAngle = orbitAngle;

    const speedLerp = reducedMotion ? 1 : 1 - Math.exp(-8 * dt);
    smoothedAngularSpeed += (Math.min(rawSpeed, 6) - smoothedAngularSpeed) * speedLerp;

    const isDark = currentTheme === 'dark';
    const shimmer = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 3.1);
    const motionEnergy = THREE.MathUtils.clamp(smoothedAngularSpeed / 1.4, 0, 1);

    outerRig.cometGlowMat.opacity =
      (isDark ? 0.46 : 0.34) + motionEnergy * (isDark ? 0.34 : 0.26) + shimmer * 0.08;
    outerRig.cometCoreMat.opacity =
      (isDark ? 0.66 : 0.48) + motionEnergy * (isDark ? 0.28 : 0.24) + shimmer * 0.06;
  };

  const syncInitialAngle = (state: StageInteractionState): void => {
    orbitAngle =
      state.aboutSubtab === 'journey'
        ? getJourneyCutAngle(state.aboutJourneyIndex)
        : getLoopNodeAngle(state.aboutLoopIndex);
    lastOrbitAngle = orbitAngle;
    outerRig.cometGroup.rotation.z = orbitAngle - COMET_ARC_RAD;
  };

  const getMarbleAnchor = (_elapsed: number, _state: StageInteractionState): THREE.Vector3 => {
    group.updateMatrixWorld(true);
    marbleAnchorOut
      .set(Math.cos(orbitAngle) * OUTER_RING_RADIUS, Math.sin(orbitAngle) * OUTER_RING_RADIUS, 0)
      .applyMatrix4(outerRig.group.matrixWorld);
    return marbleAnchorOut;
  };

  const onEnter = (ctx: StageContext): void => {
    manualScrubActive = false;
    hoveredNodeIndex = -1;
    parallaxTargetX = 0;
    parallaxTargetY = 0;
    parallaxCurrentX = 0;
    parallaxCurrentY = 0;

    currentGlassRatio = THREE.MathUtils.clamp(ctx.glassRatio, 0, 1);
    currentMood = ctx.mood;
    currentTheme = ctx.theme;

    syncInitialAngle(ctx.interaction);
    syncVisualMaterials();
    syncNodeHighlights(resolveActiveNodeIndex(ctx.interaction), 0.016, 0, true);
    group.updateMatrixWorld(true);
  };

  const onExit = (_ctx: StageContext): void => {
    hoveredNodeIndex = -1;
    manualScrubActive = false;
  };

  const onGlassChange = (glassRatio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(glassRatio, 0, 1);
    syncGlassMaterials();
  };

  const onVisualModeChange = (mood: MoodMode, theme: ThemeMode): void => {
    currentMood = mood;
    currentTheme = theme;
    syncVisualMaterials();
  };

  const onInteractionChange = (patch: Partial<StageInteractionState>, _ctx: StageContext): void => {
    if (
      patch.aboutSubtab !== undefined ||
      patch.aboutJourneyIndex !== undefined ||
      patch.aboutLoopIndex !== undefined ||
      patch.aboutLoopPaused !== undefined
    ) {
      manualScrubActive = false;
    }
  };

  const onPointerMove = (ndcX: number, ndcY: number, ctx: StageContext): void => {
    parallaxTargetX = THREE.MathUtils.clamp(ndcX, -1, 1) * 0.065;
    parallaxTargetY = THREE.MathUtils.clamp(ndcY, -1, 1) * 0.055;
    hoveredNodeIndex = raycastLoopNode(ndcX, ndcY, ctx.camera);
  };

  const onPointerDrag = (dx: number, _dy: number, ctx: StageContext): void => {
    orbitAngle += dx * DRAG_SCRUB_RAD_PER_UNIT;
    precessionPhase += dx * 1.35;
    manualScrubActive = true;
    if (!ctx.interaction.aboutLoopPaused) {
      ctx.emitUiSync({ aboutLoopPaused: true });
    }
  };

  const onPointerTap = (ndcX: number, ndcY: number, ctx: StageContext): void => {
    const hitIndex = raycastLoopNode(ndcX, ndcY, ctx.camera);
    if (hitIndex < 0) return;

    manualScrubActive = false;
    const hitNode = nodes[hitIndex];
    if (hitNode) hitNode.tapPulse = 1.0;

    if (ctx.interaction.aboutSubtab === 'journey') {
      ctx.emitUiSync({ aboutJourneyIndex: hitIndex });
    } else {
      ctx.emitUiSync({ aboutLoopIndex: hitIndex, aboutLoopPaused: true });
    }
  };

  const update = (dt: number, elapsed: number, ctx: StageContext): void => {
    if (isDisposed) return;

    const state = ctx.interaction;
    const dampFactor = ctx.reducedMotion ? 1 : 1 - Math.exp(-7.2 * dt);

    // 1. Sync orbital angle to active About subtab (`journey` / `mission` / `founder`)
    if (!manualScrubActive) {
      if (state.aboutSubtab === 'journey') {
        orbitAngle += shortestAngleDelta(orbitAngle, getJourneyCutAngle(state.aboutJourneyIndex)) * dampFactor;
      } else if (!state.aboutLoopPaused) {
        if (!ctx.reducedMotion) {
          orbitAngle += dt * (state.aboutSubtab === 'mission' ? MISSION_ORBIT_SPEED : FOUNDER_ORBIT_SPEED);
        }
      } else {
        orbitAngle += shortestAngleDelta(orbitAngle, getLoopNodeAngle(state.aboutLoopIndex)) * dampFactor;
      }
    }

    // 2. Subtle pointer parallax & calm levitation
    const parallaxDamp = ctx.reducedMotion ? 1 : 1 - Math.exp(-6 * dt);
    parallaxCurrentX += (parallaxTargetX - parallaxCurrentX) * parallaxDamp;
    parallaxCurrentY += (parallaxTargetY - parallaxCurrentY) * parallaxDamp;

    group.position.y = 0.04 + (ctx.reducedMotion ? 0 : Math.sin(elapsed * 0.85) * 0.032);
    const breatheTilt = ctx.reducedMotion ? 0 : Math.sin(elapsed * 0.62) * 0.016;

    outerRig.group.rotation.x = BASE_OUTER_TILT_X + parallaxCurrentY + breatheTilt;
    outerRig.group.rotation.y = parallaxCurrentX * 0.85;
    outerRig.group.rotation.z = BASE_OUTER_TILT_Z - parallaxCurrentX * 0.45;

    // 3. Interlocking inner sculptural ring gentle precession (halts when paused)
    if (!state.aboutLoopPaused && !ctx.reducedMotion) {
      precessionPhase += dt * (state.aboutSubtab === 'founder' ? 0.28 : 0.44);
      gyroRig.ring.rotation.z += dt * (state.aboutSubtab === 'founder' ? 0.12 : 0.2);
    }
    gyroRig.pivot.rotation.x =
      BASE_GYRO_TILT_X + Math.cos(precessionPhase * 0.72) * 0.14 + parallaxCurrentY * 1.1;
    gyroRig.pivot.rotation.y =
      BASE_GYRO_TILT_Y + Math.sin(precessionPhase) * 0.24 + parallaxCurrentX * 1.3;
    gyroRig.pivot.rotation.z = BASE_GYRO_TILT_Z + Math.sin(precessionPhase * 0.55) * 0.08;

    // 4. Sync comet trail, 5 node glows/labels, and front `iNVTRY LOOP` emblem
    syncCometTransform(dt, elapsed, ctx.reducedMotion);
    syncNodeHighlights(resolveActiveNodeIndex(state), dt, elapsed, ctx.reducedMotion);

    const emblemPulse = ctx.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 2.1);
    emblemRig.gemMat.emissiveIntensity =
      (currentTheme === 'dark' ? 0.78 : 0.48) + emblemPulse * 0.24;
    emblemRig.haloMesh.rotation.z = -elapsed * 0.3;

    group.updateMatrixWorld(true);
  };

  const dispose = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    disposeObject3D(group);
    for (const handle of labelHandles) {
      handle.dispose();
    }
  };

  syncVisualMaterials();
  syncInitialAngle(DEFAULT_STAGE_INTERACTION_STATE);

  return {
    id: 'about',
    group,
    cameraPreset: STAGE_CAMERA_PRESETS.about,
    getMarbleAnchor,
    onEnter,
    onExit,
    onGlassChange,
    onVisualModeChange,
    onInteractionChange,
    onPointerMove,
    onPointerDrag,
    onPointerTap,
    update,
    dispose,
  };
}
