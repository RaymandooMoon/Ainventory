import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  CloudRain,
  CloudSun,
  LocateFixed,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Wind,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  FITTING_SLOTS,
  mapGarmentToFittingSlot,
  renderOutfitFitting,
} from '../services/fittingRenderer.ts';
import { SEASON_BEST_SWATCHES } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const DEFAULT_CITIES = [
  { key: 'seoul', name: '서울' },
  { key: 'bundang', name: '성남 · 분당' },
  { key: 'incheon', name: '인천 · 송도' },
  { key: 'daejeon', name: '대전' },
  { key: 'daegu', name: '대구' },
  { key: 'busan', name: '부산' },
  { key: 'jeju', name: '제주' },
  { key: 'tokyo', name: '도쿄' },
  { key: 'newyork', name: '뉴욕' },
  { key: 'paris', name: '파리' },
];

const DEFAULT_SCENARIOS = [
  { key: 'live', label: '실시간 내일 예보' },
  { key: 'crisp_autumn', label: '선선한 가을 맑음' },
  { key: 'rainy_cool', label: '비 오는 쌀쌀한 날' },
  { key: 'windy_gale', label: '강풍 부는 날' },
  { key: 'warm_spring', label: '포근한 봄 · 초여름' },
  { key: 'winter_cold', label: '영하권 겨울 칼바람' },
];

function mapWeatherRecToSlots(rec, allGarments, weather) {
  const byId = new Map((allGarments || []).map((g) => [Number(g.id), g]));
  const resolveItem = (raw) => {
    if (!raw) return null;
    return byId.get(Number(raw.id)) || raw;
  };

  const slotMap = rec?.loadoutBySlot || {};
  const isChillyOrWindy = Boolean(
    weather?.isWindy || (typeof weather?.avgTemp === 'number' && weather.avgTemp <= 11)
  );

  let outer = resolveItem(slotMap.outer);
  let top = resolveItem(slotMap.top) || resolveItem(slotMap.dress);
  let bottom = slotMap.dress ? null : resolveItem(slotMap.bottom);
  let shoes = resolveItem(slotMap.shoes);
  let accessory = isChillyOrWindy
    ? resolveItem(slotMap.neckwear) ||
      resolveItem(slotMap.accessory) ||
      resolveItem(slotMap.headwear)
    : resolveItem(slotMap.accessory) || resolveItem(slotMap.neckwear);

  // Fallback if `rec.loadoutBySlot` was omitted (e.g. offline fallback)
  if (!top && !outer && Array.isArray(rec?.items)) {
    for (const raw of rec.items) {
      const item = resolveItem(raw);
      if (!item) continue;
      const key = mapGarmentToFittingSlot(item);
      if (key === 'outer' && !outer) outer = item;
      else if (key === 'top' && !top) top = item;
      else if (key === 'bottom' && !bottom) bottom = item;
      else if (key === 'shoes' && !shoes) shoes = item;
      else if (key === 'accessory' && !accessory) accessory = item;
    }
  }

  return {
    outer: outer || null,
    top: top || null,
    bottom: bottom || null,
    shoes: shoes || null,
    accessory: accessory || null,
  };
}

export default function OutfitStudioView({
  activeCloset,
  garments = [],
  theme = 'light',
  skinProfile,
  onUpdateSkinProfile,
  onOpenSkinToneModal,
  preEquippedGarment,
  onConsumePreEquipped,
  onClosetUpdated,
  showToast,
}) {
  const [slots, setSlots] = useState({
    outer: null,
    top: null,
    bottom: null,
    shoes: null,
    accessory: null,
  });
  const [seededInitial, setSeededInitial] = useState(false);
  const [activeSlotKey, setActiveSlotKey] = useState('top');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [renderResult, setRenderResult] = useState(null);

  // Guard so `[Outfits에서 코디해보기]` from ItemDetailSheet or manual slot edits aren't overwritten by initial weather load
  const userModifiedSlotsRef = useRef(Boolean(preEquippedGarment));
  const forceAutoApplyWeatherRef = useRef(false);

  // Tomorrow's Weather Styling Engine State
  const [cityKey, setCityKey] = useState('seoul');
  const [scenarioKey, setScenarioKey] = useState('live');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [weatherPayload, setWeatherPayload] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [activeRecId, setActiveRecId] = useState(null);
  const activeRecIdRef = useRef(null);
  const [loggingTomorrow, setLoggingTomorrow] = useState(false);

  const [savedOutfits, setSavedOutfits] = useState([]);
  const [outfitTitle, setOutfitTitle] = useState('');
  const [savingOutfit, setSavingOutfit] = useState(false);

  const loadOutfits = useCallback(async () => {
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const res = await apiFetch(`/outfits?closet=${q}`);
      setSavedOutfits(res.outfits || []);
    } catch {
      // keep local state
    }
  }, [activeCloset]);

  useEffect(() => {
    loadOutfits();
  }, [loadOutfits]);

  // Fetch Tomorrow's Weather & Tone-Aware Outfit Recommendations
  const loadWeatherRecommendations = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const params = new URLSearchParams({
        closet: activeCloset || 'sample',
        city: cityKey,
        scenario: scenarioKey,
      });
      if (skinProfile?.personalColor) {
        params.set('personal_color', skinProfile.personalColor);
      }
      if (skinProfile?.skinToneHex) {
        params.set('skin_tone_hex', skinProfile.skinToneHex);
      }
      if (skinProfile?.gender) {
        params.set('gender', skinProfile.gender);
      }
      if (cityKey === 'gps' && gpsCoords) {
        params.set('lat', String(gpsCoords.lat));
        params.set('lon', String(gpsCoords.lon));
        params.set('location_label', gpsCoords.label || '현재 내 위치');
      }

      const data = await apiFetch(`/weather/recommendations?${params.toString()}`);
      setWeatherPayload(data);

      const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
      if (recs.length > 0 && (forceAutoApplyWeatherRef.current || !userModifiedSlotsRef.current)) {
        const chosenRec = recs.find((r) => r.id === activeRecIdRef.current) || recs[0];
        setSlots(mapWeatherRecToSlots(chosenRec, garments, data.weather));
        activeRecIdRef.current = chosenRec.id;
        setActiveRecId(chosenRec.id);
        setSeededInitial(true);
        forceAutoApplyWeatherRef.current = false;
      }
    } catch {
      // Fallback: keep current slots
    } finally {
      setWeatherLoading(false);
    }
  }, [activeCloset, cityKey, scenarioKey, gpsCoords, skinProfile, garments]);

  useEffect(() => {
    loadWeatherRecommendations();
  }, [loadWeatherRecommendations]);

  // Seed a balanced initial 2.5D studio outfit once garments load (unless preEquippedGarment arrives first)
  useEffect(() => {
    if (seededInitial || garments.length === 0) return;
    const findFirst = (slotKey) =>
      garments.find((g) => mapGarmentToFittingSlot(g) === slotKey) || null;
    setSlots((prev) => {
      const hasAny = Object.values(prev).some(Boolean);
      if (hasAny) return prev;
      return {
        outer: null,
        top: findFirst('top'),
        bottom: findFirst('bottom'),
        shoes: findFirst('shoes'),
        accessory: null,
      };
    });
    setSeededInitial(true);
  }, [garments, seededInitial]);

  // Handle `[Outfits에서 코디해보기]` handoff from ItemDetailSheet
  useEffect(() => {
    if (!preEquippedGarment) return;
    userModifiedSlotsRef.current = true;
    const targetSlot = mapGarmentToFittingSlot(preEquippedGarment);
    const findFirst = (slotKey) =>
      garments.find((g) => mapGarmentToFittingSlot(g) === slotKey) || null;

    setSlots((prev) => ({
      outer: targetSlot === 'outer' ? preEquippedGarment : prev.outer,
      top: targetSlot === 'top' ? preEquippedGarment : prev.top || findFirst('top'),
      bottom: targetSlot === 'bottom' ? preEquippedGarment : prev.bottom || findFirst('bottom'),
      shoes: targetSlot === 'shoes' ? preEquippedGarment : prev.shoes || findFirst('shoes'),
      accessory: targetSlot === 'accessory' ? preEquippedGarment : prev.accessory,
    }));
    setActiveSlotKey(targetSlot);
    setActiveRecId(null);
    setSeededInitial(true);
    onConsumePreEquipped?.();
  }, [preEquippedGarment, garments, onConsumePreEquipped]);

  // Keep equipped garment references fresh if edited or deleted in Closet
  useEffect(() => {
    if (garments.length === 0) return;
    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    setSlots((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const cur = next[key];
        if (!cur) continue;
        const fresh = byId.get(Number(cur.id));
        if (!fresh) {
          next[key] = null;
          changed = true;
        } else if (fresh !== cur) {
          next[key] = fresh;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [garments]);

  // Run modular FittingRenderer (`Studio25DFittingRenderer` or `VtonApiFittingRenderer`)
  useEffect(() => {
    let cancelled = false;
    renderOutfitFitting({ slots, theme }).then((res) => {
      if (!cancelled) {
        setRenderResult(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slots, theme]);

  const slotGarments = useMemo(() => {
    return garments.filter((g) => mapGarmentToFittingSlot(g) === activeSlotKey);
  }, [garments, activeSlotKey]);

  const equippedItems = useMemo(() => {
    return FITTING_SLOTS.map((s) => slots[s.key]).filter(Boolean);
  }, [slots]);

  const weather = weatherPayload?.weather || null;
  const cities = weatherPayload?.cities?.length ? weatherPayload.cities : DEFAULT_CITIES;
  const scenarios = weatherPayload?.scenarios?.length
    ? weatherPayload.scenarios
    : DEFAULT_SCENARIOS;
  const recommendations = weatherPayload?.recommendations || [];
  const activeRecommendation =
    recommendations.find((r) => r.id === activeRecId) || recommendations[0] || null;

  const handleSelectCity = (nextCity) => {
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setCityKey(nextCity);
    triggerHaptic('selection');
  };

  const handleSelectScenario = (nextScenario) => {
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setScenarioKey(nextScenario);
    triggerHaptic('selection');
  };

  const handleUseGpsLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast?.('이 기기에서 위치 정보를 사용할 수 없습니다.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: '현재 위치',
        });
        userModifiedSlotsRef.current = false;
        forceAutoApplyWeatherRef.current = true;
        activeRecIdRef.current = null;
        setCityKey('gps');
        setScenarioKey('live');
        showToast?.('현재 위치 기준 내일 날씨 코디를 불러왔습니다.');
      },
      () => {
        setLocatingGps(false);
        showToast?.('위치 권한을 허용하면 현재 위치 예보를 불러옵니다.');
      },
      { timeout: 6000 }
    );
  };

  const handleApplyRecommendation = (rec) => {
    if (!rec) return;
    triggerHaptic('selection');
    userModifiedSlotsRef.current = false;
    activeRecIdRef.current = rec.id;
    setActiveRecId(rec.id);
    setSlots(mapWeatherRecToSlots(rec, garments, weather));
  };

  const handleQuickSelectSkinPreset = (preset) => {
    if (!preset) return;
    const seasonInfo =
      SEASON_BEST_SWATCHES[preset.personalColor] || SEASON_BEST_SWATCHES.autumn_warm;
    triggerHaptic('selection');
    if (!userModifiedSlotsRef.current) {
      forceAutoApplyWeatherRef.current = true;
    }
    onUpdateSkinProfile?.({
      skinToneHex: preset.skinToneHex,
      personalColor: preset.personalColor,
      personalColorLabelKo: seasonInfo.labelKo,
      subTypeLabelKo: preset.subTypeLabelKo,
      gender: skinProfile?.gender || 'male',
      presetKey: preset.key,
    });
  };

  const handleLogTomorrowCalendar = async () => {
    if (equippedItems.length === 0) {
      showToast?.('먼저 2.5D 캐릭터에 입힐 코디를 선택해주세요.');
      return;
    }
    setLoggingTomorrow(true);
    try {
      const tomorrowDate =
        weather?.date ||
        new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const labelTitle =
        activeRecommendation?.title ||
        `${weather?.cityName || '서울'} 내일 날씨 코디`;
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          worn_date: tomorrowDate,
          outfit_id: null,
          item_ids: equippedItems.map((g) => g.id),
          status: 'planned',
          note: `${labelTitle} (${weather?.condition || '맑음'} ${weather?.tempMin ?? 9}°/${weather?.tempMax ?? 17}°C)`,
        }),
      });
      triggerHaptic('medium');
      onClosetUpdated?.();
      showToast?.(`내일(${tomorrowDate}) 착용 예정 코디로 캘린더에 기록되었습니다.`);
    } catch (err) {
      showToast?.(err?.message || '캘린더 기록에 실패했습니다.');
    } finally {
      setLoggingTomorrow(false);
    }
  };

  const handleToggleEquip = (item) => {
    const slotKey = mapGarmentToFittingSlot(item);
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    triggerHaptic('selection');
    setSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey]?.id === item.id ? null : item,
    }));
  };

  const handleUnequipSlot = (slotKey) => {
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    triggerHaptic('selection');
    setSlots((prev) => ({ ...prev, [slotKey]: null }));
  };

  const handleClearAll = () => {
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    triggerHaptic('selection');
    setSlots({
      outer: null,
      top: null,
      bottom: null,
      shoes: null,
      accessory: null,
    });
  };

  const handleSaveOutfit = async (e) => {
    e?.preventDefault?.();
    if (equippedItems.length === 0) {
      showToast?.('최소 1개 이상의 의류를 선택해주세요.');
      return;
    }
    setSavingOutfit(true);
    try {
      const title =
        outfitTitle.trim() ||
        activeRecommendation?.title ||
        equippedItems
          .slice(0, 2)
          .map((g) => g.name)
          .join(' + ');
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          title,
          occasion: 'Daily',
          season: '봄/가을',
          item_ids: equippedItems.map((g) => g.id),
        }),
      });
      setOutfitTitle('');
      triggerHaptic('medium');
      await loadOutfits();
      onClosetUpdated?.();
      showToast?.('코디가 저장되었습니다.');
    } catch (err) {
      showToast?.(err?.message || '코디 저장에 실패했습니다.');
    } finally {
      setSavingOutfit(false);
    }
  };

  const handleApplySavedOutfit = (outfit) => {
    const idSet = new Set((outfit.item_ids || []).map(Number));
    const next = {
      outer: null,
      top: null,
      bottom: null,
      shoes: null,
      accessory: null,
    };
    for (const g of garments) {
      if (idSet.has(Number(g.id))) {
        const sKey = mapGarmentToFittingSlot(g);
        if (!next[sKey]) next[sKey] = g;
      }
    }
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    triggerHaptic('selection');
    setSlots(next);
  };

  const handleDeleteSavedOutfit = async (outfitId) => {
    try {
      await apiFetch(`/outfits/${outfitId}`, { method: 'DELETE' });
      await loadOutfits();
    } catch {
      // ignore
    }
  };

  const renderSlotInventoryGrid = (closeOnPick = false) => (
    <div className="studio-mini-inventory-grid">
      {slotGarments.map((item) => {
        const isEquipped = slots[activeSlotKey]?.id === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-slot-garment-id={item.id}
            aria-pressed={isEquipped}
            className={`studio-mini-garment-card ${isEquipped ? 'is-equipped' : ''}`}
            onClick={() => {
              handleToggleEquip(item);
              if (closeOnPick) setMobileSheetOpen(false);
            }}
          >
            <div className="studio-mini-squircle">
              <GarmentObject25D item={item} padding="11%" />
              {isEquipped && (
                <span className="studio-equipped-badge" aria-hidden="true">
                  <Check size={12} strokeWidth={2.6} />
                </span>
              )}
            </div>
            <span className="hig-garment-name">{item.name}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="hig-screen-container hig-outfits-screen" aria-label="Outfits">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">OUTFITS</h1>
          <span className="hig-item-count tabular-nums">{equippedItems.length} ACTIVE</span>
        </div>

        <div className="hig-top-bar-actions">
          <button
            type="button"
            className="hig-skin-header-pill"
            onClick={onOpenSkinToneModal}
            aria-label="인물 피부톤 분석 및 2.5D 마네킹 변경"
          >
            <span
              className="hig-skin-header-swatch"
              style={{ backgroundColor: skinProfile?.skinToneHex || '#DFBA9B' }}
            />
            <span>{skinProfile?.subTypeLabelKo || '피부톤 분석'}</span>
            <Palette size={14} />
          </button>

          {equippedItems.length > 0 && (
            <button
              type="button"
              className="hig-circle-icon-btn is-subtle"
              onClick={handleClearAll}
              aria-label="착장 초기화"
            >
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      </header>

      {/* Tomorrow's Weather AI Outfit Recommendation Strip */}
      <section
        id={CARBON_DOM_CONTRACT.weatherRecommendPanelId}
        className="weather-recommend-panel"
        aria-label="내일 날씨 기반 2.5D 코디 추천"
      >
        <div className="weather-header-row">
          <div className="weather-forecast-summary">
            <span className="weather-tomorrow-chip">
              {weather?.isRainy ? (
                <CloudRain size={14} />
              ) : weather?.isWindy ? (
                <Wind size={14} />
              ) : weather ? (
                <CloudSun size={14} />
              ) : (
                <Sun size={14} />
              )}
              <strong>내일 날씨 코디</strong>
            </span>

            {weather ? (
              <span className="weather-metrics-inline tabular-nums">
                {weather.cityName} · {weather.condition} · 최저 {weather.tempMin}° / 최고{' '}
                {weather.tempMax}°C · 강수 {weather.precipProb ?? 10}%
              </span>
            ) : (
              <span className="weather-metrics-inline">
                {weatherLoading ? '내일 예보를 분석하는 중...' : '내일 기온 맞춤 코디'}
              </span>
            )}
          </div>

          <div className="weather-location-controls">
            <select
              aria-label="내일 예보 도시 선택"
              className="weather-city-select"
              value={cityKey}
              onChange={(e) => handleSelectCity(e.target.value)}
            >
              {gpsCoords && <option value="gps">현재 내 위치</option>}
              {cities.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="weather-gps-btn"
              onClick={handleUseGpsLocation}
              disabled={locatingGps}
              title="현재 위치 기준 내일 예보"
              aria-label="현재 위치 기준 내일 예보"
            >
              <LocateFixed size={14} />
            </button>
          </div>
        </div>

        {/* Weather Scenario Selector Pills */}
        <div className="hig-pill-rail weather-scenario-rail" role="tablist" aria-label="날씨 시나리오">
          {scenarios.map((sc) => {
            const active = scenarioKey === sc.key;
            return (
              <button
                key={sc.key}
                type="button"
                role="tab"
                data-weather-scenario={sc.key}
                aria-selected={active}
                className={`hig-filter-pill ${active ? 'active' : ''}`}
                onClick={() => handleSelectScenario(sc.key)}
              >
                {sc.label}
              </button>
            );
          })}
        </div>

        {/* Ranked AI Tomorrow Outfit Cards (Click -> Instantly Dresses 2.5D Character) */}
        {recommendations.length > 0 && (
          <div className="weather-rec-cards-rail" role="list" aria-label="내일 날씨 추천 코디 목록">
            {recommendations.map((rec, idx) => {
              const isSelected = activeRecId === rec.id;
              return (
                <button
                  key={rec.id}
                  type="button"
                  data-weather-rec-id={rec.id}
                  className={`weather-rec-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleApplyRecommendation(rec)}
                >
                  <div className="weather-rec-card-top">
                    <span className="weather-rec-badge">
                      <Sparkles size={11} />
                      <span>
                        추천 {idx + 1} · {rec.badge}
                      </span>
                    </span>
                    <span className="weather-rec-score tabular-nums">
                      적합 {rec.suitabilityScore}% · 톤조화 {rec.personalColorSync || 90}%
                    </span>
                  </div>
                  <strong className="weather-rec-title">{rec.title}</strong>
                  <span className="weather-rec-items-line">
                    {(rec.items || [])
                      .slice(0, 4)
                      .map((it) => it.name)
                      .join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Concise Weather Tip + 1-Tap Tomorrow Calendar Log */}
        {(activeRecommendation || weather?.summary) && (
          <div className="weather-rationale-bar">
            <p className="weather-rationale-text">
              {activeRecommendation?.rationale || weather?.summary}
            </p>
            <button
              type="button"
              id="log-tomorrow-outfit-btn"
              className="weather-calendar-log-btn"
              disabled={loggingTomorrow || equippedItems.length === 0}
              onClick={handleLogTomorrowCalendar}
            >
              <CalendarPlus size={14} />
              <span>내일 코디 캘린더 기록</span>
            </button>
          </div>
        )}
      </section>

      <div className="studio-25d-layout">
        {/* Center: Tone-Adaptive 2.5D Character Studio Canvas */}
        <div className="studio-25d-stage-col">
          <Studio25DCanvas
            renderResult={renderResult}
            theme={theme}
            skinProfile={skinProfile}
            weather={weather}
            activeSlotKey={activeSlotKey}
            onSelectSlot={(slotKey) => {
              setActiveSlotKey(slotKey);
              if (window.innerWidth < 900) {
                setMobileSheetOpen(true);
              }
            }}
            onUnequipSlot={handleUnequipSlot}
            onQuickSelectPreset={handleQuickSelectSkinPreset}
            onOpenSkinToneModal={onOpenSkinToneModal}
          />

          {/* Mobile Slot Dock Trigger (opens Bottom Sheet Picker on < 900px) */}
          <div className="studio-mobile-slot-bar">
            {FITTING_SLOTS.map((slot) => {
              const assigned = slots[slot.key];
              const isSelected = activeSlotKey === slot.key;
              return (
                <button
                  key={slot.key}
                  type="button"
                  data-mobile-slot-btn={slot.key}
                  className={`studio-mobile-slot-pill ${isSelected ? 'active' : ''} ${assigned ? 'filled' : ''}`}
                  onClick={() => {
                    setActiveSlotKey(slot.key);
                    setMobileSheetOpen(true);
                  }}
                >
                  <span>{slot.label}</span>
                  {assigned ? <span className="studio-slot-dot" /> : <Plus size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side (Desktop >= 900px): Mini Inventory Slot Combiner */}
        <aside id={CARBON_DOM_CONTRACT.studioSlotPickerId} className="studio-desktop-picker-col">
          <div className="hig-pill-rail studio-slot-tabs" role="tablist" aria-label="Outfit Slots">
            {FITTING_SLOTS.map((slot) => {
              const active = activeSlotKey === slot.key;
              const hasItem = Boolean(slots[slot.key]);
              return (
                <button
                  key={slot.key}
                  type="button"
                  role="tab"
                  data-outfit-slot-tab={slot.key}
                  aria-selected={active}
                  className={`hig-filter-pill ${active ? 'active' : ''}`}
                  onClick={() => setActiveSlotKey(slot.key)}
                >
                  <span>{slot.label}</span>
                  {hasItem && <span className="studio-slot-dot" />}
                </button>
              );
            })}
          </div>

          <div className="studio-desktop-inventory-scroll">{renderSlotInventoryGrid(false)}</div>

          <form onSubmit={handleSaveOutfit} className="studio-save-bar">
            <input
              type="text"
              className="hig-native-input"
              placeholder="Outfit Name"
              value={outfitTitle}
              onChange={(e) => setOutfitTitle(e.target.value)}
              maxLength={80}
            />
            <button
              id={CARBON_DOM_CONTRACT.studioSaveOutfitBtnId}
              type="submit"
              className="hig-primary-cta-btn studio-save-submit"
              disabled={savingOutfit || equippedItems.length === 0}
            >
              <Check size={16} />
              <span>Save</span>
            </button>
          </form>

          {savedOutfits.length > 0 && (
            <div className="studio-saved-looks-rail" aria-label="Saved Outfits">
              {savedOutfits.map((outfit) => (
                <div key={outfit.id} className="studio-saved-look-chip">
                  <button
                    type="button"
                    className="studio-saved-look-select"
                    onClick={() => handleApplySavedOutfit(outfit)}
                  >
                    {outfit.title}
                  </button>
                  <button
                    type="button"
                    className="studio-saved-look-del"
                    aria-label={`${outfit.title} 삭제`}
                    onClick={() => handleDeleteSavedOutfit(outfit.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Save Bar */}
      <form onSubmit={handleSaveOutfit} className="studio-mobile-save-row">
        <input
          type="text"
          className="hig-native-input"
          placeholder="Outfit Name"
          value={outfitTitle}
          onChange={(e) => setOutfitTitle(e.target.value)}
          maxLength={80}
        />
        <button
          type="submit"
          data-testid="mobile-save-outfit-btn"
          className="hig-primary-cta-btn studio-save-submit"
          disabled={savingOutfit || equippedItems.length === 0}
        >
          <Check size={16} />
          <span>Save</span>
        </button>
      </form>

      {/* Mobile Bottom Sheet Mini Inventory Picker */}
      <ResponsiveSheetModal
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title={FITTING_SLOTS.find((s) => s.key === activeSlotKey)?.label || 'Select Item'}
        maxWidth={520}
      >
        <div className="hig-pill-rail" style={{ marginBottom: 14 }}>
          {FITTING_SLOTS.map((slot) => (
            <button
              key={slot.key}
              type="button"
              className={`hig-filter-pill ${activeSlotKey === slot.key ? 'active' : ''}`}
              onClick={() => setActiveSlotKey(slot.key)}
            >
              {slot.label}
            </button>
          ))}
        </div>
        {renderSlotInventoryGrid(true)}
      </ResponsiveSheetModal>
    </section>
  );
}
