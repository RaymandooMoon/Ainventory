import { hexToRgb, rgbToHex } from '../shared/colorMath.js';
import {
  ALL_ISO_VIEW_ANGLES,
  type AvatarEyeShape,
  type AvatarFacialHair,
  type AvatarHairStyle,
  type AvatarHeadShape,
  type AvatarSpec,
  type AvatarViewAngleDeg,
  type ChestContourForm,
  type CoupledBodyMetrics,
  DEFAULT_ISO_VIEW_ANGLE,
  resolveCoupledBodyMetrics,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
import {
  type AdaptiveMstShadingPalette,
  computeAdaptiveMstShading,
} from './monkSkinTone.ts';

export const ISO_ELEVATION_DEG = 18;
export const ISO_ELEVATION_RAD = (ISO_ELEVATION_DEG * Math.PI) / 180;

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface IsoCrossSectionRing {
  center: Point2D;
  left: Point2D;
  right: Point2D;
  front: Point2D;
  back: Point2D;
  rx: number;
  ry: number;
}

export interface IsoArmChain {
  side: 'left' | 'right';
  shoulder: Point2D;
  bicep: Point2D;
  elbow: Point2D;
  forearm: Point2D;
  wrist: Point2D;
  palmCenter: Point2D;
  fingerTips: Point2D[];
  thumbTip: Point2D;
  outerContour: Point2D[];
  innerContour: Point2D[];
  radii: {
    shoulder: number;
    upperArm: number;
    elbow: number;
    forearm: number;
    wrist: number;
    handWidth: number;
    fingerThickness: number;
  };
  depthZ: number;
}

export interface IsoLegChain {
  side: 'left' | 'right';
  hip: Point2D;
  midThigh: Point2D;
  knee: Point2D;
  calf: Point2D;
  ankle: Point2D;
  heel: Point2D;
  instep: Point2D;
  ballOfFoot: Point2D;
  toeTips: Point2D[];
  outerContour: Point2D[];
  innerContour: Point2D[];
  footSolePolygon: Point2D[];
  footDorsalPolygon: Point2D[];
  radii: {
    thigh: number;
    knee: number;
    calf: number;
    ankle: number;
    footWidth: number;
    instepHeight: number;
  };
  depthZ: number;
}

export interface IsoCranialMetrics {
  rxPx: number;
  ryPx: number;
  rzPx: number;
  eyeLineY: number;
  browLineY: number;
  noseTip: Point2D;
  noseBridgeTop: Point2D;
  mouthCenter: Point2D;
  earLeft: Point2D;
  earRight: Point2D;
  earLeftVisible: boolean;
  earRightVisible: boolean;
  faceForwardOffsetPx: number;
}

export interface IsometricBodyFrame {
  spec: AvatarSpec;
  theme: 'light' | 'dark';
  width: number;
  height: number;
  compact: boolean;
  centerX: number;
  floorY: number;
  angleDeg: number;
  yawRad: number;
  elevRad: number;
  scale: number;
  facingFront: boolean;
  facingBack: boolean;
  sideSign: number;
  coupled: CoupledBodyMetrics;
  skinShading: AdaptiveMstShadingPalette;

  // Projected 2D joints & cross-section rings
  headCenter: Point2D;
  headCrown: Point2D;
  chinPoint: Point2D;
  jawLeft: Point2D;
  jawRight: Point2D;
  submentalPoint: Point2D;
  neckTopRing: IsoCrossSectionRing;
  neckBaseRing: IsoCrossSectionRing;
  clavicleRing: IsoCrossSectionRing;
  chestRing: IsoCrossSectionRing;
  bustApexLeft: Point2D;
  bustApexRight: Point2D;
  underbustRing: IsoCrossSectionRing;
  waistRing: IsoCrossSectionRing;
  abdomenApex: Point2D;
  pelvisRing: IsoCrossSectionRing;
  hipRing: IsoCrossSectionRing;
  gluteApex: Point2D;
  crotchPoint: Point2D;

  // Articulated limb chains
  leftArm: IsoArmChain;
  rightArm: IsoArmChain;
  leftLeg: IsoLegChain;
  rightLeg: IsoLegChain;

  // Torso outer silhouette polylines
  torsoLeftContour: Point2D[];
  torsoRightContour: Point2D[];
  torsoPolygon: Point2D[];

  // Depth-sorted limb keys
  farArmSide: 'left' | 'right';
  nearArmSide: 'left' | 'right';
  farLegSide: 'left' | 'right';
  nearLegSide: 'left' | 'right';

  // Cranial metrics & 3D projection helper
  cranial: IsoCranialMetrics;
  project3D: (x3: number, y3: number, z3: number) => Point2D;
  cameraDepth3D: (x3: number, y3: number, z3: number) => number;
}

export interface ComputeIsometricBodyFrameInput {
  spec: AvatarSpec;
  angleDeg?: number;
  width: number;
  height: number;
  compact?: boolean;
  theme?: 'light' | 'dark';
}

export type IsoLimbType =
  | 'arm'
  | 'leg'
  | 'upper_arm'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'lower_leg'
  | 'foot';

export type IsoLimbSide = 'left' | 'right';

export interface IsoLimbClipOptions {
  startT?: number;
  endT?: number;
  includeExtremity?: boolean;
  hideHand?: boolean;
  hideFoot?: boolean;
  minY?: number;
  maxY?: number;
}

export interface BasewearCoverageFlags {
  hasTop?: boolean;
  hasBottom?: boolean;
  hasOnepiece?: boolean;
}

export interface DrawHeadFaceHairOptions {
  hatEquipped?: boolean;
  faceImage?: HTMLImageElement | ImageBitmap | null;
  drawPhase?: 'back_hair' | 'head_and_front_hair' | 'all';
}

export interface RenderStandaloneAvatarOptions {
  spec: AvatarSpec;
  angleDeg?: number;
  width: number;
  height: number;
  theme?: 'light' | 'dark';
  compact?: boolean;
  clearCanvas?: boolean;
  drawBackdrop?: boolean;
  drawPlinth?: boolean;
  hatEquipped?: boolean;
  faceImage?: HTMLImageElement | ImageBitmap | null;
  coverageFlags?: BasewearCoverageFlags;
}

interface HairShadingPalette {
  base: string;
  highlight: string;
  specular: string;
  midShadow: string;
  deepShadow: string;
  contour: string;
}

// ============================================================================
// Angle, Color & Geometry Utilities
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Normalizes any continuous degree angle into `(-180, 180]` (`-180` maps cleanly to `180`).
 */
export function normalizeIsoAngleDeg(deg?: number): number {
  if (deg === undefined || deg === null || !Number.isFinite(deg)) {
    return DEFAULT_ISO_VIEW_ANGLE;
  }
  let norm = ((deg % 360) + 360) % 360;
  if (norm > 180) {
    norm -= 360;
  }
  if (norm === -180 || Object.is(norm, -0)) {
    return norm === -180 ? 180 : 0;
  }
  return norm;
}

/**
 * Snaps an arbitrary angle in degrees to the nearest canonical 8-way `AvatarViewAngleDeg`.
 */
export function snapToCanonicalIsoAngle(deg?: number): AvatarViewAngleDeg {
  const norm = normalizeIsoAngleDeg(deg);
  let best: AvatarViewAngleDeg = DEFAULT_ISO_VIEW_ANGLE;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of ALL_ISO_VIEW_ANGLES) {
    let diff = Math.abs(norm - candidate);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return best;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

function mixHexColors(hexA: string, hexB: string, t: number): string {
  const w = clamp(t, 0, 1);
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(
    a.r + (b.r - a.r) * w,
    a.g + (b.g - a.g) * w,
    a.b + (b.b - a.b) * w
  );
}

function computeHairShadingPalette(
  rawHex: string,
  theme: 'light' | 'dark'
): HairShadingPalette {
  const rgb = hexToRgb(rawHex || '#2B211B');
  const base = rgbToHex(rgb.r, rgb.g, rgb.b);
  const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;

  if (luma < 42) {
    // Jet black / deep espresso: lift cool-warm sheen so coils, braids & strands stay crisp
    const sheenTarget = theme === 'dark' ? '#7D8296' : '#676B7E';
    const specTarget = theme === 'dark' ? '#AEB5CC' : '#8F96AE';
    return {
      base,
      highlight: mixHexColors(base, sheenTarget, 0.48),
      specular: mixHexColors(base, specTarget, 0.62),
      midShadow: mixHexColors(base, '#0E0D11', 0.35),
      deepShadow: mixHexColors(base, '#08070A', 0.58),
      contour: '#100E13',
    };
  }

  if (luma > 185) {
    // Platinum / ash / silver: prevent washout against #FFFFFF studio backdrop
    return {
      base,
      highlight: mixHexColors(base, '#FFFFFF', 0.42),
      specular: mixHexColors(base, '#FFFFFF', 0.72),
      midShadow: mixHexColors(base, '#8C857B', 0.32),
      deepShadow: mixHexColors(base, '#605A52', 0.48),
      contour: '#6A635A',
    };
  }

  return {
    base,
    highlight: mixHexColors(base, '#FFF5E8', 0.28),
    specular: mixHexColors(base, '#FFFDF9', 0.46),
    midShadow: mixHexColors(base, '#17110E', 0.28),
    deepShadow: mixHexColors(base, '#120C0A', 0.5),
    contour: mixHexColors(base, '#120D0B', 0.65),
  };
}

function traceSmoothOpenPolyline(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point2D[],
  moveFirst = true
): void {
  if (pts.length === 0) return;
  if (moveFirst) {
    ctx.moveTo(pts[0].x, pts[0].y);
  } else {
    ctx.lineTo(pts[0].x, pts[0].y);
  }
  if (pts.length === 1) return;
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) * 0.5;
    const midY = (pts[i].y + pts[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function traceSmoothClosedPolygon(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point2D[]
): void {
  const n = pts.length;
  if (n < 3) return;
  const startX = (pts[n - 1].x + pts[0].x) * 0.5;
  const startY = (pts[n - 1].y + pts[0].y) * 0.5;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) * 0.5, (curr.y + next.y) * 0.5);
  }
  ctx.closePath();
}

function slicePolylineNormalized(
  pts: readonly Point2D[],
  startT: number,
  endT: number
): Point2D[] {
  if (pts.length < 2) return [...pts];
  const s = clamp(startT, 0, 1);
  const e = clamp(endT, 0, 1);
  if (e <= s + 1e-4) {
    const idx = clamp(Math.round(s * (pts.length - 1)), 0, pts.length - 1);
    return [pts[idx]];
  }

  const maxIdx = pts.length - 1;
  const startPos = s * maxIdx;
  const endPos = e * maxIdx;
  const i0 = Math.floor(startPos);
  const i1 = Math.ceil(endPos);

  const out: Point2D[] = [];
  const frac0 = startPos - i0;
  if (i0 < maxIdx && frac0 > 0) {
    out.push(lerpPoint(pts[i0], pts[i0 + 1], frac0));
  } else {
    out.push(pts[i0]);
  }

  for (let i = i0 + 1; i < i1 && i <= maxIdx; i++) {
    out.push(pts[i]);
  }

  const ceilPrev = Math.max(0, i1 - 1);
  if (i1 <= maxIdx) {
    const frac1 = endPos - ceilPrev;
    const endPt =
      ceilPrev < maxIdx ? lerpPoint(pts[ceilPrev], pts[ceilPrev + 1], clamp(frac1, 0, 1)) : pts[maxIdx];
    out.push(endPt);
  }
  return out;
}

// ============================================================================
// LRU Face Photo Loader & Memory Cache
// ============================================================================

const FACE_IMAGE_CACHE_LIMIT = 24;
const faceImageCache = new Map<string, HTMLImageElement>();
const faceImageInflight = new Map<string, Promise<HTMLImageElement | null>>();

function setFaceCacheLru(url: string, img: HTMLImageElement): void {
  if (faceImageCache.has(url)) {
    faceImageCache.delete(url);
  }
  faceImageCache.set(url, img);
  while (faceImageCache.size > FACE_IMAGE_CACHE_LIMIT) {
    const oldestKey = faceImageCache.keys().next().value;
    if (oldestKey !== undefined) {
      faceImageCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

export function getCachedFacePhotoImage(
  url: string | null | undefined
): HTMLImageElement | null {
  if (!url || typeof url !== 'string') return null;
  const key = url.trim();
  if (!key) return null;
  const hit = faceImageCache.get(key);
  if (!hit) return null;
  // Refresh LRU recency
  faceImageCache.delete(key);
  faceImageCache.set(key, hit);
  return hit;
}

/**
 * Asynchronously loads and caches a user portrait photo with LRU eviction (`24` slots).
 */
export function loadFacePhotoImage(url: string): Promise<HTMLImageElement | null> {
  const cleanUrl = typeof url === 'string' ? url.trim() : '';
  if (!cleanUrl || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  const cached = getCachedFacePhotoImage(cleanUrl);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = faceImageInflight.get(cleanUrl);
  if (inflight) {
    return inflight;
  }

  const loadAttempt = (useCors: boolean): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (useCors && /^https?:\/\//i.test(cleanUrl)) {
        img.crossOrigin = 'anonymous';
      }
      img.decoding = 'async';
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setFaceCacheLru(cleanUrl, img);
          resolve(img);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = cleanUrl;
    });

  const task = loadAttempt(true)
    .then((img) => {
      if (img || !/^https?:\/\//i.test(cleanUrl)) return img;
      return loadAttempt(false);
    })
    .finally(() => {
      faceImageInflight.delete(cleanUrl);
    });

  faceImageInflight.set(cleanUrl, task);
  return task;
}

// ============================================================================
// 8-Direction Isometric Projection & Anatomical Frame Solver
// ============================================================================

interface RingSliceSpec3D {
  cx3: number;
  y3: number;
  cz3: number;
  halfW: number;
  frontD: number;
  backD: number;
  dualLobeSep?: number;
  dualLobeProj?: number;
}

function buildCrossSectionRing(
  slice: RingSliceSpec3D,
  project3D: (x3: number, y3: number, z3: number) => Point2D,
  cameraDepth3D: (x3: number, y3: number, z3: number) => number,
  samples = 48
): IsoCrossSectionRing {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  let minDepth = Number.POSITIVE_INFINITY;

  let leftPt: Point2D = { x: 0, y: 0 };
  let rightPt: Point2D = { x: 0, y: 0 };
  let frontPt: Point2D = { x: 0, y: 0 };
  let backPt: Point2D = { x: 0, y: 0 };

  for (let i = 0; i < samples; i++) {
    const alpha = (i / samples) * Math.PI * 2;
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    const xLocal = slice.halfW * cosA;
    let zLocal = (sinA >= 0 ? slice.frontD : slice.backD) * sinA;

    // Subtle dual-lobe anterior shaping for pectoral/contoured/full_bust chest slices
    if (slice.dualLobeProj && slice.dualLobeProj > 0 && sinA > 0) {
      const lobeSep = slice.dualLobeSep ?? slice.halfW * 0.46;
      const distL = (xLocal - lobeSep) / Math.max(1, slice.halfW * 0.46);
      const distR = (xLocal + lobeSep) / Math.max(1, slice.halfW * 0.46);
      const twinFactor = Math.exp(-distL * distL * 1.65) + Math.exp(-distR * distR * 1.65);
      zLocal += slice.dualLobeProj * Math.pow(sinA, 1.35) * clamp(twinFactor, 0, 1.12);
    }

    const x3 = slice.cx3 + xLocal;
    const z3 = slice.cz3 + zLocal;
    const p2 = project3D(x3, slice.y3, z3);
    const depth = cameraDepth3D(x3, slice.y3, z3);

    if (p2.x < minX) {
      minX = p2.x;
      leftPt = p2;
    }
    if (p2.x > maxX) {
      maxX = p2.x;
      rightPt = p2;
    }
    if (depth > maxDepth) {
      maxDepth = depth;
      frontPt = p2;
    }
    if (depth < minDepth) {
      minDepth = depth;
      backPt = p2;
    }
  }

  const rx = Math.max(1, (rightPt.x - leftPt.x) * 0.5);
  const ry = Math.max(0.6, Math.abs(frontPt.y - backPt.y) * 0.5);
  const center: Point2D = {
    x: (leftPt.x + rightPt.x) * 0.5,
    y: (frontPt.y + backPt.y) * 0.5,
  };

  return {
    center,
    left: leftPt,
    right: rightPt,
    front: frontPt,
    back: backPt,
    rx,
    ry,
  };
}

function computeTubeContours2D(
  joints: readonly Point2D[],
  radii: readonly number[],
  bodyCenterX: number,
  fallbackOuterDir: number
): { outerContour: Point2D[]; innerContour: Point2D[] } {
  const n = joints.length;
  const outerContour: Point2D[] = [];
  const innerContour: Point2D[] = [];
  if (n === 0) return { outerContour, innerContour };

  const midLimbX = (joints[0].x + joints[n - 1].x) * 0.5;
  const deltaCenterX = midLimbX - bodyCenterX;
  const outerIsPositiveX =
    Math.abs(deltaCenterX) > 1.8 ? deltaCenterX > 0 : fallbackOuterDir >= 0;

  for (let i = 0; i < n; i++) {
    const prev = joints[Math.max(0, i - 1)];
    const next = joints[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    if (len < 1e-4) {
      tx = 0;
      ty = 1;
    } else {
      tx /= len;
      ty /= len;
    }

    // For downward tangent (tx ~ 0, ty > 0): (ty, -tx) points toward +X, (-ty, tx) points toward -X
    const posNormalX = ty;
    const posNormalY = -tx;
    const sign = outerIsPositiveX ? 1 : -1;
    const ox = posNormalX * sign;
    const oy = posNormalY * sign;
    const r = radii[i];

    outerContour.push({
      x: joints[i].x + ox * r,
      y: joints[i].y + oy * r,
    });
    innerContour.push({
      x: joints[i].x - ox * r,
      y: joints[i].y - oy * r,
    });
  }

  return { outerContour, innerContour };
}

/**
 * Computes the complete 8-direction isometric parametric body rig & anatomical cage frame.
 */
export function computeIsometricBodyFrame(
  input: ComputeIsometricBodyFrameInput
): IsometricBodyFrame {
  const spec = sanitizeAvatarSpec(input.spec);
  const width = Math.max(64, Number(input.width) || 360);
  const height = Math.max(96, Number(input.height) || 480);
  const compact = Boolean(input.compact);
  const theme: 'light' | 'dark' = input.theme === 'dark' ? 'dark' : 'light';

  const angleDeg = normalizeIsoAngleDeg(input.angleDeg);
  const yawRad = (angleDeg * Math.PI) / 180;
  const elevRad = ISO_ELEVATION_RAD;

  const cosYaw = Math.cos(yawRad);
  const sinYaw = Math.sin(yawRad);
  const cosElev = Math.cos(elevRad);
  const sinElev = Math.sin(elevRad);

  const facingFront = cosYaw >= -0.05;
  const facingBack = cosYaw < -0.25;
  const sideSign = sinYaw > 0.05 ? 1 : sinYaw < -0.05 ? -1 : 0;

  const coupled = resolveCoupledBodyMetrics(spec);
  const skinShading = computeAdaptiveMstShading({
    skinToneHex: spec.appearance.skinToneHex,
    mstLevel: spec.appearance.mstLevel,
    mstUndertone: spec.appearance.mstUndertone,
    personalColor: spec.appearance.personalColor,
    theme,
  });

  // Studio framing & scale (px per cm) preserving visible height differences (140..205cm)
  const floorRatio = compact ? 0.875 : 0.855;
  const usableHeightRatio = compact ? 0.805 : 0.768;
  const usableWidthRatio = compact ? 0.82 : 0.76;
  const studioRefProjectedCm = 195 * cosElev;
  const scaleY = (height * usableHeightRatio) / studioRefProjectedCm;
  const scaleX = (width * usableWidthRatio) / 96;
  const scale = Math.max(0.35, Math.min(scaleY, scaleX));

  const centerX = width * 0.5;
  const floorY = height * floorRatio;

  const project3D = (x3: number, y3: number, z3: number): Point2D => {
    const xCam = x3 * cosYaw + z3 * sinYaw;
    const zCam = -x3 * sinYaw + z3 * cosYaw;
    return {
      x: centerX + xCam * scale,
      y: floorY - y3 * cosElev * scale + zCam * sinElev * scale,
    };
  };

  const cameraDepth3D = (x3: number, _y3: number, z3: number): number => {
    return -x3 * sinYaw + z3 * cosYaw;
  };

  // Anthropometric coordinates in 3D centimeters (y=0 floor, +x anatomical left, +z anterior)
  const H = spec.anthropometrics.heightCm;
  const posS = Math.max(0, coupled.bmiSoftIndex);
  const legLenMul = clamp(spec.anthropometrics.legLengthScale, 0.88, 1.12);
  // Girth structural scale blends absolute & proportional sizing so short high-BMI retains true breadth
  const sScale = 0.36 + 0.64 * coupled.heightScale;

  // Vertical landmarks (cm)
  const headH = 22.8 * Math.pow(coupled.heightScale, 0.42) * coupled.headHeight;
  const crownY = H;
  const chinY = H - headH;
  const headCenterY = H - headH * 0.5;
  const submentalDropCm = 0.55 + 2.75 * coupled.submentalFullness;
  const submentalY = chinY - submentalDropCm;

  const neckTopY = chinY + headH * 0.08;
  const neckBaseY = 0.828 * H;
  const shoulderY = (0.808 - coupled.shoulderSlope * 0.048) * H;
  const clavicleY = lerp(neckBaseY, shoulderY, 0.62);
  const chestY = 0.728 * H;
  const bustApexDrop =
    (coupled.chestForm === 'full_bust'
      ? 1.45
      : coupled.chestForm === 'contoured'
        ? 0.85
        : 0.25) +
    0.75 * posS;
  const bustApexY = chestY - bustApexDrop;
  const underbustY = 0.682 * H;
  const waistY = 0.614 * H;
  const pelvisY = 0.554 * H;
  const abdomenY = pelvisY + (waistY - pelvisY) * 0.46 - 0.85 * posS;
  const hipY = 0.504 * H * (0.45 + 0.55 * legLenMul);
  const gluteY = hipY - 0.014 * H;
  const crotchY = 0.464 * H * (0.45 + 0.55 * legLenMul) - 1.05 * posS;

  const kneeY = 0.278 * H * legLenMul;
  const midThighY = kneeY + (hipY - kneeY) * 0.54;
  const ankleY = 7.4 * Math.pow(coupled.heightScale, 0.7) * Math.pow(coupled.instepHeight, 0.18);
  const calfY = ankleY + (kneeY - ankleY) * 0.61;

  // Head & Neck 3D widths/depths (cm)
  const headRx3 = 7.85 * coupled.headWidth * Math.pow(coupled.heightScale, 0.35);
  const headRz3 = 9.35 * (0.96 + 0.08 * posS) * Math.pow(coupled.heightScale, 0.35);
  const jawRx3 =
    headRx3 *
    (0.74 + 0.14 * (coupled.cheekFullness - 1) + 0.11 * coupled.jawSoftness);

  const neckRx3 = 5.35 * coupled.neckWidth * sScale;
  const neckRz3 = 5.45 * coupled.neckDepth * sScale;

  // Lower-limb base thigh radius computed early so glutes & hips align seamlessly in profile
  const thighR3 = 7.65 * coupled.thighRadius * sScale;

  // Torso 3D widths & asymmetric anterior/posterior depths (cm)
  const shoulderJointHalfX = 18.4 * coupled.shoulderHalfWidth * sScale;
  const clavicleHalfW = shoulderJointHalfX * 0.78;
  const ribHalfW = 14.2 * coupled.ribcageWidth * sScale;
  const bustHalfW = 14.9 * coupled.bustWidth * sScale;
  const underbustHalfW = 13.7 * coupled.ribcageWidth * sScale;
  const waistHalfW = 13.1 * coupled.waistHalfWidth * sScale;
  const abdomenHalfW =
    lerp(waistHalfW, 15.9 * coupled.pelvisHalfWidth * sScale, 0.52) +
    3.4 * coupled.abdomenProjection * sScale;
  const pelvisHalfW = 15.9 * coupled.pelvisHalfWidth * sScale;
  const hipHalfW = 16.9 * coupled.pelvisHalfWidth * sScale;

  const ribFrontD = 9.6 * coupled.ribcageDepth * sScale;
  const ribBackD = 9.4 * coupled.ribcageDepth * sScale;

  const chestExtraProj =
    (coupled.chestForm === 'full_bust'
      ? 8.4
      : coupled.chestForm === 'contoured'
        ? 6.2
        : coupled.chestForm === 'pectoral'
           ? 4.2
          : 2.2) *
    coupled.chestProjection *
    sScale;
  const dualLobeProj =
    (coupled.chestForm === 'full_bust'
      ? 3.4
      : coupled.chestForm === 'contoured'
        ? 2.2
        : coupled.chestForm === 'pectoral'
          ? 1.0
          : 0.2) *
    coupled.chestProjection *
    sScale;

  const chestFrontD = ribFrontD + chestExtraProj * 0.72;
  const chestBackD = ribBackD * 1.02;

  const underbustFrontD = ribFrontD * 0.95 + 2.2 * coupled.abdomenProjection * sScale;
  const underbustBackD = ribBackD * 0.95;

  const waistFrontD = (8.8 * coupled.waistDepth + 6.8 * coupled.abdomenProjection) * sScale;
  const waistBackD = 8.2 * coupled.waistDepth * sScale; // Natural lumbar lordosis tuck

  const abdomenFrontD = (9.2 * coupled.waistDepth + 9.8 * coupled.abdomenProjection) * sScale;
  const abdomenBackD = 8.8 * coupled.waistDepth * sScale;

  const pelvisFrontD = (9.0 * coupled.hipDepth + 6.4 * coupled.abdomenProjection) * sScale;
  const pelvisBackD =
    Math.max(8.8 * coupled.hipDepth * sScale, thighR3 * 0.92) +
    (1.4 + 3.6 * coupled.gluteProjection) * sScale;

  const hipFrontD = (8.7 * coupled.hipDepth + 3.1 * coupled.abdomenProjection) * sScale;
  const hipBackD =
    Math.max(9.0 * coupled.hipDepth * sScale, thighR3 * 0.98) +
    (1.8 + 4.8 * coupled.gluteProjection) * sScale;

  // Cross-section rings
  const neckTopRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: neckTopY,
      cz3: -0.6 * sScale,
      halfW: neckRx3 * 0.94,
      frontD: neckRz3 * 0.92 + 1.8 * coupled.submentalFullness * sScale,
      backD: neckRz3 * 0.95,
    },
    project3D,
    cameraDepth3D
  );

  const neckBaseRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: neckBaseY,
      cz3: -0.3 * sScale,
      halfW: neckRx3 * 1.12,
      frontD: neckRz3 * 1.04,
      backD: neckRz3 * 1.08,
    },
    project3D,
    cameraDepth3D
  );

  const clavicleRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: clavicleY,
      cz3: -0.1 * sScale,
      halfW: clavicleHalfW,
      frontD: ribFrontD * 0.86,
      backD: ribBackD * 0.9,
    },
    project3D,
    cameraDepth3D
  );

  const chestRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: chestY,
      cz3: 0.4 * sScale,
      halfW: bustHalfW,
      frontD: chestFrontD,
      backD: chestBackD,
      dualLobeSep: bustHalfW * 0.46,
      dualLobeProj,
    },
    project3D,
    cameraDepth3D
  );

  const underbustRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: underbustY,
      cz3: 0.2 * sScale,
      halfW: underbustHalfW,
      frontD: underbustFrontD,
      backD: underbustBackD,
    },
    project3D,
    cameraDepth3D
  );

  const waistRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: waistY,
      cz3: 0.3 * sScale,
      halfW: waistHalfW,
      frontD: waistFrontD,
      backD: waistBackD,
    },
    project3D,
    cameraDepth3D
  );

  const pelvisRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: pelvisY,
      cz3: 0.15 * sScale,
      halfW: pelvisHalfW,
      frontD: pelvisFrontD,
      backD: pelvisBackD,
    },
    project3D,
    cameraDepth3D
  );

  const hipRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: hipY,
      cz3: -0.35 * sScale,
      halfW: hipHalfW,
      frontD: hipFrontD,
      backD: hipBackD,
    },
    project3D,
    cameraDepth3D
  );

  // Build dense 3D-to-2D torso outer contours with natural trapezius slope & rounded belly/glute domes
  const torsoSliceSpecs: RingSliceSpec3D[] = [
    {
      cx3: 0,
      y3: lerp(neckBaseY, shoulderY, 0.34),
      cz3: -0.2 * sScale,
      halfW: lerp(neckRx3 * 1.14, shoulderJointHalfX * 0.76, 0.42),
      frontD: lerp(neckRz3 * 1.06, ribFrontD * 0.84, 0.45),
      backD: lerp(neckRz3 * 1.1, ribBackD * 0.88, 0.45),
    },
    {
      cx3: 0,
      y3: clavicleY,
      cz3: -0.1 * sScale,
      halfW: shoulderJointHalfX * 0.74,
      frontD: ribFrontD * 0.85,
      backD: ribBackD * 0.89,
    },
    {
      cx3: 0,
      y3: shoulderY,
      cz3: 0.05 * sScale,
      halfW: shoulderJointHalfX * 0.88,
      frontD: ribFrontD * 0.94,
      backD: ribBackD * 0.96,
    },
    {
      cx3: 0,
      y3: lerp(shoulderY, chestY, 0.55),
      cz3: 0.25 * sScale,
      halfW: lerp(ribHalfW * 1.04, bustHalfW, 0.68),
      frontD: lerp(ribFrontD, chestFrontD, 0.72),
      backD: chestBackD,
      dualLobeSep: bustHalfW * 0.46,
      dualLobeProj: dualLobeProj * 0.6,
    },
    {
      cx3: 0,
      y3: bustApexY,
      cz3: 0.45 * sScale,
      halfW: bustHalfW,
      frontD: chestFrontD + dualLobeProj * 0.35,
      backD: chestBackD,
      dualLobeSep: bustHalfW * 0.46,
      dualLobeProj,
    },
    {
      cx3: 0,
      y3: underbustY,
      cz3: 0.2 * sScale,
      halfW: underbustHalfW,
      frontD: underbustFrontD,
      backD: underbustBackD,
    },
    {
      cx3: 0,
      y3: lerp(underbustY, waistY, 0.5),
      cz3: 0.25 * sScale,
      halfW: lerp(underbustHalfW, waistHalfW, 0.55),
      frontD: lerp(underbustFrontD, waistFrontD, 0.55),
      backD: lerp(underbustBackD, waistBackD, 0.6),
    },
    {
      cx3: 0,
      y3: waistY,
      cz3: 0.3 * sScale,
      halfW: waistHalfW,
      frontD: waistFrontD,
      backD: waistBackD,
    },
    {
      cx3: 0,
      y3: lerp(waistY, abdomenY, 0.5),
      cz3: 0.38 * sScale,
      halfW: lerp(waistHalfW, abdomenHalfW, 0.62),
      frontD: lerp(waistFrontD, abdomenFrontD, 0.74),
      backD: lerp(waistBackD, abdomenBackD, 0.55),
    },
    {
      cx3: 0,
      y3: abdomenY,
      cz3: 0.42 * sScale,
      halfW: abdomenHalfW,
      frontD: abdomenFrontD,
      backD: abdomenBackD,
    },
    {
      cx3: 0,
      y3: lerp(abdomenY, pelvisY, 0.52),
      cz3: 0.3 * sScale,
      halfW: lerp(abdomenHalfW, pelvisHalfW, 0.55),
      frontD: lerp(abdomenFrontD, pelvisFrontD, 0.7),
      backD: lerp(abdomenBackD, pelvisBackD, 0.55),
    },
    {
      cx3: 0,
      y3: pelvisY,
      cz3: 0.15 * sScale,
      halfW: pelvisHalfW,
      frontD: pelvisFrontD,
      backD: pelvisBackD,
    },
    {
      cx3: 0,
      y3: hipY,
      cz3: -0.35 * sScale,
      halfW: hipHalfW,
      frontD: hipFrontD,
      backD: hipBackD,
    },
    {
      cx3: 0,
      y3: gluteY,
      cz3: -0.5 * sScale,
      halfW: hipHalfW * 0.96,
      frontD: hipFrontD * 0.88,
      backD: hipBackD * 0.98,
    },
    {
      cx3: 0,
      y3: crotchY,
      cz3: -0.35 * sScale,
      halfW: hipHalfW * 0.68,
      frontD: hipFrontD * 0.66,
      backD: Math.max(thighR3 * 0.9, hipBackD * 0.72),
    },
  ];

  const torsoLeftContour: Point2D[] = [];
  const torsoRightContour: Point2D[] = [];
  for (const sl of torsoSliceSpecs) {
    const r = buildCrossSectionRing(sl, project3D, cameraDepth3D, 40);
    torsoLeftContour.push(r.left);
    torsoRightContour.push(r.right);
  }

  const crotchPoint = project3D(0, crotchY, 0.6 * sScale);
  const bustSep3 = bustHalfW * 0.46;
  const bustApexZ3 = 0.45 * sScale + chestFrontD + dualLobeProj * 0.85;
  const bustApexLeft = project3D(bustSep3, bustApexY, bustApexZ3);
  const bustApexRight = project3D(-bustSep3, bustApexY, bustApexZ3);
  const abdomenApex = project3D(0, abdomenY, 0.42 * sScale + abdomenFrontD);
  const gluteApex = project3D(0, gluteY, -0.5 * sScale - hipBackD * 0.98);

  const torsoPolygon: Point2D[] = [
    neckBaseRing.left,
    ...torsoLeftContour,
    crotchPoint,
    ...[...torsoRightContour].reverse(),
    neckBaseRing.right,
  ];

  // Cranial, Jaw & Submental points
  const headZOffset = 0.8 * sScale;
  const headCenter = project3D(0, headCenterY, headZOffset);
  const headCrown = project3D(0, crownY, headZOffset - 0.5 * sScale);
  const chinZ3 = headZOffset + headRz3 * (0.92 + 0.06 * coupled.cheekFullness);
  const chinPoint = project3D(0, chinY, chinZ3);
  const submentalZ3 =
    lerp(neckRz3, chinZ3, 0.45 + 0.36 * coupled.submentalFullness);
  const submentalPoint = project3D(0, submentalY, submentalZ3);

  const jawRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: chinY + headH * 0.16,
      cz3: headZOffset,
      halfW: jawRx3,
      frontD: headRz3 * 0.9,
      backD: headRz3 * 0.72,
    },
    project3D,
    cameraDepth3D,
    36
  );
  const jawLeft = jawRing.left;
  const jawRight = jawRing.right;

  // Cranial detailed facial anchors
  const eyeY3 = chinY + headH * 0.48;
  const browY3 = chinY + headH * 0.585;
  const noseTipY3 = chinY + headH * 0.34;
  const mouthY3 = chinY + headH * 0.205;
  const earY3 = chinY + headH * 0.455;

  const eyeCenter2D = project3D(0, eyeY3, headZOffset + headRz3 * 0.92);
  const browCenter2D = project3D(0, browY3, headZOffset + headRz3 * 0.94);
  const noseBridgeTop = project3D(0, eyeY3 + headH * 0.03, headZOffset + headRz3 * 0.98);
  const noseTip = project3D(
    0,
    noseTipY3,
    headZOffset + headRz3 * (1.1 + 0.04 * spec.appearance.noseWidthScale)
  );
  const mouthCenter = project3D(0, mouthY3, headZOffset + headRz3 * 0.97);

  const earLatX = headRx3 * (0.98 - 0.1 * Math.abs(sinYaw));
  const earPostZ = headZOffset - headRz3 * 0.34;
  const earLeft3: Point3D = { x: earLatX, y: earY3, z: earPostZ };
  const earRight3: Point3D = { x: -earLatX, y: earY3, z: earPostZ };
  const earLeft = project3D(earLeft3.x, earLeft3.y, earLeft3.z);
  const earRight = project3D(earRight3.x, earRight3.y, earRight3.z);
  // Left (+x3) ear is occluded when turned right (sinYaw > 0.35); Right (-x3) ear is occluded when turned left (sinYaw < -0.35)
  const earLeftVisible = sinYaw <= 0.35;
  const earRightVisible = sinYaw >= -0.35;

  const cranialRing = buildCrossSectionRing(
    {
      cx3: 0,
      y3: headCenterY,
      cz3: headZOffset,
      halfW: headRx3,
      frontD: headRz3,
      backD: headRz3 * 0.98,
    },
    project3D,
    cameraDepth3D,
    36
  );

  const cranial: IsoCranialMetrics = {
    rxPx: cranialRing.rx,
    ryPx: (headH * 0.5) * cosElev * scale,
    rzPx: headRz3 * scale,
    eyeLineY: eyeCenter2D.y,
    browLineY: browCenter2D.y,
    noseTip,
    noseBridgeTop,
    mouthCenter,
    earLeft,
    earRight,
    earLeftVisible,
    earRightVisible,
    faceForwardOffsetPx: (noseTip.x - headCenter.x) * 0.72,
  };

  // Articulated Upper Limbs (Left = +x3, Right = -x3) with collision-free high-BMI clearance
  const shoulderR3 = 5.15 * coupled.upperArmRadius * sScale;
  const upperArmR3 = 4.85 * coupled.upperArmRadius * sScale;
  const elbowR3 = 3.95 * (coupled.upperArmRadius * 0.52 + coupled.forearmRadius * 0.48) * sScale;
  const forearmR3 = 4.15 * coupled.forearmRadius * sScale;
  const wristR3 = 2.95 * coupled.wristRadius * sScale;
  const handWidth3 = 4.45 * coupled.handWidth * sScale;
  const fingerThick3 = 1.06 * coupled.fingerThickness * sScale;

  const armLenScale = 0.4 + 0.6 * coupled.heightScale;
  const upperArmLen = 27.5 * armLenScale;
  const forearmLen = 24.5 * armLenScale;
  const palmLen = 8.4 * armLenScale * (0.94 + 0.08 * coupled.handWidth);
  const fingerLen = 8.2 * armLenScale;

  const buildArm = (side: 'left' | 'right'): IsoArmChain => {
    const sgn = side === 'left' ? 1 : -1;
    const shX = sgn * (shoulderJointHalfX * 0.91);
    const shY = shoulderY + shoulderR3 * 0.12;
    const shZ = -0.35 * sScale;

    const minClearanceX = Math.max(
      Math.abs(shX) + 2.4 * sScale,
      Math.max(waistHalfW, abdomenHalfW, hipHalfW) + wristR3 + 2.8 * sScale
    );
    const elbX = sgn * lerp(Math.abs(shX), minClearanceX, 0.58);
    const elbY = shY - upperArmLen * 0.985;
    const elbZ = -1.1 * sScale;

    const wrX = sgn * minClearanceX;
    const wrY = elbY - forearmLen * 0.975;
    const wrZ = 3.6 * sScale; // Relaxed natural slight forward forearm bend

    const bicX = lerp(shX, elbX, 0.5);
    const bicY = lerp(shY, elbY, 0.5);
    const bicZ = lerp(shZ, elbZ, 0.5) + 0.35 * sScale;

    const foreX = lerp(elbX, wrX, 0.45);
    const foreY = lerp(elbY, wrY, 0.45);
    const foreZ = lerp(elbZ, wrZ, 0.45) + 0.3 * sScale;

    const palmX = wrX - sgn * 0.45 * sScale;
    const palmY = wrY - palmLen * 0.58;
    const palmZ = wrZ + 1.15 * sScale;

    const shoulder = project3D(shX, shY, shZ);
    const bicep = project3D(bicX, bicY, bicZ);
    const elbow = project3D(elbX, elbY, elbZ);
    const forearm = project3D(foreX, foreY, foreZ);
    const wrist = project3D(wrX, wrY, wrZ);
    const palmCenter = project3D(palmX, palmY, palmZ);

    // Thumb sits anteriorly (+z3) and slightly inward; 4 fingers fan gently along z3
    const thumbTip = project3D(
      palmX - sgn * (handWidth3 * 0.38),
      wrY - palmLen * 0.88,
      palmZ + handWidth3 * 0.78
    );

    const fingerConfigs = [
      { zOff: 0.44, lenMul: 0.93, inOff: 0.22 }, // Index
      { zOff: 0.14, lenMul: 1.0, inOff: 0.28 },  // Middle
      { zOff: -0.16, lenMul: 0.94, inOff: 0.25 }, // Ring
      { zOff: -0.44, lenMul: 0.78, inOff: 0.18 }, // Pinky
    ];
    const fingerTips = fingerConfigs.map((fc) =>
      project3D(
        palmX - sgn * (fc.inOff * handWidth3),
        wrY - palmLen * 0.92 - fingerLen * fc.lenMul,
        palmZ + fc.zOff * handWidth3 * 1.15
      )
    );

    const radiiPx = {
      shoulder: shoulderR3 * scale,
      upperArm: upperArmR3 * scale,
      elbow: elbowR3 * scale,
      forearm: forearmR3 * scale,
      wrist: wristR3 * scale,
      handWidth: handWidth3 * scale,
      fingerThickness: fingerThick3 * scale,
    };

    const joints2D = [shoulder, bicep, elbow, forearm, wrist];
    const jointRadii = [
      radiiPx.shoulder,
      radiiPx.upperArm,
      radiiPx.elbow,
      radiiPx.forearm,
      radiiPx.wrist,
    ];
    const { outerContour, innerContour } = computeTubeContours2D(
      joints2D,
      jointRadii,
      centerX,
      sgn * cosYaw
    );

    const depthZ = cameraDepth3D(elbX, elbY, (elbZ + wrZ) * 0.5);

    return {
      side,
      shoulder,
      bicep,
      elbow,
      forearm,
      wrist,
      palmCenter,
      fingerTips,
      thumbTip,
      outerContour,
      innerContour,
      radii: radiiPx,
      depthZ,
    };
  };

  const leftArm = buildArm('left');
  const rightArm = buildArm('right');

  // Articulated Lower Limbs & Barefoot Feet (Left = +x3, Right = -x3)
  const kneeR3 = 5.25 * coupled.kneeRadius * sScale;
  const calfR3 = 5.75 * coupled.calfRadius * sScale;
  const ankleR3 = 3.68 * coupled.ankleRadius * sScale;
  const footWidth3 = 4.95 * coupled.footWidth * sScale;
  const instepHeight3 = 4.65 * coupled.instepHeight * sScale;
  const footLength3 = 24.8 * coupled.footLength;

  const hipJointHalfX = Math.max(8.6 * sScale, hipHalfW * 0.52);
  const ankleHalfX = Math.max(
    8.5 * sScale,
    hipJointHalfX * 0.9 + Math.max(0, thighR3 - 7.8 * sScale) * 0.52
  );
  const sagittalThighBoost = 1 + 0.16 * Math.abs(sinYaw) * (0.7 + 0.5 * coupled.gluteProjection);

  const buildLeg = (side: 'left' | 'right'): IsoLegChain => {
    const sgn = side === 'left' ? 1 : -1;
    const hX = sgn * hipJointHalfX;
    const mtX = sgn * lerp(hipJointHalfX, ankleHalfX, 0.34);
    const knX = sgn * lerp(hipJointHalfX, ankleHalfX, 0.68);
    const cfX = sgn * (lerp(hipJointHalfX, ankleHalfX, 0.85) + 0.35 * coupled.calfRadius * sScale);
    const akX = sgn * ankleHalfX;

    const hZ = -1.15 * sScale;
    const mtZ = 0.25 * sScale;
    const knZ = 0.35 * sScale;
    const cfZ = -0.85 * coupled.calfRadius * sScale; // Posterior gastrocnemius curve
    const akZ = -0.35 * sScale;

    const hip = project3D(hX, hipY, hZ);
    const midThigh = project3D(mtX, midThighY, mtZ);
    const knee = project3D(knX, kneeY, knZ);
    const calf = project3D(cfX, calfY, cfZ);
    const ankle = project3D(akX, ankleY, akZ);

    // Foot angled slightly outward (~9 deg natural turnout)
    const footTurnRad = sgn * ((9 * Math.PI) / 180);
    const fFwdX = Math.sin(footTurnRad);
    const fFwdZ = Math.cos(footTurnRad);
    const fLatX = sgn * Math.cos(footTurnRad);
    const fLatZ = -sgn * Math.sin(footTurnRad);

    const heelBackDist = footLength3 * 0.22;
    const instepFwdDist = footLength3 * 0.28;
    const ballFwdDist = footLength3 * 0.56;
    const toeFwdDist = footLength3 * 0.78;

    const heel3: Point3D = {
      x: akX - fFwdX * heelBackDist,
      y: 0.6 * sScale,
      z: akZ - fFwdZ * heelBackDist,
    };
    const instep3: Point3D = {
      x: akX + fFwdX * instepFwdDist,
      y: instepHeight3,
      z: akZ + fFwdZ * instepFwdDist,
    };
    const ball3: Point3D = {
      x: akX + fFwdX * ballFwdDist,
      y: 1.15 * sScale,
      z: akZ + fFwdZ * ballFwdDist,
    };

    const heel = project3D(heel3.x, heel3.y, heel3.z);
    const instep = project3D(instep3.x, instep3.y, instep3.z);
    const ballOfFoot = project3D(ball3.x, ball3.y, ball3.z);

    // 5 Anatomical toes from medial hallux (inner, -fLat) to lateral 5th toe (outer, +fLat)
    const toeSpecs = [
      { lat: -0.38, fwd: 1.0, y: 1.15 },  // Hallux (big toe)
      { lat: -0.16, fwd: 1.02, y: 1.02 }, // 2nd toe
      { lat: 0.05, fwd: 0.96, y: 0.95 },  // 3rd toe
      { lat: 0.25, fwd: 0.89, y: 0.88 },  // 4th toe
      { lat: 0.44, fwd: 0.8, y: 0.8 },    // 5th little toe
    ];
    const toeTips = toeSpecs.map((ts) =>
      project3D(
        akX + fFwdX * (toeFwdDist * ts.fwd) + fLatX * (footWidth3 * ts.lat),
        ts.y * sScale,
        akZ + fFwdZ * (toeFwdDist * ts.fwd) + fLatZ * (footWidth3 * ts.lat)
      )
    );

    // Plantar sole polygon (y3 = 0)
    const sole3D: Point3D[] = [
      { x: heel3.x - fLatX * footWidth3 * 0.34, y: 0, z: heel3.z - fLatZ * footWidth3 * 0.34 },
      { x: akX + fFwdX * (ballFwdDist * 0.45) - fLatX * footWidth3 * 0.36, y: 0, z: akZ + fFwdZ * (ballFwdDist * 0.45) - fLatZ * footWidth3 * 0.36 },
      { x: ball3.x - fLatX * footWidth3 * 0.48, y: 0, z: ball3.z - fLatZ * footWidth3 * 0.48 },
      { x: akX + fFwdX * (toeFwdDist * 1.01) - fLatX * footWidth3 * 0.36, y: 0, z: akZ + fFwdZ * (toeFwdDist * 1.01) - fLatZ * footWidth3 * 0.36 },
      { x: akX + fFwdX * (toeFwdDist * 1.02), y: 0, z: akZ + fFwdZ * (toeFwdDist * 1.02) },
      { x: akX + fFwdX * (toeFwdDist * 0.82) + fLatX * footWidth3 * 0.48, y: 0, z: akZ + fFwdZ * (toeFwdDist * 0.82) + fLatZ * footWidth3 * 0.48 },
      { x: ball3.x + fLatX * footWidth3 * 0.52, y: 0, z: ball3.z + fLatZ * footWidth3 * 0.52 },
      { x: heel3.x + fLatX * footWidth3 * 0.36, y: 0, z: heel3.z + fLatZ * footWidth3 * 0.36 },
    ];
    const footSolePolygon = sole3D.map((pt) => project3D(pt.x, pt.y, pt.z));

    const radiiPx = {
      thigh: thighR3 * scale,
      knee: kneeR3 * scale,
      calf: calfR3 * scale,
      ankle: ankleR3 * scale,
      footWidth: footWidth3 * scale,
      instepHeight: instepHeight3 * scale,
    };

    const joints2D = [hip, midThigh, knee, calf, ankle];
    const jointRadii = [
      radiiPx.thigh * 1.03 * sagittalThighBoost,
      radiiPx.thigh * 0.92 * lerp(1, sagittalThighBoost, 0.55),
      radiiPx.knee,
      radiiPx.calf,
      radiiPx.ankle,
    ];
    const { outerContour, innerContour } = computeTubeContours2D(
      joints2D,
      jointRadii,
      centerX,
      sgn * cosYaw
    );

    const ankleOuter = outerContour[outerContour.length - 1];
    const ankleInner = innerContour[innerContour.length - 1];
    const ankleLeftPt = ankleInner.x <= ankleOuter.x ? ankleInner : ankleOuter;
    const ankleRightPt = ankleInner.x <= ankleOuter.x ? ankleOuter : ankleInner;
    const fwdDx = ballOfFoot.x - ankle.x;

    let footDorsalPolygon: Point2D[];
    if (fwdDx > 2.2 * scale) {
      const sideToes = [toeTips[0], toeTips[2], toeTips[4]].sort((a, b) => b.y - a.y);
      footDorsalPolygon = [
        ankleLeftPt,
        heel,
        lerpPoint(heel, ballOfFoot, 0.56),
        ...sideToes,
        instep,
        ankleRightPt,
      ];
    } else if (fwdDx < -2.2 * scale) {
      const sideToes = [toeTips[0], toeTips[2], toeTips[4]].sort((a, b) => b.y - a.y);
      footDorsalPolygon = [
        ankleRightPt,
        heel,
        lerpPoint(heel, ballOfFoot, 0.56),
        ...sideToes,
        instep,
        ankleLeftPt,
      ];
    } else if (!facingBack) {
      const sortedToes = [...toeTips].sort((a, b) => a.x - b.x);
      footDorsalPolygon = [
        ankleLeftPt,
        lerpPoint(ankleLeftPt, sortedToes[0], 0.55),
        ...sortedToes,
        lerpPoint(sortedToes[sortedToes.length - 1], ankleRightPt, 0.45),
        ankleRightPt,
      ];
    } else {
      const heelL = footSolePolygon[0].x <= footSolePolygon[7].x ? footSolePolygon[0] : footSolePolygon[7];
      const heelR = footSolePolygon[0].x <= footSolePolygon[7].x ? footSolePolygon[7] : footSolePolygon[0];
      footDorsalPolygon = [
        ankleLeftPt,
        heelL,
        { x: heel.x, y: Math.max(heel.y, heelL.y, heelR.y) + 1.2 * scale },
        heelR,
        ankleRightPt,
      ];
    }

    const depthZ = cameraDepth3D(knX, kneeY, (knZ + akZ) * 0.5);

    return {
      side,
      hip,
      midThigh,
      knee,
      calf,
      ankle,
      heel,
      instep,
      ballOfFoot,
      toeTips,
      outerContour,
      innerContour,
      footSolePolygon,
      footDorsalPolygon,
      radii: radiiPx,
      depthZ,
    };
  };

  const leftLeg = buildLeg('left');
  const rightLeg = buildLeg('right');

  const farArmSide: 'left' | 'right' = leftArm.depthZ <= rightArm.depthZ ? 'left' : 'right';
  const nearArmSide: 'left' | 'right' = farArmSide === 'left' ? 'right' : 'left';
  const farLegSide: 'left' | 'right' = leftLeg.depthZ <= rightLeg.depthZ ? 'left' : 'right';
  const nearLegSide: 'left' | 'right' = farLegSide === 'left' ? 'right' : 'left';

  return {
    spec,
    theme,
    width,
    height,
    compact,
    centerX,
    floorY,
    angleDeg,
    yawRad,
    elevRad,
    scale,
    facingFront,
    facingBack,
    sideSign,
    coupled,
    skinShading,
    headCenter,
    headCrown,
    chinPoint,
    jawLeft,
    jawRight,
    submentalPoint,
    neckTopRing,
    neckBaseRing,
    clavicleRing,
    chestRing,
    bustApexLeft,
    bustApexRight,
    underbustRing,
    waistRing,
    abdomenApex,
    pelvisRing,
    hipRing,
    gluteApex,
    crotchPoint,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    torsoLeftContour,
    torsoRightContour,
    torsoPolygon,
    farArmSide,
    nearArmSide,
    farLegSide,
    nearLegSide,
    cranial,
    project3D,
    cameraDepth3D,
  };
}

// ============================================================================
// Studio Floor Tile Plinth Renderer
// ============================================================================

/**
 * Renders the angled isometric diamond studio floor tile plinth with architectural grid lines,
 * beveled 3D thickness, and soft contact ambient-occlusion shadows beneath each foot.
 * Light mode stays luminous (`#FFFFFF` / `#F4F5F7` / `rgba(29,29,31,0.08)`, brightness > 225).
 */
export function drawIsometricStudioPlinth(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  theme: 'light' | 'dark' = frame.theme
): void {
  ctx.save();

  const isDark = theme === 'dark';
  const sScale = 0.4 + 0.6 * frame.coupled.heightScale;
  const tileHalfCm = Math.max(33, 35 * sScale + Math.max(0, frame.coupled.bmiSoftIndex) * 5);
  const bevelThickCm = 2.6;

  // Keep canonical isometric diamond angle smoothly aligned while subtly responding to turntable rotation
  const cosY = Math.cos(frame.yawRad);
  const sinY = Math.sin(frame.yawRad);
  const nearCardinal = Math.abs(Math.sin(frame.yawRad * 2)) < 0.25;
  // Blend a 45deg diamond orientation when at 0/90/180/-90 so plinth always reads as an angled isometric diamond
  const tileRot = nearCardinal ? frame.yawRad + Math.PI * 0.25 : frame.yawRad;
  const cT = Math.cos(tileRot);
  const sT = Math.sin(tileRot);

  const projectTile = (tx: number, ty: number, tz: number): Point2D => {
    const xCam = tx * cT + tz * sT;
    const zCam = -tx * sT + tz * cT;
    return {
      x: frame.centerX + xCam * frame.scale,
      y:
        frame.floorY -
        ty * Math.cos(frame.elevRad) * frame.scale +
        zCam * Math.sin(frame.elevRad) * frame.scale,
    };
  };
  void cosY;
  void sinY;

  const topCorners = [
    projectTile(-tileHalfCm, 0, -tileHalfCm),
    projectTile(tileHalfCm, 0, -tileHalfCm),
    projectTile(tileHalfCm, 0, tileHalfCm),
    projectTile(-tileHalfCm, 0, tileHalfCm),
  ];
  const botCorners = [
    projectTile(-tileHalfCm, -bevelThickCm, -tileHalfCm),
    projectTile(tileHalfCm, -bevelThickCm, -tileHalfCm),
    projectTile(tileHalfCm, -bevelThickCm, tileHalfCm),
    projectTile(-tileHalfCm, -bevelThickCm, tileHalfCm),
  ];

  // 1. Soft ambient drop shadow beneath the tile plinth
  const plinthCenter = projectTile(0, -bevelThickCm * 1.1, 0);
  const dropRx = tileHalfCm * 1.38 * frame.scale;
  const dropRy = dropRx * Math.sin(frame.elevRad) * 1.08;
  ctx.save();
  ctx.translate(plinthCenter.x, plinthCenter.y + 3 * frame.scale);
  ctx.scale(1, dropRy / Math.max(1, dropRx));
  const dropGrad = ctx.createRadialGradient(0, 0, dropRx * 0.15, 0, 0, dropRx);
  if (isDark) {
    dropGrad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    dropGrad.addColorStop(0.68, 'rgba(0, 0, 0, 0.16)');
    dropGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    dropGrad.addColorStop(0, 'rgba(29, 29, 31, 0.065)');
    dropGrad.addColorStop(0.7, 'rgba(29, 29, 31, 0.024)');
    dropGrad.addColorStop(1, 'rgba(29, 29, 31, 0)');
  }
  ctx.fillStyle = dropGrad;
  ctx.beginPath();
  ctx.arc(0, 0, dropRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Visible front-facing beveled edges of the tile slab
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const edgeMidY = (topCorners[i].y + topCorners[j].y) * 0.5;
    if (edgeMidY >= frame.floorY - 0.5) {
      ctx.beginPath();
      ctx.moveTo(topCorners[i].x, topCorners[i].y);
      ctx.lineTo(topCorners[j].x, topCorners[j].y);
      ctx.lineTo(botCorners[j].x, botCorners[j].y);
      ctx.lineTo(botCorners[i].x, botCorners[i].y);
      ctx.closePath();

      const isRightSide = (topCorners[i].x + topCorners[j].x) * 0.5 >= frame.centerX;
      if (isDark) {
        ctx.fillStyle = isRightSide ? '#1B1C20' : '#202227';
      } else {
        ctx.fillStyle = isRightSide ? '#E5E8EE' : '#ECEEF2';
      }
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(29,29,31,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 3. Top isometric diamond studio tile surface
  ctx.beginPath();
  ctx.moveTo(topCorners[0].x, topCorners[0].y);
  ctx.lineTo(topCorners[1].x, topCorners[1].y);
  ctx.lineTo(topCorners[2].x, topCorners[2].y);
  ctx.lineTo(topCorners[3].x, topCorners[3].y);
  ctx.closePath();

  const topGrad = ctx.createLinearGradient(
    frame.centerX - tileHalfCm * frame.scale,
    frame.floorY - tileHalfCm * 0.35 * frame.scale,
    frame.centerX + tileHalfCm * frame.scale,
    frame.floorY + tileHalfCm * 0.35 * frame.scale
  );
  if (isDark) {
    topGrad.addColorStop(0, '#2E3036');
    topGrad.addColorStop(0.55, '#27292E');
    topGrad.addColorStop(1, '#242529');
  } else {
    topGrad.addColorStop(0, '#FFFFFF');
    topGrad.addColorStop(0.55, '#F8F9FB');
    topGrad.addColorStop(1, '#F4F5F7');
  }
  ctx.fillStyle = topGrad;
  ctx.fill();

  // 4. Thin architectural 4x4 grid lines + subtle turntable compass ring clipped to top face
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(29, 29, 31, 0.065)';
  ctx.lineWidth = Math.max(0.75, 0.42 * frame.scale);

  const divisions = 4;
  for (let k = 1; k < divisions; k++) {
    const t = -tileHalfCm + (tileHalfCm * 2 * k) / divisions;
    const gx0 = projectTile(t, 0, -tileHalfCm);
    const gx1 = projectTile(t, 0, tileHalfCm);
    ctx.beginPath();
    ctx.moveTo(gx0.x, gx0.y);
    ctx.lineTo(gx1.x, gx1.y);
    ctx.stroke();

    const gz0 = projectTile(-tileHalfCm, 0, t);
    const gz1 = projectTile(tileHalfCm, 0, t);
    ctx.beginPath();
    ctx.moveTo(gz0.x, gz0.y);
    ctx.lineTo(gz1.x, gz1.y);
    ctx.stroke();
  }

  // Subtle turntable inner architectural circle
  const ringRadX = tileHalfCm * 0.72 * frame.scale;
  const ringRadY = ringRadX * Math.sin(frame.elevRad);
  ctx.beginPath();
  ctx.ellipse(frame.centerX, frame.floorY, ringRadX, ringRadY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(29, 29, 31, 0.07)';
  ctx.stroke();

  // 5. Soft contact ambient-occlusion shadows directly beneath each foot sole
  const drawFootContactAO = (solePts: readonly Point2D[]) => {
    if (solePts.length < 3) return;
    let cx = 0;
    let cy = 0;
    let maxDist = 4;
    for (const p of solePts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= solePts.length;
    cy /= solePts.length;
    for (const p of solePts) {
      maxDist = Math.max(maxDist, Math.hypot(p.x - cx, p.y - cy));
    }

    // Broad soft AO halo
    ctx.save();
    ctx.translate(cx, cy + 1.2 * frame.scale);
    ctx.scale(1.22, 0.62);
    const aoHalo = ctx.createRadialGradient(0, 0, maxDist * 0.15, 0, 0, maxDist * 1.3);
    if (isDark) {
      aoHalo.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
      aoHalo.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
      aoHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      aoHalo.addColorStop(0, 'rgba(29, 29, 31, 0.16)');
      aoHalo.addColorStop(0.55, 'rgba(29, 29, 31, 0.065)');
      aoHalo.addColorStop(1, 'rgba(29, 29, 31, 0)');
    }
    ctx.fillStyle = aoHalo;
    ctx.beginPath();
    ctx.arc(0, 0, maxDist * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Crisp tight contact shadow right under plantar sole
    traceSmoothClosedPolygon(ctx, solePts);
    ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(29, 29, 31, 0.13)';
    ctx.fill();
  };

  drawFootContactAO(frame.leftLeg.footSolePolygon);
  drawFootContactAO(frame.rightLeg.footSolePolygon);

  ctx.restore();

  // 6. Crisp architectural rim hairline on top tile perimeter
  ctx.beginPath();
  ctx.moveTo(topCorners[0].x, topCorners[0].y);
  ctx.lineTo(topCorners[1].x, topCorners[1].y);
  ctx.lineTo(topCorners[2].x, topCorners[2].y);
  ctx.lineTo(topCorners[3].x, topCorners[3].y);
  ctx.closePath();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(29, 29, 31, 0.08)';
  ctx.lineWidth = Math.max(1, 0.5 * frame.scale);
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// Articulated Limbs, Bare Hands/Fingers & Barefoot Insteps/Toes Renderer
// ============================================================================

function getSkinSpecularAlpha(palette: AdaptiveMstShadingPalette): number {
  if (palette.mstLevel >= 8) {
    return 0.36 + (palette.mstLevel - 7) * 0.09;
  }
  if (palette.mstLevel >= 6) {
    return 0.24 + (palette.mstLevel - 5) * 0.05;
  }
  if (palette.mstLevel <= 3) {
    return 0.16;
  }
  return 0.21;
}

function getSkinRimAlpha(palette: AdaptiveMstShadingPalette, theme: 'light' | 'dark'): number {
  if (palette.mstLevel >= 8) {
    return theme === 'dark' ? 0.62 : 0.48;
  }
  if (palette.mstLevel <= 3) {
    return theme === 'dark' ? 0.36 : 0.26;
  }
  return theme === 'dark' ? 0.46 : 0.34;
}

function drawCapsuleDigit(
  ctx: CanvasRenderingContext2D,
  p0: Point2D,
  p1: Point2D,
  r0: number,
  r1: number,
  fill: string | CanvasGradient,
  stroke: string,
  lineWidth: number
): void {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = -dy / len;
  const ny = dx / len;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(p0.x + nx * r0, p0.y + ny * r0);
  ctx.lineTo(p1.x + nx * r1, p1.y + ny * r1);
  ctx.arc(p1.x, p1.y, r1, angle + Math.PI * 0.5, angle - Math.PI * 0.5, true);
  ctx.lineTo(p0.x - nx * r0, p0.y - ny * r0);
  ctx.arc(p0.x, p0.y, r0, angle - Math.PI * 0.5, angle + Math.PI * 0.5, true);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawArticulatedHand(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  arm: IsoArmChain,
  isFarLimb: boolean
): void {
  const { skinShading, scale } = frame;
  const outerWrist = arm.outerContour[arm.outerContour.length - 1];
  const innerWrist = arm.innerContour[arm.innerContour.length - 1];
  const fingerR = Math.max(1.15, arm.radii.fingerThickness * 0.92);
  const handW = arm.radii.handWidth;
  const contourW = clamp(scale * 0.48, 0.85, 1.45);
  const digitLineW = clamp(scale * 0.38, 0.7, 1.15);

  const wristMid = arm.wrist;
  const palm = arm.palmCenter;
  const handDirX = palm.x - wristMid.x;
  const handDirY = Math.max(1, palm.y - wristMid.y);
  const handLen = Math.hypot(handDirX, handDirY);
  const hnx = -handDirY / handLen;
  const hny = handDirX / handLen;

  // Dorsal/palmar hand pad polygon
  const outerKnuckle: Point2D = {
    x: palm.x + (outerWrist.x - wristMid.x) * 1.12,
    y: palm.y + handLen * 0.42,
  };
  const innerKnuckle: Point2D = {
    x: palm.x + (innerWrist.x - wristMid.x) * 1.08,
    y: palm.y + handLen * 0.36,
  };

  // 1. Draw 4 articulated fingers (back-to-front order so overlapping fingers read cleanly)
  const fingerOrder = frame.facingBack ? [0, 1, 2, 3] : [3, 2, 1, 0];
  for (const idx of fingerOrder) {
    const tip = arm.fingerTips[idx];
    if (!tip) continue;
    const tAcross = idx / 3;
    const knuckleBase = lerpPoint(innerKnuckle, outerKnuckle, tAcross);
    const fGrad = ctx.createLinearGradient(
      knuckleBase.x - fingerR,
      knuckleBase.y,
      tip.x + fingerR,
      tip.y
    );
    fGrad.addColorStop(0, isFarLimb ? skinShading.midShadow : skinShading.base);
    fGrad.addColorStop(0.65, isFarLimb ? skinShading.midShadow : skinShading.subsurface);
    fGrad.addColorStop(1, skinShading.palmSoleTint);

    drawCapsuleDigit(
      ctx,
      knuckleBase,
      tip,
      fingerR * 1.06,
      fingerR * 0.82,
      fGrad,
      skinShading.contourInk,
      digitLineW
    );

    // Translucent keratin fingernail highlight
    const nailR = Math.max(0.75, fingerR * 0.56);
    ctx.beginPath();
    ctx.arc(
      lerp(knuckleBase.x, tip.x, 0.86),
      lerp(knuckleBase.y, tip.y, 0.86),
      nailR,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = hexWithAlpha(skinShading.nailBed, isFarLimb ? 0.55 : 0.82);
    ctx.fill();
  }

  // 2. Sculpted metacarpal dorsal hand pad (plumpness coupled to handWidth & extremityPlumpness)
  ctx.beginPath();
  ctx.moveTo(outerWrist.x, outerWrist.y);
  ctx.quadraticCurveTo(
    lerp(outerWrist.x, outerKnuckle.x, 0.55) + hnx * handW * 0.14,
    lerp(outerWrist.y, outerKnuckle.y, 0.55) + hny * handW * 0.14,
    outerKnuckle.x,
    outerKnuckle.y
  );
  ctx.quadraticCurveTo(
    palm.x,
    Math.max(outerKnuckle.y, innerKnuckle.y) + fingerR * 0.55,
    innerKnuckle.x,
    innerKnuckle.y
  );
  ctx.quadraticCurveTo(
    lerp(innerKnuckle.x, innerWrist.x, 0.5) - hnx * handW * 0.12,
    lerp(innerKnuckle.y, innerWrist.y, 0.5) - hny * handW * 0.12,
    innerWrist.x,
    innerWrist.y
  );
  ctx.closePath();

  const handGrad = ctx.createLinearGradient(
    outerWrist.x,
    wristMid.y,
    innerKnuckle.x,
    outerKnuckle.y
  );
  if (isFarLimb) {
    handGrad.addColorStop(0, skinShading.base);
    handGrad.addColorStop(0.6, skinShading.midShadow);
    handGrad.addColorStop(1, skinShading.deepShadow);
  } else {
    handGrad.addColorStop(0, skinShading.highlight);
    handGrad.addColorStop(0.5, skinShading.base);
    handGrad.addColorStop(0.85, skinShading.subsurface);
    handGrad.addColorStop(1, skinShading.midShadow);
  }
  ctx.fillStyle = handGrad;
  ctx.fill();

  // Dorsal hand specular sheen (vital for MST 8-10 warm bronze/mahogany hand definition)
  if (!isFarLimb) {
    const specAlpha = getSkinSpecularAlpha(skinShading) * 0.85;
    ctx.beginPath();
    ctx.ellipse(
      palm.x,
      palm.y,
      Math.max(1.5, handW * 0.36),
      Math.max(2, handLen * 0.42),
      Math.atan2(handDirY, handDirX) - Math.PI * 0.5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = hexWithAlpha(skinShading.specularHighlight, specAlpha);
    ctx.fill();
  }

  // Stroke outer & knuckle hand boundary while leaving proximal wrist seam open
  ctx.beginPath();
  ctx.moveTo(outerWrist.x, outerWrist.y);
  ctx.quadraticCurveTo(
    lerp(outerWrist.x, outerKnuckle.x, 0.55) + hnx * handW * 0.14,
    lerp(outerWrist.y, outerKnuckle.y, 0.55) + hny * handW * 0.14,
    outerKnuckle.x,
    outerKnuckle.y
  );
  ctx.moveTo(innerKnuckle.x, innerKnuckle.y);
  ctx.quadraticCurveTo(
    lerp(innerKnuckle.x, innerWrist.x, 0.5) - hnx * handW * 0.12,
    lerp(innerKnuckle.y, innerWrist.y, 0.5) - hny * handW * 0.12,
    innerWrist.x,
    innerWrist.y
  );
  ctx.strokeStyle = skinShading.contourInk;
  ctx.lineWidth = contourW;
  ctx.stroke();

  // 3. Articulated thumb + thenar eminence
  const thumbBase = lerpPoint(innerWrist, innerKnuckle, 0.55);
  drawCapsuleDigit(
    ctx,
    thumbBase,
    arm.thumbTip,
    fingerR * 1.24,
    fingerR * 0.92,
    isFarLimb ? skinShading.midShadow : skinShading.highlight,
    skinShading.contourInk,
    digitLineW
  );
  ctx.beginPath();
  ctx.arc(
    lerp(thumbBase.x, arm.thumbTip.x, 0.82),
    lerp(thumbBase.y, arm.thumbTip.y, 0.82),
    Math.max(0.75, fingerR * 0.58),
    0,
    Math.PI * 2
  );
  ctx.fillStyle = hexWithAlpha(skinShading.nailBed, isFarLimb ? 0.5 : 0.8);
  ctx.fill();
}

function drawBarefootAndToes(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  leg: IsoLegChain,
  isFarLimb: boolean
): void {
  const { skinShading, scale, facingBack } = frame;
  const ankleOuter = leg.outerContour[leg.outerContour.length - 1];
  const contourW = clamp(scale * 0.54, 0.95, 1.65);
  const detailW = clamp(scale * 0.38, 0.7, 1.15);

  // 1. Plantar sole cushion rim (lower melanin tint on medium-to-deep MST tones)
  if (leg.footSolePolygon.length >= 4) {
    traceSmoothClosedPolygon(ctx, leg.footSolePolygon);
    ctx.fillStyle = mixHexColors(skinShading.palmSoleTint, skinShading.midShadow, 0.25);
    ctx.fill();
  }

  // 2. Sculpted dorsal foot arch, heel calcaneus & forefoot volume
  const footPoly: Point2D[] = leg.footDorsalPolygon;

  ctx.beginPath();
  traceSmoothOpenPolyline(ctx, footPoly, true);
  ctx.closePath();

  const footGrad = ctx.createLinearGradient(
    leg.instep.x - leg.radii.footWidth,
    leg.ankle.y,
    leg.heel.x + leg.radii.footWidth,
    Math.max(leg.ballOfFoot.y, leg.heel.y) + 4
  );
  if (isFarLimb) {
    footGrad.addColorStop(0, skinShading.base);
    footGrad.addColorStop(0.6, skinShading.midShadow);
    footGrad.addColorStop(1, skinShading.deepShadow);
  } else {
    footGrad.addColorStop(0, skinShading.highlight);
    footGrad.addColorStop(0.5, skinShading.base);
    footGrad.addColorStop(0.82, skinShading.subsurface);
    footGrad.addColorStop(1, skinShading.midShadow);
  }
  ctx.fillStyle = footGrad;
  ctx.fill();

  // Dorsal instep specular highlight (prominent on plump insteps & rich MST 8-10 skin)
  if (!facingBack) {
    const specAlpha = getSkinSpecularAlpha(skinShading);
    const instepGrad = ctx.createRadialGradient(
      leg.instep.x,
      leg.instep.y,
      0.5,
      leg.instep.x,
      leg.instep.y,
      Math.max(3, leg.radii.footWidth * 0.95)
    );
    instepGrad.addColorStop(0, hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.72));
    instepGrad.addColorStop(1, hexWithAlpha(skinShading.specularHighlight, 0));
    ctx.fillStyle = instepGrad;
    ctx.fill();
  }

  // Foot outer contour stroke (open at proximal ankle so leg & foot merge without a seam)
  ctx.beginPath();
  traceSmoothOpenPolyline(ctx, footPoly, true);
  ctx.strokeStyle = skinShading.contourInk;
  ctx.lineWidth = contourW;
  ctx.stroke();

  // 3. Five individual proportional toes + toenail keratin plates when forefoot is visible
  if (!facingBack && leg.toeTips.length === 5) {
    const baseToeR = Math.max(1.2, leg.radii.footWidth * 0.19);
    const toeRadiiScale = [1.26, 0.96, 0.9, 0.84, 0.76];

    for (let i = 4; i >= 0; i--) {
      const tip = leg.toeTips[i];
      const basePt = lerpPoint(leg.instep, tip, 0.62);
      const rToe = baseToeR * toeRadiiScale[i];

      drawCapsuleDigit(
        ctx,
        basePt,
        tip,
        rToe * 1.04,
        rToe * 0.88,
        isFarLimb ? skinShading.midShadow : i === 0 ? skinShading.highlight : skinShading.base,
        skinShading.contourInk,
        detailW
      );

      // Toenail plate
      const nailCenter = lerpPoint(basePt, tip, 0.78);
      ctx.beginPath();
      ctx.ellipse(
        nailCenter.x,
        nailCenter.y,
        Math.max(0.8, rToe * 0.64),
        Math.max(0.65, rToe * 0.5),
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = hexWithAlpha(skinShading.nailBed, isFarLimb ? 0.58 : 0.86);
      ctx.fill();
    }
  } else if (facingBack) {
    // Posterior Achilles tendon & calcaneus heel definition on back views
    ctx.beginPath();
    ctx.moveTo(leg.ankle.x, leg.ankle.y - leg.radii.ankle * 0.6);
    ctx.quadraticCurveTo(
      lerp(leg.ankle.x, leg.heel.x, 0.5),
      lerp(leg.ankle.y, leg.heel.y, 0.5),
      leg.heel.x,
      leg.heel.y - 1.5 * scale
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.45);
    ctx.lineWidth = Math.max(1.2, leg.radii.ankle * 0.32);
    ctx.stroke();
  }

  // Lateral/medial malleolus subtle ankle highlight
  ctx.beginPath();
  ctx.arc(
    lerp(leg.ankle.x, ankleOuter.x, 0.55),
    leg.ankle.y,
    Math.max(1.2, leg.radii.ankle * 0.34),
    0,
    Math.PI * 2
  );
  ctx.fillStyle = hexWithAlpha(skinShading.specularHighlight, getSkinSpecularAlpha(skinShading) * 0.45);
  ctx.fill();
}

/**
 * Renders an articulated arm or leg segment (with optional `[startT, endT]` sleeve/pant clipping
 * and extremity toggles) so Phase 2 garments can interleave cleanly in 8-direction Z-order.
 */
export function drawIsometricLimbSegment(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  limbType: IsoLimbType,
  side: IsoLimbSide,
  clipOptions?: IsoLimbClipOptions
): void {
  const isArmKind =
    limbType === 'arm' ||
    limbType === 'upper_arm' ||
    limbType === 'forearm' ||
    limbType === 'hand';

  let defaultStartT = 0;
  let defaultEndT = 1;
  let defaultExtremity = true;

  if (limbType === 'upper_arm' || limbType === 'thigh') {
    defaultStartT = 0;
    defaultEndT = 0.5;
    defaultExtremity = false;
  } else if (limbType === 'forearm' || limbType === 'lower_leg') {
    defaultStartT = 0.5;
    defaultEndT = 1;
    defaultExtremity = true;
  } else if (limbType === 'hand' || limbType === 'foot') {
    defaultStartT = 0.96;
    defaultEndT = 1;
    defaultExtremity = true;
  }

  const startT = clamp(clipOptions?.startT ?? defaultStartT, 0, 1);
  const endT = clamp(clipOptions?.endT ?? defaultEndT, 0, 1);
  const includeExtremity =
    (clipOptions?.includeExtremity ?? defaultExtremity) &&
    !(isArmKind ? clipOptions?.hideHand : clipOptions?.hideFoot);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (clipOptions?.minY !== undefined || clipOptions?.maxY !== undefined) {
    const minY = clipOptions.minY ?? -1000;
    const maxY = clipOptions.maxY ?? frame.height + 1000;
    ctx.beginPath();
    ctx.rect(0, minY, frame.width, Math.max(0, maxY - minY));
    ctx.clip();
  }

  const { skinShading, scale } = frame;
  const contourW = clamp(scale * 0.56, 1.0, 1.75);
  const rimAlpha = getSkinRimAlpha(skinShading, frame.theme);
  const specAlpha = getSkinSpecularAlpha(skinShading);

  if (isArmKind) {
    const arm = side === 'left' ? frame.leftArm : frame.rightArm;
    const isFarLimb = side === frame.farArmSide && Math.abs(Math.sin(frame.yawRad)) > 0.2;

    if (endT > startT + 0.01 && limbType !== 'hand') {
      const outerSlice = slicePolylineNormalized(arm.outerContour, startT, endT);
      const innerSlice = slicePolylineNormalized(arm.innerContour, startT, endT);

      if (outerSlice.length >= 2 && innerSlice.length >= 2) {
        const proxMid = lerpPoint(outerSlice[0], innerSlice[0], 0.5);
        const distMid = lerpPoint(
          outerSlice[outerSlice.length - 1],
          innerSlice[innerSlice.length - 1],
          0.5
        );

        ctx.beginPath();
        traceSmoothOpenPolyline(ctx, outerSlice, true);
        ctx.lineTo(innerSlice[innerSlice.length - 1].x, innerSlice[innerSlice.length - 1].y);
        traceSmoothOpenPolyline(ctx, [...innerSlice].reverse(), false);
        if (startT <= 0.04) {
          // Rounded deltoid shoulder cap blending smoothly into sloping trapezius
          ctx.quadraticCurveTo(
            proxMid.x,
            proxMid.y - arm.radii.shoulder * 0.86,
            outerSlice[0].x,
            outerSlice[0].y
          );
        }
        ctx.closePath();

        const armGrad = ctx.createLinearGradient(
          outerSlice[0].x,
          proxMid.y,
          innerSlice[Math.floor(innerSlice.length * 0.5)].x,
          distMid.y
        );
        if (isFarLimb) {
          armGrad.addColorStop(0, skinShading.base);
          armGrad.addColorStop(0.55, skinShading.midShadow);
          armGrad.addColorStop(1, skinShading.deepShadow);
        } else {
          armGrad.addColorStop(0, skinShading.highlight);
          armGrad.addColorStop(0.45, skinShading.base);
          armGrad.addColorStop(0.78, skinShading.subsurface);
          armGrad.addColorStop(1, skinShading.midShadow);
        }
        ctx.fillStyle = armGrad;
        ctx.fill();

        // Deltoid & forearm soft satin specular highlight ribbon
        if (!isFarLimb) {
          ctx.save();
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(lerp(arm.shoulder.x, outerSlice[0].x, 0.35), arm.shoulder.y);
          ctx.quadraticCurveTo(
            lerp(arm.elbow.x, arm.outerContour[2].x, 0.32),
            arm.elbow.y,
            lerp(arm.wrist.x, arm.outerContour[4].x, 0.3),
            arm.wrist.y
          );
          ctx.strokeStyle = hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.48);
          ctx.lineWidth = Math.max(2.2, arm.radii.forearm * 0.58);
          ctx.stroke();

          // Fresnel grazing rim light on outer contour
          ctx.beginPath();
          traceSmoothOpenPolyline(ctx, outerSlice, true);
          ctx.strokeStyle = hexWithAlpha(skinShading.rimLight, rimAlpha);
          ctx.lineWidth = Math.max(1.4, scale * 0.85);
          ctx.stroke();
          ctx.restore();
        }

        // Subtle elbow crease / soft-tissue fold
        if (startT <= 0.48 && endT >= 0.55) {
          const elbInner = arm.innerContour[2];
          ctx.beginPath();
          ctx.moveTo(lerp(arm.elbow.x, elbInner.x, 0.25), arm.elbow.y - 1.2 * scale);
          ctx.quadraticCurveTo(
            lerp(arm.elbow.x, elbInner.x, 0.65),
            arm.elbow.y + 0.8 * scale,
            elbInner.x,
            elbInner.y
          );
          ctx.strokeStyle = hexWithAlpha(
            skinShading.contourInk,
            0.22 + Math.max(0, frame.coupled.bmiSoftIndex) * 0.12
          );
          ctx.lineWidth = Math.max(0.8, scale * 0.38);
          ctx.stroke();
        }

        // Crisp editorial skin contour (skipping inner shoulder seam so deltoid merges cleanly into torso)
        ctx.beginPath();
        traceSmoothOpenPolyline(ctx, outerSlice, true);
        ctx.strokeStyle = skinShading.contourInk;
        ctx.lineWidth = contourW;
        ctx.stroke();

        const innerStrokePts = startT <= 0.05 ? innerSlice.slice(1) : innerSlice;
        if (innerStrokePts.length >= 2) {
          ctx.beginPath();
          traceSmoothOpenPolyline(ctx, innerStrokePts, true);
          ctx.strokeStyle = skinShading.contourInk;
          ctx.lineWidth = contourW;
          ctx.stroke();
        }
      }
    }

    if (includeExtremity && endT >= 0.94) {
      drawArticulatedHand(ctx, frame, arm, isFarLimb);
    }
  } else {
    const leg = side === 'left' ? frame.leftLeg : frame.rightLeg;
    const isFarLimb = side === frame.farLegSide && Math.abs(Math.sin(frame.yawRad)) > 0.2;

    if (endT > startT + 0.01 && limbType !== 'foot') {
      const outerSlice = slicePolylineNormalized(leg.outerContour, startT, endT);
      const innerSlice = slicePolylineNormalized(leg.innerContour, startT, endT);

      if (outerSlice.length >= 2 && innerSlice.length >= 2) {
        ctx.beginPath();
        traceSmoothOpenPolyline(ctx, outerSlice, true);
        ctx.lineTo(innerSlice[innerSlice.length - 1].x, innerSlice[innerSlice.length - 1].y);
        traceSmoothOpenPolyline(ctx, [...innerSlice].reverse(), false);
        ctx.closePath();

        const legGrad = ctx.createLinearGradient(
          outerSlice[0].x,
          leg.hip.y,
          innerSlice[Math.floor(innerSlice.length * 0.5)].x,
          leg.hip.y
        );
        if (isFarLimb) {
          legGrad.addColorStop(0, skinShading.base);
          legGrad.addColorStop(0.55, skinShading.midShadow);
          legGrad.addColorStop(1, skinShading.deepShadow);
        } else {
          legGrad.addColorStop(0, skinShading.highlight);
          legGrad.addColorStop(0.42, skinShading.base);
          legGrad.addColorStop(0.76, skinShading.subsurface);
          legGrad.addColorStop(1, skinShading.midShadow);
        }
        ctx.fillStyle = legGrad;
        ctx.fill();

        // Anterior shin & thigh soft satin specular ridge (essential for MST 8-10 lower limb sculpting)
        ctx.save();
        ctx.clip();
        if (!frame.facingBack && !isFarLimb) {
          ctx.beginPath();
          ctx.moveTo(leg.midThigh.x, leg.midThigh.y - leg.radii.thigh * 0.4);
          ctx.quadraticCurveTo(leg.knee.x, leg.knee.y, leg.ankle.x, leg.ankle.y);
          ctx.strokeStyle = hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.52);
          ctx.lineWidth = Math.max(2.4, leg.radii.calf * 0.48);
          ctx.stroke();
        }

        // Fresnel rim light along outer thigh/calf edge
        ctx.beginPath();
        traceSmoothOpenPolyline(ctx, outerSlice, true);
        ctx.strokeStyle = hexWithAlpha(skinShading.rimLight, rimAlpha);
        ctx.lineWidth = Math.max(1.5, scale * 0.9);
        ctx.stroke();
        ctx.restore();

        // Subtle patella / popliteal knee shading
        if (startT <= 0.48 && endT >= 0.58) {
          ctx.beginPath();
          if (frame.facingBack) {
            // Popliteal back-of-knee crease
            ctx.moveTo(leg.knee.x - leg.radii.knee * 0.45, leg.knee.y);
            ctx.quadraticCurveTo(
              leg.knee.x,
              leg.knee.y + 1.2 * scale,
              leg.knee.x + leg.radii.knee * 0.45,
              leg.knee.y
            );
          } else {
            // Soft patellar cap curve
            ctx.arc(
              leg.knee.x,
              leg.knee.y,
              Math.max(2, leg.radii.knee * 0.42),
              Math.PI * 0.18,
              Math.PI * 0.82
            );
          }
          ctx.strokeStyle = hexWithAlpha(skinShading.midShadow, 0.55);
          ctx.lineWidth = Math.max(1, scale * 0.48);
          ctx.stroke();
        }

        // Editorial contour ink (omitting proximal hip cap & distal ankle cap for seamless joints)
        const outerStrokePts = startT <= 0.04 ? outerSlice.slice(1) : outerSlice;
        if (outerStrokePts.length >= 2) {
          ctx.beginPath();
          traceSmoothOpenPolyline(ctx, outerStrokePts, true);
          ctx.strokeStyle = skinShading.contourInk;
          ctx.lineWidth = contourW;
          ctx.stroke();
        }

        const innerStrokePts = startT <= 0.04 ? innerSlice.slice(1) : innerSlice;
        if (innerStrokePts.length >= 2) {
          ctx.beginPath();
          traceSmoothOpenPolyline(ctx, innerStrokePts, true);
          ctx.strokeStyle = skinShading.contourInk;
          ctx.lineWidth = contourW;
          ctx.stroke();
        }
      }
    }

    if (includeExtremity && endT >= 0.94) {
      drawBarefootAndToes(ctx, frame, leg, isFarLimb);
    }
  }

  ctx.restore();
}

// ============================================================================
// Torso, Coupled Neck & Minimal Seamless Basewear Renderers
// ============================================================================

/**
 * Renders the sculpted torso (with 3D chestForm, waist, anterior abdomen belly dome,
 * posterior lumbar/glutes) and BMI-coupled neck column.
 */
export function drawIsometricTorsoAndNeck(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { skinShading, coupled, scale, facingBack } = frame;
  const contourW = clamp(scale * 0.58, 1.05, 1.8);
  const specAlpha = getSkinSpecularAlpha(skinShading);
  const rimAlpha = getSkinRimAlpha(skinShading, frame.theme);

  // 1. Torso main sculpted volume
  traceSmoothClosedPolygon(ctx, frame.torsoPolygon);

  const torsoLeftX = frame.hipRing.left.x - 4 * scale;
  const torsoRightX = frame.hipRing.right.x + 4 * scale;
  const torsoGrad = ctx.createLinearGradient(
    torsoLeftX,
    frame.chestRing.center.y,
    torsoRightX,
    frame.pelvisRing.center.y
  );
  torsoGrad.addColorStop(0, skinShading.highlight);
  torsoGrad.addColorStop(0.38, skinShading.base);
  torsoGrad.addColorStop(0.72, skinShading.subsurface);
  torsoGrad.addColorStop(0.92, skinShading.midShadow);
  torsoGrad.addColorStop(1, skinShading.deepShadow);

  ctx.fillStyle = torsoGrad;
  ctx.fill();

  // Clipped internal anatomical sculpting on torso
  ctx.save();
  ctx.clip();

  if (!facingBack) {
    // Clavicle subtle highlights (soften gently at higher BMI)
    const clavVisibility = clamp(1.05 - Math.max(0, coupled.bmiSoftIndex) * 0.55, 0.28, 1);
    const clavMid = frame.clavicleRing.front;
    ctx.beginPath();
    ctx.moveTo(lerp(frame.clavicleRing.left.x, clavMid.x, 0.24), frame.clavicleRing.left.y);
    ctx.quadraticCurveTo(
      lerp(frame.clavicleRing.left.x, clavMid.x, 0.65),
      clavMid.y + 1.2 * scale,
      clavMid.x - 2.2 * scale,
      clavMid.y
    );
    ctx.moveTo(clavMid.x + 2.2 * scale, clavMid.y);
    ctx.quadraticCurveTo(
      lerp(clavMid.x, frame.clavicleRing.right.x, 0.35),
      clavMid.y + 1.2 * scale,
      lerp(clavMid.x, frame.clavicleRing.right.x, 0.76),
      frame.clavicleRing.right.y
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.midShadow, 0.42 * clavVisibility);
    ctx.lineWidth = Math.max(1, scale * 0.52);
    ctx.stroke();

    // Chest contour sculpting (flat, pectoral, contoured, full_bust)
    const chestForm: ChestContourForm = coupled.chestForm;
    const bustMidX = (frame.bustApexLeft.x + frame.bustApexRight.x) * 0.5;
    const bustMidY = (frame.bustApexLeft.y + frame.bustApexRight.y) * 0.5;
    const bustSpan = Math.max(
      8 * scale,
      Math.abs(frame.bustApexLeft.x - frame.bustApexRight.x)
    );

    if (chestForm === 'contoured' || chestForm === 'full_bust') {
      const intensity = chestForm === 'full_bust' ? 1.0 : 0.68;
      for (const apex of [frame.bustApexRight, frame.bustApexLeft]) {
        const rBust = Math.max(6 * scale, bustSpan * (chestForm === 'full_bust' ? 0.66 : 0.56));
        const bGrad = ctx.createRadialGradient(
          apex.x - rBust * 0.18,
          apex.y - rBust * 0.24,
          rBust * 0.08,
          apex.x,
          apex.y,
          rBust
        );
        bGrad.addColorStop(0, hexWithAlpha(skinShading.specularHighlight, specAlpha * intensity));
        bGrad.addColorStop(0.55, hexWithAlpha(skinShading.highlight, 0.28 * intensity));
        bGrad.addColorStop(1, hexWithAlpha(skinShading.midShadow, 0));
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(apex.x, apex.y, rBust, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft underbust shadow arcs
      const ubY = frame.underbustRing.front.y;
      ctx.beginPath();
      ctx.moveTo(bustMidX - bustSpan * 0.92, bustMidY + 1.5 * scale);
      ctx.quadraticCurveTo(
        frame.bustApexRight.x,
        ubY + (chestForm === 'full_bust' ? 3.2 : 1.6) * scale,
        bustMidX - 1.4 * scale,
        ubY - 1.2 * scale
      );
      ctx.moveTo(bustMidX + 1.4 * scale, ubY - 1.2 * scale);
      ctx.quadraticCurveTo(
        frame.bustApexLeft.x,
        ubY + (chestForm === 'full_bust' ? 3.2 : 1.6) * scale,
        bustMidX + bustSpan * 0.92,
        bustMidY + 1.5 * scale
      );
      ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.28 * intensity);
      ctx.lineWidth = Math.max(1.1, scale * 0.62);
      ctx.stroke();
    } else if (chestForm === 'pectoral') {
      const pecAlpha = 0.22 + frame.spec.anthropometrics.muscleDefinition * 0.24;
      const ubY = frame.underbustRing.front.y - 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(bustMidX - bustSpan * 0.95, bustMidY - 1.5 * scale);
      ctx.quadraticCurveTo(frame.bustApexRight.x, ubY, bustMidX - 1.8 * scale, ubY - 1.6 * scale);
      ctx.moveTo(bustMidX + 1.8 * scale, ubY - 1.6 * scale);
      ctx.quadraticCurveTo(frame.bustApexLeft.x, ubY, bustMidX + bustSpan * 0.95, bustMidY - 1.5 * scale);
      ctx.strokeStyle = hexWithAlpha(skinShading.midShadow, pecAlpha);
      ctx.lineWidth = Math.max(1.1, scale * 0.58);
      ctx.stroke();
    }

    // 3D Anterior Abdomen / Belly Dome sculpting (clear fullness for high-BMI / apple / plus_size)
    if (coupled.abdomenProjection >= 0.24) {
      const bellyStrength = clamp((coupled.abdomenProjection - 0.18) / 0.85, 0.15, 1);
      const bellyR = Math.max(8 * scale, frame.waistRing.rx * 0.85);
      const domeGrad = ctx.createRadialGradient(
        frame.abdomenApex.x - bellyR * 0.16,
        frame.abdomenApex.y - bellyR * 0.26,
        bellyR * 0.1,
        frame.abdomenApex.x,
        frame.abdomenApex.y,
        bellyR * 1.15
      );
      domeGrad.addColorStop(
        0,
        hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.82 * bellyStrength)
      );
      domeGrad.addColorStop(0.55, hexWithAlpha(skinShading.highlight, 0.22 * bellyStrength));
      domeGrad.addColorStop(1, hexWithAlpha(skinShading.midShadow, 0));
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(frame.abdomenApex.x, frame.abdomenApex.y, bellyR * 1.15, 0, Math.PI * 2);
      ctx.fill();

      // Soft lower-belly under-curve crease above pelvis when abdomenProjection is prominent
      if (coupled.abdomenProjection >= 0.42) {
        const lowBellyY = lerp(frame.abdomenApex.y, frame.pelvisRing.front.y, 0.72);
        ctx.beginPath();
        ctx.moveTo(frame.abdomenApex.x - bellyR * 0.72, lowBellyY - 2.6 * scale);
        ctx.quadraticCurveTo(
          frame.abdomenApex.x,
          lowBellyY + 3.2 * scale * bellyStrength,
          frame.abdomenApex.x + bellyR * 0.72,
          lowBellyY - 2.6 * scale
        );
        ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.26 * bellyStrength);
        ctx.lineWidth = Math.max(1.2, scale * 0.68);
        ctx.stroke();
      }
    } else if (frame.spec.anthropometrics.muscleDefinition > 0.48) {
      // Subtle toned linea alba & oblique lines for lean athletic profiles
      const toneAlpha = (frame.spec.anthropometrics.muscleDefinition - 0.42) * 0.36;
      ctx.beginPath();
      ctx.moveTo(frame.underbustRing.front.x, frame.underbustRing.front.y);
      ctx.lineTo(frame.abdomenApex.x, frame.abdomenApex.y - 2 * scale);
      ctx.strokeStyle = hexWithAlpha(skinShading.midShadow, toneAlpha);
      ctx.lineWidth = Math.max(0.9, scale * 0.45);
      ctx.stroke();
    }

    // Natural umbilicus (navel) positioned on the 3D anterior abdomen surface
    if (Math.abs(Math.cos(frame.yawRad)) > 0.16) {
      const navelW = Math.max(1.1, (1.1 + coupled.abdomenProjection * 0.7) * scale);
      const navelH = Math.max(1.3, (1.5 - coupled.abdomenProjection * 0.25) * scale);
      ctx.beginPath();
      ctx.ellipse(
        frame.abdomenApex.x,
        frame.abdomenApex.y + 1.2 * scale,
        navelW * Math.max(0.45, Math.abs(Math.cos(frame.yawRad))),
        navelH,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = hexWithAlpha(skinShading.deepShadow, 0.44);
      ctx.fill();
    }
  } else {
    // Back view: Spinal groove (erector spinae) + scapular hints + 3D Gluteal spheres
    const spineTop = frame.clavicleRing.front;
    const spineMid = frame.waistRing.front;
    ctx.beginPath();
    ctx.moveTo(frame.neckBaseRing.center.x, frame.neckBaseRing.center.y);
    ctx.quadraticCurveTo(spineTop.x, lerp(spineTop.y, spineMid.y, 0.5), spineMid.x, spineMid.y);
    ctx.strokeStyle = hexWithAlpha(skinShading.midShadow, 0.42);
    ctx.lineWidth = Math.max(1.3, scale * 0.75);
    ctx.stroke();

    // Bilateral 3D glute highlights & intergluteal/infragluteal folds
    const gluteSep = frame.hipRing.rx * 0.44;
    const gluteR = Math.max(7 * scale, frame.hipRing.rx * 0.56);
    for (const dir of [-1, 1]) {
      const gx = frame.gluteApex.x + dir * gluteSep;
      const gy = frame.gluteApex.y;
      const gGrad = ctx.createRadialGradient(
        gx - gluteR * 0.15,
        gy - gluteR * 0.2,
        gluteR * 0.1,
        gx,
        gy,
        gluteR
      );
      gGrad.addColorStop(
        0,
        hexWithAlpha(skinShading.specularHighlight, specAlpha * clamp(coupled.gluteProjection, 0.35, 1))
      );
      gGrad.addColorStop(0.6, hexWithAlpha(skinShading.highlight, 0.22));
      gGrad.addColorStop(1, hexWithAlpha(skinShading.midShadow, 0));
      ctx.fillStyle = gGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, gluteR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Intergluteal cleft & infragluteal fold creases
    ctx.beginPath();
    ctx.moveTo(frame.gluteApex.x, frame.pelvisRing.center.y + 2 * scale);
    ctx.lineTo(frame.gluteApex.x, frame.crotchPoint.y);
    ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.38);
    ctx.lineWidth = Math.max(1.1, scale * 0.58);
    ctx.stroke();
  }

  // Grazing Fresnel rimLight along left & right torso silhouette
  ctx.beginPath();
  traceSmoothOpenPolyline(ctx, frame.torsoLeftContour, true);
  ctx.strokeStyle = hexWithAlpha(skinShading.rimLight, rimAlpha);
  ctx.lineWidth = Math.max(1.6, scale * 0.95);
  ctx.stroke();

  ctx.restore();

  // Outer torso silhouette ink (left & right contours, leaving shoulder/hip caps clean)
  if (frame.torsoLeftContour.length >= 2) {
    ctx.beginPath();
    traceSmoothOpenPolyline(ctx, frame.torsoLeftContour.slice(1, -1), true);
    ctx.strokeStyle = skinShading.contourInk;
    ctx.lineWidth = contourW;
    ctx.stroke();
  }
  if (frame.torsoRightContour.length >= 2) {
    ctx.beginPath();
    traceSmoothOpenPolyline(ctx, frame.torsoRightContour.slice(1, -1), true);
    ctx.strokeStyle = skinShading.contourInk;
    ctx.lineWidth = contourW;
    ctx.stroke();
  }

  // 2. Coupled Neck Column (thickens proportionally with neckWidth & neckDepth)
  const nTop = frame.neckTopRing;
  const nBase = frame.neckBaseRing;

  ctx.beginPath();
  ctx.moveTo(nTop.left.x, nTop.left.y);
  ctx.quadraticCurveTo(
    lerp(nTop.left.x, nBase.left.x, 0.65),
    lerp(nTop.left.y, nBase.left.y, 0.72),
    nBase.left.x - 1.8 * scale,
    nBase.left.y + 1.4 * scale
  );
  ctx.quadraticCurveTo(
    nBase.front.x,
    nBase.front.y + 2.5 * scale,
    nBase.right.x + 1.8 * scale,
    nBase.right.y + 1.4 * scale
  );
  ctx.quadraticCurveTo(
    lerp(nBase.right.x, nTop.right.x, 0.35),
    lerp(nBase.right.y, nTop.right.y, 0.28),
    nTop.right.x,
    nTop.right.y
  );
  ctx.closePath();

  const neckGrad = ctx.createLinearGradient(nBase.left.x, nTop.center.y, nBase.right.x, nBase.center.y);
  neckGrad.addColorStop(0, skinShading.highlight);
  neckGrad.addColorStop(0.42, skinShading.base);
  neckGrad.addColorStop(0.8, skinShading.midShadow);
  neckGrad.addColorStop(1, skinShading.deepShadow);
  ctx.fillStyle = neckGrad;
  ctx.fill();

  // Cast shadow under chin / submental fullness onto upper neck
  if (!facingBack) {
    const castGrad = ctx.createLinearGradient(
      nTop.center.x,
      nTop.center.y,
      nBase.center.x,
      lerp(nTop.center.y, nBase.front.y, 0.78)
    );
    castGrad.addColorStop(
      0,
      hexWithAlpha(skinShading.deepShadow, 0.44 + 0.18 * coupled.submentalFullness)
    );
    castGrad.addColorStop(1, hexWithAlpha(skinShading.deepShadow, 0));
    ctx.fillStyle = castGrad;
    ctx.fill();
  }

  // Neck lateral contour strokes (open at trapezius base so neck & torso flow seamlessly)
  ctx.beginPath();
  ctx.moveTo(nTop.left.x, nTop.left.y);
  ctx.quadraticCurveTo(
    lerp(nTop.left.x, nBase.left.x, 0.65),
    lerp(nTop.left.y, nBase.left.y, 0.72),
    nBase.left.x - 1.2 * scale,
    nBase.left.y + 0.6 * scale
  );
  ctx.moveTo(nTop.right.x, nTop.right.y);
  ctx.quadraticCurveTo(
    lerp(nTop.right.x, nBase.right.x, 0.65),
    lerp(nTop.right.y, nBase.right.y, 0.72),
    nBase.right.x + 1.2 * scale,
    nBase.right.y + 0.6 * scale
  );
  ctx.strokeStyle = skinShading.contourInk;
  ctx.lineWidth = contourW;
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders sleek, form-fitting neutral seamless athletic basewear (briefs + minimal chest band
 * when appropriate) while leaving neck, shoulders, arms, hands, waist/belly, thighs, calves,
 * ankles, and barefoot insteps/toes 100% exposed.
 */
export function drawIsometricMinimalBasewear(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  coverageFlags: BasewearCoverageFlags = {}
): void {
  const { hasTop = false, hasBottom = false, hasOnepiece = false } = coverageFlags;
  if (hasOnepiece && hasTop && hasBottom) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { scale, coupled, spec } = frame;
  const isDark = frame.theme === 'dark';

  // Sleek neutral architectural charcoal-taupe basewear distinct from all MST 1-10 skin tones
  const fabricBase = isDark ? '#3F434E' : '#353842';
  const fabricHighlight = isDark ? '#575C6B' : '#4C505E';
  const fabricShadow = isDark ? '#272A32' : '#22242B';
  const fabricSeam = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.2)';
  const outlineStroke = '#1D1F26';
  const lineW = clamp(scale * 0.5, 0.9, 1.5);

  // 1. Sleek seamless athletic briefs (strictly below pelvisRing so waist & abdomen stay 100% bare)
  if (!hasBottom && !hasOnepiece) {
    const pRing = frame.pelvisRing;
    const hRing = frame.hipRing;
    const wbLeft = lerpPoint(pRing.left, hRing.left, 0.36);
    const wbRight = lerpPoint(pRing.right, hRing.right, 0.36);
    const wbFront = lerpPoint(pRing.front, hRing.front, 0.42);
    const legCutLeft = lerpPoint(hRing.left, frame.crotchPoint, 0.16);
    const legCutRight = lerpPoint(hRing.right, frame.crotchPoint, 0.16);
    const crotchBottom: Point2D = {
      x: frame.crotchPoint.x,
      y: frame.crotchPoint.y + 1.8 * scale,
    };

    ctx.beginPath();
    ctx.moveTo(wbLeft.x, wbLeft.y);
    ctx.quadraticCurveTo(wbFront.x, wbFront.y + 1.2 * scale, wbRight.x, wbRight.y);
    ctx.quadraticCurveTo(
      hRing.right.x + 0.5 * scale,
      lerp(wbRight.y, legCutRight.y, 0.5),
      legCutRight.x,
      legCutRight.y
    );
    if (frame.facingBack) {
      // Full seamless seat wrap around 3D glutes in back views
      ctx.quadraticCurveTo(
        lerp(legCutRight.x, crotchBottom.x, 0.45),
        crotchBottom.y + 1.2 * scale,
        crotchBottom.x,
        crotchBottom.y
      );
      ctx.quadraticCurveTo(
        lerp(crotchBottom.x, legCutLeft.x, 0.55),
        crotchBottom.y + 1.2 * scale,
        legCutLeft.x,
        legCutLeft.y
      );
    } else {
      // Clean high-cut athletic brief leg openings exposing full upper thighs
      ctx.quadraticCurveTo(
        lerp(legCutRight.x, crotchBottom.x, 0.55),
        lerp(legCutRight.y, crotchBottom.y, 0.3),
        crotchBottom.x + 2.4 * scale,
        crotchBottom.y
      );
      ctx.lineTo(crotchBottom.x - 2.4 * scale, crotchBottom.y);
      ctx.quadraticCurveTo(
        lerp(crotchBottom.x, legCutLeft.x, 0.45),
        lerp(crotchBottom.y, legCutLeft.y, 0.7),
        legCutLeft.x,
        legCutLeft.y
      );
    }
    ctx.quadraticCurveTo(
      hRing.left.x - 0.5 * scale,
      lerp(legCutLeft.y, wbLeft.y, 0.5),
      wbLeft.x,
      wbLeft.y
    );
    ctx.closePath();

    const briefGrad = ctx.createLinearGradient(wbLeft.x, wbLeft.y, wbRight.x, crotchBottom.y);
    briefGrad.addColorStop(0, fabricHighlight);
    briefGrad.addColorStop(0.48, fabricBase);
    briefGrad.addColorStop(1, fabricShadow);
    ctx.fillStyle = briefGrad;
    ctx.fill();
    ctx.strokeStyle = outlineStroke;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Subtle micro-elastic seamless waistband highlight
    ctx.beginPath();
    ctx.moveTo(wbLeft.x + 1 * scale, wbLeft.y + 1.5 * scale);
    ctx.quadraticCurveTo(
      wbFront.x,
      wbFront.y + 2.7 * scale,
      wbRight.x - 1 * scale,
      wbRight.y + 1.5 * scale
    );
    ctx.strokeStyle = fabricSeam;
    ctx.lineWidth = Math.max(0.8, scale * 0.4);
    ctx.stroke();
  }

  // 2. Minimal seamless chest band (leaves shoulders, neck, clavicles, arms & entire waist/abdomen bare)
  const needsChestBand =
    !hasTop &&
    !hasOnepiece &&
    (coupled.chestForm === 'contoured' ||
      coupled.chestForm === 'full_bust' ||
      spec.framePreset === 'feminine' ||
      spec.framePreset === 'androgynous');

  if (needsChestBand) {
    const cRing = frame.chestRing;
    const uRing = frame.underbustRing;
    const topLeft: Point2D = {
      x: cRing.left.x + 0.4 * scale,
      y: cRing.left.y - 2.6 * scale,
    };
    const topRight: Point2D = {
      x: cRing.right.x - 0.4 * scale,
      y: cRing.right.y - 2.6 * scale,
    };
    const topFront: Point2D = {
      x: cRing.front.x,
      y: cRing.front.y - (coupled.chestForm === 'full_bust' ? 4.2 : 3.2) * scale,
    };
    const botLeft: Point2D = {
      x: uRing.left.x,
      y: uRing.left.y + 0.4 * scale,
    };
    const botRight: Point2D = {
      x: uRing.right.x,
      y: uRing.right.y + 0.4 * scale,
    };
    const botFront: Point2D = {
      x: uRing.front.x,
      y: uRing.front.y + (coupled.chestForm === 'full_bust' ? 1.8 : 0.8) * scale,
    };

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.quadraticCurveTo(topFront.x, topFront.y, topRight.x, topRight.y);
    ctx.quadraticCurveTo(cRing.right.x + 0.8 * scale, cRing.right.y, botRight.x, botRight.y);
    ctx.quadraticCurveTo(botFront.x, botFront.y, botLeft.x, botLeft.y);
    ctx.quadraticCurveTo(cRing.left.x - 0.8 * scale, cRing.left.y, topLeft.x, topLeft.y);
    ctx.closePath();

    const bandGrad = ctx.createLinearGradient(topLeft.x, topFront.y, botRight.x, botFront.y);
    bandGrad.addColorStop(0, fabricHighlight);
    bandGrad.addColorStop(0.5, fabricBase);
    bandGrad.addColorStop(1, fabricShadow);
    ctx.fillStyle = bandGrad;
    ctx.fill();
    ctx.strokeStyle = outlineStroke;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Subtle 3D bust contour highlight on chest band in front/quarter views
    if (!frame.facingBack) {
      ctx.beginPath();
      ctx.moveTo(topLeft.x + 1.5 * scale, topLeft.y + 1.4 * scale);
      ctx.quadraticCurveTo(
        topFront.x,
        topFront.y + 1.4 * scale,
        topRight.x - 1.5 * scale,
        topRight.y + 1.4 * scale
      );
      ctx.strokeStyle = fabricSeam;
      ctx.lineWidth = Math.max(0.8, scale * 0.38);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ============================================================================
// Craniofacial High-BMI Morphing, Multi-Ethnic Features & Portrait Composite
// ============================================================================

interface MorphedHeadGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  crown: Point2D;
  chin: Point2D;
  templeLeft: Point2D;
  templeRight: Point2D;
  cheekLeft: Point2D;
  cheekRight: Point2D;
  jawCornerLeft: Point2D;
  jawCornerRight: Point2D;
  contourPoints: Point2D[];
}

function buildMorphedHeadGeometry(frame: IsometricBodyFrame): MorphedHeadGeometry {
  const { cranial, coupled, spec, yawRad, scale } = frame;
  const headShape: AvatarHeadShape = spec.appearance.headShape;
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);

  const cx = frame.headCenter.x;
  const cy = frame.headCenter.y;
  const rx = cranial.rxPx;
  const ry = cranial.ryPx;

  // Shape modifiers across forehead, cheekbones, jaw width & chin taper
  let templeW = 0.94;
  let cheekW = 1.0;
  let jawW = 0.78;
  let jawYRatio = 0.56; // down from cy toward chin (1.0 = chin)
  let chinW = 0.34;

  if (headShape === 'round') {
    templeW = 0.96;
    cheekW = 1.06;
    jawW = 0.88;
    jawYRatio = 0.62;
    chinW = 0.46;
  } else if (headShape === 'square') {
    templeW = 0.98;
    cheekW = 1.01;
    jawW = 0.93;
    jawYRatio = 0.68;
    chinW = 0.5;
  } else if (headShape === 'heart') {
    templeW = 1.01;
    cheekW = 1.03;
    jawW = 0.7;
    jawYRatio = 0.52;
    chinW = 0.24;
  } else if (headShape === 'long') {
    templeW = 0.91;
    cheekW = 0.95;
    jawW = 0.75;
    jawYRatio = 0.6;
    chinW = 0.32;
  }

  // High-BMI coupled craniofacial fullness: widens lower cheeks & rounds angular jaw corners
  const cheekBoost = (coupled.cheekFullness - 1) * 0.28;
  cheekW += cheekBoost;
  jawW = lerp(jawW, Math.max(jawW, cheekW * 0.95), coupled.jawSoftness * 0.78) + cheekBoost * 0.75;
  chinW = lerp(chinW, 0.54, coupled.jawSoftness * 0.65);
  jawYRatio = lerp(jawYRatio, 0.66, coupled.jawSoftness * 0.5);

  // Asymmetric 3/4 & profile forward facial projection
  const fwdShift = sinY * rx * 0.22 * (frame.facingFront ? 1 : -0.45);
  const crown: Point2D = {
    x: cx - fwdShift * 0.2,
    y: frame.headCrown.y,
  };
  const chin: Point2D = {
    x: lerp(cx + fwdShift * 1.15, frame.chinPoint.x, 0.65),
    y: frame.chinPoint.y + Math.max(0, coupled.cheekFullness - 1) * 1.1 * scale,
  };

  const leftAsym = sinY < 0 && frame.facingFront ? 1 + Math.abs(sinY) * 0.1 : 1 - Math.max(0, sinY) * 0.06;
  const rightAsym = sinY > 0 && frame.facingFront ? 1 + Math.abs(sinY) * 0.1 : 1 - Math.max(0, -sinY) * 0.06;

  const templeY = cy - ry * 0.34;
  const cheekY = cy + ry * (0.16 + Math.max(0, coupled.cheekFullness - 1) * 0.08);
  const jawY = lerp(cy, chin.y, jawYRatio);

  const templeLeft: Point2D = { x: cx - rx * templeW * leftAsym + fwdShift * 0.15, y: templeY };
  const templeRight: Point2D = { x: cx + rx * templeW * rightAsym + fwdShift * 0.15, y: templeY };

  const cheekLeft: Point2D = { x: cx - rx * cheekW * leftAsym + fwdShift * 0.45, y: cheekY };
  const cheekRight: Point2D = { x: cx + rx * cheekW * rightAsym + fwdShift * 0.45, y: cheekY };

  const jawCornerLeft: Point2D = { x: cx - rx * jawW * leftAsym + fwdShift * 0.55, y: jawY };
  const jawCornerRight: Point2D = { x: cx + rx * jawW * rightAsym + fwdShift * 0.55, y: jawY };

  const crownLeft: Point2D = { x: cx - rx * templeW * 0.72, y: crown.y + ry * 0.16 };
  const crownRight: Point2D = { x: cx + rx * templeW * 0.72, y: crown.y + ry * 0.16 };
  const chinLeft: Point2D = { x: chin.x - rx * chinW, y: chin.y - ry * 0.05 * (1 - coupled.jawSoftness * 0.5) };
  const chinRight: Point2D = { x: chin.x + rx * chinW, y: chin.y - ry * 0.05 * (1 - coupled.jawSoftness * 0.5) };

  void cosY;

  const contourPoints: Point2D[] = [
    crown,
    crownRight,
    templeRight,
    cheekRight,
    jawCornerRight,
    chinRight,
    chin,
    chinLeft,
    jawCornerLeft,
    cheekLeft,
    templeLeft,
    crownLeft,
  ];

  return {
    cx,
    cy,
    rx,
    ry,
    crown,
    chin,
    templeLeft,
    templeRight,
    cheekLeft,
    cheekRight,
    jawCornerLeft,
    jawCornerRight,
    contourPoints,
  };
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  earPt: Point2D,
  isScreenRight: boolean,
  frame: IsometricBodyFrame
): void {
  const { skinShading, scale, cranial } = frame;
  const earRx = Math.max(2.0, cranial.rxPx * 0.18);
  const earRy = Math.max(3.5, cranial.ryPx * 0.24);
  const tilt = (isScreenRight ? 1 : -1) * 0.14;

  ctx.save();
  ctx.translate(earPt.x, earPt.y);
  ctx.rotate(tilt);

  ctx.beginPath();
  ctx.ellipse(0, 0, earRx, earRy, 0, 0, Math.PI * 2);
  const eGrad = ctx.createLinearGradient(-earRx, -earRy, earRx, earRy);
  eGrad.addColorStop(0, skinShading.highlight);
  eGrad.addColorStop(0.55, skinShading.subsurface);
  eGrad.addColorStop(1, skinShading.midShadow);
  ctx.fillStyle = eGrad;
  ctx.fill();

  // Stroke outer C-helix only (leaving anterior cheek attachment open so it blends organically)
  ctx.beginPath();
  if (isScreenRight) {
    ctx.ellipse(0, 0, earRx, earRy, 0, -Math.PI * 0.62, Math.PI * 0.68);
  } else {
    ctx.ellipse(0, 0, earRx, earRy, 0, Math.PI * 0.32, Math.PI * 1.62);
  }
  ctx.strokeStyle = skinShading.contourInk;
  ctx.lineWidth = clamp(scale * 0.48, 0.85, 1.45);
  ctx.stroke();

  // Inner concha fold
  if (!frame.facingBack) {
    ctx.beginPath();
    ctx.arc(
      isScreenRight ? -earRx * 0.14 : earRx * 0.14,
      0,
      earRy * 0.42,
      isScreenRight ? -Math.PI * 0.42 : Math.PI * 0.58,
      isScreenRight ? Math.PI * 0.42 : Math.PI * 1.42
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.46);
    ctx.lineWidth = Math.max(0.75, scale * 0.35);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSubmentalUnderChinVolume(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry
): void {
  const { coupled, skinShading, scale, facingBack, yawRad } = frame;
  if (facingBack || coupled.submentalFullness < 0.18) return;

  const strength = clamp((coupled.submentalFullness - 0.14) / 0.76, 0, 1);
  const sinY = Math.sin(yawRad);
  const absSin = Math.abs(sinY);
  const pouchDrop = (1.5 + 5.2 * strength) * scale;

  // In profile/quarter views, bridge smoothly from anterior chin back into anterior throat
  const throatAnchor: Point2D = {
    x: lerp(frame.neckTopRing.center.x, frame.neckTopRing.front.x, 0.75),
    y: lerp(headGeo.chin.y, frame.neckBaseRing.front.y, 0.44 + 0.18 * strength),
  };

  const leftAnchor =
    sinY > 0.35
      ? throatAnchor
      : lerpPoint(headGeo.jawCornerLeft, headGeo.chin, 0.24);
  const rightAnchor =
    sinY < -0.35
      ? throatAnchor
      : lerpPoint(headGeo.jawCornerRight, headGeo.chin, 0.24);
  const subApex: Point2D = {
    x: lerp(
      lerp(headGeo.chin.x, frame.submentalPoint.x, 0.65),
      lerp(throatAnchor.x, headGeo.chin.x, 0.58),
      absSin
    ),
    y: Math.max(headGeo.chin.y + pouchDrop * (1 - 0.18 * absSin), frame.submentalPoint.y),
  };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftAnchor.x, leftAnchor.y - 0.6 * scale);
  ctx.quadraticCurveTo(
    subApex.x,
    subApex.y + pouchDrop * 0.36,
    rightAnchor.x,
    rightAnchor.y - 0.6 * scale
  );
  ctx.quadraticCurveTo(
    headGeo.chin.x,
    headGeo.chin.y - 1.5 * scale,
    leftAnchor.x,
    leftAnchor.y - 0.6 * scale
  );
  ctx.closePath();

  const subGrad = ctx.createLinearGradient(
    subApex.x,
    headGeo.chin.y - 1 * scale,
    subApex.x,
    subApex.y + pouchDrop * 0.35
  );
  subGrad.addColorStop(0, skinShading.base);
  subGrad.addColorStop(0.55, skinShading.midShadow);
  subGrad.addColorStop(1, skinShading.deepShadow);
  ctx.fillStyle = subGrad;
  ctx.fill();

  // Outer submental/double-chin contour stroke
  ctx.beginPath();
  ctx.moveTo(leftAnchor.x, leftAnchor.y);
  ctx.quadraticCurveTo(
    subApex.x,
    subApex.y + pouchDrop * 0.36,
    rightAnchor.x,
    rightAnchor.y
  );
  ctx.strokeStyle = hexWithAlpha(skinShading.contourInk, 0.55 + 0.35 * strength);
  ctx.lineWidth = clamp(scale * 0.48, 0.85, 1.45);
  ctx.stroke();
  ctx.restore();
}

let sharedFaceScratchCanvas: HTMLCanvasElement | null = null;

function drawFeatheredFacePhotoComposite(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry,
  faceImage: HTMLImageElement | ImageBitmap
): boolean {
  if (Math.abs(frame.angleDeg) > 65 || typeof document === 'undefined') {
    return false;
  }

  const imgW =
    'naturalWidth' in faceImage ? faceImage.naturalWidth : faceImage.width;
  const imgH =
    'naturalHeight' in faceImage ? faceImage.naturalHeight : faceImage.height;
  if (!imgW || !imgH) return false;

  if (!sharedFaceScratchCanvas) {
    sharedFaceScratchCanvas = document.createElement('canvas');
    sharedFaceScratchCanvas.width = 144;
    sharedFaceScratchCanvas.height = 176;
  }
  const sCanvas = sharedFaceScratchCanvas;
  const sCtx = sCanvas.getContext('2d');
  if (!sCtx) return false;

  const sw = sCanvas.width;
  const sh = sCanvas.height;
  sCtx.clearRect(0, 0, sw, sh);

  // Center-crop portrait framing (slightly favoring upper-middle portrait zone)
  const targetAspect = sw / sh;
  const srcAspect = imgW / imgH;
  let cropW = imgW;
  let cropH = imgH;
  let cropX = 0;
  let cropY = 0;
  if (srcAspect > targetAspect) {
    cropW = imgH * targetAspect;
    cropX = (imgW - cropW) * 0.5;
  } else {
    cropH = imgW / targetAspect;
    cropY = (imgH - cropH) * 0.22;
  }

  sCtx.save();
  sCtx.drawImage(faceImage, cropX, cropY, cropW, cropH, 0, 0, sw, sh);

  // Subtle MST skin-tone color harmonization so indoor/flash photos blend naturally into neck/ears
  sCtx.globalCompositeOperation = 'soft-light';
  sCtx.fillStyle = hexWithAlpha(frame.skinShading.base, 0.26);
  sCtx.fillRect(0, 0, sw, sh);

  // Elliptical radial feather mask eliminating hard portrait borders
  sCtx.globalCompositeOperation = 'destination-in';
  sCtx.translate(sw * 0.5, sh * 0.52);
  sCtx.scale(1, sh / sw);
  const maskGrad = sCtx.createRadialGradient(0, 0, sw * 0.18, 0, 0, sw * 0.48);
  maskGrad.addColorStop(0, 'rgba(0,0,0,0.92)');
  maskGrad.addColorStop(0.68, 'rgba(0,0,0,0.74)');
  maskGrad.addColorStop(0.9, 'rgba(0,0,0,0.22)');
  maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
  sCtx.fillStyle = maskGrad;
  sCtx.beginPath();
  sCtx.arc(0, 0, sw * 0.5, 0, Math.PI * 2);
  sCtx.fill();
  sCtx.restore();

  // Perspective-skew & foreshorten onto the morphed isometric face plane
  const cosYaw = Math.cos(frame.yawRad);
  const sinYaw = Math.sin(frame.yawRad);
  const faceAnchorX = headGeo.cx + sinYaw * headGeo.rx * 0.24;
  const faceAnchorY = lerp(headGeo.crown.y, headGeo.chin.y, 0.54);
  const destW = headGeo.rx * 1.88 * clamp(cosYaw, 0.48, 1);
  const destH = headGeo.ry * 1.78;
  const shearY = sinYaw * Math.sin(frame.elevRad) * 0.28;

  ctx.save();
  traceSmoothClosedPolygon(ctx, headGeo.contourPoints);
  ctx.clip();
  ctx.translate(faceAnchorX, faceAnchorY);
  ctx.transform(1, shearY, 0, 1, 0, 0);
  ctx.drawImage(sCanvas, -destW * 0.5, -destH * 0.5, destW, destH);
  ctx.restore();

  return true;
}

function drawSingleEye(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  halfW: number,
  halfH: number,
  isRightSideOfFace: boolean,
  eyeShape: AvatarEyeShape,
  skinShading: AdaptiveMstShadingPalette,
  scale: number,
  isProfile: boolean
): void {
  const dir = isRightSideOfFace ? 1 : -1; // +1 outer right, -1 outer left
  let outerLiftY = 0;
  let apH = halfH;

  if (eyeShape === 'upturned') {
    outerLiftY = -halfH * 0.42;
  } else if (eyeShape === 'round') {
    apH = halfH * 1.28;
  } else if (eyeShape === 'monolid') {
    apH = halfH * 0.86;
    outerLiftY = -halfH * 0.14;
  } else if (eyeShape === 'hooded') {
    apH = halfH * 0.92;
  }

  // Deep-set orbital socket wash
  if (eyeShape === 'deep_set') {
    ctx.beginPath();
    ctx.ellipse(ex, ey - apH * 0.35, halfW * 1.22, apH * 1.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(skinShading.midShadow, 0.38);
    ctx.fill();
  }

  if (isProfile) {
    // Crisp side-profile eye wedge facing nose direction
    const noseSign = dir;
    ctx.beginPath();
    ctx.moveTo(ex - noseSign * halfW * 0.7, ey + outerLiftY * 0.4);
    ctx.quadraticCurveTo(
      ex + noseSign * halfW * 0.25,
      ey - apH * 1.05,
      ex + noseSign * halfW * 0.72,
      ey - apH * 0.15
    );
    ctx.quadraticCurveTo(
      ex + noseSign * halfW * 0.2,
      ey + apH * 0.85,
      ex - noseSign * halfW * 0.65,
      ey + apH * 0.22
    );
    ctx.closePath();
    ctx.fillStyle = '#F7F5F2';
    ctx.fill();

    // Iris at profile front edge
    ctx.beginPath();
    ctx.ellipse(
      ex + noseSign * halfW * 0.38,
      ey,
      Math.max(0.9, halfW * 0.28),
      Math.max(1.2, apH * 0.78),
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = '#261C18';
    ctx.fill();

    // Upper lash line
    ctx.beginPath();
    ctx.moveTo(ex - noseSign * halfW * 0.75, ey + outerLiftY * 0.4);
    ctx.quadraticCurveTo(
      ex + noseSign * halfW * 0.25,
      ey - apH * 1.1,
      ex + noseSign * halfW * 0.8,
      ey - apH * 0.18
    );
    ctx.strokeStyle = '#1B1514';
    ctx.lineWidth = clamp(scale * 0.56, 1.0, 1.65);
    ctx.stroke();
    return;
  }

  const innerX = ex - dir * halfW;
  const outerX = ex + dir * halfW;
  const innerY = ey + apH * 0.12;
  const outerY = ey + outerLiftY;

  // Sclera aperture
  ctx.beginPath();
  ctx.moveTo(innerX, innerY);
  ctx.quadraticCurveTo(ex, ey - apH * 1.12, outerX, outerY);
  ctx.quadraticCurveTo(ex, ey + apH * 0.96, innerX, innerY);
  ctx.closePath();
  ctx.fillStyle = '#F8F6F4';
  ctx.fill();

  // Clipped iris, pupil & living catchlight
  ctx.save();
  ctx.clip();
  const irisR = Math.max(1.25, Math.min(halfW * 0.54, apH * 0.98));
  ctx.beginPath();
  ctx.arc(ex, ey - apH * 0.04, irisR, 0, Math.PI * 2);
  ctx.fillStyle = '#33241E';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ex, ey - apH * 0.04, irisR * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = '#120E0D';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ex - irisR * 0.28, ey - irisR * 0.32, Math.max(0.55, irisR * 0.26), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fill();
  ctx.restore();

  // Upper lash contour
  ctx.beginPath();
  ctx.moveTo(innerX, innerY);
  ctx.quadraticCurveTo(ex, ey - apH * 1.15, outerX + dir * halfW * 0.08, outerY - apH * 0.05);
  ctx.strokeStyle = '#1A1413';
  ctx.lineWidth = clamp(scale * 0.58, 1.05, 1.75);
  ctx.stroke();

  // Subtle lower lash rim
  ctx.beginPath();
  ctx.moveTo(innerX + dir * halfW * 0.2, innerY + apH * 0.06);
  ctx.quadraticCurveTo(ex, ey + apH * 0.95, outerX, outerY);
  ctx.strokeStyle = hexWithAlpha(skinShading.contourInk, 0.45);
  ctx.lineWidth = Math.max(0.7, scale * 0.34);
  ctx.stroke();

  // Eyelid crease geometry per multi-ethnic eyeShape (omitted on monolid!)
  if (eyeShape !== 'monolid') {
    const creaseOffset =
      eyeShape === 'hooded'
        ? apH * 0.32
        : eyeShape === 'deep_set'
          ? apH * 0.85
          : apH * 0.62;
    ctx.beginPath();
    ctx.moveTo(innerX + dir * halfW * (eyeShape === 'hooded' ? 0.25 : 0.08), innerY - creaseOffset * 0.65);
    ctx.quadraticCurveTo(
      ex,
      ey - apH * 1.12 - creaseOffset,
      outerX - dir * halfW * (eyeShape === 'hooded' ? 0.02 : 0.08),
      outerY - creaseOffset * 0.55
    );
    ctx.strokeStyle = hexWithAlpha(
      skinShading.contourInk,
      eyeShape === 'deep_set' ? 0.62 : 0.38
    );
    ctx.lineWidth = Math.max(0.7, scale * 0.35);
    ctx.stroke();
  }
}

function drawMultiEthnicFacialFeatures(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry,
  hairPalette: HairShadingPalette
): void {
  if (!frame.facingFront) return;

  const { spec, skinShading, scale, yawRad } = frame;
  const app = spec.appearance;
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);
  const isProfile = Math.abs(cosY) < 0.22;
  const specAlpha = getSkinSpecularAlpha(skinShading);

  const faceCenterX = headGeo.cx + sinY * headGeo.rx * 0.38;
  const eyeY = frame.cranial.eyeLineY;
  const browY = frame.cranial.browLineY;
  const noseY = lerp(eyeY, headGeo.chin.y, 0.42);
  const mouthY = lerp(eyeY, headGeo.chin.y, 0.69);

  const baseEyeSpan = headGeo.rx * 0.42;
  const baseEyeHalfW = headGeo.rx * 0.195 * app.eyeSizeScale;
  const baseEyeHalfH = Math.max(1.4, baseEyeHalfW * 0.48);

  const browColor = mixHexColors(hairPalette.base, '#1F1917', 0.38);
  const browThick = clamp(scale * 0.68 * app.browStrength, 1.0, 2.5);

  if (isProfile) {
    const pDir = sinY >= 0 ? 1 : -1;
    const profEyeX = headGeo.cx + pDir * headGeo.rx * 0.46;
    drawSingleEye(
      ctx,
      profEyeX,
      eyeY,
      baseEyeHalfW * 0.85,
      baseEyeHalfH,
      pDir > 0,
      app.eyeShape,
      skinShading,
      scale,
      true
    );

    // Profile eyebrow
    ctx.beginPath();
    ctx.moveTo(profEyeX - pDir * baseEyeHalfW * 0.85, browY + 0.6 * scale);
    ctx.quadraticCurveTo(
      profEyeX + pDir * baseEyeHalfW * 0.15,
      browY - 1.4 * scale,
      profEyeX + pDir * baseEyeHalfW * 0.85,
      browY - 0.2 * scale
    );
    ctx.strokeStyle = browColor;
    ctx.lineWidth = browThick;
    ctx.stroke();

    // Sculpted 3D profile nose bridge, tip & nostril wing
    const noseTipX = headGeo.cx + pDir * (headGeo.rx * (0.98 + 0.12 * app.noseWidthScale));
    ctx.beginPath();
    ctx.moveTo(headGeo.cx + pDir * headGeo.rx * 0.78, eyeY - 1 * scale);
    ctx.quadraticCurveTo(
      lerp(headGeo.cx + pDir * headGeo.rx * 0.82, noseTipX, 0.6),
      lerp(eyeY, noseY, 0.6),
      noseTipX,
      noseY
    );
    ctx.quadraticCurveTo(
      noseTipX - pDir * 1.4 * scale,
      noseY + 2.2 * scale,
      headGeo.cx + pDir * headGeo.rx * 0.76,
      noseY + 2.4 * scale
    );
    ctx.fillStyle = skinShading.base;
    ctx.fill();
    ctx.strokeStyle = skinShading.contourInk;
    ctx.lineWidth = clamp(scale * 0.52, 0.95, 1.55);
    ctx.stroke();

    // Profile nostril wing crease
    ctx.beginPath();
    ctx.arc(
      headGeo.cx + pDir * headGeo.rx * 0.74,
      noseY + 1.1 * scale,
      Math.max(1.1, 1.5 * app.noseWidthScale * scale),
      pDir > 0 ? Math.PI * 0.6 : -Math.PI * 0.3,
      pDir > 0 ? Math.PI * 1.35 : Math.PI * 0.4
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.65);
    ctx.lineWidth = Math.max(0.8, scale * 0.4);
    ctx.stroke();

    // Profile upper & lower vermilion lips
    const lipProj = headGeo.cx + pDir * headGeo.rx * (0.82 + 0.06 * app.lipFullnessScale);
    const lipH = (1.6 + 1.4 * app.lipFullnessScale) * scale;
    ctx.beginPath();
    ctx.moveTo(headGeo.cx + pDir * headGeo.rx * 0.52, mouthY);
    ctx.quadraticCurveTo(lipProj, mouthY - lipH, lipProj, mouthY);
    ctx.fillStyle = mixHexColors(skinShading.lipNatural, skinShading.lipShadow, 0.25);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(headGeo.cx + pDir * headGeo.rx * 0.52, mouthY);
    ctx.quadraticCurveTo(lipProj, mouthY + lipH * 1.15, lipProj - pDir * 0.6 * scale, mouthY);
    ctx.fillStyle = skinShading.lipNatural;
    ctx.fill();
    return;
  }

  // Front & Quarter-Front (0 deg, +-45 deg) bilateral foreshortened features
  const leftForeshorten = sinY > 0 ? 1.04 : clamp(cosY + 0.22, 0.58, 1);
  const rightForeshorten = sinY < 0 ? 1.04 : clamp(cosY + 0.22, 0.58, 1);

  const leftEyeX = faceCenterX - baseEyeSpan * leftForeshorten;
  const rightEyeX = faceCenterX + baseEyeSpan * rightForeshorten;

  drawSingleEye(
    ctx,
    leftEyeX,
    eyeY,
    baseEyeHalfW * leftForeshorten,
    baseEyeHalfH,
    false,
    app.eyeShape,
    skinShading,
    scale,
    false
  );
  drawSingleEye(
    ctx,
    rightEyeX,
    eyeY,
    baseEyeHalfW * rightForeshorten,
    baseEyeHalfH,
    true,
    app.eyeShape,
    skinShading,
    scale,
    false
  );

  // Eyebrows scaled by browStrength
  for (const bItem of [
    { x: leftEyeX, w: baseEyeHalfW * 1.18 * leftForeshorten, dir: -1 },
    { x: rightEyeX, w: baseEyeHalfW * 1.18 * rightForeshorten, dir: 1 },
  ]) {
    ctx.beginPath();
    ctx.moveTo(bItem.x - bItem.dir * bItem.w * 0.88, browY + 0.5 * scale);
    ctx.quadraticCurveTo(
      bItem.x + bItem.dir * bItem.w * 0.18,
      browY - (1.4 + 0.5 * app.browStrength) * scale,
      bItem.x + bItem.dir * bItem.w * 0.96,
      browY + 0.35 * scale
    );
    ctx.strokeStyle = browColor;
    ctx.lineWidth = browThick;
    ctx.stroke();
  }

  // Nose bridge specular highlight + multi-ethnic noseWidthScale alar wings
  const noseCenterX = faceCenterX + sinY * headGeo.rx * 0.14;
  const noseHalfW = Math.max(2.1, headGeo.rx * 0.175 * app.noseWidthScale);

  // Warm bronze/ivory bridge specular highlight
  ctx.beginPath();
  ctx.moveTo(faceCenterX, eyeY + 0.5 * scale);
  ctx.lineTo(noseCenterX, noseY - 0.8 * scale);
  ctx.strokeStyle = hexWithAlpha(skinShading.specularHighlight, specAlpha * 1.08);
  ctx.lineWidth = Math.max(1.2, scale * 0.72);
  ctx.stroke();

  if (Math.abs(sinY) > 0.25) {
    // 3/4 dorsum contour line
    const dSign = sinY > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(faceCenterX + dSign * 0.6 * scale, eyeY + 0.8 * scale);
    ctx.quadraticCurveTo(
      noseCenterX + dSign * noseHalfW * 0.52,
      lerp(eyeY, noseY, 0.68),
      noseCenterX,
      noseY + 1.2 * scale
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.contourInk, 0.58);
    ctx.lineWidth = clamp(scale * 0.44, 0.8, 1.3);
    ctx.stroke();
  }

  // Nostril base shadow & alar wing curves
  ctx.beginPath();
  ctx.moveTo(noseCenterX - noseHalfW * leftForeshorten, noseY + 0.2 * scale);
  ctx.quadraticCurveTo(
    noseCenterX,
    noseY + 2.2 * scale,
    noseCenterX + noseHalfW * rightForeshorten,
    noseY + 0.2 * scale
  );
  ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, 0.56);
  ctx.lineWidth = Math.max(1, scale * 0.52);
  ctx.stroke();

  // Natural upper & lower lip vermilion scaled by lipFullnessScale
  const mouthCenterX = faceCenterX + sinY * headGeo.rx * 0.1;
  const lipHalfW = headGeo.rx * 0.25 * clamp(0.88 + 0.14 * app.lipFullnessScale, 0.75, 1.25);
  const mLeftX = mouthCenterX - lipHalfW * leftForeshorten;
  const mRightX = mouthCenterX + lipHalfW * rightForeshorten;
  const upperLipH = Math.max(1.1, headGeo.ry * 0.068 * app.lipFullnessScale);
  const lowerLipH = Math.max(1.4, headGeo.ry * 0.095 * app.lipFullnessScale);

  // Upper vermilion with gentle Cupid's bow
  ctx.beginPath();
  ctx.moveTo(mLeftX, mouthY);
  ctx.quadraticCurveTo(
    lerp(mLeftX, mouthCenterX, 0.55),
    mouthY - upperLipH * 1.18,
    mouthCenterX,
    mouthY - upperLipH * 0.78
  );
  ctx.quadraticCurveTo(
    lerp(mouthCenterX, mRightX, 0.45),
    mouthY - upperLipH * 1.18,
    mRightX,
    mouthY
  );
  ctx.quadraticCurveTo(mouthCenterX, mouthY + 0.35 * scale, mLeftX, mouthY);
  ctx.closePath();
  ctx.fillStyle = mixHexColors(skinShading.lipNatural, skinShading.lipShadow, 0.28);
  ctx.fill();

  // Lower vermilion cushion
  ctx.beginPath();
  ctx.moveTo(mLeftX + 0.4 * scale, mouthY);
  ctx.quadraticCurveTo(mouthCenterX, mouthY + lowerLipH * 1.38, mRightX - 0.4 * scale, mouthY);
  ctx.quadraticCurveTo(mouthCenterX, mouthY + 0.35 * scale, mLeftX + 0.4 * scale, mouthY);
  ctx.closePath();
  ctx.fillStyle = skinShading.lipNatural;
  ctx.fill();

  // Specular sheen on lower lip (essential on MST 8-10 deep mahogany/espresso tones)
  ctx.beginPath();
  ctx.ellipse(
    mouthCenterX,
    mouthY + lowerLipH * 0.56,
    Math.max(1.2, lipHalfW * 0.38),
    Math.max(0.55, lowerLipH * 0.28),
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.88);
  ctx.fill();

  // Oral commissure line
  ctx.beginPath();
  ctx.moveTo(mLeftX, mouthY);
  ctx.quadraticCurveTo(mouthCenterX, mouthY + 0.45 * scale, mRightX, mouthY);
  ctx.strokeStyle = skinShading.lipShadow;
  ctx.lineWidth = Math.max(0.8, scale * 0.42);
  ctx.stroke();
}

function drawFacialHairOverlay(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry,
  hairPalette: HairShadingPalette
): void {
  const style: AvatarFacialHair = frame.spec.appearance.facialHair;
  if (style === 'none' || frame.facingBack) return;

  const { scale, yawRad } = frame;
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);
  const faceCenterX = headGeo.cx + sinY * headGeo.rx * 0.34;
  const eyeY = frame.cranial.eyeLineY;
  const noseY = lerp(eyeY, headGeo.chin.y, 0.42);
  const mouthY = lerp(eyeY, headGeo.chin.y, 0.69);
  const beardBase = mixHexColors(hairPalette.base, '#191514', 0.2);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawMustacheShape = (alpha: number) => {
    const musHalfW = headGeo.rx * 0.3 * clamp(Math.abs(cosY) + 0.35, 0.45, 1.05);
    const musCenterX = faceCenterX + sinY * headGeo.rx * 0.12;
    const musY = lerp(noseY, mouthY, 0.56);
    ctx.beginPath();
    ctx.moveTo(musCenterX - musHalfW, mouthY + 0.4 * scale);
    ctx.quadraticCurveTo(
      musCenterX - musHalfW * 0.45,
      musY - 1.5 * scale,
      musCenterX,
      musY - 0.6 * scale
    );
    ctx.quadraticCurveTo(
      musCenterX + musHalfW * 0.45,
      musY - 1.5 * scale,
      musCenterX + musHalfW,
      mouthY + 0.4 * scale
    );
    ctx.quadraticCurveTo(
      musCenterX,
      musY + 1.1 * scale,
      musCenterX - musHalfW,
      mouthY + 0.4 * scale
    );
    ctx.closePath();
    ctx.fillStyle = hexWithAlpha(beardBase, alpha);
    ctx.fill();
  };

  if (style === 'stubble') {
    // Translucent 5-o'clock shadow + micro-stipples hugging morphed cheeks & jawline
    ctx.beginPath();
    ctx.moveTo(headGeo.cheekLeft.x + 1.2 * scale, headGeo.cheekLeft.y);
    ctx.quadraticCurveTo(
      headGeo.jawCornerLeft.x,
      headGeo.jawCornerLeft.y,
      headGeo.chin.x,
      headGeo.chin.y
    );
    ctx.quadraticCurveTo(
      headGeo.jawCornerRight.x,
      headGeo.jawCornerRight.y,
      headGeo.cheekRight.x - 1.2 * scale,
      headGeo.cheekRight.y
    );
    ctx.quadraticCurveTo(
      faceCenterX,
      mouthY + 1.5 * scale,
      headGeo.cheekLeft.x + 1.2 * scale,
      headGeo.cheekLeft.y
    );
    ctx.closePath();
    ctx.fillStyle = hexWithAlpha(beardBase, 0.22);
    ctx.fill();
    drawMustacheShape(0.26);

    // Fine deterministic stubble dots along morphed jaw
    ctx.fillStyle = hexWithAlpha(hairPalette.deepShadow, 0.35);
    for (let i = 0; i < 18; i++) {
      const t = (i + 0.5) / 18;
      const jx =
        t < 0.5
          ? lerp(headGeo.cheekLeft.x + 2 * scale, headGeo.chin.x, t * 2)
          : lerp(headGeo.chin.x, headGeo.cheekRight.x - 2 * scale, (t - 0.5) * 2);
      const jy =
        lerp(mouthY + 2 * scale, headGeo.chin.y - 1.2 * scale, Math.sin(t * Math.PI)) -
        (i % 3) * 0.9 * scale;
      ctx.beginPath();
      ctx.arc(jx, jy, Math.max(0.45, 0.32 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'mustache') {
    drawMustacheShape(0.92);
  } else if (style === 'goatee') {
    drawMustacheShape(0.92);
    const goatW = headGeo.rx * 0.32 * clamp(Math.abs(cosY) + 0.35, 0.48, 1);
    const goatX = lerp(faceCenterX, headGeo.chin.x, 0.55);
    ctx.beginPath();
    ctx.moveTo(goatX - goatW, mouthY + 1.6 * scale);
    ctx.quadraticCurveTo(goatX, mouthY + 2.4 * scale, goatX + goatW, mouthY + 1.6 * scale);
    ctx.quadraticCurveTo(
      goatX + goatW * 0.95,
      headGeo.chin.y + 1.2 * scale,
      goatX,
      headGeo.chin.y + 1.8 * scale
    );
    ctx.quadraticCurveTo(
      goatX - goatW * 0.95,
      headGeo.chin.y + 1.2 * scale,
      goatX - goatW,
      mouthY + 1.6 * scale
    );
    ctx.closePath();
    ctx.fillStyle = beardBase;
    ctx.fill();
  } else if (style === 'short_boxed_beard' || style === 'full_beard') {
    const isFull = style === 'full_beard';
    const dropPx = isFull ? (4.6 + 2.0 * frame.coupled.submentalFullness) * scale : 1.2 * scale;
    const outerSpread = isFull ? 1.2 * scale : 0.35 * scale;
    const sideburnTopY = lerp(headGeo.templeLeft.y, headGeo.cheekLeft.y, 0.72);
    const musCornerHalfW = headGeo.rx * 0.28 * clamp(Math.abs(cosY) + 0.35, 0.45, 1.02);
    const musCenterX = faceCenterX + sinY * headGeo.rx * 0.12;

    ctx.beginPath();
    ctx.moveTo(headGeo.cheekLeft.x + 0.3 * scale, sideburnTopY);
    ctx.quadraticCurveTo(
      headGeo.cheekLeft.x - outerSpread,
      headGeo.cheekLeft.y + 1.4 * scale,
      headGeo.jawCornerLeft.x - outerSpread,
      headGeo.jawCornerLeft.y + dropPx * 0.32
    );
    ctx.quadraticCurveTo(
      headGeo.chin.x,
      headGeo.chin.y + dropPx * 1.22,
      headGeo.jawCornerRight.x + outerSpread,
      headGeo.jawCornerRight.y + dropPx * 0.32
    );
    ctx.quadraticCurveTo(
      headGeo.cheekRight.x + outerSpread,
      headGeo.cheekRight.y + 1.4 * scale,
      headGeo.cheekRight.x - 0.3 * scale,
      sideburnTopY
    );
    // Tailored diagonal cheek line sweeping cleanly to mustache corners & framing lower lip
    ctx.quadraticCurveTo(
      lerp(headGeo.cheekRight.x, musCenterX + musCornerHalfW, 0.65),
      mouthY + (isFull ? 0.6 : 1.5) * scale,
      musCenterX + musCornerHalfW,
      mouthY + 0.4 * scale
    );
    ctx.quadraticCurveTo(
      musCenterX,
      mouthY + (isFull ? 2.4 : 2.9) * scale,
      musCenterX - musCornerHalfW,
      mouthY + 0.4 * scale
    );
    ctx.quadraticCurveTo(
      lerp(headGeo.cheekLeft.x, musCenterX - musCornerHalfW, 0.65),
      mouthY + (isFull ? 0.6 : 1.5) * scale,
      headGeo.cheekLeft.x + 0.3 * scale,
      sideburnTopY
    );
    ctx.closePath();

    const bGrad = ctx.createLinearGradient(
      headGeo.jawCornerLeft.x,
      mouthY,
      headGeo.jawCornerRight.x,
      headGeo.chin.y + dropPx
    );
    bGrad.addColorStop(0, hairPalette.highlight);
    bGrad.addColorStop(0.5, beardBase);
    bGrad.addColorStop(1, hairPalette.deepShadow);
    ctx.fillStyle = bGrad;
    ctx.fill();
    ctx.strokeStyle = hairPalette.contour;
    ctx.lineWidth = clamp(scale * 0.44, 0.8, 1.3);
    ctx.stroke();

    drawMustacheShape(0.96);
  }

  ctx.restore();
}

// ============================================================================
// 9 Gender-Free Hairstyles & Head/Face/Hair Layer Orchestrator
// ============================================================================

function drawBackHairSilhouette(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry,
  palette: HairShadingPalette,
  hatEquipped: boolean
): void {
  const style: AvatarHairStyle = frame.spec.appearance.hairStyle;
  if (style === 'buzz_shaved' || style === 'pixie_short') return;

  const { scale, yawRad } = frame;
  const sinY = Math.sin(yawRad);
  const cx = headGeo.cx - sinY * headGeo.rx * 0.12;
  const topY = hatEquipped ? headGeo.cy - headGeo.ry * 0.55 : headGeo.crown.y - headGeo.ry * 0.16;
  const lineW = clamp(scale * 0.52, 0.95, 1.6);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const makeHairFill = (minX: number, minY: number, maxX: number, maxY: number) => {
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    g.addColorStop(0, palette.highlight);
    g.addColorStop(0.45, palette.base);
    g.addColorStop(0.82, palette.midShadow);
    g.addColorStop(1, palette.deepShadow);
    return g;
  };

  if (style === 'type4_coily_afro') {
    const haloRx = headGeo.rx * (hatEquipped ? 1.24 : 1.48);
    const haloRy = headGeo.ry * (hatEquipped ? 0.96 : 1.38);
    const hCy = hatEquipped ? headGeo.cy - headGeo.ry * 0.05 : headGeo.cy - headGeo.ry * 0.18;
    const lobes = 22;

    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const a0 = (i / lobes) * Math.PI * 2;
      const a1 = ((i + 0.5) / lobes) * Math.PI * 2;
      const a2 = ((i + 1) / lobes) * Math.PI * 2;
      const p0x = cx + Math.cos(a0) * haloRx;
      const p0y = hCy + Math.sin(a0) * haloRy;
      const pCtrlX = cx + Math.cos(a1) * haloRx * 1.11;
      const pCtrlY = hCy + Math.sin(a1) * haloRy * 1.11;
      const p2x = cx + Math.cos(a2) * haloRx;
      const p2y = hCy + Math.sin(a2) * haloRy;
      if (i === 0) ctx.moveTo(p0x, p0y);
      ctx.quadraticCurveTo(pCtrlX, pCtrlY, p2x, p2y);
    }
    ctx.closePath();
    ctx.fillStyle = makeHairFill(cx - haloRx, hCy - haloRy, cx + haloRx, hCy + haloRy);
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Volumetric Type-4 C-coil cluster micro-arcs
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.52);
    ctx.lineWidth = Math.max(0.85, scale * 0.45);
    for (let ring = 0; ring < 2; ring++) {
      const rMul = ring === 0 ? 0.78 : 0.52;
      const count = ring === 0 ? 12 : 8;
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2 + ring * 0.4;
        const kx = cx + Math.cos(ang) * haloRx * rMul;
        const ky = hCy + Math.sin(ang) * haloRy * rMul;
        ctx.beginPath();
        ctx.arc(kx, ky, Math.max(1.6, scale * 1.35), ang, ang + Math.PI * 1.25);
        ctx.stroke();
      }
    }
  } else if (style === 'straight_bob') {
    const bobBottomY = headGeo.chin.y + 1.8 * scale;
    const bobW = headGeo.rx * 1.22;
    ctx.beginPath();
    ctx.moveTo(cx - bobW * 0.88, topY + headGeo.ry * 0.3);
    ctx.quadraticCurveTo(cx, topY - 1 * scale, cx + bobW * 0.88, topY + headGeo.ry * 0.3);
    ctx.lineTo(cx + bobW * 1.04, bobBottomY);
    ctx.quadraticCurveTo(cx, bobBottomY + 2.2 * scale, cx - bobW * 1.04, bobBottomY);
    ctx.closePath();
    ctx.fillStyle = makeHairFill(cx - bobW, topY, cx + bobW, bobBottomY);
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();
  } else if (style === 'long_straight') {
    const bottomY = frame.chestRing.center.y + 2 * scale;
    const topW = headGeo.rx * 1.18;
    const botW = Math.max(headGeo.rx * 1.36, frame.clavicleRing.rx * 0.78);

    ctx.beginPath();
    ctx.moveTo(cx - topW, headGeo.cy - headGeo.ry * 0.25);
    ctx.quadraticCurveTo(cx, topY, cx + topW, headGeo.cy - headGeo.ry * 0.25);
    ctx.bezierCurveTo(
      cx + topW * 1.08,
      frame.neckBaseRing.center.y,
      cx + botW,
      lerp(frame.neckBaseRing.center.y, bottomY, 0.55),
      cx + botW * 0.96,
      bottomY
    );
    ctx.quadraticCurveTo(cx, bottomY + 4.5 * scale, cx - botW * 0.96, bottomY);
    ctx.bezierCurveTo(
      cx - botW,
      lerp(frame.neckBaseRing.center.y, bottomY, 0.55),
      cx - topW * 1.08,
      frame.neckBaseRing.center.y,
      cx - topW,
      headGeo.cy - headGeo.ry * 0.25
    );
    ctx.closePath();
    ctx.fillStyle = makeHairFill(cx - botW, topY, cx + botW, bottomY);
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Vertical sleek strand lines & glossy sheen band
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.42);
    ctx.lineWidth = Math.max(0.9, scale * 0.46);
    for (const frac of [-0.62, -0.28, 0.28, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(cx + topW * frac * 0.85, headGeo.cy);
      ctx.lineTo(cx + botW * frac * 0.9, bottomY - 2 * scale);
      ctx.stroke();
    }
  } else if (style === 'soft_wavy') {
    const bottomY = frame.chestRing.center.y + 1 * scale;
    const wBase = Math.max(headGeo.rx * 1.38, frame.clavicleRing.rx * 0.82);

    ctx.beginPath();
    ctx.moveTo(cx - headGeo.rx * 1.15, headGeo.cy - headGeo.ry * 0.2);
    ctx.quadraticCurveTo(cx, topY, cx + headGeo.rx * 1.15, headGeo.cy - headGeo.ry * 0.2);
    ctx.bezierCurveTo(
      cx + wBase * 1.08,
      headGeo.chin.y,
      cx + wBase * 0.86,
      frame.neckBaseRing.center.y + 4 * scale,
      cx + wBase * 1.04,
      bottomY - 4 * scale
    );
    ctx.quadraticCurveTo(cx, bottomY + 5 * scale, cx - wBase * 1.04, bottomY - 4 * scale);
    ctx.bezierCurveTo(
      cx - wBase * 0.86,
      frame.neckBaseRing.center.y + 4 * scale,
      cx - wBase * 1.08,
      headGeo.chin.y,
      cx - headGeo.rx * 1.15,
      headGeo.cy - headGeo.ry * 0.2
    );
    ctx.closePath();
    ctx.fillStyle = makeHairFill(cx - wBase, topY, cx + wBase, bottomY);
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Rhythmic S-wave highlight ribbons
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.46);
    ctx.lineWidth = Math.max(1, scale * 0.52);
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * headGeo.rx * 0.7, headGeo.cy);
      ctx.bezierCurveTo(
        cx + dir * wBase * 0.95,
        headGeo.chin.y,
        cx + dir * wBase * 0.55,
        frame.clavicleRing.center.y,
        cx + dir * wBase * 0.82,
        bottomY - 3 * scale
      );
      ctx.stroke();
    }
  } else if (style === 'loose_curly') {
    const bottomY = frame.clavicleRing.center.y + 6.5 * scale;
    const cWidth = headGeo.rx * 1.42;
    const cloudCenterY = lerp(topY, bottomY, 0.52);
    const puffCenters: Array<{ x: number; y: number; r: number }> = [
      { x: cx, y: headGeo.cy, r: headGeo.rx * 0.96 },
      { x: cx, y: headGeo.chin.y, r: headGeo.rx * 0.94 },
      { x: cx, y: cloudCenterY, r: headGeo.rx * 0.98 },
      { x: cx - cWidth * 0.68, y: headGeo.cy - headGeo.ry * 0.18, r: headGeo.rx * 0.54 },
      { x: cx + cWidth * 0.68, y: headGeo.cy - headGeo.ry * 0.18, r: headGeo.rx * 0.54 },
      { x: cx - cWidth * 0.8, y: headGeo.chin.y - 0.5 * scale, r: headGeo.rx * 0.56 },
      { x: cx + cWidth * 0.8, y: headGeo.chin.y - 0.5 * scale, r: headGeo.rx * 0.56 },
      { x: cx - cWidth * 0.72, y: bottomY - 3 * scale, r: headGeo.rx * 0.52 },
      { x: cx + cWidth * 0.72, y: bottomY - 3 * scale, r: headGeo.rx * 0.52 },
      { x: cx - cWidth * 0.34, y: bottomY - 1.5 * scale, r: headGeo.rx * 0.54 },
      { x: cx + cWidth * 0.34, y: bottomY - 1.5 * scale, r: headGeo.rx * 0.54 },
    ];
    if (!hatEquipped) {
      puffCenters.unshift(
        { x: cx - headGeo.rx * 0.44, y: topY + headGeo.ry * 0.24, r: headGeo.rx * 0.54 },
        { x: cx + headGeo.rx * 0.44, y: topY + headGeo.ry * 0.24, r: headGeo.rx * 0.54 }
      );
    }

    // 1. Unified curly cloud fill (no closed internal circle outlines)
    const curlFill = makeHairFill(cx - cWidth, topY, cx + cWidth, bottomY);
    ctx.fillStyle = curlFill;
    for (const pc of puffCenters) {
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, pc.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Scalloped outer contour arcs + spiral ringlet highlights
    for (const pc of puffCenters) {
      const dx = pc.x - cx;
      const dy = pc.y - cloudCenterY;
      const dist = Math.hypot(dx, dy);
      if (dist > headGeo.rx * 0.35) {
        const outAng = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.arc(pc.x, pc.y, pc.r, outAng - Math.PI * 0.48, outAng + Math.PI * 0.48);
        ctx.strokeStyle = palette.contour;
        ctx.lineWidth = lineW * 0.92;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pc.x - pc.r * 0.12, pc.y - pc.r * 0.12, pc.r * 0.48, -Math.PI * 0.65, Math.PI * 0.4);
      ctx.strokeStyle = hexWithAlpha(palette.specular, 0.46);
      ctx.lineWidth = Math.max(0.9, scale * 0.46);
      ctx.stroke();
    }
  } else if (style === 'box_braids_locs') {
    const bottomY = frame.chestRing.center.y + 3 * scale;
    const strandCount = 9;
    const ropeR = Math.max(1.5, scale * 1.45);

    for (let i = 0; i < strandCount; i++) {
      const t = (i / (strandCount - 1)) * 2 - 1; // -1 .. +1
      const startX = cx + t * headGeo.rx * 0.96;
      const startY = headGeo.cy - headGeo.ry * (0.35 - Math.abs(t) * 0.2);
      const endX = cx + t * Math.max(headGeo.rx * 1.32, frame.clavicleRing.rx * 0.75);
      const endY = bottomY - (1 - Math.abs(t)) * 2.5 * scale;

      drawCapsuleDigit(
        ctx,
        { x: startX, y: startY },
        { x: endX, y: endY },
        ropeR,
        ropeR * 0.86,
        i % 2 === 0 ? palette.base : palette.midShadow,
        palette.contour,
        Math.max(0.75, lineW * 0.72)
      );

      // Segmented braid-knot cross-ticks along each loc
      const segs = 6;
      ctx.strokeStyle = hexWithAlpha(palette.specular, 0.48);
      ctx.lineWidth = Math.max(0.7, scale * 0.36);
      for (let s = 1; s < segs; s++) {
        const u = s / segs;
        const bx = lerp(startX, endX, u);
        const by = lerp(startY, endY, u);
        ctx.beginPath();
        ctx.moveTo(bx - ropeR * 0.65, by - 0.5 * scale);
        ctx.lineTo(bx + ropeR * 0.65, by + 0.5 * scale);
        ctx.stroke();
      }
    }
  } else if (style === 'hijab_headwrap') {
    // Graceful outer fabric drape behind shoulders & upper back
    const wrapW = Math.max(headGeo.rx * 1.36, frame.clavicleRing.rx * 0.72);
    const wrapBotY = frame.clavicleRing.center.y + 5.5 * scale;

    ctx.beginPath();
    ctx.moveTo(cx - headGeo.rx * 1.14, headGeo.cy - headGeo.ry * 0.15);
    ctx.quadraticCurveTo(cx, topY - 1 * scale, cx + headGeo.rx * 1.14, headGeo.cy - headGeo.ry * 0.15);
    ctx.quadraticCurveTo(cx + wrapW, frame.neckBaseRing.center.y, cx + wrapW * 0.88, wrapBotY);
    ctx.quadraticCurveTo(cx, wrapBotY + 4.5 * scale, cx - wrapW * 0.88, wrapBotY);
    ctx.quadraticCurveTo(
      cx - wrapW,
      frame.neckBaseRing.center.y,
      cx - headGeo.rx * 1.14,
      headGeo.cy - headGeo.ry * 0.15
    );
    ctx.closePath();
    ctx.fillStyle = makeHairFill(cx - wrapW, topY, cx + wrapW, wrapBotY);
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  ctx.restore();
}

function drawFrontAndCrownHair(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  headGeo: MorphedHeadGeometry,
  palette: HairShadingPalette,
  hatEquipped: boolean
): void {
  const style: AvatarHairStyle = frame.spec.appearance.hairStyle;
  const { scale, yawRad, facingBack } = frame;
  const sinY = Math.sin(yawRad);
  const cx = headGeo.cx;
  const lineW = clamp(scale * 0.52, 0.95, 1.6);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const crownTopY = hatEquipped
    ? headGeo.crown.y + headGeo.ry * 0.16
    : headGeo.crown.y - headGeo.ry * 0.1;
  const hairlineY = headGeo.crown.y + headGeo.ry * 0.42;

  const crownGrad = ctx.createLinearGradient(
    cx - headGeo.rx,
    crownTopY,
    cx + headGeo.rx,
    headGeo.chin.y
  );
  crownGrad.addColorStop(0, palette.highlight);
  crownGrad.addColorStop(0.45, palette.base);
  crownGrad.addColorStop(0.85, palette.midShadow);
  crownGrad.addColorStop(1, palette.deepShadow);

  if (style === 'buzz_shaved') {
    // Close-cropped micro-stippled hairline & velvety skull cap
    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x + 0.4 * scale, headGeo.templeLeft.y + 1.5 * scale);
    ctx.quadraticCurveTo(
      headGeo.templeLeft.x,
      crownTopY + headGeo.ry * 0.08,
      cx,
      headGeo.crown.y - 0.5 * scale
    );
    ctx.quadraticCurveTo(
      headGeo.templeRight.x,
      crownTopY + headGeo.ry * 0.08,
      headGeo.templeRight.x - 0.4 * scale,
      headGeo.templeRight.y + 1.5 * scale
    );
    if (facingBack) {
      // Tapered nape fade on back views
      ctx.quadraticCurveTo(
        headGeo.jawCornerRight.x * 0.3 + cx * 0.7 + headGeo.rx * 0.55,
        headGeo.cy + headGeo.ry * 0.55,
        cx,
        headGeo.cy + headGeo.ry * 0.65
      );
      ctx.quadraticCurveTo(
        headGeo.jawCornerLeft.x * 0.3 + cx * 0.7 - headGeo.rx * 0.55,
        headGeo.cy + headGeo.ry * 0.55,
        headGeo.templeLeft.x + 0.4 * scale,
        headGeo.templeLeft.y + 1.5 * scale
      );
    } else {
      ctx.quadraticCurveTo(
        cx + sinY * headGeo.rx * 0.25,
        hairlineY - 1.4 * scale,
        headGeo.templeLeft.x + 0.4 * scale,
        headGeo.templeLeft.y + 1.5 * scale
      );
    }
    ctx.closePath();
    ctx.fillStyle = hexWithAlpha(palette.base, 0.74);
    ctx.fill();
    ctx.strokeStyle = hexWithAlpha(palette.contour, 0.55);
    ctx.lineWidth = Math.max(0.75, lineW * 0.65);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === 'hijab_headwrap') {
    // Modern layered editorial hijab/headwrap framing face & draping gracefully across neck/clavicle
    const wrapTopY = hatEquipped ? headGeo.crown.y + 1 * scale : headGeo.crown.y - 2.6 * scale;
    const outerRx = headGeo.rx * 1.18;
    const drapeBottomY = frame.clavicleRing.front.y + 4.8 * scale;

    if (!facingBack) {
      // Inner underscarf band across forehead
      ctx.beginPath();
      ctx.moveTo(headGeo.templeLeft.x - 0.5 * scale, headGeo.templeLeft.y + 1 * scale);
      ctx.quadraticCurveTo(
        cx + sinY * headGeo.rx * 0.2,
        hairlineY - 2.2 * scale,
        headGeo.templeRight.x + 0.5 * scale,
        headGeo.templeRight.y + 1 * scale
      );
      ctx.quadraticCurveTo(
        cx,
        wrapTopY + 2 * scale,
        headGeo.templeLeft.x - 0.5 * scale,
        headGeo.templeLeft.y + 1 * scale
      );
      ctx.closePath();
      ctx.fillStyle = palette.deepShadow;
      ctx.fill();
    }

    // Outer wrap crown + neck/collar drape leaving morphed cheeks & chin visible in front!
    ctx.beginPath();
    ctx.moveTo(cx - outerRx, headGeo.cy);
    ctx.quadraticCurveTo(cx - outerRx * 0.95, wrapTopY, cx, wrapTopY);
    ctx.quadraticCurveTo(cx + outerRx * 0.95, wrapTopY, cx + outerRx, headGeo.cy);
    ctx.quadraticCurveTo(
      cx + outerRx * 1.06,
      frame.neckBaseRing.center.y,
      cx + outerRx * 0.92,
      drapeBottomY - 2.5 * scale
    );
    ctx.quadraticCurveTo(cx, drapeBottomY + 3.5 * scale, cx - outerRx * 0.92, drapeBottomY - 2.5 * scale);
    ctx.quadraticCurveTo(cx - outerRx * 1.06, frame.neckBaseRing.center.y, cx - outerRx, headGeo.cy);
    ctx.closePath();

    if (!facingBack) {
      // Carve clean face opening around morphed cheeks, jaw & submental contour
      const subOffset = Math.max(0, frame.coupled.submentalFullness) * 3.8 * scale;
      ctx.moveTo(headGeo.templeLeft.x + 0.6 * scale, headGeo.templeLeft.y + 0.5 * scale);
      ctx.quadraticCurveTo(
        headGeo.cheekLeft.x - 0.4 * scale,
        headGeo.cheekLeft.y,
        headGeo.jawCornerLeft.x,
        headGeo.jawCornerLeft.y + 0.8 * scale
      );
      ctx.quadraticCurveTo(
        headGeo.chin.x,
        headGeo.chin.y + 1.8 * scale + subOffset,
        headGeo.jawCornerRight.x,
        headGeo.jawCornerRight.y + 0.8 * scale
      );
      ctx.quadraticCurveTo(
        headGeo.cheekRight.x + 0.4 * scale,
        headGeo.cheekRight.y,
        headGeo.templeRight.x - 0.6 * scale,
        headGeo.templeRight.y + 0.5 * scale
      );
      ctx.quadraticCurveTo(
        cx + sinY * headGeo.rx * 0.2,
        hairlineY - 0.5 * scale,
        headGeo.templeLeft.x + 0.6 * scale,
        headGeo.templeLeft.y + 0.5 * scale
      );
      ctx.closePath();
    }

    ctx.fillStyle = crownGrad;
    ctx.fill('evenodd');
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Soft diagonal fabric fold creases across neck wrap
    ctx.beginPath();
    ctx.moveTo(cx - outerRx * 0.72, frame.neckBaseRing.center.y - 1 * scale);
    ctx.quadraticCurveTo(
      cx + 1.5 * scale,
      drapeBottomY + 0.5 * scale,
      cx + outerRx * 0.78,
      frame.neckBaseRing.center.y + 1.2 * scale
    );
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.42);
    ctx.lineWidth = Math.max(0.9, scale * 0.48);
    ctx.stroke();

    ctx.restore();
    return;
  }

  if (facingBack) {
    // Full posterior cranial hair dome for back views (+-135, 180)
    const backBottomY =
      style === 'pixie_short'
        ? headGeo.cy + headGeo.ry * 0.72
        : headGeo.chin.y + 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x - 1.4 * scale, headGeo.cy);
    ctx.quadraticCurveTo(
      headGeo.templeLeft.x - 1 * scale,
      crownTopY - 1.5 * scale,
      cx,
      crownTopY - 2 * scale
    );
    ctx.quadraticCurveTo(
      headGeo.templeRight.x + 1 * scale,
      crownTopY - 1.5 * scale,
      headGeo.templeRight.x + 1.4 * scale,
      headGeo.cy
    );
    ctx.quadraticCurveTo(cx + headGeo.rx * 0.85, backBottomY, cx, backBottomY + 1.2 * scale);
    ctx.quadraticCurveTo(
      cx - headGeo.rx * 0.85,
      backBottomY,
      headGeo.templeLeft.x - 1.4 * scale,
      headGeo.cy
    );
    ctx.closePath();
    ctx.fillStyle = crownGrad;
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Front / Quarter / Profile crown & face-framing hair layers
  if (style === 'pixie_short') {
    const quiffLift = hatEquipped ? 0 : 2.6 * scale;
    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x - 0.8 * scale, headGeo.templeLeft.y + 3 * scale);
    ctx.quadraticCurveTo(
      headGeo.templeLeft.x - 1.4 * scale,
      crownTopY - quiffLift,
      cx + 1.5 * scale,
      crownTopY - quiffLift * 1.15
    );
    ctx.quadraticCurveTo(
      headGeo.templeRight.x + 1.4 * scale,
      crownTopY - quiffLift * 0.7,
      headGeo.templeRight.x + 0.8 * scale,
      headGeo.templeRight.y + 3 * scale
    );
    // Textured layered fringe across upper forehead
    ctx.quadraticCurveTo(
      cx + headGeo.rx * 0.35,
      hairlineY + 0.8 * scale,
      cx - headGeo.rx * 0.12,
      hairlineY - 1.4 * scale
    );
    ctx.quadraticCurveTo(
      cx - headGeo.rx * 0.52,
      hairlineY + 0.6 * scale,
      headGeo.templeLeft.x - 0.8 * scale,
      headGeo.templeLeft.y + 3 * scale
    );
    ctx.closePath();
    ctx.fillStyle = crownGrad;
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Glossy crown highlight arc
    ctx.beginPath();
    ctx.moveTo(cx - headGeo.rx * 0.55, crownTopY + 2 * scale);
    ctx.quadraticCurveTo(cx, crownTopY + 0.5 * scale, cx + headGeo.rx * 0.55, crownTopY + 2.4 * scale);
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.5);
    ctx.lineWidth = Math.max(1, scale * 0.55);
    ctx.stroke();
  } else if (style === 'type4_coily_afro') {
    // Upper hairline coily cloud framing forehead & temples without hiding eyebrows
    const topR = hatEquipped ? headGeo.rx * 1.05 : headGeo.rx * 1.24;
    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x - 2.2 * scale, headGeo.templeLeft.y + 2.5 * scale);
    ctx.quadraticCurveTo(cx - topR, crownTopY - 3 * scale, cx, crownTopY - (hatEquipped ? 0 : 4.5 * scale));
    ctx.quadraticCurveTo(
      cx + topR,
      crownTopY - 3 * scale,
      headGeo.templeRight.x + 2.2 * scale,
      headGeo.templeRight.y + 2.5 * scale
    );
    ctx.quadraticCurveTo(
      cx + headGeo.rx * 0.45,
      hairlineY - 1.8 * scale,
      cx,
      hairlineY - 1.2 * scale
    );
    ctx.quadraticCurveTo(
      cx - headGeo.rx * 0.45,
      hairlineY - 1.8 * scale,
      headGeo.templeLeft.x - 2.2 * scale,
      headGeo.templeLeft.y + 2.5 * scale
    );
    ctx.closePath();
    ctx.fillStyle = crownGrad;
    ctx.fill();

    // Micro-coil texture along hairline
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.52);
    ctx.lineWidth = Math.max(0.85, scale * 0.44);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(
        cx + i * headGeo.rx * 0.34,
        crownTopY + 2.2 * scale + Math.abs(i) * 0.7 * scale,
        Math.max(1.5, scale * 1.2),
        0.2,
        Math.PI * 1.35
      );
      ctx.stroke();
    }
  } else if (style === 'box_braids_locs') {
    // Clean center/side scalp part + face-framing front braided locs
    const partX = cx + sinY * headGeo.rx * 0.16;
    const ropeR = Math.max(1.45, scale * 1.38);
    const endY = frame.clavicleRing.front.y + 4 * scale;

    // Crown root base with clean scalp parting line
    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x - 1 * scale, headGeo.templeLeft.y + 1.5 * scale);
    ctx.quadraticCurveTo(cx, crownTopY - 1.5 * scale, headGeo.templeRight.x + 1 * scale, headGeo.templeRight.y + 1.5 * scale);
    ctx.quadraticCurveTo(partX, hairlineY - 1.8 * scale, headGeo.templeLeft.x - 1 * scale, headGeo.templeLeft.y + 1.5 * scale);
    ctx.closePath();
    ctx.fillStyle = crownGrad;
    ctx.fill();

    // Crisp scalp parting line
    ctx.beginPath();
    ctx.moveTo(partX, crownTopY + 0.5 * scale);
    ctx.lineTo(partX, hairlineY - 1.5 * scale);
    ctx.strokeStyle = hexWithAlpha(frame.skinShading.base, 0.78);
    ctx.lineWidth = Math.max(0.9, scale * 0.45);
    ctx.stroke();

    // Face-framing front braids on left & right temples
    for (const sideCfg of [
      { sx: headGeo.templeLeft.x - 0.6 * scale, ex: headGeo.jawCornerLeft.x - 2.6 * scale },
      { sx: headGeo.templeLeft.x - 2.4 * scale, ex: headGeo.jawCornerLeft.x - 4.8 * scale },
      { sx: headGeo.templeRight.x + 0.6 * scale, ex: headGeo.jawCornerRight.x + 2.6 * scale },
      { sx: headGeo.templeRight.x + 2.4 * scale, ex: headGeo.jawCornerRight.x + 4.8 * scale },
    ]) {
      drawCapsuleDigit(
        ctx,
        { x: sideCfg.sx, y: headGeo.templeLeft.y + 1 * scale },
        { x: sideCfg.ex, y: endY },
        ropeR,
        ropeR * 0.85,
        palette.base,
        palette.contour,
        Math.max(0.75, lineW * 0.72)
      );
    }
  } else {
    // straight_bob, long_straight, soft_wavy, loose_curly: parted crown + face-framing locks
    const partX = cx - headGeo.rx * 0.14 + sinY * headGeo.rx * 0.2;
    const lockBottomY =
      style === 'straight_bob'
        ? headGeo.chin.y + 1.6 * scale
        : frame.clavicleRing.front.y + 3 * scale;

    ctx.beginPath();
    ctx.moveTo(headGeo.templeLeft.x - 2.2 * scale, lockBottomY);
    ctx.bezierCurveTo(
      headGeo.templeLeft.x - 3 * scale,
      headGeo.cheekLeft.y,
      headGeo.templeLeft.x - 2 * scale,
      crownTopY,
      partX,
      crownTopY - (hatEquipped ? 0 : 1.6 * scale)
    );
    ctx.bezierCurveTo(
      headGeo.templeRight.x + 2 * scale,
      crownTopY,
      headGeo.templeRight.x + 3 * scale,
      headGeo.cheekRight.y,
      headGeo.templeRight.x + 2.2 * scale,
      lockBottomY
    );
    // Inner face-framing curtain sweep leaving cheeks & eyes clear
    ctx.quadraticCurveTo(
      headGeo.cheekRight.x + 0.8 * scale,
      headGeo.cheekRight.y,
      headGeo.templeRight.x - 0.6 * scale,
      hairlineY + 1.2 * scale
    );
    ctx.quadraticCurveTo(partX + 1.5 * scale, hairlineY - 2.2 * scale, partX, hairlineY - 1.2 * scale);
    ctx.quadraticCurveTo(
      headGeo.templeLeft.x + 0.6 * scale,
      hairlineY + 1.2 * scale,
      headGeo.cheekLeft.x - 0.8 * scale,
      headGeo.cheekLeft.y
    );
    ctx.quadraticCurveTo(
      headGeo.templeLeft.x - 0.8 * scale,
      lerp(headGeo.cheekLeft.y, lockBottomY, 0.6),
      headGeo.templeLeft.x - 2.2 * scale,
      lockBottomY
    );
    ctx.closePath();

    ctx.fillStyle = crownGrad;
    ctx.fill();
    ctx.strokeStyle = palette.contour;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Glossy studio hair halo sheen
    ctx.beginPath();
    ctx.moveTo(cx - headGeo.rx * 0.68, crownTopY + 3.2 * scale);
    ctx.quadraticCurveTo(cx, crownTopY + 1.2 * scale, cx + headGeo.rx * 0.68, crownTopY + 3.4 * scale);
    ctx.strokeStyle = hexWithAlpha(palette.specular, 0.52);
    ctx.lineWidth = Math.max(1.1, scale * 0.65);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders the multi-ethnic head, high-BMI coupled cheeks/jaw/submental double-chin volume,
 * MST 10x4 adaptive facial planes, optional feathered face photo composite, 6 facial hairs,
 * and 9 gender-free hairstyles across all 8 angles.
 */
export function drawIsometricHeadFaceAndHair(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  options?: DrawHeadFaceHairOptions
): void {
  const drawPhase = options?.drawPhase ?? 'all';
  const hatEquipped = Boolean(options?.hatEquipped);
  const headGeo = buildMorphedHeadGeometry(frame);
  const hairPalette = computeHairShadingPalette(
    frame.spec.appearance.hairColorHex,
    frame.theme
  );

  // When facing front/side, back_hair sits behind head & shoulders; when facing back, hair cascade sits in front!
  if (drawPhase === 'back_hair') {
    if (!frame.facingBack) {
      drawBackHairSilhouette(ctx, frame, headGeo, hairPalette, hatEquipped);
    }
    return;
  }

  if (drawPhase === 'all' && !frame.facingBack) {
    drawBackHairSilhouette(ctx, frame, headGeo, hairPalette, hatEquipped);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { skinShading, coupled, scale, cranial, spec } = frame;
  const hideEars = spec.appearance.hairStyle === 'hijab_headwrap';
  const contourW = clamp(scale * 0.56, 1.0, 1.75);
  const specAlpha = getSkinSpecularAlpha(skinShading);
  const rimAlpha = getSkinRimAlpha(skinShading, frame.theme);

  // 1. Far ear (if visible and behind cheek plane)
  const sinY = Math.sin(frame.yawRad);
  if (!hideEars) {
    if (sinY >= 0 && cranial.earLeftVisible) {
      drawEar(ctx, cranial.earLeft, true, frame);
    } else if (sinY < 0 && cranial.earRightVisible) {
      drawEar(ctx, cranial.earRight, false, frame);
    }
  }

  // 2. High-BMI Submental (under-chin / double-chin) soft-tissue volume between chin & neck
  drawSubmentalUnderChinVolume(ctx, frame, headGeo);

  // 3. Morphed Cranium & Lower Face (5 headShapes + cheekFullness + jawSoftness)
  traceSmoothClosedPolygon(ctx, headGeo.contourPoints);
  const faceGrad = ctx.createLinearGradient(
    headGeo.cheekLeft.x,
    headGeo.crown.y,
    headGeo.cheekRight.x,
    headGeo.chin.y
  );
  faceGrad.addColorStop(0, skinShading.highlight);
  faceGrad.addColorStop(0.42, skinShading.base);
  faceGrad.addColorStop(0.75, skinShading.subsurface);
  faceGrad.addColorStop(1, skinShading.midShadow);
  ctx.fillStyle = faceGrad;
  ctx.fill();

  // Internal MST 10x4 facial plane highlights (brow, cheekbones, Fresnel rim)
  ctx.save();
  ctx.clip();

  if (!frame.facingBack) {
    // Forehead / brow ridge warm highlight
    const browGrad = ctx.createRadialGradient(
      headGeo.cx + sinY * headGeo.rx * 0.2,
      cranial.browLineY - headGeo.ry * 0.22,
      headGeo.rx * 0.08,
      headGeo.cx + sinY * headGeo.rx * 0.2,
      cranial.browLineY - headGeo.ry * 0.2,
      headGeo.rx * 0.72
    );
    browGrad.addColorStop(0, hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.78));
    browGrad.addColorStop(1, hexWithAlpha(skinShading.specularHighlight, 0));
    ctx.fillStyle = browGrad;
    ctx.fillRect(
      headGeo.cx - headGeo.rx * 1.4,
      headGeo.crown.y,
      headGeo.rx * 2.8,
      headGeo.ry * 1.3
    );

    // Malar cheekbone highlights & subsurface warmth (widens with cheekFullness)
    const cheekSpots = [
      { x: lerp(headGeo.cx, headGeo.cheekLeft.x, 0.62), y: headGeo.cheekLeft.y - 1.5 * scale },
      { x: lerp(headGeo.cx, headGeo.cheekRight.x, 0.62), y: headGeo.cheekRight.y - 1.5 * scale },
    ];
    for (const cs of cheekSpots) {
      const rCheek = Math.max(3.5, headGeo.rx * 0.34 * coupled.cheekFullness);
      const cGrad = ctx.createRadialGradient(cs.x, cs.y, 0.5, cs.x, cs.y, rCheek);
      cGrad.addColorStop(0, hexWithAlpha(skinShading.specularHighlight, specAlpha * 0.85));
      cGrad.addColorStop(0.55, hexWithAlpha(skinShading.subsurface, 0.28));
      cGrad.addColorStop(1, hexWithAlpha(skinShading.subsurface, 0));
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(cs.x, cs.y, rCheek, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Occipital / nape subtle shading on back views
    const napeGrad = ctx.createLinearGradient(
      headGeo.cx,
      headGeo.cy,
      headGeo.cx,
      headGeo.chin.y
    );
    napeGrad.addColorStop(0, hexWithAlpha(skinShading.midShadow, 0));
    napeGrad.addColorStop(1, hexWithAlpha(skinShading.deepShadow, 0.42));
    ctx.fillStyle = napeGrad;
    ctx.fillRect(
      headGeo.cx - headGeo.rx * 1.4,
      headGeo.cy,
      headGeo.rx * 2.8,
      headGeo.ry * 1.4
    );
  }

  // Grazing Fresnel rim light around cranial/jaw edge
  traceSmoothClosedPolygon(ctx, headGeo.contourPoints);
  ctx.strokeStyle = hexWithAlpha(skinShading.rimLight, rimAlpha);
  ctx.lineWidth = Math.max(1.5, scale * 0.9);
  ctx.stroke();

  ctx.restore();

  // Optional Feathered Face Photo Composite (when |angleDeg| <= 65)
  const resolvedPhoto =
    options?.faceImage ?? getCachedFacePhotoImage(spec.appearance.facePhotoUrl);
  const compositedPhoto = resolvedPhoto
    ? drawFeatheredFacePhotoComposite(ctx, frame, headGeo, resolvedPhoto)
    : false;

  // Crisp editorial cranial & jaw contour ink
  traceSmoothClosedPolygon(ctx, headGeo.contourPoints);
  ctx.strokeStyle = skinShading.contourInk;
  ctx.lineWidth = contourW;
  ctx.stroke();

  // High-BMI primary mentalis chin crease when submental fullness is present
  if (!frame.facingBack && coupled.submentalFullness >= 0.24) {
    const creaseAlpha = clamp((coupled.submentalFullness - 0.2) * 0.55, 0.08, 0.45);
    const creaseW = headGeo.rx * (0.28 + 0.16 * coupled.submentalFullness);
    ctx.beginPath();
    ctx.moveTo(headGeo.chin.x - creaseW, headGeo.chin.y - 1.1 * scale);
    ctx.quadraticCurveTo(
      headGeo.chin.x,
      headGeo.chin.y + 0.9 * scale,
      headGeo.chin.x + creaseW,
      headGeo.chin.y - 1.1 * scale
    );
    ctx.strokeStyle = hexWithAlpha(skinShading.deepShadow, creaseAlpha);
    ctx.lineWidth = Math.max(0.85, scale * 0.45);
    ctx.stroke();
  }

  // 4. Near ear (drawn over lateral head contour when visible)
  if (!hideEars) {
    if (sinY >= 0 && cranial.earRightVisible) {
      drawEar(ctx, cranial.earRight, false, frame);
    } else if (sinY < 0 && cranial.earLeftVisible) {
      drawEar(ctx, cranial.earLeft, true, frame);
    }
  }

  // 5. Multi-ethnic facial features (rendered unless photo already supplies facial features)
  if (!compositedPhoto) {
    drawMultiEthnicFacialFeatures(ctx, frame, headGeo, hairPalette);
  }

  // 6. Facial hair following morphed jaw/cheek/chin contour
  if (!compositedPhoto || spec.appearance.facialHair !== 'none') {
    drawFacialHairOverlay(ctx, frame, headGeo, hairPalette);
  }

  // 7. Crown & Front Hair (plus full back cascade when viewing from behind!)
  drawFrontAndCrownHair(ctx, frame, headGeo, hairPalette, hatEquipped);
  if (frame.facingBack) {
    drawBackHairSilhouette(ctx, frame, headGeo, hairPalette, hatEquipped);
  }

  ctx.restore();
}

// ============================================================================
// Convenience Standalone Studio Avatar Renderer
// ============================================================================

/**
 * Renders the complete studio plinth + full coupled isometric avatar in canonical 8-direction Z-order.
 */
export function renderStandaloneIsometricAvatar(
  ctx: CanvasRenderingContext2D,
  options: RenderStandaloneAvatarOptions
): IsometricBodyFrame {
  const theme: 'light' | 'dark' = options.theme === 'dark' ? 'dark' : 'light';
  const frame = computeIsometricBodyFrame({
    spec: options.spec,
    angleDeg: options.angleDeg,
    width: options.width,
    height: options.height,
    compact: options.compact,
    theme,
  });

  if (options.clearCanvas !== false) {
    ctx.clearRect(0, 0, frame.width, frame.height);
  }

  if (options.drawBackdrop !== false) {
    ctx.save();
    const bgGrad = ctx.createRadialGradient(
      frame.centerX,
      frame.height * 0.42,
      frame.width * 0.08,
      frame.centerX,
      frame.height * 0.5,
      Math.max(frame.width, frame.height) * 0.78
    );
    if (theme === 'dark') {
      bgGrad.addColorStop(0, '#22242A');
      bgGrad.addColorStop(1, '#17181C');
    } else {
      // Luminous airy white studio backdrop keeping overall stage brightness > 240 (> 225)
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(1, '#F6F7FA');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.restore();
  }

  if (options.drawPlinth !== false) {
    drawIsometricStudioPlinth(ctx, frame, theme);
  }

  // Back hair behind neck/shoulders when facing front/quarter/profile
  if (!frame.facingBack) {
    drawIsometricHeadFaceAndHair(ctx, frame, {
      hatEquipped: options.hatEquipped,
      faceImage: options.faceImage,
      drawPhase: 'back_hair',
    });
  }

  // Far limbs behind torso
  drawIsometricLimbSegment(ctx, frame, 'leg', frame.farLegSide);
  drawIsometricLimbSegment(ctx, frame, 'arm', frame.farArmSide);

  // Sculpted torso, neck & near leg
  drawIsometricTorsoAndNeck(ctx, frame);
  drawIsometricLimbSegment(ctx, frame, 'leg', frame.nearLegSide);

  // Sleek neutral minimal athletic basewear leaving neck, arms, hands, waist/belly, legs & feet bare
  drawIsometricMinimalBasewear(ctx, frame, options.coverageFlags);

  // Foreground near arm
  drawIsometricLimbSegment(ctx, frame, 'arm', frame.nearArmSide);

  // Head, multi-ethnic features, coupled submental/cheek fullness & crown/front/back hair
  drawIsometricHeadFaceAndHair(ctx, frame, {
    hatEquipped: options.hatEquipped,
    faceImage: options.faceImage,
    drawPhase: frame.facingBack ? 'all' : 'head_and_front_hair',
  });

  return frame;
}
