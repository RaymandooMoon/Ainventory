/**
 * Server-side proxy for Google Maps Platform Place Photos (New) & Street View Static API.
 * Strictly follows Google Maps Platform Terms of Service:
 *  - Server-only API key (never exposed to browser <img> URLs)
 *  - Mandatory X-Goog-Maps-Solution-ID: gmp_mcp_codeassist_v1_aistudio
 *  - No permanent storage or DB caching of photo names or media
 *  - Free streetview/metadata pre-check before requesting paid Street View imagery
 * Reference:
 *  - https://developers.google.com/maps/documentation/places/web-service/place-photos?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 *  - https://developers.google.com/maps/documentation/streetview/overview?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */

import { getServerGoogleMapsApiKey } from './mapsProxyService.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const STREET_VIEW_METADATA_URL = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const STREET_VIEW_IMAGE_URL = 'https://maps.googleapis.com/maps/api/streetview';
const MAPS_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const REQUEST_TIMEOUT_MS = 7500;

const SAFE_PLACE_ID_RE = /^[A-Za-z0-9_-]{8,160}$/;
const SAFE_PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]{8,160}\/photos\/[A-Za-z0-9_-]{8,400}$/;
const SAFE_PANO_ID_RE = /^[A-Za-z0-9_-]{8,120}$/;

export function isValidPlaceId(placeId) {
  return SAFE_PLACE_ID_RE.test(String(placeId || '').trim());
}

export function isValidPlacePhotoName(photoName) {
  return SAFE_PHOTO_NAME_RE.test(String(photoName || '').trim());
}

export function isValidStreetViewPanoId(panoId) {
  return SAFE_PANO_ID_RE.test(String(panoId || '').trim());
}

export function sanitizeMapsExternalUrl(rawUrl) {
  let str = String(rawUrl || '').trim();
  if (!str) return null;
  if (str.startsWith('//')) {
    str = `https:${str}`;
  }
  try {
    const parsed = new URL(str);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function clampStreetViewHeading(heading) {
  const n = Number(heading);
  if (!Number.isFinite(n)) return 0;
  const wrapped = ((Math.round(n) % 360) + 360) % 360;
  return wrapped;
}

export function clampBackdropImageSize(width, height, maxW = 1400, maxH = 1200) {
  const wNum = Number(width);
  const hNum = Number(height);
  const clampedW = Number.isFinite(wNum) ? Math.max(320, Math.min(maxW, Math.round(wNum))) : Math.min(1200, maxW);
  const clampedH = Number.isFinite(hNum) ? Math.max(320, Math.min(maxH, Math.round(hNum))) : Math.min(900, maxH);
  return { width: clampedW, height: clampedH };
}

function clampCoord(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function createBackdropError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function classifyUpstreamError(resStatus, payload, fallbackMsg) {
  const upstreamStatus = String(payload?.error?.status || payload?.status || '').toUpperCase();
  const upstreamMsg = String(payload?.error?.message || payload?.error_message || fallbackMsg);
  const isQuota =
    resStatus === 429 ||
    upstreamStatus === 'RESOURCE_EXHAUSTED' ||
    upstreamStatus === 'OVER_QUERY_LIMIT' ||
    /quota|rate limit|over_query_limit/i.test(upstreamMsg);

  return createBackdropError(
    isQuota ? 429 : resStatus >= 400 && resStatus < 600 ? resStatus : 502,
    isQuota ? 'RESOURCE_EXHAUSTED' : upstreamStatus || 'MAPS_BACKDROP_ERROR',
    isQuota ? 'Google Maps Platform API quota reached.' : upstreamMsg
  );
}

export function normalizePlacePhotosList(rawPhotos, limit = 5) {
  if (!Array.isArray(rawPhotos)) return [];
  const out = [];
  for (const item of rawPhotos) {
    const photoName = String(item?.name || '').trim();
    if (!isValidPlacePhotoName(photoName)) continue;
    const widthPx = Number(item?.widthPx);
    const heightPx = Number(item?.heightPx);
    const attributions = Array.isArray(item?.authorAttributions)
      ? item.authorAttributions
          .map((attr) => {
            const displayName = String(attr?.displayName || '').trim();
            if (!displayName) return null;
            return {
              displayName: displayName.slice(0, 80),
              uri: sanitizeMapsExternalUrl(attr?.uri),
            };
          })
          .filter(Boolean)
          .slice(0, 3)
      : [];

    out.push({
      photoName,
      widthPx: Number.isFinite(widthPx) ? Math.round(widthPx) : null,
      heightPx: Number.isFinite(heightPx) ? Math.round(heightPx) : null,
      authorAttributions: attributions,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeStreetViewMetadata(payload) {
  const status = String(payload?.status || '').toUpperCase();
  const panoId = String(payload?.pano_id || '').trim();
  if (status !== 'OK' || !isValidStreetViewPanoId(panoId)) {
    return {
      available: false,
      panoId: null,
      copyright: null,
      date: null,
      reportProblemLink: null,
    };
  }
  const copyright = String(payload?.copyright || '© Google').trim() || '© Google';
  const date = typeof payload?.date === 'string' && payload.date.trim() ? payload.date.trim() : null;
  const reportProblemLink = `https://cbks0.googleapis.com/cbk?output=report&panoid=${encodeURIComponent(
    panoId
  )}&cb_client=api&cbp=1,0,,0,0`;

  return {
    available: true,
    panoId,
    copyright,
    date,
    reportProblemLink,
  };
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw classifyUpstreamError(res.status, payload, 'Google Maps 배경 정보 조회에 실패했습니다.');
    }
    return payload;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw createBackdropError(504, 'MAPS_TIMEOUT', 'Google Maps 응답 시간이 초과되었습니다.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupPlacePhotos({ apiKey, placeId, lat, lng, query, languageCode }) {
  const safeLang = languageCode === 'en' ? 'en' : 'ko';

  if (isValidPlaceId(placeId)) {
    const cleanId = String(placeId).trim();
    const qs = new URLSearchParams({ languageCode: safeLang });
    const payload = await fetchJsonWithTimeout(
      `${PLACES_API_BASE}/places/${encodeURIComponent(cleanId)}?${qs.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
          'X-Goog-FieldMask': 'id,displayName,location,photos',
        },
      }
    );
    return {
      placeId: String(payload?.id || cleanId),
      placeName: String(payload?.displayName?.text || query || '').trim(),
      lat: clampCoord(payload?.location?.latitude, -90, 90) ?? lat,
      lng: clampCoord(payload?.location?.longitude, -180, 180) ?? lng,
      photos: normalizePlacePhotosList(payload?.photos, 5),
    };
  }

  // Fallback: when no placeId is selected yet, search landmark/city photo by query biased to coordinates
  const textQuery = String(query || '').trim().slice(0, 100);
  if (!textQuery) {
    return { placeId: null, placeName: '', lat, lng, photos: [] };
  }

  const body = {
    textQuery,
    languageCode: safeLang,
    pageSize: 3,
  };
  if (lat !== null && lng !== null) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 15000.0,
      },
    };
  }

  const payload = await fetchJsonWithTimeout(`${PLACES_API_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos',
    },
    body: JSON.stringify(body),
  });

  const places = Array.isArray(payload?.places) ? payload.places : [];
  const best = places.find((p) => Array.isArray(p?.photos) && p.photos.length > 0) || places[0] || null;
  if (!best) {
    return { placeId: null, placeName: textQuery, lat, lng, photos: [] };
  }

  return {
    placeId: isValidPlaceId(best?.id) ? String(best.id) : null,
    placeName: String(best?.displayName?.text || textQuery).trim(),
    lat: clampCoord(best?.location?.latitude, -90, 90) ?? lat,
    lng: clampCoord(best?.location?.longitude, -180, 180) ?? lng,
    photos: normalizePlacePhotosList(best?.photos, 5),
  };
}

async function lookupStreetViewMetadata({ apiKey, lat, lng }) {
  if (lat === null || lng === null) {
    return normalizeStreetViewMetadata(null);
  }
  const queryWithRadius = async (radius) => {
    const qs = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      source: 'outdoor',
      key: apiKey,
    });
    const payload = await fetchJsonWithTimeout(`${STREET_VIEW_METADATA_URL}?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      },
    });
    if (String(payload?.status || '').toUpperCase() === 'OVER_QUERY_LIMIT') {
      throw createBackdropError(429, 'RESOURCE_EXHAUSTED', 'Google Maps Platform API quota reached.');
    }
    return normalizeStreetViewMetadata(payload);
  };

  try {
    const near = await queryWithRadius(160);
    if (near.available) return near;
    return await queryWithRadius(320);
  } catch (err) {
    if (err?.status === 429 || err?.code === 'RESOURCE_EXHAUSTED') {
      throw err;
    }
    return normalizeStreetViewMetadata(null);
  }
}

/**
 * Resolves live Place Photos (up to 5) + free Street View metadata check for a selected destination.
 */
export async function fetchPlaceBackdropBundle({
  placeId = '',
  lat = null,
  lng = null,
  query = '',
  languageCode = 'ko',
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    throw createBackdropError(503, 'MAPS_NOT_CONFIGURED', 'Google Maps API 키가 설정되지 않았습니다.');
  }

  const validLat = clampCoord(lat, -90, 90);
  const validLng = clampCoord(lng, -180, 180);

  if (!isValidPlaceId(placeId) && validLat === null && !String(query || '').trim()) {
    throw createBackdropError(400, 'INVALID_BACKDROP_QUERY', '장소 ID, 좌표 또는 검색어가 필요합니다.');
  }

  const placeResult = await lookupPlacePhotos({
    apiKey,
    placeId,
    lat: validLat,
    lng: validLng,
    query,
    languageCode,
  });

  const targetLat = placeResult.lat ?? validLat;
  const targetLng = placeResult.lng ?? validLng;
  const streetView = await lookupStreetViewMetadata({
    apiKey,
    lat: targetLat,
    lng: targetLng,
  });

  return {
    placeId: placeResult.placeId,
    placeName: placeResult.placeName || String(query || '').trim(),
    lat: targetLat,
    lng: targetLng,
    photos: placeResult.photos,
    streetView,
  };
}

/**
 * Streams a Google Place Photo (New) image through the server without exposing API keys.
 */
export async function proxyPlacePhotoMedia({ photoName, maxWidthPx = 1280, maxHeightPx = 1280 }) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    throw createBackdropError(503, 'MAPS_NOT_CONFIGURED', 'Google Maps API 키가 설정되지 않았습니다.');
  }
  const cleanName = String(photoName || '').trim();
  if (!isValidPlacePhotoName(cleanName)) {
    throw createBackdropError(400, 'INVALID_PHOTO_NAME', '유효하지 않은 장소 사진 식별자입니다.');
  }

  const { width, height } = clampBackdropImageSize(maxWidthPx, maxHeightPx, 1600, 1600);
  const qs = new URLSearchParams({
    maxWidthPx: String(width),
    maxHeightPx: String(height),
    key: apiKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLACES_API_BASE}/${cleanName}/media?${qs.toString()}`, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw classifyUpstreamError(res.status, payload, '장소 사진을 불러오지 못했습니다.');
    }
    const contentType = String(res.headers.get('content-type') || 'image/jpeg');
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw createBackdropError(502, 'INVALID_IMAGE_RESPONSE', '이미지 응답이 올바르지 않습니다.');
    }
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      contentType,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw createBackdropError(504, 'MAPS_TIMEOUT', '장소 사진 응답 시간이 초과되었습니다.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streams a Street View Static API panorama tile for a verified panoId without exposing API keys.
 */
export async function proxyStreetViewImage({
  panoId,
  heading = 0,
  pitch = -2,
  fov = 26,
  width = 480,
  height = 640,
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    throw createBackdropError(503, 'MAPS_NOT_CONFIGURED', 'Google Maps API 키가 설정되지 않았습니다.');
  }
  const cleanPano = String(panoId || '').trim();
  if (!isValidStreetViewPanoId(cleanPano)) {
    throw createBackdropError(400, 'INVALID_PANO_ID', '유효하지 않은 거리뷰 파노라마 ID입니다.');
  }

  const safeHeading = clampStreetViewHeading(heading);
  const safePitch = Number.isFinite(Number(pitch))
    ? Math.max(-30, Math.min(45, Math.round(Number(pitch))))
    : -2;
  const safeFov = Number.isFinite(Number(fov))
    ? Math.max(22, Math.min(110, Math.round(Number(fov))))
    : 26;
  const { width: safeW, height: safeH } = clampBackdropImageSize(width, height, 640, 640);

  const qs = new URLSearchParams({
    size: `${safeW}x${safeH}`,
    scale: '2',
    pano: cleanPano,
    heading: String(safeHeading),
    pitch: String(safePitch),
    fov: String(safeFov),
    return_error_code: 'true',
    key: apiKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${STREET_VIEW_IMAGE_URL}?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw classifyUpstreamError(res.status, {}, '거리뷰 이미지를 불러오지 못했습니다.');
    }
    const contentType = String(res.headers.get('content-type') || 'image/jpeg');
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw createBackdropError(502, 'INVALID_IMAGE_RESPONSE', '거리뷰 이미지 형식이 올바르지 않습니다.');
    }
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      contentType,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw createBackdropError(504, 'MAPS_TIMEOUT', '거리뷰 응답 시간이 초과되었습니다.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
