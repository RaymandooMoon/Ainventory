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
  onToggleGender,
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

  const topLayer = layers.find((l) => l.slotKey === 'top') || null;
  const outerLayer = layers.find((l) => l.slotKey === 'outer') || null;
  const bottomLayer = layers.find((l) => l.slotKey === 'bottom') || null;
  const shoesLayer = layers.find((l) => l.slotKey === 'shoes') || null;

  const topCat = String(topLayer?.garment?.category || '').toLowerCase();
  const topSub = String(topLayer?.garment?.subcategory || '').toLowerCase();
  const topName = String(topLayer?.garment?.name || '');

  const isDress =
    Boolean(topLayer) &&
    (topCat === 'dress' ||
      topCat === 'onepiece' ||
      topSub === 'dress' ||
      topSub === 'onepiece' ||
      /원피스|드레스/.test(topName));

  const isShortSleeveOnly =
    !outerLayer &&
    Boolean(topLayer) &&
    !isDress &&
    (topSub === 'tshirt' ||
      topSub === 'polo' ||
      topSub === 'sleeveless' ||
      /반팔|티셔츠|폴로|슬리브리스|나시/.test(topName));

  const botSub = String(bottomLayer?.garment?.subcategory || '').toLowerCase();
  const botName = String(bottomLayer?.garment?.name || '');
  const isSkirtOrShorts =
    Boolean(bottomLayer) &&
    (botSub === 'skirt' ||
      botSub === 'shorts' ||
      /스커트|치마|쇼츠|반바지/.test(botName));

  const hasTopOrOuter = Boolean(topLayer || outerLayer);
  const hasBottom = Boolean(bottomLayer);
  const hasShoes = Boolean(shoesLayer);
  const currentGender = skinProfile?.gender === 'female' ? 'female' : 'male';

  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);

  // Pick 6 representative presets across light -> medium -> deep warm/cool for the quick dock
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

      {/* Top-Right 1-Tap Male/Female 2.5D Fashion Model Switcher */}
      <button
        type="button"
        data-quick-gender-toggle={currentGender}
        className="studio-gender-toggle-btn"
        title={currentGender === 'female' ? '여성 모델 (클릭 시 남성 전환)' : '남성 모델 (클릭 시 여성 전환)'}
        aria-label="스튜디오 모델 성별 전환"
        onClick={(e) => {
          e.stopPropagation();
          onToggleGender?.();
        }}
      >
        {currentGender === 'female' ? '여성 모델 ⇄' : '남성 모델 ⇄'}
      </button>

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

      {/* Tone-Adaptive 2.5D Studio Fashion Model */}
      {!compositeUrl && (
        <Character25DMannequin
          skinToneHex={skinProfile?.skinToneHex || '#DFBA9B'}
          personalColor={skinProfile?.personalColor || 'autumn_warm'}
          gender={currentGender}
          theme={theme}
          hasTopOrOuter={hasTopOrOuter}
          hasOuter={Boolean(outerLayer)}
          isShortSleeveOnly={isShortSleeveOnly}
          isDress={isDress}
          hasBottom={hasBottom}
          isSkirtOrShorts={isSkirtOrShorts}
          hasShoes={hasShoes}
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
      <div className="studio-25d-tone-dock" aria-label="2.5D 모델 피부톤 변경">

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
