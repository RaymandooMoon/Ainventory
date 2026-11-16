import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MoveHorizontal, Sparkles } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { getMstSwatch } from '../services/monkSkinTone.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  computeIdealDeviceMannequinScale,
  computeOutfitComboId,
  normalizeGenderNeutralProfile,
  normalizeTurnaround360Angle,
  normalizeViewerMode,
  normalizeVtonStyleMode,
  resolve360AngleRenderSpec,
} from '../services/vton2DService.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
import StudioGarmentImage from './StudioGarmentImage.jsx';

const SWIPE_MIN_DISTANCE_PX = 40;
const SWIPE_FAST_FLICK_VELOCITY_PX_PER_MS = 0.8;

const SLOT_EDITORIAL_PRIORITY = {
  outer: 1,
  onepiece: 2,
  dress: 2,
  top: 3,
  bottom: 4,
  shoes: 5,
  acc_umbrella: 6,
  accessory: 7,
  acc_head: 8,
  headwear: 8,
  acc_eyes: 9,
  acc_neck: 10,
  neckwear: 10,
  acc_belt: 11,
  acc_wrist_left: 12,
  acc_wrist_right: 13,
  acc_hand_left: 14,
  acc_hand_right: 15,
  jwl_neck: 16,
  jwl_ear_left: 17,
  jwl_ear_right: 18,
  jwl_wrist_left: 19,
  jwl_wrist_right: 20,
  jwl_ring_left: 21,
  jwl_ring_right: 22,
  jwl_brooch: 23,
};

const SLOT_BADGE_LABELS = {
  outer: { ko: 'OUTER', en: 'OUTER' },
  top: { ko: 'TOP', en: 'TOP' },
  onepiece: { ko: 'ONE-PIECE', en: 'ONE-PIECE' },
  dress: { ko: 'DRESS', en: 'DRESS' },
  bottom: { ko: 'BOTTOM', en: 'BOTTOM' },
  shoes: { ko: 'SHOES', en: 'SHOES' },
  accessory: { ko: 'BAG', en: 'BAG' },
  acc_umbrella: { ko: 'UMBRELLA', en: 'UMBRELLA' },
  acc_belt: { ko: 'BELT', en: 'BELT' },
  acc_head: { ko: 'HEAD', en: 'HEAD' },
  headwear: { ko: 'HEADWEAR', en: 'HEADWEAR' },
  acc_eyes: { ko: 'EYEWEAR', en: 'EYEWEAR' },
  acc_neck: { ko: 'NECK', en: 'NECK' },
  neckwear: { ko: 'NECKWEAR', en: 'NECKWEAR' },
  acc_hand_left: { ko: 'L-GLOVE', en: 'L-GLOVE' },
  acc_hand_right: { ko: 'R-GLOVE', en: 'R-GLOVE' },
  acc_wrist_left: { ko: 'L-WATCH', en: 'L-WATCH' },
  acc_wrist_right: { ko: 'R-WATCH', en: 'R-WATCH' },
  jwl_neck: { ko: 'NECKLACE', en: 'NECKLACE' },
  jwl_ear_left: { ko: 'L-EAR', en: 'L-EAR' },
  jwl_ear_right: { ko: 'R-EAR', en: 'R-EAR' },
  jwl_wrist_left: { ko: 'L-BANGLE', en: 'L-BANGLE' },
  jwl_wrist_right: { ko: 'R-BANGLE', en: 'R-BANGLE' },
  jwl_ring_left: { ko: 'L-RING', en: 'L-RING' },
  jwl_ring_right: { ko: 'R-RING', en: 'R-RING' },
  jwl_brooch: { ko: 'BROOCH', en: 'BROOCH' },
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Orders equipped garments & accessories in editorial priority for a 100% unfolded,
 * non-overlapping responsive CSS Grid lookbook board where every item is visible at once.
 */
function computeFlatLayPlacements(layers) {
  return [...layers].sort((a, b) => {
    const pa = SLOT_EDITORIAL_PRIORITY[a.slotKey] ?? 99;
    const pb = SLOT_EDITORIAL_PRIORITY[b.slotKey] ?? 99;
    return pa - pb;
  });
}

function resolveFlatLayGridMetrics(count) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

const FlatLayLookbookSurface = memo(function FlatLayLookbookSurface({
  placements,
  activeSlotKey,
  onSelectSlot,
  canReturnToCharacter = false,
  onCloseFlatLay,
  resolvedLang,
  mstSwatch,
  heightCm,
  weightKg,
  angleDeg,
  asPrimaryStageTarget,
  transformStyle,
}) {
  const isEn = resolvedLang === 'en';
  const { cols, rows } = useMemo(
    () => resolveFlatLayGridMetrics(placements.length),
    [placements.length]
  );

  return (
    <div
      className={`editorial-flatlay-board is-unfolded ${canReturnToCharacter ? 'has-close-action' : ''}`}
      data-flatlay-board="true"
      data-flatlay-unfolded="true"
      data-flatlay-count={placements.length}
      data-vton-after-img={asPrimaryStageTarget ? 'true' : undefined}
      style={transformStyle}
    >
      {/* Editorial Masthead + Optional Return-to-Character Action */}
      <div className="editorial-flatlay-header">
        <div className="editorial-flatlay-header-left">
          <span className="editorial-flatlay-kicker">
            {isEn ? 'FLAT-LAY LOOKBOOK' : '플랫레이 룩북'}
          </span>
          {placements.length > 0 && (
            <span className="editorial-flatlay-count-chip tabular-nums">
              {isEn ? `${placements.length} ITEMS` : `${placements.length}종 전체보기`}
            </span>
          )}
        </div>

        <div className="editorial-flatlay-header-right">
          <span className="editorial-flatlay-meta tabular-nums" aria-hidden="true">
            <span
              className="editorial-flatlay-mst-dot"
              style={{ backgroundColor: mstSwatch.hex }}
            />
            <span>
              {heightCm}·{weightKg} · {angleDeg}°
            </span>
          </span>
          {canReturnToCharacter && onCloseFlatLay && (
            <button
              type="button"
              data-flatlay-close-btn="true"
              className="editorial-flatlay-close-btn"
              aria-label={isEn ? 'Return to character fitting view' : '캐릭터 피팅 화면으로 돌아가기'}
              onClick={(e) => {
                e.stopPropagation();
                onCloseFlatLay();
              }}
            >
              <ArrowLeft size={13} aria-hidden="true" />
              <span>{isEn ? 'Character' : '캐릭터 보기'}</span>
            </button>
          )}
        </div>
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
              : '옷장에서 아이템을 선택하면 원본 비율 그대로 한눈에 펼쳐지며, AI 피팅으로 다각도 착장을 생성할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div
          className={`editorial-flatlay-collage ${placements.length >= 10 ? 'is-scrollable' : ''}`}
          data-flatlay-grid-cols={cols}
          style={{
            '--flatlay-cols': cols,
            '--flatlay-rows': rows,
          }}
        >
          {placements.map((entry) => {
            const { slotKey, garment } = entry;
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
 * ② 100% Gemini Multimodal Multi-Angle Virtual Try-On Stage (`0°..315°` 360° swipe rotation,
 *    velocity-sensitive `±45°` step vs `180°` fast flick, full-body floor baseline contact).
 */
const EditorialFlatLayBoard = memo(function EditorialFlatLayBoard({
  slots = null,
  layers: explicitLayers = null,
  activeSlotKey = null,
  onSelectSlot,
  stageMode = 'flatlay',
  styleMode = 'stylized_isometric',
  aiImageUrl = null,
  aiLoading = false,
  effectiveWeather = 'clear',
  theme = 'light',
  skinToneHex,
  personalColor,
  skinProfile = null,
  bodySpec = null,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  personReferenceUrl = null,
  viewAngleDeg = DEFAULT_TURNAROUND_ANGLE,
  scrollResidualYawDeg = 0,
  onSwipeRotate,
  onTapCharacter,
  onCloseFlatLay,
  canReturnToCharacter = false,
  compareActive = false,
  compareSplitPct = 50,
  onCompareSplitChange,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onZoomChange,
  onPanChange,
  onIdealScaleChange,
  legacyMode,
  lang,
}) {
  const viewerMode = normalizeViewerMode(legacyMode);
  const resolvedStyleMode = normalizeVtonStyleMode(styleMode);
  const safeAngleDeg = normalizeTurnaround360Angle(viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const angleSpec = useMemo(() => resolve360AngleRenderSpec(safeAngleDeg), [safeAngleDeg]);
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

  const resolvedHeightCm = bodySpec?.heightCm ?? profile.heightCm ?? 172;
  const resolvedWeightKg = bodySpec?.weightKg ?? profile.weightKg ?? 64;

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
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [aiImgAspect, setAiImgAspect] = useState(0.76);
  const [isPanning, setIsPanning] = useState(false);
  const [isRotatingDrag, setIsRotatingDrag] = useState(false);
  const [swipeDragPx, setSwipeDragPx] = useState(0);
  const [isSliderDragging, setIsSliderDragging] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const syncSize = () => {
      const nextW = Math.round(el.clientWidth || 0);
      const nextH = Math.round(el.clientHeight || 0);
      setStageSize((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }
      );
    };
    syncSize();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(syncSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', syncSize);
    return () => window.removeEventListener('resize', syncSize);
  }, []);

  const handleAiImageLoad = useCallback((e) => {
    const img = e.currentTarget;
    const nw = img?.naturalWidth || 0;
    const nh = img?.naturalHeight || 0;
    if (nw >= 16 && nh >= 16) {
      const ratio = Math.round((nw / nh) * 1000) / 1000;
      setAiImgAspect((prev) => (Math.abs(prev - ratio) < 0.005 ? prev : ratio));
    }
  }, []);

  const idealBaseScale = useMemo(
    () =>
      computeIdealDeviceMannequinScale({
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
        imageAspectRatio: aiImgAspect,
      }),
    [stageSize.width, stageSize.height, aiImgAspect]
  );

  useEffect(() => {
    onIdealScaleChange?.(idealBaseScale);
  }, [idealBaseScale, onIdealScaleChange]);

  // Auto-recenter mannequin position to dead-center (`{ x: 0, y: 0 }`) 1,000ms (1 second) after pan release
  useEffect(() => {
    if (!hasAiImage || isPanning || !onPanChange) return undefined;
    if (Math.abs(safePanX) < 0.5 && Math.abs(safePanY) < 0.5) return undefined;
    const timerId = setTimeout(() => {
      onPanChange({ x: 0, y: 0 });
    }, 1000);
    return () => clearTimeout(timerId);
  }, [hasAiImage, isPanning, safePanX, safePanY, onPanChange]);

  const gestureRef = useRef({
    active: false,
    mode: 'idle', // 'idle' | 'pan' | 'swipe-candidate' | 'swipe-rotate'
    pointerId: null,
    startX: 0,
    startY: 0,
    startT: 0,
    motionStartT: 0,
    motionStarted: false,
    originPanX: 0,
    originPanY: 0,
    moved: false,
    captured: false,
  });

  const clampPanOffset = useCallback(
    (nextX, nextY, currentZoom) => {
      if (currentZoom <= 1.01) return { x: 0, y: 0 };
      const el = stageRef.current;
      const width = el?.clientWidth || 380;
      const height = el?.clientHeight || 480;
      const effectiveZoom = Math.max(currentZoom, currentZoom * idealBaseScale);
      const maxX = Math.max(24, ((effectiveZoom - 1) * width) / 2);
      const maxY = Math.max(24, ((effectiveZoom - 1) * height) / 2);
      return {
        x: clamp(nextX, -maxX, maxX),
        y: clamp(nextY, -maxY, maxY),
      };
    },
    [idealBaseScale]
  );

  const handleStageWheel = useCallback(
    (e) => {
      // Zoom applies strictly ONLY to the AI character — never zoom the Flat-Lay board!
      if (!hasAiImage || !onZoomChange) return;
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
    [hasAiImage, safeZoom, safePanX, safePanY, onZoomChange, onPanChange, clampPanOffset]
  );

  const suppressNextClickRef = useRef(false);

  const handleStagePointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      suppressNextClickRef.current = false;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-vton-compare-slider], button')
      ) {
        return;
      }

      const tNow = nowMs();
      if (hasAiImage && safeZoom > 1.01) {
        gestureRef.current = {
          active: true,
          mode: 'pan',
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startT: tNow,
          motionStartT: tNow,
          motionStarted: true,
          originPanX: safePanX,
          originPanY: safePanY,
          moved: false,
          captured: true,
        };
        setIsPanning(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic pointer capture errors
        }
        return;
      }

      // Zoom === 1x: arm 360° horizontal swipe rotation candidate
      gestureRef.current = {
        active: true,
        mode: 'swipe-candidate',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: tNow,
        motionStartT: tNow,
        motionStarted: false,
        originPanX: 0,
        originPanY: 0,
        moved: false,
        captured: false,
      };
      setSwipeDragPx(0);
    },
    [hasAiImage, safeZoom, safePanX, safePanY]
  );

  const handleStagePointerMove = useCallback(
    (e) => {
      const g = gestureRef.current;
      if (!g.active || g.pointerId !== e.pointerId) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (g.mode === 'pan') {
        if (Math.hypot(dx, dy) > 3) {
          g.moved = true;
          suppressNextClickRef.current = true;
        }
        if (onPanChange) {
          onPanChange(clampPanOffset(g.originPanX + dx, g.originPanY + dy, safeZoom));
        }
        return;
      }

      if (!g.motionStarted && (absDx >= 6 || absDy >= 6)) {
        g.motionStarted = true;
        g.motionStartT = nowMs();
      }

      if (g.mode === 'swipe-candidate') {
        // Yield cleanly to native vertical page scrolling if vertical motion dominates
        if (absDy > 14 && absDy > absDx * 1.25) {
          suppressNextClickRef.current = true;
          g.active = false;
          g.mode = 'idle';
          setIsRotatingDrag(false);
          setSwipeDragPx(0);
          return;
        }
        if (absDx > 10 && absDx > absDy * 1.1) {
          g.mode = 'swipe-rotate';
          g.moved = true;
          suppressNextClickRef.current = true;
          setIsRotatingDrag(true);
          if (!g.captured) {
            g.captured = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignore synthetic pointer capture errors
            }
          }
        }
      }

      if (g.mode === 'swipe-rotate') {
        setSwipeDragPx(clamp(dx, -88, 88));
      }
    },
    [safeZoom, onPanChange, clampPanOffset]
  );

  const finishStagePointer = useCallback(
    (e, isCancel = false) => {
      const g = gestureRef.current;
      if (!g.active) return;

      const endT = nowMs();
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const finalMode = g.mode;
      const wasMoved = Boolean(g.moved || absDx >= 8 || absDy >= 8 || isCancel);
      const activeDt = Math.max(12, endT - (g.motionStarted ? g.motionStartT : g.startT));

      if (wasMoved) {
        suppressNextClickRef.current = true;
      }

      g.active = false;
      g.mode = 'idle';
      setIsPanning(false);
      setIsRotatingDrag(false);
      setSwipeDragPx(0);

      if (g.captured) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors
        }
      }

      if (
        !isCancel &&
        (finalMode === 'swipe-rotate' ||
          (finalMode === 'swipe-candidate' && absDx >= SWIPE_MIN_DISTANCE_PX && absDx > absDy * 1.1)) &&
        absDx >= SWIPE_MIN_DISTANCE_PX &&
        onSwipeRotate
      ) {
        const velocityPxPerMs = absDx / activeDt;
        const fastFlick = velocityPxPerMs >= SWIPE_FAST_FLICK_VELOCITY_PX_PER_MS;
        // Dragging right (dx > 0) steps +45°; dragging left (dx < 0) steps -45°
        const stepSign = dx > 0 ? 1 : -1;
        onSwipeRotate({
          stepSign,
          fastFlick,
          velocityPxPerMs,
          dx,
        });
      }
    },
    [onSwipeRotate]
  );

  const handleStagePointerUp = useCallback(
    (e) => finishStagePointer(e, false),
    [finishStagePointer]
  );

  const handleStagePointerCancel = useCallback(
    (e) => finishStagePointer(e, true),
    [finishStagePointer]
  );

  const handleStageClick = useCallback(
    (e) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-vton-compare-slider], [data-flatlay-item-slot], button')
      ) {
        return;
      }
      if (hasAiImage && placements.length > 0 && !compareActive && onTapCharacter) {
        onTapCharacter();
        return;
      }
      if (!hasAiImage && canReturnToCharacter && onCloseFlatLay) {
        onCloseFlatLay();
      }
    },
    [hasAiImage, placements.length, compareActive, onTapCharacter, canReturnToCharacter, onCloseFlatLay]
  );

  const handleStageKeyDown = useCallback(
    (e) => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-vton-compare-slider], [data-flatlay-item-slot], input, textarea, select, button')
      ) {
        return;
      }
      if (e.key === 'Escape' && !hasAiImage && canReturnToCharacter && onCloseFlatLay) {
        e.preventDefault();
        onCloseFlatLay();
        return;
      }
      if (
        (e.key === 'Enter' || e.key === ' ') &&
        hasAiImage &&
        placements.length > 0 &&
        !compareActive &&
        onTapCharacter
      ) {
        e.preventDefault();
        onTapCharacter();
        return;
      }
      if (!onSwipeRotate) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSwipeRotate({
          stepSign: -1,
          fastFlick: Boolean(e.shiftKey),
          velocityPxPerMs: e.shiftKey ? 1.2 : 0.35,
          dx: 60,
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSwipeRotate({
          stepSign: 1,
          fastFlick: Boolean(e.shiftKey),
          velocityPxPerMs: e.shiftKey ? 1.2 : 0.35,
          dx: -60,
        });
      }
    },
    [
      onSwipeRotate,
      hasAiImage,
      canReturnToCharacter,
      onCloseFlatLay,
      placements.length,
      compareActive,
      onTapCharacter,
    ]
  );

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

  const safeScrollResidualYaw = Number.isFinite(scrollResidualYawDeg)
    ? clamp(scrollResidualYawDeg, -12, 12)
    : 0;
  const isScrollScrubbing = Math.abs(safeScrollResidualYaw) >= 0.1;

  const modelTransformStyle = useMemo(() => {
    const dragNudgeX = isRotatingDrag ? clamp(swipeDragPx * 0.14, -12, 12) : 0;
    const dragYawDeg = isRotatingDrag ? clamp(swipeDragPx * 0.08, -7, 7) : 0;
    const totalYawDeg = angleSpec.perspectiveYawDeg + dragYawDeg + safeScrollResidualYaw;
    const effectiveScale = safeZoom * idealBaseScale;
    const parts = [];
    if (safeZoom > 1.001 || safePanX !== 0 || safePanY !== 0 || dragNudgeX !== 0) {
      parts.push(
        `translate3d(${(safePanX + dragNudgeX).toFixed(1)}px, ${safePanY.toFixed(1)}px, 0)`
      );
    }
    if (Math.abs(effectiveScale - 1) > 0.002) {
      parts.push(`scale(${effectiveScale.toFixed(3)})`);
    }
    if (Math.abs(totalYawDeg) >= 0.05) {
      parts.push(`perspective(980px) rotateY(${totalYawDeg.toFixed(1)}deg)`);
    }
    if (angleSpec.mirrorX) {
      parts.push('scaleX(-1)');
    }
    return {
      transformOrigin: '50% 94%',
      transform: parts.length > 0 ? parts.join(' ') : 'none',
    };
  }, [
    angleSpec.mirrorX,
    angleSpec.perspectiveYawDeg,
    idealBaseScale,
    isRotatingDrag,
    swipeDragPx,
    safeScrollResidualYaw,
    safePanX,
    safePanY,
    safeZoom,
  ]);

  const shadowTransformStyle = useMemo(() => {
    const shadowScale = safeZoom * (1 + (idealBaseScale - 1) * 0.55);
    const hasTranslation = safePanX !== 0 || safePanY !== 0;
    if (!hasTranslation && Math.abs(shadowScale - 1) <= 0.005) {
      return undefined;
    }
    return {
      transform: `translate3d(${safePanX.toFixed(1)}px, ${safePanY.toFixed(1)}px, 0) scale(${shadowScale.toFixed(3)})`,
    };
  }, [idealBaseScale, safePanX, safePanY, safeZoom]);

  const styleLabel =
    resolvedStyleMode === 'stylized_isometric'
      ? isEn
        ? 'Character Simulation'
        : '캐릭터 시뮬레이션'
      : isEn
        ? 'Photorealistic Model'
        : '실사 모델';

  return (
    <div
      ref={stageRef}
      id={CARBON_DOM_CONTRACT.character25dMannequinId}
      tabIndex={0}
      aria-label={
        hasAiImage && placements.length > 0
          ? isEn
            ? `360-degree virtual fitting stage (${angleSpec.fullEn}). Tap character to view unfolded lookbook, or swipe horizontally to rotate.`
            : `360도 가상 피팅 스테이지 (${angleSpec.fullKo}). 캐릭터를 터치하면 플랫레이 룩북이 펼쳐지며, 좌우 드래그로 회전할 수 있습니다.`
          : isEn
            ? `360-degree virtual fitting stage (${angleSpec.fullEn}). Swipe horizontally to rotate.`
            : `360도 가상 피팅 스테이지 (${angleSpec.fullKo}). 좌우 드래그하여 회전하세요.`
      }
      className={`studio-2d-model-stage editorial-vton-stage ${hasAiImage ? 'is-ai-stage' : 'is-flatlay-stage'} ${hasAiImage && safeZoom > 1.01 ? 'is-zoomed' : 'is-zoomable'} ${isPanning || isRotatingDrag || isScrollScrubbing ? 'is-panning' : ''} ${isRotatingDrag ? 'is-swipe-rotating' : ''}`.trim()}
      data-viewer-mode={viewerMode}
      data-stage-view={hasAiImage ? 'ai-vton' : 'flatlay'}
      data-requested-stage-view={stageMode}
      data-effective-weather={effectiveWeather}
      data-stage-theme={theme}
      data-vton-style={resolvedStyleMode}
      data-skin-hex={resolvedSkinHex}
      data-personal-color={resolvedPersonalColor}
      data-zoom={(hasAiImage ? safeZoom : 1).toFixed(2)}
      data-ideal-scale={idealBaseScale.toFixed(3)}
      data-pan-offset={`${Math.round(hasAiImage ? safePanX : 0)},${Math.round(hasAiImage ? safePanY : 0)}`}
      data-body-shape={resolvedBodyShape}
      data-height-cm={resolvedHeightCm}
      data-weight-kg={resolvedWeightKg}
      data-view-angle={safeAngleDeg}
      data-canonical-slice-angle={angleSpec.canonicalSliceAngle}
      data-angle-mirrored={angleSpec.mirrorX ? 'true' : 'false'}
      data-avatar-hash={profile.avatarConfigHash}
      data-outfit-combo={outfitComboId}
      onWheel={handleStageWheel}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerCancel}
      onClick={handleStageClick}
      onKeyDown={handleStageKeyDown}
    >
      <div className="studio-2d-viewport">
        {/* Primary After Layer: Layer 1 Floor Contact Shadow + Layer 2 RGBA Model (or Editorial Flat-Lay Board) */}
        <div className="studio-2d-layer studio-2d-layer-after">
          {hasAiImage ? (
            <>
              <div
                aria-hidden="true"
                data-floor-contact-shadow="true"
                className="studio-floor-contact-shadow"
                style={shadowTransformStyle}
              />
              <img
                src={aiImageUrl}
                onLoad={handleAiImageLoad}
                alt={
                  isEn
                    ? `Gemini AI virtual try-on (${angleSpec.fullEn})`
                    : `Gemini AI 가상 피팅 (${angleSpec.fullKo})`
                }
                title={
                  placements.length > 0
                    ? isEn
                      ? 'Tap to open unfolded Flat-Lay Lookbook'
                      : '터치하여 플랫레이 룩북 전체 보기'
                    : undefined
                }
                data-vton-after-img="true"
                data-ai-vton-img="true"
                className={`studio-2d-media-el editorial-ai-vton-img ${
                  placements.length > 0 && !compareActive ? 'is-lookbook-tappable' : ''
                }`}
                draggable={false}
                style={modelTransformStyle}
              />
            </>
          ) : (
            <FlatLayLookbookSurface
              placements={placements}
              activeSlotKey={activeSlotKey}
              onSelectSlot={onSelectSlot}
              canReturnToCharacter={canReturnToCharacter}
              onCloseFlatLay={onCloseFlatLay}
              resolvedLang={resolvedLang}
              mstSwatch={mstSwatch}
              heightCm={resolvedHeightCm}
              weightKg={resolvedWeightKg}
              angleDeg={safeAngleDeg}
              asPrimaryStageTarget
              transformStyle={undefined}
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
                transformStyle={undefined}
              />
            ) : (
              <CuratorialSpecSheet
                placements={placements}
                resolvedLang={resolvedLang}
                mstSwatch={mstSwatch}
                profile={profile}
                transformStyle={undefined}
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
                ? `Generating Weather Pose & V4 Cutout (${safeAngleDeg}°)`
                : `날씨 맞춤 전신 포즈 및 V4 투명 누끼 생성 중 (${safeAngleDeg}°)`}
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
