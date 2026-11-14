import {
  type GarmentRecord,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { normalizeViewerMode } from './vton2DService.ts';

export type AccessorySubSlotKey =
  | 'accessory'
  | 'acc_head'
  | 'acc_eyes'
  | 'acc_neck'
  | 'acc_hand_left'
  | 'acc_hand_right'
  | 'acc_wrist_left'
  | 'acc_wrist_right'
  | 'acc_umbrella'
  | 'acc_belt';

export type JewelrySubSlotKey =
  | 'jwl_ear_left'
  | 'jwl_ear_right'
  | 'jwl_neck'
  | 'jwl_wrist_left'
  | 'jwl_wrist_right'
  | 'jwl_ring_left'
  | 'jwl_ring_right'
  | 'jwl_brooch';

export type FittingSlotKey =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'onepiece'
  | 'shoes'
  | AccessorySubSlotKey
  | JewelrySubSlotKey;

export type FittingTabKey =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'onepiece'
  | 'shoes'
  | 'accessory'
  | 'jewelry';

export interface FittingSlotDefinition {
  key: FittingTabKey;
  label:
    | 'Outerwear'
    | 'Tops'
    | 'Bottoms'
    | 'One-piece'
    | 'Shoes'
    | 'Accessories'
    | 'Jewelry';
  labelKo:
    | '아우터'
    | '상의'
    | '하의'
    | '원피스·수영복'
    | '신발'
    | '액세서리'
    | '주얼리';
}

export interface SubSlotTreeDefinition<K extends FittingSlotKey = FittingSlotKey> {
  key: K;
  parentTab: 'accessory' | 'jewelry';
  branchKey: string;
  branchKo: string;
  branchEn: string;
  labelKo: string;
  shortKo: string;
  labelEn: string;
  shortEn: string;
  vtonPlacementPrompt: string;
}

export const FITTING_SLOTS: readonly FittingSlotDefinition[] = [
  { key: 'outer', label: 'Outerwear', labelKo: '아우터' },
  { key: 'top', label: 'Tops', labelKo: '상의' },
  { key: 'bottom', label: 'Bottoms', labelKo: '하의' },
  { key: 'onepiece', label: 'One-piece', labelKo: '원피스·수영복' },
  { key: 'shoes', label: 'Shoes', labelKo: '신발' },
  { key: 'accessory', label: 'Accessories', labelKo: '액세서리' },
  { key: 'jewelry', label: 'Jewelry', labelKo: '주얼리' },
] as const;

export const ACCESSORY_SUBTREE_SLOTS: readonly SubSlotTreeDefinition<AccessorySubSlotKey>[] = [
  {
    key: 'accessory',
    parentTab: 'accessory',
    branchKey: 'carry',
    branchKo: '휴대 · 허리',
    branchEn: 'Carry & Waist',
    labelKo: '가방 · 휴대',
    shortKo: '가방',
    labelEn: 'Bag / Carry',
    shortEn: 'Bag',
    vtonPlacementPrompt: 'carried naturally on shoulder or in hand as main bag/briefcase/tote',
  },
  {
    key: 'acc_umbrella',
    parentTab: 'accessory',
    branchKey: 'carry',
    branchKo: '휴대 · 허리',
    branchEn: 'Carry & Waist',
    labelKo: '우산 · 양산',
    shortKo: '우산',
    labelEn: 'Umbrella',
    shortEn: 'Umbrella',
    vtonPlacementPrompt:
      'held naturally by the model (open overhead canopy on rainy days or poised stylishly by handle)',
  },
  {
    key: 'acc_belt',
    parentTab: 'accessory',
    branchKey: 'carry',
    branchKo: '휴대 · 허리',
    branchEn: 'Carry & Waist',
    labelKo: '허리 · 벨트',
    shortKo: '벨트',
    labelEn: 'Waist Belt',
    shortEn: 'Belt',
    vtonPlacementPrompt: 'fastened cleanly around the waist belt loops with visible buckle hardware',
  },
  {
    key: 'acc_head',
    parentTab: 'accessory',
    branchKey: 'head_neck',
    branchKo: '머리 · 얼굴 · 목',
    branchEn: 'Head · Face · Neck',
    labelKo: '머리 · 모자',
    shortKo: '머리',
    labelEn: 'Headwear',
    shortEn: 'Head',
    vtonPlacementPrompt: 'worn naturally on top of the head fitting crown and hair volume',
  },
  {
    key: 'acc_eyes',
    parentTab: 'accessory',
    branchKey: 'head_neck',
    branchKo: '머리 · 얼굴 · 목',
    branchEn: 'Head · Face · Neck',
    labelKo: '얼굴 · 아이웨어',
    shortKo: '아이웨어',
    labelEn: 'Eyewear',
    shortEn: 'Eyes',
    vtonPlacementPrompt: 'worn cleanly across the nose bridge and ears as eyewear/glasses/sunglasses',
  },
  {
    key: 'acc_neck',
    parentTab: 'accessory',
    branchKey: 'head_neck',
    branchKo: '머리 · 얼굴 · 목',
    branchEn: 'Head · Face · Neck',
    labelKo: '목 · 머플러',
    shortKo: '목',
    labelEn: 'Neckwear',
    shortEn: 'Neck',
    vtonPlacementPrompt: 'draped/knotted naturally around the neck over collar line',
  },
  {
    key: 'acc_hand_left',
    parentTab: 'accessory',
    branchKey: 'hands_wrists',
    branchKo: '양손 · 양손목 (좌/우 개별)',
    branchEn: 'Hands & Wrists (L/R)',
    labelKo: '왼손 장갑',
    shortKo: '왼손 장갑',
    labelEn: 'Left Glove',
    shortEn: 'L-Glove',
    vtonPlacementPrompt:
      'worn EXCLUSIVELY on the model’s ANATOMICAL LEFT HAND (keep right hand bare unless right glove is also equipped)',
  },
  {
    key: 'acc_hand_right',
    parentTab: 'accessory',
    branchKey: 'hands_wrists',
    branchKo: '양손 · 양손목 (좌/우 개별)',
    branchEn: 'Hands & Wrists (L/R)',
    labelKo: '오른손 장갑',
    shortKo: '오른손 장갑',
    labelEn: 'Right Glove',
    shortEn: 'R-Glove',
    vtonPlacementPrompt:
      'worn EXCLUSIVELY on the model’s ANATOMICAL RIGHT HAND (may intentionally differ from left hand glove for asymmetric styling)',
  },
  {
    key: 'acc_wrist_left',
    parentTab: 'accessory',
    branchKey: 'hands_wrists',
    branchKo: '양손 · 양손목 (좌/우 개별)',
    branchEn: 'Hands & Wrists (L/R)',
    labelKo: '왼손목 시계',
    shortKo: '왼손목 시계',
    labelEn: 'Left Watch',
    shortEn: 'L-Watch',
    vtonPlacementPrompt: 'worn on the model’s ANATOMICAL LEFT WRIST with visible watch case and strap',
  },
  {
    key: 'acc_wrist_right',
    parentTab: 'accessory',
    branchKey: 'hands_wrists',
    branchKo: '양손 · 양손목 (좌/우 개별)',
    branchEn: 'Hands & Wrists (L/R)',
    labelKo: '오른손목 시계',
    shortKo: '오른손목 시계',
    labelEn: 'Right Watch',
    shortEn: 'R-Watch',
    vtonPlacementPrompt:
      'worn on the model’s ANATOMICAL RIGHT WRIST (allow dual-wrist asymmetric watch styling when left watch is also worn)',
  },
] as const;

export const JEWELRY_SUBTREE_SLOTS: readonly SubSlotTreeDefinition<JewelrySubSlotKey>[] = [
  {
    key: 'jwl_neck',
    parentTab: 'jewelry',
    branchKey: 'ear_neck',
    branchKo: '귀 · 목',
    branchEn: 'Ears & Neck',
    labelKo: '목걸이 · 펜던트',
    shortKo: '목걸이',
    labelEn: 'Necklace',
    shortEn: 'Necklace',
    vtonPlacementPrompt: 'worn gracefully around the collarbone / neckline as a necklace/pendant',
  },
  {
    key: 'jwl_ear_left',
    parentTab: 'jewelry',
    branchKey: 'ear_neck',
    branchKo: '귀 · 목',
    branchEn: 'Ears & Neck',
    labelKo: '왼쪽 귀걸이',
    shortKo: '왼쪽 귀',
    labelEn: 'Left Earring',
    shortEn: 'L-Ear',
    vtonPlacementPrompt: 'worn on the model’s ANATOMICAL LEFT EARLOBE/EAR',
  },
  {
    key: 'jwl_ear_right',
    parentTab: 'jewelry',
    branchKey: 'ear_neck',
    branchKo: '귀 · 목',
    branchEn: 'Ears & Neck',
    labelKo: '오른쪽 귀걸이',
    shortKo: '오른쪽 귀',
    labelEn: 'Right Earring',
    shortEn: 'R-Ear',
    vtonPlacementPrompt: 'worn on the model’s ANATOMICAL RIGHT EARLOBE/EAR',
  },
  {
    key: 'jwl_wrist_left',
    parentTab: 'jewelry',
    branchKey: 'wrist_ring',
    branchKo: '손목 · 손가락 (좌/우 개별)',
    branchEn: 'Wrists & Fingers (L/R)',
    labelKo: '왼손목 팔찌',
    shortKo: '왼팔찌',
    labelEn: 'Left Bracelet',
    shortEn: 'L-Bracelet',
    vtonPlacementPrompt: 'worn on the model’s ANATOMICAL LEFT WRIST as a bracelet/bangle',
  },
  {
    key: 'jwl_wrist_right',
    parentTab: 'jewelry',
    branchKey: 'wrist_ring',
    branchKo: '손목 · 손가락 (좌/우 개별)',
    branchEn: 'Wrists & Fingers (L/R)',
    labelKo: '오른손목 팔찌',
    shortKo: '오른팔찌',
    labelEn: 'Right Bracelet',
    shortEn: 'R-Bracelet',
    vtonPlacementPrompt: 'worn on the model’s ANATOMICAL RIGHT WRIST as a bracelet/bangle',
  },
  {
    key: 'jwl_ring_left',
    parentTab: 'jewelry',
    branchKey: 'wrist_ring',
    branchKo: '손목 · 손가락 (좌/우 개별)',
    branchEn: 'Wrists & Fingers (L/R)',
    labelKo: '왼손 반지',
    shortKo: '왼손 반지',
    labelEn: 'Left Ring',
    shortEn: 'L-Ring',
    vtonPlacementPrompt: 'worn on a finger of the model’s ANATOMICAL LEFT HAND',
  },
  {
    key: 'jwl_ring_right',
    parentTab: 'jewelry',
    branchKey: 'wrist_ring',
    branchKo: '손목 · 손가락 (좌/우 개별)',
    branchEn: 'Wrists & Fingers (L/R)',
    labelKo: '오른손 반지',
    shortKo: '오른손 반지',
    labelEn: 'Right Ring',
    shortEn: 'R-Ring',
    vtonPlacementPrompt: 'worn on a finger of the model’s ANATOMICAL RIGHT HAND',
  },
  {
    key: 'jwl_brooch',
    parentTab: 'jewelry',
    branchKey: 'accent',
    branchKo: '브로치 · 라펠 포인트',
    branchEn: 'Lapel & Accent',
    labelKo: '브로치 · 코사지',
    shortKo: '브로치',
    labelEn: 'Brooch / Pin',
    shortEn: 'Brooch',
    vtonPlacementPrompt: 'pinned cleanly to the upper-left chest lapel/collar area as a brooch/corsage',
  },
] as const;

export const ALL_EQUIPPABLE_SLOT_KEYS: readonly FittingSlotKey[] = [
  'outer',
  'top',
  'bottom',
  'onepiece',
  'shoes',
  ...ACCESSORY_SUBTREE_SLOTS.map((s) => s.key),
  ...JEWELRY_SUBTREE_SLOTS.map((s) => s.key),
] as const;

const ACCESSORY_SLOT_SET = new Set<string>(ACCESSORY_SUBTREE_SLOTS.map((s) => s.key));
const JEWELRY_SLOT_SET = new Set<string>(JEWELRY_SUBTREE_SLOTS.map((s) => s.key));

export const SUB_SLOT_META_BY_KEY: Readonly<Record<string, SubSlotTreeDefinition>> = Object.freeze(
  Object.fromEntries(
    [...ACCESSORY_SUBTREE_SLOTS, ...JEWELRY_SUBTREE_SLOTS].map((item) => [item.key, item])
  )
);

export function isAccessorySlotKey(slotKey?: string | null): slotKey is AccessorySubSlotKey {
  return Boolean(slotKey && ACCESSORY_SLOT_SET.has(slotKey));
}

export function isJewelrySlotKey(slotKey?: string | null): slotKey is JewelrySubSlotKey {
  return Boolean(slotKey && JEWELRY_SLOT_SET.has(slotKey));
}

export function resolveParentFittingTab(slotKey?: string | null): FittingTabKey {
  const key = String(slotKey || '').trim();
  if (key === 'jewelry' || JEWELRY_SLOT_SET.has(key)) return 'jewelry';
  if (key === 'accessory' || ACCESSORY_SLOT_SET.has(key)) return 'accessory';
  if (key === 'outer' || key === 'top' || key === 'bottom' || key === 'onepiece' || key === 'shoes') {
    return key;
  }
  return 'top';
}

export type FittingSlotAssignments = Partial<Record<FittingSlotKey, GarmentRecord | null>>;

export interface Studio25DLayer {
  slotKey: FittingSlotKey;
  slotLabel: string;
  garment: GarmentRecord;
  /** Center X percentage (0..100) on the 2.5D studio canvas */
  xPct: number;
  /** Center Y percentage (0..100) on the 2.5D studio canvas */
  yPct: number;
  /** Width percentage relative to studio stage */
  widthPct: number;
  zIndex: number;
  rotationDeg: number;
  parallaxDepth: number;
  shadowBlurPx: number;
  shadowOffsetY: number;
}

export interface FittingRenderRequest {
  slots: FittingSlotAssignments;
  theme?: 'light' | 'dark';
  personReferenceUrl?: string;
  legacyMode?: unknown;
}

export interface FittingRenderResult {
  mode: '2d-vton' | '2.5d-studio' | 'ai-vton';
  rendererId: string;
  layers: Studio25DLayer[];
  compositeImageUrl: string | null;
  lighting: {
    backdropGradient: string;
    keyLightGlow: string;
    floorShadowColor: string;
  };
  vtonReady: boolean;
}

export interface FittingRenderer {
  readonly id: string;
  readonly mode: '2d-vton' | '2.5d-studio' | 'ai-vton';
  render(request: FittingRenderRequest): Promise<FittingRenderResult>;
}

const SWIMWEAR_SUBCATEGORIES = new Set([
  'swimsuit',
  'bikini',
  'rashguard',
  'swim_trunks',
]);

const SWIMWEAR_NAME_RE = /수영복|비키니|래시가드|스윔|swimsuit|bikini|rashguard|swimwear|swim[\s_-]*trunks?/i;

const INTIMATE_NON_WEARABLE_SUBCATEGORIES = new Set([
  'underwear',
  'inner_top',
  'socks',
  'crew_socks',
  'ankle_socks',
]);

const ONEPIECE_CATEGORIES = new Set(['dress', 'onepiece', 'swimwear']);

const ONEPIECE_SUBCATEGORIES = new Set([
  'dress',
  'onepiece',
  'jumpsuit',
  'swimsuit',
  'bikini',
  'rashguard',
  'swim_trunks',
]);

const ONEPIECE_NAME_RE = /원피스|점프수트|수영복|비키니|래시가드/i;

const JEWELRY_SUBCATEGORIES = new Set([
  'earring',
  'necklace',
  'bracelet',
  'ring',
  'brooch',
  'jewelry',
]);

const JEWELRY_NAME_RE =
  /귀걸이|이어링|이어커프|목걸이|펜던트|팔찌|뱅글|브레이슬릿|반지|시그넷\s*링|브로치|코사지|부토니에|라펠\s*핀|earring|ear\s*cuff|necklace|pendant|bracelet|bangle|signet\s*ring|brooch|corsage/i;

export function isSwimwearGarment(garment?: Partial<GarmentRecord> | null): boolean {
  if (!garment) return false;
  const cat = String(garment.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();
  const name = String(garment.name || '');
  return (
    cat === 'swimwear' ||
    SWIMWEAR_SUBCATEGORIES.has(sub) ||
    SWIMWEAR_NAME_RE.test(name)
  );
}

export function isUmbrellaGarment(garment?: Partial<GarmentRecord> | null): boolean {
  if (!garment) return false;
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();
  const name = String(garment.name || '');
  return sub === 'umbrella' || /우산|양산|umbrella|parasol/i.test(name);
}

export function isJewelryGarment(garment?: Partial<GarmentRecord> | null): boolean {
  if (!garment) return false;
  const cat = String(garment.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();
  const name = String(garment.name || '');
  if (cat === 'jewelry' || JEWELRY_SUBCATEGORIES.has(sub)) return true;
  // Avoid misclassifying cotton/wool scarves or clothing with '링' in '스프링/볼링/스트링'
  if (cat === 'outer' || cat === 'top' || cat === 'bottom' || cat === 'shoes' || cat === 'dress') {
    return false;
  }
  return JEWELRY_NAME_RE.test(name);
}

/**
 * Returns `false` ONLY for non-outer intimate underwear/socks unless the item is swimwear.
 * Permanently prevents underwear/socks from polluting the `Accessories` or other studio slots.
 */
export function isWearableStudioGarment(garment?: Partial<GarmentRecord> | null): boolean {
  if (!garment) return false;
  if (isSwimwearGarment(garment)) return true;

  const cat = String(garment.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();

  if (
    cat === 'underwear' ||
    cat === 'socks' ||
    INTIMATE_NON_WEARABLE_SUBCATEGORIES.has(sub)
  ) {
    return false;
  }

  return true;
}

/**
 * Classifies an accessory or jewelry item into its canonical sub-part family:
 * `'bag' | 'umbrella' | 'belt' | 'headwear' | 'eyewear' | 'neckwear' | 'gloves' | 'watch' | 'earring' | 'necklace' | 'bracelet' | 'ring' | 'brooch'`
 */
export function classifyAccessoryOrJewelryPart(
  garment?: Partial<GarmentRecord> | null
): string | null {
  if (!garment) return null;
  const cat = String(garment.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();
  const name = String(garment.name || '');

  if (isJewelryGarment(garment)) {
    if (sub === 'earring' || /귀걸이|이어링|이어커프|earring|ear\s*cuff/i.test(name)) {
      return 'earring';
    }
    if (sub === 'necklace' || /목걸이|펜던트|초커|necklace|pendant|choker/i.test(name)) {
      return 'necklace';
    }
    if (sub === 'bracelet' || /팔찌|뱅글|브레이슬릿|커프|bracelet|bangle|cuff/i.test(name)) {
      return 'bracelet';
    }
    if (sub === 'ring' || /반지|시그넷|인장\s*반지|ring/i.test(name)) {
      return 'ring';
    }
    if (sub === 'brooch' || /브로치|코사지|부토니에|라펠\s*핀|brooch|corsage|boutonniere|lapel/i.test(name)) {
      return 'brooch';
    }
    return 'necklace';
  }

  if (isUmbrellaGarment(garment)) return 'umbrella';
  if (
    cat === 'gloves' ||
    sub === 'gloves' ||
    sub === 'leather_gloves' ||
    sub === 'knit_gloves' ||
    /장갑|글러브|벙어리|glove|mitten/i.test(name)
  ) {
    return 'gloves';
  }
  if (sub === 'watch' || /시계|워치|크로노|watch/i.test(name)) {
    return 'watch';
  }
  if (
    cat === 'headwear' ||
    ['headwear', 'beanie', 'cap', 'beret', 'bucket_hat', 'hat'].includes(sub) ||
    /비니|볼캡|모자|베레모|버킷햇|선햇|페도라|선바이저|beanie|beret|bucket\s*hat|cap/i.test(name)
  ) {
    return 'headwear';
  }
  if (
    ['eyewear', 'sunglasses', 'glasses'].includes(sub) ||
    /선글라스|안경|아이웨어|틴트|보잉|sunglasses|glasses|eyewear/i.test(name)
  ) {
    return 'eyewear';
  }
  if (
    cat === 'neckwear' ||
    ['neckwear', 'scarf', 'muffler', 'necktie'].includes(sub) ||
    /머플러|스카프|넥타이|볼로\s*타이|반다나|목도리|넥워머|scarf|muffler|necktie|bolo/i.test(name)
  ) {
    return 'neckwear';
  }
  if (sub === 'belt' || /벨트|belt/i.test(name)) {
    return 'belt';
  }
  if (
    cat === 'bag' ||
    ['bag', 'tote', 'briefcase', 'backpack'].includes(sub) ||
    /가방|토트|브리프|크로스백|숄더백|백팩|클러치|파우치|서류가방|bag|tote|briefcase/i.test(name)
  ) {
    return 'bag';
  }
  if (cat === 'accessory' || cat === 'accessories') {
    return 'bag';
  }
  return null;
}

/**
 * Top-level slot resolver (preserves backward compatibility for core tabs while routing Jewelry to `'jwl_neck'`).
 */
export function mapGarmentToFittingSlot(garment?: Partial<GarmentRecord> | null): FittingTabKey {
  if (!garment) return 'top';

  const cat = String(garment.category || '')
    .trim()
    .toLowerCase();
  const sub = String(garment.subcategory || '')
    .trim()
    .toLowerCase();
  const name = String(garment.name || '');

  if (
    ONEPIECE_CATEGORIES.has(cat) ||
    ONEPIECE_SUBCATEGORIES.has(sub) ||
    ONEPIECE_NAME_RE.test(name)
  ) {
    return 'onepiece';
  }

  if (isJewelryGarment(garment)) {
    return 'jewelry';
  }

  if (cat === 'outer' || cat === 'outerwear') {
    return 'outer';
  }
  if (cat === 'top' || cat === 'tops') {
    return 'top';
  }
  if (cat === 'bottom' || cat === 'bottoms') {
    return 'bottom';
  }
  if (cat === 'shoes' || cat === 'footwear') {
    return 'shoes';
  }
  if (
    cat === 'accessory' ||
    cat === 'accessories' ||
    cat === 'headwear' ||
    cat === 'neckwear' ||
    cat === 'gloves' ||
    cat === 'bag'
  ) {
    return 'accessory';
  }

  return normalizeWardrobeCategoryKey(garment.category);
}

/**
 * Maps any garment to its natural default equippable leaf slot (`FittingSlotKey`).
 * For symmetric/asymmetric left-right slots, defaults to the left slot (and callers can place a 2nd item in right!).
 */
export function mapGarmentToDefaultSubSlot(
  garment?: Partial<GarmentRecord> | null
): FittingSlotKey {
  const topTab = mapGarmentToFittingSlot(garment);
  if (topTab !== 'accessory' && topTab !== 'jewelry') {
    return topTab;
  }

  const part = classifyAccessoryOrJewelryPart(garment);
  switch (part) {
    case 'umbrella':
      return 'acc_umbrella';
    case 'belt':
      return 'acc_belt';
    case 'headwear':
      return 'acc_head';
    case 'eyewear':
      return 'acc_eyes';
    case 'neckwear':
      return 'acc_neck';
    case 'gloves':
      return 'acc_hand_left';
    case 'watch':
      return 'acc_wrist_left';
    case 'earring':
      return 'jwl_ear_left';
    case 'necklace':
      return 'jwl_neck';
    case 'bracelet':
      return 'jwl_wrist_left';
    case 'ring':
      return 'jwl_ring_left';
    case 'brooch':
      return 'jwl_brooch';
    case 'bag':
    default:
      return topTab === 'jewelry' ? 'jwl_neck' : 'accessory';
  }
}

/**
 * Returns the paired opposite-side slot key for left/right asymmetric body-part slots, or `null`.
 */
export function getOppositeSideSubSlot(slotKey: FittingSlotKey): FittingSlotKey | null {
  switch (slotKey) {
    case 'acc_hand_left':
      return 'acc_hand_right';
    case 'acc_hand_right':
      return 'acc_hand_left';
    case 'acc_wrist_left':
      return 'acc_wrist_right';
    case 'acc_wrist_right':
      return 'acc_wrist_left';
    case 'jwl_ear_left':
      return 'jwl_ear_right';
    case 'jwl_ear_right':
      return 'jwl_ear_left';
    case 'jwl_wrist_left':
      return 'jwl_wrist_right';
    case 'jwl_wrist_right':
      return 'jwl_wrist_left';
    case 'jwl_ring_left':
      return 'jwl_ring_right';
    case 'jwl_ring_right':
      return 'jwl_ring_left';
    default:
      return null;
  }
}

/**
 * Determines whether a garment can be equipped into `targetSlotKey`.
 * Crucial: Left & Right Gloves share all `gloves` items; Left & Right Watches share all `watch` items;
 * Left & Right Earrings share all `earring` items; Left & Right Bracelets share all `bracelet` items;
 * Left & Right Rings share all `ring` items!
 */
export function doesGarmentMatchSubSlot(
  garment: Partial<GarmentRecord> | null | undefined,
  targetSlotKey: FittingSlotKey
): boolean {
  if (!garment || !isWearableStudioGarment(garment)) return false;

  if (
    targetSlotKey === 'outer' ||
    targetSlotKey === 'top' ||
    targetSlotKey === 'bottom' ||
    targetSlotKey === 'onepiece' ||
    targetSlotKey === 'shoes'
  ) {
    return mapGarmentToFittingSlot(garment) === targetSlotKey;
  }

  const part = classifyAccessoryOrJewelryPart(garment);
  switch (targetSlotKey) {
    case 'accessory':
      return part === 'bag';
    case 'acc_umbrella':
      return part === 'umbrella';
    case 'acc_belt':
      return part === 'belt';
    case 'acc_head':
      return part === 'headwear';
    case 'acc_eyes':
      return part === 'eyewear';
    case 'acc_neck':
      return part === 'neckwear';
    case 'acc_hand_left':
    case 'acc_hand_right':
      return part === 'gloves';
    case 'acc_wrist_left':
    case 'acc_wrist_right':
      return part === 'watch';
    case 'jwl_ear_left':
    case 'jwl_ear_right':
      return part === 'earring';
    case 'jwl_neck':
      return part === 'necklace';
    case 'jwl_wrist_left':
    case 'jwl_wrist_right':
      return part === 'bracelet';
    case 'jwl_ring_left':
    case 'jwl_ring_right':
      return part === 'ring';
    case 'jwl_brooch':
      return part === 'brooch';
    default:
      return false;
  }
}

const SUBSLOT_STAGE_COORDS: Readonly<
  Record<
    string,
    { label: string; xPct: number; yPct: number; widthPct: number; zIndex: number; rot?: number }
  >
> = {
  accessory: { label: 'Bag / Carry', xPct: 76.5, yPct: 55.5, widthPct: 19.5, zIndex: 60 },
  acc_umbrella: { label: 'Umbrella', xPct: 82.0, yPct: 44.0, widthPct: 21.0, zIndex: 61 },
  acc_belt: { label: 'Belt', xPct: 50.0, yPct: 48.0, widthPct: 18.0, zIndex: 58 },
  acc_head: { label: 'Headwear', xPct: 50.0, yPct: 7.5, widthPct: 15.0, zIndex: 62 },
  acc_eyes: { label: 'Eyewear', xPct: 50.0, yPct: 14.5, widthPct: 14.0, zIndex: 63 },
  acc_neck: { label: 'Neckwear', xPct: 58.0, yPct: 24.5, widthPct: 16.5, zIndex: 64, rot: 2 },
  acc_hand_left: { label: 'Left Glove', xPct: 26.0, yPct: 52.0, widthPct: 14.0, zIndex: 65 },
  acc_hand_right: { label: 'Right Glove', xPct: 74.0, yPct: 52.0, widthPct: 14.0, zIndex: 66 },
  acc_wrist_left: { label: 'Left Watch', xPct: 24.0, yPct: 44.0, widthPct: 12.5, zIndex: 67 },
  acc_wrist_right: { label: 'Right Watch', xPct: 76.0, yPct: 44.0, widthPct: 12.5, zIndex: 68 },
  jwl_ear_left: { label: 'Left Earring', xPct: 38.0, yPct: 15.5, widthPct: 11.0, zIndex: 70 },
  jwl_ear_right: { label: 'Right Earring', xPct: 62.0, yPct: 15.5, widthPct: 11.0, zIndex: 71 },
  jwl_neck: { label: 'Necklace', xPct: 50.0, yPct: 23.0, widthPct: 14.0, zIndex: 72 },
  jwl_wrist_left: { label: 'Left Bracelet', xPct: 24.0, yPct: 48.0, widthPct: 12.0, zIndex: 73 },
  jwl_wrist_right: { label: 'Right Bracelet', xPct: 76.0, yPct: 48.0, widthPct: 12.0, zIndex: 74 },
  jwl_ring_left: { label: 'Left Ring', xPct: 26.0, yPct: 57.0, widthPct: 10.5, zIndex: 75 },
  jwl_ring_right: { label: 'Right Ring', xPct: 74.0, yPct: 57.0, widthPct: 10.5, zIndex: 76 },
  jwl_brooch: { label: 'Brooch', xPct: 43.0, yPct: 28.0, widthPct: 11.5, zIndex: 77 },
};

/**
 * Default Studio Canvas Fitting Renderer:
 * Supports simultaneous multi-part Accessories & Jewelry sub-tree slots alongside core clothing.
 */
export class Studio25DFittingRenderer implements FittingRenderer {
  readonly id = 'studio-25d-renderer-v3';
  readonly mode = '2d-vton' as const;

  async render(request: FittingRenderRequest): Promise<FittingRenderResult> {
    const resolvedMode = normalizeViewerMode(request.legacyMode);
    const slots = request.slots || {};
    const hasOuter = Boolean(slots.outer);

    const layers: Studio25DLayer[] = [];

    if (slots.onepiece) {
      const swim = isSwimwearGarment(slots.onepiece);
      layers.push({
        slotKey: 'onepiece',
        slotLabel: 'One-piece',
        garment: slots.onepiece,
        xPct: 50,
        yPct: swim ? 40.5 : 44.5,
        widthPct: swim ? 40.0 : 47.0,
        zIndex: swim ? 28 : 40,
        rotationDeg: 0,
        parallaxDepth: swim ? 0.56 : 0.72,
        shadowBlurPx: 20,
        shadowOffsetY: 11,
      });
    }

    if (slots.top) {
      const tCat = String(slots.top.category || '').toLowerCase();
      const tSub = String(slots.top.subcategory || '').toLowerCase();
      const isDress =
        tCat === 'dress' || tCat === 'onepiece' || tSub === 'dress' || tSub === 'onepiece';

      layers.push({
        slotKey: 'top',
        slotLabel: 'Tops',
        garment: slots.top,
        xPct: 50,
        yPct: isDress ? 44.5 : hasOuter ? 28.4 : 30.8,
        widthPct: isDress ? 47 : hasOuter ? 30.5 : 46.0,
        zIndex: 32,
        rotationDeg: 0,
        parallaxDepth: 0.68,
        shadowBlurPx: 20,
        shadowOffsetY: 11,
      });
    }

    if (slots.bottom) {
      const bSub = String(slots.bottom.subcategory || '').toLowerCase();
      const bName = String(slots.bottom.name || '');
      const isSkirtOrShorts =
        bSub === 'skirt' ||
        bSub === 'shorts' ||
        /스커트|치마|쇼츠|반바지/.test(bName);

      layers.push({
        slotKey: 'bottom',
        slotLabel: 'Bottoms',
        garment: slots.bottom,
        xPct: 50,
        yPct: isSkirtOrShorts ? 50.0 : 56.5,
        widthPct: isSkirtOrShorts ? 38 : 48,
        zIndex: 36,
        rotationDeg: 0,
        parallaxDepth: 0.5,
        shadowBlurPx: 18,
        shadowOffsetY: 10,
      });
    }

    if (slots.shoes) {
      layers.push({
        slotKey: 'shoes',
        slotLabel: 'Shoes',
        garment: slots.shoes,
        xPct: 50,
        yPct: 79.0,
        widthPct: 21.5,
        zIndex: 38,
        rotationDeg: 0,
        parallaxDepth: 0.42,
        shadowBlurPx: 16,
        shadowOffsetY: 8,
      });
    }

    if (slots.outer) {
      layers.push({
        slotKey: 'outer',
        slotLabel: 'Outerwear',
        garment: slots.outer,
        xPct: 50,
        yPct: 30.0,
        widthPct: 48.5,
        zIndex: 50,
        rotationDeg: 0,
        parallaxDepth: 0.85,
        shadowBlurPx: 24,
        shadowOffsetY: 13,
      });
    }

    for (const subDef of [...ACCESSORY_SUBTREE_SLOTS, ...JEWELRY_SUBTREE_SLOTS]) {
      const item = slots[subDef.key];
      if (!item) continue;
      const coord = SUBSLOT_STAGE_COORDS[subDef.key] || SUBSLOT_STAGE_COORDS.accessory;
      layers.push({
        slotKey: subDef.key,
        slotLabel: coord.label,
        garment: item,
        xPct: coord.xPct,
        yPct: coord.yPct,
        widthPct: coord.widthPct,
        zIndex: coord.zIndex,
        rotationDeg: coord.rot || 0,
        parallaxDepth: 0.95,
        shadowBlurPx: 18,
        shadowOffsetY: 10,
      });
    }

    layers.sort((a, b) => a.zIndex - b.zIndex);

    return {
      mode: resolvedMode,
      rendererId: this.id,
      layers,
      compositeImageUrl: null,
      lighting: {
        backdropGradient: 'var(--squircle-illumination, var(--bg-surface))',
        keyLightGlow: 'var(--garment-studio-glow, none)',
        floorShadowColor: 'var(--garment-floor-shadow, rgba(15, 23, 42, 0.12))',
      },
      vtonReady: Boolean(import.meta.env?.VITE_VTON_API_URL),
    };
  }
}

export class VtonApiFittingRenderer implements FittingRenderer {
  readonly id = 'vton-api-renderer-v1';
  readonly mode = 'ai-vton' as const;
  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly studioFallback = new Studio25DFittingRenderer();

  constructor(endpointUrl: string, apiKey = '') {
    this.endpointUrl = endpointUrl;
    this.apiKey = apiKey;
  }

  async render(request: FittingRenderRequest): Promise<FittingRenderResult> {
    const baseResult = await this.studioFallback.render(request);
    if (!this.endpointUrl || baseResult.layers.length === 0) {
      return baseResult;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const serializedSlots = Object.fromEntries(
        Object.entries(request.slots)
          .filter(([, item]) => Boolean(item))
          .map(([slot, item]) => [
            slot,
            {
              id: item!.id,
              name: item!.name,
              category: item!.category,
              image_url: item!.image_url,
              color_hex: item!.color_hex,
            },
          ])
      );

      const res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slots: serializedSlots,
          personReferenceUrl: request.personReferenceUrl || null,
          theme: request.theme || 'light',
        }),
      });

      if (!res.ok) {
        throw new Error(`VTON API failed (${res.status})`);
      }

      const data = (await res.json()) as { compositeImageUrl?: string; imageUrl?: string };
      const compositeUrl = data.compositeImageUrl || data.imageUrl || null;
      if (!compositeUrl) {
        return baseResult;
      }

      return {
        ...baseResult,
        mode: 'ai-vton',
        rendererId: this.id,
        compositeImageUrl: compositeUrl,
        vtonReady: true,
      };
    } catch {
      return baseResult;
    }
  }
}

const vtonEndpoint = String(import.meta.env?.VITE_VTON_API_URL || '').trim();
const vtonApiKey = String(import.meta.env?.VITE_VTON_API_KEY || '').trim();

let activeFittingRenderer: FittingRenderer = vtonEndpoint
  ? new VtonApiFittingRenderer(vtonEndpoint, vtonApiKey)
  : new Studio25DFittingRenderer();

export function registerFittingRenderer(renderer: FittingRenderer): void {
  activeFittingRenderer = renderer;
}

export function getActiveFittingRenderer(): FittingRenderer {
  return activeFittingRenderer;
}

export function renderOutfitFitting(request: FittingRenderRequest): Promise<FittingRenderResult> {
  return activeFittingRenderer.render(request);
}
