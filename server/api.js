import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, {
  DB_PATH,
  OUTBOX_DIR,
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
  resolveManifestSlotAndGlb,
} from './engine.js';
import {
  AGE_GROUPS,
  BODY_SHAPE_OPTIONS,
  WEAR_SLOTS,
  computeBodyMetrics,
  generateStatisticalWardrobeForUser,
  getStudioSeedImageForGarment,
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

// Rate limiting memory store for email OTP dispatch & verification attempts (Requirement 10.b)
const rateBuckets = new Map();
const RESEND_COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_DISPATCH_PER_WINDOW = 5;
const MAX_VERIFY_FAILS_PER_WINDOW = 5;

function checkRateLimit(bucketKey, maxCount) {
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

function saveDataUrlImage(dataUrl, fallbackUrl = '/seed/cream-knit.jpg') {
  if (!dataUrl || typeof dataUrl !== 'string') return fallbackUrl;
  if (dataUrl.startsWith('/seed/') || dataUrl.startsWith('/uploads/')) {
    return dataUrl;
  }
  const match = dataUrl.match(/^data:image\/(webp|png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return fallbackUrl;
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function unlinkUploadIfOwned(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return;
  const safeBase = path.basename(imageUrl);
  const fullPath = path.join(UPLOADS_DIR, safeBase);
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
  let seasons = ['봄', '가을'];
  try {
    seasons = JSON.parse(row.seasons || '["봄","가을"]');
  } catch {
    seasons = ['봄', '가을'];
  }
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
  return {
    ...row,
    image_url: imageUrl,
    seasons,
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

const PERSONAL_COLOR_LABELS = {
  spring_warm: { nameKo: '봄 웜톤', nameEn: 'Spring Warm' },
  summer_cool: { nameKo: '여름 쿨톤', nameEn: 'Summer Cool' },
  autumn_warm: { nameKo: '가을 웜톤', nameEn: 'Autumn Warm' },
  winter_cool: { nameKo: '겨울 쿨톤', nameEn: 'Winter Cool' },
};

export function formatUserPayload(u) {
  if (!u) return null;
  const pcProfile = PERSONAL_COLOR_LABELS[u.personal_color] || null;
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
    personalColorLabelKo: pcProfile ? pcProfile.nameKo : null,
    personalColorLabelEn: pcProfile ? pcProfile.nameEn : null,
    bodyFatPct: u.body_fat_pct !== null && u.body_fat_pct !== undefined ? Number(u.body_fat_pct) : null,
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
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveClosetAlias(closetParam, fallback = 'husband') {
  if (!closetParam || closetParam === 'sample') return 'husband';
  return String(closetParam);
}

function createGuestDemoUser() {
  const demoRow = {
    id: 0,
    username: 'sample_guest',
    email: null,
    display_name: '샘플 옷장 체험',
    role: 'guest',
    auth_provider: 'sample_demo',
    default_closet: 'husband',
    closet_name: '샘플 캡슐 옷장',
    personal_color: 'autumn_warm',
    skin_tone_hex: '#DFC1A6',
    profile_completed: 1,
    height_cm: 175,
    weight_kg: 68,
    body_shape: 'balanced',
  };
  return { row: demoRow, payload: { ...formatUserPayload(demoRow), isSampleDemo: true } };
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (token) {
    const session = db.prepare(`
      SELECT s.token, s.expires_at, u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `).get(token);

    if (session && new Date(session.expires_at) >= new Date()) {
      req.userRow = session;
      req.user = formatUserPayload(session);
      req.token = token;
      req.isSampleDemo = false;
      return next();
    }
  }

  // Allow unauthenticated Sample Closet Demo Mode (Requirement 8.a: Robo crawler & instant trial)
  const isDemoHeader = req.headers['x-demo-mode'] === 'sample';
  const closetQuery = String(req.query?.closet || '');
  if (
    req.method === 'GET' &&
    (isDemoHeader || closetQuery === 'sample' || closetQuery === 'husband' || closetQuery === 'wife')
  ) {
    const guest = createGuestDemoUser();
    req.userRow = guest.row;
    req.user = guest.payload;
    req.isSampleDemo = true;
    return next();
  }

  return res.status(401).json({ error: '로그인이 필요합니다.' });
}

function requireStrictUserAuth(req, res, next) {
  if (!req.user || req.isSampleDemo || req.user.id === 0) {
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

function issueUserSession(res, userRow) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userRow.id,
    expires
  );
  res.setHeader(
    'Set-Cookie',
    `ainventory_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
  );
  return token;
}

export function createApiRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '20mb' }));

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'A inventory API', timestamp: new Date().toISOString() });
  });

  // Public Sample Capsule Catalog (Requirement 8.a)
  router.get('/sample-catalog', (_req, res) => {
    res.json({ samples: SAMPLE_CAPSULE_CATALOG });
  });

  const writeVerificationOutboxHtml = ({
    username,
    email,
    displayName,
    verifyToken,
    verificationCode,
    verifyUrl,
  }) => {
    const outboxFile = `${username}-verify.html`;
    const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>[A inventory] 이메일 회원가입 인증 안내</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#F5F5F7; padding:32px; color:#1D1D1F;">
  <div style="max-width:520px; margin:0 auto; background:#FFFFFF; border-radius:18px; padding:28px;">
    <p style="font-size:12px; letter-spacing:0.08em; color:#86868B; margin:0 0 8px;">A INVENTORY</p>
    <h1 style="font-size:20px; margin:0 0 12px;">${displayName}님, 이메일 인증을 완료해 주세요</h1>
    <p style="font-size:14px; line-height:1.6; color:#515154;">아래 6자리 인증번호를 입력하거나 인증 링크를 열면 계정이 즉시 활성화됩니다.</p>
    <div style="margin:20px 0; padding:18px; background:#F5F5F7; border-radius:12px; text-align:center;">
      <span style="display:block; font-size:12px; color:#86868B; margin-bottom:4px;">6자리 인증코드</span>
      <strong style="font-size:28px; letter-spacing:0.28em; font-variant-numeric:tabular-nums; color:#1D1D1F;">${verificationCode}</strong>
    </div>
    <p style="font-size:13px; color:#86868B;">인증 링크: <a href="${verifyUrl}">${verifyUrl}</a></p>
    <small style="color:#86868B;">계정: @${username} (${email}) · Token: ${verifyToken.slice(0, 12)}...</small>
  </div>
</body>
</html>`;
    try {
      fs.writeFileSync(path.join(OUTBOX_DIR, outboxFile), html, 'utf8');
    } catch {
      // ignore outbox write error
    }
    return `/data/outbox/${outboxFile}`;
  };

  const emailOtpPending = new Map();

  // Pre-registration Email OTP Step 1: Send 6-digit OTP with 60s cooldown & rate limiting (Req 5 & 10.b)
  router.post('/auth/send-verification', (req, res) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
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
    const tempUser = cleanEmail.split('@')[0].replace(/[^a-z0-9_.-]/g, '') || 'member';
    const outboxPath = writeVerificationOutboxHtml({
      username: tempUser,
      email: cleanEmail,
      displayName: tempUser,
      verifyToken,
      verificationCode,
      verifyUrl: `/?verify_token=${verifyToken}`,
    });

    emailOtpPending.set(cleanEmail, {
      code: verificationCode,
      token: verifyToken,
      lastSentAt: Date.now(),
      verified: false,
    });

    res.json({
      ok: true,
      resendCooldownSec: 60,
      cooldownSec: 60,
      remainingResends: rate.remaining,
      devPreviewCode: verificationCode,
      outboxPath,
    });
  });

  // Pre-registration Email OTP Step 2: Verify 6-digit OTP with attempt rate limiting (Req 10.b)
  router.post('/auth/verify-email-code', (req, res) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!cleanEmail || !code) {
      return res.status(400).json({ error: '이메일과 6자리 인증코드를 입력해주세요.' });
    }

    const failBucket = rateBuckets.get(`preotpfail:${cleanEmail}`);
    if (
      failBucket &&
      Date.now() - failBucket.windowStart <= WINDOW_MS &&
      failBucket.count >= MAX_VERIFY_FAILS_PER_WINDOW
    ) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((failBucket.windowStart + WINDOW_MS - Date.now()) / 1000)
      );
      return res.status(429).json({
        error: `인증번호 입력 실패 횟수(${MAX_VERIFY_FAILS_PER_WINDOW}회)를 초과했습니다. ${retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'OTP_ATTEMPTS_EXCEEDED',
        retryAfterSec,
      });
    }

    const pending = emailOtpPending.get(cleanEmail);
    if (!pending || pending.code !== code) {
      const failRes = checkRateLimit(`preotpfail:${cleanEmail}`, MAX_VERIFY_FAILS_PER_WINDOW);
      return res.status(400).json({
        error: `인증코드 6자리가 일치하지 않습니다. (남은 시도 ${failRes.remaining}회)`,
        remainingAttempts: failRes.remaining,
      });
    }

    pending.verified = true;
    emailOtpPending.set(cleanEmail, pending);
    res.json({ ok: true, verified: true });
  });

  // Pre-registration Email OTP Step 3: Complete sign-up with EMPTY personal closet (Req 5 & 8.a)
  router.post('/auth/register-email', (req, res) => {
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
    if (!pending || (!pending.verified && pending.code !== String(code).trim())) {
      return res.status(400).json({ error: '이메일 인증코드 확인이 필요합니다.' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상 입력해주세요.' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(cleanEmail);
    if (existingEmail) {
      return res.status(409).json({ error: '이미 가입된 이메일 주소입니다.' });
    }

    let baseUsername =
      cleanEmail
        .split('@')[0]
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 20) || 'member';
    if (baseUsername.length < 2) baseUsername = `user_${baseUsername}`;
    let cleanUsername = baseUsername;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)) {
      cleanUsername = `${baseUsername}_${crypto.randomInt(100, 9999)}`;
    }

    const cleanDisplayName = String(displayName || cleanUsername).trim();
    const cleanClosetName = String(closetName || `${cleanDisplayName}의 옷장`).trim();
    const closetKey = `closet_${cleanUsername}`;
    const nowIso = new Date().toISOString();
    const vHash = computeVerificationHash(cleanUsername, cleanEmail, nowIso);

    db.prepare(`
      INSERT INTO users (
        username, email, password_hash, display_name, role, default_closet,
        closet_name, verification_token, verification_code, verified_at, verification_hash,
        gender, profile_completed, auth_provider, verify_last_sent_at, verify_send_count, verify_fail_count
      ) VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, ?, ?, ?, 0, 'email', ?, 1, 0)
    `).run(
      cleanUsername,
      cleanEmail,
      hashPassword(String(password)),
      cleanDisplayName,
      closetKey,
      cleanClosetName,
      pending.token,
      pending.code,
      nowIso,
      vHash,
      String(gender || 'unspecified'),
      nowIso
    );

    emailOtpPending.delete(cleanEmail);
    const createdUser = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);
    const sessionToken = issueUserSession(res, createdUser);

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

    const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(display_name || displayName || cleanUsername).trim();
    const cleanClosetName = String(closet_name || closetName || '').trim() || null;

    if (!cleanUsername || cleanUsername.length < 2) {
      return res.status(400).json({ error: '아이디는 영문/숫자 2자 이상으로 입력해주세요.' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상 입력해주세요.' });
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
      hashPassword(String(password)),
      cleanDisplayName,
      closetKey,
      cleanClosetName,
      verifyToken,
      verificationCode,
      nowIso
    );

    const verifyUrl = `/?verify_token=${verifyToken}`;
    const outboxPath = writeVerificationOutboxHtml({
      username: cleanUsername,
      email: cleanEmail,
      displayName: cleanDisplayName,
      verifyToken,
      verificationCode,
      verifyUrl,
    });

    res.status(201).json({
      ok: true,
      username: cleanUsername,
      email: cleanEmail,
      displayName: cleanDisplayName,
      defaultCloset: closetKey,
      verificationToken: verifyToken,
      verificationCode,
      verifyUrl,
      cooldownSec: 60,
      user: {
        username: cleanUsername,
        email: cleanEmail,
        displayName: cleanDisplayName,
        defaultCloset: closetKey,
      },
      verification: {
        token: verifyToken,
        code: verificationCode,
        verifyUrl,
        outboxPath,
        cooldownSec: 60,
        remainingResends: MAX_DISPATCH_PER_WINDOW - 1,
      },
      message: '인증 메일이 발송되었습니다.',
    });
  });

  // 1b. Resend email verification with 60s cooldown & window rate limiting (Requirement 10.b)
  router.post('/auth/resend-verification', (req, res) => {
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
          verify_send_count = COALESCE(verify_send_count, 0) + 1
      WHERE id = ?
    `).run(verifyToken, verificationCode, nowIso, user.id);

    const verifyUrl = `/?verify_token=${verifyToken}`;
    const outboxPath = writeVerificationOutboxHtml({
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      verifyToken,
      verificationCode,
      verifyUrl,
    });

    res.json({
      ok: true,
      cooldownSec: 60,
      remainingResends: rate.remaining,
      user: {
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      verification: {
        token: verifyToken,
        code: verificationCode,
        verifyUrl,
        outboxPath,
        cooldownSec: 60,
        remainingResends: rate.remaining,
      },
    });
  });

  // 2. Verify landing info
  router.get('/auth/verify-info', (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: '인증 토큰이 누락되었습니다.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
    if (!user) {
      return res.status(404).json({ error: '유효하지 않거나 만료된 이메일 인증 링크입니다.' });
    }
    const alreadyVerified = Boolean(user.verified_at && user.verification_hash);
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

  // 3. Complete email verification with OTP attempt rate limiting (Requirement 10.b)
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

      const failBucket = rateBuckets.get(`otpfail:${candidate.id}`);
      if (
        failBucket &&
        Date.now() - failBucket.windowStart <= WINDOW_MS &&
        failBucket.count >= MAX_VERIFY_FAILS_PER_WINDOW
      ) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((failBucket.windowStart + WINDOW_MS - Date.now()) / 1000)
        );
        return res.status(429).json({
          error: `인증번호 입력 실패 횟수(${MAX_VERIFY_FAILS_PER_WINDOW}회)를 초과했습니다. ${retryAfterSec}초 후 다시 시도해주세요.`,
          code: 'OTP_ATTEMPTS_EXCEEDED',
          retryAfterSec,
        });
      }

      if (candidate.verification_code !== code) {
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
      user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
      if (!user) {
        return res.status(404).json({ error: '유효하지 않은 이메일 인증 토큰입니다.' });
      }
    } else {
      return res.status(400).json({ error: '6자리 인증코드 또는 인증 토큰이 필요합니다.' });
    }

    const verifiedAt = user.verified_at || new Date().toISOString();
    const verificationHash =
      user.verification_hash || computeVerificationHash(user.username, user.email, verifiedAt);

    db.prepare(`
      UPDATE users
      SET verified_at = ?, verification_hash = ?, verify_fail_count = 0
      WHERE id = ?
    `).run(verifiedAt, verificationHash, user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const sessionToken = issueSession && updatedUser ? issueUserSession(res, updatedUser) : null;

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

  // 4. Login by username OR email
  router.post('/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const idClean = String(username).trim();
    const user = db
      .prepare('SELECT * FROM users WHERE username = ? OR lower(email) = lower(?)')
      .get(idClean, idClean);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (!user.verified_at || !user.verification_hash) {
      return res.status(403).json({
        error: '이메일 인증이 완료되지 않은 계정입니다. 먼저 이메일 인증을 완료해주세요.',
        code: 'EMAIL_NOT_VERIFIED',
        username: user.username,
        email: user.email,
        verificationToken: user.verification_token,
        verifyUrl: user.verification_token ? `/?verify_token=${user.verification_token}` : null,
      });
    }

    const token = issueUserSession(res, user);
    res.json({
      token,
      user: formatUserPayload(user),
    });
  });

  // 4b. Sign in with Apple (Requirement 10.b: App Store mandatory social login parity)
  router.post('/auth/apple', (req, res) => {
    const {
      id_token = '',
      apple_sub = '',
      appleSub = '',
      email = '',
      full_name = '',
      fullName = '',
    } = req.body || {};

    let resolvedSub = String(apple_sub || appleSub || '').trim();
    let resolvedEmail = String(email || '').trim().toLowerCase();

    // Decode JWT payload if Apple Identity Token was passed from native/web SDK
    if (id_token && typeof id_token === 'string' && id_token.split('.').length === 3) {
      try {
        const payloadJson = JSON.parse(
          Buffer.from(id_token.split('.')[1], 'base64url').toString('utf8')
        );
        if (payloadJson.sub) resolvedSub = String(payloadJson.sub);
        if (payloadJson.email && !resolvedEmail) resolvedEmail = String(payloadJson.email).toLowerCase();
      } catch {
        return res.status(400).json({ error: '유효하지 않은 Apple 인증 토큰입니다.' });
      }
    }

    if (!resolvedSub) {
      resolvedSub = `apple_${crypto
        .createHash('sha256')
        .update(resolvedEmail || 'apple-private-relay-user')
        .digest('hex')
        .slice(0, 14)}`;
    }
    if (!resolvedEmail) {
      resolvedEmail = `${resolvedSub.slice(0, 12)}@privaterelay.appleid.com`;
    }

    let user = db
      .prepare('SELECT * FROM users WHERE apple_sub = ? OR lower(email) = ?')
      .get(resolvedSub, resolvedEmail);

    if (!user) {
      const shortHash = crypto.createHash('sha1').update(resolvedSub).digest('hex').slice(0, 8);
      const username = `apple_${shortHash}`;
      const displayName = String(full_name || fullName || '').trim() || 'Apple 사용자';
      const closetKey = `closet_${username}`;
      const nowIso = new Date().toISOString();
      const vHash = computeVerificationHash(username, resolvedEmail, nowIso);

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
      user = db.prepare('SELECT * FROM users WHERE apple_sub = ?').get(resolvedSub);
    }

    const token = issueUserSession(res, user);
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
    res.setHeader('Set-Cookie', 'ainventory_token=; Path=/; HttpOnly; Max-Age=0');
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
    if (userRow.username === 'admin' || userRow.username === 'wife') {
      return res.status(400).json({ error: '기본 시스템 데모 계정은 삭제할 수 없습니다.' });
    }

    const closetKey = userRow.default_closet;
    const isDedicatedCloset = closetKey && closetKey !== 'husband' && closetKey !== 'wife';

    if (isDedicatedCloset) {
      // 1. Delete physical uploaded photos on disk
      const userGarments = db
        .prepare('SELECT image_url FROM garments WHERE closet_owner = ?')
        .all(closetKey);
      const userChecks = db
        .prepare('SELECT image_url FROM shopping_checks WHERE closet_owner = ?')
        .all(closetKey);
      for (const g of userGarments) unlinkUploadIfOwned(g.image_url);
      for (const c of userChecks) unlinkUploadIfOwned(c.image_url);

      // 2. Purge all wardrobe, outfit, OOTD calendar, shopping, and trip packing records
      db.prepare('DELETE FROM garments WHERE closet_owner = ?').run(closetKey);
      db.prepare('DELETE FROM outfits WHERE closet_owner = ?').run(closetKey);
      db.prepare('DELETE FROM wear_logs WHERE closet_owner = ?').run(closetKey);
      db.prepare('DELETE FROM shopping_checks WHERE closet_owner = ?').run(closetKey);
      db.prepare('DELETE FROM packing_lists WHERE closet_owner = ?').run(closetKey);
    }

    // 3. Remove verification outbox file if present
    try {
      const outboxFile = path.join(OUTBOX_DIR, `${userRow.username}-verify.html`);
      if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
    } catch {
      // ignore
    }

    // 4. Purge sessions and user row (including personal color / facial analysis metadata)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.setHeader('Set-Cookie', 'ainventory_token=; Path=/; HttpOnly; Max-Age=0');
    res.json({
      ok: true,
      purged: true,
      deletedCloset: isDedicatedCloset ? closetKey : null,
      timestamp: new Date().toISOString(),
    });
  });

  // 5. First-login closet name setup (Requirement 8.a: keeps real user closet EMPTY unless starter explicitly imported!)
  router.post('/auth/closet-setup', requireStrictUserAuth, (req, res) => {
    const closetName = String(req.body?.closet_name || req.body?.closetName || '').trim();
    const importStarter = Boolean(req.body?.import_starter);
    if (!closetName) {
      return res.status(400).json({ error: '옷장 이름을 입력해주세요.' });
    }
    db.prepare('UPDATE users SET closet_name = ? WHERE id = ?').run(closetName, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (importStarter) {
      generateStatisticalWardrobeForUser(db, updated.default_closet, updated);
    }

    res.json({
      ok: true,
      user: formatUserPayload(updated),
    });
  });

  // 6. Styling Basic Info + Body Shapes + Personal Color setup (keeps real user closet empty unless regenerate requested)
  router.post('/auth/profile-setup', requireStrictUserAuth, (req, res) => {
    const body = req.body || {};

    const parseOptNum = (v, min, max) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (Number.isNaN(n) || n <= 0) return null;
      return Number(Math.max(min, Math.min(max, n)).toFixed(1));
    };

    const age = parseOptNum(body.age, 1, 110);
    const ageGroup = body.age_group || body.ageGroup
      ? normalizeAgeGroupKey(body.age_group || body.ageGroup, age)
      : age
        ? normalizeAgeGroupKey(null, age)
        : 'unspecified';

    const heightCm = parseOptNum(body.height_cm ?? body.heightCm, 120, 220);
    const weightKg = parseOptNum(body.weight_kg ?? body.weightKg, 30, 180);
    const gender = String(body.gender || 'unspecified').trim();
    const personalColor = String(body.personal_color || body.personalColor || 'autumn_warm').trim();
    const skinToneHex = String(body.skin_tone_hex || body.skinToneHex || '#E2C6AE').trim();
    const skinUndertoneLab = body.skin_undertone_lab || body.skinUndertoneLab
      ? JSON.stringify(body.skin_undertone_lab || body.skinUndertoneLab)
      : null;

    const rawBodyShape = body.body_shape ?? body.bodyShape;
    const bodyShape = normalizeBodyShapeKey(rawBodyShape);
    const bodyFatPct = parseOptNum(body.body_fat_pct ?? body.bodyFatPct, 4, 55);
    const chestCm = parseOptNum(body.chest_cm ?? body.chestCm, 60, 150);
    const waistCm = parseOptNum(body.waist_cm ?? body.waistCm, 48, 145);
    const hipCm = parseOptNum(body.hip_cm ?? body.hipCm, 65, 150);
    const headCm = parseOptNum(body.head_cm ?? body.headCm, 48, 66);

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

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const closetKey = updated.default_closet;

    let generatedWardrobe = null;
    if (body.regenerate_wardrobe) {
      db.prepare('DELETE FROM garments WHERE closet_owner = ?').run(closetKey);
      generatedWardrobe = generateStatisticalWardrobeForUser(db, closetKey, updated);
    }

    res.json({
      ok: true,
      user: formatUserPayload(updated),
      generatedWardrobe,
    });
  });

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

  // Selective Sample Import into Real User's Closet (Requirement 8.a)
  router.post('/garments/import-samples', requireStrictUserAuth, (req, res) => {
    const closetOwner = req.user.defaultCloset;
    const requestedKeys = Array.isArray(req.body?.sample_keys) ? req.body.sample_keys : [];
    const selected =
      requestedKeys.length > 0
        ? SAMPLE_CAPSULE_CATALOG.filter((s) => requestedKeys.includes(s.key))
        : SAMPLE_CAPSULE_CATALOG;

    const insertStmt = db.prepare(`
      INSERT INTO garments (
        closet_owner, name, category, subcategory, color_name, color_hex,
        seasons, min_temp, max_temp, water_resistant, formality,
        brand, price, wear_count, status, image_url, notes,
        fabric, slot_key, base_glb, physics_preset, custom_texture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, '샘플 캡슐에서 가져온 아이템', ?, ?, ?, ?, 0)
    `);

    const imported = [];
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
      if (row) imported.push(parseGarmentRow(row));
    }

    res.status(201).json({ ok: true, count: imported.length, garments: imported });
  });

  // AI Garment Manifest Resolver Endpoint (Requirement 6.b)
  router.post('/garments/analyze', requireStrictUserAuth, (req, res) => {
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
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const { category = 'all', q = '' } = req.query;
    let sql = 'SELECT * FROM garments WHERE 1=1';
    const params = [];

    if (closet && closet !== 'all') {
      sql += " AND (closet_owner = ? OR closet_owner = 'shared')";
      params.push(closet);
    }
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (q && String(q).trim()) {
      sql += ' AND (name LIKE ? OR brand LIKE ? OR color_name LIKE ? OR notes LIKE ?)';
      const like = `%${String(q).trim()}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY is_favorite DESC, id DESC';

    const rows = db.prepare(sql).all(...params).map(parseGarmentRow);
    res.json({ garments: rows, isSampleDemo: Boolean(req.isSampleDemo) });
  });

  router.post('/garments', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      name,
      category = 'top',
      subcategory = 'knit',
      color_name = '블랙',
      color_hex = '#1D1D1F',
      seasons = ['봄', '가을'],
      min_temp = 8,
      max_temp = 20,
      water_resistant = false,
      formality = 'smart',
      brand = '',
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
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '옷 이름을 입력해주세요.' });
    }

    const fallbackSeed = getStudioSeedImageForGarment(category, subcategory);
    const savedUrl = saveDataUrlImage(image_data || image_url, fallbackSeed);
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    const isCustomTex =
      custom_texture !== undefined
        ? Boolean(custom_texture)
        : savedUrl.startsWith('/uploads/');

    const result = db.prepare(`
      INSERT INTO garments (
        closet_owner, name, category, subcategory, color_name, color_hex,
        seasons, min_temp, max_temp, water_resistant, formality,
        brand, price, wear_count, status, image_url, notes,
        fabric, slot_key, base_glb, physics_preset, custom_texture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      closet_owner,
      String(name).trim(),
      category,
      subcategory,
      color_name,
      color_hex,
      JSON.stringify(Array.isArray(seasons) ? seasons : ['봄', '가을']),
      Number(min_temp) || 8,
      Number(max_temp) || 20,
      water_resistant ? 1 : 0,
      formality,
      String(brand || '').trim(),
      Math.max(0, Number(price) || 0),
      Math.max(0, Number(wear_count) || 0),
      status,
      savedUrl,
      String(notes || '').trim(),
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

    const body = req.body || {};
    const nextStatus = body.status ?? existing.status;
    const nextFav = body.is_favorite !== undefined ? (body.is_favorite ? 1 : 0) : existing.is_favorite;
    const nextName = body.name !== undefined ? String(body.name).trim() : existing.name;
    const nextPrice = body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price;
    const nextBrand = body.brand !== undefined ? String(body.brand).trim() : existing.brand;
    const nextNotes = body.notes !== undefined ? String(body.notes).trim() : existing.notes;
    const nextWearCount = body.wear_count !== undefined ? Math.max(0, Number(body.wear_count) || 0) : existing.wear_count;

    db.prepare(`
      UPDATE garments
      SET name = ?, status = ?, is_favorite = ?, price = ?, brand = ?, notes = ?, wear_count = ?
      WHERE id = ?
    `).run(nextName, nextStatus, nextFav, nextPrice, nextBrand, nextNotes, nextWearCount, id);

    const updated = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    res.json({ garment: parseGarmentRow(updated) });
  });

  router.post('/garments/:id/wear', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });

    const todayStr = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE garments
      SET wear_count = wear_count + 1, last_worn_date = ?
      WHERE id = ?
    `).run(todayStr, id);

    const updated = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    res.json({ garment: parseGarmentRow(updated) });
  });

  router.delete('/garments/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM garments WHERE id = ?').get(id);
    if (existing) {
      unlinkUploadIfOwned(existing.image_url);
      db.prepare('DELETE FROM garments WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  });

  // Offline Shopping Assistant
  router.post('/shopping/analyze', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      candidate_name = '매장 촬영 새 옷',
      category = 'top',
      subcategory = 'knit',
      color_name = '네이비',
      color_hex = '#1E273B',
      price = 0,
      image_data,
      image_url,
      save_history = true,
    } = req.body || {};

    const savedUrl = saveDataUrlImage(image_data || image_url, '/seed/store-navy-sweater.jpg');
    const closetItems = db
      .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
      .all(closet_owner)
      .map(parseGarmentRow);

    const partnerClosetKey = closet_owner === 'husband' ? 'wife' : 'husband';
    const partnerItems = db
      .prepare('SELECT * FROM garments WHERE closet_owner = ?')
      .all(partnerClosetKey)
      .map(parseGarmentRow);

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
    if (save_history) {
      const insert = db.prepare(`
        INSERT INTO shopping_checks (
          closet_owner, image_url, candidate_name, category, subcategory,
          color_name, color_hex, price, verdict, similar_count, max_similarity, decision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'undecided')
      `).run(
        closet_owner,
        savedUrl,
        candidate_name,
        category,
        subcategory,
        color_name,
        color_hex,
        Math.max(0, Number(price) || 0),
        analysis.verdict,
        analysis.similarCount,
        analysis.maxSimilarity
      );
      checkId = insert.lastInsertRowid;
    }

    res.json({
      checkId,
      candidate: {
        closet_owner,
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
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const rows = closet === 'all'
      ? db.prepare('SELECT * FROM shopping_checks ORDER BY id DESC LIMIT 20').all()
      : db.prepare('SELECT * FROM shopping_checks WHERE closet_owner = ? ORDER BY id DESC LIMIT 20').all(closet);
    res.json({ history: rows });
  });

  router.post('/shopping/decision', requireStrictUserAuth, (req, res) => {
    const { checkId, decision, addToCloset = false, brand = '' } = req.body || {};
    const check = db.prepare('SELECT * FROM shopping_checks WHERE id = ?').get(Number(checkId));
    if (!check) return res.status(404).json({ error: '판독 기록을 찾을 수 없습니다.' });

    db.prepare('UPDATE shopping_checks SET decision = ? WHERE id = ?').run(decision, check.id);

    let createdGarment = null;
    if (addToCloset) {
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
        brand,
        check.price,
        closetImageUrl,
        spec.slotKey,
        spec.baseGlb,
        spec.physicsPreset,
        closetImageUrl.startsWith('/uploads/') ? 1 : 0
      );
      createdGarment = parseGarmentRow(
        db.prepare('SELECT * FROM garments WHERE id = ?').get(insert.lastInsertRowid)
      );
    }

    res.json({ ok: true, createdGarment });
  });

  // Weather & AI Styling Recommendations (Requirement 7.b & 8.a)
  router.get('/weather/recommendations', async (req, res) => {
    const {
      closet = req.user.defaultCloset || 'husband',
      city = 'seoul',
      scenario = 'live',
      lat,
      lon,
      location_label,
    } = req.query;
    const resolvedCloset = resolveClosetAlias(closet, req.user.defaultCloset || 'husband');
    const closetOwner = resolvedCloset === 'all' ? (req.user.defaultCloset || 'husband') : resolvedCloset;

    const garments = db
      .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
      .all(closetOwner)
      .map(parseGarmentRow);

    const ownerUser =
      db.prepare('SELECT * FROM users WHERE default_closet = ?').get(closetOwner) || req.userRow;

    const customCoords =
      lat !== undefined && lon !== undefined
        ? { lat: Number(lat), lon: Number(lon), label: location_label || '현재 위치' }
        : null;

    const weather = await fetchTomorrowWeather(String(city), String(scenario), customCoords);

    // Requirement 8.a: If a real user's personal closet is empty, do NOT silently inject 20 seed items!
    if (garments.length === 0) {
      const emptyResult = buildWeatherRecommendations(weather, [], [], ownerUser);
      return res.json({
        ...emptyResult,
        isClosetEmpty: true,
        isSampleDemo: Boolean(req.isSampleDemo),
        recommendations: [],
      });
    }

    const recentLogs = db
      .prepare("SELECT * FROM wear_logs WHERE closet_owner = ? AND status = 'worn' ORDER BY worn_date DESC LIMIT 3")
      .all(closetOwner);

    const result = buildWeatherRecommendations(weather, garments, recentLogs, ownerUser);
    res.json({
      ...result,
      isClosetEmpty: false,
      isSampleDemo: Boolean(req.isSampleDemo),
    });
  });

  // Outfits
  router.get('/outfits', (req, res) => {
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const rows = closet === 'all'
      ? db.prepare('SELECT * FROM outfits ORDER BY id DESC').all()
      : db.prepare('SELECT * FROM outfits WHERE closet_owner = ? ORDER BY id DESC').all(closet);

    const allGarments = new Map(
      db.prepare('SELECT * FROM garments').all().map((g) => [g.id, parseGarmentRow(g)])
    );

    const outfits = rows.map((o) => {
      let ids = [];
      try {
        ids = JSON.parse(o.item_ids || '[]');
      } catch {
        ids = [];
      }
      return {
        ...o,
        item_ids: ids,
        items: ids.map((id) => allGarments.get(id)).filter(Boolean),
      };
    });

    res.json({ outfits });
  });

  router.post('/outfits', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      title,
      occasion = '데일리',
      season = '봄/가을',
      item_ids = [],
      memo = '',
    } = req.body || {};

    if (!title || !Array.isArray(item_ids) || item_ids.length < 1) {
      return res.status(400).json({ error: '코디 이름과 의류를 선택해주세요.' });
    }

    const result = db.prepare(`
      INSERT INTO outfits (closet_owner, title, occasion, season, item_ids, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      closet_owner,
      String(title).trim(),
      occasion,
      season,
      JSON.stringify(item_ids.map(Number)),
      String(memo || '').trim()
    );

    res.status(201).json({ id: result.lastInsertRowid });
  });

  router.delete('/outfits/:id', requireStrictUserAuth, (req, res) => {
    db.prepare('DELETE FROM outfits WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Calendar / OOTD Wear Logs + Future Outfit Reservations (Requirement 7.a)
  router.get('/calendar', (req, res) => {
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const rows = closet === 'all'
      ? db.prepare('SELECT * FROM wear_logs ORDER BY worn_date DESC, id DESC LIMIT 120').all()
      : db.prepare('SELECT * FROM wear_logs WHERE closet_owner = ? ORDER BY worn_date DESC, id DESC LIMIT 120').all(closet);

    const allGarments = new Map(
      db.prepare('SELECT * FROM garments').all().map((g) => [g.id, parseGarmentRow(g)])
    );

    const logs = rows.map((log) => {
      let ids = [];
      try {
        ids = JSON.parse(log.item_ids || '[]');
      } catch {
        ids = [];
      }
      return {
        ...log,
        status: log.status || 'worn',
        item_ids: ids,
        items: ids.map((id) => allGarments.get(id)).filter(Boolean),
      };
    });

    res.json({ logs });
  });

  router.get('/calendar/ics', (req, res) => {
    const rawCloset = req.query.closet || req.query.owner || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const rows =
      closet === 'all'
        ? db.prepare('SELECT * FROM wear_logs ORDER BY worn_date DESC LIMIT 90').all()
        : db.prepare('SELECT * FROM wear_logs WHERE closet_owner = ? ORDER BY worn_date DESC LIMIT 90').all(closet);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//A inventory//OOTD Calendar//KO',
      'CALSCALE:GREGORIAN',
    ];
    for (const r of rows) {
      const dt = String(r.worn_date || '').replace(/-/g, '');
      if (dt.length !== 8) continue;
      const summary = r.status === 'planned' ? `[예약 코디] ${r.note || 'OOTD'}` : `[OOTD] ${r.note || '착용 기록'}`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:ainventory-ootd-${r.id}@ainventory.app`);
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      lines.push(`SUMMARY:${summary.replace(/\r?\n/g, ' ')}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(lines.join('\r\n'));
  });

  router.post('/calendar', requireStrictUserAuth, (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const {
      closet_owner = req.body?.owner || req.user.defaultCloset || 'husband',
      worn_date = todayStr,
      outfit_id = null,
      item_ids = [],
      weather_summary = '',
      temp_c = null,
      note = '',
      status,
    } = req.body || {};

    let resolvedIds = Array.isArray(item_ids) ? item_ids.map(Number).filter(Boolean) : [];
    if (resolvedIds.length === 0 && outfit_id) {
      const outfitRow = db.prepare('SELECT item_ids FROM outfits WHERE id = ?').get(Number(outfit_id));
      if (outfitRow?.item_ids) {
        try {
          resolvedIds = JSON.parse(outfitRow.item_ids).map(Number).filter(Boolean);
        } catch {
          resolvedIds = [];
        }
      }
    }
    if (resolvedIds.length === 0) {
      resolvedIds = db
        .prepare('SELECT id FROM garments WHERE closet_owner = ? LIMIT 3')
        .all(closet_owner)
        .map((r) => Number(r.id));
    }

    const resolvedStatus = status || (worn_date > todayStr ? 'planned' : 'worn');
    const cleanIds = resolvedIds;
    const insert = db.prepare(`
      INSERT INTO wear_logs (closet_owner, worn_date, outfit_id, item_ids, weather_summary, temp_c, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      closet_owner,
      worn_date,
      outfit_id ? Number(outfit_id) : null,
      JSON.stringify(cleanIds),
      weather_summary,
      temp_c !== null ? Number(temp_c) : null,
      String(note || '').trim(),
      resolvedStatus
    );

    if (resolvedStatus === 'worn') {
      const updateGarment = db.prepare(`
        UPDATE garments
        SET wear_count = wear_count + 1,
            last_worn_date = CASE
              WHEN last_worn_date IS NULL OR last_worn_date < ? THEN ?
              ELSE last_worn_date
            END
        WHERE id = ?
      `);
      for (const gid of cleanIds) {
        updateGarment.run(worn_date, worn_date, gid);
      }

      if (outfit_id) {
        db.prepare(`
          UPDATE outfits SET wear_count = wear_count + 1, last_worn_date = ? WHERE id = ?
        `).run(worn_date, Number(outfit_id));
      }
    }

    res.status(201).json({ ok: true, id: insert.lastInsertRowid, status: resolvedStatus });
  });

  router.patch('/calendar/:id', requireStrictUserAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM wear_logs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '일정 기록을 찾을 수 없습니다.' });

    const nextStatus = req.body?.status || 'worn';
    if (existing.status === 'planned' && nextStatus === 'worn') {
      let ids = [];
      try {
        ids = JSON.parse(existing.item_ids || '[]');
      } catch {
        ids = [];
      }
      const updateGarment = db.prepare(
        'UPDATE garments SET wear_count = wear_count + 1, last_worn_date = ? WHERE id = ?'
      );
      for (const gid of ids) updateGarment.run(existing.worn_date, Number(gid));
    }
    db.prepare('UPDATE wear_logs SET status = ? WHERE id = ?').run(nextStatus, id);
    res.json({ ok: true, status: nextStatus });
  });

  router.delete('/calendar/:id', requireStrictUserAuth, (req, res) => {
    db.prepare('DELETE FROM wear_logs WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Trip Packing Lists CRUD (Requirement 7.a)
  router.get('/packing-lists', (req, res) => {
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const rows = db
      .prepare('SELECT * FROM packing_lists WHERE closet_owner = ? ORDER BY id DESC LIMIT 30')
      .all(closet);

    const lists = rows.map((r) => {
      let items = [];
      try {
        items = JSON.parse(r.items_json || '[]');
      } catch {
        items = [];
      }
      return { ...r, items };
    });
    res.json({ lists });
  });

  router.post('/packing-lists', requireStrictUserAuth, (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      title = '',
      destination = '도쿄',
      start_date = new Date().toISOString().slice(0, 10),
      end_date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      climate = 'mild',
      items,
    } = req.body || {};

    let finalItems = Array.isArray(items) ? items : null;
    if (!finalItems) {
      const garments = db
        .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
        .all(closet_owner)
        .map(parseGarmentRow);
      finalItems = buildTripPackingList({
        destination,
        startDate: start_date,
        endDate: end_date,
        climate,
        garments,
      }).items;
    }

    const cleanTitle = String(title || `${destination} 패킹 리스트`).trim();
    const r = db.prepare(`
      INSERT INTO packing_lists (closet_owner, title, destination, start_date, end_date, climate, items_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      closet_owner,
      cleanTitle,
      String(destination).trim(),
      start_date,
      end_date,
      climate,
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

    let items = [];
    try {
      items = JSON.parse(existing.items_json || '[]');
    } catch {
      items = [];
    }

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
    db.prepare('DELETE FROM packing_lists WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Wardrobe Insights & CPW Dashboard (Requirement 7.c & 12.d)
  router.get('/analytics', (req, res) => {
    const rawCloset = req.query.closet || req.user.defaultCloset || 'husband';
    const closet = resolveClosetAlias(rawCloset, req.user.defaultCloset || 'husband');
    const garments = (
      closet === 'all'
        ? db.prepare('SELECT * FROM garments').all()
        : db.prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'").all(closet)
    ).map(parseGarmentRow);

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

    const passedChecks = closet === 'all'
      ? db.prepare("SELECT * FROM shopping_checks WHERE decision = 'passed'").all()
      : db.prepare("SELECT * FROM shopping_checks WHERE closet_owner = ? AND decision = 'passed'").all(closet);
    const savedMoney = passedChecks.reduce((acc, c) => acc + (c.price || 0), 0);

    res.json({
      totalItems,
      totalValue,
      totalWears,
      avgCpw,
      utilizationRate: totalItems > 0
        ? Math.round((garments.filter((g) => g.wear_count >= 3).length / totalItems) * 100)
        : 0,
      cpwRanking: cpwRanking.slice(0, 20),
      bestValueItems,
      sleepingItems,
      categoryDist,
      sortedCategories,
      colorDist: sortedColors,
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
      husbandGarments: db.prepare("SELECT COUNT(*) as c FROM garments WHERE closet_owner = 'husband'").get().c,
      wifeGarments: db.prepare("SELECT COUNT(*) as c FROM garments WHERE closet_owner = 'wife'").get().c,
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

    res.json({
      users,
      counts,
      system: {
        nodeVersion: process.version,
        platform: `${os.platform()} (${os.arch()})`,
        hostname: os.hostname(),
        dbPath: DB_PATH,
        dbSizeKb: Math.round(dbSizeBytes / 1024),
        uptimeSec: Math.round(process.uptime()),
      },
    });
  });

  router.post('/admin/users', requireStrictUserAuth, requireAdmin, (req, res) => {
    const { username, password, display_name, role = 'member', default_closet = 'wife' } = req.body || {};
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: '아이디, 비밀번호, 이름을 모두 입력해주세요.' });
    }
    const cleanU = String(username).trim();
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
        hashPassword(String(password)),
        String(display_name).trim(),
        role === 'admin' ? 'admin' : 'member',
        default_closet,
        `${String(display_name).trim()}의 옷장`,
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
