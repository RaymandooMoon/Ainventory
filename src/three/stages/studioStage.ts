/**
 * studioStage.ts
 * ---------------------------------------------------------------------------
 * Studio 3D Stage Module for ainvtry.com (Three.js 0.187 WebGL2)
 *
 * Implements the Dual-Mode Luxury Editorial 3D Showroom:
 * 1. Layered frosted-crystal circular turntable pedestal (y = -1.25) with
 *    chamfered champagne-gold upper/lower rims, luminous inner studio disc,
 *    and soft ground contact shadow.
 * 2. Dual 360° real-time gyroscopic precessing champagne-gold orbital rings
 *    with sweeping luminous highlight arcs, glowing satellite orbs, and 48
 *    lightweight floating starlight dust points.
 * 3. Default Mode (`'mannequin'`): Blender 4.0.2 welded & Subdiv-L1 smoothed
 *    48k-tri MIT Microsoft Rocketbox 2K PBR pinstripe-suit editorial avatar
 *    (`/assets/models/hf-fashion-avatar-v2.glb`) normalized via `Box3` to
 *    `1.94 u`, grounded flush at `y = 0`, PBR-tuned for `RoomEnvironment` +
 *    `ACESFilmicToneMapping`, with 3-clip smooth `THREE.AnimationMixer`
 *    crossfade (`Stand` / `Walk` / `Rain`) and live left-hand (or Mixamo
 *    right-hand fallback) smoked-glass umbrella grip attachment.
 * 4. Couture Dress Form Mode (`'dressform'`): Hugging Face woven-wool Couture
 *    Trench Coat on obsidian atelier bust & brushed champagne-gold `iNVTRY`
 *    hanger stand (`/assets/models/hf-couture-coat-v1.glb`) normalized to
 *    `1.94 u`, with zero-blank-frame instant procedural Obsidian Couture Dress
 *    Form fallback silhouette shown only while the active GLB streams.
 * 5. Silent Auto Drop-In `/models/mannequin.glb` (with lazy `DRACOLoader`
 *    instantiated only when present, magic-byte `glTF` verification for zero
 *    console errors, `Box3` 1.8u auto-scaling & grounding, and AnimationMixer).
 * 6. Curved front champagne-gold 360° dial track (radius 2.08, y = -1.32)
 *    with reusable glowing marble controller synced to turntable rotation,
 *    plus translucent smoked-glass umbrella and diagonal 3D rain streaks.
 */

import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
 * 1. Stage Spatial, Model & Animation Constants
 * ========================================================================== */

const HF_FASHION_AVATAR_GLB_URL = '/assets/models/hf-fashion-avatar-v2.glb';
const HF_COUTURE_COAT_GLB_URL = '/assets/models/hf-couture-coat-v1.glb';
const CUSTOM_MANNEQUIN_GLB_URL = '/models/mannequin.glb';
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

const MANNEQUIN_TARGET_HEIGHT = 1.94;
const COUTURE_COAT_TARGET_HEIGHT = 1.94;
const CUSTOM_MANNEQUIN_TARGET_HEIGHT = 1.8;

const AVATAR_CROSSFADE_SEC = 0.28;
const AVATAR_RAIN_HAND_FALLBACK = { x: 0.1, y: 1.235, z: 0.151 } as const;
const AVATAR_REDUCED_MOTION_TIME: Readonly<Record<StageInteractionState['studioPose'], number>> = {
  stand: 0,
  walk: 0.33,
  rain: 0.5,
};

const TORSO_SCALE_X = 1.18;
const TORSO_SCALE_Z = 0.72;
const TORSO_PIVOT_Y = 0.8;

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
const UMBRELLA_DEFLECT_Y_AVATAR = 1.54;
const UMBRELLA_DEFLECT_Y_COUTURE_COAT = 1.44;
const UMBRELLA_DEFLECT_Y_DRESSFORM = 1.56;
const UMBRELLA_DEFLECT_Y_CUSTOM = 1.38;

type ActiveModelKind = 'avatar' | 'coutureCoat' | 'dressformFallback' | 'custom';

export interface StudioStageOptions {
  readonly onModelLoaded?: () => void;
}

/* ==========================================================================
 * 2. SSR-Safe Procedural Canvas Textures & Binary GLB Magic Verification
 * ========================================================================== */

function createFallbackTexture(rgba: [number, number, number, number]): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

/** Verifies binary GLB magic header (`glTF` = 0x67 0x6C 0x54 0x46) before parsing. */
function isValidGlbBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const header = new Uint8Array(buffer, 0, 4);
  return (
    header[0] === 0x67 &&
    header[1] === 0x6c &&
    header[2] === 0x54 &&
    header[3] === 0x46
  );
}

/** Soft radial floor contact shadow beneath pedestal and showroom base. */
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

  // Luminous frosted studio reflector disc right beneath top bevel
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
  readonly arcGlowMat: THREE.MeshStandardMaterial;
  readonly sparkMat: THREE.MeshStandardMaterial;
}

function buildOrbitalSystem(mood: MoodMode, theme: ThemeMode): OrbitalRig {
  const group = new THREE.Group();
  group.name = 'studio-orbital-rings';
  group.position.set(0, 0.06, 0);

  const isDark = theme === 'dark';
  const ringMat = createChampagneGoldMaterial(mood, theme, 0.34);
  const arcGlowMat = createChampagneGoldMaterial(mood, theme, 0.85);
  arcGlowMat.emissiveIntensity = isDark ? 0.85 : 0.52;
  const sparkMat = createChampagneGoldMaterial(mood, theme, 0.92);

  // Outer sculpted gyroscopic orbital ring (radius 1.86)
  const outerPivot = new THREE.Group();
  outerPivot.name = 'studio-orbital-outer-pivot';
  outerPivot.rotation.set(Math.PI * 0.4, 0.22, -0.32);
  const outerSpin = new THREE.Group();
  outerSpin.name = 'studio-orbital-outer-spin';

  const outerGeo = new THREE.TorusGeometry(1.86, 0.011, 12, 96);
  outerSpin.add(new THREE.Mesh(outerGeo, ringMat));

  // Sweeping luminous highlight arc + opposite counter-arc
  const outerArcGeo = new THREE.TorusGeometry(1.86, 0.018, 12, 48, Math.PI * 0.44);
  outerSpin.add(new THREE.Mesh(outerArcGeo, arcGlowMat));

  const outerCounterArcGeo = new THREE.TorusGeometry(1.86, 0.018, 12, 48, Math.PI * 0.24);
  const outerCounterArc = new THREE.Mesh(outerCounterArcGeo, arcGlowMat);
  outerCounterArc.rotation.z = Math.PI;
  outerSpin.add(outerCounterArc);

  // 2 sculptural glowing satellite orbs on outer orbit
  const outerNodeAGeo = new THREE.SphereGeometry(0.052, 16, 12);
  const outerNodeA = new THREE.Mesh(outerNodeAGeo, sparkMat);
  outerNodeA.position.set(1.86, 0, 0);
  outerSpin.add(outerNodeA);

  const outerNodeAHaloGeo = new THREE.TorusGeometry(0.082, 0.006, 10, 32);
  const outerNodeAHalo = new THREE.Mesh(outerNodeAHaloGeo, arcGlowMat);
  outerNodeAHalo.position.set(1.86, 0, 0);
  outerNodeAHalo.rotation.set(Math.PI * 0.38, Math.PI * 0.22, 0);
  outerSpin.add(outerNodeAHalo);

  const outerNodeBGeo = new THREE.SphereGeometry(0.036, 14, 10);
  const outerNodeB = new THREE.Mesh(outerNodeBGeo, sparkMat);
  outerNodeB.position.set(-1.86, 0, 0);
  outerSpin.add(outerNodeB);

  outerPivot.add(outerSpin);
  group.add(outerPivot);

  // Inner counter-precessing orbital ring (radius 1.64)
  const innerPivot = new THREE.Group();
  innerPivot.name = 'studio-orbital-inner-pivot';
  innerPivot.rotation.set(Math.PI * 0.46, -0.26, 0.34);
  const innerSpin = new THREE.Group();
  innerSpin.name = 'studio-orbital-inner-spin';

  const innerGeo = new THREE.TorusGeometry(1.64, 0.0095, 12, 96);
  innerSpin.add(new THREE.Mesh(innerGeo, ringMat));

  // Sweeping luminous highlight arc on inner orbit
  const innerArcGeo = new THREE.TorusGeometry(1.64, 0.016, 12, 48, Math.PI * 0.38);
  innerSpin.add(new THREE.Mesh(innerArcGeo, arcGlowMat));

  // 2 glowing satellite orbs on inner orbit
  const innerNodeAGeo = new THREE.SphereGeometry(0.044, 16, 12);
  const innerNodeA = new THREE.Mesh(innerNodeAGeo, sparkMat);
  innerNodeA.position.set(0, 1.64, 0);
  innerSpin.add(innerNodeA);

  const innerNodeAHaloGeo = new THREE.TorusGeometry(0.072, 0.0055, 10, 32);
  const innerNodeAHalo = new THREE.Mesh(innerNodeAHaloGeo, arcGlowMat);
  innerNodeAHalo.position.set(0, 1.64, 0);
  innerNodeAHalo.rotation.set(Math.PI * 0.42, -Math.PI * 0.24, 0);
  innerSpin.add(innerNodeAHalo);

  const innerNodeBGeo = new THREE.SphereGeometry(0.03, 14, 10);
  const innerNodeB = new THREE.Mesh(innerNodeBGeo, sparkMat);
  innerNodeB.position.set(0, -1.64, 0);
  innerSpin.add(innerNodeB);

  innerPivot.add(innerSpin);
  group.add(innerPivot);

  return { group, outerPivot, innerPivot, outerSpin, innerSpin, ringMat, arcGlowMat, sparkMat };
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
 * 5. Mode A: High-Fashion Headless Couture Atelier Dress Form Builder
 * ========================================================================== */

interface AtelierDressFormRig {
  readonly group: THREE.Group;
  readonly torsoPivot: THREE.Group;
  readonly torsoMat: THREE.MeshPhysicalMaterial;
  readonly goldHardwareMat: THREE.MeshStandardMaterial;
  readonly plinthInlayMat: THREE.MeshStandardMaterial;
  readonly coreSpineMat: THREE.MeshStandardMaterial;
  readonly measureRingMat: THREE.MeshStandardMaterial;
  readonly seamGlintMat: THREE.MeshStandardMaterial;
}

/** Linearly interpolates the torso profile radius at any exact vertical Y coordinate. */
function sampleProfileRadiusAtY(points: readonly THREE.Vector2[], targetY: number): number {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.y <= targetY && b.y >= targetY) || (a.y >= targetY && b.y <= targetY)) {
      const span = b.y - a.y;
      if (Math.abs(span) < 1e-6) return b.x;
      const t = (targetY - a.y) / span;
      return THREE.MathUtils.lerp(a.x, b.x, t);
    }
  }
  return points[points.length - 1]?.x ?? 0.2;
}

/** Applies Luxury/Aurora × Dark/Light palette to brushed couture gold hardware. */
function applyBrushedGoldHardwareMode(
  mat: THREE.MeshStandardMaterial,
  mood: MoodMode,
  theme: ThemeMode,
  emissiveIntensity: number
): void {
  const isDark = theme === 'dark';
  const isAurora = mood === 'aurora';

  if (isAurora) {
    mat.color.setHex(
      isDark ? STAGE_PALETTE.auroraSilverGold : STAGE_PALETTE.auroraSilverLightTheme
    );
    mat.emissive.setHex(
      isDark ? STAGE_PALETTE.auroraEmissiveDark : STAGE_PALETTE.auroraEmissiveLight
    );
    mat.metalness = isDark ? 0.93 : 0.86;
    mat.roughness = isDark ? 0.16 : 0.22;
    mat.envMapIntensity = isDark ? 1.65 : 1.3;
  } else {
    mat.color.setHex(isDark ? 0xd6b889 : STAGE_PALETTE.champagneGoldLightTheme);
    mat.emissive.setHex(
      isDark ? STAGE_PALETTE.champagneEmissiveDark : STAGE_PALETTE.champagneEmissiveLight
    );
    mat.metalness = isDark ? 0.92 : 0.86;
    mat.roughness = isDark ? 0.18 : 0.23;
    mat.envMapIntensity = isDark ? 1.55 : 1.25;
  }

  mat.emissiveIntensity = isDark ? emissiveIntensity : emissiveIntensity * 0.62;
}

function buildAtelierDressForm(
  woolBumpTex: THREE.Texture,
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): AtelierDressFormRig {
  const group = new THREE.Group();
  group.name = 'studio-atelier-dressform';

  // Brushed champagne gold hardware (`#D6B889`, metalness 0.92, roughness 0.18)
  const goldHardwareMat = new THREE.MeshStandardMaterial({
    color: 0xd6b889,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.55,
  });
  applyBrushedGoldHardwareMode(goldHardwareMat, mood, theme, 0.14);

  const plinthInlayMat = new THREE.MeshStandardMaterial({
    color: 0x16171c,
    metalness: 0.24,
    roughness: 0.36,
    envMapIntensity: 1.1,
  });

  // Internal brushed-gold core spine revealed softly through smoked glass %
  const coreSpineMat = new THREE.MeshStandardMaterial({
    color: 0xd6b889,
    emissive: STAGE_PALETTE.champagneEmissiveDark,
    emissiveIntensity: 0.35,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.6,
  });
  applyBrushedGoldHardwareMode(coreSpineMat, mood, theme, 0.36);

  // Ultra-fine tailoring measurement rings + seam glint nodes
  const measureRingMat = new THREE.MeshStandardMaterial({
    color: 0xd6b889,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.6,
  });
  applyBrushedGoldHardwareMode(measureRingMat, mood, theme, 0.38);

  const seamGlintMat = new THREE.MeshStandardMaterial({
    color: 0xe6cfa4,
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 1.75,
  });
  applyBrushedGoldHardwareMode(seamGlintMat, mood, theme, 0.85);

  /* --- 5A. Chamfered Base Plinth Ring & Slim Brushed-Gold Stand Pole (y = 0 .. 0.85) --- */
  const plinthPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0.002),
    new THREE.Vector2(0.268, 0.002),
    new THREE.Vector2(0.268, 0.014),
    new THREE.Vector2(0.252, 0.025),
    new THREE.Vector2(0.155, 0.027),
    new THREE.Vector2(0.122, 0.044),
    new THREE.Vector2(0.056, 0.052),
    new THREE.Vector2(0.036, 0.072),
    new THREE.Vector2(0.026, 0.074),
    new THREE.Vector2(0.001, 0.074),
  ];
  const plinthGeo = new THREE.LatheGeometry(plinthPoints, 48);
  const plinthMesh = new THREE.Mesh(plinthGeo, goldHardwareMat);
  group.add(plinthMesh);

  // Subtle dark obsidian accent inlay ring set into the plinth terrace
  const plinthInlayGeo = new THREE.TorusGeometry(0.205, 0.007, 10, 48);
  plinthInlayGeo.rotateX(Math.PI * 0.5);
  const plinthInlayMesh = new THREE.Mesh(plinthInlayGeo, plinthInlayMat);
  plinthInlayMesh.position.y = 0.026;
  group.add(plinthInlayMesh);

  // Slim brushed-gold central stand pole extending cleanly into the under-torso collar
  const standPoleGeo = new THREE.CylinderGeometry(0.021, 0.025, 0.8, 24);
  const standPoleMesh = new THREE.Mesh(standPoleGeo, goldHardwareMat);
  standPoleMesh.position.y = 0.45;
  group.add(standPoleMesh);

  // Mid-pole couture height-adjustment collar ring
  const lockCollarGeo = new THREE.CylinderGeometry(0.034, 0.036, 0.032, 24);
  const lockCollarMesh = new THREE.Mesh(lockCollarGeo, goldHardwareMat);
  lockCollarMesh.position.y = 0.43;
  group.add(lockCollarMesh);

  const lockRimGeo = new THREE.TorusGeometry(0.036, 0.0045, 10, 24);
  lockRimGeo.rotateX(Math.PI * 0.5);
  const lockRimMesh = new THREE.Mesh(lockRimGeo, measureRingMat);
  lockRimMesh.position.y = 0.446;
  group.add(lockRimMesh);

  /* --- 5B. Pivoted Couture Torso Assembly (Anchored at TORSO_PIVOT_Y = 0.80) --- */
  const torsoPivot = new THREE.Group();
  torsoPivot.name = 'studio-dressform-torso-pivot';
  torsoPivot.position.set(0, TORSO_PIVOT_Y, 0);
  group.add(torsoPivot);

  // Under-torso sculpted brass mounting collar receiving the bottom hem
  const underCollarPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.056),
    new THREE.Vector2(0.036, -0.056),
    new THREE.Vector2(0.046, -0.044),
    new THREE.Vector2(0.088, -0.036),
    new THREE.Vector2(0.128, -0.026),
    new THREE.Vector2(0.132, -0.018),
    new THREE.Vector2(0.001, -0.018),
  ];
  const underCollarGeo = new THREE.LatheGeometry(underCollarPoints, 48);
  underCollarGeo.scale(TORSO_SCALE_X, 1, TORSO_SCALE_Z);
  underCollarGeo.computeVertexNormals();
  const underCollarMesh = new THREE.Mesh(underCollarGeo, goldHardwareMat);
  torsoPivot.add(underCollarMesh);

  // Anatomical Couture Torso via SplineCurve + 64-segment LatheGeometry
  const coutureControlPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.228, 0.785), // beveled lower hem
    new THREE.Vector2(0.256, 0.835), // low hip flare
    new THREE.Vector2(0.264, 0.892), // sculpted pelvis curve
    new THREE.Vector2(0.236, 0.962), // upper pelvis taper
    new THREE.Vector2(0.194, 1.032), // lower waist convergence
    new THREE.Vector2(0.172, 1.095), // cinched couture waist
    new THREE.Vector2(0.188, 1.168), // lower ribcage lift
    new THREE.Vector2(0.234, 1.265), // sculpted mid ribcage
    new THREE.Vector2(0.268, 1.365), // tailored chest / bust apex
    new THREE.Vector2(0.282, 1.455), // upper chest broadening
    new THREE.Vector2(0.304, 1.535), // broad architectural couture shoulders
    new THREE.Vector2(0.282, 1.592), // rounded shoulder cap
    new THREE.Vector2(0.202, 1.640), // trapezius slope
    new THREE.Vector2(0.122, 1.688), // collarbone root
    new THREE.Vector2(0.092, 1.734), // slim couture neck base
    new THREE.Vector2(0.088, 1.808), // upper neck column
  ];

  const profileSpline = new THREE.SplineCurve(coutureControlPoints);
  const sampledBody = profileSpline.getPoints(72);

  // Prepend/append closed beveled bottom & top caps without spline Gibbs overshoot
  const absoluteProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0.770),
    new THREE.Vector2(0.118, 0.771),
    new THREE.Vector2(0.204, 0.776),
    ...sampledBody.map((pt) => new THREE.Vector2(Math.max(0.002, pt.x), pt.y)),
    new THREE.Vector2(0.080, 1.823),
    new THREE.Vector2(0.052, 1.829),
    new THREE.Vector2(0.001, 1.831),
  ];

  const torsoLathePoints = absoluteProfile.map(
    (pt) => new THREE.Vector2(pt.x, pt.y - TORSO_PIVOT_Y)
  );
  const torsoGeo = new THREE.LatheGeometry(torsoLathePoints, 64);
  torsoGeo.scale(TORSO_SCALE_X, 1, TORSO_SCALE_Z);
  torsoGeo.computeVertexNormals();

  // Deep obsidian charcoal couture wool + champagne sheen + Glass % smoked translucency
  const torsoMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1b20,
    roughness: 0.42,
    metalness: 0.15,
    sheen: 0.85,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xd6b889),
    clearcoat: 0.25,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1.25,
    bumpMap: woolBumpTex,
    bumpScale: 0.002,
    transparent: true,
    opacity: THREE.MathUtils.lerp(1.0, 0.76, THREE.MathUtils.clamp(glassRatio, 0, 1)),
    depthWrite: true,
  });

  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.name = 'studio-dressform-torso';
  torsoMesh.renderOrder = 2;
  torsoPivot.add(torsoMesh);

  /* --- 5C. Internal Brushed-Gold Architectural Core Spine (Revealed via Glass %) --- */
  const coreSpineGroup = new THREE.Group();
  coreSpineGroup.name = 'studio-dressform-gold-spine';
  torsoPivot.add(coreSpineGroup);

  const spineRodGeo = new THREE.CylinderGeometry(0.014, 0.022, 0.96, 16);
  const spineRodMesh = new THREE.Mesh(spineRodGeo, coreSpineMat);
  spineRodMesh.position.y = 1.28 - TORSO_PIVOT_Y;
  spineRodMesh.renderOrder = 1;
  coreSpineGroup.add(spineRodMesh);

  const coreRibSpecs: ReadonlyArray<{ readonly y: number; readonly r: number }> = [
    { y: 0.90, r: 0.145 },
    { y: 1.10, r: 0.102 },
    { y: 1.35, r: 0.158 },
    { y: 1.52, r: 0.172 },
  ];
  const vertebraGeo = new THREE.SphereGeometry(0.026, 12, 10);
  for (const spec of coreRibSpecs) {
    const ribGeo = new THREE.TorusGeometry(spec.r, 0.0055, 10, 48);
    ribGeo.rotateX(Math.PI * 0.5);
    ribGeo.scale(TORSO_SCALE_X, 1, TORSO_SCALE_Z);
    ribGeo.computeVertexNormals();
    const ribMesh = new THREE.Mesh(ribGeo, coreSpineMat);
    ribMesh.position.y = spec.y - TORSO_PIVOT_Y;
    ribMesh.renderOrder = 1;
    coreSpineGroup.add(ribMesh);

    const vertebra = new THREE.Mesh(vertebraGeo, coreSpineMat);
    vertebra.position.y = spec.y - TORSO_PIVOT_Y;
    vertebra.renderOrder = 1;
    coreSpineGroup.add(vertebra);
  }

  /* --- 5D. Chamfered Neck Finial Cap & Minimalist Coat-Hanger Hook (Total H ~2.12u) --- */
  const neckFinialPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 1.822 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.098, 1.822 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.101, 1.836 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.090, 1.858 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.056, 1.872 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.032, 1.884 - TORSO_PIVOT_Y),
    new THREE.Vector2(0.001, 1.886 - TORSO_PIVOT_Y),
  ];
  const neckFinialGeo = new THREE.LatheGeometry(neckFinialPoints, 48);
  neckFinialGeo.scale(TORSO_SCALE_X, 1, TORSO_SCALE_Z);
  neckFinialGeo.computeVertexNormals();
  const neckFinialMesh = new THREE.Mesh(neckFinialGeo, goldHardwareMat);
  neckFinialMesh.renderOrder = 3;
  torsoPivot.add(neckFinialMesh);

  // Collar bezel ring anchoring the hanger stem
  const hookCollarGeo = new THREE.TorusGeometry(0.028, 0.006, 10, 28);
  hookCollarGeo.rotateX(Math.PI * 0.5);
  const hookCollarMesh = new THREE.Mesh(hookCollarGeo, goldHardwareMat);
  hookCollarMesh.position.y = 1.886 - TORSO_PIVOT_Y;
  torsoPivot.add(hookCollarMesh);

  // Minimalist metallic Coat-Hanger Hook (`iNVTRY` hanger signature)
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 1.876 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(0.0, 1.928 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(0.028, 1.970 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(0.070, 2.024 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(0.056, 2.088 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(0.002, 2.116 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(-0.055, 2.094 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(-0.072, 2.038 - TORSO_PIVOT_Y, 0),
    new THREE.Vector3(-0.050, 2.006 - TORSO_PIVOT_Y, 0),
  ]);
  const hookGeo = new THREE.TubeGeometry(hookCurve, 48, 0.0125, 14, false);
  const hookMesh = new THREE.Mesh(hookGeo, goldHardwareMat);
  hookMesh.name = 'studio-dressform-hanger-hook';
  torsoPivot.add(hookMesh);

  // Chamfered tip finial sphere capping the open end of the hanger hook
  const hookTipGeo = new THREE.SphereGeometry(0.0155, 14, 12);
  const hookTipMesh = new THREE.Mesh(hookTipGeo, seamGlintMat);
  hookTipMesh.position.set(-0.050, 2.006 - TORSO_PIVOT_Y, 0);
  torsoPivot.add(hookTipMesh);

  /* --- 5E. 3 Ultra-Fine Tailoring Measurement Rings + Seam Glint Nodes --- */
  const measurementSpecs: ReadonlyArray<{
    readonly name: string;
    readonly y: number;
    readonly tube: number;
    readonly clearance: number;
    readonly glints: ReadonlyArray<'left' | 'right' | 'front' | 'back'>;
  }> = [
    {
      name: 'shoulder',
      y: 1.535,
      tube: 0.0044,
      clearance: 0.005,
      glints: ['left', 'right'],
    },
    {
      name: 'chest',
      y: 1.365,
      tube: 0.0038,
      clearance: 0.0048,
      glints: ['front', 'back'],
    },
    {
      name: 'waist',
      y: 1.095,
      tube: 0.0048,
      clearance: 0.0052,
      glints: ['front', 'back', 'left', 'right'],
    },
  ];

  const glintNodeGeo = new THREE.SphereGeometry(0.0105, 12, 10);
  for (const spec of measurementSpecs) {
    const r = sampleProfileRadiusAtY(absoluteProfile, spec.y) + spec.clearance;
    const ringGeo = new THREE.TorusGeometry(r, spec.tube, 12, 72);
    ringGeo.rotateX(Math.PI * 0.5);
    ringGeo.scale(TORSO_SCALE_X, 1, TORSO_SCALE_Z);
    ringGeo.computeVertexNormals();
    const ringMesh = new THREE.Mesh(ringGeo, measureRingMat);
    ringMesh.name = `studio-dressform-ring-${spec.name}`;
    ringMesh.position.y = spec.y - TORSO_PIVOT_Y;
    ringMesh.renderOrder = 3;
    torsoPivot.add(ringMesh);

    const localY = spec.y - TORSO_PIVOT_Y;
    for (const side of spec.glints) {
      const node = new THREE.Mesh(glintNodeGeo, seamGlintMat);
      if (side === 'left') node.position.set(r * TORSO_SCALE_X, localY, 0);
      else if (side === 'right') node.position.set(-r * TORSO_SCALE_X, localY, 0);
      else if (side === 'front') node.position.set(0, localY, r * TORSO_SCALE_Z);
      else node.position.set(0, localY, -r * TORSO_SCALE_Z);
      node.renderOrder = 3;
      torsoPivot.add(node);
    }
  }

  // Ultra-fine front & back center couture seam hairlines hugging the silhouette
  const seamSampleYs = [0.80, 0.89, 0.99, 1.095, 1.22, 1.365, 1.50, 1.61, 1.69];
  for (const zSign of [1, -1] as const) {
    const seamPts = seamSampleYs.map((y) => {
      const r = sampleProfileRadiusAtY(absoluteProfile, y);
      return new THREE.Vector3(0, y - TORSO_PIVOT_Y, zSign * (r * TORSO_SCALE_Z + 0.0038));
    });
    const seamCurve = new THREE.CatmullRomCurve3(seamPts);
    const seamGeo = new THREE.TubeGeometry(seamCurve, 32, 0.0022, 8, false);
    const seamMesh = new THREE.Mesh(seamGeo, measureRingMat);
    seamMesh.renderOrder = 3;
    torsoPivot.add(seamMesh);
  }

  return {
    group,
    torsoPivot,
    torsoMat,
    goldHardwareMat,
    plinthInlayMat,
    coreSpineMat,
    measureRingMat,
    seamGlintMat,
  };
}

/* ==========================================================================
 * 6. Translucent Smoked-Glass Champagne Umbrella Builder
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

  // Sculpted handle grip resting cleanly inside the right hand palm (or suspended behind form)
  const gripGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.17, 14);
  const gripMesh = new THREE.Mesh(gripGeo, gripMat);
  gripMesh.position.y = -0.02;
  group.add(gripMesh);

  const pommelGeo = new THREE.SphereGeometry(0.022, 12, 10);
  const pommelMesh = new THREE.Mesh(pommelGeo, goldMat);
  pommelMesh.position.y = -0.105;
  group.add(pommelMesh);

  // Slim metallic champagne shaft extending cleanly to the canopy apex
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

/* ==========================================================================
 * 7. Hugging Face Photorealistic Avatar, Couture Coat & Auto Drop-In Rigs
 * ========================================================================== */

interface FashionAvatarRig {
  readonly root: THREE.Group;
  readonly modelSlot: THREE.Group;
  loadedModel: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  standAction: THREE.AnimationAction | null;
  walkAction: THREE.AnimationAction | null;
  rainAction: THREE.AnimationAction | null;
  activeClip: StageInteractionState['studioPose'];
  wasReducedMotion: boolean;
  umbrellaHandBone: THREE.Object3D | null;
  umbrellaPalmMiddleBone: THREE.Object3D | null;
  umbrellaPalmThumbBone: THREE.Object3D | null;
  umbrellaAnchorSide: 'left' | 'right';
  calibratedMaterials: THREE.MeshStandardMaterial[];
  scaleFactor: number;
  loadFade: number;
  isLoaded: boolean;
}

interface CoutureCoatRig {
  readonly root: THREE.Group;
  readonly modelSlot: THREE.Group;
  loadedModel: THREE.Object3D | null;
  fabricMaterials: THREE.MeshStandardMaterial[];
  hardwareMaterials: THREE.MeshStandardMaterial[];
  coreMaterials: THREE.MeshStandardMaterial[];
  loadFade: number;
  isLoaded: boolean;
}

interface CustomDropInRig {
  readonly root: THREE.Group;
  readonly modelSlot: THREE.Group;
  loadedModel: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  standAction: THREE.AnimationAction | null;
  walkAction: THREE.AnimationAction | null;
  activeClip: 'stand' | 'walk';
  isLoaded: boolean;
}

function buildFashionAvatarRig(): FashionAvatarRig {
  const root = new THREE.Group();
  root.name = 'studio-hf-fashion-avatar';
  root.visible = false;

  const modelSlot = new THREE.Group();
  modelSlot.name = 'studio-hf-fashion-avatar-slot';
  root.add(modelSlot);

  return {
    root,
    modelSlot,
    loadedModel: null,
    mixer: null,
    standAction: null,
    walkAction: null,
    rainAction: null,
    activeClip: 'stand',
    wasReducedMotion: false,
    umbrellaHandBone: null,
    umbrellaPalmMiddleBone: null,
    umbrellaPalmThumbBone: null,
    umbrellaAnchorSide: 'left',
    calibratedMaterials: [],
    scaleFactor: 1,
    loadFade: 0,
    isLoaded: false,
  };
}

function buildCoutureCoatRig(): CoutureCoatRig {
  const root = new THREE.Group();
  root.name = 'studio-hf-couture-coat';
  root.visible = false;

  const modelSlot = new THREE.Group();
  modelSlot.name = 'studio-hf-couture-coat-slot';
  root.add(modelSlot);

  return {
    root,
    modelSlot,
    loadedModel: null,
    fabricMaterials: [],
    hardwareMaterials: [],
    coreMaterials: [],
    loadFade: 0,
    isLoaded: false,
  };
}

function buildCustomDropInRig(): CustomDropInRig {
  const root = new THREE.Group();
  root.name = 'studio-custom-mannequin';
  root.visible = false;

  const modelSlot = new THREE.Group();
  modelSlot.name = 'studio-custom-mannequin-slot';
  root.add(modelSlot);

  return {
    root,
    modelSlot,
    loadedModel: null,
    mixer: null,
    standAction: null,
    walkAction: null,
    activeClip: 'stand',
    isLoaded: false,
  };
}

/**
 * Scales a loaded glTF scene cleanly via `Box3` to `targetHeight`, centers
 * X/Z to `0`, and grounds `box.min.y` flush at `y = 0` on the turntable.
 */
function normalizeModelToHeight(model: THREE.Object3D, targetHeight: number): number {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);

  let scaleFactor = 1;
  if (size.y > 1e-4) {
    scaleFactor = targetHeight / size.y;
    model.scale.multiplyScalar(scaleFactor);
  }

  model.updateMatrixWorld(true);
  box.setFromObject(model);
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  return scaleFactor;
}

function getAvatarAction(
  rig: FashionAvatarRig,
  pose: StageInteractionState['studioPose']
): THREE.AnimationAction | null {
  if (pose === 'walk') return rig.walkAction;
  if (pose === 'rain') return rig.rainAction;
  return rig.standAction;
}

function snapAvatarToReducedMotionPose(
  rig: FashionAvatarRig,
  pose: StageInteractionState['studioPose']
): void {
  if (!rig.mixer) return;
  const targetAction = getAvatarAction(rig, pose);
  if (!targetAction) return;

  const actions = [rig.standAction, rig.walkAction, rig.rainAction];
  for (const act of actions) {
    if (act && act !== targetAction) {
      act.stop();
    }
  }
  targetAction.enabled = true;
  targetAction.reset();
  targetAction.setEffectiveTimeScale(1);
  targetAction.setEffectiveWeight(1);
  targetAction.play();
  targetAction.time = AVATAR_REDUCED_MOTION_TIME[pose];
  rig.mixer.update(0);
  rig.activeClip = pose;
}

function prepareFashionAvatarModel(
  gltf: GLTF,
  targetRig: FashionAvatarRig,
  initialPose: StageInteractionState['studioPose'],
  reducedMotion: boolean
): void {
  const model = gltf.scene;
  targetRig.scaleFactor = normalizeModelToHeight(model, MANNEQUIN_TARGET_HEIGHT);

  const calibratedSet = new Set<THREE.Material>();
  targetRig.calibratedMaterials = [];
  targetRig.umbrellaHandBone = null;
  targetRig.umbrellaPalmMiddleBone = null;
  targetRig.umbrellaPalmThumbBone = null;
  targetRig.umbrellaAnchorSide = 'left';

  let rocketboxLeftHand: THREE.Object3D | null = null;
  let rocketboxLeftPalmMiddle: THREE.Object3D | null = null;
  let rocketboxLeftPalmThumb: THREE.Object3D | null = null;

  let mixamoRightHand: THREE.Object3D | null = null;
  let mixamoRightPalmMiddle: THREE.Object3D | null = null;
  let mixamoRightPalmThumb: THREE.Object3D | null = null;
  let fallbackRightHand: THREE.Object3D | null = null;

  model.traverse((obj) => {
    const objName = obj.name || '';
    if (/^Bip01[\s_]L[\s_]Hand$/i.test(objName)) {
      rocketboxLeftHand = obj;
    } else if (/^Bip01[\s_]L[\s_]Finger2$/i.test(objName)) {
      rocketboxLeftPalmMiddle = obj;
    } else if (/^Bip01[\s_]L[\s_]Finger01$/i.test(objName)) {
      rocketboxLeftPalmThumb = obj;
    } else if (objName === 'mixamorig_RightHand_037') {
      mixamoRightHand = obj;
    } else if (/RightHandMiddle1/i.test(objName)) {
      mixamoRightPalmMiddle = obj;
    } else if (/RightHandThumb2/i.test(objName)) {
      mixamoRightPalmThumb = obj;
    } else if (!mixamoRightHand && /RightHand(_\d+)?$/i.test(objName)) {
      mixamoRightHand = obj;
    } else if (
      !fallbackRightHand &&
      /RightHand/i.test(objName) &&
      !/Thumb|Index|Middle|Ring|Pinky/i.test(objName)
    ) {
      fallbackRightHand = obj;
    }

    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || calibratedSet.has(mat)) continue;
      calibratedSet.add(mat);

      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

      // Preserve ALL original PBR albedo/normal/roughness maps and gently
      // calibrate envMapIntensity & roughness for RoomEnvironment + ACESFilmic.
      const matName = (mat.name || '').toLowerCase();
      let baseEnv = 0.65;

      if (matName.includes('f020_body')) {
        // Rocketbox charcoal pinstripe wool tailored suit + white blouse + silver pendant
        baseEnv = 0.92;
        mat.roughness = Math.max(mat.roughness, 0.62);
        mat.transparent = false;
        mat.depthWrite = true;
      } else if (matName.includes('f020_head')) {
        // Rocketbox photorealistic studio face + sleek hair
        baseEnv = 0.68;
        mat.roughness = Math.max(mat.roughness, 0.52);
        mat.transparent = false;
        mat.depthWrite = true;
      } else if (matName.includes('f020_opacity')) {
        // Rocketbox eyelashes / fine hair strands
        baseEnv = 0.6;
        mat.transparent = false;
        mat.alphaTest = 0.42;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
      } else if (matName.includes('bodymat')) {
        baseEnv = 0.52;
        mat.roughness = Math.max(mat.roughness, 0.58);
        if (mat.transparent) {
          mat.transparent = false;
          mat.alphaTest = 0.45;
          mat.depthWrite = true;
        }
      } else if (matName.includes('hairmat')) {
        baseEnv = 0.55;
        mat.roughness = Math.max(mat.roughness, 0.54);
        if (mat.transparent) {
          mat.transparent = false;
          mat.alphaTest = 0.35;
          mat.depthWrite = true;
        }
      } else if (matName.includes('topmat')) {
        baseEnv = 0.92;
        if (mat.transparent) {
          mat.transparent = false;
          mat.depthWrite = true;
        }
      } else if (matName.includes('bottommat')) {
        baseEnv = 0.5;
        mat.roughness = Math.max(mat.roughness, 0.78);
        if (mat.transparent) {
          mat.transparent = false;
          mat.depthWrite = true;
        }
      } else if (matName.includes('shoesmat')) {
        baseEnv = 0.78;
        if (mat.transparent) {
          mat.transparent = false;
          mat.depthWrite = true;
        }
      }

      mat.envMapIntensity = baseEnv;
      mat.userData.baseEnvMapIntensity = baseEnv;
      mat.needsUpdate = true;
      targetRig.calibratedMaterials.push(mat);
    }
  });

  if (rocketboxLeftHand || (rocketboxLeftPalmMiddle && rocketboxLeftPalmThumb)) {
    targetRig.umbrellaAnchorSide = 'left';
    targetRig.umbrellaHandBone = rocketboxLeftHand;
    targetRig.umbrellaPalmMiddleBone = rocketboxLeftPalmMiddle;
    targetRig.umbrellaPalmThumbBone = rocketboxLeftPalmThumb;
  } else if (
    mixamoRightHand ||
    fallbackRightHand ||
    (mixamoRightPalmMiddle && mixamoRightPalmThumb)
  ) {
    targetRig.umbrellaAnchorSide = 'right';
    targetRig.umbrellaHandBone = mixamoRightHand ?? fallbackRightHand;
    targetRig.umbrellaPalmMiddleBone = mixamoRightPalmMiddle;
    targetRig.umbrellaPalmThumbBone = mixamoRightPalmThumb;
  }

  // Bind 3-clip AnimationMixer ('Stand', 'Walk', 'Rain') with case-insensitive fallback
  if (gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    const standClip =
      gltf.animations.find((clip) => /^stand$/i.test(clip.name)) ??
      gltf.animations.find((clip) => /stand|idle|breath/i.test(clip.name)) ??
      gltf.animations[0];
    const walkClip =
      gltf.animations.find((clip) => /^walk$/i.test(clip.name)) ??
      gltf.animations.find((clip) => /walk|run|stride|catwalk/i.test(clip.name)) ??
      standClip;
    const rainClip =
      gltf.animations.find((clip) => /^rain$/i.test(clip.name)) ??
      gltf.animations.find((clip) => /rain|umbrella|shelter/i.test(clip.name)) ??
      standClip;

    const standAction = mixer.clipAction(standClip);
    standAction.setLoop(THREE.LoopRepeat, Infinity);

    const walkAction =
      walkClip === standClip ? standAction : mixer.clipAction(walkClip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);

    const rainAction =
      rainClip === standClip
        ? standAction
        : rainClip === walkClip
          ? walkAction
          : mixer.clipAction(rainClip);
    rainAction.setLoop(THREE.LoopRepeat, Infinity);

    targetRig.mixer = mixer;
    targetRig.standAction = standAction;
    targetRig.walkAction = walkAction;
    targetRig.rainAction = rainAction;
    targetRig.wasReducedMotion = reducedMotion;

    if (reducedMotion) {
      snapAvatarToReducedMotionPose(targetRig, initialPose);
    } else {
      const startAction = getAvatarAction(targetRig, initialPose) ?? standAction;
      startAction.enabled = true;
      startAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      mixer.update(0);
      targetRig.activeClip = initialPose;
    }
  }

  targetRig.loadedModel = model;
  targetRig.modelSlot.add(model);
  targetRig.isLoaded = true;
  targetRig.loadFade = reducedMotion ? 1 : 0;
  targetRig.modelSlot.scale.setScalar(reducedMotion ? 1 : 0.985);
}

function prepareCoutureCoatModel(
  gltf: GLTF,
  targetRig: CoutureCoatRig,
  reducedMotion: boolean
): void {
  const model = gltf.scene;
  normalizeModelToHeight(model, COUTURE_COAT_TARGET_HEIGHT);

  const seenMaterials = new Set<THREE.Material>();
  targetRig.fabricMaterials = [];
  targetRig.hardwareMaterials = [];
  targetRig.coreMaterials = [];

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || seenMaterials.has(mat)) continue;
      seenMaterials.add(mat);

      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

      const matName = (mat.name || '').toLowerCase();
      if (matName.includes('button') || matName.includes('gold') || matName.includes('hardware')) {
        mat.envMapIntensity = 1.25;
        mat.userData.baseEnvMapIntensity = 1.25;
        targetRig.hardwareMaterials.push(mat);
      } else if (matName.includes('obsidian') || matName.includes('core') || matName.includes('bust')) {
        mat.envMapIntensity = 0.95;
        mat.userData.baseEnvMapIntensity = 0.95;
        targetRig.coreMaterials.push(mat);
      } else {
        // Woven wool coat fabric: restrain envMapIntensity so ivory wool never blows out under ACESFilmic
        mat.envMapIntensity = 0.65;
        mat.userData.baseEnvMapIntensity = 0.65;
        targetRig.fabricMaterials.push(mat);
      }
      mat.needsUpdate = true;
    }
  });

  targetRig.loadedModel = model;
  targetRig.modelSlot.add(model);
  targetRig.isLoaded = true;
  targetRig.loadFade = reducedMotion ? 1 : 0;
  targetRig.modelSlot.scale.setScalar(reducedMotion ? 1 : 0.985);
}

function prepareCustomDropInModel(gltf: GLTF, targetRig: CustomDropInRig): void {
  const model = gltf.scene;
  normalizeModelToHeight(model, CUSTOM_MANNEQUIN_TARGET_HEIGHT);

  // Tune Showroom IBL & sheen across all imported PBR meshes
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.envMapIntensity = 1.2;
        mat.sheen = Math.max(mat.sheen, 0.55);
        mat.needsUpdate = true;
      } else if (mat instanceof THREE.MeshStandardMaterial) {
        mat.envMapIntensity = 1.2;
        mat.needsUpdate = true;
      }
    }
  });

  // Bind Stand / Walk animation clips when embedded animations exist
  if (gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    const standClip =
      gltf.animations.find((clip) => /stand|idle|breath/i.test(clip.name)) ??
      gltf.animations[0];
    const walkClip =
      gltf.animations.find((clip) => /walk|run|stride|catwalk/i.test(clip.name)) ??
      gltf.animations[1] ??
      standClip;

    const standAction = mixer.clipAction(standClip);
    const walkAction = walkClip === standClip ? standAction : mixer.clipAction(walkClip);
    standAction.play();

    targetRig.mixer = mixer;
    targetRig.standAction = standAction;
    targetRig.walkAction = walkAction;
    targetRig.activeClip = 'stand';
  }

  targetRig.loadedModel = model;
  targetRig.modelSlot.add(model);
  targetRig.isLoaded = true;
}

/* ==========================================================================
 * 8. 3D Diagonal Raindrop Streaks Builder (`THREE.LineSegments`)
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
 * 9. Curved Front Champagne-Gold 360° Dial Track Builder
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
 * 10. Dedicated Couture Showroom Lighting Rig (Calibrated for ACESFilmic + RoomEnv)
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

  // Key Light: upper left-front soft warm white (#FFF7EB, intensity 1.72)
  const keyLight = new THREE.DirectionalLight(0xfff7eb, 1.72);
  keyLight.position.set(-3.0, 4.2, 3.8);
  group.add(keyLight);

  // Rim Light: rear-right champagne gold rim (#E6C792, intensity 3.2) carving silhouette
  const rimLight = new THREE.DirectionalLight(0xe6c792, 3.2);
  rimLight.position.set(3.2, 2.8, -3.1);
  group.add(rimLight);

  // Fill Light: lower left-front cool silver (#8FA8C8, intensity 0.64)
  const coolFillLight = new THREE.DirectionalLight(0x8fa8c8, 0.64);
  coolFillLight.position.set(-2.6, -0.35, 3.1);
  group.add(coolFillLight);

  // Gentle low-intensity hemisphere bounce preserving dark fabric contrast
  const fillLight = new THREE.HemisphereLight(0xf6efe6, 0x1e1a16, 0.48);
  group.add(fillLight);

  // Subtle luminous pedestal under-glow grazing turntable and lower contour
  const pedestalGlow = new THREE.PointLight(0xe5d1ab, 1.15, 6.2, 2);
  pedestalGlow.position.set(-0.2, -0.72, 1.25);
  group.add(pedestalGlow);

  return { group, keyLight, rimLight, coolFillLight, fillLight, pedestalGlow };
}

/* ==========================================================================
 * 11. StageModule Factory: createStudioStage()
 * ========================================================================== */

export function createStudioStage(options?: StudioStageOptions): StageModule {
  const group = new THREE.Group();
  group.name = 'stage-studio';

  let disposed = false;
  let currentGlassRatio = 0.5;
  let currentMood: MoodMode = 'luxury';
  let currentTheme: ThemeMode = 'dark';
  let currentSubtab: StageInteractionState['studioSubtab'] = 'atelier';
  let currentPose: StageInteractionState['studioPose'] = 'stand';
  let currentReducedMotion = false;
  let requestedModelMode: StageInteractionState['studioModelMode'] = 'mannequin';
  let userExplicitlySelectedDressform = false;
  let avatarLoadStarted = false;
  let coutureCoatLoadStarted = false;

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
  const auxHandWorldPos = new THREE.Vector3();
  const invTurntableMatrix = new THREE.Matrix4();

  // Build shared procedural textures & scene components
  const woolBumpTex = createWoolWeaveBumpTexture(256);

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

  // Shared soft contact shadow grounding avatar sneakers or couture stand on turntable
  const contactShadowTex = createRadialShadowTexture(64);
  const contactShadowGeo = new THREE.PlaneGeometry(0.92, 0.72);
  contactShadowGeo.rotateX(-Math.PI * 0.5);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    color: 0x050508,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.position.set(0, 0.004, 0.04);
  turntableGroup.add(contactShadowMesh);

  // Instant Zero-Blank-Frame Placeholder: Procedural Obsidian Couture Dress Form
  // Displayed ONLY while the active Hugging Face GLB streams (~200ms) or in SSR/offline fallback.
  const dressForm = buildAtelierDressForm(
    woolBumpTex,
    currentGlassRatio,
    currentMood,
    currentTheme
  );
  turntableGroup.add(dressForm.group);

  // Primary Default ('mannequin'): 48k-tri Rocketbox 2K PBR Pinstripe-Suit Editorial Avatar
  const avatar = buildFashionAvatarRig();
  turntableGroup.add(avatar.root);

  // Upgraded Couture Mode ('dressform'): Hugging Face Woven-Wool Trench Coat + iNVTRY Gold Stand
  const coutureCoat = buildCoutureCoatRig();
  turntableGroup.add(coutureCoat.root);

  // Silent Auto Drop-In: Optional user-provided `/models/mannequin.glb` (with lazy Draco support)
  const customDropIn = buildCustomDropInRig();
  turntableGroup.add(customDropIn.root);

  // Shared translucent smoked-glass champagne umbrella (mounted in turntable space)
  const umbrella = buildUmbrella(currentGlassRatio, currentMood, currentTheme);
  turntableGroup.add(umbrella.group);

  const rain = buildRainStreaks();
  group.add(rain.lines);

  const dialTrack = buildDialTrack(currentMood, currentTheme);
  group.add(dialTrack.group);

  /* ------------------------------------------------------------------------
   * Dual-Mode Model Resolution & Abort-Safe GLTF / Lazy-Draco Loader Pipeline
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

  const canFetchInBrowser = typeof window !== 'undefined' && typeof fetch === 'function';
  const loadAbortController =
    canFetchInBrowser && typeof AbortController !== 'undefined' ? new AbortController() : null;

  let standardGltfLoader: GLTFLoader | null = null;
  let dracoGltfLoader: GLTFLoader | null = null;
  let dracoLoader: DRACOLoader | null = null;
  let activeParseCount = 0;
  let latestEmitUiSync: StageContext['emitUiSync'] | null = null;

  const disposeLoadersIfIdle = (): void => {
    if (!disposed || activeParseCount > 0) return;
    dracoLoader?.dispose();
    dracoLoader = null;
    dracoGltfLoader = null;
    standardGltfLoader = null;
  };

  /** Plain GLTFLoader for uncompressed WebP GLBs (no DRACOLoader overhead). */
  const getStandardGltfLoader = (): GLTFLoader | null => {
    if (!canFetchInBrowser || disposed) return null;
    if (!standardGltfLoader) {
      standardGltfLoader = new GLTFLoader();
    }
    return standardGltfLoader;
  };

  /** Lazy Draco-enabled GLTFLoader instantiated ONLY when custom `/models/mannequin.glb` is present. */
  const getDracoGltfLoader = (): GLTFLoader | null => {
    if (!canFetchInBrowser || disposed) return null;
    if (!dracoGltfLoader) {
      dracoGltfLoader = new GLTFLoader();
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
      dracoGltfLoader.setDRACOLoader(dracoLoader);
    }
    return dracoGltfLoader;
  };

  const fetchVerifiedGlbBuffer = (url: string): Promise<ArrayBuffer | null> =>
    fetch(url, {
      signal: loadAbortController?.signal,
    })
      .then((res) => {
        if (!res.ok) return null;
        const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('text/html')) return null;
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed || !buffer || !isValidGlbBuffer(buffer)) return null;
        return buffer;
      })
      .catch(() => null);

  /* ------------------------------------------------------------------------
   * PBR Material Calibration Helpers for Loaded Hugging Face GLBs
   * ------------------------------------------------------------------------ */

  const syncAvatarMaterials = (): void => {
    if (!avatar.isLoaded) return;
    const themeScale = currentTheme === 'dark' ? 1.0 : 0.88;
    const glassBoost = THREE.MathUtils.lerp(0.96, 1.06, currentGlassRatio);
    for (const mat of avatar.calibratedMaterials) {
      const baseEnv =
        typeof mat.userData.baseEnvMapIntensity === 'number'
          ? (mat.userData.baseEnvMapIntensity as number)
          : 0.65;
      mat.envMapIntensity = baseEnv * themeScale * glassBoost;
    }
  };

  const syncCoutureCoatMaterials = (): void => {
    if (!coutureCoat.isLoaded) return;
    const isDark = currentTheme === 'dark';
    const isAurora = currentMood === 'aurora';
    const themeScale = isDark ? 1.0 : 0.86;

    // Subtle sheen & ambient response on woven wool coat without blowing out ivory highlights
    const fabricScale = THREE.MathUtils.lerp(0.94, 1.12, currentGlassRatio) * themeScale;
    for (const mat of coutureCoat.fabricMaterials) {
      const baseEnv =
        typeof mat.userData.baseEnvMapIntensity === 'number'
          ? (mat.userData.baseEnvMapIntensity as number)
          : 0.65;
      mat.envMapIntensity = baseEnv * fabricScale;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.sheen = THREE.MathUtils.lerp(0.48, 0.88, currentGlassRatio);
      }
    }

    // Gold hardware & brass buttons: preserve textured buttons, harmonize untextured stand gold with Mood × Theme
    const hardwareScale = THREE.MathUtils.lerp(0.95, 1.16, currentGlassRatio) * (isDark ? 1.0 : 0.88);
    for (const mat of coutureCoat.hardwareMaterials) {
      const baseEnv =
        typeof mat.userData.baseEnvMapIntensity === 'number'
          ? (mat.userData.baseEnvMapIntensity as number)
          : 1.25;
      mat.envMapIntensity = baseEnv * hardwareScale;
      if (!mat.map) {
        mat.color.setHex(
          isAurora
            ? isDark
              ? STAGE_PALETTE.auroraSilverGold
              : STAGE_PALETTE.auroraSilverLightTheme
            : isDark
              ? STAGE_PALETTE.champagneGold
              : STAGE_PALETTE.champagneGoldLightTheme
        );
      }
    }

    // Obsidian atelier bust & collar: subtle clearcoat gloss response to Glass %
    for (const mat of coutureCoat.coreMaterials) {
      const baseEnv =
        typeof mat.userData.baseEnvMapIntensity === 'number'
          ? (mat.userData.baseEnvMapIntensity as number)
          : 0.95;
      mat.envMapIntensity = baseEnv * THREE.MathUtils.lerp(0.9, 1.32, currentGlassRatio);
      mat.roughness = THREE.MathUtils.lerp(0.44, 0.24, currentGlassRatio);
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = THREE.MathUtils.lerp(0.35, 0.9, currentGlassRatio);
      }
    }
  };

  /* ------------------------------------------------------------------------
   * Model Loading & Zero-Blank-Frame Visibility Resolution
   * ------------------------------------------------------------------------ */

  const loadCoutureCoat = (): void => {
    if (coutureCoatLoadStarted || disposed || !canFetchInBrowser) return;
    coutureCoatLoadStarted = true;

    void fetchVerifiedGlbBuffer(HF_COUTURE_COAT_GLB_URL).then((buffer) => {
      if (disposed || !buffer) return;
      const loader = getStandardGltfLoader();
      if (!loader) return;
      activeParseCount += 1;
      loader.parse(
        buffer,
        '',
        (gltf) => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          if (disposed) {
            disposeSkeletons(gltf.scene);
            disposeObject3D(gltf.scene);
            disposeLoadersIfIdle();
            return;
          }
          prepareCoutureCoatModel(gltf, coutureCoat, currentReducedMotion);
          syncCoutureCoatMaterials();
          syncActiveModelVisibility();
          options?.onModelLoaded?.();
        },
        () => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          disposeLoadersIfIdle();
          // Silently retain procedural Obsidian Couture Dress Form fallback if parse fails
        }
      );
    });
  };

  const loadFashionAvatar = (): void => {
    if (avatarLoadStarted || disposed || !canFetchInBrowser) return;
    avatarLoadStarted = true;

    void fetchVerifiedGlbBuffer(HF_FASHION_AVATAR_GLB_URL).then((buffer) => {
      if (disposed || !buffer) return;
      const loader = getStandardGltfLoader();
      if (!loader) return;
      activeParseCount += 1;
      loader.parse(
        buffer,
        '',
        (gltf) => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          if (disposed) {
            disposeSkeletons(gltf.scene);
            disposeObject3D(gltf.scene);
            disposeLoadersIfIdle();
            return;
          }
          prepareFashionAvatarModel(gltf, avatar, currentPose, currentReducedMotion);
          syncAvatarMaterials();
          syncActiveModelVisibility();
          options?.onModelLoaded?.();

          // Gently preload the Couture Trench Coat GLB after the primary avatar lands
          loadCoutureCoat();
        },
        () => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          disposeLoadersIfIdle();
          // Silently retain procedural Obsidian Couture Dress Form fallback if parse fails
        }
      );
    });
  };

  const resolveActiveModelKind = (): ActiveModelKind => {
    if (customDropIn.isLoaded && !userExplicitlySelectedDressform) {
      return 'custom';
    }
    if (requestedModelMode === 'mannequin') {
      if (customDropIn.isLoaded) return 'custom';
      return avatar.isLoaded ? 'avatar' : 'dressformFallback';
    }
    return coutureCoat.isLoaded ? 'coutureCoat' : 'dressformFallback';
  };

  const syncActiveModelVisibility = (): ActiveModelKind => {
    if (requestedModelMode === 'mannequin' && !avatar.isLoaded && !avatarLoadStarted) {
      loadFashionAvatar();
    } else if (requestedModelMode === 'dressform' && !coutureCoat.isLoaded && !coutureCoatLoadStarted) {
      loadCoutureCoat();
    }

    const activeKind = resolveActiveModelKind();
    avatar.root.visible = activeKind === 'avatar';
    coutureCoat.root.visible = activeKind === 'coutureCoat';
    dressForm.group.visible = activeKind === 'dressformFallback';
    customDropIn.root.visible = activeKind === 'custom';
    return activeKind;
  };

  // Kick off primary Hugging Face Fashion Avatar stream immediately upon stage creation
  if (canFetchInBrowser) {
    loadFashionAvatar();

    // Silent Auto Drop-In Check for `/models/mannequin.glb` (zero console errors & zero Draco allocation if absent)
    void fetchVerifiedGlbBuffer(CUSTOM_MANNEQUIN_GLB_URL).then((buffer) => {
      if (disposed || !buffer) return;
      const loader = getDracoGltfLoader();
      if (!loader) return;
      activeParseCount += 1;
      loader.parse(
        buffer,
        '',
        (gltf) => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          if (disposed) {
            disposeSkeletons(gltf.scene);
            disposeObject3D(gltf.scene);
            disposeLoadersIfIdle();
            return;
          }
          prepareCustomDropInModel(gltf, customDropIn);
          if (!userExplicitlySelectedDressform) {
            requestedModelMode = 'mannequin';
            latestEmitUiSync?.({ studioModelMode: 'mannequin' });
          }
          syncActiveModelVisibility();
          options?.onModelLoaded?.();
        },
        () => {
          activeParseCount = Math.max(0, activeParseCount - 1);
          disposeLoadersIfIdle();
          // Silently fall back to built-in Hugging Face showroom on corrupt custom drop-in
        }
      );
    });
  }

  /* ------------------------------------------------------------------------
   * Visual Mode & Glass Synchronization
   * ------------------------------------------------------------------------ */

  const syncGlass = (ratio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(ratio, 0, 1);

    applySmokedGlassState(pedestal.glassMat, currentGlassRatio, currentMood, currentTheme);
    applySmokedGlassState(umbrella.canopyMat, currentGlassRatio, currentMood, currentTheme);

    const baseCanopyOpacity = umbrella.canopyMat.opacity;
    umbrella.canopyMat.userData.targetOpacity = baseCanopyOpacity;
    umbrella.canopyMat.opacity = baseCanopyOpacity * rainBlend;

    // Subtle smoked-glass translucency & clearcoat on fallback Dress Form revealing internal gold spine
    dressForm.torsoMat.opacity = THREE.MathUtils.lerp(1.0, 0.76, currentGlassRatio);
    dressForm.torsoMat.clearcoat = THREE.MathUtils.lerp(0.25, 0.85, currentGlassRatio);
    dressForm.torsoMat.roughness = THREE.MathUtils.lerp(0.42, 0.26, currentGlassRatio);
    applyBrushedGoldHardwareMode(
      dressForm.coreSpineMat,
      currentMood,
      currentTheme,
      THREE.MathUtils.lerp(0.18, 0.74, currentGlassRatio)
    );

    syncAvatarMaterials();
    syncCoutureCoatMaterials();

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
    applyGoldModeState(orbitals.arcGlowMat, mood, theme, 0.85);
    orbitals.arcGlowMat.emissiveIntensity = isDark ? 0.85 : 0.52;
    applyGoldModeState(orbitals.sparkMat, mood, theme, 0.94);
    applyGoldModeState(dialTrack.bandMat, mood, theme, 0.28);
    applyGoldModeState(dialTrack.railGlowMat, mood, theme, 0.64);
    applyGoldModeState(umbrella.goldMat, mood, theme, 0.34);

    // Fallback Couture Dress Form PBR & brushed gold hardware calibrated for Mood × Theme
    applyBrushedGoldHardwareMode(dressForm.goldHardwareMat, mood, theme, 0.14);
    applyBrushedGoldHardwareMode(dressForm.measureRingMat, mood, theme, 0.38);
    applyBrushedGoldHardwareMode(dressForm.seamGlintMat, mood, theme, 0.85);
    dressForm.plinthInlayMat.color.setHex(
      isDark ? (isAurora ? 0x151a24 : 0x16171c) : isAurora ? 0x263144 : 0x242328
    );
    dressForm.torsoMat.color.setHex(
      isDark ? (isAurora ? 0x171b24 : 0x1a1b20) : isAurora ? 0x212836 : 0x23242b
    );
    dressForm.torsoMat.sheenColor.setHex(
      isAurora ? (isDark ? 0x9ec4f6 : 0x7398c8) : 0xd6b889
    );

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
    contactShadowMat.color.setHex(isDark ? 0x040407 : 0x2d2924);
    contactShadowMat.opacity = isDark ? 0.72 : 0.4;

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

    // Luxury Showroom Lighting Rig calibrated for ACESFilmic + RoomEnvironment
    if (isDark) {
      lights.keyLight.color.setHex(isAurora ? 0xeaf2ff : 0xfff7eb);
      lights.keyLight.intensity = 1.72;
      lights.rimLight.color.setHex(isAurora ? 0x9ec4f6 : 0xe6c792);
      lights.rimLight.intensity = 3.2;
      lights.coolFillLight.color.setHex(isAurora ? 0x98b8e6 : 0x8fa8c8);
      lights.coolFillLight.intensity = 0.64;
      lights.fillLight.color.setHex(isAurora ? 0xcadbf5 : 0xf6efe6);
      lights.fillLight.groundColor.setHex(isAurora ? 0x151d2e : 0x1e1a16);
      lights.fillLight.intensity = 0.48;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8fb6ec : STAGE_PALETTE.champagneGoldBright);
      lights.pedestalGlow.intensity = 1.15;
    } else {
      lights.keyLight.color.setHex(isAurora ? 0xf3f7ff : 0xfff9f0);
      lights.keyLight.intensity = 1.75;
      lights.rimLight.color.setHex(isAurora ? 0x8fb5e6 : 0xdcb982);
      lights.rimLight.intensity = 2.25;
      lights.coolFillLight.color.setHex(isAurora ? 0xb4ccf0 : 0x9eb4d0);
      lights.coolFillLight.intensity = 0.68;
      lights.fillLight.color.setHex(0xffffff);
      lights.fillLight.groundColor.setHex(isAurora ? 0xc2d0e4 : 0xdad2c6);
      lights.fillLight.intensity = 1.12;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8eaad6 : 0xc8a46e);
      lights.pedestalGlow.intensity = 0.72;
    }
  };

  /* ------------------------------------------------------------------------
   * Procedural Fallback Choreography: Obsidian Couture Dress Form
   * ------------------------------------------------------------------------ */

  const applyDressFormPose = (elapsed: number, reducedMotion: boolean): void => {
    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    const breathWave = reducedMotion ? 0 : Math.sin(elapsed * 1.85);
    const walkPhase = reducedMotion ? 0.65 : elapsed * 3.8;
    const gaitWave = Math.sin(walkPhase);
    const gaitLift = Math.abs(gaitWave);

    // Subtle couture breathing float in Stand + rhythmic runway stride lift in Walk
    const floatY =
      breathWave * 0.013 * (standWeight + rainBlend * 0.45) +
      gaitLift * 0.024 * walkBlend;
    dressForm.torsoPivot.position.y = TORSO_PIVOT_Y + floatY;

    // Hover parallax tilt + runway contrapposto yaw/sway + sheltered rain lean
    const pitchX =
      hoverSmoothY * 0.042 * (standWeight + rainBlend * 0.5) +
      (0.026 + gaitLift * 0.016) * walkBlend +
      0.045 * rainBlend;
    const yawY =
      hoverSmoothX * 0.085 * standWeight +
      gaitWave * 0.145 * walkBlend +
      (reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.03 * standWeight) -
      0.04 * rainBlend;
    const rollZ =
      -hoverSmoothX * 0.028 * standWeight -
      gaitWave * 0.048 * walkBlend -
      0.055 * rainBlend;

    dressForm.torsoPivot.rotation.set(pitchX, yawY, rollZ);

    // Calm golden tailoring ring pulse in Stand, accelerated runway shimmer in Walk
    const ringPulseFreq = 2.0 + walkBlend * 3.4;
    const ringPulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * ringPulseFreq);
    const themeScale = currentTheme === 'dark' ? 1.0 : 0.62;
    dressForm.measureRingMat.emissiveIntensity =
      (0.28 + ringPulse * (0.24 + 0.28 * walkBlend)) * themeScale;
    dressForm.seamGlintMat.emissiveIntensity =
      (0.68 + ringPulse * (0.34 + 0.36 * walkBlend)) * themeScale;
  };

  /* ------------------------------------------------------------------------
   * Primary Avatar Choreography: 3-Clip AnimationMixer (`Stand` / `Walk` / `Rain`)
   * ------------------------------------------------------------------------ */

  const applyAvatarPose = (
    dt: number,
    pose: StageInteractionState['studioPose'],
    reducedMotion: boolean
  ): void => {
    if (!avatar.isLoaded) return;

    // Subtle arrival settle (feet stay locked at y = 0 since modelSlot origin sits at y = 0)
    if (avatar.loadFade < 1) {
      avatar.loadFade = reducedMotion ? 1 : Math.min(1, avatar.loadFade + dt * 4.2);
      const eased = avatar.loadFade * avatar.loadFade * (3 - 2 * avatar.loadFade);
      avatar.modelSlot.scale.setScalar(0.985 + 0.015 * eased);
    }

    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    avatar.modelSlot.rotation.set(
      0,
      reducedMotion ? 0 : hoverSmoothX * 0.055 * standWeight,
      0
    );

    if (!avatar.mixer) return;

    if (reducedMotion) {
      if (!avatar.wasReducedMotion || avatar.activeClip !== pose) {
        snapAvatarToReducedMotionPose(avatar, pose);
      } else {
        avatar.mixer.update(0);
      }
      avatar.wasReducedMotion = true;
      return;
    }

    if (avatar.wasReducedMotion) {
      // Resume live loop cleanly from current pose after reduced-motion pause
      const activeAction = getAvatarAction(avatar, pose);
      if (activeAction) {
        const actions = [avatar.standAction, avatar.walkAction, avatar.rainAction];
        for (const act of actions) {
          if (act && act !== activeAction) act.stop();
        }
        activeAction.enabled = true;
        activeAction.setEffectiveTimeScale(1);
        activeAction.setEffectiveWeight(1);
        activeAction.play();
      }
      avatar.activeClip = pose;
      avatar.wasReducedMotion = false;
    } else if (pose !== avatar.activeClip) {
      const prevAction = getAvatarAction(avatar, avatar.activeClip);
      const nextAction = getAvatarAction(avatar, pose);
      if (prevAction && nextAction && prevAction !== nextAction) {
        nextAction.enabled = true;
        nextAction.reset();
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.play();
        prevAction.crossFadeTo(nextAction, AVATAR_CROSSFADE_SEC, false);
      }
      avatar.activeClip = pose;
    }

    avatar.mixer.update(dt);
  };

  /* ------------------------------------------------------------------------
   * Couture Coat Choreography: Stand / Gentle Runway Sway / Sheltered Rain
   * ------------------------------------------------------------------------ */

  const applyCoutureCoatPose = (
    dt: number,
    elapsed: number,
    reducedMotion: boolean
  ): void => {
    if (!coutureCoat.isLoaded) return;

    if (coutureCoat.loadFade < 1) {
      coutureCoat.loadFade = reducedMotion ? 1 : Math.min(1, coutureCoat.loadFade + dt * 4.2);
      const eased = coutureCoat.loadFade * coutureCoat.loadFade * (3 - 2 * coutureCoat.loadFade);
      coutureCoat.modelSlot.scale.setScalar(0.985 + 0.015 * eased);
    }

    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    const breathWave = reducedMotion ? 0 : Math.sin(elapsed * 1.75);
    const walkPhase = reducedMotion ? 0.65 : elapsed * 3.6;
    const gaitWave = Math.sin(walkPhase);
    const gaitLift = Math.abs(gaitWave);

    coutureCoat.modelSlot.position.y =
      Math.max(0, breathWave * 0.006 * standWeight + gaitLift * 0.018 * walkBlend);

    const pitchX =
      hoverSmoothY * 0.032 * (standWeight + rainBlend * 0.5) +
      (0.018 + gaitLift * 0.012) * walkBlend +
      0.032 * rainBlend;
    const yawY =
      hoverSmoothX * 0.07 * standWeight +
      gaitWave * 0.125 * walkBlend +
      (reducedMotion ? 0 : Math.sin(elapsed * 0.68) * 0.025 * standWeight) -
      0.035 * rainBlend;
    const rollZ =
      -hoverSmoothX * 0.022 * standWeight -
      gaitWave * 0.036 * walkBlend -
      0.04 * rainBlend;

    coutureCoat.modelSlot.rotation.set(pitchX, yawY, rollZ);
  };

  /* ------------------------------------------------------------------------
   * Auto Drop-In Choreography: Custom `/models/mannequin.glb`
   * ------------------------------------------------------------------------ */

  const applyCustomDropInPose = (
    dt: number,
    elapsed: number,
    pose: StageInteractionState['studioPose'],
    reducedMotion: boolean
  ): void => {
    if (!customDropIn.isLoaded) return;

    if (customDropIn.mixer && customDropIn.standAction && customDropIn.walkAction) {
      const desiredClip: 'stand' | 'walk' = pose === 'walk' ? 'walk' : 'stand';
      if (desiredClip !== customDropIn.activeClip && customDropIn.standAction !== customDropIn.walkAction) {
        const fromAction =
          customDropIn.activeClip === 'walk'
            ? customDropIn.walkAction
            : customDropIn.standAction;
        const toAction =
          desiredClip === 'walk' ? customDropIn.walkAction : customDropIn.standAction;
        toAction.reset().play();
        fromAction.crossFadeTo(toAction, 0.35, false);
        customDropIn.activeClip = desiredClip;
      }
      customDropIn.mixer.update(reducedMotion ? 0 : dt);
      customDropIn.modelSlot.position.y = 0;
      customDropIn.modelSlot.rotation.set(0.02 * rainBlend, hoverSmoothX * 0.06, -0.025 * rainBlend);
      return;
    }

    // Static custom GLB fallback: smooth breathing float & subtle pose response
    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    const breathWave = reducedMotion ? 0 : Math.sin(elapsed * 1.9);
    const walkWave = reducedMotion ? 0 : Math.sin(elapsed * 3.8);
    customDropIn.modelSlot.position.y =
      breathWave * 0.012 * (standWeight + rainBlend * 0.5) +
      Math.abs(walkWave) * 0.02 * walkBlend;
    customDropIn.modelSlot.rotation.set(
      hoverSmoothY * 0.03 + 0.03 * rainBlend,
      hoverSmoothX * 0.07 * standWeight + walkWave * 0.1 * walkBlend,
      -walkWave * 0.03 * walkBlend - 0.035 * rainBlend
    );
  };

  /* ------------------------------------------------------------------------
   * Shared Smoked-Glass Champagne Umbrella Tracking
   * ------------------------------------------------------------------------ */

  const updateUmbrella = (
    activeKind: ActiveModelKind,
    elapsed: number,
    reducedMotion: boolean
  ): void => {
    const showUmbrella = rainBlend > 0.015;
    umbrella.group.visible = showUmbrella;
    if (!showUmbrella) return;

    // Smoothly unfold from 0 -> 1 over the first 45% of rainBlend (no pop-in)
    const unfoldT = THREE.MathUtils.clamp((rainBlend - 0.015) / 0.435, 0, 1);
    const unfoldScale = unfoldT * unfoldT * (3 - 2 * unfoldT);
    const easedFade = rainBlend * rainBlend * (3 - 2 * rainBlend);
    umbrella.group.scale.setScalar(Math.max(0.001, unfoldScale));

    const rainBreeze = reducedMotion ? 0 : Math.sin(elapsed * 2.8) * 0.025;

    if (activeKind === 'avatar' && avatar.isLoaded) {
      turntableGroup.updateMatrixWorld(true);
      invTurntableMatrix.copy(turntableGroup.matrixWorld).invert();

      if (avatar.umbrellaPalmMiddleBone && avatar.umbrellaPalmThumbBone) {
        // Exact center of her closed fist between middle knuckle & thumb
        avatar.umbrellaPalmMiddleBone.getWorldPosition(handWorldPos);
        avatar.umbrellaPalmThumbBone.getWorldPosition(auxHandWorldPos);
        handWorldPos.add(auxHandWorldPos).multiplyScalar(0.5);
        handWorldPos.applyMatrix4(invTurntableMatrix);
      } else if (avatar.umbrellaHandBone) {
        avatar.umbrellaHandBone.getWorldPosition(handWorldPos);
        handWorldPos.applyMatrix4(invTurntableMatrix);
      } else {
        const s = avatar.scaleFactor;
        handWorldPos.set(
          AVATAR_RAIN_HAND_FALLBACK.x * s,
          AVATAR_RAIN_HAND_FALLBACK.y * s,
          AVATAR_RAIN_HAND_FALLBACK.z * s
        );
      }

      // Position handle grip cleanly in her raised hand; tilt canopy gracefully inward over head
      umbrella.group.position.copy(handWorldPos);
      if (avatar.umbrellaAnchorSide === 'left') {
        umbrella.group.rotation.set(-0.14 + rainBreeze * 0.45, 0, 0.11 + rainBreeze);
      } else {
        umbrella.group.rotation.set(-0.19 + rainBreeze * 0.45, 0, -0.14 + rainBreeze);
      }
    } else if (activeKind === 'coutureCoat') {
      // Suspended gracefully overhead above the 1.94u Couture Trench Coat & gold iNVTRY hook
      umbrella.group.position.set(-0.44, 1.1, -0.06);
      umbrella.group.rotation.set(0.04 + rainBreeze * 0.4, 0, -0.22 + rainBreeze);
    } else if (activeKind === 'dressformFallback') {
      // Suspended gracefully overhead above the 2.12u procedural fallback hanger hook
      umbrella.group.position.set(-0.46, 1.22, -0.08);
      umbrella.group.rotation.set(0.04 + rainBreeze * 0.4, 0, -0.25 + rainBreeze);
    } else {
      // Suspended cleanly overhead above the 1.8u auto-scaled custom mannequin
      umbrella.group.position.set(-0.42, 0.96, -0.06);
      umbrella.group.rotation.set(0.04 + rainBreeze * 0.4, 0, -0.22 + rainBreeze);
    }

    const targetOpacity =
      typeof umbrella.canopyMat.userData.targetOpacity === 'number'
        ? (umbrella.canopyMat.userData.targetOpacity as number)
        : 0.56;
    umbrella.canopyMat.opacity = targetOpacity * easedFade;
  };

  /* ------------------------------------------------------------------------
   * 3D Diagonal Rain Streaks & Orbital Systems
   * ------------------------------------------------------------------------ */

  const updateRainParticles = (
    activeKind: ActiveModelKind,
    dt: number,
    reducedMotion: boolean
  ): void => {
    const showRain = rainBlend > 0.02;
    rain.lines.visible = showRain;
    if (!showRain) return;

    const maxOpacity = currentTheme === 'dark' ? 0.54 : 0.46;
    rain.material.opacity = maxOpacity * rainBlend;

    if (reducedMotion) return;

    const deflectY =
      activeKind === 'avatar'
        ? UMBRELLA_DEFLECT_Y_AVATAR
        : activeKind === 'coutureCoat'
          ? UMBRELLA_DEFLECT_Y_COUTURE_COAT
          : activeKind === 'custom'
            ? UMBRELLA_DEFLECT_Y_CUSTOM
            : UMBRELLA_DEFLECT_Y_DRESSFORM;

    const { drops, positions } = rain;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y -= drop.speed * dt;
      drop.x -= drop.speed * 0.18 * dt;
      drop.z += drop.speed * 0.04 * dt;

      const horizontalSq = drop.x * drop.x + drop.z * drop.z;
      const hitUmbrella =
        horizontalSq < UMBRELLA_DEFLECT_RADIUS * UMBRELLA_DEFLECT_RADIUS &&
        drop.y <= deflectY &&
        drop.y > deflectY - 0.55;

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
    const walkBoost = 1.0 + walkBlend * 0.72;
    const isDark = currentTheme === 'dark';

    if (reducedMotion) {
      orbitals.outerSpin.rotation.z = 0;
      orbitals.innerSpin.rotation.z = 0;
      orbitals.outerPivot.rotation.set(Math.PI * 0.4 + subtabRingLift * 0.35, 0.22, -0.32);
      orbitals.innerPivot.rotation.set(Math.PI * 0.46 - subtabRingLift * 0.25, -0.26, 0.34);
      orbitals.group.position.y = 0.06 + subtabRingLift;
      orbitals.arcGlowMat.emissiveIntensity = isDark ? 0.85 : 0.52;
      orbitals.sparkMat.emissiveIntensity = isDark ? 0.94 : 0.58;
      return;
    }

    // Brisk counter-rotating orbital sweep
    orbitals.outerSpin.rotation.z = elapsed * 0.96 * subtabSpeed * walkBoost;
    orbitals.innerSpin.rotation.z = -elapsed * 1.28 * subtabSpeed * walkBoost;

    // Continuous 3D gyroscopic precession + graceful tilt wave on both orbital rings
    orbitals.outerPivot.rotation.set(
      Math.PI * 0.4 +
        Math.sin(elapsed * 0.68) * 0.14 +
        hoverSmoothY * 0.06 +
        subtabRingLift * 0.35,
      0.22 + elapsed * 0.38 * subtabSpeed * walkBoost + hoverSmoothX * 0.08,
      -0.32 + Math.cos(elapsed * 0.56) * 0.15
    );
    orbitals.innerPivot.rotation.set(
      Math.PI * 0.46 +
        Math.cos(elapsed * 0.62) * 0.16 -
        hoverSmoothY * 0.05 -
        subtabRingLift * 0.25,
      -0.26 - elapsed * 0.46 * subtabSpeed * walkBoost - hoverSmoothX * 0.07,
      0.34 + Math.sin(elapsed * 0.52) * 0.14
    );

    // Gentle vertical breathing float
    orbitals.group.position.y = 0.06 + subtabRingLift + Math.sin(elapsed * 0.92) * 0.038;

    // Subtle live shimmer pulse on sweeping luminous arcs & orbiting satellite orbs
    const shimmerWave = 0.5 + 0.5 * Math.sin(elapsed * 2.4);
    const sparkWave = 0.5 + 0.5 * Math.cos(elapsed * 3.1 + 0.7);
    orbitals.arcGlowMat.emissiveIntensity = isDark
      ? 0.76 + shimmerWave * 0.28
      : 0.46 + shimmerWave * 0.18;
    orbitals.sparkMat.emissiveIntensity = isDark
      ? 0.88 + sparkWave * 0.34
      : 0.54 + sparkWave * 0.22;

    const { seeds, positions } = starlight;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const a = s.baseAngle + elapsed * s.orbitSpeed;
      positions[i * 3] = Math.cos(a) * s.baseRadius;
      positions[i * 3 + 1] = s.baseY + Math.sin(elapsed * 1.15 + s.phase) * s.bobAmp;
      positions[i * 3 + 2] = Math.sin(a) * s.baseRadius;
    }
    starlight.positionAttr.needsUpdate = true;
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
      latestEmitUiSync = ctx.emitUiSync;
      currentAngleRad = ctx.interaction.studioAngleRad;
      currentSubtab = ctx.interaction.studioSubtab;
      currentPose = ctx.interaction.studioPose;
      currentReducedMotion = ctx.reducedMotion;

      if (
        customDropIn.isLoaded &&
        !userExplicitlySelectedDressform &&
        ctx.interaction.studioModelMode !== 'mannequin'
      ) {
        requestedModelMode = 'mannequin';
        ctx.emitUiSync({ studioModelMode: 'mannequin' });
      } else {
        requestedModelMode = ctx.interaction.studioModelMode;
        userExplicitlySelectedDressform = requestedModelMode === 'dressform';
      }

      walkBlend = currentPose === 'walk' ? 1 : 0;
      rainBlend = currentPose === 'rain' ? 1 : 0;
      turntableGroup.rotation.y = currentAngleRad;

      const activeKind = syncActiveModelVisibility();

      if (avatar.isLoaded && ctx.reducedMotion) {
        avatar.loadFade = 1;
        avatar.modelSlot.scale.setScalar(1);
      }
      if (coutureCoat.isLoaded && ctx.reducedMotion) {
        coutureCoat.loadFade = 1;
        coutureCoat.modelSlot.scale.setScalar(1);
      }

      syncVisualMode(ctx.mood, ctx.theme);
      syncGlass(ctx.glassRatio);
      if (activeKind === 'avatar') {
        applyAvatarPose(0, currentPose, ctx.reducedMotion);
      } else if (activeKind === 'coutureCoat') {
        applyCoutureCoatPose(0, 0, ctx.reducedMotion);
      } else if (activeKind === 'dressformFallback') {
        applyDressFormPose(0, ctx.reducedMotion);
      } else {
        applyCustomDropInPose(0, 0, currentPose, ctx.reducedMotion);
      }
      updateUmbrella(activeKind, 0, ctx.reducedMotion);
      updateOrbitalsAndDust(0, ctx.reducedMotion);
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
      if (patch.studioPose) {
        currentPose = patch.studioPose;
      }
      if (patch.studioModelMode) {
        requestedModelMode = patch.studioModelMode;
        userExplicitlySelectedDressform = patch.studioModelMode === 'dressform';
        syncActiveModelVisibility();
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
      currentReducedMotion = ctx.reducedMotion;
      currentPose = ctx.interaction.studioPose;

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

      const targetWalk = currentPose === 'walk' ? 1 : 0;
      const targetRain = currentPose === 'rain' ? 1 : 0;
      walkBlend = THREE.MathUtils.lerp(walkBlend, targetWalk, dampPose);
      rainBlend = THREE.MathUtils.lerp(rainBlend, targetRain, dampPose);

      currentSubtab = ctx.interaction.studioSubtab;
      if (requestedModelMode !== ctx.interaction.studioModelMode) {
        requestedModelMode = ctx.interaction.studioModelMode;
        userExplicitlySelectedDressform = requestedModelMode === 'dressform';
      }

      const activeKind = syncActiveModelVisibility();

      if (activeKind === 'avatar') {
        applyAvatarPose(dt, currentPose, ctx.reducedMotion);
      } else if (activeKind === 'coutureCoat') {
        applyCoutureCoatPose(dt, elapsed, ctx.reducedMotion);
      } else if (activeKind === 'dressformFallback') {
        applyDressFormPose(elapsed, ctx.reducedMotion);
      } else {
        applyCustomDropInPose(dt, elapsed, currentPose, ctx.reducedMotion);
      }

      updateUmbrella(activeKind, elapsed, ctx.reducedMotion);
      updateRainParticles(activeKind, dt, ctx.reducedMotion);
      updateOrbitalsAndDust(elapsed, ctx.reducedMotion);
    },

    dispose(): void {
      disposed = true;
      latestEmitUiSync = null;
      loadAbortController?.abort();

      if (avatar.mixer) {
        avatar.mixer.stopAllAction();
        if (avatar.loadedModel) {
          avatar.mixer.uncacheRoot(avatar.loadedModel);
        }
        avatar.mixer = null;
        avatar.standAction = null;
        avatar.walkAction = null;
        avatar.rainAction = null;
      }

      if (customDropIn.mixer) {
        customDropIn.mixer.stopAllAction();
        if (customDropIn.loadedModel) {
          customDropIn.mixer.uncacheRoot(customDropIn.loadedModel);
        }
        customDropIn.mixer = null;
        customDropIn.standAction = null;
        customDropIn.walkAction = null;
      }

      disposeLoadersIfIdle();

      disposeSkeletons(avatar.loadedModel);
      disposeSkeletons(coutureCoat.loadedModel);
      disposeSkeletons(customDropIn.loadedModel);

      // Disposes all geometries, materials, and embedded/procedural textures under `group`
      disposeObject3D(group);

      avatar.loadedModel = null;
      avatar.umbrellaHandBone = null;
      avatar.umbrellaPalmMiddleBone = null;
      avatar.umbrellaPalmThumbBone = null;
      avatar.calibratedMaterials = [];
      avatar.isLoaded = false;

      coutureCoat.loadedModel = null;
      coutureCoat.fabricMaterials = [];
      coutureCoat.hardwareMaterials = [];
      coutureCoat.coreMaterials = [];
      coutureCoat.isLoaded = false;

      customDropIn.loadedModel = null;
      customDropIn.isLoaded = false;
    },
  };
}
