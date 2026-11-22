import { useState } from 'react';
import type { SiteArchLayer, SiteCopy } from './siteContent.ts';

/**
 * Interactive 4-Layer Architecture Explorer (Swiss-editorial hairline layout).
 * Clicking any tier inspects its modules and security boundary without decorative icon clutter.
 */
export function ArchitectureLayerExplorer({
  copy,
}: {
  readonly copy: SiteCopy['architecture'];
}) {
  const [selectedId, setSelectedId] = useState<SiteArchLayer['id']>('maps');
  const activeLayer = copy.layers.find((l) => l.id === selectedId) ?? copy.layers[0];

  return (
    <div className="site-ir-arch-grid">
      {/* Left: 4-Layer Interactive Stack */}
      <div className="site-arch-stack" role="tablist" aria-label="Architecture layers">
        {copy.layers.map((layer) => {
          const isSelected = layer.id === activeLayer.id;
          return (
            <button
              key={layer.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`site-arch-tier-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => setSelectedId(layer.id)}
            >
              <span className="site-arch-tier-short">
                <strong className="site-arch-tier-code">{layer.shortCode}</strong>
                <span>{layer.shortLabel}</span>
              </span>
              <span className="site-arch-tier-body">
                <span className="site-arch-tier-top">
                  <span className="site-arch-tier-code">{layer.tier}</span>
                  <span className="site-arch-boundary-text">{layer.boundary}</span>
                </span>
                <strong className="site-arch-tier-title">{layer.title}</strong>
                <span className="site-arch-tier-sub">{layer.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: Architectural Spec Sheet */}
      <div className="site-arch-inspector" role="tabpanel" aria-live="polite">
        <div className="site-arch-inspector-head">
          <span className="site-arch-meta-label">{copy.inspectorLabel}</span>
          <span className="site-arch-budget-text">{activeLayer.latencyOrBudget}</span>
        </div>

        <h3 className="site-arch-inspector-title">{activeLayer.title}</h3>
        <p className="site-arch-inspector-summary">{activeLayer.summary}</p>

        <div className="site-arch-modules-block">
          <span className="site-arch-meta-label">{copy.modulesLabel}</span>
          <ul className="site-arch-module-list">
            {activeLayer.modules.map((mod) => (
              <li key={mod}>
                <code>{mod}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-arch-guarantee-bar">
          <span className="site-arch-meta-label">{copy.guaranteeLabel}</span>
          <p>{activeLayer.guarantee}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean 4-Column Google Cloud & Maps Platform Pipeline Overview.
 */
export function GoogleMapsPipelinePanel({
  copy,
}: {
  readonly copy: SiteCopy['architecture'];
}) {
  return (
    <div className="site-maps-pipeline-wrap">
      <div className="site-maps-pipeline-head">
        <div>
          <p className="site-eyebrow">{copy.mapsEyebrow}</p>
          <h3 className="site-pillar-title">{copy.mapsHeading}</h3>
        </div>
        <p className="site-maps-pipeline-sub">{copy.mapsSub}</p>
      </div>

      <div className="site-maps-nodes-grid">
        {copy.mapsNodes.map((node) => (
          <article key={node.code} className="site-maps-node-card">
            <span className="site-maps-node-code">{node.code}</span>
            <strong className="site-maps-node-api">{node.apiName}</strong>
            <span className="site-maps-node-role">{node.role}</span>
            <p className="site-maps-node-detail">{node.detail}</p>
            <span className="site-maps-compliance-note">{node.compliance}</span>
          </article>
        ))}
      </div>

      <div className="site-maps-compliance-bar">
        <span>{copy.mapsComplianceFooter}</span>
      </div>
    </div>
  );
}

/**
 * Editorial Tech-Spec KPI Strip + Factual Hairline Specification Ledger (No arbitrary bars).
 */
export function BenchmarksIrScorecard({
  copy,
}: {
  readonly copy: SiteCopy['stack'];
}) {
  return (
    <div className="site-ir-bench-wrap">
      <div className="site-ir-kpi-strip">
        {copy.heroKpis.map((kpi) => (
          <article key={kpi.label} className="site-ir-kpi-card">
            <strong className="site-ir-kpi-value">{kpi.value}</strong>
            <span className="site-ir-kpi-label">{kpi.label}</span>
            <small className="site-ir-kpi-sub">{kpi.sub}</small>
          </article>
        ))}
      </div>

      <div className="site-ir-ledger-panel">
        <div className="site-ir-ledger-head">
          <span className="site-arch-meta-label">{copy.benchmarkTitle}</span>
          <span className="site-stack-note">{copy.note}</span>
        </div>

        <dl className="site-ir-ledger-list">
          {copy.specs.map((row) => (
            <div key={row.label} className="site-ir-ledger-row">
              <dt className="site-ir-ledger-label">
                <span>{row.label}</span>
                <small>{row.detail}</small>
              </dt>
              <dd className="site-ir-ledger-val">{row.valueText}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * 6-Cell Hairline Production Engineering Stack Matrix.
 */
export function ProductionStackMatrix({
  copy,
}: {
  readonly copy: SiteCopy['stack'];
}) {
  return (
    <div className="site-matrix-wrap">
      <div className="site-panel-head-row">
        <div>
          <p className="site-eyebrow">{copy.eyebrow}</p>
          <h2 className="site-section-title">{copy.heading}</h2>
        </div>
        <p className="site-stack-note">{copy.note}</p>
      </div>

      <div className="site-spec-grid site-spec-grid--6">
        {copy.cards.map((card) => (
          <article key={card.title} className="site-spec-card">
            <div className="site-spec-card-top">
              <span className="site-spec-eyebrow">{card.eyebrow}</span>
              <span className="site-arch-boundary-text">{card.boundary}</span>
            </div>
            <strong className="site-spec-metric">{card.metric}</strong>
            <h3 className="site-spec-title">{card.title}</h3>
            <p className="site-spec-detail">{card.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
