/**
 * Pure, decoupled Height-Linked Stage Framing & Three.js Floor Calibration Engine.
 *
 * Keeps human figures at natural architectural scale inside 24mm wide-angle stage rooms,
 * smoothly adapts backdrop framing to user stature (`150cm..198cm`), and solves the exact
 * Three.js perspective projection `lookAtY` so world `(0, 0, 0)` maps to `soleStageTopPct`
 * with 0px floating gap across mobile, tablet, and desktop viewports.
 */

export const MIN_FRAMING_HEIGHT_CM = 150;
export const MAX_FRAMING_HEIGHT_CM = 198;
export const REFERENCE_HEIGHT_CM = 172;

export interface StageFramingInput {
  heightCm?: number | null;
  stageWidth?: number;
  stageHeight?: number;
  isOutdoor?: boolean;
}

export interface StageFramingResult {
  clampedHeightCm: number;
  /** Normalized stature delta: -0.846 at 150cm, 0 at 172cm, +1.0 at 198cm */
  heightDeltaNorm: number;
  /** Target rendered human silhouette height as a fraction of total stage height (0.62..0.79) */
  targetCharacterHeightFraction: number;
  /** Relative stature scale multiplier centered at 1.0 for 172cm */
  statureMultiplier: number;
  /** Wide-angle backdrop zoom factor (always >= 1.02 so translation never reveals edges) */
  backdropScale: number;
  /** Vertical backdrop framing shift in % (-1.6%..+1.8%) */
  backdropTranslateYPct: number;
  /** CSS `transform-origin` for backdrop framing */
  backdropTransformOrigin: string;
  /** Grounded floor contact width scale in Three.js meters */
  shadowFootprintScale: number;
  /** World-space silhouette cast shadow height scale in Three.js meters */
  shadowHeightMeters: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeHeightAwareStageFraming(
  input?: StageFramingInput | null
): StageFramingResult {
  const rawH = Number(input?.heightCm);
  const clampedHeightCm = Number.isFinite(rawH)
    ? clamp(Math.round(rawH), MIN_FRAMING_HEIGHT_CM, MAX_FRAMING_HEIGHT_CM)
    : REFERENCE_HEIGHT_CM;

  const heightDeltaNorm = clamp(
    (clampedHeightCm - REFERENCE_HEIGHT_CM) / (MAX_FRAMING_HEIGHT_CM - REFERENCE_HEIGHT_CM),
    -1,
    1
  );

  const stageWidth = Number(input?.stageWidth) || 0;
  const stageHeight = Number(input?.stageHeight) || 0;
  const isCompactViewport = stageWidth > 0 && stageWidth <= 595;
  const isTallMobile = isCompactViewport && stageHeight > stageWidth * 1.45;

  // Uniform camera zoom-in preserving authentic architectural proportion (railing at waist/lower-chest,
  // indoor ceilings cleanly above head) while giving the character strong ~70% stage presence:
  // - Character occupies ~69.5% (tall mobile) / ~70.5% (desktop) at 172cm (~70.8% at 177cm),
  //   scaling smoothly from ~63.5% (150cm) to ~75.5% (198cm).
  // - Floor-anchored backdrop zoom (transform-origin: 50% 90%, scale 1.38..1.58) zooms the room
  //   by the exact same camera factor so character-to-railing & character-to-ceiling scale stays locked.
  const baseFraction = isTallMobile ? 0.695 : 0.705;
  const targetCharacterHeightFraction =
    Math.round(clamp(baseFraction + heightDeltaNorm * 0.068, 0.62, 0.765) * 1000) / 1000;

  const statureMultiplier =
    Math.round((clampedHeightCm / REFERENCE_HEIGHT_CM) * 1000) / 1000;

  // Synchronized floor-anchored backdrop zoom (~1.48 at 172cm, 1.565 at 150cm, 1.38 at 198cm; zero edge gaps)
  const backdropScale =
    Math.round(clamp(1.48 - heightDeltaNorm * 0.1, 1.38, 1.58) * 1000) / 1000;
  const backdropTranslateYPct =
    Math.round(clamp(heightDeltaNorm * 0.4, -0.35, 0.4) * 100) / 100;

  const shadowFootprintScale =
    Math.round(clamp(0.98 + (statureMultiplier - 1) * 0.42, 0.86, 1.12) * 1000) / 1000;
  const shadowHeightMeters =
    Math.round(clamp(1.72 * statureMultiplier, 1.48, 1.98) * 1000) / 1000;

  return {
    clampedHeightCm,
    heightDeltaNorm: Math.round(heightDeltaNorm * 1000) / 1000,
    targetCharacterHeightFraction,
    statureMultiplier,
    backdropScale,
    backdropTranslateYPct,
    backdropTransformOrigin: '50% 90%',
    shadowFootprintScale,
    shadowHeightMeters,
  };
}

export interface ThreeFloorCalibrationInput {
  /** Exact 2D percentage from top of stage where shoe soles touch the floor (e.g., 85.5) */
  soleStageTopPct: number;
  cameraPosY?: number;
  cameraPosZ?: number;
  fovDeg?: number;
}

export interface ThreeFloorCalibrationResult {
  lookAtY: number;
  /** Resulting NDC Y of world origin (0, 0, 0), strictly matching 1 - 2 * (soleStageTopPct / 100) */
  targetNdcY: number;
}

/**
 * Closed-form exact perspective projection solver:
 * computes `lookAtY` for a Three.js `PerspectiveCamera` at `(0, cameraPosY, cameraPosZ)`
 * so that world floor origin `(0, 0, 0)` projects to EXACT 2D screen coordinate `soleStageTopPct`.
 */
export function computeThreeCameraLookAtForSolePct(
  input: ThreeFloorCalibrationInput
): ThreeFloorCalibrationResult {
  const safeSolePct = clamp(
    Number.isFinite(input.soleStageTopPct) ? input.soleStageTopPct : 85.5,
    60,
    96
  );
  const cameraPosY =
    Number.isFinite(input.cameraPosY) && (input.cameraPosY as number) > 0.2
      ? (input.cameraPosY as number)
      : 1.42;
  const cameraPosZ =
    Number.isFinite(input.cameraPosZ) && (input.cameraPosZ as number) > 0.5
      ? (input.cameraPosZ as number)
      : 4.55;
  const fovDeg =
    Number.isFinite(input.fovDeg) && (input.fovDeg as number) > 10
      ? (input.fovDeg as number)
      : 38;

  const targetNdcY = 1 - 2 * (safeSolePct / 100);
  const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
  const tanHalfFov = Math.tan(halfFovRad);

  // Angle from camera optical axis down to world origin (0, 0, 0)
  const deltaRad = Math.atan(-targetNdcY * tanHalfFov);
  // Angle from horizontal down to world origin (0, 0, 0)
  const betaRad = Math.atan2(cameraPosY, cameraPosZ);
  // Required camera pitch downward angle
  const alphaRad = betaRad - deltaRad;
  const lookAtY = cameraPosY - cameraPosZ * Math.tan(alphaRad);

  return {
    lookAtY: Math.round(lookAtY * 10000) / 10000,
    targetNdcY: Math.round(targetNdcY * 10000) / 10000,
  };
}

export interface CoverPhotoFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Pure geometry solver matching CSS `object-fit: cover; object-position: center bottom;`
 * for a 3:4 (`photoAspect = 0.75`) architectural stage photograph inside any stage container.
 * Used to lock physical background light-fixture overlays 1:1 to their photo pixels across
 * mobile, tablet, and desktop aspect ratios without drift.
 */
export function computeCoverPhotoFrame(
  stageWidth: number,
  stageHeight: number,
  photoAspect = 0.75
): CoverPhotoFrame {
  const safeW = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth : 0;
  const safeH = Number.isFinite(stageHeight) && stageHeight > 0 ? stageHeight : 0;
  const safeAspect = Number.isFinite(photoAspect) && photoAspect > 0.1 ? photoAspect : 0.75;

  if (safeW === 0 || safeH === 0) {
    return { width: 0, height: 0, left: 0, top: 0 };
  }

  const stageAspect = safeW / safeH;
  if (stageAspect >= safeAspect) {
    // Stage is wider than 3:4 -> fit width, anchor bottom edge
    const width = safeW;
    const height = safeW / safeAspect;
    return {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      left: 0,
      top: Math.round((safeH - height) * 100) / 100,
    };
  }

  // Stage is taller than 3:4 (mobile portrait) -> fit height, center horizontally
  const height = safeH;
  const width = safeH * safeAspect;
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    left: Math.round(((safeW - width) / 2) * 100) / 100,
    top: 0,
  };
}
