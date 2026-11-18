import { useCallback, useEffect, useRef, useState } from 'react';
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
  MAX_AVATAR_HEIGHT_CM,
  MIN_AVATAR_HEIGHT_CM,
  MST_UNDERTONE_OPTIONS,
  resolveCoupledBodyMetrics,
  sanitizeAvatarSpec,
  validateHeightCmInput,
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
 * Piecewise linear interpolation for Body Volume Slider (`0% -> 0.80`, `50% -> 1.00`, `100% -> 1.30`).
 */
function bodyPctToScale(pct) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  return safePct <= 50
    ? 0.8 + (safePct / 50) * 0.2
    : 1.0 + ((safePct - 50) / 50) * 0.3;
}

/**
 * Inverse piecewise mapping (`0.80 -> 0%`, `1.00 -> 50%`, `100% -> 1.30`).
 */
function bodyScaleToPct(scale) {
  const s = Number(scale) || 1.0;
  return s <= 1.0
    ? Math.round(Math.max(0, Math.min(50, ((s - 0.8) / 0.2) * 50)))
    : Math.round(Math.max(50, Math.min(100, 50 + ((s - 1.0) / 0.3) * 50)));
}

/**
 * Buffered White-Track / Circular-Handle Atelier Slider:
 * - Tracks `isPointerDraggingRef` so active pointer drags update 60fps local state & `--slider-fill-pct`
 *   while trailing-debouncing store commits by 150ms, then immediately flushes on pointer/touch/mouse/key release.
 * - When `isPointerDraggingRef.current === false` (keyboard arrow keys OR Playwright's `setRangeSliderValue`),
 *   commits synchronously in 0ms!
 */
export function BufferedAtelierSlider({
  label,
  ariaLabel,
  sliderKey,
  min,
  max,
  step = 1,
  value,
  formatValue,
  onCommit,
  variant = 'default',
  headerRightSlot = null,
}) {
  const numericProp = Number(value);
  const safePropVal = Math.min(
    max,
    Math.max(min, Number.isFinite(numericProp) ? numericProp : min)
  );

  const [localVal, setLocalVal] = useState(safePropVal);
  const [isDraggingUI, setIsDraggingUI] = useState(false);

  const isPointerDraggingRef = useRef(false);
  const latestValRef = useRef(safePropVal);
  const timerRef = useRef(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushCommit = useCallback(
    (nextVal) => {
      clearPendingTimer();
      latestValRef.current = nextVal;
      onCommitRef.current?.(nextVal);
    },
    [clearPendingTimer]
  );

  const handlePointerStart = useCallback(() => {
    isPointerDraggingRef.current = true;
    latestValRef.current = safePropVal;
    setLocalVal(safePropVal);
    setIsDraggingUI(true);
  }, [safePropVal]);

  const handlePointerFinish = useCallback(() => {
    if (!isPointerDraggingRef.current && timerRef.current === null) return;
    isPointerDraggingRef.current = false;
    setIsDraggingUI(false);
    flushCommit(latestValRef.current);
  }, [flushCommit]);

  useEffect(() => {
    if (!isDraggingUI) return undefined;
    const onGlobalRelease = () => {
      if (!isPointerDraggingRef.current && timerRef.current === null) return;
      isPointerDraggingRef.current = false;
      setIsDraggingUI(false);
      flushCommit(latestValRef.current);
    };
    window.addEventListener('pointerup', onGlobalRelease);
    window.addEventListener('pointercancel', onGlobalRelease);
    window.addEventListener('mouseup', onGlobalRelease);
    window.addEventListener('touchend', onGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', onGlobalRelease);
      window.removeEventListener('pointercancel', onGlobalRelease);
      window.removeEventListener('mouseup', onGlobalRelease);
      window.removeEventListener('touchend', onGlobalRelease);
    };
  }, [isDraggingUI, flushCommit]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleChange = (e) => {
    const parsed = Number(e.target.value);
    const clamped = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
    latestValRef.current = clamped;
    setLocalVal(clamped);

    if (!isPointerDraggingRef.current) {
      flushCommit(clamped);
      return;
    }

    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current?.(latestValRef.current);
    }, 150);
  };

  const displayVal = isDraggingUI ? localVal : safePropVal;
  const span = Math.max(1e-6, max - min);
  const fillPct = Math.max(0, Math.min(100, ((displayVal - min) / span) * 100));
  const formattedReadout = formatValue ? formatValue(displayVal) : String(displayVal);
  const RootTag = headerRightSlot ? 'div' : 'label';

  return (
    <RootTag
      className={`avatar-slider-item atelier-buffered-slider tabular-nums ${
        variant === 'editorial' ? 'is-editorial-primary' : ''
      }`}
    >
      <div className="avatar-slider-head">
        <span>{label}</span>
        {headerRightSlot || <strong>{formattedReadout}</strong>}
      </div>
      <input
        type="range"
        data-avatar-slider={sliderKey}
        min={min}
        max={max}
        step={step}
        value={displayVal}
        aria-label={ariaLabel || label}
        style={{ '--slider-fill-pct': `${fillPct.toFixed(2)}%` }}
        onPointerDown={handlePointerStart}
        onMouseDown={handlePointerStart}
        onTouchStart={handlePointerStart}
        onPointerUp={handlePointerFinish}
        onPointerCancel={handlePointerFinish}
        onMouseUp={handlePointerFinish}
        onTouchEnd={handlePointerFinish}
        onBlur={handlePointerFinish}
        onKeyUp={handlePointerFinish}
        onChange={handleChange}
      />
    </RootTag>
  );
}

/**
 * Reusable 3 Primary White-Track / Circular-Handle Sliders:
 * 1) 신장 (cm) — Direct Input [100..230cm] + Slider [140..200cm]
 * 2) 몸무게 (kg) [35..150]
 * 3) 체형 슬라이더 [0..100] with exact `50% === 1.00x` piecewise interpolation
 */
export function PrimaryBodyAtelierSliders({
  lang = 'ko',
  draftSpec,
  onChangeDraftSpec,
  heightInputText,
  onHeightInputChange,
  onHeightValidationError,
  heightInputRef,
}) {
  const anthro = draftSpec.anthropometrics;
  const currentHeightCm = Math.min(
    MAX_AVATAR_HEIGHT_CM,
    Math.max(MIN_AVATAR_HEIGHT_CM, Math.round(anthro.heightCm || 170))
  );
  const clampedSliderHeightCm = Math.min(200, Math.max(140, currentHeightCm));
  const clampedWeightKg = Math.min(150, Math.max(35, Math.round(anthro.weightKg || 64)));

  const [fallbackHeightText, setFallbackHeightText] = useState(() => String(currentHeightCm));
  const isControlledHeightText = typeof heightInputText === 'string';
  const effectiveHeightText = isControlledHeightText ? heightInputText : fallbackHeightText;

  const updateHeightText = useCallback(
    (nextText) => {
      if (onHeightInputChange) {
        onHeightInputChange(nextText);
      } else {
        setFallbackHeightText(nextText);
      }
    },
    [onHeightInputChange]
  );

  const avgScale =
    ((anthro.shoulderScale || 1) +
      (anthro.chestScale || 1) +
      (anthro.waistScale || 1) +
      (anthro.hipScale || 1)) /
    4;
  const bodyVolumePct = bodyScaleToPct(avgScale);

  const handleCommitHeight = useCallback(
    (nextHeight) => {
      const rounded = Math.round(nextHeight);
      updateHeightText(String(rounded));
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            heightCm: rounded,
          },
        })
      );
    },
    [onChangeDraftSpec, updateHeightText]
  );

  const handleDirectHeightChange = (e) => {
    const raw = e.target.value;
    updateHeightText(raw);
    const check = validateHeightCmInput(raw, lang);
    if (check.valid) {
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            heightCm: check.heightCm,
          },
        })
      );
    }
  };

  const triggerHeightValidation = useCallback(
    (rawValue) => {
      const check = validateHeightCmInput(rawValue, lang);
      if (!check.valid) {
        triggerHaptic('warning');
        onHeightValidationError?.(check);
        return false;
      }
      const normalized = String(check.heightCm);
      if (rawValue !== normalized) {
        updateHeightText(normalized);
      }
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            heightCm: check.heightCm,
          },
        })
      );
      return true;
    },
    [lang, onChangeDraftSpec, onHeightValidationError, updateHeightText]
  );

  const handleDirectHeightKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerHeightValidation(effectiveHeightText);
    }
  };

  const isHeightTextInvalid = !validateHeightCmInput(effectiveHeightText, lang).valid;

  const heightDirectInputSlot = (
    <div className="atelier-height-direct-field">
      <input
        ref={heightInputRef}
        type="text"
        inputMode="decimal"
        data-height-cm-input="true"
        aria-invalid={isHeightTextInvalid ? 'true' : 'false'}
        aria-label={tx(
          lang,
          '신장 직접 입력 (100~230cm)',
          'Direct height input (100 to 230 cm)'
        )}
        placeholder="170"
        value={effectiveHeightText}
        className={`atelier-height-cm-input tabular-nums ${
          isHeightTextInvalid ? 'is-invalid' : ''
        }`}
        onChange={handleDirectHeightChange}
        onKeyDown={handleDirectHeightKeyDown}
      />
      <span className="atelier-height-cm-unit">cm</span>
    </div>
  );

  const handleCommitWeight = useCallback(
    (nextWeight) => {
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            weightKg: Math.round(nextWeight),
          },
        })
      );
    },
    [onChangeDraftSpec]
  );

  const handleCommitBodyVolume = useCallback(
    (nextPct) => {
      const nextScale = Number(bodyPctToScale(nextPct).toFixed(3));
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            shoulderScale: nextScale,
            chestScale: nextScale,
            waistScale: nextScale,
            hipScale: nextScale,
          },
        })
      );
    },
    [onChangeDraftSpec]
  );

  return (
    <div className="atelier-primary-sliders-stack">
      <BufferedAtelierSlider
        variant="editorial"
        sliderKey="heightCm"
        label={tx(lang, '신장 (cm)', 'Height (cm)')}
        ariaLabel={tx(lang, '신장 cm', 'Height cm')}
        min={140}
        max={200}
        step={1}
        value={clampedSliderHeightCm}
        formatValue={(val) => `${Math.round(val)} cm`}
        headerRightSlot={heightDirectInputSlot}
        onCommit={handleCommitHeight}
      />
      <BufferedAtelierSlider
        variant="editorial"
        sliderKey="weightKg"
        label={tx(lang, '몸무게 (kg)', 'Weight (kg)')}
        ariaLabel={tx(lang, '몸무게 kg', 'Weight kg')}
        min={35}
        max={150}
        step={1}
        value={clampedWeightKg}
        formatValue={(val) => `${Math.round(val)} kg`}
        onCommit={handleCommitWeight}
      />
      <BufferedAtelierSlider
        variant="editorial"
        sliderKey="bodyVolumePct"
        label={tx(lang, '체형 슬라이더', 'Body Volume')}
        ariaLabel={tx(lang, '체형 볼륨 %', 'Body Volume %')}
        min={0}
        max={100}
        step={1}
        value={bodyVolumePct}
        formatValue={(val) => `${Math.round(val)}%`}
        onCommit={handleCommitBodyVolume}
      />
    </div>
  );
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
  showMstCodeBadge = false,
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

  const mstHelpText = tx(
    lang,
    'Monk 피부톤 스펙트럼(1~10단계)과 4가지 언더톤을 조합해 포용적인 피부 명도와 온도를 정밀 보정합니다.',
    'Calibrate skin luminance across Monk Skin Tone levels 1–10 combined with 4 undertones.'
  );

  return (
    <div className="avatar-studio-stack">
      <div className="avatar-studio-card is-mst-spectrum-card">
        <div className="avatar-studio-card-head">
          <div className="atelier-section-title-group">
            <span className="avatar-studio-card-title">
              {tx(lang, 'Monk 피부톤 스펙트럼 (MST 1-10)', 'Monk Skin Tone Spectrum (MST 1-10)')}
            </span>
          </div>
          <div className="atelier-mst-head-right">
            {showMstCodeBadge ? (
              <span
                className="avatar-mst-code-pill tabular-nums"
                data-mst-code-badge={resolvedMstSwatch.code}
              >
                {friendlyToneBadge} · {baseLevelName}
              </span>
            ) : (
              <span className="atelier-mst-subtle-caption tabular-nums">
                {friendlyToneBadge} · {baseLevelName}
              </span>
            )}
            <span
              className="atelier-info-qmark"
              role="img"
              aria-label={mstHelpText}
              title={mstHelpText}
            >
              ?
            </span>
          </div>
        </div>

        <div
          className="avatar-mst-level-grid"
          role="group"
          aria-label={tx(lang, '피부톤 명도 1~10호 선택', 'Skin Tone Luminance Levels 1 to 10')}
        >
          {MST_BASE_LEVELS.map((lvlItem) => {
            const cellSwatch = getMstSwatch(lvlItem.level, appearance.mstUndertone);
            const selected = appearance.mstLevel === lvlItem.level;
            const darkChip = isDarkSwatch(cellSwatch.hex);
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
                style={{ backgroundColor: cellSwatch.hex }}
                className={`avatar-mst-level-btn ${darkChip ? 'is-dark-swatch' : 'is-light-swatch'} ${
                  selected ? 'is-active is-selected' : ''
                }`}
                onClick={() => handlePickMstCell(lvlItem.level, appearance.mstUndertone)}
              >
                <span className="avatar-mst-level-num tabular-nums">{lvlItem.level}</span>
              </button>
            );
          })}
        </div>

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
                className={`avatar-mst-undertone-pill ${selected ? 'is-selected is-active' : ''}`}
                onClick={() => handlePickMstCell(appearance.mstLevel, ut.key)}
              >
                <span
                  className="avatar-mst-undertone-dot"
                  style={{ backgroundColor: previewSwatch.hex }}
                  aria-hidden="true"
                />
                <span>{lang === 'en' ? ut.shortEn : ut.shortKo}</span>
                {selected && <Check size={13} strokeWidth={2.8} aria-hidden="true" />}
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

  const patchAppearance = useCallback(
    (partialApp) => {
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          appearance: {
            ...prev.appearance,
            ...partialApp,
          },
        })
      );
    },
    [onChangeDraftSpec]
  );

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
              <BufferedAtelierSlider
                key={ctrl.key}
                sliderKey={ctrl.key}
                label={ctrl.label}
                ariaLabel={`${ctrl.label} %`}
                min={ctrl.min}
                max={ctrl.max}
                step={0.02}
                value={val}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onCommit={(nextVal) => patchAppearance({ [ctrl.key]: nextVal })}
              />
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
        showMstCodeBadge
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
  heightInputText,
  onHeightInputChange,
  onHeightValidationError,
  heightInputRef,
}) {
  const anthro = draftSpec.anthropometrics;
  const soft = draftSpec.coupledSoftTissue;
  const coupledMetrics = resolveCoupledBodyMetrics(draftSpec);
  const bmiDisplay = coupledMetrics.bmi.toFixed(1);

  const activeFrameMeta =
    AVATAR_FRAME_OPTIONS.find((f) => f.key === draftSpec.framePreset) ||
    AVATAR_FRAME_OPTIONS[2];

  const patchAnthropometrics = useCallback(
    (partialAnthro) => {
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          anthropometrics: {
            ...prev.anthropometrics,
            ...partialAnthro,
          },
        })
      );
    },
    [onChangeDraftSpec]
  );

  const patchSoftTissue = useCallback(
    (partialSoft) => {
      onChangeDraftSpec((prev) =>
        sanitizeAvatarSpec({
          ...prev,
          coupledSoftTissue: {
            ...prev.coupledSoftTissue,
            ...partialSoft,
          },
        })
      );
    },
    [onChangeDraftSpec]
  );

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

      {/* 1b. Anatomical Dominant Hand & Asymmetric Bag/Umbrella Carry Orientation */}
      <div className="avatar-studio-card" data-dominant-hand-card="true">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '주로 쓰는 손 · 가방 착용 방향', 'Dominant Hand · Bag Carry')}
          </span>
        </div>
        <div
          className="avatar-frame-grid"
          role="radiogroup"
          aria-label={tx(lang, '주로 쓰는 손 선택', 'Select Dominant Hand')}
        >
          {[
            {
              key: 'right',
              labelKo: '오른손잡이 (왼팔/왼손 착용)',
              labelEn: 'Right-Handed (Left-side carry)',
            },
            {
              key: 'left',
              labelKo: '왼손잡이 (오른팔/오른손 착용)',
              labelEn: 'Left-Handed (Right-side carry)',
            },
          ].map((opt) => {
            const active = (draftSpec.dominantHand || 'right') === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                data-dominant-hand-btn={opt.key}
                className={`avatar-frame-card ${active ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  onChangeDraftSpec((prev) =>
                    sanitizeAvatarSpec({
                      ...prev,
                      dominantHand: opt.key,
                    })
                  );
                }}
              >
                {active && <Check size={14} strokeWidth={2.8} aria-hidden="true" />}
                <span>{lang === 'en' ? opt.labelEn : opt.labelKo}</span>
              </button>
            );
          })}
        </div>
        <p className="avatar-studio-hint">
          {tx(
            lang,
            '크로스백·서류가방·토트백과 우산 등 비대칭 아이템의 좌우 착용 위치를 AI 전신 피팅에 일관되게 반영합니다.',
            'Keeps bags and umbrellas anatomically consistent across all AI turnaround angles.'
          )}
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

      {/* 3. Primary Anthropometrics: Height, Weight, Body Volume Slider, Live BMI, Chest Contour & Regional Scales */}
      <div className="avatar-studio-card">
        <div className="avatar-studio-card-head">
          <span className="avatar-studio-card-title">
            {tx(lang, '신체 치수 · 부위별 볼륨', 'Anthropometrics & Regional Proportions')}
          </span>
          <span className="avatar-bmi-badge tabular-nums" data-bmi-badge={bmiDisplay}>
            BMI {bmiDisplay}
          </span>
        </div>

        <PrimaryBodyAtelierSliders
          lang={lang}
          draftSpec={draftSpec}
          onChangeDraftSpec={onChangeDraftSpec}
          heightInputText={heightInputText}
          onHeightInputChange={onHeightInputChange}
          onHeightValidationError={onHeightValidationError}
          heightInputRef={heightInputRef}
        />

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

        <BufferedAtelierSlider
          sliderKey="chestScale"
          label={tx(lang, '가슴 · 흉곽 볼륨', 'Chest Volume')}
          ariaLabel={tx(lang, '가슴 볼륨 %', 'Chest Volume %')}
          min={0.75}
          max={1.4}
          step={0.02}
          value={anthro.chestScale || 1}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onCommit={(nextVal) => patchAnthropometrics({ chestScale: nextVal })}
        />

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
              <BufferedAtelierSlider
                key={ctrl.key}
                sliderKey={ctrl.key}
                label={ctrl.label}
                ariaLabel={`${ctrl.label} %`}
                min={ctrl.min}
                max={ctrl.max}
                step={0.02}
                value={val}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onCommit={(nextVal) => patchAnthropometrics({ [ctrl.key]: nextVal })}
              />
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
              <BufferedAtelierSlider
                key={ctrl.key}
                sliderKey={ctrl.key}
                label={ctrl.label}
                ariaLabel={ctrl.label}
                min={ctrl.min}
                max={ctrl.max}
                step={0.05}
                value={val}
                formatValue={(v) => formatSignedBiasPct(v)}
                onCommit={(nextVal) => patchSoftTissue({ [ctrl.key]: nextVal })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
