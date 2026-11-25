/**
 * aboutStage.ts
 * ---------------------------------------------------------------------------
 * About 3D Stage (`iNVTRY LOOP` — Sculpted Liquid-Glass Möbius Ribbon)
 *
 * Architectural single-sided smoked-glass & champagne-gold Möbius ribbon
 * sculpture representing infinite wardrobe circularity, synchronized with the
 * About multi-tab HUD (`Journey` 6-cut cycle, `Mission` 5-node circular loop,
 * `Model`, and `Connect`).
 *
 * Visual & Interaction Highlights:
 * 1. Watertight chamfered smoked-glass Möbius ribbon (`R = 1.72`, continuous
 *    half-twist over `u ∈ [0, 2π]`, seamless point-symmetric 12-edge crystal
 *    profile) framed by a single unbroken 4π champagne-gold edge rail and an
 *    internal hairline filament vein.
 * 2. Suspended central faceted crystal diamond-prism (`Heart of the Loop`)
 *    surrounded by 48 luminous micro-particles drifting along the 4π Möbius
 *    surface current.
 * 3. Live zero-allocation 3D wave-hugging golden comet wake trailing smoothly
 *    behind the orbiting gold marble across the sculpted spine.
 * 4. Five interactive faceted crystal loop nodes (`Closet`, `Weather`,
 *    `360° Fit`, `Calendar`, `CPW`) plus foreground `iNVTRY LOOP` emblem
 *    supporting direct raycast hover/tap and horizontal drag scrubbing.
 * 5. Full live `Glass %`, `Luxury / Aurora`, `Dark / Light`, and
 *    `reducedMotion` parity with leak-free GPU disposal via `disposeObject3D`.
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
const FOUR_PI = Math.PI * 4;

const MOBIUS_RADIUS = 1.72;
const MOBIUS_HALF_WIDTH = 0.34;
const MOBIUS_THICKNESS = 0.036;
const MOBIUS_WAVE_Z = 0.17;
const MOBIUS_U_SEGS = 160;
const MOBIUS_PROFILE_SEGS = 12; // Must be even for exact point-symmetric 2π seam closure

const COMET_ARC_RAD = 0.92;
const COMET_LENGTH_SEGS = 36;
const COMET_RADIAL_SEGS = 8;
const FLOW_PARTICLE_COUNT = 48;

// 3/4 gallery elevation showcasing the iconic continuous Möbius twist & depth
const BASE_SCULPTURE_TILT_X = -0.94;
const BASE_SCULPTURE_TILT_Z = -0.15;

// Gentle angular phase shift keeps all 5 nodes & labels clear of left viewport edge & right HUD
const NODE_ANGLE_PHASE = 0.28;
const EMBLEM_ANGLE_RAD = -Math.PI * 0.56;

const MISSION_ORBIT_SPEED = 0.4;
const FOUNDER_ORBIT_SPEED = 0.2;
const DRAG_SCRUB_RAD_PER_UNIT = 3.6;

interface LoopNodeSpec {
  readonly index: number;
  readonly label: string;
  readonly width: number;
  readonly labelOffset: readonly [number, number, number];
}

// Calibrated to prevent left-edge clipping and right-HUD overlap on 16:9 desktop & 390px mobile
const LOOP_NODE_SPECS: readonly LoopNodeSpec[] = [
  { index: 0, label: 'Closet', width: 146, labelOffset: [-0.32, 0.26, 0.28] },
  { index: 1, label: 'Weather', width: 162, labelOffset: [0.06, 0.32, 0.28] },
  { index: 2, label: '360° Fit', width: 162, labelOffset: [0.08, 0.3, 0.28] },
  { index: 3, label: 'Calendar', width: 170, labelOffset: [0.36, 0.24, 0.28] },
  { index: 4, label: 'CPW', width: 128, labelOffset: [0.22, -0.22, 0.24] },
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
  readonly particleColor: number;
}

const MODE_ACCENT_PALETTES: Record<`${MoodMode}:${ThemeMode}`, ModeAccentPalette> = {
  'luxury:dark': {
    railColor: STAGE_PALETTE.champagneGoldBright,
    railEmissive: STAGE_PALETTE.champagneEmissiveDark,
    cometGlow: STAGE_PALETTE.champagneGoldBright,
    cometCore: 0xfff5e0,
    emblemGem: 0xfff2d8,
    emblemEmissive: STAGE_PALETTE.champagneGoldBright,
    emblemGlow: STAGE_PALETTE.champagneGoldBright,
    beadColor: STAGE_PALETTE.champagneGoldBright,
    beadEmissive: STAGE_PALETTE.champagneEmissiveDark,
    beadIridescence: 0.12,
    coreColor: 0xfff5e2,
    coreEmissive: STAGE_PALETTE.champagneGoldBright,
    nodeGlow: STAGE_PALETTE.champagneGoldBright,
    particleColor: 0xf4dfb4,
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
    beadIridescence: 0.12,
    coreColor: 0xfff5e2,
    coreEmissive: STAGE_PALETTE.champagneEmissiveLight,
    nodeGlow: 0xc89f5e,
    particleColor: 0xb88c48,
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
    beadIridescence: 0.76,
    coreColor: 0xf3f7ff,
    coreEmissive: 0xa2c8f8,
    nodeGlow: 0xa5cbf8,
    particleColor: 0xc7dfff,
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
    beadIridescence: 0.76,
    coreColor: 0xf3f7ff,
    coreEmissive: 0x678dc4,
    nodeGlow: 0x759bd0,
    particleColor: 0x6d93ca,
  },
};

interface LoopNodeEntry {
  readonly index: number;
  readonly beadMesh: THREE.Mesh;
  readonly beadMat: THREE.MeshPhysicalMaterial;
  readonly coreMesh: THREE.Mesh;
  readonly coreMat: THREE.MeshStandardMaterial;
  readonly bezelMesh: THREE.Mesh;
  readonly bezelMat: THREE.MeshStandardMaterial;
  readonly glowSprite: THREE.Sprite;
  readonly glowMat: THREE.SpriteMaterial;
  readonly labelHandle: FloatingLabelHandle;
  activeWeight: number;
  tapPulse: number;
}

interface DynamicCometMesh {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.BufferGeometry;
  readonly mat: THREE.MeshBasicMaterial;
  readonly posArray: Float32Array;
  readonly maxRadius: number;
}

interface MobiusSculptureRig {
  readonly group: THREE.Group;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly edgeRailMat: THREE.MeshStandardMaterial;
  readonly innerVeinMat: THREE.MeshStandardMaterial;
  readonly spineCoreMat: THREE.MeshStandardMaterial;
  readonly cometGlow: DynamicCometMesh;
  readonly cometCore: DynamicCometMesh;
  readonly flowPoints: THREE.Points;
  readonly flowPositions: Float32Array;
  readonly flowMat: THREE.PointsMaterial;
  readonly flowSeeds: Float32Array; // [uOffset, vFraction, speed] × FLOW_PARTICLE_COUNT
}

interface CorePrismRig {
  readonly pivot: THREE.Group;
  readonly crystalGroup: THREE.Group;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly wireMat: THREE.LineBasicMaterial;
  readonly nucleusMat: THREE.MeshStandardMaterial;
  readonly meridianMesh: THREE.Mesh;
  readonly meridianMat: THREE.MeshStandardMaterial;
}

interface EmblemRig {
  readonly gemMat: THREE.MeshStandardMaterial;
  readonly haloMesh: THREE.Mesh;
  readonly haloMat: THREE.MeshStandardMaterial;
  readonly glowMat: THREE.SpriteMaterial;
  readonly labelHandle: FloatingLabelHandle;
}

/* ==========================================================================
 * 2. Möbius Parametric Math & Procedural Geometry / Texture Helpers
 * ========================================================================== */

function getMobiusHalfWidth(u: number): number {
  return MOBIUS_HALF_WIDTH * (1 + 0.12 * Math.cos(2 * u));
}

function sampleMobiusSpine(u: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    MOBIUS_RADIUS * Math.cos(u),
    MOBIUS_RADIUS * Math.sin(u),
    MOBIUS_WAVE_Z * Math.sin(2 * u)
  );
}

function sampleMobiusSurfacePoint(
  u: number,
  vOffset: number,
  nOffset: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const halfU = u * 0.5;
  const cosHalf = Math.cos(halfU);
  const sinHalf = Math.sin(halfU);

  // Ribbon width axis b(u) = cos(u/2)*e_r + sin(u/2)*e_z
  const bx = cosHalf * cosU;
  const by = cosHalf * sinU;
  const bz = sinHalf;

  // Ribbon normal axis n(u) = -sin(u/2)*e_r + cos(u/2)*e_z
  const nx = -sinHalf * cosU;
  const ny = -sinHalf * sinU;
  const nz = cosHalf;

  return out.set(
    MOBIUS_RADIUS * cosU + vOffset * bx + nOffset * nx,
    MOBIUS_RADIUS * sinU + vOffset * by + nOffset * ny,
    MOBIUS_WAVE_Z * Math.sin(2 * u) + vOffset * bz + nOffset * nz
  );
}

function getProfileOffset(u: number, k: number): readonly [number, number] {
  const alpha = (k / MOBIUS_PROFILE_SEGS) * TWO_PI;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const w = getMobiusHalfWidth(u);
  // Sculpted chamfered crystal-blade cross-section (point-symmetric for exact 2π seam match)
  const v = w * Math.sign(cosA) * Math.pow(Math.abs(cosA), 0.72);
  const n = MOBIUS_THICKNESS * Math.sign(sinA) * Math.pow(Math.abs(sinA), 0.86);
  return [v, n];
}

/**
 * Builds a watertight, zero-seam sculpted Möbius strip BufferGeometry with
 * smooth analytic normals and continuous UV coordinates.
 */
function createSculptedMobiusGeometry(): THREE.BufferGeometry {
  const uCount = MOBIUS_U_SEGS;
  const pCount = MOBIUS_PROFILE_SEGS;
  const ringVerts = pCount + 1;
  const totalVerts = (uCount + 1) * ringVerts;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  const pCurr = new THREE.Vector3();
  const pCenter = new THREE.Vector3();
  const pUPlus = new THREE.Vector3();
  const pUMinus = new THREE.Vector3();
  const pKPlus = new THREE.Vector3();
  const pKMinus = new THREE.Vector3();
  const tanU = new THREE.Vector3();
  const tanK = new THREE.Vector3();
  const norm = new THREE.Vector3();
  const radialOut = new THREE.Vector3();
  const epsU = 0.0025;

  for (let i = 0; i <= uCount; i += 1) {
    const uNorm = i / uCount;
    const u = uNorm * TWO_PI;
    sampleMobiusSpine(u, pCenter);

    for (let j = 0; j <= pCount; j += 1) {
      const k = j % pCount;
      const [v, n] = getProfileOffset(u, k);
      sampleMobiusSurfacePoint(u, v, n, pCurr);

      const [vUp, nUp] = getProfileOffset(u + epsU, k);
      const [vUm, nUm] = getProfileOffset(u - epsU, k);
      sampleMobiusSurfacePoint(u + epsU, vUp, nUp, pUPlus);
      sampleMobiusSurfacePoint(u - epsU, vUm, nUm, pUMinus);
      tanU.subVectors(pUPlus, pUMinus);

      const [vKp, nKp] = getProfileOffset(u, (k + 1) % pCount);
      const [vKm, nKm] = getProfileOffset(u, (k - 1 + pCount) % pCount);
      sampleMobiusSurfacePoint(u, vKp, nKp, pKPlus);
      sampleMobiusSurfacePoint(u, vKm, nKm, pKMinus);
      tanK.subVectors(pKPlus, pKMinus);

      norm.crossVectors(tanU, tanK).normalize();
      radialOut.subVectors(pCurr, pCenter);
      if (norm.dot(radialOut) < 0) {
        norm.negate();
      }

      const idx = i * ringVerts + j;
      positions[idx * 3] = pCurr.x;
      positions[idx * 3 + 1] = pCurr.y;
      positions[idx * 3 + 2] = pCurr.z;

      normals[idx * 3] = norm.x;
      normals[idx * 3 + 1] = norm.y;
      normals[idx * 3 + 2] = norm.z;

      uvs[idx * 2] = uNorm;
      uvs[idx * 2 + 1] = j / pCount;
    }
  }

  for (let i = 0; i < uCount; i += 1) {
    for (let j = 0; j < pCount; j += 1) {
      const a = i * ringVerts + j;
      const b = (i + 1) * ringVerts + j;
      const c = (i + 1) * ringVerts + (j + 1);
      const d = i * ringVerts + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds the single continuous 4π closed edge wire of the Möbius strip.
 * Because a Möbius strip has one continuous boundary, traversing `u ∈ [0, 4π]`
 * smoothly traces both rims as a single unbroken architectural filament.
 */
function createMobiusBoundaryTube(
  widthScale: number,
  widthBias: number,
  tubeRadius: number,
  tubularSegments: number,
  radialSegments: number
): THREE.TubeGeometry {
  const sampleCount = 192;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const u = (i / sampleCount) * FOUR_PI;
    const v = getMobiusHalfWidth(u) * widthScale + widthBias;
    points.push(sampleMobiusSurfacePoint(u, v, 0, new THREE.Vector3()));
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  return new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);
}

function createMobiusSpineTube(tubeRadius: number): THREE.TubeGeometry {
  const sampleCount = 96;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const u = (i / sampleCount) * TWO_PI;
    points.push(sampleMobiusSpine(u, new THREE.Vector3()));
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 128, tubeRadius, 10, true);
}

function getLoopNodeAngle(index: number): number {
  const count = LOOP_NODE_SPECS.length;
  const safeIndex = ((Math.round(index) % count) + count) % count;
  return (safeIndex / count) * TWO_PI + NODE_ANGLE_PHASE;
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
    grad.addColorStop(1.0, 'rgb(236, 236, 236)');
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

/**
 * Allocates a reusable tapered comet tube mesh whose vertices are updated
 * in-place along the 3D Möbius spine curve without per-frame allocations.
 */
function createDynamicCometMesh(
  maxRadius: number,
  color: number,
  opacity: number,
  alphaMap: THREE.Texture,
  renderOrder: number
): DynamicCometMesh {
  const ringVerts = COMET_RADIAL_SEGS + 1;
  const totalVerts = (COMET_LENGTH_SEGS + 1) * ringVerts;
  const posArray = new Float32Array(totalVerts * 3);
  const uvArray = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i <= COMET_LENGTH_SEGS; i += 1) {
    const t = i / COMET_LENGTH_SEGS;
    for (let j = 0; j <= COMET_RADIAL_SEGS; j += 1) {
      const idx = i * ringVerts + j;
      uvArray[idx * 2] = t;
      uvArray[idx * 2 + 1] = j / COMET_RADIAL_SEGS;
    }
  }

  for (let i = 0; i < COMET_LENGTH_SEGS; i += 1) {
    for (let j = 0; j < COMET_RADIAL_SEGS; j += 1) {
      const a = i * ringVerts + j;
      const b = (i + 1) * ringVerts + j;
      const c = (i + 1) * ringVerts + (j + 1);
      const d = i * ringVerts + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    color,
    alphaMap,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;

  return { mesh, geo, mat, posArray, maxRadius };
}

/* ==========================================================================
 * 3. Modular Assembly Builders
 * ========================================================================== */

function buildMobiusSculptureRig(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode,
  particleTex: THREE.Texture
): MobiusSculptureRig {
  const group = new THREE.Group();
  group.name = 'about-mobius-ribbon';
  group.rotation.order = 'ZXY';
  group.rotation.set(BASE_SCULPTURE_TILT_X, 0, BASE_SCULPTURE_TILT_Z);

  // 1) Primary sculpted smoked-glass Möbius ribbon
  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(createSculptedMobiusGeometry(), glassMat);
  glassMesh.name = 'about-mobius-glass-surface';
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // 2) Single unbroken 4π champagne-gold outer edge rail
  const edgeRailMat = createChampagneGoldMaterial(mood, theme, 0.36);
  const edgeRailMesh = new THREE.Mesh(
    createMobiusBoundaryTube(1.0, 0.012, 0.013, 240, 10),
    edgeRailMat
  );
  edgeRailMesh.name = 'about-mobius-edge-rail';
  edgeRailMesh.renderOrder = 3;
  group.add(edgeRailMesh);

  // 3) Delicate 4π inner luminous vein shimmering inside the ribbon face
  const innerVeinMat = createChampagneGoldMaterial(mood, theme, 0.28);
  innerVeinMat.transparent = true;
  innerVeinMat.opacity = 0.62;
  const innerVeinMesh = new THREE.Mesh(
    createMobiusBoundaryTube(0.56, 0, 0.0055, 200, 8),
    innerVeinMat
  );
  innerVeinMesh.name = 'about-mobius-inner-vein';
  innerVeinMesh.renderOrder = 1;
  group.add(innerVeinMesh);

  // 4) Central spine filament guiding the orbiting gold marble
  const spineCoreMat = new THREE.MeshStandardMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    emissive: STAGE_PALETTE.champagneEmissiveDark,
    emissiveIntensity: 0.28,
    metalness: 0.78,
    roughness: 0.24,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const spineCoreMesh = new THREE.Mesh(createMobiusSpineTube(0.015), spineCoreMat);
  spineCoreMesh.name = 'about-mobius-spine-core';
  spineCoreMesh.renderOrder = 1;
  group.add(spineCoreMesh);

  // 5) Two-layer wave-hugging golden comet trail following the orbiting marble
  const cometAlphaTex = createCometAlphaTexture();
  const cometGlow = createDynamicCometMesh(
    0.058,
    STAGE_PALETTE.champagneGoldBright,
    0.66,
    cometAlphaTex,
    4
  );
  cometGlow.mesh.name = 'about-comet-glow';
  const cometCore = createDynamicCometMesh(0.022, 0xfff5e0, 0.9, cometAlphaTex, 5);
  cometCore.mesh.name = 'about-comet-core';
  group.add(cometGlow.mesh, cometCore.mesh);

  // 6) 48 luminous micro-particles drifting along the continuous 4π Möbius surface current
  const flowPositions = new Float32Array(FLOW_PARTICLE_COUNT * 3);
  const flowSeeds = new Float32Array(FLOW_PARTICLE_COUNT * 3);
  const tmpPos = new THREE.Vector3();
  for (let i = 0; i < FLOW_PARTICLE_COUNT; i += 1) {
    const uOff = (i / FLOW_PARTICLE_COUNT) * FOUR_PI;
    const vFrac = (((i * 37) % 19) / 18 - 0.5) * 1.48;
    const speed = 0.22 + ((i * 13) % 7) * 0.035;
    flowSeeds[i * 3] = uOff;
    flowSeeds[i * 3 + 1] = vFrac;
    flowSeeds[i * 3 + 2] = speed;
    sampleMobiusSurfacePoint(uOff, getMobiusHalfWidth(uOff) * vFrac, 0.085, tmpPos);
    flowPositions[i * 3] = tmpPos.x;
    flowPositions[i * 3 + 1] = tmpPos.y;
    flowPositions[i * 3 + 2] = tmpPos.z;
  }
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));
  const flowMat = new THREE.PointsMaterial({
    map: particleTex,
    color: 0xf4dfb4,
    size: 0.095,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  const flowPoints = new THREE.Points(flowGeo, flowMat);
  flowPoints.name = 'about-mobius-flow-particles';
  flowPoints.renderOrder = 5;
  group.add(flowPoints);

  return {
    group,
    glassMat,
    edgeRailMat,
    innerVeinMat,
    spineCoreMat,
    cometGlow,
    cometCore,
    flowPoints,
    flowPositions,
    flowMat,
    flowSeeds,
  };
}

/**
 * Suspended central faceted crystal diamond-prism replacing the old bulky
 * inner torus ring. Echoes the luxury smoked-glass aesthetic of Ainvtry.
 */
function buildCorePrismRig(glassRatio: number, mood: MoodMode, theme: ThemeMode): CorePrismRig {
  const pivot = new THREE.Group();
  pivot.name = 'about-core-prism-pivot';
  pivot.position.set(0, 0.08, 0.04);

  const crystalGroup = new THREE.Group();
  crystalGroup.name = 'about-core-prism-crystal';
  pivot.add(crystalGroup);

  const prismGeo = new THREE.OctahedronGeometry(0.32, 0);
  prismGeo.scale(0.86, 1.46, 0.86);

  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const prismMesh = new THREE.Mesh(prismGeo, glassMat);
  prismMesh.renderOrder = 3;

  const wireGeo = new THREE.EdgesGeometry(prismGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  wireMesh.renderOrder = 4;

  const nucleusGeo = new THREE.OctahedronGeometry(0.11, 0);
  nucleusGeo.scale(0.85, 1.38, 0.85);
  const nucleusMat = new THREE.MeshStandardMaterial({
    color: 0xfff4df,
    emissive: STAGE_PALETTE.champagneGoldBright,
    emissiveIntensity: 0.88,
    metalness: 0.42,
    roughness: 0.18,
  });
  const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
  nucleusMesh.renderOrder = 2;

  // Ultra-fine hairline meridian arc (non-chunky astronomical filigree accent)
  const meridianMat = createChampagneGoldMaterial(mood, theme, 0.34);
  meridianMat.transparent = true;
  meridianMat.opacity = 0.56;
  const meridianMesh = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.0055, 8, 64), meridianMat);
  meridianMesh.rotation.set(Math.PI * 0.36, 0.25, 0);
  meridianMesh.renderOrder = 2;

  crystalGroup.add(prismMesh, wireMesh, nucleusMesh);
  pivot.add(meridianMesh);

  return { pivot, crystalGroup, glassMat, wireMat, nucleusMat, meridianMesh, meridianMat };
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
  // Faceted crystal diamond nodes instead of plain spheres
  const beadGeo = new THREE.OctahedronGeometry(0.112, 0);
  const coreGeo = new THREE.OctahedronGeometry(0.048, 0);
  const bezelGeo = new THREE.TorusGeometry(0.156, 0.008, 8, 36);
  const hitGeo = new THREE.SphereGeometry(0.32, 12, 10);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  const nodes: LoopNodeEntry[] = [];
  const pickTargets: THREE.Object3D[] = [];
  const labelHandles: FloatingLabelHandle[] = [];
  const nodePos = new THREE.Vector3();

  for (const spec of LOOP_NODE_SPECS) {
    const angle = getLoopNodeAngle(spec.index);
    sampleMobiusSpine(angle, nodePos);

    const root = new THREE.Group();
    root.name = `about-loop-node-${spec.index}`;
    root.position.copy(nodePos);
    parent.add(root);

    const useSoftGlass = isSoftwareGlGlassFallback();
    const beadMat = new THREE.MeshPhysicalMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      emissive: STAGE_PALETTE.champagneEmissiveDark,
      emissiveIntensity: 0.32,
      roughness: 0.12,
      metalness: 0.22,
      transmission: useSoftGlass ? 0 : 0.38,
      thickness: useSoftGlass ? 0 : 0.32,
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: useSoftGlass ? 0.8 : 0.92,
      envMapIntensity: 1.65,
    });
    const beadMesh = new THREE.Mesh(beadGeo, beadMat);
    beadMesh.userData.nodeIndex = spec.index;

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfff5e2,
      emissive: STAGE_PALETTE.champagneGoldBright,
      emissiveIntensity: 0.84,
      roughness: 0.22,
      metalness: 0.32,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);

    const bezelMat = createChampagneGoldMaterial(mood, theme, 0.32);
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.rotation.x = Math.PI * 0.32;
    bezelMesh.userData.nodeIndex = spec.index;

    const glowMat = new THREE.SpriteMaterial({
      map: nodeGlowTex,
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(0.54, 0.54, 1);
    glowSprite.renderOrder = 5;

    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData.nodeIndex = spec.index;

    const labelHandle = createFloatingLabelSprite(spec.label, {
      width: spec.width,
      height: 50,
      worldHeight: 0.238,
    });
    labelHandle.sprite.material.depthTest = false;
    labelHandle.sprite.position.set(spec.labelOffset[0], spec.labelOffset[1], spec.labelOffset[2]);
    labelHandle.sprite.userData.nodeIndex = spec.index;
    labelHandle.sprite.renderOrder = 25;

    root.add(beadMesh, coreMesh, bezelMesh, glowSprite, hitMesh, labelHandle.sprite);
    labelHandles.push(labelHandle);
    pickTargets.push(hitMesh, beadMesh, bezelMesh, labelHandle.sprite);
    nodes.push({
      index: spec.index,
      beadMesh,
      beadMat,
      coreMesh,
      coreMat,
      bezelMesh,
      bezelMat,
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
  const pos = sampleMobiusSpine(EMBLEM_ANGLE_RAD, new THREE.Vector3());
  emblemGroup.position.copy(pos);
  parent.add(emblemGroup);

  const gemMat = new THREE.MeshStandardMaterial({
    color: 0xfff2d8,
    emissive: STAGE_PALETTE.champagneGoldBright,
    emissiveIntensity: 0.9,
    roughness: 0.16,
    metalness: 0.45,
  });
  const haloMat = createChampagneGoldMaterial(mood, theme, 0.42);
  const haloMesh = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.008, 8, 32), haloMat);

  const glowMat = new THREE.SpriteMaterial({
    map: nodeGlowTex,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.set(0.44, 0.44, 1);
  glowSprite.renderOrder = 5;

  const labelHandle = createFloatingLabelSprite('iNVTRY LOOP', {
    accent: true,
    width: 224,
    height: 50,
    worldHeight: 0.248,
  });
  labelHandle.sprite.material.depthTest = false;
  labelHandle.sprite.position.set(0.08, 0.24, 0.24);
  labelHandle.sprite.renderOrder = 26;

  emblemGroup.add(
    new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 0), gemMat),
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
  let prismPhase = 0;
  let manualScrubActive = false;
  let hoveredNodeIndex = -1;

  let parallaxTargetX = 0;
  let parallaxTargetY = 0;
  let parallaxCurrentX = 0;
  let parallaxCurrentY = 0;

  const raycaster = new THREE.Raycaster();
  const tmpNdc = new THREE.Vector2();
  const marbleAnchorOut = new THREE.Vector3();

  // Scratch vectors for allocation-free comet & particle updates
  const tmpC0 = new THREE.Vector3();
  const tmpC1 = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 0, 1);
  const tmpSide = new THREE.Vector3();
  const tmpBinorm = new THREE.Vector3();
  const tmpParticle = new THREE.Vector3();

  const nodeGlowTex = createNodeGlowTexture(96);
  const mobiusRig = buildMobiusSculptureRig(
    currentGlassRatio,
    currentMood,
    currentTheme,
    nodeGlowTex
  );
  const prismRig = buildCorePrismRig(currentGlassRatio, currentMood, currentTheme);
  group.add(mobiusRig.group, prismRig.pivot);

  const { nodes, pickTargets, labelHandles } = buildLoopNodes(
    mobiusRig.group,
    nodeGlowTex,
    currentMood,
    currentTheme
  );
  const emblemRig = buildEmblemRig(mobiusRig.group, nodeGlowTex, currentMood, currentTheme);
  labelHandles.push(emblemRig.labelHandle);

  const updateDynamicCometGeometry = (
    comet: DynamicCometMesh,
    headAngle: number,
    arcSpan: number,
    radiusScale: number
  ): void => {
    const ringVerts = COMET_RADIAL_SEGS + 1;
    const pos = comet.posArray;
    const startAngle = headAngle - arcSpan;

    for (let i = 0; i <= COMET_LENGTH_SEGS; i += 1) {
      const t = i / COMET_LENGTH_SEGS;
      const u = startAngle + t * arcSpan;
      sampleMobiusSpine(u, tmpC0);
      sampleMobiusSpine(u + 0.012, tmpC1);
      tmpTan.subVectors(tmpC1, tmpC0).normalize();

      tmpSide.crossVectors(tmpTan, tmpUp);
      if (tmpSide.lengthSq() < 1e-4) {
        tmpSide.set(1, 0, 0);
      } else {
        tmpSide.normalize();
      }
      tmpBinorm.crossVectors(tmpSide, tmpTan).normalize();

      const taper = (0.12 + 0.88 * Math.pow(t, 0.78)) * comet.maxRadius * radiusScale;

      for (let j = 0; j <= COMET_RADIAL_SEGS; j += 1) {
        const theta = (j / COMET_RADIAL_SEGS) * TWO_PI;
        const cosT = Math.cos(theta) * taper;
        const sinT = Math.sin(theta) * taper;
        const idx = (i * ringVerts + j) * 3;
        pos[idx] = tmpC0.x + tmpSide.x * cosT + tmpBinorm.x * sinT;
        pos[idx + 1] = tmpC0.y + tmpSide.y * cosT + tmpBinorm.y * sinT;
        pos[idx + 2] = tmpC0.z + tmpSide.z * cosT + tmpBinorm.z * sinT;
      }
    }

    const attr = comet.geo.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  };

  const syncGlassMaterials = (): void => {
    const g = currentGlassRatio;
    const isDark = currentTheme === 'dark';
    applySmokedGlassState(mobiusRig.glassMat, g, currentMood, currentTheme);
    applySmokedGlassState(prismRig.glassMat, g, currentMood, currentTheme);
    mobiusRig.spineCoreMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.24 : 0.18,
      isDark ? 0.5 : 0.34,
      g
    );
    const useSoftGlass = isSoftwareGlGlassFallback();
    for (const node of nodes) {
      node.beadMat.roughness = THREE.MathUtils.lerp(0.2, 0.05, g);
      if (useSoftGlass) {
        node.beadMat.transparent = true;
        node.beadMat.transmission = 0;
        node.beadMat.thickness = 0;
        node.beadMat.opacity = THREE.MathUtils.lerp(0.84, 0.58, g);
        node.beadMat.clearcoat = 1.0;
        node.beadMat.envMapIntensity = 1.65;
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

    applyGoldModeState(mobiusRig.edgeRailMat, currentMood, currentTheme, 0.36);
    applyGoldModeState(mobiusRig.innerVeinMat, currentMood, currentTheme, 0.28);
    applyGoldModeState(prismRig.meridianMat, currentMood, currentTheme, 0.34);
    applyGoldModeState(emblemRig.haloMat, currentMood, currentTheme, 0.42);

    mobiusRig.spineCoreMat.color.setHex(palette.railColor);
    mobiusRig.spineCoreMat.emissive.setHex(palette.railEmissive);

    prismRig.wireMat.color.setHex(palette.railColor);
    prismRig.wireMat.opacity = isDark ? 0.78 : 0.64;
    prismRig.nucleusMat.color.setHex(palette.coreColor);
    prismRig.nucleusMat.emissive.setHex(palette.coreEmissive);

    setMaterialBlending(mobiusRig.cometGlow.mat, nextBlending);
    setMaterialBlending(mobiusRig.cometCore.mat, nextBlending);
    setMaterialBlending(mobiusRig.flowMat, nextBlending);
    setMaterialBlending(emblemRig.glowMat, nextBlending);

    mobiusRig.cometGlow.mat.color.setHex(palette.cometGlow);
    mobiusRig.cometCore.mat.color.setHex(palette.cometCore);
    mobiusRig.flowMat.color.setHex(palette.particleColor);
    mobiusRig.flowMat.opacity = isDark ? 0.72 : 0.44;

    emblemRig.gemMat.color.setHex(palette.emblemGem);
    emblemRig.gemMat.emissive.setHex(palette.emblemEmissive);
    emblemRig.glowMat.color.setHex(palette.emblemGlow);
    emblemRig.glowMat.opacity = isDark ? 0.54 : 0.28;
    emblemRig.labelHandle.setHighlight(true, currentTheme);

    for (const node of nodes) {
      node.beadMat.color.setHex(palette.beadColor);
      node.beadMat.emissive.setHex(palette.beadEmissive);
      node.beadMat.iridescence = palette.beadIridescence;
      node.coreMat.color.setHex(palette.coreColor);
      node.coreMat.emissive.setHex(palette.coreEmissive);
      node.glowMat.color.setHex(palette.nodeGlow);
      setMaterialBlending(node.glowMat, nextBlending);
      applyGoldModeState(node.bezelMat, currentMood, currentTheme, 0.32);
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
      if (!reducedMotion) {
        node.beadMesh.rotation.y = elapsed * (0.45 + w * 0.4) + node.index * 0.9;
        node.beadMesh.rotation.z = Math.sin(elapsed * 0.7 + node.index) * 0.22;
      }
      node.coreMesh.scale.setScalar(0.92 + w * 0.24 + pulse * 0.08 + tapBoost);
      node.bezelMesh.scale.setScalar(1 + w * 0.24 + pulse * (0.04 + w * 0.06) + tapBoost * 1.15);
      node.bezelMesh.rotation.z = elapsed * (0.35 + w * 0.45) + node.index;

      node.beadMat.emissiveIntensity =
        (isDark ? 0.26 : 0.16) + w * (isDark ? 0.48 : 0.28) + tapBoost;
      node.coreMat.emissiveIntensity =
        (isDark ? 0.64 : 0.42) + w * (isDark ? 0.74 : 0.46) + tapBoost;
      node.bezelMat.emissiveIntensity =
        (isDark ? 0.26 : 0.16) + w * (isDark ? 0.56 : 0.34) + tapBoost;

      const glowScale = 0.48 + w * 0.36 + pulse * 0.06 + tapBoost * 0.55;
      node.glowSprite.scale.set(glowScale, glowScale, 1);
      node.glowMat.opacity =
        (isDark ? 0.28 : 0.16) + w * (isDark ? 0.46 : 0.24) + node.tapPulse * 0.24;

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

  const syncCometAndFlow = (
    dt: number,
    elapsed: number,
    reducedMotion: boolean,
    paused: boolean
  ): void => {
    const safeDt = Math.max(dt, 1e-4);
    const instantSpeed = Math.abs(shortestAngleDelta(lastOrbitAngle, orbitAngle)) / safeDt;
    lastOrbitAngle = orbitAngle;

    const speedLerp = reducedMotion ? 1 : 1 - Math.exp(-8 * dt);
    smoothedAngularSpeed += (instantSpeed - smoothedAngularSpeed) * speedLerp;

    const velocityFactor = THREE.MathUtils.clamp(smoothedAngularSpeed / 1.4, 0, 1);
    const breath = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 2.2);
    const isDark = currentTheme === 'dark';

    const arcSpan = COMET_ARC_RAD * (0.78 + velocityFactor * 0.28);
    updateDynamicCometGeometry(mobiusRig.cometGlow, orbitAngle, arcSpan, 0.96 + velocityFactor * 0.2);
    updateDynamicCometGeometry(mobiusRig.cometCore, orbitAngle, arcSpan * 0.94, 1.0);

    mobiusRig.cometGlow.mat.opacity =
      (isDark ? 0.46 : 0.24) + velocityFactor * (isDark ? 0.34 : 0.2) + breath * 0.08;
    mobiusRig.cometCore.mat.opacity =
      (isDark ? 0.72 : 0.4) + velocityFactor * (isDark ? 0.24 : 0.18) + breath * 0.06;

    // Advance 48 micro-particles smoothly along the continuous 4π Möbius surface flow
    if (!reducedMotion && !paused) {
      const seeds = mobiusRig.flowSeeds;
      const pos = mobiusRig.flowPositions;
      for (let i = 0; i < FLOW_PARTICLE_COUNT; i += 1) {
        const u = (seeds[i * 3] + elapsed * seeds[i * 3 + 2]) % FOUR_PI;
        const vFrac = seeds[i * 3 + 1];
        const hover = 0.075 + 0.03 * Math.sin(elapsed * 1.4 + i);
        sampleMobiusSurfacePoint(u, getMobiusHalfWidth(u) * vFrac, hover, tmpParticle);
        pos[i * 3] = tmpParticle.x;
        pos[i * 3 + 1] = tmpParticle.y;
        pos[i * 3 + 2] = tmpParticle.z;
      }
      const pAttr = mobiusRig.flowPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      pAttr.needsUpdate = true;
    }
  };

  // Initialize comet geometry once before first frame
  updateDynamicCometGeometry(mobiusRig.cometGlow, orbitAngle, COMET_ARC_RAD, 1);
  updateDynamicCometGeometry(mobiusRig.cometCore, orbitAngle, COMET_ARC_RAD * 0.94, 1);

  /* ------------------------------------------------------------------------
   * StageModule Lifecycle Methods
   * ------------------------------------------------------------------------ */

  const getMarbleAnchor = (_elapsed: number, state: StageInteractionState): THREE.Vector3 => {
    const activeAngle =
      !manualScrubActive && state.aboutSubtab !== 'journey' && state.aboutLoopPaused
        ? getLoopNodeAngle(state.aboutLoopIndex)
        : orbitAngle;

    mobiusRig.group.updateMatrixWorld();
    sampleMobiusSpine(activeAngle, marbleAnchorOut);
    return marbleAnchorOut.applyMatrix4(mobiusRig.group.matrixWorld);
  };

  const onEnter = (ctx: StageContext): void => {
    currentGlassRatio = ctx.glassRatio;
    currentMood = ctx.mood;
    currentTheme = ctx.theme;
    manualScrubActive = false;
    hoveredNodeIndex = -1;
    parallaxTargetX = 0;
    parallaxTargetY = 0;
    parallaxCurrentX = 0;
    parallaxCurrentY = 0;

    orbitAngle =
      ctx.interaction.aboutSubtab === 'journey'
        ? getJourneyCutAngle(ctx.interaction.aboutJourneyIndex)
        : getLoopNodeAngle(ctx.interaction.aboutLoopIndex);
    lastOrbitAngle = orbitAngle;
    smoothedAngularSpeed = 0;

    syncVisualMaterials();
    syncNodeHighlights(resolveActiveNodeIndex(ctx.interaction), 1, 0, true);
    syncCometAndFlow(0.016, 0, true, false);
  };

  const onExit = (_ctx: StageContext): void => {
    manualScrubActive = false;
    hoveredNodeIndex = -1;
    parallaxTargetX = 0;
    parallaxTargetY = 0;
  };

  const onGlassChange = (glassRatio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(glassRatio, 0, 1);
    if (!isDisposed) syncGlassMaterials();
  };

  const onVisualModeChange = (mood: MoodMode, theme: ThemeMode): void => {
    currentMood = mood;
    currentTheme = theme;
    if (!isDisposed) syncVisualMaterials();
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
    parallaxTargetX = THREE.MathUtils.clamp(ndcX, -1, 1) * 0.14;
    parallaxTargetY = THREE.MathUtils.clamp(ndcY, -1, 1) * 0.1;
    hoveredNodeIndex = raycastLoopNode(ndcX, ndcY, ctx.camera);
  };

  const onPointerDrag = (deltaX: number, deltaY: number, ctx: StageContext): void => {
    if (Math.abs(deltaX) < 1e-4 && Math.abs(deltaY) < 1e-4) return;
    manualScrubActive = true;
    orbitAngle = (orbitAngle + deltaX * DRAG_SCRUB_RAD_PER_UNIT + TWO_PI) % TWO_PI;

    const nearest = findNearestLoopNodeIndex(orbitAngle);
    if (ctx.interaction.aboutSubtab === 'journey') {
      const normalized = ((orbitAngle + Math.PI * 0.45) % TWO_PI + TWO_PI) % TWO_PI;
      const cutIdx = Math.min(5, Math.floor((normalized / TWO_PI) * 6));
      if (cutIdx !== ctx.interaction.aboutJourneyIndex) {
        ctx.emitUiSync({ aboutJourneyIndex: cutIdx });
      }
    } else if (nearest !== ctx.interaction.aboutLoopIndex || !ctx.interaction.aboutLoopPaused) {
      ctx.emitUiSync({ aboutLoopIndex: nearest, aboutLoopPaused: true });
    }
  };

  const onPointerTap = (ndcX: number, ndcY: number, ctx: StageContext): void => {
    const hitIndex = raycastLoopNode(ndcX, ndcY, ctx.camera);
    if (hitIndex < 0) {
      if (ctx.interaction.aboutSubtab !== 'journey') {
        manualScrubActive = false;
        ctx.emitUiSync({ aboutLoopPaused: !ctx.interaction.aboutLoopPaused });
      }
      return;
    }

    manualScrubActive = false;
    nodes[hitIndex].tapPulse = 1;
    if (ctx.interaction.aboutSubtab === 'journey') {
      ctx.emitUiSync({ aboutJourneyIndex: hitIndex % 6 });
    } else {
      ctx.emitUiSync({ aboutLoopIndex: hitIndex, aboutLoopPaused: true });
    }
  };

  const update = (dt: number, elapsed: number, ctx: StageContext): void => {
    if (isDisposed) return;

    const state = ctx.interaction;
    const dampFactor = ctx.reducedMotion ? 1 : 1 - Math.exp(-7.2 * dt);

    // 1. Sync orbital angle to active About subtab (`journey` / `mission` / `founder` / `connect`)
    if (!manualScrubActive) {
      if (state.aboutSubtab === 'journey') {
        orbitAngle +=
          shortestAngleDelta(orbitAngle, getJourneyCutAngle(state.aboutJourneyIndex)) * dampFactor;
      } else if (!state.aboutLoopPaused) {
        if (!ctx.reducedMotion) {
          orbitAngle +=
            dt * (state.aboutSubtab === 'mission' ? MISSION_ORBIT_SPEED : FOUNDER_ORBIT_SPEED);
        }
      } else {
        orbitAngle +=
          shortestAngleDelta(orbitAngle, getLoopNodeAngle(state.aboutLoopIndex)) * dampFactor;
      }
    }

    // 2. Subtle pointer parallax & calm sculpture levitation
    const parallaxDamp = ctx.reducedMotion ? 1 : 1 - Math.exp(-6 * dt);
    parallaxCurrentX += (parallaxTargetX - parallaxCurrentX) * parallaxDamp;
    parallaxCurrentY += (parallaxTargetY - parallaxCurrentY) * parallaxDamp;

    group.position.y = 0.04 + (ctx.reducedMotion ? 0 : Math.sin(elapsed * 0.85) * 0.032);
    const breatheTilt = ctx.reducedMotion ? 0 : Math.sin(elapsed * 0.58) * 0.022;

    mobiusRig.group.rotation.x = BASE_SCULPTURE_TILT_X + parallaxCurrentY + breatheTilt;
    mobiusRig.group.rotation.y = parallaxCurrentX * 0.85;
    mobiusRig.group.rotation.z = BASE_SCULPTURE_TILT_Z - parallaxCurrentX * 0.42;

    // 3. Central suspended crystal prism gentle rotation (halts when paused)
    if (!state.aboutLoopPaused && !ctx.reducedMotion) {
      const isCalmSubtab = state.aboutSubtab === 'founder' || state.aboutSubtab === 'connect';
      prismPhase += dt * (isCalmSubtab ? 0.26 : 0.42);
      prismRig.meridianMesh.rotation.z += dt * (isCalmSubtab ? 0.14 : 0.24);
    }
    prismRig.pivot.position.y = 0.08 + (ctx.reducedMotion ? 0 : Math.sin(elapsed * 1.15) * 0.045);
    prismRig.crystalGroup.rotation.y = prismPhase;
    prismRig.crystalGroup.rotation.x = Math.sin(prismPhase * 0.65) * 0.14 + parallaxCurrentY * 0.9;
    prismRig.crystalGroup.rotation.z = Math.cos(prismPhase * 0.5) * 0.1 - parallaxCurrentX * 0.8;

    // 4. Sync wave-hugging comet trail, 4π flow particles, 5 nodes & `iNVTRY LOOP` emblem
    syncCometAndFlow(dt, elapsed, ctx.reducedMotion, state.aboutLoopPaused);
    syncNodeHighlights(resolveActiveNodeIndex(state), dt, elapsed, ctx.reducedMotion);

    const emblemPulse = ctx.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 2.1);
    emblemRig.gemMat.emissiveIntensity =
      (currentTheme === 'dark' ? 0.78 : 0.48) + emblemPulse * 0.24;
    emblemRig.haloMesh.rotation.z = -elapsed * 0.3;

    // 5. Continuously guide the shared gold marble along the sculpted Möbius spine
    ctx.marbleMesh.position.copy(getMarbleAnchor(elapsed, state));
  };

  const dispose = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    for (const handle of labelHandles) {
      handle.dispose();
    }
    disposeObject3D(group);
  };

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
