import * as THREE from 'three';
import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { hexToRgb } from '../shared/colorMath.js';
import type { FittingSlotAssignments } from './fittingRenderer.ts';

export type BodyShapeKey =
  | 'slim'
  | 'standard_balanced'
  | 'upper_developed'
  | 'lower_developed'
  | 'muscular';

export interface BodyMorphSpec {
  gender: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  bodyShape: BodyShapeKey;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
}

export interface BodyShapePresetOption {
  key: BodyShapeKey;
  labelKo: string;
}

export const BODY_SHAPE_OPTIONS: readonly BodyShapePresetOption[] = [
  { key: 'slim', labelKo: '슬림' },
  { key: 'standard_balanced', labelKo: '표준' },
  { key: 'upper_developed', labelKo: '상체 발달' },
  { key: 'lower_developed', labelKo: '하체 볼륨' },
  { key: 'muscular', labelKo: '탄탄·머슬' },
] as const;

const BODY_STORAGE_KEY = 'ainventory_body_spec_v1';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeBodyShape(raw?: string | null): BodyShapeKey {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'slim' || s === 'lean') return 'slim';
  if (s === 'upper_developed' || s === 'inverted_triangle' || s === 'broad') {
    return 'upper_developed';
  }
  if (s === 'lower_developed' || s === 'pear' || s === 'curvy') return 'lower_developed';
  if (s === 'muscular' || s === 'athletic') return 'muscular';
  return 'standard_balanced';
}

export function getDefaultBodySpec(gender: 'male' | 'female' = 'male'): BodyMorphSpec {
  const isFemale = gender === 'female';
  return {
    gender: isFemale ? 'female' : 'male',
    heightCm: isFemale ? 164 : 176,
    weightKg: isFemale ? 52 : 70,
    bodyShape: 'standard_balanced',
    shoulderScale: 1,
    waistScale: 1,
    hipScale: 1,
  };
}

export function sanitizeBodySpec(partial?: Partial<BodyMorphSpec> | null): BodyMorphSpec {
  const gender: 'male' | 'female' = partial?.gender === 'female' ? 'female' : 'male';
  const def = getDefaultBodySpec(gender);
  const h = Number(partial?.heightCm);
  const w = Number(partial?.weightKg);
  const sh = Number(partial?.shoulderScale);
  const wa = Number(partial?.waistScale);
  const hi = Number(partial?.hipScale);

  return {
    gender,
    heightCm: Number.isFinite(h) && h > 0 ? clamp(Math.round(h), 145, 200) : def.heightCm,
    weightKg: Number.isFinite(w) && w > 0 ? clamp(Math.round(w), 38, 130) : def.weightKg,
    bodyShape: normalizeBodyShape(partial?.bodyShape),
    shoulderScale: Number.isFinite(sh) && sh > 0 ? clamp(Number(sh.toFixed(2)), 0.85, 1.2) : 1,
    waistScale: Number.isFinite(wa) && wa > 0 ? clamp(Number(wa.toFixed(2)), 0.82, 1.25) : 1,
    hipScale: Number.isFinite(hi) && hi > 0 ? clamp(Number(hi.toFixed(2)), 0.85, 1.22) : 1,
  };
}

export function getStoredBodySpec(): BodyMorphSpec {
  if (typeof window === 'undefined') return getDefaultBodySpec('male');
  try {
    const raw = window.localStorage.getItem(BODY_STORAGE_KEY);
    if (!raw) return getDefaultBodySpec('male');
    return sanitizeBodySpec(JSON.parse(raw) as Partial<BodyMorphSpec>);
  } catch {
    return getDefaultBodySpec('male');
  }
}

export function saveStoredBodySpec(spec: Partial<BodyMorphSpec>): BodyMorphSpec {
  const clean = sanitizeBodySpec(spec);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BODY_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // ignore storage quota
    }
  }
  return clean;
}

export function deriveBodySpecFromUser(
  user?: {
    gender?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    bodyShape?: string | null;
    isSampleDemo?: boolean;
  } | null,
  current?: BodyMorphSpec | null
): BodyMorphSpec {
  const base = current || getStoredBodySpec();
  if (!user || user.isSampleDemo) {
    return sanitizeBodySpec(base);
  }
  const accountGender: 'male' | 'female' =
    user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : base.gender;
  const def = getDefaultBodySpec(accountGender);
  return sanitizeBodySpec({
    ...base,
    gender: accountGender,
    heightCm: user.heightCm ?? (base.gender === accountGender ? base.heightCm : def.heightCm),
    weightKg: user.weightKg ?? (base.gender === accountGender ? base.weightKg : def.weightKg),
    bodyShape: user.bodyShape ? normalizeBodyShape(user.bodyShape) : base.bodyShape,
  });
}

/* -------------------------------------------------------------------------- */
/* Parametric Anthropometric Profile & Smooth Loft Geometry                   */
/* -------------------------------------------------------------------------- */

interface ResolvedMorphMetrics {
  gender: 'male' | 'female';
  statureScale: number;
  legLengthFactor: number;
  shoulderW: number;
  chestW: number;
  chestFrontZ: number;
  chestBackZ: number;
  bustLift: number;
  waistW: number;
  waistFrontZ: number;
  waistBackZ: number;
  hipW: number;
  hipFrontZ: number;
  hipBackZ: number;
  thighR: number;
  calfR: number;
  armR: number;
  neckR: number;
  hipSpacingX: number;
  armAngleRad: number;
}

function computeMorphMetrics(spec: BodyMorphSpec): ResolvedMorphMetrics {
  const isFemale = spec.gender === 'female';
  const hMeters = spec.heightCm / 100;
  const bmi = spec.weightKg / (hMeters * hMeters);
  const refBmi = isFemale ? 20.2 : 22.2;
  const bmiDelta = clamp((bmi - refBmi) / 10, -0.42, 0.88);

  let shMod = 1;
  let chMod = 1;
  let waMod = 1;
  let hiMod = 1;
  let limbMod = 1;

  switch (spec.bodyShape) {
    case 'slim':
      shMod = 0.94;
      chMod = 0.92;
      waMod = 0.89;
      hiMod = 0.93;
      limbMod = 0.9;
      break;
    case 'upper_developed':
      shMod = 1.11;
      chMod = 1.1;
      waMod = 0.95;
      hiMod = 0.96;
      limbMod = 1.04;
      break;
    case 'lower_developed':
      shMod = 0.95;
      chMod = 0.97;
      waMod = 0.96;
      hiMod = 1.12;
      limbMod = 1.08;
      break;
    case 'muscular':
      shMod = 1.13;
      chMod = 1.12;
      waMod = 0.92;
      hiMod = 1.01;
      limbMod = 1.11;
      break;
    default:
      break;
  }

  const statureScale = clamp(spec.heightCm / 174, 0.83, 1.15);
  const legLengthFactor = clamp(1 + (spec.heightCm - (isFemale ? 164 : 176)) * 0.0018, 0.95, 1.06);

  const shoulderW =
    (isFemale ? 0.172 : 0.208) *
    shMod *
    spec.shoulderScale *
    (1 + Math.max(0, bmiDelta) * 0.1);
  const chestW =
    (isFemale ? 0.142 : 0.166) *
    chMod *
    (0.65 + 0.35 * spec.shoulderScale) *
    (1 + bmiDelta * 0.22);
  const chestFrontZ =
    (isFemale ? 0.118 : 0.112) * chMod * (1 + bmiDelta * 0.25);
  const chestBackZ = (isFemale ? 0.095 : 0.106) * chMod * (1 + bmiDelta * 0.18);

  const waistW =
    (isFemale ? 0.116 : 0.142) *
    waMod *
    spec.waistScale *
    (1 + bmiDelta * 0.34);
  const waistFrontZ =
    (isFemale ? 0.088 : 0.098) *
    waMod *
    spec.waistScale *
    (1 + Math.max(-0.2, bmiDelta) * 0.42);
  const waistBackZ = (isFemale ? 0.082 : 0.09) * (1 + bmiDelta * 0.2);

  const rawHipW =
    (isFemale ? 0.164 : 0.156) *
    hiMod *
    spec.hipScale *
    (1 + bmiDelta * 0.26);
  const hipFrontZ = (isFemale ? 0.1 : 0.098) * hiMod * (1 + bmiDelta * 0.24);
  const hipBackZ =
    (isFemale ? 0.122 : 0.108) * hiMod * spec.hipScale * (1 + bmiDelta * 0.28);

  const thighR = (isFemale ? 0.076 : 0.08) * limbMod * (1 + bmiDelta * 0.25);
  const calfR = (isFemale ? 0.051 : 0.055) * limbMod * (1 + bmiDelta * 0.17);
  const armR = (isFemale ? 0.039 : 0.045) * limbMod * (1 + bmiDelta * 0.21);
  const neckR = (isFemale ? 0.045 : 0.053) * (1 + clamp(bmiDelta, -0.15, 0.35) * 0.13);

  const hipSpacingX = clamp(rawHipW * 0.47, 0.072, 0.096);
  const hipW = Math.max(rawHipW, hipSpacingX + thighR * 1.05);

  return {
    gender: spec.gender,
    statureScale,
    legLengthFactor,
    shoulderW,
    chestW,
    chestFrontZ,
    chestBackZ,
    bustLift: isFemale ? 0.022 * chMod : 0.008 * chMod,
    waistW,
    waistFrontZ,
    waistBackZ,
    hipW,
    hipFrontZ,
    hipBackZ,
    thighR,
    calfR,
    armR,
    neckR,
    hipSpacingX,
    armAngleRad: isFemale ? 0.175 : 0.195,
  };
}

interface LoftStation {
  x: number;
  y: number;
  z: number;
  rx: number;
  rzFront: number;
  rzBack: number;
  power?: number;
  bustLobe?: number;
  gluteLobe?: number;
  /** Optional local Z rotation in radians (for A-pose limbs) */
  rollZ?: number;
  /** Optional front-to-back Y pitch (`+yTilt` at Front `+Z`, `-yTilt` at Back `-Z`) */
  yTilt?: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function interpolateStations(stations: LoftStation[], targetCount: number): LoftStation[] {
  if (stations.length < 2 || targetCount <= stations.length) return stations;
  const out: LoftStation[] = [];
  const maxIdx = stations.length - 1;

  for (let i = 0; i < targetCount; i++) {
    const v = (i / (targetCount - 1)) * maxIdx;
    const idx = Math.min(maxIdx - 1, Math.floor(v));
    const frac = v - idx;

    const s0 = stations[Math.max(0, idx - 1)];
    const s1 = stations[idx];
    const s2 = stations[Math.min(maxIdx, idx + 1)];
    const s3 = stations[Math.min(maxIdx, idx + 2)];

    out.push({
      x: catmullRom(s0.x, s1.x, s2.x, s3.x, frac),
      y: catmullRom(s0.y, s1.y, s2.y, s3.y, frac),
      z: catmullRom(s0.z, s1.z, s2.z, s3.z, frac),
      rx: Math.max(0.002, catmullRom(s0.rx, s1.rx, s2.rx, s3.rx, frac)),
      rzFront: Math.max(0.002, catmullRom(s0.rzFront, s1.rzFront, s2.rzFront, s3.rzFront, frac)),
      rzBack: Math.max(0.002, catmullRom(s0.rzBack, s1.rzBack, s2.rzBack, s3.rzBack, frac)),
      power: catmullRom(s0.power ?? 2, s1.power ?? 2, s2.power ?? 2, s3.power ?? 2, frac),
      bustLobe: catmullRom(
        s0.bustLobe ?? 0,
        s1.bustLobe ?? 0,
        s2.bustLobe ?? 0,
        s3.bustLobe ?? 0,
        frac
      ),
      gluteLobe: catmullRom(
        s0.gluteLobe ?? 0,
        s1.gluteLobe ?? 0,
        s2.gluteLobe ?? 0,
        s3.gluteLobe ?? 0,
        frac
      ),
      rollZ: catmullRom(s0.rollZ ?? 0, s1.rollZ ?? 0, s2.rollZ ?? 0, s3.rollZ ?? 0, frac),
      yTilt: catmullRom(s0.yTilt ?? 0, s1.yTilt ?? 0, s2.yTilt ?? 0, s3.yTilt ?? 0, frac),
    });
  }
  return out;
}

interface LoftOptions {
  radialSegments?: number;
  axialSamples?: number;
  capBottom?: boolean;
  capTop?: boolean;
  /** Partial angular arc around Back (`theta=0` is Back `-Z`, `theta=±π` is Front `+Z`) */
  openFrontHalfGapRad?: number;
  /** Optional pleat wave amplitude & frequency */
  pleatAmp?: number;
  pleatFreq?: number;
  /** Optional nose ridge on head mesh */
  noseSculpt?: boolean;
}

function buildLoftGeometry(rawStations: LoftStation[], opts: LoftOptions = {}): THREE.BufferGeometry {
  const radialSegs = opts.radialSegments ?? 44;
  const axialCount = opts.axialSamples ?? Math.max(24, rawStations.length * 3);
  const stations = interpolateStations(rawStations, axialCount);
  const openGap = opts.openFrontHalfGapRad ?? 0;
  const isClosedRing = openGap <= 0.001;

  // When closed: theta goes [0 .. 2π] where 0 is Back (-Z) and π is Front (+Z).
  // When openFrontHalfGapRad > 0: theta goes [-(π - openGap) .. +(π - openGap)] centered at 0 (Back -Z).
  const startTheta = isClosedRing ? 0 : -(Math.PI - openGap);
  const endTheta = isClosedRing ? Math.PI * 2 : Math.PI - openGap;

  const cols = radialSegs + 1;
  const rows = stations.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const st = stations[r];
    const vNorm = r / (rows - 1);
    const pExp = 2 / clamp(st.power ?? 2, 1.5, 2.8);
    const cosRoll = Math.cos(st.rollZ ?? 0);
    const sinRoll = Math.sin(st.rollZ ?? 0);

    for (let c = 0; c < cols; c++) {
      const uNorm = c / radialSegs;
      const theta = startTheta + uNorm * (endTheta - startTheta);
      // dirX = sin(theta), dirZ = -cos(theta) => theta=0 is -Z (Back), theta=±π is +Z (Front)
      const rawSin = Math.sin(theta);
      const rawCos = -Math.cos(theta);

      const sX = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), pExp);
      const sZ = Math.sign(rawCos) * Math.pow(Math.abs(rawCos), pExp);

      const rz = sZ >= 0 ? st.rzFront : st.rzBack;
      let localX = sX * st.rx;
      let localZ = sZ * rz;

      // Anatomical chest/bust dual-cup contour on front (+Z)
      if ((st.bustLobe ?? 0) > 0.0005 && rawCos > 0.15) {
        const cupSym = Math.exp(-Math.pow((Math.abs(rawSin) - 0.44) / 0.34, 2));
        localZ += (st.bustLobe ?? 0) * Math.pow(rawCos, 1.3) * (0.45 + 0.55 * cupSym);
      }

      // Anatomical gluteal dual-lobe contour + spinal dimple on back (-Z)
      if ((st.gluteLobe ?? 0) > 0.0005 && rawCos < -0.1) {
        const backAmt = Math.abs(rawCos);
        const cheekLobe = Math.exp(-Math.pow((Math.abs(rawSin) - 0.42) / 0.36, 2));
        const cleftDip = Math.exp(-Math.pow(rawSin / 0.14, 2)) * 0.35;
        localZ -= (st.gluteLobe ?? 0) * backAmt * Math.max(0, cheekLobe - cleftDip);
      }

      // Subtle 3D nose bridge & tip on linearly spaced head mesh (`vNorm` 0.30..0.54)
      if (opts.noseSculpt && rawCos > 0.74 && vNorm > 0.3 && vNorm < 0.54) {
        const noseCenter = Math.exp(-Math.pow(rawSin / 0.13, 2));
        const noseProfile = Math.sin(((vNorm - 0.3) / 0.24) * Math.PI);
        localZ += 0.013 * noseCenter * Math.pow(noseProfile, 0.8) * ((rawCos - 0.74) / 0.26);
      }

      // Garment pleat / drape wave
      if ((opts.pleatAmp ?? 0) > 0) {
        const wave =
          Math.sin(theta * (opts.pleatFreq ?? 10)) * (opts.pleatAmp ?? 0) * (1 - vNorm * 0.65);
        localX += rawSin * wave;
        localZ += rawCos * wave;
      }

      // Rotate local X offset by rollZ (for angled A-pose limbs) + optional hairline yTilt
      const worldX = st.x + localX * cosRoll;
      const worldY = st.y + localX * sinRoll + rawCos * (st.yTilt ?? 0);
      const worldZ = st.z + localZ;

      positions.push(worldX, worldY, worldZ);
      uvs.push(uNorm, vNorm);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < radialSegs; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  if (isClosedRing && opts.capBottom) {
    const st = stations[0];
    const centerIdx = positions.length / 3;
    positions.push(st.x, st.y, st.z);
    uvs.push(0.5, 0);
    for (let c = 0; c < radialSegs; c++) {
      indices.push(centerIdx, c, c + 1);
    }
  }

  if (isClosedRing && opts.capTop) {
    const st = stations[rows - 1];
    const ringStart = (rows - 1) * cols;
    const centerIdx = positions.length / 3;
    positions.push(st.x, st.y, st.z);
    uvs.push(0.5, 1);
    for (let c = 0; c < radialSegs; c++) {
      indices.push(centerIdx, ringStart + c + 1, ringStart + c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals across c=0 and c=radialSegs on closed rings so back seam is invisible
  if (isClosedRing) {
    const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let r = 0; r < rows; r++) {
      const i0 = r * cols;
      const i1 = r * cols + radialSegs;
      const nx = normAttr.getX(i0) + normAttr.getX(i1);
      const ny = normAttr.getY(i0) + normAttr.getY(i1);
      const nz = normAttr.getZ(i0) + normAttr.getZ(i1);
      const len = Math.hypot(nx, ny, nz) || 1;
      normAttr.setXYZ(i0, nx / len, ny / len, nz / len);
      normAttr.setXYZ(i1, nx / len, ny / len, nz / len);
    }
    normAttr.needsUpdate = true;
  }

  return geo;
}

/* -------------------------------------------------------------------------- */
/* Procedural High-DPI Studio Face & Garment Fabric Canvas Textures           */
/* -------------------------------------------------------------------------- */

const faceTextureCache = new Map<string, THREE.CanvasTexture>();

function createStudioFaceTexture(skinHex: string, gender: 'male' | 'female'): THREE.CanvasTexture {
  const key = `v2:${gender}:${skinHex.toUpperCase()}`;
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const rgb = hexToRgb(skinHex);
  const isFemale = gender === 'female';

  // 1. Seamless base skin fill
  ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  ctx.fillRect(0, 0, size, size);

  // Linearly spaced headGeo (`y = 1.496 .. 1.724`):
  // UV v = 1 -> Canvas y = 0 (crown 1.724); UV v = 0 -> Canvas y = 512 (chin 1.496)
  // Brows: v = 0.555 -> y = 228; Eyes: v = 0.488 -> y = 262; Nose tip: v = 0.348 -> y = 334; Lips: v = 0.238 -> y = 390
  const eyeLeftX = 225;
  const eyeRightX = 287;
  const eyeY = 262;

  // Subtle warm studio cheek flush
  const cheekR = Math.min(255, Math.round(rgb.r * 1.04 + 10));
  const cheekG = Math.max(0, Math.round(rgb.g * 0.91));
  const cheekB = Math.max(0, Math.round(rgb.b * 0.89));

  for (const cx of [214, 298]) {
    const grad = ctx.createRadialGradient(cx, 304, 4, cx, 304, 34);
    grad.addColorStop(0, `rgba(${cheekR}, ${cheekG}, ${cheekB}, ${isFemale ? 0.34 : 0.16})`);
    grad.addColorStop(1, `rgba(${cheekR}, ${cheekG}, ${cheekB}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 40, 264, 80, 80);
  }

  // 2. Eyebrows
  ctx.save();
  ctx.strokeStyle = isFemale ? 'rgba(42, 31, 26, 0.82)' : 'rgba(34, 26, 22, 0.88)';
  ctx.lineCap = 'round';
  ctx.lineWidth = isFemale ? 4.6 : 6.4;

  ctx.beginPath();
  ctx.moveTo(eyeLeftX - 17, eyeY - 24);
  ctx.quadraticCurveTo(eyeLeftX - 2, eyeY - 31, eyeLeftX + 15, eyeY - 25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(eyeRightX - 15, eyeY - 25);
  ctx.quadraticCurveTo(eyeRightX + 2, eyeY - 31, eyeRightX + 17, eyeY - 24);
  ctx.stroke();
  ctx.restore();

  // 3. Almond Studio Eyes + Irises + Studio Catchlights
  const drawEye = (cx: number, dir: number) => {
    ctx.save();
    // Soft upper eyelid crease
    ctx.strokeStyle = `rgba(${Math.round(rgb.r * 0.62)}, ${Math.round(rgb.g * 0.52)}, ${Math.round(rgb.b * 0.48)}, 0.38)`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(cx - 13.5, eyeY - 7);
    ctx.quadraticCurveTo(cx, eyeY - 14.5, cx + 13.5, eyeY - 7);
    ctx.stroke();

    // Sclera almond clip
    ctx.beginPath();
    ctx.moveTo(cx - 13.5, eyeY + 1);
    ctx.quadraticCurveTo(cx, eyeY - 9.5, cx + 13.5, eyeY + 1);
    ctx.quadraticCurveTo(cx, eyeY + 8.5, cx - 13.5, eyeY + 1);
    ctx.closePath();
    ctx.fillStyle = '#F7F5F4';
    ctx.fill();

    ctx.save();
    ctx.clip();
    const irisGrad = ctx.createRadialGradient(cx, eyeY, 1, cx, eyeY, 6.8);
    irisGrad.addColorStop(0, '#181311');
    irisGrad.addColorStop(0.55, '#3C2921');
    irisGrad.addColorStop(1, '#1F1714');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, eyeY - 0.2, 6.6, 0, Math.PI * 2);
    ctx.fill();

    // Studio keylight catchlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.arc(cx - 2.1, eyeY - 2.2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Upper lash line
    ctx.strokeStyle = '#1E1715';
    ctx.lineWidth = isFemale ? 3.2 : 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 14, eyeY + 1.2);
    ctx.quadraticCurveTo(cx, eyeY - 9.8, cx + 14 + dir * 1.4, eyeY + 0.6);
    ctx.stroke();
    ctx.restore();
  };

  drawEye(eyeLeftX, -1);
  drawEye(eyeRightX, 1);

  // 4. Subtle Nose Tip Shadow
  const shadowR = Math.round(rgb.r * 0.72);
  const shadowG = Math.round(rgb.g * 0.62);
  const shadowB = Math.round(rgb.b * 0.58);
  ctx.strokeStyle = `rgba(${shadowR}, ${shadowG}, ${shadowB}, 0.34)`;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(250, 332);
  ctx.quadraticCurveTo(256, 339, 262, 332);
  ctx.stroke();

  // 5. Natural Harmonized Studio Lips
  const lipY = 388;
  const lipW = isFemale ? 18.5 : 19.5;
  const lipR = Math.min(242, Math.round(rgb.r * 0.88 + (isFemale ? 28 : 13)));
  const lipG = Math.round(rgb.g * (isFemale ? 0.57 : 0.65));
  const lipB = Math.round(rgb.b * (isFemale ? 0.59 : 0.66));

  ctx.fillStyle = `rgba(${lipR}, ${lipG}, ${lipB}, ${isFemale ? 0.8 : 0.54})`;
  ctx.beginPath();
  ctx.moveTo(256 - lipW, lipY);
  ctx.quadraticCurveTo(256 - 6, lipY - 7, 256, lipY - 4.5);
  ctx.quadraticCurveTo(256 + 6, lipY - 7, 256 + lipW, lipY);
  ctx.quadraticCurveTo(256, lipY + 10, 256 - lipW, lipY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(${Math.round(lipR * 0.68)}, ${Math.round(lipG * 0.62)}, ${Math.round(lipB * 0.62)}, 0.56)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(256 - lipW + 2, lipY + 0.5);
  ctx.quadraticCurveTo(256, lipY + 2.2, 256 + lipW - 2, lipY + 0.5);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  faceTextureCache.set(key, tex);
  return tex;
}

interface GarmentPalette {
  primaryHex: string;
  secondaryHex: string;
  hasPattern: boolean;
}

const sampledSwatchCache = new Map<string, GarmentPalette>();
const pendingImageLoads = new Map<string, Promise<GarmentPalette>>();

function fallbackGarmentPalette(garment: GarmentRecord): GarmentPalette {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(String(garment.color_hex || ''))
    ? String(garment.color_hex)
    : '#475569';
  const name = `${garment.name || ''} ${garment.subcategory || ''}`;
  const hasPattern = /스트라이프|체크|트위드|헤링본|데님|셀비지/.test(name);
  return {
    primaryHex: hex,
    secondaryHex: hex,
    hasPattern,
  };
}

export function sampleGarmentPaletteAsync(
  garment: GarmentRecord,
  onResolved?: () => void
): GarmentPalette {
  const cacheKey = `${garment.id}:${garment.image_url || ''}:${garment.color_hex || ''}`;
  const hit = sampledSwatchCache.get(cacheKey);
  if (hit) return hit;

  const initial = fallbackGarmentPalette(garment);
  if (typeof window === 'undefined' || !garment.image_url) {
    sampledSwatchCache.set(cacheKey, initial);
    return initial;
  }

  if (!pendingImageLoads.has(cacheKey)) {
    const p = new Promise<GarmentPalette>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 48;
          c.height = 48;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            sampledSwatchCache.set(cacheKey, initial);
            resolve(initial);
            return;
          }
          ctx.drawImage(img, 0, 0, 48, 48);
          const data = ctx.getImageData(0, 0, 48, 48).data;
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let count = 0;
          let diffSum = 0;

          for (let y = 10; y < 38; y++) {
            for (let x = 10; x < 38; x++) {
              const idx = (y * 48 + x) * 4;
              const a = data[idx + 3];
              if (a < 160) continue;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              // Skip pure studio background pixels (#F5F5F7) if not transparent
              if (r > 241 && g > 241 && b > 243 && initial.primaryHex.toUpperCase() !== '#FFFFFF') {
                continue;
              }
              rSum += r;
              gSum += g;
              bSum += b;
              if (x > 10) {
                const prev = idx - 4;
                if (data[prev + 3] >= 160) {
                  diffSum += Math.abs(r - data[prev]) + Math.abs(g - data[prev + 1]);
                }
              }
              count++;
            }
          }

          if (count > 24) {
            const mr = clamp(Math.round(rSum / count), 12, 248);
            const mg = clamp(Math.round(gSum / count), 12, 248);
            const mb = clamp(Math.round(bSum / count), 12, 248);
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            const sampledHex = `#${toHex(mr)}${toHex(mg)}${toHex(mb)}`.toUpperCase();
            const resPalette: GarmentPalette = {
              primaryHex: sampledHex,
              secondaryHex: initial.primaryHex,
              hasPattern: initial.hasPattern || diffSum / count > 22,
            };
            sampledSwatchCache.set(cacheKey, resPalette);
            onResolved?.();
            resolve(resPalette);
            return;
          }
        } catch {
          // fallback
        }
        sampledSwatchCache.set(cacheKey, initial);
        resolve(initial);
      };
      img.onerror = () => {
        sampledSwatchCache.set(cacheKey, initial);
        resolve(initial);
      };
      img.src = garment.image_url;
    });
    pendingImageLoads.set(cacheKey, p);
  }

  return initial;
}

const fabricTexCache = new Map<string, THREE.CanvasTexture>();

type FabricTextureKind =
  | 'top'
  | 'shirt'
  | 'knit'
  | 'outer'
  | 'bottom_yoke'
  | 'pant_leg'
  | 'denim_yoke'
  | 'denim_leg';

function createFabricTexture(
  primaryHex: string,
  kind: FabricTextureKind,
  hasPattern: boolean
): THREE.CanvasTexture {
  const key = `v2:${kind}:${primaryHex.toUpperCase()}:${hasPattern ? '1' : '0'}`;
  const cached = fabricTexCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rgb = hexToRgb(primaryHex);

  ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  ctx.fillRect(0, 0, size, size);

  const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  const seamInk = luma > 135 ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.13)';
  const subtleLight = 'rgba(255, 255, 255, 0.05)';
  const subtleDark = 'rgba(0, 0, 0, 0.07)';

  // Micro-weave texture
  if (kind === 'knit') {
    for (let x = 0; x < size; x += 6) {
      ctx.fillStyle = x % 12 === 0 ? subtleLight : subtleDark;
      ctx.fillRect(x, 0, 3, size);
    }
  } else if (kind === 'denim_yoke' || kind === 'denim_leg') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.lineWidth = 1;
    for (let i = -size; i < size * 2; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
  } else if (hasPattern) {
    ctx.fillStyle = luma > 150 ? 'rgba(30, 41, 59, 0.07)' : 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x < size; x += 12) {
      ctx.fillRect(x, 0, 2, size);
    }
  }

  ctx.strokeStyle = seamInk;
  ctx.lineWidth = 1.8;

  if (kind === 'shirt') {
    // Center front button placket & buttons at u = 0.5 (x = 128 on closed ring)
    ctx.strokeRect(124, 0, 8, size);
    ctx.fillStyle = luma > 150 ? 'rgba(30, 41, 59, 0.34)' : 'rgba(255, 255, 255, 0.52)';
    for (let y = 38; y < size - 24; y += 36) {
      ctx.beginPath();
      ctx.arc(128, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'bottom_yoke' || kind === 'denim_yoke') {
    // Clean waistband border at top of pelvic yoke (`y=0..18`) + fly stitch at `x=128`
    ctx.fillStyle = subtleDark;
    ctx.fillRect(0, 0, size, 18);
    ctx.beginPath();
    ctx.moveTo(128, 18);
    ctx.lineTo(128, 118);
    ctx.stroke();
  } else if (kind === 'pant_leg' || kind === 'denim_leg') {
    // Subtle tailored front crease at u=0.5 (x=128)
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, size);
    ctx.stroke();
  }

  // Soft hem shadow at bottom edge
  const hemGrad = ctx.createLinearGradient(0, size - 12, 0, size);
  hemGrad.addColorStop(0, 'rgba(0,0,0,0)');
  hemGrad.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = hemGrad;
  ctx.fillRect(0, size - 12, size, 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  fabricTexCache.set(key, tex);
  return tex;
}

/* -------------------------------------------------------------------------- */
/* Complete 360° Parametric Character + 3D Garment Scene Builder              */
/* -------------------------------------------------------------------------- */

export interface BuildAvatarSceneInput {
  bodySpec: BodyMorphSpec;
  skinToneHex: string;
  slots: FittingSlotAssignments;
  onAsyncTextureReady?: () => void;
}

function buildSculptedHair(isFemale: boolean, headW: number): THREE.Group {
  const hairGroup = new THREE.Group();
  const hairMat = new THREE.MeshStandardMaterial({
    color: isFemale ? '#1F1816' : '#221C19',
    roughness: 0.54,
    metalness: 0.06,
  });

  // Watertight 360° tilted cranium cap (`yTilt > 0` lifts front hairline cleanly above brows at `y = 1.664`
  // while sweeping smoothly down behind the ears to a low nape at `y = 1.525` — zero bald spots, zero spikes!)
  const craniumCapGeo = buildLoftGeometry(
    [
      {
        x: 0,
        y: 1.594,
        z: -0.008,
        rx: headW * 1.03,
        rzFront: 0.092,
        rzBack: 0.104,
        yTilt: 0.072,
        power: 2.02,
      },
      {
        x: 0,
        y: 1.636,
        z: -0.006,
        rx: headW * 1.09,
        rzFront: 0.101,
        rzBack: 0.116,
        yTilt: 0.042,
        power: 2.04,
      },
      {
        x: isFemale ? 0 : -0.003,
        y: 1.69,
        z: -0.006,
        rx: headW * 1.02,
        rzFront: 0.098,
        rzBack: 0.112,
        yTilt: 0.016,
        power: 2.02,
      },
      {
        x: isFemale ? 0 : -0.003,
        y: 1.734,
        z: -0.008,
        rx: headW * 0.76,
        rzFront: 0.078,
        rzBack: 0.088,
        yTilt: 0.004,
        power: 2.0,
      },
      {
        x: 0,
        y: isFemale ? 1.752 : 1.756,
        z: -0.009,
        rx: 0.024,
        rzFront: 0.026,
        rzBack: 0.028,
        yTilt: 0,
        power: 2.0,
      },
    ],
    { radialSegments: 44, axialSamples: 24, capTop: true }
  );
  hairGroup.add(new THREE.Mesh(craniumCapGeo, hairMat));

  if (isFemale) {
    // Sleek shoulder-skimming salon bob volume tucked cleanly behind the ears (`z = -0.038`),
    // framing the jawline & neck from Front/Side/Back/Top without ever covering the eyes!
    const bobVolumeGeo = buildLoftGeometry(
      [
        {
          x: 0,
          y: 1.388,
          z: -0.042,
          rx: headW * 1.18,
          rzFront: 0.04,
          rzBack: 0.068,
          power: 2.15,
        },
        {
          x: 0,
          y: 1.465,
          z: -0.038,
          rx: headW * 1.24,
          rzFront: 0.044,
          rzBack: 0.076,
          power: 2.1,
        },
        {
          x: 0,
          y: 1.555,
          z: -0.034,
          rx: headW * 1.2,
          rzFront: 0.04,
          rzBack: 0.082,
          power: 2.05,
        },
        {
          x: 0,
          y: 1.645,
          z: -0.026,
          rx: headW * 1.04,
          rzFront: 0.048,
          rzBack: 0.086,
          power: 2.02,
        },
      ],
      { radialSegments: 42, axialSamples: 22, capBottom: true, capTop: true }
    );
    hairGroup.add(new THREE.Mesh(bobVolumeGeo, hairMat));
  }

  return hairGroup;
}

export function buildParametricAvatarGroup(input: BuildAvatarSceneInput): THREE.Group {
  const { bodySpec, skinToneHex, slots, onAsyncTextureReady } = input;
  const m = computeMorphMetrics(bodySpec);
  const isFemale = m.gender === 'female';

  const root = new THREE.Group();
  root.name = 'ParametricStudioAvatar';

  const skinColor = new THREE.Color(skinToneHex || '#DFBA9B');
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.65,
    metalness: 0.02,
  });

  const faceTex = createStudioFaceTexture(skinToneHex || '#DFBA9B', m.gender);
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.63,
    metalness: 0.02,
  });

  const basewearMat = new THREE.MeshStandardMaterial({
    color: '#23262F',
    roughness: 0.76,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // 1. Seamless Welded Torso + Pelvis + Neck (with natural trapezius slope & recessed neck for crisp jawline)
  const torsoStations: LoftStation[] = [
    {
      x: 0,
      y: 0.835,
      z: -0.004,
      rx: m.hipW * 0.74,
      rzFront: m.hipFrontZ * 0.78,
      rzBack: m.hipBackZ * 0.82,
      power: 2.0,
      gluteLobe: 0.012,
    },
    {
      x: 0,
      y: 0.935,
      z: -0.006,
      rx: m.hipW,
      rzFront: m.hipFrontZ,
      rzBack: m.hipBackZ,
      power: 2.05,
      gluteLobe: isFemale ? 0.022 : 0.016,
    },
    {
      x: 0,
      y: 1.075,
      z: 0.004,
      rx: m.waistW,
      rzFront: m.waistFrontZ,
      rzBack: m.waistBackZ,
      power: 2.0,
    },
    {
      x: 0,
      y: 1.225,
      z: 0.004,
      rx: m.chestW,
      rzFront: m.chestFrontZ,
      rzBack: m.chestBackZ,
      power: isFemale ? 2.05 : 2.18,
      bustLobe: m.bustLift,
    },
    {
      x: 0,
      y: 1.33,
      z: -0.004,
      rx: m.shoulderW * 0.86,
      rzFront: m.chestFrontZ * 0.82,
      rzBack: m.chestBackZ * 0.9,
      power: 2.2,
    },
    {
      x: 0,
      y: 1.392,
      z: -0.009,
      rx: m.neckR * 1.34,
      rzFront: m.neckR * 1.12,
      rzBack: m.neckR * 1.2,
      power: 2.0,
    },
    {
      x: 0,
      y: 1.525,
      z: -0.012,
      rx: m.neckR * 0.9,
      rzFront: m.neckR * 0.92,
      rzBack: m.neckR * 0.96,
      power: 2.0,
    },
  ];

  const torsoGeo = buildLoftGeometry(torsoStations, {
    radialSegments: 48,
    axialSamples: 42,
    capBottom: true,
    capTop: true,
  });
  root.add(new THREE.Mesh(torsoGeo, skinMat));

  // 2. Sculpted Craniofacial Head (7 strictly linear Y stations `1.496 .. 1.724`, `Δy = 0.038`) + Ears + Hair
  const headW = isFemale ? 0.083 : 0.088;
  const headGeo = buildLoftGeometry(
    [
      { x: 0, y: 1.496, z: 0.015, rx: headW * 0.36, rzFront: 0.044, rzBack: 0.046, power: 2.0 },
      { x: 0, y: 1.534, z: 0.01, rx: headW * 0.74, rzFront: 0.082, rzBack: 0.078, power: 2.0 },
      { x: 0, y: 1.572, z: 0.004, rx: headW * 0.94, rzFront: 0.094, rzBack: 0.095, power: 2.02 },
      { x: 0, y: 1.61, z: -0.002, rx: headW * 1.0, rzFront: 0.096, rzBack: 0.104, power: 2.02 },
      { x: 0, y: 1.648, z: -0.005, rx: headW * 0.96, rzFront: 0.093, rzBack: 0.106, power: 2.0 },
      { x: 0, y: 1.686, z: -0.008, rx: headW * 0.8, rzFront: 0.08, rzBack: 0.092, power: 2.0 },
      { x: 0, y: 1.724, z: -0.01, rx: headW * 0.32, rzFront: 0.034, rzBack: 0.038, power: 2.0 },
    ],
    {
      radialSegments: 48,
      axialSamples: 36,
      capBottom: true,
      capTop: true,
      noseSculpt: true,
    }
  );
  root.add(new THREE.Mesh(headGeo, faceMat));

  for (const side of [-1, 1]) {
    const earGeo = new THREE.SphereGeometry(0.018, 14, 12);
    earGeo.scale(0.44, 1.15, 0.72);
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * headW * 0.98, 1.596, -0.008);
    root.add(ear);
  }

  root.add(buildSculptedHair(isFemale, headW));

  // 3. One-Piece Seamless Clavicle -> Deltoid -> Arm -> Wrist -> Hand Loft (Zero Shoulder Spheres, Zero Wrist Seam!)
  const buildFullArmStations = (
    side: -1 | 1,
    radiusPad = 0,
    tMax = 1.0,
    turnInCuff = false
  ): LoftStation[] => {
    const acromionX = side * (m.shoulderW * 0.85);
    const acromionY = 1.328;
    const sinA = Math.sin(m.armAngleRad) * side;
    const cosA = Math.cos(m.armAngleRad);

    interface ArmKnot {
      t: number;
      x: number;
      y: number;
      z: number;
      rx: number;
      rzF: number;
      rzB: number;
      roll: number;
    }

    const knots: ArmKnot[] = [
      // t=0: tucked deep inside upper chest so top cap stays completely enclosed
      {
        t: 0.0,
        x: side * (m.shoulderW * 0.52),
        y: 1.318,
        z: -0.005,
        rx: m.armR * 0.94,
        rzF: m.armR * 1.0,
        rzB: m.armR * 1.04,
        roll: -side * 0.24,
      },
      // t=0.12: smooth natural deltoid curve flush with shoulder line
      {
        t: 0.12,
        x: acromionX + sinA * 0.012,
        y: 1.312,
        z: -0.006,
        rx: m.armR * 1.08,
        rzF: m.armR * 1.08,
        rzB: m.armR * 1.1,
        roll: -side * (m.armAngleRad + 0.1),
      },
      // t=0.28: mid-bicep
      {
        t: 0.28,
        x: acromionX + sinA * 0.115,
        y: acromionY - cosA * 0.115,
        z: -0.007,
        rx: m.armR * 0.94,
        rzF: m.armR * 0.94,
        rzB: m.armR * 0.96,
        roll: -side * m.armAngleRad,
      },
      // t=0.50: elbow
      {
        t: 0.5,
        x: acromionX + sinA * 0.245,
        y: acromionY - cosA * 0.245,
        z: -0.003,
        rx: m.armR * 0.82,
        rzF: m.armR * 0.82,
        rzB: m.armR * 0.85,
        roll: -side * m.armAngleRad,
      },
      // t=0.70: forearm
      {
        t: 0.7,
        x: acromionX + sinA * 0.365,
        y: acromionY - cosA * 0.365,
        z: 0.008,
        rx: m.armR * 0.73,
        rzF: m.armR * 0.73,
        rzB: m.armR * 0.74,
        roll: -side * m.armAngleRad,
      },
      // t=0.87: wrist
      {
        t: 0.87,
        x: acromionX + sinA * 0.468,
        y: acromionY - cosA * 0.468,
        z: 0.018,
        rx: m.armR * 0.55,
        rzF: m.armR * 0.59,
        rzB: m.armR * 0.57,
        roll: -side * m.armAngleRad,
      },
      // t=0.94: palm
      {
        t: 0.94,
        x: acromionX + sinA * 0.522,
        y: acromionY - cosA * 0.522,
        z: 0.022,
        rx: m.armR * 0.43,
        rzF: m.armR * 0.72,
        rzB: m.armR * 0.58,
        roll: -side * m.armAngleRad,
      },
      // t=1.00: tapered studio fingertips
      {
        t: 1.0,
        x: acromionX + sinA * 0.575,
        y: acromionY - cosA * 0.575,
        z: 0.025,
        rx: m.armR * 0.22,
        rzF: m.armR * 0.44,
        rzB: m.armR * 0.36,
        roll: -side * m.armAngleRad,
      },
    ];

    const evalAt = (targetT: number): ArmKnot => {
      if (targetT <= knots[0].t) return knots[0];
      const last = knots[knots.length - 1];
      if (targetT >= last.t) return last;
      for (let i = 0; i < knots.length - 1; i++) {
        const a = knots[i];
        const b = knots[i + 1];
        if (targetT >= a.t && targetT <= b.t) {
          const u = (targetT - a.t) / (b.t - a.t);
          return {
            t: targetT,
            x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u,
            z: a.z + (b.z - a.z) * u,
            rx: a.rx + (b.rx - a.rx) * u,
            rzF: a.rzF + (b.rzF - a.rzF) * u,
            rzB: a.rzB + (b.rzB - a.rzB) * u,
            roll: a.roll + (b.roll - a.roll) * u,
          };
        }
      }
      return last;
    };

    const selected = knots.filter((k) => k.t < tMax - 0.02);
    selected.push(evalAt(tMax));

    const out: LoftStation[] = selected.map((k) => ({
      x: k.x,
      y: k.y,
      z: k.z,
      rx: k.rx + radiusPad,
      rzFront: k.rzF + radiusPad,
      rzBack: k.rzB + radiusPad,
      rollZ: k.roll,
    }));

    // Optional turned-in cuff rim so bottom (`하`) camera sees a solid tailored cuff instead of a hollow sleeve gap
    if (turnInCuff && out.length > 0 && radiusPad > 0.003) {
      const endK = evalAt(tMax);
      out.push({
        x: endK.x + sinA * 0.002,
        y: endK.y - cosA * 0.002,
        z: endK.z,
        rx: endK.rx + 0.0015,
        rzFront: endK.rzF + 0.0015,
        rzBack: endK.rzB + 0.0015,
        rollZ: endK.roll,
      });
    }

    // Reverse to ascending Y order (hand/cuff -> shoulder) so buildLoftGeometry winds outward normals!
    return out.reverse();
  };

  for (const side of [-1, 1] as const) {
    const fullArmGeo = buildLoftGeometry(buildFullArmStations(side, 0, 1.0, false), {
      radialSegments: 28,
      axialSamples: 28,
      capTop: true,
      capBottom: true,
    });
    root.add(new THREE.Mesh(fullArmGeo, skinMat));
  }

  // 4. Anatomical Legs + Feet (Top tucked smoothly inside pelvis so trousers never have a hip shelf)
  const buildLegStations = (side: -1 | 1): LoftStation[] => {
    const hipX = side * m.hipSpacingX;
    const ankleX = side * (m.hipSpacingX * 0.88);
    return [
      {
        x: ankleX,
        y: 0.075,
        z: -0.006,
        rx: m.calfR * 0.66,
        rzFront: m.calfR * 0.7,
        rzBack: m.calfR * 0.74,
      },
      {
        x: ankleX + (hipX - ankleX) * 0.16,
        y: 0.2,
        z: -0.008,
        rx: m.calfR * 0.78,
        rzFront: m.calfR * 0.8,
        rzBack: m.calfR * 0.9,
      },
      {
        x: ankleX + (hipX - ankleX) * 0.36,
        y: 0.34,
        z: -0.01,
        rx: m.calfR * 1.02,
        rzFront: m.calfR * 0.95,
        rzBack: m.calfR * 1.16,
      },
      {
        x: ankleX + (hipX - ankleX) * 0.55,
        y: 0.49,
        z: 0.002,
        rx: m.thighR * 0.76,
        rzFront: m.thighR * 0.78,
        rzBack: m.thighR * 0.78,
      },
      {
        x: ankleX + (hipX - ankleX) * 0.78,
        y: 0.68,
        z: 0.002,
        rx: m.thighR * 0.94,
        rzFront: m.thighR * 0.95,
        rzBack: m.thighR * 1.0,
      },
      {
        x: hipX * 0.92,
        y: 0.82,
        z: -0.002,
        rx: m.thighR * 0.98,
        rzFront: m.thighR * 0.96,
        rzBack: m.thighR * 1.04,
      },
      {
        x: hipX * 0.78,
        y: 0.915,
        z: -0.004,
        rx: m.thighR * 0.88,
        rzFront: m.thighR * 0.88,
        rzBack: m.thighR * 0.94,
      },
    ];
  };

  for (const side of [-1, 1] as const) {
    const legGeo = buildLoftGeometry(buildLegStations(side), {
      radialSegments: 32,
      axialSamples: 28,
      capTop: true,
      capBottom: true,
    });
    root.add(new THREE.Mesh(legGeo, skinMat));

    // Sculpted anatomical foot (when no shoes equipped, bare studio foot is visible)
    if (!slots.shoes) {
      const ankleX = side * (m.hipSpacingX * 0.88);
      const footGeo = buildLoftGeometry(
        [
          { x: ankleX, y: 0.004, z: 0.042, rx: 0.042, rzFront: 0.095, rzBack: 0.082, power: 2.2 },
          { x: ankleX, y: 0.032, z: 0.034, rx: 0.044, rzFront: 0.098, rzBack: 0.084, power: 2.1 },
          { x: ankleX, y: 0.068, z: 0.004, rx: 0.036, rzFront: 0.052, rzBack: 0.048, power: 2.0 },
        ],
        { radialSegments: 26, axialSamples: 12, capBottom: true, capTop: true }
      );
      root.add(new THREE.Mesh(footGeo, skinMat));
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 5. Fitted Studio Basewear (Active ONLY when Top+Outer or Bottom empty)   */
  /* ------------------------------------------------------------------------ */
  const topGarment = slots.top || null;
  const outerGarment = slots.outer || null;
  const bottomGarment = slots.bottom || null;
  const shoesGarment = slots.shoes || null;
  const accGarment = slots.accessory || null;

  const isDressEquipped =
    Boolean(topGarment) &&
    /dress|onepiece|원피스|드레스/i.test(
      `${topGarment?.category || ''} ${topGarment?.subcategory || ''} ${topGarment?.name || ''}`
    );

  // When both Top & Outerwear are unequipped, render a sleek fitted Crewneck Studio Base Tee (zero z-fighting!)
  if (!topGarment && !outerGarment) {
    const basePad = 0.0085;
    const baseTeeTorso: LoftStation[] = [
      {
        x: 0,
        y: 1.015,
        z: 0.001,
        rx: Math.max(m.waistW, m.hipW * 0.88) + basePad,
        rzFront: Math.max(m.waistFrontZ, m.hipFrontZ * 0.88) + basePad,
        rzBack: Math.max(m.waistBackZ, m.hipBackZ * 0.88) + basePad,
        power: 2.02,
      },
      ...torsoStations.slice(2, 6).map((s) => ({
        ...s,
        rx: s.rx + basePad,
        rzFront: s.rzFront + basePad,
        rzBack: s.rzBack + basePad,
      })),
    ];
    root.add(
      new THREE.Mesh(
        buildLoftGeometry(baseTeeTorso, { radialSegments: 46, axialSamples: 26 }),
        basewearMat
      )
    );

    for (const side of [-1, 1] as const) {
      const baseSleeve = buildFullArmStations(side, 0.007, isFemale ? 0.24 : 0.28, true);
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(baseSleeve, { radialSegments: 26, axialSamples: 14, capTop: true }),
          basewearMat
        )
      );
    }
  }

  if (!bottomGarment && !isDressEquipped) {
    const basePelvis = torsoStations
      .filter((s) => s.y <= 1.08)
      .map((s) => ({
        ...s,
        rx: s.rx + 0.007,
        rzFront: s.rzFront + 0.007,
        rzBack: s.rzBack + 0.007,
      }));
    root.add(
      new THREE.Mesh(
        buildLoftGeometry(basePelvis, { radialSegments: 44, axialSamples: 16, capBottom: true }),
        basewearMat
      )
    );
    for (const side of [-1, 1] as const) {
      const shortLeg = buildLegStations(side)
        .slice(3)
        .map((s) => ({
          ...s,
          rx: s.rx + 0.006,
          rzFront: s.rzFront + 0.006,
          rzBack: s.rzBack + 0.006,
        }));
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(shortLeg, { radialSegments: 28, axialSamples: 12 }),
          basewearMat
        )
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 6. Tailored 360° 3D Garment Meshes Mapped from User's Inventory          */
  /* ------------------------------------------------------------------------ */

  // --- BOTTOMS (Trousers / Jeans / Shorts / Skirt) ---
  if (bottomGarment && !isDressEquipped) {
    const pal = sampleGarmentPaletteAsync(bottomGarment, onAsyncTextureReady);
    const meta = `${bottomGarment.subcategory || ''} ${bottomGarment.name || ''}`.toLowerCase();
    const isSkirt = /skirt|스커트|치마/.test(meta);
    const isShorts = !isSkirt && /shorts|쇼츠|반바지|버뮤다/.test(meta);
    const isDenim = /denim|jeans|데님|진|셀비지/.test(meta);

    const yokeTex = createFabricTexture(
      pal.primaryHex,
      isDenim ? 'denim_yoke' : 'bottom_yoke',
      pal.hasPattern
    );
    const legTex = createFabricTexture(
      pal.primaryHex,
      isDenim ? 'denim_leg' : 'pant_leg',
      pal.hasPattern
    );

    const botYokeMat = new THREE.MeshStandardMaterial({
      map: yokeTex,
      roughness: isDenim ? 0.84 : 0.72,
      metalness: 0.03,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const botLegMat = new THREE.MeshStandardMaterial({
      map: legTex,
      roughness: isDenim ? 0.84 : 0.72,
      metalness: 0.03,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    if (isSkirt) {
      const skirtStations: LoftStation[] = [
        {
          x: 0,
          y: 0.48,
          z: 0,
          rx: m.hipW * 1.28,
          rzFront: m.hipFrontZ * 1.32,
          rzBack: m.hipBackZ * 1.32,
          power: 2.0,
        },
        {
          x: 0,
          y: 0.74,
          z: -0.002,
          rx: m.hipW * 1.12,
          rzFront: m.hipFrontZ * 1.12,
          rzBack: m.hipBackZ * 1.15,
          power: 2.0,
        },
        {
          x: 0,
          y: 0.94,
          z: -0.004,
          rx: m.hipW + 0.01,
          rzFront: m.hipFrontZ + 0.01,
          rzBack: m.hipBackZ + 0.01,
          power: 2.05,
        },
        {
          x: 0,
          y: 1.078,
          z: 0.004,
          rx: m.waistW + 0.009,
          rzFront: m.waistFrontZ + 0.009,
          rzBack: m.waistBackZ + 0.009,
          power: 2.0,
        },
      ];
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(skirtStations, {
            radialSegments: 48,
            axialSamples: 24,
            pleatAmp: 0.0035,
            pleatFreq: 12,
          }),
          botLegMat
        )
      );
    } else {
      // Seamless Pelvic Yoke + Tailored Trouser Legs (top of leg tucks smoothly inside yoke, zero hip shelf!)
      const pelvisYoke: LoftStation[] = [
        {
          x: 0,
          y: 0.805,
          z: -0.003,
          rx: m.hipSpacingX * 0.92 + m.thighR * 0.96 + 0.007,
          rzFront: m.hipFrontZ * 0.86 + 0.008,
          rzBack: m.hipBackZ * 0.9 + 0.01,
          power: 2.02,
        },
        {
          x: 0,
          y: 0.925,
          z: -0.005,
          rx: m.hipW + 0.01,
          rzFront: m.hipFrontZ + 0.01,
          rzBack: m.hipBackZ + 0.011,
          power: 2.05,
          gluteLobe: 0.014,
        },
        {
          x: 0,
          y: 1.08,
          z: 0.004,
          rx: m.waistW + 0.009,
          rzFront: m.waistFrontZ + 0.009,
          rzBack: m.waistBackZ + 0.009,
          power: 2.0,
        },
      ];
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(pelvisYoke, { radialSegments: 46, axialSamples: 18, capBottom: true }),
          botYokeMat
        )
      );

      const isWide = /와이드|플리츠|배기|릴렉스/.test(meta);
      const minCutR = isWide ? m.thighR * 0.94 : m.calfR * 1.15;
      const hemMinY = isShorts ? 0.5 : 0.105;

      for (const side of [-1, 1] as const) {
        const legBase = buildLegStations(side);
        const pantLeg: LoftStation[] = legBase
          .filter((s) => s.y >= hemMinY - 0.05)
          .map((s, idx, arr) => {
            const sy = Math.max(hemMinY, s.y);
            // Taper top station cleanly inside pelvisYoke so there is never an outer step
            const isTopInYoke = idx === arr.length - 1;
            const cutFloor = isTopInYoke ? 0 : minCutR;
            const pad = isTopInYoke ? 0.005 : 0.008;
            return {
              ...s,
              y: sy,
              rx: Math.max(s.rx + pad, cutFloor),
              rzFront: Math.max(s.rzFront + pad + 0.001, cutFloor * 0.98),
              rzBack: Math.max(s.rzBack + pad + 0.001, cutFloor * 1.02),
            };
          });

        // Subtle turned-in hem cuff at bottom of pant leg so `하` Bottom view looks solid & tailored
        if (pantLeg.length > 0) {
          const b0 = pantLeg[0];
          pantLeg.unshift({
            ...b0,
            y: b0.y + 0.002,
            rx: m.calfR * 0.72,
            rzFront: m.calfR * 0.75,
            rzBack: m.calfR * 0.78,
          });
        }

        root.add(
          new THREE.Mesh(
            buildLoftGeometry(pantLeg, {
              radialSegments: 32,
              axialSamples: 24,
              pleatAmp: 0.0014,
              pleatFreq: 4,
            }),
            botLegMat
          )
        );
      }
    }
  }

  // --- TOPS (Shirt / Knit / Turtleneck / T-Shirt / Dress) ---
  if (topGarment) {
    const pal = sampleGarmentPaletteAsync(topGarment, onAsyncTextureReady);
    const meta =
      `${topGarment.category || ''} ${topGarment.subcategory || ''} ${topGarment.name || ''}`.toLowerCase();
    const isShortSleeve = /tshirt|polo|sleeveless|반팔|티셔츠|폴로|슬리브리스/.test(meta);
    const isTurtleneck = /turtleneck|터틀넥|목폴라/.test(meta);
    const isShirt = /shirt|blouse|셔츠|옥스포드|블라우스/.test(meta) && !/tshirt|티셔츠/.test(meta);
    const isKnit = /knit|sweater|cardigan|니트|스웨터|캐시미어|메리노/.test(meta);

    const topTorsoTex = createFabricTexture(
      pal.primaryHex,
      isShirt ? 'shirt' : isKnit ? 'knit' : 'top',
      pal.hasPattern
    );
    const topSleeveTex = createFabricTexture(
      pal.primaryHex,
      isKnit ? 'knit' : 'top',
      pal.hasPattern
    );

    const topTorsoMat = new THREE.MeshStandardMaterial({
      map: topTorsoTex,
      roughness: isKnit ? 0.85 : 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const topSleeveMat = new THREE.MeshStandardMaterial({
      map: topSleeveTex,
      roughness: isKnit ? 0.85 : 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const topEase = 0.013;
    const topStations: LoftStation[] = isDressEquipped
      ? [
          {
            x: 0,
            y: 0.45,
            z: 0,
            rx: m.hipW * 1.32,
            rzFront: m.hipFrontZ * 1.35,
            rzBack: m.hipBackZ * 1.35,
            power: 2.0,
          },
          {
            x: 0,
            y: 0.92,
            z: -0.004,
            rx: m.hipW + topEase + 0.01,
            rzFront: m.hipFrontZ + topEase + 0.01,
            rzBack: m.hipBackZ + topEase + 0.01,
            power: 2.04,
          },
          ...torsoStations.slice(2, 6).map((s) => ({
            ...s,
            rx: s.rx + topEase,
            rzFront: s.rzFront + topEase,
            rzBack: s.rzBack + topEase,
          })),
        ]
      : [
          {
            x: 0,
            y: 0.965,
            z: -0.002,
            rx: Math.max(m.waistW, m.hipW * 0.94) + topEase + 0.006,
            rzFront: Math.max(m.waistFrontZ, m.hipFrontZ * 0.94) + topEase + 0.006,
            rzBack: Math.max(m.waistBackZ, m.hipBackZ * 0.94) + topEase + 0.007,
            power: 2.04,
          },
          ...torsoStations.slice(2, 6).map((s) => ({
            ...s,
            rx: s.rx + topEase,
            rzFront: s.rzFront + topEase,
            rzBack: s.rzBack + topEase,
          })),
        ];

    root.add(
      new THREE.Mesh(
        buildLoftGeometry(topStations, {
          radialSegments: 48,
          axialSamples: 28,
          pleatAmp: isDressEquipped ? 0.003 : 0.0012,
          pleatFreq: 8,
        }),
        topTorsoMat
      )
    );

    // 3D Collar / Turtleneck detail
    if (isTurtleneck) {
      const neckCollar = buildLoftGeometry(
        [
          {
            x: 0,
            y: 1.388,
            z: -0.008,
            rx: m.neckR * 1.38,
            rzFront: m.neckR * 1.2,
            rzBack: m.neckR * 1.26,
          },
          {
            x: 0,
            y: 1.462,
            z: -0.01,
            rx: m.neckR * 1.12,
            rzFront: m.neckR * 1.12,
            rzBack: m.neckR * 1.14,
          },
        ],
        { radialSegments: 36, axialSamples: 10 }
      );
      root.add(new THREE.Mesh(neckCollar, topSleeveMat));
    } else if (isShirt) {
      const shirtCollar = buildLoftGeometry(
        [
          {
            x: 0,
            y: 1.388,
            z: -0.008,
            rx: m.neckR * 1.42,
            rzFront: m.neckR * 1.22,
            rzBack: m.neckR * 1.28,
          },
          {
            x: 0,
            y: 1.434,
            z: -0.009,
            rx: m.neckR * 1.24,
            rzFront: m.neckR * 1.18,
            rzBack: m.neckR * 1.22,
          },
        ],
        { radialSegments: 36, axialSamples: 8, openFrontHalfGapRad: 0.24 }
      );
      root.add(new THREE.Mesh(shirtCollar, topSleeveMat));
    }

    // Seamless One-Piece Shoulder-to-Cuff Top Sleeves (Zero Shoulder Spheres!)
    const sleeveEndT = isShortSleeve ? 0.31 : 0.85;
    for (const side of [-1, 1] as const) {
      const sleeveStations = buildFullArmStations(side, 0.009, sleeveEndT, true);
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(sleeveStations, { radialSegments: 28, axialSamples: 20, capTop: true }),
          topSleeveMat
        )
      );
    }
  }

  // --- OUTERWEAR (Open-Front 3D Tailored Coat / Trench / Blazer / Jacket) ---
  if (outerGarment) {
    const pal = sampleGarmentPaletteAsync(outerGarment, onAsyncTextureReady);
    const meta = `${outerGarment.subcategory || ''} ${outerGarment.name || ''}`.toLowerCase();
    const isLongCoat = /trench|coat|트렌치|코트|롱|맥코트/.test(meta);
    const isPuffer = /padding|puffer|패딩|다운/.test(meta);

    const outTex = createFabricTexture(pal.primaryHex, 'outer', pal.hasPattern);
    const outMat = new THREE.MeshStandardMaterial({
      map: outTex,
      roughness: isPuffer ? 0.52 : 0.74,
      metalness: isPuffer ? 0.06 : 0.03,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const outEase = isPuffer ? 0.036 : 0.027;
    const hemY = isLongCoat ? 0.56 : 0.84;

    const outerStations: LoftStation[] = [
      {
        x: 0,
        y: hemY,
        z: -0.005,
        rx: m.hipW * (isLongCoat ? 1.18 : 1.06) + outEase,
        rzFront: m.hipFrontZ * (isLongCoat ? 1.15 : 1.05) + outEase,
        rzBack: m.hipBackZ * (isLongCoat ? 1.2 : 1.08) + outEase + 0.012,
        power: 2.08,
      },
      {
        x: 0,
        y: 0.94,
        z: -0.006,
        rx: Math.max(m.hipW, m.waistW * 1.06) + outEase + 0.006,
        rzFront: Math.max(m.hipFrontZ, m.waistFrontZ * 1.06) + outEase + 0.004,
        rzBack: Math.max(m.hipBackZ, m.waistBackZ * 1.06) + outEase + 0.014,
        power: 2.08,
        gluteLobe: 0.016,
      },
      {
        x: 0,
        y: 1.085,
        z: 0.003,
        rx: Math.max(m.waistW * 1.06, m.chestW * 0.92) + outEase,
        rzFront: m.waistFrontZ + outEase,
        rzBack: m.waistBackZ + outEase + 0.006,
        power: 2.12,
      },
      {
        x: 0,
        y: 1.225,
        z: 0.004,
        rx: m.chestW + outEase,
        rzFront: m.chestFrontZ + outEase,
        rzBack: m.chestBackZ + outEase + 0.004,
        power: 2.18,
        bustLobe: m.bustLift * 0.65,
      },
      {
        x: 0,
        y: 1.338,
        z: -0.005,
        rx: m.shoulderW * 0.88 + outEase,
        rzFront: m.chestFrontZ * 0.84 + outEase,
        rzBack: m.chestBackZ * 0.92 + outEase,
        power: 2.22,
      },
      {
        x: 0,
        y: 1.398,
        z: -0.009,
        rx: m.neckR * 1.48 + 0.014,
        rzFront: m.neckR * 1.24 + 0.012,
        rzBack: m.neckR * 1.32 + 0.014,
        power: 2.05,
      },
    ];

    // Open-front 3D coat shell (`openFrontHalfGapRad: 0.36` reveals the inner shirt/knit cleanly)
    root.add(
      new THREE.Mesh(
        buildLoftGeometry(outerStations, {
          radialSegments: 48,
          axialSamples: 30,
          openFrontHalfGapRad: 0.36,
          pleatAmp: isLongCoat ? 0.002 : 0.001,
          pleatFreq: 6,
        }),
        outMat
      )
    );

    // Structured 3D Collar + Lapel Rim
    const collarGeo = buildLoftGeometry(
      [
        {
          x: 0,
          y: 1.394,
          z: -0.009,
          rx: m.neckR * 1.54 + 0.014,
          rzFront: m.neckR * 1.28 + 0.012,
          rzBack: m.neckR * 1.38 + 0.014,
        },
        {
          x: 0,
          y: 1.446,
          z: -0.011,
          rx: m.neckR * 1.42 + 0.012,
          rzFront: m.neckR * 1.22 + 0.012,
          rzBack: m.neckR * 1.34 + 0.014,
        },
      ],
      { radialSegments: 36, axialSamples: 8, openFrontHalfGapRad: 0.44 }
    );
    root.add(new THREE.Mesh(collarGeo, outMat));

    // Seamless One-Piece Shoulder-to-Cuff Outer Sleeves (Zero Pauldron Spheres!)
    for (const side of [-1, 1] as const) {
      const outerSleeve = buildFullArmStations(side, outEase * 0.68, 0.87, true);
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(outerSleeve, { radialSegments: 28, axialSamples: 22, capTop: true }),
          outMat
        )
      );
    }
  }

  // --- SHOES (3D Loafers / Sneakers / Chelsea Boots with Distinct Outsole) ---
  if (shoesGarment) {
    const pal = sampleGarmentPaletteAsync(shoesGarment, onAsyncTextureReady);
    const meta = `${shoesGarment.subcategory || ''} ${shoesGarment.name || ''}`.toLowerCase();
    const isBoots = /boot|부츠|첼시|워커/.test(meta);
    const isSneakers = /sneaker|스니커즈|운동화|러너/.test(meta);

    const upperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.primaryHex),
      roughness: isSneakers ? 0.65 : 0.36,
      metalness: isSneakers ? 0.02 : 0.08,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: isSneakers ? '#F1F3F6' : '#1E1B1A',
      roughness: 0.85,
      metalness: 0.02,
    });

    for (const side of [-1, 1] as const) {
      const ankleX = side * (m.hipSpacingX * 0.88);
      // Outsole (visible from Front, Side, Back, AND Bottom `하`!)
      const soleGeo = buildLoftGeometry(
        [
          { x: ankleX, y: 0.0, z: 0.044, rx: 0.047, rzFront: 0.106, rzBack: 0.09, power: 2.3 },
          { x: ankleX, y: 0.018, z: 0.044, rx: 0.048, rzFront: 0.107, rzBack: 0.091, power: 2.3 },
        ],
        { radialSegments: 28, axialSamples: 6, capBottom: true, capTop: true }
      );
      root.add(new THREE.Mesh(soleGeo, soleMat));

      // Shoe Upper
      const upperStations: LoftStation[] = [
        { x: ankleX, y: 0.017, z: 0.043, rx: 0.045, rzFront: 0.102, rzBack: 0.088, power: 2.2 },
        { x: ankleX, y: 0.052, z: 0.032, rx: 0.044, rzFront: 0.092, rzBack: 0.082, power: 2.1 },
        {
          x: ankleX,
          y: 0.088,
          z: 0.002,
          rx: m.calfR * 0.72 + 0.008,
          rzFront: 0.056,
          rzBack: 0.056,
          power: 2.0,
        },
      ];
      if (isBoots) {
        upperStations.push({
          x: ankleX,
          y: 0.175,
          z: -0.006,
          rx: m.calfR * 0.82 + 0.008,
          rzFront: m.calfR * 0.84 + 0.008,
          rzBack: m.calfR * 0.92 + 0.008,
          power: 2.0,
        });
      }
      root.add(
        new THREE.Mesh(
          buildLoftGeometry(upperStations, {
            radialSegments: 28,
            axialSamples: 14,
            capTop: true,
          }),
          upperMat
        )
      );
    }
  }

  // --- ACCESSORIES (3D Headwear / Soft Draped Scarf / Structured Leather Bag) ---
  if (accGarment) {
    const pal = sampleGarmentPaletteAsync(accGarment, onAsyncTextureReady);
    const meta =
      `${accGarment.category || ''} ${accGarment.subcategory || ''} ${accGarment.name || ''}`.toLowerCase();
    const isHeadwear = /headwear|cap|beanie|beret|hat|볼캡|비니|베레모|모자|버킷햇/.test(meta);
    const isNeckwear =
      !isHeadwear && /neckwear|scarf|muffler|necktie|머플러|스카프|넥타이|타이/.test(meta);

    const accMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.primaryHex),
      roughness: 0.62,
      metalness: 0.04,
    });

    if (isHeadwear) {
      const crownGeo = new THREE.SphereGeometry(0.106, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.52);
      crownGeo.scale(0.98, 0.94, 1.1);
      const crown = new THREE.Mesh(crownGeo, accMat);
      crown.position.set(0, 1.654, -0.006);
      root.add(crown);

      if (!/beanie|비니|베레모/.test(meta)) {
        const brimGeo = new THREE.CylinderGeometry(0.088, 0.094, 0.008, 28, 1, false, -0.9, 1.8);
        brimGeo.scale(1.0, 1.0, 1.35);
        const brim = new THREE.Mesh(brimGeo, accMat);
        brim.position.set(0, 1.664, 0.07);
        brim.rotation.x = 0.22;
        root.add(brim);
      }
    } else if (isNeckwear) {
      const scarfRing = new THREE.Mesh(
        new THREE.TorusGeometry(m.neckR * 1.48, 0.021, 18, 40),
        accMat
      );
      scarfRing.position.set(0, 1.404, -0.004);
      scarfRing.rotation.x = Math.PI * 0.5 + 0.12;
      root.add(scarfRing);

      // Soft rounded fabric scarf tail curving naturally down the chest (never a boxy plank)
      const chestOutZ = m.chestFrontZ + m.bustLift * 0.6 + (outerGarment ? 0.032 : topGarment ? 0.02 : 0.014);
      const scarfDrapeGeo = buildLoftGeometry(
        [
          { x: 0.036, y: 1.165, z: chestOutZ - 0.004, rx: 0.027, rzFront: 0.007, rzBack: 0.007, power: 2.3 },
          { x: 0.035, y: 1.245, z: chestOutZ + 0.004, rx: 0.028, rzFront: 0.008, rzBack: 0.008, power: 2.25 },
          { x: 0.032, y: 1.335, z: chestOutZ - 0.008, rx: 0.026, rzFront: 0.009, rzBack: 0.009, power: 2.2 },
          { x: 0.026, y: 1.395, z: m.neckR * 1.38, rx: 0.022, rzFront: 0.01, rzBack: 0.01, power: 2.1 },
        ],
        { radialSegments: 24, axialSamples: 14, capBottom: true, capTop: true }
      );
      root.add(new THREE.Mesh(scarfDrapeGeo, accMat));
    } else {
      // Structured 3D Studio Leather Tote / Briefcase beside left hand (+X)
      const handX = m.shoulderW * 0.84 + Math.sin(m.armAngleRad) * 0.5 + 0.038;
      const bagGroup = new THREE.Group();
      bagGroup.position.set(handX, 0.67, 0.022);

      const bodyGeo = buildLoftGeometry(
        [
          { x: 0, y: -0.11, z: 0, rx: 0.042, rzFront: 0.135, rzBack: 0.135, power: 2.5 },
          { x: 0, y: 0.11, z: 0, rx: 0.036, rzFront: 0.128, rzBack: 0.128, power: 2.5 },
        ],
        { radialSegments: 28, axialSamples: 8, capBottom: true, capTop: true }
      );
      bagGroup.add(new THREE.Mesh(bodyGeo, accMat));

      const handleGeo = new THREE.TorusGeometry(0.052, 0.0065, 12, 24, Math.PI);
      for (const hx of [-0.024, 0.024]) {
        const handle = new THREE.Mesh(handleGeo, accMat);
        handle.position.set(hx, 0.11, 0);
        handle.rotation.y = Math.PI * 0.5;
        bagGroup.add(handle);
      }

      const claspMat = new THREE.MeshStandardMaterial({
        color: '#D4AF37',
        roughness: 0.28,
        metalness: 0.82,
      });
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.024), claspMat);
      clasp.position.set(0.038, 0.03, 0);
      bagGroup.add(clasp);

      root.add(bagGroup);
    }
  }

  // Apply stature height scaling (`175cm` = `1.0`, `188cm` taller, `156cm` more petite)
  root.scale.set(
    m.statureScale * 0.98,
    m.statureScale * m.legLengthFactor,
    m.statureScale * 0.98
  );

  return root;
}

export function disposeThreeObjectTree(root: THREE.Object3D | null): void {
  if (!root) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.dispose();
      }
    }
  });
}
