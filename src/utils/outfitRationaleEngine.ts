import type {
  SelectedTpoPlace,
  StylingDensityPreference,
} from '../services/stylingPreferenceStore.ts';

export interface OutfitRationaleItem {
  key: 'tpo' | 'weather' | 'density' | 'color';
  label: string;
  summary: string;
}

export interface OutfitRationaleNote {
  headline: string;
  equippedCount: number;
  items: OutfitRationaleItem[];
}

const DENSITY_KO: Record<string, string> = {
  minimal: '미니멀',
  balanced: '밸런스',
  layered: '레이어드',
};

const DENSITY_EN: Record<string, string> = {
  minimal: 'Minimal',
  balanced: 'Balanced',
  layered: 'Layered',
};

function collectEquippedGarments(slots: Record<string, any> | null | undefined): Record<string, any>[] {
  if (!slots || typeof slots !== 'object') return [];
  const seen = new Set<string>();
  const out: Record<string, any>[] = [];
  for (const [k, g] of Object.entries(slots)) {
    if (!g || typeof g !== 'object') continue;
    if (k === 'underwear' || k === 'inner_top' || k === 'socks') continue;
    const key = String(g.id ?? `${k}:${g.name}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/**
 * Generates a deterministic 0ms stylist rationale note explaining WHY
 * the current outfit was composed (Place/TPO, Weather, Layering Density, Color/Skin Harmony).
 */
export function buildOutfitRationaleNote({
  slots,
  weather,
  selectedPlace,
  stylingPref,
  skinProfile,
  lang = 'ko',
}: {
  slots: Record<string, any> | null | undefined;
  weather?: Record<string, any> | null;
  selectedPlace?: SelectedTpoPlace | null;
  stylingPref?: StylingDensityPreference | null;
  skinProfile?: Record<string, any> | null;
  lang?: string;
}): OutfitRationaleNote {
  const equipped = collectEquippedGarments(slots);
  const count = equipped.length;
  const densityKey = stylingPref?.density || 'balanced';
  const densityLabel = lang === 'en' ? DENSITY_EN[densityKey] : DENSITY_KO[densityKey];

  const actualTemp =
    typeof weather?.currentTemp === 'number' && Number.isFinite(weather.currentTemp)
      ? Math.round(weather.currentTemp)
      : typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)
        ? Math.round(weather.avgTemp)
        : typeof weather?.tempMin === 'number' && typeof weather?.tempMax === 'number'
          ? Math.round((weather.tempMin + weather.tempMax) / 2)
          : null;
  const feelsLikeTemp =
    typeof weather?.feelsLikeTemp === 'number' && Number.isFinite(weather.feelsLikeTemp)
      ? Math.round(weather.feelsLikeTemp)
      : typeof weather?.feelsLikeMin === 'number' && typeof weather?.feelsLikeMax === 'number'
        ? Math.round((weather.feelsLikeMin + weather.feelsLikeMax) / 2)
        : null;
  const uvIndex =
    typeof weather?.uvIndex === 'number' && Number.isFinite(weather.uvIndex)
      ? Math.round(weather.uvIndex)
      : null;
  const primaryAlert = Array.isArray(weather?.alerts) && weather.alerts.length > 0
    ? weather.alerts[0]
    : null;
  const isRainy = Boolean(weather?.isRainy || weather?.isRaining);
  const isWindy = Boolean(weather?.isWindy);

  // 1. Place & TPO rationale
  const placeName = selectedPlace?.name || weather?.cityName || (lang === 'en' ? 'Daily' : '데일리');
  const tpoText = selectedPlace
    ? lang === 'en'
      ? `${selectedPlace.name} (${selectedPlace.tpoLabelEn}) — matched formality & silhouette to the destination.`
      : `${selectedPlace.name} · ${selectedPlace.tpoLabelKo} 분위기에 맞춰 실루엣과 포멀도를 조율했습니다.`
    : lang === 'en'
      ? `${placeName} daily schedule — balanced clean lines for versatile movement.`
      : `${placeName} 일정에 맞춰 부담 없이 소화할 수 있는 균형 잡힌 실루엣으로 구성했습니다.`;

  // 2. Weather rationale (Actual + Feels-Like + UV + Active Alert)
  const hasOuter = Boolean(slots?.outer || slots?.outer_mid);
  const feelsPartKo =
    feelsLikeTemp !== null && actualTemp !== null && feelsLikeTemp !== actualTemp
      ? `(체감 ${feelsLikeTemp}°C)`
      : feelsLikeTemp !== null && actualTemp === null
        ? `체감 ${feelsLikeTemp}°C`
        : '';
  const feelsPartEn =
    feelsLikeTemp !== null && actualTemp !== null && feelsLikeTemp !== actualTemp
      ? ` (feels like ${feelsLikeTemp}°C)`
      : feelsLikeTemp !== null && actualTemp === null
        ? `Feels like ${feelsLikeTemp}°C`
        : '';
  const uvPartKo = uvIndex !== null && uvIndex >= 6 ? ` · 자외선 높음(UV ${uvIndex})` : '';
  const uvPartEn = uvIndex !== null && uvIndex >= 6 ? ` · High UV (${uvIndex})` : '';
  const alertPartKo = primaryAlert?.title ? ` · ${primaryAlert.title} 보정 반영` : '';
  const alertPartEn = primaryAlert?.title ? ` · Adjusted for ${primaryAlert.title}` : '';

  const weatherSummary =
    actualTemp !== null || feelsLikeTemp !== null
      ? lang === 'en'
        ? `${actualTemp !== null ? `${actualTemp}°C` : ''}${feelsPartEn}${isRainy ? ' · Rain' : ''}${isWindy ? ' · Windy' : ''}${uvPartEn}${alertPartEn} — ${
            hasOuter
              ? 'outerwear selected based on feels-like thermal comfort.'
              : 'light breathable layering suited for mild feels-like temperatures.'
          }`
        : `${actualTemp !== null ? `${actualTemp}°C` : ''}${feelsPartKo}${isRainy ? ' · 강수' : ''}${isWindy ? ' · 바람' : ''}${uvPartKo}${alertPartKo} 기준에 맞춰 ${
            hasOuter
              ? '체감온도를 고려한 아우터와 두께감으로 보온·보호 기능을 챙겼습니다.'
              : '체감온도에 맞춰 답답하지 않은 가벼운 레이어로 쾌적하게 구성했습니다.'
          }`
      : lang === 'en'
        ? 'Adjusted fabric weight and coverage for comfortable indoor-outdoor transitions.'
        : '실내외 온도 차이를 고려해 쾌적한 두께감으로 조합했습니다.';

  // 3. Density & Accessories rationale
  const bagNote = stylingPref?.includeBag
    ? lang === 'en'
      ? 'Bag included'
      : '가방 포함'
    : lang === 'en'
      ? 'No bag'
      : '가방 제외';
  const accNote = stylingPref?.includeAccessory
    ? lang === 'en'
      ? 'Accessories on'
      : '액세서리 포함'
    : lang === 'en'
      ? 'Minimal accessories'
      : '액세서리 절제';
  const densitySummary =
    lang === 'en'
      ? `${densityLabel} density (${count} pcs · ${bagNote} · ${accNote}) applied to avoid over-layering.`
      : `${densityLabel} 밀도(${count}종 · ${bagNote} · ${accNote}) 설정을 반영해 불필요한 껴입기를 줄였습니다.`;

  // 4. Color & Skin Tone Harmony
  const colorNames = Array.from(
    new Set(
      equipped
        .map((g) => String(g.color_name || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
  const seasonLabel = String(
    skinProfile?.seasonLabel || skinProfile?.subType || skinProfile?.personalColor || ''
  ).trim();
  const colorSummary =
    lang === 'en'
      ? `${colorNames.length > 0 ? colorNames.join(' · ') : 'Neutral'} palette${
          seasonLabel ? ` harmonized with ${seasonLabel}` : ''
        } for clean visual balance.`
      : `${colorNames.length > 0 ? colorNames.join(' · ') : '뉴트럴'} 컬러 조합${
          seasonLabel ? `을 ${seasonLabel} 피부톤에 맞춰` : '으로'
        } 얼굴 톤이 또렷해 보이도록 배색했습니다.`;

  const shortPlace = selectedPlace
    ? `${selectedPlace.name} (${lang === 'en' ? selectedPlace.tpoLabelEn : selectedPlace.tpoLabelKo})`
    : lang === 'en'
      ? 'Daily Look'
      : '데일리 코디';
  const headlineTemp = feelsLikeTemp ?? actualTemp;
  const tempToken =
    actualTemp !== null && feelsLikeTemp !== null && feelsLikeTemp !== actualTemp
      ? lang === 'en'
        ? `${actualTemp}°C (Feels ${feelsLikeTemp}°C)`
        : `${actualTemp}°C(체감 ${feelsLikeTemp}°C)`
      : headlineTemp !== null
        ? `${headlineTemp}°C`
        : '';
  const headline =
    lang === 'en'
      ? [shortPlace, `${densityLabel} ${count} pcs`, tempToken].filter(Boolean).join(' · ')
      : [shortPlace, `${densityLabel} ${count}종`, tempToken ? `${tempToken} 대응` : '']
          .filter(Boolean)
          .join(' · ');

  return {
    headline,
    equippedCount: count,
    items: [
      {
        key: 'tpo',
        label: lang === 'en' ? 'Place · TPO' : '장소 · TPO',
        summary: tpoText,
      },
      {
        key: 'weather',
        label: lang === 'en' ? 'Temp · Weather' : '기온 · 날씨',
        summary: weatherSummary,
      },
      {
        key: 'density',
        label: lang === 'en' ? 'Layer Density' : '착장 밀도',
        summary: densitySummary,
      },
      {
        key: 'color',
        label: lang === 'en' ? 'Color · Tone' : '컬러 · 피부톤',
        summary: colorSummary,
      },
    ],
  };
}
