import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActiveStageId, StageInteractionState } from '../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SpecsStageHud, AboutStageHud } from './hud/SpecsAboutHud.tsx';
import { StageTopControlsDock } from './hud/StageTopControlsDock.tsx';
import { ArchitectureStageHud, StudioStageHud } from './hud/StudioArchitectureHud.tsx';
import { getTopControlsDockKind } from './hud/topControlsDockState.ts';
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

interface SheetGestureState {
  active: boolean;
  source: 'touch' | 'pointer';
  zone: 'handle' | 'header' | 'scroll';
  lockedOut: boolean;
  handled: boolean;
  startX: number;
  startY: number;
  startScrollTop: number;
}

const MOBILE_SHEET_MAX_WIDTH = 859;
const HORIZONTAL_SWIPE_PX = 28;

function isMobileSheetViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_SHEET_MAX_WIDTH;
}

function readGesturePoint(e: PointerEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in e) {
    if (e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return null;
  }
  return { x: e.clientX, y: e.clientY };
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
 * Right-38% Desktop / 2-Detent Expandable Mobile Bottom Sheet Stitch v4 Frosted Glass HUD Overlay.
 * Floats cleanly beside (or anchored at 35dvh resting detent on mobile, expanding smoothly on scroll/swipe/handle tap)
 * the live interactive Three.js 3D stage without blocking 3D pointer gestures, binding 100% lossless KO/EN content.
 */
function SiteStageHudPanel({
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
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const isSheetExpandedRef = useRef(false);
  const suppressGrabClickRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<SheetGestureState>({
    active: false,
    source: 'pointer',
    zone: 'scroll',
    lockedOut: false,
    handled: false,
    startX: 0,
    startY: 0,
    startScrollTop: 0,
  });

  const activeSubtabKey =
    activeStage === 'studio'
      ? interaction.studioSubtab
      : activeStage === 'architecture'
        ? interaction.architectureSubtab
        : activeStage === 'specs'
          ? interaction.specsSubtab
          : interaction.aboutSubtab;

  const markSuppressGrabClick = useCallback(() => {
    suppressGrabClickRef.current = true;
    if (suppressTimerRef.current !== null) {
      window.clearTimeout(suppressTimerRef.current);
    }
    suppressTimerRef.current = window.setTimeout(() => {
      suppressGrabClickRef.current = false;
      suppressTimerRef.current = null;
    }, 140);
  }, []);

  const applySheetExpanded = useCallback((next: boolean) => {
    if (isSheetExpandedRef.current === next) return;
    isSheetExpandedRef.current = next;
    setIsSheetExpanded(next);
    triggerHaptic('selection');
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeStage, activeSubtabKey]);

  // Reset mobile expanded state cleanly if viewport grows into desktop HUD layout
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(`(max-width: ${MOBILE_SHEET_MAX_WIDTH}px)`);
    const onViewportChange = (e: MediaQueryListEvent) => {
      if (!e.matches) {
        gestureRef.current.active = false;
        isSheetExpandedRef.current = false;
        setIsSheetExpanded(false);
      }
    };
    mql.addEventListener('change', onViewportChange);
    return () => {
      mql.removeEventListener('change', onViewportChange);
    };
  }, []);

  // Horizontal swipe tracking on the right-side explanation drawer toggle handle
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const evaluateSwipe = (e: PointerEvent | TouchEvent, source: 'touch' | 'pointer') => {
      const g = gestureRef.current;
      if (!g.active || g.source !== source || g.lockedOut || g.handled) return;
      if (!isMobileSheetViewport()) {
        g.active = false;
        return;
      }

      const pt = readGesturePoint(e);
      if (!pt) return;

      const dx = pt.x - g.startX;
      const dy = pt.y - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDy > 14 && absDy > absDx * 1.15) {
        g.lockedOut = true;
        return;
      }

      if (g.zone !== 'handle') return;

      const expanded = isSheetExpandedRef.current;

      // Swipe left on handle -> expand right explanation drawer to full width
      if (!expanded && dx < -HORIZONTAL_SWIPE_PX && absDx > absDy * 1.15) {
        g.handled = true;
        g.active = false;
        markSuppressGrabClick();
        applySheetExpanded(true);
        return;
      }

      // Swipe right on handle -> collapse back to Left-3D / Right-Explanation split view
      if (expanded && dx > HORIZONTAL_SWIPE_PX && absDx > absDy * 1.15) {
        g.handled = true;
        g.active = false;
        markSuppressGrabClick();
        applySheetExpanded(false);
      }
    };

    const finishGesture = (e: PointerEvent | TouchEvent, source: 'touch' | 'pointer') => {
      const g = gestureRef.current;
      if (!g.active || g.source !== source) return;
      evaluateSwipe(e, source);
      g.active = false;
      g.lockedOut = false;
      g.handled = false;
    };

    const onPointerMove = (e: PointerEvent) => evaluateSwipe(e, 'pointer');
    const onPointerEnd = (e: PointerEvent) => finishGesture(e, 'pointer');
    const onTouchMove = (e: TouchEvent) => evaluateSwipe(e, 'touch');
    const onTouchEnd = (e: TouchEvent) => finishGesture(e, 'touch');

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onPointerEnd, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = null;
      }
    };
  }, [applySheetExpanded, markSuppressGrabClick]);

  const beginSheetGesture = (
    e: React.PointerEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
    zone: 'handle' | 'header' | 'scroll'
  ) => {
    if (!isMobileSheetViewport()) return;

    const isTouch = 'touches' in e;
    if (!isTouch) {
      // Touch devices are handled exclusively via touchstart/touchmove/touchend
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (gestureRef.current.active && gestureRef.current.source === 'touch') return;
    }

    const targetEl = e.target instanceof Element ? e.target : null;
    if (
      zone !== 'handle' &&
      targetEl?.closest('input, textarea, select, [contenteditable="true"], .site-hud-subtabs')
    ) {
      return;
    }

    const clientX = isTouch ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = isTouch ? (e.touches[0]?.clientY ?? 0) : e.clientY;

    if (zone === 'handle') {
      e.stopPropagation();
    }

    gestureRef.current = {
      active: true,
      source: isTouch ? 'touch' : 'pointer',
      zone,
      lockedOut: false,
      handled: false,
      startX: clientX,
      startY: clientY,
      startScrollTop: zone === 'scroll' ? (scrollRef.current?.scrollTop ?? 0) : 0,
    };
  };

  const handleGrabClick = () => {
    if (suppressGrabClickRef.current || !isMobileSheetViewport()) return;
    applySheetExpanded(!isSheetExpandedRef.current);
  };

  const stageHeader = (() => {
    if (activeStage === 'studio') {
      const tabs: readonly SubtabOption<StageInteractionState['studioSubtab']>[] = [
        { id: 'atelier', label: copy.subtabs.studioAtelier },
        { id: 'preview', label: copy.subtabs.studioPreview },
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
  const topDockKind = getTopControlsDockKind(activeStage, interaction, copy);
  const grabAriaLabel = isSheetExpanded
    ? lang === 'ko'
      ? '패널 접기 (3D 무대 크게 보기)'
      : 'Collapse panel to reveal 3D stage'
    : lang === 'ko'
      ? '패널 위로 펼치기'
      : 'Expand panel upward';

  return (
    <>
      <StageTopControlsDock
        activeStage={activeStage}
        copy={copy}
        lang={lang}
        interaction={interaction}
        onUpdateInteraction={onUpdateInteraction}
      />

      <aside
        className="site-hud-panel"
        data-hud-surface="true"
        data-no-marble="true"
        data-stage={activeStage}
        data-top-dock={topDockKind}
        data-sheet-expanded={isSheetExpanded ? 'true' : 'false'}
        aria-label={`${activeStage} inspector`}
      >
      <button
        type="button"
        className="site-hud-grab-btn"
        aria-expanded={isSheetExpanded}
        aria-controls="site-hud-tabpanel"
        aria-label={grabAriaLabel}
        onClick={handleGrabClick}
        onPointerDown={(e) => beginSheetGesture(e, 'handle')}
        onTouchStart={(e) => beginSheetGesture(e, 'handle')}
      >
        <span className="site-hud-grab-cue" aria-hidden="true">
          {isSheetExpanded ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          <span>
            {isSheetExpanded
              ? lang === 'ko'
                ? '3D · 설명 분할'
                : 'Split 3D'
              : lang === 'ko'
                ? '넓게 보기'
                : 'Expand'}
          </span>
        </span>
      </button>

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
            lang={lang}
            interaction={interaction}
            selectedPrivacyShield={selectedPrivacyShield}
            onSelectPrivacyShield={onSelectPrivacyShield}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}

        {activeStage === 'specs' && (
          <SpecsStageHud
            copy={copy}
            lang={lang}
            interaction={interaction}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}

        {activeStage === 'about' && (
          <AboutStageHud
            copy={copy}
            lang={lang}
            betaMailto={betaMailto}
            interaction={interaction}
            onUpdateInteraction={onUpdateInteraction}
          />
        )}
      </div>

      <div
        className="site-hud-footer-dock"
        data-tab-count={stageHeader.tabs.length}
        onPointerDown={(e) => beginSheetGesture(e, 'header')}
        onTouchStart={(e) => beginSheetGesture(e, 'header')}
      >
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
    </aside>
    </>
  );
}

export default function SiteStageHud(props: SiteStageHudProps) {
  return <SiteStageHudPanel key={props.activeStage} {...props} />;
}

