import { memo } from 'react';
import {
  DEFAULT_STAGE_BACKGROUND_ID,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import type { TimeOfDayPhase } from '../utils/tomorrowPromptPolicy.ts';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
  timeOfDay?: TimeOfDayPhase;
  backgroundId?: string;
}

/**
 * Architectural Stage Room Backdrop (`z-index: 2`) combining:
 * - Equipped S/A/B/C Architectural Room Environment photo (`/assets/backgrounds/*.jpg`)
 * - Samsung Galaxy Weather-inspired live Time-of-Day atmospheric lighting tint
 * - Feathered horizon wash for seamless Ground Deck grounding
 * Strictly ZERO `<canvas>` elements & `pointer-events: none`.
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  scenarioKey = 'live',
  theme = 'light',
  timeOfDay = 'day',
  backgroundId = DEFAULT_STAGE_BACKGROUND_ID,
}: FittingAtelierBackdropProps) {
  const isDark = theme === 'dark';
  const isRain = effectiveWeather === 'rain';
  const isWarmSpring = scenarioKey === 'warm_spring';
  const isLiveForecast = scenarioKey === 'live';
  const resolvedTod: TimeOfDayPhase =
    timeOfDay === 'sunrise' || timeOfDay === 'sunset' || timeOfDay === 'night'
      ? timeOfDay
      : 'day';
  const bgItem = getStageBackgroundById(backgroundId);

  return (
    <div
      className={[
        'atelier-stage-backdrop',
        'is-infinity-cyclorama',
        'has-arch-backdrop',
        isDark ? 'is-dark' : 'is-light',
        `is-weather-${effectiveWeather}`,
        `is-tod-${resolvedTod}`,
        isWarmSpring ? 'is-scenario-warm-spring' : '',
        isLiveForecast ? 'is-scenario-live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-atelier-backdrop="true"
      data-backdrop-style="architectural-stage"
      data-backdrop-bg-id={bgItem.id}
      data-backdrop-bg-tier={bgItem.tier}
      data-backdrop-weather={effectiveWeather}
      data-backdrop-scenario={scenarioKey}
      data-backdrop-tod={resolvedTod}
      aria-hidden="true"
    >
      {/* 0. Fallback Infinity-Cove Cyclorama Wall-to-Floor Sweep */}
      <div className="atelier-cyclorama-wall-cove" />

      {/* 1. Equipped 3:4 Architectural Studio / Terrace Photograph */}
      <img
        src={bgItem.imageUrl}
        alt=""
        draggable={false}
        decoding="async"
        className="atelier-stage-environment-photo"
        data-stage-bg-id={bgItem.id}
        data-stage-bg-tier={bgItem.tier}
      />

      {/* 1B. Subtle Live Time-of-Day Sky & Window Light Tint */}
      <div className="atelier-backdrop-tod-sky" />

      {/* 2. Weather-Adaptive Overhead Skylight Softbox Wash */}
      <div className="atelier-backdrop-skylight-wash" />

      {/* 3. Subtle Subject Back-Separation Halo behind Mannequin */}
      <div className="atelier-cyclorama-center-halo" />

      {/* 4. Architectural Framing Side Depth Vignette */}
      <div className="atelier-cyclorama-side-depth" />

      {/* 5. Feathered Cove Horizon Transition blending cleanly into Ground Deck */}
      <div className="atelier-backdrop-atmospheric-haze" />

      {/* 6. Rain moody slate studio ambiance (strictly activated ONLY when effectiveWeather === 'rain') */}
      {isRain && <div className="atelier-backdrop-rain-tint" />}
    </div>
  );
});

export default FittingAtelierBackdrop;
