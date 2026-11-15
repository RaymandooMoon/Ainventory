import { hexToRgb, rgbToCieLab, rgbToHex } from '../shared/colorMath.js';
import {
  type MstLevel,
  type MstSwatch,
  type MstUndertone,
  computeAdaptiveMstShading,
  extractNormalizedMstFromSamples,
  findClosestMstFromHex,
  getMstSwatch,
  isMstLevel,
  normalizeMstUndertone,
} from './monkSkinTone.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';

export type { MstLevel, MstSwatch, MstUndertone };

export type PersonalColorSeasonKey =
  | 'spring_warm'
  | 'summer_cool'
  | 'autumn_warm'
  | 'winter_cool';

export type LightingCalibrationKey =
  | 'auto_d65'
  | 'studio_cool_fix'
  | 'indoor_warm_fix'
  | 'raw_original';

export interface ColorSwatchItem {
  name: string;
  nameEn: string;
  hex: string;
}

export interface SkinTonePreset {
  key: string;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  subTypeLabelKo: string;
  subTypeLabelEn: string;
  undertone: 'warm' | 'cool';
  bestColors: ReadonlyArray<ColorSwatchItem>;
  adviceKo: string;
  adviceEn: string;
}

export interface SkinPinSample {
  id: 'forehead' | 'leftCheek' | 'rightCheek' | 'chin';
  labelKo: string;
  labelEn: string;
  x: number;
  y: number;
  hex: string;
  lab: { L: number; a: number; b: number };
}

export interface SkinToneAnalysisResult {
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  personalColorLabelKo: string;
  personalColorLabelEn: string;
  subTypeLabelKo: string;
  subTypeLabelEn: string;
  undertone: 'warm' | 'cool';
  matchedPresetKey: string;
  mstLevel?: MstLevel;
  mstUndertone?: MstUndertone;
  mstCode?: string;
  confidence: number;
  lightingMode: LightingCalibrationKey;
  faceDetected: boolean;
  detectorEngine?: string;
  faceBoxPreview: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  cropSourceRect: {
    sx: number;
    sy: number;
    side: number;
    srcW: number;
    srcH: number;
  };
  lab: {
    L: number;
    a: number;
    b: number;
    itaDeg: number;
    warmthIndex: number;
    chroma: number;
  };
  pins: SkinPinSample[];
  bestColors: ReadonlyArray<ColorSwatchItem>;
  adviceKo: string;
  adviceEn: string;
  previewDataUrl: string;
}

export interface StoredSkinProfile {
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  personalColorLabelKo: string;
  subTypeLabelKo: string;
  gender?: 'male' | 'female';
  presetKey: string;
  mstLevel?: MstLevel;
  mstUndertone?: MstUndertone;
  mstCode?: string;
  portraitDataUrl?: string | null;
}

export interface SkinShadingPalette {
  highlight: string;
  base: string;
  subsurface: string;
  midShadow: string;
  deepShadow: string;
  rimLight: string;
  lipTint: string;
  browHair: string;
  hairMain: string;
  hairHighlight: string;
  auraColor: string;
  basewearFill: string;
  basewearShadow: string;
  specularHighlight?: string;
  contourInk?: string;
  lipShadow?: string;
  nailBed?: string;
  palmSoleTint?: string;
  mstLevel?: MstLevel;
  mstUndertone?: MstUndertone;
}

const SKIN_PROFILE_STORAGE_KEY = 'ainventory_skin_profile_v1';

export const LIGHTING_CALIBRATION_MODES: ReadonlyArray<{
  key: LightingCalibrationKey;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  gains: { r: number; g: number; b: number; autoGreyWorld: boolean };
}> = [
  {
    key: 'auto_d65',
    labelKo: 'D65 자연광 자동 보정',
    labelEn: 'Auto D65 Daylight',
    shortKo: 'D65 자연광',
    shortEn: 'Auto D65',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: true },
  },
  {
    key: 'studio_cool_fix',
    labelKo: '형광등 · 쿨 LED 보정',
    labelEn: 'Cool LED / Fluorescent Fix',
    shortKo: '형광등 보정',
    shortEn: 'Cool LED Fix',
    gains: { r: 1.06, g: 1.01, b: 0.91, autoGreyWorld: false },
  },
  {
    key: 'indoor_warm_fix',
    labelKo: '실내 노란 조명 보정',
    labelEn: 'Warm Indoor Lamp Fix',
    shortKo: '노란조명 보정',
    shortEn: 'Warm Lamp Fix',
    gains: { r: 0.93, g: 0.99, b: 1.09, autoGreyWorld: false },
  },
  {
    key: 'raw_original',
    labelKo: '무보정 원본 픽셀',
    labelEn: 'Unadjusted Original',
    shortKo: '원본 픽셀',
    shortEn: 'Original',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: false },
  },
] as const;

export const SEASON_BEST_SWATCHES: Record<
  PersonalColorSeasonKey,
  {
    labelKo: string;
    labelEn: string;
    adviceKo: string;
    adviceEn: string;
    colors: ReadonlyArray<ColorSwatchItem>;
  }
> = {
  spring_warm: {
    labelKo: '봄 웜톤',
    labelEn: 'Spring Warm',
    adviceKo:
      '웜 아이보리·버터 크림·피치 코랄·라이트 카멜 컬러가 피부 혈색을 가장 화사하게 밝혀줍니다.',
    adviceEn:
      'Warm ivory, butter cream, peach coral, and light camel brighten your complexion effortlessly.',
    colors: [
      { name: '웜 아이보리', nameEn: 'Warm Ivory', hex: '#F6EFE2' },
      { name: '버터 크림', nameEn: 'Butter Cream', hex: '#F3E3BE' },
      { name: '피치 코랄', nameEn: 'Peach Coral', hex: '#EE9B82' },
      { name: '애프리콧 베이지', nameEn: 'Apricot Beige', hex: '#E3BA95' },
      { name: '라이트 세이지', nameEn: 'Light Sage', hex: '#A4C288' },
    ],
  },
  summer_cool: {
    labelKo: '여름 쿨톤',
    labelEn: 'Summer Cool',
    adviceKo:
      '소프트 화이트·파우더 블루·라벤더 그레이·뮤트 네이비 톤이 피부 결을 맑고 깨끗하게 정돈합니다.',
    adviceEn:
      'Soft white, powder blue, lavender mist, and muted navy keep your skin clear and refined.',
    colors: [
      { name: '소프트 화이트', nameEn: 'Soft White', hex: '#F2F4F7' },
      { name: '파우더 블루', nameEn: 'Powder Blue', hex: '#99BBD9' },
      { name: '라벤더 미스트', nameEn: 'Lavender Mist', hex: '#B9B3CC' },
      { name: '더스티 로즈', nameEn: 'Dusty Rose', hex: '#CC9AA6' },
      { name: '뮤트 네이비', nameEn: 'Muted Navy', hex: '#2B3D5B' },
    ],
  },
  autumn_warm: {
    labelKo: '가을 웜톤',
    labelEn: 'Autumn Warm',
    adviceKo:
      '트렌치 베이지·카멜·올리브 카키·딥 브라운 등 깊이감 있는 얼씨(Earthy) 톤이 세련된 분위기를 살립니다.',
    adviceEn:
      'Oatmeal sand, camel brown, olive khaki, and rich espresso bring warm depth and balance.',
    colors: [
      { name: '오트밀 샌드', nameEn: 'Oatmeal Sand', hex: '#D8C7AE' },
      { name: '카멜 브라운', nameEn: 'Camel Brown', hex: '#BE8B58' },
      { name: '테라코타', nameEn: 'Terracotta', hex: '#B25538' },
      { name: '올리브 카키', nameEn: 'Olive Khaki', hex: '#77805D' },
      { name: '에스프레소', nameEn: 'Espresso', hex: '#583E2E' },
    ],
  },
  winter_cool: {
    labelKo: '겨울 쿨톤',
    labelEn: 'Winter Cool',
    adviceKo:
      '선명한 블랙·아이시 화이트·차콜·로열 네이비·버건디 등 고대비 컬러가 이목구비를 또렷하게 강조합니다.',
    adviceEn:
      'Crisp black, icy white, charcoal slate, royal navy, and burgundy create sharp definition.',
    colors: [
      { name: '퓨어 블랙', nameEn: 'Pure Black', hex: '#1B1C20' },
      { name: '아이시 화이트', nameEn: 'Icy White', hex: '#F6F8FC' },
      { name: '차콜 슬레이트', nameEn: 'Charcoal Slate', hex: '#373B44' },
      { name: '로열 네이비', nameEn: 'Royal Navy', hex: '#1D2E57' },
      { name: '딥 버건디', nameEn: 'Deep Burgundy', hex: '#6D1F31' },
    ],
  },
};

export const SKIN_TONE_MANNEQUIN_PRESETS: readonly SkinTonePreset[] = [
  {
    key: 'porcelain_cool',
    labelKo: '포슬린 페어 · 여름 쿨 라이트',
    labelEn: 'Porcelain Fair · Summer Cool Light',
    shortKo: '포슬린 쿨',
    shortEn: 'Porcelain Cool',
    skinToneHex: '#F5E0DC',
    personalColor: 'summer_cool',
    subTypeLabelKo: '여름 쿨 라이트',
    subTypeLabelEn: 'Summer Cool Light',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.summer_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.summer_cool.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.summer_cool.adviceEn,
  },
  {
    key: 'spring_ivory',
    labelKo: '웜 아이보리 · 봄 웜 라이트',
    labelEn: 'Warm Ivory · Spring Warm Light',
    shortKo: '봄 웜 아이보리',
    shortEn: 'Spring Ivory',
    skinToneHex: '#F4D5BD',
    personalColor: 'spring_warm',
    subTypeLabelKo: '봄 웜 라이트',
    subTypeLabelEn: 'Spring Warm Light',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.spring_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.spring_warm.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.spring_warm.adviceEn,
  },
  {
    key: 'summer_rose',
    labelKo: '로즈 아이보리 · 여름 쿨 뮤트',
    labelEn: 'Rose Ivory · Summer Cool Mute',
    shortKo: '여름 쿨 로즈',
    shortEn: 'Summer Rose',
    skinToneHex: '#EAC9C8',
    personalColor: 'summer_cool',
    subTypeLabelKo: '여름 쿨 뮤트',
    subTypeLabelEn: 'Summer Cool Mute',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.summer_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.summer_cool.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.summer_cool.adviceEn,
  },
  {
    key: 'warm_vanilla',
    labelKo: '내추럴 바닐라 · 봄 웜 브라이트',
    labelEn: 'Natural Vanilla · Spring Warm Bright',
    shortKo: '봄 웜 바닐라',
    shortEn: 'Warm Vanilla',
    skinToneHex: '#EBC5A6',
    personalColor: 'spring_warm',
    subTypeLabelKo: '봄 웜 브라이트',
    subTypeLabelEn: 'Spring Warm Bright',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.spring_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.spring_warm.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.spring_warm.adviceEn,
  },
  {
    key: 'autumn_beige',
    labelKo: '내추럴 베이지 · 가을 웜 뮤트',
    labelEn: 'Natural Beige · Autumn Warm Mute',
    shortKo: '가을 웜 베이지',
    shortEn: 'Autumn Beige',
    skinToneHex: '#DFBA9B',
    personalColor: 'autumn_warm',
    subTypeLabelKo: '가을 웜 뮤트',
    subTypeLabelEn: 'Autumn Warm Mute',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.autumn_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.autumn_warm.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.autumn_warm.adviceEn,
  },
  {
    key: 'winter_neutral',
    labelKo: '뉴트럴 샌드 · 겨울 쿨 브라이트',
    labelEn: 'Neutral Sand · Winter Cool Bright',
    shortKo: '겨울 쿨 뉴트럴',
    shortEn: 'Winter Neutral',
    skinToneHex: '#D8B6B4',
    personalColor: 'winter_cool',
    subTypeLabelKo: '겨울 쿨 브라이트',
    subTypeLabelEn: 'Winter Cool Bright',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.winter_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.winter_cool.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.winter_cool.adviceEn,
  },
  {
    key: 'honey_tan',
    labelKo: '허니 브론즈 · 가을 웜 딥',
    labelEn: 'Honey Bronze · Autumn Warm Deep',
    shortKo: '가을 웜 브론즈',
    shortEn: 'Honey Bronze',
    skinToneHex: '#C28E68',
    personalColor: 'autumn_warm',
    subTypeLabelKo: '가을 웜 딥',
    subTypeLabelEn: 'Autumn Warm Deep',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.autumn_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.autumn_warm.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.autumn_warm.adviceEn,
  },
  {
    key: 'deep_espresso',
    labelKo: '딥 에스프레소 · 겨울 쿨 딥',
    labelEn: 'Deep Espresso · Winter Cool Deep',
    shortKo: '겨울 쿨 딥',
    shortEn: 'Deep Espresso',
    skinToneHex: '#8E5C40',
    personalColor: 'winter_cool',
    subTypeLabelKo: '겨울 쿨 딥',
    subTypeLabelEn: 'Winter Cool Deep',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.winter_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.winter_cool.adviceKo,
    adviceEn: SEASON_BEST_SWATCHES.winter_cool.adviceEn,
  },
] as const;

const SUBTYPE_KO_TO_EN: Readonly<Record<string, string>> = {
  '봄 웜 라이트': 'Spring Warm Light',
  '봄 웜 브라이트': 'Spring Warm Bright',
  '여름 쿨 라이트': 'Summer Cool Light',
  '여름 쿨 뮤트': 'Summer Cool Mute',
  '가을 웜 뮤트': 'Autumn Warm Mute',
  '가을 웜 딥': 'Autumn Warm Deep',
  '겨울 쿨 브라이트': 'Winter Cool Bright',
  '겨울 쿨 딥': 'Winter Cool Deep',
};

export function getLocalizedSeasonLabel(
  personalColor?: string | null,
  lang: string = 'ko'
): string {
  const key = normalizeSeasonKey(personalColor);
  const meta = SEASON_BEST_SWATCHES[key];
  return lang === 'en' ? meta.labelEn : meta.labelKo;
}

export function getLocalizedSubTypeLabel(
  subTypeLabelKo?: string | null,
  personalColor?: string | null,
  lang: string = 'ko'
): string {
  const ko = (subTypeLabelKo || '').trim();
  if (lang !== 'en') {
    return ko || SEASON_BEST_SWATCHES[normalizeSeasonKey(personalColor)].labelKo;
  }
  if (ko && SUBTYPE_KO_TO_EN[ko]) {
    return SUBTYPE_KO_TO_EN[ko];
  }
  return SEASON_BEST_SWATCHES[normalizeSeasonKey(personalColor)].labelEn;
}

export function translateSubTypeLabel(
  subTypeLabelKo?: string | null,
  personalColor?: string | null
): string {
  return getLocalizedSubTypeLabel(subTypeLabelKo, personalColor, 'en');
}

const DEFAULT_MST_SWATCH = findClosestMstFromHex('#DFBA9B');

export const DEFAULT_SKIN_PROFILE: StoredSkinProfile = {
  skinToneHex: '#DFBA9B',
  personalColor: 'autumn_warm',
  personalColorLabelKo: '가을 웜톤',
  subTypeLabelKo: '가을 웜 뮤트',
  gender: 'male',
  presetKey: 'autumn_beige',
  mstLevel: DEFAULT_MST_SWATCH.level,
  mstUndertone: DEFAULT_MST_SWATCH.undertone,
  mstCode: DEFAULT_MST_SWATCH.code,
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeSeasonKey(raw?: string | null): PersonalColorSeasonKey {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s.startsWith('spring')) return 'spring_warm';
  if (s.startsWith('summer')) return 'summer_cool';
  if (s.startsWith('winter')) return 'winter_cool';
  return 'autumn_warm';
}

export function findClosestSkinPreset(
  skinToneHex: string,
  personalColor?: string | null
): SkinTonePreset {
  const targetRgb = hexToRgb(skinToneHex || '#DFBA9B');
  const targetLab = rgbToCieLab(targetRgb.r, targetRgb.g, targetRgb.b);
  const preferredSeason = personalColor ? normalizeSeasonKey(personalColor) : null;

  let best = SKIN_TONE_MANNEQUIN_PRESETS[4];
  let bestDist = Number.POSITIVE_INFINITY;

  for (const preset of SKIN_TONE_MANNEQUIN_PRESETS) {
    const pRgb = hexToRgb(preset.skinToneHex);
    const pLab = rgbToCieLab(pRgb.r, pRgb.g, pRgb.b);
    const dL = targetLab.L - pLab.L;
    const da = targetLab.a - pLab.a;
    const db = targetLab.b - pLab.b;
    let dist = Math.sqrt(dL * dL + da * da * 1.4 + db * db * 1.4);
    if (preferredSeason && preset.personalColor === preferredSeason) {
      dist -= 2.5;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = preset;
    }
  }
  return best;
}

export function getStoredSkinProfile(): StoredSkinProfile {
  if (typeof localStorage === 'undefined') return DEFAULT_SKIN_PROFILE;
  try {
    const raw = localStorage.getItem(SKIN_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_SKIN_PROFILE;
    const parsed = JSON.parse(raw) as Partial<StoredSkinProfile>;
    const pc = normalizeSeasonKey(parsed.personalColor);
    const hex =
      typeof parsed.skinToneHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.skinToneHex)
        ? parsed.skinToneHex.toUpperCase()
        : DEFAULT_SKIN_PROFILE.skinToneHex;
    const preset = findClosestSkinPreset(hex, pc);
    const autoMst = findClosestMstFromHex(hex);
    const mstLevel = isMstLevel(parsed.mstLevel) ? parsed.mstLevel : autoMst.level;
    const mstUndertone = parsed.mstUndertone
      ? normalizeMstUndertone(parsed.mstUndertone, autoMst.undertone)
      : autoMst.undertone;
    const mstSwatch = getMstSwatch(mstLevel, mstUndertone);

    const portraitDataUrl =
      typeof parsed.portraitDataUrl === 'string' &&
      (parsed.portraitDataUrl.startsWith('data:image/') ||
        parsed.portraitDataUrl.startsWith('blob:') ||
        parsed.portraitDataUrl.startsWith('http://') ||
        parsed.portraitDataUrl.startsWith('https://') ||
        parsed.portraitDataUrl.startsWith('/'))
        ? parsed.portraitDataUrl
        : null;

    return {
      skinToneHex: hex,
      personalColor: pc,
      personalColorLabelKo: parsed.personalColorLabelKo || SEASON_BEST_SWATCHES[pc].labelKo,
      subTypeLabelKo: parsed.subTypeLabelKo || preset.subTypeLabelKo,
      gender: parsed.gender === 'female' ? 'female' : 'male',
      presetKey: parsed.presetKey || preset.key,
      mstLevel,
      mstUndertone,
      mstCode: parsed.mstCode || mstSwatch.code,
      portraitDataUrl,
    };
  } catch {
    return DEFAULT_SKIN_PROFILE;
  }
}

export function saveStoredSkinProfile(profile: Partial<StoredSkinProfile>): StoredSkinProfile {
  const current = getStoredSkinProfile();
  const nextPc = profile.personalColor
    ? normalizeSeasonKey(profile.personalColor)
    : current.personalColor;
  const nextHex =
    profile.skinToneHex && /^#[0-9a-fA-F]{6}$/.test(profile.skinToneHex)
      ? profile.skinToneHex.toUpperCase()
      : current.skinToneHex;
  const matched = findClosestSkinPreset(nextHex, nextPc);

  const hexChanged = nextHex !== current.skinToneHex;
  const autoMst = findClosestMstFromHex(nextHex);
  const mstLevel = isMstLevel(profile.mstLevel)
    ? profile.mstLevel
    : hexChanged || !isMstLevel(current.mstLevel)
      ? autoMst.level
      : current.mstLevel;
  const mstUndertone = profile.mstUndertone
    ? normalizeMstUndertone(profile.mstUndertone, autoMst.undertone)
    : hexChanged || !current.mstUndertone
      ? autoMst.undertone
      : current.mstUndertone;
  const mstSwatch = getMstSwatch(mstLevel, mstUndertone);

  const nextPortraitDataUrl =
    'portraitDataUrl' in profile
      ? typeof profile.portraitDataUrl === 'string' && profile.portraitDataUrl.trim()
        ? profile.portraitDataUrl.trim()
        : null
      : current.portraitDataUrl ?? null;

  const merged: StoredSkinProfile = {
    skinToneHex: nextHex,
    personalColor: nextPc,
    personalColorLabelKo: profile.personalColorLabelKo || SEASON_BEST_SWATCHES[nextPc].labelKo,
    subTypeLabelKo: profile.subTypeLabelKo || matched.subTypeLabelKo,
    gender: profile.gender || current.gender || 'male',
    presetKey: profile.presetKey || matched.key,
    mstLevel,
    mstUndertone,
    mstCode: profile.mstCode || mstSwatch.code,
    portraitDataUrl: nextPortraitDataUrl,
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SKIN_PROFILE_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage quota errors
    }
  }
  return merged;
}

/**
 * Computes studio lighting & subsurface skin shading colors
 * from any `skinToneHex` + `personalColor` season using luminance-adaptive MST shading
 * (prevents shadow crushing on deep MST 8-10 skin and contour washout on fair MST 1-3 skin).
 */
export function computeSkinShadingPalette(
  skinToneHex = '#DFBA9B',
  personalColor: string = 'autumn_warm',
  theme: 'light' | 'dark' = 'light'
): SkinShadingPalette {
  const season = normalizeSeasonKey(personalColor);
  const isDarkTheme = theme === 'dark';
  const adaptive = computeAdaptiveMstShading({
    skinToneHex: skinToneHex || '#DFBA9B',
    personalColor: season,
    theme: isDarkTheme ? 'dark' : 'light',
  });

  const hairPalettes: Record<PersonalColorSeasonKey, { main: string; hi: string; brow: string }> = {
    spring_warm: { main: '#4A3323', hi: '#6D4D36', brow: '#4E3728' },
    summer_cool: { main: '#33313B', hi: '#524F5E', brow: '#3B3844' },
    autumn_warm: { main: '#38261B', hi: '#593E2D', brow: '#3D2A1E' },
    winter_cool: { main: '#1E1F26', hi: '#3A3D4A', brow: '#23242C' },
  };
  const hair = hairPalettes[season];

  const auraMap: Record<PersonalColorSeasonKey, string> = isDarkTheme
    ? {
        spring_warm: 'rgba(244, 198, 156, 0.17)',
        summer_cool: 'rgba(176, 198, 232, 0.17)',
        autumn_warm: 'rgba(212, 166, 122, 0.18)',
        winter_cool: 'rgba(190, 200, 235, 0.16)',
      }
    : {
        spring_warm: 'rgba(248, 212, 178, 0.44)',
        summer_cool: 'rgba(196, 214, 240, 0.44)',
        autumn_warm: 'rgba(226, 194, 160, 0.42)',
        winter_cool: 'rgba(206, 214, 236, 0.42)',
      };

  return {
    highlight: adaptive.highlight,
    base: adaptive.base,
    subsurface: adaptive.subsurface,
    midShadow: adaptive.midShadow,
    deepShadow: adaptive.deepShadow,
    rimLight: adaptive.rimLight,
    lipTint: adaptive.lipNatural,
    browHair: hair.brow,
    hairMain: hair.main,
    hairHighlight: hair.hi,
    auraColor: auraMap[season],
    basewearFill: isDarkTheme ? '#2C2E35' : '#E7E7EC',
    basewearShadow: isDarkTheme ? '#1F2026' : '#D4D5DC',
    specularHighlight: adaptive.specularHighlight,
    contourInk: adaptive.contourInk,
    lipShadow: adaptive.lipShadow,
    nailBed: adaptive.nailBed,
    palmSoleTint: adaptive.palmSoleTint,
    mstLevel: adaptive.mstLevel,
    mstUndertone: adaptive.mstUndertone,
  };
}

/**
 * Generates a clean 1-click synthetic portrait data URL for instant skin-tone pipeline testing
 * without requiring camera access or external network assets.
 */
export function createSyntheticSamplePortrait(
  seasonKey: PersonalColorSeasonKey = 'autumn_warm'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const skins: Record<
    PersonalColorSeasonKey,
    { bg: string; skin: string; cheek: string; hair: string; top: string }
  > = {
    spring_warm: {
      bg: '#F4EFE7',
      skin: '#F4D5BD',
      cheek: '#EEA992',
      hair: '#523826',
      top: '#F3E3BE',
    },
    summer_cool: {
      bg: '#EEF1F6',
      skin: '#EED3D4',
      cheek: '#DFB0BE',
      hair: '#363340',
      top: '#9ABBD9',
    },
    autumn_warm: {
      bg: '#EFE9E0',
      skin: '#DFBA9B',
      cheek: '#CB9676',
      hair: '#3A271B',
      top: '#BE8B58',
    },
    winter_cool: {
      bg: '#ECEEF3',
      skin: '#DEC2C3',
      cheek: '#C49AA4',
      hair: '#1D1E25',
      top: '#1D2E57',
    },
  };

  const s = skins[seasonKey] || skins.autumn_warm;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, 320, 320);

  // Drape shoulders
  ctx.fillStyle = s.top;
  ctx.beginPath();
  ctx.ellipse(160, 306, 118, 56, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair crown
  ctx.fillStyle = s.hair;
  ctx.beginPath();
  ctx.ellipse(160, 144, 88, 104, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = s.skin;
  ctx.fillRect(136, 224, 48, 50);

  // Face oval
  ctx.fillStyle = s.skin;
  ctx.beginPath();
  ctx.ellipse(160, 164, 72, 92, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subsurface cheek warmth
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = s.cheek;
  ctx.beginPath();
  ctx.arc(118, 178, 22, 0, Math.PI * 2);
  ctx.arc(202, 178, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load portrait image.'));
    img.src = src;
  });
}

/**
 * Physiological human skin likelihood score in [0, 1].
 * Supports fair MST 1 through deep MST 10 skin tones while rejecting green/mint/cyan/blue
 * garments, neutral gray/white walls, dark muted hair/eyebrows, and oversaturated clothing.
 */
function computeSkinLikelihood(r: number, g: number, b: number): number {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 18 || r < 30 || g < 16 || b < 10) return 0;
  if (r > 251 && g > 248 && b > 246) return 0;

  // Human skin hemoglobin/melanin always satisfies R > G and R >= B
  const rgDiff = r - g;
  const rbDiff = r - b;
  if (rgDiff < 4 || rbDiff < 3) return 0;

  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const span = maxC - minC;
  if (span < 10) return 0;

  // Reject oversaturated neon/dyed fabrics and near-achromatic grays
  const sat = span / Math.max(1, maxC);
  if (sat > 0.7 || sat < 0.04) return 0;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cb < 75 || cb > 131 || cr < 130 || cr > 176) return 0;

  // Reject cool/greenish casts where G exceeds physiological ratio to R & B
  if (g > r * 0.965) return 0;

  // For very dark pixels (lum < 50), keep genuine deep melanin (MST 9-10) and reject muted black/brown hair
  if (lum < 50 && (sat < 0.3 || rbDiff < 14 || cb > 129 || cr < 134)) {
    return 0;
  }

  const cbDist = Math.abs(cb - 108) / 28;
  const crDist = Math.abs(cr - 147) / 26;
  const chromaFit = clamp(1 - (cbDist * 0.48 + crDist * 0.52), 0.15, 1);
  return chromaFit;
}

interface LandmarkPointNorm {
  x: number;
  y: number;
}

type FaceDetectorEngineKind =
  | 'mediapipe_face_landmarker'
  | 'native_face_detector'
  | 'pure_ts_integral'
  | 'manual_focus'
  | 'fallback';

interface DetectedFaceBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  detected: boolean;
  engine: FaceDetectorEngineKind;
  landmarks?: LandmarkPointNorm[];
}

interface CropSourceRect {
  sx: number;
  sy: number;
  side: number;
  srcW: number;
  srcH: number;
}

interface DetectFaceOptions {
  skipNeuralDetector?: boolean;
  focusPoint?: { x: number; y: number };
  previousCropRect?: CropSourceRect;
}

interface MediaPipeLandmarkerLike {
  detect: (image: HTMLCanvasElement) => {
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
  };
  close?: () => void;
}

let mpLandmarkerPromise: Promise<MediaPipeLandmarkerLike | null> | null = null;

export async function disposeMediaPipeLandmarker(): Promise<void> {
  const activePromise = mpLandmarkerPromise;
  mpLandmarkerPromise = null;
  if (!activePromise) return;
  try {
    const instance = await activePromise;
    instance?.close?.();
  } catch {
    // Ignore WASM teardown errors
  }
}

async function getMediaPipeLandmarker(): Promise<MediaPipeLandmarkerLike | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!mpLandmarkerPromise) {
    mpLandmarkerPromise = (async () => {
      try {
        const initTask = (async () => {
          const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
          const wasmBase = withPublicBaseUrl('/mediapipe/wasm');
          const modelPath = withPublicBaseUrl('/mediapipe/face_landmarker.task');
          const vision = await FilesetResolver.forVisionTasks(wasmBase);
          return await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            numFaces: 5,
            minFaceDetectionConfidence: 0.24,
            minFacePresenceConfidence: 0.24,
          });
        })();
        const timeoutTask = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 9000);
        });
        const instance = await Promise.race([initTask, timeoutTask]);
        if (!instance) {
          mpLandmarkerPromise = null;
          return null;
        }
        return instance;
      } catch {
        mpLandmarkerPromise = null;
        return null;
      }
    })();
  }
  return mpLandmarkerPromise;
}

function buildDetectedFaceFromLandmarks(
  rawLms: ReadonlyArray<{ x: number; y: number }>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  srcW: number,
  srcH: number
): DetectedFaceBox | null {
  if (!Array.isArray(rawLms) || rawLms.length < 400) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  const mapped: LandmarkPointNorm[] = new Array(rawLms.length);

  for (let i = 0; i < rawLms.length; i++) {
    const pt = rawLms[i];
    const gx = clamp((sx + pt.x * sw) / srcW, 0, 1);
    const gy = clamp((sy + pt.y * sh) / srcH, 0, 1);
    mapped[i] = { x: gx, y: gy };
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gy < minY) minY = gy;
    if (gy > maxY) maxY = gy;
  }

  const rawW = (maxX - minX) * srcW;
  const rawH = (maxY - minY) * srcH;
  if (rawW < 10 || rawH < 10) return null;

  // Landmark 10 sits just below the upper hairline; add modest forehead headroom for full face framing
  const padTop = rawH * 0.11;
  const padBottom = rawH * 0.04;
  const padSide = rawW * 0.06;
  const x0 = clamp(minX * srcW - padSide, 0, srcW - 1);
  const y0 = clamp(minY * srcH - padTop, 0, srcH - 1);
  const x1 = clamp(maxX * srcW + padSide, x0 + 8, srcW);
  const y1 = clamp(maxY * srcH + padBottom, y0 + 8, srcH);

  const w = x1 - x0;
  const h = y1 - y0;
  return {
    cx: x0 + w * 0.5,
    cy: y0 + h * 0.5,
    w,
    h,
    detected: true,
    engine: 'mediapipe_face_landmarker',
    landmarks: mapped,
  };
}

function runMediaPipeOnRoi(
  landmarker: MediaPipeLandmarkerLike,
  img: HTMLImageElement,
  srcW: number,
  srcH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  maxDim: number
): DetectedFaceBox[] {
  const sx = clamp(Math.floor(rx), 0, Math.max(0, srcW - 1));
  const sy = clamp(Math.floor(ry), 0, Math.max(0, srcH - 1));
  const sw = clamp(Math.round(rw), 1, srcW - sx);
  const sh = clamp(Math.round(rh), 1, srcH - sy);
  if (sw < 24 || sh < 24) return [];

  const maxSide = Math.max(sw, sh);
  const scale =
    maxSide < 192 ? Math.min(2.5, 320 / maxSide) : Math.min(1, maxDim / maxSide);
  const cw = Math.max(48, Math.round(sw * scale));
  const ch = Math.max(48, Math.round(sh * scale));

  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = cw;
  roiCanvas.height = ch;
  const roiCtx = roiCanvas.getContext('2d');
  if (!roiCtx) {
    roiCanvas.width = 0;
    roiCanvas.height = 0;
    return [];
  }

  try {
    roiCtx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    const detection = landmarker.detect(roiCanvas);
    const faces = detection?.faceLandmarks;
    if (!Array.isArray(faces) || faces.length === 0) return [];
    const results: DetectedFaceBox[] = [];
    for (const lms of faces) {
      const built = buildDetectedFaceFromLandmarks(lms, sx, sy, sw, sh, srcW, srcH);
      if (built) results.push(built);
    }
    return results;
  } catch {
    return [];
  } finally {
    roiCanvas.width = 0;
    roiCanvas.height = 0;
  }
}

function selectBestMediaPipeFace(
  candidates: ReadonlyArray<DetectedFaceBox>,
  srcW: number,
  srcH: number,
  focusPoint?: { x: number; y: number }
): DetectedFaceBox | null {
  if (!candidates.length) return null;

  if (focusPoint) {
    const focusPx = clamp(focusPoint.x, 0.02, 0.98) * srcW;
    const focusPy = clamp(focusPoint.y, 0.02, 0.98) * srcH;
    let bestNear: DetectedFaceBox | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const face of candidates) {
      const dx = face.cx - focusPx;
      const dy = face.cy - focusPy;
      const dist = Math.hypot(dx, dy);
      const insideExpanded =
        Math.abs(dx) <= face.w * 0.72 && Math.abs(dy) <= face.h * 0.72;
      if (insideExpanded && dist < bestDist) {
        bestDist = dist;
        bestNear = face;
      }
    }
    if (bestNear) return bestNear;
  }

  let best = candidates[0];
  let bestRank = -1;
  for (const face of candidates) {
    const yNorm = face.cy / Math.max(1, srcH);
    const xNorm = face.cx / Math.max(1, srcW);
    const area = face.w * face.h;
    const rank =
      area * (1.28 - 0.32 * yNorm) * (1.14 - 0.22 * Math.abs(xNorm - 0.5));
    if (rank > bestRank) {
      bestRank = rank;
      best = face;
    }
  }
  return best;
}

function buildIntegralTable(values: Float32Array, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const srcRow = (y - 1) * w;
    const curRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let x = 1; x <= w; x++) {
      rowSum += values[srcRow + (x - 1)];
      sat[curRow + x] = sat[prevRow + x] + rowSum;
    }
  }
  return sat;
}

function queryIntegralMean(
  sat: Float64Array,
  w: number,
  h: number,
  x0f: number,
  y0f: number,
  x1f: number,
  y1f: number
): number {
  const x0 = clamp(Math.round(x0f), 0, w - 1);
  const y0 = clamp(Math.round(y0f), 0, h - 1);
  const x1 = clamp(Math.round(x1f), x0 + 1, w);
  const y1 = clamp(Math.round(y1f), y0 + 1, h);
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  const stride = w + 1;
  const sum =
    sat[y1 * stride + x1] -
    sat[y0 * stride + x1] -
    sat[y1 * stride + x0] +
    sat[y0 * stride + x0];
  return sum / area;
}

function detectFacePureTSFromImage(
  img: HTMLImageElement,
  gains: { r: number; g: number; b: number }
): DetectedFaceBox {
  const srcW = img.naturalWidth || img.width || 320;
  const srcH = img.naturalHeight || img.height || 320;
  const maxDim = 320;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const detW = Math.max(64, Math.round(srcW * scale));
  const detH = Math.max(64, Math.round(srcH * scale));

  const detCanvas = document.createElement('canvas');
  detCanvas.width = detW;
  detCanvas.height = detH;
  const detCtx = detCanvas.getContext('2d', { willReadFrequently: true });
  if (!detCtx) {
    return {
      cx: srcW * 0.5,
      cy: srcH * 0.34,
      w: srcW * 0.36,
      h: srcH * 0.36,
      detected: false,
      engine: 'fallback',
    };
  }
  detCtx.drawImage(img, 0, 0, detW, detH);
  const imgData = detCtx.getImageData(0, 0, detW, detH).data;
  detCanvas.width = 0;
  detCanvas.height = 0;

  const nPixels = detW * detH;
  const skinBuf = new Float32Array(nPixels);
  const darkBuf = new Float32Array(nPixels);
  const lumBuf = new Float32Array(nPixels);

  for (let i = 0; i < nPixels; i++) {
    const p = i * 4;
    const r = clampByte(imgData[p] * gains.r);
    const g = clampByte(imgData[p + 1] * gains.g);
    const b = clampByte(imgData[p + 2] * gains.b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const skinScore = computeSkinLikelihood(r, g, b);
    skinBuf[i] = skinScore;
    // Do not misclassify genuine deep MST 9-10 skin as dark hair
    darkBuf[i] = lum < 0.28 && skinScore < 0.25 ? 1 : 0;
    lumBuf[i] = lum;
  }

  const skinSAT = buildIntegralTable(skinBuf, detW, detH);
  const darkSAT = buildIntegralTable(darkBuf, detW, detH);
  const lumSAT = buildIntegralTable(lumBuf, detW, detH);

  const minSide = Math.min(detW, detH);
  const widthFractions = [0.12, 0.16, 0.21, 0.27, 0.34, 0.43, 0.54, 0.65];

  let bestScore = -1;
  let bestBox: { x: number; y: number; w: number; h: number } | null = null;

  for (const frac of widthFractions) {
    const fw = Math.max(18, Math.round(minSide * frac));
    const fh = Math.max(22, Math.round(fw * 1.24));
    if (fw >= detW * 0.94 || fh >= detH * 0.94) continue;

    const stepX = Math.max(3, Math.round(fw * 0.14));
    const stepY = Math.max(3, Math.round(fh * 0.14));
    const maxY = Math.max(1, Math.min(detH - fh, Math.round(detH * 0.78 - fh * 0.5)));

    for (let fy = Math.round(detH * 0.02); fy <= maxY; fy += stepY) {
      for (
        let fx = Math.round(detW * 0.04);
        fx <= detW - fw - Math.round(detW * 0.04);
        fx += stepX
      ) {
        const coreSkin = queryIntegralMean(
          skinSAT,
          detW,
          detH,
          fx + fw * 0.15,
          fy + fh * 0.12,
          fx + fw * 0.85,
          fy + fh * 0.88
        );
        if (coreSkin < 0.32) continue;

        const leftCheek = queryIntegralMean(
          skinSAT,
          detW,
          detH,
          fx + fw * 0.14,
          fy + fh * 0.44,
          fx + fw * 0.46,
          fy + fh * 0.76
        );
        const rightCheek = queryIntegralMean(
          skinSAT,
          detW,
          detH,
          fx + fw * 0.54,
          fy + fh * 0.44,
          fx + fw * 0.86,
          fy + fh * 0.76
        );
        if (Math.max(leftCheek, rightCheek) < 0.32 || (leftCheek + rightCheek) * 0.5 < 0.24) {
          continue;
        }

        const forehead = queryIntegralMean(
          skinSAT,
          detW,
          detH,
          fx + fw * 0.24,
          fy + fh * 0.1,
          fx + fw * 0.76,
          fy + fh * 0.36
        );
        const chin = queryIntegralMean(
          skinSAT,
          detW,
          detH,
          fx + fw * 0.28,
          fy + fh * 0.72,
          fx + fw * 0.72,
          fy + fh * 0.94
        );
        if (forehead < 0.18 && chin < 0.24) continue;

        const symmetry = 1 - Math.abs(leftCheek - rightCheek);

        // Head boundary contrast against surrounding hair / background
        const leftOuter =
          fx > fw * 0.18
            ? queryIntegralMean(
                skinSAT,
                detW,
                detH,
                fx - fw * 0.3,
                fy + fh * 0.12,
                fx - fw * 0.03,
                fy + fh * 0.84
              )
            : 0;
        const rightOuter =
          fx + fw < detW - fw * 0.18
            ? queryIntegralMean(
                skinSAT,
                detW,
                detH,
                fx + fw * 1.03,
                fy + fh * 0.12,
                fx + fw * 1.3,
                fy + fh * 0.84
              )
            : 0;
        const topOuter =
          fy > fh * 0.14
            ? queryIntegralMean(
                skinSAT,
                detW,
                detH,
                fx + fw * 0.14,
                fy - fh * 0.26,
                fx + fw * 0.86,
                fy - fh * 0.02
              )
            : 0;

        // Check lateral bands immediately below the box (around the narrower neck column):
        // A real chin sits above background/collar; a forehead-only box sits right above wide eyes/cheeks!
        const botLeft =
          fy + fh < detH - fh * 0.14
            ? queryIntegralMean(
                skinSAT,
                detW,
                detH,
                fx + fw * 0.04,
                fy + fh * 1.02,
                fx + fw * 0.32,
                fy + fh * 1.24
              )
            : 0;
        const botRight =
          fy + fh < detH - fh * 0.14
            ? queryIntegralMean(
                skinSAT,
                detW,
                detH,
                fx + fw * 0.68,
                fy + fh * 1.02,
                fx + fw * 0.96,
                fy + fh * 1.24
              )
            : 0;
        const bottomLateralSkin = (botLeft + botRight) * 0.5;

        const outerSkin = (leftOuter + rightOuter + topOuter + bottomLateralSkin) / 4;
        const boundaryContrast = Math.max(0, coreSkin - outerSkin);
        const continuationPenalty = topOuter * 0.72 + bottomLateralSkin * 1.05;

        // Cap coreSkin benefit above 0.66 so small featureless forehead squares do not outscore whole faces
        const effectiveCore = Math.min(0.66, coreSkin) + Math.max(0, coreSkin - 0.66) * 0.12;

        // Hair crown + relative eye/cheek luminance signature
        const hairCrown = queryIntegralMean(
          darkSAT,
          detW,
          detH,
          fx - fw * 0.12,
          fy - fh * 0.26,
          fx + fw * 1.12,
          fy + fh * 0.2
        );
        const eyeDark = queryIntegralMean(
          darkSAT,
          detW,
          detH,
          fx + fw * 0.18,
          fy + fh * 0.28,
          fx + fw * 0.82,
          fy + fh * 0.48
        );
        const eyeLum = queryIntegralMean(
          lumSAT,
          detW,
          detH,
          fx + fw * 0.18,
          fy + fh * 0.3,
          fx + fw * 0.82,
          fy + fh * 0.46
        );
        const cheekLum = queryIntegralMean(
          lumSAT,
          detW,
          detH,
          fx + fw * 0.18,
          fy + fh * 0.5,
          fx + fw * 0.82,
          fy + fh * 0.72
        );
        const coreLum = queryIntegralMean(
          lumSAT,
          detW,
          detH,
          fx + fw * 0.2,
          fy + fh * 0.25,
          fx + fw * 0.8,
          fy + fh * 0.78
        );
        const outerTopLum =
          fy > fh * 0.12
            ? queryIntegralMean(
                lumSAT,
                detW,
                detH,
                fx + fw * 0.1,
                fy - fh * 0.26,
                fx + fw * 0.9,
                fy - fh * 0.02
              )
            : coreLum;
        const lumCrownContrast = clamp((coreLum - outerTopLum) * 1.35, 0, 0.24);
        const relEyeContrast = clamp(
          (cheekLum - eyeLum) / Math.max(0.18, cheekLum),
          0,
          0.38
        );
        const featureBonus =
          Math.min(0.24, hairCrown * 0.45) +
          lumCrownContrast +
          relEyeContrast +
          Math.min(0.16, eyeDark * 0.4);

        const yNorm = (fy + fh * 0.5) / detH;
        const upperBonus =
          yNorm <= 0.54
            ? 0.24 * (1 - Math.abs(yNorm - 0.31) / 0.46)
            : -0.42 * (yNorm - 0.54);
        const xNorm = (fx + fw * 0.5) / detW;
        const centerBonus = 0.08 * (1 - Math.min(1, Math.abs(xNorm - 0.5) * 2.1));
        const scaleBonus = frac >= 0.21 && frac <= 0.56 ? 0.08 : frac >= 0.16 ? 0.03 : 0;

        const score =
          effectiveCore * 1.12 +
          boundaryContrast * 0.95 -
          continuationPenalty +
          symmetry * 0.26 +
          featureBonus +
          upperBonus +
          centerBonus +
          scaleBonus;

        if (score > bestScore) {
          bestScore = score;
          bestBox = { x: fx, y: fy, w: fw, h: fh };
        }
      }
    }
  }

  if (bestBox && bestScore >= 0.88) {
    return {
      cx: (bestBox.x + bestBox.w * 0.5) / scale,
      cy: (bestBox.y + bestBox.h * 0.5) / scale,
      w: bestBox.w / scale,
      h: bestBox.h / scale,
      detected: true,
      engine: 'pure_ts_integral',
    };
  }

  const fallbackSide = Math.min(srcW, srcH) * 0.38;
  return {
    cx: srcW * 0.5,
    cy: srcH * 0.32,
    w: fallbackSide,
    h: fallbackSide * 1.2,
    detected: false,
    engine: 'fallback',
  };
}

/**
 * Detects the human face & 478 landmarks on the FULL uncropped portrait before cropping.
 * - Real photos use lazy-loaded local MediaPipe FaceLandmarker with progressive ROI stages
 *   (handles close-up selfies, tilted portraits, bangs, and full-body shots).
 * - Falls back seamlessly to native FaceDetector or the pure-TS multi-scale integral-image
 *   detector when skipped (synthetic presets), offline, or on extreme 90° profiles.
 */
async function detectFaceOnFullPortrait(
  img: HTMLImageElement,
  gains: { r: number; g: number; b: number },
  options: DetectFaceOptions = {}
): Promise<DetectedFaceBox> {
  const srcW = img.naturalWidth || img.width || 320;
  const srcH = img.naturalHeight || img.height || 320;
  const minSrcSide = Math.min(srcW, srcH);

  let mpLandmarker: MediaPipeLandmarkerLike | null = null;
  if (!options.skipNeuralDetector) {
    mpLandmarker = await getMediaPipeLandmarker();
    if (mpLandmarker) {
      // Stage 1: Full-frame landmark detection
      const stage1Faces = runMediaPipeOnRoi(mpLandmarker, img, srcW, srcH, 0, 0, srcW, srcH, 640);
      if (options.focusPoint) {
        const focusedStage1 = selectBestMediaPipeFace(
          stage1Faces,
          srcW,
          srcH,
          options.focusPoint
        );
        if (focusedStage1) {
          const dist = Math.hypot(
            focusedStage1.cx - options.focusPoint.x * srcW,
            focusedStage1.cy - options.focusPoint.y * srcH
          );
          if (dist <= Math.max(focusedStage1.w, focusedStage1.h) * 0.72) {
            return focusedStage1;
          }
        }
        // Stage 2 (Focus Zoom): crop generously around the user's tap point
        const prevSide = options.previousCropRect?.side;
        const roiSide = clamp(
          Math.round(prevSide ? Math.max(prevSide * 1.9, minSrcSide * 0.38) : minSrcSide * 0.56),
          Math.round(minSrcSide * 0.3),
          minSrcSide
        );
        const rx = clamp(
          options.focusPoint.x * srcW - roiSide * 0.5,
          0,
          Math.max(0, srcW - roiSide)
        );
        const ry = clamp(
          options.focusPoint.y * srcH - roiSide * 0.5,
          0,
          Math.max(0, srcH - roiSide)
        );
        const focusFaces = runMediaPipeOnRoi(
          mpLandmarker,
          img,
          srcW,
          srcH,
          rx,
          ry,
          roiSide,
          roiSide,
          512
        );
        const focused = selectBestMediaPipeFace(focusFaces, srcW, srcH, options.focusPoint);
        if (focused) return focused;
      } else {
        const bestStage1 = selectBestMediaPipeFace(stage1Faces, srcW, srcH);
        if (bestStage1) return bestStage1;

        // Stage 2 (Progressive Zoom for full-body / distant subjects)
        const stage2Rois: Array<{
          sx: number;
          sy: number;
          sw: number;
          sh: number;
          maxDim: number;
        }> = [
          { sx: srcW * 0.12, sy: 0, sw: srcW * 0.76, sh: srcH * 0.52, maxDim: 512 },
          { sx: 0, sy: 0, sw: srcW, sh: srcH * 0.56, maxDim: 560 },
          { sx: srcW * 0.22, sy: 0, sw: srcW * 0.56, sh: srcH * 0.38, maxDim: 480 },
          { sx: srcW * 0.1, sy: srcH * 0.22, sw: srcW * 0.8, sh: srcH * 0.56, maxDim: 512 },
          ...(srcW >= srcH * 0.85
            ? [
                { sx: 0, sy: 0, sw: srcW * 0.52, sh: srcH * 0.56, maxDim: 512 },
                { sx: srcW * 0.48, sy: 0, sw: srcW * 0.52, sh: srcH * 0.56, maxDim: 512 },
              ]
            : []),
        ];
        for (const roi of stage2Rois) {
          const faces = runMediaPipeOnRoi(
            mpLandmarker,
            img,
            srcW,
            srcH,
            roi.sx,
            roi.sy,
            roi.sw,
            roi.sh,
            roi.maxDim
          );
          const picked = selectBestMediaPipeFace(faces, srcW, srcH);
          if (picked) return picked;
        }
      }
    }
  }

  // Stage 3: Pure-TS multi-scale integral-image face detector
  const pureTsCandidate = detectFacePureTSFromImage(img, gains);

  // If MediaPipe is available and Pure-TS spotted a candidate region missed in Stages 1-2, verify with Stage 3 zoom
  if (mpLandmarker && !options.skipNeuralDetector && pureTsCandidate.detected) {
    const zoomSide = clamp(
      Math.round(Math.max(pureTsCandidate.w, pureTsCandidate.h) * 2.4),
      Math.round(minSrcSide * 0.28),
      minSrcSide
    );
    const zx = clamp(pureTsCandidate.cx - zoomSide * 0.5, 0, Math.max(0, srcW - zoomSide));
    const zy = clamp(pureTsCandidate.cy - zoomSide * 0.5, 0, Math.max(0, srcH - zoomSide));
    const zoomFaces = runMediaPipeOnRoi(
      mpLandmarker,
      img,
      srcW,
      srcH,
      zx,
      zy,
      zoomSide,
      zoomSide,
      480
    );
    const picked = selectBestMediaPipeFace(zoomFaces, srcW, srcH, options.focusPoint);
    if (picked) return picked;
  }

  // Stage 4: Native platform FaceDetector API when available & earlier stages missed
  if (!options.skipNeuralDetector && typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const scale = Math.min(1, 480 / Math.max(srcW, srcH));
      const detW = Math.max(64, Math.round(srcW * scale));
      const detH = Math.max(64, Math.round(srcH * scale));
      const detCanvas = document.createElement('canvas');
      detCanvas.width = detW;
      detCanvas.height = detH;
      const detCtx = detCanvas.getContext('2d');
      if (detCtx) {
        detCtx.drawImage(img, 0, 0, detW, detH);
        const FaceDetectorCtor = (
          window as unknown as {
            FaceDetector: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
              detect: (
                source: HTMLCanvasElement
              ) => Promise<
                Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>
              >;
            };
          }
        ).FaceDetector;
        const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await detector.detect(detCanvas);
        detCanvas.width = 0;
        detCanvas.height = 0;
        if (Array.isArray(faces) && faces.length > 0) {
          let bestFace = faces[0].boundingBox;
          let bestRank = -1;
          for (const item of faces) {
            const b = item.boundingBox;
            const yNorm = (b.y + b.height * 0.5) / detH;
            const rank = b.width * b.height * (1.25 - 0.35 * yNorm);
            if (rank > bestRank) {
              bestRank = rank;
              bestFace = b;
            }
          }
          if (bestFace.width >= 12 && bestFace.height >= 12) {
            return {
              cx: (bestFace.x + bestFace.width * 0.5) / scale,
              cy: (bestFace.y + bestFace.height * 0.5) / scale,
              w: bestFace.width / scale,
              h: bestFace.height / scale,
              detected: true,
              engine: 'native_face_detector',
            };
          }
        }
      }
      detCanvas.width = 0;
      detCanvas.height = 0;
    } catch {
      // Ignore native FaceDetector unavailability errors
    }
  }

  return pureTsCandidate;
}

/**
 * Estimates gentle D65 ambient white-balance gains strictly from neutral/achromatic
 * background pixels on the full image so skin warmth is NEVER greyed out.
 */
function estimateNeutralWhiteBalanceGains(img: HTMLImageElement): {
  r: number;
  g: number;
  b: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { r: 1, g: 1, b: 1 };

  ctx.drawImage(img, 0, 0, 96, 96);
  const data = ctx.getImageData(0, 0, 96, 96).data;
  canvas.width = 0;
  canvas.height = 0;

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let cnt = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const span = maxC - minC;
    const lum = (r + g + b) / 3;
    // Only consider near-neutral studio wall / ceiling / shirt highlights, excluding skin & saturated colors
    if (lum >= 65 && lum <= 242 && span <= 26 && computeSkinLikelihood(r, g, b) < 0.1) {
      sr += r;
      sg += g;
      sb += b;
      cnt += 1;
    }
  }

  if (cnt < 36) {
    return { r: 1, g: 1, b: 1 };
  }

  const avgR = sr / cnt;
  const avgG = sg / cnt;
  const avgB = sb / cnt;
  const lum = (avgR + avgG + avgB) / 3;

  return {
    r: clamp(0.72 + 0.28 * (lum / Math.max(1, avgR)), 0.94, 1.06),
    g: clamp(0.76 + 0.24 * (lum / Math.max(1, avgG)), 0.96, 1.04),
    b: clamp(0.72 + 0.28 * (lum / Math.max(1, avgB)), 0.94, 1.06),
  };
}

interface SampledSkinPatch {
  px: number;
  py: number;
  r: number;
  g: number;
  b: number;
  lum: number;
  meanSkinLikelihood: number;
  validCount: number;
}

function sampleBestAnatomicalPatch(
  rawData: Uint8ClampedArray,
  W: number,
  H: number,
  targetX: number,
  targetY: number,
  searchRx: number,
  searchRy: number,
  gains: { r: number; g: number; b: number },
  excludeLipSpikes: boolean,
  minSkinLum: number = 0
): SampledSkinPatch {
  const radius = 8;
  let bestCx = clamp(Math.round(targetX * W), radius + 2, W - radius - 3);
  let bestCy = clamp(Math.round(targetY * H), radius + 2, H - radius - 3);
  let bestScore = -1;

  const stepX = Math.max(3, Math.round((searchRx * W) / 2));
  const stepY = Math.max(3, Math.round((searchRy * H) / 2));
  const minCx = clamp(Math.round((targetX - searchRx) * W), radius + 2, W - radius - 3);
  const maxCx = clamp(Math.round((targetX + searchRx) * W), radius + 2, W - radius - 3);
  const minCy = clamp(Math.round((targetY - searchRy) * H), radius + 2, H - radius - 3);
  const maxCy = clamp(Math.round((targetY + searchRy) * H), radius + 2, H - radius - 3);

  for (let cy = minCy; cy <= maxCy; cy += stepY) {
    for (let cx = minCx; cx <= maxCx; cx += stepX) {
      let skinSum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 2) {
        for (let dx = -radius; dx <= radius; dx += 2) {
          const idx = ((cy + dy) * W + (cx + dx)) * 4;
          const r = clampByte(rawData[idx] * gains.r);
          const g = clampByte(rawData[idx + 1] * gains.g);
          const b = clampByte(rawData[idx + 2] * gains.b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (minSkinLum > 0 && lum < minSkinLum) {
            count += 1;
            continue;
          }
          if (excludeLipSpikes && r - g > 46 && r - b > 44) {
            count += 1;
            continue;
          }
          skinSum += computeSkinLikelihood(r, g, b);
          count += 1;
        }
      }
      const distPenalty =
        0.08 *
        (Math.abs(cx / W - targetX) / Math.max(0.02, searchRx) +
          Math.abs(cy / H - targetY) / Math.max(0.02, searchRy));
      const score = skinSum / Math.max(1, count) - distPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestCx = cx;
        bestCy = cy;
      }
    }
  }

  const pixels: Array<{ r: number; g: number; b: number; lum: number; lik: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const idx = ((bestCy + dy) * W + (bestCx + dx)) * 4;
      const r = clampByte(rawData[idx] * gains.r);
      const g = clampByte(rawData[idx + 1] * gains.g);
      const b = clampByte(rawData[idx + 2] * gains.b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (minSkinLum > 0 && lum < minSkinLum) continue;
      if (excludeLipSpikes && r - g > 46 && r - b > 44) continue;
      const lik = computeSkinLikelihood(r, g, b);
      if (lik >= 0.28) {
        pixels.push({ r, g, b, lum, lik });
      }
    }
  }

  if (pixels.length === 0) {
    return {
      px: bestCx,
      py: bestCy,
      r: 223,
      g: 186,
      b: 155,
      lum: 193,
      meanSkinLikelihood: 0,
      validCount: 0,
    };
  }

  // Sort by luminance and trim darkest 25% (shadows/hair/pores) & brightest 15% (specular shine)
  pixels.sort((p1, p2) => p1.lum - p2.lum);
  const startIdx = Math.floor(pixels.length * 0.25);
  const endIdx = Math.max(startIdx + 1, Math.ceil(pixels.length * 0.85));
  const trimmed = pixels.slice(startIdx, endIdx);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let likSum = 0;
  for (const px of trimmed) {
    rSum += px.r;
    gSum += px.g;
    bSum += px.b;
    likSum += px.lik;
  }

  const outR = Math.round(rSum / trimmed.length);
  const outG = Math.round(gSum / trimmed.length);
  const outB = Math.round(bSum / trimmed.length);
  return {
    px: bestCx,
    py: bestCy,
    r: outR,
    g: outG,
    b: outB,
    lum: 0.299 * outR + 0.587 * outG + 0.114 * outB,
    meanSkinLikelihood: likSum / trimmed.length,
    validCount: pixels.length,
  };
}

interface PatchCandidateSpec {
  x: number;
  y: number;
  rx: number;
  ry: number;
  priorityBonus: number;
}

function sampleBestCandidateList(
  rawData: Uint8ClampedArray,
  W: number,
  H: number,
  candidates: ReadonlyArray<PatchCandidateSpec>,
  gains: { r: number; g: number; b: number },
  excludeLipSpikes: boolean,
  minSkinLum: number,
  refLum: number
): SampledSkinPatch {
  let bestPatch = sampleBestAnatomicalPatch(
    rawData,
    W,
    H,
    candidates[0].x,
    candidates[0].y,
    candidates[0].rx,
    candidates[0].ry,
    gains,
    excludeLipSpikes,
    minSkinLum
  );
  let bestScore = -999;

  for (const c of candidates) {
    const patch = sampleBestAnatomicalPatch(
      rawData,
      W,
      H,
      c.x,
      c.y,
      c.rx,
      c.ry,
      gains,
      excludeLipSpikes,
      minSkinLum
    );
    const coverage = clamp(patch.validCount / 140, 0, 1);
    const lumMatch =
      refLum > 0
        ? 1 - clamp(Math.abs(patch.lum - refLum) / Math.max(45, refLum * 0.75), 0, 0.85)
        : 0.5;
    const score =
      (patch.validCount >= 10 ? 1.0 : coverage * 0.45) +
      patch.meanSkinLikelihood * 0.6 +
      coverage * 0.45 +
      lumMatch * 0.35 +
      c.priorityBonus;

    if (score > bestScore) {
      bestScore = score;
      bestPatch = patch;
    }
  }

  return bestPatch;
}

function mapLandmarksToPreviewCentroid(
  landmarks: ReadonlyArray<LandmarkPointNorm>,
  indices: ReadonlyArray<number>,
  sx: number,
  sy: number,
  cropSide: number,
  srcW: number,
  srcH: number
): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (!pt) continue;
    sumX += (pt.x * srcW - sx) / cropSide;
    sumY += (pt.y * srcH - sy) / cropSide;
    count += 1;
  }
  if (count === 0) return { x: 0.5, y: 0.5 };
  return {
    x: clamp(sumX / count, 0.06, 0.94),
    y: clamp(sumY / count, 0.06, 0.94),
  };
}

/**
 * Portrait Face-Detecting Skin-Tone & Personal-Color Analyzer
 * - Uses lazy-loaded local MediaPipe FaceLandmarker (CPU WASM) for real uploaded portraits
 *   and pure-TS integral-image detection for synthetic presets and extreme profile fallbacks
 * - Crops squarely around the full detected face and snaps 4 anatomical pins to pure skin
 * - Extracts trimmed-median CIE L*a*b*, ITA° angle, skinToneHex, and 4-season Personal Color
 */
export async function analyzePortraitSkinTone(
  imageSource: string,
  options: {
    lightingMode?: LightingCalibrationKey;
    focusPoint?: { x: number; y: number };
    previousCropRect?: CropSourceRect;
    skipNeuralDetector?: boolean;
  } = {}
): Promise<SkinToneAnalysisResult> {
  const lightingMode = options.lightingMode || 'auto_d65';
  const modeSpec =
    LIGHTING_CALIBRATION_MODES.find((m) => m.key === lightingMode) ||
    LIGHTING_CALIBRATION_MODES[0];

  const img = await loadImageElement(imageSource);
  const srcW = img.naturalWidth || img.width || 320;
  const srcH = img.naturalHeight || img.height || 320;
  const minSrcSide = Math.min(srcW, srcH);

  // 1. Compute calibrated white-balance gains BEFORE face detection
  const gains = modeSpec.gains.autoGreyWorld
    ? estimateNeutralWhiteBalanceGains(img)
    : { r: modeSpec.gains.r, g: modeSpec.gains.g, b: modeSpec.gains.b };

  // 2. Detect face on full uncropped portrait (passing optional user focusPoint)
  let detectedFace = await detectFaceOnFullPortrait(img, gains, {
    skipNeuralDetector: options.skipNeuralDetector,
    focusPoint: options.focusPoint,
    previousCropRect: options.previousCropRect,
  });

  if (options.focusPoint) {
    const focusPx = clamp(options.focusPoint.x, 0.04, 0.96) * srcW;
    const focusPy = clamp(options.focusPoint.y, 0.04, 0.96) * srcH;

    if (detectedFace.detected && detectedFace.landmarks) {
      const dist = Math.hypot(focusPx - detectedFace.cx, focusPy - detectedFace.cy);
      if (dist <= Math.max(detectedFace.w, detectedFace.h) * 0.72) {
        // User tapped inside the detected face: preserve 478 landmarks and face box size cleanly
        detectedFace = {
          ...detectedFace,
          cx: detectedFace.cx * 0.72 + focusPx * 0.28,
          cy: detectedFace.cy * 0.72 + focusPy * 0.28,
        };
      } else {
        const manualW = options.previousCropRect
          ? clamp(options.previousCropRect.side * 0.56, minSrcSide * 0.24, minSrcSide * 0.72)
          : minSrcSide * 0.36;
        detectedFace = {
          cx: focusPx,
          cy: focusPy,
          w: manualW,
          h: manualW * 1.24,
          detected: true,
          engine: 'manual_focus',
        };
      }
    } else {
      const manualW = detectedFace.detected
        ? detectedFace.w
        : options.previousCropRect
          ? clamp(options.previousCropRect.side * 0.56, minSrcSide * 0.24, minSrcSide * 0.72)
          : minSrcSide * 0.36;
      const manualH = detectedFace.detected ? detectedFace.h : manualW * 1.24;
      detectedFace = {
        cx: focusPx,
        cy: focusPy,
        w: manualW,
        h: manualH,
        detected: true,
        engine: 'manual_focus',
      };
    }
  }

  // 3. Crop square 320x320 studio frame centered on the detected face
  const W = 320;
  const H = 320;
  const desiredCropSide = Math.round(Math.max(detectedFace.w, detectedFace.h) * 1.82);
  const cropSide = clamp(desiredCropSide, Math.round(minSrcSide * 0.22), minSrcSide);
  const sx = clamp(Math.round(detectedFace.cx - cropSide * 0.5), 0, Math.max(0, srcW - cropSide));
  const sy = clamp(Math.round(detectedFace.cy - cropSide * 0.5), 0, Math.max(0, srcH - cropSide));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to initialize 2D canvas context.');
  }

  ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, W, H);
  const rawData = ctx.getImageData(0, 0, W, H).data;
  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  canvas.width = 0;
  canvas.height = 0;

  // Map detected face box into normalized [0..1] preview coordinates
  const faceCxNorm = clamp((detectedFace.cx - sx) / cropSide, 0.22, 0.78);
  const faceCyNorm = clamp((detectedFace.cy - sy) / cropSide, 0.22, 0.78);
  const faceWNorm = clamp(detectedFace.w / cropSide, 0.26, 0.8);
  const faceHNorm = clamp(detectedFace.h / cropSide, 0.3, 0.86);

  const faceBoxPreview = {
    x: Number(clamp(faceCxNorm - faceWNorm * 0.5, 0.05, 0.88).toFixed(3)),
    y: Number(clamp(faceCyNorm - faceHNorm * 0.5, 0.04, 0.88).toFixed(3)),
    w: Number(clamp(faceWNorm, 0.22, 0.9).toFixed(3)),
    h: Number(clamp(faceHNorm, 0.26, 0.92).toFixed(3)),
  };

  // 4. Sample Left & Right Cheeks first to establish verified skin reference & luminance guard
  const lms = detectedFace.landmarks;
  let leftWeight = 0.32;
  let rightWeight = 0.32;
  let leftCheekSample: SampledSkinPatch;
  let rightCheekSample: SampledSkinPatch;

  if (lms && lms.length >= 468) {
    const nose = lms[1] || lms[4];
    const leftEdge = lms[234];
    const rightEdge = lms[454];
    const leftSpan = Math.max(0.002, nose.x - leftEdge.x);
    const rightSpan = Math.max(0.002, rightEdge.x - nose.x);
    const totalSpan = Math.max(0.01, leftSpan + rightSpan);
    const leftRatio = clamp(leftSpan / totalSpan, 0.1, 0.9);
    const rightRatio = clamp(rightSpan / totalSpan, 0.1, 0.9);

    const lcPrimary = mapLandmarksToPreviewCentroid(
      lms,
      [50, 101, 118, 205],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const lcLower = mapLandmarksToPreviewCentroid(
      lms,
      [187, 205, 207, 147],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const lcRx = clamp(faceWNorm * 0.075 * clamp(leftRatio * 2, 0.32, 1.15), 0.018, 0.085);
    const lcRy = clamp(faceHNorm * 0.07, 0.024, 0.08);
    leftCheekSample = sampleBestCandidateList(
      rawData,
      W,
      H,
      [
        { x: lcPrimary.x, y: lcPrimary.y, rx: lcRx, ry: lcRy, priorityBonus: 0.12 },
        { x: lcLower.x, y: lcLower.y, rx: lcRx, ry: lcRy, priorityBonus: 0.04 },
      ],
      gains,
      false,
      0,
      0
    );

    const rcPrimary = mapLandmarksToPreviewCentroid(
      lms,
      [280, 330, 347, 425],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const rcLower = mapLandmarksToPreviewCentroid(
      lms,
      [411, 425, 427, 376],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const rcRx = clamp(faceWNorm * 0.075 * clamp(rightRatio * 2, 0.32, 1.15), 0.018, 0.085);
    const rcRy = clamp(faceHNorm * 0.07, 0.024, 0.08);
    rightCheekSample = sampleBestCandidateList(
      rawData,
      W,
      H,
      [
        { x: rcPrimary.x, y: rcPrimary.y, rx: rcRx, ry: rcRy, priorityBonus: 0.12 },
        { x: rcLower.x, y: rcLower.y, rx: rcRx, ry: rcRy, priorityBonus: 0.04 },
      ],
      gains,
      false,
      0,
      0
    );

    // Emphasize broader camera-facing cheek when head turns 35°–60°
    if (leftRatio < 0.36 && rightCheekSample.validCount >= 10) {
      leftWeight = 0.16;
      rightWeight = 0.48;
    } else if (rightRatio < 0.36 && leftCheekSample.validCount >= 10) {
      leftWeight = 0.48;
      rightWeight = 0.16;
    }
  } else {
    const leftCheekTarget = {
      x: clamp(faceCxNorm - faceWNorm * 0.22, 0.16, 0.84),
      y: clamp(faceCyNorm + faceHNorm * 0.08, 0.2, 0.82),
    };
    const rightCheekTarget = {
      x: clamp(faceCxNorm + faceWNorm * 0.22, 0.16, 0.84),
      y: clamp(faceCyNorm + faceHNorm * 0.08, 0.2, 0.82),
    };
    leftCheekSample = sampleBestAnatomicalPatch(
      rawData,
      W,
      H,
      leftCheekTarget.x,
      leftCheekTarget.y,
      faceWNorm * 0.09,
      faceHNorm * 0.09,
      gains,
      false
    );
    rightCheekSample = sampleBestAnatomicalPatch(
      rawData,
      W,
      H,
      rightCheekTarget.x,
      rightCheekTarget.y,
      faceWNorm * 0.09,
      faceHNorm * 0.09,
      gains,
      false
    );
  }

  // Establish verified cheek luminance so forehead/chin sampling excludes dark bangs, brows & facial hair
  const validCheeks = [leftCheekSample, rightCheekSample].filter((s) => s.validCount >= 10);
  const cheekRefLum =
    validCheeks.length > 0
      ? validCheeks.reduce((acc, s) => acc + s.lum, 0) / validCheeks.length
      : 0;
  const minSkinLumGuard = cheekRefLum >= 72 ? Math.min(84, cheekRefLum * 0.44) : 0;

  let foreheadSample: SampledSkinPatch;
  let chinSample: SampledSkinPatch;

  if (lms && lms.length >= 468) {
    const fMid = mapLandmarksToPreviewCentroid(lms, [151], sx, sy, cropSide, srcW, srcH);
    const fGlabella = mapLandmarksToPreviewCentroid(
      lms,
      [9, 107, 336],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const fLeft = mapLandmarksToPreviewCentroid(
      lms,
      [108, 69, 105],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const fRight = mapLandmarksToPreviewCentroid(
      lms,
      [337, 299, 334],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const fBridge = mapLandmarksToPreviewCentroid(lms, [8, 168], sx, sy, cropSide, srcW, srcH);
    const fRx = clamp(faceWNorm * 0.075, 0.022, 0.085);
    const fRy = clamp(faceHNorm * 0.06, 0.02, 0.075);

    foreheadSample = sampleBestCandidateList(
      rawData,
      W,
      H,
      [
        { x: fMid.x, y: fMid.y, rx: fRx, ry: fRy, priorityBonus: 0.14 },
        { x: fGlabella.x, y: fGlabella.y, rx: fRx * 0.85, ry: fRy * 0.8, priorityBonus: 0.11 },
        { x: fLeft.x, y: fLeft.y, rx: fRx * 0.85, ry: fRy * 0.85, priorityBonus: 0.06 },
        { x: fRight.x, y: fRight.y, rx: fRx * 0.85, ry: fRy * 0.85, priorityBonus: 0.06 },
        { x: fBridge.x, y: fBridge.y, rx: fRx * 0.65, ry: fRy * 0.7, priorityBonus: 0.02 },
      ],
      gains,
      false,
      minSkinLumGuard,
      cheekRefLum
    );

    const chinCenter = mapLandmarksToPreviewCentroid(
      lms,
      [199, 200, 175],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const chinLeft = mapLandmarksToPreviewCentroid(
      lms,
      [208, 211],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const chinRight = mapLandmarksToPreviewCentroid(
      lms,
      [428, 431],
      sx,
      sy,
      cropSide,
      srcW,
      srcH
    );
    const cRx = clamp(faceWNorm * 0.07, 0.02, 0.08);
    const cRy = clamp(faceHNorm * 0.055, 0.02, 0.07);

    chinSample = sampleBestCandidateList(
      rawData,
      W,
      H,
      [
        { x: chinCenter.x, y: chinCenter.y, rx: cRx, ry: cRy, priorityBonus: 0.14 },
        { x: chinLeft.x, y: chinLeft.y, rx: cRx * 0.85, ry: cRy * 0.85, priorityBonus: 0.04 },
        { x: chinRight.x, y: chinRight.y, rx: cRx * 0.85, ry: cRy * 0.85, priorityBonus: 0.04 },
      ],
      gains,
      true,
      minSkinLumGuard,
      cheekRefLum
    );
  } else {
    foreheadSample = sampleBestCandidateList(
      rawData,
      W,
      H,
      [
        {
          x: faceCxNorm,
          y: clamp(faceCyNorm - faceHNorm * 0.25, 0.12, 0.72),
          rx: faceWNorm * 0.11,
          ry: faceHNorm * 0.085,
          priorityBonus: 0.12,
        },
        {
          x: faceCxNorm,
          y: clamp(faceCyNorm - faceHNorm * 0.12, 0.16, 0.74),
          rx: faceWNorm * 0.12,
          ry: faceHNorm * 0.08,
          priorityBonus: 0.07,
        },
        {
          x: clamp(faceCxNorm - faceWNorm * 0.14, 0.14, 0.86),
          y: clamp(faceCyNorm - faceHNorm * 0.2, 0.14, 0.72),
          rx: faceWNorm * 0.09,
          ry: faceHNorm * 0.08,
          priorityBonus: 0.04,
        },
        {
          x: clamp(faceCxNorm + faceWNorm * 0.14, 0.14, 0.86),
          y: clamp(faceCyNorm - faceHNorm * 0.2, 0.14, 0.72),
          rx: faceWNorm * 0.09,
          ry: faceHNorm * 0.08,
          priorityBonus: 0.04,
        },
      ],
      gains,
      false,
      minSkinLumGuard,
      cheekRefLum
    );

    const chinTarget = {
      x: faceCxNorm,
      y: clamp(faceCyNorm + faceHNorm * 0.3, 0.28, 0.88),
    };
    chinSample = sampleBestAnatomicalPatch(
      rawData,
      W,
      H,
      chinTarget.x,
      chinTarget.y,
      faceWNorm * 0.1,
      faceHNorm * 0.08,
      gains,
      true,
      minSkinLumGuard
    );
  }

  // Establish reliable reference skin RGB from verified facial zones (NEVER non-skin background/clothes!)
  const verifiedSamples = [
    leftCheekSample,
    rightCheekSample,
    foreheadSample,
    chinSample,
  ].filter((s) => s.validCount >= 10);

  let refR = 223;
  let refG = 186;
  let refB = 155;
  const referencePool = validCheeks.length > 0 ? validCheeks : verifiedSamples;
  if (referencePool.length > 0) {
    refR = Math.round(
      referencePool.reduce((acc, s) => acc + s.r, 0) / referencePool.length
    );
    refG = Math.round(
      referencePool.reduce((acc, s) => acc + s.g, 0) / referencePool.length
    );
    refB = Math.round(
      referencePool.reduce((acc, s) => acc + s.b, 0) / referencePool.length
    );
  } else {
    // Broad scan across entire face box if all 4 zones were tiny
    const broad = sampleBestAnatomicalPatch(
      rawData,
      W,
      H,
      faceCxNorm,
      faceCyNorm,
      faceWNorm * 0.26,
      faceHNorm * 0.26,
      gains,
      true
    );
    if (broad.validCount >= 6) {
      refR = broad.r;
      refG = broad.g;
      refB = broad.b;
    }
  }

  const rawPinSpecs: ReadonlyArray<{
    id: SkinPinSample['id'];
    labelKo: string;
    labelEn: string;
    sample: SampledSkinPatch;
    weight: number;
  }> = [
    {
      id: 'forehead',
      labelKo: '이마',
      labelEn: 'Forehead',
      sample: foreheadSample,
      weight: 0.22,
    },
    {
      id: 'leftCheek',
      labelKo: '왼쪽 볼',
      labelEn: 'Left Cheek',
      sample: leftCheekSample,
      weight: leftWeight,
    },
    {
      id: 'rightCheek',
      labelKo: '오른쪽 볼',
      labelEn: 'Right Cheek',
      sample: rightCheekSample,
      weight: rightWeight,
    },
    {
      id: 'chin',
      labelKo: '턱 · 하관',
      labelEn: 'Chin',
      sample: chinSample,
      weight: 0.14,
    },
  ];

  const pins: SkinPinSample[] = [];
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let totalWeight = 0;

  for (const spec of rawPinSpecs) {
    // If bangs or shadow occluded this specific pin, blend smoothly with verified cheek skin!
    const hasCleanSkin = spec.sample.validCount >= 10;
    const rPin = hasCleanSkin ? spec.sample.r : refR;
    const gPin = hasCleanSkin ? spec.sample.g : refG;
    const bPin = hasCleanSkin ? spec.sample.b : refB;

    const hex = rgbToHex(rPin, gPin, bPin);
    const labRaw = rgbToCieLab(rPin, gPin, bPin);
    const lab = {
      L: Number(labRaw.L.toFixed(1)),
      a: Number(labRaw.a.toFixed(1)),
      b: Number(labRaw.b.toFixed(1)),
    };

    const effectiveWeight = hasCleanSkin ? spec.weight : spec.weight * 0.35;
    pins.push({
      id: spec.id,
      labelKo: spec.labelKo,
      labelEn: spec.labelEn,
      x: Number((spec.sample.px / W).toFixed(3)),
      y: Number((spec.sample.py / H).toFixed(3)),
      hex,
      lab,
    });

    meanR += rPin * effectiveWeight;
    meanG += gPin * effectiveWeight;
    meanB += bPin * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  const normW = Math.max(0.01, totalWeight);
  const finalR = clampByte(meanR / normW);
  const finalG = clampByte(meanG / normW);
  const finalB = clampByte(meanB / normW);
  const finalLab = rgbToCieLab(finalR, finalG, finalB);

  const L = Number(finalLab.L.toFixed(1));
  const a = Number(finalLab.a.toFixed(1));
  const b = Number(finalLab.b.toFixed(1));
  const skinToneHex = rgbToHex(finalR, finalG, finalB);

  const itaDeg = Number(((Math.atan2(L - 50, Math.max(0.5, b)) * 180) / Math.PI).toFixed(1));
  const warmthIndex = Number((b - a * 0.42).toFixed(2));
  const chroma = Number(Math.hypot(a, b).toFixed(2));

  const isWarm = warmthIndex >= 9.2;
  const isBright = L >= 68.5;

  let personalColor: PersonalColorSeasonKey = 'autumn_warm';
  if (isWarm && isBright) personalColor = 'spring_warm';
  else if (!isWarm && isBright) personalColor = 'summer_cool';
  else if (isWarm && !isBright) personalColor = 'autumn_warm';
  else personalColor = 'winter_cool';

  let subTypeLabelKo = '가을 웜 뮤트';
  if (personalColor === 'spring_warm') {
    subTypeLabelKo = chroma >= 21.5 && L < 75 ? '봄 웜 브라이트' : '봄 웜 라이트';
  } else if (personalColor === 'summer_cool') {
    subTypeLabelKo = L >= 72.5 ? '여름 쿨 라이트' : '여름 쿨 뮤트';
  } else if (personalColor === 'autumn_warm') {
    subTypeLabelKo = L >= 60 ? '가을 웜 뮤트' : '가을 웜 딥';
  } else {
    subTypeLabelKo = L >= 58 ? '겨울 쿨 브라이트' : '겨울 쿨 딥';
  }
  const subTypeLabelEn = SUBTYPE_KO_TO_EN[subTypeLabelKo] || 'Autumn Warm Mute';

  const bSpread =
    Math.max(...pins.map((p) => p.lab.b)) - Math.min(...pins.map((p) => p.lab.b));
  const uniformity = Math.max(68, Math.min(99, Math.round(97 - bSpread * 1.9)));
  const separation = Math.max(
    70,
    Math.min(98, Math.round(74 + Math.min(10, Math.abs(warmthIndex - 9.2)) * 2.2))
  );
  const rawConfidence = Math.round(uniformity * 0.55 + separation * 0.45);
  const engineBoost =
    detectedFace.engine === 'mediapipe_face_landmarker' && verifiedSamples.length >= 2 ? 4 : 0;
  const confidence =
    verifiedSamples.length > 0
      ? Math.min(99, rawConfidence + engineBoost)
      : Math.min(62, rawConfidence);

  const matchedPreset = findClosestSkinPreset(skinToneHex, personalColor);
  const mstMatch = extractNormalizedMstFromSamples(pins, skinToneHex);
  const seasonMeta = SEASON_BEST_SWATCHES[personalColor];

  return {
    skinToneHex,
    personalColor,
    personalColorLabelKo: seasonMeta.labelKo,
    personalColorLabelEn: seasonMeta.labelEn,
    subTypeLabelKo,
    subTypeLabelEn,
    undertone: isWarm ? 'warm' : 'cool',
    matchedPresetKey: matchedPreset.key,
    mstLevel: mstMatch.swatch.level,
    mstUndertone: mstMatch.swatch.undertone,
    mstCode: mstMatch.swatch.code,
    confidence,
    lightingMode,
    faceDetected: detectedFace.detected && verifiedSamples.length > 0,
    detectorEngine: detectedFace.engine,
    faceBoxPreview,
    cropSourceRect: {
      sx,
      sy,
      side: cropSide,
      srcW,
      srcH,
    },
    lab: {
      L,
      a,
      b,
      itaDeg,
      warmthIndex,
      chroma,
    },
    pins,
    bestColors: seasonMeta.colors,
    adviceKo: seasonMeta.adviceKo,
    adviceEn: seasonMeta.adviceEn,
    previewDataUrl,
  };
}
