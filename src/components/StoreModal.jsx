import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Coins, Gift, Lock, Sparkles, Store } from 'lucide-react';
import {
  DUPLICATE_REFUND_I,
  STAGE_BACKGROUNDS,
  STORE_DRAW_COST_I,
  TIER_DROP_RATES,
  getBaseStageTier,
  getEligibleGachaPool,
  getStageBackgroundById,
  hasFreeDailyDrawRemaining,
  isPlusStageTier,
  isPlusTierEligibleForDraw,
  tierToCssSlug,
} from '../utils/stageBackgroundCatalog.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic, withPublicBaseUrl } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import StoreThreeGachaStage from './three/StoreThreeGachaStage.tsx';

const ROULETTE_CARD_WIDTH = 96;
const ROULETTE_CARD_GAP = 10;
const ROULETTE_CARD_STRIDE = ROULETTE_CARD_WIDTH + ROULETTE_CARD_GAP;
const ROULETTE_CARD_COUNT = 26;
const ROULETTE_TARGET_INDEX = 21;
const ROULETTE_START_INDEX = 1;
const ROULETTE_DURATION_MS = 2050;
const ROULETTE_REDUCED_DURATION_MS = 180;

function buildRouletteReelCards(targetBg, unlockedIds) {
  const eligiblePool = getEligibleGachaPool(unlockedIds).filter((bg) => bg.id !== targetBg.id);
  const pool =
    eligiblePool.length > 0
      ? eligiblePool
      : STAGE_BACKGROUNDS.filter((bg) => bg.id !== targetBg.id);
  const byTierPriority = [
    ...pool.filter((bg) => bg.tier === 'C'),
    ...pool.filter((bg) => bg.tier === 'B' || bg.tier === 'B+'),
    ...pool.filter((bg) => bg.tier === 'A' || bg.tier === 'A+'),
    ...pool.filter((bg) => bg.tier === 'S' || bg.tier === 'S+'),
  ];
  const fallbackPool = byTierPriority.length > 0 ? byTierPriority : STAGE_BACKGROUNDS;

  const cards = [];
  for (let i = 0; i < ROULETTE_CARD_COUNT; i += 1) {
    if (i === ROULETTE_TARGET_INDEX) {
      cards.push(targetBg);
      continue;
    }
    const offsetSeed = i === ROULETTE_TARGET_INDEX - 1 || i === ROULETTE_TARGET_INDEX + 1
      ? fallbackPool[(fallbackPool.length - 1 - (i % 2)) % fallbackPool.length]
      : fallbackPool[(i * 5 + 3) % fallbackPool.length];
    cards.push(offsetSeed);
  }
  return cards;
}

/**
 * In-App Stage Background Store & Tiered Gacha Drawer (`StoreModal`)
 * - Free Daily Draw (`0 i`) once per calendar day
 * - Standard Paid Draw (`10 i`) with weighted drop rates (S 3%, A 17%, B 35%, C 45%)
 * - Horizontal Roulette / Slot-Machine Draw Stage (`idle` -> `spinning` -> `revealed`)
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
  const [drawPhase, setDrawPhase] = useState('idle');
  const [drawResult, setDrawResult] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);
  const [reelCards, setReelCards] = useState([]);
  const [activeReelIdx, setActiveReelIdx] = useState(ROULETTE_START_INDEX);
  const [animatingTier, setAnimatingTier] = useState(null);

  const animTimerRef = useRef(null);
  const spinRafRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const pendingResultRef = useRef(null);

  const cancelSpinTimers = () => {
    if (spinRafRef.current !== null) {
      cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    }
    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      cancelSpinTimers();
      pendingResultRef.current = null;
      setDrawPhase('idle');
      setDrawResult(null);
      setPendingResult(null);
      setReelCards([]);
      setActiveReelIdx(ROULETTE_START_INDEX);
      setAnimatingTier(null);
    }
    return () => {
      cancelSpinTimers();
    };
  }, [open]);

  const finishSpinToReveal = (res) => {
    cancelSpinTimers();
    if (!res?.drawnItem) return;
    const tier = res.drawnItem.tier;
    const baseTier = getBaseStageTier(tier);
    pendingResultRef.current = null;
    setPendingResult(null);
    setDrawResult(res);
    setDrawPhase('revealed');
    setAnimatingTier(tier);
    triggerHaptic(baseTier === 'S' || baseTier === 'A' ? 'heavy' : 'medium');
    animTimerRef.current = setTimeout(() => {
      setAnimatingTier(null);
      animTimerRef.current = null;
    }, 1150);
  };

  useEffect(() => {
    if (drawPhase !== 'spinning' || !pendingResult?.drawnItem) return undefined;
    const targetRes = pendingResult;
    pendingResultRef.current = targetRes;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const durationMs = prefersReduced ? ROULETTE_REDUCED_DURATION_MS : ROULETTE_DURATION_MS;

    const viewportW = viewportRef.current?.clientWidth || 360;
    const centerX = viewportW * 0.5;
    const offsetForIdx = (idx) => centerX - (idx * ROULETTE_CARD_STRIDE + ROULETTE_CARD_WIDTH * 0.5);
    const startOffset = offsetForIdx(ROULETTE_START_INDEX);
    const targetOffset = offsetForIdx(ROULETTE_TARGET_INDEX);

    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${startOffset}px, 0, 0)`;
    }

    let startTs = 0;
    let lastCrossedIdx = ROULETTE_START_INDEX;

    const tick = (now) => {
      if (!startTs) startTs = now;
      const elapsed = now - startTs;
      const progress = Math.min(1, elapsed / durationMs);
      // Smooth slot-machine quintic deceleration into the winning card
      const eased = 1 - Math.pow(1 - progress, 4.2);
      const currentX = startOffset + (targetOffset - startOffset) * eased;

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${currentX.toFixed(2)}px, 0, 0)`;
      }

      const rawIdx = Math.round(
        (centerX - currentX - ROULETTE_CARD_WIDTH * 0.5) / ROULETTE_CARD_STRIDE
      );
      const clampedIdx = Math.max(0, Math.min(ROULETTE_CARD_COUNT - 1, rawIdx));
      if (clampedIdx !== lastCrossedIdx) {
        lastCrossedIdx = clampedIdx;
        setActiveReelIdx(clampedIdx);
      }

      if (progress < 1) {
        spinRafRef.current = requestAnimationFrame(tick);
      } else {
        spinRafRef.current = null;
        finishSpinToReveal(targetRes);
      }
    };

    spinRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (spinRafRef.current !== null) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
    };
  }, [drawPhase, pendingResult]);

  const iBalance = economyState?.iBalance ?? 0;
  const freeAvailable = hasFreeDailyDrawRemaining(economyState);
  const canPaidDraw = iBalance >= STORE_DRAW_COST_I;
  const unlockedSet = new Set(economyState?.unlockedIds || ['c_atelier_plaster']);
  const equippedId = economyState?.equippedBackgroundId || 'c_atelier_plaster';
  const equippedBg = getStageBackgroundById(equippedId);

  const handleTriggerDraw = () => {
    if (drawPhase === 'spinning') return;
    const res = onPerformDraw?.();
    if (!res) return;
    if (!res.ok) {
      triggerHaptic('warning');
      return;
    }

    cancelSpinTimers();
    triggerHaptic('selection');
    setDrawResult(null);
    setAnimatingTier(null);
    setReelCards(buildRouletteReelCards(res.drawnItem, unlockedSet));
    setActiveReelIdx(ROULETTE_START_INDEX);
    setPendingResult(res);
    setDrawPhase('spinning');
  };

  const handleSkipSpin = () => {
    const activeRes = pendingResultRef.current || pendingResult;
    if (!activeRes) return;
    finishSpinToReveal(activeRes);
  };

  const revealItem = drawPhase === 'revealed' ? drawResult?.drawnItem || null : null;
  const revealTitle = revealItem
    ? lang === 'en'
      ? revealItem.nameEn
      : revealItem.nameKo
    : '';
  const activeReelCard = reelCards[activeReelIdx] || reelCards[ROULETTE_TARGET_INDEX] || null;
  const liveGachaTarget =
    drawPhase === 'spinning'
      ? activeReelCard || equippedBg
      : revealItem || equippedBg;
  const resolvedModalTheme =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

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
      <div
        className="stage-store-root"
        data-store-modal="true"
        data-store-phase={drawPhase}
      >
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

        {/* Hero Gacha Card: Idle -> Spinning Roulette Reel -> Tiered Reveal */}
        <div
          className={[
            'stage-store-hero-card',
            `is-phase-${drawPhase}`,
            revealItem ? `has-reveal is-tier-${tierToCssSlug(revealItem.tier)}` : '',
            animatingTier ? `is-animating is-animating-${tierToCssSlug(animatingTier)}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-store-reveal-tier={revealItem?.tier || undefined}
          data-store-animating={animatingTier ? 'true' : 'false'}
        >
          <div className="stage-store-fx-overlay" aria-hidden="true" />

          <StoreThreeGachaStage
            phase={drawPhase}
            activeTier={liveGachaTarget?.tier || 'C'}
            isOutdoor={Boolean(liveGachaTarget?.isOutdoor)}
            theme={resolvedModalTheme}
          />

          {drawPhase === 'spinning' ? (
            <div className="stage-store-roulette-stage" data-store-roulette-stage="true">
              <div className="stage-store-roulette-top">
                <div className="stage-store-roulette-status">
                  <span
                    className={`stage-tier-badge is-tier-${tierToCssSlug(activeReelCard?.tier || 'C')}`}
                    data-store-roulette-live-tier={activeReelCard?.tier || 'C'}
                  >
                    {activeReelCard?.tier || 'C'} TIER
                  </span>
                  <strong className="stage-store-roulette-title">
                    {tx(lang, '스테이지 룰렛 회전 중...', 'Spinning Stage Roulette...')}
                  </strong>
                </div>

                <button
                  type="button"
                  data-store-skip-spin="true"
                  className="btn btn-secondary btn-sm stage-store-skip-btn"
                  onClick={handleSkipSpin}
                >
                  <span>{tx(lang, '결과 바로보기', 'Skip')}</span>
                </button>
              </div>

              <div
                ref={viewportRef}
                className="stage-store-roulette-viewport"
                aria-hidden="true"
              >
                <div
                  className="stage-store-roulette-needle"
                  data-store-roulette-needle="true"
                />
                <div ref={trackRef} className="stage-store-roulette-track">
                  {reelCards.map((card, idx) => {
                    const isCenter = idx === activeReelIdx;
                    const cardName = lang === 'en' ? card.nameEn : card.nameKo;
                    const cardTierSlug = tierToCssSlug(card.tier);
                    return (
                      <div
                        key={`${card.id}-${idx}`}
                        className={[
                          'stage-store-roulette-card',
                          `is-tier-${cardTierSlug}`,
                          isCenter ? 'is-center-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        data-roulette-index={idx}
                        data-roulette-tier={card.tier}
                      >
                        <img src={withPublicBaseUrl(card.imageUrl)} alt={cardName} />
                        <span className={`stage-tier-badge is-tier-${cardTierSlug}`}>
                          {card.tier}
                        </span>
                        <span className="stage-store-roulette-card-label">{cardName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : revealItem ? (
            <div className="stage-store-reveal-content" data-store-draw-result="true">
              <div className="stage-store-reveal-preview">
                <img src={withPublicBaseUrl(revealItem.imageUrl)} alt={revealTitle} />
                <span className={`stage-tier-badge is-large is-tier-${tierToCssSlug(revealItem.tier)}`}>
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
                    `매일 1회 무료 뽑기를 제공하며, 출석 체크로 얻은 i 코인으로 ${STAGE_BACKGROUNDS.length}종의 배경을 수집할 수 있습니다.`,
                    `Claim 1 free draw every day or spend 10 i earned from Calendar check-ins to unlock all ${STAGE_BACKGROUNDS.length} stage backdrops.`
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Drop-rate Transparency Strip + Primary Draw CTA */}
          <div className="stage-store-action-footer">
            <div className="stage-store-odds-row tabular-nums" aria-label="Drop rates">
              {(['S', 'A', 'B', 'C']).map((t) => {
                const plusEligible =
                  t !== 'C' && isPlusTierEligibleForDraw(`${t}+`, unlockedSet);
                return (
                  <span key={t} className={`stage-odds-chip is-tier-${t.toLowerCase()}`}>
                    <strong>{plusEligible ? `${t}/${t}+` : t}</strong> {TIER_DROP_RATES[t]}%
                  </span>
                );
              })}
            </div>

            <div className="stage-store-cta-row">
              <button
                type="button"
                data-store-draw-btn="true"
                disabled={drawPhase === 'spinning' || (!freeAvailable && !canPaidDraw)}
                className={`btn btn-primary stage-store-draw-btn tabular-nums ${
                  freeAvailable ? 'is-free-draw' : ''
                }`}
                onClick={handleTriggerDraw}
              >
                {drawPhase === 'spinning' ? (
                  <>
                    <Sparkles size={16} aria-hidden="true" />
                    <span>{tx(lang, '룰렛 추첨 중...', 'Drawing...')}</span>
                  </>
                ) : freeAvailable ? (
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

              {drawPhase !== 'spinning' && !freeAvailable && !canPaidDraw && (
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

        {/* All Collectibles Catalog Grid */}
        <div className="stage-store-catalog-head">
          <strong>
            {tx(
              lang,
              `전체 스테이지 컬렉션 (${STAGE_BACKGROUNDS.length}종)`,
              `All ${STAGE_BACKGROUNDS.length} Stage Backdrops`
            )}
          </strong>
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
            const isPlusLocked =
              !unlocked &&
              isPlusStageTier(bg.tier) &&
              !isPlusTierEligibleForDraw(bg.tier, unlockedSet);
            const baseTierLabel = getBaseStageTier(bg.tier);
            return (
              <button
                key={bg.id}
                type="button"
                data-store-collection-item={bg.id}
                data-bg-tier={bg.tier}
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
                      : isPlusLocked
                        ? tx(
                            lang,
                            `${baseTierLabel}등급 모두 수집 후 뽑기 등장`,
                            `Collect all ${baseTierLabel}-Tier to unlock in draw`
                          )
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
