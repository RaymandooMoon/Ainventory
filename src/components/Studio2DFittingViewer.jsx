import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Columns2,
  Palette,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { SKIN_TONE_MANNEQUIN_PRESETS } from '../services/skinToneAnalyzer.ts';
import {
  normalizeViewerMode,
  synthesize2DVirtualTryOn,
} from '../services/vton2DService.ts';
import { getStoredLang, localizeGarmentName, tr } from '../utils/i18n.ts';
import Studio2DModelStage from './Studio2DModelStage.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import './Studio2DFittingViewer.css';

const ORDERED_SLOT_KEYS = [
  'headwear',
  'neckwear',
  'outer',
  'top',
  'dress',
  'bottom',
  'shoes',
  'accessory',
];

const QUICK_SKIN_PRESETS = [
  SKIN_TONE_MANNEQUIN_PRESETS[0],
  SKIN_TONE_MANNEQUIN_PRESETS[1],
  SKIN_TONE_MANNEQUIN_PRESETS[2],
  SKIN_TONE_MANNEQUIN_PRESETS[4],
  SKIN_TONE_MANNEQUIN_PRESETS[6],
  SKIN_TONE_MANNEQUIN_PRESETS[7],
];

const PRESET_LABEL_EN = {
  porcelain_cool: 'Porcelain Cool',
  spring_ivory: 'Spring Ivory',
  summer_rose: 'Summer Rose',
  warm_vanilla: 'Warm Vanilla',
  autumn_beige: 'Autumn Beige',
  winter_neutral: 'Winter Neutral',
  honey_tan: 'Honey Bronze',
  deep_espresso: 'Deep Espresso',
};

function formatZoomLabel(zoomValue) {
  const rounded = Math.round((Number(zoomValue) || 1) * 10) / 10;
  return `${rounded.toFixed(1)}×`;
}

/**
 * 2D Editorial Virtual Try-On (VTON) Fitting Viewer
 * - Replaces legacy 6-angle 3D camera stage with high-resolution 2D VTON synthesis
 * - Supports 1.0x / 1.8x / 2.5x zoom pill controls, wheel/pinch zoom, drag-to-pan,
 *   and pixel-aligned Before/After split comparison
 * - Preserves all `#studio-25d-canvas`, `[data-studio-slot]`, `#open-body-spec-btn`,
 *   `[data-quick-skin-preset]`, and `#open-skin-tone-modal-btn` DOM contracts
 */
const Studio2DFittingViewer = memo(function Studio2DFittingViewer({
  slots,
  renderResult,
  theme = 'light',
  skinProfile,
  bodySpec,
  user = null,
  weather,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal,
  lang,
  forceRefresh = false,
  mode,
  viewMode,
  renderMode,
  legacyMode,
  // Legacy 3D props accepted & normalized defensively:
  cameraPreset: _legacyCameraPreset,
  presetNonce: _legacyPresetNonce,
  onUserOrbit: _legacyOnUserOrbit,
  gender: _legacyGender,
}) {
  void _legacyCameraPreset;
  void _legacyPresetNonce;
  void _legacyOnUserOrbit;
  void _legacyGender;

  const rawLegacyMode = legacyMode ?? mode ?? viewMode ?? renderMode;
  const viewerMode = normalizeViewerMode(rawLegacyMode);
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const resolvedLang = lang === 'en' || lang === 'ko' ? lang : getStoredLang();

  const [vtonState, setVtonState] = useState(null);
  const [showLoadingUi, setShowLoadingUi] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplitPct, setCompareSplitPct] = useState(50);

  const isInitialMountRef = useRef(true);
  const abortControllerRef = useRef(null);
  const latestInputsRef = useRef({
    slots,
    skinProfile,
    bodySpec,
    user,
    resolvedTheme,
    rawLegacyMode,
    forceRefresh,
  });

  useEffect(() => {
    latestInputsRef.current = {
      slots,
      skinProfile,
      bodySpec,
      user,
      resolvedTheme,
      rawLegacyMode,
      forceRefresh,
    };
  });

  const layers = useMemo(() => {
    if (slots && typeof slots === 'object') {
      const seen = new Set();
      const list = [];
      for (const slotKey of ORDERED_SLOT_KEYS) {
        seen.add(slotKey);
        const garment = slots[slotKey];
        if (garment) {
          list.push({ slotKey, garment });
        }
      }
      for (const [slotKey, garment] of Object.entries(slots)) {
        if (!seen.has(slotKey) && garment) {
          list.push({ slotKey, garment });
        }
      }
      return list;
    }
    return Array.isArray(renderResult?.layers) ? renderResult.layers : [];
  }, [slots, renderResult]);

  const equippedCount = layers.length;
  const effectiveCompareActive = compareActive && equippedCount > 0;

  const synthesisSignature = useMemo(() => {
    const slotSig = layers
      .map(
        ({ slotKey, garment }) =>
          `${slotKey}:${garment.id ?? ''}:${garment.color_hex ?? ''}:${garment.image_url ?? ''}:${garment.subcategory ?? ''}`
      )
      .join('|');
    const skinHex = skinProfile?.skinToneHex || '#DFBA9B';
    const personalColor = skinProfile?.personalColor || 'autumn_warm';
    const h = bodySpec?.heightCm ?? user?.heightCm ?? '';
    const w = bodySpec?.weightKg ?? user?.weightKg ?? '';
    const shape = bodySpec?.bodyShape ?? user?.bodyShape ?? '';
    const sh = bodySpec?.shoulderScale ?? 1;
    const wa = bodySpec?.waistScale ?? 1;
    const hi = bodySpec?.hipScale ?? 1;
    return `${slotSig}::${skinHex}:${personalColor}:${h}:${w}:${shape}:${sh}:${wa}:${hi}:${resolvedTheme}:${forceRefresh ? '1' : '0'}`;
  }, [layers, skinProfile, bodySpec, user, resolvedTheme, forceRefresh]);

  const vtonResult = vtonState?.result || null;
  const loading = !vtonState || vtonState.sig !== synthesisSignature;

  useEffect(() => {
    const targetSig = synthesisSignature;
    let debounceTimer = null;
    let loadingGateTimer = null;
    let midProgressTimer = null;
    let completed = false;

    const clearTimers = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (loadingGateTimer) clearTimeout(loadingGateTimer);
      if (midProgressTimer) clearTimeout(midProgressTimer);
    };

    const executeSynthesis = () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Gate visual skeleton badge by 30ms so memory/local cache hits skip skeleton frames completely
      loadingGateTimer = setTimeout(() => {
        if (completed || controller.signal.aborted) return;
        setShowLoadingUi(true);
        setProgressPct(35);

        midProgressTimer = setTimeout(() => {
          if (completed || controller.signal.aborted) return;
          setProgressPct(72);
        }, 160);
      }, 30);

      const snap = latestInputsRef.current;
      synthesize2DVirtualTryOn({
        slots: snap.slots,
        skinProfile: snap.skinProfile,
        bodySpec: snap.bodySpec,
        user: snap.user,
        theme: snap.resolvedTheme,
        legacyMode: snap.rawLegacyMode,
        signal: controller.signal,
        forceRefresh: snap.forceRefresh,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          completed = true;
          clearTimers();
          setVtonState({ sig: targetSig, result: res });
          setProgressPct(100);
          setShowLoadingUi(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          completed = true;
          clearTimers();
          setVtonState((prev) => ({ sig: targetSig, result: prev?.result || null }));
          setShowLoadingUi(false);
          setProgressPct(0);
        });
    };

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      executeSynthesis();
    } else {
      debounceTimer = setTimeout(executeSynthesis, 90);
    }

    return () => {
      completed = true;
      clearTimers();
      abortControllerRef.current?.abort();
    };
  }, [synthesisSignature]);

  const handleZoomOut = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev > 2.55) return 2.5;
      if (prev > 1.8) return 1.75;
      setPan({ x: 0, y: 0 });
      return 1;
    });
  }, []);

  const handleZoomCycleOrReset = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev > 1.01) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return 1.75;
    });
  }, []);

  const handleZoomIn = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev < 1.7) return 1.75;
      if (prev < 2.45) return 2.5;
      return Math.min(3, Number((prev + 0.5).toFixed(2)));
    });
  }, []);

  const handleToggleCompare = useCallback(
    (e) => {
      e.stopPropagation();
      if (equippedCount === 0) return;
      setCompareActive((prev) => !prev);
    },
    [equippedCount]
  );

  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);

  const afterImageUrl = vtonResult?.afterImageUrl || renderResult?.compositeImageUrl || null;
  const beforeImageUrl = vtonResult?.beforeImageUrl || null;

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      className={`studio-25d-canvas studio-2d-vton-viewer ${isRainy ? 'is-weather-rain' : ''} ${isWindy ? 'is-weather-wind' : ''}`.trim()}
      data-fitting-mode={viewerMode}
      data-equipped-count={equippedCount}
      data-vton-provider={vtonResult?.provider || 'editorial-2d-studio'}
      data-vton-cached={vtonResult?.fromCache ? 'true' : 'false'}
      data-vton-loading={loading ? 'true' : 'false'}
    >
      {/* Subtle Top Key Illumination */}
      <div aria-hidden="true" className="studio-25d-keylight" />

      {/* Studio Cyclorama Horizon Reflection */}
      <div aria-hidden="true" className="studio-25d-cyclorama-floor" />

      {/* Weather Ambient Stage Cues */}
      {isRainy && <div aria-hidden="true" className="studio-25d-rain-layer" />}
      {isWindy && <div aria-hidden="true" className="studio-25d-wind-layer" />}

      {/* Non-Blocking Top Synthesis Progress Bar & Shimmer Badge on Cache Miss */}
      {loading && showLoadingUi && (
        <>
          <div aria-hidden="true" className="studio-vton-progress-track">
            <div
              className="studio-vton-progress-fill"
              style={{ width: `${Math.max(12, progressPct)}%` }}
            />
          </div>
          <div
            className="studio-vton-loading-badge tabular-nums"
            data-vton-loading="true"
            role="status"
            aria-live="polite"
          >
            <span className="studio-vton-loading-dot" aria-hidden="true" />
            <span className="studio-vton-loading-label">2D</span>
          </div>
        </>
      )}

      {/* Top HUD: Zoom Pill Bar + Before/After Compare Toggle + Body Spec Trigger */}
      <div className="studio-stage-top-hud">
        <div className="studio-vton-hud-left">
          <div
            className="studio-vton-zoom-bar"
            role="group"
            aria-label={resolvedLang === 'en' ? 'Zoom controls' : '확대 및 축소'}
          >
            <button
              type="button"
              data-vton-zoom-out="true"
              className="studio-vton-zoom-btn"
              disabled={zoom <= 1.01}
              aria-label={resolvedLang === 'en' ? 'Zoom out' : '축소'}
              onClick={handleZoomOut}
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              data-vton-zoom-level="true"
              className={`studio-vton-zoom-level-btn tabular-nums ${zoom > 1.01 ? 'is-zoomed' : ''}`}
              aria-label={
                resolvedLang === 'en'
                  ? 'Cycle or reset zoom level'
                  : '확대 배율 전환 및 초기화'
              }
              onClick={handleZoomCycleOrReset}
            >
              {formatZoomLabel(zoom)}
            </button>
            <button
              type="button"
              data-vton-zoom-in="true"
              className="studio-vton-zoom-btn"
              disabled={zoom >= 2.99}
              aria-label={resolvedLang === 'en' ? 'Zoom in' : '확대'}
              onClick={handleZoomIn}
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <button
            id="toggle-vton-compare-btn"
            type="button"
            data-vton-compare-btn="true"
            disabled={equippedCount === 0}
            aria-pressed={effectiveCompareActive}
            aria-label={
              resolvedLang === 'en'
                ? 'Toggle before and after outfit comparison'
                : '착장 전후 분할 비교'
            }
            className={`studio-vton-compare-btn ${effectiveCompareActive ? 'is-active' : ''}`}
            onClick={handleToggleCompare}
          >
            <Columns2 size={14} />
            <span className="studio-vton-compare-label">B/A</span>
          </button>
        </div>

        <button
          id="open-body-spec-btn"
          type="button"
          className="studio-body-pill-btn tabular-nums"
          aria-label={tr(
            resolvedLang,
            'editProfileBtn',
            resolvedLang === 'en' ? 'Body & Personal Color' : '체형 설정 열기'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBodyModal?.();
          }}
        >
          <SlidersHorizontal size={12} />
          <span>
            {bodySpec
              ? `${bodySpec.heightCm}·${bodySpec.weightKg}`
              : tr(resolvedLang, 'profileBtn', 'Profile')}
          </span>
        </button>
      </div>

      {/* 2D Editorial Fashion Model & Virtual Try-On Stage */}
      <Studio2DModelStage
        skinToneHex={skinProfile?.skinToneHex || '#DFBA9B'}
        personalColor={skinProfile?.personalColor || 'autumn_warm'}
        skinProfile={skinProfile}
        bodySpec={bodySpec}
        user={user}
        slots={slots}
        theme={resolvedTheme}
        afterImageUrl={afterImageUrl}
        beforeImageUrl={beforeImageUrl}
        compareActive={effectiveCompareActive}
        compareSplitPct={compareSplitPct}
        onCompareSplitChange={setCompareSplitPct}
        zoom={zoom}
        pan={pan}
        onZoomChange={setZoom}
        onPanChange={setPan}
        isLoading={loading}
        legacyMode={viewerMode}
        lang={resolvedLang}
      />

      {/* Left Worn-Slot Chips Dock: Always visible whenever layers.length > 0 */}
      {equippedCount > 0 && (
        <div
          className="studio-worn-slots-dock"
          aria-label={resolvedLang === 'en' ? 'Equipped garments' : '착용 아이템'}
        >
          {layers.map((layer) => {
            const isSelectedSlot = activeSlotKey === layer.slotKey;
            const displayGarmentName = localizeGarmentName(layer.garment.name, resolvedLang);
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
                    resolvedLang === 'en'
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

      {/* Bottom Minimal Skin-Tone Swatch Dock */}
      <div
        className="studio-25d-tone-dock"
        aria-label={resolvedLang === 'en' ? 'Model skin tone' : '모델 피부톤 변경'}
      >
        <div className="studio-25d-tone-swatches">
          {QUICK_SKIN_PRESETS.map((preset) => {
            const active =
              (skinProfile?.skinToneHex || '').toUpperCase() ===
              preset.skinToneHex.toUpperCase();
            const labelText =
              resolvedLang === 'en'
                ? PRESET_LABEL_EN[preset.key] || preset.key
                : preset.shortKo;
            return (
              <button
                key={preset.key}
                type="button"
                data-quick-skin-preset={preset.key}
                title={labelText}
                aria-label={
                  resolvedLang === 'en'
                    ? `Apply ${labelText} skin tone`
                    : `${preset.shortKo} 마네킹 톤 적용`
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
          aria-label={
            resolvedLang === 'en' ? 'Open skin tone analysis' : '피부톤 분석 열기'
          }
          onClick={(e) => {
            e.stopPropagation();
            onOpenSkinToneModal?.();
          }}
        >
          <Palette size={12} />
          <span>{resolvedLang === 'en' ? 'Tone' : '피부톤'}</span>
        </button>
      </div>
    </div>
  );
});

export default Studio2DFittingViewer;
