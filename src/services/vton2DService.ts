import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { getStudioSeedImageForGarment, resolveStudioSeedUrl } from '../shared/garmentTaxonomy.js';
import { apiFetch } from '../utils/api.ts';
import {
  type AvatarSpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
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

export type CanonicalViewerMode = '2d-vton';

export type ViewerStageMode = 'flatlay' | 'ai-vton';

export type VtonStyleMode = 'photorealistic' | 'stylized_isometric';

export type TurnaroundAngleDeg = 0 | 45 | 90 | 180;

export const TURNAROUND_ANGLES: readonly TurnaroundAngleDeg[] = [0, 45, 90, 180] as const;

export const DEFAULT_TURNAROUND_ANGLE: TurnaroundAngleDeg = 45;

export type VtonProviderId = 'flatlay-lookbook' | 'gemini-vton';

export type VtonCacheLayer = 'memory' | 'indexeddb' | 'server' | 'fresh' | 'flatlay';

export type WeatherMoodKey =
  | 'clear'
  | 'windy'
  | 'rainy'
  | 'mild'
  | 'cold'
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
  imageUrl: string;
  sheetImageUrl?: string | null;
  model: string;
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
  layout?: 'turnaround_2x2' | 'single' | string;
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
const L1_MAX_ENTRIES = 96;
const L2_MAX_ENTRIES = 120;

const ORDERED_OUTFIT_SLOTS = [
  'headwear',
  'neckwear',
  'outer',
  'top',
  'onepiece',
  'dress',
  'bottom',
  'shoes',
  'accessory',
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

/**
 * Normalizes any numeric degree onto the 4 canonical turnaround angles:
 * `0°` (Front), `45°` (Quarter), `90°` (Side Profile), `180°` (Back).
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
  const wrapped = (((n % 360) + 360) % 360);
  if (wrapped <= 22 || wrapped >= 338) return 0;
  if (wrapped >= 135 && wrapped <= 225) return 180;
  if ((wrapped >= 68 && wrapped < 135) || (wrapped > 225 && wrapped <= 292)) return 90;
  return 45;
}

// oxlint-disable-next-line typescript/no-explicit-any
export function normalizeWeatherMoodKey(rawWeather?: any): WeatherMoodKey {
  if (!rawWeather) return 'studio_neutral';
  if (typeof rawWeather === 'string') {
    const s = rawWeather.toLowerCase();
    if (s.includes('rain') || s.includes('비')) return 'rainy';
    if (s.includes('wind') || s.includes('강풍')) return 'windy';
    if (s.includes('cold') || s.includes('한파')) return 'cold';
    if (s.includes('warm') || s.includes('mild') || s.includes('포근')) return 'mild';
    if (s.includes('clear') || s.includes('sun') || s.includes('맑음')) return 'clear';
    return 'studio_neutral';
  }
  if (typeof rawWeather === 'object') {
    if (rawWeather.isRainy || rawWeather.isRaining) return 'rainy';
    if (rawWeather.isWindy) return 'windy';
    const cond = String(
      rawWeather.scenarioKey || rawWeather.condition || rawWeather.mood || ''
    ).toLowerCase();
    if (cond.includes('rain') || cond.includes('비')) return 'rainy';
    if (cond.includes('wind') || cond.includes('강풍')) return 'windy';
    const maxT = Number(rawWeather.tempMax ?? rawWeather.temperatureMax ?? rawWeather.temp);
    if (cond.includes('cold') || cond.includes('한파') || (Number.isFinite(maxT) && maxT <= 4)) {
      return 'cold';
    }
    if (
      cond.includes('warm') ||
      cond.includes('mild') ||
      cond.includes('포근') ||
      (Number.isFinite(maxT) && maxT >= 18 && maxT <= 25)
    ) {
      return 'mild';
    }
    if (cond.includes('clear') || cond.includes('sun') || cond.includes('맑음')) {
      return 'clear';
    }
  }
  return 'studio_neutral';
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
    140,
    205
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
 * Deterministic IndexedDB cache key per architectural specification:
 * `(avatarConfigHash + 착장조합ID + 화풍 + 각도)`
 */
export function buildAiVtonCacheKey(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  angleDeg: TurnaroundAngleDeg;
}): string {
  return `vton3::${params.avatarConfigHash}::${params.outfitComboId}::${params.styleMode}::${params.angleDeg}`;
}

export function trackFlatLayComboVisit(comboKey: string): boolean {
  if (!comboKey) return false;
  const wasSeen = seenFlatLayCombos.has(comboKey);
  seenFlatLayCombos.add(comboKey);
  return wasSeen;
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
  angleDeg: TurnaroundAngleDeg;
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
  angleDeg: TurnaroundAngleDeg;
}): Promise<{ slice: CachedAiVtonSlice; layer: 'memory' | 'indexeddb' } | null> {
  const mem = peekMemoryAiVtonSlice(params);
  if (mem) {
    return { slice: mem, layer: 'memory' };
  }

  const db = await openVtonIndexedDb();
  if (!db) return null;

  const cacheKey = buildAiVtonCacheKey(params);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readonly');
      const req = tx.objectStore(VTON_IDB_STORE).get(cacheKey);
      req.onsuccess = () => {
        const rec = req.result as CachedAiVtonSlice | undefined;
        if (rec && typeof rec.imageUrl === 'string' && rec.imageUrl.startsWith('data:image/')) {
          setL1Slice(rec);
          resolve({ slice: rec, layer: 'indexeddb' });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
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

/**
 * Crops an AI-generated 2x2 Turnaround Studio Sheet into 4 individual angle images:
 * - Top-Left     -> `0°` (Front)
 * - Top-Right    -> `45°` (Quarter)
 * - Bottom-Left  -> `90°` (Side Profile)
 * - Bottom-Right -> `180°` (Back)
 * Pure raster image crop of the AI photograph — ZERO procedural drawing!
 */
export async function sliceTurnaround2x2Sheet(
  sheetDataUrl: string
): Promise<Record<TurnaroundAngleDeg, string>> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      0: sheetDataUrl,
      45: sheetDataUrl,
      90: sheetDataUrl,
      180: sheetDataUrl,
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 32 || h < 32) {
          resolve({ 0: sheetDataUrl, 45: sheetDataUrl, 90: sheetDataUrl, 180: sheetDataUrl });
          return;
        }

        const halfW = Math.floor(w / 2);
        const halfH = Math.floor(h / 2);
        // Trim 1.2% inner margin so quadrant seams never bleed across slices
        const trimX = Math.max(1, Math.round(halfW * 0.012));
        const trimY = Math.max(1, Math.round(halfH * 0.012));
        const cropW = Math.max(16, halfW - trimX * 2);
        const cropH = Math.max(16, halfH - trimY * 2);

        const quadrants: Array<{ angle: TurnaroundAngleDeg; sx: number; sy: number }> = [
          { angle: 0, sx: trimX, sy: trimY },
          { angle: 45, sx: halfW + trimX, sy: trimY },
          { angle: 90, sx: trimX, sy: halfH + trimY },
          { angle: 180, sx: halfW + trimX, sy: halfH + trimY },
        ];

        const out = {} as Record<TurnaroundAngleDeg, string>;
        for (const q of quadrants) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const ctx = cropCanvas.getContext('2d');
          if (!ctx) {
            out[q.angle] = sheetDataUrl;
            continue;
          }
          ctx.drawImage(img, q.sx, q.sy, cropW, cropH, 0, 0, cropW, cropH);
          out[q.angle] = cropCanvas.toDataURL('image/png');
        }
        resolve(out);
      } catch {
        resolve({ 0: sheetDataUrl, 45: sheetDataUrl, 90: sheetDataUrl, 180: sheetDataUrl });
      }
    };
    img.onerror = () => {
      resolve({ 0: sheetDataUrl, 45: sheetDataUrl, 90: sheetDataUrl, 180: sheetDataUrl });
    };
    img.src = sheetDataUrl;
  });
}

async function encodeImageUrlToInlineDataUrl(srcUrl: string): Promise<string | null> {
  if (!srcUrl) return null;
  if (srcUrl.startsWith('data:image/')) return srcUrl;
  if (typeof fetch === 'undefined' || typeof FileReader === 'undefined') return null;

  try {
    const res = await fetch(srcUrl, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0 || blob.size > 4.5 * 1024 * 1024) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : null;
        resolve(result && result.startsWith('data:image/') ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
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
      // Always attach Base64 inlineData (`packshotDataUrl`) when readable from same-origin/blob
      // so both backend Gemini & custom endpoints receive every real cutout photograph!
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

/**
 * 100% Gemini Multimodal Multi-Angle Virtual Try-On Dispatcher.
 * - Zero procedural drawing or mathematical 2D mesh warping under ANY circumstance.
 * - Checks L1 Memory + L2 IndexedDB (`avatarConfigHash + outfitComboId + styleMode + angleDeg`) first for 0ms hits.
 * - Requests a 2x2 Turnaround Studio Sheet (`0°`, `45°`, `90°`, `180°`) from `/api/vton/synthesize`,
 *   slices all 4 angles, and caches all 4 slices permanently in IndexedDB.
 * - On missing API key or synthesis failure, returns `fallbackToFlatLay: true` (`imageUrl: null`)
 *   so the viewer preserves the Editorial Flat-Lay Board and displays a clean toast.
 */
export async function synthesizeGeminiMultiAngleVton(
  request: AiVtonSynthesisRequest
): Promise<AiVtonSynthesisOutcome> {
  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const styleMode = normalizeVtonStyleMode(request.styleMode);
  const angleDeg = normalizeTurnaroundAngleDeg(request.viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const weatherMood = normalizeWeatherMoodKey(request.weather);
  const profile = normalizeGenderNeutralProfile(request);
  const { outfitComboId, equippedSlotKeys, equippedGarments } = computeOutfitComboId(
    request.slots
  );

  const cacheKey = buildAiVtonCacheKey({
    avatarConfigHash: profile.avatarConfigHash,
    outfitComboId,
    styleMode,
    angleDeg,
  });

  if (!request.forceRefresh) {
    const cachedHit = await readCachedAiVtonSlice({
      avatarConfigHash: profile.avatarConfigHash,
      outfitComboId,
      styleMode,
      angleDeg,
    });
    if (cachedHit) {
      const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {
        [angleDeg]: cachedHit.slice.imageUrl,
      };
      for (const candidateAngle of TURNAROUND_ANGLES) {
        const other = peekMemoryAiVtonSlice({
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          styleMode,
          angleDeg: candidateAngle,
        });
        if (other) {
          angleSlices[candidateAngle] = other.imageUrl;
        }
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
  const flightKey = `${profile.avatarConfigHash}::${outfitComboId}::${styleMode}::${weatherMood}::${useTurnaroundSheet ? 'sheet' : angleDeg}`;

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

  const runPromise = (async (): Promise<AiVtonSynthesisOutcome> => {
    try {
      const serializedSlots = await buildMultimodalSlotsPayload(equippedGarments);
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

      const json = await apiFetch<VtonServerResponse>('/vton/synthesize', {
        method: 'POST',
        signal: request.signal,
        headers: {
          'X-Demo-Mode': 'sample',
        },
        body: JSON.stringify({
          mode,
          styleMode,
          viewAngleDeg: angleDeg,
          turnaroundSheet: useTurnaroundSheet,
          weather: request.weather ?? { mood: weatherMood },
          avatarSpec: profile.avatarSpec,
          avatarConfigHash: profile.avatarConfigHash,
          profile: {
            skinToneHex: profile.skinToneHex,
            personalColor: profile.personalColor,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            bodyShape: profile.bodyShape,
            shoulderScale: profile.shoulderScale,
            waistScale: profile.waistScale,
            hipScale: profile.hipScale,
            portraitDataUrl: profile.portraitDataUrl,
            avatarSpec: profile.avatarSpec,
            avatarConfigHash: profile.avatarConfigHash,
            styleMode,
            viewAngleDeg: angleDeg,
            turnaroundSheet: useTurnaroundSheet,
          },
          slots: serializedSlots,
          forceRefresh: Boolean(request.forceRefresh),
        }),
      });

      const rawComposite = sanitizeImageCandidate(
        json?.compositeImageUrl ?? json?.afterImageUrl ?? null
      );

      if (!rawComposite && !json?.panelImages) {
        return {
          ok: false,
          fallbackToFlatLay: true,
          reason: json.fallbackReason || 'gemini_api_key_not_configured',
          mode,
          provider: 'flatlay-lookbook',
          styleMode,
          angleDeg,
          weatherMood,
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
      const modelName = String(json.model || 'gemini-2.5-flash-image');
      const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {};
      const entriesToPersist: CachedAiVtonSlice[] = [];

      if (json.panelImages && typeof json.panelImages === 'object') {
        for (const a of TURNAROUND_ANGLES) {
          const candidate = sanitizeImageCandidate(json.panelImages[String(a)]);
          if (candidate) {
            angleSlices[a] = candidate;
            entriesToPersist.push({
              cacheKey: buildAiVtonCacheKey({
                avatarConfigHash: profile.avatarConfigHash,
                outfitComboId,
                styleMode,
                angleDeg: a,
              }),
              avatarConfigHash: profile.avatarConfigHash,
              outfitComboId,
              styleMode,
              angleDeg: a,
              weatherMood,
              imageUrl: candidate,
              sheetImageUrl: rawComposite,
              model: modelName,
              updatedAt: now,
            });
          }
        }
      } else if (rawComposite && (json.layout === 'turnaround_2x2' || useTurnaroundSheet)) {
        const sliced = await sliceTurnaround2x2Sheet(rawComposite);
        for (const a of TURNAROUND_ANGLES) {
          const sliceUrl = sliced[a] || rawComposite;
          angleSlices[a] = sliceUrl;
          entriesToPersist.push({
            cacheKey: buildAiVtonCacheKey({
              avatarConfigHash: profile.avatarConfigHash,
              outfitComboId,
              styleMode,
              angleDeg: a,
            }),
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
            angleDeg: a,
            weatherMood,
            imageUrl: sliceUrl,
            sheetImageUrl: rawComposite,
            model: modelName,
            updatedAt: now,
          });
        }
      } else if (rawComposite) {
        angleSlices[angleDeg] = rawComposite;
        entriesToPersist.push({
          cacheKey,
          avatarConfigHash: profile.avatarConfigHash,
          outfitComboId,
          styleMode,
          angleDeg,
          weatherMood,
          imageUrl: rawComposite,
          sheetImageUrl: null,
          model: modelName,
          updatedAt: now,
        });
      }

      await persistAiVtonSlices(entriesToPersist);

      const finalImg = angleSlices[angleDeg] || rawComposite || null;
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
      return {
        ok: false,
        fallbackToFlatLay: true,
        reason: isAbort ? 'aborted' : 'network_or_runtime_error',
        mode,
        provider: 'flatlay-lookbook',
        styleMode,
        angleDeg,
        weatherMood,
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
