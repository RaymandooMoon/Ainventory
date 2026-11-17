import { useLayoutEffect, useRef } from 'react';
import BrandLogo from '../auth/BrandLogo.tsx';
import { computeLogoFlipTransform, consumePendingLogoFlight } from '../../utils/logoTransition.ts';

export interface AppHeaderBrandProps {
  effectiveTheme?: 'light' | 'dark' | string;
  className?: string;
}

/**
 * Top-left iNVTRY brand mark rendered inside every main view's `.hig-top-bar`.
 * Runs a GPU-accelerated FLIP glide when arriving directly from the auth screen.
 */
export default function AppHeaderBrand({
  effectiveTheme = 'light',
  className = '',
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
          { transform: flip.transformCss, opacity: 0.92 },
          { transform: 'translate3d(0px, 0px, 0) scale(1, 1)', opacity: 1 },
        ],
        {
          duration: 540,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'none',
        }
      );
    }
  }, []);

  return (
    <div className={`hig-top-bar-brand-slot ${className}`.trim()}>
      <BrandLogo
        ref={logoRef}
        effectiveTheme={effectiveTheme}
        className="hig-shell-brand-logo"
        alt="A inventory"
      />
    </div>
  );
}
