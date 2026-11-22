import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudRain,
  CloudSun,
  Coffee,
  Download,
  Flame,
  History,
  Image as ImageIcon,
  Layers,
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
  patchAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  PROFILE_CONFIG_UPDATED_EVENT,
  fetchServerProfileConfig,
} from '../services/profileConfigService.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  TURNAROUND_ANGLES,
  VTON_STYLE_PREF_EVENT,
  angle360ToSignedScrollDeg,
  buildAiVtonCacheKey,
  computeOutfitComboId,
  deleteCachedAiVtonOutfit,
  fetchServerGeminiConfigured,
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
  resolveEffectiveVtonStyleMode,
  resolveSignedAngleScrollState,
  synthesizeProgressiveMultiAngleVton,
  trackFlatLayComboVisit,
} from '../services/vton2DService.ts';
import {
  ANGLE_SCROLL_TICKS,
  FIRST_LOOK_DELAY_MS,
  computeScrollbarLightingState,
  formatFirstLookCountdownSec,
  mapSignedTickToCanonicalSlice,
  shouldResumeIncompleteTurnaround,
} from '../services/vtonProgressiveState.ts';
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
import {
  stepTurnaroundInertia,
  wrapSignedAngleDeg,
} from '../utils/turnaroundPhysics.ts';
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
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {});
      }
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
  street: {
    ko: '스트릿',
    en: 'Street',
  },
  hiphop: {
    ko: '힙합',
    en: 'Hip-Hop',
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
  onOpenSkinToneModal: _legacyOpenSkinToneModal,
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
  const [angularVelocityDegPerSec, setAngularVelocityDegPerSec] = useState(0);
  const isScrubbingScrollRef = useRef(false);
  const isInertiaActiveRef = useRef(false);
  const angleScrollRef = useRef(angleScrollDeg);
  const lastScrollSampleRef = useRef({ deg: angleScrollDeg, ts: 0 });
  const inertiaRafRef = useRef(null);

  const viewAngleRef = useRef(viewAngleDeg);
  useEffect(() => {
    viewAngleRef.current = viewAngleDeg;
    if (!isScrubbingScrollRef.current && !isInertiaActiveRef.current) {
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
    if (inertiaRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    isInertiaActiveRef.current = false;
    setAngularVelocityDegPerSec(0);
  }, []);

  useEffect(() => clearSpinTimers, [clearSpinTimers]);

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
    ({ stepSign, fastFlick, velocityPxPerMs }) => {
      clearSpinTimers();
      isScrubbingScrollRef.current = false;
      const sign = stepSign >= 0 ? 1 : -1;
      const startAngle = viewAngleRef.current;
      flashSwipeAngleBadge();

      const reducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reducedMotion || typeof requestAnimationFrame !== 'function') {
        setScrollResidualYawDeg(0);
        setAngularVelocityDegPerSec(0);
        commitAngleDeg(fastFlick ? startAngle + 180 : startAngle + sign * 45);
        triggerHaptic('selection');
        return;
      }

      const safeSpeed = Number.isFinite(velocityPxPerMs) ? Math.abs(velocityPxPerMs) : 0.45;
      const startContinuous = angleScrollRef.current;
      const nextStepAngle360 = normalizeTurnaround360Angle(
        startAngle + sign * 45,
        DEFAULT_TURNAROUND_ANGLE
      );
      const currentMod360 = ((startContinuous % 360) + 360) % 360;
      const forwardDelta = ((nextStepAngle360 - currentMod360) * sign + 360) % 360;
      const signedStepDelta =
        forwardDelta === 0 ? 45 : forwardDelta > 180 ? forwardDelta - 360 : forwardDelta;

      let physicsState = fastFlick
        ? {
            angleDeg: startContinuous,
            velocityDegPerSec: Math.min(1080, Math.max(660, safeSpeed * 660)) * sign,
            targetDetentDeg: null,
          }
        : {
            angleDeg: startContinuous,
            velocityDegPerSec: Math.min(440, Math.max(240, safeSpeed * 420)) * sign,
            targetDetentDeg: startContinuous + sign * signedStepDelta,
          };

      // Immediately advance one 45° step on normal swipe so tap/swipe feedback feels zero-latency
      // and consecutive swipes never drop or flicker backward while the scrollbar glides to detent.
      if (!fastFlick) {
        commitAngleDeg(nextStepAngle360);
        triggerHaptic('selection');
      }

      isInertiaActiveRef.current = true;
      let lastCommitted360 = viewAngleRef.current;
      let lastTs = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const stepFrame = (nowTs) => {
        const dtSec = Math.min(0.05, Math.max(0.004, (nowTs - lastTs) / 1000));
        lastTs = nowTs;

        const next = stepTurnaroundInertia(physicsState, {
          dtSec,
          reducedMotion: false,
        });
        physicsState = {
          angleDeg: next.angleDeg,
          velocityDegPerSec: next.velocityDegPerSec,
          targetDetentDeg: next.targetDetentDeg,
        };

        const wrappedScroll = wrapSignedAngleDeg(next.angleDeg);
        angleScrollRef.current = wrappedScroll;
        setAngleScrollDeg(wrappedScroll);
        setScrollResidualYawDeg(next.residualYawDeg);
        setAngularVelocityDegPerSec(next.velocityDegPerSec);

        if (fastFlick && next.snappedAngle360 !== lastCommitted360) {
          lastCommitted360 = next.snappedAngle360;
          commitAngleDeg(next.snappedAngle360);
          triggerHaptic('selection');
        }

        if (next.settled) {
          inertiaRafRef.current = null;
          isInertiaActiveRef.current = false;
          setScrollResidualYawDeg(0);
          setAngularVelocityDegPerSec(0);
          return;
        }
        inertiaRafRef.current = requestAnimationFrame(stepFrame);
      };

      inertiaRafRef.current = requestAnimationFrame(stepFrame);
    },
    [clearSpinTimers, commitAngleDeg, flashSwipeAngleBadge]
  );

  const handleAngleScrollChange = useCallback(
    (e) => {
      clearSpinTimers();
      const rawVal = Number(e.target.value);
      const nextScroll = resolveSignedAngleScrollState(rawVal);
      const nowTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const prevSample = lastScrollSampleRef.current;
      const dtSec = prevSample.ts > 0 ? Math.max(0.008, (nowTs - prevSample.ts) / 1000) : 0.016;
      const instVel =
        prevSample.ts > 0 && nowTs - prevSample.ts < 140
          ? (nextScroll.clampedScrollDeg - prevSample.deg) / dtSec
          : 0;
      lastScrollSampleRef.current = { deg: nextScroll.clampedScrollDeg, ts: nowTs };

      isScrubbingScrollRef.current = true;
      angleScrollRef.current = nextScroll.clampedScrollDeg;
      setAngleScrollDeg(nextScroll.clampedScrollDeg);
      setScrollResidualYawDeg(nextScroll.residualYawDeg);
      setAngularVelocityDegPerSec(instVel);
      if (viewAngleRef.current !== nextScroll.angle360) {
        commitAngleDeg(nextScroll.angle360);
        triggerHaptic('selection');
      }
      flashSwipeAngleBadge();
    },
    [clearSpinTimers, commitAngleDeg, flashSwipeAngleBadge]
  );

  const handleAngleScrollRelease = useCallback(() => {
    isScrubbingScrollRef.current = false;
    setAngularVelocityDegPerSec(0);
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
      setAngularVelocityDegPerSec(0);
      commitAngleDeg(nextScroll.angle360);
      triggerHaptic('selection');
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
  const [progressiveBgAnglesLoading, setProgressiveBgAnglesLoading] = useState(false);
  const [firstLookCountdownActive, setFirstLookCountdownActive] = useState(false);
  const [firstLookRemainingMs, setFirstLookRemainingMs] = useState(FIRST_LOOK_DELAY_MS);
  const [justLitAngles, setJustLitAngles] = useState([]);
  const [statusToast, setStatusToast] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const firstLookDeadlineRef = useRef(0);
  const firstLookTimerRef = useRef(null);
  const firstLookPreGenActiveRef = useRef(false);
  const userCanceledPreGenRef = useRef(false);
  const justLitTimersRef = useRef([]);

  const clearFirstLookCountdown = useCallback(() => {
    if (firstLookTimerRef.current) {
      clearInterval(firstLookTimerRef.current);
      firstLookTimerRef.current = null;
    }
    firstLookDeadlineRef.current = 0;
    firstLookPreGenActiveRef.current = false;
    setFirstLookCountdownActive(false);
    setFirstLookRemainingMs(0);
  }, []);

  const startFirstLookCountdown = useCallback(
    (durationMs = FIRST_LOOK_DELAY_MS) => {
      if (firstLookTimerRef.current) {
        clearInterval(firstLookTimerRef.current);
        firstLookTimerRef.current = null;
      }
      const clampedMs = Math.max(1000, Number(durationMs) || FIRST_LOOK_DELAY_MS);
      let remainingMs = clampedMs;
      let lastTickAt = Date.now();
      firstLookDeadlineRef.current = lastTickAt + clampedMs;
      firstLookPreGenActiveRef.current = true;
      setFirstLookRemainingMs(clampedMs);
      setFirstLookCountdownActive(true);
      firstLookTimerRef.current = setInterval(() => {
        const now = Date.now();
        // Cap per-tick step so main-thread garment image encoding cannot skip the visible 5→4→3→2→1 countdown
        const elapsed = Math.min(250, Math.max(50, now - lastTickAt));
        lastTickAt = now;
        remainingMs = Math.max(0, remainingMs - elapsed);
        firstLookDeadlineRef.current = now + remainingMs;
        setFirstLookRemainingMs(remainingMs);
        if (remainingMs <= 0) {
          if (firstLookTimerRef.current) {
            clearInterval(firstLookTimerRef.current);
            firstLookTimerRef.current = null;
          }
          firstLookPreGenActiveRef.current = false;
          setFirstLookCountdownActive(false);
        }
      }, 100);
    },
    []
  );

  const flashJustLitAngle = useCallback((angleDeg) => {
    const normalized = Number(angleDeg);
    if (!Number.isFinite(normalized)) return;
    setJustLitAngles((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    const tid = setTimeout(() => {
      setJustLitAngles((prev) => prev.filter((a) => a !== normalized));
    }, 1500);
    justLitTimersRef.current.push(tid);
  }, []);

  useEffect(() => {
    return () => {
      if (firstLookTimerRef.current) {
        clearInterval(firstLookTimerRef.current);
        firstLookTimerRef.current = null;
      }
      for (const tid of justLitTimersRef.current) {
        clearTimeout(tid);
      }
      justLitTimersRef.current = [];
    };
  }, []);

  const [demoShowcaseEnabled, setDemoShowcaseEnabled] = useState(() =>
    isDemoVtonShowcaseActive()
  );
  const [hasServerConfiguredKey, setHasServerConfiguredKey] = useState(false);
  const hasServerConfiguredKeyRef = useRef(false);
  hasServerConfiguredKeyRef.current = hasServerConfiguredKey;

  // Smart Credit-Saver & Persistent History Gallery state
  const [autoGenEnabled, setAutoGenEnabled] = useState(() => readStoredAutoGenEnabled());
  const [stagedNeedsApply, setStagedNeedsApply] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lookMenuOpen, setLookMenuOpen] = useState(false);
  const [originalModalOpen, setOriginalModalOpen] = useState(false);
  const [originalModalZoomed, setOriginalModalZoomed] = useState(false);
  const [originalImgDims, setOriginalImgDims] = useState(null);
  const [pinnedHistoryItem, setPinnedHistoryItem] = useState(null);
  const [dayKey, setDayKey] = useState(() => getLocalDayKey());
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const syncClock = () => setClockNow(new Date());
    const id = setInterval(syncClock, 30000);
    return () => clearInterval(id);
  }, []);

  const zoom = 1;
  const pan = useMemo(() => ({ x: 0, y: 0 }), []);
  const [threeStageAvailable, setThreeStageAvailable] = useState(true);
  const [floorPlacement, setFloorPlacement] = useState(() => ({
    effectiveBaseScale: 1,
    soleTransformOrigin: '50% 95.5%',
    soleStageTopPct: 85.5,
    renderedContentW: null,
    renderedContentH: null,
    topRatio: null,
    bottomRatio: null,
  }));
  const handleFloorPlacementChange = useCallback((next) => {
    if (!next || typeof next !== 'object') return;
    setFloorPlacement((prev) => {
      if (
        prev.effectiveBaseScale === next.effectiveBaseScale &&
        prev.soleTransformOrigin === next.soleTransformOrigin &&
        prev.soleStageTopPct === next.soleStageTopPct &&
        prev.renderedContentW === next.renderedContentW &&
        prev.renderedContentH === next.renderedContentH &&
        prev.topRatio === next.topRatio &&
        prev.bottomRatio === next.bottomRatio
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const [activeHudTouchId, setActiveHudTouchId] = useState(null);
  const [isAngleInteracting, setIsAngleInteracting] = useState(false);

  const wornSlotsDockRef = useRef(null);
  const [wornDockOverflow, setWornDockOverflow] = useState({
    canScrollUp: false,
    canScrollDown: false,
  });

  const syncWornDockOverflow = useCallback(() => {
    const el = wornSlotsDockRef.current;
    if (!el) {
      setWornDockOverflow((prev) =>
        prev.canScrollUp || prev.canScrollDown
          ? { canScrollUp: false, canScrollDown: false }
          : prev
      );
      return;
    }
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const hasVerticalOverflow = maxScrollTop > 4;
    const nextUp = hasVerticalOverflow && el.scrollTop > 4;
    const nextDown = hasVerticalOverflow && el.scrollTop < maxScrollTop - 4;
    setWornDockOverflow((prev) =>
      prev.canScrollUp === nextUp && prev.canScrollDown === nextDown
        ? prev
        : { canScrollUp: nextUp, canScrollDown: nextDown }
    );
  }, []);

  const handleWornDockJumpTop = useCallback((e) => {
    e.stopPropagation();
    const el = wornSlotsDockRef.current;
    if (!el) return;
    triggerHaptic('selection');
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleWornDockJumpBottom = useCallback((e) => {
    e.stopPropagation();
    const el = wornSlotsDockRef.current;
    if (!el) return;
    triggerHaptic('selection');
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

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
      completedProgressiveKeysRef.current.clear();
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

  // Dismiss open `기록`, `Look 1/2` popover, or `원본 보기` lightbox cleanly on Escape key
  useEffect(() => {
    if (!historyOpen && !lookMenuOpen && !originalModalOpen) return undefined;
    const handleKeyDown = (ev) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      if (originalModalOpen) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
        setOriginalModalOpen(false);
        setOriginalModalZoomed(false);
        return;
      }
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
  }, [historyOpen, lookMenuOpen, originalModalOpen]);

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
  const completedProgressiveKeysRef = useRef(new Set());
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
        sheetImageUrl: meta?.sheetImageUrl ?? prev.sheetImageUrl ?? null,
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

  const cancelInitialBackgroundPreGenToStaged = useCallback(() => {
    if (!firstLookPreGenActiveRef.current) return false;
    abortControllerRef.current?.abort();
    clearFirstLookCountdown();
    userCanceledPreGenRef.current = true;
    hasInitialAutoRunRef.current = true;
    setAiLoading(false);
    setProgressiveBgAnglesLoading(false);
    setStagedNeedsApply(true);
    setStatusToast(null);
    setStageMode('ai-vton');
    return true;
  }, [clearFirstLookCountdown]);

  // Manual garment changes in the wardrobe unpin history, abort initial countdown pre-gen, and return to primary stage flow
  useEffect(() => {
    if (prevOutfitComboRef.current !== outfitComboId) {
      prevOutfitComboRef.current = outfitComboId;
      clearFrontOnlyFallbackState();
      if (restoringFromHistoryRef.current) {
        restoringFromHistoryRef.current = false;
      } else {
        setPinnedHistoryItem(null);
        setHistoryOverrideStyle(null);
        const isScenarioHydration =
          pendingScenarioSlotHydrationRef.current &&
          Date.now() <= pendingScenarioHydrationUntilRef.current;
        if (isScenarioHydration) {
          pendingScenarioSlotHydrationRef.current = false;
          pendingScenarioApproveRef.current = normalizedScenarioKey;
        } else if (firstLookPreGenActiveRef.current) {
          cancelInitialBackgroundPreGenToStaged();
        }
        if (!postLoginRevealActiveRef.current) {
          setStageMode('ai-vton');
        }
      }
    }
  }, [
    outfitComboId,
    normalizedScenarioKey,
    clearFrontOnlyFallbackState,
    cancelInitialBackgroundPreGenToStaged,
  ]);

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
      setProgressiveBgAnglesLoading(false);
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
      setProgressiveBgAnglesLoading(false);
      setStagedNeedsApply(false);
      return undefined;
    }

    const snap = latestInputsRef.current;
    const isForceBypass = Boolean(snap.forceRefresh || forceBypassCacheRef.current);
    if (isForceBypass) {
      delete scenarioVtonSnapshotsRef.current[scenarioVtonKey];
      completedProgressiveKeysRef.current.delete(scenarioVtonKey);
    }
    const isUserApproved = Boolean(
      isForceBypass ||
        userApprovedGenRef.current ||
        facePhotoJustApplied ||
        weatherTabJustChanged
    );

    const alreadyCompletedRun =
      !isForceBypass && completedProgressiveKeysRef.current.has(scenarioVtonKey);
    let resumingIncompleteCache = false;

    const scenarioEntry = !isForceBypass ? scenarioVtonSnapshotsRef.current[scenarioVtonKey] : null;
    const scenarioExactUrl =
      scenarioEntry?.angleSlices?.[snap.canonicalSliceAngle] ||
      scenarioEntry?.angleSlices?.[0] ||
      null;

    if (scenarioExactUrl) {
      const needsRemainingAngles = shouldResumeIncompleteTurnaround({
        cachedSlices: scenarioEntry?.angleSlices,
        frontOnlyDegraded: Boolean(scenarioEntry?.frontOnlyDegraded),
        alreadyExhaustedRun: alreadyCompletedRun,
        demoShowcaseEnabled,
      });
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
      pendingScenarioApproveRef.current = null;
      hasInitialAutoRunRef.current = true;
      clearFirstLookCountdown();
      setStagedNeedsApply(false);
      setProgressiveBgAnglesLoading(needsRemainingAngles);
      if (scenarioEntry?.frontOnlyDegraded) {
        setFrontOnlyDegraded(true);
        if (scenarioEntry.notificationPopup) {
          setFrontOnlyPopupInfo(scenarioEntry.notificationPopup);
        }
      } else {
        clearFrontOnlyFallbackState();
      }
      setAiState({
        cacheKey: `${buildAiVtonCacheKey({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          effectiveWeather: snap.effectiveWeather,
          angleDeg: scenarioEntry?.angleSlices?.[snap.canonicalSliceAngle]
            ? snap.canonicalSliceAngle
            : 0,
        })}|sc:${snap.normalizedScenarioKey}|${snap.isStageOutdoor ? 'outdoor' : 'indoor'}`,
        imageUrl: scenarioExactUrl,
        fromCache: true,
        provider: 'gemini-vton',
      });
      setStatusToast(null);
      setAiLoading(false);
      if (!needsRemainingAngles) {
        return undefined;
      }
      resumingIncompleteCache = true;
    }

    const syncHit =
      !isForceBypass && !resumingIncompleteCache
        ? peekMemoryAiVtonSlice({
            avatarConfigHash: snap.resolvedAvatarHash,
            outfitComboId,
            styleMode: snap.styleMode,
            effectiveWeather: snap.effectiveWeather,
            angleDeg: snap.canonicalSliceAngle,
          }) ||
          peekMemoryAiVtonSlice({
            avatarConfigHash: snap.resolvedAvatarHash,
            outfitComboId,
            styleMode: snap.styleMode,
            effectiveWeather: snap.effectiveWeather,
            angleDeg: 0,
          })
        : null;

    if (syncHit) {
      const siblingMap = {};
      let foundSheetUrl = syncHit.sheetImageUrl || null;
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
        if (mem?.sheetImageUrl && (deg === 0 || !foundSheetUrl)) {
          foundSheetUrl = mem.sheetImageUrl;
        }
      }
      const needsRemainingAngles = shouldResumeIncompleteTurnaround({
        cachedSlices: siblingMap,
        alreadyExhaustedRun: alreadyCompletedRun,
        demoShowcaseEnabled,
      });
      recordScenarioVtonSnapshot(
        scenarioVtonKey,
        siblingMap[snap.canonicalSliceAngle] ? snap.canonicalSliceAngle : 0,
        syncHit.imageUrl,
        siblingMap,
        foundSheetUrl ? { sheetImageUrl: foundSheetUrl } : null
      );
      forceBypassCacheRef.current = false;
      userApprovedGenRef.current = false;
      pendingFacePhotoApproveRef.current = null;
      pendingWeatherApproveRef.current = null;
      pendingScenarioApproveRef.current = null;
      hasInitialAutoRunRef.current = true;
      clearFirstLookCountdown();
      setStagedNeedsApply(false);
      setProgressiveBgAnglesLoading(needsRemainingAngles);
      clearFrontOnlyFallbackState();
      setAiState({
        cacheKey: `${buildAiVtonCacheKey({
          avatarConfigHash: snap.resolvedAvatarHash,
          outfitComboId,
          styleMode: snap.styleMode,
          effectiveWeather: snap.effectiveWeather,
          angleDeg: siblingMap[snap.canonicalSliceAngle] ? snap.canonicalSliceAngle : 0,
        })}|sc:${snap.normalizedScenarioKey}|${snap.isStageOutdoor ? 'outdoor' : 'indoor'}`,
        imageUrl: syncHit.imageUrl,
        fromCache: true,
        provider: 'gemini-vton',
      });
      setStatusToast(null);
      setAiLoading(false);
      if (!needsRemainingAngles) {
        return undefined;
      }
      resumingIncompleteCache = true;
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
        clearFirstLookCountdown();
        setStagedNeedsApply(false);
        setProgressiveBgAnglesLoading(false);
        clearFrontOnlyFallbackState();
        setAiState({
          cacheKey: `${buildAiVtonCacheKey({
            avatarConfigHash: snap.resolvedAvatarHash,
            outfitComboId,
            styleMode: snap.styleMode,
            effectiveWeather: snap.effectiveWeather,
            angleDeg: snap.canonicalSliceAngle,
          })}|sc:${snap.normalizedScenarioKey}|${snap.isStageOutdoor ? 'outdoor' : 'indoor'}`,
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
      if (!isForceBypass && !resumingIncompleteCache) {
        const idbHit =
          (await readCachedAiVtonSlice({
            avatarConfigHash: snap.resolvedAvatarHash,
            outfitComboId,
            styleMode: snap.styleMode,
            effectiveWeather: snap.effectiveWeather,
            angleDeg: snap.canonicalSliceAngle,
          })) ||
          (await readCachedAiVtonSlice({
            avatarConfigHash: snap.resolvedAvatarHash,
            outfitComboId,
            styleMode: snap.styleMode,
            effectiveWeather: snap.effectiveWeather,
            angleDeg: 0,
          }));
        if (controller.signal.aborted) return;

        if (idbHit) {
          const hitAngle = idbHit.slice.angleDeg ?? 0;
          const siblingAngles = TURNAROUND_ANGLES.filter((deg) => deg !== hitAngle);
          const siblingHits = await Promise.all(
            siblingAngles.map((deg) =>
              readCachedAiVtonSlice({
                avatarConfigHash: snap.resolvedAvatarHash,
                outfitComboId,
                styleMode: snap.styleMode,
                effectiveWeather: snap.effectiveWeather,
                angleDeg: deg,
              })
            )
          );
          if (controller.signal.aborted) return;

          const siblingMap = {
            [hitAngle]: idbHit.slice.imageUrl,
          };
          let foundSheetUrl = idbHit.slice.sheetImageUrl || null;
          siblingHits.forEach((h, idx) => {
            if (h?.slice?.imageUrl) {
              siblingMap[siblingAngles[idx]] = h.slice.imageUrl;
            }
            if (h?.slice?.sheetImageUrl && (siblingAngles[idx] === 0 || !foundSheetUrl)) {
              foundSheetUrl = h.slice.sheetImageUrl;
            }
          });
          const existingSnap = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
          recordScenarioVtonSnapshot(
            scenarioVtonKey,
            hitAngle,
            idbHit.slice.imageUrl,
            siblingMap,
            {
              ...(existingSnap?.frontOnlyDegraded
                ? {
                    frontOnlyDegraded: true,
                    notificationPopup: existingSnap.notificationPopup || null,
                  }
                : {}),
              ...(foundSheetUrl ? { sheetImageUrl: foundSheetUrl } : {}),
            }
          );
          preloadImageUrls(Object.values(siblingMap));

          const needsRemainingAngles = shouldResumeIncompleteTurnaround({
            cachedSlices: siblingMap,
            frontOnlyDegraded: Boolean(existingSnap?.frontOnlyDegraded),
            alreadyExhaustedRun: alreadyCompletedRun,
            demoShowcaseEnabled,
          });

          forceBypassCacheRef.current = false;
          userApprovedGenRef.current = false;
          pendingFacePhotoApproveRef.current = null;
          pendingWeatherApproveRef.current = null;
          pendingScenarioApproveRef.current = null;
          hasInitialAutoRunRef.current = true;
          clearFirstLookCountdown();
          setStagedNeedsApply(false);
          setProgressiveBgAnglesLoading(needsRemainingAngles);
          clearFrontOnlyFallbackState();
          setAiState({
            cacheKey: `${buildAiVtonCacheKey({
              avatarConfigHash: snap.resolvedAvatarHash,
              outfitComboId,
              styleMode: snap.styleMode,
              effectiveWeather: snap.effectiveWeather,
              angleDeg: hitAngle,
            })}|sc:${snap.normalizedScenarioKey}|${snap.isStageOutdoor ? 'outdoor' : 'indoor'}`,
            imageUrl: idbHit.slice.imageUrl,
            fromCache: true,
            provider: 'gemini-vton',
          });
          setStatusToast(null);
          setAiLoading(false);
          if (!needsRemainingAngles) {
            return;
          }
          resumingIncompleteCache = true;
        }
      }

      const hasSiblingComboSlice = TURNAROUND_ANGLES.some(
        (deg) =>
          Boolean(
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
          )
      );

      if (
        !resumingIncompleteCache &&
        !isUserApproved &&
        !isDirectDemoClick &&
        !hasSiblingComboSlice &&
        ((hasInitialAutoRunRef.current && !firstLookPreGenActiveRef.current) ||
          userCanceledPreGenRef.current) &&
        !autoGenEnabled &&
        !demoShowcaseEnabled
      ) {
        clearFirstLookCountdown();
        setAiLoading(false);
        setProgressiveBgAnglesLoading(false);
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
        clearFirstLookCountdown();
        setAiLoading(false);
        setProgressiveBgAnglesLoading(false);
        return;
      }

      const isExplicitUserTrigger = Boolean(
        isForceBypass || userApprovedGenRef.current || facePhotoJustApplied
      );
      const isInitialRecommendedPreGen = Boolean(
        (!hasInitialAutoRunRef.current || firstLookPreGenActiveRef.current) &&
          !userCanceledPreGenRef.current &&
          !isExplicitUserTrigger &&
          !isDirectDemoClick &&
          !demoShowcaseEnabled &&
          !autoGenEnabled &&
          !postLoginRevealActiveRef.current
      );

      const delayMs =
        isInitialRecommendedPreGen ||
        isDirectDemoClick ||
        isForceBypass ||
        demoShowcaseEnabled
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
            clearFirstLookCountdown();
            setAiLoading(false);
            setProgressiveBgAnglesLoading(false);
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
                cacheKey: `${buildAiVtonCacheKey({
                  avatarConfigHash: liveSnap.resolvedAvatarHash,
                  outfitComboId,
                  styleMode: liveSnap.styleMode,
                  effectiveWeather: liveSnap.effectiveWeather,
                  angleDeg: liveSnap.canonicalSliceAngle,
                })}|sc:${liveSnap.normalizedScenarioKey}|${liveSnap.isStageOutdoor ? 'outdoor' : 'indoor'}`,
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
            clearFirstLookCountdown();
            setAiLoading(false);
            setProgressiveBgAnglesLoading(false);
          });
      };

      if (resumingIncompleteCache) {
        clearFirstLookCountdown();
        setAiLoading(false);
        setProgressiveBgAnglesLoading(true);
      } else {
        if (isInitialRecommendedPreGen) {
          if (!firstLookPreGenActiveRef.current) {
            startFirstLookCountdown(FIRST_LOOK_DELAY_MS);
          }
        } else if (isExplicitUserTrigger || !firstLookPreGenActiveRef.current) {
          clearFirstLookCountdown();
        }
        setAiLoading(true);
        setProgressiveBgAnglesLoading(false);
      }

      if (isInitialRecommendedPreGen) {
        // Yield briefly so the Flat-Lay + reverse-countdown banner commits & paints before garment rasterization
        await new Promise((resolve) => {
          delayTimerId = setTimeout(resolve, 48);
        });
        if (controller.signal.aborted) return;
      }

      if (demoShowcaseEnabled && (isDirectDemoClick || !hasServerConfiguredKeyRef.current)) {
        applyShowcaseDemoSlices();
        return;
      }

      const zeroCacheKeyForCombo = `${buildAiVtonCacheKey({
        avatarConfigHash: liveSnap.resolvedAvatarHash,
        outfitComboId,
        styleMode: liveSnap.styleMode,
        effectiveWeather: liveSnap.effectiveWeather,
        angleDeg: 0,
      })}|sc:${liveSnap.normalizedScenarioKey}|${liveSnap.isStageOutdoor ? 'outdoor' : 'indoor'}`;

      try {
        const outcome = await synthesizeProgressiveMultiAngleVton(
          {
            slots: liveSnap.slots,
            skinProfile: liveSnap.skinProfile,
            bodySpec: liveSnap.bodySpec,
            user: liveSnap.user,
            avatarSpec: liveSnap.resolvedAvatarSpec,
            avatarConfigHash: liveSnap.resolvedAvatarHash,
            viewAngleDeg: 0,
            styleMode: liveSnap.styleMode,
            weather: liveSnap.weather,
            turnaroundSheet: true,
            turnaroundLayout: 'turnaround_4x2',
            theme: liveSnap.resolvedTheme,
            legacyMode: liveSnap.rawLegacyMode,
            forceRefresh: isForceBypass,
            signal: controller.signal,
          },
          {
            onAngleReady: (payload) => {
              if (controller.signal.aborted) return;
              preloadImageUrls([payload.imageUrl]);
              recordScenarioVtonSnapshot(
                liveSnap.scenarioVtonKey,
                payload.angleDeg,
                payload.imageUrl,
                payload.allSlices || null,
                {
                  frontOnlyDegraded: false,
                  notificationPopup: null,
                  sheetImageUrl: payload.sheetImageUrl || null,
                }
              );
              flashJustLitAngle(payload.angleDeg);
              const stillStreaming = payload.readyAngles.length < TURNAROUND_ANGLES.length;
              setProgressiveBgAnglesLoading(stillStreaming);

              if (payload.isMasterAnchor) {
                setAiLoading(false);
                configBlockedRef.current = false;
                setStagedNeedsApply(false);
                clearFrontOnlyFallbackState();
                setAiState({
                  cacheKey: zeroCacheKeyForCombo,
                  imageUrl: payload.imageUrl,
                  fromCache: payload.fromCache,
                  provider: 'gemini-vton',
                });
                setStatusToast(null);
                refreshHistoryList();
                liveSnap.onAiLookGenerated?.({
                  imageUrl: payload.imageUrl,
                  styleMode: liveSnap.styleMode,
                  fromCache: Boolean(payload.fromCache),
                  slots: liveSnap.slots,
                });
              }
            },
          }
        );
        if (controller.signal.aborted) return;
        forceBypassCacheRef.current = false;
        userApprovedGenRef.current = false;
        pendingFacePhotoApproveRef.current = null;
        pendingWeatherApproveRef.current = null;
        pendingScenarioApproveRef.current = null;
        setProgressiveBgAnglesLoading(false);

        if (outcome.ok && outcome.imageUrl) {
          completedProgressiveKeysRef.current.add(liveSnap.scenarioVtonKey);
          if (outcome.angleSlices) {
            preloadImageUrls(Object.values(outcome.angleSlices));
          }
          const isFrontOnly = Boolean(outcome.frontOnlyDegraded);
          recordScenarioVtonSnapshot(
            liveSnap.scenarioVtonKey,
            0,
            outcome.imageUrl,
            outcome.angleSlices || null,
            {
              frontOnlyDegraded: isFrontOnly,
              notificationPopup: isFrontOnly ? outcome.notificationPopup || null : null,
              sheetImageUrl: outcome.sheetImageUrl || null,
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
            cacheKey: zeroCacheKeyForCombo,
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

        clearFirstLookCountdown();
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
        clearFirstLookCountdown();
        setProgressiveBgAnglesLoading(false);
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
    isStageOutdoor,
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
    clearFirstLookCountdown,
    startFirstLookCountdown,
    flashJustLitAngle,
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
      clearFirstLookCountdown();
      userCanceledPreGenRef.current = false;
      clearFrontOnlyFallbackState();
      setPinnedHistoryItem(null);
      setStagedNeedsApply(false);
      setStatusToast(null);
      userApprovedGenRef.current = true;
      forceBypassCacheRef.current = false;
      setStageMode('ai-vton');
      setRetryNonce((n) => n + 1);
    },
    [equippedCount, clearFirstLookCountdown, clearFrontOnlyFallbackState, showToast]
  );

  const handleRetryAiSynthesis = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (equippedCount === 0) {
        showToast('empty_outfit');
        return;
      }
      delete scenarioVtonSnapshotsRef.current[scenarioVtonKey];
      completedProgressiveKeysRef.current.delete(scenarioVtonKey);
      configBlockedRef.current = false;
      clearFirstLookCountdown();
      userCanceledPreGenRef.current = false;
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
    [
      equippedCount,
      scenarioVtonKey,
      clearFirstLookCountdown,
      clearFrontOnlyFallbackState,
      showToast,
    ]
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
    if (canonicalSliceAngle !== 0) {
      const snapEntry = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
      const hasCurrentSlice = Boolean(
        snapEntry?.angleSlices?.[canonicalSliceAngle] ||
          peekMemoryAiVtonSlice({
            avatarConfigHash: resolvedAvatarHash,
            outfitComboId,
            styleMode,
            effectiveWeather: vtonEffectiveWeather,
            angleDeg: canonicalSliceAngle,
          })?.imageUrl
      );
      if (!hasCurrentSlice) {
        commitAngleDeg(0);
      }
    }
  }, [
    canonicalSliceAngle,
    scenarioVtonKey,
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    vtonEffectiveWeather,
    commitAngleDeg,
  ]);

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
    fallbackSameComboMemorySlice?.imageUrl ||
    null;

  const isHoldingForFirstLookCountdown = Boolean(
    firstLookCountdownActive && firstLookRemainingMs > 0
  );
  const resolvedAiImageUrl =
    stageMode === 'ai-vton' && !isHoldingForFirstLookCountdown
      ? availableAiImageUrl
      : null;

  const resolvedOriginalSheetUrl = useMemo(() => {
    void scenarioSnapEpoch;
    void historyCount;
    if (isShowingPinnedHistory && pinnedHistoryItem) {
      return pinnedHistoryItem.sheetImageUrl || null;
    }
    const snapEntry = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
    if (snapEntry?.sheetImageUrl) {
      return snapEntry.sheetImageUrl;
    }
    if (!forceRefresh) {
      const zeroMem = peekMemoryAiVtonSlice({
        avatarConfigHash: resolvedAvatarHash,
        outfitComboId,
        styleMode,
        effectiveWeather: vtonEffectiveWeather,
        angleDeg: 0,
      });
      if (zeroMem?.sheetImageUrl) return zeroMem.sheetImageUrl;
      if (memorySlice?.sheetImageUrl) return memorySlice.sheetImageUrl;
      const matchingHistory = historyItems.find(
        (it) =>
          it.outfitComboId === outfitComboId &&
          it.avatarConfigHash === resolvedAvatarHash &&
          it.styleMode === styleMode &&
          (!it.effectiveWeather || it.effectiveWeather === vtonEffectiveWeather) &&
          Boolean(it.sheetImageUrl)
      );
      if (matchingHistory?.sheetImageUrl) return matchingHistory.sheetImageUrl;
    }
    return null;
  }, [
    scenarioSnapEpoch,
    historyCount,
    isShowingPinnedHistory,
    pinnedHistoryItem,
    scenarioVtonKey,
    forceRefresh,
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    vtonEffectiveWeather,
    memorySlice,
    historyItems,
  ]);

  const originalModalImageUrl = resolvedOriginalSheetUrl || resolvedAiImageUrl || null;
  const hasRawOriginalSheet = Boolean(resolvedOriginalSheetUrl);
  const canReturnToCharacter =
    !resolvedAiImageUrl &&
    Boolean(availableAiImageUrl) &&
    !isHoldingForFirstLookCountdown;
  const showOriginalImageLink = Boolean(
    resolvedAiImageUrl && stageMode === 'ai-vton' && !canReturnToCharacter && !postLoginRevealActive
  );
  const effectiveOriginalModalOpen = Boolean(originalModalOpen && originalModalImageUrl);

  const handleOpenOriginalImage = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic('selection');
    setHistoryOpen(false);
    setLookMenuOpen(false);
    setOriginalModalZoomed(false);
    setOriginalModalOpen(true);
  }, []);

  const handleCloseOriginalModal = useCallback((e) => {
    e?.stopPropagation?.();
    setOriginalModalOpen(false);
    setOriginalModalZoomed(false);
  }, []);

  const handleDownloadOriginalImage = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!originalModalImageUrl || typeof document === 'undefined') return;
      try {
        const resp = await fetch(originalModalImageUrl);
        const blob = await resp.blob();
        const ext = blob.type.includes('webp')
          ? 'webp'
          : blob.type.includes('jpeg') || blob.type.includes('jpg')
            ? 'jpg'
            : 'png';
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `invtry-nanobanana-original-${Date.now()}.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      } catch {
        // Ignore download failure on restricted environments
      }
    },
    [originalModalImageUrl]
  );

  const showStageBgPickerBtn = Boolean(stageMode !== 'flatlay' && !canReturnToCharacter);

  const readyCanonicalAngles = useMemo(() => {
    void scenarioSnapEpoch;
    void historyCount;
    const set = new Set();
    if (isShowingPinnedHistory && pinnedHistoryItem?.angleSlices) {
      for (const deg of TURNAROUND_ANGLES) {
        if (pinnedHistoryItem.angleSlices[deg]) set.add(deg);
      }
      return Array.from(set);
    }
    if (demoShowcaseEnabled && demoSliceUrl) {
      return [...TURNAROUND_ANGLES];
    }
    const snapEntry = scenarioVtonSnapshotsRef.current[scenarioVtonKey];
    if (snapEntry?.angleSlices) {
      for (const deg of TURNAROUND_ANGLES) {
        if (snapEntry.angleSlices[deg]) set.add(deg);
      }
    }
    if (!forceRefresh) {
      for (const deg of TURNAROUND_ANGLES) {
        if (
          !set.has(deg) &&
          peekMemoryAiVtonSlice({
            avatarConfigHash: resolvedAvatarHash,
            outfitComboId,
            styleMode,
            effectiveWeather: vtonEffectiveWeather,
            angleDeg: deg,
          })?.imageUrl
        ) {
          set.add(deg);
        }
      }
    }
    return Array.from(set);
  }, [
    scenarioSnapEpoch,
    historyCount,
    isShowingPinnedHistory,
    pinnedHistoryItem,
    demoShowcaseEnabled,
    demoSliceUrl,
    scenarioVtonKey,
    forceRefresh,
    resolvedAvatarHash,
    outfitComboId,
    styleMode,
    vtonEffectiveWeather,
  ]);

  const scrollbarLighting = useMemo(
    () => computeScrollbarLightingState(readyCanonicalAngles),
    [readyCanonicalAngles]
  );

  const handleSelectFlatLaySlot = useCallback(
    (slotKey) => {
      if (firstLookPreGenActiveRef.current) {
        cancelInitialBackgroundPreGenToStaged();
      }
      onSelectSlot?.(slotKey);
    },
    [cancelInitialBackgroundPreGenToStaged, onSelectSlot]
  );

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
    if (
      scenarioKey === 'live' &&
      weather?.dayTarget !== 'tomorrow' &&
      typeof weather?.currentTemp === 'number' &&
      Number.isFinite(weather.currentTemp)
    ) {
      return Math.round(weather.currentTemp);
    }
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

  const hasConfiguredGeminiKey = hasServerConfiguredKey;
  void hasConfiguredGeminiKey;

  const showAngleDock =
    !frontOnlyDegraded &&
    shouldShowStudioAngleDock({
      stageMode,
      hasAiImage: Boolean(resolvedAiImageUrl),
      aiLoading: Boolean(aiLoading || isHoldingForFirstLookCountdown),
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
    el.style.setProperty(
      '--stage-char-ambient-brightness',
      stageLightingFrame.characterAmbientBrightness.toFixed(3)
    );
  }, [stageLightingFrame.characterRimDropShadow, stageLightingFrame.characterAmbientBrightness]);

  useEffect(() => {
    const el = wornSlotsDockRef.current;
    if (!el || equippedCount === 0) {
      setWornDockOverflow((prev) =>
        prev.canScrollUp || prev.canScrollDown
          ? { canScrollUp: false, canScrollDown: false }
          : prev
      );
      return undefined;
    }
    syncWornDockOverflow();
    const rafId =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(syncWornDockOverflow)
        : null;
    el.addEventListener('scroll', syncWornDockOverflow, { passive: true });
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(syncWornDockOverflow);
      ro.observe(el);
    }
    window.addEventListener('resize', syncWornDockOverflow);
    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      el.removeEventListener('scroll', syncWornDockOverflow);
      ro?.disconnect();
      window.removeEventListener('resize', syncWornDockOverflow);
    };
  }, [equippedCount, showAngleDock, stageMode, syncWornDockOverflow]);

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
      data-has-top-banner={
        isHoldingForFirstLookCountdown ||
        aiLoading ||
        hasStagedBarVisible ||
        hasPinnedBannerVisible
          ? 'true'
          : 'false'
      }
      data-first-look-countdown={isHoldingForFirstLookCountdown ? 'true' : 'false'}
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
      data-vton-loading={
        (aiLoading || isHoldingForFirstLookCountdown) && !postLoginRevealActive
          ? 'true'
          : 'false'
      }
      data-vton-bg-angles-loading={progressiveBgAnglesLoading ? 'true' : 'false'}
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
        heightCm={
          bodySpec?.heightCm ??
          resolvedAvatarSpec?.body?.heightCm ??
          user?.heightCm ??
          172
        }
      />

      {/* Layer 1A (z-10): Feathered Cyclorama Floor Deck + Wet Mirror Reflection (Contact AO delegated to Three.js) */}
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
        suppressContactShadow={threeStageAvailable}
      />

      {/* Layer 1B (z-12): Hybrid Three.js Spatial Lighting, Single GLSL Silhouette Cast Shadow + Contact AO & Volumetric Weather */}
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
          modelImageUrl={resolvedAiImageUrl}
          soleStageTopPct={floorPlacement.soleStageTopPct}
          topRatio={floorPlacement.topRatio}
          bottomRatio={floorPlacement.bottomRatio}
          heightCm={
            bodySpec?.heightCm ??
            resolvedAvatarSpec?.body?.heightCm ??
            user?.heightCm ??
            172
          }
          mirrorX={angleSpec.mirrorX || pinnedHistoryForceMirrorX}
          onWebGlAvailabilityChange={setThreeStageAvailable}
        />
      )}

      {/* Top Status Pill:
          1) Initial recommended flat-lay First-Look reverse countdown (auto pre-gen notice; touch any garment to cancel)
          2) Active 0° front synthesis status
          3) Subtle progressive side/back readiness indicator once 0° front is revealed */}
      {isHoldingForFirstLookCountdown && !postLoginRevealActive ? (
        <>
          <div aria-hidden="true" className="studio-vton-progress-track">
            <div
              className="studio-vton-progress-fill is-countdown"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (firstLookRemainingMs / FIRST_LOOK_DELAY_MS) * 100)
                )}%`,
              }}
            />
          </div>
          <div
            className="studio-vton-step-status is-first-look-countdown tabular-nums"
            data-vton-first-look-pill="true"
            data-first-look-remaining-ms={firstLookRemainingMs}
            role="status"
            aria-live="polite"
          >
            <span className="studio-vton-step-label">
              {isEn
                ? "We'll generate this look unless you change items"
                : '옷을 변경하지 않으면 이 코디로 모델을 생성해 드려요'}
            </span>
            <span
              className="studio-vton-countdown-badge tabular-nums"
              data-first-look-countdown-sec="true"
            >
              {formatFirstLookCountdownSec(firstLookRemainingMs, resolvedLang)}
            </span>
          </div>
        </>
      ) : aiLoading && !postLoginRevealActive ? (
        <>
          <div aria-hidden="true" className="studio-vton-progress-track">
            <div className="studio-vton-progress-fill is-indeterminate" />
          </div>
          <div
            className="studio-vton-step-status tabular-nums"
            data-vton-loading-steps="true"
            role="status"
            aria-live="polite"
          >
            <span className="studio-vton-step-badge">0°</span>
            <span className="studio-vton-step-label">
              {isEn ? 'Rendering front model...' : '정면 모델을 준비하고 있어요'}
            </span>
          </div>
        </>
      ) : null}

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
        onSelectSlot={handleSelectFlatLaySlot}
        stageMode={stageMode}
        styleMode={styleMode}
        aiImageUrl={resolvedAiImageUrl}
        aiLoading={(aiLoading || isHoldingForFirstLookCountdown) && !postLoginRevealActive}
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
        zoom={1}
        pan={pan}
        onFloorPlacementChange={handleFloorPlacementChange}
        threeStageAvailable={threeStageAvailable}
        stageLightingFrame={stageLightingFrame}
        auraTier={auraTier}
        angularVelocityDegPerSec={angularVelocityDegPerSec}
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
                onClick={handleRetryAiSynthesis}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>{isEn ? 'Try again' : '다시 입혀보기'}</span>
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

      {/* Right Vertically Scrollable Worn-Slot Chips Dock with Responsive Top/Bottom Jump Arrows */}
      {equippedCount > 0 && (
        <div
          className="studio-worn-slots-dock-shell"
          data-worn-slots-shell="true"
          data-can-scroll-up={wornDockOverflow.canScrollUp ? 'true' : 'false'}
          data-can-scroll-down={wornDockOverflow.canScrollDown ? 'true' : 'false'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {wornDockOverflow.canScrollUp && (
            <button
              type="button"
              className="studio-worn-dock-jump-btn is-up"
              data-worn-dock-jump="top"
              aria-label={isEn ? 'Scroll equipped items to top' : '착용 아이템 맨 위로 이동'}
              title={isEn ? 'Scroll to top' : '맨 위로 이동'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleWornDockJumpTop}
            >
              <ChevronUp size={13} strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
          <div
            ref={wornSlotsDockRef}
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
          {wornDockOverflow.canScrollDown && (
            <button
              type="button"
              className="studio-worn-dock-jump-btn is-down"
              data-worn-dock-jump="bottom"
              aria-label={isEn ? 'Scroll equipped items to bottom' : '착용 아이템 맨 아래로 이동'}
              title={isEn ? 'Scroll to bottom' : '맨 아래로 이동'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleWornDockJumpBottom}
            >
              <ChevronDown size={13} strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Bottom-Left HUD Stack: [Original Image Link] above [Single Look 1/2 Selector Button] above [Saved AI Fitting History Button] */}
      <div
        className="studio-bottom-left-hud-stack"
        data-bottom-left-hud="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {showOriginalImageLink && (
          <a
            href="#vton-original-image"
            role="button"
            data-vton-original-link="true"
            data-has-raw-sheet={hasRawOriginalSheet ? 'true' : 'false'}
            aria-haspopup="dialog"
            aria-expanded={effectiveOriginalModalOpen}
            aria-label={
              isEn
                ? 'View Nano Banana original generated image'
                : '나노바나나 생성 원본 이미지 보기'
            }
            title={
              hasRawOriginalSheet
                ? isEn
                  ? 'View raw Nano Banana 8-angle turnaround sheet'
                  : '나노바나나 8각도 원본 시트 보기'
                : isEn
                  ? 'View loaded character source image'
                  : '불러온 캐릭터 원본 보기'
            }
            className={`studio-vton-original-link ${
              activeHudTouchId === 'original-link' ? 'is-interacting' : ''
            }`.trim()}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleHudTouchStart('original-link');
            }}
            onPointerUp={handleHudTouchEnd}
            onPointerCancel={handleHudTouchEnd}
            onPointerLeave={handleHudTouchEnd}
            onClick={handleOpenOriginalImage}
          >
            <ImageIcon size={13} strokeWidth={2.1} aria-hidden="true" />
            <span>{isEn ? 'Original' : '원본 보기'}</span>
          </a>
        )}
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
                    : activeStyleKey === 'street'
                      ? Zap
                      : activeStyleKey === 'hiphop'
                        ? Flame
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
                              : styleKey === 'street'
                                ? Zap
                                : styleKey === 'hiphop'
                                  ? Flame
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

      {/* Bottom Sleek Architectural Angle Slider (-180° Back .. 0° Front .. +180° Back) with Progressive Readiness Lighting */}
      <div
        className={`studio-angle-scroll-dock is-sleek-dial ${!showAngleDock ? 'is-hidden' : ''} ${
          isAngleInteracting ? 'is-interacting' : ''
        } ${scrollbarLighting.frontReady ? 'has-front-ready' : ''} ${
          scrollbarLighting.allReady ? 'is-all-ready' : ''
        }`.trim()}
        data-angle-scroll-dock="true"
        data-angle-dock-visible={showAngleDock ? 'true' : 'false'}
        data-ready-angles={readyCanonicalAngles.join(',')}
        data-front-ready={scrollbarLighting.frontReady ? 'true' : 'false'}
        data-back-ready={scrollbarLighting.backReady ? 'true' : 'false'}
        aria-hidden={!showAngleDock ? 'true' : undefined}
        inert={!showAngleDock}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="studio-angle-scroll-labels">
          <button
            type="button"
            data-angle-end-btn="left-back"
            data-angle-ready={scrollbarLighting.backReady ? 'true' : 'false'}
            className={`studio-angle-end-label ${angleScrollDeg <= -158 ? 'is-active' : ''} ${
              scrollbarLighting.backReady ? 'is-ready-lit' : ''
            } ${justLitAngles.includes(180) ? 'is-just-lit' : ''}`.trim()}
            onPointerDown={() => triggerHaptic('selection')}
            onClick={() => handleJumpAngleScroll(-180)}
          >
            {isEn ? 'Back' : '뒷모습'}
          </button>

          <button
            type="button"
            data-angle-center-reset="true"
            data-angle-ready={scrollbarLighting.frontReady ? 'true' : 'false'}
            className={`studio-angle-center-pill tabular-nums ${
              viewAngleDeg === 0 && Math.abs(angleScrollDeg) <= 12 ? 'is-front' : ''
            } ${scrollbarLighting.frontReady ? 'is-ready-lit' : ''} ${
              justLitAngles.includes(0) ? 'is-just-lit' : ''
            }`.trim()}
            title={isEn ? 'Reset to 0° Front' : '0° 정면으로 이동'}
            onPointerDown={() => triggerHaptic('selection')}
            onClick={() => handleJumpAngleScroll(0)}
          >
            <span>{centerAngleReadout}</span>
          </button>

          <button
            type="button"
            data-angle-end-btn="right-back"
            data-angle-ready={scrollbarLighting.backReady ? 'true' : 'false'}
            className={`studio-angle-end-label ${angleScrollDeg >= 158 ? 'is-active' : ''} ${
              scrollbarLighting.backReady ? 'is-ready-lit' : ''
            } ${justLitAngles.includes(180) ? 'is-just-lit' : ''}`.trim()}
            onPointerDown={() => triggerHaptic('selection')}
            onClick={() => handleJumpAngleScroll(180)}
          >
            {isEn ? 'Back' : '뒷모습'}
          </button>
        </div>

        <div className="studio-angle-scroll-track-wrap">
          {scrollbarLighting.frontReady && (
            <div
              aria-hidden="true"
              className="studio-angle-ready-glow-bar"
              data-angle-ready-glow-bar="true"
              style={{
                left: `${50 - scrollbarLighting.leftReachPct}%`,
                width: `${scrollbarLighting.leftReachPct + scrollbarLighting.rightReachPct}%`,
              }}
            />
          )}
          <div className="studio-angle-scroll-ticks" aria-hidden="true">
            {ANGLE_SCROLL_TICKS.map((tickDeg) => {
              const canonical = mapSignedTickToCanonicalSlice(tickDeg);
              const isTickReady = Boolean(scrollbarLighting.readyTicks[tickDeg]);
              const isTickJustLit = justLitAngles.includes(canonical);
              return (
                <span
                  key={tickDeg}
                  data-tick-angle={tickDeg}
                  data-tick-ready={isTickReady ? 'true' : 'false'}
                  className={`studio-angle-tick ${tickDeg === 0 ? 'is-center' : ''} ${
                    Math.abs(tickDeg) === 180 ? 'is-end' : ''
                  } ${isTickReady ? 'is-ready-lit' : ''} ${
                    isTickJustLit ? 'is-just-lit' : ''
                  }`.trim()}
                />
              );
            })}
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

      {/* Full-Viewport Lightbox Modal for Viewing Raw Nano Banana Original Generated Sheet */}
      {effectiveOriginalModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="studio-original-lightbox-backdrop"
            data-vton-original-modal="true"
            data-stage-theme={resolvedTheme}
            role="dialog"
            aria-modal="true"
            aria-label={
              isEn ? 'Nano Banana generated original image' : '나노바나나 생성 원본 이미지'
            }
            onClick={handleCloseOriginalModal}
          >
            <div
              className="studio-original-lightbox-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="studio-original-lightbox-header">
                <div className="studio-original-lightbox-title-group">
                  <strong className="studio-original-lightbox-title">
                    {hasRawOriginalSheet
                      ? isEn
                        ? 'Nano Banana Original Sheet'
                        : '나노바나나 생성 원본'
                      : isEn
                        ? 'Loaded Character Image'
                        : '불러온 캐릭터 이미지'}
                  </strong>
                  <span className="studio-original-lightbox-meta tabular-nums">
                    {hasRawOriginalSheet
                      ? isEn
                        ? 'Raw 4×2 8-Angle Output'
                        : '4×2 8각도 원본 시트'
                      : isEn
                        ? 'Cached Cutout'
                        : '기존 캐시 컷아웃'}
                    {originalImgDims && originalImgDims.src === originalModalImageUrl
                      ? ` · ${originalImgDims.width} × ${originalImgDims.height}`
                      : ''}
                  </span>
                </div>
                <div className="studio-original-lightbox-actions">
                  <button
                    type="button"
                    className="studio-original-lightbox-btn"
                    data-vton-original-zoom="true"
                    aria-pressed={originalModalZoomed}
                    aria-label={
                      originalModalZoomed
                        ? isEn
                          ? 'Fit to screen'
                          : '화면에 맞추기'
                        : isEn
                          ? 'Zoom to 100%'
                          : '원본 크기 확대'
                    }
                    title={
                      originalModalZoomed
                        ? isEn
                          ? 'Fit to screen'
                          : '화면에 맞추기'
                        : isEn
                          ? 'Zoom to 100%'
                          : '원본 크기 확대'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setOriginalModalZoomed((prev) => !prev);
                    }}
                  >
                    {originalModalZoomed ? (
                      <ZoomOut size={15} aria-hidden="true" />
                    ) : (
                      <ZoomIn size={15} aria-hidden="true" />
                    )}
                    <span>
                      {originalModalZoomed
                        ? isEn
                          ? 'Fit'
                          : '화면 맞춤'
                        : isEn
                          ? '100%'
                          : '원본 확대'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="studio-original-lightbox-btn"
                    data-vton-original-download="true"
                    aria-label={isEn ? 'Download original image' : '원본 이미지 저장'}
                    title={isEn ? 'Download original image' : '원본 이미지 저장'}
                    onClick={handleDownloadOriginalImage}
                  >
                    <Download size={15} aria-hidden="true" />
                    <span>{isEn ? 'Save' : '저장'}</span>
                  </button>
                  <button
                    type="button"
                    className="studio-original-lightbox-close"
                    data-vton-original-close="true"
                    aria-label={isEn ? 'Close original viewer' : '원본 보기 닫기'}
                    onClick={handleCloseOriginalModal}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {!hasRawOriginalSheet && (
                <div className="studio-original-lightbox-note">
                  {isEn
                    ? 'This cached look was saved before raw sheet archiving. Newly generated outfits will display the full 4×2 Nano Banana original sheet here.'
                    : '이전 캐시 항목에는 8각도 원본 시트가 저장되어 있지 않아 현재 이미지를 표시합니다. 새로 생성되는 코디부터 나노바나나 원본 시트가 그대로 표시됩니다.'}
                </div>
              )}

              <div
                className={`studio-original-lightbox-canvas ${
                  originalModalZoomed ? 'is-zoomed' : ''
                }`.trim()}
              >
                <img
                  src={originalModalImageUrl}
                  alt={
                    hasRawOriginalSheet
                      ? isEn
                        ? 'Nano Banana raw generated turnaround sheet'
                        : '나노바나나에서 생성된 8각도 원본 시트 이미지'
                      : isEn
                        ? 'Loaded AI fitting character image'
                        : '불러온 AI 피팅 캐릭터 이미지'
                  }
                  className="studio-original-lightbox-img"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOriginalModalZoomed((prev) => !prev);
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      setOriginalImgDims({
                        src: originalModalImageUrl,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                      });
                    }
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

export default Studio2DFittingViewer;
