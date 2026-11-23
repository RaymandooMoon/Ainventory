import { useEffect, useRef } from 'react';
import type { ActiveStageId, StageInteractionState } from '../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SpecsStageHud, AboutStageHud } from './hud/SpecsAboutHud.tsx';
import { ArchitectureStageHud, StudioStageHud } from './hud/StudioArchitectureHud.tsx';
import type { SiteCopy, SiteLang, SitePrivacyShield, SiteTheme } from './siteContent.ts';

export interface SiteStageHudProps {
  readonly activeStage: ActiveStageId;
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
  readonly betaMailto: string;
  readonly interaction: StageInteractionState;
  readonly selectedPrivacyShield: SitePrivacyShield['id'];
  readonly onSelectPrivacyShield: (id: SitePrivacyShield['id']) => void;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

interface SubtabOption<T extends string> {
  readonly id: T;
  readonly label: string;
}

function handleSubtabKeys<T extends string>(
  e: React.KeyboardEvent<HTMLDivElement>,
  options: readonly SubtabOption<T>[],
  currentId: T,
  idPrefix: string,
  onSelect: (next: T) => void
) {
  const idx = options.findIndex((o) => o.id === currentId);
  if (idx < 0) return;
  let nextIdx = -1;
  if (e.key === 'ArrowRight') nextIdx = (idx + 1) % options.length;
  else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + options.length) % options.length;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = options.length - 1;
  if (nextIdx >= 0) {
    e.preventDefault();
    const target = options[nextIdx];
    triggerHaptic('selection');
    onSelect(target.id);
    document.getElementById(`${idPrefix}-${target.id}`)?.focus();
  }
}

/**
 * Right-38% Desktop / Bottom-42% Mobile Stitch v4 Frosted Glass HUD Overlay.
 * Floats cleanly beside (or below on portrait mobile) the live interactive Three.js 3D stage
 * without blocking left-58% / top-44% 3D pointer gestures, binding 100% lossless KO/EN content.
 */
export default function SiteStageHud({
  activeStage,
  copy,
  lang,
  theme,
  betaMailto,
  interaction,
  selectedPrivacyShield,
  onSelectPrivacyShield,
  onUpdateInteraction,
}: SiteStageHudProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeSubtabKey =
    activeStage === 'studio'
      ? interaction.studioSubtab
      : activeStage === 'architecture'
        ? interaction.architectureSubtab
        : activeStage === 'specs'
          ? interaction.specsSubtab
          : interaction.aboutSubtab;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeStage, activeSubtabKey]);

  const stageHeader = (() => {
    if (activeStage === 'studio') {
      const tabs: readonly SubtabOption<StageInteractionState['studioSubtab']>[] = [
        { id: 'preview', label: copy.subtabs.studioPreview },
        { id: 'atelier', label: copy.subtabs.studioAtelier },
        { id: 'intelligence', label: copy.subtabs.studioIntel },
      ];
      return {
        ariaLabel: 'Studio modules',
        prefix: 'hud-studio-tab',
        tabs,
        current: interaction.studioSubtab,
        badge: null,
        onSelect: (id: StageInteractionState['studioSubtab']) =>
          onUpdateInteraction({ studioSubtab: id }),
      };
    }

    if (activeStage === 'architecture') {
      const tabs: readonly SubtabOption<StageInteractionState['architectureSubtab']>[] = [
        { id: 'blueprint', label: copy.subtabs.archBlueprint },
        { id: 'privacy', label: copy.subtabs.archPrivacy },
        { id: 'maps', label: copy.subtabs.archMaps },
      ];
      return {
        ariaLabel: 'Architecture modules',
        prefix: 'hud-arch-tab',
        tabs,
        current: interaction.architectureSubtab,
        badge: null,
        onSelect: (id: StageInteractionState['architectureSubtab']) =>
          onUpdateInteraction({ architectureSubtab: id }),
      };
    }

    if (activeStage === 'specs') {
      const tabs: readonly SubtabOption<StageInteractionState['specsSubtab']>[] = [
        { id: 'kpi', label: copy.subtabs.benchKpi },
        { id: 'matrix', label: copy.subtabs.benchMatrix },
      ];
      return {
        ariaLabel: 'Specification views',
        prefix: 'hud-specs-tab',
        tabs,
        current: interaction.specsSubtab,
        badge: copy.stack.note,
        onSelect: (id: StageInteractionState['specsSubtab']) =>
          onUpdateInteraction({ specsSubtab: id }),
      };
    }

    const tabs: readonly SubtabOption<StageInteractionState['aboutSubtab']>[] = [
      { id: 'journey', label: copy.subtabs.aboutJourney },
      { id: 'mission', label: copy.subtabs.aboutMission },
      { id: 'founder', label: copy.subtabs.aboutFounder },
    ];
    return {
      ariaLabel: 'About story steps',
      prefix: 'hud-about-tab',
      tabs,
      current: interaction.aboutSubtab,
      badge: null,
      onSelect: (id: StageInteractionState['aboutSubtab']) =>
        onUpdateInteraction({ aboutSubtab: id }),
    };
  })();

  const showHeaderBadge = Boolean(stageHeader.badge) && stageHeader.tabs.length < 3;

  return (
    <aside
      key={activeStage}
      className="site-hud-panel"
      data-hud-surface="true"
      data-no-marble="true"
      data-stage={activeStage}
      aria-label={`${activeStage} inspector`}
    >
      <div className="site-hud-header" data-tab-count={stageHeader.tabs.length}>
        <div
          className="site-hud-subtabs"
          role="tablist"
          aria-label={stageHeader.ariaLabel}
          onKeyDown={(e) =>
            handleSubtabKeys(
              e,
              stageHeader.tabs as readonly SubtabOption<string>[],
              stageHeader.current,
              stageHeader.prefix,
              stageHeader.onSelect as (next: string) => void
            )
          }
        >
          {stageHeader.tabs.map((tab) => {
            const isSelected = tab.id === stageHeader.current;
            return (
              <button
                key={tab.id}
                id={`${stageHeader.prefix}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls="site-hud-tabpanel"
                tabIndex={isSelected ? 0 : -1}
                className={`site-hud-subtab-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  (stageHeader.onSelect as (next: string) => void)(tab.id);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {showHeaderBadge && <span className="site-hud-badge">{stageHeader.badge}</span>}
      </div>

      <div
        ref={scrollRef}
        id="site-hud-tabpanel"
        className="site-hud-scroll"
        role="tabpanel"
        aria-labelledby={`${stageHeader.prefix}-${stageHeader.current}`}
      >
        {activeStage === 'studio' && (
          <StudioStageHud
            copy={copy}
            lang={lang}
            theme={theme}
            interaction={interaction}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}

        {activeStage === 'architecture' && (
          <ArchitectureStageHud
            copy={copy}
            interaction={interaction}
            selectedPrivacyShield={selectedPrivacyShield}
            onSelectPrivacyShield={onSelectPrivacyShield}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}

        {activeStage === 'specs' && (
          <SpecsStageHud
            copy={copy}
            interaction={interaction}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}

        {activeStage === 'about' && (
          <AboutStageHud
            copy={copy}
            betaMailto={betaMailto}
            interaction={interaction}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}
      </div>
    </aside>
  );
}
