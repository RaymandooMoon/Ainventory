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

  const clipStyle: React.CSSProperties | undefined =
    compareActive && hasModelImage
      ? { clipPath: `inset(0 0 0 ${safeSplit.toFixed(2)}%)` }
      : undefined;

  const cameraTransform =
    safeZoom > 1.001
      ? `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${safeZoom.toFixed(3)})`
      : undefined;

  return (
    <div
      aria-hidden="true"
      data-stage-ground-deck="true"
      data-ground-variant={deckVariant}
      data-ground-weather={effectiveWeather}
      data-ground-theme={theme}
      className={`studio-stage-ground-deck is-${deckVariant} is-weather-${effectiveWeather} is-theme-${theme} ${hasModelImage ? 'has-model' : 'is-ambient-only'} ${equippedCount > 0 ? 'has-left-rail' : ''}`}
      style={clipStyle}
    >
      {/* Perspective Ground Deck Surface (bottom 22% of stage; horizon line at 78% height) */}
      <div className="studio-ground-plane-surface">
        <div className="studio-ground-horizon-line" />
        <div className="studio-ground-perspective-sheen" />
        {deckVariant === 'wet-pavement' && <div className="studio-ground-wet-streaks" />}
        {deckVariant === 'frost-snow' && <div className="studio-ground-frost-glaze" />}
      </div>

      {/* Real-time Wet Pavement Mirror Reflection (`rain` mode + transparent cutout model) */}
      {effectiveWeather === 'rain' && hasModelImage && modelImageUrl && (
        <div
          data-wet-mirror-reflection="true"
          className="studio-ground-wet-reflection-viewport"
        >
          <div className="studio-ground-wet-reflection-box">
            <div
              className="studio-ground-wet-reflection-camera"
              style={cameraTransform ? { transform: cameraTransform } : undefined}
            >
              <img
                src={modelImageUrl}
                alt=""
                draggable={false}
                className="studio-wet-mirror-reflection-img"
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
          style={cameraTransform ? { transform: cameraTransform } : undefined}
        />
      )}
    </div>
  );
}

export default StageGroundDeck;
