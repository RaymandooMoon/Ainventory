import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { MoveHorizontal, Sparkles } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { getMstSwatch } from '../services/monkSkinTone.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  normalizeGenderNeutralProfile,
  normalizeTurnaroundAngleDeg,
  normalizeViewerMode,
  normalizeVtonStyleMode,
  computeOutfitComboId,
} from '../services/vton2DService.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
import StudioGarmentImage from './StudioGarmentImage.jsx';

const SLOT_EDITORIAL_PRIORITY = {
  outer: 1,
  onepiece: 2,
  dress: 2,
  top: 3,
  bottom: 4,
  shoes: 5,
  headwear: 6,
  neckwear: 7,
  accessory: 8,
};

const SLOT_BADGE_LABELS = {
  outer: { ko: 'OUTER', en: 'OUTER' },
  top: { ko: 'TOP', en: 'TOP' },
  onepiece: { ko: 'ONE-PIECE', en: 'ONE-PIECE' },
  dress: { ko: 'DRESS', en: 'DRESS' },
  bottom: { ko: 'BOTTOM', en: 'BOTTOM' },
  shoes: { ko: 'SHOES', en: 'SHOES' },
  accessory: { ko: 'ACC', en: 'ACC' },
  headwear: { ko: 'HEADWEAR', en: 'HEADWEAR' },
  neckwear: { ko: 'NECKWEAR', en: 'NECKWEAR' },
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes balanced SSENSE / luxury editorial lookbook placements (`left%`, `top%`, `width%`, `height%`)
 * for 1..8 equipped garments. Every cell uses `object-fit: contain` so original aspect ratios
 * and high-resolution fabric details are 100% preserved with zero distortion.
 */
function computeFlatLayPlacements(layers) {
  const ordered = [...layers].sort((a, b) => {
    const pa = SLOT_EDITORIAL_PRIORITY[a.slotKey] ?? 99;
    const pb = SLOT_EDITORIAL_PRIORITY[b.slotKey] ?? 99;
    return pa - pb;
  });

  const count = ordered.length;
  if (count === 0) return [];

  if (count === 1) {
    return [
      {
        ...ordered[0],
        box: { left: 13, top: 12, width: 74, height: 74, zIndex: 4 },
      },
    ];
  }

  if (count === 2) {
    return [
      {
        ...ordered[0],
        box: { left: 4, top: 9, width: 54, height: 64, zIndex: 4 },
      },
      {
        ...ordered[1],
        box: { left: 45, top: 28, width: 51, height: 62, zIndex: 5 },
      },
    ];
  }

  if (count === 3) {
    return [
      {
        ...ordered[0],
        box: { left: 4, top: 8, width: 49, height: 52, zIndex: 4 },
      },
      {
        ...ordered[1],
        box: { left: 49, top: 9, width: 47, height: 51, zIndex: 5 },
      },
      {
        ...ordered[2],
        box: { left: 22, top: 61, width: 56, height: 31, zIndex: 6 },
      },
    ];
  }

  if (count === 4) {
    return [
      {
        ...ordered[0],
        box: { left: 4, top: 8, width: 45, height: 44, zIndex: 4 },
      },
      {
        ...ordered[1],
        box: { left: 51, top: 8, width: 45, height: 43, zIndex: 5 },
      },
      {
        ...ordered[2],
        box: { left: 4, top: 53, width: 46, height: 39, zIndex: 6 },
      },
      {
        ...ordered[3],
        box: { left: 52, top: 55, width: 44, height: 36, zIndex: 7 },
      },
    ];
  }

  if (count === 5) {
    return [
      {
        ...ordered[0],
        box: { left: 3, top: 8, width: 45, height: 44, zIndex: 4 },
      },
      {
        ...ordered[1],
        box: { left: 50, top: 8, width: 46, height: 38, zIndex: 5 },
      },
      {
        ...ordered[2],
        box: { left: 4, top: 53, width: 44, height: 39, zIndex: 6 },
      },
      {
        ...ordered[3],
        box: { left: 50, top: 47, width: 46, height: 24, zIndex: 7 },
      },
      {
        ...ordered[4],
        box: { left: 52, top: 72, width: 42, height: 21, zIndex: 8 },
      },
    ];
  }

  // 6+ items: crisp 2-column magazine grid
  const cols = 2;
  const rows = Math.ceil(count / cols);
  const usableTop = 8;
  const usableHeight = 84;
  const rowH = usableHeight / rows;

  return ordered.map((entry, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      ...entry,
      box: {
        left: col === 0 ? 4 : 51,
        top: Number((usableTop + row * rowH).toFixed(2)),
        width: 45,
        height: Number(Math.max(18, rowH - 2).toFixed(2)),
        zIndex: 4 + idx,
      },
    };
  });
}

const FlatLayLookbookSurface = memo(function FlatLayLookbookSurface({
  placements,
  activeSlotKey,
  onSelectSlot,
  resolvedLang,
  mstSwatch,
  heightCm,
  weightKg,
  angleDeg,
  asPrimaryStageTarget,
  transformStyle,
}) {
  const isEn = resolvedLang === 'en';

  return (
    <div
      className="editorial-flatlay-board"
      data-flatlay-board="true"
      data-flatlay-count={placements.length}
      data-vton-after-img={asPrimaryStageTarget ? 'true' : undefined}
      style={transformStyle}
    >
      {/* Subtle Editorial Masthead inside Styling Board */}
      <div className="editorial-flatlay-header" aria-hidden="true">
        <span className="editorial-flatlay-kicker">
          {isEn ? 'FLAT-LAY LOOKBOOK' : 'FLAT-LAY LOOKBOOK'}
        </span>
        <span className="editorial-flatlay-meta tabular-nums">
          <span
            className="editorial-flatlay-mst-dot"
            style={{ backgroundColor: mstSwatch.hex }}
          />
          <span>
            {heightCm}·{weightKg} · {angleDeg}°
          </span>
        </span>
      </div>

      {placements.length === 0 ? (
        <div className="editorial-flatlay-empty" data-flatlay-empty="true">
          <div
            className="editorial-flatlay-empty-swatch"
            style={{ backgroundColor: mstSwatch.hex }}
            aria-hidden="true"
          />
          <p className="editorial-flatlay-empty-title">
            {isEn ? 'Editorial Flat-Lay Styling Board' : '에디토리얼 플랫레이 룩북 보드'}
          </p>
          <p className="editorial-flatlay-empty-desc">
            {isEn
              ? 'Tap garments in your wardrobe to compose a zero-latency lookbook or run Gemini AI Try-On.'
              : '옷장에서 아이템을 선택하면 원본 비율 그대로 즉시 배치되며, AI 피팅으로 다각도 착장을 생성할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div className="editorial-flatlay-collage">
          {placements.map((entry) => {
            const { slotKey, garment, box } = entry;
            const isSelected = activeSlotKey === slotKey;
            const displayName =
              isEn && garment.name_en
                ? garment.name_en
                : localizeGarmentName(garment.name, resolvedLang);
            const slotBadge =
              SLOT_BADGE_LABELS[slotKey]?.[isEn ? 'en' : 'ko'] || slotKey.toUpperCase();
            const allowStorePhoto = Boolean(
              garment.image_url &&
                (garment.image_url.startsWith('data:') ||
                  garment.image_url.startsWith('/uploads/') ||
                  garment.image_url.startsWith('blob:'))
            );

            return (
              <div
                key={`${slotKey}-${garment.id}`}
                role="button"
                tabIndex={0}
                data-flatlay-item-slot={slotKey}
                data-flatlay-item-id={garment.id}
                aria-label={`${slotBadge}: ${displayName}`}
                className={`editorial-flatlay-item ${isSelected ? 'is-selected' : ''}`}
                style={{
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                  zIndex: box.zIndex,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot?.(slotKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectSlot?.(slotKey);
                  }
                }}
              >
                <div className="editorial-flatlay-cutout-wrap">
                  <StudioGarmentImage
                    item={garment}
                    alt={displayName}
                    allowStorePhoto={allowStorePhoto}
                    className="editorial-flatlay-garment-media"
                    style={{ width: '100%', height: '100%' }}
                    imgStyle={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <span className="editorial-flatlay-caption">
                  <span className="editorial-flatlay-slot-tag">{slotBadge}</span>
                  <span className="editorial-flatlay-item-name">{displayName}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

const CuratorialSpecSheet = memo(function CuratorialSpecSheet({
  placements,
  resolvedLang,
  mstSwatch,
  profile,
  transformStyle,
}) {
  const isEn = resolvedLang === 'en';
  const bmi = (
    profile.weightKg / Math.pow(Math.max(1.2, profile.heightCm / 100), 2)
  ).toFixed(1);

  return (
    <div
      className="editorial-spec-compare-sheet"
      data-flatlay-spec-sheet="true"
      style={transformStyle}
    >
      <div className="editorial-spec-header">
        <span className="editorial-flatlay-kicker">
          {isEn ? 'CURATION & AVATAR SPEC' : '코디 원단 · 아바타 스펙'}
        </span>
        <span className="editorial-spec-chip tabular-nums">
          {mstSwatch.code} · {profile.heightCm}cm/{profile.weightKg}kg (BMI {bmi})
        </span>
      </div>
      <div className="editorial-spec-list">
        {placements.map(({ slotKey, garment }) => {
          const displayName =
            isEn && garment.name_en
              ? garment.name_en
              : localizeGarmentName(garment.name, resolvedLang);
          const slotBadge =
            SLOT_BADGE_LABELS[slotKey]?.[isEn ? 'en' : 'ko'] || slotKey.toUpperCase();
          return (
            <div key={`spec-${slotKey}-${garment.id}`} className="editorial-spec-row">
              <span
                className="editorial-spec-color-dot"
                style={{ backgroundColor: garment.color_hex || '#CFCAC2' }}
              />
              <span className="editorial-spec-slot">{slotBadge}</span>
              <span className="editorial-spec-name">{displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * Zero-Procedural-Drawing Outfits Central Stage:
 * ① Editorial Flat-Lay Lookbook Board (0ms instant response, 100% original aspect ratio & fabric detail)
 * ② 100% Gemini Multimodal Multi-Angle Virtual Try-On Stage (`0° / 45° / 90° / 180°`)
 *    with glassmorphism shimmer loading overlay and Before/After split comparison.
 */
const EditorialFlatLayBoard = memo(function EditorialFlatLayBoard({
  slots = null,
  layers: explicitLayers = null,
  activeSlotKey = null,
  onSelectSlot,
  stageMode = 'flatlay',
  styleMode = 'photorealistic',
  aiImageUrl = null,
  aiLoading = false,
  skinToneHex,
  personalColor,
  skinProfile = null,
  bodySpec = null,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  personReferenceUrl = null,
  viewAngleDeg = DEFAULT_TURNAROUND_ANGLE,
  compareActive = false,
  compareSplitPct = 50,
  onCompareSplitChange,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onZoomChange,
  onPanChange,
  legacyMode,
  lang,
}) {
  const viewerMode = normalizeViewerMode(legacyMode);
  const resolvedStyleMode = normalizeVtonStyleMode(styleMode);
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

  const resolvedSkinHex = (
    skinToneHex ||
    skinProfile?.skinToneHex ||
    profile.skinToneHex ||
    '#DFBA9B'
  ).toUpperCase();

  const resolvedPersonalColor =
    personalColor || skinProfile?.personalColor || profile.personalColor || 'autumn_warm';

  const resolvedBodyShape =
    bodySpec?.bodyShape || user?.bodyShape || profile.bodyShape || 'standard';

  const resolvedHeightCm =
    bodySpec?.heightCm ?? profile.heightCm ?? 172;

  const resolvedWeightKg =
    bodySpec?.weightKg ?? profile.weightKg ?? 64;

  const mstSwatch = useMemo(
    () =>
      getMstSwatch(
        profile.avatarSpec.appearance.mstLevel,
        profile.avatarSpec.appearance.mstUndertone
      ),
    [profile.avatarSpec.appearance.mstLevel, profile.avatarSpec.appearance.mstUndertone]
  );

  const { outfitComboId, equippedGarments } = useMemo(
    () => computeOutfitComboId(slots),
    [slots]
  );

  const resolvedLayers = useMemo(() => {
    if (Array.isArray(explicitLayers) && explicitLayers.length > 0) {
      return explicitLayers;
    }
    return equippedGarments;
  }, [explicitLayers, equippedGarments]);

  const placements = useMemo(
    () => computeFlatLayPlacements(resolvedLayers),
    [resolvedLayers]
  );

  const safeZoom = clamp(Number(zoom) || 1, 1, 3);
  const safePanX = Number.isFinite(pan?.x) ? pan.x : 0;
  const safePanY = Number.isFinite(pan?.y) ? pan.y : 0;
  const safeSplit = clamp(Number(compareSplitPct) || 50, 5, 95);

  const hasAiImage = Boolean(stageMode === 'ai-vton' && aiImageUrl);

  const stageRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const panGestureRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originPanX: 0,
    originPanY: 0,
    moved: false,
  });

  const clampPanOffset = useCallback((nextX, nextY, currentZoom) => {
    if (currentZoom <= 1.01) return { x: 0, y: 0 };
    const el = stageRef.current;
    const width = el?.clientWidth || 380;
    const height = el?.clientHeight || 480;
    const maxX = ((currentZoom - 1) * width) / 2;
    const maxY = ((currentZoom - 1) * height) / 2;
    return {
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY),
    };
  }, []);

  const handleStageWheel = useCallback(
    (e) => {
      if (!onZoomChange) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.22 : -0.22;
      const nextZoom = clamp(Number((safeZoom + delta).toFixed(2)), 1, 3);
      onZoomChange(nextZoom);
      if (nextZoom <= 1.01) {
        onPanChange?.({ x: 0, y: 0 });
      } else if (onPanChange) {
        onPanChange(clampPanOffset(safePanX, safePanY, nextZoom));
      }
    },
    [safeZoom, safePanX, safePanY, onZoomChange, onPanChange, clampPanOffset]
  );

  const handleStagePointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-vton-compare-slider], [data-flatlay-item-slot], button')
      ) {
        return;
      }
      if (safeZoom <= 1.01) return;

      panGestureRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originPanX: safePanX,
        originPanY: safePanY,
        moved: false,
      };
      setIsPanning(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic pointer capture errors
      }
    },
    [safeZoom, safePanX, safePanY]
  );

  const handleStagePointerMove = useCallback(
    (e) => {
      const g = panGestureRef.current;
      if (!g.active || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > 3) {
        g.moved = true;
      }
      if (onPanChange) {
        onPanChange(clampPanOffset(g.originPanX + dx, g.originPanY + dy, safeZoom));
      }
    },
    [safeZoom, onPanChange, clampPanOffset]
  );

  const finishStagePointer = useCallback((e) => {
    const g = panGestureRef.current;
    if (!g.active) return;
    g.active = false;
    setIsPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors
    }
  }, []);

  const updateCompareFromClientX = useCallback(
    (clientX) => {
      const el = stageRef.current;
      if (!el || !onCompareSplitChange) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const pct = clamp(((clientX - rect.left) / rect.width) * 100, 5, 95);
      onCompareSplitChange(Math.round(pct * 10) / 10);
    },
    [onCompareSplitChange]
  );

  const handleSliderPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      setIsSliderDragging(true);
      updateCompareFromClientX(e.clientX);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture errors
      }
    },
    [updateCompareFromClientX]
  );

  const handleSliderPointerMove = useCallback(
    (e) => {
      if (!isSliderDragging) return;
      e.stopPropagation();
      updateCompareFromClientX(e.clientX);
    },
    [isSliderDragging, updateCompareFromClientX]
  );

  const handleSliderPointerUp = useCallback(
    (e) => {
      if (!isSliderDragging) return;
      e.stopPropagation();
      setIsSliderDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    },
    [isSliderDragging]
  );

  const handleSliderKeyDown = useCallback(
    (e) => {
      if (!onCompareSplitChange) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onCompareSplitChange(clamp(safeSplit - 5, 5, 95));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onCompareSplitChange(clamp(safeSplit + 5, 5, 95));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onCompareSplitChange(15);
      } else if (e.key === 'End') {
        e.preventDefault();
        onCompareSplitChange(85);
      }
    },
    [safeSplit, onCompareSplitChange]
  );

  const mediaTransformStyle = useMemo(
    () => ({
      transform: `translate3d(${safePanX.toFixed(1)}px, ${safePanY.toFixed(1)}px, 0) scale(${safeZoom.toFixed(3)})`,
    }),
    [safePanX, safePanY, safeZoom]
  );

  const styleLabel =
    resolvedStyleMode === 'stylized_isometric'
      ? isEn
        ? 'Stylized Isometric'
        : '감성 시뮬레이션 캐릭터'
      : isEn
        ? 'Photorealistic Studio'
        : '스튜디오 실사 모델';

  return (
    <div
      ref={stageRef}
      id={CARBON_DOM_CONTRACT.character25dMannequinId}
      className={`studio-2d-model-stage editorial-vton-stage ${hasAiImage ? 'is-ai-stage' : 'is-flatlay-stage'} ${safeZoom > 1.01 ? 'is-zoomed' : 'is-zoomable'} ${isPanning ? 'is-panning' : ''}`.trim()}
      data-viewer-mode={viewerMode}
      data-stage-view={hasAiImage ? 'ai-vton' : 'flatlay'}
      data-requested-stage-view={stageMode}
      data-vton-style={resolvedStyleMode}
      data-skin-hex={resolvedSkinHex}
      data-personal-color={resolvedPersonalColor}
      data-zoom={safeZoom.toFixed(2)}
      data-body-shape={resolvedBodyShape}
      data-height-cm={resolvedHeightCm}
      data-weight-kg={resolvedWeightKg}
      data-view-angle={safeAngleDeg}
      data-avatar-hash={profile.avatarConfigHash}
      data-outfit-combo={outfitComboId}
      onWheel={handleStageWheel}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={finishStagePointer}
      onPointerCancel={finishStagePointer}
    >
      <div className="studio-2d-viewport">
        {/* Primary After Layer: either Gemini AI VTON image or Editorial Flat-Lay Board */}
        <div className="studio-2d-layer studio-2d-layer-after">
          {hasAiImage ? (
            <img
              src={aiImageUrl}
              alt={
                isEn
                  ? `Gemini AI virtual try-on (${safeAngleDeg}°)`
                  : `Gemini AI 가상 피팅 (${safeAngleDeg}°)`
              }
              data-vton-after-img="true"
              data-ai-vton-img="true"
              className="studio-2d-media-el editorial-ai-vton-img"
              draggable={false}
              style={mediaTransformStyle}
            />
          ) : (
            <FlatLayLookbookSurface
              placements={placements}
              activeSlotKey={activeSlotKey}
              onSelectSlot={onSelectSlot}
              resolvedLang={resolvedLang}
              mstSwatch={mstSwatch}
              heightCm={resolvedHeightCm}
              weightKg={resolvedWeightKg}
              angleDeg={safeAngleDeg}
              asPrimaryStageTarget
              transformStyle={mediaTransformStyle}
            />
          )}
        </div>

        {/* Optional Before Layer for B/A Split Comparison */}
        {compareActive && placements.length > 0 && (
          <div
            className="studio-2d-layer studio-2d-layer-before"
            style={{ clipPath: `inset(0 ${(100 - safeSplit).toFixed(2)}% 0 0)` }}
          >
            {hasAiImage ? (
              <FlatLayLookbookSurface
                placements={placements}
                activeSlotKey={activeSlotKey}
                onSelectSlot={onSelectSlot}
                resolvedLang={resolvedLang}
                mstSwatch={mstSwatch}
                heightCm={resolvedHeightCm}
                weightKg={resolvedWeightKg}
                angleDeg={safeAngleDeg}
                asPrimaryStageTarget={false}
                transformStyle={mediaTransformStyle}
              />
            ) : (
              <CuratorialSpecSheet
                placements={placements}
                resolvedLang={resolvedLang}
                mstSwatch={mstSwatch}
                profile={profile}
                transformStyle={mediaTransformStyle}
              />
            )}
          </div>
        )}
      </div>

      {/* Interactive B/A Split Handle */}
      {compareActive && placements.length > 0 && (
        <>
          <div
            role="slider"
            tabIndex={0}
            data-vton-compare-slider="true"
            aria-label={isEn ? 'Before and after split position' : '전후 비교 분할선 위치'}
            aria-valuemin={5}
            aria-valuemax={95}
            aria-valuenow={Math.round(safeSplit)}
            className={`studio-2d-compare-slider ${isSliderDragging ? 'is-dragging' : ''}`}
            style={{ left: `${safeSplit}%` }}
            onPointerDown={handleSliderPointerDown}
            onPointerMove={handleSliderPointerMove}
            onPointerUp={handleSliderPointerUp}
            onPointerCancel={handleSliderPointerUp}
            onKeyDown={handleSliderKeyDown}
          >
            <div className="studio-2d-compare-line" />
            <div className="studio-2d-compare-knob">
              <MoveHorizontal size={15} />
            </div>
          </div>

          <div className="studio-2d-compare-badges" aria-hidden="true">
            <span className={`studio-2d-compare-tag ${safeSplit < 14 ? 'is-muted' : ''}`}>
              {hasAiImage ? (isEn ? 'FLAT-LAY' : '플랫레이') : isEn ? 'SPEC' : '스펙'}
            </span>
            <span
              className={`studio-2d-compare-tag is-after ${safeSplit > 86 ? 'is-muted' : ''}`}
            >
              {hasAiImage ? (isEn ? 'AI VTON' : 'AI 피팅') : isEn ? 'LOOKBOOK' : '룩북'}
            </span>
          </div>
        </>
      )}

      {/* Glassmorphism Shimmer Loading Overlay on top of Flat-Lay Board during Gemini Synthesis */}
      {aiLoading && (
        <div
          className="editorial-vton-shimmer-overlay"
          data-vton-shimmer-overlay="true"
          role="status"
          aria-live="polite"
        >
          <div className="editorial-vton-shimmer-card">
            <div className="editorial-vton-shimmer-sweep" aria-hidden="true" />
            <div className="editorial-vton-shimmer-icon" aria-hidden="true">
              <Sparkles size={16} />
            </div>
            <p className="editorial-vton-shimmer-title">
              {isEn
                ? `Generating Gemini Multi-Angle Try-On (${safeAngleDeg}°)`
                : `Gemini 멀티모달 다각도 AI 피팅 생성 중 (${safeAngleDeg}°)`}
            </p>
            <p className="editorial-vton-shimmer-sub">
              {styleLabel} · {resolvedHeightCm}cm / {resolvedWeightKg}kg · {mstSwatch.code}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default EditorialFlatLayBoard;
