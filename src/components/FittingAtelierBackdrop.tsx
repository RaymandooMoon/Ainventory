import { memo } from 'react';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  theme?: 'light' | 'dark';
}

/**
 * Pure HTML/CSS/SVG Luxury Showroom Backdrop for the Left 58% Virtual Fitting Stage.
 * - Strictly ZERO <canvas> elements (preserves E2E procedural canvas count === 0).
 * - Strictly pointer-events: none & aria-hidden="true" so zero stage HUD controls are intercepted.
 * - Light-mode gobo opacity <= 0.045 guarantees stage luminance safety margin >= 230 (>> 225).
 * - Rain tint layer activates ONLY when effectiveWeather === 'rain'.
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  theme = 'light',
}: FittingAtelierBackdropProps) {
  const isDark = theme === 'dark';
  const isRain = effectiveWeather === 'rain';
  const isSunnyGobo =
    effectiveWeather === 'clear' ||
    effectiveWeather === 'heatwave' ||
    effectiveWeather === 'wind';

  return (
    <div
      className={`atelier-stage-backdrop ${isDark ? 'is-dark' : 'is-light'} is-weather-${effectiveWeather} ${isSunnyGobo ? 'has-sun-gobos' : ''}`.trim()}
      data-atelier-backdrop="true"
      aria-hidden="true"
    >
      {/* Architectural Showroom Wall & Corner Plinth Recess */}
      <div className="atelier-backdrop-wall-recess" />

      {/* Ultra-soft diagonal window-blind sunlight gobos (opacity <= 0.045 in light mode) */}
      <div className="atelier-backdrop-sunlight-gobos" />

      {/* Warm dome floor/plinth lamp ambient glow */}
      <div className="atelier-backdrop-lamp-glow" />

      {/* Minimalist curved tubular garment rack & architectural plinth lamp silhouette (pure SVG) */}
      <svg
        className="atelier-backdrop-props-svg"
        viewBox="0 0 440 580"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        {/* Left-back subtle gallery molding line */}
        <line
          x1="46"
          y1="0"
          x2="46"
          y2="452"
          stroke="currentColor"
          strokeOpacity={isDark ? '0.09' : '0.07'}
          strokeWidth="1"
        />

        {/* Minimalist curved arch tubular garment rack on right-back */}
        <path
          d="M286 456 V178 C286 154 304 136 328 136 H392 C414 136 430 154 430 178 V456"
          stroke="currentColor"
          strokeOpacity={isDark ? '0.2' : '0.15'}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <line
          x1="274"
          y1="456"
          x2="302"
          y2="456"
          stroke="currentColor"
          strokeOpacity={isDark ? '0.22' : '0.16'}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Subtle minimalist hanger hooks on rack */}
        <path
          d="M332 136 V148 M358 136 V148 M384 136 V148"
          stroke="currentColor"
          strokeOpacity={isDark ? '0.16' : '0.11'}
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Architectural showroom plinth & warm dome lamp silhouette on right */}
        <rect
          x="336"
          y="356"
          width="88"
          height="98"
          rx="4"
          fill="currentColor"
          fillOpacity={isDark ? '0.14' : '0.055'}
        />
        {/* Lamp stem */}
        <rect
          x="375"
          y="314"
          width="10"
          height="42"
          rx="3"
          fill="currentColor"
          fillOpacity={isDark ? '0.28' : '0.13'}
        />
        {/* Dome shade */}
        <path
          d="M344 318 C344 294 360 280 380 280 C400 280 416 294 416 318 Z"
          fill="currentColor"
          fillOpacity={isDark ? '0.36' : '0.15'}
        />
      </svg>

      {/* Strictly activated ONLY when effectiveWeather === 'rain' */}
      {isRain && <div className="atelier-backdrop-rain-tint" />}
    </div>
  );
});

export default FittingAtelierBackdrop;
