import type { GarmentRecord } from '../contracts/carbonDesignContract.ts';
import { COLOR_PALETTE } from '../shared/colorMath.js';
import {
  CATEGORIES,
  CITY_COORDS,
  SEASONS,
  SUBCATEGORIES_BY_CAT,
  getPersonalColorLabels,
} from '../shared/garmentTaxonomy.js';
import {
  applyOptimisticLocalMutation,
  clearUserSessionOfflineCache,
  flushOfflineQueue,
  getQueuedMutationCount,
  readCachedResponse,
  setOfflineUserScope,
  writeCachedResponse,
} from './offlineSync.ts';
import { handleStandaloneApiFallback } from './standaloneFallback.ts';

const TOKEN_KEY = 'ainventory_auth_token';
const SAMPLE_DEMO_KEY = 'ainventory_sample_demo_mode';
const SAMPLE_DEMO_MUTATED_KEY = 'ainventory_sample_demo_mutated';
const API_BASE_URL = String(import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status?: number;
  data?: Record<string, unknown>;
  isBackendUnavailable?: boolean;

  constructor(
    message: string,
    options?: {
      status?: number;
      data?: Record<string, unknown>;
      isBackendUnavailable?: boolean;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    if (options?.status !== undefined) this.status = options.status;
    if (options?.data !== undefined) this.data = options.data;
    if (options?.isBackendUnavailable !== undefined) {
      this.isBackendUnavailable = options.isBackendUnavailable;
    }
  }
}

export function getStoredToken(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

// Initialize offline cache user scope from persisted session token on module load
const initialBootstrapToken = getStoredToken();
if (initialBootstrapToken) {
  setOfflineUserScope(initialBootstrapToken.slice(0, 24));
}

export function setStoredToken(token: string | null | undefined): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(SAMPLE_DEMO_KEY);
      setOfflineUserScope(token.slice(0, 24));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setOfflineUserScope(null);
      void clearUserSessionOfflineCache();
    }
  } catch {
    // ignore storage write error
  }
}

export function isSampleDemoMode(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SAMPLE_DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSampleDemoMode(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (enabled) {
      localStorage.setItem(SAMPLE_DEMO_KEY, '1');
    } else {
      localStorage.removeItem(SAMPLE_DEMO_KEY);
      localStorage.removeItem(SAMPLE_DEMO_MUTATED_KEY);
    }
  } catch {
    // ignore storage write error
  }
}

function isSampleDemoMutated(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SAMPLE_DEMO_MUTATED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSampleDemoMutated(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAMPLE_DEMO_MUTATED_KEY, '1');
  } catch {
    // ignore storage write error
  }
}

async function rawNetworkFetch(
  path: string,
  options: ApiRequestOptions = {}
): Promise<Record<string, unknown>> {
  const token = getStoredToken();
  const sampleDemo = isSampleDemoMode();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  if (sampleDemo) {
    headers['X-Demo-Mode'] = 'sample';
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
  });
  const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  // Static hosts / SPA routers / Capacitor WebViews return text/html or non-JSON 404/405 when no API server is running
  if (!isJson) {
    throw new ApiError(`API 서버 미연결 (${res.status})`, {
      status: res.status,
      isBackendUnavailable: true,
    });
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errorMessage =
      typeof data.error === 'string' && data.error ? data.error : `요청 실패 (${res.status})`;
    throw new ApiError(errorMessage, {
      status: res.status,
      data,
      isBackendUnavailable: res.status === 502 || res.status === 503 || res.status === 504,
    });
  }
  return data;
}

let explicitlyOffline = false;

export function isEffectivelyOffline(): boolean {
  if (explicitlyOffline) return true;
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return false;
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname || '';
    // Loopback servers (127.0.0.1 / localhost) remain reachable in isolated VMs even when navigator.onLine starts false
    if (host === '127.0.0.1' || host === 'localhost') return false;
  }
  return true;
}

export function flushPendingOfflineSync(): Promise<number> {
  return flushOfflineQueue((p, opts) => rawNetworkFetch(p, opts), {
    isOfflineFn: isEffectivelyOffline,
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    explicitlyOffline = true;
  });
  window.addEventListener('online', () => {
    explicitlyOffline = false;
    if (!isSampleDemoMode() && getStoredToken()) {
      flushPendingOfflineSync().catch(() => {});
    }
  });
}

function isNetworkOrBackendUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const candidate = err as { status?: number; isBackendUnavailable?: boolean };
  return !candidate.status || Boolean(candidate.isBackendUnavailable);
}

/**
 * Offline-First + Sample Demo + Standalone Fallback API Client
 * - Mirrors GET responses into IndexedDB (`ainventory_offline_v1`) with user-scope isolation
 * - Preserves local IndexedDB mutations in default sample/local closet mode across GET refreshes
 * - Flushes pending offline mutations BEFORE refreshing online GET caches to prevent clobbering
 * - Falls back to `handleStandaloneApiFallback` on Capacitor APK / static hosts without Express backend
 */
// oxlint-disable-next-line typescript/no-explicit-any
export async function apiFetch<T = Record<string, any>>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const sampleDemo = isSampleDemoMode();
  const isAuthEndpoint = path.startsWith('/auth/');
  const isStatelessCompute =
    path === '/garments/analyze' ||
    path === '/shopping/analyze' ||
    path === '/shopping-check' ||
    path === '/vton/synthesize';

  // In Sample / Default Local Closet Mode, state mutations persist in local IndexedDB
  if (sampleDemo && method !== 'GET' && !isAuthEndpoint && !isStatelessCompute) {
    if (path.startsWith('/garments')) {
      const existingDemo = await readCachedResponse<Record<string, unknown>>(
        'demo:/garments?closet=sample'
      );
      if (!existingDemo) {
        try {
          const seed = await rawNetworkFetch('/garments?closet=sample');
          await writeCachedResponse('demo:/garments?closet=sample', seed);
        } catch {
          const localSeed = await handleStandaloneApiFallback('/garments?closet=sample', {});
          await writeCachedResponse('demo:/garments?closet=sample', localSeed);
        }
      }
    } else if (path.startsWith('/outfits')) {
      const existingOutfits = await readCachedResponse<Record<string, unknown>>(
        'demo:/outfits?closet=sample'
      );
      if (!existingOutfits) {
        try {
          const seed = await rawNetworkFetch('/outfits?closet=sample');
          await writeCachedResponse('demo:/outfits?closet=sample', seed);
        } catch {
          const localSeed = await handleStandaloneApiFallback('/outfits?closet=sample', {});
          await writeCachedResponse('demo:/outfits?closet=sample', localSeed);
        }
      }
    }
    markSampleDemoMutated();
    return (await applyOptimisticLocalMutation(path, method, options.body, false)) as unknown as T;
  }

  const isBrowserOffline = isEffectivelyOffline();

  if (method === 'GET') {
    const cacheKey = sampleDemo ? `demo:${path}` : path;
    if (sampleDemo && isSampleDemoMutated()) {
      const mutatedCached = await readCachedResponse<Record<string, unknown>>(cacheKey);
      if (mutatedCached) {
        return mutatedCached as unknown as T;
      }
    }
    if (isBrowserOffline) {
      const cached = await readCachedResponse<Record<string, unknown>>(cacheKey);
      if (cached) return { ...cached, _fromOfflineCache: true } as unknown as T;
      const localData = await handleStandaloneApiFallback(path, options);
      await writeCachedResponse(cacheKey, localData).catch(() => {});
      return { ...localData, _fromOfflineCache: true } as unknown as T;
    }
    try {
      // Flush any queued offline mutations BEFORE fetching & overwriting GET cache
      if (!sampleDemo && getStoredToken()) {
        const queuedCount = await getQueuedMutationCount();
        if (queuedCount > 0) {
          await flushPendingOfflineSync().catch(() => 0);
        }
      }
      const data = await rawNetworkFetch(path, options);
      writeCachedResponse(cacheKey, data).catch(() => {});
      return data as unknown as T;
    } catch (err) {
      // Network failure or missing backend fallback (never swallow genuine HTTP 401/4xx JSON API errors)
      if (isNetworkOrBackendUnavailable(err)) {
        const cached = await readCachedResponse<Record<string, unknown>>(cacheKey);
        if (cached) return { ...cached, _fromOfflineCache: true } as unknown as T;
        const localData = await handleStandaloneApiFallback(path, options);
        await writeCachedResponse(cacheKey, localData).catch(() => {});
        return { ...localData, _fromOfflineCache: true } as unknown as T;
      }
      throw err;
    }
  }

  // Stateless compute endpoints (/garments/analyze, /shopping/analyze, /shopping-check)
  // never enqueue into mutation_queue; fall back to local vision/similarity compute when offline
  if (isStatelessCompute) {
    if (isBrowserOffline) {
      return (await handleStandaloneApiFallback(path, options)) as unknown as T;
    }
    try {
      return (await rawNetworkFetch(path, options)) as unknown as T;
    } catch (err) {
      if (isNetworkOrBackendUnavailable(err)) {
        return (await handleStandaloneApiFallback(path, options)) as unknown as T;
      }
      throw err;
    }
  }

  // Write / Auth operations (POST / PATCH / DELETE)
  if (!isAuthEndpoint && isBrowserOffline) {
    return (await applyOptimisticLocalMutation(path, method, options.body, true)) as unknown as T;
  }

  try {
    const data = await rawNetworkFetch(path, options);
    return data as unknown as T;
  } catch (err) {
    if (isNetworkOrBackendUnavailable(err)) {
      if (isAuthEndpoint || path === '/garments/import-samples') {
        const res = await handleStandaloneApiFallback(path, options);
        if (path === '/garments/import-samples' && Array.isArray(res.garments)) {
          const first = res.garments[0] as GarmentRecord | undefined;
          const targetCloset = first?.closet_owner || 'sample';
          await writeCachedResponse(`/garments?closet=${encodeURIComponent(targetCloset)}`, {
            garments: res.garments,
          }).catch(() => {});
        }
        return res as unknown as T;
      }
      return (await applyOptimisticLocalMutation(path, method, options.body, true)) as unknown as T;
    }
    throw err;
  }
}

export { CATEGORIES, SUBCATEGORIES_BY_CAT, COLOR_PALETTE, SEASONS, CITY_COORDS };

export function formatKRW(num: number | string | null | undefined): string {
  const n = Number(num) || 0;
  return `₩${n.toLocaleString('ko-KR')}`;
}

export type ItemTierCode = 'ICONIC' | 'LEGENDARY' | 'EPIC' | 'RARE' | 'COMMON';

export interface ItemTierSummary {
  tier: ItemTierCode;
  labelKo: string;
  color: string;
  score: number;
}

export function computeItemTier(
  item: Partial<GarmentRecord> | null | undefined,
  personalColor = ''
): ItemTierSummary {
  if (!item) {
    return { tier: 'COMMON', labelKo: '일반', color: '#86868B', score: 50 };
  }
  const wears = Number(item.wear_count) || 0;
  const price = Number(item.price) || 0;
  const cpw = wears > 0 ? price / wears : price;
  const isFav = Boolean(item.is_favorite);

  let score = 52;
  if (isFav) score += 22;
  if (wears >= 18) score += 24;
  else if (wears >= 10) score += 16;
  else if (wears >= 5) score += 9;

  if (price > 0 && cpw <= 9000) score += 14;
  else if (price > 0 && cpw <= 16000) score += 8;

  if (item.water_resistant) score += 5;

  if (personalColor) {
    const notes = String(item.notes || '');
    const pcLabels = getPersonalColorLabels(personalColor);
    if (
      notes.includes(personalColor) ||
      (pcLabels.ko && notes.includes(pcLabels.ko)) ||
      (pcLabels.en && notes.toLowerCase().includes(pcLabels.en.toLowerCase()))
    ) {
      score += 8;
    }
  }

  if (score >= 90 || (isFav && wears >= 16)) {
    return { tier: 'ICONIC', labelKo: '아이코닉', color: '#1D1D1F', score };
  }
  if (score >= 78) {
    return { tier: 'LEGENDARY', labelKo: '프리미엄', color: '#3A3A3C', score };
  }
  if (score >= 66) {
    return { tier: 'EPIC', labelKo: '핵심', color: '#48484A', score };
  }
  if (score >= 56) {
    return { tier: 'RARE', labelKo: '자주 착용', color: '#636366', score };
  }
  return { tier: 'COMMON', labelKo: '기본', color: '#8E8E93', score };
}
