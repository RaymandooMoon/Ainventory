export type DominantHand = 'right' | 'left';
export type StageAuraTier = 'C' | 'B' | 'A' | 'S';

export const VTON_QC_LOG_STORAGE_KEY = 'ainventory_vton_qc_failures_v1';
const MAX_QC_LOG_ENTRIES = 30;

export type BagViewerScreenPlacement = 'screen-left' | 'screen-right' | 'far-occluded';

const LEFT_HANDED_TOKENS = new Set([
  'left',
  'left-handed',
  'left_handed',
  'lefthanded',
  'l',
  '왼손',
  '왼손잡이',
]);

const RIGHT_HANDED_TOKENS = new Set([
  'right',
  'right-handed',
  'right_handed',
  'righthanded',
  'r',
  '오른손',
  '오른손잡이',
]);

/**
 * Normalizes any handedness token (`'right'`, `'left'`, `'right-handed'`, `'left-handed'`, Korean labels)
 * to canonical `'right' | 'left'`, defaulting to `'right'`.
 */
export function normalizeHandedness(
  raw?: unknown,
  fallback: DominantHand = 'right'
): DominantHand {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const token = String(raw).trim().toLowerCase();
  if (!token) return fallback;
  if (LEFT_HANDED_TOKENS.has(token)) return 'left';
  if (RIGHT_HANDED_TOKENS.has(token)) return 'right';
  return fallback;
}

/**
 * Validates whether an incoming API boundary value is an accepted handedness string.
 */
export function isValidHandednessToken(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const token = raw.trim().toLowerCase();
  return LEFT_HANDED_TOKENS.has(token) || RIGHT_HANDED_TOKENS.has(token);
}

const BAG_KEYWORD_RE =
  /bag|tote|crossbody|briefcase|backpack|clutch|shoulder|messenger|duffel|satchel|pouch|handbag|가방|토트|크로스|브리프케이스|서류가방|백팩|숄더|클러치|파우치|핸드백|보스턴/i;
const NON_BAG_ACCESSORY_RE =
  /umbrella|parasol|watch|eyewear|sunglass|glasses|glove|belt|scarf|muffler|tie|hat|cap|beanie|earring|necklace|bracelet|ring|brooch|우산|양산|시계|안경|선글라스|장갑|벨트|머플러|스카프|넥타이|모자|비니|귀걸이|목걸이|팔찌|반지|브로치/i;

/**
 * Identifies whether a VTON slot/garment represents a carried bag asset whose position
 * and orientation must follow the user's handedness preference.
 */
export function isBagGarmentItem(
  item?: {
    slot?: string | null;
    slotKey?: string | null;
    category?: string | null;
    subcategory?: string | null;
    name?: string | null;
  } | null
): boolean {
  if (!item) return false;
  const slot = String(item.slot ?? item.slotKey ?? '')
    .trim()
    .toLowerCase();
  const category = String(item.category ?? '')
    .trim()
    .toLowerCase();
  const subcategory = String(item.subcategory ?? '')
    .trim()
    .toLowerCase();
  const name = String(item.name ?? '').trim();

  if (category === 'bag' || slot === 'bag') return true;
  const combined = `${category} ${subcategory} ${name}`;
  if (BAG_KEYWORD_RE.test(combined)) return true;
  if (slot === 'accessory' && !NON_BAG_ACCESSORY_RE.test(combined)) {
    return true;
  }
  return false;
}

export interface BagAssetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BagAssetPlacementBox {
  handedness: DominantHand;
  carrySide: 'left' | 'right';
  mirrored: boolean;
  visible: boolean;
  screenSide: BagViewerScreenPlacement;
  screenSign: -1 | 0 | 1;
  centerOffsetFromAxis: number;
  bagCenterX: number;
  strapRect: BagAssetRect | null;
  bagRect: BagAssetRect | null;
}

/**
 * Computes the exact camera-space bag asset bounding box for a given angle (`0..225°`)
 * and mirrors the bag asset position horizontally across `cx` when `'left'` (`'left-handed'`)
 * is selected so the bag consistently renders on the user's preferred side:
 * - `'right'` (default): wearer's ANATOMICAL LEFT side (`screen-right` at `0°/45°`, occluded behind torso at `90°`, `screen-left` at `135°/180°/225°`).
 * - `'left'` (`'left-handed'`): mirrored across `cx` onto wearer's ANATOMICAL RIGHT side (`screen-left` at `0°/45°`, foreground visible at `90°`, `screen-right` at `135°/180°`, occluded at `225°`).
 */
export function computeBagAssetPlacementBox(params: {
  angleDeg: 0 | 45 | 90 | 135 | 180 | 225;
  handedness?: unknown;
  cx: number;
  shoulderY: number;
  waistY: number;
  shoulderW: number;
  hipW: number;
  headH: number;
  widthCompact?: number;
}): BagAssetPlacementBox {
  const handedness = normalizeHandedness(params.handedness, 'right');
  const anatomy = resolveBagCarryAnatomy(handedness);
  const mirrored = handedness === 'left';
  const screenSide = anatomy.perAngleScreenSide[params.angleDeg];
  const widthCompact = params.widthCompact ?? 0.85;
  const bagW = Math.max(8, params.headH * 0.64 * widthCompact);
  const bagH = Math.max(12, params.headH * 0.86);
  const bagTopY = params.waistY + params.headH * 0.16;

  if (screenSide === 'far-occluded') {
    return {
      handedness,
      carrySide: anatomy.carrySide,
      mirrored,
      visible: false,
      screenSide,
      screenSign: 0,
      centerOffsetFromAxis: 0,
      bagCenterX: params.cx,
      strapRect: null,
      bagRect: null,
    };
  }

  // At 90° right profile (facing right) when left-handed, the bag rests in foreground near cx + slight hip offset
  if (params.angleDeg === 90) {
    const profileOffset = params.hipW * 0.12;
    const bagCenterX = params.cx + profileOffset;
    const strapW = Math.max(4, Math.round(bagW * 0.22));
    return {
      handedness,
      carrySide: anatomy.carrySide,
      mirrored,
      visible: true,
      screenSide,
      screenSign: 1,
      centerOffsetFromAxis: profileOffset,
      bagCenterX,
      strapRect: {
        x: Math.round(bagCenterX - strapW * 0.5),
        y: Math.round(params.shoulderY + 2),
        width: strapW,
        height: Math.max(8, Math.round(bagTopY - params.shoulderY)),
      },
      bagRect: {
        x: Math.round(bagCenterX - bagW * 0.5),
        y: Math.round(bagTopY),
        width: Math.round(bagW),
        height: Math.round(bagH),
      },
    };
  }

  const screenSign: -1 | 1 = screenSide === 'screen-left' ? -1 : 1;
  const lateralOffset = params.hipW * 0.56 + bagW * 0.28;
  const centerOffsetFromAxis = screenSign * lateralOffset;
  const bagCenterX = params.cx + centerOffsetFromAxis;
  const strapShoulderX = params.cx + screenSign * (params.shoulderW * 0.36);

  return {
    handedness,
    carrySide: anatomy.carrySide,
    mirrored,
    visible: true,
    screenSide,
    screenSign,
    centerOffsetFromAxis,
    bagCenterX,
    strapRect: {
      x: Math.round(Math.min(strapShoulderX, bagCenterX) - 2),
      y: Math.round(params.shoulderY + 2),
      width: Math.max(4, Math.round(Math.abs(bagCenterX - strapShoulderX) * 0.24)),
      height: Math.max(8, Math.round(bagTopY - params.shoulderY)),
    },
    bagRect: {
      x: Math.round(bagCenterX - bagW * 0.5),
      y: Math.round(bagTopY),
      width: Math.round(bagW),
      height: Math.round(bagH),
    },
  };
}

/**
 * Pure RGBA pixel-buffer horizontal flip (`x -> width - 1 - x`) used to mirror
 * bag reference assets when `'left-handed'` (`'left'`) is selected.
 */
export function mirrorRgbaPixelBufferHorizontally(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const out = new Uint8ClampedArray(w * h * 4);
  if (w === 0 || h === 0 || pixels.length < w * h * 4) {
    return out;
  }
  for (let y = 0; y < h; y += 1) {
    const rowBase = y * w * 4;
    for (let x = 0; x < w; x += 1) {
      const srcIdx = rowBase + x * 4;
      const dstIdx = rowBase + (w - 1 - x) * 4;
      out[dstIdx] = pixels[srcIdx];
      out[dstIdx + 1] = pixels[srcIdx + 1];
      out[dstIdx + 2] = pixels[srcIdx + 2];
      out[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  return out;
}

export interface BagCarryAnatomyDirective {
  dominantHand: DominantHand;
  carrySide: 'left' | 'right';
  freeSide: 'right' | 'left';
  carryLabelKo: string;
  carryLabelEn: string;
  slotPrompt: string;
  crossAngleLockPrompt: string;
  perAngleScreenSide: Record<0 | 45 | 90 | 135 | 180 | 225, BagViewerScreenPlacement>;
  perAngleScreenPrompt: Record<0 | 45 | 90 | 135 | 180 | 225, string>;
}

/**
 * Enforces realistic anatomical handedness AND explicit per-angle viewer screen-left/screen-right
 * coordinates for bag carry so multi-angle generation never swaps shoulders between front and back:
 * - Right-handed wearer keeps right arm/hand free and carries bags on ANATOMICAL LEFT arm/shoulder
 *   (VIEWER'S RIGHT on 0°/45°, occluded behind torso on 90°, VIEWER'S LEFT on 135°/180°/225°).
 * - Left-handed wearer keeps left arm/hand free and carries bags on ANATOMICAL RIGHT arm/shoulder
 *   (VIEWER'S LEFT on 0°/45°, foreground right side on 90°, VIEWER'S RIGHT on 135°/180°, far right on 225°).
 */
export function resolveBagCarryAnatomy(
  rawDominantHand?: unknown
): BagCarryAnatomyDirective {
  const normalized: DominantHand = normalizeHandedness(rawDominantHand, 'right');

  if (normalized === 'left') {
    const perAngleScreenSide: Record<0 | 45 | 90 | 135 | 180 | 225, BagViewerScreenPlacement> = {
      0: 'screen-left',
      45: 'screen-left',
      90: 'screen-right',
      135: 'screen-right',
      180: 'screen-right',
      225: 'far-occluded',
    };
    const perAngleScreenPrompt: Record<0 | 45 | 90 | 135 | 180 | 225, string> = {
      0: "0° Front: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-, wearer's ANATOMICAL RIGHT shoulder/arm/hand); wearer's left arm on IMAGE-RIGHT MUST be 100% empty.",
      45: "45° Front-Right: Bag MUST sit in foreground on VIEWER'S LEFT (IMAGE-LEFT <-, wearer's ANATOMICAL RIGHT shoulder/arm/hand); far left arm on IMAGE-RIGHT is 100% empty.",
      90: "90° Right Side Profile: Wearer's right side faces camera so the bag is CLEARLY VISIBLE in foreground on the right shoulder/hand.",
      135: "135° Back-Right: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->, wearer's ANATOMICAL RIGHT shoulder/arm/hand); left shoulder on IMAGE-LEFT is 100% empty.",
      180: "180° Straight Back: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->, wearer's ANATOMICAL RIGHT shoulder/arm/hand); left side on IMAGE-LEFT is 100% empty.",
      225: "225° Back-Left: Foreground left shoulder/arm on IMAGE-LEFT MUST be 100% empty; bag stays on wearer's far right side (IMAGE-RIGHT ->).",
    };
    return {
      dominantHand: 'left',
      carrySide: 'right',
      freeSide: 'left',
      carryLabelKo: '오른팔 · 오른손 (왼손잡이)',
      carryLabelEn: 'Right arm / shoulder (Left-handed)',
      slotPrompt:
        `carried EXCLUSIVELY on the model's ANATOMICAL RIGHT shoulder / RIGHT forearm / RIGHT hand across ALL turnaround angles — STRICT IMAGE-SIDE COORDINATES: [0° Front = IMAGE-LEFT <- | 45° = IMAGE-LEFT <- | 90° Right Profile = FOREGROUND VISIBLE | 135° Back-Right = IMAGE-RIGHT -> | 180° Back = IMAGE-RIGHT -> | 225° Back-Left = FAR RIGHT SIDE, NEVER on foreground left shoulder!]`,
      crossAngleLockPrompt:
        `ANATOMICAL HANDEDNESS BAG-CARRY LOCK (LEFT-HANDED WEARER -> RIGHT SIDE CARRY): Keep the wearer's dominant ANATOMICAL LEFT arm/hand completely free and unburdened across ALL turnaround views (0°, 45°, 90°, 135°, 180°, 225°). Every equipped bag/tote/crossbody/briefcase MUST stay locked to the wearer's ANATOMICAL RIGHT shoulder/arm/hand with exact camera-space coordinates: ${Object.values(perAngleScreenPrompt).join(' ')}`,
      perAngleScreenSide,
      perAngleScreenPrompt,
    };
  }

  const perAngleScreenSide: Record<0 | 45 | 90 | 135 | 180 | 225, BagViewerScreenPlacement> = {
    0: 'screen-right',
    45: 'screen-right',
    90: 'far-occluded',
    135: 'screen-left',
    180: 'screen-left',
    225: 'screen-left',
  };
  const perAngleScreenPrompt: Record<0 | 45 | 90 | 135 | 180 | 225, string> = {
    0: "0° Front: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->, wearer's ANATOMICAL LEFT shoulder/arm/hand); wearer's right arm on IMAGE-LEFT MUST be 100% empty (NEVER place bag on IMAGE-LEFT at 0°!).",
    45: "45° Front-Right: Bag MUST stay on FAR IMAGE-RIGHT side (wearer's ANATOMICAL LEFT shoulder/arm/hand); foreground right arm on IMAGE-LEFT is 100% empty.",
    90: "90° Right Side Profile: Foreground right shoulder/arm facing camera MUST be 100% empty (ZERO bag strap over right shoulder); bag stays behind torso on far left side.",
    135: "135° Back-Right: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-, wearer's ANATOMICAL LEFT shoulder/arm/hand); foreground right shoulder on IMAGE-RIGHT is 100% empty.",
    180: "180° Straight Back: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-, wearer's ANATOMICAL LEFT shoulder/arm/hand); right side on IMAGE-RIGHT is 100% empty.",
    225: "225° Back-Left: Bag is PROMINENT in foreground on VIEWER'S LEFT (IMAGE-LEFT <-, wearer's ANATOMICAL LEFT shoulder/arm/hand).",
  };

  return {
    dominantHand: 'right',
    carrySide: 'left',
    freeSide: 'right',
    carryLabelKo: '왼팔 · 왼손 (오른손잡이)',
    carryLabelEn: 'Left arm / shoulder (Right-handed)',
    slotPrompt:
      `carried EXCLUSIVELY on the model's ANATOMICAL LEFT shoulder / LEFT forearm / LEFT hand across ALL turnaround angles — STRICT IMAGE-SIDE COORDINATES: [0° Front = IMAGE-RIGHT -> (NEVER IMAGE-LEFT!) | 45° = IMAGE-RIGHT -> | 90° Right Profile = BEHIND TORSO, foreground right arm EMPTY | 135° Back-Right = IMAGE-LEFT <- | 180° Back = IMAGE-LEFT <- | 225° Back-Left = FOREGROUND IMAGE-LEFT <-]`,
    crossAngleLockPrompt:
      `ANATOMICAL HANDEDNESS BAG-CARRY LOCK (RIGHT-HANDED WEARER -> LEFT SIDE CARRY): Keep the wearer's dominant ANATOMICAL RIGHT arm/hand completely free and unburdened across ALL turnaround views (0°, 45°, 90°, 135°, 180°, 225°). Every equipped bag/tote/crossbody/briefcase MUST stay locked to the wearer's ANATOMICAL LEFT shoulder/arm/hand with exact camera-space coordinates: ${Object.values(perAngleScreenPrompt).join(' ')}`,
    perAngleScreenSide,
    perAngleScreenPrompt,
  };
}

/**
 * Resolves backdrop aura radiance tier (`C` | `B` | `A` | `S`) from a tier string or backdrop ID.
 */
export function resolveStageAuraTier(rawTierOrId?: unknown): StageAuraTier {
  const token = String(rawTierOrId || '')
    .trim()
    .toUpperCase();
  if (token === 'S' || token.startsWith('S_')) return 'S';
  if (token === 'A' || token.startsWith('A_')) return 'A';
  if (token === 'B' || token.startsWith('B_')) return 'B';
  return 'C';
}

export interface VtonQcSliceMetrics {
  width: number;
  height: number;
  fgPixels: number;
  fgHeightRatio: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  footBaselineRatio: number;
  coreCenterXRatio: number;
  clippedTop: boolean;
  clippedBottom: boolean;
  halfBody: boolean;
  interiorChromaRatio: number;
  outfitMeanRgb: [number, number, number] | null;
  hasWideOverheadCanopy?: boolean;
  umbrellaGapChromaRatio?: number;
  upperTorsoMeanRgb?: [number, number, number] | null;
  upperTorsoLeftRgb?: [number, number, number] | null;
  upperTorsoRightRgb?: [number, number, number] | null;
  upperTorsoLeftRightDiff?: number;
}

export interface InspectPixelSliceQcOptions {
  studioBackdropHex?: string | null;
}

function parseStudioHexTriplet(rawHex?: string | null): [number, number, number] | null {
  if (typeof rawHex !== 'string') return null;
  const clean = rawHex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    Number.parseInt(clean.slice(1, 3), 16),
    Number.parseInt(clean.slice(3, 5), 16),
    Number.parseInt(clean.slice(5, 7), 16),
  ];
}

function isChromaKeyLeakRgb(
  r: number,
  g: number,
  b: number,
  customKeyRgb?: [number, number, number] | null
): boolean {
  // Legacy green #5E9C7E (cool sage matte green where b >= r, avoiding warm-olive garments like [124,178,93])
  const isGreenKey =
    g > r + 14 &&
    g > b + 6 &&
    b >= r &&
    Math.abs(r - 94) <= 24 &&
    Math.abs(g - 156) <= 24 &&
    Math.abs(b - 126) <= 24;
  // Slate #94A3B8 or closely adjacent cool grey studio wall hole
  const isSlateHole =
    Math.abs(r - 148) <= 16 &&
    Math.abs(g - 163) <= 16 &&
    Math.abs(b - 184) <= 16;
  if (isGreenKey || isSlateHole) return true;
  if (customKeyRgb) {
    const [kr, kg, kb] = customKeyRgb;
    if (Math.abs(r - kr) <= 16 && Math.abs(g - kg) <= 16 && Math.abs(b - kb) <= 16) {
      return true;
    }
  }
  return false;
}

/**
 * Pure RGBA buffer inspection for a single cut-out VTON angle slice.
 * Evaluates full-body completeness (including cranial head-to-shoulder taper & scale-invariant
 * thigh-cut detection), baseline grounding, horizontal centering, interior unkeyed chroma pockets,
 * and central garment palette signature.
 */
export function inspectPixelSliceQc(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: InspectPixelSliceQcOptions
): VtonQcSliceMetrics {
  if (width < 16 || height < 16 || data.length < width * height * 4) {
    return {
      width,
      height,
      fgPixels: 0,
      fgHeightRatio: 0,
      minY: height,
      maxY: -1,
      minX: width,
      maxX: -1,
      footBaselineRatio: 0,
      coreCenterXRatio: 0.5,
      clippedTop: false,
      clippedBottom: false,
      halfBody: true,
      interiorChromaRatio: 0,
      outfitMeanRgb: null,
      hasWideOverheadCanopy: false,
      umbrellaGapChromaRatio: 0,
      upperTorsoMeanRgb: null,
      upperTorsoLeftRgb: null,
      upperTorsoRightRgb: null,
      upperTorsoLeftRightDiff: 0,
    };
  }

  let minY = height;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  let fgPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        fgPixels += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (fgPixels < 16 || maxY < minY) {
    return {
      width,
      height,
      fgPixels,
      fgHeightRatio: 0,
      minY,
      maxY,
      minX,
      maxX,
      footBaselineRatio: 0,
      coreCenterXRatio: 0.5,
      clippedTop: false,
      clippedBottom: false,
      halfBody: true,
      interiorChromaRatio: 0,
      outfitMeanRgb: null,
      hasWideOverheadCanopy: false,
      umbrellaGapChromaRatio: 0,
      upperTorsoMeanRgb: null,
      upperTorsoLeftRgb: null,
      upperTorsoRightRgb: null,
      upperTorsoLeftRightDiff: 0,
    };
  }

  const fgH = maxY - minY + 1;
  const fgHeightRatio = fgH / Math.max(1, height);
  const footBaselineRatio = maxY / Math.max(1, height - 1);

  const rowCounts = new Int32Array(height);
  const rowSpans = new Int32Array(height);
  const bodyWidths: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    const rowOff = y * width;
    let cnt = 0;
    let rMin = width;
    let rMax = -1;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        cnt += 1;
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    rowCounts[y] = cnt;
    rowSpans[y] = rMax >= rMin ? rMax - rMin + 1 : 0;
    if (cnt > 0 && y >= minY + fgH * 0.25 && y <= minY + fgH * 0.85) {
      bodyWidths.push(cnt);
    }
  }
  bodyWidths.sort((a, b) => a - b);
  const medianBodyWidth =
    bodyWidths.length > 0 ? bodyWidths[Math.floor(bodyWidths.length / 2)] : Math.max(1, width * 0.2);

  // Lower-calf/ankle core horizontal center X (0.78..0.92 of subject height)
  const cxY0 = Math.max(minY, Math.round(minY + fgH * 0.78));
  const cxY1 = Math.min(height - 1, Math.max(cxY0, Math.round(minY + fgH * 0.92)));
  const rowCenters: number[] = [];
  for (let y = cxY0; y <= cxY1; y += 1) {
    const rowOff = y * width;
    let rMin = width;
    let rMax = -1;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    if (rMax >= rMin) {
      rowCenters.push((rMin + rMax) * 0.5);
    }
  }
  rowCenters.sort((a, b) => a - b);
  const coreCenterX =
    rowCenters.length > 0
      ? rowCenters[Math.floor(rowCenters.length / 2)]
      : (minX + maxX) * 0.5;
  const coreCenterXRatio = coreCenterX / Math.max(1, width);

  // Measure shoulder/upper-torso max span (16%..36% of fgH) vs top cranial/neck zone (6%..12% of fgH)
  const shY0 = Math.min(maxY, Math.round(minY + fgH * 0.16));
  const shY1 = Math.min(maxY, Math.max(shY0, Math.round(minY + fgH * 0.36)));
  let shoulderMaxSpan = 0;
  for (let y = shY0; y <= shY1; y += 1) {
    if (rowSpans[y] > shoulderMaxSpan) shoulderMaxSpan = rowSpans[y];
  }
  const topCanopyEndY = Math.min(maxY, Math.round(minY + fgH * 0.15));
  let maxTop15Span = 0;
  for (let y = minY; y <= topCanopyEndY; y += 1) {
    if (rowSpans[y] > maxTop15Span) maxTop15Span = rowSpans[y];
  }
  const hasWideOverheadCanopy =
    (medianBodyWidth > 0 && maxTop15Span >= Math.max(medianBodyWidth * 1.48, width * 0.42)) ||
    (shoulderMaxSpan > 0 && maxTop15Span >= Math.max(shoulderMaxSpan * 1.24, width * 0.34));

  // Collar-cut / headless silhouette detector (e.g., decapitated jacket starting directly at collar/deltoids):
  // A real 7.5-head human without an overhead umbrella has a narrow head/neck in [6%..11% of fgH] (< 80% of shoulder width).
  const headNeckY0 = Math.min(maxY, Math.round(minY + fgH * 0.06));
  const headNeckY1 = Math.min(maxY, Math.max(headNeckY0, Math.round(minY + fgH * 0.11)));
  let minHeadNeckSpan = Infinity;
  for (let y = headNeckY0; y <= headNeckY1; y += 1) {
    if (rowSpans[y] > 0 && rowSpans[y] < minHeadNeckSpan) {
      minHeadNeckSpan = rowSpans[y];
    }
  }
  const headlessCollarCut =
    !hasWideOverheadCanopy &&
    fgH >= 36 &&
    shoulderMaxSpan >= width * 0.22 &&
    Number.isFinite(minHeadNeckSpan) &&
    minHeadNeckSpan >= shoulderMaxSpan * 0.82;

  // Top clip check (headless / collar-cut / waist-down crop)
  const topEdgeCount = Math.max(rowCounts[0] || 0, rowCounts[1] || 0, rowCounts[2] || 0);
  const yFlat = Math.min(maxY, minY + 2);
  const topAtMin = rowCounts[minY] || 0;
  const topAtFlat = rowCounts[yFlat] || 0;
  const topFlatSpan = Math.max(1, rowSpans[yFlat] || 1);
  const probeY = Math.min(maxY, minY + Math.max(4, Math.round(fgH * 0.14)));
  const probeBelow = rowCounts[probeY] || 0;

  const clippedTop =
    headlessCollarCut ||
    (minY <= 2 && topEdgeCount >= Math.max(width * 0.14, medianBodyWidth * 0.52)) ||
    (fgHeightRatio < 0.78 &&
      topAtFlat >= Math.max(width * 0.16, medianBodyWidth * 0.6) &&
      topAtMin >= topAtFlat * 0.68 &&
      topAtFlat / topFlatSpan >= 0.62 &&
      probeBelow <= topAtFlat * 1.45);

  // Bottom clip check (cut off at torso/thighs/knees flush against canvas bottom)
  const botEdgeCount = Math.max(
    rowCounts[height - 1] || 0,
    rowCounts[height - 2] || 0,
    rowCounts[height - 3] || 0,
    rowCounts[height - 4] || 0
  );
  const clippedBottom =
    maxY >= height - 4 && botEdgeCount >= Math.max(width * 0.18, medianBodyWidth * 0.56);

  // Half-body / waist-up / thigh-cut check (including scale-invariant aspect ratio so rescaled thigh crops fail!)
  const botTrimY = Math.max(minY, Math.round(maxY - fgH * 0.04));
  let maxBotBar = 0;
  for (let y = botTrimY; y <= maxY; y += 1) {
    if (rowCounts[y] > maxBotBar) maxBotBar = rowCounts[y];
  }
  const heightAspect = fgH / Math.max(1, medianBodyWidth);
  const scaleInvariantThighCut =
    !hasWideOverheadCanopy &&
    heightAspect < 2.08 &&
    maxBotBar >= medianBodyWidth * 0.56;
  const halfBody =
    fgHeightRatio < 0.44 ||
    scaleInvariantThighCut ||
    (fgHeightRatio < 0.58 && heightAspect < 2.22 && maxBotBar >= medianBodyWidth * 0.52);

  // Interior chroma-key pocket, umbrella under-canopy cavity, & upper-torso outerwear symmetry inspection
  const customKeyRgb = parseStudioHexTriplet(options?.studioBackdropHex);
  const chromaY0 = Math.min(
    maxY,
    Math.round(minY + fgH * (hasWideOverheadCanopy ? 0.05 : 0.16))
  );
  const chromaY1 = Math.max(chromaY0, Math.round(maxY - fgH * 0.06));
  const umbrellaGapY1 = Math.min(chromaY1, Math.round(minY + fgH * 0.36));
  const outfitY0 = Math.min(maxY, Math.round(minY + fgH * 0.22));
  const outfitY1 = Math.max(outfitY0, Math.round(minY + fgH * 0.74));
  const torsoY0 = Math.min(maxY, Math.round(minY + fgH * 0.25));
  const torsoY1 = Math.max(torsoY0, Math.round(minY + fgH * 0.46));
  const torsoRefWidth = hasWideOverheadCanopy
    ? medianBodyWidth
    : shoulderMaxSpan > 0
      ? shoulderMaxSpan
      : medianBodyWidth;
  const torsoHalfSpan = Math.max(8, Math.round(torsoRefWidth * 0.5));
  const torsoInnerGap = Math.max(2, Math.round(torsoHalfSpan * 0.16));
  const torsoOuterLimit = Math.max(torsoInnerGap + 4, Math.round(torsoHalfSpan * 0.88));

  let interiorChromaPixels = 0;
  let interiorSpanPixels = 0;
  let umbrellaGapChromaPixels = 0;
  let umbrellaGapSpanPixels = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let outfitCount = 0;
  let leftSumR = 0;
  let leftSumG = 0;
  let leftSumB = 0;
  let leftCount = 0;
  let rightSumR = 0;
  let rightSumG = 0;
  let rightSumB = 0;
  let rightCount = 0;

  for (let y = chromaY0; y <= chromaY1; y += 1) {
    const rowOff = y * width;
    let firstNonKey = -1;
    let lastNonKey = -1;
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (rowOff + x) * 4;
      if (
        data[idx + 3] > 64 &&
        !isChromaKeyLeakRgb(data[idx], data[idx + 1], data[idx + 2], customKeyRgb)
      ) {
        if (firstNonKey === -1) firstNonKey = x;
        lastNonKey = x;
      }
    }
    if (firstNonKey === -1 || lastNonKey - firstNonKey < 4) continue;
    const inUmbrellaGapBand = hasWideOverheadCanopy && y <= umbrellaGapY1;
    const inUpperTorsoBand = y >= torsoY0 && y <= torsoY1;
    for (let x = firstNonKey + 1; x < lastNonKey; x += 1) {
      const idx = (rowOff + x) * 4;
      if (data[idx + 3] > 64) {
        interiorSpanPixels += 1;
        if (inUmbrellaGapBand) umbrellaGapSpanPixels += 1;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (isChromaKeyLeakRgb(r, g, b, customKeyRgb)) {
          interiorChromaPixels += 1;
          if (inUmbrellaGapBand) umbrellaGapChromaPixels += 1;
        } else {
          if (y >= outfitY0 && y <= outfitY1) {
            sumR += r;
            sumG += g;
            sumB += b;
            outfitCount += 1;
          }
          if (inUpperTorsoBand) {
            const dx = x - coreCenterX;
            const absDx = Math.abs(dx);
            const inInnerNeckV =
              absDx <= torsoHalfSpan * 0.32 && y <= torsoY0 + Math.round((torsoY1 - torsoY0) * 0.38);
            const isBareSkinTone =
              inInnerNeckV && r >= 182 && g >= 128 && b >= 98 && r > g + 10;
            if (absDx >= torsoInnerGap && absDx <= torsoOuterLimit && !isBareSkinTone) {
              if (dx < 0) {
                leftSumR += r;
                leftSumG += g;
                leftSumB += b;
                leftCount += 1;
              } else {
                rightSumR += r;
                rightSumG += g;
                rightSumB += b;
                rightCount += 1;
              }
            }
          }
        }
      }
    }
  }

  const interiorChromaRatio =
    interiorSpanPixels > 0 ? interiorChromaPixels / interiorSpanPixels : 0;
  const umbrellaGapChromaRatio =
    hasWideOverheadCanopy && umbrellaGapSpanPixels > 0
      ? umbrellaGapChromaPixels / umbrellaGapSpanPixels
      : 0;
  const outfitMeanRgb: [number, number, number] | null =
    outfitCount >= 16
      ? [
          Math.round(sumR / outfitCount),
          Math.round(sumG / outfitCount),
          Math.round(sumB / outfitCount),
        ]
      : null;

  const upperTorsoLeftRgb: [number, number, number] | null =
    leftCount >= 12
      ? [
          Math.round(leftSumR / leftCount),
          Math.round(leftSumG / leftCount),
          Math.round(leftSumB / leftCount),
        ]
      : null;
  const upperTorsoRightRgb: [number, number, number] | null =
    rightCount >= 12
      ? [
          Math.round(rightSumR / rightCount),
          Math.round(rightSumG / rightCount),
          Math.round(rightSumB / rightCount),
        ]
      : null;
  const totalUpperCount = leftCount + rightCount;
  const upperTorsoMeanRgb: [number, number, number] | null =
    totalUpperCount >= 16
      ? [
          Math.round((leftSumR + rightSumR) / totalUpperCount),
          Math.round((leftSumG + rightSumG) / totalUpperCount),
          Math.round((leftSumB + rightSumB) / totalUpperCount),
        ]
      : null;
  const upperTorsoLeftRightDiff =
    upperTorsoLeftRgb && upperTorsoRightRgb
      ? Math.round(
          Math.hypot(
            upperTorsoLeftRgb[0] - upperTorsoRightRgb[0],
            upperTorsoLeftRgb[1] - upperTorsoRightRgb[1],
            upperTorsoLeftRgb[2] - upperTorsoRightRgb[2]
          ) * 10
        ) / 10
      : 0;

  return {
    width,
    height,
    fgPixels,
    fgHeightRatio,
    minY,
    maxY,
    minX,
    maxX,
    footBaselineRatio,
    coreCenterXRatio,
    clippedTop,
    clippedBottom,
    halfBody,
    interiorChromaRatio,
    outfitMeanRgb,
    hasWideOverheadCanopy,
    umbrellaGapChromaRatio,
    upperTorsoMeanRgb,
    upperTorsoLeftRgb,
    upperTorsoRightRgb,
    upperTorsoLeftRightDiff,
  };
}

export interface TurnaroundConsistencyQcReport {
  ok: boolean;
  frontValid: boolean;
  failedAngles: number[];
  reasons: string[];
}

/**
 * Evaluates multi-angle VTON slices against the `0°` front slice for:
 * - Full-body completeness (no headless, bottom-clipped, or half-body crops)
 * - Cross-angle height parity (`0.72..1.32` relative to `0°`)
 * - Foot baseline parity (`<= 0.09` drift)
 * - Horizontal core centering (`|coreCenterXRatio - 0.5| <= 0.16`)
 * - Outfit color consistency vs `0°` (RGB Euclidean distance `<= 95`)
 * - Absence of interior unkeyed green/slate pockets (`<= 0.045`)
 */
export function evaluateTurnaroundConsistencyQc(
  slicesByAngle: Partial<Record<number, VtonQcSliceMetrics>>
): TurnaroundConsistencyQcReport {
  const front = slicesByAngle[0];
  const reasons: string[] = [];
  const failedAnglesSet = new Set<number>();

  if (!front || front.fgPixels < 16) {
    return {
      ok: false,
      frontValid: false,
      failedAngles: [0],
      reasons: ['front_missing'],
    };
  }

  const frontSplitCoat = (front.upperTorsoLeftRightDiff ?? 0) > 58;
  const frontUmbrellaGap =
    Boolean(front.hasWideOverheadCanopy) && (front.umbrellaGapChromaRatio ?? 0) > 0.035;

  const frontComplete =
    !front.clippedTop &&
    !front.clippedBottom &&
    !front.halfBody &&
    front.fgHeightRatio >= 0.48 &&
    front.interiorChromaRatio <= 0.045 &&
    !frontSplitCoat &&
    !frontUmbrellaGap;

  if (!frontComplete) {
    failedAnglesSet.add(0);
    if (front.clippedTop) reasons.push('0:clipped_top');
    if (front.clippedBottom) reasons.push('0:clipped_bottom');
    if (front.halfBody) reasons.push('0:half_body');
    if (front.fgHeightRatio < 0.48) reasons.push('0:too_small');
    if (front.interiorChromaRatio > 0.045) reasons.push('0:interior_chroma_hole');
    if (frontSplitCoat) reasons.push('0:split_outerwear_color');
    if (frontUmbrellaGap) reasons.push('0:umbrella_gap_cutout_failed');
  }

  const angles = Object.keys(slicesByAngle)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const angle of angles) {
    const m = slicesByAngle[angle];
    if (!m) continue;
    if (m.clippedTop) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:clipped_top`);
    }
    if (m.clippedBottom) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:clipped_bottom`);
    }
    if (m.halfBody || m.fgHeightRatio < 0.48) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:incomplete_height`);
    }
    if (m.interiorChromaRatio > 0.045) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:interior_chroma_hole`);
    }
    if (m.hasWideOverheadCanopy && (m.umbrellaGapChromaRatio ?? 0) > 0.035 && angle !== 0) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:umbrella_gap_cutout_failed`);
    }
    if ((angle === 180) && (m.upperTorsoLeftRightDiff ?? 0) > 58) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:split_outerwear_color`);
    }
    if (Math.abs(m.coreCenterXRatio - 0.5) > 0.16) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:off_center_x`);
    }

    if (angle !== 0 && front.fgHeightRatio >= 0.48) {
      const heightRatio = m.fgHeightRatio / Math.max(0.01, front.fgHeightRatio);
      if (heightRatio < 0.72 || heightRatio > 1.32) {
        failedAnglesSet.add(angle);
        reasons.push(`${angle}:height_mismatch`);
      }
      if (Math.abs(m.footBaselineRatio - front.footBaselineRatio) > 0.09) {
        failedAnglesSet.add(angle);
        reasons.push(`${angle}:baseline_drift`);
      }
      if (front.outfitMeanRgb && m.outfitMeanRgb) {
        const dr = m.outfitMeanRgb[0] - front.outfitMeanRgb[0];
        const dg = m.outfitMeanRgb[1] - front.outfitMeanRgb[1];
        const db = m.outfitMeanRgb[2] - front.outfitMeanRgb[2];
        const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (rgbDist > 95) {
          failedAnglesSet.add(angle);
          reasons.push(`${angle}:palette_drift`);
        }
      }
      if (front.upperTorsoMeanRgb && m.upperTorsoMeanRgb) {
        const udr = m.upperTorsoMeanRgb[0] - front.upperTorsoMeanRgb[0];
        const udg = m.upperTorsoMeanRgb[1] - front.upperTorsoMeanRgb[1];
        const udb = m.upperTorsoMeanRgb[2] - front.upperTorsoMeanRgb[2];
        const upperDist = Math.sqrt(udr * udr + udg * udg + udb * udb);
        if (upperDist > 64) {
          failedAnglesSet.add(angle);
          reasons.push(`${angle}:outerwear_palette_drift`);
        }
      }
    }
  }

  return {
    ok: failedAnglesSet.size === 0 && reasons.length === 0,
    frontValid: frontComplete,
    failedAngles: Array.from(failedAnglesSet).sort((a, b) => a - b),
    reasons,
  };
}

export interface VtonQcFailureLogEntry {
  timestamp: number;
  outfitComboId: string;
  avatarConfigHash: string;
  attempts: number;
  reasons: string[];
  failedAngles: number[];
  frontOnlyFallback: boolean;
}

export function readVtonQcLogs(): VtonQcFailureLogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VTON_QC_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as VtonQcFailureLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logVtonQcFailure(
  entry: Omit<VtonQcFailureLogEntry, 'timestamp'> & { timestamp?: number }
): VtonQcFailureLogEntry[] {
  const nextEntry: VtonQcFailureLogEntry = {
    timestamp: entry.timestamp ?? Date.now(),
    outfitComboId: String(entry.outfitComboId || 'unknown'),
    avatarConfigHash: String(entry.avatarConfigHash || 'unknown'),
    attempts: Math.max(1, Math.round(Number(entry.attempts) || 1)),
    reasons: Array.isArray(entry.reasons) ? entry.reasons.slice(0, 12) : [],
    failedAngles: Array.isArray(entry.failedAngles) ? entry.failedAngles.slice(0, 8) : [],
    frontOnlyFallback: Boolean(entry.frontOnlyFallback),
  };
  const prev = readVtonQcLogs();
  const next = [...prev, nextEntry].slice(-MAX_QC_LOG_ENTRIES);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(VTON_QC_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function clearVtonQcLogs(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(VTON_QC_LOG_STORAGE_KEY);
  } catch {
    // ignore storage removal errors
  }
}

export interface CityCentroidEntry {
  key?: string;
  name: string;
  lat: number;
  lon: number;
}

interface ReverseGeoAddress {
  city?: string;
  province?: string;
  state?: string;
  county?: string;
  borough?: string;
  city_district?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  town?: string;
  village?: string;
}

function cleanKoreanCityToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s === '서울' || s === '서울특별시' || s === '서울시' || /^seoul/i.test(s)) return '서울시';
  if (s === '부산' || s === '부산광역시' || s === '부산시' || /^busan/i.test(s)) return '부산시';
  if (s === '인천' || s === '인천광역시' || s === '인천시' || /^incheon/i.test(s)) return '인천시';
  if (s === '대구' || s === '대구광역시' || s === '대구시' || /^daegu/i.test(s)) return '대구시';
  if (s === '대전' || s === '대전광역시' || s === '대전시' || /^daejeon/i.test(s)) return '대전시';
  if (s === '광주' || s === '광주광역시' || s === '광주시' || /^gwangju/i.test(s)) return '광주시';
  if (s === '울산' || s === '울산광역시' || s === '울산시' || /^ulsan/i.test(s)) return '울산시';
  if (s === '세종' || s === '세종특별자치시' || /^sejong/i.test(s)) return '세종시';
  return s.replace(/특별시$|광역시$|특별자치시$|특별자치도$/u, '시');
}

function sanitizeCityCoordsLabel(name: string): string {
  return String(name || '')
    .replace(/\s*·\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats reverse-geocoded coordinates into crisp Korean `~시 ~구` or `~시 ~구 ~동` labels
 * (e.g., `서울시 노원구` or `서울시 강남구 역삼동`), falling back cleanly to the nearest centroid
 * in `cityCoords` when reverse-geocoding returns incomplete or empty fields.
 */
export function formatKoreanDistrictLocation(
  reverseGeoJson: { address?: ReverseGeoAddress } | null | undefined,
  lat: number,
  lon: number,
  cityCoords: readonly CityCentroidEntry[] = []
): string {
  const addr = reverseGeoJson?.address;
  if (addr && typeof addr === 'object') {
    const rawCity = addr.city || addr.state || addr.province || addr.town || '';
    const cityToken = cleanKoreanCityToken(String(rawCity || ''));

    const districtCandidates = [
      addr.borough,
      addr.city_district,
      addr.county,
    ]
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== rawCity);
    const guToken =
      districtCandidates.find((v) => /(구|군)$/u.test(v)) || districtCandidates[0] || '';

    const dongCandidates = [addr.quarter, addr.suburb, addr.neighbourhood, addr.village]
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== guToken && v !== rawCity);
    const dongToken =
      dongCandidates.find((v) => /(동|읍|면|가)$/u.test(v)) || '';

    const parts = [cityToken, guToken, dongToken].filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 3).join(' ');
    }
    if (parts.length === 1 && guToken) {
      return parts[0];
    }
  }

  if (Array.isArray(cityCoords) && cityCoords.length > 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
    let best: CityCentroidEntry = cityCoords[0];
    let bestDistSq = Infinity;
    for (const c of cityCoords) {
      const dLat = lat - c.lat;
      const dLon = lon - c.lon;
      const distSq = dLat * dLat + dLon * dLon;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = c;
      }
    }
    return sanitizeCityCoordsLabel(best.name);
  }

  return '서울시 중구 명동';
}
