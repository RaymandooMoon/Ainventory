import { localizeGarmentName } from './i18n.ts';

export interface AutoOutfitTitleParams {
  styleMode?: string | null;
  weather?: {
    avgTemp?: number | null;
    isRainy?: boolean;
    isSnowy?: boolean;
    scenarioKey?: string | null;
  } | null;
  scenarioKey?: string | null;
  slots?: Record<string, any> | null;
  activeRecommendation?: { presetKey?: string | null } | null;
  resolvedCityDisplayLabel?: string | null;
  lang?: string;
  previousTitle?: string | null;
  generationNonce?: number;
}

const COLOR_LABELS_KO: Record<string, string> = {
  black: '블랙',
  white: '화이트',
  ivory: '아이보리',
  cream: '크림',
  beige: '베이지',
  camel: '카멜',
  tan: '탄',
  brown: '브라운',
  navy: '네이비',
  blue: '블루',
  denim: '데님',
  indigo: '인디고',
  gray: '그레이',
  grey: '그레이',
  charcoal: '차콜',
  olive: '올리브',
  sage: '세이지',
  khaki: '카키',
  green: '그린',
  burgundy: '버건디',
  wine: '와인',
  red: '레드',
  pink: '핑크',
  lavender: '라벤더',
  purple: '퍼플',
  yellow: '옐로우',
  mustard: '머스타드',
  orange: '오렌지',
  silver: '실버',
  gold: '골드',
};

const COLOR_LABELS_EN: Record<string, string> = {
  black: 'Black',
  white: 'White',
  ivory: 'Ivory',
  cream: 'Cream',
  beige: 'Beige',
  camel: 'Camel',
  tan: 'Tan',
  brown: 'Brown',
  navy: 'Navy',
  blue: 'Blue',
  denim: 'Denim',
  indigo: 'Indigo',
  gray: 'Gray',
  grey: 'Gray',
  charcoal: 'Charcoal',
  olive: 'Olive',
  sage: 'Sage',
  khaki: 'Khaki',
  green: 'Green',
  burgundy: 'Burgundy',
  wine: 'Wine',
  red: 'Red',
  pink: 'Pink',
  lavender: 'Lavender',
  purple: 'Purple',
  yellow: 'Yellow',
  mustard: 'Mustard',
  orange: 'Orange',
  silver: 'Silver',
  gold: 'Gold',
};

const EDITORIAL_MOODS_BY_STYLE: Record<
  string,
  Array<{ ko: string; en: string }>
> = {
  business_casual: [
    { ko: '모던 오피스 레이어드', en: 'Modern Office Layered' },
    { ko: '어반 테일러드 무드', en: 'Urban Tailored Mood' },
    { ko: '시티 비즈니스 룩', en: 'City Business Look' },
    { ko: '스마트 워크웨어', en: 'Smart Workwear' },
    { ko: '클래식 커뮤트 앙상블', en: 'Classic Commute Ensemble' },
  ],
  formal_office: [
    { ko: '테일러드 포멀 룩', en: 'Tailored Formal Look' },
    { ko: '이그제큐티브 시그니처', en: 'Executive Signature' },
    { ko: '샤프 아틀리에 수트무드', en: 'Sharp Atelier Mood' },
    { ko: '정제된 클래식 룩', en: 'Refined Classic Look' },
  ],
  comfortable_casual: [
    { ko: '릴랙스 시티 캐주얼', en: 'Relaxed City Casual' },
    { ko: '위켄드 스트리트 무드', en: 'Weekend Street Mood' },
    { ko: '이지 레이어드 룩', en: 'Easy Layered Look' },
    { ko: '에포트리스 데일리', en: 'Effortless Daily' },
  ],
  minimal_daily: [
    { ko: '미니멀 아틀리에 룩', en: 'Minimal Atelier Look' },
    { ko: '모노크롬 시티 에디트', en: 'Monochrome City Edit' },
    { ko: '클린 데일리 실루엣', en: 'Clean Daily Silhouette' },
    { ko: '큐레이티드 데일리', en: 'Curated Daily' },
  ],
  street: [
    { ko: '어반 스트릿 에디트', en: 'Urban Street Edit' },
    { ko: '네오 스트릿 레이어드', en: 'Neo Street Layered' },
    { ko: '시티 유틸리티 룩', en: 'City Utility Look' },
    { ko: '하이엔드 스트릿 무드', en: 'High-End Street Mood' },
  ],
  hiphop: [
    { ko: '오버사이즈 힙합 무드', en: 'Oversized Hip-Hop Mood' },
    { ko: '볼드 스웨그 에디트', en: 'Bold Swag Edit' },
    { ko: '헤비웨이트 힙합 룩', en: 'Heavyweight Hip-Hop Look' },
    { ko: '스트릿 힙합 시그니처', en: 'Street Hip-Hop Signature' },
  ],
};

const WEATHER_ACCENT_MOODS: Record<string, Array<{ ko: string; en: string }>> = {
  cold: [
    { ko: '윈터 레이어드 에디트', en: 'Winter Layered Edit' },
    { ko: '콜드 브리즈 시티 룩', en: 'Cold Breeze City Look' },
    { ko: '웜 아틀리에 윈터', en: 'Warm Atelier Winter' },
    { ko: '윈터 시그니처 코디', en: 'Winter Signature Look' },
  ],
  rain: [
    { ko: '레이니 데이 시티 룩', en: 'Rainy Day City Look' },
    { ko: '미스티 어반 에디트', en: 'Misty Urban Edit' },
  ],
  snow: [
    { ko: '스노이 윈터 에디트', en: 'Snowy Winter Edit' },
    { ko: '화이트 스노우 무드', en: 'White Snow Mood' },
  ],
  warm: [
    { ko: '라이트 브리즈 데일리', en: 'Light Breeze Daily' },
    { ko: '서머 에포트리스 룩', en: 'Summer Effortless Look' },
  ],
  mild: [
    { ko: '트랜지셔널 시티 무드', en: 'Transitional City Mood' },
    { ko: '어반 에디토리얼 룩', en: 'Urban Editorial Look' },
    { ko: '시그니처 아틀리에 룩', en: 'Signature Atelier Look' },
    { ko: '오늘의 큐레이션 룩', en: 'Curated Today Look' },
  ],
};

function hashStringDeterministic(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function extractConciseGarmentTag(garment: any, lang: string): string {
  if (!garment) return '';
  const isEn = lang === 'en';
  const rawName = String(localizeGarmentName(garment.name || '', lang) || garment.name || '').trim();
  const rawColor = String(garment.color || '').trim().toLowerCase();
  const colorLabel = rawColor
    ? (isEn ? COLOR_LABELS_EN[rawColor] : COLOR_LABELS_KO[rawColor]) || ''
    : '';
  const sub = String(garment.subcategory || '').trim();

  if (rawName) {
    const tokens = rawName.split(/\s+/).filter(Boolean);
    if (tokens.length <= 2 && rawName.length <= 16) {
      return rawName;
    }
    // Keep the most descriptive head/tail words (typically color/material + garment type)
    const compact =
      tokens.length >= 3
        ? `${tokens[0]} ${tokens[tokens.length - 1]}`
        : tokens.slice(0, 2).join(' ');
    if (compact.length <= 18) {
      return compact;
    }
  }

  if (colorLabel && sub) {
    return `${colorLabel} ${sub}`;
  }
  return rawName.slice(0, 16).trim() || sub || '';
}

function resolveCityDistrictToken(resolvedCityDisplayLabel: string | null | undefined, lang: string): string {
  const raw = String(resolvedCityDisplayLabel || '').replace(/\s*·\s*/g, ' ').trim();
  if (!raw) return lang === 'en' ? 'Seoul' : '서울';
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || parts[0] || (lang === 'en' ? 'Seoul' : '서울');
}

export function buildAutoOutfitTitle({
  styleMode,
  weather,
  scenarioKey,
  slots,
  activeRecommendation,
  resolvedCityDisplayLabel,
  lang = 'ko',
  previousTitle = null,
  generationNonce = 0,
}: AutoOutfitTitleParams): string {
  const isEn = lang === 'en';
  const safeSlots = slots && typeof slots === 'object' ? slots : {};

  // Pick hero garment + optional accent garment from currently worn stack
  const heroGarment =
    safeSlots.outer ||
    safeSlots.outer_mid ||
    safeSlots.onepiece ||
    safeSlots.dress ||
    safeSlots.top_mid ||
    safeSlots.top ||
    safeSlots.bottom ||
    null;

  const accentGarment =
    safeSlots.acc_scarf ||
    safeSlots.accessory ||
    (heroGarment !== safeSlots.top_mid ? safeSlots.top_mid : null) ||
    (heroGarment !== safeSlots.bottom ? safeSlots.bottom : null) ||
    safeSlots.shoes ||
    null;

  const heroTag = extractConciseGarmentTag(heroGarment, lang);
  const accentTag =
    accentGarment && accentGarment !== heroGarment
      ? extractConciseGarmentTag(accentGarment, lang)
      : '';

  const equippedIds = Object.keys(safeSlots)
    .sort()
    .map((k) => `${k}:${safeSlots[k]?.id ?? safeSlots[k]?.name ?? ''}`)
    .filter((entry) => !entry.endsWith(':'))
    .join('|');

  const tempVal =
    typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)
      ? Math.round(weather.avgTemp)
      : null;
  const effScenario = String(scenarioKey || weather?.scenarioKey || 'live');

  const weatherBucket =
    weather?.isSnowy || effScenario === 'snowy_winter'
      ? 'snow'
      : weather?.isRainy || effScenario === 'rainy_cool'
        ? 'rain'
        : tempVal != null && tempVal <= 5
          ? 'cold'
          : tempVal != null && tempVal >= 24
            ? 'warm'
            : 'mild';

  const recPresetKey = activeRecommendation?.presetKey || 'minimal_daily';
  const styleMoodPool =
    EDITORIAL_MOODS_BY_STYLE[recPresetKey] || EDITORIAL_MOODS_BY_STYLE.minimal_daily;
  const weatherMoodPool = WEATHER_ACCENT_MOODS[weatherBucket] || WEATHER_ACCENT_MOODS.mild;
  const district = resolveCityDistrictToken(resolvedCityDisplayLabel, lang);

  // Build a rich pool of distinct candidate titles for this outfit combo
  const candidates: string[] = [];
  const allMoods = [...styleMoodPool, ...weatherMoodPool];

  if (heroTag) {
    for (const mood of allMoods) {
      candidates.push(`${heroTag} · ${isEn ? mood.en : mood.ko}`);
    }
    if (accentTag) {
      candidates.push(
        isEn
          ? `${heroTag} & ${accentTag} Edit`
          : `${heroTag} × ${accentTag} 레이어드`
      );
      candidates.push(
        isEn
          ? `${district} ${heroTag} · ${accentTag}`
          : `${district} ${heroTag} · ${accentTag}`
      );
    }
    candidates.push(
      isEn
        ? `${district} ${heroTag} Look`
        : `${district} ${heroTag} 시그니처`
    );
  } else {
    for (const mood of allMoods) {
      const prefix =
        styleMode === 'stylized_isometric'
          ? isEn
            ? `${district} Studio`
            : `${district} 아틀리에`
          : district;
      candidates.push(`${prefix} · ${isEn ? mood.en : mood.ko}`);
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates.map((c) => c.trim()).filter(Boolean)));
  const seed = `${equippedIds}|${recPresetKey}|${effScenario}|${tempVal ?? 'na'}|${generationNonce}`;
  const baseIdx = hashStringDeterministic(seed) % Math.max(1, uniqueCandidates.length);
  const normalizedPrev = String(previousTitle || '').trim();

  let picked = uniqueCandidates[baseIdx] || (isEn ? 'Atelier Curated Look' : '아틀리에 큐레이션 코디');
  if (normalizedPrev && picked === normalizedPrev && uniqueCandidates.length > 1) {
    picked = uniqueCandidates[(baseIdx + 1) % uniqueCandidates.length];
  }

  return picked.length > 72 ? `${picked.slice(0, 69).trim()}...` : picked;
}
