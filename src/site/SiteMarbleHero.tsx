import { memo, useCallback } from 'react';
import {
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeVariantId,
} from '../components/auth/loginThreeScenes.ts';
import {
  useMarbleBackdropStage,
  type MarbleHitParams,
} from '../components/auth/useMarbleBackdropStage.ts';
import type { SiteTheme, SiteViewId } from './siteContent.ts';

export interface SiteMarbleHeroProps {
  readonly theme: SiteTheme;
  readonly motionVariant: LoginThreeVariantId;
  readonly variantChangeOrigin: { readonly x: number; readonly y: number; readonly seq: number } | null;
  readonly activeView: SiteViewId;
  readonly viewportRootRef: React.RefObject<HTMLElement | null>;
}

const SITE_MARBLE_TARGET_SELECTOR = '[data-marble-target="true"]';
const SITE_FLOOR_RAIL_SELECTOR = '[data-marble-floor="true"]';
const SITE_HIT_PARAMS: MarbleHitParams = {
  impactStrength: 0.96,
  minBounceSpeed: 0.84,
};

function isMarbleExcludedElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('[data-no-marble="true"], [role="dialog"], [aria-modal="true"]'));
}

const getSiteTargetSelector = () => SITE_MARBLE_TARGET_SELECTOR;
const getSiteHitParams = () => SITE_HIT_PARAMS;
const shouldSiteDispatchClick = (el: HTMLElement) => el.dataset.marbleAction === 'click';

/**
 * Persistent Full-Viewport Shared 3D Silk Cloth + Rolling Glass Marble Canvas.
 * Delegates all Three.js rendering, physics, adaptive frame pacing, gyroscope, and collision logic
 * to the exact same `useMarbleBackdropStage` hook used by the app login screen, while opting into
 * the website-only bottom floor rail (`[data-marble-floor="true"]`) to prevent marble escape.
 */
const SiteMarbleHero = memo(function SiteMarbleHero({
  theme,
  motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
  variantChangeOrigin = null,
  activeView,
  viewportRootRef,
}: SiteMarbleHeroProps) {
  const isDark = theme === 'dark';

  const getTargetRoot = useCallback(
    (stageEl: HTMLElement) => viewportRootRef.current ?? stageEl.parentElement,
    [viewportRootRef]
  );

  const { stageRef, canvasRef, webglFallback } = useMarbleBackdropStage({
    isDark,
    stage: 'intro',
    motionVariant,
    variantChangeOrigin,
    cooldownResetKey: activeView,
    cooldownResetMs: 620,
    getTargetRoot,
    getTargetSelector: getSiteTargetSelector,
    hitRadiusScale: 1.06,
    minStrikeSpeed: 0.14,
    globalHitCooldownMs: 380,
    perTargetCooldownMs: 980,
    pushPaddingPx: 4,
    maxPushRadiusMultiple: 2.4,
    wheelImpulseScale: 0.45,
    ignorePointerDownSelector: 'button, a, input, textarea, select',
    ignoreHoverOverSelector: 'button, a, input',
    manualTargetSelector: SITE_MARBLE_TARGET_SELECTOR,
    isEventExcluded: isMarbleExcludedElement,
    shouldDispatchClick: shouldSiteDispatchClick,
    getHitParams: getSiteHitParams,
    floorRailSelector: SITE_FLOOR_RAIL_SELECTOR,
  });

  return (
    <div
      ref={stageRef}
      className={`site-marble-stage ${webglFallback ? 'is-webgl-fallback' : ''}`}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-motion-variant={motionVariant}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="site-marble-canvas" />
      <div className="site-marble-veil" />
    </div>
  );
});

export default SiteMarbleHero;
