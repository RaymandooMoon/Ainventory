import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { normalizeWardrobeCategoryKey } from '../../contracts/carbonDesignContract.ts';
import { formatKRW } from '../../utils/api.ts';
import { localizeColorName, tx } from '../../utils/i18n.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';

const TONE_VARS = [
  'var(--stats-tone-0)',
  'var(--stats-tone-1)',
  'var(--stats-tone-2)',
  'var(--stats-tone-3)',
  'var(--stats-tone-4)',
];

const CATEGORY_DEFS = [
  { key: 'top', ko: '상의', en: 'Tops', guidePct: 34 },
  { key: 'bottom', ko: '하의', en: 'Bottoms', guidePct: 24 },
  { key: 'outer', ko: '아우터', en: 'Outerwear', guidePct: 20 },
  { key: 'shoes', ko: '슈즈', en: 'Shoes', guidePct: 12 },
  { key: 'accessory', ko: '액세서리', en: 'Accessories', guidePct: 10 },
];

const SEASON_DEFS = [
  { key: 'spring', ko: '봄', en: 'Spring', matchRe: /봄|spring/i, guidePct: 28 },
  { key: 'summer', ko: '여름', en: 'Summer', matchRe: /여름|summer/i, guidePct: 22 },
  { key: 'autumn', ko: '가을', en: 'Autumn', matchRe: /가을|autumn|fall/i, guidePct: 30 },
  { key: 'winter', ko: '겨울', en: 'Winter', matchRe: /겨울|winter/i, guidePct: 20 },
];

export function WardrobeHeroSummaryCard({
  garments = [],
  activeOutfitCount = 0,
  wearLogCount = 0,
  lang = 'ko',
  bentoIndex = 0,
}) {
  const metrics = useMemo(() => {
    const totalItems = garments.length;
    const wornItems = garments.filter((g) => (Number(g.wear_count) || 0) > 0).length;
    const totalWears = garments.reduce((acc, g) => acc + (Number(g.wear_count) || 0), 0);
    const utilizationPct = totalItems > 0 ? Math.round((wornItems / totalItems) * 100) : 0;

    const pricedWithWears = garments.filter(
      (g) => (Number(g.price) || 0) > 0 && (Number(g.wear_count) || 0) > 0
    );
    const avgCpw =
      pricedWithWears.length > 0
        ? Math.round(
            pricedWithWears.reduce(
              (sum, g) => sum + Number(g.price) / Math.max(1, Number(g.wear_count)),
              0
            ) / pricedWithWears.length
          )
        : 0;

    const avgWearPerItem = totalItems > 0 ? (totalWears / totalItems).toFixed(1) : '0.0';

    return {
      totalItems,
      wornItems,
      totalWears,
      utilizationPct,
      avgCpw,
      avgWearPerItem,
    };
  }, [garments]);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const clampedRatio = Math.max(0, Math.min(1, metrics.utilizationPct / 100));
  const strokeDashoffset = circumference * (1 - clampedRatio);

  const statusBadge =
    metrics.totalItems === 0
      ? tx(lang, '첫 아이템 등록 대기', 'AWAITING FIRST PIECE')
      : metrics.utilizationPct >= 70
        ? tx(lang, '우수 캡슐 순환율', 'HIGH ROTATION')
        : metrics.utilizationPct >= 35
          ? tx(lang, '안정적 옷장 순환', 'BALANCED ROTATION')
          : tx(lang, '활용 잠재력 높음', 'READY TO ACTIVATE');

  return (
    <article
      className="stats-bento-card stats-span-7"
      style={{ '--bento-idx': bentoIndex }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '옷장 핵심 요약 인포그래픽', 'WARDROBE VITALITY OVERVIEW')}
          </span>
          <h2 className="stats-card-title">
            {tx(lang, '캡슐 아카이브 활용률', 'Archive Utilization & Velocity')}
          </h2>
        </div>
        <span className="stats-glass-pill">
          <Sparkles size={12} />
          <span>{statusBadge}</span>
        </span>
      </div>

      <div className="stats-hero-body">
        <div
          className="stats-gauge-wrap"
          role="img"
          aria-label={tx(
            lang,
            `옷장 활용률 ${metrics.utilizationPct}%`,
            `Wardrobe utilization ${metrics.utilizationPct}%`
          )}
        >
          <svg className="stats-gauge-svg" viewBox="0 0 164 164">
            {/* Subtle outer dial ticks */}
            {Array.from({ length: 24 }).map((_, idx) => {
              const angle = (idx / 24) * Math.PI * 2;
              const x1 = 82 + Math.cos(angle) * 76;
              const y1 = 82 + Math.sin(angle) * 76;
              const x2 = 82 + Math.cos(angle) * 79;
              const y2 = 82 + Math.sin(angle) * 79;
              return (
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--card-border)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              );
            })}

            <circle className="stats-gauge-track" cx="82" cy="82" r={radius} />

            {metrics.utilizationPct > 0 ? (
              <circle
                className="stats-gauge-arc"
                cx="82"
                cy="82"
                r={radius}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            ) : (
              <circle
                cx="82"
                cy="82"
                r={radius}
                fill="none"
                stroke="var(--ink-muted)"
                strokeWidth="3"
                strokeDasharray="4 7"
                opacity="0.45"
              />
            )}
          </svg>

          <div className="stats-gauge-center">
            <strong className="stats-gauge-pct">{metrics.utilizationPct}%</strong>
            <span className="stats-gauge-caption">
              {tx(lang, '옷장 활용률', 'UTILIZATION')}
            </span>
          </div>
        </div>

        <div className="stats-hero-kpi-grid">
          <div className="stats-kpi-tile">
            <span className="stats-kpi-label">
              {tx(lang, '총 보유 아이템', 'Total Pieces')}
            </span>
            <strong className="stats-kpi-value">{metrics.totalItems}</strong>
            <span className="stats-kpi-note">
              {tx(
                lang,
                `${metrics.wornItems}점 실제 착용됨`,
                `${metrics.wornItems} pieces worn`
              )}
            </span>
          </div>

          <div className="stats-kpi-tile">
            <span className="stats-kpi-label">
              {tx(lang, '활성 코디 수', 'Active Outfits')}
            </span>
            <strong className="stats-kpi-value">{activeOutfitCount}</strong>
            <span className="stats-kpi-note">
              {tx(
                lang,
                `캘린더 ${wearLogCount}건 기록`,
                `${wearLogCount} calendar logs`
              )}
            </span>
          </div>

          <div className="stats-kpi-tile">
            <span className="stats-kpi-label">
              {tx(lang, '누적 착용 횟수', 'Total Wears')}
            </span>
            <strong className="stats-kpi-value">{metrics.totalWears}</strong>
            <span className="stats-kpi-note">
              {tx(
                lang,
                `아이템당 평균 ${metrics.avgWearPerItem}회`,
                `Avg ${metrics.avgWearPerItem} / piece`
              )}
            </span>
          </div>

          <div className="stats-kpi-tile">
            <span className="stats-kpi-label">
              {tx(lang, '평균 착용 단가', 'Avg. Cost / Wear')}
            </span>
            <strong className="stats-kpi-value">
              {metrics.avgCpw > 0 ? formatKRW(metrics.avgCpw) : '—'}
            </strong>
            <span className="stats-kpi-note">
              {metrics.avgCpw > 0
                ? tx(lang, '1회 착용 기준 효율', 'Active CPW efficiency')
                : tx(lang, '착용 기록 시 자동 산출', 'Unlocks on wear log')}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function InteractiveCompositionWidget({
  garments = [],
  lang = 'ko',
  bentoIndex = 2,
}) {
  const [dimension, setDimension] = useState('category');
  const [hoveredKey, setHoveredKey] = useState(null);

  const series = useMemo(() => {
    if (dimension === 'category') {
      const counts = { top: 0, bottom: 0, outer: 0, shoes: 0, accessory: 0 };
      for (const g of garments) {
        const key = normalizeWardrobeCategoryKey(g.category);
        counts[key] = (counts[key] || 0) + 1;
      }
      const total = garments.length;
      return CATEGORY_DEFS.map((def, idx) => {
        const count = counts[def.key] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return {
          key: def.key,
          label: lang === 'en' ? def.en : def.ko,
          count,
          pct,
          guidePct: def.guidePct,
          tone: TONE_VARS[idx % TONE_VARS.length],
        };
      });
    }

    const counts = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    for (const g of garments) {
      const rawSeasons = Array.isArray(g.seasons) ? g.seasons : [];
      if (rawSeasons.length === 0) {
        counts.spring += 1;
        counts.autumn += 1;
        continue;
      }
      const joined = rawSeasons.join(' ');
      for (const sDef of SEASON_DEFS) {
        if (sDef.matchRe.test(joined)) {
          counts[sDef.key] += 1;
        }
      }
    }
    const sumMentions = Object.values(counts).reduce((a, b) => a + b, 0);
    return SEASON_DEFS.map((def, idx) => {
      const count = counts[def.key] || 0;
      const pct = sumMentions > 0 ? Math.round((count / sumMentions) * 100) : 0;
      return {
        key: def.key,
        label: lang === 'en' ? def.en : def.ko,
        count,
        pct,
        guidePct: def.guidePct,
        tone: TONE_VARS[idx % TONE_VARS.length],
      };
    });
  }, [dimension, garments, lang]);

  const totalUnits = useMemo(
    () => series.reduce((sum, item) => sum + item.count, 0),
    [series]
  );

  const radius = 66;
  const circumference = 2 * Math.PI * radius;

  const arcs = useMemo(() => {
    if (totalUnits === 0) return [];
    const nonZero = series.filter((s) => s.count > 0);
    const gapPx = nonZero.length > 1 ? 3 : 0;

    return nonZero.reduce(
      (acc, seg) => {
        const rawLen = (seg.count / totalUnits) * circumference;
        const drawLen = Math.max(2, rawLen - gapPx);
        acc.list.push({
          ...seg,
          dashArray: `${drawLen} ${circumference}`,
          dashOffset: -acc.offset,
        });
        acc.offset += rawLen;
        return acc;
      },
      { list: [], offset: 0 }
    ).list;
  }, [circumference, series, totalUnits]);

  const activeSegment = useMemo(
    () => series.find((s) => s.key === hoveredKey) || null,
    [hoveredKey, series]
  );

  return (
    <article
      className="stats-bento-card stats-span-7"
      style={{ '--bento-idx': bentoIndex }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '구조 및 시즌 밸런스 분석', 'COMPOSITION & SEASONALITY')}
          </span>
          <h2 className="stats-card-title">
            {dimension === 'category'
              ? tx(lang, '카테고리 포트폴리오 분포', 'Category Portfolio Share')
              : tx(lang, '사계절 커버리지 밸런스', 'Four-Season Coverage')}
          </h2>
        </div>

        <div
          className="stats-seg-track"
          role="tablist"
          aria-label={tx(lang, '분포 기준 전환', 'Composition Dimension')}
          style={{ '--seg-idx': dimension === 'category' ? 0 : 1 }}
        >
          <span className="stats-seg-thumb" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={dimension === 'category'}
            className={`stats-seg-btn ${dimension === 'category' ? 'is-active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              setHoveredKey(null);
              setDimension('category');
            }}
          >
            {tx(lang, '카테고리', 'Category')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dimension === 'season'}
            className={`stats-seg-btn ${dimension === 'season' ? 'is-active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              setHoveredKey(null);
              setDimension('season');
            }}
          >
            {tx(lang, '계절 분포', 'Season')}
          </button>
        </div>
      </div>

      <div className="stats-comp-layout">
        <div className="stats-donut-stage">
          <svg
            className="stats-donut-svg"
            viewBox="0 0 184 184"
            aria-label={tx(lang, '분포 도넛 차트', 'Composition Donut Chart')}
          >
            <circle
              cx="92"
              cy="92"
              r={radius}
              fill="none"
              stroke="var(--bg-tertiary)"
              strokeWidth="17"
            />
            {arcs.length > 0 ? (
              arcs.map((arc) => {
                const isHovered = hoveredKey === arc.key;
                const isDimmed = hoveredKey !== null && !isHovered;
                return (
                  <circle
                    key={arc.key}
                    cx="92"
                    cy="92"
                    r={radius}
                    className={`stats-donut-slice ${isDimmed ? 'is-dimmed' : ''}`}
                    stroke={arc.tone}
                    strokeWidth={isHovered ? 23 : 17}
                    strokeDasharray={arc.dashArray}
                    strokeDashoffset={arc.dashOffset}
                    onMouseEnter={() => setHoveredKey(arc.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => {
                      triggerHaptic('selection');
                      setHoveredKey((prev) => (prev === arc.key ? null : arc.key));
                    }}
                  />
                );
              })
            ) : (
              <circle
                cx="92"
                cy="92"
                r={radius}
                fill="none"
                stroke="var(--ink-muted)"
                strokeWidth="4"
                strokeDasharray="5 8"
                opacity="0.45"
              />
            )}
          </svg>

          <div className="stats-donut-center">
            <span className="stats-donut-center-lbl">
              {activeSegment
                ? activeSegment.label
                : dimension === 'category'
                  ? tx(lang, '전체 구성', 'ALL PIECES')
                  : tx(lang, '시즌 지수', 'SEASON INDEX')}
            </span>
            <strong className="stats-donut-center-val">
              {activeSegment ? activeSegment.count : garments.length}
            </strong>
            <span className="stats-donut-center-pct">
              {activeSegment
                ? `${activeSegment.pct}%`
                : totalUnits > 0
                  ? '100%'
                  : tx(lang, '가이드 모드', 'GUIDE')}
            </span>
          </div>
        </div>

        <div className="stats-comp-bars">
          {series.map((row) => {
            const isHovered = hoveredKey === row.key;
            const barPct =
              totalUnits > 0 ? Math.max(row.count > 0 ? 6 : 0, row.pct) : row.guidePct;
            return (
              <button
                key={row.key}
                type="button"
                className={`stats-comp-row ${isHovered ? 'is-hovered' : ''}`}
                onMouseEnter={() => setHoveredKey(row.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(row.key)}
                onBlur={() => setHoveredKey(null)}
                onClick={() => {
                  triggerHaptic('selection');
                  setHoveredKey((prev) => (prev === row.key ? null : row.key));
                }}
              >
                <span
                  className="stats-comp-swatch"
                  style={{ background: row.tone }}
                  aria-hidden="true"
                />
                <span className="stats-comp-name">{row.label}</span>
                <div className="stats-comp-track">
                  <div
                    className="stats-comp-fill"
                    style={{
                      width: `${barPct}%`,
                      background: row.tone,
                      opacity: totalUnits > 0 ? 1 : 0.35,
                    }}
                  />
                </div>
                <span className="stats-comp-metric">
                  {totalUnits > 0
                    ? `${row.count} · ${row.pct}%`
                    : tx(lang, `권장 ${row.guidePct}%`, `Rec ${row.guidePct}%`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export function ColorSpectrumWidget({
  garments = [],
  lang = 'ko',
  bentoIndex = 3,
}) {
  const [activeSwatchKey, setActiveSwatchKey] = useState(null);

  const swatches = useMemo(() => {
    if (garments.length === 0) return [];
    const map = new Map();
    for (const item of garments) {
      const rawHex = String(item.color_hex || '').trim().toUpperCase();
      const validHex = /^#[0-9A-F]{6}$/i.test(rawHex) ? rawHex : 'var(--stats-tone-1)';
      const localizedName =
        localizeColorName(item.color_name, lang) ||
        tx(lang, '뉴트럴 톤', 'Neutral Tone');
      const groupKey = `${localizedName.toLowerCase()}::${validHex}`;
      const prev = map.get(groupKey);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(groupKey, {
          key: groupKey,
          name: localizedName,
          hex: validHex,
          count: 1,
        });
      }
    }
    const total = garments.length;
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((s) => ({
        ...s,
        pct: Math.max(1, Math.round((s.count / total) * 100)),
      }));
  }, [garments, lang]);

  const activeSwatch = useMemo(
    () => swatches.find((s) => s.key === activeSwatchKey) || swatches[0] || null,
    [activeSwatchKey, swatches]
  );

  const auraGradient = useMemo(() => {
    if (swatches.length === 0) {
      return 'linear-gradient(90deg, var(--stats-tone-4), var(--stats-tone-2), var(--stats-tone-0))';
    }
    if (swatches.length === 1) {
      return swatches[0].hex;
    }
    const stops = swatches.map((s, idx) => {
      const pos = Math.round((idx / (swatches.length - 1)) * 100);
      return `${s.hex} ${pos}%`;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [swatches]);

  return (
    <article
      className="stats-bento-card stats-span-5"
      style={{ '--bento-idx': bentoIndex }}
    >
      <div className="stats-card-head">
        <div className="stats-title-stack">
          <span className="stats-eyebrow">
            {tx(lang, '컬러 팔레트 스펙트럼', 'CHROMATIC SPECTRUM')}
          </span>
          <h2 className="stats-card-title">
            {tx(lang, '보유 의류 색채 분포', 'Wardrobe Color Signature')}
          </h2>
        </div>

        {activeSwatch ? (
          <span className="stats-glass-pill">
            <span
              className="stats-swatch-dot"
              style={{ width: 10, height: 10, background: activeSwatch.hex }}
              aria-hidden="true"
            />
            <span>
              {activeSwatch.name} · {activeSwatch.pct}%
            </span>
          </span>
        ) : (
          <span className="stats-glass-pill">
            {tx(lang, '스펙트럼 가이드', 'CAPSULE GUIDE')}
          </span>
        )}
      </div>

      {swatches.length > 0 ? (
        <div className="stats-spectrum-shell">
          <div
            className="stats-spectrum-bar"
            role="group"
            aria-label={tx(lang, '의류 색상 비율 스펙트럼 바', 'Garment Color Spectrum Bar')}
          >
            {swatches.map((sw) => {
              const isSelected = activeSwatchKey === sw.key;
              const isDimmed = activeSwatchKey !== null && !isSelected;
              return (
                <button
                  key={sw.key}
                  type="button"
                  className={`stats-spectrum-seg ${isSelected ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                  style={{
                    flexGrow: Math.max(1, sw.count),
                    background: sw.hex,
                  }}
                  aria-label={`${sw.name} (${sw.count}, ${sw.pct}%)`}
                  title={`${sw.name} · ${sw.pct}%`}
                  onMouseEnter={() => setActiveSwatchKey(sw.key)}
                  onMouseLeave={() => setActiveSwatchKey(null)}
                  onClick={() => {
                    triggerHaptic('selection');
                    setActiveSwatchKey((prev) => (prev === sw.key ? null : sw.key));
                  }}
                />
              );
            })}
          </div>

          <div
            className="stats-spectrum-aura"
            style={{ background: auraGradient }}
            aria-hidden="true"
          />

          <div className="stats-swatch-grid">
            {swatches.slice(0, 6).map((sw) => {
              const isSelected = activeSwatchKey === sw.key;
              return (
                <button
                  key={sw.key}
                  type="button"
                  className={`stats-swatch-chip ${isSelected ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveSwatchKey(sw.key)}
                  onMouseLeave={() => setActiveSwatchKey(null)}
                  onClick={() => {
                    triggerHaptic('selection');
                    setActiveSwatchKey((prev) => (prev === sw.key ? null : sw.key));
                  }}
                >
                  <span className="stats-swatch-left">
                    <span
                      className="stats-swatch-dot"
                      style={{ background: sw.hex }}
                      aria-hidden="true"
                    />
                    <span className="stats-swatch-name">{sw.name}</span>
                  </span>
                  <span className="stats-swatch-pct">
                    {sw.count} · {sw.pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="stats-zero-guide">
          <div
            className="stats-spectrum-aura"
            style={{ background: auraGradient, marginBottom: 6 }}
            aria-hidden="true"
          />
          <strong className="stats-zero-title">
            {tx(lang, '나만의 컬러 스펙트럼 프리뷰', 'Chromatic Capsule Preview')}
          </strong>
          <p className="stats-zero-desc">
            {tx(
              lang,
              '옷장에 의류를 등록하면 대표 색상 칩과 톤온톤 그라데이션 밸런스가 자동으로 시각화됩니다.',
              'Add garments to your closet to automatically map your dominant color chips and tonal gradient balance.'
            )}
          </p>
        </div>
      )}
    </article>
  );
}
