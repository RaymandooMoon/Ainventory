import type {
  LightingCalibrationKey,
  SkinToneAnalysisResult,
} from './skinToneAnalyzer.ts';
import type { NormalizedFaceBox } from '../utils/faceAnalysisDiagnostics.ts';

const FACE_MEMORY_DB_NAME = 'ainventory_face_memory_db';
const FACE_MEMORY_DB_VERSION = 1;
const FACE_MEMORY_STORE_NAME = 'memories';
const FACE_MEMORY_ACTIVE_KEY = 'active_user_face_v1';
const FACE_MEMORY_META_KEY = 'ainventory_face_memory_meta_v1';

export interface MemorizedFaceIdentity {
  version: 1;
  memorizedAt: number;
  /** Compact original full photo (<=720px) so the user can re-open face correction even after page refresh */
  sourceImageDataUrl: string;
  /** Isolated single-face square portrait (512px) fed to AI VTON and profile avatar */
  singleFacePortraitDataUrl: string;
  lightingMode: LightingCalibrationKey;
  manualFaceBox: NormalizedFaceBox | null;
  selectedFaceIndex: number | null;
  analysisSnapshot: SkinToneAnalysisResult | null;
}

export interface MemorizedFaceMeta {
  memorizedAt: number;
  hasManualSelection: boolean;
  detectedFaceCount: number;
  skinToneHex?: string;
}

export const FACE_MEMORY_EVENT = 'ainventory:face-memory-changed';

function dispatchFaceMemoryEvent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(FACE_MEMORY_EVENT));
  } catch {
    // Ignore event errors in restricted environments
  }
}

function readFaceMemoryMetaSync(): MemorizedFaceMeta | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FACE_MEMORY_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MemorizedFaceMeta>;
    if (typeof parsed.memorizedAt !== 'number' || !Number.isFinite(parsed.memorizedAt)) {
      return null;
    }
    return {
      memorizedAt: parsed.memorizedAt,
      hasManualSelection: Boolean(parsed.hasManualSelection),
      detectedFaceCount: Number(parsed.detectedFaceCount) || 1,
      skinToneHex: typeof parsed.skinToneHex === 'string' ? parsed.skinToneHex : undefined,
    };
  } catch {
    return null;
  }
}

export function getMemorizedFaceMetaSync(): MemorizedFaceMeta | null {
  return readFaceMemoryMetaSync();
}

export function hasMemorizedFaceMetaSync(): boolean {
  return readFaceMemoryMetaSync() !== null;
}

function writeFaceMemoryMetaSync(meta: MemorizedFaceMeta | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!meta) {
      localStorage.removeItem(FACE_MEMORY_META_KEY);
    } else {
      localStorage.setItem(FACE_MEMORY_META_KEY, JSON.stringify(meta));
    }
  } catch {
    // Ignore localStorage quota errors
  }
}

function openFaceMemoryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(FACE_MEMORY_DB_NAME, FACE_MEMORY_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FACE_MEMORY_STORE_NAME)) {
          db.createObjectStore(FACE_MEMORY_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveMemorizedFaceIdentity(
  record: Omit<MemorizedFaceIdentity, 'version' | 'memorizedAt'> & { memorizedAt?: number }
): Promise<MemorizedFaceIdentity | null> {
  if (!record.singleFacePortraitDataUrl && !record.sourceImageDataUrl) {
    return null;
  }

  const normalized: MemorizedFaceIdentity = {
    version: 1,
    memorizedAt: record.memorizedAt ?? Date.now(),
    sourceImageDataUrl: record.sourceImageDataUrl || record.singleFacePortraitDataUrl,
    singleFacePortraitDataUrl: record.singleFacePortraitDataUrl || record.sourceImageDataUrl,
    lightingMode: record.lightingMode || 'auto_d65',
    manualFaceBox: record.manualFaceBox ?? null,
    selectedFaceIndex:
      typeof record.selectedFaceIndex === 'number' ? record.selectedFaceIndex : null,
    analysisSnapshot: record.analysisSnapshot ?? null,
  };

  const meta: MemorizedFaceMeta = {
    memorizedAt: normalized.memorizedAt,
    hasManualSelection: Boolean(normalized.manualFaceBox || normalized.selectedFaceIndex !== null),
    detectedFaceCount: normalized.analysisSnapshot?.detectedFaceCount ?? 1,
    skinToneHex: normalized.analysisSnapshot?.skinToneHex,
  };
  writeFaceMemoryMetaSync(meta);

  const db = await openFaceMemoryDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(FACE_MEMORY_STORE_NAME, 'readwrite');
        tx.objectStore(FACE_MEMORY_STORE_NAME).put(normalized, FACE_MEMORY_ACTIVE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  }

  dispatchFaceMemoryEvent();
  return normalized;
}

export async function loadMemorizedFaceIdentity(): Promise<MemorizedFaceIdentity | null> {
  const db = await openFaceMemoryDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FACE_MEMORY_STORE_NAME, 'readonly');
      const req = tx.objectStore(FACE_MEMORY_STORE_NAME).get(FACE_MEMORY_ACTIVE_KEY);
      req.onsuccess = () => {
        const result = req.result as Partial<MemorizedFaceIdentity> | undefined;
        db.close();
        if (
          !result ||
          typeof result.singleFacePortraitDataUrl !== 'string' ||
          !result.singleFacePortraitDataUrl.trim()
        ) {
          resolve(null);
          return;
        }
        resolve({
          version: 1,
          memorizedAt:
            typeof result.memorizedAt === 'number' ? result.memorizedAt : Date.now(),
          sourceImageDataUrl:
            typeof result.sourceImageDataUrl === 'string' && result.sourceImageDataUrl.trim()
              ? result.sourceImageDataUrl
              : result.singleFacePortraitDataUrl,
          singleFacePortraitDataUrl: result.singleFacePortraitDataUrl,
          lightingMode: result.lightingMode || 'auto_d65',
          manualFaceBox: result.manualFaceBox ?? null,
          selectedFaceIndex:
            typeof result.selectedFaceIndex === 'number' ? result.selectedFaceIndex : null,
          analysisSnapshot: result.analysisSnapshot ?? null,
        });
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function clearMemorizedFaceIdentity(): Promise<void> {
  writeFaceMemoryMetaSync(null);
  const db = await openFaceMemoryDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(FACE_MEMORY_STORE_NAME, 'readwrite');
        tx.objectStore(FACE_MEMORY_STORE_NAME).delete(FACE_MEMORY_ACTIVE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  }
  dispatchFaceMemoryEvent();
}
