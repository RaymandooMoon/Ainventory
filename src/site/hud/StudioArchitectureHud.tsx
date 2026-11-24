import { useId, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { SiteIcon } from '../SiteIcon.tsx';
import {
  resolveAppPreviewSrc,
  STUDIO_GARMENT_ASSETS,
  type SiteBlueprintNode,
  type SiteCopy,
  type SiteLang,
  type SitePrivacyShield,
  type SiteTheme,
  type StudioPoseId,
  type WeatherMoodId,
} from '../siteContent.ts';
import { handleTablistArrows } from './tablistArrows.ts';

function normalizeDegrees(angleRad: number): number {
  const deg = Math.round(((angleRad * 180) / Math.PI) % 360);
  return deg < 0 ? deg + 360 : deg;
}

/* ==========================================================================
 * 1. STUDIO STAGE HUD (Live App | 3D Fitting | Care & CPW)
 * ========================================================================== */

export interface StudioStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function StudioStageHud({
  copy,
  lang,
  theme,
  interaction,
  onUpdateInteraction,
}: StudioStageHudProps) {
  const [atelierFeatId, setAtelierFeatId] = useState<string>(
    copy.capabilities.pillars.atelier.features[0].id
  );
  const [careFeatId, setCareFeatId] = useState<string>(
    copy.capabilities.pillars.intelligence.features[0].id
  );
  const uid = useId();

  if (interaction.studioSubtab === 'preview') {
    const activeScreen =
      copy.appPreview.screens.find((s) => s.id === interaction.studioPreviewScreen) ??
      copy.appPreview.screens[0];
    const resolvedSrc = resolveAppPreviewSrc(activeScreen.id, lang, theme);
    const modeLabel = `${lang === 'ko' ? '한국어' : 'English'} · ${
      theme === 'dark' ? (lang === 'ko' ? '다크' : 'Dark') : lang === 'ko' ? '라이트' : 'Light'
    }`;
    const previewPrefix = `${uid}-preview`;
    const previewPanelId = `${uid}-preview-panel`;
    const screenIds = copy.appPreview.screens.map((s) => s.id);

    return (
      <div className="hud-stack">
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{copy.appPreview.code}</span>
            <h2 className="hud-title">{copy.appPreview.title}</h2>
          </div>
          <span className="hud-chip-tag">{modeLabel}</span>
        </div>

        {/* Synced Smartphone Mockup + Screen Summary (ON TOP) */}
        <div
          id={previewPanelId}
          className="hud-preview-hero-row"
          role="tabpanel"
          aria-labelledby={`${previewPrefix}-${activeScreen.id}`}
          aria-live="polite"
        >
          <div className="hud-phone-frame" data-phone-theme={theme}>
            <div className="hud-phone-island" aria-hidden="true" />
            <img
              key={`${activeScreen.id}-${lang}-${theme}`}
              src={resolvedSrc}
              alt={`${activeScreen.imageAlt} (${modeLabel})`}
              width={500}
              height={1044}
              decoding="async"
              className="hud-phone-img"
            />
          </div>

          <div className="hud-preview-summary">
            <div className="hud-inline-head">
              <span className="hud-icon-badge">
                <SiteIcon name={activeScreen.icon} size={14} />
              </span>
              <strong>{activeScreen.title}</strong>
              <span className="hud-gold-badge">{activeScreen.metricTag}</span>
            </div>
            <p className="hud-body-copy">{activeScreen.caption}</p>

            {/* Full Zero-Loss Screen HUD Telemetry Metrics */}
            <div className="hud-metric-chips">
              {activeScreen.hudMetrics.map((metric) => (
                <div
                  key={`${activeScreen.id}-${metric.label}`}
                  className={`hud-metric-chip ${metric.emphasis ? 'is-emphasis' : ''}`}
                >
                  <span className="hud-metric-chip-label">{metric.label}</span>
                  <strong className="hud-metric-chip-val">{metric.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Screen Switcher Cue */}
        <span className="hud-deck-cue">
          {lang === 'ko' ? '화면 선택 · 탭하여 전환' : 'SELECT SCREEN · TAP TO SWITCH'}
        </span>

        {/* 4-Mode Screen Switcher Cards (BELOW) */}
        <div
          className="hud-pill-grid hud-pill-grid--4"
          role="tablist"
          aria-label={copy.appPreview.title}
          onKeyDown={(e) =>
            handleTablistArrows(e, screenIds, activeScreen.id, previewPrefix, (id) =>
              onUpdateInteraction({ studioPreviewScreen: id })
            )
          }
        >
          {copy.appPreview.screens.map((screen) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                id={`${previewPrefix}-${screen.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={previewPanelId}
                tabIndex={isSelected ? 0 : -1}
                className={`hud-mode-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateInteraction({ studioPreviewScreen: screen.id });
                }}
              >
                <SiteIcon name={screen.icon} size={15} />
                <span>{screen.tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (interaction.studioSubtab === 'atelier') {
    const pillar = copy.capabilities.pillars.atelier;
    const activeFeature = pillar.features.find((f) => f.id === atelierFeatId) ?? pillar.features[0];
    const poseInfo = copy.interactive.poseTelemetry[interaction.studioPose];
    const angleDeg = normalizeDegrees(interaction.studioAngleRad);
    const activeModelMode = interaction.studioModelMode ?? 'mannequin';

    const modelModes: readonly {
      readonly id: StageInteractionState['studioModelMode'];
      readonly label: string;
    }[] = [
      { id: 'mannequin', label: lang === 'ko' ? '런웨이 3D' : 'Runway 3D' },
      { id: 'dressform', label: lang === 'ko' ? '쿠튀르 코트' : 'Couture Coat' },
    ];

    const poses: readonly { readonly id: StudioPoseId; readonly label: string }[] = [
      { id: 'stand', label: copy.interactive.stanceIdle },
      { id: 'walk', label: copy.interactive.stanceWalk },
      { id: 'rain', label: copy.interactive.stanceRain },
    ];

    return (
      <div className="hud-stack">
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{pillar.eyebrow}</span>
            <h2 className="hud-title">{pillar.title}</h2>
          </div>
          <span className="hud-chip-tag">{copy.interactive.pccsNote}</span>
        </div>

        {/* Live 3D Pose, 360° Turntable & Dual-Mode Model Switcher synced directly to studioStage */}
        <div className="hud-card hud-control-deck">
          <div className="hud-control-zone">
            <div className="hud-model-mode-row">
              <span className="hud-eyebrow hud-model-mode-label">
                {lang === 'ko' ? '3D 모델' : '3D Model'}
              </span>
              <div
                className="hud-segmented hud-segmented--model"
                role="group"
                aria-label={lang === 'ko' ? '3D 모델 전환' : '3D model mode'}
              >
                {modelModes.map((mode) => {
                  const isSelected = activeModelMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={isSelected}
                      className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        onUpdateInteraction({ studioModelMode: mode.id });
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hud-control-row">
              <div className="hud-segmented" role="group" aria-label="3D pose posture">
                {poses.map((pose) => {
                  const isSelected = interaction.studioPose === pose.id;
                  return (
                    <button
                      key={pose.id}
                      type="button"
                      aria-pressed={isSelected}
                      className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        onUpdateInteraction({ studioPose: pose.id });
                      }}
                    >
                      {pose.label}
                    </button>
                  );
                })}
              </div>

              {/* Live 360° Turntable Angle Readout & Quick Step */}
              <div className="hud-angle-ctrl">
                <button
                  type="button"
                  className="hud-icon-step-btn"
                  aria-label="Rotate -45 degrees"
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({
                      studioAngleRad: interaction.studioAngleRad - Math.PI * 0.25,
                    });
                  }}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="hud-angle-readout"
                  title="Reset 0°"
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({ studioAngleRad: 0 });
                  }}
                >
                  {angleDeg}°
                </button>
                <button
                  type="button"
                  className="hud-icon-step-btn"
                  aria-label="Rotate +45 degrees"
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({
                      studioAngleRad: interaction.studioAngleRad + Math.PI * 0.25,
                    });
                  }}
                >
                  <RotateCw size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Recessed Read-Only Pose & Drape Telemetry Readout */}
          <div className="hud-telemetry-readout">
            <div className="hud-telemetry-bar">
              <strong className="hud-mono-val">{poseInfo.bone}</strong>
              <span className="hud-telemetry-sep" aria-hidden="true">·</span>
              <span className="hud-mono-accent">{poseInfo.drape}</span>
            </div>
            <p className="hud-body-copy">{poseInfo.summary}</p>
          </div>
        </div>

        {/* Active Sculptural 3D Feature Description (ON TOP) */}
        <div
          id={`${uid}-atelier-panel`}
          className="hud-inspector hud-inspector--top"
          role="tabpanel"
          aria-labelledby={`${uid}-atelier-${activeFeature.id}`}
          aria-live="polite"
        >
          <div className="hud-inline-head">
            <span className="hud-icon-badge">
              <SiteIcon name={activeFeature.icon} size={14} />
            </span>
            <strong>{activeFeature.label}</strong>
            <span className="hud-gold-badge">{activeFeature.tag}</span>
          </div>
          <p className="hud-body-copy">{activeFeature.detail}</p>
        </div>

        <span className="hud-deck-cue">
          {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
        </span>

        {/* 4 Sculptural 3D Engine Feature Cards (BELOW) */}
        <div
          className="hud-grid-2"
          role="tablist"
          aria-label={pillar.title}
          onKeyDown={(e) =>
            handleTablistArrows(
              e,
              pillar.features.map((f) => f.id),
              activeFeature.id,
              `${uid}-atelier`,
              setAtelierFeatId
            )
          }
        >
          {pillar.features.map((feat) => {
            const isSelected = feat.id === activeFeature.id;
            return (
              <button
                key={feat.id}
                id={`${uid}-atelier-${feat.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${uid}-atelier-panel`}
                tabIndex={isSelected ? 0 : -1}
                className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setAtelierFeatId(feat.id);
                }}
              >
                <div className="hud-tile-top">
                  <span className="hud-icon-badge">
                    <SiteIcon name={feat.icon} size={15} />
                  </span>
                  <span className="hud-gold-badge">{feat.tag}</span>
                </div>
                <strong className="hud-tile-title">{feat.label}</strong>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Studio Subtab 3: Care & CPW
  const carePillar = copy.capabilities.pillars.intelligence;
  const activeCareFeat =
    carePillar.features.find((f) => f.id === careFeatId) ?? carePillar.features[0];
  const carePrefix = `${uid}-care`;
  const carePanelId = `${uid}-care-panel`;
  const careFeatIds = carePillar.features.map((f) => f.id);

  return (
    <div className="hud-stack">
      <div className="hud-section-head">
        <div>
          <span className="hud-eyebrow">{carePillar.eyebrow}</span>
          <h2 className="hud-title">{carePillar.title}</h2>
        </div>
        <span className="hud-chip-tag">{carePillar.code}</span>
      </div>

      {/* Active Care & Asset OS Description (ON TOP) */}
      <div
        id={carePanelId}
        className="hud-inspector hud-inspector--top"
        role="tabpanel"
        aria-labelledby={`${carePrefix}-${activeCareFeat.id}`}
        aria-live="polite"
      >
        <div className="hud-inline-head">
          <span className="hud-icon-badge">
            <SiteIcon name={activeCareFeat.icon} size={14} />
          </span>
          <strong>{activeCareFeat.label}</strong>
          <span className="hud-gold-badge">{activeCareFeat.tag}</span>
        </div>
        <p className="hud-body-copy">{activeCareFeat.detail}</p>
      </div>

      <span className="hud-deck-cue">
        {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
      </span>

      {/* 4 Care & Asset OS Feature Cards */}
      <div
        className="hud-grid-2"
        role="tablist"
        aria-label={carePillar.title}
        onKeyDown={(e) =>
          handleTablistArrows(e, careFeatIds, activeCareFeat.id, carePrefix, setCareFeatId)
        }
      >
        {carePillar.features.map((feat) => {
          const isSelected = feat.id === activeCareFeat.id;
          return (
            <button
              key={feat.id}
              id={`${carePrefix}-${feat.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={carePanelId}
              tabIndex={isSelected ? 0 : -1}
              className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setCareFeatId(feat.id);
              }}
            >
              <div className="hud-tile-top">
                <span className="hud-icon-badge">
                  <SiteIcon name={feat.icon} size={15} />
                </span>
                <span className="hud-gold-badge">{feat.tag}</span>
              </div>
              <strong className="hud-tile-title">{feat.label}</strong>
            </button>
          );
        })}
      </div>

      {/* Wear Economics Read-Only Telemetry Displays (BELOW) */}
      <span className="hud-readout-cue">
        {lang === 'ko' ? '실시간 지표' : 'LIVE TELEMETRY'}
      </span>

      <div className="hud-grid-2">
        <div className="hud-card hud-kpi-card">
          <span className="hud-metric-chip-label">{copy.interactive.cpwLabel}</span>
          <div className="hud-kpi-val-row">
            <strong className="hud-kpi-big">{copy.interactive.cpwValue}</strong>
            <span className="hud-gold-badge">{copy.interactive.cpwDelta}</span>
          </div>
          <div className="hud-progress-track" aria-hidden="true">
            <span className="hud-progress-fill" style={{ width: '74%' }} />
          </div>
        </div>

        <div className="hud-card hud-kpi-card">
          <span className="hud-metric-chip-label">{copy.interactive.balanceLabel}</span>
          <div className="hud-ring-row">
            <svg width="38" height="38" viewBox="0 0 44 44" aria-hidden="true" className="site-ring-svg">
              <circle cx="22" cy="22" r="18" className="site-ring-track" />
              <circle
                cx="22"
                cy="22"
                r="18"
                className="site-ring-fill"
                strokeDasharray="113.1"
                strokeDashoffset="11.3"
              />
            </svg>
            <div>
              <strong className="hud-kpi-big">{copy.interactive.balanceValue}</strong>
              <span className="hud-sub-meta">{copy.interactive.balanceMeta}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hud-grid-2">
        <div className="hud-mini-card">
          <div className="hud-mini-head">
            <ShieldCheck size={14} aria-hidden="true" className="hud-accent-icon" />
            <strong className="hud-mini-title">{copy.interactive.dupTitle}</strong>
          </div>
          <span className="hud-chip-tag">{copy.interactive.dupStatus}</span>
        </div>
        <div className="hud-mini-card">
          <div className="hud-mini-head">
            <Calendar size={14} aria-hidden="true" className="hud-accent-icon" />
            <strong className="hud-mini-title">{copy.interactive.ootdTitle}</strong>
          </div>
          <span className="hud-chip-tag">{copy.interactive.ootdDate}</span>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * 2. ARCHITECTURE STAGE HUD (System Blueprint | Privacy & Security | Google API × 3D)
 * ========================================================================== */

export interface ArchitectureStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly interaction: StageInteractionState;
  readonly selectedPrivacyShield: SitePrivacyShield['id'];
  readonly onSelectPrivacyShield: (id: SitePrivacyShield['id']) => void;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function ArchitectureStageHud({
  copy,
  lang,
  interaction,
  selectedPrivacyShield,
  onSelectPrivacyShield,
  onUpdateInteraction,
}: ArchitectureStageHudProps) {
  const arch = copy.architecture;
  const [selectedNodeId, setSelectedNodeId] = useState<string>('core-vton');
  const [splitPct, setSplitPct] = useState<number>(52);
  const uid = useId();

  const allBlueprintNodes = useMemo<readonly SiteBlueprintNode[]>(
    () => [...arch.tiers.flatMap((tier) => tier.nodes), ...arch.governance],
    [arch.tiers, arch.governance]
  );

  // Keep inspector synchronized when user clicks a 3D glass tier directly in the left viewport
  const activeTier = arch.tiers[interaction.architectureTier] ?? arch.tiers[3];
  const isSelectedGov = arch.governance.some((g) => g.id === selectedNodeId);
  const isSelectedInActiveTier = activeTier.nodes.some((n) => n.id === selectedNodeId);
  const activeNode: SiteBlueprintNode =
    isSelectedGov || isSelectedInActiveTier
      ? (allBlueprintNodes.find((n) => n.id === selectedNodeId) ?? activeTier.nodes[0])
      : activeTier.nodes[0];

  if (interaction.architectureSubtab === 'blueprint') {
    const isMvp = interaction.architectureMode === 'mvp';
    const primarySpec = isMvp ? activeNode.devSpec : activeNode.prodSpec;
    const secondarySpec = isMvp ? activeNode.prodSpec : activeNode.devSpec;

    return (
      <div className="hud-stack">
        {/* Dev (MVP) vs Prod Scale + GPU Toggle */}
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{arch.badge}</span>
            <h2 className="hud-title">{arch.blueprintTitle}</h2>
          </div>
        </div>

        <div className="hud-segmented hud-segmented--full" role="group" aria-label="Deployment scale mode">
          <button
            type="button"
            aria-pressed={isMvp}
            className={`hud-seg-btn ${isMvp ? 'is-active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              onUpdateInteraction({ architectureMode: 'mvp' });
            }}
          >
            {arch.modeDevLabel}
          </button>
          <button
            type="button"
            aria-pressed={!isMvp}
            className={`hud-seg-btn ${!isMvp ? 'is-active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              onUpdateInteraction({ architectureMode: 'prod' });
            }}
          >
            {arch.modeProdLabel}
          </button>
        </div>

        {/* Active Node Dual Spec Inspector (ON TOP) */}
        <div className="hud-inspector hud-inspector--top" aria-live="polite">
          <div className="hud-inline-head">
            <span className="hud-icon-badge">
              <SiteIcon name={activeNode.icon} size={14} />
            </span>
            <strong>{activeNode.label}</strong>
            <span className="hud-gold-badge">{isMvp ? arch.devTag : arch.prodTag}</span>
          </div>
          <p className="hud-body-copy">{primarySpec}</p>
          <div className="hud-inspector-delta">
            <ArrowRight size={12} aria-hidden="true" className="hud-accent-icon" />
            <span className="hud-chip-tag">{isMvp ? arch.prodTag : arch.devTag}</span>
            <span>{secondarySpec}</span>
          </div>
        </div>

        {/* Privacy 4-Shield Quick Strip */}
        <div className="hud-privacy-strip">
          <span className="hud-strip-kicker">
            <ShieldCheck size={12} aria-hidden="true" />
            <span>{arch.privacyStripLabel}</span>
          </span>
          <div className="hud-chip-wrap">
            {arch.privacyShields.map((shield) => (
              <button
                key={shield.id}
                type="button"
                className="hud-quick-chip"
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectPrivacyShield(shield.id);
                  onUpdateInteraction({ architectureSubtab: 'privacy' });
                }}
              >
                <span className="hud-mono-num">{shield.code}</span>
                <span>{shield.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="hud-deck-cue">
          {lang === 'ko' ? '노드 선택 · 탭하여 상세 보기' : 'SELECT NODE · TAP TO INSPECT'}
        </span>

        {/* Clickable 6-Tier System & Hardware Blueprint (Synced with 3D Marble Core) */}
        <div className="hud-tier-list" role="group" aria-label={arch.blueprintTitle}>
          {arch.tiers.map((tier, tierIdx) => {
            const isTierActive = interaction.architectureTier === tierIdx;
            return (
              <div
                key={tier.id}
                className={`hud-tier-row ${tier.highlight ? 'is-core-tier' : ''} ${
                  isTierActive ? 'is-active' : ''
                }`}
              >
                <button
                  type="button"
                  className="hud-tier-head-btn"
                  aria-pressed={isTierActive}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({ architectureTier: tierIdx });
                    if (tier.nodes[0]) setSelectedNodeId(tier.nodes[0].id);
                  }}
                >
                  <span className="hud-mono-num">{tier.num}</span>
                  <strong>{tier.label}</strong>
                </button>
                <div className="hud-tier-nodes">
                  {tier.nodes.map((node) => {
                    const isNodeSelected = activeNode.id === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        aria-pressed={isNodeSelected}
                        className={`hud-node-pill ${node.highlight ? 'is-core-node' : ''} ${
                          isNodeSelected ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          triggerHaptic('selection');
                          onUpdateInteraction({ architectureTier: tierIdx });
                          setSelectedNodeId(node.id);
                        }}
                      >
                        <SiteIcon name={node.icon} size={13} />
                        <span>{node.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3 Governance Nodes */}
        <div className="hud-gov-strip">
          <span className="hud-eyebrow">{arch.govLabel}</span>
          <div className="hud-pill-grid hud-pill-grid--3">
            {arch.governance.map((gov) => {
              const isSelected = activeNode.id === gov.id;
              return (
                <button
                  key={gov.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`hud-node-pill ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedNodeId(gov.id);
                  }}
                >
                  <SiteIcon name={gov.icon} size={13} />
                  <span>{gov.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (interaction.architectureSubtab === 'privacy') {
    const activeShield =
      arch.privacyShields.find((s) => s.id === selectedPrivacyShield) ?? arch.privacyShields[0];

    return (
      <div className="hud-stack">
        <div className="hud-section-head">
          <div>
            <span className="hud-eyebrow">{arch.privacyEyebrow}</span>
            <h2 className="hud-title">{arch.privacyHeading}</h2>
          </div>
        </div>

        {/* Active 3-Row Privacy Spec Sheet (ON TOP) */}
        <div
          id={`${uid}-privacy-panel`}
          className="hud-inspector hud-inspector--top hud-privacy-spec"
          role="tabpanel"
          aria-labelledby={`${uid}-privacy-${activeShield.id}`}
          aria-live="polite"
        >
          <div className="hud-inline-head">
            <span className="hud-icon-badge">
              <SiteIcon name={activeShield.icon} size={14} />
            </span>
            <strong>{activeShield.title}</strong>
            <span className="hud-gold-badge">{activeShield.statusTag}</span>
          </div>

          <div className="hud-spec-rows">
            <div className="hud-spec-row">
              <span className="hud-eyebrow">{arch.privacyCurrentLabel}</span>
              <p className="hud-body-copy">{activeShield.devStatus}</p>
            </div>
            <div className="hud-spec-row">
              <span className="hud-eyebrow">{arch.privacyProdLabel}</span>
              <p className="hud-body-copy">{activeShield.prodTarget}</p>
            </div>
            <div className="hud-spec-row is-retention">
              <span className="hud-eyebrow">{arch.privacyRetentionLabel}</span>
              <p className="hud-body-copy">{activeShield.retention}</p>
            </div>
          </div>
        </div>

        <span className="hud-deck-cue">
          {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
        </span>

        {/* 4 Privacy Shield Cards */}
        <div
          className="hud-grid-2"
          role="tablist"
          aria-label={arch.privacyHeading}
          onKeyDown={(e) =>
            handleTablistArrows(
              e,
              arch.privacyShields.map((s) => s.id),
              activeShield.id,
              `${uid}-privacy`,
              onSelectPrivacyShield
            )
          }
        >
          {arch.privacyShields.map((shield) => {
            const isSelected = shield.id === activeShield.id;
            return (
              <button
                key={shield.id}
                id={`${uid}-privacy-${shield.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${uid}-privacy-panel`}
                tabIndex={isSelected ? 0 : -1}
                className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectPrivacyShield(shield.id);
                }}
              >
                <div className="hud-tile-top">
                  <span className="hud-icon-badge">
                    <SiteIcon name={shield.icon} size={15} />
                  </span>
                  <span className="hud-mono-num">{shield.code}</span>
                </div>
                <strong className="hud-tile-title">{shield.shortLabel}</strong>
              </button>
            );
          })}
        </div>

        {/* Interactive Original vs Separated WebP Drag Slider (BELOW) */}
        <div className="hud-card hud-compare-card">
          <div className="site-compare-viewport hud-compare-viewport" data-no-marble="true">
            <div className="site-compare-layer site-compare-after">
              <img
                src={STUDIO_GARMENT_ASSETS.trenchWebp}
                alt="Alpha-matted WebP garment cutout"
                width={480}
                height={640}
                decoding="async"
              />
              <span className="site-compare-chip site-compare-chip--right">
                {copy.interactive.afterLabel}
              </span>
            </div>

            <div
              className="site-compare-layer site-compare-before"
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
            >
              <img
                src={STUDIO_GARMENT_ASSETS.trenchOriginalJpg}
                alt="Original garment photograph before background removal"
                width={480}
                height={640}
                decoding="async"
              />
              <span className="site-compare-chip site-compare-chip--left">
                {copy.interactive.beforeLabel}
              </span>
            </div>

            <div className="site-compare-divider" style={{ left: `${splitPct}%` }} aria-hidden="true">
              <span className="site-compare-knob">
                <SlidersHorizontal size={13} />
              </span>
            </div>

            <input
              type="range"
              min={12}
              max={88}
              value={splitPct}
              onChange={(e) => setSplitPct(Number(e.target.value))}
              aria-label={copy.interactive.sliderHint}
              className="site-compare-range"
            />
          </div>
          <div className="hud-compare-meta">
            <span className="hud-gold-badge">{copy.interactive.ingestionBadge}</span>
            <span className="hud-mono-val">{copy.interactive.ingestionMeta}</span>
          </div>
        </div>
      </div>
    );
  }

  // Architecture Subtab 3: Google API × 3D
  const activeApi = arch.mapsNodes[interaction.googleApiIndex] ?? arch.mapsNodes[0];
  const mapsPrefix = `${uid}-gapi`;
  const mapsPanelId = `${uid}-gapi-panel`;
  const mapsNodeIds = arch.mapsNodes.map((n) => n.id);
  const weatherOptions: readonly { readonly id: WeatherMoodId; readonly label: string }[] = [
    { id: 'sunny', label: arch.weatherMoods.sunny },
    { id: 'rain', label: arch.weatherMoods.rain },
    { id: 'wind', label: arch.weatherMoods.wind },
  ];

  return (
    <div className="hud-stack">
      <div className="hud-section-head">
        <div>
          <span className="hud-eyebrow">{arch.mapsEyebrow}</span>
          <h2 className="hud-title">{arch.mapsHeading}</h2>
        </div>
        <span className="hud-gold-badge">{arch.mapsBadge}</span>
      </div>

      {/* Active Google API Live Telemetry & Interactive Controls (ON TOP) */}
      <div
        id={mapsPanelId}
        className="hud-inspector hud-inspector--top hud-api-panel"
        role="tabpanel"
        aria-labelledby={`${mapsPrefix}-${activeApi.id}`}
        aria-live="polite"
      >
        <div className="hud-inline-head">
          <span className="hud-mono-num">{activeApi.code}</span>
          <strong>{activeApi.theaterHeadline}</strong>
          <span className={`hud-status-pill is-${activeApi.status}`}>{activeApi.statusLabel}</span>
        </div>

        <p className="hud-mono-sub">{activeApi.theaterTelemetry}</p>

        {activeApi.id === 'weather' && (
          <div className="hud-segmented hud-segmented--full" role="group" aria-label="3D weather mode">
            {weatherOptions.map((item) => {
              const isSelected = interaction.weatherMood === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({ weatherMood: item.id });
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        {activeApi.id === 'streetview' && activeApi.coordinates && (
          <div className="hud-media-banner">
            <img
              src="/assets/journey/clay-cut-03-v1.webp"
              alt={activeApi.theaterHeadline}
              width={960}
              height={720}
              decoding="async"
              className="hud-banner-img"
            />
            <span className="hud-banner-chip">{activeApi.coordinates}</span>
          </div>
        )}

        {activeApi.id === 'places' && activeApi.nearbyCareSpots && (
          <div className="hud-pill-grid hud-pill-grid--3">
            {activeApi.nearbyCareSpots.map((spot) => (
              <div key={spot.label} className="hud-metric-chip is-emphasis">
                <span className="hud-metric-chip-label">{spot.label}</span>
                <strong className="hud-metric-chip-val">{spot.distance}</strong>
              </div>
            ))}
          </div>
        )}

        {activeApi.id === 'calendar' && (
          <div className="hud-media-banner">
            <img
              src="/assets/journey/clay-cut-04-v1.webp"
              alt={activeApi.theaterHeadline}
              width={960}
              height={720}
              decoding="async"
              className="hud-banner-img"
            />
            <span className="hud-banner-chip">{activeApi.sceneChips[0]}</span>
          </div>
        )}

        <div className="hud-chip-wrap">
          {activeApi.sceneChips.map((chip) => (
            <span key={chip} className="hud-chip-tag">
              {chip}
            </span>
          ))}
          <span className="hud-gold-badge">{activeApi.compliance}</span>
        </div>

        <p className="hud-body-copy">{activeApi.detail}</p>
      </div>

      <span className="hud-deck-cue">
        {lang === 'ko' ? '항목 선택 · 탭하여 상세 보기' : 'SELECT ITEM · TAP TO INSPECT'}
      </span>

      {/* 6 Interactive Google API Cards (Synced with 3D Tower & Weather, BELOW) */}
      <div
        className="hud-grid-2"
        role="tablist"
        aria-label={arch.mapsHeading}
        onKeyDown={(e) =>
          handleTablistArrows(e, mapsNodeIds, activeApi.id, mapsPrefix, (id) => {
            const nextIdx = arch.mapsNodes.findIndex((n) => n.id === id);
            if (nextIdx >= 0) {
              onUpdateInteraction({ googleApiIndex: nextIdx });
            }
          })
        }
      >
        {arch.mapsNodes.map((node, idx) => {
          const isSelected = idx === interaction.googleApiIndex;
          return (
            <button
              key={node.id}
              id={`${mapsPrefix}-${node.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={mapsPanelId}
              tabIndex={isSelected ? 0 : -1}
              className={`hud-tile-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onUpdateInteraction({ googleApiIndex: idx });
              }}
            >
              <div className="hud-tile-top">
                <span className="hud-icon-badge">
                  <SiteIcon name={node.icon} size={15} />
                </span>
                <span className={`hud-status-pill is-${node.status}`}>{node.statusLabel}</span>
              </div>
              <strong className="hud-tile-title">{node.apiName}</strong>
              <span className="hud-sub-meta">{node.role}</span>
            </button>
          );
        })}
      </div>

      <p className="hud-compliance-note">{arch.mapsComplianceFooter}</p>
    </div>
  );
}
