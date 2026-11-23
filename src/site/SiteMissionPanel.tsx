import { useEffect, useId, useState } from 'react';
import { ArrowRight, ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon, type SiteIconKey } from './SiteIcon.tsx';
import {
  SITE_META,
  type SiteCopy,
  type SiteLifecycleExit,
  type SiteLifecycleNode,
  type SiteMissionCommitment,
} from './siteContent.ts';

type MissionSelection =
  | { readonly kind: 'node'; readonly id: SiteLifecycleNode['id'] }
  | { readonly kind: 'pillar'; readonly id: SiteMissionCommitment['id'] }
  | { readonly kind: 'exit'; readonly id: SiteLifecycleExit['id'] };

/**
 * Approved Hybrid Variant A — '01 Mission' Panel inside About.
 * Icon-first manifesto pillars on the left, animated circular Sustainable AI Wardrobe infographic
 * + Luxury & Purchase-History Verified One-Tap Resale on the right, and a seamless bridge to Roadmap.
 */
export function AboutMissionPanel({
  copy,
  tapHint,
  onNextStep,
}: {
  readonly copy: SiteCopy['mission'];
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

  // Gentle auto-stepping tour around the 5 circular lifecycle stages (pauses on user interaction)
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
      {/* Left: Crisp Heading + 3 Sculptural Pillar Icons + Bridge to Roadmap */}
      <div className="site-mission-manifesto">
        <p className="site-eyebrow">{copy.eyebrow}</p>
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
                  <SiteIcon name={item.icon} size={17} />
                </span>
                <span className="site-mission-pillar-copy">
                  <strong>{item.title}</strong>
                  <small>{item.tag}</small>
                </span>
                <span className="site-mission-commit-num">{item.num}</span>
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

      {/* Right: Animated Circular Sustainable Wardrobe Infographic + Verified Resale Exits */}
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
            {isAutoPlaying ? <Pause size={11} aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
            <span>{isAutoPlaying ? copy.pausePlayLabel : copy.autoPlayLabel}</span>
          </button>

          {/* Animated SVG Circular Orbit + Flowing Dash Stream + Orbiting Champagne Light Beacon */}
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
            <span className="site-loop-center-sub">{copy.centerSub}</span>
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
                  <span className="site-loop-node-copy">
                    <strong>{node.title}</strong>
                    <small>{node.subtitle}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dual Interactive Circular Outcomes: Verified Authentic 1-Tap Resale + Gap-Only Buy */}
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
                <div>
                  <strong>{exit.title}</strong>
                  <span>{exit.subtitle}</span>
                </div>
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
 * Approved Hybrid Variant A — '02 Roadmap' Panel inside About.
 * Icon-first 3-stage milestones + 4 core moat icon chips + bottom inspector + bridge to BM & Founder.
 */
export function AboutRoadmapPanel({
  copy,
  tapHint,
  onNextStep,
}: {
  readonly copy: SiteCopy['vision'];
  readonly tapHint: string;
  readonly onNextStep: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(`stage:${copy.milestones[2].id}`);

  const activeInfo = (() => {
    if (selectedKey.startsWith('moat:')) {
      const id = selectedKey.slice(5);
      const moat = copy.moats.find((m) => m.id === id) ?? copy.moats[0];
      return { icon: moat.icon, title: moat.title, badge: moat.tag, detail: moat.detail };
    }
    const id = selectedKey.replace(/^stage:/, '');
    const stage = copy.milestones.find((m) => m.id === id) ?? copy.milestones[0];
    return { icon: stage.icon, title: stage.title, badge: stage.tag, detail: stage.detail };
  })();

  return (
    <div className="site-icon-view-wrap">
      <div className="site-icon-view-head">
        <div>
          <p className="site-eyebrow">{copy.roadmapTitle}</p>
          <h2 className="site-pillar-title">{copy.heading}</h2>
        </div>
        <button
          type="button"
          className="site-story-bridge-btn"
          onClick={() => {
            triggerHaptic('selection');
            onNextStep();
          }}
        >
          <span>{copy.nextToBmLabel}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      {/* 3 Connected Stage Icon Cards */}
      <div className="site-roadmap-stage-grid" role="group" aria-label={copy.roadmapTitle}>
        {copy.milestones.map((m) => {
          const key = `stage:${m.id}`;
          const isSelected = selectedKey === key;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={isSelected}
              className={`site-icon-tile site-roadmap-tile is-${m.status} ${
                isSelected ? 'is-active' : ''
              }`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedKey(key);
              }}
            >
              <span className="site-icon-tile-top">
                <span className="site-icon-tile-glyph">
                  <SiteIcon name={m.icon} size={18} />
                </span>
                <span className="site-icon-tile-tag">{m.tag}</span>
              </span>
              <span className="site-icon-tile-code">{m.phase}</span>
              <strong className="site-icon-tile-title">{m.title}</strong>
            </button>
          );
        })}
      </div>

      {/* 4 Core Moats Icon Row */}
      <div className="site-spec-chip-row" role="group" aria-label={copy.moatsTitle}>
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
                <SiteIcon name={moat.icon} size={15} />
              </span>
              <span className="site-spec-chip-copy">
                <strong>{moat.title}</strong>
                <small>{moat.tag}</small>
              </span>
            </button>
          );
        })}
      </div>

      {/* Uniform 1-Line Bottom Interactive Inspector */}
      <div className="site-icon-inspector" aria-live="polite">
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeInfo.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeInfo.title}</strong>
          <span className="site-bp-spec-tag is-primary">{activeInfo.badge}</span>
          <p className="site-icon-inspector-text">{activeInfo.detail}</p>
        </div>
        <span className="site-inspector-hint-sr">{tapHint}</span>
      </div>
    </div>
  );
}

/**
 * Approved Hybrid Variant A — '03 BM & Founder' Panel inside About.
 * Connects the 3-pillar circular BM (Pro + Gap-Only + Verified Authentic Resale) to the Founder card.
 */
export function AboutFounderPanel({
  copy,
  betaMailto,
  onBackToMission,
}: {
  readonly copy: SiteCopy['vision'];
  readonly betaMailto: string;
  readonly onBackToMission: () => void;
}) {
  const [selectedBmId, setSelectedBmId] = useState<string>(copy.revenuePillars[2].id);
  const bmUid = useId();
  const activeBm =
    copy.revenuePillars.find((p) => p.id === selectedBmId) ?? copy.revenuePillars[0];

  const handleBmKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = copy.revenuePillars.findIndex((p) => p.id === activeBm.id);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (idx + 1) % copy.revenuePillars.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (idx - 1 + copy.revenuePillars.length) % copy.revenuePillars.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = copy.revenuePillars.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const target = copy.revenuePillars[nextIdx];
      triggerHaptic('selection');
      setSelectedBmId(target.id);
      document.getElementById(`${bmUid}-bm-${target.id}`)?.focus();
    }
  };

  return (
    <div className="site-vision-grid">
      {/* Left: 3-Pillar Circular BM Icon Dock + Inspector + Quote */}
      <div className="site-vision-copy">
        <div className="site-icon-view-head">
          <div>
            <p className="site-eyebrow">{copy.revenueTitle}</p>
            <p className="site-bm-note">{copy.revenueNote}</p>
          </div>
          <button
            type="button"
            className="site-story-bridge-btn"
            onClick={() => {
              triggerHaptic('selection');
              onBackToMission();
            }}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>{copy.backToMissionLabel}</span>
          </button>
        </div>

        <div
          className="site-bm-icon-grid"
          role="tablist"
          aria-label={copy.revenueTitle}
          onKeyDown={handleBmKeyDown}
        >
          {copy.revenuePillars.map((pillar) => {
            const isSelected = pillar.id === activeBm.id;
            return (
              <button
                key={pillar.id}
                id={`${bmUid}-bm-${pillar.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${bmUid}-bm-panel`}
                tabIndex={isSelected ? 0 : -1}
                className={`site-icon-tile site-bm-icon-tile ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedBmId(pillar.id);
                }}
              >
                <span className="site-icon-tile-top">
                  <span className="site-icon-tile-glyph">
                    <SiteIcon name={pillar.icon} size={18} />
                  </span>
                  <span className="site-mission-commit-num">{pillar.num}</span>
                </span>
                <strong className="site-icon-tile-title">{pillar.title}</strong>
                <span className="site-icon-tile-tag">{pillar.mechanism}</span>
              </button>
            );
          })}
        </div>

        <div
          id={`${bmUid}-bm-panel`}
          className="site-icon-inspector"
          role="tabpanel"
          aria-labelledby={`${bmUid}-bm-${activeBm.id}`}
          aria-live="polite"
        >
          <div className="site-icon-inspector-main">
            <span className="site-icon-inspector-glyph">
              <SiteIcon name={activeBm.icon} size={15} />
            </span>
            <strong className="site-icon-inspector-title">{activeBm.title}</strong>
            <span className="site-bp-spec-tag is-primary">{activeBm.mechanism}</span>
            <p className="site-icon-inspector-text">{activeBm.detail}</p>
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
