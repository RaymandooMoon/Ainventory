import { memo, useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_STAGE_BACKGROUND_ID,
  type StageLightingPresetId,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import {
  type WeatherOpticalInput,
  resolveStageLightingFrame,
} from '../utils/stageLightingEngine.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import type { TimeOfDayPhase } from '../utils/tomorrowPromptPolicy.ts';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
  timeOfDay?: TimeOfDayPhase;
  backgroundId?: string;
  isOutdoor?: boolean;
  weather?: WeatherOpticalInput | null;
  clockNowMs?: number;
  lightingPreset?: StageLightingPresetId | string;
  lightingIntensity?: number;
}

/**
 * Architectural Stage Room Backdrop (`z-index: 2`) combining:
 * - Equipped S+/S/A+/A/B+/B/C Architectural Room or Open-Sky Courtyard photo (`/assets/backgrounds/*.jpg`)
 * - Seasonal & Composite Weather atmospheric tint (open-sky outdoor stages only)
 * - Per-room daytime window sunlight vs post-sunset selective room dimming & warm fixture glow (indoor stages)
 * - User-configurable lighting color temperature preset & brightness intensity (`0%..200%`)
 * Strictly ZERO `<canvas>` elements & `pointer-events: none`.
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  scenarioKey = 'live',
  theme = 'light',
  timeOfDay = 'day',
  backgroundId = DEFAULT_STAGE_BACKGROUND_ID,
  isOutdoor,
  weather = null,
  clockNowMs,
  lightingPreset = DEFAULT_LIGHTING_PRESET,
  lightingIntensity = DEFAULT_LIGHTING_INTENSITY,
}: FittingAtelierBackdropProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isDark = theme === 'dark';
  const bgItem = getStageBackgroundById(backgroundId);
  const resolvedOutdoor = typeof isOutdoor === 'boolean' ? isOutdoor : Boolean(bgItem.isOutdoor);
  const effectiveStageWeather = resolvedOutdoor ? effectiveWeather : 'clear';
  const isWarmSpring = resolvedOutdoor && scenarioKey === 'warm_spring';
  const isLiveForecast = scenarioKey === 'live';
  const resolvedTod: TimeOfDayPhase =
    timeOfDay === 'sunrise' || timeOfDay === 'sunset' || timeOfDay === 'night'
      ? timeOfDay
      : 'day';

  const lightingFrame = useMemo(() => {
    const mergedWeather: WeatherOpticalInput = {
      ...(weather || {}),
      effectiveWeather: weather?.effectiveWeather || effectiveWeather,
      scenarioKey,
    };
    return resolveStageLightingFrame({
      backgroundId: bgItem.id,
      isOutdoor: resolvedOutdoor,
      weather: mergedWeather,
      timestampMs: clockNowMs,
      lightingPreset,
      lightingIntensity,
      theme,
    });
  }, [
    bgItem.id,
    resolvedOutdoor,
    weather,
    effectiveWeather,
    scenarioKey,
    clockNowMs,
    lightingPreset,
    lightingIntensity,
    theme,
  ]);

  const isRain =
    resolvedOutdoor &&
    (effectiveWeather === 'rain' ||
      lightingFrame.opticalRegime === 'rain' ||
      lightingFrame.opticalRegime === 'sunshower');

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty(
      '--stage-backdrop-brightness',
      lightingFrame.backdropBrightness.toFixed(3)
    );
    el.style.setProperty('--stage-light-tint', lightingFrame.backdropTintRgba);
    el.style.setProperty('--stage-night-fixture-glow', lightingFrame.nightFixtureGlowCss);
    el.style.setProperty('--stage-night-dim', lightingFrame.backdropNightDim.toFixed(3));
  }, [lightingFrame]);

  return (
    <div
      ref={rootRef}
      className={[
        'atelier-stage-backdrop',
        'is-infinity-cyclorama',
        'has-arch-backdrop',
        'has-dynamic-lighting',
        isDark ? 'is-dark' : 'is-light',
        resolvedOutdoor ? 'is-outdoor-sky' : 'is-indoor-ivory',
        `is-weather-${effectiveStageWeather}`,
        `is-regime-${lightingFrame.opticalRegime}`,
        `is-tod-${resolvedTod}`,
        lightingFrame.solar.isPostSunset ? 'is-post-sunset' : 'is-daylight-sun',
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
      data-optical-regime={lightingFrame.opticalRegime}
      data-lighting-preset={lightingFrame.preset}
      data-lighting-intensity={String(lightingFrame.intensityPct)}
      data-post-sunset={lightingFrame.solar.isPostSunset ? 'true' : 'false'}
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

      {/* 1B. Outdoor Open-Sky Time-of-Day Wash OR Indoor Daytime Window / Post-Sunset Fixture Wash */}
      {resolvedOutdoor ? (
        <div className="atelier-backdrop-tod-sky" />
      ) : (
        <>
          <div
            className="atelier-indoor-ivory-ambient"
            data-indoor-ivory-light="true"
          />
          <div
            className="atelier-indoor-night-fixture-wash"
            data-indoor-night-fixture={lightingFrame.indoorNightFixture}
          />
        </>
      )}

      {/* 1C. User Kelvin Preset / Composite Atmospheric Tint Layer */}
      <div className="atelier-stage-light-tint-wash" />

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
