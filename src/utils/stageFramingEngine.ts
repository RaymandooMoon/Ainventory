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

  // Editorial wide-angle architectural proportion:
  // ~70% of stage height at 172cm (down from ~86% oversized look),
  // gracefully scaling between ~62.5% (150cm) and ~78.5% (198cm).
  const baseFraction = isTallMobile ? 0.68 : 0.705;
  const targetCharacterHeightFraction =
    Math.round(clamp(baseFraction + heightDeltaNorm * 0.082, 0.61, 0.79) * 1000) / 1000;

  const statureMultiplier =
    Math.round((clampedHeightCm / REFERENCE_HEIGHT_CM) * 1000) / 1000;

  // Taller stature pulls camera slightly wider & lowers floor slightly;
  // shorter stature gently frames closer so architectural eye-line feels natural.
  const backdropScale =
    Math.round(clamp(1.048 - heightDeltaNorm * 0.026, 1.022, 1.078) * 1000) / 1000;
  const backdropTranslateYPct =
    Math.round(clamp(heightDeltaNorm * 1.65, -1.5, 1.75) * 100) / 100;

  const shadowFootprintScale =
    Math.round(clamp(0.92 + (statureMultiplier - 1) * 0.45, 0.84, 1.06) * 1000) / 1000;
  const shadowHeightMeters =
    Math.round(clamp(1.68 * statureMultiplier, 1.42, 1.98) * 1000) / 1000;

  return {
    clampedHeightCm,
    heightDeltaNorm: Math.round(heightDeltaNorm * 1000) / 1000,
    targetCharacterHeightFraction,
    statureMultiplier,
    backdropScale,
    backdropTranslateYPct,
    backdropTransformOrigin: '50% 68%',
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
