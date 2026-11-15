import { Check, RotateCcw } from 'lucide-react';
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

/**
 * Tab 1 — Manual Monk Skin Tone Scale (1–10) & 4 Undertone Calibration.
 * Hair, facial hair, and facial morphology are separated into Tab 2 (`HairAndFacialFeaturesControls`).
 */
export function MstSkinToneControls({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
  onSelectMstSwatch,
}) {
  const appearance = draftSpec.appearance;
  const resolvedMstSwatch = getMstSwatch(appearance.mstLevel, appearance.mstUndertone);
  const friendlyToneBadge = formatFriendlyMstLabel(
    appearance.mstLevel,
    appearance.mstUndertone,
    lang
  );
  const baseLevelName = getMstBaseLevelName(appearance.mstLevel, lang);
  const activeUndertoneMeta =
    MST_UNDERTONE_OPTIONS.find((u) => u.key === appearance.mstUndertone) ||
    MST_UNDERTONE_OPTIONS[1];

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

  return (
    <div className="avatar-studio-stack">
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, 'Monk 1–10 피부톤 스펙트럼', 'Monk Skin Tone Scale (1–10)')}
          </span>
          <span
            className="avatar-mst-code-pill tabular-nums"
            data-mst-code-badge={resolvedMstSwatch.code}
          >
            {friendlyToneBadge} · {baseLevelName}
          </span>
        </div>

        <p className="avatar-studio-hint">
          {tx(
            lang,
            '밝기(1~10호)와 언더톤(쿨·뉴트럴·웜·올리브)을 조합해 가장 가까운 피부톤을 미세 조정하세요.',
            'Combine luminance (Tone 1–10) and undertone (Cool, Neutral, Warm, Olive) for accurate calibration.'
          )}
        </p>

        <div
          className="avatar-mst-level-grid"
          role="group"
          aria-label={tx(lang, '피부톤 명도 1~10호 선택', 'Skin Tone Luminance Levels 1 to 10')}
        >
          {MST_BASE_LEVELS.map((lvlItem) => {
            const cellSwatch = getMstSwatch(lvlItem.level, appearance.mstUndertone);
            const selected = appearance.mstLevel === lvlItem.level;
            const checkStroke = isDarkSwatch(cellSwatch.hex) ? '#FFFFFF' : '#1D1D1F';
            const levelWord = tx(lang, `${lvlItem.level}호`, `Tone ${lvlItem.level}`);
            const baseLabel = lang === 'en' ? lvlItem.labelEn : lvlItem.labelKo;

            return (
              <button
                key={lvlItem.level}
                type="button"
                data-mst-level={lvlItem.level}
                aria-pressed={selected}
                aria-label={`${levelWord} · ${baseLabel} (${cellSwatch.hex})`}
                title={`${levelWord} · ${baseLabel} (${cellSwatch.hex})`}
                className={`avatar-mst-level-btn ${selected ? 'is-selected' : ''}`}
                onClick={() => handlePickMstCell(lvlItem.level, appearance.mstUndertone)}
              >
                <span
                  className="avatar-mst-swatch-dot"
                  style={{ backgroundColor: cellSwatch.hex }}
                >
                  {selected && <Check size={14} strokeWidth={3} color={checkStroke} aria-hidden="true" />}
                </span>
                <span className="avatar-mst-level-code tabular-nums">{levelWord}</span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-section-divider" aria-hidden="true" />

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '언더톤 세부 선택', 'Undertone Calibration')}</span>
          <span className="avatar-studio-subhead-detail">
            {lang === 'en' ? activeUndertoneMeta.labelEn : activeUndertoneMeta.labelKo}
          </span>
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
                {selected && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Tab 2 — Dedicated Hair, Facial Hair & Multi-Ethnic Facial Features Studio.
 */
export function HairAndFacialFeaturesControls({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
}) {
  const appearance = draftSpec.appearance;

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

  const handleResetFacialProportions = () => {
    triggerHaptic('selection');
    patchAppearance({
      noseWidthScale: 1,
      lipFullnessScale: 1,
      eyeSizeScale: 1,
      browStrength: 1,
    });
  };

  const activeHairLabel = (() => {
    const found = HAIR_STYLE_OPTIONS.find((item) => item.key === appearance.hairStyle);
    return found ? (lang === 'en' ? found.shortEn : found.shortKo) : '';
  })();

  const activeHairColorLabel = (() => {
    const found = HAIR_COLOR_SWATCHES.find(
      (sw) => sw.hex.toUpperCase() === appearance.hairColorHex.toUpperCase()
    );
    return found ? (lang === 'en' ? found.labelEn : found.labelKo) : appearance.hairColorHex;
  })();

  return (
    <div className="avatar-studio-stack">
      {/* 1. Hairstyle, Hair Color & Facial Hair */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '헤어스타일 · 헤어 컬러 · 수염', 'Hairstyle, Hair Color & Facial Hair')}
          </span>
          <span className="avatar-studio-badge">{activeHairLabel}</span>
        </div>

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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-section-divider" aria-hidden="true" />

        <div className="avatar-studio-subhead">
          <span>
            {tx(lang, '헤어 컬러', 'Hair Color')} · <strong>{activeHairColorLabel}</strong>
          </span>
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
                  {selected && <Check size={14} strokeWidth={3} color={checkStroke} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-section-divider" aria-hidden="true" />

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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Face Shape, Eye Shape & Feature Proportions */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '얼굴형 · 눈매 · 이목구비 비율', 'Face Shape, Eye Shape & Features')}
          </span>
        </div>

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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-section-divider" aria-hidden="true" />

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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
              </button>
            );
          })}
        </div>

        <div className="avatar-studio-section-divider" aria-hidden="true" />

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '이목구비 세부 비율', 'Feature Proportions')}</span>
          <button
            type="button"
            className="avatar-reset-link-btn"
            onClick={handleResetFacialProportions}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>{tx(lang, '비율 초기화', 'Reset Features')}</span>
          </button>
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
      </div>
    </div>
  );
}

/**
 * Compatibility wrapper combining Skin Tone + Hair/Face sections if referenced together.
 */
export function MstSkinAndAppearanceControls({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
  onSelectMstSwatch,
}) {
  return (
    <div className="avatar-studio-stack">
      <MstSkinToneControls
        lang={lang}
        draftSpec={draftSpec}
        onChangeDraftSpec={onChangeDraftSpec}
        onSelectMstSwatch={onSelectMstSwatch}
      />
      <HairAndFacialFeaturesControls
        lang={lang}
        draftSpec={draftSpec}
        onChangeDraftSpec={onChangeDraftSpec}
      />
    </div>
  );
}

/**
 * Tab 3 — Inclusive Body Frames, Archetype Presets, Anthropometrics & BMI-Coupled Soft Tissue.
 */
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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
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

        <div className="avatar-studio-section-divider" aria-hidden="true" />

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
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.shortEn : opt.shortKo}</span>
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

        <div className="avatar-studio-section-divider" aria-hidden="true" />

        <div className="avatar-studio-subhead">
          <span>{tx(lang, '부위별 세부 비율', 'Regional Fine Proportions')}</span>
          <button
            type="button"
            className="avatar-reset-link-btn"
            onClick={handleResetRegionalSliders}
          >
            <RotateCcw size={13} aria-hidden="true" />
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
