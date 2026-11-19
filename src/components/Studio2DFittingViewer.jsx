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
  patchAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  PROFILE_CONFIG_UPDATED_EVENT,
  fetchServerProfileConfig,
} from '../services/profileConfigService.ts';
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
  isBagGarmentItem,
  normalizeHandedness,
  resolveStageAuraTier,
} from '../services/vtonQualityControl.ts';
import {
  getWeatherStageBadgeMeta,
  resolveEffectiveWeatherFromRaw,
} from '../services/weatherPromptBuilder.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
import { consumePostLoginReveal } from '../utils/logoTransition.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_STAGE_BACKGROUND_ID,
  clampLightingIntensity,
  getStageBackgroundById,
  normalizeLightingPreset,
  tierToCssSlug,
} from '../utils/stageBackgroundCatalog.ts';
import { resolveStageLightingFrame } from '../utils/stageLightingEngine.ts';
import {
  formatWeatherCapsuleDateTime,
  resolveEffectiveClientTimeOfDay,
} from '../utils/tomorrowPromptPolicy.ts';
import EditorialFlatLayBoard from './EditorialFlatLayBoard.jsx';
import FittingAtelierBackdrop from './FittingAtelierBackdrop.tsx';
import StageGroundDeck from './FittingWeatherGroundDeck.tsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import StudioThreeStageLayer from './three/StudioThreeStageLayer.tsx';
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
  'outer_mid',
  'top_mid',
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

const ASYMMETRIC_ITEM_SLOT_KEYS = [
  'accessory',
  'acc_umbrella',
  'acc_hand_left',
  'acc_hand_right',
  'acc_wrist_left',
  'acc_wrist_right',
  'jwl_ear_left',
  'jwl_ear_right',
  'jwl_wrist_left',
  'jwl_wrist_right',
  'jwl_ring_left',
  'jwl_ring_right',
];
void ASYMMETRIC_ITEM_SLOT_KEYS;

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
  lightingPreset = DEFAULT_LIGHTING_PRESET,
  lightingIntensity = DEFAULT_LIGHTING_INTENSITY,
  onOpenBackgroundPicker,
  onOpenMobileDrawer,
  mobileDrawerOpen = false,
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

  const initialPostLoginRevealRef = useRef(null);
  if (initialPostLoginRevealRef.current === null) {
    initialPostLoginRevealRef.current = consumePostLoginReveal();
  }
  const [stageMode, setStageMode] = useState(() =>
    initialPostLoginRevealRef.current ? 'flatlay' : 'ai-vton'
  );
  const [postLoginRevealActive, setPostLoginRevealActive] = useState(() =>
    Boolean(initialPostLoginRevealRef.current)
  );
  const [postLoginProgress, setPostLoginProgress] = useState(0);
  const postLoginRevealActiveRef = useRef(postLoginRevealActive);
  postLoginRevealActiveRef.current = postLoginRevealActive;
  const [frontOnlyDegraded, setFrontOnlyDegraded] = useState(false);
  const [frontOnlyToastVisible, setFrontOnlyToastVisible] = useState(false);
  const [frontOnlyPopupInfo, setFrontOnlyPopupInfo] = useState(null);
  const frontOnlyToastTimerRef = useRef(null);
  const clearFrontOnlyFallbackState = useCallback(() => {
    if (frontOnlyToastTimerRef.current) {
      clearTimeout(frontOnlyToastTimerRef.current);
      frontOnlyToastTimerRef.current = null;
    }
    setFrontOnlyDegraded(false);
    setFrontOnlyToastVisible(false);
    setFrontOnlyPopupInfo(null);
  }, []);
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
  const [lookMenuOpen, setLookMenuOpen] = useState(false);
  const [pinnedHistoryItem, setPinnedHistoryItem] = useState(null);
  const [dayKey, setDayKey] = useState(() => getLocalDayKey());
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const syncClock = () => setClockNow(new Date());
    const id = setInterval(syncClock, 30000);
    return () => clearInterval(id);
  }, []);

  const [zoom, setZoom] = useState(1);
  const [floorPlacement, setFloorPlacement] = useState(() => ({
    effectiveBaseScale: 1,
    soleTransformOrigin: '50% 95.5%',
    soleStageTopPct: 85.5,
    renderedContentW: null,
    renderedContentH: null,
  }));
  const handleFloorPlacementChange = useCallback((next) => {
    if (!next || typeof next !== 'object') return;
    setFloorPlacement((prev) => {
      if (
        prev.effectiveBaseScale === next.effectiveBaseScale &&
        prev.soleTransformOrigin === next.soleTransformOrigin &&
        prev.soleStageTopPct === next.soleStageTopPct &&
        prev.renderedContentW === next.renderedContentW &&
        prev.renderedContentH === next.renderedContentH
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const [activeHudTouchId, setActiveHudTouchId] = useState(null);
  const [isAngleInteracting, setIsAngleInteracting] = useState(false);

  const handleHudTouchStart = useCallback((touchId) => {
    setActiveHudTouchId(touchId);
    triggerHaptic('selection');
  }, []);

  const handleHudTouchEnd = useCallback(() => {
    setActiveHudTouchId(null);
  }, []);

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
      clearFrontOnlyFallbackState();
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
    };
    window.addEventListener(VTON_STYLE_PREF_EVENT, handleStylePrefUpdated);
    return () => window.removeEventListener(VTON_STYLE_PREF_EVENT, handleStylePrefUpdated);
  }, [clearFrontOnlyFallbackState]);

  // Sync server-side profile configuration (`handedness`) updates immediately into VTON pipeline
  useEffect(() => {
    const handleProfileConfigUpdated = (ev) => {
      const detail = ev?.detail;
      const nextHand = normalizeHandedness(detail?.handedness, 'right');
      if (resolvedAvatarSpec?.dominantHand === nextHand) {
        return;
      }
      scenarioVtonSnapshotsRef.current = {};
      setScenarioSnapEpoch((n) => n + 1);
      patchAvatarSpec({ dominantHand: nextHand });
      setPinnedHistoryItem(null);
      clearFrontOnlyFallbackState();
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    };
    window.addEventListener(PROFILE_CONFIG_UPDATED_EVENT, handleProfileConfigUpdated);
    return () =>
      window.removeEventListener(PROFILE_CONFIG_UPDATED_EVENT, handleProfileConfigUpdated);
  }, [resolvedAvatarSpec?.dominantHand, clearFrontOnlyFallbackState]);

  // Dismiss open `기록` or `Look 1/2` popover cleanly on Escape key
  useEffect(() => {
    if (!historyOpen && !lookMenuOpen) return undefined;
    const handleKeyDown = (ev) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      if (
        typeof document !== 'undefined' &&
        document.querySelector(
          '.hig-modal-backdrop, [role="dialog"][aria-modal="true"], #profile-studio-sheet:not([hidden]), #weather-recommend-panel'
        )
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();
      setHistoryOpen(false);
      setLookMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyOpen, lookMenuOpen]);

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
      if (frontOnlyToastTimerRef.current) {
        clearTimeout(frontOnlyToastTimerRef.current);
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
  const auraTier = useMemo(
    () => resolveStageAuraTier(resolvedBgItem?.tier || resolvedBgItem?.id),
    [resolvedBgItem]
  );

  const effectiveWeather = useMemo(
    () => resolveEffectiveWeatherFromRaw(weather),
    [weather]
  );
  const stageEffectiveWeather = isStageOutdoor ? effectiveWeather : 'clear';

  const vtonWeather = useMemo(() => {
    if (isStageOutdoor || effectiveWeather !== 'rain' || !weather || typeof weather !== 'object') {
      return weather;
    }
    return {
      ...weather,
      effectiveWeather: 'cloudy',
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

  const activeHandedness = normalizeHandedness(resolvedAvatarSpec?.dominantHand, 'right');
  const equippedBagEntry = useMemo(() => {
    if (!vtonSlots || typeof vtonSlots !== 'object') return null;
    for (const [slotKey, item] of Object.entries(vtonSlots)) {
      if (
        item &&
        typeof item === 'object' &&
        isBagGarmentItem({
          slot: slotKey,
          category: item.category,
          subcategory: item.subcategory,
          name: item.name,
        })
      ) {
        return { slotKey, garment: item };
      }
    }
    return null;
  }, [vtonSlots]);
  const hasEquippedBag = Boolean(equippedBagEntry);

  const normalizedScenarioKey = scenarioKey || 'live';
  const { outfitComboId } = useMemo(
    () => computeOutfitComboId(vtonSlots, activeHandedness),
    [vtonSlots, activeHandedness]
  );
  const scenarioVtonKey = `${normalizedScenarioKey}|${isStageOutdoor ? 'outdoor' : 'indoor'}|${outfitComboId}|${styleMode}|${resolvedAvatarHash}`;
  const scenarioVtonSnapshotsRef = useRef({});
  const [scenarioSnapEpoch, setScenarioSnapEpoch] = useState(0);

  const recordScenarioVtonSnapshot = useCallback(
    (targetKey, angleDeg, imageUrl, angleSlicesMap = null, meta = null) => {
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
        frontOnlyDegraded: Boolean(meta?.frontOnlyDegraded),
        notificationPopup: meta?.frontOnlyDegraded ? meta.notificationPopup || null : null,
      };
      setScenarioSnapEpoch((n) => n + 1);
    },
    []
  );

  const prevFacePhotoRef = useRef(activeFacePhotoUrl);
  const pendingFacePhotoApproveRef = useRef(null);
  const prevEffectiveWeatherRef = useRef(vtonEffectiveWeather);
  const pendingWeatherApproveRef = useRef(null);
  const prevScenarioKeyRef = useRef(normalizedScenarioKey);
  const pendingScenarioApproveRef = useRef(null);
  const pendingScenarioSlotHydrationRef = useRef(false);
  const pendingScenarioHydrationUntilRef = useRef(0);
  const prevRefreshNonceRef = useRef(forceRefreshNonce);
  const prevOutfitComboRef = useRef(outfitComboId);

  // Manual garment changes in the wardrobe unpin history and return to primary stage flow
  useEffect(() => {
    if (prevOutfitComboRef.current !== outfitComboId) {
      prevOutfitComboRef.current = outfitComboId;
      clearFrontOnlyFallbackState();
      if (restoringFromHistoryRef.current) {
        restoringFromHistoryRef.current = false;
      } else {
        setPinnedHistoryItem(null);
        setHistoryOverrideStyle(null);
        if (
          pendingScenarioSlotHydrationRef.current &&
          Date.now() <= pendingScenarioHydrationUntilRef.current
        ) {
          pendingScenarioSlotHydrationRef.current = false;
          pendingScenarioApproveRef.current = normalizedScenarioKey;
        }
        if (!postLoginRevealActiveRef.current) {
          setStageMode('ai-vton');
        }
      }
    }
  }, [outfitComboId, normalizedScenarioKey, clearFrontOnlyFallbackState]);

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
      clearFrontOnlyFallbackState();
      if (hasKey && equippedCount > 0) {
        userApprovedGenRef.current = true;
        forceBypassCacheRef.current = false;
        setStageMode('ai-vton');
        setRetryNonce((n) => n + 1);
      }
    };
    window.addEventListener(GEMINI_API_KEY_EVENT, handleApiKeyUpdated);
    return () => window.removeEventListener(GEMINI_API_KEY_EVENT, handleApiKeyUpdated);
  }, [equippedCount, clearFrontOnlyFallbackState]);

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
        ? peekShowcaseDemoVtonSlice(styleMode, canonicalSliceAngle, {
            handedness: activeHandedness,
            hasEquippedBag,
            bagGarment: equippedBagEntry?.garment || null,
          })
        : null,
    [
      demoShowcaseEnabled,
      styleMode,
      canonicalSliceAngle,
      activeHandedness,
      hasEquippedBag,
      equippedBagEntry,
    ]
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
    avatarSpec,
    resolvedAvatarSpec,
    resolvedAvatarHash,
    hasEquippedBag,
    equippedBagGarment: equippedBagEntry?.garment || null,
    canonicalSliceAngle,
    styleMode,
    weather: vtonWeather,
    effectiveWeather: vtonEffectiveWeather,
    normalizedScenarioKey,
    isStageOutdoor,
    scenarioVtonKey,
    resolvedTheme,
    rawLegacyMode,
    forceRefresh,
    resolvedLang,
    onAiLookGenerated,
  });

  useEffect(() => {
    latestInputsRef.current = {
      slots: vtonSlots,
      skinProfile,
      bodySpec,
      user,
      avatarSpec,
      resolvedAvatarSpec,
      resolvedAvatarHash,
      hasEquippedBag,
      equippedBagGarment: equippedBagEntry?.garment || null,
      canonicalSliceAngle,
      styleMode,
      weather: vtonWeather,
      effectiveWeather: vtonEffectiveWeather,
      normalizedScenarioKey,
      isStageOutdoor,
      scenarioVtonKey,
      resolvedTheme,
      rawLegacyMode,
      forceRefresh,
      resolvedLang,
      onAiLookGenerated,
    };
  });

  const isVtonPipelineActive = stageMode === 'ai-vton' || postLoginRevealActive;

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
      pendingScenarioSlotHydrationRef.current = true;
      pendingScenarioHydrationUntilRef.current = Date.now() + 2500;
      setPinnedHistoryItem(null);
    }
    if (prevScenarioKeyRef.current !== normalizedScenarioKey) {
      prevScenarioKeyRef.current = normalizedScenarioKey;
      pendingScenarioApproveRef.current = normalizedScenarioKey;
      pendingScenarioSlotHydrationRef.current = true;
      pendingScenarioHydrationUntilRef.current = Date.now() + 2500;
      setPinnedHistoryItem(null);
    }
    const weatherTabJustChanged = Boolean(
      pendingWeatherApproveRef.current === vtonEffectiveWeather ||
        pendingScenarioApproveRef.current === normalizedScenarioKey
    );

    if (!isVtonPipelineActive || equippedCount === 0) {
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

    const scenarioEntry = !isForceBypass ? scenarioVtonSnapshotsRef.current[scenarioVtonKey] : null;
    const scenarioExactUrl = scenarioEntry?.angleSlices?.[snap.canonicalSliceAngle] || null;

    if (scenarioExactUrl) {
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
      pendingScenarioApproveRef.current = null;
      hasInitialAutoRunRef.current = true;
      setStagedNeedsApply(false);
      if (scenarioEntry?.frontOnlyDegraded) {
        setFrontOnlyDegraded(true);
        if (scenarioEntry.notificationPopup) {
          setFrontOnlyPopupInfo(scenarioEntry.notificationPopup);
        }
      } else {
        clearFrontOnlyFallbackState();
      }
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
      clearFrontOnlyFallbackState();
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
      const snapHandedness = normalizeHandedness(
        snap.resolvedAvatarSpec?.dominantHand,
        'right'
      );
      const cachedDemoUrl = peekShowcaseDemoVtonSlice(
        activeDemoStyle,
        snap.canonicalSliceAngle,
        {
          handedness: snapHandedness,
          hasEquippedBag: snap.hasEquippedBag,
          bagGarment: snap.equippedBagGarment || null,
        }
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
        clearFrontOnlyFallbackState();
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
          void Promise.all(siblingPromises)
            .then((hits) => {
              if (controller.signal.aborted) return;
              const siblingMap = {
                [snap.canonicalSliceAngle]: idbHit.slice.imageUrl,
              };
              hits.forEach((h, idx) => {
                if (h?.slice?.imageUrl) {
                  siblingMap[siblingAngles[idx]] = h.slice.imageUrl;
                }
              });
              const existingSnap = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
              recordScenarioVtonSnapshot(
                scenarioVtonKey,
                snap.canonicalSliceAngle,
                idbHit.slice.imageUrl,
                siblingMap,
                existingSnap?.frontOnlyDegraded
                  ? {
                      frontOnlyDegraded: true,
                      notificationPopup: existingSnap.notificationPopup || null,
                    }
                  : null
              );
              preloadImageUrls([
                idbHit.slice.imageUrl,
                ...hits.map((h) => h?.slice?.imageUrl).filter(Boolean),
              ]);
            })
            .catch(() => {});

          forceBypassCacheRef.current = false;
          userApprovedGenRef.current = false;
          pendingFacePhotoApproveRef.current = null;
          pendingWeatherApproveRef.current = null;
          pendingScenarioApproveRef.current = null;
          hasInitialAutoRunRef.current = true;
          setStagedNeedsApply(false);
          clearFrontOnlyFallbackState();
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
        isDirectDemoClick || isForceBypass || demoShowcaseEnabled
          ? 0
          : weatherTabJustChanged
            ? 210
            : facePhotoJustApplied
              ? 90
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
        // Explicitly check server-side profile configuration (`handedness`, default `'right'`) before rendering showcase character
        const activeStyle = normalizeVtonStyleMode(liveSnap.styleMode);
        const fallbackHand = normalizeHandedness(
          liveSnap.resolvedAvatarSpec?.dominantHand,
          'right'
        );
        fetchServerProfileConfig(fallbackHand)
          .then((serverCfg) => {
            if (controller.signal.aborted) return null;
            const resolvedHand = serverCfg.hasStoredRecord
              ? serverCfg.handedness
              : fallbackHand;
            if (
              serverCfg.hasStoredRecord &&
              resolvedHand !== liveSnap.resolvedAvatarSpec?.dominantHand &&
              !liveSnap.avatarSpec
            ) {
              patchAvatarSpec({ dominantHand: resolvedHand });
            }
            const liveSlots = liveSnap.slots || {};
            let liveBagGarment = null;
            for (const [slotKey, item] of Object.entries(liveSlots)) {
              if (
                item &&
                typeof item === 'object' &&
                isBagGarmentItem({
                  slot: slotKey,
                  category: item.category,
                  subcategory: item.subcategory,
                  name: item.name,
                })
              ) {
                liveBagGarment = item;
                break;
              }
            }
            return loadShowcaseDemoVtonSlices(activeStyle, {
              handedness: resolvedHand,
              hasEquippedBag: Boolean(liveBagGarment),
              bagGarment: liveBagGarment,
            });
          })
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
              clearFrontOnlyFallbackState();
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
              liveSnap.onAiLookGenerated?.({
                imageUrl: targetUrl,
                styleMode: liveSnap.styleMode,
                fromCache: true,
                slots: liveSnap.slots,
              });
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
          const isFrontOnly = Boolean(outcome.frontOnlyDegraded);
          const effectiveRecordedAngle = isFrontOnly ? 0 : liveSnap.canonicalSliceAngle;
          const resolvedOutcomeCacheKey = isFrontOnly
            ? `${buildAiVtonCacheKey({
                avatarConfigHash: liveSnap.resolvedAvatarHash,
                outfitComboId,
                styleMode: liveSnap.styleMode,
                effectiveWeather: liveSnap.effectiveWeather,
                angleDeg: 0,
              })}|sc:${liveSnap.normalizedScenarioKey}|${liveSnap.isStageOutdoor ? 'outdoor' : 'indoor'}`
            : currentAiCacheKey;
          recordScenarioVtonSnapshot(
            liveSnap.scenarioVtonKey,
            effectiveRecordedAngle,
            outcome.imageUrl,
            outcome.angleSlices || null,
            {
              frontOnlyDegraded: isFrontOnly,
              notificationPopup: isFrontOnly ? outcome.notificationPopup || null : null,
            }
          );
          setAiLoading(false);
          configBlockedRef.current = false;
          setStagedNeedsApply(false);
          setFrontOnlyDegraded(isFrontOnly);
          if (frontOnlyToastTimerRef.current) {
            clearTimeout(frontOnlyToastTimerRef.current);
            frontOnlyToastTimerRef.current = null;
          }
          if (isFrontOnly) {
            const toastDurationMs = Math.max(
              1500,
              Math.min(8000, Number(outcome.notificationPopup?.durationMs) || 3000)
            );
            setFrontOnlyPopupInfo(outcome.notificationPopup || null);
            commitAngleDeg(0);
            setFrontOnlyToastVisible(true);
            frontOnlyToastTimerRef.current = setTimeout(() => {
              frontOnlyToastTimerRef.current = null;
              setFrontOnlyToastVisible(false);
            }, toastDurationMs);
          } else {
            setFrontOnlyPopupInfo(null);
            setFrontOnlyToastVisible(false);
          }
          setAiState({
            cacheKey: resolvedOutcomeCacheKey,
            imageUrl: outcome.imageUrl,
            fromCache: outcome.fromCache,
            provider: 'gemini-vton',
          });
          setStatusToast(null);
          refreshHistoryList();
          liveSnap.onAiLookGenerated?.({
            imageUrl: outcome.imageUrl,
            styleMode: liveSnap.styleMode,
            fromCache: Boolean(outcome.fromCache),
            slots: liveSnap.slots,
          });
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
    isVtonPipelineActive,
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
    clearFrontOnlyFallbackState,
    commitAngleDeg,
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
      clearFrontOnlyFallbackState();
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(true);
      setStatusToast(null);
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, clearFrontOnlyFallbackState, showToast]
  );

  const handleApproveStagedSynthesis = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (equippedCount === 0) {
        showToast('empty_outfit');
        return;
      }
      configBlockedRef.current = false;
      clearFrontOnlyFallbackState();
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setStatusToast(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, clearFrontOnlyFallbackState, showToast]
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
      clearFrontOnlyFallbackState();
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(false);
      setStatusToast(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = true;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, scenarioVtonKey, clearFrontOnlyFallbackState, showToast]
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
      setLookMenuOpen(false);
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
      clearFrontOnlyFallbackState();
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
      clearFrontOnlyFallbackState,
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

  const handleUserInteractFlatLay = useCallback(() => {
    setPostLoginRevealActive(false);
  }, []);

  useEffect(() => {
    if (!postLoginRevealActive) return undefined;
    setPostLoginProgress(0);
    const startTs = Date.now();
    const DURATION_MS = 2600;
    const intervalId = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startTs) / DURATION_MS) * 100);
      setPostLoginProgress(pct);
    }, 50);
    return () => clearInterval(intervalId);
  }, [postLoginRevealActive]);

  useEffect(() => {
    if (!postLoginRevealActive || postLoginProgress < 100 || aiLoading) return;
    setStageMode('ai-vton');
    setPostLoginRevealActive(false);
  }, [postLoginRevealActive, postLoginProgress, aiLoading]);

  useEffect(() => {
    if (!canReturnToCharacter) return undefined;
    const handleEscLookbook = (ev) => {
      if (ev.key !== 'Escape') return;
      if (ev.defaultPrevented || weatherPopupOpen || historyOpen) return;
      if (
        typeof document !== 'undefined' &&
        document.querySelector(
          '.hig-modal-backdrop, [role="dialog"][aria-modal="true"], #profile-studio-sheet:not([hidden]), #weather-recommend-panel'
        )
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      setStageMode('ai-vton');
    };
    window.addEventListener('keydown', handleEscLookbook);
    return () => window.removeEventListener('keydown', handleEscLookbook);
  }, [canReturnToCharacter, weatherPopupOpen, historyOpen]);

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

  const showAngleDock =
    !frontOnlyDegraded &&
    shouldShowStudioAngleDock({
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
      !postLoginRevealActive &&
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

  const clockNowMs = clockNow instanceof Date ? clockNow.getTime() : Date.now();
  const normalizedLightingPreset = normalizeLightingPreset(lightingPreset);
  const clampedLightingIntensity = clampLightingIntensity(lightingIntensity);

  const stageLightingFrame = useMemo(
    () =>
      resolveStageLightingFrame({
        backgroundId: resolvedBgItem.id,
        isOutdoor: isStageOutdoor,
        weather: {
          ...(weather || {}),
          effectiveWeather,
          scenarioKey,
        },
        timestampMs: clockNowMs,
        lightingPreset: normalizedLightingPreset,
        lightingIntensity: clampedLightingIntensity,
        theme: resolvedTheme,
      }),
    [
      resolvedBgItem.id,
      isStageOutdoor,
      weather,
      effectiveWeather,
      scenarioKey,
      clockNowMs,
      normalizedLightingPreset,
      clampedLightingIntensity,
      resolvedTheme,
    ]
  );

  const viewerRootRef = useRef(null);
  useEffect(() => {
    const el = viewerRootRef.current;
    if (!el) return;
    el.style.setProperty('--stage-char-rim-shadow', stageLightingFrame.characterRimDropShadow);
  }, [stageLightingFrame.characterRimDropShadow]);

  return (
    <div
      ref={viewerRootRef}
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
      data-optical-regime={stageLightingFrame.opticalRegime}
      data-lighting-preset={stageLightingFrame.preset}
      data-lighting-intensity={String(stageLightingFrame.intensityPct)}
      data-post-sunset={stageLightingFrame.solar.isPostSunset ? 'true' : 'false'}
      data-lookbook-overlay={canReturnToCharacter ? 'true' : undefined}
      data-post-login-reveal={postLoginRevealActive ? 'true' : undefined}
      data-front-only-degraded={frontOnlyDegraded ? 'true' : undefined}
      data-stage-theme={resolvedTheme}
      data-effective-weather={effectiveWeather}
      data-weather-scenario={scenarioKey}
      data-day-target={dayTarget}
      data-time-of-day={timeOfDay}
      data-vton-style={styleMode}
      data-equipped-count={equippedCount}
      data-vton-provider={activeProvider}
      data-vton-cached={isCachedHit ? 'true' : 'false'}
      data-vton-loading={aiLoading && !postLoginRevealActive ? 'true' : 'false'}
      data-view-angle={viewAngleDeg}
      data-angle-scroll={angleScrollDeg}
      data-avatar-hash={resolvedAvatarHash}
      data-vton-handedness={activeHandedness}
      data-vton-bag-mirrored={hasEquippedBag && activeHandedness === 'left' ? 'true' : 'false'}
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
        weather={weather}
        clockNowMs={clockNowMs}
        lightingPreset={normalizedLightingPreset}
        lightingIntensity={clampedLightingIntensity}
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
        idealBaseScale={floorPlacement.effectiveBaseScale}
        soleTransformOrigin={floorPlacement.soleTransformOrigin}
        soleStageTopPct={floorPlacement.soleStageTopPct}
        renderedContentW={floorPlacement.renderedContentW}
        renderedContentH={floorPlacement.renderedContentH}
        pan={pan}
        compareActive={effectiveCompareActive}
        compareSplitPct={compareSplitPct}
        hasArchitecturalBackdrop={true}
        isOutdoor={isStageOutdoor}
      />

      {/* Layer 1B (z-12): Hybrid Three.js Spatial Lighting, Ground Contact, Camera Parallax & Volumetric Weather */}
      {Boolean(resolvedAiImageUrl) && stageMode === 'ai-vton' && !canReturnToCharacter && (
        <StudioThreeStageLayer
          isOutdoor={isStageOutdoor}
          weatherMode={stageEffectiveWeather}
          timeOfDay={timeOfDay}
          auraTier={resolvedBgItem?.tier || auraTier}
          theme={resolvedTheme}
          angleScrollDeg={angleScrollDeg}
          paused={false}
          hasCharacter={true}
          stageBackgroundId={resolvedBgItem.id}
          weather={weather}
          clockNowMs={clockNowMs}
          lightingPreset={normalizedLightingPreset}
          lightingIntensity={clampedLightingIntensity}
        />
      )}

      {/* Top Synthesis Progress Line & Step-by-Step Status Pill during Gemini AI VTON Generation */}
      {aiLoading && !postLoginRevealActive && (
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

      {/* Layer 4 (z-55+): Symmetrical Slim Top HUD — Left [BG] Slot | Top-Center Weather Capsule | Right [Wardrobe Drawer] */}
      <div className="studio-stage-top-hud">
        <div className="studio-hud-left-slot">
          {showStageBgPickerBtn && (
            <button
              type="button"
              data-stage-bg-picker-btn="true"
              data-stage-bg-tier={resolvedBgItem.tier}
              className={`studio-stage-bg-picker-btn tabular-nums is-tier-${tierToCssSlug(resolvedBgItem.tier)} ${
                activeHudTouchId === 'bg-picker' ? 'is-interacting' : ''
              }`.trim()}
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
              onPointerDown={(e) => {
                e.stopPropagation();
                handleHudTouchStart('bg-picker');
              }}
              onPointerUp={handleHudTouchEnd}
              onPointerCancel={handleHudTouchEnd}
              onPointerLeave={handleHudTouchEnd}
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(false);
                setLookMenuOpen(false);
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
            className={`atelier-weather-capsule is-top-center tabular-nums ${
              weatherPopupOpen ? 'is-open' : ''
            } ${activeHudTouchId === 'weather-capsule' ? 'is-interacting' : ''}`.trim()}
            data-atelier-weather-capsule="true"
            data-weather-stage-badge={effectiveWeather}
            aria-haspopup="dialog"
            aria-expanded={Boolean(weatherPopupOpen)}
            aria-label={
              isEn
                ? `${resolvedLocationLabel} ${capsuleTempC}°C, ${weatherBadgeMeta.curationLabel}. Open weather, location, and AI Look 1 & 2 settings`
                : `${resolvedLocationLabel} ${capsuleTempC}°C, ${weatherBadgeMeta.curationLabel}. 날씨·위치 및 AI 코디 Look 1·2 설정 열기`
            }
            onPointerDown={(e) => {
              e.stopPropagation();
              handleHudTouchStart('weather-capsule');
            }}
            onPointerUp={handleHudTouchEnd}
            onPointerCancel={handleHudTouchEnd}
            onPointerLeave={handleHudTouchEnd}
            onClick={(e) => {
              e.stopPropagation();
              setHistoryOpen(false);
              setLookMenuOpen(false);
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
          {onOpenMobileDrawer && (
            <button
              type="button"
              data-mobile-wardrobe-trigger="true"
              aria-haspopup="dialog"
              aria-expanded={Boolean(mobileDrawerOpen)}
              aria-controls="outfit-mobile-wardrobe-sheet"
              aria-label={isEn ? 'Open Wardrobe Drawer' : '옷장 서랍 열기'}
              title={isEn ? 'Open Wardrobe Drawer' : '옷장 서랍 열기'}
              className={`studio-top-wardrobe-drawer-btn ${
                mobileDrawerOpen ? 'is-active' : ''
              } ${activeHudTouchId === 'mobile-drawer-hud' ? 'is-interacting' : ''}`.trim()}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleHudTouchStart('mobile-drawer-hud');
              }}
              onPointerUp={handleHudTouchEnd}
              onPointerCancel={handleHudTouchEnd}
              onPointerLeave={handleHudTouchEnd}
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(false);
                setLookMenuOpen(false);
                onOpenMobileDrawer?.();
              }}
            >
              <Layers size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          )}
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
        aiLoading={aiLoading && !postLoginRevealActive}
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
        onSwipeRotate={frontOnlyDegraded ? undefined : handleSwipeRotate}
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
        onFloorPlacementChange={handleFloorPlacementChange}
        auraTier={auraTier}
        postLoginRevealActive={postLoginRevealActive}
        postLoginProgress={postLoginProgress}
        onUserInteractFlatLay={handleUserInteractFlatLay}
        legacyMode={viewerMode}
        lang={resolvedLang}
      />

      {/* Click-outside dismiss scrim for open `기록` or `Look 1/2` popover */}
      {(historyOpen || lookMenuOpen) && (
        <div
          aria-hidden="true"
          data-vton-popover-backdrop="true"
          className="studio-popover-dismiss-scrim"
          onClick={(e) => {
            e.stopPropagation();
            setHistoryOpen(false);
            setLookMenuOpen(false);
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
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''} ${
                  activeHudTouchId === `slot-${layer.slotKey}` ? 'is-interacting' : ''
                }`.trim()}
                title={slotFullTitle}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleHudTouchStart(`slot-${layer.slotKey}`);
                }}
                onPointerUp={handleHudTouchEnd}
                onPointerCancel={handleHudTouchEnd}
                onPointerLeave={handleHudTouchEnd}
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
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    triggerHaptic('selection');
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    pendingScenarioSlotHydrationRef.current = false;
                    pendingScenarioHydrationUntilRef.current = 0;
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

      {/* Bottom-Left HUD Stack: [Single Look 1/2 Selector Button] above [Saved AI Fitting History Button] */}
      <div
        className="studio-bottom-left-hud-stack"
        data-bottom-left-hud="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {stageLookRecommendations.length > 0 &&
          (() => {
            const foundIdx = stageLookRecommendations.findIndex((r) => r.id === activeRecId);
            const activeLookIdx = foundIdx >= 0 ? foundIdx : 0;
            const activeRec =
              stageLookRecommendations[activeLookIdx] || stageLookRecommendations[0];
            const activeStyleKey =
              activeRec?.presetKey ||
              (activeLookIdx === 0
                ? lookStyleConfig?.look1Style || 'business_casual'
                : lookStyleConfig?.look2Style || 'comfortable_casual');
            const activePresetMeta =
              LOOK_STYLE_TITLE_LABELS[activeStyleKey] || LOOK_STYLE_TITLE_LABELS.business_casual;
            const activePresetTitle = isEn
              ? activeRec?.presetLabelEn || activePresetMeta.en
              : activeRec?.presetLabelKo || activePresetMeta.ko;
            const ActiveLookIcon =
              activeStyleKey === 'comfortable_casual'
                ? Coffee
                : activeStyleKey === 'formal_office'
                  ? Award
                  : activeStyleKey === 'minimal_daily'
                    ? Sparkles
                    : Briefcase;

            return (
              <div
                className="studio-weather-look-dock is-single-selector"
                data-weather-look-dock="true"
                data-look-dock-orientation="single"
              >
                <button
                  type="button"
                  data-look-selector-trigger="true"
                  aria-haspopup="menu"
                  aria-expanded={lookMenuOpen}
                  aria-label={
                    isEn
                      ? `Select AI Look 1 or 2 (current Look ${activeLookIdx + 1}: ${activePresetTitle})`
                      : `Look 1/2 선택 (현재 Look ${activeLookIdx + 1}: ${activePresetTitle})`
                  }
                  title={
                    isEn
                      ? `Look ${activeLookIdx + 1} · ${activePresetTitle} (Click to choose Look 1 or 2)`
                      : `Look ${activeLookIdx + 1} · ${activePresetTitle} (클릭하여 Look 1·2 선택)`
                  }
                  className={`studio-look-selector-btn tabular-nums ${
                    lookMenuOpen ? 'is-open' : ''
                  } ${activeHudTouchId === 'look-selector' ? 'is-interacting' : ''}`.trim()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleHudTouchStart('look-selector');
                  }}
                  onPointerUp={handleHudTouchEnd}
                  onPointerCancel={handleHudTouchEnd}
                  onPointerLeave={handleHudTouchEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryOpen(false);
                    setLookMenuOpen((prev) => !prev);
                  }}
                >
                  <ActiveLookIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span className="studio-weather-look-num" aria-hidden="true">
                    {activeLookIdx + 1}
                  </span>
                </button>

                {lookMenuOpen && (
                  <div
                    className="studio-look-selector-menu"
                    data-look-selector-menu="true"
                    role="menu"
                    aria-label={
                      isEn ? 'AI weather outfit recommendations' : 'AI 날씨 추천 Look 선택'
                    }
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {stageLookRecommendations.map((rec, idx) => {
                      const isSelected = idx === activeLookIdx;
                      const styleKey =
                        rec.presetKey ||
                        (idx === 0
                          ? lookStyleConfig?.look1Style || 'business_casual'
                          : lookStyleConfig?.look2Style || 'comfortable_casual');
                      const presetMeta =
                        LOOK_STYLE_TITLE_LABELS[styleKey] ||
                        LOOK_STYLE_TITLE_LABELS.business_casual;
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
                          role="menuitemradio"
                          aria-checked={isSelected}
                          data-weather-rec-id={rec.id}
                          aria-label={`Look ${idx + 1}: ${presetTitle}`}
                          className={`studio-look-selector-option tabular-nums ${
                            isSelected ? 'is-selected' : ''
                          }`.trim()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLookMenuOpen(false);
                            onApplyRecommendation?.(rec);
                          }}
                        >
                          <LookStyleIcon size={13} strokeWidth={2.1} aria-hidden="true" />
                          <span className="studio-look-option-copy">
                            <strong>Look {idx + 1}</strong>
                            <span>{presetTitle}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        <button
          type="button"
          data-vton-history-btn="true"
          aria-haspopup="dialog"
          aria-expanded={historyOpen}
          aria-label={
            isEn
              ? `Saved AI Try-On outfits (today ${dailyHistoryBadgeCount})`
              : `오늘 생성한 AI 피팅 불러오기 (오늘 ${dailyHistoryBadgeCount})`
          }
          title={
            isEn
              ? `Today's AI Try-Ons: ${dailyHistoryBadgeCount} · Reuse saved outfits instantly without extra generation`
              : `오늘 생성한 AI 피팅 ${dailyHistoryBadgeCount}건 · 추가 생성 없이 즉시 불러오기`
          }
          className={`studio-vton-history-pill-btn is-bottom-left-docked tabular-nums ${
            historyOpen ? 'is-active' : ''
          } ${activeHudTouchId === 'history-btn' ? 'is-interacting' : ''}`.trim()}
          onPointerDown={(e) => {
            e.stopPropagation();
            handleHudTouchStart('history-btn');
          }}
          onPointerUp={handleHudTouchEnd}
          onPointerCancel={handleHudTouchEnd}
          onPointerLeave={handleHudTouchEnd}
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

      {/* 3s Auto-Dismiss Toast for Front-Only Degraded Multi-Angle Fallback */}
      {frontOnlyToastVisible && (
        <div
          className="studio-front-only-toast"
          data-vton-front-only-toast="true"
          role="status"
          aria-live="polite"
        >
          <span>
            {isEn
              ? frontOnlyPopupInfo?.messageEn ||
                'Due to a temporary connection issue, only the front view is shown.'
              : frontOnlyPopupInfo?.messageKo ||
                '현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.'}
          </span>
        </div>
      )}

      {/* Bottom Sleek Architectural Angle Slider (-180° Back .. 0° Front .. +180° Back) */}
      <div
        className={`studio-angle-scroll-dock is-sleek-dial ${!showAngleDock ? 'is-hidden' : ''} ${
          isAngleInteracting ? 'is-interacting' : ''
        }`.trim()}
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
            onPointerDown={() => triggerHaptic('selection')}
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
            onPointerDown={() => triggerHaptic('selection')}
            onClick={() => handleJumpAngleScroll(0)}
          >
            <span>{centerAngleReadout}</span>
          </button>

          <button
            type="button"
            data-angle-end-btn="right-back"
            className={`studio-angle-end-label ${angleScrollDeg >= 158 ? 'is-active' : ''}`}
            onPointerDown={() => triggerHaptic('selection')}
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
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsAngleInteracting(true);
              triggerHaptic('selection');
            }}
            onChange={handleAngleScrollChange}
            onPointerUp={(e) => {
              setIsAngleInteracting(false);
              handleAngleScrollRelease(e);
            }}
            onPointerCancel={(e) => {
              setIsAngleInteracting(false);
              handleAngleScrollRelease(e);
            }}
            onTouchEnd={(e) => {
              setIsAngleInteracting(false);
              handleAngleScrollRelease(e);
            }}
            onKeyUp={handleAngleScrollRelease}
            onBlur={(e) => {
              setIsAngleInteracting(false);
              handleAngleScrollRelease(e);
            }}
          />
        </div>
      </div>
    </div>
  );
});

export default Studio2DFittingViewer;
