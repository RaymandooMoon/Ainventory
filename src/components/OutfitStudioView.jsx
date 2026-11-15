import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  Cloud,
  CloudRain,
  CloudSun,
  Filter,
  Flame,
  Layers,
  LocateFixed,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Snowflake,
  Sun,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  bridgeLegacyPropsToAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  ACCESSORY_SUBTREE_SLOTS,
  ALL_EQUIPPABLE_SLOT_KEYS,
  FITTING_SLOTS,
  JEWELRY_SUBTREE_SLOTS,
  SUB_SLOT_META_BY_KEY,
  doesGarmentMatchSubSlot,
  getOppositeSideSubSlot,
  isAccessorySlotKey,
  isJewelrySlotKey,
  isSwimwearGarment,
  isUmbrellaGarment,
  isWearableStudioGarment,
  mapGarmentToDefaultSubSlot,
  mapGarmentToFittingSlot,
  resolveParentFittingTab,
} from '../services/fittingRenderer.ts';
import { SEASON_BEST_SWATCHES } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import {
  localizeApiMessage,
  localizeGarmentName,
  localizeMaterialLabel,
  localizeOutfitTitle,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import OutfitCategorySilhouetteRail from './OutfitCategorySilhouetteRail.tsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import { ResponsiveSheetModal, TopRightUtilityActions } from './common/AppUI.jsx';
import '../styles/atelierTokens.css';
import './OutfitWardrobeDrawer.css';

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
  cloudy_overcast: { ko: '흐림', en: 'Cloudy' },
  rainy_cool: { ko: '비', en: 'Rain' },
  snowy_winter: { ko: '눈', en: 'Snow' },
  windy_gale: { ko: '강풍', en: 'Windy' },
  warm_spring: { ko: '포근', en: 'Mild' },
  summer_heatwave: { ko: '폭염', en: 'Heatwave' },
  winter_cold: { ko: '한파', en: 'Coldwave' },
};

const DEFAULT_SCENARIOS = [
  { key: 'live', label: '예보' },
  { key: 'crisp_autumn', label: '맑음' },
  { key: 'cloudy_overcast', label: '흐림' },
  { key: 'rainy_cool', label: '비' },
  { key: 'snowy_winter', label: '눈' },
  { key: 'windy_gale', label: '강풍' },
  { key: 'warm_spring', label: '포근' },
  { key: 'summer_heatwave', label: '폭염' },
  { key: 'winter_cold', label: '한파' },
];

const STUDIO_OCCASION_TABS = [
  { key: 'all', ko: '전체', en: 'All' },
  { key: 'daily', ko: '데일리', en: 'Daily' },
  { key: 'office', ko: '오피스', en: 'Office' },
  { key: 'formal', ko: '포멀', en: 'Formal' },
];

const DAILY_KEYWORDS_RE =
  /daily|casual|sport|tshirt|t-shirt|tee|hood|sweat|denim|jean|short|sneaker|sandal|flip_flop|cap|beanie|bucket|windbreaker|parka|padding|puffer|cardigan|knit|tote|backpack|swim|bikini|rashguard|데일리|캐주얼|티셔츠|데님|청바지|스니커즈|후드|맨투맨|패딩|볼캡|비니|버킷햇|윈드브레이커|가디건|니트|토트|수영복/i;

const OFFICE_KEYWORDS_RE =
  /office|smart|business|shirt|blouse|slacks|trouser|blazer|trench|coat|loafer|derby|oxford|heel|pump|briefcase|shoulder|watch|belt|eyewear|glasses|scarf|cardigan|skirt|pleat|dress|onepiece|오피스|출근|셔츠|블라우스|슬랙스|블레이저|트렌치|코트|로퍼|브리프케이스|숄더백|안경|아이웨어|시계|벨트|스커트|원피스/i;

const FORMAL_KEYWORDS_RE =
  /formal|ceremony|evening|suit|blazer|coat|dress|onepiece|silk|cashmere|wool|necktie|tie|oxford|derby|heel|pump|boot|clutch|briefcase|pearl|diamond|gold|silver|platinum|brooch|necklace|earring|ring|bracelet|watch|포멀|정장|수트|하객|블레이저|핸드메이드|실크|캐시미어|타이|넥타이|옥스포드|더비|힐|부츠|원피스|브로치|목걸이|귀걸이|반지|진주|골드|실버/i;

function doesGarmentMatchOccasion(garment, occasionFilter) {
  if (!occasionFilter || occasionFilter === 'all') return true;
  if (!garment) return false;

  const formality = String(garment.formality || '')
    .trim()
    .toLowerCase();
  const occasionRaw = String(garment.occasion || '')
    .trim()
    .toLowerCase();
  const blob = [
    garment.occasion,
    garment.subcategory,
    garment.name,
    garment.name_en,
    garment.fabric,
    garment.brand,
  ]
    .filter(Boolean)
    .join(' ');

  if (occasionFilter === 'daily') {
    if (formality === 'casual' || formality === 'sport') return true;
    if (occasionRaw.includes('daily') || occasionRaw.includes('데일리') || occasionRaw.includes('casual')) {
      return true;
    }
    if (DAILY_KEYWORDS_RE.test(blob)) return true;
    return !formality && !FORMAL_KEYWORDS_RE.test(blob);
  }

  if (occasionFilter === 'office') {
    if (formality === 'smart') return true;
    if (
      occasionRaw.includes('office') ||
      occasionRaw.includes('오피스') ||
      occasionRaw.includes('business') ||
      occasionRaw.includes('출근')
    ) {
      return true;
    }
    return OFFICE_KEYWORDS_RE.test(blob);
  }

  if (occasionFilter === 'formal') {
    if (formality === 'formal') return true;
    if (
      occasionRaw.includes('formal') ||
      occasionRaw.includes('포멀') ||
      occasionRaw.includes('하객') ||
      occasionRaw.includes('정장')
    ) {
      return true;
    }
    return FORMAL_KEYWORDS_RE.test(blob);
  }

  return true;
}

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

function groupSubSlotsByBranch(subSlots) {
  const branches = [];
  const byKey = new Map();
  for (const slot of subSlots) {
    let group = byKey.get(slot.branchKey);
    if (!group) {
      group = {
        branchKey: slot.branchKey,
        branchKo: slot.branchKo,
        branchEn: slot.branchEn,
        items: [],
      };
      byKey.set(slot.branchKey, group);
      branches.push(group);
    }
    group.items.push(slot);
  }
  return branches;
}

const ACCESSORY_BRANCH_GROUPS = groupSubSlotsByBranch(ACCESSORY_SUBTREE_SLOTS);
const JEWELRY_BRANCH_GROUPS = groupSubSlotsByBranch(JEWELRY_SUBTREE_SLOTS);

const EMPTY_STUDIO_SLOTS = Object.freeze(
  Object.fromEntries(ALL_EQUIPPABLE_SLOT_KEYS.map((k) => [k, null]))
);

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
  const isRainyWeather = Boolean(
    weather?.isRainy || weather?.isRaining || weather?.scenarioKey === 'rainy_cool'
  );

  const next = { ...EMPTY_STUDIO_SLOTS };

  next.outer = resolveItem(slotMap.outer);
  next.onepiece = resolveItem(slotMap.onepiece) || resolveItem(slotMap.dress);
  const rawTop = resolveItem(slotMap.top);
  if (!next.onepiece && rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece') {
    next.onepiece = rawTop;
  }

  const hasNonSwimOnepiece = Boolean(next.onepiece && !isSwimwearGarment(next.onepiece));
  next.top =
    hasNonSwimOnepiece || (rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece')
      ? null
      : rawTop;
  next.bottom = hasNonSwimOnepiece ? null : resolveItem(slotMap.bottom);
  next.shoes = resolveItem(slotMap.shoes);

  const candidateAcc = resolveItem(slotMap.accessory);
  const candidateNeck = resolveItem(slotMap.neckwear) || resolveItem(slotMap.acc_neck);
  const candidateHead = resolveItem(slotMap.headwear) || resolveItem(slotMap.acc_head);
  const candidateUmbrella =
    resolveItem(slotMap.acc_umbrella) ||
    resolveItem(slotMap.umbrella) ||
    (isRainyWeather
      ? (allGarments || []).find((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)) || null
      : null);

  if (candidateAcc) {
    const mappedAccSlot = mapGarmentToDefaultSubSlot(candidateAcc);
    next[mappedAccSlot] = candidateAcc;
  }
  if (candidateNeck && !next.acc_neck) {
    next.acc_neck = candidateNeck;
  }
  if (isChillyOrWindy && candidateHead && !next.acc_head) {
    next.acc_head = candidateHead;
  }
  if (candidateUmbrella) {
    next.acc_umbrella = candidateUmbrella;
  }

  if (Array.isArray(rec?.items)) {
    for (const raw of rec.items) {
      const item = resolveItem(raw);
      if (!item) continue;
      const defaultKey = mapGarmentToDefaultSubSlot(item);
      if (defaultKey === 'onepiece') {
        if (!next.onepiece) {
          next.onepiece = item;
          if (!isSwimwearGarment(item)) {
            next.top = null;
            next.bottom = null;
          }
        }
      } else if (defaultKey === 'top' || defaultKey === 'bottom') {
        if (!next[defaultKey] && !(next.onepiece && !isSwimwearGarment(next.onepiece))) {
          next[defaultKey] = item;
        }
      } else if (!next[defaultKey]) {
        next[defaultKey] = item;
      }
    }
  }

  return next;
}

function buildInitialStudioSlots(garments, preEquippedGarment) {
  const wearableList = (Array.isArray(garments) ? garments : []).filter((g) =>
    isWearableStudioGarment(g)
  );
  const findFirst = (slotKey) =>
    wearableList.find((g) => doesGarmentMatchSubSlot(g, slotKey)) || null;

  if (preEquippedGarment && isWearableStudioGarment(preEquippedGarment)) {
    const targetSlot = mapGarmentToDefaultSubSlot(preEquippedGarment);
    const preIsNonSwimOnepiece =
      targetSlot === 'onepiece' && !isSwimwearGarment(preEquippedGarment);
    const next = {
      ...EMPTY_STUDIO_SLOTS,
      top: preIsNonSwimOnepiece ? null : findFirst('top'),
      bottom: preIsNonSwimOnepiece ? null : findFirst('bottom'),
      shoes: findFirst('shoes'),
    };
    next[targetSlot] = preEquippedGarment;
    return next;
  }

  if (wearableList.length > 0) {
    const initialTop = findFirst('top');
    const initialBottom = findFirst('bottom');
    const initialOnepiece = !initialTop && !initialBottom ? findFirst('onepiece') : null;
    return {
      ...EMPTY_STUDIO_SLOTS,
      top: initialTop,
      bottom: initialBottom,
      onepiece: initialOnepiece,
      shoes: findFirst('shoes'),
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
  onToggleTheme,
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
    return bridgeLegacyPropsToAvatarSpec({
      skinProfile,
      bodySpec,
      user,
      personReferenceUrl: skinProfile?.portraitDataUrl || null,
    });
  }, [skinProfile, bodySpec, user, storedAvatarSpec, storedAvatarHash]);

  const [rawSlots, setSlots] = useState(() =>
    preEquippedGarment
      ? buildInitialStudioSlots(garments, preEquippedGarment)
      : { ...EMPTY_STUDIO_SLOTS }
  );
  const [hasExplicitSlotState, setHasExplicitSlotState] = useState(true);
  const [activeSlotKey, setActiveSlotKey] = useState(() =>
    preEquippedGarment ? mapGarmentToDefaultSubSlot(preEquippedGarment) : 'top'
  );
  const [occasionFilter, setOccasionFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredGarment, setHoveredGarment] = useState(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [manualRainUmbrellaCleared, setManualRainUmbrellaCleared] = useState(false);
  const [vtonRefreshNonce, setVtonRefreshNonce] = useState(0);

  const userModifiedSlotsRef = useRef(Boolean(preEquippedGarment));
  const forceAutoApplyWeatherRef = useRef(false);
  const ensuredSeedClosetsRef = useRef(new Set());
  const desktopTitleInputRef = useRef(null);
  const mobileTitleInputRef = useRef(null);
  const desktopSearchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

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

  const activeParentTab = useMemo(
    () => resolveParentFittingTab(activeSlotKey),
    [activeSlotKey]
  );

  const handleSelectTopFittingTab = useCallback((tabKey) => {
    triggerHaptic('selection');
    setHoveredGarment(null);
    if (tabKey === 'accessory') {
      setActiveSlotKey((prev) => (isAccessorySlotKey(prev) ? prev : 'accessory'));
    } else if (tabKey === 'jewelry') {
      setActiveSlotKey((prev) => (isJewelrySlotKey(prev) ? prev : 'jwl_neck'));
    } else {
      setActiveSlotKey(tabKey);
    }
  }, []);

  const handleStepPrevFittingTab = useCallback(() => {
    const curIdx = FITTING_SLOTS.findIndex((s) => s.key === activeParentTab);
    const prevIdx = curIdx > 0 ? curIdx - 1 : FITTING_SLOTS.length - 1;
    handleSelectTopFittingTab(FITTING_SLOTS[prevIdx].key);
  }, [activeParentTab, handleSelectTopFittingTab]);

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
          const effectiveW = {
            ...(data?.weather || {}),
            scenarioKey,
            ...(scenarioKey === 'rainy_cool' ? { isRainy: true, isRaining: true } : {}),
            ...(scenarioKey === 'snowy_winter' ? { isSnowy: true } : {}),
          };
          setSlots(mapWeatherRecToSlots(chosenRec, garments, effectiveW));
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

  const weather = useMemo(() => {
    const raw = weatherPayload?.weather || null;
    const rawMatchesScenario = Boolean(raw && (!raw.scenarioKey || raw.scenarioKey === scenarioKey));

    if (scenarioKey === 'rainy_cool') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 9,
              tempMax: 13,
              avgTemp: 11,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'rainy_cool',
        isRainy: true,
        isRaining: true,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'winter_cold') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: -10,
              tempMax: -4,
              avgTemp: -7,
              windSpeed: 28,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'winter_cold',
        isRainy: false,
        isSnowy: false,
        isWindy: true,
      };
    }
    if (scenarioKey === 'snowy_winter') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: -3,
              tempMax: 1,
              avgTemp: -1,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'snowy_winter',
        isRainy: false,
        isSnowy: true,
      };
    }
    if (scenarioKey === 'cloudy_overcast') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 11,
              tempMax: 16,
              avgTemp: 13.5,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'cloudy_overcast',
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'windy_gale') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 6,
              tempMax: 14,
              avgTemp: 10,
              windSpeed: 31,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'windy_gale',
        isWindy: true,
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'summer_heatwave') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 26,
              tempMax: 34,
              avgTemp: 31,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'summer_heatwave',
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'crisp_autumn' || scenarioKey === 'warm_spring') {
      return rawMatchesScenario
        ? { ...raw, scenarioKey, isRainy: false, isSnowy: false }
        : {
            tempMin: scenarioKey === 'warm_spring' ? 14 : 8,
            tempMax: scenarioKey === 'warm_spring' ? 23 : 17,
            avgTemp: scenarioKey === 'warm_spring' ? 18.5 : 12.5,
            cityName: raw?.cityName || '서울',
            scenarioKey,
            isRainy: false,
            isSnowy: false,
          };
    }
    return raw ? { ...raw, scenarioKey } : null;
  }, [weatherPayload, scenarioKey]);

  const isRainyWeatherActive = Boolean(
    scenarioKey === 'rainy_cool' || weather?.isRainy || weather?.isRaining
  );

  // Auto-seed 5 material items per newly created sub-slot (including rainy-day umbrellas) when empty
  useEffect(() => {
    const needsSubSlotCheck =
      isAccessorySlotKey(activeSlotKey) || isJewelrySlotKey(activeSlotKey);
    if (!needsSubSlotCheck && !isRainyWeatherActive) return;

    const closetKey = activeCloset || 'sample';
    const checkSlot = isRainyWeatherActive && !needsSubSlotCheck ? 'acc_umbrella' : activeSlotKey;
    const matchingCount = garments.filter((g) => doesGarmentMatchSubSlot(g, checkSlot)).length;
    const umbrellaCount = isRainyWeatherActive
      ? garments.filter((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)).length
      : 1;

    if (matchingCount > 0 && umbrellaCount > 0) return;

    const guardKey = `${closetKey}:${checkSlot}:${isRainyWeatherActive ? 'rain' : 'slot'}`;
    if (ensuredSeedClosetsRef.current.has(guardKey)) return;
    ensuredSeedClosetsRef.current.add(guardKey);

    let cancelled = false;
    apiFetch('/garments/ensure-material-seeds', {
      method: 'POST',
      body: JSON.stringify({ closet_owner: closetKey }),
    })
      .then((res) => {
        if (!cancelled && res?.inserted > 0) {
          onClosetUpdated?.();
        }
      })
      .catch(() => {
        // ignore offline/seed race
      });

    return () => {
      cancelled = true;
    };
  }, [activeSlotKey, isRainyWeatherActive, garments, activeCloset, onClosetUpdated]);

  const slots = useMemo(() => {
    const hasRawSelection = Object.values(rawSlots).some(Boolean);
    const baseSlots =
      !hasRawSelection && !hasExplicitSlotState && garments.length > 0
        ? buildInitialStudioSlots(garments, null)
        : rawSlots;

    const next = { ...EMPTY_STUDIO_SLOTS };
    if (garments.length === 0) {
      for (const key of ALL_EQUIPPABLE_SLOT_KEYS) {
        next[key] = baseSlots[key] || null;
      }
      return next;
    }

    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    for (const key of ALL_EQUIPPABLE_SLOT_KEYS) {
      const cur = baseSlots[key];
      if (!cur) continue;
      const resolved = byId.get(Number(cur.id)) || cur;
      next[key] = resolved && isWearableStudioGarment(resolved) ? resolved : null;
    }

    // Automatically equip first available umbrella on rainy weather unless user explicitly unequipped it
    if (isRainyWeatherActive && !manualRainUmbrellaCleared && !next.acc_umbrella) {
      const firstUmbrella =
        garments.find((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)) || null;
      if (firstUmbrella) {
        next.acc_umbrella = firstUmbrella;
      }
    }

    return next;
  }, [rawSlots, hasExplicitSlotState, garments, isRainyWeatherActive, manualRainUmbrellaCleared]);

  const totalWearableCount = useMemo(
    () => garments.filter((g) => isWearableStudioGarment(g)).length,
    [garments]
  );

  const rawSlotGarmentCount = useMemo(
    () =>
      garments.filter(
        (g) => isWearableStudioGarment(g) && doesGarmentMatchSubSlot(g, activeSlotKey)
      ).length,
    [garments, activeSlotKey]
  );

  const slotGarments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return garments.filter((g) => {
      if (!isWearableStudioGarment(g)) return false;
      if (!doesGarmentMatchSubSlot(g, activeSlotKey)) return false;
      if (!doesGarmentMatchOccasion(g, occasionFilter)) return false;
      if (seasonFilter !== 'all' && !parseSeasons(g.seasons).includes(seasonFilter)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        g.name,
        g.name_en,
        localizeGarmentName(g.name, lang),
        g.brand,
        g.color_name,
        g.subcategory,
        g.fabric,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [garments, activeSlotKey, occasionFilter, seasonFilter, searchQuery, lang]);

  const equippedItems = useMemo(() => {
    return ALL_EQUIPPABLE_SLOT_KEYS.map((k) => slots[k]).filter(Boolean);
  }, [slots]);

  const equippedCountByParentTab = useMemo(() => {
    const accCount = ACCESSORY_SUBTREE_SLOTS.filter((s) => Boolean(slots[s.key])).length;
    const jwlCount = JEWELRY_SUBTREE_SLOTS.filter((s) => Boolean(slots[s.key])).length;
    return {
      outer: slots.outer ? 1 : 0,
      top: slots.top ? 1 : 0,
      bottom: slots.bottom ? 1 : 0,
      onepiece: slots.onepiece ? 1 : 0,
      shoes: slots.shoes ? 1 : 0,
      accessory: accCount,
      jewelry: jwlCount,
    };
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
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setCityKey(nextCity);
    triggerHaptic('selection');
  };

  const handleSelectScenario = (nextScenario) => {
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setScenarioKey(nextScenario);
    if (nextScenario === 'rainy_cool') {
      const firstUmbrella = garments.find(
        (g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)
      );
      if (firstUmbrella) {
        setSlots((prev) => ({ ...prev, acc_umbrella: firstUmbrella }));
        setHasExplicitSlotState(true);
      }
    }
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
        setManualRainUmbrellaCleared(false);
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
    setManualRainUmbrellaCleared(false);
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
    const targetSlotKey = doesGarmentMatchSubSlot(item, activeSlotKey)
      ? activeSlotKey
      : mapGarmentToDefaultSubSlot(item);
    const isUnequipping = slots[targetSlotKey]?.id === item.id;

    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    if (targetSlotKey === 'acc_umbrella') {
      setManualRainUmbrellaCleared(isUnequipping);
    }
    triggerHaptic('selection');

    const nextSlots = {
      ...slots,
      [targetSlotKey]: isUnequipping ? null : item,
    };

    if (!isUnequipping) {
      if (targetSlotKey === 'onepiece' && !isSwimwearGarment(item)) {
        // Non-swimwear dress/jumpsuit replaces top & bottom cleanly
        nextSlots.top = null;
        nextSlots.bottom = null;
      } else if (
        (targetSlotKey === 'top' || targetSlotKey === 'bottom') &&
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
    if (slotKey === 'acc_umbrella') {
      setManualRainUmbrellaCleared(true);
    }
    triggerHaptic('selection');
    setSlots({ ...slots, [slotKey]: null });
  };

  const handleClearAll = () => {
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    setManualRainUmbrellaCleared(true);
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
    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    const next = { ...EMPTY_STUDIO_SLOTS };
    for (const rawId of outfit.item_ids || []) {
      const g = byId.get(Number(rawId));
      if (!g || !isWearableStudioGarment(g)) continue;
      const defaultKey = mapGarmentToDefaultSubSlot(g);
      if (!next[defaultKey]) {
        next[defaultKey] = g;
      } else {
        const oppKey = getOppositeSideSubSlot(defaultKey);
        if (oppKey && !next[oppKey]) {
          next[oppKey] = g;
        }
      }
    }
    if (next.onepiece && !isSwimwearGarment(next.onepiece)) {
      next.top = null;
      next.bottom = null;
    }
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    if (next.acc_umbrella) {
      setManualRainUmbrellaCleared(false);
    }
    triggerHaptic('selection');
    setSlots(next);
  };

  const handleRestoreHistorySlots = useCallback(
    (slotGarmentIds) => {
      if (!slotGarmentIds || typeof slotGarmentIds !== 'object') return false;
      const entries = Object.entries(slotGarmentIds);
      if (entries.length === 0) return false;
      const byId = new Map(garments.map((g) => [Number(g.id), g]));
      const next = { ...EMPTY_STUDIO_SLOTS };
      let matchedCount = 0;
      for (const [slotKey, rawId] of entries) {
        const g = byId.get(Number(rawId));
        if (!g || !isWearableStudioGarment(g)) continue;
        if (ALL_EQUIPPABLE_SLOT_KEYS.includes(slotKey)) {
          next[slotKey] = g;
          matchedCount += 1;
        }
      }
      if (matchedCount === 0) return false;
      userModifiedSlotsRef.current = true;
      setActiveRecId(null);
      setHasExplicitSlotState(true);
      setManualRainUmbrellaCleared(!next.acc_umbrella);
      triggerHaptic('selection');
      setSlots(next);
      return true;
    },
    [garments]
  );

  const handleDeleteSavedOutfit = async (outfitId) => {
    try {
      await apiFetch(`/outfits/${outfitId}`, { method: 'DELETE' });
      await reloadOutfits();
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '코디 삭제에 실패했습니다.', 'Failed to delete outfit.')
      );
    }
  };

  const handleNavigateToCloset = useCallback(() => {
    setMobileSheetOpen(false);
    triggerHaptic('selection');
    const closetTabBtn =
      typeof document !== 'undefined'
        ? document.querySelector('[data-nav-tab="closet"]')
        : null;
    if (closetTabBtn && typeof closetTabBtn.click === 'function') {
      closetTabBtn.click();
    }
  }, []);

  const renderSlotSearchBar = (inputRef) => (
    <div className="studio-slot-search-wrap studio-clearable-input-wrap">
      <Search size={15} className="studio-slot-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        data-outfit-garment-search="true"
        className="hig-native-input studio-slot-search-input has-clear-btn"
        placeholder={tx(
          lang,
          '의류 이름 · 브랜드 · 색상 검색',
          'Search item, brand, color...'
        )}
        aria-label={tx(lang, '코디 의류 검색', 'Search garments in slot')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        maxLength={60}
      />
      {searchQuery.length > 0 && (
        <button
          type="button"
          data-clear-outfit-search="true"
          className="studio-input-clear-btn"
          aria-label={tx(lang, '검색어 전체 지우기', 'Clear search text')}
          onClick={() => {
            triggerHaptic('selection');
            setSearchQuery('');
            inputRef?.current?.focus?.();
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );

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
            {active && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
            <span>{tx(lang, s.ko, s.en)}</span>
          </button>
        );
      })}
    </div>
  );

  const renderSubTreePanel = () => {
    const isAcc = activeParentTab === 'accessory';
    const isJwl = activeParentTab === 'jewelry';
    if (!isAcc && !isJwl) return null;

    const branchGroups = isAcc ? ACCESSORY_BRANCH_GROUPS : JEWELRY_BRANCH_GROUPS;
    const activeMeta = SUB_SLOT_META_BY_KEY[activeSlotKey];
    const activeEquipped = slots[activeSlotKey] || null;

    return (
      <div
        className="studio-subtree-panel"
        data-accessory-subtree={isAcc ? 'true' : undefined}
        data-jewelry-subtree={isJwl ? 'true' : undefined}
        role="region"
        aria-label={
          isAcc
            ? tx(lang, '액세서리 부위별 착용 트리', 'Accessory Body-Part Tree')
            : tx(lang, '주얼리 부위별 착용 트리', 'Jewelry Body-Part Tree')
        }
      >
        {branchGroups.map((group) => (
          <div key={group.branchKey} className="studio-subtree-branch">
            <span className="studio-subtree-branch-label">
              {lang === 'en' ? group.branchEn : group.branchKo}
            </span>
            <div className="studio-subtree-pills">
              {group.items.map((sub) => {
                const isSelected = activeSlotKey === sub.key;
                const equippedInSub = Boolean(slots[sub.key]);
                return (
                  <button
                    key={sub.key}
                    type="button"
                    data-sub-slot-btn={sub.key}
                    aria-pressed={isSelected}
                    className={`studio-subtree-pill ${isSelected ? 'active' : ''} ${equippedInSub ? 'is-equipped' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setActiveSlotKey(sub.key);
                    }}
                  >
                    {isSelected && <Check size={11} strokeWidth={2.6} aria-hidden="true" />}
                    <span>{lang === 'en' ? sub.labelEn : sub.labelKo}</span>
                    {equippedInSub && <span className="studio-slot-dot" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {activeMeta && (
          <div className="studio-subtree-active-hint">
            <span>
              <strong>{lang === 'en' ? activeMeta.labelEn : activeMeta.labelKo}</strong>
              {' · '}
              {activeEquipped
                ? resolveGarmentDisplayName(activeEquipped, lang)
                : tx(
                    lang,
                    '각 부위(좌/우 포함) 동시 착용 가능',
                    'Simultaneous wear per part (incl. L/R)'
                  )}
            </span>
            {activeEquipped && (
              <button
                type="button"
                className="studio-subtree-unequip-btn"
                onClick={() => handleUnequipSlot(activeSlotKey)}
              >
                {tx(lang, '해제', 'Remove')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const activeSlotCategoryTitle = useMemo(() => {
    const subMeta = SUB_SLOT_META_BY_KEY[activeSlotKey];
    if (subMeta) {
      return lang === 'en' ? subMeta.labelEn : subMeta.labelKo;
    }
    const activeDef = FITTING_SLOTS.find((s) => s.key === activeParentTab);
    if (!activeDef) return tx(lang, '아이템 선택', 'Select Item');
    return lang === 'en' ? activeDef.label : activeDef.labelKo;
  }, [activeSlotKey, activeParentTab, lang]);

  const focusedDrawerTitle = useMemo(() => {
    if (hoveredGarment && doesGarmentMatchSubSlot(hoveredGarment, activeSlotKey)) {
      return resolveGarmentDisplayName(hoveredGarment, lang);
    }
    const equippedInActive = slots[activeSlotKey];
    if (equippedInActive) {
      return resolveGarmentDisplayName(equippedInActive, lang);
    }
    if (activeParentTab === 'top' && slots.onepiece) {
      return resolveGarmentDisplayName(slots.onepiece, lang);
    }
    return activeSlotCategoryTitle;
  }, [hoveredGarment, activeSlotKey, slots, activeParentTab, activeSlotCategoryTitle, lang]);

  const hasActiveDrawerFilter =
    occasionFilter !== 'all' || seasonFilter !== 'all' || searchQuery.trim().length > 0;

  const renderDrawerHeader = (isMobileSheet, inputRef) => (
    <div className="atelier-drawer-header">
      <div className="atelier-drawer-title-group">
        <button
          type="button"
          className="atelier-drawer-nav-btn"
          aria-label={
            isMobileSheet
              ? tx(lang, '옷장 서랍 닫기', 'Close wardrobe drawer')
              : tx(lang, '이전 카테고리', 'Previous category')
          }
          onClick={() => {
            if (isMobileSheet) {
              triggerHaptic('selection');
              setMobileSheetOpen(false);
            } else {
              handleStepPrevFittingTab();
            }
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <span
          className="atelier-drawer-focused-title"
          data-drawer-focused-title="true"
          title={focusedDrawerTitle}
        >
          {focusedDrawerTitle}
        </span>
      </div>
      <button
        type="button"
        className={`atelier-drawer-filter-btn ${hasActiveDrawerFilter ? 'has-active-filter' : ''}`.trim()}
        aria-label={tx(lang, '의류 검색 및 필터 포커스', 'Focus search and filters')}
        title={tx(lang, '검색 및 필터', 'Search & Filters')}
        onClick={() => {
          triggerHaptic('selection');
          inputRef?.current?.focus?.();
        }}
      >
        <Filter size={15} />
        {hasActiveDrawerFilter && <span className="atelier-drawer-filter-dot" aria-hidden="true" />}
      </button>
    </div>
  );

  const renderOccasionTabs = () => (
    <div
      className="atelier-occasion-tabs"
      role="tablist"
      aria-label={tx(lang, '무드 및 상황 필터', 'Mood & Occasion Filter')}
    >
      {STUDIO_OCCASION_TABS.map((tab) => {
        const active = occasionFilter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-outfit-occasion-tab={tab.key}
            aria-selected={active}
            className={`atelier-occasion-tab ${active ? 'is-active' : ''}`.trim()}
            onClick={() => {
              triggerHaptic('selection');
              setOccasionFilter(tab.key);
            }}
          >
            <span>{tx(lang, tab.ko, tab.en)}</span>
          </button>
        );
      })}
    </div>
  );

  const renderSlotInventoryGrid = (closeOnPick = false) => {
    const oppositeSlotKey = getOppositeSideSubSlot(activeSlotKey);
    const oppositeItem = oppositeSlotKey ? slots[oppositeSlotKey] : null;
    const showMaterialBadge =
      isAccessorySlotKey(activeSlotKey) || isJewelrySlotKey(activeSlotKey);
    const hasFilterOrSearch =
      occasionFilter !== 'all' || seasonFilter !== 'all' || searchQuery.trim().length > 0;
    const isFilterEmptyOnly = rawSlotGarmentCount > 0 && hasFilterOrSearch;

    return slotGarments.length === 0 ? (
      <div className="studio-slot-empty-state" data-slot-empty-state="true">
        <p className="studio-slot-empty-title">
          {isFilterEmptyOnly
            ? tx(
                lang,
                '검색어 또는 필터 조건에 맞는 의류가 없습니다.',
                'No garments match the current search or filter.'
              )
            : totalWearableCount === 0
              ? tx(
                  lang,
                  '아직 옷장에 등록된 의류가 없습니다.',
                  'Your closet has no garments yet.'
                )
              : tx(
                  lang,
                  '이 카테고리에 선택 가능한 의류가 없습니다.',
                  'No selectable garments in this category yet.'
                )}
        </p>
        <p className="studio-slot-empty-desc">
          {isFilterEmptyOnly
            ? tx(
                lang,
                '필터를 초기화하면 이 카테고리의 전체 의류를 다시 확인할 수 있습니다.',
                'Reset filters to view all garments available in this slot.'
              )
            : tx(
                lang,
                '옷장에서 의류 사진을 등록하면 4각도 AI 가상 피팅과 날씨 코디에 즉시 활용됩니다.',
                'Add garments in your Closet to try them on across 4 angles and weather scenes.'
              )}
        </p>
        {isFilterEmptyOnly ? (
          <button
            type="button"
            data-reset-outfit-filters="true"
            className="studio-empty-cta-btn"
            onClick={() => {
              triggerHaptic('selection');
              setOccasionFilter('all');
              setSeasonFilter('all');
              setSearchQuery('');
            }}
          >
            <RotateCcw size={14} />
            <span>{tx(lang, '필터·검색 초기화', 'Reset Search & Filter')}</span>
          </button>
        ) : (
          <button
            type="button"
            data-empty-go-closet-btn="true"
            className="studio-empty-cta-btn is-primary"
            onClick={handleNavigateToCloset}
          >
            <Plus size={15} />
            <span>{tx(lang, '옷장에서 의류 추가하기', 'Add Garments in Closet')}</span>
          </button>
        )}
      </div>
    ) : (
      <div className="studio-mini-inventory-grid">
        {slotGarments.map((item) => {
          const isEquipped = slots[activeSlotKey]?.id === item.id;
          const isEquippedOpposite = Boolean(oppositeItem && oppositeItem.id === item.id);
          const displayName = resolveGarmentDisplayName(item, lang);
          const oppositeBadgeLabel = oppositeSlotKey?.endsWith('_left')
            ? tx(lang, 'L 착용', 'Worn L')
            : tx(lang, 'R 착용', 'Worn R');
          return (
            <button
              key={item.id}
              type="button"
              data-slot-garment-id={item.id}
              aria-pressed={isEquipped}
              className={`studio-mini-garment-card atelier-packshot-card ${isEquipped ? 'is-equipped' : ''}`.trim()}
              onMouseEnter={() => setHoveredGarment(item)}
              onMouseLeave={() =>
                setHoveredGarment((prev) => (prev?.id === item.id ? null : prev))
              }
              onFocus={() => setHoveredGarment(item)}
              onBlur={() =>
                setHoveredGarment((prev) => (prev?.id === item.id ? null : prev))
              }
              onClick={() => {
                handleToggleEquip(item);
                if (closeOnPick) setMobileSheetOpen(false);
              }}
            >
              <div className="studio-mini-squircle">
                <GarmentObject25D item={item} alt={displayName} padding="10%" />
                {isEquipped && (
                  <span className="studio-equipped-badge" aria-hidden="true">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                )}
                {isEquippedOpposite && (
                  <span className="studio-opposite-side-badge">{oppositeBadgeLabel}</span>
                )}
              </div>
              <span className="hig-garment-name atelier-packshot-tooltip" title={displayName}>
                {displayName}
              </span>
              {showMaterialBadge && item.fabric && (
                <span className="studio-mini-material-tag">
                  {localizeMaterialLabel(item.fabric, lang)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section className="hig-screen-container hig-outfits-screen" aria-label="Outfits">
      <header id="hig-top-bar" className="hig-top-bar atelier-top-bar">
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
              <>
                {onToggleTheme && (
                  <button
                    type="button"
                    data-outfit-theme-toggle="true"
                    className="hig-circle-icon-btn is-subtle"
                    onClick={onToggleTheme}
                    aria-label={
                      theme === 'dark'
                        ? tx(lang, '라이트 모드로 전환', 'Switch to Light Mode')
                        : tx(lang, '다크 모드로 전환', 'Switch to Dark Mode')
                    }
                  >
                    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  </button>
                )}
                {equippedItems.length > 0 && (
                  <>
                    <button
                      type="button"
                      data-outfit-vton-refresh="true"
                      className="hig-circle-icon-btn is-subtle"
                      onClick={() => {
                        triggerHaptic('selection');
                        setVtonRefreshNonce((n) => n + 1);
                      }}
                      title={tx(
                        lang,
                        '날씨 포즈·투명 배경제거 새로고침',
                        'Regenerate Weather Pose & Cutout'
                      )}
                      aria-label={tx(lang, '피팅 새로고침', 'Refresh Try-On')}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      type="button"
                      className="hig-circle-icon-btn is-subtle"
                      onClick={handleClearAll}
                      aria-label={tx(lang, '착장 초기화', 'Reset Outfit')}
                    >
                      <RotateCcw size={17} />
                    </button>
                  </>
                )}
              </>
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
              ) : weather?.isSnowy || scenarioKey === 'winter_cold' ? (
                <Snowflake size={13} />
              ) : scenarioKey === 'summer_heatwave' ? (
                <Flame size={13} />
              ) : scenarioKey === 'cloudy_overcast' ? (
                <Cloud size={13} />
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
            theme={theme}
            lang={lang}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            avatarSpec={bridgedAvatar.spec}
            avatarConfigHash={bridgedAvatar.avatarConfigHash}
            weather={weather}
            scenarioKey={scenarioKey}
            forceRefreshNonce={vtonRefreshNonce}
            activeSlotKey={activeSlotKey}
            onSelectSlot={(slotKey) => {
              setActiveSlotKey(slotKey);
              if (window.innerWidth < 600) {
                setMobileSheetOpen(true);
              }
            }}
            onUnequipSlot={handleUnequipSlot}
            onRestoreHistorySlots={handleRestoreHistorySlots}
            onQuickSelectPreset={handleQuickSelectSkinPreset}
            onOpenSkinToneModal={() => {
              if (onOpenSkinToneModal) onOpenSkinToneModal();
              else onOpenProfile?.('skin');
            }}
            onOpenBodyModal={handleOpenBodyModal}
          />

          {/* Narrow Mobile (< 600px) Floating Smoked-Glass Drawer Trigger + Slot Bar */}
          <div className="atelier-mobile-drawer-trigger-row">
            <button
              type="button"
              data-mobile-wardrobe-trigger="true"
              className="atelier-mobile-drawer-open-btn"
              onClick={() => {
                triggerHaptic('selection');
                setMobileSheetOpen(true);
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Layers size={15} />
                <span>{focusedDrawerTitle}</span>
              </span>
              <span className="atelier-mobile-drawer-open-meta tabular-nums">
                {tx(lang, '옷장 서랍 열기', 'Open Wardrobe')}
              </span>
            </button>
          </div>

          {/* Mobile Slot Dock (< 600px) */}
          <div className="studio-mobile-slot-bar">
            {FITTING_SLOTS.map((slot) => {
              const count = equippedCountByParentTab[slot.key] || 0;
              const isSelected = activeParentTab === slot.key;
              const slotText = lang === 'en' ? slot.label : slot.labelKo;
              return (
                <button
                  key={slot.key}
                  type="button"
                  data-mobile-slot-btn={slot.key}
                  className={`studio-mobile-slot-pill ${isSelected ? 'active' : ''} ${count > 0 ? 'filled' : ''}`}
                  onClick={() => {
                    handleSelectTopFittingTab(slot.key);
                    setMobileSheetOpen(true);
                  }}
                >
                  <span>{slotText}</span>
                  {count > 1 ? (
                    <span className="studio-slot-count-badge">{count}</span>
                  ) : count === 1 ? (
                    <span className="studio-slot-dot" />
                  ) : (
                    <Plus size={12} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side (>= 600px): 42% Dark Smoked-Glass Wardrobe Drawer */}
        <aside id={CARBON_DOM_CONTRACT.studioSlotPickerId} className="studio-desktop-picker-col">
          {renderDrawerHeader(false, desktopSearchInputRef)}

          {renderOccasionTabs()}

          <div className="atelier-filter-strip">
            {renderSlotSearchBar(desktopSearchInputRef)}
            {renderSeasonFilterRail()}
          </div>

          {renderSubTreePanel()}

          <div className="atelier-drawer-body">
            <OutfitCategorySilhouetteRail
              activeParentTab={activeParentTab}
              equippedCountByParentTab={equippedCountByParentTab}
              lang={lang}
              isDesktopDrawer={true}
              onSelectTab={handleSelectTopFittingTab}
            />
            <div className="atelier-drawer-grid-col">
              <div className="atelier-drawer-grid-scroll">{renderSlotInventoryGrid(false)}</div>
            </div>
          </div>

          <form onSubmit={handleSaveOutfit} className="studio-save-bar">
            <div className="studio-clearable-input-wrap">
              <input
                ref={desktopTitleInputRef}
                type="text"
                className="hig-native-input has-clear-btn"
                placeholder={tx(lang, '코디 이름', 'Outfit Name')}
                aria-label={tx(lang, '코디 이름', 'Outfit Name')}
                value={outfitTitle}
                onChange={(e) => setOutfitTitle(e.target.value)}
                maxLength={80}
              />
              {outfitTitle.length > 0 && (
                <button
                  type="button"
                  data-clear-outfit-title="true"
                  className="studio-input-clear-btn"
                  aria-label={tx(lang, '코디 이름 전체 지우기', 'Clear outfit name')}
                  onClick={() => {
                    triggerHaptic('selection');
                    setOutfitTitle('');
                    desktopTitleInputRef.current?.focus?.();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
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

      {/* Mobile Save Bar (< 600px) */}
      <form onSubmit={handleSaveOutfit} className="studio-mobile-save-row">
        <div className="studio-clearable-input-wrap">
          <input
            ref={mobileTitleInputRef}
            type="text"
            className="hig-native-input has-clear-btn"
            placeholder={tx(lang, '코디 이름', 'Outfit Name')}
            aria-label={tx(lang, '코디 이름', 'Outfit Name')}
            value={outfitTitle}
            onChange={(e) => setOutfitTitle(e.target.value)}
            maxLength={80}
          />
          {outfitTitle.length > 0 && (
            <button
              type="button"
              data-clear-outfit-title="true"
              className="studio-input-clear-btn"
              aria-label={tx(lang, '코디 이름 전체 지우기', 'Clear outfit name')}
              onClick={() => {
                triggerHaptic('selection');
                setOutfitTitle('');
                mobileTitleInputRef.current?.focus?.();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
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

      {/* Mobile Narrow-Viewport (< 600px) Dark Smoked-Glass Wardrobe Sheet */}
      <ResponsiveSheetModal
        id="outfit-mobile-wardrobe-sheet"
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        lang={lang}
        title={activeSlotCategoryTitle}
        maxWidth={520}
      >
        {renderDrawerHeader(true, mobileSearchInputRef)}
        {renderOccasionTabs()}
        <div className="atelier-filter-strip">
          {renderSlotSearchBar(mobileSearchInputRef)}
          {renderSeasonFilterRail()}
        </div>
        {renderSubTreePanel()}
        <div className="atelier-drawer-body">
          <OutfitCategorySilhouetteRail
            activeParentTab={activeParentTab}
            equippedCountByParentTab={equippedCountByParentTab}
            lang={lang}
            isDesktopDrawer={false}
            onSelectTab={handleSelectTopFittingTab}
          />
          <div className="atelier-drawer-grid-col">
            <div className="atelier-drawer-grid-scroll">{renderSlotInventoryGrid(true)}</div>
          </div>
        </div>
      </ResponsiveSheetModal>
    </section>
  );
}
