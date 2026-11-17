import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Briefcase,
  ChevronDown,
  Cloud,
  CloudRain,
  CloudSun,
  Coffee,
  Flame,
  History,
  Layers,
  RefreshCw,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  GEMINI_API_KEY_EVENT,
  TURNAROUND_ANGLES,
  VTON_STYLE_PREF_EVENT,
  angle360ToSignedScrollDeg,
  buildAiVtonCacheKey,
  computeOutfitComboId,
  deleteCachedAiVtonOutfit,
  fetchServerGeminiConfigured,
  getStoredClientGeminiApiKey,
  getStoredVtonStylePreference,
  isDemoVtonShowcaseActive,
  listCachedAiVtonOutfits,
  loadShowcaseDemoVtonSlices,
  normalizeTurnaround360Angle,
  normalizeViewerMode,
  normalizeVtonStyleMode,
  peekMemoryAiVtonSlice,
  peekShowcaseDemoVtonSlice,
  readCachedAiVtonSlice,
  resolve360AngleRenderSpec,
  resolveClientGeminiApiKey,
  resolveEffectiveVtonStyleMode,
  resolveSignedAngleScrollState,
  synthesizeGeminiMultiAngleVton,
  trackFlatLayComboVisit,
} from '../services/vton2DService.ts';
import { SUB_SLOT_META_BY_KEY } from '../services/fittingRenderer.ts';
import {
  isStudioKeyActionableReason,
  resolveStudioStatusCapsule,
  shouldShowStudioAngleDock,
} from '../services/studioStatusCapsule.ts';
import {
  getWeatherStageBadgeMeta,
  resolveEffectiveWeatherFromRaw,
} from '../services/weatherPromptBuilder.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
import {
  DEFAULT_STAGE_BACKGROUND_ID,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import {
  formatWeatherCapsuleDateTime,
  resolveEffectiveClientTimeOfDay,
} from '../utils/tomorrowPromptPolicy.ts';
import EditorialFlatLayBoard from './EditorialFlatLayBoard.jsx';
import FittingAtelierBackdrop from './FittingAtelierBackdrop.tsx';
import StageGroundDeck from './FittingWeatherGroundDeck.tsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import WeatherCanvasOverlay from './WeatherCanvasOverlay.tsx';
import '../styles/atelierTokens.css';
import './Studio2DFittingViewer.css';

const AUTOGEN_STORAGE_KEY = 'ainventory_vton_autogen_v1';

function readStoredAutoGenEnabled() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(AUTOGEN_STORAGE_KEY) === '1';
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

function writeStoredAutoGenEnabled(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (enabled) {
        localStorage.setItem(AUTOGEN_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(AUTOGEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

function preloadImageUrls(urls) {
  if (typeof Image === 'undefined' || !Array.isArray(urls)) return;
  for (const url of urls) {
    if (typeof url === 'string' && url.length > 0) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }
}

const ORDERED_SLOT_KEYS = [
  'acc_head',
  'headwear',
  'acc_eyes',
  'jwl_ear_left',
  'jwl_ear_right',
  'acc_neck',
  'neckwear',
  'jwl_neck',
  'jwl_brooch',
  'outer',
  'top',
  'onepiece',
  'dress',
  'acc_belt',
  'bottom',
  'acc_wrist_left',
  'acc_wrist_right',
  'jwl_wrist_left',
  'jwl_wrist_right',
  'acc_hand_left',
  'acc_hand_right',
  'jwl_ring_left',
  'jwl_ring_right',
  'shoes',
  'accessory',
  'acc_umbrella',
];

const WEATHER_CAPSULE_SHORT_LABELS = {
  rain: { ko: '비', en: 'Rain' },
  snow: { ko: '눈', en: 'Snow' },
  coldwave: { ko: '한파', en: 'Coldwave' },
  heatwave: { ko: '폭염', en: 'Heatwave' },
  wind: { ko: '강풍', en: 'Windy' },
  cloudy: { ko: '흐림', en: 'Cloudy' },
  clear: { ko: '맑음', en: 'Clear' },
  mild: { ko: '포근', en: 'Mild' },
};

function renderWeatherCapsuleIcon(effectiveWeather, scenarioKey) {
  if (effectiveWeather === 'rain') return <CloudRain size={15} />;
  if (effectiveWeather === 'snow' || effectiveWeather === 'coldwave') {
    return <Snowflake size={15} />;
  }
  if (effectiveWeather === 'heatwave') return <Flame size={15} />;
  if (effectiveWeather === 'wind') return <Wind size={15} />;
  if (effectiveWeather === 'cloudy') return <Cloud size={15} />;
  if (scenarioKey === 'crisp_autumn') return <Sun size={15} />;
  return <CloudSun size={15} />;
}

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isKeyActionableReason(reason) {
  return isStudioKeyActionableReason(reason);
}

const LOOK_STYLE_TITLE_LABELS = {
  business_casual: {
    ko: '직장생활을 위한 비즈니스 캐주얼',
    en: 'Business Casual for Work',
  },
  comfortable_casual: {
    ko: '편한 캐주얼',
    en: 'Comfortable Casual',
  },
  formal_office: {
    ko: '포멀 · 오피스 정장',
    en: 'Formal Office',
  },
  minimal_daily: {
    ko: '미니멀 데일리',
    en: 'Minimal Daily',
  },
};

/**
 * High-Fashion Outfits Central Viewer:
 * ① Default Primary Mode: `AI Try-On ('ai-vton')` — Gemini Multimodal Image Generation VTON
 *    - Style (`캐릭터 시뮬레이션` vs `실사 모델`) & Gemini API Key are configured in Profile.
 *    - Defaults to `캐릭터 시뮬레이션 ('stylized_isometric')` whenever no portrait photo is registered.
 *    - Starts at `0°` (Front) at the center of a smooth `[-180°..0°..+180°]` bottom angle scrollbar
 *      with Back (`180°`) at both ends, synced two-way with horizontal stage swipes.
 * ② Unfolded Flat-Lay Lookbook (`'flatlay'`): Tapping the character unfolds all equipped items at once.
 */
const Studio2DFittingViewer = memo(function Studio2DFittingViewer({
  slots,
  renderResult,
  theme = 'light',
  skinProfile,
  bodySpec,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  viewAngleDeg: controlledViewAngleDeg,
  onViewAngleChange,
  weather,
  dayTarget = 'today',
  scenarioKey = 'live',
  locationLabel,
  onOpenWeatherPopup,
  weatherPopupOpen = false,
  recommendations = [],
  activeRecId = null,
  lookStyleConfig = null,
  onApplyRecommendation,
  onAiLookGenerated,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onRestoreHistorySlots,
  onQuickSelectPreset: _legacyQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal: _legacyOpenBodyModal,
  stageBackgroundId = DEFAULT_STAGE_BACKGROUND_ID,
  onOpenBackgroundPicker,
  lang,
  forceRefresh = false,
  forceRefreshNonce = 0,
  mode,
  viewMode,
  renderMode,
  legacyMode,
  // Legacy 3D props accepted & normalized defensively:
  cameraPreset: _legacyCameraPreset,
  presetNonce: _legacyPresetNonce,
  onUserOrbit: _legacyOnUserOrbit,
  gender: _legacyGender,
}) {
  void _legacyQuickSelectPreset;
  void _legacyOpenBodyModal;
  void _legacyCameraPreset;
  void _legacyPresetNonce;
  void _legacyOnUserOrbit;
  void _legacyGender;

  const rawLegacyMode = legacyMode ?? mode ?? viewMode ?? renderMode;
  const viewerMode = normalizeViewerMode(rawLegacyMode);
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const resolvedLang = lang === 'en' || lang === 'ko' ? lang : getStoredLang();
  const isEn = resolvedLang === 'en';

  const { spec: storeAvatarSpec, avatarConfigHash: storeAvatarHash } = useAvatarSpec();
  const bridgedAvatar = useMemo(() => {
    void storeAvatarSpec;
    void storeAvatarHash;
    return bridgeLegacyPropsToAvatarSpec({
      skinProfile,
      bodySpec,
      user,
      personReferenceUrl:
        skinProfile?.portraitDataUrl || storeAvatarSpec?.appearance?.facePhotoUrl || null,
    });
  }, [storeAvatarSpec, storeAvatarHash, skinProfile, bodySpec, user]);

  const resolvedAvatarSpec = avatarSpec || bridgedAvatar.spec;
  const resolvedAvatarHash = useMemo(() => {
    if (avatarConfigHash) return avatarConfigHash;
    if (avatarSpec) return computeAvatarConfigHash(avatarSpec);
    return bridgedAvatar.avatarConfigHash;
  }, [avatarConfigHash, avatarSpec, bridgedAvatar.avatarConfigHash]);

  // Default 0° Front View + 8-step 360° swipe rotation ring + signed [-180..0..+180] scrollbar
  const [internalViewAngleDeg, setInternalViewAngleDeg] = useState(DEFAULT_TURNAROUND_ANGLE);
  const viewAngleDeg =
    controlledViewAngleDeg !== undefined
      ? normalizeTurnaround360Angle(controlledViewAngleDeg, DEFAULT_TURNAROUND_ANGLE)
      : internalViewAngleDeg;

  const [angleScrollDeg, setAngleScrollDeg] = useState(() =>
    angle360ToSignedScrollDeg(viewAngleDeg, 0)
  );
  const [scrollResidualYawDeg, setScrollResidualYawDeg] = useState(0);
  const isScrubbingScrollRef = useRef(false);
  const angleScrollRef = useRef(angleScrollDeg);

  const viewAngleRef = useRef(viewAngleDeg);
  useEffect(() => {
    viewAngleRef.current = viewAngleDeg;
    if (!isScrubbingScrollRef.current) {
      setAngleScrollDeg((prev) => {
        const next = angle360ToSignedScrollDeg(viewAngleDeg, prev);
        angleScrollRef.current = next;
        return next;
      });
      setScrollResidualYawDeg(0);
    }
  }, [viewAngleDeg]);

  const angleSpec = useMemo(
    () => resolve360AngleRenderSpec(viewAngleDeg),
    [viewAngleDeg]
  );
  const canonicalSliceAngle = angleSpec.canonicalSliceAngle;

  const spinTimersRef = useRef([]);
  const swipeBadgeTimerRef = useRef(null);
  const [swipeHudBadgeVisible, setSwipeHudBadgeVisible] = useState(false);

  const clearSpinTimers = useCallback(() => {
    for (const id of spinTimersRef.current) {
      clearTimeout(id);
    }
    spinTimersRef.current = [];
  }, []);

  const flashSwipeAngleBadge = useCallback(() => {
    setSwipeHudBadgeVisible(true);
    if (swipeBadgeTimerRef.current) {
      clearTimeout(swipeBadgeTimerRef.current);
    }
    swipeBadgeTimerRef.current = setTimeout(() => {
      setSwipeHudBadgeVisible(false);
    }, 1350);
  }, []);

  const commitAngleDeg = useCallback(
    (nextRawAngle) => {
      const normalized = normalizeTurnaround360Angle(
        nextRawAngle,
        DEFAULT_TURNAROUND_ANGLE
      );
      viewAngleRef.current = normalized;
      setInternalViewAngleDeg(normalized);
      onViewAngleChange?.(normalized);
    },
    [onViewAngleChange]
  );

  const handleSwipeRotate = useCallback(
    ({ stepSign, fastFlick }) => {
      clearSpinTimers();
      isScrubbingScrollRef.current = false;
      setScrollResidualYawDeg(0);
      const sign = stepSign >= 0 ? 1 : -1;
      const startAngle = viewAngleRef.current;
      flashSwipeAngleBadge();

      if (!fastFlick) {
        commitAngleDeg(startAngle + sign * 45);
        return;
      }

      // Fast flick (velocity >= 0.8 px/ms): rapid 4-step 180° opposite-view spin
      const step1 = normalizeTurnaround360Angle(startAngle + sign * 45);
      const step2 = normalizeTurnaround360Angle(startAngle + sign * 90);
      const step3 = normalizeTurnaround360Angle(startAngle + sign * 135);
      const step4Opposite = normalizeTurnaround360Angle(startAngle + 180);

      commitAngleDeg(step1);
      const t2 = setTimeout(() => commitAngleDeg(step2), 28);
      const t3 = setTimeout(() => commitAngleDeg(step3), 56);
      const t4 = setTimeout(() => commitAngleDeg(step4Opposite), 84);
      spinTimersRef.current = [t2, t3, t4];
    },
    [clearSpinTimers, commitAngleDeg, flashSwipeAngleBadge]
  );

  const handleAngleScrollChange = useCallback(
    (e) => {
      clearSpinTimers();
      const rawVal = Number(e.target.value);
      const nextScroll = resolveSignedAngleScrollState(rawVal);
      isScrubbingScrollRef.current = true;
      angleScrollRef.current = nextScroll.clampedScrollDeg;
      setAngleScrollDeg(nextScroll.clampedScrollDeg);
      setScrollResidualYawDeg(nextScroll.residualYawDeg);
      if (viewAngleRef.current !== nextScroll.angle360) {
        commitAngleDeg(nextScroll.angle360);
      }
      flashSwipeAngleBadge();
    },
    [clearSpinTimers, commitAngleDeg, flashSwipeAngleBadge]
  );

  const handleAngleScrollRelease = useCallback(() => {
    isScrubbingScrollRef.current = false;
    if (Math.abs(angleScrollRef.current) >= 158) {
      const snappedEnd = angleScrollRef.current < 0 ? -180 : 180;
      angleScrollRef.current = snappedEnd;
      setAngleScrollDeg(snappedEnd);
      setScrollResidualYawDeg(0);
    }
  }, []);

  const handleJumpAngleScroll = useCallback(
    (targetSignedDeg) => {
      clearSpinTimers();
      isScrubbingScrollRef.current = false;
      const nextScroll = resolveSignedAngleScrollState(targetSignedDeg);
      angleScrollRef.current = nextScroll.clampedScrollDeg;
      setAngleScrollDeg(nextScroll.clampedScrollDeg);
      setScrollResidualYawDeg(0);
      commitAngleDeg(nextScroll.angle360);
      flashSwipeAngleBadge();
    },
    [clearSpinTimers, commitAngleDeg, flashSwipeAngleBadge]
  );

  const activeFacePhotoUrl =
    skinProfile?.portraitDataUrl ||
    resolvedAvatarSpec?.appearance?.facePhotoUrl ||
    null;
  const hasFacePhoto = Boolean(activeFacePhotoUrl);

  const [stageMode, setStageMode] = useState('ai-vton');
  const [storedStylePref, setStoredStylePref] = useState(() =>
    getStoredVtonStylePreference()
  );
  const [historyOverrideStyle, setHistoryOverrideStyle] = useState(null);

  const styleMode =
    historyOverrideStyle ||
    resolveEffectiveVtonStyleMode({
      preferredStyle: storedStylePref,
      hasFacePhoto,
    });

  const [aiState, setAiState] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [statusToast, setStatusToast] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!aiLoading) {
      setLoadingStepIdx(0);
      return undefined;
    }
    setLoadingStepIdx(0);
    const step2Timer = setTimeout(() => setLoadingStepIdx(1), 1400);
    const step3Timer = setTimeout(() => setLoadingStepIdx(2), 3600);
    return () => {
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
    };
  }, [aiLoading]);

  const [demoShowcaseEnabled, setDemoShowcaseEnabled] = useState(() =>
    isDemoVtonShowcaseActive()
  );
  const [hasSavedClientKey, setHasSavedClientKey] = useState(() =>
    Boolean(getStoredClientGeminiApiKey())
  );
  const [hasServerConfiguredKey, setHasServerConfiguredKey] = useState(false);

  // Smart Credit-Saver & Persistent History Gallery state
  const [autoGenEnabled, setAutoGenEnabled] = useState(() => readStoredAutoGenEnabled());
  const [stagedNeedsApply, setStagedNeedsApply] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pinnedHistoryItem, setPinnedHistoryItem] = useState(null);
  const [dayKey, setDayKey] = useState(() => getLocalDayKey());
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const syncClock = () => setClockNow(new Date());
    const id = setInterval(syncClock, 30000);
    return () => clearInterval(id);
  }, []);

  const [zoom, setZoom] = useState(1);
  const [idealBaseScale, setIdealBaseScale] = useState(1);
  void idealBaseScale;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplitPct, setCompareSplitPct] = useState(50);

  const abortControllerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const hasInitialAutoRunRef = useRef(false);
  const userApprovedGenRef = useRef(false);
  const forceBypassCacheRef = useRef(false);
  const manualDemoRef = useRef(false);
  const configBlockedRef = useRef(false);
  const restoringFromHistoryRef = useRef(false);

  const refreshHistoryList = useCallback(() => {
    listCachedAiVtonOutfits(120)
      .then((items) => {
        setHistoryItems(items);
      })
      .catch(() => {
        // Ignore IndexedDB enumeration errors
      });
  }, []);

  useEffect(() => {
    let midnightTimerId = null;

    const scheduleNextMidnight = () => {
      if (midnightTimerId) {
        clearTimeout(midnightTimerId);
      }
      const now = new Date();
      const nextMidnightMs = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        50
      ).getTime();
      const waitMs = Math.max(250, nextMidnightMs - Date.now());
      midnightTimerId = setTimeout(() => {
        setDayKey(getLocalDayKey());
        scheduleNextMidnight();
      }, waitMs);
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        const currentKey = getLocalDayKey();
        setDayKey((prev) => (prev === currentKey ? prev : currentKey));
      }
    };

    scheduleNextMidnight();
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      if (midnightTimerId) {
        clearTimeout(midnightTimerId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  const localDayStartMs = useMemo(() => {
    void dayKey;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, [dayKey]);

  const todayHistoryItems = useMemo(
    () => historyItems.filter((it) => (it.updatedAt || 0) >= localDayStartMs),
    [historyItems, localDayStartMs]
  );

  const dailyHistoryBadgeCount = Math.min(99, todayHistoryItems.length);

  useEffect(() => {
    refreshHistoryList();
    let mounted = true;
    fetchServerGeminiConfigured()
      .then((configured) => {
        if (mounted) {
          setHasServerConfiguredKey(Boolean(configured));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [refreshHistoryList]);

  // Sync VTON style preference changes from Profile modal
  useEffect(() => {
    const handleStylePrefUpdated = () => {
      const nextPref = getStoredVtonStylePreference();
      setStoredStylePref(nextPref);
      setHistoryOverrideStyle(null);
      setPinnedHistoryItem(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
    };
    window.addEventListener(VTON_STYLE_PREF_EVENT, handleStylePrefUpdated);
    return () => window.removeEventListener(VTON_STYLE_PREF_EVENT, handleStylePrefUpdated);
  }, []);

  // Dismiss open `기록` popover cleanly on Escape key
  useEffect(() => {
    if (!historyOpen) return undefined;
    const handleKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        setHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyOpen]);

  const showToast = useCallback((reason) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setStatusToast({ reason, ts: Date.now() });
    if (!isKeyActionableReason(reason)) {
      toastTimerRef.current = setTimeout(() => {
        setStatusToast(null);
      }, 10000);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSpinTimers();
      if (swipeBadgeTimerRef.current) {
        clearTimeout(swipeBadgeTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, [clearSpinTimers]);

  const layers = useMemo(() => {
    if (slots && typeof slots === 'object') {
      const seen = new Set();
      const list = [];
      for (const slotKey of ORDERED_SLOT_KEYS) {
        seen.add(slotKey);
        const garment = slots[slotKey];
        if (garment) {
          list.push({ slotKey, garment });
        }
      }
      for (const [slotKey, garment] of Object.entries(slots)) {
        if (!seen.has(slotKey) && garment) {
          list.push({ slotKey, garment });
        }
      }
      return list;
    }
    return Array.isArray(renderResult?.layers) ? renderResult.layers : [];
  }, [slots, renderResult]);

  const equippedCount = layers.length;
  const effectiveCompareActive = compareActive && equippedCount > 0;

  const resolvedBgItem = useMemo(
    () => getStageBackgroundById(stageBackgroundId),
    [stageBackgroundId]
  );
  const isStageOutdoor = Boolean(resolvedBgItem.isOutdoor);

  const effectiveWeather = useMemo(
    () => resolveEffectiveWeatherFromRaw(weather),
    [weather]
  );
  const stageEffectiveWeather = isStageOutdoor ? effectiveWeather : 'clear';
  const weatherOverlayMode = useMemo(() => {
    if (scenarioKey === 'warm_spring') return 'mild';
    if (scenarioKey === 'live' && effectiveWeather === 'clear') return 'forecast';
    return effectiveWeather;
  }, [scenarioKey, effectiveWeather]);
  const stageWeatherOverlayMode = isStageOutdoor ? weatherOverlayMode : 'clear';

  const vtonWeather = useMemo(() => {
    if (isStageOutdoor || effectiveWeather !== 'rain' || !weather || typeof weather !== 'object') {
      return weather;
    }
    return {
      ...weather,
      mode: 'cloudy',
      selectedMode: 'cloudy',
      liveCondition: 'cloudy',
      condition: 'cloudy',
      conditionKo: '흐림',
      label: '흐림',
      mood: 'cloudy',
      weatherCode: 3,
      code: 3,
      precipProb: 0,
      isRainy: false,
      isRaining: false,
    };
  }, [isStageOutdoor, effectiveWeather, weather]);

  const vtonEffectiveWeather = useMemo(
    () => resolveEffectiveWeatherFromRaw(vtonWeather),
    [vtonWeather]
  );

  const vtonSlots = useMemo(() => {
    if (isStageOutdoor || !slots || !slots.acc_umbrella) return slots;
    const { acc_umbrella: _omitted, ...rest } = slots;
    return rest;
  }, [isStageOutdoor, slots]);

  const weatherBadgeMeta = useMemo(
    () => getWeatherStageBadgeMeta(weather, resolvedLang),
    [weather, resolvedLang]
  );

  const normalizedScenarioKey = scenarioKey || 'live';
  const { outfitComboId } = useMemo(() => computeOutfitComboId(vtonSlots), [vtonSlots]);
  const scenarioVtonKey = `${normalizedScenarioKey}|${isStageOutdoor ? 'outdoor' : 'indoor'}|${outfitComboId}|${styleMode}|${resolvedAvatarHash}`;
  const scenarioVtonSnapshotsRef = useRef({});
  const [scenarioSnapEpoch, setScenarioSnapEpoch] = useState(0);

  const recordScenarioVtonSnapshot = useCallback(
    (targetKey, angleDeg, imageUrl, angleSlicesMap = null) => {
      if (!targetKey || (!imageUrl && !angleSlicesMap)) return;
      const prev = scenarioVtonSnapshotsRef.current[targetKey] || { angleSlices: {} };
      const nextSlices = {
        ...prev.angleSlices,
        ...(angleSlicesMap || {}),
      };
      if (imageUrl && angleDeg !== undefined && angleDeg !== null) {
        nextSlices[angleDeg] = imageUrl;
      }
      scenarioVtonSnapshotsRef.current[targetKey] = {
        imageUrl: imageUrl || prev.imageUrl || nextSlices[0] || null,
        angleSlices: nextSlices,
      };
      setScenarioSnapEpoch((n) => n + 1);
    },
    []
  );

  const prevFacePhotoRef = useRef(activeFacePhotoUrl);
  const pendingFacePhotoApproveRef = useRef(null);
  const prevEffectiveWeatherRef = useRef(effectiveWeather);
  const pendingWeatherApproveRef = useRef(null);
  const prevScenarioKeyRef = useRef(normalizedScenarioKey);
  const pendingScenarioApproveRef = useRef(null);
  const prevRefreshNonceRef = useRef(forceRefreshNonce);
  const prevOutfitComboRef = useRef(outfitComboId);

  // Manual garment changes in the wardrobe unpin history and return to primary stage flow
  useEffect(() => {
    if (prevOutfitComboRef.current !== outfitComboId) {
      prevOutfitComboRef.current = outfitComboId;
      if (restoringFromHistoryRef.current) {
        restoringFromHistoryRef.current = false;
      } else {
        setPinnedHistoryItem(null);
        setHistoryOverrideStyle(null);
        setStageMode('ai-vton');
      }
    }
  }, [outfitComboId]);

  // Sync Gemini API Key updates saved in Profile modal
  useEffect(() => {
    const handleApiKeyUpdated = () => {
      const nextKey = getStoredClientGeminiApiKey();
      const hasKey = Boolean(nextKey);
      setHasSavedClientKey(hasKey);
      configBlockedRef.current = false;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(false);
      setStatusToast(null);
      if (hasKey && equippedCount > 0) {
        userApprovedGenRef.current = true;
        forceBypassCacheRef.current = false;
        setStageMode('ai-vton');
        setRetryNonce((n) => n + 1);
      }
    };
    window.addEventListener(GEMINI_API_KEY_EVENT, handleApiKeyUpdated);
    return () => window.removeEventListener(GEMINI_API_KEY_EVENT, handleApiKeyUpdated);
  }, [equippedCount]);

  const currentAiCacheKey = useMemo(
    () =>
      `${buildAiVtonCacheKey({
        avatarConfigHash: resolvedAvatarHash,
        outfitComboId,
        styleMode,
        effectiveWeather: vtonEffectiveWeather,
        angleDeg: canonicalSliceAngle,
      })}|sc:${normalizedScenarioKey}|${isStageOutdoor ? 'outdoor' : 'indoor'}`,
    [
      resolvedAvatarHash,
      outfitComboId,
      styleMode,
      vtonEffectiveWeather,
      canonicalSliceAngle,
      normalizedScenarioKey,
      isStageOutdoor,
    ]
  );

  const scenarioSnapSliceUrl = useMemo(() => {
    void scenarioSnapEpoch;
    if (forceRefresh) return null;
    const entry = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
    if (!entry) return null;
    return (
      entry.angleSlices?.[canonicalSliceAngle] ||
      (canonicalSliceAngle === 0 ? entry.imageUrl : null) ||
      null
    );
  }, [scenarioVtonKey, canonicalSliceAngle, forceRefresh, scenarioSnapEpoch]);

  const historyCount = historyItems.length;
  const memorySlice = useMemo(() => {
    void historyCount;
    if (forceRefresh) return null;
    return peekMemoryAiVtonSlice({
      avatarConfigHash: resolvedAvatarHash,
      outfitComboId,
      styleMode,
      effectiveWeather: vtonEffectiveWeather,
      angleDeg: canonicalSliceAngle,
    });
  }, [
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    vtonEffectiveWeather,
    canonicalSliceAngle,
    forceRefresh,
    historyCount,
  ]);

  const demoSliceUrl = useMemo(
    () =>
      demoShowcaseEnabled
        ? peekShowcaseDemoVtonSlice(styleMode, canonicalSliceAngle)
        : null,
    [demoShowcaseEnabled, styleMode, canonicalSliceAngle]
  );

  const fallbackSameComboMemorySlice = useMemo(() => {
    void historyCount;
    void scenarioSnapEpoch;
    if (forceRefresh) return null;
    const angularDist = (a, b) => {
      const diff = Math.abs(a - b) % 360;
      return diff > 180 ? 360 - diff : diff;
    };
    const fallbackOrder = TURNAROUND_ANGLES.filter((deg) => deg !== canonicalSliceAngle).sort(
      (a, b) => angularDist(a, canonicalSliceAngle) - angularDist(b, canonicalSliceAngle)
    );
    const snapEntry = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
    if (snapEntry?.angleSlices) {
      for (const deg of fallbackOrder) {
        if (snapEntry.angleSlices[deg]) {
          return { imageUrl: snapEntry.angleSlices[deg] };
        }
      }
    }
    for (const deg of fallbackOrder) {
      const hit = peekMemoryAiVtonSlice({
        avatarConfigHash: resolvedAvatarHash,
        outfitComboId,
        styleMode,
        effectiveWeather: vtonEffectiveWeather,
        angleDeg: deg,
      });
      if (hit?.imageUrl) return hit;
    }
    return null;
  }, [
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    vtonEffectiveWeather,
    canonicalSliceAngle,
    forceRefresh,
    historyCount,
    scenarioVtonKey,
    scenarioSnapEpoch,
  ]);

  const flatLayCached = useMemo(
    () =>
      trackFlatLayComboVisit(
        `flatlay::${resolvedAvatarHash}::${outfitComboId}::${effectiveWeather}::${normalizedScenarioKey}::${viewAngleDeg}`
      ),
    [resolvedAvatarHash, outfitComboId, effectiveWeather, normalizedScenarioKey, viewAngleDeg]
  );

  const latestInputsRef = useRef({
    slots: vtonSlots,
    skinProfile,
    bodySpec,
    user,
    resolvedAvatarSpec,
    resolvedAvatarHash,
    canonicalSliceAngle,
    styleMode,
    weather: vtonWeather,
    effectiveWeather: vtonEffectiveWeather,
    normalizedScenarioKey,
    scenarioVtonKey,
    resolvedTheme,
    rawLegacyMode,
    forceRefresh,
    resolvedLang,
  });

  useEffect(() => {
    latestInputsRef.current = {
      slots: vtonSlots,
      skinProfile,
      bodySpec,
      user,
      resolvedAvatarSpec,
      resolvedAvatarHash,
      canonicalSliceAngle,
      styleMode,
      weather: vtonWeather,
      effectiveWeather: vtonEffectiveWeather,
      normalizedScenarioKey,
      scenarioVtonKey,
      resolvedTheme,
      rawLegacyMode,
      forceRefresh,
      resolvedLang,
    };
  });

  // Smart Credit-Saver Gemini Multimodal VTON Pipeline (V4 Hole-Aware Cutout + Full-Body Floor Lock)
  useEffect(() => {
    abortControllerRef.current?.abort();

    if (prevFacePhotoRef.current !== activeFacePhotoUrl) {
      prevFacePhotoRef.current = activeFacePhotoUrl;
      pendingFacePhotoApproveRef.current = activeFacePhotoUrl || null;
      setHistoryOverrideStyle(null);
      if (activeFacePhotoUrl) {
        configBlockedRef.current = false;
        setPinnedHistoryItem(null);
      }
    }
    const facePhotoJustApplied = Boolean(
      activeFacePhotoUrl && pendingFacePhotoApproveRef.current === activeFacePhotoUrl
    );

    if (prevEffectiveWeatherRef.current !== vtonEffectiveWeather) {
      prevEffectiveWeatherRef.current = vtonEffectiveWeather;
      pendingWeatherApproveRef.current = vtonEffectiveWeather;
      setPinnedHistoryItem(null);
    }
    if (prevScenarioKeyRef.current !== normalizedScenarioKey) {
      prevScenarioKeyRef.current = normalizedScenarioKey;
      pendingScenarioApproveRef.current = normalizedScenarioKey;
      setPinnedHistoryItem(null);
    }
    const weatherTabJustChanged = Boolean(
      pendingWeatherApproveRef.current === vtonEffectiveWeather ||
        pendingScenarioApproveRef.current === normalizedScenarioKey
    );

    if (stageMode !== 'ai-vton' || equippedCount === 0) {
      setAiLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    if (
      !facePhotoJustApplied &&
      !weatherTabJustChanged &&
      pinnedHistoryItem &&
      (pinnedHistoryItem.outfitComboId !== outfitComboId ||
        pinnedHistoryItem.avatarConfigHash !== resolvedAvatarHash ||
        pinnedHistoryItem.styleMode !== styleMode ||
        (pinnedHistoryItem.effectiveWeather &&
          pinnedHistoryItem.effectiveWeather !== vtonEffectiveWeather))
    ) {
      setAiLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    const snap = latestInputsRef.current;
    const isForceBypass = Boolean(snap.forceRefresh || forceBypassCacheRef.current);
    if (isForceBypass) {
      delete scenarioVtonSnapshotsRef.current[scenarioVtonKey];
    }
    const isUserApproved = Boolean(
      isForceBypass ||
        userApprovedGenRef.current ||
        facePhotoJustApplied ||
        weatherTabJustChanged
    );

    const scenarioExactUrl = !isForceBypass
      ? scenarioVtonSnapshotsRef.current[scenarioVtonKey]?.angleSlices?.[
          snap.canonicalSliceAngle
        ] || null
      : null;

    if (scenarioExactUrl) {
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
      pendingScenarioApproveRef.current = null;
      hasInitialAutoRunRef.current = true;
      setStagedNeedsApply(false);
      setAiState({
        cacheKey: currentAiCacheKey,
        imageUrl: scenarioExactUrl,
        fromCache: true,
        provider: 'gemini-vton',
      });
      setStatusToast(null);
      setAiLoading(false);
      return undefined;
    }

    const syncHit = !isForceBypass
      ? peekMemoryAiVtonSlice({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          effectiveWeather: snap.effectiveWeather,
          angleDeg: snap.canonicalSliceAngle,
        })
      : null;

    if (syncHit) {
      const siblingMap = {};
      for (const deg of TURNAROUND_ANGLES) {
        const mem = peekMemoryAiVtonSlice({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          effectiveWeather: snap.effectiveWeather,
          angleDeg: deg,
        });
        if (mem?.imageUrl) {
          siblingMap[deg] = mem.imageUrl;
        }
      }
      recordScenarioVtonSnapshot(
        scenarioVtonKey,
        snap.canonicalSliceAngle,
        syncHit.imageUrl,
        siblingMap
      );
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
      pendingScenarioApproveRef.current = null;
      hasInitialAutoRunRef.current = true;
      setStagedNeedsApply(false);
      setAiState({
        cacheKey: currentAiCacheKey,
        imageUrl: syncHit.imageUrl,
        fromCache: true,
        provider: 'gemini-vton',
      });
      setStatusToast(null);
      setAiLoading(false);
      return undefined;
    }

    if (demoShowcaseEnabled && !isForceBypass) {
      const activeDemoStyle = normalizeVtonStyleMode(snap.styleMode);
      const cachedDemoUrl = peekShowcaseDemoVtonSlice(
        activeDemoStyle,
        snap.canonicalSliceAngle
      );
      if (cachedDemoUrl) {
        recordScenarioVtonSnapshot(
          scenarioVtonKey,
          snap.canonicalSliceAngle,
          cachedDemoUrl
        );
        forceBypassCacheRef.current = false;
        userApprovedGenRef.current = false;
        pendingFacePhotoApproveRef.current = null;
        pendingWeatherApproveRef.current = null;
        pendingScenarioApproveRef.current = null;
        hasInitialAutoRunRef.current = true;
        setStagedNeedsApply(false);
        setAiState({
          cacheKey: currentAiCacheKey,
          imageUrl: cachedDemoUrl,
          fromCache: true,
          provider: 'gemini-vton',
        });
        setStatusToast(null);
        setAiLoading(false);
        return undefined;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isDirectDemoClick = manualDemoRef.current;
    manualDemoRef.current = false;
    let delayTimerId = null;

    const runPipeline = async () => {
      if (!isForceBypass) {
        const idbHit = await readCachedAiVtonSlice({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          effectiveWeather: snap.effectiveWeather,
          angleDeg: snap.canonicalSliceAngle,
        });
        if (controller.signal.aborted) return;

        if (idbHit) {
          const siblingAngles = TURNAROUND_ANGLES.filter(
            (deg) => deg !== snap.canonicalSliceAngle
          );
          const siblingPromises = siblingAngles.map((deg) =>
            readCachedAiVtonSlice({
              avatarConfigHash: snap.resolvedAvatarHash,
              outfitComboId,
              styleMode: snap.styleMode,
              effectiveWeather: snap.effectiveWeather,
              angleDeg: deg,
            })
          );
          recordScenarioVtonSnapshot(
            scenarioVtonKey,
            snap.canonicalSliceAngle,
            idbHit.slice.imageUrl
          );
          void Promise.all(siblingPromises).then((hits) => {
            const siblingMap = {
              [snap.canonicalSliceAngle]: idbHit.slice.imageUrl,
            };
            hits.forEach((h, idx) => {
              if (h?.slice?.imageUrl) {
                siblingMap[siblingAngles[idx]] = h.slice.imageUrl;
              }
            });
            recordScenarioVtonSnapshot(
              scenarioVtonKey,
              snap.canonicalSliceAngle,
              idbHit.slice.imageUrl,
              siblingMap
            );
            preloadImageUrls([
              idbHit.slice.imageUrl,
              ...hits.map((h) => h?.slice?.imageUrl).filter(Boolean),
            ]);
          });

          forceBypassCacheRef.current = false;
          userApprovedGenRef.current = false;
          pendingFacePhotoApproveRef.current = null;
          pendingWeatherApproveRef.current = null;
          pendingScenarioApproveRef.current = null;
          hasInitialAutoRunRef.current = true;
          setStagedNeedsApply(false);
          setAiState({
            cacheKey: currentAiCacheKey,
            imageUrl: idbHit.slice.imageUrl,
            fromCache: true,
            provider: 'gemini-vton',
          });
          setStatusToast(null);
          setAiLoading(false);
          return;
        }
      }

      const hasSiblingComboSlice = TURNAROUND_ANGLES.some(
        (deg) =>
          deg !== snap.canonicalSliceAngle &&
          (Boolean(
            scenarioVtonSnapshotsRef.current[scenarioVtonKey]?.angleSlices?.[deg]
          ) ||
            Boolean(
              peekMemoryAiVtonSlice({
                avatarConfigHash: snap.resolvedAvatarHash,
                outfitComboId,
                styleMode: snap.styleMode,
                effectiveWeather: snap.effectiveWeather,
                angleDeg: deg,
              })
            ))
      );

      if (
        !isUserApproved &&
        !isDirectDemoClick &&
        !hasSiblingComboSlice &&
        hasInitialAutoRunRef.current &&
        !autoGenEnabled &&
        !demoShowcaseEnabled
      ) {
        setAiLoading(false);
        setStagedNeedsApply(true);
        setStatusToast(null);
        return;
      }

      if (
        configBlockedRef.current &&
        !demoShowcaseEnabled &&
        !isForceBypass &&
        !facePhotoJustApplied &&
        !isDirectDemoClick
      ) {
        pendingWeatherApproveRef.current = null;
        pendingScenarioApproveRef.current = null;
        setAiLoading(false);
        return;
      }

      const delayMs =
        weatherTabJustChanged && !isForceBypass
          ? 210
          : facePhotoJustApplied && !isForceBypass
            ? 90
            : isDirectDemoClick || isForceBypass
              ? 0
              : isUserApproved
                ? 30
                : autoGenEnabled && hasInitialAutoRunRef.current
                  ? 850
                  : 110;

      if (delayMs > 0) {
        await new Promise((resolve) => {
          delayTimerId = setTimeout(resolve, delayMs);
        });
      }
      if (controller.signal.aborted) return;

      hasInitialAutoRunRef.current = true;
      setStagedNeedsApply(false);
      const liveSnap = latestInputsRef.current;

      const applyShowcaseDemoSlices = () => {
        // Strictly load ONLY the active style mode so `stylized_isometric` NEVER fetches `vton-showcase-3x2-photoreal.jpg`
        const activeStyle = normalizeVtonStyleMode(liveSnap.styleMode);
        loadShowcaseDemoVtonSlices(activeStyle)
          .then((slices) => {
            if (controller.signal.aborted) return;
            forceBypassCacheRef.current = false;
            userApprovedGenRef.current = false;
            pendingFacePhotoApproveRef.current = null;
            pendingWeatherApproveRef.current = null;
            pendingScenarioApproveRef.current = null;
            setAiLoading(false);
            if (slices) {
              preloadImageUrls(Object.values(slices));
            }
            const targetUrl =
              slices?.[liveSnap.canonicalSliceAngle] ||
              slices?.[0] ||
              slices?.[45] ||
              null;
            if (targetUrl) {
              recordScenarioVtonSnapshot(
                liveSnap.scenarioVtonKey,
                liveSnap.canonicalSliceAngle,
                targetUrl,
                slices || null
              );
              configBlockedRef.current = false;
              setAiState({
                cacheKey: currentAiCacheKey,
                imageUrl: targetUrl,
                fromCache: true,
                provider: 'gemini-vton',
              });
              setStatusToast(null);
              return;
            }
            showToast('gemini_unavailable');
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            forceBypassCacheRef.current = false;
            userApprovedGenRef.current = false;
            pendingFacePhotoApproveRef.current = null;
            pendingWeatherApproveRef.current = null;
            pendingScenarioApproveRef.current = null;
            setAiLoading(false);
          });
      };

      setAiLoading(true);

      if (demoShowcaseEnabled && (isDirectDemoClick || !resolveClientGeminiApiKey())) {
        applyShowcaseDemoSlices();
        return;
      }

      try {
        const outcome = await synthesizeGeminiMultiAngleVton({
          slots: liveSnap.slots,
          skinProfile: liveSnap.skinProfile,
          bodySpec: liveSnap.bodySpec,
          user: liveSnap.user,
          avatarSpec: liveSnap.resolvedAvatarSpec,
          avatarConfigHash: liveSnap.resolvedAvatarHash,
          viewAngleDeg: liveSnap.canonicalSliceAngle,
          styleMode: liveSnap.styleMode,
          weather: liveSnap.weather,
          turnaroundSheet: true,
          theme: liveSnap.resolvedTheme,
          legacyMode: liveSnap.rawLegacyMode,
          forceRefresh: isForceBypass,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        forceBypassCacheRef.current = false;
        userApprovedGenRef.current = false;
        pendingFacePhotoApproveRef.current = null;
        pendingWeatherApproveRef.current = null;
        pendingScenarioApproveRef.current = null;

        if (outcome.ok && outcome.imageUrl) {
          if (outcome.angleSlices) {
            preloadImageUrls(Object.values(outcome.angleSlices));
          }
          recordScenarioVtonSnapshot(
            liveSnap.scenarioVtonKey,
            liveSnap.canonicalSliceAngle,
            outcome.imageUrl,
            outcome.angleSlices || null
          );
          setAiLoading(false);
          configBlockedRef.current = false;
          setStagedNeedsApply(false);
          setAiState({
            cacheKey: currentAiCacheKey,
            imageUrl: outcome.imageUrl,
            fromCache: outcome.fromCache,
            provider: 'gemini-vton',
          });
          setStatusToast(null);
          refreshHistoryList();
          onAiLookGenerated?.();
          return;
        }

        if (demoShowcaseEnabled && outcome.reason !== 'aborted') {
          applyShowcaseDemoSlices();
          return;
        }

        setAiLoading(false);
        if (outcome.reason !== 'aborted') {
          if (isKeyActionableReason(outcome.reason)) {
            configBlockedRef.current = true;
          }
          showToast(outcome.reason || 'gemini_unavailable');
        }
      } catch {
        if (controller.signal.aborted) return;
        forceBypassCacheRef.current = false;
        userApprovedGenRef.current = false;
        if (demoShowcaseEnabled) {
          applyShowcaseDemoSlices();
          return;
        }
        setAiLoading(false);
        showToast('network_or_runtime_error');
      }
    };

    void runPipeline();

    return () => {
      if (delayTimerId) {
        clearTimeout(delayTimerId);
      }
      controller.abort();
    };
  }, [
    stageMode,
    currentAiCacheKey,
    scenarioVtonKey,
    normalizedScenarioKey,
    outfitComboId,
    resolvedAvatarHash,
    activeFacePhotoUrl,
    vtonEffectiveWeather,
    styleMode,
    equippedCount,
    retryNonce,
    demoShowcaseEnabled,
    autoGenEnabled,
    pinnedHistoryItem,
    recordScenarioVtonSnapshot,
    refreshHistoryList,
    showToast,
  ]);

  const handleEnableDemoShowcase = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (equippedCount === 0) {
        showToast('empty_outfit');
        return;
      }
      configBlockedRef.current = false;
      manualDemoRef.current = true;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(true);
      setStatusToast(null);
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, showToast]
  );

  const handleApproveStagedSynthesis = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (equippedCount === 0) {
        showToast('empty_outfit');
        return;
      }
      configBlockedRef.current = false;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setStatusToast(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, showToast]
  );

  const handleRetryAiSynthesis = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (equippedCount === 0) {
        showToast('empty_outfit');
        return;
      }
      delete scenarioVtonSnapshotsRef.current[scenarioVtonKey];
      configBlockedRef.current = false;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(false);
      setStatusToast(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = true;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, scenarioVtonKey, showToast]
  );

  useEffect(() => {
    if (forceRefreshNonce > 0 && forceRefreshNonce !== prevRefreshNonceRef.current) {
      prevRefreshNonceRef.current = forceRefreshNonce;
      handleRetryAiSynthesis();
    }
  }, [forceRefreshNonce, handleRetryAiSynthesis]);

  const handleToggleAutoGen = useCallback((e) => {
    e?.stopPropagation?.();
    setAutoGenEnabled((prev) => {
      const next = !prev;
      writeStoredAutoGenEnabled(next);
      return next;
    });
  }, []);

  const handleToggleHistoryPopover = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setHistoryOpen((prev) => {
        const next = !prev;
        if (next) {
          refreshHistoryList();
        }
        return next;
      });
    },
    [refreshHistoryList]
  );

  const handleSelectHistoryItem = useCallback(
    (item) => {
      abortControllerRef.current?.abort();
      setAiLoading(false);
      setStatusToast(null);
      setStagedNeedsApply(false);
      setHistoryOverrideStyle(normalizeVtonStyleMode(item.styleMode));
      setStageMode('ai-vton');

      if (item.angleSlices) {
        preloadImageUrls(Object.values(item.angleSlices));
      }

      // Restore equipped wardrobe slots when garment IDs are recorded on this history entry
      let restoredLiveCombo = false;
      if (
        item.slotGarmentIds &&
        Object.keys(item.slotGarmentIds).length > 0 &&
        onRestoreHistorySlots
      ) {
        restoringFromHistoryRef.current = true;
        restoredLiveCombo = Boolean(onRestoreHistorySlots(item.slotGarmentIds));
        if (!restoredLiveCombo) {
          restoringFromHistoryRef.current = false;
        }
      }

      const matchesLiveState =
        (item.outfitComboId === outfitComboId || restoredLiveCombo) &&
        item.avatarConfigHash === resolvedAvatarHash &&
        (!item.effectiveWeather || item.effectiveWeather === vtonEffectiveWeather);

      if (matchesLiveState) {
        setPinnedHistoryItem(null);
      } else {
        setPinnedHistoryItem(item);
      }
      setHistoryOpen(false);
    },
    [
      outfitComboId,
      resolvedAvatarHash,
      vtonEffectiveWeather,
      onRestoreHistorySlots,
    ]
  );

  const handleDeleteHistoryItem = useCallback(
    (e, item) => {
      e?.stopPropagation?.();
      void deleteCachedAiVtonOutfit({
        avatarConfigHash: item.avatarConfigHash,
        outfitComboId: item.outfitComboId,
        styleMode: item.styleMode,
        effectiveWeather: item.effectiveWeather || null,
      }).then(() => {
        setPinnedHistoryItem((prev) =>
          prev?.groupKey === item.groupKey ? null : prev
        );
        refreshHistoryList();
      });
    },
    [refreshHistoryList]
  );

  const handleTapCharacter = useCallback(() => {
    if (equippedCount === 0) return;
    setCompareActive(false);
    setHistoryOpen(false);
    setStageMode('flatlay');
  }, [equippedCount]);

  const handleCloseFlatLay = useCallback(() => {
    setStageMode('ai-vton');
  }, []);

  const isRainy = isStageOutdoor && effectiveWeather === 'rain';
  const isWindy =
    isStageOutdoor && (effectiveWeather === 'wind' || effectiveWeather === 'coldwave');

  const hasPinnedHistoryOverride = Boolean(
    pinnedHistoryItem &&
      (pinnedHistoryItem.outfitComboId !== outfitComboId ||
        pinnedHistoryItem.avatarConfigHash !== resolvedAvatarHash ||
        pinnedHistoryItem.styleMode !== styleMode ||
        (pinnedHistoryItem.effectiveWeather &&
          pinnedHistoryItem.effectiveWeather !== vtonEffectiveWeather))
  );

  const isShowingPinnedHistory = Boolean(
    stageMode === 'ai-vton' && hasPinnedHistoryOverride
  );

  const pinnedHistorySliceUrl = useMemo(() => {
    if (!hasPinnedHistoryOverride || !pinnedHistoryItem) return null;
    const direct = pinnedHistoryItem.angleSlices?.[canonicalSliceAngle];
    if (direct) return direct;
    // Legacy 4-angle history fallback: prefer lateral 90°/45° over 180° straight back when viewing 135°/225°
    if (canonicalSliceAngle === 135 || canonicalSliceAngle === 225) {
      return (
        pinnedHistoryItem.angleSlices?.[90] ||
        pinnedHistoryItem.angleSlices?.[45] ||
        pinnedHistoryItem.thumbnailUrl ||
        null
      );
    }
    return (
      pinnedHistoryItem.angleSlices?.[0] ||
      pinnedHistoryItem.angleSlices?.[45] ||
      pinnedHistoryItem.thumbnailUrl ||
      null
    );
  }, [hasPinnedHistoryOverride, pinnedHistoryItem, canonicalSliceAngle]);

  const pinnedHistoryForceMirrorX = Boolean(
    stageMode === 'ai-vton' &&
      hasPinnedHistoryOverride &&
      pinnedHistoryItem &&
      canonicalSliceAngle === 225 &&
      !pinnedHistoryItem.angleSlices?.[225] &&
      (pinnedHistoryItem.angleSlices?.[90] || pinnedHistoryItem.angleSlices?.[45])
  );

  const availableAiImageUrl =
    pinnedHistorySliceUrl ||
    scenarioSnapSliceUrl ||
    memorySlice?.imageUrl ||
    (aiState?.cacheKey === currentAiCacheKey ? aiState.imageUrl : null) ||
    demoSliceUrl ||
    (aiLoading ? fallbackSameComboMemorySlice?.imageUrl : null) ||
    null;

  const resolvedAiImageUrl = stageMode === 'ai-vton' ? availableAiImageUrl : null;
  const canReturnToCharacter = stageMode === 'flatlay' && Boolean(availableAiImageUrl);
  const showStageBgPickerBtn = Boolean(stageMode !== 'flatlay' && !canReturnToCharacter);

  useEffect(() => {
    if (!canReturnToCharacter) return undefined;
    const handleEscLookbook = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        setStageMode('ai-vton');
      }
    };
    window.addEventListener('keydown', handleEscLookbook);
    return () => window.removeEventListener('keydown', handleEscLookbook);
  }, [canReturnToCharacter]);

  const activeProvider =
    stageMode === 'ai-vton' && resolvedAiImageUrl ? 'gemini-vton' : 'flatlay-lookbook';

  const isCachedHit =
    stageMode === 'ai-vton' && resolvedAiImageUrl
      ? Boolean(
          isShowingPinnedHistory ||
            scenarioSnapSliceUrl ||
            memorySlice ||
            fallbackSameComboMemorySlice ||
            aiState?.fromCache ||
            demoSliceUrl
        )
      : flatLayCached;

  const resolvedLocationLabel = useMemo(() => {
    if (typeof locationLabel === 'string' && locationLabel.trim()) {
      return locationLabel.trim();
    }
    if (typeof weather?.cityName === 'string' && weather.cityName.trim()) {
      return weather.cityName.trim();
    }
    return isEn ? 'Seoul' : '서울';
  }, [locationLabel, weather?.cityName, isEn]);

  const stageLookRecommendations = useMemo(
    () => (Array.isArray(recommendations) ? recommendations.slice(0, 2) : []),
    [recommendations]
  );

  const capsuleTempC = useMemo(() => {
    if (typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)) {
      return Math.round(weather.avgTemp);
    }
    if (typeof weather?.tempMin === 'number' && typeof weather?.tempMax === 'number') {
      return Math.round((weather.tempMin + weather.tempMax) / 2);
    }
    if (effectiveWeather === 'coldwave') return -7;
    if (effectiveWeather === 'snow') return -1;
    if (effectiveWeather === 'heatwave') return 31;
    if (effectiveWeather === 'rain') return 11;
    if (scenarioKey === 'warm_spring') return 19;
    return 12;
  }, [weather, effectiveWeather, scenarioKey]);

  const capsuleStatusWord = useMemo(() => {
    if (scenarioKey === 'warm_spring') {
      return isEn ? WEATHER_CAPSULE_SHORT_LABELS.mild.en : WEATHER_CAPSULE_SHORT_LABELS.mild.ko;
    }
    const pair =
      WEATHER_CAPSULE_SHORT_LABELS[effectiveWeather] || WEATHER_CAPSULE_SHORT_LABELS.clear;
    return isEn ? pair.en : pair.ko;
  }, [effectiveWeather, scenarioKey, isEn]);

  const hasConfiguredGeminiKey =
    hasSavedClientKey ||
    hasServerConfiguredKey ||
    Boolean(resolveClientGeminiApiKey());
  void hasConfiguredGeminiKey;

  const showAngleDock = shouldShowStudioAngleDock({
    stageMode,
    hasAiImage: Boolean(resolvedAiImageUrl),
    aiLoading: Boolean(aiLoading),
    demoShowcaseActive: Boolean(demoShowcaseEnabled),
  });

  const statusCapsuleSpec = useMemo(
    () => (statusToast ? resolveStudioStatusCapsule(statusToast.reason, resolvedLang) : null),
    [statusToast, resolvedLang]
  );

  const centerAngleReadout = useMemo(() => {
    if (viewAngleDeg === 0 && Math.abs(angleScrollDeg) <= 12) {
      return isEn ? '0° Front' : '0° 정면';
    }
    if (viewAngleDeg === 180) {
      return isEn ? '180° Back' : '180° 뒷모습';
    }
    return isEn ? angleSpec.shortEn : angleSpec.shortKo;
  }, [viewAngleDeg, angleScrollDeg, angleSpec.shortEn, angleSpec.shortKo, isEn]);

  const hasStatusCapsuleVisible = Boolean(
    !effectiveCompareActive &&
      !historyOpen &&
      statusCapsuleSpec &&
      statusToast &&
      (equippedCount > 0 || statusToast.reason === 'empty_outfit')
  );

  const hasStagedBarVisible = Boolean(
    !effectiveCompareActive &&
      !historyOpen &&
      !statusToast &&
      stageMode === 'ai-vton' &&
      equippedCount > 0 &&
      stagedNeedsApply &&
      !aiLoading &&
      !resolvedAiImageUrl
  );

  const hasPinnedBannerVisible = Boolean(
    isShowingPinnedHistory && !effectiveCompareActive && !historyOpen
  );

  const timeOfDay = useMemo(
    () => resolveEffectiveClientTimeOfDay(clockNow),
    [clockNow]
  );

  const weatherCapsuleDateTimeLabel = useMemo(
    () =>
      formatWeatherCapsuleDateTime(
        clockNow,
        dayTarget === 'tomorrow' ? 'tomorrow' : 'today',
        resolvedLang === 'en' ? 'en' : 'ko'
      ),
    [clockNow, dayTarget, resolvedLang]
  );

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      className={`studio-25d-canvas studio-2d-vton-viewer is-weather-${stageEffectiveWeather} ${isStageOutdoor ? `is-tod-${timeOfDay} is-outdoor-sky` : 'is-indoor-ivory'} ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`.trim()}
      data-fitting-mode={viewerMode}
      data-stage-mode={stageMode}
      data-stage-view={resolvedAiImageUrl ? 'ai-vton' : 'flatlay'}
      data-angle-dock-visible={showAngleDock ? 'true' : 'false'}
      data-has-status-capsule={hasStatusCapsuleVisible ? 'true' : 'false'}
      data-has-staged-bar={hasStagedBarVisible ? 'true' : 'false'}
      data-has-top-banner={aiLoading || hasStagedBarVisible || hasPinnedBannerVisible ? 'true' : 'false'}
      data-has-bg-picker={showStageBgPickerBtn ? 'true' : 'false'}
      data-stage-bg-id={resolvedBgItem.id}
      data-stage-bg-tier={resolvedBgItem.tier}
      data-stage-outdoor={isStageOutdoor ? 'true' : 'false'}
      data-stage-lighting={isStageOutdoor ? 'outdoor-sky' : 'indoor-ivory'}
      data-lookbook-overlay={canReturnToCharacter ? 'true' : undefined}
      data-stage-theme={resolvedTheme}
      data-effective-weather={effectiveWeather}
      data-weather-scenario={scenarioKey}
      data-day-target={dayTarget}
      data-time-of-day={timeOfDay}
      data-vton-style={styleMode}
      data-equipped-count={equippedCount}
      data-vton-provider={activeProvider}
      data-vton-cached={isCachedHit ? 'true' : 'false'}
      data-vton-loading={aiLoading ? 'true' : 'false'}
      data-view-angle={viewAngleDeg}
      data-angle-scroll={angleScrollDeg}
      data-avatar-hash={resolvedAvatarHash}
    >
      {/* Stage Base (z-0..2): Architectural Room Stage Backdrop + Time-of-Day Sky */}
      <div aria-hidden="true" className="studio-25d-keylight" />
      <div aria-hidden="true" className="studio-25d-cyclorama-floor" />
      <FittingAtelierBackdrop
        effectiveWeather={effectiveWeather}
        scenarioKey={scenarioKey}
        theme={resolvedTheme}
        timeOfDay={timeOfDay}
        backgroundId={resolvedBgItem.id}
        isOutdoor={isStageOutdoor}
      />

      {/* Layer 1A (z-10): Feathered Cyclorama Floor Deck + Wet Mirror Reflection + Contact AO Shadow */}
      <StageGroundDeck
        effectiveWeather={stageEffectiveWeather}
        scenarioKey={scenarioKey}
        theme={resolvedTheme}
        modelImageUrl={resolvedAiImageUrl}
        stageMode={stageMode}
        equippedCount={equippedCount}
        mirrorX={angleSpec.mirrorX || pinnedHistoryForceMirrorX}
        zoom={zoom}
        idealBaseScale={1}
        pan={pan}
        compareActive={effectiveCompareActive}
        compareSplitPct={compareSplitPct}
        hasArchitecturalBackdrop={true}
        isOutdoor={isStageOutdoor}
      />

      {/* Top Synthesis Progress Line & Step-by-Step Status Pill during Gemini AI VTON Generation */}
      {aiLoading && (
        <>
          <div aria-hidden="true" className="studio-vton-progress-track">
            <div className="studio-vton-progress-fill is-indeterminate" />
          </div>
          <div
            className="studio-vton-step-status tabular-nums"
            data-vton-loading-steps="true"
            data-loading-step={loadingStepIdx + 1}
            role="status"
            aria-live="polite"
          >
            <span className="studio-vton-step-badge">{loadingStepIdx + 1}/3</span>
            <span className="studio-vton-step-label">
              {loadingStepIdx === 0
                ? isEn
                  ? 'Selecting fabric & silhouette...'
                  : '옷감을 고르는 중'
                : loadingStepIdx === 1
                  ? isEn
                    ? 'Draping tailored to your silhouette...'
                    : '체형에 맞춰 드레이핑하는 중'
                  : isEn
                    ? 'Adjusting atelier studio lighting...'
                    : '조명을 맞추는 중'}
            </span>
          </div>
        </>
      )}

      {/* Layer 4 (z-55+): Symmetrical Slim Top HUD — Left [BG] Slot | Top-Center Weather Capsule | Right [History⁰] */}
      <div className="studio-stage-top-hud">
        <div className="studio-hud-left-slot">
          {showStageBgPickerBtn && (
            <button
              type="button"
              data-stage-bg-picker-btn="true"
              data-stage-bg-tier={resolvedBgItem.tier}
              className={`studio-stage-bg-picker-btn tabular-nums is-tier-${resolvedBgItem.tier.toLowerCase()}`}
              aria-label={
                isEn
                  ? `Select stage background (${resolvedBgItem.tier} · ${resolvedBgItem.nameEn})`
                  : `배경 선택 (${resolvedBgItem.tier}등급 · ${resolvedBgItem.nameKo})`
              }
              title={
                isEn
                  ? `Stage Backdrop: ${resolvedBgItem.tier} · ${resolvedBgItem.nameEn}`
                  : `배경 선택 · ${resolvedBgItem.tier}등급 ${resolvedBgItem.nameKo}`
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(false);
                onOpenBackgroundPicker?.();
              }}
            >
              <span className="studio-vton-history-icon-wrap">
                <Layers size={14} strokeWidth={2.1} aria-hidden="true" />
                <sup className="studio-vton-history-sup">{resolvedBgItem.tier}</sup>
              </span>
            </button>
          )}
        </div>

        <div className="atelier-stage-brand-cluster">
          <button
            type="button"
            className={`atelier-weather-capsule is-top-center tabular-nums ${weatherPopupOpen ? 'is-open' : ''}`}
            data-atelier-weather-capsule="true"
            data-weather-stage-badge={effectiveWeather}
            aria-haspopup="dialog"
            aria-expanded={Boolean(weatherPopupOpen)}
            aria-label={
              isEn
                ? `${resolvedLocationLabel} ${capsuleTempC}°C, ${weatherBadgeMeta.curationLabel}. Open weather, location, and AI Look 1 & 2 settings`
                : `${resolvedLocationLabel} ${capsuleTempC}°C, ${weatherBadgeMeta.curationLabel}. 날씨·위치 및 AI 코디 Look 1·2 설정 열기`
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setHistoryOpen(false);
              onOpenWeatherPopup?.();
            }}
          >
            <span className="atelier-weather-capsule-icon" aria-hidden="true">
              {renderWeatherCapsuleIcon(effectiveWeather, scenarioKey)}
            </span>
            <div className="atelier-weather-capsule-metrics">
              <div className="atelier-weather-capsule-primary-row">
                <strong className="atelier-weather-capsule-temp">
                  {resolvedLocationLabel} · {capsuleTempC}°C
                </strong>
                <span className="studio-weather-curation-dot" aria-hidden="true" />
                <span className="atelier-weather-capsule-curation">
                  {capsuleStatusWord}
                </span>
              </div>
              <span className="atelier-weather-capsule-sub" data-weather-capsule-datetime="true">
                {weatherCapsuleDateTimeLabel} · {weatherBadgeMeta.tempText}
              </span>
            </div>
            <ChevronDown
              size={11}
              className={`atelier-weather-capsule-chevron ${weatherPopupOpen ? 'is-open' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="studio-vton-hud-right">
          <button
            type="button"
            data-vton-history-btn="true"
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            aria-label={
              isEn
                ? `Saved AI Try-On outfits (today ${dailyHistoryBadgeCount})`
                : `이전 AI 피팅 기록 (오늘 ${dailyHistoryBadgeCount})`
            }
            title={
              isEn
                ? `Today's AI Try-Ons: ${dailyHistoryBadgeCount} · Reuse saved outfits instantly without extra generation`
                : `오늘 생성한 AI 피팅 ${dailyHistoryBadgeCount}건 · 추가 생성 없이 즉시 불러오기`
            }
            className={`studio-vton-history-pill-btn tabular-nums ${historyOpen ? 'is-active' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggleHistoryPopover}
          >
            <span className="studio-vton-history-icon-wrap">
              <History size={15} strokeWidth={2.1} aria-hidden="true" />
              <sup
                className="studio-vton-history-sup tabular-nums"
                data-vton-history-count={dailyHistoryBadgeCount}
              >
                {dailyHistoryBadgeCount}
              </sup>
            </span>
          </button>
        </div>
      </div>

      {/* Transient Non-Interactive 360° Swipe Angle Feedback Pill (fades out automatically) */}
      {swipeHudBadgeVisible && (
        <div
          className="studio-swipe-angle-feedback tabular-nums"
          data-swipe-angle-feedback={viewAngleDeg}
          aria-hidden="true"
        >
          <span>{isEn ? angleSpec.fullEn : angleSpec.fullKo}</span>
        </div>
      )}

      {/* Layer 1 (z-10 Floor Contact Shadow) + Layer 2 (z-20 RGBA Transparent Model / Unfolded Flat-Lay Board) */}
      <EditorialFlatLayBoard
        slots={slots}
        layers={layers}
        activeSlotKey={activeSlotKey}
        onSelectSlot={onSelectSlot}
        stageMode={stageMode}
        styleMode={styleMode}
        aiImageUrl={resolvedAiImageUrl}
        aiLoading={aiLoading}
        effectiveWeather={effectiveWeather}
        theme={resolvedTheme}
        skinToneHex={
          skinProfile?.skinToneHex ||
          resolvedAvatarSpec?.appearance?.skinToneHex ||
          '#DFBA9B'
        }
        personalColor={
          skinProfile?.personalColor ||
          resolvedAvatarSpec?.appearance?.personalColor ||
          'autumn_warm'
        }
        skinProfile={skinProfile}
        bodySpec={bodySpec}
        user={user}
        avatarSpec={resolvedAvatarSpec}
        avatarConfigHash={resolvedAvatarHash}
        personReferenceUrl={activeFacePhotoUrl}
        viewAngleDeg={viewAngleDeg}
        scrollResidualYawDeg={scrollResidualYawDeg}
        forceMirrorX={pinnedHistoryForceMirrorX}
        onSwipeRotate={handleSwipeRotate}
        onTapCharacter={handleTapCharacter}
        onCloseFlatLay={handleCloseFlatLay}
        canReturnToCharacter={canReturnToCharacter}
        compareActive={effectiveCompareActive}
        compareSplitPct={compareSplitPct}
        onCompareSplitChange={setCompareSplitPct}
        zoom={zoom}
        pan={pan}
        onZoomChange={setZoom}
        onPanChange={setPan}
        onIdealScaleChange={setIdealBaseScale}
        legacyMode={viewerMode}
        lang={resolvedLang}
      />

      {/* Layer 3 (z-30 Standalone Weather Environment Overlay — pointer-events: none) */}
      <WeatherCanvasOverlay
        weather={stageWeatherOverlayMode}
        isDark={resolvedTheme === 'dark'}
        timeOfDay={timeOfDay}
        isIndoorStage={!isStageOutdoor}
        umbrellaCollisionEnabled={
          isStageOutdoor && stageMode === 'ai-vton' && Boolean(resolvedAiImageUrl || slots?.acc_umbrella)
        }
      />

      {/* Click-outside dismiss scrim for open `기록` popover */}
      {historyOpen && (
        <div
          aria-hidden="true"
          data-vton-popover-backdrop="true"
          className="studio-popover-dismiss-scrim"
          onClick={(e) => {
            e.stopPropagation();
            setHistoryOpen(false);
          }}
        />
      )}

      {/* Smart Credit-Saver Staged CTA Bar */}
      {hasStagedBarVisible && (
          <div
            className="studio-vton-staged-bar"
            data-vton-staged-bar="true"
            role="region"
            aria-label={isEn ? 'AI Try-On generation controls' : 'AI 피팅 생성 제어'}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-vton-generate-btn="true"
              className="studio-vton-generate-cta-btn"
              onClick={handleApproveStagedSynthesis}
            >
              <Sparkles size={12} />
              <span>{isEn ? 'Generate AI Try-On' : '이 코디 AI 피팅 생성'}</span>
            </button>
            <button
              type="button"
              data-vton-autogen-toggle="true"
              aria-pressed={autoGenEnabled}
              title={
                isEn
                  ? 'Toggle automatic AI fitting on garment change'
                  : '옷 변경 시 자동 AI 피팅 켜기/끄기'
              }
              className={`studio-vton-autogen-btn ${autoGenEnabled ? 'is-active' : ''}`}
              onClick={handleToggleAutoGen}
            >
              <Zap size={11} />
              <span>
                {isEn
                  ? `Auto ${autoGenEnabled ? 'ON' : 'OFF'}`
                  : `자동 입히기 ${autoGenEnabled ? '켬' : '끔'}`}
              </span>
            </button>
          </div>
        )}

      {/* Pinned History Banner when viewing a past generated outfit different from current wardrobe slots */}
      {hasPinnedBannerVisible && (
          <div
            className="studio-vton-pinned-banner"
            data-vton-pinned-banner="true"
            onClick={(e) => e.stopPropagation()}
          >
            <History size={12} />
            <span className="studio-vton-pinned-label">
              {isEn
                ? `Saved fit: ${pinnedHistoryItem.outfitLabel}`
                : `보관함 피팅: ${pinnedHistoryItem.outfitLabel}`}
            </span>
            <button
              type="button"
              data-vton-unpin-btn="true"
              className="studio-vton-toast-action"
              onClick={(e) => {
                e.stopPropagation();
                setPinnedHistoryItem(null);
                setHistoryOverrideStyle(null);
              }}
            >
              <span>{isEn ? 'Current Outfit' : '현재 코디 보기'}</span>
            </button>
          </div>
        )}

      {/* Slim Studio Status Capsule (bottom HUD rail) — calm, single-line, one primary inline action.
          Replaces the former red-dot alert box so AI model fitting reads as a studio feature. */}
      {!effectiveCompareActive &&
        !historyOpen &&
        statusCapsuleSpec &&
        (equippedCount > 0 || statusToast.reason === 'empty_outfit') && (
          <div
            className={`studio-vton-status-toast studio-status-capsule ${showAngleDock ? 'is-above-angle-dock' : ''}`}
            data-vton-status-toast="true"
            data-studio-status-capsule="true"
            data-toast-reason={statusToast.reason}
            title={statusToast.reason}
            role="status"
            aria-live="polite"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <span className="studio-status-capsule-dot" aria-hidden="true" />
            <span className="studio-vton-toast-text">{statusCapsuleSpec.message}</span>
            {statusCapsuleSpec.action === 'activate' && (
              <button
                type="button"
                data-vton-open-key-btn="true"
                className="studio-status-capsule-cta"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryOpen(false);
                  setStatusToast(null);
                  onOpenSkinToneModal?.('api-key');
                }}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>{statusCapsuleSpec.actionLabel}</span>
              </button>
            )}
            {statusCapsuleSpec.action === 'retry' && (
              <button
                type="button"
                data-vton-retry-btn="true"
                className="studio-status-capsule-cta"
                onClick={handleRetryAiSynthesis}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>{statusCapsuleSpec.actionLabel}</span>
              </button>
            )}
            {statusCapsuleSpec.offerSample && (
              <button
                type="button"
                data-vton-demo-btn="true"
                className="studio-status-capsule-quiet"
                aria-label={isEn ? 'Preview a sample AI model fitting' : '샘플 AI 모델 피팅 미리 보기'}
                onClick={handleEnableDemoShowcase}
              >
                <span>{isEn ? 'Sample' : '샘플로 보기'}</span>
              </button>
            )}
            <button
              type="button"
              data-vton-dismiss-toast="true"
              className="studio-vton-toast-dismiss"
              aria-label={isEn ? 'Dismiss notice' : '안내 닫기'}
              onClick={(e) => {
                e.stopPropagation();
                setStatusToast(null);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

      {/* Persistent IndexedDB AI Fitting History Drawer / Popover (Top-Right anchored, 0ms / 0-credit reuse) */}
      {historyOpen && (
        <div
          className="studio-vton-history-popover"
          data-vton-history-popover="true"
          role="dialog"
          aria-modal="false"
          aria-label={isEn ? 'Saved AI Try-On history' : '이전 AI 피팅 기록 보관함'}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="studio-vton-key-popover-head">
            <span className="studio-vton-key-popover-title">
              {isEn
                ? `Saved AI Fittings (${historyItems.length})`
                : `이전 AI 피팅 기록 (${historyItems.length})`}
            </span>
            <div className="studio-vton-history-head-actions">
              <button
                type="button"
                data-vton-autogen-toggle="true"
                aria-pressed={autoGenEnabled}
                className={`studio-vton-autogen-btn ${autoGenEnabled ? 'is-active' : ''}`}
                onClick={handleToggleAutoGen}
              >
                <Zap size={10} />
                <span>
                  {isEn
                    ? `Auto ${autoGenEnabled ? 'ON' : 'OFF'}`
                    : `자동 입히기 ${autoGenEnabled ? '켬' : '끔'}`}
                </span>
              </button>
              <button
                type="button"
                data-vton-close-history-btn="true"
                className="studio-vton-key-close"
                aria-label={isEn ? 'Close saved fittings' : '보관함 닫기'}
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryOpen(false);
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <p className="studio-vton-key-popover-desc">
            {isEn
              ? 'Select any previously generated look to restore it across 360° angles instantly without extra generation.'
              : '생성했던 코디 기록을 클릭하면 추가 생성 없이 360° 전 각도를 즉시 불러옵니다.'}
          </p>

          {historyItems.length === 0 ? (
            <div className="studio-vton-history-empty" data-vton-history-empty="true">
              {isEn
                ? 'No saved AI fittings yet. Generated outfits will appear here automatically.'
                : '아직 저장된 AI 피팅 기록이 없습니다. 코디를 AI 피팅으로 생성하면 이곳에 자동 기록됩니다.'}
            </div>
          ) : (
            <div className="studio-vton-history-list">
              {historyItems.map((item) => {
                const isActiveCard = isShowingPinnedHistory
                  ? pinnedHistoryItem?.groupKey === item.groupKey
                  : item.outfitComboId === outfitComboId &&
                    item.avatarConfigHash === resolvedAvatarHash &&
                    item.styleMode === styleMode &&
                    Boolean(resolvedAiImageUrl);
                const thumbSrc =
                  item.angleSlices?.[canonicalSliceAngle] ||
                  item.angleSlices?.[0] ||
                  item.angleSlices?.[45] ||
                  item.thumbnailUrl;
                return (
                  <div
                    key={item.groupKey}
                    role="button"
                    tabIndex={0}
                    data-vton-history-card={item.outfitComboId}
                    className={`studio-vton-history-card ${isActiveCard ? 'is-active' : ''}`}
                    onClick={() => handleSelectHistoryItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectHistoryItem(item);
                      }
                    }}
                  >
                    <img
                      src={thumbSrc}
                      alt={item.outfitLabel}
                      className="studio-vton-history-thumb"
                      loading="lazy"
                    />
                    <div className="studio-vton-history-meta">
                      <span className="studio-vton-history-title">
                        {item.outfitLabel}
                      </span>
                      <span className="studio-vton-history-sub">
                        <span>
                          {item.styleMode === 'stylized_isometric'
                            ? isEn
                              ? 'Character Sim'
                              : '캐릭터 시뮬레이션'
                            : isEn
                              ? 'Photo Model'
                              : '실사 모델'}
                        </span>
                        <span>·</span>
                        <span>{isEn ? '360° Swipe' : '360° 회전'}</span>
                        <span>·</span>
                        <span>{isEn ? 'Saved' : '보관됨'}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      data-vton-history-delete={item.outfitComboId}
                      className="studio-vton-history-del-btn"
                      aria-label={
                        isEn
                          ? `Delete ${item.outfitLabel}`
                          : `${item.outfitLabel} 보관함에서 삭제`
                      }
                      onClick={(e) => handleDeleteHistoryItem(e, item)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Left Vertically Scrollable Worn-Slot Chips Dock */}
      {equippedCount > 0 && (
        <div
          className="studio-worn-slots-dock"
          data-worn-slots-dock="true"
          aria-label={isEn ? 'Equipped garments' : '착용 아이템'}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {layers.map((layer) => {
            const isSelectedSlot = activeSlotKey === layer.slotKey;
            const displayGarmentName =
              isEn && layer.garment.name_en
                ? layer.garment.name_en
                : localizeGarmentName(layer.garment.name, resolvedLang);
            const subMeta = SUB_SLOT_META_BY_KEY[layer.slotKey];
            const slotSide = layer.slotKey.endsWith('_left')
              ? 'left'
              : layer.slotKey.endsWith('_right')
                ? 'right'
                : null;
            const sideBadge = slotSide === 'left' ? 'L' : slotSide === 'right' ? 'R' : null;
            const slotFullTitle = subMeta
              ? `${isEn ? subMeta.labelEn : subMeta.labelKo}: ${displayGarmentName}`
              : displayGarmentName;
            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                role="button"
                tabIndex={0}
                aria-label={slotFullTitle}
                aria-pressed={isSelectedSlot}
                data-studio-slot={layer.slotKey}
                data-slot-side={slotSide || undefined}
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''}`}
                title={slotFullTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(layer.slotKey);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectSlot?.(layer.slotKey);
                  }
                }}
              >
                <StudioGarmentImage
                  item={layer.garment}
                  alt={displayGarmentName}
                  allowStorePhoto={Boolean(
                    layer.garment.image_url &&
                      (layer.garment.image_url.startsWith('data:') ||
                        layer.garment.image_url.startsWith('/uploads/'))
                  )}
                  style={{ width: '100%', height: '100%' }}
                />
                {sideBadge && (
                  <span
                    className="studio-worn-slot-side-tag"
                    data-slot-side={sideBadge}
                    aria-hidden="true"
                  >
                    {sideBadge}
                  </span>
                )}
                <button
                  type="button"
                  className="studio-worn-slot-remove"
                  aria-label={
                    isEn
                      ? `Remove ${displayGarmentName}`
                      : `${layer.garment.name} 착장 해제`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnequipSlot?.(layer.slotKey);
                  }}
                >
                  <X size={10} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom-Left Compact Icon AI Look 1 / Look 2 Switcher (right above angle scrollbar) */}
      {stageLookRecommendations.length > 0 && (
        <div
          className="studio-weather-look-dock"
          data-weather-look-dock="true"
          role="group"
          aria-label={isEn ? 'AI weather outfit recommendations' : 'AI 날씨 추천 코디'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {stageLookRecommendations.map((rec, idx) => {
            const isSelected = activeRecId === rec.id;
            const styleKey =
              rec.presetKey ||
              (idx === 0
                ? lookStyleConfig?.look1Style || 'business_casual'
                : lookStyleConfig?.look2Style || 'comfortable_casual');
            const presetMeta =
              LOOK_STYLE_TITLE_LABELS[styleKey] || LOOK_STYLE_TITLE_LABELS.business_casual;
            const presetTitle = isEn
              ? rec.presetLabelEn || presetMeta.en
              : rec.presetLabelKo || presetMeta.ko;
            const LookStyleIcon =
              styleKey === 'comfortable_casual'
                ? Coffee
                : styleKey === 'formal_office'
                  ? Award
                  : styleKey === 'minimal_daily'
                    ? Sparkles
                    : Briefcase;
            return (
              <button
                key={rec.id || `look-${idx + 1}`}
                type="button"
                data-weather-rec-id={rec.id}
                aria-pressed={isSelected}
                aria-label={`Look ${idx + 1}: ${presetTitle}`}
                title={`Look ${idx + 1} · ${presetTitle}`}
                className={`studio-weather-look-pill is-icon-compact tabular-nums ${isSelected ? 'is-selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyRecommendation?.(rec);
                }}
              >
                <LookStyleIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                <span className="studio-weather-look-num" aria-hidden="true">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Symmetrical Angle Scrollbar (-180° Back .. 0° Front [Center Start] .. +180° Back) */}
      <div
        className={`studio-angle-scroll-dock ${!showAngleDock ? 'is-hidden' : ''}`}
        data-angle-scroll-dock="true"
        data-angle-dock-visible={showAngleDock ? 'true' : 'false'}
        aria-hidden={!showAngleDock ? 'true' : undefined}
        inert={!showAngleDock}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="studio-angle-scroll-labels">
          <button
            type="button"
            data-angle-end-btn="left-back"
            className={`studio-angle-end-label ${angleScrollDeg <= -158 ? 'is-active' : ''}`}
            onClick={() => handleJumpAngleScroll(-180)}
          >
            {isEn ? 'Back' : '뒷모습'}
          </button>

          <button
            type="button"
            data-angle-center-reset="true"
            className={`studio-angle-center-pill tabular-nums ${
              viewAngleDeg === 0 && Math.abs(angleScrollDeg) <= 12 ? 'is-front' : ''
            }`}
            title={isEn ? 'Reset to 0° Front' : '0° 정면으로 이동'}
            onClick={() => handleJumpAngleScroll(0)}
          >
            <span>{centerAngleReadout}</span>
          </button>

          <button
            type="button"
            data-angle-end-btn="right-back"
            className={`studio-angle-end-label ${angleScrollDeg >= 158 ? 'is-active' : ''}`}
            onClick={() => handleJumpAngleScroll(180)}
          >
            {isEn ? 'Back' : '뒷모습'}
          </button>
        </div>

        <div className="studio-angle-scroll-track-wrap">
          <div className="studio-angle-scroll-ticks" aria-hidden="true">
            <span className="studio-angle-tick is-end" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick is-center" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick" />
            <span className="studio-angle-tick is-end" />
          </div>
          <input
            type="range"
            data-angle-scroll-input="true"
            className="studio-angle-scroll-input"
            min={-180}
            max={180}
            step={1}
            value={angleScrollDeg}
            aria-label={
              isEn
                ? 'Mannequin angle scroll (center 0 degrees front, both ends 180 degrees back)'
                : '마네킹 각도 스크롤 (가운데 0도 정면, 양 끝 뒷모습)'
            }
            onChange={handleAngleScrollChange}
            onPointerUp={handleAngleScrollRelease}
            onPointerCancel={handleAngleScrollRelease}
            onTouchEnd={handleAngleScrollRelease}
            onKeyUp={handleAngleScrollRelease}
            onBlur={handleAngleScrollRelease}
          />
        </div>
      </div>
    </div>
  );
});

export default Studio2DFittingViewer;
