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
 * Progressive wave order after 0° Master Anchor completes (True 8-Angle — ZERO horizontal mirroring):
 * Wave 1: 45° (Front-Right) & 315° (Front-Left)
 * Wave 2: 90° (Right Profile) & 270° (Left Profile)
 * Wave 3: 135° (Back-Right), 225° (Back-Left), & 180° (Straight Back)
 */
export const PROGRESSIVE_ANGLE_WAVES: readonly (readonly TurnaroundAngleDeg[])[] = [
  [45, 315],
  [90, 270],
  [135, 225, 180],
] as const;

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

  let rightReachPct = 0;
  if (frontReady) rightReachPct = 5;
  if (readySet.has(45)) rightReachPct = Math.max(rightReachPct, 14);
  if (readySet.has(90)) rightReachPct = Math.max(rightReachPct, 26);
  if (readySet.has(135)) rightReachPct = Math.max(rightReachPct, 39);
  if (backReady) rightReachPct = 50;

  let leftReachPct = 0;
  if (frontReady) leftReachPct = 5;
  if (readySet.has(315)) leftReachPct = Math.max(leftReachPct, 14);
  if (readySet.has(270)) leftReachPct = Math.max(leftReachPct, 26);
  if (readySet.has(225)) leftReachPct = Math.max(leftReachPct, 39);
  if (backReady) leftReachPct = 50;

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
