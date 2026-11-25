import { useMemo, useState } from 'react';
import { CloudSun, SlidersHorizontal } from 'lucide-react';
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
} from '../siteContent.ts';
import { useLiveLocalContext } from '../useLiveLocalContext.ts';
import { HudSpotlightDeck, type HudSpotlightItem } from './HudSpotlightDeck.tsx';

/* ==========================================================================
 * 1. STUDIO STAGE HUD (Fitting | App | Care)
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
    const resolvedSrc = resolveAppPreviewSrc(activeScreen.id, lang, theme);

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
      <div className="hud-stack hud-app-preview-layout">
        <div className="hud-phone-stage">
          <div className="hud-phone-frame" data-phone-theme={theme}>
            <div className="hud-phone-island" aria-hidden="true" />
            <img
              key={`${activeScreen.id}-${lang}-${theme}`}
              src={resolvedSrc}
              alt={activeScreen.imageAlt}
              width={500}
              height={1044}
              decoding="async"
              className="hud-phone-img"
            />
          </div>
        </div>

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
  interaction,
  selectedPrivacyShield,
  onSelectPrivacyShield,
  onUpdateInteraction,
}: ArchitectureStageHudProps) {
  const arch = copy.architecture;
  const [selectedNodeId, setSelectedNodeId] = useState<string>('core-vton');
  const [govSelected, setGovSelected] = useState<boolean>(false);
  const [splitPct, setSplitPct] = useState<number>(52);

  const allBlueprintNodes = useMemo<readonly SiteBlueprintNode[]>(
    () => [...arch.tiers.flatMap((tier) => tier.nodes), ...arch.governance],
    [arch.tiers, arch.governance]
  );

  const activeTier = arch.tiers[interaction.architectureTier] ?? arch.tiers[3];

  if (interaction.architectureSubtab === 'blueprint') {
    const isMvp = interaction.architectureMode === 'mvp';
    const activeCardId = govSelected ? 'governance' : activeTier.id;

    const resolveNodeForList = (nodes: readonly SiteBlueprintNode[]): SiteBlueprintNode => {
      const hit = nodes.find((n) => n.id === selectedNodeId);
      return hit ?? nodes[0] ?? allBlueprintNodes[0];
    };

    const tierItems: HudSpotlightItem[] = [
      ...arch.tiers.map((tier, tierIdx): HudSpotlightItem => {
        const currentNode = resolveNodeForList(tier.nodes);
        const specText = isMvp ? currentNode.devSpec : currentNode.prodSpec;
        return {
          id: tier.id,
          prefix: tier.num,
          prefixTone: 'mono',
          title: tier.label,
          body: (
            <div className="hud-spot-stack">
              <div className="hud-tier-nodes">
                {tier.nodes.map((node) => {
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
                        setGovSelected(false);
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
              <p className="hud-body-copy">{specText}</p>
            </div>
          ),
        };
      }),
      {
        id: 'governance',
        prefix: '07',
        prefixTone: 'mono',
        title: arch.govLabel,
        body: (() => {
          const currentGov = resolveNodeForList(arch.governance);
          return (
            <div className="hud-spot-stack">
              <div className="hud-tier-nodes">
                {arch.governance.map((gov) => {
                  const isSelected = currentGov.id === gov.id;
                  return (
                    <button
                      key={gov.id}
                      type="button"
                      aria-pressed={isSelected}
                      className={`hud-node-pill ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setGovSelected(true);
                        setSelectedNodeId(gov.id);
                      }}
                    >
                      <SiteIcon name={gov.icon} size={13} />
                      <span>{gov.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hud-body-copy">{isMvp ? currentGov.devSpec : currentGov.prodSpec}</p>
            </div>
          );
        })(),
      },
    ];

    return (
      <div className="hud-stack">
        <HudSpotlightDeck
          items={tierItems}
          activeId={activeCardId}
          onSelect={(id) => {
            if (id === 'governance') {
              setGovSelected(true);
              if (arch.governance[0]) setSelectedNodeId(arch.governance[0].id);
              return;
            }
            const idx = arch.tiers.findIndex((t) => t.id === id);
            if (idx >= 0) {
              setGovSelected(false);
              onUpdateInteraction({ architectureTier: idx });
              const firstNode = arch.tiers[idx]?.nodes[0];
              if (firstNode) setSelectedNodeId(firstNode.id);
            }
          }}
          ariaLabel={arch.blueprintTitle}
        />
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
