import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { apiFetch } from '../utils/api.ts';
import {
  type EditorialModelSpec,
  synthesizeEditorial2DDataUrl,
} from './editorial2DArtist.ts';
import {
  type BodyShapeKey,
  getStoredBodySpec,
  normalizeBodyShape,
} from './parametricAvatar3D.ts';
import {
  type PersonalColorSeasonKey,
  SEASON_BEST_SWATCHES,
  findClosestSkinPreset,
  getStoredSkinProfile,
  normalizeSeasonKey,
} from './skinToneAnalyzer.ts';

export type CanonicalViewerMode = '2d-vton';

export type VtonProviderId = 'gemini-vton' | 'editorial-2d-studio';

export type VtonCacheLayer = 'memory' | 'indexeddb' | 'server' | 'fresh';

export interface NormalizedVtonProfile extends EditorialModelSpec {
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

export interface VtonSynthesisRequest extends GenderNeutralProfileInput {
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null;
  theme?: 'light' | 'dark';
  legacyMode?: unknown;
  mode?: unknown;
  forceRefresh?: boolean;
  signal?: AbortSignal;
  compact?: boolean;
}

export interface VtonSynthesisResult {
  mode: CanonicalViewerMode;
  beforeImageUrl: string;
  afterImageUrl: string;
  baseModelImageUrl: string;
  compositeImageUrl: string;
  comboHash: string;
  baseHash: string;
  equippedCount: number;
  equippedSlotKeys: string[];
  provider: VtonProviderId;
  fromCache: boolean;
  cacheLayer: VtonCacheLayer;
  theme: 'light' | 'dark';
  profile: NormalizedVtonProfile;
  createdAt: number;
}

interface VtonIdbRecord {
  cacheKey: string;
  comboHash: string;
  baseHash: string;
  theme: 'light' | 'dark';
  updatedAt: number;
  entry: VtonSynthesisResult;
}

interface VtonServerResponse {
  ok?: boolean;
  cached?: boolean;
  provider?: string;
  geminiUsed?: boolean;
  compositeImageUrl?: string | null;
  afterImageUrl?: string | null;
  baseModelImageUrl?: string | null;
  beforeImageUrl?: string | null;
}

const VTON_IDB_NAME = 'ainventory_vton_2d_cache_v1';
const VTON_IDB_VERSION = 1;
const VTON_IDB_STORE = 'vton_entries';
const L1_MAX_ENTRIES = 48;
const L2_MAX_ENTRIES = 60;
const BASE_MODEL_L1_MAX = 24;

const READONLY_PORTRAIT_STORAGE_KEYS = [
  'ainventory_user_portrait_v1',
  'ainventory_portrait_data_url',
  'ainventory_skin_profile_v1',
] as const;

const LEGACY_MODE_STORAGE_KEYS = [
  'ainventory_view_mode',
  'ainventory_render_mode',
] as const;

const l1MemoryCache = new Map<string, VtonSynthesisResult>();
const baseModelMemoryCache = new Map<string, string>();
const inFlightSyntheses = new Map<string, Promise<VtonSynthesisResult>>();
let vtonDbPromise: Promise<IDBDatabase | null> | null = null;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fingerprintLargeString(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length <= 120) return s;
  return `len:${s.length}:${s.slice(0, 48)}:${s.slice(-48)}`;
}

async function sha256HexWithFallback(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fall through to deterministic FNV-1a fallback on insecure origins
    }
  }

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (ch * 31), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (ch ^ (i << 1)), 0x27d4eb2f) >>> 0;
  }
  return [h1, h2, h3, h4]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
    .repeat(2);
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

/**
 * Reads user portrait / face reference read-only from runtime props and existing
 * localStorage keys without mutating any external storage key.
 */
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
            const nestedCandidates: unknown[] = [
              parsed.portraitDataUrl,
              parsed.previewDataUrl,
              parsed.photoUrl,
              parsed.faceImageUrl,
              parsed.avatarUrl,
              parsed.dataUrl,
              parsed.url,
            ];
            for (const nested of nestedCandidates) {
              const valid = sanitizeImageCandidate(nested);
              if (valid) return valid;
            }
          }
        } catch {
          // Ignore read/parse errors on read-only inspection
        }
      }
    }
  } catch {
    // Ignore sandboxed WebView localStorage getter SecurityError
  }

  return null;
}

function pickValidHex(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string') {
      const trimmed = c.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return trimmed.toUpperCase();
      }
    }
  }
  return '#DFBA9B';
}

function pickFiniteNumber(fallback: number, ...candidates: unknown[]): number {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c !== '') {
      const num = Number(c);
      if (Number.isFinite(num) && num > 0) {
        return num;
      }
    }
  }
  return fallback;
}

/**
 * Merges stored skin/body profiles with passed `skinProfile`, `bodySpec`, and `user`
 * while completely stripping `gender` so 2D VTON model synthesis is 100% gender-neutral.
 */
export function normalizeGenderNeutralProfile(
  input?: GenderNeutralProfileInput | null
): NormalizedVtonProfile {
  const storedSkin = getStoredSkinProfile();
  const storedBody = getStoredBodySpec();

  const skinToneHex = pickValidHex(
    input?.profile?.skinToneHex,
    input?.skinToneHex,
    input?.skinProfile?.skinToneHex,
    input?.user?.skinToneHex,
    storedSkin.skinToneHex,
    '#DFBA9B'
  );

  const rawSeason =
    input?.profile?.personalColor ??
    input?.personalColor ??
    input?.skinProfile?.personalColor ??
    input?.user?.personalColor ??
    storedSkin.personalColor;
  const personalColor: PersonalColorSeasonKey = normalizeSeasonKey(
    typeof rawSeason === 'string' ? rawSeason : storedSkin.personalColor
  );

  const matchedPreset = findClosestSkinPreset(skinToneHex, personalColor);
  const personalColorLabelKo = String(
    input?.profile?.personalColorLabelKo ||
      input?.skinProfile?.personalColorLabelKo ||
      input?.user?.personalColorLabelKo ||
      SEASON_BEST_SWATCHES[personalColor].labelKo
  );
  const subTypeLabelKo = String(
    input?.profile?.subTypeLabelKo ||
      input?.skinProfile?.subTypeLabelKo ||
      matchedPreset.subTypeLabelKo
  );

  const heightCm = clamp(
    Math.round(
      pickFiniteNumber(
        storedBody.heightCm || 172,
        input?.profile?.heightCm,
        input?.heightCm,
        input?.bodySpec?.heightCm,
        input?.user?.heightCm
      )
    ),
    145,
    200
  );

  const weightKg = clamp(
    Math.round(
      pickFiniteNumber(
        storedBody.weightKg || 64,
        input?.profile?.weightKg,
        input?.weightKg,
        input?.bodySpec?.weightKg,
        input?.user?.weightKg
      )
    ),
    38,
    130
  );

  const rawBodyShape =
    input?.profile?.bodyShape ??
    input?.bodyShape ??
    input?.bodySpec?.bodyShape ??
    input?.user?.bodyShape ??
    storedBody.bodyShape;
  const bodyShape: BodyShapeKey = normalizeBodyShape(
    typeof rawBodyShape === 'string' ? rawBodyShape : storedBody.bodyShape
  );

  const shoulderScale = clamp(
    Number(
      pickFiniteNumber(
        storedBody.shoulderScale || 1,
        input?.profile?.shoulderScale,
        input?.shoulderScale,
        input?.bodySpec?.shoulderScale
      ).toFixed(2)
    ),
    0.85,
    1.2
  );

  const waistScale = clamp(
    Number(
      pickFiniteNumber(
        storedBody.waistScale || 1,
        input?.profile?.waistScale,
        input?.waistScale,
        input?.bodySpec?.waistScale
      ).toFixed(2)
    ),
    0.82,
    1.25
  );

  const hipScale = clamp(
    Number(
      pickFiniteNumber(
        storedBody.hipScale || 1,
        input?.profile?.hipScale,
        input?.hipScale,
        input?.bodySpec?.hipScale
      ).toFixed(2)
    ),
    0.85,
    1.22
  );

  const portraitDataUrl = resolveReadOnlyUserPortrait({
    personReferenceUrl: input?.personReferenceUrl,
    portraitDataUrl: input?.portraitDataUrl ?? input?.profile?.portraitDataUrl,
    skinProfile: input?.skinProfile,
    user: input?.user,
  });

  return {
    skinToneHex,
    personalColor,
    personalColorLabelKo,
    subTypeLabelKo,
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
function serializeEquippedSlots(slots?: Record<string, any> | null): {
  serializedSlots: Record<string, Partial<GarmentRecord>>;
  equippedSlotKeys: string[];
  equippedCount: number;
} {
  const serializedSlots: Record<string, Partial<GarmentRecord>> = {};
  if (!slots || typeof slots !== 'object') {
    return { serializedSlots, equippedSlotKeys: [], equippedCount: 0 };
  }

  const sortedKeys = Object.keys(slots).sort();
  for (const key of sortedKeys) {
    const raw = slots[key];
    if (!raw || typeof raw !== 'object') continue;
    serializedSlots[key] = {
      id: Number(raw.id) || 0,
      name: String(raw.name || ''),
      category: String(raw.category || key),
      subcategory: String(raw.subcategory || ''),
      fabric: raw.fabric ? String(raw.fabric) : undefined,
      color_name: String(raw.color_name || ''),
      color_hex: String(raw.color_hex || ''),
      formality: raw.formality ? String(raw.formality) : undefined,
      brand: raw.brand ? String(raw.brand) : undefined,
      slot_key: raw.slot_key ? String(raw.slot_key) : undefined,
      image_url: String(raw.image_url || ''),
    };
  }

  const equippedSlotKeys = Object.keys(serializedSlots);
  return {
    serializedSlots,
    equippedSlotKeys,
    equippedCount: equippedSlotKeys.length,
  };
}

export async function computeVtonHashes(
  profile: Partial<EditorialModelSpec> | NormalizedVtonProfile,
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null
): Promise<{ baseHash: string; comboHash: string }> {
  const canonicalProfile = {
    skinToneHex: pickValidHex(profile?.skinToneHex, '#DFBA9B'),
    personalColor: normalizeSeasonKey(profile?.personalColor),
    heightCm: clamp(Math.round(Number(profile?.heightCm) || 172), 145, 200),
    weightKg: clamp(Math.round(Number(profile?.weightKg) || 64), 38, 130),
    bodyShape: normalizeBodyShape(profile?.bodyShape),
    shoulderScale: clamp(Number((Number(profile?.shoulderScale) || 1).toFixed(2)), 0.85, 1.2),
    waistScale: clamp(Number((Number(profile?.waistScale) || 1).toFixed(2)), 0.82, 1.25),
    hipScale: clamp(Number((Number(profile?.hipScale) || 1).toFixed(2)), 0.85, 1.22),
    portraitFp: fingerprintLargeString(profile?.portraitDataUrl),
  };

  const { serializedSlots, equippedSlotKeys } = serializeEquippedSlots(slots);
  const canonicalSlotTuple = equippedSlotKeys.map((slotKey) => {
    const item = serializedSlots[slotKey];
    return {
      slot: slotKey,
      id: item.id || 0,
      cat: item.category || '',
      sub: item.subcategory || '',
      hex: String(item.color_hex || '').toUpperCase(),
      cname: item.color_name || '',
      name: item.name || '',
      imgFp: fingerprintLargeString(item.image_url),
    };
  });

  const baseHash = await sha256HexWithFallback(
    `vton2d-base-v1:${JSON.stringify(canonicalProfile)}`
  );
  const comboPayload =
    canonicalSlotTuple.length === 0
      ? `vton2d-combo-v1:${baseHash}:basewear`
      : `vton2d-combo-v1:${baseHash}:${JSON.stringify(canonicalSlotTuple)}`;
  const comboHash = await sha256HexWithFallback(comboPayload);

  return { baseHash, comboHash };
}

function makeCacheKey(comboHash: string, theme: 'light' | 'dark'): string {
  return `${comboHash}:${theme}`;
}

function putL1Cache(cacheKey: string, entry: VtonSynthesisResult): void {
  if (l1MemoryCache.has(cacheKey)) {
    l1MemoryCache.delete(cacheKey);
  }
  l1MemoryCache.set(cacheKey, entry);
  while (l1MemoryCache.size > L1_MAX_ENTRIES) {
    const oldestKey = l1MemoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    l1MemoryCache.delete(oldestKey);
  }
}

function getL1Cache(cacheKey: string): VtonSynthesisResult | null {
  const found = l1MemoryCache.get(cacheKey);
  if (!found) return null;
  // Refresh LRU recency
  l1MemoryCache.delete(cacheKey);
  l1MemoryCache.set(cacheKey, found);
  return found;
}

function putBaseModelMemory(baseKey: string, dataUrl: string): void {
  if (!dataUrl) return;
  if (baseModelMemoryCache.has(baseKey)) {
    baseModelMemoryCache.delete(baseKey);
  }
  baseModelMemoryCache.set(baseKey, dataUrl);
  while (baseModelMemoryCache.size > BASE_MODEL_L1_MAX) {
    const oldest = baseModelMemoryCache.keys().next().value;
    if (oldest === undefined) break;
    baseModelMemoryCache.delete(oldest);
  }
}

export function peekVtonMemoryCache(comboHash: string): VtonSynthesisResult | null {
  if (!comboHash) return null;
  if (comboHash.includes(':')) {
    const exact = getL1Cache(comboHash);
    return exact ? { ...exact, fromCache: true, cacheLayer: 'memory' } : null;
  }

  let activeTheme: 'light' | 'dark' = 'light';
  if (typeof document !== 'undefined') {
    const docTheme = document.documentElement?.getAttribute('data-theme');
    if (docTheme === 'dark') activeTheme = 'dark';
  }

  const primary = getL1Cache(makeCacheKey(comboHash, activeTheme));
  if (primary) {
    return { ...primary, fromCache: true, cacheLayer: 'memory' };
  }

  const secondaryTheme = activeTheme === 'dark' ? 'light' : 'dark';
  const secondary = getL1Cache(makeCacheKey(comboHash, secondaryTheme));
  if (secondary) {
    return { ...secondary, fromCache: true, cacheLayer: 'memory' };
  }

  return null;
}

function openVtonIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (vtonDbPromise) return vtonDbPromise;

  vtonDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(VTON_IDB_NAME, VTON_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VTON_IDB_STORE)) {
          db.createObjectStore(VTON_IDB_STORE, { keyPath: 'cacheKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        vtonDbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        vtonDbPromise = null;
        resolve(null);
      };
    } catch {
      vtonDbPromise = null;
      resolve(null);
    }
  });

  return vtonDbPromise;
}

async function readL2IdbCache(cacheKey: string): Promise<VtonSynthesisResult | null> {
  const db = await openVtonIdb();
  if (!db) return null;

  return new Promise<VtonSynthesisResult | null>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readonly');
      const store = tx.objectStore(VTON_IDB_STORE);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const record = req.result as VtonIdbRecord | undefined;
        if (record?.entry?.afterImageUrl && record?.entry?.beforeImageUrl) {
          resolve(record.entry);
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

async function writeL2IdbCache(cacheKey: string, entry: VtonSynthesisResult): Promise<void> {
  const db = await openVtonIdb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VTON_IDB_STORE);
      const record: VtonIdbRecord = {
        cacheKey,
        comboHash: entry.comboHash,
        baseHash: entry.baseHash,
        theme: entry.theme,
        updatedAt: Date.now(),
        entry,
      };
      store.put(record);

      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = (getAllReq.result as VtonIdbRecord[] | undefined) || [];
        if (all.length > L2_MAX_ENTRIES) {
          all.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
          const excess = all.length - L2_MAX_ENTRIES;
          for (let i = 0; i < excess; i += 1) {
            if (all[i]?.cacheKey) {
              store.delete(all[i].cacheKey);
            }
          }
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

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('VTON synthesis aborted', 'AbortError');
  }
  const err = new Error('VTON synthesis aborted');
  err.name = 'AbortError';
  return err;
}

function raceWithAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

async function ensureBaseModelImageUrl(
  profile: NormalizedVtonProfile,
  baseHash: string,
  theme: 'light' | 'dark',
  compact?: boolean
): Promise<string> {
  const baseKey = `${baseHash}:${theme}:${compact ? 'c' : 'f'}`;
  const memHit = baseModelMemoryCache.get(baseKey);
  if (memHit) {
    putBaseModelMemory(baseKey, memHit);
    return memHit;
  }

  const generated = await synthesizeEditorial2DDataUrl({
    profile,
    slots: {},
    theme,
    compact,
  });
  putBaseModelMemory(baseKey, generated);
  return generated;
}

export async function synthesize2DVirtualTryOn(
  request: VtonSynthesisRequest = {}
): Promise<VtonSynthesisResult> {
  if (request.signal?.aborted) {
    throw createAbortError();
  }

  const mode = normalizeViewerMode(request.legacyMode ?? request.mode);
  const theme: 'light' | 'dark' = request.theme === 'dark' ? 'dark' : 'light';
  const forceRefresh = Boolean(request.forceRefresh);
  const profile = normalizeGenderNeutralProfile(request);
  const { serializedSlots, equippedSlotKeys, equippedCount } = serializeEquippedSlots(
    request.slots
  );
  const { baseHash, comboHash } = await computeVtonHashes(profile, serializedSlots);
  const cacheKey = makeCacheKey(comboHash, theme);

  // 1. Check L1 Memory LRU Cache (48 entries)
  if (!forceRefresh) {
    const l1Hit = getL1Cache(cacheKey);
    if (l1Hit) {
      return {
        ...l1Hit,
        mode,
        fromCache: true,
        cacheLayer: 'memory',
      };
    }
  }

  // 2. Check L2 IndexedDB Cache ('ainventory_vton_2d_cache_v1', store 'vton_entries', 60 entries)
  if (!forceRefresh) {
    const l2Hit = await raceWithAbortSignal(readL2IdbCache(cacheKey), request.signal);
    if (l2Hit) {
      putL1Cache(cacheKey, l2Hit);
      putBaseModelMemory(`${baseHash}:${theme}:${request.compact ? 'c' : 'f'}`, l2Hit.beforeImageUrl);
      return {
        ...l2Hit,
        mode,
        fromCache: true,
        cacheLayer: 'indexeddb',
      };
    }
  }

  // 3. Deduplicate concurrent syntheses per comboHash + theme
  const dedupeKey = `${cacheKey}:${request.compact ? 'compact' : 'full'}`;
  if (!forceRefresh && inFlightSyntheses.has(dedupeKey)) {
    return raceWithAbortSignal(inFlightSyntheses.get(dedupeKey)!, request.signal);
  }

  const synthesisTask = (async (): Promise<VtonSynthesisResult> => {
    // Base model with empty slots = {}, keyed by baseHash
    let beforeImageUrl = await ensureBaseModelImageUrl(
      profile,
      baseHash,
      theme,
      request.compact
    );

    // Empty wardrobe state: afterImageUrl === beforeImageUrl without network roundtrip
    if (equippedCount === 0) {
      const baseResult: VtonSynthesisResult = {
        mode,
        beforeImageUrl,
        afterImageUrl: beforeImageUrl,
        baseModelImageUrl: beforeImageUrl,
        compositeImageUrl: beforeImageUrl,
        comboHash,
        baseHash,
        equippedCount: 0,
        equippedSlotKeys: [],
        provider: 'editorial-2d-studio',
        fromCache: false,
        cacheLayer: 'fresh',
        theme,
        profile,
        createdAt: Date.now(),
      };
      putL1Cache(cacheKey, baseResult);
      await writeL2IdbCache(cacheKey, baseResult);
      return baseResult;
    }

    let serverResponse: VtonServerResponse | null = null;
    try {
      serverResponse = await apiFetch<VtonServerResponse>('/vton/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          comboHash,
          baseHash,
          mode: '2d-vton',
          stylePreset: 'editorial_fashion_illustration',
          theme,
          profile,
          slots: serializedSlots,
          includeBaseModel: true,
        }),
      });
    } catch {
      serverResponse = null;
    }

    const serverBaseUrl = sanitizeImageCandidate(
      serverResponse?.baseModelImageUrl ?? serverResponse?.beforeImageUrl
    );
    if (serverBaseUrl) {
      beforeImageUrl = serverBaseUrl;
      putBaseModelMemory(`${baseHash}:${theme}:${request.compact ? 'c' : 'f'}`, serverBaseUrl);
    }

    const serverCompositeUrl = sanitizeImageCandidate(
      serverResponse?.compositeImageUrl ?? serverResponse?.afterImageUrl
    );

    let afterImageUrl: string;
    let provider: VtonProviderId;
    let cacheLayer: VtonCacheLayer;

    if (serverCompositeUrl) {
      afterImageUrl = serverCompositeUrl;
      provider = 'gemini-vton';
      cacheLayer = serverResponse?.cached ? 'server' : 'fresh';
    } else {
      afterImageUrl = await synthesizeEditorial2DDataUrl({
        profile,
        slots: serializedSlots,
        theme,
        compact: request.compact,
      });
      provider = 'editorial-2d-studio';
      cacheLayer = 'fresh';
    }

    const finalResult: VtonSynthesisResult = {
      mode,
      beforeImageUrl,
      afterImageUrl,
      baseModelImageUrl: beforeImageUrl,
      compositeImageUrl: afterImageUrl,
      comboHash,
      baseHash,
      equippedCount,
      equippedSlotKeys,
      provider,
      fromCache: Boolean(serverResponse?.cached && serverCompositeUrl),
      cacheLayer,
      theme,
      profile,
      createdAt: Date.now(),
    };

    putL1Cache(cacheKey, finalResult);
    await writeL2IdbCache(cacheKey, finalResult);
    return finalResult;
  })();

  inFlightSyntheses.set(dedupeKey, synthesisTask);
  try {
    return await raceWithAbortSignal(synthesisTask, request.signal);
  } finally {
    if (inFlightSyntheses.get(dedupeKey) === synthesisTask) {
      inFlightSyntheses.delete(dedupeKey);
    }
  }
}

export async function clearVtonLocalCache(): Promise<void> {
  l1MemoryCache.clear();
  baseModelMemoryCache.clear();

  const db = await openVtonIdb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VTON_IDB_STORE, 'readwrite');
      tx.objectStore(VTON_IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
