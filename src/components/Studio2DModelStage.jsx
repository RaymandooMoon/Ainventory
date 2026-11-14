import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  ALL_ISO_VIEW_ANGLES,
  DEFAULT_ISO_VIEW_ANGLE,
  avatarSpecToLegacyBodySpec,
  bridgeLegacyPropsToAvatarSpec,
  computeAvatarConfigHash,
  normalizeViewAngleDeg,
  sanitizeAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import { renderEditorialFashionCanvas } from '../services/editorial2DArtist.ts';
import { normalizeBodyShape, sanitizeBodySpec } from '../services/parametricAvatar3D.ts';
import { computeSkinShadingPalette } from '../services/skinToneAnalyzer.ts';
import {
  normalizeGenderNeutralProfile,
  normalizeViewerMode,
} from '../services/vton2DService.ts';
import { getStoredLang } from '../utils/i18n.ts';
import './Studio2DFittingViewer.css';

const MIN_STAGE_ZOOM = 1;
const MAX_STAGE_ZOOM = 3;
const DBLCLICK_TARGET_ZOOM = 1.85;
const MIN_SPLIT_PCT = 5;
const MAX_SPLIT_PCT = 95;
const ROTATE_DRAG_STEP_PX = 34;

function clampZoom(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return MIN_STAGE_ZOOM;
  return Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, Number(n.toFixed(3))));
}

function clampSplitPct(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 50;
  return Math.min(MAX_SPLIT_PCT, Math.max(MIN_SPLIT_PCT, Number(n.toFixed(2))));
}

function clampPanToBounds(pan, zoomLevel, stageEl) {
  if (!pan || zoomLevel <= 1.01) {
    return { x: 0, y: 0 };
  }
  const width = stageEl?.clientWidth || 360;
  const height = stageEl?.clientHeight || 480;
  const maxX = Math.max(0, ((zoomLevel - 1) * width) / 2);
  const maxY = Math.max(0, ((zoomLevel - 1) * height) / 2);
  const rawX = Number.isFinite(pan.x) ? pan.x : 0;
  const rawY = Number.isFinite(pan.y) ? pan.y : 0;
  return {
    x: Math.min(maxX, Math.max(-maxX, Math.round(rawX * 10) / 10)),
    y: Math.min(maxY, Math.max(-maxY, Math.round(rawY * 10) / 10)),
  };
}

/**
 * Pure 2D Isometric Editorial Fashion Model & Virtual Try-On Stage
 * - Zero WebGL / Three.js / .glb dependencies
 * - High-DPI live 2D isometric canvas preview (8 angles, default 45° quarter-view) + VTON image display
 * - Horizontal drag-to-rotate (45° steps at 1x zoom), smooth 1x ~ 3x zoom & bounded drag-to-pan
 * - Pixel-aligned Before / After split comparison view with keyboard & pointer slider
 */
const Studio2DModelStage = memo(function Studio2DModelStage({
  skinToneHex,
  personalColor,
  skinProfile = null,
  bodySpec = null,
  user = null,
  avatarSpec = null,
  avatarConfigHash = null,
  viewAngleDeg,
  onViewAngleChange = null,
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
  legacyMode,
  mode,
  viewMode,
  renderMode,
  lang,
}) {
  const stageRef = useRef(null);
  const compactCanvasRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const beforeCanvasRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastPinchDistRef = useRef(0);
  const rotateDragAnchorXRef = useRef(null);

  const [internalZoom, setInternalZoom] = useState(1);
  const [internalPan, setInternalPan] = useState({ x: 0, y: 0 });
  const [internalSplitPct, setInternalSplitPct] = useState(50);
  const [internalViewAngleDeg, setInternalViewAngleDeg] = useState(DEFAULT_ISO_VIEW_ANGLE);
  const [isPanning, setIsPanning] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const viewerMode = normalizeViewerMode(legacyMode ?? mode ?? viewMode ?? renderMode);
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const resolvedLang =
    lang === 'en' || lang === 'ko'
      ? lang
      : typeof document !== 'undefined' && document.documentElement.lang === 'en'
        ? 'en'
        : getStoredLang();

  const { spec: storeAvatarSpec, avatarConfigHash: storeAvatarHash } = useAvatarSpec();

  const bridgedAvatar = useMemo(() => {
    void storeAvatarSpec;
    void storeAvatarHash;
    const explicitSkin = skinToneHex || skinProfile?.skinToneHex;
    const explicitPc = personalColor || skinProfile?.personalColor;
    const mergedSkinProfile =
      skinProfile || explicitSkin || explicitPc
        ? {
            ...(skinProfile || {}),
            ...(explicitSkin ? { skinToneHex: explicitSkin } : {}),
            ...(explicitPc ? { personalColor: explicitPc } : {}),
          }
        : null;
    return bridgeLegacyPropsToAvatarSpec({
      skinProfile: mergedSkinProfile,
      bodySpec,
      user,
      personReferenceUrl,
    });
  }, [
    storeAvatarSpec,
    storeAvatarHash,
    skinProfile,
    skinToneHex,
    personalColor,
    bodySpec,
    user,
    personReferenceUrl,
  ]);

  const effectiveAvatarSpec = useMemo(
    () => (avatarSpec ? sanitizeAvatarSpec(avatarSpec) : bridgedAvatar.spec),
    [avatarSpec, bridgedAvatar.spec]
  );

  const effectiveAvatarHash = useMemo(() => {
    if (avatarConfigHash) return avatarConfigHash;
    if (avatarSpec) return computeAvatarConfigHash(effectiveAvatarSpec);
    return bridgedAvatar.avatarConfigHash;
  }, [avatarConfigHash, avatarSpec, effectiveAvatarSpec, bridgedAvatar.avatarConfigHash]);

  const effectiveViewAngleDeg =
    viewAngleDeg !== undefined
      ? normalizeViewAngleDeg(viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE)
      : internalViewAngleDeg;

  const resolvedSkinToneHex =
    skinToneHex ||
    skinProfile?.skinToneHex ||
    effectiveAvatarSpec?.appearance?.skinToneHex ||
    '#DFBA9B';
  const resolvedPersonalColor =
    personalColor ||
    skinProfile?.personalColor ||
    effectiveAvatarSpec?.appearance?.personalColor ||
    'autumn_warm';

  const palette = useMemo(
    () => computeSkinShadingPalette(resolvedSkinToneHex, resolvedPersonalColor, resolvedTheme),
    [resolvedSkinToneHex, resolvedPersonalColor, resolvedTheme]
  );

  const fallbackBodySpec = useMemo(() => sanitizeBodySpec(bodySpec), [bodySpec]);
  const legacyFromAvatar = useMemo(
    () => avatarSpecToLegacyBodySpec(effectiveAvatarSpec),
    [effectiveAvatarSpec]
  );

  const effectiveBodySpecForProfile = useMemo(
    () => ({
      ...legacyFromAvatar,
      ...(bodySpec || {}),
      heightCm: bodySpec?.heightCm ?? effectiveAvatarSpec.anthropometrics.heightCm,
      weightKg: bodySpec?.weightKg ?? effectiveAvatarSpec.anthropometrics.weightKg,
      shoulderScale:
        bodySpec?.shoulderScale ?? effectiveAvatarSpec.anthropometrics.shoulderScale,
      waistScale: bodySpec?.waistScale ?? effectiveAvatarSpec.anthropometrics.waistScale,
      hipScale: bodySpec?.hipScale ?? effectiveAvatarSpec.anthropometrics.hipScale,
    }),
    [legacyFromAvatar, bodySpec, effectiveAvatarSpec]
  );

  const profile = useMemo(
    () =>
      normalizeGenderNeutralProfile({
        skinProfile: {
          ...(skinProfile || {}),
          skinToneHex: palette.base,
          personalColor: resolvedPersonalColor,
        },
        bodySpec: effectiveBodySpecForProfile,
        user,
        personReferenceUrl:
          personReferenceUrl || effectiveAvatarSpec.appearance.facePhotoUrl || null,
      }),
    [
      skinProfile,
      palette.base,
      resolvedPersonalColor,
      effectiveBodySpecForProfile,
      user,
      personReferenceUrl,
      effectiveAvatarSpec.appearance.facePhotoUrl,
    ]
  );

  const effectiveZoom =
    typeof zoom === 'number' && Number.isFinite(zoom) ? clampZoom(zoom) : internalZoom;
  const rawPan =
    pan && typeof pan.x === 'number' && typeof pan.y === 'number' ? pan : internalPan;
  const effectivePan = clampPanToBounds(rawPan, effectiveZoom, stageRef.current);
  const effectiveSplitPct =
    typeof compareSplitPct === 'number' && Number.isFinite(compareSplitPct)
      ? clampSplitPct(compareSplitPct)
      : internalSplitPct;

  const zoomStateRef = useRef(effectiveZoom);
  const panStateRef = useRef(effectivePan);
  const viewAngleRef = useRef(effectiveViewAngleDeg);
  useEffect(() => {
    zoomStateRef.current = effectiveZoom;
    panStateRef.current = effectivePan;
    viewAngleRef.current = effectiveViewAngleDeg;
  });

  const commitZoomAndPan = useCallback(
    (nextZoomRaw, nextPanCandidate) => {
      const nextZ = clampZoom(nextZoomRaw);
      const nextP = clampPanToBounds(
        nextPanCandidate ?? panStateRef.current,
        nextZ,
        stageRef.current
      );
      zoomStateRef.current = nextZ;
      panStateRef.current = nextP;
      setInternalZoom(nextZ);
      setInternalPan(nextP);
      onZoomChange?.(nextZ);
      onPanChange?.(nextP);
    },
    [onZoomChange, onPanChange]
  );

  const commitPanOnly = useCallback(
    (nextPanCandidate) => {
      const nextP = clampPanToBounds(nextPanCandidate, zoomStateRef.current, stageRef.current);
      panStateRef.current = nextP;
      setInternalPan(nextP);
      onPanChange?.(nextP);
    },
    [onPanChange]
  );

  const commitSplitPct = useCallback(
    (nextVal) => {
      const clamped = clampSplitPct(nextVal);
      setInternalSplitPct(clamped);
      onCompareSplitChange?.(clamped);
    },
    [onCompareSplitChange]
  );

  const stageAriaLabel =
    resolvedLang === 'en'
      ? `2D fashion fitting model (${palette.base})`
      : `2D 패션 피팅 모델 (${palette.base})`;

  // 1. Compact Modal Preview (e.g. SkinToneAnalysisModal)
  useEffect(() => {
    if (!compact) return undefined;
    const canvas = compactCanvasRef.current;
    if (!canvas) return undefined;

    renderEditorialFashionCanvas(canvas, {
      profile,
      avatarSpec: effectiveAvatarSpec,
      viewAngleDeg: effectiveViewAngleDeg,
      slots: slots || null,
      theme: resolvedTheme,
      compact: true,
    }).catch(() => {
      // keep canvas resilient across rapid slider scrubs
    });

    return undefined;
  }, [
    compact,
    profile,
    effectiveAvatarSpec,
    effectiveAvatarHash,
    effectiveViewAngleDeg,
    slots,
    resolvedTheme,
  ]);

  // 2. Live 2D Isometric Canvas Preview when before synthesis resolves (or standalone usage)
  useEffect(() => {
    if (compact || afterImageUrl) return undefined;
    const canvas = liveCanvasRef.current;
    if (!canvas) return undefined;

    renderEditorialFashionCanvas(canvas, {
      profile,
      avatarSpec: effectiveAvatarSpec,
      viewAngleDeg: effectiveViewAngleDeg,
      slots,
      theme: resolvedTheme,
      compact: false,
    }).catch(() => {
      // graceful fallback during rapid state transitions
    });

    return undefined;
  }, [
    compact,
    afterImageUrl,
    profile,
    effectiveAvatarSpec,
    effectiveAvatarHash,
    effectiveViewAngleDeg,
    slots,
    resolvedTheme,
  ]);

  // 2b. Fallback Base 2D Canvas for Split Compare if beforeImageUrl is not yet available
  useEffect(() => {
    if (compact || !compareActive || beforeImageUrl) return undefined;
    const canvas = beforeCanvasRef.current;
    if (!canvas) return undefined;

    renderEditorialFashionCanvas(canvas, {
      profile,
      avatarSpec: effectiveAvatarSpec,
      viewAngleDeg: effectiveViewAngleDeg,
      slots: null,
      theme: resolvedTheme,
      compact: false,
    }).catch(() => {
      // graceful fallback
    });

    return undefined;
  }, [
    compact,
    compareActive,
    beforeImageUrl,
    profile,
    effectiveAvatarSpec,
    effectiveAvatarHash,
    effectiveViewAngleDeg,
    resolvedTheme,
  ]);

  // 3. Wheel Zoom in Full Studio Mode (non-passive to prevent page scroll while zooming stage)
  useEffect(() => {
    if (compact) return undefined;
    const el = stageRef.current;
    if (!el) return undefined;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0018;
      const nextZ = clampZoom(zoomStateRef.current + delta);
      commitZoomAndPan(nextZ, panStateRef.current);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [compact, commitZoomAndPan]);

  // 4. Stage Pointer Gestures: 2-Pointer Pinch Zoom, 1x Horizontal Drag-to-Rotate (45° steps), & Zoomed Drag-to-Pan
  const handleStagePointerDown = (e) => {
    if (compact) return;
    if (e.target?.closest?.('[data-vton-compare-slider]')) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      lastPinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      rotateDragAnchorXRef.current = null;
      setIsRotating(false);
      setIsPanning(true);
    } else if (pointers.size === 1 && zoomStateRef.current > 1.01) {
      rotateDragAnchorXRef.current = null;
      setIsPanning(true);
    } else if (pointers.size === 1 && !compareActive) {
      rotateDragAnchorXRef.current = e.clientX;
    }
  };

  const handleStagePointerMove = (e) => {
    if (compact) return;
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDistRef.current > 0 && dist > 0) {
        const scaleRatio = dist / lastPinchDistRef.current;
        const nextZ = clampZoom(zoomStateRef.current * scaleRatio);
        commitZoomAndPan(nextZ, panStateRef.current);
      }
      lastPinchDistRef.current = dist;
    } else if (pointers.size === 1 && prev && zoomStateRef.current > 1.01) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
        commitPanOnly({
          x: panStateRef.current.x + dx,
          y: panStateRef.current.y + dy,
        });
      }
    } else if (
      pointers.size === 1 &&
      zoomStateRef.current <= 1.01 &&
      !compareActive &&
      rotateDragAnchorXRef.current !== null
    ) {
      const totalDx = e.clientX - rotateDragAnchorXRef.current;
      if (Math.abs(totalDx) >= ROTATE_DRAG_STEP_PX) {
        const steps = Math.trunc(totalDx / ROTATE_DRAG_STEP_PX);
        rotateDragAnchorXRef.current += steps * ROTATE_DRAG_STEP_PX;
        const curIdx = ALL_ISO_VIEW_ANGLES.indexOf(viewAngleRef.current);
        const baseIdx = curIdx >= 0 ? curIdx : 0;
        const len = ALL_ISO_VIEW_ANGLES.length;
        const nextIdx = (((baseIdx + steps) % len) + len) % len;
        const nextAngle = ALL_ISO_VIEW_ANGLES[nextIdx];
        viewAngleRef.current = nextAngle;
        setInternalViewAngleDeg(nextAngle);
        setIsRotating(true);
        onViewAngleChange?.(nextAngle);
      }
    }
  };

  const handleStagePointerEnd = (e) => {
    if (compact) return;
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      lastPinchDistRef.current = 0;
    }
    if (pointers.size === 0) {
      rotateDragAnchorXRef.current = null;
      setIsPanning(false);
      setIsRotating(false);
    }
  };

  const handleStageDoubleClick = (e) => {
    if (compact) return;
    if (e.target?.closest?.('[data-vton-compare-slider]')) return;
    if (zoomStateRef.current > 1.05) {
      commitZoomAndPan(MIN_STAGE_ZOOM, { x: 0, y: 0 });
    } else {
      commitZoomAndPan(DBLCLICK_TARGET_ZOOM, { x: 0, y: 0 });
    }
  };

  // 5. Before / After Split Handle Pointer & Keyboard Controls
  const updateSplitFromClientX = (clientX) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    commitSplitPct(pct);
  };

  const handleSplitPointerDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsDraggingSplit(true);
    updateSplitFromClientX(e.clientX);
  };

  const handleSplitPointerMove = (e) => {
    if (!isDraggingSplit) return;
    e.stopPropagation();
    updateSplitFromClientX(e.clientX);
  };

  const handleSplitPointerEnd = (e) => {
    if (!isDraggingSplit) return;
    e.stopPropagation();
    setIsDraggingSplit(false);
  };

  const handleSplitKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commitSplitPct(effectiveSplitPct - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      commitSplitPct(effectiveSplitPct + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      commitSplitPct(MIN_SPLIT_PCT);
    } else if (e.key === 'End') {
      e.preventDefault();
      commitSplitPct(MAX_SPLIT_PCT);
    }
  };

  const mediaTransform = `translate3d(${effectivePan.x}px, ${effectivePan.y}px, 0) scale(${effectiveZoom})`;
  const showSplitCompare = Boolean(!compact && compareActive);
  const clipRightPct = 100 - effectiveSplitPct;
  const beforeClipPath = `inset(0 ${clipRightPct}% 0 0)`;
  const afterClipPath = showSplitCompare ? `inset(0 0 0 ${effectiveSplitPct}%)` : undefined;

  const resolvedBodyShape = bodySpec?.bodyShape
    ? normalizeBodyShape(bodySpec.bodyShape)
    : legacyFromAvatar.bodyShape || profile?.bodyShape || fallbackBodySpec.bodyShape;
  const resolvedHeightCm =
    effectiveAvatarSpec?.anthropometrics?.heightCm ??
    profile?.heightCm ??
    fallbackBodySpec.heightCm;
  const resolvedWeightKg =
    effectiveAvatarSpec?.anthropometrics?.weightKg ??
    profile?.weightKg ??
    fallbackBodySpec.weightKg;

  const cursorClass = compact
    ? 'is-compact'
    : isRotating
      ? 'is-rotating'
      : isPanning
        ? 'is-panning'
        : effectiveZoom > 1.01
          ? 'is-zoomed'
          : 'is-zoomable';

  return (
    <div
      id={compact ? undefined : CARBON_DOM_CONTRACT.character25dMannequinId}
      ref={stageRef}
      className={`character-25d-mannequin studio-2d-model-stage ${cursorClass}`}
      data-viewer-mode={viewerMode}
      data-skin-hex={palette.base.toUpperCase()}
      data-personal-color={resolvedPersonalColor}
      data-body-shape={resolvedBodyShape}
      data-height-cm={resolvedHeightCm}
      data-weight-kg={resolvedWeightKg}
      data-zoom={effectiveZoom.toFixed(2)}
      data-view-angle={effectiveViewAngleDeg}
      data-avatar-hash={effectiveAvatarHash}
      data-stage-loading={isLoading ? 'true' : 'false'}
      onPointerDown={compact ? undefined : handleStagePointerDown}
      onPointerMove={compact ? undefined : handleStagePointerMove}
      onPointerUp={compact ? undefined : handleStagePointerEnd}
      onPointerCancel={compact ? undefined : handleStagePointerEnd}
      onDoubleClick={compact ? undefined : handleStageDoubleClick}
    >
      {/* Personal Color Studio Drape Halo */}
      <div
        aria-hidden="true"
        className="character-25d-aura"
        style={{
          background: `radial-gradient(circle at 50% 28%, ${palette.auraColor} 0%, transparent 64%)`,
        }}
      />

      {compact ? (
        <canvas
          ref={compactCanvasRef}
          width={240}
          height={340}
          className="studio-2d-compact-canvas character-25d-render-canvas"
          data-body-ready="true"
          role="img"
          aria-label={stageAriaLabel}
        />
      ) : (
        <div className="studio-2d-viewport">
          <div
            className="studio-2d-layer studio-2d-layer-after"
            style={
              afterClipPath
                ? {
                    clipPath: afterClipPath,
                    WebkitClipPath: afterClipPath,
                  }
                : undefined
            }
          >
            {afterImageUrl ? (
              <img
                src={afterImageUrl}
                alt={stageAriaLabel}
                className="studio-2d-media-el is-after"
                data-vton-after-img="true"
                draggable={false}
                style={{ transform: mediaTransform }}
              />
            ) : (
              <canvas
                ref={liveCanvasRef}
                width={600}
                height={800}
                className="studio-2d-live-canvas character-25d-render-canvas"
                data-body-ready="true"
                role="img"
                aria-label={stageAriaLabel}
                style={{ transform: mediaTransform }}
              />
            )}
          </div>

          {showSplitCompare && (
            <>
              <div
                className="studio-2d-layer studio-2d-layer-before"
                data-vton-before-layer="true"
                style={{
                  clipPath: beforeClipPath,
                  WebkitClipPath: beforeClipPath,
                }}
              >
                {beforeImageUrl ? (
                  <img
                    src={beforeImageUrl}
                    alt={
                      resolvedLang === 'en'
                        ? 'Base 2D model before try-on'
                        : '착장 전 기본 2D 모델'
                    }
                    className="studio-2d-media-el is-before"
                    data-vton-before-img="true"
                    draggable={false}
                    style={{ transform: mediaTransform }}
                  />
                ) : (
                  <canvas
                    ref={beforeCanvasRef}
                    width={600}
                    height={800}
                    className="studio-2d-live-canvas is-before"
                    role="img"
                    aria-label={
                      resolvedLang === 'en'
                        ? 'Base 2D model before try-on'
                        : '착장 전 기본 2D 모델'
                    }
                    style={{ transform: mediaTransform }}
                  />
                )}
              </div>

              <div className="studio-2d-compare-badges" aria-hidden="true">
                <span
                  className={`studio-2d-compare-tag is-before ${effectiveSplitPct < 16 ? 'is-muted' : ''}`}
                >
                  BEFORE
                </span>
                <span
                  className={`studio-2d-compare-tag is-after ${effectiveSplitPct > 84 ? 'is-muted' : ''}`}
                >
                  AFTER
                </span>
              </div>

              <div
                role="slider"
                tabIndex={0}
                aria-valuemin={MIN_SPLIT_PCT}
                aria-valuemax={MAX_SPLIT_PCT}
                aria-valuenow={Math.round(effectiveSplitPct)}
                aria-label={
                  resolvedLang === 'en'
                    ? 'Before and after outfit comparison slider'
                    : '착장 전후 비교 슬라이더'
                }
                data-vton-compare-slider="true"
                className={`studio-2d-compare-slider ${isDraggingSplit ? 'is-dragging' : ''}`}
                style={{ left: `${effectiveSplitPct}%` }}
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerEnd}
                onPointerCancel={handleSplitPointerEnd}
                onKeyDown={handleSplitKeyDown}
              >
                <span className="studio-2d-compare-line" aria-hidden="true" />
                <span className="studio-2d-compare-knob" aria-hidden="true">
                  <ChevronsLeftRight size={15} strokeWidth={2.4} />
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default Studio2DModelStage;
