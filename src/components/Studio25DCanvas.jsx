import { memo, useCallback, useRef, useState } from 'react';
import { CloudRain, Palette, Sun, Wind, X } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { SKIN_TONE_MANNEQUIN_PRESETS } from '../services/skinToneAnalyzer.ts';
import Character25DMannequin from './Character25DMannequin.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

/**
 * 2.5D Studio Fitting Canvas with Tone-Adaptive 2.5D Character & Weather Atmosphere
 * - Renders `Character25DMannequin` shaded dynamically in the user's analyzed `skinToneHex` & `personalColor`
 * - Overlays tomorrow's weather ambient cues (rain mist, breeze, clear studio sunbeam)
 * - Includes quick-switch skin-tone dots + `[피부톤 분석]` pill right on the studio stage
 */
const Studio25DCanvas = memo(function Studio25DCanvas({
  renderResult,
  theme = 'light',
  skinProfile,
  weather,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onQuickSelectPreset,
  onOpenSkinToneModal,
}) {
  const stageRef = useRef(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const handlePointerMove = useCallback((e) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    setPointer({ x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) });
  }, []);

  const resetPointer = useCallback(() => {
    setPointer({ x: 0, y: 0 });
  }, []);

  const layers = renderResult?.layers || [];
  const lighting = renderResult?.lighting;
  const compositeUrl = renderResult?.compositeImageUrl || null;

  const hasTopOrOuter = layers.some((l) => l.slotKey === 'top' || l.slotKey === 'outer');
  const hasBottom = layers.some((l) => l.slotKey === 'bottom');

  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);

  // Pick 5 representative presets across light -> medium -> deep warm/cool for the quick dock
  const quickPresets = [
    SKIN_TONE_MANNEQUIN_PRESETS[0], // 포슬린 쿨
    SKIN_TONE_MANNEQUIN_PRESETS[1], // 봄 웜 아이보리
    SKIN_TONE_MANNEQUIN_PRESETS[2], // 여름 쿨 로즈
    SKIN_TONE_MANNEQUIN_PRESETS[4], // 가을 웜 베이지
    SKIN_TONE_MANNEQUIN_PRESETS[6], // 허니 브론즈
    SKIN_TONE_MANNEQUIN_PRESETS[7], // 딥 에스프레소
  ];

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      ref={stageRef}
      className={`studio-25d-canvas ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`}
      data-fitting-mode={renderResult?.mode || '2.5d-studio'}
      data-equipped-count={layers.length}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={{
        background: lighting?.backdropGradient,
      }}
    >
      {/* Studio Top-Left Key Illumination */}
      <div
        aria-hidden="true"
        className="studio-25d-keylight"
        style={{
          background: lighting?.keyLightGlow,
          transform: `translate3d(${Math.round(pointer.x * 10)}px, ${Math.round(pointer.y * 10)}px, 0)`,
        }}
      />

      {/* Tomorrow Weather Ambient Stage Cues (Rain Streaks / Wind Lines) */}
      {isRainy && <div aria-hidden="true" className="studio-25d-rain-layer" />}
      {isWindy && <div aria-hidden="true" className="studio-25d-wind-layer" />}

      {/* Top Floating Weather Badge on 2.5D Stage */}
      {weather && (
        <div className="studio-25d-weather-badge tabular-nums">
          {isRainy ? (
            <CloudRain size={13} />
          ) : isWindy ? (
            <Wind size={13} />
          ) : (
            <Sun size={13} />
          )}
          <span>
            내일 {weather.cityName || '서울'} · {weather.condition} {weather.tempMin}°/{weather.tempMax}°C
          </span>
        </div>
      )}

      {/* Grounded Floor Contact Shadow */}
      <div
        aria-hidden="true"
        className="studio-25d-floor-shadow"
        style={{
          background: lighting?.floorShadowColor
            ? `radial-gradient(ellipse at center, ${lighting.floorShadowColor} 0%, rgba(0,0,0,0) 72%)`
            : undefined,
          transform: `translate3d(calc(-50% + ${Math.round(-pointer.x * 7)}px), 0, 0)`,
        }}
      />

      {/* Tone-Adaptive 2.5D Studio Character Mannequin */}
      {!compositeUrl && (
        <Character25DMannequin
          skinToneHex={skinProfile?.skinToneHex || '#DFBA9B'}
          personalColor={skinProfile?.personalColor || 'autumn_warm'}
          gender={skinProfile?.gender || 'male'}
          theme={theme}
          hasTopOrOuter={hasTopOrOuter}
          hasBottom={hasBottom}
          pointer={pointer}
        />
      )}

      {/* AI Virtual Try-On Composite Output (when VtonApiFittingRenderer is active) */}
      {compositeUrl ? (
        <img
          src={compositeUrl}
          alt="2.5D Virtual Try-On Look"
          className="studio-25d-vton-composite"
        />
      ) : (
        /* Layered 2.5D Garment Objects Dressed onto the 2.5D Character */
        <div className="studio-25d-layers-stage">
          {layers.map((layer) => {
            const shiftX = Math.round(pointer.x * 7 * layer.parallaxDepth);
            const shiftY = Math.round(pointer.y * 5 * layer.parallaxDepth);
            const isSelectedSlot = activeSlotKey === layer.slotKey;

            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                data-studio-slot={layer.slotKey}
                className={`studio-25d-layer-item ${isSelectedSlot ? 'is-focused' : ''}`}
                onClick={() => onSelectSlot?.(layer.slotKey)}
                style={{
                  left: `${layer.xPct}%`,
                  top: `${layer.yPct}%`,
                  width: `${layer.widthPct}%`,
                  zIndex: layer.zIndex,
                  transform: `translate3d(calc(-50% + ${shiftX}px), calc(-50% + ${shiftY}px), 0) rotate(${layer.rotationDeg}deg)`,
                }}
              >
                <StudioGarmentImage
                  item={layer.garment}
                  allowStorePhoto={Boolean(
                    layer.garment.image_url &&
                      (layer.garment.image_url.startsWith('data:') ||
                        layer.garment.image_url.startsWith('/uploads/'))
                  )}
                  style={{ width: '100%', aspectRatio: '1 / 1' }}
                  imgStyle={{
                    filter: `drop-shadow(0 ${layer.shadowOffsetY}px ${layer.shadowBlurPx}px var(--garment-shadow-ambient)) drop-shadow(0 4px 8px var(--garment-shadow-key))`,
                  }}
                />
                <button
                  type="button"
                  className="studio-25d-layer-remove"
                  aria-label={`${layer.garment.name} 착장 해제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnequipSlot?.(layer.slotKey);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Skin-Tone Quick Switcher & Portrait Skin Analyzer Trigger */}
      <div className="studio-25d-tone-dock" aria-label="2.5D 캐릭터 피부톤 변경">
        <div className="studio-25d-tone-swatches">
          {quickPresets.map((preset) => {
            const active =
              (skinProfile?.skinToneHex || '').toUpperCase() === preset.skinToneHex.toUpperCase();
            return (
              <button
                key={preset.key}
                type="button"
                data-quick-skin-preset={preset.key}
                title={`${preset.shortKo} (${preset.subTypeLabelKo})`}
                aria-label={`${preset.shortKo} 마네킹 톤 적용`}
                className={`studio-tone-dot ${active ? 'is-active' : ''}`}
                style={{ backgroundColor: preset.skinToneHex }}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickSelectPreset?.(preset);
                }}
              />
            );
          })}
        </div>
        <button
          id={CARBON_DOM_CONTRACT.openSkinToneModalBtnId}
          type="button"
          className="studio-tone-analyze-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSkinToneModal?.();
          }}
        >
          <Palette size={13} />
          <span>{skinProfile?.subTypeLabelKo || '피부톤 분석'}</span>
        </button>
      </div>
    </div>
  );
});

export default Studio25DCanvas;
