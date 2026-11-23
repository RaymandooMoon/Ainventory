export interface StageBoxLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TargetRectLike {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface MarbleTargetHitInput {
  readonly mx: number;
  readonly my: number;
  readonly hitRadiusPx: number;
  readonly velPxX: number;
  readonly velPxY: number;
  readonly rect: TargetRectLike;
}

export interface MarbleTargetHitResult {
  readonly cx: number;
  readonly cy: number;
  readonly nxPx: number;
  readonly nyPx: number;
  readonly overlapPx: number;
  readonly isInsideRect: boolean;
}

export function computeFloorInsetWorld(
  stageBottomPx: number,
  stageHeightPx: number,
  floorTopPx: number
): number {
  if (!Number.isFinite(stageHeightPx) || stageHeightPx <= 0) return 0;
  if (!Number.isFinite(stageBottomPx) || !Number.isFinite(floorTopPx)) return 0;
  const bottomInsetPx = Math.max(0, stageBottomPx - floorTopPx);
  const rawWorld = (bottomInsetPx / stageHeightPx) * 2.0;
  return Math.max(0, Math.min(0.85, rawWorld));
}

export function toStageNormalizedCoords(
  clientX: number,
  clientY: number,
  stageRect: StageBoxLike
): { readonly nx: number; readonly ny: number } {
  const w = Math.max(1, stageRect.width);
  const h = Math.max(1, stageRect.height);
  const nx = ((clientX - stageRect.left) / w) * 2 - 1;
  const ny = 1 - ((clientY - stageRect.top) / h) * 2;
  return { nx, ny };
}

/**
 * Pure circle-vs-AABB collision detector shared by both the app login screen
 * and the official website to keep marble button-strike physics identical.
 */
export function computeMarbleTargetHit(input: MarbleTargetHitInput): MarbleTargetHitResult | null {
  const { mx, my, hitRadiusPx, velPxX, velPxY, rect } = input;
  const hitRadiusSq = hitRadiusPx * hitRadiusPx;
  const cx = Math.max(rect.left, Math.min(mx, rect.right));
  const cy = Math.max(rect.top, Math.min(my, rect.bottom));
  const dx = mx - cx;
  const dy = my - cy;
  const distSq = dx * dx + dy * dy;

  if (distSq > hitRadiusSq) return null;

  let nxPx = 0;
  let nyPx = -1;
  let overlapPx = 0;
  let isInsideRect = false;

  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    nxPx = dx / dist;
    nyPx = dy / dist;
    overlapPx = hitRadiusPx - dist;
  } else {
    isInsideRect = true;
    const dLeft = Math.abs(mx - rect.left);
    const dRight = Math.abs(rect.right - mx);
    const dTop = Math.abs(my - rect.top);
    const dBottom = Math.abs(rect.bottom - my);
    const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
    if (minEdge === dTop) {
      nxPx = 0;
      nyPx = -1;
      overlapPx = dTop + hitRadiusPx;
    } else if (minEdge === dBottom) {
      nxPx = 0;
      nyPx = 1;
      overlapPx = dBottom + hitRadiusPx;
    } else if (minEdge === dLeft) {
      nxPx = -1;
      nyPx = 0;
      overlapPx = dLeft + hitRadiusPx;
    } else {
      nxPx = 1;
      nyPx = 0;
      overlapPx = dRight + hitRadiusPx;
    }
  }

  // Only strike when approaching the target (or penetrating inside), never while rebounding away
  const approachDot = velPxX * nxPx + velPxY * nyPx;
  if (!isInsideRect && approachDot > 24) return null;

  return { cx, cy, nxPx, nyPx, overlapPx, isInsideRect };
}
