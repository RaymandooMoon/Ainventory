import { useMemo, useState, type CSSProperties } from 'react';
import { CloudSun, SlidersHorizontal } from 'lucide-react';
import type { StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { SiteIcon } from '../SiteIcon.tsx';
import {
  STUDIO_GARMENT_ASSETS,
  type SiteBlueprintNode,
  type SiteCopy,
  type SiteLang,
  type SitePrivacyShield,
} from '../siteContent.ts';
import { useLiveLocalContext } from '../useLiveLocalContext.ts';
import {
  getTechItemDescription,
  getTechItemsForBlueprintNode,
} from './architectureTechCatalog.ts';
import { HudSpotlightDeck, type HudSpotlightItem } from './HudSpotlightDeck.tsx';

/* ==========================================================================
 * 1. STUDIO STAGE HUD (Fitting | App | Care)
 * ========================================================================== */

export interface StudioStageHudProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

export function StudioStageHud({
  copy,
  lang,
  interaction,
  onUpdateInteraction,
}: StudioStageHudProps) {
  const [atelierFeatId, setAtelierFeatId] = useState<string>(
    copy.capabilities.pillars.atelier.features[0].id
  );
  const [careFeatId, setCareFeatId] = useState<string>(
    copy.capabilities.pillars.intelligence.features[0].id
  );
  const localContext = useLiveLocalContext(lang);

  if (interaction.studioSubtab === 'atelier') {
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
          activeId={atelierFeatId}
          onSelect={setAtelierFeatId}
          ariaLabel={pillar.title}
        />
      </div>
    );
  }

  if (interaction.studioSubtab === 'preview') {
    const activeScreen =
      copy.appPreview.screens.find((s) => s.id === interaction.studioPreviewScreen) ??
      copy.appPreview.screens[0];

    const screenItems: HudSpotlightItem[] = copy.appPreview.screens.map((screen) => {
      const compactMetrics =
        screen.id === 'outfits' ? screen.hudMetrics.slice(0, 1) : screen.hudMetrics.slice(0, 2);

      return {
        id: screen.id,
        icon: screen.icon,
        title: screen.title,
        body: (
          <div className="hud-spot-stack">
            <p className="hud-body-copy">{screen.caption}</p>
            <div className="hud-metric-chips">
              {screen.id === 'outfits' && (
                <>
                  <div className="hud-metric-chip is-emphasis">
                    <span className="hud-metric-chip-label">
                      {lang === 'ko' ? '현재 도시' : 'City'}
                    </span>
                    <strong className="hud-metric-chip-val">{localContext.placeLabel}</strong>
                  </div>
                  <div className="hud-metric-chip is-emphasis">
                    <span className="hud-metric-chip-label">
                      {lang === 'ko' ? '실시간 날씨' : 'Weather'}
                    </span>
                    <strong className="hud-metric-chip-val">{localContext.weatherLabel}</strong>
                  </div>
                </>
              )}
              {compactMetrics.map((metric) => (
                <div
                  key={`${screen.id}-${metric.label}`}
                  className={`hud-metric-chip ${metric.emphasis ? 'is-emphasis' : ''}`}
                >
                  <span className="hud-metric-chip-label">{metric.label}</span>
                  <strong className="hud-metric-chip-val">{metric.value}</strong>
                </div>
              ))}
            </div>

            {screen.id === 'outfits' && (
              <div className="hud-local-sync-row">
                <button
                  type="button"
                  className="hud-local-sync-btn"
                  disabled={localContext.isLoading}
                  onClick={() => {
                    triggerHaptic('selection');
                    localContext.requestCityWeather();
                  }}
                >
                  <CloudSun size={14} aria-hidden="true" />
                  <span>
                    {localContext.isLoading
                      ? lang === 'ko'
                        ? '도시 날씨 조회 중…'
                        : 'Checking weather…'
                      : localContext.status === 'city'
                        ? lang === 'ko'
                          ? '도시 날씨 새로고침'
                          : 'Refresh City Weather'
                        : lang === 'ko'
                          ? '현재 도시 날씨 조회'
                          : 'Check City Weather'}
                  </span>
                </button>
                {localContext.errorHint && (
                  <span className="hud-local-sync-hint" role="status">
                    {localContext.errorHint}
                  </span>
                )}
              </div>
            )}
          </div>
        ),
      };
    });

    return (
      <div className="hud-stack">
        <HudSpotlightDeck
          items={screenItems}
          activeId={activeScreen.id}
          onSelect={(id) => {
            const match = copy.appPreview.screens.find((s) => s.id === id);
            if (match) onUpdateInteraction({ studioPreviewScreen: match.id });
          }}
          ariaLabel={copy.appPreview.title}
        />
      </div>
    );
  }

  // Studio Subtab 3: Care
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

/* ==========================================================================
 * 2. ARCHITECTURE STAGE HUD (Blueprint | Privacy | Maps)
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

  const allBlueprintNodes = useMemo<readonly SiteBlueprintNode[]>(
    () => [...arch.tiers.flatMap((tier) => tier.nodes), ...arch.governance],
    [arch.tiers, arch.governance]
  );

  const govTierIndex = arch.tiers.length; // 6 -> 07 Governance
  const isGovActive = interaction.architectureTier === govTierIndex;
  const activeTier = arch.tiers[interaction.architectureTier] ?? arch.tiers[3];

  if (interaction.architectureSubtab === 'blueprint') {
    const isMvp = interaction.architectureMode === 'mvp';
    const modeKey = isMvp ? 'mvp' : 'prod';

    const resolveNodeForList = (nodes: readonly SiteBlueprintNode[]): SiteBlueprintNode => {
      const hit = nodes.find((n) => n.id === selectedNodeId);
      return hit ?? nodes[0] ?? allBlueprintNodes[0];
    };

    const renderTechExpansion = (currentNode: SiteBlueprintNode) => {
      const techItems = getTechItemsForBlueprintNode(currentNode.id, modeKey);
      if (techItems.length === 0) return null;
      const focusedIdx = interaction.architectureTechIndex;
      const activeTech =
        focusedIdx !== null && focusedIdx >= 0
          ? techItems[Math.min(focusedIdx, techItems.length - 1)]
          : null;

      return (
        <div
          key={`${currentNode.id}-${modeKey}`}
          className="hud-tech-expand-wrap"
          data-arch-tech-expand="true"
        >
          <div className="hud-tech-expand-head">
            <span className="hud-tech-expand-label">
              {lang === 'ko' ? '적용 기술 스택' : 'Technology Stack'}
            </span>
            <span className="hud-tech-expand-count">
              {activeTech
                ? activeTech.badge
                : lang === 'ko'
                  ? '아이콘 선택'
                  : 'Tap icon'}
            </span>
          </div>

          <div className="hud-tech-icon-strip hud-tech-icon-strip--icons-only" role="list">
            {techItems.map((tech, idx) => {
              const isFocused = activeTech?.id === tech.id;
              return (
                <button
                  key={tech.id}
                  type="button"
                  role="listitem"
                  aria-pressed={isFocused}
                  aria-expanded={isFocused}
                  aria-label={`${tech.name} (${tech.badge})`}
                  title={`${tech.name} · ${tech.badge}`}
                  style={{ '--tech-delay': `${idx * 48}ms` } as CSSProperties}
                  className={`hud-tech-icon-btn ${isFocused ? 'is-focused' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateInteraction({
                      architectureTechIndex: isFocused ? null : idx,
                    });
                  }}
                >
                  <SiteIcon name={tech.icon} size={18} />
                </button>
              );
            })}
          </div>

          <div className={`hud-tech-detail-collapse ${activeTech ? 'is-open' : ''}`}>
            <div className="hud-tech-detail-collapse-inner">
              {activeTech && (
                <div className="hud-tech-detail-card">
                  <div className="hud-tech-detail-title">
                    <SiteIcon name={activeTech.icon} size={14} />
                    <strong>{activeTech.name}</strong>
                    <span className="hud-tech-detail-tag">{activeTech.badge}</span>
                  </div>
                  <p className="hud-tech-detail-copy">{getTechItemDescription(activeTech, lang)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    const activeNodes = isGovActive ? arch.governance : activeTier.nodes;
    const currentNode = resolveNodeForList(activeNodes);
    const activeNum = isGovActive ? '07' : activeTier.num;
    const activeTitle = isGovActive ? arch.govLabel : activeTier.label;
    const specText = isMvp ? currentNode.devSpec : currentNode.prodSpec;

    const handlePickTier = (tierIdx: number) => {
      triggerHaptic('selection');
      onUpdateInteraction({ architectureTier: tierIdx, architectureTechIndex: null });
      const firstNode =
        tierIdx === govTierIndex ? arch.governance[0] : arch.tiers[tierIdx]?.nodes[0];
      if (firstNode) setSelectedNodeId(firstNode.id);
    };

    const tierIndexEntries = [
      ...arch.tiers.map((tier, idx) => ({
        idx,
        num: tier.num,
        label: tier.label,
      })),
      {
        idx: govTierIndex,
        num: '07',
        label: arch.govLabel,
      },
    ];

    return (
      <div className="hud-stack">
        <div
          className="hud-tier-index-rail"
          role="tablist"
          aria-label={arch.blueprintTitle}
        >
          {tierIndexEntries.map((entry) => {
            const isSelected = interaction.architectureTier === entry.idx;
            return (
              <button
                key={entry.num}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`${entry.num} ${entry.label}`}
                title={`${entry.num} ${entry.label}`}
                className={`hud-tier-index-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => handlePickTier(entry.idx)}
              >
                {entry.num}
              </button>
            );
          })}
        </div>

        <section
          className="hud-spot-card is-active hud-focused-tier-card"
          aria-label={`${activeNum} ${activeTitle}`}
        >
          <div className="hud-focused-tier-head">
            <span className="hud-mono-num">{activeNum}</span>
            <h3 className="hud-spot-title">{activeTitle}</h3>
          </div>

          <div className="hud-spot-body">
            <div className="hud-spot-stack">
              <div className="hud-tier-nodes">
                {activeNodes.map((node) => {
                  const isNodeSelected = currentNode.id === node.id;
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
                        onUpdateInteraction({
                          architectureTier: isGovActive ? govTierIndex : interaction.architectureTier,
                          architectureTechIndex: null,
                        });
                        setSelectedNodeId(node.id);
                      }}
                    >
                      <SiteIcon name={node.icon} size={13} />
                      <span>{node.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hud-body-copy">{specText}</p>
              {renderTechExpansion(currentNode)}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (interaction.architectureSubtab === 'privacy') {
    const shieldItems: HudSpotlightItem[] = arch.privacyShields.map((shield) => ({
      id: shield.id,
      icon: shield.icon,
      title: shield.shortLabel,
      body: (
        <div className="hud-spot-stack">
          <p className="hud-body-copy">{shield.devStatus}</p>
          <p className="hud-sub-meta">{shield.retention}</p>
        </div>
      ),
    }));

    return (
      <div className="hud-stack">
        <HudSpotlightDeck
          items={shieldItems}
          activeId={selectedPrivacyShield}
          onSelect={(id) => {
            const match = arch.privacyShields.find((s) => s.id === id);
            if (match) onSelectPrivacyShield(match.id);
          }}
          ariaLabel={arch.privacyHeading}
        />

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
            <span className="hud-mono-val">{copy.interactive.ingestionMeta}</span>
          </div>
        </div>
      </div>
    );
  }

  // Architecture Subtab 3: Maps / API
  const activeApi = arch.mapsNodes[interaction.googleApiIndex] ?? arch.mapsNodes[0];
  const apiItems: HudSpotlightItem[] = arch.mapsNodes.map((node) => ({
    id: node.id,
    icon: node.icon,
    title: node.apiName,
    badge: node.statusLabel,
    badgeTone: node.status === 'live' ? 'live' : 'todo',
    body: (
      <div className="hud-spot-stack">
        <p className="hud-body-copy">{node.detail}</p>

        {node.id === 'streetview' && node.coordinates && (
          <div className="hud-media-banner">
            <img
              src="/assets/journey/clay-cut-03-v1.webp"
              alt={node.theaterHeadline}
              width={960}
              height={720}
              decoding="async"
              className="hud-banner-img"
            />
            <span className="hud-banner-chip">{node.coordinates}</span>
          </div>
        )}

        {node.id === 'places' && node.nearbyCareSpots && (
          <div className="hud-pill-grid hud-pill-grid--3">
            {node.nearbyCareSpots.map((spot) => (
              <div key={spot.label} className="hud-metric-chip is-emphasis">
                <span className="hud-metric-chip-label">{spot.label}</span>
                <strong className="hud-metric-chip-val">{spot.distance}</strong>
              </div>
            ))}
          </div>
        )}

        {node.id === 'calendar' && (
          <div className="hud-media-banner">
            <img
              src="/assets/journey/clay-cut-04-v1.webp"
              alt={node.theaterHeadline}
              width={960}
              height={720}
              decoding="async"
              className="hud-banner-img"
            />
          </div>
        )}
      </div>
    ),
  }));

  return (
    <div className="hud-stack">
      <HudSpotlightDeck
        items={apiItems}
        activeId={activeApi.id}
        onSelect={(id) => {
          const nextIdx = arch.mapsNodes.findIndex((n) => n.id === id);
          if (nextIdx >= 0) onUpdateInteraction({ googleApiIndex: nextIdx });
        }}
        ariaLabel={arch.mapsHeading}
      />
    </div>
  );
}
