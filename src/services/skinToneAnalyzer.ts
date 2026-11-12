import { hexToRgb, rgbToCieLab, rgbToHex } from '../shared/colorMath.js';

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

export interface SkinTonePreset {
  key: string;
  labelKo: string;
  shortKo: string;
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  subTypeLabelKo: string;
  undertone: 'warm' | 'cool';
  bestColors: ReadonlyArray<{ name: string; hex: string }>;
  adviceKo: string;
}

export interface SkinPinSample {
  id: 'forehead' | 'leftCheek' | 'rightCheek' | 'chin';
  labelKo: string;
  x: number;
  y: number;
  hex: string;
  lab: { L: number; a: number; b: number };
}

export interface SkinToneAnalysisResult {
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  personalColorLabelKo: string;
  subTypeLabelKo: string;
  undertone: 'warm' | 'cool';
  matchedPresetKey: string;
  confidence: number;
  lightingMode: LightingCalibrationKey;
  lab: {
    L: number;
    a: number;
    b: number;
    itaDeg: number;
    warmthIndex: number;
    chroma: number;
  };
  pins: SkinPinSample[];
  bestColors: ReadonlyArray<{ name: string; hex: string }>;
  adviceKo: string;
  previewDataUrl: string;
}

export interface StoredSkinProfile {
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  personalColorLabelKo: string;
  subTypeLabelKo: string;
  gender: 'male' | 'female';
  presetKey: string;
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
}

const SKIN_PROFILE_STORAGE_KEY = 'ainventory_skin_profile_v1';

export const LIGHTING_CALIBRATION_MODES: ReadonlyArray<{
  key: LightingCalibrationKey;
  labelKo: string;
  shortKo: string;
  gains: { r: number; g: number; b: number; autoGreyWorld: boolean };
}> = [
  {
    key: 'auto_d65',
    labelKo: 'D65 자연광 자동 보정',
    shortKo: 'D65 자연광',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: true },
  },
  {
    key: 'studio_cool_fix',
    labelKo: '형광등 · 쿨 LED 보정',
    shortKo: '형광등 보정',
    gains: { r: 1.06, g: 1.01, b: 0.91, autoGreyWorld: false },
  },
  {
    key: 'indoor_warm_fix',
    labelKo: '실내 노란 조명 보정',
    shortKo: '노란조명 보정',
    gains: { r: 0.93, g: 0.99, b: 1.09, autoGreyWorld: false },
  },
  {
    key: 'raw_original',
    labelKo: '무보정 원본 픽셀',
    shortKo: '원본 픽셀',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: false },
  },
] as const;

export const SEASON_BEST_SWATCHES: Record<
  PersonalColorSeasonKey,
  {
    labelKo: string;
    adviceKo: string;
    colors: ReadonlyArray<{ name: string; hex: string }>;
  }
> = {
  spring_warm: {
    labelKo: '봄 웜톤',
    adviceKo: '웜 아이보리·버터 크림·피치 코랄·라이트 카멜 컬러가 피부 혈색을 가장 화사하게 밝혀줍니다.',
    colors: [
      { name: '웜 아이보리', hex: '#F6EFE2' },
      { name: '버터 크림', hex: '#F3E3BE' },
      { name: '피치 코랄', hex: '#EE9B82' },
      { name: '애프리콧 베이지', hex: '#E3BA95' },
      { name: '라이트 세이지', hex: '#A4C288' },
    ],
  },
  summer_cool: {
    labelKo: '여름 쿨톤',
    adviceKo: '소프트 화이트·파우더 블루·라벤더 그레이·뮤트 네이비 톤이 피부 결을 맑고 깨끗하게 정돈합니다.',
    colors: [
      { name: '소프트 화이트', hex: '#F2F4F7' },
      { name: '파우더 블루', hex: '#99BBD9' },
      { name: '라벤더 미스트', hex: '#B9B3CC' },
      { name: '더스티 로즈', hex: '#CC9AA6' },
      { name: '뮤트 네이비', hex: '#2B3D5B' },
    ],
  },
  autumn_warm: {
    labelKo: '가을 웜톤',
    adviceKo: '트렌치 베이지·카멜·올리브 카키·딥 브라운 등 깊이감 있는 얼씨(Earthy) 톤이 세련된 분위기를 살립니다.',
    colors: [
      { name: '오트밀 샌드', hex: '#D8C7AE' },
      { name: '카멜 브라운', hex: '#BE8B58' },
      { name: '테라코타', hex: '#B25538' },
      { name: '올리브 카키', hex: '#77805D' },
      { name: '에스프레소', hex: '#583E2E' },
    ],
  },
  winter_cool: {
    labelKo: '겨울 쿨톤',
    adviceKo: '선명한 블랙·아이시 화이트·차콜·로열 네이비·버건디 등 고대비 컬러가 이목구비를 또렷하게 강조합니다.',
    colors: [
      { name: '퓨어 블랙', hex: '#1B1C20' },
      { name: '아이시 화이트', hex: '#F6F8FC' },
      { name: '차콜 슬레이트', hex: '#373B44' },
      { name: '로열 네이비', hex: '#1D2E57' },
      { name: '딥 버건디', hex: '#6D1F31' },
    ],
  },
};

export const SKIN_TONE_MANNEQUIN_PRESETS: readonly SkinTonePreset[] = [
  {
    key: 'porcelain_cool',
    labelKo: '포슬린 페어 · 여름 쿨 라이트',
    shortKo: '포슬린 쿨',
    skinToneHex: '#F5E0DC',
    personalColor: 'summer_cool',
    subTypeLabelKo: '여름 쿨 라이트',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.summer_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.summer_cool.adviceKo,
  },
  {
    key: 'spring_ivory',
    labelKo: '웜 아이보리 · 봄 웜 라이트',
    shortKo: '봄 웜 아이보리',
    skinToneHex: '#F4D5BD',
    personalColor: 'spring_warm',
    subTypeLabelKo: '봄 웜 라이트',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.spring_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.spring_warm.adviceKo,
  },
  {
    key: 'summer_rose',
    labelKo: '로즈 아이보리 · 여름 쿨 뮤트',
    shortKo: '여름 쿨 로즈',
    skinToneHex: '#EAC9C8',
    personalColor: 'summer_cool',
    subTypeLabelKo: '여름 쿨 뮤트',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.summer_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.summer_cool.adviceKo,
  },
  {
    key: 'warm_vanilla',
    labelKo: '내추럴 바닐라 · 봄 웜 브라이트',
    shortKo: '봄 웜 바닐라',
    skinToneHex: '#EBC5A6',
    personalColor: 'spring_warm',
    subTypeLabelKo: '봄 웜 브라이트',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.spring_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.spring_warm.adviceKo,
  },
  {
    key: 'autumn_beige',
    labelKo: '내추럴 베이지 · 가을 웜 뮤트',
    shortKo: '가을 웜 베이지',
    skinToneHex: '#DFBA9B',
    personalColor: 'autumn_warm',
    subTypeLabelKo: '가을 웜 뮤트',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.autumn_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.autumn_warm.adviceKo,
  },
  {
    key: 'winter_neutral',
    labelKo: '뉴트럴 샌드 · 겨울 쿨 브라이트',
    shortKo: '겨울 쿨 뉴트럴',
    skinToneHex: '#D8B6B4',
    personalColor: 'winter_cool',
    subTypeLabelKo: '겨울 쿨 브라이트',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.winter_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.winter_cool.adviceKo,
  },
  {
    key: 'honey_tan',
    labelKo: '허니 브론즈 · 가을 웜 딥',
    shortKo: '가을 웜 브론즈',
    skinToneHex: '#C28E68',
    personalColor: 'autumn_warm',
    subTypeLabelKo: '가을 웜 딥',
    undertone: 'warm',
    bestColors: SEASON_BEST_SWATCHES.autumn_warm.colors,
    adviceKo: SEASON_BEST_SWATCHES.autumn_warm.adviceKo,
  },
  {
    key: 'deep_espresso',
    labelKo: '딥 에스프레소 · 겨울 쿨 딥',
    shortKo: '겨울 쿨 딥',
    skinToneHex: '#8E5C40',
    personalColor: 'winter_cool',
    subTypeLabelKo: '겨울 쿨 딥',
    undertone: 'cool',
    bestColors: SEASON_BEST_SWATCHES.winter_cool.colors,
    adviceKo: SEASON_BEST_SWATCHES.winter_cool.adviceKo,
  },
] as const;

export const DEFAULT_SKIN_PROFILE: StoredSkinProfile = {
  skinToneHex: '#DFBA9B',
  personalColor: 'autumn_warm',
  personalColorLabelKo: '가을 웜톤',
  subTypeLabelKo: '가을 웜 뮤트',
  gender: 'male',
  presetKey: 'autumn_beige',
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function adjustRgb(
  rgb: { r: number; g: number; b: number },
  deltaR: number,
  deltaG: number,
  deltaB: number
): string {
  return rgbToHex(
    clampByte(rgb.r + deltaR),
    clampByte(rgb.g + deltaG),
    clampByte(rgb.b + deltaB)
  );
}

function scaleRgb(rgb: { r: number; g: number; b: number }, factor: number): string {
  return rgbToHex(
    clampByte(rgb.r * factor),
    clampByte(rgb.g * factor),
    clampByte(rgb.b * factor)
  );
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
    return {
      skinToneHex: hex,
      personalColor: pc,
      personalColorLabelKo: parsed.personalColorLabelKo || SEASON_BEST_SWATCHES[pc].labelKo,
      subTypeLabelKo: parsed.subTypeLabelKo || preset.subTypeLabelKo,
      gender: parsed.gender === 'female' ? 'female' : 'male',
      presetKey: parsed.presetKey || preset.key,
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

  const merged: StoredSkinProfile = {
    skinToneHex: nextHex,
    personalColor: nextPc,
    personalColorLabelKo: profile.personalColorLabelKo || SEASON_BEST_SWATCHES[nextPc].labelKo,
    subTypeLabelKo: profile.subTypeLabelKo || matched.subTypeLabelKo,
    gender: profile.gender || current.gender,
    presetKey: profile.presetKey || matched.key,
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
 * Computes a complete volumetric 2.5D studio lighting & subsurface skin shading rig
 * from any `skinToneHex` + `personalColor` season.
 */
export function computeSkinShadingPalette(
  skinToneHex = '#DFBA9B',
  personalColor: string = 'autumn_warm',
  theme: 'light' | 'dark' = 'light'
): SkinShadingPalette {
  const rgb = hexToRgb(skinToneHex || '#DFBA9B');
  const season = normalizeSeasonKey(personalColor);
  const isWarm = season === 'spring_warm' || season === 'autumn_warm';
  const isDarkTheme = theme === 'dark';

  const highlight = adjustRgb(
    rgb,
    isWarm ? 26 : 22,
    isWarm ? 23 : 22,
    isWarm ? 18 : 25
  );
  const subsurface = adjustRgb(
    rgb,
    isWarm ? 14 : 11,
    isWarm ? -6 : -9,
    isWarm ? -10 : -2
  );
  const midShadow = scaleRgb(rgb, 0.87);
  const deepShadow = scaleRgb(rgb, 0.72);
  const rimLight = adjustRgb(rgb, 36, 34, 34);
  const lipTint = adjustRgb(
    rgb,
    isWarm ? 8 : 4,
    isWarm ? -26 : -30,
    isWarm ? -24 : -16
  );

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
    highlight,
    base: rgbToHex(rgb.r, rgb.g, rgb.b),
    subsurface,
    midShadow,
    deepShadow,
    rimLight,
    lipTint,
    browHair: hair.brow,
    hairMain: hair.main,
    hairHighlight: hair.hi,
    auraColor: auraMap[season],
    basewearFill: isDarkTheme ? '#2C2E35' : '#E7E7EC',
    basewearShadow: isDarkTheme ? '#1F2026' : '#D4D5DC',
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
    img.onerror = () => reject(new Error('인물 이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}

function isLikelySkinPixel(r: number, g: number, b: number): boolean {
  if (r < 45 || g < 30 || b < 20) return false;
  if (r > 250 && g > 250 && b > 250) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 74 && cb <= 132 && cr >= 129 && cr <= 178 && r > b * 0.92;
}

/**
 * Pure 2D-Canvas Portrait Skin-Tone & Personal-Color Analyzer (Zero WASM / Zero Network Calls)
 * - Automatically locates the face skin centroid via YCbCr chrominance segmentation
 * - Samples Forehead, Left Cheek, Right Cheek, and Chin under D65 white-balance calibration
 * - Extracts CIE L*a*b*, ITA° angle, skinToneHex, and 4-season / 8-subtype Personal Color
 */
export async function analyzePortraitSkinTone(
  imageSource: string,
  options: { lightingMode?: LightingCalibrationKey } = {}
): Promise<SkinToneAnalysisResult> {
  const lightingMode = options.lightingMode || 'auto_d65';
  const modeSpec =
    LIGHTING_CALIBRATION_MODES.find((m) => m.key === lightingMode) ||
    LIGHTING_CALIBRATION_MODES[0];

  const img = await loadImageElement(imageSource);
  const W = 320;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('2D 캔버스 컨텍스트를 초기화할 수 없습니다.');
  }

  // Center-crop square portrait framing
  const srcW = img.naturalWidth || img.width || W;
  const srcH = img.naturalHeight || img.height || H;
  const side = Math.min(srcW, srcH);
  const sx = Math.max(0, Math.round((srcW - side) / 2));
  const sy = Math.max(0, Math.round((srcH - side) * 0.32));
  ctx.drawImage(img, sx, sy, side, side, 0, 0, W, H);

  const rawData = ctx.getImageData(0, 0, W, H).data;
  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  canvas.width = 0;
  canvas.height = 0;

  // Compute Grey-World D65 white-balance gains when enabled
  let gainR = modeSpec.gains.r;
  let gainG = modeSpec.gains.g;
  let gainB = modeSpec.gains.b;

  if (modeSpec.gains.autoGreyWorld) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let cnt = 0;
    for (let i = 0; i < rawData.length; i += 32) {
      const r = rawData[i];
      const g = rawData[i + 1];
      const b = rawData[i + 2];
      if (r > 25 && r < 245 && g > 25 && g < 245 && b > 25 && b < 245) {
        sr += r;
        sg += g;
        sb += b;
        cnt += 1;
      }
    }
    if (cnt > 20) {
      const avgR = sr / cnt;
      const avgG = sg / cnt;
      const avgB = sb / cnt;
      const lum = (avgR + avgG + avgB) / 3;
      gainR = Math.max(0.9, Math.min(1.1, 0.68 + 0.32 * (lum / Math.max(1, avgR))));
      gainG = Math.max(0.93, Math.min(1.07, 0.72 + 0.28 * (lum / Math.max(1, avgG))));
      gainB = Math.max(0.9, Math.min(1.1, 0.68 + 0.32 * (lum / Math.max(1, avgB))));
    }
  }

  // Locate face skin bounding box via YCbCr skin pixel centroid inside central frame
  let skinSumX = 0;
  let skinSumY = 0;
  let skinMinX = W * 0.3;
  let skinMaxX = W * 0.7;
  let skinMinY = H * 0.22;
  let skinMaxY = H * 0.78;
  let skinCount = 0;

  let minXFound = W;
  let maxXFound = 0;
  let minYFound = H;
  let maxYFound = 0;

  for (let y = Math.floor(H * 0.12); y < Math.floor(H * 0.88); y += 3) {
    for (let x = Math.floor(W * 0.16); x < Math.floor(W * 0.84); x += 3) {
      const idx = (y * W + x) * 4;
      const r = clampByte(rawData[idx] * gainR);
      const g = clampByte(rawData[idx + 1] * gainG);
      const b = clampByte(rawData[idx + 2] * gainB);
      if (isLikelySkinPixel(r, g, b)) {
        skinSumX += x;
        skinSumY += y;
        skinCount += 1;
        if (x < minXFound) minXFound = x;
        if (x > maxXFound) maxXFound = x;
        if (y < minYFound) minYFound = y;
        if (y > maxYFound) maxYFound = y;
      }
    }
  }

  let cx = 0.5;
  let cy = 0.5;
  let faceW = 0.42;
  let faceH = 0.52;

  if (skinCount >= 40) {
    cx = Math.max(0.34, Math.min(0.66, skinSumX / skinCount / W));
    cy = Math.max(0.34, Math.min(0.64, skinSumY / skinCount / H));
    skinMinX = minXFound;
    skinMaxX = maxXFound;
    skinMinY = minYFound;
    skinMaxY = maxYFound;
    faceW = Math.max(0.28, Math.min(0.58, (skinMaxX - skinMinX) / W));
    faceH = Math.max(0.34, Math.min(0.66, (skinMaxY - skinMinY) / H));
  }

  const rawPins: ReadonlyArray<{
    id: SkinPinSample['id'];
    labelKo: string;
    x: number;
    y: number;
    weight: number;
  }> = [
    { id: 'forehead', labelKo: '이마', x: cx, y: Math.max(0.16, cy - faceH * 0.28), weight: 0.25 },
    {
      id: 'leftCheek',
      labelKo: '왼쪽 볼',
      x: Math.max(0.18, cx - faceW * 0.26),
      y: cy + faceH * 0.04,
      weight: 0.3,
    },
    {
      id: 'rightCheek',
      labelKo: '오른쪽 볼',
      x: Math.min(0.82, cx + faceW * 0.26),
      y: cy + faceH * 0.04,
      weight: 0.3,
    },
    { id: 'chin', labelKo: '턱 · 하관', x: cx, y: Math.min(0.86, cy + faceH * 0.3), weight: 0.15 },
  ];

  const pins: SkinPinSample[] = [];
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let meanL = 0;
  let meanA = 0;
  let meanLabB = 0;

  for (const pin of rawPins) {
    const px = Math.max(10, Math.min(W - 11, Math.round(pin.x * W)));
    const py = Math.max(10, Math.min(H - 11, Math.round(pin.y * H)));
    const radius = 10;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let validCount = 0;

    let fallbackRSum = 0;
    let fallbackGSum = 0;
    let fallbackBSum = 0;
    let fallbackCount = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const idx = ((py + dy) * W + (px + dx)) * 4;
        const r = clampByte(rawData[idx] * gainR);
        const g = clampByte(rawData[idx + 1] * gainG);
        const b = clampByte(rawData[idx + 2] * gainB);
        fallbackRSum += r;
        fallbackGSum += g;
        fallbackBSum += b;
        fallbackCount += 1;
        if (isLikelySkinPixel(r, g, b)) {
          rSum += r;
          gSum += g;
          bSum += b;
          validCount += 1;
        }
      }
    }

    const rAvg =
      validCount >= 12
        ? Math.round(rSum / validCount)
        : Math.round(fallbackRSum / Math.max(1, fallbackCount));
    const gAvg =
      validCount >= 12
        ? Math.round(gSum / validCount)
        : Math.round(fallbackGSum / Math.max(1, fallbackCount));
    const bAvg =
      validCount >= 12
        ? Math.round(bSum / validCount)
        : Math.round(fallbackBSum / Math.max(1, fallbackCount));

    const hex = rgbToHex(rAvg, gAvg, bAvg);
    const labRaw = rgbToCieLab(rAvg, gAvg, bAvg);
    const lab = {
      L: Number(labRaw.L.toFixed(1)),
      a: Number(labRaw.a.toFixed(1)),
      b: Number(labRaw.b.toFixed(1)),
    };

    pins.push({
      id: pin.id,
      labelKo: pin.labelKo,
      x: Number(pin.x.toFixed(3)),
      y: Number(pin.y.toFixed(3)),
      hex,
      lab,
    });

    meanR += rAvg * pin.weight;
    meanG += gAvg * pin.weight;
    meanB += bAvg * pin.weight;
    meanL += lab.L * pin.weight;
    meanA += lab.a * pin.weight;
    meanLabB += lab.b * pin.weight;
  }

  const L = Number(meanL.toFixed(1));
  const a = Number(meanA.toFixed(1));
  const b = Number(meanLabB.toFixed(1));
  const skinToneHex = rgbToHex(clampByte(meanR), clampByte(meanG), clampByte(meanB));

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

  const bSpread =
    Math.max(...pins.map((p) => p.lab.b)) - Math.min(...pins.map((p) => p.lab.b));
  const uniformity = Math.max(68, Math.min(99, Math.round(97 - bSpread * 1.9)));
  const separation = Math.max(
    70,
    Math.min(98, Math.round(74 + Math.min(10, Math.abs(warmthIndex - 9.2)) * 2.2))
  );
  const confidence = Math.round(uniformity * 0.55 + separation * 0.45);

  const matchedPreset = findClosestSkinPreset(skinToneHex, personalColor);
  const seasonMeta = SEASON_BEST_SWATCHES[personalColor];

  return {
    skinToneHex,
    personalColor,
    personalColorLabelKo: seasonMeta.labelKo,
    subTypeLabelKo,
    undertone: isWarm ? 'warm' : 'cool',
    matchedPresetKey: matchedPreset.key,
    confidence,
    lightingMode,
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
    previewDataUrl,
  };
}
