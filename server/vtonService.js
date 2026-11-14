import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import db, { DATA_DIR, ROOT_DIR, UPLOADS_DIR } from './db.js';

export const VTON_MODE = '2d-vton';
export const VTON_STYLE_PRESET = 'photorealistic';
export const VALID_VTON_STYLE_MODES = new Set(['photorealistic', 'stylized_isometric']);
export const TURNAROUND_ANGLES = Object.freeze([0, 45, 90, 180]);
export const VTON_CACHE_DIR = path.join(DATA_DIR, 'vton-cache');
export const SEED_DIR = path.join(ROOT_DIR, 'public', 'seed');

export const VTON_SLOTS = Object.freeze([
  'outer',
  'top',
  'onepiece',
  'dress',
  'bottom',
  'shoes',
  'accessory',
  'headwear',
  'neckwear',
  'gloves',
  'socks',
]);

const VTON_SLOT_SET = new Set(VTON_SLOTS);

export const ALL_ISO_VIEW_ANGLES = Object.freeze([45, 0, -45, -90, -135, 180, 135, 90]);
export const DEFAULT_ISO_VIEW_ANGLE = 45;

// Layering order for prompt clarity (from head/inner to outer/extremities)
const PROMPT_SLOT_ORDER = Object.freeze([
  'headwear',
  'onepiece',
  'top',
  'dress',
  'bottom',
  'outer',
  'neckwear',
  'gloves',
  'socks',
  'shoes',
  'accessory',
]);

const SLOT_ALIAS_MAP = Object.freeze({
  coat: 'outer',
  jacket: 'outer',
  outerwear: 'outer',
  blazer: 'outer',
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
const GEMINI_TIMEOUT_MS = 28000;
const MAX_TOTAL_SYNTHESIS_MS = 36000;
const MAX_MEM_CACHE = 96;
const MAX_DISK_CACHE = 120;
const CACHE_SCHEMA_VERSION = 'vton-multimodal-v3';

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

export function normalizeWeatherMood(rawWeather) {
  if (!rawWeather) {
    return { key: 'studio_neutral', description: 'balanced 5500K neutral studio cyclorama daylight' };
  }
  if (typeof rawWeather === 'string') {
    const token = rawWeather.trim().toLowerCase();
    if (token.includes('rain') || token.includes('비')) {
      return {
        key: 'rainy',
        description: 'cool overcast rainy-day editorial softbox illumination (6200K) with calm diffused atmospheric contrast',
      };
    }
    if (token.includes('wind') || token.includes('강풍')) {
      return {
        key: 'windy',
        description: 'crisp directional daylight studio key light with subtle natural breeze movement in outer hems and hair ends',
      };
    }
    if (token.includes('cold') || token.includes('freeze') || token.includes('한파')) {
      return {
        key: 'cold',
        description: 'crisp high-clarity winter daylight studio lighting (6000K) accentuating cozy wool, knit, and down loft',
      };
    }
    if (token.includes('warm') || token.includes('mild') || token.includes('포근')) {
      return {
        key: 'mild',
        description: 'warm-balanced golden spring/autumn daylight bounce (5000K) with gentle soft studio fill',
      };
    }
    if (token.includes('clear') || token.includes('sun') || token.includes('맑음')) {
      return {
        key: 'clear',
        description: 'bright crisp sunlit studio daylight (5600K) with clean soft floor contact shadow',
      };
    }
    return { key: 'studio_neutral', description: 'balanced 5500K neutral studio cyclorama daylight' };
  }

  if (typeof rawWeather === 'object') {
    const isRainy = Boolean(rawWeather.isRainy || rawWeather.isRaining);
    const isWindy = Boolean(rawWeather.isWindy);
    const scenario = String(rawWeather.scenarioKey || rawWeather.condition || rawWeather.mood || '').toLowerCase();
    const maxTemp = Number(rawWeather.tempMax ?? rawWeather.temperatureMax ?? rawWeather.temp);

    if (isRainy || scenario.includes('rain') || scenario.includes('비')) {
      return {
        key: 'rainy',
        description: 'cool overcast rainy-day editorial softbox illumination (6200K) with calm diffused atmospheric contrast',
      };
    }
    if (isWindy || scenario.includes('wind') || scenario.includes('강풍')) {
      return {
        key: 'windy',
        description: 'crisp directional daylight studio key light with subtle natural breeze movement in outer hems and hair ends',
      };
    }
    if (
      scenario.includes('cold') ||
      scenario.includes('한파') ||
      (Number.isFinite(maxTemp) && maxTemp <= 4)
    ) {
      return {
        key: 'cold',
        description: 'crisp high-clarity winter daylight studio lighting (6000K) accentuating cozy wool, knit, and down loft',
      };
    }
    if (
      scenario.includes('warm') ||
      scenario.includes('mild') ||
      scenario.includes('포근') ||
      (Number.isFinite(maxTemp) && maxTemp >= 18 && maxTemp <= 25)
    ) {
      return {
        key: 'mild',
        description: 'warm-balanced golden spring/autumn daylight bounce (5000K) with gentle soft studio fill',
      };
    }
    if (scenario.includes('clear') || scenario.includes('sun') || scenario.includes('맑음')) {
      return {
        key: 'clear',
        description: 'bright crisp sunlit studio daylight (5600K) with clean soft floor contact shadow',
      };
    }
  }

  return { key: 'studio_neutral', description: 'balanced 5500K neutral studio cyclorama daylight' };
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

export function resolveGeminiApiKey() {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_VTON_API_KEY ||
    '';
  return String(raw).trim();
}

export function resolveVertexAiConfig() {
  const customEndpoint = String(process.env.VERTEX_AI_ENDPOINT || '').trim();
  const project = String(
    process.env.VERTEX_AI_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || ''
  ).trim();
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim();
  const accessToken = String(process.env.VERTEX_AI_ACCESS_TOKEN || '').trim();
  const apiKey = String(process.env.VERTEX_AI_API_KEY || '').trim();

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
    process.env.GEMINI_VTON_MODEL ? String(process.env.GEMINI_VTON_MODEL).trim() : '',
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-exp-image-generation',
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
    clampNumber(src.heightCm ?? src.height_cm ?? anthro.heightCm, 140, 205, 172),
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
  const archetypePreset = normalizeEnumToken(
    rawAvatarSpec.archetypePreset,
    VALID_ARCHETYPES,
    bmi >= 30 ? 'plus_size' : bodyShape === 'muscular' ? 'athletic' : 'rectangle'
  );
  const chestForm = normalizeEnumToken(
    anthro.chestForm,
    VALID_CHEST_FORMS,
    framePreset === 'feminine' ? 'contoured' : framePreset === 'masculine' ? 'pectoral' : 'flat'
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

  return {
    viewAngleDeg,
    styleMode,
    weatherMood,
    turnaroundSheet,
    avatarConfigHash: rawAvatarHash || null,
    framePreset,
    archetypePreset,
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
  const { authorizedClosets = [], isSampleGuest = false, isAuthenticated } = authContext;
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
    for (const id of rawIds.slice(0, 16)) {
      assignCandidate(null, id);
    }
  }

  const rawArray = rawInput.garments ?? rawInput.items;
  if (Array.isArray(rawArray)) {
    for (const item of rawArray.slice(0, 16)) {
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
      packshot: packshot
        ? { mimeType: packshot.mimeType, base64Data: packshot.base64Data }
        : null,
      imageDigest: packshot ? packshot.imageDigest : 'none',
    };
  }

  return resolvedSlots;
}

/**
 * Computes deterministic SHA-256 `baseHash` and `comboHash` from normalized profile and sorted slot signatures.
 */
export function computeVtonHashes(normalizedProfile, resolvedSlots = {}) {
  const layoutKey = normalizedProfile.turnaroundSheet
    ? 'turnaround_2x2'
    : `single_${normalizedProfile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}`;
  const styleMode = normalizedProfile.styleMode || VTON_STYLE_PRESET;
  const weatherKey = normalizedProfile.weatherMood?.key || 'studio_neutral';

  const basePayload = {
    v: CACHE_SCHEMA_VERSION,
    styleMode,
    weatherKey,
    layoutKey,
    avatarConfigHash: normalizedProfile.avatarConfigHash || null,
    framePreset: normalizedProfile.framePreset,
    archetypePreset: normalizedProfile.archetypePreset,
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

  const comboHash = sha256Hex(
    JSON.stringify({
      v: CACHE_SCHEMA_VERSION,
      styleMode,
      weatherKey,
      layoutKey,
      baseHash,
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
      jsonFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
      const excessCount = jsonFiles.length - MAX_DISK_CACHE;
      for (let i = 0; i < excessCount; i += 1) {
        try {
          fs.unlinkSync(jsonFiles[i].fullPath);
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

function describeIsoCameraAngle(viewAngleDeg) {
  const angle = normalizeIsoViewAngleDeg(viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE);
  switch (angle) {
    case 45:
      return '45° Quarter-Front Right Isometric Turn-Based Simulation View (18° gentle studio camera elevation; figure turned 45° toward viewer-right so BOTH the front torso/face AND the viewer-left side depth plane are simultaneously visible, standing centered on a subtle warm-minimal diamond architectural plinth tile)';
    case 0:
      return '0° Direct Front Isometric-Editorial View (18° gentle studio camera elevation; figure facing directly forward 0° with symmetrical front face, chest, waist, and front shoe vamps centered on a subtle diamond plinth tile)';
    case -45:
      return '-45° Quarter-Front Left Isometric Turn-Based Simulation View (18° gentle studio camera elevation; figure turned -45° toward viewer-left so BOTH the front torso/face AND the viewer-right side depth plane are simultaneously visible on a subtle diamond plinth tile)';
    case 90:
      return '90° Strict Right-Facing Lateral Side Profile View (18° studio elevation; figure turned 90° sideways facing viewer-right, clearly showing true anterior-posterior chest, abdomen, and glute depth contour, side ear/jawline profile, side sleeve drape, and side shoe profile on a subtle diamond plinth tile)';
    case -90:
      return '-90° Strict Left-Facing Lateral Side Profile View (18° studio elevation; figure turned -90° sideways facing viewer-left, clearly showing true anterior-posterior chest, abdomen, and glute depth contour, side ear/jawline profile, side sleeve drape, and side shoe profile on a subtle diamond plinth tile)';
    case 135:
      return '135° Back-Quarter Right Isometric View (18° studio elevation; rear 3/4 view angled away toward back-right, showing back of head/hair, shoulder blades, rear garment construction/back drape, glute/hamstring contour, and subtle outer cheek/jaw edge WITHOUT front eyes or mouth on a subtle diamond plinth tile)';
    case -135:
      return '-135° Back-Quarter Left Isometric View (18° studio elevation; rear 3/4 view angled away toward back-left, showing back of head/hair, shoulder blades, rear garment construction/back drape, glute/hamstring contour, and subtle outer cheek/jaw edge WITHOUT front eyes or mouth on a subtle diamond plinth tile)';
    case 180:
      return '180° Strict Full Rear Back View (18° studio elevation; figure facing 180° directly away from camera showing ONLY the back of the head/hair/neck, rear shoulders, center-back garment seams/vents/back pockets, calves, and shoe heels on a subtle diamond plinth tile — render ZERO front facial features)';
    default:
      return '45° Quarter-Front Right Isometric Turn-Based Simulation View on a subtle diamond plinth tile';
  }
}

function describeMstLightingDirective(profile) {
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
    `Preserve delicate fair/light complexion (${profile.skinToneHex}) with subtle natural undertone warmth/coolness while keeping crisp charcoal-ink contour separation so skin never washes out into the #F5F5F7 studio background.`,
  ].join(' ');
}

function describeCoupledSoftTissueDirective(profile) {
  const { bmi, abdomenScale, hipScale, armMassScale, legMassScale, chestForm, chestScale } =
    profile;
  if (bmi >= 30 || abdomenScale >= 1.18 || profile.archetypePreset === 'plus_size') {
    return [
      `MANDATORY ANTI-SLIM-BIAS FULL-VOLUME LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg):`,
      'NEVER revert or idealize toward a thin fashion-illustration mannequin.',
      `Render authentic, dignified coupled soft-tissue volume consistently across EVERY anatomical zone: rounded fuller cheeks and softer lower-jawline/submental fullness (faceSoftnessBias=${profile.faceSoftnessBias}), thicker cylindrical neck column (neckThicknessBias=${profile.neckThicknessBias}), fuller upper arms, elbows, forearms, and wrists (armMassScale=${armMassScale}, limbSoftnessBias=${profile.limbSoftnessBias}), softer plump dorsal hands and fingers (extremityPlumpnessBias=${profile.extremityPlumpnessBias}), natural ${chestForm} chest volume (chestScale=${chestScale}), prominent rounded anterior & lateral abdomen fullness (abdomenScale=${abdomenScale}, torsoSoftnessBias=${profile.torsoSoftnessBias}), generous hip/glute/thigh/calf circumference (hipScale=${hipScale}, gluteScale=${profile.gluteScale}, legMassScale=${legMassScale}), grounded ankles, and wider foot/instep volume.`,
      'Drape every equipped garment realistically around this full 3D body volume with authentic fabric tension, ease, and hem circumference — NEVER shrink the body to fit the garment.',
    ].join(' ');
  }
  if (bmi >= 25.5 || abdomenScale >= 1.08) {
    return [
      `ANTI-SLIM-BIAS MID-PLUS VOLUME LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg):`,
      `Preserve visibly fuller, grounded real-world soft-tissue proportions across cheeks/jawline, neck, upper arms (armMassScale=${armMassScale}), ${chestForm} chest (chestScale=${chestScale}), waist/abdomen curve (abdomenScale=${abdomenScale}), and hips/thighs (hipScale=${hipScale}, legMassScale=${legMassScale}) — strictly forbid fashion-mannequin slimming.`,
    ].join(' ');
  }
  if (bmi <= 19.2) {
    return `SLENDER ANTHROPOMETRIC LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg): Render genuinely lean, slender proportions with delicate clavicles, narrow waist, and light wrist/ankle volume.`;
  }
  return `TRUE ANTHROPOMETRIC VOLUME LOCK (BMI ${bmi}, ${profile.heightCm} cm / ${profile.weightKg} kg): Honor exact segment scales (chestForm=${chestForm}, chestScale=${chestScale}, abdomenScale=${abdomenScale}, armMassScale=${armMassScale}, legMassScale=${legMassScale}, muscleDefinition=${profile.muscleDefinition}) faithfully without generic mannequin distortion.`;
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

function buildEditorialStyleAndBodyPrompt(profile) {
  const pcDesc =
    PERSONAL_COLOR_DESCRIPTIONS[profile.personalColor] ||
    PERSONAL_COLOR_DESCRIPTIONS.autumn_warm;
  const shapeDesc =
    BODY_SHAPE_DESCRIPTIONS[profile.bodyShape] ||
    BODY_SHAPE_DESCRIPTIONS.standard_balanced;

  const statureCue =
    profile.heightCm >= 182
      ? 'tall elongated vertical stature'
      : profile.heightCm <= 160
        ? 'compact grounded vertical stature'
        : 'natural medium adult stature';

  const cameraLock = describeIsoCameraAngle(profile.viewAngleDeg);
  const mstLightingLock = describeMstLightingDirective(profile);
  const softTissueLock = describeCoupledSoftTissueDirective(profile);
  const isStylizedIso = profile.styleMode === 'stylized_isometric';
  const weatherDesc =
    profile.weatherMood?.description ||
    'balanced 5500K neutral studio cyclorama daylight';

  const styleHeader = isStylizedIso
    ? [
        'Generate a high-craft Stylized Isometric Simulation Character Virtual Try-On lookbook sheet/portrait (tactile charming life-simulation character aesthetic with warm dimensional shading, refined appealing cranial & facial modeling, lush voluminous hair clusters, clean relaxed fingers, and authentic real-fabric texture fidelity).',
        '- NEVER draw crude flat 2D vector polygons or stick/mannequin limbs; render polished, high-craft studio simulation character art.',
      ]
    : [
        'Generate a high-fashion Photorealistic Commercial Studio Virtual Try-On lookbook photograph (SSENSE / COS / Totême studio campaign photography shot on medium-format 85mm f/5.6 studio lens, ultra-clean natural skin micro-texture, realistic hair strands, relaxed anatomical hands, and hyper-accurate real garment drape, seam thickness, and fabric weave).',
        '- Render a real, lifelike human fashion model matching the exact AvatarSpec below — ZERO CGI mannequin plastic sheen and ZERO cartoon outlines.',
      ];

  const cameraBlock = profile.turnaroundSheet
    ? [
        'CAMERA & 4-ANGLE 2x2 TURNAROUND STUDIO SHEET LOCK (MANDATORY):',
        '- Compose a clean, borderless 2x2 Grid Turnaround Studio Sheet divided into 4 equal quadrants (50% width x 50% height each) on a seamless solid #F5F5F7 studio cyclorama background, depicting the EXACT SAME PERSON wearing the EXACT SAME OUTFIT at identical head-to-toe scale in every quadrant:',
        '  * [Top-Left Quadrant — 0° Direct Front]: Full-body facing 0° straight toward the camera; symmetrical front garment fit, collar, chest, front trousers/skirt, and front shoe vamps.',
        '  * [Top-Right Quadrant — 45° Quarter View]: Full-body turned 45° three-quarter front-right; simultaneous front + side depth across shoulders, sleeves, torso, and footwear.',
        '  * [Bottom-Left Quadrant — 90° True Side Profile]: Full-body turned 90° lateral side profile facing right — MUST exhibit natural anatomical side cranium & occipital skull depth, full lush hair volume sweeping naturally across crown and back of head, natural relaxed arm/wrist/hand/finger posture at the side or pocket, and true lateral garment thickness, side seams, lapel/hood profile, and natural fabric folds.',
        '  * [Bottom-Right Quadrant — 180° Full Rear Back]: Full-body facing 180° directly away — showing ONLY the back of the head & hair, rear collar/yoke, center-back seams/vents/pockets, rear trouser drape, and shoe heels (render ZERO front facial features).',
        '- Keep generous head-to-toe margin inside each of the 4 quadrants so neither hair nor shoe soles touch quadrant edges. Render ZERO grid lines, ZERO dividing bars, ZERO text, and ZERO angle numbers.',
      ]
    : [
        'CAMERA & MULTI-ANGLE STUDIO POSE LOCK:',
        `- Exact View Angle (${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}°): ${cameraLock}.`,
        '- Full-body poised standing pose framed 100% from the top of the hair/headwear down to the complete soles of the shoes with clean studio margin above head and below feet (NEVER crop head, hands, or feet).',
        '- For 90° lateral side views, ensure authentic anatomical side cranium/jaw/ear profile, full dimensional hair volume at crown and back of head, natural relaxed hands/fingers, and true lateral garment thickness, side seams, and natural gravity folds.',
        '- Solid, clean neutral studio background in exact hex #F5F5F7 with natural soft floor contact shadow. Include ZERO text, ZERO angle numbers, ZERO UI labels, and ZERO extra figures.',
      ];

  return [
    ...styleHeader,
    '',
    ...cameraBlock,
    '',
    'STUDIO WEATHER & LIGHTING MOOD:',
    `- Active Weather Lighting Mood (${profile.weatherMood?.key || 'studio_neutral'}): Illuminate the model and fabrics with ${weatherDesc}, while keeping background studio cyclorama clean (#F5F5F7) and garment colors true.`,
    '',
    'INCLUSIVE ANTHROPOMETRIC, SOFT-TISSUE & COMPLEXION LOCK (ZERO MODEL BIAS):',
    `  * Stature & Mass: Exact Height ${profile.heightCm} cm (${statureCue}, legLengthScale=${profile.legLengthScale}), Exact Weight ${profile.weightKg} kg (BMI ${profile.bmi})`,
    `  * Gender / Non-Binary Presentation & Archetype: framePreset=${profile.framePreset}, archetypePreset=${profile.archetypePreset}, chestForm=${profile.chestForm}, legacyShape=${profile.bodyShape} (${shapeDesc})`,
    `  * Segment Scales: shoulder=${profile.shoulderScale}, chest=${profile.chestScale}, waist=${profile.waistScale}, abdomen=${profile.abdomenScale}, hip=${profile.hipScale}, glute=${profile.gluteScale}, armMass=${profile.armMassScale}, legMass=${profile.legMassScale}, muscleDefinition=${profile.muscleDefinition}`,
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
      ? 'stylized isometric character'
      : 'photorealistic studio fashion model';

  const featureSummary = `Head shape: ${profile.headShape}; Hair: ${hairDesc} in exact color ${profile.hairColorHex}; Facial hair: ${facialHairDesc}; Eye shape: ${profile.eyeShape} (scale ${profile.eyeSizeScale}); Nose width scale: ${profile.noseWidthScale}; Lip fullness scale: ${profile.lipFullnessScale}; Brow strength: ${profile.browStrength}.`;

  if (profile.portraitPart) {
    parts.push({
      text: [
        '[PORTRAIT / IDENTITY LIKENESS REFERENCE PHOTO ATTACHED BELOW]:',
        isTurnaround
          ? `Preserve this person's facial identity, cranial proportions (${featureSummary}), eyeglasses (if worn), and natural hair volume consistently across the 0° front, 45° quarter, 90° lateral profile, and 180° rear back views in unified ${mediumLabel} style with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`
          : isPureBack
            ? `Because the camera is at 180° full rear view, render ONLY the back of this person's head, hair/headwrap (${hairDesc}, ${profile.hairColorHex}), ears, and neck fullness with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}) — show ZERO front facial features.`
            : isBackQuarter
              ? `At ${angle}° back-quarter view, translate this person's rear/side hair silhouette (${hairDesc}, ${profile.hairColorHex}) and outer cheek/jawline contour (${profile.headShape}) with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}) without twisting the neck forward.`
              : `Preserve this person's craniofacial identity (${featureSummary}), eyeglasses (if present), and natural hair volume in unified ${mediumLabel} style at ${angle}° with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`,
      ].join(' '),
    });
    parts.push({
      inlineData: {
        mimeType: profile.portraitPart.mimeType,
        data: profile.portraitPart.base64Data,
      },
    });
  } else {
    parts.push({
      text: isTurnaround
        ? `[FACE & HAIR IDENTITY LOCK — 4-VIEW TURNAROUND]: ${featureSummary} Maintain 100% identical facial features, cranial depth, and ${hairDesc} volume across 0°, 45°, 90° side profile, and 180° back views in ${mediumLabel} style with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`
        : isPureBack
          ? `[HEAD & HAIR DIRECTION — 180° REAR VIEW]: Render the back of the head and ${hairDesc} in exact color ${profile.hairColorHex} above the neck in skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}), with ZERO front face features.`
          : `[FACE & HAIR IDENTITY LOCK — ${angle}° VIEW]: ${featureSummary} Render calm, natural editorial lookbook expression matching camera angle ${angle}° in ${mediumLabel} style with exact skin tone ${profile.skinToneHex} (MST-${profile.mstLevel}).`,
    });
  }
}

function buildBaseModelParts(profile) {
  const parts = [{ text: buildEditorialStyleAndBodyPrompt(profile) }];
  appendPortraitParts(parts, profile);
  const viewLabel = profile.turnaroundSheet
    ? 'all 4 turnaround views (0°, 45°, 90°, 180°)'
    : `${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}°`;
  parts.push({
    text: [
      '[STUDIO BASE MODEL ATTIRE]:',
      `- Dress the figure (${viewLabel}) in a minimal neutral ecru (#EFECE6) fitted crew-neck cotton studio T-shirt, clean tailored stone-ecru (#DFDBD2) knee-length studio shorts with crisp side seams, and minimal off-white (#EAE7E1) low-profile studio slip-on canvas shoes.`,
      '- Keep the silhouette clean and unobstructed so authentic body proportions, coupled soft-tissue volume, and MST complexion are unmistakably legible.',
    ].join('\n'),
  });
  return parts;
}

function buildCompositeLookParts(profile, resolvedSlots) {
  const equippedKeys = PROMPT_SLOT_ORDER.filter((slot) => Boolean(resolvedSlots[slot]));
  if (equippedKeys.length === 0) {
    return buildBaseModelParts(profile);
  }

  const parts = [{ text: buildEditorialStyleAndBodyPrompt(profile) }];
  appendPortraitParts(parts, profile);

  const onepieceItem = resolvedSlots.onepiece || resolvedSlots.dress || null;
  const hasOnepiece = Boolean(onepieceItem);
  const isSwimwearOnepiece = isResolvedSwimwearItem(onepieceItem);
  const hasTop = Boolean(resolvedSlots.top);
  const hasBottom = Boolean(resolvedSlots.bottom);
  const hasOuter = Boolean(resolvedSlots.outer);
  const hasShoes = Boolean(resolvedSlots.shoes);
  const viewScopeText = profile.turnaroundSheet
    ? 'ALL 4 TURNAROUND VIEWS (0° Front, 45° Quarter, 90° Side Profile, 180° Back)'
    : `${profile.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE}° VIEW`;

  const layeringRules = [
    `[OUTFIT LAYERING & REAL GARMENT PHOTO FIDELITY — ${viewScopeText}]:`,
    '- Dress the model in ALL of the equipped garments attached below simultaneously, reproducing each attached garment photograph\'s exact cut, length, collar/lapel shape, buttons/zippers, fabric weave, pattern, and exact hex color.',
    '- Render ONLY the equipped garments listed below — NEVER hallucinate unequipped coats, hats, or residual items.',
  ];

  if (hasOuter && (hasTop || hasOnepiece)) {
    layeringRules.push(
      '- Layer the OUTER garment naturally over the inner TOP/ONEPIECE (worn relaxed open at the front on 0°/45° views so the inner top remains visible, with realistic side thickness at 90° and full outer back construction at 180°).'
    );
  }
  if (hasOnepiece && isSwimwearOnepiece) {
    if (hasBottom) {
      layeringRules.push(
        '- Layer the equipped BOTTOM naturally over the lower half of the SWIMWEAR/ONEPIECE while keeping the upper swimwear/rashguard visible.'
      );
    } else {
      layeringRules.push(
        '- Render the SWIMWEAR ONEPIECE cleanly as solo resort/swim attire with natural bare legs (DO NOT add studio trousers or an extra T-shirt over the swimwear).'
      );
    }
  } else if (hasOnepiece && !hasBottom) {
    layeringRules.push(
      '- Render the ONEPIECE / DRESS / JUMPSUIT as the complete primary silhouette without adding studio trousers underneath.'
    );
  }

  if (!hasTop && !hasOnepiece) {
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
        ? '- Since solo swimwear is equipped without shoes, complete the stance with minimal neutral resort slides (#EAE7E1).'
        : '- Since no shoes are equipped, complete the full-body stance with minimal off-white (#EAE7E1) low-profile studio court sneakers.'
    );
  }
  parts.push({ text: layeringRules.join('\n') });

  for (const slot of equippedKeys) {
    const item = resolvedSlots[slot];
    const specLine = `[EQUIPPED ${slot.toUpperCase()}]: "${item.name}" | Type: ${item.category} (${item.subcategory}) | Exact Color: ${item.colorName} (${item.colorHex}) | Fabric: ${item.fabric} | Formality: ${item.formality}${item.brand ? ` | Brand mood: ${item.brand}` : ''}.`;
    if (item.packshot) {
      parts.push({
        text: `${specLine}\nAttached below is the real cutout photograph of [${slot.toUpperCase()}]. Reproduce its exact garment construction, texture, details, and color ${item.colorHex} naturally draped on the wearer (${viewScopeText}):`,
      });
      parts.push({
        inlineData: {
          mimeType: item.packshot.mimeType,
          data: item.packshot.base64Data,
        },
      });
    } else {
      parts.push({
        text: `${specLine}\nRender this [${slot.toUpperCase()}] (${viewScopeText}) with authentic ${item.fabric} drape, construction stitching, and exact color ${item.colorHex}.`,
      });
    }
  }

  return parts;
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

function buildModelRequestTarget(model, apiKey, vertexCfg) {
  if (apiKey) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
    };
  }
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

async function generateWithGeminiModelChain(parts, apiKey, modelChain, vertexCfg = null) {
  const startedAt = Date.now();
  let lastReason = 'gemini_no_image_generated';

  for (const model of modelChain) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_TOTAL_SYNTHESIS_MS) {
      lastReason = 'gemini_timeout_budget_exceeded';
      break;
    }
    const remainingTimeoutMs = Math.min(
      GEMINI_TIMEOUT_MS,
      Math.max(4000, MAX_TOTAL_SYNTHESIS_MS - elapsed)
    );
    const target = buildModelRequestTarget(model, apiKey, vertexCfg);
    if (!target) {
      lastReason = 'gemini_api_key_not_configured';
      break;
    }

    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers: target.headers,
        signal: AbortSignal.timeout(remainingTimeoutMs),
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      });

      if (!res.ok) {
        lastReason = `gemini_http_${res.status}`;
        if (res.status === 401 || res.status === 403) {
          break;
        }
        continue;
      }

      const json = await res.json();
      const dataUrl = extractInlineImageFromGeminiResponse(json);
      if (dataUrl) {
        return { ok: true, model, dataUrl, reason: null };
      }
      const finishReason = json?.candidates?.[0]?.finishReason;
      lastReason = finishReason
        ? `gemini_empty_image_${String(finishReason).toLowerCase()}`
        : 'gemini_empty_image_part';
    } catch (err) {
      const isAbort =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        String(err?.message || '').toLowerCase().includes('timeout');
      lastReason = isAbort ? 'gemini_timeout' : 'gemini_network_error';
      if (isAbort) {
        break;
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
    model: modelChain[0] || 'gemini-2.5-flash-image',
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
  const normalizedProfile = normalizeVtonProfile(
    rawProfile,
    params.portraitDataUrl ?? params.faceDataUrl ?? null,
    {
      avatarSpec: params.avatarSpec ?? rawProfile?.avatarSpec ?? null,
      avatarConfigHash: params.avatarConfigHash ?? rawProfile?.avatarConfigHash ?? null,
      viewAngleDeg: params.viewAngleDeg ?? rawProfile?.viewAngleDeg ?? DEFAULT_ISO_VIEW_ANGLE,
      styleMode: params.styleMode ?? params.vtonStyle ?? rawProfile?.styleMode ?? null,
      weather: params.weather ?? params.weatherMood ?? rawProfile?.weather ?? null,
      turnaroundSheet: Boolean(
        params.turnaroundSheet ?? rawProfile?.turnaroundSheet ?? false
      ),
    }
  );

  const authContext = {
    authorizedClosets: Array.isArray(params.authorizedClosets)
      ? params.authorizedClosets
      : [],
    isSampleGuest: Boolean(params.isSampleGuest),
    isAuthenticated: params.isAuthenticated,
  };

  const resolvedSlots = resolveEquippedVtonSlots(params, authContext);
  const { baseHash, comboHash } = computeVtonHashes(normalizedProfile, resolvedSlots);

  const includeBaseModel = Boolean(params.includeBaseModel);
  const forceRefresh = Boolean(params.forceRefresh);
  const equippedSlots = Object.keys(resolvedSlots);
  const isBaseOnlyLook = equippedSlots.length === 0;
  const layout = normalizedProfile.turnaroundSheet ? 'turnaround_2x2' : 'single';

  const comboCacheKey = isBaseOnlyLook ? `base-${baseHash}` : `combo-${comboHash}`;
  const baseCacheKey = `base-${baseHash}`;

  const buildFallbackResult = (fallbackReason) => ({
    ok: true,
    mode: VTON_MODE,
    stylePreset: normalizedProfile.styleMode,
    styleMode: normalizedProfile.styleMode,
    weatherMood: normalizedProfile.weatherMood.key,
    layout,
    provider: 'flatlay-fallback',
    model: null,
    geminiUsed: false,
    cached: false,
    comboHash,
    baseHash,
    viewAngleDeg: normalizedProfile.viewAngleDeg,
    avatarConfigHash: normalizedProfile.avatarConfigHash,
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
        viewAngleDeg: normalizedProfile.viewAngleDeg,
        avatarConfigHash: normalizedProfile.avatarConfigHash,
        compositeImageUrl: cachedCombo.dataUrl,
        baseModelImageUrl: includeBaseModel
          ? cachedBase?.dataUrl || null
          : isBaseOnlyLook
            ? cachedCombo.dataUrl
            : null,
        fallbackReason: null,
        equippedSlots,
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

  // 3. Coalesce concurrent identical synthesis requests
  const flightKey = `${comboHash}:${layout}:${normalizedProfile.viewAngleDeg}:${includeBaseModel ? 1 : 0}:${forceRefresh ? 1 : 0}`;
  if (!forceRefresh && inFlightSyntheses.has(flightKey)) {
    return inFlightSyntheses.get(flightKey);
  }

  const runTask = (async () => {
    try {
      const existingCombo = !forceRefresh ? getCacheEntry(comboCacheKey) : null;
      const existingBase =
        !forceRefresh && includeBaseModel ? getCacheEntry(baseCacheKey) : null;

      if (isBaseOnlyLook) {
        const baseGen = existingCombo
          ? { ok: true, model: existingCombo.model, dataUrl: existingCombo.dataUrl, cached: true }
          : await generateWithGeminiModelChain(
              buildBaseModelParts(normalizedProfile),
              apiKey,
              modelChain,
              vertexCfg
            );

        if (!baseGen.ok || !baseGen.dataUrl) {
          return buildFallbackResult(baseGen.reason || 'gemini_synthesis_failed');
        }

        if (!existingCombo) {
          setCacheEntry(baseCacheKey, {
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
          layout,
          provider: 'gemini-vton',
          model: baseGen.model,
          geminiUsed: true,
          cached: Boolean(existingCombo),
          comboHash,
          baseHash,
          viewAngleDeg: normalizedProfile.viewAngleDeg,
          avatarConfigHash: normalizedProfile.avatarConfigHash,
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
            vertexCfg
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
              vertexCfg
            );

      const [comboRes, baseRes] = await Promise.all([comboPromise, basePromise]);

      if (!comboRes || !comboRes.ok || !comboRes.dataUrl) {
        return buildFallbackResult(comboRes?.reason || 'gemini_synthesis_failed');
      }

      if (!comboRes.fromCache) {
        setCacheEntry(comboCacheKey, {
          kind: 'combo',
          model: comboRes.model,
          dataUrl: comboRes.dataUrl,
        });
      }

      let resolvedBaseUrl = null;
      if (includeBaseModel && baseRes?.ok && baseRes.dataUrl) {
        resolvedBaseUrl = baseRes.dataUrl;
        if (!baseRes.fromCache) {
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
        layout,
        provider: 'gemini-vton',
        model: comboRes.model,
        geminiUsed: true,
        cached: Boolean(comboRes.fromCache && (!includeBaseModel || baseRes?.fromCache)),
        comboHash,
        baseHash,
        viewAngleDeg: normalizedProfile.viewAngleDeg,
        avatarConfigHash: normalizedProfile.avatarConfigHash,
        compositeImageUrl: comboRes.dataUrl,
        baseModelImageUrl: resolvedBaseUrl,
        fallbackReason: null,
        equippedSlots,
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
