import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import db, {
  DATA_DIR,
  ROOT_DIR,
  UPLOADS_DIR,
  getServerProfileConfig,
} from './db.js';
import { getServerGeminiApiKey, getServerGeminiClient } from './geminiClient.js';
import {
  FOOTWEAR_PAIR_SYMMETRY_LOCK,
  SOLO_SINGLE_PERSON_PER_CELL_LOCK,
  buildCanonicalCharacterIdentityPromptBlock,
  normalizeCanonicalAvatarGender,
  selectOptimalStudioKeyHex,
} from '../src/services/weatherPromptBuilder.ts';
import {
  computeBagAssetPlacementBox,
  isBagGarmentItem,
  normalizeHandedness,
  resolveBagCarryAnatomy,
} from '../src/services/vtonQualityControl.ts';
import { inferBagCarrySpec } from '../src/shared/garmentTaxonomy.js';

export const VTON_MODE = '2d-vton';
export const VTON_STYLE_PRESET = 'photorealistic';
export const VALID_VTON_STYLE_MODES = new Set(['photorealistic', 'stylized_isometric']);
export const TURNAROUND_ANGLES = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);
const LEGACY_SHEET_6_ANGLES = Object.freeze([0, 45, 90, 135, 180, 225]);
export const VTON_CACHE_DIR = path.join(DATA_DIR, 'vton-cache');
export const SEED_DIR = path.join(ROOT_DIR, 'public', 'seed');

export const VTON_SLOTS = Object.freeze([
  'outer',
  'outer_mid',
  'top',
  'top_mid',
  'onepiece',
  'dress',
  'bottom',
  'shoes',
  'accessory',
  'acc_umbrella',
  'acc_belt',
  'acc_head',
  'acc_eyes',
  'acc_neck',
  'acc_hand_left',
  'acc_hand_right',
  'acc_wrist_left',
  'acc_wrist_right',
  'jwl_neck',
  'jwl_ear_left',
  'jwl_ear_right',
  'jwl_wrist_left',
  'jwl_wrist_right',
  'jwl_ring_left',
  'jwl_ring_right',
  'jwl_brooch',
  'headwear',
  'neckwear',
  'gloves',
  'socks',
]);

const VTON_SLOT_SET = new Set(VTON_SLOTS);

export const ALL_ISO_VIEW_ANGLES = Object.freeze([45, 0, -45, -90, -135, 180, 135, 90]);
export const DEFAULT_ISO_VIEW_ANGLE = 0;

// Layering order for prompt clarity (from head/inner to outer/extremities/jewelry)
const PROMPT_SLOT_ORDER = Object.freeze([
  'headwear',
  'acc_head',
  'acc_eyes',
  'jwl_ear_left',
  'jwl_ear_right',
  'onepiece',
  'top',
  'top_mid',
  'dress',
  'acc_belt',
  'bottom',
  'outer_mid',
  'outer',
  'jwl_brooch',
  'neckwear',
  'acc_neck',
  'jwl_neck',
  'acc_wrist_left',
  'acc_wrist_right',
  'jwl_wrist_left',
  'jwl_wrist_right',
  'gloves',
  'acc_hand_left',
  'acc_hand_right',
  'jwl_ring_left',
  'jwl_ring_right',
  'socks',
  'shoes',
  'accessory',
  'acc_umbrella',
]);

const ANATOMICAL_SLOT_PLACEMENT_DIRECTIVES = Object.freeze({
  top: 'worn as the innermost base top over the torso (collar/cuffs peeking cleanly beneath any mid-layer or outerwear)',
  top_mid:
    'worn as the 2nd mid-layer cardigan or tailored vest/knit cleanly OVER [TOP] and UNDER [OUTER_MID]/[OUTER]',
  outer_mid:
    'worn as the 3rd mid-outerwear blazer/blouson/jacket cleanly OVER [TOP]/[TOP_MID] (and beneath [OUTER] coat if also equipped)',
  outer:
    'worn as the outermost overcoat/trench/padding cleanly OVER all inner [TOP], [TOP_MID], and [OUTER_MID] layers',
  shoes: `worn cleanly on BOTH feet with full soles visible on the floor. ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
  accessory: 'carried naturally in hand or slung cleanly over the shoulder',
  acc_umbrella:
    'WIDE-OPEN full-canopy umbrella held high above the model’s head with one hand and tilted ~15° backward so the entire face, hairstyle, and full-body outfit remain 100% unobstructed and brightly lit (NEVER hold a closed, folded, or rolled-up umbrella; keep >=14% headroom clearance above the open canopy top)',
  acc_belt: 'threaded neatly through the waist belt loops at the natural waistline',
  acc_head: 'worn naturally atop the crown of the head',
  acc_eyes: 'worn cleanly across the bridge of the nose and eyes',
  acc_neck: 'draped or tied neatly around the neck and collar',
  acc_hand_left:
    'worn specifically on the model’s LEFT hand ONLY (respecting left/right glove asymmetry if a different glove or bare hand is on the right)',
  acc_hand_right:
    'worn specifically on the model’s RIGHT hand ONLY (respecting left/right glove asymmetry if a different glove or bare hand is on the left)',
  acc_wrist_left:
    'strapped specifically around the model’s LEFT wrist (allowing a different watch or bracelet on the right wrist)',
  acc_wrist_right:
    'strapped specifically around the model’s RIGHT wrist (allowing a different watch or bracelet on the left wrist)',
  jwl_neck: 'resting naturally along the collarbone and neckline',
  jwl_ear_left: 'worn specifically on the model’s LEFT earlobe/helix',
  jwl_ear_right: 'worn specifically on the model’s RIGHT earlobe/helix',
  jwl_wrist_left: 'worn specifically around the model’s LEFT wrist',
  jwl_wrist_right: 'worn specifically around the model’s RIGHT wrist',
  jwl_ring_left: 'worn specifically on a finger of the model’s LEFT hand',
  jwl_ring_right: 'worn specifically on a finger of the model’s RIGHT hand',
  jwl_brooch: 'pinned cleanly onto the left chest lapel or upper bodice',
});

const SLOT_ALIAS_MAP = Object.freeze({
  coat: 'outer',
  jacket: 'outer',
  outerwear: 'outer',
  blazer: 'outer',
  mid_outer: 'outer_mid',
  outermid: 'outer_mid',
  mid_top: 'top_mid',
  topmid: 'top_mid',
  shirt: 'top',
  knit: 'top',
  upper: 'top',
  swimwear: 'onepiece',
  swimsuit: 'onepiece',
  bikini: 'onepiece',
  rashguard: 'onepiece',
  swim_trunks: 'onepiece',
  jumpsuit: 'onepiece',
  gown: 'onepiece',
  skirt: 'bottom',
  pants: 'bottom',
  trousers: 'bottom',
  lower: 'bottom',
  footwear: 'shoes',
  sneakers: 'shoes',
  bag: 'accessory',
  bags: 'accessory',
  acc: 'accessory',
  umbrella: 'acc_umbrella',
  parasol: 'acc_umbrella',
  belt: 'acc_belt',
  eyewear: 'acc_eyes',
  sunglasses: 'acc_eyes',
  glasses: 'acc_eyes',
  watch: 'acc_wrist_left',
  jewelry: 'jwl_neck',
  necklace: 'jwl_neck',
  earring: 'jwl_ear_left',
  bracelet: 'jwl_wrist_left',
  ring: 'jwl_ring_left',
  brooch: 'jwl_brooch',
  hat: 'headwear',
  cap: 'headwear',
  scarf: 'neckwear',
  muffler: 'neckwear',
  tie: 'neckwear',
  glove: 'gloves',
  sock: 'socks',
  legwear: 'socks',
});

const VALID_PERSONAL_COLORS = new Set([
  'spring_warm',
  'summer_cool',
  'autumn_warm',
  'winter_cool',
]);

const VALID_BODY_SHAPES = new Set([
  'slim',
  'standard_balanced',
  'upper_developed',
  'lower_developed',
  'muscular',
]);

const VALID_FRAME_PRESETS = new Set(['feminine', 'masculine', 'androgynous', 'custom']);
const VALID_ARCHETYPES = new Set([
  'hourglass',
  'inverted_triangle',
  'pear',
  'apple',
  'rectangle',
  'athletic',
  'petite',
  'plus_size',
]);
const VALID_CHEST_FORMS = new Set(['flat', 'pectoral', 'contoured', 'full_bust']);
const VALID_UNDERTONES = new Set(['cool', 'neutral', 'warm', 'olive']);
const VALID_HAIR_STYLES = new Set([
  'buzz_shaved',
  'pixie_short',
  'straight_bob',
  'long_straight',
  'soft_wavy',
  'loose_curly',
  'type4_coily_afro',
  'box_braids_locs',
  'hijab_headwrap',
]);
const VALID_FACIAL_HAIR = new Set([
  'none',
  'stubble',
  'mustache',
  'goatee',
  'short_boxed_beard',
  'full_beard',
]);
const VALID_HEAD_SHAPES = new Set(['oval', 'round', 'square', 'heart', 'long']);
const VALID_EYE_SHAPES = new Set([
  'almond',
  'monolid',
  'hooded',
  'deep_set',
  'upturned',
  'round',
]);

const DEFAULT_SCALES_BY_SHAPE = Object.freeze({
  slim: { shoulderScale: 0.94, waistScale: 0.88, hipScale: 0.94 },
  standard_balanced: { shoulderScale: 1.0, waistScale: 1.0, hipScale: 1.0 },
  upper_developed: { shoulderScale: 1.1, waistScale: 0.97, hipScale: 0.97 },
  lower_developed: { shoulderScale: 0.96, waistScale: 0.98, hipScale: 1.09 },
  muscular: { shoulderScale: 1.12, waistScale: 0.94, hipScale: 1.02 },
});

const PERSONAL_COLOR_DESCRIPTIONS = Object.freeze({
  spring_warm: 'warm golden-ivory luminous undertone (Spring Warm palette harmony)',
  summer_cool: 'soft rose-neutral cool muted undertone (Summer Cool palette harmony)',
  autumn_warm: 'calm warm beige-ochre rich undertone (Autumn Warm palette harmony)',
  winter_cool: 'crisp neutral-cool clear high-contrast undertone (Winter Cool palette harmony)',
});

const BODY_SHAPE_DESCRIPTIONS = Object.freeze({
  slim: 'lean, slender vertical frame with narrow waist and light limb volume',
  standard_balanced: 'balanced, natural classic editorial proportions across shoulders, waist, and hips',
  upper_developed: 'structured broader shoulder line tapering cleanly toward a neat waist and straight hip line',
  lower_developed: 'relaxed narrower shoulder line with fuller grounded hip and thigh silhouette',
  muscular: 'athletic toned frame with defined shoulder structure, firm torso, and tapered waist',
});

const MAX_PACKSHOT_FILE_BYTES = 4 * 1024 * 1024; // 4MB max for disk garment packshots
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024; // 5MB max for inline data URLs
const GEMINI_TIMEOUT_MS = 60000;
const MAX_TOTAL_SYNTHESIS_MS = 110000;
const MAX_MEM_CACHE = 32;
const MAX_DISK_CACHE = 120;
const CACHE_SCHEMA_VERSION = 'v16-8angle-norm-bagstrap';
const CUTOUT_STAGE_HEX = '#94A3B8';

const SAFE_BASENAME_RE = /^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/;
const SAFE_SEED_REL_RE = /^(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/;
const SAFE_CACHE_KEY_RE = /^(combo|base)-[0-9a-f]{64}$/;

/** @type {Map<string, { cacheKey: string, kind: 'combo' | 'base', model: string, dataUrl: string, createdAt: number, lastAccessedAt: number }>} */
const memCache = new Map();

/** @type {Map<string, Promise<object>>} */
const inFlightSyntheses = new Map();

let diskCacheReady = false;

function ensureDiskCacheDir() {
  if (diskCacheReady) return true;
  try {
    fs.mkdirSync(VTON_CACHE_DIR, { recursive: true });
    diskCacheReady = true;
    return true;
  } catch {
    return false;
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function roundToStep(value, step = 0.01) {
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

export function normalizeVtonStyleMode(rawStyle) {
  const cleaned = String(rawStyle || '')
    .trim()
    .toLowerCase();
  if (
    cleaned === 'stylized_isometric' ||
    cleaned === 'stylized-isometric' ||
    cleaned === 'stylized' ||
    cleaned === 'isometric' ||
    cleaned === 'character'
  ) {
    return 'stylized_isometric';
  }
  return 'photorealistic';
}

const WEATHER_POSE_DIRECTIVES = Object.freeze({
  rain: {
    key: 'rainy',
    effectiveWeather: 'rain',
    description:
      'cool overcast rainy-day editorial softbox illumination (6200K) with fine rainwater droplets beaded atop the open umbrella canopy and a subtle damp water-repellent sheen on outerwear shoulders',
    poseBlock: [
      'RAINY DAY POSE (MANDATORY WIDE-OPEN UMBRELLA OVERHEAD): The upright 7.5-head adult model MUST hold a WIDE-OPEN full-canopy umbrella high above their head with one hand, tilting the open umbrella canopy slightly backward (~15 degrees) so the model’s entire face, locked haircut length, and full-body 7.5-head outfit remain 100% unobstructed, brightly illuminated, and clearly visible. Maintain >=14% headroom clearance above the top dome/tip of the open umbrella so the open umbrella is NEVER cropped.',
      'RAIN PHYSICAL TRACE: Render realistic fine glistening rainwater droplets beaded across the top surface of the open umbrella canopy and a subtle water-repellent damp sheen on outerwear shoulders and sleeves while keeping the locked haircut neat.',
      'STRICT RAIN NEGATIVE: NEVER hold a closed umbrella, NEVER hold a folded or rolled-up umbrella, NEVER use an umbrella as a walking cane/stick pointing downward, NEVER shrink into a short-legged chibi figure, NEVER shadow/obscure the face, and NEVER draw falling rain streaks in the #94A3B8 background.',
    ].join('\n'),
  },
  coldwave: {
    key: 'cold',
    effectiveWeather: 'coldwave',
    description:
      'crisp sub-zero (-10°C) winter key lighting (6500K) with natural cold-flushed cheeks/nose tip and visible white snow crystals and icy frost accumulated on winter hat/beanie and coat shoulders',
    poseBlock: [
      'BITING SUB-ZERO COLDWAVE POSE (-10°C FREEZING ARCTIC WIND): Render an upright, poised 7.5-head adult winter stance — spine tall, neck elongated, and legs full-length with elbows drawn neatly close to the torso and hands tucked into coat pockets or clasping the coat lapels/muffler snugly close to the chest for warmth (strictly preserve full 7.5-head adult stature — NEVER hunch, crouch, or compress into a stocky chibi figure).',
      'COLDWAVE SNOW & FROST TRACE (MANDATORY ON HAT & SHOULDERS): Render distinct white snow crystals and fine icy frost visibly accumulated on the crown/cuff/brim of the beanie or winter hat, along the upper folds of the scarf/muffler, and across both coat/puffer shoulders ("snow crystals and frost accumulated on beanie and shoulders"), plus a subtle natural cold-flushed rosiness on the cheeks and tip of the nose.',
      'STRICT COLDWAVE NEGATIVE: NEVER hunch shoulders up to the ears or compress into a stocky/chubby chibi silhouette, NEVER generate a warm relaxed indoor studio pose, NEVER leave the winter hat/beanie or coat shoulders completely clean and free of snow crystals/frost, and NEVER draw flying blizzard streaks across the #94A3B8 background.',
    ].join('\n'),
  },
  snow: {
    key: 'snowy',
    effectiveWeather: 'snow',
    description:
      'soft 6000K winter snowfall daylight with fluffy white snow visibly settled atop the hat/hair crown and upper coat shoulders',
    poseBlock: [
      'WINTER SNOWFALL POSE: Upright 7.5-head adult cozy winter lookbook full-body stance (one hand relaxed in coat pocket or lightly near scarf) with calm winter expression.',
      'SNOW PHYSICAL TRACE (MANDATORY ON HAT & SHOULDERS): Render soft, fluffy white snow visibly settled and accumulated atop the hat/beanie/hair crown and across the upper coat shoulders ("fluffy white snow settled on hat/hair and coat shoulders").',
      'STRICT SNOW NEGATIVE: NEVER draw airborne snowflakes or snow streaks in the #94A3B8 background air.',
    ].join('\n'),
  },
  wind: {
    key: 'windy',
    effectiveWeather: 'wind',
    description:
      'crisp directional daylight studio key light with dynamic lateral wind physics across outer hems and scarf ends while preserving locked short hair length',
    poseBlock: [
      'STRONG WINDY GALE POSE: Upright 7.5-head adult wind-bracing editorial full-body stance — one hand lightly steadying the hat brim or coat lapel while maintaining tall, poised adult balance against a brisk lateral gust.',
      'WIND PHYSICAL TRACE: Render realistic lateral wind physics across the coat hem, lapels, trousers, and muffler/scarf ends sweeping consistently to one side, with only subtle crown movement strictly within the character’s locked haircut length (keep short ear-length haircuts strictly above the shirt collar — NEVER grow shoulder-length or long billowing hair locks).',
      'STRICT WIND NEGATIVE: NEVER lengthen short hair into shoulder-length or flowing locks, NEVER obscure the face with hair, NEVER shorten 7.5-head leg proportions, and NEVER draw dust clouds or flying debris on the #94A3B8 background.',
    ].join('\n'),
  },
  heatwave: {
    key: 'heatwave',
    effectiveWeather: 'heatwave',
    description:
      'bright crisp high-summer sunlit highlights (5200K) with vibrant warm skin luminosity and airy summer fabric clarity',
    poseBlock: [
      'MIDSUMMER HEATWAVE POSE: Breezy, upright 7.5-head adult high-summer lookbook full-body stance (lightly shading the brow from bright overhead sunlight or relaxed airy summer posture).',
      'HEATWAVE PHYSICAL TRACE: Bright crisp sunlit highlights (5200K) along hair and shoulders with crisp breathable summer fabric texture.',
      'STRICT HEATWAVE NEGATIVE: NEVER draw lens flare circles or sun orbs on the #94A3B8 background.',
    ].join('\n'),
  },
  cloudy: {
    key: 'cloudy',
    effectiveWeather: 'cloudy',
    description:
      'soft diffused overcast 5800K illumination with gentle wrap-around tonal transitions',
    poseBlock: [
      'OVERCAST CLOUDY POSE: Calm, upright 7.5-head adult editorial lookbook full-body stance with natural relaxed posture under soft 5800K diffused overcast illumination.',
      'STRICT CLOUDY NEGATIVE: NEVER draw fog or clouds on the #94A3B8 background.',
    ].join('\n'),
  },
  clear: {
    key: 'clear',
    effectiveWeather: 'clear',
    description:
      'crisp balanced 5400K studio daylight illumination showcasing true-to-life garment color, matte fabric weave, and locked avatar skin shading',
    poseBlock: [
      'CLEAR DAYLIGHT POSE: Confident, upright 7.5-head adult full-body studio stance under balanced 5400K daylight while strictly preserving the locked avatar art style and haircut silhouette.',
      'STRICT CLEAR NEGATIVE: NEVER drift into photorealistic catalog-photo skin/faces in stylized character mode, NEVER shrink into chibi proportions, and NEVER draw cast floor shadows or cyclorama gradients on the #94A3B8 background.',
    ].join('\n'),
  },
});

export function normalizeWeatherMood(rawWeather) {
  if (!rawWeather) {
    return WEATHER_POSE_DIRECTIVES.clear;
  }
  if (typeof rawWeather === 'string') {
    const token = rawWeather.trim().toLowerCase();
    if (token.includes('rain') || token.includes('비')) return WEATHER_POSE_DIRECTIVES.rain;
    if (token.includes('cold') || token.includes('freeze') || token.includes('한파')) {
      return WEATHER_POSE_DIRECTIVES.coldwave;
    }
    if (token.includes('snow') || token.includes('눈')) return WEATHER_POSE_DIRECTIVES.snow;
    if (token.includes('wind') || token.includes('강풍') || token.includes('바람')) {
      return WEATHER_POSE_DIRECTIVES.wind;
    }
    if (token.includes('heat') || token.includes('hot') || token.includes('폭염')) {
      return WEATHER_POSE_DIRECTIVES.heatwave;
    }
    if (token.includes('cloud') || token.includes('overcast') || token.includes('흐림')) {
      return WEATHER_POSE_DIRECTIVES.cloudy;
    }
    return WEATHER_POSE_DIRECTIVES.clear;
  }

  if (typeof rawWeather === 'object') {
    const scenario = String(
      rawWeather.mode || rawWeather.scenarioKey || rawWeather.condition || rawWeather.mood || ''
    ).toLowerCase();
    const minTemp = Number(rawWeather.tempMin ?? rawWeather.temperatureMin ?? NaN);
    const maxTemp = Number(rawWeather.tempMax ?? rawWeather.temperatureMax ?? rawWeather.temp ?? NaN);
    const directTemp = Number(rawWeather.temperature ?? rawWeather.avgTemp ?? NaN);
    const feelsLike = Number(rawWeather.feelsLike ?? NaN);
    const code = Number(rawWeather.weatherCode ?? rawWeather.code ?? NaN);

    if (scenario === 'coldwave' || scenario === 'winter_cold' || scenario.includes('한파') || scenario.includes('강추위')) {
      return WEATHER_POSE_DIRECTIVES.coldwave;
    }
    if (scenario === 'heatwave' || scenario === 'summer_heatwave' || scenario.includes('폭염')) {
      return WEATHER_POSE_DIRECTIVES.heatwave;
    }
    if (
      rawWeather.isSnowy ||
      rawWeather.isSnowing ||
      scenario === 'snow' ||
      scenario === 'snowy_winter' ||
      scenario.includes('눈') ||
      (Number.isFinite(code) && ((code >= 71 && code <= 77) || code === 85 || code === 86))
    ) {
      return WEATHER_POSE_DIRECTIVES.snow;
    }
    if (
      rawWeather.isRainy ||
      rawWeather.isRaining ||
      scenario.includes('rain') ||
      scenario.includes('비') ||
      (Number.isFinite(code) && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95))
    ) {
      return WEATHER_POSE_DIRECTIVES.rain;
    }

    // Realtime sub-zero / heatwave temperature escalation
    if (
      (Number.isFinite(minTemp) && minTemp <= -5) ||
      (Number.isFinite(directTemp) && directTemp <= -5) ||
      (Number.isFinite(feelsLike) && feelsLike <= -10) ||
      (Number.isFinite(maxTemp) && maxTemp <= 0)
    ) {
      return WEATHER_POSE_DIRECTIVES.coldwave;
    }
    if (
      (Number.isFinite(maxTemp) && maxTemp >= 31) ||
      (Number.isFinite(directTemp) && directTemp >= 31) ||
      (Number.isFinite(feelsLike) && feelsLike >= 33)
    ) {
      return WEATHER_POSE_DIRECTIVES.heatwave;
    }

    if (
      rawWeather.isWindy ||
      Number(rawWeather.windSpeed) >= 25 ||
      scenario.includes('wind') ||
      scenario.includes('강풍') ||
      scenario.includes('바람')
    ) {
      return WEATHER_POSE_DIRECTIVES.wind;
    }
    if (
      code === 3 ||
      code === 45 ||
      code === 48 ||
      scenario.includes('cloud') ||
      scenario.includes('overcast') ||
      scenario.includes('흐림') ||
      scenario.includes('안개')
    ) {
      return WEATHER_POSE_DIRECTIVES.cloudy;
    }
  }

  return WEATHER_POSE_DIRECTIVES.clear;
}

/**
 * Normalizes any numeric angle in degrees to one of the 8 canonical angles
 * (`45, 0, -45, -90, -135, 180, 135, 90`), defaulting to `45`.
 */
export function normalizeIsoViewAngleDeg(rawAngle, fallback = DEFAULT_ISO_VIEW_ANGLE) {
  if (rawAngle === null || rawAngle === undefined || rawAngle === '') {
    return fallback;
  }
  const num = Number(rawAngle);
  if (!Number.isFinite(num)) return fallback;
  let wrapped = ((num + 180) % 360 + 360) % 360 - 180;
  let snapped = Math.round(wrapped / 45) * 45;
  if (snapped === -180) snapped = 180;
  if (Object.is(snapped, -0)) snapped = 0;
  return ALL_ISO_VIEW_ANGLES.includes(snapped) ? snapped : fallback;
}

function estimateMstFromHex(hexColor, personalColor = 'autumn_warm') {
  const hex = normalizeHexColor(hexColor, '#DFBA9B');
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  let mstLevel = 5;
  if (lum >= 0.83) mstLevel = 1;
  else if (lum >= 0.76) mstLevel = 2;
  else if (lum >= 0.68) mstLevel = 3;
  else if (lum >= 0.6) mstLevel = 4;
  else if (lum >= 0.51) mstLevel = 5;
  else if (lum >= 0.41) mstLevel = 6;
  else if (lum >= 0.31) mstLevel = 7;
  else if (lum >= 0.22) mstLevel = 8;
  else if (lum >= 0.14) mstLevel = 9;
  else mstLevel = 10;

  let mstUndertone = 'neutral';
  if (g > r * 0.91 && b < g * 0.84) {
    mstUndertone = 'olive';
  } else if (r - b > 0.19) {
    mstUndertone = 'warm';
  } else if (r - b < 0.11 || personalColor.endsWith('_cool')) {
    mstUndertone = 'cool';
  }
  return { mstLevel, mstUndertone, lum };
}

/** @type {Map<string, { mtimeMs: number, values: Record<string, string> }>} */
const dotEnvCache = new Map();

function parseDotEnvContent(content) {
  /** @type {Record<string, string>} */
  const parsed = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = withoutExport.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = withoutExport.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      const commentIdx = val.indexOf(' #');
      if (commentIdx >= 0) {
        val = val.slice(0, commentIdx).trim();
      }
    }
    if (val) {
      parsed[key] = val;
    }
  }
  return parsed;
}

function readLocalDotEnvMap() {
  /** @type {Record<string, string>} */
  const merged = {};
  const candidates = [path.join(ROOT_DIR, '.env'), path.join(ROOT_DIR, '.env.local')];
  for (const filePath of candidates) {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 256 * 1024) continue;
      const cached = dotEnvCache.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        Object.assign(merged, cached.values);
        continue;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const values = parseDotEnvContent(raw);
      dotEnvCache.set(filePath, { mtimeMs: stat.mtimeMs, values });
      Object.assign(merged, values);
    } catch {
      // ignore missing or unreadable .env files
    }
  }
  return merged;
}

function readServerEnvVar(key) {
  const direct = process.env[key];
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  const localMap = readLocalDotEnvMap();
  const fromFile = localMap[key];
  return typeof fromFile === 'string' ? fromFile.trim() : '';
}

export function resolveGeminiApiKey() {
  return getServerGeminiApiKey();
}

export function resolveVertexAiConfig() {
  const customEndpoint = readServerEnvVar('VERTEX_AI_ENDPOINT');
  const project =
    readServerEnvVar('VERTEX_AI_PROJECT') || readServerEnvVar('GOOGLE_CLOUD_PROJECT');
  const location = readServerEnvVar('VERTEX_AI_LOCATION') || 'us-central1';
  const accessToken = readServerEnvVar('VERTEX_AI_ACCESS_TOKEN');
  const apiKey = readServerEnvVar('VERTEX_AI_API_KEY');

  if (customEndpoint && (accessToken || apiKey)) {
    return { enabled: true, customEndpoint, project, location, accessToken, apiKey };
  }
  if (project && (accessToken || apiKey)) {
    return { enabled: true, customEndpoint: '', project, location, accessToken, apiKey };
  }
  return { enabled: false, customEndpoint: '', project: '', location, accessToken: '', apiKey: '' };
}

export function resolveGeminiModelChain() {
  const candidates = [
    readServerEnvVar('GEMINI_VTON_MODEL'),
    'gemini-3.1-flash-lite-image',
    'gemini-nano-banana-2.1',
  ].filter(Boolean);
  return [...new Set(candidates)];
}

/**
 * Inspects leading magic bytes for PNG, JPEG, and WEBP image buffers.
 */
export function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function normalizeHexColor(rawHex, fallback = '#DFBA9B') {
  if (typeof rawHex !== 'string') return fallback;
  const trimmed = rawHex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function normalizePersonalColor(rawPc) {
  const key = String(rawPc || '')
    .trim()
    .toLowerCase();
  if (VALID_PERSONAL_COLORS.has(key)) return key;
  if (key.startsWith('spring')) return 'spring_warm';
  if (key.startsWith('summer')) return 'summer_cool';
  if (key.startsWith('autumn') || key.startsWith('fall')) return 'autumn_warm';
  if (key.startsWith('winter')) return 'winter_cool';
  return 'autumn_warm';
}

function normalizeBodyShape(rawShape, bmi = 21.6) {
  const key = String(rawShape || '')
    .trim()
    .toLowerCase();
  if (VALID_BODY_SHAPES.has(key)) return key;
  if (key === 'slender' || key === 'ectomorph' || key === 'petite') return 'slim';
  if (key === 'athletic' || key === 'mesomorph') return 'muscular';
  if (key === 'inverted_triangle' || key === 'top_heavy') return 'upper_developed';
  if (key === 'pear' || key === 'bottom_heavy' || key === 'plus_size') return 'lower_developed';
  if (bmi < 18.8) return 'slim';
  return 'standard_balanced';
}

function normalizeEnumToken(raw, validSet, fallback) {
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  return validSet.has(key) ? key : fallback;
}

/**
 * Decodes and validates a `data:image/(png|jpeg|jpg|webp);base64,...` URI (<= maxBytes + magic bytes).
 */
export function decodeValidatedDataUrl(dataUrl, maxBytes = MAX_DATA_URL_BYTES) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const cleanB64 = match[2].replace(/\s+/g, '');
  const maxBase64Chars = Math.ceil((maxBytes * 4) / 3) + 16;
  if (!cleanB64 || cleanB64.length > maxBase64Chars) return null;

  let buffer;
  try {
    buffer = Buffer.from(cleanB64, 'base64');
  } catch {
    return null;
  }
  if (!buffer || buffer.length === 0 || buffer.length > maxBytes) return null;

  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) return null;

  return {
    mimeType,
    base64Data: buffer.toString('base64'),
    byteLength: buffer.length,
    sha256: sha256Hex(buffer),
  };
}

/**
 * Security-hardened garment packshot loader.
 * - `/seed/<relPath>`: strictly validated file inside `public/seed` (including `public/seed/s4/*.webp`), <= 4MB, magic bytes checked.
 * - `/uploads/<basename>`: ONLY allowed for authenticated non-guest callers whose `authorizedClosets`
 *   own a garment row referencing `/uploads/<basename>`, <= 4MB, prefix + magic bytes checked.
 * - `data:image/(png|jpeg|jpg|webp);base64,...`: <= 5MB, magic bytes checked.
 */
export function loadGarmentPackshot(
  rawImageUrl,
  { authorizedClosets = [], isSampleGuest = false, isAuthenticated } = {}
) {
  if (typeof rawImageUrl !== 'string') return null;
  const trimmed = rawImageUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const decoded = decodeValidatedDataUrl(trimmed, MAX_DATA_URL_BYTES);
    if (!decoded) return null;
    return {
      mimeType: decoded.mimeType,
      base64Data: decoded.base64Data,
      imageDigest: `data:${decoded.sha256.slice(0, 32)}`,
    };
  }

  if (trimmed.startsWith('/seed/')) {
    const relPath = trimmed.slice('/seed/'.length);
    if (
      !relPath ||
      relPath.includes('..') ||
      relPath === 'store-terracotta-cardigan.jpg' ||
      !SAFE_SEED_REL_RE.test(relPath)
    ) {
      return null;
    }

    const seedRoot = path.resolve(SEED_DIR);
    const fullPath = path.resolve(SEED_DIR, relPath);
    if (!fullPath.startsWith(`${seedRoot}${path.sep}`)) {
      return null;
    }

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PACKSHOT_FILE_BYTES) {
        return null;
      }
      const buffer = fs.readFileSync(fullPath);
      if (buffer.length <= 0 || buffer.length > MAX_PACKSHOT_FILE_BYTES) {
        return null;
      }
      const mimeType = detectImageMimeType(buffer);
      if (!mimeType) return null;
      return {
        mimeType,
        base64Data: buffer.toString('base64'),
        imageDigest: `seed:${relPath}:${sha256Hex(buffer).slice(0, 20)}`,
      };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/uploads/')) {
    // Strictly block unauthenticated callers and sample guests from reading /uploads/*
    if (isSampleGuest || isAuthenticated === false) {
      return null;
    }
    const cleanClosets = Array.isArray(authorizedClosets)
      ? [
          ...new Set(
            authorizedClosets
              .map((c) => String(c || '').trim())
              .filter((c) => Boolean(c) && c !== 'sample')
          ),
        ]
      : [];
    if (cleanClosets.length === 0) {
      return null;
    }

    const basename = path.basename(trimmed);
    if (
      trimmed !== `/uploads/${basename}` ||
      basename.includes('..') ||
      !SAFE_BASENAME_RE.test(basename)
    ) {
      return null;
    }

    const uploadsRoot = path.resolve(UPLOADS_DIR);
    const fullPath = path.resolve(UPLOADS_DIR, basename);
    if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
      return null;
    }

    const normalizedUrl = `/uploads/${basename}`;
    try {
      const placeholders = cleanClosets.map(() => '?').join(', ');
      const owned = db
        .prepare(
          `SELECT 1 FROM garments WHERE closet_owner IN (${placeholders}) AND image_url = ? LIMIT 1`
        )
        .get(...cleanClosets, normalizedUrl);
      if (!owned) {
        return null;
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PACKSHOT_FILE_BYTES) {
        return null;
      }
      const buffer = fs.readFileSync(fullPath);
      if (buffer.length <= 0 || buffer.length > MAX_PACKSHOT_FILE_BYTES) {
        return null;
      }
      const mimeType = detectImageMimeType(buffer);
      if (!mimeType) return null;
      return {
        mimeType,
        base64Data: buffer.toString('base64'),
        imageDigest: `upload:${sha256Hex(buffer).slice(0, 32)}`,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Normalizes physical proportion, inclusive MST complexion, coupled soft-tissue, and camera angle
 * in an anti-bias, parametric AvatarSpec-aware manner.
 */
export function normalizeVtonProfile(
  rawProfile = {},
  fallbackPortraitDataUrl = null,
  extraOptions = {}
) {
  const src = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  const morph = src.morph && typeof src.morph === 'object' ? src.morph : {};
  const rawAvatarSpec =
    extraOptions?.avatarSpec && typeof extraOptions.avatarSpec === 'object'
      ? extraOptions.avatarSpec
      : src.avatarSpec && typeof src.avatarSpec === 'object'
        ? src.avatarSpec
        : {};
  const anthro =
    rawAvatarSpec.anthropometrics && typeof rawAvatarSpec.anthropometrics === 'object'
      ? rawAvatarSpec.anthropometrics
      : {};
  const soft =
    rawAvatarSpec.coupledSoftTissue && typeof rawAvatarSpec.coupledSoftTissue === 'object'
      ? rawAvatarSpec.coupledSoftTissue
      : {};
  const app =
    rawAvatarSpec.appearance && typeof rawAvatarSpec.appearance === 'object'
      ? rawAvatarSpec.appearance
      : {};

  const skinToneHex = normalizeHexColor(
    src.skinToneHex ?? src.skin_tone_hex ?? app.skinToneHex,
    '#DFBA9B'
  );
  const personalColor = normalizePersonalColor(
    src.personalColor ?? src.personal_color ?? app.personalColor
  );
  const estimatedMst = estimateMstFromHex(skinToneHex, personalColor);
  const mstLevel = Math.round(clampNumber(app.mstLevel, 1, 10, estimatedMst.mstLevel));
  const mstUndertone = normalizeEnumToken(
    app.mstUndertone,
    VALID_UNDERTONES,
    estimatedMst.mstUndertone
  );

  const heightCm = roundToStep(
    clampNumber(src.heightCm ?? src.height_cm ?? anthro.heightCm, 100, 230, 172),
    0.5
  );
  const weightKg = roundToStep(
    clampNumber(src.weightKg ?? src.weight_kg ?? anthro.weightKg, 35, 160, 64),
    0.5
  );
  const bmi = roundToStep(weightKg / (heightCm / 100) ** 2, 0.1);
  const bodyShape = normalizeBodyShape(
    src.bodyShape ?? src.body_shape ?? rawAvatarSpec.archetypePreset,
    bmi
  );
  const shapeDefaults =
    DEFAULT_SCALES_BY_SHAPE[bodyShape] || DEFAULT_SCALES_BY_SHAPE.standard_balanced;

  const framePreset = normalizeEnumToken(
    rawAvatarSpec.framePreset,
    VALID_FRAME_PRESETS,
    'androgynous'
  );
  const gender = normalizeCanonicalAvatarGender(
    src.gender ?? extraOptions?.gender,
    framePreset
  );
  const archetypePreset = normalizeEnumToken(
    rawAvatarSpec.archetypePreset,
    VALID_ARCHETYPES,
    bmi >= 30 ? 'plus_size' : bodyShape === 'muscular' ? 'athletic' : 'rectangle'
  );
  const dominantHand = normalizeHandedness(
    extraOptions?.dominantHand ??
      src.handedness ??
      rawAvatarSpec.dominantHand ??
      src.dominantHand ??
      'right',
    'right'
  );
  const chestForm = normalizeEnumToken(
    anthro.chestForm,
    VALID_CHEST_FORMS,
    framePreset === 'feminine' || gender === 'female'
      ? 'contoured'
      : framePreset === 'masculine' || gender === 'male'
        ? 'pectoral'
        : 'flat'
  );

  const shoulderScale = roundToStep(
    clampNumber(
      src.shoulderScale ??
        src.shoulder_scale ??
        morph.shoulderWidthScale ??
        morph.shoulderScale ??
        anthro.shoulderScale,
      0.75,
      1.35,
      shapeDefaults.shoulderScale
    ),
    0.01
  );
  const waistScale = roundToStep(
    clampNumber(
      src.waistScale ??
        src.waist_scale ??
        morph.waistWidthScale ??
        morph.waistScale ??
        anthro.waistScale,
      0.7,
      1.35,
      shapeDefaults.waistScale
    ),
    0.01
  );
  const hipScale = roundToStep(
    clampNumber(
      src.hipScale ??
        src.hip_scale ??
        morph.hipWidthScale ??
        morph.hipScale ??
        anthro.hipScale,
      0.8,
      1.38,
      shapeDefaults.hipScale
    ),
    0.01
  );
  const chestScale = roundToStep(clampNumber(anthro.chestScale, 0.75, 1.4, 1), 0.01);
  const abdomenScale = roundToStep(clampNumber(anthro.abdomenScale, 0.75, 1.45, 1), 0.01);
  const gluteScale = roundToStep(clampNumber(anthro.gluteScale, 0.75, 1.4, 1), 0.01);
  const armMassScale = roundToStep(clampNumber(anthro.armMassScale, 0.75, 1.45, 1), 0.01);
  const legMassScale = roundToStep(clampNumber(anthro.legMassScale, 0.75, 1.45, 1), 0.01);
  const legLengthScale = roundToStep(clampNumber(anthro.legLengthScale, 0.88, 1.12, 1), 0.01);
  const muscleDefinition = roundToStep(clampNumber(anthro.muscleDefinition, 0, 1, 0.3), 0.01);

  const autoCoupleWithBmi =
    typeof soft.autoCoupleWithBmi === 'boolean' ? soft.autoCoupleWithBmi : true;
  const faceSoftnessBias = roundToStep(clampNumber(soft.faceSoftnessBias, -0.5, 0.8, 0), 0.01);
  const neckThicknessBias = roundToStep(clampNumber(soft.neckThicknessBias, -0.4, 0.6, 0), 0.01);
  const torsoSoftnessBias = roundToStep(clampNumber(soft.torsoSoftnessBias, -0.5, 0.8, 0), 0.01);
  const limbSoftnessBias = roundToStep(clampNumber(soft.limbSoftnessBias, -0.5, 0.8, 0), 0.01);
  const extremityPlumpnessBias = roundToStep(
    clampNumber(soft.extremityPlumpnessBias, -0.4, 0.7, 0),
    0.01
  );

  const headShape = normalizeEnumToken(app.headShape, VALID_HEAD_SHAPES, 'oval');
  const eyeShape = normalizeEnumToken(app.eyeShape, VALID_EYE_SHAPES, 'almond');
  const eyeSizeScale = roundToStep(clampNumber(app.eyeSizeScale, 0.8, 1.25, 1), 0.01);
  const noseWidthScale = roundToStep(clampNumber(app.noseWidthScale, 0.8, 1.3, 1), 0.01);
  const lipFullnessScale = roundToStep(clampNumber(app.lipFullnessScale, 0.8, 1.35, 1), 0.01);
  const browStrength = roundToStep(clampNumber(app.browStrength, 0.6, 1.4, 1), 0.01);
  const hairStyle = normalizeEnumToken(app.hairStyle, VALID_HAIR_STYLES, 'soft_wavy');
  const hairColorHex = normalizeHexColor(app.hairColorHex, '#2B211B');
  const facialHair = normalizeEnumToken(app.facialHair, VALID_FACIAL_HAIR, 'none');

  const viewAngleDeg = normalizeIsoViewAngleDeg(
    extraOptions?.viewAngleDeg ?? src.viewAngleDeg,
    DEFAULT_ISO_VIEW_ANGLE
  );
  const styleMode = normalizeVtonStyleMode(
    extraOptions?.styleMode ?? src.styleMode ?? src.vtonStyle ?? src.stylePreset
  );
  const weatherMood = normalizeWeatherMood(
    extraOptions?.weather ?? extraOptions?.weatherMood ?? src.weather ?? src.weatherMood
  );
  const turnaroundSheet = Boolean(
    extraOptions?.turnaroundSheet ?? src.turnaroundSheet ?? false
  );
  const rawAvatarHash = String(
    extraOptions?.avatarConfigHash ?? src.avatarConfigHash ?? ''
  )
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);

  const rawPortrait =
    src.portraitDataUrl ??
    src.faceDataUrl ??
    src.avatarFaceDataUrl ??
    app.facePhotoUrl ??
    fallbackPortraitDataUrl ??
    null;
  const portraitPart = rawPortrait
    ? decodeValidatedDataUrl(rawPortrait, MAX_DATA_URL_BYTES)
    : null;
  const rawCharacterAnchor =
    !portraitPart && styleMode === 'stylized_isometric'
      ? (src.characterAnchorDataUrl ?? extraOptions?.characterAnchorDataUrl ?? null)
      : null;
  const characterAnchorPart = rawCharacterAnchor
    ? decodeValidatedDataUrl(rawCharacterAnchor, 256 * 1024)
    : null;
  const rawMasterAnchor =
    !turnaroundSheet && viewAngleDeg !== 0
      ? (extraOptions?.masterAnchorDataUrl ?? src.masterAnchorDataUrl ?? null)
      : null;
  const masterAnchorPart = rawMasterAnchor
    ? decodeValidatedDataUrl(rawMasterAnchor, MAX_DATA_URL_BYTES)
    : null;

  return {
    viewAngleDeg,
    styleMode,
    weatherMood,
    turnaroundSheet,
    avatarConfigHash: rawAvatarHash || null,
    gender,
    framePreset,
    archetypePreset,
    dominantHand,
    chestForm,
    mstLevel,
    mstUndertone,
    skinToneHex,
    personalColor,
    heightCm,
    weightKg,
    bmi,
    bodyShape,
    shoulderScale,
    chestScale,
    waistScale,
    abdomenScale,
    hipScale,
    gluteScale,
    armMassScale,
    legMassScale,
    legLengthScale,
    muscleDefinition,
    autoCoupleWithBmi,
    faceSoftnessBias,
    neckThicknessBias,
    torsoSoftnessBias,
    limbSoftnessBias,
    extremityPlumpnessBias,
    headShape,
    eyeShape,
    eyeSizeScale,
    noseWidthScale,
    lipFullnessScale,
    browStrength,
    hairStyle,
    hairColorHex,
    facialHair,
    portraitPart: portraitPart
      ? {
          mimeType: portraitPart.mimeType,
          base64Data: portraitPart.base64Data,
        }
      : null,
    portraitHash: portraitPart ? portraitPart.sha256.slice(0, 32) : null,
    characterAnchorPart: characterAnchorPart
      ? {
          mimeType: characterAnchorPart.mimeType,
          base64Data: characterAnchorPart.base64Data,
        }
      : null,
    masterAnchorPart: masterAnchorPart
      ? {
          mimeType: masterAnchorPart.mimeType,
          base64Data: masterAnchorPart.base64Data,
        }
      : null,
    masterAnchorHash: masterAnchorPart ? masterAnchorPart.sha256.slice(0, 32) : null,
    qcCorrectionHint:
      typeof extraOptions?.qcCorrectionHint === 'string' && extraOptions.qcCorrectionHint.trim()
        ? extraOptions.qcCorrectionHint.trim().slice(0, 600)
        : '',
  };
}

function normalizeSlotName(rawSlot) {
  const clean = String(rawSlot || '')
    .trim()
    .toLowerCase();
  if (!clean) return null;
  if (VTON_SLOT_SET.has(clean)) return clean;
  if (SLOT_ALIAS_MAP[clean]) return SLOT_ALIAS_MAP[clean];
  // Handle manifest slot keys such as 'slot_outer', 'outer_coat', 'top_knit', etc.
  for (const canonical of VTON_SLOTS) {
    if (clean.startsWith(`${canonical}_`) || clean.endsWith(`_${canonical}`)) {
      return canonical;
    }
  }
  return null;
}

function sanitizeText(raw, maxLen = 80, fallback = '') {
  if (raw === null || raw === undefined) return fallback;
  const cleaned = String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

function lookupAuthorizedGarmentById(garmentId, authorizedClosets = []) {
  const numericId = Number(garmentId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const validClosets = Array.isArray(authorizedClosets)
    ? [...new Set(authorizedClosets.map((c) => String(c || '').trim()).filter(Boolean))]
    : [];
  if (validClosets.length === 0) return null;

  try {
    const placeholders = validClosets.map(() => '?').join(', ');
    return (
      db
        .prepare(
          `SELECT id, closet_owner, name, category, subcategory, color_name, color_hex, fabric, formality, brand, image_url, slot_key
           FROM garments
           WHERE id = ? AND closet_owner IN (${placeholders})
           LIMIT 1`
        )
        .get(numericId, ...validClosets) || null
    );
  } catch {
    return null;
  }
}

/**
 * Resolves equipped VTON slots from flexible payload shapes (`slots`, `equipped`, `garments`, `items`, `itemIds`)
 * and loads security-validated packshot reference images.
 */
export function resolveEquippedVtonSlots(rawInput = {}, authContext = {}) {
  const {
    authorizedClosets = [],
    isSampleGuest = false,
    isAuthenticated,
    handedness: rawAuthHandedness,
  } = authContext;
  const activeHandedness = normalizeHandedness(rawAuthHandedness, 'right');
  const rawCandidateBySlot = new Map();

  const assignCandidate = (slotHint, entry) => {
    if (entry === null || entry === undefined || entry === false) return;
    let itemObj = null;
    if (typeof entry === 'number' || (typeof entry === 'string' && /^\d+$/.test(entry.trim()))) {
      itemObj = lookupAuthorizedGarmentById(Number(entry), authorizedClosets);
    } else if (typeof entry === 'object' && !Array.isArray(entry)) {
      itemObj = entry;
    }
    if (!itemObj) return;

    // Enrich from DB if caller passed `{ id }` with partial fields
    let dbFallback = null;
    if (
      itemObj.id &&
      (!itemObj.name || (!itemObj.image_url && !itemObj.imageUrl && !itemObj.dataUrl))
    ) {
      dbFallback = lookupAuthorizedGarmentById(itemObj.id, authorizedClosets);
    }
    const merged = dbFallback ? { ...dbFallback, ...itemObj } : itemObj;

    const resolvedSlot =
      normalizeSlotName(slotHint) ||
      normalizeSlotName(merged.slot) ||
      normalizeSlotName(merged.slotKey ?? merged.slot_key) ||
      normalizeSlotName(merged.category);

    if (!resolvedSlot) return;
    rawCandidateBySlot.set(resolvedSlot, merged);
  };

  // 1. Array forms (`itemIds`, `items`, `garments`)
  const rawIds = rawInput.itemIds ?? rawInput.item_ids;
  if (Array.isArray(rawIds)) {
    for (const id of rawIds.slice(0, 28)) {
      assignCandidate(null, id);
    }
  }

  const rawArray = rawInput.garments ?? rawInput.items;
  if (Array.isArray(rawArray)) {
    for (const item of rawArray.slice(0, 28)) {
      assignCandidate(null, item);
    }
  }

  // 2. Explicit slot maps (`slots`, `equipped`, `equippedSlots`, `outfit`) take highest precedence
  const slotContainers = [
    rawInput.outfit,
    rawInput.equippedSlots,
    rawInput.equipped,
    rawInput.slots,
  ];
  for (const container of slotContainers) {
    if (container && typeof container === 'object' && !Array.isArray(container)) {
      for (const [key, val] of Object.entries(container)) {
        if (val === null) {
          const norm = normalizeSlotName(key);
          if (norm) rawCandidateBySlot.delete(norm);
        } else {
          assignCandidate(key, val);
        }
      }
    }
  }

  /** @type {Record<string, object>} */
  const resolvedSlots = {};

  for (const slot of VTON_SLOTS) {
    const rawItem = rawCandidateBySlot.get(slot);
    if (!rawItem) continue;

    const idNum = Number(rawItem.id);
    const id = Number.isInteger(idNum) && idNum > 0 ? idNum : null;
    const name = sanitizeText(rawItem.name ?? rawItem.title, 80, `${slot} item`);
    const category = sanitizeText(rawItem.category, 32, slot).toLowerCase();
    const subcategory = sanitizeText(rawItem.subcategory, 40, category).toLowerCase();
    const colorName = sanitizeText(rawItem.colorName ?? rawItem.color_name, 32, '뉴트럴');
    const colorHex = normalizeHexColor(rawItem.colorHex ?? rawItem.color_hex, '#8E8E93');
    const fabric = sanitizeText(rawItem.fabric, 32, 'cotton').toLowerCase();
    const formality = sanitizeText(rawItem.formality, 24, 'smart').toLowerCase();
    const brand = sanitizeText(rawItem.brand, 48, '');
    const rawImageRef =
      rawItem.packshotDataUrl ??
      rawItem.dataUrl ??
      rawItem.imageUrl ??
      rawItem.image_url ??
      '';

    const packshot = loadGarmentPackshot(rawImageRef, {
      authorizedClosets,
      isSampleGuest,
      isAuthenticated,
    });

    const isBag = isBagGarmentItem({ slot, category, subcategory, name });
    const bagSpec = isBag
      ? inferBagCarrySpec({
          category,
          subcategory,
          name,
          has_strap: rawItem.has_strap ?? rawItem.hasStrap,
          bag_carry_style: rawItem.bag_carry_style ?? rawItem.bagCarryStyle,
        })
      : null;
    const bagHasStrap = bagSpec ? Boolean(bagSpec.has_strap) : null;
    const bagCarryStyle = bagSpec ? bagSpec.bag_carry_style : null;
    const bagAssetMirrored = Boolean(
      isBag && activeHandedness === 'left' && bagCarryStyle !== 'backpack'
    );
    const bagCarrySide = activeHandedness === 'left' ? 'right' : 'left';
    const baseDigest = packshot ? packshot.imageDigest : 'none';

    resolvedSlots[slot] = {
      slot,
      id,
      name,
      category,
      subcategory,
      colorName,
      colorHex,
      fabric,
      formality,
      brand,
      isBag,
      hasStrap: bagHasStrap,
      bagCarryStyle,
      bagAssetMirrored,
      bagCarrySide,
      packshot: packshot
        ? { mimeType: packshot.mimeType, base64Data: packshot.base64Data }
        : null,
      imageDigest: isBag
        ? `${baseDigest}:hand-${activeHandedness}:strap-${bagHasStrap ? 1 : 0}:${bagCarryStyle || 'shoulder'}`
        : baseDigest,
    };
  }

  return resolvedSlots;
}

/**
 * Computes deterministic SHA-256 `baseHash` and `comboHash` from normalized profile and sorted slot signatures.
 */
export function computeVtonHashes(normalizedProfile, resolvedSlots = {}) {
  const layoutKey = normalizedProfile.turnaroundSheet
    ? 'turnaround_3x2'
    : `single_${normalizedProfile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}`;
  const styleMode = normalizedProfile.styleMode || VTON_STYLE_PRESET;
  const weatherKey =
    normalizedProfile.weatherMood?.effectiveWeather ||
    normalizedProfile.weatherMood?.key ||
    'clear';

  const basePayload = {
    v: CACHE_SCHEMA_VERSION,
    styleMode,
    weatherKey,
    layoutKey,
    avatarConfigHash: normalizedProfile.avatarConfigHash || null,
    gender: normalizedProfile.gender || 'unisex',
    framePreset: normalizedProfile.framePreset,
    archetypePreset: normalizedProfile.archetypePreset,
    dominantHand: normalizedProfile.dominantHand || 'right',
    chestForm: normalizedProfile.chestForm,
    mstLevel: normalizedProfile.mstLevel,
    mstUndertone: normalizedProfile.mstUndertone,
    skinToneHex: normalizedProfile.skinToneHex,
    personalColor: normalizedProfile.personalColor,
    heightCm: normalizedProfile.heightCm,
    weightKg: normalizedProfile.weightKg,
    bodyShape: normalizedProfile.bodyShape,
    shoulderScale: normalizedProfile.shoulderScale,
    chestScale: normalizedProfile.chestScale,
    waistScale: normalizedProfile.waistScale,
    abdomenScale: normalizedProfile.abdomenScale,
    hipScale: normalizedProfile.hipScale,
    gluteScale: normalizedProfile.gluteScale,
    armMassScale: normalizedProfile.armMassScale,
    legMassScale: normalizedProfile.legMassScale,
    legLengthScale: normalizedProfile.legLengthScale,
    muscleDefinition: normalizedProfile.muscleDefinition,
    autoCoupleWithBmi: normalizedProfile.autoCoupleWithBmi,
    faceSoftnessBias: normalizedProfile.faceSoftnessBias,
    neckThicknessBias: normalizedProfile.neckThicknessBias,
    torsoSoftnessBias: normalizedProfile.torsoSoftnessBias,
    limbSoftnessBias: normalizedProfile.limbSoftnessBias,
    extremityPlumpnessBias: normalizedProfile.extremityPlumpnessBias,
    headShape: normalizedProfile.headShape,
    eyeShape: normalizedProfile.eyeShape,
    eyeSizeScale: normalizedProfile.eyeSizeScale,
    noseWidthScale: normalizedProfile.noseWidthScale,
    lipFullnessScale: normalizedProfile.lipFullnessScale,
    browStrength: normalizedProfile.browStrength,
    hairStyle: normalizedProfile.hairStyle,
    hairColorHex: normalizedProfile.hairColorHex,
    facialHair: normalizedProfile.facialHair,
    portraitHash: normalizedProfile.portraitHash || null,
  };
  const baseHash = sha256Hex(JSON.stringify(basePayload));

  const sortedSlotSignatures = Object.keys(resolvedSlots)
    .sort()
    .map((slot) => {
      const item = resolvedSlots[slot];
      return {
        slot,
        id: item.id ?? null,
        category: item.category,
        subcategory: item.subcategory,
        name: item.name,
        colorName: item.colorName,
        colorHex: item.colorHex,
        fabric: item.fabric,
        formality: item.formality,
        imageDigest: item.imageDigest || 'none',
      };
    });

  const studioKeyHex = selectOptimalStudioKeyHex(
    sortedSlotSignatures.map((sig) => ({
      slot: sig.slot,
      category: sig.category,
      colorHex: sig.colorHex,
      colorName: sig.colorName,
      name: sig.name,
    }))
  );

  const comboHash = sha256Hex(
    JSON.stringify({
      v: CACHE_SCHEMA_VERSION,
      styleMode,
      weatherKey,
      layoutKey,
      studioKeyHex,
      baseHash,
      masterAnchorHash: normalizedProfile.masterAnchorHash || null,
      slots: sortedSlotSignatures,
    })
  );

  return { baseHash, comboHash };
}

function getCacheEntry(cacheKey) {
  if (!SAFE_CACHE_KEY_RE.test(cacheKey)) return null;

  const memHit = memCache.get(cacheKey);
  if (memHit && typeof memHit.dataUrl === 'string' && memHit.dataUrl.startsWith('data:image/')) {
    memCache.delete(cacheKey);
    memHit.lastAccessedAt = Date.now();
    memCache.set(cacheKey, memHit);
    return memHit;
  }

  if (!ensureDiskCacheDir()) return null;
  const cacheRoot = path.resolve(VTON_CACHE_DIR);
  const filePath = path.resolve(VTON_CACHE_DIR, `${cacheKey}.json`);
  if (!filePath.startsWith(`${cacheRoot}${path.sep}`)) return null;

  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.dataUrl !== 'string' ||
      !parsed.dataUrl.startsWith('data:image/')
    ) {
      return null;
    }
    const nowSec = new Date();
    try {
      fs.utimesSync(filePath, nowSec, nowSec);
    } catch {
      // ignore mtime touch failure
    }
    const entry = {
      cacheKey,
      kind: parsed.kind === 'base' ? 'base' : 'combo',
      model: String(parsed.model || 'gemini-2.5-flash-image'),
      dataUrl: parsed.dataUrl,
      createdAt: Number(parsed.createdAt) || Date.now(),
      lastAccessedAt: Date.now(),
    };
    setMemCacheEntry(cacheKey, entry);
    return entry;
  } catch {
    return null;
  }
}

function setMemCacheEntry(cacheKey, entry) {
  if (memCache.has(cacheKey)) {
    memCache.delete(cacheKey);
  }
  while (memCache.size >= MAX_MEM_CACHE) {
    const oldestKey = memCache.keys().next().value;
    if (oldestKey === undefined) break;
    memCache.delete(oldestKey);
  }
  memCache.set(cacheKey, entry);
}

function sweepDiskCache() {
  if (!ensureDiskCacheDir()) return;
  const cacheRoot = path.resolve(VTON_CACHE_DIR);
  try {
    const names = fs.readdirSync(cacheRoot);
    const now = Date.now();
    const jsonFiles = [];

    for (const name of names) {
      const fullPath = path.resolve(cacheRoot, name);
      if (!fullPath.startsWith(`${cacheRoot}${path.sep}`)) continue;

      if (name.endsWith('.tmp')) {
        try {
          const st = fs.statSync(fullPath);
          if (now - st.mtimeMs > 5 * 60 * 1000) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // ignore transient tmp cleanup error
        }
        continue;
      }

      if (!name.endsWith('.json')) continue;
      const baseKey = name.slice(0, -5);
      if (!SAFE_CACHE_KEY_RE.test(baseKey)) continue;

      try {
        const st = fs.statSync(fullPath);
        if (st.isFile()) {
          jsonFiles.push({ fullPath, mtimeMs: st.mtimeMs });
        }
      } catch {
        // ignore stat race
      }
    }

    if (jsonFiles.length > MAX_DISK_CACHE) {
      const sortedFiles = [...jsonFiles].sort((a, b) => a.mtimeMs - b.mtimeMs);
      const excessCount = sortedFiles.length - MAX_DISK_CACHE;
      for (let i = 0; i < excessCount; i += 1) {
        try {
          fs.unlinkSync(sortedFiles[i].fullPath);
        } catch {
          // ignore unlink race
        }
      }
    }
  } catch {
    // ignore sweep error
  }
}

function setCacheEntry(cacheKey, { kind, model, dataUrl }) {
  if (!SAFE_CACHE_KEY_RE.test(cacheKey)) return;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;

  const now = Date.now();
  const entry = {
    cacheKey,
    kind: kind === 'base' ? 'base' : 'combo',
    model: String(model || 'gemini-2.5-flash-image'),
    dataUrl,
    createdAt: now,
    lastAccessedAt: now,
  };
  setMemCacheEntry(cacheKey, entry);

  if (!ensureDiskCacheDir()) return;
  const cacheRoot = path.resolve(VTON_CACHE_DIR);
  const targetPath = path.resolve(cacheRoot, `${cacheKey}.json`);
  if (!targetPath.startsWith(`${cacheRoot}${path.sep}`)) return;

  const tmpPath = path.resolve(
    cacheRoot,
    `${cacheKey}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  if (!tmpPath.startsWith(`${cacheRoot}${path.sep}`)) return;

  try {
    const payload = JSON.stringify({
      cacheKey,
      kind: entry.kind,
      model: entry.model,
      createdAt: entry.createdAt,
      dataUrl: entry.dataUrl,
    });
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, targetPath);
    sweepDiskCache();
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore tmp cleanup failure
    }
  }
}

export function invalidateVtonCacheEntry(cacheKey) {
  if (typeof cacheKey !== 'string' || !SAFE_CACHE_KEY_RE.test(cacheKey)) return false;
  let removed = memCache.delete(cacheKey);
  if (ensureDiskCacheDir()) {
    const cacheRoot = path.resolve(VTON_CACHE_DIR);
    const targetPath = path.resolve(cacheRoot, `${cacheKey}.json`);
    if (targetPath.startsWith(`${cacheRoot}${path.sep}`) && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
        removed = true;
      } catch {
        // ignore disk unlink error
      }
    }
  }
  return removed;
}

function countTotalCacheEntries() {
  const keys = new Set(memCache.keys());
  if (ensureDiskCacheDir()) {
    try {
      for (const name of fs.readdirSync(VTON_CACHE_DIR)) {
        if (name.endsWith('.json')) {
          const baseKey = name.slice(0, -5);
          if (SAFE_CACHE_KEY_RE.test(baseKey)) {
            keys.add(baseKey);
          }
        }
      }
    } catch {
      // ignore disk read failure
    }
  }
  return keys.size;
}

const HAIR_STYLE_DESCRIPTIONS = Object.freeze({
  buzz_shaved: 'clean close-cropped buzz/shaved cranial silhouette',
  pixie_short: 'modern textured short pixie/cropped salon cut',
  straight_bob: 'sleek chin-to-jawline straight architectural bob',
  long_straight: 'smooth flowing shoulder-past-chest straight hair',
  soft_wavy: 'relaxed natural S-wave editorial hair silhouette',
  loose_curly: 'defined bouncy loose-curl ringlets with natural volume',
  type4_coily_afro:
    'authentic textured Type-4 coily Afro crown with rich sculptural halo volume (never flatten or straighten)',
  box_braids_locs:
    'neat articulated box braids / locs with distinct woven strand geometry draping naturally over shoulders',
  hijab_headwrap:
    'elegantly draped modest fabric hijab / headwrap framing the face cleanly and covering hair and neck modestly',
});

const FACIAL_HAIR_DESCRIPTIONS = Object.freeze({
  none: 'clean-shaven face with zero beard or mustache',
  stubble: 'subtle fine close-trimmed facial stubble along jaw and upper lip',
  mustache: 'neatly groomed defined mustache above upper lip',
  goatee: 'structured goatee framing chin and mustache line',
  short_boxed_beard: 'cleanly contoured short boxed beard along jawline, chin, and upper lip',
  full_beard: 'full, dense, well-shaped natural beard with dimensional volume',
});

function describeIsoCameraAngle(viewAngleDeg, backdropHex = CUTOUT_STAGE_HEX) {
  const angle = normalizeIsoViewAngleDeg(viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE);
  switch (angle) {
    case 45:
      return 'Strict FRONT-FACING 45-degree Front-Right horizontal-yaw full-body view (FACING TOWARD VIEWER-RIGHT / SCREEN-RIGHT ->). Eye-to-waist level, straight-on horizontal camera, zero tilt. Full-body shot from head crown to shoe soles with 8–10% bottom margin. Face, both eyes, nose, chin, front lapels/chest, and shoe toes angle ~45° toward SCREEN-RIGHT ->. [ABSOLUTE NEGATIVE: NEVER crop shoes, NEVER show a back view, NEVER face screen-left].';
    case 0:
      return 'Strict 0-degree direct front-facing full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; symmetrical frontal stance, full face looking straight ahead, entire front of outfit, and both shoes completely visible with 8–10% bottom margin.';
    case -45:
      return 'Strict FRONT-FACING 315-degree (-45°) Front-Left horizontal-yaw full-body view (FACING TOWARD VIEWER-LEFT / SCREEN-LEFT <-). Eye-to-waist level, straight-on horizontal camera, zero tilt. Full-body shot from head crown to shoe soles with 8–10% bottom margin. Face, both eyes, nose, chin, front lapels/chest, and shoe toes angle ~45° toward SCREEN-LEFT <-. [ABSOLUTE NEGATIVE: NEVER crop shoes, NEVER show a back view, NEVER face screen-right].';
    case 90:
      return "Strict 90-degree PURE ORTHOGRAPHIC RIGHT LATERAL SIDE-PROFILE full-body view facing straight toward VIEWER'S RIGHT (SCREEN-RIGHT ->). Camera strictly perpendicular (90.0°) to shoulder axis (~50% of front width); show EXACTLY ONE right eye, side nose bridge/tip protruding toward SCREEN-RIGHT ->, wearer's right arm/shoulder closest to camera, and both shoes in pure horizontal side profile pointing straight toward SCREEN-RIGHT -> with 8–10% bottom margin (NEVER face screen-left, NEVER show broad back of coat, NEVER rotate past 90° into a rear view).";
    case -90:
      return "Strict 270-degree (-90°) PURE ORTHOGRAPHIC LEFT LATERAL SIDE-PROFILE full-body view facing straight toward VIEWER'S LEFT (SCREEN-LEFT <-). Camera strictly perpendicular (90.0°) to shoulder axis (~50% of front width); show EXACTLY ONE left eye, side nose bridge/tip protruding toward SCREEN-LEFT <-, wearer's left arm/shoulder closest to camera, and both shoes in pure horizontal side profile pointing straight toward SCREEN-LEFT <- with 8–10% bottom margin (NEVER face screen-right, NEVER show broad back of coat, NEVER rotate past 270° into a rear view).";
    case 135:
      return `Strict 135-degree BACK-RIGHT THREE-QUARTER REAR VIEW (MODEL TURNED AWAY FROM CAMERA FACING BACK-RIGHT ->). Eye-to-waist level, straight-on horizontal camera, zero tilt, full-body shot from head crown to shoe soles with 8–10% bottom margin showing ONLY: (1) rear 3/4 back of head and hair silhouette + back of right ear turned away toward SCREEN-RIGHT -> (STRICTLY ZERO eyes, ZERO nose, ZERO mouth, ZERO front torso/chest!), (2) diagonal rear back of outer coat/top with right shoulder blade and outer right sleeve prominent, and (3) rear heels & staggered shoes pointing away toward SCREEN-RIGHT -> on a flat ${backdropHex} backdrop.`;
    case -135:
      return `Strict 225-degree (-135°) BACK-LEFT THREE-QUARTER REAR VIEW (MODEL TURNED AWAY FROM CAMERA FACING BACK-LEFT <-). Eye-to-waist level, straight-on horizontal camera, zero tilt, full-body shot from head crown to shoe soles with 8–10% bottom margin showing ONLY: (1) rear 3/4 back of head and hair silhouette + back of left ear turned away toward SCREEN-LEFT <- (STRICTLY ZERO eyes, ZERO nose, ZERO mouth, ZERO front torso/chest!), (2) diagonal rear back of outer coat/top with left shoulder blade and outer left sleeve prominent, and (3) rear heels & staggered shoes pointing away toward SCREEN-LEFT <- on a flat ${backdropHex} backdrop.`;
    case 180:
      return 'Strict symmetrical 180-degree PURE STRAIGHT REAR BACK-FACING full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; model standing with perpendicular shoulders and back 100% turned directly toward camera (center-back seam vertical down spine) showing ONLY symmetrical back of hair, level back shoulders, rear garment back, and straight rear heels of both shoes with 8–10% bottom margin (STRICTLY ZERO eyes, ZERO nose, ZERO mouth, ZERO front buttons or collar).';
    default:
      return 'Strict 0-degree direct front-facing full-body view. Eye-to-waist level, straight-on horizontal camera, zero tilt; symmetrical frontal stance, full face, entire front of outfit, and both shoes completely visible with 8–10% bottom margin.';
  }
}

function describeMstLightingDirective(profile, backdropHex = CUTOUT_STAGE_HEX) {
  const mst = profile.mstLevel ?? 5;
  const undertone = profile.mstUndertone || 'neutral';
  if (mst >= 8) {
    return [
      `Monk Skin Tone MST-${mst} (${undertone} undertone), exact base hex ${profile.skinToneHex} — STRICT ANTI-WHITEWASHING & DEEP-MELANIN LIGHTING LOCK:`,
      `Preserve rich, saturated deep melanin depth (${profile.skinToneHex}) across all exposed skin without lightening, bleaching, desaturating, or casting ashy gray.`,
      'Apply luminance-adaptive warm-neutral studio specular highlights along cheekbones, nose bridge, brow ridge, collarbones, knuckles, and subtle studio rim-light separation so facial features and limb edges remain crisp and dimensional without muddy shadow crush.',
    ].join(' ');
  }
  if (mst >= 5) {
    return [
      `Monk Skin Tone MST-${mst} (${undertone} undertone), exact base hex ${profile.skinToneHex} — TRUE-CHROMA COMPLEXION LOCK:`,
      `Maintain authentic warm/olive/tan/brown skin chroma (${profile.skinToneHex}) evenly across face, neck, hands, and legs without overexposing toward pale beige or dulling into gray.`,
    ].join(' ');
  }
  return [
    `Monk Skin Tone MST-${mst} (${undertone} undertone), exact base hex ${profile.skinToneHex} — FAIR-LUMINANCE EDGE LOCK:`,
    `Preserve delicate fair/light complexion (${profile.skinToneHex}) with subtle natural undertone warmth/coolness while keeping crisp contour separation against the flat ${backdropHex} studio backdrop.`,
  ].join(' ');
}

const CHEST_FORM_EDITORIAL_LABELS = Object.freeze({
  flat: 'clean straight upper-torso tailoring line',
  pectoral: 'structured athletic upper-chest tailoring line',
  contoured: 'softly contoured upper-torso silhouette',
  full_bust: 'fuller curved upper-torso silhouette',
});

function describeCoupledSoftTissueDirective(profile) {
  const { bmi, abdomenScale, hipScale, armMassScale, legMassScale, chestForm, chestScale } =
    profile;
  const chestEditorial =
    CHEST_FORM_EDITORIAL_LABELS[chestForm] || CHEST_FORM_EDITORIAL_LABELS.flat;

  if (bmi >= 30 || abdomenScale >= 1.18 || profile.archetypePreset === 'plus_size') {
    return [
      `MANDATORY ANTI-SLIM-BIAS FULL-VOLUME CASTING LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg):`,
      'NEVER revert or idealize toward a thin fashion-illustration mannequin.',
      `Render authentic, dignified full-body proportions consistently across every visible region: rounded fuller cheeks and softer lower-jawline/chin contour (faceSoftnessBias=${profile.faceSoftnessBias}), fuller cylindrical neck column (neckThicknessBias=${profile.neckThicknessBias}), fuller upper arms, forearms, wrists, and relaxed soft hands/fingers (armMassScale=${armMassScale}, extremityPlumpnessBias=${profile.extremityPlumpnessBias}), natural ${chestEditorial} (chestScale=${chestScale}), fuller rounded waist and midsection profile (abdomenScale=${abdomenScale}), generous hip, thigh, and calf circumference (hipScale=${hipScale}, legMassScale=${legMassScale}), grounded ankles, and wider foot/instep volume.`,
      'Drape every equipped garment realistically around this full 3D stature with authentic fabric ease and hem circumference — NEVER shrink the wearer to fit the garment.',
    ].join(' ');
  }
  if (bmi >= 25.5 || abdomenScale >= 1.08) {
    return [
      `ANTI-SLIM-BIAS MID-PLUS CASTING LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg):`,
      `Preserve visibly fuller, grounded real-world proportions across cheeks/jawline, neck, upper arms (armMassScale=${armMassScale}), ${chestEditorial} (chestScale=${chestScale}), waist/midsection curve (abdomenScale=${abdomenScale}), and hips/thighs (hipScale=${hipScale}, legMassScale=${legMassScale}) — strictly forbid fashion-mannequin slimming.`,
    ].join(' ');
  }
  if (bmi <= 19.2) {
    return `SLENDER CASTING LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg): Render genuinely lean, slender proportions with narrow waist and light wrist/ankle volume.`;
  }
  return `TRUE STATURE & PROPORTION LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg): Honor exact tailoring proportions (${chestEditorial}, chestScale=${chestScale}, waistScale=${profile.waistScale}, hipScale=${hipScale}, armMassScale=${armMassScale}, legMassScale=${legMassScale}, athleticTone=${profile.muscleDefinition}) faithfully without generic mannequin distortion.`;
}

function isResolvedSwimwearItem(item) {
  if (!item) return false;
  const cat = String(item.category || '').toLowerCase();
  const sub = String(item.subcategory || '').toLowerCase();
  const name = String(item.name || '');
  if (cat === 'swimwear') return true;
  if (['swimsuit', 'bikini', 'rashguard', 'swim_trunks', 'swimwear'].includes(sub)) {
    return true;
  }
  return /수영복|비키니|래시가드|스윔|swim|bikini|rashguard/i.test(name);
}

function buildEditorialStyleAndBodyPrompt(
  profile,
  hasEquippedUmbrella = false,
  backdropHex = CUTOUT_STAGE_HEX,
  hasEquippedBag = false
) {
  const pcDesc =
    PERSONAL_COLOR_DESCRIPTIONS[profile.personalColor] ||
    PERSONAL_COLOR_DESCRIPTIONS.autumn_warm;
  const shapeDesc =
    BODY_SHAPE_DESCRIPTIONS[profile.bodyShape] ||
    BODY_SHAPE_DESCRIPTIONS.standard_balanced;
  const chestEditorial =
    CHEST_FORM_EDITORIAL_LABELS[profile.chestForm] || CHEST_FORM_EDITORIAL_LABELS.flat;

  const statureCue =
    profile.heightCm >= 182
      ? 'tall elongated vertical stature'
      : profile.heightCm <= 160
        ? 'compact grounded vertical stature'
        : 'natural medium adult stature';

  const cameraLock = describeIsoCameraAngle(profile.viewAngleDeg, backdropHex);
  const mstLightingLock = describeMstLightingDirective(profile, backdropHex);
  const softTissueLock = describeCoupledSoftTissueDirective(profile);
  const isStylizedIso = profile.styleMode === 'stylized_isometric';
  const resolvedMood =
    hasEquippedUmbrella &&
    (!profile.weatherMood || profile.weatherMood.effectiveWeather === 'clear')
      ? WEATHER_POSE_DIRECTIVES.rain
      : profile.weatherMood || WEATHER_POSE_DIRECTIVES.clear;
  const weatherDesc = resolvedMood.description;
  const rawWeatherPoseBlock = resolvedMood.poseBlock || WEATHER_POSE_DIRECTIVES.clear.poseBlock;
  const weatherPoseBlock =
    backdropHex !== CUTOUT_STAGE_HEX
      ? rawWeatherPoseBlock.replaceAll(CUTOUT_STAGE_HEX, backdropHex)
      : rawWeatherPoseBlock;

  const canonicalCharacterBlock = buildCanonicalCharacterIdentityPromptBlock({
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    gender: profile.gender,
    framePreset: profile.framePreset,
    dominantHand: profile.dominantHand || 'right',
    bodyShape: profile.bodyShape,
    skinToneHex: profile.skinToneHex,
    mstLevel: profile.mstLevel,
    mstUndertone: profile.mstUndertone,
    hairStyle: profile.hairStyle,
    hairColorHex: profile.hairColorHex,
    facialHair: profile.facialHair,
    styleMode: profile.styleMode,
    hasPortraitReference: Boolean(profile.portraitPart),
  });

  const styleHeader = isStylizedIso
    ? [
        'Generate a high-craft Stylized Isometric Simulation Character Virtual Try-On lookbook image (Unified Ainventory Signature Matte 3D-Stylized Studio Avatar aesthetic: smooth matte porcelain-vinyl skin shading with soft studio ambient occlusion, subtle refined facial features, calm neutral gaze, unified 7.5-head adult proportions, clean silhouette edges WITHOUT thick black comic outlines, and authentic matte fabric weave on clothing).',
        '- NEVER render photorealistic human photography, real human skin pores, or real catalog model faces; NEVER render chibi/super-deformed 5-head/6-head figures; NEVER draw crude flat 2D vector polygons.',
      ]
    : [
        'Generate a high-fashion Photorealistic Commercial Studio Virtual Try-On lookbook photograph (SSENSE / COS / Totême studio campaign photography shot on medium-format 85mm f/5.6 studio lens, natural skin texture, realistic hair strands, relaxed natural hands, and hyper-accurate real garment drape, seam thickness, and fabric weave).',
        '- Render a real, lifelike adult fashion model matching the exact casting profile below — ZERO CGI mannequin plastic sheen and ZERO cartoon outlines.',
      ];

  const cameraBlock = profile.turnaroundSheet
    ? [
        'CAMERA & 6-ANGLE 3x2 UNDIVIDED TURNAROUND STUDIO SHEET LOCK (3:2 LANDSCAPE — 3 COLUMNS BY 2 ROWS = 6 EQUAL PORTRAIT ZONES ON ONE CONTINUOUS BORDERLESS CANVAS):',
        `- Compose ONE continuous, completely undivided 3:2 Turnaround Studio Sheet arranged in STRICTLY 3 EQUAL COLUMNS BY 2 EQUAL ROWS = EXACTLY 6 FIGURES TOTAL (3 on Top Row, 3 on Bottom Row — NEVER 4 columns, NEVER 8 figures) directly on a 100% flat solid uniform chromakey-free studio (${backdropHex}) backdrop, including 100% flat shadowless ${backdropHex} inside EVERY enclosed gap — STRICTLY ZERO white/grey/black vertical dividing lines, ZERO horizontal dividing lines, ZERO panel borders, ZERO frames, NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, and ZERO airborne weather particles in the background.`,
        '- CAMERA HEIGHT & FULL-BODY FRAMING LOCK: Lock ALL 6 figures (0°, 45°, 90°, 135°, 180°, 225°) to the EXACT SAME eye-to-waist level, straight-on horizontal camera, zero tilt (NEVER half-body, NEVER waist-up, NEVER thigh-up, NEVER crop heads, ankles, or shoes). Top Row (0°, 45°, 90°) sits strictly within y=2%..46%; Bottom Row (135°, 180°, 225°) sits strictly within y=54%..98%, leaving a clean >=6% horizontal background gutter around y=50% so Row 1 shoes and Row 2 head crowns NEVER touch or get clipped! Mandatory full-body head-to-shoe silhouette (~80% of each row height), both shoes completely visible.',
        `- ${SOLO_SINGLE_PERSON_PER_CELL_LOCK}`,
        `- ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
        '- STRICT SINGLE-SUBJECT RULE (CRITICAL — ZERO DUPLICATE/TWIN MODELS): Render EXACTLY ONE (1) solitary person centered horizontally in each of the 6 zones (total 6 figures in the entire image — NEVER place two models in one zone).',
        '- TOP ROW (y=2%..46%) = FRONT & PURE 90° LATERAL SIDE PROFILE ONLY (STRICTLY ZERO REAR VIEWS ON TOP ROW):',
        `  * [Top-Left (Row 1, Col 1) — 0° Direct Front]: Symmetrical frontal stance, full face looking straight ahead, entire front of outfit, both shoes with 8–10% bottom margin.${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[0]}]` : ''}`,
        `  * [Top-Center (Row 1, Col 2) — 45° Front-Right Quarter (FACING SCREEN-RIGHT ->)]: Turned 40–45° right; face, both eyes, nose, chin, front chest/lapels, and shoe toes angle clearly toward SCREEN-RIGHT (NEVER back view).${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[45]}]` : ''}`,
        `  * [Top-Right (Row 1, Col 3) — 90° STRICT PURE ORTHOGRAPHIC SIDE PROFILE (FACING SCREEN-RIGHT ->)]: Camera strictly perpendicular (90.0°) to shoulder axis (~55% of front shoulder width); show EXACTLY ONE (1) right eye, crisp side nose bridge & tip protruding right, single right sleeve centered vertically down torso dividing front chest/lapel edge on right from upper back edge on left, and both shoes in pure horizontal side profile pointing straight to SCREEN-RIGHT.${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[90]}]` : ''} [ABSOLUTE NEGATIVE ON 90°: NEVER show broad back of both shoulders, NEVER show center-back coat vent/seam, NEVER rotate past 90° into a rear view!]`,
        '- BOTTOM ROW (y=54%..98%) = REAR-QUARTER & SYMMETRICAL BACK VIEWS (100% FULL-BODY WITH FULL HEAD & SHOES INSIDE BOTTOM ROW):',
        `  * [Bottom-Left (Row 2, Col 1) — 135° Back-Right Three-Quarter Rear View (FACING AWAY RIGHT ->)]: Midway between 90° right profile and 180° straight back; show ONLY rear back-left 2/3 of head/hair and back of RIGHT EAR turned away toward SCREEN-RIGHT (ZERO eyes, ZERO nose, ZERO mouth), diagonal rear outfit with RIGHT SHOULDER & outer RIGHT SLEEVE prominent, and staggered shoes pointing away right.${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[135]}]` : ''}`,
        `  * [Bottom-Center (Row 2, Col 2) — 180° Strict Symmetrical Rear Back (ZERO FACE)]: Perpendicular shoulders, center-back seam vertical down spine, symmetrical back of head/hair, rear garment back, and straight rear shoe heels (ZERO eyes, ZERO nose, ZERO mouth, ZERO front buttons).${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[180]}]` : ''}`,
        `  * [Bottom-Right (Row 2, Col 3) — 225° Back-Left Three-Quarter Rear View (FACING AWAY LEFT <-, OPPOSITE OF COL 1)]: Midway between 270° left profile and 180° straight back; show ONLY rear back-right 2/3 of head/hair and back of LEFT EAR turned away toward SCREEN-LEFT (ZERO eyes, ZERO nose, ZERO mouth), diagonal rear outfit with LEFT SHOULDER & outer LEFT SLEEVE prominent on the left, and staggered shoes pointing away toward SCREEN-LEFT <- (NEVER facing right!).${hasEquippedBag ? ` [BAG LOCK: ${resolveBagCarryAnatomy(profile.dominantHand).perAngleScreenPrompt[225]}]` : ''}`,
        '- Render ZERO grid lines, ZERO white/grey divider bars, ZERO text, and ZERO angle numbers.',
      ]
    : [
        'CAMERA & MULTI-ANGLE STUDIO POSE LOCK (EYE-TO-WAIST ZERO-TILT FULL-BODY & ENCLOSED-HOLE RGBA CUTOUT BACKDROP RULE):',
        `- Exact View Angle (${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}°): ${cameraLock}`,
        '- CAMERA HEIGHT & FULL-BODY FRAMING LOCK: Eye-to-waist level, straight-on horizontal camera, zero tilt. Mandatory 100% full-body shot from head to toe — NEVER waist-up, NEVER thigh-up, NEVER headless, NEVER crop ankles or shoes; shoes and feet completely visible on the floor with 8–10% bottom margin and 8–12% top headroom (~78–83% frame height).',
        '- STRICT SINGLE-SUBJECT RULE: Render EXACTLY ONE (1) solitary full-body person centered in the frame — NEVER render twin/duplicate figures, side-by-side clones, or extra background models.',
        `- ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
        "- For 90° lateral side views, face cleanly toward VIEWER'S RIGHT (screen-right) with authentic side head/jaw/ear profile, full dimensional hair volume at crown and back of head, natural relaxed hands/fingers, and true lateral garment thickness, side seams, and natural gravity folds.",
        `- CRITICAL RGBA CUTOUT & ENCLOSED-HOLE BACKDROP RULE: Render the ENTIRE background behind, beneath, AND inside every enclosed negative-space gap of the model (underneath the open umbrella canopy around the shaft/head/shoulders, between bent arms and waist, between legs/ankles, and inside bag handles/straps) as a 100% flat solid uniform chromakey-free studio (${backdropHex}) backdrop, STRICTLY NO studio floor horizon line, NO wall-to-floor seam, NO vignette, NO cast floor shadow, ZERO shading inside enclosed loops, ZERO gradients, ZERO props, ZERO plinth tiles, and ZERO airborne rain/snow/mist particles in the background. Include ZERO text and ZERO UI labels.`,
      ];

  return [
    ...styleHeader,
    '',
    canonicalCharacterBlock,
    '',
    ...cameraBlock,
    '',
    `WEATHER-ADAPTIVE POSE, GARMENT PHYSICAL TRACES & LIGHTING (${resolvedMood.effectiveWeather.toUpperCase()}):`,
    `- Lighting: ${weatherDesc} while keeping the ${backdropHex} background 100% flat and shadow-free ( high ΔE contrast from both pure white snow/sneakers #FFFFFF and black coats #111111 ).`,
    weatherPoseBlock,
    '',
    'INCLUSIVE CASTING, PROPORTION & COMPLEXION LOCK (ZERO MODEL BIAS):',
    `  * Stature & Mass: Exact Height ${profile.heightCm} cm (${statureCue}, legLengthScale=${profile.legLengthScale}), Exact Weight ${profile.weightKg} kg (BMI ${profile.bmi}), gender=${profile.gender || 'unisex'}`,
    `  * Presentation & Silhouette: framePreset=${profile.framePreset}, archetypePreset=${profile.archetypePreset}, upperTorsoLine="${chestEditorial}", shape="${shapeDesc}"`,
    `  * Tailoring Proportions: shoulder=${profile.shoulderScale}, chest=${profile.chestScale}, waist=${profile.waistScale}, midsection=${profile.abdomenScale}, hip=${profile.hipScale}, armVolume=${profile.armMassScale}, legVolume=${profile.legMassScale}`,
    `  * ${softTissueLock}`,
    `  * ${mstLightingLock} (${pcDesc})`,
  ].join('\n');
}

function appendPortraitParts(parts, profile) {
  const angle = normalizeIsoViewAngleDeg(profile.viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE);
  const isTurnaround = Boolean(profile.turnaroundSheet);
  const isPureBack = !isTurnaround && angle === 180;
  const isBackQuarter = !isTurnaround && Math.abs(angle) === 135;
  const hairDesc =
    HAIR_STYLE_DESCRIPTIONS[profile.hairStyle] || HAIR_STYLE_DESCRIPTIONS.soft_wavy;
  const facialHairDesc =
    FACIAL_HAIR_DESCRIPTIONS[profile.facialHair] || FACIAL_HAIR_DESCRIPTIONS.none;
  const mediumLabel =
    profile.styleMode === 'stylized_isometric'
      ? 'matte 3D-stylized studio character'
      : 'photorealistic studio fashion model';

  const featureSummary = `Gender: ${profile.gender || 'unisex'}; Head shape: ${profile.headShape}; Hair: ${hairDesc} in exact color ${profile.hairColorHex}; Facial hair: ${facialHairDesc}; Eye shape: ${profile.eyeShape} (scale ${profile.eyeSizeScale}); Nose width scale: ${profile.noseWidthScale}; Lip fullness scale: ${profile.lipFullnessScale}; Brow strength: ${profile.browStrength}.`;

  if (profile.portraitPart) {
    if (isPureBack || isBackQuarter) {
      parts.push({
        text: isPureBack
          ? `[REAR HEAD & HAIR SILHOUETTE LOCK — 180° PURE BACK VIEW]: Render ONLY the symmetrical back of the head, hair silhouette/color (${hairDesc}, ${profile.hairColorHex}), rear ears, and nape of neck with skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}). STRICTLY ZERO front face, ZERO eyes, ZERO nose, ZERO lips!`
          : `[REAR-QUARTER HEAD & HAIR SILHOUETTE LOCK — ${angle === -135 ? 225 : 135}° BACK-QUARTER VIEW]: Model is turned strictly AWAY from camera. Render ONLY the rear 3/4 back of the head, hair silhouette/color (${hairDesc}, ${profile.hairColorHex}), and outer back ear with skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}). STRICTLY ZERO eyes, ZERO nose, ZERO mouth, ZERO head-turn toward camera!`,
      });
    } else {
      parts.push({
        text: [
          '[CRITICAL USER FACE IDENTITY LOCK — REAL UPLOADED USER PORTRAIT ATTACHED IMMEDIATELY BELOW]:',
          'THE ATTACHED PORTRAIT PHOTO IS THE REAL USER. You MUST render the model\'s face with 100% recognizable likeness to this exact uploaded user face photo — do NOT replace their face with a generic fashion stock model!',
          'Reproduce their exact eye shape & spacing, nose bridge & tip, lip contour, jawline/cheekbone structure, brow arch, hairstyle & hair parting/length/color from the photo, facial hair (if present), and eyeglasses (if worn in the photo unless overridden by equipped eyewear).',
          isTurnaround
            ? `Maintain this exact user's unmistakable face likeness across 0° front, 45° screen-right quarter, and 90° screen-right side profile on the Top Row; on Bottom-Left (135° Back-Right), Bottom-Center (180° Back), and Bottom-Right (225° Back-Left) render ONLY the rear back of their head & hair silhouette facing away (ZERO front face on rear row), in ${mediumLabel} style with skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`
            : `Render this exact user's unmistakable facial identity, expression warmth, and hair from the attached photo at ${angle}° in unified ${mediumLabel} style with skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`,
        ].join(' '),
      });
      parts.push({
        inlineData: {
          mimeType: profile.portraitPart.mimeType,
          data: profile.portraitPart.base64Data,
        },
      });
    }
  } else {
    parts.push({
      text: isTurnaround
        ? `[FACE & HAIR IDENTITY LOCK — 6-VIEW 3x2 TURNAROUND]: ${featureSummary} Maintain 100% identical facial features, cranial depth, and ${hairDesc} volume across 0°, 45°, 90° side profile, 135° back-right quarter, 180° straight back, and 225° back-left quarter views in ${mediumLabel} style with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`
        : isPureBack || isBackQuarter
          ? `[REAR HEAD & HAIR SILHOUETTE LOCK — ${isPureBack ? '180° BACK' : `${angle === -135 ? 225 : 135}° BACK-QUARTER`} VIEW]: Render ONLY the back of the head and ${hairDesc} in exact color ${profile.hairColorHex} above the nape/neck in skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}). STRICTLY ZERO eyes, ZERO nose, ZERO mouth, ZERO front face!`
          : `[FACE & HAIR IDENTITY LOCK — ${angle}° VIEW]: ${featureSummary} Render calm, natural editorial lookbook expression matching camera angle ${angle}° in ${mediumLabel} style with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`,
    });
    if (profile.styleMode === 'stylized_isometric' && profile.characterAnchorPart && !isPureBack && !isBackQuarter) {
      parts.push({
        text: `[CHARACTER IDENTITY, BODY PROPORTION & ART-STYLE ANCHOR]: Keep the EXACT SAME character face, haircut/length, matte 3D-stylized art style, and ${profile.heightCm}cm/${profile.weightKg}kg 7.5-head body build from this reference — ONLY change the outfit to the newly equipped garments and adjust stance for the weather.`,
      });
      parts.push({
        inlineData: {
          mimeType: profile.characterAnchorPart.mimeType,
          data: profile.characterAnchorPart.base64Data,
        },
      });
    }
  }
}

function buildBaseModelParts(profile) {
  const parts = [{ text: buildEditorialStyleAndBodyPrompt(profile) }];
  appendPortraitParts(parts, profile);
  const viewLabel = profile.turnaroundSheet
    ? 'all 6 turnaround views (3x2 grid: 0°, 45°, 90° on top row; 135°, 180°, 225° on bottom row) with ONE solitary person per panel'
    : `${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}°`;
  parts.push({
    text: [
      '[STUDIO BASE MODEL ATTIRE]:',
      `- Dress the figure (${viewLabel}) in a minimal neutral ecru (#EFECE6) fitted crew-neck cotton studio T-shirt, clean tailored stone-ecru (#DFDBD2) knee-length studio shorts with crisp side seams, and minimal off-white (#EAE7E1) low-profile studio slip-on canvas shoes.`,
      `- ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
      '- Keep the silhouette clean and unobstructed so authentic body proportions and MST complexion are unmistakably legible.',
      ...(profile.qcCorrectionHint
        ? [`[SERVER QC RETRY CORRECTION — FIX PREVIOUS DEFECT]: ${profile.qcCorrectionHint}`]
        : []),
      '[OUTPUT DIRECTIVE]: Generate and output the final high-resolution studio lookbook image directly without asking follow-up questions.',
    ].join('\n'),
  });
  return parts;
}

function buildCompositeLookParts(profile, resolvedSlots) {
  const equippedKeys = PROMPT_SLOT_ORDER.filter((slot) => Boolean(resolvedSlots[slot]));
  if (equippedKeys.length === 0) {
    return buildBaseModelParts(profile);
  }

  const equippedColorInputs = equippedKeys.map((slot) => {
    const item = resolvedSlots[slot];
    return {
      slot,
      category: item?.category ?? null,
      colorHex: item?.colorHex ?? null,
      colorName: item?.colorName ?? null,
      name: item?.name ?? null,
    };
  });
  const backdropHex = selectOptimalStudioKeyHex(equippedColorInputs);

  const hasEquippedUmbrella = Boolean(resolvedSlots.acc_umbrella);
  const equippedBagItem =
    equippedKeys
      .map((slot) => resolvedSlots[slot])
      .find((item) => Boolean(item?.isBag)) ||
    resolvedSlots.accessory ||
    null;
  const hasEquippedBag = Boolean(equippedBagItem);
  const activeBagSpec = hasEquippedBag
    ? {
        hasStrap: equippedBagItem?.hasStrap ?? true,
        bagCarryStyle: equippedBagItem?.bagCarryStyle ?? 'shoulder',
      }
    : null;
  const bagAnatomy = resolveBagCarryAnatomy(profile.dominantHand, activeBagSpec);
  const effectiveWeather = profile.weatherMood?.effectiveWeather || 'clear';
  const parts = [
    {
      text: buildEditorialStyleAndBodyPrompt(
        profile,
        hasEquippedUmbrella,
        backdropHex,
        hasEquippedBag
      ),
    },
  ];
  const canonicalBagAngle =
    profile.viewAngleDeg === -135
      ? 225
      : profile.viewAngleDeg === -90
        ? 270
        : profile.viewAngleDeg === -45
          ? 315
          : TURNAROUND_ANGLES.includes(profile.viewAngleDeg)
            ? profile.viewAngleDeg
            : 0;
  const isSingleRearAngle =
    !profile.turnaroundSheet &&
    (canonicalBagAngle === 135 ||
      canonicalBagAngle === 180 ||
      canonicalBagAngle === 225);

  if (!profile.turnaroundSheet && profile.masterAnchorPart && profile.viewAngleDeg !== 0) {
    const bagLockForAngle = hasEquippedBag
      ? ` BAG SCREEN-SIDE & HAND-ROLE LOCK FOR ${canonicalBagAngle}°: ${bagAnatomy.perAngleScreenPrompt[canonicalBagAngle]} ${bagAnatomy.dualHandRolePrompt}`
      : '';
    const rearLockWarning = isSingleRearAngle
      ? ' ABSOLUTE REAR-VIEW ORIENTATION LOCK: The model MUST be turned STRICTLY AWAY from the camera showing ONLY the BACK of their head/hair, BACK of their coat/shoulders, and BACK of their trousers/heels. STRICTLY ZERO front face, ZERO eyes, ZERO nose/mouth facing camera, ZERO front shirt/chest buttons!'
      : '';
    parts.push({
      text: `[MASTER CHARACTER & OUTFIT ANCHOR — 0° FRONT VIEW ATTACHED IMMEDIATELY BELOW]:
THIS ATTACHED IMAGE IS THE EXACT MASTER 0° FRONT CHARACTER & OUTFIT. Rotate THIS EXACT SAME person to the requested ${canonicalBagAngle}° camera angle while preserving 100% identical hairstyle/hair color, skin tone, body proportions, exact coat/top/bottom/shoes colors and fabric textures, and exact anatomical side/carry-style of every bag, watch, and accessory.${bagLockForAngle}${rearLockWarning}`,
    });
    parts.push({
      inlineData: {
        mimeType: profile.masterAnchorPart.mimeType,
        data: profile.masterAnchorPart.base64Data,
      },
    });
  }

  if (hasEquippedBag) {
    const bagSpatialGuide = buildServerBagPositionGuidePngPart(
      profile,
      backdropHex,
      activeBagSpec
    );
    if (bagSpatialGuide) {
      const singleAngleBagNote = !profile.turnaroundSheet
        ? ` EXACT BAG POSITION FOR THIS ${canonicalBagAngle}° VIEW: ${bagAnatomy.perAngleScreenPrompt[canonicalBagAngle]}`
        : '';
      parts.push({
        text: `[PRE-NORMALIZATION BAG & HAND-ROLE SPATIAL GUIDE — has_strap=${bagAnatomy.hasStrap}, carry_style=${bagAnatomy.bagCarryStyle}, dominant_hand=${bagAnatomy.dominantHand}]: ${bagAnatomy.dualHandRolePrompt}${singleAngleBagNote} Match the amber highlight zone in the attached spatial guide strictly — NEVER tuck the bag under the armpit and NEVER invent a strap when has_strap=false!`,
      });
      parts.push({
        inlineData: bagSpatialGuide,
      });
    }
  }
  appendPortraitParts(parts, profile);

  const onepieceItem = resolvedSlots.onepiece || resolvedSlots.dress || null;
  const hasOnepiece = Boolean(onepieceItem);
  const isSwimwearOnepiece = isResolvedSwimwearItem(onepieceItem);
  const hasTop = Boolean(resolvedSlots.top);
  const hasTopMid = Boolean(resolvedSlots.top_mid);
  const hasBottom = Boolean(resolvedSlots.bottom);
  const hasOuterMid = Boolean(resolvedSlots.outer_mid);
  const hasOuter = Boolean(resolvedSlots.outer);
  const hasAnyTop = hasTop || hasTopMid;
  const hasShoes = Boolean(resolvedSlots.shoes);
  const hasLeftRightAsymmetry =
    Boolean(resolvedSlots.acc_hand_left && resolvedSlots.acc_hand_right) ||
    Boolean(resolvedSlots.acc_wrist_left && resolvedSlots.acc_wrist_right) ||
    Boolean(resolvedSlots.jwl_ear_left && resolvedSlots.jwl_ear_right) ||
    Boolean(resolvedSlots.jwl_wrist_left && resolvedSlots.jwl_wrist_right) ||
    Boolean(resolvedSlots.jwl_ring_left && resolvedSlots.jwl_ring_right);
  const viewScopeText = profile.turnaroundSheet
    ? 'ALL 6 TURNAROUND VIEWS (3x2 grid: 0° Front, 45° Quarter, 90° Side on Top Row; 135° Back-Right, 180° Back, 225° Back-Left on Bottom Row — ONE solitary person per panel)'
    : `${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}° VIEW`;

  const layeringRules = [
    `[OUTFIT LAYERING, MULTI-PART ACCESSORIES/JEWELRY & REAL PHOTO FIDELITY — ${viewScopeText}]:`,
    '- Dress the model in ALL of the equipped garments, body-part accessories, and fine jewelry items attached below simultaneously, reproducing each attached photograph\'s exact cut, material sheen (leather, fabric, wool, cashmere, 18K yellow gold, 925 sterling silver, bronze/copper, pearl/platinum), construction details, and exact hex color.',
    `- ${FOOTWEAR_PAIR_SYMMETRY_LOCK}`,
    effectiveWeather === 'rain' && !hasEquippedUmbrella
      ? '- Render ONLY the equipped garments listed below plus a clean neutral minimal WIDE-OPEN overhead rain umbrella held high above the head tilted ~15° backward so face and outfit remain 100% visible (NEVER closed/folded).'
      : '- Render ONLY the equipped items listed below — NEVER hallucinate unequipped coats, hats, or residual items.',
  ];

  if (hasLeftRightAsymmetry) {
    layeringRules.push(
      '- ASYMMETRIC LEFT/RIGHT BODY-PART STYLING ACTIVE: Respect anatomical LEFT vs. RIGHT placement strictly (wearer\'s LEFT side vs. wearer\'s RIGHT side) when different gloves, watches, bracelets, rings, or earrings are equipped on opposite sides!'
    );
  }

  if (hasTop && hasTopMid) {
    layeringRules.push(
      '- Layer the mid-layer cardigan/vest/knit cleanly OVER the inner base top so the inner collar, cuffs, and hem remain naturally visible underneath.'
    );
  }
  if (hasOuterMid && (hasAnyTop || hasOnepiece)) {
    const outerMidItem = resolvedSlots.outer_mid;
    layeringRules.push(
      `- Layer the ${outerMidItem.colorName} mid-layer ${outerMidItem.subcategory || 'jacket'} cleanly OVER the inner top/knit with relaxed open front draping so inner collar and cardigan depth remain legible.${
        hasOuter
          ? ` Because the ${resolvedSlots.outer.colorName} outer coat is worn outside it, keep BOTH shoulders and sleeves uniformly in the outer coat's ${resolvedSlots.outer.colorName} color while the ${outerMidItem.colorName} mid-layer peeks gently at the inner chest lapels underneath.`
          : ''
      }`
    );
  }
  if (hasOuter) {
    const outerItem = resolvedSlots.outer;
    layeringRules.push(
      `- Render the outermost ${outerItem.colorName} ${outerItem.fabric} ${outerItem.subcategory || 'coat'} uniformly on BOTH the entire wearer-left side AND entire wearer-right side (both sleeves, both shoulders, both front panels, and full back) across EVERY view (${viewScopeText}). NEVER split the coat into two different colors left-vs-right, and NEVER drop the outer coat on side or rear views.`
    );
  }
  if (hasEquippedUmbrella || effectiveWeather === 'rain') {
    layeringRules.push(
      `- UMBRELLA UNDER-CANOPY NEGATIVE SPACE CUTOUT RULE: Keep the ENTIRE enclosed cavity underneath the open umbrella dome (between the canopy underside ribs, thin handle/shaft, crown/sides of the head, neck, and shoulders) filled 100% with flat uniform solid (${backdropHex}) backdrop color so background removal keys cleanly through — ZERO grey sky haze, ZERO dark overhang fill, ZERO shadow gradient inside the canopy loop.`
    );
  }
  if (hasOnepiece && isSwimwearOnepiece) {
    if (hasBottom) {
      layeringRules.push(
        '- Layer the equipped BOTTOM naturally over the lower half of the RESORT/SWIMWEAR ONEPIECE while keeping the upper rashguard/swimwear visible.'
      );
    } else {
      layeringRules.push(
        '- Style the RESORT/SWIMWEAR ONEPIECE cleanly as a standalone summer resort lookbook outfit without adding extra trousers or an extra T-shirt over it.'
      );
    }
  } else if (hasOnepiece && !hasBottom) {
    layeringRules.push(
      '- Render the ONEPIECE / DRESS / JUMPSUIT as the complete primary silhouette without adding studio trousers underneath.'
    );
  }

  if (!hasAnyTop && !hasOnepiece) {
    layeringRules.push(
      '- Since no top or onepiece is equipped, include a minimal neutral ecru (#EFECE6) crew-neck studio inner tee.'
    );
  }
  if (!hasBottom && !hasOnepiece) {
    layeringRules.push(
      '- Since no bottom or onepiece is equipped, pair with clean neutral stone-taupe (#D8D3C8) straight tailored studio trousers.'
    );
  }
  if (!hasShoes) {
    layeringRules.push(
      isSwimwearOnepiece && !hasBottom && !hasOuter
        ? '- Since standalone resort swimwear is equipped without shoes, complete the stance with minimal neutral resort slides (#EAE7E1).'
        : '- Since no shoes are equipped, complete the full-body stance with minimal off-white (#EAE7E1) low-profile studio court sneakers.'
    );
  }
  parts.push({ text: layeringRules.join('\n') });

  if (hasEquippedBag) {
    parts.push({
      text: `[CRITICAL CROSS-ANGLE BAG SHOULDER, STRAP & HAND-ROLE LOCK]: ${bagAnatomy.crossAngleLockPrompt}${
        profile.dominantHand === 'left' && bagAnatomy.bagCarryStyle !== 'backpack'
          ? ' [BAG ASSET MIRRORING ACTIVE]: Because the user profile handedness is set to LEFT-HANDED, mirror the attached bag reference asset horizontally onto the wearer\'s RIGHT side!'
          : ''
      }`,
    });
  }
  for (const slot of equippedKeys) {
    const item = resolvedSlots[slot];
    const placementCue =
      item.isBag || slot === 'accessory'
        ? bagAnatomy.slotPrompt
        : ANATOMICAL_SLOT_PLACEMENT_DIRECTIVES[slot] || '';
    const mirrorNote = item.bagAssetMirrored
      ? ' Horizontally mirror this bag onto the wearer\'s anatomical RIGHT shoulder/hand.'
      : '';
    const garmentDesc = `${item.colorName} ${item.fabric} ${item.subcategory || item.category}`.trim();
    const specLine = `Garment reference (${item.category || slot}): ${garmentDesc}.${placementCue ? ` Placement: ${placementCue}${mirrorNote}` : ''}`;
    if (item.packshot) {
      parts.push({
        text: `${specLine} Reproduce the exact silhouette, ${item.fabric} texture, and ${item.colorName} color from the reference image immediately below (${viewScopeText}). Do NOT render any text or labels in the output image:`,
      });
      parts.push({
        inlineData: {
          mimeType: item.packshot.mimeType,
          data: item.packshot.base64Data,
        },
      });
    } else {
      parts.push({
        text: `${specLine} Render with authentic ${item.fabric} texture and ${item.colorName} color (${viewScopeText}).`,
      });
    }
  }

  if (profile.qcCorrectionHint) {
    parts.push({
      text: `Correction directive for this retry: ${profile.qcCorrectionHint}`,
    });
  }

  parts.push({
    text: 'Final output rule: Generate ONLY the solitary full-body person wearing the garments on a completely blank solid uniform backdrop. STRICTLY ZERO text, ZERO captions, ZERO garment names, ZERO Korean or English letters, ZERO hex color codes, ZERO arrows, ZERO infographic callouts, and ZERO watermarks anywhere in the image.',
  });

  return parts;
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Buf(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeAscii, dataBuf) {
  const typeBuf = Buffer.from(typeAscii, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcInput = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32Buf(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function encodeRgbPngBase64(width, height, rgbBuf) {
  const stride = width * 3 + 1;
  const rawScanlines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const dstRow = y * stride;
    rawScanlines[dstRow] = 0;
    rgbBuf.copy(rawScanlines, dstRow + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(rawScanlines, { level: 6 });
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const full = Buffer.concat([
    pngSig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
  return full.toString('base64');
}

function parseHexToRgbTuple(hex, fallback = [148, 163, 184]) {
  const clean = String(hex || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [
    Number.parseInt(clean.slice(1, 3), 16),
    Number.parseInt(clean.slice(3, 5), 16),
    Number.parseInt(clean.slice(5, 7), 16),
  ];
}

function fillRgbRect(rgbBuf, imgW, imgH, x, y, w, h, rgb) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(imgW, Math.ceil(x + w));
  const y1 = Math.min(imgH, Math.ceil(y + h));
  for (let py = y0; py < y1; py += 1) {
    const rowOff = py * imgW * 3;
    for (let px = x0; px < x1; px += 1) {
      const idx = rowOff + px * 3;
      rgbBuf[idx] = rgb[0];
      rgbBuf[idx + 1] = rgb[1];
      rgbBuf[idx + 2] = rgb[2];
    }
  }
}

function paintGuideCellWithMirroredBag(
  rgbBuf,
  imgW,
  imgH,
  cellX,
  cellY,
  cellW,
  cellH,
  angleDeg,
  handedness,
  bagSpec = null
) {
  const cx = cellX + cellW * 0.5;
  const topY = cellY + cellH * 0.1;
  const botY = cellY + cellH * 0.9;
  const figH = botY - topY;
  const headH = figH / 7.5;
  const normalizedAngle =
    angleDeg === -45
      ? 315
      : angleDeg === -90
        ? 270
        : angleDeg === -135
          ? 225
          : TURNAROUND_ANGLES.includes(angleDeg)
            ? angleDeg
            : 0;
  const isSide = normalizedAngle === 90 || normalizedAngle === 270;
  const widthCompact = isSide ? 0.54 : normalizedAngle === 0 || normalizedAngle === 180 ? 1 : 0.85;
  const shoulderW = headH * 1.95 * widthCompact;
  const hipW = headH * 1.65 * widthCompact;
  const shoulderY = topY + headH * 1.42;
  const waistY = topY + headH * 3.1;
  const crotchY = topY + headH * 4.05;
  const bodyRgb = [108, 122, 142];
  const bagRgb = [196, 132, 68];

  // Head
  fillRgbRect(rgbBuf, imgW, imgH, cx - headH * 0.34, topY, headH * 0.68, headH * 0.94, bodyRgb);
  // Torso
  fillRgbRect(rgbBuf, imgW, imgH, cx - shoulderW * 0.5, shoulderY, shoulderW, crotchY - shoulderY, bodyRgb);
  // Legs
  if (isSide) {
    fillRgbRect(rgbBuf, imgW, imgH, cx - hipW * 0.28, crotchY, hipW * 0.56, botY - crotchY, bodyRgb);
  } else {
    fillRgbRect(rgbBuf, imgW, imgH, cx - hipW * 0.42, crotchY, hipW * 0.34, botY - crotchY, bodyRgb);
    fillRgbRect(rgbBuf, imgW, imgH, cx + hipW * 0.08, crotchY, hipW * 0.34, botY - crotchY, bodyRgb);
  }

  const placement = computeBagAssetPlacementBox({
    angleDeg: normalizedAngle,
    handedness,
    hasStrap: bagSpec?.hasStrap,
    bagCarryStyle: bagSpec?.bagCarryStyle,
    cx,
    shoulderY,
    waistY,
    shoulderW,
    hipW,
    headH,
    widthCompact,
  });
  if (placement.visible) {
    if (placement.strapRect) {
      fillRgbRect(
        rgbBuf,
        imgW,
        imgH,
        placement.strapRect.x,
        placement.strapRect.y,
        placement.strapRect.width,
        placement.strapRect.height,
        bagRgb
      );
    }
    if (placement.secondaryStrapRect) {
      fillRgbRect(
        rgbBuf,
        imgW,
        imgH,
        placement.secondaryStrapRect.x,
        placement.secondaryStrapRect.y,
        placement.secondaryStrapRect.width,
        placement.secondaryStrapRect.height,
        bagRgb
      );
    }
    if (placement.bagRect) {
      fillRgbRect(
        rgbBuf,
        imgW,
        imgH,
        placement.bagRect.x,
        placement.bagRect.y,
        placement.bagRect.width,
        placement.bagRect.height,
        bagRgb
      );
    }
  }
}

export function buildServerBagPositionGuidePngPart(
  profile,
  backdropHex = CUTOUT_STAGE_HEX,
  bagSpec = null
) {
  try {
    const bgRgb = parseHexToRgbTuple(backdropHex, [148, 163, 184]);
    const handedness = normalizeHandedness(profile?.dominantHand, 'right');
    if (profile?.turnaroundSheet) {
      const w = 360;
      const h = 240;
      const buf = Buffer.alloc(w * h * 3);
      fillRgbRect(buf, w, h, 0, 0, w, h, bgRgb);
      const cellW = w / 3;
      const cellH = h / 2;
      for (let i = 0; i < LEGACY_SHEET_6_ANGLES.length; i += 1) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        paintGuideCellWithMirroredBag(
          buf,
          w,
          h,
          col * cellW,
          row * cellH,
          cellW,
          cellH,
          LEGACY_SHEET_6_ANGLES[i],
          handedness,
          bagSpec
        );
      }
      return {
        mimeType: 'image/png',
        data: encodeRgbPngBase64(w, h, buf),
      };
    }

    const w = 180;
    const h = 240;
    const buf = Buffer.alloc(w * h * 3);
    fillRgbRect(buf, w, h, 0, 0, w, h, bgRgb);
    paintGuideCellWithMirroredBag(
      buf,
      w,
      h,
      0,
      0,
      w,
      h,
      normalizeIsoViewAngleDeg(profile?.viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE),
      handedness,
      bagSpec
    );
    return {
      mimeType: 'image/png',
      data: encodeRgbPngBase64(w, h, buf),
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic helper returning the full structured anti-bias multi-angle Gemini text prompt
 * for inspection, diagnostics, and verification.
 */
export function buildGeminiTryOnPrompt(profile, resolvedSlots = {}) {
  const normalized =
    profile && typeof profile.mstLevel === 'number' && typeof profile.bmi === 'number'
      ? profile
      : normalizeVtonProfile(profile);
  const parts =
    resolvedSlots && Object.keys(resolvedSlots).length > 0
      ? buildCompositeLookParts(normalized, resolvedSlots)
      : buildBaseModelParts(normalized);
  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('\n\n');
}

function extractInlineImageFromGeminiResponse(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const rawData = inline?.data;
      if (typeof rawData !== 'string' || !rawData.trim()) continue;
      const cleanB64 = rawData.replace(/\s+/g, '');
      let buf;
      try {
        buf = Buffer.from(cleanB64, 'base64');
      } catch {
        continue;
      }
      const detectedMime = detectImageMimeType(buf);
      const declaredMime = String(inline?.mimeType || inline?.mime_type || '').toLowerCase();
      const finalMime =
        detectedMime ||
        (declaredMime.startsWith('image/') ? declaredMime : null);
      if (!finalMime || buf.length === 0) continue;
      return `data:${finalMime};base64,${cleanB64}`;
    }
  }
  return null;
}

function buildVertexRequestTarget(model, vertexCfg) {
  if (vertexCfg?.enabled) {
    const baseUrl = vertexCfg.customEndpoint
      ? vertexCfg.customEndpoint.replace(/\{model\}/g, encodeURIComponent(model))
      : `https://${encodeURIComponent(vertexCfg.location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(vertexCfg.project)}/locations/${encodeURIComponent(vertexCfg.location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    const url = vertexCfg.apiKey
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(vertexCfg.apiKey)}`
      : baseUrl;
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'application/json' };
    if (vertexCfg.accessToken) {
      headers.Authorization = `Bearer ${vertexCfg.accessToken}`;
    }
    return { url, headers };
  }
  return null;
}

function classifyGeminiHttpError(statusCode, errStatus, errMsg, generationConfig) {
  const combinedErr = `${errStatus} ${errMsg}`.toLowerCase();

  if (
    statusCode === 400 &&
    (combinedErr.includes('api key not valid') ||
      combinedErr.includes('api_key_invalid') ||
      combinedErr.includes('invalid api key'))
  ) {
    return { action: 'return', reason: 'gemini_invalid_api_key' };
  }

  // If a model version rejects `imageConfig`, retry seamlessly without `imageConfig`
  if (statusCode === 400 && generationConfig?.imageConfig) {
    return { action: 'continue', reason: null };
  }

  if (statusCode === 401 || statusCode === 403) {
    if (combinedErr.includes('leaked') || combinedErr.includes('blocked')) {
      return { action: 'return', reason: 'gemini_leaked_key' };
    }
    const isBilling =
      combinedErr.includes('billing') ||
      combinedErr.includes('paid') ||
      combinedErr.includes('billing_disabled');
    return {
      action: 'return',
      reason: isBilling ? 'gemini_billing_required' : `gemini_http_${statusCode}`,
    };
  }

  if (statusCode === 429) {
    const isZeroFreeQuota =
      combinedErr.includes('billing') ||
      combinedErr.includes('free_tier') ||
      combinedErr.includes('limit: 0') ||
      combinedErr.includes('limit:0');
    return {
      action: 'break',
      reason: isZeroFreeQuota ? 'gemini_billing_required' : 'gemini_http_429',
    };
  }

  return {
    action: 'break',
    reason: statusCode ? `gemini_http_${statusCode}` : null,
  };
}

function isFatalCredentialReason(reason) {
  return (
    reason === 'gemini_api_key_not_configured' ||
    reason === 'gemini_invalid_api_key' ||
    reason === 'gemini_leaked_key' ||
    reason === 'gemini_billing_required' ||
    reason === 'gemini_network_error' ||
    reason === 'gemini_timeout_budget_exceeded' ||
    reason === 'gemini_http_401' ||
    reason === 'gemini_http_403'
  );
}

async function generateWithGeminiModelChain(
  parts,
  apiKey,
  modelChain,
  vertexCfg = null,
  options = {}
) {
  const startedAt = Date.now();
  let lastReason = 'gemini_no_image_generated';
  const isTurnaroundSheet = Boolean(options?.turnaroundSheet);
  const geminiClient = apiKey ? getServerGeminiClient(apiKey) : null;

  for (const model of modelChain) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_TOTAL_SYNTHESIS_MS) {
      lastReason = 'gemini_timeout_budget_exceeded';
      break;
    }
    const remainingTimeoutMs = Math.min(
      GEMINI_TIMEOUT_MS,
      Math.max(5000, MAX_TOTAL_SYNTHESIS_MS - elapsed)
    );
    const vertexTarget = !geminiClient ? buildVertexRequestTarget(model, vertexCfg) : null;
    if (!geminiClient && !vertexTarget) {
      lastReason = 'gemini_api_key_not_configured';
      break;
    }

    const supportsImageSize =
      model === 'gemini-nano-banana-2.1' ||
      model === 'gemini-3-pro-image' ||
      model.includes('pro-image');

    const requestConfigs = isTurnaroundSheet
      ? supportsImageSize
        ? [
            {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '3:2', imageSize: '1K' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:2', imageSize: '1K' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:2' },
            },
            {
              responseModalities: ['IMAGE'],
            },
          ]
        : [
            {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '3:2' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:2' },
            },
            {
              responseModalities: ['IMAGE'],
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          ]
      : supportsImageSize
        ? [
            {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '3:4', imageSize: '1K' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:4', imageSize: '1K' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:4' },
            },
            {
              responseModalities: ['IMAGE'],
            },
          ]
        : [
            {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '3:4' },
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '3:4' },
            },
            {
              responseModalities: ['IMAGE'],
            },
            {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          ];

    for (let stratIdx = 0; stratIdx < requestConfigs.length; stratIdx += 1) {
      const generationConfig = requestConfigs[stratIdx];
      const responseModalities = generationConfig.responseModalities;
      const innerElapsed = Date.now() - startedAt;
      if (innerElapsed >= MAX_TOTAL_SYNTHESIS_MS) {
        lastReason = 'gemini_timeout_budget_exceeded';
        break;
      }
      const attemptTimeoutMs = Math.min(
        remainingTimeoutMs,
        Math.max(5000, MAX_TOTAL_SYNTHESIS_MS - innerElapsed)
      );

      try {
        let json = null;

        if (geminiClient) {
          json = await geminiClient.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config: {
              responseModalities,
              ...(generationConfig.imageConfig
                ? { imageConfig: generationConfig.imageConfig }
                : {}),
              abortSignal: AbortSignal.timeout(attemptTimeoutMs),
            },
          });
        } else if (vertexTarget) {
          const res = await fetch(vertexTarget.url, {
            method: 'POST',
            headers: vertexTarget.headers,
            signal: AbortSignal.timeout(attemptTimeoutMs),
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig,
            }),
          });

          if (!res.ok) {
            const errPayload = await res.json().catch(() => null);
            const errMsg = String(errPayload?.error?.message || '');
            const errStatus = String(errPayload?.error?.status || '');
            console.warn(
              `[VTON Gemini] ${model} HTTP ${res.status} (${errStatus || 'ERR'}): ${errMsg.slice(0, 180)}`
            );
            const decision = classifyGeminiHttpError(
              res.status,
              errStatus,
              errMsg,
              generationConfig
            );
            if (decision.action === 'return') {
              return { ok: false, model: null, dataUrl: null, reason: decision.reason };
            }
            if (decision.action === 'continue') {
              continue;
            }
            if (
              decision.reason &&
              (decision.reason === 'gemini_billing_required' ||
                decision.reason === 'gemini_http_429' ||
                (lastReason !== 'gemini_billing_required' && lastReason !== 'gemini_http_429'))
            ) {
              lastReason = decision.reason;
            }
            break;
          }
          json = await res.json();
        }

        const dataUrl = extractInlineImageFromGeminiResponse(json);
        if (dataUrl) {
          return {
            ok: true,
            model,
            dataUrl,
            reason: null,
            latencyMs: Date.now() - startedAt,
          };
        }

        const finishReason = String(
          json?.candidates?.[0]?.finishReason ||
            json?.promptFeedback?.blockReason ||
            ''
        ).trim();
        lastReason = finishReason
          ? `gemini_empty_image_${finishReason.toLowerCase()}`
          : 'gemini_empty_image_part';

        console.warn(
          `[VTON Gemini] ${model} returned 200 without image part (${lastReason}, modalities=${responseModalities.join(',')})`
        );

        // Retry with ['IMAGE']-only modality if ['TEXT','IMAGE'] returned a plain text STOP
        if (responseModalities.includes('TEXT') && finishReason.toUpperCase() === 'STOP') {
          stratIdx =
            requestConfigs.findIndex((cfg) => !cfg.responseModalities.includes('TEXT')) - 1;
          if (stratIdx >= 0) continue;
        }
        break;
      } catch (err) {
        const statusCode = Number(err?.status ?? err?.statusCode ?? 0) || 0;
        const errMsg = String(err?.message || '');
        if (statusCode >= 400) {
          console.warn(`[VTON Gemini] ${model} SDK HTTP ${statusCode}: ${errMsg.slice(0, 180)}`);
          const decision = classifyGeminiHttpError(statusCode, '', errMsg, generationConfig);
          if (decision.action === 'return') {
            return { ok: false, model: null, dataUrl: null, reason: decision.reason };
          }
          if (decision.action === 'continue') {
            continue;
          }
          if (
            decision.reason &&
            (decision.reason === 'gemini_billing_required' ||
              decision.reason === 'gemini_http_429' ||
              (lastReason !== 'gemini_billing_required' && lastReason !== 'gemini_http_429'))
          ) {
            lastReason = decision.reason;
          }
          break;
        }
        const isAbort =
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError' ||
          errMsg.toLowerCase().includes('timeout');
        lastReason = isAbort ? 'gemini_timeout' : 'gemini_network_error';
        console.warn(`[VTON Gemini] ${model} exception (${lastReason}):`, errMsg || err);
        break; // try next faster model in modelChain if budget remains
      }
    }
  }

  return { ok: false, model: null, dataUrl: null, reason: lastReason };
}

export function getVtonServiceStatus() {
  const apiKey = resolveGeminiApiKey();
  const vertexCfg = resolveVertexAiConfig();
  const modelChain = resolveGeminiModelChain();
  return {
    ok: true,
    mode: VTON_MODE,
    stylePreset: VTON_STYLE_PRESET,
    supportedStyleModes: [...VALID_VTON_STYLE_MODES],
    turnaroundAngles: [...TURNAROUND_ANGLES],
    geminiConfigured: Boolean(apiKey || vertexCfg.enabled),
    vertexConfigured: Boolean(vertexCfg.enabled),
    model: modelChain[0] || 'gemini-3.1-flash-lite-image',
    cacheEntries: countTotalCacheEntries(),
  };
}

/**
 * Main Multimodal Gemini Virtual Try-On synthesis & server cache entry point.
 * Zero procedural fallback: returns `compositeImageUrl: null` with explicit `fallbackReason`
 * if Gemini/Vertex credentials are unconfigured or synthesis fails, allowing the client
 * to preserve the Editorial Flat-Lay Board cleanly.
 */
export async function synthesizeVtonLook(params = {}) {
  const rawProfile =
    params.profile ?? params.bodyProfile ?? params.userProfile ?? params;

  // Step 0: Explicitly check server-side profile configuration (`handedness`, default: `'right'`) before rendering!
  const serverProfileConfig = getServerProfileConfig({
    userId: params.userId ?? null,
    profileKey: params.profileKey ?? rawProfile?.profileKey ?? null,
  });
  const explicitHandednessOverride =
    params.handedness !== undefined && params.handedness !== null && params.handedness !== ''
      ? normalizeHandedness(params.handedness, serverProfileConfig.handedness)
      : null;
  const resolvedHandedness =
    explicitHandednessOverride ??
    (serverProfileConfig.hasStoredRecord
      ? serverProfileConfig.handedness
      : normalizeHandedness(
          rawProfile?.handedness ??
            rawProfile?.dominantHand ??
            params.avatarSpec?.dominantHand ??
            rawProfile?.avatarSpec?.dominantHand,
          serverProfileConfig.handedness
        ));

  const normalizedProfile = normalizeVtonProfile(
    rawProfile,
    params.portraitDataUrl ?? params.faceDataUrl ?? null,
    {
      avatarSpec: params.avatarSpec ?? rawProfile?.avatarSpec ?? null,
      avatarConfigHash: params.avatarConfigHash ?? rawProfile?.avatarConfigHash ?? null,
      dominantHand: resolvedHandedness,
      viewAngleDeg: params.viewAngleDeg ?? rawProfile?.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE,
      styleMode: params.styleMode ?? params.vtonStyle ?? rawProfile?.styleMode ?? null,
      weather: params.weather ?? params.weatherMood ?? rawProfile?.weather ?? null,
      turnaroundSheet: Boolean(
        params.turnaroundSheet ?? rawProfile?.turnaroundSheet ?? false
      ),
      masterAnchorDataUrl:
        params.masterAnchorDataUrl ?? rawProfile?.masterAnchorDataUrl ?? null,
      qcCorrectionHint: params.qcCorrectionHint ?? null,
    }
  );

  const authContext = {
    authorizedClosets: Array.isArray(params.authorizedClosets)
      ? params.authorizedClosets
      : [],
    isSampleGuest: Boolean(params.isSampleGuest),
    isAuthenticated: params.isAuthenticated,
    handedness: normalizedProfile.dominantHand,
  };

  const resolvedSlots = resolveEquippedVtonSlots(params, authContext);
  const equippedBagSlot =
    Object.values(resolvedSlots).find((item) => Boolean(item?.isBag)) || null;
  const hasEquippedBag = Boolean(equippedBagSlot);
  const bagHasStrap = equippedBagSlot ? equippedBagSlot.hasStrap : null;
  const bagCarryStyle = equippedBagSlot ? equippedBagSlot.bagCarryStyle : null;
  const bagAssetMirrored = Boolean(
    hasEquippedBag && normalizedProfile.dominantHand === 'left' && bagCarryStyle !== 'backpack'
  );
  const { baseHash, comboHash } = computeVtonHashes(normalizedProfile, resolvedSlots);

  const includeBaseModel = Boolean(params.includeBaseModel);
  const forceRefresh = Boolean(params.forceRefresh);
  const skipCacheWrite = Boolean(params.skipCacheWrite);
  const equippedSlots = Object.keys(resolvedSlots);
  const isBaseOnlyLook = equippedSlots.length === 0;
  const layout = normalizedProfile.turnaroundSheet ? 'turnaround_3x2' : 'single';

  const studioBackdropHex = selectOptimalStudioKeyHex(
    equippedSlots.map((slot) => {
      const item = resolvedSlots[slot];
      return {
        slot,
        category: item?.category ?? null,
        colorHex: item?.colorHex ?? null,
        colorName: item?.colorName ?? null,
        name: item?.name ?? null,
      };
    })
  );

  const comboCacheKey = isBaseOnlyLook ? `base-${baseHash}` : `combo-${comboHash}`;
  const baseCacheKey = `base-${baseHash}`;

  const buildFallbackResult = (fallbackReason, actualLayout = layout) => ({
    ok: true,
    mode: VTON_MODE,
    stylePreset: normalizedProfile.styleMode,
    styleMode: normalizedProfile.styleMode,
    weatherMood: normalizedProfile.weatherMood.key,
    layout: actualLayout,
    provider: 'flatlay-fallback',
    model: null,
    geminiUsed: false,
    cached: false,
    comboHash,
    baseHash,
    cacheKey: comboCacheKey,
    studioBackdropHex,
    viewAngleDeg: normalizedProfile.viewAngleDeg,
    avatarConfigHash: normalizedProfile.avatarConfigHash,
    handedness: normalizedProfile.dominantHand,
    bagAssetMirrored,
    compositeImageUrl: null,
    baseModelImageUrl: null,
    fallbackReason,
    equippedSlots,
  });

  // 1. Server Cache Lookup
  if (!forceRefresh) {
    const cachedCombo = getCacheEntry(comboCacheKey);
    const cachedBase = includeBaseModel ? getCacheEntry(baseCacheKey) : null;

    if (cachedCombo && (!includeBaseModel || cachedBase)) {
      return {
        ok: true,
        mode: VTON_MODE,
        stylePreset: normalizedProfile.styleMode,
        styleMode: normalizedProfile.styleMode,
        weatherMood: normalizedProfile.weatherMood.key,
        layout,
        provider: 'gemini-vton',
        model: cachedCombo.model,
        geminiUsed: true,
        cached: true,
        comboHash,
        baseHash,
        cacheKey: comboCacheKey,
        studioBackdropHex,
        viewAngleDeg: normalizedProfile.viewAngleDeg,
        avatarConfigHash: normalizedProfile.avatarConfigHash,
        handedness: normalizedProfile.dominantHand,
        bagAssetMirrored,
        compositeImageUrl: cachedCombo.dataUrl,
        baseModelImageUrl: includeBaseModel
          ? cachedBase?.dataUrl || null
          : isBaseOnlyLook
            ? cachedCombo.dataUrl
            : null,
        fallbackReason: null,
        equippedSlots,
        hasEquippedBag,
        bagHasStrap,
        bagCarryStyle,
      };
    }
  }

  // 2. Check Gemini / Vertex AI configuration
  const apiKey = resolveGeminiApiKey();
  const vertexCfg = resolveVertexAiConfig();
  if (!apiKey && !vertexCfg.enabled) {
    return buildFallbackResult('gemini_api_key_not_configured');
  }

  const modelChain = resolveGeminiModelChain();
  if (modelChain.length === 0) {
    return buildFallbackResult('gemini_model_not_configured');
  }

  // 3. Coalesce concurrent identical synthesis requests (scoped by key fingerprint so invalid/guest keys never poison valid concurrent requests)
  const keyFingerprint = apiKey
    ? crypto.createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 8)
    : 'srv';
  const flightKey = `${comboHash}:${layout}:${normalizedProfile.viewAngleDeg}:${includeBaseModel ? 1 : 0}:${forceRefresh ? 1 : 0}:${keyFingerprint}`;
  if (!forceRefresh && inFlightSyntheses.has(flightKey)) {
    return inFlightSyntheses.get(flightKey);
  }

  const runTask = (async () => {
    try {
      const existingCombo = !forceRefresh ? getCacheEntry(comboCacheKey) : null;
      const existingBase =
        !forceRefresh && includeBaseModel ? getCacheEntry(baseCacheKey) : null;

      if (isBaseOnlyLook) {
        let baseGen = existingCombo
          ? { ok: true, model: existingCombo.model, dataUrl: existingCombo.dataUrl, cached: true }
          : await generateWithGeminiModelChain(
              buildBaseModelParts(normalizedProfile),
              apiKey,
              modelChain,
              vertexCfg,
              { turnaroundSheet: normalizedProfile.turnaroundSheet }
            );
        let finalLayout = layout;
        let finalBaseCacheKey = baseCacheKey;

        if (
          (!baseGen.ok || !baseGen.dataUrl) &&
          normalizedProfile.turnaroundSheet &&
          !isFatalCredentialReason(baseGen.reason)
        ) {
          const singleProfile = { ...normalizedProfile, turnaroundSheet: false };
          const singleHashes = computeVtonHashes(singleProfile, resolvedSlots);
          finalBaseCacheKey = `base-${singleHashes.baseHash}`;
          const cachedSingle = !forceRefresh ? getCacheEntry(finalBaseCacheKey) : null;
          baseGen = cachedSingle
            ? { ok: true, model: cachedSingle.model, dataUrl: cachedSingle.dataUrl, cached: true }
            : await generateWithGeminiModelChain(
                buildBaseModelParts(singleProfile),
                apiKey,
                modelChain,
                vertexCfg,
                { turnaroundSheet: false }
              );
          if (baseGen.ok && baseGen.dataUrl) {
            finalLayout = 'single';
          }
        }

        if (!baseGen.ok || !baseGen.dataUrl) {
          return buildFallbackResult(baseGen.reason || 'gemini_synthesis_failed');
        }

        if (!baseGen.cached && !skipCacheWrite) {
          setCacheEntry(finalBaseCacheKey, {
            kind: 'base',
            model: baseGen.model,
            dataUrl: baseGen.dataUrl,
          });
        }

        return {
          ok: true,
          mode: VTON_MODE,
          stylePreset: normalizedProfile.styleMode,
          styleMode: normalizedProfile.styleMode,
          weatherMood: normalizedProfile.weatherMood.key,
          layout: finalLayout,
          provider: 'gemini-vton',
          model: baseGen.model,
          geminiUsed: true,
          cached: Boolean(baseGen.cached),
          comboHash,
          baseHash,
          cacheKey: finalBaseCacheKey,
          studioBackdropHex,
          viewAngleDeg: normalizedProfile.viewAngleDeg,
          avatarConfigHash: normalizedProfile.avatarConfigHash,
          handedness: normalizedProfile.dominantHand,
          bagAssetMirrored,
          compositeImageUrl: baseGen.dataUrl,
          baseModelImageUrl: baseGen.dataUrl,
          fallbackReason: null,
          equippedSlots,
        };
      }

      const comboPromise = existingCombo
        ? Promise.resolve({
            ok: true,
            model: existingCombo.model,
            dataUrl: existingCombo.dataUrl,
            fromCache: true,
          })
        : generateWithGeminiModelChain(
            buildCompositeLookParts(normalizedProfile, resolvedSlots),
            apiKey,
            modelChain,
            vertexCfg,
            { turnaroundSheet: normalizedProfile.turnaroundSheet }
          );

      const basePromise = !includeBaseModel
        ? Promise.resolve(null)
        : existingBase
          ? Promise.resolve({
              ok: true,
              model: existingBase.model,
              dataUrl: existingBase.dataUrl,
              fromCache: true,
            })
          : generateWithGeminiModelChain(
              buildBaseModelParts(normalizedProfile),
              apiKey,
              modelChain,
              vertexCfg,
              { turnaroundSheet: normalizedProfile.turnaroundSheet }
            );

      const [initialComboRes, baseRes] = await Promise.all([comboPromise, basePromise]);
      let comboRes = initialComboRes;
      let finalLayout = layout;
      let finalComboCacheKey = comboCacheKey;

      // Auto-recover from complex 2x2 turnaround grid to clean single-angle portrait if non-auth failure occurred
      if (
        (!comboRes || !comboRes.ok || !comboRes.dataUrl) &&
        normalizedProfile.turnaroundSheet &&
        !isFatalCredentialReason(comboRes?.reason)
      ) {
        const singleProfile = { ...normalizedProfile, turnaroundSheet: false };
        const singleHashes = computeVtonHashes(singleProfile, resolvedSlots);
        const singleKey = `combo-${singleHashes.comboHash}`;
        const cachedSingle = !forceRefresh ? getCacheEntry(singleKey) : null;
        if (cachedSingle) {
          comboRes = {
            ok: true,
            model: cachedSingle.model,
            dataUrl: cachedSingle.dataUrl,
            fromCache: true,
          };
          finalLayout = 'single';
          finalComboCacheKey = singleKey;
        } else {
          const retrySingle = await generateWithGeminiModelChain(
            buildCompositeLookParts(singleProfile, resolvedSlots),
            apiKey,
            modelChain,
            vertexCfg,
            { turnaroundSheet: false }
          );
          if (retrySingle?.ok && retrySingle.dataUrl) {
            comboRes = retrySingle;
            finalLayout = 'single';
            finalComboCacheKey = singleKey;
          }
        }
      }

      if (!comboRes || !comboRes.ok || !comboRes.dataUrl) {
        return buildFallbackResult(comboRes?.reason || 'gemini_synthesis_failed');
      }

      if (!comboRes.fromCache && !skipCacheWrite) {
        setCacheEntry(finalComboCacheKey, {
          kind: 'combo',
          model: comboRes.model,
          dataUrl: comboRes.dataUrl,
        });
      }

      let resolvedBaseUrl = null;
      if (includeBaseModel && baseRes?.ok && baseRes.dataUrl) {
        resolvedBaseUrl = baseRes.dataUrl;
        if (!baseRes.fromCache && !skipCacheWrite) {
          setCacheEntry(baseCacheKey, {
            kind: 'base',
            model: baseRes.model,
            dataUrl: baseRes.dataUrl,
          });
        }
      }

      return {
        ok: true,
        mode: VTON_MODE,
        stylePreset: normalizedProfile.styleMode,
        styleMode: normalizedProfile.styleMode,
        weatherMood: normalizedProfile.weatherMood.key,
        layout: finalLayout,
        provider: 'gemini-vton',
        model: comboRes.model,
        geminiUsed: true,
        cached: Boolean(comboRes.fromCache && (!includeBaseModel || baseRes?.fromCache)),
        comboHash,
        baseHash,
        cacheKey: finalComboCacheKey,
        studioBackdropHex,
        viewAngleDeg: normalizedProfile.viewAngleDeg,
        avatarConfigHash: normalizedProfile.avatarConfigHash,
        handedness: normalizedProfile.dominantHand,
        bagAssetMirrored,
        compositeImageUrl: comboRes.dataUrl,
        baseModelImageUrl: resolvedBaseUrl,
        fallbackReason: null,
        equippedSlots,
        hasEquippedBag,
        bagHasStrap,
        bagCarryStyle,
        latencyMs: Number(comboRes.latencyMs) || 0,
      };
    } catch {
      return buildFallbackResult('gemini_unexpected_error');
    } finally {
      inFlightSyntheses.delete(flightKey);
    }
  })();

  if (!forceRefresh) {
    inFlightSyntheses.set(flightKey, runTask);
  }
  return runTask;
}
