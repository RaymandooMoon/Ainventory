import { hexToRgb, rgbToCieLab, rgbToHex } from '../shared/colorMath.js';
import type { PersonalColorSeasonKey } from './skinToneAnalyzer.ts';

export type MstLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type MstUndertone = 'cool' | 'neutral' | 'warm' | 'olive';

export interface MstSwatch {
  code: string;
  level: MstLevel;
  undertone: MstUndertone;
  hex: string;
  lab: { L: number; a: number; b: number };
  personalColor: PersonalColorSeasonKey;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
}

export interface MstBaseLevelSpec {
  level: MstLevel;
  code: string;
  hex: string;
  lab: { L: number; a: number; b: number };
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
}

export interface NormalizedMstExtractionResult {
  swatch: MstSwatch;
  normalizedHex: string;
  normalizedLab: { L: number; a: number; b: number };
  confidence: number;
}

export interface AdaptiveMstShadingInput {
  skinToneHex: string;
  mstLevel?: MstLevel;
  mstUndertone?: MstUndertone;
  personalColor?: PersonalColorSeasonKey;
  theme?: 'light' | 'dark';
}

export interface AdaptiveMstShadingPalette {
  base: string;
  highlight: string;
  specularHighlight: string;
  subsurface: string;
  midShadow: string;
  deepShadow: string;
  contourInk: string;
  rimLight: string;
  lipNatural: string;
  lipShadow: string;
  nailBed: string;
  palmSoleTint: string;
  mstLevel: MstLevel;
  mstUndertone: MstUndertone;
}

export const MST_LEVELS: readonly MstLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const MST_UNDERTONES: readonly MstUndertone[] = [
  'cool',
  'neutral',
  'warm',
  'olive',
] as const;

const UNDERTONE_LABELS: Readonly<
  Record<MstUndertone, { ko: string; en: string; codeSuffix: string }>
> = {
  cool: { ko: '쿨', en: 'Cool', codeSuffix: 'COOL' },
  neutral: { ko: '뉴트럴', en: 'Neutral', codeSuffix: 'NEUTRAL' },
  warm: { ko: '웜', en: 'Warm', codeSuffix: 'WARM' },
  olive: { ko: '올리브', en: 'Olive', codeSuffix: 'OLIVE' },
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function roundLab(lab: { L: number; a: number; b: number }): {
  L: number;
  a: number;
  b: number;
} {
  return {
    L: Number(lab.L.toFixed(1)),
    a: Number(lab.a.toFixed(1)),
    b: Number(lab.b.toFixed(1)),
  };
}

function sanitizeHex(rawHex: string | undefined | null, fallback = '#DFBA9B'): string {
  const s = String(rawHex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) {
    return s.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return `#${s.toUpperCase()}`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

/**
 * Converts D65 CIE L*a*b* coordinates to clamped sRGB bytes [0..255].
 */
export function cieLabToRgb(
  L: number,
  a: number,
  b: number
): { r: number; g: number; b: number } {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const xr = fx > 0.2068966 ? fx * fx * fx : (fx - 16 / 116) / 7.787;
  const yr = L > 7.9996 ? fy * fy * fy : L / 903.3;
  const zr = fz > 0.2068966 ? fz * fz * fz : (fz - 16 / 116) / 7.787;

  const x = xr * 0.95047;
  const y = yr;
  const z = zr * 1.08883;

  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  const linearToSrgbByte = (v: number): number => {
    const c = clamp(v, 0, 1);
    const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clampByte(encoded * 255);
  };

  return {
    r: linearToSrgbByte(rl),
    g: linearToSrgbByte(gl),
    b: linearToSrgbByte(bl),
  };
}

export function cieLabToHex(L: number, a: number, b: number): string {
  const rgb = cieLabToRgb(L, a, b);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

const RAW_BASE_LEVEL_DEFS: ReadonlyArray<{
  level: MstLevel;
  hex: string;
  labelKo: string;
  labelEn: string;
}> = [
  { level: 1, hex: '#F6EDE4', labelKo: '포슬린 페어', labelEn: 'Porcelain Fair' },
  { level: 2, hex: '#EEDACE', labelKo: '아이보리 라이트', labelEn: 'Ivory Light' },
  { level: 3, hex: '#E4C7B2', labelKo: '웜 알라바스터', labelEn: 'Warm Alabaster' },
  { level: 4, hex: '#D7B296', labelKo: '라이트 베이지', labelEn: 'Light Beige' },
  { level: 5, hex: '#C69B79', labelKo: '미디엄 샌드', labelEn: 'Medium Sand' },
  { level: 6, hex: '#AF815D', labelKo: '골든 탄', labelEn: 'Golden Tan' },
  { level: 7, hex: '#956746', labelKo: '앰버 브론즈', labelEn: 'Amber Bronze' },
  { level: 8, hex: '#784E33', labelKo: '리치 시에나', labelEn: 'Rich Sienna' },
  { level: 9, hex: '#5A3724', labelKo: '딥 마호가니', labelEn: 'Deep Mahogany' },
  { level: 10, hex: '#291711', labelKo: '에보니 에스프레소', labelEn: 'Ebony Espresso' },
] as const;

/**
 * Canonical 10-point Google Monk Skin Tone luminance progression (MST-01 `#F6EDE4` .. MST-10 `#291711`).
 */
export const MST_BASE_LEVELS: readonly MstBaseLevelSpec[] = RAW_BASE_LEVEL_DEFS.map((item) => {
  const rgb = hexToRgb(item.hex);
  const lab = roundLab(rgbToCieLab(rgb.r, rgb.g, rgb.b));
  const padded = String(item.level).padStart(2, '0');
  return {
    level: item.level,
    code: `MST-${padded}`,
    hex: item.hex,
    lab,
    labelKo: item.labelKo,
    labelEn: item.labelEn,
    shortKo: `MST ${item.level}`,
    shortEn: `MST ${item.level}`,
  };
});

const LEVEL_CHROMA_SCALES: Readonly<Record<MstLevel, number>> = {
  1: 0.68,
  2: 0.82,
  3: 0.94,
  4: 1.0,
  5: 1.05,
  6: 1.05,
  7: 1.0,
  8: 0.92,
  9: 0.82,
  10: 0.72,
};

const UNDERTONE_LAB_SHIFTS: Readonly<
  Record<MstUndertone, { dL: number; da: number; db: number }>
> = {
  cool: { dL: 0.2, da: 2.6, db: -3.8 },
  neutral: { dL: 0.0, da: 0.0, db: 0.0 },
  warm: { dL: 0.1, da: 1.2, db: 4.4 },
  olive: { dL: -0.2, da: -3.3, db: 2.8 },
};

function derivePersonalColorForMst(
  level: MstLevel,
  undertone: MstUndertone
): PersonalColorSeasonKey {
  if (undertone === 'cool') {
    return level <= 5 ? 'summer_cool' : 'winter_cool';
  }
  if (undertone === 'warm') {
    return level <= 4 ? 'spring_warm' : 'autumn_warm';
  }
  if (undertone === 'olive') {
    return level <= 8 ? 'autumn_warm' : 'winter_cool';
  }
  // Balanced neutral undertone across luminance spectrum
  if (level <= 3) return 'spring_warm';
  if (level <= 5) return 'summer_cool';
  if (level <= 8) return 'autumn_warm';
  return 'winter_cool';
}

/**
 * Full 40-tone Monk Skin Tone × Undertone swatch matrix (`10 levels × 4 undertones`).
 */
export const MST_SWATCH_MATRIX: readonly MstSwatch[] = (() => {
  const list: MstSwatch[] = [];

  for (const baseSpec of MST_BASE_LEVELS) {
    const baseRgb = hexToRgb(baseSpec.hex);
    const exactBaseLab = rgbToCieLab(baseRgb.r, baseRgb.g, baseRgb.b);
    const scale = LEVEL_CHROMA_SCALES[baseSpec.level];
    const padded = String(baseSpec.level).padStart(2, '0');

    for (const undertone of MST_UNDERTONES) {
      let swatchHex = baseSpec.hex;
      if (undertone !== 'neutral') {
        const shift = UNDERTONE_LAB_SHIFTS[undertone];
        const baseL = baseSpec.level === 10 ? Math.max(exactBaseLab.L, 12.5) : exactBaseLab.L;
        swatchHex = cieLabToHex(
          baseL + shift.dL,
          exactBaseLab.a + shift.da * scale,
          exactBaseLab.b + shift.db * scale
        );
      }

      const finalRgb = hexToRgb(swatchHex);
      const finalLab = roundLab(rgbToCieLab(finalRgb.r, finalRgb.g, finalRgb.b));
      const utMeta = UNDERTONE_LABELS[undertone];

      list.push({
        code: `MST-${padded}-${utMeta.codeSuffix}`,
        level: baseSpec.level,
        undertone,
        hex: swatchHex,
        lab: finalLab,
        personalColor: derivePersonalColorForMst(baseSpec.level, undertone),
        labelKo: `MST ${padded} ${baseSpec.labelKo} · ${utMeta.ko}`,
        labelEn: `MST ${padded} ${baseSpec.labelEn} · ${utMeta.en}`,
        shortKo: `MST ${baseSpec.level} · ${utMeta.ko}`,
        shortEn: `MST ${baseSpec.level} · ${utMeta.en}`,
      });
    }
  }

  return list;
})();

const SWATCH_LOOKUP_MAP = new Map<string, MstSwatch>();
for (const swatch of MST_SWATCH_MATRIX) {
  SWATCH_LOOKUP_MAP.set(`${swatch.level}:${swatch.undertone}`, swatch);
}

export function isMstLevel(val: unknown): val is MstLevel {
  return typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 10;
}

export function normalizeMstLevel(val: unknown, fallback: MstLevel = 4): MstLevel {
  const n = Math.round(Number(val));
  if (Number.isFinite(n) && n >= 1 && n <= 10) {
    return n as MstLevel;
  }
  return fallback;
}

export function normalizeMstUndertone(
  val: unknown,
  fallback: MstUndertone = 'neutral'
): MstUndertone {
  const s = String(val || '')
    .trim()
    .toLowerCase();
  if (s === 'cool' || s === 'neutral' || s === 'warm' || s === 'olive') {
    return s;
  }
  return fallback;
}

export function getMstSwatch(level: MstLevel, undertone: MstUndertone = 'neutral'): MstSwatch {
  const safeLevel = normalizeMstLevel(level, 4);
  const safeUndertone = normalizeMstUndertone(undertone, 'neutral');
  const found = SWATCH_LOOKUP_MAP.get(`${safeLevel}:${safeUndertone}`);
  if (found) return found;
  return MST_SWATCH_MATRIX[13]; // MST-04-NEUTRAL fallback
}

function perceptualSkinDeltaE(
  labA: { L: number; a: number; b: number },
  labB: { L: number; a: number; b: number }
): number {
  const dL = labA.L - labB.L;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  // Slightly emphasize a*/b* chromaticity so cool/neutral/warm/olive undertones separate cleanly
  return Math.sqrt(dL * dL + da * da * 1.28 + db * db * 1.22);
}

export function findClosestMstFromLab(targetLab: {
  L: number;
  a: number;
  b: number;
}): { swatch: MstSwatch; deltaE: number } {
  let best = MST_SWATCH_MATRIX[13];
  let bestDist = Number.POSITIVE_INFINITY;

  for (const candidate of MST_SWATCH_MATRIX) {
    const dist = perceptualSkinDeltaE(targetLab, candidate.lab);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return { swatch: best, deltaE: bestDist };
}

export function findClosestMstFromHex(hex: string): MstSwatch {
  const cleanHex = sanitizeHex(hex, '#D7B296');
  const rgb = hexToRgb(cleanHex);
  const lab = rgbToCieLab(rgb.r, rgb.g, rgb.b);
  return findClosestMstFromLab(lab).swatch;
}

/**
 * Illumination-normalized multi-pin MST skin-tone matcher.
 * - Trims extreme L* specular glare spikes and harsh occlusion shadows across facial pins
 * - Restores chromaticity desaturated by forehead/cheekbone flash highlights
 * - Gently lifts under-exposed indoor shadow bias while preserving genuine deep melanin (MST 8–10)
 */
export function extractNormalizedMstFromSamples(
  samples: Array<{ hex?: string; lab?: { L: number; a: number; b: number } }>,
  fallbackHex?: string
): NormalizedMstExtractionResult {
  const parsedLabs: Array<{ L: number; a: number; b: number }> = [];

  if (Array.isArray(samples)) {
    for (const item of samples) {
      if (!item || typeof item !== 'object') continue;
      if (
        item.lab &&
        Number.isFinite(item.lab.L) &&
        Number.isFinite(item.lab.a) &&
        Number.isFinite(item.lab.b)
      ) {
        parsedLabs.push({
          L: clamp(item.lab.L, 4, 99),
          a: clamp(item.lab.a, -15, 42),
          b: clamp(item.lab.b, -15, 52),
        });
      } else if (typeof item.hex === 'string' && item.hex.trim()) {
        const clean = sanitizeHex(item.hex, '');
        if (clean) {
          const rgb = hexToRgb(clean);
          parsedLabs.push(rgbToCieLab(rgb.r, rgb.g, rgb.b));
        }
      }
    }
  }

  if (parsedLabs.length === 0) {
    const safeHex = sanitizeHex(fallbackHex, '#D7B296');
    const rgb = hexToRgb(safeHex);
    const lab = roundLab(rgbToCieLab(rgb.r, rgb.g, rgb.b));
    const { swatch, deltaE } = findClosestMstFromLab(lab);
    return {
      swatch,
      normalizedHex: safeHex,
      normalizedLab: lab,
      confidence: clamp(Math.round(92 - deltaE * 1.4), 65, 96),
    };
  }

  const sortedByL = [...parsedLabs].sort((p1, p2) => p1.L - p2.L);
  const n = sortedByL.length;
  const midIdx = Math.floor(n / 2);
  const medianL =
    n % 2 === 1 ? sortedByL[midIdx].L : (sortedByL[midIdx - 1].L + sortedByL[midIdx].L) * 0.5;

  const sortedA = [...parsedLabs].map((p) => p.a).sort((x, y) => x - y);
  const sortedB = [...parsedLabs].map((p) => p.b).sort((x, y) => x - y);
  const medianA =
    n % 2 === 1 ? sortedA[midIdx] : (sortedA[midIdx - 1] + sortedA[midIdx]) * 0.5;
  const medianB =
    n % 2 === 1 ? sortedB[midIdx] : (sortedB[midIdx - 1] + sortedB[midIdx]) * 0.5;

  const minL = sortedByL[0].L;
  const maxL = sortedByL[n - 1].L;
  const spreadL = maxL - minL;

  // Trim or winsorize extreme glare spikes (high L* with bleached chroma) and harsh shadow dips
  let sumW = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < n; i++) {
    const p = sortedByL[i];
    const diffHigh = p.L - medianL;
    const diffLow = medianL - p.L;

    // Downweight harsh specular glare or occlusion shadows
    let weight = 1.0;
    if (n >= 3 && i === n - 1 && diffHigh > 6.0) {
      weight = clamp(1.0 - (diffHigh - 6.0) * 0.14, 0.15, 0.75);
    } else if (n >= 3 && i === 0 && diffLow > 7.0) {
      weight = clamp(1.0 - (diffLow - 7.0) * 0.14, 0.15, 0.75);
    }

    const clampedSampleL = clamp(p.L, medianL - 6.5, medianL + 5.5);
    // Restore chroma if specular highlight bleached a*/b* above L* 88
    const glareBleach = p.L > 88 ? clamp((p.L - 88) / 10, 0, 0.65) : 0;
    const sampleA = p.a * (1 - glareBleach) + medianA * glareBleach;
    const sampleB = p.b * (1 - glareBleach) + medianB * glareBleach;

    sumW += weight;
    sumL += clampedSampleL * weight;
    sumA += sampleA * weight;
    sumB += sampleB * weight;
  }

  let normL = sumL / Math.max(1e-6, sumW);
  let normA = sumA / Math.max(1e-6, sumW);
  let normB = sumB / Math.max(1e-6, sumW);

  // Compensate uneven indoor shadow falloff toward natural D65 skin reflectance
  // without falsely lightening uniform deep melanin tones (tight spreadL <= 6.5)
  if (spreadL > 6.5 && normL >= 20 && normL <= 68) {
    const shadowLift = Math.min(3.4, (spreadL - 6.5) * 0.32);
    normL += shadowLift;
  } else if (normL > 92.5 && spreadL > 5.0) {
    // Tame over-exposed studio flash washout
    normL -= Math.min(2.6, (normL - 92.5) * 0.55);
  }

  normL = clamp(normL, 9.0, 95.8);
  normA = clamp(normA, -4.5, 26.0);
  normB = clamp(normB, -3.5, 36.0);

  const normalizedHex = cieLabToHex(normL, normA, normB);
  const verifyRgb = hexToRgb(normalizedHex);
  const normalizedLab = roundLab(rgbToCieLab(verifyRgb.r, verifyRgb.g, verifyRgb.b));
  const { swatch, deltaE } = findClosestMstFromLab(normalizedLab);

  const spreadPenalty = Math.min(18, spreadL * 0.85);
  const distPenalty = Math.min(14, deltaE * 1.35);
  const confidence = clamp(Math.round(98 - spreadPenalty - distPenalty), 66, 99);

  return {
    swatch,
    normalizedHex,
    normalizedLab,
    confidence,
  };
}

/**
 * Computes luminance-adaptive, inclusive 3D-sculpting skin shading across MST 1–10:
 * - Fair skin (`MST 1–3`, high L*): prevents contour washout on `#FFFFFF`/`#F5F5F7` backdrops
 *   via warm-graphite/umber `contourInk` and clean rosy/ivory `midShadow`.
 * - Deep Dark skin (`MST 8–10`, low L*): prevents shadow crushing by clamping `deepShadow`
 *   above a rich espresso floor (`#1A0F0B`..`#261611`), boosting warm mahogany/amber `subsurface`,
 *   and elevating `specularHighlight` + Fresnel `rimLight` in both light and dark modes.
 */
export function computeAdaptiveMstShading(
  input: AdaptiveMstShadingInput
): AdaptiveMstShadingPalette {
  const base = sanitizeHex(input?.skinToneHex, '#DFBA9B');
  const baseRgb = hexToRgb(base);
  const baseLab = rgbToCieLab(baseRgb.r, baseRgb.g, baseRgb.b);

  const autoSwatch = findClosestMstFromLab(baseLab).swatch;
  const mstLevel: MstLevel = input?.mstLevel
    ? normalizeMstLevel(input.mstLevel, autoSwatch.level)
    : autoSwatch.level;
  const mstUndertone: MstUndertone = input?.mstUndertone
    ? normalizeMstUndertone(input.mstUndertone, autoSwatch.undertone)
    : input?.personalColor === 'summer_cool' || input?.personalColor === 'winter_cool'
      ? autoSwatch.undertone === 'olive'
        ? 'olive'
        : 'cool'
      : autoSwatch.undertone;

  const isDarkTheme = input?.theme === 'dark';
  const L = baseLab.L;
  const a = baseLab.a;
  const b = baseLab.b;

  // Smooth regime weights: fairFactor in [0..1] for MST 1-3, deepFactor in [0..1] for MST 8-10
  const fairFactor = clamp((L - 74) / 18, 0, 1);
  const deepFactor = clamp((46 - L) / 28, 0, 1);

  const isCool = mstUndertone === 'cool';
  const isWarm = mstUndertone === 'warm';
  const isOlive = mstUndertone === 'olive';

  // 1. Key-light broad diffuse highlight
  // Fair skin: restrained lift so it never bleaches to pure #FFFFFF; Deep skin: generous lift to sculpt 3D planes
  const highlightLiftL = 4.2 * fairFactor + 8.6 * (1 - fairFactor - deepFactor) + 15.5 * deepFactor;
  const highlightL = clamp(L + highlightLiftL, 24, 96.8);
  const highlightA = a * (0.9 - 0.1 * deepFactor) + (isCool ? 0.5 : -0.3);
  const highlightB = b * (0.92 - 0.08 * deepFactor) + (isWarm ? 1.2 : isCool ? -0.8 : 0.3);
  const highlight = cieLabToHex(highlightL, highlightA, highlightB);

  // 2. Micro-specular skin sheen (elevated on melanin-rich MST 8-10 for nose bridge, cheekbones, lips, knuckles)
  const specLiftL = 6.5 * fairFactor + 15.5 * (1 - fairFactor - deepFactor) + 29.5 * deepFactor;
  const specL = clamp(L + specLiftL, 38, isDarkTheme ? 95.5 : 98.2);
  const specA = a * 0.58 + (isWarm ? 1.4 : isCool ? 0.6 : 0.8);
  const specB = b * 0.62 + (isWarm ? 3.2 : isCool ? -1.2 : 1.6);
  const specularHighlight = cieLabToHex(specL, specA, specB);

  // 3. Subsurface dermal scatter (warm rosy-peach on fair, rich mahogany/amber glow on MST 8-10)
  const sssDeltaL = -3.0 * (1 - deepFactor) + 5.8 * deepFactor;
  const sssL = clamp(L + sssDeltaL, 17.5, 92.5);
  const sssA = clamp(
    a + (isCool ? 5.6 : isOlive ? 3.4 : 5.2) + 3.4 * deepFactor,
    2.0,
    30.0
  );
  const sssB = clamp(
    b + (isWarm ? 4.2 : isOlive ? 4.8 : 1.6) + 5.4 * deepFactor,
    2.0,
    38.0
  );
  const subsurface = cieLabToHex(sssL, sssA, sssB);

  // 4. Mid-shadow & Deep-shadow with anti-washout (MST 1-3) and anti-crush espresso floor (MST 8-10)
  const midDropL = 10.6 * fairFactor + 10.2 * (1 - fairFactor - deepFactor) + 5.2 * deepFactor;
  const midL = clamp(L - midDropL, 12.2, 86.0);
  const midA = clamp(a + 1.4 * fairFactor + 1.2 * deepFactor, 1.2, 24.0);
  const midB = clamp(b + (isCool ? -0.4 : 1.2), 1.5, 32.0);
  const rawMidRgb = cieLabToRgb(midL, midA, midB);

  // Clamp midShadow above dark roast floor so MST-10 midtones remain distinct from deepShadow
  const midFloor = mstLevel >= 10 ? { r: 33, g: 19, b: 14 } : { r: 42, g: 25, b: 19 };
  const midShadow =
    mstLevel >= 8
      ? rgbToHex(
          Math.max(midFloor.r, rawMidRgb.r),
          Math.max(midFloor.g, rawMidRgb.g),
          Math.max(midFloor.b, rawMidRgb.b)
        )
      : rgbToHex(rawMidRgb.r, rawMidRgb.g, rawMidRgb.b);

  const deepDropL = 20.5 * fairFactor + 19.5 * (1 - fairFactor - deepFactor) + 8.5 * deepFactor;
  const deepL = clamp(L - deepDropL, 8.2, 75.0);
  const deepA = clamp(a + 2.2 * fairFactor + 1.6 * deepFactor, 1.8, 24.0);
  const deepB = clamp(b + (isOlive ? 1.6 : 0.8), 2.0, 30.0);
  const rawDeepRgb = cieLabToRgb(deepL, deepA, deepB);

  // Espresso floor (#1A0F0B for MST-10 .. #261611 for MST-8) prevents black shadow crushing
  const espressoFloor =
    mstLevel >= 10
      ? { r: 0x1a, g: 0x0f, b: 0x0b }
      : mstLevel === 9
        ? { r: 0x20, g: 0x12, b: 0x0e }
        : { r: 0x26, g: 0x16, b: 0x11 };

  const deepShadow =
    mstLevel >= 8 || L <= 42
      ? rgbToHex(
          Math.max(espressoFloor.r, rawDeepRgb.r),
          Math.max(espressoFloor.g, rawDeepRgb.g),
          Math.max(espressoFloor.b, rawDeepRgb.b)
        )
      : rgbToHex(rawDeepRgb.r, rawDeepRgb.g, rawDeepRgb.b);

  // 5. Contour ink: warm-graphite/umber with clear contrast against #FFFFFF/#F5F5F7 on MST 1-3,
  // and rich dark espresso-umber on MST 8-10
  let contourInk: string;
  if (mstLevel <= 3 || L >= 78) {
    const inkL = clamp(L - 44, 38, 49);
    const inkA = clamp(a + (isCool ? 3.2 : isOlive ? 1.2 : 4.2), 3.0, 12.5);
    const inkB = clamp(b * 0.72 + (isWarm ? 5.0 : isOlive ? 5.5 : 2.2), 4.0, 16.5);
    contourInk = cieLabToHex(inkL, inkA, inkB);
  } else if (mstLevel >= 8 || L <= 42) {
    const inkRgb = cieLabToRgb(clamp(L - 12, 5.5, 22), clamp(a * 0.85, 3, 16), clamp(b * 0.8, 3, 18));
    contourInk = rgbToHex(
      Math.max(0x14, inkRgb.r),
      Math.max(0x0b, inkRgb.g),
      Math.max(0x08, inkRgb.b)
    );
  } else {
    contourInk = cieLabToHex(clamp(L - 34, 20, 38), clamp(a + 2.4, 4, 18), clamp(b * 0.85, 5, 22));
  }

  // 6. Fresnel grazing rimLight (warm champagne or soft sky rim depending on theme & undertone;
  // strongly elevated on MST 8-10 so dark skin silhouette pops cleanly in both light & dark modes)
  let rimLight: string;
  if (mstLevel >= 8 || L <= 42) {
    if (isDarkTheme) {
      rimLight = isCool ? '#C6D8F2' : '#E8CFAF';
    } else {
      rimLight = isCool ? '#B8CAE6' : '#DFBE9B';
    }
  } else if (mstLevel <= 3 || L >= 78) {
    if (isDarkTheme) {
      rimLight = isCool ? '#DCE6F5' : '#F3E5D5';
    } else {
      // On bright studio backdrops, use a crisp luminous pearl edge slightly distinct from #FFFFFF
      rimLight = isCool ? '#EEF3FA' : '#FBF4EC';
    }
  } else {
    const rimLift = isDarkTheme ? 24 : 18;
    const rimL = clamp(L + rimLift, 58, 95);
    const rimA = a * 0.55 + (isCool ? -0.6 : 1.2);
    const rimB = b * 0.6 + (isCool ? -4.2 : 4.6);
    rimLight = cieLabToHex(rimL, rimA, rimB);
  }

  // 7. Anatomical mucosal & extremity tints (lips, nail beds, palms/soles)
  const lipL =
    mstLevel >= 8
      ? clamp(L + 5.5, 22, 42)
      : mstLevel <= 3
        ? clamp(L - 18.5, 58, 72)
        : clamp(L - 12.5, 38, 62);
  const lipA = clamp(
    a + (isCool ? 16.5 : isWarm ? 15.2 : isOlive ? 13.0 : 15.5) * (1 - 0.22 * deepFactor),
    12.5,
    32.0
  );
  const lipB = clamp(
    b * 0.68 + (isWarm ? 5.5 : isCool ? -2.8 : isOlive ? 2.4 : 1.5),
    1.5,
    22.0
  );
  const lipNatural = cieLabToHex(lipL, lipA, lipB);

  const rawLipShadowRgb = cieLabToRgb(
    clamp(lipL - (mstLevel >= 8 ? 6.5 : 11.5), 11, 60),
    clamp(lipA * 0.92, 9, 28),
    clamp(lipB * 0.85, 1, 18)
  );
  const lipShadow =
    mstLevel >= 8
      ? rgbToHex(
          Math.max(0x24, rawLipShadowRgb.r),
          Math.max(0x11, rawLipShadowRgb.g),
          Math.max(0x12, rawLipShadowRgb.b)
        )
      : rgbToHex(rawLipShadowRgb.r, rawLipShadowRgb.g, rawLipShadowRgb.b);

  // Translucent keratin nail plate: lighter & softly rosy across all MST levels
  const nailL = clamp(L + (3.2 * fairFactor + 6.5 * (1 - fairFactor - deepFactor) + 12.5 * deepFactor), 26, 95);
  const nailA = clamp(a * 0.8 + 4.2, 3.5, 18.0);
  const nailB = clamp(b * 0.58 + 1.5, 2.0, 18.0);
  const nailBed = cieLabToHex(nailL, nailA, nailB);

  // Palmar & plantar skin has lower melanin concentration on medium-to-deep skin tones
  const palmLiftL = 1.8 * fairFactor + 5.8 * (1 - fairFactor - deepFactor) + 14.2 * deepFactor;
  const palmL = clamp(L + palmLiftL, 28, 95.2);
  const palmA = clamp(a * 0.85 + 2.8, 2.8, 19.0);
  const palmB = clamp(b * 0.72 + 1.2, 2.5, 22.0);
  const palmSoleTint = cieLabToHex(palmL, palmA, palmB);

  return {
    base,
    highlight,
    specularHighlight,
    subsurface,
    midShadow,
    deepShadow,
    contourInk,
    rimLight,
    lipNatural,
    lipShadow,
    nailBed,
    palmSoleTint,
    mstLevel,
    mstUndertone,
  };
}
