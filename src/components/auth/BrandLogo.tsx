import { memo } from 'react';
import { withPublicBaseUrl } from '../../utils/nativeBridge.ts';

export interface BrandLogoProps {
  effectiveTheme?: 'light' | 'dark' | string;
  className?: string;
  alt?: string;
}

/**
 * Dual-theme "iNVTRY" hanger-calligraphy brand mark.
 * Renders crisp transparent PNG variants tuned for Atelier Daylight (light)
 * and OLED Noir (dark #000000) with zero-CLS aspect ratio preservation.
 */
const BrandLogo = memo(function BrandLogo({
  effectiveTheme = 'light',
  className = '',
  alt = 'A inventory',
}: BrandLogoProps) {
  const isDark = effectiveTheme === 'dark';
  const lightSrc = withPublicBaseUrl('/assets/brand/invtry-logo-light.png');
  const darkSrc = withPublicBaseUrl('/assets/brand/invtry-logo-dark.png');

  return (
    <span
      className={`atelier-logo-frame ${className}`.trim()}
      data-logo-theme={isDark ? 'dark' : 'light'}
    >
      <img
        src={lightSrc}
        alt={isDark ? '' : alt}
        aria-hidden={isDark}
        width={1120}
        height={394}
        decoding="async"
        className={`atelier-logo-img ${!isDark ? 'is-visible' : ''}`}
      />
      <img
        src={darkSrc}
        alt={isDark ? alt : ''}
        aria-hidden={!isDark}
        width={1120}
        height={394}
        decoding="async"
        className={`atelier-logo-img atelier-logo-img--overlay ${isDark ? 'is-visible' : ''}`}
      />
    </span>
  );
});

export default BrandLogo;
