import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  Loader2,
  Palette,
  RotateCcw,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  Upload,
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
  MST_UNDERTONE_OPTIONS,
  avatarSpecToLegacyBodySpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  resolveCoupledBodyMetrics,
  sanitizeAvatarSpec,
  setAvatarSpec,
} from '../services/avatarSpecStore.ts';
import { MST_BASE_LEVELS, findClosestMstFromHex, getMstSwatch } from '../services/monkSkinTone.ts';
import {
  LIGHTING_CALIBRATION_MODES,
  SEASON_BEST_SWATCHES,
  SKIN_TONE_MANNEQUIN_PRESETS,
  analyzePortraitSkinTone,
  createSyntheticSamplePortrait,
  findClosestSkinPreset,
  normalizeSeasonKey,
  translateSubTypeLabel,
} from '../services/skinToneAnalyzer.ts';
import { localizeApiMessage, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  HairAndFacialFeaturesControls,
  InclusiveBodyMorphControls,
  MstSkinToneControls,
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

function formatFriendlyMstLabel(level, undertone, lang = 'ko') {
  const utOpt =
    MST_UNDERTONE_OPTIONS.find((u) => u.key === undertone) || MST_UNDERTONE_OPTIONS[1];
  const utWord = lang === 'en' ? utOpt.shortEn : utOpt.shortKo;
  return lang === 'en' ? `Tone ${level} ${utWord}` : `${level}호 ${utWord}`;
}

function getMstBaseLevelName(level, lang = 'ko') {
  const found =
    MST_BASE_LEVELS.find((item) => item.level === Number(level)) || MST_BASE_LEVELS[3];
  return lang === 'en' ? found.labelEn : found.labelKo;
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
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSampleSource, setIsSampleSource] = useState(false);

  const fallbackGender =
    draftSpec.framePreset === 'feminine'
      ? 'female'
      : draftSpec.framePreset === 'masculine'
        ? 'male'
        : accountFallbackGender;

  const liveHash = useMemo(() => computeAvatarConfigHash(draftSpec), [draftSpec]);
  const liveBodyMetrics = useMemo(() => resolveCoupledBodyMetrics(draftSpec), [draftSpec]);
  const liveLegacyBodySpec = useMemo(
    () => avatarSpecToLegacyBodySpec(draftSpec, fallbackGender),
    [draftSpec, fallbackGender]
  );
  const resolvedMstSwatch = useMemo(
    () => getMstSwatch(draftSpec.appearance.mstLevel, draftSpec.appearance.mstUndertone),
    [draftSpec.appearance.mstLevel, draftSpec.appearance.mstUndertone]
  );

  const draftHex = draftSpec.appearance.skinToneHex;
  const draftSeason = normalizeSeasonKey(draftSpec.appearance.personalColor);

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
    setAnalyzing(true);
    setErrorMsg('');
    try {
      const [res, compactPortraitUrl] = await Promise.all([
        analyzePortraitSkinTone(imgSrc, {
          lightingMode: nextLighting,
          focusPoint,
        }),
        isUserUpload ? downscaleUserPortrait(imgSrc) : Promise.resolve(null),
      ]);
      setAnalysisResult(res);
      setDraftSubType(res.subTypeLabelKo);
      setDraftPresetKey(res.matchedPresetKey);

      const autoMst = findClosestMstFromHex(res.skinToneHex);
      const syncedMstLevel = res.mstLevel ?? autoMst.level;
      const syncedMstUndertone = res.mstUndertone ?? autoMst.undertone;

      setDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          appearance: {
            ...prev.appearance,
            mstLevel: syncedMstLevel,
            mstUndertone: syncedMstUndertone,
            skinToneHex: res.skinToneHex,
            personalColor: res.personalColor,
            facePhotoUrl: isUserUpload
              ? compactPortraitUrl || res.previewDataUrl || imgSrc
              : prev.appearance.facePhotoUrl,
          },
        })
      );
      triggerHaptic('light');
    } catch (err) {
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
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');

    if (file.type && !file.type.startsWith('image/')) {
      setAnalyzing(false);
      setAnalysisResult(null);
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
      setAnalyzing(false);
      setAnalysisResult(null);
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
      void runAnalysis(dataUrl, lightingMode, undefined, { isUserUpload: true });
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
    void runAnalysis(sampleUrl, lightingMode, undefined, { isUserUpload: false });
  };

  const handleResetFacePhoto = () => {
    triggerHaptic('selection');
    setIsSampleSource(false);
    setSourceImageUrl('');
    setAnalysisResult(null);
    setErrorMsg('');
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

  const handleToggleFacePhoto = () => {
    const candidate =
      analysisResult?.previewDataUrl || sourceImageUrl || draftSpec.appearance.facePhotoUrl || '';
    const attached = Boolean(draftSpec.appearance.facePhotoUrl);
    if (!candidate && !attached) return;
    triggerHaptic('selection');
    setDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          facePhotoUrl: attached ? null : candidate,
        },
      })
    );
  };

  const handleJumpToManualSkinTone = () => {
    triggerHaptic('selection');
    const target = manualToneSectionRef.current;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstFocusable = target.querySelector('button, input');
      if (firstFocusable instanceof HTMLElement) {
        firstFocusable.focus({ preventScroll: true });
      }
    }
  };

  const handleChangeLighting = (nextMode) => {
    triggerHaptic('selection');
    setLightingMode(nextMode);
    const activeTargetUrl = sourceImageUrl || draftSpec.appearance.facePhotoUrl;
    if (activeTargetUrl) {
      void runAnalysis(activeTargetUrl, nextMode, undefined, {
        isUserUpload: !isSampleSource && Boolean(draftSpec.appearance.facePhotoUrl),
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
      { isUserUpload: !isSampleSource && Boolean(draftSpec.appearance.facePhotoUrl) }
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

  const handleCustomHexChange = (e) => {
    const hex = String(e.target.value || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) return;
    const closest = findClosestSkinPreset(hex, draftSeason);
    const mst = findClosestMstFromHex(hex);
    setDraftPresetKey(closest.key);
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

  const handleSelectMstSwatch = (swatch) => {
    const closest = findClosestSkinPreset(swatch.hex, swatch.personalColor);
    setDraftPresetKey(closest.key);
    setDraftSubType(closest.subTypeLabelKo);
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
  const localizedSubType =
    lang === 'en'
      ? translateSubTypeLabel(draftSubType, draftSeason)
      : draftSubType;
  const localizedSeasonLabel =
    lang === 'en' ? activeSeasonMeta.labelEn : activeSeasonMeta.labelKo;
  const friendlyToneLabel = formatFriendlyMstLabel(
    draftSpec.appearance.mstLevel,
    draftSpec.appearance.mstUndertone,
    lang
  );
  const baseLevelName = getMstBaseLevelName(draftSpec.appearance.mstLevel, lang);
  const unifiedToneBadgeLabel = `${localizedSubType} · ${friendlyToneLabel}`;

  const activeAngleMeta =
    ISO_VIEW_ANGLE_OPTIONS.find((item) => item.angleDeg === previewAngleDeg) ||
    ISO_VIEW_ANGLE_OPTIONS[0];
  const localizedAngleLabel =
    lang === 'en' ? activeAngleMeta.labelEn : activeAngleMeta.labelKo;

  const previewSkinProfile = useMemo(
    () => ({
      skinToneHex: draftHex,
      personalColor: draftSeason,
      mstLevel: draftSpec.appearance.mstLevel,
      mstUndertone: draftSpec.appearance.mstUndertone,
      mstCode: resolvedMstSwatch.code,
      portraitDataUrl: draftSpec.appearance.facePhotoUrl,
    }),
    [
      draftHex,
      draftSeason,
      draftSpec.appearance.mstLevel,
      draftSpec.appearance.mstUndertone,
      draftSpec.appearance.facePhotoUrl,
      resolvedMstSwatch.code,
    ]
  );

  // Portrait & Face Analysis derived states
  const portraitCandidateUrl =
    analysisResult?.previewDataUrl || sourceImageUrl || draftSpec.appearance.facePhotoUrl || '';
  const hasPhotoForAnalysis = Boolean(portraitCandidateUrl);
  const isFacePhotoAttached = Boolean(draftSpec.appearance.facePhotoUrl);
  const showFaceNotDetectedWarning =
    !analyzing &&
    !errorMsg &&
    !isSampleSource &&
    Boolean(analysisResult) &&
    !analysisResult.faceDetected;

  // Derived labels for Tab 2 & Tab 3 compact summaries
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
        {/* 3-Way Segmented Navigation (Sticky, Immediately Visible, No Dropdown) */}
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
                setActiveTab('body');
              }}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
            </button>
          </div>
        </div>

        {/* Context-Focused Live Character Preview & Tab-Specific Summary */}
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
                personReferenceUrl={draftSpec.appearance.facePhotoUrl}
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
                {localizedAngleLabel}
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

            {/* Body anthropometrics displayed ONLY in the Body Profile tab */}
            {activeTab === 'body' && (
              <span className="body-spec-account-badge tabular-nums">
                {draftSpec.anthropometrics.heightCm}cm · {draftSpec.anthropometrics.weightKg}kg · BMI{' '}
                {liveBodyMetrics.bmi.toFixed(1)}
              </span>
            )}
          </div>

          <div className="skin-modal-summary-box">
            {/* Silent internal avatar hash anchor for telemetry without visual noise */}
            <span
              className="avatar-config-hash-badge"
              data-avatar-config-hash={liveHash}
              aria-hidden="true"
              hidden
            />

            {activeTab === 'skin' && (
              <>
                {analysisResult?.previewDataUrl && !analyzing && !errorMsg ? (
                  <>
                    <div
                      className="skin-portrait-pin-frame is-clickable"
                      onClick={handlePreviewTapFocus}
                      title={tx(
                        lang,
                        '얼굴 영역을 탭하여 분석 위치를 미세 조정할 수 있습니다',
                        'Tap the face area to re-center skin sampling'
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
                      {analysisResult.pins.map((pin) => (
                        <span
                          key={pin.id}
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
                      {tx(
                        lang,
                        '사진 속 얼굴 부위를 탭하면 해당 피부톤으로 다시 잡습니다',
                        'Tap directly on the face to refine skin sampling'
                      )}
                    </span>

                    <div className="skin-lab-metrics tabular-nums">
                      <span>
                        {tx(lang, '추출 피부톤', 'Extracted')} <strong>{analysisResult.skinToneHex}</strong>
                      </span>
                      <span>
                        L* {analysisResult.lab.L} · a* {analysisResult.lab.a} · b* {analysisResult.lab.b}
                      </span>
                      <span>
                        ITA° {analysisResult.lab.itaDeg}° · {tx(lang, '신뢰도', 'Confidence')}{' '}
                        {analysisResult.confidence}%
                      </span>
                    </div>

                    <div className="skin-unified-tone-pill">
                      <span
                        className="skin-unified-tone-dot"
                        style={{ backgroundColor: draftHex }}
                        aria-hidden="true"
                      />
                      <strong>{unifiedToneBadgeLabel}</strong>
                    </div>
                  </>
                ) : (
                  <div className="skin-tone-hero-badge">
                    <span
                      className="skin-tone-large-swatch"
                      style={{ backgroundColor: draftHex }}
                      aria-hidden="true"
                    />
                    <div className="skin-tone-hero-text">
                      <strong className="skin-tone-diagnosis-title">
                        {unifiedToneBadgeLabel}
                      </strong>
                      <span className="skin-tone-hex-code tabular-nums">
                        {localizedSeasonLabel} · {baseLevelName} · {draftHex}
                      </span>
                    </div>
                  </div>
                )}

                <div
                  className="skin-best-drape-row"
                  aria-label={tx(lang, '베스트 매칭 컬러', 'Best Matching Colors')}
                >
                  {activeSeasonMeta.colors.map((sw) => (
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
                    '헤어스타일, 컬러 및 이목구비 비율은 AI 피팅 아바타의 외형 생성에 즉시 반영됩니다.',
                    'Hairstyle, color, and facial proportions sync directly with your AI Try-On avatar.'
                  )}
                </p>
              </div>
            )}

            {activeTab === 'body' && (
              <div className="studio-tab-summary-card">
                <div className="studio-summary-headline-group">
                  <strong className="skin-tone-diagnosis-title">
                    {lang === 'en' ? activeFrameMeta.labelEn : activeFrameMeta.labelKo} ·{' '}
                    {lang === 'en' ? activeArchetypeMeta.shortEn : activeArchetypeMeta.shortKo}
                  </strong>
                  <span className="skin-tone-hex-code">
                    {tx(lang, '가슴 윤곽', 'Chest')} · {activeChestFormLabel}
                  </span>
                </div>
                <div className="studio-summary-metrics-strip tabular-nums">
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '어깨', 'Shoulder')}{' '}
                    {Math.round(draftSpec.anthropometrics.shoulderScale * 100)}%
                  </span>
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '허리', 'Waist')}{' '}
                    {Math.round(draftSpec.anthropometrics.waistScale * 100)}%
                  </span>
                  <span className="studio-summary-metric-pill">
                    {tx(lang, '힙', 'Hip')}{' '}
                    {Math.round(draftSpec.anthropometrics.hipScale * 100)}%
                  </span>
                </div>
                <p className="avatar-studio-hint">
                  {lang === 'en' ? activeArchetypeMeta.descEn : activeArchetypeMeta.descKo}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: Photo & Skin Tone */}
        {activeTab === 'skin' && (
          <>
            {/* Section 1: Face Photo Analysis with Empty / Loading / Error & Recovery States */}
            <div className="skin-modal-section">
              <div className="skin-modal-section-head">
                <span>{tx(lang, '얼굴 사진 분석', 'Face Photo Analysis')}</span>
                {analyzing && (
                  <span className="skin-analyzing-tag">
                    {tx(lang, '분석 중...', 'Analyzing...')}
                  </span>
                )}
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
                  className="hig-secondary-btn"
                  onClick={handleOpenGallery}
                  disabled={analyzing}
                >
                  <Upload size={16} aria-hidden="true" />
                  <span>{tx(lang, '사진 업로드', 'Upload Photo')}</span>
                </button>
                <button
                  type="button"
                  className="hig-secondary-btn"
                  onClick={handleOpenCamera}
                  disabled={analyzing}
                >
                  <Camera size={16} aria-hidden="true" />
                  <span>{tx(lang, '카메라 촬영', 'Camera')}</span>
                </button>
              </div>

              {/* Exception State 1: Loading */}
              {analyzing && (
                <div
                  className="skin-analysis-state-card is-loading"
                  data-face-analysis-state="loading"
                  role="status"
                  aria-live="polite"
                >
                  <div className="skin-loading-row">
                    <Loader2 size={22} className="skin-spin-icon" aria-hidden="true" />
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
                    <AlertTriangle size={20} className="skin-state-icon-danger" aria-hidden="true" />
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
                      <RotateCcw size={15} aria-hidden="true" />
                      <span>{tx(lang, '다른 사진 다시 선택', 'Choose Another Photo')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleJumpToManualSkinTone}
                    >
                      <Palette size={15} aria-hidden="true" />
                      <span>{tx(lang, '수동 피부톤 선택으로 이동', 'Select Skin Tone Manually')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Loaded Portrait Banner (with Active Toggle & Reset) */}
              {!analyzing && !errorMsg && hasPhotoForAnalysis && (
                <div
                  className="avatar-face-photo-row"
                  data-user-face-active={isFacePhotoAttached ? 'true' : undefined}
                >
                  <div className="avatar-face-photo-info">
                    <img
                      src={draftSpec.appearance.facePhotoUrl || portraitCandidateUrl}
                      alt={tx(lang, '내 얼굴 레퍼런스', 'My face reference')}
                      className="avatar-face-photo-thumb"
                    />
                    <div className="avatar-face-photo-text">
                      <strong>
                        {isFacePhotoAttached
                          ? tx(lang, '내 얼굴 사진 반영 ON', 'My Face Photo Active')
                          : tx(lang, '얼굴 사진 분석 완료 (일러스트 모드)', 'Portrait Analyzed (Stylized Mode)')}
                      </strong>
                      <small>
                        {isFacePhotoAttached
                          ? tx(
                              lang,
                              'AI 피팅 시 업로드한 본인 얼굴·헤어로 생성됩니다',
                              'AI Try-On uses your uploaded face & hair likeness'
                            )
                          : tx(
                              lang,
                              '피부톤만 추출되었으며 아바타는 일러스트로 표시됩니다',
                              'Extracted tone applied; avatar uses stylized features'
                            )}
                      </small>
                    </div>
                  </div>
                  <div className="avatar-face-photo-actions">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isFacePhotoAttached}
                      aria-label={tx(
                        lang,
                        '업로드한 얼굴 사진을 아바타에 연결 전환',
                        'Toggle portrait photo attachment on avatar'
                      )}
                      data-face-photo-toggle="true"
                      className={`avatar-switch-btn ${isFacePhotoAttached ? 'is-on' : ''}`}
                      onClick={handleToggleFacePhoto}
                    >
                      {isFacePhotoAttached ? tx(lang, '연결됨', 'ON') : tx(lang, '해제', 'OFF')}
                    </button>
                    <button
                      type="button"
                      data-reset-face-photo-btn="true"
                      className="avatar-switch-btn"
                      onClick={handleResetFacePhoto}
                    >
                      {tx(lang, '초기화', 'Reset')}
                    </button>
                  </div>
                </div>
              )}

              {/* Soft Face-Not-Detected Error/Warning & Recovery State */}
              {showFaceNotDetectedWarning && (
                <div
                  className="skin-analysis-state-card is-warning"
                  data-face-analysis-state="error"
                  role="status"
                >
                  <div className="skin-state-header">
                    <AlertCircle size={19} className="skin-state-icon-warning" aria-hidden="true" />
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
                          '어두운 역광, 측면 각도, 또는 얼굴이 가려진 사진일 수 있습니다. 프리뷰의 얼굴 위치를 직접 탭하거나 아래 버튼으로 다시 선택해 주세요.',
                          'Backlighting, side angles, or partial occlusion can limit detection. Tap directly on the preview face or choose a recovery option below.'
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
                      <RotateCcw size={15} aria-hidden="true" />
                      <span>{tx(lang, '다른 사진 다시 선택', 'Choose Another Photo')}</span>
                    </button>
                    <button
                      type="button"
                      className="hig-secondary-btn skin-recovery-btn"
                      onClick={handleJumpToManualSkinTone}
                    >
                      <Palette size={15} aria-hidden="true" />
                      <span>{tx(lang, '수동 피부톤 선택으로 이동', 'Select Skin Tone Manually')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Exception State 3: Empty (No Photo Registered) */}
              {!analyzing && !errorMsg && !hasPhotoForAnalysis && (
                <div
                  className="skin-analysis-state-card is-empty"
                  data-face-analysis-state="empty"
                >
                  <div className="skin-empty-illustration" aria-hidden="true">
                    <ScanFace size={26} />
                  </div>
                  <div className="skin-state-copy">
                    <strong>
                      {tx(lang, '등록된 얼굴 사진이 없어요', 'No face photo uploaded yet')}
                    </strong>
                    <p className="skin-empty-desc">
                      {tx(
                        lang,
                        '정면 얼굴 사진을 업로드하면 자연광 기준으로 4개 부위의 피부톤과 퍼스널 컬러를 자동 추출해 드립니다. 사진 없이 아래 프리셋으로 바로 선택할 수도 있어요.',
                        'Upload a front-facing portrait to extract calibrated skin tone and personal color automatically, or choose a preset manually below.'
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Sample Portrait Quick Trial Rail */}
              <div className="skin-sample-group">
                <span className="skin-sample-rail-label">
                  {tx(lang, '샘플 얼굴로 체험', 'Try sample portrait')}
                </span>
                <div className="skin-sample-test-rail">
                  {SAMPLE_PORTRAIT_BUTTONS.map((btn) => (
                    <button
                      key={btn.key}
                      type="button"
                      data-sample-portrait={btn.key}
                      className="skin-sample-chip"
                      onClick={() => handleSelectSamplePortrait(btn.key)}
                    >
                      <Sparkles size={14} aria-hidden="true" />
                      <span>{lang === 'en' ? btn.en : btn.ko}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional Lighting Calibration Bar — Hidden unless a photo is uploaded or loaded */}
              {hasPhotoForAnalysis && (
                <div className="skin-lighting-bar-wrap">
                  <span className="skin-sample-rail-label">
                    {tx(lang, '촬영 조명 보정', 'Lighting Calibration')}
                  </span>
                  <div className="hig-pill-rail" style={{ marginBottom: 0 }}>
                    {LIGHTING_CALIBRATION_MODES.map((m) => {
                      const active = lightingMode === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          aria-pressed={active}
                          className={`hig-filter-pill ${active ? 'active' : ''}`}
                          onClick={() => handleChangeLighting(m.key)}
                        >
                          {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                          <span>{lang === 'en' ? m.shortEn : m.shortKo}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Wide 2-Column Skin Tone Presets + Custom Picker */}
            <div
              ref={manualToneSectionRef}
              tabIndex={-1}
              className="skin-modal-section"
              aria-label={tx(lang, '수동 피부톤 프리셋 선택', 'Manual Skin Tone Preset Selection')}
            >
              <div className="skin-modal-section-head">
                <span>{tx(lang, '피부톤 프리셋', 'Skin Tone Presets')}</span>
                <label className="skin-custom-color-label">
                  <span>{tx(lang, '직접 선택', 'Custom')}</span>
                  <input
                    type="color"
                    value={draftHex}
                    onChange={handleCustomHexChange}
                    aria-label={tx(lang, '피부톤 색상 미세조정', 'Custom skin tone color')}
                  />
                </label>
              </div>

              <div className="skin-preset-grid">
                {SKIN_TONE_MANNEQUIN_PRESETS.map((preset) => {
                  const selected =
                    draftPresetKey === preset.key && draftHex === preset.skinToneHex;
                  const checkStroke = isDarkSwatch(preset.skinToneHex) ? '#FFFFFF' : '#1D1D1F';
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      data-skin-preset={preset.key}
                      aria-pressed={selected}
                      className={`skin-preset-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => handlePickPreset(preset)}
                    >
                      <span
                        className="skin-preset-swatch"
                        style={{ backgroundColor: preset.skinToneHex }}
                      >
                        {selected && (
                          <Check size={14} strokeWidth={3} color={checkStroke} aria-hidden="true" />
                        )}
                      </span>
                      <div className="skin-preset-meta">
                        <strong>{lang === 'en' ? preset.shortEn : preset.shortKo}</strong>
                        <small>
                          {lang === 'en' ? preset.subTypeLabelEn : preset.subTypeLabelKo}
                        </small>
                      </div>
                      {selected && (
                        <span className="skin-preset-selected-check" aria-hidden="true">
                          <Check size={15} strokeWidth={2.8} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Cleanly Separated Monk 1–10 Scale + 4 Undertone Direct Controls */}
            <div className="skin-modal-section">
              <MstSkinToneControls
                lang={lang}
                draftSpec={draftSpec}
                onChangeDraftSpec={setDraftSpec}
                onSelectMstSwatch={handleSelectMstSwatch}
              />
            </div>
          </>
        )}

        {/* TAB 2: Dedicated Hair & Facial Features */}
        {activeTab === 'hair' && (
          <div className="hair-face-sheet">
            {isFacePhotoAttached && (
              <div className="avatar-face-photo-row" data-user-face-active="true">
                <div className="avatar-face-photo-info">
                  <img
                    src={draftSpec.appearance.facePhotoUrl}
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
                        '일러스트로 헤어·이목구비를 미리 보려면 일시 해제할 수 있습니다',
                        'Pause photo overlay temporarily to preview stylized hair & facial proportions'
                      )}
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isFacePhotoAttached}
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
