import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Palette,
  RotateCcw,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  Upload,
  User,
  UserRound,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  AVATAR_ARCHETYPE_OPTIONS,
  AVATAR_FRAME_OPTIONS,
  CHEST_FORM_OPTIONS,
  DEFAULT_ISO_VIEW_ANGLE,
  EYE_SHAPE_OPTIONS,
  FACIAL_HAIR_OPTIONS,
  HAIR_COLOR_SWATCHES,
  HAIR_STYLE_OPTIONS,
  HEAD_SHAPE_OPTIONS,
  ISO_VIEW_ANGLE_OPTIONS,
  avatarSpecToLegacyBodySpec,
  bridgeLegacyPropsToAvatarSpec,
  resolveCoupledBodyMetrics,
  sanitizeAvatarSpec,
  setAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  MST_BASE_LEVELS,
  findClosestMstFromHex,
  getMstSwatch,
} from '../services/monkSkinTone.ts';
import {
  LIGHTING_CALIBRATION_MODES,
  SEASON_BEST_SWATCHES,
  SKIN_TONE_MANNEQUIN_PRESETS,
  analyzePortraitSkinTone,
  createSyntheticSamplePortrait,
  findClosestSkinPreset,
  normalizeSeasonKey,
} from '../services/skinToneAnalyzer.ts';
import { localizeApiMessage, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  HairAndFacialFeaturesControls,
  InclusiveBodyMorphControls,
} from './AvatarStudioControls.jsx';
import Character25DMannequin from './Character25DMannequin.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import './AvatarStudioModal.css';

const SAMPLE_PORTRAIT_BUTTONS = [
  { key: 'spring_warm', ko: '봄 웜', en: 'Spring' },
  { key: 'summer_cool', ko: '여름 쿨', en: 'Summer' },
  { key: 'autumn_warm', ko: '가을 웜', en: 'Autumn' },
  { key: 'winter_cool', ko: '겨울 쿨', en: 'Winter' },
];

const UNDERTONE_SEGMENT_OPTIONS = [
  { key: 'warm', ko: '웜톤', en: 'Warm' },
  { key: 'neutral', ko: '뉴트럴', en: 'Neutral' },
  { key: 'cool', ko: '쿨톤', en: 'Cool' },
];

const SEASON_REP_PRESETS = [
  { season: 'spring_warm', presetKey: 'spring_ivory', ko: '봄 웜', en: 'Spring Warm' },
  { season: 'summer_cool', presetKey: 'summer_rose', ko: '여름 쿨', en: 'Summer Cool' },
  { season: 'autumn_warm', presetKey: 'autumn_beige', ko: '가을 웜', en: 'Autumn Warm' },
  { season: 'winter_cool', presetKey: 'winter_neutral', ko: '겨울 쿨', en: 'Winter Cool' },
];

const LIGHTING_SEGMENT_LABELS = {
  auto_d65: { ko: '자연광(기본)', en: 'Daylight' },
  studio_cool_fix: { ko: '형광등', en: 'Cool LED' },
  indoor_warm_fix: { ko: '노란조명', en: 'Warm Lamp' },
  raw_original: { ko: '원본', en: 'Original' },
};

const HUMAN_TONE_TIERS = {
  1: { ko: '페어', en: 'Fair' },
  2: { ko: '아이보리', en: 'Ivory' },
  3: { ko: '라이트', en: 'Light' },
  4: { ko: '내추럴', en: 'Natural' },
  5: { ko: '미디엄', en: 'Medium' },
  6: { ko: '골든 탠', en: 'Golden' },
  7: { ko: '탠', en: 'Tan' },
  8: { ko: '브론즈', en: 'Bronze' },
  9: { ko: '딥', en: 'Deep' },
  10: { ko: '딥 리치', en: 'Rich Deep' },
};

const HUMAN_UNDERTONE_WORDS = {
  cool: { ko: '쿨', en: 'Cool' },
  neutral: { ko: '뉴트럴', en: 'Neutral' },
  warm: { ko: '웜', en: 'Warm' },
  olive: { ko: '올리브', en: 'Olive' },
};

function formatHumanToneLabel(mstLevel, mstUndertone, lang = 'ko') {
  const safeLevel = Math.max(1, Math.min(10, Math.round(Number(mstLevel) || 4)));
  const tier = HUMAN_TONE_TIERS[safeLevel] || HUMAN_TONE_TIERS[4];
  const ut = HUMAN_UNDERTONE_WORDS[mstUndertone] || HUMAN_UNDERTONE_WORDS.neutral;
  if (lang === 'en') {
    return `${tier.en} ${ut.en}`;
  }
  return `${tier.ko} ${ut.ko}`;
}

function isDarkSwatch(hex = '#DFBA9B') {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function findOptionLabel(options, key, lang, useShort = true) {
  const found = options.find((item) => item.key === key);
  if (!found) return '';
  if (useShort) return lang === 'en' ? found.shortEn : found.shortKo;
  return lang === 'en' ? found.labelEn : found.labelKo;
}

function ProfileModalContent({
  open,
  initialTab = 'skin',
  lang = 'ko',
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  onApplySkinProfile,
  onApplyBodySpec,
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const manualToneSectionRef = useRef(null);
  const analysisSeqRef = useRef(0);
  const isSignedAccount = Boolean(user && !user.isSampleDemo);

  const accountFallbackGender =
    (isSignedAccount
      ? user?.gender
      : bodySpec?.gender || skinProfile?.gender) === 'female'
      ? 'female'
      : 'male';

  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab === 'body') return 'body';
    if (initialTab === 'hair') return 'hair';
    return 'skin';
  });

  // Unified V2 AvatarSpec draft initialized from legacy props + persisted store
  const [draftSpec, setDraftSpec] = useState(
    () => bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user }).spec
  );

  const [previewAngleDeg, setPreviewAngleDeg] = useState(DEFAULT_ISO_VIEW_ANGLE);

  const [draftSubType, setDraftSubType] = useState(() => {
    const initial = bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user }).spec;
    if (
      skinProfile?.subTypeLabelKo &&
      normalizeSeasonKey(skinProfile?.personalColor) === initial.appearance.personalColor
    ) {
      return skinProfile.subTypeLabelKo;
    }
    return findClosestSkinPreset(
      initial.appearance.skinToneHex,
      initial.appearance.personalColor
    ).subTypeLabelKo;
  });

  const [draftPresetKey, setDraftPresetKey] = useState(() => {
    const initial = bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user }).spec;
    if (
      skinProfile?.presetKey &&
      String(skinProfile?.skinToneHex || '').toUpperCase() ===
        initial.appearance.skinToneHex.toUpperCase()
    ) {
      return skinProfile.presetKey;
    }
    return findClosestSkinPreset(
      initial.appearance.skinToneHex,
      initial.appearance.personalColor
    ).key;
  });

  const [lightingMode, setLightingMode] = useState('auto_d65');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [candidateFaceUrl, setCandidateFaceUrl] = useState(
    () =>
      bridgeLegacyPropsToAvatarSpec({ skinProfile, bodySpec, user }).spec.appearance
        .facePhotoUrl || ''
  );
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSampleSource, setIsSampleSource] = useState(false);

  // Progressive disclosure UI states
  const [manualSkinOpen, setManualSkinOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [sampleRailOpen, setSampleRailOpen] = useState(false);

  const fallbackGender =
    draftSpec.framePreset === 'feminine'
      ? 'female'
      : draftSpec.framePreset === 'masculine'
        ? 'male'
        : accountFallbackGender;

  const liveBodyMetrics = useMemo(() => resolveCoupledBodyMetrics(draftSpec), [draftSpec]);
  const liveLegacyBodySpec = useMemo(
    () => avatarSpecToLegacyBodySpec(draftSpec, fallbackGender),
    [draftSpec, fallbackGender]
  );

  const draftMstLevel = draftSpec.appearance.mstLevel;
  const draftMstUndertone = draftSpec.appearance.mstUndertone;
  const draftHex = draftSpec.appearance.skinToneHex;
  const draftSeason = normalizeSeasonKey(draftSpec.appearance.personalColor);
  const draftFacePhotoUrl = draftSpec.appearance.facePhotoUrl;

  const resolvedMstSwatch = useMemo(
    () => getMstSwatch(draftMstLevel, draftMstUndertone),
    [draftMstLevel, draftMstUndertone]
  );

  const isFacePhotoActive = Boolean(draftFacePhotoUrl);
  const effectiveFaceThumb = draftFacePhotoUrl || candidateFaceUrl || '';
  const hasCandidatePortrait = Boolean(effectiveFaceThumb);
  const hasPhotoForLighting = Boolean(sourceImageUrl || draftFacePhotoUrl);
  const hasPhotoForEmptyCheck = Boolean(
    sourceImageUrl || draftFacePhotoUrl || candidateFaceUrl || analysisResult?.previewDataUrl
  );
  const showFaceNotDetectedWarning =
    !analyzing &&
    !errorMsg &&
    !isSampleSource &&
    Boolean(analysisResult) &&
    !analysisResult.faceDetected;

  const handleStepPreviewAngle = (direction) => {
    triggerHaptic('selection');
    const turnaroundAngles = [0, 45, 90, 180];
    setPreviewAngleDeg((prev) => {
      const idx = turnaroundAngles.indexOf(prev);
      const safeIdx = idx >= 0 ? idx : 1;
      const step = direction === 'cw' ? 1 : -1;
      const nextIdx =
        (safeIdx + step + turnaroundAngles.length) % turnaroundAngles.length;
      return turnaroundAngles[nextIdx];
    });
  };

  const downscaleUserPortrait = (rawDataUrl) =>
    new Promise((resolve) => {
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 512;
          const srcW = Math.max(1, img.naturalWidth || img.width || 1);
          const srcH = Math.max(1, img.naturalHeight || img.height || 1);
          const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
          const dstW = Math.max(1, Math.round(srcW * scale));
          const dstH = Math.max(1, Math.round(srcH * scale));
          const canvas = document.createElement('canvas');
          canvas.width = dstW;
          canvas.height = dstH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.fillStyle = '#F5F5F7';
          ctx.fillRect(0, 0, dstW, dstH);
          ctx.drawImage(img, 0, 0, dstW, dstH);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });

  const runAnalysis = async (
    imgSrc,
    nextLighting = lightingMode,
    focusPoint = undefined,
    options = {}
  ) => {
    if (!imgSrc) return;
    const isUserUpload = Boolean(options.isUserUpload);
    const updateFacePhoto = options.updateFacePhoto ?? isUserUpload;
    const skipNeuralDetector = Boolean(options.skipNeuralDetector);
    const requestSeq = ++analysisSeqRef.current;
    setAnalyzing(true);
    setErrorMsg('');
    try {
      const [res, compactPortraitUrl] = await Promise.all([
        analyzePortraitSkinTone(imgSrc, {
          lightingMode: nextLighting,
          focusPoint,
          previousCropRect: options.previousCropRect,
          skipNeuralDetector,
        }),
        updateFacePhoto ? downscaleUserPortrait(imgSrc) : Promise.resolve(null),
      ]);
      if (analysisSeqRef.current !== requestSeq) return;
      setAnalysisResult(res);
      setDraftSubType(res.subTypeLabelKo);
      setDraftPresetKey(res.matchedPresetKey);

      const autoMst = findClosestMstFromHex(res.skinToneHex);
      const syncedMstLevel = res.mstLevel ?? autoMst.level;
      const syncedMstUndertone = res.mstUndertone ?? autoMst.undertone;
      const resolvedFaceUrl = updateFacePhoto
        ? compactPortraitUrl || res.previewDataUrl || imgSrc
        : undefined;

      if (resolvedFaceUrl) {
        setCandidateFaceUrl(resolvedFaceUrl);
      }

      setDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          appearance: {
            ...prev.appearance,
            mstLevel: syncedMstLevel,
            mstUndertone: syncedMstUndertone,
            skinToneHex: res.skinToneHex,
            personalColor: res.personalColor,
            facePhotoUrl:
              resolvedFaceUrl !== undefined
                ? resolvedFaceUrl
                : prev.appearance.facePhotoUrl,
          },
        })
      );
      triggerHaptic('light');
    } catch (err) {
      if (analysisSeqRef.current !== requestSeq) return;
      setAnalysisResult(null);
      if (isUserUpload) {
        setSourceImageUrl('');
      }
      const fallbackErr = tx(
        lang,
        '사진을 불러오지 못했거나 얼굴 피부톤을 추출할 수 없습니다. 밝은 조명의 정면 사진으로 다시 시도하거나 아래 수동 피부톤을 선택해 주세요.',
        'Could not decode the photo or extract skin tone. Please choose another front-lit portrait or select a tone manually below.'
      );
      const localized = localizeApiMessage(err?.message, lang);
      setErrorMsg(localized || fallbackErr);
    } finally {
      if (analysisSeqRef.current === requestSeq) {
        setAnalyzing(false);
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');

    if (file.type && !file.type.startsWith('image/')) {
      analysisSeqRef.current += 1;
      setAnalyzing(false);
      setAnalysisResult(null);
      setSourceImageUrl('');
      setErrorMsg(
        tx(
          lang,
          '이미지 파일(JPG, PNG, WebP)만 분석할 수 있습니다. 다른 사진 파일을 선택하거나 수동 피부톤 선택을 이용해 주세요.',
          'Only image files (JPG, PNG, WebP) can be analyzed. Please choose another photo or pick your skin tone manually.'
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      analysisSeqRef.current += 1;
      setAnalyzing(false);
      setAnalysisResult(null);
      setSourceImageUrl('');
      setErrorMsg(
        tx(
          lang,
          '선택한 사진 파일을 읽지 못했습니다. 다른 사진을 선택하거나 수동 피부톤 선택으로 이동해 주세요.',
          'Unable to read the selected file. Please choose another photo or switch to manual skin tone selection.'
        )
      );
    };
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        analysisSeqRef.current += 1;
        setAnalyzing(false);
        setAnalysisResult(null);
        setSourceImageUrl('');
        setErrorMsg(
          tx(
            lang,
            '비어 있는 이미지 파일입니다. 다른 사진으로 다시 시도해 주세요.',
            'The selected image appears to be empty. Please choose another photo.'
          )
        );
        return;
      }
      setIsSampleSource(false);
      setSourceImageUrl(dataUrl);
      void runAnalysis(dataUrl, lightingMode, undefined, {
        isUserUpload: true,
        updateFacePhoto: true,
        skipNeuralDetector: false,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleOpenGallery = () => {
    triggerHaptic('selection');
    galleryInputRef.current?.click();
  };

  const handleOpenCamera = () => {
    triggerHaptic('selection');
    setErrorMsg('');
    cameraInputRef.current?.click();
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((status) => {
          if (status.state === 'denied') {
            setErrorMsg(
              tx(
                lang,
                '카메라 접근 권한이 거부되어 촬영할 수 없습니다. 다른 사진 파일을 선택하거나 수동 피부톤 선택으로 이동해 주세요.',
                'Camera permission is denied. Please choose another photo from your device or select your skin tone manually.'
              )
            );
          }
        })
        .catch(() => {});
    }
  };

  const handleSelectSamplePortrait = (seasonKey) => {
    triggerHaptic('selection');
    const sampleUrl = createSyntheticSamplePortrait(seasonKey);
    if (!sampleUrl) return;
    setErrorMsg('');
    setIsSampleSource(true);
    setSourceImageUrl(sampleUrl);
    void runAnalysis(sampleUrl, lightingMode, undefined, {
      isUserUpload: false,
      updateFacePhoto: false,
      skipNeuralDetector: true,
    });
  };

  const handleToggleFacePhoto = () => {
    if (!hasCandidatePortrait && !isFacePhotoActive) return;
    triggerHaptic('selection');
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          facePhotoUrl: isFacePhotoActive ? null : effectiveFaceThumb,
        },
      })
    );
  };

  const handleResetFacePhoto = () => {
    triggerHaptic('selection');
    analysisSeqRef.current += 1;
    setAnalyzing(false);
    setErrorMsg('');
    setIsSampleSource(false);
    setSourceImageUrl('');
    setCandidateFaceUrl('');
    setAnalysisResult(null);
    setMetricsOpen(false);
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          facePhotoUrl: null,
        },
      })
    );
  };

  const handleJumpToManualSkinTone = () => {
    triggerHaptic('selection');
    setManualSkinOpen(true);
    const focusAfterOpen = () => {
      const target = manualToneSectionRef.current;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstControl = target.querySelector('[data-mst-level], button, input');
        if (firstControl instanceof HTMLElement) {
          firstControl.focus({ preventScroll: true });
        }
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(focusAfterOpen));
    } else {
      setTimeout(focusAfterOpen, 20);
    }
  };

  const handleChangeLighting = (nextMode) => {
    triggerHaptic('selection');
    setLightingMode(nextMode);
    const lightingTargetUrl = sourceImageUrl || draftFacePhotoUrl || candidateFaceUrl;
    if (lightingTargetUrl) {
      if (!sourceImageUrl) {
        setSourceImageUrl(lightingTargetUrl);
      }
      void runAnalysis(lightingTargetUrl, nextMode, undefined, {
        isUserUpload: !isSampleSource && Boolean(draftFacePhotoUrl),
        updateFacePhoto: false,
        skipNeuralDetector: isSampleSource,
      });
    }
  };

  const handlePreviewTapFocus = (e) => {
    if (!sourceImageUrl || !analysisResult?.cropSourceRect || analyzing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    const { sx, sy, side, srcW, srcH } = analysisResult.cropSourceRect;
    const fullX = Math.max(0.04, Math.min(0.96, (sx + relX * side) / Math.max(1, srcW)));
    const fullY = Math.max(0.04, Math.min(0.96, (sy + relY * side) / Math.max(1, srcH)));
    void runAnalysis(
      sourceImageUrl,
      lightingMode,
      { x: fullX, y: fullY },
      {
        isUserUpload: !isSampleSource && Boolean(draftFacePhotoUrl),
        updateFacePhoto: false,
        skipNeuralDetector: isSampleSource,
        previousCropRect: analysisResult.cropSourceRect,
      }
    );
  };

  const handlePickPreset = (preset) => {
    triggerHaptic('selection');
    const mst = findClosestMstFromHex(preset.skinToneHex);
    setDraftPresetKey(preset.key);
    setDraftSubType(preset.subTypeLabelKo);
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          mstLevel: mst.level,
          mstUndertone: mst.undertone,
          skinToneHex: preset.skinToneHex,
          personalColor: preset.personalColor,
        },
      })
    );
  };

  const handlePickMstCell = (nextLevel, nextUndertone) => {
    triggerHaptic('selection');
    const swatch = getMstSwatch(nextLevel, nextUndertone);
    const closest = findClosestSkinPreset(swatch.hex, swatch.personalColor);
    setDraftPresetKey(closest.key);
    setDraftSubType(closest.subTypeLabelKo);
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          mstLevel: swatch.level,
          mstUndertone: swatch.undertone,
          skinToneHex: swatch.hex,
          personalColor: swatch.personalColor,
        },
      })
    );
  };

  const handleCustomHexChange = (e) => {
    const hex = String(e.target.value || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) return;
    const closest = findClosestSkinPreset(hex, draftSeason);
    const mst = findClosestMstFromHex(hex);
    setDraftPresetKey(closest.key);
    setDraftSubType(closest.subTypeLabelKo);
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          mstLevel: mst.level,
          mstUndertone: mst.undertone,
          skinToneHex: hex,
        },
      })
    );
  };

  const commitAvatarStudioChanges = (primarySource) => {
    const cleanedSpec = sanitizeAvatarSpec(draftSpec);
    const app = cleanedSpec.appearance;
    const seasonKey = normalizeSeasonKey(app.personalColor);
    const seasonInfo = SEASON_BEST_SWATCHES[seasonKey] || SEASON_BEST_SWATCHES.autumn_warm;
    const mstSwatch = getMstSwatch(app.mstLevel, app.mstUndertone);
    const legacyBody = avatarSpecToLegacyBodySpec(cleanedSpec, fallbackGender);

    const skinPayload = {
      skinToneHex: app.skinToneHex,
      personalColor: seasonKey,
      personalColorLabelKo: seasonInfo.labelKo,
      subTypeLabelKo: draftSubType,
      gender: fallbackGender,
      presetKey: draftPresetKey,
      mstLevel: app.mstLevel,
      mstUndertone: app.mstUndertone,
      mstCode: mstSwatch.code,
      portraitDataUrl: app.facePhotoUrl || null,
    };

    const skinChanged =
      skinProfile?.skinToneHex !== skinPayload.skinToneHex ||
      skinProfile?.personalColor !== skinPayload.personalColor ||
      skinProfile?.mstLevel !== skinPayload.mstLevel ||
      skinProfile?.mstUndertone !== skinPayload.mstUndertone ||
      (skinProfile?.portraitDataUrl || null) !== (skinPayload.portraitDataUrl || null);

    const bodyChanged =
      bodySpec?.heightCm !== legacyBody.heightCm ||
      bodySpec?.weightKg !== legacyBody.weightKg ||
      bodySpec?.bodyShape !== legacyBody.bodyShape ||
      bodySpec?.shoulderScale !== legacyBody.shoulderScale ||
      bodySpec?.waistScale !== legacyBody.waistScale ||
      bodySpec?.hipScale !== legacyBody.hipScale;

    triggerHaptic('medium');

    if (primarySource === 'body') {
      if (skinChanged) {
        onApplySkinProfile?.(skinPayload);
      }
      onApplyBodySpec?.(legacyBody);
    } else {
      if (bodyChanged) {
        onApplyBodySpec?.(legacyBody);
      }
      onApplySkinProfile?.(skinPayload);
    }

    setAvatarSpec(cleanedSpec);
    onClose?.();
  };

  const activeSeasonMeta = SEASON_BEST_SWATCHES[draftSeason] || SEASON_BEST_SWATCHES.autumn_warm;
  const localizedSeasonLabel =
    lang === 'en' ? activeSeasonMeta.labelEn : activeSeasonMeta.labelKo;
  const humanToneLabel = formatHumanToneLabel(draftMstLevel, draftMstUndertone, lang);
  const unifiedToneBadgeText = `${humanToneLabel} · ${localizedSeasonLabel}`;
  const recommendedThreeColors = activeSeasonMeta.colors.slice(0, 3);

  const activeAngleMeta =
    ISO_VIEW_ANGLE_OPTIONS.find((item) => item.angleDeg === previewAngleDeg) ||
    ISO_VIEW_ANGLE_OPTIONS[0];
  const shortAngleLabel = lang === 'en' ? activeAngleMeta.shortEn : activeAngleMeta.shortKo;

  const previewSkinProfile = useMemo(
    () => ({
      skinToneHex: draftHex,
      personalColor: draftSeason,
      mstLevel: draftMstLevel,
      mstUndertone: draftMstUndertone,
      mstCode: resolvedMstSwatch.code,
      portraitDataUrl: draftFacePhotoUrl,
    }),
    [
      draftHex,
      draftSeason,
      draftMstLevel,
      draftMstUndertone,
      draftFacePhotoUrl,
      resolvedMstSwatch.code,
    ]
  );

  // Derived labels for Tab 2 (Hair & Face) & Tab 3 (Body Profile)
  const activeHairLabel = findOptionLabel(
    HAIR_STYLE_OPTIONS,
    draftSpec.appearance.hairStyle,
    lang,
    false
  );
  const activeFacialHairLabel = findOptionLabel(
    FACIAL_HAIR_OPTIONS,
    draftSpec.appearance.facialHair,
    lang,
    true
  );
  const activeHeadShapeLabel = findOptionLabel(
    HEAD_SHAPE_OPTIONS,
    draftSpec.appearance.headShape,
    lang,
    true
  );
  const activeEyeShapeLabel = findOptionLabel(
    EYE_SHAPE_OPTIONS,
    draftSpec.appearance.eyeShape,
    lang,
    true
  );
  const activeHairColorSwatch = HAIR_COLOR_SWATCHES.find(
    (sw) => sw.hex.toUpperCase() === draftSpec.appearance.hairColorHex.toUpperCase()
  );
  const activeHairColorLabel = activeHairColorSwatch
    ? lang === 'en'
      ? activeHairColorSwatch.labelEn
      : activeHairColorSwatch.labelKo
    : draftSpec.appearance.hairColorHex;

  const activeFrameMeta =
    AVATAR_FRAME_OPTIONS.find((item) => item.key === draftSpec.framePreset) ||
    AVATAR_FRAME_OPTIONS[2];
  const activeArchetypeMeta =
    AVATAR_ARCHETYPE_OPTIONS.find((item) => item.key === draftSpec.archetypePreset) ||
    AVATAR_ARCHETYPE_OPTIONS[4];
  const activeChestFormLabel = findOptionLabel(
    CHEST_FORM_OPTIONS,
    draftSpec.anthropometrics.chestForm,
    lang,
    true
  );

  const primaryCtaConfig =
    activeTab === 'body'
      ? {
          id: 'apply-body-spec-btn',
          label: tx(lang, '체형 적용', 'Apply Body Profile'),
          source: 'body',
        }
      : activeTab === 'hair'
        ? {
            id: CARBON_DOM_CONTRACT.skinToneApplyBtnId,
            label: tx(lang, '헤어 · 얼굴형 적용', 'Apply Hair & Face'),
            source: 'skin',
          }
        : {
            id: CARBON_DOM_CONTRACT.skinToneApplyBtnId,
            label: tx(lang, '피부톤 적용', 'Apply Skin Tone'),
            source: 'skin',
          };

  const applyFooter = (
    <button
      id={primaryCtaConfig.id}
      type="button"
      className="hig-primary-cta-btn"
      onClick={() => commitAvatarStudioChanges(primaryCtaConfig.source)}
    >
      <Check size={17} aria-hidden="true" />
      <span>{primaryCtaConfig.label}</span>
    </button>
  );

  return (
    <ResponsiveSheetModal
      id="profile-studio-sheet"
      open={open}
      onClose={onClose}
      lang={lang}
      title={tx(lang, '프로필 · 피부톤 & 체형', 'Profile · Skin Tone & Body')}
      maxWidth={580}
      footer={applyFooter}
    >
      <div className="skin-modal-body" data-active-tab={activeTab}>
        {/* 3-Way Sticky Segmented Navigation */}
        <div className="profile-modal-tabs-sticky">
          <div
            className="profile-modal-tabs"
            role="tablist"
            aria-label={tx(lang, '프로필 설정 탭', 'Profile Settings Tabs')}
          >
            <button
              id="profile-tab-skin"
              type="button"
              role="tab"
              aria-selected={activeTab === 'skin'}
              className={`profile-modal-tab-btn ${activeTab === 'skin' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('skin');
              }}
            >
              <Palette size={15} aria-hidden="true" />
              <span>{tx(lang, '사진 · 피부톤', 'Photo & Skin')}</span>
            </button>
            <button
              id="profile-tab-hair"
              type="button"
              role="tab"
              aria-selected={activeTab === 'hair'}
              className={`profile-modal-tab-btn ${activeTab === 'hair' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setMetricsOpen(false);
                setActiveTab('hair');
              }}
            >
              <UserRound size={15} aria-hidden="true" />
              <span>{tx(lang, '헤어 · 얼굴형', 'Hair & Face')}</span>
            </button>
            <button
              id="profile-tab-body"
              type="button"
              role="tab"
              aria-selected={activeTab === 'body'}
              className={`profile-modal-tab-btn ${activeTab === 'body' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setMetricsOpen(false);
                setActiveTab('body');
              }}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
            </button>
          </div>
        </div>

        {/* [Section 1] Top Unified Compact 2-Column Preview & Summary Header */}
        <div className="skin-modal-preview-grid">
          <div className="skin-modal-character-box">
            <div className="skin-modal-character-stage">
              <Character25DMannequin
                avatarSpec={draftSpec}
                viewAngleDeg={previewAngleDeg}
                skinToneHex={draftHex}
                personalColor={draftSeason}
                skinProfile={previewSkinProfile}
                bodySpec={liveLegacyBodySpec}
                personReferenceUrl={draftFacePhotoUrl}
                theme={theme}
                lang={lang}
                compact
              />
            </div>

            <div
              className="avatar-iso-rotate-bar"
              role="group"
              aria-label={tx(lang, '아바타 프리뷰 회전', 'Avatar Preview Rotation')}
            >
              <button
                type="button"
                data-iso-rotate-btn="ccw"
                className="avatar-iso-rotate-btn"
                aria-label={tx(lang, '반시계 방향 45° 회전', 'Rotate 45 degrees counter-clockwise')}
                title={tx(lang, '반시계 방향 45° 회전', 'Rotate 45 degrees counter-clockwise')}
                onClick={() => handleStepPreviewAngle('ccw')}
              >
                ↺
              </button>
              <button
                type="button"
                data-iso-angle-badge={previewAngleDeg}
                className="avatar-iso-angle-pill tabular-nums"
                title={tx(lang, '클릭하여 45° 기본 각도로 복귀', 'Click to reset to 45 degree quarter view')}
                onClick={() => {
                  triggerHaptic('selection');
                  setPreviewAngleDeg(DEFAULT_ISO_VIEW_ANGLE);
                }}
              >
                {shortAngleLabel}
              </button>
              <button
                type="button"
                data-iso-rotate-btn="cw"
                className="avatar-iso-rotate-btn"
                aria-label={tx(lang, '시계 방향 45° 회전', 'Rotate 45 degrees clockwise')}
                title={tx(lang, '시계 방향 45° 회전', 'Rotate 45 degrees clockwise')}
                onClick={() => handleStepPreviewAngle('cw')}
              >
                ↻
              </button>
            </div>
          </div>

          <div className="skin-modal-summary-box">
            {activeTab === 'skin' && (
              <>
                {analysisResult?.previewDataUrl && !analyzing && !errorMsg ? (
                  <div className="skin-crop-summary-group">
                    <div
                      className="skin-portrait-pin-frame is-clickable"
                      data-detector-engine={analysisResult.detectorEngine || ''}
                      onClick={handlePreviewTapFocus}
                      title={tx(
                        lang,
                        '얼굴 영역을 탭하여 피부톤을 다시 추출할 수 있습니다',
                        'Tap the face area to resample skin tone'
                      )}
                    >
                      <img
                        src={analysisResult.previewDataUrl}
                        alt={tx(lang, '얼굴 피부톤 샘플링 프리뷰', 'Face skin sampling preview')}
                        className="skin-portrait-pin-img"
                      />
                      {analysisResult.faceBoxPreview && (
                        <div
                          className="skin-face-box-guide"
                          aria-hidden="true"
                          style={{
                            left: `${analysisResult.faceBoxPreview.x * 100}%`,
                            top: `${analysisResult.faceBoxPreview.y * 100}%`,
                            width: `${(analysisResult.faceBoxPreview.w ?? analysisResult.faceBoxPreview.width ?? 0) * 100}%`,
                            height: `${(analysisResult.faceBoxPreview.h ?? analysisResult.faceBoxPreview.height ?? 0) * 100}%`,
                          }}
                        />
                      )}
                      <div
                        className={`hig-optical-scan-overlay ${analyzing ? 'is-scanning' : ''}`}
                        aria-hidden="true"
                      >
                        <span className="wardrobe-scanner-corner is-tl" />
                        <span className="wardrobe-scanner-corner is-tr" />
                        <span className="wardrobe-scanner-corner is-bl" />
                        <span className="wardrobe-scanner-corner is-br" />
                      </div>
                      {analysisResult.pins.map((pin) => (
                        <span
                          key={pin.id}
                          data-skin-pin-id={pin.id}
                          className="skin-sample-pin"
                          title={`${lang === 'en' ? pin.labelEn : pin.labelKo}: ${pin.hex}`}
                          style={{
                            left: `${pin.x * 100}%`,
                            top: `${pin.y * 100}%`,
                            backgroundColor: pin.hex,
                          }}
                        />
                      ))}
                      <span
                        className={`skin-face-detected-badge ${
                          analysisResult.faceDetected ? '' : 'is-fallback'
                        }`}
                      >
                        {analysisResult.faceDetected
                          ? tx(lang, '얼굴 인식됨', 'Face Detected')
                          : tx(lang, '직접 지정 가능', 'Tap Face')}
                      </span>
                    </div>
                    <span className="skin-tap-hint">
                      {tx(lang, '얼굴을 탭해 피부톤 재추출', 'Tap face to resample')}
                    </span>
                  </div>
                ) : (
                  <span className="skin-summary-kicker">
                    {isFacePhotoActive
                      ? tx(lang, '얼굴 사진 반영 · 피부톤 진단', 'Face Photo · Skin Tone')
                      : tx(lang, '현재 아바타 피부톤 진단', 'Active Skin Tone Diagnosis')}
                  </span>
                )}

                <div className="skin-unified-result-block">
                  <div className="skin-unified-result-row">
                    <span
                      className="skin-tone-result-swatch"
                      style={{ backgroundColor: draftHex }}
                      aria-hidden="true"
                    />
                    <span
                      className="skin-unified-tone-pill"
                      data-unified-tone-badge="true"
                      data-mst-code={resolvedMstSwatch.code}
                    >
                      {unifiedToneBadgeText}
                    </span>
                    <button
                      type="button"
                      data-skin-metrics-toggle="true"
                      aria-expanded={metricsOpen}
                      aria-label={tx(lang, '피부톤 상세 수치', 'Color Metrics')}
                      title={tx(lang, '상세 수치 보기', 'View Color Metrics')}
                      className={`skin-metrics-info-btn ${metricsOpen ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setMetricsOpen((prev) => !prev);
                      }}
                    >
                      ?
                    </button>
                  </div>

                  {metricsOpen && (
                    <div
                      className="skin-lab-metrics skin-metrics-popover tabular-nums"
                      data-skin-metrics-popover="true"
                      role="region"
                      aria-label={tx(lang, '피부톤 상세 측정 수치', 'Detailed Skin Tone Metrics')}
                    >
                      <span>
                        {tx(lang, '추출 색상', 'Color')}{' '}
                        <strong>{analysisResult ? analysisResult.skinToneHex : draftHex}</strong>
                      </span>
                      <span>{resolvedMstSwatch.code}</span>
                      {analysisResult && (
                        <>
                          <span>
                            L* {analysisResult.lab.L} · a* {analysisResult.lab.a} · b*{' '}
                            {analysisResult.lab.b}
                          </span>
                          <span>
                            ITA° {analysisResult.lab.itaDeg}° · {tx(lang, '신뢰도', 'Confidence')}{' '}
                            {analysisResult.confidence}%
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="skin-best-drape-row"
                  aria-label={tx(lang, '어울리는 추천 컬러', 'Recommended Matching Colors')}
                >
                  {recommendedThreeColors.map((sw) => (
                    <div
                      key={sw.hex}
                      className="skin-best-drape-chip"
                      title={lang === 'en' ? sw.nameEn : sw.name}
                    >
                      <span style={{ backgroundColor: sw.hex }} aria-hidden="true" />
                      <small>{lang === 'en' ? sw.nameEn : sw.name}</small>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'hair' && (
              <div className="studio-tab-summary-card">
                <div className="skin-tone-hero-badge">
                  <span
                    className="skin-tone-large-swatch"
                    style={{ backgroundColor: draftSpec.appearance.hairColorHex }}
                    aria-hidden="true"
                  />
                  <div className="skin-tone-hero-text">
                    <strong className="skin-tone-diagnosis-title">{activeHairLabel}</strong>
                    <span className="skin-tone-hex-code">
                      {activeHairColorLabel} · {tx(lang, '수염', 'Beard')} {activeFacialHairLabel}
                    </span>
                  </div>
                </div>
                <div className="studio-summary-metrics-strip">
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '얼굴형', 'Face')} · {activeHeadShapeLabel}
                  </span>
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '눈매', 'Eyes')} · {activeEyeShapeLabel}
                  </span>
                </div>
                <p className="avatar-studio-hint">
                  {tx(
                    lang,
                    '헤어스타일, 컬러 및 이목구비 비율은 AI 피팅 아바타에 즉시 반영됩니다.',
                    'Hairstyle, color, and facial proportions sync directly with your AI Try-On avatar.'
                  )}
                </p>
              </div>
            )}

            {activeTab === 'body' && (
              <div className="body-summary-right-card">
                <div className="body-summary-right-head">
                  <span className="body-summary-kicker">
                    {tx(lang, '가상 피팅 체형 프로필', 'Active Body Spec')}
                  </span>
                  <strong className="body-summary-title">
                    {lang === 'en' ? activeFrameMeta.shortEn : activeFrameMeta.shortKo} ·{' '}
                    {lang === 'en' ? activeArchetypeMeta.shortEn : activeArchetypeMeta.shortKo}
                  </strong>
                </div>
                <span className="body-spec-account-badge tabular-nums">
                  {draftSpec.anthropometrics.heightCm}cm · {draftSpec.anthropometrics.weightKg}kg ·
                  BMI {liveBodyMetrics.bmi.toFixed(1)}
                </span>
                <div className="studio-summary-metrics-strip tabular-nums">
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '가슴 윤곽', 'Chest')} · {activeChestFormLabel}
                  </span>
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '어깨', 'Sh')}{' '}
                    {Math.round(draftSpec.anthropometrics.shoulderScale * 100)}%
                  </span>
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '허리', 'Wa')}{' '}
                    {Math.round(draftSpec.anthropometrics.waistScale * 100)}%
                  </span>
                </div>
                <div className="body-summary-tone-mini">
                  <span
                    className="skin-mini-dot"
                    style={{ backgroundColor: draftHex }}
                    aria-hidden="true"
                  />
                  <span>{unifiedToneBadgeText}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: Photo & Skin Tone (Focused purely on face reflection & skin tone) */}
        {activeTab === 'skin' && (
          <>
            <div className="skin-core-action-card">
              <div className="skin-modal-section-head">
                <span>{tx(lang, '얼굴 사진 자동 맞춤', 'Auto Match from Photo')}</span>
                <div className="skin-head-right-actions">
                  {analyzing && (
                    <span className="skin-analyzing-tag">
                      {tx(lang, '얼굴 인식 중...', 'Detecting face...')}
                    </span>
                  )}
                  <button
                    type="button"
                    data-sample-toggle="true"
                    aria-expanded={sampleRailOpen}
                    className="skin-sample-toggle-link"
                    onClick={() => {
                      triggerHaptic('selection');
                      setSampleRailOpen((prev) => !prev);
                    }}
                  >
                    <Sparkles size={12} aria-hidden="true" />
                    <span>{tx(lang, '샘플 테스트', 'Try Sample')}</span>
                  </button>
                </div>
              </div>

              <input
                ref={galleryInputRef}
                id="skin-portrait-file-input"
                type="file"
                accept="image/*"
                className="sr-only-input"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                id="skin-portrait-camera-input"
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only-input"
                onChange={handleFileChange}
              />

              <div className="skin-upload-btn-row">
                <button
                  type="button"
                  className="hig-secondary-btn skin-action-btn"
                  onClick={handleOpenGallery}
                  disabled={analyzing}
                >
                  <Upload size={15} aria-hidden="true" />
                  <span>{tx(lang, '사진 업로드', 'Upload Photo')}</span>
                </button>
                <button
                  type="button"
                  className="hig-secondary-btn skin-action-btn"
                  onClick={handleOpenCamera}
                  disabled={analyzing}
                >
                  <Camera size={15} aria-hidden="true" />
                  <span>{tx(lang, '카메라 촬영', 'Camera')}</span>
                </button>
              </div>

              {sampleRailOpen && (
                <div className="skin-sample-test-rail">
                  {SAMPLE_PORTRAIT_BUTTONS.map((btn) => (
                    <button
                      key={btn.key}
                      type="button"
                      data-sample-portrait={btn.key}
                      className="skin-sample-chip"
                      onClick={() => handleSelectSamplePortrait(btn.key)}
                    >
                      <Sparkles size={12} aria-hidden="true" />
                      <span>{lang === 'en' ? btn.en : btn.ko}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Exception State 1: Loading */}
              {analyzing && (
                <div
                  className="skin-analysis-state-card is-loading"
                  data-face-analysis-state="loading"
                  role="status"
                  aria-live="polite"
                >
                  <div className="skin-loading-row">
                    <Loader2 size={20} className="skin-spin-icon" aria-hidden="true" />
                    <div className="skin-state-copy">
                      <strong>
                        {tx(
                          lang,
                          '얼굴 인식 및 피부톤을 추출하고 있습니다...',
                          'Detecting face and extracting skin tone...'
                        )}
                      </strong>
                      <p className="skin-loading-sub">
                        {tx(
                          lang,
                          '광원 편차를 보정하고 이마·양볼·턱의 피부 픽셀을 정밀 분석 중입니다.',
                          'Normalizing illumination and sampling forehead, cheeks, and chin pixels.'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="skin-skeleton-lines" aria-hidden="true">
                    <span className="skin-skeleton-bar" style={{ width: '78%' }} />
                    <span className="skin-skeleton-bar" style={{ width: '54%' }} />
                  </div>
                </div>
              )}

              {/* Exception State 2: Hard Error & Recovery */}
              {!analyzing && errorMsg && (
                <div
                  className="skin-analysis-state-card is-error"
                  data-face-analysis-state="error"
                  role="alert"
                >
                  <div className="skin-state-header">
                    <AlertTriangle size={19} className="skin-state-icon-danger" aria-hidden="true" />
                    <div className="skin-state-copy">
                      <strong>
                        {tx(
                          lang,
                          '사진에서 피부톤을 분석하지 못했어요',
                          'Unable to complete face skin analysis'
                        )}
                      </strong>
                      <p className="skin-error-desc">{errorMsg}</p>
                    </div>
                  </div>
                  <div className="skin-recovery-actions">
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleOpenGallery}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      <span>{tx(lang, '다른 사진 다시 선택', 'Choose Another Photo')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleJumpToManualSkinTone}
                    >
                      <Palette size={14} aria-hidden="true" />
                      <span>{tx(lang, '수동 피부톤 선택으로 이동', 'Select Skin Tone Manually')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Soft Face-Not-Detected Warning & Recovery */}
              {showFaceNotDetectedWarning && (
                <div
                  className="skin-analysis-state-card is-warning"
                  data-face-analysis-state="error"
                  role="status"
                >
                  <div className="skin-state-header">
                    <AlertCircle size={18} className="skin-state-icon-warning" aria-hidden="true" />
                    <div className="skin-state-copy">
                      <strong>
                        {tx(
                          lang,
                          '사진에서 얼굴 윤곽을 뚜렷하게 찾지 못했어요',
                          'Face contours were not clearly detected'
                        )}
                      </strong>
                      <p className="skin-error-desc">
                        {tx(
                          lang,
                          '상단 프리뷰의 얼굴 위치를 직접 탭하거나 다른 사진 선택 · 수동 피부톤 선택을 이용해 주세요.',
                          'Tap directly on the preview face or choose a recovery option below.'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="skin-recovery-actions">
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleOpenGallery}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      <span>{tx(lang, '다른 사진 다시 선택', 'Choose Another Photo')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleJumpToManualSkinTone}
                    >
                      <Palette size={14} aria-hidden="true" />
                      <span>{tx(lang, '수동 피부톤 선택으로 이동', 'Select Skin Tone Manually')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Exception State 3: Compact Empty Guidance */}
              {!analyzing && !errorMsg && !hasPhotoForEmptyCheck && (
                <div
                  className="skin-analysis-state-card is-empty is-compact-banner"
                  data-face-analysis-state="empty"
                >
                  <div className="skin-empty-illustration" aria-hidden="true">
                    <ScanFace size={20} />
                  </div>
                  <div className="skin-state-copy">
                    <strong>
                      {tx(lang, '등록된 얼굴 사진이 없어요', 'No face photo uploaded yet')}
                    </strong>
                    <p className="skin-empty-desc">
                      {tx(
                        lang,
                        '정면 사진을 올리면 피부톤을 자동 추출하며, 아래에서 직접 선택할 수도 있어요.',
                        'Upload a front-lit portrait for auto extraction, or customize manually below.'
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Unified Face Photo ON/OFF Switch Card + Text Reset Button */}
              <div
                className="avatar-face-photo-row"
                data-user-face-active={isFacePhotoActive ? 'true' : 'false'}
              >
                <div className="avatar-face-photo-info">
                  {effectiveFaceThumb ? (
                    <img
                      src={effectiveFaceThumb}
                      alt={tx(lang, '내 얼굴 레퍼런스', 'My face reference')}
                      className="avatar-face-photo-thumb"
                    />
                  ) : (
                    <span className="avatar-face-photo-placeholder" aria-hidden="true">
                      <User size={15} />
                    </span>
                  )}
                  <div className="avatar-face-photo-text">
                    <strong>
                      {tx(lang, '내 얼굴 사진 반영', 'Use My Face Photo')}
                    </strong>
                    <small>
                      {isFacePhotoActive
                        ? tx(
                            lang,
                            'AI 피팅 시 내 얼굴·헤어로 생성됨',
                            'AI Try-On uses your face & hair'
                          )
                        : hasCandidatePortrait
                          ? tx(
                              lang,
                              '꺼짐 · 기본 아바타 톤 사용 중',
                              'OFF · Using default avatar look'
                            )
                          : tx(
                              lang,
                              '사진 올려 얼굴 반영',
                              'Upload to apply face'
                            )}
                    </small>
                  </div>
                </div>

                <div className="avatar-face-photo-controls">
                  {(hasCandidatePortrait || isFacePhotoActive || Boolean(analysisResult)) && (
                    <button
                      type="button"
                      data-reset-face-photo-btn="true"
                      className="skin-text-reset-btn"
                      onClick={handleResetFacePhoto}
                    >
                      {tx(lang, '초기화', 'Reset')}
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFacePhotoActive}
                    aria-label={tx(lang, '내 얼굴 사진 반영 ON/OFF', 'Toggle My Face Photo ON/OFF')}
                    data-face-photo-toggle="true"
                    disabled={!hasCandidatePortrait && !isFacePhotoActive}
                    className={`skin-switch-control ${isFacePhotoActive ? 'is-on' : ''}`}
                    onClick={handleToggleFacePhoto}
                  >
                    <span className="skin-switch-track" aria-hidden="true">
                      <span className="skin-switch-thumb" />
                    </span>
                    <span className="skin-switch-state-text tabular-nums">
                      {isFacePhotoActive ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Conditional Lighting Calibration Chips: ONLY shown when a photo exists */}
              {hasPhotoForLighting && (
                <div
                  className="skin-lighting-segment"
                  role="group"
                  aria-label={tx(lang, '광원 보정', 'Lighting Calibration')}
                >
                  {LIGHTING_CALIBRATION_MODES.map((m) => {
                    const labels = LIGHTING_SEGMENT_LABELS[m.key];
                    const active = lightingMode === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        data-lighting-mode={m.key}
                        aria-pressed={active}
                        className={`skin-lighting-seg-btn ${active ? 'is-active' : ''}`}
                        onClick={() => handleChangeLighting(m.key)}
                      >
                        {lang === 'en' ? labels?.en || m.shortEn : labels?.ko || m.shortKo}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* [Section 2] Collapsible Manual Skin Tone Accordion (Collapsed by default) */}
            <div ref={manualToneSectionRef} className="skin-manual-accordion">
              <button
                type="button"
                data-manual-skin-toggle="true"
                aria-expanded={manualSkinOpen}
                className="skin-manual-accordion-trigger"
                onClick={() => {
                  triggerHaptic('selection');
                  setManualSkinOpen((prev) => !prev);
                }}
              >
                <span className="skin-manual-accordion-title">
                  {tx(lang, '피부톤 직접 변경하기', 'Customize Skin Tone')}
                </span>
                <span className="skin-manual-accordion-meta">
                  <span
                    className="skin-mini-dot"
                    style={{ backgroundColor: draftHex }}
                    aria-hidden="true"
                  />
                  {manualSkinOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {manualSkinOpen && (
                <div className="skin-manual-accordion-body">
                  {/* 1. 1-Row Horizontal MST 1~10 Spectrum Bar + Top-Right Custom Color Chip */}
                  <div className="skin-manual-subhead">
                    <span>{tx(lang, '피부 밝기 스펙트럼', 'Skin Brightness Scale')}</span>
                    <label className="skin-custom-color-chip">
                      <span>{tx(lang, '직접 선택', 'Custom')}</span>
                      <input
                        type="color"
                        value={draftHex}
                        onChange={handleCustomHexChange}
                        aria-label={tx(lang, '피부톤 색상 직접 선택', 'Custom skin tone color')}
                      />
                    </label>
                  </div>

                  <div
                    className="skin-spectrum-bar"
                    role="group"
                    aria-label={tx(lang, '피부 밝기 10단계 선택', '10-Step Skin Luminance Spectrum')}
                  >
                    {MST_BASE_LEVELS.map((lvlItem) => {
                      const cellSwatch = getMstSwatch(lvlItem.level, draftMstUndertone);
                      const selected = draftMstLevel === lvlItem.level;
                      const checkStroke = isDarkSwatch(cellSwatch.hex) ? '#FFFFFF' : '#1D1D1F';
                      const tierWord =
                        HUMAN_TONE_TIERS[lvlItem.level]?.[lang === 'en' ? 'en' : 'ko'] ||
                        String(lvlItem.level);

                      return (
                        <button
                          key={lvlItem.level}
                          type="button"
                          data-mst-level={lvlItem.level}
                          aria-pressed={selected}
                          aria-label={`${tierWord} (${lvlItem.level}/10)`}
                          title={`${tierWord} (${cellSwatch.hex})`}
                          className={`skin-spectrum-dot-btn ${selected ? 'is-selected' : ''}`}
                          onClick={() => handlePickMstCell(lvlItem.level, draftMstUndertone)}
                        >
                          <span
                            className="skin-spectrum-dot-fill"
                            style={{ backgroundColor: cellSwatch.hex }}
                          >
                            {selected && (
                              <Check size={12} strokeWidth={3} color={checkStroke} aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 2. Integrated Undertone 3-Segment (웜톤 | 뉴트럴 | 쿨톤) */}
                  <div
                    className="skin-undertone-seg"
                    role="group"
                    aria-label={tx(lang, '피부 언더톤 선택', 'Skin Undertone')}
                  >
                    {UNDERTONE_SEGMENT_OPTIONS.map((ut) => {
                      const previewSwatch = getMstSwatch(draftMstLevel, ut.key);
                      const selected = draftMstUndertone === ut.key;
                      return (
                        <button
                          key={ut.key}
                          type="button"
                          data-mst-undertone={ut.key}
                          aria-pressed={selected}
                          className={`skin-undertone-seg-btn ${selected ? 'is-selected' : ''}`}
                          onClick={() => handlePickMstCell(draftMstLevel, ut.key)}
                        >
                          <span
                            className="skin-undertone-seg-dot"
                            style={{ backgroundColor: previewSwatch.hex }}
                            aria-hidden="true"
                          />
                          <span>{lang === 'en' ? ut.en : ut.ko}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 3. Crisp 4-Season Personal Color Presets (Zero Ellipsis) */}
                  <div
                    className="skin-season-preset-row"
                    role="group"
                    aria-label={tx(lang, '퍼스널 컬러 4계절 프리셋', 'Personal Color Season Presets')}
                  >
                    {SEASON_REP_PRESETS.map((item) => {
                      const preset =
                        SKIN_TONE_MANNEQUIN_PRESETS.find((p) => p.key === item.presetKey) ||
                        SKIN_TONE_MANNEQUIN_PRESETS[0];
                      const selected = draftSeason === item.season;
                      return (
                        <button
                          key={item.season}
                          type="button"
                          data-skin-preset={preset.key}
                          data-season-preset={item.season}
                          aria-pressed={selected}
                          className={`skin-season-preset-btn ${selected ? 'is-selected' : ''}`}
                          onClick={() => handlePickPreset(preset)}
                        >
                          <span
                            className="skin-season-preset-dot"
                            style={{ backgroundColor: preset.skinToneHex }}
                            aria-hidden="true"
                          />
                          <span>{lang === 'en' ? item.en : item.ko}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: Dedicated Hair & Facial Features */}
        {activeTab === 'hair' && (
          <div className="hair-face-sheet">
            {isFacePhotoActive && (
              <div className="avatar-face-photo-row" data-user-face-active="true">
                <div className="avatar-face-photo-info">
                  <img
                    src={draftFacePhotoUrl}
                    alt={tx(lang, '내 얼굴 레퍼런스', 'My face reference')}
                    className="avatar-face-photo-thumb"
                  />
                  <div className="avatar-face-photo-text">
                    <strong>
                      {tx(lang, '내 얼굴 사진 연결 중', 'Face Photo Reference Active')}
                    </strong>
                    <small>
                      {tx(
                        lang,
                        '헤어·이목구비를 미리 보려면 일시 해제할 수 있습니다',
                        'Pause photo overlay temporarily to preview stylized hair & facial proportions'
                      )}
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isFacePhotoActive}
                  aria-label={tx(
                    lang,
                    '업로드한 얼굴 사진을 아바타에 연결 전환',
                    'Toggle portrait photo attachment on avatar'
                  )}
                  data-face-photo-toggle="true"
                  className="avatar-switch-btn is-on"
                  onClick={handleToggleFacePhoto}
                >
                  {tx(lang, '연결됨', 'ON')}
                </button>
              </div>
            )}

            <HairAndFacialFeaturesControls
              lang={lang}
              draftSpec={draftSpec}
              onChangeDraftSpec={setDraftSpec}
            />
          </div>
        )}

        {/* TAB 3: Dedicated Body Profile */}
        {activeTab === 'body' && (
          <div className="body-spec-sheet">
            <InclusiveBodyMorphControls
              lang={lang}
              draftSpec={draftSpec}
              onChangeDraftSpec={setDraftSpec}
            />
          </div>
        )}
      </div>
    </ResponsiveSheetModal>
  );
}

export default function SkinToneAnalysisModal({
  open,
  initialTab = 'skin',
  lang = 'ko',
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  onApplySkinProfile,
  onApplyBodySpec,
}) {
  if (!open) {
    return (
      <ResponsiveSheetModal
        id="profile-studio-sheet"
        open={false}
        onClose={onClose}
        lang={lang}
        title={tx(lang, '프로필 · 피부톤 & 체형', 'Profile · Skin Tone & Body')}
        maxWidth={580}
      />
    );
  }

  return (
    <ProfileModalContent
      key={initialTab}
      open={open}
      initialTab={initialTab}
      lang={lang}
      onClose={onClose}
      user={user}
      skinProfile={skinProfile}
      bodySpec={bodySpec}
      theme={theme}
      onApplySkinProfile={onApplySkinProfile}
      onApplyBodySpec={onApplyBodySpec}
    />
  );
}
