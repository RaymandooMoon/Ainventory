/**
 * studioStage.ts
 * ---------------------------------------------------------------------------
 * Studio 3D Stage Module for ainvtry.com (Three.js 0.187 WebGL2)
 *
 * Implements the luxury editorial 3D fitting showcase:
 * 1. Layered smoked-glass circular turntable pedestal (y = -1.25) with
 *    chamfered champagne-gold upper/lower rims, inner frosted mirror disc,
 *    and soft ground contact shadow.
 * 2. Dual 360° counter-rotating tilted champagne-gold orbital rings with
 *    specular glint nodes and 48 lightweight floating starlight dust points.
 * 3. Procedurally sculpted stylized tailored-overcoat fitting figure with
 *    live Stand / Walk / Rain skeletal pose choreography, translucent
 *    smoked-glass champagne umbrella, and 3D diagonal raindrop streaks.
 * 4. Curved front champagne-gold 360° dial track (radius 2.08, y = -1.32)
 *    with reusable glowing marble controller synced to turntable rotation.
 *
 * Mobile 60fps & SwiftShader compatible — ZERO external network asset fetches.
 */

import * as THREE from 'three';
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

/* ==========================================================================
 * 2. SSR-Safe Procedural Canvas Textures (Zero Network Fetches)
 * ========================================================================== */

function createFallbackTexture(rgba: [number, number, number, number]): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial floor contact shadow beneath pedestal and figure shoes. */
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
    grad.addColorStop(0.0, 'rgba(6, 6, 10, 0.84)');
    grad.addColorStop(0.45, 'rgba(6, 6, 10, 0.52)');
    grad.addColorStop(0.76, 'rgba(8, 8, 12, 0.18)');
    grad.addColorStop(1.0, 'rgba(8, 8, 12, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Subtle frosted mirror radial sheen texture inside the smoked-glass disc. */
function createFrostedMirrorTexture(size = 128): THREE.Texture {
  if (typeof document === 'undefined') {
    return createFallbackTexture([180, 176, 172, 160]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half * 0.92, half * 0.88, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 250, 240, 0.82)');
    grad.addColorStop(0.35, 'rgba(218, 212, 204, 0.44)');
    grad.addColorStop(0.75, 'rgba(130, 126, 122, 0.22)');
    grad.addColorStop(0.95, 'rgba(235, 224, 204, 0.36)');
    grad.addColorStop(1.0, 'rgba(235, 224, 204, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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

    // Subtle crisp 4-point editorial gleam
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
 * 3. Circular Smoked-Glass Turntable Pedestal Builder
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

  // Main layered smoked-glass cylinder
  const glassGeo = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS,
    PEDESTAL_RADIUS + 0.02,
    PEDESTAL_HEIGHT,
    64,
    1,
    false
  );
  const glassMat = createSmokedGlassMaterial(glassRatio, mood, theme);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // Subtle translucent inner architectural core plate so glass stays grounded at 100%
  const baseCoreGeo = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS - 0.08,
    PEDESTAL_RADIUS - 0.06,
    0.04,
    48
  );
  const baseCoreMat = new THREE.MeshStandardMaterial({
    color: 0x16161c,
    roughness: 0.42,
    metalness: 0.28,
    transparent: true,
    opacity: 0.46,
  });
  const baseCoreMesh = new THREE.Mesh(baseCoreGeo, baseCoreMat);
  baseCoreMesh.position.y = -PEDESTAL_HEIGHT * 0.3;
  group.add(baseCoreMesh);

  // Subtle inner frosted mirror disc right beneath the top surface
  const mirrorTex = createFrostedMirrorTexture(128);
  const mirrorGeo = new THREE.CircleGeometry(PEDESTAL_RADIUS - 0.045, 64);
  mirrorGeo.rotateX(-Math.PI * 0.5);
  const mirrorMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a2930,
    map: mirrorTex,
    roughness: 0.16,
    metalness: 0.62,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.012;
  mirrorMesh.renderOrder = 1;
  group.add(mirrorMesh);

  // Chamfered champagne-gold upper, lower & inner bezel rim rings
  const rimMat = createChampagneGoldMaterial(mood, theme, 0.3);

  const upperRimGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS, 0.02, 14, 72);
  upperRimGeo.rotateX(Math.PI * 0.5);
  const upperRimMesh = new THREE.Mesh(upperRimGeo, rimMat);
  upperRimMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.004;
  group.add(upperRimMesh);

  const lowerRimGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS + 0.02, 0.022, 14, 72);
  lowerRimGeo.rotateX(Math.PI * 0.5);
  const lowerRimMesh = new THREE.Mesh(lowerRimGeo, rimMat);
  lowerRimMesh.position.y = -PEDESTAL_HEIGHT * 0.5 + 0.004;
  group.add(lowerRimMesh);

  const innerBezelGeo = new THREE.TorusGeometry(PEDESTAL_RADIUS - 0.22, 0.006, 10, 64);
  innerBezelGeo.rotateX(Math.PI * 0.5);
  const innerBezelMesh = new THREE.Mesh(innerBezelGeo, rimMat);
  innerBezelMesh.position.y = PEDESTAL_HEIGHT * 0.5 - 0.006;
  group.add(innerBezelMesh);

  // Soft dark contact shadow plane beneath the pedestal
  const shadowTex = createRadialShadowTexture(128);
  const shadowGeo = new THREE.PlaneGeometry(4.45, 4.45);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: 0x050508,
    transparent: true,
    opacity: 0.68,
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

  // Deterministic golden-angle spiral distribution for balanced editorial sparkle
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
 * 5. Sculpted Tailored Coat Fitting Figure + Translucent Umbrella Builder
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

  // Sculpted handle grip resting inside the right hand palm
  const gripGeo = new THREE.CylinderGeometry(0.021, 0.023, 0.16, 14);
  const gripMesh = new THREE.Mesh(gripGeo, gripMat);
  gripMesh.position.y = -0.02;
  group.add(gripMesh);

  const pommelGeo = new THREE.SphereGeometry(0.023, 12, 10);
  const pommelMesh = new THREE.Mesh(pommelGeo, goldMat);
  pommelMesh.position.y = -0.1;
  group.add(pommelMesh);

  // Slim metallic champagne shaft extending cleanly to the canopy apex
  const canopyRadius = 0.92;
  const canopyPhi = Math.PI * 0.41;
  const canopyScaleY = 0.66;
  const canopyHolderY = 0.64;
  const apexLocalY = canopyRadius * canopyScaleY;
  const shaftTopY = canopyHolderY + apexLocalY;
  const shaftBottomY = 0.04;
  const shaftLength = shaftTopY - shaftBottomY;

  const shaftGeo = new THREE.CylinderGeometry(0.01, 0.011, shaftLength, 12);
  const shaftMesh = new THREE.Mesh(shaftGeo, goldMat);
  shaftMesh.position.y = shaftBottomY + shaftLength * 0.5;
  group.add(shaftMesh);

  // Inner runner collar along shaft visible softly through the smoked glass
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
  // Align partial arc from top pole (+Y) down toward equator (+X)
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

interface FigureRig {
  readonly root: THREE.Group;
  readonly torsoGroup: THREE.Group;
  readonly headPivot: THREE.Group;
  readonly coatSkirtPivot: THREE.Group;
  readonly leftShoulderPivot: THREE.Group;
  readonly leftElbowPivot: THREE.Group;
  readonly rightShoulderPivot: THREE.Group;
  readonly rightElbowPivot: THREE.Group;
  readonly rightHandGrip: THREE.Group;
  readonly leftHipPivot: THREE.Group;
  readonly leftKneePivot: THREE.Group;
  readonly rightHipPivot: THREE.Group;
  readonly rightKneePivot: THREE.Group;
  readonly umbrella: UmbrellaRig;
  readonly materials: {
    readonly porcelainMat: THREE.MeshStandardMaterial;
    readonly hairMat: THREE.MeshStandardMaterial;
    readonly coatMat: THREE.MeshPhysicalMaterial;
    readonly knitMat: THREE.MeshStandardMaterial;
    readonly trouserMat: THREE.MeshPhysicalMaterial;
    readonly shoeMat: THREE.MeshStandardMaterial;
    readonly footShadowMat: THREE.MeshBasicMaterial;
  };
}

function buildTailoredFigure(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): FigureRig {
  const root = new THREE.Group();
  root.name = 'studio-fitting-figure';

  // Editorial materials — calibrated for clean silhouette in Dark and Light modes
  const porcelainMat = new THREE.MeshStandardMaterial({
    color: 0xcab39e,
    roughness: 0.56,
    metalness: 0.04,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1d1c21,
    roughness: 0.44,
    metalness: 0.14,
  });

  const coatMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e1e23,
    roughness: 0.82,
    metalness: 0.06,
    sheen: 0.58,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x9a8c7a),
    side: THREE.DoubleSide,
  });

  const knitMat = new THREE.MeshStandardMaterial({
    color: 0x141418,
    roughness: 0.9,
    metalness: 0.03,
  });

  const trouserMat = new THREE.MeshPhysicalMaterial({
    color: 0x17171c,
    roughness: 0.78,
    metalness: 0.05,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0x7c7874),
  });

  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x121216,
    roughness: 0.34,
    metalness: 0.22,
  });

  // Subtle boot contact shadow grounding shoes onto the mirrored turntable top
  const footShadowTex = createRadialShadowTexture(64);
  const footShadowGeo = new THREE.PlaneGeometry(0.84, 0.64);
  footShadowGeo.rotateX(-Math.PI * 0.5);
  const footShadowMat = new THREE.MeshBasicMaterial({
    map: footShadowTex,
    color: 0x050508,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });
  const footShadowMesh = new THREE.Mesh(footShadowGeo, footShadowMat);
  footShadowMesh.position.set(0, 0.004, 0.02);
  root.add(footShadowMesh);

  /* --- Upper Torso & Tailored Overcoat Bodice (pivot at waist y = 1.46) --- */
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.46, 0);
  root.add(torsoGroup);

  // Sculpted LatheGeometry torso profile (slim waist -> structured tailored chest -> shoulder slope)
  const torsoPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.185, -0.02),
    new THREE.Vector2(0.195, 0.14),
    new THREE.Vector2(0.228, 0.34),
    new THREE.Vector2(0.258, 0.49),
    new THREE.Vector2(0.236, 0.56),
    new THREE.Vector2(0.105, 0.59),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoPoints, 28);
  torsoGeo.scale(1.06, 1.0, 0.62);
  const torsoMesh = new THREE.Mesh(torsoGeo, coatMat);
  torsoGroup.add(torsoMesh);

  // Inner dark knit turtleneck chest V-insert & mock-neck collar
  const knitChestGeo = new THREE.CylinderGeometry(0.108, 0.092, 0.38, 20);
  knitChestGeo.scale(1.0, 1.0, 0.72);
  const knitChestMesh = new THREE.Mesh(knitChestGeo, knitMat);
  knitChestMesh.position.set(0, 0.39, 0.088);
  torsoGroup.add(knitChestMesh);

  const mockNeckGeo = new THREE.CylinderGeometry(0.084, 0.094, 0.11, 22);
  const mockNeckMesh = new THREE.Mesh(mockNeckGeo, knitMat);
  mockNeckMesh.position.set(0, 0.61, 0.01);
  torsoGroup.add(mockNeckMesh);

  // Raised tailored overcoat collar hugging back & sides of mock neck
  const collarGeo = new THREE.CylinderGeometry(
    0.114,
    0.128,
    0.115,
    24,
    1,
    true,
    Math.PI * 0.24,
    Math.PI * 1.52
  );
  const collarMesh = new THREE.Mesh(collarGeo, coatMat);
  collarMesh.position.set(0, 0.595, -0.005);
  torsoGroup.add(collarMesh);

  // Left & Right sculpted peaked overcoat lapels framing the chest V
  const lapelGeo = new THREE.BoxGeometry(0.064, 0.33, 0.022);
  const leftLapel = new THREE.Mesh(lapelGeo, coatMat);
  leftLapel.position.set(0.072, 0.38, 0.148);
  leftLapel.rotation.set(-0.08, 0.24, -0.22);
  torsoGroup.add(leftLapel);

  const rightLapel = new THREE.Mesh(lapelGeo, coatMat);
  rightLapel.position.set(-0.072, 0.38, 0.148);
  rightLapel.rotation.set(-0.08, -0.24, 0.22);
  torsoGroup.add(rightLapel);

  // Subtle matte obsidian overcoat buttons
  const buttonGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.008, 12);
  buttonGeo.rotateX(Math.PI * 0.5);
  const btnUpper = new THREE.Mesh(buttonGeo, shoeMat);
  btnUpper.position.set(0.022, 0.14, 0.146);
  torsoGroup.add(btnUpper);

  const btnLower = new THREE.Mesh(buttonGeo, shoeMat);
  btnLower.position.set(0.022, -0.02, 0.136);
  torsoGroup.add(btnLower);

  /* --- Flared Long Overcoat Skirt with Architectural Front Walking Slit --- */
  const coatSkirtPivot = new THREE.Group();
  coatSkirtPivot.position.set(0, 1.46, 0);
  root.add(coatSkirtPivot);

  const slitHalfAngle = 0.15;
  const skirtGeo = new THREE.CylinderGeometry(
    0.198,
    0.292,
    0.82,
    32,
    4,
    true,
    slitHalfAngle,
    Math.PI * 2 - slitHalfAngle * 2
  );
  skirtGeo.scale(1.04, 1.0, 0.68);
  const skirtMesh = new THREE.Mesh(skirtGeo, coatMat);
  skirtMesh.position.y = -0.41;
  coatSkirtPivot.add(skirtMesh);

  // Subtle inner hip/pelvis core bridging torso and trousers cleanly behind the coat slit
  const pelvisGeo = new THREE.CylinderGeometry(0.17, 0.16, 0.28, 20);
  pelvisGeo.scale(1.04, 1.0, 0.66);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, trouserMat);
  pelvisMesh.position.set(0, 1.24, 0);
  root.add(pelvisMesh);

  /* --- Head, Neck & Sculpted Dark Swept Hair Crown --- */
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.65, 0.01); // local to torsoGroup -> figure y = 2.11
  torsoGroup.add(headPivot);

  const neckGeo = new THREE.CylinderGeometry(0.062, 0.072, 0.11, 18);
  const neckMesh = new THREE.Mesh(neckGeo, porcelainMat);
  neckMesh.position.y = 0.05;
  headPivot.add(neckMesh);

  // Elongated minimal fashion mannequin head via LatheGeometry for clean jawline & chin
  const headProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0.08),
    new THREE.Vector2(0.052, 0.095),
    new THREE.Vector2(0.096, 0.145),
    new THREE.Vector2(0.118, 0.225),
    new THREE.Vector2(0.122, 0.305),
    new THREE.Vector2(0.104, 0.37),
    new THREE.Vector2(0.056, 0.405),
    new THREE.Vector2(0.001, 0.415),
  ];
  const headGeo = new THREE.LatheGeometry(headProfile, 28);
  headGeo.scale(0.92, 1.0, 1.04);
  const headMesh = new THREE.Mesh(headGeo, porcelainMat);
  headPivot.add(headMesh);

  // Sculpted swept-back dark hair crown (editorial matte pompadour contour)
  const hairCrownGeo = new THREE.SphereGeometry(0.126, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hairCrownGeo.scale(0.96, 1.04, 1.12);
  const hairCrownMesh = new THREE.Mesh(hairCrownGeo, hairMat);
  hairCrownMesh.position.set(0, 0.285, -0.018);
  hairCrownMesh.rotation.x = -0.34;
  headPivot.add(hairCrownMesh);

  const hairBackGeo = new THREE.SphereGeometry(0.12, 20, 14);
  hairBackGeo.scale(0.93, 0.96, 0.85);
  const hairBackMesh = new THREE.Mesh(hairBackGeo, hairMat);
  hairBackMesh.position.set(0, 0.245, -0.044);
  headPivot.add(hairBackMesh);

  const hairWaveGeo = new THREE.CapsuleGeometry(0.048, 0.11, 8, 14);
  hairWaveGeo.rotateZ(Math.PI * 0.44);
  hairWaveGeo.rotateY(0.18);
  const hairWaveMesh = new THREE.Mesh(hairWaveGeo, hairMat);
  hairWaveMesh.position.set(-0.012, 0.386, 0.016);
  headPivot.add(hairWaveMesh);

  /* --- Articulated Arms Builder (Left at +X, Right at -X) --- */
  const upperSleeveGeo = new THREE.CylinderGeometry(0.072, 0.06, 0.39, 18);
  const deltoidCapGeo = new THREE.SphereGeometry(0.075, 16, 14);
  const lowerSleeveGeo = new THREE.CylinderGeometry(0.059, 0.048, 0.37, 18);
  const elbowJointGeo = new THREE.SphereGeometry(0.059, 14, 12);
  const handGeo = new THREE.CapsuleGeometry(0.033, 0.072, 8, 12);
  handGeo.scale(0.8, 1.0, 0.58);

  const createArm = (sideSign: 1 | -1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sideSign * 0.282, 0.49, 0);
    torsoGroup.add(shoulderPivot);

    const deltoid = new THREE.Mesh(deltoidCapGeo, coatMat);
    deltoid.scale.set(1.06, 0.94, 0.96);
    shoulderPivot.add(deltoid);

    const upperSleeve = new THREE.Mesh(upperSleeveGeo, coatMat);
    upperSleeve.position.y = -0.195;
    shoulderPivot.add(upperSleeve);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.385, 0);
    shoulderPivot.add(elbowPivot);

    const elbowCap = new THREE.Mesh(elbowJointGeo, coatMat);
    elbowPivot.add(elbowCap);

    const lowerSleeve = new THREE.Mesh(lowerSleeveGeo, coatMat);
    lowerSleeve.position.y = -0.185;
    elbowPivot.add(lowerSleeve);

    const handMesh = new THREE.Mesh(handGeo, porcelainMat);
    handMesh.position.set(0, -0.415, 0.008);
    elbowPivot.add(handMesh);

    const gripPivot = new THREE.Group();
    gripPivot.position.set(0, -0.415, 0.015);
    elbowPivot.add(gripPivot);

    return { shoulderPivot, elbowPivot, gripPivot };
  };

  const leftArm = createArm(1);
  const rightArm = createArm(-1);

  // Mount translucent champagne umbrella at the right hand grip
  const umbrella = buildUmbrella(glassRatio, mood, theme);
  rightArm.gripPivot.add(umbrella.group);

  /* --- Articulated Tailored Trousers & Matte Minimalist Shoes --- */
  const thighGeo = new THREE.CylinderGeometry(0.086, 0.072, 0.51, 18);
  const kneeCapGeo = new THREE.SphereGeometry(0.071, 14, 12);
  const calfGeo = new THREE.CylinderGeometry(0.07, 0.055, 0.54, 18);
  const shoeUpperGeo = new THREE.CapsuleGeometry(0.048, 0.145, 8, 14);
  shoeUpperGeo.rotateX(Math.PI * 0.5);
  shoeUpperGeo.scale(0.95, 0.72, 1.0);
  const shoeSoleGeo = new THREE.BoxGeometry(0.094, 0.022, 0.245);

  const createLeg = (sideSign: 1 | -1) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sideSign * 0.108, 1.12, 0);
    root.add(hipPivot);

    const thigh = new THREE.Mesh(thighGeo, trouserMat);
    thigh.position.y = -0.255;
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.5, 0);
    hipPivot.add(kneePivot);

    const kneeCap = new THREE.Mesh(kneeCapGeo, trouserMat);
    kneePivot.add(kneeCap);

    const calf = new THREE.Mesh(calfGeo, trouserMat);
    calf.position.y = -0.27;
    kneePivot.add(calf);

    // Matte sculpted shoe with sole cleanly touching local y = 0.0 (at -0.62 from knee)
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(0, -0.582, 0.048);
    shoeGroup.rotation.y = sideSign * 0.09; // Natural poised editorial stance turnout

    const shoeUpper = new THREE.Mesh(shoeUpperGeo, shoeMat);
    shoeUpper.position.y = 0.008;
    shoeGroup.add(shoeUpper);

    const shoeSole = new THREE.Mesh(shoeSoleGeo, shoeMat);
    shoeSole.position.set(0, -0.027, 0);
    shoeGroup.add(shoeSole);

    kneePivot.add(shoeGroup);

    return { hipPivot, kneePivot };
  };

  const leftLeg = createLeg(1);
  const rightLeg = createLeg(-1);

  return {
    root,
    torsoGroup,
    headPivot,
    coatSkirtPivot,
    leftShoulderPivot: leftArm.shoulderPivot,
    leftElbowPivot: leftArm.elbowPivot,
    rightShoulderPivot: rightArm.shoulderPivot,
    rightElbowPivot: rightArm.elbowPivot,
    rightHandGrip: rightArm.gripPivot,
    leftHipPivot: leftLeg.hipPivot,
    leftKneePivot: leftLeg.kneePivot,
    rightHipPivot: rightLeg.hipPivot,
    rightKneePivot: rightLeg.kneePivot,
    umbrella,
    materials: {
      porcelainMat,
      hairMat,
      coatMat,
      knitMat,
      trouserMat,
      shoeMat,
      footShadowMat,
    },
  };
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

  // Deterministic pseudo-random distribution around the fitting column
  const goldenAngle = 2.3999632297;
  for (let i = 0; i < RAIN_COUNT; i++) {
    const radialNorm = Math.sqrt(((i * 29 + 7) % RAIN_COUNT) / RAIN_COUNT);
    const radius = 0.16 + radialNorm * RAIN_COLUMN_RADIUS;
    const angle = i * goldenAngle;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = RAIN_BOTTOM_Y + ((i * 53) % RAIN_COUNT) / RAIN_COUNT * (RAIN_TOP_Y - RAIN_BOTTOM_Y);
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
  // Subtle diagonal rain wind slant (-X, -Y, +Z)
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

  // Rotate horizontal in XZ plane and center symmetric around front +Z axis
  const alignHorizontalFront = (geo: THREE.BufferGeometry) => {
    geo.rotateX(Math.PI * 0.5);
    geo.rotateY(DIAL_ARC * 0.5 - Math.PI * 0.5);
  };

  // Sculpted flattened metallic champagne crescent band
  const bandGeo = new THREE.TorusGeometry(DIAL_RADIUS, 0.04, 14, 72, DIAL_ARC);
  alignHorizontalFront(bandGeo);
  bandGeo.scale(1, 0.34, 1);
  const bandMesh = new THREE.Mesh(bandGeo, bandMat);
  group.add(bandMesh);

  // Luminous specular centerline rail crown
  const railGeo = new THREE.TorusGeometry(DIAL_RADIUS, 0.0095, 8, 72, DIAL_ARC);
  alignHorizontalFront(railGeo);
  const railMesh = new THREE.Mesh(railGeo, railGlowMat);
  railMesh.position.y = 0.013;
  group.add(railMesh);

  // Tapered end finials at both arc tips (±DIAL_ARC / 2)
  const finialGeo = new THREE.SphereGeometry(0.032, 12, 10);
  finialGeo.scale(1, 0.45, 1);
  const halfArc = DIAL_ARC * 0.5;
  for (const sign of [-1, 1] as const) {
    const phi = sign * halfArc;
    const finial = new THREE.Mesh(finialGeo, bandMat);
    finial.position.set(Math.sin(phi) * DIAL_RADIUS, 0, Math.cos(phi) * DIAL_RADIUS);
    group.add(finial);
  }

  // Precision Swiss-horology radial ticks along the front dial arc
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
 * 8. Dedicated Studio Stage Lighting Rig (Dark & Light Mode Calibrated)
 * ========================================================================== */

interface StudioLightRig {
  readonly group: THREE.Group;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly fillLight: THREE.HemisphereLight;
  readonly pedestalGlow: THREE.PointLight;
}

function buildStudioLights(): StudioLightRig {
  const group = new THREE.Group();
  group.name = 'studio-lights';

  // Warm editorial key light (upper left-front)
  const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
  keyLight.position.set(-3.2, 4.4, 3.8);
  group.add(keyLight);

  // Diagonal sculptural rim light (upper right-rear, echoing editorial studio beam)
  const rimLight = new THREE.DirectionalLight(0xe5cfa7, 2.1);
  rimLight.position.set(3.4, 3.2, -3.2);
  group.add(rimLight);

  // Balanced hemisphere fill so charcoal tailored wool reveals rich folds in both themes
  const fillLight = new THREE.HemisphereLight(0xf6efe6, 0x2a241e, 1.15);
  group.add(fillLight);

  // Subtle under-glow kissing the smoked-glass pedestal and lower coat hem
  const pedestalGlow = new THREE.PointLight(0xe2cfa8, 1.4, 5.8, 2);
  pedestalGlow.position.set(0.25, -0.78, 1.15);
  group.add(pedestalGlow);

  return { group, keyLight, rimLight, fillLight, pedestalGlow };
}

/* ==========================================================================
 * 9. StageModule Factory: createStudioStage()
 * ========================================================================== */

export function createStudioStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'stage-studio';

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

  // Scratch vectors & quaternions for allocation-free 60/120fps update loop
  const marbleAnchor = new THREE.Vector3();
  const tmpQuatA = new THREE.Quaternion();
  const tmpQuatB = new THREE.Quaternion();
  // Upright editorial umbrella tilt relative to torsoGroup (leaning gracefully over head)
  const umbrellaTargetQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.24, 0, -0.16, 'XYZ')
  );

  // Build scene components
  const lights = buildStudioLights();
  group.add(lights.group);

  const pedestal = buildTurntablePedestal(currentGlassRatio, currentMood, currentTheme);
  group.add(pedestal.group);

  const orbitals = buildOrbitalSystem(currentMood, currentTheme);
  group.add(orbitals.group);

  const starlight = buildStarlightDust();
  group.add(starlight.points);

  // Rotatable turntable group centered on top of the smoked-glass disc
  const turntableGroup = new THREE.Group();
  turntableGroup.name = 'studio-turntable-rotor';
  turntableGroup.position.set(0, PEDESTAL_TOP_Y, 0);
  group.add(turntableGroup);

  const figure = buildTailoredFigure(currentGlassRatio, currentMood, currentTheme);
  turntableGroup.add(figure.root);

  const rain = buildRainStreaks();
  group.add(rain.lines);

  const dialTrack = buildDialTrack(currentMood, currentTheme);
  group.add(dialTrack.group);

  /* ------------------------------------------------------------------------
   * Visual Mode & Glass Synchronization
   * ------------------------------------------------------------------------ */

  const syncGlass = (ratio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(ratio, 0, 1);

    applySmokedGlassState(pedestal.glassMat, currentGlassRatio, currentMood, currentTheme);
    applySmokedGlassState(figure.umbrella.canopyMat, currentGlassRatio, currentMood, currentTheme);

    // Keep umbrella opacity modulated by active rainBlend fade
    const baseCanopyOpacity = figure.umbrella.canopyMat.opacity;
    figure.umbrella.canopyMat.userData.targetOpacity = baseCanopyOpacity;
    figure.umbrella.canopyMat.opacity = baseCanopyOpacity * rainBlend;

    // Harmonize frosted inner mirror disc and architectural base with Glass %
    const isDark = currentTheme === 'dark';
    pedestal.mirrorMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.62 : 0.48,
      isDark ? 0.34 : 0.26,
      currentGlassRatio
    );
    pedestal.baseCoreMat.opacity = THREE.MathUtils.lerp(
      isDark ? 0.56 : 0.38,
      isDark ? 0.18 : 0.12,
      currentGlassRatio
    );
  };

  const syncVisualMode = (mood: MoodMode, theme: ThemeMode): void => {
    currentMood = mood;
    currentTheme = theme;
    const isDark = theme === 'dark';
    const isAurora = mood === 'aurora';

    // Update shared smoked-glass and metallic gold materials
    syncGlass(currentGlassRatio);
    applyGoldModeState(pedestal.rimMat, mood, theme, 0.32);
    applyGoldModeState(orbitals.ringMat, mood, theme, 0.34);
    applyGoldModeState(orbitals.sparkMat, mood, theme, 0.94);
    applyGoldModeState(dialTrack.bandMat, mood, theme, 0.28);
    applyGoldModeState(dialTrack.railGlowMat, mood, theme, 0.64);
    applyGoldModeState(figure.umbrella.goldMat, mood, theme, 0.34);

    // Pedestal frosted mirror & contact shadows calibrated for Dark vs Light mode
    pedestal.mirrorMat.color.setHex(
      isDark ? (isAurora ? 0x263144 : 0x2d2a26) : isAurora ? 0xdbe5f4 : 0xeae3d8
    );
    pedestal.baseCoreMat.color.setHex(
      isDark ? (isAurora ? 0x131a29 : 0x17151a) : isAurora ? 0xd0dbed : 0xe4ddd2
    );
    pedestal.shadowMat.color.setHex(isDark ? 0x040407 : 0x3b3630);
    pedestal.shadowMat.opacity = isDark ? 0.72 : 0.28;
    figure.materials.footShadowMat.color.setHex(isDark ? 0x050508 : 0x2d2924);
    figure.materials.footShadowMat.opacity = isDark ? 0.56 : 0.34;

    // Tailored figure contrast tuning for crisp legibility on Light & Dark canvases
    figure.materials.coatMat.color.setHex(isDark ? 0x202026 : 0x24242b);
    figure.materials.coatMat.sheenColor.setHex(
      isAurora ? (isDark ? 0x8db2e2 : 0x6f8ab0) : isDark ? 0xb49f84 : 0x857562
    );
    figure.materials.trouserMat.color.setHex(isDark ? 0x18181d : 0x1d1d23);
    figure.materials.porcelainMat.color.setHex(isDark ? 0xcab39e : 0xc4aa92);
    figure.materials.hairMat.color.setHex(isDark ? 0x1a191f : 0x1f1e24);

    // Starlight dust blending & tint (Additive glow in Dark, brushed champagne in Light)
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

    // Raindrop streak tint for crisp visibility in Dark & Light modes
    rain.material.color.setHex(
      isAurora
        ? isDark
          ? 0xbcd8fa
          : 0x5c7ca8
        : isDark
          ? 0xe9d8b9
          : 0x7b6a52
    );

    // Dedicated studio lights calibrated per Mood × Theme
    if (isDark) {
      lights.keyLight.color.setHex(isAurora ? 0xe8f1ff : 0xfff0d8);
      lights.keyLight.intensity = 2.25;
      lights.rimLight.color.setHex(isAurora ? 0x9ec4f6 : 0xe8cfa4);
      lights.rimLight.intensity = 2.35;
      lights.fillLight.color.setHex(isAurora ? 0xcadbf5 : 0xf2e7d8);
      lights.fillLight.groundColor.setHex(isAurora ? 0x192235 : 0x2c241b);
      lights.fillLight.intensity = 1.25;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8fb6ec : STAGE_PALETTE.champagneGoldBright);
      lights.pedestalGlow.intensity = 1.45;
    } else {
      lights.keyLight.color.setHex(isAurora ? 0xf4f8ff : 0xfff8ee);
      lights.keyLight.intensity = 2.45;
      lights.rimLight.color.setHex(isAurora ? 0x9abbe8 : 0xd6b582);
      lights.rimLight.intensity = 1.65;
      lights.fillLight.color.setHex(0xffffff);
      lights.fillLight.groundColor.setHex(isAurora ? 0xbccae0 : 0xd8cfc2);
      lights.fillLight.intensity = 1.85;
      lights.pedestalGlow.color.setHex(isAurora ? 0x8eaad6 : 0xc8a46e);
      lights.pedestalGlow.intensity = 0.85;
    }
  };

  /* ------------------------------------------------------------------------
   * Choreographed Pose & Particle Updaters
   * ------------------------------------------------------------------------ */

  const updateFigurePose = (elapsed: number, reducedMotion: boolean): void => {
    const standWeight = Math.max(0, 1 - walkBlend - rainBlend);
    const breathPhase = reducedMotion ? 0 : elapsed * 2.1;
    const walkPhase = reducedMotion ? 0.65 : elapsed * 4.2;

    const breathRise = Math.sin(breathPhase) * 0.008 * (standWeight + rainBlend * 0.7);
    const gaitWave = Math.sin(walkPhase);
    const gaitCos = Math.cos(walkPhase);
    const walkBounce = Math.abs(gaitWave) * 0.036 * walkBlend;

    // Ground root with subtle stride lift during walk
    figure.root.position.y = walkBounce;

    // Torso breathing, runway clavicle counter-twist (BONE_L_CLAVICLE_12), and subtle rain lean
    figure.torsoGroup.position.y = 1.46 + breathRise;
    figure.torsoGroup.rotation.set(
      0.035 * walkBlend - 0.02 * rainBlend,
      -gaitWave * 0.11 * walkBlend + 0.04 * rainBlend,
      gaitWave * 0.032 * walkBlend - 0.025 * rainBlend
    );

    // Subtle poised head micro-turn & gentle hover tracking
    const idleHeadYaw = reducedMotion ? 0 : Math.sin(elapsed * 0.65) * 0.045 * standWeight;
    figure.headPivot.rotation.set(
      hoverSmoothY * 0.08 + 0.03 * rainBlend,
      idleHeadYaw + hoverSmoothX * 0.12 - 0.06 * rainBlend,
      -gaitWave * 0.02 * walkBlend
    );

    // Tailored coat skirt subtle cloth-drape sway (trails torso rotation + breeze in rain)
    const rainBreeze = reducedMotion ? 0 : Math.sin(elapsed * 3.4) * 0.032;
    figure.coatSkirtPivot.position.y = 1.46 + breathRise * 0.5;
    figure.coatSkirtPivot.rotation.set(
      (0.05 + Math.abs(gaitWave) * 0.045) * walkBlend + rainBreeze * rainBlend,
      -Math.sin(walkPhase - 0.45) * 0.09 * walkBlend,
      gaitCos * 0.025 * walkBlend + rainBreeze * 0.6 * rainBlend
    );
    const skirtFlare = 1 + 0.055 * walkBlend * Math.abs(gaitWave) + 0.02 * rainBlend;
    figure.coatSkirtPivot.scale.set(1, 1, skirtFlare);

    /* --- Left Arm (side +X): relaxed stand / counter-walk / rain-pocket poise --- */
    const leftSwing = gaitWave * 0.36;
    const leftShoulderX =
      0.02 * standWeight + leftSwing * walkBlend + 0.08 * rainBlend;
    const leftShoulderZ =
      0.09 * standWeight + 0.11 * walkBlend + 0.13 * rainBlend;
    const leftElbowX =
      -0.14 * standWeight +
      (-0.2 - Math.max(0, -leftSwing) * 0.42) * walkBlend +
      -0.46 * rainBlend;

    figure.leftShoulderPivot.rotation.set(leftShoulderX, 0, leftShoulderZ);
    figure.leftElbowPivot.rotation.set(leftElbowX, 0, 0);

    /* --- Right Arm (side -X): relaxed stand / counter-walk / raised umbrella hold --- */
    const rightSwing = -gaitWave * 0.36;
    const rightShoulderX =
      0.02 * standWeight + rightSwing * walkBlend + -0.26 * rainBlend;
    const rightShoulderZ =
      -0.09 * standWeight + -0.11 * walkBlend + 0.08 * rainBlend;
    const rightElbowX =
      -0.14 * standWeight +
      (-0.2 - Math.max(0, -rightSwing) * 0.42) * walkBlend +
      -1.92 * rainBlend;

    figure.rightShoulderPivot.rotation.set(rightShoulderX, 0, rightShoulderZ);
    figure.rightElbowPivot.rotation.set(rightElbowX, 0, 0);

    /* --- Translucent Champagne Umbrella Smooth Scale, Fade & Upright Compensation --- */
    const showUmbrella = rainBlend > 0.015;
    figure.umbrella.group.visible = showUmbrella;
    if (showUmbrella) {
      const easedScale = rainBlend * rainBlend * (3 - 2 * rainBlend);
      figure.umbrella.group.scale.setScalar(Math.max(0.001, easedScale));

      // Cancel parent shoulder + elbow rotations so the canopy holds its exact upright tilt
      tmpQuatA
        .copy(figure.rightShoulderPivot.quaternion)
        .multiply(figure.rightElbowPivot.quaternion)
        .invert();
      tmpQuatB.copy(tmpQuatA).multiply(umbrellaTargetQuat);
      figure.umbrella.group.quaternion.copy(tmpQuatB);

      const targetOpacity =
        typeof figure.umbrella.canopyMat.userData.targetOpacity === 'number'
          ? (figure.umbrella.canopyMat.userData.targetOpacity as number)
          : 0.56;
      figure.umbrella.canopyMat.opacity = targetOpacity * easedScale;
    }

    /* --- Legs (Hip forward < 0, Knee anatomical backward bend >= 0) --- */
    const leftLegSwing = -gaitWave * 0.4;
    const rightLegSwing = gaitWave * 0.4;
    const leftKneeBend = Math.max(0, gaitCos) * 0.52 + 0.06;
    const rightKneeBend = Math.max(0, -gaitCos) * 0.52 + 0.06;

    figure.leftHipPivot.rotation.set(
      leftLegSwing * walkBlend - 0.03 * rainBlend,
      0,
      0.025 * (standWeight + rainBlend)
    );
    figure.leftKneePivot.rotation.set(leftKneeBend * walkBlend + 0.03 * rainBlend, 0, 0);

    figure.rightHipPivot.rotation.set(
      rightLegSwing * walkBlend + 0.02 * rainBlend,
      0,
      -0.025 * (standWeight + rainBlend)
    );
    figure.rightKneePivot.rotation.set(rightKneeBend * walkBlend + 0.02 * rainBlend, 0, 0);
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

      // Deflect raindrops smoothly at the translucent umbrella canopy dome
      const horizontalSq = drop.x * drop.x + drop.z * drop.z;
      const hitUmbrella =
        horizontalSq < UMBRELLA_DEFLECT_RADIUS * UMBRELLA_DEFLECT_RADIUS &&
        drop.y <= UMBRELLA_DEFLECT_Y &&
        drop.y > UMBRELLA_DEFLECT_Y - 0.55;

      if (hitUmbrella || drop.y < RAIN_BOTTOM_Y) {
        drop.y = RAIN_TOP_Y - ((i * 19) % 10) * 0.06;
        const resetRadius = 0.16 + Math.sqrt(((i * 31 + 11) % RAIN_COUNT) / RAIN_COUNT) * RAIN_COLUMN_RADIUS;
        const resetAngle = i * 2.3999632297 + drop.speed * 0.3;
        drop.x = Math.cos(resetAngle) * resetRadius + 0.42;
        drop.z = Math.sin(resetAngle) * resetRadius;
      }

      writeRainSegment(positions, i, drop.x, drop.y, drop.z, drop.streakLength);
    }
    rain.positionAttr.needsUpdate = true;
  };

  const updateOrbitalsAndDust = (elapsed: number, reducedMotion: boolean): void => {
    // Subtab subtle aesthetic focus modulation
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

    // Lightweight starlight micro-sparkle orbital drift
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
      // Smoothly wrap continuous 360° angle onto the visible front dial rail
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

      syncVisualMode(ctx.mood, ctx.theme);
      syncGlass(ctx.glassRatio);
      updateFigurePose(0, ctx.reducedMotion);
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
      // Gentle 45° editorial runway quarter-turn toward the tapped side
      const direction = ndcX >= -0.15 ? 1 : -1;
      const nextAngle = ctx.interaction.studioAngleRad + direction * (Math.PI * 0.25);
      ctx.emitUiSync({ studioAngleRad: nextAngle });
    },

    update(dt: number, elapsed: number, ctx: StageContext): void {
      const dampFast = ctx.reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      const dampPose = ctx.reducedMotion ? 1 : 1 - Math.exp(-7 * dt);
      const dampHover = ctx.reducedMotion ? 1 : 1 - Math.exp(-6 * dt);

      // Smoothly rotate 360° turntable toward interactive angle
      currentAngleRad = THREE.MathUtils.lerp(
        currentAngleRad,
        ctx.interaction.studioAngleRad,
        dampFast
      );
      turntableGroup.rotation.y = currentAngleRad;

      // Smoothly damp subtle hover parallax
      hoverSmoothX = THREE.MathUtils.lerp(hoverSmoothX, hoverTargetX, dampHover);
      hoverSmoothY = THREE.MathUtils.lerp(hoverSmoothY, hoverTargetY, dampHover);

      // Smooth pose state blending: Stand / Walk / Rain
      const targetWalk = ctx.interaction.studioPose === 'walk' ? 1 : 0;
      const targetRain = ctx.interaction.studioPose === 'rain' ? 1 : 0;
      walkBlend = THREE.MathUtils.lerp(walkBlend, targetWalk, dampPose);
      rainBlend = THREE.MathUtils.lerp(rainBlend, targetRain, dampPose);

      currentSubtab = ctx.interaction.studioSubtab;

      updateFigurePose(elapsed, ctx.reducedMotion);
      updateRainParticles(dt, ctx.reducedMotion);
      updateOrbitalsAndDust(elapsed, ctx.reducedMotion);
    },

    dispose(): void {
      disposeObject3D(group);
    },
  };
}
