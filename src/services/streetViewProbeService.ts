import {
  fetchGoogleMapsBrowserKey,
  type PlaceSearchCandidate,
} from './mapsClientService.ts';

export type StreetViewPanoQuality = 'ground_street' | 'user_photosphere' | 'none';

export interface StreetViewProbeResult {
  available: boolean;
  panoId: string | null;
  snappedLat: number | null;
  snappedLng: number | null;
  copyright: string | null;
  source: 'outdoor' | 'none';
  panoQuality?: StreetViewPanoQuality;
}

/**
 * Distinguishes official Google ground-level Street View car/trekker panoramas from
 * third-party user-uploaded 360° photospheres (which are frequently captured from
 * rooftops, balconies, elevated decks, or drones and make the avatar appear floating).
 */
export function classifyStreetViewPano({
  panoId,
  copyright,
  linksCount,
}: {
  panoId?: string | null;
  copyright?: string | null;
  linksCount?: number | null;
}): StreetViewPanoQuality {
  const id = String(panoId || '').trim();
  if (!id) return 'none';

  // User-contributed photospheres use long base64-like IDs prefixed with CAoS / CIHM / AF1Qip
  const isUgcPanoId = /^(CAoS|CIHM|AF1Qip)/i.test(id) || id.length > 34;
  if (isUgcPanoId) return 'user_photosphere';

  const copy = String(copyright || '').trim();
  if (copy && !/google/i.test(copy)) {
    return 'user_photosphere';
  }

  // Connected ground-level road panoramas carry navigation links to adjacent street nodes;
  // isolated rooftop/balcony/drone photospheres have 0 street links.
  if (typeof linksCount === 'number' && Number.isFinite(linksCount) && linksCount === 0) {
    return 'user_photosphere';
  }

  return 'ground_street';
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
        links?: Array<unknown>;
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

function getCacheKey(lat: number, lng: number, radius: number, preferGround: boolean): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}:${Math.round(radius)}:${preferGround ? 'g' : 'a'}`;
}

/**
 * Pure coordinate-based outdoor eye-level Street View verifier.
 * Strictly uses `StreetViewSource.OUTDOOR` and prefers official connected ground-level
 * Google street panoramas (`panoQuality === 'ground_street'`) over isolated user-uploaded
 * rooftop/balcony/drone photospheres so the avatar stands naturally on real streets.
 */
export async function probeEyeLevelStreetView(
  lat: number,
  lng: number,
  options: {
    primaryRadius?: number;
    expandedRadius?: number;
    preferGroundStreet?: boolean;
  } = {}
): Promise<StreetViewProbeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      available: false,
      panoId: null,
      snappedLat: null,
      snappedLng: null,
      copyright: null,
      source: 'none',
      panoQuality: 'none',
    };
  }

  const primaryRadius = Math.max(25, Math.min(400, Math.round(options.primaryRadius ?? 120)));
  const expandedRadius = Math.max(
    primaryRadius,
    Math.min(500, Math.round(options.expandedRadius ?? 260))
  );
  const preferGroundStreet = options.preferGroundStreet !== false;
  const cacheKey = getCacheKey(lat, lng, expandedRadius, preferGroundStreet);
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
      panoQuality: 'none',
    };
  }

  if (!sharedSvService) {
    sharedSvService = new maps.StreetViewService();
  }
  const sv = sharedSvService;
  const okStatus = maps.StreetViewStatus?.OK ?? 'OK';
  const outdoorSource = maps.StreetViewSource?.OUTDOOR ?? 'outdoor';
  const nearestPref = maps.StreetViewPreference?.NEAREST ?? 'nearest';

  const runQueryAt = (qLat: number, qLng: number, radius: number) =>
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
            location: { lat: qLat, lng: qLng },
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
                  : qLat;
              const sLng =
                typeof data?.location?.latLng?.lng === 'function'
                  ? data.location.latLng.lng()
                  : qLng;
              const copyright = String(data?.copyright || '© Google').trim() || '© Google';
              const linksCount = Array.isArray(data?.links) ? data.links.length : null;
              const panoQuality = classifyStreetViewPano({ panoId, copyright, linksCount });
              resolve({
                available: true,
                panoId,
                snappedLat: Number.isFinite(sLat) ? sLat : qLat,
                snappedLng: Number.isFinite(sLng) ? sLng : qLng,
                copyright,
                source: 'outdoor',
                panoQuality,
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

  let found = await runQueryAt(lat, lng, primaryRadius);
  if (!found && expandedRadius > primaryRadius) {
    found = await runQueryAt(lat, lng, expandedRadius);
  }

  // If the nearest outdoor hit is an elevated/isolated user photosphere, probe 4 nearby street
  // offsets (~42m N/S/E/W) in parallel to lock onto a true connected ground-level street camera.
  if (preferGroundStreet && found && found.panoQuality === 'user_photosphere') {
    const delta = 0.00038;
    const offsetCandidates = await Promise.all([
      runQueryAt(lat + delta, lng, 90),
      runQueryAt(lat - delta, lng, 90),
      runQueryAt(lat, lng + delta, 90),
      runQueryAt(lat, lng - delta, 90),
    ]);
    const groundMatch = offsetCandidates.find(
      (item) => item && item.available && item.panoQuality === 'ground_street'
    );
    if (groundMatch) {
      found = groundMatch;
    }
  }

  const result: StreetViewProbeResult = found ?? {
    available: false,
    panoId: null,
    snappedLat: null,
    snappedLng: null,
    copyright: null,
    source: 'none',
    panoQuality: 'none',
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
