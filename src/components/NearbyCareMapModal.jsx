import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider, AdvancedMarker, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Star,
} from 'lucide-react';
import {
  fetchGoogleMapsBrowserKey,
  fetchNearbyCareShops,
} from '../services/mapsClientService.ts';
import { getStoredSelectedPlace } from '../services/stylingPreferenceStore.ts';
import {
  formatDistanceMeters,
  inferDefaultCareServiceType,
} from '../utils/garmentCareEngine.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const DEFAULT_SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

const CARE_SERVICE_TABS = [
  { key: 'dry_clean', ko: '드라이클리닝', en: 'Dry Cleaning' },
  { key: 'laundry', ko: '일반 세탁', en: 'Laundry' },
  { key: 'alteration', ko: '옷 수선', en: 'Alteration' },
  { key: 'leather_care', ko: '가죽·명품 케어', en: 'Leather Care' },
];

export default function NearbyCareMapModal({
  open,
  onClose,
  garment = null,
  initialServiceType = null,
  lang = 'ko',
}) {
  const defaultService = useMemo(
    () => initialServiceType || inferDefaultCareServiceType(garment),
    [initialServiceType, garment]
  );

  const [serviceType, setServiceType] = useState(defaultService);
  const [mapsApiKey, setMapsApiKey] = useState(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [center, setCenter] = useState(() => {
    const storedPlace = getStoredSelectedPlace();
    if (storedPlace) return { lat: storedPlace.lat, lng: storedPlace.lng };
    return DEFAULT_SEOUL_CENTER;
  });
  const [centerLabel, setCenterLabel] = useState(() => {
    const storedPlace = getStoredSelectedPlace();
    return storedPlace?.name || (lang === 'en' ? 'Seoul Center' : '서울 중심 기준');
  });
  const [locating, setLocating] = useState(false);
  const [shops, setShops] = useState([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setServiceType(defaultService);
  }, [open, defaultService]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setKeyLoading(true);
    fetchGoogleMapsBrowserKey()
      .then((key) => {
        if (!cancelled) {
          setMapsApiKey(key);
          setKeyLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapsApiKey(null);
          setKeyLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const loadShops = useCallback(
    async (coords, targetService) => {
      setLoadingShops(true);
      setErrorMsg('');
      try {
        const res = await fetchNearbyCareShops({
          lat: coords.lat,
          lng: coords.lng,
          serviceType: targetService,
          lang,
          radiusMeters: 3000,
        });
        setShops(res.shops || []);
        setSelectedShopId(res.shops?.[0]?.placeId || null);
      } catch (err) {
        setShops([]);
        setSelectedShopId(null);
        const msg = String(err?.message || '');
        if (msg === 'QUOTA_EXCEEDED') {
          setErrorMsg(
            tx(
              lang,
              'Google Maps 일일 할당량에 도달했습니다. 상단 안내 링크를 확인해 주세요.',
              'Google Maps daily quota reached. See the top notice for details.'
            )
          );
        } else {
          setErrorMsg(
            msg ||
              tx(
                lang,
                '주변 세탁·수선소 정보를 불러오지 못했습니다.',
                'Failed to load nearby garment care shops.'
              )
          );
        }
      } finally {
        setLoadingShops(false);
      }
    },
    [lang]
  );

  useEffect(() => {
    if (!open) return;
    void loadShops(center, serviceType);
  }, [open, center, serviceType, loadShops]);

  const handleUseCurrentLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg(
        tx(lang, '브라우저에서 현재 위치를 지원하지 않습니다.', 'Geolocation is not supported.')
      );
      return;
    }
    triggerHaptic('selection');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setCenter(next);
        setCenterLabel(tx(lang, '현재 내 위치 기준', 'Near Current Location'));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setErrorMsg(
          tx(
            lang,
            '위치 권한이 거부되어 기본 위치 기준으로 검색합니다.',
            'Location permission declined; using fallback area.'
          )
        );
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 180000 }
    );
  }, [lang]);

  const activeShop = useMemo(
    () => shops.find((s) => s.placeId === selectedShopId) || shops[0] || null,
    [shops, selectedShopId]
  );

  const mapCenter = activeShop
    ? { lat: activeShop.lat, lng: activeShop.lng }
    : center;

  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      title={tx(lang, '주변 세탁 · 수선소 찾기', 'Nearby Laundry & Tailors')}
      subtitle={
        garment?.name
          ? `${garment.name} · ${centerLabel}`
          : centerLabel
      }
      maxWidth={620}
    >
      <div className="space-y-4">
        {/* Service Filter Segmented Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/10 overflow-x-auto max-w-full"
            role="tablist"
            aria-label={tx(lang, '케어 서비스 선택', 'Select Care Service')}
          >
            {CARE_SERVICE_TABS.map((tab) => {
              const active = serviceType === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    triggerHaptic('selection');
                    setServiceType(tab.key);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {lang === 'en' ? tab.en : tab.ko}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {locating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <LocateFixed size={14} />
            )}
            <span>{tx(lang, '내 위치', 'My Location')}</span>
          </button>
        </div>

        {/* Interactive Google Map Container (explicit height to prevent 0x0 collapse) */}
        <div
          className="relative w-full rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900"
          style={{ height: 260 }}
        >
          {keyLoading ? (
            <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-neutral-500">
              <Loader2 size={16} className="animate-spin" />
              <span>{tx(lang, '지도를 준비하는 중…', 'Loading Google Maps…')}</span>
            </div>
          ) : mapsApiKey ? (
            <APIProvider
              apiKey={mapsApiKey}
              libraries={['marker']}
              language={lang === 'en' ? 'en' : 'ko'}
              region="KR"
            >
              <GoogleMap
                style={{ width: '100%', height: '100%' }}
                mapId="DEMO_MAP_ID"
                defaultZoom={14}
                center={mapCenter}
                gestureHandling="greedy"
                disableDefaultUI={false}
                streetViewControl={false}
                mapTypeControl={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                <AdvancedMarker
                  position={center}
                  title={centerLabel}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-neutral-900 dark:bg-white border-2 border-white dark:border-neutral-900 shadow-md"
                    aria-label={centerLabel}
                  />
                </AdvancedMarker>

                {shops.map((shop, idx) => {
                  const isSelected = activeShop?.placeId === shop.placeId;
                  return (
                    <AdvancedMarker
                      key={shop.placeId || `${shop.lat}-${shop.lng}-${idx}`}
                      position={{ lat: shop.lat, lng: shop.lng }}
                      title={shop.name}
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedShopId(shop.placeId);
                      }}
                    >
                      <Pin
                        background={isSelected ? '#111111' : '#52525B'}
                        borderColor={isSelected ? '#FFFFFF' : '#E4E4E7'}
                        glyphColor="#FFFFFF"
                        scale={isSelected ? 1.15 : 0.95}
                      />
                    </AdvancedMarker>
                  );
                })}
              </GoogleMap>
            </APIProvider>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-xs text-neutral-500 gap-1.5">
              <MapPin size={20} />
              <span>
                {tx(
                  lang,
                  'Google Maps API 키를 확인한 뒤 지도가 표시됩니다.',
                  'Google Maps will appear once the API key is configured.'
                )}
              </span>
            </div>
          )}
        </div>

        {/* Status / Error Feedback */}
        {errorMsg && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={15} className="shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => loadShops(center, serviceType)}
              className="min-h-[32px] px-2.5 rounded-lg bg-black/10 dark:bg-white/10 font-semibold whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <RefreshCw size={12} />
              <span>{tx(lang, '재시도', 'Retry')}</span>
            </button>
          </div>
        )}

        {/* Live Places Results List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 px-0.5 tabular-nums">
            <span>
              {loadingShops
                ? tx(lang, '주변 매장을 검색하는 중…', 'Searching nearby shops…')
                : tx(lang, `검색된 매장 ${shops.length}곳`, `${shops.length} places found`)}
            </span>
            <span>{tx(lang, '실시간 Google 지도 데이터', 'Live Google Maps data')}</span>
          </div>

          {loadingShops ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-neutral-500">
              <Loader2 size={16} className="animate-spin" />
              <span>{tx(lang, '거리순으로 불러오는 중…', 'Sorting by distance…')}</span>
            </div>
          ) : shops.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400 border border-black/8 dark:border-white/10 rounded-2xl">
              {tx(
                lang,
                '반경 3km 내 검색된 매장이 없습니다. 다른 서비스 탭을 선택해 보세요.',
                'No matching places found within 3km. Try another care category.'
              )}
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto divide-y divide-black/8 dark:divide-white/10 border border-black/10 dark:border-white/10 rounded-2xl">
              {shops.map((shop) => {
                const isSelected = activeShop?.placeId === shop.placeId;
                return (
                  <div
                    key={shop.placeId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedShopId(shop.placeId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedShopId(shop.placeId);
                      }
                    }}
                    className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-black/[0.04] dark:bg-white/[0.08]'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm font-semibold truncate">{shop.name}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {shop.address}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                        <span className="font-semibold">
                          {formatDistanceMeters(shop.distanceMeters)}
                        </span>
                        {shop.rating !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Star size={11} className="fill-current" />
                              {shop.rating.toFixed(1)}
                              {shop.userRatingCount > 0 ? ` (${shop.userRatingCount})` : ''}
                            </span>
                          </>
                        )}
                        {shop.openNow !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                shop.openNow
                                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  : 'text-neutral-500'
                              }
                            >
                              {shop.openNow
                                ? tx(lang, '영업 중', 'Open now')
                                : tx(lang, '영업 종료', 'Closed')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {shop.googleMapsUri && (
                      <a
                        href={shop.googleMapsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="min-h-[40px] px-3 rounded-xl border border-black/12 dark:border-white/15 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 hover:bg-neutral-900 hover:text-white dark:hover:bg-white dark:hover:text-neutral-950 transition-colors"
                      >
                        <Navigation size={12} />
                        <span>{tx(lang, '길찾기', 'Directions')}</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
