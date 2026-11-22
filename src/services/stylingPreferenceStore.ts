export type StylingDensityLevel = 'minimal' | 'balanced' | 'layered';

export interface StylingDensityPreference {
  density: StylingDensityLevel;
  includeBag: boolean;
  includeAccessory: boolean;
}

export type TpoCategory =
  | 'office'
  | 'cafe_casual'
  | 'outdoor_active'
  | 'formal_dining'
  | 'travel'
  | 'daily';

export interface SelectedTpoPlace {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  primaryType?: string;
  streetViewPanoId?: string | null;
  streetViewLat?: number | null;
  streetViewLng?: number | null;
  streetViewCopyright?: string | null;
  tpoCategory: TpoCategory;
  tpoLabelKo: string;
  tpoLabelEn: string;
}

export const STYLING_PREF_EVENT = 'ainventory:styling-pref-changed';
const PREF_STORAGE_KEY = 'ainventory_styling_density_pref_v1';
const PLACE_STORAGE_KEY = 'ainventory_selected_tpo_place_v1';

export const DEFAULT_STYLING_PREF: StylingDensityPreference = {
  density: 'balanced',
  includeBag: true,
  includeAccessory: false,
};

export const STYLING_DENSITY_OPTIONS: Array<{
  key: StylingDensityLevel;
  labelKo: string;
  labelEn: string;
  descKo: string;
  descEn: string;
}> = [
  {
    key: 'minimal',
    labelKo: '미니멀',
    labelEn: 'Minimal',
    descKo: '핵심 2~3종 위주, 겹쳐입기 최소화',
    descEn: 'Core 2–3 pieces, no extra mid-layers',
  },
  {
    key: 'balanced',
    labelKo: '밸런스',
    labelEn: 'Balanced',
    descKo: '기온에 맞춰 아우터·미드 1종 조합',
    descEn: '1 outer + optional mid-layer by temp',
  },
  {
    key: 'layered',
    labelKo: '레이어드',
    labelEn: 'Layered',
    descKo: '다중 레이어링과 포인트 소품 활용',
    descEn: 'Multi-layer styling & accent details',
  },
];

const TPO_LABELS: Record<TpoCategory, { ko: string; en: string }> = {
  office: { ko: '오피스 · 비즈니스', en: 'Office · Business' },
  cafe_casual: { ko: '카페 · 데일리 외출', en: 'Cafe · Casual Outing' },
  outdoor_active: { ko: '야외 · 액티브', en: 'Outdoor · Active' },
  formal_dining: { ko: '포멀 · 다이닝·전시', en: 'Formal · Dining & Gallery' },
  travel: { ko: '여행 · 이동', en: 'Travel · Transit' },
  daily: { ko: '일상 · 데일리', en: 'Daily' },
};

export function getTpoLabels(category: TpoCategory): { ko: string; en: string } {
  return TPO_LABELS[category] || TPO_LABELS.daily;
}

export function inferTpoFromPlaceTypes(
  primaryType?: string | null,
  types?: string[] | null,
  placeName?: string | null
): { tpoCategory: TpoCategory; tpoLabelKo: string; tpoLabelEn: string } {
  const joined = [primaryType || '', ...(Array.isArray(types) ? types : []), placeName || '']
    .join(' ')
    .toLowerCase();

  let tpoCategory: TpoCategory = 'daily';
  if (
    /corporate_office|office|coworking|convention_center|bank|courthouse|financial|ifc|여의도|테헤란로|판교|오피스|사옥|타워/.test(
      joined
    )
  ) {
    tpoCategory = 'office';
  } else if (
    /fine_dining|art_gallery|museum|performing_arts_theater|opera|wedding|hotel|resort|컨벤션|갤러리|미술관|파인다이닝|호텔|웨딩|공연장/.test(
      joined
    )
  ) {
    tpoCategory = 'formal_dining';
  } else if (
    /park|beach|hiking_area|campground|national_park|stadium|golf_course|sports_complex|한강|공원|해수욕장|해운대|올레|산|트레킹|캠핑/.test(
      joined
    )
  ) {
    tpoCategory = 'outdoor_active';
  } else if (
    /airport|train_station|transit_station|ferry_terminal|tourist_attraction|공항|역|터미널|면세점|애월|제주/.test(
      joined
    )
  ) {
    tpoCategory = 'travel';
  } else if (
    /cafe|coffee_shop|bakery|restaurant|bar|shopping_mall|department_store|book_store|성수|연남|한남|삼청|가로수길|카페|몰|백화점/.test(
      joined
    )
  ) {
    tpoCategory = 'cafe_casual';
  }

  const labels = getTpoLabels(tpoCategory);
  return {
    tpoCategory,
    tpoLabelKo: labels.ko,
    tpoLabelEn: labels.en,
  };
}

export function sanitizeStylingPreference(raw: unknown): StylingDensityPreference {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STYLING_PREF };
  const obj = raw as Record<string, unknown>;
  const density: StylingDensityLevel =
    obj.density === 'minimal' || obj.density === 'balanced' || obj.density === 'layered'
      ? obj.density
      : DEFAULT_STYLING_PREF.density;
  return {
    density,
    includeBag: typeof obj.includeBag === 'boolean' ? obj.includeBag : DEFAULT_STYLING_PREF.includeBag,
    includeAccessory:
      typeof obj.includeAccessory === 'boolean'
        ? obj.includeAccessory
        : DEFAULT_STYLING_PREF.includeAccessory,
  };
}

export function getStoredStylingPreference(): StylingDensityPreference {
  if (typeof window === 'undefined') return { ...DEFAULT_STYLING_PREF };
  try {
    const raw = window.localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STYLING_PREF };
    return sanitizeStylingPreference(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STYLING_PREF };
  }
}

export function saveStoredStylingPreference(
  next: Partial<StylingDensityPreference>
): StylingDensityPreference {
  const merged = sanitizeStylingPreference({
    ...getStoredStylingPreference(),
    ...next,
  });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(STYLING_PREF_EVENT, { detail: merged }));
  }
  return merged;
}

export function getStoredSelectedPlace(): SelectedTpoPlace | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number'
    ) {
      return parsed as SelectedTpoPlace;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredSelectedPlace(place: SelectedTpoPlace | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!place) {
      window.localStorage.removeItem(PLACE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
    }
  } catch {
    // ignore
  }
}

const BAG_SLOT_KEYS = ['accessory', 'acc_bag', 'bag'];
const EXTRA_ACCESSORY_SLOT_KEYS = [
  'acc_belt',
  'acc_neck',
  'acc_head',
  'acc_eye',
  'acc_watch',
  'acc_gloves',
  'acc_necklace',
  'acc_earring',
  'acc_bracelet',
  'acc_ring',
  'acc_brooch',
];

/**
 * Deterministically filters recommended outfit slots according to the user's
 * 3-tier layering density preset (`minimal` / `balanced` / `layered`) and
 * independent `includeBag` / `includeAccessory` toggles.
 */
export function applyStylingDensityFilter(
  slots: Record<string, any>,
  preference: StylingDensityPreference,
  weather?: {
    avgTemp?: number;
    tempMin?: number;
    tempMax?: number;
    feelsLikeTemp?: number;
    feelsLikeMin?: number;
    feelsLikeMax?: number;
    isRainy?: boolean;
    isRaining?: boolean;
    isWindy?: boolean;
    isSnowy?: boolean;
    alerts?: Array<{ stylingDirective?: string }>;
    alertStylingDirectives?: string[];
  } | null
): Record<string, any> {
  const next: Record<string, any> = { ...(slots || {}) };
  const pref = sanitizeStylingPreference(preference);

  const avgTemp =
    typeof weather?.feelsLikeTemp === 'number' && Number.isFinite(weather.feelsLikeTemp)
      ? weather.feelsLikeTemp
      : typeof weather?.feelsLikeMin === 'number' && typeof weather?.feelsLikeMax === 'number'
        ? (weather.feelsLikeMin + weather.feelsLikeMax) / 2
        : typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)
          ? weather.avgTemp
          : typeof weather?.tempMin === 'number' && typeof weather?.tempMax === 'number'
            ? (weather.tempMin + weather.tempMax) / 2
            : 16;
  const tempSwing =
    typeof weather?.tempMin === 'number' && typeof weather?.tempMax === 'number'
      ? Math.abs(weather.tempMax - weather.tempMin)
      : 6;
  const alertDirs = new Set<string>([
    ...(Array.isArray(weather?.alertStylingDirectives) ? weather.alertStylingDirectives : []),
    ...(Array.isArray(weather?.alerts)
      ? weather.alerts.map((a) => String(a?.stylingDirective || '')).filter(Boolean)
      : []),
  ]);
  const isRainy = Boolean(weather?.isRainy || weather?.isRaining || alertDirs.has('rain_storm'));
  const isWindy = Boolean(weather?.isWindy || alertDirs.has('cold_wind'));
  const isSnowy = Boolean(weather?.isSnowy || alertDirs.has('snow_ice'));

  if (pref.density === 'minimal') {
    // Strip extra mid-layers always unless severe cold/snow alert requires insulation
    if (!alertDirs.has('cold_wind') && !isSnowy) {
      next.outer_mid = null;
      next.top_mid = null;
    } else {
      next.outer_mid = null;
    }
    // Allow single outer only when genuinely chilly (<= 15C) or rainy/windy/snowy
    if (avgTemp > 15 && !isRainy && !isWindy && !isSnowy) {
      next.outer = null;
    }
    // In minimal mode, keep accessories clean unless explicitly toggled on
    if (!pref.includeAccessory) {
      for (const k of EXTRA_ACCESSORY_SLOT_KEYS) {
        if (k in next) next[k] = null;
      }
    }
  } else if (pref.density === 'balanced') {
    // Allow at most 1 outer + 1 mid-layer when cool (<= 14C or wide swing >= 10C)
    const allowSingleMid = avgTemp <= 14 || tempSwing >= 10 || alertDirs.has('cold_wind') || isSnowy;
    if (!allowSingleMid) {
      next.outer_mid = null;
      next.top_mid = null;
    } else if (next.outer_mid && next.top_mid) {
      // Avoid stacking both mid-layers simultaneously in balanced mode
      next.outer_mid = null;
    }
    if (avgTemp >= 22 && !isRainy && !isWindy && !isSnowy) {
      next.outer = null;
    }
  }
  // 'layered': keeps outer, outer_mid, top_mid intact

  // Independent bag toggle applies across all 3 tiers
  if (!pref.includeBag) {
    for (const k of BAG_SLOT_KEYS) {
      if (k in next) next[k] = null;
    }
  }

  // Independent accessory toggle applies across all 3 tiers
  if (!pref.includeAccessory) {
    for (const k of EXTRA_ACCESSORY_SLOT_KEYS) {
      if (k in next) next[k] = null;
    }
  }

  return next;
}
