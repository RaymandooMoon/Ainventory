import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  AVATAR_ARCHETYPE_OPTIONS,
  AVATAR_FRAME_OPTIONS,
  CHEST_FORM_OPTIONS,
  EYE_SHAPE_OPTIONS,
  FACIAL_HAIR_OPTIONS,
  HAIR_COLOR_SWATCHES,
  HAIR_STYLE_OPTIONS,
  HEAD_SHAPE_OPTIONS,
  MST_UNDERTONE_OPTIONS,
  resolveCoupledBodyMetrics,
  sanitizeAvatarSpec,
} from '../services/avatarSpecStore.ts';
import { MST_BASE_LEVELS, getMstSwatch } from '../services/monkSkinTone.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

const UNIQUE_LEGACY_BODY_SHAPE_BY_ARCHETYPE = {
  petite: 'slim',
  rectangle: 'standard_balanced',
  inverted_triangle: 'upper_developed',
  pear: 'lower_developed',
  athletic: 'muscular',
};

function isDarkSwatch(hex = '#DFBA9B') {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function formatSignedBiasPct(value) {
  const pct = Math.round((Number(value) || 0) * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function defaultChestFormForFrameKey(frameKey, currentChestForm) {
  if (frameKey === 'feminine') return 'contoured';
  if (frameKey === 'masculine') return 'pectoral';
  if (frameKey === 'androgynous') return 'flat';
  return currentChestForm || 'flat';
}

export function MstSkinAndAppearanceControls({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
  availablePortraitUrl = '',
  onSelectMstSwatch,
}) {
  const [hairStudioOpen, setHairStudioOpen] = useState(true);
  const [facialStudioOpen, setFacialStudioOpen] = useState(true);

  const appearance = draftSpec.appearance;
  const resolvedMstSwatch = getMstSwatch(appearance.mstLevel, appearance.mstUndertone);
  const portraitCandidateUrl = availablePortraitUrl || appearance.facePhotoUrl || '';
  const isFacePhotoAttached = Boolean(appearance.facePhotoUrl);

  const handlePickMstCell = (nextLevel, nextUndertone) => {
    triggerHaptic('selection');
    const swatch = getMstSwatch(nextLevel, nextUndertone);
    onChangeDraftSpec((prev) =>
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
    onSelectMstSwatch?.(swatch);
  };

  const patchAppearance = (partialApp) => {
    onChangeDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        appearance: {
          ...prev.appearance,
          ...partialApp,
        },
      })
    );
  };

  const handleToggleFacePhoto = () => {
    if (!portraitCandidateUrl && !isFacePhotoAttached) return;
    triggerHaptic('selection');
    patchAppearance({
      facePhotoUrl: isFacePhotoAttached ? null : portraitCandidateUrl,
    });
  };

  const activeHairLabel = (() => {
    const found = HAIR_STYLE_OPTIONS.find((item) => item.key === appearance.hairStyle);
    if (!found) return '';
    return lang === 'en' ? found.shortEn : found.shortKo;
  })();

  const activeHeadEyeLabel = (() => {
    const head = HEAD_SHAPE_OPTIONS.find((item) => item.key === appearance.headShape);
    const eye = EYE_SHAPE_OPTIONS.find((item) => item.key === appearance.eyeShape);
    const hText = head ? (lang === 'en' ? head.shortEn : head.shortKo) : '';
    const eText = eye ? (lang === 'en' ? eye.shortEn : eye.shortKo) : '';
    return [hText, eText].filter(Boolean).join(' · ');
  })();

  return (
    <div className="avatar-studio-stack">
      {/* 1. Monk Skin Tone (MST 1-10) x 4 Undertones Interactive Selector */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, 'Monk 피부톤 스펙트럼 (MST 1–10)', 'Monk Skin Tone Scale (MST 1–10)')}
          </span>
          <span
            className="avatar-mst-code-pill tabular-nums"
            data-mst-code-badge={resolvedMstSwatch.code}
          >
            {resolvedMstSwatch.code} · {appearance.skinToneHex}
          </span>
        </div>

        <div
          className="avatar-mst-level-grid"
          role="group"
          aria-label={tx(lang, 'MST 명도 레벨 1~10', 'MST Luminance Levels 1 to 10')}
        >
          {MST_BASE_LEVELS.map((lvlItem) => {
            const cellSwatch = getMstSwatch(lvlItem.level, appearance.mstUndertone);
            const selected = appearance.mstLevel === lvlItem.level;
            const checkStroke = isDarkSwatch(cellSwatch.hex) ? '#FFFFFF' : '#1D1D1F';
            const padded = String(lvlItem.level).padStart(2, '0');
            const cellTitle = lang === 'en' ? cellSwatch.labelEn : cellSwatch.labelKo;

            return (
              <button
                key={lvlItem.level}
                type="button"
                data-mst-level={lvlItem.level}
                aria-pressed={selected}
                aria-label={`MST ${padded} (${cellSwatch.hex})`}
                title={`${cellTitle} (${cellSwatch.hex})`}
                className={`avatar-mst-level-btn ${selected ? 'is-selected' : ''}`}
                onClick={() => handlePickMstCell(lvlItem.level, appearance.mstUndertone)}
              >
                <span
                  className="avatar-mst-swatch-dot"
                  style={{ backgroundColor: cellSwatch.hex }}
                >
                  {selected && <Check size={13} strokeWidth={3} color={checkStroke} />}
                </span>
                <span className="avatar-mst-level-code tabular-nums">MST {padded}</span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '언더톤 세부 선택', 'Undertone Calibration')}</span>
          <span>{lang === 'en' ? resolvedMstSwatch.shortEn : resolvedMstSwatch.shortKo}</span>
        </div>

        <div
          className="avatar-mst-undertone-row"
          role="group"
          aria-label={tx(lang, '피부 언더톤 선택', 'Skin Undertone Selection')}
        >
          {MST_UNDERTONE_OPTIONS.map((ut) => {
            const previewSwatch = getMstSwatch(appearance.mstLevel, ut.key);
            const selected = appearance.mstUndertone === ut.key;
            return (
              <button
                key={ut.key}
                type="button"
                data-mst-undertone={ut.key}
                aria-pressed={selected}
                title={lang === 'en' ? ut.labelEn : ut.labelKo}
                className={`avatar-mst-undertone-pill ${selected ? 'is-selected' : ''}`}
                onClick={() => handlePickMstCell(appearance.mstLevel, ut.key)}
              >
                <span
                  className="avatar-mst-undertone-dot"
                  style={{ backgroundColor: previewSwatch.hex }}
                  aria-hidden="true"
                />
                <span>{lang === 'en' ? ut.shortEn : ut.shortKo}</span>
              </button>
            );
          })}
        </div>

        {portraitCandidateUrl ? (
          <div className="avatar-face-photo-row">
            <div className="avatar-face-photo-info">
              <img
                src={portraitCandidateUrl}
                alt={tx(lang, '업로드된 인물 사진', 'Uploaded portrait preview')}
                className="avatar-face-photo-thumb"
              />
              <div className="avatar-face-photo-text">
                <strong>
                  {tx(lang, '얼굴 사진을 아바타에 연결', 'Attach Portrait Photo to Avatar')}
                </strong>
                <small>
                  {isFacePhotoAttached
                    ? tx(lang, '아바타 얼굴 레퍼런스 활성', 'Portrait reference attached')
                    : tx(lang, '일러스트 이목구비 모드 사용 중', 'Using stylized facial features')}
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
              className={`avatar-switch-btn ${isFacePhotoAttached ? 'is-on' : ''}`}
              onClick={handleToggleFacePhoto}
            >
              {isFacePhotoAttached ? tx(lang, '연결됨', 'ON') : tx(lang, '해제', 'OFF')}
            </button>
          </div>
        ) : null}
      </div>

      {/* 2. Gender-Free Hairstyle, Hair Color & Facial Hair Studio */}
      <div className="avatar-studio-card">
        <button
          type="button"
          className="avatar-studio-collapse-btn"
          aria-expanded={hairStudioOpen}
          onClick={() => setHairStudioOpen((prev) => !prev)}
        >
          <span className="avatar-studio-card-title">
            {tx(lang, '헤어스타일 · 헤어 컬러 · 수염', 'Hairstyle, Hair Color & Facial Hair')}
          </span>
          <span className="avatar-studio-collapse-meta">
            <span>{activeHairLabel}</span>
            {hairStudioOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        {hairStudioOpen && (
          <>
            <div className="avatar-studio-subhead">
              <span>{tx(lang, '젠더프리 헤어스타일', 'Gender-Free Hairstyle')}</span>
            </div>
            <div
              className="avatar-chip-grid"
              role="group"
              aria-label={tx(lang, '헤어스타일 선택', 'Hairstyle Options')}
            >
              {HAIR_STYLE_OPTIONS.map((opt) => {
                const active = appearance.hairStyle === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    data-hair-style-btn={opt.key}
                    aria-pressed={active}
                    title={lang === 'en' ? opt.labelEn : opt.labelKo}
                    className={`avatar-studio-chip ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      patchAppearance({ hairStyle: opt.key });
                    }}
                  >
                    {lang === 'en' ? opt.shortEn : opt.shortKo}
                  </button>
                );
              })}
            </div>

            <div className="avatar-studio-subhead">
              <span>{tx(lang, '헤어 컬러', 'Hair Color')}</span>
              <label className="skin-custom-color-label">
                <span>{tx(lang, '커스텀', 'Custom')}</span>
                <input
                  type="color"
                  value={appearance.hairColorHex}
                  aria-label={tx(lang, '커스텀 헤어 컬러', 'Custom hair color')}
                  onChange={(e) => {
                    const hex = String(e.target.value || '').toUpperCase();
                    if (/^#[0-9A-F]{6}$/.test(hex)) {
                      patchAppearance({ hairColorHex: hex });
                    }
                  }}
                />
              </label>
            </div>
            <div
              className="avatar-hair-color-row"
              role="group"
              aria-label={tx(lang, '헤어 컬러 프리셋', 'Hair Color Swatches')}
            >
              {HAIR_COLOR_SWATCHES.map((sw) => {
                const selected =
                  appearance.hairColorHex.toUpperCase() === sw.hex.toUpperCase();
                const checkStroke = isDarkSwatch(sw.hex) ? '#FFFFFF' : '#1D1D1F';
                const label = lang === 'en' ? sw.labelEn : sw.labelKo;
                return (
                  <button
                    key={sw.key}
                    type="button"
                    data-hair-color-btn={sw.key}
                    aria-pressed={selected}
                    aria-label={label}
                    title={label}
                    className={`avatar-hair-color-btn ${selected ? 'is-selected' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      patchAppearance({ hairColorHex: sw.hex });
                    }}
                  >
                    <span
                      className="avatar-hair-color-dot"
                      style={{ backgroundColor: sw.hex }}
                    >
                      {selected && <Check size={12} strokeWidth={3} color={checkStroke} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="avatar-studio-subhead">
              <span>{tx(lang, '수염 스타일', 'Facial Hair')}</span>
            </div>
            <div
              className="avatar-chip-grid"
              role="group"
              aria-label={tx(lang, '수염 스타일 선택', 'Facial Hair Options')}
            >
              {FACIAL_HAIR_OPTIONS.map((opt) => {
                const active = appearance.facialHair === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    data-facial-hair-btn={opt.key}
                    aria-pressed={active}
                    title={lang === 'en' ? opt.labelEn : opt.labelKo}
                    className={`avatar-studio-chip ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      patchAppearance({ facialHair: opt.key });
                    }}
                  >
                    {lang === 'en' ? opt.shortEn : opt.shortKo}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 3. Multi-Ethnic Facial Features Studio */}
      <div className="avatar-studio-card">
        <button
          type="button"
          className="avatar-studio-collapse-btn"
          aria-expanded={facialStudioOpen}
          onClick={() => setFacialStudioOpen((prev) => !prev)}
        >
          <span className="avatar-studio-card-title">
            {tx(lang, '얼굴형 · 눈매 · 이목구비 비율', 'Face Shape, Eye Shape & Features')}
          </span>
          <span className="avatar-studio-collapse-meta">
            <span>{activeHeadEyeLabel}</span>
            {facialStudioOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        {facialStudioOpen && (
          <>
            <div className="avatar-studio-subhead">
              <span>{tx(lang, '얼굴형', 'Head Shape')}</span>
            </div>
            <div
              className="avatar-chip-grid"
              role="group"
              aria-label={tx(lang, '얼굴형 선택', 'Head Shape Options')}
            >
              {HEAD_SHAPE_OPTIONS.map((opt) => {
                const active = appearance.headShape === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    data-head-shape-btn={opt.key}
                    aria-pressed={active}
                    title={lang === 'en' ? opt.labelEn : opt.labelKo}
                    className={`avatar-studio-chip ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      patchAppearance({ headShape: opt.key });
                    }}
                  >
                    {lang === 'en' ? opt.shortEn : opt.shortKo}
                  </button>
                );
              })}
            </div>

            <div className="avatar-studio-subhead">
              <span>{tx(lang, '눈매 형태', 'Eye Shape')}</span>
            </div>
            <div
              className="avatar-chip-grid"
              role="group"
              aria-label={tx(lang, '눈매 형태 선택', 'Eye Shape Options')}
            >
              {EYE_SHAPE_OPTIONS.map((opt) => {
                const active = appearance.eyeShape === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    data-eye-shape-btn={opt.key}
                    aria-pressed={active}
                    title={lang === 'en' ? opt.labelEn : opt.labelKo}
                    className={`avatar-studio-chip ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      patchAppearance({ eyeShape: opt.key });
                    }}
                  >
                    {lang === 'en' ? opt.shortEn : opt.shortKo}
                  </button>
                );
              })}
            </div>

            <div className="avatar-feature-slider-grid">
              {[
                {
                  key: 'noseWidthScale',
                  label: tx(lang, '코 너비', 'Nose Width'),
                  min: 0.8,
                  max: 1.25,
                },
                {
                  key: 'lipFullnessScale',
                  label: tx(lang, '입술 볼륨', 'Lip Fullness'),
                  min: 0.75,
                  max: 1.35,
                },
                {
                  key: 'eyeSizeScale',
                  label: tx(lang, '눈 크기', 'Eye Scale'),
                  min: 0.8,
                  max: 1.25,
                },
                {
                  key: 'browStrength',
                  label: tx(lang, '눈썹 농도', 'Brow Definition'),
                  min: 0.6,
                  max: 1.4,
                },
              ].map((ctrl) => {
                const val = Number(appearance[ctrl.key] ?? 1);
                return (
                  <label key={ctrl.key} className="avatar-slider-item tabular-nums">
                    <div className="avatar-slider-head">
                      <span>{ctrl.label}</span>
                      <small>{Math.round(val * 100)}%</small>
                    </div>
                    <input
                      type="range"
                      data-avatar-slider={ctrl.key}
                      min={ctrl.min}
                      max={ctrl.max}
                      step={0.02}
                      value={val}
                      aria-label={`${ctrl.label} %`}
                      onChange={(e) =>
                        patchAppearance({ [ctrl.key]: Number(e.target.value) })
                      }
                    />
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function InclusiveBodyMorphControls({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
}) {
  const anthro = draftSpec.anthropometrics;
  const soft = draftSpec.coupledSoftTissue;
  const coupledMetrics = resolveCoupledBodyMetrics(draftSpec);
  const bmiDisplay = coupledMetrics.bmi.toFixed(1);

  const activeFrameMeta =
    AVATAR_FRAME_OPTIONS.find((f) => f.key === draftSpec.framePreset) ||
    AVATAR_FRAME_OPTIONS[2];

  const patchAnthropometrics = (partialAnthro) => {
    onChangeDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        anthropometrics: {
          ...prev.anthropometrics,
          ...partialAnthro,
        },
      })
    );
  };

  const patchSoftTissue = (partialSoft) => {
    onChangeDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        coupledSoftTissue: {
          ...prev.coupledSoftTissue,
          ...partialSoft,
        },
      })
    );
  };

  const handleSelectFrame = (frameKey) => {
    triggerHaptic('selection');
    onChangeDraftSpec((prev) =>
      sanitizeAvatarSpec({
        ...prev,
        framePreset: frameKey,
        anthropometrics: {
          ...prev.anthropometrics,
          chestForm: defaultChestFormForFrameKey(frameKey, prev.anthropometrics.chestForm),
          muscleDefinition:
            frameKey === 'masculine'
              ? Math.max(prev.anthropometrics.muscleDefinition, 0.42)
              : prev.anthropometrics.muscleDefinition,
        },
      })
    );
  };

  const handleSelectArchetype = (archKey) => {
    triggerHaptic('selection');
    onChangeDraftSpec((prev) => {
      let nextChestForm = prev.anthropometrics.chestForm;
      if (prev.framePreset === 'feminine' && archKey === 'plus_size') {
        nextChestForm = 'full_bust';
      } else if (prev.framePreset === 'feminine' && nextChestForm === 'flat') {
        nextChestForm = 'contoured';
      }
      return sanitizeAvatarSpec({
        ...prev,
        archetypePreset: archKey,
        anthropometrics: {
          ...prev.anthropometrics,
          chestForm: nextChestForm,
        },
      });
    });
  };

  const handleResetRegionalSliders = () => {
    triggerHaptic('selection');
    patchAnthropometrics({
      shoulderScale: 1,
      chestScale: 1,
      waistScale: 1,
      abdomenScale: 1,
      hipScale: 1,
      gluteScale: 1,
      armMassScale: 1,
      legMassScale: 1,
    });
  };

  const regionalSliders = [
    {
      key: 'shoulderScale',
      label: tx(lang, '어깨 프레임', 'Shoulder'),
      min: 0.75,
      max: 1.35,
    },
    {
      key: 'waistScale',
      label: tx(lang, '허리 라인', 'Waist'),
      min: 0.7,
      max: 1.35,
    },
    {
      key: 'abdomenScale',
      label: tx(lang, '복부 볼륨', 'Abdomen Projection'),
      min: 0.75,
      max: 1.45,
    },
    {
      key: 'hipScale',
      label: tx(lang, '골반 · 힙 폭', 'Pelvis / Hip'),
      min: 0.8,
      max: 1.38,
    },
    {
      key: 'gluteScale',
      label: tx(lang, '둔부 볼륨', 'Glute Volume'),
      min: 0.75,
      max: 1.4,
    },
    {
      key: 'armMassScale',
      label: tx(lang, '팔 두께', 'Arm Mass'),
      min: 0.75,
      max: 1.45,
    },
    {
      key: 'legMassScale',
      label: tx(lang, '다리 두께', 'Leg Mass'),
      min: 0.75,
      max: 1.45,
    },
  ];

  return (
    <div className="avatar-studio-stack">
      {/* 1. 4 Gender-Inclusive Base Frames */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '베이스 골격 프레임', 'Inclusive Base Frame')}
          </span>
        </div>
        <div
          className="avatar-frame-grid"
          role="group"
          aria-label={tx(lang, '베이스 프레임 선택', 'Base Frame Selection')}
        >
          {AVATAR_FRAME_OPTIONS.map((opt) => {
            const active = draftSpec.framePreset === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-avatar-frame-btn={opt.key}
                aria-pressed={active}
                title={lang === 'en' ? opt.labelEn : opt.labelKo}
                className={`avatar-frame-card ${active ? 'is-active' : ''}`}
                onClick={() => handleSelectFrame(opt.key)}
              >
                {lang === 'en' ? opt.shortEn : opt.shortKo}
              </button>
            );
          })}
        </div>
        <p className="avatar-studio-hint">
          {lang === 'en' ? activeFrameMeta.descEn : activeFrameMeta.descKo}
        </p>
      </div>

      {/* 2. 8 Inclusive Body Archetype Chips */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '체형 아키타입 프리셋', 'Body Archetype Presets')}
          </span>
        </div>
        <div
          className="avatar-archetype-grid"
          role="group"
          aria-label={tx(lang, '체형 아키타입 선택', 'Body Archetype Selection')}
        >
          {AVATAR_ARCHETYPE_OPTIONS.map((opt) => {
            const active = draftSpec.archetypePreset === opt.key;
            const uniqueLegacyShape = UNIQUE_LEGACY_BODY_SHAPE_BY_ARCHETYPE[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                data-archetype-preset={opt.key}
                data-body-shape-btn={uniqueLegacyShape}
                aria-pressed={active}
                title={lang === 'en' ? opt.descEn : opt.descKo}
                className={`avatar-archetype-chip ${active ? 'is-active' : ''}`}
                onClick={() => handleSelectArchetype(opt.key)}
              >
                {lang === 'en' ? opt.shortEn : opt.shortKo}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Primary Anthropometrics: Height, Weight, Live BMI, Chest Contour & Regional Scales */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '신체 치수 · 부위별 볼륨', 'Anthropometrics & Regional Proportions')}
          </span>
          <span className="avatar-bmi-badge tabular-nums" data-bmi-badge={bmiDisplay}>
            BMI {bmiDisplay}
          </span>
        </div>

        <div className="avatar-anthro-primary-grid">
          <label className="avatar-slider-item tabular-nums">
            <div className="avatar-slider-head">
              <span>{tx(lang, '신장', 'Height')}</span>
              <strong>{anthro.heightCm} cm</strong>
            </div>
            <input
              type="range"
              data-avatar-slider="heightCm"
              min={140}
              max={205}
              step={1}
              value={anthro.heightCm}
              aria-label={tx(lang, '신장 cm', 'Height cm')}
              onChange={(e) =>
                patchAnthropometrics({ heightCm: Number(e.target.value) })
              }
            />
          </label>

          <label className="avatar-slider-item tabular-nums">
            <div className="avatar-slider-head">
              <span>{tx(lang, '체중', 'Weight')}</span>
              <strong>{anthro.weightKg} kg</strong>
            </div>
            <input
              type="range"
              data-avatar-slider="weightKg"
              min={35}
              max={160}
              step={1}
              value={anthro.weightKg}
              aria-label={tx(lang, '체중 kg', 'Weight kg')}
              onChange={(e) =>
                patchAnthropometrics({ weightKg: Number(e.target.value) })
              }
            />
          </label>
        </div>

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '가슴 · 흉곽 윤곽 형태', 'Chest / Bust Contour Form')}</span>
        </div>
        <div
          className="avatar-chest-form-grid"
          role="group"
          aria-label={tx(lang, '가슴 윤곽 형태 선택', 'Chest Contour Form')}
        >
          {CHEST_FORM_OPTIONS.map((opt) => {
            const active = anthro.chestForm === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-chest-form-btn={opt.key}
                aria-pressed={active}
                title={lang === 'en' ? opt.labelEn : opt.labelKo}
                className={`avatar-studio-chip ${active ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  patchAnthropometrics({ chestForm: opt.key });
                }}
              >
                {lang === 'en' ? opt.shortEn : opt.shortKo}
              </button>
            );
          })}
        </div>

        <label className="avatar-slider-item tabular-nums">
          <div className="avatar-slider-head">
            <span>{tx(lang, '가슴 · 흉곽 볼륨', 'Chest Volume')}</span>
            <small>{Math.round((anthro.chestScale || 1) * 100)}%</small>
          </div>
          <input
            type="range"
            data-avatar-slider="chestScale"
            min={0.75}
            max={1.4}
            step={0.02}
            value={anthro.chestScale || 1}
            aria-label={tx(lang, '가슴 볼륨 %', 'Chest Volume %')}
            onChange={(e) =>
              patchAnthropometrics({ chestScale: Number(e.target.value) })
            }
          />
        </label>

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '부위별 세부 비율', 'Regional Fine Proportions')}</span>
          <button
            type="button"
            className="avatar-reset-link-btn"
            onClick={handleResetRegionalSliders}
          >
            <RotateCcw size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
            <span>{tx(lang, '비율 초기화', 'Reset Scales')}</span>
          </button>
        </div>

        <div className="avatar-fine-sliders-grid">
          {regionalSliders.map((ctrl) => {
            const val = Number(anthro[ctrl.key] ?? 1);
            return (
              <label key={ctrl.key} className="avatar-slider-item tabular-nums">
                <div className="avatar-slider-head">
                  <span>{ctrl.label}</span>
                  <small>{Math.round(val * 100)}%</small>
                </div>
                <input
                  type="range"
                  data-avatar-slider={ctrl.key}
                  min={ctrl.min}
                  max={ctrl.max}
                  step={0.02}
                  value={val}
                  aria-label={`${ctrl.label} %`}
                  onChange={(e) =>
                    patchAnthropometrics({ [ctrl.key]: Number(e.target.value) })
                  }
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. High-BMI Coupled Facial & Distal Extremity Morphing Section */}
      <div className="avatar-studio-card">
        <div className="avatar-bmi-couple-toggle-row">
          <div className="avatar-bmi-couple-label-wrap">
            <span className="avatar-bmi-couple-title">
              {tx(
                lang,
                '체중·BMI 연동 얼굴·손·발 자동 모핑',
                'BMI-Coupled Face, Neck, Hands & Feet Morph'
              )}
            </span>
            <span className="avatar-studio-hint">
              {tx(
                lang,
                '체중 변화에 맞춰 볼·턱선·목·손목·발목 연부조직을 자연스럽게 연동합니다',
                'Naturally couples cheek, jawline, neck, wrist, hand, ankle, and instep volume with BMI'
              )}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soft.autoCoupleWithBmi}
            aria-label={tx(
              lang,
              '체중·BMI 연동 얼굴·손·발 자동 모핑',
              'BMI-Coupled Face, Neck, Hands & Feet Morph'
            )}
            data-bmi-couple-toggle="true"
            className={`avatar-switch-btn ${soft.autoCoupleWithBmi ? 'is-on' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              patchSoftTissue({ autoCoupleWithBmi: !soft.autoCoupleWithBmi });
            }}
          >
            {soft.autoCoupleWithBmi ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="avatar-coupled-metrics-strip tabular-nums">
          <span className="avatar-coupled-metric-pill">
            {tx(lang, '볼 볼륨', 'Cheek')} {Math.round(coupledMetrics.cheekFullness * 100)}%
          </span>
          <span className="avatar-coupled-metric-pill">
            {tx(lang, '목 둘레', 'Neck')} {Math.round(coupledMetrics.neckWidth * 100)}%
          </span>
          <span className="avatar-coupled-metric-pill">
            {tx(lang, '손·발 볼륨', 'Hands & Feet')}{' '}
            {Math.round(coupledMetrics.handThickness * 100)}%
          </span>
        </div>

        <div className="avatar-fine-sliders-grid">
          {[
            {
              key: 'faceSoftnessBias',
              label: tx(lang, '볼 · 턱선 · 이중턱 볼륨', 'Cheek & Jawline Volume'),
              min: -0.5,
              max: 0.8,
            },
            {
              key: 'neckThicknessBias',
              label: tx(lang, '목 둘레 두께', 'Neck Thickness'),
              min: -0.4,
              max: 0.6,
            },
            {
              key: 'extremityPlumpnessBias',
              label: tx(
                lang,
                '손목 · 손등 · 발목 · 발등 볼륨',
                'Wrists, Hands, Ankles & Instep'
              ),
              min: -0.4,
              max: 0.7,
            },
          ].map((ctrl) => {
            const val = Number(soft[ctrl.key] ?? 0);
            return (
              <label key={ctrl.key} className="avatar-slider-item tabular-nums">
                <div className="avatar-slider-head">
                  <span>{ctrl.label}</span>
                  <small>{formatSignedBiasPct(val)}</small>
                </div>
                <input
                  type="range"
                  data-avatar-slider={ctrl.key}
                  min={ctrl.min}
                  max={ctrl.max}
                  step={0.05}
                  value={val}
                  aria-label={ctrl.label}
                  onChange={(e) =>
                    patchSoftTissue({ [ctrl.key]: Number(e.target.value) })
                  }
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
