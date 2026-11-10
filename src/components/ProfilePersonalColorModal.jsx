import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Crosshair,
  Info,
  RotateCcw,
  Sun,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import {
  BODY_SHAPE_OPTIONS,
  suggestBodyShapeFromMetrics,
  resolveAnatomicalProfile,
} from '../utils/bodyAnthropometrics.js';
import {
  LIGHTING_MODES,
  PERSONAL_COLOR_DETAILS,
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
function createSampleFaceDataUrl(tone = 'warm_spring') {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#EAE6DF';
  ctx.fillRect(0, 0, 320, 320);

  const skinMap = {
    spring_warm: { base: '#F0CFB6', cheek: '#E8B39B' },
    summer_cool: { base: '#EDD2CE', cheek: '#DFB6BF' },
    autumn_warm: { base: '#DDB798', cheek: '#C99878' },
    winter_cool: { base: '#E2C4C2', cheek: '#C9A4A8' },
  };
  const pal = skinMap[tone] || skinMap.spring_warm;

  ctx.fillStyle = pal.base;
  ctx.beginPath();
  ctx.ellipse(160, 165, 78, 102, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pal.cheek;
  ctx.beginPath();
  ctx.arc(118, 175, 22, 0, Math.PI * 2);
  ctx.arc(202, 175, 22, 0, Math.PI * 2);
  ctx.fill();

  return c.toDataURL('image/jpeg', 0.92);
}

export default function ProfilePersonalColorModal({
  open,
  user,
  onCompleted,
  onClose,
  allowDismiss = true,
}) {
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1); // 1: Body & 7-Shape & 3-Sizes, 2: Personal Color Evidence
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

  // Step 2: Personal Color & Evidence State
  const [portraitDataUrl, setPortraitDataUrl] = useState('');
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
    user?.personalColor || 'autumn_warm'
  );
  const [saving, setSaving] = useState(false);

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

  // Live faceless 3D mannequin profile (body tone follows the personal color / detected skin)
  const previewSkinHex = pcResult?.skinToneHex || user?.skinToneHex || null;
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
      skin_tone_hex: previewSkinHex,
    }),
    [gender, heightCm, weightKg, bodyShape, bodyFatPct, chestCm, waistCm, hipCm, headCm, selectedPersonalColor, previewSkinHex]
  );

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
  };

  // Initialize default sample portrait analysis on first open of Step 2
  useEffect(() => {
    if (open && step === 2 && !portraitDataUrl) {
      const sampleUrl = createSampleFaceDataUrl(user?.personalColor || 'autumn_warm');
      setPortraitDataUrl(sampleUrl);
      executePersonalColorAnalysis(sampleUrl, lightingMode, null, 0, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;

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
    setBodyShape(rec);
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
      current += 20;
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
          setTimeout(() => setReanalyzingPct(null), 260);
        });
      } else {
        setReanalyzingPct(current);
      }
    }, 75);
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
        skin_tone_hex: pcResult?.skinToneHex || user?.skinToneHex || '#E2C6AE',
        skin_undertone_lab: pcResult?.lab || null,
        regenerate_wardrobe: regenerateWardrobe,
      };
      const res = await apiFetch('/auth/profile-setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCompleted?.(res.user, res.generatedWardrobe);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => allowDismiss && onClose?.()}>
      <div
        className="modal-box"
        style={{ maxWidth: 1020, width: '96vw', padding: '26px 28px', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div>
            <span className="rec-tag" style={{ marginBottom: 6, display: 'inline-block' }}>
              STEP {step} OF 2 · ANTHROPOMETRIC 3D &amp; CIE L*a*b* PERSONAL COLOR
            </span>
            <h2>
              {step === 1
                ? 'Step 1. 7대 체형 · 스리사이즈/머리둘레 · 3D 마네킹 피팅 설정'
                : 'Step 2. D65 퍼스널컬러 과학적 근거 분석 (CIE L*a*b* · 4핀 · 20색 드레이프)'}
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className={`chip ${step === 1 ? 'active' : ''}`}
              onClick={() => setStep(1)}
            >
              Step 1. 체형 · 3사이즈
            </button>
            <button
              type="button"
              className={`chip ${step === 2 ? 'active' : ''}`}
              onClick={() => setStep(2)}
            >
              Step 2. 퍼스널컬러 분석
            </button>
            {allowDismiss && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {step === 1 ? (
          <div>
            {/* Basic Anthropometric Row + Live 3D Mannequin Preview */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 270px',
                gap: 22,
                alignItems: 'start',
              }}
            >
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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
                <div style={{ marginTop: 8, marginBottom: 16 }}>
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
                      7대 체형 선택 (미니 3D 마네킹 실루엣 비교)
                    </label>
                    <button
                      id="recommend-body-shape-btn"
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleRecommendBodyShape}
                    >
                      <Wand2 size={14} /> BMI({resolvedAnat.bmi}) · 체지방 기반 추천 체형 자동 선택
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {BODY_SHAPE_OPTIONS.map((b) => {
                      const active = bodyShape === b.key;
                      const isRec = resolvedAnat.recommendedShape === b.key;
                      return (
                        <button
                          key={b.key}
                          id={`body-shape-card-${b.key}`}
                          type="button"
                          onClick={() => setBodyShape(b.key)}
                          style={{
                            padding: '10px 8px',
                            borderRadius: 12,
                            border: active
                              ? '2px solid var(--ink-primary)'
                              : '1px solid var(--border-hairline)',
                            background: active ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                            textAlign: 'center',
                            position: 'relative',
                          }}
                        >
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
                              skin_tone_hex: previewSkinHex,
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
                          <span style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>
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
                        입력 시 3D 마네킹 볼륨과 등신대 비율에 즉시 반영되며, 비워두면 키·몸무게·체형 기반 인체공학 디폴트가 자동 적용됩니다.
                      </div>
                    </div>
                    <button
                      id="clear-anthropometrics-btn"
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleResetMeasurementsToDefault}
                    >
                      <RotateCcw size={13} /> 치수 비우기 (디폴트 복원)
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
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

              {/* Right Column: Real-Time Faceless 3D Mannequin Preview */}
              <div className="atl-live-preview">
                <span className="atl-eyebrow">Live 3D Preview</span>
                <strong style={{ fontSize: '0.95rem', display: 'block', margin: '2px 0 8px' }}>
                  {resolvedAnat.shapeLabelKo}
                </strong>
                <Mannequin3DBodyPreview
                  user={livePreviewProfile}
                  poseYawDeg={previewRotDeg}
                  width={230}
                  height={310}
                  displayWidth="100%"
                  displayHeight={270}
                  style={{ objectFit: 'contain' }}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
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
                <div
                  style={{
                    marginTop: 10,
                    fontSize: '0.75rem',
                    color: 'var(--ink-secondary)',
                    textAlign: 'left',
                    lineHeight: 1.5,
                  }}
                >
                  <div>• BMI: <strong>{resolvedAnat.bmi}</strong> ({resolvedAnat.bmiCategory})</div>
                  <div>
                    • 3사이즈: <strong>{resolvedAnat.chestCm}-{resolvedAnat.waistCm}-{resolvedAnat.hipCm}cm</strong>
                  </div>
                  <div>
                    • 머리둘레: <strong>{resolvedAnat.headCm}cm ({resolvedAnat.headToBodyRatio}등신)</strong>
                  </div>
                  <div style={{ marginTop: 6, color: 'var(--ink-primary)' }}>{resolvedAnat.stylingAdviceKo}</div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--border-hairline)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
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

              <div style={{ display: 'flex', gap: 10 }}>
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
                  Step 2. 퍼스널컬러 과학 분석으로 이동
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* D65 Daylight Guidance Banner */}
            <div
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem' }}>
                <Sun size={18} color="var(--accent-terracotta)" />
                <span>
                  <strong>D65 표준 자연광(6500K) 촬영 가이드:</strong> 창가 자연광 아래에서 메이크업/필터 없이 촬영된 사진이 가장 정확합니다. 실내 조명에서 촬영하셨다면 아래 <strong>4가지 조명 전처리 보정 모드</strong>를 선택하세요.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> 내 얼굴/전신 사진 업로드
                </button>
                <button
                  id="open-pin-editor-btn"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPinEditorOpen(true)}
                >
                  <Crosshair size={14} /> 크롭 · 회전 · 4핀 직접 조정
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePortraitUpload}
              />
            </div>

            {/* 4 Illumination Calibration Modes */}
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">
                광원 전처리 보정 모드 (변경 시 확인 팝업 후 0~100% 재분석 수행)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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
                    <strong style={{ fontSize: '0.82rem', display: 'block' }}>{m.labelKo}</strong>
                    <span style={{ fontSize: '0.73rem', color: 'var(--ink-secondary)' }}>
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
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  border: '1px solid #00e5ff',
                }}
              >
                <div style={{ fontSize: '0.86rem' }}>
                  <strong>전처리 조명 보정 모드를 변경하고 픽셀 언더톤을 0~100% 재분석하시겠습니까?</strong>
                  <div style={{ fontSize: '0.78rem', color: '#b8c4d4' }}>
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
                  marginBottom: 16,
                  border: '1px solid var(--border-medium)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                  <strong>CIE L*a*b* 4부위 언더톤 및 20색 드레이프 유사도 재분석 중...</strong>
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

            {/* Evidence Dashboard: 4 Skin Pins + 20-Color Directional Matrix + Confidence Formula */}
            {pcResult && (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18 }}>
                {/* Left: Portrait with 4 Highlighted Skin Pins + Quick Tone Simulators */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#1a1d24',
                      marginBottom: 10,
                    }}
                  >
                    <img
                      src={pcResult.processedDataUrl || portraitDataUrl}
                      alt="피부 핀 분석"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {(pcResult.pins || []).map((pin, idx) => {
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
                            padding: active ? '4px 9px' : '2px 6px',
                            borderRadius: 999,
                            background: active ? '#00e5ff' : 'rgba(15, 21, 32, 0.85)',
                            color: active ? '#0d131c' : '#fff',
                            border: '2px solid #00e5ff',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                          }}
                        >
                          P{idx + 1} {pin.labelKo}
                        </button>
                      );
                    })}
                  </div>

                  {/* 4 Skin Pin Readout List */}
                  <div style={{ fontSize: '0.76rem' }}>
                    <strong style={{ display: 'block', marginBottom: 6 }}>
                      4개 피부 부위 참조 핀 측정값 (클릭 시 하이라이트)
                    </strong>
                    {(pcResult.pins || []).map((pin, idx) => (
                      <div
                        key={pin.id}
                        onClick={() => setHighlightedPinId(pin.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 7px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: highlightedPinId === pin.id ? 'var(--bg-subtle)' : 'transparent',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="color-dot"
                            style={{ width: 12, height: 12, backgroundColor: pin.hex }}
                          />
                          <strong>P{idx + 1} {pin.labelKo}</strong>
                        </span>
                        <span style={{ color: 'var(--ink-muted)' }}>
                          L*{pin.lab.L} a*{pin.lab.a} b*{pin.lab.b}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Sample Tone Presets for Quick Demo */}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', display: 'block', marginBottom: 4 }}>
                      원클릭 샘플 피부톤 시뮬레이션:
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {[
                        { k: 'spring_warm', l: '봄 웜 샘플' },
                        { k: 'summer_cool', l: '여름 쿨 샘플' },
                        { k: 'autumn_warm', l: '가을 웜 샘플' },
                        { k: 'winter_cool', l: '겨울 쿨 샘플' },
                      ].map((s) => (
                        <button
                          key={s.k}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '4px 6px' }}
                          onClick={() => {
                            const url = createSampleFaceDataUrl(s.k);
                            setPortraitDataUrl(url);
                            executePersonalColorAnalysis(url, lightingMode, null, 0, null);
                          }}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: CIE L*a*b* Verdict + Confidence Formula + 20-Color Directional Drape */}
                <div>
                  <div
                    style={{
                      background: 'var(--bg-subtle)',
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid var(--border-hairline)',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span className="rec-tag">CIE L*a*b* 피부분광 판독 결과</span>
                        <h3 style={{ fontSize: '1.2rem', marginTop: 4 }}>
                          {PERSONAL_COLOR_DETAILS[selectedPersonalColor]?.labelKo}
                        </h3>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '1.35rem', color: 'var(--accent-sage)' }}>
                          신뢰도 {pcResult.confidence}%
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          L* {pcResult.lab.L} · a* {pcResult.lab.a} · b* {pcResult.lab.b} · ITA° {pcResult.lab.itaDeg}°
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginTop: 8 }}>
                      {PERSONAL_COLOR_DETAILS[selectedPersonalColor]?.summaryKo}
                    </p>

                    {/* Manual Season Override Chips */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {Object.values(PERSONAL_COLOR_DETAILS).map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          className={`chip ${selectedPersonalColor === d.key ? 'active' : ''}`}
                          onClick={() => setSelectedPersonalColor(d.key)}
                        >
                          {d.labelKo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confidence Formula Disclosure (40 / 25 / 20 / 15) */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                      fontSize: '0.78rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Info size={14} />
                      <strong>{pcResult.confidenceBreakdown.formulaText}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <div>
                        부위간 균일도(40%): <strong>{pcResult.confidenceBreakdown.uniformity40}점</strong>
                      </div>
                      <div>
                        언더톤 분리도(25%): <strong>{pcResult.confidenceBreakdown.separation25}점</strong>
                      </div>
                      <div>
                        채도 명확도(20%): <strong>{pcResult.confidenceBreakdown.chroma20}점</strong>
                      </div>
                      <div>
                        D65 광원 적합도(15%): <strong>{pcResult.confidenceBreakdown.lighting15}점</strong>
                      </div>
                    </div>
                  </div>

                  {/* Directional 20-Color Undertone Similarity (상/하/좌/우 각 5색) */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <strong style={{ fontSize: '0.84rem', display: 'block', marginBottom: 8 }}>
                      상 · 하 · 좌 · 우 20색 언더톤 드레이프 조화 유사도 (%)
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {Object.entries(pcResult.directional20 || {}).map(([dirKey, group]) => (
                        <div
                          key={dirKey}
                          style={{
                            padding: 10,
                            borderRadius: 8,
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border-hairline)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 6 }}>
                            <strong>
                              {group.direction} · {group.seasonLabel}
                            </strong>
                            <strong style={{ color: 'var(--accent-sage)' }}>
                              평균 {group.avgSimilarity}%
                            </strong>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                            {group.swatches.map((sw) => (
                              <div key={sw.name} style={{ textAlign: 'center' }}>
                                <div
                                  style={{
                                    height: 24,
                                    borderRadius: 4,
                                    backgroundColor: sw.hex,
                                    border: '1px solid rgba(0,0,0,0.12)',
                                  }}
                                  title={sw.name}
                                />
                                <span style={{ fontSize: '0.66rem', fontWeight: 600 }}>
                                  {sw.similarity}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--border-hairline)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                ← Step 1 (체형 · 3사이즈)로 돌아가기
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
                  ? '체형 · 퍼스널컬러 · 통계 옷장 반영 중...'
                  : '체형 · 3사이즈 · 퍼스널컬러 확정 및 추천 반영'}
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
