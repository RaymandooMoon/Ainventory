import { useRef, useState } from 'react';
import { Camera, Check, Sparkles, Upload } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  LIGHTING_CALIBRATION_MODES,
  SEASON_BEST_SWATCHES,
  SKIN_TONE_MANNEQUIN_PRESETS,
  analyzePortraitSkinTone,
  createSyntheticSamplePortrait,
  findClosestSkinPreset,
  normalizeSeasonKey,
} from '../services/skinToneAnalyzer.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import Character25DMannequin from './Character25DMannequin.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const SAMPLE_PORTRAIT_BUTTONS = [
  { key: 'spring_warm', label: '봄 웜 인물 샘플' },
  { key: 'summer_cool', label: '여름 쿨 인물 샘플' },
  { key: 'autumn_warm', label: '가을 웜 인물 샘플' },
  { key: 'winter_cool', label: '겨울 쿨 인물 샘플' },
];

function isDarkSwatch(hex = '#DFBA9B') {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function SkinToneModalContent({
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  onApplySkinProfile,
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const isSignedAccount = Boolean(user && !user.isSampleDemo);

  const [draftHex, setDraftHex] = useState(() => skinProfile?.skinToneHex || '#DFBA9B');
  const [draftSeason, setDraftSeason] = useState(() =>
    normalizeSeasonKey(skinProfile?.personalColor || 'autumn_warm')
  );
  const [draftSubType, setDraftSubType] = useState(
    () => skinProfile?.subTypeLabelKo || '가을 웜 뮤트'
  );
  const [draftGender, setDraftGender] = useState(() =>
    (isSignedAccount ? user?.gender : skinProfile?.gender) === 'female' ? 'female' : 'male'
  );
  const [draftPresetKey, setDraftPresetKey] = useState(
    () => skinProfile?.presetKey || 'autumn_beige'
  );

  const [lightingMode, setLightingMode] = useState('auto_d65');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const runAnalysis = async (imgSrc, nextLighting = lightingMode) => {
    if (!imgSrc) return;
    setAnalyzing(true);
    setErrorMsg('');
    try {
      const res = await analyzePortraitSkinTone(imgSrc, { lightingMode: nextLighting });
      setAnalysisResult(res);
      setDraftHex(res.skinToneHex);
      setDraftSeason(res.personalColor);
      setDraftSubType(res.subTypeLabelKo);
      setDraftPresetKey(res.matchedPresetKey);
      triggerHaptic('light');
    } catch (err) {
      setErrorMsg(err?.message || '분석 실패');
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

  const handleApply = () => {
    const seasonInfo = SEASON_BEST_SWATCHES[draftSeason] || SEASON_BEST_SWATCHES.autumn_warm;
    triggerHaptic('medium');
    onApplySkinProfile?.({
      skinToneHex: draftHex,
      personalColor: draftSeason,
      personalColorLabelKo: seasonInfo.labelKo,
      subTypeLabelKo: draftSubType,
      gender: isSignedAccount ? (user?.gender === 'female' ? 'female' : 'male') : draftGender,
      presetKey: draftPresetKey,
    });
    onClose?.();
  };

  const activeSeasonMeta = SEASON_BEST_SWATCHES[draftSeason] || SEASON_BEST_SWATCHES.autumn_warm;

  return (
    <div className="skin-modal-body">
      <div className="skin-modal-preview-grid">
          <div className="skin-modal-character-box">
            <div className="skin-modal-character-stage">
              <Character25DMannequin
                skinToneHex={draftHex}
                personalColor={draftSeason}
                gender={draftGender}
                bodySpec={bodySpec ? { ...bodySpec, gender: draftGender } : null}
                theme={theme}
                compact
              />
            </div>
            {isSignedAccount ? (
              <span className="body-spec-account-badge">
                회원 정보 · {draftGender === 'female' ? '여성' : '남성'}
              </span>
            ) : (
              <div className="skin-modal-gender-switch" role="radiogroup" aria-label="2.5D 캐릭터 체형">
                <button
                  type="button"
                  className={`skin-gender-pill ${draftGender === 'male' ? 'active' : ''}`}
                  onClick={() => setDraftGender('male')}
                >
                  남성 2.5D
                </button>
                <button
                  type="button"
                  className={`skin-gender-pill ${draftGender === 'female' ? 'active' : ''}`}
                  onClick={() => setDraftGender('female')}
                >
                  여성 2.5D
                </button>
              </div>
            )}
          </div>

          <div className="skin-modal-summary-box">
            {analysisResult?.previewDataUrl ? (
              <div className="skin-portrait-pin-frame">
                <img
                  src={analysisResult.previewDataUrl}
                  alt="피부톤 샘플링 프리뷰"
                  className="skin-portrait-pin-img"
                />
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
                    title={`${pin.labelKo}: ${pin.hex}`}
                    style={{
                      left: `${pin.x * 100}%`,
                      top: `${pin.y * 100}%`,
                      backgroundColor: pin.hex,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="skin-tone-hero-badge">
                <span
                  className="skin-tone-large-swatch"
                  style={{ backgroundColor: draftHex }}
                />
                <div>
                  <strong className="skin-tone-diagnosis-title">{draftSubType}</strong>
                  <span className="skin-tone-hex-code tabular-nums">
                    {draftHex} · {activeSeasonMeta.labelKo}
                  </span>
                </div>
              </div>
            )}

            {analysisResult && (
              <div className="skin-lab-metrics tabular-nums">
                <span>
                  추출 피부톤 <strong>{analysisResult.skinToneHex}</strong>
                </span>
                <span>
                  L* {analysisResult.lab.L} · a* {analysisResult.lab.a} · b* {analysisResult.lab.b}
                </span>
                <span>
                  명도각 ITA° {analysisResult.lab.itaDeg}° · 신뢰도 {analysisResult.confidence}%
                </span>
              </div>
            )}

            <div className="skin-best-drape-row" aria-label="베스트 매칭 컬러">
              {activeSeasonMeta.colors.map((sw) => (
                <div key={sw.hex} className="skin-best-drape-chip" title={sw.name}>
                  <span style={{ backgroundColor: sw.hex }} />
                  <small>{sw.name}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 1: Portrait Upload / Camera / 1-Click Sample Analysis */}
        <div className="skin-modal-section">
          <div className="skin-modal-section-head">
            <span>사진 분석</span>
            {analyzing && <span className="skin-analyzing-tag">분석 중</span>}
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
              <span>사진 업로드</span>
            </button>
            <button
              type="button"
              className="hig-secondary-btn"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={15} />
              <span>촬영</span>
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
                <span>{btn.label.replace(' 인물 샘플', '')}</span>
              </button>
            ))}
          </div>

          <div className="hig-pill-rail">
            {LIGHTING_CALIBRATION_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`hig-filter-pill ${lightingMode === m.key ? 'active' : ''}`}
                onClick={() => handleChangeLighting(m.key)}
              >
                {m.shortKo}
              </button>
            ))}
          </div>

          {errorMsg && <p className="hig-form-error">{errorMsg}</p>}
        </div>

        {/* Section 2: 8 Tone-by-Tone Presets + Custom Color Picker */}
        <div className="skin-modal-section">
          <div className="skin-modal-section-head">
            <span>톤 프리셋</span>
            <label className="skin-custom-color-label">
              <span>직접 선택</span>
              <input
                type="color"
                value={draftHex}
                onChange={handleCustomHexChange}
                aria-label="피부톤 색상 미세조정"
              />
            </label>
          </div>

          <div className="skin-preset-grid">
            {SKIN_TONE_MANNEQUIN_PRESETS.map((preset) => {
              const selected = draftPresetKey === preset.key && draftHex === preset.skinToneHex;
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
                    <strong>{preset.shortKo}</strong>
                    <small>{preset.subTypeLabelKo}</small>
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
          onClick={handleApply}
        >
          <Check size={17} />
          <span>적용</span>
        </button>
    </div>
  );
}

export default function SkinToneAnalysisModal({
  open,
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  onApplySkinProfile,
}) {
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      title="피부톤 설정"
      maxWidth={540}
    >
      {open && (
        <SkinToneModalContent
          onClose={onClose}
          user={user}
          skinProfile={skinProfile}
          bodySpec={bodySpec}
          theme={theme}
          onApplySkinProfile={onApplySkinProfile}
        />
      )}
    </ResponsiveSheetModal>
  );
}
