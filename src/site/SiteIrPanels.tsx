import { useState } from 'react';
import {
  CloudSun,
  Cpu,
  Layers,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { SiteArchLayer, SiteCopy } from './siteContent.ts';

const LAYER_ICONS: Readonly<Record<SiteArchLayer['id'], typeof Layers>> = {
  spatial: Layers,
  multimodal: Sparkles,
  maps: MapPin,
  privacy: Lock,
};

/**
 * Interactive 4-Tier Layered Architecture Explorer (OpenAI / Anthropic / Google Cloud IR style).
 * Clicking any tier highlights its trust boundary, real production modules, and SLA guarantees.
 */
export function ArchitectureLayerExplorer({
  copy,
}: {
  readonly copy: SiteCopy['architecture'];
}) {
  const [selectedId, setSelectedId] = useState<SiteArchLayer['id']>('maps');
  const activeLayer = copy.layers.find((l) => l.id === selectedId) ?? copy.layers[0];
  const ActiveIcon = LAYER_ICONS[activeLayer.id];

  return (
    <div className="site-ir-arch-grid">
      {/* Left: Interactive 4-Tier Stack Diagram */}
      <div className="site-arch-stack" role="tablist" aria-label="Architecture tiers">
        {copy.layers.map((layer) => {
          const Icon = LAYER_ICONS[layer.id];
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
              <span className="site-arch-tier-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="site-arch-tier-body">
                <span className="site-arch-tier-top">
                  <span className="site-arch-tier-code">{layer.tier}</span>
                  <span className="site-arch-boundary-pill">{layer.boundary}</span>
                </span>
                <strong className="site-arch-tier-title">{layer.title}</strong>
                <span className="site-arch-tier-sub">{layer.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: Deep Technical Spec Inspector */}
      <div className="site-arch-inspector" role="tabpanel" aria-live="polite">
        <div className="site-arch-inspector-head">
          <span className="site-arch-inspector-kicker">
            <ActiveIcon size={14} />
            <span>{copy.inspectorLabel}</span>
          </span>
          <span className="site-arch-budget-pill">{activeLayer.latencyOrBudget}</span>
        </div>

        <h3 className="site-arch-inspector-title">{activeLayer.title}</h3>
        <p className="site-arch-inspector-summary">{activeLayer.summary}</p>

        <div className="site-arch-modules-block">
          <span className="site-arch-meta-label">{copy.modulesLabel}</span>
          <ul className="site-arch-module-list">
            {activeLayer.modules.map((mod) => (
              <li key={mod}>
                <Cpu size={13} />
                <code>{mod}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-arch-guarantee-bar">
          <ShieldCheck size={15} />
          <div>
            <span className="site-arch-meta-label">{copy.guaranteeLabel}</span>
            <p>{activeLayer.guarantee}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * End-to-End Google Cloud & Maps Platform Pipeline Diagram (Commit 169b6b2 Architecture).
 */
export function GoogleMapsPipelinePanel({
  copy,
}: {
  readonly copy: SiteCopy['architecture'];
}) {
  const nodeIcons = [CloudSun, MapPin, Layers, Sparkles] as const;

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
        {copy.mapsNodes.map((node, idx) => {
          const Icon = nodeIcons[idx] ?? Sparkles;
          return (
            <article key={node.code} className="site-maps-node-card">
              <div className="site-maps-node-top">
                <span className="site-maps-node-code">{node.code}</span>
                <span className="site-maps-node-icon" aria-hidden="true">
                  <Icon size={15} />
                </span>
              </div>
              <strong className="site-maps-node-api">{node.apiName}</strong>
              <span className="site-maps-node-role">{node.role}</span>
              <p className="site-maps-node-detail">{node.detail}</p>
              <span className="site-maps-compliance-chip">{node.compliance}</span>
            </article>
          );
        })}
      </div>

      <div className="site-maps-compliance-bar">
        <ShieldCheck size={15} />
        <span>{copy.mapsComplianceFooter}</span>
      </div>
    </div>
  );
}

/**
 * Apple Keynote / Anthropic System Card Hero KPI Strip + Visual Telemetry Bars.
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

      <div className="site-ir-bars-panel">
        <div className="site-ir-bars-head">
          <span className="site-arch-meta-label">{copy.benchmarkTitle}</span>
          <span className="site-stack-note">{copy.note}</span>
        </div>

        <div className="site-ir-bars-list">
          {copy.bars.map((bar) => (
            <div key={bar.label} className="site-ir-bar-row">
              <div className="site-ir-bar-meta">
                <span className="site-ir-bar-label">{bar.label}</span>
                <strong className="site-ir-bar-val">{bar.valueText}</strong>
              </div>
              <div className="site-ir-bar-track" aria-hidden="true">
                <span className="site-ir-bar-fill" style={{ width: `${bar.pct}%` }} />
              </div>
              <span className="site-ir-bar-detail">{bar.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 6-Card Production Engineering Stack Matrix with Trust Boundary Badges.
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
              <span className="site-arch-boundary-pill">{card.boundary}</span>
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
