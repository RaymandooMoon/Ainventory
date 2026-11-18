import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { getStudioSeedImageForGarment, resolveStudioSeedUrl } from '../shared/garmentTaxonomy.js';
import { apiFetch } from '../utils/api.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import {
  type AvatarDominantHand,
  type AvatarSpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
import {
  type TurnaroundConsistencyQcReport,
  type VtonQcSliceMetrics,
  evaluateTurnaroundConsistencyQc,
  inspectPixelSliceQc,
  logVtonQcFailure,
  resolveBagCarryAnatomy,
} from './vtonQualityControl.ts';
import {
  applyCornerBfsCutoutOnCanvas,
  ensureTransparentCutout,
  removeModelBackgroundToPng,
} from './cutoutService.ts';
import {
  type BodyShapeKey,
  getStoredBodySpec,
  normalizeBodyShape,
} from './parametricAvatar3D.ts';
import {
  type PersonalColorSeasonKey,
  findClosestSkinPreset,
  getStoredSkinProfile,
  normalizeSeasonKey,
} from './skinToneAnalyzer.ts';
import {
  CUTOUT_PIPELINE_VERSION,
  CUTOUT_STAGE_BACKDROP_HEX,
  type CanonicalAvatarGender,
  type EffectiveWeatherMode,
  FOOTWEAR_PAIR_SYMMETRY_LOCK,
  LEGACY_CUTOUT_PIPELINE_VERSIONS,
  SOLO_SINGLE_PERSON_PER_CELL_LOCK,
  type StudioKeyColorInput,
  buildCanonicalCharacterIdentityPromptBlock,
  buildTurnaround3x2SheetAngleDirectives,
  buildTurnaroundAnglePromptDirective,
  buildWeatherPosePromptDirectives,
  normalizeCanonicalAvatarGender,
  resolveEffectiveWeatherFromRaw,
  selectOptimalStudioKeyHex,
} from './weatherPromptBuilder.ts';

export type CanonicalViewerMode = '2d-vton';

export type ViewerStageMode = 'flatlay' | 'ai-vton';

export type VtonStyleMode = 'photorealistic' | 'stylized_isometric';

export type TurnaroundAngleDeg = 0 | 45 | 90 | 135 | 180 | 225;

export type Turnaround360AngleDeg = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export const TURNAROUND_ANGLES: readonly TurnaroundAngleDeg[] = [
  0, 45, 90, 135, 180, 225,
] as const;

export const TURNAROUND_360_ANGLES: readonly Turnaround360AngleDeg[] = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const;

export const DEFAULT_TURNAROUND_ANGLE: TurnaroundAngleDeg = 0;

export interface Turnaround360RenderSpec {
  angleDeg: Turnaround360AngleDeg;
  canonicalSliceAngle: TurnaroundAngleDeg;
  mirrorX: boolean;
  perspectiveYawDeg: number;
  shortKo: string;
  shortEn: string;
  fullKo: string;
  fullEn: string;
}

export type VtonProviderId = 'flatlay-lookbook' | 'gemini-vton';

export type VtonCacheLayer = 'memory' | 'indexeddb' | 'server' | 'fresh' | 'flatlay';

export type WeatherMoodKey =
  | 'clear'
  | 'cloudy'
  | 'windy'
  | 'rainy'
  | 'snowy'
  | 'mild'
  | 'heatwave'
  | 'cold'
  | 'coldwave'
  | 'studio_neutral';

export interface NormalizedVtonProfile {
  avatarSpec: AvatarSpec;
  avatarConfigHash: string;
  gender?: CanonicalAvatarGender;
  dominantHand: AvatarDominantHand;
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  personalColorLabelKo: string;
  subTypeLabelKo: string;
  heightCm: number;
  weightKg: number;
  bodyShape: BodyShapeKey;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
  portraitDataUrl: string | null;
}

export interface PortraitLookupSources {
  personReferenceUrl?: string | null;
  portraitDataUrl?: string | null;
  // oxlint-disable-next-line typescript/no-explicit-any
  skinProfile?: Record<string, any> | null;
  // oxlint-disable-next-line typescript/no-explicit-any
  user?: Record<string, any> | null;
}

export interface GenderNeutralProfileInput extends PortraitLookupSources {
  profile?: Partial<NormalizedVtonProfile> | null;
  avatarSpec?: AvatarSpec | null;
  avatarConfigHash?: string | null;
  gender?: CanonicalAvatarGender | string | null;
  // oxlint-disable-next-line typescript/no-explicit-any
  bodySpec?: Record<string, any> | null;
  skinToneHex?: string | null;
  personalColor?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  bodyShape?: string | null;
  shoulderScale?: number | null;
  waistScale?: number | null;
  hipScale?: number | null;
}

export interface AiVtonSynthesisRequest extends GenderNeutralProfileInput {
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null;
  viewAngleDeg?: number;
  styleMode?: VtonStyleMode;
  // oxlint-disable-next-line typescript/no-explicit-any
  weather?: Record<string, any> | string | null;
  turnaroundSheet?: boolean;
  theme?: 'light' | 'dark';
  legacyMode?: unknown;
  mode?: unknown;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

export interface CachedAiVtonSlice {
  cacheKey: string;
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  angleDeg: TurnaroundAngleDeg;
  weatherMood: WeatherMoodKey;
  effectiveWeather?: EffectiveWeatherMode;
  imageUrl: string;
  sheetImageUrl?: string | null;
  outfitLabel?: string;
  garmentLabels?: string[];
  slotGarmentIds?: Record<string, number | string>;
  equippedCount?: number;
  model: string;
  updatedAt: number;
}

export interface AiVtonHistoryEntry {
  groupKey: string;
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  effectiveWeather?: EffectiveWeatherMode;
  outfitLabel: string;
  garmentLabels: string[];
  slotGarmentIds?: Record<string, number | string>;
  equippedCount: number;
  thumbnailUrl: string;
  angleSlices: Partial<Record<TurnaroundAngleDeg, string>>;
  availableAngles: TurnaroundAngleDeg[];
  updatedAt: number;
}

export interface AiVtonSynthesisOutcome {
  ok: boolean;
  fallbackToFlatLay: boolean;
  frontOnlyDegraded?: boolean;
  reason: string | null;
  mode: CanonicalViewerMode;
  provider: VtonProviderId;
  styleMode: VtonStyleMode;
  angleDeg: TurnaroundAngleDeg;
  weatherMood: WeatherMoodKey;
  effectiveWeather: EffectiveWeatherMode;
  avatarConfigHash: string;
  outfitComboId: string;
  cacheKey: string;
  fromCache: boolean;
  cacheLayer: VtonCacheLayer;
  imageUrl: string | null;
  angleSlices: Partial<Record<TurnaroundAngleDeg, string>>;
  equippedCount: number;
  equippedSlotKeys: string[];
  profile: NormalizedVtonProfile;
  createdAt: number;
}

interface VtonServerResponse {
  ok?: boolean;
  cached?: boolean;
  provider?: string;
  model?: string | null;
  layout?: 'turnaround_3x2' | 'turnaround_2x2' | 'single' | string;
  styleMode?: string;
  weatherMood?: string;
  geminiUsed?: boolean;
  fallbackReason?: string | null;
  compositeImageUrl?: string | null;
  afterImageUrl?: string | null;
  baseModelImageUrl?: string | null;
  panelImages?: Partial<Record<string, string>>;
}

const VTON_IDB_NAME = 'ainventory_gemini_vton_cache_v3';
const VTON_IDB_VERSION = 1;
const VTON_IDB_STORE = 'vton_slices';
const L1_MAX_ENTRIES = 36;
const L2_MAX_ENTRIES = 360;
const PACKSHOT_CACHE_MAX = 40;

const ORDERED_OUTFIT_SLOTS = [
  'headwear',
  'acc_head',
  'acc_eyes',
  'jwl_ear_left',
  'jwl_ear_right',
  'neckwear',
  'acc_neck',
  'jwl_neck',
  'outer',
  'outer_mid',
  'jwl_brooch',
  'top_mid',
  'top',
  'onepiece',
  'dress',
  'acc_belt',
  'bottom',
  'acc_wrist_left',
  'acc_wrist_right',
  'jwl_wrist_left',
  'jwl_wrist_right',
  'gloves',
  'acc_hand_left',
  'acc_hand_right',
  'jwl_ring_left',
  'jwl_ring_right',
  'socks',
  'shoes',
  'accessory',
  'acc_umbrella',
] as const;

const READONLY_PORTRAIT_STORAGE_KEYS = [
  'ainventory_user_portrait_v1',
  'ainventory_portrait_data_url',
  'ainventory_skin_profile_v1',
] as const;

const LEGACY_MODE_STORAGE_KEYS = [
  'ainventory_view_mode',
  'ainventory_render_mode',
] as const;

const l1SliceCache = new Map<string, CachedAiVtonSlice>();
const encodedGarmentPackshotCache = new Map<string, string>();
const seenFlatLayCombos = new Set<string>();
const inFlightAiRequests = new Map<string, Promise<AiVtonSynthesisOutcome>>();
let vtonDbPromise: Promise<IDBDatabase | null> | null = null;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fnvHashHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i * 17), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * Safely normalizes ANY legacy viewer/render mode value ('3d', '3D', '2.5d', '25d',
 * '2.5d-studio', 'webgl', objects, undefined, or legacy localStorage mode keys)
 * to the single canonical mode `'2d-vton'` with zero errors and zero external mutations.
 */
export function normalizeViewerMode(rawMode?: unknown): CanonicalViewerMode {
  try {
    if (rawMode === undefined && typeof localStorage !== 'undefined') {
      for (const key of LEGACY_MODE_STORAGE_KEYS) {
        const legacyVal = localStorage.getItem(key);
        if (legacyVal) break;
      }
    } else if (rawMode && typeof rawMode === 'object') {
      const candidate = (rawMode as Record<string, unknown>).mode;
      void candidate;
    }
  } catch {
    // Ignore storage or getter errors
  }
  return '2d-vton';
}

export const VTON_STYLE_PREF_STORAGE_KEY = 'ainventory_vton_style_pref_v1';
export const VTON_STYLE_PREF_EVENT = 'ainventory:vton-style-change';
export const GEMINI_API_KEY_EVENT = 'ainventory:gemini-key-change';

export function normalizeVtonStyleMode(raw?: unknown): VtonStyleMode {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    s === 'stylized_isometric' ||
    s === 'stylized-isometric' ||
    s === 'stylized' ||
    s === 'isometric' ||
    s === 'character'
  ) {
    return 'stylized_isometric';
  }
  return 'photorealistic';
}

export function getStoredVtonStylePreference(): VtonStyleMode | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(VTON_STYLE_PREF_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === 'photorealistic') return 'photorealistic';
    if (trimmed === 'stylized_isometric') return 'stylized_isometric';
    return null;
  } catch {
    return null;
  }
}

export function setStoredVtonStylePreference(
  mode: VtonStyleMode | null | undefined
): VtonStyleMode | null {
  const normalized: VtonStyleMode | null =
    mode === 'photorealistic'
      ? 'photorealistic'
      : mode === 'stylized_isometric'
        ? 'stylized_isometric'
        : null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (normalized) {
        window.localStorage.setItem(VTON_STYLE_PREF_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(VTON_STYLE_PREF_STORAGE_KEY);
      }
    } catch {
      // ignore storage write error
    }
    try {
      window.dispatchEvent(
        new CustomEvent(VTON_STYLE_PREF_EVENT, { detail: { styleMode: normalized } })
      );
    } catch {
      // ignore CustomEvent dispatch errors
    }
  }
  return normalized;
}

/**
 * Resolves the active VTON render style:
 * - When no user face photo is registered (`!hasFacePhoto`), defaults to `'stylized_isometric'`
 *   (Character Simulation / 캐릭터 시뮬레이션).
 * - When a user face photo is registered (`hasFacePhoto`), honors `'stylized_isometric'` if explicitly
 *   chosen, otherwise uses `'photorealistic'` (Photorealistic Model / 실사 모델).
 */
export function resolveEffectiveVtonStyleMode(params: {
  preferredStyle?: VtonStyleMode | null;
  hasFacePhoto: boolean;
}): VtonStyleMode {
  if (!params.hasFacePhoto) {
    return 'stylized_isometric';
  }
  if (params.preferredStyle === 'stylized_isometric') {
    return 'stylized_isometric';
  }
  return 'photorealistic';
}

/**
 * Normalizes any numeric degree onto the 8-angle 360° studio ring:
 * `0°`, `45°`, `90°`, `135°`, `180°`, `225°`, `270°`, `315°`.
 */
export function normalizeTurnaround360Angle(
  rawAngle?: unknown,
  fallback: Turnaround360AngleDeg = DEFAULT_TURNAROUND_ANGLE
): Turnaround360AngleDeg {
  if (rawAngle === null || rawAngle === undefined || rawAngle === '') {
    return fallback;
  }
  const n = Number(rawAngle);
  if (!Number.isFinite(n)) return fallback;
  const wrapped = ((n % 360) + 360) % 360;
  const snapped = (Math.round(wrapped / 45) * 45) % 360;
  return (TURNAROUND_360_ANGLES.includes(snapped as Turnaround360AngleDeg)
    ? snapped
    : fallback) as Turnaround360AngleDeg;
}

/**
 * Maps a 360° studio angle (`0..315`) onto the bottom horizontal scroll range `[-180..+180]`
 * where `0` is center (Front) and both `-180` and `+180` are Back (`180°`).
 */
export function angle360ToSignedScrollDeg(
  rawAngle: unknown,
  prevScrollDeg = 0
): number {
  const angle360 = normalizeTurnaround360Angle(rawAngle, DEFAULT_TURNAROUND_ANGLE);
  if (angle360 === 180) {
    return prevScrollDeg < 0 ? -180 : 180;
  }
  if (angle360 > 180) {
    return angle360 - 360;
  }
  return angle360;
}

/**
 * Computes both the snapped 8-way 360° angle and continuous residual micro-yaw (`[-9.5°..+9.5°]`)
 * for smooth mannequin rotation as the user scrubs the `[-180..0..+180]` scrollbar.
 */
export function resolveSignedAngleScrollState(rawScrollDeg: unknown): {
  clampedScrollDeg: number;
  snappedScrollDeg: number;
  angle360: Turnaround360AngleDeg;
  residualYawDeg: number;
} {
  const n = Number(rawScrollDeg);
  const clampedScrollDeg = Number.isFinite(n) ? clamp(n, -180, 180) : 0;
  // Natural 157.5° boundary preserves full 45°-wide zones for ±135° (우후면/좌후면: [±113..±157])
  // while outer [±158..±180] snaps cleanly to 180° 뒷모습 at both ends
  const snappedScrollDeg =
    Math.abs(clampedScrollDeg) >= 158
      ? clampedScrollDeg < 0
        ? -180
        : 180
      : clamp(Math.round(clampedScrollDeg / 45) * 45, -180, 180);
  const angle360 = normalizeTurnaround360Angle(snappedScrollDeg, DEFAULT_TURNAROUND_ANGLE);
  const deltaDeg = clampedScrollDeg - snappedScrollDeg;
  const yawFactor = Math.abs(snappedScrollDeg) === 180 ? 0.16 : 0.42;
  const residualYawDeg = Math.round(clamp(deltaDeg * yawFactor, -9.5, 9.5) * 10) / 10;
  return {
    clampedScrollDeg,
    snappedScrollDeg,
    angle360,
    residualYawDeg,
  };
}

/**
 * Computes the ideal device-adaptive base display scale for `1.0x` zoom so the mannequin fills
 * ~80–84% of the stage height comfortably on narrow portrait phones, foldables, tablets, and desktops
 * without width-choking `1:1` quadrant slices or clipping head/umbrellas/shoes.
 */
export function computeIdealDeviceMannequinScale(params?: {
  stageWidth?: number;
  stageHeight?: number;
  imageAspectRatio?: number;
}): number {
  const sw = Number(params?.stageWidth) || 0;
  const sh = Number(params?.stageHeight) || 0;
  if (sw < 120 || sh < 160) {
    return 1.22;
  }
  const isCompact = sw <= 1060;
  const topPad = isCompact ? 58 : 62;
  const bottomPad = isCompact ? 68 : 72;
  const sidePad = isCompact ? 8 : 12;
  const availW = Math.max(120, sw - sidePad * 2);
  const availH = Math.max(160, sh - topPad - bottomPad);
  const rawAspect = Number(params?.imageAspectRatio);
  const imgAspect =
    Number.isFinite(rawAspect) && rawAspect > 0.25 ? clamp(rawAspect, 0.45, 1.45) : 0.74;

  const renderedBoxH = Math.min(availH, availW / imgAspect);
  const effectiveTargetH = sh - (topPad + bottomPad) * 0.64;
  const widthChokeCompensation =
    renderedBoxH < availH
      ? Math.max(availH, effectiveTargetH) / Math.max(1, renderedBoxH)
      : 1;
  const stageAspect = sw / sh;
  const presenceBoost = stageAspect < 0.85 ? 1.185 : stageAspect < 1.25 ? 1.155 : 1.145;

  const renderedBoxW = renderedBoxH * imgAspect;
  const maxHorizontalScale = (sw * 0.94) / Math.max(1, renderedBoxW * 0.6);
  const rawIdeal = widthChokeCompensation * presenceBoost;
  return Math.round(clamp(Math.min(rawIdeal, maxHorizontalScale), 1.14, 1.52) * 1000) / 1000;
}

const TURNAROUND_360_SPEC_MAP: Record<Turnaround360AngleDeg, Turnaround360RenderSpec> = {
  0: {
    angleDeg: 0,
    canonicalSliceAngle: 0,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '정면',
    shortEn: 'Front',
    fullKo: '0° 정면',
    fullEn: '0° Front',
  },
  45: {
    angleDeg: 45,
    canonicalSliceAngle: 45,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '우측 45°',
    shortEn: '45° R',
    fullKo: '45° 우측 쿼터',
    fullEn: '45° Front-Right',
  },
  90: {
    angleDeg: 90,
    canonicalSliceAngle: 90,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '우측면',
    shortEn: 'Right',
    fullKo: '90° 우측면',
    fullEn: '90° Right Side',
  },
  135: {
    angleDeg: 135,
    canonicalSliceAngle: 135,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '우후면',
    shortEn: '135° R',
    fullKo: '135° 우측 후면',
    fullEn: '135° Back-Right',
  },
  180: {
    angleDeg: 180,
    canonicalSliceAngle: 180,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '후면',
    shortEn: 'Back',
    fullKo: '180° 후면',
    fullEn: '180° Back',
  },
  225: {
    angleDeg: 225,
    canonicalSliceAngle: 225,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '좌후면',
    shortEn: '225° L',
    fullKo: '225° 좌측 후면',
    fullEn: '225° Back-Left',
  },
  270: {
    angleDeg: 270,
    canonicalSliceAngle: 90,
    mirrorX: true,
    perspectiveYawDeg: 0,
    shortKo: '좌측면',
    shortEn: 'Left',
    fullKo: '270° 좌측면',
    fullEn: '270° Left Side',
  },
  315: {
    angleDeg: 315,
    canonicalSliceAngle: 45,
    mirrorX: true,
    perspectiveYawDeg: 0,
    shortKo: '좌측 45°',
    shortEn: '315° L',
    fullKo: '315° 좌측 쿼터',
    fullEn: '315° Front-Left',
  },
};

export function resolve360AngleRenderSpec(rawAngle?: unknown): Turnaround360RenderSpec {
  const angle360 = normalizeTurnaround360Angle(rawAngle, DEFAULT_TURNAROUND_ANGLE);
  return TURNAROUND_360_SPEC_MAP[angle360];
}

/**
 * Normalizes any numeric degree onto the 6 canonical turnaround slice angles:
 * `0°`, `45°`, `90°`, `135°` (Back-Right), `180°` (Back), `225°` (Back-Left).
 */
export function normalizeTurnaroundAngleDeg(
  rawAngle?: unknown,
  fallback: TurnaroundAngleDeg = DEFAULT_TURNAROUND_ANGLE
): TurnaroundAngleDeg {
  if (rawAngle === null || rawAngle === undefined || rawAngle === '') {
    return fallback;
  }
  const n = Number(rawAngle);
  if (!Number.isFinite(n)) return fallback;
  return resolve360AngleRenderSpec(n).canonicalSliceAngle;
}

// oxlint-disable-next-line typescript/no-explicit-any
export function normalizeWeatherMoodKey(rawWeather?: any): WeatherMoodKey {
  if (!rawWeather) return 'studio_neutral';
  const effective = resolveEffectiveWeatherFromRaw(rawWeather);
  switch (effective) {
    case 'rain':
      return 'rainy';
    case 'snow':
      return 'snowy';
    case 'coldwave':
      return 'coldwave';
    case 'heatwave':
      return 'heatwave';
    case 'wind':
      return 'windy';
    case 'cloudy':
      return 'cloudy';
    case 'clear': {
      if (typeof rawWeather === 'string') {
        const s = rawWeather.toLowerCase();
        if (s.includes('warm') || s.includes('mild') || s.includes('포근')) return 'mild';
        if (s.includes('clear') || s.includes('sun') || s.includes('맑음')) return 'clear';
        return 'studio_neutral';
      }
      if (typeof rawWeather === 'object') {
        const cond = String(
          rawWeather.scenarioKey || rawWeather.condition || rawWeather.mood || ''
        ).toLowerCase();
        const maxT = Number(rawWeather.tempMax ?? rawWeather.temperatureMax ?? rawWeather.temp);
        if (
          cond.includes('warm') ||
          cond.includes('mild') ||
          cond.includes('포근') ||
          (Number.isFinite(maxT) && maxT >= 18 && maxT <= 25)
        ) {
          return 'mild';
        }
        return 'clear';
      }
      return 'studio_neutral';
    }
    default:
      return 'studio_neutral';
  }
}

function sanitizeImageCandidate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[object Object]') {
    return null;
  }
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return null;
}

export function resolveReadOnlyUserPortrait(
  sources?: PortraitLookupSources | null
): string | null {
  if (sources && typeof sources === 'object') {
    const directCandidates: unknown[] = [
      sources.personReferenceUrl,
      sources.portraitDataUrl,
      sources.skinProfile?.portraitDataUrl,
      sources.skinProfile?.previewDataUrl,
      sources.skinProfile?.photoUrl,
      sources.user?.portraitUrl,
      sources.user?.faceImageUrl,
      sources.user?.avatarUrl,
      sources.user?.photoUrl,
    ];
    for (const candidate of directCandidates) {
      const valid = sanitizeImageCandidate(candidate);
      if (valid) return valid;
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      for (const storageKey of READONLY_PORTRAIT_STORAGE_KEYS) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) continue;
          const direct = sanitizeImageCandidate(raw);
          if (direct) return direct;
          if (raw.startsWith('{')) {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const nested =
              sanitizeImageCandidate(parsed.portraitDataUrl) ||
              sanitizeImageCandidate(parsed.previewDataUrl) ||
              sanitizeImageCandidate(parsed.photoUrl) ||
              sanitizeImageCandidate(parsed.dataUrl);
            if (nested) return nested;
          }
        } catch {
          // Ignore malformed storage entry
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

export function normalizeGenderNeutralProfile(
  input?: GenderNeutralProfileInput | null
): NormalizedVtonProfile {
  const storedSkin = getStoredSkinProfile();
  const storedBody = getStoredBodySpec();

  const bridged = bridgeLegacyPropsToAvatarSpec({
    skinProfile: input?.skinProfile ?? storedSkin,
    bodySpec: input?.bodySpec ?? storedBody,
    user: input?.user ?? null,
  });

  const baseSpec = input?.avatarSpec ? sanitizeAvatarSpec(input.avatarSpec) : bridged.spec;
  const rawGenderCandidate =
    input?.gender ??
    input?.profile?.gender ??
    (input?.avatarSpec?.framePreset === 'feminine' ||
    input?.avatarSpec?.framePreset === 'masculine'
      ? input.avatarSpec.framePreset
      : null) ??
    input?.user?.gender ??
    input?.bodySpec?.gender ??
    input?.skinProfile?.gender ??
    (baseSpec.framePreset !== 'androgynous' ? baseSpec.framePreset : null) ??
    storedBody?.gender;
  const gender = normalizeCanonicalAvatarGender(rawGenderCandidate, baseSpec.framePreset);

  const rawSkinHex =
    input?.skinToneHex ||
    input?.profile?.skinToneHex ||
    input?.skinProfile?.skinToneHex ||
    baseSpec.appearance.skinToneHex ||
    storedSkin.skinToneHex ||
    '#DFBA9B';
  const closestPreset = findClosestSkinPreset(rawSkinHex);
  const personalColor = normalizeSeasonKey(
    input?.personalColor ||
      input?.profile?.personalColor ||
      input?.skinProfile?.personalColor ||
      baseSpec.appearance.personalColor ||
      storedSkin.personalColor ||
      closestPreset.personalColor
  );

  const heightCm = clamp(
    Math.round(
      Number(
        input?.heightCm ??
          input?.profile?.heightCm ??
          input?.bodySpec?.heightCm ??
          baseSpec.anthropometrics.heightCm ??
          input?.user?.heightCm ??
          172
      ) || 172
    ),
    100,
    230
  );
  const weightKg = clamp(
    Math.round(
      Number(
        input?.weightKg ??
          input?.profile?.weightKg ??
          input?.bodySpec?.weightKg ??
          baseSpec.anthropometrics.weightKg ??
          input?.user?.weightKg ??
          64
      ) || 64
    ),
    35,
    160
  );
  const bodyShape = normalizeBodyShape(
    input?.bodyShape ??
      input?.profile?.bodyShape ??
      input?.bodySpec?.bodyShape ??
      input?.user?.bodyShape ??
      baseSpec.archetypePreset
  );

  const shoulderScale = clamp(
    Number(
      input?.shoulderScale ??
        input?.bodySpec?.shoulderScale ??
        baseSpec.anthropometrics.shoulderScale ??
        1
    ) || 1,
    0.75,
    1.35
  );
  const waistScale = clamp(
    Number(
      input?.waistScale ??
        input?.bodySpec?.waistScale ??
        baseSpec.anthropometrics.waistScale ??
        1
    ) || 1,
    0.7,
    1.35
  );
  const hipScale = clamp(
    Number(
      input?.hipScale ??
        input?.bodySpec?.hipScale ??
        baseSpec.anthropometrics.hipScale ??
        1
    ) || 1,
    0.8,
    1.38
  );

  const syncedSpec = sanitizeAvatarSpec({
    ...baseSpec,
    anthropometrics: {
      ...baseSpec.anthropometrics,
      heightCm,
      weightKg,
      shoulderScale,
      waistScale,
      hipScale,
    },
    appearance: {
      ...baseSpec.appearance,
      skinToneHex: rawSkinHex,
      personalColor,
    },
  });

  const avatarConfigHash =
    (typeof input?.avatarConfigHash === 'string' && input.avatarConfigHash.trim()) ||
    computeAvatarConfigHash(syncedSpec);

  const portraitDataUrl =
    resolveReadOnlyUserPortrait(input) || syncedSpec.appearance.facePhotoUrl || null;

  return {
    avatarSpec: syncedSpec,
    avatarConfigHash,
    gender,
    dominantHand: syncedSpec.dominantHand,
    skinToneHex: syncedSpec.appearance.skinToneHex,
    personalColor,
    personalColorLabelKo: closestPreset.labelKo,
    subTypeLabelKo: closestPreset.subTypeLabelKo,
    heightCm,
    weightKg,
    bodyShape,
    shoulderScale,
    waistScale,
    hipScale,
    portraitDataUrl,
  };
}

// oxlint-disable-next-line typescript/no-explicit-any
export function computeOutfitComboId(slots?: Record<string, any> | null): {
  outfitComboId: string;
  equippedSlotKeys: string[];
  equippedGarments: Array<{ slotKey: string; garment: GarmentRecord }>;
} {
  const equippedGarments: Array<{ slotKey: string; garment: GarmentRecord }> = [];
  if (slots && typeof slots === 'object') {
    const seen = new Set<string>();
    for (const key of ORDERED_OUTFIT_SLOTS) {
      seen.add(key);
      const g = slots[key];
      if (g && typeof g === 'object') {
        equippedGarments.push({ slotKey: key, garment: g as GarmentRecord });
      }
    }
    for (const [key, g] of Object.entries(slots)) {
      if (!seen.has(key) && g && typeof g === 'object') {
        equippedGarments.push({ slotKey: key, garment: g as GarmentRecord });
      }
    }
  }

  if (equippedGarments.length === 0) {
    return {
      outfitComboId: 'outfit_empty',
      equippedSlotKeys: [],
      equippedGarments: [],
    };
  }

  const rawSig = equippedGarments
    .map(({ slotKey, garment }) => {
      const resolvedUrl = resolveGarmentCanonicalImageUrl(garment);
      return `${slotKey}:${garment.id ?? ''}:${garment.subcategory ?? ''}:${garment.color_hex ?? ''}:${resolvedUrl}`;
    })
    .join('|');

  return {
    outfitComboId: `outfit_${fnvHashHex(rawSig)}`,
    equippedSlotKeys: equippedGarments.map((entry) => entry.slotKey),
    equippedGarments,
  };
}

export function resolveGarmentCanonicalImageUrl(garment?: Partial<GarmentRecord> | null): string {
  if (!garment) return '';
  const raw = String(garment.image_url || '').trim();
  const cat = garment.category || 'top';
  const sub = garment.subcategory || 'knit';
  if (
    (raw.startsWith('data:image/') && !raw.startsWith('data:image/svg+xml')) ||
    raw.startsWith('blob:') ||
    raw.startsWith('/uploads/')
  ) {
    return raw;
  }
  if (raw.startsWith('/seed/')) {
    return resolveStudioSeedUrl(garment, cat, sub);
  }
  return getStudioSeedImageForGarment(cat, sub);
}

/**
 * Deterministic IndexedDB cache key per 3-Layer Weather + RGBA Cutout specification:
 * `(CUTOUT_PIPELINE_VERSION + avatarConfigHash + outfitComboId + styleMode + effectiveWeather + angleDeg)`
 */
export function buildAiVtonCacheKey(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  angleDeg: number;
  effectiveWeather?: EffectiveWeatherMode | null;
  weather?: unknown;
}): string {
  const ew: EffectiveWeatherMode =
    params.effectiveWeather ||
    (params.weather ? resolveEffectiveWeatherFromRaw(params.weather) : 'clear');
  const canonicalAngle = normalizeTurnaroundAngleDeg(params.angleDeg, DEFAULT_TURNAROUND_ANGLE);
  return `${CUTOUT_PIPELINE_VERSION}::${params.avatarConfigHash}::${params.outfitComboId}::${params.styleMode}::${ew}::${canonicalAngle}`;
}

export function trackFlatLayComboVisit(comboKey: string): boolean {
  if (!comboKey) return false;
  const wasSeen = seenFlatLayCombos.has(comboKey);
  seenFlatLayCombos.add(comboKey);
  return wasSeen;
}

const verifiedTransparentCacheKeys = new Set<string>();

function markCacheKeyTransparentVerified(cacheKey: string): void {
  if (!cacheKey) return;
  if (verifiedTransparentCacheKeys.size >= 512) {
    const oldest = verifiedTransparentCacheKeys.values().next().value;
    if (oldest) verifiedTransparentCacheKeys.delete(oldest);
  }
  verifiedTransparentCacheKeys.add(cacheKey);
}

function setL1Slice(entry: CachedAiVtonSlice): void {
  if (l1SliceCache.has(entry.cacheKey)) {
    l1SliceCache.delete(entry.cacheKey);
  }
  while (l1SliceCache.size >= L1_MAX_ENTRIES) {
    const oldest = l1SliceCache.keys().next().value;
    if (!oldest) break;
    l1SliceCache.delete(oldest);
  }
  l1SliceCache.set(entry.cacheKey, entry);
}

export function peekMemoryAiVtonSlice(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  angleDeg: number;
  effectiveWeather?: EffectiveWeatherMode | null;
  weather?: unknown;
}): CachedAiVtonSlice | null {
  const key = buildAiVtonCacheKey(params);
  const hit = l1SliceCache.get(key);
  if (!hit) return null;
  l1SliceCache.delete(key);
  l1SliceCache.set(key, hit);
  return hit;
}

function openVtonIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (vtonDbPromise) return vtonDbPromise;

  vtonDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(VTON_IDB_NAME, VTON_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VTON_IDB_STORE)) {
          const store = db.createObjectStore(VTON_IDB_STORE, { keyPath: 'cacheKey' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return vtonDbPromise;
}

export async function readCachedAiVtonSlice(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  angleDeg: number;
  effectiveWeather?: EffectiveWeatherMode | null;
  weather?: unknown;
}): Promise<{ slice: CachedAiVtonSlice; layer: 'memory' | 'indexeddb' } | null> {
  const mem = peekMemoryAiVtonSlice(params);
  if (mem) {
    if (!verifiedTransparentCacheKeys.has(mem.cacheKey)) {
      const verifiedUrl = await ensureTransparentCutout(mem.imageUrl);
      markCacheKeyTransparentVerified(mem.cacheKey);
      if (verifiedUrl && verifiedUrl !== mem.imageUrl) {
        const upgradedMem: CachedAiVtonSlice = { ...mem, imageUrl: verifiedUrl };
        await persistAiVtonSlices([upgradedMem]);
        return { slice: upgradedMem, layer: 'memory' };
      }
    }
    return { slice: mem, layer: 'memory' };
  }

  const db = await openVtonIndexedDb();
  if (!db) return null;

  const cacheKey = buildAiVtonCacheKey(params);
  const rawRecord = await new Promise<CachedAiVtonSlice | null>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readonly');
      const req = tx.objectStore(VTON_IDB_STORE).get(cacheKey);
      req.onsuccess = () => {
        const rec = req.result as CachedAiVtonSlice | undefined;
        if (rec && typeof rec.imageUrl === 'string' && rec.imageUrl.startsWith('data:image/')) {
          resolve(rec);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  if (!rawRecord) return null;

  // Enforce 4-corner + enclosed-hole alpha verification guard on ALL cached records
  const verifiedUrl = await ensureTransparentCutout(rawRecord.imageUrl);
  markCacheKeyTransparentVerified(rawRecord.cacheKey);
  if (verifiedUrl && verifiedUrl !== rawRecord.imageUrl) {
    const upgradedRec: CachedAiVtonSlice = {
      ...rawRecord,
      imageUrl: verifiedUrl,
    };
    await persistAiVtonSlices([upgradedRec]);
    return { slice: upgradedRec, layer: 'indexeddb' };
  }

  setL1Slice(rawRecord);
  return { slice: rawRecord, layer: 'indexeddb' };
}

async function persistAiVtonSlices(entries: CachedAiVtonSlice[]): Promise<void> {
  for (const entry of entries) {
    setL1Slice(entry);
  }
  const db = await openVtonIndexedDb();
  if (!db || entries.length === 0) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VTON_IDB_STORE);
      for (const entry of entries) {
        store.put(entry);
      }

      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = countReq.result - L2_MAX_ENTRIES;
        if (excess > 0) {
          const idx = store.index('updatedAt');
          let deleted = 0;
          const cursorReq = idx.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && deleted < excess) {
              cursor.delete();
              deleted += 1;
              cursor.continue();
            }
          };
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function isSupportedHistoryCacheKey(cacheKey?: string | null): boolean {
  if (!cacheKey || typeof cacheKey !== 'string') return false;
  if (cacheKey.startsWith(`${CUTOUT_PIPELINE_VERSION}::`)) return true;
  return LEGACY_CUTOUT_PIPELINE_VERSIONS.some((legacyVer) =>
    cacheKey.startsWith(`${legacyVer}::`)
  );
}

export async function listCachedAiVtonOutfits(limit = 120): Promise<AiVtonHistoryEntry[]> {
  const allRecords: CachedAiVtonSlice[] = [];
  const seenKeys = new Set<string>();

  for (const memSlice of l1SliceCache.values()) {
    if (
      isSupportedHistoryCacheKey(memSlice?.cacheKey) &&
      memSlice.imageUrl?.startsWith('data:image/')
    ) {
      seenKeys.add(memSlice.cacheKey);
      allRecords.push(memSlice);
    }
  }

  const db = await openVtonIndexedDb();
  if (db) {
    const dbRecords = await new Promise<CachedAiVtonSlice[]>((resolve) => {
      try {
        const tx = db.transaction(VTON_IDB_STORE, 'readonly');
        const req = tx.objectStore(VTON_IDB_STORE).getAll();
        req.onsuccess = () =>
          resolve(Array.isArray(req.result) ? (req.result as CachedAiVtonSlice[]) : []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    for (const rec of dbRecords) {
      if (
        isSupportedHistoryCacheKey(rec?.cacheKey) &&
        !seenKeys.has(rec.cacheKey) &&
        rec.imageUrl?.startsWith('data:image/')
      ) {
        seenKeys.add(rec.cacheKey);
        allRecords.push(rec);
        setL1Slice(rec);
      }
    }
  }

  // Sort oldest-to-newest before grouping so newer V4 slices always win over older V3 slices
  allRecords.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

  const grouped = new Map<string, AiVtonHistoryEntry>();
  for (const rec of allRecords) {
    const ew: EffectiveWeatherMode = rec.effectiveWeather || 'clear';
    const groupKey = `${rec.avatarConfigHash}::${rec.outfitComboId}::${rec.styleMode}::${ew}`;
    let group = grouped.get(groupKey);
    if (!group) {
      const labels = Array.isArray(rec.garmentLabels) ? rec.garmentLabels.filter(Boolean) : [];
      group = {
        groupKey,
        avatarConfigHash: rec.avatarConfigHash,
        outfitComboId: rec.outfitComboId,
        styleMode: rec.styleMode,
        effectiveWeather: ew,
        outfitLabel:
          rec.outfitLabel ||
          (labels.length > 0 ? labels.slice(0, 2).join(' · ') : '저장된 AI 피팅'),
        garmentLabels: labels,
        ...(rec.slotGarmentIds ? { slotGarmentIds: { ...rec.slotGarmentIds } } : {}),
        equippedCount: rec.equippedCount || labels.length || 1,
        thumbnailUrl: rec.imageUrl,
        angleSlices: {},
        availableAngles: [],
        updatedAt: rec.updatedAt || 0,
      };
      grouped.set(groupKey, group);
    }

    group.angleSlices[rec.angleDeg] = rec.imageUrl;
    if (!group.availableAngles.includes(rec.angleDeg)) {
      group.availableAngles.push(rec.angleDeg);
      group.availableAngles.sort((a, b) => a - b);
    }
    if ((rec.updatedAt || 0) >= group.updatedAt) {
      group.updatedAt = rec.updatedAt || group.updatedAt;
      if (rec.outfitLabel) group.outfitLabel = rec.outfitLabel;
      if (Array.isArray(rec.garmentLabels) && rec.garmentLabels.length > 0) {
        group.garmentLabels = rec.garmentLabels;
      }
      if (rec.slotGarmentIds && Object.keys(rec.slotGarmentIds).length > 0) {
        group.slotGarmentIds = { ...rec.slotGarmentIds };
      }
    }
    group.thumbnailUrl =
      group.angleSlices[0] || group.angleSlices[45] || group.thumbnailUrl || rec.imageUrl;
  }

  return [...grouped.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, limit));
}

export async function deleteCachedAiVtonOutfit(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  effectiveWeather?: EffectiveWeatherMode | null;
}): Promise<void> {
  const weatherModesToClear: EffectiveWeatherMode[] = params.effectiveWeather
    ? [params.effectiveWeather]
    : ['clear', 'cloudy', 'rain', 'snow', 'wind', 'heatwave', 'coldwave'];
  const allVersions = [CUTOUT_PIPELINE_VERSION, ...LEGACY_CUTOUT_PIPELINE_VERSIONS];

  const keysToDelete: string[] = [];
  for (const ver of allVersions) {
    for (const ew of weatherModesToClear) {
      for (const angleDeg of TURNAROUND_ANGLES) {
        keysToDelete.push(
          `${ver}::${params.avatarConfigHash}::${params.outfitComboId}::${params.styleMode}::${ew}::${angleDeg}`
        );
      }
    }
  }

  for (const key of keysToDelete) {
    l1SliceCache.delete(key);
  }

  const db = await openVtonIndexedDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VTON_IDB_STORE);
      for (const key of keysToDelete) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export interface TouchingTwinSplitResult {
  modified: boolean;
  keptSide: 'left' | 'right' | null;
  valleyX: number | null;
  keptBounds: { minX: number; maxX: number } | null;
}

function sampleSliceCornerBackdrop(
  data: Uint8ClampedArray,
  cw: number,
  ch: number
): { alreadyTransparent: boolean; bgR: number; bgG: number; bgB: number } {
  const rSamples: number[] = [];
  const gSamples: number[] = [];
  const bSamples: number[] = [];
  let transparentCornerSamples = 0;
  let totalCornerSamples = 0;
  const patch = Math.max(2, Math.min(8, Math.floor(Math.min(cw, ch) * 0.06)));
  const cornerCoords = [
    [1, 1],
    [cw - patch - 1, 1],
    [1, ch - patch - 1],
    [cw - patch - 1, ch - patch - 1],
  ];
  for (const [cx, cy] of cornerCoords) {
    for (let dy = 0; dy < patch; dy += 2) {
      for (let dx = 0; dx < patch; dx += 2) {
        const idx = ((cy + dy) * cw + (cx + dx)) * 4;
        totalCornerSamples += 1;
        if (data[idx + 3] < 24) {
          transparentCornerSamples += 1;
        } else {
          rSamples.push(data[idx]);
          gSamples.push(data[idx + 1]);
          bSamples.push(data[idx + 2]);
        }
      }
    }
  }
  const alreadyTransparent =
    totalCornerSamples > 0 && transparentCornerSamples / totalCornerSamples >= 0.5;
  rSamples.sort((a, b) => a - b);
  gSamples.sort((a, b) => a - b);
  bSamples.sort((a, b) => a - b);
  const midIdx = Math.floor(rSamples.length / 2);
  return {
    alreadyTransparent,
    bgR: rSamples[midIdx] ?? 148,
    bgG: gSamples[midIdx] ?? 163,
    bgB: bSamples[midIdx] ?? 184,
  };
}

/**
 * Multi-Head / Touching-Twin Seam Splitter:
 * When two adjacent side-by-side figures touch at mid-body sleeves/coats (`mergedWidth > 0.46 * cw`),
 * inspects the upper head-crown band (`subjectTopY .. subjectTopY + 0.22 * subjectHeight`) and
 * lower-leg band (`subjectTopY + 0.68 * subjectHeight .. subjectBottomY`). If 2+ realistic head
 * clusters (`width <= 0.28 * cw` each, ruling out wide overhead umbrellas) are separated by a
 * genuine near-zero vertical valley (`alpha == 0` / pure backdrop through `0..0.18 * subjectHeight`
 * at `valleyX`), computes the minimum-alpha vertical DP seam `x*(y)` (`±1 px/row` within
 * `[valleyX - 0.08*cw, valleyX + 0.08*cw]`) and wipes the secondary twin's side of `x*(y)`.
 */
export function splitTouchingTwinSilhouettesInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number
): TouchingTwinSplitResult {
  if (cw < 64 || ch < 64 || data.length < cw * ch * 4) {
    return { modified: false, keptSide: null, valleyX: null, keptBounds: null };
  }

  const { alreadyTransparent, bgR, bgG, bgB } = sampleSliceCornerBackdrop(data, cw, ch);

  const isFgPixel = (idx: number): boolean => {
    const a = data[idx + 3];
    if (alreadyTransparent) {
      return a > 32;
    }
    if (a <= 40) return false;
    const diff =
      Math.abs(data[idx] - bgR) +
      Math.abs(data[idx + 1] - bgG) +
      Math.abs(data[idx + 2] - bgB);
    return diff > 36;
  };

  const isPureValleyPixel = (idx: number): boolean => {
    const a = data[idx + 3];
    if (alreadyTransparent) {
      return a === 0;
    }
    if (a === 0) return true;
    const diff =
      Math.abs(data[idx] - bgR) +
      Math.abs(data[idx + 1] - bgG) +
      Math.abs(data[idx + 2] - bgB);
    return diff <= 28;
  };

  const seamForegroundCost = (idx: number): number => {
    const a = data[idx + 3];
    if (alreadyTransparent) {
      return a;
    }
    if (a <= 16) return 0;
    const diff =
      Math.abs(data[idx] - bgR) +
      Math.abs(data[idx + 1] - bgG) +
      Math.abs(data[idx + 2] - bgB);
    return diff <= 28 ? 0 : Math.min(255, diff);
  };

  let subjectTopY = ch;
  let subjectBottomY = -1;
  let subjectMinX = cw;
  let subjectMaxX = -1;
  for (let y = 0; y < ch; y += 1) {
    const rowOff = y * cw;
    for (let x = 0; x < cw; x += 1) {
      if (isFgPixel((rowOff + x) * 4)) {
        if (y < subjectTopY) subjectTopY = y;
        if (y > subjectBottomY) subjectBottomY = y;
        if (x < subjectMinX) subjectMinX = x;
        if (x > subjectMaxX) subjectMaxX = x;
      }
    }
  }

  const subjectHeight = subjectBottomY - subjectTopY + 1;
  const subjectWidth = subjectMaxX - subjectMinX + 1;
  if (
    subjectBottomY < subjectTopY ||
    subjectHeight < ch * 0.34 ||
    subjectWidth <= cw * 0.46
  ) {
    return { modified: false, keptSide: null, valleyX: null, keptBounds: null };
  }

  interface HeadSpan {
    start: number;
    end: number;
    mass: number;
  }

  const legY0 = Math.min(ch - 1, Math.round(subjectTopY + 0.68 * subjectHeight));
  const legY1 = subjectBottomY;
  const minHeadW = Math.max(6, Math.round(cw * 0.06));
  const maxHeadW = Math.ceil(cw * 0.28);
  const headGapBridge = Math.max(2, Math.round(cw * 0.012));
  const minValleyWidth = Math.max(4, Math.round(cw * 0.035));
  const minHeadCenterDist = cw * 0.22;

  let chosenPair: {
    leftHead: HeadSpan;
    rightHead: HeadSpan;
    valleyX: number;
    strictCrownY1: number;
  } | null = null;

  // Check pure 7.5-head cranium/face band (0..0.13*H, strictly above shoulder/coat contact!)
  // first, then fall back to 0..0.22*H if two unequal-height figures touch lower at mid-torso.
  const crownBands: ReadonlyArray<{ bandEndFrac: number; strictZeroFrac: number }> = [
    { bandEndFrac: 0.13, strictZeroFrac: 0.125 },
    { bandEndFrac: 0.22, strictZeroFrac: 0.18 },
  ];

  for (const { bandEndFrac, strictZeroFrac } of crownBands) {
    const headY0 = subjectTopY;
    const headY1 = Math.min(ch - 1, Math.round(subjectTopY + bandEndFrac * subjectHeight));
    const bandStrictCrownY1 = Math.min(
      ch - 1,
      Math.round(subjectTopY + strictZeroFrac * subjectHeight)
    );
    const headRows = Math.max(1, headY1 - headY0 + 1);

    const headDensity = new Float32Array(cw);
    for (let x = 0; x < cw; x += 1) {
      let fg = 0;
      for (let y = headY0; y <= headY1; y += 1) {
        if (isFgPixel((y * cw + x) * 4)) fg += 1;
      }
      headDensity[x] = fg / headRows;
    }

    const rawHeads: HeadSpan[] = [];
    let inHead = false;
    let hStart = 0;
    let hGap = 0;
    for (let x = 0; x < cw; x += 1) {
      if (headDensity[x] > 0.08) {
        if (!inHead) {
          inHead = true;
          hStart = x;
        }
        hGap = 0;
      } else if (inHead) {
        hGap += 1;
        if (hGap > headGapBridge) {
          rawHeads.push({ start: hStart, end: x - hGap, mass: 0 });
          inHead = false;
          hGap = 0;
        }
      }
    }
    if (inHead) {
      rawHeads.push({ start: hStart, end: cw - 1 - hGap, mass: 0 });
    }

    let sawWideCanopy = false;
    for (const hSpan of rawHeads) {
      const wSpan = hSpan.end - hSpan.start + 1;
      // Guard: wide continuous upper canopy (> 0.34 * cw) in top crown band is an overhead rain umbrella!
      if (bandEndFrac <= 0.14 && wSpan > Math.ceil(cw * 0.34)) {
        return { modified: false, keptSide: null, valleyX: null, keptBounds: null };
      }
      if (wSpan > Math.ceil(cw * 0.34)) {
        sawWideCanopy = true;
        break;
      }
      let m = 0;
      for (let x = hSpan.start; x <= hSpan.end; x += 1) {
        m += headDensity[x];
      }
      hSpan.mass = m;
    }
    if (sawWideCanopy) continue;

    const headClusters = rawHeads.filter((hSpan) => {
      const wSpan = hSpan.end - hSpan.start + 1;
      return wSpan >= minHeadW && wSpan <= maxHeadW;
    });
    if (headClusters.length < 2) continue;

    for (let i = 0; i < headClusters.length - 1; i += 1) {
      const leftHead = headClusters[i];
      const rightHead = headClusters[i + 1];
      const leftCenter = (leftHead.start + leftHead.end) * 0.5;
      const rightCenter = (rightHead.start + rightHead.end) * 0.5;
      if (rightCenter - leftCenter < minHeadCenterDist) continue;

      const vStart = leftHead.end + 1;
      const vEnd = rightHead.start - 1;
      if (vEnd - vStart + 1 < minValleyWidth) continue;

      let bestRunStart = -1;
      let bestRunEnd = -1;
      let curStart = -1;
      for (let x = vStart; x <= vEnd; x += 1) {
        if (headDensity[x] <= 0.08) {
          if (curStart < 0) curStart = x;
          if (x - curStart > bestRunEnd - bestRunStart) {
            bestRunStart = curStart;
            bestRunEnd = x;
          }
        } else {
          curStart = -1;
        }
      }
      if (bestRunStart < 0 || bestRunEnd - bestRunStart + 1 < minValleyWidth) continue;

      const midValley = Math.round((bestRunStart + bestRunEnd) * 0.5);
      let cleanValleyX = -1;
      for (let offset = 0; offset <= bestRunEnd - bestRunStart; offset += 1) {
        const candidates =
          offset === 0 ? [midValley] : [midValley - offset, midValley + offset];
        for (const cxCandidate of candidates) {
          if (cxCandidate < bestRunStart || cxCandidate > bestRunEnd) continue;
          let allZeroInCrown = true;
          for (let y = subjectTopY; y <= bandStrictCrownY1; y += 1) {
            if (!isPureValleyPixel((y * cw + cxCandidate) * 4)) {
              allZeroInCrown = false;
              break;
            }
          }
          if (allZeroInCrown) {
            cleanValleyX = cxCandidate;
            break;
          }
        }
        if (cleanValleyX >= 0) break;
      }
      if (cleanValleyX < 0) continue;

      // Confirm both sides also carry lower-leg silhouette mass in [0.68..1.00 * subjectHeight]
      let leftLegPx = 0;
      let rightLegPx = 0;
      const minLegPx = Math.max(8, Math.round((legY1 - legY0 + 1) * 2));
      for (let y = legY0; y <= legY1; y += 1) {
        const rOff = y * cw;
        for (
          let x = Math.max(0, leftHead.start - Math.round(cw * 0.14));
          x < cleanValleyX;
          x += 1
        ) {
          if (isFgPixel((rOff + x) * 4)) leftLegPx += 1;
        }
        for (
          let x = cleanValleyX + 1;
          x <= Math.min(cw - 1, rightHead.end + Math.round(cw * 0.14));
          x += 1
        ) {
          if (isFgPixel((rOff + x) * 4)) rightLegPx += 1;
        }
      }
      if (leftLegPx < minLegPx || rightLegPx < minLegPx) continue;

      chosenPair = {
        leftHead,
        rightHead,
        valleyX: cleanValleyX,
        strictCrownY1: bandStrictCrownY1,
      };
      break;
    }

    if (chosenPair) break;
  }

  if (!chosenPair) {
    return { modified: false, keptSide: null, valleyX: null, keptBounds: null };
  }

  const { leftHead, rightHead, valleyX, strictCrownY1 } = chosenPair;

  // Score primary vs secondary twin using full-height body mass weighted by proximity to slice center
  let leftBodyMass = 0;
  let rightBodyMass = 0;
  for (let y = subjectTopY; y <= subjectBottomY; y += 2) {
    const rOff = y * cw;
    for (let x = 0; x < valleyX; x += 1) {
      if (isFgPixel((rOff + x) * 4)) leftBodyMass += 1;
    }
    for (let x = valleyX + 1; x < cw; x += 1) {
      if (isFgPixel((rOff + x) * 4)) rightBodyMass += 1;
    }
  }
  const leftHeadCenter = (leftHead.start + leftHead.end) * 0.5;
  const rightHeadCenter = (rightHead.start + rightHead.end) * 0.5;
  const leftCenterDistNorm = Math.abs(leftHeadCenter - cw * 0.5) / (cw * 0.5);
  const rightCenterDistNorm = Math.abs(rightHeadCenter - cw * 0.5) / (cw * 0.5);
  const leftScore = leftBodyMass * (1 - 0.42 * leftCenterDistNorm);
  const rightScore = rightBodyMass * (1 - 0.42 * rightCenterDistNorm);
  const keptSide: 'left' | 'right' = leftScore >= rightScore ? 'left' : 'right';

  // Dynamic Programming minimum-alpha vertical seam x*(y) within [valleyX - 0.08*cw, valleyX + 0.08*cw]
  const bandHalf = Math.max(4, Math.round(cw * 0.08));
  const seamMinX = Math.max(1, valleyX - bandHalf);
  const seamMaxX = Math.min(cw - 2, valleyX + bandHalf);
  const bandW = seamMaxX - seamMinX + 1;
  const backtrack = new Int8Array(ch * bandW);
  let prevCost = new Float64Array(bandW);
  let currCost = new Float64Array(bandW);

  for (let bx = 0; bx < bandW; bx += 1) {
    const x = seamMinX + bx;
    prevCost[bx] = seamForegroundCost(x * 4) * 12 + Math.abs(x - valleyX) * 30;
  }

  for (let y = 1; y < ch; y += 1) {
    const rowOff = y * cw;
    const crownTether = y <= strictCrownY1 ? 28 : 1.25;
    for (let bx = 0; bx < bandW; bx += 1) {
      let bestPrevBx = bx;
      let bestPrevVal = prevCost[bx];
      if (bx > 0 && prevCost[bx - 1] + 1.5 < bestPrevVal) {
        bestPrevVal = prevCost[bx - 1] + 1.5;
        bestPrevBx = bx - 1;
      }
      if (bx + 1 < bandW && prevCost[bx + 1] + 1.5 < bestPrevVal) {
        bestPrevVal = prevCost[bx + 1] + 1.5;
        bestPrevBx = bx + 1;
      }
      const x = seamMinX + bx;
      const pxCost =
        seamForegroundCost((rowOff + x) * 4) * 12 + Math.abs(x - valleyX) * crownTether;
      currCost[bx] = bestPrevVal + pxCost;
      backtrack[y * bandW + bx] = bestPrevBx - bx;
    }
    const tmp = prevCost;
    prevCost = currCost;
    currCost = tmp;
  }

  let endBx = 0;
  let minEndCost = prevCost[0];
  for (let bx = 1; bx < bandW; bx += 1) {
    if (prevCost[bx] < minEndCost) {
      minEndCost = prevCost[bx];
      endBx = bx;
    }
  }

  const seamX = new Int32Array(ch);
  let traceBx = endBx;
  for (let y = ch - 1; y >= 0; y -= 1) {
    seamX[y] = seamMinX + traceBx;
    if (y > 0) {
      traceBx += backtrack[y * bandW + traceBx];
    }
  }

  // Zero out RGBA (or restore solid backdrop if pre-cutout) on the secondary twin's side of seamX[y]
  let keptMinX = cw;
  let keptMaxX = -1;
  for (let y = 0; y < ch; y += 1) {
    const rowOff = y * cw;
    const cutX = seamX[y];
    if (keptSide === 'left') {
      for (let x = cutX; x < cw; x += 1) {
        const pIdx = (rowOff + x) * 4;
        if (alreadyTransparent) {
          data[pIdx] = 0;
          data[pIdx + 1] = 0;
          data[pIdx + 2] = 0;
          data[pIdx + 3] = 0;
        } else {
          data[pIdx] = bgR;
          data[pIdx + 1] = bgG;
          data[pIdx + 2] = bgB;
          data[pIdx + 3] = 255;
        }
      }
      for (let x = 0; x < cutX; x += 1) {
        if (isFgPixel((rowOff + x) * 4)) {
          if (x < keptMinX) keptMinX = x;
          if (x > keptMaxX) keptMaxX = x;
        }
      }
    } else {
      for (let x = 0; x <= cutX; x += 1) {
        const pIdx = (rowOff + x) * 4;
        if (alreadyTransparent) {
          data[pIdx] = 0;
          data[pIdx + 1] = 0;
          data[pIdx + 2] = 0;
          data[pIdx + 3] = 0;
        } else {
          data[pIdx] = bgR;
          data[pIdx + 1] = bgG;
          data[pIdx + 2] = bgB;
          data[pIdx + 3] = 255;
        }
      }
      for (let x = cutX + 1; x < cw; x += 1) {
        if (isFgPixel((rowOff + x) * 4)) {
          if (x < keptMinX) keptMinX = x;
          if (x > keptMaxX) keptMaxX = x;
        }
      }
    }
  }

  return {
    modified: true,
    keptSide,
    valleyX,
    keptBounds: keptMaxX >= keptMinX ? { minX: keptMinX, maxX: keptMaxX } : null,
  };
}

/**
 * Pure raster single-subject isolator for VTON turnaround quadrants.
 * Detects if Gemini accidentally rendered 2 side-by-side twin/duplicate models inside a slice
 * (either disconnected OR touching across sleeves/coats via `splitTouchingTwinSilhouettesInBuffer`)
 * and cleanly isolates & centers the single primary figure while preserving RGBA transparency.
 */
export function isolateSingleSubjectInSlice(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const cw = srcCanvas.width;
  const ch = srcCanvas.height;
  if (cw < 80 || ch < 72) return srcCanvas;

  const ctx = srcCanvas.getContext('2d');
  if (!ctx) return srcCanvas;

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, cw, ch);
  } catch {
    return srcCanvas;
  }
  const data = imgData.data;

  const { alreadyTransparent, bgR, bgG, bgB } = sampleSliceCornerBackdrop(data, cw, ch);

  const yStart = Math.floor(ch * 0.08);
  const yEnd = Math.max(yStart + 1, Math.floor(ch * 0.92));
  const bandH = yEnd - yStart;
  const rawColFg = new Float32Array(cw);

  for (let x = 0; x < cw; x += 1) {
    let fgCount = 0;
    for (let y = yStart; y < yEnd; y += 2) {
      const idx = (y * cw + x) * 4;
      const alpha = data[idx + 3];
      if (alreadyTransparent) {
        if (alpha > 40) fgCount += 1;
      } else if (alpha > 40) {
        const diff =
          Math.abs(data[idx] - bgR) +
          Math.abs(data[idx + 1] - bgG) +
          Math.abs(data[idx + 2] - bgB);
        if (diff > 36) fgCount += 1;
      }
    }
    rawColFg[x] = fgCount / Math.max(1, Math.ceil(bandH / 2));
  }

  // 3-px box smoothing
  const colFg = new Float32Array(cw);
  for (let x = 0; x < cw; x += 1) {
    const prev = rawColFg[Math.max(0, x - 1)];
    const next = rawColFg[Math.min(cw - 1, x + 1)];
    colFg[x] = (prev + rawColFg[x] + next) / 3;
  }

  interface FgRun {
    start: number;
    end: number;
    mass: number;
    peak: number;
  }
  const rawRuns: FgRun[] = [];
  let inRun = false;
  let runStart = 0;
  for (let x = 0; x < cw; x += 1) {
    if (colFg[x] >= 0.055) {
      if (!inRun) {
        inRun = true;
        runStart = x;
      }
    } else if (inRun) {
      rawRuns.push({ start: runStart, end: x - 1, mass: 0, peak: 0 });
      inRun = false;
    }
  }
  if (inRun) {
    rawRuns.push({ start: runStart, end: cw - 1, mass: 0, peak: 0 });
  }
  if (rawRuns.length === 0) return srcCanvas;

  // Merge tiny intra-body gaps (e.g., arm-to-waist space <= 3% of slice width)
  const maxIntraGap = Math.max(2, Math.round(cw * 0.03));
  const merged: FgRun[] = [rawRuns[0]];
  for (let i = 1; i < rawRuns.length; i += 1) {
    const prev = merged[merged.length - 1];
    const cur = rawRuns[i];
    if (cur.start - prev.end <= maxIntraGap) {
      prev.end = cur.end;
    } else {
      merged.push(cur);
    }
  }

  let maxMass = 0;
  for (const run of merged) {
    let mass = 0;
    let peak = 0;
    for (let x = run.start; x <= run.end; x += 1) {
      mass += colFg[x];
      if (colFg[x] > peak) peak = colFg[x];
    }
    run.mass = mass;
    run.peak = peak;
    if (mass > maxMass) maxMass = mass;
  }

  const humanIslands = merged.filter(
    (r) => r.end - r.start + 1 >= cw * 0.1 && r.peak >= 0.16 && r.mass >= maxMass * 0.38
  );
  if (humanIslands.length === 1 && merged.length >= 2) {
    const primary = humanIslands[0];
    let wipedNarrowArtifact = false;
    for (const run of merged) {
      if (run === primary) continue;
      const runW = run.end - run.start + 1;
      const separatedLeft = run.end <= primary.start - 4;
      const separatedRight = run.start >= primary.end + 4;
      if (runW <= Math.max(12, Math.round(cw * 0.055)) && (separatedLeft || separatedRight)) {
        const wipeX0 = Math.max(0, run.start - 1);
        const wipeX1 = Math.min(cw - 1, run.end + 1);
        for (let y = 0; y < ch; y += 1) {
          for (let x = wipeX0; x <= wipeX1; x += 1) {
            const pIdx = (y * cw + x) * 4;
            if (alreadyTransparent) {
              data[pIdx + 3] = 0;
            } else {
              data[pIdx] = bgR;
              data[pIdx + 1] = bgG;
              data[pIdx + 2] = bgB;
              data[pIdx + 3] = 255;
            }
          }
        }
        wipedNarrowArtifact = true;
      }
    }
    if (wipedNarrowArtifact) {
      ctx.putImageData(imgData, 0, 0);
    }
  }

  const tryRecenterTouchingTwinSplit = (): HTMLCanvasElement => {
    const primarySpanW =
      humanIslands.length === 1
        ? humanIslands[0].end - humanIslands[0].start + 1
        : merged[0].end - merged[0].start + 1;
    if (primarySpanW <= cw * 0.46) {
      return srcCanvas;
    }
    const splitRes = splitTouchingTwinSilhouettesInBuffer(data, cw, ch);
    if (!splitRes.modified || !splitRes.keptBounds) {
      return srcCanvas;
    }
    ctx.putImageData(imgData, 0, 0);
    if (typeof document === 'undefined') return srcCanvas;

    const keptW = splitRes.keptBounds.maxX - splitRes.keptBounds.minX + 1;
    const padX = Math.max(6, Math.round(keptW * 0.22));
    const sx = Math.max(0, splitRes.keptBounds.minX - padX);
    const ex = Math.min(cw, splitRes.keptBounds.maxX + 1 + padX);
    const subW = Math.max(16, ex - sx);
    const outW = Math.max(subW, Math.min(cw, Math.round(ch * 0.82)));

    const cleanCanvas = document.createElement('canvas');
    cleanCanvas.width = outW;
    cleanCanvas.height = ch;
    const cleanCtx = cleanCanvas.getContext('2d');
    if (!cleanCtx) return srcCanvas;

    cleanCtx.clearRect(0, 0, outW, ch);
    if (!alreadyTransparent) {
      cleanCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      cleanCtx.fillRect(0, 0, outW, ch);
    }
    const dx = Math.round((outW - subW) * 0.5);
    cleanCtx.drawImage(srcCanvas, sx, 0, subW, ch, dx, 0, subW, ch);
    return cleanCanvas;
  };

  if (humanIslands.length < 2) {
    return tryRecenterTouchingTwinSplit();
  }

  // Verify genuine background valley between adjacent human islands
  let hasTrueSeparation = false;
  for (let i = 0; i < humanIslands.length - 1; i += 1) {
    const gapStart = humanIslands[i].end + 1;
    const gapEnd = humanIslands[i + 1].start - 1;
    if (gapEnd - gapStart + 1 >= Math.max(4, Math.round(cw * 0.035))) {
      let minVal = 1;
      for (let gx = gapStart; gx <= gapEnd; gx += 1) {
        if (colFg[gx] < minVal) minVal = colFg[gx];
      }
      if (minVal <= 0.03) {
        hasTrueSeparation = true;
        break;
      }
    }
  }
  if (!hasTrueSeparation) {
    return tryRecenterTouchingTwinSplit();
  }

  // Pick the primary model closest to center weighted by silhouette mass
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < humanIslands.length; i += 1) {
    const isl = humanIslands[i];
    const center = (isl.start + isl.end) * 0.5;
    const centerDistNorm = Math.abs(center - cw * 0.5) / (cw * 0.5);
    const score = isl.mass * (1 - 0.3 * centerDistNorm);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const best = humanIslands[bestIdx];
  const minSafeX =
    bestIdx > 0
      ? Math.floor((humanIslands[bestIdx - 1].end + best.start) * 0.5)
      : 0;
  const maxSafeX =
    bestIdx < humanIslands.length - 1
      ? Math.ceil((best.end + 1 + humanIslands[bestIdx + 1].start) * 0.5)
      : cw;

  const islandW = best.end - best.start + 1;
  const padX = Math.max(6, Math.round(islandW * 0.22));
  const sx = Math.max(minSafeX, best.start - padX);
  const ex = Math.min(maxSafeX, best.end + 1 + padX);
  const subW = Math.max(16, ex - sx);
  const outW = Math.max(subW, Math.min(cw, Math.round(ch * 0.82)));

  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = outW;
  cleanCanvas.height = ch;
  const cleanCtx = cleanCanvas.getContext('2d');
  if (!cleanCtx) return srcCanvas;

  cleanCtx.clearRect(0, 0, outW, ch);
  if (!alreadyTransparent) {
    cleanCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    cleanCtx.fillRect(0, 0, outW, ch);
  }
  const dx = Math.round((outW - subW) * 0.5);
  cleanCtx.drawImage(srcCanvas, sx, 0, subW, ch, dx, 0, subW, ch);
  return cleanCanvas;
}

export function measureOpaqueVerticalBoundsInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number
): { minY: number; maxY: number; minX: number; maxX: number; fgPixels: number } | null {
  if (cw < 16 || ch < 16 || data.length < cw * ch * 4) return null;
  let minY = ch;
  let maxY = -1;
  let minX = cw;
  let maxX = -1;
  let fgPixels = 0;

  for (let y = 0; y < ch; y += 1) {
    const rowOff = y * cw;
    for (let x = 0; x < cw; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        fgPixels += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (fgPixels < 16 || maxY < minY) return null;
  return { minY, maxY, minX, maxX, fgPixels };
}

/**
 * Computes the horizontal standing center axis of the human body from the lower-calf/ankle
 * column (`0.78..0.92` of subject height), so asymmetric side props (wide umbrellas or
 * briefcases/totes) and forward-protruding 90-degree shoes (`0.93..1.00`) never pull the
 * character off-center.
 */
export function computeCoreAnatomicalCenterXInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number,
  bounds?: { minY: number; maxY: number; minX: number; maxX: number } | null
): number {
  const b = bounds ?? measureOpaqueVerticalBoundsInBuffer(data, cw, ch);
  if (!b) return cw * 0.5;
  const fgH = Math.max(1, b.maxY - b.minY + 1);
  const yStart = Math.max(b.minY, Math.round(b.minY + fgH * 0.78));
  const yEnd = Math.min(ch - 1, Math.max(yStart, Math.round(b.minY + fgH * 0.92)));
  const rowCenters: number[] = [];

  for (let y = yStart; y <= yEnd; y += 1) {
    const rowOff = y * cw;
    // Collect contiguous opaque runs on this row so isolated single-pixel specks can't bias rMin/rMax
    const runs: Array<{ start: number; end: number; width: number }> = [];
    let runStart = -1;
    for (let x = b.minX; x <= b.maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        if (runStart === -1) runStart = x;
      } else if (runStart !== -1) {
        runs.push({ start: runStart, end: x - 1, width: x - runStart });
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      runs.push({ start: runStart, end: b.maxX, width: b.maxX - runStart + 1 });
    }
    const validRuns = runs.filter((r) => r.width >= 3);
    const chosen = validRuns.length > 0 ? validRuns : runs;
    if (chosen.length > 0) {
      const rMin = chosen[0].start;
      const rMax = chosen[chosen.length - 1].end;
      rowCenters.push((rMin + rMax) * 0.5);
    }
  }

  if (rowCenters.length === 0) {
    return b.minX + (b.maxX - b.minX + 1) * 0.5;
  }
  rowCenters.sort((a, z) => a - z);
  return rowCenters[Math.floor(rowCenters.length / 2)];
}

export type TurnaroundSliceIntegrityReason =
  | 'ok'
  | 'too_small'
  | 'clipped_top'
  | 'clipped_bottom'
  | 'half_body';

export interface TurnaroundSliceIntegrityReport {
  ok: boolean;
  reason: TurnaroundSliceIntegrityReason;
  fgHeightRatio: number;
}

/**
 * Inspects a cut-out slice RGBA buffer for half-body / waist-up generation (`image_78da260b.png`)
 * or headless / lower-body-only slicing (`image_19c6d0f0.png`, `image_f651a252.png`),
 * including vertically baseline-shifted crops where the waist cut moved down inside the canvas.
 */
export function inspectTurnaroundSliceIntegrityInBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number
): TurnaroundSliceIntegrityReport {
  const b = measureOpaqueVerticalBoundsInBuffer(data, w, h);
  if (!b) {
    return { ok: false, reason: 'too_small', fgHeightRatio: 0 };
  }
  const fgH = b.maxY - b.minY + 1;
  const fgHeightRatio = fgH / Math.max(1, h);
  if (fgHeightRatio < 0.36 || b.fgPixels < w * h * 0.012) {
    return { ok: false, reason: 'too_small', fgHeightRatio };
  }

  const rowCounts = new Int32Array(h);
  const rowSpans = new Int32Array(h);
  let maxRowCount = 0;
  let maxRowSpan = 0;
  const bodyWidths: number[] = [];

  for (let y = b.minY; y <= b.maxY; y += 1) {
    const rowOff = y * w;
    let cnt = 0;
    let rMin = w;
    let rMax = -1;
    for (let x = b.minX; x <= b.maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        cnt += 1;
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    rowCounts[y] = cnt;
    const span = rMax >= rMin ? rMax - rMin + 1 : 0;
    rowSpans[y] = span;
    if (cnt > maxRowCount) maxRowCount = cnt;
    if (span > maxRowSpan) maxRowSpan = span;
    if (span > 0 && y >= b.minY + fgH * 0.25 && y <= b.minY + fgH * 0.85) {
      bodyWidths.push(cnt);
    }
  }

  bodyWidths.sort((a, z) => a - z);
  const medianBodyWidth =
    bodyWidths.length > 0 ? bodyWidths[Math.floor(bodyWidths.length / 2)] : maxRowCount;

  // Check 1A: Clipped-top / headless slice touching canvas top edge (torso/shoulders cut flush at y <= 3)
  const topEdgeCount = Math.max(rowCounts[0] || 0, rowCounts[1] || 0, rowCounts[2] || 0);
  const topCrownCount = rowCounts[b.minY + 1] ?? rowCounts[b.minY] ?? 0;
  if (
    (b.minY <= 2 && topEdgeCount >= Math.max(w * 0.14, medianBodyWidth * 0.52)) ||
    (b.minY <= 3 && topCrownCount >= Math.max(w * 0.18, medianBodyWidth * 0.65))
  ) {
    return { ok: false, reason: 'clipped_top', fgHeightRatio };
  }

  // Check 1B: Vertically shifted flat waist-down / chest-down crop (e.g. shifted down to 0.94 baseline!)
  // Unlike a genuine head or rounded umbrella canopy (which starts narrow at minY and expands smoothly),
  // a truncated torso/waist starts IMMEDIATELY wide and flat at b.minY..b.minY+2 with high solidity.
  const yFlat = Math.min(b.maxY, b.minY + 2);
  const yShoulderProbe = Math.min(b.maxY, b.minY + Math.max(4, Math.round(fgH * 0.14)));
  const topAtMin = rowCounts[b.minY] || 0;
  const topAtFlat = rowCounts[yFlat] || 0;
  const topFlatSpan = Math.max(1, rowSpans[yFlat] || 1);
  const probeBelowWidth = rowCounts[yShoulderProbe] || 0;
  if (
    fgHeightRatio < 0.78 &&
    topAtFlat >= Math.max(w * 0.16, medianBodyWidth * 0.6) &&
    topAtMin >= topAtFlat * 0.68 &&
    topAtFlat / topFlatSpan >= 0.62 &&
    probeBelowWidth <= topAtFlat * 1.45
  ) {
    return { ok: false, reason: 'clipped_top', fgHeightRatio };
  }

  // Check 2: Clipped-bottom (coat/waist sliced flat against y >= h - 3, NOT narrow shoes)
  const botEdgeCount = Math.max(
    rowCounts[h - 1] || 0,
    rowCounts[h - 2] || 0,
    rowCounts[h - 3] || 0
  );
  if (b.maxY >= h - 3 && botEdgeCount >= Math.max(w * 0.2, medianBodyWidth * 0.62)) {
    return { ok: false, reason: 'clipped_bottom', fgHeightRatio };
  }

  // Check 3: Floating half-body / waist-up shot (compact head+torso ending flat around mid-canvas)
  const bottomTrimBandY = Math.max(b.minY, Math.round(b.maxY - fgH * 0.04));
  let maxBottomBarCount = 0;
  for (let y = bottomTrimBandY; y <= b.maxY; y += 1) {
    if (rowCounts[y] > maxBottomBarCount) maxBottomBarCount = rowCounts[y];
  }
  const heightToMedianBodyAspect = fgH / Math.max(1, medianBodyWidth);
  if (
    fgHeightRatio < 0.52 &&
    heightToMedianBodyAspect < 2.15 &&
    maxBottomBarCount >= medianBodyWidth * 0.52
  ) {
    return { ok: false, reason: 'half_body', fgHeightRatio };
  }

  return { ok: true, reason: 'ok', fgHeightRatio };
}

async function inspectCutoutDataUrlIntegrity(
  dataUrl: string
): Promise<TurnaroundSliceIntegrityReport> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) {
    return { ok: true, reason: 'ok', fgHeightRatio: 0.8 };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 16 || h < 16) {
          resolve({ ok: false, reason: 'too_small', fgHeightRatio: 0 });
          return;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
          return;
        }
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const rep = inspectTurnaroundSliceIntegrityInBuffer(rgba, w, h);
        c.width = 0;
        c.height = 0;
        resolve(rep);
      } catch {
        resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
      }
    };
    img.onerror = () => resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
    img.src = dataUrl;
  });
}

async function inspectDataUrlQcMetrics(dataUrl: string): Promise<VtonQcSliceMetrics | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) {
    return null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 16 || h < 16) {
          resolve(null);
          return;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          c.width = 0;
          c.height = 0;
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const metrics = inspectPixelSliceQc(rgba, w, h);
        c.width = 0;
        c.height = 0;
        resolve(metrics);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export const CANONICAL_HUMAN_STATURE_RATIO = 0.72;
export const CANONICAL_FLOOR_BASELINE_RATIO = 0.945;
export const CANONICAL_PORTRAIT_ASPECT_RATIO = 0.75;

export interface CoreHumanVerticalBounds {
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  fgPixels: number;
  coreCx: number;
  humanCrownY: number;
  footSoleY: number;
  hasOverheadProp: boolean;
}

/**
 * Separates the anatomical human crown-to-sole vertical stature (`humanCrownY .. footSoleY`)
 * from overhead props (open rain umbrella canopies) so figures with vs. without umbrellas
 * render at identical physical body height on the stage.
 */
export function detectCoreHumanVerticalBoundsInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number,
  preBounds?: { minY: number; maxY: number; minX: number; maxX: number; fgPixels: number } | null
): CoreHumanVerticalBounds | null {
  const b = preBounds ?? measureOpaqueVerticalBoundsInBuffer(data, cw, ch);
  if (!b) return null;
  const coreCx = computeCoreAnatomicalCenterXInBuffer(data, cw, ch, b);
  const fgH = Math.max(1, b.maxY - b.minY + 1);

  const rowCounts = new Int32Array(ch);
  const rowSpans = new Int32Array(ch);
  const rowMinXs = new Int32Array(ch);
  const rowMaxXs = new Int32Array(ch);
  const bodyWidths: number[] = [];

  for (let y = b.minY; y <= b.maxY; y += 1) {
    const rowOff = y * cw;
    let cnt = 0;
    let rMin = cw;
    let rMax = -1;
    for (let x = b.minX; x <= b.maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        cnt += 1;
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    rowCounts[y] = cnt;
    rowMinXs[y] = rMin;
    rowMaxXs[y] = rMax;
    const span = rMax >= rMin ? rMax - rMin + 1 : 0;
    rowSpans[y] = span;
    if (cnt > 0 && y >= b.minY + fgH * 0.34 && y <= b.minY + fgH * 0.78) {
      bodyWidths.push(cnt);
    }
  }

  bodyWidths.sort((a, z) => a - z);
  const medianBodyWidth =
    bodyWidths.length > 0 ? bodyWidths[Math.floor(bodyWidths.length / 2)] : Math.max(12, cw * 0.18);

  const topSearchEndY = Math.min(b.maxY, Math.round(b.minY + fgH * 0.34));
  const wideThreshold = Math.max(medianBodyWidth * 1.38, cw * 0.32);

  let wideStartY = -1;
  let wideEndY = -1;
  let canopyMaxSpan = 0;
  for (let y = b.minY; y <= topSearchEndY; y += 1) {
    const span = rowSpans[y];
    if (span >= wideThreshold) {
      if (wideStartY === -1) wideStartY = y;
      wideEndY = y;
      if (span > canopyMaxSpan) canopyMaxSpan = span;
    }
  }

  let humanCrownY = b.minY;
  let hasOverheadProp = false;

  if (wideStartY !== -1 && wideEndY >= wideStartY && (wideStartY - b.minY) <= fgH * 0.14) {
    const headSearchLimitY = Math.min(b.maxY, Math.round(b.minY + fgH * 0.38));
    const centerBandHalf = Math.max(8, medianBodyWidth * 0.42);
    let candidateCrownY = -1;

    const getCenterRunOnRow = (y: number): { width: number; hasSideWings: boolean } => {
      const rowOff = y * cw;
      const runs: Array<{ start: number; end: number; width: number }> = [];
      let runStart = -1;
      for (let x = b.minX; x <= b.maxX; x += 1) {
        if (data[(rowOff + x) * 4 + 3] > 48) {
          if (runStart === -1) runStart = x;
        } else if (runStart !== -1) {
          runs.push({ start: runStart, end: x - 1, width: x - runStart });
          runStart = -1;
        }
      }
      if (runStart !== -1) {
        runs.push({ start: runStart, end: b.maxX, width: b.maxX - runStart + 1 });
      }
      if (runs.length === 0) return { width: 0, hasSideWings: false };
      let bestRun = runs[0];
      let bestDist = Infinity;
      for (const r of runs) {
        const mid = (r.start + r.end) * 0.5;
        const containsCenter = coreCx >= r.start - 4 && coreCx <= r.end + 4;
        const dist = containsCenter ? 0 : Math.abs(mid - coreCx);
        if (dist < bestDist) {
          bestDist = dist;
          bestRun = r;
        }
      }
      if (bestDist > centerBandHalf) {
        return { width: 0, hasSideWings: runs.length > 0 };
      }
      const hasOuterWings = runs.some(
        (r) =>
          r !== bestRun &&
          (bestRun.start - r.end >= 2 || r.start - bestRun.end >= 2)
      );
      return { width: bestRun.width, hasSideWings: hasOuterWings };
    };

    // Case 1: Air/shaft gap under canopy dome followed by solid sustained head crown
    let seenShaftOrGap = false;
    for (let y = wideStartY + 1; y <= headSearchLimitY; y += 1) {
      const cnt = rowCounts[y];
      if (cnt <= Math.max(6, medianBodyWidth * 0.24)) {
        seenShaftOrGap = true;
        continue;
      }
      if (seenShaftOrGap) {
        const centerInfo = getCenterRunOnRow(y);
        const minHeadW = Math.max(4, medianBodyWidth * 0.16);
        if (centerInfo.width >= minHeadW) {
          // Verify sustained head below this row (next 2 rows also have center presence)
          const next1 = y + 1 <= headSearchLimitY ? getCenterRunOnRow(y + 1).width >= minHeadW : true;
          const next2 = y + 2 <= headSearchLimitY ? getCenterRunOnRow(y + 2).width >= minHeadW : true;
          if (next1 && next2) {
            candidateCrownY = y;
            break;
          }
        }
      }
    }

    // Case 2: Canopy dome transitions directly into narrow head crown (no air gap)
    if (candidateCrownY === -1 && wideEndY + 1 <= headSearchLimitY) {
      const nextY = wideEndY + 1;
      const nextSpan = rowSpans[nextY];
      if (
        nextSpan > 0 &&
        nextSpan <= Math.min(medianBodyWidth * 0.85, canopyMaxSpan * 0.62)
      ) {
        candidateCrownY = nextY;
      }
    }

    // Case 3: Arched canopy wings hang beside upper head with transparent interior separation
    if (candidateCrownY === -1) {
      for (let y = wideStartY + 1; y <= headSearchLimitY; y += 1) {
        const info = getCenterRunOnRow(y);
        if (
          info.hasSideWings &&
          info.width >= Math.max(4, medianBodyWidth * 0.16) &&
          info.width <= Math.min(medianBodyWidth * 0.78, canopyMaxSpan * 0.52)
        ) {
          candidateCrownY = y;
          break;
        }
      }
    }

    if (
      candidateCrownY > b.minY + 2 &&
      b.maxY - candidateCrownY + 1 >= fgH * 0.62
    ) {
      humanCrownY = candidateCrownY;
      hasOverheadProp = true;
    }
  }

  return {
    ...b,
    coreCx,
    humanCrownY,
    footSoleY: b.maxY,
    hasOverheadProp,
  };
}

export interface UniformStaturePlacement {
  canonicalW: number;
  canonicalH: number;
  scale: number;
  dstW: number;
  dstH: number;
  dstX: number;
  dstY: number;
}

/**
 * Computes exact destination transform placing every generated VTON character onto a locked
 * `3:4` (`0.75`) portrait canvas with unified human crown-to-sole height (`0.72 * H`),
 * anchored soles at `0.945 * H`, and core lower-ankle center X locked to `0.50 * W`.
 */
export function computeUniformStaturePlacement(params: {
  totalW: number;
  totalH: number;
  coreBounds: CoreHumanVerticalBounds;
  targetH?: number;
}): UniformStaturePlacement {
  const { totalW, totalH, coreBounds, targetH } = params;
  const canonicalH = targetH && targetH >= 180 ? Math.round(targetH) : totalH;
  const canonicalW = Math.round(canonicalH * CANONICAL_PORTRAIT_ASPECT_RATIO);
  const targetHumanStature = canonicalH * CANONICAL_HUMAN_STATURE_RATIO;
  const targetFloorY = canonicalH * CANONICAL_FLOOR_BASELINE_RATIO;
  const minTopEdgeY = canonicalH * 0.015;

  const rawHumanH = Math.max(16, coreBounds.footSoleY - coreBounds.humanCrownY + 1);
  const rawFgH = Math.max(16, coreBounds.maxY - coreBounds.minY + 1);
  const rawFgW = Math.max(16, coreBounds.maxX - coreBounds.minX + 1);

  const desiredScale = targetHumanStature / rawHumanH;
  const maxTopSafeScale = (targetFloorY - minTopEdgeY) / rawFgH;
  const maxWidthSafeScale = (canonicalW * 0.94) / rawFgW;
  const scale = clamp(Math.min(desiredScale, maxTopSafeScale, maxWidthSafeScale), 0.48, 1.85);

  const dstW = Math.round(totalW * scale);
  const dstH = Math.round(totalH * scale);
  const rawDstX = canonicalW * 0.5 - coreBounds.coreCx * scale;
  const minSafeDstX = 2 - coreBounds.minX * scale;
  const maxSafeDstX = canonicalW - 3 - coreBounds.maxX * scale;
  const dstX = Math.round(
    minSafeDstX <= maxSafeDstX
      ? clamp(rawDstX, minSafeDstX, maxSafeDstX)
      : canonicalW * 0.5 - (coreBounds.minX + rawFgW * 0.5) * scale
  );
  const dstY = Math.round(targetFloorY - coreBounds.footSoleY * scale);

  return {
    canonicalW,
    canonicalH,
    scale,
    dstW,
    dstH,
    dstX,
    dstY,
  };
}

function measureCoreHumanVerticalBounds(
  canvas: HTMLCanvasElement
): CoreHumanVerticalBounds | null {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 16 || ch < 16) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, cw, ch).data;
  return detectCoreHumanVerticalBoundsInBuffer(data, cw, ch);
}

/**
 * Ensures every sliced turnaround angle (`0°`, `45°`, `90°`, `135°`, `180°`, `225°` or single-angle frame)
 * renders at an identical canonical human stature (`0.72 * H`), grounded on a unified bottom floor baseline
 * (`0.945 * H`), dead-centered on the anatomical lower-ankle spine (`0.50 * W`), and housed inside an
 * exact `3:4` (`0.75`) portrait canvas so umbrellas/briefcases/angles never alter apparent body size.
 */
function normalizeTurnaroundCanvasesToFloorBaseline(
  canvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>>
): void {
  const activeAngles = TURNAROUND_ANGLES.filter((angle) => Boolean(canvases[angle]));
  if (activeAngles.length < 1) return;

  const coreByAngle = {} as Partial<Record<TurnaroundAngleDeg, CoreHumanVerticalBounds | null>>;
  let maxSourceH = 0;

  for (const angle of activeAngles) {
    const c = canvases[angle];
    if (!c || c.width < 16 || c.height < 16) continue;
    const cb = measureCoreHumanVerticalBounds(c);
    coreByAngle[angle] = cb;
    if (cb) {
      maxSourceH = Math.max(maxSourceH, c.height);
    }
  }

  if (maxSourceH < 64) return;
  const targetCanonicalH = maxSourceH >= 180 ? Math.max(720, maxSourceH) : maxSourceH;

  for (const angle of activeAngles) {
    const c = canvases[angle];
    const cb = coreByAngle[angle];
    if (!c || !cb) continue;
    const cw = c.width;
    const ch = c.height;
    if (cw < 16 || ch < 16) continue;

    const placement = computeUniformStaturePlacement({
      totalW: cw,
      totalH: ch,
      coreBounds: cb,
      targetH: targetCanonicalH,
    });

    const scratch = document.createElement('canvas');
    scratch.width = cw;
    scratch.height = ch;
    const sCtx = scratch.getContext('2d');
    const cCtx = c.getContext('2d', { willReadFrequently: true });
    if (!sCtx || !cCtx) {
      scratch.width = 0;
      scratch.height = 0;
      continue;
    }

    sCtx.clearRect(0, 0, cw, ch);
    sCtx.drawImage(c, 0, 0);

    if (c.width !== placement.canonicalW || c.height !== placement.canonicalH) {
      c.width = placement.canonicalW;
      c.height = placement.canonicalH;
    }
    cCtx.clearRect(0, 0, placement.canonicalW, placement.canonicalH);
    cCtx.imageSmoothingEnabled = true;
    cCtx.imageSmoothingQuality = 'high';
    cCtx.drawImage(
      scratch,
      0,
      0,
      cw,
      ch,
      placement.dstX,
      placement.dstY,
      placement.dstW,
      placement.dstH
    );

    scratch.width = 0;
    scratch.height = 0;
  }
}

async function normalizeTurnaroundDataUrlsToFloorBaseline(
  slices: Partial<Record<TurnaroundAngleDeg, string>>
): Promise<void> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const active = TURNAROUND_ANGLES.filter((a) => Boolean(slices[a]));
  if (active.length < 1) return;

  const canvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>> = {};
  await Promise.all(
    active.map(
      (angle) =>
        new Promise<void>((resolve) => {
          const src = slices[angle];
          if (!src) {
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            try {
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              if (w >= 64 && h >= 64) {
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  canvases[angle] = c;
                }
              }
            } catch {
              // ignore broken angle
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  );

  const loaded = TURNAROUND_ANGLES.filter((a) => Boolean(canvases[a]));
  if (loaded.length < 1) return;

  normalizeTurnaroundCanvasesToFloorBaseline(canvases);
  for (const angle of loaded) {
    const c = canvases[angle];
    if (c) {
      slices[angle] = c.toDataURL('image/png');
      c.width = 0;
      c.height = 0;
    }
  }
}

function flipCanvasHorizontallyInPlace(canvas: HTMLCanvasElement): void {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 4 || ch < 4) return;
  const scratch = document.createElement('canvas');
  scratch.width = cw;
  scratch.height = ch;
  const sCtx = scratch.getContext('2d');
  const cCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!sCtx || !cCtx) {
    scratch.width = 0;
    scratch.height = 0;
    return;
  }
  sCtx.drawImage(canvas, 0, 0);
  cCtx.clearRect(0, 0, cw, ch);
  cCtx.save();
  cCtx.translate(cw, 0);
  cCtx.scale(-1, 1);
  cCtx.drawImage(scratch, 0, 0);
  cCtx.restore();
  scratch.width = 0;
  scratch.height = 0;
}

async function flipDataUrlHorizontally(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 8 || h < 8) {
          resolve(dataUrl);
          return;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        flipCanvasHorizontallyInPlace(c);
        const flipped = c.toDataURL('image/png');
        c.width = 0;
        c.height = 0;
        resolve(flipped);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Pre-crop full-sheet divider line eraser: detects thin vertical/horizontal grid lines drawn by
 * image models along panel boundaries (`0`, `w/3`, `w/2`, `2w/3`, `w-1`, `h/2`) and replaces them
 * with the median studio backdrop color so cluster detection and panel crops never inherit white poles.
 */
export function eraseSheetGridDividerLinesInBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number
): void {
  if (w < 120 || h < 120) return;

  const rSamples: number[] = [];
  const gSamples: number[] = [];
  const bSamples: number[] = [];
  const sampleYs = [4, Math.floor(h * 0.25), Math.floor(h * 0.75), h - 5];
  const sampleXs = [
    Math.floor(w * 0.06),
    Math.floor(w * 0.16),
    Math.floor(w * 0.84),
    Math.floor(w * 0.94),
  ];
  for (const sy of sampleYs) {
    if (sy < 0 || sy >= h) continue;
    for (const sx of sampleXs) {
      if (sx < 0 || sx >= w) continue;
      const idx = (sy * w + sx) * 4;
      if (data[idx + 3] >= 180) {
        rSamples.push(data[idx]);
        gSamples.push(data[idx + 1]);
        bSamples.push(data[idx + 2]);
      }
    }
  }
  if (rSamples.length === 0) return;
  rSamples.sort((a, b) => a - b);
  gSamples.sort((a, b) => a - b);
  bSamples.sort((a, b) => a - b);
  const mid = Math.floor(rSamples.length / 2);
  const bgR = rSamples[mid];
  const bgG = gSamples[mid];
  const bgB = bSamples[mid];

  const isNearVerticalGridZone = (x: number): boolean => {
    const nx = x / w;
    return (
      nx <= 0.035 ||
      nx >= 0.965 ||
      Math.abs(nx - 1 / 3) <= 0.085 ||
      Math.abs(nx - 0.5) <= 0.065 ||
      Math.abs(nx - 2 / 3) <= 0.085 ||
      Math.abs(nx - 0.25) <= 0.045 ||
      Math.abs(nx - 0.75) <= 0.045
    );
  };

  const isVerticalRuleCol = new Uint8Array(w);
  const yStep = Math.max(1, Math.floor(h / 180));
  const totalSampleRows = Math.max(1, Math.ceil(h / yStep));

  for (let x = 0; x < w; x += 1) {
    if (!isNearVerticalGridZone(x)) continue;
    let nonBgCount = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let y = 0; y < h; y += yStep) {
      const idx = (y * w + x) * 4;
      const diff =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (diff > 26) {
        nonBgCount += 1;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
      }
    }
    if (nonBgCount / totalSampleRows < 0.46) continue;

    const meanR = sumR / nonBgCount;
    const meanG = sumG / nonBgCount;
    const meanB = sumB / nonBgCount;
    let consistentCount = 0;
    for (let y = 0; y < h; y += yStep) {
      const idx = (y * w + x) * 4;
      const diffBg =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (diffBg <= 26) continue;
      const diffMean =
        Math.abs(data[idx] - meanR) +
        Math.abs(data[idx + 1] - meanG) +
        Math.abs(data[idx + 2] - meanB);
      if (diffMean <= 44) {
        consistentCount += 1;
      }
    }
    if (consistentCount / nonBgCount >= 0.72) {
      isVerticalRuleCol[x] = 1;
    }
  }

  const maxRuleW = Math.max(12, Math.round(w * 0.022));
  let vx = 0;
  while (vx < w) {
    if (!isVerticalRuleCol[vx]) {
      vx += 1;
      continue;
    }
    let vxEnd = vx;
    while (vxEnd + 1 < w && isVerticalRuleCol[vxEnd + 1]) {
      vxEnd += 1;
    }
    if (vxEnd - vx + 1 <= maxRuleW) {
      const wipeX0 = Math.max(0, vx - 1);
      const wipeX1 = Math.min(w - 1, vxEnd + 1);
      for (let y = 0; y < h; y += 1) {
        const leftRefX = Math.max(0, wipeX0 - 2);
        const rightRefX = Math.min(w - 1, wipeX1 + 2);
        const lIdx = (y * w + leftRefX) * 4;
        const rIdx = (y * w + rightRefX) * 4;
        const lDiff =
          Math.abs(data[lIdx] - bgR) +
          Math.abs(data[lIdx + 1] - bgG) +
          Math.abs(data[lIdx + 2] - bgB);
        const rDiff =
          Math.abs(data[rIdx] - bgR) +
          Math.abs(data[rIdx + 1] - bgG) +
          Math.abs(data[rIdx + 2] - bgB);
        // Only overwrite rows where at least one side of the rule is background (protects crossing sleeves!)
        if (lDiff <= 38 || rDiff <= 38) {
          const fillR = lDiff <= rDiff ? data[lIdx] : data[rIdx];
          const fillG = lDiff <= rDiff ? data[lIdx + 1] : data[rIdx + 1];
          const fillB = lDiff <= rDiff ? data[lIdx + 2] : data[rIdx + 2];
          const useFill = Math.min(lDiff, rDiff) <= 38;
          for (let x = wipeX0; x <= wipeX1; x += 1) {
            const pIdx = (y * w + x) * 4;
            data[pIdx] = useFill ? fillR : bgR;
            data[pIdx + 1] = useFill ? fillG : bgG;
            data[pIdx + 2] = useFill ? fillB : bgB;
            data[pIdx + 3] = 255;
          }
        }
      }
    }
    vx = vxEnd + 1;
  }

  // Horizontal divider row scan near top, middle (h/2), and bottom borders
  const isHorizontalRuleRow = new Uint8Array(h);
  const xStep = Math.max(1, Math.floor(w / 180));
  const totalSampleCols = Math.max(1, Math.ceil(w / xStep));
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    if (!(ny <= 0.035 || ny >= 0.965 || Math.abs(ny - 0.5) <= 0.075)) continue;
    let nonBgCount = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let x = 0; x < w; x += xStep) {
      const idx = (y * w + x) * 4;
      const diff =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (diff > 26) {
        nonBgCount += 1;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
      }
    }
    if (nonBgCount / totalSampleCols < 0.46) continue;
    const meanR = sumR / nonBgCount;
    const meanG = sumG / nonBgCount;
    const meanB = sumB / nonBgCount;
    let consistentCount = 0;
    for (let x = 0; x < w; x += xStep) {
      const idx = (y * w + x) * 4;
      const diffBg =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (diffBg <= 26) continue;
      const diffMean =
        Math.abs(data[idx] - meanR) +
        Math.abs(data[idx + 1] - meanG) +
        Math.abs(data[idx + 2] - meanB);
      if (diffMean <= 44) consistentCount += 1;
    }
    if (consistentCount / nonBgCount >= 0.72) {
      isHorizontalRuleRow[y] = 1;
    }
  }

  const maxRuleH = Math.max(12, Math.round(h * 0.024));
  let hy = 0;
  while (hy < h) {
    if (!isHorizontalRuleRow[hy]) {
      hy += 1;
      continue;
    }
    let hyEnd = hy;
    while (hyEnd + 1 < h && isHorizontalRuleRow[hyEnd + 1]) {
      hyEnd += 1;
    }
    if (hyEnd - hy + 1 <= maxRuleH) {
      const wipeY0 = Math.max(0, hy - 1);
      const wipeY1 = Math.min(h - 1, hyEnd + 1);
      for (let x = 0; x < w; x += 1) {
        const topRefY = Math.max(0, wipeY0 - 2);
        const botRefY = Math.min(h - 1, wipeY1 + 2);
        const tIdx = (topRefY * w + x) * 4;
        const bIdx = (botRefY * w + x) * 4;
        const tDiff =
          Math.abs(data[tIdx] - bgR) +
          Math.abs(data[tIdx + 1] - bgG) +
          Math.abs(data[tIdx + 2] - bgB);
        const bDiff =
          Math.abs(data[bIdx] - bgR) +
          Math.abs(data[bIdx + 1] - bgG) +
          Math.abs(data[bIdx + 2] - bgB);
        if (tDiff <= 38 || bDiff <= 38) {
          for (let y = wipeY0; y <= wipeY1; y += 1) {
            const pIdx = (y * w + x) * 4;
            data[pIdx] = bgR;
            data[pIdx + 1] = bgG;
            data[pIdx + 2] = bgB;
            data[pIdx + 3] = 255;
          }
        }
      }
    }
    hy = hyEnd + 1;
  }
}

/**
 * Post-cutout RGBA artifact scrubber:
 * 1) Removes outer-margin vertical poles & horizontal border lines even if a sleeve/hem grazed them.
 * 2) Runs 8-connected component filtering to keep the primary human silhouette while purging detached
 *    panel divider lines, edge bars, and stray floating specks (`alpha = 0`).
 */
export function scrubCutoutArtifactsInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number
): void {
  if (cw < 48 || ch < 48) return;

  // Pass 1: Margin vertical pole / divider-line scrubber (outer 22% left & right margins)
  const leftMarginMax = Math.floor(cw * 0.22);
  const rightMarginMin = Math.ceil(cw * 0.78);
  const colOpaqueSpan = new Uint8Array(cw);

  for (let x = 0; x < cw; x += 1) {
    if (x > leftMarginMax && x < rightMarginMin) continue;
    let minY = ch;
    let maxY = -1;
    let count = 0;
    for (let y = 0; y < ch; y += 1) {
      if (data[(y * cw + x) * 4 + 3] >= 24) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count += 1;
      }
    }
    const span = maxY - minY + 1;
    if (count >= Math.round(ch * 0.26) && span >= Math.round(ch * 0.3) && count / span >= 0.55) {
      colOpaqueSpan[x] = 1;
    }
  }

  const maxPoleW = Math.max(10, Math.round(cw * 0.048));
  let px = 0;
  while (px < cw) {
    if (!colOpaqueSpan[px]) {
      px += 1;
      continue;
    }
    let pxEnd = px;
    while (pxEnd + 1 < cw && colOpaqueSpan[pxEnd + 1]) {
      pxEnd += 1;
    }
    if (pxEnd - px + 1 <= maxPoleW) {
      let isolatedRows = 0;
      let activeRows = 0;
      const probeL = px - 2;
      const probeR = pxEnd + 2;
      for (let y = 0; y < ch; y += 1) {
        let hasRowPixel = false;
        for (let x = px; x <= pxEnd; x += 1) {
          if (data[(y * cw + x) * 4 + 3] >= 24) {
            hasRowPixel = true;
            break;
          }
        }
        if (!hasRowPixel) continue;
        activeRows += 1;
        const leftClear = probeL < 0 || data[(y * cw + probeL) * 4 + 3] < 28;
        const rightClear = probeR >= cw || data[(y * cw + probeR) * 4 + 3] < 28;
        if (leftClear && rightClear) {
          isolatedRows += 1;
        }
      }
      if (activeRows > 0 && isolatedRows / activeRows >= 0.65) {
        const eraseX0 = Math.max(0, px - 1);
        const eraseX1 = Math.min(cw - 1, pxEnd + 1);
        for (let y = 0; y < ch; y += 1) {
          const leftClear = probeL < 0 || data[(y * cw + probeL) * 4 + 3] < 28;
          const rightClear = probeR >= cw || data[(y * cw + probeR) * 4 + 3] < 28;
          if (leftClear && rightClear) {
            for (let x = eraseX0; x <= eraseX1; x += 1) {
              data[(y * cw + x) * 4 + 3] = 0;
            }
          }
        }
      }
    }
    px = pxEnd + 1;
  }

  // Pass 2: 8-connected component filter on opaque foreground (`alpha >= 20`)
  const totalPx = cw * ch;
  const labels = new Int32Array(totalPx);
  const queue = new Int32Array(totalPx);
  interface CompStats {
    id: number;
    area: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    sumX: number;
  }
  const comps: CompStats[] = [];
  let nextId = 1;

  for (let p = 0; p < totalPx; p += 1) {
    if (labels[p] !== 0 || data[p * 4 + 3] < 20) continue;
    const id = nextId;
    nextId += 1;
    labels[p] = id;
    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = p;

    let area = 0;
    let minX = cw;
    let maxX = -1;
    let minY = ch;
    let maxY = -1;
    let sumX = 0;

    while (qHead < qTail) {
      const cur = queue[qHead++];
      const cy = Math.floor(cur / cw);
      const cx = cur - cy * cw;
      area += 1;
      sumX += cx;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const y0 = cy > 0 ? cy - 1 : 0;
      const y1 = cy + 1 < ch ? cy + 1 : ch - 1;
      const x0 = cx > 0 ? cx - 1 : 0;
      const x1 = cx + 1 < cw ? cx + 1 : cw - 1;
      for (let ny = y0; ny <= y1; ny += 1) {
        const rowOff = ny * cw;
        for (let nx = x0; nx <= x1; nx += 1) {
          const np = rowOff + nx;
          if (labels[np] === 0 && data[np * 4 + 3] >= 20) {
            labels[np] = id;
            queue[qTail++] = np;
          }
        }
      }
    }

    comps.push({ id, area, minX, maxX, minY, maxY, sumX });
  }

  if (comps.length <= 1) return;

  let primaryComp = comps[0];
  let bestScore = -1;
  for (const c of comps) {
    const meanX = c.sumX / Math.max(1, c.area);
    const centerDist = Math.abs(meanX - cw * 0.5) / (cw * 0.5);
    const score = c.area * (1 - 0.35 * Math.min(1, centerDist));
    if (score > bestScore) {
      bestScore = score;
      primaryComp = c;
    }
  }

  const eraseIds = new Uint8Array(nextId);
  for (const c of comps) {
    if (c.id === primaryComp.id) continue;
    const compW = c.maxX - c.minX + 1;
    const compH = c.maxY - c.minY + 1;
    const isTallThinLine =
      compH / Math.max(1, compW) >= 4.2 && compW <= Math.max(12, Math.round(cw * 0.055));
    const isWideThinLine =
      compW / Math.max(1, compH) >= 5.2 && compH <= Math.max(12, Math.round(ch * 0.045));
    const outsideHumanSpan =
      c.maxX < primaryComp.minX - 4 || c.minX > primaryComp.maxX + 4;
    const tinySpeck = c.area < Math.max(18, Math.round(primaryComp.area * 0.002));

    if (isTallThinLine || isWideThinLine || outsideHumanSpan || tinySpeck) {
      eraseIds[c.id] = 1;
    }
  }

  for (let p = 0; p < totalPx; p += 1) {
    const lid = labels[p];
    if (lid > 0 && eraseIds[lid]) {
      data[p * 4 + 3] = 0;
    }
  }
}

function scrubCutoutArtifactsOnCanvas(canvas: HTMLCanvasElement): void {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 48 || ch < 48) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  try {
    const imgData = ctx.getImageData(0, 0, cw, ch);
    scrubCutoutArtifactsInBuffer(imgData.data, cw, ch);
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore tainted canvas read errors
  }
}

/**
 * Pure buffer implementation of lateral/oblique (`45°`, `90°`, `135°`, `225°`) gaze & foot facing
 * direction detection:
 * 1) Primary signal: lower-shin/ankle vs shoe-sole toe overhang & centroid shift.
 * 2) Secondary signal (when coats/dresses or symmetric stance obscure ankle overhang): head facial/ear
 *    skin centroid vs darker hair mass, using adaptive head-luminance contrast so warm brown/auburn
 *    hair never masquerades as facial skin.
 */
export function detectLateralFacingDirectionInBuffer(
  data: Uint8ClampedArray,
  cw: number,
  ch: number
): 'left' | 'right' | 'neutral' {
  if (cw < 120 || ch < 120) return 'neutral';

  let minY = ch;
  let maxY = -1;
  let minX = cw;
  let maxX = -1;
  let fgPixels = 0;
  for (let y = 0; y < ch; y += 1) {
    const rowOff = y * cw;
    for (let x = 0; x < cw; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        fgPixels += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (fgPixels < 64 || maxY < minY) return 'neutral';

  const fgH = maxY - minY + 1;
  const fgW = maxX - minX + 1;
  if (fgH < 96 || fgW < 24) return 'neutral';

  const ankleY0 = Math.max(minY, maxY - Math.round(fgH * 0.21));
  const ankleY1 = Math.max(ankleY0, maxY - Math.round(fgH * 0.105));
  const footY0 = Math.max(ankleY1 + 1, maxY - Math.round(fgH * 0.072));
  const footY1 = maxY;

  let ankleMinX = cw;
  let ankleMaxX = -1;
  let ankleSumX = 0;
  let ankleCount = 0;

  for (let y = ankleY0; y <= ankleY1; y += 1) {
    const row = y * cw * 4;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[row + x * 4 + 3] >= 120) {
        if (x < ankleMinX) ankleMinX = x;
        if (x > ankleMaxX) ankleMaxX = x;
        ankleSumX += x;
        ankleCount += 1;
      }
    }
  }

  let footMinX = cw;
  let footMaxX = -1;
  let footSumX = 0;
  let footCount = 0;

  for (let y = footY0; y <= footY1; y += 1) {
    const row = y * cw * 4;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[row + x * 4 + 3] >= 120) {
        if (x < footMinX) footMinX = x;
        if (x > footMaxX) footMaxX = x;
        footSumX += x;
        footCount += 1;
      }
    }
  }

  if (ankleCount >= 16 && footCount >= 16 && ankleMaxX >= ankleMinX && footMaxX >= footMinX) {
    const ankleMeanX = ankleSumX / ankleCount;
    const footMeanX = footSumX / footCount;
    const leftToeOverhang = ankleMinX - footMinX;
    const rightToeOverhang = footMaxX - ankleMaxX;
    const overhangDiff = rightToeOverhang - leftToeOverhang;
    const meanShift = footMeanX - ankleMeanX;

    const minOverhangPx = Math.max(3, fgW * 0.028);
    const minMeanShiftPx = Math.max(1.5, fgW * 0.012);

    if (overhangDiff < -minOverhangPx && meanShift < -minMeanShiftPx) {
      return 'left';
    }
    if (overhangDiff > minOverhangPx && meanShift > minMeanShiftPx) {
      return 'right';
    }
  }

  // Fallback for long coats/dresses or compact stances: head facial/ear skin vs hair mass
  const headY0 = Math.min(maxY, minY + Math.round(fgH * 0.035));
  const headY1 = Math.min(maxY, minY + Math.round(fgH * 0.135));
  let headMinX = cw;
  let headMaxX = -1;
  let headLumSum = 0;
  let headMaxLum = 0;
  let headOpaqueCount = 0;

  for (let y = headY0; y <= headY1; y += 1) {
    const row = y * cw * 4;
    for (let x = minX; x <= maxX; x += 1) {
      const idx = row + x * 4;
      if (data[idx + 3] < 150) continue;
      if (x < headMinX) headMinX = x;
      if (x > headMaxX) headMaxX = x;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      headLumSum += lum;
      if (lum > headMaxLum) headMaxLum = lum;
      headOpaqueCount += 1;
    }
  }

  const headW = headMaxX - headMinX + 1;
  if (headOpaqueCount >= 24 && headW >= 14) {
    const headMeanLum = headLumSum / headOpaqueCount;
    const minSkinLum =
      headMaxLum >= 140 ? Math.max(122, headMeanLum + 10) : Math.max(48, headMeanLum + 5);

    let skinSumX = 0;
    let skinCount = 0;
    for (let y = headY0; y <= headY1; y += 1) {
      const row = y * cw * 4;
      for (let x = headMinX; x <= headMaxX; x += 1) {
        const idx = row + x * 4;
        if (data[idx + 3] < 150) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= minSkinLum && r > g + 6 && g >= b - 2 && r - b >= 12) {
          skinSumX += x;
          skinCount += 1;
        }
      }
    }

    if (skinCount >= 12) {
      const headMidX = (headMinX + headMaxX) * 0.5;
      const skinOffset = skinSumX / skinCount - headMidX;
      const minSkinShift = Math.max(2.2, headW * 0.065);
      if (skinOffset < -minSkinShift) return 'left';
      if (skinOffset > minSkinShift) return 'right';
    }
  }

  return 'neutral';
}

function detectLateralCanvasFacingDirection(
  canvas: HTMLCanvasElement
): 'left' | 'right' | 'neutral' {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 120 || ch < 120) return 'neutral';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'neutral';
  try {
    const data = ctx.getImageData(0, 0, cw, ch).data;
    return detectLateralFacingDirectionInBuffer(data, cw, ch);
  } catch {
    return 'neutral';
  }
}

export interface HorizontalSpan {
  x0: number;
  x1: number;
}

function estimateRowMedianEdgeBackdropRgb(
  data: Uint8ClampedArray,
  w: number,
  rowOff: number,
  edgeXs: number[]
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const ex of edgeXs) {
    const idx = rowOff + ex * 4;
    rs.push(data[idx]);
    gs.push(data[idx + 1]);
    bs.push(data[idx + 2]);
  }
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  return [(rs[1] + rs[2]) * 0.5, (gs[1] + gs[2]) * 0.5, (bs[1] + bs[2]) * 0.5];
}

export function detectRowSubjectClustersInBuffer(
  data: Uint8ClampedArray,
  w: number,
  rowH: number
): HorizontalSpan[] {
  if (w < 240 || rowH < 120 || data.length < w * rowH * 4) return [];

  const colHits = new Uint16Array(w);
  const yStart = Math.max(2, Math.round(rowH * 0.04));
  const yEnd = Math.min(rowH - 2, Math.round(rowH * 0.96));
  const edgeXs = [2, Math.min(8, w - 1), Math.max(0, w - 9), Math.max(0, w - 3)];

  for (let y = yStart; y < yEnd; y += 2) {
    const rowOff = y * w * 4;
    const [bgR, bgG, bgB] = estimateRowMedianEdgeBackdropRgb(data, w, rowOff, edgeXs);

    for (let x = 2; x < w - 2; x += 1) {
      const idx = rowOff + x * 4;
      if (data[idx + 3] < 40) continue;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      if (dr * dr + dg * dg + db * db > 324) {
        colHits[x] += 1;
      }
    }
  }

  const minColHits = Math.max(3, Math.round(((yEnd - yStart) / 2) * 0.025));
  const gapBridgePx = Math.max(6, Math.round(w * 0.014));
  const minClusterWidth = Math.max(16, Math.round(w * 0.026));
  const spans: HorizontalSpan[] = [];

  let inSpan = false;
  let startX = 0;
  let gapRun = 0;
  for (let x = 0; x < w; x += 1) {
    if (colHits[x] >= minColHits) {
      if (!inSpan) {
        inSpan = true;
        startX = x;
      }
      gapRun = 0;
    } else if (inSpan) {
      gapRun += 1;
      if (gapRun > gapBridgePx) {
        const endX = x - gapRun;
        if (endX - startX + 1 >= minClusterWidth) {
          spans.push({ x0: startX, x1: endX });
        }
        inSpan = false;
        gapRun = 0;
      }
    }
  }
  if (inSpan) {
    const endX = w - 1 - gapRun;
    if (endX - startX + 1 >= minClusterWidth) {
      spans.push({ x0: startX, x1: endX });
    }
  }

  return spans;
}

function detectRowSubjectClusters(
  sheetCtx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  y1: number
): HorizontalSpan[] {
  const rowH = y1 - y0;
  if (w < 240 || rowH < 120) return [];
  try {
    const data = sheetCtx.getImageData(0, y0, w, rowH).data;
    return detectRowSubjectClustersInBuffer(data, w, rowH);
  } catch {
    return [];
  }
}

/**
 * Scans ONLY the upper head/crown band (`y = rowTop + 0.04*rowH .. rowTop + 0.24*rowH`)
 * with tight `gapBridgePx = Math.max(3, Math.round(w * 0.006))` where heads never touch
 * even when adjacent sleeves or coats touch at mid-body (`x = 1/3 w` or `x = 2/3 w`).
 */
export function detectRowHeadClustersInBuffer(
  data: Uint8ClampedArray,
  w: number,
  rowH: number
): HorizontalSpan[] {
  if (w < 240 || rowH < 120 || data.length < w * rowH * 4) return [];

  const colHits = new Uint16Array(w);
  const yStart = Math.max(2, Math.round(rowH * 0.04));
  const yEnd = Math.min(rowH - 2, Math.round(rowH * 0.24));
  if (yEnd <= yStart + 2) return [];
  const edgeXs = [2, Math.min(8, w - 1), Math.max(0, w - 9), Math.max(0, w - 3)];

  for (let y = yStart; y < yEnd; y += 1) {
    const rowOff = y * w * 4;
    const [bgR, bgG, bgB] = estimateRowMedianEdgeBackdropRgb(data, w, rowOff, edgeXs);

    for (let x = 2; x < w - 2; x += 1) {
      const idx = rowOff + x * 4;
      if (data[idx + 3] < 40) continue;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      if (dr * dr + dg * dg + db * db > 324) {
        colHits[x] += 1;
      }
    }
  }

  const minColHits = Math.max(2, Math.round((yEnd - yStart) * 0.06));
  const gapBridgePx = Math.max(3, Math.round(w * 0.006));
  const minClusterWidth = Math.max(10, Math.round(w * 0.018));
  const spans: HorizontalSpan[] = [];

  let inSpan = false;
  let startX = 0;
  let gapRun = 0;
  for (let x = 0; x < w; x += 1) {
    if (colHits[x] >= minColHits) {
      if (!inSpan) {
        inSpan = true;
        startX = x;
      }
      gapRun = 0;
    } else if (inSpan) {
      gapRun += 1;
      if (gapRun > gapBridgePx) {
        const endX = x - gapRun;
        if (endX - startX + 1 >= minClusterWidth) {
          spans.push({ x0: startX, x1: endX });
        }
        inSpan = false;
        gapRun = 0;
      }
    }
  }
  if (inSpan) {
    const endX = w - 1 - gapRun;
    if (endX - startX + 1 >= minClusterWidth) {
      spans.push({ x0: startX, x1: endX });
    }
  }

  return spans;
}

export function detectRowHeadClusters(
  sheetCtx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  y1: number
): HorizontalSpan[] {
  const rowH = y1 - y0;
  if (w < 240 || rowH < 120) return [];
  try {
    const data = sheetCtx.getImageData(0, y0, w, rowH).data;
    return detectRowHeadClustersInBuffer(data, w, rowH);
  } catch {
    return [];
  }
}

/**
 * Measures foreground density in the central `[0.45w .. 0.55w]` band of a row.
 * In a true `2x2` sheet, `x = 0.50w` is an empty central gutter (`density ~ 0`),
 * whereas in a `3x2` sheet `x = 0.50w` is the exact body center of Column 1 (`45°` / `180°`).
 */
export function measureRowCenterForegroundDensityInBuffer(
  data: Uint8ClampedArray,
  w: number,
  rowH: number
): number {
  if (w < 240 || rowH < 120 || data.length < w * rowH * 4) return 0;

  const yStart = Math.max(2, Math.round(rowH * 0.06));
  const yEnd = Math.min(rowH - 2, Math.round(rowH * 0.92));
  const xStart = Math.max(2, Math.floor(w * 0.45));
  const xEnd = Math.min(w - 3, Math.ceil(w * 0.55));
  if (yEnd <= yStart || xEnd < xStart) return 0;

  const edgeXs = [2, Math.min(8, w - 1), Math.max(0, w - 9), Math.max(0, w - 3)];
  let fgPixels = 0;
  let totalPixels = 0;

  for (let y = yStart; y < yEnd; y += 2) {
    const rowOff = y * w * 4;
    const [bgR, bgG, bgB] = estimateRowMedianEdgeBackdropRgb(data, w, rowOff, edgeXs);
    for (let x = xStart; x <= xEnd; x += 1) {
      totalPixels += 1;
      const idx = rowOff + x * 4;
      if (data[idx + 3] < 40) continue;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      if (dr * dr + dg * dg + db * db > 324) {
        fgPixels += 1;
      }
    }
  }

  return totalPixels > 0 ? fgPixels / totalPixels : 0;
}

function measureRowCenterForegroundDensity(
  sheetCtx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  y1: number
): number {
  const rowH = y1 - y0;
  if (w < 240 || rowH < 120) return 0;
  try {
    const data = sheetCtx.getImageData(0, y0, w, rowH).data;
    return measureRowCenterForegroundDensityInBuffer(data, w, rowH);
  } catch {
    return 0;
  }
}

export interface TurnaroundSheetGridDecision {
  use3x2Grid: boolean;
  topClusters: HorizontalSpan[];
  botClusters: HorizontalSpan[];
  topHeadClusters: HorizontalSpan[];
  botHeadClusters: HorizontalSpan[];
  topCenterDensity: number;
  botCenterDensity: number;
}

function evaluateTurnaroundGridDecisionFromStats(params: {
  w: number;
  h: number;
  layout?: string;
  topClusters: HorizontalSpan[];
  botClusters: HorizontalSpan[];
  topHeadClusters: HorizontalSpan[];
  botHeadClusters: HorizontalSpan[];
  topCenterDensity: number;
  botCenterDensity: number;
}): boolean {
  const {
    w,
    h,
    layout,
    topClusters,
    botClusters,
    topHeadClusters,
    botHeadClusters,
    topCenterDensity,
    botCenterDensity,
  } = params;

  const isExplicit2x2 = layout === 'turnaround_2x2' || w < 256 || h < 256;
  const isHorizontal1x6Strip = !isExplicit2x2 && w / h >= 3.15;
  const isHorizontal1x4Strip = !isHorizontal1x6Strip && w / h >= 2.15;
  if (isExplicit2x2 || isHorizontal1x6Strip || isHorizontal1x4Strip) {
    return false;
  }

  const hasThreeOrMoreClusters =
    topClusters.length >= 3 ||
    botClusters.length >= 3 ||
    topHeadClusters.length >= 3 ||
    botHeadClusters.length >= 3;
  const hasCenterSubjectMass = topCenterDensity >= 0.035 || botCenterDensity >= 0.035;
  const strictlyConfirmed2x2 =
    topClusters.length > 0 &&
    botClusters.length > 0 &&
    topClusters.length <= 2 &&
    botClusters.length <= 2 &&
    topHeadClusters.length <= 2 &&
    botHeadClusters.length <= 2 &&
    !hasCenterSubjectMass;

  if (layout === 'turnaround_3x2') {
    // Default to 3x2 unless BOTH full-row AND head-band clusters strictly confirm <= 2 subjects
    // in BOTH rows AND no subject mass exists near the central 0.50w column!
    return !strictlyConfirmed2x2;
  }

  if (hasThreeOrMoreClusters) {
    return true;
  }
  if (strictlyConfirmed2x2) {
    return false;
  }
  return hasCenterSubjectMass || w / h >= 1.15;
}

/**
 * Scans `[0.34h .. 0.66h]` for the horizontal background valley separating Row 1 (`0°, 45°, 90°`)
 * and Row 2 (`135°, 180°, 225°`), preventing hardcoded `h / 2` from decapitating tall/shifted Row 2 heads.
 */
export function resolveTurnaroundRowSplitYInBuffer(
  sheetRgba: Uint8ClampedArray,
  w: number,
  h: number
): number {
  const halfH = Math.floor(h / 2);
  if (w < 64 || h < 64 || sheetRgba.length < w * h * 4) return halfH;

  const yMin = Math.max(12, Math.floor(h * 0.34));
  const yMax = Math.min(h - 13, Math.floor(h * 0.66));
  if (yMax <= yMin) return halfH;

  const xMin = Math.max(2, Math.floor(w * 0.04));
  const xMax = Math.min(w - 3, Math.ceil(w * 0.96));
  const sampleWidth = Math.max(1, xMax - xMin + 1);
  const edgeXs = [2, Math.min(8, w - 1), Math.max(0, w - 9), Math.max(0, w - 3)];
  const rowDensities = new Float32Array(h);

  for (let y = yMin; y <= yMax; y += 1) {
    const rowOff = y * w * 4;
    const [bgR, bgG, bgB] = estimateRowMedianEdgeBackdropRgb(sheetRgba, w, rowOff, edgeXs);
    let fg = 0;
    for (let x = xMin; x <= xMax; x += 2) {
      const idx = rowOff + x * 4;
      if (sheetRgba[idx + 3] < 40) continue;
      const dr = sheetRgba[idx] - bgR;
      const dg = sheetRgba[idx + 1] - bgG;
      const db = sheetRgba[idx + 2] - bgB;
      if (dr * dr + dg * dg + db * db > 324) {
        fg += 2;
      }
    }
    rowDensities[y] = Math.min(1, fg / sampleWidth);
  }

  let bestValleyCenter = -1;
  let bestValleyScore = -Infinity;
  let curStart = -1;
  for (let y = yMin; y <= yMax + 1; y += 1) {
    const isEmptyRow = y <= yMax && rowDensities[y] <= 0.014;
    if (isEmptyRow) {
      if (curStart === -1) curStart = y;
    } else if (curStart !== -1) {
      const len = y - curStart;
      if (len >= 2) {
        const mid = (curStart + (y - 1)) * 0.5;
        const centerDistPenalty = Math.abs(mid - halfH) * 0.15;
        const score = len - centerDistPenalty;
        if (score > bestValleyScore) {
          bestValleyScore = score;
          bestValleyCenter = Math.round(mid);
        }
      }
      curStart = -1;
    }
  }

  if (bestValleyCenter >= yMin && bestValleyCenter <= yMax) {
    return bestValleyCenter;
  }

  let minRowY = halfH;
  let minScore = Infinity;
  for (let y = yMin + 1; y < yMax; y += 1) {
    const smoothed = (rowDensities[y - 1] + rowDensities[y] + rowDensities[y + 1]) / 3;
    const score = smoothed + Math.abs(y - halfH) * 0.0002;
    if (score < minScore) {
      minScore = score;
      minRowY = y;
    }
  }
  return minRowY;
}

export function resolveTurnaroundSheetGridDecisionInBuffer(
  sheetRgba: Uint8ClampedArray,
  w: number,
  h: number,
  options?: { layout?: string }
): TurnaroundSheetGridDecision {
  const splitY = resolveTurnaroundRowSplitYInBuffer(sheetRgba, w, h);
  const botH = h - splitY;
  const isExplicit2x2 = options?.layout === 'turnaround_2x2' || w < 256 || h < 256;
  const isHorizontalStrip = !isExplicit2x2 && w / h >= 2.15;

  let topClusters: HorizontalSpan[] = [];
  let botClusters: HorizontalSpan[] = [];
  let topHeadClusters: HorizontalSpan[] = [];
  let botHeadClusters: HorizontalSpan[] = [];
  let topCenterDensity = 0;
  let botCenterDensity = 0;

  if (!isExplicit2x2 && !isHorizontalStrip && sheetRgba.length >= w * h * 4) {
    const topData = sheetRgba.subarray(0, splitY * w * 4);
    const botData = sheetRgba.subarray(splitY * w * 4, h * w * 4);
    topClusters = detectRowSubjectClustersInBuffer(topData, w, splitY);
    botClusters = detectRowSubjectClustersInBuffer(botData, w, botH);
    topHeadClusters = detectRowHeadClustersInBuffer(topData, w, splitY);
    botHeadClusters = detectRowHeadClustersInBuffer(botData, w, botH);
    topCenterDensity = measureRowCenterForegroundDensityInBuffer(topData, w, splitY);
    botCenterDensity = measureRowCenterForegroundDensityInBuffer(botData, w, botH);
  }

  const use3x2Grid = evaluateTurnaroundGridDecisionFromStats({
    w,
    h,
    layout: options?.layout,
    topClusters,
    botClusters,
    topHeadClusters,
    botHeadClusters,
    topCenterDensity,
    botCenterDensity,
  });

  return {
    use3x2Grid,
    topClusters,
    botClusters,
    topHeadClusters,
    botHeadClusters,
    topCenterDensity,
    botCenterDensity,
  };
}

function resolveThreeColumnCropSpans(
  clusters: HorizontalSpan[],
  headClusters: HorizontalSpan[],
  w: number
): [HorizontalSpan, HorizontalSpan, HorizontalSpan] {
  if (clusters.length === 3) {
    const m01 = Math.round((clusters[0].x1 + clusters[1].x0) * 0.5);
    const m12 = Math.round((clusters[1].x1 + clusters[2].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, w - 3) },
    ];
  }
  if (headClusters.length === 3) {
    // Coats/sleeves touched at mid-body bridging full-row clusters into 2, so split at head-band midpoints!
    const m01 = Math.round((headClusters[0].x1 + headClusters[1].x0) * 0.5);
    const m12 = Math.round((headClusters[1].x1 + headClusters[2].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, w - 3) },
    ];
  }
  if (clusters.length === 4) {
    // Safeguard if an image model draws 4 columns x 2 rows instead of 3x2: pick columns 0, 1, 3 cleanly
    const m01 = Math.round((clusters[0].x1 + clusters[1].x0) * 0.5);
    const m12 = Math.round((clusters[1].x1 + clusters[2].x0) * 0.5);
    const m23 = Math.round((clusters[2].x1 + clusters[3].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m23 + 1, x1: Math.max(m23 + 17, w - 3) },
    ];
  }
  const colW = Math.floor(w / 3);
  const trimX = Math.max(2, Math.round(colW * 0.018));
  return [
    { x0: trimX, x1: colW - trimX },
    { x0: colW + trimX, x1: colW * 2 - trimX },
    { x0: colW * 2 + trimX, x1: w - trimX },
  ];
}

/**
 * Crops an AI-generated 3x2 Turnaround Studio Sheet (6 panels: `0°, 45°, 90°, 135°, 180°, 225°`)
 * — or a legacy/mock 2x2 sheet (`0°, 45°, 90°, 180°`) — into 6 individual RGBA PNG angle slices:
 * - Row 1: `0°` (Front), `45°` (Front-Right), `90°` (Right Side)
 * - Row 2: `135°` (Back-Right `우후면`), `180°` (Straight Back `후면`), `225°` (Back-Left `좌후면`)
 * Runs pre-crop sheet divider-line erasing + `isolateSingleSubjectInSlice` + V4 hole-aware
 * `applyCornerBfsCutoutOnCanvas` + `scrubCutoutArtifactsOnCanvas` + post-cutout touching-twin
 * `isolateSingleSubjectInSlice` + gaze-direction normalization + `normalizeTurnaroundCanvasesToFloorBaseline`.
 */
export async function sliceTurnaround2x2Sheet(
  sheetDataUrl: string,
  options?: { layout?: string; forceFlipAngles?: TurnaroundAngleDeg[] }
): Promise<Record<TurnaroundAngleDeg, string>> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      0: sheetDataUrl,
      45: sheetDataUrl,
      90: sheetDataUrl,
      135: sheetDataUrl,
      180: sheetDataUrl,
      225: sheetDataUrl,
    };
  }

  const forceFlipSet = new Set<TurnaroundAngleDeg>(options?.forceFlipAngles || []);

  const rawCropped = await new Promise<Record<TurnaroundAngleDeg, string> | null>((resolve) => {
    const img = new Image();
    if (!sheetDataUrl.startsWith('data:') && !sheetDataUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 32 || h < 32) {
          resolve(null);
          return;
        }

        // Draw sheet onto a working canvas and erase any model-drawn grid divider lines BEFORE clustering/cropping
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = w;
        sheetCanvas.height = h;
        const sheetCtx = sheetCanvas.getContext('2d', { willReadFrequently: true });
        if (sheetCtx) {
          sheetCtx.drawImage(img, 0, 0);
          if (w >= 256 && h >= 256) {
            try {
              const sheetImgData = sheetCtx.getImageData(0, 0, w, h);
              eraseSheetGridDividerLinesInBuffer(sheetImgData.data, w, h);
              sheetCtx.putImageData(sheetImgData, 0, 0);
            } catch {
              // Ignore cross-origin read errors if any
            }
          }
        }

        const isExplicit2x2 = options?.layout === 'turnaround_2x2' || w < 256 || h < 256;
        const isHorizontal1x6Strip = !isExplicit2x2 && w / h >= 3.15;
        const isHorizontal1x4Strip = !isHorizontal1x6Strip && w / h >= 2.15;

        let topClusters: HorizontalSpan[] = [];
        let botClusters: HorizontalSpan[] = [];
        let topHeadClusters: HorizontalSpan[] = [];
        let botHeadClusters: HorizontalSpan[] = [];
        let topCenterDensity = 0;
        let botCenterDensity = 0;
        let splitY = Math.floor(h / 2);

        if (sheetCtx && w >= 64 && h >= 64) {
          try {
            const fullSheetRgba = sheetCtx.getImageData(0, 0, w, h).data;
            splitY = resolveTurnaroundRowSplitYInBuffer(fullSheetRgba, w, h);
          } catch {
            splitY = Math.floor(h / 2);
          }
        }

        if (!isExplicit2x2 && !isHorizontal1x6Strip && !isHorizontal1x4Strip && sheetCtx) {
          topClusters = detectRowSubjectClusters(sheetCtx, w, 0, splitY);
          botClusters = detectRowSubjectClusters(sheetCtx, w, splitY, h);
          topHeadClusters = detectRowHeadClusters(sheetCtx, w, 0, splitY);
          botHeadClusters = detectRowHeadClusters(sheetCtx, w, splitY, h);
          topCenterDensity = measureRowCenterForegroundDensity(sheetCtx, w, 0, splitY);
          botCenterDensity = measureRowCenterForegroundDensity(sheetCtx, w, splitY, h);
        }

        const use3x2Grid = evaluateTurnaroundGridDecisionFromStats({
          w,
          h,
          layout: options?.layout,
          topClusters,
          botClusters,
          topHeadClusters,
          botHeadClusters,
          topCenterDensity,
          botCenterDensity,
        });

        let panels: Array<{
          angle: TurnaroundAngleDeg;
          sx: number;
          sy: number;
          cw: number;
          ch: number;
        }>;

        if (isHorizontal1x6Strip) {
          const colW = Math.floor(w / 6);
          const trimX = Math.max(1, Math.round(colW * 0.015));
          const trimY = Math.max(1, Math.round(h * 0.012));
          const cw = Math.max(16, colW - trimX * 2);
          const ch = Math.max(16, h - trimY * 2);
          panels = TURNAROUND_ANGLES.map((angle, idx) => ({
            angle,
            sx: colW * idx + trimX,
            sy: trimY,
            cw,
            ch,
          }));
        } else if (use3x2Grid) {
          const trimTop = Math.max(1, Math.round(splitY * 0.012));
          const botTotalH = h - splitY;
          const trimBot = Math.max(1, Math.round(botTotalH * 0.012));
          const topCh = Math.max(16, splitY - trimTop * 2);
          const botCh = Math.max(16, botTotalH - trimBot * 2);
          const topSpans = resolveThreeColumnCropSpans(topClusters, topHeadClusters, w);
          const botSpans = resolveThreeColumnCropSpans(botClusters, botHeadClusters, w);
          const topAngles: [TurnaroundAngleDeg, TurnaroundAngleDeg, TurnaroundAngleDeg] = [
            0, 45, 90,
          ];
          const botAngles: [TurnaroundAngleDeg, TurnaroundAngleDeg, TurnaroundAngleDeg] = [
            135, 180, 225,
          ];
          panels = [
            ...topAngles.map((angle, i) => ({
              angle,
              sx: topSpans[i].x0,
              sy: trimTop,
              cw: Math.max(16, topSpans[i].x1 - topSpans[i].x0),
              ch: topCh,
            })),
            ...botAngles.map((angle, i) => ({
              angle,
              sx: botSpans[i].x0,
              sy: splitY + trimBot,
              cw: Math.max(16, botSpans[i].x1 - botSpans[i].x0),
              ch: botCh,
            })),
          ];
        } else if (isHorizontal1x4Strip) {
          const colW = Math.floor(w / 4);
          const trimX = Math.max(1, Math.round(colW * 0.015));
          const trimY = Math.max(1, Math.round(h * 0.012));
          const cw = Math.max(16, colW - trimX * 2);
          const ch = Math.max(16, h - trimY * 2);
          panels = [
            { angle: 0, sx: trimX, sy: trimY, cw, ch },
            { angle: 45, sx: colW + trimX, sy: trimY, cw, ch },
            { angle: 90, sx: colW * 2 + trimX, sy: trimY, cw, ch },
            { angle: 180, sx: colW * 3 + trimX, sy: trimY, cw, ch },
          ];
        } else {
          const halfW = Math.floor(w / 2);
          const trimX = Math.max(2, Math.round(halfW * 0.016));
          const trimTop = Math.max(1, Math.round(splitY * 0.012));
          const botTotalH = h - splitY;
          const trimBot = Math.max(1, Math.round(botTotalH * 0.012));
          const cw = Math.max(16, halfW - trimX * 2);
          const topCh = Math.max(16, splitY - trimTop * 2);
          const botCh = Math.max(16, botTotalH - trimBot * 2);
          panels = [
            { angle: 0, sx: trimX, sy: trimTop, cw, ch: topCh },
            { angle: 45, sx: halfW + trimX, sy: trimTop, cw, ch: topCh },
            { angle: 90, sx: trimX, sy: splitY + trimBot, cw, ch: botCh },
            { angle: 180, sx: halfW + trimX, sy: splitY + trimBot, cw, ch: botCh },
          ];
        }

        const out = {} as Record<TurnaroundAngleDeg, string>;
        const cutCanvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>> = {};
        const extraCanvases: HTMLCanvasElement[] = [sheetCanvas];
        const cropSource: CanvasImageSource = sheetCtx ? sheetCanvas : img;

        for (const p of panels) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = p.cw;
          cropCanvas.height = p.ch;
          const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            out[p.angle] = sheetDataUrl;
            continue;
          }
          ctx.clearRect(0, 0, p.cw, p.ch);
          ctx.drawImage(cropSource, p.sx, p.sy, p.cw, p.ch, 0, 0, p.cw, p.ch);
          const preCutIsolated = isolateSingleSubjectInSlice(cropCanvas);
          if (preCutIsolated !== cropCanvas) {
            extraCanvases.push(cropCanvas);
          }
          applyCornerBfsCutoutOnCanvas(preCutIsolated);
          scrubCutoutArtifactsOnCanvas(preCutIsolated);
          const finalCanvas = isolateSingleSubjectInSlice(preCutIsolated);
          if (finalCanvas !== preCutIsolated) {
            extraCanvases.push(preCutIsolated);
          }

          // Normalize canonical gaze: `45°`, `90°`, `135°` face screen-right; `225°` faces screen-left!
          if (forceFlipSet.has(p.angle)) {
            flipCanvasHorizontallyInPlace(finalCanvas);
          } else if (
            (p.angle === 45 || p.angle === 90 || p.angle === 135) &&
            detectLateralCanvasFacingDirection(finalCanvas) === 'left'
          ) {
            flipCanvasHorizontallyInPlace(finalCanvas);
          } else if (
            p.angle === 225 &&
            detectLateralCanvasFacingDirection(finalCanvas) === 'right'
          ) {
            flipCanvasHorizontallyInPlace(finalCanvas);
          }

          cutCanvases[p.angle] = finalCanvas;
        }

        normalizeTurnaroundCanvasesToFloorBaseline(cutCanvases);

        // If slicing a 4-panel 2x2 sheet (e.g. square fallback), synthesize distinct left-facing 225° from 90°!
        if (!cutCanvases[135] && cutCanvases[90]) {
          out[135] = cutCanvases[90].toDataURL('image/png');
        }
        if (!cutCanvases[225] && cutCanvases[90]) {
          const mirror225 = document.createElement('canvas');
          mirror225.width = cutCanvases[90].width;
          mirror225.height = cutCanvases[90].height;
          const mCtx = mirror225.getContext('2d');
          if (mCtx) {
            mCtx.translate(mirror225.width, 0);
            mCtx.scale(-1, 1);
            mCtx.drawImage(cutCanvases[90], 0, 0);
            out[225] = mirror225.toDataURL('image/png');
          }
          mirror225.width = 0;
          mirror225.height = 0;
        }

        for (const angle of TURNAROUND_ANGLES) {
          const c = cutCanvases[angle];
          if (c) {
            out[angle] = c.toDataURL('image/png');
            c.width = 0;
            c.height = 0;
          }
        }
        if (!out[135]) {
          out[135] = out[90] || out[180] || out[0] || sheetDataUrl;
        }
        if (!out[225]) {
          out[225] = out[180] || out[90] || out[0] || sheetDataUrl;
        }

        for (const extra of extraCanvases) {
          extra.width = 0;
          extra.height = 0;
        }
        resolve(out);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = sheetDataUrl;
  });

  if (!rawCropped) {
    const fallbackCut = await ensureTransparentCutout(sheetDataUrl);
    return {
      0: fallbackCut,
      45: fallbackCut,
      90: fallbackCut,
      135: fallbackCut,
      180: fallbackCut,
      225: fallbackCut,
    };
  }

  // Run 4-corner + enclosed-hole alpha verification guard across ALL 6 turnaround angles (deduped)
  const uniqueMap = new Map<string, Promise<string>>();
  const verifiedOut = {} as Record<TurnaroundAngleDeg, string>;
  await Promise.all(
    TURNAROUND_ANGLES.map(async (angle) => {
      const src = rawCropped[angle];
      let job = uniqueMap.get(src);
      if (!job) {
        job = ensureTransparentCutout(src);
        uniqueMap.set(src, job);
      }
      verifiedOut[angle] = await job;
    })
  );
  return verifiedOut;
}

export const CLIENT_GEMINI_API_KEY_STORAGE = 'ainventory_gemini_api_key';

export const INITIAL_DEMO_VTON_ENABLED =
  typeof window !== 'undefined' &&
  typeof window.location?.search === 'string' &&
  new URLSearchParams(window.location.search).get('demo_vton') === '1';

export function isDemoVtonShowcaseActive(): boolean {
  if (INITIAL_DEMO_VTON_ENABLED) return true;
  if (typeof window === 'undefined' || typeof window.location?.search !== 'string') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('demo_vton') === '1';
}

const showcaseMemorySlices: Partial<
  Record<VtonStyleMode, Record<TurnaroundAngleDeg, string>>
> = {};
const showcaseInFlight: Partial<
  Record<VtonStyleMode, Promise<Record<TurnaroundAngleDeg, string> | null>>
> = {};

export function getShowcaseDemoSheetUrl(rawStyleMode?: string | null): string {
  const token = String(rawStyleMode || '')
    .trim()
    .toLowerCase();
  if (token === 'stylized_isometric' || token !== 'photorealistic') {
    return withPublicBaseUrl('/seed/vton-showcase-3x2-stylized.jpg');
  }
  return withPublicBaseUrl('/seed/vton-showcase-3x2-photoreal.jpg');
}

export function peekShowcaseDemoVtonSlice(
  styleMode: VtonStyleMode,
  angleDeg: number
): string | null {
  const normalizedStyle: VtonStyleMode =
    String(styleMode || '')
      .trim()
      .toLowerCase() === 'photorealistic'
      ? 'photorealistic'
      : 'stylized_isometric';
  const normalizedAngle = normalizeTurnaroundAngleDeg(angleDeg, DEFAULT_TURNAROUND_ANGLE);
  return showcaseMemorySlices[normalizedStyle]?.[normalizedAngle] || null;
}

export async function loadShowcaseDemoVtonSlices(
  rawStyleMode?: string | null
): Promise<Record<TurnaroundAngleDeg, string> | null> {
  const styleMode: VtonStyleMode =
    String(rawStyleMode || '')
      .trim()
      .toLowerCase() === 'photorealistic'
      ? 'photorealistic'
      : 'stylized_isometric';
  if (showcaseMemorySlices[styleMode]) {
    return showcaseMemorySlices[styleMode]!;
  }
  if (showcaseInFlight[styleMode]) {
    return showcaseInFlight[styleMode]!;
  }

  const job = (async (): Promise<Record<TurnaroundAngleDeg, string> | null> => {
    try {
      const sheetUrl = getShowcaseDemoSheetUrl(styleMode);
      const forceFlipAngles: TurnaroundAngleDeg[] =
        styleMode === 'stylized_isometric' ? [45, 90, 135] : [45, 90];
      const sliced = await sliceTurnaround2x2Sheet(sheetUrl, {
        layout: 'turnaround_3x2',
        forceFlipAngles,
      });
      showcaseMemorySlices[styleMode] = sliced;
      return sliced;
    } catch {
      return null;
    } finally {
      delete showcaseInFlight[styleMode];
    }
  })();

  showcaseInFlight[styleMode] = job;
  return job;
}

const DIRECT_GEMINI_MODEL_CHAIN = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
] as const;

function sanitizeGeminiKeyToken(rawKey: unknown): string {
  if (typeof rawKey !== 'string') return '';
  const trimmed = rawKey.trim();
  if (trimmed.length < 12 || trimmed.length > 256 || /[\r\n\s]/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function decodeBase64GeminiKey(rawB64: unknown): string {
  if (typeof rawB64 !== 'string') return '';
  const trimmed = rawB64.trim();
  if (!trimmed) return '';
  try {
    if (typeof atob === 'function') {
      return sanitizeGeminiKeyToken(atob(trimmed));
    }
  } catch {
    // ignore malformed base64
  }
  return '';
}

export function getStoredClientGeminiApiKey(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    return sanitizeGeminiKeyToken(
      window.localStorage.getItem(CLIENT_GEMINI_API_KEY_STORAGE)
    );
  } catch {
    return '';
  }
}

export function setStoredClientGeminiApiKey(rawKey: string | null | undefined): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  const cleaned = sanitizeGeminiKeyToken(rawKey);
  try {
    if (cleaned) {
      window.localStorage.setItem(CLIENT_GEMINI_API_KEY_STORAGE, cleaned);
    } else {
      window.localStorage.removeItem(CLIENT_GEMINI_API_KEY_STORAGE);
    }
  } catch {
    // ignore storage write error
  }
  try {
    window.dispatchEvent(
      new CustomEvent(GEMINI_API_KEY_EVENT, { detail: { hasKey: Boolean(cleaned) } })
    );
  } catch {
    // ignore CustomEvent dispatch error
  }
  return cleaned;
}

function resolveCandidateClientGeminiApiKeys(): string[] {
  const envBag = (import.meta.env || {}) as Record<string, string | undefined>;
  const candidates = [
    getStoredClientGeminiApiKey(),
    decodeBase64GeminiKey(envBag.VITE_GEMINI_API_KEY_B64),
    sanitizeGeminiKeyToken(envBag.VITE_GEMINI_API_KEY),
    sanitizeGeminiKeyToken(envBag.VITE_GOOGLE_API_KEY),
    sanitizeGeminiKeyToken(envBag.VITE_VTON_API_KEY),
  ].filter(Boolean);
  return [...new Set(candidates)];
}

export function resolveClientGeminiApiKey(): string {
  return resolveCandidateClientGeminiApiKeys()[0] || '';
}

export async function fetchServerGeminiConfigured(): Promise<boolean> {
  const envBag = (import.meta.env || {}) as Record<string, string | undefined>;
  if (String(envBag.VITE_STATIC_STANDALONE || '') === '1') {
    return false;
  }
  try {
    const status = await apiFetch<{ geminiConfigured?: boolean }>('/vton/status', {
      method: 'GET',
      headers: { 'X-Demo-Mode': 'sample' },
    });
    return Boolean(status?.geminiConfigured);
  } catch {
    return false;
  }
}

async function normalizeImageBlobToJpegDataUrl(blob: Blob): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const nw = img.naturalWidth || img.width;
          const nh = img.naturalHeight || img.height;
          if (!nw || !nh) {
            resolve(null);
            return;
          }
          const maxEdge = 384;
          const scale = Math.min(1, maxEdge / Math.max(nw, nh));
          const targetW = Math.max(16, Math.round(nw * scale));
          const targetH = Math.max(16, Math.round(nh * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#F5F5F7';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function rememberPackshotCache(url: string, dataUrl: string): void {
  if (encodedGarmentPackshotCache.has(url)) {
    encodedGarmentPackshotCache.delete(url);
  }
  while (encodedGarmentPackshotCache.size >= PACKSHOT_CACHE_MAX) {
    const oldest = encodedGarmentPackshotCache.keys().next().value;
    if (!oldest) break;
    encodedGarmentPackshotCache.delete(oldest);
  }
  encodedGarmentPackshotCache.set(url, dataUrl);
}

async function encodeImageUrlToInlineDataUrl(srcUrl: string): Promise<string | null> {
  if (!srcUrl) return null;
  if (srcUrl.startsWith('data:image/')) return srcUrl;

  const cachedPackshot = encodedGarmentPackshotCache.get(srcUrl);
  if (cachedPackshot) {
    rememberPackshotCache(srcUrl, cachedPackshot);
    return cachedPackshot;
  }

  if (typeof fetch === 'undefined' || typeof FileReader === 'undefined') return null;

  try {
    const res = await fetch(withPublicBaseUrl(srcUrl), { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0 || blob.size > 6 * 1024 * 1024) return null;

    if (blob.type === 'image/webp' || blob.size > 48 * 1024) {
      const normalized = await normalizeImageBlobToJpegDataUrl(blob);
      if (normalized) {
        rememberPackshotCache(srcUrl, normalized);
        return normalized;
      }
    }

    const encoded = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : null;
        resolve(result && result.startsWith('data:image/') ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (encoded) {
      rememberPackshotCache(srcUrl, encoded);
    }
    return encoded;
  } catch {
    return null;
  }
}

async function buildMultimodalSlotsPayload(
  equippedGarments: Array<{ slotKey: string; garment: GarmentRecord }>
): Promise<Record<string, Record<string, unknown>>> {
  const payload: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    equippedGarments.map(async ({ slotKey, garment }) => {
      const canonicalUrl = resolveGarmentCanonicalImageUrl(garment);
      const inlineDataUrl = await encodeImageUrlToInlineDataUrl(canonicalUrl);
      payload[slotKey] = {
        id: garment.id,
        name: garment.name,
        category: garment.category,
        subcategory: garment.subcategory,
        color_name: garment.color_name,
        color_hex: garment.color_hex,
        fabric: garment.fabric,
        formality: garment.formality,
        brand: garment.brand,
        image_url: canonicalUrl,
        ...(inlineDataUrl ? { packshotDataUrl: inlineDataUrl } : {}),
      };
    })
  );

  return payload;
}

function parseDataUrlInlinePart(
  dataUrl: string | null | undefined
): { mimeType: string; data: string } | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    data: match[2].replace(/\s+/g, ''),
  };
}

function parseHexToRgbTriplet(rawHex: string): [number, number, number] {
  const clean = String(rawHex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      Number.parseInt(clean.slice(1, 3), 16),
      Number.parseInt(clean.slice(3, 5), 16),
      Number.parseInt(clean.slice(5, 7), 16),
    ];
  }
  return [148, 163, 184];
}

const turnaround3x2GuideMemo = new Map<string, string>();

function drawGuideSilhouetteMannequin(
  ctx: CanvasRenderingContext2D,
  params: {
    cx: number;
    rowTop: number;
    cellW: number;
    cellH: number;
    headTopY: number;
    footSoleY: number;
    bmiScale: number;
    angleDeg: TurnaroundAngleDeg;
  }
): void {
  const { cx, rowTop, cellW, cellH, headTopY, footSoleY, bmiScale, angleDeg } = params;
  const figH = Math.max(120, footSoleY - headTopY);
  const headH = figH / 7.5;

  // Keep silhouettes compactly centered inside the middle 54% of each 448px cell
  // (leaving >= 23% empty solid backdrop gutters on BOTH sides of every cell boundary!)
  const maxAllowedSpan = cellW * 0.54;
  const rawMaxArmSpan = headH * (1.88 * bmiScale + 0.28 + 0.224 * bmiScale);
  const widthCompact = Math.min(0.88, maxAllowedSpan / Math.max(1, rawMaxArmSpan));

  const frontHeadW = headH * 0.72 * Math.max(0.9, widthCompact);
  const frontShoulderW = headH * 1.88 * bmiScale * widthCompact;
  const frontWaistW = headH * 1.32 * bmiScale * widthCompact;
  const frontHipW = headH * 1.54 * bmiScale * widthCompact;

  const neckTopY = headTopY + headH * 0.96;
  const shoulderY = headTopY + headH * 1.32;
  const chestY = headTopY + headH * 2.05;
  const waistY = headTopY + headH * 2.95;
  const crotchY = headTopY + figH * 0.51;
  const kneeY = headTopY + figH * 0.74;
  const ankleY = footSoleY - headH * 0.32;

  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.round(cx - cellW * 0.27), rowTop, Math.round(cellW * 0.54), cellH);
  ctx.clip();

  if (angleDeg === 90) {
    // Narrow pure lateral side-profile silhouette facing screen-right (`->`), 55% of front shoulder width
    const sideTorsoW = frontShoulderW * 0.55;
    const sideHeadW = frontHeadW * 0.88;
    const headCx = cx - headH * 0.03;

    // Cranium
    ctx.beginPath();
    ctx.ellipse(
      headCx,
      headTopY + headH * 0.5,
      sideHeadW * 0.5,
      headH * 0.5,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Clear rightward nose & chin profile (`->`)
    ctx.beginPath();
    ctx.moveTo(headCx + sideHeadW * 0.36, headTopY + headH * 0.36);
    ctx.lineTo(headCx + sideHeadW * 0.68, headTopY + headH * 0.56);
    ctx.lineTo(headCx + sideHeadW * 0.44, headTopY + headH * 0.66);
    ctx.lineTo(headCx + sideHeadW * 0.46, headTopY + headH * 0.86);
    ctx.lineTo(headCx + sideHeadW * 0.18, headTopY + headH * 0.94);
    ctx.closePath();
    ctx.fill();

    // Upright neck
    const neckW = headH * 0.36 * bmiScale * widthCompact;
    ctx.fillRect(
      Math.round(headCx - neckW * 0.52),
      Math.round(neckTopY),
      Math.round(neckW),
      Math.round(shoulderY - neckTopY + 4)
    );

    // Narrow lateral torso + side-profile arm silhouette
    const backX = cx - sideTorsoW * 0.5;
    const chestFrontX = cx + sideTorsoW * 0.5;
    const waistBackX = cx - sideTorsoW * 0.42;
    const waistFrontX = cx + sideTorsoW * 0.44;
    const hipBackX = cx - sideTorsoW * 0.52;
    const hipFrontX = cx + sideTorsoW * 0.42;

    ctx.beginPath();
    ctx.moveTo(backX + sideTorsoW * 0.12, shoulderY);
    ctx.lineTo(chestFrontX - sideTorsoW * 0.08, shoulderY);
    ctx.lineTo(chestFrontX, chestY);
    ctx.lineTo(waistFrontX, waistY);
    ctx.lineTo(hipFrontX, crotchY);
    ctx.lineTo(hipBackX, crotchY);
    ctx.lineTo(waistBackX, waistY);
    ctx.lineTo(backX, chestY);
    ctx.closePath();
    ctx.fill();

    // Single-file lateral leg column down to ankle
    const thighW = sideTorsoW * 0.68;
    const ankleW = sideTorsoW * 0.42;
    ctx.beginPath();
    ctx.moveTo(cx - thighW * 0.52, crotchY - 2);
    ctx.lineTo(cx + thighW * 0.48, crotchY - 2);
    ctx.lineTo(cx + thighW * 0.42, kneeY);
    ctx.lineTo(cx + ankleW * 0.48, ankleY);
    ctx.lineTo(cx - ankleW * 0.52, ankleY);
    ctx.lineTo(cx - thighW * 0.46, kneeY);
    ctx.closePath();
    ctx.fill();

    // Clear rightward shoe-toe profile (`->`) resting flat on footSoleY
    const heelX = cx - ankleW * 0.58;
    const toeX = cx + headH * 0.62 * widthCompact;
    ctx.beginPath();
    ctx.moveTo(heelX, ankleY - 2);
    ctx.lineTo(cx + ankleW * 0.5, ankleY - 2);
    ctx.lineTo(toeX, footSoleY - headH * 0.11);
    ctx.lineTo(toeX, footSoleY);
    ctx.lineTo(heelX, footSoleY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  const isQuarter = angleDeg === 45 || angleDeg === 135 || angleDeg === 225;
  const facingDir = angleDeg === 225 ? -1 : angleDeg === 45 || angleDeg === 135 ? 1 : 0;
  const shoulderW = isQuarter ? frontShoulderW * 0.84 : frontShoulderW;
  const waistW = isQuarter ? frontWaistW * 0.86 : frontWaistW;
  const hipW = isQuarter ? frontHipW * 0.86 : frontHipW;
  const headW = isQuarter ? frontHeadW * 0.88 : frontHeadW;
  const headCenterX = cx + facingDir * headH * 0.04;

  // Head oval
  ctx.beginPath();
  ctx.ellipse(
    headCenterX,
    headTopY + headH * 0.5,
    headW * 0.5,
    headH * 0.5,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Subtle 3/4 jawline/nose directional cue on 45°; subtle lost-profile cheek/ear cue on 135° / 225°
  if (facingDir !== 0) {
    const jutScale = angleDeg === 45 ? 0.58 : 0.48;
    ctx.beginPath();
    ctx.moveTo(headCenterX + facingDir * headW * 0.35, headTopY + headH * 0.42);
    ctx.lineTo(headCenterX + facingDir * headW * jutScale, headTopY + headH * 0.58);
    ctx.lineTo(headCenterX + facingDir * headW * 0.34, headTopY + headH * 0.82);
    ctx.closePath();
    ctx.fill();
  }

  // Neck
  const neckW = headH * 0.38 * bmiScale * widthCompact;
  ctx.fillRect(
    Math.round(cx - neckW * 0.5),
    Math.round(neckTopY),
    Math.round(neckW),
    Math.round(shoulderY - neckTopY + 4)
  );

  // Torso (shoulder -> waist -> hip)
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW * 0.5, shoulderY);
  ctx.lineTo(cx + shoulderW * 0.5, shoulderY);
  ctx.lineTo(cx + waistW * 0.5, waistY);
  ctx.lineTo(cx + hipW * 0.5, crotchY);
  ctx.lineTo(cx - hipW * 0.5, crotchY);
  ctx.lineTo(cx - waistW * 0.5, waistY);
  ctx.closePath();
  ctx.fill();

  // Left & right arms with clean air gap beside waist
  const armW = headH * 0.28 * bmiScale * widthCompact;
  const wristY = crotchY + headH * 0.25;
  for (const side of [-1, 1] as const) {
    const shX = cx + side * (shoulderW * 0.5 - armW * 0.25);
    const wrX = cx + side * (shoulderW * 0.5 + headH * 0.14 * widthCompact);
    ctx.beginPath();
    ctx.moveTo(shX - armW * 0.5, shoulderY + 2);
    ctx.lineTo(shX + armW * 0.5, shoulderY + 2);
    ctx.lineTo(wrX + armW * 0.4, wristY);
    ctx.lineTo(wrX - armW * 0.4, wristY);
    ctx.closePath();
    ctx.fill();
  }

  // Two full-length 7.5-head adult legs + shoes grounded at footSoleY
  const legOffset = hipW * 0.26;
  const thighW = hipW * 0.38;
  const ankleW = thighW * 0.58;
  for (const side of [-1, 1] as const) {
    const legCx = cx + side * legOffset;
    ctx.beginPath();
    ctx.moveTo(legCx - thighW * 0.5, crotchY - 2);
    ctx.lineTo(legCx + thighW * 0.5, crotchY - 2);
    ctx.lineTo(legCx + ankleW * 0.5, ankleY);
    ctx.lineTo(legCx - ankleW * 0.5, ankleY);
    ctx.closePath();
    ctx.fill();

    const toeShift =
      facingDir !== 0 && side === facingDir
        ? facingDir * headH * 0.26 * widthCompact
        : facingDir * headH * 0.1 * widthCompact;
    ctx.beginPath();
    ctx.moveTo(legCx - ankleW * 0.55, ankleY - 2);
    ctx.lineTo(legCx + ankleW * 0.55, ankleY - 2);
    ctx.lineTo(legCx + ankleW * 0.62 + Math.max(0, toeShift), footSoleY);
    ctx.lineTo(legCx - ankleW * 0.62 + Math.min(0, toeShift), footSoleY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Builds a `1344x896` (`3:2` landscape) spatial turnaround template filled with `backdropHex`
 * and 6 subtle `±15 RGB` silhouette mannequins (`[0°, 45°, 90°]` on Row 1 and `[135°, 180°, 225°]`
 * on Row 2) compactly centered within the middle `54%` of each `448px` cell (leaving `>= 23%`
 * empty solid backdrop gutters on both sides of every cell boundary), ZERO grid divider lines,
 * shared head-top `11%` & foot-sole `91%` baselines, and `7.5-head` adult proportions.
 */
export function buildTurnaround3x2LayoutGuideDataUrl(params: {
  backdropHex: string;
  heightCm: number;
  weightKg: number;
}): string | null {
  if (typeof document === 'undefined') return null;

  const [bgR, bgG, bgB] = parseHexToRgbTriplet(params.backdropHex || CUTOUT_STAGE_BACKDROP_HEX);
  const safeH = clamp(Number(params.heightCm) || 172, 100, 230);
  const safeW = clamp(Number(params.weightKg) || 64, 35, 160);
  const bmi = safeW / (safeH / 100) ** 2;
  const bmiScale = clamp(1 + (bmi - 22.0) * 0.022, 0.86, 1.24);
  const memoKey = `v9:${bgR},${bgG},${bgB}:${Math.round(bmiScale * 100)}`;
  const cached = turnaround3x2GuideMemo.get(memoKey);
  if (cached) return cached;

  try {
    const W = 1344;
    const H = 896;
    const cellW = W / 3;
    const cellH = H / 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.width = 0;
      canvas.height = 0;
      return null;
    }

    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    ctx.fillRect(0, 0, W, H);

    // ±15 RGB delta from backdropHex: clear solo-cell guidance for Gemini while still cleanly keyed out by chroma matte
    const rgbDelta = bgR + bgG + bgB < 180 ? 15 : -15;
    const silR = clamp(bgR + rgbDelta, 0, 255);
    const silG = clamp(bgG + rgbDelta, 0, 255);
    const silB = clamp(bgB + rgbDelta, 0, 255);
    ctx.fillStyle = `rgb(${silR}, ${silG}, ${silB})`;

    const gridAngles: TurnaroundAngleDeg[][] = [
      [0, 45, 90],
      [135, 180, 225],
    ];

    for (let row = 0; row < 2; row += 1) {
      const rowTop = row * cellH;
      const headTopY = rowTop + Math.round(cellH * 0.11);
      const footSoleY = rowTop + Math.round(cellH * 0.91);
      for (let col = 0; col < 3; col += 1) {
        const cx = Math.round(col * cellW + cellW * 0.5);
        drawGuideSilhouetteMannequin(ctx, {
          cx,
          rowTop,
          cellW,
          cellH,
          headTopY,
          footSoleY,
          bmiScale,
          angleDeg: gridAngles[row][col],
        });
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return null;
    }

    if (turnaround3x2GuideMemo.size >= 8) {
      const oldestKey = turnaround3x2GuideMemo.keys().next().value;
      if (oldestKey) turnaround3x2GuideMemo.delete(oldestKey);
    }
    turnaround3x2GuideMemo.set(memoKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

export const CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY = 'ainventory_char_identity_anchor_v9';
const CHARACTER_ANCHOR_MAX_BYTES = 180 * 1024;
const characterIdentityAnchorMemory = new Map<string, string>();

function estimateDataUrlByteLength(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64Len = dataUrl.length - commaIdx - 1;
  return Math.ceil((b64Len * 3) / 4);
}

export function computeCharacterIdentityAnchorKey(
  profile: Pick<
    NormalizedVtonProfile,
    'gender' | 'heightCm' | 'weightKg' | 'bodyShape' | 'skinToneHex' | 'avatarSpec'
  >
): string {
  const app = profile.avatarSpec.appearance;
  const gender = normalizeCanonicalAvatarGender(profile.gender, profile.avatarSpec.framePreset);
  const skinHex = String(profile.skinToneHex || '#DFBA9B')
    .trim()
    .toUpperCase();
  const hairStyle = String(app.hairStyle || 'soft_wavy')
    .trim()
    .toLowerCase();
  const hairHex = String(app.hairColorHex || '#2B211B')
    .trim()
    .toUpperCase();
  return `v9:${gender}:${profile.heightCm}:${profile.weightKg}:${profile.bodyShape}:${skinHex}:${hairStyle}:${hairHex}`;
}

export function getStoredCharacterIdentityAnchor(anchorKey: string): string | null {
  if (!anchorKey) return null;
  const memHit = characterIdentityAnchorMemory.get(anchorKey);
  if (
    memHit &&
    memHit.startsWith('data:image/') &&
    estimateDataUrlByteLength(memHit) <= CHARACTER_ANCHOR_MAX_BYTES
  ) {
    return memHit;
  }
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed[anchorKey];
    if (
      typeof candidate === 'string' &&
      candidate.startsWith('data:image/') &&
      estimateDataUrlByteLength(candidate) <= CHARACTER_ANCHOR_MAX_BYTES
    ) {
      characterIdentityAnchorMemory.set(anchorKey, candidate);
      return candidate;
    }
  } catch {
    // Ignore storage read/JSON errors
  }
  return null;
}

function persistCharacterIdentityAnchorEntry(anchorKey: string, dataUrl: string): void {
  if (!anchorKey || !dataUrl.startsWith('data:image/')) return;
  if (estimateDataUrlByteLength(dataUrl) > CHARACTER_ANCHOR_MAX_BYTES) return;

  if (characterIdentityAnchorMemory.size >= 6 && !characterIdentityAnchorMemory.has(anchorKey)) {
    const oldest = characterIdentityAnchorMemory.keys().next().value;
    if (oldest) characterIdentityAnchorMemory.delete(oldest);
  }
  characterIdentityAnchorMemory.set(anchorKey, dataUrl);

  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    let bag: Record<string, string> = {};
    const existingRaw = window.localStorage.getItem(CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY);
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.startsWith('data:image/')) {
            bag[k] = v;
          }
        }
      }
    }
    delete bag[anchorKey];
    const entries = Object.entries(bag).slice(-3);
    const nextBag: Record<string, string> = Object.fromEntries(entries);
    nextBag[anchorKey] = dataUrl;
    window.localStorage.setItem(CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY, JSON.stringify(nextBag));
  } catch {
    // Ignore storage quota errors; memory map still retains anchor for session
  }
}

async function saveCharacterIdentityAnchorFromZeroSlice(params: {
  anchorKey: string;
  zeroSliceDataUrl: string;
  backdropHex: string;
}): Promise<string | null> {
  const { anchorKey, zeroSliceDataUrl, backdropHex } = params;
  if (!anchorKey || !zeroSliceDataUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    if (!zeroSliceDataUrl.startsWith('data:') && !zeroSliceDataUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (srcW < 160 || srcH < 200) {
          resolve(null);
          return;
        }

        const [bgR, bgG, bgB] = parseHexToRgbTriplet(backdropHex || CUTOUT_STAGE_BACKDROP_HEX);
        const backdropCss = `rgb(${bgR}, ${bgG}, ${bgB})`;
        const maxHeights = [540, 440, 360];
        const qualities = [0.84, 0.72, 0.6];

        for (const maxH of maxHeights) {
          const scale = Math.min(1, maxH / srcH);
          const cw = Math.max(160, Math.round(srcW * scale));
          const ch = Math.max(200, Math.round(srcH * scale));
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            canvas.width = 0;
            canvas.height = 0;
            resolve(null);
            return;
          }
          ctx.fillStyle = backdropCss;
          ctx.fillRect(0, 0, cw, ch);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, cw, ch);

          for (const q of qualities) {
            const candidate = canvas.toDataURL('image/jpeg', q);
            if (
              candidate &&
              candidate.startsWith('data:image/') &&
              estimateDataUrlByteLength(candidate) <= CHARACTER_ANCHOR_MAX_BYTES
            ) {
              canvas.width = 0;
              canvas.height = 0;
              persistCharacterIdentityAnchorEntry(anchorKey, candidate);
              resolve(candidate);
              return;
            }
          }
          canvas.width = 0;
          canvas.height = 0;
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = zeroSliceDataUrl;
  });
}

function extractStudioKeyColorInputs(
  serializedSlots: Record<string, Record<string, unknown>>
): StudioKeyColorInput[] {
  return Object.entries(serializedSlots).map(([slot, it]) => ({
    slot,
    category:
      typeof it.subcategory === 'string'
        ? it.subcategory
        : typeof it.category === 'string'
          ? it.category
          : slot,
    colorHex: typeof it.color_hex === 'string' ? it.color_hex : null,
    colorName: typeof it.color_name === 'string' ? it.color_name : null,
    name: typeof it.name === 'string' ? it.name : null,
  }));
}

export function buildDirectClientGeminiParts(params: {
  profile: NormalizedVtonProfile;
  styleMode: VtonStyleMode;
  weatherMood: WeatherMoodKey;
  weather?: unknown;
  angleDeg: TurnaroundAngleDeg;
  turnaroundSheet: boolean;
  serializedSlots: Record<string, Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const {
    profile,
    styleMode,
    weatherMood,
    weather,
    angleDeg,
    turnaroundSheet,
    serializedSlots,
  } = params;
  const spec = profile.avatarSpec;
  const anthro = spec.anthropometrics;
  const app = spec.appearance;
  const isStylized = styleMode === 'stylized_isometric';
  const hasUmbrella = Boolean(serializedSlots.acc_umbrella || serializedSlots.umbrella);

  const equippedColorInputs = extractStudioKeyColorInputs(serializedSlots);
  const optimalBackdropHex = selectOptimalStudioKeyHex(equippedColorInputs);

  const weatherBundle = buildWeatherPosePromptDirectives({
    weather: weather ?? { mood: weatherMood },
    hasEquippedUmbrella: hasUmbrella,
    turnaroundSheet,
    equippedColorHexes: equippedColorInputs,
  });

  const header = isStylized
    ? 'Stylized Isometric Simulation Character VTON lookbook (matte 3D-stylized studio fashion avatar, unified 7.5-head adult proportions, authentic matte fabric texture, zero photorealistic skin pores, zero chibi distortion).'
    : 'Photorealistic SSENSE/COS Studio VTON lookbook photograph (85mm lens, realistic skin, natural hair/hands, accurate garment drape).';

  const cameraLine = turnaroundSheet
    ? `3:2 Borderless Undivided 3x2 Turnaround Sheet (ONE continuous seamless canvas with STRICTLY 3 EQUAL COLUMNS BY 2 EQUAL ROWS = EXACTLY 6 PORTRAIT PANELS TOTAL — STRICTLY ZERO white/grey/black vertical or horizontal grid divider lines, ZERO panel borders, NEVER 4 COLUMNS, NEVER 8 FIGURES — on 100% flat solid uniform chromakey-free studio (${optimalBackdropHex}) backdrop including 100% flat shadowless ${optimalBackdropHex} inside every enclosed gap under umbrellas, between arms/torso, between legs, and inside bag handles, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne weather particles, zero lines/text) of the EXACT SAME person & outfit:\n${buildTurnaround3x2SheetAngleDirectives()}\n${weatherBundle.headroomPrompt} ${SOLO_SINGLE_PERSON_PER_CELL_LOCK} ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`
    : `Full-body studio portrait (${angleDeg}°) on 100% flat solid uniform chromakey-free studio (${optimalBackdropHex}) backdrop including 100% flat shadowless ${optimalBackdropHex} inside every enclosed gap, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne weather particles, zero text. CAMERA ANGLE REQUIREMENT: ${buildTurnaroundAnglePromptDirective(angleDeg)} ${weatherBundle.headroomPrompt} STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary human figure centered in frame (NEVER draw duplicate/twin models). ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`;

  const bmi = Number((profile.weightKg / (profile.heightCm / 100) ** 2).toFixed(1));
  const canonicalCharacterBlock = buildCanonicalCharacterIdentityPromptBlock({
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    gender: profile.gender,
    framePreset: spec.framePreset,
    dominantHand: spec.dominantHand,
    bodyShape: profile.bodyShape,
    skinToneHex: profile.skinToneHex,
    mstLevel: app.mstLevel,
    mstUndertone: app.mstUndertone,
    hairStyle: app.hairStyle,
    hairColorHex: app.hairColorHex,
    facialHair: app.facialHair,
    styleMode,
    hasPortraitReference: Boolean(profile.portraitDataUrl),
  });
  const bodyLock = `Model: ${profile.weightKg && profile.heightCm ? `${profile.heightCm}cm/${profile.weightKg}kg` : '172cm/64kg'} (BMI ${bmi}, gender=${profile.gender || 'unisex'}, dominantHand=${spec.dominantHand}, faithful 7.5-head adult body/face/limb volume), frame=${spec.framePreset}, archetype=${spec.archetypePreset}, chest=${anthro.chestForm}, skin=${profile.skinToneHex} (MST-${app.mstLevel}-${app.mstUndertone}), hair=${app.hairStyle} (${app.hairColorHex}), beard=${app.facialHair}.\n${canonicalCharacterBlock}\n${weatherBundle.combinedPrompt}`;

  const parts: Array<Record<string, unknown>> = [
    { text: `${header}\n${cameraLine}\n${bodyLock}` },
  ];

  if (turnaroundSheet) {
    const layoutGuideDataUrl = buildTurnaround3x2LayoutGuideDataUrl({
      backdropHex: optimalBackdropHex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
    });
    const layoutGuidePart = parseDataUrlInlinePart(layoutGuideDataUrl);
    if (layoutGuidePart) {
      parts.push({
        text: `[SPATIAL 3x2 TURNAROUND CANVAS TEMPLATE — ZERO GRID LINES & >= 23% WIDE CELL GUTTERS]: Paint the 6 full-body views of the EXACT SAME character directly over the 6 compact faint mannequin pose guides on this 3:2 solid ${optimalBackdropHex} canvas: Row 1 = [0° Front, 45° Front-Right, 90° Pure Orthographic Right Side Profile (NARROW SIDE VIEW, ONE EYE, ZERO BACK)] and Row 2 = [135° Back-Right Rear-Quarter, 180° Pure Back, 225° Back-Left Rear-Quarter]. Paint completely over the faint guides; keep identical head-top and foot-sole baselines across all 6 figures, preserve wide empty ${optimalBackdropHex} gutters between cells, and NEVER draw divider lines. ${SOLO_SINGLE_PERSON_PER_CELL_LOCK}`,
      });
      parts.push({ inlineData: layoutGuidePart });
    }
  }

  const portraitPart = parseDataUrlInlinePart(profile.portraitDataUrl);
  if (portraitPart) {
    parts.push({
      text: `[CRITICAL USER FACE IDENTITY LOCK — PRIMARY LIKENESS PHOTO BELOW]: The model's face MUST look unmistakably like this exact person in the attached photo! Reproduce their exact facial bone structure, eye shape, eyelid fold, eyebrows, nose bridge/tip, lips, cheek contour, jawline, and hairstyle/hairline across 0° Front, 45° Screen-Right Quarter (facing VIEWER'S RIGHT with face, both eyes, nose, chin 100% visible), and 90° Screen-Right Side Profile (pure lateral side profile facing VIEWER'S RIGHT showing ONLY ONE eye and ZERO back view); on 135° Back-Right (Row 2 Left) and 225° Back-Left (Row 2 Right) render the matching rear-quarter hairstyle, ear, and lost-profile cheek/jawline contour facing diagonally away (rightward on 135°, leftward on 225°); and on Row 2 Center 180° Straight Back render ONLY the symmetrical back of the head & rear hair silhouette (STRICTLY ZERO front face on 180° Back) in ${isStylized ? 'stylized character' : 'photorealistic'} style with skin tone ${profile.skinToneHex}. NEVER substitute a generic stock model face:`,
    });
    parts.push({ inlineData: portraitPart });
  } else if (isStylized && !profile.portraitDataUrl) {
    const characterAnchorKey = computeCharacterIdentityAnchorKey(profile);
    const savedAnchorUrl = getStoredCharacterIdentityAnchor(characterAnchorKey);
    const savedAnchorPart = parseDataUrlInlinePart(savedAnchorUrl);
    if (savedAnchorPart) {
      parts.push({
        text: `[CHARACTER IDENTITY, BODY PROPORTION & ART-STYLE ANCHOR]: Keep the EXACT SAME character face, haircut/length, matte 3D-stylized art style, and ${profile.heightCm}cm/${profile.weightKg}kg 7.5-head body build from this reference — ONLY change the outfit to the newly equipped garments and adjust stance for the weather.`,
      });
      parts.push({ inlineData: savedAnchorPart });
    }
  }

  const bagAnatomy = resolveBagCarryAnatomy(spec.dominantHand);
  const slotPlacementPrompts: Record<string, string> = {
    top: 'worn as the inner base top layer directly over the upper torso (with collar/hem naturally peeking beneath any mid-layer cardigan/vest or outerwear)',
    top_mid:
      'worn as the 2nd mid-layer cardigan or tailored vest/knit layered cleanly OVER the inner base [TOP] and UNDER any [OUTER_MID] or [OUTER] coat/jacket',
    outer_mid:
      'worn as the 3rd mid-outerwear blazer/blouson/leather-jacket layered cleanly OVER the [TOP]/[TOP_MID] inner layers (and UNDER any outer overcoat/trench when [OUTER] is also equipped)',
    outer:
      'worn as the outermost overcoat/trench/padding draped naturally OVER all inner [TOP], [TOP_MID], and [OUTER_MID] layers (left relaxed open in front on 0°/45° views so inner layering stays legible)',
    shoes: `worn cleanly on BOTH feet with full soles grounded on the floor. ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
    accessory: bagAnatomy.slotPrompt,
    acc_umbrella:
      weatherBundle.effectiveWeather === 'rain'
        ? 'MUST BE WIDE-OPEN FULL DOME CANOPY held high above the head with one hand and tilted ~15° backward so the face, hair, and entire outfit remain 100% visible (NEVER closed, folded, rolled, or used as a walking cane)'
        : 'held open overhead or poised stylishly by handle according to weather directive',
    acc_belt: 'fastened cleanly around the waist belt loops with visible buckle hardware',
    acc_head: 'worn naturally on top of the head fitting crown and hair volume',
    acc_eyes: 'worn cleanly across the nose bridge and ears as eyewear/glasses/sunglasses',
    acc_neck: 'draped/knotted naturally around the neck over collar line',
    acc_hand_left:
      "worn EXCLUSIVELY on the model's ANATOMICAL LEFT HAND (keep right hand bare unless right glove is also equipped)",
    acc_hand_right:
      "worn EXCLUSIVELY on the model's ANATOMICAL RIGHT HAND (may intentionally differ from left hand glove for asymmetric styling)",
    acc_wrist_left: "worn on the model's ANATOMICAL LEFT WRIST with visible watch case and strap",
    acc_wrist_right:
      "worn on the model's ANATOMICAL RIGHT WRIST (allow dual-wrist asymmetric watch styling when left watch is also worn)",
    jwl_neck: 'worn gracefully around the collarbone / neckline as a necklace/pendant',
    jwl_ear_left: "worn on the model's ANATOMICAL LEFT EARLOBE/EAR",
    jwl_ear_right: "worn on the model's ANATOMICAL RIGHT EARLOBE/EAR",
    jwl_wrist_left: "worn on the model's ANATOMICAL LEFT WRIST as a bracelet/bangle",
    jwl_wrist_right: "worn on the model's ANATOMICAL RIGHT WRIST as a bracelet/bangle",
    jwl_ring_left: "worn on a finger of the model's ANATOMICAL LEFT HAND",
    jwl_ring_right: "worn on a finger of the model's ANATOMICAL RIGHT HAND",
    jwl_brooch: 'pinned cleanly to the upper-left chest lapel/collar area as a brooch/corsage',
  };

  for (const [slotKey, item] of Object.entries(serializedSlots)) {
    const inline = parseDataUrlInlinePart(
      typeof item.packshotDataUrl === 'string' ? item.packshotDataUrl : null
    );
    const placementPrompt = slotPlacementPrompts[slotKey];
    const placementHint = placementPrompt ? ` — Placement: ${placementPrompt}` : '';
    parts.push({
      text: `[${slotKey.toUpperCase()}] "${String(item.name || slotKey)}" (${String(item.subcategory || item.category || slotKey)}, ${String(item.color_hex || '')}, ${String(item.fabric || 'cotton')})${placementHint}:`,
    });
    if (inline) {
      parts.push({ inlineData: inline });
    }
  }

  parts.push({
    text: `Wear ALL equipped garments, footwear, body-part accessories, and jewelry above simultaneously on their exact specified left/right body parts against a 100% flat solid uniform chromakey-free studio (${optimalBackdropHex}) backdrop, STRICTLY NO vertical/horizontal grid divider lines, NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne rain/snow streaks in background. ${turnaroundSheet ? SOLO_SINGLE_PERSON_PER_CELL_LOCK : 'Strictly ONE solitary person in frame.'} ${FOOTWEAR_PAIR_SYMMETRY_LOCK} Return image only.`,
  });

  return parts;
}

async function synthesizeDirectBrowserGeminiVton(params: {
  apiKey: string;
  profile: NormalizedVtonProfile;
  styleMode: VtonStyleMode;
  weatherMood: WeatherMoodKey;
  weather?: unknown;
  angleDeg: TurnaroundAngleDeg;
  useTurnaroundSheet: boolean;
  serializedSlots: Record<string, Record<string, unknown>>;
}): Promise<VtonServerResponse> {
  const {
    apiKey,
    profile,
    styleMode,
    weatherMood,
    weather,
    angleDeg,
    useTurnaroundSheet,
    serializedSlots,
  } = params;

  const sheetModes = useTurnaroundSheet ? [true, false] : [false];
  let lastReason = 'gemini_no_image_generated';
  let sawBillingQuota = false;
  let sawRateLimit = false;

  for (const turnaroundSheet of sheetModes) {
    const modalityStrategies: Array<{
      responseModalities: Array<'TEXT' | 'IMAGE'>;
      useAspectConfig: boolean;
      aspectRatio: '3:2' | '4:3' | '3:4' | null;
      imageSize?: '1K';
    }> = turnaroundSheet
      ? [
          {
            responseModalities: ['TEXT', 'IMAGE'],
            useAspectConfig: true,
            aspectRatio: '3:2',
            imageSize: '1K',
          },
          { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: true, aspectRatio: '3:2' },
          { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: true, aspectRatio: '4:3' },
          { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: false, aspectRatio: null },
          { responseModalities: ['IMAGE'], useAspectConfig: true, aspectRatio: '3:2' },
          { responseModalities: ['IMAGE'], useAspectConfig: true, aspectRatio: '4:3' },
          { responseModalities: ['IMAGE'], useAspectConfig: false, aspectRatio: null },
        ]
      : [
          {
            responseModalities: ['TEXT', 'IMAGE'],
            useAspectConfig: true,
            aspectRatio: '3:4',
            imageSize: '1K',
          },
          { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: true, aspectRatio: '3:4' },
          { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: false, aspectRatio: null },
          { responseModalities: ['IMAGE'], useAspectConfig: true, aspectRatio: '3:4' },
          { responseModalities: ['IMAGE'], useAspectConfig: false, aspectRatio: null },
        ];

    const parts = buildDirectClientGeminiParts({
      profile,
      styleMode,
      weatherMood,
      weather,
      angleDeg,
      turnaroundSheet,
      serializedSlots,
    });

    for (const model of DIRECT_GEMINI_MODEL_CHAIN) {
      for (let stratIdx = 0; stratIdx < modalityStrategies.length; stratIdx += 1) {
        const { responseModalities, useAspectConfig, aspectRatio, imageSize } =
          modalityStrategies[stratIdx];
        const requestSignal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(55_000)
            : undefined;

        try {
          const generationConfig: Record<string, unknown> = {
            responseModalities,
            ...(useAspectConfig && aspectRatio
              ? {
                  imageConfig: {
                    aspectRatio,
                    ...(imageSize ? { imageSize } : {}),
                  },
                }
              : {}),
          };
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: 'POST',
              signal: requestSignal,
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig,
              }),
            }
          );

          if (!res.ok) {
            const errJson = (await res.json().catch(() => null)) as
              | { error?: { message?: string; status?: string } }
              | null;
            const msg =
              `${errJson?.error?.status || ''} ${errJson?.error?.message || ''}`.toLowerCase();
            if (
              res.status === 400 &&
              (msg.includes('api key not valid') ||
                msg.includes('api_key_invalid') ||
                msg.includes('invalid api key'))
            ) {
              return {
                ok: false,
                fallbackReason: 'gemini_invalid_api_key',
                compositeImageUrl: null,
              };
            }
            if (
              res.status === 400 &&
              stratIdx < modalityStrategies.length - 1 &&
              (useAspectConfig ||
                msg.includes('modalit') ||
                msg.includes('imageconfig') ||
                msg.includes('image_config') ||
                msg.includes('aspect') ||
                msg.includes('invalid_argument') ||
                msg.includes('unknown name'))
            ) {
              continue;
            }
            if (res.status === 401 || res.status === 403) {
              if (msg.includes('leaked') || msg.includes('blocked')) {
                return {
                  ok: false,
                  fallbackReason: 'gemini_leaked_key',
                  compositeImageUrl: null,
                };
              }
              return {
                ok: false,
                fallbackReason:
                  msg.includes('billing') || msg.includes('paid')
                    ? 'gemini_billing_required'
                    : `gemini_http_${res.status}`,
                compositeImageUrl: null,
              };
            }
            if (res.status === 429) {
              if (
                msg.includes('limit: 0') ||
                msg.includes('limit:0') ||
                msg.includes('free_tier') ||
                msg.includes('billing')
              ) {
                sawBillingQuota = true;
                lastReason = 'gemini_billing_required';
              } else {
                sawRateLimit = true;
                if (!sawBillingQuota) {
                  lastReason = 'gemini_http_429';
                }
              }
              break;
            }
            if (!sawBillingQuota && !sawRateLimit) {
              lastReason = `gemini_http_${res.status}`;
            }
            break;
          }

          const payload = (await res.json()) as {
            promptFeedback?: { blockReason?: string };
            candidates?: Array<{
              finishReason?: string;
              content?: {
                parts?: Array<{
                  inlineData?: { mimeType?: string; data?: string };
                  inline_data?: { mime_type?: string; data?: string };
                }>;
              };
            }>;
          };

          for (const cand of payload.candidates || []) {
            for (const part of cand.content?.parts || []) {
              const b64 = (part.inlineData?.data || part.inline_data?.data)?.replace(/\s+/g, '');
              const mime =
                part.inlineData?.mimeType || part.inline_data?.mime_type || 'image/png';
              if (b64 && mime.startsWith('image/')) {
                return {
                  ok: true,
                  cached: false,
                  provider: 'gemini-vton',
                  model,
                  layout: turnaroundSheet ? 'turnaround_3x2' : 'single',
                  styleMode,
                  weatherMood,
                  geminiUsed: true,
                  compositeImageUrl: `data:${mime};base64,${b64}`,
                };
              }
            }
          }

          const finish = String(
            payload.candidates?.[0]?.finishReason ||
              payload.promptFeedback?.blockReason ||
              ''
          ).trim();
          if (!sawBillingQuota && !sawRateLimit) {
            lastReason = finish
              ? `gemini_empty_image_${finish.toLowerCase()}`
              : 'gemini_empty_image_part';
          }
          if (
            responseModalities.includes('TEXT') &&
            (!finish || finish.toUpperCase() === 'STOP')
          ) {
            const imageOnlyIdx = modalityStrategies.findIndex(
              (s) => !s.responseModalities.includes('TEXT')
            );
            if (imageOnlyIdx > stratIdx) {
              stratIdx = imageOnlyIdx - 1;
              continue;
            }
          }
          break;
        } catch (err) {
          const isTimeout =
            err instanceof Error &&
            (err.name === 'TimeoutError' ||
              err.name === 'AbortError' ||
              err.message.toLowerCase().includes('timeout'));
          if (!sawBillingQuota && !sawRateLimit) {
            lastReason = isTimeout ? 'gemini_timeout' : 'gemini_network_error';
          }
          break;
        }
      }
    }

    if (sawBillingQuota) {
      return {
        ok: false,
        fallbackReason: 'gemini_billing_required',
        compositeImageUrl: null,
      };
    }
  }

  return {
    ok: false,
    fallbackReason: sawBillingQuota
      ? 'gemini_billing_required'
      : sawRateLimit
        ? 'gemini_http_429'
        : lastReason,
    compositeImageUrl: null,
  };
}


/**
 * 100% Gemini Multimodal Multi-Angle Virtual Try-On Dispatcher (Weather-Pose + RGBA Cutout v2).
 * - Zero procedural drawing or mathematical 2D mesh warping under ANY circumstance.
 * - Checks L1 Memory + L2 IndexedDB (`CUTOUT_PIPELINE_VERSION + avatarConfigHash + outfitComboId + styleMode + effectiveWeather + angleDeg`) first for 0ms hits.
 * - Requests a 2x2 Turnaround Studio Sheet (`0°`, `45°`, `90°`, `180°`) on flat `#94A3B8` from `/api/vton/synthesize`
 *   (or directly via browser Gemini REST API when running standalone or when backend proxy is unavailable),
 *   cuts out true RGBA transparency (`removeModelBackgroundToPng` + `applyCornerBfsCutoutOnCanvas`),
 *   slices all 4 angles as `image/png`, and caches all 4 slices permanently in IndexedDB.
 */
export async function synthesizeGeminiMultiAngleVton(
  request: AiVtonSynthesisRequest
): Promise<AiVtonSynthesisOutcome> {
  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const styleMode = normalizeVtonStyleMode(request.styleMode);
  const angleDeg = normalizeTurnaroundAngleDeg(request.viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const weatherMood = normalizeWeatherMoodKey(request.weather);
  const effectiveWeather = resolveEffectiveWeatherFromRaw(request.weather);
  const profile = normalizeGenderNeutralProfile(request);
  const { outfitComboId, equippedSlotKeys, equippedGarments } = computeOutfitComboId(
    request.slots
  );

  const cacheKey = buildAiVtonCacheKey({
    avatarConfigHash: profile.avatarConfigHash,
    outfitComboId,
    styleMode,
    effectiveWeather,
    angleDeg,
  });

  if (!request.forceRefresh) {
    const cachedHit = await readCachedAiVtonSlice({
      avatarConfigHash: profile.avatarConfigHash,
      outfitComboId,
      styleMode,
      effectiveWeather,
      angleDeg,
    });
    if (cachedHit) {
      const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {
        [angleDeg]: cachedHit.slice.imageUrl,
      };
      await Promise.all(
        TURNAROUND_ANGLES.map(async (candidateAngle) => {
          if (candidateAngle === angleDeg) return;
          const other = await readCachedAiVtonSlice({
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            effectiveWeather,
            angleDeg: candidateAngle,
          });
          if (other) {
            angleSlices[candidateAngle] = other.slice.imageUrl;
          }
        })
      );
      return {
        ok: true,
        fallbackToFlatLay: false,
        reason: null,
        mode,
        provider: 'gemini-vton',
        styleMode,
        angleDeg,
        weatherMood,
        effectiveWeather,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        cacheKey,
        fromCache: true,
        cacheLayer: cachedHit.layer,
        imageUrl: cachedHit.slice.imageUrl,
        angleSlices,
        equippedCount: equippedGarments.length,
        equippedSlotKeys,
        profile,
        createdAt: cachedHit.slice.updatedAt,
      };
    }
  }

  const useTurnaroundSheet = request.turnaroundSheet !== false;
  const flightKey = `${CUTOUT_PIPELINE_VERSION}::${profile.avatarConfigHash}::${outfitComboId}::${styleMode}::${effectiveWeather}::${useTurnaroundSheet ? 'sheet' : angleDeg}`;

  if (!request.forceRefresh && inFlightAiRequests.has(flightKey)) {
    const shared = await inFlightAiRequests.get(flightKey)!;
    const targetImg = shared.angleSlices[angleDeg] || shared.imageUrl;
    return {
      ...shared,
      angleDeg,
      cacheKey,
      imageUrl: targetImg || null,
    };
  }

  if (request.signal?.aborted) {
    return {
      ok: false,
      fallbackToFlatLay: true,
      reason: 'aborted',
      mode,
      provider: 'flatlay-lookbook',
      styleMode,
      angleDeg,
      weatherMood,
      effectiveWeather,
      avatarConfigHash: profile.avatarConfigHash,
      outfitComboId,
      cacheKey,
      fromCache: false,
      cacheLayer: 'flatlay',
      imageUrl: null,
      angleSlices: {},
      equippedCount: equippedGarments.length,
      equippedSlotKeys,
      profile,
      createdAt: Date.now(),
    };
  }

  const runPromise = (async (): Promise<AiVtonSynthesisOutcome> => {
    try {
      const [serializedSlots, encodedPortrait] = await Promise.all([
        buildMultimodalSlotsPayload(equippedGarments),
        profile.portraitDataUrl
          ? encodeImageUrlToInlineDataUrl(profile.portraitDataUrl)
          : Promise.resolve(null),
      ]);
      const effectivePortraitUrl = encodedPortrait || profile.portraitDataUrl || null;
      const effectiveProfile: NormalizedVtonProfile =
        effectivePortraitUrl !== profile.portraitDataUrl
          ? { ...profile, portraitDataUrl: effectivePortraitUrl }
          : profile;

      const clientGeminiKeys = resolveCandidateClientGeminiApiKeys();
      const clientGeminiKey = clientGeminiKeys[0] || '';
      const envBag = (import.meta.env || {}) as Record<string, string | undefined>;
      const isStaticStandalone = String(envBag.VITE_STATIC_STANDALONE || '') === '1';

      const characterAnchorKey =
        styleMode === 'stylized_isometric' && !effectivePortraitUrl
          ? computeCharacterIdentityAnchorKey(effectiveProfile)
          : null;
      const storedCharacterAnchorUrl = characterAnchorKey
        ? getStoredCharacterIdentityAnchor(characterAnchorKey)
        : null;

      const now = Date.now();
      const garmentLabels = equippedGarments
        .map(({ garment }) => String(garment.name || '').trim())
        .filter(Boolean);
      const slotGarmentIds: Record<string, number | string> = {};
      for (const { slotKey, garment } of equippedGarments) {
        if (garment?.id !== undefined && garment?.id !== null) {
          slotGarmentIds[slotKey] = garment.id;
        }
      }
      const outfitLabel =
        garmentLabels.length > 2
          ? `${garmentLabels.slice(0, 2).join(' · ')} 외 ${garmentLabels.length - 2}`
          : garmentLabels.join(' · ') || '저장된 AI 피팅';

      const isFatalReason = (reason?: string | null): boolean =>
        reason === 'aborted' ||
        reason === 'gemini_api_key_not_configured' ||
        reason === 'gemini_invalid_api_key' ||
        reason === 'gemini_leaked_key' ||
        reason === 'gemini_billing_required';

      const maxQcAttempts = 3;
      let bestValidZeroSlice: string | null = null;
      let lastQcReport: TurnaroundConsistencyQcReport | null = null;
      let lastFailureReason: string | null = null;

      let passedSlices: Partial<Record<TurnaroundAngleDeg, string>> | null = null;
      let passedEntries: CachedAiVtonSlice[] = [];
      let passedCached = false;

      for (let attempt = 1; attempt <= maxQcAttempts; attempt += 1) {
        if (request.signal?.aborted) {
          lastFailureReason = 'aborted';
          break;
        }

        const attemptForceRefresh = Boolean(request.forceRefresh) || attempt > 1;
        let json: VtonServerResponse = {
          ok: false,
          fallbackReason: 'gemini_api_key_not_configured',
          compositeImageUrl: null,
        };
        let rawComposite: string | null = null;
        let synthesisSource: 'gemini' | 'browser-gemini' | null = null;

        if (!isStaticStandalone) {
          const reqHeaders: Record<string, string> = {
            'X-Demo-Mode': 'sample',
          };
          if (clientGeminiKey) {
            reqHeaders['X-Gemini-Api-Key'] = clientGeminiKey;
          }

          try {
            json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify({
                mode,
                styleMode,
                viewAngleDeg: angleDeg,
                turnaroundSheet: useTurnaroundSheet,
                weather: request.weather ?? { mood: weatherMood, effectiveWeather },
                avatarSpec: effectiveProfile.avatarSpec,
                avatarConfigHash: effectiveProfile.avatarConfigHash,
                portraitDataUrl: effectivePortraitUrl,
                profile: {
                  gender: effectiveProfile.gender,
                  dominantHand: effectiveProfile.dominantHand,
                  skinToneHex: effectiveProfile.skinToneHex,
                  personalColor: effectiveProfile.personalColor,
                  heightCm: effectiveProfile.heightCm,
                  weightKg: effectiveProfile.weightKg,
                  bodyShape: effectiveProfile.bodyShape,
                  shoulderScale: effectiveProfile.shoulderScale,
                  waistScale: effectiveProfile.waistScale,
                  hipScale: effectiveProfile.hipScale,
                  portraitDataUrl: effectivePortraitUrl,
                  ...(storedCharacterAnchorUrl
                    ? { characterAnchorDataUrl: storedCharacterAnchorUrl }
                    : {}),
                  avatarSpec: effectiveProfile.avatarSpec,
                  avatarConfigHash: effectiveProfile.avatarConfigHash,
                  styleMode,
                  viewAngleDeg: angleDeg,
                  turnaroundSheet: useTurnaroundSheet,
                },
                slots: serializedSlots,
                forceRefresh: attemptForceRefresh,
              }),
            });
            rawComposite = sanitizeImageCandidate(
              json?.compositeImageUrl ?? json?.afterImageUrl ?? null
            );
            if (
              (rawComposite || json?.panelImages) &&
              json?.geminiUsed !== false &&
              (json?.provider === 'gemini-vton' || Boolean(json?.geminiUsed))
            ) {
              synthesisSource = 'gemini';
            }
          } catch (serverErr) {
            const serverStatus =
              serverErr && typeof serverErr === 'object' && 'status' in serverErr
                ? Number((serverErr as { status?: number }).status)
                : 0;
            json = {
              ok: false,
              fallbackReason:
                serverStatus === 413
                  ? 'payload_too_large'
                  : serverStatus > 0
                    ? `http_${serverStatus}`
                    : 'backend_unavailable',
              compositeImageUrl: null,
            };
            rawComposite = null;
          }
        }

        if (
          !rawComposite &&
          !json?.panelImages &&
          clientGeminiKeys.length > 0 &&
          json?.fallbackReason !== 'aborted'
        ) {
          for (const candidateKey of clientGeminiKeys) {
            const directJson = await synthesizeDirectBrowserGeminiVton({
              apiKey: candidateKey,
              profile: effectiveProfile,
              styleMode,
              weatherMood,
              weather: request.weather,
              angleDeg,
              useTurnaroundSheet,
              serializedSlots,
            });
            const directComposite = sanitizeImageCandidate(
              directJson?.compositeImageUrl ?? directJson?.afterImageUrl ?? null
            );
            json = directJson;
            rawComposite = directComposite;
            if (rawComposite || directJson?.panelImages) {
              synthesisSource = 'browser-gemini';
              break;
            }
            if (directJson?.fallbackReason === 'aborted') {
              break;
            }
          }
        }

        if (!rawComposite && !json?.panelImages) {
          lastFailureReason = json?.fallbackReason || 'gemini_api_key_not_configured';
          if (isFatalReason(lastFailureReason)) {
            break;
          }
          continue;
        }

        const modelName = String(json.model || 'gemini-3.1-flash-image-preview');
        const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {};
        const entriesToPersist: CachedAiVtonSlice[] = [];
        const isTurnaroundResponse = json.layout
          ? json.layout === 'turnaround_3x2' || json.layout === 'turnaround_2x2'
          : useTurnaroundSheet;

        if (json.panelImages && typeof json.panelImages === 'object') {
          for (const a of TURNAROUND_ANGLES) {
            const rawCandidate = sanitizeImageCandidate(json.panelImages[String(a)]);
            if (rawCandidate) {
              const candidate = await ensureTransparentCutout(
                await removeModelBackgroundToPng(rawCandidate)
              );
              const entryCacheKey = buildAiVtonCacheKey({
                avatarConfigHash: profile.avatarConfigHash,
                outfitComboId,
                styleMode,
                effectiveWeather,
                angleDeg: a,
              });
              markCacheKeyTransparentVerified(entryCacheKey);
              angleSlices[a] = candidate;
              entriesToPersist.push({
                cacheKey: entryCacheKey,
                avatarConfigHash: profile.avatarConfigHash,
                outfitComboId,
                styleMode,
                angleDeg: a,
                weatherMood,
                effectiveWeather,
                imageUrl: candidate,
                sheetImageUrl: null,
                outfitLabel,
                garmentLabels,
                slotGarmentIds,
                equippedCount: equippedGarments.length,
                model: modelName,
                updatedAt: now,
              });
            }
          }
        } else if (rawComposite && isTurnaroundResponse) {
          const sliced = await sliceTurnaround2x2Sheet(rawComposite, {
            layout: json.layout || 'turnaround_3x2',
          });

          // Verify full-body head-to-shoe integrity on every slice and auto-repair defective angles
          const integrityEntries = await Promise.all(
            TURNAROUND_ANGLES.map(async (a) => {
              const url = sliced[a];
              if (!url) return [a, { ok: false, reason: 'too_small', fgHeightRatio: 0 }] as const;
              const rep = await inspectCutoutDataUrlIntegrity(url);
              return [a, rep] as const;
            })
          );
          const badAngles = integrityEntries
            .filter(([, rep]) => !rep.ok)
            .map(([a]) => a);

          if (badAngles.length > 0 && !request.signal?.aborted) {
            const repairTargets =
              badAngles.length <= 2
                ? badAngles
                : Array.from(new Set<TurnaroundAngleDeg>([angleDeg, 0, ...badAngles])).slice(0, 6);

            const attemptRepairAngle = async (repairAngle: TurnaroundAngleDeg) => {
              try {
                let repairRaw: string | null = null;
                if (synthesisSource === 'gemini' && !isStaticStandalone) {
                  const reqHeaders: Record<string, string> = { 'X-Demo-Mode': 'sample' };
                  if (clientGeminiKey) reqHeaders['X-Gemini-Api-Key'] = clientGeminiKey;
                  const serverRepair = await apiFetch<VtonServerResponse>('/vton/synthesize', {
                    method: 'POST',
                    headers: reqHeaders,
                    body: JSON.stringify({
                      mode,
                      styleMode,
                      viewAngleDeg: repairAngle,
                      turnaroundSheet: false,
                      weather: request.weather ?? { mood: weatherMood, effectiveWeather },
                      avatarSpec: effectiveProfile.avatarSpec,
                      avatarConfigHash: effectiveProfile.avatarConfigHash,
                      portraitDataUrl: effectivePortraitUrl,
                      profile: {
                        gender: effectiveProfile.gender,
                        dominantHand: effectiveProfile.dominantHand,
                        skinToneHex: effectiveProfile.skinToneHex,
                        personalColor: effectiveProfile.personalColor,
                        heightCm: effectiveProfile.heightCm,
                        weightKg: effectiveProfile.weightKg,
                        bodyShape: effectiveProfile.bodyShape,
                        shoulderScale: effectiveProfile.shoulderScale,
                        waistScale: effectiveProfile.waistScale,
                        hipScale: effectiveProfile.hipScale,
                        portraitDataUrl: effectivePortraitUrl,
                        ...(storedCharacterAnchorUrl
                          ? { characterAnchorDataUrl: storedCharacterAnchorUrl }
                          : {}),
                        avatarSpec: effectiveProfile.avatarSpec,
                        avatarConfigHash: effectiveProfile.avatarConfigHash,
                        styleMode,
                        viewAngleDeg: repairAngle,
                        turnaroundSheet: false,
                      },
                      slots: serializedSlots,
                      forceRefresh: true,
                    }),
                  });
                  repairRaw = sanitizeImageCandidate(
                    serverRepair?.compositeImageUrl ?? serverRepair?.afterImageUrl ?? null
                  );
                }
                if (!repairRaw && clientGeminiKeys.length > 0) {
                  const repairJson = await synthesizeDirectBrowserGeminiVton({
                    apiKey: clientGeminiKeys[0],
                    profile: effectiveProfile,
                    styleMode,
                    weatherMood,
                    weather: request.weather,
                    angleDeg: repairAngle,
                    useTurnaroundSheet: false,
                    serializedSlots,
                  });
                  repairRaw = sanitizeImageCandidate(
                    repairJson?.compositeImageUrl ?? repairJson?.afterImageUrl ?? null
                  );
                }
                if (repairRaw) {
                  const repairCut = await ensureTransparentCutout(
                    await removeModelBackgroundToPng(repairRaw)
                  );
                  const repairCheck = await inspectCutoutDataUrlIntegrity(repairCut);
                  if (repairCheck.ok) {
                    sliced[repairAngle] = repairCut;
                  }
                }
              } catch {
                // ignore single-angle repair failure and fall through to symmetric mirror check
              }
            };

            // Bound concurrency to 3 requests at a time and retry up to 2 attempts if still cropped
            for (let i = 0; i < repairTargets.length; i += 3) {
              await Promise.all(
                repairTargets.slice(i, i + 3).map(async (targetAngle) => {
                  await attemptRepairAngle(targetAngle);
                  const post = sliced[targetAngle]
                    ? await inspectCutoutDataUrlIntegrity(sliced[targetAngle]!)
                    : { ok: false };
                  if (!post.ok && !request.signal?.aborted) {
                    await attemptRepairAngle(targetAngle);
                  }
                })
              );
            }
          }

          // Last-resort headless/half-body guard: mirror opposite valid rear-quarter slice rather than showing headless crops
          for (const a of badAngles) {
            const recheck = sliced[a]
              ? await inspectCutoutDataUrlIntegrity(sliced[a]!)
              : { ok: false };
            if (!recheck.ok) {
              const mirrorPartner: Partial<Record<TurnaroundAngleDeg, TurnaroundAngleDeg[]>> = {
                135: [225, 90],
                225: [135, 90],
                180: [135, 225],
              };
              const candidates = mirrorPartner[a] || [];
              for (const partnerAngle of candidates) {
                if (!sliced[partnerAngle]) continue;
                const partnerCheck = await inspectCutoutDataUrlIntegrity(sliced[partnerAngle]!);
                if (partnerCheck.ok) {
                  sliced[a] =
                    partnerAngle === 135 || partnerAngle === 225
                      ? a === 180
                        ? sliced[partnerAngle]!
                        : await flipDataUrlHorizontally(sliced[partnerAngle]!)
                      : await flipDataUrlHorizontally(sliced[partnerAngle]!);
                  break;
                }
              }
            }
          }

          // Re-normalize ALL 6 final slices together after single-angle repairs so every angle
          // shares identical 3:4 aspect canvas dimensions, 0.94 floor baseline, uniform height, and dead-center spine X.
          await normalizeTurnaroundDataUrlsToFloorBaseline(sliced);

          for (const a of TURNAROUND_ANGLES) {
            const sliceUrl =
              sliced[a] ||
              (await ensureTransparentCutout(await removeModelBackgroundToPng(rawComposite)));
            const entryCacheKey = buildAiVtonCacheKey({
              avatarConfigHash: profile.avatarConfigHash,
              outfitComboId,
              styleMode,
              effectiveWeather,
              angleDeg: a,
            });
            markCacheKeyTransparentVerified(entryCacheKey);
            angleSlices[a] = sliceUrl;
            entriesToPersist.push({
              cacheKey: entryCacheKey,
              avatarConfigHash: profile.avatarConfigHash,
              outfitComboId,
              styleMode,
              angleDeg: a,
              weatherMood,
              effectiveWeather,
              imageUrl: sliceUrl,
              sheetImageUrl: null,
              outfitLabel,
              garmentLabels,
              slotGarmentIds,
              equippedCount: equippedGarments.length,
              model: modelName,
              updatedAt: now,
            });
          }
        } else if (rawComposite) {
          const cutoutComposite = await ensureTransparentCutout(
            await removeModelBackgroundToPng(rawComposite)
          );
          const singleMap: Partial<Record<TurnaroundAngleDeg, string>> = {
            [angleDeg]: cutoutComposite,
          };
          await normalizeTurnaroundDataUrlsToFloorBaseline(singleMap);
          const normalizedSingle = singleMap[angleDeg] || cutoutComposite;
          markCacheKeyTransparentVerified(cacheKey);
          angleSlices[angleDeg] = normalizedSingle;
          entriesToPersist.push({
            cacheKey,
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            angleDeg,
            weatherMood,
            effectiveWeather,
            imageUrl: normalizedSingle,
            sheetImageUrl: null,
            outfitLabel,
            garmentLabels,
            slotGarmentIds,
            equippedCount: equippedGarments.length,
            model: modelName,
            updatedAt: now,
          });
        }

        // Pre-display Pixel QC verification across all generated angles (browser runtime)
        let qcPassed = true;
        if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
          const metricsByAngle: Partial<Record<number, VtonQcSliceMetrics>> = {};
          await Promise.all(
            Object.entries(angleSlices).map(async ([k, url]) => {
              if (!url) return;
              const m = await inspectDataUrlQcMetrics(url);
              if (m) {
                metricsByAngle[Number(k)] = m;
              }
            })
          );
          if (Object.keys(metricsByAngle).length > 0) {
            if (isTurnaroundResponse) {
              const qc = evaluateTurnaroundConsistencyQc(metricsByAngle);
              lastQcReport = qc;
              if (qc.frontValid && angleSlices[0]) {
                bestValidZeroSlice = angleSlices[0];
              }
              qcPassed = qc.ok;
            } else {
              const m = metricsByAngle[angleDeg] ?? metricsByAngle[0];
              if (m) {
                const singleOk =
                  !m.clippedTop &&
                  !m.clippedBottom &&
                  !m.halfBody &&
                  m.fgHeightRatio >= 0.48 &&
                  m.interiorChromaRatio <= 0.045;
                if (singleOk && (angleSlices[0] || angleSlices[angleDeg])) {
                  bestValidZeroSlice = angleSlices[0] || angleSlices[angleDeg] || bestValidZeroSlice;
                }
                qcPassed = singleOk;
              }
            }
          }
        }

        if (qcPassed) {
          passedSlices = angleSlices;
          passedEntries = entriesToPersist;
          passedCached = Boolean(json.cached);
          if (
            characterAnchorKey &&
            angleSlices[0] &&
            (synthesisSource === 'browser-gemini' || synthesisSource === 'gemini')
          ) {
            const anchorBackdropHex = selectOptimalStudioKeyHex(
              extractStudioKeyColorInputs(serializedSlots)
            );
            await saveCharacterIdentityAnchorFromZeroSlice({
              anchorKey: characterAnchorKey,
              zeroSliceDataUrl: angleSlices[0],
              backdropHex: anchorBackdropHex,
            });
          }
          break;
        }
      }

      if (!passedSlices) {
        if (!isFatalReason(lastFailureReason)) {
          logVtonQcFailure({
            outfitComboId,
            avatarConfigHash: profile.avatarConfigHash,
            attempts: maxQcAttempts,
            reasons: lastQcReport?.reasons || [lastFailureReason || 'qc_failed'],
            failedAngles: lastQcReport?.failedAngles || [],
            frontOnlyFallback: Boolean(bestValidZeroSlice),
          });
        }

        if (bestValidZeroSlice && !isFatalReason(lastFailureReason)) {
          const zeroCacheKey = buildAiVtonCacheKey({
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            effectiveWeather,
            angleDeg: 0,
          });
          return {
            ok: true,
            fallbackToFlatLay: false,
            frontOnlyDegraded: true,
            reason: 'qc_front_only_fallback',
            mode,
            provider: 'gemini-vton',
            styleMode,
            angleDeg: 0,
            weatherMood,
            effectiveWeather,
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            cacheKey: zeroCacheKey,
            fromCache: false,
            cacheLayer: 'fresh',
            imageUrl: bestValidZeroSlice,
            angleSlices: { 0: bestValidZeroSlice },
            equippedCount: equippedGarments.length,
            equippedSlotKeys,
            profile,
            createdAt: now,
          };
        }

        return {
          ok: false,
          fallbackToFlatLay: true,
          frontOnlyDegraded: false,
          reason: lastFailureReason || 'gemini_api_key_not_configured',
          mode,
          provider: 'flatlay-lookbook',
          styleMode,
          angleDeg,
          weatherMood,
          effectiveWeather,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          cacheKey,
          fromCache: false,
          cacheLayer: 'flatlay',
          imageUrl: null,
          angleSlices: {},
          equippedCount: equippedGarments.length,
          equippedSlotKeys,
          profile,
          createdAt: Date.now(),
        };
      }

      await persistAiVtonSlices(passedEntries);

      const finalImg = passedSlices[angleDeg] || passedSlices[0] || null;
      if (!finalImg) {
        return {
          ok: false,
          fallbackToFlatLay: true,
          frontOnlyDegraded: false,
          reason: 'gemini_empty_image_part',
          mode,
          provider: 'flatlay-lookbook',
          styleMode,
          angleDeg,
          weatherMood,
          effectiveWeather,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          cacheKey,
          fromCache: false,
          cacheLayer: 'flatlay',
          imageUrl: null,
          angleSlices: {},
          equippedCount: equippedGarments.length,
          equippedSlotKeys,
          profile,
          createdAt: now,
        };
      }

      return {
        ok: true,
        fallbackToFlatLay: false,
        frontOnlyDegraded: false,
        reason: null,
        mode,
        provider: 'gemini-vton',
        styleMode,
        angleDeg,
        weatherMood,
        effectiveWeather,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        cacheKey,
        fromCache: passedCached,
        cacheLayer: passedCached ? 'server' : 'fresh',
        imageUrl: finalImg,
        angleSlices: passedSlices,
        equippedCount: equippedGarments.length,
        equippedSlotKeys,
        profile,
        createdAt: now,
      };
    } catch (err) {
      const isAbort =
        Boolean(request.signal?.aborted) ||
        (err instanceof Error && err.name === 'AbortError');
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : 0;
      const reason = isAbort
        ? 'aborted'
        : status === 413
          ? 'payload_too_large'
          : status > 0
            ? `http_${status}`
            : 'network_or_runtime_error';
      return {
        ok: false,
        fallbackToFlatLay: true,
        reason,
        mode,
        provider: 'flatlay-lookbook',
        styleMode,
        angleDeg,
        weatherMood,
        effectiveWeather,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        cacheKey,
        fromCache: false,
        cacheLayer: 'flatlay',
        imageUrl: null,
        angleSlices: {},
        equippedCount: equippedGarments.length,
        equippedSlotKeys,
        profile,
        createdAt: Date.now(),
      };
    } finally {
      inFlightAiRequests.delete(flightKey);
    }
  })();

  if (!request.forceRefresh) {
    inFlightAiRequests.set(flightKey, runPromise);
  }
  return runPromise;
}
