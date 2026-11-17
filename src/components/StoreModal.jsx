import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Coins, Gift, Lock, Sparkles, Store } from 'lucide-react';
import {
  DUPLICATE_REFUND_I,
  STAGE_BACKGROUNDS,
  STORE_DRAW_COST_I,
  TIER_DROP_RATES,
  getStageBackgroundById,
  hasFreeDailyDrawRemaining,
} from '../utils/stageBackgroundCatalog.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * In-App Stage Background Store & Tiered Gacha Drawer (`StoreModal`)
 * - Free Daily Draw (`0 i`) once per calendar day
 * - Standard Paid Draw (`10 i`) with weighted drop rates (S 3%, A 17%, B 35%, C 45%)
 * - Distinct S / A / B / C reveal effects + Duplicate Mileage Refund (`5 i`)
 */
export default function StoreModal({
  open,
  onClose,
  lang = 'ko',
  economyState,
  onPerformDraw,
  onSelectBackground,
  onGoCalendar,
}) {
  const [drawResult, setDrawResult] = useState(null);
  const [animatingTier, setAnimatingTier] = useState(null);
  const animTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setDrawResult(null);
      setAnimatingTier(null);
    }
    return () => {
      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current);
      }
    };
  }, [open]);

  const iBalance = economyState?.iBalance ?? 0;
  const freeAvailable = hasFreeDailyDrawRemaining(economyState);
  const canPaidDraw = iBalance >= STORE_DRAW_COST_I;
  const unlockedSet = new Set(economyState?.unlockedIds || ['c_atelier_plaster']);
  const equippedId = economyState?.equippedBackgroundId || 'c_atelier_plaster';
  const equippedBg = getStageBackgroundById(equippedId);

  const handleTriggerDraw = () => {
    const res = onPerformDraw?.();
    if (!res) return;
    if (!res.ok) {
      triggerHaptic('warning');
      return;
    }

    const tier = res.drawnItem.tier;
    triggerHaptic(tier === 'S' || tier === 'A' ? 'heavy' : 'medium');
    setDrawResult(res);
    setAnimatingTier(tier);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => {
      setAnimatingTier(null);
    }, 1150);
  };

  const revealItem = drawResult?.drawnItem || null;
  const revealTitle = revealItem
    ? lang === 'en'
      ? revealItem.nameEn
      : revealItem.nameKo
    : '';

  return (
    <ResponsiveSheetModal
      id="stage-store-modal"
      open={open}
      onClose={onClose}
      lang={lang}
      eyebrow={tx(lang, '아틀리에 스토어 · STAGE BACKDROP GACHA', 'ATELIER STORE · STAGE GACHA')}
      title={tx(lang, '배경 스토어', 'Backdrop Store')}
      maxWidth={680}
    >
      <div className="stage-store-root" data-store-modal="true">
        {/* Currency Balance & Free Draw Status Bar */}
        <div className="stage-store-balance-bar">
          <div className="stage-store-balance-pill" data-store-balance-pill="true">
            <span className="stage-currency-icon" aria-hidden="true">
              i
            </span>
            <div className="stage-store-balance-text">
              <span className="stage-store-balance-label">
                {tx(lang, '보유 재화', 'Balance')}
              </span>
              <strong className="stage-store-balance-value tabular-nums" data-store-balance="true">
                {iBalance} i
              </strong>
            </div>
          </div>

          <div className="stage-store-owned-meta tabular-nums">
            <span>
              {tx(
                lang,
                `수집 ${unlockedSet.size}/${STAGE_BACKGROUNDS.length}종`,
                `${unlockedSet.size}/${STAGE_BACKGROUNDS.length} Collected`
              )}
            </span>
            <span className="stage-store-dot-sep" aria-hidden="true">
              ·
            </span>
            <span>
              {tx(
                lang,
                `적용 중: ${equippedBg.tier} · ${equippedBg.nameKo}`,
                `Equipped: ${equippedBg.tier} · ${equippedBg.nameEn}`
              )}
            </span>
          </div>
        </div>

        {/* Hero Gacha Card with Distinct S / A / B / C Reveal Stage */}
        <div
          className={[
            'stage-store-hero-card',
            revealItem ? `has-reveal is-tier-${revealItem.tier.toLowerCase()}` : '',
            animatingTier ? `is-animating is-animating-${animatingTier.toLowerCase()}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-store-reveal-tier={revealItem?.tier || undefined}
          data-store-animating={animatingTier ? 'true' : 'false'}
        >
          <div className="stage-store-fx-overlay" aria-hidden="true" />

          {revealItem ? (
            <div className="stage-store-reveal-content" data-store-draw-result="true">
              <div className="stage-store-reveal-preview">
                <img src={revealItem.imageUrl} alt={revealTitle} />
                <span className={`stage-tier-badge is-large is-tier-${revealItem.tier.toLowerCase()}`}>
                  {revealItem.tier} TIER
                </span>
              </div>

              <div className="stage-store-reveal-info">
                <span className="stage-store-reveal-kicker">
                  {drawResult.usedFreeDraw
                    ? tx(lang, '오늘의 무료 뽑기 결과', 'DAILY FREE DRAW')
                    : tx(lang, '스페셜 배경 뽑기 결과', 'STAGE DRAW')}
                </span>
                <strong className="stage-store-reveal-title">{revealTitle}</strong>
                <p className="stage-store-reveal-sub">
                  {lang === 'en' ? revealItem.subtitleEn : revealItem.subtitleKo}
                </p>

                <div className="stage-store-reveal-status tabular-nums">
                  {drawResult.isDuplicate ? (
                    <span className="stage-store-refund-pill">
                      <Coins size={12} aria-hidden="true" />
                      <span>
                        {tx(
                          lang,
                          `중복 획득 · ${DUPLICATE_REFUND_I} i 환급됨`,
                          `Duplicate · +${DUPLICATE_REFUND_I} i Refunded`
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="stage-store-new-pill">
                      <Sparkles size={12} aria-hidden="true" />
                      <span>{tx(lang, '신규 배경 잠금 해제!', 'New Stage Unlocked!')}</span>
                    </span>
                  )}

                  {equippedId !== revealItem.id ? (
                    <button
                      type="button"
                      data-store-equip-drawn="true"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        triggerHaptic('selection');
                        onSelectBackground?.(revealItem.id);
                      }}
                    >
                      <span>{tx(lang, '바로 적용하기', 'Equip Now')}</span>
                    </button>
                  ) : (
                    <span className="stage-bg-equipped-pill is-inline">
                      <Check size={12} strokeWidth={2.8} aria-hidden="true" />
                      <span>{tx(lang, '현재 적용 중', 'Equipped')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="stage-store-idle-content">
              <div className="stage-store-idle-icon" aria-hidden="true">
                <Store size={22} />
              </div>
              <div className="stage-store-idle-copy">
                <strong>
                  {tx(
                    lang,
                    '캐릭터를 위한 건축 스테이지 배경 뽑기',
                    'Collect Architectural Studio Stages'
                  )}
                </strong>
                <p>
                  {tx(
                    lang,
                    '매일 1회 무료 뽑기를 제공하며, 출석 체크로 얻은 i 코인으로 10종의 배경을 수집할 수 있습니다.',
                    'Claim 1 free draw every day or spend 10 i earned from Calendar check-ins to unlock all 10 stage backdrops.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Drop-rate Transparency Strip + Primary Draw CTA */}
          <div className="stage-store-action-footer">
            <div className="stage-store-odds-row tabular-nums" aria-label="Drop rates">
              {(['S', 'A', 'B', 'C']).map((t) => (
                <span key={t} className={`stage-odds-chip is-tier-${t.toLowerCase()}`}>
                  <strong>{t}</strong> {TIER_DROP_RATES[t]}%
                </span>
              ))}
            </div>

            <div className="stage-store-cta-row">
              <button
                type="button"
                data-store-draw-btn="true"
                disabled={!freeAvailable && !canPaidDraw}
                className={`btn btn-primary stage-store-draw-btn tabular-nums ${
                  freeAvailable ? 'is-free-draw' : ''
                }`}
                onClick={handleTriggerDraw}
              >
                {freeAvailable ? (
                  <>
                    <Gift size={16} aria-hidden="true" />
                    <span>{tx(lang, '오늘의 무료 뽑기 (0 i)', 'Free Daily Draw (0 i)')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} aria-hidden="true" />
                    <span>
                      {tx(
                        lang,
                        `배경 뽑기 · ${STORE_DRAW_COST_I} i`,
                        `Draw Backdrop · ${STORE_DRAW_COST_I} i`
                      )}
                    </span>
                  </>
                )}
              </button>

              {!freeAvailable && !canPaidDraw && (
                <button
                  type="button"
                  data-store-go-calendar="true"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    triggerHaptic('selection');
                    onClose?.();
                    onGoCalendar?.();
                  }}
                >
                  <Calendar size={14} aria-hidden="true" />
                  <span>{tx(lang, '출석 체크로 i 받기', 'Earn i via Check-In')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* All 10 Collectibles Catalog Grid */}
        <div className="stage-store-catalog-head">
          <strong>{tx(lang, '전체 스테이지 컬렉션 (10종)', 'All 10 Stage Backdrops')}</strong>
          <span className="tabular-nums">
            {tx(
              lang,
              `중복 시 ${DUPLICATE_REFUND_I} i 환급`,
              `+${DUPLICATE_REFUND_I} i duplicate refund`
            )}
          </span>
        </div>

        <div className="stage-bg-grid is-store-grid">
          {STAGE_BACKGROUNDS.map((bg) => {
            const unlocked = unlockedSet.has(bg.id);
            const isEquipped = bg.id === equippedId;
            const title = lang === 'en' ? bg.nameEn : bg.nameKo;
            return (
              <button
                key={bg.id}
                type="button"
                data-store-collection-item={bg.id}
                data-bg-unlocked={unlocked ? 'true' : 'false'}
                className={`stage-bg-card ${isEquipped ? 'is-equipped' : ''} ${
                  !unlocked ? 'is-locked' : ''
                }`.trim()}
                onClick={() => {
                  if (unlocked) {
                    triggerHaptic('selection');
                    onSelectBackground?.(bg.id);
                  } else {
                    triggerHaptic('warning');
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
                    <span className="stage-bg-lock-overlay is-compact" aria-hidden="true">
                      <Lock size={14} />
                    </span>
                  )}
                </div>
                <div className="stage-bg-card-meta">
                  <strong className="stage-bg-card-title">{title}</strong>
                  <span className="stage-bg-card-sub">
                    {unlocked
                      ? isEquipped
                        ? tx(lang, '현재 스테이지 적용 중', 'Currently equipped')
                        : tx(lang, '보유 중 · 탭하여 적용', 'Owned · Tap to equip')
                      : tx(lang, '뽑기에서 획득 가능', 'Obtainable from draw')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
