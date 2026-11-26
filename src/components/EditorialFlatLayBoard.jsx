import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, Check, MoveHorizontal, X } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { getMstSwatch } from '../services/monkSkinTone.ts';
import {
  DEFAULT_TURNAROUND_ANGLE,
  computeMannequinFloorPlacement,
  computeOutfitComboId,
  normalizeGenderNeutralProfile,
  normalizeTurnaround360Angle,
  normalizeViewerMode,
  normalizeVtonStyleMode,
  resolve360AngleRenderSpec,
} from '../services/vton2DService.ts';
import { getStoredLang, localizeGarmentName } from '../utils/i18n.ts';
import { scheduleIdleTask } from '../utils/resourcePriority.ts';
import {
  computeCrossfadeBridgeState,
  computeDirectionalBlurPx,
  shortestAngleDeltaDeg,
} from '../utils/turnaroundPhysics.ts';
import { computeGroundShadowScaleX } from '../utils/turnaroundMorph.ts';
import StudioGarmentImage from './StudioGarmentImage.jsx';

const StudioCharacterRelightCanvas = lazy(
  () => import('./three/StudioCharacterRelightCanvas.tsx')
);

const SWIPE_MIN_DISTANCE_PX = 40;
const SWIPE_FAST_FLICK_VELOCITY_PX_PER_MS = 0.8;

const SLOT_EDITORIAL_PRIORITY = {
  outer: 1,
  outer_mid: 1.5,
  onepiece: 2,
  dress: 2,
  top_mid: 2.5,
  top: 3,
  underwear_top: 3.2,
  bottom: 4,
  underwear: 4.2,
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
  outer_mid: { ko: 'MID OUTER', en: 'MID OUTER' },
  top_mid: { ko: 'MID TOP', en: 'MID TOP' },
  top: { ko: 'TOP', en: 'TOP' },
  onepiece: { ko: 'ONE-PIECE', en: 'ONE-PIECE' },
  dress: { ko: 'DRESS', en: 'DRESS' },
  underwear_top: { ko: 'INNER TOP', en: 'INNER TOP' },
  underwear: { ko: 'UNDERWEAR', en: 'UNDERWEAR' },
  bottom: { ko: 'BOTTOM', en: 'BOTTOM' },
  socks: { ko: 'SOCKS', en: 'SOCKS' },
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

const AI_BOUNDS_CACHE_MAX = 48;
const aiImageBoundsCache = new Map();

function readCachedAiImageProbe(src) {
  const hit = aiImageBoundsCache.get(src);
  if (!hit) return null;
  aiImageBoundsCache.delete(src);
  aiImageBoundsCache.set(src, hit);
  return hit;
}

function writeCachedAiImageProbe(src, entry) {
  if (!src) return;
  if (aiImageBoundsCache.has(src)) {
    aiImageBoundsCache.delete(src);
  }
  aiImageBoundsCache.set(src, entry);
  if (aiImageBoundsCache.size > AI_BOUNDS_CACHE_MAX) {
    const oldestKey = aiImageBoundsCache.keys().next().value;
    if (oldestKey !== undefined) aiImageBoundsCache.delete(oldestKey);
  }
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
  onUnequipSlot,
  canReturnToCharacter = false,
  onCloseFlatLay,
  resolvedLang,
  mstSwatch,
  heightCm,
  weightKg,
  angleDeg,
  isSynthesizing = false,
  postLoginRevealActive = false,
  postLoginProgress = 0,
  onUserInteractFlatLay,
  saggingFit = false,
  asPrimaryStageTarget,
  transformStyle,
  outfitSaveBar = null,
}) {
  const isEn = resolvedLang === 'en';
  const titleInputRef = useRef(null);
  const { cols, rows } = useMemo(
    () => resolveFlatLayGridMetrics(placements.length),
    [placements.length]
  );

  return (
    <div
      className={`editorial-flatlay-board is-unfolded ${canReturnToCharacter ? 'has-close-action' : ''} ${
        postLoginRevealActive ? 'is-post-login-reveal' : ''
      }`.trim()}
      data-flatlay-board="true"
      data-flatlay-unfolded="true"
      data-flatlay-count={placements.length}
      data-post-login-reveal={postLoginRevealActive ? 'true' : undefined}
      data-vton-after-img={asPrimaryStageTarget ? 'true' : undefined}
      style={transformStyle}
    >
      {/* Compact Header: Icon-only Back Button + Outfit Title & Save Form */}
      <div
        className="editorial-flatlay-header"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editorial-flatlay-header-left">
          {canReturnToCharacter && onCloseFlatLay && (
            <button
              type="button"
              data-flatlay-close-btn="true"
              className="editorial-flatlay-close-btn is-icon-only"
              aria-label={isEn ? 'Return to character fitting view' : '캐릭터 피팅 화면으로 돌아가기'}
              title={isEn ? 'Back to Character' : '캐릭터로 돌아가기'}
              onClick={(e) => {
                e.stopPropagation();
                onCloseFlatLay();
              }}
            >
              <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>

        {asPrimaryStageTarget && outfitSaveBar && typeof outfitSaveBar.onSave === 'function' ? (
          <form
            className="editorial-flatlay-save-bar"
            data-flatlay-save-bar="true"
            onSubmit={outfitSaveBar.onSave}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`studio-clearable-input-wrap editorial-flatlay-save-input-wrap${
                outfitSaveBar.isGoldTitleWriting ? ' is-gold-writing' : ''
              }`}
            >
              <input
                ref={titleInputRef}
                type="text"
                className="editorial-flatlay-save-input"
                placeholder={isEn ? 'Outfit Name' : '코디 이름'}
                aria-label={isEn ? 'Outfit Name' : '코디 이름'}
                value={outfitSaveBar.title || ''}
                onChange={(e) => outfitSaveBar.onTitleChange?.(e.target.value)}
                maxLength={80}
              />
              {outfitSaveBar.isGoldTitleWriting && (outfitSaveBar.title || '').length > 0 && (
                <span
                  key={outfitSaveBar.goldTitleAnimNonce}
                  className="studio-gold-title-overlay"
                  aria-hidden="true"
                  data-gold-title-writing="true"
                >
                  <span className="studio-gold-title-text">{outfitSaveBar.title}</span>
                </span>
              )}
              {(outfitSaveBar.title || '').length > 0 && (
                <button
                  type="button"
                  data-clear-outfit-title="true"
                  className="editorial-flatlay-save-clear-btn"
                  aria-label={isEn ? 'Clear outfit name' : '코디 이름 지우기'}
                  onClick={() => {
                    outfitSaveBar.onClearTitle?.();
                    titleInputRef.current?.focus?.();
                  }}
                >
                  <X size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              id={CARBON_DOM_CONTRACT.studioSaveOutfitBtnId}
              data-testid="mobile-save-outfit-btn"
              type="submit"
              className="editorial-flatlay-save-submit"
              disabled={Boolean(outfitSaveBar.saving) || !outfitSaveBar.canSave}
              aria-label={isEn ? 'Save outfit' : '코디 저장'}
              title={isEn ? 'Save outfit' : '저장'}
            >
              <Check size={14} strokeWidth={2.5} aria-hidden="true" />
              <span>{isEn ? 'Save' : '저장'}</span>
            </button>
          </form>
        ) : (
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
          </div>
        )}
      </div>

      {postLoginRevealActive && (
        <div
          className="editorial-flatlay-countdown-bar"
          data-post-login-countdown="true"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamp(postLoginProgress, 0, 100))}
          aria-label={
            isEn
              ? 'Lookbook preview before showing character'
              : '착장 확인 후 캐릭터로 전환'
          }
        >
          <div className="editorial-flatlay-countdown-track">
            <div
              className="editorial-flatlay-countdown-fill"
              style={{ width: `${clamp(postLoginProgress, 0, 100).toFixed(1)}%` }}
            />
          </div>
          <span className="editorial-flatlay-countdown-copy">
            {isEn
              ? 'Switching to your styled character · Tap an item to edit'
              : '착장 확인 중 · 편집하지 않으면 곧 캐릭터를 보여드려요'}
          </span>
        </div>
      )}

      {placements.length === 0 ? (
        <div className="editorial-flatlay-empty" data-flatlay-empty="true">
          <div
            className="editorial-flatlay-empty-swatch"
            style={{ backgroundColor: mstSwatch.hex }}
            aria-hidden="true"
          />
          <p className="editorial-flatlay-empty-title">
            {isEn ? 'Outfit Board' : '아이템을 선택해 코디를 완성해 보세요'}
          </p>
          <p className="editorial-flatlay-empty-desc">
            {isEn
              ? 'Tap garments in your wardrobe to compose a look or run AI Try-On.'
              : '옷장에서 아이템을 선택하면 한눈에 펼쳐지며, AI 피팅으로 다각도 착장을 생성할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div
          className={`editorial-flatlay-collage ${placements.length >= 8 ? 'is-scrollable' : ''}`}
          data-flatlay-grid-cols={cols}
          data-flatlay-count={placements.length}
          style={{
            '--flatlay-cols': cols,
            '--flatlay-rows': rows,
          }}
        >
          {placements.map((entry, idx) => {
            const { slotKey, garment } = entry;
            const isSelected = !isSynthesizing && activeSlotKey === slotKey;
            const displayName =
              isEn && garment.name_en
                ? garment.name_en
                : localizeGarmentName(garment.name, resolvedLang);
            const baseSlotBadge =
              SLOT_BADGE_LABELS[slotKey]?.[isEn ? 'en' : 'ko'] || slotKey.toUpperCase();
            const slotBadge =
              saggingFit && slotKey === 'bottom'
                ? isEn
                  ? 'BOTTOM · SAGGING'
                  : '하의 · 새깅 핏'
                : saggingFit && slotKey === 'underwear'
                  ? isEn
                    ? 'UNDERWEAR · BAND'
                    : '언더웨어 · 밴드 노출'
                  : baseSlotBadge;
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
                className={`editorial-flatlay-item ${isSelected ? 'is-selected' : ''} ${
                  postLoginRevealActive ? 'is-stagger-reveal' : ''
                }`.trim()}
                style={postLoginRevealActive ? { '--stagger-idx': idx } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onUserInteractFlatLay?.();
                  onSelectSlot?.(slotKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onUserInteractFlatLay?.();
                    onSelectSlot?.(slotKey);
                  }
                }}
              >
                <span className="editorial-flatlay-slot-tag">{slotBadge}</span>
                {onUnequipSlot && (
                  <button
                    type="button"
                    className="editorial-flatlay-remove-btn"
                    data-flatlay-remove-slot={slotKey}
                    aria-label={
                      isEn ? `Remove ${displayName}` : `${displayName} 착용 해제`
                    }
                    title={isEn ? 'Remove item' : '착용 해제'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUserInteractFlatLay?.();
                      onUnequipSlot(slotKey);
                    }}
                  >
                    <X size={11} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                )}
                <div className="editorial-flatlay-cutout-wrap">
                  <StudioGarmentImage
                    item={garment}
                    alt={displayName}
                    allowStorePhoto={allowStorePhoto}
                    eager
                    fetchPriority="high"
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
  onUnequipSlot,
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
  angleSlices = null,
  continuousAngleDeg,
  isAngleScrubbing = false,
  scrollResidualYawDeg = 0,
  forceMirrorX = false,
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
  onFloorPlacementChange,
  threeStageAvailable = true,
  stageLightingFrame = null,
  auraTier = 'C',
  angularVelocityDegPerSec = 0,
  postLoginRevealActive = false,
  postLoginProgress = 0,
  onUserInteractFlatLay,
  saggingFit = false,
  legacyMode,
  lang,
  outfitSaveBar = null,
}) {
  const viewerMode = normalizeViewerMode(legacyMode);
  const resolvedStyleMode = normalizeVtonStyleMode(styleMode);
  const safeAngleDeg = normalizeTurnaround360Angle(viewAngleDeg, DEFAULT_TURNAROUND_ANGLE);
  const angleSpec = useMemo(() => resolve360AngleRenderSpec(safeAngleDeg), [safeAngleDeg]);
  const effectiveMirrorX = Boolean(angleSpec.mirrorX || forceMirrorX);
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
    () => computeOutfitComboId(slots, profile.dominantHand),
    [slots, profile.dominantHand]
  );

  const relightIdentityKey = `${profile.avatarConfigHash}::${outfitComboId}`;

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

  const safeZoom = 1;
  const safePanX = 0;
  const safePanY = 0;
  const safeSplit = clamp(Number(compareSplitPct) || 50, 5, 95);

  const hasAiImage = Boolean(stageMode === 'ai-vton' && aiImageUrl);
  const canPinchZoom = false;
  const [relightCanvasReady, setRelightCanvasReady] = useState(false);
  const [aiPrimaryPainted, setAiPrimaryPainted] = useState(false);
  const [relightMountReady, setRelightMountReady] = useState(false);
  const isRelightCanvasActive = Boolean(hasAiImage && relightCanvasReady);

  useEffect(() => {
    if (!hasAiImage) {
      setAiPrimaryPainted(false);
      setRelightMountReady(false);
      setRelightCanvasReady(false);
      return undefined;
    }
    if (aiImgRef.current?.complete && aiImgRef.current.naturalWidth > 0) {
      setAiPrimaryPainted(true);
    }
    return undefined;
  }, [hasAiImage, aiImageUrl]);

  useEffect(() => {
    if (!hasAiImage || !aiPrimaryPainted || relightMountReady) return undefined;
    return scheduleIdleTask(() => {
      setRelightMountReady(true);
    }, 320);
  }, [hasAiImage, aiPrimaryPainted, relightMountReady]);

  const stageRef = useRef(null);
  const aiImgRef = useRef(null);
  const outgoingGhostImgRef = useRef(null);
  const motionBlurFeRef = useRef(null);
  const bridgeRafRef = useRef(null);
  const prevCommittedFrameRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [aiImgAspect, setAiImgAspect] = useState(0.76);
  const [aiContentBounds, setAiContentBounds] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [isRotatingDrag, setIsRotatingDrag] = useState(false);
  const [swipeDragPx, setSwipeDragPx] = useState(0);
  const [isSliderDragging, setIsSliderDragging] = useState(false);

  const recenterTimerRef = useRef(null);
  const pinchPointersRef = useRef(new Map());
  const pinchSessionRef = useRef(null);
  const liveZoomRef = useRef(safeZoom);
  liveZoomRef.current = safeZoom;

  const clearRecenterTimer = useCallback(() => {
    if (recenterTimerRef.current) {
      clearTimeout(recenterTimerRef.current);
      recenterTimerRef.current = null;
    }
  }, []);

  const measureAiImageEl = useCallback(
    (img, expectedSrc) => {
      const cached = expectedSrc ? readCachedAiImageProbe(expectedSrc) : null;
      if (cached) {
        setAiImgAspect((prev) => (Math.abs(prev - cached.ratio) < 0.005 ? prev : cached.ratio));
        setAiContentBounds((prev) => {
          if (!cached.bounds) {
            return prev?.src === expectedSrc ? null : prev;
          }
          if (
            prev &&
            prev.src === cached.bounds.src &&
            prev.identityKey === relightIdentityKey &&
            Math.abs(prev.topRatio - cached.bounds.topRatio) < 0.005 &&
            Math.abs(prev.bottomRatio - cached.bounds.bottomRatio) < 0.005
          ) {
            return prev;
          }
          return { ...cached.bounds, identityKey: relightIdentityKey };
        });
        return;
      }

      const nw = img?.naturalWidth || 0;
      const nh = img?.naturalHeight || 0;
      if (nw < 16 || nh < 16) return;
      const ratio = Math.round((nw / nh) * 1000) / 1000;
      setAiImgAspect((prev) => (Math.abs(prev - ratio) < 0.005 ? prev : ratio));

      if (typeof document === 'undefined') return;
      const th = 128;
      const tw = Math.max(16, Math.min(96, Math.round(ratio * th)));
      const probe = document.createElement('canvas');
      probe.width = tw;
      probe.height = th;
      try {
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, tw, th);
        const data = ctx.getImageData(0, 0, tw, th).data;
        const topCornersTransparent = data[3] <= 36 && data[(tw - 1) * 4 + 3] <= 36;
        if (!topCornersTransparent) {
          writeCachedAiImageProbe(expectedSrc, { ratio, bounds: null });
          setAiContentBounds((prev) => (prev?.src === expectedSrc ? null : prev));
          return;
        }
        let minRow = th;
        let maxRow = -1;
        for (let y = 0; y < th; y += 1) {
          const rowOff = y * tw;
          let rowOpaque = 0;
          for (let x = 0; x < tw; x += 1) {
            if (data[(rowOff + x) * 4 + 3] > 36) {
              rowOpaque += 1;
            }
          }
          if (rowOpaque >= 1) {
            if (y < minRow) minRow = y;
            if (y > maxRow) maxRow = y;
          }
        }
        if (maxRow > minRow + Math.round(th * 0.2)) {
          const nextBounds = {
            src: expectedSrc,
            identityKey: relightIdentityKey,
            topRatio: Math.round((minRow / th) * 1000) / 1000,
            bottomRatio: Math.round(((maxRow + 1) / th) * 1000) / 1000,
          };
          writeCachedAiImageProbe(expectedSrc, { ratio, bounds: nextBounds });
          setAiContentBounds((prev) =>
            prev &&
            prev.src === nextBounds.src &&
            prev.identityKey === nextBounds.identityKey &&
            Math.abs(prev.topRatio - nextBounds.topRatio) < 0.005 &&
            Math.abs(prev.bottomRatio - nextBounds.bottomRatio) < 0.005
              ? prev
              : nextBounds
          );
        } else {
          writeCachedAiImageProbe(expectedSrc, { ratio, bounds: null });
        }
      } catch {
        setAiContentBounds((prev) => (prev?.src === expectedSrc ? null : prev));
      } finally {
        probe.width = 0;
        probe.height = 0;
      }
    },
    [relightIdentityKey]
  );

  useEffect(() => {
    if (!aiImageUrl) return;
    const cached = readCachedAiImageProbe(aiImageUrl);
    if (cached) {
      setAiImgAspect((prev) => (Math.abs(prev - cached.ratio) < 0.005 ? prev : cached.ratio));
      setAiContentBounds((prev) =>
        cached.bounds
          ? prev?.src === cached.bounds.src && prev?.identityKey === relightIdentityKey
            ? prev
            : { ...cached.bounds, identityKey: relightIdentityKey }
          : prev?.src === aiImageUrl
            ? null
            : prev
      );
      return;
    }
    const img = aiImgRef.current;
    if (img?.complete && img.naturalWidth >= 16) {
      measureAiImageEl(img, aiImageUrl);
    }
  }, [aiImageUrl, measureAiImageEl, relightIdentityKey]);

  useEffect(() => {
    if (!canPinchZoom) {
      pinchPointersRef.current.clear();
      pinchSessionRef.current = null;
      setIsPinching(false);
    }
  }, [canPinchZoom]);

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

  const handleAiImageLoad = useCallback(
    (e) => {
      setAiPrimaryPainted(true);
      const src = aiImageUrl || e.currentTarget.currentSrc || e.currentTarget.src || '';
      measureAiImageEl(e.currentTarget, src);
    },
    [aiImageUrl, measureAiImageEl]
  );

  // Synchronously resolve cached probe or carry over same-outfit bounds across turnaround angles
  // so rotating from 0° -> 45° R never drops to null fallback bounds for 1 frame (zero scale pop).
  const cachedAiProbe = aiImageUrl ? readCachedAiImageProbe(aiImageUrl) : null;
  const resolvedAiImgAspect = cachedAiProbe?.ratio ?? aiImgAspect;
  const activeContentBounds =
    cachedAiProbe?.bounds ??
    (aiContentBounds &&
    (aiContentBounds.src === aiImageUrl || aiContentBounds.identityKey === relightIdentityKey)
      ? aiContentBounds
      : null);

  const floorPlacement = useMemo(
    () =>
      computeMannequinFloorPlacement({
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
        imageAspectRatio: resolvedAiImgAspect,
        topRatio: activeContentBounds?.topRatio ?? null,
        bottomRatio: activeContentBounds?.bottomRatio ?? null,
        heightCm: resolvedHeightCm,
      }),
    [
      stageSize.width,
      stageSize.height,
      resolvedAiImgAspect,
      activeContentBounds?.topRatio,
      activeContentBounds?.bottomRatio,
      resolvedHeightCm,
    ]
  );

  const idealBaseScale = floorPlacement.effectiveBaseScale;

  useEffect(() => {
    onFloorPlacementChange?.(floorPlacement);
  }, [floorPlacement, onFloorPlacementChange]);

  // Auto-recenter mannequin position to dead-center (`{ x: 0, y: 0 }`) 1,000ms (1 second) after pan/pinch release
  useEffect(() => {
    clearRecenterTimer();
    if (!hasAiImage || isPanning || isPinching || !onPanChange) return undefined;
    if (Math.abs(safePanX) < 0.5 && Math.abs(safePanY) < 0.5) return undefined;
    recenterTimerRef.current = setTimeout(() => {
      recenterTimerRef.current = null;
      onPanChange({ x: 0, y: 0 });
    }, 1000);
    return clearRecenterTimer;
  }, [hasAiImage, isPanning, isPinching, safePanX, safePanY, onPanChange, clearRecenterTimer]);

  const gestureRef = useRef(null);

  const clampPanOffset = useCallback((nextX, nextY, currentZoom) => {
    if (currentZoom <= 1.01) return { x: 0, y: 0 };
    const el = stageRef.current;
    const width = el?.clientWidth || 380;
    const height = el?.clientHeight || 480;
    const maxX = Math.max(24, ((currentZoom - 1) * width) / 2);
    const maxY = Math.max(24, ((currentZoom - 1) * height) / 2);
    return {
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY),
    };
  }, []);

  const handleStageWheel = useCallback(() => {
    // Character zoom is intentionally disabled to preserve wide-angle architectural framing.
  }, []);

  const suppressNextClickRef = useRef(false);

  // Safari / iOS / Android WebView 2-touch pinch fallback (prevents native browser page pinch-zoom)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !canPinchZoom) return undefined;

    const handleTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const target = e.target;
      if (target instanceof Element && target.closest('[data-vton-compare-slider], button')) {
        return;
      }
      e.preventDefault();
      gestureRef.current = null;
      clearRecenterTimer();
      suppressNextClickRef.current = true;
      setIsPanning(false);
      setIsRotatingDrag(false);
      setSwipeDragPx(0);
      setIsPinching(true);
      if (pinchPointersRef.current.size < 2) {
        const [t1, t2] = e.touches;
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchSessionRef.current = {
          startDist: Math.max(24, dist),
          startZoom: liveZoomRef.current,
          source: 'touch',
        };
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      if (pinchPointersRef.current.size >= 2 && pinchSessionRef.current?.source === 'pointer') {
        return;
      }
      gestureRef.current = null;
      clearRecenterTimer();
      suppressNextClickRef.current = true;
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (!pinchSessionRef.current) {
        pinchSessionRef.current = {
          startDist: Math.max(24, dist),
          startZoom: liveZoomRef.current,
          source: 'touch',
        };
        setIsPinching(true);
      }
      const { startDist, startZoom } = pinchSessionRef.current;
      const nextZoom = clamp(Number((startZoom * (dist / startDist)).toFixed(3)), 1, 3);
      liveZoomRef.current = nextZoom;
      onZoomChange?.(nextZoom);
      if (nextZoom <= 1.01) {
        onPanChange?.({ x: 0, y: 0 });
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length >= 2) return;
      if (pinchSessionRef.current?.source === 'touch') {
        pinchSessionRef.current = null;
        gestureRef.current = null;
        suppressNextClickRef.current = true;
        setIsPinching(false);
        if (liveZoomRef.current <= 1.02) {
          liveZoomRef.current = 1;
          onZoomChange?.(1);
          onPanChange?.({ x: 0, y: 0 });
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [canPinchZoom, clearRecenterTimer, onZoomChange, onPanChange]);

  const handleStagePointerDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== undefined && e.button !== 0) return;
      suppressNextClickRef.current = false;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-vton-compare-slider], button')
      ) {
        return;
      }

      if (canPinchZoom) {
        pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinchPointersRef.current.size >= 2) {
          const prevGesture = gestureRef.current;
          if (prevGesture?.captured && prevGesture.pointerId !== null) {
            try {
              e.currentTarget.releasePointerCapture(prevGesture.pointerId);
            } catch {
              // Ignore release errors
            }
          }
          gestureRef.current = null;
          clearRecenterTimer();
          suppressNextClickRef.current = true;
          setIsPanning(false);
          setIsRotatingDrag(false);
          setSwipeDragPx(0);
          setIsPinching(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore synthetic pointer capture errors
          }
          const [p1, p2] = Array.from(pinchPointersRef.current.values());
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          pinchSessionRef.current = {
            startDist: Math.max(24, dist),
            startZoom: liveZoomRef.current,
            source: 'pointer',
          };
          return;
        }
      }

      const tNow = nowMs();
      if (hasAiImage && safeZoom > 1.01) {
        clearRecenterTimer();
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
    [canPinchZoom, hasAiImage, safeZoom, safePanX, safePanY, clearRecenterTimer]
  );

  const handleStagePointerMove = useCallback(
    (e) => {
      if (pinchPointersRef.current.has(e.pointerId)) {
        pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (canPinchZoom && pinchPointersRef.current.size >= 2) {
        gestureRef.current = null;
        clearRecenterTimer();
        suppressNextClickRef.current = true;
        const [p1, p2] = Array.from(pinchPointersRef.current.values());
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (!pinchSessionRef.current) {
          pinchSessionRef.current = {
            startDist: Math.max(24, dist),
            startZoom: liveZoomRef.current,
            source: 'pointer',
          };
          setIsPinching(true);
        }
        const { startDist, startZoom } = pinchSessionRef.current;
        const nextZoom = clamp(Number((startZoom * (dist / startDist)).toFixed(3)), 1, 3);
        liveZoomRef.current = nextZoom;
        onZoomChange?.(nextZoom);
        if (nextZoom <= 1.01) {
          onPanChange?.({ x: 0, y: 0 });
        } else if (onPanChange && (safePanX !== 0 || safePanY !== 0)) {
          onPanChange(clampPanOffset(safePanX, safePanY, nextZoom));
        }
        return;
      }

      const g = gestureRef.current;
      if (!g || !g.active || g.pointerId !== e.pointerId) return;

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
    [
      canPinchZoom,
      safeZoom,
      safePanX,
      safePanY,
      onZoomChange,
      onPanChange,
      clampPanOffset,
      clearRecenterTimer,
    ]
  );

  const finishStagePointer = useCallback(
    (e, isCancel = false) => {
      const wasTrackedInPinch = pinchPointersRef.current.delete(e.pointerId);
      if (wasTrackedInPinch) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors
        }
      }

      if (pinchSessionRef.current && pinchPointersRef.current.size < 2) {
        pinchSessionRef.current = null;
        gestureRef.current = null;
        suppressNextClickRef.current = true;
        setIsPinching(false);
        setIsPanning(false);
        setIsRotatingDrag(false);
        setSwipeDragPx(0);
        if (liveZoomRef.current <= 1.02) {
          liveZoomRef.current = 1;
          onZoomChange?.(1);
          onPanChange?.({ x: 0, y: 0 });
        }
        return;
      }

      const g = gestureRef.current;
      if (!g || !g.active) {
        if (pinchPointersRef.current.size === 0) {
          setIsPinching(false);
        }
        return;
      }

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

      gestureRef.current = null;
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
          startOffsetDeg: clamp(dx * 0.34, -40, 40),
        });
      }
    },
    [onSwipeRotate, onZoomChange, onPanChange]
  );

  const handleStagePointerUp = useCallback(
    (e) => finishStagePointer(e, false),
    [finishStagePointer]
  );

  const handleStagePointerCancel = useCallback(
    (e) => finishStagePointer(e, true),
    [finishStagePointer]
  );

  const handleStagePointerLeave = useCallback((e) => {
    if (e.pointerType === 'mouse' && !e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      pinchPointersRef.current.delete(e.pointerId);
    }
  }, []);

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

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const kineticBlurPx = useMemo(
    () => computeDirectionalBlurPx(angularVelocityDegPerSec, prefersReducedMotion),
    [angularVelocityDegPerSec, prefersReducedMotion]
  );

  useEffect(() => {
    const fe = motionBlurFeRef.current;
    if (!fe) return;
    if (kineticBlurPx > 0.05) {
      fe.setAttribute('stdDeviation', `${kineticBlurPx.toFixed(2)} 0`);
    } else {
      fe.setAttribute('stdDeviation', '0 0');
    }
  }, [kineticBlurPx]);

  const buildLayerTransformString = useCallback(
    ({ mirrorXFlag, extraYawDeg = 0 }) => {
      const dragNudgeX = isRotatingDrag ? clamp(swipeDragPx * 0.14, -12, 12) : 0;
      const dragYawDeg = isRotatingDrag ? clamp(swipeDragPx * 0.08, -7, 7) : 0;
      const totalYawDeg =
        angleSpec.perspectiveYawDeg + dragYawDeg + safeScrollResidualYaw + extraYawDeg;
      const effectiveScale = floorPlacement.effectiveBaseScale * safeZoom;
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
      if (mirrorXFlag) {
        parts.push('scaleX(-1)');
      }
      return parts.length > 0 ? parts.join(' ') : 'none';
    },
    [
      angleSpec.perspectiveYawDeg,
      isRotatingDrag,
      swipeDragPx,
      safeScrollResidualYaw,
      safePanX,
      safePanY,
      safeZoom,
      floorPlacement.effectiveBaseScale,
    ]
  );

  const modelSizeStyle = useMemo(
    () =>
      floorPlacement.renderedContentW && floorPlacement.renderedContentH
        ? {
            width: `${floorPlacement.renderedContentW}px`,
            height: `${floorPlacement.renderedContentH}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            flex: '0 0 auto',
          }
        : {},
    [floorPlacement.renderedContentW, floorPlacement.renderedContentH]
  );

  const modelTransformStyle = useMemo(
    () => ({
      ...modelSizeStyle,
      transformOrigin: floorPlacement.soleTransformOrigin,
      transform: buildLayerTransformString({ mirrorXFlag: effectiveMirrorX, extraYawDeg: 0 }),
    }),
    [
      modelSizeStyle,
      floorPlacement.soleTransformOrigin,
      buildLayerTransformString,
      effectiveMirrorX,
    ]
  );

  // Continuous drag + scroll yaw passed into the Three.js curved Cylinder mesh
  const relightExternalYawDeg = useMemo(() => {
    const dragYawDeg = isRotatingDrag ? clamp(swipeDragPx * 0.08, -7, 7) : 0;
    return angleSpec.perspectiveYawDeg + dragYawDeg + safeScrollResidualYaw;
  }, [angleSpec.perspectiveYawDeg, isRotatingDrag, swipeDragPx, safeScrollResidualYaw]);

  // Scale/translate transform for the WebGL character canvas WITHOUT rotateY or scaleX(-1)
  // so cylinder Y-rotation and mirrorX execute inside the GLSL shader and screen-left/right neon lights stay accurate.
  const relightCanvasTransformStyle = useMemo(() => {
    const dragNudgeX = isRotatingDrag ? clamp(swipeDragPx * 0.14, -12, 12) : 0;
    const effectiveScale = floorPlacement.effectiveBaseScale * safeZoom;
    const parts = [];
    if (safeZoom > 1.001 || safePanX !== 0 || safePanY !== 0 || dragNudgeX !== 0) {
      parts.push(
        `translate3d(${(safePanX + dragNudgeX).toFixed(1)}px, ${safePanY.toFixed(1)}px, 0)`
      );
    }
    if (Math.abs(effectiveScale - 1) > 0.002) {
      parts.push(`scale(${effectiveScale.toFixed(3)})`);
    }
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [
    isRotatingDrag,
    swipeDragPx,
    floorPlacement.effectiveBaseScale,
    safeZoom,
    safePanX,
    safePanY,
  ]);

  // relightIdentityKey is hoisted above floorPlacement so turnaround bounds stay locked per outfit.

  // Dual-layer counter-rotating 2.5D rotateY bridge + 105ms smoothstep S-curve crossfade
  // runs imperatively in rAF so angle transitions trigger zero extra React re-renders.
  useLayoutEffect(() => {
    const incomingEl = aiImgRef.current;
    const ghostEl = outgoingGhostImgRef.current;
    if (bridgeRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(bridgeRafRef.current);
      bridgeRafRef.current = null;
    }

    const identityKey = `${profile.avatarConfigHash}::${outfitComboId}`;
    const prev = prevCommittedFrameRef.current;
    const nextFrame =
      hasAiImage && aiImageUrl
        ? {
            src: aiImageUrl,
            angleDeg: safeAngleDeg,
            mirrorX: effectiveMirrorX,
            identityKey,
          }
        : null;
    prevCommittedFrameRef.current = nextFrame;

    const resetVisuals = () => {
      if (ghostEl) {
        ghostEl.style.opacity = '0';
        ghostEl.style.visibility = 'hidden';
      }
      if (incomingEl) {
        incomingEl.style.opacity = '1';
        incomingEl.style.transform = buildLayerTransformString({
          mirrorXFlag: effectiveMirrorX,
          extraYawDeg: 0,
        });
      }
    };

    if (
      isRelightCanvasActive ||
      !nextFrame ||
      !prev ||
      !incomingEl ||
      !ghostEl ||
      prefersReducedMotion ||
      prev.identityKey !== nextFrame.identityKey ||
      prev.src === nextFrame.src ||
      prev.angleDeg === nextFrame.angleDeg ||
      typeof requestAnimationFrame !== 'function'
    ) {
      resetVisuals();
      return undefined;
    }

    const delta = shortestAngleDeltaDeg(prev.angleDeg, nextFrame.angleDeg);
    const directionSign = delta >= 0 ? 1 : -1;
    const durationMs = Math.abs(angularVelocityDegPerSec) > 360 ? 92 : 112;

    ghostEl.src = prev.src;
    ghostEl.style.visibility = 'visible';
    ghostEl.style.transformOrigin = floorPlacement.soleTransformOrigin;
    incomingEl.style.transformOrigin = floorPlacement.soleTransformOrigin;

    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (nowTs) => {
      const elapsed = Math.max(0, nowTs - startTs);
      const progress = Math.min(1, elapsed / durationMs);
      const bridge = computeCrossfadeBridgeState({
        progress,
        directionSign,
        reducedMotion: false,
      });

      ghostEl.style.opacity = String(bridge.outgoingOpacity);
      ghostEl.style.transform = buildLayerTransformString({
        mirrorXFlag: prev.mirrorX,
        extraYawDeg: bridge.outgoingYawDeg,
      });

      incomingEl.style.opacity = String(bridge.incomingOpacity);
      incomingEl.style.transform = buildLayerTransformString({
        mirrorXFlag: nextFrame.mirrorX,
        extraYawDeg: bridge.incomingYawDeg,
      });

      if (!bridge.done) {
        bridgeRafRef.current = requestAnimationFrame(tick);
      } else {
        bridgeRafRef.current = null;
        resetVisuals();
      }
    };

    tick(startTs);

    return () => {
      if (bridgeRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(bridgeRafRef.current);
        bridgeRafRef.current = null;
      }
    };
  }, [
    hasAiImage,
    aiImageUrl,
    safeAngleDeg,
    effectiveMirrorX,
    profile.avatarConfigHash,
    outfitComboId,
    prefersReducedMotion,
    angularVelocityDegPerSec,
    floorPlacement.soleTransformOrigin,
    buildLayerTransformString,
    isRelightCanvasActive,
  ]);

  const liveContinuousAngleDeg = useMemo(() => {
    const baseAngle =
      typeof continuousAngleDeg === 'number' && Number.isFinite(continuousAngleDeg)
        ? continuousAngleDeg
        : safeAngleDeg;
    const dragOffset = isRotatingDrag ? clamp(swipeDragPx * 0.34, -40, 40) : 0;
    return baseAngle + dragOffset;
  }, [continuousAngleDeg, safeAngleDeg, isRotatingDrag, swipeDragPx]);

  const shadowTransformStyle = useMemo(() => {
    const effectiveScale = floorPlacement.effectiveBaseScale * safeZoom;
    const shadowScale = 1 + (effectiveScale - 1) * 0.55;
    const shadowAngleScaleX = computeGroundShadowScaleX(liveContinuousAngleDeg);
    const scaleX = shadowScale * shadowAngleScaleX;
    const scaleY = shadowScale;
    const hasTranslation = safePanX !== 0 || safePanY !== 0;
    return {
      top: `calc(${floorPlacement.soleStageTopPct.toFixed(2)}% - 13px)`,
      bottom: 'auto',
      ...(hasTranslation || Math.abs(scaleX - 1) > 0.005 || Math.abs(scaleY - 1) > 0.005
        ? {
            transform: `translate3d(${safePanX.toFixed(1)}px, ${safePanY.toFixed(1)}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
          }
        : {}),
    };
  }, [
    safePanX,
    safePanY,
    safeZoom,
    liveContinuousAngleDeg,
    floorPlacement.effectiveBaseScale,
    floorPlacement.soleStageTopPct,
  ]);

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
      className={`studio-2d-model-stage editorial-vton-stage ${hasAiImage ? 'is-ai-stage' : 'is-flatlay-stage'} ${isRotatingDrag || isScrollScrubbing ? 'is-panning' : ''} ${isRotatingDrag ? 'is-swipe-rotating' : ''}`.trim()}
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
      onPointerLeave={handleStagePointerLeave}
      onClick={handleStageClick}
      onKeyDown={handleStageKeyDown}
    >
      <div className="studio-2d-viewport">
        {/* Primary After Layer: Layer 1 Floor Contact Shadow + Layer 2 RGBA Model (or Editorial Flat-Lay Board) */}
        <div className="studio-2d-layer studio-2d-layer-after">
          {hasAiImage ? (
            <>
              {!threeStageAvailable && (
                <div
                  aria-hidden="true"
                  data-floor-contact-shadow="true"
                  className="studio-floor-contact-shadow"
                  style={shadowTransformStyle}
                />
              )}
              <div
                className="studio-stage-aura"
                data-aura-tier={auraTier}
                aria-hidden="true"
              />
              <svg
                aria-hidden="true"
                width="0"
                height="0"
                className="studio-vton-svg-filters"
                focusable="false"
              >
                <defs>
                  <filter
                    id="studio-vton-motion-blur"
                    x="-12%"
                    y="-4%"
                    width="124%"
                    height="108%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur
                      ref={motionBlurFeRef}
                      in="SourceGraphic"
                      stdDeviation="0 0"
                    />
                  </filter>
                </defs>
              </svg>
              <div
                className={`studio-vton-turnaround-stack ${
                  !isRelightCanvasActive && kineticBlurPx > 0.05 ? 'is-kinetic-blur' : ''
                } ${isRelightCanvasActive ? 'is-relight-webgl-active' : ''}`.trim()}
                data-kinetic-blur={kineticBlurPx > 0.05 ? kineticBlurPx.toFixed(2) : '0'}
                data-relight-webgl={isRelightCanvasActive ? 'active' : 'fallback'}
                style={modelSizeStyle}
              >
                {relightMountReady && (
                  <Suspense fallback={null}>
                    <StudioCharacterRelightCanvas
                      imageUrl={aiImageUrl}
                      angleDeg={safeAngleDeg}
                      mirrorX={effectiveMirrorX}
                      identityKey={relightIdentityKey}
                      angleSlices={angleSlices}
                      continuousAngleDeg={liveContinuousAngleDeg}
                      isLiveScrubbing={Boolean(isAngleScrubbing || isRotatingDrag)}
                      lightingFrame={stageLightingFrame}
                      externalYawDeg={relightExternalYawDeg}
                      kineticBlurPx={kineticBlurPx}
                      widthPx={floorPlacement.renderedContentW || null}
                      heightPx={floorPlacement.renderedContentH || null}
                      transformOrigin={floorPlacement.soleTransformOrigin}
                      transformStyle={relightCanvasTransformStyle}
                      prefersReducedMotion={prefersReducedMotion}
                      onWebGlReadyChange={setRelightCanvasReady}
                    />
                  </Suspense>
                )}
                <img
                  ref={outgoingGhostImgRef}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  decoding="async"
                  fetchPriority="low"
                  className={`studio-2d-media-el editorial-ai-vton-img editorial-ai-vton-img-ghost ${
                    isRelightCanvasActive ? 'is-relight-canvas-backed' : ''
                  }`.trim()}
                  style={{
                    ...modelSizeStyle,
                    transformOrigin: floorPlacement.soleTransformOrigin,
                  }}
                />
                <img
                  ref={aiImgRef}
                  src={aiImageUrl}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
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
                  } ${isRelightCanvasActive ? 'is-relight-canvas-backed' : ''}`.trim()}
                  draggable={false}
                  style={modelTransformStyle}
                />
              </div>
            </>
          ) : (
            <FlatLayLookbookSurface
              placements={placements}
              activeSlotKey={activeSlotKey}
              onSelectSlot={onSelectSlot}
              onUnequipSlot={onUnequipSlot}
              canReturnToCharacter={canReturnToCharacter}
              onCloseFlatLay={onCloseFlatLay}
              resolvedLang={resolvedLang}
              mstSwatch={mstSwatch}
              heightCm={resolvedHeightCm}
              weightKg={resolvedWeightKg}
              angleDeg={safeAngleDeg}
              isSynthesizing={aiLoading}
              postLoginRevealActive={postLoginRevealActive}
              postLoginProgress={postLoginProgress}
              onUserInteractFlatLay={onUserInteractFlatLay}
              saggingFit={Boolean(saggingFit)}
              asPrimaryStageTarget
              transformStyle={undefined}
              outfitSaveBar={outfitSaveBar}
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
                isSynthesizing={aiLoading}
                saggingFit={Boolean(saggingFit)}
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

    </div>
  );
});

export default EditorialFlatLayBoard;
