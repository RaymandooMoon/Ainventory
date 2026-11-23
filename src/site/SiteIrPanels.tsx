import { useId, useState } from 'react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon } from './SiteIcon.tsx';
import type { SiteCopy } from './siteContent.ts';

function handleListArrows(
  e: React.KeyboardEvent<HTMLDivElement>,
  ids: readonly string[],
  currentId: string,
  domPrefix: string,
  onSelect: (id: string) => void
) {
  const idx = ids.indexOf(currentId);
  if (idx < 0) return;
  let nextIdx = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % ids.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (idx - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = ids.length - 1;
  if (nextIdx >= 0) {
    e.preventDefault();
    const target = ids[nextIdx];
    triggerHaptic('selection');
    onSelect(target);
    document.getElementById(`${domPrefix}-${target}`)?.focus();
  }
}

/**
 * Subtitle-Free Icon-First Key Metrics & Verified Spec Strip.
 * Sculptural KPI icon cards + subtitle-free spec chips + single-line bottom inspector.
 */
export function BenchmarksIrScorecard({
  copy,
  tapHint,
}: {
  readonly copy: SiteCopy['stack'];
  readonly tapHint: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(`kpi:${copy.heroKpis[0].id}`);
  const uid = useId();

  const resolvedInspector = (() => {
    if (selectedKey.startsWith('spec:')) {
      const specId = selectedKey.slice(5);
      const spec = copy.specs.find((s) => s.id === specId) ?? copy.specs[0];
      return {
        icon: spec.icon,
        title: spec.label,
        badge: spec.valueText,
        detail: spec.detail,
      };
    }
    const kpiId = selectedKey.replace(/^kpi:/, '');
    const kpi = copy.heroKpis.find((k) => k.id === kpiId) ?? copy.heroKpis[0];
    return {
      icon: kpi.icon,
      title: kpi.label,
      badge: kpi.value,
      detail: kpi.detail,
    };
  })();

  return (
    <div className="site-icon-view-wrap">
      <div className="site-icon-view-head">
        <h2 className="site-pillar-title">{copy.heading}</h2>
        <span className="site-stack-note">{tapHint}</span>
      </div>

      {/* 4 Sculptural KPI Icon Cards */}
      <div className="site-kpi-icon-grid" role="group" aria-label={copy.heading}>
        {copy.heroKpis.map((kpi) => {
          const itemKey = `kpi:${kpi.id}`;
          const isSelected = selectedKey === itemKey;
          return (
            <button
              key={kpi.id}
              type="button"
              aria-pressed={isSelected}
              className={`site-kpi-icon-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedKey(itemKey);
              }}
            >
              <span className="site-icon-tile-glyph">
                <SiteIcon name={kpi.icon} size={18} />
              </span>
              <strong className="site-kpi-icon-val">{kpi.value}</strong>
              <span className="site-kpi-icon-label">{kpi.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4 Compact Subtitle-Free Verification Icon Chips */}
      <div className="site-spec-chip-row" role="group" aria-label={copy.benchmarkTitle}>
        {copy.specs.map((spec) => {
          const itemKey = `spec:${spec.id}`;
          const isSelected = selectedKey === itemKey;
          return (
            <button
              key={spec.id}
              id={`${uid}-spec-${spec.id}`}
              type="button"
              aria-pressed={isSelected}
              className={`site-spec-chip-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedKey(itemKey);
              }}
            >
              <span className="site-spec-chip-icon">
                <SiteIcon name={spec.icon} size={15} />
              </span>
              <strong className="site-spec-chip-title">{spec.shortLabel}</strong>
            </button>
          );
        })}
      </div>

      {/* Uniform 1-Line Bottom Interactive Inspector */}
      <div className="site-icon-inspector" aria-live="polite">
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={resolvedInspector.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{resolvedInspector.title}</strong>
          <span className="site-bp-spec-tag is-primary">{resolvedInspector.badge}</span>
          <p className="site-icon-inspector-text">{resolvedInspector.detail}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Subtitle-Free Icon-First 6-Module Production Tech Stack Matrix.
 * Sculptural icon tiles with crisp single title; click any icon to inspect details below.
 */
export function ProductionStackMatrix({
  copy,
  tapHint,
}: {
  readonly copy: SiteCopy['stack'];
  readonly tapHint: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(copy.cards[0].id);
  const uid = useId();
  const activeCard = copy.cards.find((c) => c.id === selectedId) ?? copy.cards[0];

  return (
    <div className="site-icon-view-wrap">
      <div className="site-icon-view-head">
        <h2 className="site-pillar-title">{copy.heading}</h2>
        <span className="site-stack-note">{tapHint}</span>
      </div>

      <div
        className="site-icon-tile-grid site-icon-tile-grid--6"
        role="tablist"
        aria-label="Production stack modules"
        onKeyDown={(e) =>
          handleListArrows(
            e,
            copy.cards.map((c) => c.id),
            activeCard.id,
            `${uid}-stack`,
            setSelectedId
          )
        }
      >
        {copy.cards.map((card) => {
          const isSelected = card.id === activeCard.id;
          return (
            <button
              key={card.id}
              id={`${uid}-stack-${card.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${uid}-stack-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={`site-icon-tile site-icon-tile--compact ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedId(card.id);
              }}
            >
              <span className="site-icon-tile-glyph">
                <SiteIcon name={card.icon} size={19} />
              </span>
              <strong className="site-icon-tile-metric">{card.metric}</strong>
            </button>
          );
        })}
      </div>

      <div
        id={`${uid}-stack-panel`}
        className="site-icon-inspector"
        role="tabpanel"
        aria-labelledby={`${uid}-stack-${activeCard.id}`}
        aria-live="polite"
      >
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeCard.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeCard.metric}</strong>
          <span className="site-bp-spec-tag is-primary">{activeCard.boundary}</span>
          <p className="site-icon-inspector-text">{activeCard.detail}</p>
        </div>
      </div>
    </div>
  );
}
