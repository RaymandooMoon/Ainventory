import { memo, useCallback, useState } from 'react';
import { Palette, SlidersHorizontal, X } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { CAMERA_VIEW_PRESETS } from '../services/parametricAvatar3D.ts';
import { SKIN_TONE_MANNEQUIN_PRESETS } from '../services/skinToneAnalyzer.ts';
import { localizeGarmentName, tx } from '../utils/i18n.ts';
import Character25DMannequin from './Character25DMannequin.jsx';
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
 */
const Studio25DCanvas = memo(function Studio25DCanvas({
  slots,
  renderResult,
  theme = 'light',
  lang = 'ko',
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
    SKIN_TONE_MANNEQUIN_PRESETS[0],
    SKIN_TONE_MANNEQUIN_PRESETS[1],
    SKIN_TONE_MANNEQUIN_PRESETS[2],
    SKIN_TONE_MANNEQUIN_PRESETS[4],
    SKIN_TONE_MANNEQUIN_PRESETS[6],
    SKIN_TONE_MANNEQUIN_PRESETS[7],
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

      {/* Studio Cyclorama Horizon Reflection */}
      <div aria-hidden="true" className="studio-25d-cyclorama-floor" />

      {/* Weather Ambient Stage Cues */}
      {isRainy && <div aria-hidden="true" className="studio-25d-rain-layer" />}
      {isWindy && <div aria-hidden="true" className="studio-25d-wind-layer" />}

      {/* Top HUD: 6-Angle Game-Character Camera Pills + Body Profile Trigger */}
      <div className="studio-stage-top-hud">
        <div
          className="studio-camera-pill-bar"
          role="toolbar"
          aria-label={tx(lang, '캐릭터 시점 전환', 'Character Camera Angles')}
        >
          {CAMERA_BUTTON_LIST.map((cam) => {
            const active = cameraPreset === cam.key;
            const camLabel = lang === 'en' ? cam.labelEn : cam.labelKo;
            return (
              <button
                key={cam.key}
                type="button"
                data-camera-preset-btn={cam.key}
                aria-pressed={active}
                aria-label={
                  lang === 'en' ? `${camLabel} camera view` : `${cam.labelKo} 시점 보기`
                }
                className={`studio-camera-pill ${active ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectCameraPreset(cam.key);
                }}
              >
                {camLabel}
              </button>
            );
          })}
        </div>

        <button
          id="open-body-spec-btn"
          type="button"
          className="studio-body-pill-btn tabular-nums"
          aria-label={tx(lang, '체형 설정 열기', 'Open Body Profile')}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBodyModal?.();
          }}
        >
          <SlidersHorizontal size={12} />
          <span>
            {bodySpec ? `${bodySpec.heightCm}·${bodySpec.weightKg}` : tx(lang, '체형', 'Body')}
          </span>
        </button>
      </div>

      {/* Interactive 360° Parametric Character + Tailored Garments */}
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
          lang={lang}
        />
      )}

      {/* Compact Left Worn-Slot Chips */}
      {!compositeUrl && layers.length > 0 && (
        <div
          className="studio-worn-slots-dock"
          aria-label={tx(lang, '착용 아이템', 'Equipped Items')}
        >
          {layers.map((layer) => {
            const isSelectedSlot = activeSlotKey === layer.slotKey;
            const displayGarmentName = localizeGarmentName(layer.garment.name, lang);
            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                data-studio-slot={layer.slotKey}
                className={`studio-worn-slot-chip ${isSelectedSlot ? 'is-focused' : ''}`}
                title={displayGarmentName}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(layer.slotKey);
                }}
              >
                <StudioGarmentImage
                  item={layer.garment}
                  alt={displayGarmentName}
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
                  aria-label={
                    lang === 'en'
                      ? `Remove ${displayGarmentName}`
                      : `${layer.garment.name} 착장 해제`
                  }
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
      <div
        className="studio-25d-tone-dock"
        aria-label={tx(lang, '모델 피부톤 변경', 'Change Mannequin Skin Tone')}
      >
        <div className="studio-25d-tone-swatches">
          {quickPresets.map((preset) => {
            const active =
              (skinProfile?.skinToneHex || '').toUpperCase() ===
              preset.skinToneHex.toUpperCase();
            const label = lang === 'en' ? preset.shortEn : preset.shortKo;
            return (
              <button
                key={preset.key}
                type="button"
                data-quick-skin-preset={preset.key}
                title={label}
                aria-label={
                  lang === 'en' ? `Apply ${label} tone` : `${preset.shortKo} 마네킹 톤 적용`
                }
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
          aria-label={tx(lang, '피부톤 분석 열기', 'Open Skin Tone Analyzer')}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSkinToneModal?.();
          }}
        >
          <Palette size={12} />
          <span>{tx(lang, '피부톤', 'Skin Tone')}</span>
        </button>
      </div>
    </div>
  );
});

export default Studio25DCanvas;
