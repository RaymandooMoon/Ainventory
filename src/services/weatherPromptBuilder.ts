export type WeatherMode =
  | 'realtime'
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'wind'
  | 'heatwave'
  | 'coldwave';

export type EffectiveWeatherMode = Exclude<WeatherMode, 'realtime'>;

export interface WeatherContextInput {
  mode?: WeatherMode;
  selectedMode?: WeatherMode;
  temperature: number;
  feelsLike?: number;
  liveCondition?: EffectiveWeatherMode;
}

export const CUTOUT_PIPELINE_VERSION = 'v2-rgba-weather-pose';
export const CUTOUT_STAGE_BACKDROP_HEX = '#94A3B8';

export function resolveEffectiveWeather(
  input: WeatherContextInput
): EffectiveWeatherMode {
  const activeMode = input.mode ?? input.selectedMode ?? 'realtime';
  if (activeMode !== 'realtime') return activeMode;
  const feels = input.feelsLike ?? input.temperature;
  if (input.temperature <= -5 || feels <= -10) return 'coldwave';
  if (input.temperature >= 31 || feels >= 33) return 'heatwave';
  return input.liveCondition ?? 'clear';
}

function inferLiveConditionFromRaw(raw: Record<string, unknown>): EffectiveWeatherMode {
  if (raw.isSnowy || raw.isSnowing) return 'snow';
  if (raw.isRainy || raw.isRaining) return 'rain';

  const code = Number(raw.weatherCode ?? raw.code ?? NaN);
  if (Number.isFinite(code)) {
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (
      (code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82) ||
      (code >= 95 && code <= 99)
    ) {
      return 'rain';
    }
  }

  const condText = String(
    raw.condition || raw.conditionKo || raw.label || raw.mood || ''
  ).toLowerCase();

  if (condText.includes('한파') || condText.includes('강추위') || condText.includes('coldwave')) {
    return 'coldwave';
  }
  if (condText.includes('폭염') || condText.includes('열대야') || condText.includes('heatwave')) {
    return 'heatwave';
  }
  if (condText.includes('눈') || condText.includes('대설') || condText.includes('snow')) {
    return 'snow';
  }
  if (
    condText.includes('비') ||
    condText.includes('소나기') ||
    condText.includes('장마') ||
    condText.includes('우천') ||
    condText.includes('rain') ||
    condText.includes('shower') ||
    condText.includes('drizzle')
  ) {
    return 'rain';
  }

  const windSpeed = Number(raw.windSpeed ?? 0);
  if (
    raw.isWindy ||
    (Number.isFinite(windSpeed) && windSpeed >= 25) ||
    condText.includes('강풍') ||
    condText.includes('바람') ||
    condText.includes('wind') ||
    condText.includes('gale')
  ) {
    return 'wind';
  }

  const precipProb = Number(raw.precipProb ?? 0);
  if (Number.isFinite(precipProb) && precipProb >= 65) {
    return 'rain';
  }

  if (
    code === 3 ||
    code === 45 ||
    code === 48 ||
    condText.includes('흐림') ||
    condText.includes('안개') ||
    condText.includes('구름 많음') ||
    condText.includes('cloudy') ||
    condText.includes('overcast')
  ) {
    return 'cloudy';
  }

  return 'clear';
}

function mapScenarioTokenToWeatherMode(token: string): WeatherMode | null {
  const clean = token.trim().toLowerCase();
  if (!clean) return null;
  if (clean === 'live' || clean === 'realtime' || clean === '예보' || clean === '실시간') {
    return 'realtime';
  }
  if (
    clean === 'rain' ||
    clean === 'rainy' ||
    clean === 'rainy_cool' ||
    clean === '비'
  ) {
    return 'rain';
  }
  if (
    clean === 'coldwave' ||
    clean === 'cold' ||
    clean === 'winter_cold' ||
    clean === '한파'
  ) {
    return 'coldwave';
  }
  if (
    clean === 'snow' ||
    clean === 'snowy' ||
    clean === 'snowy_winter' ||
    clean === '눈'
  ) {
    return 'snow';
  }
  if (
    clean === 'wind' ||
    clean === 'windy' ||
    clean === 'windy_gale' ||
    clean === '강풍' ||
    clean === '바람'
  ) {
    return 'wind';
  }
  if (
    clean === 'heatwave' ||
    clean === 'hot' ||
    clean === 'summer_heatwave' ||
    clean === '폭염'
  ) {
    return 'heatwave';
  }
  if (
    clean === 'cloudy' ||
    clean === 'overcast' ||
    clean === 'cloudy_overcast' ||
    clean === '흐림'
  ) {
    return 'cloudy';
  }
  if (
    clean === 'clear' ||
    clean === 'sunny' ||
    clean === 'crisp_autumn' ||
    clean === 'warm_spring' ||
    clean === 'mild' ||
    clean === '맑음' ||
    clean === '포근'
  ) {
    return 'clear';
  }
  return null;
}

// oxlint-disable-next-line typescript/no-explicit-any
export function normalizeRawWeatherToContext(rawWeather?: any): WeatherContextInput {
  if (!rawWeather) {
    return { mode: 'clear', temperature: 16 };
  }

  if (typeof rawWeather === 'string') {
    const mapped = mapScenarioTokenToWeatherMode(rawWeather);
    if (mapped && mapped !== 'realtime') {
      const defaultTempByMode: Record<EffectiveWeatherMode, number> = {
        clear: 16,
        cloudy: 14,
        rain: 11,
        snow: -2,
        wind: 11,
        heatwave: 33,
        coldwave: -8,
      };
      return { mode: mapped, temperature: defaultTempByMode[mapped] };
    }
    const inferred = inferLiveConditionFromRaw({ condition: rawWeather });
    return { mode: 'realtime', temperature: 16, liveCondition: inferred };
  }

  if (typeof rawWeather === 'object') {
    const explicitToken = String(
      rawWeather.mode ?? rawWeather.scenarioKey ?? rawWeather.scenario ?? ''
    );
    const explicitMode = mapScenarioTokenToWeatherMode(explicitToken);

    const tempMin = Number(rawWeather.tempMin ?? rawWeather.temperatureMin ?? NaN);
    const tempMax = Number(rawWeather.tempMax ?? rawWeather.temperatureMax ?? NaN);
    const directTemp = Number(
      rawWeather.temperature ?? rawWeather.avgTemp ?? rawWeather.temp ?? NaN
    );
    const temperature = Number.isFinite(directTemp)
      ? directTemp
      : Number.isFinite(tempMin) && Number.isFinite(tempMax)
        ? // In cold/winter conditions, weight toward morning low so sub-zero coldwave triggers accurately
          tempMin <= -5
          ? tempMin
          : tempMax >= 31
            ? tempMax
            : Math.round((tempMin + tempMax) / 2)
        : Number.isFinite(tempMin)
          ? tempMin
          : Number.isFinite(tempMax)
            ? tempMax
            : 16;

    const rawFeels = Number(rawWeather.feelsLike ?? rawWeather.apparentTemp ?? NaN);
    const windSpeed = Number(rawWeather.windSpeed ?? 0);
    const feelsLike = Number.isFinite(rawFeels)
      ? rawFeels
      : temperature <= 5 && windSpeed >= 20
        ? Math.round(temperature - Math.min(8, windSpeed * 0.22))
        : undefined;

    const liveCondition = inferLiveConditionFromRaw(rawWeather as Record<string, unknown>);

    if (explicitMode) {
      return {
        mode: explicitMode,
        temperature,
        feelsLike,
        liveCondition,
      };
    }

    // Direct flags when scenarioKey was omitted
    if (rawWeather.isSnowy || rawWeather.isSnowing) {
      return { mode: 'snow', temperature, feelsLike, liveCondition: 'snow' };
    }
    if (rawWeather.isRainy || rawWeather.isRaining) {
      return { mode: 'rain', temperature, feelsLike, liveCondition: 'rain' };
    }

    return {
      mode: 'realtime',
      temperature,
      feelsLike,
      liveCondition,
    };
  }

  return { mode: 'clear', temperature: 16 };
}

// oxlint-disable-next-line typescript/no-explicit-any
export function resolveEffectiveWeatherFromRaw(rawWeather?: any): EffectiveWeatherMode {
  return resolveEffectiveWeather(normalizeRawWeatherToContext(rawWeather));
}

export interface WeatherPosePromptDirectives {
  effectiveWeather: EffectiveWeatherMode;
  poseDirective: string;
  physicalTraceDirective: string;
  negativeDirective: string;
  backdropDirective: string;
  headroomPrompt: string;
  combinedPrompt: string;
  combinedPromptBlock: string;
}

const CUTOUT_BACKDROP_DIRECTIVE =
  'CRITICAL RGBA CUTOUT BACKDROP RULE (MANDATORY): Render the ENTIRE background behind and beneath the model as a 100% flat, uniform, solid neutral mid-slate gray (#94A3B8, RGB 148,163,184) studio backdrop from edge to edge with ZERO gradients, ZERO horizon lines, ZERO props, ZERO cast floor shadows, ZERO drop shadows, ZERO vignette, ZERO checkerboard pixels, and ZERO airborne rain/snow/mist/dust particles in the background air (all falling weather particles are rendered on a separate HTML5 Canvas foreground layer). Keep crisp, high-contrast edge separation between the #94A3B8 backdrop and both pure white garments/snow (#FFFFFF) and black coats/hats (#111111).';

export function buildWeatherPosePromptDirectives(
  params:
    | EffectiveWeatherMode
    | {
        // oxlint-disable-next-line typescript/no-explicit-any
        weather?: any;
        hasEquippedUmbrella?: boolean;
        turnaroundSheet?: boolean;
      }
): WeatherPosePromptDirectives {
  const normalizedParams =
    typeof params === 'string'
      ? { weather: params, hasEquippedUmbrella: params === 'rain', turnaroundSheet: true }
      : params;

  const effectiveWeather = resolveEffectiveWeatherFromRaw(normalizedParams.weather);
  const effectiveMode: EffectiveWeatherMode =
    normalizedParams.hasEquippedUmbrella && effectiveWeather === 'clear'
      ? 'rain'
      : effectiveWeather;

  let poseDirective = '';
  let physicalTraceDirective = '';
  let negativeDirective = '';

  switch (effectiveMode) {
    case 'rain': {
      poseDirective =
        'RAINY DAY POSE (MANDATORY WIDE-OPEN UMBRELLA OVERHEAD): The model MUST hold a WIDE-OPEN full-canopy umbrella high above their head with one hand, tilting the open umbrella canopy slightly backward (~15 degrees) so the model’s entire face, hairstyle, and full-body outfit remain 100% unobstructed, brightly illuminated, and clearly visible. Maintain generous 14% headroom clearance above the top dome/tip of the open umbrella and full toe clearance at the bottom so the open umbrella canopy is NEVER cropped or cut off by the frame or quadrant boundary.';
      physicalTraceDirective =
        'RAIN PHYSICAL TRACE: Render realistic fine glistening rainwater droplets beaded across the top surface of the open umbrella canopy and a subtle water-repellent damp sheen on outerwear shoulders and sleeves.';
      negativeDirective =
        'STRICT RAIN NEGATIVE (NEVER closed/folded umbrella): NEVER hold a closed umbrella, NEVER hold a folded or rolled-up umbrella, NEVER use an umbrella as a walking cane/stick pointing downward, NEVER crop the top canopy of the umbrella, NEVER obscure or shadow the model’s face, and NEVER draw falling rain streaks in the #94A3B8 background.';
      break;
    }
    case 'coldwave': {
      poseDirective =
        'BITING SUB-ZERO COLDWAVE POSE (-10°C FREEZING ARCTIC WIND): Render an authentic cold-bracing winter stance — shoulders slightly hunched/drawn inward against freezing sub-zero wind, chin tucked slightly down toward the warm scarf/high coat collar, and hands tucked deeply into coat pockets or clasping the coat lapels/muffler snugly close to the chest for warmth.';
      physicalTraceDirective =
        'COLDWAVE SNOW & FROST TRACE (MANDATORY ON HAT & SHOULDERS): Render distinct white snow crystals and fine icy frost visibly accumulated on the crown/cuff/brim of the beanie or winter hat, along the upper folds of the scarf/muffler, and across both coat/puffer shoulders ("snow crystals and frost accumulated on beanie and shoulders"), plus a subtle natural cold-flushed rosiness on the cheeks and tip of the nose. Cool crisp 6500K winter key light.';
      negativeDirective =
        'STRICT COLDWAVE NEGATIVE: NEVER generate a warm relaxed indoor studio pose, NEVER leave the winter hat/beanie or coat shoulders completely clean and free of snow crystals/frost, and NEVER draw flying blizzard streaks across the #94A3B8 background.';
      break;
    }
    case 'snow': {
      poseDirective =
        'WINTER SNOWFALL POSE: Natural, cozy winter lookbook full-body stance (such as one hand relaxed in the coat pocket or lightly resting near the scarf) with a calm gentle winter expression and generous head-to-toe framing.';
      physicalTraceDirective =
        'SNOW PHYSICAL TRACE (MANDATORY ON HAT & SHOULDERS): Render soft, fluffy white snow visibly settled and accumulated atop the hat/beanie/hair crown and across the upper coat shoulders and sleeve tops ("fluffy white snow settled on hat/hair and coat shoulders"). Soft 6000K winter daylight.';
      negativeDirective =
        'STRICT SNOW NEGATIVE: NEVER draw heavy falling snow streaks or airborne snowflakes in the #94A3B8 background air that would ruin clean background segmentation.';
      break;
    }
    case 'wind': {
      poseDirective =
        'STRONG WINDY GALE POSE: Dynamic wind-bracing editorial full-body stance — one hand lightly steadying the hat brim, hair, or coat lapel while maintaining poised balance against a brisk lateral gust.';
      physicalTraceDirective =
        'WIND PHYSICAL TRACE: Render realistic lateral wind physics with the coat hem, muffler/scarf ends, and outer hair strands visibly billowing and sweeping consistently to one side.';
      negativeDirective =
        'STRICT WIND NEGATIVE: NEVER obscure the face with hair and NEVER draw dust clouds, flying leaves, or motion blur streaks in the #94A3B8 background.';
      break;
    }
    case 'heatwave': {
      poseDirective =
        'MIDSUMMER HEATWAVE POSE: Breezy, breathable high-summer lookbook full-body stance, such as lightly shading the brow from bright overhead sunlight with one hand or a relaxed airy summer posture.';
      physicalTraceDirective =
        'HEATWAVE PHYSICAL TRACE: Bright crisp sunlit highlights (5200K) along the hair and shoulders, vibrant warm skin luminosity, and crisp airy summer fabric texture.';
      negativeDirective =
        'STRICT HEATWAVE NEGATIVE: NEVER draw lens flare circles, sun orbs, or outdoor scenery on the #94A3B8 background.';
      break;
    }
    case 'cloudy': {
      poseDirective =
        'OVERCAST CLOUDY POSE: Calm, composed editorial lookbook full-body stance with natural relaxed posture.';
      physicalTraceDirective =
        'CLOUDY PHYSICAL TRACE: Soft, wrap-around diffused overcast softbox illumination (5800K) with gentle tonal transitions that reveal authentic garment weave without harsh glare.';
      negativeDirective =
        'STRICT CLOUDY NEGATIVE: NEVER draw fog/clouds in the #94A3B8 background.';
      break;
    }
    case 'clear':
    default: {
      poseDirective =
        'CLEAR DAYLIGHT POSE: Confident, clean full-body editorial lookbook stance with natural posture.';
      physicalTraceDirective =
        'CLEAR DAYLIGHT PHYSICAL TRACE: Crisp natural daylight illumination (5400K) showcasing true-to-life garment color, silhouette, and fabric drape.';
      negativeDirective =
        'STRICT CLEAR NEGATIVE: NEVER draw cast shadows or studio cyclorama gradients on the #94A3B8 background.';
      break;
    }
  }

  const framingGuard = normalizedParams.turnaroundSheet
    ? 'FRAME & HEADROOM GUARD: Inside each quadrant of the 2x2 turnaround sheet, scale the full-body figure slightly compactly (approx. 78–84% quadrant height) so the feet AND any overhead open umbrella or winter hat have generous flat #94A3B8 margin on all four sides.'
    : 'FRAME & HEADROOM GUARD: Scale the full-body figure with generous head-to-toe margin (approx. 80–85% frame height) so the shoes AND any overhead open umbrella or winter hat are 100% inside the frame surrounded by flat #94A3B8.';

  const combinedPromptBlock = [
    `[EFFECTIVE WEATHER POSE & TRACE MODE: ${effectiveMode.toUpperCase()}]`,
    poseDirective,
    physicalTraceDirective,
    negativeDirective,
    framingGuard,
    CUTOUT_BACKDROP_DIRECTIVE,
  ].join('\n');

  return {
    effectiveWeather: effectiveMode,
    poseDirective,
    physicalTraceDirective,
    negativeDirective,
    backdropDirective: CUTOUT_BACKDROP_DIRECTIVE,
    headroomPrompt: framingGuard,
    combinedPrompt: combinedPromptBlock,
    combinedPromptBlock,
  };
}

export interface WeatherStageBadgeMeta {
  effectiveWeather: EffectiveWeatherMode;
  curationLabel: string;
  weatherLabel: string;
  tempText: string;
  fullText: string;
}

export function getWeatherStageBadgeMeta(
  // oxlint-disable-next-line typescript/no-explicit-any
  rawWeather: any,
  lang: 'ko' | 'en' = 'ko'
): WeatherStageBadgeMeta {
  const ctx = normalizeRawWeatherToContext(rawWeather);
  const effectiveWeather = resolveEffectiveWeather(ctx);
  const isEn = lang === 'en';

  const labels: Record<
    EffectiveWeatherMode,
    { koCuration: string; koWeather: string; enCuration: string; enWeather: string }
  > = {
    rain: {
      koCuration: '비 · 우산 코디',
      koWeather: '비',
      enCuration: 'Rain · Umbrella Look',
      enWeather: 'Rain',
    },
    coldwave: {
      koCuration: '한파 · 방한 코디',
      koWeather: '한파',
      enCuration: 'Coldwave · Arctic Look',
      enWeather: 'Coldwave',
    },
    snow: {
      koCuration: '눈 · 윈터 코디',
      koWeather: '눈',
      enCuration: 'Snow · Winter Look',
      enWeather: 'Snow',
    },
    wind: {
      koCuration: '강풍 · 방풍 코디',
      koWeather: '바람',
      enCuration: 'Wind · Windproof Look',
      enWeather: 'Windy',
    },
    heatwave: {
      koCuration: '폭염 · 쿨링 코디',
      koWeather: '폭염',
      enCuration: 'Heatwave · Resort Look',
      enWeather: 'Heatwave',
    },
    cloudy: {
      koCuration: '흐림 · 데일리 코디',
      koWeather: '흐림',
      enCuration: 'Cloudy · Daily Look',
      enWeather: 'Cloudy',
    },
    clear: {
      koCuration: '맑음 · 데일리 코디',
      koWeather: '맑음',
      enCuration: 'Clear · Daylight Look',
      enWeather: 'Clear',
    },
  };

  const entry = labels[effectiveWeather] || labels.clear;
  const tMin = Number(rawWeather?.tempMin);
  const tMax = Number(rawWeather?.tempMax);
  const tempText =
    Number.isFinite(tMin) && Number.isFinite(tMax)
      ? `${Math.round(tMin)}°/${Math.round(tMax)}°`
      : `${Math.round(ctx.temperature)}°`;

  const curationLabel = isEn ? entry.enCuration : entry.koCuration;
  const weatherLabel = isEn ? entry.enWeather : entry.koWeather;

  return {
    effectiveWeather,
    curationLabel,
    weatherLabel,
    tempText,
    fullText: `${curationLabel} | ${weatherLabel} ${tempText}`,
  };
}
