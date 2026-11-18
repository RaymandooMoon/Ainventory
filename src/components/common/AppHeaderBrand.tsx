import { useLayoutEffect, useRef } from 'react';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { computeLogoFlipTransform, consumePendingLogoFlight } from '../../utils/logoTransition.ts';
import BrandLogo from '../auth/BrandLogo.tsx';

export interface AppHeaderBrandProps {
  effectiveTheme?: 'light' | 'dark' | string;
  className?: string;
  onClick?: () => void;
}

/**
 * Top-center clickable iNVTRY brand mark rendered inside every main view's `.hig-top-bar`.
 * Clicking returns to the default Outfits stage; runs a GPU-accelerated FLIP shrink-glide
 * when arriving directly from the LoginView hero mark.
 */
export default function AppHeaderBrand({
  effectiveTheme = 'light',
  className = '',
  onClick,
}: AppHeaderBrandProps) {
  const logoRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const el = logoRef.current;
    if (!el) return;

    const sourceRect = consumePendingLogoFlight();
    if (!sourceRect) return;

    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const targetRect = el.getBoundingClientRect();
    const flip = computeLogoFlipTransform(sourceRect, targetRect);
    if (!flip) return;

    if (typeof el.animate === 'function') {
      el.animate(
        [
          { transform: flip.transformCss, opacity: 0.88, filter: 'blur(0.4px)' },
          { transform: 'translate3d(0px, 0px, 0) scale(1, 1)', opacity: 1, filter: 'blur(0px)' },
        ],
        {
          duration: 620,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'none',
        }
      );
    }
  }, []);

  const handleBrandClick = () => {
    triggerHaptic('selection');
    if (onClick) {
      onClick();
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ainventory:navigate-tab', { detail: 'outfits' }));
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className={`hig-top-bar-brand-slot ${className}`.trim()}>
      <button
        type="button"
        data-header-brand-btn="true"
        className="hig-top-bar-brand-btn"
        aria-label="iNVTRY · 기본 화면으로 이동"
        title="iNVTRY"
        onClick={handleBrandClick}
      >
        <BrandLogo
          ref={logoRef}
          effectiveTheme={effectiveTheme}
          className="hig-shell-brand-logo"
          alt="iNVTRY"
        />
      </button>
    </div>
  );
}

