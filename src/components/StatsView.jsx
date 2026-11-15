import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Moon, Palette, Plus, SlidersHorizontal, Sparkles, Sun } from 'lucide-react';
import { translateSubTypeLabel } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import { localizeApiMessage, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ExclusiveErrorBoundary, ExclusiveErrorCard } from './ExclusiveViewPrimitives.jsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';
import {
  MostWornRankingCard,
  UnwornSleeperCard,
} from './stats/StatsEditorialRankings.jsx';
import {
  ColorSpectrumWidget,
  InteractiveCompositionWidget,
  WardrobeHeroSummaryCard,
} from './stats/StatsSvgWidgets.jsx';
import './wardrobe/wardrobeUx.css';
import './stats/statsBento.css';

const STATS_PERIOD_CHIPS = [
  { key: 'all', ko: '전체 기간', en: 'All Time' },
  { key: 'week', ko: '주간', en: 'Weekly' },
  { key: 'month', ko: '월간', en: 'Monthly' },
  { key: 'season', ko: '계절별', en: 'Seasonal' },
  { key: 'year', ko: '연간', en: 'Yearly' },
];

function getCurrentMeteorologicalSeasonKey() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

function getSeasonMatchRegex(seasonKey) {
  if (seasonKey === 'spring') return /봄|spring|사계절|all/i;
  if (seasonKey === 'summer') return /여름|summer|사계절|all/i;
  if (seasonKey === 'autumn') return /가을|autumn|fall|사계절|all/i;
  return /겨울|winter|사계절|all/i;
}

function parseLocalDate(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function navigateSpaPath(path) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function StatsViewContent({
  garments = [],
  theme,
  lang = 'ko',
  skinProfile,
  bodySpec,
  onOpenProfile,
  onOpenSkinToneModal,
  onToggleTheme,
  onOpenAccount,
  onSelectGarment,
}) {
  const [period, setPeriod] = useState('all');
  const [outfits, setOutfits] = useState([]);
  const [calendarLogs, setCalendarLogs] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  const closetOwner = garments[0]?.closet_owner || 'sample';

  useEffect(() => {
    let cancelled = false;
    const q = encodeURIComponent(closetOwner);
    setStatsLoading(true);
    setStatsError(null);
    (async () => {
      try {
        const [outRes, calRes] = await Promise.all([
          apiFetch(`/outfits?closet=${q}`),
          apiFetch(`/calendar?closet=${q}`),
        ]);
        if (cancelled) return;
        setOutfits(Array.isArray(outRes?.outfits) ? outRes.outfits : []);
        setCalendarLogs(Array.isArray(calRes?.logs) ? calRes.logs : []);
        setStatsError(null);
      } catch (err) {
        if (!cancelled) {
          setStatsError(
            localizeApiMessage(err?.message, lang) ||
              tx(
                lang,
                '통계 데이터를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
                'Failed to load stats data. Please check your connection and try again.'
              )
          );
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
          setRetrying(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [closetOwner, garments.length, lang, retryCounter]);

  const handleRetryStats = useCallback(() => {
    triggerHaptic('selection');
    setRetrying(true);
    setRetryCounter((c) => c + 1);
  }, []);

  const periodAnalysis = useMemo(() => {
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msPerDay = 86400000;
    const currentSeasonKey = getCurrentMeteorologicalSeasonKey();

    const outfitById = new Map(outfits.map((o) => [Number(o.id), o]));
    const wornLogs = calendarLogs.filter((l) => l.status !== 'planned');

    const periodLogs = wornLogs.filter((entry) => {
      if (period === 'all') return true;
      const dt = parseLocalDate(entry.worn_date);
      if (!dt) return false;
      const diffDays = (todayMid.getTime() - dt.getTime()) / msPerDay;
      if (period === 'week') return diffDays >= -1 && diffDays <= 7;
      if (period === 'month') return diffDays >= -1 && diffDays <= 30;
      if (period === 'season') return diffDays >= -1 && diffDays <= 95;
      if (period === 'year') return diffDays >= -1 && diffDays <= 365;
      return true;
    });

    const periodWearMap = new Map();
    const usedOutfitIds = new Set();
    for (const entry of periodLogs) {
      if (entry.outfit_id) usedOutfitIds.add(Number(entry.outfit_id));
      const matchedOutfit = outfitById.get(Number(entry.outfit_id));
      const itemIds =
        Array.isArray(entry.item_ids) && entry.item_ids.length > 0
          ? entry.item_ids
          : Array.isArray(matchedOutfit?.item_ids)
            ? matchedOutfit.item_ids
            : [];
      for (const rawId of itemIds) {
        const gid = Number(rawId);
        if (!gid) continue;
        periodWearMap.set(gid, (periodWearMap.get(gid) || 0) + 1);
      }
    }

    let baseGarments = garments;
    if (period === 'season' && garments.length > 0) {
      const seasonRegex = getSeasonMatchRegex(currentSeasonKey);
      const tagged = garments.filter((g) => {
        const list = Array.isArray(g.seasons) ? g.seasons : [];
        const joined = [...list, g.primary_season].filter(Boolean).join(' ').trim();
        return joined ? seasonRegex.test(joined) : false;
      });
      if (tagged.length > 0) {
        baseGarments = tagged;
      }
    }

    const periodGarments = baseGarments.map((g) => {
      const loggedCount = periodWearMap.get(Number(g.id)) || 0;
      if (period === 'all') {
        const baseCount = Number(g.wear_count) || 0;
        return baseCount >= loggedCount ? g : { ...g, wear_count: loggedCount };
      }
      return { ...g, wear_count: loggedCount };
    });

    return {
      periodGarments,
      periodWearLogCount: periodLogs.length,
      periodActiveOutfitCount: period === 'all' ? outfits.length : usedOutfitIds.size,
      totalCatalogWearLogs: wornLogs.length,
    };
  }, [calendarLogs, garments, outfits, period]);

  const diagnosisLabel =
    lang === 'en'
      ? translateSubTypeLabel(skinProfile?.subTypeLabelKo, skinProfile?.personalColor)
      : skinProfile?.subTypeLabelKo || '가을 웜 뮤트';

  const swatchHex = skinProfile?.skinToneHex || '#DFBA9B';
  const activePeriodSpec =
    STATS_PERIOD_CHIPS.find((c) => c.key === period) || STATS_PERIOD_CHIPS[0];

  const profileCard = (
    <div
      className="hig-stats-skin-card stats-bento-profile stats-span-5"
      style={{ '--bento-idx': 1 }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '퍼스널 톤 · 체형 스펙', 'PERSONAL PALETTE & FIT')}
          </span>
          <h2 className="stats-card-title">
            {tx(lang, '아틀리에 피팅 프로필', 'Atelier Fitting Profile')}
          </h2>
        </div>
        <span className="stats-glass-pill tabular-nums">{swatchHex}</span>
      </div>

      <div className="hig-stats-skin-info">
        <span
          className="hig-stats-skin-swatch"
          style={{ backgroundColor: swatchHex }}
        />
        <div>
          <strong className="hig-stats-skin-title">{diagnosisLabel}</strong>
          <span className="hig-stats-skin-sub tabular-nums">
            {swatchHex}
            {bodySpec ? ` · ${bodySpec.heightCm}cm · ${bodySpec.weightKg}kg` : ''}
          </span>
        </div>
      </div>

      {bodySpec && (
        <div className="stats-profile-specs">
          <span className="stats-spec-chip">{bodySpec.heightCm} cm</span>
          <span className="stats-spec-chip">{bodySpec.weightKg} kg</span>
          {bodySpec.chestCm ? (
            <span className="stats-spec-chip">
              {tx(lang, `가슴 ${bodySpec.chestCm}`, `Chest ${bodySpec.chestCm}`)}
            </span>
          ) : null}
          {bodySpec.waistCm ? (
            <span className="stats-spec-chip">
              {tx(lang, `허리 ${bodySpec.waistCm}`, `Waist ${bodySpec.waistCm}`)}
            </span>
          ) : null}
        </div>
      )}

      <div className="hig-stats-skin-actions">
        <button
          type="button"
          className="hig-secondary-btn"
          onClick={() => {
            if (onOpenProfile) onOpenProfile('skin');
            else onOpenSkinToneModal?.();
          }}
        >
          <Palette size={15} aria-hidden="true" />
          <span>{tx(lang, '사진 · 피부톤', 'Photo & Skin')}</span>
        </button>
        <button
          type="button"
          className="hig-secondary-btn"
          onClick={() => {
            if (onOpenProfile) onOpenProfile('body');
            else onOpenSkinToneModal?.();
          }}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <section className="hig-screen-container hig-stats-screen" aria-label="Stats">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">STATS</h1>
          <span className="hig-item-count tabular-nums">
            {tx(lang, `${garments.length}개 아이템`, `${garments.length} ITEMS`)}
          </span>
        </div>
        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
            extraActions={
              <button
                type="button"
                className="hig-circle-icon-btn is-subtle"
                onClick={onToggleTheme}
                aria-label={
                  theme === 'dark'
                    ? tx(lang, '라이트 모드로 전환', 'Switch to Light Mode')
                    : tx(lang, '다크 모드로 전환', 'Switch to Dark Mode')
                }
              >
                {theme === 'dark' ? (
                  <Sun size={18} aria-hidden="true" />
                ) : (
                  <Moon size={18} aria-hidden="true" />
                )}
              </button>
            }
          />
        </div>
      </header>

      {/* Inline 5-Chip Period Selector (zero <select> dropdown) */}
      <div className="stats-period-bar">
        <div
          className="stats-period-rail"
          role="group"
          aria-label={tx(lang, '통계 기간 선택', 'Select Stats Period')}
        >
          {STATS_PERIOD_CHIPS.map((chip) => {
            const active = period === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                data-stats-period-chip={chip.key}
                aria-pressed={active}
                className={`stats-period-chip ${active ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setPeriod(chip.key);
                }}
              >
                {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                <span>{tx(lang, chip.ko, chip.en)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="stats-bento-grid">
        {statsLoading || retrying ? (
          <>
            <div
              className="stats-skeleton-card stats-span-7"
              aria-busy="true"
              aria-label={tx(lang, '통계 요약 불러오는 중', 'Loading stats summary')}
            />
            {profileCard}
            <div className="stats-skeleton-card stats-span-7" aria-hidden="true" />
            <div className="stats-skeleton-card stats-span-5" aria-hidden="true" />
            <div className="stats-skeleton-card stats-span-6" aria-hidden="true" />
            <div className="stats-skeleton-card stats-span-6" aria-hidden="true" />
          </>
        ) : statsError ? (
          <>
            <div className="stats-span-7">
              <ExclusiveErrorCard
                lang={lang}
                title={tx(lang, '통계를 불러오지 못했습니다', 'Unable to Load Stats')}
                message={statsError}
                onRetry={handleRetryStats}
                retrying={retrying}
              />
            </div>
            {profileCard}
          </>
        ) : garments.length === 0 ? (
          <>
            {/* Exception State 2A: Friendly Empty Wardrobe Guidance Card instead of blank charts */}
            <div className="ux-state-card stats-span-7" role="status" data-stats-empty-state="true">
              <div className="ux-state-icon-badge" aria-hidden="true">
                <Sparkles size={22} strokeWidth={2.1} />
              </div>
              <div className="ux-state-copy">
                <h2 className="ux-state-title">
                  {tx(lang, '아직 분석할 옷장 데이터가 없습니다', 'No Wardrobe Data to Analyze Yet')}
                </h2>
                <p className="ux-state-desc">
                  {tx(
                    lang,
                    '옷장에 의류를 등록하고 캘린더에 데일리 코디를 기록하면, 옷장 활용률·카테고리 분포·컬러 스펙트럼·1회당 착용 단가(CPW) 통계가 자동으로 완성됩니다.',
                    'Register garments in your closet and log daily outfits on the Calendar to automatically populate utilization, category balance, color signature, and CPW insights.'
                  )}
                </p>
              </div>
              <div className="ux-state-actions">
                <button
                  type="button"
                  className="ux-state-cta-btn is-primary"
                  data-stats-register-cta="true"
                  onClick={() => {
                    triggerHaptic('selection');
                    navigateSpaPath('/?action=add');
                  }}
                >
                  <Plus size={18} strokeWidth={2.3} aria-hidden="true" />
                  <span>{tx(lang, '+ 새 옷 등록하기', '+ Register First Garment')}</span>
                </button>
                <button
                  type="button"
                  className="ux-state-cta-btn is-secondary"
                  onClick={() => {
                    triggerHaptic('selection');
                    navigateSpaPath('/calendar');
                  }}
                >
                  <CalendarDays size={17} strokeWidth={2.1} aria-hidden="true" />
                  <span>{tx(lang, '코디 기록하러 가기', 'Open Calendar')}</span>
                </button>
              </div>
            </div>
            {profileCard}
          </>
        ) : (
          <>
            {/* Exception State 2B: Insufficient wear data banner for selected narrow period */}
            {period !== 'all' && periodAnalysis.periodWearLogCount === 0 && (
              <div
                className="ux-state-card is-compact stats-span-12"
                role="status"
                data-stats-period-empty="true"
              >
                <div className="ux-state-icon-badge" aria-hidden="true">
                  <CalendarDays size={21} strokeWidth={2.1} />
                </div>
                <div className="ux-state-copy">
                  <h2 className="ux-state-title">
                    {tx(
                      lang,
                      `[${activePeriodSpec.ko}] 착용 기록이 아직 없습니다`,
                      `No Wear Logs in Selected Period (${activePeriodSpec.en})`
                    )}
                  </h2>
                  <p className="ux-state-desc">
                    {tx(
                      lang,
                      '전체 기간 통계를 확인하거나 캘린더에 오늘의 코디를 기록해 기간별 활용률 리포트를 채워보세요.',
                      'Switch to All Time to review your full archive, or log outfits on the Calendar to track activity in this period.'
                    )}
                  </p>
                </div>
                <div className="ux-state-actions">
                  <button
                    type="button"
                    className="ux-state-cta-btn is-primary"
                    onClick={() => {
                      triggerHaptic('selection');
                      setPeriod('all');
                    }}
                  >
                    <span>{tx(lang, '전체 기간 보기', 'View All Time')}</span>
                  </button>
                  <button
                    type="button"
                    className="ux-state-cta-btn is-secondary"
                    onClick={() => {
                      triggerHaptic('selection');
                      navigateSpaPath('/calendar');
                    }}
                  >
                    <CalendarDays size={17} aria-hidden="true" />
                    <span>{tx(lang, '코디 기록하러 가기', 'Log Outfit on Calendar')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1. Wardrobe Vitality Hero Card + Utilization Gauge Ring (Span 7) */}
            <WardrobeHeroSummaryCard
              garments={periodAnalysis.periodGarments}
              activeOutfitCount={periodAnalysis.periodActiveOutfitCount}
              wearLogCount={periodAnalysis.periodWearLogCount}
              periodLabel={tx(lang, activePeriodSpec.ko, activePeriodSpec.en)}
              lang={lang}
              bentoIndex={0}
            />

            {/* 2. Personal Palette & Body Profile Card (Span 5 — preserves .hig-stats-skin-card contract) */}
            {profileCard}

            {/* 3. Interactive Category & Season Donut + Bar Chart (Span 7) */}
            <InteractiveCompositionWidget
              garments={periodAnalysis.periodGarments}
              lang={lang}
              bentoIndex={2}
            />

            {/* 4. Chromatic Color Palette Spectrum Bar (Span 5) */}
            <ColorSpectrumWidget
              garments={periodAnalysis.periodGarments}
              lang={lang}
              bentoIndex={3}
            />

            {/* 5. Most Worn Signature Pieces Ranking (Span 6) */}
            <MostWornRankingCard
              garments={periodAnalysis.periodGarments}
              lang={lang}
              onSelectGarment={onSelectGarment}
              bentoIndex={4}
            />

            {/* 6. Unworn Sleeper Archive Ranking (Span 6) */}
            <UnwornSleeperCard
              garments={periodAnalysis.periodGarments}
              lang={lang}
              onSelectGarment={onSelectGarment}
              bentoIndex={5}
            />
          </>
        )}
      </div>
    </section>
  );
}

export default function StatsView(props) {
  return (
    <ExclusiveErrorBoundary
      lang={props.lang}
      screenClassName="hig-stats-screen"
      screenLabel="Stats"
      errorTitle={tx(props.lang, '통계 화면 오류', 'Stats Screen Error')}
    >
      <StatsViewContent {...props} />
    </ExclusiveErrorBoundary>
  );
}
