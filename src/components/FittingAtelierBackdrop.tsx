import { memo } from 'react';
import {
  DEFAULT_STAGE_BACKGROUND_ID,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import type { TimeOfDayPhase } from '../utils/tomorrowPromptPolicy.ts';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
  timeOfDay?: TimeOfDayPhase;
  backgroundId?: string;
  isOutdoor?: boolean;
}

/**
 * Architectural Stage Room Backdrop (`z-index: 2`) combining:
 * - Equipped S/A/B/C Architectural Room Environment photo (`/assets/backgrounds/*.jpg`)
 * - Samsung Galaxy Weather-inspired live Time-of-Day sky tint (open-sky outdoor stages only)
 * - Natural warm ivory incandescent indirect cove ambient lighting (enclosed-ceiling indoor stages)
 * Strictly ZERO `<canvas>` elements & `pointer-events: none`.
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  scenarioKey = 'live',
  theme = 'light',
  timeOfDay = 'day',
  backgroundId = DEFAULT_STAGE_BACKGROUND_ID,
  isOutdoor,
}: FittingAtelierBackdropProps) {
  const isDark = theme === 'dark';
  const bgItem = getStageBackgroundById(backgroundId);
  const resolvedOutdoor = typeof isOutdoor === 'boolean' ? isOutdoor : Boolean(bgItem.isOutdoor);
  const effectiveStageWeather = resolvedOutdoor ? effectiveWeather : 'clear';
  const isRain = resolvedOutdoor && effectiveWeather === 'rain';
  const isWarmSpring = resolvedOutdoor && scenarioKey === 'warm_spring';
  const isLiveForecast = scenarioKey === 'live';
  const resolvedTod: TimeOfDayPhase =
    timeOfDay === 'sunrise' || timeOfDay === 'sunset' || timeOfDay === 'night'
      ? timeOfDay
      : 'day';

  return (
    <div
      className={[
        'atelier-stage-backdrop',
        'is-infinity-cyclorama',
        'has-arch-backdrop',
        isDark ? 'is-dark' : 'is-light',
        resolvedOutdoor ? 'is-outdoor-sky' : 'is-indoor-ivory',
        `is-weather-${effectiveStageWeather}`,
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
      data-stage-outdoor={resolvedOutdoor ? 'true' : 'false'}
      data-stage-lighting={resolvedOutdoor ? 'outdoor-sky' : 'indoor-ivory'}
      data-backdrop-weather={effectiveStageWeather}
      data-backdrop-scenario={resolvedOutdoor ? scenarioKey : 'indoor'}
      data-backdrop-tod={resolvedTod}
      aria-hidden="true"
    >
      {/* 0. Fallback Infinity-Cove Cyclorama Wall-to-Floor Sweep */}
      <div className="atelier-cyclorama-wall-cove" />

      {/* 1. Equipped 3:4 Architectural Studio / Terrace Photograph */}
      <img
        src={withPublicBaseUrl(bgItem.imageUrl)}
        alt=""
        draggable={false}
        decoding="async"
        className="atelier-stage-environment-photo"
        data-stage-bg-id={bgItem.id}
        data-stage-bg-tier={bgItem.tier}
      />

      {/* 1B. Outdoor Open-Sky Time-of-Day Wash OR Warm Ivory Incandescent Indoor Indirect Cove Lighting */}
      {resolvedOutdoor ? (
        <div className="atelier-backdrop-tod-sky" />
      ) : (
        <div
          className="atelier-indoor-ivory-ambient"
          data-indoor-ivory-light="true"
        />
      )}

      {/* 2. Overhead Skylight / Cove Softbox Wash */}
      <div className="atelier-backdrop-skylight-wash" />

      {/* 3. Subtle Subject Back-Separation Halo behind Mannequin */}
      <div className="atelier-cyclorama-center-halo" />

      {/* 4. Architectural Framing Side Depth Vignette */}
      <div className="atelier-cyclorama-side-depth" />

      {/* 5. Feathered Cove Horizon Transition blending cleanly into Ground Deck */}
      <div className="atelier-backdrop-atmospheric-haze" />

      {/* 6. Rain moody slate studio ambiance (strictly activated ONLY on open-sky outdoor stages during rain) */}
      {isRain && <div className="atelier-backdrop-rain-tint" />}
    </div>
  );
});

export default FittingAtelierBackdrop;
