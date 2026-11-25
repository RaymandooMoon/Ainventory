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
import { computePlaceBackdropOptics } from '../utils/placeBackdropOptics.ts';
import MapsLiveBackdropLayer from './MapsLiveBackdropLayer.tsx';

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

export interface PlaceBackdropVisualProp {
  active: boolean;
  imageUrl: string | null;
  liveMapMode?: 'street_view' | null;
  lat?: number | null;
  lng?: number | null;
  streetViewPanoId?: string | null;
  streetViewHeading?: number;
  blurPx: number;
  sourceMode: 'place_photo' | 'street_view';
  placeName: string;
  onImageError?: () => void;
  onLiveStatusChange?: (status: {
    available: boolean;
    copyright: string | null;
    authFailed?: boolean;
    billingError?: boolean;
  }) => void;
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
  placeBackdrop?: PlaceBackdropVisualProp | null;
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
  placeBackdrop = null,
}: FittingAtelierBackdropProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [committedPlaceImage, setCommittedPlaceImage] = useState<{
    url: string;
    sourceMode: 'place_photo' | 'street_view';
  } | null>(null);
  const [incomingReadyUrl, setIncomingReadyUrl] = useState<string | null>(null);
  const hasLiveMapBackdrop = Boolean(
    placeBackdrop?.active &&
      !placeBackdrop?.imageUrl &&
      placeBackdrop?.liveMapMode &&
      typeof placeBackdrop?.lat === 'number' &&
      Number.isFinite(placeBackdrop.lat) &&
      typeof placeBackdrop?.lng === 'number' &&
      Number.isFinite(placeBackdrop.lng)
  );
  const hasActivePlaceBackdrop = Boolean(
    placeBackdrop?.active && (placeBackdrop?.imageUrl || hasLiveMapBackdrop)
  );
  const placeBlurPx = Math.max(0, Math.min(24, Math.round(Number(placeBackdrop?.blurPx ?? 8))));
  const activeImageUrl = placeBackdrop?.active ? placeBackdrop.imageUrl || null : null;
  const activeSourceMode: 'place_photo' | 'street_view' =
    placeBackdrop?.sourceMode === 'place_photo' ? 'place_photo' : 'street_view';

  useEffect(() => {
    if (!placeBackdrop?.active || !activeImageUrl) {
      setCommittedPlaceImage(null);
      setIncomingReadyUrl(null);
    }
  }, [placeBackdrop?.active, activeImageUrl]);

  const placeOptics = useMemo(
    () =>
      computePlaceBackdropOptics({
        heightCm,
        sourceMode: activeSourceMode,
        blurPx: placeBlurPx,
      }),
    [heightCm, activeSourceMode, placeBlurPx]
  );

  const committedOptics = useMemo(
    () =>
      computePlaceBackdropOptics({
        heightCm,
        sourceMode: committedPlaceImage?.sourceMode ?? activeSourceMode,
        blurPx: placeBlurPx,
      }),
    [heightCm, committedPlaceImage?.sourceMode, activeSourceMode, placeBlurPx]
  );

  const isSameCommittedImage = Boolean(
    activeImageUrl && committedPlaceImage && committedPlaceImage.url === activeImageUrl
  );
  const isIncomingImageReady = Boolean(
    activeImageUrl && (isSameCommittedImage || incomingReadyUrl === activeImageUrl)
  );
  const isBackdropLoading = Boolean(activeImageUrl && !isIncomingImageReady);
  const displayStableImageUrl = isSameCommittedImage
    ? activeImageUrl
    : isIncomingImageReady
      ? activeImageUrl
      : committedPlaceImage?.url || null;

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
    if (resolvedOutdoor && !bgItem.lightingRig?.isNeonScene) return [];
    return bgItem.lightingRig?.fixtureEmitters || [];
  }, [resolvedOutdoor, bgItem.lightingRig]);

  const isNeonScene = Boolean(lightingFrame.isNeonScene || bgItem.lightingRig?.isNeonScene);

  const showFixtureLights =
    !hasActivePlaceBackdrop &&
    fixtureEmitters.length > 0 &&
    lightingFrame.fixtureOnFactor > 0.002 &&
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
    el.style.setProperty(
      '--stage-backdrop-saturate',
      lightingFrame.backdropSaturate.toFixed(3)
    );
    el.style.setProperty('--stage-light-tint', lightingFrame.backdropTintRgba);
    el.style.setProperty('--stage-night-fixture-glow', lightingFrame.nightFixtureGlowCss);
    el.style.setProperty('--stage-night-dim', lightingFrame.backdropNightDim.toFixed(3));
    el.style.setProperty('--stage-fixture-on', lightingFrame.fixtureOnFactor.toFixed(3));
  }, [lightingFrame]);

  const hasCoverBox = coverFrame.width > 0 && coverFrame.height > 0;

  const preparedEmitters = useMemo(() => {
    if (!showFixtureLights) return [];
    return fixtureEmitters.map((emitter) => {
      const isNeonEmitter = emitter.kind === 'neon-tube' || emitter.kind === 'neon-sign';
      let activeHex = lightingFrame.fixtureHex;
      if (typeof emitter.kelvinHex === 'number') {
        if (lightingFrame.preset === 'auto') {
          activeHex = emitter.kelvinHex;
        } else if (isNeonEmitter) {
          // Keep distinct multi-color neon signage identity while tinting 38% toward user preset
          const rA = (emitter.kelvinHex >> 16) & 255;
          const gA = (emitter.kelvinHex >> 8) & 255;
          const bA = emitter.kelvinHex & 255;
          const rB = (lightingFrame.fixtureHex >> 16) & 255;
          const gB = (lightingFrame.fixtureHex >> 8) & 255;
          const bB = lightingFrame.fixtureHex & 255;
          activeHex =
            (Math.round(rA * 0.62 + rB * 0.38) << 16) |
            (Math.round(gA * 0.62 + gB * 0.38) << 8) |
            Math.round(bA * 0.62 + bB * 0.38);
        }
      }
      const fxRgb = hexToRgbCss(activeHex);
      const fxCoreRgb = mixWithWarmWhiteRgb(activeHex, isNeonEmitter ? 0.78 : 0.68);
      const power = Math.max(0, lightingFrame.fixtureOnFactor * emitter.intensity);
      // Calibrated ~3x luminous output at 100% while preserving internal bulb depth
      // and lampshade rib/edge texture.
      const fullPowerRef = isNeonEmitter ? 0.88 : 0.82;
      const normPower = Math.min(1.18, power / fullPowerRef);
      const t = Math.min(1, normPower);
      const coreOpacity = isNeonEmitter
        ? Math.min(1.0, Math.pow(t, 0.85) * 1.0)
        : Math.min(1.0, Math.pow(t, 0.88) * 1.0);
      const glowOpacity = isNeonEmitter
        ? Math.min(1.0, Math.pow(t, 0.92) * 1.0)
        : Math.min(0.96, Math.pow(t, 0.96) * 0.96);
      const glowScale = isNeonEmitter
        ? Math.min(1.36, 0.64 + t * 0.7)
        : Math.min(1.34, 0.62 + t * 0.72);
      const glowBrightness = isNeonEmitter
        ? Math.min(1.52, 0.9 + t * 0.62)
        : Math.min(1.62, 0.92 + t * 0.7);

      const isLinear =
        (emitter.kind === 'cove-strip' ||
          emitter.kind === 'bar-sconce' ||
          emitter.kind === 'neon-tube') &&
        typeof emitter.x2Pct === 'number' &&
        typeof emitter.y2Pct === 'number';

      if (isLinear) {
        const x1Px = (emitter.xPct / 100) * coverFrame.width;
        const y1Px = (emitter.yPct / 100) * coverFrame.height;
        const x2Px = ((emitter.x2Pct as number) / 100) * coverFrame.width;
        const y2Px = ((emitter.y2Pct as number) / 100) * coverFrame.height;
        const dx = x2Px - x1Px;
        const dy = y2Px - y1Px;
        const lenPx = Math.hypot(dx, dy);
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const bandH = Math.max(12, (emitter.radiusPct / 100) * coverFrame.width * 1.35);
        const washH = Math.max(
          bandH * 1.5,
          ((emitter.washSpanPct || 16) / 100) * coverFrame.height * glowScale
        );
        return {
          emitter,
          isLinear: true as const,
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
      const shadeWPx = Math.max(8, ((emitter.shadeWidthPct ?? 2.35) / 100) * coverFrame.width);
      const shadeHPx = Math.max(10, ((emitter.shadeHeightPct ?? 2.4) / 100) * coverFrame.height);
      const tiltDeg = emitter.tiltDeg || 0;

      return {
        emitter,
        isLinear: false as const,
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
  }, [
    showFixtureLights,
    fixtureEmitters,
    lightingFrame.fixtureHex,
    lightingFrame.preset,
    lightingFrame.fixtureOnFactor,
    coverFrame.width,
    coverFrame.height,
  ]);

  const rigTransformStyle = useMemo(
    () => ({
      transformOrigin: stageFraming.backdropTransformOrigin,
      transform: `translate3d(0, ${stageFraming.backdropTranslateYPct.toFixed(2)}%, 0) scale(${stageFraming.backdropScale.toFixed(3)})`,
      transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
    }),
    [
      stageFraming.backdropTransformOrigin,
      stageFraming.backdropTranslateYPct,
      stageFraming.backdropScale,
    ]
  );

  const coverBoxStyle = useMemo(
    () =>
      hasCoverBox
        ? {
            left: `${coverFrame.left}px`,
            top: `${coverFrame.top}px`,
            width: `${coverFrame.width}px`,
            height: `${coverFrame.height}px`,
          }
        : undefined,
    [hasCoverBox, coverFrame.left, coverFrame.top, coverFrame.width, coverFrame.height]
  );

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
        isNeonScene ? 'is-neon-scene' : '',
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
      data-stage-neon={isNeonScene ? 'true' : 'false'}
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
      <div className="atelier-stage-camera-rig" style={rigTransformStyle}>
        <div className="atelier-photo-cover-frame" style={coverBoxStyle}>
          <img
            src={withPublicBaseUrl(bgItem.imageUrl)}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority={hasActivePlaceBackdrop ? 'low' : 'high'}
            onLoad={syncStageSize}
            className="atelier-stage-environment-photo"
            data-stage-bg-id={bgItem.id}
            data-stage-bg-tier={bgItem.tier}
          />
        </div>
      </div>

      {/* 1A. Live Google Maps Eye-Level Real-Place Out-of-Focus Backdrop Layer (Client UI Overlay Only — Never Sent to AI VTON) */}
      {hasActivePlaceBackdrop && activeImageUrl && (
        <div
          className="absolute inset-0 z-[2] overflow-hidden pointer-events-none"
          data-maps-place-backdrop="true"
          data-maps-backdrop-source={activeSourceMode}
          data-maps-backdrop-blur={String(placeOptics.blurPx)}
          data-maps-backdrop-loading={isBackdropLoading ? 'true' : 'false'}
        >
          {/* Buffer A: Committed stable backdrop stays visible beneath incoming image (zero blank flash on place/heading change) */}
          {committedPlaceImage && committedPlaceImage.url !== activeImageUrl && (
            <img
              src={committedPlaceImage.url}
              alt=""
              draggable={false}
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover motion-reduce:transition-none"
              style={{
                opacity: 1,
                objectPosition: committedOptics.objectPosition,
                filter:
                  committedOptics.blurPx > 0 ? `blur(${committedOptics.blurPx}px)` : 'none',
                transform: `translate3d(0, 0, 0) scale(${committedOptics.edgeBleedScale})`,
                transformOrigin: committedOptics.transformOrigin,
                transition:
                  'filter 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                willChange: 'filter, transform',
              }}
            />
          )}

          {/* Buffer B: Active/Incoming backdrop fades smoothly over Buffer A once decoded */}
          <img
            key={activeImageUrl}
            src={activeImageUrl}
            alt={placeBackdrop?.placeName ? `${placeBackdrop.placeName} backdrop` : ''}
            draggable={false}
            decoding="async"
            fetchPriority="high"
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const imgEl = e.currentTarget;
              const commitLoaded = () => {
                setIncomingReadyUrl(activeImageUrl);
                setCommittedPlaceImage({
                  url: activeImageUrl,
                  sourceMode: activeSourceMode,
                });
              };
              if (typeof imgEl.decode === 'function') {
                imgEl.decode().then(commitLoaded, commitLoaded);
              } else {
                commitLoaded();
              }
            }}
            onError={() => {
              setIncomingReadyUrl(null);
              placeBackdrop?.onImageError?.();
            }}
            className="absolute inset-0 w-full h-full object-cover motion-reduce:transition-none"
            style={{
              opacity: isIncomingImageReady ? 1 : 0,
              objectPosition: placeOptics.objectPosition,
              filter: placeOptics.blurPx > 0 ? `blur(${placeOptics.blurPx}px)` : 'none',
              transform: `translate3d(0, 0, 0) scale(${placeOptics.edgeBleedScale})`,
              transformOrigin: placeOptics.transformOrigin,
              transition:
                'opacity 220ms ease-out, filter 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'filter, transform, opacity',
            }}
          />

          {/* Natural f/2.0 optical depth-of-field ground focus taper near avatar shoes (~72%..100%) */}
          {displayStableImageUrl && placeOptics.blurPx >= 4 && (
            <img
              src={displayStableImageUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none motion-reduce:transition-none"
              style={{
                opacity: 0.72,
                objectPosition: placeOptics.objectPosition,
                filter:
                  placeOptics.groundFocusBlurPx > 0
                    ? `blur(${placeOptics.groundFocusBlurPx}px)`
                    : 'none',
                transform: `translate3d(0, 0, 0) scale(${placeOptics.edgeBleedScale})`,
                transformOrigin: placeOptics.transformOrigin,
                maskImage:
                  'linear-gradient(180deg, transparent 0%, transparent 68%, rgba(0,0,0,0.48) 84%, rgba(0,0,0,0.88) 100%)',
                WebkitMaskImage:
                  'linear-gradient(180deg, transparent 0%, transparent 68%, rgba(0,0,0,0.48) 84%, rgba(0,0,0,0.88) 100%)',
                transition:
                  'filter 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out',
                willChange: 'filter, transform',
              }}
            />
          )}

          {/* Subtle top/bottom legibility scrim keeping real street asphalt visible under shoes */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isDark
                ? 'linear-gradient(180deg, rgba(10,12,16,0.28) 0%, rgba(10,12,16,0.04) 34%, rgba(18,20,24,0.08) 70%, rgba(22,24,30,0.48) 86%, rgba(16,18,22,0.72) 100%)'
                : 'linear-gradient(180deg, rgba(15,18,24,0.18) 0%, rgba(255,255,255,0.02) 34%, rgba(224,226,232,0.08) 70%, rgba(222,224,230,0.48) 86%, rgba(208,211,218,0.72) 100%)',
            }}
          />
        </div>
      )}

      {hasLiveMapBackdrop &&
        placeBackdrop?.liveMapMode === 'street_view' &&
        typeof placeBackdrop.lat === 'number' &&
        typeof placeBackdrop.lng === 'number' && (
          <div
            className="absolute inset-0 z-[2] overflow-hidden pointer-events-none"
            data-maps-place-backdrop="true"
            data-maps-backdrop-source="street_view"
            data-maps-backdrop-blur={String(placeOptics.blurPx)}
          >
            <MapsLiveBackdropLayer
              key={`${placeBackdrop.lat}|${placeBackdrop.lng}|${placeBackdrop.streetViewPanoId ?? ''}`}
              lat={placeBackdrop.lat}
              lng={placeBackdrop.lng}
              panoId={placeBackdrop.streetViewPanoId ?? null}
              heading={placeBackdrop.streetViewHeading ?? 0}
              blurPx={placeOptics.blurPx}
              heightCm={heightCm}
              theme={theme}
              onStatusChange={placeBackdrop.onLiveStatusChange}
            />
          </div>
        )}

      {/* 1B. Outdoor Open-Sky Time-of-Day Wash OR Indoor Daytime Window / Post-Sunset Fixture Wash */}
      {resolvedOutdoor ? (
        <>
          <div className="atelier-backdrop-tod-sky" />
          {isNeonScene && (
            <div
              className="atelier-indoor-night-fixture-wash"
              data-indoor-night-fixture={lightingFrame.indoorNightFixture}
            />
          )}
        </>
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

      {/* 7. Foreground Pixel-Locked Physical Fixtures & Cyberpunk Neon Signage (rendered ABOVE ambient washes!) */}
      {showFixtureLights && (
        <>
            {/* Pass A (z-index 3, screen blend on rig): Warm wall cones, pendant halos, chandelier shimmer & neon chromatic blooms */}
            <div
              className="atelier-stage-camera-rig atelier-stage-fixtures-glow-rig"
              style={rigTransformStyle}
              data-fixture-lights-active="true"
              data-fixture-layer="glow"
              data-fixture-count={String(fixtureEmitters.length)}
            >
              <div className="atelier-photo-cover-frame" style={coverBoxStyle}>
                <div className="atelier-fixture-lights-layer atelier-fixture-glow-layer">
                  {preparedEmitters.map(({ emitter, isLinear, glowOpacity, baseStyle }) => (
                    <div
                      key={`${emitter.id}-glow`}
                      className={`atelier-fixture-emitter is-${emitter.kind} is-glow-pass${emitter.shadeOptics ? ` is-optics-${emitter.shadeOptics}` : ''}`}
                      data-fixture-id={emitter.id}
                      data-fixture-kind={emitter.kind}
                      data-fixture-optics={emitter.shadeOptics || 'default'}
                      style={{
                        ...baseStyle,
                        opacity: glowOpacity,
                      }}
                    >
                      {isLinear && emitter.kind === 'cove-strip' && (
                        <span className="atelier-fixture-cove-wash" />
                      )}
                      {isLinear && emitter.kind === 'bar-sconce' && (
                        <span className="atelier-fixture-bar-wash" />
                      )}
                      {isLinear && emitter.kind === 'neon-tube' && (
                        <span className="atelier-fixture-neon-tube-bloom" />
                      )}
                      {!isLinear && emitter.kind === 'sconce' && (
                        <>
                          <span className="atelier-fixture-sconce-cone-up" />
                          <span className="atelier-fixture-sconce-cone-down" />
                          <span className="atelier-fixture-halo" />
                          <span className="atelier-fixture-bulb-spill-top" />
                          <span className="atelier-fixture-bulb-spill" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'pendant' && (
                        <>
                          <span className="atelier-fixture-pendant-cone" />
                          <span className="atelier-fixture-halo" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'spot' && (
                        <>
                          <span className="atelier-fixture-spot-beam" />
                          <span className="atelier-fixture-halo" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'chandelier' && (
                        <>
                          <span className="atelier-fixture-halo" />
                          <span className="atelier-fixture-chandelier-spark" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'uplight' && (
                        <span className="atelier-fixture-uplight-cone" />
                      )}
                      {!isLinear && emitter.kind === 'neon-sign' && (
                        <>
                          <span className="atelier-fixture-neon-sign-bloom" />
                          <span className="atelier-fixture-halo" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pass B (z-index 4, normal blend): Unobstructed crisp backlit shades, alabaster bars, globes, crystal candles & neon cores */}
            <div
              className="atelier-stage-camera-rig atelier-stage-fixtures-core-rig"
              style={rigTransformStyle}
              data-fixture-layer="core"
            >
              <div className="atelier-photo-cover-frame" style={coverBoxStyle}>
                <div className="atelier-fixture-lights-layer atelier-fixture-core-layer">
                  {preparedEmitters.map(({ emitter, isLinear, coreOpacity, baseStyle }) => (
                    <div
                      key={`${emitter.id}-core`}
                      className={`atelier-fixture-emitter is-${emitter.kind} is-core-pass${emitter.shadeOptics ? ` is-optics-${emitter.shadeOptics}` : ''}`}
                      data-fixture-optics={emitter.shadeOptics || 'default'}
                      style={{
                        ...baseStyle,
                        opacity: coreOpacity,
                      }}
                    >
                      {isLinear && emitter.kind === 'cove-strip' && (
                        <span className="atelier-fixture-cove-bar" />
                      )}
                      {isLinear && emitter.kind === 'bar-sconce' && (
                        <span className="atelier-fixture-bar-core" />
                      )}
                      {isLinear && emitter.kind === 'neon-tube' && (
                        <span className="atelier-fixture-neon-tube-core" />
                      )}
                      {!isLinear && emitter.kind === 'sconce' && (
                        <>
                          <span className="atelier-fixture-shade-core" />
                          <span className="atelier-fixture-bulb-filament" />
                          <span className="atelier-fixture-shade-rim-hot" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'pendant' && (
                        <>
                          <span className="atelier-fixture-pendant-core" />
                          <span className="atelier-fixture-bulb-filament" />
                          <span className="atelier-fixture-pendant-aperture-rim" />
                        </>
                      )}
                      {!isLinear && emitter.kind === 'chandelier' && (
                        <span className="atelier-fixture-chandelier-candles" />
                      )}
                      {!isLinear && emitter.kind === 'spot' && (
                        <span className="atelier-fixture-pin-core" />
                      )}
                      {!isLinear && emitter.kind === 'uplight' && (
                        <span className="atelier-fixture-uplight-base" />
                      )}
                      {!isLinear && emitter.kind === 'neon-sign' && (
                        <span className="atelier-fixture-neon-sign-core" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </>
      )}
    </div>
  );
});

export default FittingAtelierBackdrop;
