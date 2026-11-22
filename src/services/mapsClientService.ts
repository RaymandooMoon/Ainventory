import { getConfiguredApiBaseUrl } from '../utils/api.ts';
import type { CareMapServiceType } from '../utils/garmentCareEngine.ts';

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

export async function fetchPlaceBackdropBundle({
  placeId,
  lat,
  lng,
  query,
  lang = 'ko',
  signal,
}: {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
  lang?: string;
  signal?: AbortSignal;
}): Promise<PlaceBackdropBundleResponse> {
  const qs = new URLSearchParams({
    languageCode: lang === 'en' ? 'en' : 'ko',
  });
  if (placeId) qs.set('placeId', placeId);
  if (typeof lat === 'number' && Number.isFinite(lat)) qs.set('lat', String(lat));
  if (typeof lng === 'number' && Number.isFinite(lng)) qs.set('lng', String(lng));
  if (query) qs.set('query', String(query).trim().slice(0, 100));

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

  return {
    placeId: typeof data?.placeId === 'string' ? data.placeId : null,
    placeName: String(data?.placeName || query || '').trim(),
    lat: typeof data?.lat === 'number' ? data.lat : null,
    lng: typeof data?.lng === 'number' ? data.lng : null,
    photos: Array.isArray(data?.photos) ? data.photos : [],
    streetView: {
      available: Boolean(data?.streetView?.available && data?.streetView?.panoId),
      panoId: typeof data?.streetView?.panoId === 'string' ? data.streetView.panoId : null,
      copyright: typeof data?.streetView?.copyright === 'string' ? data.streetView.copyright : null,
      date: typeof data?.streetView?.date === 'string' ? data.streetView.date : null,
      reportProblemLink:
        typeof data?.streetView?.reportProblemLink === 'string'
          ? data.streetView.reportProblemLink
          : null,
    },
  };
}

export function buildPlacePhotoProxyUrl(
  photoName: string,
  maxWidthPx = 1280,
  maxHeightPx = 1280
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
  pitch = -2
): string {
  const qs = new URLSearchParams({
    panoId: String(panoId || '').trim(),
    heading: String(((Math.round(heading) % 360) + 360) % 360),
    pitch: String(Math.max(-30, Math.min(45, Math.round(pitch)))),
    fov: '26',
    width: '480',
    height: '640',
  });
  return resolveApiUrl(`/maps/streetview?${qs.toString()}`);
}

