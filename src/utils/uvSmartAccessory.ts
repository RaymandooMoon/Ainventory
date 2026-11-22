export type UvLevel = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';

export interface UvAccessoryCandidate {
  slotKey: 'acc_eye' | 'acc_head';
  kindLabelKo: string;
  kindLabelEn: string;
  garment: Record<string, any>;
  isEquipped: boolean;
}

export interface UvSmartSuggestion {
  shouldSuggest: boolean;
  uvIndex: number;
  uvLevel: UvLevel;
  uvLabelKo: string;
  uvLabelEn: string;
  headlineKo: string;
  headlineEn: string;
  tipKo: string;
  tipEn: string;
  candidates: UvAccessoryCandidate[];
}

export function classifyUvLevelClient(uvIndex: unknown): UvLevel {
  const n = Number(uvIndex);
  if (!Number.isFinite(n) || n < 0) return 'low';
  if (n >= 11) return 'extreme';
  if (n >= 8) return 'very_high';
  if (n >= 6) return 'high';
  if (n >= 3) return 'moderate';
  return 'low';
}

export function formatUvLevelLabel(uvLevel: UvLevel, lang = 'ko'): string {
  const map: Record<UvLevel, { ko: string; en: string }> = {
    low: { ko: '낮음', en: 'Low' },
    moderate: { ko: '보통', en: 'Moderate' },
    high: { ko: '높음', en: 'High' },
    very_high: { ko: '매우 높음', en: 'Very High' },
    extreme: { ko: '위험', en: 'Extreme' },
  };
  const entry = map[uvLevel] || map.low;
  return lang === 'en' ? entry.en : entry.ko;
}

/**
 * Resolves the effective temperature used for styling decisions,
 * strictly prioritizing feels-like temperature when available.
 */
export function getEffectiveFeelsLikeTemp(weather: Record<string, any> | null | undefined): number | null {
  if (!weather || typeof weather !== 'object') return null;
  if (typeof weather.feelsLikeTemp === 'number' && Number.isFinite(weather.feelsLikeTemp)) {
    return Math.round(weather.feelsLikeTemp);
  }
  if (
    typeof weather.feelsLikeMin === 'number' &&
    typeof weather.feelsLikeMax === 'number' &&
    Number.isFinite(weather.feelsLikeMin) &&
    Number.isFinite(weather.feelsLikeMax)
  ) {
    return Math.round(weather.feelsLikeMin * 0.45 + weather.feelsLikeMax * 0.55);
  }
  if (typeof weather.avgTemp === 'number' && Number.isFinite(weather.avgTemp)) {
    return Math.round(weather.avgTemp);
  }
  if (
    typeof weather.tempMin === 'number' &&
    typeof weather.tempMax === 'number' &&
    Number.isFinite(weather.tempMin) &&
    Number.isFinite(weather.tempMax)
  ) {
    return Math.round(weather.tempMin * 0.45 + weather.tempMax * 0.55);
  }
  if (typeof weather.currentTemp === 'number' && Number.isFinite(weather.currentTemp)) {
    return Math.round(weather.currentTemp);
  }
  return null;
}

function isSunglassesGarment(item: Record<string, any>): boolean {
  if (!item || typeof item !== 'object') return false;
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (/sunglass|선글라스/.test(name) || sub === 'sunglasses') return true;
  if ((cat === 'eyewear' || sub === 'eyewear' || sub === 'glasses') && /썬|선글|틴트|uv|shade|tint/.test(name)) {
    return true;
  }
  return cat === 'eyewear' || sub === 'eyewear';
}

function isSunHatGarment(item: Record<string, any>): boolean {
  if (!item || typeof item !== 'object') return false;
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (/비니|beanie|털모자|우샨카|earflap/.test(name)) return false;
  return (
    cat === 'headwear' ||
    sub === 'headwear' ||
    sub === 'cap' ||
    sub === 'hat' ||
    sub === 'bucket_hat' ||
    /볼캡|캡|버킷햇|모자|선캡|파나마|cap|hat|visor/.test(name)
  );
}

/**
 * Builds a non-intrusive 1-tap UV accessory suggestion (sunglasses & sun hat)
 * when UV index >= 6 during daytime, strictly respecting the user's accessory toggle
 * (never auto-equips without explicit tap).
 */
export function buildUvSmartSuggestion({
  weather,
  garments,
  slots,
  lang = 'ko',
}: {
  weather?: Record<string, any> | null;
  garments?: Record<string, any>[] | null;
  slots?: Record<string, any> | null;
  lang?: string;
}): UvSmartSuggestion {
  const uvIndex = Number(weather?.uvIndex);
  const validUv = Number.isFinite(uvIndex) ? Math.round(uvIndex) : 0;
  const uvLevel = classifyUvLevelClient(validUv);
  const uvLabelKo = formatUvLevelLabel(uvLevel, 'ko');
  const uvLabelEn = formatUvLevelLabel(uvLevel, 'en');
  const isDay = weather?.isDay !== false;

  if (validUv < 6 || !isDay) {
    return {
      shouldSuggest: false,
      uvIndex: validUv,
      uvLevel,
      uvLabelKo,
      uvLabelEn,
      headlineKo: '',
      headlineEn: '',
      tipKo: '',
      tipEn: '',
      candidates: [],
    };
  }

  const closet = Array.isArray(garments)
    ? garments.filter((g) => g && g.status !== 'archived' && g.status !== 'donated')
    : [];

  const equippedEyeId = slots?.acc_eye?.id != null ? Number(slots.acc_eye.id) : null;
  const equippedHeadId = slots?.acc_head?.id != null ? Number(slots.acc_head.id) : null;

  const sunglasses =
    closet.find((g) => /sunglass|선글라스/i.test(String(g.name || ''))) ||
    closet.find((g) => isSunglassesGarment(g)) ||
    null;
  const sunHat = closet.find((g) => isSunHatGarment(g)) || null;

  const candidates: UvAccessoryCandidate[] = [];
  if (sunglasses) {
    candidates.push({
      slotKey: 'acc_eye',
      kindLabelKo: '선글라스',
      kindLabelEn: 'Sunglasses',
      garment: sunglasses,
      isEquipped: equippedEyeId !== null && equippedEyeId === Number(sunglasses.id),
    });
  }
  if (sunHat) {
    candidates.push({
      slotKey: 'acc_head',
      kindLabelKo: '모자',
      kindLabelEn: 'Hat',
      garment: sunHat,
      isEquipped: equippedHeadId !== null && equippedHeadId === Number(sunHat.id),
    });
  }

  const allAlreadyEquipped =
    candidates.length > 0 && candidates.every((c) => c.isEquipped);

  const headlineKo = `자외선 ${uvLabelKo} (UV ${validUv})`;
  const headlineEn = `UV ${uvLabelEn} (UV ${validUv})`;
  const tipKo =
    candidates.length > 0
      ? '원탭으로 보유 중인 선글라스·모자를 코디에 바로 착용해 보세요.'
      : '외출 시 선글라스나 모자로 자외선을 차단하면 좋아요.';
  const tipEn =
    candidates.length > 0
      ? 'Tap to try on your sunglasses or hat for sun protection.'
      : 'Consider bringing sunglasses or a sun hat for UV protection.';

  void lang;
  return {
    shouldSuggest: !allAlreadyEquipped,
    uvIndex: validUv,
    uvLevel,
    uvLabelKo,
    uvLabelEn,
    headlineKo,
    headlineEn,
    tipKo,
    tipEn,
    candidates,
  };
}
