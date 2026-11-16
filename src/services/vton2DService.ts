import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { getStudioSeedImageForGarment, resolveStudioSeedUrl } from '../shared/garmentTaxonomy.js';
import { apiFetch } from '../utils/api.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import {
  type AvatarSpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
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
  type EffectiveWeatherMode,
  LEGACY_CUTOUT_PIPELINE_VERSIONS,
  buildTurnaround3x2SheetAngleDirectives,
  buildTurnaroundAnglePromptDirective,
  buildWeatherPosePromptDirectives,
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
const L2_MAX_ENTRIES = 240;
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
  'jwl_brooch',
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
    return 1.14;
  }
  const isCompact = sw <= 1060;
  const topPad = isCompact ? 34 : 38;
  const bottomPad = isCompact ? 48 : 50;
  const sidePad = isCompact ? 8 : 12;
  const availW = Math.max(120, sw - sidePad * 2);
  const availH = Math.max(160, sh - topPad - bottomPad);
  const rawAspect = Number(params?.imageAspectRatio);
  const imgAspect =
    Number.isFinite(rawAspect) && rawAspect > 0.25 ? clamp(rawAspect, 0.45, 1.45) : 0.76;

  const renderedBoxH = Math.min(availH, availW / imgAspect);
  const widthChokeCompensation = availH / Math.max(1, renderedBoxH);
  const stageAspect = sw / sh;
  const presenceBoost = stageAspect < 0.85 ? 1.11 : stageAspect < 1.25 ? 1.09 : 1.08;

  const renderedBoxW = renderedBoxH * imgAspect;
  const maxHorizontalScale = (sw * 0.94) / Math.max(1, renderedBoxW * 0.62);
  const rawIdeal = widthChokeCompensation * presenceBoost;
  return Math.round(clamp(Math.min(rawIdeal, maxHorizontalScale), 1.05, 1.44) * 1000) / 1000;
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

export async function listCachedAiVtonOutfits(limit = 20): Promise<AiVtonHistoryEntry[]> {
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

/**
 * Pure raster single-subject isolator for VTON turnaround quadrants.
 * Detects if Gemini accidentally rendered 2 side-by-side twin/duplicate models inside a wide slice
 * (separated by transparent alpha or studio backdrop `#94A3B8` / `#F5F5F7`) and cleanly crops &
 * centers the single primary figure while preserving RGBA transparency.
 */
function isolateSingleSubjectInSlice(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
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

  // Estimate studio backdrop RGB + transparency from 4 corners
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
  const bgR = rSamples[midIdx] ?? 148;
  const bgG = gSamples[midIdx] ?? 163;
  const bgB = bSamples[midIdx] ?? 184;

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
  if (rawRuns.length < 2) return srcCanvas;

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
  if (humanIslands.length < 2) return srcCanvas;

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
  if (!hasTrueSeparation) return srcCanvas;

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

function measureOpaqueVerticalBounds(
  canvas: HTMLCanvasElement
): { minY: number; maxY: number; minX: number; maxX: number; fgPixels: number } | null {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 16 || ch < 16) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, cw, ch).data;

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
 * Ensures all sliced turnaround angles (`0°`, `45°`, `90°`, `135°`, `180°`, `225°`) stand on a unified
 * bottom floor baseline with generous shoe clearance and consistent full-body height so
 * quarter/rear-quarter angles never appear high-angle, zoomed-in, or cropped at the feet.
 * Preserves bit-exact pixels (zero resampling) when slices already share an aligned baseline.
 */
function normalizeTurnaroundCanvasesToFloorBaseline(
  canvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>>
): void {
  const activeAngles = TURNAROUND_ANGLES.filter((angle) => Boolean(canvases[angle]));
  if (activeAngles.length < 2) return;

  const boundsByAngle = {} as Partial<
    Record<TurnaroundAngleDeg, ReturnType<typeof measureOpaqueVerticalBounds>>
  >;
  const heights: number[] = [];
  const bottoms: number[] = [];

  for (const angle of activeAngles) {
    const b = measureOpaqueVerticalBounds(canvases[angle]!);
    boundsByAngle[angle] = b;
    if (b) {
      heights.push(b.maxY - b.minY + 1);
      bottoms.push(b.maxY);
    }
  }

  if (heights.length < 2) return;

  const sortedH = heights.slice().sort((a, b) => a - b);
  const medianFgH = sortedH[Math.floor(sortedH.length / 2)];
  const sortedBottoms = bottoms.slice().sort((a, b) => a - b);
  const medianBottom = sortedBottoms[Math.floor(sortedBottoms.length / 2)];

  for (const angle of activeAngles) {
    const c = canvases[angle];
    const b = boundsByAngle[angle];
    if (!c || !b) continue;
    const cw = c.width;
    const ch = c.height;
    if (ch < 64) continue;

    const fgH = b.maxY - b.minY + 1;
    const targetIdealH = Math.round(ch * 0.855);
    const targetMaxAllowedH = Math.round(ch * 0.885);
    const canonicalFloorY = Math.min(
      Math.round(ch * 0.95),
      Math.max(Math.round(ch * 0.88), medianBottom)
    );
    const targetFloorY =
      ch >= 180
        ? Math.round(ch * 0.948)
        : medianBottom > Math.round(ch * 0.955)
          ? Math.round(ch * 0.935)
          : canonicalFloorY;

    const heightDiffRatio = medianFgH > 0 ? Math.abs(fgH - medianFgH) / medianFgH : 0;
    const isUndersizedFullBody = ch >= 180 && medianFgH < Math.round(ch * 0.81);
    const needsScaleNormalization =
      ch >= 180 &&
      (fgH > Math.round(ch * 0.895) || heightDiffRatio > 0.065 || isUndersizedFullBody);
    const bottomDelta = targetFloorY - b.maxY;

    const fgW = b.maxX - b.minX + 1;
    const srcCx = b.minX + fgW * 0.5;
    const horizOffsetPx = Math.abs(cw * 0.5 - srcCx);

    if (!needsScaleNormalization && Math.abs(bottomDelta) <= 3 && horizOffsetPx <= 4) {
      continue;
    }

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
    cCtx.clearRect(0, 0, cw, ch);
    cCtx.imageSmoothingEnabled = true;
    cCtx.imageSmoothingQuality = 'high';

    if (needsScaleNormalization) {
      const uniformDesiredFgH = isUndersizedFullBody
        ? Math.min(targetMaxAllowedH, Math.max(medianFgH, targetIdealH))
        : Math.min(targetMaxAllowedH, medianFgH);
      const maxTopSafeScale =
        (targetFloorY - Math.round(ch * 0.035)) / Math.max(1, fgH);
      const maxWidthSafeScale = (cw * 0.92) / Math.max(1, fgW);
      const scale = clamp(
        Math.min(uniformDesiredFgH / Math.max(1, fgH), maxTopSafeScale, maxWidthSafeScale),
        0.76,
        1.22
      );
      const dstW = Math.round(cw * scale);
      const dstH = Math.round(ch * scale);
      const dstX = Math.round(cw * 0.5 - srcCx * scale);
      const dstY = Math.round(targetFloorY - b.maxY * scale);
      cCtx.drawImage(scratch, 0, 0, cw, ch, dstX, dstY, dstW, dstH);
    } else {
      // Pure integer translation centering X & grounding Y — zero pixel resampling blur!
      const clampedDx = Math.round(cw * 0.5 - srcCx);
      const clampedDy = clamp(
        Math.round(bottomDelta),
        Math.round(ch * 0.03) - b.minY,
        ch - 2 - b.maxY
      );
      cCtx.drawImage(scratch, clampedDx, clampedDy);
    }

    scratch.width = 0;
    scratch.height = 0;
  }

  // Trim excess horizontal square transparent margins symmetrically to a ~3:4 portrait canvas
  // so narrow mobile viewports (`object-fit: contain`) never width-choke full-body characters!
  let maxPostFgW = 0;
  let minCanvasW = Infinity;
  let refCanvasH = 0;
  for (const angle of activeAngles) {
    const c = canvases[angle];
    if (!c || c.height < 180 || c.width < 180) {
      minCanvasW = 0;
      break;
    }
    refCanvasH = c.height;
    minCanvasW = Math.min(minCanvasW, c.width);
    const postB = measureOpaqueVerticalBounds(c);
    if (postB) {
      const symmetricSpan =
        Math.max(Math.abs(postB.minX - c.width * 0.5), Math.abs(postB.maxX - c.width * 0.5)) * 2;
      maxPostFgW = Math.max(maxPostFgW, symmetricSpan);
    }
  }

  if (minCanvasW >= 180 && refCanvasH >= 180 && maxPostFgW > 0) {
    const desiredPortraitW = Math.max(
      Math.round(refCanvasH * 0.74),
      Math.ceil(maxPostFgW + refCanvasH * 0.08)
    );
    if (desiredPortraitW < minCanvasW - 16) {
      for (const angle of activeAngles) {
        const c = canvases[angle];
        if (!c) continue;
        const oldW = c.width;
        const oldH = c.height;
        const cropX = Math.max(0, Math.round((oldW - desiredPortraitW) * 0.5));
        const scratch = document.createElement('canvas');
        scratch.width = desiredPortraitW;
        scratch.height = oldH;
        const sCtx = scratch.getContext('2d');
        const cCtx = c.getContext('2d', { willReadFrequently: true });
        if (sCtx && cCtx) {
          sCtx.drawImage(c, cropX, 0, desiredPortraitW, oldH, 0, 0, desiredPortraitW, oldH);
          c.width = desiredPortraitW;
          c.height = oldH;
          cCtx.clearRect(0, 0, desiredPortraitW, oldH);
          cCtx.drawImage(scratch, 0, 0);
        }
        scratch.width = 0;
        scratch.height = 0;
      }
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

/**
 * Detects whether a lateral or oblique (`45°`, `90°`, `135°`, `225°`) cutout human silhouette faces
 * screen-left or screen-right by comparing forefoot/toe overhang against ankle/lower-shin alignment
 * (immune to overhead umbrellas, hats, or shoulder bags), with a head facial/ear skin-centroid fallback
 * when floor-length coats or dresses cover the ankles.
 */
function detectLateralCanvasFacingDirection(
  canvas: HTMLCanvasElement
): 'left' | 'right' | 'neutral' {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw < 180 || ch < 180) return 'neutral';
  const bounds = measureOpaqueVerticalBounds(canvas);
  if (!bounds) return 'neutral';
  const fgH = bounds.maxY - bounds.minY + 1;
  const fgW = bounds.maxX - bounds.minX + 1;
  if (fgH < 96 || fgW < 24) return 'neutral';

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'neutral';
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return 'neutral';
  }

  const ankleY0 = Math.max(bounds.minY, bounds.maxY - Math.round(fgH * 0.21));
  const ankleY1 = Math.max(ankleY0, bounds.maxY - Math.round(fgH * 0.105));
  const footY0 = Math.max(ankleY1 + 1, bounds.maxY - Math.round(fgH * 0.072));
  const footY1 = bounds.maxY;

  let ankleMinX = cw;
  let ankleMaxX = -1;
  let ankleSumX = 0;
  let ankleCount = 0;

  for (let y = ankleY0; y <= ankleY1; y += 1) {
    const row = y * cw * 4;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
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
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
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

  // Fallback for ankle-length coats/dresses: warm skin centroid in head band vs head opaque midpoint
  const headY0 = Math.min(bounds.maxY, bounds.minY + Math.round(fgH * 0.035));
  const headY1 = Math.min(bounds.maxY, bounds.minY + Math.round(fgH * 0.115));
  let headMinX = cw;
  let headMaxX = -1;
  let skinSumX = 0;
  let skinCount = 0;

  for (let y = headY0; y <= headY1; y += 1) {
    const row = y * cw * 4;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = row + x * 4;
      if (data[idx + 3] < 150) continue;
      if (x < headMinX) headMinX = x;
      if (x > headMaxX) headMaxX = x;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r >= 95 && r > g + 8 && g > b + 4) {
        skinSumX += x;
        skinCount += 1;
      }
    }
  }

  const headW = headMaxX - headMinX + 1;
  if (skinCount >= 16 && headW >= 14) {
    const headMidX = (headMinX + headMaxX) * 0.5;
    const skinOffset = skinSumX / skinCount - headMidX;
    const minSkinShift = Math.max(2.5, headW * 0.07);
    if (skinOffset < -minSkinShift) return 'left';
    if (skinOffset > minSkinShift) return 'right';
  }

  return 'neutral';
}

interface HorizontalSpan {
  x0: number;
  x1: number;
}

function detectRowSubjectClusters(
  sheetCtx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  y1: number
): HorizontalSpan[] {
  const rowH = y1 - y0;
  if (w < 240 || rowH < 120) return [];
  let data: Uint8ClampedArray;
  try {
    data = sheetCtx.getImageData(0, y0, w, rowH).data;
  } catch {
    return [];
  }

  const colHits = new Uint16Array(w);
  const yStart = Math.max(2, Math.round(rowH * 0.04));
  const yEnd = Math.min(rowH - 2, Math.round(rowH * 0.96));
  const edgeXs = [2, Math.min(8, w - 1), Math.max(0, w - 9), Math.max(0, w - 3)];

  for (let y = yStart; y < yEnd; y += 2) {
    const rowOff = y * w * 4;
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
    const bgR = (rs[1] + rs[2]) * 0.5;
    const bgG = (gs[1] + gs[2]) * 0.5;
    const bgB = (bs[1] + bs[2]) * 0.5;

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
  const minClusterWidth = Math.max(18, Math.round(w * 0.045));
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

function resolveThreeColumnCropSpans(
  clusters: HorizontalSpan[],
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
  const trimX = Math.max(1, Math.round(colW * 0.012));
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
 * Runs `isolateSingleSubjectInSlice` + V4 hole-aware `applyCornerBfsCutoutOnCanvas` +
 * gaze-direction normalization + `normalizeTurnaroundCanvasesToFloorBaseline`.
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

        const isExplicit2x2 = options?.layout === 'turnaround_2x2' || w < 256 || h < 256;
        const isHorizontal1x6Strip = !isExplicit2x2 && w / h >= 3.15;
        const isHorizontal1x4Strip = !isHorizontal1x6Strip && w / h >= 2.15;

        let topClusters: HorizontalSpan[] = [];
        let botClusters: HorizontalSpan[] = [];
        const halfH = Math.floor(h / 2);

        if (!isExplicit2x2 && !isHorizontal1x6Strip && !isHorizontal1x4Strip) {
          const probeCanvas = document.createElement('canvas');
          probeCanvas.width = w;
          probeCanvas.height = h;
          const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
          if (probeCtx) {
            probeCtx.drawImage(img, 0, 0);
            topClusters = detectRowSubjectClusters(probeCtx, w, 0, halfH);
            botClusters = detectRowSubjectClusters(probeCtx, w, halfH, h);
          }
          probeCanvas.width = 0;
          probeCanvas.height = 0;
        }

        const use3x2Grid =
          !isExplicit2x2 &&
          !isHorizontal1x6Strip &&
          !isHorizontal1x4Strip &&
          (options?.layout === 'turnaround_3x2' ||
            topClusters.length >= 3 ||
            botClusters.length >= 3 ||
            (w / h >= 1.18 && !(topClusters.length === 2 && botClusters.length === 2)));

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
          const trimY = Math.max(1, Math.round(halfH * 0.012));
          const ch = Math.max(16, halfH - trimY * 2);
          const topSpans = resolveThreeColumnCropSpans(topClusters, w);
          const botSpans = resolveThreeColumnCropSpans(botClusters, w);
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
              sy: trimY,
              cw: Math.max(16, topSpans[i].x1 - topSpans[i].x0),
              ch,
            })),
            ...botAngles.map((angle, i) => ({
              angle,
              sx: botSpans[i].x0,
              sy: halfH + trimY,
              cw: Math.max(16, botSpans[i].x1 - botSpans[i].x0),
              ch,
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
          const trimX = Math.max(1, Math.round(halfW * 0.012));
          const trimY = Math.max(1, Math.round(halfH * 0.012));
          const cw = Math.max(16, halfW - trimX * 2);
          const ch = Math.max(16, halfH - trimY * 2);
          panels = [
            { angle: 0, sx: trimX, sy: trimY, cw, ch },
            { angle: 45, sx: halfW + trimX, sy: trimY, cw, ch },
            { angle: 90, sx: trimX, sy: halfH + trimY, cw, ch },
            { angle: 180, sx: halfW + trimX, sy: halfH + trimY, cw, ch },
          ];
        }

        const out = {} as Record<TurnaroundAngleDeg, string>;
        const cutCanvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>> = {};
        const extraCanvases: HTMLCanvasElement[] = [];

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
          ctx.drawImage(img, p.sx, p.sy, p.cw, p.ch, 0, 0, p.cw, p.ch);
          const finalCanvas = isolateSingleSubjectInSlice(cropCanvas);
          if (finalCanvas !== cropCanvas) {
            extraCanvases.push(cropCanvas);
          }
          applyCornerBfsCutoutOnCanvas(finalCanvas);

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

        for (const angle of TURNAROUND_ANGLES) {
          const c = cutCanvases[angle];
          if (c) {
            out[angle] = c.toDataURL('image/png');
            c.width = 0;
            c.height = 0;
          }
        }
        // Populate rear-quarter keys cleanly when slicing legacy/mock 4-panel 2x2 sheets
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

export function peekShowcaseDemoVtonSlice(
  styleMode: VtonStyleMode,
  angleDeg: number
): string | null {
  const normalizedStyle = normalizeVtonStyleMode(styleMode);
  const normalizedAngle = normalizeTurnaroundAngleDeg(angleDeg, DEFAULT_TURNAROUND_ANGLE);
  return showcaseMemorySlices[normalizedStyle]?.[normalizedAngle] || null;
}

export async function loadShowcaseDemoVtonSlices(
  rawStyleMode?: string | null
): Promise<Record<TurnaroundAngleDeg, string> | null> {
  const styleMode = normalizeVtonStyleMode(rawStyleMode);
  if (showcaseMemorySlices[styleMode]) {
    return showcaseMemorySlices[styleMode]!;
  }
  if (showcaseInFlight[styleMode]) {
    return showcaseInFlight[styleMode]!;
  }

  const job = (async (): Promise<Record<TurnaroundAngleDeg, string> | null> => {
    try {
      const assetPath =
        styleMode === 'stylized_isometric'
          ? '/seed/vton-showcase-3x2-stylized.jpg'
          : '/seed/vton-showcase-3x2-photoreal.jpg';
      const sheetUrl = withPublicBaseUrl(assetPath);
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
  'gemini-3-pro-image-preview',
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

function buildDirectClientGeminiParts(params: {
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

  const equippedColorHexes = Object.values(serializedSlots).map((it) =>
    typeof it.color_hex === 'string' ? it.color_hex : null
  );
  const optimalBackdropHex = selectOptimalStudioKeyHex(equippedColorHexes);

  const weatherBundle = buildWeatherPosePromptDirectives({
    weather: weather ?? { mood: weatherMood },
    hasEquippedUmbrella: hasUmbrella,
    turnaroundSheet,
    equippedColorHexes,
  });

  const header = isStylized
    ? 'Stylized Isometric Simulation Character VTON lookbook (dimensional character, natural hair/hands, authentic fabric texture, zero flat vector polygons).'
    : 'Photorealistic SSENSE/COS Studio VTON lookbook photograph (85mm lens, realistic skin, natural hair/hands, accurate garment drape).';

  const cameraLine = turnaroundSheet
    ? `4:3 Borderless 3x2 Turnaround Sheet (STRICTLY 3 EQUAL COLUMNS BY 2 EQUAL ROWS = EXACTLY 6 PORTRAIT PANELS TOTAL — NEVER 4 COLUMNS, NEVER 8 FIGURES — on 100% flat solid uniform chromakey-free studio (${optimalBackdropHex}) backdrop including 100% flat shadowless ${optimalBackdropHex} inside every enclosed gap under umbrellas, between arms/torso, between legs, and inside bag handles, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne weather particles, zero lines/text) of the EXACT SAME person & outfit:\n${buildTurnaround3x2SheetAngleDirectives()}\n${weatherBundle.headroomPrompt} STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary human figure centered inside each of the 6 panels (total 6 figures in the entire sheet — NEVER draw duplicate/twin models inside any panel).`
    : `Full-body studio portrait (${angleDeg}°) on 100% flat solid uniform chromakey-free studio (${optimalBackdropHex}) backdrop including 100% flat shadowless ${optimalBackdropHex} inside every enclosed gap, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne weather particles, zero text. CAMERA ANGLE REQUIREMENT: ${buildTurnaroundAnglePromptDirective(angleDeg)} ${weatherBundle.headroomPrompt} STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary human figure centered in frame (NEVER draw duplicate/twin models).`;

  const bmi = Number((profile.weightKg / (profile.heightCm / 100) ** 2).toFixed(1));
  const bodyLock = `Model: ${profile.weightKg && profile.heightCm ? `${profile.heightCm}cm/${profile.weightKg}kg` : '172cm/64kg'} (BMI ${bmi}, faithful body/face/limb volume), frame=${spec.framePreset}, archetype=${spec.archetypePreset}, chest=${anthro.chestForm}, skin=${profile.skinToneHex} (MST-${app.mstLevel}-${app.mstUndertone}), hair=${app.hairStyle} (${app.hairColorHex}), beard=${app.facialHair}.\n${weatherBundle.combinedPrompt}`;

  const parts: Array<Record<string, unknown>> = [
    { text: `${header}\n${cameraLine}\n${bodyLock}` },
  ];

  const portraitPart = parseDataUrlInlinePart(profile.portraitDataUrl);
  if (portraitPart) {
    parts.push({
      text: `[CRITICAL USER FACE IDENTITY LOCK — PRIMARY LIKENESS PHOTO BELOW]: The model's face MUST look unmistakably like this exact person in the attached photo! Reproduce their exact facial bone structure, eye shape, eyelid fold, eyebrows, nose bridge/tip, lips, cheek contour, jawline, and hairstyle/hairline across 0° Front, 45° Screen-Right Quarter (facing VIEWER'S RIGHT with face, both eyes, nose, chin 100% visible), and 90° Screen-Right Side Profile (facing VIEWER'S RIGHT); on 135° Back-Right (Row 2 Left) and 225° Back-Left (Row 2 Right) render the matching rear-quarter hairstyle, ear, and lost-profile cheek/jawline contour facing diagonally away (rightward on 135°, leftward on 225°); and on Row 2 Center 180° Straight Back render ONLY the symmetrical back of the head & rear hair silhouette (STRICTLY ZERO front face on 180° Back) in ${isStylized ? 'stylized character' : 'photorealistic'} style with skin tone ${profile.skinToneHex}. NEVER substitute a generic stock model face:`,
    });
    parts.push({ inlineData: portraitPart });
  }

  const slotPlacementPrompts: Record<string, string> = {
    accessory: 'carried naturally on shoulder or in hand as main bag/tote/briefcase',
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
    text: `Wear ALL equipped garments, body-part accessories, and jewelry above simultaneously on their exact specified left/right body parts against a 100% flat solid uniform chromakey-free neutral mid-slate (${CUTOUT_STAGE_BACKDROP_HEX}) backdrop, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO airborne rain/snow streaks in background. Strictly ONE solitary person per panel. Return image only.`,
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
  const modalityStrategies: Array<{
    responseModalities: Array<'TEXT' | 'IMAGE'>;
    useAspectConfig: boolean;
  }> = [
    { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: true },
    { responseModalities: ['TEXT', 'IMAGE'], useAspectConfig: false },
    { responseModalities: ['IMAGE'], useAspectConfig: false },
  ];
  let lastReason = 'gemini_no_image_generated';
  let sawBillingQuota = false;
  let sawRateLimit = false;

  for (const turnaroundSheet of sheetModes) {
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
        const { responseModalities, useAspectConfig } = modalityStrategies[stratIdx];
        const requestSignal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(55_000)
            : undefined;

        try {
          const generationConfig: Record<string, unknown> = {
            responseModalities,
            ...(useAspectConfig
              ? { imageConfig: { aspectRatio: turnaroundSheet ? '4:3' : '3:4' } }
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
              (msg.includes('modalit') ||
                msg.includes('imageconfig') ||
                msg.includes('image_config') ||
                msg.includes('aspect') ||
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

      let json: VtonServerResponse = {
        ok: false,
        fallbackReason: 'gemini_api_key_not_configured',
        compositeImageUrl: null,
      };
      let rawComposite: string | null = null;

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
                skinToneHex: effectiveProfile.skinToneHex,
                personalColor: effectiveProfile.personalColor,
                heightCm: effectiveProfile.heightCm,
                weightKg: effectiveProfile.weightKg,
                bodyShape: effectiveProfile.bodyShape,
                shoulderScale: effectiveProfile.shoulderScale,
                waistScale: effectiveProfile.waistScale,
                hipScale: effectiveProfile.hipScale,
                portraitDataUrl: effectivePortraitUrl,
                avatarSpec: effectiveProfile.avatarSpec,
                avatarConfigHash: effectiveProfile.avatarConfigHash,
                styleMode,
                viewAngleDeg: angleDeg,
                turnaroundSheet: useTurnaroundSheet,
              },
              slots: serializedSlots,
              forceRefresh: Boolean(request.forceRefresh),
            }),
          });
          rawComposite = sanitizeImageCandidate(
            json?.compositeImageUrl ?? json?.afterImageUrl ?? null
          );
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
          if (rawComposite || directJson?.panelImages || directJson?.fallbackReason === 'aborted') {
            break;
          }
        }
      }

      if (!rawComposite && !json?.panelImages) {
        return {
          ok: false,
          fallbackToFlatLay: true,
          reason: json?.fallbackReason || 'gemini_api_key_not_configured',
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

      const now = Date.now();
      const modelName = String(json.model || 'gemini-3.1-flash-image');
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
        markCacheKeyTransparentVerified(cacheKey);
        angleSlices[angleDeg] = cutoutComposite;
        entriesToPersist.push({
          cacheKey,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          styleMode,
          angleDeg,
          weatherMood,
          effectiveWeather,
          imageUrl: cutoutComposite,
          sheetImageUrl: null,
          outfitLabel,
          garmentLabels,
          slotGarmentIds,
          equippedCount: equippedGarments.length,
          model: modelName,
          updatedAt: now,
        });
      }

      await persistAiVtonSlices(entriesToPersist);

      const finalImg = angleSlices[angleDeg] || null;
      if (!finalImg) {
        return {
          ok: false,
          fallbackToFlatLay: true,
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
        fromCache: Boolean(json.cached),
        cacheLayer: json.cached ? 'server' : 'fresh',
        imageUrl: finalImg,
        angleSlices,
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
