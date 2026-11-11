import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  Info,
  Palette,
  RefreshCw,
  RotateCcw,
  ScanFace,
  Sun,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import {
  BODY_SHAPE_OPTIONS,
  resolveAnatomicalProfile,
  suggestBodyShapeFromMetrics,
} from '../utils/bodyAnthropometrics.js';
import * as faceLandmarkMod from '../utils/faceLandmarkEngine.js';
import {
  LIGHTING_MODES,
  PCCS_12_TONES,
  PCCS_GRAYSCALE_BAR,
  PERSONAL_COLOR_DETAILS,
  PERSONAL_COLOR_SUBTYPES,
  analyzePersonalColorFromImage,
} from '../utils/imageTools.js';
import {
  emitStatusCapsule,
  hasBiometricConsent,
  pushBackHandler,
} from '../utils/nativeBridge.js';
import PortraitCropAndPinEditorModal from './PortraitCropAndPinEditorModal.jsx';
import { Mannequin3DBodyPreview } from './VirtualMannequin.jsx';
import { BiometricConsentModal } from './common/AppUI.jsx';

const AGE_GROUP_OPTIONS = [
  { value: 'unspecified', label: '입력하지 않음 (기본 30대 통계 적용)' },
  { value: 'under_10', label: '10대 미만 (0~9세)' },
  { value: '10s', label: '10대 (10~19세)' },
  { value: '20s', label: '20대 (20~29세)' },
  { value: '30s', label: '30대 (30~39세)' },
  { value: '40s', label: '40대 (40~49세)' },
  { value: '50s', label: '50대 (50~59세)' },
  { value: '60s', label: '60대 (60~69세)' },
  { value: '70s', label: '70대 (70~79세)' },
  { value: '80s', label: '80대 (80~89세)' },
  { value: '90s_plus', label: '90대 이상 (90세+)' },
];

// Generate a synthetic portrait data URL for quick 1-click personal color testing (pure 2D canvas, zero WASM)
function createSampleFaceDataUrl(tone = 'spring_warm') {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 320;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#EAE6DF';
  ctx.fillRect(0, 0, 320, 320);

  const skinMap = {
    spring_warm: { base: '#F4D5BE', cheek: '#F0B59E', hair: '#5A3E2B', shirt: '#FF9E91' },
    summer_cool: { base: '#F0D6D4', cheek: '#E2B8C4', hair: '#3B3742', shirt: '#9AC0E6' },
    autumn_warm: { base: '#DDB798', cheek: '#C99878', hair: '#3A2618', shirt: '#C67B5C' },
    winter_cool: { base: '#E2C4C2', cheek: '#C9A4A8', hair: '#1B1C22', shirt: '#4A3059' },
  };
  const pal = skinMap[tone] || skinMap.spring_warm;

  // Shoulders / top
  ctx.fillStyle = pal.shirt;
  ctx.beginPath();
  ctx.ellipse(160, 305, 115, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair silhouette
  ctx.fillStyle = pal.hair;
  ctx.beginPath();
  ctx.ellipse(160, 148, 88, 106, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face oval
  ctx.fillStyle = pal.base;
  ctx.beginPath();
  ctx.ellipse(160, 168, 74, 94, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheeks
  ctx.fillStyle = pal.cheek;
  ctx.beginPath();
  ctx.arc(118, 178, 22, 0, Math.PI * 2);
  ctx.arc(202, 178, 22, 0, Math.PI * 2);
  ctx.fill();

  // Eyes & Brows
  ctx.fillStyle = '#1D1D1F';
  ctx.beginPath();
  ctx.arc(128, 148, 6, 0, Math.PI * 2);
  ctx.arc(192, 148, 6, 0, Math.PI * 2);
  ctx.fill();

  return c.toDataURL('image/jpeg', 0.92);
}

export default function ProfilePersonalColorModal({
  open,
  user,
  initialStep = 1,
  onCompleted,
  onLiveUpdateUser,
  onClose,
  allowDismiss = true,
}) {
  const fileInputRef = useRef(null);
  const mobileCameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const openRef = useRef(open);
  const mountedRef = useRef(true);
  const streamReqIdRef = useRef(0);

  openRef.current = open;

  const [step, setStep] = useState(initialStep || 1);
  const [ageGroup, setAgeGroup] = useState(user?.ageGroup || '30s');
  const [age, setAge] = useState(user?.age ?? 33);
  const [heightCm, setHeightCm] = useState(user?.heightCm ?? 174);
  const [weightKg, setWeightKg] = useState(user?.weightKg ?? 68);
  const [gender, setGender] = useState(user?.gender || 'male');

  // 7 Body Shapes + 3-Sizes / Head / Body-Fat
  const [bodyShape, setBodyShape] = useState(user?.bodyShape || 'standard_balanced');
  const [bodyFatPct, setBodyFatPct] = useState(user?.bodyFatPct ?? '');
  const [chestCm, setChestCm] = useState(user?.chestCm ?? '');
  const [waistCm, setWaistCm] = useState(user?.waistCm ?? '');
  const [hipCm, setHipCm] = useState(user?.hipCm ?? '');
  const [headCm, setHeadCm] = useState(user?.headCm ?? '');
  const [previewRotDeg, setPreviewRotDeg] = useState(-16);
  const [regenerateWardrobe, setRegenerateWardrobe] = useState(false);

  // Step 2: Personal Color & Camera / Photo State
  const [portraitDataUrl, setPortraitDataUrl] = useState('');
  const [rawPortraitSourceUrl, setRawPortraitSourceUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' | 'environment'
  const [cameraError, setCameraError] = useState('');

  const [lightingMode, setLightingMode] = useState('auto_d65');
  const [pendingLightingMode, setPendingLightingMode] = useState(null);
  const [reanalyzingPct, setReanalyzingPct] = useState(null);
  const [customPins, setCustomPins] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [cropRect, setCropRect] = useState(null);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [highlightedPinId, setHighlightedPinId] = useState('forehead');

  const [pcResult, setPcResult] = useState(null);
  const [selectedPersonalColor, setSelectedPersonalColor] = useState(
    user?.personalColor || 'spring_warm'
  );
  const [selectedSubTypeKey, setSelectedSubTypeKey] = useState(
    PERSONAL_COLOR_DETAILS[user?.personalColor]?.defaultSubTypeKey || 'spring_light'
  );
  const [selectedPccsToneKey, setSelectedPccsToneKey] = useState('light');
  const [chartToneFamily, setChartToneFamily] = useState('WARM TONE');

  // 3D Mannequin Color Mode: 'personal_color' | 'skin_tone'
  const [mannequinColorMode, setMannequinColorMode] = useState('personal_color');
  const [customMannequinHex, setCustomMannequinHex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingBiometricAction, setPendingBiometricAction] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (open && initialStep) {
      setStep(initialStep);
    }
  }, [open, initialStep]);

  // Stop camera stream cleanly and invalidate any in-flight getUserMedia promise
  const stopCameraStream = useCallback(() => {
    streamReqIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Dispose camera tracks & WASM FaceLandmarker on modal close or unmount
  useEffect(() => {
    if (!open) {
      stopCameraStream();
      faceLandmarkMod.disposeFaceLandmarker?.();
    }
    return () => {
      stopCameraStream();
      faceLandmarkMod.disposeFaceLandmarker?.();
    };
  }, [open, stopCameraStream]);

  // Hardware back stack & Escape dismissal when top-level modal is open
  useEffect(() => {
    if (!open || !allowDismiss || pinEditorOpen || Boolean(pendingBiometricAction)) {
      return undefined;
    }
    const popBack = pushBackHandler(() => {
      onClose?.();
      return true;
    });
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      popBack();
    };
  }, [open, allowDismiss, pinEditorOpen, pendingBiometricAction, onClose]);

  const startCameraStream = async (facing = cameraFacing) => {
    setCameraError('');
    stopCameraStream();
    const reqId = ++streamReqIdRef.current;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        '현재 브라우저 접속 주소(HTTP)에서는 실시간 웹캠 스트림이 제한되어 모바일/PC 기본 카메라 촬영창을 엽니다.'
      );
      mobileCameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 720 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      if (!mountedRef.current || !openRef.current || reqId !== streamReqIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraFacing(facing);
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (!mountedRef.current || !openRef.current || streamRef.current !== stream) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      if (!mountedRef.current || !openRef.current) return;
      setCameraError(
        '카메라 권한이 거부되었거나 사용할 수 없어 사진 촬영/선택 창으로 연결합니다.'
      );
      mobileCameraInputRef.current?.click();
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    startCameraStream(nextFacing);
  };

  const activeSubType =
    PERSONAL_COLOR_SUBTYPES[selectedSubTypeKey] || PERSONAL_COLOR_SUBTYPES.spring_light;
  const activePccsTone =
    PCCS_12_TONES.find((t) => t.key === selectedPccsToneKey) || PCCS_12_TONES[1];

  // Compute the exact hex applied to the 3D Mannequin Modeling ("위의 3D모델링")
  const activeMannequinColorHex = useMemo(() => {
    if (customMannequinHex) return customMannequinHex;
    if (mannequinColorMode === 'personal_color') {
      return activeSubType.mannequinModelColorHex || activeSubType.bubbleHex || '#F6B09E';
    }
    return pcResult?.skinToneHex || user?.skinToneHex || '#E6C6AE';
  }, [customMannequinHex, mannequinColorMode, activeSubType, pcResult, user]);

  const activeBriefsColorHex = useMemo(() => {
    if (mannequinColorMode === 'personal_color') {
      return activeSubType.mannequinBriefsColorHex || '#1D1D1F';
    }
    return '#1D1D1F';
  }, [mannequinColorMode, activeSubType]);

  // Resolved anatomical profile with live defaults vs user overrides
  const resolvedAnat = useMemo(
    () =>
      resolveAnatomicalProfile({
        gender,
        height_cm: heightCm,
        weight_kg: weightKg,
        body_shape: bodyShape,
        body_fat_pct: bodyFatPct,
        chest_cm: chestCm,
        waist_cm: waistCm,
        hip_cm: hipCm,
        head_cm: headCm,
      }),
    [gender, heightCm, weightKg, bodyShape, bodyFatPct, chestCm, waistCm, hipCm, headCm]
  );

  // Live faceless 3D mannequin profile
  const livePreviewProfile = useMemo(
    () => ({
      gender,
      height_cm: heightCm,
      weight_kg: weightKg,
      body_shape: bodyShape,
      body_fat_pct: bodyFatPct,
      chest_cm: chestCm,
      waist_cm: waistCm,
      hip_cm: hipCm,
      head_cm: headCm,
      personal_color: selectedPersonalColor,
      personalColorSubtype: selectedSubTypeKey,
      skin_tone_hex: activeMannequinColorHex,
      mannequinModelColorHex: activeMannequinColorHex,
      mannequinBriefsColorHex: activeBriefsColorHex,
    }),
    [
      gender,
      heightCm,
      weightKg,
      bodyShape,
      bodyFatPct,
      chestCm,
      waistCm,
      hipCm,
      headCm,
      selectedPersonalColor,
      selectedSubTypeKey,
      activeMannequinColorHex,
      activeBriefsColorHex,
    ]
  );

  // Sync live changes to parent App so the main 3D Fitting Studio also updates immediately
  useEffect(() => {
    if (!open) return;
    onLiveUpdateUser?.({
      ageGroup,
      age: Number(age) || 33,
      heightCm: Number(heightCm) || 174,
      weightKg: Number(weightKg) || 68,
      gender,
      bodyShape,
      bodyShapeShortKo: resolvedAnat.shapeShortKo,
      bodyShapeLabelKo: resolvedAnat.shapeLabelKo,
      bodyFatPct: bodyFatPct === '' ? null : Number(bodyFatPct),
      chestCm: chestCm === '' ? null : Number(chestCm),
      waistCm: waistCm === '' ? null : Number(waistCm),
      hipCm: hipCm === '' ? null : Number(hipCm),
      headCm: headCm === '' ? null : Number(headCm),
      personalColor: selectedPersonalColor,
      personalColorSubtype: selectedSubTypeKey,
      personalColorLabelKo: activeSubType.labelKo,
      skinToneHex: activeMannequinColorHex,
      mannequinModelColorHex: activeMannequinColorHex,
      mannequinBriefsColorHex: activeBriefsColorHex,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    bodyShape,
    heightCm,
    weightKg,
    gender,
    bodyFatPct,
    chestCm,
    waistCm,
    hipCm,
    headCm,
    selectedPersonalColor,
    selectedSubTypeKey,
    activeMannequinColorHex,
    activeBriefsColorHex,
  ]);

  const executePersonalColorAnalysis = async (
    imgUrl,
    mode = lightingMode,
    pins = customPins,
    rot = rotationDeg,
    crop = cropRect
  ) => {
    if (!imgUrl) return;
    if (!hasBiometricConsent()) {
      setPendingBiometricAction({
        type: 'analyze',
        imgUrl,
        mode,
        pins,
        rot,
        crop,
      });
      return;
    }

    try {
      let resolvedPins = Array.isArray(pins) && pins.length === 4 ? pins : null;
      if (!resolvedPins) {
        try {
          const landmarkRes = await faceLandmarkMod.detectFaceAndSkinPins(imgUrl, {
            rotationDeg: rot,
            cropRect: crop,
          });
          if (Array.isArray(landmarkRes?.pins) && landmarkRes.pins.length === 4) {
            resolvedPins = landmarkRes.pins;
          }
        } catch {
          resolvedPins = faceLandmarkMod.DEFAULT_SKIN_PINS || null;
        }
      }

      const res = await analyzePersonalColorFromImage(imgUrl, {
        lightingMode: mode,
        customPins: resolvedPins,
        rotationDeg: rot,
        cropRect: crop,
      });
      if (!mountedRef.current || !openRef.current) return;
      setPcResult(res);
      if (res?.personalColor) {
        setSelectedPersonalColor(res.personalColor);
      }
      if (res?.subTypeKey) {
        setSelectedSubTypeKey(res.subTypeKey);
      }
      if (res?.pccsToneKey) {
        setSelectedPccsToneKey(res.pccsToneKey);
      }
      if (res?.toneFamily) {
        setChartToneFamily(res.toneFamily);
      }
      setCustomMannequinHex(null);
      setMannequinColorMode('personal_color');
    } catch (err) {
      emitStatusCapsule(err?.message || '퍼스널컬러 측정 중 오류가 발생했습니다');
    }
  };

  // Initialize default synthetic portrait image on open WITHOUT booting WASM before biometric consent
  useEffect(() => {
    if (open && !portraitDataUrl) {
      const sampleUrl = createSampleFaceDataUrl(user?.personalColor || 'spring_warm');
      if (sampleUrl) {
        setPortraitDataUrl(sampleUrl);
      }
    }
  }, [open, portraitDataUrl, user?.personalColor]);

  // Only auto-analyze when user is on Step 2 AND has already granted explicit biometric consent
  useEffect(() => {
    if (open && step === 2 && portraitDataUrl && !pcResult && hasBiometricConsent()) {
      executePersonalColorAnalysis(portraitDataUrl, lightingMode, null, 0, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, portraitDataUrl]);

  if (!open) return null;

  const handleSelectBodyShape = (nextShapeKey) => {
    setBodyShape(nextShapeKey);
    setBodyFatPct('');
    setChestCm('');
    setWaistCm('');
    setHipCm('');
  };

  const handleRecommendBodyShape = () => {
    const rec = suggestBodyShapeFromMetrics({
      heightCm,
      weightKg,
      gender,
      bodyFatPct,
      chestCm,
      waistCm,
      hipCm,
    });
    handleSelectBodyShape(rec);
  };

  const handleResetMeasurementsToDefault = () => {
    setBodyFatPct('');
    setChestCm('');
    setWaistCm('');
    setHipCm('');
    setHeadCm('');
  };

  const handlePortraitUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCameraStream();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setRawPortraitSourceUrl(dataUrl);
      setPortraitDataUrl(dataUrl);
      setCustomPins(null);
      setRotationDeg(0);
      setCropRect(null);
      setPinEditorOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Capture full camera frame from live <video> or diagnose existing portrait (called after consent check)
  const performShutterOrDiagnose = () => {
    if (cameraActive && videoRef.current && videoRef.current.videoWidth > 0) {
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      const scale = Math.min(1, 960 / Math.max(vw, vh));
      const cw = Math.max(240, Math.round(vw * scale));
      const ch = Math.max(240, Math.round(vh * scale));

      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      if (!ctx) {
        emitStatusCapsule('카메라 캔버스를 초기화할 수 없습니다');
        return;
      }
      if (cameraFacing === 'user') {
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0, vw, vh, 0, 0, cw, ch);
      const capturedUrl = c.toDataURL('image/jpeg', 0.92);
      stopCameraStream();
      setRawPortraitSourceUrl(capturedUrl);
      setPortraitDataUrl(capturedUrl);
      setCustomPins(null);
      setRotationDeg(0);
      setCropRect(null);
      setPinEditorOpen(true);
    } else if (!cameraActive && portraitDataUrl) {
      setReanalyzingPct(20);
      setTimeout(() => {
        if (mountedRef.current) setReanalyzingPct(65);
      }, 90);
      setTimeout(() => {
        if (!mountedRef.current) return;
        setReanalyzingPct(100);
        executePersonalColorAnalysis(
          portraitDataUrl,
          lightingMode,
          customPins,
          rotationDeg,
          cropRect
        ).finally(() => {
          setTimeout(() => {
            if (mountedRef.current) setReanalyzingPct(null);
          }, 220);
        });
      }, 180);
    } else {
      startCameraStream('user');
    }
  };

  const runConsentedBiometricAction = (actionSpec) => {
    if (!actionSpec) return;
    const actionType = typeof actionSpec === 'string' ? actionSpec : actionSpec.type;
    if (actionType === 'camera') {
      startCameraStream('user');
    } else if (actionType === 'flip') {
      handleFlipCamera();
    } else if (actionType === 'upload') {
      fileInputRef.current?.click();
    } else if (actionType === 'shutter') {
      performShutterOrDiagnose();
    } else if (actionType === 'pin_editor') {
      setPinEditorOpen(true);
    } else if (actionType === 'sample' && typeof actionSpec === 'object' && actionSpec.sampleKey) {
      stopCameraStream();
      const url = createSampleFaceDataUrl(actionSpec.sampleKey);
      if (url) {
        setPortraitDataUrl(url);
        executePersonalColorAnalysis(url, lightingMode, null, 0, null);
      }
    } else if (actionType === 'analyze' && typeof actionSpec === 'object') {
      executePersonalColorAnalysis(
        actionSpec.imgUrl,
        actionSpec.mode,
        actionSpec.pins,
        actionSpec.rot,
        actionSpec.crop
      );
    }
  };

  const requestBiometricCapture = (actionSpec) => {
    if (!hasBiometricConsent()) {
      setPendingBiometricAction(actionSpec);
      return;
    }
    runConsentedBiometricAction(actionSpec);
  };

  const handleSelectSubType = (subKey) => {
    const st = PERSONAL_COLOR_SUBTYPES[subKey];
    if (!st) return;
    setSelectedSubTypeKey(subKey);
    setSelectedPersonalColor(st.seasonKey);
    setSelectedPccsToneKey(st.pccsTones[0]);
    setChartToneFamily(st.toneFamily);
    setCustomMannequinHex(null);
    setMannequinColorMode('personal_color');
  };

  const handleSelectPccsTone = (toneObj) => {
    setSelectedPccsToneKey(toneObj.key);
    const targetHex = chartToneFamily === 'WARM TONE' ? toneObj.warmHex : toneObj.coolHex;
    setCustomMannequinHex(targetHex);
    setMannequinColorMode('personal_color');
  };

  const handleRequestLightingModeChange = (nextModeKey) => {
    if (nextModeKey === lightingMode) return;
    setPendingLightingMode(nextModeKey);
  };

  const confirmLightingModeChange = () => {
    const targetMode = pendingLightingMode;
    setPendingLightingMode(null);
    if (!targetMode) return;

    if (!hasBiometricConsent()) {
      setLightingMode(targetMode);
      setPendingBiometricAction({
        type: 'analyze',
        imgUrl: portraitDataUrl,
        mode: targetMode,
        pins: customPins,
        rot: rotationDeg,
        crop: cropRect,
      });
      return;
    }

    setReanalyzingPct(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 25;
      if (current >= 100) {
        clearInterval(interval);
        if (!mountedRef.current) return;
        setReanalyzingPct(100);
        setLightingMode(targetMode);
        executePersonalColorAnalysis(
          portraitDataUrl,
          targetMode,
          customPins,
          rotationDeg,
          cropRect
        ).finally(() => {
          setTimeout(() => {
            if (mountedRef.current) setReanalyzingPct(null);
          }, 240);
        });
      } else if (mountedRef.current) {
        setReanalyzingPct(current);
      }
    }, 65);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload = {
        age_group: ageGroup,
        age: ageGroup === 'unspecified' ? null : Number(age) || null,
        height_cm: Number(heightCm) || null,
        weight_kg: Number(weightKg) || null,
        gender,
        body_shape: bodyShape,
        body_fat_pct: bodyFatPct === '' ? null : Number(bodyFatPct),
        chest_cm: chestCm === '' ? null : Number(chestCm),
        waist_cm: waistCm === '' ? null : Number(waistCm),
        hip_cm: hipCm === '' ? null : Number(hipCm),
        head_cm: headCm === '' ? null : Number(headCm),
        personal_color: selectedPersonalColor,
        skin_tone_hex: activeMannequinColorHex,
        skin_undertone_lab: pcResult?.lab
          ? {
              ...pcResult.lab,
              subTypeKey: selectedSubTypeKey,
              subTypeLabelKo: activeSubType.labelKo,
              pccsToneKey: selectedPccsToneKey,
              mannequinModelColorHex: activeMannequinColorHex,
            }
          : null,
        regenerate_wardrobe: regenerateWardrobe,
      };
      const res = await apiFetch('/auth/profile-setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const enrichedUser = {
        ...res.user,
        personalColorSubtype: selectedSubTypeKey,
        personalColorLabelKo: activeSubType.labelKo,
        skinToneHex: activeMannequinColorHex,
        mannequinModelColorHex: activeMannequinColorHex,
        mannequinBriefsColorHex: activeBriefsColorHex,
      };
      onCompleted?.(enrichedUser, res.generatedWardrobe);
    } catch (err) {
      emitStatusCapsule(err?.message || '프로필 저장 중 오류가 발생했습니다');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={() => allowDismiss && onClose?.()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pcm-modal-title"
          className="pcm-modal-box"
          data-sheet-panel="true"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Responsive Header */}
        <div className="pcm-header">
          <div className="pcm-header-title">
            <span
              className="hig-caption tabular-nums"
              style={{ marginBottom: 4, display: 'inline-block', color: 'var(--ink-secondary)' }}
            >
              STEP {step} OF 2 · 3D MANNEQUIN &amp; PERSONAL COLOR STUDIO
            </span>
            <h2 id="pcm-modal-title" className="hig-headline">
              {step === 1
                ? 'Step 1. 7대 체형 · 스리사이즈 · 3D 마네킹 실루엣 설정'
                : 'Step 2. 실시간 카메라/사진 퍼스널컬러 측정 · PCCS 톤 맵'}
            </h2>
          </div>

          <div className="pcm-header-actions">
            <button
              id="tab-step1-body-btn"
              type="button"
              className={`chip tabular-nums ${step === 1 ? 'active' : ''}`}
              onClick={() => setStep(1)}
            >
              Step 1. 7체형 · 3사이즈
            </button>
            <button
              id="tab-step2-pc-btn"
              type="button"
              className={`chip tabular-nums ${step === 2 ? 'active' : ''}`}
              onClick={() => setStep(2)}
            >
              Step 2. 카메라 퍼스널컬러 측정
            </button>
            <button
              id="close-profile-modal-btn"
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="닫기"
              title="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ===================================================================
            PERSISTENT TOP 3D MODELING STAGE ("위의 3D모델링" — Live in Step 1 & Step 2)
            =================================================================== */}
        <div className="pcm-top-3d-banner" id="top-3d-modeling-stage">
          <div className="pcm-top-3d-stage">
            <Mannequin3DBodyPreview
              user={livePreviewProfile}
              poseYawDeg={previewRotDeg}
              width={210}
              height={280}
              displayWidth={165}
              displayHeight={220}
              style={{ objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { deg: 0, label: '정면' },
                { deg: -16, label: '3/4 입체' },
                { deg: 90, label: '측면(복부)' },
              ].map((p) => (
                <button
                  key={p.deg}
                  type="button"
                  className={`atl-chip tabular-nums ${previewRotDeg === p.deg ? 'active' : ''}`}
                  onClick={() => setPreviewRotDeg(p.deg)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pcm-top-3d-info">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className="hig-caption" style={{ color: 'var(--ink-secondary)' }}>
                  LIVE 3D MODELING · 실시간 체형 및 퍼스널컬러 동기화
                </span>
                <h3 className="hig-headline" style={{ marginTop: 4 }}>
                  {resolvedAnat.shapeLabelKo} ·{' '}
                  <span style={{ color: 'var(--ink-primary)' }}>{activeSubType.labelKo}</span>
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  className="hig-caption tabular-nums"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: 'var(--bg-canvas)',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: activeMannequinColorHex,
                    }}
                  />
                  3D 모델링 컬러: {activeMannequinColorHex}
                </span>
              </div>
            </div>

            <div
              className="hig-caption tabular-nums"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', color: 'var(--ink-secondary)' }}
            >
              <span>
                • <strong>BMI {resolvedAnat.bmi}</strong> ({resolvedAnat.bmiCategory})
              </span>
              <span>
                • 3사이즈: <strong>{resolvedAnat.chestCm}-{resolvedAnat.waistCm}-{resolvedAnat.hipCm}cm</strong>
              </span>
              <span>
                • 머리둘레: <strong>{resolvedAnat.headCm}cm ({resolvedAnat.headToBodyRatio}등신)</strong>
              </span>
              <span>
                • 진단 톤: <strong>{activeSubType.toneFamily} ({activePccsTone.label.replace('\n', ' ')})</strong>
              </span>
            </div>

            {/* 3D Mannequin Personal Color Swatch Switcher */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                paddingTop: 8,
              }}
            >
              <span className="hig-caption" style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Palette size={14} /> 3D 모델링 컬러 적용:
              </span>
              <button
                id="mode-pc-color-btn"
                type="button"
                className={`atl-chip ${mannequinColorMode === 'personal_color' && !customMannequinHex ? 'active' : ''}`}
                onClick={() => {
                  setMannequinColorMode('personal_color');
                  setCustomMannequinHex(null);
                }}
              >
                <span
                  className="atl-color-dot"
                  style={{ background: activeSubType.mannequinModelColorHex }}
                />
                진단 퍼스널컬러 ({activeSubType.shortKo.replace('\n', ' ')})
              </button>
              <button
                id="mode-skin-color-btn"
                type="button"
                className={`atl-chip tabular-nums ${mannequinColorMode === 'skin_tone' && !customMannequinHex ? 'active' : ''}`}
                onClick={() => {
                  setMannequinColorMode('skin_tone');
                  setCustomMannequinHex(null);
                }}
              >
                <span
                  className="atl-color-dot"
                  style={{ background: pcResult?.skinToneHex || user?.skinToneHex || '#E6C6AE' }}
                />
                실측 피부 언더톤 ({pcResult?.skinToneHex || user?.skinToneHex || '#E6C6AE'})
              </button>
              {Object.values(PERSONAL_COLOR_SUBTYPES).map((st) => (
                <button
                  key={st.key}
                  id={`quick-3d-color-${st.key}`}
                  type="button"
                  title={`${st.labelKo} 컬러로 3D 모델링 변경`}
                  onClick={() => handleSelectSubType(st.key)}
                  className="hig-caption"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontWeight: 600,
                    background: selectedSubTypeKey === st.key ? 'var(--accent-mono)' : 'var(--bg-canvas)',
                    color: selectedSubTypeKey === st.key ? 'var(--accent-mono-ink)' : 'var(--ink-secondary)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: st.bubbleHex,
                    }}
                  />
                  {st.shortKo.replace('\n', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===================================================================
            STEP 1: 7 BODY SHAPES & THREE-SIZES
            =================================================================== */}
        {step === 1 ? (
          <div>
            <div className="pcm-step1-grid">
              <div>
                <div className="form-grid-2">
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-age-group">
                      연령대 (10단계 통계 벤치마크 기준)
                    </label>
                    <select
                      id="profile-age-group"
                      className="select-input tabular-nums"
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)}
                    >
                      {AGE_GROUP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-gender">
                      성별 (체형 및 3사이즈 디폴트 기준)
                    </label>
                    <select
                      id="profile-gender"
                      className="select-input"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                    >
                      <option value="male">남성 (Male)</option>
                      <option value="female">여성 (Female)</option>
                      <option value="unspecified">젠더리스 / 입력하지 않음</option>
                    </select>
                  </div>
                </div>

                <div className="pcm-metrics-3col">
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-age-input">
                      만 나이 (선택)
                    </label>
                    <input
                      id="profile-age-input"
                      type="number"
                      className="text-input tabular-nums"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="예: 33"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-height-input">
                      키 (cm)
                    </label>
                    <input
                      id="profile-height-input"
                      type="number"
                      className="text-input tabular-nums"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="예: 175"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-weight-input">
                      몸무게 (kg)
                    </label>
                    <input
                      id="profile-weight-input"
                      type="number"
                      className="text-input tabular-nums"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="예: 68"
                    />
                  </div>
                </div>

                {/* 7 Body Shape Cards with Mini 3D Mannequins */}
                <div style={{ marginTop: 8, marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <label className="field-label" style={{ marginBottom: 0 }}>
                      7대 체형 선택 (클릭 시 상단 3D 마네킹과 3사이즈가 즉시 변경됩니다)
                    </label>
                    <button
                      id="recommend-body-shape-btn"
                      type="button"
                      className="btn btn-secondary btn-sm tabular-nums"
                      onClick={handleRecommendBodyShape}
                    >
                      <Wand2 size={14} /> BMI({resolvedAnat.bmi}) 기반 추천 체형 자동 선택
                    </button>
                  </div>

                  <div className="pcm-shape-grid">
                    {BODY_SHAPE_OPTIONS.map((b) => {
                      const active = bodyShape === b.key;
                      const isRec = resolvedAnat.recommendedShape === b.key;
                      return (
                        <button
                          key={b.key}
                          id={`body-shape-card-${b.key}`}
                          type="button"
                          className={`pcm-shape-card ${active ? 'active' : ''}`}
                          onClick={() => handleSelectBodyShape(b.key)}
                        >
                          {active && (
                            <span
                              className="hig-caption"
                              style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                fontWeight: 700,
                                background: 'var(--accent-mono)',
                                color: 'var(--accent-mono-ink)',
                                padding: '4px 8px',
                                borderRadius: 999,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Check size={10} /> 선택됨
                            </span>
                          )}
                          {isRec && (
                            <span
                              className="hig-caption"
                              style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                fontWeight: 700,
                                background: 'var(--bg-canvas)',
                                color: 'var(--ink-primary)',
                                padding: '4px 8px',
                                borderRadius: 999,
                              }}
                            >
                              추천
                            </span>
                          )}
                          <Mannequin3DBodyPreview
                            user={{
                              gender: gender === 'unspecified' ? 'unisex' : gender,
                              height_cm: heightCm,
                              weight_kg: weightKg,
                              body_shape: b.key,
                              personal_color: selectedPersonalColor,
                              skin_tone_hex: activeMannequinColorHex,
                              mannequinModelColorHex: activeMannequinColorHex,
                              mannequinBriefsColorHex: activeBriefsColorHex,
                            }}
                            poseYawDeg={-16}
                            width={110}
                            height={156}
                            displayWidth={78}
                            displayHeight={110}
                          />
                          <strong className="hig-caption" style={{ display: 'block', marginTop: 4 }}>
                            {b.shortKo}
                          </strong>
                          <span className="hig-caption" style={{ color: 'var(--ink-muted)' }}>
                            {b.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Detailed Three-Sizes (Chest / Waist / Hip), Head Circumference, Body Fat % */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    padding: 16,
                    borderRadius: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong className="hig-body">
                        체지방률 · 스리사이즈(가슴/허리/엉덩이) · 머리둘레 상세 치수 (선택)
                      </strong>
                      <div className="hig-caption" style={{ color: 'var(--ink-secondary)' }}>
                        입력 시 3D 마네킹 볼륨과 등신대 비율에 즉시 반영되며, 비워두면 선택한 체형({resolvedAnat.shapeShortKo})의 인체공학 디폴트가 자동 적용됩니다.
                      </div>
                    </div>
                    <button
                      id="clear-anthropometrics-btn"
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleResetMeasurementsToDefault}
                    >
                      <RotateCcw size={13} /> 치수 비우기 (체형 디폴트 복원)
                    </button>
                  </div>

                  <div className="pcm-5size-grid">
                    <div>
                      <label className="field-label" htmlFor="input-body-fat">
                        체지방률 (%)
                      </label>
                      <input
                        id="input-body-fat"
                        type="number"
                        step="0.5"
                        className="text-input tabular-nums"
                        placeholder={`기본 ${resolvedAnat.defaults.bodyFatPct}%`}
                        value={bodyFatPct}
                        onChange={(e) => setBodyFatPct(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="input-chest-cm">
                        가슴둘레 (cm)
                      </label>
                      <input
                        id="input-chest-cm"
                        type="number"
                        step="0.5"
                        className="text-input tabular-nums"
                        placeholder={`기본 ${resolvedAnat.defaults.chestCm}`}
                        value={chestCm}
                        onChange={(e) => setChestCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="input-waist-cm">
                        허리둘레 (cm)
                      </label>
                      <input
                        id="input-waist-cm"
                        type="number"
                        step="0.5"
                        className="text-input tabular-nums"
                        placeholder={`기본 ${resolvedAnat.defaults.waistCm}`}
                        value={waistCm}
                        onChange={(e) => setWaistCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="input-hip-cm">
                        엉덩이둘레 (cm)
                      </label>
                      <input
                        id="input-hip-cm"
                        type="number"
                        step="0.5"
                        className="text-input tabular-nums"
                        placeholder={`기본 ${resolvedAnat.defaults.hipCm}`}
                        value={hipCm}
                        onChange={(e) => setHipCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="input-head-cm">
                        머리둘레 (cm)
                      </label>
                      <input
                        id="input-head-cm"
                        type="number"
                        step="0.5"
                        className="text-input tabular-nums"
                        placeholder={`기본 ${resolvedAnat.defaults.headCm}`}
                        value={headCm}
                        onChange={(e) => setHeadCm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pcm-footer">
              <label className="hig-caption tabular-nums" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={regenerateWardrobe}
                  onChange={(e) => setRegenerateWardrobe(e.target.checked)}
                />
                <span>
                  저장 시 선택한 연령대({ageGroup}) × 11부위 × 4계절 통계 벤치마크 수량으로 옷장 샘플 다시 채우기
                </span>
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary tabular-nums"
                  disabled={saving}
                  onClick={handleSaveProfile}
                >
                  Step 1 체형만 먼저 저장
                </button>
                <button
                  id="goto-step2-personal-color-btn"
                  type="button"
                  className="btn btn-primary tabular-nums"
                  onClick={() => setStep(2)}
                >
                  <Camera size={16} /> Step 2. 카메라 촬영 · 퍼스널컬러 측정으로 이동
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
             STEP 2: CAMERA SELFIE / PHOTO UPLOAD + PCCS 12-TONE CHART & SUBTYPES
             =================================================================== */
          <div>
            {/* Hidden file inputs for gallery upload & mobile direct selfie camera */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePortraitUpload}
            />
            <input
              ref={mobileCameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={handlePortraitUpload}
            />

            {cameraError && (
              <div
                className="hig-caption"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--ink-primary)',
                  padding: '8px 16px',
                  borderRadius: 12,
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>{cameraError}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCameraError('')}
                >
                  확인
                </button>
              </div>
            )}

            {/* Main Personal Color App Split View */}
            <div className="pcm-pc-app-grid">
              {/* LEFT: Camera Selfie Viewfinder & Photo Upload */}
              <div className="pcm-camera-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    background: '#1C1C1E',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      id="start-live-camera-btn"
                      type="button"
                      onClick={() =>
                        cameraActive ? stopCameraStream() : requestBiometricCapture('camera')
                      }
                      className="hig-caption"
                      style={{
                        minHeight: 44,
                        padding: '8px 12px',
                        borderRadius: 999,
                        fontWeight: 700,
                        background: cameraActive ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
                        color: cameraActive ? '#1D1D1F' : '#FFFFFF',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Camera size={13} />
                      {cameraActive ? '카메라 켜짐 (촬영 대기)' : '카메라로 바로 찍기'}
                    </button>
                    <button
                      id="upload-photo-btn"
                      type="button"
                      onClick={() => requestBiometricCapture('upload')}
                      className="hig-caption"
                      style={{
                        minHeight: 44,
                        padding: '8px 12px',
                        borderRadius: 999,
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.14)',
                        color: '#FFFFFF',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Upload size={13} /> 사진 올리기
                    </button>
                  </div>

                  <button
                    id="open-pin-editor-btn"
                    type="button"
                    onClick={() => requestBiometricCapture('pin_editor')}
                    className="hig-caption tabular-nums"
                    style={{
                      minHeight: 44,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.12)',
                      color: '#F5F5F7',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Crosshair size={12} /> 4핀 보정
                  </button>
                </div>

                {/* Camera / Portrait Viewport with Monochrome Corner Brackets */}
                <div className="pcm-camera-viewport">
                  {cameraActive ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
                      }}
                    />
                  ) : (
                    (pcResult?.processedDataUrl || portraitDataUrl) && (
                      <img
                        src={pcResult?.processedDataUrl || portraitDataUrl}
                        alt="퍼스널컬러 진단 얼굴"
                      />
                    )
                  )}

                  {/* Monochrome 4-Corner Guide Brackets */}
                  <div className="pcm-face-guide-box">
                    <span className="pcm-corner tl" />
                    <span className="pcm-corner tr" />
                    <span className="pcm-corner bl" />
                    <span className="pcm-corner br" />
                  </div>

                  {/* Interactive P1~P4 Skin Pins when viewing a photo */}
                  {!cameraActive &&
                    (pcResult?.pins || []).map((pin, idx) => {
                      const active = highlightedPinId === pin.id;
                      return (
                        <button
                          key={pin.id}
                          type="button"
                          onClick={() => setHighlightedPinId(pin.id)}
                          className="hig-caption tabular-nums"
                          style={{
                            position: 'absolute',
                            left: `${pin.x * 100}%`,
                            top: `${pin.y * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            padding: '4px 8px',
                            borderRadius: 999,
                            background: active ? '#FFFFFF' : 'rgba(28, 28, 30, 0.84)',
                            color: active ? '#1D1D1F' : '#F5F5F7',
                            fontWeight: 700,
                            zIndex: 3,
                          }}
                        >
                          P{idx + 1} {pin.labelKo}
                        </button>
                      );
                    })}

                  {/* Bottom Status Pill */}
                  <div className="pcm-camera-prompt-pill tabular-nums">
                    {cameraActive
                      ? '지금, 진단 버튼을 눌러주세요'
                      : pcResult
                        ? `진단 완료: ${activeSubType.labelKo} · 신뢰도 ${pcResult.confidence ?? 92}%`
                        : '중앙 진단 버튼을 눌러 온디바이스 피부톤 분석을 시작하세요'}
                  </div>
                </div>

                {/* Bottom Shutter Bar — ALL 3 buttons gated by biometric consent */}
                <div className="pcm-camera-bottom-bar">
                  <button
                    type="button"
                    className="pcm-cam-side-btn"
                    aria-label="앨범에서 내 사진 업로드"
                    title="앨범에서 내 사진 업로드"
                    onClick={() => requestBiometricCapture('upload')}
                  >
                    <Upload size={19} />
                  </button>

                  <button
                    id="camera-shutter-diagnose-btn"
                    type="button"
                    className="pcm-cam-shutter-btn"
                    aria-label={
                      cameraActive
                        ? '사진 촬영 및 퍼스널컬러 측정'
                        : '퍼스널컬러 즉시 측정'
                    }
                    title={
                      cameraActive
                        ? '사진 촬영 및 퍼스널컬러 측정'
                        : '퍼스널컬러 즉시 측정 / 카메라 촬영'
                    }
                    onClick={() => requestBiometricCapture('shutter')}
                  >
                    <ScanFace size={28} />
                  </button>

                  <button
                    type="button"
                    className="pcm-cam-side-btn"
                    aria-label={cameraActive ? '전면 및 후면 카메라 전환' : '실시간 카메라 켜기'}
                    title={cameraActive ? '전면/후면 카메라 전환' : '실시간 카메라 켜기'}
                    onClick={() => requestBiometricCapture(cameraActive ? 'flip' : 'camera')}
                  >
                    <RefreshCw size={19} />
                  </button>
                </div>

                {/* Quick Sample Portrait Buttons for 1-Click Demo */}
                <div
                  style={{
                    padding: '8px 16px 16px',
                    background: '#1C1C1E',
                  }}
                >
                  <span className="hig-caption tabular-nums" style={{ color: '#AEAEB2', display: 'block', marginBottom: 8 }}>
                    샘플 얼굴로 퍼스널컬러 측정 &amp; 3D 모델링 색상 즉시 테스트:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                    {[
                      { k: 'spring_warm', l: '봄 웜' },
                      { k: 'summer_cool', l: '여름 쿨' },
                      { k: 'autumn_warm', l: '가을 웜' },
                      { k: 'winter_cool', l: '겨울 쿨' },
                    ].map((s) => (
                      <button
                        key={s.k}
                        id={`sample-face-${s.k}`}
                        type="button"
                        onClick={() =>
                          requestBiometricCapture({ type: 'sample', sampleKey: s.k })
                        }
                        className="hig-caption"
                        style={{
                          minHeight: 44,
                          padding: '8px 4px',
                          borderRadius: 8,
                          fontWeight: 600,
                          background:
                            selectedPersonalColor === s.k ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
                          color: selectedPersonalColor === s.k ? '#1D1D1F' : '#F5F5F7',
                        }}
                      >
                        {s.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: PCCS 12-Tone Map & Subtype Bubble Diagram */}
              <div className="pcm-pccs-panel">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <h3 className="hig-headline" style={{ letterSpacing: '0.04em' }}>
                      {chartToneFamily}
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['WARM TONE', 'COOL TONE'].map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          className={`atl-chip ${chartToneFamily === tf ? 'active' : ''}`}
                          onClick={() => setChartToneFamily(tf)}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pcm-pccs-chart-wrap">
                    <div className="pcm-grayscale-col tabular-nums">
                      {PCCS_GRAYSCALE_BAR.map((g) => (
                        <div
                          key={g.label}
                          className="pcm-gray-step"
                          style={{
                            background: g.hex,
                            color: g.textDark ? '#1D1D1F' : '#FFFFFF',
                          }}
                        >
                          {g.label}
                        </div>
                      ))}
                    </div>

                    <div className="pcm-axis-y">
                      <span>Brightness →</span>
                    </div>

                    <div className="pcm-pccs-canvas-area">
                      {PCCS_12_TONES.map((tone) => {
                        const isMatched = activeSubType.pccsTones.includes(tone.key);
                        const isSelected = selectedPccsToneKey === tone.key;
                        return (
                          <button
                            key={tone.key}
                            id={`pccs-tone-${tone.key}`}
                            type="button"
                            onClick={() => handleSelectPccsTone(tone)}
                            title={`${tone.labelKo} — 클릭 시 상단 3D 모델링에 톤 컬러 적용`}
                            style={{
                              position: 'absolute',
                              left: `${tone.xPct}%`,
                              top: `${tone.yPct}%`,
                              transform: 'translate(-50%, -50%)',
                              width: 58,
                              height: 58,
                              borderRadius: '50%',
                              background: isSelected
                                ? 'var(--bg-subtle)'
                                : isMatched
                                  ? 'var(--bg-surface)'
                                  : 'transparent',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: isMatched || isSelected ? 1 : 0.72,
                              transition:
                                'transform 0.24s var(--spring-ease), opacity 0.24s var(--spring-ease)',
                            }}
                          >
                            {tone.dots.map((dotHex, i) => {
                              const angle = (i / tone.dots.length) * Math.PI * 2 - Math.PI / 2;
                              const r = 21;
                              const dx = Math.cos(angle) * r;
                              const dy = Math.sin(angle) * r;
                              return (
                                <span
                                  key={i}
                                  style={{
                                    position: 'absolute',
                                    left: `calc(50% + ${dx.toFixed(1)}px)`,
                                    top: `calc(50% + ${dy.toFixed(1)}px)`,
                                    width: 7.5,
                                    height: 7.5,
                                    borderRadius: '50%',
                                    background: dotHex,
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                />
                              );
                            })}
                            <span
                              className="hig-caption"
                              style={{
                                fontWeight: 700,
                                color: 'var(--ink-primary)',
                                lineHeight: 1.05,
                                whiteSpace: 'pre-line',
                                textAlign: 'center',
                                pointerEvents: 'none',
                              }}
                            >
                              {tone.label}
                            </span>
                          </button>
                        );
                      })}
                      <span className="pcm-axis-x-label">Saturation →</span>
                    </div>
                  </div>
                </div>

                {/* Subtype Bubble Diagram */}
                <div
                  style={{
                    background: 'var(--bg-canvas)',
                    borderRadius: 16,
                    padding: 16,
                    textAlign: 'center',
                  }}
                >
                  <h4 className="hig-headline" style={{ marginBottom: 8 }}>
                    {user?.displayName || '사용자'}님의 서브 유형
                  </h4>

                  <div className="pcm-subtype-bubbles-stage">
                    {activeSubType.secondarySubtypes?.[0] && (
                      <button
                        type="button"
                        className="pcm-subtype-bubble-sec"
                        onClick={() => handleSelectSubType(activeSubType.secondarySubtypes[0].key)}
                        title="클릭하여 서브 유형 전환 및 3D 모델링 컬러 변경"
                      >
                        {activeSubType.secondarySubtypes[0].shortKo}
                      </button>
                    )}

                    <div className="pcm-subtype-bubble-main-wrap">
                      <button
                        type="button"
                        className="pcm-subtype-bubble-main"
                        style={{ background: activeSubType.bubbleHex }}
                        onClick={() => {
                          setCustomMannequinHex(activeSubType.mannequinModelColorHex);
                          setMannequinColorMode('personal_color');
                        }}
                      >
                        {activeSubType.shortKo}
                      </button>
                      <div className="pcm-subtype-pedestal" />
                    </div>

                    {activeSubType.secondarySubtypes?.[1] && (
                      <button
                        type="button"
                        className="pcm-subtype-bubble-sec"
                        onClick={() => handleSelectSubType(activeSubType.secondarySubtypes[1].key)}
                        title="클릭하여 서브 유형 전환 및 3D 모델링 컬러 변경"
                      >
                        {activeSubType.secondarySubtypes[1].shortKo}
                      </button>
                    )}
                  </div>

                  <div style={{ maxWidth: 420, margin: '8px auto 0' }}>
                    <strong
                      className="hig-body"
                      style={{
                        display: 'block',
                        color: 'var(--ink-primary)',
                        marginBottom: 8,
                      }}
                    >
                      {activeSubType.tipTitleKo}
                    </strong>
                    <p className="hig-caption" style={{ color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
                      {activeSubType.tipBodyKo}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Illumination Calibration Modes */}
            <div style={{ marginBottom: 16 }}>
              <label className="field-label tabular-nums">
                <Sun size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                광원 전처리 보정 모드 (변경 시 0~100% 재분석 수행)
              </label>
              <div className="pcm-lighting-grid">
                {LIGHTING_MODES.map((m) => {
                  const isActiveMode = lightingMode === m.key;
                  return (
                    <button
                      key={m.key}
                      id={`lighting-mode-${m.key}`}
                      type="button"
                      onClick={() => handleRequestLightingModeChange(m.key)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: isActiveMode ? 'var(--accent-mono)' : 'var(--bg-surface)',
                        color: isActiveMode ? 'var(--accent-mono-ink)' : 'var(--ink-primary)',
                        textAlign: 'left',
                      }}
                    >
                      <strong className="hig-caption" style={{ display: 'block' }}>{m.labelKo}</strong>
                      <span
                        className="hig-caption"
                        style={{
                          color: isActiveMode ? 'var(--accent-mono-ink)' : 'var(--ink-secondary)',
                          opacity: isActiveMode ? 0.85 : 1,
                        }}
                      >
                        {m.descKo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lighting Mode Change Confirmation Popup */}
            {pendingLightingMode && (
              <div
                id="lighting-change-confirm-popup"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--ink-primary)',
                  padding: 16,
                  borderRadius: 16,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div className="hig-body tabular-nums">
                  <strong>전처리 조명 보정 모드를 변경하고 픽셀 언더톤을 0~100% 재분석하시겠습니까?</strong>
                  <div className="hig-caption" style={{ color: 'var(--ink-secondary)', marginTop: 4 }}>
                    선택한 광원: {LIGHTING_MODES.find((x) => x.key === pendingLightingMode)?.labelKo}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPendingLightingMode(null)}
                  >
                    취소
                  </button>
                  <button
                    id="confirm-lighting-reanalyze-btn"
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={confirmLightingModeChange}
                  >
                    재분석 실행
                  </button>
                </div>
              </div>
            )}

            {/* 0 ~ 100% Re-analysis Progress Bar Animation */}
            {reanalyzingPct !== null && (
              <div
                id="reanalyzing-progress-banner"
                style={{
                  background: 'var(--bg-surface)',
                  padding: 16,
                  borderRadius: 16,
                  marginBottom: 16,
                }}
              >
                <div
                  className="hig-caption tabular-nums"
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
                >
                  <strong>CIE L*a*b* 4부위 언더톤 및 PCCS 톤 맵 재분석 중...</strong>
                  <strong>{reanalyzingPct}%</strong>
                </div>
                <div style={{ height: 8, background: 'var(--bg-canvas)', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${reanalyzingPct}%`,
                      height: '100%',
                      background: 'var(--accent-mono)',
                      transition: 'width 0.18s var(--spring-ease)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* CIE L*a*b* 4-Pin & 20-Color Directional Drape Evidence */}
            {pcResult?.lab && (
              <div className="pcm-evidence-grid">
                <div
                  className="hig-caption tabular-nums"
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Info size={14} /> CIE L*a*b* 4핀 측정값 &amp; 신뢰도 ({pcResult.confidence}%)
                    </strong>
                    <span style={{ color: 'var(--ink-muted)' }}>
                      L*{pcResult.lab.L} · a*{pcResult.lab.a} · b*{pcResult.lab.b} · ITA° {pcResult.lab.itaDeg}°
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {(pcResult.pins || []).map((pin, idx) => (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={() => setHighlightedPinId(pin.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 8,
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: highlightedPinId === pin.id ? 'var(--bg-subtle)' : 'var(--bg-canvas)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="color-dot"
                            style={{ width: 12, height: 12, backgroundColor: pin.hex }}
                          />
                          <strong>P{idx + 1} {pin.labelKo}</strong>
                        </span>
                        {pin.lab && (
                          <span style={{ color: 'var(--ink-muted)' }}>
                            L*{pin.lab.L} b*{pin.lab.b}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {pcResult.confidenceBreakdown && (
                    <div style={{ color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                      <div>• {pcResult.confidenceBreakdown.formulaText}</div>
                      <div>
                        • 균일도 {pcResult.confidenceBreakdown.uniformity40}점 · 분리도{' '}
                        {pcResult.confidenceBreakdown.separation25}점 · 채도{' '}
                        {pcResult.confidenceBreakdown.chroma20}점 · 광원{' '}
                        {pcResult.confidenceBreakdown.lighting15}점
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className="tabular-nums"
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <strong className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
                    20색 드레이프 조화 유사도 (컬러칩 클릭 시 상단 3D 모델링에 즉시 적용)
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Object.entries(pcResult.directional20 || {}).map(([dirKey, group]) => (
                      <div
                        key={dirKey}
                        style={{
                          padding: 8,
                          borderRadius: 12,
                          background: 'var(--bg-canvas)',
                        }}
                      >
                        <div className="hig-caption" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <strong>{group.seasonLabel.split(' ')[0]}</strong>
                          <strong style={{ color: 'var(--ink-primary)' }}>{group.avgSimilarity}%</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                          {(group.swatches || []).map((sw) => (
                            <button
                              key={sw.name}
                              type="button"
                              onClick={() => {
                                setCustomMannequinHex(sw.hex);
                                setMannequinColorMode('personal_color');
                              }}
                              style={{ textAlign: 'center', padding: 0 }}
                              title={`${sw.name} (${sw.hex}) — 클릭 시 3D 모델링 컬러 변경`}
                            >
                              <div
                                style={{
                                  height: 20,
                                  borderRadius: 4,
                                  backgroundColor: sw.hex,
                                  transform: activeMannequinColorHex === sw.hex ? 'scale(1.08)' : 'none',
                                }}
                              />
                              <span className="hig-caption" style={{ fontWeight: 600 }}>
                                {sw.similarity}%
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pcm-footer">
              <button type="button" className="btn btn-secondary tabular-nums" onClick={() => setStep(1)}>
                ← Step 1 (7체형 · 3사이즈)로 돌아가기
              </button>
              <button
                id="save-profile-personal-color-btn"
                type="button"
                className="btn btn-primary tabular-nums"
                disabled={saving}
                onClick={handleSaveProfile}
              >
                <CheckCircle2 size={16} />
                {saving
                  ? '체형 · 퍼스널컬러 · 3D 모델링 반영 중...'
                  : '체형 · 퍼스널컬러 · 3D 모델링 컬러 확정 및 저장'}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      <PortraitCropAndPinEditorModal
        open={pinEditorOpen}
        imageSource={rawPortraitSourceUrl || portraitDataUrl}
        initialStage="crop"
        initialPins={pcResult?.pins}
        onClose={() => setPinEditorOpen(false)}
        onApply={({ croppedDataUrl, pins, rotationDeg: nextRot, cropRect: nextCrop }) => {
          const finalImg = croppedDataUrl || portraitDataUrl;
          setCustomPins(pins);
          setRotationDeg(nextRot || 0);
          setCropRect(nextCrop || null);
          if (finalImg) setPortraitDataUrl(finalImg);
          setPinEditorOpen(false);
          executePersonalColorAnalysis(finalImg, lightingMode, pins, nextRot || 0, nextCrop || null);
        }}
      />

      <BiometricConsentModal
        open={Boolean(pendingBiometricAction)}
        onClose={() => setPendingBiometricAction(null)}
        onConfirm={() => {
          const action = pendingBiometricAction;
          setPendingBiometricAction(null);
          runConsentedBiometricAction(action);
        }}
      />
    </>
  );
}
