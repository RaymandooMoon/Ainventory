import { getConfiguredApiBaseUrl } from '../utils/api.ts';
import type { CareMapServiceType } from '../utils/garmentCareEngine.ts';
import {
  PLACE_PHOTO_PROXY_MAX_HEIGHT,
  PLACE_PHOTO_PROXY_MAX_WIDTH,
  STREET_VIEW_PORTRAIT_FOV,
  STREET_VIEW_PORTRAIT_PITCH,
  STREET_VIEW_PROXY_HEIGHT,
  STREET_VIEW_PROXY_WIDTH,
} from '../utils/placeBackdropOptics.ts';

export interface PlaceSuggestion {
  placeId: string;
  fullText: string;
  mainText: string;
  secondaryText: string;
  types: string[];
}

export interface PlaceDetailsResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  primaryType: string;
  types: string[];
  googleMapsUri: string | null;
}

export interface NearbyCareShop {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating: number | null;
  userRatingCount: number;
  openNow: boolean | null;
  categoryLabel: string;
  googleMapsUri: string | null;
  serviceType: CareMapServiceType;
}

let cachedBrowserMapsKey: string | null | undefined;

export function notifyGmpQuotaExceeded(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

function checkAndNotifyQuota(status: number, payload: any): boolean {
  const code = String(payload?.code || payload?.error?.status || payload?.status || '').toUpperCase();
  const msg = String(payload?.error || payload?.message || '');
  if (
    status === 429 ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 'OVER_QUERY_LIMIT' ||
    /over_query_limit|resource_exhausted|quota/i.test(msg)
  ) {
    notifyGmpQuotaExceeded();
    return true;
  }
  return false;
}

function resolveApiUrl(path: string): string {
  const base = getConfiguredApiBaseUrl().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createPlacesSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchGoogleMapsBrowserKey(): Promise<string | null> {
  const envKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envKey) return envKey;
  if (cachedBrowserMapsKey !== undefined) return cachedBrowserMapsKey;

  try {
    const res = await fetch(resolveApiUrl('/maps/config'));
    if (!res.ok) {
      cachedBrowserMapsKey = null;
      return null;
    }
    const data = await res.json();
    cachedBrowserMapsKey =
      typeof data?.apiKey === 'string' && data.apiKey.trim() ? data.apiKey.trim() : null;
    return cachedBrowserMapsKey ?? null;
  } catch {
    cachedBrowserMapsKey = null;
    return null;
  }
}

export async function autocompleteDestinationPlaces({
  input,
  sessionToken,
  lang = 'ko',
  lat,
  lng,
}: {
  input: string;
  sessionToken: string;
  lang?: string;
  lat?: number;
  lng?: number;
}): Promise<PlaceSuggestion[]> {
  const trimmed = String(input || '').trim();
  if (trimmed.length < 2) return [];

  const res = await fetch(resolveApiUrl('/maps/autocomplete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: trimmed,
      sessionToken,
      languageCode: lang === 'en' ? 'en' : 'ko',
      regionCode: 'KR',
      lat,
      lng,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (checkAndNotifyQuota(res.status, data)) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(String(data?.error || '장소 자동완성 검색에 실패했습니다.'));
  }
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

export interface PlaceSearchCandidate extends PlaceSuggestion {
  formattedAddress: string;
  lat: number;
  lng: number;
  primaryType: string;
  googleMapsUri: string | null;
  streetViewAvailable?: boolean;
  streetViewPanoId?: string | null;
  streetViewLat?: number | null;
  streetViewLng?: number | null;
  streetViewCopyright?: string | null;
}

export async function searchDestinationPlacesWithLocation({
  input,
  lang = 'ko',
  lat,
  lng,
  signal,
}: {
  input: string;
  lang?: string;
  lat?: number;
  lng?: number;
  signal?: AbortSignal;
}): Promise<PlaceSearchCandidate[]> {
  const trimmed = String(input || '').trim();
  if (trimmed.length < 2) return [];

  const res = await fetch(resolveApiUrl('/maps/search-places'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      input: trimmed,
      languageCode: lang === 'en' ? 'en' : 'ko',
      lat,
      lng,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (checkAndNotifyQuota(res.status, data)) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(String(data?.error || '거리뷰 지원 장소 검색에 실패했습니다.'));
  }
  return Array.isArray(data?.places) ? (data.places as PlaceSearchCandidate[]) : [];
}

export async function fetchDestinationPlaceDetails({
  placeId,
  sessionToken,
  lang = 'ko',
}: {
  placeId: string;
  sessionToken?: string;
  lang?: string;
}): Promise<PlaceDetailsResult> {
  const qs = new URLSearchParams({
    languageCode: lang === 'en' ? 'en' : 'ko',
  });
  if (sessionToken) qs.set('sessionToken', sessionToken);

  const res = await fetch(
    resolveApiUrl(`/maps/place/${encodeURIComponent(placeId)}?${qs.toString()}`)
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (checkAndNotifyQuota(res.status, data)) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(String(data?.error || '장소 상세 정보를 불러오지 못했습니다.'));
  }
  if (!data?.place) {
    throw new Error('장소 정보를 찾을 수 없습니다.');
  }
  return data.place as PlaceDetailsResult;
}

export async function fetchNearbyCareShops({
  lat,
  lng,
  serviceType,
  lang = 'ko',
  radiusMeters = 3000,
}: {
  lat: number;
  lng: number;
  serviceType: CareMapServiceType;
  lang?: string;
  radiusMeters?: number;
}): Promise<{ center: { lat: number; lng: number }; shops: NearbyCareShop[] }> {
  const res = await fetch(resolveApiUrl('/maps/nearby-care'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lng,
      serviceType,
      languageCode: lang === 'en' ? 'en' : 'ko',
      regionCode: 'KR',
      radiusMeters,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (checkAndNotifyQuota(res.status, data)) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(String(data?.error || '주변 세탁·수선소를 불러오지 못했습니다.'));
  }
  return {
    center: data?.center || { lat, lng },
    shops: Array.isArray(data?.shops) ? data.shops : [],
  };
}

export interface PlaceBackdropPhotoResponse {
  photoName: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: Array<{ displayName: string; uri: string | null }>;
}

export interface PlaceBackdropStreetViewResponse {
  available: boolean;
  panoId: string | null;
  copyright: string | null;
  date: string | null;
  reportProblemLink: string | null;
}

export interface PlaceBackdropBundleResponse {
  placeId: string | null;
  placeName: string;
  lat: number | null;
  lng: number | null;
  photos: PlaceBackdropPhotoResponse[];
  streetView: PlaceBackdropStreetViewResponse;
}

// Transient memory-only session cache (never written to localStorage/IndexedDB per Google Maps ToS)
const BACKDROP_BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;
const BACKDROP_BUNDLE_CACHE_MAX_ENTRIES = 24;
const backdropBundleMemoryCache = new Map<
  string,
  { expiresAt: number; value: PlaceBackdropBundleResponse }
>();
const inflightBackdropBundleRequests = new Map<string, Promise<PlaceBackdropBundleResponse>>();
const preloadedBackdropImageUrls = new Set<string>();
const MAX_PRELOADED_BACKDROP_URLS = 48;

function makeBackdropBundleCacheKey({
  placeId,
  lat,
  lng,
  query,
  lang,
}: {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
  lang: string;
}): string {
  const latKey = typeof lat === 'number' && Number.isFinite(lat) ? lat.toFixed(4) : '';
  const lngKey = typeof lng === 'number' && Number.isFinite(lng) ? lng.toFixed(4) : '';
  const qKey = String(query || '').trim().toLowerCase().slice(0, 80);
  return `${lang}|${String(placeId || '').trim()}|${latKey}|${lngKey}|${qKey}`;
}

export function peekCachedPlaceBackdropBundle(params: {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
  lang?: string;
}): PlaceBackdropBundleResponse | null {
  const key = makeBackdropBundleCacheKey({
    ...params,
    lang: params.lang === 'en' ? 'en' : 'ko',
  });
  const entry = backdropBundleMemoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    backdropBundleMemoryCache.delete(key);
    return null;
  }
  // Refresh LRU order
  backdropBundleMemoryCache.delete(key);
  backdropBundleMemoryCache.set(key, entry);
  return entry.value;
}

export async function fetchPlaceBackdropBundle({
  placeId,
  lat,
  lng,
  query,
  lang = 'ko',
  signal,
  bypassCache = false,
}: {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
  lang?: string;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<PlaceBackdropBundleResponse> {
  const safeLang = lang === 'en' ? 'en' : 'ko';
  const cacheKey = makeBackdropBundleCacheKey({ placeId, lat, lng, query, lang: safeLang });

  if (!bypassCache) {
    const cached = peekCachedPlaceBackdropBundle({ placeId, lat, lng, query, lang: safeLang });
    if (cached) {
      return cached;
    }
    const inflight = inflightBackdropBundleRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const qs = new URLSearchParams({
    languageCode: safeLang,
  });
  if (placeId) qs.set('placeId', placeId);
  if (typeof lat === 'number' && Number.isFinite(lat)) qs.set('lat', String(lat));
  if (typeof lng === 'number' && Number.isFinite(lng)) qs.set('lng', String(lng));
  if (query) qs.set('query', String(query).trim().slice(0, 100));

  const requestPromise = (async (): Promise<PlaceBackdropBundleResponse> => {
    const res = await fetch(resolveApiUrl(`/maps/place-backdrop?${qs.toString()}`), {
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (checkAndNotifyQuota(res.status, data)) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(String(data?.error || '장소 배경 정보를 불러오지 못했습니다.'));
    }

    const normalized: PlaceBackdropBundleResponse = {
      placeId: typeof data?.placeId === 'string' ? data.placeId : null,
      placeName: String(data?.placeName || query || '').trim(),
      lat: typeof data?.lat === 'number' ? data.lat : null,
      lng: typeof data?.lng === 'number' ? data.lng : null,
      photos: Array.isArray(data?.photos) ? data.photos : [],
      streetView: {
        available: Boolean(data?.streetView?.available && data?.streetView?.panoId),
        panoId: typeof data?.streetView?.panoId === 'string' ? data.streetView.panoId : null,
        copyright:
          typeof data?.streetView?.copyright === 'string' ? data.streetView.copyright : null,
        date: typeof data?.streetView?.date === 'string' ? data.streetView.date : null,
        reportProblemLink:
          typeof data?.streetView?.reportProblemLink === 'string'
            ? data.streetView.reportProblemLink
            : null,
      },
    };

    if (backdropBundleMemoryCache.size >= BACKDROP_BUNDLE_CACHE_MAX_ENTRIES) {
      const oldestKey = backdropBundleMemoryCache.keys().next().value;
      if (oldestKey) backdropBundleMemoryCache.delete(oldestKey);
    }
    backdropBundleMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + BACKDROP_BUNDLE_CACHE_TTL_MS,
      value: normalized,
    });
    return normalized;
  })();

  inflightBackdropBundleRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (inflightBackdropBundleRequests.get(cacheKey) === requestPromise) {
      inflightBackdropBundleRequests.delete(cacheKey);
    }
  }
}

export function buildPlacePhotoProxyUrl(
  photoName: string,
  maxWidthPx = PLACE_PHOTO_PROXY_MAX_WIDTH,
  maxHeightPx = PLACE_PHOTO_PROXY_MAX_HEIGHT
): string {
  const qs = new URLSearchParams({
    name: String(photoName || '').trim(),
    maxWidthPx: String(Math.max(320, Math.min(1600, Math.round(maxWidthPx)))),
    maxHeightPx: String(Math.max(320, Math.min(1600, Math.round(maxHeightPx)))),
  });
  return resolveApiUrl(`/maps/place-photo?${qs.toString()}`);
}

export function buildStreetViewProxyUrl(
  panoId: string,
  heading = 0,
  pitch = STREET_VIEW_PORTRAIT_PITCH,
  fov = STREET_VIEW_PORTRAIT_FOV
): string {
  const qs = new URLSearchParams({
    panoId: String(panoId || '').trim(),
    heading: String(((Math.round(heading) % 360) + 360) % 360),
    pitch: String(Math.max(-30, Math.min(45, Math.round(pitch)))),
    fov: String(Math.max(12, Math.min(110, Math.round(fov)))),
    width: String(STREET_VIEW_PROXY_WIDTH),
    height: String(STREET_VIEW_PROXY_HEIGHT),
  });
  return resolveApiUrl(`/maps/streetview?${qs.toString()}`);
}

/**
 * Low-priority background image preloader for sibling Street View headings & Place Photos.
 * Uses browser's transient HTTP cache only (strictly no persistent storage).
 */
export function preloadBackdropImage(url: string | null | undefined): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl || preloadedBackdropImageUrls.has(cleanUrl)) return;
  if (preloadedBackdropImageUrls.size >= MAX_PRELOADED_BACKDROP_URLS) {
    const oldest = preloadedBackdropImageUrls.values().next().value;
    if (oldest) preloadedBackdropImageUrls.delete(oldest);
  }
  preloadedBackdropImageUrls.add(cleanUrl);
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = cleanUrl;
}


