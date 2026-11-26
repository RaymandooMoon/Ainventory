export type WashMethod =
  | 'dry_clean_only'
  | 'hand_wash'
  | 'wool_delicate'
  | 'machine_normal'
  | 'spot_clean';

export type TumbleDryPolicy = 'allowed' | 'low_heat' | 'no_tumble_flat' | 'no_tumble_hang';
export type BleachPolicy = 'allowed' | 'oxygen_only' | 'no_bleach';
export type IronPolicy = 'allowed' | 'low_cloth' | 'no_iron';
export type ColorBleedRisk = 'high' | 'medium' | 'low';
export type ColorGroup = 'white_light' | 'dark_vivid' | 'denim_indigo';
export type CareProfileSource = 'care_label_scan' | 'user_edited' | 'inferred';
export type CareMapServiceType = 'dry_clean' | 'laundry' | 'alteration' | 'leather_care';

export interface GarmentCareProfile {
  washMethod: WashMethod;
  waterTempC: 0 | 30 | 40 | 60;
  tumbleDry: TumbleDryPolicy;
  bleach: BleachPolicy;
  iron: IronPolicy;
  colorBleedRisk: ColorBleedRisk;
  colorGroup: ColorGroup;
  needsLaundryNet: boolean;
  source: CareProfileSource;
  careLabelImageUrl?: string | null;
  note?: string;
}

export type LaundryBucketKey =
  | 'dry_clean'
  | 'wool_hand'
  | 'light_normal'
  | 'dark_normal'
  | 'spot_clean';

export interface LaundryBucketItem {
  garment: Record<string, any>;
  care: GarmentCareProfile;
}

export interface LaundryBucket {
  key: LaundryBucketKey;
  titleKo: string;
  titleEn: string;
  settingsKo: string;
  settingsEn: string;
  items: LaundryBucketItem[];
  recommendedMapService?: CareMapServiceType;
}

export interface LaundryConflictWarning {
  id: string;
  severity: 'critical' | 'warning';
  code:
    | 'dry_clean_mixed'
    | 'wool_shrink_risk'
    | 'color_bleed_risk'
    | 'no_tumble_dry'
    | 'spot_clean_only'
    | 'laundry_net_required';
  titleKo: string;
  titleEn: string;
  detailKo: string;
  detailEn: string;
  affectedGarmentIds: number[];
}

export interface LaundrySortingPlan {
  totalCount: number;
  buckets: LaundryBucket[];
  conflicts: LaundryConflictWarning[];
  canWashTogether: boolean;
  headlineKo: string;
  headlineEn: string;
}

const VALID_WASH_METHODS = new Set<WashMethod>([
  'dry_clean_only',
  'hand_wash',
  'wool_delicate',
  'machine_normal',
  'spot_clean',
]);
const VALID_TUMBLE = new Set<TumbleDryPolicy>([
  'allowed',
  'low_heat',
  'no_tumble_flat',
  'no_tumble_hang',
]);
const VALID_BLEACH = new Set<BleachPolicy>(['allowed', 'oxygen_only', 'no_bleach']);
const VALID_IRON = new Set<IronPolicy>(['allowed', 'low_cloth', 'no_iron']);
const VALID_BLEED = new Set<ColorBleedRisk>(['high', 'medium', 'low']);
const VALID_COLOR_GROUP = new Set<ColorGroup>(['white_light', 'dark_vivid', 'denim_indigo']);

function parseHexLuminance(hex?: string | null): number | null {
  const clean = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function inferColorGroupAndBleed(garment: Record<string, any>): {
  colorGroup: ColorGroup;
  colorBleedRisk: ColorBleedRisk;
} {
  const blob = [
    garment?.fabric,
    garment?.material_composition,
    garment?.subcategory,
    garment?.name,
    garment?.name_en,
    garment?.color_name,
    garment?.care_tip,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/denim|jean|indigo|데님|청바지|생지|인디고/.test(blob)) {
    return { colorGroup: 'denim_indigo', colorBleedRisk: 'high' };
  }

  if (
    /white|ivory|cream|ecru|beige|oatmeal|pastel|sky|mint|화이트|아이보리|크림|베이지|오트밀|연회색|라이트/.test(
      blob
    )
  ) {
    return { colorGroup: 'white_light', colorBleedRisk: 'low' };
  }

  if (/red|burgundy|wine|crimson|navy|black|charcoal|forest|레드|버건디|와인|네이비|블랙|차콜|다크/.test(blob)) {
    const isVividDye = /red|burgundy|wine|crimson|indigo|레드|버건디|와인|이염/.test(blob);
    return {
      colorGroup: 'dark_vivid',
      colorBleedRisk: isVividDye ? 'high' : 'medium',
    };
  }

  const lum = parseHexLuminance(garment?.color_hex);
  if (lum !== null) {
    if (lum >= 185) return { colorGroup: 'white_light', colorBleedRisk: 'low' };
    if (lum <= 95) return { colorGroup: 'dark_vivid', colorBleedRisk: 'medium' };
  }
  return { colorGroup: 'dark_vivid', colorBleedRisk: 'medium' };
}

function normalizeTemp(raw: unknown, fallback: 0 | 30 | 40 | 60): 0 | 30 | 40 | 60 {
  const n = Number(raw);
  if (n === 0 || n === 30 || n === 40 || n === 60) return n;
  if (Number.isFinite(n)) {
    if (n <= 0) return 0;
    if (n <= 32) return 30;
    if (n <= 45) return 40;
    return 60;
  }
  return fallback;
}

export function sanitizeGarmentCareProfile(
  raw: Record<string, any> | null | undefined,
  fallback: GarmentCareProfile
): GarmentCareProfile {
  if (!raw || typeof raw !== 'object') return fallback;
  const washMethodRaw = String(raw.washMethod || raw.wash_method || '').trim() as WashMethod;
  const tumbleRaw = String(raw.tumbleDry || raw.tumble_dry || '').trim() as TumbleDryPolicy;
  const bleachRaw = String(raw.bleach || '').trim() as BleachPolicy;
  const ironRaw = String(raw.iron || '').trim() as IronPolicy;
  const bleedRaw = String(raw.colorBleedRisk || raw.color_bleed_risk || '').trim() as ColorBleedRisk;
  const groupRaw = String(raw.colorGroup || raw.color_group || '').trim() as ColorGroup;
  const sourceRaw = String(raw.source || '').trim() as CareProfileSource;

  const washMethod = VALID_WASH_METHODS.has(washMethodRaw) ? washMethodRaw : fallback.washMethod;
  const defaultTemp: 0 | 30 | 40 | 60 =
    washMethod === 'dry_clean_only' || washMethod === 'spot_clean'
      ? 0
      : washMethod === 'wool_delicate' || washMethod === 'hand_wash'
        ? 30
        : fallback.waterTempC;

  return {
    washMethod,
    waterTempC: normalizeTemp(raw.waterTempC ?? raw.water_temp_c, defaultTemp),
    tumbleDry: VALID_TUMBLE.has(tumbleRaw) ? tumbleRaw : fallback.tumbleDry,
    bleach: VALID_BLEACH.has(bleachRaw) ? bleachRaw : fallback.bleach,
    iron: VALID_IRON.has(ironRaw) ? ironRaw : fallback.iron,
    colorBleedRisk: VALID_BLEED.has(bleedRaw) ? bleedRaw : fallback.colorBleedRisk,
    colorGroup: VALID_COLOR_GROUP.has(groupRaw) ? groupRaw : fallback.colorGroup,
    needsLaundryNet:
      typeof raw.needsLaundryNet === 'boolean'
        ? raw.needsLaundryNet
        : typeof raw.needs_laundry_net === 'boolean'
          ? raw.needs_laundry_net
          : fallback.needsLaundryNet,
    source:
      sourceRaw === 'care_label_scan' || sourceRaw === 'user_edited' || sourceRaw === 'inferred'
        ? sourceRaw
        : fallback.source,
    careLabelImageUrl:
      typeof raw.careLabelImageUrl === 'string'
        ? raw.careLabelImageUrl
        : typeof raw.care_label_image_url === 'string'
          ? raw.care_label_image_url
          : fallback.careLabelImageUrl || null,
    note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 180) : fallback.note,
  };
}

/**
 * Infers a conservative, safety-first washing & care profile from garment attributes
 * when an explicit care label scan has not been saved yet.
 */
export function inferGarmentCareProfile(garment: Record<string, any> | null | undefined): GarmentCareProfile {
  const g = garment || {};
  const { colorGroup, colorBleedRisk } = inferColorGroupAndBleed(g);
  const category = String(g.category || '').toLowerCase();
  const text = [
    g.care_tip,
    g.material_composition,
    g.fabric,
    g.subcategory,
    g.name,
    g.name_en,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // 1. Shoes / Bags / Jewelry / Leather / Suede -> Spot clean / specialty care
  if (
    category === 'shoes' ||
    category === 'jewelry' ||
    /leather|suede|nubuck|가죽|스웨이드|누벅|시계|가방|bag|briefcase|clutch|loafer|sneaker|boots|로퍼|스니커즈|부츠/.test(
      text
    )
  ) {
    return {
      washMethod: 'spot_clean',
      waterTempC: 0,
      tumbleDry: 'no_tumble_flat',
      bleach: 'no_bleach',
      iron: 'no_iron',
      colorBleedRisk: 'low',
      colorGroup,
      needsLaundryNet: false,
      source: 'inferred',
    };
  }

  // 2. Explicit Dry Clean Only (care_tip, coat, blazer, suit, cashmere, silk, tailored wool)
  if (
    /드라이\s*클리닝|드라이\s*전용|dry\s*clean\s*only|dry\s*clean|수트|정장|블레이저|트렌치|코트|blazer|trench|suit|coat|silk|실크|캐시미어|cashmere|트위드|tweed/.test(
      text
    )
  ) {
    return {
      washMethod: 'dry_clean_only',
      waterTempC: 0,
      tumbleDry: 'no_tumble_flat',
      bleach: 'no_bleach',
      iron: 'low_cloth',
      colorBleedRisk,
      colorGroup,
      needsLaundryNet: false,
      source: 'inferred',
    };
  }

  // 3. Hand wash (lingerie, nubra, lace, swimwear, delicate silk blend)
  if (
    /손세탁|단독\s*손세탁|hand\s*wash|누브라|브라|란제리|레이스|수영복|비키니|스카프|머플러|nubra|lingerie|lace|swim|bikini|scarf/.test(
      text
    )
  ) {
    return {
      washMethod: 'hand_wash',
      waterTempC: 30,
      tumbleDry: 'no_tumble_flat',
      bleach: 'no_bleach',
      iron: 'no_iron',
      colorBleedRisk,
      colorGroup,
      needsLaundryNet: true,
      source: 'inferred',
    };
  }

  // 4. Wool / Knit / Cardigan / Sweater / Linen / Padding -> Wool & delicate cycle
  if (
    /울\s*코스|니트|울|모\s*\d|가디건|스웨터|린넨|마\s*\d|패딩|다운|푸퍼|wool|knit|cardigan|sweater|linen|puffer|down|merino|alpaca|mohair/.test(
      text
    )
  ) {
    return {
      washMethod: 'wool_delicate',
      waterTempC: 30,
      tumbleDry: 'no_tumble_flat',
      bleach: 'no_bleach',
      iron: 'low_cloth',
      colorBleedRisk,
      colorGroup,
      needsLaundryNet: true,
      source: 'inferred',
    };
  }

  // 5. Denim / Corduroy / Structured Trousers -> Cold machine wash, no tumble dry
  if (/denim|jean|corduroy|slacks|trouser|데님|청바지|코듀로이|슬랙스/.test(text)) {
    return {
      washMethod: 'machine_normal',
      waterTempC: 30,
      tumbleDry: 'no_tumble_hang',
      bleach: 'no_bleach',
      iron: 'low_cloth',
      colorBleedRisk: colorGroup === 'denim_indigo' ? 'high' : colorBleedRisk,
      colorGroup,
      needsLaundryNet: false,
      source: 'inferred',
    };
  }

  // 6. Standard Cotton / Poly / Tee / Shirt / Socks / Underwear
  const isDelicateUnderwear = /underwear|속옷|팬티|티팬티|t팬티|양말|socks/.test(text);
  return {
    washMethod: 'machine_normal',
    waterTempC: 30,
    tumbleDry: isDelicateUnderwear ? 'low_heat' : 'allowed',
    bleach: colorGroup === 'white_light' ? 'oxygen_only' : 'no_bleach',
    iron: 'allowed',
    colorBleedRisk,
    colorGroup,
    needsLaundryNet: isDelicateUnderwear,
    source: 'inferred',
  };
}

/**
 * Resolves the active GarmentCareProfile from stored garment_details or inferred defaults.
 */
export function resolveGarmentCareProfile(
  garment: Record<string, any> | null | undefined
): GarmentCareProfile {
  const inferred = inferGarmentCareProfile(garment);
  if (!garment) return inferred;

  let details = garment.garment_details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }

  const stored =
    (details && typeof details === 'object' ? details.care_profile || details.careProfile : null) ||
    garment.care_profile ||
    null;

  if (!stored || typeof stored !== 'object') {
    const labelUrl =
      (details && typeof details === 'object' && (details.care_label_image_url || details.careLabelImageUrl)) ||
      null;
    return labelUrl ? { ...inferred, careLabelImageUrl: labelUrl } : inferred;
  }

  return sanitizeGarmentCareProfile(stored, inferred);
}

export function getWashMethodLabel(method: WashMethod, lang = 'ko'): string {
  const map: Record<WashMethod, { ko: string; en: string }> = {
    dry_clean_only: { ko: '드라이클리닝 전용', en: 'Dry Clean Only' },
    hand_wash: { ko: '단독 손세탁', en: 'Hand Wash' },
    wool_delicate: { ko: '울·니트 코스', en: 'Wool / Delicate' },
    machine_normal: { ko: '일반 물세탁', en: 'Machine Wash' },
    spot_clean: { ko: '부분 닦기·전문 케어', en: 'Spot / Specialty Care' },
  };
  return lang === 'en' ? map[method].en : map[method].ko;
}

export function getTumbleDryLabel(policy: TumbleDryPolicy, lang = 'ko'): string {
  const map: Record<TumbleDryPolicy, { ko: string; en: string }> = {
    allowed: { ko: '건조기 가능', en: 'Tumble Dry OK' },
    low_heat: { ko: '저온 건조', en: 'Low Heat Dry' },
    no_tumble_flat: { ko: '건조기 불가 · 뉘어 건조', en: 'No Tumble · Flat Dry' },
    no_tumble_hang: { ko: '건조기 불가 · 그늘 건조', en: 'No Tumble · Line Dry' },
  };
  return lang === 'en' ? map[policy].en : map[policy].ko;
}

export function formatCareSummaryTokens(profile: GarmentCareProfile, lang = 'ko'): string[] {
  const tokens: string[] = [getWashMethodLabel(profile.washMethod, lang)];
  if (profile.waterTempC > 0) {
    tokens.push(lang === 'en' ? `${profile.waterTempC}°C` : `물온도 ${profile.waterTempC}°C`);
  }
  tokens.push(getTumbleDryLabel(profile.tumbleDry, lang));
  if (profile.needsLaundryNet) {
    tokens.push(lang === 'en' ? 'Mesh Bag' : '세탁망 권장');
  }
  if (profile.colorBleedRisk === 'high') {
    tokens.push(lang === 'en' ? 'Color Bleed Risk' : '이염 주의');
  }
  return tokens;
}

export function inferDefaultCareServiceType(
  garment: Record<string, any> | null | undefined
): CareMapServiceType {
  if (!garment) return 'dry_clean';
  const profile = resolveGarmentCareProfile(garment);
  const text = [
    garment.fabric,
    garment.material_composition,
    garment.care_tip,
    garment.subcategory,
    garment.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    profile.washMethod === 'spot_clean' ||
    /leather|suede|nubuck|가죽|스웨이드|명품|가방|부츠|구두/.test(text)
  ) {
    return 'leather_care';
  }
  if (/수선|기장|밑단|줄임|alteration|hem|tailor/.test(text)) {
    return 'alteration';
  }
  if (profile.washMethod === 'dry_clean_only' || profile.washMethod === 'wool_delicate') {
    return 'dry_clean';
  }
  return 'laundry';
}

export function formatDistanceMeters(meters: number | null | undefined): string {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/**
 * Sorts selected garments into safe wash course buckets and generates
 * actionable mixed-load conflict warnings.
 */
export function sortLaundryBasket(
  garments: Record<string, any>[],
  lang = 'ko'
): LaundrySortingPlan {
  const list = Array.isArray(garments) ? garments.filter(Boolean) : [];
  if (list.length === 0) {
    return {
      totalCount: 0,
      buckets: [],
      conflicts: [],
      canWashTogether: true,
      headlineKo: '세탁할 옷을 담으면 코스와 주의사항을 자동으로 분류합니다.',
      headlineEn: 'Add worn clothes to auto-sort wash courses and safety alerts.',
    };
  }

  const bucketMap: Record<LaundryBucketKey, LaundryBucketItem[]> = {
    dry_clean: [],
    wool_hand: [],
    light_normal: [],
    dark_normal: [],
    spot_clean: [],
  };

  const resolvedItems: LaundryBucketItem[] = list.map((garment) => ({
    garment,
    care: resolveGarmentCareProfile(garment),
  }));

  for (const entry of resolvedItems) {
    const { care } = entry;
    if (care.washMethod === 'dry_clean_only') {
      bucketMap.dry_clean.push(entry);
    } else if (care.washMethod === 'spot_clean') {
      bucketMap.spot_clean.push(entry);
    } else if (care.washMethod === 'wool_delicate' || care.washMethod === 'hand_wash') {
      bucketMap.wool_hand.push(entry);
    } else if (care.colorGroup === 'white_light' && care.colorBleedRisk !== 'high') {
      bucketMap.light_normal.push(entry);
    } else {
      bucketMap.dark_normal.push(entry);
    }
  }

  const buckets: LaundryBucket[] = [];
  if (bucketMap.dry_clean.length > 0) {
    buckets.push({
      key: 'dry_clean',
      titleKo: '드라이클리닝 전용',
      titleEn: 'Dry Clean Only',
      settingsKo: '물세탁 금지 · 전문 세탁소 맡기기 권장',
      settingsEn: 'No water wash · Take to professional dry cleaner',
      items: bucketMap.dry_clean,
      recommendedMapService: 'dry_clean',
    });
  }
  if (bucketMap.wool_hand.length > 0) {
    buckets.push({
      key: 'wool_hand',
      titleKo: '울·니트 / 손세탁 코스',
      titleEn: 'Wool & Delicate Hand Wash',
      settingsKo: '찬물 30°C 이하 · 중성세제 · 세탁망 · 뉘어서 그늘 건조',
      settingsEn: 'Cold ≤30°C · Neutral detergent · Mesh bag · Flat shade dry',
      items: bucketMap.wool_hand,
      recommendedMapService: 'dry_clean',
    });
  }
  if (bucketMap.light_normal.length > 0) {
    buckets.push({
      key: 'light_normal',
      titleKo: '밝은색 · 화이트 일반 세탁',
      titleEn: 'Whites & Light Colors',
      settingsKo: '30~40°C 표준 코스 · 산소계 표백 가능',
      settingsEn: '30–40°C standard cycle · Oxygen bleach safe',
      items: bucketMap.light_normal,
    });
  }
  if (bucketMap.dark_normal.length > 0) {
    buckets.push({
      key: 'dark_normal',
      titleKo: '어두운색 · 데님 일반 세탁',
      titleEn: 'Darks & Denim',
      settingsKo: '찬물 30°C · 뒤집어 세탁 · 밝은 옷과 분리',
      settingsEn: 'Cold 30°C · Wash inside-out · Keep separate from lights',
      items: bucketMap.dark_normal,
    });
  }
  if (bucketMap.spot_clean.length > 0) {
    buckets.push({
      key: 'spot_clean',
      titleKo: '가죽·슈즈 부분 케어',
      titleEn: 'Leather & Specialty Spot Care',
      settingsKo: '세탁기 사용 금지 · 전용 클리너 또는 전문 케어점 이용',
      settingsEn: 'Do not machine wash · Spot clean or leather specialist',
      items: bucketMap.spot_clean,
      recommendedMapService: 'leather_care',
    });
  }

  const conflicts: LaundryConflictWarning[] = [];
  const waterWashCount =
    bucketMap.wool_hand.length + bucketMap.light_normal.length + bucketMap.dark_normal.length;

  if (bucketMap.dry_clean.length > 0 && waterWashCount > 0) {
    const names = bucketMap.dry_clean
      .slice(0, 2)
      .map((e) => e.garment.name)
      .join(', ');
    conflicts.push({
      id: 'dry-clean-mixed',
      severity: 'critical',
      code: 'dry_clean_mixed',
      titleKo: `드라이클리닝 전용 ${bucketMap.dry_clean.length}벌 분리 필요`,
      titleEn: `Separate ${bucketMap.dry_clean.length} dry-clean-only item(s)`,
      detailKo: `${names} 등은 물세탁 시 수축·형태 변형 위험이 높아 세탁기에 넣지 마세요.`,
      detailEn: `${names} risk shrinkage or warping if water-washed.`,
      affectedGarmentIds: bucketMap.dry_clean.map((e) => Number(e.garment.id)),
    });
  }

  if (
    bucketMap.wool_hand.length > 0 &&
    (bucketMap.light_normal.length > 0 || bucketMap.dark_normal.length > 0)
  ) {
    conflicts.push({
      id: 'wool-shrink-risk',
      severity: 'critical',
      code: 'wool_shrink_risk',
      titleKo: `니트·울 섬세 의류 ${bucketMap.wool_hand.length}벌 수축 주의`,
      titleEn: `${bucketMap.wool_hand.length} wool/knit item(s) need separate cycle`,
      detailKo: '일반 표준 코스로 함께 돌리면 보풀과 수축이 생깁니다. 울코스(30°C)로 분리 세탁하세요.',
      detailEn: 'Mixing wool/knits with standard loads causes pilling and shrinkage. Use 30°C wool cycle.',
      affectedGarmentIds: bucketMap.wool_hand.map((e) => Number(e.garment.id)),
    });
  }

  const bleedRiskItems = resolvedItems.filter(
    (e) =>
      e.care.washMethod !== 'dry_clean_only' &&
      e.care.washMethod !== 'spot_clean' &&
      (e.care.colorBleedRisk === 'high' || e.care.colorGroup === 'denim_indigo')
  );
  if (bleedRiskItems.length > 0 && bucketMap.light_normal.length > 0) {
    conflicts.push({
      id: 'color-bleed-risk',
      severity: 'critical',
      code: 'color_bleed_risk',
      titleKo: '밝은 옷 + 데님/진한 색 이염 경고',
      titleEn: 'Color transfer warning between darks/denim and lights',
      detailKo: '이염 위험 의류와 화이트·밝은색 의류를 자동으로 분리했습니다. 함께 빨지 마세요.',
      detailEn: 'High bleed-risk items were split from whites and light colors.',
      affectedGarmentIds: [
        ...bleedRiskItems.map((e) => Number(e.garment.id)),
        ...bucketMap.light_normal.map((e) => Number(e.garment.id)),
      ],
    });
  }

  const noTumbleItems = resolvedItems.filter(
    (e) =>
      e.care.washMethod !== 'dry_clean_only' &&
      e.care.washMethod !== 'spot_clean' &&
      (e.care.tumbleDry === 'no_tumble_flat' || e.care.tumbleDry === 'no_tumble_hang')
  );
  if (noTumbleItems.length > 0) {
    conflicts.push({
      id: 'no-tumble-dry',
      severity: 'warning',
      code: 'no_tumble_dry',
      titleKo: `건조기 사용 불가 ${noTumbleItems.length}벌 포함`,
      titleEn: `${noTumbleItems.length} item(s) cannot go in the dryer`,
      detailKo: '탈수 후 건조기에 넣지 말고 그늘에서 뉘어 말리거나 자연 건조하세요.',
      detailEn: 'Air-dry flat or hang in shade after washing to prevent heat shrinkage.',
      affectedGarmentIds: noTumbleItems.map((e) => Number(e.garment.id)),
    });
  }

  const netItems = resolvedItems.filter(
    (e) =>
      e.care.washMethod !== 'dry_clean_only' &&
      e.care.washMethod !== 'spot_clean' &&
      e.care.needsLaundryNet
  );
  if (netItems.length > 0) {
    conflicts.push({
      id: 'laundry-net-tip',
      severity: 'warning',
      code: 'laundry_net_required',
      titleKo: `세탁망 권장 ${netItems.length}벌`,
      titleEn: `Use mesh laundry bag for ${netItems.length} item(s)`,
      detailKo: '니트·속옷·섬세 원단은 세탁망에 넣어 원단 늘어남과 걸림을 예방하세요.',
      detailEn: 'Place knits and delicates inside a mesh bag to protect fibers.',
      affectedGarmentIds: netItems.map((e) => Number(e.garment.id)),
    });
  }

  const canWashTogether = buckets.length <= 1 && !conflicts.some((c) => c.severity === 'critical');
  const headlineKo = canWashTogether
    ? `${list.length}벌 모두 한 코스로 안전하게 함께 세탁할 수 있습니다.`
    : `${list.length}벌 중 분리 세탁이 필요한 항목이 있어 ${buckets.length}개 코스로 자동 분류했습니다.`;
  const headlineEn = canWashTogether
    ? `All ${list.length} item(s) are safe to wash together in 1 course.`
    : `${list.length} item(s) auto-sorted into ${buckets.length} separate care courses.`;

  return {
    totalCount: list.length,
    buckets,
    conflicts,
    canWashTogether,
    headlineKo,
    headlineEn,
  };
}

/**
 * Extracts unique garment IDs worn within the last `days` days from Calendar logs + outfits.
 */
export function extractRecentCalendarGarmentIds(
  calendarLogs: Record<string, any>[],
  outfits: Record<string, any>[],
  days = 7,
  todayIso?: string
): number[] {
  const safeLogs = Array.isArray(calendarLogs) ? calendarLogs : [];
  const safeOutfits = Array.isArray(outfits) ? outfits : [];
  if (safeLogs.length === 0) return [];

  const today = todayIso ? new Date(`${todayIso}T00:00:00`) : new Date();
  const cutoffMs = today.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000;

  const outfitById = new Map<number, Record<string, any>>();
  for (const o of safeOutfits) {
    const id = Number(o?.id);
    if (Number.isFinite(id)) outfitById.set(id, o);
  }

  const garmentIds = new Set<number>();
  for (const log of safeLogs) {
    const wornDate = String(log?.worn_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wornDate)) continue;
    const logTime = new Date(`${wornDate}T00:00:00`).getTime();
    if (!Number.isFinite(logTime) || logTime < cutoffMs) continue;

    // Direct garment_ids array on calendar log if present
    const directIds = Array.isArray(log.garment_ids) ? log.garment_ids : [];
    for (const gid of directIds) {
      const n = Number(gid);
      if (Number.isFinite(n)) garmentIds.add(n);
    }

    // Linked outfit's item_ids / items
    const outfitId = Number(log.outfit_id);
    const outfit = Number.isFinite(outfitId) ? outfitById.get(outfitId) : null;
    if (outfit) {
      let itemIds: unknown[] = [];
      if (Array.isArray(outfit.item_ids)) {
        itemIds = outfit.item_ids;
      } else if (typeof outfit.item_ids === 'string') {
        try {
          const parsed = JSON.parse(outfit.item_ids);
          if (Array.isArray(parsed)) itemIds = parsed;
        } catch {
          // ignore
        }
      } else if (Array.isArray(outfit.items)) {
        itemIds = outfit.items.map((it: any) => it?.id ?? it);
      }
      for (const idVal of itemIds) {
        const n = Number(idVal);
        if (Number.isFinite(n)) garmentIds.add(n);
      }
    }
  }

  return Array.from(garmentIds);
}
