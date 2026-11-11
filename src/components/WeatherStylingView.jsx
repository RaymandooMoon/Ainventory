import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, MapPin, Navigation, Plus, Sparkles } from 'lucide-react';
import { CITY_COORDS, apiFetch } from '../utils/api.js';
import { triggerHaptic } from '../utils/nativeBridge.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import VirtualMannequin from './VirtualMannequin.jsx';
import { ResponsiveSheetModal, SkeletonShimmer } from './common/AppUI.jsx';

/**
 * Apple HIG 3D Studio & Weather-Linked AI Styling View (Reqs 7.b, 8.a, 12.a, 12.b)
 * - Leaves 85%+ of viewport clear for the 3D mannequin
 * - Stows live weather location selector & AI outfit recommendations inside a spring Bottom Sheet
 */
export default function WeatherStylingView({
  activeCloset,
  user,
  refreshKey = 0,
  onNavigateWardrobe,
  onOpenProfileModal,
  onOpenAccountSettings,
  onOpenSampleImport,
  onClosetUpdated,
  showToast,
}) {
  const [cityKey, setCityKey] = useState('seoul');
  const [customGeo, setCustomGeo] = useState(null);
  const [locating, setLocating] = useState(false);
  const [data, setData] = useState(null);
  const [closetGarments, setClosetGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [slotOverrides, setSlotOverrides] = useState({});
  const [weatherSheetOpen, setWeatherSheetOpen] = useState(false);

  const selectedCity = CITY_COORDS.find((c) => c.key === cityKey) || CITY_COORDS[0];

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        city: selectedCity.key,
        closet: activeCloset,
      });
      if (customGeo) {
        params.set('lat', String(customGeo.lat));
        params.set('lon', String(customGeo.lon));
        params.set('location_label', customGeo.name);
      }
      const [recRes, garRes] = await Promise.all([
        apiFetch(`/weather/recommendations?${params.toString()}`),
        apiFetch(`/garments?closet=${encodeURIComponent(activeCloset)}`),
      ]);
      setData(recRes);
      setClosetGarments(garRes.garments || []);
      setSelectedIdx(0);
      setSlotOverrides({});
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCloset, customGeo, selectedCity.key, showToast]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations, refreshKey]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      showToast?.('현재 기기에서 위치 정보를 사용할 수 없습니다');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCustomGeo({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          name: '현재 위치',
        });
        triggerHaptic('light');
      },
      () => {
        setLocating(false);
        showToast?.('위치 접근이 거부되어 기본 도시 기상을 유지합니다');
      },
      { timeout: 6000 }
    );
  };

  const recs = useMemo(() => data?.recommendations || [], [data]);
  const baseRec = recs[selectedIdx] || recs[0] || null;

  const normalizedWeather = useMemo(() => {
    if (!data?.weather) return null;
    const w = data.weather;
    return {
      ...w,
      city: w.city || w.cityName || selectedCity.name,
      tempC: w.tempC ?? w.avgTemp ?? w.tempMax ?? 14,
      stylingTip: w.stylingTip || w.weatherTip || '',
    };
  }, [data, selectedCity.name]);

  const activeOutfit = useMemo(() => {
    if (!baseRec) {
      // Even when closet has only 1–2 newly added garments, build a live outfit from closetGarments
      const fallbackItems = [];
      const seen = new Set();
      for (const g of closetGarments) {
        const key = g.slot_key || g.category;
        if (!seen.has(key) && slotOverrides[key] !== null) {
          seen.add(key);
          fallbackItems.push(slotOverrides[key] || g);
        }
      }
      for (const [slotKey, item] of Object.entries(slotOverrides)) {
        if (item && !seen.has(slotKey)) fallbackItems.push(item);
      }
      return { title: '내 옷장 피팅', name: '내 옷장 피팅', items: fallbackItems };
    }

    const baseByCat = {};
    for (const item of baseRec.items || []) {
      const cat = item.slot_key || item.category;
      if (!baseByCat[cat]) baseByCat[cat] = item;
    }
    const mergedMap = { ...baseByCat };
    for (const [slotKey, overrideVal] of Object.entries(slotOverrides)) {
      if (overrideVal === null) {
        delete mergedMap[slotKey];
      } else if (overrideVal) {
        mergedMap[slotKey] = overrideVal;
      }
    }
    return { ...baseRec, items: Object.values(mergedMap) };
  }, [baseRec, closetGarments, slotOverrides]);

  const handleLogCurrentOutfit = async () => {
    if (!activeOutfit?.items?.length) {
      showToast?.('착용 중인 의류가 없습니다');
      return;
    }
    try {
      const targetOwner =
        activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
      const itemIds = activeOutfit.items.map((i) => i.id);
      const cityStr = normalizedWeather?.city || '서울';
      const tempVal = normalizedWeather?.tempC ?? 14;
      const condStr = normalizedWeather?.condition || '맑음';

      const outfitRes = await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          title: activeOutfit.title || activeOutfit.name || `${cityStr} OOTD`,
          occasion: '데일리',
          season: '사계절',
          item_ids: itemIds,
          memo: `${cityStr} ${tempVal}°C`,
        }),
      });
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          worn_date: new Date().toISOString().slice(0, 10),
          outfit_id: outfitRes.id || outfitRes.outfit?.id || null,
          item_ids: itemIds,
          status: 'worn',
          weather_summary: `${cityStr} ${condStr} ${tempVal}°C`,
          temp_c: tempVal,
        }),
      });
      onClosetUpdated?.();
      showToast?.('오늘의 OOTD 캘린더에 기록되었습니다');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  if (loading && !data) {
    return (
      <div className="hig-studio-screen" style={{ padding: 24 }}>
        <SkeletonShimmer
          height={36}
          width={160}
          radius={999}
          style={{ margin: '0 auto 20px' }}
        />
        <SkeletonShimmer height="calc(100% - 96px)" width="100%" radius={24} />
      </div>
    );
  }

  const isClosetEmpty =
    !user?.isSampleDemo && (data?.isClosetEmpty || closetGarments.length === 0);

  const emptyClosetCard = isClosetEmpty ? (
    <div
      id="studio-empty-closet-card"
      className="hig-fade-in"
      style={{
        position: 'absolute',
        left: 16,
        bottom: 68,
        zIndex: 21,
        maxWidth: 'min(320px, calc(100vw - 88px))',
        background: 'var(--bg-surface)',
        borderRadius: 20,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div className="hig-headline" style={{ fontSize: '0.96rem' }}>
          새 옷장이 비어 있습니다
        </div>
        <div className="hig-caption" style={{ marginTop: 2 }}>
          직접 의류를 촬영하거나 샘플 아이템을 골라 담아보세요
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          id="empty-go-wardrobe-btn"
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onNavigateWardrobe?.()}
        >
          <Plus size={14} /> 첫 의류 등록
        </button>
        <button
          id="empty-import-samples-btn"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenSampleImport?.()}
        >
          <Sparkles size={14} /> 샘플 선택 가져오기
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <VirtualMannequin
        immersiveStudio
        outfit={activeOutfit}
        allGarments={closetGarments}
        personalColor={data?.stylingProfile?.personalColor || user?.personalColor || 'autumn_warm'}
        userProfile={user}
        weather={normalizedWeather}
        onOpenWeatherSheet={() => setWeatherSheetOpen(true)}
        onOpenProfileModal={onOpenProfileModal}
        onOpenAccountSettings={onOpenAccountSettings}
        onSaveOutfitLog={activeOutfit?.items?.length ? handleLogCurrentOutfit : null}
        onSlotSwap={(slotKey, newItem) =>
          setSlotOverrides((prev) => ({ ...prev, [slotKey]: newItem }))
        }
        onUnequipSlot={(slotKey) =>
          setSlotOverrides((prev) => ({ ...prev, [slotKey]: null }))
        }
        emptyClosetOverlay={emptyClosetCard}
      />

      {/* Progressive Disclosure Bottom Sheet: Weather Location & AI Styling Combos */}
      <ResponsiveSheetModal
        open={weatherSheetOpen}
        onClose={() => setWeatherSheetOpen(false)}
        eyebrow="LIVE WEATHER & AI STYLING"
        title={`${normalizedWeather?.city || '서울'} · ${normalizedWeather?.condition || '맑음'} ${normalizedWeather?.tempC ?? 14}°C`}
        maxWidth={620}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="hig-caption">{normalizedWeather?.stylingTip}</p>

          {/* City & GPS Controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              aria-label="도시 기상 선택"
              className="select-input"
              style={{ flex: 1, minWidth: 160 }}
              value={customGeo ? 'custom' : cityKey}
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  setCustomGeo(null);
                  setCityKey(e.target.value);
                }
              }}
            >
              {customGeo && <option value="custom">현재 위치 (GPS)</option>}
              {CITY_COORDS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={locating}
              onClick={handleUseMyLocation}
            >
              {locating ? <MapPin size={14} /> : <Navigation size={14} />}
              <span>{locating ? '측정 중...' : '현위치 날씨'}</span>
            </button>
          </div>

          {/* AI Recommended Outfits */}
          {recs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="hig-caption">기상 연동 AI 추천 코디 ({recs.length})</span>
              {recs.map((rec, idx) => {
                const isSelected = idx === selectedIdx;
                return (
                  <div
                    key={rec.id || idx}
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedIdx(idx);
                      setSlotOverrides({});
                      setWeatherSheetOpen(false);
                    }}
                    style={{
                      background: isSelected ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                      borderRadius: 18,
                      padding: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="hig-body" style={{ fontWeight: 600 }}>
                        {rec.title || rec.name}
                      </div>
                      <div className="hig-caption tabular-nums" style={{ marginTop: 2 }}>
                        매칭 {rec.suitabilityScore ?? rec.score ?? 94}점 · {(rec.items || []).length}피스
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {(rec.items || []).slice(0, 5).map((it) => (
                          <div
                            key={it.id}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              background: 'var(--bg-canvas)',
                              padding: 3,
                            }}
                          >
                            <StudioGarmentImage
                              item={it}
                              alt={it.name}
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <span
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {isSelected ? <Check size={14} /> : null}
                      <span>{isSelected ? '적용됨' : '입히기'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activeOutfit?.items?.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={async () => {
                await handleLogCurrentOutfit();
                setWeatherSheetOpen(false);
              }}
            >
              <CalendarPlus size={16} /> 오늘의 OOTD 캘린더에 기록하기
            </button>
          )}
        </div>
      </ResponsiveSheetModal>
    </>
  );
}
