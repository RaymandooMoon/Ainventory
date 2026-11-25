import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import {
  getStudioSeedImageForGarment,
  inferBagCarrySpec,
  resolveStudioSeedUrl,
} from '../shared/garmentTaxonomy.js';
import { computeHeightAwareStageFraming } from '../utils/stageFramingEngine.ts';
import {
  apiFetch,
  getStoredToken,
  isSampleDemoMode,
  isStaticStandaloneWithoutApi,
} from '../utils/api.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import {
  type AvatarDominantHand,
  type AvatarSpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  patchAvatarSpec,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
import {
  fetchServerProfileConfig,
  getCachedServerHandedness,
} from './profileConfigService.ts';
import {
  type DominantHand,
  type MasterAnchorLandmarks,
  type TurnaroundConsistencyQcReport,
  type VtonQcSliceMetrics,
  computeBagAssetPlacementBox,
  computeMasterLandmarkAlignment,
  evaluateTurnaroundConsistencyQc,
  inspectPixelSliceQc,
  isBagGarmentItem,
  logVtonQcFailure,
  mirrorRgbaPixelBufferHorizontally,
  normalizeHandedness,
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
  LEGACY_CUTOUT_PIPELINE_VERSIONS,
  type StudioKeyColorInput,
  normalizeCanonicalAvatarGender,
  resolveEffectiveWeatherFromRaw,
  selectOptimalStudioKeyHex,
} from './weatherPromptBuilder.ts';
import {
  PROGRESSIVE_ANGLE_WAVES,
  selectSecondaryAnchorAngle,
} from './vtonProgressiveState.ts';

export type CanonicalViewerMode = '2d-vton';

export type ViewerStageMode = 'flatlay' | 'ai-vton';

export type VtonStyleMode = 'photorealistic' | 'stylized_isometric';

export type TurnaroundAngleDeg = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export type Turnaround360AngleDeg = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export const TURNAROUND_ANGLES: readonly TurnaroundAngleDeg[] = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const;

const LEGACY_SHEET_6_ANGLES: readonly TurnaroundAngleDeg[] = [
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
  handedness?: AvatarDominantHand | 'right-handed' | 'left-handed' | string | null;
  dominantHand?: AvatarDominantHand | 'right-handed' | 'left-handed' | string | null;
}

export interface AiVtonSynthesisRequest extends GenderNeutralProfileInput {
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null;
  viewAngleDeg?: number;
  styleMode?: VtonStyleMode;
  // oxlint-disable-next-line typescript/no-explicit-any
  weather?: Record<string, any> | string | null;
  turnaroundSheet?: boolean;
  turnaroundLayout?: 'turnaround_4x2' | 'turnaround_3x2';
  theme?: 'light' | 'dark';
  legacyMode?: unknown;
  mode?: unknown;
  forceRefresh?: boolean;
  masterAnchorDataUrl?: string | null;
  saggingFit?: boolean;
  correctionHint?: string | null;
  skipVisionQc?: boolean;
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
  sheetImageUrl?: string | null;
  angleSlices: Partial<Record<TurnaroundAngleDeg, string>>;
  availableAngles: TurnaroundAngleDeg[];
  updatedAt: number;
}

export interface VtonNotificationPopup {
  code: string;
  durationMs: number;
  messageKo: string;
  messageEn: string;
}

export interface AiVtonSynthesisOutcome {
  ok: boolean;
  fallbackToFlatLay: boolean;
  frontOnlyDegraded?: boolean;
  fallbackView?: string;
  notificationPopup?: VtonNotificationPopup | null;
  qcAttempts?: number;
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
  sheetImageUrl?: string | null;
  angleSlices: Partial<Record<TurnaroundAngleDeg, string>>;
  equippedCount: number;
  equippedSlotKeys: string[];
  profile: NormalizedVtonProfile;
  handedness?: AvatarDominantHand;
  bagAssetMirrored?: boolean;
  createdAt: number;
}

interface VtonServerResponse {
  ok?: boolean;
  cached?: boolean;
  provider?: string;
  model?: string | null;
  layout?: 'turnaround_4x2' | 'turnaround_3x2' | 'turnaround_2x2' | 'single' | string;
  styleMode?: string;
  weatherMood?: string;
  geminiUsed?: boolean;
  handedness?: string;
  bagAssetMirrored?: boolean;
  frontOnlyDegraded?: boolean;
  fallbackView?: string;
  qcStatus?: string;
  qcPassed?: boolean;
  qcAttempts?: number;
  qcReasons?: string[];
  failedAngles?: number[];
  notificationPopup?: VtonNotificationPopup | null;
  fallbackReason?: string | null;
  compositeImageUrl?: string | null;
  afterImageUrl?: string | null;
  baseModelImageUrl?: string | null;
  panelImages?: Partial<Record<string, string>>;
  latencyMs?: number;
  angleQcFailed?: boolean;
  effectiveBagHandedness?: 'right' | 'left' | null;
}

const VTON_IDB_NAME = 'ainventory_gemini_vton_cache_v5';
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
  'underwear_top',
  'underwear',
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
interface InFlightAiEntry {
  promise: Promise<AiVtonSynthesisOutcome>;
  subscriberCount: number;
  settled: boolean;
  controller: AbortController | null;
}

const inFlightAiRequests = new Map<string, InFlightAiEntry>();
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

export const CANONICAL_HUMAN_STATURE_RATIO = 0.79;
export const CANONICAL_FLOOR_BASELINE_RATIO = 0.955;
export const CANONICAL_PORTRAIT_ASPECT_RATIO = 0.75;

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
  const presenceBoost = stageAspect < 0.85 ? 1.235 : stageAspect < 1.25 ? 1.205 : 1.19;

  const renderedBoxW = renderedBoxH * imgAspect;
  const maxHorizontalScale = (sw * 0.95) / Math.max(1, renderedBoxW * 0.58);
  const rawIdeal = widthChokeCompensation * presenceBoost;
  return Math.round(clamp(Math.min(rawIdeal, maxHorizontalScale), 1.18, 1.58) * 1000) / 1000;
}

export interface MannequinFloorPlacement {
  effectiveBaseScale: number;
  soleTransformOrigin: string;
  soleStageTopPct: number;
  topRatio: number;
  bottomRatio: number;
  renderedContentW: number | null;
  renderedContentH: number | null;
}

/**
 * Computes sole-locked transform origin, stage floor contact percentage, and height-linked
 * architectural framing scale so characters inhabit the wide-angle environment proportionally
 * (~62.5% at 150cm, ~70% at 172cm, ~78.5% at 198cm) and stay pinned at 0px to the Three.js floor shadow.
 */
export function computeMannequinFloorPlacement(params?: {
  stageWidth?: number;
  stageHeight?: number;
  imageAspectRatio?: number;
  topRatio?: number | null;
  bottomRatio?: number | null;
  heightCm?: number | null;
}): MannequinFloorPlacement {
  const sw = Number(params?.stageWidth) || 0;
  const sh = Number(params?.stageHeight) || 0;
  const rawTopRatio =
    typeof params?.topRatio === 'number' && Number.isFinite(params.topRatio)
      ? params.topRatio
      : NaN;
  const rawBottomRatio =
    typeof params?.bottomRatio === 'number' && Number.isFinite(params.bottomRatio)
      ? params.bottomRatio
      : NaN;
  const soleFrac =
    Number.isFinite(rawBottomRatio) && rawBottomRatio > 0.4
      ? clamp(rawBottomRatio, 0.84, 0.995)
      : CANONICAL_FLOOR_BASELINE_RATIO;
  const topFrac =
    Number.isFinite(rawTopRatio) && rawTopRatio >= 0
      ? clamp(rawTopRatio, 0.005, 0.45)
      : Math.max(0.04, CANONICAL_FLOOR_BASELINE_RATIO - CANONICAL_HUMAN_STATURE_RATIO);
  const effectiveSoleFrac = Math.max(soleFrac, topFrac + 0.15);

  const framing = computeHeightAwareStageFraming({
    heightCm: params?.heightCm ?? 172,
    stageWidth: sw,
    stageHeight: sh,
  });

  if (sw < 120 || sh < 160) {
    return {
      effectiveBaseScale: 0.96,
      soleTransformOrigin: `50% ${(effectiveSoleFrac * 100).toFixed(2)}%`,
      soleStageTopPct: Math.round((85.5 + framing.heightDeltaNorm * 1.1) * 100) / 100,
      topRatio: topFrac,
      bottomRatio: effectiveSoleFrac,
      renderedContentW: null,
      renderedContentH: null,
    };
  }

  const isCompact = sw <= 595;
  const topPad = isCompact ? 54 : 56;
  const bottomPad = 66;
  const sidePad = isCompact ? 10 : 12;
  const availW = Math.max(120, sw - sidePad * 2);
  const availH = Math.max(160, sh - topPad - bottomPad);
  const rawAspect = Number(params?.imageAspectRatio);
  const imgAspect =
    Number.isFinite(rawAspect) && rawAspect > 0.25 ? clamp(rawAspect, 0.45, 1.45) : 0.74;

  const renderedContentH = Math.min(availH, availW / imgAspect);
  const renderedContentW = renderedContentH * imgAspect;
  const soleOffsetFromBottomPx = (1 - effectiveSoleFrac) * renderedContentH;
  const originYPct = clamp(effectiveSoleFrac * 100, 75, 99.5);
  const soleStageY = sh - bottomPad - soleOffsetFromBottomPx;
  const soleStageTopPct =
    Math.round(clamp((soleStageY / Math.max(1, sh)) * 100, 72, 96) * 100) / 100;

  // Architectural height-linked target stature (~55–57% of stage height at 172–177cm)
  const aboveSolePx = Math.max(24, (effectiveSoleFrac - topFrac) * renderedContentH);
  const targetCharacterPx = sh * framing.targetCharacterHeightFraction;
  const heightDrivenScale = targetCharacterPx / aboveSolePx;

  const minSafeHeadY = Math.max(54, topPad + 2);
  const availAboveSole = Math.max(24, soleStageY - minSafeHeadY);
  const maxHeadSafeScale = availAboveSole / aboveSolePx;
  const maxDomTopSafeScale = Math.max(
    0.72,
    (soleStageY - 6) / Math.max(1, effectiveSoleFrac * renderedContentH)
  );
  const maxBottomSafeScale =
    soleOffsetFromBottomPx > 2 ? (bottomPad - 46 + soleOffsetFromBottomPx) / soleOffsetFromBottomPx : 1.32;
  const maxHorizontalScale = (sw * 0.92) / Math.max(1, renderedContentW * 0.62);
  const effectiveBaseScale =
    Math.round(
      clamp(
        Math.min(
          heightDrivenScale,
          maxHeadSafeScale,
          maxDomTopSafeScale,
          maxBottomSafeScale,
          maxHorizontalScale
        ),
        0.48,
        1.32
      ) * 1000
    ) / 1000;

  return {
    effectiveBaseScale,
    soleTransformOrigin: `50% ${originYPct.toFixed(2)}%`,
    soleStageTopPct,
    topRatio: topFrac,
    bottomRatio: effectiveSoleFrac,
    renderedContentW: Math.round(renderedContentW * 10) / 10,
    renderedContentH: Math.round(renderedContentH * 10) / 10,
  };
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
    canonicalSliceAngle: 270,
    mirrorX: false,
    perspectiveYawDeg: 0,
    shortKo: '좌측면',
    shortEn: 'Left',
    fullKo: '270° 좌측면',
    fullEn: '270° Left Side',
  },
  315: {
    angleDeg: 315,
    canonicalSliceAngle: 315,
    mirrorX: false,
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

  const explicitHandCandidate =
    input?.handedness ??
    input?.dominantHand ??
    input?.profile?.dominantHand ??
    (input?.avatarSpec ? input.avatarSpec.dominantHand : null) ??
    input?.user?.handedness ??
    input?.user?.dominantHand ??
    baseSpec.dominantHand;
  const resolvedDominantHand = normalizeHandedness(explicitHandCandidate, baseSpec.dominantHand);

  const syncedSpec = sanitizeAvatarSpec({
    ...baseSpec,
    dominantHand: resolvedDominantHand,
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
    resolvedDominantHand === baseSpec.dominantHand &&
    typeof input?.avatarConfigHash === 'string' &&
    input.avatarConfigHash.trim()
      ? input.avatarConfigHash.trim()
      : computeAvatarConfigHash(syncedSpec);

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
export function computeOutfitComboId(
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null,
  handedness?: unknown,
  options?: { saggingFit?: boolean } | null
): {
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

  const normalizedHand = normalizeHandedness(handedness, 'right');
  const hasBag = equippedGarments.some(({ slotKey, garment }) =>
    isBagGarmentItem({
      slot: slotKey,
      category: garment.category,
      subcategory: garment.subcategory,
      name: garment.name,
    })
  );

  const hasOuterGarmentLayer = equippedGarments.some(({ slotKey }) =>
    ['outer', 'outer_mid', 'top', 'top_mid', 'bottom', 'onepiece', 'dress'].includes(slotKey)
  );
  const hasUnderwearLayer = equippedGarments.some(
    ({ slotKey }) => slotKey === 'underwear' || slotKey === 'underwear_top'
  );
  const isUnderwearLookbook = hasUnderwearLayer && !hasOuterGarmentLayer;

  const baseSig = equippedGarments
    .map(({ slotKey, garment }) => {
      const resolvedUrl = resolveGarmentCanonicalImageUrl(garment);
      return `${slotKey}:${garment.id ?? ''}:${garment.subcategory ?? ''}:${garment.color_hex ?? ''}:${resolvedUrl}`;
    })
    .join('|');
  const handSig = hasBag && normalizedHand === 'left' ? `${baseSig}|hand:left` : baseSig;
  const sagSig = options?.saggingFit ? `${handSig}|sag:3` : handSig;
  const rawSig = isUnderwearLookbook ? `${sagSig}|uwlb:2` : sagSig;

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
        sheetImageUrl: rec.sheetImageUrl || null,
        angleSlices: {},
        availableAngles: [],
        updatedAt: rec.updatedAt || 0,
      };
      grouped.set(groupKey, group);
    }

    group.angleSlices[rec.angleDeg] = rec.imageUrl;
    if (
      rec.sheetImageUrl &&
      (rec.angleDeg === 0 || !group.sheetImageUrl || (rec.updatedAt || 0) >= group.updatedAt)
    ) {
      group.sheetImageUrl = rec.sheetImageUrl;
    }
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

  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
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
    const cleanCtx = cleanCanvas.getContext('2d', { willReadFrequently: true });
    if (!cleanCtx) {
      cleanCanvas.width = 0;
      cleanCanvas.height = 0;
      return srcCanvas;
    }

    try {
      cleanCtx.clearRect(0, 0, outW, ch);
      if (!alreadyTransparent) {
        cleanCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
        cleanCtx.fillRect(0, 0, outW, ch);
      }
      const dx = Math.round((outW - subW) * 0.5);
      cleanCtx.drawImage(srcCanvas, sx, 0, subW, ch, dx, 0, subW, ch);
      return cleanCanvas;
    } catch {
      cleanCanvas.width = 0;
      cleanCanvas.height = 0;
      return srcCanvas;
    }
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
  const cleanCtx = cleanCanvas.getContext('2d', { willReadFrequently: true });
  if (!cleanCtx) {
    cleanCanvas.width = 0;
    cleanCanvas.height = 0;
    return srcCanvas;
  }

  try {
    cleanCtx.clearRect(0, 0, outW, ch);
    if (!alreadyTransparent) {
      cleanCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      cleanCtx.fillRect(0, 0, outW, ch);
    }
    const dx = Math.round((outW - subW) * 0.5);
    cleanCtx.drawImage(srcCanvas, sx, 0, subW, ch, dx, 0, subW, ch);
    return cleanCanvas;
  } catch {
    cleanCanvas.width = 0;
    cleanCanvas.height = 0;
    return srcCanvas;
  }
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

  // Measure shoulder/upper-torso max span (16%..36% of fgH) vs top cranial/neck zone (6%..11% of fgH)
  const shY0 = Math.min(b.maxY, Math.round(b.minY + fgH * 0.16));
  const shY1 = Math.min(b.maxY, Math.max(shY0, Math.round(b.minY + fgH * 0.36)));
  let shoulderMaxSpan = 0;
  for (let y = shY0; y <= shY1; y += 1) {
    if (rowSpans[y] > shoulderMaxSpan) shoulderMaxSpan = rowSpans[y];
  }
  const topCanopyEndY = Math.min(b.maxY, Math.round(b.minY + fgH * 0.15));
  let maxTop15Span = 0;
  for (let y = b.minY; y <= topCanopyEndY; y += 1) {
    if (rowSpans[y] > maxTop15Span) maxTop15Span = rowSpans[y];
  }
  let underCanopyPocketRows = 0;
  const pocketBandY0 = Math.min(b.maxY, Math.round(b.minY + fgH * 0.14));
  const pocketBandY1 = Math.min(b.maxY, Math.round(b.minY + fgH * 0.34));
  const canopyPocketSpanMin = Math.max(medianBodyWidth * 1.4, w * 0.36);
  for (let y = pocketBandY0; y <= pocketBandY1; y += 1) {
    if (rowSpans[y] >= canopyPocketSpanMin && rowCounts[y] <= rowSpans[y] * 0.68) {
      underCanopyPocketRows += 1;
    }
  }
  const hasWideOverheadCanopy =
    (shoulderMaxSpan > 0 && maxTop15Span >= Math.max(shoulderMaxSpan * 1.24, w * 0.34)) ||
    (medianBodyWidth > 0 && maxTop15Span >= canopyPocketSpanMin && underCanopyPocketRows >= 2);

  const headNeckY0 = Math.min(b.maxY, Math.round(b.minY + fgH * 0.06));
  const headNeckY1 = Math.min(b.maxY, Math.max(headNeckY0, Math.round(b.minY + fgH * 0.11)));
  let minHeadNeckSpan = Infinity;
  for (let y = headNeckY0; y <= headNeckY1; y += 1) {
    if (rowSpans[y] > 0 && rowSpans[y] < minHeadNeckSpan) {
      minHeadNeckSpan = rowSpans[y];
    }
  }
  if (
    !hasWideOverheadCanopy &&
    fgH >= 36 &&
    shoulderMaxSpan >= w * 0.22 &&
    Number.isFinite(minHeadNeckSpan) &&
    minHeadNeckSpan >= shoulderMaxSpan * 0.82
  ) {
    return { ok: false, reason: 'clipped_top', fgHeightRatio };
  }

  // Check 1A: Clipped-top / headless slice touching canvas top edge (torso/shoulders cut flush at y <= 3)
  const topEdgeCount = Math.max(rowCounts[0] || 0, rowCounts[1] || 0, rowCounts[2] || 0);
  const topCrownCount = rowCounts[b.minY + 1] ?? rowCounts[b.minY] ?? 0;
  if (
    (b.minY <= 2 && topEdgeCount >= Math.max(w * 0.14, medianBodyWidth * 0.52)) ||
    (b.minY <= 3 && topCrownCount >= Math.max(w * 0.18, medianBodyWidth * 0.65))
  ) {
    return { ok: false, reason: 'clipped_top', fgHeightRatio };
  }

  // Check 1B: Vertically shifted flat waist-down / chest-down crop
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

  // Check 2: Clipped-bottom (coat/waist/thighs sliced flat against bottom edge, NOT shoes on 0.955*H floor baseline)
  const botEdgeMarginPx = Math.max(2, Math.min(4, Math.floor(h * 0.025)));
  let botEdgeCount = 0;
  for (let offset = 1; offset <= botEdgeMarginPx; offset += 1) {
    botEdgeCount = Math.max(botEdgeCount, rowCounts[h - offset] || 0);
  }
  if (
    b.maxY >= h - botEdgeMarginPx &&
    botEdgeCount >= Math.max(w * 0.18, medianBodyWidth * 0.56)
  ) {
    return { ok: false, reason: 'clipped_bottom', fgHeightRatio };
  }

  // Check 3: Half-body / waist-up / thigh-cut shot (including scale-invariant aspect ratio)
  const bottomTrimBandY = Math.max(b.minY, Math.round(b.maxY - fgH * 0.04));
  let maxBottomBarCount = 0;
  for (let y = bottomTrimBandY; y <= b.maxY; y += 1) {
    if (rowCounts[y] > maxBottomBarCount) maxBottomBarCount = rowCounts[y];
  }
  const heightToMedianBodyAspect = fgH / Math.max(1, medianBodyWidth);
  if (
    (!hasWideOverheadCanopy &&
      heightToMedianBodyAspect < 2.08 &&
      maxBottomBarCount >= medianBodyWidth * 0.56) ||
    (fgHeightRatio < 0.58 &&
      heightToMedianBodyAspect < 2.22 &&
      maxBottomBarCount >= medianBodyWidth * 0.52)
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
        try {
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
            return;
          }
          ctx.drawImage(img, 0, 0);
          const rgba = ctx.getImageData(0, 0, w, h).data;
          const rep = inspectTurnaroundSliceIntegrityInBuffer(rgba, w, h);
          resolve(rep);
        } finally {
          c.width = 0;
          c.height = 0;
        }
      } catch {
        resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
      }
    };
    img.onerror = () => resolve({ ok: true, reason: 'ok', fgHeightRatio: 0.8 });
    img.src = dataUrl;
  });
}

async function inspectDataUrlQcMetrics(
  dataUrl: string,
  studioBackdropHex?: string | null
): Promise<VtonQcSliceMetrics | null> {
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
        try {
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const rgba = ctx.getImageData(0, 0, w, h).data;
          const metrics = inspectPixelSliceQc(rgba, w, h, { studioBackdropHex });
          resolve(metrics);
        } finally {
          c.width = 0;
          c.height = 0;
        }
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

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
  const canonicalH = targetH && targetH >= 64 ? Math.round(targetH) : totalH;
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
  canvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>>,
  masterLandmarks?: MasterAnchorLandmarks | null
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
  const targetCanonicalH = maxSourceH;

  for (const angle of activeAngles) {
    const c = canvases[angle];
    const cb = coreByAngle[angle];
    if (!c || !cb) continue;
    const cw = c.width;
    const ch = c.height;
    if (cw < 16 || ch < 16) continue;

    let placement = computeUniformStaturePlacement({
      totalW: cw,
      totalH: ch,
      coreBounds: cb,
      targetH: targetCanonicalH,
    });

    // Post-Normalization Layer: when a 0° Master Anchor landmark reference is provided,
    // lock non-0° angles to the exact 0° crown Y, sole Y baseline, stature height, and center X.
    if (angle !== 0 && masterLandmarks) {
      const aligned = computeMasterLandmarkAlignment({
        sourceWidth: cw,
        sourceHeight: ch,
        sliceCrownY: cb.humanCrownY,
        sliceSoleY: cb.footSoleY,
        sliceCoreCx: cb.coreCx,
        sliceMinX: cb.minX,
        sliceMaxX: cb.maxX,
        sliceMinY: cb.minY,
        canonicalW: placement.canonicalW,
        canonicalH: placement.canonicalH,
        masterLandmarks,
      });
      placement = {
        ...placement,
        scale: aligned.scale,
        dstW: aligned.dstW,
        dstH: aligned.dstH,
        dstX: aligned.dstX,
        dstY: aligned.dstY,
      };
    }

    const scratch = document.createElement('canvas');
    scratch.width = cw;
    scratch.height = ch;
    try {
      const sCtx = scratch.getContext('2d', { willReadFrequently: true });
      const cCtx = c.getContext('2d', { willReadFrequently: true });
      if (!sCtx || !cCtx) continue;

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
    } finally {
      scratch.width = 0;
      scratch.height = 0;
    }
  }
}

async function measureMasterAnchorLandmarksFromDataUrl(
  dataUrl: string
): Promise<MasterAnchorLandmarks | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let c: HTMLCanvasElement | null = null;
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 64 || h < 64) {
          resolve(null);
          return;
        }
        c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const cb = measureCoreHumanVerticalBounds(c);
        if (!cb) {
          resolve(null);
          return;
        }
        resolve({
          crownYRatio: cb.humanCrownY / Math.max(1, h),
          soleYRatio: cb.footSoleY / Math.max(1, h),
          statureRatio: Math.max(16, cb.footSoleY - cb.humanCrownY + 1) / Math.max(1, h),
          coreCenterXRatio: cb.coreCx / Math.max(1, w),
        });
      } catch {
        resolve(null);
      } finally {
        if (c) {
          c.width = 0;
          c.height = 0;
        }
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function normalizeTurnaroundDataUrlsToFloorBaseline(
  slices: Partial<Record<TurnaroundAngleDeg, string>>,
  masterLandmarks?: MasterAnchorLandmarks | null
): Promise<void> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const active = TURNAROUND_ANGLES.filter((a) => Boolean(slices[a]));
  if (active.length < 1) return;

  const canvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>> = {};
  try {
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
              let c: HTMLCanvasElement | null = null;
              try {
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (w >= 64 && h >= 64) {
                  c = document.createElement('canvas');
                  c.width = w;
                  c.height = h;
                  const ctx = c.getContext('2d', { willReadFrequently: true });
                  if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    canvases[angle] = c;
                  } else {
                    c.width = 0;
                    c.height = 0;
                  }
                }
              } catch {
                if (c) {
                  c.width = 0;
                  c.height = 0;
                }
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

    normalizeTurnaroundCanvasesToFloorBaseline(canvases, masterLandmarks);
    for (const angle of loaded) {
      const c = canvases[angle];
      if (c) {
        slices[angle] = c.toDataURL('image/png');
      }
    }
  } finally {
    for (const angle of TURNAROUND_ANGLES) {
      const c = canvases[angle];
      if (c) {
        c.width = 0;
        c.height = 0;
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
  try {
    const sCtx = scratch.getContext('2d', { willReadFrequently: true });
    const cCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx || !cCtx) return;
    sCtx.drawImage(canvas, 0, 0);
    cCtx.clearRect(0, 0, cw, ch);
    cCtx.save();
    cCtx.translate(cw, 0);
    cCtx.scale(-1, 1);
    cCtx.drawImage(scratch, 0, 0);
    cCtx.restore();
  } finally {
    scratch.width = 0;
    scratch.height = 0;
  }
}

async function flipDataUrlHorizontally(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let c: HTMLCanvasElement | null = null;
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 8 || h < 8) {
          resolve(dataUrl);
          return;
        }
        c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        flipCanvasHorizontallyInPlace(c);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      } finally {
        if (c) {
          c.width = 0;
          c.height = 0;
        }
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Pre-crop full-sheet divider line eraser: detects thin vertical/horizontal grid lines drawn by
 * image models along panel boundaries (`0`, `w/4`, `w/3`, `w/2`, `2w/3`, `3w/4`, `w-1`, `h/2`)
 * and replaces them with the studio backdrop color so cluster detection and panel crops never
 * inherit white/black divider poles. Enforces strict two-sided backdrop isolation and thin-line
 * width caps so monochrome human silhouettes (e.g. all-black street/hip-hop outfits positioned
 * near `w/3` or `2w/3` on 4x2 sheets) are NEVER misidentified as divider lines.
 */
export function eraseSheetGridDividerLinesInBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options?: { layout?: string }
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

  const layout = String(options?.layout || '').trim();
  const isNearVerticalGridZone = (x: number): boolean => {
    const nx = x / w;
    if (nx <= 0.032 || nx >= 0.968) return true;
    if (layout === 'turnaround_4x2') {
      return (
        Math.abs(nx - 0.25) <= 0.035 ||
        Math.abs(nx - 0.5) <= 0.035 ||
        Math.abs(nx - 0.75) <= 0.035
      );
    }
    if (layout === 'turnaround_3x2') {
      return Math.abs(nx - 1 / 3) <= 0.045 || Math.abs(nx - 2 / 3) <= 0.045;
    }
    if (layout === 'turnaround_2x2') {
      return Math.abs(nx - 0.5) <= 0.045;
    }
    return (
      Math.abs(nx - 0.25) <= 0.035 ||
      Math.abs(nx - 1 / 3) <= 0.045 ||
      Math.abs(nx - 0.5) <= 0.045 ||
      Math.abs(nx - 2 / 3) <= 0.045 ||
      Math.abs(nx - 0.75) <= 0.035
    );
  };

  const isVerticalRuleCol = new Uint8Array(w);
  const colMeanR = new Float32Array(w);
  const colMeanG = new Float32Array(w);
  const colMeanB = new Float32Array(w);
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
    if (nonBgCount / totalSampleRows < 0.68) continue;

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
    if (consistentCount / nonBgCount >= 0.78) {
      isVerticalRuleCol[x] = 1;
      colMeanR[x] = meanR;
      colMeanG[x] = meanG;
      colMeanB[x] = meanB;
    }
  }

  const maxRuleW = Math.min(20, Math.max(10, Math.round(w * 0.012)));
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
      const isLeftBorder = vx <= 2;
      const isRightBorder = vxEnd >= w - 3;
      const leftProbeX = Math.max(0, wipeX0 - 3);
      const rightProbeX = Math.min(w - 1, wipeX1 + 3);

      // Two-sided background isolation check: a true grid divider runs through empty backdrop
      // corridors on BOTH sides (never along the outer edge of a solid human silhouette).
      let activeLineRows = 0;
      let isolatedLineRows = 0;
      let bandR = 0;
      let bandG = 0;
      let bandB = 0;
      const bandCols = vxEnd - vx + 1;
      for (let x = vx; x <= vxEnd; x += 1) {
        bandR += colMeanR[x];
        bandG += colMeanG[x];
        bandB += colMeanB[x];
      }
      bandR /= bandCols;
      bandG /= bandCols;
      bandB /= bandCols;
      const midCol = Math.floor((vx + vxEnd) * 0.5);

      for (let y = 0; y < h; y += yStep) {
        const cIdx = (y * w + midCol) * 4;
        const cDiff =
          Math.abs(data[cIdx] - bgR) +
          Math.abs(data[cIdx + 1] - bgG) +
          Math.abs(data[cIdx + 2] - bgB);
        if (cDiff <= 26) continue;
        activeLineRows += 1;
        const lIdx = (y * w + leftProbeX) * 4;
        const rIdx = (y * w + rightProbeX) * 4;
        const lIsBg =
          isLeftBorder ||
          Math.abs(data[lIdx] - bgR) +
            Math.abs(data[lIdx + 1] - bgG) +
            Math.abs(data[lIdx + 2] - bgB) <=
            38;
        const rIsBg =
          isRightBorder ||
          Math.abs(data[rIdx] - bgR) +
            Math.abs(data[rIdx + 1] - bgG) +
            Math.abs(data[rIdx + 2] - bgB) <=
            38;
        if (lIsBg && rIsBg) {
          isolatedLineRows += 1;
        }
      }

      if (activeLineRows > 0 && isolatedLineRows / activeLineRows >= 0.55) {
        for (let y = 0; y < h; y += 1) {
          const lIdx = (y * w + leftProbeX) * 4;
          const rIdx = (y * w + rightProbeX) * 4;
          const lDiff = isLeftBorder
            ? 0
            : Math.abs(data[lIdx] - bgR) +
              Math.abs(data[lIdx + 1] - bgG) +
              Math.abs(data[lIdx + 2] - bgB);
          const rDiff = isRightBorder
            ? 0
            : Math.abs(data[rIdx] - bgR) +
              Math.abs(data[rIdx + 1] - bgG) +
              Math.abs(data[rIdx + 2] - bgB);
          const bothBg = lDiff <= 38 && rDiff <= 38;
          const oneBg = lDiff <= 38 || rDiff <= 38;
          if (!oneBg) continue;
          const fillR = isLeftBorder ? data[rIdx] : isRightBorder ? data[lIdx] : lDiff <= rDiff ? data[lIdx] : data[rIdx];
          const fillG = isLeftBorder ? data[rIdx + 1] : isRightBorder ? data[lIdx + 1] : lDiff <= rDiff ? data[lIdx + 1] : data[rIdx + 1];
          const fillB = isLeftBorder ? data[rIdx + 2] : isRightBorder ? data[lIdx + 2] : lDiff <= rDiff ? data[lIdx + 2] : data[rIdx + 2];
          for (let x = wipeX0; x <= wipeX1; x += 1) {
            const pIdx = (y * w + x) * 4;
            if (!bothBg) {
              // When only one flank is background (e.g. a sleeve grazing the divider), only wipe
              // pixels whose color matches the divider line itself.
              const diffToLine =
                Math.abs(data[pIdx] - bandR) +
                Math.abs(data[pIdx + 1] - bandG) +
                Math.abs(data[pIdx + 2] - bandB);
              if (diffToLine > 52) continue;
            }
            data[pIdx] = fillR;
            data[pIdx + 1] = fillG;
            data[pIdx + 2] = fillB;
            data[pIdx + 3] = 255;
          }
        }
      }
    }
    vx = vxEnd + 1;
  }

  // Horizontal divider row scan near top, middle (h/2), and bottom borders
  const isHorizontalRuleRow = new Uint8Array(h);
  const rowMeanR = new Float32Array(h);
  const rowMeanG = new Float32Array(h);
  const rowMeanB = new Float32Array(h);
  const xStep = Math.max(1, Math.floor(w / 180));
  const totalSampleCols = Math.max(1, Math.ceil(w / xStep));
  const isHorizontalBandRowAt = (y: number): boolean => {
    if (y < 0 || y >= h) return false;
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
    if (nonBgCount / totalSampleCols < 0.68) return false;
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
    if (consistentCount / nonBgCount >= 0.78) {
      rowMeanR[y] = meanR;
      rowMeanG[y] = meanG;
      rowMeanB[y] = meanB;
      return true;
    }
    return false;
  };
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    if (!(ny <= 0.032 || ny >= 0.968 || Math.abs(ny - 0.5) <= 0.055)) continue;
    if (isHorizontalBandRowAt(y)) {
      isHorizontalRuleRow[y] = 1;
    }
  }

  const maxRuleH = Math.min(20, Math.max(10, Math.round(h * 0.014)));
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
    let trueHyStart = hy;
    let trueHyEnd = hyEnd;
    while (
      trueHyStart > 0 &&
      trueHyEnd - trueHyStart + 1 <= maxRuleH &&
      (isHorizontalRuleRow[trueHyStart - 1] || isHorizontalBandRowAt(trueHyStart - 1))
    ) {
      trueHyStart -= 1;
    }
    while (
      trueHyEnd + 1 < h &&
      trueHyEnd - trueHyStart + 1 <= maxRuleH &&
      (isHorizontalRuleRow[trueHyEnd + 1] || isHorizontalBandRowAt(trueHyEnd + 1))
    ) {
      trueHyEnd += 1;
    }
    if (trueHyEnd - trueHyStart + 1 <= maxRuleH) {
      const wipeY0 = Math.max(0, hy - 1);
      const wipeY1 = Math.min(h - 1, hyEnd + 1);
      const isTopBorder = hy <= 2;
      const isBotBorder = hyEnd >= h - 3;
      const topProbeY = Math.max(0, wipeY0 - 3);
      const botProbeY = Math.min(h - 1, wipeY1 + 3);
      const midRow = Math.floor((hy + hyEnd) * 0.5);
      const bandR = rowMeanR[midRow];
      const bandG = rowMeanG[midRow];
      const bandB = rowMeanB[midRow];

      let activeLineCols = 0;
      let isolatedLineCols = 0;
      for (let x = 0; x < w; x += xStep) {
        const cIdx = (midRow * w + x) * 4;
        const cDiff =
          Math.abs(data[cIdx] - bgR) +
          Math.abs(data[cIdx + 1] - bgG) +
          Math.abs(data[cIdx + 2] - bgB);
        if (cDiff <= 26) continue;
        activeLineCols += 1;
        const tIdx = (topProbeY * w + x) * 4;
        const bIdx = (botProbeY * w + x) * 4;
        const tIsBg =
          isTopBorder ||
          Math.abs(data[tIdx] - bgR) +
            Math.abs(data[tIdx + 1] - bgG) +
            Math.abs(data[tIdx + 2] - bgB) <=
            38;
        const bIsBg =
          isBotBorder ||
          Math.abs(data[bIdx] - bgR) +
            Math.abs(data[bIdx + 1] - bgG) +
            Math.abs(data[bIdx + 2] - bgB) <=
            38;
        if (tIsBg && bIsBg) {
          isolatedLineCols += 1;
        }
      }

      if (activeLineCols > 0 && isolatedLineCols / activeLineCols >= 0.55) {
        for (let x = 0; x < w; x += 1) {
          const tIdx = (topProbeY * w + x) * 4;
          const bIdx = (botProbeY * w + x) * 4;
          const tDiff = isTopBorder
            ? 0
            : Math.abs(data[tIdx] - bgR) +
              Math.abs(data[tIdx + 1] - bgG) +
              Math.abs(data[tIdx + 2] - bgB);
          const bDiff = isBotBorder
            ? 0
            : Math.abs(data[bIdx] - bgR) +
              Math.abs(data[bIdx + 1] - bgG) +
              Math.abs(data[bIdx + 2] - bgB);
          const bothBg = tDiff <= 38 && bDiff <= 38;
          if (!(tDiff <= 38 || bDiff <= 38)) continue;
          for (let y = wipeY0; y <= wipeY1; y += 1) {
            const pIdx = (y * w + x) * 4;
            if (!bothBg) {
              const diffToLine =
                Math.abs(data[pIdx] - bandR) +
                Math.abs(data[pIdx + 1] - bandG) +
                Math.abs(data[pIdx + 2] - bandB);
              if (diffToLine > 52) continue;
            }
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

export type LateralFacingDirection = 'left' | 'right' | 'neutral';

export interface SlicedTurnaroundQcResult {
  passedAngles: TurnaroundAngleDeg[];
  failedAngles: TurnaroundAngleDeg[];
  reasonsByAngle: Partial<Record<TurnaroundAngleDeg, string>>;
}

/**
 * Returns true when a mirrored pair of turnaround slices (e.g. `135°` right-rear vs `225°` left-rear,
 * or `45°` front-right vs `315°` front-left) were placed in each other's slots by the generator.
 * Swapping the two whole slices (instead of horizontally flipping) preserves asymmetric bag handedness
 * 100% because both members of each pair carry the bag on the exact same viewer screen side.
 */
export function shouldSwapMirroredAnglePair(
  rightSlotDetectedDir: LateralFacingDirection,
  leftSlotDetectedDir: LateralFacingDirection
): boolean {
  return rightSlotDetectedDir === 'left' && leftSlotDetectedDir === 'right';
}

export interface LocalTurnaroundRecoveryPlan {
  swaps: Array<[TurnaroundAngleDeg, TurnaroundAngleDeg]>;
  mirrorCopies: Array<{ targetAngle: TurnaroundAngleDeg; sourceAngle: TurnaroundAngleDeg }>;
  flipInPlace: TurnaroundAngleDeg[];
}

const MIRRORED_LATERAL_PAIRS: ReadonlyArray<readonly [TurnaroundAngleDeg, TurnaroundAngleDeg]> = [
  [45, 315],
  [90, 270],
  [135, 225],
];

/**
 * Pure $0 local directional safety-net planner for sliced 8-angle turnaround sheets.
 * - For all outfits (including bags): swaps `[135, 225]` or `[45, 315]` when they land in each
 *   other's slots (preserving anatomical bag side).
 * - For bag-free symmetric outfits (`!hasEquippedBag`): also swaps `[90, 270]` on full-row flip,
 *   horizontally mirrors a verified twin into a duplicated/ambiguous opposite slot (e.g. both 135°
 *   and 225° facing right -> mirror 135° into 225°), or flips an inverted slice in place.
 */
export function planLocalTurnaroundDirectionalRecovery(
  directionsByAngle: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>>,
  options?: { hasEquippedBag?: boolean }
): LocalTurnaroundRecoveryPlan {
  const hasEquippedBag = Boolean(options?.hasEquippedBag);
  const dirs: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>> = {
    ...directionsByAngle,
  };
  const swaps: Array<[TurnaroundAngleDeg, TurnaroundAngleDeg]> = [];
  const mirrorCopies: Array<{ targetAngle: TurnaroundAngleDeg; sourceAngle: TurnaroundAngleDeg }> =
    [];
  const flipInPlace: TurnaroundAngleDeg[] = [];

  for (const [rightAngle, leftAngle] of MIRRORED_LATERAL_PAIRS) {
    const rightDir = dirs[rightAngle];
    const leftDir = dirs[leftAngle];
    if (!rightDir || !leftDir) continue;

    // 1) Whole-slice swap when pair is transposed (90°<->270° only when bag-free because side occlusion differs)
    const pairSwapSafe = !hasEquippedBag || (rightAngle !== 90 && leftAngle !== 270);
    if (pairSwapSafe && shouldSwapMirroredAnglePair(rightDir, leftDir)) {
      swaps.push([rightAngle, leftAngle]);
      dirs[rightAngle] = leftDir;
      dirs[leftAngle] = rightDir;
      continue;
    }

    if (hasEquippedBag) continue;

    // 2) Symmetric $0 mirror recovery when one side is verified and its twin faces the same/neutral side
    if (rightDir === 'right' && leftDir !== 'left') {
      mirrorCopies.push({ targetAngle: leftAngle, sourceAngle: rightAngle });
      dirs[leftAngle] = 'left';
    } else if (leftDir === 'left' && rightDir !== 'right') {
      mirrorCopies.push({ targetAngle: rightAngle, sourceAngle: leftAngle });
      dirs[rightAngle] = 'right';
    } else {
      // 3) Fallback single-slice horizontal flip when both are inverted or neutral
      if (rightDir === 'left') {
        flipInPlace.push(rightAngle);
        dirs[rightAngle] = 'right';
      }
      if (leftDir === 'right') {
        flipInPlace.push(leftAngle);
        dirs[leftAngle] = 'left';
      }
    }
  }

  return { swaps, mirrorCopies, flipInPlace };
}

/**
 * Deterministic $0 orientation QC for sliced 8-angle turnaround sheets and repaired single angles.
 * Blocks inverted or duplicated rear-quarter / profile views (especially 135° vs 225°) from being
 * displayed to the user until verified or repaired.
 */
export function evaluateSlicedTurnaroundOrientationQc(
  directionsByAngle: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>>,
  availableAngles: readonly TurnaroundAngleDeg[] = TURNAROUND_ANGLES
): SlicedTurnaroundQcResult {
  const passedAngles: TurnaroundAngleDeg[] = [];
  const failedAngles: TurnaroundAngleDeg[] = [];
  const reasonsByAngle: Partial<Record<TurnaroundAngleDeg, string>> = {};

  const dir135 = directionsByAngle[135];
  const dir225 = directionsByAngle[225];
  const hasRearQuarterDuplicate =
    Boolean(dir135 && dir225 && dir135 !== 'neutral' && dir135 === dir225);

  for (const angle of availableAngles) {
    if (angle === 0 || angle === 180) {
      passedAngles.push(angle);
      continue;
    }
    const dir = directionsByAngle[angle] ?? 'neutral';
    const expectsRight = angle === 45 || angle === 90 || angle === 135;
    const expectsLeft = angle === 225 || angle === 270 || angle === 315;

    if (expectsRight && dir === 'left') {
      failedAngles.push(angle);
      reasonsByAngle[angle] =
        angle === 135 && hasRearQuarterDuplicate
          ? 'rear_quarter_duplicate_facing_left'
          : 'facing_opposite_left';
      continue;
    }
    if (expectsLeft && dir === 'right') {
      failedAngles.push(angle);
      reasonsByAngle[angle] =
        angle === 225 && hasRearQuarterDuplicate
          ? 'rear_quarter_duplicate_facing_right'
          : 'facing_opposite_right';
      continue;
    }
    passedAngles.push(angle);
  }

  return { passedAngles, failedAngles, reasonsByAngle };
}

export async function detectDataUrlLateralFacingDirection(
  dataUrl: string
): Promise<LateralFacingDirection> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !dataUrl) {
    return 'neutral';
  }
  return new Promise<LateralFacingDirection>((resolve) => {
    const img = new Image();
    if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 16 || h < 16) {
          resolve('neutral');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve('neutral');
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dir = detectLateralCanvasFacingDirection(canvas);
        canvas.width = 0;
        canvas.height = 0;
        resolve(dir);
      } catch {
        resolve('neutral');
      }
    };
    img.onerror = () => resolve('neutral');
    img.src = dataUrl;
  });
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

function resolveFourColumnCropSpans(
  clusters: HorizontalSpan[],
  headClusters: HorizontalSpan[],
  w: number
): [HorizontalSpan, HorizontalSpan, HorizontalSpan, HorizontalSpan] {
  if (clusters.length === 4) {
    const m01 = Math.round((clusters[0].x1 + clusters[1].x0) * 0.5);
    const m12 = Math.round((clusters[1].x1 + clusters[2].x0) * 0.5);
    const m23 = Math.round((clusters[2].x1 + clusters[3].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, m23 - 1) },
      { x0: m23 + 1, x1: Math.max(m23 + 17, w - 3) },
    ];
  }
  if (headClusters.length === 4) {
    const m01 = Math.round((headClusters[0].x1 + headClusters[1].x0) * 0.5);
    const m12 = Math.round((headClusters[1].x1 + headClusters[2].x0) * 0.5);
    const m23 = Math.round((headClusters[2].x1 + headClusters[3].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, m23 - 1) },
      { x0: m23 + 1, x1: Math.max(m23 + 17, w - 3) },
    ];
  }
  const colW = Math.floor(w / 4);
  const trimX = Math.max(2, Math.round(colW * 0.015));
  return [
    { x0: trimX, x1: colW - trimX },
    { x0: colW + trimX, x1: colW * 2 - trimX },
    { x0: colW * 2 + trimX, x1: colW * 3 - trimX },
    { x0: colW * 3 + trimX, x1: w - trimX },
  ];
}

/**
 * Crops an AI-generated 4x2 (8 panels: `0°, 45°, 90°, 135°` / `180°, 225°, 270°, 315°`),
 * 3x2 (6 panels), or legacy 2x2 Turnaround Studio Sheet into individual RGBA PNG angle slices.
 * Runs pre-crop sheet divider-line erasing + `isolateSingleSubjectInSlice` + V4 hole-aware
 * `applyCornerBfsCutoutOnCanvas` + `scrubCutoutArtifactsOnCanvas` + post-cutout touching-twin
 * `isolateSingleSubjectInSlice` + gaze-direction normalization + `normalizeTurnaroundCanvasesToFloorBaseline`.
 */
export async function sliceTurnaround2x2Sheet(
  sheetDataUrl: string,
  options?: {
    layout?: string;
    forceFlipAngles?: TurnaroundAngleDeg[];
    hasEquippedBag?: boolean;
    onSliceOrientationMeta?: (
      dirs: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>>
    ) => void;
  }
): Promise<Record<TurnaroundAngleDeg, string>> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      0: sheetDataUrl,
      45: sheetDataUrl,
      90: sheetDataUrl,
      135: sheetDataUrl,
      180: sheetDataUrl,
      225: sheetDataUrl,
      270: sheetDataUrl,
      315: sheetDataUrl,
    };
  }

  const forceFlipSet = new Set<TurnaroundAngleDeg>(options?.forceFlipAngles || []);

  const rawCropped = await new Promise<Record<TurnaroundAngleDeg, string> | null>((resolve) => {
    const img = new Image();
    if (!sheetDataUrl.startsWith('data:') && !sheetDataUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = async () => {
      let sheetCanvas: HTMLCanvasElement | null = null;
      let mirror225: HTMLCanvasElement | null = null;
      const cutCanvases: Partial<Record<TurnaroundAngleDeg, HTMLCanvasElement>> = {};
      const extraCanvases: HTMLCanvasElement[] = [];
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 32 || h < 32) {
          resolve(null);
          return;
        }

        // Draw sheet onto a working canvas and erase any model-drawn grid divider lines BEFORE clustering/cropping
        sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = w;
        sheetCanvas.height = h;
        extraCanvases.push(sheetCanvas);
        const sheetCtx = sheetCanvas.getContext('2d', { willReadFrequently: true });
        let fullSheetRgba: Uint8ClampedArray | null = null;
        if (sheetCtx) {
          sheetCtx.drawImage(img, 0, 0);
          if (w >= 64 && h >= 64) {
            try {
              const sheetImgData = sheetCtx.getImageData(0, 0, w, h);
              if (w >= 256 && h >= 256) {
                eraseSheetGridDividerLinesInBuffer(sheetImgData.data, w, h, {
                  layout: options?.layout,
                });
                sheetCtx.putImageData(sheetImgData, 0, 0);
              }
              fullSheetRgba = sheetImgData.data;
            } catch {
              // Ignore cross-origin read errors if any
            }
          }
        }

        const isExplicit4x2 = options?.layout === 'turnaround_4x2' && w >= 256 && h >= 256;
        const isExplicit2x2 = options?.layout === 'turnaround_2x2' || w < 256 || h < 256;
        const isHorizontal1x6Strip = !isExplicit4x2 && !isExplicit2x2 && w / h >= 3.15;
        const isHorizontal1x4Strip = !isExplicit4x2 && !isHorizontal1x6Strip && w / h >= 2.15;

        let topClusters: HorizontalSpan[] = [];
        let botClusters: HorizontalSpan[] = [];
        let topHeadClusters: HorizontalSpan[] = [];
        let botHeadClusters: HorizontalSpan[] = [];
        let topCenterDensity = 0;
        let botCenterDensity = 0;
        let splitY = Math.floor(h / 2);

        if (fullSheetRgba) {
          splitY = resolveTurnaroundRowSplitYInBuffer(fullSheetRgba, w, h);
          if (!isExplicit2x2 && !isHorizontal1x6Strip && !isHorizontal1x4Strip) {
            const splitOffset = splitY * w * 4;
            const botH = h - splitY;
            const topData = fullSheetRgba.subarray(0, splitOffset);
            const botData = fullSheetRgba.subarray(splitOffset, h * w * 4);
            topClusters = detectRowSubjectClustersInBuffer(topData, w, splitY);
            botClusters = detectRowSubjectClustersInBuffer(botData, w, botH);
            topHeadClusters = detectRowHeadClustersInBuffer(topData, w, splitY);
            botHeadClusters = detectRowHeadClustersInBuffer(botData, w, botH);
            topCenterDensity = measureRowCenterForegroundDensityInBuffer(topData, w, splitY);
            botCenterDensity = measureRowCenterForegroundDensityInBuffer(botData, w, botH);
          }
        }

        const use4x2Grid =
          isExplicit4x2 ||
          (!isExplicit2x2 &&
            !isHorizontal1x6Strip &&
            !isHorizontal1x4Strip &&
            options?.layout !== 'turnaround_3x2' &&
            (topClusters.length === 4 ||
              botClusters.length === 4 ||
              topHeadClusters.length === 4 ||
              botHeadClusters.length === 4));

        const use3x2Grid =
          !use4x2Grid &&
          evaluateTurnaroundGridDecisionFromStats({
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
          panels = LEGACY_SHEET_6_ANGLES.map((angle, idx) => ({
            angle,
            sx: colW * idx + trimX,
            sy: trimY,
            cw,
            ch,
          }));
        } else if (use4x2Grid) {
          const trimTop = Math.max(1, Math.round(splitY * 0.012));
          const botTotalH = h - splitY;
          const trimBot = Math.max(1, Math.round(botTotalH * 0.012));
          const topCh = Math.max(16, splitY - trimTop * 2);
          const botCh = Math.max(16, botTotalH - trimBot * 2);
          const topSpans = resolveFourColumnCropSpans(topClusters, topHeadClusters, w);
          const botSpans = resolveFourColumnCropSpans(botClusters, botHeadClusters, w);
          const topAngles: [
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
          ] = [0, 45, 90, 135];
          const botAngles: [
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
            TurnaroundAngleDeg,
          ] = [180, 225, 270, 315];
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
        const cropSource: CanvasImageSource = sheetCtx ? sheetCanvas : img;

        for (let panelIdx = 0; panelIdx < panels.length; panelIdx += 1) {
          const p = panels[panelIdx];
          if (panelIdx > 0 && panelIdx % 2 === 0) {
            await new Promise<void>((r) => setTimeout(r, 0));
          }
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = p.cw;
          cropCanvas.height = p.ch;
          const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            cropCanvas.width = 0;
            cropCanvas.height = 0;
            out[p.angle] = sheetDataUrl;
            continue;
          }
          extraCanvases.push(cropCanvas);
          ctx.clearRect(0, 0, p.cw, p.ch);
          ctx.drawImage(cropSource, p.sx, p.sy, p.cw, p.ch, 0, 0, p.cw, p.ch);
          const preCutIsolated = isolateSingleSubjectInSlice(cropCanvas);
          if (preCutIsolated !== cropCanvas) {
            extraCanvases.push(preCutIsolated);
          }
          applyCornerBfsCutoutOnCanvas(preCutIsolated);
          scrubCutoutArtifactsOnCanvas(preCutIsolated);
          const finalCanvas = isolateSingleSubjectInSlice(preCutIsolated);
          if (finalCanvas !== preCutIsolated) {
            extraCanvases.push(finalCanvas);
          }

          // Respect explicit forceFlipAngles; automatic directional reconciliation runs right below
          // once all 8 slices are cut so mirrored pairs can swap or mirror cleanly at $0 cost.
          if (forceFlipSet.has(p.angle)) {
            flipCanvasHorizontallyInPlace(finalCanvas);
          }

          cutCanvases[p.angle] = finalCanvas;
        }

        // Local $0 directional safety net across all lateral pairs ([45,315], [90,270], [135,225]):
        // 1) Handedness-safe whole-slice swap when a mirrored pair landed in each other's cells.
        // 2) For bag-free outfits, $0 horizontal mirror recovery when one side was duplicated or inverted.
        const preRecoveryDirs: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>> = {};
        for (const angle of TURNAROUND_ANGLES) {
          const c = cutCanvases[angle];
          if (c && angle !== 0 && angle !== 180) {
            preRecoveryDirs[angle] = detectLateralCanvasFacingDirection(c);
          }
        }
        const recoveryPlan = planLocalTurnaroundDirectionalRecovery(preRecoveryDirs, {
          hasEquippedBag: Boolean(options?.hasEquippedBag),
        });
        for (const [rightAngle, leftAngle] of recoveryPlan.swaps) {
          const tmp = cutCanvases[rightAngle];
          cutCanvases[rightAngle] = cutCanvases[leftAngle];
          cutCanvases[leftAngle] = tmp;
        }
        for (const { targetAngle, sourceAngle } of recoveryPlan.mirrorCopies) {
          const srcCanvas = cutCanvases[sourceAngle];
          if (!srcCanvas) continue;
          const mirrored = document.createElement('canvas');
          mirrored.width = srcCanvas.width;
          mirrored.height = srcCanvas.height;
          const mCtx = mirrored.getContext('2d', { willReadFrequently: true });
          if (mCtx) {
            mCtx.translate(mirrored.width, 0);
            mCtx.scale(-1, 1);
            mCtx.drawImage(srcCanvas, 0, 0);
            const prevTarget = cutCanvases[targetAngle];
            if (prevTarget) extraCanvases.push(prevTarget);
            cutCanvases[targetAngle] = mirrored;
          } else {
            mirrored.width = 0;
            mirrored.height = 0;
          }
        }
        for (const flipAngle of recoveryPlan.flipInPlace) {
          const target = cutCanvases[flipAngle];
          if (target) {
            flipCanvasHorizontallyInPlace(target);
          }
        }

        if (typeof options?.onSliceOrientationMeta === 'function') {
          const detectedDirs: Partial<Record<TurnaroundAngleDeg, LateralFacingDirection>> = {};
          for (const angle of TURNAROUND_ANGLES) {
            const c = cutCanvases[angle];
            if (c) {
              detectedDirs[angle] =
                angle === 0 || angle === 180
                  ? 'neutral'
                  : detectLateralCanvasFacingDirection(c);
            }
          }
          options.onSliceOrientationMeta(detectedDirs);
        }

        normalizeTurnaroundCanvasesToFloorBaseline(cutCanvases);

        // Prefer fast lossy-high-quality WebP with alpha (5-8x faster than synchronous PNG encode, ~70% smaller IndexedDB payload)
        let alphaDataUrlMime: 'image/webp' | 'image/png' = 'image/png';
        try {
          const probe = document.createElement('canvas');
          probe.width = 2;
          probe.height = 2;
          if (probe.toDataURL('image/webp', 0.92).startsWith('data:image/webp')) {
            alphaDataUrlMime = 'image/webp';
          }
          probe.width = 0;
          probe.height = 0;
        } catch {
          alphaDataUrlMime = 'image/png';
        }
        const encodeAlphaCanvas = (canvas: HTMLCanvasElement): string =>
          alphaDataUrlMime === 'image/webp'
            ? canvas.toDataURL('image/webp', 0.92)
            : canvas.toDataURL('image/png');

        // If slicing a 4-panel 2x2 sheet (e.g. square fallback), synthesize distinct left-facing 225° from 90°!
        if (!cutCanvases[135] && cutCanvases[90]) {
          out[135] = encodeAlphaCanvas(cutCanvases[90]);
        }
        if (!cutCanvases[225] && cutCanvases[90]) {
          mirror225 = document.createElement('canvas');
          mirror225.width = cutCanvases[90].width;
          mirror225.height = cutCanvases[90].height;
          const mCtx = mirror225.getContext('2d', { willReadFrequently: true });
          if (mCtx) {
            mCtx.translate(mirror225.width, 0);
            mCtx.scale(-1, 1);
            mCtx.drawImage(cutCanvases[90], 0, 0);
            out[225] = encodeAlphaCanvas(mirror225);
          }
          mirror225.width = 0;
          mirror225.height = 0;
          mirror225 = null;
        }

        for (const angle of TURNAROUND_ANGLES) {
          const c = cutCanvases[angle];
          if (c) {
            out[angle] = encodeAlphaCanvas(c);
          }
        }
        if (!out[135]) {
          out[135] = out[90] || out[180] || out[0] || sheetDataUrl;
        }
        if (!out[225]) {
          out[225] = out[180] || out[90] || out[0] || sheetDataUrl;
        }
        // For legacy static 6-panel sheets (which lack true 270°/315° panels), synthesize left-side views
        if (!out[270]) {
          const src90 = cutCanvases[90];
          if (src90) {
            const flip270 = document.createElement('canvas');
            flip270.width = src90.width;
            flip270.height = src90.height;
            const fCtx = flip270.getContext('2d', { willReadFrequently: true });
            if (fCtx) {
              fCtx.translate(flip270.width, 0);
              fCtx.scale(-1, 1);
              fCtx.drawImage(src90, 0, 0);
              out[270] = flip270.toDataURL('image/png');
            }
            flip270.width = 0;
            flip270.height = 0;
          }
          if (!out[270]) out[270] = out[225] || out[90] || out[0] || sheetDataUrl;
        }
        if (!out[315]) {
          const src45 = cutCanvases[45];
          if (src45) {
            const flip315 = document.createElement('canvas');
            flip315.width = src45.width;
            flip315.height = src45.height;
            const fCtx = flip315.getContext('2d', { willReadFrequently: true });
            if (fCtx) {
              fCtx.translate(flip315.width, 0);
              fCtx.scale(-1, 1);
              fCtx.drawImage(src45, 0, 0);
              out[315] = flip315.toDataURL('image/png');
            }
            flip315.width = 0;
            flip315.height = 0;
          }
          if (!out[315]) out[315] = out[45] || out[0] || sheetDataUrl;
        }

        resolve(out);
      } catch {
        resolve(null);
      } finally {
        if (mirror225) {
          mirror225.width = 0;
          mirror225.height = 0;
        }
        for (const angle of TURNAROUND_ANGLES) {
          const c = cutCanvases[angle];
          if (c) {
            c.width = 0;
            c.height = 0;
          }
        }
        for (const extra of extraCanvases) {
          extra.width = 0;
          extra.height = 0;
        }
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
      270: fallbackCut,
      315: fallbackCut,
    };
  }

  // Every cut canvas above already ran applyCornerBfsCutoutOnCanvas + scrubCutoutArtifactsOnCanvas;
  // only re-run ensureTransparentCutout if any angle fell back to raw sheetDataUrl.
  const uniqueMap = new Map<string, Promise<string>>();
  const verifiedOut = {} as Record<TurnaroundAngleDeg, string>;
  await Promise.all(
    TURNAROUND_ANGLES.map(async (angle) => {
      const src = rawCropped[angle];
      if (src && src !== sheetDataUrl && src.startsWith('data:image/png;base64,')) {
        verifiedOut[angle] = src;
        return;
      }
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

export interface ShowcaseDemoVtonOptions {
  handedness?: DominantHand | 'right-handed' | 'left-handed' | string | null;
  hasEquippedBag?: boolean;
  bagGarment?: Partial<GarmentRecord> | null;
}

const showcaseMemorySlices: Partial<Record<string, Record<TurnaroundAngleDeg, string>>> = {};
const showcaseInFlight: Partial<
  Record<string, Promise<Record<TurnaroundAngleDeg, string> | null>>
> = {};

export function resolveShowcaseCacheKey(
  styleMode: VtonStyleMode,
  options?: ShowcaseDemoVtonOptions | null
): { cacheKey: string; mirrorForLeftHanded: boolean } {
  const hand = normalizeHandedness(
    options?.handedness ?? getCachedServerHandedness('right'),
    'right'
  );
  const hasBag = options?.hasEquippedBag !== false;
  const mirrorForLeftHanded = hand === 'left' && hasBag;
  const bagToken = options?.bagGarment
    ? resolveGarmentCanonicalImageUrl(options.bagGarment) ||
      String(options.bagGarment.id || options.bagGarment.name || '').trim()
    : '';
  return {
    cacheKey: mirrorForLeftHanded
      ? bagToken
        ? `${styleMode}::left::${bagToken}`
        : `${styleMode}::left`
      : styleMode,
    mirrorForLeftHanded,
  };
}

export async function mirrorImageDataUrlHorizontally(
  dataUrl: string,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> {
  if (!dataUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      let canvas: HTMLCanvasElement | null = null;
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const flipped = mirrorRgbaPixelBufferHorizontally(imgData.data, w, h);
        imgData.data.set(flipped);
        ctx.putImageData(imgData, 0, 0);
        resolve(
          mimeType === 'image/jpeg'
            ? canvas.toDataURL('image/jpeg', 0.86)
            : canvas.toDataURL('image/png')
        );
      } catch {
        resolve(dataUrl);
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function compositeMirroredBagOnSideSlice(
  sliceDataUrl: string,
  angleDeg: 45 | 90,
  bagGarment?: Partial<GarmentRecord> | null
): Promise<string> {
  if (
    !sliceDataUrl ||
    !bagGarment ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    return sliceDataUrl;
  }
  const canonicalBagUrl = resolveGarmentCanonicalImageUrl(bagGarment);
  const bagInlineUrl = await encodeImageUrlToInlineDataUrl(canonicalBagUrl);
  if (!bagInlineUrl) return sliceDataUrl;

  return new Promise<string>((resolve) => {
    const baseImg = new Image();
    baseImg.onload = () => {
      const bagImg = new Image();
      bagImg.onload = () => {
        let canvas: HTMLCanvasElement | null = null;
        let bagCanvas: HTMLCanvasElement | null = null;
        try {
          const w = baseImg.naturalWidth || baseImg.width;
          const h = baseImg.naturalHeight || baseImg.height;
          const bw = bagImg.naturalWidth || bagImg.width;
          const bh = bagImg.naturalHeight || bagImg.height;
          if (!w || !h || !bw || !bh) {
            resolve(sliceDataUrl);
            return;
          }

          canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(sliceDataUrl);
            return;
          }
          ctx.drawImage(baseImg, 0, 0, w, h);
          const baseMetrics = inspectPixelSliceQc(ctx.getImageData(0, 0, w, h).data, w, h);
          if (baseMetrics.fgPixels < 32 || baseMetrics.maxY <= baseMetrics.minY) {
            resolve(sliceDataUrl);
            return;
          }

          // Cut out solid packshot background & horizontally mirror the bag asset
          bagCanvas = document.createElement('canvas');
          bagCanvas.width = bw;
          bagCanvas.height = bh;
          const bagCtx = bagCanvas.getContext('2d', { willReadFrequently: true });
          if (!bagCtx) {
            resolve(sliceDataUrl);
            return;
          }
          bagCtx.save();
          bagCtx.translate(bw, 0);
          bagCtx.scale(-1, 1);
          bagCtx.drawImage(bagImg, 0, 0, bw, bh);
          bagCtx.restore();
          applyCornerBfsCutoutOnCanvas(bagCanvas);

          const figH = Math.max(80, baseMetrics.maxY - baseMetrics.minY);
          const headH = figH / 7.5;
          const cx = baseMetrics.coreCenterXRatio * w;
          const shoulderY = baseMetrics.minY + headH * 1.32;
          const waistY = baseMetrics.minY + headH * 3.15;
          const placement = computeBagAssetPlacementBox({
            angleDeg,
            handedness: 'left',
            cx,
            shoulderY,
            waistY,
            shoulderW: headH * 1.45,
            hipW: headH * 1.25,
            headH,
            widthCompact: 0.92,
          });
          if (placement.visible && placement.bagRect) {
            ctx.drawImage(
              bagCanvas,
              placement.bagRect.x,
              placement.bagRect.y,
              placement.bagRect.width,
              placement.bagRect.height
            );
          }
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(sliceDataUrl);
        } finally {
          if (bagCanvas) {
            bagCanvas.width = 0;
            bagCanvas.height = 0;
          }
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      };
      bagImg.onerror = () => resolve(sliceDataUrl);
      bagImg.src = bagInlineUrl;
    };
    baseImg.onerror = () => resolve(sliceDataUrl);
    baseImg.src = sliceDataUrl;
  });
}

async function buildLeftHandedShowcaseSlices(
  baseSlices: Record<TurnaroundAngleDeg, string>,
  bagGarment?: Partial<GarmentRecord> | null
): Promise<Record<TurnaroundAngleDeg, string>> {
  const [
    mirrored0,
    mirrored180,
    mirroredFrom225For135,
    mirroredFrom135For225,
    side45,
    side90,
    side270,
    side315,
  ] = await Promise.all([
    mirrorImageDataUrlHorizontally(baseSlices[0], 'image/png'),
    mirrorImageDataUrlHorizontally(baseSlices[180], 'image/png'),
    mirrorImageDataUrlHorizontally(baseSlices[225], 'image/png'),
    mirrorImageDataUrlHorizontally(baseSlices[135], 'image/png'),
    compositeMirroredBagOnSideSlice(baseSlices[45], 45, bagGarment),
    compositeMirroredBagOnSideSlice(baseSlices[90], 90, bagGarment),
    mirrorImageDataUrlHorizontally(baseSlices[90], 'image/png'),
    mirrorImageDataUrlHorizontally(baseSlices[45], 'image/png'),
  ]);
  return {
    0: mirrored0,
    45: side45,
    90: side90,
    135: mirroredFrom225For135,
    180: mirrored180,
    225: mirroredFrom135For225,
    270: side270,
    315: side315,
  };
}

export function getShowcaseDemoSheetUrl(rawStyleMode?: string | null): string {
  const token = String(rawStyleMode || '')
    .trim()
    .toLowerCase();
  if (token === 'photorealistic') {
    return withPublicBaseUrl('/seed/vton-showcase-3x2-cyber-female.jpg?mode=photoreal');
  }
  return withPublicBaseUrl('/seed/vton-showcase-3x2-cyber-female.jpg?mode=stylized');
}

export function getShowcaseDemoSliceUrls(): Record<TurnaroundAngleDeg, string> {
  return {
    0: withPublicBaseUrl('/seed/demo-cyber-female-0.webp?v=3'),
    45: withPublicBaseUrl('/seed/demo-cyber-female-45.webp?v=3'),
    90: withPublicBaseUrl('/seed/demo-cyber-female-90.webp?v=3'),
    135: withPublicBaseUrl('/seed/demo-cyber-female-135.webp?v=3'),
    180: withPublicBaseUrl('/seed/demo-cyber-female-180.webp?v=3'),
    225: withPublicBaseUrl('/seed/demo-cyber-female-225.webp?v=3'),
    270: withPublicBaseUrl('/seed/demo-cyber-female-270.webp?v=3'),
    315: withPublicBaseUrl('/seed/demo-cyber-female-315.webp?v=3'),
  };
}

export function peekShowcaseDemoVtonSlice(
  styleMode: VtonStyleMode,
  angleDeg: number,
  options?: ShowcaseDemoVtonOptions | null
): string | null {
  const normalizedStyle: VtonStyleMode =
    String(styleMode || '')
      .trim()
      .toLowerCase() === 'photorealistic'
      ? 'photorealistic'
      : 'stylized_isometric';
  const normalizedAngle = normalizeTurnaroundAngleDeg(angleDeg, DEFAULT_TURNAROUND_ANGLE);
  const { cacheKey, mirrorForLeftHanded } = resolveShowcaseCacheKey(normalizedStyle, options);
  const cached = showcaseMemorySlices[cacheKey]?.[normalizedAngle];
  if (cached) return cached;
  if (!mirrorForLeftHanded) {
    return getShowcaseDemoSliceUrls()[normalizedAngle] || null;
  }
  return null;
}

export async function loadShowcaseDemoVtonSlices(
  rawStyleMode?: string | null,
  options?: ShowcaseDemoVtonOptions | null
): Promise<Record<TurnaroundAngleDeg, string> | null> {
  const styleMode: VtonStyleMode =
    String(rawStyleMode || '')
      .trim()
      .toLowerCase() === 'photorealistic'
      ? 'photorealistic'
      : 'stylized_isometric';
  const { cacheKey, mirrorForLeftHanded } = resolveShowcaseCacheKey(styleMode, options);
  const cachedSlices = showcaseMemorySlices[cacheKey];
  if (cachedSlices) {
    return cachedSlices;
  }
  const inFlightJob = showcaseInFlight[cacheKey];
  if (inFlightJob) {
    return inFlightJob;
  }

  const job = (async (): Promise<Record<TurnaroundAngleDeg, string> | null> => {
    try {
      let baseSlices = showcaseMemorySlices[styleMode];
      if (!baseSlices) {
        const directSlices = getShowcaseDemoSliceUrls();
        if (typeof Image !== 'undefined') {
          await new Promise<void>((resolve) => {
            const preloadFront = new Image();
            preloadFront.onload = () => resolve();
            preloadFront.onerror = () => resolve();
            preloadFront.src = directSlices[0];
          });
        }
        baseSlices = directSlices;
        showcaseMemorySlices[styleMode] = baseSlices;
      }
      if (!mirrorForLeftHanded) {
        return baseSlices;
      }
      const leftSlices = await buildLeftHandedShowcaseSlices(baseSlices, options?.bagGarment);
      showcaseMemorySlices[cacheKey] = leftSlices;
      return leftSlices;
    } catch {
      return null;
    } finally {
      delete showcaseInFlight[cacheKey];
    }
  })();

  showcaseInFlight[cacheKey] = job;
  return job;
}

function buildVtonRequestAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isSampleDemoMode() || !getStoredToken()) {
    headers['X-Demo-Mode'] = 'sample';
  }
  return { ...headers, ...extraHeaders };
}

export async function fetchServerGeminiConfigured(): Promise<boolean> {
  if (isStaticStandaloneWithoutApi()) {
    return false;
  }
  try {
    const status = await apiFetch<{ geminiConfigured?: boolean }>('/vton/status', {
      method: 'GET',
      headers: buildVtonRequestAuthHeaders(),
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
        let canvas: HTMLCanvasElement | null = null;
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
          canvas = document.createElement('canvas');
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
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
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
  equippedGarments: Array<{ slotKey: string; garment: GarmentRecord }>,
  rawHandedness: unknown = 'right'
): Promise<Record<string, Record<string, unknown>>> {
  const payload: Record<string, Record<string, unknown>> = {};
  const handedness = normalizeHandedness(rawHandedness, 'right');
  const bagAnatomy = resolveBagCarryAnatomy(handedness);

  await Promise.all(
    equippedGarments.map(async ({ slotKey, garment }) => {
      const canonicalUrl = resolveGarmentCanonicalImageUrl(garment);
      const isBag = isBagGarmentItem({
        slot: slotKey,
        category: garment.category,
        subcategory: garment.subcategory,
        name: garment.name,
      });
      const bagCarrySpec = isBag ? inferBagCarrySpec(garment) : null;
      const shouldMirrorBagAsset = Boolean(
        isBag && handedness === 'left' && bagCarrySpec?.bag_carry_style !== 'backpack'
      );
      // Fast-path: `/seed/*` packshots already live on the Express server's local disk & RAM LRU cache.
      // Skip redundant client HTTP fetch + canvas re-encoding + multi-MB JSON upload unless mirroring a left-handed bag.
      const canUseServerLocalSeed =
        !shouldMirrorBagAsset && canonicalUrl.startsWith('/seed/');
      const rawInlineDataUrl = canUseServerLocalSeed
        ? null
        : await encodeImageUrlToInlineDataUrl(canonicalUrl);
      const inlineDataUrl =
        shouldMirrorBagAsset && rawInlineDataUrl
          ? await mirrorImageDataUrlHorizontally(rawInlineDataUrl, 'image/jpeg')
          : rawInlineDataUrl;
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
        isBag,
        has_strap: bagCarrySpec ? bagCarrySpec.has_strap : null,
        bag_carry_style: bagCarrySpec ? bagCarrySpec.bag_carry_style : null,
        bagAssetMirrored: shouldMirrorBagAsset,
        bagCarrySide: isBag ? bagAnatomy.carrySide : null,
        ...(inlineDataUrl ? { packshotDataUrl: inlineDataUrl } : {}),
      };
    })
  );

  return payload;
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
    bagCarrySide?: 'left' | 'right' | null;
  }
): void {
  const {
    cx,
    rowTop,
    cellW,
    cellH,
    headTopY,
    footSoleY,
    bmiScale,
    angleDeg,
    bagCarrySide = null,
  } = params;
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

    // Foreground bag silhouette cue at 90° Right Side Profile when left-handed (`bagCarrySide === 'right'`)
    if (bagCarrySide === 'left' || bagCarrySide === 'right') {
      const sidePlacement = computeBagAssetPlacementBox({
        angleDeg: 90,
        handedness: bagCarrySide === 'right' ? 'left' : 'right',
        cx,
        shoulderY,
        waistY,
        shoulderW: sideTorsoW,
        hipW: sideTorsoW,
        headH,
        widthCompact,
      });
      if (sidePlacement.visible && sidePlacement.bagRect) {
        if (sidePlacement.strapRect) {
          ctx.fillRect(
            sidePlacement.strapRect.x,
            sidePlacement.strapRect.y,
            sidePlacement.strapRect.width,
            sidePlacement.strapRect.height
          );
        }
        ctx.fillRect(
          sidePlacement.bagRect.x,
          sidePlacement.bagRect.y,
          sidePlacement.bagRect.width,
          sidePlacement.bagRect.height
        );
      }
    }

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

  // Subtle anatomical bag placement block computed via `computeBagAssetPlacementBox` (mirrored across `cx` when left-handed)
  if (bagCarrySide === 'left' || bagCarrySide === 'right') {
    const bagPlacement = computeBagAssetPlacementBox({
      angleDeg,
      handedness: bagCarrySide === 'right' ? 'left' : 'right',
      cx,
      shoulderY,
      waistY,
      shoulderW,
      hipW,
      headH,
      widthCompact,
    });
    if (bagPlacement.visible && bagPlacement.bagRect) {
      if (bagPlacement.strapRect) {
        ctx.fillRect(
          bagPlacement.strapRect.x,
          bagPlacement.strapRect.y,
          bagPlacement.strapRect.width,
          bagPlacement.strapRect.height
        );
      }
      ctx.fillRect(
        bagPlacement.bagRect.x,
        bagPlacement.bagRect.y,
        bagPlacement.bagRect.width,
        bagPlacement.bagRect.height
      );
    }
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
  bagCarrySide?: 'left' | 'right' | null;
}): string | null {
  if (typeof document === 'undefined') return null;

  const [bgR, bgG, bgB] = parseHexToRgbTriplet(params.backdropHex || CUTOUT_STAGE_BACKDROP_HEX);
  const safeH = clamp(Number(params.heightCm) || 172, 100, 230);
  const safeW = clamp(Number(params.weightKg) || 64, 35, 160);
  const bmi = safeW / (safeH / 100) ** 2;
  const bmiScale = clamp(1 + (bmi - 22.0) * 0.022, 0.86, 1.24);
  const bagTag = params.bagCarrySide || 'none';
  const memoKey = `v13:${bgR},${bgG},${bgB}:${Math.round(bmiScale * 100)}:${bagTag}`;
  const cached = turnaround3x2GuideMemo.get(memoKey);
  if (cached) return cached;

  let canvas: HTMLCanvasElement | null = null;
  try {
    const W = 1344;
    const H = 896;
    const cellW = W / 3;
    const cellH = H / 2;
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
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
          bagCarrySide: params.bagCarrySide || null,
        });
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
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
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
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
      let canvas: HTMLCanvasElement | null = null;
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
          canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
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
              persistCharacterIdentityAnchorEntry(anchorKey, candidate);
              resolve(candidate);
              return;
            }
          }
          canvas.width = 0;
          canvas.height = 0;
          canvas = null;
        }
        resolve(null);
      } catch {
        resolve(null);
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
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

/**
 * 100% Server-Side Gemini Multimodal Multi-Angle Virtual Try-On Dispatcher (Weather-Pose + RGBA Cutout v2).
 * - Zero procedural drawing or mathematical 2D mesh warping under ANY circumstance.
 * - Checks L1 Memory + L2 IndexedDB (`CUTOUT_PIPELINE_VERSION + avatarConfigHash + outfitComboId + styleMode + effectiveWeather + angleDeg`) first for 0ms hits.
 * - Requests a Turnaround Studio Sheet (`0°`, `45°`, `90°`, `135°`, `180°`, `225°`) from the server endpoint `/api/vton/synthesize`,
 *   cuts out true RGBA transparency (`removeModelBackgroundToPng` + `applyCornerBfsCutoutOnCanvas`),
 *   slices all angles as `image/png`, and caches them in IndexedDB.
 */
export async function synthesizeGeminiMultiAngleVton(
  request: AiVtonSynthesisRequest
): Promise<AiVtonSynthesisOutcome> {
  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const styleMode = normalizeVtonStyleMode(request.styleMode);
  const angleDeg = normalizeTurnaroundAngleDeg(request.viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const weatherMood = normalizeWeatherMoodKey(request.weather);
  const effectiveWeather = resolveEffectiveWeatherFromRaw(request.weather);
  const baseProfile = normalizeGenderNeutralProfile(request);

  // Step 0: Explicitly check server-side profile configuration (`handedness`, default: `'right'`)
  // BEFORE cache lookup, slot serialization, or character rendering!
  const serverProfileConfig = await fetchServerProfileConfig(baseProfile.dominantHand);
  const explicitReqHand = request.handedness ?? request.dominantHand;
  const resolvedHandedness: AvatarDominantHand =
    explicitReqHand !== undefined &&
    explicitReqHand !== null &&
    String(explicitReqHand).trim() !== ''
      ? normalizeHandedness(explicitReqHand, serverProfileConfig.handedness)
      : serverProfileConfig.hasStoredRecord
        ? serverProfileConfig.handedness
        : baseProfile.dominantHand;

  if (
    serverProfileConfig.hasStoredRecord &&
    serverProfileConfig.handedness !== baseProfile.dominantHand &&
    !request.avatarSpec
  ) {
    patchAvatarSpec({ dominantHand: serverProfileConfig.handedness });
  }

  const profile =
    resolvedHandedness !== baseProfile.dominantHand
      ? normalizeGenderNeutralProfile({
          ...request,
          handedness: resolvedHandedness,
          avatarConfigHash: null,
        })
      : baseProfile;

  const { outfitComboId, equippedSlotKeys, equippedGarments } = computeOutfitComboId(
    request.slots,
    profile.dominantHand,
    { saggingFit: Boolean(request.saggingFit) }
  );
  const hasEquippedBag = equippedGarments.some(({ slotKey, garment }) =>
    isBagGarmentItem({
      slot: slotKey,
      category: garment.category,
      subcategory: garment.subcategory,
      name: garment.name,
    })
  );
  const bagAssetMirrored = Boolean(hasEquippedBag && profile.dominantHand === 'left');

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
      let cachedSheetImageUrl: string | null = cachedHit.slice.sheetImageUrl || null;
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
            if (other.slice.sheetImageUrl && (candidateAngle === 0 || !cachedSheetImageUrl)) {
              cachedSheetImageUrl = other.slice.sheetImageUrl;
            }
          }
        })
      );
      let cachedQcValid = true;
      if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
        const cachedMetrics: Partial<Record<number, VtonQcSliceMetrics>> = {};
        await Promise.all(
          Object.entries(angleSlices).map(async ([k, url]) => {
            if (!url) return;
            const m = await inspectDataUrlQcMetrics(url);
            if (m) cachedMetrics[Number(k)] = m;
          })
        );
        if (Object.keys(cachedMetrics).length >= 2) {
          cachedQcValid = evaluateTurnaroundConsistencyQc(cachedMetrics).ok;
        } else if (cachedMetrics[angleDeg]) {
          const cm = cachedMetrics[angleDeg]!;
          cachedQcValid =
            !cm.clippedTop &&
            !cm.clippedBottom &&
            !cm.halfBody &&
            cm.fgHeightRatio >= 0.48 &&
            cm.interiorChromaRatio <= 0.045;
        }
      }
      if (cachedQcValid) {
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
          sheetImageUrl: cachedSheetImageUrl,
          angleSlices,
          equippedCount: equippedGarments.length,
          equippedSlotKeys,
          profile,
          handedness: profile.dominantHand,
          bagAssetMirrored,
          createdAt: cachedHit.slice.updatedAt,
        };
      }
    }
  }

  const useTurnaroundSheet = request.turnaroundSheet !== false;
  const flightKey = `${CUTOUT_PIPELINE_VERSION}::${profile.avatarConfigHash}::${outfitComboId}::${styleMode}::${effectiveWeather}::${useTurnaroundSheet ? 'sheet' : angleDeg}`;

  const buildAbortedOutcome = (): AiVtonSynthesisOutcome => ({
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
    handedness: profile.dominantHand,
    bagAssetMirrored,
    createdAt: Date.now(),
  });

  if (request.signal?.aborted) {
    return buildAbortedOutcome();
  }

  const awaitEntryWithCallerSignal = (
    entry: InFlightAiEntry,
    callerSignal?: AbortSignal
  ): Promise<AiVtonSynthesisOutcome> => {
    if (!callerSignal) {
      return entry.promise;
    }
    if (callerSignal.aborted) {
      entry.subscriberCount = Math.max(0, entry.subscriberCount - 1);
      if (entry.subscriberCount <= 0 && !entry.settled) {
        entry.controller?.abort();
      }
      return Promise.resolve(buildAbortedOutcome());
    }
    return new Promise<AiVtonSynthesisOutcome>((resolve) => {
      let finished = false;
      const onAbort = () => {
        if (finished) return;
        finished = true;
        entry.subscriberCount = Math.max(0, entry.subscriberCount - 1);
        if (entry.subscriberCount <= 0 && !entry.settled) {
          entry.controller?.abort();
        }
        resolve(buildAbortedOutcome());
      };
      callerSignal.addEventListener('abort', onAbort, { once: true });
      entry.promise
        .then((shared) => {
          if (finished) return;
          finished = true;
          callerSignal.removeEventListener('abort', onAbort);
          resolve(shared);
        })
        .catch(() => {
          if (finished) return;
          finished = true;
          callerSignal.removeEventListener('abort', onAbort);
          resolve(buildAbortedOutcome());
        });
    });
  };

  if (!request.forceRefresh && inFlightAiRequests.has(flightKey)) {
    const existingEntry = inFlightAiRequests.get(flightKey)!;
    if (request.signal?.aborted) {
      return buildAbortedOutcome();
    }
    existingEntry.subscriberCount += 1;
    const shared = await awaitEntryWithCallerSignal(existingEntry, request.signal);
    if (shared.reason === 'aborted' && request.signal?.aborted) {
      return shared;
    }
    const targetImg = shared.angleSlices[angleDeg] || shared.imageUrl;
    return {
      ...shared,
      angleDeg,
      cacheKey,
      imageUrl: targetImg || null,
    };
  }

  const flightController =
    !request.forceRefresh && typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;
  const effectiveSignal = flightController ? flightController.signal : request.signal;
  const flightEntry: InFlightAiEntry = {
    promise: Promise.resolve(buildAbortedOutcome()),
    subscriberCount: 1,
    settled: false,
    controller: flightController,
  };

  const runPromise = (async (): Promise<AiVtonSynthesisOutcome> => {
    try {
      const [serializedSlots, encodedPortrait] = await Promise.all([
        buildMultimodalSlotsPayload(equippedGarments, profile.dominantHand),
        profile.portraitDataUrl
          ? encodeImageUrlToInlineDataUrl(profile.portraitDataUrl)
          : Promise.resolve(null),
      ]);
      const effectivePortraitUrl = encodedPortrait || profile.portraitDataUrl || null;
      const effectiveProfile: NormalizedVtonProfile =
        effectivePortraitUrl !== profile.portraitDataUrl
          ? { ...profile, portraitDataUrl: effectivePortraitUrl }
          : profile;

      const isStaticStandalone = isStaticStandaloneWithoutApi();

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

      const maxQcAttempts = useTurnaroundSheet ? 1 : 3;
      const serializedWeatherPayload =
        request.weather && typeof request.weather === 'object'
          ? {
              ...request.weather,
              effectiveWeather: request.weather.effectiveWeather ?? effectiveWeather,
              mood: request.weather.mood ?? weatherMood,
            }
          : { mood: weatherMood, effectiveWeather };
      let bestValidZeroSlice: string | null = null;
      let lastQcReport: TurnaroundConsistencyQcReport | null = null;
      let lastFailureReason: string | null = null;
      let lastModelName: string | null = null;

      let passedSlices: Partial<Record<TurnaroundAngleDeg, string>> | null = null;
      let passedEntries: CachedAiVtonSlice[] = [];
      let passedCached = false;

      for (let attempt = 1; attempt <= maxQcAttempts; attempt += 1) {
        if (effectiveSignal?.aborted) {
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
        let synthesisSource: 'gemini' | null = null;

        if (!isStaticStandalone) {
          const reqHeaders = buildVtonRequestAuthHeaders({
            'X-Profile-Key': serverProfileConfig.profileKey,
          });

          try {
            json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
              method: 'POST',
              headers: reqHeaders,
              ...(effectiveSignal ? { signal: effectiveSignal } : {}),
              body: JSON.stringify({
                mode,
                styleMode,
                viewAngleDeg: angleDeg,
                turnaroundSheet: useTurnaroundSheet,
                ...(useTurnaroundSheet
                  ? { turnaroundLayout: request.turnaroundLayout || 'turnaround_4x2' }
                  : {}),
                weather: serializedWeatherPayload,
                saggingFit: Boolean(request.saggingFit),
                profileKey: serverProfileConfig.profileKey,
                handedness: effectiveProfile.dominantHand,
                avatarSpec: effectiveProfile.avatarSpec,
                avatarConfigHash: effectiveProfile.avatarConfigHash,
                portraitDataUrl: effectivePortraitUrl,
                profile: {
                  gender: effectiveProfile.gender,
                  dominantHand: effectiveProfile.dominantHand,
                  handedness: effectiveProfile.dominantHand,
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
                ...(request.masterAnchorDataUrl
                  ? { masterAnchorDataUrl: request.masterAnchorDataUrl }
                  : {}),
                ...(request.skipVisionQc ? { skipVisionQc: true } : {}),
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
            const isServerAbort =
              Boolean(effectiveSignal?.aborted) ||
              (serverErr instanceof Error && serverErr.name === 'AbortError');
            const serverStatus =
              serverErr && typeof serverErr === 'object' && 'status' in serverErr
                ? Number((serverErr as { status?: number }).status)
                : 0;
            json = {
              ok: false,
              fallbackReason: isServerAbort
                ? 'aborted'
                : serverStatus === 413
                  ? 'payload_too_large'
                  : serverStatus > 0
                    ? `http_${serverStatus}`
                    : 'backend_unavailable',
              compositeImageUrl: null,
            };
            rawComposite = null;
          }
        }

        if (!rawComposite && !json?.panelImages) {
          lastFailureReason = json?.fallbackReason || 'gemini_api_key_not_configured';
          if (isFatalReason(lastFailureReason)) {
            break;
          }
          continue;
        }

        const modelName = String(json.model || 'gemini-nano-banana-2.1');
        lastModelName = modelName;
        const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {};
        const entriesToPersist: CachedAiVtonSlice[] = [];
        const isTurnaroundResponse = json.layout
          ? json.layout === 'turnaround_4x2' ||
            json.layout === 'turnaround_3x2' ||
            json.layout === 'turnaround_2x2'
          : useTurnaroundSheet;

        if (
          rawComposite &&
          (json.frontOnlyDegraded || json.fallbackView === 'positive-only')
        ) {
          const zeroCut = await ensureTransparentCutout(
            await removeModelBackgroundToPng(rawComposite)
          );
          const zeroMap: Partial<Record<TurnaroundAngleDeg, string>> = { 0: zeroCut };
          await normalizeTurnaroundDataUrlsToFloorBaseline(zeroMap);
          const finalZeroUrl = zeroMap[0] || zeroCut;
          const zeroCacheKey = buildAiVtonCacheKey({
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            effectiveWeather,
            angleDeg: 0,
          });
          logVtonQcFailure({
            outfitComboId,
            avatarConfigHash: profile.avatarConfigHash,
            attempts: Number(json.qcAttempts) || maxQcAttempts,
            reasons:
              Array.isArray(json.qcReasons) && json.qcReasons.length > 0
                ? json.qcReasons
                : [json.fallbackReason || 'qc_front_only_fallback'],
            failedAngles: Array.isArray(json.failedAngles) ? json.failedAngles : [],
            frontOnlyFallback: true,
          });
          return {
            ok: true,
            fallbackToFlatLay: false,
            frontOnlyDegraded: true,
            fallbackView: json.fallbackView || 'positive-only',
            notificationPopup: json.notificationPopup ?? {
              code: 'QC_FRONT_ONLY_FALLBACK',
              durationMs: 3000,
              messageKo: '현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.',
              messageEn: 'Due to a temporary connection issue, only the front view is shown.',
            },
            qcAttempts: Number(json.qcAttempts) || maxQcAttempts,
            reason: json.fallbackReason || 'qc_front_only_fallback',
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
            imageUrl: finalZeroUrl,
            angleSlices: { 0: finalZeroUrl },
            equippedCount: equippedGarments.length,
            equippedSlotKeys,
            profile,
            handedness: profile.dominantHand,
            bagAssetMirrored,
            createdAt: now,
          };
        }

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
          const resolvedSheetLayout = json.layout || request.turnaroundLayout || 'turnaround_4x2';
          const sliced = await sliceTurnaround2x2Sheet(rawComposite, {
            layout: resolvedSheetLayout,
            hasEquippedBag,
          });

          // Cost-safe single-shot 4x2 mode: skip per-angle paid repair fan-out (1 sheet call = 1 charge)
          const badAngles: TurnaroundAngleDeg[] = [];
          if (resolvedSheetLayout !== 'turnaround_4x2') {
            const integrityEntries = await Promise.all(
              TURNAROUND_ANGLES.map(async (a) => {
                const url = sliced[a];
                if (!url) return [a, { ok: false, reason: 'too_small', fgHeightRatio: 0 }] as const;
                const rep = await inspectCutoutDataUrlIntegrity(url);
                return [a, rep] as const;
              })
            );
            for (const [a, rep] of integrityEntries) {
              if (!rep.ok) badAngles.push(a);
            }
          }

          if (badAngles.length > 0 && !effectiveSignal?.aborted) {
            const repairTargets =
              badAngles.length <= 2
                ? badAngles
                : Array.from(new Set<TurnaroundAngleDeg>([angleDeg, 0, ...badAngles])).slice(0, 6);

            const attemptRepairAngle = async (repairAngle: TurnaroundAngleDeg) => {
              try {
                let repairRaw: string | null = null;
                if (synthesisSource === 'gemini' && !isStaticStandalone) {
                  const reqHeaders = buildVtonRequestAuthHeaders({
                    'X-Profile-Key': serverProfileConfig.profileKey,
                  });
                  const serverRepair = await apiFetch<VtonServerResponse>('/vton/synthesize', {
                    method: 'POST',
                    headers: reqHeaders,
                    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
                    body: JSON.stringify({
                      mode,
                      styleMode,
                      viewAngleDeg: repairAngle,
                      turnaroundSheet: false,
                      weather: serializedWeatherPayload,
                      saggingFit: Boolean(request.saggingFit),
                      profileKey: serverProfileConfig.profileKey,
                      handedness: effectiveProfile.dominantHand,
                      avatarSpec: effectiveProfile.avatarSpec,
                      avatarConfigHash: effectiveProfile.avatarConfigHash,
                      portraitDataUrl: effectivePortraitUrl,
                      profile: {
                        gender: effectiveProfile.gender,
                        dominantHand: effectiveProfile.dominantHand,
                        handedness: effectiveProfile.dominantHand,
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
              if (effectiveSignal?.aborted) break;
              await Promise.all(
                repairTargets.slice(i, i + 3).map(async (targetAngle) => {
                  if (effectiveSignal?.aborted) return;
                  await attemptRepairAngle(targetAngle);
                  if (effectiveSignal?.aborted) return;
                  const post = sliced[targetAngle]
                    ? await inspectCutoutDataUrlIntegrity(sliced[targetAngle]!)
                    : { ok: false };
                  if (!post.ok && !effectiveSignal?.aborted) {
                    await attemptRepairAngle(targetAngle);
                  }
                })
              );
            }
          }

          const hasAsymmetricOutfit = equippedSlotKeys.some(
            (sk) =>
              sk === 'accessory' ||
              sk === 'acc_umbrella' ||
              sk === 'umbrella' ||
              sk.endsWith('_left') ||
              sk.endsWith('_right')
          );

          // Last-resort headless/half-body guard ONLY for symmetric outfits (never flip asymmetric bags/umbrellas onto the wrong shoulder!)
          if (!hasAsymmetricOutfit) {
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
          }

          const qcBackdropHex = selectOptimalStudioKeyHex(
            extractStudioKeyColorInputs(serializedSlots)
          );

          // Pre-normalization QC: catch cropped / thigh-cut / headless raw slices BEFORE floor-baseline rescaling masks fgHeightRatio!
          let preNormQcPassed = true;
          if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
            const rawMetricsByAngle: Partial<Record<number, VtonQcSliceMetrics>> = {};
            await Promise.all(
              TURNAROUND_ANGLES.map(async (a) => {
                const rawUrl = sliced[a];
                if (!rawUrl) return;
                const m = await inspectDataUrlQcMetrics(rawUrl, qcBackdropHex);
                if (m) rawMetricsByAngle[a] = m;
              })
            );
            if (Object.keys(rawMetricsByAngle).length > 0) {
              const rawQc = evaluateTurnaroundConsistencyQc(rawMetricsByAngle);
              lastQcReport = rawQc;
              if (rawQc.frontValid && sliced[0]) {
                const zeroMap: Partial<Record<TurnaroundAngleDeg, string>> = { 0: sliced[0] };
                await normalizeTurnaroundDataUrlsToFloorBaseline(zeroMap);
                bestValidZeroSlice = zeroMap[0] || sliced[0];
              }
              preNormQcPassed = rawQc.ok;
            }
          }

          // Re-normalize ALL 6 final slices together after single-angle repairs so every angle
          // shares identical 3:4 aspect canvas dimensions, 0.955 floor baseline, uniform 0.79 height, and dead-center spine X.
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
              sheetImageUrl: a === 0 ? rawComposite : null,
              outfitLabel,
              garmentLabels,
              slotGarmentIds,
              equippedCount: equippedGarments.length,
              model: modelName,
              updatedAt: now,
            });
          }

          if (!preNormQcPassed) {
            lastFailureReason = lastQcReport?.reasons?.[0] || 'qc_failed';
            continue;
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
            sheetImageUrl: rawComposite,
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
        const postQcBackdropHex = selectOptimalStudioKeyHex(
          extractStudioKeyColorInputs(serializedSlots)
        );
        if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
          const metricsByAngle: Partial<Record<number, VtonQcSliceMetrics>> = {};
          await Promise.all(
            Object.entries(angleSlices).map(async ([k, url]) => {
              if (!url) return;
              const m = await inspectDataUrlQcMetrics(url, postQcBackdropHex);
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
                  m.interiorChromaRatio <= 0.045 &&
                  (m.garmentCutoutHoleRatio ?? 0) <= 0.0045;
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
            synthesisSource === 'gemini'
          ) {
            await saveCharacterIdentityAnchorFromZeroSlice({
              anchorKey: characterAnchorKey,
              zeroSliceDataUrl: angleSlices[0],
              backdropHex: postQcBackdropHex,
            });
          }
          break;
        }
        lastFailureReason = lastQcReport?.reasons?.[0] || 'qc_failed';
      }

      if (!passedSlices) {
        // Rescue attempt: if all 3 multi-angle sheet attempts failed QC and even 0° was invalid,
        // synthesize a single dedicated 0° front portrait so we can honor the 3s front-only fallback cleanly.
        if (!bestValidZeroSlice && !isFatalReason(lastFailureReason) && !effectiveSignal?.aborted) {
          try {
            let rescueRaw: string | null = null;
            if (!isStaticStandalone) {
              const reqHeaders = buildVtonRequestAuthHeaders({
                'X-Profile-Key': serverProfileConfig.profileKey,
              });
              const serverRescue = await apiFetch<VtonServerResponse>('/vton/synthesize', {
                method: 'POST',
                headers: reqHeaders,
                ...(effectiveSignal ? { signal: effectiveSignal } : {}),
                body: JSON.stringify({
                  mode,
                  styleMode,
                  viewAngleDeg: 0,
                  turnaroundSheet: false,
                  weather: serializedWeatherPayload,
                  saggingFit: Boolean(request.saggingFit),
                  profileKey: serverProfileConfig.profileKey,
                  handedness: effectiveProfile.dominantHand,
                  avatarSpec: effectiveProfile.avatarSpec,
                  avatarConfigHash: effectiveProfile.avatarConfigHash,
                  portraitDataUrl: effectivePortraitUrl,
                  profile: {
                    gender: effectiveProfile.gender,
                    dominantHand: effectiveProfile.dominantHand,
                    handedness: effectiveProfile.dominantHand,
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
                    viewAngleDeg: 0,
                    turnaroundSheet: false,
                  },
                  slots: serializedSlots,
                  forceRefresh: true,
                }),
              });
              rescueRaw = sanitizeImageCandidate(
                serverRescue?.compositeImageUrl ?? serverRescue?.afterImageUrl ?? null
              );
            }
            if (rescueRaw && !effectiveSignal?.aborted) {
              const rescueCut = await ensureTransparentCutout(
                await removeModelBackgroundToPng(rescueRaw)
              );
              const rescueCheck = await inspectCutoutDataUrlIntegrity(rescueCut);
              if (rescueCheck.ok) {
                const rescueMap: Partial<Record<TurnaroundAngleDeg, string>> = { 0: rescueCut };
                await normalizeTurnaroundDataUrlsToFloorBaseline(rescueMap);
                bestValidZeroSlice = rescueMap[0] || rescueCut;
              }
            }
          } catch {
            // Ignore rescue error and fall back gracefully
          }
        }

        if (effectiveSignal?.aborted) {
          return buildAbortedOutcome();
        }

        if (!isFatalReason(lastFailureReason)) {
          const failureReasons = lastQcReport?.reasons || [lastFailureReason || 'qc_failed'];
          const failedAngles = lastQcReport?.failedAngles || [];
          logVtonQcFailure({
            outfitComboId,
            avatarConfigHash: profile.avatarConfigHash,
            attempts: maxQcAttempts,
            reasons: failureReasons,
            failedAngles,
            frontOnlyFallback: Boolean(bestValidZeroSlice),
          });
          if (!isStaticStandalone) {
            void apiFetch('/vton/qc-failure-log', {
              method: 'POST',
              headers: buildVtonRequestAuthHeaders({
                'Content-Type': 'application/json',
                'X-Profile-Key': serverProfileConfig.profileKey,
              }),
              body: JSON.stringify({
                comboHash: outfitComboId,
                avatarConfigHash: profile.avatarConfigHash,
                attempts: maxQcAttempts,
                reasons: failureReasons,
                failedAngles,
                equippedSlots: equippedSlotKeys,
                handedness: profile.dominantHand,
                frontOnlyFallback: Boolean(bestValidZeroSlice),
                provider: 'client-vton-qc',
                model: lastModelName,
              }),
            }).catch(() => {});
          }
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
            fallbackView: 'positive-only',
            notificationPopup: {
              code: 'QC_FRONT_ONLY_FALLBACK',
              durationMs: 3000,
              messageKo: '현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.',
              messageEn: 'Due to a temporary connection issue, only the front view is shown.',
            },
            qcAttempts: maxQcAttempts,
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
            handedness: profile.dominantHand,
            bagAssetMirrored,
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
          handedness: profile.dominantHand,
          bagAssetMirrored,
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
          handedness: profile.dominantHand,
          bagAssetMirrored,
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
        sheetImageUrl:
          passedEntries.find((entry) => entry.angleDeg === 0 && entry.sheetImageUrl)
            ?.sheetImageUrl ??
          passedEntries.find((entry) => Boolean(entry.sheetImageUrl))?.sheetImageUrl ??
          null,
        angleSlices: passedSlices,
        equippedCount: equippedGarments.length,
        equippedSlotKeys,
        profile,
        handedness: profile.dominantHand,
        bagAssetMirrored,
        createdAt: now,
      };
    } catch (err) {
      const isAbort =
        Boolean(effectiveSignal?.aborted) ||
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
        handedness: profile.dominantHand,
        bagAssetMirrored,
        createdAt: Date.now(),
      };
    } finally {
      flightEntry.settled = true;
      if (inFlightAiRequests.get(flightKey) === flightEntry) {
        inFlightAiRequests.delete(flightKey);
      }
    }
  })();

  flightEntry.promise = runPromise;
  if (!request.forceRefresh && !flightEntry.settled) {
    inFlightAiRequests.set(flightKey, flightEntry);
  }
  return awaitEntryWithCallerSignal(flightEntry, request.signal);
}

export interface ProgressiveAngleReadyPayload {
  angleDeg: TurnaroundAngleDeg;
  imageUrl: string;
  sheetImageUrl?: string | null;
  isMasterAnchor: boolean;
  readyAngles: TurnaroundAngleDeg[];
  elapsedMs: number;
  allSlices: Partial<Record<TurnaroundAngleDeg, string>>;
  fromCache: boolean;
  serverLatencyMs?: number;
}

export interface ProgressiveVtonCallbacks {
  onAngleReady?: (payload: ProgressiveAngleReadyPayload) => void;
}

/**
 * Option A — Anchor-First Progressive Multi-Angle VTON Orchestrator:
 * - Stage 1: Synthesizes `0°` Front Master Anchor FIRST (single 3:4 portrait via `gemini-3.1-flash-lite-image`)
 *   and invokes `onAngleReady(0, ...)` immediately so the user sees the front model with minimum First-Look Delay.
 * - Stage 2: Streams remaining angles (`[45, 90]`, then `[135, 225, 180]`) conditioned on the raw `0°` Master Anchor
 *   image + server Vision Orientation/Bag-Side QC, lighting up each angle progressively on the bottom scrollbar.
 */
export async function synthesizeProgressiveMultiAngleVton(
  request: AiVtonSynthesisRequest,
  callbacks?: ProgressiveVtonCallbacks
): Promise<AiVtonSynthesisOutcome> {
  const startedAt = Date.now();
  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const serverProfileConfig = await fetchServerProfileConfig(
    normalizeHandedness(
      request.handedness ??
        request.dominantHand ??
        request.avatarSpec?.dominantHand ??
        request.profile?.dominantHand ??
        getCachedServerHandedness()
    )
  );
  const baseProfile = normalizeGenderNeutralProfile({
    ...request,
    ...(serverProfileConfig.hasStoredRecord
      ? { handedness: serverProfileConfig.handedness }
      : {}),
  });
  const profile = baseProfile;
  const styleMode = normalizeVtonStyleMode(request.styleMode);
  const weatherMood = normalizeWeatherMoodKey(request.weather);
  const effectiveWeather = resolveEffectiveWeatherFromRaw(request.weather);
  const { outfitComboId, equippedSlotKeys, equippedGarments } = computeOutfitComboId(
    request.slots,
    profile.dominantHand,
    { saggingFit: Boolean(request.saggingFit) }
  );
  const hasEquippedBag = equippedGarments.some(({ slotKey, garment }) =>
    isBagGarmentItem({
      slot: slotKey,
      category: garment.category,
      subcategory: garment.subcategory,
      name: garment.name,
    })
  );
  const bagAssetMirrored = Boolean(hasEquippedBag && profile.dominantHand === 'left');
  const zeroCacheKey = buildAiVtonCacheKey({
    avatarConfigHash: profile.avatarConfigHash,
    outfitComboId,
    styleMode,
    effectiveWeather,
    angleDeg: 0,
  });

  const buildEmptyOutcome = (reason: string): AiVtonSynthesisOutcome => ({
    ok: false,
    fallbackToFlatLay: true,
    reason,
    mode,
    provider: 'flatlay-lookbook',
    styleMode,
    angleDeg: 0,
    weatherMood,
    effectiveWeather,
    avatarConfigHash: profile.avatarConfigHash,
    outfitComboId,
    cacheKey: zeroCacheKey,
    fromCache: false,
    cacheLayer: 'flatlay',
    imageUrl: null,
    angleSlices: {},
    equippedCount: equippedGarments.length,
    equippedSlotKeys,
    profile,
    handedness: profile.dominantHand,
    bagAssetMirrored,
    createdAt: Date.now(),
  });

  if (request.signal?.aborted) return buildEmptyOutcome('aborted');
  if (equippedGarments.length === 0) return buildEmptyOutcome('empty_outfit');

  const collectedSlices: Partial<Record<TurnaroundAngleDeg, string>> = {};
  const getReadyAnglesList = (): TurnaroundAngleDeg[] =>
    TURNAROUND_ANGLES.filter((a) => Boolean(collectedSlices[a]));

  // Check cache first when not force-refreshing
  if (!request.forceRefresh) {
    const cachedHits = await Promise.all(
      TURNAROUND_ANGLES.map(async (a) => {
        const hit = await readCachedAiVtonSlice({
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          styleMode,
          effectiveWeather,
          angleDeg: a,
        });
        return [a, hit?.slice?.imageUrl || null, hit?.slice?.sheetImageUrl || null] as const;
      })
    );
    if (request.signal?.aborted) return buildEmptyOutcome('aborted');
    let cachedSheetImageUrl: string | null = null;
    for (const [a, url, sheetUrl] of cachedHits) {
      if (url) collectedSlices[a] = url;
      if (sheetUrl && (a === 0 || !cachedSheetImageUrl)) {
        cachedSheetImageUrl = sheetUrl;
      }
    }
    if (collectedSlices[0]) {
      callbacks?.onAngleReady?.({
        angleDeg: 0,
        imageUrl: collectedSlices[0],
        sheetImageUrl: cachedSheetImageUrl,
        isMasterAnchor: true,
        readyAngles: getReadyAnglesList(),
        elapsedMs: Date.now() - startedAt,
        allSlices: { ...collectedSlices },
        fromCache: true,
      });
      if (getReadyAnglesList().length === TURNAROUND_ANGLES.length) {
        return {
          ok: true,
          fallbackToFlatLay: false,
          frontOnlyDegraded: false,
          reason: null,
          mode,
          provider: 'gemini-vton',
          styleMode,
          angleDeg: 0,
          weatherMood,
          effectiveWeather,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          cacheKey: zeroCacheKey,
          fromCache: true,
          cacheLayer: 'indexeddb',
          imageUrl: collectedSlices[0],
          sheetImageUrl: cachedSheetImageUrl,
          angleSlices: { ...collectedSlices },
          equippedCount: equippedGarments.length,
          equippedSlotKeys,
          profile,
          handedness: profile.dominantHand,
          bagAssetMirrored,
          createdAt: Date.now(),
        };
      }
    }
  }

  const [serializedSlots, encodedPortrait] = await Promise.all([
    buildMultimodalSlotsPayload(equippedGarments, profile.dominantHand),
    profile.portraitDataUrl
      ? encodeImageUrlToInlineDataUrl(profile.portraitDataUrl)
      : Promise.resolve(null),
  ]);
  if (request.signal?.aborted) return buildEmptyOutcome('aborted');

  const effectivePortraitUrl = encodedPortrait || profile.portraitDataUrl || null;
  const effectiveProfile: NormalizedVtonProfile =
    effectivePortraitUrl !== profile.portraitDataUrl
      ? { ...profile, portraitDataUrl: effectivePortraitUrl }
      : profile;

  if (isStaticStandaloneWithoutApi()) {
    return buildEmptyOutcome('gemini_api_key_not_configured');
  }

  const characterAnchorKey =
    styleMode === 'stylized_isometric' && !effectivePortraitUrl
      ? computeCharacterIdentityAnchorKey(effectiveProfile)
      : null;
  const storedCharacterAnchorUrl = characterAnchorKey
    ? getStoredCharacterIdentityAnchor(characterAnchorKey)
    : null;

  const serializedWeatherPayload =
    request.weather && typeof request.weather === 'object'
      ? {
          ...request.weather,
          effectiveWeather: request.weather.effectiveWeather ?? effectiveWeather,
          mood: request.weather.mood ?? weatherMood,
        }
      : { mood: weatherMood, effectiveWeather };

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

  const reqHeaders = buildVtonRequestAuthHeaders({
    'X-Profile-Key': serverProfileConfig.profileKey,
  });

  const PER_ANGLE_FETCH_TIMEOUT_MS = 125_000;

  const synthesizeSingleAngleOnServer = async (
    targetAngle: TurnaroundAngleDeg,
    masterAnchorDataUrl: string | null,
    masterLandmarks?: MasterAnchorLandmarks | null,
    secondaryAnchor?: { angleDeg: TurnaroundAngleDeg; imageDataUrl: string } | null,
    handednessOverride?: 'right' | 'left' | null,
    singleOpts?: { skipVisionQc?: boolean }
  ): Promise<{
    rawImageUrl: string | null;
    cutoutUrl: string | null;
    modelName: string;
    cached: boolean;
    latencyMs: number;
    reason: string | null;
    effectiveBagHandedness: 'right' | 'left' | null;
  }> => {
    const angleController = new AbortController();
    const onParentAbort = () => angleController.abort();
    if (request.signal) {
      if (request.signal.aborted) {
        angleController.abort();
      } else {
        request.signal.addEventListener('abort', onParentAbort, { once: true });
      }
    }
    const timeoutId = setTimeout(() => {
      angleController.abort();
    }, PER_ANGLE_FETCH_TIMEOUT_MS);

    const activeAngleHandedness =
      handednessOverride === 'left' || handednessOverride === 'right'
        ? handednessOverride
        : effectiveProfile.dominantHand;

    try {
      const json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
        method: 'POST',
        headers: reqHeaders,
        signal: angleController.signal,
        body: JSON.stringify({
          mode,
          styleMode,
          viewAngleDeg: targetAngle,
          turnaroundSheet: false,
          ...(singleOpts?.skipVisionQc ? { skipVisionQc: true } : {}),
          weather: serializedWeatherPayload,
          saggingFit: Boolean(request.saggingFit),
          profileKey: serverProfileConfig.profileKey,
          handedness: activeAngleHandedness,
          avatarSpec: effectiveProfile.avatarSpec,
          avatarConfigHash: effectiveProfile.avatarConfigHash,
          portraitDataUrl: effectivePortraitUrl,
          ...(masterAnchorDataUrl ? { masterAnchorDataUrl } : {}),
          ...(secondaryAnchor
            ? {
                secondaryAnchorDataUrl: secondaryAnchor.imageDataUrl,
                secondaryAnchorAngleDeg: secondaryAnchor.angleDeg,
              }
            : {}),
          profile: {
            gender: effectiveProfile.gender,
            dominantHand: activeAngleHandedness,
            handedness: activeAngleHandedness,
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
            viewAngleDeg: targetAngle,
            turnaroundSheet: false,
          },
          slots: serializedSlots,
          forceRefresh: Boolean(request.forceRefresh),
        }),
      });
      const resolvedBagHand: 'right' | 'left' | null =
        json?.effectiveBagHandedness === 'left' || json?.effectiveBagHandedness === 'right'
          ? json.effectiveBagHandedness
          : null;
      const rawUrl = sanitizeImageCandidate(
        json?.compositeImageUrl ?? json?.afterImageUrl ?? null
      );
      if (!rawUrl || json?.geminiUsed === false || json?.angleQcFailed) {
        return {
          rawImageUrl: null,
          cutoutUrl: null,
          modelName: String(json?.model || 'gemini-nano-banana-2.1'),
          cached: false,
          latencyMs: Number(json?.latencyMs) || 0,
          reason: json?.fallbackReason || 'gemini_synthesis_failed',
          effectiveBagHandedness: resolvedBagHand,
        };
      }
      if (request.signal?.aborted) {
        return {
          rawImageUrl: null,
          cutoutUrl: null,
          modelName: String(json?.model || 'gemini-nano-banana-2.1'),
          cached: false,
          latencyMs: 0,
          reason: 'aborted',
          effectiveBagHandedness: resolvedBagHand,
        };
      }
      const cutout = await ensureTransparentCutout(await removeModelBackgroundToPng(rawUrl));
      const singleMap: Partial<Record<TurnaroundAngleDeg, string>> = {
        [targetAngle]: cutout,
      };
      await normalizeTurnaroundDataUrlsToFloorBaseline(
        singleMap,
        targetAngle !== 0 ? masterLandmarks : null
      );
      const normalizedCutout = singleMap[targetAngle] || cutout;
      return {
        rawImageUrl: rawUrl,
        cutoutUrl: normalizedCutout,
        modelName: String(json?.model || 'gemini-nano-banana-2.1'),
        cached: Boolean(json?.cached),
        latencyMs: Number(json?.latencyMs) || 0,
        reason: null,
        effectiveBagHandedness: resolvedBagHand,
      };
    } catch (err) {
      const isParentAbort = Boolean(request.signal?.aborted);
      const isTimeoutAbort =
        !isParentAbort &&
        (angleController.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError'));
      return {
        rawImageUrl: null,
        cutoutUrl: null,
        modelName: 'gemini-nano-banana-2.1',
        cached: false,
        latencyMs: 0,
        reason: isParentAbort
          ? 'aborted'
          : isTimeoutAbort
            ? 'angle_timeout'
            : 'network_or_runtime_error',
        effectiveBagHandedness: null,
      };
    } finally {
      clearTimeout(timeoutId);
      if (request.signal) {
        request.signal.removeEventListener('abort', onParentAbort);
      }
    }
  };

  // Single-Shot High-Res 8-Angle 4x2 Nano Banana 2.1 Mode (1 API call -> slice 8 angles locally, $0 QC retries)
  const useSingleShot4x2Sheet = request.turnaroundSheet !== false;
  if (useSingleShot4x2Sheet) {
    const sheetController = new AbortController();
    const sheetTimeoutId = setTimeout(() => sheetController.abort(), 135_000);
    const onParentSheetAbort = () => sheetController.abort();
    request.signal?.addEventListener('abort', onParentSheetAbort, { once: true });

    try {
      const targetSheetLayout = request.turnaroundLayout || 'turnaround_4x2';
      const json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
        method: 'POST',
        headers: reqHeaders,
        signal: sheetController.signal,
        body: JSON.stringify({
          mode,
          styleMode,
          viewAngleDeg: 0,
          turnaroundSheet: true,
          turnaroundLayout: targetSheetLayout,
          skipVisionQc: true,
          weather: serializedWeatherPayload,
          saggingFit: Boolean(request.saggingFit),
          ...(request.correctionHint ? { correctionHint: String(request.correctionHint).trim().slice(0, 360) } : {}),
          profileKey: serverProfileConfig.profileKey,
          handedness: effectiveProfile.dominantHand,
          avatarSpec: effectiveProfile.avatarSpec,
          avatarConfigHash: effectiveProfile.avatarConfigHash,
          portraitDataUrl: effectivePortraitUrl,
          profile: {
            gender: effectiveProfile.gender,
            dominantHand: effectiveProfile.dominantHand,
            handedness: effectiveProfile.dominantHand,
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
            viewAngleDeg: 0,
            turnaroundSheet: true,
            turnaroundLayout: targetSheetLayout,
          },
          slots: serializedSlots,
          forceRefresh: Boolean(request.forceRefresh),
        }),
      });

      if (request.signal?.aborted) return buildEmptyOutcome('aborted');

      const rawComposite = sanitizeImageCandidate(
        json?.compositeImageUrl ?? json?.afterImageUrl ?? null
      );
      if (
        !rawComposite ||
        json?.geminiUsed === false ||
        json?.provider === 'flatlay-fallback'
      ) {
        return buildEmptyOutcome(json?.fallbackReason || 'gemini_synthesis_failed');
      }

      const modelName = String(json?.model || 'gemini-nano-banana-2.1');
      const resolvedLayout = json?.layout || targetSheetLayout;
      const isSheetPayload =
        resolvedLayout === 'turnaround_4x2' ||
        resolvedLayout === 'turnaround_3x2' ||
        resolvedLayout === 'turnaround_2x2';
      const nowTs = Date.now();
      const entriesToPersist: CachedAiVtonSlice[] = [];

      if (isSheetPayload && !json?.frontOnlyDegraded && json?.fallbackView !== 'positive-only') {
        const sliced = await sliceTurnaround2x2Sheet(rawComposite, {
          layout: resolvedLayout,
          hasEquippedBag,
        });
        if (request.signal?.aborted) return buildEmptyOutcome('aborted');

        for (const angle of TURNAROUND_ANGLES) {
          const sliceUrl = sliced[angle];
          if (!sliceUrl) continue;
          const entryCacheKey = buildAiVtonCacheKey({
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            effectiveWeather,
            angleDeg: angle,
          });
          markCacheKeyTransparentVerified(entryCacheKey);
          collectedSlices[angle] = sliceUrl;
          entriesToPersist.push({
            cacheKey: entryCacheKey,
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            angleDeg: angle,
            weatherMood,
            effectiveWeather,
            imageUrl: sliceUrl,
            sheetImageUrl: angle === 0 ? rawComposite : null,
            outfitLabel,
            garmentLabels,
            slotGarmentIds,
            equippedCount: equippedGarments.length,
            model: modelName,
            updatedAt: nowTs,
          });
        }
      } else {
        const zeroCut = await ensureTransparentCutout(
          await removeModelBackgroundToPng(rawComposite)
        );
        if (request.signal?.aborted) return buildEmptyOutcome('aborted');
        const zeroMap: Partial<Record<TurnaroundAngleDeg, string>> = { 0: zeroCut };
        await normalizeTurnaroundDataUrlsToFloorBaseline(zeroMap);
        const finalZero = zeroMap[0] || zeroCut;
        collectedSlices[0] = finalZero;
        markCacheKeyTransparentVerified(zeroCacheKey);
        entriesToPersist.push({
          cacheKey: zeroCacheKey,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          styleMode,
          angleDeg: 0,
          weatherMood,
          effectiveWeather,
          imageUrl: finalZero,
          sheetImageUrl: rawComposite,
          outfitLabel,
          garmentLabels,
          slotGarmentIds,
          equippedCount: equippedGarments.length,
          model: modelName,
          updatedAt: nowTs,
        });
      }

      const isDegradedFrontOnly =
        Boolean(json?.frontOnlyDegraded) ||
        json?.fallbackView === 'positive-only' ||
        getReadyAnglesList().length <= 1;

      if (!isDegradedFrontOnly && entriesToPersist.length > 0) {
        await persistAiVtonSlices(entriesToPersist);
      }

      const finalZeroUrl = collectedSlices[0] || null;
      if (!finalZeroUrl) {
        return buildEmptyOutcome('gemini_synthesis_failed');
      }

      if (characterAnchorKey) {
        const anchorBackdropHex = selectOptimalStudioKeyHex(
          extractStudioKeyColorInputs(serializedSlots)
        );
        void saveCharacterIdentityAnchorFromZeroSlice({
          anchorKey: characterAnchorKey,
          zeroSliceDataUrl: finalZeroUrl,
          backdropHex: anchorBackdropHex,
        });
      }

      if (isDegradedFrontOnly) {
        logVtonQcFailure({
          outfitComboId,
          avatarConfigHash: profile.avatarConfigHash,
          attempts: Number(json?.qcAttempts) || 3,
          reasons:
            Array.isArray(json?.qcReasons) && json.qcReasons.length > 0
              ? json.qcReasons
              : [json?.fallbackReason || 'qc_front_only_fallback'],
          failedAngles: Array.isArray(json?.failedAngles) ? json.failedAngles : [],
          frontOnlyFallback: true,
        });
        if (!isStaticStandaloneWithoutApi()) {
          void apiFetch('/vton/qc-failure-log', {
            method: 'POST',
            headers: buildVtonRequestAuthHeaders({
              'Content-Type': 'application/json',
              'X-Profile-Key': serverProfileConfig.profileKey,
            }),
            body: JSON.stringify({
              comboHash: outfitComboId,
              avatarConfigHash: profile.avatarConfigHash,
              attempts: Number(json?.qcAttempts) || 3,
              reasons:
                Array.isArray(json?.qcReasons) && json.qcReasons.length > 0
                  ? json.qcReasons
                  : [json?.fallbackReason || 'qc_front_only_fallback'],
              failedAngles: Array.isArray(json?.failedAngles) ? json.failedAngles : [],
              equippedSlots: equippedSlotKeys,
              handedness: profile.dominantHand,
              frontOnlyFallback: true,
              provider: 'server-vton-qc',
              model: modelName,
            }),
          }).catch(() => {});
        }
      } else {
        callbacks?.onAngleReady?.({
          angleDeg: 0,
          imageUrl: finalZeroUrl,
          sheetImageUrl: rawComposite,
          isMasterAnchor: true,
          readyAngles: getReadyAnglesList(),
          elapsedMs: Date.now() - startedAt,
          allSlices: { ...collectedSlices },
          fromCache: Boolean(json?.cached),
          serverLatencyMs: Number(json?.latencyMs) || 0,
        });
      }

      return {
        ok: true,
        fallbackToFlatLay: false,
        frontOnlyDegraded: isDegradedFrontOnly,
        ...(isDegradedFrontOnly
          ? {
              fallbackView: json?.fallbackView || 'positive-only',
              notificationPopup: json?.notificationPopup ?? {
                code: 'QC_FRONT_ONLY_FALLBACK',
                durationMs: 3000,
                messageKo: '현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.',
                messageEn: 'Due to a temporary connection issue, only the front view is shown.',
              },
              qcAttempts: Number(json?.qcAttempts) || 3,
            }
          : {}),
        reason: isDegradedFrontOnly ? json?.fallbackReason || 'qc_front_only_fallback' : null,
        mode,
        provider: 'gemini-vton',
        styleMode,
        angleDeg: 0,
        weatherMood,
        effectiveWeather,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        cacheKey: zeroCacheKey,
        fromCache: Boolean(json?.cached),
        cacheLayer: json?.cached ? 'server' : 'fresh',
        imageUrl: finalZeroUrl,
        sheetImageUrl: rawComposite,
        angleSlices: { ...collectedSlices },
        equippedCount: equippedGarments.length,
        equippedSlotKeys,
        profile,
        handedness: profile.dominantHand,
        bagAssetMirrored,
        createdAt: Date.now(),
      };
    } catch (err) {
      const isParentAbort = Boolean(request.signal?.aborted);
      const isTimeoutAbort =
        !isParentAbort &&
        (sheetController.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError'));
      return buildEmptyOutcome(
        isParentAbort
          ? 'aborted'
          : isTimeoutAbort
            ? 'angle_timeout'
            : 'network_or_runtime_error'
      );
    } finally {
      clearTimeout(sheetTimeoutId);
      request.signal?.removeEventListener('abort', onParentSheetAbort);
    }
  }

  const persistSingleSlice = async (
    targetAngle: TurnaroundAngleDeg,
    imageUrl: string,
    modelName: string
  ): Promise<void> => {
    const entryCacheKey = buildAiVtonCacheKey({
      avatarConfigHash: profile.avatarConfigHash,
      outfitComboId,
      styleMode,
      effectiveWeather,
      angleDeg: targetAngle,
    });
    markCacheKeyTransparentVerified(entryCacheKey);
    await persistAiVtonSlices([
      {
        cacheKey: entryCacheKey,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        styleMode,
        angleDeg: targetAngle,
        weatherMood,
        effectiveWeather,
        imageUrl,
        sheetImageUrl: null,
        outfitLabel,
        garmentLabels,
        slotGarmentIds,
        equippedCount: equippedGarments.length,
        model: modelName,
        updatedAt: Date.now(),
      },
    ]);
  };

  // Stage 1: Generate 0° Master Anchor first (unless already cached)
  let rawMasterAnchorUrl: string | null = null;
  let frontFromCache = Boolean(collectedSlices[0]);
  let syncedBagHandedness: 'right' | 'left' | null = null;
  if (!collectedSlices[0]) {
    const frontRes = await synthesizeSingleAngleOnServer(0, null);
    if (request.signal?.aborted || frontRes.reason === 'aborted') {
      return buildEmptyOutcome('aborted');
    }
    if (!frontRes.cutoutUrl || !frontRes.rawImageUrl) {
      return buildEmptyOutcome(frontRes.reason || 'gemini_synthesis_failed');
    }
    rawMasterAnchorUrl = frontRes.rawImageUrl;
    frontFromCache = frontRes.cached;
    syncedBagHandedness = frontRes.effectiveBagHandedness;
    collectedSlices[0] = frontRes.cutoutUrl;
    await persistSingleSlice(0, frontRes.cutoutUrl, frontRes.modelName);

    if (characterAnchorKey) {
      const anchorBackdropHex = selectOptimalStudioKeyHex(
        extractStudioKeyColorInputs(serializedSlots)
      );
      void saveCharacterIdentityAnchorFromZeroSlice({
        anchorKey: characterAnchorKey,
        zeroSliceDataUrl: frontRes.cutoutUrl,
        backdropHex: anchorBackdropHex,
      });
    }

    callbacks?.onAngleReady?.({
      angleDeg: 0,
      imageUrl: frontRes.cutoutUrl,
      isMasterAnchor: true,
      readyAngles: getReadyAnglesList(),
      elapsedMs: Date.now() - startedAt,
      allSlices: { ...collectedSlices },
      fromCache: frontRes.cached,
      serverLatencyMs: frontRes.latencyMs,
    });
  } else {
    rawMasterAnchorUrl = collectedSlices[0];
  }

  // Track raw generated images per angle so downstream sequential waves can condition on
  // both 0° Master Anchor and the closest already-verified side/back anchor (e.g. 180° -> 225°).
  const rawAnchorByAngle: Partial<Record<TurnaroundAngleDeg, string>> = {};
  if (rawMasterAnchorUrl) {
    rawAnchorByAngle[0] = rawMasterAnchorUrl;
  }
  for (const angle of TURNAROUND_ANGLES) {
    if (angle !== 0 && collectedSlices[angle]) {
      rawAnchorByAngle[angle] = collectedSlices[angle];
    }
  }

  // Measure 0° Master Anchor landmarks for Post-Normalization alignment across all non-0° waves
  const masterLandmarks = collectedSlices[0]
    ? await measureMasterAnchorLandmarksFromDataUrl(collectedSlices[0])
    : null;

  const fatalWaveReasons = new Set([
    'gemini_api_key_not_configured',
    'gemini_invalid_api_key',
    'gemini_leaked_key',
    'gemini_billing_required',
    'gemini_http_401',
    'gemini_http_403',
  ]);
  const transientFailedAngles: TurnaroundAngleDeg[] = [];
  let hitFatalCredentialError = false;

  const runAngleTarget = async (
    targetAngle: TurnaroundAngleDeg,
    recordFailureForRescue: boolean
  ): Promise<void> => {
    if (request.signal?.aborted || hitFatalCredentialError) return;
    const readyAngleSet = new Set<number>(getReadyAnglesList());
    const secondaryAngle = selectSecondaryAnchorAngle(targetAngle, readyAngleSet);
    const secondaryImageUrl =
      secondaryAngle !== null
        ? (rawAnchorByAngle[secondaryAngle] ?? collectedSlices[secondaryAngle] ?? null)
        : null;
    const secondaryAnchor =
      secondaryAngle !== null && secondaryImageUrl
        ? { angleDeg: secondaryAngle, imageDataUrl: secondaryImageUrl }
        : null;
    const res = await synthesizeSingleAngleOnServer(
      targetAngle,
      rawMasterAnchorUrl,
      masterLandmarks,
      secondaryAnchor,
      syncedBagHandedness
    );
    if (request.signal?.aborted) return;
    if (res.reason && fatalWaveReasons.has(res.reason)) {
      hitFatalCredentialError = true;
      return;
    }
    if (!res.cutoutUrl) {
      if (recordFailureForRescue) {
        transientFailedAngles.push(targetAngle);
      }
      return;
    }
    collectedSlices[targetAngle] = res.cutoutUrl;
    if (res.rawImageUrl) {
      rawAnchorByAngle[targetAngle] = res.rawImageUrl;
    }
    await persistSingleSlice(targetAngle, res.cutoutUrl, res.modelName);
    if (request.signal?.aborted) return;
    callbacks?.onAngleReady?.({
      angleDeg: targetAngle,
      imageUrl: res.cutoutUrl,
      isMasterAnchor: false,
      readyAngles: getReadyAnglesList(),
      elapsedMs: Date.now() - startedAt,
      allSlices: { ...collectedSlices },
      fromCache: res.cached,
      serverLatencyMs: res.latencyMs,
    });
  };

  // Stage 2 -> 3 -> 4: Front (0°) -> Right ([45°, 90°] -> 135°) -> Back (180°) -> Left ([315°, 270°, 225°])
  for (const wave of PROGRESSIVE_ANGLE_WAVES) {
    if (request.signal?.aborted || hitFatalCredentialError) break;
    const missingInWave = wave.filter((a) => !collectedSlices[a]);
    if (missingInWave.length === 0) continue;

    await Promise.all(missingInWave.map((targetAngle) => runAngleTarget(targetAngle, true)));
  }

  // Single bounded rescue pass for up to 3 transiently failed non-0° angles using newly available anchors
  if (
    !request.signal?.aborted &&
    !hitFatalCredentialError &&
    transientFailedAngles.length > 0
  ) {
    const rescueTargets = transientFailedAngles
      .filter((a) => !collectedSlices[a])
      .slice(0, 3);
    if (rescueTargets.length > 0) {
      await Promise.all(rescueTargets.map((targetAngle) => runAngleTarget(targetAngle, false)));
    }
  }

  if (request.signal?.aborted && !collectedSlices[0]) {
    return buildEmptyOutcome('aborted');
  }

  const finalZeroUrl = collectedSlices[0] || null;
  if (!finalZeroUrl) {
    return buildEmptyOutcome('gemini_synthesis_failed');
  }

  return {
    ok: true,
    fallbackToFlatLay: false,
    frontOnlyDegraded: getReadyAnglesList().length <= 1,
    reason: null,
    mode,
    provider: 'gemini-vton',
    styleMode,
    angleDeg: 0,
    weatherMood,
    effectiveWeather,
    avatarConfigHash: profile.avatarConfigHash,
    outfitComboId,
    cacheKey: zeroCacheKey,
    fromCache: frontFromCache,
    cacheLayer: frontFromCache ? 'server' : 'fresh',
    imageUrl: finalZeroUrl,
    angleSlices: { ...collectedSlices },
    equippedCount: equippedGarments.length,
    equippedSlotKeys,
    profile,
    handedness: profile.dominantHand,
    bagAssetMirrored,
    createdAt: Date.now(),
  };
}

/**
 * Fast (~5-8s) single-angle repair anchored to the verified 0° Front Master Anchor.
 * Replaces ONLY `targetAngle` in memory + IndexedDB cache without regenerating the other 7 angles.
 */
export async function repairSingleVtonAngle(
  request: AiVtonSynthesisRequest,
  targetAngle: TurnaroundAngleDeg,
  frontMasterDataUrl: string | null,
  correctionHint = ''
): Promise<{
  ok: boolean;
  angleDeg: TurnaroundAngleDeg;
  imageUrl: string | null;
  model: string | null;
  reason: string | null;
}> {
  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const serverProfileConfig = await fetchServerProfileConfig(
    normalizeHandedness(
      request.handedness ??
        request.dominantHand ??
        request.avatarSpec?.dominantHand ??
        request.profile?.dominantHand ??
        getCachedServerHandedness()
    )
  );
  const profile = normalizeGenderNeutralProfile({
    ...request,
    ...(serverProfileConfig.hasStoredRecord
      ? { handedness: serverProfileConfig.handedness }
      : {}),
  });
  const styleMode = normalizeVtonStyleMode(request.styleMode);
  const weatherMood = normalizeWeatherMoodKey(request.weather);
  const effectiveWeather = resolveEffectiveWeatherFromRaw(request.weather);
  const serializedWeatherPayload =
    request.weather && typeof request.weather === 'object'
      ? {
          ...request.weather,
          effectiveWeather: request.weather.effectiveWeather ?? effectiveWeather,
          mood: request.weather.mood ?? weatherMood,
        }
      : { effectiveWeather, mood: weatherMood };

  const { outfitComboId, equippedGarments } = computeOutfitComboId(
    request.slots,
    profile.dominantHand,
    { saggingFit: Boolean(request.saggingFit) }
  );
  if (equippedGarments.length === 0) {
    return { ok: false, angleDeg: targetAngle, imageUrl: null, model: null, reason: 'empty_outfit' };
  }

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

  const reqHeaders = buildVtonRequestAuthHeaders({
    'X-Profile-Key': serverProfileConfig.profileKey,
  });

  const [serializedSlots, encodedPortrait, encodedAnchor] = await Promise.all([
    buildMultimodalSlotsPayload(equippedGarments, profile.dominantHand),
    profile.portraitDataUrl
      ? encodeImageUrlToInlineDataUrl(profile.portraitDataUrl)
      : Promise.resolve(null),
    targetAngle !== 0 && frontMasterDataUrl
      ? encodeImageUrlToInlineDataUrl(frontMasterDataUrl)
      : Promise.resolve(null),
  ]);
  const effectivePortraitUrl = encodedPortrait || profile.portraitDataUrl || null;
  const effectiveProfile: NormalizedVtonProfile =
    effectivePortraitUrl !== profile.portraitDataUrl
      ? { ...profile, portraitDataUrl: effectivePortraitUrl }
      : profile;
  const masterAnchorPayload =
    targetAngle !== 0 ? encodedAnchor || frontMasterDataUrl || null : null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);
  const onParentAbort = () => controller.abort();
  request.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
      method: 'POST',
      headers: reqHeaders,
      signal: controller.signal,
      body: JSON.stringify({
        mode,
        styleMode,
        viewAngleDeg: targetAngle,
        turnaroundSheet: false,
        skipVisionQc: true,
        weather: serializedWeatherPayload,
        saggingFit: Boolean(request.saggingFit),
        ...(correctionHint.trim()
          ? { correctionHint: correctionHint.trim().slice(0, 360) }
          : {}),
        ...(masterAnchorPayload ? { masterAnchorDataUrl: masterAnchorPayload } : {}),
        profileKey: serverProfileConfig.profileKey,
        handedness: effectiveProfile.dominantHand,
        avatarSpec: effectiveProfile.avatarSpec,
        avatarConfigHash: effectiveProfile.avatarConfigHash,
        portraitDataUrl: effectivePortraitUrl,
        profile: {
          gender: effectiveProfile.gender,
          dominantHand: effectiveProfile.dominantHand,
          handedness: effectiveProfile.dominantHand,
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
          viewAngleDeg: targetAngle,
          turnaroundSheet: false,
        },
        slots: serializedSlots,
        forceRefresh: true,
      }),
    });

    if (request.signal?.aborted) {
      return { ok: false, angleDeg: targetAngle, imageUrl: null, model: null, reason: 'aborted' };
    }

    const rawComposite = sanitizeImageCandidate(
      json?.compositeImageUrl ?? json?.afterImageUrl ?? null
    );
    if (!rawComposite || json?.geminiUsed === false || json?.provider === 'flatlay-fallback') {
      return {
        ok: false,
        angleDeg: targetAngle,
        imageUrl: null,
        model: null,
        reason: json?.fallbackReason || 'gemini_synthesis_failed',
      };
    }

    const rawCut = await ensureTransparentCutout(await removeModelBackgroundToPng(rawComposite));
    if (request.signal?.aborted) {
      return { ok: false, angleDeg: targetAngle, imageUrl: null, model: null, reason: 'aborted' };
    }

    const alignMap: Partial<Record<TurnaroundAngleDeg, string>> = { [targetAngle]: rawCut };
    if (targetAngle !== 0 && frontMasterDataUrl) {
      alignMap[0] = frontMasterDataUrl;
    }
    await normalizeTurnaroundDataUrlsToFloorBaseline(alignMap);
    const finalUrl = alignMap[targetAngle] || rawCut;
    const modelName = String(json?.model || 'gemini-nano-banana-2.1');
    const entryCacheKey = buildAiVtonCacheKey({
      avatarConfigHash: profile.avatarConfigHash,
      outfitComboId,
      styleMode,
      effectiveWeather,
      angleDeg: targetAngle,
    });
    markCacheKeyTransparentVerified(entryCacheKey);
    await persistAiVtonSlices([
      {
        cacheKey: entryCacheKey,
        avatarConfigHash: profile.avatarConfigHash,
        outfitComboId,
        styleMode,
        angleDeg: targetAngle,
        weatherMood,
        effectiveWeather,
        imageUrl: finalUrl,
        sheetImageUrl: null,
        outfitLabel,
        garmentLabels,
        slotGarmentIds,
        equippedCount: equippedGarments.length,
        model: modelName,
        updatedAt: Date.now(),
      },
    ]);

    return {
      ok: true,
      angleDeg: targetAngle,
      imageUrl: finalUrl,
      model: modelName,
      reason: null,
    };
  } catch (err) {
    return {
      ok: false,
      angleDeg: targetAngle,
      imageUrl: null,
      model: null,
      reason: err instanceof Error ? err.message : 'repair_failed',
    };
  } finally {
    clearTimeout(timeoutId);
    request.signal?.removeEventListener('abort', onParentAbort);
  }
}


