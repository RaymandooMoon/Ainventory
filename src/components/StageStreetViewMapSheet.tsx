import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, Loader2, MapPin, RotateCcw, RotateCw, X } from 'lucide-react';
import { fetchGoogleMapsBrowserKey } from '../services/mapsClientService.ts';
import {
  type StreetViewPanoQuality,
  probeEyeLevelStreetView,
} from '../services/streetViewProbeService.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

export interface StreetViewMapSelectionPayload {
  lat: number;
  lng: number;
  panoId: string;
  copyright: string | null;
  panoQuality: StreetViewPanoQuality;
}

export interface StageStreetViewMapSheetProps {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  initialLat?: number | null;
  initialLng?: number | null;
  placeName?: string;
  heading: number;
  panoQuality?: StreetViewPanoQuality | null;
  lang?: string;
  theme?: 'light' | 'dark';
  onSelectSpot: (spot: StreetViewMapSelectionPayload) => void;
  onChangeHeading: (nextHeading: number) => void;
  onResetSpot?: () => void;
  hasCustomSpot?: boolean;
}

function StreetViewCoverageOverlay({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps') as
    | { StreetViewCoverageLayer?: new () => { setMap: (m: unknown) => void } }
    | null;

  useEffect(() => {
    if (!enabled || !map || !mapsLib?.StreetViewCoverageLayer) return undefined;
    const layer = new mapsLib.StreetViewCoverageLayer();
    layer.setMap(map);
    return () => {
      layer.setMap(null);
    };
  }, [enabled, map, mapsLib]);

  return null;
}

function MapCenterSync({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const lastCenteredRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const prev = lastCenteredRef.current;
    if (
      prev &&
      Math.abs(prev.lat - lat) < 0.00001 &&
      Math.abs(prev.lng - lng) < 0.00001
    ) {
      return;
    }
    lastCenteredRef.current = { lat, lng };
    map.panTo({ lat, lng });
  }, [map, lat, lng]);

  return null;
}

function formatHeadingShort(deg: number, isEn: boolean): string {
  const normalized = ((Math.round(deg) % 360) + 360) % 360;
  const dirsKo = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const dirsEn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(normalized / 45) % 8;
  return `${isEn ? dirsEn[idx] : dirsKo[idx]} ${normalized}°`;
}

/**
 * Bottom-floating interactive Google Map location adjuster positioned cleanly at the lower
 * portion of the fitting stage so the user sees their standing avatar + real-place backdrop
 * live above while dragging/tapping blue Street View roads below.
 */
const StageStreetViewMapSheet = memo(function StageStreetViewMapSheet({
  open,
  onClose,
  lat,
  lng,
  initialLat = null,
  initialLng = null,
  placeName = '',
  heading = 0,
  panoQuality = null,
  lang = 'ko',
  theme = 'dark',
  onSelectSpot,
  onChangeHeading,
  onResetSpot,
  hasCustomSpot = false,
}: StageStreetViewMapSheetProps) {
  const isEn = lang === 'en';
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pinPos, setPinPos] = useState<{ lat: number; lng: number }>({ lat, lng });
  const [probing, setProbing] = useState(false);
  const [statusKind, setStatusKind] = useState<
    'idle' | 'ground_street' | 'user_photosphere' | 'missing'
  >(panoQuality === 'user_photosphere' ? 'user_photosphere' : 'ground_street');
  const probeSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    fetchGoogleMapsBrowserKey().then((key) => {
      if (active) setApiKey(key);
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPinPos({ lat, lng });
    }
  }, [lat, lng]);

  useEffect(() => {
    if (panoQuality === 'ground_street') {
      setStatusKind('ground_street');
    } else if (panoQuality === 'user_photosphere') {
      setStatusKind('user_photosphere');
    }
  }, [panoQuality]);

  const snapAndApplyCoord = useCallback(
    async (targetLat: number, targetLng: number) => {
      if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;
      const reqId = ++probeSeqRef.current;
      setPinPos({ lat: targetLat, lng: targetLng });
      setProbing(true);

      const result = await probeEyeLevelStreetView(targetLat, targetLng, {
        primaryRadius: 45,
        expandedRadius: 120,
        preferGroundStreet: true,
      });

      if (probeSeqRef.current !== reqId) return;
      setProbing(false);

      if (result.available && result.panoId) {
        const snappedLat = result.snappedLat ?? targetLat;
        const snappedLng = result.snappedLng ?? targetLng;
        const quality: StreetViewPanoQuality = result.panoQuality || 'ground_street';
        setPinPos({ lat: snappedLat, lng: snappedLng });
        setStatusKind(quality === 'user_photosphere' ? 'user_photosphere' : 'ground_street');
        triggerHaptic('selection');
        onSelectSpot({
          lat: snappedLat,
          lng: snappedLng,
          panoId: result.panoId,
          copyright: result.copyright,
          panoQuality: quality,
        });
      } else {
        setStatusKind('missing');
        triggerHaptic('warning');
      }
    },
    [onSelectSpot]
  );

  if (!open || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const normalizedHeading = ((Math.round(heading) % 360) + 360) % 360;
  const statusCopy = probing
    ? tx(lang, '도로 거리뷰 찾는 중…', 'Snapping to street…')
    : statusKind === 'missing'
      ? tx(lang, '거리뷰 없음 · 파란 도로를 탭하세요', 'No Street View · tap a blue road')
      : statusKind === 'user_photosphere'
        ? tx(
            lang,
            '360° 포토스피어 · 파란 도로 탭 권장',
            '360° Photo · tap a blue street line'
          )
        : tx(lang, '지상 눈높이 도로 스냅됨', 'Snapped to ground street');

  const canReset =
    hasCustomSpot &&
    typeof onResetSpot === 'function' &&
    typeof initialLat === 'number' &&
    typeof initialLng === 'number';

  return (
    <section
      className={`studio-sv-map-sheet ${theme === 'light' ? 'is-light' : 'is-dark'}`.trim()}
      data-stage-sv-map-sheet="true"
      aria-label={tx(lang, '구글 맵 배경 위치 조절', 'Google Maps backdrop position adjuster')}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Compact Header: Location Status + 45° Camera Rotation + Close */}
      <header className="studio-sv-map-sheet-head">
        <div className="studio-sv-map-sheet-title-wrap">
          <span
            className={`studio-sv-map-status-dot is-${
              probing ? 'probing' : statusKind
            }`.trim()}
            aria-hidden="true"
          />
          <div className="studio-sv-map-sheet-title-copy">
            <strong className="studio-sv-map-sheet-place">
              {placeName || tx(lang, '실제 장소 위치', 'Street Position')}
            </strong>
            <span className="studio-sv-map-sheet-status">{statusCopy}</span>
          </div>
        </div>

        <div className="studio-sv-map-sheet-controls">
          <div
            className="studio-sv-map-heading-group"
            role="group"
            aria-label={tx(lang, '카메라 시선 회전', 'Rotate camera heading')}
          >
            <button
              type="button"
              className="studio-sv-map-icon-btn"
              data-map-heading-ccw="true"
              aria-label={tx(lang, '시선 왼쪽 45도 회전', 'Rotate heading 45° left')}
              title={tx(lang, '왼쪽 45°', 'Rotate left 45°')}
              onClick={() => {
                triggerHaptic('selection');
                onChangeHeading((normalizedHeading + 315) % 360);
              }}
            >
              <RotateCcw size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <span className="studio-sv-map-heading-readout tabular-nums">
              <Compass size={11} aria-hidden="true" />
              <span>{formatHeadingShort(normalizedHeading, isEn)}</span>
            </span>
            <button
              type="button"
              className="studio-sv-map-icon-btn"
              data-map-heading-cw="true"
              aria-label={tx(lang, '시선 오른쪽 45도 회전', 'Rotate heading 45° right')}
              title={tx(lang, '오른쪽 45°', 'Rotate right 45°')}
              onClick={() => {
                triggerHaptic('selection');
                onChangeHeading((normalizedHeading + 45) % 360);
              }}
            >
              <RotateCw size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="studio-sv-map-close-btn"
            data-stage-sv-map-close="true"
            aria-label={tx(lang, '지도 닫기', 'Close map adjuster')}
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
          >
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Interactive Google Map with Native Blue Street View Road Coverage Layer */}
      <div className="studio-sv-map-canvas-wrap">
        {apiKey ? (
          <APIProvider
            apiKey={apiKey}
            language={isEn ? 'en' : 'ko'}
            region="KR"
            libraries={['maps', 'marker', 'streetView']}
          >
            <GoogleMap
              defaultCenter={{ lat: pinPos.lat, lng: pinPos.lng }}
              defaultZoom={17}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              gestureHandling="greedy"
              disableDefaultUI={true}
              zoomControl={true}
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={false}
              clickableIcons={false}
              style={{ width: '100%', height: '100%' }}
              onClick={(ev) => {
                const ll = ev.detail?.latLng;
                if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
                  void snapAndApplyCoord(ll.lat, ll.lng);
                }
              }}
            >
              <StreetViewCoverageOverlay enabled={true} />
              <MapCenterSync lat={pinPos.lat} lng={pinPos.lng} />

              <AdvancedMarker
                position={pinPos}
                draggable={true}
                title={tx(lang, '드래그해 서 있는 위치 조절', 'Drag to adjust standing position')}
                onDragEnd={(ev) => {
                  const pos = ev.latLng;
                  if (!pos) return;
                  const nextLat = typeof pos.lat === 'function' ? pos.lat() : Number(pos.lat);
                  const nextLng = typeof pos.lng === 'function' ? pos.lng() : Number(pos.lng);
                  if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
                    void snapAndApplyCoord(nextLat, nextLng);
                  }
                }}
              >
                <div className="studio-sv-map-pin" aria-hidden="true">
                  <span
                    className="studio-sv-map-pin-cone"
                    style={{ transform: `translate(-50%, -50%) rotate(${normalizedHeading}deg)` }}
                  />
                  <span className="studio-sv-map-pin-dot" />
                </div>
              </AdvancedMarker>
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="studio-sv-map-loading">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span>{tx(lang, '구글 맵을 불러오는 중…', 'Loading Google Map…')}</span>
          </div>
        )}
      </div>

      {/* Bottom Tip Strip + Optional Reset to Original Place */}
      <footer className="studio-sv-map-sheet-foot">
        <span className="studio-sv-map-foot-hint">
          <MapPin size={11} strokeWidth={2.2} aria-hidden="true" />
          <span>
            {tx(
              lang,
              '파란 도로를 탭하거나 핀을 드래그해 서 있는 위치를 맞추세요',
              'Tap any blue street or drag the pin to stand on ground level'
            )}
          </span>
        </span>
        {canReset && (
          <button
            type="button"
            className="studio-sv-map-reset-btn"
            data-stage-sv-map-reset="true"
            onClick={() => {
              triggerHaptic('selection');
              onResetSpot?.();
            }}
          >
            {tx(lang, '원위치', 'Reset')}
          </button>
        )}
      </footer>
    </section>
  );
});

export default StageStreetViewMapSheet;
