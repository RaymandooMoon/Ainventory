import { useEffect, useId, useState } from 'react';
import { ArrowRight, ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon, type SiteIconKey } from './SiteIcon.tsx';
import {
  SITE_META,
  type SiteCopy,
  type SiteLifecycleExit,
  type SiteLifecycleNode,
  type SiteMilestone,
  type SiteMissionCommitment,
} from './siteContent.ts';

type MissionSelection =
  | { readonly kind: 'node'; readonly id: SiteLifecycleNode['id'] }
  | { readonly kind: 'pillar'; readonly id: SiteMissionCommitment['id'] }
  | { readonly kind: 'stage'; readonly id: SiteMilestone['id'] }
  | { readonly kind: 'exit'; readonly id: SiteLifecycleExit['id'] };

/**
 * Unified '02 Mission & Roadmap' Panel inside About (Subtitle-Free Icon-First UI).
 * Left: Crisp manifesto heading + 3 subtitle-free mission pillars + 3 LIVE/TO-DO roadmap stages + bridge to BM.
 * Right: Animated circular Sustainable AI Wardrobe loop + Verified Authentic Resale exits + uniform 1-line inspector.
 */
export function AboutMissionPanel({
  copy,
  visionCopy,
  tapHint,
  onNextStep,
}: {
  readonly copy: SiteCopy['mission'];
  readonly visionCopy: SiteCopy['vision'];
  readonly tapHint: string;
  readonly onNextStep: () => void;
}) {
  const [selection, setSelection] = useState<MissionSelection>({ kind: 'node', id: 'closet' });
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const loopUid = useId();
  const inspectorId = `${loopUid}-inspector`;

  useEffect(() => {
    if (!isAutoPlaying) return undefined;
    const nodeIds = copy.loopNodes.map((n) => n.id);
    const timer = window.setInterval(() => {
      setSelection((prev) => {
        const currIdx = prev.kind === 'node' ? nodeIds.indexOf(prev.id) : -1;
        const nextId = nodeIds[(currIdx + 1) % nodeIds.length] ?? nodeIds[0];
        return { kind: 'node', id: nextId };
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, copy.loopNodes]);

  const activeLoopNodeId: SiteLifecycleNode['id'] | null =
    selection.kind === 'node'
      ? selection.id
      : selection.kind === 'pillar'
        ? selection.id === 'wear'
          ? 'avatar'
          : selection.id === 'cpw'
            ? 'cpw'
            : null
        : null;

  const inspectorData: {
    readonly icon: SiteIconKey;
    readonly badge: string;
    readonly title: string;
    readonly detail: string;
  } = (() => {
    if (selection.kind === 'pillar') {
      const item =
        copy.commitments.find((c) => c.id === selection.id) ?? copy.commitments[0];
      return {
        icon: item.icon,
        badge: item.tag,
        title: item.title,
        detail: item.detail,
      };
    }
    if (selection.kind === 'stage') {
      const stage =
        visionCopy.milestones.find((m) => m.id === selection.id) ?? visionCopy.milestones[0];
      return {
        icon: stage.icon,
        badge: stage.tag,
        title: stage.title,
        detail: stage.detail,
      };
    }
    if (selection.kind === 'exit') {
      const exit = copy.exits.find((e) => e.id === selection.id) ?? copy.exits[0];
      return {
        icon: exit.icon,
        badge: exit.id === 'resale' ? '1-TAP' : 'GAP',
        title: exit.title,
        detail: exit.detail,
      };
    }
    const node = copy.loopNodes.find((n) => n.id === selection.id) ?? copy.loopNodes[0];
    return {
      icon: node.icon,
      badge: node.num,
      title: node.title,
      detail: node.detail,
    };
  })();

  const handleSelectManual = (next: MissionSelection) => {
    triggerHaptic('selection');
    setIsAutoPlaying(false);
    setSelection(next);
  };

  const handleLoopKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currId = activeLoopNodeId ?? copy.loopNodes[0].id;
    const idx = copy.loopNodes.findIndex((n) => n.id === currId);
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
      handleSelectManual({ kind: 'node', id: targetNode.id });
      document.getElementById(`${loopUid}-tab-${targetNode.id}`)?.focus();
    }
  };

  return (
    <div className="site-mission-grid">
      {/* Left: Crisp Heading + 3 Subtitle-Free Mission Pillars + 3 LIVE/TO-DO Roadmap Chips */}
      <div className="site-mission-manifesto">
        <h2 className="site-mission-heading">
          <span>{copy.headingLead}</span>
          <span className="site-nowrap-phrase">
            <em>{copy.headingAccent}</em>
          </span>
        </h2>

        <div className="site-mission-pillar-dock" role="group" aria-label={copy.eyebrow}>
          {copy.commitments.map((item) => {
            const isSelected =
              (selection.kind === 'pillar' && selection.id === item.id) ||
              (item.id === 'resale' && selection.kind === 'exit' && selection.id === 'resale');
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-mission-pillar-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => handleSelectManual({ kind: 'pillar', id: item.id })}
              >
                <span className="site-icon-tile-glyph">
                  <SiteIcon name={item.icon} size={16} />
                </span>
                <strong className="site-mission-pillar-title">{item.title}</strong>
                <span className="site-mission-commit-num">{item.num}</span>
              </button>
            );
          })}
        </div>

        {/* Integrated Compact LIVE / TO-DO Roadmap Strip (Subtitle-Free) */}
        <div className="site-mission-roadmap-strip" role="group" aria-label={visionCopy.roadmapTitle}>
          {visionCopy.milestones.map((m) => {
            const isSelected = selection.kind === 'stage' && selection.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-roadmap-mini-btn is-${m.status} ${isSelected ? 'is-active' : ''}`}
                onClick={() => handleSelectManual({ kind: 'stage', id: m.id })}
              >
                <span className={`site-status-dot ${m.status === 'done' ? 'is-live' : 'is-todo'}`}>
                  {m.phase}
                </span>
                <strong>{m.title}</strong>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="site-story-bridge-btn"
          onClick={() => {
            triggerHaptic('selection');
            onNextStep();
          }}
        >
          <span>{copy.nextLabel}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Right: Animated Circular Sustainable Wardrobe Infographic + Subtitle-Free Verified Resale Exits */}
      <div className="site-mission-diagram-card">
        <div className="site-loop-core" data-auto-playing={isAutoPlaying}>
          <button
            type="button"
            className="site-loop-motion-btn"
            aria-pressed={isAutoPlaying}
            onClick={() => {
              triggerHaptic('selection');
              setIsAutoPlaying((prev) => !prev);
            }}
            title={isAutoPlaying ? copy.pausePlayLabel : copy.autoPlayLabel}
          >
            {isAutoPlaying ? (
              <Pause size={11} aria-hidden="true" />
            ) : (
              <Play size={11} aria-hidden="true" />
            )}
            <span>{isAutoPlaying ? copy.pausePlayLabel : copy.autoPlayLabel}</span>
          </button>

          <svg
            className="site-loop-orbit-svg"
            viewBox="0 0 360 236"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="180"
              cy="120"
              r="86"
              stroke="currentColor"
              strokeOpacity="0.16"
              strokeWidth="1.25"
            />
            <circle
              cx="180"
              cy="120"
              r="86"
              className="site-loop-flow-ring"
              stroke="var(--accent-sand)"
              strokeOpacity="0.68"
              strokeWidth="1.6"
              strokeDasharray="16 26"
              strokeLinecap="round"
            />
            <circle
              cx="180"
              cy="120"
              r="52"
              className="site-loop-inner-ring"
              stroke="var(--accent-sand)"
              strokeOpacity="0.32"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
            <g className="site-loop-beacon-rotor">
              <circle cx="180" cy="34" r="6" fill="var(--accent-sand)" fillOpacity="0.22" />
              <circle cx="180" cy="34" r="2.8" fill="var(--accent-sand)" />
            </g>
          </svg>

          <div className="site-loop-center-emblem" aria-hidden="true">
            <span className="site-loop-center-kicker">{copy.centerKicker}</span>
            <strong className="site-loop-center-title">{copy.centerTitle}</strong>
          </div>

          <div
            className="site-loop-nodes"
            role="group"
            aria-label={copy.centerTitle}
            onKeyDown={handleLoopKeyDown}
          >
            {copy.loopNodes.map((node) => {
              const isSelected = activeLoopNodeId === node.id;
              return (
                <button
                  key={node.id}
                  id={`${loopUid}-tab-${node.id}`}
                  type="button"
                  aria-pressed={isSelected}
                  className={`site-loop-node-btn site-loop-node--${node.id} ${
                    isSelected ? 'is-active' : ''
                  }`}
                  onClick={() => handleSelectManual({ kind: 'node', id: node.id })}
                >
                  <span className="site-loop-node-icon">
                    <SiteIcon name={node.icon} size={14} />
                  </span>
                  <strong className="site-loop-node-title">{node.title}</strong>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dual Subtitle-Free Interactive Circular Outcomes */}
        <div className="site-loop-exits">
          {copy.exits.map((exit) => {
            const isSelected = selection.kind === 'exit' && selection.id === exit.id;
            return (
              <button
                key={exit.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-loop-exit-chip ${exit.id === 'resale' ? 'is-featured' : ''} ${
                  isSelected ? 'is-active' : ''
                }`}
                onClick={() => handleSelectManual({ kind: 'exit', id: exit.id })}
              >
                <span className="site-loop-node-icon">
                  <SiteIcon name={exit.icon} size={15} />
                </span>
                <strong>{exit.title}</strong>
              </button>
            );
          })}
        </div>

        {/* Bottom Uniform 1-Line Interactive Inspector Bar */}
        <div
          id={inspectorId}
          className="site-icon-inspector"
          aria-live={isAutoPlaying ? 'off' : 'polite'}
        >
          <div className="site-icon-inspector-main">
            <span className="site-icon-inspector-glyph">
              <SiteIcon name={inspectorData.icon} size={15} />
            </span>
            <strong className="site-icon-inspector-title">{inspectorData.title}</strong>
            <span className="site-bp-spec-tag is-primary">{inspectorData.badge}</span>
            <p className="site-icon-inspector-text">{inspectorData.detail}</p>
          </div>
          <span className="site-inspector-hint-sr">{tapHint}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Subtitle-Free '03 BM & Founder' Panel inside About.
 * Connects the 3-pillar circular BM + 4 core moats directly to the Founder dossier card.
 */
export function AboutFounderPanel({
  copy,
  betaMailto,
  onBackToJourney,
}: {
  readonly copy: SiteCopy['vision'];
  readonly betaMailto: string;
  readonly onBackToJourney: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(`bm:${copy.revenuePillars[2].id}`);

  const activeInfo = (() => {
    if (selectedKey.startsWith('moat:')) {
      const id = selectedKey.slice(5);
      const moat = copy.moats.find((m) => m.id === id) ?? copy.moats[0];
      return { icon: moat.icon, title: moat.title, badge: moat.tag, detail: moat.detail };
    }
    const id = selectedKey.replace(/^bm:/, '');
    const bm = copy.revenuePillars.find((p) => p.id === id) ?? copy.revenuePillars[0];
    return { icon: bm.icon, title: bm.title, badge: bm.mechanism, detail: bm.detail };
  })();

  return (
    <div className="site-vision-grid">
      {/* Left: 3-Pillar Circular BM + 4 Core Moats (All Subtitle-Free) + Inspector + Quote */}
      <div className="site-vision-copy">
        <div className="site-icon-view-head">
          <h2 className="site-pillar-title">{copy.revenueTitle}</h2>
          <button
            type="button"
            className="site-story-bridge-btn"
            onClick={() => {
              triggerHaptic('selection');
              onBackToJourney();
            }}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>{copy.backToMissionLabel}</span>
          </button>
        </div>

        <div className="site-bm-icon-grid" role="group" aria-label={copy.revenueTitle}>
          {copy.revenuePillars.map((pillar) => {
            const key = `bm:${pillar.id}`;
            const isSelected = selectedKey === key;
            return (
              <button
                key={pillar.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-icon-tile site-bm-icon-tile ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedKey(key);
                }}
              >
                <span className="site-icon-tile-top">
                  <span className="site-icon-tile-glyph">
                    <SiteIcon name={pillar.icon} size={18} />
                  </span>
                  <span className="site-mission-commit-num">{pillar.num}</span>
                </span>
                <strong className="site-icon-tile-title">{pillar.title}</strong>
              </button>
            );
          })}
        </div>

        <div className="site-spec-chip-row site-founder-moats-row" role="group" aria-label={copy.moatsTitle}>
          {copy.moats.map((moat) => {
            const key = `moat:${moat.id}`;
            const isSelected = selectedKey === key;
            return (
              <button
                key={moat.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-spec-chip-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedKey(key);
                }}
              >
                <span className="site-spec-chip-icon">
                  <SiteIcon name={moat.icon} size={14} />
                </span>
                <strong className="site-spec-chip-title">{moat.title}</strong>
              </button>
            );
          })}
        </div>

        <div className="site-icon-inspector" aria-live="polite">
          <div className="site-icon-inspector-main">
            <span className="site-icon-inspector-glyph">
              <SiteIcon name={activeInfo.icon} size={15} />
            </span>
            <strong className="site-icon-inspector-title">{activeInfo.title}</strong>
            <span className="site-bp-spec-tag is-primary">{activeInfo.badge}</span>
            <p className="site-icon-inspector-text">{activeInfo.detail}</p>
          </div>
        </div>

        <blockquote className="site-vision-quote">{copy.quote}</blockquote>
      </div>

      {/* Right: Concise Verified Founder Dossier Card */}
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
