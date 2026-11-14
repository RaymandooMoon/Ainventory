import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { hexToRgb, rgbToHex } from '../shared/colorMath.js';
import {
  getNativeSeedHex,
  getStudioSeedImageForGarment,
  resolveStudioSeedUrl,
} from '../shared/garmentTaxonomy.js';
import type {
  IsoArmChain,
  IsoCrossSectionRing,
  IsoLegChain,
  IsometricBodyFrame,
  Point2D,
} from './isometricBodyRig.ts';

// ============================================================================
// Public Types & Interfaces
// ============================================================================

export type GarmentSlotRole =
  | 'swimwear'
  | 'top'
  | 'bottom'
  | 'onepiece'
  | 'outer'
  | 'shoes'
  | 'headwear'
  | 'neckwear'
  | 'gloves'
  | 'eyewear'
  | 'belt'
  | 'watch'
  | 'bag'
  | 'socks';

export type GarmentSleeveMode = 'sleeveless' | 'short' | 'three_quarter' | 'long';

export type GarmentBottomMode =
  | 'bikini_brief'
  | 'swim_trunks'
  | 'shorts'
  | 'bermuda'
  | 'mini_skirt'
  | 'midi_skirt'
  | 'slim_pants'
  | 'wide_pants'
  | 'cargo_pants';

export type GarmentShoeMode =
  | 'flip_flops'
  | 'strap_sandals'
  | 'slides'
  | 'low_shoes'
  | 'heels'
  | 'ankle_boots'
  | 'long_boots'
  | 'snow_boots';

export type BottomShoeOverlapMode = 'pants_over_shoes' | 'boots_over_pants';

export interface GarmentInputRecord extends Partial<GarmentRecord> {
  name_en?: string | null;
  sleeveLength?: string | null;
  hemLength?: string | null;
  shoeExposure?: string | null;
  fit?: string | null;
  silhouette?: string | null;
}

export interface NormalizedRowSpan {
  v: number;
  uLeft: number;
  uRight: number;
  width: number;
  coverage: number;
  hasCenterGap: boolean;
  leftBranchEnd: number;
  rightBranchStart: number;
}

export interface GarmentCutoutAsset {
  cacheKey: string;
  resolvedUrl: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  cropBox: { x: number; y: number; w: number; h: number };
  rowSpans: NormalizedRowSpan[];
  colCoverages: number[];
  collarOpeningWidth: number;
  uLeftShoulder: number;
  uRightShoulder: number;
  vShoulderPeak: number;
  hasDetectedSleeves: boolean;
  uTorsoLeft: number;
  uTorsoRight: number;
  vSleeveStart: number;
  vSleeveEnd: number;
  cuffSpanLeft: number;
  cuffSpanRight: number;
  torsoWidthNorm: number;
  waistWidthNorm: number;
  hemWidthNorm: number;
  vCrotch: number | null;
  hasVerticalPairSplit: boolean;
  uPairSplit: number;
  upperMassCenterX: number;
  meanHex: string;
  meanRgb: { r: number; g: number; b: number };
  meanLuminance: number;
}

export type OuterWeightTier = 'cardigan_blazer_jacket' | 'coat_trench' | 'padding_puffer';

export interface GarmentGeometryClassification {
  slotRole: GarmentSlotRole;
  sleeveMode: GarmentSleeveMode;
  bottomMode: GarmentBottomMode;
  shoeMode: GarmentShoeMode;
  outerTier: OuterWeightTier;
  isSwimBottomOnly: boolean;
  isSwimOnepiece: boolean;
  isLongCoatHem: boolean;
  isBarefootVisibleShoe: boolean;
}

export interface GridWarpShadingOptions {
  theme?: 'light' | 'dark';
  scale?: number;
  yawRad?: number;
  isFarLimb?: boolean;
  keyLightAlpha?: number;
  shadowAlpha?: number;
  contourAlpha?: number;
  contactShadowPx?: number;
}

export interface UpperGarmentDrawPass {
  farSleeve: () => void;
  bodyTorso: () => void;
  nearSleeve: () => void;
}

export interface BottomGarmentDrawPass {
  farLegPanel: () => void;
  nearLegPanel: () => void;
  isSkirt: boolean;
}

export interface ShoeGarmentDrawPass {
  farShoe: () => void;
  nearShoe: () => void;
}

export interface PairedLimbDrawPass {
  farLayer: () => void;
  nearLayer: () => void;
}

// ============================================================================
// Math & Color Helpers
// ============================================================================

const MAX_CUTOUT_SIDE_PX = 360;
const ROW_LANDMARK_BANDS = 32;
const MAX_GARMENT_CUTOUT_CACHE = 72;

const garmentCutoutCache = new Map<string, GarmentCutoutAsset>();
const garmentCutoutInflight = new Map<string, Promise<GarmentCutoutAsset | null>>();

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

function smoothstep(e0: number, e1: number, x: number): number {
  if (Math.abs(e1 - e0) < 1e-6) return x >= e1 ? 1 : 0;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rgbDist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function isValidHexColor(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim());
}

function normalizeHexColor(raw: string): string {
  const rgb = hexToRgb(raw.trim());
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function fingerprintUrlKey(url: string): string {
  if (url.length <= 140) return url;
  return `len:${url.length}:${url.slice(0, 56)}:${url.slice(-56)}`;
}

function readCutoutCacheLru(key: string): GarmentCutoutAsset | null {
  const hit = garmentCutoutCache.get(key);
  if (!hit) return null;
  garmentCutoutCache.delete(key);
  garmentCutoutCache.set(key, hit);
  return hit;
}

function writeCutoutCacheLru(key: string, asset: GarmentCutoutAsset): void {
  if (garmentCutoutCache.has(key)) {
    garmentCutoutCache.delete(key);
  }
  while (garmentCutoutCache.size >= MAX_GARMENT_CUTOUT_CACHE) {
    const oldestKey = garmentCutoutCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = garmentCutoutCache.get(oldestKey);
    garmentCutoutCache.delete(oldestKey);
    if (evicted?.canvas) {
      evicted.canvas.width = 0;
      evicted.canvas.height = 0;
    }
  }
  garmentCutoutCache.set(key, asset);
}

/**
 * Invalidates cached `GarmentCutoutAsset` entries (either for a specific `itemId` or all entries).
 */
export function invalidateGarmentCutoutCache(itemId?: number | string | null): void {
  if (itemId === undefined || itemId === null || itemId === '') {
    for (const entry of garmentCutoutCache.values()) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    garmentCutoutCache.clear();
    return;
  }
  const prefix = `${String(itemId)}|`;
  for (const [key, entry] of garmentCutoutCache.entries()) {
    if (key.startsWith(prefix)) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      garmentCutoutCache.delete(key);
    }
  }
}

// ============================================================================
// 1. Cutout URL Resolution, Border Flood-Fill, Color-Sync & Alpha Landmarks
// ============================================================================

function isRasterImageExtension(url: string): boolean {
  return /\.(png|jpe?g|webp|avif|gif)(\?.*)?$/i.test(url);
}

export function resolveGarmentPhotoUrl(garment: GarmentInputRecord | null | undefined): string {
  const cat = String(garment?.category || 'top').trim() || 'top';
  const sub = String(garment?.subcategory || 'knit').trim() || 'knit';
  const rawUrl = typeof garment?.image_url === 'string' ? garment.image_url.trim() : '';

  if (
    rawUrl.startsWith('data:image/') &&
    !rawUrl.startsWith('data:image/svg+xml')
  ) {
    return rawUrl;
  }

  if (
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl.startsWith('/uploads/') ||
    rawUrl.startsWith('/seed/s4/')
  ) {
    return rawUrl;
  }

  if (rawUrl.startsWith('/seed/') && isRasterImageExtension(rawUrl)) {
    return resolveStudioSeedUrl(
      {
        image_url: rawUrl,
        name: garment?.name,
        category: cat,
        subcategory: sub,
      },
      cat,
      sub
    );
  }

  return resolveStudioSeedUrl(
    {
      image_url: '',
      name: garment?.name,
      category: cat,
      subcategory: sub,
    },
    cat,
    sub
  );
}

function shouldApplyGarmentSeedTint(resolvedUrl: string, rawColorHex?: string | null): boolean {
  if (!isValidHexColor(rawColorHex)) return false;

  // Never re-tint user uploads, external photos, or /seed/s4/ cutouts whose native colors are exact
  if (
    resolvedUrl.startsWith('data:image/') ||
    resolvedUrl.startsWith('blob:') ||
    resolvedUrl.startsWith('/uploads/') ||
    resolvedUrl.startsWith('http://') ||
    resolvedUrl.startsWith('https://') ||
    resolvedUrl.startsWith('/seed/s4/')
  ) {
    return false;
  }

  if (!resolvedUrl.startsWith('/seed/')) return false;
  if (
    resolvedUrl.includes('store-navy-sweater') ||
    resolvedUrl.includes('store-terracotta-cardigan')
  ) {
    return false;
  }

  const targetRgb = hexToRgb(rawColorHex);
  const nativeSeedHex = getNativeSeedHex(resolvedUrl);
  if (!nativeSeedHex) {
    return true;
  }
  const nativeRgb = hexToRgb(nativeSeedHex);
  return rgbDist(targetRgb, nativeRgb) >= 40;
}

interface CutoutFloodProfile {
  distLimit: number;
  stepLimit: number;
  shadowLumDrop: number;
  chromaLimit: number;
}

const CUTOUT_PROFILES: readonly CutoutFloodProfile[] = [
  { distLimit: 26, stepLimit: 12.0, shadowLumDrop: 62, chromaLimit: 0.056 },
  { distLimit: 15, stepLimit: 6.5, shadowLumDrop: 22, chromaLimit: 0.028 },
  { distLimit: 9.5, stepLimit: 4.4, shadowLumDrop: 8, chromaLimit: 0.015 },
  { distLimit: 5.5, stepLimit: 2.8, shadowLumDrop: 0, chromaLimit: 0 },
];

function runBorderFloodFill(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  bgR: number,
  bgG: number,
  bgB: number,
  profile: CutoutFloodProfile
): { bgMask: Uint8Array; bgCount: number; coreBgRatio: number } {
  const { distLimit, stepLimit, shadowLumDrop, chromaLimit } = profile;
  const nPx = w * h;
  const bgMask = new Uint8Array(nPx);
  const queue = new Int32Array(nPx);
  let head = 0;
  let tail = 0;

  const bgLum = Math.max(1, 0.299 * bgR + 0.587 * bgG + 0.114 * bgB);
  const bgRn = bgR / bgLum;
  const bgGn = bgG / bgLum;
  const bgBn = bgB / bgLum;

  const tryAccept = (p: number, fromP: number): void => {
    if (bgMask[p]) return;
    const i = p * 4;
    if (d[i + 3] < 16) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    if (fromP >= 0) {
      const fi = fromP * 4;
      const stepDist = Math.hypot(r - d[fi], g - d[fi + 1], b - d[fi + 2]);
      if (stepDist > stepLimit) return;
    }

    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    if (dist <= distLimit) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }

    if (shadowLumDrop > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= bgLum - shadowLumDrop && lum <= bgLum + 14 && lum > 30) {
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat <= 26) {
          const chromaDist = Math.hypot(r / lum - bgRn, g / lum - bgGn, b / lum - bgBn);
          if (chromaDist <= chromaLimit) {
            bgMask[p] = 1;
            queue[tail++] = p;
          }
        }
      }
    }
  };

  for (let x = 0; x < w; x++) {
    tryAccept(x, -1);
    tryAccept((h - 1) * w + x, -1);
  }
  for (let y = 1; y < h - 1; y++) {
    tryAccept(y * w, -1);
    tryAccept(y * w + (w - 1), -1);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryAccept(p - 1, p);
    if (x < w - 1) tryAccept(p + 1, p);
    if (y > 0) tryAccept(p - w, p);
    if (y < h - 1) tryAccept(p + w, p);
  }

  const x0 = Math.floor(w * 0.35);
  const x1 = Math.ceil(w * 0.65);
  const y0 = Math.floor(h * 0.3);
  const y1 = Math.ceil(h * 0.7);
  let coreTotal = 0;
  let coreBg = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = x0; x < x1; x++) {
      coreTotal++;
      if (bgMask[row + x]) coreBg++;
    }
  }
  const coreBgRatio = coreTotal > 0 ? coreBg / coreTotal : 0;

  return { bgMask, bgCount: tail, coreBgRatio };
}

function pruneForegroundSpeckles(
  bgMask: Uint8Array,
  w: number,
  h: number,
  minIslandPx = 56
): number {
  const nPx = w * h;
  const visited = new Uint8Array(nPx);
  const stack = new Int32Array(nPx);
  const component = new Int32Array(nPx);
  let removed = 0;

  for (let start = 0; start < nPx; start++) {
    if (bgMask[start] || visited[start]) continue;
    let sp = 0;
    let compLen = 0;
    visited[start] = 1;
    stack[sp++] = start;

    while (sp > 0) {
      const p = stack[--sp];
      component[compLen++] = p;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) {
        const n = p - 1;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (x < w - 1) {
        const n = p + 1;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = p - w;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y < h - 1) {
        const n = p + w;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
    }

    if (compLen < minIslandPx) {
      for (let k = 0; k < compLen; k++) {
        bgMask[component[k]] = 1;
      }
      removed += compLen;
    }
  }
  return removed;
}

function loadHtmlImageElement(url: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  const attempt = (useCors: boolean): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      let settled = false;
      const img = new Image();
      if (useCors && /^https?:\/\//i.test(url)) {
        img.crossOrigin = 'anonymous';
      }
      img.decoding = 'async';
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);
      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            resolve(img);
          } else {
            resolve(null);
          }
        }
      };
      img.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      img.src = url;
    });

  return attempt(true).then((img) => {
    if (img || !/^https?:\/\//i.test(url)) return img;
    return attempt(false);
  });
}

function scanCutoutAlphaLandmarks(
  cropCanvas: HTMLCanvasElement,
  cropData: Uint8ClampedArray,
  cropW: number,
  cropH: number,
  sourceWidth: number,
  sourceHeight: number,
  cropBox: { x: number; y: number; w: number; h: number },
  cacheKey: string,
  resolvedUrl: string
): GarmentCutoutAsset {
  const rowSpans: NormalizedRowSpan[] = [];
  const colAlphaCounts = new Float32Array(ROW_LANDMARK_BANDS);
  const colTotalCounts = new Float32Array(ROW_LANDMARK_BANDS);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumSum = 0;
  let weightSum = 0;
  let upperWeightedX = 0;
  let upperWeightSum = 0;

  for (let y = 0; y < cropH; y++) {
    const vNorm = (y + 0.5) / cropH;
    const colBandBase = cropW > 0 ? ROW_LANDMARK_BANDS / cropW : 0;
    for (let x = 0; x < cropW; x++) {
      const idx = (y * cropW + x) * 4;
      const a = cropData[idx + 3];
      const cb = Math.min(ROW_LANDMARK_BANDS - 1, Math.floor(x * colBandBase));
      colTotalCounts[cb] += 1;
      if (a >= 28) {
        colAlphaCounts[cb] += 1;
      }
      if (a >= 48) {
        const w = a / 255;
        const r = cropData[idx];
        const g = cropData[idx + 1];
        const b = cropData[idx + 2];
        rSum += r * w;
        gSum += g * w;
        bSum += b * w;
        lumSum += (0.299 * r + 0.587 * g + 0.114 * b) * w;
        weightSum += w;
        if (vNorm <= 0.45) {
          upperWeightedX += ((x + 0.5) / cropW) * w;
          upperWeightSum += w;
        }
      }
    }
  }

  for (let band = 0; band < ROW_LANDMARK_BANDS; band++) {
    const y0 = Math.floor((band * cropH) / ROW_LANDMARK_BANDS);
    const y1 = Math.max(y0 + 1, Math.floor(((band + 1) * cropH) / ROW_LANDMARK_BANDS));
    const bandRows = Math.max(1, y1 - y0);

    // Build column occupancy across this horizontal slice
    const colOcc = new Float32Array(cropW);
    let activePixels = 0;
    for (let y = y0; y < y1; y++) {
      const rowOff = y * cropW;
      for (let x = 0; x < cropW; x++) {
        if (cropData[(rowOff + x) * 4 + 3] >= 30) {
          colOcc[x] += 1;
          activePixels += 1;
        }
      }
    }

    let firstX = -1;
    let lastX = -1;
    for (let x = 0; x < cropW; x++) {
      if (colOcc[x] >= bandRows * 0.25) {
        if (firstX < 0) firstX = x;
        lastX = x;
      }
    }

    const v = (band + 0.5) / ROW_LANDMARK_BANDS;
    if (firstX < 0 || lastX < firstX) {
      rowSpans.push({
        v,
        uLeft: 0.15,
        uRight: 0.85,
        width: 0,
        coverage: 0,
        hasCenterGap: false,
        leftBranchEnd: 0.46,
        rightBranchStart: 0.54,
      });
      continue;
    }

    const uLeft = firstX / Math.max(1, cropW - 1);
    const uRight = lastX / Math.max(1, cropW - 1);
    const spanW = Math.max(0, uRight - uLeft);
    const coverage = activePixels / Math.max(1, bandRows * cropW);

    // Detect central gap (for trouser/short legs & paired items)
    const searchStart = Math.max(firstX + Math.round(cropW * 0.06), Math.floor(cropW * 0.28));
    const searchEnd = Math.min(lastX - Math.round(cropW * 0.06), Math.ceil(cropW * 0.72));
    let bestGapStart = -1;
    let bestGapLen = 0;
    let curGapStart = -1;
    let curGapLen = 0;

    for (let x = searchStart; x <= searchEnd; x++) {
      if (colOcc[x] <= bandRows * 0.12) {
        if (curGapStart < 0) curGapStart = x;
        curGapLen += 1;
        if (curGapLen > bestGapLen) {
          bestGapLen = curGapLen;
          bestGapStart = curGapStart;
        }
      } else {
        curGapStart = -1;
        curGapLen = 0;
      }
    }

    const minGapCols = Math.max(2, Math.round(cropW * 0.018));
    const hasCenterGap = bestGapLen >= minGapCols && spanW >= 0.28;
    const leftBranchEnd = hasCenterGap
      ? clamp((bestGapStart - 1) / Math.max(1, cropW - 1), uLeft + 0.05, 0.52)
      : lerp(uLeft, uRight, 0.48);
    const rightBranchStart = hasCenterGap
      ? clamp((bestGapStart + bestGapLen) / Math.max(1, cropW - 1), 0.48, uRight - 0.05)
      : lerp(uLeft, uRight, 0.52);

    rowSpans.push({
      v,
      uLeft,
      uRight,
      width: spanW,
      coverage,
      hasCenterGap,
      leftBranchEnd,
      rightBranchStart,
    });
  }

  const colCoverages: number[] = [];
  for (let cb = 0; cb < ROW_LANDMARK_BANDS; cb++) {
    colCoverages.push(
      colTotalCounts[cb] > 0 ? colAlphaCounts[cb] / colTotalCounts[cb] : 0
    );
  }

  // Collar / neck opening width (rows 0..2)
  const collarWidths = rowSpans
    .slice(0, 3)
    .map((r) => r.width)
    .filter((w) => w > 0.04);
  const collarOpeningWidth =
    collarWidths.length > 0
      ? collarWidths.reduce((a, b) => a + b, 0) / collarWidths.length
      : 0.34;

  // Shoulder peaks in upper garment zone (v in 0.08..0.30 -> bands 2..9)
  let shoulderBand = 4;
  let maxUpperWidth = 0;
  for (let b = 2; b <= 9; b++) {
    if (rowSpans[b].width > maxUpperWidth) {
      maxUpperWidth = rowSpans[b].width;
      shoulderBand = b;
    }
  }
  const uLeftShoulder = rowSpans[shoulderBand].uLeft;
  const uRightShoulder = rowSpans[shoulderBand].uRight;
  const vShoulderPeak = rowSpans[shoulderBand].v;

  // Estimate core torso column bounds (`uTorsoLeft`, `uTorsoRight`) using columns with sustained vertical density
  let coreLeftBand = 0;
  while (coreLeftBand < 13 && colCoverages[coreLeftBand] < 0.56) {
    coreLeftBand++;
  }
  let coreRightBand = ROW_LANDMARK_BANDS - 1;
  while (coreRightBand > 18 && colCoverages[coreRightBand] < 0.56) {
    coreRightBand--;
  }

  const maxOverallWidth = Math.max(...rowSpans.map((r) => r.width), 0.4);
  const lowerTorsoSpans = rowSpans.slice(16, 28).filter((r) => r.width > 0.08);
  const medianLowerWidth =
    lowerTorsoSpans.length > 0
      ? [...lowerTorsoSpans].sort((a, b) => a.width - b.width)[
          Math.floor(lowerTorsoSpans.length * 0.5)
        ].width
      : maxOverallWidth * 0.65;

  const rawCoreLeft = coreLeftBand / ROW_LANDMARK_BANDS;
  const rawCoreRight = (coreRightBand + 1) / ROW_LANDMARK_BANDS;
  const hasDetectedSleeves =
    maxOverallWidth > medianLowerWidth * 1.16 || rawCoreRight - rawCoreLeft < maxOverallWidth * 0.82;

  const uTorsoLeft = hasDetectedSleeves
    ? clamp(Math.max(rawCoreLeft, 0.16), 0.14, 0.33)
    : clamp(rowSpans[Math.min(14, ROW_LANDMARK_BANDS - 1)].uLeft, 0.02, 0.25);
  const uTorsoRight = hasDetectedSleeves
    ? clamp(Math.min(rawCoreRight, 0.84), 0.67, 0.86)
    : clamp(rowSpans[Math.min(14, ROW_LANDMARK_BANDS - 1)].uRight, 0.75, 0.98);

  // Detect `vSleeveStart` and `vSleeveEnd` where outer sleeve spans extend beyond core torso
  let sleeveFirstBand = 3;
  let sleeveLastBand = 12;
  if (hasDetectedSleeves) {
    let foundFirst = false;
    for (let b = 2; b < ROW_LANDMARK_BANDS; b++) {
      const r = rowSpans[b];
      const extendsLeft = r.uLeft < uTorsoLeft - 0.035;
      const extendsRight = r.uRight > uTorsoRight + 0.035;
      if (extendsLeft || extendsRight) {
        if (!foundFirst) {
          sleeveFirstBand = b;
          foundFirst = true;
        }
        sleeveLastBand = b;
      }
    }
  }

  const vSleeveStart = clamp(rowSpans[sleeveFirstBand].v, 0.06, 0.24);
  const vSleeveEnd = clamp(rowSpans[sleeveLastBand].v, vSleeveStart + 0.16, 0.99);
  const cuffRow = rowSpans[sleeveLastBand];
  const cuffSpanLeft = Math.max(0.08, clamp(uTorsoLeft - cuffRow.uLeft, 0.08, 0.28));
  const cuffSpanRight = Math.max(0.08, clamp(cuffRow.uRight - uTorsoRight, 0.08, 0.28));

  const torsoWidthNorm = Math.max(0.24, uTorsoRight - uTorsoLeft);
  const waistWidthNorm = Math.max(0.2, rowSpans[17].width);
  const hemBandIdx = Math.max(24, ROW_LANDMARK_BANDS - 3);
  const hemWidthNorm = Math.max(0.2, rowSpans[hemBandIdx].width);

  // Detect `vCrotch`: topmost band in [6..26] where upper bands are unsplit and >= 60% of lower bands split
  const upperUnsplitCount = rowSpans.slice(1, 5).filter((r) => !r.hasCenterGap && r.width > 0.2).length;
  let vCrotch: number | null = null;
  if (upperUnsplitCount >= 2) {
    for (let b = 5; b <= 25; b++) {
      if (!rowSpans[b].hasCenterGap) continue;
      const remaining = rowSpans.slice(b, ROW_LANDMARK_BANDS - 1).filter((r) => r.width > 0.15);
      if (remaining.length < 3) break;
      const gapCount = remaining.filter((r) => r.hasCenterGap).length;
      if (gapCount >= remaining.length * 0.6) {
        vCrotch = clamp(rowSpans[b].v, 0.2, 0.78);
        break;
      }
    }
  }

  // Detect full vertical pair split (e.g. side-by-side sneakers/loafers/gloves/socks)
  let minMidColCov = 1;
  let minMidColIdx = 16;
  for (let cb = 12; cb <= 19; cb++) {
    if (colCoverages[cb] < minMidColCov) {
      minMidColCov = colCoverages[cb];
      minMidColIdx = cb;
    }
  }
  const leftPeakCov = Math.max(...colCoverages.slice(3, 12), 0);
  const rightPeakCov = Math.max(...colCoverages.slice(20, 29), 0);
  const hasVerticalPairSplit =
    minMidColCov <= 0.12 && leftPeakCov >= 0.32 && rightPeakCov >= 0.32;
  const uPairSplit = clamp((minMidColIdx + 0.5) / ROW_LANDMARK_BANDS, 0.4, 0.6);

  const meanR = weightSum > 0 ? rSum / weightSum : 196;
  const meanG = weightSum > 0 ? gSum / weightSum : 184;
  const meanB = weightSum > 0 ? bSum / weightSum : 168;
  const meanLuminance = weightSum > 0 ? lumSum / weightSum : 185;
  const meanHex = rgbToHex(meanR, meanG, meanB);
  const upperMassCenterX = upperWeightSum > 0 ? upperWeightedX / upperWeightSum : 0.5;

  return {
    cacheKey,
    resolvedUrl,
    canvas: cropCanvas,
    width: cropW,
    height: cropH,
    sourceWidth,
    sourceHeight,
    cropBox,
    rowSpans,
    colCoverages,
    collarOpeningWidth,
    uLeftShoulder,
    uRightShoulder,
    vShoulderPeak,
    hasDetectedSleeves,
    uTorsoLeft,
    uTorsoRight,
    vSleeveStart,
    vSleeveEnd,
    cuffSpanLeft,
    cuffSpanRight,
    torsoWidthNorm,
    waistWidthNorm,
    hemWidthNorm,
    vCrotch,
    hasVerticalPairSplit,
    uPairSplit,
    upperMassCenterX,
    meanHex,
    meanRgb: { r: Math.round(meanR), g: Math.round(meanG), b: Math.round(meanB) },
    meanLuminance,
  };
}

/**
 * Loads, alpha-mattes (preserving pre-baked `.webp` cutouts or border flood-filling opaque photos),
 * color-syncs (1:1 parity with `StudioGarmentImage.jsx`), tight-crops, scans 32-band landmarks,
 * and caches the prepared `GarmentCutoutAsset`.
 */
export function loadPreparedGarmentCutout(
  garment: GarmentInputRecord | null | undefined
): Promise<GarmentCutoutAsset | null> {
  if (!garment || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  const resolvedUrl = resolveGarmentPhotoUrl(garment);
  const rawHex = isValidHexColor(garment.color_hex) ? normalizeHexColor(garment.color_hex) : '';
  const subKey = String(garment.subcategory || '').trim().toLowerCase();
  const cacheKey = `${garment.id ?? ''}|${fingerprintUrlKey(resolvedUrl)}|${rawHex}|${subKey}`;

  const cached = readCutoutCacheLru(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = garmentCutoutInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const job = (async (): Promise<GarmentCutoutAsset | null> => {
    let img = await loadHtmlImageElement(resolvedUrl);
    let activeUrl = resolvedUrl;

    if (!img) {
      const fallbackSeed = getStudioSeedImageForGarment(
        garment.category || 'top',
        garment.subcategory || 'knit'
      );
      if (fallbackSeed && fallbackSeed !== resolvedUrl) {
        img = await loadHtmlImageElement(fallbackSeed);
        activeUrl = fallbackSeed;
      }
    }

    if (!img) {
      return null;
    }

    const srcW = Math.max(1, img.naturalWidth || img.width || 300);
    const srcH = Math.max(1, img.naturalHeight || img.height || 400);
    const scale = Math.min(1, MAX_CUTOUT_SIDE_PX / Math.max(srcW, srcH));
    const w = Math.max(32, Math.round(srcW * scale));
    const h = Math.max(32, Math.round(srcH * scale));

    const workCanvas = document.createElement('canvas');
    workCanvas.width = w;
    workCanvas.height = h;
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!workCtx) {
      workCanvas.width = 0;
      workCanvas.height = 0;
      return null;
    }

    workCtx.drawImage(img, 0, 0, w, h);

    let imgData: ImageData | null = null;
    try {
      imgData = workCtx.getImageData(0, 0, w, h);
    } catch {
      imgData = null;
    }

    // Graceful fallback if external cross-origin image tainted canvas readback
    if (!imgData) {
      const defaultSpans: NormalizedRowSpan[] = Array.from(
        { length: ROW_LANDMARK_BANDS },
        (_, i) => ({
          v: (i + 0.5) / ROW_LANDMARK_BANDS,
          uLeft: 0.08,
          uRight: 0.92,
          width: 0.84,
          coverage: 0.84,
          hasCenterGap: false,
          leftBranchEnd: 0.46,
          rightBranchStart: 0.54,
        })
      );
      const fallbackRgb = rawHex ? hexToRgb(rawHex) : { r: 180, g: 175, b: 168 };
      const untaintedAsset: GarmentCutoutAsset = {
        cacheKey,
        resolvedUrl: activeUrl,
        canvas: workCanvas,
        width: w,
        height: h,
        sourceWidth: srcW,
        sourceHeight: srcH,
        cropBox: { x: 0, y: 0, w, h },
        rowSpans: defaultSpans,
        colCoverages: Array.from({ length: ROW_LANDMARK_BANDS }, () => 0.85),
        collarOpeningWidth: 0.34,
        uLeftShoulder: 0.08,
        uRightShoulder: 0.92,
        vShoulderPeak: 0.16,
        hasDetectedSleeves: true,
        uTorsoLeft: 0.2,
        uTorsoRight: 0.8,
        vSleeveStart: 0.12,
        vSleeveEnd: 0.88,
        cuffSpanLeft: 0.14,
        cuffSpanRight: 0.14,
        torsoWidthNorm: 0.6,
        waistWidthNorm: 0.58,
        hemWidthNorm: 0.62,
        vCrotch: null,
        hasVerticalPairSplit: false,
        uPairSplit: 0.5,
        upperMassCenterX: 0.5,
        meanHex: rawHex || '#B4AFA8',
        meanRgb: fallbackRgb,
        meanLuminance: 0.299 * fallbackRgb.r + 0.587 * fallbackRgb.g + 0.114 * fallbackRgb.b,
      };
      writeCutoutCacheLru(cacheKey, untaintedAsset);
      return untaintedAsset;
    }

    const d = imgData.data;
    const nPx = w * h;
    let transparentPx = 0;
    for (let p = 0; p < nPx; p++) {
      if (d[p * 4 + 3] < 245) transparentPx++;
    }

    const hasPreBakedAlpha = transparentPx > nPx * 0.03;
    const preserveDial = subKey === 'watch' || activeUrl.includes('studio-watch');
    const isEyewear =
      subKey === 'glasses' ||
      activeUrl.includes('studio-glasses') ||
      /안경|선글라스|아이웨어|glasses|sunglasses|eyewear/i.test(String(garment.name || ''));

    let fgLumSum = 0;
    let fgWeightSum = 0;
    const masks = new Float32Array(nPx);

    if (hasPreBakedAlpha) {
      for (let p = 0; p < nPx; p++) {
        const i = p * 4;
        const a = d[i + 3];
        if (a < 10) {
          d[i + 3] = 0;
          masks[p] = 0;
          continue;
        }
        if (isEyewear && a < 64) {
          masks[p] = 0;
          continue;
        }
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const alphaNorm = a / 255;
        masks[p] = 1;
        if (alphaNorm > 0.35 && !(preserveDial && sat < 22 && lum > 180)) {
          fgLumSum += lum * alphaNorm;
          fgWeightSum += alphaNorm;
        }
      }
    } else {
      // Opaque studio packshot or user photo: border-seeded background flood-fill removal
      const samplePts: Array<[number, number]> = [
        [2, 2],
        [w - 3, 2],
        [2, h - 3],
        [w - 3, h - 3],
        [Math.floor(w * 0.5), 2],
        [Math.floor(w * 0.5), h - 3],
        [2, Math.floor(h * 0.5)],
        [w - 3, Math.floor(h * 0.5)],
      ];
      let bgR = 0;
      let bgG = 0;
      let bgB = 0;
      for (const [sx, sy] of samplePts) {
        const idx = (clamp(sy, 0, h - 1) * w + clamp(sx, 0, w - 1)) * 4;
        bgR += d[idx];
        bgG += d[idx + 1];
        bgB += d[idx + 2];
      }
      bgR /= samplePts.length;
      bgG /= samplePts.length;
      bgB /= samplePts.length;

      const nativeHex = getNativeSeedHex(activeUrl) || rawHex;
      const nativeRgb = nativeHex ? hexToRgb(nativeHex) : null;
      const nativeLum = nativeRgb
        ? 0.299 * nativeRgb.r + 0.587 * nativeRgb.g + 0.114 * nativeRgb.b
        : 120;
      const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
      const startProfileIdx = Math.abs(nativeLum - bgLum) < 38 ? 1 : 0;

      let chosen = runBorderFloodFill(d, w, h, bgR, bgG, bgB, CUTOUT_PROFILES[startProfileIdx]);
      for (let pi = startProfileIdx + 1; pi < CUTOUT_PROFILES.length; pi++) {
        if (chosen.bgCount <= nPx * 0.86 && chosen.coreBgRatio <= 0.18) break;
        chosen = runBorderFloodFill(d, w, h, bgR, bgG, bgB, CUTOUT_PROFILES[pi]);
      }

      const bgMask = chosen.bgMask;
      let bgCount = chosen.bgCount;
      const applyAlphaCutout =
        bgCount > nPx * 0.03 && bgCount < nPx * 0.94 && chosen.coreBgRatio <= 0.45;
      if (applyAlphaCutout) {
        bgCount += pruneForegroundSpeckles(bgMask, w, h, 56);
      }

      for (let p = 0; p < nPx; p++) {
        const i = p * 4;
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (applyAlphaCutout && bgMask[p]) {
          masks[p] = 0;
          d[i + 3] = 0;
          continue;
        }

        const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);
        let edgeAlpha = 1;
        if (applyAlphaCutout) {
          const x = p % w;
          const y = (p - x) / w;
          let bgNeighbors = 0;
          if (x > 0 && bgMask[p - 1]) bgNeighbors++;
          if (x < w - 1 && bgMask[p + 1]) bgNeighbors++;
          if (y > 0 && bgMask[p - w]) bgNeighbors++;
          if (y < h - 1 && bgMask[p + w]) bgNeighbors++;
          if (bgNeighbors > 0) {
            const featherLow = nativeLum > 208 ? 4 : 13;
            const featherHigh = nativeLum > 208 ? 18 : 42;
            edgeAlpha = smoothstep(featherLow, featherHigh, distBg);
            d[i + 3] = Math.round(d[i + 3] * edgeAlpha);
            if (edgeAlpha > 0.08 && edgeAlpha < 0.94 && nativeLum <= 208) {
              const invA = 1 / Math.max(0.28, edgeAlpha);
              r = clamp(Math.round((r - bgR * (1 - edgeAlpha)) * invA), 0, 255);
              g = clamp(Math.round((g - bgG * (1 - edgeAlpha)) * invA), 0, 255);
              b = clamp(Math.round((b - bgB * (1 - edgeAlpha)) * invA), 0, 255);
              d[i] = r;
              d[i + 1] = g;
              d[i + 2] = b;
            }
          }
        }

        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const isPaperOrSoftShadow = sat < 14 && lum > bgLum - 32 && distBg < 36;
        const m = isPaperOrSoftShadow ? 0 : smoothstep(16, 42, distBg) * edgeAlpha;
        masks[p] = m;
        if (m > 0.35) {
          fgLumSum += lum * m;
          fgWeightSum += m;
        }
      }
    }

    // 1:1 color-sync tinting with StudioGarmentImage.jsx
    const shouldTint = shouldApplyGarmentSeedTint(activeUrl, rawHex);
    if (shouldTint && rawHex && fgWeightSum >= 40) {
      const meanFgLum = clamp(fgLumSum / fgWeightSum, 42, 215);
      const tgt = hexToRgb(rawHex);
      const tgtLum = 0.299 * tgt.r + 0.587 * tgt.g + 0.114 * tgt.b;
      const specStart = preserveDial ? 182 : 208;
      const specEnd = preserveDial ? 216 : 242;
      const specStrength = preserveDial ? 0.96 : 0.78;
      const exp = tgtLum < 45 ? 0.76 : 0.92;

      for (let p = 0; p < nPx; p++) {
        const m = masks[p];
        if (m <= 0.01) continue;
        const i = p * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);

        const metalSpecularProtect =
          sat < 22 && lum > specStart ? smoothstep(specStart, specEnd, lum) * specStrength : 0;
        const blend = m * (1 - metalSpecularProtect) * 0.88;
        const shadeRatio = Math.pow(clamp(lum / meanFgLum, 0.12, 2.2), exp);
        const darkSheen = tgtLum < 42 ? Math.max(0, (lum - meanFgLum * 0.92) * 0.24) : 0;
        const specLift = Math.max(0, (lum - meanFgLum * 1.18) * 0.28) + darkSheen;

        const nr = clamp(tgt.r * shadeRatio + specLift, 0, 255);
        const ng = clamp(tgt.g * shadeRatio + specLift, 0, 255);
        const nb = clamp(tgt.b * shadeRatio + specLift, 0, 255);

        d[i] = Math.round(r * (1 - blend) + nr * blend);
        d[i + 1] = Math.round(g * (1 - blend) + ng * blend);
        d[i + 2] = Math.round(b * (1 - blend) + nb * blend);
      }
    }

    workCtx.putImageData(imgData, 0, 0);

    // Tight-crop to foreground alpha bounding box
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        if (d[(rowOff + x) * 4 + 3] >= 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }

    const cropX = minX;
    const cropY = minY;
    const cropW = Math.max(8, maxX - minX + 1);
    const cropH = Math.max(8, maxY - minY + 1);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (!cropCtx) {
      workCanvas.width = 0;
      workCanvas.height = 0;
      cropCanvas.width = 0;
      cropCanvas.height = 0;
      return null;
    }

    cropCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const croppedData = cropCtx.getImageData(0, 0, cropW, cropH).data;

    workCanvas.width = 0;
    workCanvas.height = 0;

    const asset = scanCutoutAlphaLandmarks(
      cropCanvas,
      croppedData,
      cropW,
      cropH,
      srcW,
      srcH,
      { x: cropX, y: cropY, w: cropW, h: cropH },
      cacheKey,
      activeUrl
    );
    writeCutoutCacheLru(cacheKey, asset);
    return asset;
  })().finally(() => {
    garmentCutoutInflight.delete(cacheKey);
  });

  garmentCutoutInflight.set(cacheKey, job);
  return job;
}

// ============================================================================
// 2. Garment Geometry Classification & Overlap Rules
// ============================================================================

/**
 * Classifies an equipped garment's slot role, sleeve mode, bottom mode, shoe mode,
 * and outerwear loft tier from metadata + scanned cutout alpha landmarks.
 */
export function classifyGarmentGeometry(
  garment: GarmentInputRecord | null | undefined,
  asset?: GarmentCutoutAsset | null
): GarmentGeometryClassification {
  const cat = String(garment?.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment?.subcategory || '')
    .trim()
    .toLowerCase();
  const slotHint = String(garment?.slot_key || '')
    .trim()
    .toLowerCase();
  const name = `${String(garment?.name || '').trim()} ${String(garment?.name_en || '').trim()}`.trim();
  const sleeveProp = String(garment?.sleeveLength || '')
    .trim()
    .toLowerCase();
  const hemProp = String(garment?.hemLength || '')
    .trim()
    .toLowerCase();
  const shoeExp = String(garment?.shoeExposure || '')
    .trim()
    .toLowerCase();
  const combined = `${cat} ${sub} ${slotHint} ${name}`;

  // 1. Determine Slot Role
  let slotRole: GarmentSlotRole = 'top';

  if (
    sub === 'glasses' ||
    slotHint === 'eyewear' ||
    /안경|선글라스|아이웨어|고글|뿔테|glasses|sunglasses|eyewear|goggles/i.test(combined)
  ) {
    slotRole = 'eyewear';
  } else if (
    sub === 'watch' ||
    sub === 'jewelry' ||
    slotHint === 'watch' ||
    /시계|워치|팔찌|브레이슬릿|\bwatch\b|bracelet|wristband/i.test(combined)
  ) {
    slotRole = 'watch';
  } else if (
    sub === 'belt' ||
    slotHint === 'belt' ||
    ((cat === 'accessory' || !cat) && /벨트|\bbelt\b/i.test(name) && !/트렌치|원피스|코트|trench|dress|coat/i.test(name))
  ) {
    slotRole = 'belt';
  } else if (
    cat === 'headwear' ||
    slotHint === 'headwear' ||
    ['beanie', 'cap', 'beret', 'bucket_hat', 'hat', 'fedora', 'visor'].includes(sub) ||
    (!['top', 'outer', 'dress', 'onepiece'].includes(cat) &&
      /비니|볼캡|캡모자|모자|베레모|버킷햇|페도라|헌팅캡|선바이저|beanie|\bcap\b|beret|bucket.?hat|fedora|\bhat\b/i.test(
        name
      ))
  ) {
    slotRole = 'headwear';
  } else if (
    cat === 'neckwear' ||
    slotHint === 'neckwear' ||
    ['scarf', 'muffler', 'necktie', 'choker', 'snood'].includes(sub) ||
    /머플러|목도리|스카프|넥타이|넥워머|초커|muffler|scarf|necktie|\btie\b|choker/i.test(combined)
  ) {
    slotRole = 'neckwear';
  } else if (
    cat === 'gloves' ||
    slotHint === 'gloves' ||
    ['gloves', 'leather_gloves', 'knit_gloves', 'mittens'].includes(sub) ||
    /장갑|글러브|미튼|gloves|mittens/i.test(combined)
  ) {
    slotRole = 'gloves';
  } else if (
    cat === 'socks' ||
    slotHint === 'socks' ||
    ['socks', 'crew_socks', 'ankle_socks', 'dress_socks'].includes(sub) ||
    /양말|삭스|\bsocks\b/i.test(combined)
  ) {
    slotRole = 'socks';
  } else if (
    cat === 'shoes' ||
    cat === 'footwear' ||
    slotHint === 'shoes' ||
    [
      'sneakers',
      'loafers',
      'boots',
      'heels',
      'sandals',
      'slides',
      'flip_flops',
      'derby',
      'oxford',
      'flats',
    ].includes(sub) ||
    /스니커즈|운동화|로퍼|구두|부츠|워커|힐|펌프스|샌들|슬라이드|쪼리|플립플랍|슬리퍼|뮬|더비|플랫슈즈|sneaker|loafer|boot|heel|pump|sandal|slide|flip.?flop|slipper|derby|oxford/i.test(
      combined
    )
  ) {
    slotRole = 'shoes';
  } else if (
    cat === 'bag' ||
    cat === 'accessory' ||
    slotHint === 'bag' ||
    slotHint === 'accessory' ||
    ['bag', 'tote', 'briefcase', 'backpack', 'crossbody', 'clutch'].includes(sub) ||
    /가방|백팩|토트|쇼퍼|브리프케이스|서류가방|크로스백|숄더백|클러치|파우치|\bbag\b|tote|briefcase|backpack|crossbody|clutch/i.test(
      combined
    )
  ) {
    slotRole = 'bag';
  } else if (
    cat === 'underwear' ||
    cat === 'swimwear' ||
    slotHint === 'underwear' ||
    slotHint === 'swimwear' ||
    ['underwear', 'inner_top', 'camisole', 'bikini', 'swimsuit', 'rashguard', 'swim_trunks'].includes(
      sub
    ) ||
    /수영복|비키니|래쉬가드|래시가드|스윔|트렁크|보드숏|언더웨어|이너탑|브리프|드로즈|브라탑|스포츠브라|swimwear|swimsuit|bikini|rashguard|swim.?trunks|board.?shorts|underwear|inner.?top|sports.?bra|briefs/i.test(
      combined
    )
  ) {
    slotRole = 'swimwear';
  } else if (
    cat === 'dress' ||
    cat === 'onepiece' ||
    slotHint === 'dress' ||
    slotHint === 'onepiece' ||
    ['dress', 'onepiece', 'jumpsuit', 'romper'].includes(sub) ||
    /원피스|드레스|점프수트|롬퍼|오버올|멜빵|dress|one.?piece|jumpsuit|romper/i.test(combined)
  ) {
    slotRole = 'onepiece';
  } else if (
    cat === 'outer' ||
    cat === 'outerwear' ||
    slotHint === 'outer' ||
    ['trench', 'blazer', 'jacket', 'coat', 'padding', 'puffer', 'parka', 'windbreaker'].includes(
      sub
    ) ||
    /트렌치|맥코트|블레이저|자켓|재킷|점퍼|블루종|코트|패딩|다운|푸퍼|파카|바람막이|윈드브레이커|아노락|무스탕|trench|blazer|jacket|coat|padding|puffer|parka|windbreaker|blouson/i.test(
      combined
    )
  ) {
    slotRole = 'outer';
  } else if (
    cat === 'bottom' ||
    cat === 'bottoms' ||
    slotHint === 'bottom' ||
    ['slacks', 'denim', 'chinos', 'skirt', 'shorts', 'jogger', 'cargo', 'leggings'].includes(sub) ||
    /슬랙스|팬츠|바지|데님|청바지|치노|스커트|치마|쇼츠|반바지|버뮤다|조거|카고|레깅스|slacks|pants|trousers|denim|jeans|chinos|skirt|shorts|bermuda|jogger|cargo|leggings/i.test(
      combined
    )
  ) {
    slotRole = 'bottom';
  }

  // 2. Determine Sleeve Mode
  let sleeveMode: GarmentSleeveMode = 'long';
  if (sleeveProp === 'sleeveless' || sleeveProp === 'none' || sleeveProp === 'strap') {
    sleeveMode = 'sleeveless';
  } else if (sleeveProp === 'short' || sleeveProp === 'half' || sleeveProp === 'cap') {
    sleeveMode = 'short';
  } else if (
    sleeveProp === 'three_quarter' ||
    sleeveProp === '3/4' ||
    sleeveProp === 'seven_tenth'
  ) {
    sleeveMode = 'three_quarter';
  } else if (sleeveProp === 'long' || sleeveProp === 'full') {
    sleeveMode = 'long';
  } else if (
    sub === 'camisole' ||
    /나시|민소매|슬리브리스|탱크탑|캐미솔|홀터넥|튜브탑|비키니|수영복|베스트|조끼|슬립|sleeveless|\btank\b|camisole|cami\b|halter|tube.?top|bikini|swimsuit|\bvest\b|waistcoat|\bslip\b/i.test(
      combined
    )
  ) {
    if (!/래쉬가드|래시가드|긴팔|반팔|rashguard|long.?sleeve|short.?sleeve/i.test(combined)) {
      sleeveMode = 'sleeveless';
    }
  } else if (
    /7부|칠부|5부소매|3\/4|three.?quarter/i.test(combined)
  ) {
    sleeveMode = 'three_quarter';
  } else if (
    (sub === 'tshirt' || /반팔|숏슬리브|하프슬리브|피케|폴로|티셔츠|short.?sleeve|\btee\b|t-?shirt|polo\b/i.test(combined)) &&
    !/긴팔|롱슬리브|long.?sleeve/i.test(combined)
  ) {
    sleeveMode = 'short';
  } else if (
    asset &&
    !asset.hasDetectedSleeves &&
    !['outer'].includes(slotRole) &&
    !/긴팔|니트|셔츠|후드|맨투맨|가디건|래쉬가드|long|knit|shirt|hoodie|cardigan|rashguard/i.test(
      combined
    )
  ) {
    sleeveMode = 'sleeveless';
  } else if (
    asset &&
    asset.hasDetectedSleeves &&
    asset.vSleeveEnd < 0.47 &&
    slotRole === 'top' &&
    !/긴팔|니트|셔츠|후드|맨투맨|가디건|long|knit|shirt|hoodie|cardigan/i.test(combined)
  ) {
    sleeveMode = 'short';
  }

  // 3. Determine Bottom Mode & Swimwear sub-flags
  const isSwimBottomOnly =
    slotRole === 'swimwear' &&
    (sub === 'underwear' ||
      sub === 'swim_trunks' ||
      /트렁크|보드숏|브리프|드로즈|언더웨어|하의|팬티|swim.?trunks|board.?shorts|brief|underwear|bottom/i.test(
        combined
      )) &&
    !/래쉬가드|래시가드|이너탑|원피스수영복|rashguard|inner.?top|one.?piece/i.test(combined);

  const isSwimOnepiece =
    slotRole === 'swimwear' &&
    !isSwimBottomOnly &&
    (/수영복|비키니|스윔수트|모노키니|swimsuit|bikini|monokini/i.test(combined) &&
      !/래쉬가드|래시가드|rashguard/i.test(combined));

  let bottomMode: GarmentBottomMode = 'wide_pants';
  if (slotRole === 'swimwear') {
    if (/트렁크|보드숏|스윔쇼츠|swim.?trunks|board.?shorts/i.test(combined)) {
      bottomMode = 'swim_trunks';
    } else {
      bottomMode = 'bikini_brief';
    }
  } else if (sub === 'skirt' || /스커트|치마|skirt/i.test(combined)) {
    if (
      hemProp === 'mini' ||
      hemProp === 'short' ||
      /미니|테니스|숏스커트|mini.?skirt|\bmini\b|tennis/i.test(combined)
    ) {
      bottomMode = 'mini_skirt';
    } else {
      bottomMode = 'midi_skirt';
    }
  } else if (
    sub === 'shorts' ||
    hemProp === 'shorts' ||
    hemProp === 'above_knee' ||
    hemProp === 'knee' ||
    hemProp === 'bermuda' ||
    /쇼츠|반바지|하프팬츠|버뮤다|숏팬츠|shorts|bermuda|half.?pants/i.test(combined)
  ) {
    if (
      hemProp === 'knee' ||
      hemProp === 'bermuda' ||
      /버뮤다|하프팬츠|5부|오부|니렝스|bermuda|knee|half.?pants/i.test(combined)
    ) {
      bottomMode = 'bermuda';
    } else {
      bottomMode = 'shorts';
    }
  } else if (
    sub === 'cargo' ||
    sub === 'jogger' ||
    /카고|파라슈트|유틸리티|조거|트랙팬츠|cargo|parachute|jogger|track.?pants/i.test(combined)
  ) {
    bottomMode = 'cargo_pants';
  } else if (
    /와이드|배기|루즈|팔라초|스트레이트|슬랙스|플레어|부츠컷|wide|baggy|loose|palazzo|straight|slacks|flare/i.test(
      combined
    ) ||
    sub === 'slacks'
  ) {
    bottomMode = 'wide_pants';
  } else if (
    sub === 'denim' ||
    sub === 'chinos' ||
    sub === 'leggings' ||
    /슬림|스키니|테이퍼드|레깅스|치노|데님|청바지|slim|skinny|tapered|leggings|chinos|denim|jeans/i.test(
      combined
    )
  ) {
    bottomMode = /와이드|배기|루즈|스트레이트|wide|baggy|loose|straight/i.test(name)
      ? 'wide_pants'
      : 'slim_pants';
  } else if (asset && asset.vCrotch !== null && asset.vCrotch > 0.48) {
    bottomMode = 'shorts';
  }

  // 4. Determine Shoe Mode
  let shoeMode: GarmentShoeMode = 'low_shoes';
  if (
    shoeExp === 'flip_flops' ||
    sub === 'flip_flops' ||
    /쪼리|플립플랍|플립플롭|통샌들|flip.?flop|thong.?sandal/i.test(combined)
  ) {
    shoeMode = 'flip_flops';
  } else if (
    shoeExp === 'slides' ||
    sub === 'slides' ||
    /슬라이드|슬리퍼|뮬|클로그|\bslide\b|slides|slipper|\bmule\b|clog/i.test(combined)
  ) {
    shoeMode = 'slides';
  } else if (
    shoeExp === 'strap_sandals' ||
    shoeExp === 'open_toe' ||
    sub === 'sandals' ||
    /샌들|스트랩샌들|글래디에이터|피셔맨|테바|sandal|strappy/i.test(combined)
  ) {
    shoeMode = 'strap_sandals';
  } else if (
    shoeExp === 'snow_boots' ||
    /방한부츠|스노우부츠|어그|패딩부츠|퍼부츠|문부츠|snow.?boot|winter.?boot|\bugg\b|fur.?boot|moon.?boot/i.test(
      combined
    )
  ) {
    shoeMode = 'snow_boots';
  } else if (
    shoeExp === 'long_boots' ||
    /롱부츠|니하이|싸이하이|라이딩부츠|웨스턴부츠|톨부츠|long.?boot|knee.?high|thigh.?high|riding.?boot|tall.?boot/i.test(
      combined
    )
  ) {
    shoeMode = 'long_boots';
  } else if (
    sub === 'boots' ||
    shoeExp === 'ankle_boots' ||
    /부츠|첼시|앵클|워커|컴뱃|닥터마틴|처카|boot|chelsea|ankle.?boot|combat|walker|chukka/i.test(
      combined
    )
  ) {
    shoeMode = 'ankle_boots';
  } else if (
    sub === 'heels' ||
    shoeExp === 'heels' ||
    /힐|펌프스|스틸레토|슬링백|웨지힐|메리제인|키튼힐|heel|pump|stiletto|slingback|wedge|mary.?jane/i.test(
      combined
    )
  ) {
    shoeMode = 'heels';
  }

  // 5. Outerwear Loft Tier & Hem Length
  let outerTier: OuterWeightTier = 'cardigan_blazer_jacket';
  if (
    sub === 'padding' ||
    sub === 'puffer' ||
    /패딩|다운|푸퍼|퀼팅|파카|puffer|padding|\bdown\b|quilted|parka/i.test(combined)
  ) {
    outerTier = 'padding_puffer';
  } else if (
    sub === 'coat' ||
    sub === 'trench' ||
    /코트|트렌치|맥코트|발마칸|더플|오버코트|coat|trench|overcoat|balmacaan|duffle/i.test(combined)
  ) {
    outerTier = 'coat_trench';
  }

  const isLongCoatHem =
    slotRole === 'outer' &&
    (outerTier === 'coat_trench' ||
      hemProp === 'long' ||
      hemProp === 'knee' ||
      hemProp === 'midi' ||
      /롱패딩|롱코트|롱가디건|트렌치|맥코트|오버코트|long.?padding|long.?coat|trench|overcoat/i.test(
        combined
      )) &&
    !/숏코트|숏트렌치|크롭|short.?coat|cropped/i.test(combined);

  const isBarefootVisibleShoe =
    shoeMode === 'flip_flops' || shoeMode === 'strap_sandals' || shoeMode === 'slides';

  return {
    slotRole,
    sleeveMode,
    bottomMode,
    shoeMode,
    outerTier,
    isSwimBottomOnly,
    isSwimOnepiece,
    isLongCoatHem,
    isBarefootVisibleShoe,
  };
}

/**
 * Resolves physical trouser-cuff vs boot-shaft overlap ordering:
 * - `'boots_over_pants'` for `long_boots` / `snow_boots`, or `ankle_boots` with shorts/skirts/slim pants.
 * - `'pants_over_shoes'` for wide/straight/slacks/cargo trousers over low shoes/loafers/sneakers/ankle boots.
 */
export function resolveBottomShoeOverlap(
  bottomGarment: GarmentInputRecord | null | undefined,
  shoeGarment: GarmentInputRecord | null | undefined
): BottomShoeOverlapMode {
  if (!shoeGarment) return 'pants_over_shoes';
  if (!bottomGarment) return 'boots_over_pants';

  const shoeClass = classifyGarmentGeometry(shoeGarment);
  const bottomClass = classifyGarmentGeometry(bottomGarment);

  if (shoeClass.shoeMode === 'long_boots' || shoeClass.shoeMode === 'snow_boots') {
    return 'boots_over_pants';
  }

  const isShortOrSkirt =
    bottomClass.bottomMode === 'bikini_brief' ||
    bottomClass.bottomMode === 'swim_trunks' ||
    bottomClass.bottomMode === 'shorts' ||
    bottomClass.bottomMode === 'bermuda' ||
    bottomClass.bottomMode === 'mini_skirt' ||
    bottomClass.bottomMode === 'midi_skirt';

  if (shoeClass.shoeMode === 'ankle_boots') {
    if (isShortOrSkirt || bottomClass.bottomMode === 'slim_pants') {
      return 'boots_over_pants';
    }
    return 'pants_over_shoes';
  }

  if (isShortOrSkirt) {
    return 'boots_over_pants';
  }

  return 'pants_over_shoes';
}

/**
 * Computes physically ordered zero-clipping loft offset (in canvas pixels) scaled proportionally
 * to `frame.scale` so high-BMI (`164cm/103kg`), plus-size, bust, and abdomen silhouettes never clip.
 */
export function getGarmentLayerLoftPx(
  classification: GarmentGeometryClassification,
  frame: IsometricBodyFrame
): number {
  // In isometricBodyRig.ts, frame.scale is px/cm (~2.0 at 360x480, ~5.0 at 900x1200).
  // Normalize against reference studio scale (~2.55 px/cm) while supporting percentage-scale mocks (>25).
  const scaleFactor =
    frame.scale > 25 ? frame.scale / 100 : Math.max(0.58, frame.scale / 2.55);

  let baseLoft = 3.5;
  switch (classification.slotRole) {
    case 'swimwear':
    case 'socks':
      baseLoft = 1.5;
      break;
    case 'top':
      baseLoft = 3.5;
      break;
    case 'bottom':
      baseLoft = 4.8;
      break;
    case 'onepiece':
      baseLoft = 5.2;
      break;
    case 'belt':
      baseLoft = 5.9;
      break;
    case 'outer':
      if (classification.outerTier === 'padding_puffer') {
        baseLoft = 16.5;
      } else if (classification.outerTier === 'coat_trench') {
        baseLoft = 11.5;
      } else {
        baseLoft = 8.5;
      }
      break;
    default:
      baseLoft = 3.5;
      break;
  }

  return Math.max(1.15, baseLoft * scaleFactor);
}

// ============================================================================
// 3. Piecewise Triangular Cage / Affine Mesh Warping Engine
// ============================================================================

let scratchLayerCanvas: HTMLCanvasElement | null = null;
let scratchOutlineCanvas: HTMLCanvasElement | null = null;

function acquireScratchPair(
  w: number,
  h: number
): {
  layerCanvas: HTMLCanvasElement;
  layerCtx: CanvasRenderingContext2D;
  outlineCanvas: HTMLCanvasElement;
  outlineCtx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined') return null;
  const safeW = Math.max(1, Math.round(w));
  const safeH = Math.max(1, Math.round(h));

  if (!scratchLayerCanvas) {
    scratchLayerCanvas = document.createElement('canvas');
  }
  if (!scratchOutlineCanvas) {
    scratchOutlineCanvas = document.createElement('canvas');
  }

  if (scratchLayerCanvas.width !== safeW || scratchLayerCanvas.height !== safeH) {
    scratchLayerCanvas.width = safeW;
    scratchLayerCanvas.height = safeH;
  }
  if (scratchOutlineCanvas.width !== safeW || scratchOutlineCanvas.height !== safeH) {
    scratchOutlineCanvas.width = safeW;
    scratchOutlineCanvas.height = safeH;
  }

  const layerCtx = scratchLayerCanvas.getContext('2d');
  const outlineCtx = scratchOutlineCanvas.getContext('2d');
  if (!layerCtx || !outlineCtx) return null;

  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
  layerCtx.globalAlpha = 1;
  layerCtx.clearRect(0, 0, safeW, safeH);

  outlineCtx.setTransform(1, 0, 0, 1, 0, 0);
  outlineCtx.globalCompositeOperation = 'source-over';
  outlineCtx.globalAlpha = 1;
  outlineCtx.clearRect(0, 0, safeW, safeH);

  return {
    layerCanvas: scratchLayerCanvas,
    layerCtx,
    outlineCanvas: scratchOutlineCanvas,
    outlineCtx,
  };
}

/**
 * Warps a single triangle from normalized source `(u, v)` coordinates on `imgCanvas`
 * onto destination `(x, y)` canvas coordinates using the exact 2D affine matrix,
 * expanding clip vertices outward by `~0.55px` from centroid to eliminate hairline seams.
 */
export function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  imgCanvas: HTMLCanvasElement | HTMLImageElement,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  const sw = imgCanvas.width;
  const sh = imgCanvas.height;
  if (sw <= 0 || sh <= 0) return;

  const s0x = u0 * sw;
  const s0y = v0 * sh;
  const s1x = u1 * sw;
  const s1y = v1 * sh;
  const s2x = u2 * sw;
  const s2y = v2 * sh;

  const ds1x = s1x - s0x;
  const ds1y = s1y - s0y;
  const ds2x = s2x - s0x;
  const ds2y = s2y - s0y;

  const det = ds1x * ds2y - ds2x * ds1y;
  if (Math.abs(det) < 1e-4) return;

  const dx1 = x1 - x0;
  const dy1 = y1 - y0;
  const dx2 = x2 - x0;
  const dy2 = y2 - y0;

  const dstArea2 = Math.abs(dx1 * dy2 - dx2 * dy1);
  if (dstArea2 < 0.02) return;

  const invDet = 1 / det;
  const a = (dx1 * ds2y - dx2 * ds1y) * invDet;
  const c = (dx2 * ds1x - dx1 * ds2x) * invDet;
  const b = (dy1 * ds2y - dy2 * ds1y) * invDet;
  const d = (dy2 * ds1x - dy1 * ds2x) * invDet;
  const e = x0 - a * s0x - c * s0y;
  const f = y0 - b * s0x - d * s0y;

  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(c) ||
    !Number.isFinite(d) ||
    !Number.isFinite(e) ||
    !Number.isFinite(f)
  ) {
    return;
  }

  // Outward ~0.55px expansion from triangle centroid prevents subpixel hairline seam cracks
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  const expandPx = 0.58;

  const expandVertex = (vx: number, vy: number): Point2D => {
    const ox = vx - cx;
    const oy = vy - cy;
    const len = Math.hypot(ox, oy);
    if (len < 1e-4) return { x: vx, y: vy };
    return {
      x: vx + (ox / len) * expandPx,
      y: vy + (oy / len) * expandPx,
    };
  };

  const p0 = expandVertex(x0, y0);
  const p1 = expandVertex(x1, y1);
  const p2 = expandVertex(x2, y2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(imgCanvas, 0, 0);
  ctx.restore();
}

/**
 * Warps a structured `(Nv + 1) x (Nu + 1)` UV-to-destination cage (`2 * Nu * Nv` triangles)
 * onto an isolated alpha layer, applies subtle `source-atop` isometric cylindrical key-light &
 * far-side ambient shading without obscuring real buttons/zippers/ribs/seams, and composites
 * with a crisp alpha-locked contour outline onto `ctx`.
 */
export function warpStructuredGrid(
  ctx: CanvasRenderingContext2D,
  asset: GarmentCutoutAsset,
  srcUvGrid: readonly (readonly Point2D[])[],
  dstPointGrid: readonly (readonly Point2D[])[],
  options?: GridWarpShadingOptions
): void {
  const rowCount = Math.min(srcUvGrid.length, dstPointGrid.length);
  if (rowCount < 2) return;
  const colCount = Math.min(srcUvGrid[0].length, dstPointGrid[0].length);
  if (colCount < 2) return;

  const canvasW = ctx.canvas?.width || 720;
  const canvasH = ctx.canvas?.height || 960;
  const scratch = acquireScratchPair(canvasW, canvasH);
  const targetCtx = scratch ? scratch.layerCtx : ctx;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let r = 0; r < rowCount; r++) {
    const dRow = dstPointGrid[r];
    for (let c = 0; c < colCount; c++) {
      const pt = dRow[c];
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  if (!Number.isFinite(minX) || maxX - minX < 0.5 || maxY - minY < 0.5) {
    return;
  }

  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = 'high';

  const midCol = (colCount - 1) * 0.5;
  for (let r = 0; r < rowCount - 1; r++) {
    const uvR0 = srcUvGrid[r];
    const uvR1 = srcUvGrid[r + 1];
    const ptR0 = dstPointGrid[r];
    const ptR1 = dstPointGrid[r + 1];

    for (let c = 0; c < colCount - 1; c++) {
      const u00 = uvR0[c];
      const u10 = uvR0[c + 1];
      const u01 = uvR1[c];
      const u11 = uvR1[c + 1];

      const p00 = ptR0[c];
      const p10 = ptR0[c + 1];
      const p01 = ptR1[c];
      const p11 = ptR1[c + 1];

      // Symmetric quad diagonal split around center column keeps bilateral silhouette smooth
      if (c < midCol) {
        drawTexturedTriangle(
          targetCtx,
          asset.canvas,
          u00.x,
          u00.y,
          u10.x,
          u10.y,
          u11.x,
          u11.y,
          p00.x,
          p00.y,
          p10.x,
          p10.y,
          p11.x,
          p11.y
        );
        drawTexturedTriangle(
          targetCtx,
          asset.canvas,
          u00.x,
          u00.y,
          u11.x,
          u11.y,
          u01.x,
          u01.y,
          p00.x,
          p00.y,
          p11.x,
          p11.y,
          p01.x,
          p01.y
        );
      } else {
        drawTexturedTriangle(
          targetCtx,
          asset.canvas,
          u00.x,
          u00.y,
          u10.x,
          u10.y,
          u01.x,
          u01.y,
          p00.x,
          p00.y,
          p10.x,
          p10.y,
          p01.x,
          p01.y
        );
        drawTexturedTriangle(
          targetCtx,
          asset.canvas,
          u10.x,
          u10.y,
          u11.x,
          u11.y,
          u01.x,
          u01.y,
          p10.x,
          p10.y,
          p11.x,
          p11.y,
          p01.x,
          p01.y
        );
      }
    }
  }

  if (!scratch) {
    return;
  }

  const { layerCanvas, layerCtx, outlineCanvas, outlineCtx } = scratch;
  const theme = options?.theme ?? 'light';
  const scale = options?.scale ?? 2.2;
  const isFarLimb = Boolean(options?.isFarLimb);
  const isDarkGarment = asset.meanLuminance < 52;

  // Post-pass cylindrical shading strictly masked to garment pixels via `source-atop`
  layerCtx.save();
  layerCtx.globalCompositeOperation = 'source-atop';

  const keyAlpha =
    options?.keyLightAlpha ?? (isFarLimb ? 0.04 : isDarkGarment ? 0.14 : 0.09);
  const shadowAlpha =
    options?.shadowAlpha ?? (isFarLimb ? 0.22 : isDarkGarment ? 0.14 : 0.16);

  // Cylindrical lateral + upper-front-left studio key-light gradient
  const cylGrad = layerCtx.createLinearGradient(
    minX,
    minY + (maxY - minY) * 0.12,
    maxX,
    minY + (maxY - minY) * 0.72
  );
  if (isFarLimb) {
    cylGrad.addColorStop(0, `rgba(18, 20, 28, ${(shadowAlpha * 0.65).toFixed(3)})`);
    cylGrad.addColorStop(0.55, `rgba(18, 20, 28, ${(shadowAlpha * 0.85).toFixed(3)})`);
    cylGrad.addColorStop(1, `rgba(14, 16, 24, ${shadowAlpha.toFixed(3)})`);
  } else {
    cylGrad.addColorStop(0, `rgba(255, 253, 248, ${keyAlpha.toFixed(3)})`);
    cylGrad.addColorStop(0.32, 'rgba(255, 255, 255, 0)');
    cylGrad.addColorStop(0.74, `rgba(22, 24, 32, ${(shadowAlpha * 0.48).toFixed(3)})`);
    cylGrad.addColorStop(1, `rgba(16, 18, 26, ${shadowAlpha.toFixed(3)})`);
  }
  layerCtx.fillStyle = cylGrad;
  layerCtx.fillRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);

  // Subtle lower-hem grounding gradient
  const hemGrad = layerCtx.createLinearGradient(0, maxY - (maxY - minY) * 0.22, 0, maxY);
  hemGrad.addColorStop(0, 'rgba(16, 18, 24, 0)');
  hemGrad.addColorStop(1, 'rgba(16, 18, 24, 0.09)');
  layerCtx.fillStyle = hemGrad;
  layerCtx.fillRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);

  layerCtx.restore();

  // Build crisp subtle isometric contour rim + soft layer-contact AO shadow on outlineCanvas
  const pad = 6;
  const bx = Math.max(0, Math.floor(minX - pad));
  const by = Math.max(0, Math.floor(minY - pad));
  const bw = Math.min(canvasW - bx, Math.ceil(maxX - minX + pad * 2));
  const bh = Math.min(canvasH - by, Math.ceil(maxY - minY + pad * 2));

  if (bw > 0 && bh > 0) {
    const contactDrop = options?.contactShadowPx ?? clamp(scale * 0.45, 0.8, 1.8);
    if (contactDrop > 0.1) {
      outlineCtx.clearRect(bx, by, bw, bh + 4);
      outlineCtx.drawImage(
        layerCanvas,
        bx,
        by,
        bw,
        bh,
        bx + contactDrop * 0.35,
        by + contactDrop,
        bw,
        bh
      );
      outlineCtx.globalCompositeOperation = 'source-in';
      outlineCtx.fillStyle =
        theme === 'dark' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(29, 29, 31, 0.11)';
      outlineCtx.fillRect(bx, by, bw + 3, bh + 4);
      outlineCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(outlineCanvas, bx, by, bw + 2, bh + 3, bx, by, bw + 2, bh + 3);
    }

    const contourAlpha =
      options?.contourAlpha ?? (theme === 'dark' ? 0.62 : isDarkGarment ? 0.52 : 0.42);
    if (contourAlpha > 0.02) {
      const r = clamp(scale * 0.46, 0.85, 1.42);
      outlineCtx.clearRect(bx, by, bw + 4, bh + 4);
      const dirs: ReadonlyArray< readonly [number, number] > = [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
        [r * 0.71, r * 0.71],
        [-r * 0.71, r * 0.71],
        [r * 0.71, -r * 0.71],
        [-r * 0.71, -r * 0.71],
      ];
      for (const [ox, oy] of dirs) {
        outlineCtx.drawImage(layerCanvas, bx, by, bw, bh, bx + ox, by + oy, bw, bh);
      }
      outlineCtx.globalCompositeOperation = 'source-in';
      outlineCtx.fillStyle =
        theme === 'dark'
          ? `rgba(12, 13, 18, ${contourAlpha.toFixed(3)})`
          : `rgba(29, 29, 31, ${contourAlpha.toFixed(3)})`;
      outlineCtx.fillRect(bx - 2, by - 2, bw + 6, bh + 6);
      outlineCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(outlineCanvas, bx, by, bw, bh, bx, by, bw, bh);
    }

    ctx.drawImage(layerCanvas, bx, by, bw, bh, bx, by, bw, bh);
  } else {
    ctx.drawImage(layerCanvas, 0, 0);
  }
}

// ============================================================================
// 4. Anatomical Multi-Angle Cage Builders (0°, ±45°, ±90°, ±135°, 180°)
// ============================================================================

function samplePolylineAt(pts: readonly Point2D[], t: number): Point2D {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const clamped = clamp(t, 0, 1) * (pts.length - 1);
  const i0 = Math.floor(clamped);
  const i1 = Math.min(pts.length - 1, i0 + 1);
  return lerpPoint(pts[i0], pts[i1], clamped - i0);
}

function sampleAssetRowSpan(asset: GarmentCutoutAsset, v: number): NormalizedRowSpan {
  const idx = clamp(
    Math.round(clamp(v, 0, 1) * (asset.rowSpans.length - 1)),
    0,
    asset.rowSpans.length - 1
  );
  return asset.rowSpans[idx];
}

function lerpRing(a: IsoCrossSectionRing, b: IsoCrossSectionRing, t: number): IsoCrossSectionRing {
  return {
    center: lerpPoint(a.center, b.center, t),
    left: lerpPoint(a.left, b.left, t),
    right: lerpPoint(a.right, b.right, t),
    front: lerpPoint(a.front, b.front, t),
    back: lerpPoint(a.back, b.back, t),
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
  };
}

/**
 * Maps a screen-space cylinder azimuth `phi` in `[-PI/2, +PI/2]` and camera yaw `yawRad`
 * to a normalized horizontal texel coordinate `u` in `[uLeftBound, uRightBound]`:
 * - Front (`0°`) & Quarter (`±45°`): shifts front garment detail toward `ring.front` by `sin(yawRad)`
 *   with realistic 3/4 wrap on the near side and foreshortening on the far side.
 * - Profile (`±90°`): wraps clean side-panel fabric from posterior spine/glute to anterior bust/belly.
 * - Back Quarter (`±135°`) & Back (`180°`): samples clean off-center fabric grain (avoiding front-only
 *   center buttons/zippers/logos in `u ∈ [0.44, 0.56]`) so back views show authentic photographic weave/quilting.
 */
function mapCylindricalTorsoU(
  phi: number,
  yawRad: number,
  uLeftBound: number,
  uRightBound: number,
  avoidBackCenterPlacket = true
): number {
  let bodyTheta = phi - yawRad;
  while (bodyTheta > Math.PI) bodyTheta -= Math.PI * 2;
  while (bodyTheta < -Math.PI) bodyTheta += Math.PI * 2;

  const absTheta = Math.abs(bodyTheta);
  const span = Math.max(0.08, uRightBound - uLeftBound);

  // Front hemisphere: [-PI/2 .. +PI/2] maps directly across [uLeftBound .. uRightBound]
  if (absTheta <= Math.PI * 0.52) {
    const tFront = clamp((bodyTheta / (Math.PI * 0.52) + 1) * 0.5, 0, 1);
    return uLeftBound + span * tFront;
  }

  // Posterior / side-back hemisphere: sample clean side-panel weave without front placket buttons/zipper
  if (!avoidBackCenterPlacket) {
    const backT = clamp((Math.PI - absTheta) / (Math.PI * 0.48), 0, 1);
    return bodyTheta >= 0
      ? lerp(uLeftBound + span * 0.5, uRightBound, backT)
      : lerp(uLeftBound + span * 0.5, uLeftBound, backT);
  }

  const backFrac = clamp((absTheta - Math.PI * 0.52) / (Math.PI * 0.48), 0, 1);
  if (bodyTheta >= 0) {
    // Wrap smoothly from right torso seam inward across clean right-side fabric panel [0.58 .. 0.88] of torso span
    return lerp(uRightBound - span * 0.04, uLeftBound + span * 0.62, backFrac * 0.85);
  }
  // Wrap smoothly from left torso seam inward across clean left-side fabric panel [0.12 .. 0.42] of torso span
  return lerp(uLeftBound + span * 0.04, uLeftBound + span * 0.38, backFrac * 0.85);
}

/**
 * Evaluates a Lofted Torso Cross-Section slice `(xL, yL, xR, yR, frontDropY)` at normalized
 * torso vertical parameter `s ∈ [0, 1.45]` (`0` = neck base, `1` = crotch, `>1` = coat/dress skirt extension).
 */
function sampleLoftedTorsoSlice(
  frame: IsometricBodyFrame,
  s: number,
  loftPx: number,
  drapeRelax = 0.25,
  hemFlarePx = 0
): { left: Point2D; right: Point2D; camSagY: number } {
  if (s <= 0) {
    const tNeck = clamp(1 + s * 3.2, 0, 1);
    const nRing = lerpRing(frame.neckTopRing, frame.neckBaseRing, tNeck);
    const collarLoft = loftPx * 0.48;
    return {
      left: { x: nRing.left.x - collarLoft, y: nRing.left.y },
      right: { x: nRing.right.x + collarLoft, y: nRing.right.y },
      camSagY: Math.max(1.2, nRing.ry * 0.72),
    };
  }

  if (s <= 1) {
    const rawL = samplePolylineAt(frame.torsoLeftContour, s);
    const rawR = samplePolylineAt(frame.torsoRightContour, s);

    // Garment drape bridges concave waist/underbust hollows slightly while never clipping convex bust/belly/hips
    const chestL = samplePolylineAt(frame.torsoLeftContour, 0.28);
    const chestR = samplePolylineAt(frame.torsoRightContour, 0.28);
    const hipL = samplePolylineAt(frame.torsoLeftContour, 0.84);
    const hipR = samplePolylineAt(frame.torsoRightContour, 0.84);
    const chordT = clamp((s - 0.28) / 0.56, 0, 1);
    const bridgedLeftX = lerp(chestL.x, hipL.x, chordT);
    const bridgedRightX = lerp(chestR.x, hipR.x, chordT);

    const drapedLeftX =
      s >= 0.28 && s <= 0.84
        ? Math.min(rawL.x, lerp(rawL.x, bridgedLeftX, drapeRelax))
        : rawL.x;
    const drapedRightX =
      s >= 0.28 && s <= 0.84
        ? Math.max(rawR.x, lerp(rawR.x, bridgedRightX, drapeRelax))
        : rawR.x;

    // Guarantee extra clearance over anterior bustApex, abdomenApex & posterior gluteApex at all 8 angles
    let minAllowedX = drapedLeftX - loftPx;
    let maxAllowedX = drapedRightX + loftPx;

    if (s >= 0.2 && s <= 0.42) {
      minAllowedX = Math.min(
        minAllowedX,
        Math.min(frame.bustApexLeft.x, frame.bustApexRight.x) - loftPx * 0.92
      );
      maxAllowedX = Math.max(
        maxAllowedX,
        Math.max(frame.bustApexLeft.x, frame.bustApexRight.x) + loftPx * 0.92
      );
    }
    if (s >= 0.52 && s <= 0.78) {
      minAllowedX = Math.min(minAllowedX, frame.abdomenApex.x - loftPx * 1.05);
      maxAllowedX = Math.max(maxAllowedX, frame.abdomenApex.x + loftPx * 1.05);
    }
    if (s >= 0.78 && s <= 0.98) {
      minAllowedX = Math.min(minAllowedX, frame.gluteApex.x - loftPx);
      maxAllowedX = Math.max(maxAllowedX, frame.gluteApex.x + loftPx);
    }

    const halfW = Math.max(4, (maxAllowedX - minAllowedX) * 0.5);
    return {
      left: { x: minAllowedX, y: rawL.y },
      right: { x: maxAllowedX, y: rawR.y },
      camSagY: halfW * Math.sin(frame.elevRad) * 0.52,
    };
  }

  // Below crotch (`s > 1`): span outer contours of both legs with A-line / coat flare
  const legT = clamp((s - 1) * 1.35 + 0.16, 0.16, 0.98);
  const lOuter = samplePolylineAt(frame.leftLeg.outerContour, legT);
  const lInner = samplePolylineAt(frame.leftLeg.innerContour, legT);
  const rOuter = samplePolylineAt(frame.rightLeg.outerContour, legT);
  const rInner = samplePolylineAt(frame.rightLeg.innerContour, legT);

  const allXs = [lOuter.x, lInner.x, rOuter.x, rInner.x];
  const flare = hemFlarePx * Math.pow(clamp((s - 1) / 0.5, 0, 1.3), 0.85);
  const minLegX = Math.min(...allXs) - loftPx - flare;
  const maxLegX = Math.max(...allXs) + loftPx + flare;
  const meanY = (lOuter.y + rOuter.y) * 0.5;
  const halfW = Math.max(6, (maxLegX - minLegX) * 0.5);

  return {
    left: { x: minLegX, y: meanY },
    right: { x: maxLegX, y: meanY },
    camSagY: halfW * Math.sin(frame.elevRad) * 0.58,
  };
}

function createArmSleevePass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  arm: IsoArmChain,
  asset: GarmentCutoutAsset,
  classification: GarmentGeometryClassification,
  loftPx: number,
  isFarArm: boolean
): () => void {
  if (classification.sleeveMode === 'sleeveless') {
    return () => {};
  }

  const endArmT =
    classification.sleeveMode === 'short'
      ? 0.34
      : classification.sleeveMode === 'three_quarter'
        ? 0.73
        : 0.98;

  // Wearer's anatomical right arm corresponds to left side of front packshot (`u near 0`);
  // anatomical left arm corresponds to right side of front packshot (`u near 1`).
  const useLeftImageSleeve = arm.side === 'right';
  const rows = 9;
  const cols = 5;

  return () => {
    const srcUvGrid: Point2D[][] = [];
    const dstPointGrid: Point2D[][] = [];

    const sleeveThickU = clamp(
      useLeftImageSleeve ? asset.cuffSpanLeft * 1.12 : asset.cuffSpanRight * 1.12,
      0.11,
      0.24
    );

    const cuffFlareMul =
      classification.sleeveMode === 'short'
        ? 1.28
        : classification.outerTier === 'padding_puffer'
          ? 1.18
          : 1.0;

    for (let r = 0; r <= rows; r++) {
      const tRow = r / rows;
      const armT = tRow * endArmT;
      const vImg = lerp(asset.vSleeveStart, asset.vSleeveEnd, tRow);
      const span = sampleAssetRowSpan(asset, vImg);

      let uStart: number;
      let uEnd: number;
      if (useLeftImageSleeve) {
        uStart = clamp(span.uLeft, 0.0, 0.32);
        uEnd = clamp(uStart + sleeveThickU, uStart + 0.08, Math.min(0.46, asset.uTorsoLeft + 0.06));
      } else {
        uEnd = clamp(span.uRight, 0.68, 1.0);
        uStart = clamp(
          uEnd - sleeveThickU,
          Math.max(0.54, asset.uTorsoRight - 0.06),
          uEnd - 0.08
        );
      }

      const outerPt = samplePolylineAt(arm.outerContour, armT);
      const innerPt = samplePolylineAt(arm.innerContour, armT);

      let wx = outerPt.x - innerPt.x;
      let wy = outerPt.y - innerPt.y;
      const wLen = Math.hypot(wx, wy);
      if (wLen < 1e-3) {
        wx = arm.side === 'left' ? 1 : -1;
        wy = 0;
      } else {
        wx /= wLen;
        wy /= wLen;
      }

      const localLoft = loftPx * 0.74 * lerp(1.0, cuffFlareMul, Math.pow(tRow, 1.4));
      let expOuter: Point2D = {
        x: outerPt.x + wx * localLoft,
        y: outerPt.y + wy * localLoft - (r === 0 ? loftPx * 0.55 : 0),
      };
      let expInner: Point2D = {
        x: innerPt.x - wx * localLoft * 0.82,
        y: innerPt.y - wy * localLoft * 0.82 - (r === 0 ? loftPx * 0.45 : 0),
      };

      // Anchor proximal shoulder cap smoothly into trapezius/clavicle shoulder seam
      if (r === 0) {
        const capShiftY = -arm.radii.shoulder * 0.52 - loftPx * 0.35;
        expOuter = { x: expOuter.x, y: expOuter.y + capShiftY };
        expInner = {
          x: lerp(expInner.x, frame.clavicleRing.center.x, 0.22),
          y: expInner.y + capShiftY * 0.85,
        };
      }

      const leftScreenPt = expOuter.x <= expInner.x ? expOuter : expInner;
      const rightScreenPt = expOuter.x <= expInner.x ? expInner : expOuter;
      const halfSpan = Math.max(2, (rightScreenPt.x - leftScreenPt.x) * 0.5);
      const cuffArcY = halfSpan * Math.sin(frame.elevRad) * 0.46;

      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        const phi = (tc - 0.5) * Math.PI;
        const cylT = (Math.sin(phi) + 1) * 0.5;
        uvRow.push({
          x: lerp(uStart, uEnd, tc),
          y: vImg,
        });
        dstRow.push({
          x: lerp(leftScreenPt.x, rightScreenPt.x, cylT),
          y: lerp(leftScreenPt.y, rightScreenPt.y, cylT) + Math.cos(phi) * cuffArcY,
        });
      }

      srcUvGrid.push(uvRow);
      dstPointGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcUvGrid, dstPointGrid, {
      theme: frame.theme,
      scale: frame.scale,
      yawRad: frame.yawRad,
      isFarLimb: isFarArm && Math.abs(Math.sin(frame.yawRad)) > 0.18,
      contactShadowPx: isFarArm ? 0.5 : 1.3,
    });
  };
}

/**
 * Builds `{ farSleeve, bodyTorso, nearSleeve }` draw calls for upper garments
 * (`top`, `outer`, `onepiece`, `swimwear` tops/rashguards/swimsuits) across all 8 angles.
 */
export function createUpperGarmentWarpPass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  garment: GarmentInputRecord
): UpperGarmentDrawPass {
  const classification = classifyGarmentGeometry(garment, asset);
  const loftPx = getGarmentLayerLoftPx(classification, frame);
  const sub = String(garment.subcategory || '').toLowerCase();
  const name = `${String(garment.name || '')} ${String(garment.name_en || '')}`.trim();

  // Determine vertical torso start `sStart` and hem `sEnd`
  const isHighCollar =
    sub === 'padding' ||
    sub === 'trench' ||
    sub === 'coat' ||
    sub === 'knit' ||
    sub === 'hoodie' ||
    /터틀넥|목폴라|하이넥|집업|패딩|트렌치|코트|후드|turtleneck|mock.?neck|high.?neck|padding|trench|coat|hoodie/i.test(
      name
    );

  const isLowNeckSwimOrSlip =
    classification.isSwimOnepiece ||
    sub === 'camisole' ||
    sub === 'inner_top' ||
    /비키니|수영복|캐미솔|슬립|튜브탑|브라탑|bikini|swimsuit|camisole|\bslip\b|bra.?top/i.test(name);

  let sStart = isHighCollar ? -0.14 : isLowNeckSwimOrSlip ? 0.16 : 0.01;
  if (frame.facingBack && isLowNeckSwimOrSlip) {
    sStart = 0.14;
  } else if (frame.facingBack && !isHighCollar) {
    // Raise back collar cleanly to neckBaseRing.back so front V-cuts/lapels never appear on spine
    sStart = -0.03;
  }

  let sEnd = 0.88;
  let drapeRelax = 0.34;
  let hemFlarePx = 0;

  if (classification.slotRole === 'swimwear') {
    if (/브라탑|스포츠브라|비키니탑|크롭|sports.?bra|bikini.?top|crop/i.test(name)) {
      sEnd = 0.44;
      drapeRelax = 0.06;
    } else if (classification.isSwimOnepiece) {
      sEnd = 0.99;
      drapeRelax = 0.05;
    } else {
      sEnd = 0.84;
      drapeRelax = 0.12;
    }
  } else if (classification.slotRole === 'onepiece') {
    drapeRelax = 0.22;
    if (/미니|숏|롬퍼|mini|romper|short/i.test(name)) {
      sEnd = 1.24;
      hemFlarePx = 5.5 * frame.scale;
    } else {
      sEnd = 1.54;
      hemFlarePx = 9.5 * frame.scale;
    }
  } else if (classification.slotRole === 'outer') {
    drapeRelax = classification.outerTier === 'padding_puffer' ? 0.62 : 0.52;
    if (classification.isLongCoatHem) {
      sEnd = 1.38;
      hemFlarePx = 7.2 * frame.scale;
    } else if (sub === 'blazer' || /블레이저|마이|수트|blazer|suit/i.test(name)) {
      sEnd = 0.97;
      hemFlarePx = 2.0 * frame.scale;
    } else {
      sEnd = 0.91;
    }
  } else {
    // Standard top
    if (/크롭|cropped|\bcrop\b/i.test(name)) {
      sEnd = 0.56;
      drapeRelax = 0.24;
    } else {
      sEnd = 0.88;
      drapeRelax = 0.34;
    }
  }

  // UV vertical bounds on asset.canvas
  const vTopFront = 0.01;
  // On back views, skip open front collar V-notch if collarOpeningWidth is wide
  const vTop = frame.facingBack && !isHighCollar ? 0.07 : vTopFront;
  const vBottom = 0.985;

  const farArm = frame.farArmSide === 'left' ? frame.leftArm : frame.rightArm;
  const nearArm = frame.nearArmSide === 'left' ? frame.leftArm : frame.rightArm;

  const farSleeve = createArmSleevePass(
    ctx,
    frame,
    farArm,
    asset,
    classification,
    loftPx,
    true
  );
  const nearSleeve = createArmSleevePass(
    ctx,
    frame,
    nearArm,
    asset,
    classification,
    loftPx,
    false
  );

  // Special case: Bifurcated jumpsuit (`onepiece` with detected `vCrotch`)
  const isJumpsuit =
    classification.slotRole === 'onepiece' &&
    (/점프수트|오버올|롬퍼|jumpsuit|overall|romper/i.test(name) ||
      (asset.vCrotch !== null && asset.vCrotch > 0.42 && !/원피스|드레스|dress/i.test(name)));

  const bodyTorso = (): void => {
    const rows = classification.slotRole === 'onepiece' || classification.isLongCoatHem ? 14 : 11;
    const cols = 8;
    const torsoEndS = isJumpsuit ? 0.98 : sEnd;
    const torsoEndV = isJumpsuit && asset.vCrotch ? asset.vCrotch : vBottom;

    const srcUvGrid: Point2D[][] = [];
    const dstPointGrid: Point2D[][] = [];

    for (let r = 0; r <= rows; r++) {
      const tr = r / rows;
      const s = lerp(sStart, torsoEndS, tr);
      const vImg = lerp(vTop, torsoEndV, tr);
      const span = sampleAssetRowSpan(asset, vImg);

      // Keep torso UV strictly inside solid garment body (excluding outer hanging sleeves)
      let uBodyL = asset.uTorsoLeft;
      let uBodyR = asset.uTorsoRight;
      if (vImg < 0.12) {
        uBodyL = Math.max(span.uLeft, asset.uTorsoLeft - 0.04);
        uBodyR = Math.min(span.uRight, asset.uTorsoRight + 0.04);
      } else if (vImg > asset.vSleeveEnd + 0.04 && span.width > 0.2) {
        // Below sleeve cuffs (e.g. trench coat skirt or A-line dress skirt), use full skirt width!
        uBodyL = span.uLeft + 0.01;
        uBodyR = span.uRight - 0.01;
      } else {
        uBodyL = Math.max(span.uLeft + 0.01, asset.uTorsoLeft);
        uBodyR = Math.min(span.uRight - 0.01, asset.uTorsoRight);
      }
      if (uBodyR - uBodyL < 0.16) {
        uBodyL = 0.24;
        uBodyR = 0.76;
      }

      const slice = sampleLoftedTorsoSlice(frame, s, loftPx, drapeRelax, hemFlarePx);
      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];

      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        const phi = (tc - 0.5) * Math.PI;
        const cylX = (Math.sin(phi) + 1) * 0.5;
        const uSample = mapCylindricalTorsoU(phi, frame.yawRad, uBodyL, uBodyR, true);

        // Gently lift back collar rim on back views so neck opening curves naturally
        const collarBackCurve =
          r === 0 && frame.facingBack ? -Math.cos(phi) * 1.8 * frame.scale : Math.cos(phi) * slice.camSagY;

        uvRow.push({ x: uSample, y: vImg });
        dstRow.push({
          x: lerp(slice.left.x, slice.right.x, cylX),
          y: lerp(slice.left.y, slice.right.y, cylX) + collarBackCurve,
        });
      }

      srcUvGrid.push(uvRow);
      dstPointGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcUvGrid, dstPointGrid, {
      theme: frame.theme,
      scale: frame.scale,
      yawRad: frame.yawRad,
      contactShadowPx:
        classification.slotRole === 'outer'
          ? clamp(frame.scale * 0.85, 1.4, 2.8)
          : clamp(frame.scale * 0.5, 0.9, 1.8),
    });

    if (isJumpsuit) {
      const jumpPass = createBottomGarmentWarpPass(
        ctx,
        frame,
        asset,
        {
          ...classification,
          slotRole: 'bottom',
          bottomMode: /롬퍼|쇼츠|romper|short/i.test(name) ? 'shorts' : 'wide_pants',
        },
        'pants_over_shoes',
        asset.vCrotch ?? 0.52
      );
      jumpPass.farLegPanel();
      jumpPass.nearLegPanel();
    }
  };

  return { farSleeve, bodyTorso, nearSleeve };
}

function warpSingleTrouserLeg(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  leg: IsoLegChain,
  asset: GarmentCutoutAsset,
  classification: GarmentGeometryClassification,
  loftPx: number,
  vLegStart: number,
  endLegT: number,
  isFarLeg: boolean
): void {
  // Wearer's anatomical right leg corresponds to left half of front trouser packshot
  const useLeftImageLeg = leg.side === 'right';
  const rows = 9;
  const cols = 5;

  const widthMul =
    classification.bottomMode === 'wide_pants'
      ? 1.68
      : classification.bottomMode === 'cargo_pants'
        ? 1.52
        : classification.bottomMode === 'bermuda' || classification.bottomMode === 'shorts'
          ? 1.32
          : 0.95;

  const srcUvGrid: Point2D[][] = [];
  const dstPointGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const legT = tr * endLegT;
    const vImg = lerp(vLegStart, 0.985, tr);
    const span = sampleAssetRowSpan(asset, vImg);

    let u0: number;
    let u1: number;
    if (useLeftImageLeg) {
      u0 = clamp(span.uLeft + 0.008, 0.0, 0.36);
      u1 = clamp(span.leftBranchEnd - 0.008, u0 + 0.1, 0.495);
    } else {
      u0 = clamp(span.rightBranchStart + 0.008, 0.505, 0.88);
      u1 = clamp(span.uRight - 0.008, u0 + 0.1, 1.0);
    }

    const outerPt = samplePolylineAt(leg.outerContour, Math.min(1, legT));
    const innerPt = samplePolylineAt(leg.innerContour, Math.min(1, legT));

    // Slight drape extension over vamp when wide_pants endLegT > 1
    const extraDropY = legT > 1 ? (legT - 1) * 18 * frame.scale : 0;

    let wx = outerPt.x - innerPt.x;
    let wy = outerPt.y - innerPt.y;
    const wLen = Math.hypot(wx, wy);
    if (wLen < 1e-3) {
      wx = leg.side === 'left' ? 1 : -1;
      wy = 0;
    } else {
      wx /= wLen;
      wy /= wLen;
    }

    // Wide pants keep straight vertical column hang from thigh width down to hem
    const thighHalfW = leg.radii.thigh;
    const naturalHalfW = Math.max(3, wLen * 0.5);
    const targetExtra =
      classification.bottomMode === 'wide_pants'
        ? Math.max(loftPx * widthMul, (thighHalfW * 0.92 - naturalHalfW) + loftPx * 1.15)
        : classification.bottomMode === 'cargo_pants'
          ? loftPx * widthMul * (1 + Math.sin(tr * Math.PI) * 0.25)
          : loftPx * widthMul;

    const pOut: Point2D = {
      x: outerPt.x + wx * targetExtra,
      y: outerPt.y + wy * targetExtra + extraDropY,
    };
    const pIn: Point2D = {
      x: innerPt.x - wx * (targetExtra * 0.88),
      y: innerPt.y - wy * (targetExtra * 0.88) + extraDropY,
    };

    const leftScreen = pOut.x <= pIn.x ? pOut : pIn;
    const rightScreen = pOut.x <= pIn.x ? pIn : pOut;
    const halfSpan = Math.max(3, (rightScreen.x - leftScreen.x) * 0.5);
    const hemArcY = halfSpan * Math.sin(frame.elevRad) * 0.48;

    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];

    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const phi = (tc - 0.5) * Math.PI;
      const cylX = (Math.sin(phi) + 1) * 0.5;
      // On back views, sample inner central denim/wool grain avoiding side seam edge artifacts
      const uSample = frame.facingBack
        ? lerp(lerp(u0, u1, 0.12), lerp(u0, u1, 0.88), tc)
        : lerp(u0, u1, tc);

      uvRow.push({ x: uSample, y: vImg });
      dstRow.push({
        x: lerp(leftScreen.x, rightScreen.x, cylX),
        y: lerp(leftScreen.y, rightScreen.y, cylX) + Math.cos(phi) * hemArcY,
      });
    }

    srcUvGrid.push(uvRow);
    dstPointGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcUvGrid, dstPointGrid, {
    theme: frame.theme,
    scale: frame.scale,
    yawRad: frame.yawRad,
    isFarLimb: isFarLeg && Math.abs(Math.sin(frame.yawRad)) > 0.18,
    contactShadowPx: isFarLeg ? 0.6 : 1.3,
  });
}

/**
 * Builds `{ farLegPanel, nearLegPanel, isSkirt }` draw calls for bottoms & swimwear bottoms
 * (`bikini_brief`, `swim_trunks`, `shorts`, `bermuda`, `mini_skirt`, `midi_skirt`,
 * `slim_pants`, `wide_pants`, `cargo_pants`).
 */
export function createBottomGarmentWarpPass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  classificationInput?: GarmentGeometryClassification,
  overlapMode: BottomShoeOverlapMode = 'pants_over_shoes',
  vStartOverride?: number
): BottomGarmentDrawPass {
  const classification = classificationInput ?? classifyGarmentGeometry(undefined, asset);
  const loftPx = getGarmentLayerLoftPx(classification, frame);
  const mode = classification.bottomMode;

  const isSkirt = mode === 'mini_skirt' || mode === 'midi_skirt';
  const isBrief = mode === 'bikini_brief';

  if (isSkirt || isBrief) {
    const sWaist = isBrief ? 0.75 : 0.53;
    const sHem =
      isBrief ? 1.01 : mode === 'mini_skirt' ? 1.23 : 1.52;
    const hemFlarePx =
      isBrief ? 0 : mode === 'mini_skirt' ? 6.2 * frame.scale : 10.5 * frame.scale;

    return {
      isSkirt: true,
      farLegPanel: () => {},
      nearLegPanel: () => {
        const rows = isBrief ? 6 : 11;
        const cols = 8;
        const srcUvGrid: Point2D[][] = [];
        const dstPointGrid: Point2D[][] = [];

        for (let r = 0; r <= rows; r++) {
          const tr = r / rows;
          const s = lerp(sWaist, sHem, tr);
          const vImg = lerp(vStartOverride ?? 0.02, 0.985, tr);
          const span = sampleAssetRowSpan(asset, vImg);
          const uL = clamp(span.uLeft + 0.01, 0.02, 0.35);
          const uR = clamp(span.uRight - 0.01, 0.65, 0.98);

          const slice = sampleLoftedTorsoSlice(
            frame,
            s,
            loftPx,
            isBrief ? 0.04 : 0.32,
            hemFlarePx
          );

          const uvRow: Point2D[] = [];
          const dstRow: Point2D[] = [];
          for (let c = 0; c <= cols; c++) {
            const tc = c / cols;
            const phi = (tc - 0.5) * Math.PI;
            const cylX = (Math.sin(phi) + 1) * 0.5;
            const uSample = mapCylindricalTorsoU(phi, frame.yawRad, uL, uR, true);
            uvRow.push({ x: uSample, y: vImg });
            dstRow.push({
              x: lerp(slice.left.x, slice.right.x, cylX),
              y: lerp(slice.left.y, slice.right.y, cylX) + Math.cos(phi) * slice.camSagY,
            });
          }
          srcUvGrid.push(uvRow);
          dstPointGrid.push(dstRow);
        }

        warpStructuredGrid(ctx, asset, srcUvGrid, dstPointGrid, {
          theme: frame.theme,
          scale: frame.scale,
          yawRad: frame.yawRad,
          contactShadowPx: isBrief ? 0.6 : 1.5,
        });
      },
    };
  }

  // Bifurcated trousers / shorts / bermuda / swim_trunks
  let endLegT = 0.98;
  if (mode === 'swim_trunks') {
    endLegT = 0.25;
  } else if (mode === 'shorts') {
    endLegT = 0.34;
  } else if (mode === 'bermuda') {
    endLegT = 0.48;
  } else if (mode === 'slim_pants') {
    endLegT = overlapMode === 'boots_over_pants' ? 0.92 : 0.97;
  } else if (mode === 'cargo_pants') {
    endLegT = overlapMode === 'boots_over_pants' ? 0.93 : 0.99;
  } else {
    // wide_pants
    endLegT = overlapMode === 'pants_over_shoes' ? 1.03 : 0.95;
  }

  const vRiseTop = vStartOverride ?? 0.015;
  const vSplit = clamp(
    asset.vCrotch ?? (mode === 'shorts' || mode === 'swim_trunks' ? 0.52 : 0.3),
    vRiseTop + 0.12,
    0.72
  );

  const farLeg = frame.farLegSide === 'left' ? frame.leftLeg : frame.rightLeg;
  const nearLeg = frame.nearLegSide === 'left' ? frame.leftLeg : frame.rightLeg;

  const sWaistband = mode === 'swim_trunks' ? 0.68 : 0.54;

  const farLegPanel = (): void => {
    warpSingleTrouserLeg(
      ctx,
      frame,
      farLeg,
      asset,
      classification,
      loftPx,
      vSplit,
      endLegT,
      true
    );
  };

  const nearLegPanel = (): void => {
    // 1. Warp near leg tube first, then seamless pelvic/waistband rise block uniting waistband -> hips -> crotch
    warpSingleTrouserLeg(
      ctx,
      frame,
      nearLeg,
      asset,
      classification,
      loftPx,
      vSplit,
      endLegT,
      false
    );

    const riseRows = 6;
    const riseCols = 8;
    const srcRiseGrid: Point2D[][] = [];
    const dstRiseGrid: Point2D[][] = [];

    for (let r = 0; r <= riseRows; r++) {
      const tr = r / riseRows;
      const s = lerp(sWaistband, 1.02, tr);
      const vImg = lerp(vRiseTop, Math.min(0.92, vSplit + 0.04), tr);
      const span = sampleAssetRowSpan(asset, vImg);
      const uL = clamp(span.uLeft + 0.01, 0.02, 0.32);
      const uR = clamp(span.uRight - 0.01, 0.68, 0.98);

      const slice = sampleLoftedTorsoSlice(frame, s, loftPx * 1.02, 0.28, 0);
      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];

      for (let c = 0; c <= riseCols; c++) {
        const tc = c / riseCols;
        const phi = (tc - 0.5) * Math.PI;
        const cylX = (Math.sin(phi) + 1) * 0.5;
        // Avoid front button/zipper fly on back glute views
        const uSample = mapCylindricalTorsoU(phi, frame.yawRad, uL, uR, true);
        uvRow.push({ x: uSample, y: vImg });
        dstRow.push({
          x: lerp(slice.left.x, slice.right.x, cylX),
          y: lerp(slice.left.y, slice.right.y, cylX) + Math.cos(phi) * slice.camSagY,
        });
      }

      srcRiseGrid.push(uvRow);
      dstRiseGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcRiseGrid, dstRiseGrid, {
      theme: frame.theme,
      scale: frame.scale,
      yawRad: frame.yawRad,
      contactShadowPx: 0.9,
    });
  };

  return { farLegPanel, nearLegPanel, isSkirt: false };
}

// ============================================================================
// 5. Footwear & Barefoot-Preserving Sandal/Flip-Flop Warper
// ============================================================================

function computeFootToeCenter(leg: IsoLegChain): Point2D {
  if (leg.toeTips.length === 0) {
    return lerpPoint(leg.heel, leg.ballOfFoot, 1.35);
  }
  let sx = 0;
  let sy = 0;
  for (const t of leg.toeTips) {
    sx += t.x;
    sy += t.y;
  }
  return { x: sx / leg.toeTips.length, y: sy / leg.toeTips.length };
}

function warpSingleFootShoe(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  leg: IsoLegChain,
  asset: GarmentCutoutAsset,
  classification: GarmentGeometryClassification,
  isFarFoot: boolean
): void {
  const shoeMode = classification.shoeMode;
  const toeCenter = computeFootToeCenter(leg);
  const footW = leg.radii.footWidth;
  const instepH = leg.radii.instepHeight;
  const scale = frame.scale;

  // Open barefoot-preserving footwear: flip_flops, strap_sandals, slides
  // Barefoot (toes, instep, MST skin tone) is already drawn underneath; warp real sandal sole/straps cleanly over arch & sole!
  if (classification.isBarefootVisibleShoe) {
    const useLeftPairHalf = leg.side === 'right';
    const u0 = asset.hasVerticalPairSplit
      ? useLeftPairHalf
        ? 0.02
        : asset.uPairSplit + 0.02
      : 0.04;
    const u1 = asset.hasVerticalPairSplit
      ? useLeftPairHalf
        ? asset.uPairSplit - 0.02
        : 0.98
      : 0.96;

    const heelBase: Point2D = {
      x: leg.heel.x,
      y: leg.heel.y + 1.0 * scale,
    };
    const foreBase: Point2D = lerpPoint(leg.ballOfFoot, toeCenter, 0.58);
    let dx = foreBase.x - heelBase.x;
    let dy = foreBase.y - heelBase.y;
    const fLen = Math.hypot(dx, dy);
    const latX = fLen > 1 ? -dy / fLen : 1;
    const latY = fLen > 1 ? dx / fLen : 0;
    const halfW = footW * 0.95;

    const rows = 5;
    const cols = 4;
    const srcGrid: Point2D[][] = [];
    const dstGrid: Point2D[][] = [];

    if (asset.hasVerticalPairSplit || fLen < footW * 0.75) {
      // Top-down pair UV: v=0 heel -> v=1 toe strap
      for (let r = 0; r <= rows; r++) {
        const tr = r / rows;
        const spine = lerpPoint(heelBase, foreBase, tr);
        const archLift = Math.sin(tr * Math.PI) * instepH * 0.42;
        const uvRow: Point2D[] = [];
        const dstRow: Point2D[] = [];
        for (let c = 0; c <= cols; c++) {
          const tc = c / cols;
          const off = (tc - 0.5) * 2 * halfW;
          uvRow.push({ x: lerp(u0, u1, tc), y: lerp(0.06, 0.92, tr) });
          dstRow.push({
            x: spine.x + latX * off,
            y: spine.y + latY * off * 0.45 - archLift * (1 - Math.abs(tc - 0.5)),
          });
        }
        srcGrid.push(uvRow);
        dstGrid.push(dstRow);
      }
    } else {
      // Side / 3/4 profile sandal/slide cutout
      const cutoutFacesRight = asset.upperMassCenterX <= 0.52;
      const footFacesRight = dx >= 0;
      const flipU = cutoutFacesRight !== footFacesRight;

      const topRear = { x: heelBase.x, y: leg.instep.y - instepH * 0.25 };
      const topFront = { x: foreBase.x, y: leg.instep.y - instepH * 0.15 };
      const botRear = { x: heelBase.x, y: heelBase.y + 1.8 * scale };
      const botFront = { x: foreBase.x, y: foreBase.y + 1.8 * scale };

      for (let r = 0; r <= rows; r++) {
        const tr = r / rows;
        const leftPt = lerpPoint(topRear, botRear, tr);
        const rightPt = lerpPoint(topFront, botFront, tr);
        const uvRow: Point2D[] = [];
        const dstRow: Point2D[] = [];
        for (let c = 0; c <= cols; c++) {
          const tc = c / cols;
          const uRaw = lerp(0.03, 0.97, flipU ? 1 - tc : tc);
          uvRow.push({ x: uRaw, y: lerp(0.12, 0.96, tr) });
          dstRow.push(lerpPoint(leftPt, rightPt, tc));
        }
        srcGrid.push(uvRow);
        dstGrid.push(dstRow);
      }
    }

    warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
      theme: frame.theme,
      scale: frame.scale,
      yawRad: frame.yawRad,
      isFarLimb: isFarFoot,
      contactShadowPx: 0.8,
    });
    return;
  }

  // Closed shoes, heels & boots
  const isBoot =
    shoeMode === 'ankle_boots' || shoeMode === 'long_boots' || shoeMode === 'snow_boots';
  const shaftLegT =
    shoeMode === 'long_boots'
      ? 0.56
      : shoeMode === 'snow_boots'
        ? 0.72
        : shoeMode === 'ankle_boots'
          ? 0.84
          : 0.96;

  const bootLoft =
    shoeMode === 'snow_boots'
      ? 4.6 * (scale / 2.4)
      : shoeMode === 'long_boots'
        ? 2.8 * (scale / 2.4)
        : 2.1 * (scale / 2.4);

  const fwdDx = toeCenter.x - leg.heel.x;
  const isProfileFoot = Math.abs(fwdDx) >= footW * 0.52;

  // Case A: Cutout is a top-down vertical pair (`white-sneakers.webp`, `black-loafers.webp`)
  if (asset.hasVerticalPairSplit) {
    const useLeftPairHalf = leg.side === 'right';
    const uShoe0 = useLeftPairHalf ? 0.02 : asset.uPairSplit + 0.02;
    const uShoe1 = useLeftPairHalf ? asset.uPairSplit - 0.02 : 0.98;

    const heelCap: Point2D = {
      x: leg.heel.x - Math.sign(fwdDx || (leg.side === 'left' ? 1 : -1)) * footW * 0.22,
      y: leg.ankle.y - 1.2 * scale,
    };
    const toeCap: Point2D = {
      x: toeCenter.x + Math.sign(fwdDx || 0) * footW * 0.28,
      y: Math.max(toeCenter.y, leg.ballOfFoot.y) + 1.8 * scale,
    };

    const spinePts: Point2D[] = frame.facingBack
      ? [
          { x: leg.ankle.x, y: leg.ankle.y - 1.5 * scale },
          { x: leg.heel.x, y: lerp(leg.ankle.y, leg.heel.y, 0.55) },
          { x: leg.heel.x, y: leg.heel.y + 2.2 * scale },
        ]
      : [
          heelCap,
          { x: leg.instep.x, y: leg.instep.y - 0.8 * scale },
          { x: lerp(leg.ballOfFoot.x, toeCap.x, 0.48), y: lerp(leg.instep.y, toeCap.y, 0.58) },
          toeCap,
        ];

    const shoeHalfW = footW * 1.18 + bootLoft * 0.5;
    const rows = 7;
    const cols = 5;
    const srcGrid: Point2D[][] = [];
    const dstGrid: Point2D[][] = [];

    for (let r = 0; r <= rows; r++) {
      const tr = r / rows;
      const center = samplePolylineAt(spinePts, tr);
      const widthEnv = frame.facingBack
        ? lerp(0.92, 1.05, Math.sin(tr * Math.PI * 0.85))
        : lerp(0.84, 1.08, Math.sin(clamp(tr * 1.05, 0.12, 0.92) * Math.PI));
      const localHalfW = shoeHalfW * widthEnv;
      const archCurveY = Math.sin(tr * Math.PI) * 2.2 * scale;

      const vSample = frame.facingBack
        ? lerp(0.03, 0.34, tr)
        : lerp(0.04, 0.97, tr);

      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        const phi = (tc - 0.5) * Math.PI;
        const cylX = Math.sin(phi);
        uvRow.push({ x: lerp(uShoe0, uShoe1, tc), y: vSample });
        dstRow.push({
          x: center.x + cylX * localHalfW,
          y: center.y + Math.cos(phi) * archCurveY * (frame.facingBack ? 0.5 : 0.85),
        });
      }
      srcGrid.push(uvRow);
      dstGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
      theme: frame.theme,
      scale: frame.scale,
      yawRad: frame.yawRad,
      isFarLimb: isFarFoot && Math.abs(Math.sin(frame.yawRad)) > 0.18,
      contactShadowPx: 1.5,
    });
    return;
  }

  // Case B: Cutout is a 3/4 or side profile (`studio-boots.webp`, `studio-heels.webp`, custom boot/sneaker photo)
  // For heels, paint a subtle dorsal instep skin bridge inside the pump's vamp opening first
  if (shoeMode === 'heels' && !frame.facingBack) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      lerp(leg.ankle.x, leg.instep.x, 0.55),
      lerp(leg.ankle.y, leg.instep.y, 0.48),
      Math.max(2.5, footW * 0.68),
      Math.max(3, instepH * 0.78),
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = isFarFoot ? frame.skinShading.midShadow : frame.skinShading.base;
    ctx.fill();
    ctx.restore();
  }

  const shaftOuter = samplePolylineAt(leg.outerContour, shaftLegT);
  const shaftInner = samplePolylineAt(leg.innerContour, shaftLegT);
  const shaftLeftX = Math.min(shaftOuter.x, shaftInner.x) - bootLoft;
  const shaftRightX = Math.max(shaftOuter.x, shaftInner.x) + bootLoft;
  const shaftTopY = (shaftOuter.y + shaftInner.y) * 0.5 - (isBoot ? 2.5 * scale : 1.5 * scale);

  const soleBottomY =
    Math.max(leg.heel.y, leg.ballOfFoot.y, toeCenter.y) +
    (shoeMode === 'snow_boots' ? 3.2 : 2.2) * scale;

  const cutoutFacesRight = asset.upperMassCenterX <= 0.53;
  const footDir = isProfileFoot ? Math.sign(fwdDx) : leg.side === 'left' ? 1 : -1;
  const flipU = (footDir < 0 && cutoutFacesRight) || (footDir > 0 && !cutoutFacesRight);

  const heelEdgeX =
    footDir >= 0
      ? Math.min(shaftLeftX, leg.heel.x - footW * 0.42 - bootLoft * 0.5)
      : Math.max(shaftRightX, leg.heel.x + footW * 0.42 + bootLoft * 0.5);

  const toeEdgeX =
    footDir >= 0
      ? Math.max(shaftRightX + footW * 0.35, toeCenter.x + footW * 0.52 + bootLoft * 0.4)
      : Math.min(shaftLeftX - footW * 0.35, toeCenter.x - footW * 0.52 - bootLoft * 0.4);

  const leftBoxX = Math.min(heelEdgeX, toeEdgeX);
  const rightBoxX = Math.max(heelEdgeX, toeEdgeX);

  const rows = isBoot ? 8 : 6;
  const cols = 6;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const vImg = lerp(0.02, 0.98, tr);
    const yRow = lerp(shaftTopY, soleBottomY, tr);

    // Narrow upper rows cleanly around calf/ankle shaft so boots hug the morphed leg contour
    const shaftBlend = isBoot ? clamp(1 - tr * 1.65, 0, 1) : clamp(1 - tr * 2.1, 0, 1);
    const rowLeftX =
      footDir >= 0
        ? lerp(leftBoxX, shaftLeftX, shaftBlend * 0.85)
        : lerp(leftBoxX, shaftLeftX, shaftBlend * 0.92);
    const rowRightX =
      footDir >= 0
        ? lerp(rightBoxX, shaftRightX, shaftBlend * 0.92)
        : lerp(rightBoxX, shaftRightX, shaftBlend * 0.85);

    const rimSagY =
      (rowRightX - rowLeftX) * 0.5 * Math.sin(frame.elevRad) * (tr < 0.25 ? 0.36 : 0.18);

    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const phi = (tc - 0.5) * Math.PI;
      const uRaw = frame.facingBack
        ? lerp(0.08, 0.44, tc)
        : lerp(0.02, 0.98, flipU ? 1 - tc : tc);
      uvRow.push({ x: uRaw, y: vImg });
      dstRow.push({
        x: lerp(rowLeftX, rowRightX, tc),
        y: yRow + Math.cos(phi) * rimSagY,
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale: frame.scale,
    yawRad: frame.yawRad,
    isFarLimb: isFarFoot && Math.abs(Math.sin(frame.yawRad)) > 0.18,
    contactShadowPx: 1.6,
  });
}

/**
 * Builds `{ farShoe, nearShoe }` draw calls aligned with each foot's 3D isometric vector.
 */
export function createShoeGarmentWarpPass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  garment: GarmentInputRecord
): ShoeGarmentDrawPass {
  const classification = classifyGarmentGeometry(garment, asset);
  const farLeg = frame.farLegSide === 'left' ? frame.leftLeg : frame.rightLeg;
  const nearLeg = frame.nearLegSide === 'left' ? frame.leftLeg : frame.rightLeg;

  return {
    farShoe: () => warpSingleFootShoe(ctx, frame, farLeg, asset, classification, true),
    nearShoe: () => warpSingleFootShoe(ctx, frame, nearLeg, asset, classification, false),
  };
}

// ============================================================================
// 6. Accessories, Socks, Gloves, Belt, Watch, Neckwear, Eyewear, Headwear & Bags
// ============================================================================

export function createSocksWarpPass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset
): PairedLimbDrawPass {
  const sockClass = classifyGarmentGeometry({ category: 'socks', subcategory: 'socks' }, asset);
  const loftPx = getGarmentLayerLoftPx(sockClass, frame);
  const farLeg = frame.farLegSide === 'left' ? frame.leftLeg : frame.rightLeg;
  const nearLeg = frame.nearLegSide === 'left' ? frame.leftLeg : frame.rightLeg;

  const drawSockOnLeg = (leg: IsoLegChain, isFar: boolean): void => {
    const useLeft = leg.side === 'right';
    const u0 = asset.hasVerticalPairSplit ? (useLeft ? 0.03 : asset.uPairSplit + 0.03) : 0.12;
    const u1 = asset.hasVerticalPairSplit ? (useLeft ? asset.uPairSplit - 0.03 : 0.97) : 0.88;

    const rows = 5;
    const cols = 4;
    const srcGrid: Point2D[][] = [];
    const dstGrid: Point2D[][] = [];

    for (let r = 0; r <= rows; r++) {
      const tr = r / rows;
      const legT = lerp(0.76, 1.0, tr);
      const outerPt = samplePolylineAt(leg.outerContour, legT);
      const innerPt = samplePolylineAt(leg.innerContour, legT);
      const leftPt = outerPt.x <= innerPt.x ? outerPt : innerPt;
      const rightPt = outerPt.x <= innerPt.x ? innerPt : outerPt;

      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        uvRow.push({ x: lerp(u0, u1, tc), y: lerp(0.05, 0.72, tr) });
        dstRow.push({
          x: lerp(leftPt.x - loftPx, rightPt.x + loftPx, tc),
          y: lerp(leftPt.y, rightPt.y, tc),
        });
      }
      srcGrid.push(uvRow);
      dstGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
      theme: frame.theme,
      scale: frame.scale,
      isFarLimb: isFar,
      contactShadowPx: 0.5,
    });
  };

  return {
    farLayer: () => drawSockOnLeg(farLeg, true),
    nearLayer: () => drawSockOnLeg(nearLeg, false),
  };
}

export function createGlovesWarpPass(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset
): PairedLimbDrawPass {
  const farArm = frame.farArmSide === 'left' ? frame.leftArm : frame.rightArm;
  const nearArm = frame.nearArmSide === 'left' ? frame.leftArm : frame.rightArm;

  const drawGloveOnHand = (arm: IsoArmChain, isFar: boolean): void => {
    const useLeft = arm.side === 'right';
    const u0 = asset.hasVerticalPairSplit ? (useLeft ? 0.02 : asset.uPairSplit + 0.02) : 0.06;
    const u1 = asset.hasVerticalPairSplit ? (useLeft ? asset.uPairSplit - 0.02 : 0.98) : 0.94;

    const wristOuter = arm.outerContour[arm.outerContour.length - 1];
    const wristInner = arm.innerContour[arm.innerContour.length - 1];
    const allHandPts = [wristOuter, wristInner, arm.palmCenter, arm.thumbTip, ...arm.fingerTips];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of allHandPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const padW = Math.max(1.5, arm.radii.fingerThickness * 1.15);
    const topY = Math.min(wristOuter.y, wristInner.y) - 2.2 * frame.scale;
    const botY = maxY + padW * 0.85;
    const leftX = minX - padW;
    const rightX = maxX + padW;

    const rows = 5;
    const cols = 4;
    const srcGrid: Point2D[][] = [];
    const dstGrid: Point2D[][] = [];

    for (let r = 0; r <= rows; r++) {
      const tr = r / rows;
      // In studio-gloves.webp, fingers are at v=0 and ribbed cuff is at v=1;
      // on body, wrist is at top (tr=0) and fingertips are at bottom (tr=1).
      const vImg = lerp(0.96, 0.03, tr);
      const cuffNarrow = clamp(1 - tr * 2.2, 0, 1) * 0.14;
      const rL = lerp(leftX, Math.min(wristOuter.x, wristInner.x) - padW * 0.6, cuffNarrow);
      const rR = lerp(rightX, Math.max(wristOuter.x, wristInner.x) + padW * 0.6, cuffNarrow);

      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        uvRow.push({ x: lerp(u0, u1, tc), y: vImg });
        dstRow.push({ x: lerp(rL, rR, tc), y: lerp(topY, botY, tr) });
      }
      srcGrid.push(uvRow);
      dstGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
      theme: frame.theme,
      scale: frame.scale,
      isFarLimb: isFar,
      contactShadowPx: 0.9,
    });
  };

  return {
    farLayer: () => drawGloveOnHand(farArm, true),
    nearLayer: () => drawGloveOnHand(nearArm, false),
  };
}

export function drawWarpedBelt(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset
): void {
  const beltClass = classifyGarmentGeometry({ category: 'accessory', subcategory: 'belt' }, asset);
  const loftPx = getGarmentLayerLoftPx(beltClass, frame);
  const sTop = 0.51;
  const sBot = 0.585;

  const sliceTop = sampleLoftedTorsoSlice(frame, sTop, loftPx, 0.25, 0);
  const sliceBot = sampleLoftedTorsoSlice(frame, sBot, loftPx, 0.25, 0);

  // Sample central buckle + leather strap band from belt cutout (`v ∈ [0.34, 0.66]` in front, leather rim `v ∈ [0.08, 0.24]` on back)
  const rows = 3;
  const cols = 8;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const phi = (tc - 0.5) * Math.PI;
      const cylX = (Math.sin(phi) + 1) * 0.5;

      let bodyTheta = phi - frame.yawRad;
      while (bodyTheta > Math.PI) bodyTheta -= Math.PI * 2;
      while (bodyTheta < -Math.PI) bodyTheta += Math.PI * 2;

      const isFrontBuckle = Math.abs(bodyTheta) <= 0.36;
      const uSample = isFrontBuckle
        ? lerp(0.28, 0.72, (bodyTheta / 0.36 + 1) * 0.5)
        : lerp(0.18, 0.82, tc);
      const vSample = isFrontBuckle ? lerp(0.36, 0.64, tr) : lerp(0.08, 0.24, tr);

      const xTop = lerp(sliceTop.left.x, sliceTop.right.x, cylX);
      const yTop = lerp(sliceTop.left.y, sliceTop.right.y, cylX) + Math.cos(phi) * sliceTop.camSagY;
      const xBot = lerp(sliceBot.left.x, sliceBot.right.x, cylX);
      const yBot = lerp(sliceBot.left.y, sliceBot.right.y, cylX) + Math.cos(phi) * sliceBot.camSagY;

      uvRow.push({ x: uSample, y: vSample });
      dstRow.push({
        x: lerp(xTop, xBot, tr),
        y: lerp(yTop, yBot, tr),
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale: frame.scale,
    yawRad: frame.yawRad,
    contactShadowPx: 1.1,
  });
}

export function drawWarpedWatch(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset
): void {
  const arm = frame.nearArmSide === 'left' ? frame.leftArm : frame.rightArm;
  const wristOuter = arm.outerContour[arm.outerContour.length - 1];
  const wristInner = arm.innerContour[arm.innerContour.length - 1];
  const forearmOuter = arm.outerContour[arm.outerContour.length - 2] ?? arm.forearm;
  const forearmInner = arm.innerContour[arm.innerContour.length - 2] ?? arm.forearm;

  const pOut = lerpPoint(wristOuter, forearmOuter, 0.16);
  const pIn = lerpPoint(wristInner, forearmInner, 0.16);
  let wx = pOut.x - pIn.x;
  let wy = pOut.y - pIn.y;
  const wLen = Math.max(4, Math.hypot(wx, wy));
  wx /= wLen;
  wy /= wLen;
  const tx = -wy;
  const ty = wx;

  const bandHalfThick = Math.max(2.6, arm.radii.wrist * 0.72);
  const strapOvershoot = Math.max(1.2, arm.radii.wrist * 0.28);
  const startPt = { x: pIn.x - wx * strapOvershoot, y: pIn.y - wy * strapOvershoot };
  const endPt = { x: pOut.x + wx * strapOvershoot, y: pOut.y + wy * strapOvershoot };

  // Rotate watch UV 90 deg so strap wraps across wrist (`v ∈ [0.22, 0.78]` across width, `u ∈ [0.06, 0.94]` along thickness)
  const rows = 3;
  const cols = 5;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const offAlongArm = (tr - 0.5) * 2 * bandHalfThick;
    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const base = lerpPoint(startPt, endPt, tc);
      const arch = Math.sin(tc * Math.PI) * 1.2 * frame.scale;
      uvRow.push({ x: lerp(0.08, 0.92, tr), y: lerp(0.22, 0.78, tc) });
      dstRow.push({
        x: base.x + tx * offAlongArm,
        y: base.y + ty * offAlongArm + arch * 0.4,
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale: frame.scale,
    contactShadowPx: 0.9,
  });
}

export function drawWarpedNeckwear(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  garment: GarmentInputRecord
): void {
  const sub = String(garment.subcategory || '').toLowerCase();
  const name = `${String(garment.name || '')} ${String(garment.name_en || '')}`.trim();
  const isNecktie = sub === 'necktie' || /넥타이|\btie\b/i.test(name);
  const scale = frame.scale;

  if (isNecktie) {
    // Collar band around neckBaseRing + hanging front tie blade when anterior chest is visible
    const collarRing = frame.neckBaseRing;
    const collarLoft = 2.4 * (scale / 2.4);
    const bandRows = 2;
    const bandCols = 6;
    const bandSrc: Point2D[][] = [];
    const bandDst: Point2D[][] = [];
    for (let r = 0; r <= bandRows; r++) {
      const tr = r / bandRows;
      const yOff = (tr - 0.3) * 3.8 * scale;
      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= bandCols; c++) {
        const tc = c / colsSafe(bandCols);
        const phi = (tc - 0.5) * Math.PI;
        const cylX = (Math.sin(phi) + 1) * 0.5;
        uvRow.push({ x: lerp(0.32, 0.68, tc), y: lerp(0.06, 0.22, tr) });
        dstRow.push({
          x: lerp(collarRing.left.x - collarLoft, collarRing.right.x + collarLoft, cylX),
          y:
            lerp(collarRing.left.y, collarRing.right.y, cylX) +
            yOff +
            Math.cos(phi) * collarRing.ry * 0.75,
        });
      }
      bandSrc.push(uvRow);
      bandDst.push(dstRow);
    }
    warpStructuredGrid(ctx, asset, bandSrc, bandDst, {
      theme: frame.theme,
      scale,
      contactShadowPx: 0.8,
    });

    if (!frame.facingBack) {
      const knotPt = { x: collarRing.front.x, y: collarRing.front.y + 1.2 * scale };
      const chestPt = { x: frame.chestRing.front.x, y: frame.chestRing.front.y };
      const tipPt = { x: frame.waistRing.front.x, y: frame.waistRing.front.y - 1.5 * scale };
      const spine = [knotPt, chestPt, tipPt];
      const halfBladeW = Math.max(2.6, 3.8 * scale * Math.max(0.38, Math.abs(Math.cos(frame.yawRad))));

      const rows = 7;
      const cols = 3;
      const bladeSrc: Point2D[][] = [];
      const bladeDst: Point2D[][] = [];
      for (let r = 0; r <= rows; r++) {
        const tr = r / rows;
        const cPt = samplePolylineAt(spine, tr);
        const widthProfile =
          tr < 0.14 ? lerp(0.85, 0.52, tr / 0.14) : tr > 0.84 ? lerp(1.08, 0.15, (tr - 0.84) / 0.16) : lerp(0.55, 1.08, tr);
        const w = halfBladeW * widthProfile;
        const span = sampleAssetRowSpan(asset, lerp(0.04, 0.96, tr));
        const uL = clamp(span.uLeft, 0.22, 0.45);
        const uR = clamp(span.uRight, 0.55, 0.78);

        const uvRow: Point2D[] = [];
        const dstRow: Point2D[] = [];
        for (let c = 0; c <= cols; c++) {
          const tc = c / cols;
          uvRow.push({ x: lerp(uL, uR, tc), y: lerp(0.04, 0.96, tr) });
          dstRow.push({ x: cPt.x + (tc - 0.5) * 2 * w, y: cPt.y });
        }
        bladeSrc.push(uvRow);
        bladeDst.push(dstRow);
      }
      warpStructuredGrid(ctx, asset, bladeSrc, bladeDst, {
        theme: frame.theme,
        scale,
        contactShadowPx: 1.2,
      });
    }
    return;
  }

  // Plush Scarf / Muffler toroidal wrap around neckBaseRing -> clavicleRing + draped front tail
  const topRing = lerpRing(frame.neckTopRing, frame.neckBaseRing, 0.55);
  const botRing = lerpRing(frame.neckBaseRing, frame.clavicleRing, 0.82);
  const scarfLoft = Math.max(4.5, 7.2 * (scale / 2.3));

  const wrapRows = 5;
  const wrapCols = 8;
  const wrapSrc: Point2D[][] = [];
  const wrapDst: Point2D[][] = [];

  for (let r = 0; r <= wrapRows; r++) {
    const tr = r / wrapRows;
    const ring = lerpRing(topRing, botRing, tr);
    const puff = Math.sin(tr * Math.PI) * scarfLoft * 0.35;
    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= wrapCols; c++) {
      const tc = c / wrapCols;
      const phi = (tc - 0.5) * Math.PI;
      const cylX = (Math.sin(phi) + 1) * 0.5;
      uvRow.push({ x: lerp(0.06, 0.94, tc), y: lerp(0.14, 0.62, tr) });
      dstRow.push({
        x: lerp(ring.left.x - scarfLoft - puff, ring.right.x + scarfLoft + puff, cylX),
        y:
          lerp(ring.left.y, ring.right.y, cylX) +
          tr * 4.5 * scale +
          Math.cos(phi) * (ring.ry + 3.2 * scale),
      });
    }
    wrapSrc.push(uvRow);
    wrapDst.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, wrapSrc, wrapDst, {
    theme: frame.theme,
    scale,
    yawRad: frame.yawRad,
    contactShadowPx: 1.8,
  });

  if (!frame.facingBack) {
    const tailTop = {
      x: botRing.front.x + 2.2 * scale,
      y: botRing.front.y + 2.0 * scale,
    };
    const tailBot = {
      x: frame.chestRing.front.x + 3.2 * scale,
      y: lerp(frame.chestRing.front.y, frame.waistRing.front.y, 0.42),
    };
    const tailHalfW = Math.max(4.5, 6.8 * scale * Math.max(0.45, Math.abs(Math.cos(frame.yawRad))));
    const tRows = 5;
    const tCols = 4;
    const tailSrc: Point2D[][] = [];
    const tailDst: Point2D[][] = [];
    for (let r = 0; r <= tRows; r++) {
      const tr = r / tRows;
      const cPt = lerpPoint(tailTop, tailBot, tr);
      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= tCols; c++) {
        const tc = c / tCols;
        uvRow.push({ x: lerp(0.24, 0.78, tc), y: lerp(0.42, 0.96, tr) });
        dstRow.push({
          x: cPt.x + (tc - 0.5) * 2 * tailHalfW * (1 + tr * 0.1),
          y: cPt.y + Math.sin(tc * Math.PI) * 1.2 * scale,
        });
      }
      tailSrc.push(uvRow);
      tailDst.push(dstRow);
    }
    warpStructuredGrid(ctx, asset, tailSrc, tailDst, {
      theme: frame.theme,
      scale,
      yawRad: frame.yawRad,
      contactShadowPx: 1.6,
    });
  }
}

function colsSafe(n: number): number {
  return Math.max(1, n);
}

export function drawWarpedEyewear(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset
): void {
  if (frame.facingBack) return;

  const { cranial, scale, yawRad } = frame;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  const bridge = {
    x: cranial.noseBridgeTop.x,
    y: cranial.eyeLineY,
  };
  const halfFrameSpan = cranial.rxPx * 0.96;
  const halfLensH = Math.max(3.2, cranial.ryPx * 0.24);

  // Perspective foreshortening across left & right rims in 3/4 and profile angles
  const leftSpan = halfFrameSpan * clamp(Math.abs(cosY) + (sinY > 0 ? 0.32 : 0.85) * Math.abs(sinY), 0.22, 1.08);
  const rightSpan = halfFrameSpan * clamp(Math.abs(cosY) + (sinY < 0 ? 0.32 : 0.85) * Math.abs(sinY), 0.22, 1.08);

  const isNearRightProfile = sinY > 0.82;
  const isNearLeftProfile = sinY < -0.82;

  const uStart = isNearRightProfile ? 0.46 : 0.02;
  const uEnd = isNearLeftProfile ? 0.54 : 0.98;

  const leftX = isNearRightProfile ? bridge.x - cranial.rxPx * 0.82 : bridge.x - leftSpan;
  const rightX = isNearLeftProfile ? bridge.x + cranial.rxPx * 0.82 : bridge.x + rightSpan;

  const rows = 4;
  const cols = 6;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const yOff = (tr - 0.5) * 2 * halfLensH;
    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const wrapCurveY = Math.sin(tc * Math.PI) * 1.1 * scale;
      uvRow.push({ x: lerp(uStart, uEnd, tc), y: lerp(0.05, 0.95, tr) });
      dstRow.push({
        x: lerp(leftX, rightX, tc),
        y: bridge.y + yOff + wrapCurveY * 0.35,
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale,
    keyLightAlpha: 0.14,
    shadowAlpha: 0.08,
    contourAlpha: 0.32,
    contactShadowPx: 0.9,
  });
}

export function drawWarpedHeadwear(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  garment: GarmentInputRecord
): void {
  const sub = String(garment.subcategory || '').toLowerCase();
  const name = `${String(garment.name || '')} ${String(garment.name_en || '')}`.trim();
  const { cranial, headCrown, headCenter, scale, yawRad, facingBack } = frame;
  const sinY = Math.sin(yawRad);

  const isCap = sub === 'cap' || /볼캡|캡모자|야구모자|\bcap\b/i.test(name);
  const isBeret = sub === 'beret' || /베레|헌팅캡|beret/i.test(name);
  const isBucket =
    sub === 'bucket_hat' || sub === 'hat' || /버킷|페도라|햇|bucket|fedora|\bhat\b/i.test(name);

  const rx = cranial.rxPx * (isBucket ? 1.38 : isBeret ? 1.24 : 1.14);
  const topY = headCrown.y - cranial.ryPx * (isBeret ? 0.24 : 0.32);
  const browRimY =
    cranial.browLineY -
    cranial.ryPx * (facingBack ? -0.15 : isCap ? 0.08 : 0.14);

  const tiltX = isBeret ? -cranial.rxPx * 0.16 : 0;
  const brimForwardShift =
    isCap && !facingBack ? sinY * cranial.rxPx * 0.52 : 0;
  const brimExtraDrop = isCap && !facingBack ? cranial.ryPx * 0.34 : 0;

  // On 180 back view of a baseball cap, sample only the cap crown (`v ∈ [0.02, 0.62]`) so the front visor is occluded behind the skull
  const vMax = isCap && facingBack && Math.abs(sinY) < 0.35 ? 0.62 : 0.98;

  const rows = 6;
  const cols = 7;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];

  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const isBrimZone = isCap && !facingBack && tr > 0.62;
    const brimT = isBrimZone ? (tr - 0.62) / 0.38 : 0;

    const domeEnv =
      tr < 0.55
        ? Math.pow(Math.sin(clamp(tr / 0.55, 0.16, 1) * Math.PI * 0.5), 0.62)
        : isBucket
          ? 1 + (tr - 0.55) * 0.48
          : 1 - brimT * 0.12;

    const rowHalfW = rx * domeEnv;
    const rowCenterX =
      headCenter.x + tiltX * (1 - tr * 0.5) + brimForwardShift * brimT;
    const rowBaseY = lerp(topY, browRimY + brimExtraDrop, tr);

    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      const phi = (tc - 0.5) * Math.PI;
      const cylX = (Math.sin(phi) + 1) * 0.5;
      const archY =
        tr > 0.45
          ? Math.cos(phi) * (isCap && !facingBack ? 3.2 : 2.0) * scale * (facingBack ? -0.4 : 1)
          : -Math.cos(phi) * 1.4 * scale * (1 - tr);

      uvRow.push({ x: lerp(0.03, 0.97, tc), y: lerp(0.02, vMax, tr) });
      dstRow.push({
        x: lerp(rowCenterX - rowHalfW, rowCenterX + rowHalfW, cylX),
        y: rowBaseY + archY,
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale,
    yawRad,
    contactShadowPx: 1.8,
  });
}

export function drawWarpedBag(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  asset: GarmentCutoutAsset,
  garment: GarmentInputRecord
): void {
  const sub = String(garment.subcategory || '').toLowerCase();
  const name = `${String(garment.name || '')} ${String(garment.name_en || '')}`.trim();
  const scale = frame.scale;

  const isHandheld =
    sub === 'briefcase' ||
    sub === 'tote' ||
    /브리프케이스|서류가방|토트|쇼퍼|클러치|briefcase|tote|shopper|clutch/i.test(name);

  const aspect = clamp(asset.width / Math.max(1, asset.height), 0.55, 1.55);

  if (!isHandheld) {
    // Crossbody / Shoulder bag: strap from far shoulder across chest/back to near hip + real warped bag pouch
    const nearSideIsRightArm = frame.nearArmSide === 'right';
    const shoulderAnchor = nearSideIsRightArm
      ? lerpPoint(frame.clavicleRing.right, frame.neckBaseRing.right, 0.35)
      : lerpPoint(frame.clavicleRing.left, frame.neckBaseRing.left, 0.35);
    const hipAnchor = nearSideIsRightArm
      ? { x: frame.hipRing.left.x - 2.5 * scale, y: frame.hipRing.left.y + 4 * scale }
      : { x: frame.hipRing.right.x + 2.5 * scale, y: frame.hipRing.right.y + 4 * scale };

    // Draw real leather-colored crossbody strap across torso
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderAnchor.x, shoulderAnchor.y);
    ctx.quadraticCurveTo(
      lerp(shoulderAnchor.x, hipAnchor.x, 0.48),
      lerp(shoulderAnchor.y, hipAnchor.y, 0.54),
      hipAnchor.x,
      hipAnchor.y
    );
    ctx.strokeStyle = frame.theme === 'dark' ? 'rgba(12,13,18,0.72)' : 'rgba(29,29,31,0.55)';
    ctx.lineWidth = Math.max(3.2, 2.6 * scale);
    ctx.stroke();
    ctx.strokeStyle = asset.meanHex;
    ctx.lineWidth = Math.max(2.0, 1.7 * scale);
    ctx.stroke();
    ctx.restore();

    const bagH = Math.max(22, 24 * scale);
    const bagW = bagH * aspect * 0.88;
    // Sample pouch body (`v ∈ [0.32, 0.98]` if long strap handles exist above, otherwise full `[0.04, 0.98]`)
    const upperNarrow = asset.rowSpans[4].width < asset.hemWidthNorm * 0.58;
    const vBagStart = upperNarrow ? 0.34 : 0.04;

    const skewY = Math.sin(frame.yawRad) * 2.4 * scale;
    const cx = hipAnchor.x;
    const topY = hipAnchor.y - bagH * 0.18;

    const rows = 5;
    const cols = 5;
    const srcGrid: Point2D[][] = [];
    const dstGrid: Point2D[][] = [];
    for (let r = 0; r <= rows; r++) {
      const tr = r / rows;
      const uvRow: Point2D[] = [];
      const dstRow: Point2D[] = [];
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols;
        uvRow.push({ x: lerp(0.03, 0.97, tc), y: lerp(vBagStart, 0.98, tr) });
        dstRow.push({
          x: cx + (tc - 0.5) * bagW,
          y: topY + tr * bagH + (tc - 0.5) * skewY,
        });
      }
      srcGrid.push(uvRow);
      dstGrid.push(dstRow);
    }

    warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
      theme: frame.theme,
      scale,
      yawRad: frame.yawRad,
      contactShadowPx: 2.0,
    });
    return;
  }

  // Handheld Tote / Briefcase anchored directly at near hand (`palmCenter`)
  const nearArm = frame.nearArmSide === 'left' ? frame.leftArm : frame.rightArm;
  const grip = nearArm.palmCenter;
  const bagH = Math.max(30, (sub === 'briefcase' ? 28 : 35) * scale);
  const bagW = bagH * aspect * (sub === 'briefcase' ? 1.08 : 0.92);
  const outSign = grip.x >= frame.centerX ? 1 : -1;
  const cx = grip.x + outSign * bagW * 0.14;
  const topY = grip.y - bagH * 0.08;
  const skewY = outSign * 2.6 * scale;

  const rows = 6;
  const cols = 5;
  const srcGrid: Point2D[][] = [];
  const dstGrid: Point2D[][] = [];
  for (let r = 0; r <= rows; r++) {
    const tr = r / rows;
    const uvRow: Point2D[] = [];
    const dstRow: Point2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const tc = c / cols;
      uvRow.push({ x: lerp(0.02, 0.98, tc), y: lerp(0.02, 0.98, tr) });
      dstRow.push({
        x: cx + (tc - 0.5) * bagW,
        y: topY + tr * bagH + (tc - 0.5) * skewY,
      });
    }
    srcGrid.push(uvRow);
    dstGrid.push(dstRow);
  }

  warpStructuredGrid(ctx, asset, srcGrid, dstGrid, {
    theme: frame.theme,
    scale,
    yawRad: frame.yawRad,
    contactShadowPx: 2.2,
  });
}
