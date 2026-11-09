import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, {
  DB_PATH,
  UPLOADS_DIR,
  computeVerificationHash,
  hashPassword,
  initDb,
  seedIfEmpty,
  verifyPassword,
} from './db.js';
import {
  analyzeShoppingCandidate,
  buildWeatherRecommendations,
  fetchTomorrowWeather,
} from './engine.js';
import {
  AGE_GROUPS,
  WEAR_SLOTS,
  computeBodyMetrics,
  generateStatisticalWardrobeForUser,
  getStudioSeedImageForGarment,
  normalizeAgeGroupKey,
} from './wardrobeStatsAndGenerator.js';

initDb();

function saveDataUrlImage(dataUrl, fallbackUrl = '/seed/cream-knit.jpg') {
  if (!dataUrl || typeof dataUrl !== 'string') return fallbackUrl;
  if (dataUrl.startsWith('/seed/') || dataUrl.startsWith('/uploads/')) {
    return dataUrl;
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return fallbackUrl;
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
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
  return {
    ...row,
    image_url: imageUrl,
    seasons,
    water_resistant: Boolean(row.water_resistant),
    is_favorite: Boolean(row.is_favorite),
    cpw,
  };
}

export function formatUserPayload(u) {
  if (!u) return null;
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
    bodyShape: u.body_shape || null,
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

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }

  req.userRow = session;
  req.user = formatUserPayload(session);
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
  }
  next();
}

export function createApiRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '15mb' }));

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'A inventory API', timestamp: new Date().toISOString() });
  });

  // 1. Email-verified registration (creates closet_<username>, issues verify_token link)
  router.post('/auth/register', (req, res) => {
    const {
      username = '',
      email = '',
      password = '',
      display_name = '',
    } = req.body || {};

    const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(display_name || cleanUsername).trim();

    if (!cleanUsername || cleanUsername.length < 2) {
      return res.status(400).json({ error: '아이디는 영문/숫자 2자 이상으로 입력해주세요.' });
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상 입력해주세요.' });
    }

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (exists) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const closetKey = `closet_${cleanUsername}`;
    const verifyToken = crypto.randomBytes(24).toString('hex');

    db.prepare(`
      INSERT INTO users (
        username, email, password_hash, display_name, role, default_closet,
        closet_name, verification_token, verified_at, verification_hash, profile_completed
      ) VALUES (?, ?, ?, ?, 'member', ?, NULL, ?, NULL, NULL, 0)
    `).run(
      cleanUsername,
      cleanEmail,
      hashPassword(String(password)),
      cleanDisplayName,
      closetKey,
      verifyToken
    );

    const verifyUrl = `/?verify_token=${verifyToken}`;
    res.status(201).json({
      ok: true,
      username: cleanUsername,
      email: cleanEmail,
      defaultCloset: closetKey,
      verificationToken: verifyToken,
      verifyUrl,
      message: '회원가입이 접수되었습니다. 발급된 이메일 인증 링크를 통해 인증을 완료해주세요.',
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
    res.json({
      ok: true,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      alreadyVerified: Boolean(user.verified_at && user.verification_hash),
      verifiedAt: user.verified_at,
      verificationHash: user.verification_hash,
    });
  });

  // 3. Complete email verification (saves verified_at + SHA-256 verification_hash)
  router.post('/auth/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: '인증 토큰이 필요합니다.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
    if (!user) {
      return res.status(404).json({ error: '유효하지 않은 인증 토큰입니다.' });
    }

    const verifiedAt = user.verified_at || new Date().toISOString();
    const verificationHash =
      user.verification_hash || computeVerificationHash(user.username, user.email, verifiedAt);

    db.prepare(`
      UPDATE users
      SET verified_at = ?, verification_hash = ?
      WHERE id = ?
    `).run(verifiedAt, verificationHash, user.id);

    res.json({
      ok: true,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      verifiedAt,
      verificationHash,
    });
  });

  // 4. Login (requires verified_at and verification_hash)
  router.post('/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (!user.verified_at || !user.verification_hash) {
      return res.status(403).json({
        error: '이메일 인증이 완료되지 않은 계정입니다. 먼저 이메일 인증을 완료해주세요.',
        code: 'EMAIL_NOT_VERIFIED',
        verificationToken: user.verification_token,
        verifyUrl: user.verification_token ? `/?verify_token=${user.verification_token}` : null,
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      token,
      user.id,
      expires
    );

    res.setHeader(
      'Set-Cookie',
      `ainventory_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
    );

    res.json({
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

  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  // Protected routes below
  router.use(requireAuth);

  // 5. First-login closet name setup
  router.post('/auth/closet-setup', (req, res) => {
    const closetName = String(req.body?.closet_name || req.body?.closetName || '').trim();
    if (!closetName) {
      return res.status(400).json({ error: '옷장 이름을 입력해주세요.' });
    }
    db.prepare('UPDATE users SET closet_name = ? WHERE id = ?').run(closetName, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    // Ensure user has initial statistical wardrobe if their closet is currently empty
    const itemCount = db
      .prepare('SELECT COUNT(*) as c FROM garments WHERE closet_owner = ?')
      .get(updated.default_closet).c;
    if (itemCount === 0) {
      generateStatisticalWardrobeForUser(db, updated.default_closet, updated);
    }

    res.json({
      ok: true,
      user: formatUserPayload(updated),
    });
  });

  // 6. Styling Basic Info + 7 Body Shapes + 3-Sizes/Head/Body-Fat + Personal Color setup
  router.post('/auth/profile-setup', (req, res) => {
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

    // 6 Anthropometric fields (null / '' resets to default NULL so resolvedBody uses defaults)
    const rawBodyShape = body.body_shape ?? body.bodyShape;
    const bodyShape = rawBodyShape && String(rawBodyShape).trim() ? String(rawBodyShape).trim() : null;
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

    const currentItems = db
      .prepare('SELECT COUNT(*) as c FROM garments WHERE closet_owner = ?')
      .get(closetKey).c;

    let generatedWardrobe = null;
    if (body.regenerate_wardrobe || currentItems < 18) {
      if (body.regenerate_wardrobe) {
        db.prepare('DELETE FROM garments WHERE closet_owner = ?').run(closetKey);
      }
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

  // Garments CRUD
  router.get('/garments', (req, res) => {
    const { closet = req.user.defaultCloset || 'husband', category = 'all', q = '' } = req.query;
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
    res.json({ garments: rows });
  });

  router.post('/garments', (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      name,
      category = 'top',
      subcategory = 'knit',
      color_name = '블랙',
      color_hex = '#222222',
      seasons = ['봄', '가을'],
      min_temp = 8,
      max_temp = 20,
      water_resistant = false,
      formality = 'smart',
      brand = '',
      price = 0,
      wear_count = 0,
      status = 'active',
      image_data,
      image_url,
      notes = '',
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '옷 이름을 입력해주세요.' });
    }

    const fallbackSeed = getStudioSeedImageForGarment(category, subcategory);
    const savedUrl = saveDataUrlImage(image_data || image_url, fallbackSeed);
    const result = db.prepare(`
      INSERT INTO garments (
        closet_owner, name, category, subcategory, color_name, color_hex,
        seasons, min_temp, max_temp, water_resistant, formality,
        brand, price, wear_count, status, image_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      String(notes || '').trim()
    );

    const created = db.prepare('SELECT * FROM garments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ garment: parseGarmentRow(created) });
  });

  router.patch('/garments/:id', (req, res) => {
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

  router.post('/garments/:id/wear', (req, res) => {
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

  router.delete('/garments/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM garments WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Offline Shopping Assistant ("Should I buy this?")
  router.post('/shopping/analyze', (req, res) => {
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
    const { closet = req.user.defaultCloset || 'husband' } = req.query;
    const rows = closet === 'all'
      ? db.prepare('SELECT * FROM shopping_checks ORDER BY id DESC LIMIT 20').all()
      : db.prepare('SELECT * FROM shopping_checks WHERE closet_owner = ? ORDER BY id DESC LIMIT 20').all(closet);
    res.json({ history: rows });
  });

  router.post('/shopping/decision', (req, res) => {
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

      const insert = db.prepare(`
        INSERT INTO garments (
          closet_owner, name, category, subcategory, color_name, color_hex,
          seasons, min_temp, max_temp, water_resistant, formality,
          brand, price, wear_count, status, image_url, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'smart', ?, ?, 0, 'active', ?, '오프라인 쇼핑 판독 후 구매 등록')
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
        closetImageUrl
      );
      createdGarment = parseGarmentRow(
        db.prepare('SELECT * FROM garments WHERE id = ?').get(insert.lastInsertRowid)
      );
    }

    res.json({ ok: true, createdGarment });
  });

  // Tomorrow's Weather & Styling Recommendations (with Personal Color + 7 Body Shapes + 11 Wear Slots)
  router.get('/weather/recommendations', async (req, res) => {
    const { closet = req.user.defaultCloset || 'husband', city = 'seoul', scenario = 'live' } = req.query;
    const closetOwner = closet === 'all' ? (req.user.defaultCloset || 'husband') : String(closet);

    let garments = db
      .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
      .all(closetOwner)
      .map(parseGarmentRow);

    const ownerUser =
      db.prepare('SELECT * FROM users WHERE default_closet = ?').get(closetOwner) || req.userRow;

    if (garments.length === 0 && ownerUser) {
      generateStatisticalWardrobeForUser(db, closetOwner, ownerUser);
      garments = db
        .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
        .all(closetOwner)
        .map(parseGarmentRow);
    }

    const recentLogs = db
      .prepare('SELECT * FROM wear_logs WHERE closet_owner = ? ORDER BY worn_date DESC LIMIT 3')
      .all(closetOwner);

    const weather = await fetchTomorrowWeather(String(city), String(scenario));
    const result = buildWeatherRecommendations(weather, garments, recentLogs, ownerUser);
    res.json(result);
  });

  // Outfits & Whering-style "Dress Me" Shuffle
  router.get('/outfits', (req, res) => {
    const { closet = req.user.defaultCloset || 'husband' } = req.query;
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

  router.post('/outfits', (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      title,
      occasion = '데일리',
      season = '봄/가을',
      item_ids = [],
      memo = '',
    } = req.body || {};

    if (!title || !Array.isArray(item_ids) || item_ids.length < 2) {
      return res.status(400).json({ error: '코디 이름과 최소 2벌 이상의 옷을 선택해주세요.' });
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

  router.delete('/outfits/:id', (req, res) => {
    db.prepare('DELETE FROM outfits WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Calendar / OOTD Wear Logs
  router.get('/calendar', (req, res) => {
    const { closet = req.user.defaultCloset || 'husband' } = req.query;
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
        item_ids: ids,
        items: ids.map((id) => allGarments.get(id)).filter(Boolean),
      };
    });

    res.json({ logs });
  });

  router.post('/calendar', (req, res) => {
    const {
      closet_owner = req.user.defaultCloset || 'husband',
      worn_date = new Date().toISOString().slice(0, 10),
      outfit_id = null,
      item_ids = [],
      weather_summary = '',
      temp_c = null,
      note = '',
    } = req.body || {};

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: '착용한 아이템을 선택해주세요.' });
    }

    const cleanIds = item_ids.map(Number);
    db.prepare(`
      INSERT INTO wear_logs (closet_owner, worn_date, outfit_id, item_ids, weather_summary, temp_c, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      closet_owner,
      worn_date,
      outfit_id ? Number(outfit_id) : null,
      JSON.stringify(cleanIds),
      weather_summary,
      temp_c !== null ? Number(temp_c) : null,
      String(note || '').trim()
    );

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

    res.status(201).json({ ok: true });
  });

  router.delete('/calendar/:id', (req, res) => {
    db.prepare('DELETE FROM wear_logs WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Analytics
  router.get('/analytics', (req, res) => {
    const { closet = req.user.defaultCloset || 'husband' } = req.query;
    const garments = (
      closet === 'all'
        ? db.prepare('SELECT * FROM garments').all()
        : db.prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'").all(closet)
    ).map(parseGarmentRow);

    const totalItems = garments.length;
    const totalValue = garments.reduce((acc, g) => acc + (g.price || 0), 0);
    const totalWears = garments.reduce((acc, g) => acc + (g.wear_count || 0), 0);
    const avgCpw = totalWears > 0 ? Math.round(totalValue / totalWears) : 0;

    const bestValueItems = [...garments]
      .filter((g) => g.wear_count > 0 && g.price > 0)
      .sort((a, b) => a.cpw - b.cpw)
      .slice(0, 4);

    const sleepingItems = [...garments]
      .filter((g) => g.wear_count <= 2)
      .sort((a, b) => a.wear_count - b.wear_count)
      .slice(0, 8);

    const categoryDist = {};
    const colorDist = {};
    for (const g of garments) {
      categoryDist[g.category] = (categoryDist[g.category] || 0) + 1;
      if (!colorDist[g.color_name]) {
        colorDist[g.color_name] = { count: 0, hex: g.color_hex };
      }
      colorDist[g.color_name].count += 1;
    }

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
      bestValueItems,
      sleepingItems,
      categoryDist,
      colorDist: Object.entries(colorDist)
        .map(([name, info]) => ({ name, count: info.count, hex: info.hex }))
        .sort((a, b) => b.count - a.count),
      savedMoney,
      passedCount: passedChecks.length,
    });
  });

  // Admin routes
  router.get('/admin/overview', requireAdmin, (_req, res) => {
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

  router.post('/admin/users', requireAdmin, (req, res) => {
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

  router.post('/admin/reset-demo', requireAdmin, (_req, res) => {
    seedIfEmpty(true);
    res.json({ ok: true });
  });

  return router;
}
