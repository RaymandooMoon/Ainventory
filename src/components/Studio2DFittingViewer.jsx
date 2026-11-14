import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Columns2,
  ExternalLink,
  History,
  KeyRound,
  LayoutGrid,
  Palette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
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
import { SKIN_TONE_MANNEQUIN_PRESETS } from '../services/skinToneAnalyzer.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  TURNAROUND_ANGLES,
  buildAiVtonCacheKey,
  computeOutfitComboId,
  deleteCachedAiVtonOutfit,
  getStoredClientGeminiApiKey,
  isDemoVtonShowcaseActive,
  listCachedAiVtonOutfits,
  loadShowcaseDemoVtonSlices,
  normalizeTurnaroundAngleDeg,
  normalizeViewerMode,
  normalizeVtonStyleMode,
  peekMemoryAiVtonSlice,
  peekShowcaseDemoVtonSlice,
  readCachedAiVtonSlice,
  resolveClientGeminiApiKey,
  setStoredClientGeminiApiKey,
  synthesizeGeminiMultiAngleVton,
  trackFlatLayComboVisit,
} from '../services/vton2DService.ts';
import { getStoredLang, localizeGarmentName, tr } from '../utils/i18n.ts';
import EditorialFlatLayBoard from './EditorialFlatLayBoard.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
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

const ORDERED_SLOT_KEYS = [
  'headwear',
  'neckwear',
  'outer',
  'top',
  'onepiece',
  'dress',
  'bottom',
  'shoes',
  'accessory',
];

const QUICK_SKIN_PRESETS = [
  SKIN_TONE_MANNEQUIN_PRESETS[0],
  SKIN_TONE_MANNEQUIN_PRESETS[1],
  SKIN_TONE_MANNEQUIN_PRESETS[2],
  SKIN_TONE_MANNEQUIN_PRESETS[4],
  SKIN_TONE_MANNEQUIN_PRESETS[6],
  SKIN_TONE_MANNEQUIN_PRESETS[7],
];

const PRESET_LABEL_EN = {
  porcelain_cool: 'Porcelain Cool',
  spring_ivory: 'Spring Ivory',
  summer_rose: 'Summer Rose',
  warm_vanilla: 'Warm Vanilla',
  autumn_beige: 'Autumn Beige',
  winter_neutral: 'Winter Neutral',
  honey_tan: 'Honey Bronze',
  deep_espresso: 'Deep Espresso',
};

const TURNAROUND_ANGLE_LABELS = {
  0: {
    wordKo: '정면',
    wordEn: 'Front',
    fullKo: '0° 정면 뷰',
    fullEn: '0° Front View',
  },
  45: {
    wordKo: '쿼터뷰',
    wordEn: 'Quarter',
    fullKo: '45° 쿼터뷰',
    fullEn: '45° Quarter View',
  },
  90: {
    wordKo: '측면',
    wordEn: 'Side',
    fullKo: '90° 측면 뷰',
    fullEn: '90° Side Profile',
  },
  180: {
    wordKo: '후면',
    wordEn: 'Back',
    fullKo: '180° 후면 뷰',
    fullEn: '180° Back View',
  },
};

function formatZoomLabel(zoomValue) {
  const rounded = Math.round((Number(zoomValue) || 1) * 10) / 10;
  return `${rounded.toFixed(1)}×`;
}

function getTurnaroundAngleMeta(angleDeg, lang) {
  const safeAngle = normalizeTurnaroundAngleDeg(angleDeg, DEFAULT_TURNAROUND_ANGLE);
  const meta = TURNAROUND_ANGLE_LABELS[safeAngle] || TURNAROUND_ANGLE_LABELS[45];
  const isEn = lang === 'en';
  return {
    angleDeg: safeAngle,
    word: isEn ? meta.wordEn : meta.wordKo,
    fullLabel: isEn ? meta.fullEn : meta.fullKo,
    resetAriaLabel: isEn
      ? `${meta.fullEn} — Reset to 45° quarter view`
      : `${meta.fullKo} — 45° 쿼터뷰 초기화`,
  };
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
      ? 'Gemini API key is not configured — showing Editorial Flat-Lay Board.'
      : 'Gemini API 키가 설정되지 않아 에디토리얼 플랫레이 보드를 표시합니다.';
  }
  if (reason === 'gemini_invalid_api_key') {
    return isEn
      ? 'Invalid Gemini API key — please check your key.'
      : '유효하지 않은 Gemini API 키입니다 — 키를 다시 확인해 주세요.';
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
      ? 'Gemini API permission denied — please verify your API key.'
      : 'Gemini API 키 권한을 확인해 주세요 (플랫레이 보드 유지).';
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
 * Dual-Mode High-Fashion Outfits Central Viewer (Zero Procedural Human Drawing):
 * ① Default Primary Mode: `AI Try-On ('ai-vton')` — `100% Gemini Multimodal Image Generation VTON`
 *    (`0° / 45° / 90° / 180°` turnaround sheet, `[Photorealistic | Stylized Isometric]` style toggle,
 *    IndexedDB 0ms cache, glassmorphism shimmer overlay over Flat-Lay while generating)
 * ② Instant Lookbook Mode: `Editorial Flat-Lay Board ('flatlay')` — 0ms latency, 100% original aspect ratio
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
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal,
  lang,
  forceRefresh = false,
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
    return bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user });
  }, [storeAvatarSpec, storeAvatarHash, skinProfile, bodySpec, user]);

  const resolvedAvatarSpec = avatarSpec || bridgedAvatar.spec;
  const resolvedAvatarHash = useMemo(() => {
    if (avatarConfigHash) return avatarConfigHash;
    if (avatarSpec) return computeAvatarConfigHash(avatarSpec);
    return bridgedAvatar.avatarConfigHash;
  }, [avatarConfigHash, avatarSpec, bridgedAvatar.avatarConfigHash]);

  const [internalViewAngleDeg, setInternalViewAngleDeg] = useState(DEFAULT_TURNAROUND_ANGLE);
  const viewAngleDeg =
    controlledViewAngleDeg !== undefined
      ? normalizeTurnaroundAngleDeg(controlledViewAngleDeg, DEFAULT_TURNAROUND_ANGLE)
      : internalViewAngleDeg;

  const handleViewAngleChange = useCallback(
    (nextRawAngle) => {
      const normalized = normalizeTurnaroundAngleDeg(nextRawAngle, DEFAULT_TURNAROUND_ANGLE);
      setInternalViewAngleDeg(normalized);
      onViewAngleChange?.(normalized);
    },
    [onViewAngleChange]
  );

  const handleStepAngle = useCallback(
    (stepDelta) => {
      const idx = TURNAROUND_ANGLES.indexOf(viewAngleDeg);
      const curIdx = idx >= 0 ? idx : 1;
      const len = TURNAROUND_ANGLES.length;
      const nextAngle = TURNAROUND_ANGLES[(curIdx + stepDelta + len) % len];
      handleViewAngleChange(nextAngle);
    },
    [viewAngleDeg, handleViewAngleChange]
  );

  const [stageMode, setStageMode] = useState('ai-vton');
  const [styleMode, setStyleMode] = useState('photorealistic');
  const [aiState, setAiState] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [demoShowcaseEnabled, setDemoShowcaseEnabled] = useState(() =>
    isDemoVtonShowcaseActive()
  );
  const [keyPopoverOpen, setKeyPopoverOpen] = useState(false);
  const [draftApiKey, setDraftApiKey] = useState(() => getStoredClientGeminiApiKey());
  const [hasSavedClientKey, setHasSavedClientKey] = useState(() =>
    Boolean(getStoredClientGeminiApiKey())
  );

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

  const refreshHistoryList = useCallback(() => {
    listCachedAiVtonOutfits(20)
      .then((items) => {
        setHistoryItems(items);
      })
      .catch(() => {
        // Ignore IndexedDB enumeration errors
      });
  }, []);

  useEffect(() => {
    refreshHistoryList();
  }, [refreshHistoryList]);

  const showToast = useCallback((reason) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setStatusToast({ reason, ts: Date.now() });
    // Keep missing/invalid API key banner pinned until user configures key or dismisses it
    if (!isKeyActionableReason(reason)) {
      toastTimerRef.current = setTimeout(() => {
        setStatusToast(null);
      }, 10000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, []);

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

  const { outfitComboId } = useMemo(() => computeOutfitComboId(slots), [slots]);
  const prevOutfitComboRef = useRef(outfitComboId);

  // Changing garments in the wardrobe returns focus from pinned history back to live outfit
  useEffect(() => {
    if (prevOutfitComboRef.current !== outfitComboId) {
      prevOutfitComboRef.current = outfitComboId;
      setPinnedHistoryItem(null);
    }
  }, [outfitComboId]);

  const currentAiCacheKey = useMemo(
    () =>
      buildAiVtonCacheKey({
        avatarConfigHash: resolvedAvatarHash,
        outfitComboId,
        styleMode,
        angleDeg: viewAngleDeg,
      }),
    [resolvedAvatarHash, outfitComboId, styleMode, viewAngleDeg]
  );

  // Instant 0ms L1 memory slice lookup when switching angles, styles, or revisiting outfits
  const historyCount = historyItems.length;
  const memorySlice = useMemo(() => {
    void historyCount;
    if (forceRefresh) return null;
    return peekMemoryAiVtonSlice({
      avatarConfigHash: resolvedAvatarHash,
      outfitComboId,
      styleMode,
      angleDeg: viewAngleDeg,
    });
  }, [resolvedAvatarHash, outfitComboId, styleMode, viewAngleDeg, forceRefresh, historyCount]);

  const demoSliceUrl = useMemo(
    () =>
      demoShowcaseEnabled
        ? peekShowcaseDemoVtonSlice(styleMode, viewAngleDeg)
        : null,
    [demoShowcaseEnabled, styleMode, viewAngleDeg]
  );

  // Track Flat-Lay combination visits for deterministic revisit state
  const flatLayCached = useMemo(
    () =>
      trackFlatLayComboVisit(
        `flatlay::${resolvedAvatarHash}::${outfitComboId}::${viewAngleDeg}`
      ),
    [resolvedAvatarHash, outfitComboId, viewAngleDeg]
  );

  const latestInputsRef = useRef({
    slots,
    skinProfile,
    bodySpec,
    user,
    resolvedAvatarSpec,
    resolvedAvatarHash,
    viewAngleDeg,
    styleMode,
    weather,
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
      viewAngleDeg,
      styleMode,
      weather,
      resolvedTheme,
      rawLegacyMode,
      forceRefresh,
      resolvedLang,
    };
  });

  // Smart Credit-Saver Gemini Multimodal VTON Pipeline:
  // 1) L1 Memory (0ms) + L2 IndexedDB (~3ms) automatic reuse with 0 AI credits
  // 2) Auto-runs once on initial entry; stages subsequent uncached garment edits at 0ms on Flat-Lay
  //    until the user clicks [✨ 이 코디 AI 피팅 생성] (unless Auto-Gen is explicitly enabled)
  useEffect(() => {
    abortControllerRef.current?.abort();

    if (stageMode !== 'ai-vton' || equippedCount === 0) {
      setAiLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    if (
      pinnedHistoryItem &&
      (pinnedHistoryItem.outfitComboId !== outfitComboId ||
        pinnedHistoryItem.avatarConfigHash !== resolvedAvatarHash ||
        pinnedHistoryItem.styleMode !== styleMode)
    ) {
      setAiLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    const snap = latestInputsRef.current;
    const isForceBypass = Boolean(snap.forceRefresh || forceBypassCacheRef.current);
    const isUserApproved = Boolean(isForceBypass || userApprovedGenRef.current);
    forceBypassCacheRef.current = false;
    userApprovedGenRef.current = false;

    const syncHit = !isForceBypass
      ? peekMemoryAiVtonSlice({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          angleDeg: snap.viewAngleDeg,
        })
      : null;

    if (syncHit) {
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
        snap.viewAngleDeg
      );
      if (cachedDemoUrl) {
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
      // Step A: Fast ~3ms IndexedDB lookup before deciding whether to stage or call Gemini
      if (!isForceBypass) {
        const idbHit = await readCachedAiVtonSlice({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          angleDeg: snap.viewAngleDeg,
        });
        if (controller.signal.aborted) return;

        if (idbHit) {
          // Warm all sibling turnaround angles into L1 memory in background
          for (const deg of TURNAROUND_ANGLES) {
            if (deg !== snap.viewAngleDeg) {
              void readCachedAiVtonSlice({
                avatarConfigHash: snap.resolvedAvatarHash,
                outfitComboId,
                styleMode: snap.styleMode,
                angleDeg: deg,
              });
            }
          }
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

      // Step B: Credit-Saver Staged Gate — after initial entry, do NOT burn credits on every garment tap!
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
        !isUserApproved &&
        !isDirectDemoClick
      ) {
        setAiLoading(false);
        return;
      }

      const delayMs =
        isUserApproved || isDirectDemoClick
          ? 0
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
        const activeStyle = normalizeVtonStyleMode(liveSnap.styleMode);
        const altStyle =
          activeStyle === 'photorealistic' ? 'stylized_isometric' : 'photorealistic';
        void loadShowcaseDemoVtonSlices(altStyle);
        loadShowcaseDemoVtonSlices(activeStyle)
          .then((slices) => {
            if (controller.signal.aborted) return;
            setAiLoading(false);
            const targetUrl =
              slices?.[liveSnap.viewAngleDeg] || slices?.[45] || slices?.[0] || null;
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
          viewAngleDeg: liveSnap.viewAngleDeg,
          styleMode: liveSnap.styleMode,
          weather: liveSnap.weather,
          turnaroundSheet: true,
          theme: liveSnap.resolvedTheme,
          legacyMode: liveSnap.rawLegacyMode,
          forceRefresh: isForceBypass,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (outcome.ok && outcome.imageUrl) {
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

  // Explicit 1-click generation for a newly staged outfit (uses cache if hit, calls Gemini if new)
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

  // Explicit regeneration / retry (bypasses cache when user explicitly clicks Retry)
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
      e?.stopPropagation?.();
      setHistoryOpen((prev) => {
        const next = !prev;
        if (next) {
          setKeyPopoverOpen(false);
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
      setStyleMode(item.styleMode);
      setStageMode('ai-vton');
      if (
        item.outfitComboId === outfitComboId &&
        item.avatarConfigHash === resolvedAvatarHash
      ) {
        setPinnedHistoryItem(null);
      } else {
        setPinnedHistoryItem(item);
      }
      setHistoryOpen(false);
    },
    [outfitComboId, resolvedAvatarHash]
  );

  const handleDeleteHistoryItem = useCallback(
    (e, item) => {
      e?.stopPropagation?.();
      void deleteCachedAiVtonOutfit({
        avatarConfigHash: item.avatarConfigHash,
        outfitComboId: item.outfitComboId,
        styleMode: item.styleMode,
      }).then(() => {
        setPinnedHistoryItem((prev) =>
          prev?.groupKey === item.groupKey ? null : prev
        );
        refreshHistoryList();
      });
    },
    [refreshHistoryList]
  );

  const handleSaveApiKeyAndRetry = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setStoredClientGeminiApiKey(draftApiKey);
      setHasSavedClientKey(Boolean(draftApiKey.trim()));
      configBlockedRef.current = false;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setDemoShowcaseEnabled(false);
      setKeyPopoverOpen(false);
      setStatusToast(null);
      if (equippedCount > 0) {
        userApprovedGenRef.current = true;
        forceBypassCacheRef.current = false;
        setStageMode('ai-vton');
        setRetryNonce((n) => n + 1);
      }
    },
    [draftApiKey, equippedCount]
  );

  const handleClearApiKey = useCallback((e) => {
    e?.stopPropagation?.();
    setDraftApiKey('');
    setStoredClientGeminiApiKey('');
    setHasSavedClientKey(false);
  }, []);

  const handleToggleKeyPopover = useCallback((e) => {
    e?.stopPropagation?.();
    setKeyPopoverOpen((prev) => {
      if (!prev) {
        setHistoryOpen(false);
        setDraftApiKey(getStoredClientGeminiApiKey());
        setStatusToast(null);
      }
      return !prev;
    });
  }, []);

  const handleSelectStageMode = useCallback(
    (nextMode) => {
      if (nextMode === 'flatlay') {
        abortControllerRef.current?.abort();
        setAiLoading(false);
        setStatusToast(null);
        setStageMode('flatlay');
        return;
      }
      if (equippedCount === 0) {
        setStageMode('ai-vton');
        showToast('empty_outfit');
        return;
      }
      configBlockedRef.current = false;
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setStatusToast(null);
      // Approve synthesis ONLY if uncached — NEVER force-bypass existing L1/IndexedDB cache!
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      if (stageMode === 'ai-vton') {
        setRetryNonce((n) => n + 1);
      } else {
        setStageMode('ai-vton');
      }
    },
    [equippedCount, showToast, stageMode]
  );

  const handleSelectStyleMode = useCallback(
    (nextRawStyle) => {
      const normalized = normalizeVtonStyleMode(nextRawStyle);
      setPinnedHistoryItem(null);
      if (stageMode === 'ai-vton') {
        userApprovedGenRef.current = true;
        forceBypassCacheRef.current = false;
      }
      setStyleMode(normalized);
    },
    [stageMode]
  );

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

  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);
  const angleMeta = getTurnaroundAngleMeta(viewAngleDeg, resolvedLang);

  const isShowingPinnedHistory = Boolean(
    stageMode === 'ai-vton' &&
      pinnedHistoryItem &&
      (pinnedHistoryItem.outfitComboId !== outfitComboId ||
        pinnedHistoryItem.avatarConfigHash !== resolvedAvatarHash ||
        pinnedHistoryItem.styleMode !== styleMode)
  );

  const pinnedHistorySliceUrl = isShowingPinnedHistory
    ? pinnedHistoryItem.angleSlices?.[viewAngleDeg] ||
      pinnedHistoryItem.angleSlices?.[45] ||
      pinnedHistoryItem.angleSlices?.[0] ||
      pinnedHistoryItem.thumbnailUrl ||
      null
    : null;

  const resolvedAiImageUrl =
    stageMode === 'ai-vton'
      ? pinnedHistorySliceUrl ||
        memorySlice?.imageUrl ||
        (aiState?.cacheKey === currentAiCacheKey ? aiState.imageUrl : null) ||
        demoSliceUrl
      : null;

  const activeProvider =
    stageMode === 'ai-vton' && resolvedAiImageUrl ? 'gemini-vton' : 'flatlay-lookbook';

  const isCachedHit =
    stageMode === 'ai-vton' && resolvedAiImageUrl
      ? Boolean(isShowingPinnedHistory || memorySlice || aiState?.fromCache || demoSliceUrl)
      : flatLayCached;

  const activeSkinHex = (
    skinProfile?.skinToneHex ||
    resolvedAvatarSpec?.appearance?.skinToneHex ||
    ''
  ).toUpperCase();
  const displayHeightCm =
    bodySpec?.heightCm ?? resolvedAvatarSpec?.anthropometrics?.heightCm;
  const displayWeightKg =
    bodySpec?.weightKg ?? resolvedAvatarSpec?.anthropometrics?.weightKg;

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      className={`studio-25d-canvas studio-2d-vton-viewer ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`.trim()}
      data-fitting-mode={viewerMode}
      data-stage-mode={stageMode}
      data-vton-style={styleMode}
      data-equipped-count={equippedCount}
      data-vton-provider={activeProvider}
      data-vton-cached={isCachedHit ? 'true' : 'false'}
      data-vton-loading={aiLoading ? 'true' : 'false'}
      data-view-angle={viewAngleDeg}
      data-avatar-hash={resolvedAvatarHash}
    >
      {/* Subtle Top Key Illumination */}
      <div aria-hidden="true" className="studio-25d-keylight" />

      {/* Studio Cyclorama Horizon Reflection */}
      <div aria-hidden="true" className="studio-25d-cyclorama-floor" />

      {/* Weather Ambient Stage Cues */}
      {isRainy && <div aria-hidden="true" className="studio-25d-rain-layer" />}
      {isWindy && <div aria-hidden="true" className="studio-25d-wind-layer" />}

      {/* Top Synthesis Progress Line during Gemini AI VTON Generation */}
      {aiLoading && (
        <div aria-hidden="true" className="studio-vton-progress-track">
          <div className="studio-vton-progress-fill is-indeterminate" />
        </div>
      )}

      {/* Top HUD: Zoom Pill Bar + 4-Direction Angle HUD + Before/After Compare + Body Spec */}
      <div className="studio-stage-top-hud">
        <div className="studio-vton-hud-left">
          <div
            className="studio-vton-zoom-bar"
            role="group"
            aria-label={isEn ? 'Zoom controls' : '확대 및 축소'}
          >
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
              data-vton-zoom-in="true"
              className="studio-vton-zoom-btn"
              disabled={zoom >= 2.99}
              aria-label={isEn ? 'Zoom in' : '확대'}
              onClick={handleZoomIn}
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div
            className="studio-iso-rotate-bar"
            role="group"
            aria-label={isEn ? 'View angle controls' : '뷰 각도 회전'}
          >
            <button
              type="button"
              data-iso-rotate-btn="ccw"
              className="studio-iso-rotate-btn"
              aria-label={isEn ? 'Rotate counter-clockwise' : '반시계 방향 회전'}
              onClick={(e) => {
                e.stopPropagation();
                handleStepAngle(-1);
              }}
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              data-iso-angle-badge={viewAngleDeg}
              title={angleMeta.fullLabel}
              aria-label={angleMeta.resetAriaLabel}
              className={`studio-iso-angle-badge tabular-nums ${viewAngleDeg !== DEFAULT_TURNAROUND_ANGLE ? 'is-rotated' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleViewAngleChange(DEFAULT_TURNAROUND_ANGLE);
              }}
            >
              <span className="studio-iso-angle-deg">{angleMeta.angleDeg}°</span>
              <span className="studio-iso-angle-word">{angleMeta.word}</span>
            </button>
            <button
              type="button"
              data-iso-rotate-btn="cw"
              className="studio-iso-rotate-btn"
              aria-label={isEn ? 'Rotate clockwise' : '시계 방향 회전'}
              onClick={(e) => {
                e.stopPropagation();
                handleStepAngle(1);
              }}
            >
              <RotateCw size={13} />
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
            className={`studio-vton-compare-btn ${effectiveCompareActive ? 'is-active' : ''}`}
            onClick={handleToggleCompare}
          >
            <Columns2 size={14} />
            <span className="studio-vton-compare-label">B/A</span>
          </button>
        </div>

        <div className="studio-vton-hud-right">
          <button
            type="button"
            data-vton-history-btn="true"
            aria-expanded={historyOpen}
            aria-label={
              isEn
                ? `Saved AI Try-On outfits (${historyItems.length})`
                : `이전 AI 피팅 보관함 (${historyItems.length})`
            }
            title={
              isEn
                ? 'Reuse previously generated AI outfits (0 credits)'
                : '이전에 생성한 AI 피팅 즉시 불러오기 (크레딧 차감 0)'
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

          <button
            id="open-body-spec-btn"
            type="button"
            className="studio-body-pill-btn tabular-nums"
            aria-label={tr(
              resolvedLang,
              'editProfileBtn',
              isEn ? 'Body & Personal Color' : '체형 설정 열기'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onOpenBodyModal?.();
            }}
          >
            <SlidersHorizontal size={12} />
            <span>
              {displayHeightCm && displayWeightKg
                ? `${displayHeightCm}·${displayWeightKg}`
                : tr(resolvedLang, 'profileBtn', 'Profile')}
            </span>
          </button>
        </div>
      </div>

      {/* Zero-Procedural-Drawing Central Stage: Editorial Flat-Lay Board + Gemini AI VTON */}
      <EditorialFlatLayBoard
        slots={slots}
        layers={layers}
        activeSlotKey={activeSlotKey}
        onSelectSlot={onSelectSlot}
        stageMode={stageMode}
        styleMode={styleMode}
        aiImageUrl={resolvedAiImageUrl}
        aiLoading={aiLoading}
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
        viewAngleDeg={viewAngleDeg}
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

      {/* Smart Credit-Saver Staged CTA Bar: Lets user swap multiple garments at 0ms & 0 credits before generating */}
      {!effectiveCompareActive &&
        !keyPopoverOpen &&
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
        !keyPopoverOpen &&
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
              }}
            >
              <span>{isEn ? 'Current Outfit' : '현재 코디 보기'}</span>
            </button>
          </div>
        )}

      {/* Status Toast when Gemini API key is missing or synthesis falls back to Flat-Lay Board */}
      {!effectiveCompareActive &&
        !keyPopoverOpen &&
        !historyOpen &&
        statusToast &&
        (equippedCount > 0 || statusToast.reason === 'empty_outfit') && (
          <div
            className="studio-vton-status-toast"
            data-vton-status-toast="true"
            data-toast-reason={statusToast.reason}
            role="status"
            aria-live="polite"
            onClick={(e) => {
              e.stopPropagation();
              setStatusToast(null);
            }}
          >
            <span className="studio-vton-toast-dot" aria-hidden="true" />
            <span className="studio-vton-toast-text">
              {formatFallbackToastMessage(statusToast.reason, resolvedLang)}
            </span>
            {statusToast.reason !== 'empty_outfit' && (
              <span className="studio-vton-toast-actions">
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
                <button
                  type="button"
                  data-vton-open-key-btn="true"
                  className="studio-vton-toast-action"
                  aria-label={isEn ? 'Configure Gemini API key' : 'Gemini API 키 설정'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryOpen(false);
                    setDraftApiKey(getStoredClientGeminiApiKey());
                    setKeyPopoverOpen(true);
                    setStatusToast(null);
                  }}
                >
                  <KeyRound size={11} />
                  <span>{isEn ? 'API Key' : '키 설정'}</span>
                </button>
                <button
                  type="button"
                  data-vton-retry-btn="true"
                  className="studio-vton-toast-action"
                  aria-label={isEn ? 'Retry AI virtual try-on' : 'AI 가상 피팅 재시도'}
                  onClick={handleRetryAiSynthesis}
                >
                  <RefreshCw size={11} />
                  <span>{isEn ? 'Retry' : '재시도'}</span>
                </button>
              </span>
            )}
          </div>
        )}

      {/* Persistent IndexedDB AI Fitting History Popover (0ms / 0-credit reuse) */}
      {historyOpen && (
        <div
          className="studio-vton-history-popover"
          data-vton-history-popover="true"
          role="dialog"
          aria-label={isEn ? 'Saved AI Try-On history' : '이전 AI 피팅 보관함'}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="studio-vton-key-popover-head">
            <span className="studio-vton-key-popover-title">
              {isEn
                ? `Saved AI Fittings (${historyItems.length})`
                : `이전 AI 피팅 보관함 (${historyItems.length})`}
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
              ? 'Tap any previously generated look to view all 4 angles instantly with 0 AI credits.'
              : '생성했던 코디는 브라우저에 자동 보관되어 크레딧 소모 없이 0초 만에 불러옵니다.'}
          </p>

          {historyItems.length === 0 ? (
            <div className="studio-vton-history-empty">
              {isEn
                ? 'No saved AI fittings yet. Generated outfits will appear here automatically.'
                : '아직 보관된 AI 피팅이 없습니다. 코디를 AI 피팅으로 생성하면 이곳에 자동 저장됩니다.'}
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
                  item.angleSlices?.[viewAngleDeg] ||
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
                              ? 'Stylized'
                              : '시뮬레이션'
                            : isEn
                              ? 'Photo'
                              : '실사 모델'}
                        </span>
                        <span>·</span>
                        <span>
                          {isEn
                            ? `${item.availableAngles.length} angles`
                            : `${item.availableAngles.length}각도`}
                        </span>
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

      {/* Compact Inline Gemini API Key Popover for Browser / Standalone Environments */}
      {keyPopoverOpen && (
        <div
          className="studio-vton-key-popover"
          data-vton-key-popover="true"
          role="dialog"
          aria-label={isEn ? 'Gemini API key settings' : 'Gemini API 키 설정'}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="studio-vton-key-popover-head">
            <span className="studio-vton-key-popover-title">
              {isEn ? 'Gemini API Key (AI Try-On)' : 'Gemini API 키 설정 (AI 피팅)'}
            </span>
            <button
              type="button"
              data-vton-close-key-btn="true"
              className="studio-vton-key-close"
              aria-label={isEn ? 'Close API key settings' : 'API 키 설정 닫기'}
              onClick={(e) => {
                e.stopPropagation();
                setKeyPopoverOpen(false);
              }}
            >
              <X size={13} />
            </button>
          </div>
          <p className="studio-vton-key-popover-desc">
            {isEn
              ? 'Stored locally in your browser to power multi-angle Gemini VTON.'
              : '브라우저에 안전하게 저장되어 다각도 Gemini AI 피팅에 사용됩니다.'}
          </p>
          <div className="studio-vton-key-links">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              data-vton-aistudio-link="true"
              className="studio-vton-key-ext-link"
              aria-label={
                isEn
                  ? 'Get Gemini API key in Google AI Studio'
                  : 'Google AI Studio에서 Gemini API 키 발급받기'
              }
            >
              <span>{isEn ? 'Get API Key (AI Studio)' : 'API 키 발급 (AI Studio)'}</span>
              <ExternalLink size={11} />
            </a>
            <a
              href="https://aistudio.google.com/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="studio-vton-key-ext-link"
              aria-label={
                isEn
                  ? 'Open Google AI Studio Billing settings'
                  : 'Google AI Studio 결제 연결 확인'
              }
            >
              <span>{isEn ? 'Billing (Paid)' : '결제 연결 확인'}</span>
              <ExternalLink size={11} />
            </a>
          </div>
          <form className="studio-vton-key-form" onSubmit={handleSaveApiKeyAndRetry}>
            <input
              type="password"
              data-vton-key-input="true"
              className="studio-vton-key-input"
              value={draftApiKey}
              onChange={(e) => setDraftApiKey(e.target.value)}
              placeholder="AIzaSy..."
              autoComplete="off"
              aria-label={isEn ? 'Gemini API key' : 'Gemini API 키 입력'}
            />
            <div className="studio-vton-key-btn-row">
              <button
                type="button"
                className="studio-vton-key-clear-btn"
                onClick={handleClearApiKey}
              >
                {isEn ? 'Clear' : '초기화'}
              </button>
              <button
                type="submit"
                data-vton-save-key-btn="true"
                className="studio-vton-key-save-btn"
              >
                {isEn ? 'Save & Try-On' : '저장 후 AI 피팅'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Left Worn-Slot Chips Dock: Always visible whenever layers.length > 0 */}
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
            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                data-studio-slot={layer.slotKey}
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''}`}
                title={displayGarmentName}
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

      {/* Mode Switcher (AI Try-On Default First) + AI Style Toggle + 4-Direction Turnaround Angle Quick Rail */}
      <div
        className="studio-vton-mode-rail"
        role="toolbar"
        aria-label={
          isEn
            ? 'AI virtual try-on and lookbook board controls'
            : 'AI 가상 피팅 및 플랫레이 보드 제어'
        }
      >
        <div className="studio-vton-segmented-pill" role="group">
          <button
            type="button"
            data-viewer-stage-btn="ai-vton"
            aria-pressed={stageMode === 'ai-vton'}
            className={`studio-vton-seg-btn ${stageMode === 'ai-vton' ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectStageMode('ai-vton');
            }}
          >
            <Sparkles size={12} />
            <span>{isEn ? 'AI Try-On' : 'AI 피팅'}</span>
          </button>
          <button
            type="button"
            data-viewer-stage-btn="flatlay"
            aria-pressed={stageMode === 'flatlay'}
            className={`studio-vton-seg-btn ${stageMode === 'flatlay' ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectStageMode('flatlay');
            }}
          >
            <LayoutGrid size={12} />
            <span>{isEn ? 'Flat-Lay' : '플랫레이'}</span>
          </button>
        </div>

        <div
          className="studio-vton-segmented-pill"
          role="group"
          aria-label={isEn ? 'AI generation style' : 'AI 생성 화풍 선택'}
        >
          <button
            type="button"
            data-vton-style-toggle="photorealistic"
            aria-pressed={styleMode === 'photorealistic'}
            title={
              isEn
                ? 'Photorealistic Studio Model'
                : '스튜디오 실사 모델 (Photorealistic)'
            }
            className={`studio-vton-seg-btn ${styleMode === 'photorealistic' ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectStyleMode('photorealistic');
            }}
          >
            <span>{isEn ? 'Photo' : '실사 모델'}</span>
          </button>
          <button
            type="button"
            data-vton-style-toggle="stylized_isometric"
            aria-pressed={styleMode === 'stylized_isometric'}
            title={
              isEn
                ? 'Stylized Isometric Character'
                : '감성 시뮬레이션 캐릭터 (Stylized Isometric)'
            }
            className={`studio-vton-seg-btn ${styleMode === 'stylized_isometric' ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectStyleMode('stylized_isometric');
            }}
          >
            <span>{isEn ? 'Stylized' : '시뮬레이션'}</span>
          </button>
        </div>

        <div
          className="studio-vton-angle-pills"
          role="group"
          aria-label={isEn ? '4-direction turnaround angles' : '4방향 다각도 선택'}
        >
          {TURNAROUND_ANGLES.map((deg) => {
            const isSelected = viewAngleDeg === deg;
            const meta = TURNAROUND_ANGLE_LABELS[deg];
            return (
              <button
                key={deg}
                type="button"
                data-vton-angle-btn={deg}
                aria-pressed={isSelected}
                title={isEn ? meta.fullEn : meta.fullKo}
                className={`studio-vton-angle-pill tabular-nums ${isSelected ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewAngleChange(deg);
                }}
              >
                {deg}°
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Minimal Skin-Tone Swatch Dock */}
      <div
        className="studio-25d-tone-dock"
        aria-label={isEn ? 'Model skin tone' : '모델 피부톤 변경'}
      >
        <div className="studio-25d-tone-swatches">
          {QUICK_SKIN_PRESETS.map((preset) => {
            const active = activeSkinHex === preset.skinToneHex.toUpperCase();
            const labelText = isEn
              ? PRESET_LABEL_EN[preset.key] || preset.key
              : preset.shortKo;
            return (
              <button
                key={preset.key}
                type="button"
                data-quick-skin-preset={preset.key}
                title={labelText}
                aria-label={
                  isEn
                    ? `Apply ${labelText} skin tone`
                    : `${preset.shortKo} 마네킹 톤 적용`
                }
                className={`studio-tone-dot ${active ? 'is-active' : ''}`}
                style={{ backgroundColor: preset.skinToneHex }}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickSelectPreset?.(preset);
                }}
              />
            );
          })}
        </div>
        <button
          id={CARBON_DOM_CONTRACT.openSkinToneModalBtnId}
          type="button"
          className="studio-tone-analyze-btn"
          aria-label={isEn ? 'Open skin tone analysis' : '피부톤 분석 열기'}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSkinToneModal?.();
          }}
        >
          <Palette size={12} />
          <span>{isEn ? 'Tone' : '피부톤'}</span>
        </button>
        <button
          id="open-vton-api-key-btn"
          type="button"
          data-vton-hud-key-btn="true"
          aria-expanded={keyPopoverOpen}
          aria-label={isEn ? 'Configure Gemini API key' : 'Gemini API 키 설정'}
          title={isEn ? 'Gemini API Key Settings' : 'Gemini API 키 설정'}
          className={`studio-tone-analyze-btn studio-vton-key-dock-btn ${keyPopoverOpen ? 'is-active' : ''}`}
          onClick={handleToggleKeyPopover}
        >
          <KeyRound size={12} />
          <span>{isEn ? 'API Key' : '키 설정'}</span>
          {(hasSavedClientKey || Boolean(resolveClientGeminiApiKey())) && (
            <span className="studio-vton-key-saved-dot" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
});

export default Studio2DFittingViewer;
