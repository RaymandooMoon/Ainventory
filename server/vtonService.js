import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import db, { DATA_DIR, ROOT_DIR, UPLOADS_DIR } from './db.js';

export const VTON_MODE = '2d-vton';
export const VTON_STYLE_PRESET = 'editorial_fashion_illustration';
export const VTON_CACHE_DIR = path.join(DATA_DIR, 'vton-cache');
export const SEED_DIR = path.join(ROOT_DIR, 'public', 'seed');

export const VTON_SLOTS = Object.freeze([
  'outer',
  'top',
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

// Layering order for prompt clarity (from head/inner to outer/extremities)
const PROMPT_SLOT_ORDER = Object.freeze([
  'headwear',
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
  onepiece: 'dress',
  gown: 'dress',
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
const GEMINI_TIMEOUT_MS = 26000;
const MAX_TOTAL_SYNTHESIS_MS = 32000;
const MAX_MEM_CACHE = 96;
const MAX_DISK_CACHE = 120;
const CACHE_SCHEMA_VERSION = 'vton-2d-editorial-v1';

const SAFE_BASENAME_RE = /^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/;
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

export function resolveGeminiApiKey() {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_VTON_API_KEY ||
    '';
  return String(raw).trim();
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
  if (key === 'slender' || key === 'ectomorph') return 'slim';
  if (key === 'athletic' || key === 'mesomorph') return 'muscular';
  if (key === 'inverted_triangle' || key === 'top_heavy') return 'upper_developed';
  if (key === 'pear' || key === 'bottom_heavy') return 'lower_developed';
  if (bmi < 18.8) return 'slim';
  return 'standard_balanced';
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
 * - `/seed/<basename>`: strictly validated basename inside `public/seed`, <= 4MB, magic bytes checked.
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
    const basename = path.basename(trimmed);
    if (
      trimmed !== `/seed/${basename}` ||
      basename.includes('..') ||
      basename === 'store-terracotta-cardigan.jpg' ||
      !SAFE_BASENAME_RE.test(basename)
    ) {
      return null;
    }

    const seedRoot = path.resolve(SEED_DIR);
    const fullPath = path.resolve(SEED_DIR, basename);
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
        imageDigest: `seed:${basename}:${sha256Hex(buffer).slice(0, 20)}`,
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
 * Normalizes physical proportion & complexion profile in a strictly gender-neutral way.
 * `gender` is intentionally ignored at all stages (prompting, ratios, and hashing).
 */
export function normalizeVtonProfile(rawProfile = {}, fallbackPortraitDataUrl = null) {
  const src = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  const morph = src.morph && typeof src.morph === 'object' ? src.morph : {};

  const skinToneHex = normalizeHexColor(src.skinToneHex ?? src.skin_tone_hex, '#DFBA9B');
  const personalColor = normalizePersonalColor(src.personalColor ?? src.personal_color);

  const heightCm = roundToStep(
    clampNumber(src.heightCm ?? src.height_cm, 145, 200, 172),
    0.5
  );
  const weightKg = roundToStep(
    clampNumber(src.weightKg ?? src.weight_kg, 38, 130, 64),
    0.5
  );
  const bmi = roundToStep(weightKg / (heightCm / 100) ** 2, 0.1);
  const bodyShape = normalizeBodyShape(src.bodyShape ?? src.body_shape, bmi);
  const shapeDefaults = DEFAULT_SCALES_BY_SHAPE[bodyShape] || DEFAULT_SCALES_BY_SHAPE.standard_balanced;

  const shoulderScale = roundToStep(
    clampNumber(
      src.shoulderScale ?? src.shoulder_scale ?? morph.shoulderWidthScale ?? morph.shoulderScale,
      0.8,
      1.25,
      shapeDefaults.shoulderScale
    ),
    0.01
  );
  const waistScale = roundToStep(
    clampNumber(
      src.waistScale ?? src.waist_scale ?? morph.waistWidthScale ?? morph.waistScale,
      0.75,
      1.3,
      shapeDefaults.waistScale
    ),
    0.01
  );
  const hipScale = roundToStep(
    clampNumber(
      src.hipScale ?? src.hip_scale ?? morph.hipWidthScale ?? morph.hipScale,
      0.8,
      1.25,
      shapeDefaults.hipScale
    ),
    0.01
  );

  const rawPortrait =
    src.portraitDataUrl ??
    src.faceDataUrl ??
    src.avatarFaceDataUrl ??
    fallbackPortraitDataUrl ??
    null;
  const portraitPart = rawPortrait
    ? decodeValidatedDataUrl(rawPortrait, MAX_DATA_URL_BYTES)
    : null;

  return {
    skinToneHex,
    personalColor,
    heightCm,
    weightKg,
    bmi,
    bodyShape,
    shoulderScale,
    waistScale,
    hipScale,
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
  const basePayload = {
    v: CACHE_SCHEMA_VERSION,
    stylePreset: VTON_STYLE_PRESET,
    skinToneHex: normalizedProfile.skinToneHex,
    personalColor: normalizedProfile.personalColor,
    heightCm: normalizedProfile.heightCm,
    weightKg: normalizedProfile.weightKg,
    bodyShape: normalizedProfile.bodyShape,
    shoulderScale: normalizedProfile.shoulderScale,
    waistScale: normalizedProfile.waistScale,
    hipScale: normalizedProfile.hipScale,
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

function buildEditorialStyleAndBodyPrompt(profile) {
  const pcDesc =
    PERSONAL_COLOR_DESCRIPTIONS[profile.personalColor] ||
    PERSONAL_COLOR_DESCRIPTIONS.autumn_warm;
  const shapeDesc =
    BODY_SHAPE_DESCRIPTIONS[profile.bodyShape] ||
    BODY_SHAPE_DESCRIPTIONS.standard_balanced;

  const statureCue =
    profile.heightCm >= 182
      ? 'tall elongated editorial vertical line'
      : profile.heightCm <= 160
        ? 'compact balanced vertical stature'
        : 'natural medium-tall lookbook stature';

  return [
    'Generate a single 2D full-body editorial fashion lookbook illustration in modern ligne-claire pen-and-ink style (POPEYE Magazine Tokyo / contemporary Japanese-French editorial lookbook aesthetic).',
    '',
    'VISUAL STYLE & LINEWORK RULES:',
    '- Crisp, organic dark charcoal-ink pen outlines (#1D1D1F) with clean, confident continuous line weight.',
    '- Articulate tailored garment construction clearly with fine pen lines: collar roll, lapels, buttons, pocket welts, cuffs, hem break, topstitching, fabric weave/ribbing, and natural gravity-driven drape creases.',
    '- Flat-to-subtle matte gouache color washes that preserve authentic garment colors without glossy airbrush gradients, 3D CGI plastic rendering, photorealism, or anime/manga exaggeration.',
    '- Natural ~7.8-head adult lookbook proportions.',
    '- Front-facing, relaxed, poised full-body standing studio pose, framed 100% from the crown of the head down to the complete soles of the shoes with clean studio margin above head and below feet (NEVER crop the head, hands, or shoes).',
    '- Solid, clean, bright neutral studio background in exact hex #F5F5F7 with only a subtle soft contact shadow directly beneath the soles. Include ZERO text, ZERO labels, ZERO color swatches, ZERO extra figures, and ZERO background props.',
    '',
    'STRICTLY GENDER-NEUTRAL ANATOMICAL PROPORTIONS & COMPLEXION:',
    '- Render an authentic, contemporary gender-neutral adult lookbook silhouette governed strictly by these physical measurements:',
    `  * Height: ${profile.heightCm} cm (${statureCue})`,
    `  * Weight: ${profile.weightKg} kg (BMI ${profile.bmi})`,
    `  * Body shape: ${profile.bodyShape} — ${shapeDesc}`,
    `  * Quantitative frame scales: shoulderScale=${profile.shoulderScale}, waistScale=${profile.waistScale}, hipScale=${profile.hipScale}`,
    `  * Skin complexion: render all visible skin (face, neck, hands, and any exposed ankle/leg) in exact hex ${profile.skinToneHex} with ${pcDesc}.`,
  ].join('\n');
}

function appendPortraitParts(parts, profile) {
  if (profile.portraitPart) {
    parts.push({
      text: [
        '[PORTRAIT / FACE LIKENESS REFERENCE PHOTO ATTACHED BELOW]:',
        `Translate this person's facial structure, brow/eye/nose/lip proportions, eyeglasses (if present), and natural hair silhouette & parting into a cohesive, refined 2D ligne-claire editorial pen-and-ink illustration face with exact skin tone ${profile.skinToneHex}.`,
        'Keep face and body 100% unified in hand-inked 2D illustration style — never paste raw photographic pixels.',
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
      text: `[FACE & HAIR DIRECTION]: Draw a calm, modern, approachable editorial lookbook face with minimalist dark-ink pen features (clean dot/fine-stroke eyes, subtle nose line, relaxed neutral expression), neat contemporary dark-espresso hair silhouette, and exact skin tone ${profile.skinToneHex}.`,
    });
  }
}

function buildBaseModelParts(profile) {
  const parts = [{ text: buildEditorialStyleAndBodyPrompt(profile) }];
  appendPortraitParts(parts, profile);
  parts.push({
    text: [
      '[STUDIO BASE MODEL ATTIRE]:',
      '- Dress the figure in a minimal neutral ecru (#EFECE6) fitted crew-neck cotton studio T-shirt, clean tailored stone-ecru (#DFDBD2) knee-length studio shorts with crisp side seams, and minimal off-white (#EAE7E1) low-profile studio slip-on canvas shoes.',
      '- Keep the silhouette clean and unobstructed so body proportions and personal color complexion are clearly legible.',
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

  const hasTop = Boolean(resolvedSlots.top);
  const hasDress = Boolean(resolvedSlots.dress);
  const hasBottom = Boolean(resolvedSlots.bottom);
  const hasOuter = Boolean(resolvedSlots.outer);
  const hasShoes = Boolean(resolvedSlots.shoes);

  const layeringRules = [
    '[OUTFIT LAYERING & GARMENT FIDELITY INSTRUCTIONS]:',
    '- Dress the single full-body figure in ALL of the equipped garments listed below simultaneously, matching each garment packshot reference image, cut, fabric texture, and exact hex color.',
  ];
  if (hasOuter && (hasTop || hasDress)) {
    layeringRules.push(
      '- Wear the OUTER garment naturally open or relaxed-unbuttoned at the front so the inner TOP/DRESS neckline and chest remain clearly visible.'
    );
  }
  if (hasDress && !hasBottom) {
    layeringRules.push('- Render the DRESS as the primary one-piece silhouette.');
  }
  if (!hasTop && !hasDress) {
    layeringRules.push(
      '- Since no top/dress is equipped, include a minimal neutral ecru (#EFECE6) crew-neck studio inner tee beneath outerwear/accessories.'
    );
  }
  if (!hasBottom && !hasDress) {
    layeringRules.push(
      '- Since no bottom/dress is equipped, pair with clean neutral stone-taupe (#D8D3C8) straight tailored studio trousers.'
    );
  }
  if (!hasShoes) {
    layeringRules.push(
      '- Since no shoes are equipped, complete the full-body stance with minimal off-white (#EAE7E1) low-profile studio court sneakers.'
    );
  }
  parts.push({ text: layeringRules.join('\n') });

  for (const slot of equippedKeys) {
    const item = resolvedSlots[slot];
    const specLine = `[EQUIPPED ${slot.toUpperCase()}]: "${item.name}" | Type: ${item.category} (${item.subcategory}) | Exact Color: ${item.colorName} (${item.colorHex}) | Fabric: ${item.fabric} | Formality: ${item.formality}${item.brand ? ` | Brand mood: ${item.brand}` : ''}.`;
    if (item.packshot) {
      parts.push({
        text: `${specLine}\nUse the attached packshot image right below as the exact visual reference for [${slot.toUpperCase()}], translating its silhouette, details, pattern, and color ${item.colorHex} into the 2D ligne-claire editorial illustration:`,
      });
      parts.push({
        inlineData: {
          mimeType: item.packshot.mimeType,
          data: item.packshot.base64Data,
        },
      });
    } else {
      parts.push({
        text: `${specLine}\nRender this [${slot.toUpperCase()}] with authentic ${item.fabric} drape, construction stitching, and exact color ${item.colorHex}.`,
      });
    }
  }

  return parts;
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

async function generateWithGeminiModelChain(parts, apiKey, modelChain) {
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        // Fast-fail if API key itself is unauthorized/invalid across all models
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
  const modelChain = resolveGeminiModelChain();
  return {
    ok: true,
    mode: VTON_MODE,
    stylePreset: VTON_STYLE_PRESET,
    geminiConfigured: Boolean(apiKey),
    model: modelChain[0] || 'gemini-2.5-flash-image',
    cacheEntries: countTotalCacheEntries(),
  };
}

/**
 * Main 2D Editorial Fashion Virtual Try-On synthesis & server cache entry point.
 * Never throws on missing API key or upstream failure; always resolves with `{ ok: true, ... }`.
 */
export async function synthesizeVtonLook(params = {}) {
  const rawProfile =
    params.profile ?? params.bodyProfile ?? params.userProfile ?? params;
  const normalizedProfile = normalizeVtonProfile(
    rawProfile,
    params.portraitDataUrl ?? params.faceDataUrl ?? null
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

  const comboCacheKey = isBaseOnlyLook ? `base-${baseHash}` : `combo-${comboHash}`;
  const baseCacheKey = `base-${baseHash}`;

  const buildFallbackResult = (fallbackReason) => ({
    ok: true,
    mode: VTON_MODE,
    stylePreset: VTON_STYLE_PRESET,
    provider: 'client-editorial-2d',
    model: null,
    geminiUsed: false,
    cached: false,
    comboHash,
    baseHash,
    compositeImageUrl: null,
    baseModelImageUrl: null,
    fallbackReason,
    equippedSlots,
  });

  // 1. Server Cache Lookup (works even if key was used earlier)
  if (!forceRefresh) {
    const cachedCombo = getCacheEntry(comboCacheKey);
    const cachedBase = includeBaseModel ? getCacheEntry(baseCacheKey) : null;

    if (cachedCombo && (!includeBaseModel || cachedBase)) {
      return {
        ok: true,
        mode: VTON_MODE,
        stylePreset: VTON_STYLE_PRESET,
        provider: 'gemini-editorial-2d',
        model: cachedCombo.model,
        geminiUsed: true,
        cached: true,
        comboHash,
        baseHash,
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

  // 2. Check Gemini API Key configuration
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return buildFallbackResult('gemini_api_key_not_configured');
  }

  const modelChain = resolveGeminiModelChain();
  if (modelChain.length === 0) {
    return buildFallbackResult('gemini_model_not_configured');
  }

  // 3. Coalesce concurrent identical synthesis requests
  const flightKey = `${comboHash}:${includeBaseModel ? 1 : 0}:${forceRefresh ? 1 : 0}`;
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
              modelChain
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
          stylePreset: VTON_STYLE_PRESET,
          provider: 'gemini-editorial-2d',
          model: baseGen.model,
          geminiUsed: true,
          cached: Boolean(existingCombo),
          comboHash,
          baseHash,
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
            modelChain
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
              modelChain
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
        stylePreset: VTON_STYLE_PRESET,
        provider: 'gemini-editorial-2d',
        model: comboRes.model,
        geminiUsed: true,
        cached: Boolean(comboRes.fromCache && (!includeBaseModel || baseRes?.fromCache)),
        comboHash,
        baseHash,
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
