import { memo, useMemo } from 'react';
import { getMstSwatch } from '../services/monkSkinTone.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  normalizeGenderNeutralProfile,
  normalizeTurnaroundAngleDeg,
  normalizeViewerMode,
} from '../services/vton2DService.ts';
import { getStoredLang } from '../utils/i18n.ts';
import EditorialFlatLayBoard from './EditorialFlatLayBoard.jsx';

const FRAME_LABELS = {
  feminine: { ko: '여성형 프레임', en: 'Feminine Frame' },
  masculine: { ko: '남성형 프레임', en: 'Masculine Frame' },
  androgynous: { ko: '논바이너리·중성', en: 'Androgynous' },
  custom: { ko: '커스텀 체형', en: 'Custom Spec' },
};

/**
 * Zero-Procedural-Drawing Avatar & Fitting Stage Adapter.
 * - `compact={true}` (Profile Avatar Studio): Renders a non-procedural MST Swatch & AvatarSpec Identity Card
 *   (or uploaded portrait photo) with zero `<canvas>` and zero polygon/vector human drawing.
 * - `compact={false}`: Delegates to `EditorialFlatLayBoard`.
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex,
  personalColor,
  skinProfile = null,
  bodySpec = null,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  viewAngleDeg,
  onViewAngleChange,
  personReferenceUrl = null,
  slots = null,
  theme = 'light',
  compact = false,
  afterImageUrl = null,
  beforeImageUrl: _legacyBeforeImageUrl = null,
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
  void _legacyBeforeImageUrl;
  void _legacyGender;
  void _legacyWeather;
  void _legacyCameraPreset;
  void _legacyPresetNonce;
  void _legacyOnUserOrbit;
  void onViewAngleChange;
  void theme;

  const normalizedMode = normalizeViewerMode(legacyMode ?? mode ?? viewMode ?? renderMode);
  const safeAngleDeg = normalizeTurnaroundAngleDeg(viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const resolvedLang = lang === 'en' || lang === 'ko' ? lang : getStoredLang();
  const isEn = resolvedLang === 'en';

  const profile = useMemo(
    () =>
      normalizeGenderNeutralProfile({
        skinToneHex,
        personalColor,
        skinProfile,
        bodySpec,
        user,
        avatarSpec,
        avatarConfigHash,
        personReferenceUrl,
      }),
    [
      skinToneHex,
      personalColor,
      skinProfile,
      bodySpec,
      user,
      avatarSpec,
      avatarConfigHash,
      personReferenceUrl,
    ]
  );

  const mstSwatch = useMemo(
    () =>
      getMstSwatch(
        profile.avatarSpec.appearance.mstLevel,
        profile.avatarSpec.appearance.mstUndertone
      ),
    [profile.avatarSpec.appearance.mstLevel, profile.avatarSpec.appearance.mstUndertone]
  );

  if (compact) {
    const frameKey = profile.avatarSpec.framePreset || 'androgynous';
    const frameLabel =
      FRAME_LABELS[frameKey]?.[isEn ? 'en' : 'ko'] ||
      FRAME_LABELS.androgynous[isEn ? 'en' : 'ko'];

    return (
      <div
        className="studio-2d-model-stage is-compact avatar-spec-identity-card"
        data-avatar-spec-card="true"
        data-viewer-mode={normalizedMode}
        data-skin-hex={profile.skinToneHex.toUpperCase()}
        data-personal-color={profile.personalColor}
        data-height-cm={profile.heightCm}
        data-weight-kg={profile.weightKg}
        data-view-angle={safeAngleDeg}
        data-avatar-hash={profile.avatarConfigHash}
      >
        <div className="avatar-spec-medallion-wrap">
          {profile.portraitDataUrl ? (
            <img
              src={profile.portraitDataUrl}
              alt={isEn ? 'Avatar reference portrait' : '아바타 참조 사진'}
              className="avatar-spec-portrait-img"
              style={{ borderColor: profile.skinToneHex }}
            />
          ) : (
            <div
              className="avatar-mst-swatch-orb"
              aria-hidden="true"
              style={{ backgroundColor: profile.skinToneHex }}
            />
          )}
          <span className="avatar-spec-angle-chip tabular-nums">{safeAngleDeg}°</span>
        </div>

        <div className="avatar-spec-card-meta">
          <span className="avatar-spec-mst-code tabular-nums">{mstSwatch.code}</span>
          <span className="avatar-spec-frame-tag">{frameLabel}</span>
          <span className="avatar-spec-ai-note">
            {isEn ? 'Gemini AI VTON Spec' : 'Gemini AI 피팅 연동'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <EditorialFlatLayBoard
      slots={slots}
      stageMode={afterImageUrl ? 'ai-vton' : 'flatlay'}
      aiImageUrl={afterImageUrl}
      aiLoading={isLoading}
      skinToneHex={skinToneHex}
      personalColor={personalColor}
      skinProfile={skinProfile}
      bodySpec={bodySpec}
      user={user}
      avatarSpec={avatarSpec}
      avatarConfigHash={avatarConfigHash}
      personReferenceUrl={personReferenceUrl}
      viewAngleDeg={safeAngleDeg}
      compareActive={compareActive}
      compareSplitPct={compareSplitPct}
      onCompareSplitChange={onCompareSplitChange}
      zoom={zoom}
      pan={pan}
      onZoomChange={onZoomChange}
      onPanChange={onPanChange}
      legacyMode={normalizedMode}
      lang={resolvedLang}
    />
  );
});

export default Character25DMannequin;
