import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, RotateCcw, X } from 'lucide-react';
import type { StageId, StageInteractionState } from '../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import type { SiteLang } from './siteContent.ts';
import {
  buildStagePreferenceBars,
  buildTransitionSlices,
  getBucketLabel,
  type StageAnalyticsBucket,
  type StageAnalyticsSnapshot,
} from './stageAnalytics.ts';

export interface SiteStageAnalyticsProps {
  readonly isOpen: boolean;
  readonly lang: SiteLang;
  readonly snapshot: Readonly<StageAnalyticsSnapshot>;
  readonly onClose: () => void;
  readonly onReset: () => void;
  readonly onNavigateStage: (
    stageId: StageId,
    studioSubtab?: StageInteractionState['studioSubtab']
  ) => void;
}

const PIE_CX = 110;
const PIE_CY = 110;
const PIE_OUTER_R = 88;
const PIE_INNER_R = 54;

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const span = Math.max(0.01, endAngle - startAngle);
  if (span >= 359.9) {
    // Full-circle ring drawn as two 180-degree arcs so SVG path stays valid
    const topOuter = polarToCartesian(cx, cy, outerR, 0);
    const botOuter = polarToCartesian(cx, cy, outerR, 180);
    const topInner = polarToCartesian(cx, cy, innerR, 0);
    const botInner = polarToCartesian(cx, cy, innerR, 180);
    return [
      `M ${topOuter.x.toFixed(2)} ${topOuter.y.toFixed(2)}`,
      `A ${outerR} ${outerR} 0 1 1 ${botOuter.x.toFixed(2)} ${botOuter.y.toFixed(2)}`,
      `A ${outerR} ${outerR} 0 1 1 ${topOuter.x.toFixed(2)} ${topOuter.y.toFixed(2)}`,
      `M ${topInner.x.toFixed(2)} ${topInner.y.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 1 0 ${botInner.x.toFixed(2)} ${botInner.y.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 1 0 ${topInner.x.toFixed(2)} ${topInner.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  const pad = span > 6 ? 1.2 : 0;
  const a0 = startAngle + pad * 0.5;
  const a1 = endAngle - pad * 0.5;
  const largeArc = a1 - a0 > 180 ? 1 : 0;

  const p0 = polarToCartesian(cx, cy, outerR, a0);
  const p1 = polarToCartesian(cx, cy, outerR, a1);
  const p2 = polarToCartesian(cx, cy, innerR, a1);
  const p3 = polarToCartesian(cx, cy, innerR, a0);

  return [
    `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export default function SiteStageAnalytics({
  isOpen,
  lang,
  snapshot,
  onClose,
  onReset,
  onNavigateStage,
}: SiteStageAnalyticsProps) {
  const [barMode, setBarMode] = useState<'bucket' | 'stage'>('bucket');
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        e.stopPropagation();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (prevActive && prevActive.isConnected) {
        prevActive.focus();
      }
    };
  }, [isOpen]);

  const bars = useMemo(
    () => buildStagePreferenceBars(snapshot, barMode, lang),
    [snapshot, barMode, lang]
  );

  const slices = useMemo(() => buildTransitionSlices(snapshot, lang), [snapshot, lang]);

  const topPreference = useMemo(() => {
    const buckets: readonly StageAnalyticsBucket[] = ['hero', 'tryOn', 'calendar', 'other'];
    let bestBucket: StageAnalyticsBucket | null = null;
    let bestCount = 0;
    for (const bucket of buckets) {
      if (snapshot.byBucket[bucket] > bestCount) {
        bestCount = snapshot.byBucket[bucket];
        bestBucket = bucket;
      }
    }
    if (!bestBucket || bestCount <= 0 || snapshot.totalSwitches <= 0) {
      return null;
    }
    return {
      label: getBucketLabel(bestBucket, lang),
      pct: Math.round((bestCount / snapshot.totalSwitches) * 100),
    };
  }, [snapshot, lang]);

  const activeSlice = useMemo(() => {
    if (slices.length === 0) return null;
    if (!selectedSliceId) return null;
    return slices.find((s) => s.id === selectedSliceId) ?? null;
  }, [slices, selectedSliceId]);

  if (!isOpen) return null;

  const isKo = lang === 'ko';
  const distinctPaths = Object.values(snapshot.transitions).filter((c) => c > 0).length;
  const hasData = snapshot.totalSwitches > 0;

  return (
    <div
      className="site-analytics-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-analytics-title"
      data-no-marble="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="site-analytics-sheet">
        <div className="site-analytics-handle-wrap" aria-hidden="true">
          <span className="site-analytics-handle" />
        </div>

        <header className="site-analytics-head">
          <div className="site-analytics-title-group">
            <span className="site-analytics-kicker">
              <BarChart3 size={14} aria-hidden="true" />
              <span>{isKo ? '세션 인터랙션 분석' : 'Session Usability Analytics'}</span>
            </span>
            <h2 id="site-analytics-title" className="site-analytics-title">
              {isKo ? '3D 스테이지 전환 인사이트' : '3D Stage Switching Insights'}
            </h2>
          </div>

          <div className="site-analytics-head-actions">
            <button
              type="button"
              className="site-analytics-reset-btn"
              disabled={!hasData}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedSliceId(null);
                setSelectedBarId(null);
                onReset();
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>{isKo ? '초기화' : 'Reset'}</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="site-analytics-close-btn"
              aria-label={isKo ? '분석 창 닫기' : 'Close analytics'}
              onClick={() => {
                triggerHaptic('selection');
                onClose();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="site-analytics-scroll">
          {/* Summary KPI Strip */}
          <dl className="site-analytics-kpi-strip">
            <div className="site-analytics-kpi-cell">
              <dt>{isKo ? '총 전환 횟수' : 'Total Switches'}</dt>
              <dd>{snapshot.totalSwitches}</dd>
            </div>
            <div className="site-analytics-kpi-cell">
              <dt>{isKo ? '가장 선호한 영역' : 'Top Preference'}</dt>
              <dd>
                {topPreference ? (
                  <>
                    <span className="site-analytics-kpi-name">{topPreference.label}</span>
                    <span className="site-analytics-kpi-sub">{topPreference.pct}%</span>
                  </>
                ) : (
                  <span className="site-analytics-kpi-empty">—</span>
                )}
              </dd>
            </div>
            <div className="site-analytics-kpi-cell">
              <dt>{isKo ? '탐색 경로 수' : 'Transition Paths'}</dt>
              <dd>{distinctPaths}</dd>
            </div>
          </dl>

          {!hasData ? (
            <section className="site-analytics-empty" aria-live="polite">
              <h3>{isKo ? '기록된 전환 없음' : 'No switches yet'}</h3>
              <p>
                {isKo
                  ? '스테이지를 이동하면 선호도와 전환 비율이 실시간 집계됩니다.'
                  : 'Switch stages to populate preference and transition charts live.'}
              </p>
              <div className="site-analytics-empty-actions">
                <button
                  type="button"
                  className="site-analytics-jump-btn is-primary"
                  onClick={() => {
                    triggerHaptic('selection');
                    onNavigateStage('studio', 'atelier');
                    onClose();
                  }}
                >
                  <span>{isKo ? '3D 피팅 이동' : 'Explore 3D Fitting'}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="site-analytics-jump-btn"
                  onClick={() => {
                    triggerHaptic('selection');
                    onNavigateStage('studio', 'intelligence');
                    onClose();
                  }}
                >
                  <span>{isKo ? '케어 · 가치 보기' : 'Open Care & Value'}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </div>
            </section>
          ) : (
            <div className="site-analytics-charts-grid">
              {/* Chart 1: Stage Preferences Bar Chart */}
              <section className="site-analytics-card" aria-labelledby="analytics-bar-heading">
                <div className="site-analytics-card-head">
                  <div>
                    <h3 id="analytics-bar-heading">
                      {isKo ? '스테이지 선호도' : 'Stage Preferences'}
                    </h3>
                    <p>
                      {isKo ? '방문 빈도 · 탭하여 이동' : 'Share · tap to jump'}
                    </p>
                  </div>

                  <div
                    className="site-analytics-segmented"
                    role="tablist"
                    aria-label={isKo ? '차트 분류 기준' : 'Chart grouping'}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={barMode === 'bucket'}
                      className={`site-analytics-seg-btn ${barMode === 'bucket' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBarMode('bucket');
                        setSelectedBarId(null);
                      }}
                    >
                      {isKo ? '핵심 영역' : 'Focus'}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={barMode === 'stage'}
                      className={`site-analytics-seg-btn ${barMode === 'stage' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBarMode('stage');
                        setSelectedBarId(null);
                      }}
                    >
                      {isKo ? '전체 3D' : 'All Stages'}
                    </button>
                  </div>
                </div>

                <div className="site-analytics-bars" role="list">
                  {bars.map((bar) => {
                    const isFocused = selectedBarId === bar.id;
                    return (
                      <button
                        key={bar.id}
                        type="button"
                        role="listitem"
                        className={`site-analytics-bar-row ${isFocused ? 'is-focused' : ''}`}
                        onClick={() => {
                          triggerHaptic('selection');
                          if (isFocused) {
                            onNavigateStage(bar.targetStage, bar.targetStudioSubtab);
                            onClose();
                          } else {
                            setSelectedBarId(bar.id);
                          }
                        }}
                      >
                        <div className="site-analytics-bar-meta">
                          <span className="site-analytics-bar-label-wrap">
                            <span
                              className="site-analytics-swatch"
                              style={{ backgroundColor: bar.color }}
                              aria-hidden="true"
                            />
                            <strong className="site-analytics-bar-label">{bar.label}</strong>
                          </span>
                          <span className="site-analytics-bar-num">
                            {bar.count}
                            <small>{bar.sharePct}%</small>
                          </span>
                        </div>
                        <div className="site-analytics-bar-track" aria-hidden="true">
                          <span
                            className="site-analytics-bar-fill"
                            style={{
                              backgroundColor: bar.color,
                              transform: `scaleX(${Math.max(bar.count > 0 ? 0.04 : 0, bar.ratio)})`,
                            }}
                          />
                        </div>
                        {isFocused && (
                          <span className="site-analytics-bar-hint">
                            {bar.shortHint} ·{' '}
                            {isKo ? '한 번 더 탭하면 이동' : 'Tap again to open stage'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Chart 2: Stage Transitions Pie / Donut Chart */}
              <section className="site-analytics-card" aria-labelledby="analytics-pie-heading">
                <div className="site-analytics-card-head">
                  <div>
                    <h3 id="analytics-pie-heading">
                      {isKo ? '전환 경로 비율' : 'Transition Breakdown'}
                    </h3>
                    <p>
                      {isKo ? '경로별 전환 비율' : 'Stage-to-stage path share'}
                    </p>
                  </div>
                </div>

                <div className="site-analytics-pie-layout">
                  <div className="site-analytics-pie-wrap">
                    <svg
                      viewBox="0 0 220 220"
                      className="site-analytics-pie-svg"
                      role="img"
                      aria-label={
                        isKo
                          ? `총 ${snapshot.totalSwitches}회의 스테이지 전환 경로 원형 차트`
                          : `Pie chart of ${snapshot.totalSwitches} stage transitions`
                      }
                    >
                      <circle
                        cx={PIE_CX}
                        cy={PIE_CY}
                        r={(PIE_OUTER_R + PIE_INNER_R) * 0.5}
                        className="site-analytics-pie-track"
                      />
                      {slices.map((slice) => {
                        const isSelected = activeSlice?.id === slice.id;
                        const pathData = describeDonutSlice(
                          PIE_CX,
                          PIE_CY,
                          isSelected ? PIE_OUTER_R + 4 : PIE_OUTER_R,
                          PIE_INNER_R,
                          slice.startAngle,
                          slice.endAngle
                        );
                        return (
                          <path
                            key={slice.id}
                            d={pathData}
                            fill={slice.color}
                            opacity={activeSlice && !isSelected ? 0.42 : 0.96}
                            className="site-analytics-pie-slice"
                            tabIndex={0}
                            role="button"
                            aria-label={`${slice.label}: ${slice.count} (${slice.sharePct}%)`}
                            onClick={() => {
                              triggerHaptic('selection');
                              setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id));
                              }
                            }}
                          />
                        );
                      })}
                    </svg>

                    <div className="site-analytics-pie-center" aria-live="polite">
                      <strong>
                        {activeSlice ? `${activeSlice.sharePct}%` : snapshot.totalSwitches}
                      </strong>
                      <span>
                        {activeSlice
                          ? `${activeSlice.count} ${isKo ? '회' : 'hits'}`
                          : isKo
                            ? '총 전환'
                            : 'Switches'}
                      </span>
                    </div>
                  </div>

                  <ul className="site-analytics-legend">
                    {slices.map((slice) => {
                      const isSelected = activeSlice?.id === slice.id;
                      return (
                        <li key={slice.id}>
                          <button
                            type="button"
                            className={`site-analytics-legend-btn ${isSelected ? 'is-active' : ''}`}
                            aria-pressed={isSelected}
                            onClick={() => {
                              triggerHaptic('selection');
                              setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id));
                            }}
                          >
                            <span
                              className="site-analytics-swatch"
                              style={{ backgroundColor: slice.color }}
                              aria-hidden="true"
                            />
                            <span className="site-analytics-legend-label">{slice.label}</span>
                            <span className="site-analytics-legend-val">
                              {slice.count}
                              <small>{slice.sharePct}%</small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
