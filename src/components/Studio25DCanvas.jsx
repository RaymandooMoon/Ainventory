import { memo } from 'react';
import { normalizeViewerMode } from '../services/vton2DService.ts';
import Studio2DFittingViewer from './Studio2DFittingViewer.jsx';
import './Studio2DFittingViewer.css';

/**
 * Compatibility wrapper delegating `#studio-25d-canvas` directly to `Studio2DFittingViewer`.
 * Defensively normalizes any legacy 3D / 2.5D props (`mode`, `viewMode`, `renderMode`,
 * `cameraPreset`, `presetNonce`, `onUserOrbit`, `gender`) to `'2d-vton'`.
 */
const Studio25DCanvas = memo(function Studio25DCanvas({
  slots,
  renderResult,
  theme = 'light',
  skinProfile,
  bodySpec,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  viewAngleDeg,
  onViewAngleChange,
  weather,
  scenarioKey,
  locationLabel,
  onOpenWeatherPopup,
  weatherPopupOpen = false,
  recommendations = [],
  activeRecId = null,
  lookStyleConfig = null,
  onApplyRecommendation,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
  onRestoreHistorySlots,
  onQuickSelectPreset,
  onOpenSkinToneModal,
  onOpenBodyModal,
  lang,
  forceRefresh = false,
  forceRefreshNonce = 0,
  mode,
  viewMode,
  renderMode,
  legacyMode,
  cameraPreset,
  presetNonce,
  onUserOrbit,
  gender,
}) {
  const normalizedMode = normalizeViewerMode(legacyMode ?? mode ?? viewMode ?? renderMode);

  return (
    <Studio2DFittingViewer
      slots={slots}
      renderResult={renderResult}
      theme={theme}
      skinProfile={skinProfile}
      bodySpec={bodySpec}
      user={user}
      avatarSpec={avatarSpec}
      avatarConfigHash={avatarConfigHash}
      viewAngleDeg={viewAngleDeg}
      onViewAngleChange={onViewAngleChange}
      weather={weather}
      scenarioKey={scenarioKey}
      locationLabel={locationLabel}
      onOpenWeatherPopup={onOpenWeatherPopup}
      weatherPopupOpen={weatherPopupOpen}
      recommendations={recommendations}
      activeRecId={activeRecId}
      lookStyleConfig={lookStyleConfig}
      onApplyRecommendation={onApplyRecommendation}
      activeSlotKey={activeSlotKey}
      onSelectSlot={onSelectSlot}
      onUnequipSlot={onUnequipSlot}
      onRestoreHistorySlots={onRestoreHistorySlots}
      onQuickSelectPreset={onQuickSelectPreset}
      onOpenSkinToneModal={onOpenSkinToneModal}
      onOpenBodyModal={onOpenBodyModal}
      lang={lang}
      forceRefresh={forceRefresh}
      forceRefreshNonce={forceRefreshNonce}
      legacyMode={normalizedMode}
      cameraPreset={cameraPreset}
      presetNonce={presetNonce}
      onUserOrbit={onUserOrbit}
      gender={gender}
    />
  );
});

export default Studio25DCanvas;
