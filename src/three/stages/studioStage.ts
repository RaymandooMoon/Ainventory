/**
 * studioStage.ts
 * ---------------------------------------------------------------------------
 * Studio 3D Stage Module for ainvtry.com (Three.js 0.187 WebGL2)
 *
 * Implements the Dual-Mode Luxury Editorial 3D Showroom:
 * 1. Layered frosted-crystal circular turntable pedestal (y = -1.25) with
 *    chamfered champagne-gold upper/lower rims, luminous inner studio disc,
 *    and soft ground contact shadow.
 * 2. Dual 360° counter-rotating tilted champagne-gold orbital rings with
 *    specular glint nodes and 48 lightweight floating starlight dust points.
 * 3. Mode A (Immediate Default: `'dressform'`): High-Fashion Headless Couture
 *    Atelier Dress Form sculpted from a 64-segment anatomical `SplineCurve`
 *    `LatheGeometry`, obsidian wool-weave physical fabric + internal brushed-
 *    gold core spine revealed via Glass %, chamfered neck finial & minimalist
 *    coat-hanger hook (`iNVTRY` hanger signature), 3 elliptical tailoring
 *    measurement rings with seam glint nodes, brushed-gold stand pole & plinth,
 *    and reactive `Stand / Walk / Rain` couture choreography.
 * 4. Mode B: Auto drop-in `/models/mannequin.glb` (with Draco support, magic-
 *    byte `glTF` pre-verification for zero console errors, `Box3` 1.8u auto-
 *    scaling & grounding, PBR sheen/IBL tuning, and `AnimationMixer` crossfade)
 *    plus lazily-loaded toggleable 20-bone skinned CC0 GLB mannequin
 *    (`/assets/models/studio-mannequin-v1.glb`) when `studioModelMode === 'mannequin'`.
 * 5. Curved front champagne-gold 360° dial track (radius 2.08, y = -1.32)
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

const CUSTOM_MANNEQUIN_GLB_URL = '/models/mannequin.glb';
const CUSTOM_MANNEQUIN_TARGET_HEIGHT = 1.8;
const STUDIO_MANNEQUIN_GLB_URL = '/assets/models/studio-mannequin-v1.glb';
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const MANNEQUIN_WORLD_SCALE = 1.44; // 1.615m anatomical mesh -> ~2.33 world units on turntable

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
const UMBRELLA_DEFLECT_Y_MANNEQUIN = 1.72;
const UMBRELLA_DEFLECT_Y_DRESSFORM = 1.56;
const UMBRELLA_DEFLECT_Y_CUSTOM = 1.38;

type ActiveModelKind = 'dressform' | 'mannequin' | 'custom';

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
 * 7. Mode B: 20-Bone Skinned GLB Mannequin & Auto Drop-In Rig Builders
 * ========================================================================== */

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
  readonly loadingHaloMat: THREE.MeshBasicMaterial;
}

interface SkinnedFigureRig {
  readonly root: THREE.Group;
  readonly modelSlot: THREE.Group;
  readonly loadingHalo: THREE.Mesh;
  readonly materials: FigureMaterials;
  bones: RigBoneMap;
  loadedModel: THREE.Object3D | null;
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

function buildSkinnedFigureRig(woolBumpTex: THREE.Texture): SkinnedFigureRig {
  const root = new THREE.Group();
  root.name = 'studio-fitting-figure';
  root.visible = false;

  // Luxury editorial PBR materials calibrated with baked studio vertex AO (`vertexColors: true`)
  // and restrained envMapIntensity under RoomEnvironment + ACESFilmic so dark wool tailoring stays rich obsidian
  const porcelainMat = new THREE.MeshPhysicalMaterial({
    color: 0xdcc4ae,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.02,
    envMapIntensity: 0.48,
    sheen: 0.28,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffe9d4),
  });

  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b1a20,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.04,
    envMapIntensity: 0.45,
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
    envMapIntensity: 0.42,
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
    envMapIntensity: 0.35,
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
    envMapIntensity: 0.4,
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
    envMapIntensity: 0.85,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
  });

  // Subtle luminous champagne atelier halo shown only while lazily streaming 20-bone GLB
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

  return {
    root,
    modelSlot,
    loadingHalo,
    materials: {
      porcelainMat,
      hairMat,
      coatMat,
      knitMat,
      trouserMat,
      shoeMat,
      loadingHaloMat,
    },
    bones: {},
    loadedModel: null,
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

function disposeMaterialWithTextures(mat: THREE.Material): void {
  const record = mat as unknown as Record<string, unknown>;
  for (const val of Object.values(record)) {
    if (val && typeof val === 'object' && (val as { isTexture?: boolean }).isTexture === true) {
      (val as THREE.Texture).dispose();
    }
  }
  mat.dispose();
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

      // Dispose default GLB material and any embedded textures before binding our luxury PBR materials
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) disposeMaterialWithTextures(m);
      } else if (mesh.material) {
        disposeMaterialWithTextures(mesh.material);
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

function prepareCustomDropInModel(gltf: GLTF, targetRig: CustomDropInRig): void {
  const model = gltf.scene;

  // Normalize scale via Box3 to exactly 1.8 world units tall, centered X/Z = 0, grounded at y = 0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 1e-4) {
    const scaleFactor = CUSTOM_MANNEQUIN_TARGET_HEIGHT / size.y;
    model.scale.multiplyScalar(scaleFactor);
  }

  model.updateMatrixWorld(true);
  box.setFromObject(model);
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

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

  // Key Light: upper left-front soft warm white (#FFF7EB, intensity 1.5)
  const keyLight = new THREE.DirectionalLight(0xfff7eb, 1.5);
  keyLight.position.set(-3.0, 4.2, 3.8);
  group.add(keyLight);

  // Rim Light: rear-right champagne gold rim (#E6C792, intensity 3.2) carving silhouette
  const rimLight = new THREE.DirectionalLight(0xe6c792, 3.2);
  rimLight.position.set(3.2, 2.8, -3.1);
  group.add(rimLight);

  // Fill Light: lower left-front cool silver (#8FA8C8, intensity 0.5)
  const coolFillLight = new THREE.DirectionalLight(0x8fa8c8, 0.5);
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
  let currentSubtab: StageInteractionState['studioSubtab'] = 'preview';
  let requestedModelMode: StageInteractionState['studioModelMode'] = 'dressform';
  let userExplicitlySelectedDressform = false;
  let builtInMannequinLoadStarted = false;

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

  // Shared soft contact shadow grounding dress form plinth or mannequin boots on turntable
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

  // Mode A: High-Fashion Headless Couture Atelier Dress Form (default immediate display)
  const dressForm = buildAtelierDressForm(
    woolBumpTex,
    currentGlassRatio,
    currentMood,
    currentTheme
  );
  turntableGroup.add(dressForm.group);

  // Mode B1: Lazy-loaded 20-Bone Skinned CC0 GLB Mannequin
  const figure = buildSkinnedFigureRig(woolBumpTex);
  turntableGroup.add(figure.root);

  // Mode B2: Auto Drop-In `/models/mannequin.glb`
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
   * Dual-Mode Model Resolution & Abort-Safe GLTF/Draco Loader Pipeline
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

  let gltfLoader: GLTFLoader | null = null;
  let dracoLoader: DRACOLoader | null = null;
  let activeParseCount = 0;
  let latestEmitUiSync: StageContext['emitUiSync'] | null = null;

  const disposeDracoIfIdle = (): void => {
    if (!disposed || activeParseCount > 0) return;
    dracoLoader?.dispose();
    dracoLoader = null;
    gltfLoader = null;
  };

  const getGltfLoader = (): GLTFLoader | null => {
    if (!canFetchInBrowser || disposed) return null;
    if (!gltfLoader) {
      gltfLoader = new GLTFLoader();
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
      gltfLoader.setDRACOLoader(dracoLoader);
    }
    return gltfLoader;
  };

  const resolveActiveModelKind = (): ActiveModelKind => {
    if (customDropIn.isLoaded && !userExplicitlySelectedDressform) {
      return 'custom';
    }
    if (requestedModelMode === 'mannequin') {
      return customDropIn.isLoaded ? 'custom' : 'mannequin';
    }
    return 'dressform';
  };

  const loadBuiltInMannequin = (): void => {
    if (builtInMannequinLoadStarted || disposed || !canFetchInBrowser) return;
    builtInMannequinLoadStarted = true;

    void fetch(STUDIO_MANNEQUIN_GLB_URL, {
      signal: loadAbortController?.signal,
    })
      .then((res) => {
        if (!res.ok) return null;
        const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('text/html')) return null;
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed || !buffer || !isValidGlbBuffer(buffer)) return;
        const loader = getGltfLoader();
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
              disposeDracoIfIdle();
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
            syncActiveModelVisibility();
            options?.onModelLoaded?.();
          },
          () => {
            activeParseCount = Math.max(0, activeParseCount - 1);
            disposeDracoIfIdle();
            // Silently preserve stage resilience if parse fails
          }
        );
      })
      .catch(() => {
        // Silently ignore aborted or offline fetches
      });
  };

  const syncActiveModelVisibility = (): ActiveModelKind => {
    const activeKind = resolveActiveModelKind();
    dressForm.group.visible = activeKind === 'dressform';
    figure.root.visible = activeKind === 'mannequin';
    customDropIn.root.visible = activeKind === 'custom';

    if (activeKind === 'mannequin' && !figure.isLoaded && !builtInMannequinLoadStarted) {
      loadBuiltInMannequin();
    }
    return activeKind;
  };

  // Silent Auto Drop-In Check for `/models/mannequin.glb` (zero console errors & zero loader allocation if absent)
  if (canFetchInBrowser) {
    void fetch(CUSTOM_MANNEQUIN_GLB_URL, {
      signal: loadAbortController?.signal,
    })
      .then((res) => {
        if (!res.ok) return null;
        const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('text/html')) return null;
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed || !buffer || !isValidGlbBuffer(buffer)) return;
        const loader = getGltfLoader();
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
              disposeDracoIfIdle();
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
            disposeDracoIfIdle();
            // Silently fall back to Dress Form on corrupt custom drop-in
          }
        );
      })
      .catch(() => {
        // Silently ignore 404, aborted, or offline drop-in probes
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

    // Subtle smoked-glass translucency & clearcoat on Dress Form revealing internal gold spine
    dressForm.torsoMat.opacity = THREE.MathUtils.lerp(1.0, 0.76, currentGlassRatio);
    dressForm.torsoMat.clearcoat = THREE.MathUtils.lerp(0.25, 0.85, currentGlassRatio);
    dressForm.torsoMat.roughness = THREE.MathUtils.lerp(0.42, 0.26, currentGlassRatio);
    applyBrushedGoldHardwareMode(
      dressForm.coreSpineMat,
      currentMood,
      currentTheme,
      THREE.MathUtils.lerp(0.18, 0.74, currentGlassRatio)
    );

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
    applyGoldModeState(umbrella.goldMat, mood, theme, 0.34);

    // Couture Dress Form PBR & brushed gold hardware calibrated for Mood × Theme
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
    figure.materials.loadingHaloMat.color.setHex(
      isAurora ? STAGE_PALETTE.auroraSilverGold : STAGE_PALETTE.champagneGoldBright
    );

    // Sculpted 20-bone mannequin editorial PBR materials tuned for Light & Dark legibility
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

    // Luxury Showroom Lighting Rig calibrated for ACESFilmic + RoomEnvironment
    if (isDark) {
      lights.keyLight.color.setHex(isAurora ? 0xeaf2ff : 0xfff7eb);
      lights.keyLight.intensity = 1.5;
      lights.rimLight.color.setHex(isAurora ? 0x9ec4f6 : 0xe6c792);
      lights.rimLight.intensity = 3.2;
      lights.coolFillLight.color.setHex(isAurora ? 0x98b8e6 : 0x8fa8c8);
      lights.coolFillLight.intensity = 0.5;
      lights.fillLight.color.setHex(isAurora ? 0xcadbf5 : 0xf6efe6);
      lights.fillLight.groundColor.setHex(isAurora ? 0x151d2e : 0x1e1a16);
      lights.fillLight.intensity = 0.48;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8fb6ec : STAGE_PALETTE.champagneGoldBright);
      lights.pedestalGlow.intensity = 1.15;
    } else {
      lights.keyLight.color.setHex(isAurora ? 0xf3f7ff : 0xfff9f0);
      lights.keyLight.intensity = 1.65;
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
   * Mode A Choreography: Couture Atelier Dress Form (`Stand` / `Walk` / `Rain`)
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
   * Mode B1 Choreography: Real 20-Bone Skeletal Animation (`Stand` / `Walk` / `Rain`)
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

    if (!figure.isLoaded) return;

    // Pelvis & spine counter-rotation + subtle editorial breathing
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

    // Clavicles breathing + subtle lift when holding umbrella
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

    // Left Arm (+X): palms-inward runway Stand / Walk / Rain
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
  };

  /* ------------------------------------------------------------------------
   * Mode B2 Choreography: Auto Drop-In `/models/mannequin.glb`
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

    if (activeKind === 'mannequin' && figure.isLoaded && figure.bones.handR) {
      turntableGroup.updateMatrixWorld(true);
      handWorldPos.set(0.015, 0.03, 0.04);
      figure.bones.handR.localToWorld(handWorldPos);
      invTurntableMatrix.copy(turntableGroup.matrixWorld).invert();
      handWorldPos.applyMatrix4(invTurntableMatrix);
      handWorldPos.y = Math.max(handWorldPos.y, 1.48);
      umbrella.group.position.copy(handWorldPos);
      umbrella.group.rotation.set(-0.14 + rainBreeze * 0.5, 0, -0.26 + rainBreeze);
    } else if (activeKind === 'dressform') {
      // Suspended gracefully overhead above the 2.12u coat-hanger hook with zero torso clipping
      umbrella.group.position.set(-0.46, 1.22, -0.08);
      umbrella.group.rotation.set(0.04 + rainBreeze * 0.4, 0, -0.25 + rainBreeze);
    } else if (activeKind === 'custom') {
      // Suspended cleanly overhead above the 1.8u auto-scaled custom mannequin
      umbrella.group.position.set(-0.42, 0.96, -0.06);
      umbrella.group.rotation.set(0.04 + rainBreeze * 0.4, 0, -0.22 + rainBreeze);
    } else {
      umbrella.group.position.set(-0.34, 1.5, 0.28);
      umbrella.group.rotation.set(-0.14 + rainBreeze * 0.5, 0, -0.26 + rainBreeze);
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
      activeKind === 'dressform'
        ? UMBRELLA_DEFLECT_Y_DRESSFORM
        : activeKind === 'custom'
          ? UMBRELLA_DEFLECT_Y_CUSTOM
          : UMBRELLA_DEFLECT_Y_MANNEQUIN;

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

    if (!reducedMotion) {
      orbitals.outerSpin.rotation.z = elapsed * 0.24 * subtabSpeed * walkBoost;
      orbitals.innerSpin.rotation.z = -elapsed * 0.31 * subtabSpeed * walkBoost;
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
      latestEmitUiSync = ctx.emitUiSync;
      currentAngleRad = ctx.interaction.studioAngleRad;
      currentSubtab = ctx.interaction.studioSubtab;
      if (
        customDropIn.isLoaded &&
        !userExplicitlySelectedDressform &&
        ctx.interaction.studioModelMode !== 'mannequin'
      ) {
        requestedModelMode = 'mannequin';
        ctx.emitUiSync({ studioModelMode: 'mannequin' });
      } else {
        requestedModelMode = ctx.interaction.studioModelMode;
      }
      walkBlend = ctx.interaction.studioPose === 'walk' ? 1 : 0;
      rainBlend = ctx.interaction.studioPose === 'rain' ? 1 : 0;
      turntableGroup.rotation.y = currentAngleRad;

      const activeKind = syncActiveModelVisibility();

      if (figure.isLoaded && ctx.reducedMotion) {
        figure.loadFade = 1;
        figure.modelSlot.scale.setScalar(MANNEQUIN_WORLD_SCALE);
        figure.loadingHalo.visible = false;
      }

      syncVisualMode(ctx.mood, ctx.theme);
      syncGlass(ctx.glassRatio);
      if (activeKind === 'dressform') {
        applyDressFormPose(0, ctx.reducedMotion);
      } else if (activeKind === 'mannequin') {
        applySkeletalPose(0, ctx.reducedMotion);
      } else {
        applyCustomDropInPose(0, 0, ctx.interaction.studioPose, ctx.reducedMotion);
      }
      updateUmbrella(activeKind, 0, ctx.reducedMotion);
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
      if (requestedModelMode !== ctx.interaction.studioModelMode) {
        requestedModelMode = ctx.interaction.studioModelMode;
        userExplicitlySelectedDressform = requestedModelMode === 'dressform';
      }

      const activeKind = syncActiveModelVisibility();

      if (activeKind === 'dressform') {
        applyDressFormPose(elapsed, ctx.reducedMotion);
      } else if (activeKind === 'mannequin') {
        // Smooth arrival scale & halo dismissal once the lazily-loaded 20-bone GLB streams in
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
      } else {
        applyCustomDropInPose(dt, elapsed, ctx.interaction.studioPose, ctx.reducedMotion);
      }

      updateUmbrella(activeKind, elapsed, ctx.reducedMotion);
      updateRainParticles(activeKind, dt, ctx.reducedMotion);
      updateOrbitalsAndDust(elapsed, ctx.reducedMotion);
    },

    dispose(): void {
      disposed = true;
      latestEmitUiSync = null;
      loadAbortController?.abort();

      if (customDropIn.mixer) {
        customDropIn.mixer.stopAllAction();
        if (customDropIn.loadedModel) {
          customDropIn.mixer.uncacheRoot(customDropIn.loadedModel);
        }
        customDropIn.mixer = null;
        customDropIn.standAction = null;
        customDropIn.walkAction = null;
      }

      disposeDracoIfIdle();

      disposeSkeletons(figure.loadedModel);
      disposeSkeletons(customDropIn.loadedModel);

      // Only manually dispose mannequin PBR materials when 20-bone GLB never attached to scene graph;
      // woolBumpTex is owned by dressForm.torsoMat inside `group` and disposed once by disposeObject3D.
      if (!figure.isLoaded) {
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
      customDropIn.loadedModel = null;
      customDropIn.isLoaded = false;
    },
  };
}
