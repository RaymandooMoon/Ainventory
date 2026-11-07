import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, {
  DB_PATH,
  UPLOADS_DIR,
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

initDb();

function saveDataUrlImage(dataUrl, fallbackUrl = '/seed/navy-knit.jpg') {
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
  return {
    ...row,
    seasons,
    water_resistant: Boolean(row.water_resistant),
    is_favorite: Boolean(row.is_favorite),
    cpw,
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
    SELECT s.token, s.expires_at, u.id, u.username, u.display_name, u.role, u.default_closet
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }

  req.user = {
    id: session.id,
    username: session.username,
    displayName: session.display_name,
    role: session.role,
    defaultCloset: session.default_closet,
  };
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

  // Auth routes
  router.post('/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
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
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        defaultCloset: user.default_closet,
      },
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

  // Garments CRUD
  router.get('/garments', (req, res) => {
    const { closet = 'husband', category = 'all', q = '' } = req.query;
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
      closet_owner = 'husband',
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

    const savedUrl = saveDataUrlImage(image_data || image_url, '/seed/white-shirt.jpg');
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
      closet_owner = 'husband',
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
    const { closet = 'husband' } = req.query;
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
        check.image_url
      );
      createdGarment = parseGarmentRow(
        db.prepare('SELECT * FROM garments WHERE id = ?').get(insert.lastInsertRowid)
      );
    }

    res.json({ ok: true, createdGarment });
  });

  // Tomorrow's Weather & Styling Recommendations
  router.get('/weather/recommendations', async (req, res) => {
    const { closet = 'husband', city = 'seoul', scenario = 'live' } = req.query;
    const closetOwner = closet === 'all' ? 'husband' : String(closet);
    const garments = db
      .prepare("SELECT * FROM garments WHERE closet_owner = ? OR closet_owner = 'shared'")
      .all(closetOwner)
      .map(parseGarmentRow);

    const recentLogs = db
      .prepare('SELECT * FROM wear_logs WHERE closet_owner = ? ORDER BY worn_date DESC LIMIT 3')
      .all(closetOwner);

    const weather = await fetchTomorrowWeather(String(city), String(scenario));
    const result = buildWeatherRecommendations(weather, garments, recentLogs);
    res.json(result);
  });

  // Outfits & Whering-style "Dress Me" Shuffle
  router.get('/outfits', (req, res) => {
    const { closet = 'husband' } = req.query;
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
      closet_owner = 'husband',
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
    const { closet = 'husband' } = req.query;
    const rows = closet === 'all'
      ? db.prepare('SELECT * FROM wear_logs ORDER BY worn_date DESC, id DESC LIMIT 40').all()
      : db.prepare('SELECT * FROM wear_logs WHERE closet_owner = ? ORDER BY worn_date DESC, id DESC LIMIT 40').all(closet);

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
      closet_owner = 'husband',
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

  // Analytics (Acloset + GetWardrobe CPW + Whering Mindful Insights)
  router.get('/analytics', (req, res) => {
    const { closet = 'husband' } = req.query;
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
      .sort((a, b) => a.wear_count - b.wear_count);

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

  // Admin routes (for admin/admin + Mac mini M2 deployment status + tester accounts)
  router.get('/admin/overview', requireAdmin, (_req, res) => {
    const users = db
      .prepare('SELECT id, username, display_name, role, default_closet, created_at FROM users ORDER BY id ASC')
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
    try {
      db.prepare(`
        INSERT INTO users (username, password_hash, display_name, role, default_closet)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        String(username).trim(),
        hashPassword(String(password)),
        String(display_name).trim(),
        role === 'admin' ? 'admin' : 'member',
        default_closet
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
