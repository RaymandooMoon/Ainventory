import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { SITE_META, type SiteCopy, type SiteLang } from '../siteContent.ts';
import type { SiteIconKey } from '../SiteIcon.tsx';
import { HudSpotlightDeck, type HudSpotlightItem } from './HudSpotlightDeck.tsx';

const PILLAR_ICONS: readonly SiteIconKey[] = [
  'refreshCw',
  'shieldCheck',
  'checkCircle',
  'cloud',
  'box',
  'imageMinus',
];

const STACK_CARD_TO_PILLAR_INDEX: Readonly<Record<string, number>> = {
  three: 4,
  ai: 0,
  maps: 3,
  security: 1,
  asset: 5,
  runtime: 2,
};

const PILLAR_INDEX_TO_STACK_CARD_ID: readonly string[] = [
  'ai',
  'security',
  'runtime',
  'maps',
  'three',
  'asset',
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ==========================================================================
 * 3. SPECS STAGE HUD (Metrics | Stack | 3D Fitting | Care)
 * ========================================================================== */

export interface SpecsStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function SpecsStageHud({ copy, interaction, onUpdateInteraction }: SpecsStageHudProps) {
  const [fittingFeatId, setFittingFeatId] = useState<string>(
    copy.capabilities.pillars.atelier.features[0].id
  );
  const [careFeatId, setCareFeatId] = useState<string>(
    copy.capabilities.pillars.intelligence.features[0].id
  );
  const stack = copy.stack;
  const focusedPillarIdx = Math.max(0, Math.min(5, interaction.specsFocusedIndex));

  if (interaction.specsSubtab === 'kpi') {
    const activePillarId = `pillar-${focusedPillarIdx}`;

    const pillarItems: HudSpotlightItem[] = stack.pillars3d.map((pillar, idx) => ({
      id: `pillar-${idx}`,
      icon: PILLAR_ICONS[idx] ?? 'gauge',
      title: pillar.title,
      badge: pillar.value,
      badgeTone: 'gold',
      body: <p className="hud-body-copy">{pillar.detail}</p>,
    }));

    return (
      <div className="hud-stack">
        <HudSpotlightDeck
          items={pillarItems}
          activeId={activePillarId}
          onSelect={(id) => {
            const idx = Number(id.replace('pillar-', ''));
            if (Number.isFinite(idx) && idx >= 0 && idx < stack.pillars3d.length) {
              onUpdateInteraction({ specsFocusedIndex: idx });
            }
          }}
          ariaLabel={stack.heading}
        />
      </div>
    );
  }

  if (interaction.specsSubtab === 'fitting') {
    const pillar = copy.capabilities.pillars.atelier;
    const items: HudSpotlightItem[] = pillar.features.map((feat) => ({
      id: feat.id,
      icon: feat.icon,
      title: feat.label,
      body: <p className="hud-body-copy">{feat.detail}</p>,
    }));

    return (
      <div className="hud-stack">
        <HudSpotlightDeck
          items={items}
          activeId={fittingFeatId}
          onSelect={setFittingFeatId}
          ariaLabel={pillar.title}
        />
      </div>
    );
  }

  if (interaction.specsSubtab === 'care') {
    const carePillar = copy.capabilities.pillars.intelligence;
    const careItems: HudSpotlightItem[] = carePillar.features.map((feat) => ({
      id: feat.id,
      icon: feat.icon,
      title: feat.label,
      body: <p className="hud-body-copy">{feat.detail}</p>,
    }));

    return (
      <div className="hud-stack">
        <div className="hud-grid-2">
          <div className="hud-card hud-kpi-card">
            <span className="hud-metric-chip-label">{copy.interactive.cpwLabel}</span>
            <div className="hud-kpi-val-row">
              <strong className="hud-kpi-big">{copy.interactive.cpwValue}</strong>
              <span className="hud-gold-badge">{copy.interactive.cpwDelta}</span>
            </div>
          </div>

          <div className="hud-card hud-kpi-card">
            <span className="hud-metric-chip-label">{copy.interactive.balanceLabel}</span>
            <div className="hud-kpi-val-row">
              <strong className="hud-kpi-big">{copy.interactive.balanceValue}</strong>
            </div>
          </div>
        </div>

        <HudSpotlightDeck
          items={careItems}
          activeId={careFeatId}
          onSelect={setCareFeatId}
          ariaLabel={carePillar.title}
        />
      </div>
    );
  }

  // Specs Subtab 2: Tech Stack (synced bidirectionally with 3D pillar focus & wheel scroll)
  const activeStackId = PILLAR_INDEX_TO_STACK_CARD_ID[focusedPillarIdx] ?? stack.cards[0].id;
  const stackItems: HudSpotlightItem[] = stack.cards.map((card) => ({
    id: card.id,
    icon: card.icon,
    title: card.metric,
    badge: card.title,
    badgeTone: 'gold',
    body: <p className="hud-body-copy">{card.detail}</p>,
  }));

  return (
    <div className="hud-stack">
      <HudSpotlightDeck
        items={stackItems}
        activeId={activeStackId}
        onSelect={(cardId) => {
          const pillar = STACK_CARD_TO_PILLAR_INDEX[cardId];
          if (typeof pillar === 'number') {
            onUpdateInteraction({ specsFocusedIndex: pillar });
          }
        }}
        ariaLabel="Tech stack modules"
      />
    </div>
  );
}

/* ==========================================================================
 * 4. ABOUT STAGE HUD (Journey | Mission | Model)
 * ========================================================================== */

export interface AboutStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly betaMailto: string;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function AboutStageHud({
  copy,
  betaMailto,
  interaction,
  onUpdateInteraction,
}: AboutStageHudProps) {
  const [journeyAutoPlay, setJourneyAutoPlay] = useState<boolean>(() => !prefersReducedMotion());
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>(
    copy.vision.milestones[0].id
  );
  const [founderSelectedId, setFounderSelectedId] = useState<string>(
    copy.vision.revenuePillars[0].id
  );
  const journeyIdxRef = useRef<number>(interaction.aboutJourneyIndex);

  useEffect(() => {
    journeyIdxRef.current = interaction.aboutJourneyIndex;
  }, [interaction.aboutJourneyIndex]);

  useEffect(() => {
    if (interaction.aboutSubtab !== 'journey' || !journeyAutoPlay) return undefined;
    const cutCount = copy.journey.cuts.length;
    if (cutCount <= 0) return undefined;
    const timer = window.setInterval(() => {
      const nextIdx = (journeyIdxRef.current + 1) % cutCount;
      journeyIdxRef.current = nextIdx;
      onUpdateInteraction({ aboutJourneyIndex: nextIdx });
    }, 4600);
    return () => window.clearInterval(timer);
  }, [interaction.aboutSubtab, journeyAutoPlay, copy.journey.cuts.length, onUpdateInteraction]);

  if (interaction.aboutSubtab === 'journey') {
    const journey = copy.journey;
    const activeIdx = Math.max(0, Math.min(journey.cuts.length - 1, interaction.aboutJourneyIndex));
    const activeCut = journey.cuts[activeIdx] ?? journey.cuts[0];

    const selectCut = (nextIdx: number) => {
      triggerHaptic('selection');
      setJourneyAutoPlay(false);
      onUpdateInteraction({ aboutJourneyIndex: nextIdx });
    };

    const cutItems: HudSpotlightItem[] = journey.cuts.map((cut) => ({
      id: cut.id,
      prefix: cut.num,
      prefixTone: 'mono',
      title: cut.title,
      badge: cut.shortStatusLabel,
      badgeTone: cut.status,
      body: <p className="hud-body-copy">{cut.detail}</p>,
    }));

    return (
      <div className="hud-stack">
        <div className="hud-journey-stage" data-cut-status={activeCut.status}>
          <img
            key={activeCut.id}
            src={activeCut.imageSrc}
            alt={activeCut.imageAlt}
            width={960}
            height={720}
            decoding="async"
            className="hud-journey-img"
          />
          <div className="hud-journey-scrim" aria-hidden="true" />

          <div className="hud-journey-top">
            <div className="hud-journey-badges">
              <span className="hud-gold-badge">{activeCut.num}</span>
              <span className={`hud-status-pill is-${activeCut.status}`}>{activeCut.shortStatusLabel}</span>
            </div>
            <div className="hud-journey-controls">
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={journey.prevLabel}
                onClick={() => selectCut((activeIdx - 1 + journey.cuts.length) % journey.cuts.length)}
              >
                <ChevronLeft size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={journey.nextCutLabel}
                onClick={() => selectCut((activeIdx + 1) % journey.cuts.length)}
              >
                <ChevronRight size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hud-auto-btn"
                aria-pressed={journeyAutoPlay}
                onClick={() => {
                  triggerHaptic('selection');
                  setJourneyAutoPlay((prev) => !prev);
                }}
              >
                {journeyAutoPlay ? <Pause size={11} aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
                <span>{journeyAutoPlay ? journey.pausePlayLabel : journey.autoPlayLabel}</span>
              </button>
            </div>
          </div>

          <div className="hud-speech-bubble">
            <p>{activeCut.speechBubble}</p>
          </div>
        </div>

        <HudSpotlightDeck
          items={cutItems}
          activeId={activeCut.id}
          onSelect={(id) => {
            const nextIdx = journey.cuts.findIndex((c) => c.id === id);
            if (nextIdx >= 0) selectCut(nextIdx);
          }}
          ariaLabel={journey.badge}
          scrollToTopOnSelect={false}
        />
      </div>
    );
  }

  if (interaction.aboutSubtab === 'mission') {
    const mission = copy.mission;
    const vision = copy.vision;
    const activeLoopNode = mission.loopNodes[interaction.aboutLoopIndex] ?? mission.loopNodes[0];

    const loopItems: HudSpotlightItem[] = mission.loopNodes.map((node) => ({
      id: node.id,
      prefix: node.num,
      prefixTone: 'mono',
      icon: node.icon,
      title: node.title,
      body: <p className="hud-body-copy">{node.detail}</p>,
    }));

    const roadmapItems: HudSpotlightItem[] = vision.milestones.map((m) => ({
      id: m.id,
      prefix: m.phase,
      prefixTone: m.status === 'done' ? 'live' : 'todo',
      title: m.title,
      body: <p className="hud-body-copy">{m.detail}</p>,
    }));

    return (
      <div className="hud-stack">
        <div className="hud-mission-head">
          <div className="hud-control-row">
            <h2 className="hud-mission-slogan">
              <span>{mission.headingLead}</span>
              <em>{mission.headingAccent}</em>
            </h2>
            <button
              type="button"
              className="hud-auto-btn"
              aria-pressed={!interaction.aboutLoopPaused}
              onClick={() => {
                triggerHaptic('selection');
                onUpdateInteraction({ aboutLoopPaused: !interaction.aboutLoopPaused });
              }}
            >
              {interaction.aboutLoopPaused ? (
                <Play size={11} aria-hidden="true" />
              ) : (
                <Pause size={11} aria-hidden="true" />
              )}
              <span>
                {interaction.aboutLoopPaused ? mission.autoPlayLabel : mission.pausePlayLabel}
              </span>
            </button>
          </div>
        </div>

        <HudSpotlightDeck
          items={loopItems}
          activeId={activeLoopNode.id}
          onSelect={(id) => {
            const idx = mission.loopNodes.findIndex((n) => n.id === id);
            if (idx >= 0) {
              onUpdateInteraction({ aboutLoopIndex: idx, aboutLoopPaused: true });
            }
          }}
          ariaLabel={mission.centerTitle}
        />

        <div className="hud-subblock">
          <span className="hud-eyebrow">{vision.roadmapTitle}</span>
          <HudSpotlightDeck
            items={roadmapItems}
            activeId={selectedMilestoneId}
            onSelect={setSelectedMilestoneId}
            ariaLabel={vision.roadmapTitle}
            scrollToTopOnSelect={false}
          />
        </div>
      </div>
    );
  }

  // About Subtab 3: Model & Founder
  const vision = copy.vision;
  const revenueItems: HudSpotlightItem[] = vision.revenuePillars.map((pillar) => ({
    id: pillar.id,
    icon: pillar.icon,
    title: pillar.title,
    badge: pillar.mechanism,
    badgeTone: 'gold',
    body: <p className="hud-body-copy">{pillar.detail}</p>,
  }));

  return (
    <div className="hud-stack">
      <HudSpotlightDeck
        items={revenueItems}
        activeId={founderSelectedId}
        onSelect={setFounderSelectedId}
        ariaLabel={vision.revenueTitle}
      />

      <aside className="hud-founder-card" aria-label="Founder contact">
        <div className="hud-founder-head">
          <div className="hud-founder-avatar" aria-hidden="true">
            RM
          </div>
          <div className="hud-founder-id">
            <h3>{SITE_META.founderName}</h3>
            <p>
              {vision.founderRole} · {vision.hqValue}
            </p>
            <a href={`mailto:${SITE_META.contactEmail}`} className="hud-founder-email">
              {SITE_META.contactEmail}
            </a>
          </div>
        </div>
      </aside>

      <div className="hud-founder-actions">
        <a href={betaMailto} className="hud-founder-cta">
          <span>{vision.directCta}</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
