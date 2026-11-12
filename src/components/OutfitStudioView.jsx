import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  CloudRain,
  CloudSun,
  LocateFixed,
  Plus,
  RotateCcw,
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
import {
  BODY_SHAPE_OPTIONS,
  getDefaultBodySpec,
  sanitizeBodySpec,
} from '../services/parametricAvatar3D.ts';
import { SEASON_BEST_SWATCHES } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const DEFAULT_CITIES = [
  { key: 'seoul', name: '서울' },
  { key: 'bundang', name: '분당' },
  { key: 'incheon', name: '인천' },
  { key: 'daejeon', name: '대전' },
  { key: 'daegu', name: '대구' },
  { key: 'busan', name: '부산' },
  { key: 'jeju', name: '제주' },
  { key: 'tokyo', name: '도쿄' },
  { key: 'newyork', name: '뉴욕' },
  { key: 'paris', name: '파리' },
];

const SHORT_SCENARIO_LABELS = {
  live: '예보',
  crisp_autumn: '맑음',
  rainy_cool: '비',
  windy_gale: '강풍',
  warm_spring: '포근',
  winter_cold: '한파',
};

const DEFAULT_SCENARIOS = [
  { key: 'live', label: '예보' },
  { key: 'crisp_autumn', label: '맑음' },
  { key: 'rainy_cool', label: '비' },
  { key: 'windy_gale', label: '강풍' },
  { key: 'warm_spring', label: '포근' },
  { key: 'winter_cold', label: '한파' },
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
  user,
  activeCloset,
  garments = [],
  theme = 'light',
  skinProfile,
  bodySpec,
  onUpdateSkinProfile,
  onUpdateBodySpec,
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
  const [bodyModalOpen, setBodyModalOpen] = useState(false);
  const [draftBody, setDraftBody] = useState(() => sanitizeBodySpec(bodySpec));
  const [renderResult, setRenderResult] = useState(null);

  const userModifiedSlotsRef = useRef(Boolean(preEquippedGarment));
  const forceAutoApplyWeatherRef = useRef(false);

  const [cityKey, setCityKey] = useState('seoul');
  const [scenarioKey, setScenarioKey] = useState('live');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [weatherPayload, setWeatherPayload] = useState(null);
  const [activeRecId, setActiveRecId] = useState(null);
  const activeRecIdRef = useRef(null);
  const [loggingTomorrow, setLoggingTomorrow] = useState(false);

  const [savedOutfits, setSavedOutfits] = useState([]);
  const [outfitTitle, setOutfitTitle] = useState('');
  const [savingOutfit, setSavingOutfit] = useState(false);

  useEffect(() => {
    if (bodyModalOpen) {
      setDraftBody(sanitizeBodySpec(bodySpec));
    }
  }, [bodyModalOpen, bodySpec]);

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

  const effectiveGender =
    bodySpec?.gender === 'female' || (!bodySpec && skinProfile?.gender === 'female')
      ? 'female'
      : 'male';

  const loadWeatherRecommendations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        closet: activeCloset || 'sample',
        city: cityKey,
        scenario: scenarioKey,
        gender: effectiveGender,
      });
      if (skinProfile?.personalColor) {
        params.set('personal_color', skinProfile.personalColor);
      }
      if (skinProfile?.skinToneHex) {
        params.set('skin_tone_hex', skinProfile.skinToneHex);
      }
      if (cityKey === 'gps' && gpsCoords) {
        params.set('lat', String(gpsCoords.lat));
        params.set('lon', String(gpsCoords.lon));
        params.set('location_label', gpsCoords.label || '내 위치');
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
      // keep current slots
    }
  }, [activeCloset, cityKey, scenarioKey, gpsCoords, skinProfile, effectiveGender, garments]);

  useEffect(() => {
    loadWeatherRecommendations();
  }, [loadWeatherRecommendations]);

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

  // Deduplicate saved outfits by title so repeated saves never clutter the minimal rail
  const uniqueSavedOutfits = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const outfit of savedOutfits) {
      const key = String(outfit.title || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(outfit);
      if (list.length >= 6) break;
    }
    return list;
  }, [savedOutfits]);

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
      showToast?.('위치 정보를 사용할 수 없습니다.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: '내 위치',
        });
        userModifiedSlotsRef.current = false;
        forceAutoApplyWeatherRef.current = true;
        activeRecIdRef.current = null;
        setCityKey('gps');
        setScenarioKey('live');
      },
      () => {
        setLocatingGps(false);
        showToast?.('위치 권한을 확인해주세요.');
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
      gender: effectiveGender,
      presetKey: preset.key,
    });
  };

  const handleLogTomorrowCalendar = async () => {
    if (equippedItems.length === 0) return;
    setLoggingTomorrow(true);
    try {
      const tomorrowDate =
        weather?.date ||
        new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const labelTitle =
        activeRecommendation?.title ||
        `${weather?.cityName || '서울'} 내일 코디`;
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          worn_date: tomorrowDate,
          outfit_id: null,
          item_ids: equippedItems.map((g) => g.id),
          status: 'planned',
          note: `${labelTitle} (${weather?.tempMin ?? 9}°/${weather?.tempMax ?? 17}°)`,
        }),
      });
      triggerHaptic('medium');
      onClosetUpdated?.();
      showToast?.('내일 캘린더에 추가됨');
    } catch (err) {
      showToast?.(err?.message || '기록 실패');
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
    if (equippedItems.length === 0) return;
    setSavingOutfit(true);
    try {
      const title =
        outfitTitle.trim() ||
        activeRecommendation?.title ||
        equippedItems
          .slice(0, 2)
          .map((g) => g.name)
          .join(' · ');
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
      showToast?.('저장됨');
    } catch (err) {
      showToast?.(err?.message || '저장 실패');
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

  const handleSaveBodySpec = () => {
    const cleaned = sanitizeBodySpec(draftBody);
    onUpdateBodySpec?.(cleaned);
    setBodyModalOpen(false);
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

  const isSignedAccount = Boolean(user && !user.isSampleDemo);

  return (
    <section className="hig-screen-container hig-outfits-screen" aria-label="Outfits">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">OUTFITS</h1>
          <span className="hig-item-count tabular-nums">{equippedItems.length} ACTIVE</span>
        </div>

        <div className="hig-top-bar-actions">
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

      {/* Ultra-Minimal Apple HIG Tomorrow Weather Bar (Zero Prose, Pure Controls) */}
      <section
        id={CARBON_DOM_CONTRACT.weatherRecommendPanelId}
        className="weather-recommend-panel"
        aria-label="내일 날씨 코디"
      >
        <div className="weather-minimal-top">
          <div className="weather-minimal-badge-group">
            <span className="weather-tomorrow-chip">
              {weather?.isRainy ? (
                <CloudRain size={13} />
              ) : weather?.isWindy ? (
                <Wind size={13} />
              ) : weather ? (
                <CloudSun size={13} />
              ) : (
                <Sun size={13} />
              )}
              <strong>내일 날씨 코디</strong>
            </span>

            {weather && (
              <span className="weather-temp-compact tabular-nums">
                {weather.tempMin}°/{weather.tempMax}°
              </span>
            )}
          </div>

          {recommendations.length > 0 && (
            <div className="weather-look-pills" role="list" aria-label="추천 코디">
              {recommendations.map((rec, idx) => {
                const isSelected = activeRecId === rec.id;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    data-weather-rec-id={rec.id}
                    className={`weather-look-pill ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleApplyRecommendation(rec)}
                  >
                    <span>Look {idx + 1}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="weather-location-controls">
            <select
              aria-label="도시 선택"
              className="weather-city-select"
              value={cityKey}
              onChange={(e) => handleSelectCity(e.target.value)}
            >
              {gpsCoords && <option value="gps">내 위치</option>}
              {cities.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name.split('·')[0].trim()}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="weather-icon-btn"
              onClick={handleUseGpsLocation}
              disabled={locatingGps}
              aria-label="현재 위치 예보"
            >
              <LocateFixed size={13} />
            </button>

            <button
              type="button"
              id="log-tomorrow-outfit-btn"
              className="weather-icon-btn"
              disabled={loggingTomorrow || equippedItems.length === 0}
              onClick={handleLogTomorrowCalendar}
              title="내일 캘린더에 기록"
              aria-label="내일 캘린더에 기록"
            >
              <CalendarPlus size={13} />
            </button>
          </div>
        </div>

        <div className="hig-pill-rail weather-scenario-rail" role="tablist" aria-label="날씨">
          {scenarios.map((sc) => {
            const active = scenarioKey === sc.key;
            const shortLabel = SHORT_SCENARIO_LABELS[sc.key] || sc.label;
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
                {shortLabel}
              </button>
            );
          })}
        </div>
      </section>

      <div className="studio-25d-layout">
        {/* Center: 360° Parametric Character Stage */}
        <div className="studio-25d-stage-col">
          <Studio25DCanvas
            slots={slots}
            renderResult={renderResult}
            theme={theme}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
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
            onOpenBodyModal={() => setBodyModalOpen(true)}
          />

          {/* Mobile Slot Dock (< 900px) */}
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

        {/* Right Side (Desktop >= 900px): Minimal Slot Inventory Grid */}
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

          {uniqueSavedOutfits.length > 0 && (
            <div className="studio-saved-looks-rail" aria-label="Saved Outfits">
              {uniqueSavedOutfits.map((outfit) => (
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
                    <Trash2 size={12} />
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

      {/* Human Body Shape Morphing Sheet (`체형 설정`) */}
      <ResponsiveSheetModal
        open={bodyModalOpen}
        onClose={() => setBodyModalOpen(false)}
        title="체형 설정"
        maxWidth={440}
      >
        <div className="body-spec-sheet">
          <div className="body-spec-row">
            <span className="body-spec-label">성별</span>
            {isSignedAccount ? (
              <span className="body-spec-account-badge" data-account-gender={draftBody.gender}>
                회원 정보 · {draftBody.gender === 'female' ? '여성' : '남성'}
              </span>
            ) : (
              <div className="body-spec-seg">
                {[
                  { key: 'male', label: '남성' },
                  { key: 'female', label: '여성' },
                ].map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    data-body-gender-btn={g.key}
                    className={`body-spec-seg-btn ${draftBody.gender === g.key ? 'is-active' : ''}`}
                    onClick={() => {
                      const def = getDefaultBodySpec(g.key);
                      setDraftBody((prev) => ({
                        ...prev,
                        gender: g.key,
                        heightCm: def.heightCm,
                        weightKg: def.weightKg,
                      }));
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="body-spec-slider-block">
            <div className="body-spec-slider-head tabular-nums">
              <span>신장</span>
              <strong>{draftBody.heightCm} cm</strong>
            </div>
            <input
              type="range"
              min={148}
              max={198}
              step={1}
              value={draftBody.heightCm}
              aria-label="신장 cm"
              onChange={(e) =>
                setDraftBody((prev) => ({ ...prev, heightCm: Number(e.target.value) }))
              }
            />
          </div>

          <div className="body-spec-slider-block">
            <div className="body-spec-slider-head tabular-nums">
              <span>체중</span>
              <strong>{draftBody.weightKg} kg</strong>
            </div>
            <input
              type="range"
              min={40}
              max={120}
              step={1}
              value={draftBody.weightKg}
              aria-label="체중 kg"
              onChange={(e) =>
                setDraftBody((prev) => ({ ...prev, weightKg: Number(e.target.value) }))
              }
            />
          </div>

          <div className="body-spec-preset-group">
            <span className="body-spec-label">체형 타입</span>
            <div className="body-spec-shape-pills">
              {BODY_SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-body-shape-btn={opt.key}
                  className={`hig-filter-pill ${draftBody.bodyShape === opt.key ? 'active' : ''}`}
                  onClick={() => setDraftBody((prev) => ({ ...prev, bodyShape: opt.key }))}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="body-spec-fine-grid">
            {[
              { key: 'shoulderScale', label: '어깨', min: 0.88, max: 1.18 },
              { key: 'waistScale', label: '허리', min: 0.84, max: 1.22 },
              { key: 'hipScale', label: '골반', min: 0.88, max: 1.2 },
            ].map((ctrl) => (
              <label key={ctrl.key} className="body-spec-fine-item tabular-nums">
                <div className="body-spec-slider-head">
                  <span>{ctrl.label}</span>
                  <small>{Math.round((draftBody[ctrl.key] || 1) * 100)}%</small>
                </div>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={0.02}
                  value={draftBody[ctrl.key] || 1}
                  aria-label={`${ctrl.label} 비율`}
                  onChange={(e) =>
                    setDraftBody((prev) => ({
                      ...prev,
                      [ctrl.key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <button
            id="apply-body-spec-btn"
            type="button"
            className="hig-primary-cta-btn"
            onClick={handleSaveBodySpec}
          >
            <Check size={16} />
            <span>적용</span>
          </button>
        </div>
      </ResponsiveSheetModal>
    </section>
  );
}
