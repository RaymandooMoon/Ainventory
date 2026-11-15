import React from 'react';
import type { EffectiveWeatherMode } from '../services/weatherPromptBuilder.ts';

export interface StageGroundDeckProps {
  effectiveWeather: EffectiveWeatherMode;
  theme?: 'light' | 'dark';
  modelImageUrl?: string | null;
  stageMode?: 'ai-vton' | 'flatlay';
  equippedCount?: number;
  zoom?: number;
  pan?: { x: number; y: number } | null;
  compareActive?: boolean;
  compareSplitPct?: number;
}

/**
 * Perspective Studio / Street Ground Plane & Real-Time Wet Mirror Reflection Layer (`StageGroundDeck`)
 * - Positioned in the bottom ~22–25% of the stage (`top: 77.5% -> 100%`, `z-index: 10`, `pointer-events: none`),
 *   directly behind the RGBA cutout model (`z-20`) and beneath the foreground weather canvas (`z-30`).
 * - `rain`: Wet dark asphalt/slate reflective pavement + upside-down `scaleY(-0.32)` + `blur(4px)` +
 *   vertical `linear-gradient` alpha-masked real-time mirror reflection of the model's boots & trouser hem +
 *   dense elliptical Contact AO Shadow.
 * - `coldwave` / `snow`: Frosted ice glaze / accumulated fine snowpack ground deck + pressed-snow AO shadow.
 * - `clear` / `cloudy` / `wind` / `heatwave`: Luxury runway studio matte-satin cyclorama horizon + foot AO shadow.
 */
export function StageGroundDeck({
  effectiveWeather,
  theme = 'light',
  modelImageUrl = null,
  stageMode = 'ai-vton',
  equippedCount = 0,
  zoom = 1,
  pan = null,
  compareActive = false,
  compareSplitPct = 50,
}: StageGroundDeckProps) {
  if (stageMode !== 'ai-vton') {
    return null;
  }

  const hasModelImage = Boolean(modelImageUrl);
  const isWeatherGroundActive =
    hasModelImage ||
    effectiveWeather === 'rain' ||
    effectiveWeather === 'snow' ||
    effectiveWeather === 'coldwave';

  if (!isWeatherGroundActive) {
    return null;
  }

  const deckVariant: 'wet-pavement' | 'frost-snow' | 'runway-studio' =
    effectiveWeather === 'rain'
      ? 'wet-pavement'
      : effectiveWeather === 'coldwave' || effectiveWeather === 'snow'
        ? 'frost-snow'
        : 'runway-studio';

  const safeZoom = Number.isFinite(zoom) ? Math.max(1, Math.min(3, zoom)) : 1;
  const panX = safeZoom > 1.001 && pan && Number.isFinite(pan.x) ? pan.x : 0;
  const panY = safeZoom > 1.001 && pan && Number.isFinite(pan.y) ? pan.y : 0;
  const safeSplit = Number.isFinite(compareSplitPct)
    ? Math.max(8, Math.min(92, compareSplitPct))
    : 50;

  const isDark = theme === 'dark';
  const isWetPavement = deckVariant === 'wet-pavement';

  const rootStyle: React.CSSProperties = {
    pointerEvents: 'none',
    ...(compareActive && hasModelImage
      ? { clipPath: `inset(0 0 0 ${safeSplit.toFixed(2)}%)` }
      : {}),
  };

  const cameraTransform =
    safeZoom > 1.001
      ? `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${safeZoom.toFixed(3)})`
      : undefined;

  const wetPlaneSurfaceStyle: React.CSSProperties = isWetPavement
    ? {
        top: '83.5%',
        pointerEvents: 'none',
        background: isDark
          ? 'linear-gradient(180deg, rgba(24, 30, 40, 0.56) 0%, rgba(15, 20, 28, 0.88) 28%, rgba(8, 11, 16, 0.97) 100%)'
          : 'linear-gradient(180deg, rgba(164, 162, 156, 0.22) 0%, rgba(126, 130, 136, 0.44) 28%, rgba(92, 98, 106, 0.62) 100%)',
      }
    : { pointerEvents: 'none' };

  const wetHorizonStyle: React.CSSProperties = isWetPavement
    ? {
        height: '1px',
        pointerEvents: 'none',
        background: isDark
          ? 'linear-gradient(90deg, transparent 4%, rgba(148, 197, 255, 0.22) 26%, rgba(224, 242, 254, 0.42) 50%, rgba(148, 197, 255, 0.22) 74%, transparent 96%)'
          : 'linear-gradient(90deg, transparent 4%, rgba(226, 232, 240, 0.36) 26%, rgba(255, 255, 255, 0.62) 50%, rgba(226, 232, 240, 0.36) 74%, transparent 96%)',
      }
    : { pointerEvents: 'none' };

  const wetSheenStyle: React.CSSProperties = isWetPavement
    ? {
        pointerEvents: 'none',
        background: isDark
          ? 'radial-gradient(ellipse 74% 68% at 50% 42%, rgba(148, 197, 255, 0.16) 0%, rgba(30, 58, 138, 0.07) 56%, transparent 86%)'
          : 'radial-gradient(ellipse 74% 68% at 50% 42%, rgba(255, 255, 255, 0.28) 0%, rgba(186, 214, 242, 0.12) 54%, transparent 86%)',
      }
    : { pointerEvents: 'none' };

  const wetReflectionViewportStyle: React.CSSProperties = {
    pointerEvents: 'none',
    clipPath: 'inset(84% 0 0 0)',
    WebkitMaskImage:
      'linear-gradient(180deg, transparent 83.5%, rgba(0, 0, 0, 0.82) 86.5%, rgba(0, 0, 0, 0.4) 93.5%, transparent 99%)',
    maskImage:
      'linear-gradient(180deg, transparent 83.5%, rgba(0, 0, 0, 0.82) 86.5%, rgba(0, 0, 0, 0.4) 93.5%, transparent 99%)',
  };

  return (
    <div
      aria-hidden="true"
      data-stage-ground-deck="true"
      data-ground-variant={deckVariant}
      data-ground-weather={effectiveWeather}
      data-ground-theme={theme}
      className={`studio-stage-ground-deck is-${deckVariant} is-weather-${effectiveWeather} is-theme-${theme} ${hasModelImage ? 'has-model' : 'is-ambient-only'} ${equippedCount > 0 ? 'has-left-rail' : ''}`}
      style={rootStyle}
    >
      {/* Perspective Ground Deck Surface (wet-pavement aligned with bottom-15% ripple zone) */}
      <div className="studio-ground-plane-surface" style={wetPlaneSurfaceStyle}>
        <div className="studio-ground-horizon-line" style={wetHorizonStyle} />
        <div className="studio-ground-perspective-sheen" style={wetSheenStyle} />
        {isWetPavement && (
          <div
            className="studio-ground-wet-streaks"
            data-wet-ripple-zone-sheen="true"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {deckVariant === 'frost-snow' && (
          <div className="studio-ground-frost-glaze" style={{ pointerEvents: 'none' }} />
        )}
      </div>

      {/* Real-time Wet Pavement Mirror Reflection (`rain` mode + transparent cutout model) */}
      {effectiveWeather === 'rain' && hasModelImage && modelImageUrl && (
        <div
          data-wet-mirror-reflection="true"
          className="studio-ground-wet-reflection-viewport"
          style={wetReflectionViewportStyle}
        >
          <div className="studio-ground-wet-reflection-box" style={{ pointerEvents: 'none' }}>
            <div
              className="studio-ground-wet-reflection-camera"
              style={{
                pointerEvents: 'none',
                ...(cameraTransform ? { transform: cameraTransform } : {}),
              }}
            >
              <img
                src={modelImageUrl}
                alt=""
                draggable={false}
                className="studio-wet-mirror-reflection-img"
                style={{ pointerEvents: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Grounded Elliptical Contact AO Shadow directly beneath model shoes */}
      {hasModelImage && (
        <div
          data-ground-ao-shadow="true"
          className="studio-ground-contact-ao-shadow"
          style={{
            pointerEvents: 'none',
            ...(cameraTransform ? { transform: cameraTransform } : {}),
          }}
        />
      )}
    </div>
  );
}

export default StageGroundDeck;
