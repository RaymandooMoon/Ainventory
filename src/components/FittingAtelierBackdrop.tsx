import { memo } from 'react';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
}

/**
 * Seamless Architectural Infinity-Cove Cyclorama Photography Studio Backdrop (`z-index: 2`).
 * - Replaces flat 2D cartoon vector furniture props (lamp, stone block, wireframe coat rack, corner seam)
 *   with a pure, depth-calibrated studio cyclorama horizon ("무봉제 호리존 스튜디오") that harmonizes naturally
 *   with BOTH `캐릭터 시뮬레이션` (dimensional character mannequin) and `실사 모델` (photorealistic lookbook).
 * - Features:
 *   1. Continuous curved cyclorama wall-to-floor sweep (`.atelier-cyclorama-wall-cove`) with zero hard seams.
 *   2. Soft overhead keylight & back-separation studio softbox halo (`.atelier-cyclorama-center-halo`) behind
 *      the mannequin's shoulders/torso so silhouettes separate cleanly without artificial clip-art clutter.
 *   3. Subtle curved architectural cove side depth (`.atelier-cyclorama-side-depth`) for natural 3D room volume.
 *   4. Weather-adaptive studio daylight temperature wash across all 9 weather scenarios (`live`, `clear`,
 *      `mild/warm_spring`, `cloudy`, `rain`, `snow`, `wind`, `heatwave`, `coldwave`).
 * - Strictly ZERO `<canvas>` elements, ZERO vector furniture clip-art, & `pointer-events: none` (`aria-hidden="true"`).
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  scenarioKey = 'live',
  theme = 'light',
}: FittingAtelierBackdropProps) {
  const isDark = theme === 'dark';
  const isRain = effectiveWeather === 'rain';
  const isWarmSpring = scenarioKey === 'warm_spring';
  const isLiveForecast = scenarioKey === 'live';

  return (
    <div
      className={[
        'atelier-stage-backdrop',
        'is-infinity-cyclorama',
        isDark ? 'is-dark' : 'is-light',
        `is-weather-${effectiveWeather}`,
        isWarmSpring ? 'is-scenario-warm-spring' : '',
        isLiveForecast ? 'is-scenario-live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-atelier-backdrop="true"
      data-backdrop-style="infinity-cyclorama"
      data-backdrop-weather={effectiveWeather}
      data-backdrop-scenario={scenarioKey}
      aria-hidden="true"
    >
      {/* 1. Continuous Infinity-Cove Cyclorama Wall-to-Floor Sweep (zero hard wall/corner lines) */}
      <div className="atelier-cyclorama-wall-cove" />

      {/* 2. Weather-Adaptive Studio Overhead Softbox Wash */}
      <div className="atelier-backdrop-skylight-wash" />

      {/* 3. Studio Softbox Subject Back-Separation Halo (subtle 3D rim depth behind mannequin) */}
      <div className="atelier-cyclorama-center-halo" />

      {/* 4. Subtle Curved Studio Cove Architectural Side Falloff */}
      <div className="atelier-cyclorama-side-depth" />

      {/* 5. Feathered Cove Horizon Transition blending seamlessly into the Ground Deck */}
      <div className="atelier-backdrop-atmospheric-haze" />

      {/* 6. Rain moody slate studio ambiance (strictly activated ONLY when effectiveWeather === 'rain') */}
      {isRain && <div className="atelier-backdrop-rain-tint" />}
    </div>
  );
});

export default FittingAtelierBackdrop;
