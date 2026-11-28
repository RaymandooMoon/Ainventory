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
import { resolveApiRuntimeConfig } from './apiRuntimeConfig.ts';

async function runStandaloneFallback(
  path: string,
  options: ApiRequestOptions = {}
): Promise<Record<string, unknown>> {
  const mod = await import('./standaloneFallback.ts');
  return mod.handleStandaloneApiFallback(path, options);
}

const TOKEN_KEY = 'ainventory_auth_token';
const SAMPLE_DEMO_KEY = 'ainventory_sample_demo_mode';
const SAMPLE_DEMO_MUTATED_KEY = 'ainventory_sample_demo_mutated';
const API_RUNTIME_CONFIG = resolveApiRuntimeConfig(import.meta.env);
const API_BASE_URL = API_RUNTIME_CONFIG.apiBaseUrl;

let inMemoryEmbedToken = '';
let inMemoryEmbedSampleDemo = false;

interface SampleGarmentsPrefetchCache {
  garments: GarmentRecord[];
  fetchedAt: number;
}

const SAMPLE_PREFETCH_TTL_MS = 90_000;
let sampleGarmentsPrefetchCache: SampleGarmentsPrefetchCache | null = null;
let sampleGarmentsPrefetchInFlight: Promise<GarmentRecord[]> | null = null;

const REQUIRED_CYBER_DEMO_IMAGE_URLS = [
  '/seed/cyber-black-moto-jacket.webp',
  '/seed/cyber-black-belted-pleated-skirt.webp',
  '/seed/cyber-black-pleated-skirt.webp',
  '/seed/cyber-black-sheer-stockings.webp',
  '/seed/cyber-black-overknee-stockings.webp',
  '/seed/cyber-black-combat-boots.webp',
  '/seed/cyber-black-platform-walker-boots.webp',
  '/seed/cyber-silver-chain-choker.webp',
] as const;

function hasAllCyberDemoShowcaseGarments(garments: readonly unknown[]): boolean {
  const urls = new Set(
    garments.map((g) => String((g as { image_url?: unknown })?.image_url || '').trim())
  );
  return REQUIRED_CYBER_DEMO_IMAGE_URLS.every((url) => urls.has(url));
}

async function mergeMissingCyberDemoGarments(
  garments: GarmentRecord[]
): Promise<GarmentRecord[]> {
  if (hasAllCyberDemoShowcaseGarments(garments)) {
    return garments;
  }
  try {
    const mod = await import('./standaloneFallback.ts');
    const existingUrls = new Set(garments.map((g) => String(g?.image_url || '').trim()));
    const existingNames = new Set(garments.map((g) => String(g?.name || '').trim()));
    const missing = mod.CYBER_DEMO_SHOWCASE_GARMENTS.filter(
      (item) => !existingUrls.has(item.image_url) && !existingNames.has(item.name)
    );
    return missing.length > 0 ? [...missing, ...garments] : garments;
  } catch {
    return garments;
  }
}

export function getPrefetchedSampleGarments(): GarmentRecord[] | null {
  if (!sampleGarmentsPrefetchCache) return null;
  if (Date.now() - sampleGarmentsPrefetchCache.fetchedAt > SAMPLE_PREFETCH_TTL_MS) {
    sampleGarmentsPrefetchCache = null;
    return null;
  }
  return sampleGarmentsPrefetchCache.garments;
}

export async function loadInstantSampleGarmentsFallback(): Promise<GarmentRecord[]> {
  const cached = getPrefetchedSampleGarments();
  if (cached && cached.length > 0 && hasAllCyberDemoShowcaseGarments(cached)) return cached;
  try {
    const local = await runStandaloneFallback('/garments?closet=sample', {});
    const list = Array.isArray(local?.garments) ? (local.garments as GarmentRecord[]) : [];
    if (list.length > 0) {
      sampleGarmentsPrefetchCache = { garments: list, fetchedAt: Date.now() };
    }
    return list;
  } catch {
    return [];
  }
}

export function prefetchSampleGarments(): Promise<GarmentRecord[]> {
  const cached = getPrefetchedSampleGarments();
  if (cached && cached.length > 0 && hasAllCyberDemoShowcaseGarments(cached)) {
    return Promise.resolve(cached);
  }
  if (sampleGarmentsPrefetchInFlight) {
    return sampleGarmentsPrefetchInFlight;
  }

  const job = (async (): Promise<GarmentRecord[]> => {
    try {
      if (isEffectivelyOffline() || STATIC_STANDALONE_BUILD) {
        return await loadInstantSampleGarmentsFallback();
      }
      const data = await rawNetworkFetch('/garments?closet=sample', {
        headers: { 'X-Demo-Mode': 'sample' },
        timeoutMs: 4500,
      });
      const rawList = Array.isArray(data?.garments) ? (data.garments as GarmentRecord[]) : [];
      if (rawList.length > 0) {
        const list = await mergeMissingCyberDemoGarments(rawList);
        const mergedPayload = list === rawList ? data : { ...data, garments: list };
        sampleGarmentsPrefetchCache = { garments: list, fetchedAt: Date.now() };
        writeCachedResponse('demo:/garments?closet=sample', mergedPayload).catch(() => {});
        writeCachedResponse('/garments?closet=sample', mergedPayload).catch(() => {});
        return list;
      }
    } catch {
      // Fall through to cached / standalone catalog fallback below
    }
    try {
      const idbCached =
        (await readCachedResponse<Record<string, unknown>>('demo:/garments?closet=sample')) ||
        (await readCachedResponse<Record<string, unknown>>('/garments?closet=sample'));
      const rawList = Array.isArray(idbCached?.garments)
        ? (idbCached.garments as GarmentRecord[])
        : [];
      if (rawList.length > 0) {
        const list = await mergeMissingCyberDemoGarments(rawList);
        sampleGarmentsPrefetchCache = { garments: list, fetchedAt: Date.now() };
        if (list !== rawList && idbCached) {
          const mergedPayload = { ...idbCached, garments: list };
          writeCachedResponse('demo:/garments?closet=sample', mergedPayload).catch(() => {});
          writeCachedResponse('/garments?closet=sample', mergedPayload).catch(() => {});
        }
        return list;
      }
    } catch {
      // Ignore cache read error
    }
    return await loadInstantSampleGarmentsFallback();
  })().finally(() => {
    sampleGarmentsPrefetchInFlight = null;
  });

  sampleGarmentsPrefetchInFlight = job;
  return job;
}

export function isLiveAppEmbedSession(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as Record<string, unknown>).__AINVTRY_LIVE_EMBED__ === true) {
    return true;
  }
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
}

export function isSiteDemoUser(
  user: { role?: string | null; isSiteDemo?: boolean; username?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  return Boolean(user.isSiteDemo || user.role === 'site_demo' || user.username === 'site_demo');
}

export function hasUserPermission(
  user:
    | { role?: string | null; permissions?: string[] | null; isSampleDemo?: boolean }
    | null
    | undefined,
  permissionCode: string
): boolean {
  if (!user || !permissionCode) return false;
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permissionCode);
  }
  if (user.role === 'admin') return true;
  if (user.role === 'site_demo' || user.role === 'guest' || user.isSampleDemo) {
    return (
      permissionCode === 'closet:read_sample' ||
      permissionCode === 'outfit:read' ||
      permissionCode === 'calendar:read' ||
      permissionCode === 'packing:read' ||
      permissionCode === 'stats:read' ||
      permissionCode === 'profile:read' ||
      permissionCode === 'vton:preview' ||
      permissionCode === 'menu:outfits' ||
      permissionCode === 'menu:closet' ||
      permissionCode === 'menu:calendar' ||
      permissionCode === 'menu:stats' ||
      permissionCode === 'menu:profile' ||
      permissionCode === 'btn:outfits:stage_bg' ||
      permissionCode === 'btn:outfits:weather_scenario' ||
      permissionCode === 'btn:stats:detail'
    );
  }
  return !permissionCode.startsWith('admin:');
}

export function isDemoVtonAccount(
  user:
    | {
        role?: string | null;
        isSiteDemo?: boolean;
        isSampleDemo?: boolean;
        username?: string | null;
        permissions?: string[] | null;
      }
    | null
    | undefined
): boolean {
  if (!user) return false;
  if (isSiteDemoUser(user) || Boolean(user.isSampleDemo)) return true;
  if (
    Array.isArray(user.permissions) &&
    user.permissions.includes('vton:preview') &&
    !user.permissions.includes('vton:synthesize')
  ) {
    return true;
  }
  return false;
}

export function getConfiguredApiBaseUrl(): string {
  return API_BASE_URL;
}

export function isStaticStandaloneWithoutApi(): boolean {
  return API_RUNTIME_CONFIG.isStaticStandaloneWithoutApi;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  timeoutMs?: number;
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
  if (isLiveAppEmbedSession()) {
    return inMemoryEmbedToken;
  }
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

let cookieSessionActive = false;

export function isCookieSessionActive(): boolean {
  return cookieSessionActive;
}

export function setCookieSessionActive(active: boolean, userId?: number | string | null): void {
  cookieSessionActive = Boolean(active);
  if (isLiveAppEmbedSession()) return;
  if (active) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SAMPLE_DEMO_KEY);
      } catch {
        // ignore storage error
      }
    }
    if (!getStoredToken() && userId !== undefined && userId !== null && String(userId).trim()) {
      setOfflineUserScope(`cookie_${String(userId).trim()}`);
    }
  } else if (!getStoredToken()) {
    setOfflineUserScope(null);
  }
}

export function setStoredToken(token: string | null | undefined): void {
  if (isLiveAppEmbedSession()) {
    if (token) {
      inMemoryEmbedToken = token;
      inMemoryEmbedSampleDemo = false;
      setOfflineUserScope(`embed_${token.slice(0, 20)}`);
    } else {
      inMemoryEmbedToken = '';
      setOfflineUserScope(null);
    }
    return;
  }
  if (!token) {
    cookieSessionActive = false;
  }
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
  if (isLiveAppEmbedSession()) {
    return inMemoryEmbedSampleDemo;
  }
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SAMPLE_DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSampleDemoMode(enabled: boolean): void {
  if (isLiveAppEmbedSession()) {
    inMemoryEmbedSampleDemo = Boolean(enabled);
    return;
  }
  if (enabled) {
    cookieSessionActive = false;
  }
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

const STATIC_STANDALONE_BUILD = API_RUNTIME_CONFIG.isStaticStandaloneWithoutApi;

async function rawNetworkFetch(
  path: string,
  options: ApiRequestOptions = {}
): Promise<Record<string, unknown>> {
  if (STATIC_STANDALONE_BUILD) {
    throw new ApiError('Static standalone host', {
      status: 0,
      isBackendUnavailable: true,
    });
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isAuthPath = normalizedPath.startsWith('/auth/');
  const token = getStoredToken();
  const sampleDemo = isSampleDemoMode();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  const explicitSampleHeader = headers['X-Demo-Mode'] === 'sample';
  if ((!isAuthPath && sampleDemo) || explicitSampleHeader) {
    headers['X-Demo-Mode'] = 'sample';
    delete headers.Authorization;
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const { timeoutMs = 12000, signal: externalSignal, ...fetchInit } = options;
  const controller =
    typeof AbortController !== 'undefined' && timeoutMs > 0 ? new AbortController() : null;
  let didTimeout = false;
  const timerId =
    controller && timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeoutMs)
      : null;

  const onExternalAbort = () => controller?.abort();
  if (externalSignal && controller) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      credentials: fetchInit.credentials ?? 'same-origin',
      ...fetchInit,
      headers,
      signal: controller ? controller.signal : externalSignal,
    });
    const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');

    // Static hosts / SPA routers / Capacitor WebViews return text/html or non-JSON 200/404/405/5xx when no API server is running.
    // Never treat non-JSON 400/401/403/413/429 gateway rejections as "backend unavailable" so auth/rate-limit errors surface!
    if (!isJson) {
      const isStaticOrGatewayDown =
        res.status === 200 || res.status === 404 || res.status === 405 || res.status >= 500;
      throw new ApiError(
        isStaticOrGatewayDown ? `API 서버 미연결 (${res.status})` : `요청 거부 (${res.status})`,
        {
          status: res.status,
          isBackendUnavailable: isStaticOrGatewayDown,
        }
      );
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errorMessage =
        typeof data.error === 'string' && data.error ? data.error : `요청 실패 (${res.status})`;
      if (
        res.status === 403 &&
        data?.code === 'PERMISSION_DENIED' &&
        typeof window !== 'undefined' &&
        headers['X-Silent-Permission-Check'] !== '1'
      ) {
        window.dispatchEvent(
          new CustomEvent('ainventory:permission-denied', {
            detail: {
              permissionCode:
                typeof data.requiredPermission === 'string' ? data.requiredPermission : undefined,
              message: errorMessage,
              adminContactEmail:
                typeof data.adminContactEmail === 'string' ? data.adminContactEmail : undefined,
            },
          })
        );
      }
      throw new ApiError(errorMessage, {
        status: res.status,
        data,
        isBackendUnavailable: res.status === 502 || res.status === 503 || res.status === 504,
      });
    }
    return data;
  } catch (err) {
    if (didTimeout) {
      throw new ApiError('서버 응답 시간이 초과되었습니다.', {
        status: 0,
        isBackendUnavailable: true,
      });
    }
    throw err;
  } finally {
    if (timerId !== null) clearTimeout(timerId);
    if (externalSignal && controller) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
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
    if (!isSampleDemoMode() && (getStoredToken() || isCookieSessionActive())) {
      flushPendingOfflineSync().catch(() => {});
    }
  });
}

function isNetworkOrBackendUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const candidate = err as { status?: number; isBackendUnavailable?: boolean };
  return !candidate.status || Boolean(candidate.isBackendUnavailable);
}

function coerceApiPayload<T>(payload: Record<string, unknown>): T {
  return payload as T;
}

/**
 * Offline-First + Sample Demo + Standalone Fallback API Client
 * - Mirrors GET responses into IndexedDB (`ainventory_offline_v1`) with user-scope isolation
 * - Preserves local IndexedDB mutations in default sample/local closet mode across GET refreshes
 * - Flushes pending offline mutations BEFORE refreshing online GET caches to prevent clobbering
 * - Falls back to `handleStandaloneApiFallback` on Capacitor APK / static hosts without Express backend
 */
export async function apiFetch<T = Record<string, unknown>>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const sampleDemo = isSampleDemoMode();
  const isAuthEndpoint = path.startsWith('/auth/');
  const isProfileConfigEndpoint = path.startsWith('/profile/config');
  const isStatelessCompute =
    path === '/garments/analyze' ||
    path === '/garments/vision-analyze' ||
    path === '/garments/web-lookup' ||
    path === '/garments/studio-cutout' ||
    path === '/shopping/analyze' ||
    path === '/shopping-check' ||
    path === '/vton/synthesize' ||
    path === '/vton/qc-failure-log';

  // In Sample / Default Local Closet Mode, state mutations persist in local IndexedDB
  // (`/profile/config` is excluded so server-side profile configuration persists on the server)
  if (
    sampleDemo &&
    method !== 'GET' &&
    !isAuthEndpoint &&
    !isProfileConfigEndpoint &&
    !isStatelessCompute
  ) {
    if (path.startsWith('/garments')) {
      const existingDemo = await readCachedResponse<Record<string, unknown>>(
        'demo:/garments?closet=sample'
      );
      if (!existingDemo) {
        try {
          const seed = await rawNetworkFetch('/garments?closet=sample');
          await writeCachedResponse('demo:/garments?closet=sample', seed);
        } catch {
          const localSeed = await runStandaloneFallback('/garments?closet=sample', {});
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
          const localSeed = await runStandaloneFallback('/outfits?closet=sample', {});
          await writeCachedResponse('demo:/outfits?closet=sample', localSeed);
        }
      }
    }
    markSampleDemoMutated();
    return coerceApiPayload<T>(
      await applyOptimisticLocalMutation(path, method, options.body, false)
    );
  }

  const isBrowserOffline = isEffectivelyOffline();

  if (method === 'GET') {
    const isLiveStatusEndpoint =
      path === '/vton/status' || path.startsWith('/vton/status?') || path === '/build-info';
    const isLiveWeatherEndpoint =
      path === '/weather/recommendations' ||
      path.startsWith('/weather/recommendations?') ||
      path === '/weather-styling' ||
      path.startsWith('/weather-styling?');
    const skipStaleIdbCache = isAuthEndpoint || isLiveStatusEndpoint || isLiveWeatherEndpoint;
    const cacheKey = sampleDemo ? `demo:${path}` : path;
    const isSampleGarmentsRequest = path === '/garments?closet=sample';
    if (sampleDemo && isSampleDemoMutated() && !isProfileConfigEndpoint && !skipStaleIdbCache) {
      const mutatedCached = await readCachedResponse<Record<string, unknown>>(cacheKey);
      if (mutatedCached) {
        if (isSampleGarmentsRequest && Array.isArray(mutatedCached.garments)) {
          const rawList = mutatedCached.garments as GarmentRecord[];
          const mergedList = await mergeMissingCyberDemoGarments(rawList);
          if (mergedList !== rawList) {
            const healedPayload = { ...mutatedCached, garments: mergedList };
            writeCachedResponse(cacheKey, healedPayload).catch(() => {});
            return coerceApiPayload<T>(healedPayload);
          }
        }
        return coerceApiPayload<T>(mutatedCached);
      }
    }
    if (isSampleGarmentsRequest && !isSampleDemoMutated()) {
      const prefetched = getPrefetchedSampleGarments();
      if (prefetched && prefetched.length > 0 && hasAllCyberDemoShowcaseGarments(prefetched)) {
        return coerceApiPayload<T>({ garments: prefetched, _fromPrefetch: true });
      }
      if (sampleGarmentsPrefetchInFlight) {
        const awaited = await sampleGarmentsPrefetchInFlight.catch(() => []);
        if (awaited.length > 0) {
          return coerceApiPayload<T>({ garments: awaited, _fromPrefetch: true });
        }
      }
    }
    if (isBrowserOffline) {
      if (!skipStaleIdbCache) {
        const cached = await readCachedResponse<Record<string, unknown>>(cacheKey);
        if (cached) {
          if (isSampleGarmentsRequest && Array.isArray(cached.garments)) {
            const rawList = cached.garments as GarmentRecord[];
            const mergedList = await mergeMissingCyberDemoGarments(rawList);
            if (mergedList !== rawList) {
              const healedPayload = { ...cached, garments: mergedList };
              writeCachedResponse(cacheKey, healedPayload).catch(() => {});
              return coerceApiPayload<T>({ ...healedPayload, _fromOfflineCache: true });
            }
          }
          return coerceApiPayload<T>({ ...cached, _fromOfflineCache: true });
        }
      }
      const localData = await runStandaloneFallback(path, options);
      if (!skipStaleIdbCache) {
        await writeCachedResponse(cacheKey, localData).catch(() => {});
      }
      return coerceApiPayload<T>({ ...localData, _fromOfflineCache: true });
    }
    try {
      // Flush any queued offline mutations BEFORE fetching & overwriting GET cache
      // (skip in read-only live embed sessions so IndexedDB never stalls initial studio loading)
      if (!sampleDemo && !isLiveAppEmbedSession() && (getStoredToken() || isCookieSessionActive())) {
        const queuedCount = await getQueuedMutationCount().catch(() => 0);
        if (queuedCount > 0) {
          await flushPendingOfflineSync().catch(() => 0);
        }
      }
      let data = await rawNetworkFetch(path, options);
      if (isSampleGarmentsRequest && Array.isArray(data?.garments) && data.garments.length > 0) {
        const rawList = data.garments as GarmentRecord[];
        const mergedList = await mergeMissingCyberDemoGarments(rawList);
        if (mergedList !== rawList) {
          data = { ...data, garments: mergedList };
        }
        sampleGarmentsPrefetchCache = {
          garments: mergedList,
          fetchedAt: Date.now(),
        };
      }
      if (!skipStaleIdbCache) {
        writeCachedResponse(cacheKey, data).catch(() => {});
      }
      return coerceApiPayload<T>(data);
    } catch (err) {
      // Resilient recovery for public sample closet even if an expired/stale Bearer token returned 401/403
      if (isSampleGarmentsRequest) {
        try {
          let sampleRetry = await rawNetworkFetch('/garments?closet=sample', {
            headers: { 'X-Demo-Mode': 'sample' },
            timeoutMs: 4500,
          });
          if (Array.isArray(sampleRetry?.garments) && sampleRetry.garments.length > 0) {
            const rawList = sampleRetry.garments as GarmentRecord[];
            const mergedList = await mergeMissingCyberDemoGarments(rawList);
            if (mergedList !== rawList) {
              sampleRetry = { ...sampleRetry, garments: mergedList };
            }
            sampleGarmentsPrefetchCache = {
              garments: mergedList,
              fetchedAt: Date.now(),
            };
            writeCachedResponse('demo:/garments?closet=sample', sampleRetry).catch(() => {});
            return coerceApiPayload<T>(sampleRetry);
          }
        } catch {
          // Fall through to cached / standalone sample garments fallback
        }
        const localSample = await runStandaloneFallback('/garments?closet=sample', options);
        return coerceApiPayload<T>({ ...localSample, _fromOfflineCache: true });
      }
      // Network failure or missing backend fallback (never swallow genuine HTTP 401/4xx JSON API errors)
      if (isNetworkOrBackendUnavailable(err)) {
        if (!skipStaleIdbCache) {
          const cached = await readCachedResponse<Record<string, unknown>>(cacheKey);
          if (cached) return coerceApiPayload<T>({ ...cached, _fromOfflineCache: true });
        }
        const localData = await runStandaloneFallback(path, options);
        if (!skipStaleIdbCache) {
          await writeCachedResponse(cacheKey, localData).catch(() => {});
        }
        return coerceApiPayload<T>({ ...localData, _fromOfflineCache: true });
      }
      throw err;
    }
  }

  // Stateless compute endpoints (/garments/analyze, /shopping/analyze, /shopping-check)
  // never enqueue into mutation_queue; fall back to local vision/similarity compute when offline
  if (isStatelessCompute) {
    if (path === '/vton/qc-failure-log') {
      if (isBrowserOffline) {
        return coerceApiPayload<T>({ ok: false, logged: false });
      }
      try {
        return coerceApiPayload<T>(await rawNetworkFetch(path, options));
      } catch (err) {
        if (isNetworkOrBackendUnavailable(err)) {
          return coerceApiPayload<T>({ ok: false, logged: false });
        }
        throw err;
      }
    }
    if (isBrowserOffline) {
      return coerceApiPayload<T>(await runStandaloneFallback(path, options));
    }
    try {
      return coerceApiPayload<T>(await rawNetworkFetch(path, options));
    } catch (err) {
      if (isNetworkOrBackendUnavailable(err)) {
        return coerceApiPayload<T>(await runStandaloneFallback(path, options));
      }
      throw err;
    }
  }

  // Write / Auth / Profile Config operations (POST / PUT / PATCH / DELETE)
  if (!isAuthEndpoint && !isProfileConfigEndpoint && isBrowserOffline) {
    return coerceApiPayload<T>(
      await applyOptimisticLocalMutation(path, method, options.body, true)
    );
  }
  if (isProfileConfigEndpoint && isBrowserOffline) {
    return coerceApiPayload<T>(await runStandaloneFallback(path, options));
  }

  try {
    const data = await rawNetworkFetch(path, options);
    return coerceApiPayload<T>(data);
  } catch (err) {
    if (isNetworkOrBackendUnavailable(err)) {
      if (isAuthEndpoint || isProfileConfigEndpoint || path === '/garments/import-samples') {
        const res = await runStandaloneFallback(path, options);
        if (path === '/garments/import-samples' && Array.isArray(res.garments)) {
          const first = res.garments[0] as GarmentRecord | undefined;
          const targetCloset = first?.closet_owner || 'sample';
          await writeCachedResponse(`/garments?closet=${encodeURIComponent(targetCloset)}`, {
            garments: res.garments,
          }).catch(() => {});
        }
        return coerceApiPayload<T>(res);
      }
      return coerceApiPayload<T>(
        await applyOptimisticLocalMutation(path, method, options.body, true)
      );
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
