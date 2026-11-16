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

export const CUTOUT_PIPELINE_VERSION = 'v9-solo-avatar-symmetric-shoes';
export const LEGACY_CUTOUT_PIPELINE_VERSIONS = [
  'v8-consistent-avatar-3x2-cyclorama',
  'v7-clean-6angle-cyclorama-360',
  'v6-true-3x2-rear-quarter-360',
  'v5-gaze-aligned-fullbody-360',
  'v4-hole-aware-fullbody-360',
  'v3-clean-cutout-front45-ground',
] as const;
export const CUTOUT_STAGE_BACKDROP_HEX = '#94A3B8';

export const COLLISION_SAFE_STUDIO_KEY_CANDIDATES = [
  '#94A3B8',
  '#5E9C7E',
  '#B38368',
  '#8E6F9E',
] as const;

export interface StudioKeySlotColorDescriptor {
  slot?: string | null;
  category?: string | null;
  colorHex?: string | null;
  color_hex?: string | null;
  colorName?: string | null;
  color_name?: string | null;
  color?: string | null;
  name?: string | null;
}

export type StudioKeyColorInput =
  | string
  | StudioKeySlotColorDescriptor
  | null
  | undefined;

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

const NAMED_STUDIO_COLLISION_COLOR_RULES: ReadonlyArray<{
  pattern: RegExp;
  rgb: [number, number, number];
  collidesWithCoolSlate: boolean;
}> = [
  {
    pattern: /블루그레이|슬레이트|blue[\s_-]*gr[ae]y|slate/i,
    rgb: [148, 163, 184],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /스카이\s*블루|sky\s*blue/i,
    rgb: [135, 182, 219],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /그레이|회색|애쉬|\bgr[ae]y\b|\bash\b/i,
    rgb: [156, 163, 175],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /실버|은색|\bsilver\b/i,
    rgb: [192, 198, 206],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /차콜|\bcharcoal\b/i,
    rgb: [64, 70, 78],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /화이트|흰색|백색|\bwhite\b/i,
    rgb: [246, 248, 250],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /아이보리|\bivory\b/i,
    rgb: [244, 241, 232],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /크림|\bcream\b/i,
    rgb: [242, 237, 224],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /오트밀|\boatmeal\b/i,
    rgb: [218, 210, 196],
    collidesWithCoolSlate: true,
  },
  {
    pattern: /세이지|그린|카키|올리브|민트|\bsage\b|\bgreen\b|\bkhaki\b|\bolive\b|\bmint\b|\bjade\b/i,
    rgb: [94, 156, 126],
    collidesWithCoolSlate: false,
  },
  {
    pattern: /테라코타|브라운|카멜|탄색|\bterracotta\b|\bochre\b|\bbrown\b|\bcamel\b|\btan\b/i,
    rgb: [179, 131, 104],
    collidesWithCoolSlate: false,
  },
  {
    pattern: /플럼|퍼플|보라|라벤더|모브|버건디|\bplum\b|\bmauve\b|\bpurple\b|\blavender\b|\bviolet\b|\bburgundy\b/i,
    rgb: [142, 111, 158],
    collidesWithCoolSlate: false,
  },
];

/**
 * Selects a flat, shadowless studio key backdrop hex that maximizes RGB & chromatic separation
 * from all equipped garment/footwear colors. Defaults to `#94A3B8` when `equippedColorInputs`
 * is empty/undefined or free of grey/white/cool-slate collisions (`ΔRGB >= 78`), and switches
 * to a chroma-safe muted studio backdrop (`#5E9C7E`, `#B38368`, `#8E6F9E`) whenever grey,
 * white, ivory, cream, oatmeal, silver, charcoal, or cool-slate items are equipped.
 */
export function selectOptimalStudioKeyHex(
  equippedColorInputs?: Array<StudioKeyColorInput>
): string {
  if (!Array.isArray(equippedColorInputs) || equippedColorInputs.length === 0) {
    return CUTOUT_STAGE_BACKDROP_HEX;
  }

  const parsedEquipped: Array<[number, number, number]> = [];
  let collidesWithCoolSlate = false;
  const defaultRgb: [number, number, number] = [148, 163, 184];

  for (const rawEntry of equippedColorInputs) {
    if (!rawEntry) continue;
    const isDescriptorObject = typeof rawEntry === 'object';
    const rawHexCandidate = isDescriptorObject
      ? rawEntry.colorHex ?? rawEntry.color_hex ?? rawEntry.color ?? null
      : rawEntry;
    const textTokens = isDescriptorObject
      ? [
          rawEntry.colorName,
          rawEntry.color_name,
          rawEntry.color,
          rawEntry.name,
          rawEntry.colorHex,
          rawEntry.color_hex,
        ]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join(' ')
      : rawEntry;

    // 1) Parse explicit #hex token (either exact string or embedded in text)
    const directRgb = parseRgbFromHex(rawHexCandidate);
    const embeddedHexMatch =
      !directRgb && typeof textTokens === 'string'
        ? textTokens.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/)
        : null;
    const hexRgb = directRgb ?? (embeddedHexMatch ? parseRgbFromHex(embeddedHexMatch[0]) : null);

    if (hexRgb) {
      parsedEquipped.push(hexRgb);
      const [r, g, b] = hexRgb;
      const distToDefault = Math.hypot(
        r - defaultRgb[0],
        g - defaultRgb[1],
        b - defaultRgb[2]
      );
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (distToDefault < 78) {
        collidesWithCoolSlate = true;
      } else if (sat <= 28 && lum >= 85 && (isDescriptorObject || lum < 254.5)) {
        // Low-saturation neutral/grey/white garments & shoes shade into #94A3B8 under studio AO.
        // Bare literal '#FFFFFF' string without slot metadata stays non-colliding for legacy hex-only callers.
        collidesWithCoolSlate = true;
      }
    }

    // 2) Parse Korean & English color names across all equipped slots (including shoes)
    if (typeof textTokens === 'string' && textTokens.trim().length > 0) {
      for (const rule of NAMED_STUDIO_COLLISION_COLOR_RULES) {
        if (rule.pattern.test(textTokens)) {
          parsedEquipped.push(rule.rgb);
          if (rule.collidesWithCoolSlate) {
            collidesWithCoolSlate = true;
          }
        }
      }
    }
  }

  if (parsedEquipped.length === 0 || !collidesWithCoolSlate) {
    return CUTOUT_STAGE_BACKDROP_HEX;
  }

  let bestHex: string = COLLISION_SAFE_STUDIO_KEY_CANDIDATES[1];
  let bestScore = -Infinity;

  for (const candidateHex of COLLISION_SAFE_STUDIO_KEY_CANDIDATES) {
    if (candidateHex === CUTOUT_STAGE_BACKDROP_HEX) continue;
    const cRgb = parseRgbFromHex(candidateHex);
    if (!cRgb) continue;
    const minDist = Math.min(
      ...parsedEquipped.map(([r, g, b]) =>
        Math.hypot(r - cRgb[0], g - cRgb[1], b - cRgb[2])
      )
    );
    // Prefer cool-green/mauve studio keys over warm terracotta when garment clearance is healthy
    // so human skin tones (R > G > B) maintain maximal chromatic separation during matting.
    const candidateIsWarmSkinAdjacent = cRgb[0] > cRgb[1] + 8 && cRgb[1] > cRgb[2] + 8;
    const skinSafetyBonus = candidateIsWarmSkinAdjacent ? 0 : 24;
    const score = minDist + (minDist >= 64 ? skinSafetyBonus : 0);
    if (score > bestScore) {
      bestScore = score;
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
  90: "Strict 90-degree PURE ORTHOGRAPHIC LATERAL SIDE-PROFILE full-body view facing straight toward VIEWER'S RIGHT (SCREEN-RIGHT ->). Camera is strictly perpendicular (90.0°) to the shoulder axis so left/right shoulders stack into ONE narrow side-view width (~50% of 0° front width). REQUIRED 90° SIDE ANATOMY: (1) EXACTLY ONE (1) RIGHT EYE in side view, crisp side bridge & tip of the nose protruding horizontally to SCREEN-RIGHT, lips/chin in pure side silhouette, and right ear centered on head; (2) SINGLE RIGHT ARM/SLEEVE centered vertically down the side of the torso dividing the FRONT CHEST/LAPEL edge on the right half from the upper back edge on the left half; (3) BOTH SHOES IN PURE HORIZONTAL SIDE PROFILE pointing straight to SCREEN-RIGHT with 8–10% bottom margin. [ABSOLUTE NEGATIVE ON 90° SIDE PROFILE: NEVER show both shoulders side-by-side, NEVER show the broad back of the coat or center-back vent/seam, NEVER rotate past 90° into a rear view!]",
  135: "Diagonal 135-degree BACK-RIGHT THREE-QUARTER REAR VIEW turned away toward BACK-RIGHT (VIEWER'S RIGHT / SCREEN-RIGHT ->, midway between 90° right profile and 180° straight back). Eye-to-waist horizontal camera, zero tilt, 8–10% bottom margin: show back-left 2/3 of head/hair PLUS distinct RIGHT EAR and outer RIGHT CHEEKBONE/JAWLINE lost-profile facing away toward SCREEN-RIGHT, diagonal rear back of outfit with RIGHT SHOULDER & outer RIGHT SLEEVE prominent in foreground, and staggered shoes pointing away toward SCREEN-RIGHT (distinct from both 90° side profile and 180° straight back).",
  180: 'Strict symmetrical 180-degree PURE STRAIGHT REAR BACK-FACING full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; model standing with perpendicular shoulders and their back 100% turned directly toward the camera (center-back seam/vent vertical down the exact center of the spine) showing ONLY the symmetrical back of the head/hair, nape/back collar, level back shoulders, full rear silhouette of the outfit, and straight rear heels of both shoes side-by-side with 8–10% bottom margin. [ABSOLUTE NEGATIVE CONSTRAINT ON 180° BACK: NEVER show front face, eyes, nose, lips, chin, side cheek/jaw contour, shoe toe side-profile, or front lapels; NEVER turn head over the shoulder].',
  225: "Diagonal 225-degree (-135°) BACK-LEFT THREE-QUARTER REAR VIEW turned away toward BACK-LEFT (VIEWER'S LEFT / SCREEN-LEFT <-, OPPOSITE DIRECTION OF 135°, midway between -90° left profile and 180° straight back). Eye-to-waist horizontal camera, zero tilt, 8–10% bottom margin: show back-right 2/3 of head/hair PLUS distinct LEFT EAR and outer LEFT CHEEKBONE/JAWLINE lost-profile facing away toward SCREEN-LEFT, diagonal rear back of outfit with LEFT SHOULDER & outer LEFT SLEEVE prominent on the left (preserving exact anatomical left/right bag and watch placement without mirroring), and staggered shoes pointing away toward SCREEN-LEFT <- (NEVER facing right!).",
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

export const SOLO_SINGLE_PERSON_PER_CELL_LOCK =
  'SOLO SINGLE PERSON PER CELL LOCK: Each of the 6 cells MUST contain strictly ONE single solo figure centered inside its cell with at least 20% empty solid backdrop gutter between adjacent cells; sleeves, coats, bags, and shoes MUST NEVER cross cell boundaries or overlap an adjacent pose; NEVER render twins or two people inside one cell.';

export const FOOTWEAR_PAIR_SYMMETRY_LOCK =
  'FOOTWEAR PAIR SYMMETRY LOCK (MANDATORY): Left shoe and right shoe MUST be an IDENTICAL MATCHED PAIR in the exact same upper color, material, tongue, laces, and sole on BOTH feet — NEVER mismatch left and right shoe colors (e.g. never one black shoe and one grey/white shoe).';

export function buildTurnaround3x2SheetAngleDirectives(): string {
  return [
    `  * ${HORIZONTAL_FULL_BODY_CAMERA_LOCK}`,
    `  * ${SOLO_SINGLE_PERSON_PER_CELL_LOCK}`,
    `  * ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
    '  * STRICT 3x2 UNDIVIDED GRID TOPOLOGY (ZERO GRID/DIVIDER LINES): Arrange STRICTLY 3 EQUAL COLUMNS BY 2 EQUAL ROWS = EXACTLY 6 FIGURES TOTAL on ONE continuous undivided solid background — STRICTLY ZERO white/grey/black vertical dividing lines, ZERO horizontal dividing lines, ZERO panel borders, ZERO frames!',
    '  * TOP ROW = FRONT & PURE 90° SIDE PROFILE ONLY (STRICTLY ZERO REAR VIEWS ON TOP ROW):',
    `    - [Top-Left (Row 1, Col 1) — 0° Direct Front]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[0]}`,
    `    - [Top-Center (Row 1, Col 2) — 45° Front-Right Quarter (FACING SCREEN-RIGHT ->)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[45]}`,
    `    - [Top-Right (Row 1, Col 3) — 90° PURE ORTHOGRAPHIC SIDE PROFILE (FACING SCREEN-RIGHT ->, 1 EYE, SIDE NOSE, ZERO BACK VENT)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[90]}`,
    '  * BOTTOM ROW = REAR-QUARTER & SYMMETRICAL BACK VIEWS:',
    `    - [Bottom-Left (Row 2, Col 1) — 135° Back-Right Rear-Quarter (FACING AWAY RIGHT ->)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[135]}`,
    `    - [Bottom-Center (Row 2, Col 2) — 180° Strict Symmetrical Straight Back (ZERO FACE)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[180]}`,
    `    - [Bottom-Right (Row 2, Col 3) — 225° Back-Left Rear-Quarter (FACING AWAY LEFT <-, OPPOSITE OF COL 1)]: ${CANONICAL_ANGLE_PROMPT_DIRECTIVES[225]}`,
  ].join('\n');
}

export function buildTurnaround2x2SheetAngleDirectives(): string {
  return buildTurnaround3x2SheetAngleDirectives();
}

export type CanonicalAvatarGender = 'male' | 'female' | 'unisex';

export interface CanonicalCharacterIdentityParams {
  heightCm?: number | null;
  weightKg?: number | null;
  gender?: CanonicalAvatarGender | string | null;
  framePreset?: string | null;
  bodyShape?: string | null;
  archetypePreset?: string | null;
  chestForm?: string | null;
  skinToneHex?: string | null;
  mstLevel?: number | null;
  mstUndertone?: string | null;
  personalColor?: string | null;
  hairStyle?: string | null;
  hairColorHex?: string | null;
  facialHair?: string | null;
  headShape?: string | null;
  eyeShape?: string | null;
  styleMode?: 'photorealistic' | 'stylized_isometric' | string | null;
  hasPortraitReference?: boolean;
}

export function normalizeCanonicalAvatarGender(
  rawGender?: unknown,
  framePreset?: unknown
): CanonicalAvatarGender {
  const token = String(rawGender ?? '')
    .trim()
    .toLowerCase();
  if (
    token === 'male' ||
    token === 'm' ||
    token === 'man' ||
    token === 'men' ||
    token === 'masculine' ||
    token === 'husband' ||
    token === '남성' ||
    token === '남'
  ) {
    return 'male';
  }
  if (
    token === 'female' ||
    token === 'f' ||
    token === 'woman' ||
    token === 'women' ||
    token === 'feminine' ||
    token === 'wife' ||
    token === '여성' ||
    token === '여'
  ) {
    return 'female';
  }
  if (token === 'unisex') {
    return 'unisex';
  }
  const frame = String(framePreset ?? '')
    .trim()
    .toLowerCase();
  if (frame === 'masculine') return 'male';
  if (frame === 'feminine') return 'female';
  return 'unisex';
}

function computeCanonicalAdultHeadRatio(heightCm: number): number {
  if (heightCm >= 170 && heightCm <= 182) {
    return 7.5;
  }
  if (heightCm < 170) {
    const scaled = 7.5 - (170 - heightCm) * 0.02;
    return Math.max(7.1, Math.min(7.5, Number(scaled.toFixed(1))));
  }
  const scaled = 7.5 + (heightCm - 182) * 0.021;
  return Math.max(7.5, Math.min(7.8, Number(scaled.toFixed(1))));
}

function buildCanonicalHairLockDirective(params: {
  gender: CanonicalAvatarGender;
  hairStyle: string;
  hairColorHex: string;
}): string {
  const { gender, hairStyle, hairColorHex } = params;
  const hs = hairStyle.trim().toLowerCase() || 'soft_wavy';

  if (gender === 'male') {
    if (hs.includes('long')) {
      return `HAIR LENGTH & SILHOUETTE LOCK (MALE LONG CUT, COLOR ${hairColorHex}): Men's intentional collar-to-shoulder straight long hair (${hairColorHex}) with identical length and parting across all views.`;
    }
    if (hs === 'buzz_shaved') {
      return `HAIR LENGTH & SILHOUETTE LOCK (MALE SHORT BUZZ, COLOR ${hairColorHex}): Men's clean ultra-short close-cropped buzz/shaved haircut (${hairColorHex}) strictly above the ears and shirt collar — NEVER shoulder-length hair or long flowing locks even in strong wind.`;
    }
    if (hs === 'type4_coily_afro') {
      return `HAIR LENGTH & SILHOUETTE LOCK (MALE SHORT COILY CROWN, COLOR ${hairColorHex}): Men's sculpted short-to-medium Type-4 coily Afro crown (${hairColorHex}) strictly above the shirt collar — NEVER shoulder-length straight/wavy hair or long flowing locks even in strong wind.`;
    }
    if (hs === 'hijab_headwrap') {
      return `HAIR & HEADWEAR LOCK (COLOR ${hairColorHex}): Clean structured headwrap (${hairColorHex}) neatly above the shirt collar.`;
    }
    return `HAIR LENGTH & SILHOUETTE LOCK (MALE SHORT CUT, COLOR ${hairColorHex}): Render men's clean short tapered ear-length haircut strictly above the shirt collar — NEVER shoulder-length hair or long flowing locks even in strong wind (subtle ${hs.replaceAll('_', ' ')} crown texture in exact ${hairColorHex}).`;
  }

  if (gender === 'female') {
    if (hs === 'buzz_shaved' || hs === 'pixie_short') {
      return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE SHORT PIXIE/BUZZ, COLOR ${hairColorHex}): Women's chic cropped short pixie/buzz haircut (${hairColorHex}) cleanly above the jawline and collar — NEVER shoulder-length or waist-length hair.`;
    }
    if (hs === 'straight_bob') {
      return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE CHIN-LENGTH BOB, COLOR ${hairColorHex}): Women's sleek jawline-to-chin length straight architectural bob (${hairColorHex}) strictly above the shoulders — NEVER long chest/waist-length locks.`;
    }
    if (hs.includes('long')) {
      return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE LONG CUT, COLOR ${hairColorHex}): Women's smooth chest-length long straight hair (${hairColorHex}) with identical length and volume across all angles.`;
    }
    if (hs === 'hijab_headwrap') {
      return `HAIR & HEADWRAP LOCK (FEMALE MODEST HIJAB, COLOR ${hairColorHex}): Women's neatly draped modest hijab headwrap (${hairColorHex}) framing the face cleanly.`;
    }
    if (hs === 'type4_coily_afro') {
      return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE COILY HALO, COLOR ${hairColorHex}): Women's sculptural rounded Type-4 coily Afro crown (${hairColorHex}) with consistent halo volume across all angles.`;
    }
    if (hs === 'box_braids_locs') {
      return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE BRAIDS/LOCS, COLOR ${hairColorHex}): Women's neat shoulder-grazing box braids / locs (${hairColorHex}) with consistent length across all angles.`;
    }
    return `HAIR LENGTH & SILHOUETTE LOCK (FEMALE MEDIUM CUT, COLOR ${hairColorHex}): Women's tailored collarbone-length medium ${hs.replaceAll('_', ' ')} hair (${hairColorHex}) with consistent length across all angles.`;
  }

  if (hs.includes('long')) {
    return `HAIR LENGTH & SILHOUETTE LOCK (UNISEX LONG CUT, COLOR ${hairColorHex}): Tailored shoulder-length straight hair (${hairColorHex}) with identical length across all angles.`;
  }
  if (hs === 'buzz_shaved' || hs === 'pixie_short') {
    return `HAIR LENGTH & SILHOUETTE LOCK (SHORT CROPPED CUT, COLOR ${hairColorHex}): Clean short tapered ear-length haircut (${hairColorHex}) strictly above the shirt collar — NEVER shoulder-length hair or long flowing locks.`;
  }
  return `HAIR LENGTH & SILHOUETTE LOCK (TAILORED COLLAR-CLEARING CUT, COLOR ${hairColorHex}): Clean modern collar-clearing ${hs.replaceAll('_', ' ')} haircut (${hairColorHex}) with consistent length across all angles — NEVER untamed waist-length locks.`;
}

export function buildCanonicalCharacterIdentityPromptBlock(
  params: CanonicalCharacterIdentityParams = {}
): string {
  const rawH = Number(params.heightCm);
  const rawW = Number(params.weightKg);
  const safeHeightCm = Number.isFinite(rawH) && rawH > 0 ? Math.max(100, Math.min(230, Math.round(rawH))) : 172;
  const safeWeightKg = Number.isFinite(rawW) && rawW > 0 ? Math.max(35, Math.min(160, Math.round(rawW))) : 64;
  const bmi = Number((safeWeightKg / (safeHeightCm / 100) ** 2).toFixed(1));
  const bmiStr = bmi.toFixed(1);
  const headRatio = computeCanonicalAdultHeadRatio(safeHeightCm);
  const headRatioStr = headRatio.toFixed(1);

  const gender = normalizeCanonicalAvatarGender(params.gender, params.framePreset);
  const skinHex =
    typeof params.skinToneHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(params.skinToneHex.trim())
      ? params.skinToneHex.trim().toUpperCase()
      : '#DFBA9B';
  const hairHex =
    typeof params.hairColorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(params.hairColorHex.trim())
      ? params.hairColorHex.trim().toUpperCase()
      : '#2B211B';
  const hairStyle = String(params.hairStyle || 'soft_wavy').trim() || 'soft_wavy';
  const bodyShape = String(params.bodyShape || 'standard_balanced').trim() || 'standard_balanced';
  const facialHair = String(params.facialHair || 'none').trim() || 'none';
  const isStylized = String(params.styleMode || 'stylized_isometric').trim().toLowerCase() !== 'photorealistic';

  let bmiBuildDescriptor: string;
  if (bmi < 18.8) {
    bmiBuildDescriptor = `${safeHeightCm}cm / ${safeWeightKg}kg = BMI ${bmiStr}: lean slender adult build, narrow waist and light limb volume, NEVER stocky/chubby chibi, NEVER bulky`;
  } else if (bmi < 21.0) {
    bmiBuildDescriptor = `${safeHeightCm}cm / ${safeWeightKg}kg = BMI ${bmiStr}: lithe trim-balanced adult build, clean shoulder-to-waist taper, NEVER stocky/chubby chibi, NEVER bulky`;
  } else if (bmi <= 24.2) {
    bmiBuildDescriptor = `${safeHeightCm}cm / ${safeWeightKg}kg = BMI ${bmiStr}: lean-balanced standard adult build, natural shoulder-to-waist taper, NEVER stocky/chubby chibi, NEVER overly thin or bodybuilder`;
  } else if (bmi < 27.5) {
    bmiBuildDescriptor = `${safeHeightCm}cm / ${safeWeightKg}kg = BMI ${bmiStr}: grounded athletic/solid mid-build adult frame (${bodyShape}), fuller chest and limb presence, NEVER stocky/chubby chibi and NEVER fashion-mannequin slimmed`;
  } else {
    bmiBuildDescriptor = `${safeHeightCm}cm / ${safeWeightKg}kg = BMI ${bmiStr}: dignified full-volume plus-build adult proportions across cheeks, neck, torso, and limbs, NEVER stocky short-legged chibi and NEVER fashion-mannequin slimmed`;
  }

  const genderPresentationLine =
    gender === 'male'
      ? `GENDER & ADULT SKELETAL LOCK: Explicit MALE adult presentation (gender=male, masculine shoulder/clavicle structure, straight adult male waist-to-pelvis line, adult male jawline, facialHair=${facialHair} — NEVER drift into female/androgynous presentation or juvenile boyish chibi proportions).`
      : gender === 'female'
        ? 'GENDER & ADULT SKELETAL LOCK: Explicit FEMALE adult presentation (gender=female, graceful adult feminine shoulder/waist/pelvis proportions and adult female facial bone structure — NEVER drift into juvenile chibi proportions).'
        : `GENDER & ADULT SKELETAL LOCK: Balanced modern adult presentation (gender=unisex, ${headRatioStr}-head adult proportions, facialHair=${facialHair} — NEVER drift into juvenile chibi proportions).`;

  const proportionLine = `ADULT CRANIAL-TO-BODY PROPORTION & BMI LOCK: Strictly ${headRatioStr} heads tall (${headRatioStr}-head adult fashion stature, full-length adult legs ~48% of total height) — ${bmiBuildDescriptor} (bodyShape=${bodyShape}, skinTone=${skinHex}${params.mstLevel ? `, MST-${params.mstLevel}` : ''}${params.mstUndertone ? `-${params.mstUndertone}` : ''}).`;

  const hairLockLine = buildCanonicalHairLockDirective({
    gender,
    hairStyle,
    hairColorHex: hairHex,
  });

  if (isStylized) {
    return [
      '[CANONICAL AINVENTORY CHARACTER IDENTITY, PROPORTION & ART-STYLE LOCK]',
      'UNIFIED AINVENTORY SIGNATURE 3D-STYLIZED AVATAR STYLE: Clean modern matte 3D-shaded stylized fashion mannequin character (smooth matte porcelain-vinyl skin shading with soft studio ambient occlusion, subtle refined facial features, calm neutral gaze, clean silhouette edges WITHOUT thick black comic marker outlines, authentic matte fabric weave on clothing).',
      'STRICT ART-STYLE & PROPORTION PROHIBITIONS: (1) NEVER render photorealistic human photography, real human skin pores, or real catalog model faces — DO NOT copy photographic realism from garment packshots onto the character\'s head/skin; (2) NEVER render chibi, super-deformed, 5-head/6-head short-legged cartoon figures, or thick black ink outlines; (3) NEVER render Western comic-book crosshatching or anime big-eye distortion.',
      proportionLine,
      genderPresentationLine,
      hairLockLine,
    ].join('\n');
  }

  return [
    '[CANONICAL AINVENTORY EDITORIAL MODEL IDENTITY & PROPORTION LOCK]',
    'PHOTOREALISTIC EDITORIAL STUDIO MODEL STYLE: Authentic SSENSE/COS medium-format 85mm studio fashion photography with natural human skin texture, lifelike facial bone structure, and true-to-life garment drape.',
    `STRICT PROPORTION PROHIBITIONS: Maintain ${headRatioStr} heads tall (${headRatioStr}-head adult proportions) — NEVER render chibi, cartoon/CGI plastic skin, or compressed short-legged figures.`,
    proportionLine,
    genderPresentationLine,
    hairLockLine,
  ].join('\n');
}

export function buildWeatherPosePromptDirectives(
  params:
    | EffectiveWeatherMode
    | {
        // oxlint-disable-next-line typescript/no-explicit-any
        weather?: any;
        hasEquippedUmbrella?: boolean;
        turnaroundSheet?: boolean;
        equippedColorHexes?: Array<StudioKeyColorInput>;
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
        'RAINY DAY POSE (MANDATORY WIDE-OPEN UMBRELLA OVERHEAD): The upright 7.5-head adult model MUST hold a WIDE-OPEN full-canopy umbrella high above their head with one hand, tilting the open umbrella canopy slightly backward (~15 degrees) so the model’s entire face, locked haircut length, and full-body 7.5-head outfit silhouette remain 100% unobstructed, brightly illuminated, and clearly visible. Maintain generous 14% headroom clearance above the top dome/tip of the open umbrella and >=10% bottom margin below both shoes so neither the open umbrella canopy nor the feet are EVER cropped by the frame or quadrant boundary.';
      physicalTraceDirective =
        'RAIN PHYSICAL TRACE: Render realistic fine glistening rainwater droplets beaded across the top surface of the open umbrella canopy and a subtle water-repellent damp sheen on outerwear shoulders and sleeves while keeping the locked haircut neat and short/defined.';
      negativeDirective =
        'STRICT RAIN NEGATIVE (NEVER closed/folded umbrella): NEVER hold a closed umbrella, NEVER hold a folded or rolled-up umbrella, NEVER use an umbrella as a walking cane/stick pointing downward, NEVER crop the top canopy of the umbrella or the bottom of the shoes, NEVER shrink into a short-legged chibi figure, NEVER obscure or shadow the model’s face, NEVER fill the gap under the umbrella canopy around the shaft/shoulders with dark grey shadow (keep enclosed gaps flat #94A3B8), and NEVER draw falling rain streaks in the #94A3B8 background.';
      break;
    }
    case 'coldwave': {
      poseDirective =
        'BITING SUB-ZERO COLDWAVE POSE (-10°C FREEZING ARCTIC WIND): Render an upright, poised 7.5-head adult winter stance — spine tall, neck elongated, and legs full-length with elbows drawn neatly close to the torso and hands tucked into coat pockets or clasping the coat lapels/muffler snugly at the chest for warmth (strictly preserve full 7.5-head adult stature — NEVER hunch, crouch, or compress the body into a stocky chibi figure).';
      physicalTraceDirective =
        'COLDWAVE SNOW & FROST TRACE (MANDATORY ON HAT & SHOULDERS): Render distinct white snow crystals and fine icy frost visibly accumulated on the crown/cuff/brim of the beanie or winter hat, along the upper folds of the scarf/muffler, and across both coat/puffer shoulders ("snow crystals and frost accumulated on beanie and shoulders"), plus a subtle natural cold-flushed rosiness on the cheeks and tip of the nose. Cool crisp 6500K winter key light.';
      negativeDirective =
        'STRICT COLDWAVE NEGATIVE: NEVER hunch shoulders up to the ears or compress into a stocky/chubby chibi silhouette, NEVER generate a warm relaxed indoor summer pose, NEVER leave the winter hat/beanie or coat shoulders completely clean and free of snow crystals/frost, and NEVER draw flying blizzard streaks across the #94A3B8 background.';
      break;
    }
    case 'snow': {
      poseDirective =
        'WINTER SNOWFALL POSE: Upright 7.5-head adult cozy winter lookbook full-body stance (such as one hand relaxed in the coat pocket or lightly resting near the scarf) with a calm gentle winter expression and generous head-to-toe framing.';
      physicalTraceDirective =
        'SNOW PHYSICAL TRACE (MANDATORY ON HAT & SHOULDERS): Render soft, fluffy white snow visibly settled and accumulated atop the hat/beanie/hair crown and across the upper coat shoulders and sleeve tops ("fluffy white snow settled on hat/hair and coat shoulders"). Soft 6000K winter daylight.';
      negativeDirective =
        'STRICT SNOW NEGATIVE: NEVER draw heavy falling snow streaks or airborne snowflakes in the #94A3B8 background air that would ruin clean background segmentation.';
      break;
    }
    case 'wind': {
      poseDirective =
        'STRONG WINDY GALE POSE: Upright 7.5-head adult wind-bracing editorial full-body stance — one hand lightly steadying the hat brim or coat lapel while maintaining tall, poised adult balance against a brisk lateral gust.';
      physicalTraceDirective =
        'WIND PHYSICAL TRACE: Render realistic lateral wind physics primarily across the coat hem, lapels, trousers, and muffler/scarf ends sweeping consistently to one side, with only subtle wind-tousled crown movement strictly within the character’s locked haircut length (keep short ear-length haircuts strictly short above the collar — NEVER grow shoulder-length or long billowing hair locks).';
      negativeDirective =
        'STRICT WIND NEGATIVE: NEVER lengthen short hair into shoulder-length or flowing locks, NEVER obscure the face with hair, NEVER hunch or shorten 7.5-head leg proportions, and NEVER draw dust clouds, flying leaves, or motion blur streaks in the #94A3B8 background.';
      break;
    }
    case 'heatwave': {
      poseDirective =
        'MIDSUMMER HEATWAVE POSE: Breezy, upright 7.5-head adult high-summer lookbook full-body stance, such as lightly shading the brow from bright overhead sunlight with one hand or a relaxed airy summer posture.';
      physicalTraceDirective =
        'HEATWAVE PHYSICAL TRACE: Bright crisp sunlit highlights (5200K) along the hair and shoulders, vibrant warm skin luminosity, and crisp airy summer fabric texture.';
      negativeDirective =
        'STRICT HEATWAVE NEGATIVE: NEVER draw lens flare circles, sun orbs, or outdoor scenery on the #94A3B8 background.';
      break;
    }
    case 'cloudy': {
      poseDirective =
        'OVERCAST CLOUDY POSE: Calm, upright 7.5-head adult editorial lookbook full-body stance with natural relaxed posture.';
      physicalTraceDirective =
        'CLOUDY PHYSICAL TRACE: Soft, wrap-around diffused overcast softbox illumination (5800K) with gentle tonal transitions that reveal authentic garment weave without harsh glare.';
      negativeDirective =
        'STRICT CLOUDY NEGATIVE: NEVER draw fog/clouds in the #94A3B8 background.';
      break;
    }
    case 'clear':
    default: {
      poseDirective =
        'CLEAR DAYLIGHT POSE: Confident, upright 7.5-head adult full-body studio stance with balanced natural posture and locked hairstyle silhouette.';
      physicalTraceDirective =
        'CLEAR DAYLIGHT PHYSICAL TRACE: Clean balanced 5400K studio daylight illumination showcasing accurate garment color, matte fabric weave, and crisp tailoring while strictly preserving the locked avatar skin shading style (NEVER drift into photorealistic catalog skin pores when in stylized character mode).';
      negativeDirective =
        'STRICT CLEAR NEGATIVE: NEVER drift into photorealistic catalog-photo skin/faces in stylized character mode, NEVER shrink into chibi proportions, and NEVER draw cast shadows or studio cyclorama gradients on the #94A3B8 background.';
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
    ...(normalizedParams.turnaroundSheet ? [SOLO_SINGLE_PERSON_PER_CELL_LOCK] : []),
    FOOTWEAR_PAIR_SYMMETRY_LOCK,
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
