import React from 'react';
import type { EffectiveWeatherMode } from '../services/weatherPromptBuilder.ts';

export interface StageGroundDeckProps {
  effectiveWeather: EffectiveWeatherMode;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
  modelImageUrl?: string | null;
  stageMode?: 'ai-vton' | 'flatlay';
  equippedCount?: number;
  mirrorX?: boolean;
  zoom?: number;
  idealBaseScale?: number;
  pan?: { x: number; y: number } | null;
  compareActive?: boolean;
  compareSplitPct?: number;
}

/**
 * Perspective Studio Floor Deck, Contact AO Shadow & Real-Time Wet Mirror Reflection (`StageGroundDeck`)
 * - Positioned across the perspective floor zone (`top: 76% -> 100%`, `z-index: 10`, `pointer-events: none`),
 *   directly behind the RGBA cutout model (`z-20`) and beneath the foreground weather canvas (`z-30`).
 * - Aligns horizon & dual-layer Contact AO Shadow with the normalized `94%` shoe sole baseline so all
 *   8 swipe angles (`0°..315°`) ground naturally onto the studio floor plane without floating or clipping.
 * - `rain`: Wet reflective stone/slate floor + upside-down `scaleY(-0.30)` real-time mirror reflection
 *   (syncing `mirrorX` when viewing mirrored angles) + dense sole Contact AO Shadow.
 * - `coldwave` / `snow`: Frosted ice glaze / accumulated snow sheen + pressed-snow AO shadow.
 * - `clear` / `mild` / `cloudy` / `wind` / `heatwave`: Honed travertine satin floor sheen + warm cove bounce.
 */
export function StageGroundDeck({
  effectiveWeather,
  scenarioKey = 'live',
  theme = 'light',
  modelImageUrl = null,
  stageMode = 'ai-vton',
  equippedCount = 0,
  mirrorX = false,
  zoom = 1,
  idealBaseScale = 1,
  pan = null,
  compareActive = false,
  compareSplitPct = 50,
}: StageGroundDeckProps) {
  if (stageMode !== 'ai-vton') {
    return null;
  }

  const hasModelImage = Boolean(modelImageUrl);

  const deckVariant: 'wet-pavement' | 'frost-snow' | 'runway-studio' =
    effectiveWeather === 'rain'
      ? 'wet-pavement'
      : effectiveWeather === 'coldwave' || effectiveWeather === 'snow'
        ? 'frost-snow'
        : 'runway-studio';

  const safeZoom = Number.isFinite(zoom) ? Math.max(1, Math.min(3, zoom)) : 1;
  const safeBaseScale = Number.isFinite(idealBaseScale)
    ? Math.max(1, Math.min(1.5, idealBaseScale))
    : 1;
  const panX = pan && Number.isFinite(pan.x) ? pan.x : 0;
  const panY = pan && Number.isFinite(pan.y) ? pan.y : 0;
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

  const effectiveCameraScale = safeZoom * safeBaseScale;
  const cameraTransform =
    Math.abs(effectiveCameraScale - 1) > 0.002 || panX !== 0 || panY !== 0
      ? `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${effectiveCameraScale.toFixed(3)})`
      : undefined;

  const wetPlaneSurfaceStyle: React.CSSProperties = isWetPavement
    ? {
        top: '77.5%',
        pointerEvents: 'none',
        background: isDark
          ? 'linear-gradient(180deg, rgba(28, 33, 42, 0.34) 0%, rgba(19, 24, 32, 0.68) 42%, rgba(11, 14, 20, 0.88) 100%)'
          : 'linear-gradient(180deg, rgba(168, 166, 158, 0.18) 0%, rgba(132, 138, 146, 0.36) 44%, rgba(98, 106, 116, 0.52) 100%)',
      }
    : { top: '77.5%', pointerEvents: 'none' };

  const wetHorizonStyle: React.CSSProperties = isWetPavement
    ? {
        height: '1px',
        pointerEvents: 'none',
        background: isDark
          ? 'linear-gradient(90deg, transparent 4%, rgba(186, 220, 255, 0.18) 28%, rgba(255, 244, 214, 0.34) 62%, rgba(186, 220, 255, 0.18) 86%, transparent 98%)'
          : 'linear-gradient(90deg, transparent 4%, rgba(226, 232, 240, 0.34) 28%, rgba(255, 250, 235, 0.62) 62%, rgba(226, 232, 240, 0.32) 86%, transparent 98%)',
      }
    : { pointerEvents: 'none' };

  const wetSheenStyle: React.CSSProperties = isWetPavement
    ? {
        pointerEvents: 'none',
        background: isDark
          ? 'radial-gradient(ellipse 76% 64% at 56% 36%, rgba(255, 228, 174, 0.14) 0%, rgba(148, 197, 255, 0.10) 46%, transparent 84%)'
          : 'radial-gradient(ellipse 76% 64% at 56% 36%, rgba(255, 246, 222, 0.30) 0%, rgba(186, 214, 242, 0.14) 50%, transparent 84%)',
      }
    : { pointerEvents: 'none' };

  const wetReflectionViewportStyle: React.CSSProperties = {
    pointerEvents: 'none',
    clipPath: 'inset(85.5% 0 0 0)',
    WebkitMaskImage:
      'linear-gradient(180deg, transparent 85%, rgba(0, 0, 0, 0.84) 88.5%, rgba(0, 0, 0, 0.38) 94.5%, transparent 99.5%)',
    maskImage:
      'linear-gradient(180deg, transparent 85%, rgba(0, 0, 0, 0.84) 88.5%, rgba(0, 0, 0, 0.38) 94.5%, transparent 99.5%)',
  };

  return (
    <div
      aria-hidden="true"
      data-stage-ground-deck="true"
      data-ground-variant={deckVariant}
      data-ground-weather={effectiveWeather}
      data-ground-scenario={scenarioKey}
      data-ground-theme={theme}
      className={`studio-stage-ground-deck is-${deckVariant} is-weather-${effectiveWeather} is-theme-${theme} ${hasModelImage ? 'has-model' : 'is-ambient-only'} ${equippedCount > 0 ? 'has-left-rail' : ''}`}
      style={rootStyle}
    >
      {/* Perspective Ground Deck Surface */}
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
                style={{
                  pointerEvents: 'none',
                  ...(mirrorX ? { transform: 'scaleX(-1) scaleY(-0.30)' } : {}),
                }}
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
