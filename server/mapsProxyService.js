/**
 * Server-side proxy for Google Maps Platform Places API (New).
 * Uses modern Places API (New) REST endpoints with minimal X-Goog-FieldMask headers
 * and mandatory AI Studio usage attribution (`gmp_mcp_codeassist_v1_aistudio`).
 * Reference: https://developers.google.com/maps/documentation/places/web-service/op-overview?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */

const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const MAPS_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const REQUEST_TIMEOUT_MS = 7500;

const SAFE_PLACE_ID_RE = /^[A-Za-z0-9_-]{8,160}$/;

const CARE_SERVICE_QUERIES = {
  dry_clean: {
    ko: '드라이클리닝 세탁소',
    en: 'dry cleaner',
  },
  laundry: {
    ko: '세탁소 크린토피아',
    en: 'laundry service',
  },
  alteration: {
    ko: '옷 수선집 의류 수선',
    en: 'clothing alteration tailor',
  },
  leather_care: {
    ko: '명품 가죽 수선 세탁',
    en: 'leather shoe bag repair cleaning',
  },
};

export function getServerGoogleMapsApiKey() {
  const key = String(
    process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || ''
  ).trim();
  return key || null;
}

function clampCoord(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildMapsProxyError(resStatus, payload, fallbackMsg) {
  const upstreamStatus = String(payload?.error?.status || '').toUpperCase();
  const upstreamMsg = String(payload?.error?.message || fallbackMsg);
  const isQuota =
    resStatus === 429 ||
    upstreamStatus === 'RESOURCE_EXHAUSTED' ||
    /quota|rate limit|over_query_limit/i.test(upstreamMsg);

  const err = new Error(
    isQuota
      ? 'Google Maps Platform API quota reached.'
      : upstreamMsg || fallbackMsg
  );
  err.status = isQuota ? 429 : resStatus >= 400 && resStatus < 600 ? resStatus : 502;
  err.code = isQuota ? 'RESOURCE_EXHAUSTED' : upstreamStatus || 'MAPS_UPSTREAM_ERROR';
  return err;
}

async function fetchPlacesJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw buildMapsProxyError(res.status, payload, 'Google Places 요청에 실패했습니다.');
    }
    return payload;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error('Google Maps 응답 시간이 초과되었습니다.');
      timeoutErr.status = 504;
      timeoutErr.code = 'MAPS_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Places API (New) Autocomplete
 */
export async function autocompletePlaces({
  input,
  sessionToken = '',
  languageCode = 'ko',
  regionCode = 'KR',
  lat = null,
  lng = null,
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    const err = new Error('Google Maps API 키가 설정되지 않았습니다.');
    err.status = 503;
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }

  const trimmed = String(input || '').trim().slice(0, 120);
  if (trimmed.length < 2) {
    return { suggestions: [] };
  }

  const body = {
    input: trimmed,
    languageCode: languageCode === 'en' ? 'en' : 'ko',
    regionCode: /^[A-Z]{2}$/.test(String(regionCode || '').toUpperCase())
      ? String(regionCode).toUpperCase()
      : 'KR',
  };

  if (typeof sessionToken === 'string' && sessionToken.trim().length >= 8) {
    body.sessionToken = sessionToken.trim().slice(0, 128);
  }

  const validLat = clampCoord(lat, -90, 90);
  const validLng = clampCoord(lng, -180, 180);
  if (validLat !== null && validLng !== null) {
    body.locationBias = {
      circle: {
        center: { latitude: validLat, longitude: validLng },
        radius: 30000.0,
      },
    };
  }

  const payload = await fetchPlacesJson(`${PLACES_API_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.types',
    },
    body: JSON.stringify(body),
  });

  const rawSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const suggestions = rawSuggestions
    .map((entry) => entry?.placePrediction)
    .filter((pred) => pred && typeof pred.placeId === 'string' && SAFE_PLACE_ID_RE.test(pred.placeId))
    .slice(0, 6)
    .map((pred) => ({
      placeId: pred.placeId,
      fullText: String(pred?.text?.text || '').trim(),
      mainText: String(pred?.structuredFormat?.mainText?.text || pred?.text?.text || '').trim(),
      secondaryText: String(pred?.structuredFormat?.secondaryText?.text || '').trim(),
      types: Array.isArray(pred.types) ? pred.types.slice(0, 8) : [],
    }));

  return { suggestions };
}

/**
 * Places API (New) Place Details
 */
export async function getPlaceDetails({
  placeId,
  sessionToken = '',
  languageCode = 'ko',
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    const err = new Error('Google Maps API 키가 설정되지 않았습니다.');
    err.status = 503;
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }

  const cleanId = String(placeId || '').trim();
  if (!SAFE_PLACE_ID_RE.test(cleanId)) {
    const err = new Error('유효하지 않은 장소 ID입니다.');
    err.status = 400;
    err.code = 'INVALID_PLACE_ID';
    throw err;
  }

  const qs = new URLSearchParams({
    languageCode: languageCode === 'en' ? 'en' : 'ko',
  });
  if (typeof sessionToken === 'string' && sessionToken.trim().length >= 8) {
    qs.set('sessionToken', sessionToken.trim().slice(0, 128));
  }

  const payload = await fetchPlacesJson(
    `${PLACES_API_BASE}/places/${encodeURIComponent(cleanId)}?${qs.toString()}`,
    {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,location,primaryType,types,googleMapsUri',
      },
    }
  );

  const lat = clampCoord(payload?.location?.latitude, -90, 90);
  const lng = clampCoord(payload?.location?.longitude, -180, 180);
  if (lat === null || lng === null) {
    const err = new Error('장소 좌표를 확인할 수 없습니다.');
    err.status = 404;
    err.code = 'PLACE_LOCATION_MISSING';
    throw err;
  }

  return {
    place: {
      placeId: String(payload.id || cleanId),
      name: String(payload?.displayName?.text || '').trim(),
      formattedAddress: String(payload?.formattedAddress || '').trim(),
      lat,
      lng,
      primaryType: String(payload?.primaryType || '').trim(),
      types: Array.isArray(payload?.types) ? payload.types.slice(0, 10) : [],
      googleMapsUri:
        typeof payload?.googleMapsUri === 'string' &&
        payload.googleMapsUri.startsWith('https://')
          ? payload.googleMapsUri
          : null,
    },
  };
}

/**
 * Places API (New) Text Search for nearby laundry / dry-cleaning / alteration / leather care shops
 */
export async function searchNearbyCareShops({
  lat,
  lng,
  serviceType = 'dry_clean',
  languageCode = 'ko',
  regionCode = 'KR',
  radiusMeters = 3000,
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    const err = new Error('Google Maps API 키가 설정되지 않았습니다.');
    err.status = 503;
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }

  const validLat = clampCoord(lat, -90, 90);
  const validLng = clampCoord(lng, -180, 180);
  if (validLat === null || validLng === null) {
    const err = new Error('유효한 위도/경도 좌표가 필요합니다.');
    err.status = 400;
    err.code = 'INVALID_COORDS';
    throw err;
  }

  const safeService = Object.prototype.hasOwnProperty.call(CARE_SERVICE_QUERIES, serviceType)
    ? serviceType
    : 'dry_clean';
  const lang = languageCode === 'en' ? 'en' : 'ko';
  const textQuery = CARE_SERVICE_QUERIES[safeService][lang];
  const clampedRadius = Math.max(500, Math.min(15000, Math.round(Number(radiusMeters) || 3000)));

  const payload = await fetchPlacesJson(`${PLACES_API_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.googleMapsUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({
      textQuery,
      languageCode: lang,
      regionCode: /^[A-Z]{2}$/.test(String(regionCode || '').toUpperCase())
        ? String(regionCode).toUpperCase()
        : 'KR',
      pageSize: 10,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: {
          center: { latitude: validLat, longitude: validLng },
          radius: clampedRadius,
        },
      },
    }),
  });

  const rawPlaces = Array.isArray(payload?.places) ? payload.places : [];
  const shops = rawPlaces
    .map((p) => {
      const pLat = clampCoord(p?.location?.latitude, -90, 90);
      const pLng = clampCoord(p?.location?.longitude, -180, 180);
      if (pLat === null || pLng === null) return null;
      return {
        placeId: String(p.id || ''),
        name: String(p?.displayName?.text || '').trim(),
        address: String(p?.formattedAddress || '').trim(),
        lat: pLat,
        lng: pLng,
        distanceMeters: haversineMeters(validLat, validLng, pLat, pLng),
        rating: typeof p?.rating === 'number' ? Number(p.rating.toFixed(1)) : null,
        userRatingCount:
          typeof p?.userRatingCount === 'number' ? Math.round(p.userRatingCount) : 0,
        openNow:
          typeof p?.currentOpeningHours?.openNow === 'boolean'
            ? p.currentOpeningHours.openNow
            : null,
        categoryLabel: String(p?.primaryTypeDisplayName?.text || '').trim(),
        googleMapsUri:
          typeof p?.googleMapsUri === 'string' && p.googleMapsUri.startsWith('https://')
            ? p.googleMapsUri
            : null,
        serviceType: safeService,
      };
    })
    .filter((shop) => shop && shop.name)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    center: { lat: validLat, lng: validLng },
    serviceType: safeService,
    shops,
  };
}

/**
 * Places API (New) Text Search returning up to 8 candidates WITH exact lat/lng coordinates
 * in a single call, enabling client-side real-time StreetViewService (OUTDOOR) filtering.
 */
export async function searchPlacesWithLocation({
  input,
  languageCode = 'ko',
  regionCode = 'KR',
  lat = null,
  lng = null,
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    const err = new Error('Google Maps API 키가 설정되지 않았습니다.');
    err.status = 503;
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }

  const trimmed = String(input || '').trim().slice(0, 120);
  if (trimmed.length < 2) {
    return { places: [] };
  }

  const body = {
    textQuery: trimmed,
    languageCode: languageCode === 'en' ? 'en' : 'ko',
    pageSize: 8,
  };

  if (/^[A-Z]{2}$/.test(String(regionCode || '').toUpperCase())) {
    body.regionCode = String(regionCode).toUpperCase();
  }

  const validLat = clampCoord(lat, -90, 90);
  const validLng = clampCoord(lng, -180, 180);
  if (validLat !== null && validLng !== null) {
    body.locationBias = {
      circle: {
        center: { latitude: validLat, longitude: validLng },
        radius: 30000.0,
      },
    };
  }

  const payload = await fetchPlacesJson(`${PLACES_API_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.googleMapsUri',
    },
    body: JSON.stringify(body),
  });

  const rawPlaces = Array.isArray(payload?.places) ? payload.places : [];
  const places = rawPlaces
    .map((p) => {
      const placeId = String(p?.id || '').trim();
      const pLat = clampCoord(p?.location?.latitude, -90, 90);
      const pLng = clampCoord(p?.location?.longitude, -180, 180);
      const mainText = String(p?.displayName?.text || '').trim();
      if (!SAFE_PLACE_ID_RE.test(placeId) || pLat === null || pLng === null || !mainText) {
        return null;
      }
      const secondaryText = String(p?.formattedAddress || '').trim();
      return {
        placeId,
        fullText: secondaryText ? `${mainText} · ${secondaryText}` : mainText,
        mainText,
        secondaryText,
        formattedAddress: secondaryText,
        lat: pLat,
        lng: pLng,
        primaryType: String(p?.primaryType || '').trim(),
        types: Array.isArray(p?.types) ? p.types.slice(0, 10) : [],
        googleMapsUri:
          typeof p?.googleMapsUri === 'string' && p.googleMapsUri.startsWith('https://')
            ? p.googleMapsUri
            : null,
      };
    })
    .filter(Boolean);

  return { places };
}

