import { memo } from 'react';
import '@fontsource/bodoni-moda/latin-500.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import './brandLogo.css';

export type AInventoryLogoVariant = 'maison' | 'runway';
export type AInventoryLogoLayout = 'stacked' | 'inline';

export interface AInventoryLogoProps {
  variant?: AInventoryLogoVariant;
  layout?: AInventoryLogoLayout;
  /** Encloses the monogram in a hairline ring (Runway signature). */
  framed?: boolean;
  /** Draws the monogram strokes once on mount (intro choreography). */
  animateDraw?: boolean;
  showMonogram?: boolean;
  className?: string;
  id?: string;
}

/**
 * A Inventory brand logo — "AI + inventory".
 *
 * Monogram: a hanger whose triangle reads as the letter A (wardrobe), paired
 * with a slim I. Both glyphs carry the gold point color, as do the "A" and "I"
 * of the wordmark, so the AI inside the name always reads first.
 *
 * Colors come from CSS custom properties (`--brand-gold`, `--brand-ink`) so the
 * mark adapts to light/dark brand surfaces without re-rendering.
 */
function AInventoryLogo({
  variant = 'maison',
  layout = 'stacked',
  framed = false,
  animateDraw = false,
  showMonogram = true,
  className = '',
  id,
}: AInventoryLogoProps) {
  const classes = [
    'ai-logo',
    `ai-logo--${variant}`,
    `ai-logo--${layout}`,
    framed ? 'is-framed' : '',
    animateDraw ? 'is-drawing' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span id={id} className={classes} role="img" aria-label="A Inventory" data-brand-logo={variant}>
      {showMonogram && (
        <svg
          className="ai-logo-mark"
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          {framed && <circle className="ai-logo-ring" cx="32" cy="32" r="30.5" pathLength={1} />}
          <g
            className="ai-logo-glyphs"
            transform={framed ? 'translate(14.4 14.4) scale(0.55)' : undefined}
          >
            {/* Hanger hook */}
            <path
              className="ai-logo-stroke ai-logo-hook"
              pathLength={1}
              d="M24 17V13.6C24 11.8 26.3 11.2 27.3 9.9C28.6 8.2 27.5 5.4 24.9 5.4C22.9 5.4 21.6 6.7 21.6 8.4"
            />
            {/* Hanger body = A */}
            <path className="ai-logo-stroke" pathLength={1} d="M7 56L24 17L41 56" />
            <path className="ai-logo-stroke" pathLength={1} d="M13.6 41H34.4" />
            {/* I */}
            <path className="ai-logo-stroke" pathLength={1} d="M52 17V56" />
            {variant === 'maison' && (
              <path className="ai-logo-stroke ai-logo-serif" pathLength={1} d="M47.5 17H56.5M47.5 56H56.5" />
            )}
          </g>
        </svg>
      )}
      <span className="ai-logo-word" aria-hidden="true">
        <span className="ai-logo-gold">A</span>
        <span className="ai-logo-space"> </span>
        <span className="ai-logo-gold">I</span>
        <span className="ai-logo-rest">NVENTORY</span>
      </span>
    </span>
  );
}

export default memo(AInventoryLogo);
