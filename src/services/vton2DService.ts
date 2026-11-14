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
  outfitLabel?: string;
  garmentLabels?: string[];
  equippedCount?: number;
  model: string;
  updatedAt: number;
}

export interface AiVtonHistoryEntry {
  groupKey: string;
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
  outfitLabel: string;
  garmentLabels: string[];
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
const L1_MAX_ENTRIES = 128;
const L2_MAX_ENTRIES = 240;
const PACKSHOT_CACHE_MAX = 160;

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

export async function listCachedAiVtonOutfits(limit = 20): Promise<AiVtonHistoryEntry[]> {
  const allRecords: CachedAiVtonSlice[] = [];
  const seenKeys = new Set<string>();

  for (const memSlice of l1SliceCache.values()) {
    if (memSlice?.cacheKey && memSlice.imageUrl?.startsWith('data:image/')) {
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
      if (rec?.cacheKey && !seenKeys.has(rec.cacheKey) && rec.imageUrl?.startsWith('data:image/')) {
        seenKeys.add(rec.cacheKey);
        allRecords.push(rec);
        setL1Slice(rec);
      }
    }
  }

  const grouped = new Map<string, AiVtonHistoryEntry>();
  for (const rec of allRecords) {
    const groupKey = `${rec.avatarConfigHash}::${rec.outfitComboId}::${rec.styleMode}`;
    let group = grouped.get(groupKey);
    if (!group) {
      const labels = Array.isArray(rec.garmentLabels) ? rec.garmentLabels.filter(Boolean) : [];
      group = {
        groupKey,
        avatarConfigHash: rec.avatarConfigHash,
        outfitComboId: rec.outfitComboId,
        styleMode: rec.styleMode,
        outfitLabel:
          rec.outfitLabel ||
          (labels.length > 0 ? labels.slice(0, 2).join(' · ') : '저장된 AI 피팅'),
        garmentLabels: labels,
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
    }
    group.thumbnailUrl =
      group.angleSlices[45] || group.angleSlices[0] || group.thumbnailUrl || rec.imageUrl;
  }

  return [...grouped.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, limit));
}

export async function deleteCachedAiVtonOutfit(params: {
  avatarConfigHash: string;
  outfitComboId: string;
  styleMode: VtonStyleMode;
}): Promise<void> {
  const keysToDelete = TURNAROUND_ANGLES.map((angleDeg) =>
    buildAiVtonCacheKey({
      avatarConfigHash: params.avatarConfigHash,
      outfitComboId: params.outfitComboId,
      styleMode: params.styleMode,
      angleDeg,
    })
  );

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
 * (separated by studio background `#F5F5F7`) and cleanly crops & centers the single primary figure.
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

  // Estimate studio cyclorama background RGB from 4 corners
  const rSamples: number[] = [];
  const gSamples: number[] = [];
  const bSamples: number[] = [];
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
        rSamples.push(data[idx]);
        gSamples.push(data[idx + 1]);
        bSamples.push(data[idx + 2]);
      }
    }
  }
  rSamples.sort((a, b) => a - b);
  gSamples.sort((a, b) => a - b);
  bSamples.sort((a, b) => a - b);
  const midIdx = Math.floor(rSamples.length / 2);
  const bgR = rSamples[midIdx] ?? 245;
  const bgG = gSamples[midIdx] ?? 245;
  const bgB = bSamples[midIdx] ?? 247;

  const yStart = Math.floor(ch * 0.08);
  const yEnd = Math.max(yStart + 1, Math.floor(ch * 0.92));
  const bandH = yEnd - yStart;
  const rawColFg = new Float32Array(cw);

  for (let x = 0; x < cw; x += 1) {
    let fgCount = 0;
    for (let y = yStart; y < yEnd; y += 2) {
      const idx = (y * cw + x) * 4;
      const diff =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (diff > 36) fgCount += 1;
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

  cleanCtx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
  cleanCtx.fillRect(0, 0, outW, ch);
  const dx = Math.round((outW - subW) * 0.5);
  cleanCtx.drawImage(srcCanvas, sx, 0, subW, ch, dx, 0, subW, ch);
  return cleanCanvas;
}

/**
 * Crops an AI-generated 2x2 Turnaround Studio Sheet (or 1x4 wide strip) into 4 individual angle images:
 * - Top-Left     -> `0°` (Front)
 * - Top-Right    -> `45°` (Quarter)
 * - Bottom-Left  -> `90°` (Side Profile)
 * - Bottom-Right -> `180°` (Back)
 * Also runs `isolateSingleSubjectInSlice` to eliminate duplicate/twin models if an LLM generated two figures side-by-side.
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

        const useCompactJpeg = w > 256 && h > 256;
        const isHorizontal1x4Strip = w / h >= 2.15;

        let quadrants: Array<{
          angle: TurnaroundAngleDeg;
          sx: number;
          sy: number;
          cw: number;
          ch: number;
        }>;

        if (isHorizontal1x4Strip) {
          const colW = Math.floor(w / 4);
          const trimX = Math.max(1, Math.round(colW * 0.015));
          const trimY = Math.max(1, Math.round(h * 0.012));
          const cw = Math.max(16, colW - trimX * 2);
          const ch = Math.max(16, h - trimY * 2);
          quadrants = [
            { angle: 0, sx: trimX, sy: trimY, cw, ch },
            { angle: 45, sx: colW + trimX, sy: trimY, cw, ch },
            { angle: 90, sx: colW * 2 + trimX, sy: trimY, cw, ch },
            { angle: 180, sx: colW * 3 + trimX, sy: trimY, cw, ch },
          ];
        } else {
          const halfW = Math.floor(w / 2);
          const halfH = Math.floor(h / 2);
          const trimX = Math.max(1, Math.round(halfW * 0.012));
          const trimY = Math.max(1, Math.round(halfH * 0.012));
          const cw = Math.max(16, halfW - trimX * 2);
          const ch = Math.max(16, halfH - trimY * 2);
          quadrants = [
            { angle: 0, sx: trimX, sy: trimY, cw, ch },
            { angle: 45, sx: halfW + trimX, sy: trimY, cw, ch },
            { angle: 90, sx: trimX, sy: halfH + trimY, cw, ch },
            { angle: 180, sx: halfW + trimX, sy: halfH + trimY, cw, ch },
          ];
        }

        const out = {} as Record<TurnaroundAngleDeg, string>;
        for (const q of quadrants) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = q.cw;
          cropCanvas.height = q.ch;
          const ctx = cropCanvas.getContext('2d');
          if (!ctx) {
            out[q.angle] = sheetDataUrl;
            continue;
          }
          if (useCompactJpeg) {
            ctx.fillStyle = '#F5F5F7';
            ctx.fillRect(0, 0, q.cw, q.ch);
          }
          ctx.drawImage(img, q.sx, q.sy, q.cw, q.ch, 0, 0, q.cw, q.ch);
          const finalCanvas = isolateSingleSubjectInSlice(cropCanvas);
          out[q.angle] = useCompactJpeg
            ? finalCanvas.toDataURL('image/jpeg', 0.9)
            : finalCanvas.toDataURL('image/png');
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
  angleDeg: TurnaroundAngleDeg
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
          ? '/seed/vton-showcase-stylized.jpg'
          : '/seed/vton-showcase-photoreal.jpg';
      const sheetUrl = withPublicBaseUrl(assetPath);
      const sliced = await sliceTurnaround2x2Sheet(sheetUrl);
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
  angleDeg: TurnaroundAngleDeg;
  turnaroundSheet: boolean;
  serializedSlots: Record<string, Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const { profile, styleMode, weatherMood, angleDeg, turnaroundSheet, serializedSlots } = params;
  const spec = profile.avatarSpec;
  const anthro = spec.anthropometrics;
  const app = spec.appearance;
  const isStylized = styleMode === 'stylized_isometric';

  const header = isStylized
    ? 'Stylized Isometric Simulation Character VTON lookbook (dimensional character, natural hair/hands, authentic fabric texture, zero flat vector polygons).'
    : 'Photorealistic SSENSE/COS Studio VTON lookbook photograph (85mm lens, realistic skin, natural hair/hands, accurate garment drape).';

  const cameraLine = turnaroundSheet
    ? 'SQUARE 1:1 Borderless 2x2 Turnaround Sheet (4 equal quadrants on solid #F5F5F7, zero lines/text) of the EXACT SAME person & outfit: TL=0° Front, TR=45° Quarter, BL=90° Side Profile, BR=180° Back. STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary human figure centered inside each quadrant (total 4 figures in the entire sheet — NEVER draw two models side-by-side or twin clones inside any quadrant).'
    : `Full-body studio portrait at ${angleDeg}° on solid #F5F5F7 background, soft floor shadow, zero text. STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary human figure centered in frame (NEVER draw duplicate/twin models).`;

  const hasUmbrella = Boolean(serializedSlots.acc_umbrella || serializedSlots.umbrella);
  const weatherSceneLine =
    weatherMood === 'rainy' || hasUmbrella
      ? `Rainy-day editorial mood: cool overcast 6200K lighting with delicate atmospheric rain droplets${hasUmbrella ? ', with the model naturally holding the equipped umbrella' : ''}.`
      : `Studio weather lighting mood: ${weatherMood}.`;

  const bmi = Number((profile.weightKg / (profile.heightCm / 100) ** 2).toFixed(1));
  const bodyLock = `Model: ${profile.heightCm}cm/${profile.weightKg}kg (BMI ${bmi}, faithful body/face/limb volume), frame=${spec.framePreset}, archetype=${spec.archetypePreset}, chest=${anthro.chestForm}, skin=${profile.skinToneHex} (MST-${app.mstLevel}-${app.mstUndertone}), hair=${app.hairStyle} (${app.hairColorHex}), beard=${app.facialHair}. ${weatherSceneLine}`;

  const parts: Array<Record<string, unknown>> = [
    { text: `${header}\n${cameraLine}\n${bodyLock}` },
  ];

  const portraitPart = parseDataUrlInlinePart(profile.portraitDataUrl);
  if (portraitPart) {
    parts.push({
      text: `[CRITICAL USER FACE IDENTITY LOCK — PRIMARY LIKENESS PHOTO BELOW]: The model's face MUST look unmistakably like this exact person in the attached photo! Reproduce their exact facial bone structure, eye shape, eyelid fold, eyebrows, nose bridge/tip, lips, cheek contour, jawline, and hairstyle/hairline across 0° Front, 45° Quarter, and 90° Side Profile (and matching rear hair silhouette on 180° Back) in ${isStylized ? 'stylized character' : 'photorealistic'} style with skin tone ${profile.skinToneHex}. NEVER substitute a generic stock model face:`,
    });
    parts.push({ inlineData: portraitPart });
  }

  const slotPlacementPrompts: Record<string, string> = {
    accessory: 'carried naturally on shoulder or in hand as main bag/tote/briefcase',
    acc_umbrella:
      'held naturally by the model (open overhead canopy on rainy days or poised stylishly by handle)',
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
    text: 'Wear ALL equipped garments, body-part accessories, and jewelry above simultaneously on their exact specified left/right body parts on #F5F5F7. Strictly ONE solitary person per panel. Return image only.',
  });

  return parts;
}

async function synthesizeDirectBrowserGeminiVton(params: {
  apiKey: string;
  profile: NormalizedVtonProfile;
  styleMode: VtonStyleMode;
  weatherMood: WeatherMoodKey;
  angleDeg: TurnaroundAngleDeg;
  useTurnaroundSheet: boolean;
  serializedSlots: Record<string, Record<string, unknown>>;
}): Promise<VtonServerResponse> {
  const {
    apiKey,
    profile,
    styleMode,
    weatherMood,
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
              ? { imageConfig: { aspectRatio: turnaroundSheet ? '1:1' : '3:4' } }
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
                  layout: turnaroundSheet ? 'turnaround_2x2' : 'single',
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
 * 100% Gemini Multimodal Multi-Angle Virtual Try-On Dispatcher.
 * - Zero procedural drawing or mathematical 2D mesh warping under ANY circumstance.
 * - Checks L1 Memory + L2 IndexedDB (`avatarConfigHash + outfitComboId + styleMode + angleDeg`) first for 0ms hits.
 * - Requests a 2x2 Turnaround Studio Sheet (`0°`, `45°`, `90°`, `180°`) from `/api/vton/synthesize`
 *   (or directly via browser Gemini REST API when running standalone or when backend proxy is unavailable),
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
      await Promise.all(
        TURNAROUND_ANGLES.map(async (candidateAngle) => {
          if (candidateAngle === angleDeg) return;
          const other = await readCachedAiVtonSlice({
            avatarConfigHash: profile.avatarConfigHash,
            outfitComboId,
            styleMode,
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
              weather: request.weather ?? { mood: weatherMood },
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
      const outfitLabel =
        garmentLabels.length > 2
          ? `${garmentLabels.slice(0, 2).join(' · ')} 외 ${garmentLabels.length - 2}`
          : garmentLabels.join(' · ') || '저장된 AI 피팅';
      const angleSlices: Partial<Record<TurnaroundAngleDeg, string>> = {};
      const entriesToPersist: CachedAiVtonSlice[] = [];
      const isTurnaroundResponse = json.layout
        ? json.layout === 'turnaround_2x2'
        : useTurnaroundSheet;

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
              sheetImageUrl: null,
              outfitLabel,
              garmentLabels,
              equippedCount: equippedGarments.length,
              model: modelName,
              updatedAt: now,
            });
          }
        }
      } else if (rawComposite && isTurnaroundResponse) {
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
            sheetImageUrl: null,
            outfitLabel,
            garmentLabels,
            equippedCount: equippedGarments.length,
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
          outfitLabel,
          garmentLabels,
          equippedCount: equippedGarments.length,
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
