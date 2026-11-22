import {
  fetchGoogleMapsBrowserKey,
  type PlaceSearchCandidate,
} from './mapsClientService.ts';

export interface StreetViewProbeResult {
  available: boolean;
  panoId: string | null;
  snappedLat: number | null;
  snappedLng: number | null;
  copyright: string | null;
  source: 'outdoor' | 'none';
}

interface GoogleStreetViewServiceLike {
  getPanorama: (
    request: {
      location: { lat: number; lng: number };
      radius: number;
      source?: unknown;
      preference?: unknown;
    },
    callback: (
      data: {
        location?: {
          pano?: string;
          latLng?: { lat: () => number; lng: () => number };
        };
        copyright?: string;
      } | null,
      status: string
    ) => void
  ) => void;
}

interface GoogleMapsStreetViewGlobal {
  StreetViewService?: new () => GoogleStreetViewServiceLike;
  StreetViewSource?: { OUTDOOR?: unknown };
  StreetViewPreference?: { NEAREST?: unknown };
  StreetViewStatus?: { OK?: string };
}

const probeCache = new Map<string, StreetViewProbeResult>();
let mapsJsLoadPromise: Promise<GoogleMapsStreetViewGlobal | null> | null = null;
let sharedSvService: GoogleStreetViewServiceLike | null = null;

function getWindowGoogleMaps(): GoogleMapsStreetViewGlobal | null {
  if (typeof window === 'undefined') return null;
  const g = (window as unknown as { google?: { maps?: GoogleMapsStreetViewGlobal } }).google;
  return g?.maps?.StreetViewService ? g.maps : null;
}

async function ensureStreetViewLibrary(): Promise<GoogleMapsStreetViewGlobal | null> {
  const existing = getWindowGoogleMaps();
  if (existing) return existing;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  if (!mapsJsLoadPromise) {
    mapsJsLoadPromise = (async () => {
      const apiKey = await fetchGoogleMapsBrowserKey();
      if (!apiKey) return null;

      // Re-check in case @vis.gl/react-google-maps already finished loading while awaiting key
      const loadedNow = getWindowGoogleMaps();
      if (loadedNow) return loadedNow;

      return new Promise<GoogleMapsStreetViewGlobal | null>((resolve) => {
        const existingScript = document.querySelector<HTMLScriptElement>(
          'script[src*="maps.googleapis.com/maps/api/js"]'
        );
        if (existingScript) {
          let attempts = 0;
          const poll = window.setInterval(() => {
            attempts += 1;
            const maps = getWindowGoogleMaps();
            if (maps) {
              window.clearInterval(poll);
              resolve(maps);
            } else if (attempts >= 40) {
              window.clearInterval(poll);
              resolve(null);
            }
          }, 125);
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          apiKey
        )}&libraries=streetView&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          resolve(getWindowGoogleMaps());
        };
        script.onerror = () => {
          mapsJsLoadPromise = null;
          resolve(null);
        };
        document.head.appendChild(script);
      });
    })();
  }

  return mapsJsLoadPromise;
}

function getCacheKey(lat: number, lng: number, radius: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}:${Math.round(radius)}`;
}

/**
 * Pure coordinate-based outdoor eye-level Street View verifier.
 * Strictly uses `StreetViewSource.OUTDOOR` so indoor malls, rooftops, and 3rd-floor user photospheres
 * are never falsely marked as ground-level eye-level street views.
 */
export async function probeEyeLevelStreetView(
  lat: number,
  lng: number,
  options: { primaryRadius?: number; expandedRadius?: number } = {}
): Promise<StreetViewProbeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      available: false,
      panoId: null,
      snappedLat: null,
      snappedLng: null,
      copyright: null,
      source: 'none',
    };
  }

  const primaryRadius = Math.max(50, Math.min(400, Math.round(options.primaryRadius ?? 160)));
  const expandedRadius = Math.max(
    primaryRadius,
    Math.min(500, Math.round(options.expandedRadius ?? 320))
  );
  const cacheKey = getCacheKey(lat, lng, expandedRadius);
  const cached = probeCache.get(cacheKey);
  if (cached) return cached;

  const maps = await ensureStreetViewLibrary();
  if (!maps?.StreetViewService) {
    return {
      available: false,
      panoId: null,
      snappedLat: null,
      snappedLng: null,
      copyright: null,
      source: 'none',
    };
  }

  if (!sharedSvService) {
    sharedSvService = new maps.StreetViewService();
  }
  const sv = sharedSvService;
  const okStatus = maps.StreetViewStatus?.OK ?? 'OK';
  const outdoorSource = maps.StreetViewSource?.OUTDOOR ?? 'outdoor';
  const nearestPref = maps.StreetViewPreference?.NEAREST ?? 'nearest';

  const runQuery = (radius: number) =>
    new Promise<StreetViewProbeResult | null>((resolve) => {
      let settled = false;
      const timer =
        typeof window !== 'undefined'
          ? window.setTimeout(() => {
              if (!settled) {
                settled = true;
                resolve(null);
              }
            }, 3500)
          : null;

      try {
        sv.getPanorama(
          {
            location: { lat, lng },
            radius,
            source: outdoorSource,
            preference: nearestPref,
          },
          (data, status) => {
            if (settled) return;
            settled = true;
            if (timer !== null) window.clearTimeout(timer);
            const panoId = typeof data?.location?.pano === 'string' ? data.location.pano.trim() : '';
            if (status === okStatus && panoId) {
              const sLat =
                typeof data?.location?.latLng?.lat === 'function'
                  ? data.location.latLng.lat()
                  : lat;
              const sLng =
                typeof data?.location?.latLng?.lng === 'function'
                  ? data.location.latLng.lng()
                  : lng;
              resolve({
                available: true,
                panoId,
                snappedLat: Number.isFinite(sLat) ? sLat : lat,
                snappedLng: Number.isFinite(sLng) ? sLng : lng,
                copyright: String(data?.copyright || '© Google').trim() || '© Google',
                source: 'outdoor',
              });
            } else {
              resolve(null);
            }
          }
        );
      } catch {
        if (!settled) {
          settled = true;
          if (timer !== null) window.clearTimeout(timer);
          resolve(null);
        }
      }
    });

  let found = await runQuery(primaryRadius);
  if (!found && expandedRadius > primaryRadius) {
    found = await runQuery(expandedRadius);
  }

  const result: StreetViewProbeResult = found ?? {
    available: false,
    panoId: null,
    snappedLat: null,
    snappedLng: null,
    copyright: null,
    source: 'none',
  };

  if (probeCache.size > 200) {
    probeCache.clear();
  }
  probeCache.set(cacheKey, result);
  return result;
}

/**
 * Pure filter helper (testable with a custom probe function) that enriches PlaceSearchCandidates
 * with real-time outdoor eye-level Street View availability and returns only supported locations
 * when `onlySupported` is true.
 */
export async function filterPlacesByEyeLevelStreetView(
  candidates: PlaceSearchCandidate[],
  options: {
    onlySupported?: boolean;
    probeFn?: (lat: number, lng: number) => Promise<StreetViewProbeResult>;
  } = {}
): Promise<{
  places: PlaceSearchCandidate[];
  totalChecked: number;
  filteredOutCount: number;
}> {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) {
    return { places: [], totalChecked: 0, filteredOutCount: 0 };
  }

  const probe = options.probeFn ?? ((lat: number, lng: number) => probeEyeLevelStreetView(lat, lng));
  const onlySupported = options.onlySupported !== false;

  const enriched = await Promise.all(
    list.map(async (item) => {
      const sv = await probe(item.lat, item.lng);
      return {
        ...item,
        streetViewAvailable: sv.available,
        streetViewPanoId: sv.panoId,
        streetViewLat: sv.snappedLat,
        streetViewLng: sv.snappedLng,
        streetViewCopyright: sv.copyright,
      };
    })
  );

  const supported = enriched.filter((p) => p.streetViewAvailable);
  return {
    places: onlySupported ? supported : enriched,
    totalChecked: enriched.length,
    filteredOutCount: enriched.length - supported.length,
  };
}
