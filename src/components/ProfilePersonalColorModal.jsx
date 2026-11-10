import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  LIGHTING_MODES,
  PCCS_12_TONES,
  PCCS_GRAYSCALE_BAR,
  PERSONAL_COLOR_DETAILS,
  PERSONAL_COLOR_SUBTYPES,
  analyzePersonalColorFromImage,
} from '../utils/imageTools.js';
import PortraitCropAndPinEditorModal from './PortraitCropAndPinEditorModal.jsx';
import { Mannequin3DBodyPreview } from './VirtualMannequin.jsx';

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

// Generate a synthetic portrait data URL for quick 1-click personal color testing
function createSampleFaceDataUrl(tone = 'spring_warm') {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 320;
  const ctx = c.getContext('2d');
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
  ctx.fillStyle = '#2B2523';
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

  // 3D Mannequin Color Mode: 'personal_color' (tints 3D mannequin with measured personal color) | 'skin_tone' (natural skin hex)
  const [mannequinColorMode, setMannequinColorMode] = useState('personal_color');
  const [customMannequinHex, setCustomMannequinHex] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initialStep) {
      setStep(initialStep);
    }
  }, [open, initialStep]);

  // Stop camera stream on modal close or unmount
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!open) {
      stopCameraStream();
    }
    return () => stopCameraStream();
  }, [open]);

  const startCameraStream = async (facing = cameraFacing) => {
    setCameraError('');
    stopCameraStream();

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
      streamRef.current = stream;
      setCameraFacing(facing);
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
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
      return activeSubType.mannequinBriefsColorHex || '#2c2623';
    }
    return '#2c2623';
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

  // Live faceless 3D mannequin profile (body tone + briefs follow the personal color / detected skin)
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
    const res = await analyzePersonalColorFromImage(imgUrl, {
      lightingMode: mode,
      customPins: pins,
      rotationDeg: rot,
      cropRect: crop,
    });
    setPcResult(res);
    setSelectedPersonalColor(res.personalColor);
    if (res.subTypeKey) {
      setSelectedSubTypeKey(res.subTypeKey);
    }
    if (res.pccsToneKey) {
      setSelectedPccsToneKey(res.pccsToneKey);
    }
    if (res.toneFamily) {
      setChartToneFamily(res.toneFamily);
    }
    setCustomMannequinHex(null);
    setMannequinColorMode('personal_color');
  };

  // Initialize default sample portrait analysis on first open
  useEffect(() => {
    if (open && !portraitDataUrl) {
      const sampleUrl = createSampleFaceDataUrl(user?.personalColor || 'spring_warm');
      setPortraitDataUrl(sampleUrl);
      executePersonalColorAnalysis(sampleUrl, lightingMode, null, 0, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Selecting one of the 7 body shapes resets stale manual 3-size overrides so the 3D silhouette & 3-sizes update immediately
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
      const dataUrl = reader.result;
      setPortraitDataUrl(dataUrl);
      setCustomPins(null);
      setRotationDeg(0);
      setCropRect(null);
      executePersonalColorAnalysis(dataUrl, lightingMode, null, 0, null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Capture selfie frame from live <video> or start camera if not active
  const handleCameraShutterDiagnose = () => {
    if (cameraActive && videoRef.current && videoRef.current.videoWidth > 0) {
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      const side = Math.min(vw, vh);
      const sx = Math.floor((vw - side) / 2);
      const sy = Math.floor((vh - side) / 2);

      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 480;
      const ctx = c.getContext('2d');
      if (cameraFacing === 'user') {
        ctx.translate(480, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, sx, sy, side, side, 0, 0, 480, 480);
      const capturedUrl = c.toDataURL('image/jpeg', 0.92);
      stopCameraStream();
      setPortraitDataUrl(capturedUrl);
      setCustomPins(null);
      setRotationDeg(0);
      setCropRect(null);
      executePersonalColorAnalysis(capturedUrl, lightingMode, null, 0, null);
    } else if (!cameraActive && portraitDataUrl) {
      // Re-run diagnosis with progress bar on current portrait or start camera
      setReanalyzingPct(20);
      setTimeout(() => setReanalyzingPct(65), 90);
      setTimeout(() => {
        setReanalyzingPct(100);
        executePersonalColorAnalysis(portraitDataUrl, lightingMode, customPins, rotationDeg, cropRect);
        setTimeout(() => setReanalyzingPct(null), 220);
      }, 180);
    } else {
      startCameraStream('user');
    }
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

    setReanalyzingPct(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 25;
      if (current >= 100) {
        clearInterval(interval);
        setReanalyzingPct(100);
        setLightingMode(targetMode);
        executePersonalColorAnalysis(
          portraitDataUrl,
          targetMode,
          customPins,
          rotationDeg,
          cropRect
        ).finally(() => {
          setTimeout(() => setReanalyzingPct(null), 240);
        });
      } else {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => allowDismiss && onClose?.()}>
      <div className="pcm-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Responsive Header */}
        <div className="pcm-header">
          <div className="pcm-header-title">
            <span className="rec-tag" style={{ marginBottom: 6, display: 'inline-block' }}>
              STEP {step} OF 2 · 3D MANNEQUIN &amp; PERSONAL COLOR STUDIO
            </span>
            <h2>
              {step === 1
                ? 'Step 1. 7대 체형 · 스리사이즈 · 3D 마네킹 실루엣 설정'
                : 'Step 2. 실시간 카메라/사진 퍼스널컬러 측정 · PCCS 톤 맵'}
            </h2>
          </div>

          <div className="pcm-header-actions">
            <button
              id="tab-step1-body-btn"
              type="button"
              className={`chip ${step === 1 ? 'active' : ''}`}
              onClick={() => setStep(1)}
            >
              Step 1. 7체형 · 3사이즈
            </button>
            <button
              id="tab-step2-pc-btn"
              type="button"
              className={`chip ${step === 2 ? 'active' : ''}`}
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
            <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              {[
                { deg: 0, label: '정면' },
                { deg: -16, label: '3/4 입체' },
                { deg: 90, label: '측면(복부)' },
              ].map((p) => (
                <button
                  key={p.deg}
                  type="button"
                  className={`atl-chip ${previewRotDeg === p.deg ? 'active' : ''}`}
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
                <span className="atl-eyebrow">LIVE 3D MODELING · 실시간 체형 및 퍼스널컬러 동기화</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 2 }}>
                  {resolvedAnat.shapeLabelKo} ·{' '}
                  <span style={{ color: 'var(--accent-terracotta)' }}>{activeSubType.labelKo}</span>
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 11px',
                    borderRadius: 999,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: activeMannequinColorHex,
                      border: '1px solid rgba(0,0,0,0.2)',
                    }}
                  />
                  3D 모델링 컬러: {activeMannequinColorHex}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
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
                paddingTop: 6,
                borderTop: '1px solid var(--border-hairline)',
              }}
            >
              <span style={{ fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                className={`atl-chip ${mannequinColorMode === 'skin_tone' && !customMannequinHex ? 'active' : ''}`}
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
              {/* Quick Subtype Swatches to test 3D modeling color change immediately */}
              {Object.values(PERSONAL_COLOR_SUBTYPES).map((st) => (
                <button
                  key={st.key}
                  id={`quick-3d-color-${st.key}`}
                  type="button"
                  title={`${st.labelKo} 컬러로 3D 모델링 변경`}
                  onClick={() => handleSelectSubType(st.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    background: selectedSubTypeKey === st.key ? 'var(--ink-primary)' : 'var(--bg-surface)',
                    color: selectedSubTypeKey === st.key ? '#fff' : 'var(--ink-secondary)',
                    border: '1px solid var(--border-hairline)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: st.bubbleHex,
                      border: '1px solid rgba(0,0,0,0.15)',
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
                    <label className="field-label">연령대 (10단계 통계 벤치마크 기준)</label>
                    <select
                      id="profile-age-group"
                      className="select-input"
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
                    <label className="field-label">성별 (체형 및 3사이즈 디폴트 기준)</label>
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
                    <label className="field-label">만 나이 (선택)</label>
                    <input
                      id="profile-age-input"
                      type="number"
                      className="text-input"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="예: 33"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">키 (cm)</label>
                    <input
                      id="profile-height-input"
                      type="number"
                      className="text-input"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="예: 175"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">몸무게 (kg)</label>
                    <input
                      id="profile-weight-input"
                      type="number"
                      className="text-input"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="예: 68"
                    />
                  </div>
                </div>

                {/* 7 Body Shape Cards with Mini 3D Mannequins */}
                <div style={{ marginTop: 6, marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
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
                      className="btn btn-secondary btn-sm"
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
                              style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                background: 'var(--ink-primary)',
                                color: '#fff',
                                padding: '2px 6px',
                                borderRadius: 999,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                              }}
                            >
                              <Check size={10} /> 선택됨
                            </span>
                          )}
                          {isRec && (
                            <span
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                background: 'var(--accent-sage)',
                                color: '#fff',
                                padding: '2px 5px',
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
                          <strong style={{ display: 'block', fontSize: '0.8rem', marginTop: 4 }}>
                            {b.shortKo}
                          </strong>
                          <span style={{ fontSize: '0.66rem', color: 'var(--ink-muted)' }}>
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
                    background: 'var(--bg-subtle)',
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-hairline)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>
                        체지방률 · 스리사이즈(가슴/허리/엉덩이) · 머리둘레 상세 치수 (선택)
                      </strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
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
                      <label className="field-label" style={{ fontSize: '0.75rem' }}>
                        체지방률 (%)
                      </label>
                      <input
                        id="input-body-fat"
                        type="number"
                        step="0.5"
                        className="text-input"
                        placeholder={`기본 ${resolvedAnat.defaults.bodyFatPct}%`}
                        value={bodyFatPct}
                        onChange={(e) => setBodyFatPct(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ fontSize: '0.75rem' }}>
                        가슴둘레 (cm)
                      </label>
                      <input
                        id="input-chest-cm"
                        type="number"
                        step="0.5"
                        className="text-input"
                        placeholder={`기본 ${resolvedAnat.defaults.chestCm}`}
                        value={chestCm}
                        onChange={(e) => setChestCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ fontSize: '0.75rem' }}>
                        허리둘레 (cm)
                      </label>
                      <input
                        id="input-waist-cm"
                        type="number"
                        step="0.5"
                        className="text-input"
                        placeholder={`기본 ${resolvedAnat.defaults.waistCm}`}
                        value={waistCm}
                        onChange={(e) => setWaistCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ fontSize: '0.75rem' }}>
                        엉덩이둘레 (cm)
                      </label>
                      <input
                        id="input-hip-cm"
                        type="number"
                        step="0.5"
                        className="text-input"
                        placeholder={`기본 ${resolvedAnat.defaults.hipCm}`}
                        value={hipCm}
                        onChange={(e) => setHipCm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ fontSize: '0.75rem' }}>
                        머리둘레 (cm)
                      </label>
                      <input
                        id="input-head-cm"
                        type="number"
                        step="0.5"
                        className="text-input"
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
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
                <input
                  type="checkbox"
                  checked={regenerateWardrobe}
                  onChange={(e) => setRegenerateWardrobe(e.target.checked)}
                />
                <span>
                  저장 시 선택한 연령대({ageGroup}) × 11부위 × 4계절 통계 벤치마크 수량으로 옷장 샘플 다시 채우기
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={handleSaveProfile}
                >
                  Step 1 체형만 먼저 저장
                </button>
                <button
                  id="goto-step2-personal-color-btn"
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStep(2)}
                >
                  <Camera size={16} /> Step 2. 카메라 촬영 · 퍼스널컬러 측정으로 이동
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
             STEP 2: CAMERA SELFIE / PHOTO UPLOAD + PCCS 12-TONE CHART & SUBTYPES (image_3.png)
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
                style={{
                  background: 'var(--verdict-consider-bg)',
                  color: 'var(--verdict-consider-ink)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  marginBottom: 12,
                  fontSize: '0.82rem',
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

            {/* Main Personal Color App Split View (Left: Camera Viewfinder, Right: PCCS 12-Tone Chart & Subtype Bubbles) */}
            <div className="pcm-pc-app-grid">
              {/* LEFT: Camera Selfie Viewfinder & Photo Upload (matches left half of image_3.png) */}
              <div className="pcm-camera-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#1c1f28',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      id="start-live-camera-btn"
                      type="button"
                      onClick={() => (cameraActive ? stopCameraStream() : startCameraStream('user'))}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        background: cameraActive ? '#39e75f' : 'rgba(255,255,255,0.14)',
                        color: cameraActive ? '#0d1318' : '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Camera size={13} />
                      {cameraActive ? '카메라 켜짐 (촬영 대기)' : '카메라로 바로 찍기'}
                    </button>
                    <button
                      id="upload-photo-btn"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.14)',
                        color: '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Upload size={13} /> 사진 올리기
                    </button>
                  </div>

                  <button
                    id="open-pin-editor-btn"
                    type="button"
                    onClick={() => setPinEditorOpen(true)}
                    style={{
                      padding: '5px 9px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      background: 'rgba(255,255,255,0.1)',
                      color: '#d0d7e2',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Crosshair size={12} /> 4핀 보정
                  </button>
                </div>

                {/* Camera / Portrait Viewport with Green Corner Brackets */}
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
                    <img
                      src={pcResult?.processedDataUrl || portraitDataUrl}
                      alt="퍼스널컬러 진단 얼굴"
                    />
                  )}

                  {/* Green 4-Corner Guide Brackets ([  ] from image_3.png) */}
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
                          style={{
                            position: 'absolute',
                            left: `${pin.x * 100}%`,
                            top: `${pin.y * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            padding: active ? '3px 8px' : '2px 6px',
                            borderRadius: 999,
                            background: active ? '#39e75f' : 'rgba(15, 21, 32, 0.82)',
                            color: active ? '#0d131c' : '#fff',
                            border: '1.5px solid #39e75f',
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            zIndex: 3,
                          }}
                        >
                          P{idx + 1} {pin.labelKo}
                        </button>
                      );
                    })}

                  {/* Bottom Status Pill ("지금, 진단 버튼을 눌러주세요" from image_3.png) */}
                  <div className="pcm-camera-prompt-pill">
                    {cameraActive
                      ? '지금, 진단 버튼을 눌러주세요'
                      : `진단 완료: ${activeSubType.labelKo} · 신뢰도 ${pcResult?.confidence ?? 92}%`}
                  </div>
                </div>

                {/* Frosted Bottom Shutter Bar (matches bottom of left side in image_3.png) */}
                <div className="pcm-camera-bottom-bar">
                  <button
                    type="button"
                    className="pcm-cam-side-btn"
                    title="앨범에서 내 사진 업로드"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={19} />
                  </button>

                  <button
                    id="camera-shutter-diagnose-btn"
                    type="button"
                    className="pcm-cam-shutter-btn"
                    title={cameraActive ? '사진 촬영 및 퍼스널컬러 측정' : '퍼스널컬러 즉시 측정 / 카메라 촬영'}
                    onClick={handleCameraShutterDiagnose}
                  >
                    <ScanFace size={28} />
                  </button>

                  <button
                    type="button"
                    className="pcm-cam-side-btn"
                    title={cameraActive ? '전면/후면 카메라 전환' : '실시간 카메라 켜기'}
                    onClick={() => (cameraActive ? handleFlipCamera() : startCameraStream('user'))}
                  >
                    <RefreshCw size={19} />
                  </button>
                </div>

                {/* Quick Sample Portrait Buttons for 1-Click Demo */}
                <div
                  style={{
                    padding: '10px 12px',
                    background: '#181b22',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
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
                        onClick={() => {
                          stopCameraStream();
                          const url = createSampleFaceDataUrl(s.k);
                          setPortraitDataUrl(url);
                          executePersonalColorAnalysis(url, lightingMode, null, 0, null);
                        }}
                        style={{
                          padding: '5px 4px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background:
                            selectedPersonalColor === s.k ? '#8347ff' : 'rgba(255,255,255,0.1)',
                          color: '#fff',
                        }}
                      >
                        {s.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: PCCS 12-Tone Map & Subtype Bubble Diagram (matches right half of image_3.png) */}
              <div className="pcm-pccs-panel">
                {/* 1) PCCS 12-Tone Chart (WARM TONE / COOL TONE) */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {chartToneFamily}
                    </h3>
                    <div style={{ display: 'flex', gap: 6 }}>
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
                    {/* Left Grayscale Value Bar (White N8.5 .. N2.5 Black) */}
                    <div className="pcm-grayscale-col">
                      {PCCS_GRAYSCALE_BAR.map((g) => (
                        <div
                          key={g.label}
                          className="pcm-gray-step"
                          style={{
                            background: g.hex,
                            color: g.textDark ? '#222' : '#fff',
                          }}
                        >
                          {g.label}
                        </div>
                      ))}
                    </div>

                    {/* Vertical Brightness Axis */}
                    <div className="pcm-axis-y">
                      <span>Brightness →</span>
                    </div>

                    {/* 12 PCCS Tone Hue Wheels */}
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
                                ? 'rgba(255, 158, 145, 0.16)'
                                : 'transparent',
                              border: isSelected
                                ? '2px solid var(--ink-primary)'
                                : isMatched
                                  ? '2px dashed #ff7a63'
                                  : '1px solid transparent',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: isMatched || isSelected ? 1 : 0.78,
                              transition: 'transform 0.16s ease, opacity 0.16s ease',
                            }}
                          >
                            {/* 12 Hue Dots arranged in a circle */}
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
                                    boxShadow: '0 0 1px rgba(0,0,0,0.25)',
                                  }}
                                />
                              );
                            })}
                            <span
                              style={{
                                fontSize: '0.56rem',
                                fontWeight: 700,
                                color: '#27272a',
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

                {/* 2) Subtype Bubble Diagram ("OOO님의 서브 유형" from bottom-right of image_3.png) */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-hairline)',
                    paddingTop: 16,
                    textAlign: 'center',
                  }}
                >
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: 8 }}>
                    {user?.displayName || '사용자'}님의 서브 유형
                  </h4>

                  <div className="pcm-subtype-bubbles-stage">
                    {/* Left Secondary Subtype Bubble */}
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

                    {/* Center Primary Subtype Bubble on Pedestal */}
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

                    {/* Right Secondary Subtype Bubble */}
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

                  <div style={{ maxWidth: 420, margin: '4px auto 0' }}>
                    <strong
                      style={{
                        display: 'block',
                        fontSize: '0.88rem',
                        color: '#f28b82',
                        marginBottom: 6,
                      }}
                    >
                      {activeSubType.tipTitleKo}
                    </strong>
                    <p style={{ fontSize: '0.83rem', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
                      {activeSubType.tipBodyKo}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Illumination Calibration Modes */}
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">
                <Sun size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                광원 전처리 보정 모드 (변경 시 0~100% 재분석 수행)
              </label>
              <div className="pcm-lighting-grid">
                {LIGHTING_MODES.map((m) => (
                  <button
                    key={m.key}
                    id={`lighting-mode-${m.key}`}
                    type="button"
                    onClick={() => handleRequestLightingModeChange(m.key)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border:
                        lightingMode === m.key
                          ? '2px solid var(--ink-primary)'
                          : '1px solid var(--border-hairline)',
                      background: lightingMode === m.key ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                      textAlign: 'left',
                    }}
                  >
                    <strong style={{ fontSize: '0.8rem', display: 'block' }}>{m.labelKo}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-secondary)' }}>
                      {m.descKo}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Lighting Mode Change Confirmation Popup */}
            {pendingLightingMode && (
              <div
                id="lighting-change-confirm-popup"
                style={{
                  background: '#121924',
                  color: '#fff',
                  padding: '14px 18px',
                  borderRadius: 12,
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  border: '1px solid #00e5ff',
                }}
              >
                <div style={{ fontSize: '0.84rem' }}>
                  <strong>전처리 조명 보정 모드를 변경하고 픽셀 언더톤을 0~100% 재분석하시겠습니까?</strong>
                  <div style={{ fontSize: '0.76rem', color: '#b8c4d4' }}>
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
                    className="btn btn-sage btn-sm"
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
                  background: 'var(--bg-subtle)',
                  padding: '12px 16px',
                  borderRadius: 10,
                  marginBottom: 14,
                  border: '1px solid var(--border-medium)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                  <strong>CIE L*a*b* 4부위 언더톤 및 PCCS 톤 맵 재분석 중...</strong>
                  <strong>{reanalyzingPct}%</strong>
                </div>
                <div style={{ height: 8, background: '#ddd6ca', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${reanalyzingPct}%`,
                      height: '100%',
                      background: 'var(--accent-sage)',
                      transition: 'width 0.08s linear',
                    }}
                  />
                </div>
              </div>
            )}

            {/* CIE L*a*b* 4-Pin & 20-Color Directional Drape Evidence */}
            {pcResult && (
              <div className="pcm-evidence-grid">
                {/* Confidence Formula & 4 Pins */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 12,
                    padding: 14,
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} /> CIE L*a*b* 4핀 측정값 &amp; 신뢰도 ({pcResult.confidence}%)
                    </strong>
                    <span style={{ color: 'var(--ink-muted)', fontSize: '0.74rem' }}>
                      L*{pcResult.lab.L} · a*{pcResult.lab.a} · b*{pcResult.lab.b} · ITA° {pcResult.lab.itaDeg}°
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {(pcResult.pins || []).map((pin, idx) => (
                      <div
                        key={pin.id}
                        onClick={() => setHighlightedPinId(pin.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: highlightedPinId === pin.id ? 'var(--bg-subtle)' : 'var(--bg-canvas)',
                          border: '1px solid var(--border-hairline)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="color-dot"
                            style={{ width: 12, height: 12, backgroundColor: pin.hex }}
                          />
                          <strong>P{idx + 1} {pin.labelKo}</strong>
                        </span>
                        <span style={{ color: 'var(--ink-muted)', fontSize: '0.7rem' }}>
                          L*{pin.lab.L} b*{pin.lab.b}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: '0.73rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                    <div>• {pcResult.confidenceBreakdown.formulaText}</div>
                    <div>
                      • 균일도 {pcResult.confidenceBreakdown.uniformity40}점 · 분리도{' '}
                      {pcResult.confidenceBreakdown.separation25}점 · 채도{' '}
                      {pcResult.confidenceBreakdown.chroma20}점 · 광원{' '}
                      {pcResult.confidenceBreakdown.lighting15}점
                    </div>
                  </div>
                </div>

                {/* Directional 20-Color Undertone Similarity (상/하/좌/우 각 5색 — 클릭 시 3D 모델링 색상 변경) */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', display: 'block', marginBottom: 8 }}>
                    20색 드레이프 조화 유사도 (컬러칩 클릭 시 상단 3D 모델링에 즉시 적용)
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Object.entries(pcResult.directional20 || {}).map(([dirKey, group]) => (
                      <div
                        key={dirKey}
                        style={{
                          padding: 8,
                          borderRadius: 8,
                          background: 'var(--bg-canvas)',
                          border: '1px solid var(--border-hairline)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 4 }}>
                          <strong>{group.seasonLabel.split(' ')[0]}</strong>
                          <strong style={{ color: 'var(--accent-sage)' }}>{group.avgSimilarity}%</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                          {group.swatches.map((sw) => (
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
                                  border:
                                    activeMannequinColorHex === sw.hex
                                      ? '2px solid var(--ink-primary)'
                                      : '1px solid rgba(0,0,0,0.12)',
                                }}
                              />
                              <span style={{ fontSize: '0.62rem', fontWeight: 600 }}>
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
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                ← Step 1 (7체형 · 3사이즈)로 돌아가기
              </button>
              <button
                id="save-profile-personal-color-btn"
                type="button"
                className="btn btn-primary"
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

        <PortraitCropAndPinEditorModal
          open={pinEditorOpen}
          imageSource={portraitDataUrl}
          initialPins={pcResult?.pins}
          initialRotation={rotationDeg}
          onClose={() => setPinEditorOpen(false)}
          onApply={({ pins, rotationDeg: nextRot, cropRect: nextCrop, processedDataUrl }) => {
            setCustomPins(pins);
            setRotationDeg(nextRot);
            setCropRect(nextCrop);
            if (processedDataUrl) setPortraitDataUrl(processedDataUrl);
            setPinEditorOpen(false);
            executePersonalColorAnalysis(
              processedDataUrl || portraitDataUrl,
              lightingMode,
              pins,
              nextRot,
              nextCrop
            );
          }}
        />
      </div>
    </div>
  );
}
