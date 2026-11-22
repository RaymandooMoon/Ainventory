import { memo, useEffect, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { fetchGoogleMapsBrowserKey } from '../services/mapsClientService.ts';

export interface MapsLiveBackdropStatus {
  available: boolean;
  copyright: string | null;
  authFailed?: boolean;
  billingError?: boolean;
}

export interface MapsLiveBackdropLayerProps {
  lat: number;
  lng: number;
  panoId?: string | null;
  heading?: number;
  blurPx: number;
  theme?: 'light' | 'dark';
  onStatusChange?: (status: MapsLiveBackdropStatus) => void;
}

interface StreetViewPanoramaHandle {
  setPano: (pano: string) => void;
  setPov: (pov: { heading: number; pitch: number }) => void;
  setZoom?: (zoom: number) => void;
}

interface StreetViewPanoramaResult {
  location?: { pano?: string };
  copyright?: string;
}

function EyeLevelStreetViewCanvas({
  lat,
  lng,
  panoId = null,
  heading = 0,
  onStatusChange,
}: {
  lat: number;
  lng: number;
  panoId?: string | null;
  heading: number;
  onStatusChange?: (status: MapsLiveBackdropStatus) => void;
}) {
  const streetViewLib = useMapsLibrary('streetView') as
    | {
        StreetViewService: new () => {
          getPanorama: (
            req: {
              location: { lat: number; lng: number };
              radius: number;
              source?: unknown;
              preference?: unknown;
            },
            cb: (data: StreetViewPanoramaResult | null, status: string) => void
          ) => void;
        };
        StreetViewPanorama: new (
          el: HTMLElement,
          opts: Record<string, unknown>
        ) => StreetViewPanoramaHandle;
        StreetViewSource?: { OUTDOOR?: unknown };
        StreetViewPreference?: { NEAREST?: unknown };
        StreetViewStatus?: { OK?: string };
      }
    | null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<StreetViewPanoramaHandle | null>(null);
  const onStatusRef = useRef(onStatusChange);
  const [ready, setReady] = useState(false);
  const [hasErrorOverlay, setHasErrorOverlay] = useState(false);

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  // Guard: immediately detect & hide Google's built-in "This page can't load Google Maps correctly" dialog
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    const inspect = () => {
      const text = el.textContent || '';
      const hasBillingDialog = Boolean(
        el.querySelector('.dismissButton') ||
          /can['’]t load Google Maps|Do you own this website|enable Billing/i.test(text)
      );
      const hasFatalErr = Boolean(el.querySelector('.gm-err-container, .gm-err-title'));
      if (hasBillingDialog || hasFatalErr) {
        setHasErrorOverlay(true);
        setReady(false);
        onStatusRef.current?.({
          available: false,
          copyright: null,
          authFailed: true,
          billingError: hasBillingDialog || hasFatalErr,
        });
      }
    };
    const obs = new MutationObserver(inspect);
    obs.observe(el, { childList: true, subtree: true });
    inspect();
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!streetViewLib || !containerRef.current || hasErrorOverlay) return undefined;
    let cancelled = false;

    const mountPanorama = (resolvedPanoId: string, copyrightText: string) => {
      if (cancelled || !containerRef.current) return;
      // 1:1 human-scale street-portrait telephoto calibration (~85mm full-frame equivalent):
      // zoom 2.5 brings nearby street sedans & 1st-floor storefronts up to natural chest/waist scale next to the avatar;
      // pitch -2° aligns road/sidewalk perspective cleanly beneath the character's shoes
      const pov = { heading, pitch: -2 };
      if (!panoramaRef.current) {
        panoramaRef.current = new streetViewLib.StreetViewPanorama(containerRef.current, {
          pano: resolvedPanoId,
          pov,
          zoom: 2.5,
          disableDefaultUI: true,
          clickToGo: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          addressControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          scrollwheel: false,
          showRoadLabels: false,
          enableCloseButton: false,
        });
      } else {
        panoramaRef.current.setPano(resolvedPanoId);
        panoramaRef.current.setPov(pov);
        panoramaRef.current.setZoom?.(2.5);
      }
      setReady(true);
      onStatusRef.current?.({
        available: true,
        copyright: copyrightText || '© Google',
        authFailed: false,
      });
    };

    const trimmedPano = typeof panoId === 'string' ? panoId.trim() : '';
    if (trimmedPano) {
      mountPanorama(trimmedPano, '© Google');
      return () => {
        cancelled = true;
      };
    }

    const svService = new streetViewLib.StreetViewService();
    const okStatus = streetViewLib.StreetViewStatus?.OK ?? 'OK';

    // Strictly request OUTDOOR ground-level street cameras (rejects 3rd-floor balcony/rooftop/indoor user photospheres)
    const queryOutdoorStreet = (radius: number, canExpand: boolean) => {
      svService.getPanorama(
        {
          location: { lat, lng },
          radius,
          source: streetViewLib.StreetViewSource?.OUTDOOR ?? 'outdoor',
          preference: streetViewLib.StreetViewPreference?.NEAREST ?? 'nearest',
        },
        (data: StreetViewPanoramaResult | null, status: string) => {
          if (cancelled) return;
          if (status === okStatus && data?.location?.pano && containerRef.current) {
            mountPanorama(data.location.pano, data.copyright || '© Google');
          } else if (canExpand) {
            queryOutdoorStreet(320, false);
          } else {
            setReady(false);
            onStatusRef.current?.({ available: false, copyright: null, authFailed: false });
          }
        }
      );
    };

    queryOutdoorStreet(160, true);
    return () => {
      cancelled = true;
    };
  }, [streetViewLib, lat, lng, panoId, heading, hasErrorOverlay]);

  useEffect(() => {
    if (panoramaRef.current && ready && !hasErrorOverlay) {
      panoramaRef.current.setPov({ heading, pitch: -2 });
    }
  }, [heading, ready, hasErrorOverlay]);

  if (hasErrorOverlay) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.24s ease',
      }}
    />
  );
}

/**
 * Eye-Level Grounded Google Maps Street View Backdrop Layer.
 * - Strictly uses OUTDOOR ground-level street cameras (never top-down satellite roofs or 3rd-floor photospheres)
 * - Calibrated pitch (-8°) & wide FOV (zoom 0.25) with a perspective-matched grounded sidewalk floor plane
 *   so the full-body avatar stands naturally on the ground at 1:1 human scale
 * - Automatically detects & suppresses Google Maps auth/error overlays and falls back cleanly to the studio room
 */
const MapsLiveBackdropLayer = memo(function MapsLiveBackdropLayer({
  lat,
  lng,
  panoId = null,
  heading = 0,
  blurPx,
  theme = 'light',
  onStatusChange,
}: MapsLiveBackdropLayerProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [domErrorDetected, setDomErrorDetected] = useState(false);
  const [svVisible, setSvVisible] = useState(false);

  useEffect(() => {
    let active = true;
    fetchGoogleMapsBrowserKey().then((key) => {
      if (active) setApiKey(key);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleStatus = (status: MapsLiveBackdropStatus) => {
    if (status.authFailed || status.billingError) {
      setDomErrorDetected(true);
    } else if (status.available) {
      setDomErrorDetected(false);
    }
    setSvVisible(Boolean(status.available && !status.authFailed && !status.billingError));
    onStatusChange?.(status);
  };

  if (domErrorDetected || !apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const safeBlur = Math.max(0, Math.min(24, Math.round(Number(blurPx) || 0)));
  const scaleFactor = 1.05 + (safeBlur / 24) * 0.08;
  const isDark = theme === 'dark';

  return (
    <div
      className="atelier-place-backdrop-layer is-live-streetview"
      data-place-backdrop-active={svVisible ? 'true' : 'false'}
      data-place-backdrop-source="street_view"
      data-place-backdrop-blur={String(safeBlur)}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: svVisible ? 1 : 0,
        transition: 'opacity 0.24s ease',
      }}
    >
      {/* 1:1 eye-level street vista shifted slightly upward so horizon (~44%) matches standing portrait framing */}
      <div
        style={{
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '-10%',
          height: '108%',
          filter: `blur(${safeBlur}px) saturate(${isDark ? 0.9 : 0.95}) contrast(1.02)`,
          transform: `scale(${scaleFactor.toFixed(3)})`,
          transformOrigin: '50% 62%',
          transition: 'filter 0.14s ease-out, transform 0.18s ease-out',
          willChange: 'filter, transform',
        }}
      >
        <APIProvider apiKey={apiKey} libraries={['streetView']}>
          <EyeLevelStreetViewCanvas
            lat={lat}
            lng={lng}
            panoId={panoId}
            heading={heading}
            onStatusChange={handleStatus}
          />
        </APIProvider>
      </div>

      {/* Perspective-matched grounded sidewalk / plaza floor deck aligned to avatar shoe soles (~85.5%) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'linear-gradient(180deg, rgba(12,14,18,0.28) 0%, rgba(12,14,18,0.03) 34%, rgba(18,20,24,0.08) 70%, rgba(22,24,30,0.48) 86%, rgba(16,18,22,0.72) 100%)'
            : 'linear-gradient(180deg, rgba(15,18,24,0.18) 0%, rgba(255,255,255,0.02) 34%, rgba(225,227,232,0.08) 70%, rgba(222,224,230,0.48) 86%, rgba(208,211,218,0.7) 100%)',
        }}
      />

      {/* Soft grounded ambient floor bounce right under the character's shoes (no hard horizon seam) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '24%',
          background: isDark
            ? 'radial-gradient(ellipse 88% 65% at 50% 42%, rgba(255,255,255,0.05) 0%, rgba(18,20,25,0.2) 65%, rgba(10,11,14,0.46) 100%)'
            : 'radial-gradient(ellipse 88% 65% at 50% 42%, rgba(255,255,255,0.42) 0%, rgba(210,213,220,0.22) 65%, rgba(175,179,188,0.36) 100%)',
        }}
      />
    </div>
  );
});

export default MapsLiveBackdropLayer;
