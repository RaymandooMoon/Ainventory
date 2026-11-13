import { useRef, useState } from 'react';
import { Camera, Check, Palette, SlidersHorizontal, Sparkles, Upload } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  BODY_SHAPE_OPTIONS,
  sanitizeBodySpec,
} from '../services/parametricAvatar3D.ts';
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
import Character25DMannequin from './Character25DMannequin.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const SAMPLE_PORTRAIT_BUTTONS = [
  { key: 'spring_warm', ko: '봄 웜', en: 'Spring' },
  { key: 'summer_cool', ko: '여름 쿨', en: 'Summer' },
  { key: 'autumn_warm', ko: '가을 웜', en: 'Autumn' },
  { key: 'winter_cool', ko: '겨울 쿨', en: 'Winter' },
];

function isDarkSwatch(hex = '#DFBA9B') {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function ProfileModalContent({
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
  const isSignedAccount = Boolean(user && !user.isSampleDemo);

  // Gender is locked to signup / stored profile and is never exposed as a post-signup switch
  const lockedGender =
    (isSignedAccount
      ? user?.gender
      : bodySpec?.gender || skinProfile?.gender) === 'female'
      ? 'female'
      : 'male';

  const [activeTab, setActiveTab] = useState(() =>
    initialTab === 'body' ? 'body' : 'skin'
  );

  // Tab 1: Photo & Skin Tone state
  const [draftHex, setDraftHex] = useState(() => skinProfile?.skinToneHex || '#DFBA9B');
  const [draftSeason, setDraftSeason] = useState(() =>
    normalizeSeasonKey(skinProfile?.personalColor || 'autumn_warm')
  );
  const [draftSubType, setDraftSubType] = useState(
    () => skinProfile?.subTypeLabelKo || '가을 웜 뮤트'
  );
  const [draftPresetKey, setDraftPresetKey] = useState(
    () => skinProfile?.presetKey || 'autumn_beige'
  );

  const [lightingMode, setLightingMode] = useState('auto_d65');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Tab 2: Body Profile state
  const [draftBody, setDraftBody] = useState(() =>
    sanitizeBodySpec({ ...bodySpec, gender: lockedGender })
  );

  const runAnalysis = async (imgSrc, nextLighting = lightingMode, focusPoint = undefined) => {
    if (!imgSrc) return;
    setAnalyzing(true);
    setErrorMsg('');
    try {
      const res = await analyzePortraitSkinTone(imgSrc, {
        lightingMode: nextLighting,
        focusPoint,
      });
      setAnalysisResult(res);
      setDraftHex(res.skinToneHex);
      setDraftSeason(res.personalColor);
      setDraftSubType(res.subTypeLabelKo);
      setDraftPresetKey(res.matchedPresetKey);
      triggerHaptic('light');
    } catch (err) {
      setErrorMsg(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '얼굴 피부톤 분석 실패', 'Failed to analyze portrait')
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        setSourceImageUrl(dataUrl);
        void runAnalysis(dataUrl, lightingMode);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSamplePortrait = (seasonKey) => {
    const sampleUrl = createSyntheticSamplePortrait(seasonKey);
    if (!sampleUrl) return;
    setSourceImageUrl(sampleUrl);
    void runAnalysis(sampleUrl, lightingMode);
  };

  const handleChangeLighting = (nextMode) => {
    setLightingMode(nextMode);
    if (sourceImageUrl) {
      void runAnalysis(sourceImageUrl, nextMode);
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
    void runAnalysis(sourceImageUrl, lightingMode, { x: fullX, y: fullY });
  };

  const handlePickPreset = (preset) => {
    triggerHaptic('selection');
    setDraftPresetKey(preset.key);
    setDraftHex(preset.skinToneHex);
    setDraftSeason(preset.personalColor);
    setDraftSubType(preset.subTypeLabelKo);
  };

  const handleCustomHexChange = (e) => {
    const hex = String(e.target.value || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) return;
    const closest = findClosestSkinPreset(hex, draftSeason);
    setDraftHex(hex);
    setDraftPresetKey(closest.key);
  };

  const handleApplySkin = () => {
    const seasonInfo = SEASON_BEST_SWATCHES[draftSeason] || SEASON_BEST_SWATCHES.autumn_warm;
    triggerHaptic('medium');
    onApplySkinProfile?.({
      skinToneHex: draftHex,
      personalColor: draftSeason,
      personalColorLabelKo: seasonInfo.labelKo,
      subTypeLabelKo: draftSubType,
      gender: lockedGender,
      presetKey: draftPresetKey,
    });
    onClose?.();
  };

  const handleApplyBody = () => {
    const cleaned = sanitizeBodySpec({ ...draftBody, gender: lockedGender });
    triggerHaptic('medium');
    onApplyBodySpec?.(cleaned);
    onClose?.();
  };

  const activeSeasonMeta = SEASON_BEST_SWATCHES[draftSeason] || SEASON_BEST_SWATCHES.autumn_warm;
  const localizedSubType =
    lang === 'en'
      ? translateSubTypeLabel(draftSubType, draftSeason)
      : draftSubType;
  const localizedSeasonLabel =
    lang === 'en' ? activeSeasonMeta.labelEn : activeSeasonMeta.labelKo;

  return (
    <div className="skin-modal-body">
      {/* Unified Profile Segmented Switcher: [Photo & Skin | Body Profile] */}
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
          <Palette size={14} />
          <span>{tx(lang, '사진 · 피부톤', 'Photo & Skin')}</span>
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
          <SlidersHorizontal size={14} />
          <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
        </button>
      </div>

      {/* Shared Live Character Preview + Skin/Body Summary */}
      <div className="skin-modal-preview-grid">
        <div className="skin-modal-character-box">
          <div className="skin-modal-character-stage">
            <Character25DMannequin
              skinToneHex={draftHex}
              personalColor={draftSeason}
              gender={lockedGender}
              bodySpec={sanitizeBodySpec({ ...draftBody, gender: lockedGender })}
              theme={theme}
              lang={lang}
              compact
            />
          </div>
          <span className="body-spec-account-badge tabular-nums">
            {draftBody.heightCm}cm · {draftBody.weightKg}kg
          </span>
        </div>

        <div className="skin-modal-summary-box">
          {activeTab === 'skin' && analysisResult?.previewDataUrl ? (
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
                      width: `${analysisResult.faceBoxPreview.width * 100}%`,
                      height: `${analysisResult.faceBoxPreview.height * 100}%`,
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
            </>
          ) : (
            <div className="skin-tone-hero-badge">
              <span
                className="skin-tone-large-swatch"
                style={{ backgroundColor: draftHex }}
              />
              <div>
                <strong className="skin-tone-diagnosis-title">{localizedSubType}</strong>
                <span className="skin-tone-hex-code tabular-nums">
                  {draftHex} · {localizedSeasonLabel}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'skin' && analysisResult && (
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
                <span style={{ backgroundColor: sw.hex }} />
                <small>{lang === 'en' ? sw.nameEn : sw.name}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'skin' ? (
        <>
          {/* Section 1: Portrait Upload / Camera / 1-Click Sample Analysis */}
          <div className="skin-modal-section">
            <div className="skin-modal-section-head">
              <span>{tx(lang, '얼굴 사진 분석', 'Face Photo Analysis')}</span>
              {analyzing && (
                <span className="skin-analyzing-tag">
                  {tx(lang, '얼굴 인식 중...', 'Detecting face...')}
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
                onClick={() => galleryInputRef.current?.click()}
              >
                <Upload size={15} />
                <span>{tx(lang, '사진 업로드', 'Upload Photo')}</span>
              </button>
              <button
                type="button"
                className="hig-secondary-btn"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={15} />
                <span>{tx(lang, '카메라 촬영', 'Camera')}</span>
              </button>
            </div>

            <div className="skin-sample-test-rail">
              {SAMPLE_PORTRAIT_BUTTONS.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  data-sample-portrait={btn.key}
                  className="skin-sample-chip"
                  onClick={() => handleSelectSamplePortrait(btn.key)}
                >
                  <Sparkles size={12} />
                  <span>{lang === 'en' ? btn.en : btn.ko}</span>
                </button>
              ))}
            </div>

            <div className="hig-pill-rail" style={{ marginBottom: 0 }}>
              {LIGHTING_CALIBRATION_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`hig-filter-pill ${lightingMode === m.key ? 'active' : ''}`}
                  onClick={() => handleChangeLighting(m.key)}
                >
                  {lang === 'en' ? m.shortEn : m.shortKo}
                </button>
              ))}
            </div>

            {errorMsg && <p className="hig-form-error">{errorMsg}</p>}
          </div>

          {/* Section 2: 8 Tone-by-Tone Presets + Custom Color Picker */}
          <div className="skin-modal-section">
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
                    className={`skin-preset-card ${selected ? 'is-selected' : ''}`}
                    onClick={() => handlePickPreset(preset)}
                  >
                    <span
                      className="skin-preset-swatch"
                      style={{ backgroundColor: preset.skinToneHex }}
                    >
                      {selected && <Check size={13} strokeWidth={2.8} color={checkStroke} />}
                    </span>
                    <div className="skin-preset-meta">
                      <strong>{lang === 'en' ? preset.shortEn : preset.shortKo}</strong>
                      <small>
                        {lang === 'en' ? preset.subTypeLabelEn : preset.subTypeLabelKo}
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            id={CARBON_DOM_CONTRACT.skinToneApplyBtnId}
            type="button"
            className="hig-primary-cta-btn"
            onClick={handleApplySkin}
          >
            <Check size={17} />
            <span>{tx(lang, '피부톤 적용', 'Apply Skin Tone')}</span>
          </button>
        </>
      ) : (
        <div className="body-spec-sheet">
          <div className="body-spec-slider-block">
            <div className="body-spec-slider-head tabular-nums">
              <span>{tx(lang, '신장', 'Height')}</span>
              <strong>{draftBody.heightCm} cm</strong>
            </div>
            <input
              type="range"
              min={148}
              max={198}
              step={1}
              value={draftBody.heightCm}
              aria-label={tx(lang, '신장 cm', 'Height cm')}
              onChange={(e) =>
                setDraftBody((prev) => ({ ...prev, heightCm: Number(e.target.value) }))
              }
            />
          </div>

          <div className="body-spec-slider-block">
            <div className="body-spec-slider-head tabular-nums">
              <span>{tx(lang, '체중', 'Weight')}</span>
              <strong>{draftBody.weightKg} kg</strong>
            </div>
            <input
              type="range"
              min={40}
              max={120}
              step={1}
              value={draftBody.weightKg}
              aria-label={tx(lang, '체중 kg', 'Weight kg')}
              onChange={(e) =>
                setDraftBody((prev) => ({ ...prev, weightKg: Number(e.target.value) }))
              }
            />
          </div>

          <div className="body-spec-preset-group">
            <span className="body-spec-label">{tx(lang, '체형 타입', 'Body Type')}</span>
            <div className="body-spec-shape-pills">
              {BODY_SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-body-shape-btn={opt.key}
                  className={`hig-filter-pill ${draftBody.bodyShape === opt.key ? 'active' : ''}`}
                  onClick={() => setDraftBody((prev) => ({ ...prev, bodyShape: opt.key }))}
                >
                  {lang === 'en' ? opt.labelEn : opt.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="body-spec-fine-grid">
            {[
              {
                key: 'shoulderScale',
                label: tx(lang, '어깨', 'Shoulder'),
                min: 0.88,
                max: 1.18,
              },
              {
                key: 'waistScale',
                label: tx(lang, '허리', 'Waist'),
                min: 0.84,
                max: 1.22,
              },
              {
                key: 'hipScale',
                label: tx(lang, '골반', 'Hip'),
                min: 0.88,
                max: 1.2,
              },
            ].map((ctrl) => (
              <label key={ctrl.key} className="body-spec-fine-item tabular-nums">
                <div className="body-spec-slider-head">
                  <span>{ctrl.label}</span>
                  <small>{Math.round((draftBody[ctrl.key] || 1) * 100)}%</small>
                </div>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={0.02}
                  value={draftBody[ctrl.key] || 1}
                  aria-label={`${ctrl.label} %`}
                  onChange={(e) =>
                    setDraftBody((prev) => ({
                      ...prev,
                      [ctrl.key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <button
            id="apply-body-spec-btn"
            type="button"
            className="hig-primary-cta-btn"
            onClick={handleApplyBody}
          >
            <Check size={16} />
            <span>{tx(lang, '체형 적용', 'Apply Body Profile')}</span>
          </button>
        </div>
      )}
    </div>
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
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={lang}
      title={tx(lang, '프로필 · 피부톤 & 체형', 'Profile · Skin Tone & Body')}
      maxWidth={560}
    >
      {open && (
        <ProfileModalContent
          key={initialTab}
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
      )}
    </ResponsiveSheetModal>
  );
}
