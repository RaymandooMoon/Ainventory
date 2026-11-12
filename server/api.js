import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPersonalColorLabels,
  getStudioSeedImageForGarment,
  resolveManifestSlotAndGlb,
} from '../src/shared/garmentTaxonomy.js';
import db, {
  DB_PATH,
  OUTBOX_DIR,
  SQLITE_DRIVER,
  UPLOADS_DIR,
  computeVerificationHash,
  hashPassword,
  initDb,
  seedIfEmpty,
  verifyPassword,
} from './db.js';
import {
  analyzeShoppingCandidate,
  buildTripPackingList,
  buildWeatherRecommendations,
  fetchTomorrowWeather,
} from './engine.js';
import {
  AGE_GROUPS,
  BODY_SHAPE_OPTIONS,
  WEAR_SLOTS,
  computeBodyMetrics,
  generateStatisticalWardrobeForUser,
  normalizeAgeGroupKey,
  normalizeBodyShapeKey,
} from './wardrobeStatsAndGenerator.js';

initDb();

// Curated Sample Capsule Catalog (Requirement 8.a: separated from real user empty closets, selectable for import)
export const SAMPLE_CAPSULE_CATALOG = [
  {
    key: 'sample_trench',
    name: '발수 코튼 개버딘 트렌치코트',
    category: 'outer',
    subcategory: 'trench',
    fabric: 'gabardine',
    color_name: '베이지',
    color_hex: '#C4B193',
    seasons: ['봄', '가을'],
    min_temp: 9,
    max_temp: 19,
    water_resistant: true,
    formality: 'smart',
    brand: 'Sample Atelier',
    price: 290000,
    image_url: '/seed/beige-trench.jpg',
  },
  {
    key: 'sample_coat',
    name: '더블 페이스 캐시미어 테일러드 코트',
    category: 'outer',
    subcategory: 'coat',
    fabric: 'wool',
    color_name: '카멜',
    color_hex: '#BA9163',
    seasons: ['가을', '겨울'],
    min_temp: -5,
    max_temp: 11,
    water_resistant: false,
    formality: 'formal',
    brand: 'Sample Atelier',
    price: 420000,
    image_url: '/seed/studio-coat.jpg',
  },
  {
    key: 'sample_knit_navy',
    name: '파인 메리노 크루넥 니트',
    category: 'top',
    subcategory: 'knit',
    fabric: 'knit',
    color_name: '네이비',
    color_hex: '#1D273B',
    seasons: ['봄', '가을', '겨울'],
    min_temp: 4,
    max_temp: 18,
    water_resistant: false,
    formality: 'smart',
    brand: 'Sample Atelier',
    price: 135000,
    image_url: '/seed/navy-knit.jpg',
  },
  {
    key: 'sample_shirt_white',
    name: '수피마 코튼 옥스포드 셔츠',
    category: 'top',
    subcategory: 'shirt',
    fabric: 'cotton',
    color_name: '화이트',
    color_hex: '#F2F1EC',
    seasons: ['봄', '여름', '가을', '겨울'],
    min_temp: 8,
    max_temp: 25,
    water_resistant: false,
    formality: 'smart',
    brand: 'Sample Atelier',
    price: 119000,
    image_url: '/seed/white-shirt.jpg',
  },
  {
    key: 'sample_slacks_charcoal',
    name: '울 블렌드 원턱 와이드 슬랙스',
    category: 'bottom',
    subcategory: 'slacks',
    fabric: 'wool',
    color_name: '차콜',
    color_hex: '#35383E',
    seasons: ['봄', '가을', '겨울'],
    min_temp: 0,
    max_temp: 22,
    water_resistant: false,
    formality: 'smart',
    brand: 'Sample Atelier',
    price: 165000,
    image_url: '/seed/charcoal-slacks.jpg',
  },
  {
    key: 'sample_denim_indigo',
    name: '셀비지 스트레이트 데님',
    category: 'bottom',
    subcategory: 'denim',
    fabric: 'denim',
    color_name: '인디고',
    color_hex: '#284064',
    seasons: ['봄', '여름', '가을', '겨울'],
    min_temp: 2,
    max_temp: 26,
    water_resistant: false,
    formality: 'casual',
    brand: 'Sample Atelier',
    price: 149000,
    image_url: '/seed/indigo-denim.jpg',
  },
  {
    key: 'sample_sneakers_white',
    name: '미니멀 레더 코트 스니커즈',
    category: 'shoes',
    subcategory: 'sneakers',
    fabric: 'leather',
    color_name: '화이트',
    color_hex: '#EAE7E1',
    seasons: ['봄', '여름', '가을', '겨울'],
    min_temp: -2,
    max_temp: 32,
    water_resistant: true,
    formality: 'casual',
    brand: 'Sample Atelier',
    price: 218000,
    image_url: '/seed/white-sneakers.jpg',
  },
  {
    key: 'sample_muffler_camel',
    name: '퓨어 캐시미어 프린지 머플러',
    category: 'neckwear',
    subcategory: 'scarf',
    fabric: 'wool',
    color_name: '카멜',
    color_hex: '#B58E63',
    seasons: ['가을', '겨울'],
    min_temp: -12,
    max_temp: 11,
    water_resistant: false,
    formality: 'smart',
    brand: 'Sample Atelier',
    price: 195000,
    image_url: '/seed/studio-muffler.jpg',
  },
  {
    key: 'sample_briefcase_brown',
    name: '이탈리안 풀그레인 레더 서류가방',
    category: 'accessory',
    subcategory: 'briefcase',
    fabric: 'leather',
    color_name: '브라운',
    color_hex: '#5C3A24',
    seasons: ['봄', '여름', '가을', '겨울'],
    min_temp: -10,
    max_temp: 35,
    water_resistant: true,
    formality: 'formal',
    brand: 'Sample Atelier',
    price: 450000,
    image_url: '/seed/studio-briefcase.jpg',
  },
  {
    key: 'sample_gloves_leather',
    name: '나파 레더 캐시미어 라이닝 장갑',
    category: 'gloves',
    subcategory: 'leather_gloves',
    fabric: 'leather',
    color_name: '블랙',
    color_hex: '#242120',
    seasons: ['겨울'],
    min_temp: -15,
    max_temp: 7,
    water_resistant: true,
    formality: 'formal',
    brand: 'Sample Atelier',
    price: 128000,
    image_url: '/seed/studio-leather-gloves.jpg',
  },
];

// Rate limiting & OTP memory stores with bounded sweep (Requirement 10.b)
const rateBuckets = new Map();
const emailOtpPending = new Map();
const RESEND_COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_DISPATCH_PER_WINDOW = 5;
const MAX_VERIFY_FAILS_PER_WINDOW = 5;
const MAX_AUTH_ATTEMPTS_PER_WINDOW = 15;
const MAX_MAP_ENTRIES = 2000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIN_PASSWORD_LEN = 6;
const MAX_PASSWORD_LEN = 128;

let appleJwksCache = { fetchedAt: 0, keys: [] };

function isDevOtpPreviewAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP_PREVIEW === 'true';
}

function sweepBoundedMap(map, ttlMs = WINDOW_MS) {
  const now = Date.now();
  if (map.size > 256) {
    for (const [k, v] of map.entries()) {
      const refTime = v?.windowStart ?? v?.createdAt ?? v?.lastSentAt ?? 0;
      if (now - refTime > ttlMs) {
        map.delete(k);
      }
    }
  }
  while (map.size >= MAX_MAP_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function checkRateLimit(bucketKey, maxCount) {
  sweepBoundedMap(rateBuckets, WINDOW_MS);
  const now = Date.now();
  const entry = rateBuckets.get(bucketKey);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateBuckets.set(bucketKey, { windowStart: now, count: 1, lastAt: now });
    return { allowed: true, remaining: maxCount - 1, retryAfterSec: 0 };
  }
  if (entry.count >= maxCount) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  entry.count += 1;
  entry.lastAt = now;
  return { allowed: true, remaining: maxCount - entry.count, retryAfterSec: 0 };
}

function peekRateLimitBlocked(bucketKey, maxCount) {
  const now = Date.now();
  const entry = rateBuckets.get(bucketKey);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    return { blocked: false, retryAfterSec: 0 };
  }
  if (entry.count >= maxCount) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)),
    };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function timingSafeStringEquals(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const bufA = Buffer.from(expected, 'utf8');
  const bufB = Buffer.from(provided, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSafeSlug(raw, fallback = 'member') {
  const cleaned = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function escapeIcsText(raw) {
  return String(raw ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function safeParseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [...fallback];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

function detectImageMagicExt(buffer) {
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
    return 'png';
  }
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function sanitizeOwnerPrefix(ownerPrefix) {
  return (
    String(ownerPrefix || 'closet')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 40) || 'closet'
  );
}

function validateAndDecodeDataUrl(dataUrl) {
  const match = String(dataUrl).match(
    /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) {
    return { ok: false, status: 400, error: '지원하지 않는 이미지 데이터 형식입니다.' };
  }
  const b64 = match[2].replace(/\s+/g, '');
  // Fast pre-check before allocating buffer (> 5MB decoded ~= 6.99M base64 chars)
  if (!b64 || b64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 16) {
    return { ok: false, status: 413, error: '업로드 이미지는 최대 5MB 이하만 허용됩니다.' };
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: '업로드 이미지는 최대 5MB 이하만 허용됩니다.' };
  }
  const magicExt = detectImageMagicExt(buffer);
  if (!magicExt) {
    return {
      ok: false,
      status: 400,
      error: '유효하지 않은 이미지 파일 헤더입니다. (PNG/JPEG/WEBP만 허용)',
    };
  }
  return { ok: true, buffer, ext: magicExt };
}

function saveDataUrlImage(dataUrl, ownerPrefix, fallbackUrl = '/seed/cream-knit.jpg', options = {}) {
  const { persistToDisk = true } = options;
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { ok: true, url: fallbackUrl };
  }

  const trimmed = dataUrl.trim();
  if (trimmed.startsWith('/seed/')) {
    const base = path.basename(trimmed);
    if (
      trimmed !== `/seed/${base}` ||
      base === 'store-terracotta-cardigan.jpg' ||
      !/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(base)
    ) {
      return { ok: true, url: fallbackUrl };
    }
    return { ok: true, url: trimmed };
  }

  const safeOwner = sanitizeOwnerPrefix(ownerPrefix);

  if (trimmed.startsWith('/uploads/')) {
    const base = path.basename(trimmed);
    if (trimmed !== `/uploads/${base}` || !/^[a-zA-Z0-9_.-]+\.(jpg|png|webp)$/.test(base)) {
      return { ok: false, status: 400, error: '유효하지 않은 업로드 경로입니다.' };
    }
    const normalizedPath = `/uploads/${base}`;
    const hasOwnerPrefix = base.toLowerCase().startsWith(`${safeOwner}-`);
    const referencedByOwner =
      hasOwnerPrefix ||
      Boolean(
        db
          .prepare('SELECT 1 FROM garments WHERE closet_owner = ? AND image_url = ? LIMIT 1')
          .get(String(ownerPrefix || ''), normalizedPath)
      ) ||
      Boolean(
        db
          .prepare('SELECT 1 FROM shopping_checks WHERE closet_owner = ? AND image_url = ? LIMIT 1')
          .get(String(ownerPrefix || ''), normalizedPath)
      );

    if (!referencedByOwner) {
      return {
        ok: false,
        status: 403,
        error: '다른 사용자의 업로드 이미지를 참조할 수 없습니다.',
      };
    }
    return { ok: true, url: normalizedPath };
  }

  if (trimmed.startsWith('data:')) {
    const decoded = validateAndDecodeDataUrl(trimmed);
    if (!decoded.ok) return decoded;
    if (!persistToDisk) {
      return { ok: true, url: fallbackUrl };
    }
    const filename = `${safeOwner}-${crypto.randomUUID()}.${decoded.ext}`;
    const targetPath = path.resolve(UPLOADS_DIR, filename);
    if (!targetPath.startsWith(`${path.resolve(UPLOADS_DIR)}${path.sep}`)) {
      return { ok: false, status: 400, error: '유효하지 않은 업로드 파일명입니다.' };
    }
    fs.writeFileSync(targetPath, decoded.buffer);
    return { ok: true, url: `/uploads/${filename}` };
  }

  return { ok: true, url: fallbackUrl };
}

function unlinkUploadIfUnreferenced(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return;
  const safeBase = path.basename(imageUrl);
  if (imageUrl !== `/uploads/${safeBase}`) return;

  // Never delete if another garment or shopping_check row still references this upload
  const stillReferencedByGarment = db
    .prepare('SELECT 1 FROM garments WHERE image_url = ? LIMIT 1')
    .get(imageUrl);
  if (stillReferencedByGarment) return;

  const stillReferencedByCheck = db
    .prepare('SELECT 1 FROM shopping_checks WHERE image_url = ? LIMIT 1')
    .get(imageUrl);
  if (stillReferencedByCheck) return;

  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const fullPath = path.resolve(uploadsRoot, safeBase);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) return;

  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore unlink error
  }
}

function parseGarmentRow(row) {
  if (!row) return null;
  const seasons = safeParseJsonArray(row.seasons, ['봄', '가을']);
  const cpw = row.wear_count > 0 ? Math.round(row.price / row.wear_count) : row.price;
  let imageUrl = row.image_url;
  if (
    !imageUrl ||
    imageUrl.startsWith('data:image/svg+xml') ||
    imageUrl === '/seed/store-terracotta-cardigan.jpg'
  ) {
    imageUrl = getStudioSeedImageForGarment(row.category, row.subcategory);
  }
  const manifestSpec = resolveManifestSlotAndGlb(row.category, row.subcategory);
  const resolvedNotes = row.notes || '';
  return {
    ...row,
    image_url: imageUrl,
    seasons,
    size: row.size || '',
    notes: resolvedNotes,
    memo: resolvedNotes,
    fabric: row.fabric || 'cotton',
    slot_key: row.slot_key || manifestSpec.slotKey,
    base_glb: row.base_glb || manifestSpec.baseGlb,
    physics_preset: row.physics_preset || manifestSpec.physicsPreset,
    custom_texture: Boolean(row.custom_texture || String(imageUrl).startsWith('/uploads/')),
    water_resistant: Boolean(row.water_resistant),
    is_favorite: Boolean(row.is_favorite),
    cpw,
  };
}

export function formatUserPayload(u) {
  if (!u) return null;
  const pcProfile = u.personal_color ? getPersonalColorLabels(u.personal_color) : null;
  let skinUndertoneLab = null;
  if (u.skin_undertone_lab) {
    try {
      skinUndertoneLab =
        typeof u.skin_undertone_lab === 'string'
          ? JSON.parse(u.skin_undertone_lab)
          : u.skin_undertone_lab;
    } catch {
      skinUndertoneLab = null;
    }
  }
  const resolvedBody = computeBodyMetrics(u);

  return {
    id: u.id,
    username: u.username,
    email: u.email || null,
    displayName: u.display_name,
    role: u.role,
    authProvider: u.auth_provider || 'email',
    defaultCloset: u.default_closet,
    closetName: u.closet_name || null,
    verifiedAt: u.verified_at || null,
    verificationHash: u.verification_hash || null,
    ageGroup: u.age_group || null,
    age: u.age !== null && u.age !== undefined ? Number(u.age) : null,
    heightCm: u.height_cm !== null && u.height_cm !== undefined ? Number(u.height_cm) : null,
    weightKg: u.weight_kg !== null && u.weight_kg !== undefined ? Number(u.weight_kg) : null,
    gender: u.gender || null,
    personalColor: u.personal_color || null,
    skinToneHex: u.skin_tone_hex || null,
    skinUndertoneLab,
    profileCompleted: Boolean(u.profile_completed),
    bodyShape: resolvedBody.bodyShape,
    bodyShapeCustom: Boolean(normalizeBodyShapeKey(u.body_shape)),
    bodyShapeLabelKo: resolvedBody.bodyLabelKo,
    bodyShapeLabelEn: resolvedBody.bodyLabelEn,
    bodyShapeShortKo: resolvedBody.bodyShortKo,
    personalColorLabelKo: pcProfile ? pcProfile.ko : null,
    personalColorLabelEn: pcProfile ? pcProfile.en : null,
    bodyFatPct:
      u.body_fat_pct !== null && u.body_fat_pct !== undefined ? Number(u.body_fat_pct) : null,
    chestCm: u.chest_cm !== null && u.chest_cm !== undefined ? Number(u.chest_cm) : null,
    waistCm: u.waist_cm !== null && u.waist_cm !== undefined ? Number(u.waist_cm) : null,
    hipCm: u.hip_cm !== null && u.hip_cm !== undefined ? Number(u.hip_cm) : null,
    headCm: u.head_cm !== null && u.head_cm !== undefined ? Number(u.head_cm) : null,
    resolvedBody,
  };
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)ainventory_token=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function createGuestDemoUser() {
  const demoRow = {
    id: 0,
    username: 'sample_guest',
    email: null,
    display_name: '샘플 옷장 체험',
    role: 'guest',
    auth_provider: 'sample_demo',
    default_closet: 'sample',
    closet_name: '샘플 캡슐 옷장',
    personal_color: 'autumn_warm',
    skin_tone_hex: '#DFC1A6',
    profile_completed: 1,
    height_cm: 175,
    weight_kg: 68,
    body_shape: 'standard_balanced',
  };
  return { row: demoRow, payload: { ...formatUserPayload(demoRow), isSampleDemo: true } };
}

/**
 * Enforces horizontal closet isolation across Sample Guest, Couple Demo ('husband'/'wife'),
 * Admin, and isolated Personal ('closet_*') accounts.
 */
export function resolveAuthorizedClosets(req, requestedCloset, options = {}) {
  const { mode = 'read' } = options;
  const rawReq =
    requestedCloset !== undefined && requestedCloset !== null
      ? String(requestedCloset).trim()
      : '';

  // 1. Sample Demo Guest: strictly confined to 'sample'
  if (req.isSampleGuest || req.isSampleDemo || !req.user || req.user.id === 0) {
    if (mode === 'write') {
      return {
        ok: false,
        status: 401,
        error: '정식 로그인 계정에서만 사용할 수 있는 기능입니다.',
      };
    }
    if (rawReq && rawReq !== 'sample') {
      return {
        ok: false,
        status: 403,
        error: '샘플 체험 모드에서는 샘플 옷장(sample)만 조회할 수 있습니다.',
      };
    }
    return {
      ok: true,
      primaryCloset: 'sample',
      closets: ['sample'],
      isAllCouple: false,
    };
  }

  const userCloset = String(req.user.defaultCloset || '').trim();
  const isAdmin = req.user.role === 'admin';
  const isCoupleMember = userCloset === 'husband' || userCloset === 'wife';

  // 2. Admin account
  if (isAdmin) {
    const target = rawReq || userCloset || 'husband';
    const adminAllowedRead = new Set(['husband', 'wife', 'sample', 'all', userCloset].filter(Boolean));
    const adminAllowedWrite = new Set(['husband', 'wife', userCloset].filter(Boolean));
    if (mode === 'write') {
      if (!adminAllowedWrite.has(target)) {
        return {
          ok: false,
          status: 403,
          error: '해당 옷장에는 쓰기 권한이 없습니다.',
        };
      }
      return { ok: true, primaryCloset: target, closets: [target], isAllCouple: false };
    }
    if (!adminAllowedRead.has(target)) {
      return {
        ok: false,
        status: 403,
        error: '허용되지 않은 옷장 접근 요청입니다.',
      };
    }
    if (target === 'all') {
      return {
        ok: true,
        primaryCloset: userCloset || 'husband',
        closets: ['husband', 'wife'],
        isAllCouple: true,
      };
    }
    return { ok: true, primaryCloset: target, closets: [target], isAllCouple: false };
  }

  // 3. Couple Demo members ('husband' / 'wife'): never leak personal 'closet_*' rows on 'all'!
  if (isCoupleMember) {
    const target = rawReq || userCloset;
    if (mode === 'write') {
      if (target !== 'husband' && target !== 'wife') {
        return {
          ok: false,
          status: 403,
          error: '해당 옷장에 수정 권한이 없습니다.',
        };
      }
      return { ok: true, primaryCloset: target, closets: [target], isAllCouple: false };
    }
    if (target === 'all') {
      return {
        ok: true,
        primaryCloset: userCloset,
        closets: ['husband', 'wife'],
        isAllCouple: true,
      };
    }
    if (target === 'husband' || target === 'wife' || target === 'sample') {
      return { ok: true, primaryCloset: target, closets: [target], isAllCouple: false };
    }
    return {
      ok: false,
      status: 403,
      error: '다른 사용자의 개인 옷장에는 접근할 수 없습니다.',
    };
  }

  // 4. Personal user ('closet_*'): strictly own closet (plus read-only 'sample' on GET)
  const target = rawReq || userCloset;
  if (!userCloset) {
    return { ok: false, status: 403, error: '유효한 개인 옷장 정보가 없습니다.' };
  }
  if (mode === 'write') {
    if (target !== userCloset) {
      return {
        ok: false,
        status: 403,
        error: '본인의 옷장 데이터만 추가·수정·삭제할 수 있습니다.',
      };
    }
    return { ok: true, primaryCloset: userCloset, closets: [userCloset], isAllCouple: false };
  }

  if (target === userCloset || target === 'sample') {
    return { ok: true, primaryCloset: target, closets: [target], isAllCouple: false };
  }

  return {
    ok: false,
    status: 403,
    error: '다른 사용자의 옷장에는 접근할 수 없습니다.',
  };
}

function canWriteClosetOwner(req, rowClosetOwner) {
  if (!rowClosetOwner) return false;
  return resolveAuthorizedClosets(req, String(rowClosetOwner), { mode: 'write' }).ok;
}

function buildClosetInClause(closets, column = 'closet_owner') {
  const safeList = Array.isArray(closets) && closets.length > 0 ? closets : ['__none__'];
  const placeholders = safeList.map(() => '?').join(', ');
  return {
    clause: `${column} IN (${placeholders})`,
    params: [...safeList],
  };
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (token) {
    const session = db
      .prepare(`
        SELECT s.token, s.expires_at, u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
      `)
      .get(token);

    if (session && new Date(session.expires_at) >= new Date()) {
      // If caller explicitly sent X-Demo-Mode: sample while logged in, keep user auth but mark sample header if needed
      req.userRow = session;
      req.user = formatUserPayload(session);
      req.token = token;
      req.isSampleGuest = false;
      req.isSampleDemo = false;
      return next();
    }
  }

  // Unauthenticated Sample Closet Demo Mode: ONLY allow 'sample' (never 'husband'/'wife'!)
  const isDemoHeader = req.headers['x-demo-mode'] === 'sample';
  const closetQuery = String(req.query?.closet || '').trim();
  const isReadOnlyAnalyze =
    req.method === 'POST' &&
    isDemoHeader &&
    (req.path === '/shopping/analyze' || req.path === '/garments/analyze');

  if (
    (req.method === 'GET' && (isDemoHeader || closetQuery === 'sample')) ||
    isReadOnlyAnalyze
  ) {
    const guest = createGuestDemoUser();
    req.userRow = guest.row;
    req.user = guest.payload;
    req.isSampleGuest = true;
    req.isSampleDemo = true;
    return next();
  }

  return res.status(401).json({ error: '로그인이 필요합니다.' });
}

function requireStrictUserAuth(req, res, next) {
  if (!req.user || req.isSampleGuest || req.isSampleDemo || req.user.id === 0) {
    return res.status(401).json({ error: '정식 로그인 계정에서만 사용할 수 있는 기능입니다.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
  }
  next();
}

function isHttpsRequest(req) {
  if (req?.secure) return true;
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return forwardedProto === 'https';
}

function issueUserSession(req, res, userRow) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userRow.id,
    expires
  );
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `ainventory_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secureAttr}`
  );
  return token;
}

function clearSessionCookie(req, res) {
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `ainventory_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`
  );
}

async function verifyAppleIdentityToken(idToken, expectedClientId) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Apple identity token');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Apple identity token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  if (header.alg !== 'RS256') {
    throw new Error('Unsupported Apple token algorithm');
  }
  if (payload.iss !== 'https://appleid.apple.com') {
    throw new Error('Invalid Apple token issuer');
  }
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!expectedClientId || !audList.includes(expectedClientId)) {
    throw new Error('Apple token audience mismatch');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) <= nowSec) {
    throw new Error('Apple identity token has expired');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Apple token missing subject');
  }

  let publicKey = null;
  if (process.env.APPLE_PUBLIC_KEY_PEM) {
    publicKey = crypto.createPublicKey(process.env.APPLE_PUBLIC_KEY_PEM);
  } else {
    if (!header.kid) throw new Error('Apple token missing key id');
    if (Date.now() - appleJwksCache.fetchedAt > 60 * 60 * 1000 || appleJwksCache.keys.length === 0) {
      const res = await fetch('https://appleid.apple.com/auth/keys', {
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) throw new Error(`Failed to fetch Apple JWKS (${res.status})`);
      const body = await res.json();
      appleJwksCache = {
        fetchedAt: Date.now(),
        keys: Array.isArray(body?.keys) ? body.keys : [],
      };
    }
    const jwk = appleJwksCache.keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw new Error('Matching Apple JWK not found');
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }

  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
    publicKey,
    Buffer.from(sigB64, 'base64url')
  );
  if (!verified) {
    throw new Error('Invalid Apple identity token signature');
  }
  return payload;
}

export function createApiRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '10mb' }));

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'A inventory API', timestamp: new Date().toISOString() });
  });

  // Public Sample Capsule Catalog (Requirement 8.a)
  const sendSampleCatalog = (_req, res) => {
    res.json({ samples: SAMPLE_CAPSULE_CATALOG });
  };
  router.get('/sample-catalog', sendSampleCatalog);
  router.get('/garments/samples', sendSampleCatalog);

  const writeVerificationOutboxHtml = ({
    username,
    email,
    displayName,
    verifyToken,
    verificationCode,
    verifyUrl,
  }) => {
    const safeUserSlug = sanitizeSafeSlug(username, 'member');
    const outboxFile = `${safeUserSlug}-verify.html`;
    const outboxRoot = path.resolve(OUTBOX_DIR);
    const fullOutboxPath = path.resolve(outboxRoot, outboxFile);
    if (!fullOutboxPath.startsWith(`${outboxRoot}${path.sep}`)) {
      return;
    }

    const safeDisplayName = escapeHtml(displayName || safeUserSlug);
    const safeCode = escapeHtml(verificationCode);
    const safeUrl = escapeHtml(verifyUrl);
    const safeUsername = escapeHtml(username);
    const safeEmail = escapeHtml(email);
    const safeTokenPrefix = escapeHtml(String(verifyToken || '').slice(0, 12));

    const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>[A inventory] 이메일 회원가입 인증 안내</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#F5F5F7; padding:32px; color:#1D1D1F;">
  <div style="max-width:520px; margin:0 auto; background:#FFFFFF; border-radius:18px; padding:28px;">
    <p style="font-size:12px; letter-spacing:0.08em; color:#86868B; margin:0 0 8px;">A INVENTORY</p>
    <h1 style="font-size:20px; margin:0 0 12px;">${safeDisplayName}님, 이메일 인증을 완료해 주세요</h1>
    <p style="font-size:14px; line-height:1.6; color:#515154;">아래 6자리 인증번호를 입력하거나 인증 링크를 열면 계정이 즉시 활성화됩니다.</p>
    <div style="margin:20px 0; padding:18px; background:#F5F5F7; border-radius:12px; text-align:center;">
      <span style="display:block; font-size:12px; color:#86868B; margin-bottom:4px;">6자리 인증코드</span>
      <strong style="font-size:28px; letter-spacing:0.28em; font-variant-numeric:tabular-nums; color:#1D1D1F;">${safeCode}</strong>
    </div>
    <p style="font-size:13px; color:#86868B;">인증 링크: <a href="${safeUrl}">${safeUrl}</a></p>
    <small style="color:#86868B;">계정: @${safeUsername} (${safeEmail}) · Token: ${safeTokenPrefix}...</small>
  </div>
</body>
</html>`;
    try {
      fs.writeFileSync(fullOutboxPath, html, 'utf8');
    } catch {
      // ignore outbox write error
    }
  };

  // Pre-registration Email OTP Step 1: Send 6-digit OTP with 60s cooldown & rate limiting (Req 5 & 10.b)
  router.post('/auth/send-verification', (req, res) => {
    sweepBoundedMap(emailOtpPending, OTP_TTL_MS);

    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail || cleanEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
    }

    const ipRate = checkRateLimit(`preotpip:${req.ip || 'local'}`, MAX_DISPATCH_PER_WINDOW * 3);
    if (!ipRate.allowed) {
      return res.status(429).json({
        error: `인증 요청이 너무 많습니다. ${ipRate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      });
    }

    const existingVerified = db
      .prepare('SELECT id FROM users WHERE lower(email) = ? AND verified_at IS NOT NULL')
      .get(cleanEmail);
    if (existingVerified) {
      return res.status(409).json({ error: '이미 가입된 이메일 주소입니다.' });
    }

    const prev = emailOtpPending.get(cleanEmail);
    if (prev && Date.now() - prev.lastSentAt < RESEND_COOLDOWN_MS) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.lastSentAt)) / 1000)
      );
      return res.status(429).json({
        error: `재발송 쿨타임 중입니다. ${retryAfterSec}초 후에 다시 요청해주세요.`,
        code: 'RESEND_COOLDOWN',
        retryAfterSec,
      });
    }

    const rate = checkRateLimit(`preotp:${cleanEmail}`, MAX_DISPATCH_PER_WINDOW);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `인증 메일 발송 한도(10분당 ${MAX_DISPATCH_PER_WINDOW}회)를 초과했습니다. ${rate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const verificationCode = String(crypto.randomInt(100000, 1000000));
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const tempUser = sanitizeSafeSlug(cleanEmail.split('@')[0], 'member');
    writeVerificationOutboxHtml({
      username: tempUser,
      email: cleanEmail,
      displayName: tempUser,
      verifyToken,
      verificationCode,
      verifyUrl: `/?verify_token=${verifyToken}`,
    });

    const now = Date.now();
    emailOtpPending.set(cleanEmail, {
      code: verificationCode,
      token: verifyToken,
      createdAt: now,
      expiresAt: now + OTP_TTL_MS,
      lastSentAt: now,
      failCount: 0,
      verified: false,
    });
    rateBuckets.delete(`preotpfail:${cleanEmail}`);

    const payload = {
      ok: true,
      resendCooldownSec: 60,
      cooldownSec: 60,
      expiresInSec: Math.floor(OTP_TTL_MS / 1000),
      remainingResends: rate.remaining,
    };
    if (isDevOtpPreviewAllowed()) {
      payload.devPreviewCode = verificationCode;
    }
    res.json(payload);
  });

  // Pre-registration Email OTP Step 2: Verify 6-digit OTP with TTL & attempt rate limiting (Req 10.b)
  router.post('/auth/verify-email-code', (req, res) => {
    sweepBoundedMap(emailOtpPending, OTP_TTL_MS);

    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!cleanEmail || !code) {
      return res.status(400).json({ error: '이메일과 6자리 인증코드를 입력해주세요.' });
    }

    const blockCheck = peekRateLimitBlocked(`preotpfail:${cleanEmail}`, MAX_VERIFY_FAILS_PER_WINDOW);
    if (blockCheck.blocked) {
      return res.status(429).json({
        error: `인증번호 입력 실패 횟수(${MAX_VERIFY_FAILS_PER_WINDOW}회)를 초과했습니다. ${blockCheck.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'OTP_ATTEMPTS_EXCEEDED',
        retryAfterSec: blockCheck.retryAfterSec,
      });
    }

    const pending = emailOtpPending.get(cleanEmail);
    if (!pending) {
      return res.status(400).json({ error: '유효한 인증코드 요청 내역이 없습니다. 먼저 인증번호를 요청해주세요.' });
    }
    if (Date.now() > pending.expiresAt) {
      emailOtpPending.delete(cleanEmail);
      return res.status(400).json({
        error: '인증코드 유효시간(10분)이 만료되었습니다. 인증번호를 다시 요청해주세요.',
        code: 'OTP_EXPIRED',
      });
    }
    if (pending.failCount >= MAX_VERIFY_FAILS_PER_WINDOW) {
      emailOtpPending.delete(cleanEmail);
      return res.status(429).json({
        error: `인증번호 입력 실패 횟수(${MAX_VERIFY_FAILS_PER_WINDOW}회)를 초과했습니다. 인증번호를 다시 발송해주세요.`,
        code: 'OTP_ATTEMPTS_EXCEEDED',
      });
    }

    if (!timingSafeStringEquals(pending.code, code)) {
      pending.failCount += 1;
      const failRes = checkRateLimit(`preotpfail:${cleanEmail}`, MAX_VERIFY_FAILS_PER_WINDOW);
      if (pending.failCount >= MAX_VERIFY_FAILS_PER_WINDOW) {
        emailOtpPending.delete(cleanEmail);
      } else {
        emailOtpPending.set(cleanEmail, pending);
      }
      return res.status(400).json({
        error: `인증코드 6자리가 일치하지 않습니다. (남은 시도 ${failRes.remaining}회)`,
        remainingAttempts: failRes.remaining,
      });
    }

    pending.verified = true;
    pending.expiresAt = Date.now() + OTP_TTL_MS;
    emailOtpPending.set(cleanEmail, pending);
    res.json({ ok: true, verified: true });
  });

  // Pre-registration Email OTP Step 3: Complete sign-up with EMPTY personal closet (Req 5 & 8.a)
  router.post('/auth/register-email', (req, res) => {
    sweepBoundedMap(emailOtpPending, OTP_TTL_MS);

    const ipRate = checkRateLimit(`regemail:${req.ip || 'local'}`, 12);
    if (!ipRate.allowed) {
      return res.status(429).json({
        error: `가입 요청이 너무 많습니다. ${ipRate.retryAfterSec}초 후에 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      });
    }

    const {
      email = '',
      code = '',
      password = '',
      displayName = '',
      closetName = '',
      gender = 'unspecified',
    } = req.body || {};

    const cleanEmail = String(email).trim().toLowerCase();
    const pending = emailOtpPending.get(cleanEmail);
    if (!pending || Date.now() > pending.expiresAt) {
      if (pending) emailOtpPending.delete(cleanEmail);
      return res.status(400).json({ error: '이메일 인증코드가 만료되었거나 확인되지 않았습니다.' });
    }
    if (pending.failCount >= MAX_VERIFY_FAILS_PER_WINDOW) {
      emailOtpPending.delete(cleanEmail);
      return res.status(429).json({
        error: '인증번호 실패 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.',
        code: 'OTP_ATTEMPTS_EXCEEDED',
      });
    }

    const codeStr = String(code || '').trim();
    if (!pending.verified) {
      if (!timingSafeStringEquals(pending.code, codeStr)) {
        pending.failCount += 1;
        checkRateLimit(`preotpfail:${cleanEmail}`, MAX_VERIFY_FAILS_PER_WINDOW);
        if (pending.failCount >= MAX_VERIFY_FAILS_PER_WINDOW) {
          emailOtpPending.delete(cleanEmail);
        }
        return res.status(400).json({ error: '이메일 인증코드 확인이 필요합니다.' });
      }
    }

    const pwStr = typeof password === 'string' ? password : String(password ?? '');
    if (pwStr.length < MIN_PASSWORD_LEN || pwStr.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({
        error: `비밀번호는 ${MIN_PASSWORD_LEN}자 이상 ${MAX_PASSWORD_LEN}자 이하로 입력해주세요.`,
      });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(cleanEmail);
    if (existingEmail) {
      return res.status(409).json({ error: '이미 가입된 이메일 주소입니다.' });
    }

    let baseUsername = sanitizeSafeSlug(cleanEmail.split('@')[0], 'member').slice(0, 20);
    if (baseUsername.length < 2) baseUsername = `user_${baseUsername}`;
    let cleanUsername = baseUsername;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)) {
      cleanUsername = `${baseUsername}_${crypto.randomInt(100, 9999)}`;
    }

    const cleanDisplayName = String(displayName || cleanUsername).trim().slice(0, 60);
    const cleanClosetName = String(closetName || `${cleanDisplayName}의 옷장`).trim().slice(0, 80);
    const closetKey = `closet_${cleanUsername}`;
    const nowIso = new Date().toISOString();
    const vHash = computeVerificationHash(cleanUsername, cleanEmail, nowIso);

    const createdUser = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (
          username, email, password_hash, display_name, role, default_closet,
          closet_name, verification_token, verification_code, verified_at, verification_hash,
          gender, profile_completed, auth_provider, verify_last_sent_at, verify_send_count, verify_fail_count
        ) VALUES (?, ?, ?, ?, 'member', ?, ?, NULL, NULL, ?, ?, ?, 0, 'email', ?, 1, 0)
      `).run(
        cleanUsername,
        cleanEmail,
        hashPassword(pwStr),
        cleanDisplayName,
        closetKey,
        cleanClosetName,
        nowIso,
        vHash,
        String(gender || 'unspecified').slice(0, 24),
        nowIso
      );
      return db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);
    });

    emailOtpPending.delete(cleanEmail);
    const sessionToken = issueUserSession(req, res, createdUser);

    res.status(201).json({
      ok: true,
      token: sessionToken,
      user: formatUserPayload(createdUser),
    });
  });

  // 1. Email-verified registration (creates EMPTY personal closet_<username>, enforces dispatch rate limit)
  router.post('/auth/register', (req, res) => {
    const {
      username = '',
      email = '',
      password = '',
      display_name = '',
      displayName = '',
      closet_name = '',
      closetName = '',
    } = req.body || {};

    const ipKey = `reg:${req.ip || 'local'}`;
    const rate = checkRateLimit(ipKey, 12);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `요청이 너무 많습니다. ${rate.retryAfterSec}초 후에 다시 시도해주세요.`,
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const cleanUsername = sanitizeSafeSlug(username, '');
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(display_name || displayName || cleanUsername)
      .trim()
      .slice(0, 60);
    const cleanClosetName =
      String(closet_name || closetName || '').trim().slice(0, 80) || null;
    const pwStr = typeof password === 'string' ? password : String(password ?? '');

    if (!cleanUsername || cleanUsername.length < 2) {
      return res.status(400).json({ error: '아이디는 영문/숫자 2자 이상으로 입력해주세요.' });
    }
    if (!cleanEmail || cleanEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
    }
    if (pwStr.length < MIN_PASSWORD_LEN || pwStr.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({
        error: `비밀번호는 ${MIN_PASSWORD_LEN}자 이상 ${MAX_PASSWORD_LEN}자 이하로 입력해주세요.`,
      });
    }

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (exists) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }
    const emailExists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(cleanEmail);
    if (emailExists) {
      return res.status(409).json({ error: '이미 가입된 이메일 주소입니다.' });
    }

    const closetKey = `closet_${cleanUsername}`;
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const verificationCode = String(crypto.randomInt(100000, 1000000));
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (
        username, email, password_hash, display_name, role, default_closet,
        closet_name, verification_token, verification_code, verified_at, verification_hash,
        profile_completed, auth_provider, verify_last_sent_at, verify_send_count, verify_fail_count
      ) VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, NULL, NULL, 0, 'email', ?, 1, 0)
    `).run(
      cleanUsername,
      cleanEmail,
      hashPassword(pwStr),
      cleanDisplayName,
      closetKey,
      cleanClosetName,
      verifyToken,
      verificationCode,
      nowIso
    );

    const verifyUrl = `/?verify_token=${verifyToken}`;
    writeVerificationOutboxHtml({
      username: cleanUsername,
      email: cleanEmail,
      displayName: cleanDisplayName,
      verifyToken,
      verificationCode,
      verifyUrl,
    });

    const allowPreview = isDevOtpPreviewAllowed();
    const responsePayload = {
      ok: true,
      username: cleanUsername,
      email: cleanEmail,
      displayName: cleanDisplayName,
      defaultCloset: closetKey,
      cooldownSec: 60,
      user: {
        username: cleanUsername,
        email: cleanEmail,
        displayName: cleanDisplayName,
        defaultCloset: closetKey,
      },
      verification: {
        cooldownSec: 60,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        remainingResends: MAX_DISPATCH_PER_WINDOW - 1,
        ...(allowPreview
          ? {
              token: verifyToken,
              code: verificationCode,
              verifyUrl,
            }
          : {}),
      },
      message: '인증 메일이 발송되었습니다.',
    };
    if (allowPreview) {
      responsePayload.verificationToken = verifyToken;
      responsePayload.verificationCode = verificationCode;
      responsePayload.verifyUrl = verifyUrl;
      responsePayload.devPreviewCode = verificationCode;
    }

    res.status(201).json(responsePayload);
  });

  // 1b. Resend email verification with 60s cooldown & window rate limiting (Requirement 10.b)
  router.post('/auth/resend-verification', (req, res) => {
    const ipRate = checkRateLimit(`resendip:${req.ip || 'local'}`, MAX_DISPATCH_PER_WINDOW * 3);
    if (!ipRate.allowed) {
      return res.status(429).json({
        error: `재발송 요청이 너무 많습니다. ${ipRate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      });
    }

    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '')
      .trim()
      .toLowerCase();
    if (!identifier) {
      return res.status(400).json({ error: '아이디 또는 이메일을 입력해주세요.' });
    }
    const user = db
      .prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?')
      .get(identifier, identifier);
    if (!user) {
      return res.status(404).json({ error: '해당 계정을 찾을 수 없습니다.' });
    }
    if (user.verified_at && user.verification_hash) {
      return res.status(400).json({ error: '이미 이메일 인증이 완료된 계정입니다.' });
    }

    if (user.verify_last_sent_at) {
      const elapsedMs = Date.now() - new Date(user.verify_last_sent_at).getTime();
      if (elapsedMs < RESEND_COOLDOWN_MS) {
        const retryAfterSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000));
        return res.status(429).json({
          error: `재발송 쿨타임 중입니다. ${retryAfterSec}초 후에 다시 요청해주세요.`,
          code: 'RESEND_COOLDOWN',
          retryAfterSec,
        });
      }
    }

    const rate = checkRateLimit(`resend:${user.id}`, MAX_DISPATCH_PER_WINDOW);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `인증 메일 발송 한도(10분당 ${MAX_DISPATCH_PER_WINDOW}회)를 초과했습니다. ${rate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const verifyToken = crypto.randomBytes(24).toString('hex');
    const verificationCode = String(crypto.randomInt(100000, 1000000));
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET verification_token = ?,
          verification_code = ?,
          verify_last_sent_at = ?,
          verify_send_count = COALESCE(verify_send_count, 0) + 1,
          verify_fail_count = 0
      WHERE id = ?
    `).run(verifyToken, verificationCode, nowIso, user.id);
    rateBuckets.delete(`otpfail:${user.id}`);

    const verifyUrl = `/?verify_token=${verifyToken}`;
    writeVerificationOutboxHtml({
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      verifyToken,
      verificationCode,
      verifyUrl,
    });

    const allowPreview = isDevOtpPreviewAllowed();
    const payload = {
      ok: true,
      cooldownSec: 60,
      remainingResends: rate.remaining,
      user: {
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      verification: {
        cooldownSec: 60,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        remainingResends: rate.remaining,
        ...(allowPreview
          ? {
              token: verifyToken,
              code: verificationCode,
              verifyUrl,
            }
          : {}),
      },
    };
    if (allowPreview) {
      payload.devPreviewCode = verificationCode;
    }

    res.json(payload);
  });

  // 2. Verify landing info
  router.get('/auth/verify-info', (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: '인증 토큰이 누락되었습니다.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
    if (!user || !timingSafeStringEquals(user.verification_token || '', token)) {
      return res.status(404).json({ error: '유효하지 않거나 만료된 이메일 인증 링크입니다.' });
    }
    const alreadyVerified = Boolean(user.verified_at && user.verification_hash);
    if (
      !alreadyVerified &&
      user.verify_last_sent_at &&
      Date.now() - new Date(user.verify_last_sent_at).getTime() > OTP_TTL_MS
    ) {
      return res.status(400).json({
        error: '이메일 인증 링크 유효시간(10분)이 만료되었습니다. 재발송 후 다시 시도해주세요.',
        code: 'OTP_EXPIRED',
      });
    }

    res.json({
      ok: true,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      alreadyVerified,
      verifiedAt: user.verified_at,
      verificationHash: user.verification_hash,
      account: {
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        alreadyVerified,
      },
    });
  });

  // 3. Complete email verification with OTP TTL & attempt rate limiting (Requirement 10.b)
  router.post('/auth/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const code = String(req.body?.code || '').trim();
    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '')
      .trim()
      .toLowerCase();
    const issueSession = Boolean(req.body?.issueSession);

    let user = null;
    if (code && identifier) {
      const candidate = db
        .prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?')
        .get(identifier, identifier);
      if (!candidate) {
        return res.status(404).json({ error: '해당 계정을 찾을 수 없습니다.' });
      }

      const blockCheck = peekRateLimitBlocked(`otpfail:${candidate.id}`, MAX_VERIFY_FAILS_PER_WINDOW);
      if (blockCheck.blocked || Number(candidate.verify_fail_count || 0) >= MAX_VERIFY_FAILS_PER_WINDOW) {
        return res.status(429).json({
          error: `인증번호 입력 실패 횟수(${MAX_VERIFY_FAILS_PER_WINDOW}회)를 초과했습니다. 인증 메일을 재발송해주세요.`,
          code: 'OTP_ATTEMPTS_EXCEEDED',
          retryAfterSec: blockCheck.retryAfterSec || 60,
        });
      }

      if (
        !candidate.verified_at &&
        candidate.verify_last_sent_at &&
        Date.now() - new Date(candidate.verify_last_sent_at).getTime() > OTP_TTL_MS
      ) {
        return res.status(400).json({
          error: '인증코드 유효시간(10분)이 만료되었습니다. 재발송 후 다시 시도해주세요.',
          code: 'OTP_EXPIRED',
        });
      }

      if (!timingSafeStringEquals(candidate.verification_code || '', code)) {
        const failRes = checkRateLimit(`otpfail:${candidate.id}`, MAX_VERIFY_FAILS_PER_WINDOW);
        db.prepare(
          'UPDATE users SET verify_fail_count = COALESCE(verify_fail_count, 0) + 1 WHERE id = ?'
        ).run(candidate.id);
        return res.status(400).json({
          error: `인증코드 6자리가 일치하지 않습니다. (남은 시도 ${failRes.remaining}회)`,
          remainingAttempts: failRes.remaining,
        });
      }
      user = candidate;
    } else if (token) {
      const candidate = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
      if (!candidate || !timingSafeStringEquals(candidate.verification_token || '', token)) {
        return res.status(404).json({ error: '유효하지 않은 이메일 인증 토큰입니다.' });
      }
      if (
        !candidate.verified_at &&
        candidate.verify_last_sent_at &&
        Date.now() - new Date(candidate.verify_last_sent_at).getTime() > OTP_TTL_MS
      ) {
        return res.status(400).json({
          error: '이메일 인증 토큰 유효시간(10분)이 만료되었습니다. 재발송 후 다시 시도해주세요.',
          code: 'OTP_EXPIRED',
        });
      }
      user = candidate;
    } else {
      return res.status(400).json({ error: '6자리 인증코드 또는 인증 토큰이 필요합니다.' });
    }

    const verifiedAt = user.verified_at || new Date().toISOString();
    const verificationHash =
      user.verification_hash || computeVerificationHash(user.username, user.email, verifiedAt);

    db.prepare(`
      UPDATE users
      SET verified_at = ?,
          verification_hash = ?,
          verification_code = NULL,
          verification_token = NULL,
          verify_fail_count = 0
      WHERE id = ?
    `).run(verifiedAt, verificationHash, user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const sessionToken = issueSession && updatedUser ? issueUserSession(req, res, updatedUser) : null;

    res.json({
      ok: true,
      username: updatedUser.username,
      email: updatedUser.email,
      displayName: updatedUser.display_name,
      verifiedAt,
      verificationHash,
      sessionToken,
      user: sessionToken ? formatUserPayload(updatedUser) : undefined,
    });
  });

  // 4. Login by username OR email with brute-force rate limiting
  router.post('/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const idClean = String(username).trim();
    const pwStr = typeof password === 'string' ? password : '';
    const loginBucketKey = `login:${req.ip || 'local'}:${idClean.toLowerCase()}`;

    const blockCheck = peekRateLimitBlocked(loginBucketKey, MAX_AUTH_ATTEMPTS_PER_WINDOW);
    if (blockCheck.blocked) {
      return res.status(429).json({
        error: `로그인 시도가 너무 많습니다. ${blockCheck.retryAfterSec}초 후에 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: blockCheck.retryAfterSec,
      });
    }

    const user = idClean
      ? db
          .prepare('SELECT * FROM users WHERE username = ? OR lower(email) = lower(?)')
          .get(idClean, idClean)
      : null;

    if (!user || !verifyPassword(pwStr, user.password_hash)) {
      checkRateLimit(loginBucketKey, MAX_AUTH_ATTEMPTS_PER_WINDOW);
      return res.status(401).json({ error: '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (!user.verified_at || !user.verification_hash) {
      const allowPreview = isDevOtpPreviewAllowed();
      return res.status(403).json({
        error: '이메일 인증이 완료되지 않은 계정입니다. 먼저 이메일 인증을 완료해주세요.',
        code: 'EMAIL_NOT_VERIFIED',
        username: user.username,
        email: user.email,
        ...(allowPreview
          ? {
              verificationToken: user.verification_token,
              verifyUrl: user.verification_token
                ? `/?verify_token=${user.verification_token}`
                : null,
            }
          : {}),
      });
    }

    rateBuckets.delete(loginBucketKey);
    const token = issueUserSession(req, res, user);
    res.json({
      token,
      user: formatUserPayload(user),
    });
  });

  // 4b. Sign in with Apple (Hardened against raw body / email auto-linking ATO)
  router.post('/auth/apple', async (req, res) => {
    const rate = checkRateLimit(`apple:${req.ip || 'local'}`, MAX_AUTH_ATTEMPTS_PER_WINDOW);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `요청이 너무 많습니다. ${rate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const {
      id_token = '',
      idToken = '',
      apple_sub = '',
      appleSub = '',
      email = '',
      full_name = '',
      fullName = '',
    } = req.body || {};

    const rawIdToken = String(id_token || idToken || '').trim();
    const isProduction = process.env.NODE_ENV === 'production';
    const allowMockApple = process.env.ALLOW_MOCK_APPLE_AUTH === 'true';
    const appleClientId = String(process.env.APPLE_CLIENT_ID || '').trim();

    let resolvedSub = '';
    let resolvedEmail = '';

    if (isProduction && !allowMockApple) {
      if (!appleClientId) {
        return res.status(503).json({
          error: 'Apple 로그인 서버 설정(APPLE_CLIENT_ID)이 구성되지 않았습니다.',
          code: 'APPLE_AUTH_NOT_CONFIGURED',
        });
      }
      if (!rawIdToken) {
        return res.status(401).json({
          error: '유효한 Apple Identity Token(id_token)이 필요합니다.',
          code: 'APPLE_ID_TOKEN_REQUIRED',
        });
      }
      try {
        const claims = await verifyAppleIdentityToken(rawIdToken, appleClientId);
        resolvedSub = String(claims.sub).trim();
        resolvedEmail = claims.email ? String(claims.email).trim().toLowerCase() : '';
      } catch {
        return res.status(401).json({
          error: '유효하지 않거나 만료된 Apple 인증 토큰입니다.',
          code: 'INVALID_APPLE_TOKEN',
        });
      }
    } else {
      // Non-production / explicit mock sandbox: isolate strictly to apple_sub, NEVER trust unverified email to link accounts!
      if (rawIdToken && appleClientId) {
        try {
          const claims = await verifyAppleIdentityToken(rawIdToken, appleClientId);
          resolvedSub = String(claims.sub).trim();
          resolvedEmail = claims.email ? String(claims.email).trim().toLowerCase() : '';
        } catch {
          return res.status(401).json({
            error: '유효하지 않은 Apple 인증 토큰입니다.',
            code: 'INVALID_APPLE_TOKEN',
          });
        }
      } else {
        resolvedSub = String(apple_sub || appleSub || '').trim();
        resolvedEmail = String(email || '').trim().toLowerCase();
        if (!resolvedSub) {
          return res.status(400).json({
            error: 'Apple 고유 식별자(appleSub) 또는 인증 토큰이 필요합니다.',
          });
        }
      }
    }

    if (!resolvedSub || resolvedSub.length > 128) {
      return res.status(400).json({ error: '유효하지 않은 Apple 계정 식별자입니다.' });
    }
    if (!resolvedEmail) {
      const subHash = crypto.createHash('sha256').update(resolvedSub).digest('hex').slice(0, 12);
      resolvedEmail = `apple_${subHash}@privaterelay.appleid.com`;
    }

    // Strictly match ONLY Apple-authenticated accounts by apple_sub — NEVER auto-link by email!
    let user = db
      .prepare("SELECT * FROM users WHERE apple_sub = ? AND auth_provider = 'apple'")
      .get(resolvedSub);

    if (user && user.role === 'admin') {
      return res.status(403).json({ error: '어드민 계정은 소셜 로그인 연동이 허용되지 않습니다.' });
    }

    if (!user) {
      // Prevent claiming or colliding with an existing email-registered or admin user's email
      const emailOwner = db
        .prepare('SELECT id, role, auth_provider FROM users WHERE lower(email) = ?')
        .get(resolvedEmail);
      if (emailOwner) {
        return res.status(409).json({
          error: '이미 다른 방식으로 가입된 이메일 계정입니다. 기존 로그인 방식을 이용해주세요.',
          code: 'ACCOUNT_EMAIL_CONFLICT',
        });
      }

      const shortHash = crypto.createHash('sha256').update(resolvedSub).digest('hex').slice(0, 10);
      let username = `apple_${shortHash}`;
      while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
        username = `apple_${shortHash}_${crypto.randomInt(100, 999)}`;
      }
      const displayName =
        String(full_name || fullName || '').trim().slice(0, 60) || 'Apple 사용자';
      const closetKey = `closet_${username}`;
      const nowIso = new Date().toISOString();
      const vHash = computeVerificationHash(username, resolvedEmail, nowIso);

      user = db.transaction(() => {
        db.prepare(`
          INSERT INTO users (
            username, email, password_hash, display_name, role, default_closet,
            closet_name, verified_at, verification_hash, profile_completed,
            apple_sub, auth_provider
          ) VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, 1, ?, 'apple')
        `).run(
          username,
          resolvedEmail,
          hashPassword(crypto.randomBytes(24).toString('hex')),
          displayName,
          closetKey,
          '내 옷장',
          nowIso,
          vHash,
          resolvedSub
        );
        return db
          .prepare("SELECT * FROM users WHERE apple_sub = ? AND auth_provider = 'apple'")
          .get(resolvedSub);
      });
    }

    const token = issueUserSession(req, res, user);
    res.json({
      ok: true,
      token,
      user: formatUserPayload(user),
    });
  });

  router.post('/auth/logout', (req, res) => {
    const token = getAuthToken(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Protected or Guest Sample Demo routes below
  router.use(requireAuth);

  router.get('/auth/me', requireStrictUserAuth, (req, res) => {
    res.json({ user: req.user });
  });

  // 4c. Immediate Account & Personal Data Permanent Purge (Requirement 10.a: App Store & Play Store compliance)
  router.delete('/auth/account', requireStrictUserAuth, (req, res) => {
    const userId = req.user.id;
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userRow) {
      return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    }
    if (
      userRow.username === 'admin' ||
      userRow.username === 'husband' ||
      userRow.username === 'wife'
    ) {
      return res.status(400).json({ error: '기본 시스템 데모 계정은 삭제할 수 없습니다.' });
    }

    const closetKey = userRow.default_closet;
    const isDedicatedCloset =
      Boolean(closetKey) &&
      closetKey !== 'husband' &&
      closetKey !== 'wife' &&
      closetKey !== 'sample';

    const uploadUrlsToCleanup = new Set();
    if (isDedicatedCloset) {
      const userGarments = db
        .prepare('SELECT image_url FROM garments WHERE closet_owner = ?')
        .all(closetKey);
      const userChecks = db
        .prepare('SELECT image_url FROM shopping_checks WHERE closet_owner = ?')
        .all(closetKey);
      for (const g of userGarments) {
        if (g.image_url && String(g.image_url).startsWith('/uploads/')) {
          uploadUrlsToCleanup.add(g.image_url);
        }
      }
      for (const c of userChecks) {
        if (c.image_url && String(c.image_url).startsWith('/uploads/')) {
          uploadUrlsToCleanup.add(c.image_url);
        }
      }
    }

    db.transaction(() => {
      if (isDedicatedCloset) {
        db.prepare('DELETE FROM garments WHERE closet_owner = ?').run(closetKey);
        db.prepare('DELETE FROM outfits WHERE closet_owner = ?').run(closetKey);
        db.prepare('DELETE FROM wear_logs WHERE closet_owner = ?').run(closetKey);
        db.prepare('DELETE FROM shopping_checks WHERE closet_owner = ?').run(closetKey);
        db.prepare('DELETE FROM packing_lists WHERE closet_owner = ?').run(closetKey);
      }
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    // Unlink physical uploaded photos on disk after DB commit (only if unreferenced)
    for (const url of uploadUrlsToCleanup) {
      unlinkUploadIfUnreferenced(url);
    }

    // Remove verification outbox files matching both username and email local-part
    const candidateSlugs = new Set([sanitizeSafeSlug(userRow.username, '')]);
    if (userRow.email && String(userRow.email).includes('@')) {
      candidateSlugs.add(sanitizeSafeSlug(String(userRow.email).split('@')[0], ''));
    }
    const outboxRoot = path.resolve(OUTBOX_DIR);
    for (const slug of candidateSlugs) {
      if (!slug) continue;
      try {
        const outboxFile = path.resolve(outboxRoot, `${slug}-verify.html`);
        if (outboxFile.startsWith(`${outboxRoot}${path.sep}`) && fs.existsSync(outboxFile)) {
          fs.unlinkSync(outboxFile);
        }
      } catch {
        // ignore outbox unlink error
      }
    }

    // Clear in-memory OTP & rate limit state for email/user
    if (userRow.email) {
      const cleanEmail = String(userRow.email).trim().toLowerCase();
      emailOtpPending.delete(cleanEmail);
      rateBuckets.delete(`preotp:${cleanEmail}`);
      rateBuckets.delete(`preotpfail:${cleanEmail}`);
    }
    rateBuckets.delete(`resend:${userId}`);
    rateBuckets.delete(`otpfail:${userId}`);

    clearSessionCookie(req, res);
    res.json({
      ok: true,
      purged: true,
      deletedCloset: isDedicatedCloset ? closetKey : null,
      timestamp: new Date().toISOString(),
    });
  });

  // 5. First-login closet name setup (Requirement 8.a: keeps real user closet EMPTY unless starter explicitly imported!)
  router.post('/auth/closet-setup', requireStrictUserAuth, (req, res) => {
    const closetName = String(req.body?.closet_name || req.body?.closetName || '')
      .trim()
      .slice(0, 80);
    const importStarter = Boolean(req.body?.import_starter);
    if (!closetName) {
      return res.status(400).json({ error: '옷장 이름을 입력해주세요.' });
    }

    const updated = db.transaction(() => {
      db.prepare('UPDATE users SET closet_name = ? WHERE id = ?').run(closetName, req.user.id);
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (importStarter && u) {
        generateStatisticalWardrobeForUser(db, u.default_closet, u);
      }
      return u;
    });

    res.json({
      ok: true,
      user: formatUserPayload(updated),
    });
  });

  // 6. Styling Basic Info + Body Shapes + Personal Color setup (transactional + unlinks old uploads on regenerate)
  const handleProfileSetup = (req, res) => {
    const body = req.body || {};

    const parseOptNum = (v, min, max) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (Number.isNaN(n) || n <= 0) return null;
      return Number(Math.max(min, Math.min(max, n)).toFixed(1));
    };

    const age = parseOptNum(body.age, 1, 110);
    const ageGroup =
      body.age_group || body.ageGroup
        ? normalizeAgeGroupKey(body.age_group || body.ageGroup, age)
        : age
          ? normalizeAgeGroupKey(null, age)
          : 'unspecified';

    const heightCm = parseOptNum(body.height_cm ?? body.heightCm, 120, 220);
    const weightKg = parseOptNum(body.weight_kg ?? body.weightKg, 30, 180);
    const gender = String(body.gender || 'unspecified').trim().slice(0, 24);
    const personalColor = String(body.personal_color || body.personalColor || 'autumn_warm')
      .trim()
      .slice(0, 40);
    const skinToneHex = String(body.skin_tone_hex || body.skinToneHex || '#E2C6AE')
      .trim()
      .slice(0, 16);
    const skinUndertoneLab =
      body.skin_undertone_lab || body.skinUndertoneLab
        ? JSON.stringify(body.skin_undertone_lab || body.skinUndertoneLab)
        : null;

    const rawBodyShape = body.body_shape ?? body.bodyShape;
    const bodyShape = normalizeBodyShapeKey(rawBodyShape);
    const bodyFatPct = parseOptNum(body.body_fat_pct ?? body.bodyFatPct, 4, 55);
    const chestCm = parseOptNum(body.chest_cm ?? body.chestCm, 60, 150);
    const waistCm = parseOptNum(body.waist_cm ?? body.waistCm, 48, 145);
    const hipCm = parseOptNum(body.hip_cm ?? body.hipCm, 65, 150);
    const headCm = parseOptNum(body.head_cm ?? body.headCm, 48, 66);
    const regenerateWardrobe = Boolean(body.regenerate_wardrobe || body.regenerateWardrobe);

    const ownedUploadsToRemove = [];
    const { updated, generatedWardrobe } = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET age_group = ?,
            age = ?,
            height_cm = ?,
            weight_kg = ?,
            gender = ?,
            personal_color = ?,
            skin_tone_hex = ?,
            skin_undertone_lab = ?,
            body_shape = ?,
            body_fat_pct = ?,
            chest_cm = ?,
            waist_cm = ?,
            hip_cm = ?,
            head_cm = ?,
            profile_completed = 1
        WHERE id = ?
      `).run(
        ageGroup,
        age !== null ? Math.round(age) : null,
        heightCm,
        weightKg,
        gender,
        personalColor,
        skinToneHex,
        skinUndertoneLab,
        bodyShape,
        bodyFatPct,
        chestCm,
        waistCm,
        hipCm,
        headCm,
        req.user.id
      );

      const userAfter = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const closetKey = userAfter.default_closet;

      let generated = null;
      if (regenerateWardrobe && closetKey && closetKey !== 'sample') {
        const priorGarments = db
          .prepare("SELECT image_url FROM garments WHERE closet_owner = ? AND image_url LIKE '/uploads/%'")
          .all(closetKey);
        for (const g of priorGarments) {
          if (g.image_url) ownedUploadsToRemove.push(g.image_url);
        }
        db.prepare('DELETE FROM garments WHERE closet_owner = ?').run(closetKey);
        generated = generateStatisticalWardrobeForUser(db, closetKey, userAfter);
      }

      return { updated: userAfter, generatedWardrobe: generated };
    });

    for (const url of ownedUploadsToRemove) {
      unlinkUploadIfUnreferenced(url);
    }

    res.json({
      ok: true,
      user: formatUserPayload(updated),
      generatedWardrobe,
    });
  };
  router.post('/auth/profile-setup', requireStrictUserAuth, handleProfileSetup);
  router.post('/auth/profile', requireStrictUserAuth, handleProfileSetup);

  // Statistical wardrobe benchmarks endpoint
  router.get('/wardrobe/benchmarks', (req, res) => {
    const ageGroup = normalizeAgeGroupKey(
      req.query.age_group || req.user.ageGroup,
      req.user.age
    );
    const rows = db
      .prepare('SELECT * FROM wardrobe_statistics_benchmarks WHERE age_group = ?')
      .all(ageGroup);
    res.json({
      ageGroup,
      ageGroups: AGE_GROUPS,
      wearSlots: WEAR_SLOTS,
      benchmarks: rows,
    });
  });

  router.get('/body-shapes', (req, res) => {
    res.json({
      bodyShapes: BODY_SHAPE_OPTIONS.map(({ key, labelKo, labelEn, shortKo, badge, summaryKo }) => ({
        key,
        labelKo,
        labelEn,
        shortKo,
        badge,
        summaryKo,
      })),
      current: req.user.bodyShape || null,
    });
  });

  // Selective Sample Import into Authorized Closet (Requirement 8.a)
  router.post('/garments/import-samples', requireStrictUserAuth, (req, res) => {
    const requestedCloset = req.body?.closet_owner || req.user.defaultCloset;
    const authz = resolveAuthorizedClosets(req, requestedCloset, { mode: 'write' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const closetOwner = authz.primaryCloset;

    const requestedKeys = Array.isArray(req.body?.sample_keys) ? req.body.sample_keys : [];
    const selected =
      requestedKeys.length > 0
        ? SAMPLE_CAPSULE_CATALOG.filter((s) => requestedKeys.includes(s.key))
        : SAMPLE_CAPSULE_CATALOG;

    const imported = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO garments (
          closet_owner, name, category, subcategory, color_name, color_hex,
          seasons, min_temp, max_temp, water_resistant, formality,
          brand, price, wear_count, status, image_url, notes,
          fabric, slot_key, base_glb, physics_preset, custom_texture
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, '샘플 캡슐에서 가져온 아이템', ?, ?, ?, ?, 0)
      `);

      const rows = [];
      for (const item of selected) {
        const spec = resolveManifestSlotAndGlb(item.category, item.subcategory);
        const r = insertStmt.run(
          closetOwner,
          item.name,
          item.category,
          item.subcategory,
          item.color_name,
          item.color_hex,
          JSON.stringify(item.seasons),
          item.min_temp,
          item.max_temp,
          item.water_resistant ? 1 : 0,
          item.formality,
          item.brand,
          item.price,
          item.image_url,
          item.fabric || 'cotton',
          spec.slotKey,
          spec.baseGlb,
          spec.physicsPreset
        );
        const row = db.prepare('SELECT * FROM garments WHERE id = ?').get(r.lastInsertRowid);
        if (row) rows.push(parseGarmentRow(row));
      }
      return rows;
    });

    res.status(201).json({ ok: true, count: imported.length, garments: imported });
  });

  // AI Garment Manifest Resolver Endpoint (Requirement 6.b — read-only computation, safe in sample demo too)
  router.post('/garments/analyze', (req, res) => {
    const {
      category = 'top',
      subcategory = 'knit',
      color_name = '블랙',
      color_hex = '#1D1D1F',
      fabric = 'cotton',
    } = req.body || {};
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    res.json({
      ok: true,
      category,
      subcategory,
      color_name,
      color_hex,
      fabric,
      slot_key: spec.slotKey,
      base_glb: spec.baseGlb,
      physics_preset: spec.physicsPreset,
    });
  });

  // Garments CRUD
  router.get('/garments', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const { category = 'all', q = '' } = req.query;
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    let sql = `SELECT * FROM garments WHERE ${inSpec.clause}`;
    const params = [...inSpec.params];

    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(String(category));
    }
    if (q && String(q).trim()) {
      sql += ' AND (name LIKE ? OR brand LIKE ? OR color_name LIKE ? OR notes LIKE ?)';
      const like = `%${String(q).trim()}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY is_favorite DESC, id DESC';

    const rows = db.prepare(sql).all(...params).map(parseGarmentRow);
    res.json({ garments: rows, isSampleDemo: Boolean(req.isSampleDemo || authz.primaryCloset === 'sample') });
  });

  router.post('/garments', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset,
      name,
      category = 'top',
      subcategory,
      color_name = '블랙',
      color_hex = '#1D1D1F',
      seasons = ['봄', '가을'],
      min_temp = 8,
      max_temp = 20,
      water_resistant = false,
      formality = 'smart',
      brand = '',
      size = '',
      price = 0,
      wear_count = 0,
      status = 'active',
      fabric = 'cotton',
      slot_key,
      base_glb,
      physics_preset,
      custom_texture,
      image_data,
      image_url,
      notes = '',
      memo,
    } = req.body || {};

    const authz = resolveAuthorizedClosets(req, closet_owner, { mode: 'write' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const targetCloset = authz.primaryCloset;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '옷 이름을 입력해주세요.' });
    }

    const defaultSubMap = {
      top: 'knit',
      bottom: 'slacks',
      outer: 'coat',
      shoes: 'sneakers',
      accessory: 'bag',
    };
    const resolvedCategory = String(category || 'top').trim();
    const resolvedSubcategory = String(
      subcategory || defaultSubMap[resolvedCategory] || 'knit'
    ).trim();
    const resolvedNotes = String(memo !== undefined ? memo : notes || '')
      .trim()
      .slice(0, 500);

    const fallbackSeed = getStudioSeedImageForGarment(resolvedCategory, resolvedSubcategory);
    const uploadRes = saveDataUrlImage(image_data || image_url, targetCloset, fallbackSeed);
    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: uploadRes.error });
    }
    const savedUrl = uploadRes.url;
    const spec = resolveManifestSlotAndGlb(resolvedCategory, resolvedSubcategory);
    const isCustomTex =
      custom_texture !== undefined
        ? Boolean(custom_texture)
        : savedUrl.startsWith('/uploads/');

    const result = db.prepare(`
      INSERT INTO garments (
        closet_owner, name, category, subcategory, color_name, color_hex,
        seasons, min_temp, max_temp, water_resistant, formality,
        brand, size, price, wear_count, status, image_url, notes,
        fabric, slot_key, base_glb, physics_preset, custom_texture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetCloset,
      String(name).trim().slice(0, 120),
      resolvedCategory,
      resolvedSubcategory,
      String(color_name).trim(),
      String(color_hex).trim(),
      JSON.stringify(Array.isArray(seasons) ? seasons : ['봄', '가을']),
      Number.isFinite(Number(min_temp)) ? Number(min_temp) : 8,
      Number.isFinite(Number(max_temp)) ? Number(max_temp) : 20,
      water_resistant ? 1 : 0,
      String(formality || 'smart').trim(),
      String(brand || '').trim().slice(0, 80),
      String(size || '').trim().slice(0, 32),
      Math.max(0, Number(price) || 0),
      Math.max(0, Number(wear_count) || 0),
      String(status || 'active').trim(),
      savedUrl,
      resolvedNotes,
      String(fabric || 'cotton').trim(),
      slot_key || spec.slotKey,
      base_glb || spec.baseGlb,
      physics_preset || spec.physicsPreset,
      isCustomTex ? 1 : 0
    );

    const created = db.prepare('SELECT * FROM garments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ garment: parseGarmentRow(created) });
  });

  router.patch('/garments/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 옷장 아이템은 수정할 수 없습니다.' });
    }

    const body = req.body || {};
    const defaultSubMap = {
      top: 'knit',
      bottom: 'slacks',
      outer: 'coat',
      shoes: 'sneakers',
      accessory: 'bag',
    };
    const nextCategory =
      body.category !== undefined ? String(body.category).trim() : existing.category;
    const nextSubcategory =
      body.subcategory !== undefined
        ? String(body.subcategory).trim()
        : nextCategory !== existing.category
          ? defaultSubMap[nextCategory] || existing.subcategory
          : existing.subcategory;
    const nextSpec = resolveManifestSlotAndGlb(nextCategory, nextSubcategory);
    const nextSlotKey =
      nextCategory !== existing.category || body.subcategory !== undefined
        ? nextSpec.slotKey
        : existing.slot_key;
    const nextStatus = body.status !== undefined ? String(body.status).trim() : existing.status;
    const nextFav =
      body.is_favorite !== undefined ? (body.is_favorite ? 1 : 0) : existing.is_favorite;
    const nextName =
      body.name !== undefined && String(body.name).trim()
        ? String(body.name).trim().slice(0, 120)
        : existing.name;
    const nextPrice =
      body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price;
    const nextBrand =
      body.brand !== undefined ? String(body.brand).trim().slice(0, 80) : existing.brand;
    const nextSize =
      body.size !== undefined ? String(body.size).trim().slice(0, 32) : existing.size || '';
    const rawNotes = body.memo !== undefined ? body.memo : body.notes;
    const nextNotes =
      rawNotes !== undefined ? String(rawNotes).trim().slice(0, 500) : existing.notes;
    const nextWearCount =
      body.wear_count !== undefined
        ? Math.max(0, Number(body.wear_count) || 0)
        : existing.wear_count;

    db.prepare(`
      UPDATE garments
      SET name = ?, category = ?, subcategory = ?, slot_key = ?, status = ?, is_favorite = ?,
          price = ?, brand = ?, size = ?, notes = ?, wear_count = ?
      WHERE id = ?
    `).run(
      nextName,
      nextCategory,
      nextSubcategory,
      nextSlotKey,
      nextStatus,
      nextFav,
      nextPrice,
      nextBrand,
      nextSize,
      nextNotes,
      nextWearCount,
      id
    );

    const updated = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    res.json({ garment: parseGarmentRow(updated) });
  });

  router.post('/garments/:id/wear', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 옷장 아이템은 착용 기록할 수 없습니다.' });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE garments
      SET wear_count = wear_count + 1,
          last_worn_date = CASE
            WHEN last_worn_date IS NULL OR last_worn_date < ? THEN ?
            ELSE last_worn_date
          END
      WHERE id = ?
    `).run(todayStr, todayStr, id);

    const updated = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    res.json({ garment: parseGarmentRow(updated) });
  });

  router.delete('/garments/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    }
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 옷장 아이템은 삭제할 수 없습니다.' });
    }

    const imageUrl = existing.image_url;
    db.prepare('DELETE FROM garments WHERE id = ?').run(id);
    unlinkUploadIfUnreferenced(imageUrl);
    res.json({ ok: true });
  });

  // Offline Shopping Assistant (Supports both authenticated users AND read-only X-Demo-Mode: sample!)
  router.post('/shopping/analyze', (req, res) => {
    const isSampleGuestMode = Boolean(
      req.isSampleGuest || req.isSampleDemo || req.headers['x-demo-mode'] === 'sample'
    );

    const rawCloset = isSampleGuestMode
      ? req.body?.closet_owner || 'sample'
      : req.body?.closet_owner || req.user?.defaultCloset;

    const shouldPersistHistory = !isSampleGuestMode && req.body?.save_history !== false;
    const authz = resolveAuthorizedClosets(req, rawCloset, {
      mode: shouldPersistHistory ? 'write' : 'read',
    });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const closetOwner = isSampleGuestMode ? 'sample' : authz.primaryCloset;
    if (isSampleGuestMode && rawCloset && String(rawCloset) !== 'sample') {
      return res.status(403).json({ error: '샘플 체험 모드에서는 샘플 옷장만 비교할 수 있습니다.' });
    }

    const {
      candidate_name = '매장 촬영 새 옷',
      category = 'top',
      subcategory = 'knit',
      color_name = '네이비',
      color_hex = '#1E273B',
      price = 0,
      image_data,
      image_url,
    } = req.body || {};

    const uploadRes = saveDataUrlImage(
      image_data || image_url,
      closetOwner,
      '/seed/store-navy-sweater.jpg',
      { persistToDisk: shouldPersistHistory }
    );
    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: uploadRes.error });
    }
    const savedUrl = uploadRes.url;

    const closetItems = db
      .prepare('SELECT * FROM garments WHERE closet_owner = ?')
      .all(closetOwner)
      .map(parseGarmentRow);

    // Only compare partner closet when inside the husband/wife couple closets
    let partnerItems = [];
    if (closetOwner === 'husband' || closetOwner === 'wife') {
      const partnerClosetKey = closetOwner === 'husband' ? 'wife' : 'husband';
      partnerItems = db
        .prepare('SELECT * FROM garments WHERE closet_owner = ?')
        .all(partnerClosetKey)
        .map(parseGarmentRow);
    }

    const analysis = analyzeShoppingCandidate(
      {
        name: candidate_name,
        category,
        subcategory,
        color_name,
        color_hex,
        price: Number(price) || 0,
      },
      closetItems,
      partnerItems
    );

    let checkId = null;
    if (shouldPersistHistory) {
      const insert = db.prepare(`
        INSERT INTO shopping_checks (
          closet_owner, image_url, candidate_name, category, subcategory,
          color_name, color_hex, price, verdict, similar_count, max_similarity, decision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'undecided')
      `).run(
        closetOwner,
        savedUrl,
        String(candidate_name).trim().slice(0, 120),
        String(category).trim(),
        String(subcategory).trim(),
        String(color_name).trim(),
        String(color_hex).trim(),
        Math.max(0, Number(price) || 0),
        analysis.verdict,
        analysis.similarCount,
        analysis.maxSimilarity
      );
      checkId = insert.lastInsertRowid;
    }

    res.json({
      checkId,
      isSampleDemo: isSampleGuestMode,
      candidate: {
        closet_owner: closetOwner,
        candidate_name,
        category,
        subcategory,
        color_name,
        color_hex,
        price: Math.max(0, Number(price) || 0),
        image_url: savedUrl,
      },
      analysis,
    });
  });

  router.get('/shopping/history', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const rows = db
      .prepare(`SELECT * FROM shopping_checks WHERE ${inSpec.clause} ORDER BY id DESC LIMIT 20`)
      .all(...inSpec.params);
    res.json({ history: rows });
  });

  router.post('/shopping/decision', requireStrictUserAuth, (req, res) => {
    const { checkId, decision, addToCloset = false, brand = '' } = req.body || {};
    const check = db.prepare('SELECT * FROM shopping_checks WHERE id = ?').get(Number(checkId));
    if (!check) return res.status(404).json({ error: '판독 기록을 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, check.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 쇼핑 판독 기록은 변경할 수 없습니다.' });
    }

    const safeDecision = String(decision || 'undecided').trim().slice(0, 32);

    const createdGarment = db.transaction(() => {
      db.prepare('UPDATE shopping_checks SET decision = ? WHERE id = ?').run(
        safeDecision,
        check.id
      );

      if (!addToCloset) return null;

      const closetImageUrl =
        check.image_url === '/seed/store-terracotta-cardigan.jpg' ||
        check.image_url === '/seed/store-navy-sweater.jpg'
          ? getStudioSeedImageForGarment(check.category, check.subcategory)
          : check.image_url;

      const spec = resolveManifestSlotAndGlb(check.category, check.subcategory);
      const insert = db.prepare(`
        INSERT INTO garments (
          closet_owner, name, category, subcategory, color_name, color_hex,
          seasons, min_temp, max_temp, water_resistant, formality,
          brand, price, wear_count, status, image_url, notes,
          fabric, slot_key, base_glb, physics_preset, custom_texture
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'smart', ?, ?, 0, 'active', ?, '오프라인 쇼핑 판독 후 구매 등록', 'cotton', ?, ?, ?, ?)
      `).run(
        check.closet_owner,
        check.candidate_name,
        check.category,
        check.subcategory,
        check.color_name,
        check.color_hex,
        JSON.stringify(['봄', '가을']),
        8,
        20,
        String(brand || '').trim().slice(0, 80),
        check.price,
        closetImageUrl,
        spec.slotKey,
        spec.baseGlb,
        spec.physicsPreset,
        closetImageUrl.startsWith('/uploads/') ? 1 : 0
      );
      return parseGarmentRow(
        db.prepare('SELECT * FROM garments WHERE id = ?').get(insert.lastInsertRowid)
      );
    });

    res.json({ ok: true, createdGarment });
  });

  // Weather & AI Styling Recommendations (Requirement 7.b & 8.a)
  router.get('/weather/recommendations', async (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const {
      city = 'seoul',
      scenario = 'live',
      lat,
      lon,
      location_label,
      personal_color,
      skin_tone_hex,
      gender,
    } = req.query;
    const closetOwner = authz.primaryCloset;

    const garments = db
      .prepare('SELECT * FROM garments WHERE closet_owner = ?')
      .all(closetOwner)
      .map(parseGarmentRow);

    const baseOwnerUser =
      closetOwner === 'sample'
        ? req.userRow
        : db.prepare('SELECT * FROM users WHERE default_closet = ?').get(closetOwner) || req.userRow;

    const ownerUser = {
      ...(baseOwnerUser || {}),
      ...(personal_color ? { personal_color: String(personal_color) } : {}),
      ...(skin_tone_hex ? { skin_tone_hex: String(skin_tone_hex) } : {}),
      ...(gender ? { gender: String(gender) } : {}),
    };

    const customCoords =
      lat !== undefined && lon !== undefined
        ? { lat: Number(lat), lon: Number(lon), label: location_label || '현재 위치' }
        : null;

    const weather = await fetchTomorrowWeather(String(city), String(scenario), customCoords);

    // Requirement 8.a: If a real user's personal closet is empty, do NOT silently inject seed items!
    if (garments.length === 0) {
      const emptyResult = buildWeatherRecommendations(weather, [], [], ownerUser);
      return res.json({
        ...emptyResult,
        isClosetEmpty: true,
        isSampleDemo: Boolean(req.isSampleDemo || closetOwner === 'sample'),
        recommendations: [],
      });
    }

    const recentLogs = db
      .prepare(
        "SELECT * FROM wear_logs WHERE closet_owner = ? AND status = 'worn' ORDER BY worn_date DESC LIMIT 3"
      )
      .all(closetOwner);

    const result = buildWeatherRecommendations(weather, garments, recentLogs, ownerUser);
    res.json({
      ...result,
      isClosetEmpty: false,
      isSampleDemo: Boolean(req.isSampleDemo || closetOwner === 'sample'),
    });
  });

  // Outfits
  router.get('/outfits', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const rows = db
      .prepare(`SELECT * FROM outfits WHERE ${inSpec.clause} ORDER BY id DESC`)
      .all(...inSpec.params);

    const garmentMap = new Map(
      db
        .prepare(`SELECT * FROM garments WHERE ${inSpec.clause}`)
        .all(...inSpec.params)
        .map((g) => [g.id, parseGarmentRow(g)])
    );

    const outfits = rows.map((o) => {
      const ids = safeParseJsonArray(o.item_ids, []).map(Number).filter(Boolean);
      return {
        ...o,
        item_ids: ids,
        items: ids.map((id) => garmentMap.get(id)).filter(Boolean),
      };
    });

    res.json({ outfits });
  });

  router.post('/outfits', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset,
      title,
      occasion = '데일리',
      season = '봄/가을',
      item_ids = [],
      memo = '',
    } = req.body || {};

    const authz = resolveAuthorizedClosets(req, closet_owner, { mode: 'write' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const targetCloset = authz.primaryCloset;

    if (!title || !Array.isArray(item_ids) || item_ids.length < 1) {
      return res.status(400).json({ error: '코디 이름과 의류를 선택해주세요.' });
    }

    const readAuthz = resolveAuthorizedClosets(req, targetCloset, { mode: 'read' });
    const allowedGarmentIds = new Set(
      db
        .prepare(`SELECT id FROM garments WHERE ${buildClosetInClause(readAuthz.closets).clause}`)
        .all(...readAuthz.closets)
        .map((r) => Number(r.id))
    );
    const cleanIds = item_ids
      .map(Number)
      .filter((id) => Number.isFinite(id) && allowedGarmentIds.has(id));
    if (cleanIds.length < 1) {
      return res.status(400).json({ error: '선택한 의류 권한을 확인할 수 없습니다.' });
    }

    const result = db.prepare(`
      INSERT INTO outfits (closet_owner, title, occasion, season, item_ids, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      targetCloset,
      String(title).trim().slice(0, 120),
      String(occasion || '데일리').trim().slice(0, 40),
      String(season || '봄/가을').trim().slice(0, 40),
      JSON.stringify(cleanIds),
      String(memo || '').trim().slice(0, 500)
    );

    res.status(201).json({ id: result.lastInsertRowid });
  });

  router.delete('/outfits/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '코디를 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 코디는 삭제할 수 없습니다.' });
    }
    db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Calendar / OOTD Wear Logs + Future Outfit Reservations (Requirement 7.a)
  router.get('/calendar', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const rows = db
      .prepare(
        `SELECT * FROM wear_logs WHERE ${inSpec.clause} ORDER BY worn_date DESC, id DESC LIMIT 120`
      )
      .all(...inSpec.params);

    const garmentMap = new Map(
      db
        .prepare(`SELECT * FROM garments WHERE ${inSpec.clause}`)
        .all(...inSpec.params)
        .map((g) => [g.id, parseGarmentRow(g)])
    );

    const logs = rows.map((log) => {
      const ids = safeParseJsonArray(log.item_ids, []).map(Number).filter(Boolean);
      return {
        ...log,
        status: log.status || 'worn',
        item_ids: ids,
        items: ids.map((id) => garmentMap.get(id)).filter(Boolean),
      };
    });

    res.json({ logs });
  });

  router.get('/calendar/ics', (req, res) => {
    const requestedCloset = req.query.closet ?? req.query.owner;
    const authz = resolveAuthorizedClosets(req, requestedCloset, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const rows = db
      .prepare(`SELECT * FROM wear_logs WHERE ${inSpec.clause} ORDER BY worn_date DESC LIMIT 90`)
      .all(...inSpec.params);

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//A inventory//OOTD Calendar//KO',
      'CALSCALE:GREGORIAN',
    ];
    for (const r of rows) {
      const dt = String(r.worn_date || '').replace(/-/g, '');
      if (!/^\d{8}$/.test(dt)) continue;
      const rawSummary =
        r.status === 'planned' ? `[예약 코디] ${r.note || 'OOTD'}` : `[OOTD] ${r.note || '착용 기록'}`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:ainventory-ootd-${Number(r.id)}@ainventory.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      lines.push(`SUMMARY:${escapeIcsText(rawSummary)}`);
      if (r.weather_summary) {
        lines.push(`DESCRIPTION:${escapeIcsText(r.weather_summary)}`);
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(lines.join('\r\n'));
  });

  router.post('/calendar', requireStrictUserAuth, (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const {
      closet_owner = req.body?.owner || req.user.defaultCloset,
      worn_date = todayStr,
      outfit_id = null,
      item_ids = [],
      weather_summary = '',
      temp_c = null,
      note = '',
      status,
    } = req.body || {};

    const authz = resolveAuthorizedClosets(req, closet_owner, { mode: 'write' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const targetCloset = authz.primaryCloset;

    let validOutfitId = null;
    let resolvedIds = Array.isArray(item_ids)
      ? item_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    if (outfit_id) {
      const outfitRow = db.prepare('SELECT * FROM outfits WHERE id = ?').get(Number(outfit_id));
      if (!outfitRow) {
        return res.status(404).json({ error: '선택한 코디를 찾을 수 없습니다.' });
      }
      if (!canWriteClosetOwner(req, outfitRow.closet_owner)) {
        return res.status(403).json({ error: '다른 사용자의 코디는 연결할 수 없습니다.' });
      }
      validOutfitId = Number(outfit_id);
      if (resolvedIds.length === 0) {
        resolvedIds = safeParseJsonArray(outfitRow.item_ids, [])
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
      }
    }

    // Filter item_ids to caller's authorized garments — NEVER fabricate 3 random garments when empty!
    if (resolvedIds.length > 0) {
      const ownedGarments = new Set(
        db
          .prepare('SELECT id FROM garments WHERE closet_owner = ?')
          .all(targetCloset)
          .map((r) => Number(r.id))
      );
      resolvedIds = resolvedIds.filter((gid) => ownedGarments.has(gid));
    }

    const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(worn_date)) ? String(worn_date) : todayStr;
    const resolvedStatus =
      status === 'planned' || status === 'worn'
        ? status
        : cleanDate > todayStr
          ? 'planned'
          : 'worn';

    const insertedId = db.transaction(() => {
      const insert = db.prepare(`
        INSERT INTO wear_logs (closet_owner, worn_date, outfit_id, item_ids, weather_summary, temp_c, note, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetCloset,
        cleanDate,
        validOutfitId,
        JSON.stringify(resolvedIds),
        String(weather_summary || '').slice(0, 120),
        temp_c !== null && temp_c !== undefined && temp_c !== '' ? Number(temp_c) : null,
        String(note || '').trim().slice(0, 500),
        resolvedStatus
      );

      if (resolvedStatus === 'worn') {
        if (resolvedIds.length > 0) {
          const updateGarment = db.prepare(`
            UPDATE garments
            SET wear_count = wear_count + 1,
                last_worn_date = MAX(COALESCE(last_worn_date, ''), ?)
            WHERE id = ? AND closet_owner = ?
          `);
          for (const gid of resolvedIds) {
            updateGarment.run(cleanDate, gid, targetCloset);
          }
        }

        if (validOutfitId) {
          db.prepare(`
            UPDATE outfits
            SET wear_count = wear_count + 1,
                last_worn_date = MAX(COALESCE(last_worn_date, ''), ?)
            WHERE id = ? AND closet_owner = ?
          `).run(cleanDate, validOutfitId, targetCloset);
        }
      }

      return insert.lastInsertRowid;
    });

    res.status(201).json({ ok: true, id: insertedId, status: resolvedStatus });
  });

  router.patch('/calendar/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM wear_logs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '일정 기록을 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 일정 기록은 수정할 수 없습니다.' });
    }

    const nextStatus = req.body?.status === 'planned' ? 'planned' : 'worn';

    db.transaction(() => {
      if (existing.status === 'planned' && nextStatus === 'worn') {
        const ids = safeParseJsonArray(existing.item_ids, [])
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
        const updateGarment = db.prepare(`
          UPDATE garments
          SET wear_count = wear_count + 1,
              last_worn_date = MAX(COALESCE(last_worn_date, ''), ?)
          WHERE id = ? AND closet_owner = ?
        `);
        for (const gid of ids) {
          updateGarment.run(existing.worn_date, gid, existing.closet_owner);
        }
        if (existing.outfit_id) {
          db.prepare(`
            UPDATE outfits
            SET wear_count = wear_count + 1,
                last_worn_date = MAX(COALESCE(last_worn_date, ''), ?)
            WHERE id = ? AND closet_owner = ?
          `).run(existing.worn_date, Number(existing.outfit_id), existing.closet_owner);
        }
      }
      db.prepare('UPDATE wear_logs SET status = ? WHERE id = ?').run(nextStatus, id);
    });

    res.json({ ok: true, status: nextStatus });
  });

  router.delete('/calendar/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM wear_logs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '일정 기록을 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 일정 기록은 삭제할 수 없습니다.' });
    }
    db.prepare('DELETE FROM wear_logs WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Trip Packing Lists CRUD (Requirement 7.a)
  router.get('/packing-lists', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const rows = db
      .prepare(`SELECT * FROM packing_lists WHERE ${inSpec.clause} ORDER BY id DESC LIMIT 30`)
      .all(...inSpec.params);

    const lists = rows.map((r) => ({
      ...r,
      items: safeParseJsonArray(r.items_json, []),
    }));
    res.json({ lists });
  });

  router.post('/packing-lists', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset,
      title = '',
      destination = '도쿄',
      start_date = new Date().toISOString().slice(0, 10),
      end_date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      climate = 'mild',
      items,
    } = req.body || {};

    const authz = resolveAuthorizedClosets(req, closet_owner, { mode: 'write' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const targetCloset = authz.primaryCloset;

    let finalItems = Array.isArray(items) ? items : null;
    if (!finalItems) {
      const garments = db
        .prepare('SELECT * FROM garments WHERE closet_owner = ?')
        .all(targetCloset)
        .map(parseGarmentRow);
      finalItems = buildTripPackingList({
        destination,
        startDate: start_date,
        endDate: end_date,
        climate,
        garments,
      }).items;
    }

    const cleanTitle = String(title || `${destination} 패킹 리스트`).trim().slice(0, 120);
    const r = db.prepare(`
      INSERT INTO packing_lists (closet_owner, title, destination, start_date, end_date, climate, items_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetCloset,
      cleanTitle,
      String(destination).trim().slice(0, 80),
      String(start_date).slice(0, 10),
      String(end_date).slice(0, 10),
      String(climate || 'mild').slice(0, 24),
      JSON.stringify(finalItems)
    );

    const created = db.prepare('SELECT * FROM packing_lists WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json({
      list: {
        ...created,
        items: finalItems,
      },
    });
  });

  router.patch('/packing-lists/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM packing_lists WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '패킹 리스트를 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 패킹 리스트는 수정할 수 없습니다.' });
    }

    let items = safeParseJsonArray(existing.items_json, []);

    if (Array.isArray(req.body?.items)) {
      items = req.body.items;
    } else if (req.body?.toggleKey) {
      items = items.map((it) =>
        it.key === req.body.toggleKey ? { ...it, checked: !it.checked } : it
      );
    }

    db.prepare('UPDATE packing_lists SET items_json = ? WHERE id = ?').run(
      JSON.stringify(items),
      id
    );
    res.json({ ok: true, items });
  });

  router.delete('/packing-lists/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM packing_lists WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '패킹 리스트를 찾을 수 없습니다.' });
    if (!canWriteClosetOwner(req, existing.closet_owner)) {
      return res.status(403).json({ error: '다른 사용자의 패킹 리스트는 삭제할 수 없습니다.' });
    }
    db.prepare('DELETE FROM packing_lists WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Wardrobe Insights & CPW Dashboard (Requirement 7.c & 12.d)
  router.get('/analytics', (req, res) => {
    const authz = resolveAuthorizedClosets(req, req.query.closet, { mode: 'read' });
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }
    const inSpec = buildClosetInClause(authz.closets, 'closet_owner');
    const garments = db
      .prepare(`SELECT * FROM garments WHERE ${inSpec.clause}`)
      .all(...inSpec.params)
      .map(parseGarmentRow);

    const totalItems = garments.length;
    const totalValue = garments.reduce((acc, g) => acc + (g.price || 0), 0);
    const totalWears = garments.reduce((acc, g) => acc + (g.wear_count || 0), 0);
    const avgCpw = totalWears > 0 ? Math.round(totalValue / totalWears) : 0;

    const nowMs = Date.now();
    const withDaysSinceWorn = garments.map((g) => {
      const daysUnworn = g.last_worn_date
        ? Math.max(0, Math.floor((nowMs - new Date(g.last_worn_date).getTime()) / 86400000))
        : 999;
      return { ...g, daysUnworn };
    });

    const cpwRanking = [...withDaysSinceWorn]
      .filter((g) => g.price > 0)
      .sort((a, b) => a.cpw - b.cpw);

    const bestValueItems = cpwRanking.filter((g) => g.wear_count > 0).slice(0, 6);

    const sleepingItems = [...withDaysSinceWorn]
      .filter((g) => g.wear_count <= 2 || g.daysUnworn >= 45)
      .sort((a, b) => a.wear_count - b.wear_count || b.daysUnworn - a.daysUnworn)
      .slice(0, 12);

    const categoryDist = {};
    const colorDist = {};
    for (const g of garments) {
      categoryDist[g.category] = (categoryDist[g.category] || 0) + 1;
      if (!colorDist[g.color_name]) {
        colorDist[g.color_name] = { count: 0, hex: g.color_hex };
      }
      colorDist[g.color_name].count += 1;
    }

    const sortedColors = Object.entries(colorDist)
      .map(([name, info]) => ({
        name,
        count: info.count,
        hex: info.hex,
        sharePct: totalItems > 0 ? Math.round((info.count / totalItems) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sortedCategories = Object.entries(categoryDist)
      .map(([category, count]) => ({
        category,
        count,
        sharePct: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const passedChecks = db
      .prepare(
        `SELECT * FROM shopping_checks WHERE ${inSpec.clause} AND decision = 'passed'`
      )
      .all(...inSpec.params);
    const savedMoney = passedChecks.reduce((acc, c) => acc + (c.price || 0), 0);

    res.json({
      totalItems,
      totalValue,
      totalWears,
      avgCpw,
      utilizationRate:
        totalItems > 0
          ? Math.round((garments.filter((g) => g.wear_count >= 3).length / totalItems) * 100)
          : 0,
      cpwRanking: cpwRanking.slice(0, 20),
      bestValueItems,
      sleepingItems,
      categoryDist,
      sortedCategories,
      categoryDistribution: sortedCategories,
      colorDist: sortedColors,
      colorDistribution: sortedColors,
      topColorSharePct: sortedColors[0]?.sharePct || 0,
      topColorName: sortedColors[0]?.name || '-',
      savedMoney,
      passedCount: passedChecks.length,
    });
  });

  // Admin routes
  router.get('/admin/overview', requireStrictUserAuth, requireAdmin, (_req, res) => {
    const users = db
      .prepare(
        'SELECT id, username, email, display_name, role, default_closet, closet_name, verified_at, personal_color, body_shape, created_at FROM users ORDER BY id ASC'
      )
      .all();
    const counts = {
      husbandGarments: db
        .prepare("SELECT COUNT(*) as c FROM garments WHERE closet_owner = 'husband'")
        .get().c,
      wifeGarments: db
        .prepare("SELECT COUNT(*) as c FROM garments WHERE closet_owner = 'wife'")
        .get().c,
      outfits: db.prepare('SELECT COUNT(*) as c FROM outfits').get().c,
      wearLogs: db.prepare('SELECT COUNT(*) as c FROM wear_logs').get().c,
      shoppingChecks: db.prepare('SELECT COUNT(*) as c FROM shopping_checks').get().c,
    };

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(DB_PATH).size;
    } catch {
      dbSizeBytes = 0;
    }

    // Omit hostname and server filesystem dbPath; expose sqliteDriver instead
    res.json({
      users,
      counts,
      system: {
        nodeVersion: process.version,
        platform: `${process.platform} (${process.arch})`,
        sqliteDriver: SQLITE_DRIVER,
        dbSizeKb: Math.round(dbSizeBytes / 1024),
        uptimeSec: Math.round(process.uptime()),
      },
    });
  });

  router.post('/admin/users', requireStrictUserAuth, requireAdmin, (req, res) => {
    const {
      username,
      password,
      display_name,
      role = 'member',
      default_closet,
    } = req.body || {};
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: '아이디, 비밀번호, 이름을 모두 입력해주세요.' });
    }
    const cleanU = sanitizeSafeSlug(username, '');
    const pwStr = typeof password === 'string' ? password : String(password ?? '');
    if (!cleanU || cleanU.length < 2) {
      return res.status(400).json({ error: '유효한 아이디를 입력해주세요.' });
    }
    if (pwStr.length < MIN_PASSWORD_LEN || pwStr.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({
        error: `비밀번호는 ${MIN_PASSWORD_LEN}자 이상 ${MAX_PASSWORD_LEN}자 이하로 입력해주세요.`,
      });
    }

    const assignedCloset =
      default_closet && String(default_closet).trim()
        ? String(default_closet).trim()
        : `closet_${cleanU}`;
    const nowIso = new Date().toISOString();
    const vHash = computeVerificationHash(cleanU, `${cleanU}@ainventory.kr`, nowIso);
    try {
      db.prepare(`
        INSERT INTO users (
          username, email, password_hash, display_name, role, default_closet,
          closet_name, verified_at, verification_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cleanU,
        `${cleanU}@ainventory.kr`,
        hashPassword(pwStr),
        String(display_name).trim().slice(0, 60),
        role === 'admin' ? 'admin' : 'member',
        assignedCloset,
        `${String(display_name).trim().slice(0, 60)}의 옷장`,
        nowIso,
        vHash
      );
      res.status(201).json({ ok: true });
    } catch {
      res.status(409).json({ error: '이미 존재하는 아이디입니다.' });
    }
  });

  router.post('/admin/reset-demo', requireStrictUserAuth, requireAdmin, (_req, res) => {
    seedIfEmpty(true);
    res.json({ ok: true });
  });

  return router;
}
