import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Compass,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  SunMedium,
} from 'lucide-react';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  MAX_LIGHTING_INTENSITY,
  MIN_LIGHTING_INTENSITY,
  STAGE_BACKGROUNDS,
  STAGE_LIGHTING_PRESETS,
  TIER_ORDER,
  clampLightingIntensity,
  getBaseStageTier,
  getStageBackgroundById,
  isPlusStageTier,
  isPlusTierEligibleForDraw,
  normalizeLightingPreset,
  tierToCssSlug,
} from '../utils/stageBackgroundCatalog.ts';
import {
  DEFAULT_PLACE_BACKDROP_PREF,
  PLACE_BACKDROP_BLUR_PRESETS,
  PLACE_BACKDROP_MAX_BLUR_PX,
  PLACE_BACKDROP_MIN_BLUR_PX,
  STREET_VIEW_HEADING_OPTIONS,
  clampPlaceBackdropBlurPx,
  resolveBlurPresetKey,
} from '../services/placeBackdropStore.ts';
import {
  buildPlacePhotoProxyUrl,
  searchDestinationPlacesWithLocation,
} from '../services/mapsClientService.ts';
import { filterPlacesByEyeLevelStreetView } from '../services/streetViewProbeService.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic, withPublicBaseUrl } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * 18-Stage Architectural & Cyberpunk Neon Backdrop + Google Maps Real-Place Backdrop & Spatial Lighting Picker Modal.
 * Lets users toggle real destination Place Photos / Street View with 3-step out-of-focus blur + slider,
 * search strictly for eye-level Street View supported places, equip unlocked architectural stages, and customize lighting.
 */
export default function BackgroundPickerModal({
  open,
  onClose,
  lang = 'ko',
  economyState,
  onSelectBackground,
  onUpdateLighting,
  onOpenStore,
  placeBackdropPref,
  placeBackdropData,
  streetViewUnavailable = false,
  streetViewBillingRequired = false,
  selectedPlaceName = '',
  gpsCoords = null,
  onSelectVerifiedPlace,
  onUpdatePlaceBackdropPref,
  onRefreshPlaceBackdrop,
}) {
  const unlockedSet = new Set(economyState?.unlockedIds || ['c_atelier_plaster']);
  const equippedId = economyState?.equippedBackgroundId || 'c_atelier_plaster';
  const equippedItem = getStageBackgroundById(equippedId);
  const unlockedCount = unlockedSet.size;

  const activePreset = normalizeLightingPreset(economyState?.lightingPreset);
  const activeIntensity = clampLightingIntensity(
    economyState?.lightingIntensity ?? DEFAULT_LIGHTING_INTENSITY
  );
  const isCustomLighting =
    activePreset !== DEFAULT_LIGHTING_PRESET || activeIntensity !== DEFAULT_LIGHTING_INTENSITY;
  const sliderLampPower = Math.max(0, Math.min(1, activeIntensity / 100));
  const sliderLampRgb = (() => {
    if (activePreset !== 'auto') {
      const matched = STAGE_LIGHTING_PRESETS.find((p) => p.id === activePreset);
      if (matched?.tintRgb) return matched.tintRgb;
    }
    const hex = equippedItem.lightingRig?.nightKelvinHex ?? 0xffd292;
    return `${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}`;
  })();

  const rigDescription = equippedItem.lightingRig?.isNeonScene
    ? lang === 'en'
      ? equippedItem.lightingRig.rigNoteEn
      : equippedItem.lightingRig.rigNoteKo
    : equippedItem.isOutdoor
      ? tx(
          lang,
          '오픈 스카이 · 계절별 태양 고도 및 실시간 기상(구름·안개·여우비) 광원 연동',
          'Open-sky · Seasonal sun altitude & live composite weather lighting sync'
        )
      : lang === 'en'
        ? equippedItem.lightingRig?.rigNoteEn ||
          'Daytime window sunlight · Post-sunset interior fixture auto-switch'
        : equippedItem.lightingRig?.rigNoteKo ||
          '낮 시간대 창가 햇빛 이동 · 일몰 후 실내 조명 자동 점등';

  const resolvedPlacePref = placeBackdropPref || DEFAULT_PLACE_BACKDROP_PREF;
  const isPlaceBackdropEnabled = Boolean(resolvedPlacePref.enabled);
  const placeBlurPx = clampPlaceBackdropBlurPx(resolvedPlacePref.blurPx);
  const placeBlurPresetKey = resolveBlurPresetKey(placeBlurPx);
  const placePhotos = Array.isArray(placeBackdropData?.photos) ? placeBackdropData.photos : [];
  const hasPlacePhotos = placePhotos.length > 0;
  const streetViewInfo = placeBackdropData?.streetView || null;
  const effectiveSourceMode =
    resolvedPlacePref.sourceMode === 'street_view' || !hasPlacePhotos
      ? 'street_view'
      : 'place_photo';
  const activePhotoIdx = Math.max(
    0,
    Math.min(Math.max(0, placePhotos.length - 1), resolvedPlacePref.selectedPhotoIndex || 0)
  );
  const activePhotoObj = placePhotos[activePhotoIdx] || null;
  const placeDisplayTitle =
    placeBackdropData?.placeName ||
    selectedPlaceName ||
    tx(lang, '현재 선택 지역', 'Current Location');
  const sourceLabelKo = effectiveSourceMode === 'place_photo' ? '장소 사진' : '눈높이 거리뷰';
  const sourceLabelEn = effectiveSourceMode === 'place_photo' ? 'Place Photo' : 'Eye-Level Street View';

  const [isScrubbingBrightness, setIsScrubbingBrightness] = useState(false);
  const [isScrubbingBlur, setIsScrubbingBlur] = useState(false);

  useEffect(() => {
    if (!open || (!isScrubbingBrightness && !isScrubbingBlur)) return undefined;
    const stopScrubbing = () => {
      setIsScrubbingBrightness(false);
      setIsScrubbingBlur(false);
    };
    window.addEventListener('pointerup', stopScrubbing);
    window.addEventListener('pointercancel', stopScrubbing);
    window.addEventListener('mouseup', stopScrubbing);
    window.addEventListener('touchend', stopScrubbing);
    window.addEventListener('touchcancel', stopScrubbing);
    window.addEventListener('blur', stopScrubbing);
    return () => {
      window.removeEventListener('pointerup', stopScrubbing);
      window.removeEventListener('pointercancel', stopScrubbing);
      window.removeEventListener('mouseup', stopScrubbing);
      window.removeEventListener('touchend', stopScrubbing);
      window.removeEventListener('touchcancel', stopScrubbing);
      window.removeEventListener('blur', stopScrubbing);
    };
  }, [open, isScrubbingBrightness, isScrubbingBlur]);

  const effectiveScrubbing = Boolean(open && (isScrubbingBrightness || isScrubbingBlur));
  const handleModalClose = () => {
    setIsScrubbingBrightness(false);
    setIsScrubbingBlur(false);
    onClose?.();
  };

  const groupedByTier = TIER_ORDER.map((tier) => ({
    tier,
    items: STAGE_BACKGROUNDS.filter((bg) => bg.tier === tier),
  }));

  return (
    <ResponsiveSheetModal
      id="stage-background-picker-modal"
      open={open}
      onClose={handleModalClose}
      lang={lang}
      eyebrow={tx(lang, '스테이지 공간 배경', 'STAGE ENVIRONMENTS')}
      title={tx(lang, '캐릭터 배경 및 광원 설정', 'Stage Background & Lighting')}
      maxWidth={680}
      peekThrough={effectiveScrubbing}
    >
      <div
        className={`stage-bg-picker-root ${effectiveScrubbing ? 'is-lighting-scrubbing' : ''}`.trim()}
        data-bg-picker-modal="true"
        data-lighting-scrubbing={effectiveScrubbing ? 'true' : 'false'}
      >
        {/* Top Equipped Summary & Store Shortcut Bar */}
        <div className="stage-bg-picker-summary">
          <div className="stage-bg-picker-summary-info">
            <span className={`stage-tier-badge is-tier-${tierToCssSlug(equippedItem.tier)}`}>
              {isPlaceBackdropEnabled ? 'MAP' : equippedItem.tier}
            </span>
            <div className="stage-bg-picker-summary-text">
              <strong className="stage-bg-picker-current-name">
                {isPlaceBackdropEnabled
                  ? tx(lang, `실제 장소 · ${placeDisplayTitle}`, `Real Place · ${placeDisplayTitle}`)
                  : lang === 'en'
                    ? equippedItem.nameEn
                    : equippedItem.nameKo}
              </strong>
              <span className="stage-bg-picker-current-meta tabular-nums">
                {isPlaceBackdropEnabled
                  ? tx(
                      lang,
                      `${sourceLabelKo} · 블러 ${placeBlurPx}px · Google Maps`,
                      `${sourceLabelEn} · Blur ${placeBlurPx}px · Google Maps`
                    )
                  : tx(
                      lang,
                      `보유 배경 ${unlockedCount}/${STAGE_BACKGROUNDS.length} · 잔액 ${economyState?.iBalance ?? 0} i`,
                      `${unlockedCount}/${STAGE_BACKGROUNDS.length} Unlocked · ${economyState?.iBalance ?? 0} i`
                    )}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-bg-picker-open-store="true"
            className="btn btn-primary btn-sm"
            onClick={() => {
              triggerHaptic('selection');
              onClose?.();
              onOpenStore?.();
            }}
          >
            <Store size={14} aria-hidden="true" />
            <span>{tx(lang, '배경 스토어', 'Store')}</span>
          </button>
        </div>

        {/* Google Maps Real-Place Out-of-Focus Backdrop Section */}
        {onUpdatePlaceBackdropPref && (
          <section
            className="stage-bg-place-panel"
            data-maps-place-backdrop-panel="true"
            aria-label={tx(lang, 'Google Maps 실제 장소 배경 설정', 'Google Maps real-place backdrop settings')}
          >
            <div className="stage-bg-place-head">
              <div className="stage-bg-place-head-copy">
                <div className="stage-bg-place-title-row">
                  <MapPin size={15} strokeWidth={2.1} aria-hidden="true" />
                  <strong className="stage-bg-place-title">
                    {tx(lang, '실제 장소 배경', 'Real-Place Backdrop')}
                  </strong>
                </div>
                <p className="stage-bg-place-note">
                  {tx(
                    lang,
                    `${placeDisplayTitle} · Google Maps 눈높이 거리뷰·실사 (켜진 상태에서만 장소 변경 시 자동 갱신)`,
                    `${placeDisplayTitle} · Google Maps eye-level Street View & photos (auto-updates only while enabled)`
                  )}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isPlaceBackdropEnabled}
                data-maps-backdrop-toggle="true"
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdatePlaceBackdropPref({ enabled: !isPlaceBackdropEnabled });
                }}
                className={`stage-bg-place-switch ${isPlaceBackdropEnabled ? 'is-on' : ''}`.trim()}
              >
                {isPlaceBackdropEnabled ? tx(lang, '켜짐', 'On') : tx(lang, '꺼짐', 'Off')}
              </button>
            </div>

            {isPlaceBackdropEnabled && (
              <div className="stage-bg-place-body">
                {/* Inline Eye-Level Street View Supported-Only Place Search */}
                {onSelectVerifiedPlace && (
                  <StreetViewOnlyPlaceSearch
                    lang={lang}
                    gpsCoords={gpsCoords}
                    onSelectPlace={(candidate) => {
                      triggerHaptic('medium');
                      onSelectVerifiedPlace(candidate);
                    }}
                  />
                )}

                {/* Source Mode Segmented Tabs: Place Photos / Eye-Level Street View */}
                <div className="stage-bg-place-section">
                  <div className="stage-bg-place-row-head">
                    <span className="stage-bg-place-label">
                      {tx(lang, '배경 소스', 'Backdrop Source')}
                    </span>
                    <span className="stage-bg-place-meta">
                      {tx(lang, sourceLabelKo, sourceLabelEn)}
                    </span>
                  </div>

                  <div
                    className="stage-bg-place-segmented"
                    role="group"
                    aria-label={tx(lang, '배경 이미지 소스 선택', 'Select backdrop image source')}
                  >
                    <button
                      type="button"
                      data-maps-backdrop-source-btn="place_photo"
                      disabled={!hasPlacePhotos}
                      aria-pressed={effectiveSourceMode === 'place_photo'}
                      onClick={() => {
                        if (!hasPlacePhotos) return;
                        triggerHaptic('selection');
                        onUpdatePlaceBackdropPref({ sourceMode: 'place_photo' });
                      }}
                      className={`stage-bg-place-seg-btn ${effectiveSourceMode === 'place_photo' ? 'is-active' : ''}`.trim()}
                    >
                      <Camera size={14} aria-hidden="true" />
                      <span>
                        {tx(lang, '장소 사진', 'Place Photos')}
                        {hasPlacePhotos ? ` (${placePhotos.length})` : ''}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-maps-backdrop-source-btn="street_view"
                      disabled={streetViewUnavailable || streetViewBillingRequired}
                      aria-pressed={
                        effectiveSourceMode === 'street_view' &&
                        !streetViewUnavailable &&
                        !streetViewBillingRequired
                      }
                      onClick={() => {
                        if (streetViewUnavailable || streetViewBillingRequired) return;
                        triggerHaptic('selection');
                        onUpdatePlaceBackdropPref({ sourceMode: 'street_view' });
                      }}
                      className={`stage-bg-place-seg-btn ${effectiveSourceMode === 'street_view' && !streetViewUnavailable && !streetViewBillingRequired ? 'is-active' : ''}`.trim()}
                    >
                      <Compass size={14} aria-hidden="true" />
                      <span>{tx(lang, '눈높이 거리뷰', 'Eye-Level Street')}</span>
                    </button>
                  </div>
                </div>

                {/* Loading / Billing Required / Unavailable / Quota Notices */}
                {placeBackdropData?.loading && (
                  <div className="stage-bg-place-status-box">
                    <span className="stage-bg-place-label">
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      <span>
                        {tx(lang, 'Google Maps 장소 정보를 동기화하는 중…', 'Syncing Google Maps place…')}
                      </span>
                    </span>
                  </div>
                )}

                {!placeBackdropData?.loading && !hasPlacePhotos && streetViewBillingRequired && (
                  <div className="stage-bg-place-status-box" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                    <span>
                      {tx(
                        lang,
                        `${placeDisplayTitle}은(는) 야외 눈높이 거리뷰가 확인되었지만, 현재 연결된 Google Cloud 프로젝트에 결제(Billing)가 활성화되지 않아 Google에서 실시간 거리뷰 렌더링을 차단했습니다.`,
                        `${placeDisplayTitle} has verified outdoor Street View, but Google blocked live rendering because Billing is not enabled on the linked Google Cloud project.`
                      )}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href="https://console.cloud.google.com/project/_/billing/enable?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="stage-bg-place-retry-btn"
                        style={{ textDecoration: 'none', gap: '4px' }}
                      >
                        <span>{tx(lang, 'Google Cloud 결제 설정', 'Enable Cloud Billing')}</span>
                        <ExternalLink size={11} aria-hidden="true" />
                      </a>
                      {onRefreshPlaceBackdrop && (
                        <button
                          type="button"
                          onClick={onRefreshPlaceBackdrop}
                          className="stage-bg-place-retry-btn"
                        >
                          {tx(lang, '다시 확인', 'Retry')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!placeBackdropData?.loading && !hasPlacePhotos && streetViewUnavailable && !streetViewBillingRequired && (
                  <div className="stage-bg-place-status-box">
                    <span>
                      {tx(
                        lang,
                        '이 장소 주변에는 야외 지면 눈높이 거리뷰가 없어 캐릭터 비율이 자연스러운 기본 아틀리에 배경을 유지합니다.',
                        'No outdoor ground-level Street View found near here; keeping your eye-level studio backdrop.'
                      )}
                    </span>
                  </div>
                )}

                {!placeBackdropData?.loading && placeBackdropData?.quotaExceeded && (
                  <div className="stage-bg-place-status-box">
                    <span>{placeBackdropData.error}</span>
                    {onRefreshPlaceBackdrop && (
                      <button
                        type="button"
                        onClick={onRefreshPlaceBackdrop}
                        className="stage-bg-place-retry-btn"
                      >
                        {tx(lang, '다시 시도', 'Retry')}
                      </button>
                    )}
                  </div>
                )}

                {/* Place Photo Thumbnail Selector (up to 5 photos) */}
                {effectiveSourceMode === 'place_photo' && placePhotos.length > 0 && (
                  <div className="stage-bg-place-section">
                    <div className="stage-bg-place-row-head">
                      <span className="stage-bg-place-label">
                        {tx(lang, '장소 구도 선택', 'Select View')}
                      </span>
                      <span className="stage-bg-place-meta tabular-nums">
                        {activePhotoIdx + 1} / {placePhotos.length}
                      </span>
                    </div>
                    <div className="stage-bg-place-thumbs">
                      {placePhotos.map((photo, idx) => {
                        const isSelected = idx === activePhotoIdx;
                        return (
                          <button
                            key={photo.photoName}
                            type="button"
                            data-maps-photo-thumb={String(idx)}
                            aria-pressed={isSelected}
                            aria-label={tx(lang, `장소 사진 ${idx + 1}`, `Place photo ${idx + 1}`)}
                            onClick={() => {
                              triggerHaptic('selection');
                              onUpdatePlaceBackdropPref({
                                sourceMode: 'place_photo',
                                selectedPhotoIndex: idx,
                              });
                            }}
                            className={`stage-bg-place-thumb ${isSelected ? 'is-active' : ''}`.trim()}
                          >
                            <img
                              src={buildPlacePhotoProxyUrl(photo.photoName, 400, 320)}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                            {isSelected && (
                              <span className="stage-bg-place-thumb-check">
                                <Check size={10} strokeWidth={3} aria-hidden="true" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Street View 4-Way Heading Controls */}
                {effectiveSourceMode === 'street_view' && (
                  <div className="stage-bg-place-section">
                    <div className="stage-bg-place-row-head">
                      <span className="stage-bg-place-label">
                        {tx(lang, '거리뷰 시선 방향', 'Street View Heading')}
                      </span>
                      <span className="stage-bg-place-meta">
                        {tx(lang, '야외 지상 눈높이 카메라 기준', 'Outdoor ground-level camera')}
                      </span>
                    </div>
                    <div className="stage-bg-place-chip-grid is-cols-4" role="group">
                      {STREET_VIEW_HEADING_OPTIONS.map((opt) => {
                        const selected = Number(resolvedPlacePref.streetViewHeading || 0) === opt.heading;
                        return (
                          <button
                            key={opt.heading}
                            type="button"
                            data-maps-sv-heading={String(opt.heading)}
                            aria-pressed={selected}
                            onClick={() => {
                              triggerHaptic('selection');
                              onUpdatePlaceBackdropPref({ streetViewHeading: opt.heading });
                            }}
                            className={`stage-bg-place-chip tabular-nums ${selected ? 'is-active' : ''}`.trim()}
                          >
                            {lang === 'en' ? opt.labelEn : opt.labelKo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Out-of-Focus Blur 3-Step Presets */}
                <div className="stage-bg-place-section">
                  <div className="stage-bg-place-row-head">
                    <span className="stage-bg-place-label">
                      <SlidersHorizontal size={13} aria-hidden="true" />
                      <span>{tx(lang, '아웃포커싱 프리셋', 'Out-of-Focus Presets')}</span>
                    </span>
                  </div>

                  <div
                    className="stage-bg-place-chip-grid is-cols-3"
                    role="group"
                    aria-label={tx(lang, '배경 블러 프리셋', 'Backdrop blur presets')}
                  >
                    {PLACE_BACKDROP_BLUR_PRESETS.map((preset) => {
                      const active = placeBlurPresetKey === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          data-maps-blur-preset={preset.key}
                          aria-pressed={active}
                          onClick={() => {
                            triggerHaptic('selection');
                            onUpdatePlaceBackdropPref({ blurPx: preset.blurPx });
                          }}
                          className={`stage-bg-place-chip tabular-nums ${active ? 'is-active' : ''}`.trim()}
                        >
                          {lang === 'en' ? preset.labelEn : preset.labelKo} · {preset.blurPx}px
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Peek-Through Precision Blur Slider */}
                <div
                  className={`stage-bg-place-slider-row ${isScrubbingBlur ? 'is-scrubbing' : ''}`.trim()}
                >
                  <div className="stage-bg-place-row-head">
                    <label htmlFor="maps-backdrop-blur-slider" className="stage-bg-place-label">
                      {tx(lang, '배경 블러 미세 조절', 'Fine Blur')}
                    </label>
                    <output
                      htmlFor="maps-backdrop-blur-slider"
                      data-maps-backdrop-blur-value="true"
                      className="stage-bg-place-label tabular-nums"
                    >
                      {`${placeBlurPx}px`}
                    </output>
                  </div>

                  <input
                    id="maps-backdrop-blur-slider"
                    type="range"
                    data-maps-backdrop-blur-slider="true"
                    className="stage-bg-place-range"
                    min={PLACE_BACKDROP_MIN_BLUR_PX}
                    max={PLACE_BACKDROP_MAX_BLUR_PX}
                    step={1}
                    value={placeBlurPx}
                    onPointerDown={() => setIsScrubbingBlur(true)}
                    onTouchStart={() => setIsScrubbingBlur(true)}
                    onMouseDown={() => setIsScrubbingBlur(true)}
                    onPointerUp={() => setIsScrubbingBlur(false)}
                    onTouchEnd={() => setIsScrubbingBlur(false)}
                    onMouseUp={() => setIsScrubbingBlur(false)}
                    onBlur={() => setIsScrubbingBlur(false)}
                    onChange={(e) => {
                      onUpdatePlaceBackdropPref({ blurPx: Number(e.target.value) });
                    }}
                  />
                </div>

                {/* Google Maps Attribution Line inside Modal */}
                <div className="stage-bg-place-attribution">
                  <strong>Google Maps</strong>
                  {effectiveSourceMode === 'place_photo' &&
                    activePhotoObj?.authorAttributions?.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {tx(lang, '사진:', 'Photo:')}{' '}
                          {activePhotoObj.authorAttributions.map((attr, idx) => (
                            <span key={`${attr.displayName}-${idx}`}>
                              {idx > 0 ? ', ' : ''}
                              {attr.uri ? (
                                <a href={attr.uri} target="_blank" rel="noopener noreferrer">
                                  {attr.displayName}
                                </a>
                              ) : (
                                attr.displayName
                              )}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  {effectiveSourceMode !== 'place_photo' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{streetViewInfo?.copyright || '© Google'}</span>
                      {effectiveSourceMode === 'street_view' && streetViewInfo?.reportProblemLink && (
                        <>
                          <span aria-hidden="true">·</span>
                          <a
                            href={streetViewInfo.reportProblemLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span>{tx(lang, '이미지 문제 신고', 'Report a problem')}</span>
                            <ExternalLink size={10} aria-hidden="true" />
                          </a>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Spatial Lighting Type (Kelvin/Color) & Brightness Controls */}
        <section
          className="stage-bg-lighting-panel"
          data-bg-lighting-controls="true"
          style={{
            '--bg-slider-lamp-power': sliderLampPower.toFixed(3),
            '--bg-slider-lamp-rgb': sliderLampRgb,
          }}
          aria-label={tx(lang, '공간 광원 색상 및 밝기 설정', 'Stage lighting color and brightness')}
        >
          <div className="stage-bg-lighting-head">
            <div className="stage-bg-lighting-title-row">
              <SunMedium size={15} aria-hidden="true" className="stage-bg-lighting-icon" />
              <strong className="stage-bg-lighting-title">
                {tx(lang, '공간 광원 효과', 'Spatial Lighting')}
              </strong>
            </div>
            {isCustomLighting && (
              <button
                type="button"
                data-lighting-reset-btn="true"
                className="stage-bg-lighting-reset-btn"
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateLighting?.({
                    lightingPreset: DEFAULT_LIGHTING_PRESET,
                    lightingIntensity: DEFAULT_LIGHTING_INTENSITY,
                  });
                }}
              >
                <RotateCcw size={12} aria-hidden="true" />
                <span>{tx(lang, '초기화', 'Reset')}</span>
              </button>
            )}
          </div>

          <p className="stage-bg-lighting-note">{rigDescription}</p>

          <div
            className="stage-bg-lighting-preset-grid"
            role="group"
            aria-label={tx(lang, '광원 종류 선택', 'Select light color preset')}
          >
            {STAGE_LIGHTING_PRESETS.map((preset) => {
              const selected = preset.id === activePreset;
              const label = lang === 'en' ? preset.labelEn : preset.labelKo;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-lighting-preset-option={preset.id}
                  aria-pressed={selected}
                  className={`stage-bg-lighting-chip ${selected ? 'is-active' : ''}`.trim()}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateLighting?.({ lightingPreset: preset.id });
                  }}
                >
                  <span
                    className={`stage-bg-lighting-swatch is-preset-${preset.id}`}
                    aria-hidden="true"
                  />
                  <span className="stage-bg-lighting-chip-copy">
                    <span className="stage-bg-lighting-chip-label">{label}</span>
                    <span className="stage-bg-lighting-chip-kelvin tabular-nums">
                      {preset.kelvinLabel}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`stage-bg-lighting-slider-row ${isScrubbingBrightness ? 'is-scrubbing' : ''}`.trim()}
            data-lighting-slider-row="true"
          >
            <div className="stage-bg-lighting-slider-labels">
              <label
                htmlFor="stage-lighting-intensity-slider"
                className="stage-bg-lighting-slider-label"
              >
                {tx(lang, '광원 밝기', 'Light Brightness')}
              </label>
              <output
                htmlFor="stage-lighting-intensity-slider"
                data-lighting-intensity-value="true"
                className="stage-bg-lighting-slider-value tabular-nums"
              >
                {`${activeIntensity}%`}
              </output>
            </div>
            <input
              id="stage-lighting-intensity-slider"
              type="range"
              data-lighting-intensity-slider="true"
              className="stage-bg-lighting-range"
              min={MIN_LIGHTING_INTENSITY}
              max={MAX_LIGHTING_INTENSITY}
              step={5}
              value={activeIntensity}
              onPointerDown={() => setIsScrubbingBrightness(true)}
              onTouchStart={() => setIsScrubbingBrightness(true)}
              onMouseDown={() => setIsScrubbingBrightness(true)}
              onPointerUp={() => setIsScrubbingBrightness(false)}
              onTouchEnd={() => setIsScrubbingBrightness(false)}
              onMouseUp={() => setIsScrubbingBrightness(false)}
              onBlur={() => setIsScrubbingBrightness(false)}
              onChange={(e) => {
                onUpdateLighting?.({ lightingIntensity: Number(e.target.value) });
              }}
            />
          </div>
        </section>

        {/* Tier Sections (S+, S, A+, A, B+, B, C) */}
        <div className="stage-bg-tier-sections">
          {groupedByTier.map(({ tier, items }) => (
            <section key={tier} className="stage-bg-tier-group" data-bg-tier-group={tier}>
              <header className="stage-bg-tier-head">
                <div className="stage-bg-tier-title-wrap">
                  <span className={`stage-tier-badge is-tier-${tierToCssSlug(tier)}`}>{tier}</span>
                  <strong className="stage-bg-tier-label">
                    {tier === 'S+'
                      ? tx(
                          lang,
                          'S+등급 · 오픈 스카이 마스터 플라자 (날씨 효과)',
                          'S+ Tier · Open-Sky Master Plaza (Weather)'
                        )
                      : tier === 'S'
                        ? tx(lang, 'S등급 · 마스터 아틀리에', 'S-Tier · Master Atelier')
                        : tier === 'A+'
                          ? tx(
                              lang,
                              'A+등급 · 오픈 스카이 테라스 (날씨 효과)',
                              'A+ Tier · Open-Sky Terrace (Weather)'
                            )
                          : tier === 'A'
                            ? tx(lang, 'A등급 · 시그니처 살롱', 'A-Tier · Signature Salon')
                            : tier === 'B+'
                              ? tx(
                                  lang,
                                  'B+등급 · 오픈 스카이 코트야드 (날씨 효과)',
                                  'B+ Tier · Open-Sky Courtyard (Weather)'
                                )
                              : tier === 'B'
                                ? tx(lang, 'B등급 · 에디토리얼 테라스', 'B-Tier · Editorial Terrace')
                                : tx(lang, 'C등급 · 베이직 스튜디오', 'C-Tier · Basic Studio')}
                  </strong>
                </div>
                <span className="stage-bg-tier-count tabular-nums">
                  {items.filter((bg) => unlockedSet.has(bg.id)).length}/{items.length}
                </span>
              </header>

              <div className="stage-bg-grid">
                {items.map((bg) => {
                  const unlocked = unlockedSet.has(bg.id);
                  const isEquipped = !isPlaceBackdropEnabled && bg.id === equippedId;
                  const title = lang === 'en' ? bg.nameEn : bg.nameKo;
                  const subtitle = lang === 'en' ? bg.subtitleEn : bg.subtitleKo;
                  const isPlusLocked =
                    !unlocked &&
                    isPlusStageTier(bg.tier) &&
                    !isPlusTierEligibleForDraw(bg.tier, unlockedSet);
                  const baseTierLabel = getBaseStageTier(bg.tier);

                  return (
                    <button
                      key={bg.id}
                      type="button"
                      data-bg-option-id={bg.id}
                      data-bg-tier={bg.tier}
                      data-bg-unlocked={unlocked ? 'true' : 'false'}
                      aria-pressed={isEquipped}
                      className={[
                        'stage-bg-card',
                        isEquipped ? 'is-equipped' : '',
                        !unlocked ? 'is-locked' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        triggerHaptic(unlocked ? 'selection' : 'warning');
                        if (unlocked) {
                          if (isPlaceBackdropEnabled) {
                            onUpdatePlaceBackdropPref?.({ enabled: false });
                          }
                          onSelectBackground?.(bg.id);
                          onClose?.();
                        } else {
                          onClose?.();
                          onOpenStore?.();
                        }
                      }}
                    >
                      <div className="stage-bg-card-media">
                        <img src={withPublicBaseUrl(bg.imageUrl)} alt={title} loading="lazy" />
                        <span className={`stage-tier-badge is-tier-${tierToCssSlug(bg.tier)}`}>
                          {bg.tier}
                        </span>
                        {isEquipped && (
                          <span className="stage-bg-equipped-pill">
                            <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                            <span>{tx(lang, '적용 중', 'Active')}</span>
                          </span>
                        )}
                        {!unlocked && (
                          <span className="stage-bg-lock-overlay" aria-hidden="true">
                            <Lock size={16} />
                            <span>
                              {isPlusLocked
                                ? tx(
                                    lang,
                                    `${baseTierLabel}등급 완성 필요`,
                                    `Complete ${baseTierLabel}-Tier`
                                  )
                                : tx(lang, '스토어 뽑기', 'Draw in Store')}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="stage-bg-card-meta">
                        <strong className="stage-bg-card-title">{title}</strong>
                        <span className="stage-bg-card-sub">{subtitle}</span>
                        {!unlocked && (
                          <span className="stage-bg-card-cta">
                            <Sparkles size={11} aria-hidden="true" />
                            <span>
                              {isPlusLocked
                                ? tx(
                                    lang,
                                    `${baseTierLabel}등급 모두 수집 후 뽑기 등장`,
                                    `Collect all ${baseTierLabel}-Tier first`
                                  )
                                : tx(lang, '뽑기에서 잠금 해제', 'Unlock via Gacha')}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}

function StreetViewOnlyPlaceSearch({ lang = 'ko', gpsCoords = null, onSelectPlace }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [filteredOutCount, setFilteredOutCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (rawVal) => {
    setQuery(rawVal);
    setErrorMsg('');
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = String(rawVal || '').trim();
    if (trimmed.length < 2) {
      seqRef.current += 1;
      setResults([]);
      setFilteredOutCount(0);
      setSearching(false);
      return;
    }

    const reqSeq = ++seqRef.current;
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const candidates = await searchDestinationPlacesWithLocation({
          input: trimmed,
          lang,
          lat: gpsCoords?.lat,
          lng: gpsCoords?.lon,
        });
        if (seqRef.current !== reqSeq) return;
        const verified = await filterPlacesByEyeLevelStreetView(candidates, {
          onlySupported: true,
        });
        if (seqRef.current !== reqSeq) return;
        setResults(verified.places);
        setFilteredOutCount(verified.filteredOutCount);
      } catch (err) {
        if (seqRef.current !== reqSeq) return;
        setResults([]);
        setFilteredOutCount(0);
        setErrorMsg(
          err?.message ||
            tx(lang, '거리뷰 지원 장소 검색에 실패했습니다.', 'Failed to search Street View places.')
        );
      } finally {
        if (seqRef.current === reqSeq) {
          setSearching(false);
        }
      }
    }, 320);
  };

  const trimmed = query.trim();

  return (
    <div className="stage-bg-place-section" data-maps-sv-only-search="true">
      <div className="stage-bg-place-row-head">
        <span className="stage-bg-place-label">
          <Compass size={13} aria-hidden="true" />
          <span>{tx(lang, '눈높이 거리뷰 지원 장소 검색', 'Search Eye-Level Street View Places')}</span>
        </span>
        <span className="stage-bg-place-meta">
          {tx(lang, '야외 거리뷰 확인된 곳만 표시', 'Verified outdoor only')}
        </span>
      </div>

      <div className="stage-bg-place-search-wrap">
        <Search size={14} className="stage-bg-place-search-icon" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={tx(
            lang,
            '예: 성수동 카페거리, 명동, 도쿄 시부야, 파리 샹젤리제…',
            'e.g., Seongsu Cafe Street, Shibuya, Champs-Elysees…'
          )}
          className="stage-bg-place-search-input"
          aria-label={tx(lang, '눈높이 거리뷰 지원 장소 검색', 'Search Street View supported places')}
        />
        {searching && (
          <Loader2
            size={14}
            className="stage-bg-place-search-spinner animate-spin"
            aria-hidden="true"
          />
        )}
      </div>

      {errorMsg && (
        <div className="stage-bg-place-status-box">
          <span>{errorMsg}</span>
        </div>
      )}

      {!searching && !errorMsg && trimmed.length >= 2 && results.length === 0 && (
        <div className="stage-bg-place-status-box">
          <span>
            {filteredOutCount > 0
              ? tx(
                  lang,
                  `검색된 ${filteredOutCount}곳 모두 야외 눈높이 거리뷰 미지원 구역입니다. 도로변·거리 명칭이나 해외 도시로 검색해 보세요.`,
                  `All ${filteredOutCount} matched spots lack outdoor eye-level Street View. Try a street name or avenue.`
                )
              : tx(
                  lang,
                  '눈높이 거리뷰가 확인된 장소가 없습니다.',
                  'No verified eye-level Street View places found.'
                )}
          </span>
        </div>
      )}

      {results.length > 0 && (
        <ul
          className="stage-bg-place-search-results"
          role="listbox"
          aria-label={tx(lang, '눈높이 거리뷰 지원 검색 결과', 'Verified Street View places')}
        >
          {results.map((item) => (
            <li key={item.placeId}>
              <button
                type="button"
                className="stage-bg-place-search-item"
                onClick={() => {
                  onSelectPlace?.(item);
                  setQuery('');
                  setResults([]);
                  setFilteredOutCount(0);
                }}
              >
                <span className="stage-bg-place-search-item-copy">
                  <span className="stage-bg-place-search-item-title">{item.mainText}</span>
                  {item.secondaryText && (
                    <span className="stage-bg-place-search-item-sub">{item.secondaryText}</span>
                  )}
                </span>
                <span className="stage-bg-place-sv-badge">
                  <Compass size={11} aria-hidden="true" />
                  <span>{tx(lang, '눈높이 거리뷰', 'Street View')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

