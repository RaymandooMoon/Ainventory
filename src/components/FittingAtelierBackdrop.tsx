import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_STAGE_BACKGROUND_ID,
  type StageFixtureEmitter,
  type StageLightingPresetId,
  getStageBackgroundById,
} from '../utils/stageBackgroundCatalog.ts';
import {
  type WeatherOpticalInput,
  resolveStageLightingFrame,
} from '../utils/stageLightingEngine.ts';
import { withPublicBaseUrl } from '../utils/nativeBridge.ts';
import {
  computeCoverPhotoFrame,
  computeHeightAwareStageFraming,
} from '../utils/stageFramingEngine.ts';
import type { TimeOfDayPhase } from '../utils/tomorrowPromptPolicy.ts';

function hexToRgbCss(hex: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `${r}, ${g}, ${b}`;
}

function mixWithWarmWhiteRgb(hex: number, whiteWeight = 0.52): string {
  const r = Math.round(((hex >> 16) & 255) * (1 - whiteWeight) + 255 * whiteWeight);
  const g = Math.round(((hex >> 8) & 255) * (1 - whiteWeight) + 250 * whiteWeight);
  const b = Math.round((hex & 255) * (1 - whiteWeight) + 236 * whiteWeight);
  return `${r}, ${g}, ${b}`;
}

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
  heightCm?: number;
}

/**
 * Architectural Stage Room Backdrop (`z-index: 2`) combining:
 * - Equipped S+/S/A+/A/B+/B/C Wide-Angle 24mm Architectural Room or Open-Sky Courtyard photo (`/assets/backgrounds/*.jpg`)
 * - Height-linked dynamic framing (`heightCm` 150..198cm adjusts room scale & eye-level horizon smoothly)
 * - Pixel-locked physical indoor light fixtures (wall sconces, ceiling pin-spots, chandeliers, cove strips, arch uplights)
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
  heightCm = 172,
}: FittingAtelierBackdropProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

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

  const syncStageSize = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = el.clientWidth || rect.width;
    const h = el.clientHeight || rect.height;
    if (w <= 0 || h <= 0) return;
    setStageSize((prev) =>
      Math.abs(prev.width - w) < 0.5 && Math.abs(prev.height - h) < 0.5
        ? prev
        : { width: w, height: h }
    );
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    syncStageSize();
    const rafId = window.requestAnimationFrame(syncStageSize);
    window.addEventListener('resize', syncStageSize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncStageSize);
      ro.observe(el);
    }
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncStageSize);
      ro?.disconnect();
    };
  }, [syncStageSize]);

  const coverFrame = useMemo(
    () => computeCoverPhotoFrame(stageSize.width, stageSize.height, 896 / 1200),
    [stageSize.width, stageSize.height]
  );

  const stageFraming = useMemo(
    () =>
      computeHeightAwareStageFraming({
        heightCm,
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
        isOutdoor: resolvedOutdoor,
      }),
    [heightCm, stageSize.width, stageSize.height, resolvedOutdoor]
  );

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

  const fixtureEmitters: readonly StageFixtureEmitter[] = useMemo(() => {
    if (resolvedOutdoor) return [];
    return bgItem.lightingRig?.fixtureEmitters || [];
  }, [resolvedOutdoor, bgItem.lightingRig]);

  const showFixtureLights =
    !resolvedOutdoor &&
    fixtureEmitters.length > 0 &&
    lightingFrame.fixtureOnFactor > 0.01 &&
    coverFrame.width > 0 &&
    coverFrame.height > 0;

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
    el.style.setProperty('--stage-fixture-on', lightingFrame.fixtureOnFactor.toFixed(3));
  }, [lightingFrame]);

  const hasCoverBox = coverFrame.width > 0 && coverFrame.height > 0;

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
        showFixtureLights ? 'has-lit-fixtures' : '',
        isWarmSpring ? 'is-scenario-warm-spring' : '',
        isLiveForecast ? 'is-scenario-live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-atelier-backdrop="true"
      data-backdrop-style="architectural-stage"
      data-backdrop-bg-id={bgItem.id}
      data-backdrop-bg-tier={bgItem.tier}
      data-backdrop-height-cm={String(stageFraming.clampedHeightCm)}
      data-backdrop-scale={stageFraming.backdropScale.toFixed(3)}
      data-stage-outdoor={resolvedOutdoor ? 'true' : 'false'}
      data-stage-lighting={resolvedOutdoor ? 'outdoor-sky' : 'indoor-ivory'}
      data-optical-regime={lightingFrame.opticalRegime}
      data-lighting-preset={lightingFrame.preset}
      data-lighting-intensity={String(lightingFrame.intensityPct)}
      data-fixture-on-factor={lightingFrame.fixtureOnFactor.toFixed(2)}
      data-post-sunset={lightingFrame.solar.isPostSunset ? 'true' : 'false'}
      data-backdrop-weather={effectiveStageWeather}
      data-backdrop-scenario={resolvedOutdoor ? scenarioKey : 'indoor'}
      data-backdrop-tod={resolvedTod}
      aria-hidden="true"
    >
      {/* 0. Fallback Infinity-Cove Cyclorama Wall-to-Floor Sweep */}
      <div className="atelier-cyclorama-wall-cove" />

      {/* 1. Height-Linked Camera Rig wrapping the 3:4 Architectural Room Photo */}
      <div
        className="atelier-stage-camera-rig"
        style={{
          transformOrigin: stageFraming.backdropTransformOrigin,
          transform: `translate3d(0, ${stageFraming.backdropTranslateYPct.toFixed(2)}%, 0) scale(${stageFraming.backdropScale.toFixed(3)})`,
          transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          className="atelier-photo-cover-frame"
          style={
            hasCoverBox
              ? {
                  left: `${coverFrame.left}px`,
                  top: `${coverFrame.top}px`,
                  width: `${coverFrame.width}px`,
                  height: `${coverFrame.height}px`,
                }
              : undefined
          }
        >
          <img
            src={withPublicBaseUrl(bgItem.imageUrl)}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={syncStageSize}
            className="atelier-stage-environment-photo"
            data-stage-bg-id={bgItem.id}
            data-stage-bg-tier={bgItem.tier}
          />
        </div>
      </div>

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

      {/* 7. Foreground Pixel-Locked Physical Indoor Fixtures (rendered ABOVE milky ambient washes & side vignettes!) */}
      {showFixtureLights && (() => {
        const rigTransformStyle = {
          transformOrigin: stageFraming.backdropTransformOrigin,
          transform: `translate3d(0, ${stageFraming.backdropTranslateYPct.toFixed(2)}%, 0) scale(${stageFraming.backdropScale.toFixed(3)})`,
          transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
        };
        const coverBoxStyle = hasCoverBox
          ? {
              left: `${coverFrame.left}px`,
              top: `${coverFrame.top}px`,
              width: `${coverFrame.width}px`,
              height: `${coverFrame.height}px`,
            }
          : undefined;

        const preparedEmitters = fixtureEmitters.map((emitter) => {
          const activeHex =
            lightingFrame.preset === 'auto' && typeof emitter.kelvinHex === 'number'
              ? emitter.kelvinHex
              : lightingFrame.fixtureHex;
          const fxRgb = hexToRgbCss(activeHex);
          const fxCoreRgb = mixWithWarmWhiteRgb(activeHex, 0.68);
          const power = Math.max(0, lightingFrame.fixtureOnFactor * emitter.intensity);
          // Smooth 0%..100% visibility: unmistakable bright incandescent shade even at 25%..50%, vivid at 100%
          const normPower = Math.min(1.25, power);
          const coreOpacity = Math.min(1, Math.max(0.78, 0.64 + normPower * 0.34));
          const glowOpacity = Math.min(1, Math.max(0.42, 0.16 + normPower * 0.78));
          const glowScale = Math.min(1.24, Math.max(0.7, 0.64 + normPower * 0.46));
          const glowBrightness = Math.min(1.26, Math.max(0.86, 0.78 + normPower * 0.38));

          if (
            emitter.kind === 'cove-strip' &&
            typeof emitter.x2Pct === 'number' &&
            typeof emitter.y2Pct === 'number'
          ) {
            const x1Px = (emitter.xPct / 100) * coverFrame.width;
            const y1Px = (emitter.yPct / 100) * coverFrame.height;
            const x2Px = (emitter.x2Pct / 100) * coverFrame.width;
            const y2Px = (emitter.y2Pct / 100) * coverFrame.height;
            const dx = x2Px - x1Px;
            const dy = y2Px - y1Px;
            const lenPx = Math.hypot(dx, dy);
            const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const bandH = Math.max(14, (emitter.radiusPct / 100) * coverFrame.width * 1.45);
            const washH = Math.max(
              bandH * 1.6,
              ((emitter.washSpanPct || 16) / 100) * coverFrame.height * glowScale
            );
            return {
              emitter,
              isCove: true as const,
              coreOpacity,
              glowOpacity,
              baseStyle: {
                left: `${x1Px.toFixed(1)}px`,
                top: `${y1Px.toFixed(1)}px`,
                width: `${lenPx.toFixed(1)}px`,
                height: `${bandH.toFixed(1)}px`,
                transform: `translate3d(0, -50%, 0) rotate(${angleDeg.toFixed(2)}deg)`,
                ['--fx-rgb' as string]: fxRgb,
                ['--fx-core-rgb' as string]: fxCoreRgb,
                ['--fx-wash-h' as string]: `${washH.toFixed(1)}px`,
                ['--fx-glow-scale' as string]: glowScale.toFixed(3),
                ['--fx-glow-brightness' as string]: glowBrightness.toFixed(3),
              },
            };
          }

          const radiusPx = Math.max(16, (emitter.radiusPct / 100) * coverFrame.width);
          const washPx = Math.max(
            radiusPx * 1.4,
            ((emitter.washSpanPct || 18) / 100) * coverFrame.height * glowScale
          );
          const shadeWPx = Math.max(
            8,
            ((emitter.shadeWidthPct ?? 2.35) / 100) * coverFrame.width
          );
          const shadeHPx = Math.max(
            10,
            ((emitter.shadeHeightPct ?? 2.4) / 100) * coverFrame.height
          );
          const tiltDeg = emitter.tiltDeg || 0;

          return {
            emitter,
            isCove: false as const,
            coreOpacity,
            glowOpacity,
            baseStyle: {
              left: `${emitter.xPct}%`,
              top: `${emitter.yPct}%`,
              width: `${(radiusPx * 2).toFixed(1)}px`,
              height: `${(radiusPx * 2).toFixed(1)}px`,
              ['--fx-rgb' as string]: fxRgb,
              ['--fx-core-rgb' as string]: fxCoreRgb,
              ['--fx-radius-px' as string]: `${(radiusPx * glowScale).toFixed(1)}px`,
              ['--fx-wash-px' as string]: `${washPx.toFixed(1)}px`,
              ['--fx-shade-w' as string]: `${shadeWPx.toFixed(2)}px`,
              ['--fx-shade-h' as string]: `${shadeHPx.toFixed(2)}px`,
              ['--fx-tilt-deg' as string]: `${tiltDeg}deg`,
              ['--fx-glow-scale' as string]: glowScale.toFixed(3),
              ['--fx-glow-brightness' as string]: glowBrightness.toFixed(3),
            },
          };
        });

        return (
          <>
            {/* Pass A (z-index 3, screen blend on rig): Warm wall cones, ambient lamp halos, top/bottom rim bulb spills */}
            <div
              className="atelier-stage-camera-rig atelier-stage-fixtures-glow-rig"
              style={rigTransformStyle}
              data-fixture-lights-active="true"
              data-fixture-layer="glow"
              data-fixture-count={String(fixtureEmitters.length)}
            >
              <div className="atelier-photo-cover-frame" style={coverBoxStyle}>
                <div className="atelier-fixture-lights-layer atelier-fixture-glow-layer">
                  {preparedEmitters.map(({ emitter, isCove, glowOpacity, baseStyle }) => (
                    <div
                      key={`${emitter.id}-glow`}
                      className={`atelier-fixture-emitter is-${emitter.kind} is-glow-pass`}
                      data-fixture-id={emitter.id}
                      data-fixture-kind={emitter.kind}
                      style={{
                        ...baseStyle,
                        opacity: glowOpacity,
                      }}
                    >
                      {isCove && <span className="atelier-fixture-cove-wash" />}
                      {!isCove && emitter.kind === 'sconce' && (
                        <>
                          <span className="atelier-fixture-sconce-cone-up" />
                          <span className="atelier-fixture-sconce-cone-down" />
                          <span className="atelier-fixture-halo" />
                          <span className="atelier-fixture-bulb-spill-top" />
                          <span className="atelier-fixture-bulb-spill" />
                        </>
                      )}
                      {!isCove && emitter.kind === 'spot' && (
                        <>
                          <span className="atelier-fixture-spot-beam" />
                          <span className="atelier-fixture-halo" />
                        </>
                      )}
                      {!isCove && emitter.kind === 'chandelier' && (
                        <>
                          <span className="atelier-fixture-halo" />
                          <span className="atelier-fixture-chandelier-spark" />
                        </>
                      )}
                      {!isCove && emitter.kind === 'uplight' && (
                        <>
                          <span className="atelier-fixture-uplight-cone" />
                          <span className="atelier-fixture-halo" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pass B (z-index 4, normal blend): Unobstructed pure white-hot incandescent lampshade & LED lens cores */}
            <div
              className="atelier-stage-camera-rig atelier-stage-fixtures-core-rig"
              style={rigTransformStyle}
              data-fixture-layer="core"
            >
              <div className="atelier-photo-cover-frame" style={coverBoxStyle}>
                <div className="atelier-fixture-lights-layer atelier-fixture-core-layer">
                  {preparedEmitters.map(({ emitter, isCove, coreOpacity, baseStyle }) => (
                    <div
                      key={`${emitter.id}-core`}
                      className={`atelier-fixture-emitter is-${emitter.kind} is-core-pass`}
                      style={{
                        ...baseStyle,
                        opacity: coreOpacity,
                      }}
                    >
                      {isCove && <span className="atelier-fixture-cove-bar" />}
                      {!isCove && emitter.kind === 'sconce' && (
                        <>
                          <span className="atelier-fixture-shade-core" />
                          <span className="atelier-fixture-shade-rim-hot" />
                        </>
                      )}
                      {!isCove &&
                        (emitter.kind === 'spot' ||
                          emitter.kind === 'chandelier' ||
                          emitter.kind === 'uplight') && (
                          <span className="atelier-fixture-pin-core" />
                        )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
});

export default FittingAtelierBackdrop;
