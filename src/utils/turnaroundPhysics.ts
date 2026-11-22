export type TurnaroundAngle360 = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export const TURNAROUND_STEP_DEG = 45;
export const TURNAROUND_BLUR_MIN_VELOCITY_DEG_PER_SEC = 110;
export const TURNAROUND_BLUR_MAX_VELOCITY_DEG_PER_SEC = 900;
export const TURNAROUND_BLUR_MAX_PX = 5.5;
export const TURNAROUND_BRIDGE_MAX_YAW_DEG = 8.5;

export interface TurnaroundInertiaState {
  angleDeg: number;
  velocityDegPerSec: number;
  targetDetentDeg: number | null;
}

export interface TurnaroundInertiaStepOptions {
  dtSec: number;
  frictionPerSec?: number;
  snapStiffness?: number;
  snapDamping?: number;
  engageSnapSpeedDegPerSec?: number;
  reducedMotion?: boolean;
}

export interface TurnaroundInertiaStepResult extends TurnaroundInertiaState {
  snappedAngle360: TurnaroundAngle360;
  residualYawDeg: number;
  blurPx: number;
  settled: boolean;
}

export interface CrossfadeBridgeInput {
  progress: number;
  directionSign: number;
  reducedMotion?: boolean;
  maxYawDeg?: number;
}

export interface CrossfadeBridgeState {
  outgoingOpacity: number;
  incomingOpacity: number;
  outgoingYawDeg: number;
  incomingYawDeg: number;
  done: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Wraps any continuous angle in degrees into [-180, 180], preserving -180 when exact.
 */
export function wrapSignedAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  if (deg === -180) return -180;
  let wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && deg > 0) wrapped = 180;
  return wrapped;
}

/**
 * Snaps a continuous degree value to the nearest 45-degree turnaround detent (unwrapped).
 */
export function snapToNearest45Deg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.round(deg / TURNAROUND_STEP_DEG) * TURNAROUND_STEP_DEG;
}

/**
 * Converts any continuous angle in degrees to one of the 8 canonical 360° turnaround angles.
 */
export function continuousAngleToTurnaround360(deg: number): TurnaroundAngle360 {
  if (!Number.isFinite(deg)) return 0;
  const snapped = snapToNearest45Deg(deg);
  const mod = ((snapped % 360) + 360) % 360;
  return mod as TurnaroundAngle360;
}

/**
 * Shortest angular delta (in degrees, signed in (-180, 180]) from angleA to angleB.
 */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  const delta = ((toDeg - fromDeg + 180) % 360 + 360) % 360 - 180;
  return delta === -180 ? 180 : delta;
}

/**
 * Maps angular velocity (deg/s) to a pure horizontal X-axis SVG Gaussian motion blur radius (px).
 * Stationary or gentle movement returns strictly 0 so idle frames stay razor sharp with `filter: none`.
 */
export function computeDirectionalBlurPx(
  velocityDegPerSec: number,
  reducedMotion = false
): number {
  if (reducedMotion || !Number.isFinite(velocityDegPerSec)) return 0;
  const speed = Math.abs(velocityDegPerSec);
  if (speed < TURNAROUND_BLUR_MIN_VELOCITY_DEG_PER_SEC) return 0;
  const normalized = clamp(
    (speed - TURNAROUND_BLUR_MIN_VELOCITY_DEG_PER_SEC) /
      (TURNAROUND_BLUR_MAX_VELOCITY_DEG_PER_SEC - TURNAROUND_BLUR_MIN_VELOCITY_DEG_PER_SEC),
    0,
    1
  );
  // Subtle ease-out response so fast flicks immediately feel kinetic without excessive smearing
  const curved = 1 - (1 - normalized) * (1 - normalized);
  return Number((curved * TURNAROUND_BLUR_MAX_PX).toFixed(2));
}

/**
 * Computes the dual-layer counter-rotating 2.5D rotateY handoff + smoothstep S-curve crossfade
 * between an outgoing angle frame and an incoming angle frame (typically over 95–120ms).
 */
export function computeCrossfadeBridgeState({
  progress,
  directionSign,
  reducedMotion = false,
  maxYawDeg = TURNAROUND_BRIDGE_MAX_YAW_DEG,
}: CrossfadeBridgeInput): CrossfadeBridgeState {
  const t = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
  if (reducedMotion || t >= 1) {
    return {
      outgoingOpacity: 0,
      incomingOpacity: 1,
      outgoingYawDeg: 0,
      incomingYawDeg: 0,
      done: true,
    };
  }
  const dir = directionSign >= 0 ? 1 : -1;
  const s = t * t * (3 - 2 * t);
  const clampedMaxYaw = clamp(Math.abs(maxYawDeg), 0, 14);
  return {
    outgoingOpacity: Number((1 - s).toFixed(4)),
    incomingOpacity: Number(s.toFixed(4)),
    outgoingYawDeg: Number((s * clampedMaxYaw * dir).toFixed(2)),
    incomingYawDeg: Number((-(1 - s) * clampedMaxYaw * dir).toFixed(2)),
    done: false,
  };
}

/**
 * Advances continuous turnaround inertia with exponential friction decay and 45° magnetic
 * spring-damper detent snapping. Pure function safe for requestAnimationFrame and unit tests.
 */
export function stepTurnaroundInertia(
  state: TurnaroundInertiaState,
  options: TurnaroundInertiaStepOptions
): TurnaroundInertiaStepResult {
  const dtSec = clamp(Number.isFinite(options.dtSec) ? options.dtSec : 1 / 60, 0.001, 0.05);
  const frictionPerSec = options.frictionPerSec ?? 5.4;
  const snapStiffness = options.snapStiffness ?? 150;
  const snapDamping = options.snapDamping ?? 21;
  const engageSnapSpeed = options.engageSnapSpeedDegPerSec ?? 240;
  const reducedMotion = Boolean(options.reducedMotion);

  const curAngle = Number.isFinite(state.angleDeg) ? state.angleDeg : 0;
  const curVel = Number.isFinite(state.velocityDegPerSec) ? state.velocityDegPerSec : 0;
  let targetDetent = state.targetDetentDeg;

  if (reducedMotion) {
    const finalAngle = targetDetent !== null ? targetDetent : snapToNearest45Deg(curAngle);
    return {
      angleDeg: finalAngle,
      velocityDegPerSec: 0,
      targetDetentDeg: finalAngle,
      snappedAngle360: continuousAngleToTurnaround360(finalAngle),
      residualYawDeg: 0,
      blurPx: 0,
      settled: true,
    };
  }

  let nextAngle = curAngle;
  let nextVel = curVel;

  if (targetDetent === null && Math.abs(curVel) > engageSnapSpeed) {
    // Free inertial spin with exact analytic exponential viscous drag integral (FPS-invariant)
    const decay = Math.exp(-frictionPerSec * dtSec);
    nextVel = curVel * decay;
    nextAngle =
      frictionPerSec > 0
        ? curAngle + (curVel - nextVel) / frictionPerSec
        : curAngle + curVel * dtSec;
    if (Math.abs(nextVel) <= engageSnapSpeed) {
      // Lock onto the upcoming 45° magnetic detent in the direction of travel
      const projected = nextAngle + nextVel * 0.045;
      targetDetent = snapToNearest45Deg(projected);
    }
  } else {
    // Magnetic spring-damper snap onto nearest 45° detent
    if (targetDetent === null) {
      targetDetent = snapToNearest45Deg(curAngle + curVel * 0.04);
    }
    const displacement = targetDetent - curAngle;
    const accel = displacement * snapStiffness - curVel * snapDamping;
    nextVel = curVel + accel * dtSec;
    nextAngle = curAngle + nextVel * dtSec;
  }

  const resolvedDetent = targetDetent !== null ? targetDetent : snapToNearest45Deg(nextAngle);
  const distToDetent = Math.abs(resolvedDetent - nextAngle);
  const settled =
    targetDetent !== null && distToDetent < 0.25 && Math.abs(nextVel) < 4.5;

  if (settled) {
    nextAngle = resolvedDetent;
    nextVel = 0;
  }

  const nearestDetent = snapToNearest45Deg(nextAngle);
  const subStepOffset = nextAngle - nearestDetent;
  const residualYawDeg = settled
    ? 0
    : Number(clamp(subStepOffset * 0.28, -TURNAROUND_BRIDGE_MAX_YAW_DEG, TURNAROUND_BRIDGE_MAX_YAW_DEG).toFixed(2));

  return {
    angleDeg: nextAngle,
    velocityDegPerSec: nextVel,
    targetDetentDeg: targetDetent,
    snappedAngle360: continuousAngleToTurnaround360(nextAngle),
    residualYawDeg,
    blurPx: settled ? 0 : computeDirectionalBlurPx(nextVel, reducedMotion),
    settled,
  };
}
