/**
 * studioStage.ts
 * ---------------------------------------------------------------------------
 * Studio 3D Stage Module for ainvtry.com (Three.js 0.187 WebGL2)
 *
 * Implements the luxury editorial 3D fitting showcase:
 * 1. Layered frosted-crystal circular turntable pedestal (y = -1.25) with
 *    chamfered champagne-gold upper/lower rims, luminous inner studio disc,
 *    and soft ground contact shadow.
 * 2. Dual 360° counter-rotating tilted champagne-gold orbital rings with
 *    specular glint nodes and 48 lightweight floating starlight dust points.
 * 3. High-resolution 20-bone skinned anatomical mannequin & tailored double-
 *    breasted charcoal wool overcoat GLB (`/assets/models/studio-mannequin-v1.glb`,
 *    CC0 MakeHuman base, baked ray-traced studio vertex AO, procedural wool-twill
 *    micro-weave bump PBR, real Stand / Walk / Rain skeletal choreography,
 *    translucent smoked-glass champagne umbrella, and 3D raindrop streaks).
 * 4. Curved front champagne-gold 360° dial track (radius 2.08, y = -1.32)
 *    with reusable glowing marble controller synced to turntable rotation.
 *
 * Preloads on stage construction so the sculpted 3D model is ready the instant
 * the marble enters Studio, with SSR / headless Node test safety.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
  createSmokedGlassMaterial,
  disposeObject3D,
} from './stageMaterials.ts';

/* ==========================================================================
 * 1. Stage Spatial & Animation Constants
 * ========================================================================== */

const STUDIO_MANNEQUIN_GLB_URL = '/assets/models/studio-mannequin-v1.glb';
const MANNEQUIN_WORLD_SCALE = 1.44; // 1.615m anatomical mesh -> ~2.33 world units on turntable

const PEDESTAL_Y = -1.25;
const PEDESTAL_RADIUS = 1.58;
const PEDESTAL_HEIGHT = 0.18;
const PEDESTAL_TOP_Y = PEDESTAL_Y + PEDESTAL_HEIGHT * 0.5; // -1.16

const DIAL_Y = -1.32;
const DIAL_RADIUS = 2.08;
const DIAL_ARC = Math.PI * 0.78;
const DIAL_MAX_PHI = DIAL_ARC * 0.46;
const MARBLE_REST_OFFSET_Y = 0.2; // Marble radius (0.18) + rail crown (0.02)

const STARLIGHT_COUNT = 48;
const RAIN_COUNT = 96;
const RAIN_COLUMN_RADIUS = 1.78;
const RAIN_TOP_Y = 2.65;
const RAIN_BOTTOM_Y = PEDESTAL_TOP_Y + 0.04;
const UMBRELLA_DEFLECT_RADIUS = 0.92;
const UMBRELLA_DEFLECT_Y = 1.72;

export interface StudioStageOptions {
  readonly onModelLoaded?: () => void;
}

/* ==========================================================================
 * 2. SSR-Safe Procedural Canvas Textures (Zero External Network Fetches)
 * ========================================================================== */

function createFallbackTexture(rgba: [number, number, number, number]): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial floor contact shadow beneath pedestal and Chelsea boots. */
function createRadialShadowTexture(size = 128): THREE.Texture {
  if (typeof document === 'undefined') {
    return createFallbackTexture([0, 0, 0, 140]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(6, 6, 10, 0.88)');
    grad.addColorStop(0.42, 'rgba(6, 6, 10, 0.56)');
    grad.addColorStop(0.75, 'rgba(8, 8, 12, 0.20)');
    grad.addColorStop(1.0, 'rgba(8, 8, 12, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Luminous frosted crystal radial sheen texture inside the glass turntable disc. */
function createFrostedMirrorTexture(size = 256): THREE.Texture {
  if (typeof document === 'undefined') {
    return createFallbackTexture([215, 210, 204, 190]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half * 0.78, half * 0.72, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 252, 246, 0.94)');
    grad.addColorStop(0.32, 'rgba(224, 219, 214, 0.62)');
    grad.addColorStop(0.72, 'rgba(154, 150, 152, 0.32)');
    grad.addColorStop(0.94, 'rgba(244, 232, 212, 0.54)');
    grad.addColorStop(1.0, 'rgba(244, 232, 212, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Procedural diagonal worsted wool-twill micro-weave bump map for luxury tailoring. */
function createWoolWeaveBumpTexture(size = 256): THREE.Texture {
  if (typeof document === 'undefined') {
    return createFallbackTexture([128, 128, 128, 255]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Fine 2/2 diagonal twill rib + subtle organic wool nap grain
        const twill = (x + y) % 8 < 4 ? 14 : -14;
        const weft = (x % 4 === 0 ? 5 : -3) + (y % 4 === 0 ? 4 : -2);
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const grain = (hash - Math.floor(hash) - 0.5) * 20;
        const v = Math.max(0, Math.min(255, Math.round(128 + twill + weft + grain)));
        const off = (y * size + x) * 4;
        data[off] = v;
        data[off + 1] = v;
        data[off + 2] = v;
        data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.needsUpdate = true;
  return tex;
}

/** Delicate 4-point champagne starlight sparkle sprite texture. */
function createStarlightTexture(size = 64): THREE.Texture {
  if (typeof document === 'undefined') {
    return createFallbackTexture([235, 214, 176, 220]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const radial = ctx.createRadialGradient(half, half, 0, half, half, half);
    radial.addColorStop(0.0, 'rgba(255, 252, 244, 1.0)');
    radial.addColorStop(0.24, 'rgba(244, 226, 192, 0.72)');
    radial.addColorStop(0.6, 'rgba(214, 184, 137, 0.16)');
    radial.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255, 250, 240, 0.85)';
    ctx.beginPath();
    ctx.ellipse(half, half, half * 0.84, size * 0.032, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(half, half, size * 0.032, half * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ==========================================================================
 * 3. Circular Frosted-Crystal Turntable Pedestal Builder
 * ========================================================================== */

interface PedestalRig {
  readonly group: THREE.Group;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly rimMat: THREE.MeshStandardMaterial;
  readonly mirrorMat: THREE.MeshPhysicalMaterial;
  readonly baseCoreMat: THREE.MeshStandardMaterial;
  readonly shadowMat: THREE.MeshBasicMaterial;
}

function buildTurntablePedestal(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): PedestalRig {
  const group = new THREE.Group();
  group.name = 'studio-turntable-pedestal';
  group.position.set(0, PEDESTAL_Y, 0);

  // Main layered frosted-crystal cylinder
  const glassGeo = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS,
    PEDESTAL_RADIUS + 0.025,
    PEDESTAL_HEIGHT,
    64,
    1,
    false
  );
  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // Architectural inner core plate so turntable retains crisp visual presence at 100% Glass
  const baseCoreGeo = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS - 0.07,
    PEDESTAL_RADIUS - 0.05,
    0.045,
    48
  );
  const baseCoreMat = new THREE.MeshStandardMaterial({
    color: 0x26252c,
    roughness: 0.34,
    metalness: 0.42,
    transparent: true,
    opacity: 0.56,
  });
  const baseCoreMesh = new THREE.Mesh(baseCoreGeo, baseCoreMat);
  baseCoreMesh.position.y = -PEDESTAL_HEIGHT * 0.28;
  group.add(baseCoreMesh);

  // Luminous frosted studio reflector disc right beneath top bevel (matches luxury crystal turntable)
  const mirrorTex = createFrostedMirrorTexture(256);
  const mirrorGeo = new THREE.CircleGeometry(PEDESTAL_RADIUS - 0.032, 64);
  mirrorGeo.rotateX(-Math.PI * 0.5);
  const mirrorMat = new THREE.MeshPhysicalMaterial({
    color: 0xbcb6ae,
    emissive: 0x3b3730,
    emissiveIntensity: 0.3,
    map: mirrorTex,
    roughness: 0.2,
    metalness: 0.24,
    clearcoat: 0.95,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.01;
  mirrorMesh.renderOrder = 1;
  group.add(mirrorMesh);

  // Chamfered metallic champagne-gold upper, lower & inner bezel rims
  const rimMat = createChampagneGoldMaterial(mood, theme, 0.34);

  const upperRimGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS, 0.021, 14, 72);
  upperRimGeo.rotateX(Math.PI * 0.5);
  const upperRimMesh = new THREE.Mesh(upperRimGeo, rimMat);
  upperRimMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.004;
  group.add(upperRimMesh);

  const lowerRimGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS + 0.025, 0.023, 14, 72);
  lowerRimGeo.rotateX(Math.PI * 0.5);
  const lowerRimMesh = new THREE.Mesh(lowerRimGeo, rimMat);
  lowerRimMesh.position.y = -PEDESTAL_HEIGHT * 0.5 + 0.004;
  group.add(lowerRimMesh);

  const innerBezelGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS - 0.2, 0.006, 10, 64);
  innerBezelGeo.rotateX(Math.PI * 0.5);
  const innerBezelMesh = new THREE.Mesh(innerBezelGeo, rimMat);
  innerBezelMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.005;
  group.add(innerBezelMesh);

  // Soft dark contact shadow plane beneath the pedestal
  const shadowTex = createRadialShadowTexture(128);
  const shadowGeo = new THREE.PlaneGeometry(4.45, 4.45);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: 0x050508,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = -PEDESTAL_HEIGHT * 0.5 - 0.018;
  group.add(shadowMesh);

  return { group, glassMat, rimMat, mirrorMat, baseCoreMat, shadowMat };
}

/* ==========================================================================
 * 4. Dual 360° Tilted Orbital Rings & Starlight Dust Builder
 * ========================================================================== */

interface OrbitalRig {
  readonly group: THREE.Group;
  readonly outerPivot: THREE.Group;
  readonly innerPivot: THREE.Group;
  readonly outerSpin: THREE.Group;
  readonly innerSpin: THREE.Group;
  readonly ringMat: THREE.MeshStandardMaterial;
  readonly sparkMat: THREE.MeshStandardMaterial;
}

function buildOrbitalSystem(mood: MoodMode, theme: ThemeMode): OrbitalRig {
  const group = new THREE.Group();
  group.name = 'studio-orbital-rings';
  group.position.set(0, 0.06, 0);

  const ringMat = createChampagneGoldMaterial(mood, theme, 0.34);
  const sparkMat = createChampagneGoldMaterial(mood, theme, 0.92);

  // Outer sculpted orbital ring (~1.86 radius)
  const outerPivot = new THREE.Group();
  outerPivot.rotation.set(Math.PI * 0.41, 0.22, -0.34);
  const outerSpin = new THREE.Group();
  const outerGeo = new THREE.TorusGeometry(1.86, 0.0105, 12, 96);
  outerSpin.add(new THREE.Mesh(outerGeo, ringMat));

  const outerNodeGeo = new THREE.SphereGeometry(0.026, 12, 10);
  const outerNodeA = new THREE.Mesh(outerNodeGeo, sparkMat);
  outerNodeA.position.set(1.86, 0, 0);
  outerSpin.add(outerNodeA);

  const outerNodeB = new THREE.Mesh(outerNodeGeo, sparkMat);
  outerNodeB.position.set(-1.86, 0, 0);
  outerNodeB.scale.setScalar(0.72);
  outerSpin.add(outerNodeB);

  outerPivot.add(outerSpin);
  group.add(outerPivot);

  // Inner counter-tilted orbital ring (~1.66 radius)
  const innerPivot = new THREE.Group();
  innerPivot.rotation.set(Math.PI * 0.45, -0.26, 0.36);
  const innerSpin = new THREE.Group();
  const innerGeo = new THREE.TorusGeometry(1.66, 0.009, 12, 96);
  innerSpin.add(new THREE.Mesh(innerGeo, ringMat));

  const innerNodeGeo = new THREE.SphereGeometry(0.022, 12, 10);
  const innerNode = new THREE.Mesh(innerNodeGeo, sparkMat);
  innerNode.position.set(0, 1.66, 0);
  innerSpin.add(innerNode);

  innerPivot.add(innerSpin);
  group.add(innerPivot);

  return { group, outerPivot, innerPivot, outerSpin, innerSpin, ringMat, sparkMat };
}

interface StarlightSeed {
  readonly baseRadius: number;
  readonly baseAngle: number;
  readonly baseY: number;
  readonly orbitSpeed: number;
  readonly bobAmp: number;
  readonly phase: number;
}

interface StarlightRig {
  readonly points: THREE.Points;
  readonly material: THREE.PointsMaterial;
  readonly positions: Float32Array;
  readonly positionAttr: THREE.BufferAttribute;
  readonly seeds: readonly StarlightSeed[];
}

function buildStarlightDust(): StarlightRig {
  const positions = new Float32Array(STARLIGHT_COUNT * 3);
  const seeds: StarlightSeed[] = [];

  const goldenAngle = 2.3999632297;
  for (let i = 0; i < STARLIGHT_COUNT; i++) {
    const t = (i + 0.5) / STARLIGHT_COUNT;
    const baseRadius = 0.78 + ((i * 37) % 19) * 0.078;
    const baseAngle = i * goldenAngle;
    const baseY = -0.82 + t * 2.28 + Math.sin(i * 1.7) * 0.14;
    const orbitSpeed = (i % 2 === 0 ? 1 : -1) * (0.08 + (i % 5) * 0.025);
    const bobAmp = 0.03 + (i % 4) * 0.018;
    const phase = i * 0.83;

    seeds.push({ baseRadius, baseAngle, baseY, orbitSpeed, bobAmp, phase });

    positions[i * 3] = Math.cos(baseAngle) * baseRadius;
    positions[i * 3 + 1] = baseY;
    positions[i * 3 + 2] = Math.sin(baseAngle) * baseRadius;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttr);

  const sparkleTex = createStarlightTexture(64);
  const material = new THREE.PointsMaterial({
    size: 0.11,
    map: sparkleTex,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'studio-starlight-dust';
  return { points, material, positions, positionAttr, seeds };
}

/* ==========================================================================
 * 5. Sculpted 20-Bone Skinned GLB Mannequin & Smoked-Glass Umbrella Builder
 * ========================================================================== */

interface UmbrellaRig {
  readonly group: THREE.Group;
  readonly canopyMat: THREE.MeshPhysicalMaterial;
  readonly goldMat: THREE.MeshStandardMaterial;
  readonly gripMat: THREE.MeshStandardMaterial;
}

function buildUmbrella(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): UmbrellaRig {
  const group = new THREE.Group();
  group.name = 'studio-champagne-umbrella';
  group.visible = false;

  const goldMat = createChampagneGoldMaterial(mood, theme, 0.34);
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x18181d,
    roughness: 0.42,
    metalness: 0.25,
  });

  // Sculpted handle grip resting cleanly inside the right hand palm
  const gripGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.17, 14);
  const gripMesh = new THREE.Mesh(gripGeo, gripMat);
  gripMesh.position.y = -0.02;
  group.add(gripMesh);

  const pommelGeo = new THREE.SphereGeometry(0.022, 12, 10);
  const pommelMesh = new THREE.Mesh(pommelGeo, goldMat);
  pommelMesh.position.y = -0.105;
  group.add(pommelMesh);

  // Slim metallic champagne shaft extending cleanly above the 2.33u sculpted head to the canopy apex
  const canopyRadius = 0.98;
  const canopyPhi = Math.PI * 0.4;
  const canopyScaleY = 0.62;
  const canopyHolderY = 0.98;
  const apexLocalY = canopyRadius * canopyScaleY;
  const shaftTopY = canopyHolderY + apexLocalY;
  const shaftBottomY = 0.04;
  const shaftLength = shaftTopY - shaftBottomY;

  const shaftGeo = new THREE.CylinderGeometry(0.01, 0.011, shaftLength, 12);
  const shaftMesh = new THREE.Mesh(shaftGeo, goldMat);
  shaftMesh.position.y = shaftBottomY + shaftLength * 0.5;
  group.add(shaftMesh);

  const runnerGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.045, 14);
  const runnerMesh = new THREE.Mesh(runnerGeo, goldMat);
  runnerMesh.position.y = shaftTopY - 0.16;
  group.add(runnerMesh);

  const canopyHolder = new THREE.Group();
  canopyHolder.position.y = canopyHolderY;
  group.add(canopyHolder);

  // Translucent smoked-glass hemispheric dome
  const canopyGeo = new THREE.SphereGeometry(
    canopyRadius,
    32,
    16,
    0,
    Math.PI * 2,
    0,
    canopyPhi
  );
  canopyGeo.scale(1, canopyScaleY, 1);
  const canopyMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  canopyMat.side = THREE.DoubleSide;
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.renderOrder = 4;
  canopyHolder.add(canopyMesh);

  // 8 sculptural champagne-gold exterior ribs following the dome profile
  const ribGeo = new THREE.TorusGeometry(canopyRadius + 0.004, 0.006, 6, 20, canopyPhi);
  ribGeo.rotateZ(Math.PI * 0.5 - canopyPhi);
  ribGeo.scale(1, canopyScaleY, 1);

  for (let i = 0; i < 8; i++) {
    const ribMesh = new THREE.Mesh(ribGeo, goldMat);
    ribMesh.rotation.y = (i * Math.PI) / 4;
    canopyHolder.add(ribMesh);
  }

  // Delicate outer perimeter trim ring along canopy lower edge
  const rimRadius = canopyRadius * Math.sin(canopyPhi);
  const rimY = canopyRadius * Math.cos(canopyPhi) * canopyScaleY;
  const canopyRimGeo = new THREE.TorusGeometry(rimRadius, 0.0075, 8, 48);
  canopyRimGeo.rotateX(Math.PI * 0.5);
  const canopyRimMesh = new THREE.Mesh(canopyRimGeo, goldMat);
  canopyRimMesh.position.y = rimY;
  canopyHolder.add(canopyRimMesh);

  // Tapered gold top finial ferrule
  const finialGeo = new THREE.ConeGeometry(0.018, 0.11, 12);
  const finialMesh = new THREE.Mesh(finialGeo, goldMat);
  finialMesh.position.y = apexLocalY + 0.048;
  canopyHolder.add(finialMesh);

  return { group, canopyMat, goldMat, gripMat };
}

type RigBoneName =
  | 'pelvis'
  | 'spine3'
  | 'spine2'
  | 'spine1'
  | 'neck'
  | 'head'
  | 'clavicleL'
  | 'shoulderL'
  | 'elbowL'
  | 'handL'
  | 'clavicleR'
  | 'shoulderR'
  | 'elbowR'
  | 'handR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR';

type RigBoneMap = Partial<Record<RigBoneName, THREE.Bone>>;

interface FigureMaterials {
  readonly porcelainMat: THREE.MeshPhysicalMaterial;
  readonly hairMat: THREE.MeshPhysicalMaterial;
  readonly coatMat: THREE.MeshPhysicalMaterial;
  readonly knitMat: THREE.MeshPhysicalMaterial;
  readonly trouserMat: THREE.MeshPhysicalMaterial;
  readonly shoeMat: THREE.MeshPhysicalMaterial;
  readonly footShadowMat: THREE.MeshBasicMaterial;
  readonly loadingHaloMat: THREE.MeshBasicMaterial;
  readonly woolBumpTex: THREE.Texture;
}

interface SkinnedFigureRig {
  readonly root: THREE.Group;
  readonly modelSlot: THREE.Group;
  readonly loadingHalo: THREE.Mesh;
  readonly umbrella: UmbrellaRig;
  readonly materials: FigureMaterials;
  bones: RigBoneMap;
  loadedModel: THREE.Object3D | null;
  loadFade: number;
  isLoaded: boolean;
}

function buildSkinnedFigureRig(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): SkinnedFigureRig {
  const root = new THREE.Group();
  root.name = 'studio-fitting-figure';

  const woolBumpTex = createWoolWeaveBumpTexture(256);

  // Luxury editorial PBR materials calibrated with baked studio vertex AO (`vertexColors: true`)
  const porcelainMat = new THREE.MeshPhysicalMaterial({
    color: 0xdcc4ae,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.02,
    sheen: 0.28,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffe9d4),
  });

  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b1a20,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.04,
    sheen: 0.32,
    sheenRoughness: 0.64,
    sheenColor: new THREE.Color(0x63606e),
    side: THREE.DoubleSide,
  });

  const coatMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d1e24,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.03,
    sheen: 0.74,
    sheenRoughness: 0.56,
    sheenColor: new THREE.Color(0xa69b8d),
    bumpMap: woolBumpTex,
    bumpScale: 0.0045,
    side: THREE.DoubleSide,
  });

  const knitMat = new THREE.MeshPhysicalMaterial({
    color: 0x111116,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    sheen: 0.42,
    sheenRoughness: 0.78,
    sheenColor: new THREE.Color(0x6c6864),
    bumpMap: woolBumpTex,
    bumpScale: 0.006,
  });

  const trouserMat = new THREE.MeshPhysicalMaterial({
    color: 0x17181e,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.03,
    sheen: 0.54,
    sheenRoughness: 0.66,
    sheenColor: new THREE.Color(0x88817a),
    bumpMap: woolBumpTex,
    bumpScale: 0.003,
    side: THREE.DoubleSide,
  });

  const shoeMat = new THREE.MeshPhysicalMaterial({
    color: 0x121216,
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.14,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
  });

  // Soft boot contact shadow grounding shoes firmly onto the frosted crystal turntable
  const footShadowTex = createRadialShadowTexture(64);
  const footShadowGeo = new THREE.PlaneGeometry(0.92, 0.72);
  footShadowGeo.rotateX(-Math.PI * 0.5);
  const footShadowMat = new THREE.MeshBasicMaterial({
    map: footShadowTex,
    color: 0x050508,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const footShadowMesh = new THREE.Mesh(footShadowGeo, footShadowMat);
  footShadowMesh.position.set(0, 0.004, 0.04);
  root.add(footShadowMesh);

  // Subtle luminous champagne atelier halo shown only during the ~150ms GLB stream-in
  const loadingHaloGeo = new THREE.RingGeometry(0.42, 0.455, 48);
  loadingHaloGeo.rotateX(-Math.PI * 0.5);
  const loadingHaloMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const loadingHalo = new THREE.Mesh(loadingHaloGeo, loadingHaloMat);
  loadingHalo.position.set(0, 0.025, 0);
  root.add(loadingHalo);

  // Dedicated mount slot for the loaded 20-bone skinned GLB hierarchy
  const modelSlot = new THREE.Group();
  modelSlot.name = 'studio-glb-mannequin-slot';
  modelSlot.scale.setScalar(MANNEQUIN_WORLD_SCALE);
  root.add(modelSlot);

  // Translucent smoked-glass umbrella mounted directly in figure.root space
  // and synced each frame to the exact world-transformed palm of `bones.handR`
  const umbrella = buildUmbrella(glassRatio, mood, theme);
  root.add(umbrella.group);

  return {
    root,
    modelSlot,
    loadingHalo,
    umbrella,
    materials: {
      porcelainMat,
      hairMat,
      coatMat,
      knitMat,
      trouserMat,
      shoeMat,
      footShadowMat,
      loadingHaloMat,
      woolBumpTex,
    },
    bones: {},
    loadedModel: null,
    loadFade: 0,
    isLoaded: false,
  };
}

function assignMannequinMaterials(
  sceneRoot: THREE.Object3D,
  materials: FigureMaterials,
  bonesOut: RigBoneMap
): void {
  sceneRoot.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      bonesOut[bone.name as RigBoneName] = bone;
      return;
    }

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh || (obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.frustumCulled = false;

      // Dispose default GLB material before binding our luxury editorial PBR materials
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose();
      } else if (mesh.material) {
        mesh.material.dispose();
      }

      switch (mesh.name) {
        case 'mannequin_body':
          mesh.material = materials.porcelainMat;
          break;
        case 'mannequin_hair':
          mesh.material = materials.hairMat;
          break;
        case 'garment_coat':
          mesh.material = materials.coatMat;
          break;
        case 'garment_knit':
          mesh.material = materials.knitMat;
          break;
        case 'garment_slacks':
          mesh.material = materials.trouserMat;
          break;
        case 'garment_shoes':
          mesh.material = materials.shoeMat;
          break;
        default:
          mesh.material = materials.coatMat;
          break;
      }
    }
  });
}

/* ==========================================================================
 * 6. 3D Diagonal Raindrop Streaks Builder (`THREE.LineSegments`)
 * ========================================================================== */

interface RainDropSeed {
  x: number;
  y: number;
  z: number;
  readonly speed: number;
  readonly streakLength: number;
}

interface RainRig {
  readonly lines: THREE.LineSegments;
  readonly material: THREE.LineBasicMaterial;
  readonly positions: Float32Array;
  readonly positionAttr: THREE.BufferAttribute;
  readonly drops: RainDropSeed[];
}

function buildRainStreaks(): RainRig {
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  const drops: RainDropSeed[] = [];

  const goldenAngle = 2.3999632297;
  for (let i = 0; i < RAIN_COUNT; i++) {
    const radialNorm = Math.sqrt(((i * 29 + 7) % RAIN_COUNT) / RAIN_COUNT);
    const radius = 0.16 + radialNorm * RAIN_COLUMN_RADIUS;
    const angle = i * goldenAngle;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = RAIN_BOTTOM_Y + (((i * 53) % RAIN_COUNT) / RAIN_COUNT) * (RAIN_TOP_Y - RAIN_BOTTOM_Y);
    const speed = 3.8 + (i % 7) * 0.32;
    const streakLength = 0.16 + (i % 5) * 0.032;

    drops.push({ x, y, z, speed, streakLength });
    writeRainSegment(positions, i, x, y, z, streakLength);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttr);

  const material = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'studio-rain-streaks';
  lines.visible = false;

  return { lines, material, positions, positionAttr, drops };
}

function writeRainSegment(
  positions: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  length: number
): void {
  const base = index * 6;
  const dx = -0.18 * length;
  const dy = -1.0 * length;
  const dz = 0.04 * length;
  positions[base] = x;
  positions[base + 1] = y;
  positions[base + 2] = z;
  positions[base + 3] = x + dx;
  positions[base + 4] = y + dy;
  positions[base + 5] = z + dz;
}

/* ==========================================================================
 * 7. Curved Front Champagne-Gold 360° Dial Track Builder
 * ========================================================================== */

interface DialTrackRig {
  readonly group: THREE.Group;
  readonly bandMat: THREE.MeshStandardMaterial;
  readonly railGlowMat: THREE.MeshStandardMaterial;
}

function buildDialTrack(mood: MoodMode, theme: ThemeMode): DialTrackRig {
  const group = new THREE.Group();
  group.name = 'studio-dial-track';
  group.position.set(0, DIAL_Y, 0);

  const bandMat = createChampagneGoldMaterial(mood, theme, 0.28);
  const railGlowMat = createChampagneGoldMaterial(mood, theme, 0.62);

  const alignHorizontalFront = (geo: THREE.BufferGeometry) => {
    geo.rotateX(Math.PI * 0.5);
    geo.rotateY(DIAL_ARC * 0.5 - Math.PI * 0.5);
  };

  const bandGeo = new THREE.TorusGeometry(DIAL_RADIUS, 0.04, 14, 72, DIAL_ARC);
  alignHorizontalFront(bandGeo);
  bandGeo.scale(1, 0.34, 1);
  const bandMesh = new THREE.Mesh(bandGeo, bandMat);
  group.add(bandMesh);

  const railGeo = new THREE.TorusGeometry(DIAL_RADIUS, 0.0095, 8, 72, DIAL_ARC);
  alignHorizontalFront(railGeo);
  const railMesh = new THREE.Mesh(railGeo, railGlowMat);
  railMesh.position.y = 0.013;
  group.add(railMesh);

  const finialGeo = new THREE.SphereGeometry(0.032, 12, 10);
  finialGeo.scale(1, 0.45, 1);
  const halfArc = DIAL_ARC * 0.5;
  for (const sign of [-1, 1] as const) {
    const phi = sign * halfArc;
    const finial = new THREE.Mesh(finialGeo, bandMat);
    finial.position.set(Math.sin(phi) * DIAL_RADIUS, 0, Math.cos(phi) * DIAL_RADIUS);
    group.add(finial);
  }

  const tickGeo = new THREE.BoxGeometry(0.01, 0.008, 0.068);
  const tickFractions = [-0.44, -0.22, 0, 0.22, 0.44] as const;
  for (const frac of tickFractions) {
    const phi = frac * DIAL_ARC;
    const isCenter = frac === 0;
    const tick = new THREE.Mesh(tickGeo, isCenter ? railGlowMat : bandMat);
    tick.position.set(Math.sin(phi) * DIAL_RADIUS, 0.014, Math.cos(phi) * DIAL_RADIUS);
    tick.rotation.y = phi;
    if (isCenter) {
      tick.scale.set(1.4, 1.25, 1.35);
    }
    group.add(tick);
  }

  return { group, bandMat, railGlowMat };
}

/* ==========================================================================
 * 8. Dedicated Editorial 4-Point Studio Lighting Rig
 * ========================================================================== */

interface StudioLightRig {
  readonly group: THREE.Group;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly coolFillLight: THREE.DirectionalLight;
  readonly fillLight: THREE.HemisphereLight;
  readonly pedestalGlow: THREE.PointLight;
}

function buildStudioLights(): StudioLightRig {
  const group = new THREE.Group();
  group.name = 'studio-lights';

  // Warm editorial key light (upper left-front) sculpting lapels and face contour
  const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
  keyLight.position.set(-2.9, 4.1, 3.8);
  group.add(keyLight);

  // High-contrast champagne rim light (upper right-rear) separating charcoal wool from dark backdrop
  const rimLight = new THREE.DirectionalLight(0xf1d6a7, 3.0);
  rimLight.position.set(3.4, 2.9, -2.9);
  group.add(rimLight);

  // Crisp cool-platinum secondary fill light (right-front) revealing tailored fabric folds
  const coolFillLight = new THREE.DirectionalLight(0xc9d9f0, 0.92);
  coolFillLight.position.set(2.6, 1.5, 2.9);
  group.add(coolFillLight);

  // Balanced studio hemisphere bounce
  const fillLight = new THREE.HemisphereLight(0xf6efe6, 0x26201a, 1.05);
  group.add(fillLight);

  // Luminous under-glow grazing the frosted crystal turntable and lower coat hem
  const pedestalGlow = new THREE.PointLight(0xe5d1ab, 1.65, 6.2, 2);
  pedestalGlow.position.set(-0.2, -0.72, 1.25);
  group.add(pedestalGlow);

  return { group, keyLight, rimLight, coolFillLight, fillLight, pedestalGlow };
}

/* ==========================================================================
 * 9. StageModule Factory: createStudioStage()
 * ========================================================================== */

export function createStudioStage(options?: StudioStageOptions): StageModule {
  const group = new THREE.Group();
  group.name = 'stage-studio';

  let disposed = false;
  let currentGlassRatio = 0.5;
  let currentMood: MoodMode = 'luxury';
  let currentTheme: ThemeMode = 'dark';
  let currentSubtab: StageInteractionState['studioSubtab'] = 'preview';

  // Smooth runtime animation states (zero per-frame allocations)
  let currentAngleRad = 0;
  let walkBlend = 0;
  let rainBlend = 0;
  let hoverTargetX = 0;
  let hoverTargetY = 0;
  let hoverSmoothX = 0;
  let hoverSmoothY = 0;

  // Scratch vectors & matrices for allocation-free 60/120fps update loop
  const marbleAnchor = new THREE.Vector3();
  const handWorldPos = new THREE.Vector3();
  const invRootMatrix = new THREE.Matrix4();

  // Build scene components
  const lights = buildStudioLights();
  group.add(lights.group);

  const pedestal = buildTurntablePedestal(currentGlassRatio, currentMood, currentTheme);
  group.add(pedestal.group);

  const orbitals = buildOrbitalSystem(currentMood, currentTheme);
  group.add(orbitals.group);

  const starlight = buildStarlightDust();
  group.add(starlight.points);

  // Rotatable turntable group centered on top of the frosted-crystal disc
  const turntableGroup = new THREE.Group();
  turntableGroup.name = 'studio-turntable-rotor';
  turntableGroup.position.set(0, PEDESTAL_TOP_Y, 0);
  group.add(turntableGroup);

  const figure = buildSkinnedFigureRig(currentGlassRatio, currentMood, currentTheme);
  turntableGroup.add(figure.root);

  const rain = buildRainStreaks();
  group.add(rain.lines);

  const dialTrack = buildDialTrack(currentMood, currentTheme);
  group.add(dialTrack.group);

  /* ------------------------------------------------------------------------
   * Preload High-Resolution 20-Bone Skinned GLB Mannequin (Abort-Safe)
   * ------------------------------------------------------------------------ */

  const disposeSkeletons = (rootObj: THREE.Object3D | null): void => {
    if (!rootObj) return;
    const seen = new Set<THREE.Skeleton>();
    rootObj.traverse((obj) => {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && skinned.skeleton && !seen.has(skinned.skeleton)) {
        seen.add(skinned.skeleton);
        skinned.skeleton.dispose();
      }
    });
  };

  const loadAbortController =
    typeof AbortController !== 'undefined' ? new AbortController() : null;

  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    const loader = new GLTFLoader();
    void fetch(STUDIO_MANNEQUIN_GLB_URL, {
      signal: loadAbortController?.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed) return;
        loader.parse(
          buffer,
          '',
          (gltf) => {
            if (disposed) {
              disposeSkeletons(gltf.scene);
              disposeObject3D(gltf.scene);
              return;
            }
            figure.loadedModel = gltf.scene;
            figure.bones = {};
            assignMannequinMaterials(gltf.scene, figure.materials, figure.bones);
            figure.modelSlot.add(gltf.scene);
            figure.isLoaded = true;
            figure.loadFade = 0;
            figure.modelSlot.scale.setScalar(MANNEQUIN_WORLD_SCALE * 0.96);
            applySkeletalPose(0, false);
            options?.onModelLoaded?.();
          },
          () => {
            // Keep stage resilient if parse fails
          }
        );
      })
      .catch(() => {
        // Ignore aborted or offline fetches cleanly
      });
  }

  /* ------------------------------------------------------------------------
   * Visual Mode & Glass Synchronization
   * ------------------------------------------------------------------------ */

  const syncGlass = (ratio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(ratio, 0, 1);

    applySmokedGlassState(pedestal.glassMat, currentGlassRatio, currentMood, currentTheme);
    applySmokedGlassState(figure.umbrella.canopyMat, currentGlassRatio, currentMood, currentTheme);

    const baseCanopyOpacity = figure.umbrella.canopyMat.opacity;
    figure.umbrella.canopyMat.userData.targetOpacity = baseCanopyOpacity;
    figure.umbrella.canopyMat.opacity = baseCanopyOpacity * rainBlend;

    const isDark = currentTheme === 'dark';
    pedestal.mirrorMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.78 : 0.62,
      isDark ? 0.48 : 0.36,
      currentGlassRatio
    );
    pedestal.baseCoreMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.64 : 0.44,
      isDark ? 0.24 : 0.16,
      currentGlassRatio
    );
  };

  const syncVisualMode = (mood: MoodMode, theme: ThemeMode): void => {
    currentMood = mood;
    currentTheme = theme;
    const isDark = theme === 'dark';
    const isAurora = mood === 'aurora';

    syncGlass(currentGlassRatio);
    applyGoldModeState(pedestal.rimMat, mood, theme, 0.34);
    applyGoldModeState(orbitals.ringMat, mood, theme, 0.34);
    applyGoldModeState(orbitals.sparkMat, mood, theme, 0.94);
    applyGoldModeState(dialTrack.bandMat, mood, theme, 0.28);
    applyGoldModeState(dialTrack.railGlowMat, mood, theme, 0.64);
    applyGoldModeState(figure.umbrella.goldMat, mood, theme, 0.34);

    // Pedestal frosted crystal reflector & shadows calibrated for Dark vs Light mode
    pedestal.mirrorMat.color.setHex(
      isDark ? (isAurora ? 0x9cb0cc : 0xbcb6ae) : isAurora ? 0xdbe5f4 : 0xf2ece4
    );
    pedestal.mirrorMat.emissive.setHex(
      isDark ? (isAurora ? 0x243248 : 0x3b3730) : isAurora ? 0x9cb4d4 : 0xd0c6b6
    );
    pedestal.mirrorMat.emissiveIntensity = isDark ? 0.3 : 0.16;
    pedestal.baseCoreMat.color.setHex(
      isDark ? (isAurora ? 0x1a2336 : 0x242228) : isAurora ? 0xd0dbed : 0xe4ddd2
    );
    pedestal.shadowMat.color.setHex(isDark ? 0x040407 : 0x3b3630);
    pedestal.shadowMat.opacity = isDark ? 0.76 : 0.3;
    figure.materials.footShadowMat.color.setHex(isDark ? 0x040407 : 0x2d2924);
    figure.materials.footShadowMat.opacity = isDark ? 0.72 : 0.4;
    figure.materials.loadingHaloMat.color.setHex(
      isAurora ? STAGE_PALETTE.auroraSilverGold : STAGE_PALETTE.champagneGoldBright
    );

    // Sculpted mannequin editorial PBR materials tuned for Light & Dark legibility
    figure.materials.coatMat.color.setHex(isDark ? 0x1d1e24 : 0x25262e);
    figure.materials.coatMat.sheenColor.setHex(
      isAurora ? (isDark ? 0x8fb5e6 : 0x6f8ab0) : isDark ? 0xa69b8d : 0x7d7264
    );
    figure.materials.trouserMat.color.setHex(isDark ? 0x17181e : 0x1e2027);
    figure.materials.porcelainMat.color.setHex(isDark ? 0xdcc4ae : 0xcfb298);
    figure.materials.hairMat.color.setHex(isDark ? 0x1b1a20 : 0x201f26);

    // Starlight dust blending & tint
    const nextStarBlend = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (starlight.material.blending !== nextStarBlend) {
      starlight.material.blending = nextStarBlend;
      starlight.material.needsUpdate = true;
    }
    starlight.material.color.setHex(
      isAurora
        ? isDark
          ? 0xb8d4f8
          : 0x6a8ab8
        : isDark
          ? STAGE_PALETTE.champagneGoldBright
          : STAGE_PALETTE.champagneGoldLightTheme
    );
    starlight.material.opacity = isDark ? 0.82 : 0.62;

    // Raindrop streak tint
    rain.material.color.setHex(
      isAurora
        ? isDark
          ? 0xbcd8fa
          : 0x5c7ca8
        : isDark
          ? 0xe9d8b9
          : 0x7b6a52
    );

    // Editorial 4-point studio lighting rig calibrated per Mood × Theme
    if (isDark) {
      lights.keyLight.color.setHex(isAurora ? 0xe8f1ff : 0xfff1dc);
      lights.keyLight.intensity = 2.4;
      lights.rimLight.color.setHex(isAurora ? 0x9ec4f6 : 0xf1d6a7);
      lights.rimLight.intensity = 3.05;
      lights.coolFillLight.color.setHex(isAurora ? 0xb4cef4 : 0xc9d9f0);
      lights.coolFillLight.intensity = 0.92;
      lights.fillLight.color.setHex(isAurora ? 0xcadbf5 : 0xf2e7d8);
      lights.fillLight.groundColor.setHex(isAurora ? 0x192235 : 0x28211a);
      lights.fillLight.intensity = 1.08;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8fb6ec : STAGE_PALETTE.champagneGoldBright);
      lights.pedestalGlow.intensity = 1.65;
    } else {
      lights.keyLight.color.setHex(isAurora ? 0xf4f8ff : 0xfff8ee);
      lights.keyLight.intensity = 2.55;
      lights.rimLight.color.setHex(isAurora ? 0x9abbe8 : 0xdcb985);
      lights.rimLight.intensity = 2.0;
      lights.coolFillLight.color.setHex(0xe8f0fc);
      lights.coolFillLight.intensity = 0.78;
      lights.fillLight.color.setHex(0xffffff);
      lights.fillLight.groundColor.setHex(isAurora ? 0xbccae0 : 0xd8cfc2);
      lights.fillLight.intensity = 1.85;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8eaad6 : 0xc8a46e);
      lights.pedestalGlow.intensity = 0.9;
    }
  };

  /* ------------------------------------------------------------------------
   * Real 20-Bone Skeletal Choreography (`Stand` / `Walk` / `Rain`)
   * ------------------------------------------------------------------------ */

  const applySkeletalPose = (elapsed: number, reducedMotion: boolean): void => {
    const bones = figure.bones;
    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    const breathPhase = reducedMotion ? 0 : elapsed * 2.05;
    const walkPhase = reducedMotion ? 0.65 : elapsed * 4.0;

    const breathWave = Math.sin(breathPhase);
    const gaitWave = Math.sin(walkPhase);
    const gaitCos = Math.cos(walkPhase);
    const walkBounce = Math.abs(gaitWave) * 0.026 * walkBlend;

    // Ground root with +0.006 sole compensation so boots rest flush on turntable top
    figure.root.position.y = 0.006 + walkBounce;

    if (figure.isLoaded) {
      // Pelvis & spine counter-rotation (BONE_SPINE_02) + subtle editorial breathing
      if (bones.pelvis) {
        bones.pelvis.rotation.set(
          0.02 * walkBlend - 0.015 * rainBlend,
          gaitWave * 0.06 * walkBlend,
          -gaitWave * 0.024 * walkBlend
        );
      }
      if (bones.spine3) {
        bones.spine3.rotation.set(
          breathWave * 0.008 * (standWeight + rainBlend * 0.7),
          -gaitWave * 0.05 * walkBlend + 0.02 * rainBlend,
          0
        );
      }
      if (bones.spine2) {
        bones.spine2.rotation.set(
          breathWave * 0.01 * (standWeight + rainBlend * 0.7) + 0.025 * walkBlend,
          -gaitWave * 0.08 * walkBlend + 0.03 * rainBlend,
          gaitWave * 0.02 * walkBlend - 0.018 * rainBlend
        );
      }
      if (bones.spine1) {
        bones.spine1.rotation.set(
          breathWave * 0.012 * (standWeight + rainBlend * 0.7),
          -gaitWave * 0.04 * walkBlend,
          0
        );
      }

      // Poised head & neck subtle gaze tracking + gentle idle motion
      const idleHeadYaw = reducedMotion ? 0 : Math.sin(elapsed * 0.62) * 0.045 * standWeight;
      if (bones.neck) {
        bones.neck.rotation.set(
          hoverSmoothY * 0.035 + 0.02 * rainBlend,
          (idleHeadYaw + hoverSmoothX * 0.05) * 0.45,
          0
        );
      }
      if (bones.head) {
        bones.head.rotation.set(
          hoverSmoothY * 0.06 + 0.03 * rainBlend,
          idleHeadYaw + hoverSmoothX * 0.1 - 0.05 * rainBlend,
          -gaitWave * 0.018 * walkBlend
        );
      }

      // Clavicles (BONE_L_CLAVICLE_12) breathing + subtle lift when holding umbrella
      if (bones.clavicleL) {
        bones.clavicleL.rotation.set(
          0,
          0,
          -0.05 + breathWave * 0.012 * (standWeight + rainBlend * 0.6)
        );
      }
      if (bones.clavicleR) {
        bones.clavicleR.rotation.set(
          0,
          0,
          0.05 * (standWeight + walkBlend) + 0.11 * rainBlend - breathWave * 0.012 * standWeight
        );
      }

      // Left Arm (+X): drops cleanly out of rest A-pose into palms-inward runway Stand / Walk / Rain
      const leftArmSwing = gaitWave * 0.24;
      if (bones.shoulderL) {
        bones.shoulderL.rotation.set(
          0.08 * standWeight + leftArmSwing * walkBlend + 0.09 * rainBlend,
          -0.08 * standWeight - 0.06 * walkBlend - 0.08 * rainBlend,
          -0.58 * standWeight - 0.56 * walkBlend - 0.57 * rainBlend
        );
      }
      if (bones.elbowL) {
        bones.elbowL.rotation.set(
          0.16 * standWeight + (0.08 - Math.max(0, -leftArmSwing) * 0.35) * walkBlend + 0.12 * rainBlend,
          0.28 * standWeight + 0.24 * walkBlend + 0.26 * rainBlend,
          0.08 * standWeight + 0.06 * walkBlend + 0.08 * rainBlend
        );
      }
      if (bones.handL) {
        bones.handL.rotation.set(0, 0.24, -0.06);
      }

      // Right Arm (-X): Stand / opposing Walk swing / elevated chest-high Rain umbrella grip
      const rightArmSwing = -gaitWave * 0.24;
      if (bones.shoulderR) {
        bones.shoulderR.rotation.set(
          0.08 * standWeight + rightArmSwing * walkBlend - 0.72 * rainBlend,
          0.08 * standWeight + 0.06 * walkBlend - 0.18 * rainBlend,
          0.58 * standWeight + 0.56 * walkBlend + 0.38 * rainBlend
        );
      }
      if (bones.elbowR) {
        bones.elbowR.rotation.set(
          0.16 * standWeight + (0.08 - Math.max(0, -rightArmSwing) * 0.35) * walkBlend - 1.38 * rainBlend,
          -0.28 * standWeight - 0.24 * walkBlend + 0.26 * rainBlend,
          -0.08 * standWeight - 0.06 * walkBlend - 0.14 * rainBlend
        );
      }
      if (bones.handR) {
        bones.handR.rotation.set(
          0.24 * rainBlend,
          -0.24 * (standWeight + walkBlend) + 0.12 * rainBlend,
          0.06 * (standWeight + walkBlend)
        );
      }

      // Legs (hip/knee/ankle): poised runway stance in Stand/Rain, smooth stride in Walk
      const leftLegSwing = -gaitWave * 0.24;
      const rightLegSwing = gaitWave * 0.24;
      const leftKneeBend = Math.max(0, gaitCos) * 0.34 + 0.04;
      const rightKneeBend = Math.max(0, -gaitCos) * 0.34 + 0.04;

      if (bones.hipL) {
        bones.hipL.rotation.set(
          leftLegSwing * walkBlend - 0.02 * rainBlend,
          0,
          -0.055 * (standWeight + rainBlend) - 0.045 * walkBlend
        );
      }
      if (bones.kneeL) {
        bones.kneeL.rotation.set(leftKneeBend * walkBlend + 0.02 * rainBlend, 0, 0);
      }
      if (bones.ankleL) {
        bones.ankleL.rotation.set(
          -leftKneeBend * 0.35 * walkBlend,
          0,
          0.055 * (standWeight + rainBlend) + 0.045 * walkBlend
        );
      }

      if (bones.hipR) {
        bones.hipR.rotation.set(
          rightLegSwing * walkBlend + 0.015 * rainBlend,
          0,
          0.055 * (standWeight + rainBlend) + 0.045 * walkBlend
        );
      }
      if (bones.kneeR) {
        bones.kneeR.rotation.set(rightKneeBend * walkBlend + 0.015 * rainBlend, 0, 0);
      }
      if (bones.ankleR) {
        bones.ankleR.rotation.set(
          -rightKneeBend * 0.35 * walkBlend,
          0,
          -0.055 * (standWeight + rainBlend) - 0.045 * walkBlend
        );
      }
    }

    /* --- Translucent Champagne Umbrella Synced to Sculpted Right Hand Palm --- */
    const showUmbrella = rainBlend > 0.015;
    figure.umbrella.group.visible = showUmbrella;
    if (showUmbrella) {
      // Smoothly unfold from 0 -> 1 over the first 45% of rainBlend (no pop-in, full size fast)
      const unfoldT = THREE.MathUtils.clamp((rainBlend - 0.015) / 0.435, 0, 1);
      const unfoldScale = unfoldT * unfoldT * (3 - 2 * unfoldT);
      const easedFade = rainBlend * rainBlend * (3 - 2 * rainBlend);
      figure.umbrella.group.scale.setScalar(Math.max(0.001, unfoldScale));

      if (figure.isLoaded && bones.handR) {
        figure.root.updateMatrixWorld(true);
        handWorldPos.set(0.015, 0.03, 0.04);
        bones.handR.localToWorld(handWorldPos);
        invRootMatrix.copy(figure.root.matrixWorld).invert();
        handWorldPos.applyMatrix4(invRootMatrix);
        handWorldPos.y = Math.max(handWorldPos.y, 1.48);
        figure.umbrella.group.position.copy(handWorldPos);
      } else {
        figure.umbrella.group.position.set(-0.34, 1.5, 0.28);
      }

      const rainBreeze = reducedMotion ? 0 : Math.sin(elapsed * 2.8) * 0.025;
      figure.umbrella.group.rotation.set(-0.14 + rainBreeze * 0.5, 0, -0.26 + rainBreeze);

      const targetOpacity =
        typeof figure.umbrella.canopyMat.userData.targetOpacity === 'number'
          ? (figure.umbrella.canopyMat.userData.targetOpacity as number)
          : 0.56;
      figure.umbrella.canopyMat.opacity = targetOpacity * easedFade;
    }
  };

  const updateRainParticles = (dt: number, reducedMotion: boolean): void => {
    const showRain = rainBlend > 0.02;
    rain.lines.visible = showRain;
    if (!showRain) return;

    const maxOpacity = currentTheme === 'dark' ? 0.54 : 0.46;
    rain.material.opacity = maxOpacity * rainBlend;

    if (reducedMotion) return;

    const { drops, positions } = rain;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y -= drop.speed * dt;
      drop.x -= drop.speed * 0.18 * dt;
      drop.z += drop.speed * 0.04 * dt;

      const horizontalSq = drop.x * drop.x + drop.z * drop.z;
      const hitUmbrella =
        horizontalSq < UMBRELLA_DEFLECT_RADIUS * UMBRELLA_DEFLECT_RADIUS &&
        drop.y <= UMBRELLA_DEFLECT_Y &&
        drop.y > UMBRELLA_DEFLECT_Y - 0.55;

      if (hitUmbrella || drop.y < RAIN_BOTTOM_Y) {
        drop.y = RAIN_TOP_Y - ((i * 19) % 10) * 0.06;
        const resetRadius =
          0.16 + Math.sqrt(((i * 31 + 11) % RAIN_COUNT) / RAIN_COUNT) * RAIN_COLUMN_RADIUS;
        const resetAngle = i * 2.3999632297 + drop.speed * 0.3;
        drop.x = Math.cos(resetAngle) * resetRadius + 0.42;
        drop.z = Math.sin(resetAngle) * resetRadius;
      }

      writeRainSegment(positions, i, drop.x, drop.y, drop.z, drop.streakLength);
    }
    rain.positionAttr.needsUpdate = true;
  };

  const updateOrbitalsAndDust = (elapsed: number, reducedMotion: boolean): void => {
    const subtabRingLift =
      currentSubtab === 'intelligence' ? 0.12 : currentSubtab === 'atelier' ? 0.04 : 0;
    const subtabSpeed =
      currentSubtab === 'atelier' ? 1.25 : currentSubtab === 'intelligence' ? 0.85 : 1.0;

    if (!reducedMotion) {
      orbitals.outerSpin.rotation.z = elapsed * 0.24 * subtabSpeed;
      orbitals.innerSpin.rotation.z = -elapsed * 0.31 * subtabSpeed;
    }

    orbitals.outerPivot.rotation.set(
      Math.PI * 0.41 + hoverSmoothY * 0.06 + subtabRingLift * 0.4,
      0.22 + hoverSmoothX * 0.08,
      -0.34 + (reducedMotion ? 0 : Math.sin(elapsed * 0.45) * 0.03)
    );
    orbitals.innerPivot.rotation.set(
      Math.PI * 0.45 - hoverSmoothY * 0.05 - subtabRingLift * 0.3,
      -0.26 - hoverSmoothX * 0.07,
      0.36 + (reducedMotion ? 0 : Math.cos(elapsed * 0.38) * 0.03)
    );
    orbitals.group.position.y = 0.06 + subtabRingLift;

    if (!reducedMotion) {
      const { seeds, positions } = starlight;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const a = s.baseAngle + elapsed * s.orbitSpeed;
        positions[i * 3] = Math.cos(a) * s.baseRadius;
        positions[i * 3 + 1] = s.baseY + Math.sin(elapsed * 1.15 + s.phase) * s.bobAmp;
        positions[i * 3 + 2] = Math.sin(a) * s.baseRadius;
      }
      starlight.positionAttr.needsUpdate = true;
    }
  };

  /* ------------------------------------------------------------------------
   * StageModule Implementation
   * ------------------------------------------------------------------------ */

  return {
    id: 'studio',
    group,
    cameraPreset: STAGE_CAMERA_PRESETS.studio,

    getMarbleAnchor(elapsed: number, state: StageInteractionState): THREE.Vector3 {
      const wrappedAngle = Math.atan2(
        Math.sin(state.studioAngleRad),
        Math.cos(state.studioAngleRad)
      );
      const phi = (wrappedAngle / Math.PI) * DIAL_MAX_PHI;
      const idleFloat = Math.sin(elapsed * 2.2) * 0.007;

      return marbleAnchor.set(
        Math.sin(phi) * DIAL_RADIUS,
        DIAL_Y + MARBLE_REST_OFFSET_Y + idleFloat,
        Math.cos(phi) * DIAL_RADIUS
      );
    },

    onEnter(ctx: StageContext): void {
      currentAngleRad = ctx.interaction.studioAngleRad;
      currentSubtab = ctx.interaction.studioSubtab;
      walkBlend = ctx.interaction.studioPose === 'walk' ? 1 : 0;
      rainBlend = ctx.interaction.studioPose === 'rain' ? 1 : 0;
      turntableGroup.rotation.y = currentAngleRad;

      if (figure.isLoaded && ctx.reducedMotion) {
        figure.loadFade = 1;
        figure.modelSlot.scale.setScalar(MANNEQUIN_WORLD_SCALE);
        figure.loadingHalo.visible = false;
      }

      syncVisualMode(ctx.mood, ctx.theme);
      syncGlass(ctx.glassRatio);
      applySkeletalPose(0, ctx.reducedMotion);
    },

    onExit(_ctx: StageContext): void {
      hoverTargetX = 0;
      hoverTargetY = 0;
      hoverSmoothX = 0;
      hoverSmoothY = 0;
    },

    onGlassChange(glassRatio: number): void {
      syncGlass(glassRatio);
    },

    onVisualModeChange(mood: MoodMode, theme: ThemeMode): void {
      syncVisualMode(mood, theme);
    },

    onInteractionChange(patch: Partial<StageInteractionState>, _ctx: StageContext): void {
      if (patch.studioSubtab) {
        currentSubtab = patch.studioSubtab;
      }
    },

    onPointerMove(ndcX: number, ndcY: number, ctx: StageContext): void {
      if (ctx.reducedMotion) {
        hoverTargetX = 0;
        hoverTargetY = 0;
        return;
      }
      hoverTargetX = THREE.MathUtils.clamp(ndcX, -1, 1);
      hoverTargetY = THREE.MathUtils.clamp(ndcY, -1, 1);
    },

    onPointerDrag(dx: number, _dy: number, ctx: StageContext): void {
      const nextAngle = ctx.interaction.studioAngleRad + dx * 4.5;
      ctx.emitUiSync({ studioAngleRad: nextAngle });
    },

    onPointerTap(ndcX: number, _ndcY: number, ctx: StageContext): void {
      const direction = ndcX >= -0.15 ? 1 : -1;
      const nextAngle = ctx.interaction.studioAngleRad + direction * (Math.PI * 0.25);
      ctx.emitUiSync({ studioAngleRad: nextAngle });
    },

    update(dt: number, elapsed: number, ctx: StageContext): void {
      const dampFast = ctx.reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      const dampPose = ctx.reducedMotion ? 1 : 1 - Math.exp(-9.5 * dt);
      const dampHover = ctx.reducedMotion ? 1 : 1 - Math.exp(-6 * dt);

      currentAngleRad = THREE.MathUtils.lerp(
        currentAngleRad,
        ctx.interaction.studioAngleRad,
        dampFast
      );
      turntableGroup.rotation.y = currentAngleRad;

      hoverSmoothX = THREE.MathUtils.lerp(hoverSmoothX, hoverTargetX, dampHover);
      hoverSmoothY = THREE.MathUtils.lerp(hoverSmoothY, hoverTargetY, dampHover);

      const targetWalk = ctx.interaction.studioPose === 'walk' ? 1 : 0;
      const targetRain = ctx.interaction.studioPose === 'rain' ? 1 : 0;
      walkBlend = THREE.MathUtils.lerp(walkBlend, targetWalk, dampPose);
      rainBlend = THREE.MathUtils.lerp(rainBlend, targetRain, dampPose);

      currentSubtab = ctx.interaction.studioSubtab;

      // Smooth arrival scale & halo dismissal once the sculpted GLB streams in
      if (figure.isLoaded) {
        if (figure.loadFade < 1) {
          figure.loadFade = ctx.reducedMotion
            ? 1
            : Math.min(1, figure.loadFade + dt * 3.8);
          const eased = figure.loadFade * figure.loadFade * (3 - 2 * figure.loadFade);
          figure.modelSlot.scale.setScalar(MANNEQUIN_WORLD_SCALE * (0.96 + 0.04 * eased));
          figure.materials.loadingHaloMat.opacity = 0.55 * (1 - eased);
          figure.loadingHalo.visible = figure.loadFade < 0.99;
        }
      } else {
        figure.loadingHalo.visible = true;
        const pulse = ctx.reducedMotion ? 1 : 0.94 + Math.sin(elapsed * 3.2) * 0.08;
        figure.loadingHalo.scale.setScalar(pulse);
        figure.materials.loadingHaloMat.opacity = 0.35 + (pulse - 0.86) * 1.4;
      }

      applySkeletalPose(elapsed, ctx.reducedMotion);
      updateRainParticles(dt, ctx.reducedMotion);
      updateOrbitalsAndDust(elapsed, ctx.reducedMotion);
    },

    dispose(): void {
      disposed = true;
      loadAbortController?.abort();
      disposeSkeletons(figure.loadedModel);

      // Only manually dispose materials/textures when GLB never attached to scene graph;
      // once attached, disposeObject3D(group) deduplicates and disposes them cleanly once.
      if (!figure.isLoaded) {
        figure.materials.woolBumpTex.dispose();
        figure.materials.porcelainMat.dispose();
        figure.materials.hairMat.dispose();
        figure.materials.coatMat.dispose();
        figure.materials.knitMat.dispose();
        figure.materials.trouserMat.dispose();
        figure.materials.shoeMat.dispose();
      }

      disposeObject3D(group);
      figure.loadedModel = null;
      figure.bones = {};
      figure.isLoaded = false;
    },
  };
}
