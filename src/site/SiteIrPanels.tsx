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
 * Icon-First Google Cloud & Maps Platform Proxy Pipeline.
 * Four sculptural API icon tiles + single-line interactive bottom inspector.
 */
export function GoogleMapsPipelinePanel({
  copy,
  tapHint,
}: {
  readonly copy: SiteCopy['architecture'];
  readonly tapHint: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(copy.mapsNodes[0].id);
  const uid = useId();
  const activeNode = copy.mapsNodes.find((n) => n.id === selectedId) ?? copy.mapsNodes[0];

  return (
    <div className="site-icon-view-wrap">
      <div className="site-icon-view-head">
        <div>
          <p className="site-eyebrow">{copy.mapsEyebrow}</p>
          <h3 className="site-pillar-title">{copy.mapsHeading}</h3>
        </div>
        <span className="site-stack-note">{tapHint}</span>
      </div>

      <div
        className="site-icon-tile-grid site-icon-tile-grid--4"
        role="tablist"
        aria-label={copy.mapsHeading}
        onKeyDown={(e) =>
          handleListArrows(
            e,
            copy.mapsNodes.map((n) => n.id),
            activeNode.id,
            `${uid}-maps`,
            setSelectedId
          )
        }
      >
        {copy.mapsNodes.map((node) => {
          const isSelected = node.id === activeNode.id;
          return (
            <button
              key={node.id}
              id={`${uid}-maps-${node.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${uid}-maps-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={`site-icon-tile ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedId(node.id);
              }}
            >
              <span className="site-icon-tile-top">
                <span className="site-icon-tile-glyph">
                  <SiteIcon name={node.icon} size={20} />
                </span>
                <span className="site-icon-tile-code">{node.code}</span>
              </span>
              <strong className="site-icon-tile-title">{node.apiName}</strong>
              <span className="site-icon-tile-sub">{node.role}</span>
              <span className="site-icon-tile-tag">{node.compliance}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`${uid}-maps-panel`}
        className="site-icon-inspector"
        role="tabpanel"
        aria-labelledby={`${uid}-maps-${activeNode.id}`}
        aria-live="polite"
      >
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeNode.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeNode.apiName}</strong>
          <span className="site-bp-spec-tag is-primary">{activeNode.compliance}</span>
          <p className="site-icon-inspector-text">{activeNode.detail}</p>
        </div>
      </div>

      <div className="site-maps-compliance-bar">
        <span>{copy.mapsComplianceFooter}</span>
      </div>
    </div>
  );
}

/**
 * Icon-First Key Metrics & Verified Spec Strip.
 * Sculptural KPI icon cards + interactive spec icon dock + single-line bottom inspector.
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
        <div>
          <p className="site-eyebrow">{copy.eyebrow}</p>
          <h2 className="site-pillar-title">{copy.heading}</h2>
        </div>
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

      {/* 4 Compact Verification Icon Chips */}
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
              <span className="site-spec-chip-copy">
                <strong>{spec.shortLabel}</strong>
                <small>{spec.valueText}</small>
              </span>
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
 * Icon-First 6-Module Production Tech Stack Matrix.
 * Sculptural icon tiles with minimal labels; click any icon to read its concise 1-line spec.
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
        <div>
          <p className="site-eyebrow">{copy.eyebrow}</p>
          <h2 className="site-pillar-title">{copy.heading}</h2>
        </div>
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
              <span className="site-icon-tile-top">
                <span className="site-icon-tile-glyph">
                  <SiteIcon name={card.icon} size={18} />
                </span>
                <span className="site-icon-tile-tag">{card.boundary}</span>
              </span>
              <strong className="site-icon-tile-metric">{card.metric}</strong>
              <span className="site-icon-tile-sub">{card.title}</span>
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
