import { memo, useCallback, useState } from 'react';
import { Palette, SlidersHorizontal, X } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { SKIN_TONE_MANNEQUIN_PRESETS } from '../services/skinToneAnalyzer.ts';
import Character25DMannequin, { CAMERA_VIEW_PRESETS } from './Character25DMannequin.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

const CAMERA_BUTTON_LIST = [
  CAMERA_VIEW_PRESETS.front,
  CAMERA_VIEW_PRESETS.back,
  CAMERA_VIEW_PRESETS.left,
  CAMERA_VIEW_PRESETS.right,
  CAMERA_VIEW_PRESETS.top,
  CAMERA_VIEW_PRESETS.bottom,
];

/**
 * Minimal Apple HIG 360° Character & Outfit Stage
 * - Full Front / Back / Left / Right / Top / Bottom (`앞·뒤·좌·우·상·하`) orbit + drag/zoom
 * - Reflects user's signup gender & anthropometric body shape (`bodySpec`)
 * - Compact left-rail worn-item chips (`[data-studio-slot]`) for 1-tap unequip without obscuring the 3D model
 */
const Studio25DCanvas = memo(function Studio25DCanvas({
  slots,
  renderResult,
  theme = 'light',
  skinProfile,
  bodySpec,
  weather,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal,
}) {
  const [cameraPreset, setCameraPreset] = useState('front');
  const [presetNonce, setPresetNonce] = useState(0);

  const handleSelectCameraPreset = useCallback((presetKey) => {
    setCameraPreset(presetKey);
    setPresetNonce((n) => n + 1);
  }, []);

  const handleUserOrbit = useCallback(() => {
    setCameraPreset((prev) => (prev === 'free' ? prev : 'free'));
  }, []);

  const layers = renderResult?.layers || [];
  const lighting = renderResult?.lighting;
  const compositeUrl = renderResult?.compositeImageUrl || null;

  const currentGender =
    bodySpec?.gender === 'female' || (!bodySpec && skinProfile?.gender === 'female')
      ? 'female'
      : 'male';

  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);

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
      className={`studio-25d-canvas ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`}
      data-fitting-mode={renderResult?.mode || '2.5d-studio'}
      data-equipped-count={layers.length}
      style={{
        background: lighting?.backdropGradient,
      }}
    >
      {/* Subtle Top Key Illumination */}
      <div
        aria-hidden="true"
        className="studio-25d-keylight"
        style={{
          background: lighting?.keyLightGlow,
        }}
      />

      {/* Weather Ambient Stage Cues (Zero Text, Pure Visual Atmosphere) */}
      {isRainy && <div aria-hidden="true" className="studio-25d-rain-layer" />}
      {isWindy && <div aria-hidden="true" className="studio-25d-wind-layer" />}

      {/* Top HUD: 6-Angle Game-Character Camera Pills (`앞·뒤·좌·우·상·하`) + Body Spec Trigger */}
      <div className="studio-stage-top-hud">
        <div
          className="studio-camera-pill-bar"
          role="toolbar"
          aria-label="캐릭터 시점 전환"
        >
          {CAMERA_BUTTON_LIST.map((cam) => {
            const active = cameraPreset === cam.key;
            return (
              <button
                key={cam.key}
                type="button"
                data-camera-preset-btn={cam.key}
                aria-pressed={active}
                aria-label={`${cam.labelKo} 시점 보기`}
                className={`studio-camera-pill ${active ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectCameraPreset(cam.key);
                }}
              >
                {cam.labelKo}
              </button>
            );
          })}
        </div>

        <button
          id="open-body-spec-btn"
          type="button"
          className="studio-body-pill-btn tabular-nums"
          aria-label="체형 설정 열기"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBodyModal?.();
          }}
        >
          <SlidersHorizontal size={12} />
          <span>{bodySpec ? `${bodySpec.heightCm}·${bodySpec.weightKg}` : '체형'}</span>
        </button>
      </div>

      {/* Interactive 360° Parametric Character + Tailored 3D Garments */}
      {compositeUrl ? (
        <img
          src={compositeUrl}
          alt="Virtual Try-On Look"
          className="studio-25d-vton-composite"
        />
      ) : (
        <Character25DMannequin
          skinToneHex={skinProfile?.skinToneHex || '#DFBA9B'}
          personalColor={skinProfile?.personalColor || 'autumn_warm'}
          gender={currentGender}
          bodySpec={bodySpec}
          slots={slots}
          weather={weather}
          cameraPreset={cameraPreset}
          presetNonce={presetNonce}
          onUserOrbit={handleUserOrbit}
          theme={theme}
        />
      )}

      {/* Compact Left Worn-Slot Chips (Quick Inspect / Unequip Without Blocking the 3D Model) */}
      {!compositeUrl && layers.length > 0 && (
        <div className="studio-worn-slots-dock" aria-label="착용 아이템">
          {layers.map((layer) => {
            const isSelectedSlot = activeSlotKey === layer.slotKey;
            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                data-studio-slot={layer.slotKey}
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''}`}
                title={layer.garment.name}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(layer.slotKey);
                }}
              >
                <StudioGarmentImage
                  item={layer.garment}
                  allowStorePhoto={Boolean(
                    layer.garment.image_url &&
                      (layer.garment.image_url.startsWith('data:') ||
                        layer.garment.image_url.startsWith('/uploads/'))
                  )}
                  style={{ width: '100%', height: '100%' }}
                />
                <button
                  type="button"
                  className="studio-worn-slot-remove"
                  aria-label={`${layer.garment.name} 착장 해제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnequipSlot?.(layer.slotKey);
                  }}
                >
                  <X size={10} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Minimal Skin-Tone Swatch Bar */}
      <div className="studio-25d-tone-dock" aria-label="모델 피부톤 변경">
        <div className="studio-25d-tone-swatches">
          {quickPresets.map((preset) => {
            const active =
              (skinProfile?.skinToneHex || '').toUpperCase() === preset.skinToneHex.toUpperCase();
            return (
              <button
                key={preset.key}
                type="button"
                data-quick-skin-preset={preset.key}
                title={preset.shortKo}
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
          aria-label="피부톤 분석 열기"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSkinToneModal?.();
          }}
        >
          <Palette size={12} />
          <span>피부톤</span>
        </button>
      </div>
    </div>
  );
});

export default Studio25DCanvas;
