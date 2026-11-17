import { Check, Lock, Sparkles, Store } from 'lucide-react';
import {
  STAGE_BACKGROUNDS,
  TIER_ORDER,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * 10-Stage Architectural Backdrop Picker Modal (`S×1 / A×2 / B×3 / C×4`).
 * Replaced the legacy top-left `1.0×` zoom button inside the studio stage so users
 * can ground their character in architectural spaces instead of floating in a void.
 */
export default function BackgroundPickerModal({
  open,
  onClose,
  lang = 'ko',
  economyState,
  onSelectBackground,
  onOpenStore,
}) {
  const unlockedSet = new Set(economyState?.unlockedIds || ['c_atelier_plaster']);
  const equippedId = economyState?.equippedBackgroundId || 'c_atelier_plaster';
  const equippedItem = getStageBackgroundById(equippedId);
  const unlockedCount = unlockedSet.size;

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
      title={tx(lang, '캐릭터 배경 선택', 'Select Studio Background')}
      maxWidth={680}
    >
      <div className="stage-bg-picker-root" data-bg-picker-modal="true">
        {/* Top Equipped Summary & Store Shortcut Bar */}
        <div className="stage-bg-picker-summary">
          <div className="stage-bg-picker-summary-info">
            <span className={`stage-tier-badge is-tier-${equippedItem.tier.toLowerCase()}`}>
              {equippedItem.tier}
            </span>
            <div style={{ minWidth: 0 }}>
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

        {/* Tier Sections (S, A, B, C) */}
        <div className="stage-bg-tier-sections">
          {groupedByTier.map(({ tier, items }) => (
            <section key={tier} className="stage-bg-tier-group" data-bg-tier-group={tier}>
              <header className="stage-bg-tier-head">
                <div className="stage-bg-tier-title-wrap">
                  <span className={`stage-tier-badge is-tier-${tier.toLowerCase()}`}>{tier}</span>
                  <strong className="stage-bg-tier-label">
                    {tier === 'S'
                      ? tx(lang, 'S등급 · 마스터 아틀리에', 'S-Tier · Master Atelier')
                      : tier === 'A'
                        ? tx(lang, 'A등급 · 시그니처 살롱', 'A-Tier · Signature Salon')
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
                        <img src={bg.imageUrl} alt={title} loading="lazy" />
                        <span className={`stage-tier-badge is-tier-${bg.tier.toLowerCase()}`}>
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
                            <span>{tx(lang, '스토어 뽑기', 'Draw in Store')}</span>
                          </span>
                        )}
                      </div>

                      <div className="stage-bg-card-meta">
                        <strong className="stage-bg-card-title">{title}</strong>
                        <span className="stage-bg-card-sub">{subtitle}</span>
                        {!unlocked && (
                          <span className="stage-bg-card-cta">
                            <Sparkles size={11} aria-hidden="true" />
                            <span>{tx(lang, '뽑기에서 잠금 해제', 'Unlock via Gacha')}</span>
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
