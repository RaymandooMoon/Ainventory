import { useEffect, useState } from 'react';
import { Check, Lock, RotateCcw, Sparkles, Store, SunMedium } from 'lucide-react';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  MAX_LIGHTING_INTENSITY,
  MIN_LIGHTING_INTENSITY,
  STAGE_BACKGROUNDS,
  STAGE_LIGHTING_PRESETS,
  TIER_ORDER,
  clampLightingIntensity,
  getBaseStageTier,
  getStageBackgroundById,
  isPlusStageTier,
  isPlusTierEligibleForDraw,
  normalizeLightingPreset,
  tierToCssSlug,
} from '../utils/stageBackgroundCatalog.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic, withPublicBaseUrl } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * 14-Stage Architectural Backdrop & Spatial Lighting Picker Modal (`S+ / S / A+ / A / B+ / B / C`).
 * Lets users equip unlocked architectural rooms/courtyards AND customize 3D stage lighting color
 * temperature (`auto`, `5600K`, `3000K`, `2700K`, `6500K`, `4200K`) and brightness (`0%..200%`).
 */
export default function BackgroundPickerModal({
  open,
  onClose,
  lang = 'ko',
  economyState,
  onSelectBackground,
  onUpdateLighting,
  onOpenStore,
}) {
  const unlockedSet = new Set(economyState?.unlockedIds || ['c_atelier_plaster']);
  const equippedId = economyState?.equippedBackgroundId || 'c_atelier_plaster';
  const equippedItem = getStageBackgroundById(equippedId);
  const unlockedCount = unlockedSet.size;

  const activePreset = normalizeLightingPreset(economyState?.lightingPreset);
  const activeIntensity = clampLightingIntensity(
    economyState?.lightingIntensity ?? DEFAULT_LIGHTING_INTENSITY
  );
  const isCustomLighting =
    activePreset !== DEFAULT_LIGHTING_PRESET || activeIntensity !== DEFAULT_LIGHTING_INTENSITY;

  const rigDescription = equippedItem.isOutdoor
    ? tx(
        lang,
        '오픈 스카이 · 계절별 태양 고도 및 실시간 기상(구름·안개·여우비) 광원 연동',
        'Open-sky · Seasonal sun altitude & live composite weather lighting sync'
      )
    : lang === 'en'
      ? equippedItem.lightingRig?.rigNoteEn ||
        'Daytime window sunlight · Post-sunset interior fixture auto-switch'
      : equippedItem.lightingRig?.rigNoteKo ||
        '낮 시간대 창가 햇빛 이동 · 일몰 후 실내 조명 자동 점등';

  const [isScrubbingBrightness, setIsScrubbingBrightness] = useState(false);

  useEffect(() => {
    if (!open || !isScrubbingBrightness) return undefined;
    const stopScrubbing = () => setIsScrubbingBrightness(false);
    window.addEventListener('pointerup', stopScrubbing);
    window.addEventListener('pointercancel', stopScrubbing);
    window.addEventListener('mouseup', stopScrubbing);
    window.addEventListener('touchend', stopScrubbing);
    window.addEventListener('touchcancel', stopScrubbing);
    window.addEventListener('blur', stopScrubbing);
    return () => {
      window.removeEventListener('pointerup', stopScrubbing);
      window.removeEventListener('pointercancel', stopScrubbing);
      window.removeEventListener('mouseup', stopScrubbing);
      window.removeEventListener('touchend', stopScrubbing);
      window.removeEventListener('touchcancel', stopScrubbing);
      window.removeEventListener('blur', stopScrubbing);
    };
  }, [open, isScrubbingBrightness]);

  const effectiveScrubbing = Boolean(open && isScrubbingBrightness);

  const groupedByTier = TIER_ORDER.map((tier) => ({
    tier,
    items: STAGE_BACKGROUNDS.filter((bg) => bg.tier === tier),
  }));

  return (
    <ResponsiveSheetModal
      id="stage-background-picker-modal"
      open={open}
      onClose={onClose}
      lang={lang}
      eyebrow={tx(lang, '스테이지 공간 배경', 'STAGE ENVIRONMENTS')}
      title={tx(lang, '캐릭터 배경 및 광원 설정', 'Stage Background & Lighting')}
      maxWidth={680}
      peekThrough={effectiveScrubbing}
    >
      <div
        className={`stage-bg-picker-root ${effectiveScrubbing ? 'is-lighting-scrubbing' : ''}`.trim()}
        data-bg-picker-modal="true"
        data-lighting-scrubbing={effectiveScrubbing ? 'true' : 'false'}
      >
        {/* Top Equipped Summary & Store Shortcut Bar */}
        <div className="stage-bg-picker-summary">
          <div className="stage-bg-picker-summary-info">
            <span className={`stage-tier-badge is-tier-${tierToCssSlug(equippedItem.tier)}`}>
              {equippedItem.tier}
            </span>
            <div className="stage-bg-picker-summary-text">
              <strong className="stage-bg-picker-current-name">
                {lang === 'en' ? equippedItem.nameEn : equippedItem.nameKo}
              </strong>
              <span className="stage-bg-picker-current-meta tabular-nums">
                {tx(
                  lang,
                  `보유 배경 ${unlockedCount}/${STAGE_BACKGROUNDS.length} · 잔액 ${economyState?.iBalance ?? 0} i`,
                  `${unlockedCount}/${STAGE_BACKGROUNDS.length} Unlocked · ${economyState?.iBalance ?? 0} i`
                )}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-bg-picker-open-store="true"
            className="btn btn-primary btn-sm"
            onClick={() => {
              triggerHaptic('selection');
              onClose?.();
              onOpenStore?.();
            }}
          >
            <Store size={14} aria-hidden="true" />
            <span>{tx(lang, '배경 스토어', 'Store')}</span>
          </button>
        </div>

        {/* Spatial Lighting Type (Kelvin/Color) & Brightness Controls */}
        <section
          className="stage-bg-lighting-panel"
          data-bg-lighting-controls="true"
          aria-label={tx(lang, '공간 광원 색상 및 밝기 설정', 'Stage lighting color and brightness')}
        >
          <div className="stage-bg-lighting-head">
            <div className="stage-bg-lighting-title-row">
              <SunMedium size={15} aria-hidden="true" className="stage-bg-lighting-icon" />
              <strong className="stage-bg-lighting-title">
                {tx(lang, '공간 광원 효과', 'Spatial Lighting')}
              </strong>
            </div>
            {isCustomLighting && (
              <button
                type="button"
                data-lighting-reset-btn="true"
                className="stage-bg-lighting-reset-btn"
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateLighting?.({
                    lightingPreset: DEFAULT_LIGHTING_PRESET,
                    lightingIntensity: DEFAULT_LIGHTING_INTENSITY,
                  });
                }}
              >
                <RotateCcw size={12} aria-hidden="true" />
                <span>{tx(lang, '초기화', 'Reset')}</span>
              </button>
            )}
          </div>

          <p className="stage-bg-lighting-note">{rigDescription}</p>

          <div
            className="stage-bg-lighting-preset-grid"
            role="group"
            aria-label={tx(lang, '광원 종류 선택', 'Select light color preset')}
          >
            {STAGE_LIGHTING_PRESETS.map((preset) => {
              const selected = preset.id === activePreset;
              const label = lang === 'en' ? preset.labelEn : preset.labelKo;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-lighting-preset-option={preset.id}
                  aria-pressed={selected}
                  className={`stage-bg-lighting-chip ${selected ? 'is-active' : ''}`.trim()}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateLighting?.({ lightingPreset: preset.id });
                  }}
                >
                  <span
                    className={`stage-bg-lighting-swatch is-preset-${preset.id}`}
                    aria-hidden="true"
                  />
                  <span className="stage-bg-lighting-chip-copy">
                    <span className="stage-bg-lighting-chip-label">{label}</span>
                    <span className="stage-bg-lighting-chip-kelvin tabular-nums">
                      {preset.kelvinLabel}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`stage-bg-lighting-slider-row ${effectiveScrubbing ? 'is-scrubbing' : ''}`.trim()}
            data-lighting-slider-row="true"
          >
            <div className="stage-bg-lighting-slider-labels">
              <label
                htmlFor="stage-lighting-intensity-slider"
                className="stage-bg-lighting-slider-label"
              >
                {tx(lang, '광원 밝기', 'Light Brightness')}
              </label>
              <output
                htmlFor="stage-lighting-intensity-slider"
                data-lighting-intensity-value="true"
                className="stage-bg-lighting-slider-value tabular-nums"
              >
                {`${activeIntensity}%`}
              </output>
            </div>
            <input
              id="stage-lighting-intensity-slider"
              type="range"
              data-lighting-intensity-slider="true"
              className="stage-bg-lighting-range"
              min={MIN_LIGHTING_INTENSITY}
              max={MAX_LIGHTING_INTENSITY}
              step={5}
              value={activeIntensity}
              onPointerDown={() => setIsScrubbingBrightness(true)}
              onTouchStart={() => setIsScrubbingBrightness(true)}
              onMouseDown={() => setIsScrubbingBrightness(true)}
              onPointerUp={() => setIsScrubbingBrightness(false)}
              onTouchEnd={() => setIsScrubbingBrightness(false)}
              onMouseUp={() => setIsScrubbingBrightness(false)}
              onBlur={() => setIsScrubbingBrightness(false)}
              onChange={(e) => {
                onUpdateLighting?.({ lightingIntensity: Number(e.target.value) });
              }}
            />
          </div>
        </section>

        {/* Tier Sections (S+, S, A+, A, B+, B, C) */}
        <div className="stage-bg-tier-sections">
          {groupedByTier.map(({ tier, items }) => (
            <section key={tier} className="stage-bg-tier-group" data-bg-tier-group={tier}>
              <header className="stage-bg-tier-head">
                <div className="stage-bg-tier-title-wrap">
                  <span className={`stage-tier-badge is-tier-${tierToCssSlug(tier)}`}>{tier}</span>
                  <strong className="stage-bg-tier-label">
                    {tier === 'S+'
                      ? tx(
                          lang,
                          'S+등급 · 오픈 스카이 마스터 플라자 (날씨 효과)',
                          'S+ Tier · Open-Sky Master Plaza (Weather)'
                        )
                      : tier === 'S'
                        ? tx(lang, 'S등급 · 마스터 아틀리에', 'S-Tier · Master Atelier')
                        : tier === 'A+'
                          ? tx(
                              lang,
                              'A+등급 · 오픈 스카이 테라스 (날씨 효과)',
                              'A+ Tier · Open-Sky Terrace (Weather)'
                            )
                          : tier === 'A'
                            ? tx(lang, 'A등급 · 시그니처 살롱', 'A-Tier · Signature Salon')
                            : tier === 'B+'
                              ? tx(
                                  lang,
                                  'B+등급 · 오픈 스카이 코트야드 (날씨 효과)',
                                  'B+ Tier · Open-Sky Courtyard (Weather)'
                                )
                              : tier === 'B'
                                ? tx(lang, 'B등급 · 에디토리얼 테라스', 'B-Tier · Editorial Terrace')
                                : tx(lang, 'C등급 · 베이직 스튜디오', 'C-Tier · Basic Studio')}
                  </strong>
                </div>
                <span className="stage-bg-tier-count tabular-nums">
                  {items.filter((bg) => unlockedSet.has(bg.id)).length}/{items.length}
                </span>
              </header>

              <div className="stage-bg-grid">
                {items.map((bg) => {
                  const unlocked = unlockedSet.has(bg.id);
                  const isEquipped = bg.id === equippedId;
                  const title = lang === 'en' ? bg.nameEn : bg.nameKo;
                  const subtitle = lang === 'en' ? bg.subtitleEn : bg.subtitleKo;
                  const isPlusLocked =
                    !unlocked &&
                    isPlusStageTier(bg.tier) &&
                    !isPlusTierEligibleForDraw(bg.tier, unlockedSet);
                  const baseTierLabel = getBaseStageTier(bg.tier);

                  return (
                    <button
                      key={bg.id}
                      type="button"
                      data-bg-option-id={bg.id}
                      data-bg-tier={bg.tier}
                      data-bg-unlocked={unlocked ? 'true' : 'false'}
                      aria-pressed={isEquipped}
                      className={[
                        'stage-bg-card',
                        isEquipped ? 'is-equipped' : '',
                        !unlocked ? 'is-locked' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        triggerHaptic(unlocked ? 'selection' : 'warning');
                        if (unlocked) {
                          onSelectBackground?.(bg.id);
                          onClose?.();
                        } else {
                          onClose?.();
                          onOpenStore?.();
                        }
                      }}
                    >
                      <div className="stage-bg-card-media">
                        <img src={withPublicBaseUrl(bg.imageUrl)} alt={title} loading="lazy" />
                        <span className={`stage-tier-badge is-tier-${tierToCssSlug(bg.tier)}`}>
                          {bg.tier}
                        </span>
                        {isEquipped && (
                          <span className="stage-bg-equipped-pill">
                            <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                            <span>{tx(lang, '적용 중', 'Active')}</span>
                          </span>
                        )}
                        {!unlocked && (
                          <span className="stage-bg-lock-overlay" aria-hidden="true">
                            <Lock size={16} />
                            <span>
                              {isPlusLocked
                                ? tx(
                                    lang,
                                    `${baseTierLabel}등급 완성 필요`,
                                    `Complete ${baseTierLabel}-Tier`
                                  )
                                : tx(lang, '스토어 뽑기', 'Draw in Store')}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="stage-bg-card-meta">
                        <strong className="stage-bg-card-title">{title}</strong>
                        <span className="stage-bg-card-sub">{subtitle}</span>
                        {!unlocked && (
                          <span className="stage-bg-card-cta">
                            <Sparkles size={11} aria-hidden="true" />
                            <span>
                              {isPlusLocked
                                ? tx(
                                    lang,
                                    `${baseTierLabel}등급 모두 수집 후 뽑기 등장`,
                                    `Collect all ${baseTierLabel}-Tier first`
                                  )
                                : tx(lang, '뽑기에서 잠금 해제', 'Unlock via Gacha')}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
