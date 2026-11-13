import type { GarmentRecord, WearSlotKey } from '../contracts/carbonDesignContract.ts';
import { COLOR_PALETTE, hexToRgb, rgbToHex } from '../shared/colorMath.js';
import { getNativeSeedHex } from '../shared/garmentTaxonomy.js';
import {
  type BodyShapeKey,
  mapStudioSlotsTo3DLoadout,
  normalizeBodyShape,
} from './parametricAvatar3D.ts';
import {
  type SkinShadingPalette,
  computeSkinShadingPalette,
  normalizeSeasonKey,
} from './skinToneAnalyzer.ts';

export interface EditorialModelSpec {
  skinToneHex: string;
  personalColor: string;
  heightCm: number;
  weightKg: number;
  bodyShape: string;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
  portraitDataUrl?: string | null;
}

export interface EditorialRenderInput {
  profile: EditorialModelSpec;
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null;
  theme?: 'light' | 'dark';
  compact?: boolean;
  width?: number;
  height?: number;
}

interface SampledHairPalette {
  main: string;
  highlight: string;
  brow: string;
}

interface GarmentTonePalette {
  base: string;
  shadow: string;
  deepShadow: string;
  highlight: string;
  stitch: string;
  ink: string;
  isVeryDark: boolean;
}

interface EditorialRig {
  cx: number;
  floorY: number;
  crownY: number;
  headCenterY: number;
  headRx: number;
  headRy: number;
  chinY: number;
  neckTopY: number;
  neckBaseY: number;
  neckHalfW: number;
  shoulderY: number;
  shoulderHalfW: number;
  chestY: number;
  chestHalfW: number;
  waistY: number;
  waistHalfW: number;
  hipY: number;
  hipHalfW: number;
  crotchY: number;
  kneeY: number;
  ankleY: number;
  limbScale: number;
  leftHipX: number;
  rightHipX: number;
  leftKneeX: number;
  rightKneeX: number;
  leftAnkleX: number;
  rightAnkleX: number;
  elbowY: number;
  wristY: number;
  leftShoulderX: number;
  rightShoulderX: number;
  leftElbowX: number;
  rightElbowX: number;
  leftWristX: number;
  rightWristX: number;
  armHalfW: number;
  forearmHalfW: number;
  thighHalfW: number;
  calfHalfW: number;
  ankleHalfW: number;
}

type ResolvedLoadout = Partial<Record<WearSlotKey, Partial<GarmentRecord> | null>>;

const INK_PRIMARY = '#1D1D1F';
const DARK_HALO_STROKE = 'rgba(245, 245, 247, 0.36)';
const VIRTUAL_W = 900;
const VIRTUAL_H = 1200;

const hairSampleCache = new Map<string, SampledHairPalette | null>();
const garmentImageHexCache = new Map<string, string | null>();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function fingerprintDataUrl(raw: string): string {
  if (raw.length <= 96) return raw;
  return `${raw.length}:${raw.slice(0, 40)}:${raw.slice(-40)}`;
}

function shiftHex(hex: string, delta: number, scale = 1): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    clampByte(r * scale + delta),
    clampByte(g * scale + delta),
    clampByte(b * scale + delta)
  );
}

function mixHex(hexA: string, hexB: string, ratioB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = clamp(ratioB, 0, 1);
  return rgbToHex(
    clampByte(a.r * (1 - t) + b.r * t),
    clampByte(a.g * (1 - t) + b.g * t),
    clampByte(a.b * (1 - t) + b.b * t)
  );
}

function deriveGarmentPalette(rawHex: string): GarmentTonePalette {
  const rgb = hexToRgb(rawHex);
  const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  const isVeryDark = lum < 44;
  const base = isVeryDark
    ? rgbToHex(Math.max(36, rgb.r + 12), Math.max(38, rgb.g + 13), Math.max(44, rgb.b + 16))
    : rgbToHex(rgb.r, rgb.g, rgb.b);
  const shadow = isVeryDark ? shiftHex(base, -8, 0.86) : shiftHex(base, -6, 0.88);
  const deepShadow = isVeryDark ? '#141519' : shiftHex(base, -12, 0.74);
  const highlight = isVeryDark ? shiftHex(base, 26, 1.08) : shiftHex(base, 18, 1.05);
  const stitch = isVeryDark
    ? '#6B707D'
    : lum > 215
      ? shiftHex(base, -34, 0.9)
      : shiftHex(base, -24, 0.84);

  return {
    base,
    shadow,
    deepShadow,
    highlight,
    stitch,
    ink: isVeryDark ? '#101114' : INK_PRIMARY,
    isVeryDark,
  };
}

function loadImageWithTimeout(src: string, timeoutMs = 1200): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

function isLikelySkinToneRgb(r: number, g: number, b: number): boolean {
  if (r < 50 || g < 35 || b < 24) return false;
  if (r > 246 && g > 244 && b > 240) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 76 && cb <= 130 && cr >= 131 && cr <= 176 && r > b * 0.95;
}

async function samplePortraitHairCrown(
  portraitDataUrl?: string | null
): Promise<SampledHairPalette | null> {
  if (!portraitDataUrl || typeof document === 'undefined') return null;
  const trimmed = String(portraitDataUrl).trim();
  if (!trimmed) return null;

  const key = fingerprintDataUrl(trimmed);
  if (hairSampleCache.has(key)) {
    return hairSampleCache.get(key) ?? null;
  }

  const img = await loadImageWithTimeout(trimmed, 1200);
  if (!img) {
    hairSampleCache.set(key, null);
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      hairSampleCache.set(key, null);
      return null;
    }
    const sw = img.naturalWidth || img.width || 64;
    const sh = img.naturalHeight || img.height || 64;
    const side = Math.min(sw, sh);
    const sx = Math.max(0, Math.round((sw - side) / 2));
    const sy = Math.max(0, Math.round((sh - side) * 0.18));
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 64, 64);

    const data = ctx.getImageData(0, 0, 64, 64).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    // Upper head crown zone (x: 26%..74%, y: 6%..25%)
    for (let y = 4; y <= 16; y += 1) {
      for (let x = 17; x <= 47; x += 1) {
        const idx = (y * 64 + x) * 4;
        const a = data[idx + 3];
        if (a < 180) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = (r + g + b) / 3;
        if (lum > 232) continue; // skip bright studio backdrop
        if (isLikelySkinToneRgb(r, g, b)) continue;
        rSum += r;
        gSum += g;
        bSum += b;
        count += 1;
      }
    }

    if (count < 16) {
      hairSampleCache.set(key, null);
      return null;
    }

    let rAvg = rSum / count;
    let gAvg = gSum / count;
    let bAvg = bSum / count;
    const lumAvg = 0.2126 * rAvg + 0.7152 * gAvg + 0.0722 * bAvg;
    if (lumAvg > 185) {
      rAvg *= 0.82;
      gAvg *= 0.82;
      bAvg *= 0.82;
    } else if (lumAvg < 24) {
      rAvg = Math.max(26, rAvg + 8);
      gAvg = Math.max(26, gAvg + 8);
      bAvg = Math.max(30, bAvg + 10);
    }

    const main = rgbToHex(rAvg, gAvg, bAvg);
    const highlight = shiftHex(main, 24, 1.08);
    const brow = shiftHex(main, -6, 0.92);
    const result: SampledHairPalette = { main, highlight, brow };
    if (hairSampleCache.size >= 32) {
      const oldest = hairSampleCache.keys().next().value;
      if (oldest !== undefined) hairSampleCache.delete(oldest);
    }
    hairSampleCache.set(key, result);
    return result;
  } catch {
    hairSampleCache.set(key, null);
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function sampleDataUrlDominantHex(dataUrl?: string | null): Promise<string | null> {
  if (!dataUrl || typeof document === 'undefined') return null;
  const trimmed = String(dataUrl).trim();
  if (!trimmed.startsWith('data:image/')) return null;

  const key = fingerprintDataUrl(trimmed);
  if (garmentImageHexCache.has(key)) {
    return garmentImageHexCache.get(key) ?? null;
  }

  const img = await loadImageWithTimeout(trimmed, 900);
  if (!img) {
    garmentImageHexCache.set(key, null);
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 40, 40);
    const data = ctx.getImageData(0, 0, 40, 40).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let y = 12; y <= 28; y += 1) {
      for (let x = 12; x <= 28; x += 1) {
        const idx = (y * 40 + x) * 4;
        if (data[idx + 3] < 160) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r > 246 && g > 246 && b > 244) continue;
        rSum += r;
        gSum += g;
        bSum += b;
        count += 1;
      }
    }

    const hex =
      count >= 12 ? rgbToHex(rSum / count, gSum / count, bSum / count) : null;
    if (garmentImageHexCache.size >= 48) {
      const oldest = garmentImageHexCache.keys().next().value;
      if (oldest !== undefined) garmentImageHexCache.delete(oldest);
    }
    garmentImageHexCache.set(key, hex);
    return hex;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function lookupColorHexFromName(rawName?: string | null): string | null {
  const s = String(rawName || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  for (const entry of COLOR_PALETTE) {
    if (s.includes(entry.name.toLowerCase())) {
      return entry.hex;
    }
  }
  if (/블랙|검정|흑색|black/.test(s)) return '#22242A';
  if (/차콜|먹색|charcoal/.test(s)) return '#373A40';
  if (/화이트|흰색|백색|white/.test(s)) return '#F3F2EE';
  if (/아이보리|크림|에크루|ivory|cream|ecru/.test(s)) return '#EFECE6';
  if (/베이지|오트밀|샌드|beige|sand|oat/.test(s)) return '#C6B294';
  if (/카멜|탄|camel|tan/.test(s)) return '#C18F59';
  if (/브라운|밤색|코냑|초코|brown|cognac/.test(s)) return '#6E4F3A';
  if (/네이비|곤색|navy/.test(s)) return '#22304A';
  if (/인디고|청색|데님|indigo|denim|blue/.test(s)) return '#2B4870';
  if (/카키|올리브|세이지|khaki|olive|sage|green/.test(s)) return '#6E775C';
  if (/버건디|와인|레드|burgundy|wine|red/.test(s)) return '#722634';
  if (/핑크|로즈|코랄|pink|rose|coral/.test(s)) return '#D89BA6';
  if (/옐로|머스타드|yellow|mustard/.test(s)) return '#DFA842';
  if (/그레이|회색|grey|gray/.test(s)) return '#8E9299';
  return null;
}

async function resolveItemHex(
  item: Partial<GarmentRecord> | null | undefined,
  fallbackHex: string
): Promise<string> {
  if (!item) return fallbackHex;
  const rawHex = String(item.color_hex || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawHex)) {
    const rgb = hexToRgb(rawHex);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  if (typeof item.image_url === 'string' && item.image_url.startsWith('data:image/')) {
    const sampled = await sampleDataUrlDominantHex(item.image_url);
    if (sampled) return sampled;
  }
  const seedHex = getNativeSeedHex(item.image_url || '');
  if (seedHex) return seedHex;
  const byColorName =
    lookupColorHexFromName(item.color_name) || lookupColorHexFromName(item.name);
  return byColorName || fallbackHex;
}

// oxlint-disable-next-line typescript/no-explicit-any
function resolveEditorialLoadout(slots?: Record<string, any> | null): ResolvedLoadout {
  if (!slots || typeof slots !== 'object') return {};
  const mapped = mapStudioSlotsTo3DLoadout(slots);
  const loadout: ResolvedLoadout = { ...mapped };

  const alreadyMappedRefs = new Set<unknown>();
  const alreadyMappedIds = new Set<number>();
  for (const assigned of Object.values(loadout)) {
    if (assigned && typeof assigned === 'object') {
      alreadyMappedRefs.add(assigned);
      if (Number(assigned.id) > 0) {
        alreadyMappedIds.add(Number(assigned.id));
      }
    }
  }

  const directKeys: WearSlotKey[] = [
    'headwear',
    'neckwear',
    'outer',
    'top',
    'bottom',
    'dress',
    'gloves',
    'underwear',
    'socks',
    'shoes',
    'accessory',
  ];

  for (const key of directKeys) {
    const candidate = slots[key];
    if (candidate && typeof candidate === 'object' && !loadout[key]) {
      const cid = Number((candidate as Partial<GarmentRecord>).id);
      if (alreadyMappedRefs.has(candidate) || (cid > 0 && alreadyMappedIds.has(cid))) {
        continue;
      }
      loadout[key] = candidate as Partial<GarmentRecord>;
    }
  }

  if (loadout.dress) {
    delete loadout.bottom;
  }

  return loadout;
}

/**
 * Purely gender-neutral 7.8-head lookbook parametric rig:
 * Zero inspection or branching on `gender` — driven smoothly by heightCm, weightKg,
 * bodyShape, shoulderScale, waistScale, and hipScale.
 */
function computeEditorialRig(spec: EditorialModelSpec): EditorialRig {
  const heightCm = clamp(Number(spec.heightCm) || 172, 145, 200);
  const weightKg = clamp(Number(spec.weightKg) || 64, 38, 130);
  const bodyShape: BodyShapeKey = normalizeBodyShape(spec.bodyShape);
  const shoulderScale = clamp(Number(spec.shoulderScale) || 1, 0.85, 1.2);
  const waistScale = clamp(Number(spec.waistScale) || 1, 0.82, 1.25);
  const hipScale = clamp(Number(spec.hipScale) || 1, 0.85, 1.22);

  const heightNorm = (heightCm - 172) / 28; // ~ -0.96 .. +1.0
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const massNorm = clamp((bmi - 21.0) / 9.5, -0.72, 1.15);

  const shapeFactors: Record<
    BodyShapeKey,
    { sh: number; ch: number; wa: number; hi: number; limb: number }
  > = {
    slim: { sh: 0.94, ch: 0.92, wa: 0.9, hi: 0.93, limb: 0.9 },
    standard_balanced: { sh: 1.0, ch: 1.0, wa: 1.0, hi: 1.0, limb: 1.0 },
    upper_developed: { sh: 1.09, ch: 1.07, wa: 0.98, hi: 0.96, limb: 1.03 },
    lower_developed: { sh: 0.96, ch: 0.98, wa: 1.01, hi: 1.09, limb: 1.05 },
    muscular: { sh: 1.1, ch: 1.09, wa: 0.96, hi: 1.01, limb: 1.09 },
  };
  const sf = shapeFactors[bodyShape];

  const cx = VIRTUAL_W / 2;
  const floorY = 1108;
  const totalH = 976 + heightNorm * 44; // ~933..1020 px
  const headH = totalH / (7.8 + heightNorm * 0.2); // 7.8-head lookbook ratio
  const headW = headH * 0.72;

  const crownY = floorY - totalH;
  const headCenterY = crownY + headH * 0.52;
  const headRx = headW * 0.5;
  const headRy = headH * 0.5;
  const chinY = crownY + headH;
  const neckTopY = chinY - 6;
  const neckBaseY = chinY + headH * 0.24;
  const shoulderY = neckBaseY + headH * 0.25;
  const chestY = shoulderY + totalH * 0.082;
  const waistY = shoulderY + totalH * (0.2 - heightNorm * 0.008);
  const hipY = waistY + totalH * 0.088;
  const crotchY = hipY + totalH * 0.042;
  const ankleY = floorY - headH * 0.34;
  const kneeY = crotchY + (ankleY - crotchY) * 0.49;

  const limbScale = sf.limb * (1 + massNorm * 0.13);
  const neckHalfW = headW * 0.245 * (1 + massNorm * 0.06);
  const shoulderHalfW =
    headW * 1.12 * sf.sh * shoulderScale * (1 + massNorm * 0.08);
  const chestHalfW =
    shoulderHalfW * 0.82 * (sf.ch / sf.sh) * (1 + massNorm * 0.1);
  const waistHalfW =
    headW * 0.79 * sf.wa * waistScale * (1 + massNorm * 0.16);
  const hipHalfW =
    headW * 0.94 * sf.hi * hipScale * (1 + massNorm * 0.14);

  const stanceHalf = Math.max(36, hipHalfW * 0.5);
  const leftHipX = cx - hipHalfW * 0.48;
  const rightHipX = cx + hipHalfW * 0.48;
  const leftKneeX = cx - stanceHalf * 0.96;
  const rightKneeX = cx + stanceHalf * 1.0;
  const leftAnkleX = cx - stanceHalf * 0.95;
  const rightAnkleX = cx + stanceHalf * 1.02;

  const armHalfW = 20.5 * limbScale;
  const forearmHalfW = 16 * limbScale;
  const thighHalfW = Math.max(25, hipHalfW * 0.45 * (0.94 + limbScale * 0.08));
  const calfHalfW = thighHalfW * 0.72;
  const ankleHalfW = Math.max(12.5, calfHalfW * 0.56);

  const leftShoulderX = cx - shoulderHalfW;
  const rightShoulderX = cx + shoulderHalfW;
  const elbowY = shoulderY + (hipY - shoulderY) * 0.54;
  const wristY = hipY + 18;
  const leftElbowX = leftShoulderX - 15 * limbScale;
  const rightElbowX = rightShoulderX + 15 * limbScale;
  const leftWristX = leftShoulderX - 10 * limbScale;
  const rightWristX = rightShoulderX + 10 * limbScale;

  return {
    cx,
    floorY,
    crownY,
    headCenterY,
    headRx,
    headRy,
    chinY,
    neckTopY,
    neckBaseY,
    neckHalfW,
    shoulderY,
    shoulderHalfW,
    chestY,
    chestHalfW,
    waistY,
    waistHalfW,
    hipY,
    hipHalfW,
    crotchY,
    kneeY,
    ankleY,
    limbScale,
    leftHipX,
    rightHipX,
    leftKneeX,
    rightKneeX,
    leftAnkleX,
    rightAnkleX,
    elbowY,
    wristY,
    leftShoulderX,
    rightShoulderX,
    leftElbowX,
    rightElbowX,
    leftWristX,
    rightWristX,
    armHalfW,
    forearmHalfW,
    thighHalfW,
    calfHalfW,
    ankleHalfW,
  };
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  options: {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    darkHalo?: boolean;
    innerDraw?: () => void;
  }
): void {
  const {
    fill,
    stroke = INK_PRIMARY,
    lineWidth = 3.2,
    darkHalo = false,
    innerDraw,
  } = options;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  buildPath();

  if (darkHalo && lineWidth > 0) {
    ctx.save();
    ctx.strokeStyle = DARK_HALO_STROKE;
    ctx.lineWidth = lineWidth + 4.4;
    ctx.stroke();
    ctx.restore();
  }

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (innerDraw) {
    ctx.save();
    ctx.clip();
    innerDraw();
    ctx.restore();
    buildPath();
  }

  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function strokeInkLine(
  ctx: CanvasRenderingContext2D,
  drawFn: () => void,
  lineWidth = 2.2,
  color = INK_PRIMARY,
  dash?: number[]
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dash && dash.length > 0) {
    ctx.setLineDash(dash);
  }
  ctx.beginPath();
  drawFn();
  ctx.stroke();
  ctx.restore();
}

function classifyOuterKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'padding' || /패딩|다운|푸퍼|퀼팅|puffer|padding|down|quilted/i.test(name)) {
    return 'padding';
  }
  if (sub === 'trench' || /트렌치|맥코트|trench|mac\b/i.test(name)) {
    return 'trench';
  }
  if (sub === 'coat' || /코트|발마칸|더플|피코트|coat|overcoat|balmacaan/i.test(name)) {
    return 'coat';
  }
  if (sub === 'blazer' || /블레이저|수트|마이|테일러드|blazer|suit/i.test(name)) {
    return 'blazer';
  }
  if (sub === 'cardigan' || /가디건|카디건|cardigan/i.test(name)) {
    return 'cardigan';
  }
  return 'jacket';
}

function classifyTopKind(item: Partial<GarmentRecord>, isDressSlot = false): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '');
  if (
    isDressSlot ||
    cat === 'dress' ||
    cat === 'onepiece' ||
    sub === 'dress' ||
    sub === 'onepiece' ||
    /원피스|드레스|점프수트|dress|onepiece|jumpsuit/i.test(name)
  ) {
    return 'dress';
  }
  if (sub === 'sweatshirt' || sub === 'hoodie' || /후드|맨투맨|스웻|hoodie|sweatshirt/i.test(name)) {
    return 'hoodie';
  }
  if (sub === 'shirt' || sub === 'blouse' || /셔츠|블라우스|옥스포드|남방|shirt|blouse|oxford/i.test(name)) {
    return 'shirt';
  }
  if (sub === 'cardigan' || /가디건|카디건|cardigan/i.test(name)) {
    return 'cardigan';
  }
  if (sub === 'tshirt' || /티셔츠|반팔|t-?shirt|tee\b/i.test(name)) {
    return 'tshirt';
  }
  return 'knit';
}

function classifyBottomKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'skirt' || /스커트|치마|skirt/i.test(name)) return 'skirt';
  if (sub === 'shorts' || /쇼츠|반바지|하프팬츠|버뮤다|shorts|bermuda/i.test(name)) return 'shorts';
  if (sub === 'denim' || /데님|청바지|진\b|셀비지|denim|jeans|selvedge/i.test(name)) return 'denim';
  if (sub === 'chinos' || sub === 'jogger' || /치노|면바지|카고|조거|chino|cargo|jogger/i.test(name)) {
    return 'chinos';
  }
  return 'slacks';
}

function classifyShoesKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'boots' || /부츠|첼시|워커|boots|chelsea|walker/i.test(name)) return 'boots';
  if (sub === 'loafers' || /로퍼|구두|더비|옥스포드화|모카신|loafer|derby|oxford/i.test(name)) {
    return 'loafers';
  }
  if (sub === 'heels' || /힐|펌프스|스틸레토|슬링백|메리제인|heel|pump|mary jane/i.test(name)) {
    return 'heels';
  }
  return 'sneakers';
}

function classifyHeadwearKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'beret' || /베레|헌팅캡|beret/i.test(name)) return 'beret';
  if (sub === 'cap' || /볼캡|캡|야구모자|cap\b/i.test(name)) return 'cap';
  if (sub === 'bucket_hat' || sub === 'hat' || /버킷|페도라|햇|bucket|fedora|hat\b/i.test(name)) {
    return 'bucket_hat';
  }
  return 'beanie';
}

function classifyNeckwearKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'necktie' || /넥타이|타이|necktie|\btie\b/i.test(name)) return 'necktie';
  return 'scarf';
}

function classifyAccessoryKind(item: Partial<GarmentRecord>): string {
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (sub === 'glasses' || /안경|선글라스|아이웨어|뿔테|glasses|sunglasses|eyewear/i.test(name)) {
    return 'glasses';
  }
  if (sub === 'watch' || sub === 'jewelry' || /시계|워치|팔찌|watch|bracelet/i.test(name)) {
    return 'watch';
  }
  if (sub === 'belt' || /벨트|belt/i.test(name)) return 'belt';
  if (sub === 'briefcase' || /서류가방|브리프케이스|briefcase/i.test(name)) return 'briefcase';
  if (sub === 'tote' || /토트|쇼퍼|에코백|tote|shopper/i.test(name)) return 'tote';
  return 'bag';
}

function drawBackdropAndFloorShadow(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  _skinPalette: SkinShadingPalette,
  isDarkTheme: boolean
): void {
  // Grounded floor shadow ellipse (same-RGB zero-alpha fade prevents grey banding)
  const shadowRx = Math.max(118, rig.shoulderHalfW * 1.02);
  const shadowRy = 18;
  const shadowY = rig.floorY + 6;
  ctx.save();
  ctx.translate(rig.cx, shadowY);
  ctx.scale(1, shadowRy / shadowRx);
  const floorGrad = ctx.createRadialGradient(0, 0, 14, 0, 0, shadowRx);
  if (isDarkTheme) {
    floorGrad.addColorStop(0, 'rgba(0, 0, 0, 0.46)');
    floorGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.18)');
    floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    floorGrad.addColorStop(0, 'rgba(29, 29, 31, 0.13)');
    floorGrad.addColorStop(0.65, 'rgba(29, 29, 31, 0.05)');
    floorGrad.addColorStop(1, 'rgba(29, 29, 31, 0)');
  }
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.arc(0, 0, shadowRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBackHairLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  hair: SampledHairPalette,
  hasHeadwear: boolean,
  isDarkTheme: boolean
): void {
  const topY = hasHeadwear ? rig.headCenterY - rig.headRy * 0.25 : rig.crownY - 8;
  const napeY = rig.headCenterY + 24;
  const outerW = rig.headRx * 1.01;

  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx - outerW * 0.68, napeY + 8);
      ctx.bezierCurveTo(
        rig.cx - outerW * 0.98,
        rig.headCenterY + 4,
        rig.cx - outerW * 0.96,
        topY + 18,
        rig.cx,
        topY
      );
      ctx.bezierCurveTo(
        rig.cx + outerW * 0.96,
        topY + 18,
        rig.cx + outerW * 0.98,
        rig.headCenterY + 4,
        rig.cx + outerW * 0.68,
        napeY + 8
      );
      ctx.quadraticCurveTo(rig.cx, napeY + 14, rig.cx - outerW * 0.68, napeY + 8);
      ctx.closePath();
    },
    {
      fill: hair.main,
      lineWidth: 2.8,
      darkHalo: isDarkTheme,
    }
  );
}

function drawBaseAnatomy(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  skin: SkinShadingPalette,
  showArms: boolean,
  showLegs: boolean,
  isDarkTheme: boolean
): void {
  // Torso & neck column so necklines always sit over skin cleanly
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx - rig.neckHalfW, rig.neckTopY);
      ctx.lineTo(rig.cx - rig.neckHalfW * 1.08, rig.neckBaseY);
      ctx.quadraticCurveTo(
        rig.cx - rig.shoulderHalfW * 0.62,
        rig.neckBaseY + 15,
        rig.leftShoulderX,
        rig.shoulderY + 2
      );
      ctx.lineTo(rig.cx - rig.chestHalfW, rig.chestY);
      ctx.lineTo(rig.cx - rig.waistHalfW, rig.waistY);
      ctx.lineTo(rig.cx - rig.hipHalfW, rig.hipY);
      ctx.lineTo(rig.cx + rig.hipHalfW, rig.hipY);
      ctx.lineTo(rig.cx + rig.waistHalfW, rig.waistY);
      ctx.lineTo(rig.cx + rig.chestHalfW, rig.chestY);
      ctx.lineTo(rig.rightShoulderX, rig.shoulderY + 2);
      ctx.quadraticCurveTo(
        rig.cx + rig.shoulderHalfW * 0.62,
        rig.neckBaseY + 15,
        rig.cx + rig.neckHalfW * 1.08,
        rig.neckBaseY
      );
      ctx.lineTo(rig.cx + rig.neckHalfW, rig.neckTopY);
      ctx.closePath();
    },
    {
      fill: skin.base,
      lineWidth: 3.1,
      darkHalo: isDarkTheme,
      innerDraw: () => {
        // Under-chin & clavicle soft cel-shadow wash
        ctx.fillStyle = skin.midShadow;
        ctx.beginPath();
        ctx.ellipse(
          rig.cx,
          rig.neckTopY + 18,
          rig.neckHalfW * 1.25,
          20,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      },
    }
  );

  // Subtle clavicle ink ticks
  strokeInkLine(
    ctx,
    () => {
      ctx.moveTo(rig.cx - rig.neckHalfW * 0.95, rig.neckBaseY + 9);
      ctx.quadraticCurveTo(rig.cx - 8, rig.neckBaseY + 14, rig.cx - 3, rig.neckBaseY + 12);
      ctx.moveTo(rig.cx + rig.neckHalfW * 0.95, rig.neckBaseY + 9);
      ctx.quadraticCurveTo(rig.cx + 8, rig.neckBaseY + 14, rig.cx + 3, rig.neckBaseY + 12);
    },
    1.8
  );

  if (showLegs) {
    const drawSingleLeg = (side: -1 | 1) => {
      const hipX = side < 0 ? rig.leftHipX : rig.rightHipX;
      const kneeX = side < 0 ? rig.leftKneeX : rig.rightKneeX;
      const ankleX = side < 0 ? rig.leftAnkleX : rig.rightAnkleX;

      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(hipX - rig.thighHalfW, rig.hipY);
          ctx.quadraticCurveTo(
            kneeX - rig.calfHalfW * 1.15,
            rig.kneeY,
            ankleX - rig.ankleHalfW,
            rig.ankleY + 12
          );
          ctx.lineTo(ankleX + rig.ankleHalfW, rig.ankleY + 12);
          ctx.quadraticCurveTo(
            kneeX + rig.calfHalfW * 1.15,
            rig.kneeY,
            hipX + rig.thighHalfW,
            rig.hipY
          );
          ctx.closePath();
        },
        {
          fill: skin.base,
          lineWidth: 3.1,
          darkHalo: isDarkTheme,
          innerDraw: () => {
            // Inner leg subtle cel-shadow
            ctx.fillStyle = skin.midShadow;
            ctx.globalAlpha = 0.45;
            const innerX = side < 0 ? hipX + rig.thighHalfW * 0.48 : hipX - rig.thighHalfW * 1.1;
            ctx.fillRect(innerX, rig.hipY, rig.thighHalfW * 0.7, rig.ankleY - rig.hipY + 14);
          },
        }
      );

      // Editorial kneecap line accent (Ligne-claire lookbook signature)
      strokeInkLine(
        ctx,
        () => {
          ctx.arc(kneeX + side * 2, rig.kneeY - 2, 7, 0.15 * Math.PI, 0.85 * Math.PI);
        },
        1.9
      );
    };

    drawSingleLeg(-1);
    drawSingleLeg(1);
  }

  if (showArms) {
    const drawSingleArm = (side: -1 | 1) => {
      const shX = side < 0 ? rig.leftShoulderX : rig.rightShoulderX;
      const elX = side < 0 ? rig.leftElbowX : rig.rightElbowX;
      const wrX = side < 0 ? rig.leftWristX : rig.rightWristX;

      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(shX - side * 4, rig.shoulderY + 4);
          ctx.quadraticCurveTo(
            elX + side * rig.armHalfW,
            rig.elbowY,
            wrX + side * rig.forearmHalfW,
            rig.wristY
          );
          ctx.lineTo(wrX - side * rig.forearmHalfW * 0.85, rig.wristY);
          ctx.quadraticCurveTo(
            elX - side * rig.armHalfW * 0.85,
            rig.elbowY + 4,
            shX - side * rig.armHalfW * 1.25,
            rig.shoulderY + 26
          );
          ctx.closePath();
        },
        {
          fill: skin.base,
          lineWidth: 3.0,
          darkHalo: isDarkTheme,
        }
      );
    };
    drawSingleArm(-1);
    drawSingleArm(1);
  }
}

function drawHandsOrGloves(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  skin: SkinShadingPalette,
  glovesPalette: GarmentTonePalette | null,
  hasWatch: boolean,
  watchPalette: GarmentTonePalette | null,
  holdingBagRight: boolean,
  isDarkTheme: boolean
): void {
  const fill = glovesPalette ? glovesPalette.base : skin.base;
  const shadow = glovesPalette ? glovesPalette.shadow : skin.midShadow;

  const drawSingleHand = (side: -1 | 1) => {
    const wrX = side < 0 ? rig.leftWristX : rig.rightWristX;
    const wrY = rig.wristY;
    const hw = rig.forearmHalfW * 1.05;
    const hh = 34 * rig.limbScale;
    const gripping = side > 0 && holdingBagRight;

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(wrX - side * hw * 0.82, wrY - 3);
        ctx.quadraticCurveTo(
          wrX - side * hw * 1.15,
          wrY + hh * 0.45,
          wrX - side * hw * 0.45,
          wrY + (gripping ? hh * 0.78 : hh)
        );
        ctx.quadraticCurveTo(
          wrX + side * hw * 0.55,
          wrY + (gripping ? hh * 0.84 : hh * 1.04),
          wrX + side * hw * 0.92,
          wrY + hh * 0.55
        );
        ctx.quadraticCurveTo(wrX + side * hw * 0.88, wrY + hh * 0.18, wrX + side * hw * 0.82, wrY - 3);
        ctx.closePath();
      },
      {
        fill,
        lineWidth: 2.9,
        darkHalo: isDarkTheme,
        innerDraw: () => {
          ctx.fillStyle = shadow;
          ctx.globalAlpha = 0.42;
          ctx.fillRect(wrX - side * hw, wrY, side * hw * 0.9, hh);
        },
      }
    );

    // Thumb / finger editorial ink lines
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(wrX - side * hw * 0.35, wrY + hh * 0.36);
        ctx.quadraticCurveTo(
          wrX - side * hw * 0.15,
          wrY + hh * 0.65,
          wrX - side * hw * 0.3,
          wrY + hh * 0.78
        );
        if (glovesPalette) {
          // Glove wrist cuff seam & point lines
          ctx.moveTo(wrX - hw * 0.85, wrY + 2);
          ctx.lineTo(wrX + hw * 0.85, wrY + 2);
        }
      },
      1.8,
      glovesPalette?.isVeryDark ? glovesPalette.stitch : INK_PRIMARY
    );
  };

  drawSingleHand(-1);
  drawSingleHand(1);

  if (hasWatch && !glovesPalette) {
    const wx = rig.leftWristX;
    const wy = rig.wristY - 4;
    const strapHex = watchPalette ? watchPalette.base : '#4A3528';
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(wx - rig.forearmHalfW * 0.95, wy - 5, rig.forearmHalfW * 1.9, 10, 3);
      },
      { fill: strapHex, lineWidth: 2.2 }
    );
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(wx - 1, wy, 7.5, 0, Math.PI * 2);
      },
      { fill: '#F5F4EE', lineWidth: 2.2 }
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(wx - 1, wy);
        ctx.lineTo(wx + 2, wy - 3);
        ctx.moveTo(wx - 1, wy);
        ctx.lineTo(wx - 4, wy + 1);
      },
      1.5
    );
  }
}

function drawSocksLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  sockPalette: GarmentTonePalette,
  isDarkTheme: boolean
): void {
  const topY = rig.ankleY - 38;
  const botY = rig.ankleY + 18;
  for (const ankleX of [rig.leftAnkleX, rig.rightAnkleX]) {
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(ankleX - rig.ankleHalfW * 1.08, topY);
        ctx.lineTo(ankleX - rig.ankleHalfW * 1.04, botY);
        ctx.lineTo(ankleX + rig.ankleHalfW * 1.04, botY);
        ctx.lineTo(ankleX + rig.ankleHalfW * 1.08, topY);
        ctx.closePath();
      },
      {
        fill: sockPalette.base,
        lineWidth: 2.7,
        darkHalo: isDarkTheme,
      }
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(ankleX - rig.ankleHalfW * 0.45, topY + 4);
        ctx.lineTo(ankleX - rig.ankleHalfW * 0.45, botY - 4);
        ctx.moveTo(ankleX + rig.ankleHalfW * 0.45, topY + 4);
        ctx.lineTo(ankleX + rig.ankleHalfW * 0.45, botY - 4);
      },
      1.5,
      sockPalette.stitch
    );
  }
}

function drawBaseStudioSlides(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  skin: SkinShadingPalette,
  isDarkTheme: boolean
): void {
  const strapPal = deriveGarmentPalette('#E6E2D8');
  const soleY = rig.floorY;
  const drawSlide = (ankleX: number, side: -1 | 1) => {
    const footW = Math.max(32, rig.ankleHalfW * 2.35);
    const cx = ankleX + side * 6;
    // Skin foot arch
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(ankleX - rig.ankleHalfW, rig.ankleY + 2);
        ctx.quadraticCurveTo(cx - footW * 0.56, soleY - 14, cx - footW * 0.54, soleY - 6);
        ctx.lineTo(cx + footW * 0.54, soleY - 6);
        ctx.quadraticCurveTo(cx + footW * 0.56, soleY - 14, ankleX + rig.ankleHalfW, rig.ankleY + 2);
        ctx.closePath();
      },
      { fill: skin.base, lineWidth: 2.8, darkHalo: isDarkTheme }
    );
    // Flat studio slide strap
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(cx - footW * 0.52, soleY - 24, footW * 1.04, 14, 6);
      },
      { fill: strapPal.base, lineWidth: 2.7, darkHalo: isDarkTheme }
    );
    // Footbed sole
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(cx - footW * 0.56, soleY - 9, footW * 1.12, 9, 4);
      },
      { fill: '#CFCAC0', lineWidth: 2.7, darkHalo: isDarkTheme }
    );
  };
  drawSlide(rig.leftAnkleX, -1);
  drawSlide(rig.rightAnkleX, 1);
}

function drawShoesLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  kind: string,
  pal: GarmentTonePalette,
  isDarkTheme: boolean
): void {
  const soleY = rig.floorY;

  const drawSingleShoe = (ankleX: number, side: -1 | 1) => {
    const cx = ankleX + side * 7;
    const halfW = Math.max(25, rig.ankleHalfW * 1.68);
    const topY = kind === 'boots' ? rig.ankleY - 26 : rig.ankleY + 4;

    if (kind === 'sneakers') {
      // Court sneaker upper
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(ankleX - rig.ankleHalfW * 1.12, topY);
          ctx.quadraticCurveTo(cx - halfW * 1.08, soleY - 24, cx - halfW * 1.06, soleY - 11);
          ctx.lineTo(cx + halfW * 1.06, soleY - 11);
          ctx.quadraticCurveTo(cx + halfW * 1.08, soleY - 24, ankleX + rig.ankleHalfW * 1.12, topY);
          ctx.quadraticCurveTo(ankleX, topY - 10, ankleX - rig.ankleHalfW * 1.12, topY);
          ctx.closePath();
        },
        { fill: pal.base, lineWidth: 3.1, darkHalo: isDarkTheme }
      );
      // Contrast rubber cupsole
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(cx - halfW * 1.1, soleY - 12, halfW * 2.2, 12, 5);
        },
        { fill: '#F4F1EA', lineWidth: 2.9, darkHalo: isDarkTheme }
      );
      // Crisp ink laces & toe-cap curve
      strokeInkLine(
        ctx,
        () => {
          const lx = ankleX + side * 3;
          ctx.moveTo(lx - 9, topY + 6);
          ctx.lineTo(lx + 9, topY + 6);
          ctx.moveTo(lx - 10, topY + 12);
          ctx.lineTo(lx + 10, topY + 12);
          ctx.moveTo(lx - 11, topY + 18);
          ctx.lineTo(lx + 11, topY + 18);
          // Bow loops
          ctx.ellipse(lx - 7, topY + 1, 5, 3, -0.3, 0, Math.PI * 2);
          ctx.ellipse(lx + 7, topY + 1, 5, 3, 0.3, 0, Math.PI * 2);
        },
        2.0,
        pal.isVeryDark ? '#E8E6DF' : INK_PRIMARY
      );
      return;
    }

    if (kind === 'boots') {
      // Chelsea boot shaft + vamp
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(ankleX - rig.ankleHalfW * 1.14, topY);
          ctx.lineTo(ankleX - rig.ankleHalfW * 1.18, rig.ankleY + 6);
          ctx.quadraticCurveTo(cx - halfW * 1.1, soleY - 24, cx - halfW * 1.08, soleY - 12);
          ctx.lineTo(cx + halfW * 1.08, soleY - 12);
          ctx.quadraticCurveTo(cx + halfW * 1.1, soleY - 24, ankleX + rig.ankleHalfW * 1.18, rig.ankleY + 6);
          ctx.lineTo(ankleX + rig.ankleHalfW * 1.14, topY);
          ctx.closePath();
        },
        { fill: pal.base, lineWidth: 3.2, darkHalo: isDarkTheme }
      );
      // Elastic side gore U-panel + pull tab
      paintShape(
        ctx,
        () => {
          const gx = ankleX + side * 4;
          ctx.beginPath();
          ctx.roundRect(gx - 8, topY + 4, 16, 24, [0, 0, 8, 8]);
        },
        { fill: pal.deepShadow, stroke: pal.stitch, lineWidth: 1.9 }
      );
      // Chunky lugged welt sole
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(cx - halfW * 1.14, soleY - 13, halfW * 2.28, 13, 4);
        },
        { fill: pal.deepShadow, lineWidth: 3.0, darkHalo: isDarkTheme }
      );
      return;
    }

    if (kind === 'heels') {
      // Editorial sleek pump / Mary-Jane strap
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(ankleX - rig.ankleHalfW * 1.05, topY + 2);
          ctx.quadraticCurveTo(cx - halfW * 1.02, soleY - 18, cx - halfW * 0.94, soleY - 6);
          ctx.lineTo(cx + halfW * 0.94, soleY - 6);
          ctx.quadraticCurveTo(cx + halfW * 1.02, soleY - 18, ankleX + rig.ankleHalfW * 1.05, topY + 2);
          ctx.quadraticCurveTo(cx, topY + 18, ankleX - rig.ankleHalfW * 1.05, topY + 2);
          ctx.closePath();
        },
        { fill: pal.base, lineWidth: 3.0, darkHalo: isDarkTheme }
      );
      strokeInkLine(
        ctx,
        () => {
          ctx.moveTo(ankleX - rig.ankleHalfW * 0.98, topY + 8);
          ctx.quadraticCurveTo(cx, topY + 12, ankleX + rig.ankleHalfW * 0.98, topY + 8);
          ctx.moveTo(cx - halfW * 0.96, soleY - 5);
          ctx.lineTo(cx + halfW * 0.96, soleY - 5);
        },
        2.3,
        pal.isVeryDark ? pal.stitch : INK_PRIMARY
      );
      return;
    }

    // Classic Penny Loafers
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(ankleX - rig.ankleHalfW * 1.1, topY + 2);
        ctx.quadraticCurveTo(cx - halfW * 1.06, soleY - 22, cx - halfW * 1.04, soleY - 10);
        ctx.lineTo(cx + halfW * 1.04, soleY - 10);
        ctx.quadraticCurveTo(cx + halfW * 1.06, soleY - 22, ankleX + rig.ankleHalfW * 1.1, topY + 2);
        ctx.quadraticCurveTo(ankleX, topY - 6, ankleX - rig.ankleHalfW * 1.1, topY + 2);
        ctx.closePath();
      },
      { fill: pal.base, lineWidth: 3.1, darkHalo: isDarkTheme }
    );
    // Stacked heel & welt sole
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(cx - halfW * 1.08, soleY - 10, halfW * 2.16, 10, 3);
      },
      { fill: pal.deepShadow, lineWidth: 2.9, darkHalo: isDarkTheme }
    );
    // Penny saddle strap + toe apron seam
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(cx - halfW * 0.68, topY + 13);
        ctx.quadraticCurveTo(cx, topY + 9, cx + halfW * 0.68, topY + 13);
        ctx.moveTo(cx - 6, topY + 12);
        ctx.lineTo(cx + 6, topY + 12);
      },
      2.1,
      pal.isVeryDark ? pal.highlight : INK_PRIMARY
    );
  };

  drawSingleShoe(rig.leftAnkleX, -1);
  drawSingleShoe(rig.rightAnkleX, 1);
}

function drawBottomsLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  kind: string,
  pal: GarmentTonePalette,
  isBasewearShorts: boolean,
  isDarkTheme: boolean
): void {
  const waistTopY = rig.waistY + 6;

  if (kind === 'skirt') {
    const hemY = rig.kneeY + (rig.ankleY - rig.kneeY) * 0.56;
    const hemHalfW = rig.hipHalfW * 1.24;
    const slitTopY = hemY - 64;

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx - rig.waistHalfW * 1.02, waistTopY);
        ctx.quadraticCurveTo(
          rig.cx - rig.hipHalfW * 1.12,
          rig.hipY,
          rig.cx - hemHalfW,
          hemY
        );
        ctx.lineTo(rig.cx - 11, hemY);
        ctx.lineTo(rig.cx, slitTopY);
        ctx.lineTo(rig.cx + 11, hemY);
        ctx.lineTo(rig.cx + hemHalfW, hemY);
        ctx.quadraticCurveTo(
          rig.cx + rig.hipHalfW * 1.12,
          rig.hipY,
          rig.cx + rig.waistHalfW * 1.02,
          waistTopY
        );
        ctx.closePath();
      },
      {
        fill: pal.base,
        lineWidth: 3.3,
        darkHalo: isDarkTheme,
        innerDraw: () => {
          ctx.fillStyle = pal.shadow;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(rig.cx + hemHalfW * 0.52, waistTopY, hemHalfW * 0.6, hemY - waistTopY);
        },
      }
    );

    // Editorial center button placket & side pockets (inspired by image_9.png)
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx - rig.waistHalfW * 1.02, waistTopY + 16);
        ctx.lineTo(rig.cx + rig.waistHalfW * 1.02, waistTopY + 16);
        ctx.moveTo(rig.cx, waistTopY + 16);
        ctx.lineTo(rig.cx, slitTopY);
        // Side scoop pockets
        ctx.moveTo(rig.cx - rig.waistHalfW * 0.72, waistTopY + 18);
        ctx.quadraticCurveTo(
          rig.cx - rig.hipHalfW * 0.92,
          waistTopY + 52,
          rig.cx - rig.hipHalfW * 1.04,
          waistTopY + 58
        );
        ctx.moveTo(rig.cx + rig.waistHalfW * 0.72, waistTopY + 18);
        ctx.quadraticCurveTo(
          rig.cx + rig.hipHalfW * 0.92,
          waistTopY + 52,
          rig.cx + rig.hipHalfW * 1.04,
          waistTopY + 58
        );
      },
      2.1,
      pal.isVeryDark ? pal.stitch : INK_PRIMARY
    );

    for (let i = 0; i < 4; i += 1) {
      const by = waistTopY + 38 + i * 38;
      if (by < slitTopY - 12) {
        paintShape(
          ctx,
          () => {
            ctx.beginPath();
            ctx.arc(rig.cx - 8, by, 4.2, 0, Math.PI * 2);
          },
          { fill: pal.deepShadow, stroke: pal.isVeryDark ? pal.highlight : INK_PRIMARY, lineWidth: 1.9 }
        );
      }
    }
    return;
  }

  if (kind === 'shorts') {
    const hemY = isBasewearShorts ? rig.kneeY - 58 : rig.kneeY - 26;
    const legOuterW = rig.hipHalfW * 1.08;
    const legInnerGap = 10;

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx - rig.waistHalfW * 1.02, waistTopY);
        ctx.quadraticCurveTo(rig.cx - rig.hipHalfW * 1.08, rig.hipY, rig.cx - legOuterW, hemY);
        ctx.lineTo(rig.cx - legInnerGap, hemY - 4);
        ctx.lineTo(rig.cx, rig.crotchY + 8);
        ctx.lineTo(rig.cx + legInnerGap, hemY - 4);
        ctx.lineTo(rig.cx + legOuterW, hemY);
        ctx.quadraticCurveTo(rig.cx + rig.hipHalfW * 1.08, rig.hipY, rig.cx + rig.waistHalfW * 1.02, waistTopY);
        ctx.closePath();
      },
      {
        fill: pal.base,
        lineWidth: 3.2,
        darkHalo: isDarkTheme,
        innerDraw: () => {
          ctx.fillStyle = pal.shadow;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.moveTo(rig.cx - 16, rig.crotchY);
          ctx.lineTo(rig.cx + 16, rig.crotchY);
          ctx.lineTo(rig.cx + 22, hemY);
          ctx.lineTo(rig.cx - 22, hemY);
          ctx.closePath();
          ctx.fill();
        },
      }
    );

    strokeInkLine(
      ctx,
      () => {
        // Waistband, fly J-stitch, side pockets & cuff stitch
        ctx.moveTo(rig.cx - rig.waistHalfW, waistTopY + 16);
        ctx.lineTo(rig.cx + rig.waistHalfW, waistTopY + 16);
        ctx.moveTo(rig.cx, waistTopY + 16);
        ctx.lineTo(rig.cx, rig.crotchY - 8);
        ctx.quadraticCurveTo(rig.cx + 10, rig.crotchY - 6, rig.cx + 12, rig.crotchY - 14);
        ctx.moveTo(rig.cx - rig.waistHalfW * 0.68, waistTopY + 18);
        ctx.lineTo(rig.cx - rig.hipHalfW * 0.98, waistTopY + 62);
        ctx.moveTo(rig.cx + rig.waistHalfW * 0.68, waistTopY + 18);
        ctx.lineTo(rig.cx + rig.hipHalfW * 0.98, waistTopY + 62);
        if (!isBasewearShorts) {
          ctx.moveTo(rig.cx - legOuterW + 2, hemY - 14);
          ctx.lineTo(rig.cx - legInnerGap - 1, hemY - 18);
          ctx.moveTo(rig.cx + legInnerGap + 1, hemY - 18);
          ctx.lineTo(rig.cx + legOuterW - 2, hemY - 14);
        }
      },
      2.0,
      pal.isVeryDark ? pal.stitch : INK_PRIMARY
    );
    return;
  }

  // Full-length trousers: slacks | denim | chinos
  const isRolledCuff = kind === 'denim' || kind === 'chinos';
  const hemY = isRolledCuff ? rig.ankleY - 12 : rig.ankleY + 10;
  const legHemHalfW =
    kind === 'slacks'
      ? Math.max(33, rig.thighHalfW * 1.02)
      : Math.max(27, rig.thighHalfW * 0.84);

  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx - rig.waistHalfW * 1.03, waistTopY);
      ctx.bezierCurveTo(
        rig.cx - rig.hipHalfW * 1.12,
        rig.hipY,
        rig.leftKneeX - legHemHalfW * 1.12,
        rig.kneeY,
        rig.leftAnkleX - legHemHalfW,
        hemY
      );
      ctx.lineTo(rig.leftAnkleX + legHemHalfW * 0.92, hemY);
      ctx.quadraticCurveTo(
        rig.leftKneeX + legHemHalfW * 0.86,
        rig.kneeY,
        rig.cx,
        rig.crotchY + 8
      );
      ctx.quadraticCurveTo(
        rig.rightKneeX - legHemHalfW * 0.86,
        rig.kneeY,
        rig.rightAnkleX - legHemHalfW * 0.92,
        hemY
      );
      ctx.lineTo(rig.rightAnkleX + legHemHalfW, hemY);
      ctx.bezierCurveTo(
        rig.rightKneeX + legHemHalfW * 1.12,
        rig.kneeY,
        rig.cx + rig.hipHalfW * 1.12,
        rig.hipY,
        rig.cx + rig.waistHalfW * 1.03,
        waistTopY
      );
      ctx.closePath();
    },
    {
      fill: pal.base,
      lineWidth: 3.3,
      darkHalo: isDarkTheme,
      innerDraw: () => {
        ctx.fillStyle = pal.shadow;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(rig.cx - 18, rig.crotchY - 6);
        ctx.lineTo(rig.cx + 18, rig.crotchY - 6);
        ctx.lineTo(rig.rightAnkleX - legHemHalfW * 0.4, hemY);
        ctx.lineTo(rig.leftAnkleX + legHemHalfW * 0.4, hemY);
        ctx.closePath();
        ctx.fill();
      },
    }
  );

  const detailStroke = pal.isVeryDark ? pal.stitch : INK_PRIMARY;
  strokeInkLine(
    ctx,
    () => {
      // Waistband & fly
      ctx.moveTo(rig.cx - rig.waistHalfW * 1.02, waistTopY + 17);
      ctx.lineTo(rig.cx + rig.waistHalfW * 1.02, waistTopY + 17);
      ctx.moveTo(rig.cx, waistTopY + 17);
      ctx.lineTo(rig.cx, rig.crotchY - 6);
      ctx.quadraticCurveTo(rig.cx + 11, rig.crotchY - 5, rig.cx + 13, rig.crotchY - 16);

      // Pockets
      ctx.moveTo(rig.cx - rig.waistHalfW * 0.65, waistTopY + 18);
      ctx.quadraticCurveTo(
        rig.cx - rig.hipHalfW * 0.88,
        waistTopY + 46,
        rig.cx - rig.hipHalfW * 1.04,
        waistTopY + 54
      );
      ctx.moveTo(rig.cx + rig.waistHalfW * 0.65, waistTopY + 18);
      ctx.quadraticCurveTo(
        rig.cx + rig.hipHalfW * 0.88,
        waistTopY + 46,
        rig.cx + rig.hipHalfW * 1.04,
        waistTopY + 54
      );

      if (kind === 'slacks') {
        // One-tuck pleats + tailored center press crease down each trouser leg
        ctx.moveTo(rig.cx - rig.waistHalfW * 0.38, waistTopY + 18);
        ctx.lineTo(rig.leftAnkleX - 2, hemY - 6);
        ctx.moveTo(rig.cx + rig.waistHalfW * 0.38, waistTopY + 18);
        ctx.lineTo(rig.rightAnkleX + 2, hemY - 6);
      } else {
        // Subtle knee articulation folds
        ctx.moveTo(rig.leftKneeX - 14, rig.kneeY - 6);
        ctx.quadraticCurveTo(rig.leftKneeX, rig.kneeY + 2, rig.leftKneeX + 12, rig.kneeY - 4);
        ctx.moveTo(rig.rightKneeX - 12, rig.kneeY - 4);
        ctx.quadraticCurveTo(rig.rightKneeX, rig.kneeY + 2, rig.rightKneeX + 14, rig.kneeY - 6);
      }
    },
    1.9,
    detailStroke
  );

  if (kind === 'denim') {
    // Contrast selvedge topstitching along pocket & fly
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx + 5, waistTopY + 20);
        ctx.lineTo(rig.cx + 5, rig.crotchY - 12);
      },
      1.5,
      '#C89A58',
      [4, 4]
    );
  }

  if (isRolledCuff) {
    const cuffFill = kind === 'denim' ? mixHex(pal.highlight, '#DCE3EC', 0.55) : pal.highlight;
    for (const ankleX of [rig.leftAnkleX, rig.rightAnkleX]) {
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(
            ankleX - legHemHalfW * 1.03,
            hemY - 15,
            legHemHalfW * 2.02,
            17,
            4
          );
        },
        { fill: cuffFill, lineWidth: 2.8, darkHalo: isDarkTheme }
      );
      if (kind === 'denim') {
        // Little selvedge outseam tick like image_2.png
        strokeInkLine(
          ctx,
          () => {
            ctx.moveTo(ankleX - legHemHalfW * 0.62, hemY - 14);
            ctx.lineTo(ankleX - legHemHalfW * 0.62, hemY + 1);
          },
          2.0,
          '#B43C38'
        );
      }
    }
  }
}

function drawTopOrDressLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  kind: string,
  pal: GarmentTonePalette,
  isBasewearTop: boolean,
  hasOuter: boolean,
  isDarkTheme: boolean
): void {
  const isShortSleeve = kind === 'tshirt' || isBasewearTop;
  const isDress = kind === 'dress';
  const hemY = isDress
    ? rig.kneeY + (rig.ankleY - rig.kneeY) * 0.54
    : isBasewearTop
      ? rig.waistY + 20
      : rig.hipY - 8;

  const bodyShoulderX = rig.shoulderHalfW * (hasOuter ? 1.0 : 1.05);
  const waistW = rig.waistHalfW * (isDress ? 1.04 : isBasewearTop ? 1.02 : 1.1);
  const hemW = isDress
    ? rig.hipHalfW * 1.28
    : isBasewearTop
      ? rig.waistHalfW * 1.05
      : rig.hipHalfW * 1.06;

  // Draw sleeves first if not concealed by an outer coat/jacket
  if (!hasOuter) {
    const drawSleeve = (side: -1 | 1) => {
      const shX = rig.cx + side * bodyShoulderX;
      const elX = side < 0 ? rig.leftElbowX : rig.rightElbowX;
      const wrX = side < 0 ? rig.leftWristX : rig.rightWristX;
      const endX = isShortSleeve ? shX + side * (22 * rig.limbScale) : wrX;
      const endY = isShortSleeve ? rig.shoulderY + 98 : rig.wristY - 2;
      const cuffW = isShortSleeve ? rig.armHalfW * 1.38 : rig.forearmHalfW * 1.28;

      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(shX - side * 8, rig.shoulderY - 2);
          if (isShortSleeve) {
            ctx.quadraticCurveTo(
              shX + side * (rig.armHalfW * 1.5),
              rig.shoulderY + 42,
              endX + side * cuffW * 0.9,
              endY
            );
            ctx.lineTo(endX - side * cuffW * 1.05, endY + 8);
            ctx.lineTo(rig.cx + side * rig.chestHalfW * 0.96, rig.chestY + 12);
          } else {
            ctx.bezierCurveTo(
              elX + side * (rig.armHalfW * 1.48),
              rig.elbowY - 12,
              elX + side * (rig.armHalfW * 1.42),
              rig.elbowY + 28,
              endX + side * cuffW,
              endY
            );
            ctx.lineTo(endX - side * cuffW * 0.92, endY + 2);
            ctx.quadraticCurveTo(
              elX - side * (rig.armHalfW * 0.9),
              rig.elbowY + 8,
              rig.cx + side * rig.chestHalfW * 0.98,
              rig.chestY + 16
            );
          }
          ctx.closePath();
        },
        {
          fill: pal.base,
          lineWidth: 3.1,
          darkHalo: isDarkTheme,
          innerDraw: () => {
            ctx.fillStyle = pal.shadow;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(
              side < 0 ? endX : rig.cx,
              rig.chestY,
              Math.abs(endX - rig.cx) * 0.6,
              endY - rig.chestY
            );
          },
        }
      );

      if (!isShortSleeve) {
        strokeInkLine(
          ctx,
          () => {
            ctx.moveTo(endX - cuffW * 0.95, endY - 14);
            ctx.lineTo(endX + cuffW * 0.95, endY - 14);
          },
          1.9,
          pal.isVeryDark ? pal.stitch : INK_PRIMARY
        );
      }
    };

    drawSleeve(-1);
    drawSleeve(1);
  }

  // Main torso / dress body
  const neckDip =
    kind === 'cardigan'
      ? 54
      : kind === 'shirt' || isDress
        ? 26
        : 20;

  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx - rig.neckHalfW * 1.28, rig.neckBaseY - 2);
      ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + neckDip, rig.cx + rig.neckHalfW * 1.28, rig.neckBaseY - 2);
      ctx.quadraticCurveTo(
        rig.cx + bodyShoulderX * 0.65,
        rig.shoulderY - 6,
        rig.cx + bodyShoulderX,
        rig.shoulderY + 2
      );
      ctx.lineTo(rig.cx + rig.chestHalfW * 1.08, rig.chestY + 12);
      ctx.quadraticCurveTo(rig.cx + waistW, rig.waistY, rig.cx + hemW, hemY);
      ctx.quadraticCurveTo(rig.cx, hemY + 10, rig.cx - hemW, hemY);
      ctx.quadraticCurveTo(
        rig.cx - waistW,
        rig.waistY,
        rig.cx - rig.chestHalfW * 1.08,
        rig.chestY + 12
      );
      ctx.lineTo(rig.cx - bodyShoulderX, rig.shoulderY + 2);
      ctx.quadraticCurveTo(
        rig.cx - bodyShoulderX * 0.65,
        rig.shoulderY - 6,
        rig.cx - rig.neckHalfW * 1.28,
        rig.neckBaseY - 2
      );
      ctx.closePath();
    },
    {
      fill: pal.base,
      lineWidth: 3.2,
      darkHalo: isDarkTheme && !hasOuter,
      innerDraw: () => {
        ctx.fillStyle = pal.shadow;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(rig.cx + hemW * 0.45, rig.shoulderY, hemW * 0.7, hemY - rig.shoulderY + 12);
      },
    }
  );

  const lineCol = pal.isVeryDark ? pal.stitch : INK_PRIMARY;

  if (kind === 'shirt' || isDress) {
    // Pointed spread collar + center button placket
    const collarFill = pal.base;
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx - rig.neckHalfW * 1.22, rig.neckBaseY - 5);
        ctx.lineTo(rig.cx - rig.neckHalfW * 1.65, rig.neckBaseY + 22);
        ctx.lineTo(rig.cx, rig.neckBaseY + 14);
        ctx.lineTo(rig.cx + rig.neckHalfW * 1.65, rig.neckBaseY + 22);
        ctx.lineTo(rig.cx + rig.neckHalfW * 1.22, rig.neckBaseY - 5);
        ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 8, rig.cx - rig.neckHalfW * 1.22, rig.neckBaseY - 5);
        ctx.closePath();
      },
      { fill: collarFill, stroke: lineCol, lineWidth: 2.5 }
    );

    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx - 5, rig.neckBaseY + 14);
        ctx.lineTo(rig.cx - 5, hemY + 3);
        ctx.moveTo(rig.cx + 5, rig.neckBaseY + 14);
        ctx.lineTo(rig.cx + 5, hemY + 3);
        if (isDress) {
          // Cinched waist seam & drape folds
          ctx.moveTo(rig.cx - waistW * 0.94, rig.waistY + 4);
          ctx.quadraticCurveTo(rig.cx, rig.waistY + 12, rig.cx + waistW * 0.94, rig.waistY + 4);
        }
      },
      1.8,
      lineCol
    );

    const btnCount = isDress ? 6 : 4;
    for (let i = 0; i < btnCount; i += 1) {
      const by = rig.neckBaseY + 38 + i * 44;
      if (by < hemY - 12) {
        strokeInkLine(
          ctx,
          () => {
            ctx.arc(rig.cx, by, 2.6, 0, Math.PI * 2);
          },
          2.0,
          lineCol
        );
      }
    }
  } else if (kind === 'hoodie') {
    // Cozy hood rim + hanging drawstrings + kangaroo pocket
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx - rig.neckHalfW * 1.75, rig.neckBaseY + 4);
        ctx.quadraticCurveTo(rig.cx - rig.neckHalfW * 1.9, rig.neckBaseY - 16, rig.cx - rig.neckHalfW * 1.15, rig.neckBaseY - 12);
        ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 18, rig.cx + rig.neckHalfW * 1.15, rig.neckBaseY - 12);
        ctx.quadraticCurveTo(rig.cx + rig.neckHalfW * 1.9, rig.neckBaseY - 16, rig.cx + rig.neckHalfW * 1.75, rig.neckBaseY + 4);
        ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 26, rig.cx - rig.neckHalfW * 1.75, rig.neckBaseY + 4);
        ctx.closePath();
      },
      { fill: pal.highlight, stroke: lineCol, lineWidth: 2.6 }
    );
    strokeInkLine(
      ctx,
      () => {
        // Drawstrings
        ctx.moveTo(rig.cx - 12, rig.neckBaseY + 18);
        ctx.quadraticCurveTo(rig.cx - 15, rig.neckBaseY + 52, rig.cx - 11, rig.neckBaseY + 76);
        ctx.moveTo(rig.cx + 12, rig.neckBaseY + 18);
        ctx.quadraticCurveTo(rig.cx + 15, rig.neckBaseY + 48, rig.cx + 13, rig.neckBaseY + 68);
        // Kangaroo pocket
        if (!hasOuter) {
          ctx.moveTo(rig.cx - hemW * 0.56, hemY - 18);
          ctx.lineTo(rig.cx - hemW * 0.42, hemY - 76);
          ctx.lineTo(rig.cx + hemW * 0.42, hemY - 76);
          ctx.lineTo(rig.cx + hemW * 0.56, hemY - 18);
        }
        // Ribbed hem
        ctx.moveTo(rig.cx - hemW + 2, hemY - 16);
        ctx.quadraticCurveTo(rig.cx, hemY - 8, rig.cx + hemW - 2, hemY - 16);
      },
      2.1,
      lineCol
    );
  } else if (kind === 'cardigan') {
    // Inner white crew tee peek + V-neck button placket
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx - rig.neckHalfW * 1.18, rig.neckBaseY - 1);
        ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 52, rig.cx + rig.neckHalfW * 1.18, rig.neckBaseY - 1);
        ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 14, rig.cx - rig.neckHalfW * 1.18, rig.neckBaseY - 1);
        ctx.closePath();
      },
      { fill: '#F3F1EC', stroke: INK_PRIMARY, lineWidth: 2.3 }
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx, rig.neckBaseY + 52);
        ctx.lineTo(rig.cx, hemY + 4);
      },
      2.2,
      lineCol
    );
  } else {
    // Crew / ribbed knit collar & subtle hem drape creases
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx - rig.neckHalfW * 1.38, rig.neckBaseY + 6);
        ctx.quadraticCurveTo(
          rig.cx,
          rig.neckBaseY + neckDip + 10,
          rig.cx + rig.neckHalfW * 1.38,
          rig.neckBaseY + 6
        );
        if (kind === 'knit') {
          ctx.moveTo(rig.cx - hemW + 3, hemY - 16);
          ctx.quadraticCurveTo(rig.cx, hemY - 8, rig.cx + hemW - 3, hemY - 16);
        }
        // French-tuck / waist drape creases
        ctx.moveTo(rig.cx - 28, hemY - 26);
        ctx.quadraticCurveTo(rig.cx - 12, hemY - 10, rig.cx - 4, hemY - 6);
        ctx.moveTo(rig.cx + 24, hemY - 22);
        ctx.quadraticCurveTo(rig.cx + 10, hemY - 10, rig.cx + 4, hemY - 7);
      },
      1.9,
      lineCol
    );
  }
}

function drawNecktieLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  pal: GarmentTonePalette
): void {
  const knotTopY = rig.neckBaseY + 10;
  const tipY = rig.waistY - 4;
  const lineCol = pal.isVeryDark ? pal.stitch : INK_PRIMARY;

  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      // Knot
      ctx.moveTo(rig.cx - 10, knotTopY);
      ctx.lineTo(rig.cx + 10, knotTopY);
      ctx.lineTo(rig.cx + 7, knotTopY + 18);
      // Blade
      ctx.lineTo(rig.cx + 15, tipY - 18);
      ctx.lineTo(rig.cx, tipY);
      ctx.lineTo(rig.cx - 15, tipY - 18);
      ctx.lineTo(rig.cx - 7, knotTopY + 18);
      ctx.closePath();
    },
    { fill: pal.base, stroke: lineCol, lineWidth: 2.5 }
  );

  strokeInkLine(
    ctx,
    () => {
      ctx.moveTo(rig.cx - 7, knotTopY + 18);
      ctx.lineTo(rig.cx + 7, knotTopY + 18);
      // Subtle diagonal silk stripe ticks
      ctx.moveTo(rig.cx - 9, knotTopY + 46);
      ctx.lineTo(rig.cx + 10, knotTopY + 62);
      ctx.moveTo(rig.cx - 11, knotTopY + 78);
      ctx.lineTo(rig.cx + 12, knotTopY + 96);
    },
    1.7,
    pal.highlight
  );
}

function drawOuterLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  kind: string,
  pal: GarmentTonePalette,
  isDarkTheme: boolean
): void {
  const isLong = kind === 'coat' || kind === 'trench';
  const isPuffer = kind === 'padding';
  const hemY = isLong
    ? rig.kneeY + 56
    : isPuffer
      ? rig.hipY - 2
      : rig.hipY + 26;

  const shW = rig.shoulderHalfW * (isPuffer ? 1.16 : 1.1);
  const hemW = isLong
    ? rig.hipHalfW * 1.24
    : isPuffer
      ? rig.hipHalfW * 1.18
      : rig.hipHalfW * 1.12;
  const openHalfGap = kind === 'blazer' ? 16 : isPuffer ? 22 : 24;
  const lineCol = pal.isVeryDark ? pal.stitch : INK_PRIMARY;

  // Outer sleeves
  const drawOuterSleeve = (side: -1 | 1) => {
    const shX = rig.cx + side * shW;
    const elX = (side < 0 ? rig.leftElbowX : rig.rightElbowX) + side * (isPuffer ? 10 : 4);
    const wrX = side < 0 ? rig.leftWristX : rig.rightWristX;
    const cuffW = rig.forearmHalfW * (isPuffer ? 1.52 : 1.35);

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(shX - side * 14, rig.shoulderY - 1);
        ctx.quadraticCurveTo(shX + side * 4, rig.shoulderY + 2, shX + side * 10, rig.shoulderY + 18);
        ctx.bezierCurveTo(
          elX + side * (rig.armHalfW * (isPuffer ? 1.78 : 1.48)),
          rig.elbowY - 12,
          elX + side * (rig.armHalfW * (isPuffer ? 1.72 : 1.42)),
          rig.elbowY + 28,
          wrX + side * cuffW,
          rig.wristY - 1
        );
        ctx.lineTo(wrX - side * cuffW * 0.9, rig.wristY + 1);
        ctx.quadraticCurveTo(
          elX - side * (rig.armHalfW * 0.82),
          rig.elbowY + 10,
          rig.cx + side * rig.chestHalfW * 1.02,
          rig.chestY + 24
        );
        ctx.closePath();
      },
      {
        fill: pal.base,
        lineWidth: 3.2,
        darkHalo: isDarkTheme,
        innerDraw: () => {
          ctx.fillStyle = pal.shadow;
          ctx.globalAlpha = 0.32;
          ctx.fillRect(
            side < 0 ? wrX : rig.cx,
            rig.chestY,
            Math.abs(wrX - rig.cx) * 0.55,
            rig.wristY - rig.chestY
          );
        },
      }
    );

    if (isPuffer) {
      // Horizontal quilted puffer sleeve baffles (like image_6.png)
      strokeInkLine(
        ctx,
        () => {
          for (const t of [0.28, 0.54, 0.78]) {
            const sy = rig.shoulderY + (rig.wristY - rig.shoulderY) * t;
            const sx = shX + (wrX - shX) * t;
            ctx.moveTo(sx - cuffW * 1.05, sy);
            ctx.quadraticCurveTo(sx, sy + 8, sx + cuffW * 1.05, sy - 2);
          }
        },
        2.1,
        lineCol
      );
    } else {
      // Cuff strap / cuff button detail + subtle inner elbow crease
      strokeInkLine(
        ctx,
        () => {
          ctx.moveTo(wrX - cuffW * 0.9, rig.wristY - 18);
          ctx.lineTo(wrX + cuffW * 0.9, rig.wristY - 18);
          ctx.moveTo(elX - side * 8, rig.elbowY - 2);
          ctx.quadraticCurveTo(elX + side * 4, rig.elbowY + 3, elX + side * 12, rig.elbowY - 1);
        },
        1.9,
        lineCol
      );
    }
  };

  drawOuterSleeve(-1);
  drawOuterSleeve(1);

  // Left & Right open front panels (framing inner top cleanly!)
  const drawFrontPanel = (side: -1 | 1) => {
    const innerTopX = rig.cx + side * (rig.neckHalfW * 1.25);
    const innerChestX = rig.cx + side * openHalfGap;
    const innerHemX = rig.cx + side * (openHalfGap + (isLong ? 10 : 4));

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(innerTopX, rig.neckBaseY - 4);
        ctx.quadraticCurveTo(
          rig.cx + side * (shW * 0.62),
          rig.shoulderY - 6,
          rig.cx + side * (shW - 3),
          rig.shoulderY + 2
        );
        ctx.quadraticCurveTo(
          rig.cx + side * (rig.chestHalfW * 1.18),
          rig.chestY,
          rig.cx + side * (rig.chestHalfW * 1.14),
          rig.chestY + 22
        );
        ctx.quadraticCurveTo(
          rig.cx + side * (rig.waistHalfW * 1.15),
          rig.waistY,
          rig.cx + side * hemW,
          hemY
        );
        ctx.lineTo(innerHemX, hemY + 3);
        ctx.lineTo(innerChestX, rig.chestY + 18);
        ctx.closePath();
      },
      {
        fill: pal.base,
        lineWidth: 3.2,
        darkHalo: isDarkTheme,
        innerDraw: () => {
          ctx.fillStyle = pal.shadow;
          ctx.globalAlpha = 0.26;
          ctx.fillRect(
            innerChestX - (side < 0 ? 18 : 0),
            rig.neckBaseY,
            18,
            hemY - rig.neckBaseY
          );
        },
      }
    );
  };

  drawFrontPanel(-1);
  drawFrontPanel(1);

  // Tailored outer silhouette details per subcategory
  if (isPuffer) {
    // Stand collar + quilted baffles (image_6.png)
    for (const side of [-1, 1] as const) {
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(
            side < 0 ? rig.cx - rig.neckHalfW * 1.75 : rig.cx + openHalfGap * 0.65,
            rig.neckBaseY - 26,
            rig.neckHalfW * 1.1,
            34,
            8
          );
        },
        { fill: pal.highlight, stroke: lineCol, lineWidth: 2.7 }
      );

      strokeInkLine(
        ctx,
        () => {
          for (const t of [0.28, 0.56, 0.82]) {
            const by = rig.shoulderY + (hemY - rig.shoulderY) * t;
            const innerX = rig.cx + side * (openHalfGap + 2);
            const outerX = rig.cx + side * (hemW * 0.96);
            ctx.moveTo(innerX, by);
            ctx.quadraticCurveTo((innerX + outerX) / 2, by + 8, outerX, by - 2);
          }
        },
        2.2,
        lineCol
      );
    }
    return;
  }

  if (kind === 'jacket') {
    // Utility / chore 4-pocket jacket with dashed topstitching (inspired by image_9.png!)
    for (const side of [-1, 1] as const) {
      // Turn-down shirt collar
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(rig.cx + side * rig.neckHalfW * 1.18, rig.neckBaseY - 10);
          ctx.lineTo(rig.cx + side * (rig.neckHalfW * 2.25), rig.neckBaseY + 18);
          ctx.lineTo(rig.cx + side * (openHalfGap + 4), rig.neckBaseY + 26);
          ctx.closePath();
        },
        { fill: pal.highlight, stroke: lineCol, lineWidth: 2.7 }
      );

      // Upper chest & lower hip flap patch pockets + dashed stitch
      const chestPktX = side < 0 ? rig.cx - shW * 0.78 : rig.cx + openHalfGap + 14;
      const chestPktW = shW * 0.78 - openHalfGap - 14;
      const hipPktX = side < 0 ? rig.cx - hemW * 0.88 : rig.cx + openHalfGap + 14;
      const hipPktW = hemW * 0.88 - openHalfGap - 14;

      for (const pkt of [
        { x: chestPktX, y: rig.chestY - 10, w: Math.max(36, chestPktW), h: 52 },
        { x: hipPktX, y: hemY - 82, w: Math.max(42, hipPktW), h: 64 },
      ]) {
        paintShape(
          ctx,
          () => {
            ctx.beginPath();
            ctx.roundRect(pkt.x, pkt.y, pkt.w, pkt.h, 4);
          },
          { fill: pal.base, stroke: lineCol, lineWidth: 2.3 }
        );
        // Pocket flap
        paintShape(
          ctx,
          () => {
            ctx.beginPath();
            ctx.roundRect(pkt.x - 1, pkt.y, pkt.w + 2, 16, 3);
          },
          { fill: pal.highlight, stroke: lineCol, lineWidth: 2.2 }
        );
        // Signature dashed topstitching!
        strokeInkLine(
          ctx,
          () => {
            ctx.rect(pkt.x + 4, pkt.y + 19, pkt.w - 8, pkt.h - 23);
          },
          1.5,
          pal.stitch,
          [4, 3.5]
        );
      }
    }

    // Placket buttons on left side
    for (let i = 0; i < 4; i += 1) {
      const by = rig.neckBaseY + 48 + i * 54;
      if (by < hemY - 14) {
        paintShape(
          ctx,
          () => {
            ctx.beginPath();
            ctx.arc(rig.cx - openHalfGap - 9, by, 4.4, 0, Math.PI * 2);
          },
          { fill: pal.deepShadow, stroke: lineCol, lineWidth: 1.9 }
        );
      }
    }
    return;
  }

  // Tailored notched lapels for trench / coat / blazer
  if (kind !== 'cardigan') {
    const lapelBottomY = kind === 'blazer' ? rig.waistY - 6 : rig.chestY + 46;
    for (const side of [-1, 1] as const) {
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(rig.cx + side * rig.neckHalfW * 1.2, rig.neckBaseY - 8);
          ctx.lineTo(rig.cx + side * (rig.neckHalfW * 2.45), rig.neckBaseY + 26);
          ctx.lineTo(rig.cx + side * (rig.neckHalfW * 1.95), rig.neckBaseY + 34);
          ctx.lineTo(rig.cx + side * (rig.neckHalfW * 2.65), rig.neckBaseY + 46);
          ctx.lineTo(rig.cx + side * openHalfGap, lapelBottomY);
          ctx.lineTo(rig.cx + side * openHalfGap, rig.chestY + 12);
          ctx.closePath();
        },
        { fill: pal.highlight, stroke: lineCol, lineWidth: 2.6 }
      );
    }
  }

  if (kind === 'trench') {
    // Trench storm gun-flaps, double-breasted buttons & waist belt tabs
    for (const side of [-1, 1] as const) {
      strokeInkLine(
        ctx,
        () => {
          // Storm flap curve
          ctx.moveTo(rig.cx + side * (openHalfGap + 6), rig.chestY + 12);
          ctx.quadraticCurveTo(
            rig.cx + side * (shW * 0.62),
            rig.chestY + 26,
            rig.cx + side * (shW * 0.88),
            rig.chestY - 4
          );
          // Belt tab at waist
          ctx.rect(
            side < 0 ? rig.cx - rig.waistHalfW * 1.15 : rig.cx + openHalfGap + 4,
            rig.waistY - 6,
            rig.waistHalfW * 1.15 - openHalfGap - 4,
            18
          );
          // Slanted welt pocket
          ctx.moveTo(rig.cx + side * (openHalfGap + 24), rig.hipY - 12);
          ctx.lineTo(rig.cx + side * (hemW * 0.72), rig.hipY + 34);
        },
        2.2,
        lineCol
      );
      // Double-breasted buttons
      for (const by of [rig.chestY + 42, rig.waistY + 32, rig.hipY + 26]) {
        paintShape(
          ctx,
          () => {
            ctx.beginPath();
            ctx.arc(rig.cx + side * (openHalfGap + 16), by, 4.6, 0, Math.PI * 2);
          },
          { fill: pal.deepShadow, stroke: lineCol, lineWidth: 2.0 }
        );
      }
    }
  } else if (kind === 'blazer') {
    // Breast pocket + pocket square hint + flap pockets + 2 buttons
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rig.cx + openHalfGap + 24, rig.chestY - 2);
        ctx.lineTo(rig.cx + openHalfGap + 34, rig.chestY - 14);
        ctx.lineTo(rig.cx + openHalfGap + 46, rig.chestY - 8);
        ctx.lineTo(rig.cx + openHalfGap + 56, rig.chestY - 2);
        ctx.closePath();
      },
      { fill: '#F5F4EE', stroke: INK_PRIMARY, lineWidth: 2.0 }
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx + openHalfGap + 20, rig.chestY - 1);
        ctx.lineTo(rig.cx + openHalfGap + 62, rig.chestY - 1);
        for (const side of [-1, 1] as const) {
          const px = side < 0 ? rig.cx - hemW * 0.82 : rig.cx + openHalfGap + 18;
          ctx.roundRect(px, hemY - 58, hemW * 0.82 - openHalfGap - 18, 16, 3);
        }
      },
      2.1,
      lineCol
    );
    for (const by of [rig.waistY + 2, rig.waistY + 42]) {
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.arc(rig.cx - openHalfGap - 9, by, 4.4, 0, Math.PI * 2);
        },
        { fill: pal.deepShadow, stroke: lineCol, lineWidth: 1.9 }
      );
    }
  } else {
    // Long tailored coat or cardigan welt pockets
    strokeInkLine(
      ctx,
      () => {
        for (const side of [-1, 1] as const) {
          ctx.moveTo(rig.cx + side * (openHalfGap + 24), rig.hipY - 8);
          ctx.lineTo(rig.cx + side * (hemW * 0.72), rig.hipY + 42);
        }
      },
      2.3,
      lineCol
    );
  }
}

function drawScarfLayer(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  pal: GarmentTonePalette,
  isDarkTheme: boolean
): void {
  const loopW = rig.neckHalfW * 2.15;
  const lineCol = pal.isVeryDark ? pal.stitch : INK_PRIMARY;

  // Hanging right & left muffler ends with fringe (like image_6.png middle-left!)
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.roundRect(rig.cx + 4, rig.neckBaseY + 12, 42, 168, 8);
    },
    { fill: pal.shadow, stroke: lineCol, lineWidth: 2.9, darkHalo: isDarkTheme }
  );
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.roundRect(rig.cx - 38, rig.neckBaseY + 10, 42, 134, 8);
    },
    { fill: pal.base, stroke: lineCol, lineWidth: 2.9, darkHalo: isDarkTheme }
  );

  // Fringe tassels
  strokeInkLine(
    ctx,
    () => {
      for (let i = 0; i < 5; i += 1) {
        const fx1 = rig.cx - 32 + i * 7.5;
        ctx.moveTo(fx1, rig.neckBaseY + 144);
        ctx.lineTo(fx1, rig.neckBaseY + 158);
        const fx2 = rig.cx + 10 + i * 7.5;
        ctx.moveTo(fx2, rig.neckBaseY + 180);
        ctx.lineTo(fx2, rig.neckBaseY + 194);
      }
    },
    2.0,
    lineCol
  );

  // Plush wrapped neck loop
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.ellipse(rig.cx, rig.neckBaseY + 2, loopW, 28, 0, 0, Math.PI * 2);
    },
    { fill: pal.highlight, stroke: lineCol, lineWidth: 3.1, darkHalo: isDarkTheme }
  );
  strokeInkLine(
    ctx,
    () => {
      ctx.moveTo(rig.cx - loopW * 0.72, rig.neckBaseY + 4);
      ctx.quadraticCurveTo(rig.cx, rig.neckBaseY + 18, rig.cx + loopW * 0.72, rig.neckBaseY + 2);
    },
    2.0,
    lineCol
  );
}

function drawBagOrBeltAccessory(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  kind: string,
  pal: GarmentTonePalette,
  hasDress: boolean,
  isDarkTheme: boolean
): void {
  const lineCol = pal.isVeryDark ? pal.stitch : INK_PRIMARY;

  if (kind === 'belt') {
    if (hasDress) return;
    const by = rig.waistY + 6;
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(rig.cx - rig.waistHalfW * 1.04, by, rig.waistHalfW * 2.08, 17, 3);
      },
      { fill: pal.base, stroke: lineCol, lineWidth: 2.6 }
    );
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(rig.cx - 13, by - 2, 26, 21, 4);
      },
      { fill: '#D9CFB8', stroke: INK_PRIMARY, lineWidth: 2.3 }
    );
    return;
  }

  if (kind === 'briefcase' || kind === 'tote') {
    // Structured leather briefcase / tote held naturally by right hand (like image_6.png & image_8.png!)
    const hx = rig.rightWristX + 4;
    const hy = rig.wristY + 18;
    const bagW = kind === 'briefcase' ? 116 : 108;
    const bagH = kind === 'briefcase' ? 92 : 114;
    const bagTopY = hy + 30;
    const bagX = hx - bagW * 0.44;

    // Arched leather handles looping through hand
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(hx - 20, bagTopY + 6);
        ctx.bezierCurveTo(hx - 22, hy - 10, hx + 22, hy - 10, hx + 20, bagTopY + 6);
      },
      5.5,
      pal.deepShadow
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(hx - 20, bagTopY + 6);
        ctx.bezierCurveTo(hx - 22, hy - 10, hx + 22, hy - 10, hx + 20, bagTopY + 6);
      },
      2.2,
      lineCol
    );

    // Side gusset depth
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(bagX + bagW - 4, bagTopY + 4);
        ctx.lineTo(bagX + bagW + 16, bagTopY + 12);
        ctx.lineTo(bagX + bagW + 14, bagTopY + bagH - 4);
        ctx.lineTo(bagX + bagW - 4, bagTopY + bagH);
        ctx.closePath();
      },
      { fill: pal.deepShadow, stroke: lineCol, lineWidth: 2.8, darkHalo: isDarkTheme }
    );

    // Main structured leather body
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(bagX, bagTopY, bagW, bagH, kind === 'briefcase' ? 8 : 10);
      },
      { fill: pal.base, stroke: lineCol, lineWidth: 3.1, darkHalo: isDarkTheme }
    );

    if (kind === 'briefcase') {
      // Top flap + brass clasp + dashed stitch
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(bagX + 2, bagTopY + 2, bagW - 4, 28, [7, 7, 4, 4]);
        },
        { fill: pal.highlight, stroke: lineCol, lineWidth: 2.3 }
      );
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(bagX + bagW / 2 - 8, bagTopY + 22, 16, 14, 3);
        },
        { fill: '#D8C79E', stroke: INK_PRIMARY, lineWidth: 2.0 }
      );
    } else {
      strokeInkLine(
        ctx,
        () => {
          ctx.rect(bagX + 8, bagTopY + 10, bagW - 16, bagH - 18);
        },
        1.6,
        pal.stitch,
        [5, 4]
      );
    }
    return;
  }

  if (kind === 'bag') {
    // Diagonal crossbody strap + structured saddle bag at hip (like image.png & image_8.png!)
    const startX = rig.cx - rig.shoulderHalfW * 0.56;
    const startY = rig.shoulderY - 2;
    const pouchX = rig.cx + rig.hipHalfW * 0.62;
    const pouchY = rig.hipY - 8;

    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(startX - 7, startY + 4);
        ctx.lineTo(startX + 8, startY - 2);
        ctx.lineTo(pouchX + 8, pouchY + 10);
        ctx.lineTo(pouchX - 7, pouchY + 16);
        ctx.closePath();
      },
      { fill: pal.deepShadow, stroke: lineCol, lineWidth: 2.4 }
    );

    // Saddle pouch
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(pouchX - 42, pouchY, 84, 64, [10, 10, 24, 24]);
      },
      { fill: pal.base, stroke: lineCol, lineWidth: 3.1, darkHalo: isDarkTheme }
    );
    // Flap & clasp
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(pouchX - 40, pouchY + 2, 80, 32, [9, 9, 18, 18]);
      },
      { fill: pal.highlight, stroke: lineCol, lineWidth: 2.3 }
    );
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(pouchX, pouchY + 34, 5.5, 0, Math.PI * 2);
      },
      { fill: '#DFCFA8', stroke: INK_PRIMARY, lineWidth: 2.0 }
    );
  }
}

function drawHeadFaceHairAndHeadwear(
  ctx: CanvasRenderingContext2D,
  rig: EditorialRig,
  skin: SkinShadingPalette,
  hair: SampledHairPalette,
  headwearKind: string | null,
  headwearPal: GarmentTonePalette | null,
  hasGlasses: boolean,
  glassesPal: GarmentTonePalette | null,
  isDarkTheme: boolean
): void {
  const earY = rig.headCenterY + 5;
  // Tucked organic ears with inner concha ink curve
  for (const side of [-1, 1] as const) {
    const ex = rig.cx + side * (rig.headRx * 0.92);
    paintShape(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(ex, earY, 8.2, 13.5, side * 0.1, 0, Math.PI * 2);
      },
      { fill: skin.base, lineWidth: 2.6, darkHalo: isDarkTheme }
    );
    strokeInkLine(
      ctx,
      () => {
        ctx.arc(ex - side * 1.2, earY, 4.2, -0.35 * Math.PI, 0.45 * Math.PI, side < 0);
      },
      1.6
    );
  }

  // Sculpted editorial head & soft jawline contour
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx, rig.crownY + 4);
      ctx.bezierCurveTo(
        rig.cx + rig.headRx * 1.04,
        rig.crownY + 4,
        rig.cx + rig.headRx * 1.0,
        rig.headCenterY + 12,
        rig.cx + rig.headRx * 0.68,
        rig.chinY - 13
      );
      ctx.quadraticCurveTo(rig.cx, rig.chinY + 5, rig.cx - rig.headRx * 0.68, rig.chinY - 13);
      ctx.bezierCurveTo(
        rig.cx - rig.headRx * 1.0,
        rig.headCenterY + 12,
        rig.cx - rig.headRx * 1.04,
        rig.crownY + 4,
        rig.cx,
        rig.crownY + 4
      );
      ctx.closePath();
    },
    {
      fill: skin.base,
      lineWidth: 3.0,
      darkHalo: isDarkTheme,
      innerDraw: () => {
        // Subtle editorial cheek warmth
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = skin.subsurface;
        ctx.beginPath();
        ctx.ellipse(rig.cx - rig.headRx * 0.46, rig.headCenterY + 13, 11, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(rig.cx + rig.headRx * 0.46, rig.headCenterY + 13, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    }
  );

  // Composed POPEYE / Ligne-Claire editorial lookbook facial features
  const eyeY = rig.headCenterY + 1;
  const eyeOffsetX = rig.headRx * 0.35;

  // Natural relaxed eyebrows
  strokeInkLine(
    ctx,
    () => {
      ctx.moveTo(rig.cx - eyeOffsetX - 8.5, eyeY - 12);
      ctx.quadraticCurveTo(rig.cx - eyeOffsetX, eyeY - 14.5, rig.cx - eyeOffsetX + 8, eyeY - 12.2);
      ctx.moveTo(rig.cx + eyeOffsetX - 8, eyeY - 12.2);
      ctx.quadraticCurveTo(rig.cx + eyeOffsetX, eyeY - 14.5, rig.cx + eyeOffsetX + 8.5, eyeY - 12);
    },
    2.5,
    hair.brow
  );

  // Crisp editorial dot eyes
  ctx.save();
  ctx.fillStyle = INK_PRIMARY;
  ctx.beginPath();
  ctx.ellipse(rig.cx - eyeOffsetX, eyeY + 0.5, 2.3, 2.9, 0, 0, Math.PI * 2);
  ctx.ellipse(rig.cx + eyeOffsetX, eyeY + 0.5, 2.3, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  strokeInkLine(
    ctx,
    () => {
      // Delicate upper lid lines
      ctx.moveTo(rig.cx - eyeOffsetX - 5, eyeY - 3.8);
      ctx.quadraticCurveTo(rig.cx - eyeOffsetX, eyeY - 5.2, rig.cx - eyeOffsetX + 5, eyeY - 3.5);
      ctx.moveTo(rig.cx + eyeOffsetX - 5, eyeY - 3.5);
      ctx.quadraticCurveTo(rig.cx + eyeOffsetX, eyeY - 5.2, rig.cx + eyeOffsetX + 5, eyeY - 3.8);

      // Minimalist nose bridge & subtle tip
      ctx.moveTo(rig.cx - 0.8, eyeY + 3);
      ctx.lineTo(rig.cx - 2, eyeY + 16);
      ctx.quadraticCurveTo(rig.cx + 0.8, eyeY + 18.2, rig.cx + 3.8, eyeY + 16.8);

      // Composed calm lookbook mouth (subtle asymmetrical warmth, never cartoonish)
      ctx.moveTo(rig.cx - 8.5, eyeY + 30.5);
      ctx.quadraticCurveTo(rig.cx + 0.5, eyeY + 33, rig.cx + 9.2, eyeY + 29.8);
    },
    2.0
  );

  // Subtle lower-lip shadow tick
  strokeInkLine(
    ctx,
    () => {
      ctx.moveTo(rig.cx - 3.2, eyeY + 36.2);
      ctx.quadraticCurveTo(rig.cx + 0.4, eyeY + 37.2, rig.cx + 3.8, eyeY + 36.2);
    },
    1.6,
    skin.deepShadow
  );

  // Modern gender-neutral layered front hairstyle
  const crownTopY = headwearKind ? rig.crownY + 12 : rig.crownY - 14;
  paintShape(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(rig.cx - rig.headRx * 1.02, rig.headCenterY - 4);
      ctx.bezierCurveTo(
        rig.cx - rig.headRx * 1.16,
        crownTopY + 18,
        rig.cx - rig.headRx * 0.68,
        crownTopY - 4,
        rig.cx + 4,
        crownTopY
      );
      ctx.bezierCurveTo(
        rig.cx + rig.headRx * 0.78,
        crownTopY - 4,
        rig.cx + rig.headRx * 1.16,
        crownTopY + 18,
        rig.cx + rig.headRx * 1.02,
        rig.headCenterY - 4
      );
      // Organic curtain bangs framing temples
      ctx.quadraticCurveTo(
        rig.cx + rig.headRx * 0.75,
        rig.crownY + 26,
        rig.cx + 8,
        rig.crownY + 18
      );
      ctx.quadraticCurveTo(
        rig.cx - rig.headRx * 0.12,
        rig.crownY + 32,
        rig.cx - rig.headRx * 0.58,
        rig.crownY + 30
      );
      ctx.quadraticCurveTo(
        rig.cx - rig.headRx * 0.88,
        rig.crownY + 32,
        rig.cx - rig.headRx * 1.02,
        rig.headCenterY - 4
      );
      ctx.closePath();
    },
    {
      fill: hair.main,
      lineWidth: 3.1,
      darkHalo: isDarkTheme && !headwearKind,
      innerDraw: () => {
        if (!headwearKind) {
          ctx.fillStyle = hair.highlight;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.ellipse(rig.cx - 8, crownTopY + 14, rig.headRx * 0.52, 9, -0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    }
  );

  // Flowing hair strand ink lines
  if (!headwearKind) {
    strokeInkLine(
      ctx,
      () => {
        ctx.moveTo(rig.cx + 6, crownTopY + 3);
        ctx.quadraticCurveTo(rig.cx - 16, crownTopY + 16, rig.cx - 28, crownTopY + 32);
        ctx.moveTo(rig.cx + 8, crownTopY + 5);
        ctx.quadraticCurveTo(rig.cx + 26, crownTopY + 16, rig.cx + 34, crownTopY + 30);
      },
      1.8
    );
  }

  // Editorial eyeglasses (if equipped)
  if (hasGlasses) {
    const gStroke = glassesPal ? glassesPal.base : '#2B221D';
    const lensRx = 14.5;
    const lensRy = 12;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.strokeStyle = gStroke;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.ellipse(rig.cx - eyeOffsetX, eyeY + 1, lensRx, lensRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(rig.cx + eyeOffsetX, eyeY + 1, lensRx, lensRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bridge & temples
    ctx.beginPath();
    ctx.moveTo(rig.cx - eyeOffsetX + lensRx, eyeY - 1);
    ctx.quadraticCurveTo(rig.cx, eyeY - 4, rig.cx + eyeOffsetX - lensRx, eyeY - 1);
    ctx.moveTo(rig.cx - eyeOffsetX - lensRx, eyeY - 1);
    ctx.lineTo(rig.cx - rig.headRx * 0.96, earY - 4);
    ctx.moveTo(rig.cx + eyeOffsetX + lensRx, eyeY - 1);
    ctx.lineTo(rig.cx + rig.headRx * 0.96, earY - 4);
    ctx.stroke();
    ctx.restore();
  }

  // Headwear (beret | cap | beanie | bucket_hat)
  if (headwearKind && headwearPal) {
    const hLine = headwearPal.isVeryDark ? headwearPal.stitch : INK_PRIMARY;
    const brimY = rig.crownY + 24;

    if (headwearKind === 'beret') {
      // Slanted Parisian beret with stem (like image_6.png!)
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(rig.cx - rig.headRx * 1.12, brimY + 4);
          ctx.bezierCurveTo(
            rig.cx - rig.headRx * 1.48,
            rig.crownY - 22,
            rig.cx + rig.headRx * 0.65,
            rig.crownY - 34,
            rig.cx + rig.headRx * 1.28,
            brimY - 4
          );
          ctx.quadraticCurveTo(rig.cx, brimY - 10, rig.cx - rig.headRx * 1.12, brimY + 4);
          ctx.closePath();
        },
        { fill: headwearPal.base, stroke: hLine, lineWidth: 3.1, darkHalo: isDarkTheme }
      );
      strokeInkLine(
        ctx,
        () => {
          // Little beret cabillou stem
          ctx.moveTo(rig.cx - 6, rig.crownY - 21);
          ctx.lineTo(rig.cx - 10, rig.crownY - 29);
        },
        2.8,
        hLine
      );
    } else if (headwearKind === 'cap') {
      // Structured 6-panel baseball cap + curved visor
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.arc(rig.cx, brimY + 2, rig.headRx * 1.06, Math.PI, 0);
          ctx.closePath();
        },
        { fill: headwearPal.base, stroke: hLine, lineWidth: 3.1, darkHalo: isDarkTheme }
      );
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(rig.cx - rig.headRx * 1.04, brimY);
          ctx.quadraticCurveTo(rig.cx + 18, brimY - 14, rig.cx + rig.headRx * 1.38, brimY + 8);
          ctx.quadraticCurveTo(rig.cx + 12, brimY + 12, rig.cx - rig.headRx * 1.04, brimY + 4);
          ctx.closePath();
        },
        { fill: headwearPal.shadow, stroke: hLine, lineWidth: 3.0, darkHalo: isDarkTheme }
      );
    } else if (headwearKind === 'bucket_hat') {
      // Bucket / fedora brimmed hat (like image_2.png top-right!)
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.ellipse(rig.cx, brimY + 4, rig.headRx * 1.48, 22, 0, 0, Math.PI * 2);
        },
        { fill: headwearPal.shadow, stroke: hLine, lineWidth: 3.0, darkHalo: isDarkTheme }
      );
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(rig.cx - rig.headRx * 0.96, brimY + 2);
          ctx.lineTo(rig.cx - rig.headRx * 0.82, rig.crownY - 20);
          ctx.quadraticCurveTo(rig.cx, rig.crownY - 28, rig.cx + rig.headRx * 0.82, rig.crownY - 20);
          ctx.lineTo(rig.cx + rig.headRx * 0.96, brimY + 2);
          ctx.quadraticCurveTo(rig.cx, brimY + 10, rig.cx - rig.headRx * 0.96, brimY + 2);
          ctx.closePath();
        },
        { fill: headwearPal.base, stroke: hLine, lineWidth: 3.0, darkHalo: isDarkTheme }
      );
    } else {
      // Ribbed cuffed fisherman beanie (like image_6.png middle-left!)
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.arc(rig.cx, brimY, rig.headRx * 1.06, Math.PI, 0);
          ctx.closePath();
        },
        { fill: headwearPal.base, stroke: hLine, lineWidth: 3.1, darkHalo: isDarkTheme }
      );
      paintShape(
        ctx,
        () => {
          ctx.beginPath();
          ctx.roundRect(
            rig.cx - rig.headRx * 1.12,
            brimY - 18,
            rig.headRx * 2.24,
            24,
            8
          );
        },
        { fill: headwearPal.highlight, stroke: hLine, lineWidth: 2.9, darkHalo: isDarkTheme }
      );
      strokeInkLine(
        ctx,
        () => {
          for (let x = -36; x <= 36; x += 14) {
            ctx.moveTo(rig.cx + x, brimY - 15);
            ctx.lineTo(rig.cx + x, brimY + 3);
          }
        },
        1.7,
        hLine
      );
    }
  }
}

export async function renderEditorialFashionCanvas(
  canvas: HTMLCanvasElement,
  input: EditorialRenderInput
): Promise<void> {
  const isCompact = Boolean(input.compact);
  const targetW =
    input.width && input.width > 0 ? Math.round(input.width) : isCompact ? 360 : VIRTUAL_W;
  const targetH =
    input.height && input.height > 0 ? Math.round(input.height) : isCompact ? 500 : VIRTUAL_H;

  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const theme: 'light' | 'dark' = input.theme === 'dark' ? 'dark' : 'light';
  const isDarkTheme = theme === 'dark';
  const profile = input.profile || {
    skinToneHex: '#DFBA9B',
    personalColor: 'autumn_warm',
    heightCm: 172,
    weightKg: 64,
    bodyShape: 'standard_balanced',
    shoulderScale: 1,
    waistScale: 1,
    hipScale: 1,
  };

  const season = normalizeSeasonKey(profile.personalColor);
  const skinPalette = computeSkinShadingPalette(
    profile.skinToneHex || '#DFBA9B',
    season,
    theme
  );

  const sampledHair = await samplePortraitHairCrown(profile.portraitDataUrl);
  const hairPalette: SampledHairPalette = sampledHair || {
    main: skinPalette.hairMain,
    highlight: skinPalette.hairHighlight,
    brow: skinPalette.browHair,
  };

  const loadout = resolveEditorialLoadout(input.slots);
  const rig = computeEditorialRig(profile);

  // Resolve garment palettes asynchronously (supports data: image_url sampling)
  const [
    outerHex,
    topHex,
    dressHex,
    bottomHex,
    shoesHex,
    headwearHex,
    neckwearHex,
    glovesHex,
    socksHex,
    accHex,
  ] = await Promise.all([
    loadout.outer ? resolveItemHex(loadout.outer, '#C4B193') : Promise.resolve(null),
    loadout.top ? resolveItemHex(loadout.top, '#EFECE6') : Promise.resolve(null),
    loadout.dress ? resolveItemHex(loadout.dress, '#C9BA9E') : Promise.resolve(null),
    loadout.bottom ? resolveItemHex(loadout.bottom, '#35383E') : Promise.resolve(null),
    loadout.shoes ? resolveItemHex(loadout.shoes, '#24252A') : Promise.resolve(null),
    loadout.headwear ? resolveItemHex(loadout.headwear, '#353433') : Promise.resolve(null),
    loadout.neckwear ? resolveItemHex(loadout.neckwear, '#C49245') : Promise.resolve(null),
    loadout.gloves ? resolveItemHex(loadout.gloves, '#2E2A28') : Promise.resolve(null),
    loadout.socks ? resolveItemHex(loadout.socks, '#EAE7E1') : Promise.resolve(null),
    loadout.accessory ? resolveItemHex(loadout.accessory, '#6B3E26') : Promise.resolve(null),
  ]);

  const outerKind = loadout.outer ? classifyOuterKind(loadout.outer) : null;
  const topItem = loadout.dress || loadout.top || null;
  const topKind = topItem
    ? classifyTopKind(topItem, Boolean(loadout.dress))
    : 'tshirt';
  const bottomKind = loadout.bottom ? classifyBottomKind(loadout.bottom) : 'shorts';
  const shoesKind = loadout.shoes ? classifyShoesKind(loadout.shoes) : null;
  const headwearKind = loadout.headwear ? classifyHeadwearKind(loadout.headwear) : null;
  const neckwearKind = loadout.neckwear ? classifyNeckwearKind(loadout.neckwear) : null;
  const accessoryKind = loadout.accessory ? classifyAccessoryKind(loadout.accessory) : null;

  const isDressEquipped = topKind === 'dress' && Boolean(topItem);
  const hasOuter = Boolean(loadout.outer && outerHex);
  const showBareArms = !hasOuter && (!topItem || topKind === 'tshirt');
  const showBareLegs =
    isDressEquipped ||
    !loadout.bottom ||
    bottomKind === 'skirt' ||
    bottomKind === 'shorts' ||
    bottomKind === 'denim' ||
    bottomKind === 'chinos';

  const holdingBagRight = accessoryKind === 'briefcase' || accessoryKind === 'tote';

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.save();
  const scale = Math.min(targetW / VIRTUAL_W, targetH / VIRTUAL_H);
  const offsetX = (targetW - VIRTUAL_W * scale) / 2;
  const offsetY = (targetH - VIRTUAL_H * scale) / 2;
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // 1. Studio aura & grounded floor shadow
  drawBackdropAndFloorShadow(ctx, rig, skinPalette, isDarkTheme);

  // 2. Back hair layer
  drawBackHairLayer(ctx, rig, hairPalette, Boolean(headwearKind), isDarkTheme);

  // 3. Base parametric anatomy
  drawBaseAnatomy(ctx, rig, skinPalette, showBareArms, showBareLegs, isDarkTheme);

  // 4. Socks (explicitly equipped OR editorial ankle sock peek with cuffed trousers/loafers/sneakers)
  if (socksHex) {
    drawSocksLayer(ctx, rig, deriveGarmentPalette(socksHex), isDarkTheme);
  } else if (
    shoesKind &&
    shoesKind !== 'heels' &&
    (bottomKind === 'denim' || bottomKind === 'chinos')
  ) {
    drawSocksLayer(ctx, rig, deriveGarmentPalette('#ECE9E1'), isDarkTheme);
  }

  // 5. Shoes or clean basewear studio slides
  if (shoesKind && shoesHex) {
    drawShoesLayer(ctx, rig, shoesKind, deriveGarmentPalette(shoesHex), isDarkTheme);
  } else {
    drawBaseStudioSlides(ctx, rig, skinPalette, isDarkTheme);
  }

  // 6. Bottoms (or neutral stone studio relaxed shorts when unequipped & not wearing dress)
  if (!isDressEquipped) {
    if (loadout.bottom && bottomHex) {
      drawBottomsLayer(
        ctx,
        rig,
        bottomKind,
        deriveGarmentPalette(bottomHex),
        false,
        isDarkTheme
      );
    } else {
      drawBottomsLayer(
        ctx,
        rig,
        'shorts',
        deriveGarmentPalette('#DFDBD2'),
        true,
        isDarkTheme
      );
    }
  }

  // 7. Belt accessory (over waist before top/outer overlap)
  if (accessoryKind === 'belt' && accHex) {
    drawBagOrBeltAccessory(
      ctx,
      rig,
      'belt',
      deriveGarmentPalette(accHex),
      isDressEquipped,
      isDarkTheme
    );
  }

  // 8. Top / Dress (or minimalist ecru crew-neck fitted cotton top when unequipped)
  if (topItem && (dressHex || topHex)) {
    drawTopOrDressLayer(
      ctx,
      rig,
      topKind,
      deriveGarmentPalette((dressHex || topHex)!),
      false,
      hasOuter,
      isDarkTheme
    );
  } else {
    drawTopOrDressLayer(
      ctx,
      rig,
      'tshirt',
      deriveGarmentPalette('#EFECE6'),
      true,
      hasOuter,
      isDarkTheme
    );
  }

  // 9. Necktie (under outerwear lapels)
  if (neckwearKind === 'necktie' && neckwearHex) {
    drawNecktieLayer(ctx, rig, deriveGarmentPalette(neckwearHex));
  }

  // 10. Outerwear
  if (outerKind && outerHex) {
    drawOuterLayer(ctx, rig, outerKind, deriveGarmentPalette(outerHex), isDarkTheme);
  }

  // 11. Hands / Gloves / Wristwatch
  drawHandsOrGloves(
    ctx,
    rig,
    skinPalette,
    loadout.gloves && glovesHex ? deriveGarmentPalette(glovesHex) : null,
    accessoryKind === 'watch',
    accHex ? deriveGarmentPalette(accHex) : null,
    holdingBagRight,
    isDarkTheme
  );

  // 12. Scarf / Muffler (draped over outerwear collar)
  if (neckwearKind === 'scarf' && neckwearHex) {
    drawScarfLayer(ctx, rig, deriveGarmentPalette(neckwearHex), isDarkTheme);
  }

  // 13. Bags (crossbody across torso or handheld briefcase/tote)
  if (
    (accessoryKind === 'bag' || accessoryKind === 'briefcase' || accessoryKind === 'tote') &&
    accHex
  ) {
    drawBagOrBeltAccessory(
      ctx,
      rig,
      accessoryKind,
      deriveGarmentPalette(accHex),
      isDressEquipped,
      isDarkTheme
    );
  }

  // 14. Head, Face, Hair, Glasses & Headwear
  drawHeadFaceHairAndHeadwear(
    ctx,
    rig,
    skinPalette,
    hairPalette,
    headwearKind,
    headwearHex ? deriveGarmentPalette(headwearHex) : null,
    accessoryKind === 'glasses',
    accHex ? deriveGarmentPalette(accHex) : null,
    isDarkTheme
  );

  ctx.restore();
}

const TRANSPARENT_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export async function synthesizeEditorial2DDataUrl(
  input: EditorialRenderInput
): Promise<string> {
  if (typeof document === 'undefined') {
    return TRANSPARENT_1X1_PNG;
  }
  const canvas = document.createElement('canvas');
  try {
    await renderEditorialFashionCanvas(canvas, input);
    return canvas.toDataURL('image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
