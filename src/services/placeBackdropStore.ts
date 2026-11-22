export type PlaceBackdropSourceMode = 'place_photo' | 'street_view';
export type PlaceBackdropBlurPresetKey = 'sharp' | 'soft' | 'strong' | 'custom';

export interface PlaceBackdropPreference {
  enabled: boolean;
  sourceMode: PlaceBackdropSourceMode;
  blurPx: number;
  selectedPhotoIndex: number;
  streetViewHeading: number;
}

export interface PlaceBackdropAuthorAttribution {
  displayName: string;
  uri: string | null;
}

export interface PlaceBackdropPhotoItem {
  photoName: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: PlaceBackdropAuthorAttribution[];
}

export interface PlaceBackdropStreetViewInfo {
  available: boolean;
  panoId: string | null;
  copyright: string | null;
  date: string | null;
  reportProblemLink: string | null;
}

export interface PlaceBackdropDataState {
  placeId: string | null;
  placeName: string;
  lat: number | null;
  lng: number | null;
  photos: PlaceBackdropPhotoItem[];
  streetView: PlaceBackdropStreetViewInfo;
  loading: boolean;
  error: string | null;
  quotaExceeded: boolean;
}

export interface ActivePlaceBackdropVisual {
  active: boolean;
  imageUrl: string | null;
  liveMapMode: 'street_view' | null;
  lat: number | null;
  lng: number | null;
  streetViewHeading: number;
  blurPx: number;
  sourceMode: PlaceBackdropSourceMode;
  placeName: string;
  attributions: PlaceBackdropAuthorAttribution[];
  streetViewCopyright: string | null;
  streetViewReportUrl: string | null;
  photoIndex: number;
  photoCount: number;
}

export const PLACE_BACKDROP_MIN_BLUR_PX = 0;
export const PLACE_BACKDROP_MAX_BLUR_PX = 24;

export const PLACE_BACKDROP_BLUR_PRESETS: Array<{
  key: 'sharp' | 'soft' | 'strong';
  blurPx: number;
  labelKo: string;
  labelEn: string;
}> = [
  { key: 'sharp', blurPx: 0, labelKo: '선명', labelEn: 'Sharp' },
  { key: 'soft', blurPx: 8, labelKo: '은은', labelEn: 'Soft' },
  { key: 'strong', blurPx: 16, labelKo: '강함', labelEn: 'Strong' },
];

export const STREET_VIEW_HEADING_OPTIONS: Array<{
  heading: number;
  labelKo: string;
  labelEn: string;
}> = [
  { heading: 0, labelKo: '북 · 0°', labelEn: 'N · 0°' },
  { heading: 90, labelKo: '동 · 90°', labelEn: 'E · 90°' },
  { heading: 180, labelKo: '남 · 180°', labelEn: 'S · 180°' },
  { heading: 270, labelKo: '서 · 270°', labelEn: 'W · 270°' },
];

export const DEFAULT_PLACE_BACKDROP_PREF: PlaceBackdropPreference = {
  enabled: false,
  sourceMode: 'place_photo',
  blurPx: 8,
  selectedPhotoIndex: 0,
  streetViewHeading: 0,
};

export const EMPTY_PLACE_BACKDROP_DATA: PlaceBackdropDataState = {
  placeId: null,
  placeName: '',
  lat: null,
  lng: null,
  photos: [],
  streetView: {
    available: false,
    panoId: null,
    copyright: null,
    date: null,
    reportProblemLink: null,
  },
  loading: false,
  error: null,
  quotaExceeded: false,
};

const STORAGE_KEY = 'ainventory_maps_place_backdrop_pref_v1';

export function clampPlaceBackdropBlurPx(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PLACE_BACKDROP_PREF.blurPx;
  return Math.max(
    PLACE_BACKDROP_MIN_BLUR_PX,
    Math.min(PLACE_BACKDROP_MAX_BLUR_PX, Math.round(n))
  );
}

export function resolveBlurPresetKey(blurPx: number): PlaceBackdropBlurPresetKey {
  const safe = clampPlaceBackdropBlurPx(blurPx);
  const matched = PLACE_BACKDROP_BLUR_PRESETS.find((p) => p.blurPx === safe);
  return matched ? matched.key : 'custom';
}

export function normalizeStreetViewHeading(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % 360) + 360) % 360;
}

export function sanitizePlaceBackdropPref(raw: unknown): PlaceBackdropPreference {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLACE_BACKDROP_PREF };
  const obj = raw as Record<string, unknown>;
  const sourceMode: PlaceBackdropSourceMode =
    obj.sourceMode === 'street_view' ? 'street_view' : 'place_photo';
  const idxNum = Number(obj.selectedPhotoIndex);
  const selectedPhotoIndex = Number.isFinite(idxNum)
    ? Math.max(0, Math.min(4, Math.floor(idxNum)))
    : 0;

  return {
    enabled: Boolean(obj.enabled),
    sourceMode,
    blurPx: clampPlaceBackdropBlurPx(obj.blurPx),
    selectedPhotoIndex,
    streetViewHeading: normalizeStreetViewHeading(obj.streetViewHeading),
  };
}

export function getStoredPlaceBackdropPref(): PlaceBackdropPreference {
  if (typeof window === 'undefined') return { ...DEFAULT_PLACE_BACKDROP_PREF };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PLACE_BACKDROP_PREF };
    return sanitizePlaceBackdropPref(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PLACE_BACKDROP_PREF };
  }
}

export function saveStoredPlaceBackdropPref(
  next: Partial<PlaceBackdropPreference>
): PlaceBackdropPreference {
  const merged = sanitizePlaceBackdropPref({
    ...getStoredPlaceBackdropPref(),
    ...next,
  });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage quota errors
    }
  }
  return merged;
}

/**
 * Resolves the active eye-level human-scale backdrop visual (Place Photos or Outdoor Street View)
 * without ever using top-down satellite views behind the standing avatar.
 */
export function resolveActivePlaceBackdropVisual({
  pref,
  data,
  fallbackLat = null,
  fallbackLng = null,
  fallbackPlaceName = '',
  liveStreetViewUnavailable = false,
  buildPhotoUrl,
  buildStreetViewUrl,
}: {
  pref: PlaceBackdropPreference;
  data: PlaceBackdropDataState | null | undefined;
  fallbackLat?: number | null;
  fallbackLng?: number | null;
  fallbackPlaceName?: string;
  liveStreetViewUnavailable?: boolean;
  buildPhotoUrl: (photoName: string) => string;
  buildStreetViewUrl: (panoId: string, heading: number) => string;
}): ActivePlaceBackdropVisual {
  const blurPx = clampPlaceBackdropBlurPx(pref?.blurPx);
  const heading = normalizeStreetViewHeading(pref?.streetViewHeading);
  const resolvedLat =
    typeof data?.lat === 'number' && Number.isFinite(data.lat)
      ? data.lat
      : typeof fallbackLat === 'number' && Number.isFinite(fallbackLat)
        ? fallbackLat
        : null;
  const resolvedLng =
    typeof data?.lng === 'number' && Number.isFinite(data.lng)
      ? data.lng
      : typeof fallbackLng === 'number' && Number.isFinite(fallbackLng)
        ? fallbackLng
        : null;
  const hasCoords = resolvedLat !== null && resolvedLng !== null;
  const placeName = data?.placeName || fallbackPlaceName || '';

  const empty: ActivePlaceBackdropVisual = {
    active: false,
    imageUrl: null,
    liveMapMode: null,
    lat: resolvedLat,
    lng: resolvedLng,
    streetViewHeading: heading,
    blurPx,
    sourceMode: pref?.sourceMode === 'street_view' ? 'street_view' : 'place_photo',
    placeName,
    attributions: [],
    streetViewCopyright: null,
    streetViewReportUrl: null,
    photoIndex: 0,
    photoCount: Array.isArray(data?.photos) ? data.photos.length : 0,
  };

  if (!pref?.enabled || !data || data.quotaExceeded) {
    return empty;
  }

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const sv = data.streetView;

  // 1. Explicit Street View (server Static proxy if available, else eye-level outdoor Maps JS StreetViewPanorama)
  if (pref.sourceMode === 'street_view') {
    if (sv?.available && sv.panoId) {
      return {
        active: true,
        imageUrl: buildStreetViewUrl(sv.panoId, heading),
        liveMapMode: null,
        lat: resolvedLat,
        lng: resolvedLng,
        streetViewHeading: heading,
        blurPx,
        sourceMode: 'street_view',
        placeName,
        attributions: [],
        streetViewCopyright: sv.copyright || '© Google',
        streetViewReportUrl: sv.reportProblemLink || null,
        photoIndex: 0,
        photoCount: photos.length,
      };
    }
    if (hasCoords && !liveStreetViewUnavailable) {
      return {
        active: true,
        imageUrl: null,
        liveMapMode: 'street_view',
        lat: resolvedLat,
        lng: resolvedLng,
        streetViewHeading: heading,
        blurPx,
        sourceMode: 'street_view',
        placeName,
        attributions: [],
        streetViewCopyright: '© Google',
        streetViewReportUrl: null,
        photoIndex: 0,
        photoCount: photos.length,
      };
    }
  }

  // 2. Place Photos (when Places API returns photos)
  if (photos.length > 0) {
    const safeIdx = Math.max(0, Math.min(photos.length - 1, pref.selectedPhotoIndex || 0));
    const chosen = photos[safeIdx];
    return {
      active: true,
      imageUrl: buildPhotoUrl(chosen.photoName),
      liveMapMode: null,
      lat: resolvedLat,
      lng: resolvedLng,
      streetViewHeading: heading,
      blurPx,
      sourceMode: 'place_photo',
      placeName,
      attributions: Array.isArray(chosen.authorAttributions) ? chosen.authorAttributions : [],
      streetViewCopyright: null,
      streetViewReportUrl: null,
      photoIndex: safeIdx,
      photoCount: photos.length,
    };
  }

  // 3. Fallback to eye-level Outdoor Street View when Place Photos are empty
  if (sv?.available && sv.panoId) {
    return {
      active: true,
      imageUrl: buildStreetViewUrl(sv.panoId, heading),
      liveMapMode: null,
      lat: resolvedLat,
      lng: resolvedLng,
      streetViewHeading: heading,
      blurPx,
      sourceMode: 'street_view',
      placeName,
      attributions: [],
      streetViewCopyright: sv.copyright || '© Google',
      streetViewReportUrl: sv.reportProblemLink || null,
      photoIndex: 0,
      photoCount: 0,
    };
  }

  if (hasCoords && !liveStreetViewUnavailable) {
    return {
      active: true,
      imageUrl: null,
      liveMapMode: 'street_view',
      lat: resolvedLat,
      lng: resolvedLng,
      streetViewHeading: heading,
      blurPx,
      sourceMode: 'street_view',
      placeName,
      attributions: [],
      streetViewCopyright: '© Google',
      streetViewReportUrl: null,
      photoIndex: 0,
      photoCount: 0,
    };
  }

  return empty;
}


