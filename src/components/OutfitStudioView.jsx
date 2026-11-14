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
  bridgeLegacyPropsToAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  FITTING_SLOTS,
  isSwimwearGarment,
  isWearableStudioGarment,
  mapGarmentToFittingSlot,
  renderOutfitFitting,
} from '../services/fittingRenderer.ts';
import { SEASON_BEST_SWATCHES } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import {
  localizeApiMessage,
  localizeGarmentName,
  localizeOutfitTitle,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import { ResponsiveSheetModal, TopRightUtilityActions } from './common/AppUI.jsx';

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

const CITY_EN_NAMES = {
  seoul: 'Seoul',
  bundang: 'Bundang',
  incheon: 'Incheon',
  daejeon: 'Daejeon',
  daegu: 'Daegu',
  busan: 'Busan',
  jeju: 'Jeju',
  tokyo: 'Tokyo',
  newyork: 'New York',
  paris: 'Paris',
};

const SHORT_SCENARIO_LABELS = {
  live: { ko: '예보', en: 'Live' },
  crisp_autumn: { ko: '맑음', en: 'Clear' },
  rainy_cool: { ko: '비', en: 'Rain' },
  windy_gale: { ko: '강풍', en: 'Windy' },
  warm_spring: { ko: '포근', en: 'Mild' },
  winter_cold: { ko: '한파', en: 'Cold' },
};

const DEFAULT_SCENARIOS = [
  { key: 'live', label: '예보' },
  { key: 'crisp_autumn', label: '맑음' },
  { key: 'rainy_cool', label: '비' },
  { key: 'windy_gale', label: '강풍' },
  { key: 'warm_spring', label: '포근' },
  { key: 'winter_cold', label: '한파' },
];

const STUDIO_SEASON_FILTERS = [
  { key: 'all', ko: '사계절 전체', en: 'All Seasons' },
  { key: '봄', ko: '봄', en: 'Spring' },
  { key: '여름', ko: '여름', en: 'Summer' },
  { key: '가을', ko: '가을', en: 'Autumn' },
  { key: '겨울', ko: '겨울', en: 'Winter' },
];

const SEASON_TOKEN_ALIAS = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  fall: '가을',
  winter: '겨울',
  봄: '봄',
  여름: '여름',
  가을: '가을',
  겨울: '겨울',
};

function normalizeSeasonToken(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return SEASON_TOKEN_ALIAS[s.toLowerCase()] || s;
}

function parseSeasons(rawSeasons) {
  if (Array.isArray(rawSeasons)) {
    return rawSeasons.map(normalizeSeasonToken).filter(Boolean);
  }
  if (typeof rawSeasons === 'string') {
    const trimmed = rawSeasons.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeSeasonToken).filter(Boolean);
        }
      } catch {
        // fall through to delimiter split
      }
    }
    return trimmed
      .split(/[,/|]+/)
      .map(normalizeSeasonToken)
      .filter(Boolean);
  }
  return [];
}

function resolveGarmentDisplayName(item, lang) {
  if (!item) return '';
  if (lang === 'en' && typeof item.name_en === 'string' && item.name_en.trim()) {
    return item.name_en.trim();
  }
  return localizeGarmentName(item.name, lang);
}

function mapWeatherRecToSlots(rec, allGarments, weather) {
  const byId = new Map((allGarments || []).map((g) => [Number(g.id), g]));
  const resolveItem = (raw) => {
    if (!raw) return null;
    const candidate = byId.get(Number(raw.id)) || raw;
    return isWearableStudioGarment(candidate) ? candidate : null;
  };

  const slotMap = rec?.loadoutBySlot || {};
  const isChillyOrWindy = Boolean(
    weather?.isWindy || (typeof weather?.avgTemp === 'number' && weather.avgTemp <= 11)
  );

  let outer = resolveItem(slotMap.outer);
  let onepiece = resolveItem(slotMap.onepiece) || resolveItem(slotMap.dress);
  const rawTop = resolveItem(slotMap.top);
  if (!onepiece && rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece') {
    onepiece = rawTop;
  }

  const hasNonSwimOnepiece = Boolean(onepiece && !isSwimwearGarment(onepiece));
  let top =
    hasNonSwimOnepiece || (rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece')
      ? null
      : rawTop;
  let bottom = hasNonSwimOnepiece ? null : resolveItem(slotMap.bottom);
  let shoes = resolveItem(slotMap.shoes);
  let accessory = isChillyOrWindy
    ? resolveItem(slotMap.neckwear) ||
      resolveItem(slotMap.accessory) ||
      resolveItem(slotMap.headwear)
    : resolveItem(slotMap.accessory) || resolveItem(slotMap.neckwear);

  if (!top && !onepiece && !outer && Array.isArray(rec?.items)) {
    for (const raw of rec.items) {
      const item = resolveItem(raw);
      if (!item) continue;
      const key = mapGarmentToFittingSlot(item);
      if (key === 'outer' && !outer) outer = item;
      else if (key === 'onepiece' && !onepiece) {
        onepiece = item;
        if (!isSwimwearGarment(item)) {
          top = null;
          bottom = null;
        }
      } else if (key === 'top' && !top && !(onepiece && !isSwimwearGarment(onepiece))) {
        top = item;
      } else if (key === 'bottom' && !bottom && !(onepiece && !isSwimwearGarment(onepiece))) {
        bottom = item;
      } else if (key === 'shoes' && !shoes) shoes = item;
      else if (key === 'accessory' && !accessory) accessory = item;
    }
  }

  return {
    outer: outer || null,
    top: top || null,
    bottom: bottom || null,
    onepiece: onepiece || null,
    shoes: shoes || null,
    accessory: accessory || null,
  };
}

const EMPTY_STUDIO_SLOTS = {
  outer: null,
  top: null,
  bottom: null,
  onepiece: null,
  shoes: null,
  accessory: null,
};

function buildInitialStudioSlots(garments, preEquippedGarment) {
  const wearableList = (Array.isArray(garments) ? garments : []).filter((g) =>
    isWearableStudioGarment(g)
  );
  const findFirst = (slotKey) =>
    wearableList.find((g) => mapGarmentToFittingSlot(g) === slotKey) || null;

  if (preEquippedGarment && isWearableStudioGarment(preEquippedGarment)) {
    const targetSlot = mapGarmentToFittingSlot(preEquippedGarment);
    const preIsNonSwimOnepiece =
      targetSlot === 'onepiece' && !isSwimwearGarment(preEquippedGarment);
    return {
      outer: targetSlot === 'outer' ? preEquippedGarment : null,
      top: preIsNonSwimOnepiece
        ? null
        : targetSlot === 'top'
          ? preEquippedGarment
          : findFirst('top'),
      bottom: preIsNonSwimOnepiece
        ? null
        : targetSlot === 'bottom'
          ? preEquippedGarment
          : findFirst('bottom'),
      onepiece: targetSlot === 'onepiece' ? preEquippedGarment : null,
      shoes: targetSlot === 'shoes' ? preEquippedGarment : findFirst('shoes'),
      accessory: targetSlot === 'accessory' ? preEquippedGarment : null,
    };
  }

  if (wearableList.length > 0) {
    const initialTop = findFirst('top');
    const initialBottom = findFirst('bottom');
    const initialOnepiece = !initialTop && !initialBottom ? findFirst('onepiece') : null;
    return {
      outer: null,
      top: initialTop,
      bottom: initialBottom,
      onepiece: initialOnepiece,
      shoes: findFirst('shoes'),
      accessory: null,
    };
  }

  return { ...EMPTY_STUDIO_SLOTS };
}

export default function OutfitStudioView({
  user,
  activeCloset,
  garments = [],
  theme = 'light',
  lang = 'ko',
  skinProfile,
  bodySpec,
  onUpdateSkinProfile,
  onOpenProfile,
  onOpenAccount,
  onOpenSkinToneModal,
  onOpenBodyProfile,
  preEquippedGarment,
  onConsumePreEquipped,
  onClosetUpdated,
  showToast,
}) {
  const {
    spec: storedAvatarSpec,
    avatarConfigHash: storedAvatarHash,
    patchAvatarSpec,
  } = useAvatarSpec();

  const bridgedAvatar = useMemo(() => {
    void storedAvatarSpec;
    void storedAvatarHash;
    return bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user });
  }, [skinProfile, bodySpec, user, storedAvatarSpec, storedAvatarHash]);

  const [rawSlots, setSlots] = useState(() =>
    preEquippedGarment
      ? buildInitialStudioSlots(garments, preEquippedGarment)
      : { ...EMPTY_STUDIO_SLOTS }
  );
  const [hasExplicitSlotState, setHasExplicitSlotState] = useState(true);
  const [activeSlotKey, setActiveSlotKey] = useState(() =>
    preEquippedGarment ? mapGarmentToFittingSlot(preEquippedGarment) : 'top'
  );
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
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

  const handleOpenBodyModal = useCallback(() => {
    if (onOpenBodyProfile) {
      onOpenBodyProfile();
    } else {
      onOpenProfile?.('body');
    }
  }, [onOpenBodyProfile, onOpenProfile]);

  useEffect(() => {
    if (preEquippedGarment) {
      onConsumePreEquipped?.();
    }
  }, [preEquippedGarment, onConsumePreEquipped]);

  const reloadOutfits = useCallback(async () => {
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const res = await apiFetch(`/outfits?closet=${q}`);
      setSavedOutfits(res.outfits || []);
    } catch {
      // keep local state
    }
  }, [activeCloset]);

  useEffect(() => {
    let cancelled = false;
    const q = encodeURIComponent(activeCloset || 'sample');
    apiFetch(`/outfits?closet=${q}`)
      .then((res) => {
        if (!cancelled) {
          setSavedOutfits(res.outfits || []);
        }
      })
      .catch(() => {
        // keep local state
      });
    return () => {
      cancelled = true;
    };
  }, [activeCloset]);

  const effectiveGender =
    (user && !user.isSampleDemo
      ? user.gender
      : bodySpec?.gender || skinProfile?.gender) === 'female'
      ? 'female'
      : 'male';

  useEffect(() => {
    let cancelled = false;
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
      params.set('location_label', gpsCoords.label || 'GPS');
    }

    apiFetch(`/weather/recommendations?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setWeatherPayload(data);

        const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
        if (
          recs.length > 0 &&
          (forceAutoApplyWeatherRef.current || !userModifiedSlotsRef.current)
        ) {
          const chosenRec = recs.find((r) => r.id === activeRecIdRef.current) || recs[0];
          setSlots(mapWeatherRecToSlots(chosenRec, garments, data.weather));
          setHasExplicitSlotState(true);
          activeRecIdRef.current = chosenRec.id;
          setActiveRecId(chosenRec.id);
          forceAutoApplyWeatherRef.current = false;
        } else if (recs.length === 0 && !userModifiedSlotsRef.current && garments.length > 0) {
          setSlots((prev) =>
            Object.values(prev).some(Boolean) ? prev : buildInitialStudioSlots(garments, null)
          );
          setHasExplicitSlotState(true);
        }
      })
      .catch(() => {
        if (!cancelled && !userModifiedSlotsRef.current && garments.length > 0) {
          setSlots((prev) =>
            Object.values(prev).some(Boolean) ? prev : buildInitialStudioSlots(garments, null)
          );
          setHasExplicitSlotState(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCloset, cityKey, scenarioKey, gpsCoords, skinProfile, effectiveGender, garments]);

  const slots = useMemo(() => {
    const hasRawSelection = Object.values(rawSlots).some(Boolean);
    const baseSlots =
      !hasRawSelection && !hasExplicitSlotState && garments.length > 0
        ? buildInitialStudioSlots(garments, null)
        : rawSlots;

    if (garments.length === 0) {
      return baseSlots;
    }

    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    const next = { ...EMPTY_STUDIO_SLOTS };
    for (const key of Object.keys(next)) {
      const cur = baseSlots[key];
      if (!cur) continue;
      const resolved = byId.get(Number(cur.id)) || null;
      next[key] = resolved && isWearableStudioGarment(resolved) ? resolved : null;
    }
    return next;
  }, [rawSlots, hasExplicitSlotState, garments]);

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
    return garments.filter((g) => {
      if (!isWearableStudioGarment(g)) return false;
      if (mapGarmentToFittingSlot(g) !== activeSlotKey) return false;
      if (seasonFilter === 'all') return true;
      return parseSeasons(g.seasons).includes(seasonFilter);
    });
  }, [garments, activeSlotKey, seasonFilter]);

  const equippedItems = useMemo(() => {
    return FITTING_SLOTS.map((s) => slots[s.key]).filter(Boolean);
  }, [slots]);

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
      showToast?.(tx(lang, '위치 정보를 사용할 수 없습니다.', 'Geolocation is unavailable.'));
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: tx(lang, '내 위치', 'My Location'),
        });
        userModifiedSlotsRef.current = false;
        forceAutoApplyWeatherRef.current = true;
        activeRecIdRef.current = null;
        setCityKey('gps');
        setScenarioKey('live');
      },
      () => {
        setLocatingGps(false);
        showToast?.(tx(lang, '위치 권한을 확인해주세요.', 'Please check location permissions.'));
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
    setHasExplicitSlotState(true);
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
    patchAvatarSpec({
      appearance: {
        skinToneHex: preset.skinToneHex,
        personalColor: preset.personalColor,
      },
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
        localizeOutfitTitle(activeRecommendation?.title, lang) ||
        tx(lang, `${weather?.cityName || '서울'} 내일 코디`, 'Tomorrow Weather Look');
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
      showToast?.(tx(lang, '내일 캘린더에 추가됨', 'Added to tomorrow calendar'));
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) || tx(lang, '기록 실패', 'Failed to log outfit')
      );
    } finally {
      setLoggingTomorrow(false);
    }
  };

  const handleToggleEquip = (item) => {
    const slotKey = mapGarmentToFittingSlot(item);
    const isUnequipping = slots[slotKey]?.id === item.id;
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    triggerHaptic('selection');

    const nextSlots = {
      ...slots,
      [slotKey]: isUnequipping ? null : item,
    };

    if (!isUnequipping) {
      if (slotKey === 'onepiece' && !isSwimwearGarment(item)) {
        // Non-swimwear dress/jumpsuit replaces top & bottom cleanly
        nextSlots.top = null;
        nextSlots.bottom = null;
      } else if (
        (slotKey === 'top' || slotKey === 'bottom') &&
        nextSlots.onepiece &&
        !isSwimwearGarment(nextSlots.onepiece)
      ) {
        // Equipping top or bottom clears a non-swimwear dress (swimwear stays layerable!)
        nextSlots.onepiece = null;
      }
    }

    setSlots(nextSlots);
  };

  const handleUnequipSlot = (slotKey) => {
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    triggerHaptic('selection');
    setSlots({ ...slots, [slotKey]: null });
  };

  const handleClearAll = () => {
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    triggerHaptic('selection');
    setSlots({ ...EMPTY_STUDIO_SLOTS });
  };

  const handleSaveOutfit = async (e) => {
    e?.preventDefault?.();
    if (equippedItems.length === 0) return;
    setSavingOutfit(true);
    try {
      const title =
        outfitTitle.trim() ||
        localizeOutfitTitle(activeRecommendation?.title, lang) ||
        equippedItems
          .slice(0, 2)
          .map((g) => resolveGarmentDisplayName(g, lang))
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
      await reloadOutfits();
      onClosetUpdated?.();
      showToast?.(tx(lang, '코디 저장됨', 'Outfit saved'));
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) || tx(lang, '저장 실패', 'Failed to save outfit')
      );
    } finally {
      setSavingOutfit(false);
    }
  };

  const handleApplySavedOutfit = (outfit) => {
    const idSet = new Set((outfit.item_ids || []).map(Number));
    const next = { ...EMPTY_STUDIO_SLOTS };
    for (const g of garments) {
      if (!isWearableStudioGarment(g)) continue;
      if (idSet.has(Number(g.id))) {
        const sKey = mapGarmentToFittingSlot(g);
        if (!next[sKey]) next[sKey] = g;
      }
    }
    if (next.onepiece && !isSwimwearGarment(next.onepiece)) {
      next.top = null;
      next.bottom = null;
    }
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    triggerHaptic('selection');
    setSlots(next);
  };

  const handleDeleteSavedOutfit = async (outfitId) => {
    try {
      await apiFetch(`/outfits/${outfitId}`, { method: 'DELETE' });
      await reloadOutfits();
    } catch {
      // ignore
    }
  };

  const renderSeasonFilterRail = () => (
    <div
      className="hig-pill-rail studio-season-filter-rail"
      role="group"
      aria-label={tx(lang, '계절 필터', 'Season Filter')}
    >
      {STUDIO_SEASON_FILTERS.map((s) => {
        const active = seasonFilter === s.key;
        return (
          <button
            key={s.key}
            type="button"
            data-outfit-season-filter={s.key}
            aria-pressed={active}
            className={`hig-filter-pill ${active ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              setSeasonFilter(s.key);
            }}
          >
            {tx(lang, s.ko, s.en)}
          </button>
        );
      })}
    </div>
  );

  const renderSlotInventoryGrid = (closeOnPick = false) =>
    slotGarments.length === 0 ? (
      <div className="studio-slot-empty-state">
        {tx(lang, '조건에 맞는 의류가 없습니다.', 'No matching garments in this slot.')}
      </div>
    ) : (
      <div className="studio-mini-inventory-grid">
        {slotGarments.map((item) => {
          const isEquipped = slots[activeSlotKey]?.id === item.id;
          const displayName = resolveGarmentDisplayName(item, lang);
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
                <GarmentObject25D item={item} alt={displayName} padding="11%" />
                {isEquipped && (
                  <span className="studio-equipped-badge" aria-hidden="true">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                )}
              </div>
              <span className="hig-garment-name">{displayName}</span>
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
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
            extraActions={
              equippedItems.length > 0 ? (
                <button
                  type="button"
                  className="hig-circle-icon-btn is-subtle"
                  onClick={handleClearAll}
                  aria-label={tx(lang, '착장 초기화', 'Reset Outfit')}
                >
                  <RotateCcw size={17} />
                </button>
              ) : null
            }
          />
        </div>
      </header>

      {/* Ultra-Minimal Apple HIG Tomorrow Weather Bar */}
      <section
        id={CARBON_DOM_CONTRACT.weatherRecommendPanelId}
        className="weather-recommend-panel"
        aria-label={tx(lang, '내일 날씨 코디', 'Tomorrow Weather')}
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
              <strong>{tx(lang, '내일 날씨 코디', 'Tomorrow Weather')}</strong>
            </span>

            {weather && (
              <span className="weather-temp-compact tabular-nums">
                {weather.tempMin}°/{weather.tempMax}°
              </span>
            )}
          </div>

          {recommendations.length > 0 && (
            <div
              className="weather-look-pills"
              role="list"
              aria-label={tx(lang, '추천 코디', 'Recommended Looks')}
            >
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
              aria-label={tx(lang, '도시 선택', 'Select City')}
              className="weather-city-select"
              value={cityKey}
              onChange={(e) => handleSelectCity(e.target.value)}
            >
              {gpsCoords && (
                <option value="gps">{tx(lang, '내 위치', 'My Location')}</option>
              )}
              {cities.map((c) => {
                const koName = c.name.split('·')[0].trim();
                const label =
                  lang === 'en'
                    ? CITY_EN_NAMES[c.key] || localizeOutfitTitle(koName, 'en')
                    : koName;
                return (
                  <option key={c.key} value={c.key}>
                    {label}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              className="weather-icon-btn"
              onClick={handleUseGpsLocation}
              disabled={locatingGps}
              aria-label={tx(lang, '현재 위치 예보', 'Use Current GPS Location')}
            >
              <LocateFixed size={13} />
            </button>

            <button
              type="button"
              id="log-tomorrow-outfit-btn"
              className="weather-icon-btn"
              disabled={loggingTomorrow || equippedItems.length === 0}
              onClick={handleLogTomorrowCalendar}
              title={tx(lang, '내일 캘린더에 기록', 'Log to Tomorrow Calendar')}
              aria-label={tx(lang, '내일 캘린더에 기록', 'Log to Tomorrow Calendar')}
            >
              <CalendarPlus size={13} />
            </button>
          </div>
        </div>

        <div
          className="hig-pill-rail weather-scenario-rail"
          role="tablist"
          aria-label={tx(lang, '날씨', 'Weather Conditions')}
        >
          {scenarios.map((sc) => {
            const active = scenarioKey === sc.key;
            const pair = SHORT_SCENARIO_LABELS[sc.key];
            const shortLabel = pair
              ? lang === 'en'
                ? pair.en
                : pair.ko
              : localizeOutfitTitle(sc.label, lang);
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
        {/* Center: Isometric Parametric Character Stage */}
        <div className="studio-25d-stage-col">
          <Studio25DCanvas
            slots={slots}
            renderResult={renderResult}
            theme={theme}
            lang={lang}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            avatarSpec={bridgedAvatar.spec}
            avatarConfigHash={bridgedAvatar.avatarConfigHash}
            weather={weather}
            activeSlotKey={activeSlotKey}
            onSelectSlot={(slotKey) => {
              setActiveSlotKey(slotKey);
              if (window.innerWidth < 700) {
                setMobileSheetOpen(true);
              }
            }}
            onUnequipSlot={handleUnequipSlot}
            onQuickSelectPreset={handleQuickSelectSkinPreset}
            onOpenSkinToneModal={() => {
              if (onOpenSkinToneModal) onOpenSkinToneModal();
              else onOpenProfile?.('skin');
            }}
            onOpenBodyModal={handleOpenBodyModal}
          />

          {/* Mobile Slot Dock (< 700px) */}
          <div className="studio-mobile-slot-bar">
            {FITTING_SLOTS.map((slot) => {
              const assigned = slots[slot.key];
              const isSelected = activeSlotKey === slot.key;
              const slotText = lang === 'en' ? slot.label : slot.labelKo;
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
                  <span>{slotText}</span>
                  {assigned ? <span className="studio-slot-dot" /> : <Plus size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side (>= 700px): Minimal Slot Inventory Grid */}
        <aside id={CARBON_DOM_CONTRACT.studioSlotPickerId} className="studio-desktop-picker-col">
          <div
            className="hig-pill-rail studio-slot-tabs"
            role="tablist"
            aria-label={tx(lang, '코디 슬롯', 'Outfit Slots')}
          >
            {FITTING_SLOTS.map((slot) => {
              const active = activeSlotKey === slot.key;
              const hasItem = Boolean(slots[slot.key]);
              const slotText = lang === 'en' ? slot.label : slot.labelKo;
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
                  <span>{slotText}</span>
                  {hasItem && <span className="studio-slot-dot" />}
                </button>
              );
            })}
          </div>

          {renderSeasonFilterRail()}

          <div className="studio-desktop-inventory-scroll">{renderSlotInventoryGrid(false)}</div>

          <form onSubmit={handleSaveOutfit} className="studio-save-bar">
            <input
              type="text"
              className="hig-native-input"
              placeholder={tx(lang, '코디 이름', 'Outfit Name')}
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
              <span>{tx(lang, '저장', 'Save')}</span>
            </button>
          </form>

          {uniqueSavedOutfits.length > 0 && (
            <div className="studio-saved-looks-rail" aria-label="Saved Outfits">
              {uniqueSavedOutfits.map((outfit) => {
                const displayOutfitTitle = localizeOutfitTitle(outfit.title, lang);
                return (
                  <div key={outfit.id} className="studio-saved-look-chip">
                    <button
                      type="button"
                      className="studio-saved-look-select"
                      onClick={() => handleApplySavedOutfit(outfit)}
                    >
                      {displayOutfitTitle}
                    </button>
                    <button
                      type="button"
                      className="studio-saved-look-del"
                      aria-label={
                        lang === 'en'
                          ? `Delete ${displayOutfitTitle}`
                          : `${outfit.title} 삭제`
                      }
                      onClick={() => handleDeleteSavedOutfit(outfit.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Save Bar */}
      <form onSubmit={handleSaveOutfit} className="studio-mobile-save-row">
        <input
          type="text"
          className="hig-native-input"
          placeholder={tx(lang, '코디 이름', 'Outfit Name')}
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
          <span>{tx(lang, '저장', 'Save')}</span>
        </button>
      </form>

      {/* Mobile Bottom Sheet Mini Inventory Picker */}
      <ResponsiveSheetModal
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        lang={lang}
        title={(() => {
          const activeDef = FITTING_SLOTS.find((s) => s.key === activeSlotKey);
          if (!activeDef) return tx(lang, '아이템 선택', 'Select Item');
          return lang === 'en' ? activeDef.label : activeDef.labelKo;
        })()}
        maxWidth={520}
      >
        <div className="hig-pill-rail" style={{ marginBottom: 10 }}>
          {FITTING_SLOTS.map((slot) => (
            <button
              key={slot.key}
              type="button"
              className={`hig-filter-pill ${activeSlotKey === slot.key ? 'active' : ''}`}
              onClick={() => setActiveSlotKey(slot.key)}
            >
              {lang === 'en' ? slot.label : slot.labelKo}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>{renderSeasonFilterRail()}</div>
        {renderSlotInventoryGrid(true)}
      </ResponsiveSheetModal>
    </section>
  );
}
