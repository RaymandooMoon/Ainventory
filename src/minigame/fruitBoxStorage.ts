import type { FruitBoxMode } from './fruitBoxEngine.ts';

export interface FruitBoxRecords {
  readonly classicBest: number;
  readonly classicBestClearMs: number | null;
  readonly feverBest: number;
  readonly bestCombo: number;
  readonly totalApplesPopped: number;
  readonly gamesPlayed: number;
}

export interface FruitBoxPreferences {
  readonly mode: FruitBoxMode;
  readonly sfxEnabled: boolean;
  readonly bgmEnabled: boolean;
  readonly softColors: boolean;
  readonly highFx: boolean;
}

const RECORDS_STORAGE_KEY = 'ainvtry_minigame_fruitbox_records_v1';
const PREFS_STORAGE_KEY = 'ainvtry_minigame_fruitbox_prefs_v1';

export const DEFAULT_FRUITBOX_RECORDS: FruitBoxRecords = {
  classicBest: 0,
  classicBestClearMs: null,
  feverBest: 0,
  bestCombo: 0,
  totalApplesPopped: 0,
  gamesPlayed: 0,
};

export const DEFAULT_FRUITBOX_PREFS: FruitBoxPreferences = {
  mode: 'classic',
  sfxEnabled: true,
  bgmEnabled: true,
  softColors: false,
  highFx: true,
};

function safeReadJson(key: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function safeWriteJson(key: string, payload: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore private mode / storage quota failures
  }
}

function toSafeNonNegInt(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

export function readFruitBoxRecords(): FruitBoxRecords {
  const parsed = safeReadJson(RECORDS_STORAGE_KEY);
  if (!parsed) return DEFAULT_FRUITBOX_RECORDS;
  const rawClear = parsed.classicBestClearMs;
  const classicBestClearMs =
    typeof rawClear === 'number' && Number.isFinite(rawClear) && rawClear > 0
      ? Math.floor(rawClear)
      : null;

  return {
    classicBest: toSafeNonNegInt(parsed.classicBest, 0),
    classicBestClearMs,
    feverBest: toSafeNonNegInt(parsed.feverBest, 0),
    bestCombo: toSafeNonNegInt(parsed.bestCombo, 0),
    totalApplesPopped: toSafeNonNegInt(parsed.totalApplesPopped, 0),
    gamesPlayed: toSafeNonNegInt(parsed.gamesPlayed, 0),
  };
}

export function saveGameResultToRecords(params: {
  readonly mode: FruitBoxMode;
  readonly score: number;
  readonly clearedCount: number;
  readonly maxCombo: number;
  readonly clearTimeMs: number | null;
}): { readonly records: FruitBoxRecords; readonly isNewBest: boolean } {
  const prev = readFruitBoxRecords();
  const prevBest = params.mode === 'classic' ? prev.classicBest : prev.feverBest;
  const isNewBest = params.score > prevBest && params.score > 0;

  const nextClassicClearMs =
    params.mode === 'classic' && params.clearTimeMs !== null
      ? prev.classicBestClearMs === null
        ? params.clearTimeMs
        : Math.min(prev.classicBestClearMs, params.clearTimeMs)
      : prev.classicBestClearMs;

  const next: FruitBoxRecords = {
    classicBest:
      params.mode === 'classic' ? Math.max(prev.classicBest, params.score) : prev.classicBest,
    classicBestClearMs: nextClassicClearMs,
    feverBest:
      params.mode === 'fever' ? Math.max(prev.feverBest, params.score) : prev.feverBest,
    bestCombo: Math.max(prev.bestCombo, params.maxCombo),
    totalApplesPopped: prev.totalApplesPopped + Math.max(0, params.clearedCount),
    gamesPlayed: prev.gamesPlayed + 1,
  };

  safeWriteJson(RECORDS_STORAGE_KEY, next);
  return { records: next, isNewBest };
}

export function readFruitBoxPreferences(): FruitBoxPreferences {
  const parsed = safeReadJson(PREFS_STORAGE_KEY);
  if (!parsed) return DEFAULT_FRUITBOX_PREFS;
  return {
    mode: parsed.mode === 'fever' ? 'fever' : 'classic',
    sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : true,
    bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : true,
    softColors: typeof parsed.softColors === 'boolean' ? parsed.softColors : false,
    highFx: typeof parsed.highFx === 'boolean' ? parsed.highFx : true,
  };
}

export function writeFruitBoxPreferences(prefs: FruitBoxPreferences): void {
  safeWriteJson(PREFS_STORAGE_KEY, prefs);
}
