import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudRain,
  CloudSun,
  Columns2,
  Flame,
  History,
  KeyRound,
  RefreshCw,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Wind,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
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
  getWeatherStageBadgeMeta,
  resolveEffectiveWeatherFromRaw,
} from '../services/weatherPromptBuilder.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
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

function formatZoomLabel(zoomValue) {
  const rounded = Math.round((Number(zoomValue) || 1) * 10) / 10;
  return `${rounded.toFixed(1)}×`;
}

function isKeyActionableReason(reason) {
  return (
    reason === 'gemini_api_key_not_configured' ||
    reason === 'backend_unavailable' ||
    reason === 'gemini_invalid_api_key' ||
    reason === 'gemini_leaked_key' ||
    reason === 'gemini_billing_required' ||
    reason === 'gemini_http_401' ||
    reason === 'gemini_http_403'
  );
}

function formatFallbackToastMessage(reason, lang) {
  const isEn = lang === 'en';
  if (reason === 'empty_outfit') {
    return isEn
      ? 'Select at least one garment from your wardrobe before running AI Try-On.'
      : 'AI 가상 피팅을 실행하려면 옷장에서 의류를 1개 이상 선택해 주세요.';
  }
  if (reason === 'gemini_api_key_not_configured' || reason === 'backend_unavailable') {
    return isEn
      ? 'Gemini API key is not configured — set your key in Profile or explore the Flat-Lay Lookbook.'
      : 'Gemini API 키가 설정되지 않아 플랫레이 룩북을 표시합니다. 프로필에서 API 키를 설정할 수 있습니다.';
  }
  if (reason === 'gemini_invalid_api_key') {
    return isEn
      ? 'Invalid Gemini API key — please check your key in Profile.'
      : '유효하지 않은 Gemini API 키입니다 — 프로필에서 키를 다시 확인해 주세요.';
  }
  if (reason === 'gemini_leaked_key') {
    return isEn
      ? 'This API key was blocked as publicly exposed — issue a new key in AI Studio.'
      : '공개 노출로 차단된 API 키입니다 — AI Studio에서 새 키를 발급해 주세요.';
  }
  if (reason === 'gemini_billing_required') {
    return isEn
      ? 'Free-tier keys have 0 quota for Gemini image generation — link Tier 1 billing or try Sample AI Try-On.'
      : '무료 티어 키는 이미지 생성 한도가 0입니다 — 유료 결제(Tier 1)를 연결하거나 샘플 피팅을 체험해 보세요.';
  }
  if (reason === 'gemini_http_401' || reason === 'gemini_http_403') {
    return isEn
      ? 'Gemini API permission denied — please verify your API key in Profile.'
      : 'Gemini API 키 권한을 확인해 주세요 (프로필에서 재설정 가능).';
  }
  if (reason === 'gemini_http_429') {
    return isEn
      ? 'Gemini API rate limit reached (429) — please retry in a moment.'
      : 'Gemini API 요청 한도(429)에 도달했습니다 — 잠시 후 재시도해 주세요.';
  }
  if (typeof reason === 'string' && reason.startsWith('gemini_empty_image_')) {
    return isEn
      ? `Model did not return an image (${reason.replace('gemini_empty_image_', '')}) — please retry or adjust garments.`
      : `안전 필터 또는 응답 제한으로 이미지가 반환되지 않았습니다 (${reason.replace('gemini_empty_image_', '')}) — 재시도해 주세요.`;
  }
  const codeSuffix =
    typeof reason === 'string' && reason && reason !== 'gemini_unavailable'
      ? ` [${reason}]`
      : '';
  return isEn
    ? `AI virtual try-on could not be generated — keeping Editorial Flat-Lay Board.${codeSuffix}`
    : `AI 가상 피팅 생성이 지연되어 에디토리얼 플랫레이 보드를 유지합니다.${codeSuffix}`;
}

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
  scenarioKey = 'live',
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onRestoreHistorySlots,
  onQuickSelectPreset: _legacyQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal: _legacyOpenBodyModal,
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

  const viewAngleRef = useRef(viewAngleDeg);
  useEffect(() => {
    viewAngleRef.current = viewAngleDeg;
    if (!isScrubbingScrollRef.current) {
      setAngleScrollDeg((prev) => angle360ToSignedScrollDeg(viewAngleDeg, prev));
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
  }, []);

  const handleJumpAngleScroll = useCallback(
    (targetSignedDeg) => {
      clearSpinTimers();
      isScrubbingScrollRef.current = false;
      const nextScroll = resolveSignedAngleScrollState(targetSignedDeg);
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

  const [zoom, setZoom] = useState(1);
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
    listCachedAiVtonOutfits(24)
      .then((items) => {
        setHistoryItems(items);
      })
      .catch(() => {
        // Ignore IndexedDB enumeration errors
      });
  }, []);

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

  const effectiveWeather = useMemo(
    () => resolveEffectiveWeatherFromRaw(weather),
    [weather]
  );
  const weatherOverlayMode = useMemo(() => {
    if (scenarioKey === 'warm_spring') return 'mild';
    if (scenarioKey === 'live' && effectiveWeather === 'clear') return 'forecast';
    return effectiveWeather;
  }, [scenarioKey, effectiveWeather]);

  const weatherBadgeMeta = useMemo(
    () => getWeatherStageBadgeMeta(weather, resolvedLang),
    [weather, resolvedLang]
  );

  const { outfitComboId } = useMemo(() => computeOutfitComboId(slots), [slots]);
  const prevFacePhotoRef = useRef(activeFacePhotoUrl);
  const pendingFacePhotoApproveRef = useRef(null);
  const prevEffectiveWeatherRef = useRef(effectiveWeather);
  const pendingWeatherApproveRef = useRef(null);
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
      buildAiVtonCacheKey({
        avatarConfigHash: resolvedAvatarHash,
        outfitComboId,
        styleMode,
        effectiveWeather,
        angleDeg: canonicalSliceAngle,
      }),
    [resolvedAvatarHash, outfitComboId, styleMode, effectiveWeather, canonicalSliceAngle]
  );

  const historyCount = historyItems.length;
  const memorySlice = useMemo(() => {
    void historyCount;
    if (forceRefresh) return null;
    return peekMemoryAiVtonSlice({
      avatarConfigHash: resolvedAvatarHash,
      outfitComboId,
      styleMode,
      effectiveWeather,
      angleDeg: canonicalSliceAngle,
    });
  }, [
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    effectiveWeather,
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

  const flatLayCached = useMemo(
    () =>
      trackFlatLayComboVisit(
        `flatlay::${resolvedAvatarHash}::${outfitComboId}::${effectiveWeather}::${viewAngleDeg}`
      ),
    [resolvedAvatarHash, outfitComboId, effectiveWeather, viewAngleDeg]
  );

  const latestInputsRef = useRef({
    slots,
    skinProfile,
    bodySpec,
    user,
    resolvedAvatarSpec,
    resolvedAvatarHash,
    canonicalSliceAngle,
    styleMode,
    weather,
    effectiveWeather,
    resolvedTheme,
    rawLegacyMode,
    forceRefresh,
    resolvedLang,
  });

  useEffect(() => {
    latestInputsRef.current = {
      slots,
      skinProfile,
      bodySpec,
      user,
      resolvedAvatarSpec,
      resolvedAvatarHash,
      canonicalSliceAngle,
      styleMode,
      weather,
      effectiveWeather,
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

    if (prevEffectiveWeatherRef.current !== effectiveWeather) {
      prevEffectiveWeatherRef.current = effectiveWeather;
      pendingWeatherApproveRef.current = effectiveWeather;
      setPinnedHistoryItem(null);
    }
    const weatherTabJustChanged = Boolean(
      pendingWeatherApproveRef.current === effectiveWeather
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
          pinnedHistoryItem.effectiveWeather !== effectiveWeather))
    ) {
      setAiLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    const snap = latestInputsRef.current;
    const isForceBypass = Boolean(snap.forceRefresh || forceBypassCacheRef.current);
    const isUserApproved = Boolean(
      isForceBypass ||
        userApprovedGenRef.current ||
        facePhotoJustApplied ||
        weatherTabJustChanged
    );

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
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
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
      const cachedDemoUrl = peekShowcaseDemoVtonSlice(
        snap.styleMode,
        snap.canonicalSliceAngle
      );
      if (cachedDemoUrl) {
        forceBypassCacheRef.current = false;
        userApprovedGenRef.current = false;
        pendingFacePhotoApproveRef.current = null;
        pendingWeatherApproveRef.current = null;
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
          const siblingPromises = TURNAROUND_ANGLES.filter(
            (deg) => deg !== snap.canonicalSliceAngle
          ).map((deg) =>
            readCachedAiVtonSlice({
              avatarConfigHash: snap.resolvedAvatarHash,
              outfitComboId,
              styleMode: snap.styleMode,
              effectiveWeather: snap.effectiveWeather,
              angleDeg: deg,
            })
          );
          void Promise.all(siblingPromises).then((hits) => {
            preloadImageUrls([
              idbHit.slice.imageUrl,
              ...hits.map((h) => h?.slice?.imageUrl).filter(Boolean),
            ]);
          });

          forceBypassCacheRef.current = false;
          userApprovedGenRef.current = false;
          pendingFacePhotoApproveRef.current = null;
          pendingWeatherApproveRef.current = null;
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

      if (
        !isUserApproved &&
        !isDirectDemoClick &&
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

      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      hasInitialAutoRunRef.current = true;
      setStagedNeedsApply(false);
      const liveSnap = latestInputsRef.current;

      const applyShowcaseDemoSlices = () => {
        const activeStyle = normalizeVtonStyleMode(liveSnap.styleMode);
        const altStyle =
          activeStyle === 'photorealistic' ? 'stylized_isometric' : 'photorealistic';
        void loadShowcaseDemoVtonSlices(altStyle);
        loadShowcaseDemoVtonSlices(activeStyle)
          .then((slices) => {
            if (controller.signal.aborted) return;
            pendingFacePhotoApproveRef.current = null;
            pendingWeatherApproveRef.current = null;
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
            pendingFacePhotoApproveRef.current = null;
            pendingWeatherApproveRef.current = null;
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
        pendingFacePhotoApproveRef.current = null;
        pendingWeatherApproveRef.current = null;

        if (outcome.ok && outcome.imageUrl) {
          if (outcome.angleSlices) {
            preloadImageUrls(Object.values(outcome.angleSlices));
          }
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
    outfitComboId,
    resolvedAvatarHash,
    activeFacePhotoUrl,
    effectiveWeather,
    styleMode,
    equippedCount,
    retryNonce,
    demoShowcaseEnabled,
    autoGenEnabled,
    pinnedHistoryItem,
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
    [equippedCount, showToast]
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
        (!item.effectiveWeather || item.effectiveWeather === effectiveWeather);

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
      effectiveWeather,
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

  const handleZoomOut = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev > 2.55) return 2.5;
      if (prev > 1.8) return 1.75;
      setPan({ x: 0, y: 0 });
      return 1;
    });
  }, []);

  const handleZoomCycleOrReset = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev > 1.01) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return 1.75;
    });
  }, []);

  const handleZoomIn = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev < 1.7) return 1.75;
      if (prev < 2.45) return 2.5;
      return Math.min(3, Number((prev + 0.5).toFixed(2)));
    });
  }, []);

  const handleToggleCompare = useCallback(
    (e) => {
      e.stopPropagation();
      if (equippedCount === 0) return;
      setCompareActive((prev) => !prev);
    },
    [equippedCount]
  );

  const isRainy = effectiveWeather === 'rain';
  const isWindy = effectiveWeather === 'wind' || effectiveWeather === 'coldwave';

  const hasPinnedHistoryOverride = Boolean(
    pinnedHistoryItem &&
      (pinnedHistoryItem.outfitComboId !== outfitComboId ||
        pinnedHistoryItem.avatarConfigHash !== resolvedAvatarHash ||
        pinnedHistoryItem.styleMode !== styleMode ||
        (pinnedHistoryItem.effectiveWeather &&
          pinnedHistoryItem.effectiveWeather !== effectiveWeather))
  );

  const isShowingPinnedHistory = Boolean(
    stageMode === 'ai-vton' && hasPinnedHistoryOverride
  );

  const pinnedHistorySliceUrl = hasPinnedHistoryOverride
    ? pinnedHistoryItem.angleSlices?.[canonicalSliceAngle] ||
      pinnedHistoryItem.angleSlices?.[0] ||
      pinnedHistoryItem.angleSlices?.[45] ||
      pinnedHistoryItem.thumbnailUrl ||
      null
    : null;

  const availableAiImageUrl =
    pinnedHistorySliceUrl ||
    memorySlice?.imageUrl ||
    (aiState?.cacheKey === currentAiCacheKey ? aiState.imageUrl : null) ||
    demoSliceUrl ||
    null;

  const resolvedAiImageUrl = stageMode === 'ai-vton' ? availableAiImageUrl : null;
  const canReturnToCharacter = stageMode === 'flatlay' && Boolean(availableAiImageUrl);

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
      ? Boolean(isShowingPinnedHistory || memorySlice || aiState?.fromCache || demoSliceUrl)
      : flatLayCached;

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

  const centerAngleReadout = useMemo(() => {
    if (viewAngleDeg === 0 && Math.abs(angleScrollDeg) <= 12) {
      return isEn ? '0° Front' : '0° 정면';
    }
    if (viewAngleDeg === 180) {
      return isEn ? '180° Back' : '180° 뒷모습';
    }
    return isEn ? angleSpec.shortEn : angleSpec.shortKo;
  }, [viewAngleDeg, angleScrollDeg, angleSpec.shortEn, angleSpec.shortKo, isEn]);

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      className={`studio-25d-canvas studio-2d-vton-viewer is-weather-${effectiveWeather} ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`.trim()}
      data-fitting-mode={viewerMode}
      data-stage-mode={stageMode}
      data-lookbook-overlay={canReturnToCharacter ? 'true' : undefined}
      data-stage-theme={resolvedTheme}
      data-effective-weather={effectiveWeather}
      data-weather-scenario={scenarioKey}
      data-vton-style={styleMode}
      data-equipped-count={equippedCount}
      data-vton-provider={activeProvider}
      data-vton-cached={isCachedHit ? 'true' : 'false'}
      data-vton-loading={aiLoading ? 'true' : 'false'}
      data-view-angle={viewAngleDeg}
      data-angle-scroll={angleScrollDeg}
      data-avatar-hash={resolvedAvatarHash}
    >
      {/* Stage Base (z-0..2): 3D Architectural Showroom Backdrop + Sunlight Gobos */}
      <div aria-hidden="true" className="studio-25d-keylight" />
      <div aria-hidden="true" className="studio-25d-cyclorama-floor" />
      <FittingAtelierBackdrop
        effectiveWeather={effectiveWeather}
        scenarioKey={scenarioKey}
        theme={resolvedTheme}
      />

      {/* Layer 1A (z-10): Perspective Ground Horizon Deck + Real-Time Wet Mirror Reflection + Contact AO Shadow */}
      <StageGroundDeck
        effectiveWeather={effectiveWeather}
        scenarioKey={scenarioKey}
        theme={resolvedTheme}
        modelImageUrl={resolvedAiImageUrl}
        stageMode={stageMode}
        equippedCount={equippedCount}
        mirrorX={angleSpec.mirrorX}
        zoom={zoom}
        pan={pan}
        compareActive={effectiveCompareActive}
        compareSplitPct={compareSplitPct}
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
                  ? 'Analyzing garments & body spec...'
                  : '의류·체형 스펙 분석 중...'
                : loadingStepIdx === 1
                  ? isEn
                    ? `Rendering ${canonicalSliceAngle}° full-body weather pose...`
                    : `${canonicalSliceAngle}° 전신 날씨 포즈 AI 렌더링 중...`
                  : isEn
                    ? 'V4 hole-aware cutout & floor reflection...'
                    : 'V4 내부 홀 투명 누끼 및 지면 접지 합성 중...'}
            </span>
          </div>
        </>
      )}

      {/* Layer 4 (z-55+): Clean Slim Top HUD — Left Weather Capsule | Right [기록] */}
      <div className="studio-stage-top-hud">
        <div className="atelier-stage-brand-cluster" aria-hidden="true">
          <div className="atelier-weather-capsule" data-atelier-weather-capsule="true">
            <span className="atelier-weather-capsule-icon">
              {renderWeatherCapsuleIcon(effectiveWeather, scenarioKey)}
            </span>
            <div className="atelier-weather-capsule-metrics">
              <strong className="atelier-weather-capsule-temp tabular-nums">
                {capsuleTempC}°C
              </strong>
              <span className="atelier-weather-capsule-sub tabular-nums">
                {capsuleTempC}°C / {capsuleStatusWord}
              </span>
            </div>
          </div>
        </div>

        <div className="studio-vton-hud-right">
          <button
            type="button"
            data-vton-history-btn="true"
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            aria-label={
              isEn
                ? `Saved AI Try-On outfits (${historyItems.length})`
                : `이전 AI 피팅 기록 (${historyItems.length})`
            }
            title={
              isEn
                ? 'Reuse previously generated AI outfits (0 credits)'
                : '이전에 생성한 AI 피팅 기록 즉시 불러오기 (크레딧 차감 0)'
            }
            className={`studio-vton-history-pill-btn tabular-nums ${historyOpen ? 'is-active' : ''}`}
            onClick={handleToggleHistoryPopover}
          >
            <History size={13} />
            <span className="studio-vton-history-word">{isEn ? 'Saved' : '기록'}</span>
            {historyItems.length > 0 && (
              <span className="studio-vton-history-count">{historyItems.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Left-Upper Floating Smoked-Glass Circular Controls (Zoom + B/A Split Compare) */}
      <div className="atelier-stage-left-controls">
        <div
          className="studio-vton-zoom-bar"
          role="group"
          aria-label={isEn ? 'Zoom controls' : '확대 및 축소'}
        >
          <button
            type="button"
            data-vton-zoom-in="true"
            className="studio-vton-zoom-btn"
            disabled={zoom >= 2.99}
            aria-label={isEn ? 'Zoom in' : '확대'}
            onClick={handleZoomIn}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            data-vton-zoom-level="true"
            className={`studio-vton-zoom-level-btn tabular-nums ${zoom > 1.01 ? 'is-zoomed' : ''}`}
            aria-label={isEn ? 'Cycle or reset zoom level' : '확대 배율 전환 및 초기화'}
            onClick={handleZoomCycleOrReset}
          >
            {formatZoomLabel(zoom)}
          </button>
          <button
            type="button"
            data-vton-zoom-out="true"
            className="studio-vton-zoom-btn"
            disabled={zoom <= 1.01}
            aria-label={isEn ? 'Zoom out' : '축소'}
            onClick={handleZoomOut}
          >
            <ZoomOut size={14} />
          </button>
        </div>

        <button
          id="toggle-vton-compare-btn"
          type="button"
          data-vton-compare-btn="true"
          disabled={equippedCount === 0}
          aria-pressed={effectiveCompareActive}
          aria-label={
            isEn ? 'Toggle before and after outfit comparison' : '착장 전후 분할 비교'
          }
          title={isEn ? 'Before / After Split Compare' : '착장 전후 비교'}
          className={`studio-vton-compare-btn ${effectiveCompareActive ? 'is-active' : ''}`}
          onClick={handleToggleCompare}
        >
          <Columns2 size={15} />
          <span className="studio-vton-compare-label">B/A</span>
        </button>
      </div>

      {/* Weather Curation Pill Badge */}
      <div
        className="studio-weather-curation-badge tabular-nums"
        data-weather-stage-badge={effectiveWeather}
        aria-hidden="true"
      >
        <span className="studio-weather-curation-dot" />
        <span className="studio-weather-curation-text">{weatherBadgeMeta.fullText}</span>
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
        legacyMode={viewerMode}
        lang={resolvedLang}
      />

      {/* Layer 3 (z-30 Standalone Weather Environment Overlay — pointer-events: none) */}
      <WeatherCanvasOverlay
        weather={weatherOverlayMode}
        isDark={resolvedTheme === 'dark'}
        umbrellaCollisionEnabled={
          stageMode === 'ai-vton' && Boolean(resolvedAiImageUrl || slots?.acc_umbrella)
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
      {!effectiveCompareActive &&
        !historyOpen &&
        !statusToast &&
        stageMode === 'ai-vton' &&
        equippedCount > 0 &&
        stagedNeedsApply &&
        !aiLoading &&
        !resolvedAiImageUrl && (
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
                  ? 'Toggle automatic AI generation on garment change'
                  : '옷 변경 시 자동 AI 생성 켜기/끄기 (OFF 권장: 크레딧 절약)'
              }
              className={`studio-vton-autogen-btn ${autoGenEnabled ? 'is-active' : ''}`}
              onClick={handleToggleAutoGen}
            >
              <Zap size={11} />
              <span>
                {isEn
                  ? `Auto ${autoGenEnabled ? 'ON' : 'OFF'}`
                  : `자동 ${autoGenEnabled ? 'ON' : 'OFF'}`}
              </span>
            </button>
            {historyItems.length > 0 && (
              <button
                type="button"
                className="studio-vton-autogen-btn"
                onClick={handleToggleHistoryPopover}
              >
                <History size={11} />
                <span>
                  {isEn
                    ? `Saved (${historyItems.length})`
                    : `이전 피팅 (${historyItems.length})`}
                </span>
              </button>
            )}
          </div>
        )}

      {/* Pinned History Banner when viewing a past generated outfit different from current wardrobe slots */}
      {isShowingPinnedHistory &&
        !effectiveCompareActive &&
        !historyOpen && (
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

      {/* Status Toast when Gemini API key is missing or synthesis falls back to Flat-Lay Board */}
      {!effectiveCompareActive &&
        !historyOpen &&
        statusToast &&
        (equippedCount > 0 || statusToast.reason === 'empty_outfit') && (
          <div
            className="studio-vton-status-toast"
            data-vton-status-toast="true"
            data-toast-reason={statusToast.reason}
            role="alert"
            aria-live="polite"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="studio-vton-toast-head">
              <span className="studio-vton-toast-dot" aria-hidden="true" />
              <span className="studio-vton-toast-text">
                {formatFallbackToastMessage(statusToast.reason, resolvedLang)}
              </span>
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
                <X size={13} />
              </button>
            </div>
            {statusToast.reason !== 'empty_outfit' && (
              <span className="studio-vton-toast-actions">
                <button
                  type="button"
                  data-vton-retry-btn="true"
                  className="studio-vton-toast-action is-primary-retry"
                  aria-label={isEn ? 'Retry AI virtual try-on' : 'AI 가상 피팅 다시 시도'}
                  onClick={handleRetryAiSynthesis}
                >
                  <RefreshCw size={12} />
                  <span>{isEn ? 'Retry Now' : '다시 시도'}</span>
                </button>
                <button
                  type="button"
                  data-vton-open-key-btn="true"
                  className="studio-vton-toast-action"
                  aria-label={isEn ? 'Configure Gemini API key in Profile' : '프로필에서 Gemini API 키 설정'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryOpen(false);
                    setStatusToast(null);
                    onOpenSkinToneModal?.('api-key');
                  }}
                >
                  <KeyRound size={11} />
                  <span>{isEn ? 'API Key' : 'API 키 설정'}</span>
                </button>
                <button
                  type="button"
                  data-vton-demo-btn="true"
                  className="studio-vton-toast-action"
                  aria-label={isEn ? 'Preview Sample AI Try-On' : '샘플 AI 피팅 체험'}
                  onClick={handleEnableDemoShowcase}
                >
                  <Sparkles size={11} />
                  <span>{isEn ? 'Sample Fit' : '샘플 피팅'}</span>
                </button>
              </span>
            )}
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
                    : `자동 ${autoGenEnabled ? 'ON' : 'OFF'}`}
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
              ? 'Select any previously generated look to restore it across 360° angles instantly with 0 AI credits.'
              : '생성했던 코디 기록을 클릭하면 크레딧 소모 없이 360° 전 각도를 즉시 불러옵니다.'}
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
                        <span>{isEn ? '0 Credit' : '0 크레딧'}</span>
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

      {/* Left Worn-Slot Chips Dock */}
      {equippedCount > 0 && (
        <div
          className="studio-worn-slots-dock"
          aria-label={isEn ? 'Equipped garments' : '착용 아이템'}
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
                data-studio-slot={layer.slotKey}
                data-slot-side={slotSide || undefined}
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''}`}
                title={slotFullTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(layer.slotKey);
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

      {/* Bottom Symmetrical Angle Scrollbar (-180° Back .. 0° Front [Center Start] .. +180° Back) */}
      <div
        className="studio-angle-scroll-dock"
        data-angle-scroll-dock="true"
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
