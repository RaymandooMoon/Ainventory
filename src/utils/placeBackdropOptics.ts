export type PlaceBackdropOpticalSource = 'place_photo' | 'street_view';

/**
 * Telephoto & eye-level portrait optical calibration constants for real-place backdrops.
 * - Street View Static API supports `fov` 10..120; 16° (~135mm full-frame equivalent)
 *   brings distant landmarks (e.g. Gwanghwamun Gate, street façades, sedans) up to natural
 *   1:1 human scale behind the standing avatar.
 * - `pitch = -4°` lifts the optical horizon from center (50%) up toward the avatar's eye line (~30%)
 *   while extending ground/plaza perspective smoothly beneath the character's shoes (~85.5%).
 * - Live Maps JS `StreetViewPanorama` `zoom = 3.45` yields `fov = 180 / 2^3.45 ≈ 16.5°`,
 *   matching the Static proxy optical framing.
 */
export const STREET_VIEW_PORTRAIT_FOV = 16;
export const STREET_VIEW_PORTRAIT_PITCH = -4;
export const STREET_VIEW_LIVE_ZOOM = 3.45;
export const STREET_VIEW_PROXY_WIDTH = 480;
export const STREET_VIEW_PROXY_HEIGHT = 640;
export const PLACE_PHOTO_PROXY_MAX_WIDTH = 960;
export const PLACE_PHOTO_PROXY_MAX_HEIGHT = 1280;

export const STREET_VIEW_BASE_SCALE = 1.24;
export const PLACE_PHOTO_BASE_SCALE = 1.28;

export const AVATAR_REFERENCE_HEIGHT_CM = 172;
export const AVATAR_MIN_HEIGHT_CM = 150;
export const AVATAR_MAX_HEIGHT_CM = 198;

export interface PlaceBackdropOpticsResult {
  clampedHeightCm: number;
  blurPx: number;
  groundFocusBlurPx: number;
  liveBaseBlurPx: number;
  liveDofOverlayBlurPx: number;
  baseScale: number;
  edgeBleedScale: number;
  objectPositionY: number;
  objectPosition: string;
  transformOrigin: string;
  liveTopOffsetPct: number;
}

export function clampAvatarHeightCm(heightCm: unknown): number {
  const n = Number(heightCm);
  if (!Number.isFinite(n)) return AVATAR_REFERENCE_HEIGHT_CM;
  return Math.max(AVATAR_MIN_HEIGHT_CM, Math.min(AVATAR_MAX_HEIGHT_CM, Math.round(n)));
}

/**
 * Computes eye-level perspective alignment, telephoto scale, and edge-safe Gaussian blur
 * parameters for Google Maps real-place backdrops behind the standing avatar.
 */
export function computePlaceBackdropOptics({
  heightCm = AVATAR_REFERENCE_HEIGHT_CM,
  sourceMode = 'street_view',
  blurPx = 8,
}: {
  heightCm?: number;
  sourceMode?: PlaceBackdropOpticalSource;
  blurPx?: number;
}): PlaceBackdropOpticsResult {
  const clampedHeightCm = clampAvatarHeightCm(heightCm);
  const safeBlur = Math.max(0, Math.min(24, Math.round(Number(blurPx) || 0)));

  // Normalized delta in [-1, +1] relative to 172cm reference height.
  // Taller avatars shift the optical eye-level horizon slightly higher; shorter avatars slightly lower.
  const heightDelta = Math.max(
    -1,
    Math.min(1, (clampedHeightCm - AVATAR_REFERENCE_HEIGHT_CM) / 22)
  );

  const isStreetView = sourceMode === 'street_view';
  const baseScale = isStreetView ? STREET_VIEW_BASE_SCALE : PLACE_PHOTO_BASE_SCALE;

  // Extra overscan proportional to Gaussian blur radius so strong blur (16–24px)
  // never pulls soft transparent edges inward along the stage borders.
  const blurPad = (safeBlur / 24) * 0.12;
  const edgeBleedScale = Number((baseScale + blurPad).toFixed(3));

  // Anchor zoom near eye level (y ≈ 34%) so landmarks grow naturally without pushing
  // the horizon line downward into the avatar's torso.
  const rawPosY = isStreetView
    ? 44 + heightDelta * 3.5
    : 40 + heightDelta * 3.5;
  const objectPositionY = Number(Math.max(32, Math.min(54, rawPosY)).toFixed(1));
  const objectPosition = `50% ${objectPositionY}%`;

  // Subtle vertical offset for Live Maps JS StreetViewPanorama wrapper to couple horizon to heightCm
  // while keeping Google's native bottom bar clipped well outside the stage bounds.
  const liveTopOffsetPct = Number((-6 - heightDelta * 2.2).toFixed(2));

  // Optical depth-of-field bokeh split:
  // Distant backdrop receives full blurPx; foreground pavement near shoes tapers softer (~35%)
  // for natural f/2.0 portrait lens separation.
  const groundFocusBlurPx = safeBlur > 0 ? Math.max(0, Math.round(safeBlur * 0.35)) : 0;

  // For WebGL StreetViewPanorama, split blur cleanly across base CSS filter + GPU backdropFilter DoF
  // so 3-step blur stays silky 60fps in real time even on mobile GPUs.
  const liveBaseBlurPx = safeBlur > 0 ? Math.max(1, Math.round(safeBlur * 0.52)) : 0;
  const liveDofOverlayBlurPx = safeBlur > 0 ? Math.max(1, Math.round(safeBlur * 0.62)) : 0;

  return {
    clampedHeightCm,
    blurPx: safeBlur,
    groundFocusBlurPx,
    liveBaseBlurPx,
    liveDofOverlayBlurPx,
    baseScale,
    edgeBleedScale,
    objectPositionY,
    objectPosition,
    transformOrigin: '50% 34%',
    liveTopOffsetPct,
  };
}
