import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from 'lucide-react';
import type { StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import {
  SITE_IR_DECK_HREF,
  SITE_META,
  type SiteCopy,
  type SiteLang,
  type SiteMood,
  type SiteTheme,
} from '../siteContent.ts';
import { SiteIcon, type SiteIconKey } from '../SiteIcon.tsx';
import { SiteNewsletterForm } from '../SiteNewsletterModal.tsx';
import { HudSpotlightDeck, type HudSpotlightItem } from './HudSpotlightDeck.tsx';

const PILLAR_ICONS: readonly SiteIconKey[] = [
  'imageMinus',
  'zap',
  'server',
  'box',
  'database',
  'checkCircle',
];

const STACK_CARD_TO_PILLAR_INDEX: Readonly<Record<string, number>> = {
  runtime: 0,
  mobile: 1,
  backend: 2,
  three: 3,
  ai: 4,
  maps: 5,
};

const PILLAR_INDEX_TO_STACK_CARD_ID: readonly string[] = [
  'runtime',
  'mobile',
  'backend',
  'three',
  'ai',
  'maps',
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ==========================================================================
 * 3. SPECS STAGE HUD (Metrics | Stack | Three.js 3D | Care)
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
 * 4. ABOUT STAGE HUD (Journey+Mission | Pain Points | Business Model | Connect)
 * ========================================================================== */

export interface AboutStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
  readonly mood: SiteMood;
  readonly betaMailto: string;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function AboutStageHud({
  copy,
  lang,
  theme,
  mood,
  betaMailto,
  interaction,
  onUpdateInteraction,
}: AboutStageHudProps) {
  const [journeyAutoPlay, setJourneyAutoPlay] = useState<boolean>(() => !prefersReducedMotion());
  const [journeyPhotoExpanded, setJourneyPhotoExpanded] = useState<boolean>(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>(
    copy.vision.milestones[0].id
  );
  const [founderSelectedId, setFounderSelectedId] = useState<string>(
    copy.vision.revenuePillars[0].id
  );
  const [selectedFaqId, setSelectedFaqId] = useState<string>(copy.vision.faqs[0]?.id ?? '');
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

  // About Subtab 1: Merged User Journey + Mission Loop + Roadmap
  if (interaction.aboutSubtab === 'journey') {
    const journey = copy.journey;
    const mission = copy.mission;
    const vision = copy.vision;
    const activeIdx = Math.max(0, Math.min(journey.cuts.length - 1, interaction.aboutJourneyIndex));
    const activeCut = journey.cuts[activeIdx] ?? journey.cuts[0];
    const activeLoopNode = mission.loopNodes[interaction.aboutLoopIndex] ?? mission.loopNodes[0];

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

    const roadmapItems: HudSpotlightItem[] = vision.milestones.map((m) => ({
      id: m.id,
      prefix: m.phase,
      prefixTone: m.status === 'done' ? 'live' : 'todo',
      title: m.title,
      body: <p className="hud-body-copy">{m.detail}</p>,
    }));

    return (
      <div className="hud-stack hud-about-editorial">
        <div className="hud-mission-head">
          <div className="hud-control-row">
            <h2 className="hud-mission-slogan">
              <span>{mission.headingLead}</span>
              <em>{mission.headingAccent}</em>
            </h2>
            <span className="hud-gold-badge">{journey.badge}</span>
          </div>
        </div>

        <div
          className={`hud-journey-stage ${journeyPhotoExpanded ? 'is-expanded' : ''}`}
          data-cut-status={activeCut.status}
        >
          <img
            src={activeCut.imageSrc}
            alt={activeCut.imageAlt}
            width={960}
            height={720}
            decoding="sync"
            className="hud-journey-img"
          />
          <div className="hud-journey-scrim" aria-hidden="true" />

          <div className="hud-journey-top">
            <div className="hud-journey-badges">
              <span className="hud-gold-badge">{activeCut.num}</span>
              <span className={`hud-status-pill is-${activeCut.status}`}>
                {activeCut.shortStatusLabel}
              </span>
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
                {journeyAutoPlay ? (
                  <Pause size={11} aria-hidden="true" />
                ) : (
                  <Play size={11} aria-hidden="true" />
                )}
                <span>{journeyAutoPlay ? journey.pausePlayLabel : journey.autoPlayLabel}</span>
              </button>
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-pressed={journeyPhotoExpanded}
                aria-label={
                  journeyPhotoExpanded
                    ? lang === 'ko'
                      ? '사진 기본 크기로 축소'
                      : 'Shrink illustration'
                    : lang === 'ko'
                      ? '사진 크게 보기'
                      : 'Expand illustration'
                }
                onClick={() => {
                  triggerHaptic('selection');
                  setJourneyPhotoExpanded((prev) => !prev);
                }}
              >
                {journeyPhotoExpanded ? (
                  <Minimize2 size={13} aria-hidden="true" />
                ) : (
                  <Maximize2 size={13} aria-hidden="true" />
                )}
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

        {/* Merged Mission: 5-Stage Circular iNVTRY Loop synced with 3D Möbius Ribbon */}
        <section className="hud-subblock" aria-label={mission.centerTitle}>
          <div className="hud-control-row">
            <span className="hud-eyebrow">
              {mission.centerKicker} · {mission.centerTitle}
            </span>
            <button
              type="button"
              className="hud-auto-btn hud-auto-btn--compact"
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

          <div className="hud-loop-pills" role="tablist" aria-label={mission.centerTitle}>
            {mission.loopNodes.map((node, idx) => {
              const isSelected = idx === interaction.aboutLoopIndex;
              return (
                <button
                  key={node.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`hud-loop-pill ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({ aboutLoopIndex: idx, aboutLoopPaused: true });
                  }}
                >
                  <span className="hud-loop-pill-num">{node.num}</span>
                  <span>{node.title}</span>
                </button>
              );
            })}
          </div>

          <div className="hud-card hud-loop-active-card">
            <div className="hud-loop-active-head">
              <SiteIcon name={activeLoopNode.icon} size={15} />
              <strong>{activeLoopNode.title}</strong>
              <span className="hud-gold-badge">{activeLoopNode.subtitle}</span>
            </div>
            <p className="hud-body-copy">{activeLoopNode.detail}</p>
          </div>
        </section>

        {/* Merged Mission: 3-Phase Roadmap */}
        <section className="hud-subblock" aria-label={vision.roadmapTitle}>
          <span className="hud-eyebrow">{vision.roadmapTitle}</span>
          <HudSpotlightDeck
            items={roadmapItems}
            activeId={selectedMilestoneId}
            onSelect={setSelectedMilestoneId}
            ariaLabel={vision.roadmapTitle}
            scrollToTopOnSelect={false}
          />
        </section>
      </div>
    );
  }

  // About Subtab 2: Pain Points (6 Fragmented Problems from Business Plan Slide 04)
  if (interaction.aboutSubtab === 'mission') {
    const pp = copy.painPoints;
    return (
      <div className="hud-stack hud-about-editorial">
        <header className="hud-about-section-head">
          <span className="hud-eyebrow">{pp.eyebrow}</span>
          <h2 className="hud-about-section-title">{pp.heading}</h2>
        </header>

        <div className="hud-pain-grid" role="list" aria-label={pp.heading}>
          {pp.items.map((item) => (
            <article key={item.id} className="hud-card hud-pain-card" role="listitem">
              <div className="hud-pain-card-top">
                <span className="hud-pain-icon" aria-hidden="true">
                  <SiteIcon name={item.icon} size={15} />
                </span>
                <span className="hud-pain-code">{item.code}</span>
              </div>
              <div className="hud-pain-metric">{item.metric}</div>
              <h3 className="hud-pain-title">{item.title}</h3>
              <p className="hud-pain-detail">{item.detail}</p>
            </article>
          ))}
        </div>

        <aside className="hud-card hud-pain-bottleneck" aria-label={pp.bottleneckTitle}>
          <strong className="hud-pain-bottleneck-title">{pp.bottleneckTitle}</strong>
          <p className="hud-body-copy">{pp.bottleneckDetail}</p>
        </aside>
      </div>
    );
  }

  const vision = copy.vision;

  // About Subtab 4: Connect (FAQ at Very Top -> Newsletter -> Founder Contact -> CTAs)
  if (interaction.aboutSubtab === 'connect') {
    const faqItems: HudSpotlightItem[] = vision.faqs.map((faq, idx) => ({
      id: faq.id,
      prefix: `Q${idx + 1}`,
      prefixTone: 'mono',
      title: faq.question,
      body: <p className="hud-body-copy">{faq.answer}</p>,
    }));

    return (
      <div className="hud-stack hud-about-editorial">
        <section className="hud-connect-faq-section" aria-label={vision.faqTitle}>
          <span className="hud-eyebrow">{vision.faqTitle}</span>
          <HudSpotlightDeck
            items={faqItems}
            activeId={selectedFaqId}
            onSelect={setSelectedFaqId}
            ariaLabel={vision.faqTitle}
            scrollToTopOnSelect={false}
          />
        </section>

        <section
          className="hud-card site-newsletter-inline-card"
          aria-label={copy.newsletter.inlineTitle}
        >
          <div className="site-newsletter-inline-head">
            <span className="hud-eyebrow">{copy.newsletter.kicker}</span>
            <h3 className="site-newsletter-inline-title">{copy.newsletter.inlineTitle}</h3>
            <p className="site-newsletter-inline-sub">{copy.newsletter.inlineSubtitle}</p>
          </div>
          <SiteNewsletterForm
            copy={copy.newsletter}
            lang={lang}
            source="site_about"
            variant="inline"
          />
        </section>

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
          <a
            href={`${SITE_IR_DECK_HREF}?theme=${theme}&mood=${mood}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hud-founder-cta hud-founder-cta--secondary"
          >
            <FileText size={14} aria-hidden="true" />
            <span>{vision.irDeckCta}</span>
          </a>
        </div>
      </div>
    );
  }

  // About Subtab 3: Detailed Business Model (4-Layer Revenue Engine + LTV Funnel + AI Cost Defense)
  const bm = vision.businessModel;
  const revenueItems: HudSpotlightItem[] = vision.revenuePillars.map((pillar) => ({
    id: pillar.id,
    icon: pillar.icon,
    title: pillar.title,
    badge: pillar.mechanism,
    badgeTone: 'gold',
    body: <p className="hud-body-copy">{pillar.detail}</p>,
  }));

  return (
    <div className="hud-stack hud-about-editorial">
      <header className="hud-about-section-head">
        <span className="hud-eyebrow">{bm.eyebrow}</span>
        <h2 className="hud-about-section-title">{bm.headline}</h2>
        <p className="hud-sub-meta">{vision.revenueNote}</p>
      </header>

      <HudSpotlightDeck
        items={revenueItems}
        activeId={founderSelectedId}
        onSelect={setFounderSelectedId}
        ariaLabel={vision.revenueTitle}
        scrollToTopOnSelect={false}
      />

      <section className="hud-subblock" aria-label={bm.funnelTitle}>
        <span className="hud-eyebrow">{bm.funnelTitle}</span>
        <div className="hud-bm-funnel-grid">
          {bm.funnelSteps.map((fs) => (
            <div key={fs.step} className="hud-card hud-bm-funnel-step">
              <span className="hud-pain-code">{fs.step}</span>
              <strong className="hud-bm-funnel-label">{fs.label}</strong>
              <span className="hud-bm-funnel-val">{fs.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="hud-subblock" aria-label={bm.costTitle}>
        <div className="hud-control-row">
          <span className="hud-eyebrow">{bm.costTitle}</span>
          <span className="hud-gold-badge">
            {bm.marginLabel} {bm.marginValue}
          </span>
        </div>

        <div className="hud-bm-cost-list">
          {bm.costDefenses.map((item) => (
            <article key={item.title} className="hud-card hud-bm-cost-card">
              <div className="hud-bm-cost-head">
                <strong>{item.title}</strong>
                <span className="hud-bm-cost-metric">{item.metric}</span>
              </div>
              <p className="hud-pain-detail">{item.detail}</p>
            </article>
          ))}
        </div>

        <p className="hud-bm-footnote">{bm.footnote}</p>
      </section>
    </div>
  );
}
