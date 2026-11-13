import { memo } from 'react';
import { normalizeViewerMode } from '../services/vton2DService.ts';
import Studio2DModelStage from './Studio2DModelStage.jsx';

/**
 * Compatibility wrapper around `Studio2DModelStage`.
 * Defensively normalizes any legacy 3D / 2.5D props (`gender`, `cameraPreset`,
 * `presetNonce`, `onUserOrbit`, `mode="3d"`, etc.) to `'2d-vton'` with zero WebGL or `.glb` loads.
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex = '#DFBA9B',
  personalColor = 'autumn_warm',
  skinProfile = null,
  bodySpec = null,
  user = null,
  personReferenceUrl = null,
  slots = null,
  theme = 'light',
  compact = false,
  afterImageUrl = null,
  beforeImageUrl = null,
  compareActive = false,
  compareSplitPct,
  onCompareSplitChange,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  isLoading = false,
  lang,
  mode,
  viewMode,
  renderMode,
  legacyMode,
  // Legacy 3D/2.5D props accepted and ignored cleanly:
  gender: _legacyGender,
  weather: _legacyWeather,
  cameraPreset: _legacyCameraPreset,
  presetNonce: _legacyPresetNonce,
  onUserOrbit: _legacyOnUserOrbit,
}) {
  void _legacyGender;
  void _legacyWeather;
  void _legacyCameraPreset;
  void _legacyPresetNonce;
  void _legacyOnUserOrbit;

  const normalizedMode = normalizeViewerMode(legacyMode ?? mode ?? viewMode ?? renderMode);

  return (
    <Studio2DModelStage
      skinToneHex={skinToneHex}
      personalColor={personalColor}
      skinProfile={skinProfile}
      bodySpec={bodySpec}
      user={user}
      personReferenceUrl={personReferenceUrl}
      slots={slots}
      theme={theme}
      compact={compact}
      afterImageUrl={afterImageUrl}
      beforeImageUrl={beforeImageUrl}
      compareActive={compareActive}
      compareSplitPct={compareSplitPct}
      onCompareSplitChange={onCompareSplitChange}
      zoom={zoom}
      pan={pan}
      onZoomChange={onZoomChange}
      onPanChange={onPanChange}
      isLoading={isLoading}
      legacyMode={normalizedMode}
      lang={lang}
    />
  );
});

export default Character25DMannequin;
