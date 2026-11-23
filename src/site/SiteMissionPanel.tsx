import { useId, useState } from 'react';
import { ArrowUpRight, RefreshCw, ShoppingBag } from 'lucide-react';
import {
  SITE_META,
  type SiteCopy,
  type SiteLifecycleNode,
} from './siteContent.ts';

/**
 * Approved Stitch Variant A — 'Our Mission' Panel inside the About glass window.
 * Left (42%): Editorial sustainability manifesto + 3 numbered hairline commitments.
 * Right (58%): Interactive monochrome & champagne-sand iNVTRY Apparel Lifecycle Loop
 * contrasting disconnected legacy try-on/resale silos against the 5-stage closed loop.
 */
export function AboutMissionPanel({
  copy,
}: {
  readonly copy: SiteCopy['mission'];
}) {
  const [activeNodeId, setActiveNodeId] = useState<SiteLifecycleNode['id']>('closet');
  const loopUid = useId();
  const activeNode =
    copy.loopNodes.find((node) => node.id === activeNodeId) ?? copy.loopNodes[0];
  const leftSilo = copy.silos.find((s) => s.side === 'left') ?? copy.silos[0];
  const rightSilo = copy.silos.find((s) => s.side === 'right') ?? copy.silos[1];
  const inspectorId = `${loopUid}-inspector`;

  const handleLoopKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = copy.loopNodes.findIndex((n) => n.id === activeNode.id);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (idx + 1) % copy.loopNodes.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (idx - 1 + copy.loopNodes.length) % copy.loopNodes.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = copy.loopNodes.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const targetNode = copy.loopNodes[nextIdx];
      setActiveNodeId(targetNode.id);
      const nextBtn = document.getElementById(`${loopUid}-tab-${targetNode.id}`);
      nextBtn?.focus();
    }
  };

  return (
    <div className="site-mission-grid">
      {/* Left: Sustainability Manifesto & 3 Hairline Commitments */}
      <div className="site-mission-manifesto">
        <p className="site-eyebrow">{copy.eyebrow}</p>
        <h2 className="site-mission-heading">
          {copy.headingLead}
          <em>{copy.headingAccent}</em>
        </h2>
        <p className="site-mission-statement">{copy.statement}</p>

        <ol className="site-mission-commitments">
          {copy.commitments.map((item) => (
            <li key={item.num} className="site-mission-commit-card">
              <div className="site-mission-commit-top">
                <span className="site-mission-commit-title">
                  <span className="site-mission-commit-num">{item.num}</span>
                  <strong>{item.title}</strong>
                </span>
                <span className="site-mission-commit-tag">{item.tag}</span>
              </div>
              <p className="site-mission-commit-detail">{item.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Right: Interactive iNVTRY Apparel Lifecycle Loop Diagram */}
      <div className="site-mission-diagram-card">
        <div className="site-mission-diagram-head">
          <div>
            <span className="site-arch-meta-label">{copy.diagramEyebrow}</span>
            <h3 className="site-mission-diagram-title">{copy.diagramTitle}</h3>
          </div>
          <div className="site-mission-legend" aria-hidden="true">
            <span className="site-legend-silo">{copy.diagramLegendSilo}</span>
            <span className="site-legend-core">{copy.diagramLegendCore}</span>
          </div>
        </div>

        {/* 3-Column Comparison: Legacy Try-On Silo | iNVTRY Closed Loop | Legacy Resale Silo */}
        <div className="site-loop-stage">
          <aside className="site-loop-silo site-loop-silo--left" aria-label={leftSilo.title}>
            <span className="site-loop-silo-tag">{leftSilo.tag}</span>
            <strong className="site-loop-silo-title">{leftSilo.title}</strong>
            <div className="site-loop-silo-steps">
              <span>{leftSilo.step1}</span>
              <span className="site-loop-silo-arrow" aria-hidden="true">↓</span>
              <span>{leftSilo.step2}</span>
            </div>
            <span className="site-loop-silo-gap">{leftSilo.gapNote}</span>
          </aside>

          <div className="site-loop-gap-badge" aria-hidden="true">?</div>

          <div className="site-loop-core">
            {/* Precision Vector Circular Orbit & Clockwise Flow Arrows */}
            <svg
              className="site-loop-orbit-svg"
              viewBox="0 0 360 246"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="siteLoopArrow"
                  viewBox="0 0 8 8"
                  refX="6"
                  refY="4"
                  markerWidth="5.5"
                  markerHeight="5.5"
                  orient="auto"
                >
                  <path d="M1 1.2L6.6 4L1 6.8" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </marker>
              </defs>
              {/* Outer subtle circular loop track */}
              <circle
                cx="180"
                cy="126"
                r="88"
                stroke="currentColor"
                strokeOpacity="0.24"
                strokeWidth="1.25"
              />
              {/* Inner delicate accent orbit */}
              <circle
                cx="180"
                cy="126"
                r="52"
                stroke="var(--accent-sand)"
                strokeOpacity="0.34"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              {/* Clockwise directional arcs on the outer orbit */}
              <path
                d="M 216 46 A 88 88 0 0 1 258 84"
                stroke="var(--accent-sand)"
                strokeOpacity="0.82"
                strokeWidth="1.4"
                markerEnd="url(#siteLoopArrow)"
              />
              <path
                d="M 266 144 A 88 88 0 0 1 240 190"
                stroke="var(--accent-sand)"
                strokeOpacity="0.82"
                strokeWidth="1.4"
                markerEnd="url(#siteLoopArrow)"
              />
              <path
                d="M 122 192 A 88 88 0 0 1 94 144"
                stroke="var(--accent-sand)"
                strokeOpacity="0.82"
                strokeWidth="1.4"
                markerEnd="url(#siteLoopArrow)"
              />
              <path
                d="M 102 84 A 88 88 0 0 1 144 46"
                stroke="var(--accent-sand)"
                strokeOpacity="0.82"
                strokeWidth="1.4"
                markerEnd="url(#siteLoopArrow)"
              />
            </svg>

            <div className="site-loop-center-emblem" aria-hidden="true">
              <span className="site-loop-center-kicker">{copy.centerKicker}</span>
              <strong className="site-loop-center-title">{copy.centerTitle}</strong>
              <span className="site-loop-center-sub">{copy.centerSub}</span>
            </div>

            <div
              className="site-loop-nodes"
              role="tablist"
              aria-label={copy.centerTitle}
              onKeyDown={handleLoopKeyDown}
            >
              {copy.loopNodes.map((node) => {
                const isSelected = node.id === activeNode.id;
                return (
                  <button
                    key={node.id}
                    id={`${loopUid}-tab-${node.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={inspectorId}
                    tabIndex={isSelected ? 0 : -1}
                    className={`site-loop-node-btn site-loop-node--${node.id} ${
                      isSelected ? 'is-active' : ''
                    }`}
                    onClick={() => setActiveNodeId(node.id)}
                  >
                    <span className="site-loop-node-num">{node.num}</span>
                    <span className="site-loop-node-copy">
                      <strong>{node.title}</strong>
                      <small>{node.subtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="site-loop-gap-badge" aria-hidden="true">?</div>

          <aside className="site-loop-silo site-loop-silo--right" aria-label={rightSilo.title}>
            <span className="site-loop-silo-tag">{rightSilo.tag}</span>
            <strong className="site-loop-silo-title">{rightSilo.title}</strong>
            <div className="site-loop-silo-steps">
              <span>{rightSilo.step1}</span>
              <span className="site-loop-silo-arrow" aria-hidden="true">↓</span>
              <span>{rightSilo.step2}</span>
            </div>
            <span className="site-loop-silo-gap">{rightSilo.gapNote}</span>
          </aside>
        </div>

        {/* Dual Circular Sustainability Exits */}
        <div className="site-loop-exits">
          {copy.exits.map((exit) => (
            <div key={exit.id} className="site-loop-exit-chip">
              {exit.id === 'resale' ? <RefreshCw size={13} /> : <ShoppingBag size={13} />}
              <div>
                <strong>{exit.title}</strong>
                <span>{exit.subtitle}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Live Selected Stage Inspector Line */}
        <div
          id={inspectorId}
          className="site-loop-inspector"
          role="tabpanel"
          aria-labelledby={`${loopUid}-tab-${activeNode.id}`}
          aria-live="polite"
        >
          <span className="site-loop-inspector-code">{activeNode.num}</span>
          <strong>{activeNode.title}</strong>
          <p>{activeNode.detail}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Approved Stitch Variant A — 'Roadmap' Tab inside About.
 * Pairs concrete 3-stage validation milestones with the 3-pillar sustainable business model.
 */
export function AboutRoadmapPanel({
  copy,
}: {
  readonly copy: SiteCopy['vision'];
}) {
  return (
    <div className="site-roadmap-bm-grid">
      <div className="site-roadmap-col">
        <p className="site-eyebrow">{copy.roadmapTitle}</p>
        <h2 className="site-section-title">{copy.heading}</h2>

        <ol className="site-roadmap-list">
          {copy.milestones.map((m) => (
            <li key={m.phase} className={`site-roadmap-item is-${m.status}`}>
              <span className="site-roadmap-phase">{m.phase}</span>
              <div className="site-roadmap-text">
                <strong>{m.title}</strong>
                <span>{m.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="site-bm-col">
        <div className="site-bm-head">
          <span className="site-arch-meta-label">{copy.revenueTitle}</span>
          <p className="site-bm-note">{copy.revenueNote}</p>
        </div>

        <ol className="site-bm-list">
          {copy.revenuePillars.map((pillar) => (
            <li key={pillar.num} className="site-bm-card">
              <div className="site-bm-card-top">
                <span className="site-bm-card-title">
                  <span className="site-mission-commit-num">{pillar.num}</span>
                  <strong>{pillar.title}</strong>
                </span>
                <span className="site-arch-boundary-text">{pillar.mechanism}</span>
              </div>
              <p className="site-bm-card-detail">{pillar.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Approved Stitch Variant A — 'Founder' Tab inside About.
 * Pairs the founder quote & 4 engineering/product moats with the verified Founder Dossier card.
 */
export function AboutFounderPanel({
  copy,
  betaMailto,
}: {
  readonly copy: SiteCopy['vision'];
  readonly betaMailto: string;
}) {
  return (
    <div className="site-vision-grid">
      <div className="site-vision-copy">
        <p className="site-eyebrow">{copy.eyebrow}</p>
        <blockquote className="site-vision-quote">{copy.quote}</blockquote>
        <p className="site-founder-overview">{copy.body}</p>

        <div className="site-moats-block">
          <span className="site-arch-meta-label">{copy.moatsTitle}</span>
          <div className="site-moats-grid">
            {copy.moats.map((moat) => (
              <article key={moat.title} className="site-moat-card">
                <strong>{moat.title}</strong>
                <p>{moat.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <aside className="site-founder-card" aria-label="Company and founder details">
        <div className="site-founder-head">
          <div className="site-founder-avatar" aria-hidden="true">
            RM
          </div>
          <div>
            <h3 className="site-founder-name">{SITE_META.founderName}</h3>
            <p className="site-founder-role">{copy.founderRole}</p>
            <a href={`mailto:${SITE_META.contactEmail}`} className="site-founder-email">
              {SITE_META.contactEmail}
            </a>
          </div>
        </div>

        <p className="site-founder-bio">{copy.founderBio}</p>

        <dl className="site-dossier-list">
          <div>
            <dt>{copy.hqLabel}</dt>
            <dd>{copy.hqValue}</dd>
          </div>
          <div>
            <dt>{copy.domainLabel}</dt>
            <dd>
              <strong>{SITE_META.domain}</strong>
            </dd>
          </div>
          <div>
            <dt>{copy.stackSummaryLabel}</dt>
            <dd>{copy.stackSummaryValue}</dd>
          </div>
        </dl>

        <a href={betaMailto} className="site-founder-cta">
          <span>{copy.directCta}</span>
          <ArrowUpRight size={16} />
        </a>
      </aside>
    </div>
  );
}
