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

export const CUTOUT_PIPELINE_VERSION = 'v6-true-3x2-rear-quarter-360';
export const LEGACY_CUTOUT_PIPELINE_VERSIONS = [
  'v5-gaze-aligned-fullbody-360',
  'v4-hole-aware-fullbody-360',
  'v3-clean-cutout-front45-ground',
] as const;
export const CUTOUT_STAGE_BACKDROP_HEX = '#94A3B8';

const COLLISION_SAFE_STUDIO_KEY_CANDIDATES = [
  '#94A3B8',
  '#7E9A86',
  '#9A8B7E',
  '#858FA8',
] as const;

function parseRgbFromHex(rawHex?: string | null): [number, number, number] | null {
  if (typeof rawHex !== 'string') return null;
  const clean = rawHex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      Number.parseInt(clean.slice(1, 3), 16),
      Number.parseInt(clean.slice(3, 5), 16),
      Number.parseInt(clean.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
    return [
      Number.parseInt(`${clean[1]}${clean[1]}`, 16),
      Number.parseInt(`${clean[2]}${clean[2]}`, 16),
      Number.parseInt(`${clean[3]}${clean[3]}`, 16),
    ];
  }
  return null;
}

/**
 * Selects a flat, shadowless studio key backdrop hex that maximizes RGB separation
 * from all equipped garment colors. Defaults to `#94A3B8` unless an equipped item is
 * visually close to `#94A3B8` (`ΔRGB < 42`).
 */
export function selectOptimalStudioKeyHex(
  equippedColorHexes?: Array<string | null | undefined>
): string {
  if (!Array.isArray(equippedColorHexes) || equippedColorHexes.length === 0) {
    return CUTOUT_STAGE_BACKDROP_HEX;
  }
  const parsedEquipped = equippedColorHexes
    .map((hex) => parseRgbFromHex(hex))
    .filter((rgb): rgb is [number, number, number] => Boolean(rgb));
  if (parsedEquipped.length === 0) {
    return CUTOUT_STAGE_BACKDROP_HEX;
  }

  const defaultRgb: [number, number, number] = [148, 163, 184];
  const minDistToDefault = Math.min(
    ...parsedEquipped.map(([r, g, b]) =>
      Math.hypot(r - defaultRgb[0], g - defaultRgb[1], b - defaultRgb[2])
    )
  );
  if (minDistToDefault >= 42) {
    return CUTOUT_STAGE_BACKDROP_HEX;
  }

  let bestHex: string = CUTOUT_STAGE_BACKDROP_HEX;
  let bestMinDist = minDistToDefault;
  for (const candidateHex of COLLISION_SAFE_STUDIO_KEY_CANDIDATES) {
    const cRgb = parseRgbFromHex(candidateHex);
    if (!cRgb) continue;
    const minDist = Math.min(
      ...parsedEquipped.map(([r, g, b]) =>
        Math.hypot(r - cRgb[0], g - cRgb[1], b - cRgb[2])
      )
    );
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestHex = candidateHex;
    }
  }
  return bestHex;
}

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

export function normalizeRawWeatherToContext(rawWeather?: unknown): WeatherContextInput {
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

  if (typeof rawWeather === 'object' && rawWeather !== null) {
    const rec = rawWeather as Record<string, unknown>;
    const explicitToken = String(rec.mode ?? rec.scenarioKey ?? rec.scenario ?? '');
    const explicitMode = mapScenarioTokenToWeatherMode(explicitToken);

    const tempMin = Number(rec.tempMin ?? rec.temperatureMin ?? NaN);
    const tempMax = Number(rec.tempMax ?? rec.temperatureMax ?? NaN);
    const directTemp = Number(rec.temperature ?? rec.avgTemp ?? rec.temp ?? NaN);
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

    const rawFeels = Number(rec.feelsLike ?? rec.apparentTemp ?? NaN);
    const windSpeed = Number(rec.windSpeed ?? 0);
    const feelsLike = Number.isFinite(rawFeels)
      ? rawFeels
      : temperature <= 5 && windSpeed >= 20
        ? Math.round(temperature - Math.min(8, windSpeed * 0.22))
        : undefined;

    const liveCondition = inferLiveConditionFromRaw(rec);

    if (explicitMode) {
      return {
        mode: explicitMode,
        temperature,
        feelsLike,
        liveCondition,
      };
    }

    // Direct flags when scenarioKey was omitted
    if (Boolean(rec.isSnowy) || Boolean(rec.isSnowing)) {
      return { mode: 'snow', temperature, feelsLike, liveCondition: 'snow' };
    }
    if (Boolean(rec.isRainy) || Boolean(rec.isRaining)) {
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

export function buildCutoutBackdropDirective(
  backdropHex: string = CUTOUT_STAGE_BACKDROP_HEX
): string {
  return `CRITICAL RGBA CUTOUT & ENCLOSED-HOLE BACKDROP RULE (MANDATORY): Render the ENTIRE background behind, beneath, AND inside every enclosed negative-space loop of the model (including underneath the open umbrella canopy between the shaft and head/shoulders, between bent arms and waist/torso, between legs/thighs/ankles, and inside bag handles/straps) as a 100% flat solid uniform chromakey-free studio backdrop (${backdropHex}), STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO shading/ambient occlusion inside arm-body or leg gaps, ZERO gradients, ZERO props, ZERO drop shadows, ZERO checkerboard pixels, and ZERO airborne rain/snow/mist/dust particles in the background air (all falling weather particles are rendered on a separate HTML5 Canvas foreground layer). Keep crisp, high-contrast edge separation between the ${backdropHex} backdrop and pure white garments/snow (#FFFFFF), skin tones, and black coats/hats (#111111).`;
}

export const CUTOUT_BACKDROP_DIRECTIVE = buildCutoutBackdropDirective(CUTOUT_STAGE_BACKDROP_HEX);

export const HORIZONTAL_FULL_BODY_CAMERA_LOCK =
  'CAMERA HEIGHT & FULL-BODY FRAMING LOCK (IDENTICAL ACROSS 0°, 45°, 90°, 135°, 180°, 225°): Eye-to-waist level, straight-on horizontal camera, zero tilt (NEVER high-angle looking down, NEVER low-angle, NEVER cropped at ankles/calves). Mandatory full-body shot from head to toe, filling ~82–85% of vertical frame height, shoes and feet completely visible on the floor with 8–10% bottom margin, consistent scale across all angles.';

export const CANONICAL_ANGLE_PROMPT_DIRECTIVES: Record<
  0 | 45 | 90 | 135 | 180 | 225,
  string
> = {
  0: 'Strict 0-degree direct front-facing full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; symmetrical frontal stance, full face looking straight ahead, entire front of outfit, and both shoes completely visible on the floor with 8–10% bottom margin.',
  45: "Strict FRONT-FACING 45-degree horizontal-yaw full-body view turned toward VIEWER'S RIGHT (SCREEN-RIGHT) at the EXACT SAME eye-to-waist level, straight-on horizontal camera, zero tilt, and identical focal length/distance as all other views (NEVER high-angle looking downward, NEVER crop feet or shoes). Full-body shot from head to toe, shoes and feet completely visible on the floor with 8–10% bottom margin, consistent scale across all angles. The model MUST turn 40–45 degrees to face toward the RIGHT side of the frame (VIEWER'S RIGHT) so the FACE, BOTH EYES, NOSE, CHIN, GAZE, FRONT CHEST/LAPELS, and front shoe toes angle clearly toward SCREEN-RIGHT (NEVER facing screen-left, NEVER show a back view).",
  90: "Strict 90-degree lateral side-profile full-body view facing toward VIEWER'S RIGHT (SCREEN-RIGHT). Eye-to-waist level, straight-on horizontal camera, zero tilt; model facing cleanly toward the RIGHT edge of the frame so the nose, eyes, chin, chest, and shoe toes point strictly to SCREEN-RIGHT (NEVER facing screen-left), with full garment side silhouette and full shoes completely visible on the floor with 8–10% bottom margin.",
  135: "Diagonal 135-degree BACK-RIGHT THREE-QUARTER REAR VIEW turned away toward BACK-RIGHT (VIEWER'S RIGHT / SCREEN-RIGHT — midway between 90° right profile and 180° straight back, MUST BE UNMISTAKABLY DISTINCT FROM 180° STRAIGHT BACK). Eye-to-waist level, straight-on horizontal camera, zero tilt. REQUIRED 3/4 REAR-RIGHT ANATOMY: (1) HEAD LOST-PROFILE: Show the back-left 2/3 of the head/hair PLUS the distinct RIGHT EAR and outer contour of the RIGHT CHEEKBONE, TEMPLE, and JAWLINE facing away toward SCREEN-RIGHT (NEVER a symmetrical 180° straight back of head, NEVER looking forward at camera); (2) DIAGONAL REAR TORSO & RIGHT SLEEVE: Show the rear back of the outfit rotated 45 degrees diagonally so the RIGHT SHOULDER and full outer length of the RIGHT ARM/SLEEVE sit prominently in the near right foreground while the far left shoulder recedes diagonally to the left (center back seam shifted left of center, NEVER dead-center vertical); (3) STAGGERED SHOES: Both shoes completely visible with 8–10% bottom margin in a diagonal rear-right stance where the RIGHT SHOE outer side & toe point away toward SCREEN-RIGHT.",
  180: 'Strict symmetrical 180-degree PURE STRAIGHT REAR BACK-FACING full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; model standing with perpendicular shoulders and their back 100% turned directly toward the camera (center-back seam/vent vertical down the exact center of the spine) showing ONLY the symmetrical back of the head/hair, nape/back collar, level back shoulders, full rear silhouette of the outfit, and straight rear heels of both shoes side-by-side with 8–10% bottom margin. [ABSOLUTE NEGATIVE CONSTRAINT ON 180° BACK: NEVER show front face, eyes, nose, lips, chin, side cheek/jaw contour, shoe toe side-profile, or front lapels; NEVER turn head over the shoulder].',
  225: "Diagonal 225-degree (-135°) BACK-LEFT THREE-QUARTER REAR VIEW turned away toward BACK-LEFT (VIEWER'S LEFT / SCREEN-LEFT — midway between -90° left profile and 180° straight back, MUST BE UNMISTAKABLY DISTINCT FROM 180° STRAIGHT BACK). Eye-to-waist level, straight-on horizontal camera, zero tilt. REQUIRED 3/4 REAR-LEFT ANATOMY: (1) HEAD LOST-PROFILE: Show the back-right 2/3 of the head/hair PLUS the distinct LEFT EAR and outer contour of the LEFT CHEEKBONE, TEMPLE, and JAWLINE facing away toward SCREEN-LEFT (NEVER a symmetrical 180° straight back of head, NEVER looking forward at camera); (2) DIAGONAL REAR TORSO & LEFT SLEEVE: Show the rear back of the outfit rotated 45 degrees diagonally toward SCREEN-LEFT so the LEFT SHOULDER and full outer length of the LEFT ARM/SLEEVE sit prominently in the near left foreground while the far right shoulder recedes diagonally to the right (center back seam shifted right of center; preserve exact anatomical left/right bag and watch placement without mirroring); (3) STAGGERED SHOES: Both shoes completely visible with 8–10% bottom margin in a diagonal rear-left stance where the LEFT SHOE outer side & toe point away toward SCREEN-LEFT.",
};

export function buildTurnaroundAnglePromptDirective(angleDeg: number): string {
  const normalized = (((Math.round(Number(angleDeg) / 45) * 45) % 360) + 360) % 360;
  if (normalized === 0) return CANONICAL_ANGLE_PROMPT_DIRECTIVES[0];
  if (normalized === 90 || normalized === 270) return CANONICAL_ANGLE_PROMPT_DIRECTIVES[90];
  if (normalized === 135) return CANONICAL_ANGLE_PROMPT_DIRECTIVES[135];
  if (normalized === 180) return CANONICAL_ANGLE_PROMPT_DIRECTIVES[180];
  if (normalized === 225) return CANONICAL_ANGLE_PROMPT_DIRECTIVES[225];
  return CANONICAL_ANGLE_PROMPT_DIRECTIVES[45];
}

export function buildTurnaround3x2SheetAngleDirectives(): string {
  return [
    `  * ${HORIZONTAL_FULL_BODY_CAMERA_LOCK}`,
    '  * STRICT 3x2 GRID TOPOLOGY: Arrange STRICTLY 3 EQUAL COLUMNS BY 2 EQUAL ROWS = EXACTLY 6 FIGURES TOTAL (EXACTLY 3 FIGURES ON THE TOP ROW AND EXACTLY 3 FIGURES ON THE BOTTOM ROW — NEVER 4 COLUMNS, NEVER 8 FIGURES).',
    `  * [Top-Left Panel (Row 1, Col 1) — 0° Direct Front Full-Body]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[0]}`,
    `  * [Top-Center Panel (Row 1, Col 2) — 45° Screen-Right Front-Quarter Full-Body (FACING VIEWER'S RIGHT)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[45]}`,
    `  * [Top-Right Panel (Row 1, Col 3) — 90° Screen-Right Side Profile Full-Body (FACING VIEWER'S RIGHT)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[90]}`,
    `  * [Bottom-Left Panel (Row 2, Col 1) — 135° Back-Right Three-Quarter Rear View (FACING AWAY TOWARD BACK-RIGHT / SCREEN-RIGHT)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[135]}`,
    `  * [Bottom-Center Panel (Row 2, Col 2) — 180° Strict Symmetrical Rear Back Full-Body (100% STRAIGHT BACK, ZERO FACE)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[180]}`,
    `  * [Bottom-Right Panel (Row 2, Col 3) — 225° Back-Left Three-Quarter Rear View (FACING AWAY TOWARD BACK-LEFT / SCREEN-LEFT)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[225]}`,
  ].join('\n');
}

export function buildTurnaround2x2SheetAngleDirectives(): string {
  return buildTurnaround3x2SheetAngleDirectives();
}

export function buildWeatherPosePromptDirectives(
  params:
    | EffectiveWeatherMode
    | {
        // oxlint-disable-next-line typescript/no-explicit-any
        weather?: any;
        hasEquippedUmbrella?: boolean;
        turnaroundSheet?: boolean;
        equippedColorHexes?: Array<string | null | undefined>;
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

  const backdropHex = selectOptimalStudioKeyHex(normalizedParams.equippedColorHexes);
  const activeBackdropDirective = buildCutoutBackdropDirective(backdropHex);

  let poseDirective = '';
  let physicalTraceDirective = '';
  let negativeDirective = '';

  switch (effectiveMode) {
    case 'rain': {
      poseDirective =
        'RAINY DAY POSE (MANDATORY WIDE-OPEN UMBRELLA OVERHEAD): The model MUST hold a WIDE-OPEN full-canopy umbrella high above their head with one hand, tilting the open umbrella canopy slightly backward (~15 degrees) so the model’s entire face, hairstyle, and full-body outfit remain 100% unobstructed, brightly illuminated, and clearly visible. Maintain generous 14% headroom clearance above the top dome/tip of the open umbrella and >=10% bottom margin below both shoes so neither the open umbrella canopy nor the feet are EVER cropped by the frame or quadrant boundary.';
      physicalTraceDirective =
        'RAIN PHYSICAL TRACE: Render realistic fine glistening rainwater droplets beaded across the top surface of the open umbrella canopy and a subtle water-repellent damp sheen on outerwear shoulders and sleeves.';
      negativeDirective =
        'STRICT RAIN NEGATIVE (NEVER closed/folded umbrella): NEVER hold a closed umbrella, NEVER hold a folded or rolled-up umbrella, NEVER use an umbrella as a walking cane/stick pointing downward, NEVER crop the top canopy of the umbrella or the bottom of the shoes, NEVER obscure or shadow the model’s face, NEVER fill the gap under the umbrella canopy around the shaft/shoulders with dark grey shadow (keep enclosed gaps flat #94A3B8), and NEVER draw falling rain streaks in the #94A3B8 background.';
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

  if (backdropHex !== CUTOUT_STAGE_BACKDROP_HEX) {
    negativeDirective = negativeDirective.replaceAll(CUTOUT_STAGE_BACKDROP_HEX, backdropHex);
  }

  const framingGuard = normalizedParams.turnaroundSheet
    ? `FRAME, FLOOR BASELINE & HEADROOM GUARD: Eye-to-waist level, straight-on horizontal camera, zero tilt across all 6 panels (3 columns x 2 rows). Full-body shot from head to toe, shoes and feet completely visible on the floor with 10% bottom margin, consistent scale across all angles (approx. 78–82% panel height) so both shoes AND any overhead open umbrella or winter hat sit 100% inside each panel surrounded by flat ${backdropHex} on all four sides.`
    : `FRAME, FLOOR BASELINE & HEADROOM GUARD: Eye-to-waist level, straight-on horizontal camera, zero tilt. Full-body shot from head to toe, shoes and feet completely visible on the floor with 10% bottom margin, consistent scale across all angles (approx. 80–84% frame height) surrounded by flat ${backdropHex}.`;

  const combinedPromptBlock = [
    `[EFFECTIVE WEATHER POSE & TRACE MODE: ${effectiveMode.toUpperCase()}]`,
    HORIZONTAL_FULL_BODY_CAMERA_LOCK,
    poseDirective,
    physicalTraceDirective,
    negativeDirective,
    framingGuard,
    activeBackdropDirective,
  ].join('\n');

  return {
    effectiveWeather: effectiveMode,
    poseDirective,
    physicalTraceDirective,
    negativeDirective,
    backdropDirective: activeBackdropDirective,
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
