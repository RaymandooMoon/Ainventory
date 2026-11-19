export type DominantHand = 'right' | 'left';
export type StageAuraTier = 'C' | 'B' | 'A' | 'S';

export const VTON_QC_LOG_STORAGE_KEY = 'ainventory_vton_qc_failures_v1';
const MAX_QC_LOG_ENTRIES = 30;

export type BagViewerScreenPlacement =
  | 'screen-left'
  | 'screen-right'
  | 'far-occluded'
  | 'center-back'
  | 'front-straps-only';

export type BagCarryStyle =
  | 'hand_only'
  | 'shoulder'
  | 'crossbody'
  | 'backpack'
  | 'convertible_hand_strap';

export type Turnaround8AngleDeg = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export interface BagCarrySpecInput {
  hasStrap?: boolean | null;
  has_strap?: boolean | number | null;
  bagCarryStyle?: BagCarryStyle | string | null;
  bag_carry_style?: BagCarryStyle | string | null;
}

export interface NormalizedBagCarrySpec {
  hasStrap: boolean;
  bagCarryStyle: BagCarryStyle;
}

const VALID_BAG_CARRY_STYLES = new Set<BagCarryStyle>([
  'hand_only',
  'shoulder',
  'crossbody',
  'backpack',
  'convertible_hand_strap',
]);

export function normalizeBagCarrySpecInput(
  raw?: BagCarrySpecInput | null
): NormalizedBagCarrySpec {
  const rawStyle = String(raw?.bagCarryStyle ?? raw?.bag_carry_style ?? '')
    .trim()
    .toLowerCase() as BagCarryStyle;
  const rawStrapVal = raw?.hasStrap ?? raw?.has_strap;
  const hasExplicitStrap =
    rawStrapVal === true ||
    rawStrapVal === false ||
    rawStrapVal === 1 ||
    rawStrapVal === 0;

  let bagCarryStyle: BagCarryStyle = VALID_BAG_CARRY_STYLES.has(rawStyle)
    ? rawStyle
    : 'shoulder';
  let hasStrap = hasExplicitStrap
    ? Boolean(Number(rawStrapVal))
    : bagCarryStyle !== 'hand_only';

  if (hasExplicitStrap && !hasStrap && bagCarryStyle !== 'hand_only') {
    bagCarryStyle = 'hand_only';
  }
  if (bagCarryStyle === 'hand_only' && !hasExplicitStrap) {
    hasStrap = false;
  }
  return { hasStrap, bagCarryStyle };
}

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
  /bag|tote|crossbody|briefcase|backpack|clutch|shoulder|messenger|duffel|duffle|weekender|hobo|satchel|pouch|handbag|가방|토트|크로스|브리프케이스|서류가방|백팩|배낭|숄더|클러치|파우치|핸드백|보스턴|메신저|더플|호보/i;
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
  hasStrap: boolean;
  bagCarryStyle: BagCarryStyle;
  mirrored: boolean;
  visible: boolean;
  screenSide: BagViewerScreenPlacement;
  screenSign: -1 | 0 | 1;
  centerOffsetFromAxis: number;
  bagCenterX: number;
  strapRect: BagAssetRect | null;
  secondaryStrapRect?: BagAssetRect | null;
  bagRect: BagAssetRect | null;
}

function normalize8AngleDeg(angleDeg: number): Turnaround8AngleDeg {
  if (angleDeg === -45 || angleDeg === 315) return 315;
  if (angleDeg === -90 || angleDeg === 270) return 270;
  if (angleDeg === -135 || angleDeg === 225) return 225;
  if (angleDeg === 45) return 45;
  if (angleDeg === 90) return 90;
  if (angleDeg === 135) return 135;
  if (angleDeg === 180 || angleDeg === -180) return 180;
  return 0;
}

/**
 * Pre-Normalization Layer:
 * Computes the exact camera-space bag asset bounding box for ALL 8 true angles (`0..315°`),
 * branched by `hasStrap` and `bagCarryStyle` (`hand_only`, `shoulder`, `crossbody`, `backpack`,
 * `convertible_hand_strap`), preventing armpit-tuck and hallucinated shoulder straps on strapless bags.
 */
export function computeBagAssetPlacementBox(params: {
  angleDeg: Turnaround8AngleDeg | -45 | -90 | -135 | -180;
  handedness?: unknown;
  hasStrap?: boolean | null;
  bagCarryStyle?: BagCarryStyle | string | null;
  cx: number;
  shoulderY: number;
  waistY: number;
  shoulderW: number;
  hipW: number;
  headH: number;
  widthCompact?: number;
}): BagAssetPlacementBox {
  const angle = normalize8AngleDeg(params.angleDeg);
  const handedness = normalizeHandedness(params.handedness, 'right');
  const spec = normalizeBagCarrySpecInput({
    hasStrap: params.hasStrap,
    bagCarryStyle: params.bagCarryStyle,
  });
  const anatomy = resolveBagCarryAnatomy(handedness, spec);
  const mirrored = handedness === 'left';
  const screenSide = anatomy.perAngleScreenSide[angle];
  const widthCompact = params.widthCompact ?? 0.85;
  const bagW = Math.max(8, params.headH * 0.64 * widthCompact);
  const bagH = Math.max(12, params.headH * 0.86);

  // Backpack physics: centered on upper-mid back on rear views, protruding behind torso on side profiles,
  // dual vertical shoulder straps ONLY on front views (ZERO hip bag hanging on front!).
  if (spec.bagCarryStyle === 'backpack') {
    const strapW = Math.max(3, Math.round(params.headH * 0.14));
    const strapH = Math.max(10, Math.round((params.waistY - params.shoulderY) * 0.72));
    if (angle === 0 || angle === 45 || angle === 315) {
      const shift = angle === 45 ? params.shoulderW * 0.06 : angle === 315 ? -params.shoulderW * 0.06 : 0;
      const leftStrapX = Math.round(params.cx - params.shoulderW * 0.34 + shift);
      const rightStrapX = Math.round(params.cx + params.shoulderW * 0.34 - strapW + shift);
      return {
        handedness,
        carrySide: anatomy.carrySide,
        hasStrap: true,
        bagCarryStyle: 'backpack',
        mirrored,
        visible: true,
        screenSide: 'front-straps-only',
        screenSign: 0,
        centerOffsetFromAxis: 0,
        bagCenterX: params.cx,
        strapRect: {
          x: leftStrapX,
          y: Math.round(params.shoulderY + 2),
          width: strapW,
          height: strapH,
        },
        secondaryStrapRect: {
          x: rightStrapX,
          y: Math.round(params.shoulderY + 2),
          width: strapW,
          height: strapH,
        },
        bagRect: null,
      };
    }
    if (angle === 90 || angle === 270) {
      // At 90° facing screen-right, back is on screen-left (-1); at 270° facing screen-left, back is on screen-right (+1)
      const backSign: -1 | 1 = angle === 90 ? -1 : 1;
      const packW = Math.max(10, Math.round(params.headH * 0.54));
      const packH = Math.max(18, Math.round(params.headH * 1.48));
      const packCenterX = params.cx + backSign * (params.shoulderW * 0.44 + packW * 0.36);
      const packTopY = Math.round(params.shoulderY + params.headH * 0.14);
      return {
        handedness,
        carrySide: anatomy.carrySide,
        hasStrap: true,
        bagCarryStyle: 'backpack',
        mirrored,
        visible: true,
        screenSide: backSign === -1 ? 'screen-left' : 'screen-right',
        screenSign: backSign,
        centerOffsetFromAxis: packCenterX - params.cx,
        bagCenterX: packCenterX,
        strapRect: {
          x: Math.round(params.cx - strapW * 0.5),
          y: Math.round(params.shoulderY + 2),
          width: strapW,
          height: strapH,
        },
        bagRect: {
          x: Math.round(packCenterX - packW * 0.5),
          y: packTopY,
          width: packW,
          height: packH,
        },
      };
    }
    // 135°, 180°, 225° rear views: backpack centered on upper-mid back
    const rearShift =
      angle === 135 ? -params.shoulderW * 0.1 : angle === 225 ? params.shoulderW * 0.1 : 0;
    const packW = Math.max(14, Math.round(params.shoulderW * 0.68));
    const packH = Math.max(20, Math.round(params.headH * 1.52));
    const packCenterX = params.cx + rearShift;
    const packTopY = Math.round(params.shoulderY + params.headH * 0.16);
    return {
      handedness,
      carrySide: anatomy.carrySide,
      hasStrap: true,
      bagCarryStyle: 'backpack',
      mirrored,
      visible: true,
      screenSide: 'center-back',
      screenSign: 0,
      centerOffsetFromAxis: rearShift,
      bagCenterX: packCenterX,
      strapRect: null,
      bagRect: {
        x: Math.round(packCenterX - packW * 0.5),
        y: packTopY,
        width: packW,
        height: packH,
      },
    };
  }

  if (screenSide === 'far-occluded') {
    return {
      handedness,
      carrySide: anatomy.carrySide,
      hasStrap: spec.hasStrap,
      bagCarryStyle: spec.bagCarryStyle,
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

  // Vertical hang height strictly separated by carry style so bags NEVER tuck into armpits:
  // - hand_only / convertible_hand_strap: lowered hand/thigh level (waistY + 0.92 * headH)
  // - shoulder / crossbody: natural below-hip hang (waistY + 0.34 * headH), NEVER armpit!
  const isHandLowered =
    !spec.hasStrap ||
    spec.bagCarryStyle === 'hand_only' ||
    spec.bagCarryStyle === 'convertible_hand_strap';
  const bagTopY = isHandLowered
    ? params.waistY + params.headH * 0.92
    : params.waistY + params.headH * 0.34;
  const emitStrap =
    spec.hasStrap &&
    (spec.bagCarryStyle === 'shoulder' || spec.bagCarryStyle === 'crossbody');

  // Lateral profile views (90° right profile or 270° left profile when bag is on foreground side)
  if (angle === 90 || angle === 270) {
    const profileSign: -1 | 1 = angle === 90 ? 1 : -1;
    const profileOffset = profileSign * params.hipW * 0.12;
    const bagCenterX = params.cx + profileOffset;
    const strapW = Math.max(4, Math.round(bagW * 0.22));
    return {
      handedness,
      carrySide: anatomy.carrySide,
      hasStrap: spec.hasStrap,
      bagCarryStyle: spec.bagCarryStyle,
      mirrored,
      visible: true,
      screenSide,
      screenSign: profileSign,
      centerOffsetFromAxis: profileOffset,
      bagCenterX,
      strapRect: emitStrap
        ? {
            x: Math.round(bagCenterX - strapW * 0.5),
            y: Math.round(params.shoulderY + 2),
            width: strapW,
            height: Math.max(8, Math.round(bagTopY - params.shoulderY)),
          }
        : null,
      bagRect: {
        x: Math.round(bagCenterX - bagW * 0.5),
        y: Math.round(bagTopY),
        width: Math.round(bagW),
        height: Math.round(bagH),
      },
    };
  }

  const screenSign: -1 | 1 = screenSide === 'screen-left' ? -1 : 1;
  const lateralOffset = params.hipW * 0.58 + bagW * 0.3;
  const centerOffsetFromAxis = screenSign * lateralOffset;
  const bagCenterX = params.cx + centerOffsetFromAxis;
  // Crossbody strap originates from the OPPOSITE shoulder across the torso; shoulder strap from SAME shoulder
  const strapOriginSign = spec.bagCarryStyle === 'crossbody' ? -screenSign : screenSign;
  const strapShoulderX = params.cx + strapOriginSign * (params.shoulderW * 0.36);

  return {
    handedness,
    carrySide: anatomy.carrySide,
    hasStrap: spec.hasStrap,
    bagCarryStyle: spec.bagCarryStyle,
    mirrored,
    visible: true,
    screenSide,
    screenSign,
    centerOffsetFromAxis,
    bagCenterX,
    strapRect: emitStrap
      ? {
          x: Math.round(Math.min(strapShoulderX, bagCenterX) - 2),
          y: Math.round(params.shoulderY + 2),
          width: Math.max(
            4,
            Math.round(
              spec.bagCarryStyle === 'crossbody'
                ? Math.abs(bagCenterX - strapShoulderX) * 0.16
                : Math.abs(bagCenterX - strapShoulderX) * 0.24
            )
          ),
          height: Math.max(8, Math.round(bagTopY - params.shoulderY)),
        }
      : null,
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
  hasStrap: boolean;
  bagCarryStyle: BagCarryStyle;
  carryLabelKo: string;
  carryLabelEn: string;
  dualHandRolePrompt: string;
  slotPrompt: string;
  crossAngleLockPrompt: string;
  perAngleScreenSide: Record<Turnaround8AngleDeg, BagViewerScreenPlacement>;
  perAngleScreenPrompt: Record<Turnaround8AngleDeg, string>;
}

function buildStyleCarryPhysicsCue(
  spec: NormalizedBagCarrySpec,
  carrySideUpper: 'LEFT' | 'RIGHT',
  freeSideUpper: 'RIGHT' | 'LEFT'
): string {
  if (spec.bagCarryStyle === 'backpack') {
    return (
      `BACKPACK CARRY PHYSICS (DUAL-SHOULDER BACKPACK — has_strap=true): Wear symmetrically on the model's upper-mid BACK with BOTH shoulder straps resting flat over both left and right shoulders. BOTH HANDS (${carrySideUpper} HAND and ${freeSideUpper} HAND) hang completely free, relaxed, and empty at the sides — NEVER carry a backpack in one hand or tuck under an armpit.`
    );
  }
  if (!spec.hasStrap || spec.bagCarryStyle === 'hand_only') {
    return (
      `STRAPLESS HAND-CARRY PHYSICS (has_strap=FALSE, carry_style=hand_only — STRICTLY ZERO SHOULDER STRAP, ZERO CROSSBODY STRAP, ZERO ARMPIT TUCK): ` +
      `CARRYING HAND (wearer's ANATOMICAL ${carrySideUpper} HAND) hangs extended straight downward gripping the bag's top handle/body naturally at MID-THIGH / LOWER-HIP HEIGHT with clear arm extension; ` +
      `FREE HAND (wearer's ANATOMICAL ${freeSideUpper} HAND) hangs completely relaxed, open, and 100% empty at the opposite side. ` +
      `STRICTLY FORBIDDEN: NEVER invent or draw a shoulder strap, NEVER hang from the shoulder, and NEVER clamp/tuck the bag up under the armpit or bent elbow!`
    );
  }
  if (spec.bagCarryStyle === 'crossbody') {
    return (
      `CROSSBODY STRAP PHYSICS (has_strap=TRUE, carry_style=crossbody — ZERO ARMPIT TUCK): ` +
      `ONE diagonal strap runs cleanly from the wearer's ANATOMICAL ${freeSideUpper} SHOULDER diagonally across the chest/back down to the bag resting smoothly at/below the ANATOMICAL ${carrySideUpper} HIP (waist-to-upper-thigh height, clearly BELOW the armpit). ` +
      `CARRYING SIDE (${carrySideUpper} HAND) rests relaxed beside or lightly steadying the hip bag; FREE HAND (${freeSideUpper} HAND) hangs completely free and empty.`
    );
  }
  if (spec.bagCarryStyle === 'convertible_hand_strap') {
    return (
      `CONVERTIBLE DUFFEL/WEEKENDER CARRY PHYSICS (has_strap=TRUE, carry_style=convertible_hand_strap — ZERO ARMPIT TUCK): ` +
      `CARRYING HAND (wearer's ANATOMICAL ${carrySideUpper} HAND) holds the top twin handles lowered naturally at mid-thigh/knee height (with optional detached/relaxed strap draping below), NEVER squeezed into the armpit; ` +
      `FREE HAND (wearer's ANATOMICAL ${freeSideUpper} HAND) hangs completely relaxed and 100% empty.`
    );
  }
  return (
    `SHOULDER-BAG STRAP PHYSICS (has_strap=TRUE, carry_style=shoulder — ZERO ARMPIT TUCK): ` +
    `Single shoulder strap rests cleanly atop the wearer's ANATOMICAL ${carrySideUpper} SHOULDER with the bag body hanging naturally AT/BELOW HIP-WAIST LEVEL (clearly separated below the armpit, NEVER crushed or wedged into the armpit!). ` +
    `CARRYING SIDE (${carrySideUpper} HAND) hangs naturally beside the bag; FREE HAND (wearer's ANATOMICAL ${freeSideUpper} HAND) hangs completely relaxed and 100% empty.`
  );
}

/**
 * Pre-Normalization Layer:
 * Enforces realistic anatomical handedness, explicit 8-angle viewer screen-left/screen-right
 * coordinates (`0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°`), bag strap/carry-style physics,
 * and dual-hand role conditioning (carrying hand vs free hand, zero armpit tuck).
 */
export function resolveBagCarryAnatomy(
  rawDominantHand?: unknown,
  rawBagSpec?: BagCarrySpecInput | null
): BagCarryAnatomyDirective {
  const normalized: DominantHand = normalizeHandedness(rawDominantHand, 'right');
  const spec = normalizeBagCarrySpecInput(rawBagSpec);
  const carrySide: 'left' | 'right' = normalized === 'left' ? 'right' : 'left';
  const freeSide: 'right' | 'left' = normalized === 'left' ? 'left' : 'right';
  const carrySideUpper = carrySide === 'left' ? 'LEFT' : 'RIGHT';
  const freeSideUpper = freeSide === 'left' ? 'LEFT' : 'RIGHT';
  const dualHandRolePrompt = buildStyleCarryPhysicsCue(spec, carrySideUpper, freeSideUpper);

  if (spec.bagCarryStyle === 'backpack') {
    const perAngleScreenSide: Record<Turnaround8AngleDeg, BagViewerScreenPlacement> = {
      0: 'front-straps-only',
      45: 'front-straps-only',
      90: 'screen-left',
      135: 'center-back',
      180: 'center-back',
      225: 'center-back',
      270: 'screen-right',
      315: 'front-straps-only',
    };
    const perAngleScreenPrompt: Record<Turnaround8AngleDeg, string> = {
      0: '0° Front: Show ONLY the two symmetrical backpack shoulder straps curving cleanly over both shoulders; main backpack body stays hidden behind the back; BOTH hands 100% empty.',
      45: '45° Front-Right: Show backpack shoulder straps over shoulders and slight side depth behind the rear-left shoulder; BOTH hands 100% empty.',
      90: '90° Right Side Profile (facing SCREEN-RIGHT ->): Backpack body sits cleanly on the wearer\'s BACK protruding on SCREEN-LEFT behind the torso with strap over shoulder; hands 100% empty.',
      135: '135° Back-Right Rear View: Full backpack centered cleanly on the wearer\'s upper-mid back facing camera; hands 100% empty.',
      180: '180° Straight Back: Full backpack centered symmetrically on the wearer\'s upper-mid back; hands 100% empty.',
      225: '225° Back-Left Rear View: Full backpack centered cleanly on the wearer\'s upper-mid back facing camera; hands 100% empty.',
      270: '270° Left Side Profile (facing SCREEN-LEFT <-): Backpack body sits cleanly on the wearer\'s BACK protruding on SCREEN-RIGHT behind the torso with strap over shoulder; hands 100% empty.',
      315: '315° Front-Left: Show backpack shoulder straps over shoulders and slight side depth behind the rear-right shoulder; BOTH hands 100% empty.',
    };
    return {
      dominantHand: normalized,
      carrySide,
      freeSide,
      hasStrap: true,
      bagCarryStyle: 'backpack',
      carryLabelKo: '양어깨 백팩 착용',
      carryLabelEn: 'Dual-shoulder backpack (back)',
      dualHandRolePrompt,
      slotPrompt: `worn symmetrically on the back as a backpack across ALL 8 angles. ${dualHandRolePrompt}`,
      crossAngleLockPrompt: `BACKPACK 8-ANGLE LOCK: ${dualHandRolePrompt} Exact per-angle positions: ${Object.values(perAngleScreenPrompt).join(' ')}`,
      perAngleScreenSide,
      perAngleScreenPrompt,
    };
  }

  const carryDesc = !spec.hasStrap || spec.bagCarryStyle === 'hand_only'
    ? `held lowered in wearer's ANATOMICAL ${carrySideUpper} HAND at mid-thigh height (ZERO shoulder strap, ZERO armpit tuck)`
    : spec.bagCarryStyle === 'crossbody'
      ? `slung crossbody from ${freeSideUpper} shoulder to wearer's ANATOMICAL ${carrySideUpper} HIP (ZERO armpit tuck)`
      : spec.bagCarryStyle === 'convertible_hand_strap'
        ? `held lowered in wearer's ANATOMICAL ${carrySideUpper} HAND at mid-thigh height (ZERO armpit tuck)`
        : `carried on wearer's ANATOMICAL ${carrySideUpper} SHOULDER hanging naturally at/below hip height (ZERO armpit tuck)`;

  if (normalized === 'left') {
    const perAngleScreenSide: Record<Turnaround8AngleDeg, BagViewerScreenPlacement> = {
      0: 'screen-left',
      45: 'screen-left',
      90: 'screen-right',
      135: 'screen-right',
      180: 'screen-right',
      225: 'far-occluded',
      270: 'far-occluded',
      315: 'screen-left',
    };
    const perAngleScreenPrompt: Record<Turnaround8AngleDeg, string> = {
      0: `0° Front: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; wearer's free LEFT arm/hand on IMAGE-RIGHT MUST be 100% empty.`,
      45: `45° Front-Right (facing SCREEN-RIGHT ->): Bag MUST sit in foreground on VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; far LEFT arm on IMAGE-RIGHT is 100% empty.`,
      90: `90° Right Side Profile (facing SCREEN-RIGHT ->): Wearer's right side faces camera so bag is CLEARLY VISIBLE in foreground, ${carryDesc}.`,
      135: `135° Back-Right Rear View: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->), ${carryDesc}; LEFT shoulder/arm on IMAGE-LEFT is 100% empty.`,
      180: `180° Straight Back: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->), ${carryDesc}; LEFT side on IMAGE-LEFT is 100% empty.`,
      225: `225° Back-Left Rear View: Foreground LEFT shoulder/arm on IMAGE-LEFT MUST be 100% empty; bag stays on wearer's far RIGHT side (IMAGE-RIGHT ->).`,
      270: `270° Left Side Profile (facing SCREEN-LEFT <-): Foreground LEFT shoulder/arm facing camera MUST be 100% empty; bag stays occluded behind torso on wearer's far RIGHT side.`,
      315: `315° Front-Left (facing SCREEN-LEFT <-): Bag stays on far VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; foreground LEFT arm/hand on IMAGE-RIGHT is 100% empty.`,
    };
    return {
      dominantHand: 'left',
      carrySide: 'right',
      freeSide: 'left',
      hasStrap: spec.hasStrap,
      bagCarryStyle: spec.bagCarryStyle,
      carryLabelKo: '오른팔 · 오른손 (왼손잡이)',
      carryLabelEn: 'Right arm / hand (Left-handed)',
      dualHandRolePrompt,
      slotPrompt: `carried EXCLUSIVELY on the model's ANATOMICAL RIGHT side across ALL 8 angles (${carryDesc}). ${dualHandRolePrompt} STRICT IMAGE-SIDE COORDINATES: [0°=IMAGE-LEFT <- | 45°=IMAGE-LEFT <- | 90°=FOREGROUND VISIBLE | 135°=IMAGE-RIGHT -> | 180°=IMAGE-RIGHT -> | 225°=FAR RIGHT | 270°=BEHIND TORSO | 315°=IMAGE-LEFT <-]`,
      crossAngleLockPrompt: `ANATOMICAL HANDEDNESS BAG-CARRY LOCK (LEFT-HANDED WEARER -> RIGHT SIDE CARRY): ${dualHandRolePrompt} Exact 8-angle camera-space coordinates: ${Object.values(perAngleScreenPrompt).join(' ')}`,
      perAngleScreenSide,
      perAngleScreenPrompt,
    };
  }

  const perAngleScreenSide: Record<Turnaround8AngleDeg, BagViewerScreenPlacement> = {
    0: 'screen-right',
    45: 'screen-right',
    90: 'far-occluded',
    135: 'screen-left',
    180: 'screen-left',
    225: 'screen-left',
    270: 'screen-left',
    315: 'screen-right',
  };
  const perAngleScreenPrompt: Record<Turnaround8AngleDeg, string> = {
    0: `0° Front: Bag MUST sit on VIEWER'S RIGHT (IMAGE-RIGHT ->), ${carryDesc}; wearer's free RIGHT arm/hand on IMAGE-LEFT MUST be 100% empty (NEVER place bag on IMAGE-LEFT at 0°!).`,
    45: `45° Front-Right (facing SCREEN-RIGHT ->): Bag MUST stay on FAR VIEWER'S RIGHT (IMAGE-RIGHT ->), ${carryDesc}; foreground RIGHT arm/hand on IMAGE-LEFT is 100% empty.`,
    90: `90° Right Side Profile (facing SCREEN-RIGHT ->): Foreground RIGHT shoulder/arm facing camera MUST be 100% empty (ZERO bag strap over right shoulder); bag stays behind torso on wearer's far LEFT side.`,
    135: `135° Back-Right Rear View: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; foreground RIGHT shoulder/arm on IMAGE-RIGHT is 100% empty.`,
    180: `180° Straight Back: Bag MUST sit on VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; RIGHT side on IMAGE-RIGHT is 100% empty.`,
    225: `225° Back-Left Rear View: Bag is PROMINENT in foreground on VIEWER'S LEFT (IMAGE-LEFT <-), ${carryDesc}; far RIGHT arm on IMAGE-RIGHT is 100% empty.`,
    270: `270° Left Side Profile (facing SCREEN-LEFT <-): Wearer's LEFT side faces camera so bag is CLEARLY VISIBLE in foreground, ${carryDesc}.`,
    315: `315° Front-Left (facing SCREEN-LEFT <-): Bag is PROMINENT in foreground on VIEWER'S RIGHT (IMAGE-RIGHT ->), ${carryDesc}; far RIGHT arm/hand on IMAGE-LEFT is 100% empty.`,
  };

  return {
    dominantHand: 'right',
    carrySide: 'left',
    freeSide: 'right',
    hasStrap: spec.hasStrap,
    bagCarryStyle: spec.bagCarryStyle,
    carryLabelKo: '왼팔 · 왼손 (오른손잡이)',
    carryLabelEn: 'Left arm / hand (Right-handed)',
    dualHandRolePrompt,
    slotPrompt: `carried EXCLUSIVELY on the model's ANATOMICAL LEFT side across ALL 8 angles (${carryDesc}). ${dualHandRolePrompt} STRICT IMAGE-SIDE COORDINATES: [0°=IMAGE-RIGHT -> | 45°=IMAGE-RIGHT -> | 90°=BEHIND TORSO | 135°=IMAGE-LEFT <- | 180°=IMAGE-LEFT <- | 225°=FOREGROUND IMAGE-LEFT <- | 270°=FOREGROUND VISIBLE | 315°=FOREGROUND IMAGE-RIGHT ->]`,
    crossAngleLockPrompt: `ANATOMICAL HANDEDNESS BAG-CARRY LOCK (RIGHT-HANDED WEARER -> LEFT SIDE CARRY): ${dualHandRolePrompt} Exact 8-angle camera-space coordinates: ${Object.values(perAngleScreenPrompt).join(' ')}`,
    perAngleScreenSide,
    perAngleScreenPrompt,
  };
}

export interface MasterAnchorLandmarks {
  crownYRatio: number;
  soleYRatio: number;
  statureRatio: number;
  coreCenterXRatio: number;
}

export interface MasterLandmarkAlignment {
  scale: number;
  dstW: number;
  dstH: number;
  dstX: number;
  dstY: number;
  targetSoleY: number;
  targetCrownY: number;
}

/**
 * Post-Normalization Layer:
 * Computes exact scale + (dstX, dstY) translation to lock any non-0° VTON slice (`45°..315°`)
 * onto the `0°` Master Anchor's exact silhouette crown Y, sole Y baseline, stature height,
 * and lower-ankle spine center X — eliminating scale jumps and floor baseline jitter on rotation.
 */
export function computeMasterLandmarkAlignment(params: {
  sourceWidth: number;
  sourceHeight: number;
  sliceCrownY: number;
  sliceSoleY: number;
  sliceCoreCx: number;
  sliceMinX: number;
  sliceMaxX: number;
  sliceMinY: number;
  canonicalW: number;
  canonicalH: number;
  masterLandmarks: MasterAnchorLandmarks;
}): MasterLandmarkAlignment {
  const {
    sourceWidth,
    sourceHeight,
    sliceCrownY,
    sliceSoleY,
    sliceCoreCx,
    sliceMinX,
    sliceMaxX,
    sliceMinY,
    canonicalW,
    canonicalH,
    masterLandmarks,
  } = params;
  const targetSoleY = canonicalH * Math.max(0.84, Math.min(0.98, masterLandmarks.soleYRatio));
  const targetStatureH = canonicalH * Math.max(0.55, Math.min(0.88, masterLandmarks.statureRatio));
  const targetCrownY = targetSoleY - targetStatureH;
  const targetCx = canonicalW * Math.max(0.38, Math.min(0.62, masterLandmarks.coreCenterXRatio));

  const rawStatureH = Math.max(16, sliceSoleY - sliceCrownY + 1);
  const rawFgH = Math.max(16, sliceSoleY - sliceMinY + 1);
  const rawFgW = Math.max(16, sliceMaxX - sliceMinX + 1);

  const desiredScale = targetStatureH / rawStatureH;
  const maxTopSafeScale = (targetSoleY - canonicalH * 0.015) / rawFgH;
  const maxWidthSafeScale = (canonicalW * 0.94) / rawFgW;
  const scale = Math.max(
    0.48,
    Math.min(1.85, Math.min(desiredScale, maxTopSafeScale, maxWidthSafeScale))
  );

  const dstW = Math.round(sourceWidth * scale);
  const dstH = Math.round(sourceHeight * scale);
  const rawDstX = targetCx - sliceCoreCx * scale;
  const minSafeDstX = 2 - sliceMinX * scale;
  const maxSafeDstX = canonicalW - 3 - sliceMaxX * scale;
  const dstX = Math.round(
    minSafeDstX <= maxSafeDstX
      ? Math.max(minSafeDstX, Math.min(maxSafeDstX, rawDstX))
      : targetCx - (sliceMinX + rawFgW * 0.5) * scale
  );
  const dstY = Math.round(targetSoleY - sliceSoleY * scale);

  return {
    scale,
    dstW,
    dstH,
    dstX,
    dstY,
    targetSoleY,
    targetCrownY,
  };
}

/**
 * Resolves backdrop aura radiance tier (`C` | `B` | `A` | `S`) from a tier string or backdrop ID.
 */
export function resolveStageAuraTier(rawTierOrId?: unknown): StageAuraTier {
  const token = String(rawTierOrId || '')
    .trim()
    .toUpperCase();
  if (token === 'S+' || token === 'S' || token.startsWith('S_')) return 'S';
  if (token === 'A+' || token === 'A' || token.startsWith('A_')) return 'A';
  if (token === 'B+' || token === 'B' || token.startsWith('B_')) return 'B';
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
  garmentCutoutHoleRatio?: number;
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
      garmentCutoutHoleRatio: 0,
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
      garmentCutoutHoleRatio: 0,
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

  // Garment Cutout Punch-Through Detector:
  // Detects transparent or Swiss-cheese eroded holes (`alpha <= 150`) punched INSIDE solid garment interiors:
  // 1) Central torso core (`0.25..0.44 * fgH` within `|x - coreCenterX| <= torsoHalfSpan * 0.30`), avoiding outer arm-waist gaps.
  // 2) Lower trouser/calf columns (`0.64..0.85 * fgH`): a standing silhouette has at most ONE central inter-leg cleft near
  //    `coreCenterX`. Any additional internal hole inside a left/right pant leg—or an off-center crater when `coreCenterX`
  //    itself is solid opaque—is flagged as `garmentCutoutHoleRatio`.
  const calfSpans: number[] = [];
  for (let y = cxY0; y <= cxY1; y += 1) {
    if (rowSpans[y] > 0) calfSpans.push(rowSpans[y]);
  }
  calfSpans.sort((a, b) => a - b);
  const medianCalfSpan =
    calfSpans.length > 0 ? calfSpans[Math.floor(calfSpans.length / 2)] : torsoHalfSpan;
  const calfHalfSpan = Math.max(6, Math.round(medianCalfSpan * 0.52));
  const torsoHoleY0 = Math.min(maxY, Math.round(minY + fgH * 0.25));
  const torsoHoleY1 = Math.max(torsoHoleY0, Math.round(minY + fgH * 0.44));
  const legHoleY0 = Math.min(maxY, Math.round(minY + fgH * 0.64));
  const legHoleY1 = Math.max(legHoleY0, Math.round(minY + fgH * 0.85));

  let garmentHolePixels = 0;
  let garmentScannedPixels = 0;

  // Scan 1: Central chest/stomach column
  const chestCoreLimit = Math.max(3, Math.round(torsoHalfSpan * 0.3));
  for (let y = torsoHoleY0; y <= torsoHoleY1; y += 1) {
    const rowOff = y * width;
    const x0 = Math.max(minX, Math.round(coreCenterX - chestCoreLimit));
    const x1 = Math.min(maxX, Math.round(coreCenterX + chestCoreLimit));
    let leftSolid = -1;
    let rightSolid = -1;
    for (let x = x0; x <= x1; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 180) {
        if (leftSolid === -1) leftSolid = x;
        rightSolid = x;
      }
    }
    if (leftSolid !== -1 && rightSolid - leftSolid >= 4) {
      for (let x = leftSolid + 1; x < rightSolid; x += 1) {
        garmentScannedPixels += 1;
        if (data[(rowOff + x) * 4 + 3] <= 150) {
          garmentHolePixels += 1;
        }
      }
    }
  }

  // Scan 2: Lower trouser / calf columns (below handbag/briefcase hang level)
  for (let y = legHoleY0; y <= legHoleY1; y += 1) {
    const rowOff = y * width;
    const lx0 = Math.max(minX, Math.round(coreCenterX - calfHalfSpan));
    const lx1 = Math.min(maxX, Math.round(coreCenterX + calfHalfSpan));
    let firstSolid = -1;
    let lastSolid = -1;
    for (let x = lx0; x <= lx1; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 140) {
        if (firstSolid === -1) firstSolid = x;
        lastSolid = x;
      }
    }
    if (firstSolid === -1 || lastSolid - firstSolid < 6) continue;
    garmentScannedPixels += lastSolid - firstSolid + 1;

    const gaps: Array<{ start: number; end: number; width: number; centerDist: number }> = [];
    let gx = firstSolid + 1;
    while (gx < lastSolid) {
      if (data[(rowOff + gx) * 4 + 3] <= 135) {
        const gStart = gx;
        while (gx < lastSolid && data[(rowOff + gx) * 4 + 3] <= 135) {
          gx += 1;
        }
        const gEnd = gx - 1;
        // Require >= 2px garment fabric wall (including Pass-4 ~161 feathered border) on both sides
        const hasLeftWall =
          gStart - 1 >= firstSolid &&
          data[(rowOff + gStart - 1) * 4 + 3] > 140 &&
          (gStart - 2 < lx0 || data[(rowOff + gStart - 2) * 4 + 3] > 140);
        const hasRightWall =
          gEnd + 1 <= lastSolid &&
          data[(rowOff + gEnd + 1) * 4 + 3] > 140 &&
          (gEnd + 2 > lx1 || data[(rowOff + gEnd + 2) * 4 + 3] > 140);
        if (hasLeftWall && hasRightWall) {
          const gCenter = (gStart + gEnd) * 0.5;
          gaps.push({
            start: gStart,
            end: gEnd,
            width: gEnd - gStart + 1,
            centerDist: Math.abs(gCenter - coreCenterX),
          });
        }
      } else {
        gx += 1;
      }
    }

    if (gaps.length >= 2) {
      // Allow at most 1 central inter-leg cleft (the gap closest to coreCenterX if within 0.30 * calfHalfSpan);
      // every other internal gap is punched through the left or right trouser leg!
      let cleftIdx = -1;
      let bestCleftDist = Infinity;
      for (let gi = 0; gi < gaps.length; gi += 1) {
        if (gaps[gi].centerDist <= calfHalfSpan * 0.3 && gaps[gi].centerDist < bestCleftDist) {
          bestCleftDist = gaps[gi].centerDist;
          cleftIdx = gi;
        }
      }
      for (let gi = 0; gi < gaps.length; gi += 1) {
        if (gi === cleftIdx) continue;
        garmentHolePixels += gaps[gi].width;
      }
    } else if (gaps.length === 1) {
      const onlyGap = gaps[0];
      const straddlesCenterAxis =
        onlyGap.start <= coreCenterX + 2 && onlyGap.end >= coreCenterX - 2;
      if (!straddlesCenterAxis && onlyGap.centerDist > Math.max(3.5, calfHalfSpan * 0.28)) {
        garmentHolePixels += onlyGap.width;
      }
    }
  }

  const garmentCutoutHoleRatio =
    garmentScannedPixels > 0 ? garmentHolePixels / garmentScannedPixels : 0;

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
    garmentCutoutHoleRatio,
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
  const frontGarmentHole = (front.garmentCutoutHoleRatio ?? 0) > 0.0045;

  const frontComplete =
    !front.clippedTop &&
    !front.clippedBottom &&
    !front.halfBody &&
    front.fgHeightRatio >= 0.48 &&
    front.interiorChromaRatio <= 0.045 &&
    !frontGarmentHole &&
    !frontSplitCoat &&
    !frontUmbrellaGap;

  if (!frontComplete) {
    failedAnglesSet.add(0);
    if (front.clippedTop) reasons.push('0:clipped_top');
    if (front.clippedBottom) reasons.push('0:clipped_bottom');
    if (front.halfBody) reasons.push('0:half_body');
    if (front.fgHeightRatio < 0.48) reasons.push('0:too_small');
    if (front.interiorChromaRatio > 0.045) reasons.push('0:interior_chroma_hole');
    if (frontGarmentHole) reasons.push('0:garment_cutout_hole');
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
    if (angle !== 0 && (m.garmentCutoutHoleRatio ?? 0) > 0.0045) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:garment_cutout_hole`);
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
