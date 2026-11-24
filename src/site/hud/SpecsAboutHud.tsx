import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { SiteIcon, type SiteIconKey } from '../SiteIcon.tsx';
import { handleTablistArrows } from './tablistArrows.ts';
import {
  SITE_META,
  type SiteCopy,
  type SiteLang,
  type SiteLifecycleExit,
  type SiteMilestone,
  type SiteMissionCommitment,
} from '../siteContent.ts';

const SPEC_TO_PILLAR_INDEX: Readonly<Record<string, number>> = {
  webp: 5,
  defense: 1,
  rig3d: 4,
  cpw: 0,
};

const STACK_CARD_TO_PILLAR_INDEX: Readonly<Record<string, number>> = {
  three: 4,
  ai: 3,
  maps: 3,
  security: 1,
  asset: 0,
  runtime: 2,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ==========================================================================
 * 3. SPECS STAGE HUD (Key Metrics | Tech Stack)
 * ========================================================================== */

export interface SpecsStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function SpecsStageHud({ copy, lang, interaction, onUpdateInteraction }: SpecsStageHudProps) {
  const stack = copy.stack;
  const [explicitSelection, setExplicitSelection] = useState<{
    readonly pillar: number;
    readonly key: string;
  } | null>(null);
  const [selectedStackId, setSelectedStackId] = useState<string>(stack.cards[0].id);
  const uid = useId();

  if (interaction.specsSubtab === 'kpi') {
    const focusedPillarIdx = Math.max(0, Math.min(5, interaction.specsFocusedIndex));
    const focusedPillar = stack.pillars3d[focusedPillarIdx] ?? stack.pillars3d[0];

    const derivedKey = (() => {
      if (explicitSelection && explicitSelection.pillar === focusedPillarIdx) {
        return explicitSelection.key;
      }
      if (focusedPillarIdx <= 3 && stack.heroKpis[focusedPillarIdx]) {
        return `kpi:${stack.heroKpis[focusedPillarIdx].id}`;
      }
      if (focusedPillarIdx === 4) return 'spec:rig3d';
      if (focusedPillarIdx === 5) return 'spec:webp';
      return `kpi:${stack.heroKpis[0].id}`;
    })();

    const inspector: {
      readonly icon: SiteIconKey;
      readonly title: string;
      readonly badge: string;
      readonly detail: string;
    } = (() => {
      if (derivedKey.startsWith('spec:')) {
        const specId = derivedKey.slice(5);
        const spec = stack.specs.find((s) => s.id === specId) ?? stack.specs[0];
        return {
          icon: spec.icon,
          title: spec.label,
          badge: spec.valueText,
          detail: spec.detail,
        };
      }
      const kpiId = derivedKey.replace(/^kpi:/, '');
      const kpi = stack.heroKpis.find((k) => k.id === kpiId) ?? stack.heroKpis[0];
      return {
        icon: kpi.icon,
        title: kpi.label,
        badge: kpi.value,
        detail: kpi.detail,
      };
    })();

    return (
      <div className="hud-stack">
        <div className="hud-display-zone">
          <div className="hud-section-head">
            <div>
              <span className="hud-eyebrow">{stack.eyebrow}</span>
              <h2 className="hud-title">{stack.heading}</h2>
            </div>
            <span className="hud-gold-badge">{focusedPillar.label}</span>
          </div>

          {/* Active KPI / Spec Description */}
          <div className="hud-inspector hud-inspector--top" aria-live="polite">
            <div className="hud-inline-head">
              <span className="hud-icon-badge">
                <SiteIcon name={inspector.icon} size={14} />
              </span>
              <strong>{inspector.title}</strong>
              <span className="hud-gold-badge">{inspector.badge}</span>
            </div>
            <p className="hud-body-copy">{inspector.detail}</p>
          </div>
        </div>

        <div className="hud-interactive-zone">
          <span className="hud-deck-cue">
            {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
          </span>

          {/* 4 Hero KPI Cards synced bidirectionally with 3D Pillars 0..3 */}
          <div className="hud-grid-2" role="group" aria-label={stack.heading}>
            {stack.heroKpis.map((kpi, idx) => {
              const itemKey = `kpi:${kpi.id}`;
              const isSelected = derivedKey === itemKey;
              return (
                <button
                  key={kpi.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`hud-kpi-btn ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setExplicitSelection({ pillar: idx, key: itemKey });
                    onUpdateInteraction({ specsFocusedIndex: idx });
                  }}
                >
                  <span className="hud-icon-badge">
                    <SiteIcon name={kpi.icon} size={15} />
                  </span>
                  <strong className="hud-kpi-big">{kpi.value}</strong>
                  <span className="hud-kpi-label">{kpi.label}</span>
                </button>
              );
            })}
          </div>

          {/* 4 Verification Spec Cards synced with 3D Pillars */}
          <div className="hud-subblock">
            <span className="hud-eyebrow">{stack.benchmarkTitle}</span>
            <div className="hud-grid-2" role="group" aria-label={stack.benchmarkTitle}>
              {stack.specs.map((spec) => {
                const itemKey = `spec:${spec.id}`;
                const isSelected = derivedKey === itemKey;
                const targetPillar = SPEC_TO_PILLAR_INDEX[spec.id] ?? 0;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setExplicitSelection({ pillar: targetPillar, key: itemKey });
                      onUpdateInteraction({ specsFocusedIndex: targetPillar });
                    }}
                  >
                    <div className="hud-tile-top">
                      <span className="hud-icon-badge">
                        <SiteIcon name={spec.icon} size={14} />
                      </span>
                      <span className="hud-mono-accent">{spec.valueText}</span>
                    </div>
                    <strong className="hud-tile-title">{spec.shortLabel}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Specs Subtab 2: Tech Stack (All 6 Production Cards)
  const activeCard = stack.cards.find((c) => c.id === selectedStackId) ?? stack.cards[0];
  const stackPrefix = `${uid}-stack`;
  const stackPanelId = `${uid}-stack-panel`;
  const stackCardIds = stack.cards.map((c) => c.id);
  const selectStackCard = (cardId: string) => {
    setSelectedStackId(cardId);
    const pillar = STACK_CARD_TO_PILLAR_INDEX[cardId];
    if (typeof pillar === 'number') {
      onUpdateInteraction({ specsFocusedIndex: pillar });
    }
  };

  return (
    <div className="hud-stack">
      <div className="hud-display-zone">
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{stack.eyebrow}</span>
            <h2 className="hud-title">{stack.heading}</h2>
          </div>
        </div>

        {/* Active Stack Card Description */}
        <div
          id={stackPanelId}
          className="hud-inspector hud-inspector--top"
          role="tabpanel"
          aria-labelledby={`${stackPrefix}-${activeCard.id}`}
          aria-live="polite"
        >
          <div className="hud-inline-head">
            <span className="hud-icon-badge">
              <SiteIcon name={activeCard.icon} size={14} />
            </span>
            <strong>
              {activeCard.metric} · {activeCard.title}
            </strong>
            <span className="hud-gold-badge">{activeCard.boundary}</span>
          </div>
          <p className="hud-body-copy">{activeCard.detail}</p>
        </div>
      </div>

      <div className="hud-interactive-zone">
        <span className="hud-deck-cue">
          {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
        </span>

        {/* 6 Production Stack Cards */}
        <div
          className="hud-grid-2"
          role="tablist"
          aria-label="Tech stack modules"
          onKeyDown={(e) =>
            handleTablistArrows(e, stackCardIds, activeCard.id, stackPrefix, selectStackCard)
          }
        >
          {stack.cards.map((card) => {
            const isSelected = card.id === activeCard.id;
            return (
              <button
                key={card.id}
                id={`${stackPrefix}-${card.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={stackPanelId}
                tabIndex={isSelected ? 0 : -1}
                className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  selectStackCard(card.id);
                }}
              >
                <div className="hud-tile-top">
                  <span className="hud-icon-badge">
                    <SiteIcon name={card.icon} size={15} />
                  </span>
                  <span className="hud-chip-tag">{card.boundary}</span>
                </div>
                <strong className="hud-tile-title">{card.metric}</strong>
                <span className="hud-sub-meta">{card.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * 4. ABOUT STAGE HUD (01 User Journey | 02 Mission & Roadmap | 03 BM & Founder)
 * ========================================================================== */

type MissionInspectorChoice =
  | { readonly kind: 'loop'; readonly index: number }
  | { readonly kind: 'pillar'; readonly id: SiteMissionCommitment['id'] }
  | { readonly kind: 'milestone'; readonly id: SiteMilestone['id'] }
  | { readonly kind: 'exit'; readonly id: SiteLifecycleExit['id'] };

export interface AboutStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly betaMailto: string;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function AboutStageHud({
  copy,
  lang,
  betaMailto,
  interaction,
  onUpdateInteraction,
}: AboutStageHudProps) {
  const [journeyAutoPlay, setJourneyAutoPlay] = useState<boolean>(() => !prefersReducedMotion());
  const [missionOverride, setMissionOverride] = useState<{
    readonly loopIndex: number;
    readonly choice: MissionInspectorChoice;
  } | null>(null);
  const [founderSelectedKey, setFounderSelectedKey] = useState<string>(
    `bm:${copy.vision.revenuePillars[2].id}`
  );
  const uid = useId();
  const journeyIdxRef = useRef<number>(interaction.aboutJourneyIndex);

  useEffect(() => {
    journeyIdxRef.current = interaction.aboutJourneyIndex;
  }, [interaction.aboutJourneyIndex]);

  // Sync Journey 6-cut auto-play with orbiting 3D marble in aboutStage (stable interval via ref)
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

  const missionChoice: MissionInspectorChoice =
    missionOverride && missionOverride.loopIndex === interaction.aboutLoopIndex
      ? missionOverride.choice
      : { kind: 'loop', index: interaction.aboutLoopIndex };

  if (interaction.aboutSubtab === 'journey') {
    const journey = copy.journey;
    const activeIdx = Math.max(0, Math.min(journey.cuts.length - 1, interaction.aboutJourneyIndex));
    const activeCut = journey.cuts[activeIdx] ?? journey.cuts[0];
    const journeyPrefix = `${uid}-journey`;
    const journeyPanelId = `${uid}-journey-panel`;
    const journeyCutIds = journey.cuts.map((c) => c.id);

    const selectCut = (nextIdx: number) => {
      triggerHaptic('selection');
      setJourneyAutoPlay(false);
      onUpdateInteraction({ aboutJourneyIndex: nextIdx });
    };

    return (
      <div className="hud-stack">
        <div className="hud-display-zone">
          {/* Minimal 3D Clay Diorama Theater + Speech Bubble */}
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
                <span className="hud-gold-badge">CUT {activeCut.num}</span>
                <span className={`hud-status-pill is-${activeCut.status}`}>{activeCut.statusLabel}</span>
              </div>
            </div>

            <div className="hud-speech-bubble">
              <span className="hud-icon-badge">
                <SiteIcon name={activeCut.icon} size={13} />
              </span>
              <p>{activeCut.speechBubble}</p>
            </div>
          </div>

          {/* Active Cut API Chips + Full Detail Inspector */}
          <div
            id={journeyPanelId}
            className="hud-inspector hud-inspector--top"
            role="tabpanel"
            aria-labelledby={`${journeyPrefix}-${activeCut.id}`}
            aria-live="polite"
          >
            <div className="hud-inline-head">
              <span className="hud-icon-badge">
                <SiteIcon name={activeCut.icon} size={14} />
              </span>
              <strong>{activeCut.title}</strong>
            </div>
            <div className="hud-chip-wrap">
              {activeCut.apiChips.map((chip) => (
                <span key={chip} className="hud-chip-tag">
                  {chip}
                </span>
              ))}
            </div>
            <p className="hud-body-copy">{activeCut.detail}</p>
          </div>
        </div>

        <div className="hud-interactive-zone">
          <div className="hud-deck-head-row">
            <span className="hud-deck-cue">
              {lang === 'ko' ? '장면 선택 · 탭하여 상세 보기' : 'SELECT CUT · TAP TO INSPECT'}
            </span>

            <div className="hud-journey-controls">
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={journey.prevLabel}
                onClick={() => selectCut((activeIdx - 1 + journey.cuts.length) % journey.cuts.length)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={journey.nextCutLabel}
                onClick={() => selectCut((activeIdx + 1) % journey.cuts.length)}
              >
                <ChevronRight size={14} aria-hidden="true" />
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

          {/* 6 Clickable Cut Cards synced live to aboutStage marble */}
          <div
            className="hud-grid-2"
            role="tablist"
            aria-label={journey.badge}
            onKeyDown={(e) =>
              handleTablistArrows(e, journeyCutIds, activeCut.id, journeyPrefix, (id) => {
                const nextIdx = journey.cuts.findIndex((c) => c.id === id);
                if (nextIdx >= 0) {
                  setJourneyAutoPlay(false);
                  onUpdateInteraction({ aboutJourneyIndex: nextIdx });
                }
              })
            }
          >
            {journey.cuts.map((cut, idx) => {
              const isSelected = idx === activeIdx;
              return (
                <button
                  key={cut.id}
                  id={`${journeyPrefix}-${cut.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={journeyPanelId}
                  tabIndex={isSelected ? 0 : -1}
                  className={`hud-cut-pill ${isSelected ? 'is-active' : ''}`}
                  onClick={() => selectCut(idx)}
                >
                  <span className="hud-mono-num">{cut.num}</span>
                  <strong className="hud-cut-title">{cut.shortTitle}</strong>
                  <span className={`hud-status-pill is-${cut.status}`}>{cut.shortStatusLabel}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="hud-bridge-btn"
            onClick={() => {
              triggerHaptic('selection');
              onUpdateInteraction({ aboutSubtab: 'mission' });
            }}
          >
            <span>{journey.nextStepLabel}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (interaction.aboutSubtab === 'mission') {
    const mission = copy.mission;
    const vision = copy.vision;

    const inspector: {
      readonly icon: SiteIconKey;
      readonly badge: string;
      readonly title: string;
      readonly detail: string;
    } = (() => {
      if (missionChoice.kind === 'pillar') {
        const item =
          mission.commitments.find((c) => c.id === missionChoice.id) ?? mission.commitments[0];
        return { icon: item.icon, badge: item.tag, title: item.title, detail: item.detail };
      }
      if (missionChoice.kind === 'milestone') {
        const stage =
          vision.milestones.find((m) => m.id === missionChoice.id) ?? vision.milestones[0];
        return { icon: stage.icon, badge: stage.tag, title: stage.title, detail: stage.detail };
      }
      if (missionChoice.kind === 'exit') {
        const exit = mission.exits.find((e) => e.id === missionChoice.id) ?? mission.exits[0];
        return {
          icon: exit.icon,
          badge: exit.id === 'resale' ? '1-TAP' : 'GAP',
          title: exit.title,
          detail: exit.detail,
        };
      }
      const node = mission.loopNodes[missionChoice.index] ?? mission.loopNodes[0];
      return { icon: node.icon, badge: node.num, title: node.title, detail: node.detail };
    })();

    return (
      <div className="hud-stack">
        <div className="hud-display-zone">
          <div className="hud-mission-head">
            <span className="hud-eyebrow">{mission.eyebrow}</span>
            <h2 className="hud-mission-slogan">
              <span>{mission.headingLead}</span>
              <em>{mission.headingAccent}</em>
            </h2>
          </div>

          {/* Active Inspector Description */}
          <div className="hud-inspector hud-inspector--top" aria-live="polite">
            <div className="hud-inline-head">
              <span className="hud-icon-badge">
                <SiteIcon name={inspector.icon} size={14} />
              </span>
              <strong>{inspector.title}</strong>
              <span className="hud-gold-badge">{inspector.badge}</span>
            </div>
            <p className="hud-body-copy">{inspector.detail}</p>
          </div>
        </div>

        <div className="hud-interactive-zone">
          <span className="hud-deck-cue">
            {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
          </span>

          {/* 3 Value Pillars */}
          <div className="hud-pill-grid hud-pill-grid--3" role="group" aria-label={mission.badge}>
            {mission.commitments.map((item) => {
              const isSelected = missionChoice.kind === 'pillar' && missionChoice.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`hud-tile-btn hud-tile-btn--compact ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    const nextLoopIdx =
                      item.id === 'wear'
                        ? 2
                        : item.id === 'cpw'
                          ? 4
                          : interaction.aboutLoopIndex;
                    setMissionOverride({
                      loopIndex: nextLoopIdx,
                      choice: { kind: 'pillar', id: item.id },
                    });
                    if (item.id === 'wear' || item.id === 'cpw') {
                      onUpdateInteraction({ aboutLoopIndex: nextLoopIdx, aboutLoopPaused: true });
                    }
                  }}
                >
                  <div className="hud-tile-top">
                    <SiteIcon name={item.icon} size={14} className="hud-accent-icon" />
                    <span className="hud-mono-num">{item.num}</span>
                  </div>
                  <strong className="hud-tile-title">{item.title}</strong>
                </button>
              );
            })}
          </div>

          {/* 5-Node Interactive iNVTRY LOOP Selector + Pause Synced to 3D Ring */}
          <div className="hud-card">
            <div className="hud-control-row">
              <div className="hud-inline-head">
                <span className="hud-gold-badge">{mission.centerKicker}</span>
                <strong>{mission.centerTitle}</strong>
              </div>
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

            <div className="hud-loop-pills" role="group" aria-label={mission.centerTitle}>
              {mission.loopNodes.map((node, idx) => {
                const isSelected =
                  missionChoice.kind === 'loop' && interaction.aboutLoopIndex === idx;
                return (
                  <button
                    key={node.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-loop-pill ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setMissionOverride(null);
                      onUpdateInteraction({ aboutLoopIndex: idx, aboutLoopPaused: true });
                    }}
                  >
                    <span className="hud-mono-num">{node.num}</span>
                    <SiteIcon name={node.icon} size={13} />
                    <span>{node.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Dual Circular Exits */}
            <div className="hud-grid-2">
              {mission.exits.map((exit) => {
                const isSelected = missionChoice.kind === 'exit' && missionChoice.id === exit.id;
                return (
                  <button
                    key={exit.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-exit-btn ${exit.id === 'resale' ? 'is-featured' : ''} ${
                      isSelected ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setMissionOverride({
                        loopIndex: interaction.aboutLoopIndex,
                        choice: { kind: 'exit', id: exit.id },
                      });
                    }}
                  >
                    <SiteIcon name={exit.icon} size={14} className="hud-accent-icon" />
                    <div>
                      <strong>{exit.title}</strong>
                      <span className="hud-sub-meta">{exit.subtitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Roadmap Milestones (LIVE 01 / LIVE 02 / TO-DO) */}
          <div className="hud-subblock">
            <span className="hud-eyebrow">{vision.roadmapTitle}</span>
            <div className="hud-roadmap-list" role="group" aria-label={vision.roadmapTitle}>
              {vision.milestones.map((m) => {
                const isSelected = missionChoice.kind === 'milestone' && missionChoice.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-roadmap-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setMissionOverride({
                        loopIndex: interaction.aboutLoopIndex,
                        choice: { kind: 'milestone', id: m.id },
                      });
                    }}
                  >
                    <span className={`hud-status-pill ${m.status === 'done' ? 'is-live' : 'is-todo'}`}>
                      {m.phase}
                    </span>
                    <strong>{m.title}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="hud-bridge-btn"
            onClick={() => {
              triggerHaptic('selection');
              onUpdateInteraction({ aboutSubtab: 'founder' });
            }}
          >
            <span>{mission.nextLabel}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // About Subtab 3: 03 BM & Founder
  const vision = copy.vision;
  const activeFounderInfo = (() => {
    if (founderSelectedKey.startsWith('moat:')) {
      const id = founderSelectedKey.slice(5);
      const moat = vision.moats.find((m) => m.id === id) ?? vision.moats[0];
      return { icon: moat.icon, title: moat.title, badge: moat.tag, detail: moat.detail };
    }
    const id = founderSelectedKey.replace(/^bm:/, '');
    const bm = vision.revenuePillars.find((p) => p.id === id) ?? vision.revenuePillars[0];
    return { icon: bm.icon, title: bm.title, badge: bm.mechanism, detail: bm.detail };
  })();

  return (
    <div className="hud-stack">
      <div className="hud-display-zone">
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{vision.eyebrow}</span>
            <h2 className="hud-title">{vision.revenueTitle}</h2>
          </div>
        </div>

        {/* Active BM / Moat Description */}
        <div className="hud-inspector hud-inspector--top" aria-live="polite">
          <div className="hud-inline-head">
            <span className="hud-icon-badge">
              <SiteIcon name={activeFounderInfo.icon} size={14} />
            </span>
            <strong>{activeFounderInfo.title}</strong>
            <span className="hud-gold-badge">{activeFounderInfo.badge}</span>
          </div>
          <p className="hud-body-copy">{activeFounderInfo.detail}</p>
        </div>

        <blockquote className="hud-quote">{vision.quote}</blockquote>

        {/* Read-Only Founder Dossier Card */}
        <aside className="hud-founder-card" aria-label="Company and founder details">
          <div className="hud-founder-head">
            <div className="hud-founder-avatar" aria-hidden="true">
              RM
            </div>
            <div className="hud-founder-id">
              <h3>{SITE_META.founderName}</h3>
              <p>{vision.founderRole}</p>
              <a href={`mailto:${SITE_META.contactEmail}`} className="hud-founder-email">
                {SITE_META.contactEmail}
              </a>
            </div>
          </div>

          <dl className="hud-dossier-grid">
            <div>
              <dt>{vision.hqLabel}</dt>
              <dd>{vision.hqValue}</dd>
            </div>
            <div>
              <dt>{vision.domainLabel}</dt>
              <dd>
                <strong>{SITE_META.domain}</strong>
              </dd>
            </div>
            <div className="hud-dossier-full">
              <dt>{vision.stackSummaryLabel}</dt>
              <dd>{vision.stackSummaryValue}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="hud-interactive-zone">
        <span className="hud-deck-cue">
          {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
        </span>

        {/* 3-Pillar Circular Business Model Cards */}
        <div className="hud-pill-grid hud-pill-grid--3" role="group" aria-label={vision.revenueTitle}>
          {vision.revenuePillars.map((pillar) => {
            const key = `bm:${pillar.id}`;
            const isSelected = founderSelectedKey === key;
            return (
              <button
                key={pillar.id}
                type="button"
                aria-pressed={isSelected}
                className={`hud-tile-btn hud-tile-btn--compact ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setFounderSelectedKey(key);
                }}
              >
                <div className="hud-tile-top">
                  <SiteIcon name={pillar.icon} size={14} className="hud-accent-icon" />
                  <span className="hud-mono-num">{pillar.num}</span>
                </div>
                <strong className="hud-tile-title">{pillar.title}</strong>
              </button>
            );
          })}
        </div>

        {/* 4 Core Moat Cards */}
        <div className="hud-grid-2" role="group" aria-label={vision.moatsTitle}>
          {vision.moats.map((moat) => {
            const key = `moat:${moat.id}`;
            const isSelected = founderSelectedKey === key;
            return (
              <button
                key={moat.id}
                type="button"
                aria-pressed={isSelected}
                className={`hud-cut-pill ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setFounderSelectedKey(key);
                }}
              >
                <SiteIcon name={moat.icon} size={13} className="hud-accent-icon" />
                <strong className="hud-cut-title">{moat.title}</strong>
                <span className="hud-chip-tag">{moat.tag}</span>
              </button>
            );
          })}
        </div>

        <div className="hud-founder-actions">
          <a href={betaMailto} className="hud-founder-cta">
            <span>{vision.directCta}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>

          <button
            type="button"
            className="hud-auto-btn"
            onClick={() => {
              triggerHaptic('selection');
              onUpdateInteraction({ aboutSubtab: 'journey' });
            }}
          >
            <RotateCcw size={11} aria-hidden="true" />
            <span>{vision.backToMissionLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
