import type { TurnaroundAngleDeg } from './vton2DService.ts';

/**
 * First-Look Delay ("초견 시간"):
 * Configurable grace window between showing the initial recommended Flat-Lay Lookbook
 * and revealing the pre-generated 0° front model.
 * - Target ideal: <= 2000ms (FIRST_LOOK_TARGET_MS)
 * - Default calibrated value: FIRST_LOOK_DELAY_MS (tuned against live gemini-3.1-flash-lite-image benchmark)
 */
export const FIRST_LOOK_TARGET_MS = 2000;
export const FIRST_LOOK_MIN_DELAY_MS = 1500;
export const FIRST_LOOK_MAX_DELAY_MS = 12000;
// Calibrated from live gemini-3.1-flash-lite-image 0° benchmark (warm ~3.8s, cold ~5.1s)
export const FIRST_LOOK_DELAY_MS = 5000;

export const ANGLE_SCROLL_TICKS = [-180, -135, -90, -45, 0, 45, 90, 135, 180] as const;
export type AngleScrollTickDeg = (typeof ANGLE_SCROLL_TICKS)[number];

/**
 * Progressive multi-angle generation chain after 0° Master Anchor completes (True 8-Angle — ZERO mirroring):
 * Stage 1 (Front):      0° Master Front Anchor
 * Stage 2a (Right):     45° & 90° in parallel (anchored on 0° Front)
 * Stage 2b (Right Rear):135° (anchored on 0° + 90°/45°)
 * Stage 3 (Back):       180° (single canonical Back Anchor shared identically at -180° and +180°)
 * Stage 4 (Left):       315°, 270°, 225° in parallel (anchored on 0° Front + 180° Back)
 */
export const PROGRESSIVE_ANGLE_WAVES: readonly (readonly TurnaroundAngleDeg[])[] = [
  [45, 90],
  [135],
  [180],
  [315, 270, 225],
] as const;

const CANONICAL_8_ANGLES: readonly TurnaroundAngleDeg[] = [
  0, 45, 90, 135, 180, 225, 270, 315,
];

/**
 * Returns true only when all 8 canonical turnaround angles (0°..315°) have valid image URLs.
 */
export function hasCompleteTurnaroundSlices(
  slices: Partial<Record<number, string | null | undefined>> | null | undefined
): boolean {
  if (!slices || typeof slices !== 'object') return false;
  return CANONICAL_8_ANGLES.every((angle) => {
    const val = slices[angle];
    return typeof val === 'string' && val.trim().length > 0;
  });
}

/**
 * Determines whether the fitting viewer should display a cached partial turnaround (e.g., 0° + 45°)
 * immediately AND still resume background synthesis for the missing angles instead of returning early.
 */
export function shouldResumeIncompleteTurnaround(params: {
  cachedSlices: Partial<Record<number, string | null | undefined>> | null | undefined;
  frontOnlyDegraded?: boolean;
  alreadyExhaustedRun?: boolean;
  demoShowcaseEnabled?: boolean;
}): boolean {
  if (params.frontOnlyDegraded || params.alreadyExhaustedRun || params.demoShowcaseEnabled) {
    return false;
  }
  return !hasCompleteTurnaroundSlices(params.cachedSlices);
}

/**
 * Chooses the best already-generated secondary visual anchor alongside the 0° Master Front Anchor
 * so sequential rotation steps (especially 135°/180°/225° rear views) inherit real side/back geometry
 * instead of reverting to a front face.
 */
export function selectSecondaryAnchorAngle(
  targetAngle: TurnaroundAngleDeg,
  readyAngles: ReadonlySet<number>
): TurnaroundAngleDeg | null {
  switch (targetAngle) {
    case 90:
      return readyAngles.has(45) ? 45 : null;
    case 135:
      if (readyAngles.has(90)) return 90;
      return readyAngles.has(45) ? 45 : null;
    case 180:
      if (readyAngles.has(135)) return 135;
      return readyAngles.has(90) ? 90 : null;
    case 270:
      if (readyAngles.has(315)) return 315;
      return readyAngles.has(180) ? 180 : null;
    case 225:
      if (readyAngles.has(180)) return 180;
      return readyAngles.has(270) ? 270 : null;
    case 45:
    case 315:
    case 0:
    default:
      return null;
  }
}

export function resolveFirstLookDelayMs(overrideMs?: number | null): number {
  if (typeof overrideMs === 'number' && Number.isFinite(overrideMs)) {
    return Math.round(
      Math.max(FIRST_LOOK_MIN_DELAY_MS, Math.min(FIRST_LOOK_MAX_DELAY_MS, overrideMs))
    );
  }
  return FIRST_LOOK_DELAY_MS;
}

export function formatFirstLookCountdownSec(
  remainingMs: number,
  lang: 'ko' | 'en' = 'ko'
): string {
  const clamped = Math.max(0, Number(remainingMs) || 0);
  const wholeSec = clamped > 0 ? Math.ceil(clamped / 1000) : 0;
  return lang === 'en' ? `${wholeSec}s` : `${wholeSec}초`;
}

export function mapSignedTickToCanonicalSlice(tickDeg: number): TurnaroundAngleDeg {
  if (tickDeg === 0) return 0;
  if (tickDeg === 45) return 45;
  if (tickDeg === -45 || tickDeg === 315) return 315;
  if (tickDeg === 90) return 90;
  if (tickDeg === -90 || tickDeg === 270) return 270;
  if (tickDeg === 135) return 135;
  if (tickDeg === -135 || tickDeg === 225) return 225;
  return 180;
}

export interface ScrollbarLightingState {
  readyTicks: Record<AngleScrollTickDeg, boolean>;
  frontReady: boolean;
  backReady: boolean;
  leftReachPct: number;
  rightReachPct: number;
  readyCount: number;
  totalCount: number;
  allReady: boolean;
}

export function computeScrollbarLightingState(
  readyAnglesInput: Iterable<number> | null | undefined
): ScrollbarLightingState {
  const readySet = new Set<number>();
  if (readyAnglesInput) {
    for (const a of readyAnglesInput) {
      const num = Number(a);
      if (Number.isFinite(num)) readySet.add(num);
    }
  }

  const readyTicks = {} as Record<AngleScrollTickDeg, boolean>;
  for (const tick of ANGLE_SCROLL_TICKS) {
    const canonical = mapSignedTickToCanonicalSlice(tick);
    readyTicks[tick] = readySet.has(canonical);
  }

  const frontReady = readySet.has(0);
  const backReady = readySet.has(180);

  // Strictly contiguous outward reach from 0° so unready intermediate angles NEVER glow falsely
  // (individual ready ticks such as -180°/+180° still light up independently via readyTicks[tick]).
  let rightReachPct = 0;
  if (frontReady) {
    rightReachPct = 5;
    if (readySet.has(45)) {
      rightReachPct = 14;
      if (readySet.has(90)) {
        rightReachPct = 26;
        if (readySet.has(135)) {
          rightReachPct = 39;
          if (backReady) {
            rightReachPct = 50;
          }
        }
      }
    }
  }

  let leftReachPct = 0;
  if (frontReady) {
    leftReachPct = 5;
    if (readySet.has(315)) {
      leftReachPct = 14;
      if (readySet.has(270)) {
        leftReachPct = 26;
        if (readySet.has(225)) {
          leftReachPct = 39;
          if (backReady) {
            leftReachPct = 50;
          }
        }
      }
    }
  }

  const canonicalAngles: readonly TurnaroundAngleDeg[] = [
    0, 45, 90, 135, 180, 225, 270, 315,
  ];
  const readyCount = canonicalAngles.filter((a) => readySet.has(a)).length;

  return {
    readyTicks,
    frontReady,
    backReady,
    leftReachPct,
    rightReachPct,
    readyCount,
    totalCount: canonicalAngles.length,
    allReady: readyCount === canonicalAngles.length,
  };
}
