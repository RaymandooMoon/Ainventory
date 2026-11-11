import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveManifestSlotAndGlb } from '../src/shared/garmentTaxonomy.js';
import {
  generateStatisticalWardrobeForUser,
  getStudioSeedImageForGarment,
  seedWardrobeBenchmarks,
} from './wardrobeStatsAndGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');
export const DB_PATH = path.join(DATA_DIR, 'ainventory.db');

const MAX_PASSWORD_LENGTH = 256;

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTBOX_DIR, { recursive: true });

async function createDatabase(dbPath) {
  if (!process.env.FORCE_SQLJS) {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const nativeDb = new DatabaseSync(dbPath);
      nativeDb.exec('PRAGMA journal_mode = WAL;');
      nativeDb.exec('PRAGMA foreign_keys = ON;');

      let txDepth = 0;
      nativeDb.transaction = (fn) => {
        if (typeof fn !== 'function') {
          throw new TypeError('db.transaction requires a callback function');
        }
        if (txDepth === 0) {
          nativeDb.exec('BEGIN IMMEDIATE;');
          txDepth += 1;
          try {
            const result = fn();
            txDepth -= 1;
            nativeDb.exec('COMMIT;');
            return result;
          } catch (err) {
            txDepth = Math.max(0, txDepth - 1);
            try {
              nativeDb.exec('ROLLBACK;');
            } catch {
              // ignore rollback error if already rolled back
            }
            throw err;
          }
        }

        const spName = `sp_${txDepth}`;
        nativeDb.exec(`SAVEPOINT ${spName};`);
        txDepth += 1;
        try {
          const result = fn();
          txDepth -= 1;
          nativeDb.exec(`RELEASE SAVEPOINT ${spName};`);
          return result;
        } catch (err) {
          txDepth -= 1;
          try {
            nativeDb.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
            nativeDb.exec(`RELEASE SAVEPOINT ${spName};`);
          } catch {
            // ignore savepoint cleanup error
          }
          throw err;
        }
      };

      return { db: nativeDb, driver: 'node:sqlite' };
    } catch {
      // Fall through to pure-WASM sql.js for environments without node:sqlite
    }
  }

  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const initialBuf = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
  const wasmDb = initialBuf ? new SQL.Database(initialBuf) : new SQL.Database();
  wasmDb.exec('PRAGMA foreign_keys = ON;');

  let txDepth = 0;
  const flushToDiskAtomically = () => {
    const buf = Buffer.from(wasmDb.export());
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, buf);
    fs.renameSync(tmpPath, dbPath);
  };

  const persist = () => {
    if (txDepth > 0) return;
    flushToDiskAtomically();
  };

  const wasmWrapper = {
    exec(sql) {
      wasmDb.exec(sql);
      persist();
    },
    prepare(sql) {
      return {
        get(...params) {
          const stmt = wasmDb.prepare(sql);
          try {
            stmt.bind(params);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = wasmDb.prepare(sql);
          const rows = [];
          try {
            stmt.bind(params);
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params) {
          wasmDb.run(sql, params);
          const lastId = wasmDb.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] ?? 0;
          persist();
          return { lastInsertRowid: Number(lastId) };
        },
      };
    },
    transaction(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('db.transaction requires a callback function');
      }
      if (txDepth === 0) {
        wasmDb.exec('BEGIN IMMEDIATE;');
        txDepth += 1;
        try {
          const result = fn();
          txDepth -= 1;
          wasmDb.exec('COMMIT;');
          flushToDiskAtomically();
          return result;
        } catch (err) {
          txDepth = Math.max(0, txDepth - 1);
          try {
            wasmDb.exec('ROLLBACK;');
          } catch {
            // ignore rollback error
          }
          throw err;
        }
      }

      const spName = `sp_${txDepth}`;
      wasmDb.exec(`SAVEPOINT ${spName};`);
      txDepth += 1;
      try {
        const result = fn();
        txDepth -= 1;
        wasmDb.exec(`RELEASE SAVEPOINT ${spName};`);
        return result;
      } catch (err) {
        txDepth -= 1;
        try {
          wasmDb.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
          wasmDb.exec(`RELEASE SAVEPOINT ${spName};`);
        } catch {
          // ignore savepoint cleanup error
        }
        throw err;
      }
    },
  };

  return { db: wasmWrapper, driver: 'sql.js' };
}

const { db, driver } = await createDatabase(DB_PATH);
export const SQLITE_DRIVER = driver;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const raw = typeof password === 'string' ? password : String(password ?? '');
  if (!raw || raw.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password must be between 1 and ${MAX_PASSWORD_LENGTH} characters`);
  }
  const hash = crypto.scryptSync(raw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) {
    return false;
  }
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  if (!salt || !originalHash || originalHash.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(originalHash)) {
    return false;
  }
  const bufA = crypto.scryptSync(password, salt, 64);
  const bufB = Buffer.from(originalHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function computeVerificationHash(username, email, verifiedAt) {
  return crypto
    .createHash('sha256')
    .update(`ainventory-verify:${username}:${email || ''}:${verifiedAt}`)
    .digest('hex');
}

function shouldSeedDemoAccounts(forceReset = false) {
  return (
    Boolean(forceReset) ||
    process.env.NODE_ENV !== 'production' ||
    process.env.SEED_DEMO_DATA === 'true'
  );
}

function ensureSampleClosetSeeded() {
  const sampleCount = db
    .prepare("SELECT COUNT(*) as cnt FROM garments WHERE closet_owner = 'sample'")
    .get().cnt;
  if (sampleCount >= 16) return;

  db.prepare("DELETE FROM garments WHERE closet_owner = 'sample'").run();

  const today = new Date();
  const fmtDate = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  const sampleItems = [
    ['발수 코튼 개버딘 트렌치코트', 'outer', 'trench', 'gabardine', '베이지', '#C4B193', ['봄', '가을'], 8, 19, 1, 'smart', 'Sample Atelier', 290000, 11, fmtDate(3), 1, '/seed/beige-trench.jpg'],
    ['더블 페이스 캐시미어 테일러드 코트', 'outer', 'coat', 'wool', '카멜', '#BA9163', ['가을', '겨울'], -5, 11, 0, 'formal', 'Sample Atelier', 420000, 7, fmtDate(8), 1, '/seed/studio-coat.jpg'],
    ['테일러드 버진 울 싱글 블레이저', 'outer', 'blazer', 'wool', '블랙', '#1E1F22', ['봄', '가을', '겨울'], 5, 19, 0, 'formal', 'Sample Atelier', 340000, 9, fmtDate(5), 0, '/seed/black-blazer.jpg'],
    ['파인 메리노 크루넥 니트', 'top', 'knit', 'knit', '네이비', '#1D273B', ['봄', '가을', '겨울'], 4, 18, 0, 'smart', 'Sample Atelier', 135000, 15, fmtDate(2), 1, '/seed/navy-knit.jpg'],
    ['수피마 코튼 옥스포드 셔츠', 'top', 'shirt', 'cotton', '화이트', '#F2F1EC', ['봄', '여름', '가을', '겨울'], 8, 25, 0, 'smart', 'Sample Atelier', 119000, 20, fmtDate(4), 1, '/seed/white-shirt.jpg'],
    ['오트밀 캐시미어 라운드 니트', 'top', 'knit', 'knit', '크림', '#DDD3C2', ['가을', '겨울'], -3, 15, 0, 'smart', 'Sample Atelier', 168000, 8, fmtDate(9), 0, '/seed/cream-knit.jpg'],
    ['울 블렌드 원턱 와이드 슬랙스', 'bottom', 'slacks', 'wool', '차콜', '#35383E', ['봄', '가을', '겨울'], 0, 22, 0, 'smart', 'Sample Atelier', 165000, 18, fmtDate(2), 1, '/seed/charcoal-slacks.jpg'],
    ['셀비지 스트레이트 데님', 'bottom', 'denim', 'denim', '인디고', '#284064', ['봄', '여름', '가을', '겨울'], 2, 26, 1, 'casual', 'Sample Atelier', 149000, 22, fmtDate(1), 1, '/seed/indigo-denim.jpg'],
    ['코튼 트윌 테이퍼드 치노 팬츠', 'bottom', 'chinos', 'cotton', '베이지', '#C2B194', ['봄', '여름', '가을'], 8, 25, 0, 'smart', 'Sample Atelier', 132000, 10, fmtDate(6), 0, '/seed/studio-chinos.jpg'],
    ['미니멀 레더 코트 스니커즈', 'shoes', 'sneakers', 'leather', '화이트', '#EAE7E1', ['봄', '여름', '가을', '겨울'], -2, 32, 1, 'casual', 'Sample Atelier', 218000, 26, fmtDate(1), 1, '/seed/white-sneakers.jpg'],
    ['클래식 스무스 레더 페니 로퍼', 'shoes', 'loafers', 'leather', '블랙', '#1A1A1C', ['봄', '여름', '가을', '겨울'], 0, 28, 1, 'formal', 'Sample Atelier', 298000, 13, fmtDate(5), 1, '/seed/black-loafers.jpg'],
    ['이탈리안 풀그레인 레더 서류가방', 'accessory', 'briefcase', 'leather', '브라운', '#5C3A24', ['봄', '여름', '가을', '겨울'], -10, 35, 1, 'formal', 'Sample Atelier', 450000, 14, fmtDate(2), 1, '/seed/studio-briefcase.jpg'],
    ['페블 레더 미니멀 쇼퍼 토트백', 'accessory', 'tote', 'leather', '카멜', '#C3AE93', ['봄', '여름', '가을', '겨울'], -10, 35, 1, 'smart', 'Sample Atelier', 390000, 12, fmtDate(4), 0, '/seed/studio-tote.jpg'],
    ['퓨어 캐시미어 프린지 머플러', 'neckwear', 'scarf', 'wool', '카멜', '#B58E63', ['가을', '겨울'], -12, 11, 0, 'smart', 'Sample Atelier', 195000, 9, fmtDate(7), 1, '/seed/studio-muffler.jpg'],
    ['실크 자카드 클래식 네이비 타이', 'neckwear', 'necktie', 'silk', '네이비', '#233149', ['봄', '여름', '가을', '겨울'], 0, 30, 0, 'formal', 'Sample Atelier', 145000, 6, fmtDate(10), 0, '/seed/studio-necktie.jpg'],
    ['캐시미어 골지 비니', 'headwear', 'beanie', 'knit', '그레이', '#B8B1A6', ['가을', '겨울'], -10, 10, 0, 'casual', 'Sample Atelier', 69000, 7, fmtDate(11), 0, '/seed/studio-beanie.jpg'],
    ['코튼 트윌 아틀리에 볼캡', 'headwear', 'cap', 'cotton', '베이지', '#CBC2B2', ['봄', '여름', '가을'], 8, 33, 1, 'casual', 'Sample Atelier', 49000, 12, fmtDate(3), 0, '/seed/studio-cap.jpg'],
    ['나파 레더 캐시미어 라이닝 장갑', 'gloves', 'leather_gloves', 'leather', '블랙', '#242120', ['겨울'], -15, 7, 1, 'formal', 'Sample Atelier', 128000, 5, fmtDate(14), 0, '/seed/studio-leather-gloves.jpg'],
    ['메리노 울 골지 크루 삭스', 'socks', 'crew_socks', 'wool', '크림', '#CFC9BE', ['봄', '가을', '겨울'], -8, 20, 0, 'smart', 'Sample Atelier', 24000, 19, fmtDate(2), 0, '/seed/studio-crew-socks.jpg'],
    ['심리스 모달 에어 이너탑', 'underwear', 'inner_top', 'cotton', '화이트', '#EBE8E1', ['봄', '여름', '가을', '겨울'], -10, 30, 0, 'casual', 'Sample Atelier', 29000, 21, fmtDate(1), 0, '/seed/studio-inner-top.jpg'],
  ];

  const insertSample = db.prepare(`
    INSERT INTO garments (
      closet_owner, name, category, subcategory, color_name, color_hex,
      seasons, min_temp, max_temp, water_resistant, formality,
      brand, price, wear_count, last_worn_date, status, is_favorite, image_url, notes,
      fabric, slot_key, base_glb, physics_preset, custom_texture
    ) VALUES ('sample', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, '샘플 체험용 캡슐 아틀리에 아이템', ?, ?, ?, ?, 0)
  `);

  for (const item of sampleItems) {
    const [
      name,
      category,
      subcategory,
      fabric,
      colorName,
      colorHex,
      seasons,
      minTemp,
      maxTemp,
      water,
      formality,
      brand,
      price,
      wearCount,
      lastWornDate,
      isFav,
      imageUrl,
    ] = item;
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    insertSample.run(
      name,
      category,
      subcategory,
      colorName,
      colorHex,
      JSON.stringify(seasons),
      minTemp,
      maxTemp,
      water,
      formality,
      brand,
      price,
      wearCount,
      lastWornDate,
      isFav,
      imageUrl,
      fabric,
      spec.slotKey,
      spec.baseGlb,
      spec.physicsPreset
    );
  }
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT DEFAULT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      default_closet TEXT NOT NULL DEFAULT 'husband',
      closet_name TEXT DEFAULT NULL,
      verification_token TEXT DEFAULT NULL,
      verification_code TEXT DEFAULT NULL,
      verified_at TEXT DEFAULT NULL,
      verification_hash TEXT DEFAULT NULL,
      age_group TEXT DEFAULT NULL,
      age INTEGER DEFAULT NULL,
      height_cm REAL DEFAULT NULL,
      weight_kg REAL DEFAULT NULL,
      gender TEXT DEFAULT NULL,
      personal_color TEXT DEFAULT NULL,
      skin_tone_hex TEXT DEFAULT NULL,
      skin_undertone_lab TEXT DEFAULT NULL,
      profile_completed INTEGER NOT NULL DEFAULT 0,
      body_shape TEXT DEFAULT NULL,
      body_fat_pct REAL DEFAULT NULL,
      chest_cm REAL DEFAULT NULL,
      waist_cm REAL DEFAULT NULL,
      hip_cm REAL DEFAULT NULL,
      head_cm REAL DEFAULT NULL,
      apple_sub TEXT DEFAULT NULL,
      auth_provider TEXT NOT NULL DEFAULT 'email',
      verify_last_sent_at TEXT DEFAULT NULL,
      verify_send_count INTEGER NOT NULL DEFAULT 0,
      verify_fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closet_owner TEXT NOT NULL DEFAULT 'husband',
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      color_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      seasons TEXT NOT NULL DEFAULT '["봄","가을"]',
      min_temp INTEGER NOT NULL DEFAULT 10,
      max_temp INTEGER NOT NULL DEFAULT 22,
      water_resistant INTEGER NOT NULL DEFAULT 0,
      formality TEXT NOT NULL DEFAULT 'smart',
      brand TEXT DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      wear_count INTEGER NOT NULL DEFAULT 0,
      last_worn_date TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL,
      notes TEXT DEFAULT '',
      fabric TEXT NOT NULL DEFAULT 'cotton',
      slot_key TEXT DEFAULT NULL,
      base_glb TEXT DEFAULT NULL,
      physics_preset TEXT NOT NULL DEFAULT 'rigid_fitted',
      custom_texture INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outfits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closet_owner TEXT NOT NULL DEFAULT 'husband',
      title TEXT NOT NULL,
      occasion TEXT NOT NULL DEFAULT '데일리',
      season TEXT NOT NULL DEFAULT '봄/가을',
      item_ids TEXT NOT NULL,
      memo TEXT DEFAULT '',
      wear_count INTEGER NOT NULL DEFAULT 0,
      last_worn_date TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wear_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closet_owner TEXT NOT NULL DEFAULT 'husband',
      worn_date TEXT NOT NULL,
      outfit_id INTEGER DEFAULT NULL,
      item_ids TEXT NOT NULL,
      weather_summary TEXT DEFAULT '',
      temp_c INTEGER DEFAULT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'worn',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shopping_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closet_owner TEXT NOT NULL DEFAULT 'husband',
      image_url TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      color_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      verdict TEXT NOT NULL,
      similar_count INTEGER NOT NULL DEFAULT 0,
      max_similarity INTEGER NOT NULL DEFAULT 0,
      decision TEXT NOT NULL DEFAULT 'undecided',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS packing_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closet_owner TEXT NOT NULL DEFAULT 'husband',
      title TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT '도쿄',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      climate TEXT NOT NULL DEFAULT 'mild',
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const alterStatements = [
    'ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN closet_name TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN verification_token TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN verification_code TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN verified_at TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN verification_hash TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN age_group TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN height_cm REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN weight_kg REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN gender TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN personal_color TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN skin_tone_hex TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN skin_undertone_lab TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN body_shape TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN body_fat_pct REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN chest_cm REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN waist_cm REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN hip_cm REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN head_cm REAL DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN apple_sub TEXT DEFAULT NULL',
    "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email'",
    'ALTER TABLE users ADD COLUMN verify_last_sent_at TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN verify_send_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN verify_fail_count INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE garments ADD COLUMN fabric TEXT NOT NULL DEFAULT 'cotton'",
    'ALTER TABLE garments ADD COLUMN slot_key TEXT DEFAULT NULL',
    'ALTER TABLE garments ADD COLUMN base_glb TEXT DEFAULT NULL',
    "ALTER TABLE garments ADD COLUMN physics_preset TEXT NOT NULL DEFAULT 'rigid_fitted'",
    'ALTER TABLE garments ADD COLUMN custom_texture INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE wear_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'worn'",
  ];

  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch {
      // Column already exists
    }
  }

  // Sweep expired sessions on startup
  try {
    db.exec(
      "DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now') OR expires_at <= datetime('now');"
    );
  } catch {
    // ignore session sweep error
  }

  seedWardrobeBenchmarks(db);
  seedIfEmpty();

  // Ensure signature 3D Jiggle Physics items (Briefcase, Shopper Tote, Fringed Muffler) exist on demo closets
  if (shouldSeedDemoAccounts(false)) {
    try {
      const ensureSignatureItem = (owner, category, subcat, fabric, rowArgs) => {
        const found = db
          .prepare('SELECT id FROM garments WHERE closet_owner = ? AND subcategory = ? LIMIT 1')
          .get(owner, subcat);
        if (!found) {
          const spec = resolveManifestSlotAndGlb(category, subcat);
          db.prepare(`
            INSERT INTO garments (
              closet_owner, name, category, subcategory, color_name, color_hex,
              seasons, min_temp, max_temp, water_resistant, formality,
              brand, price, wear_count, last_worn_date, status, is_favorite, image_url, notes,
              fabric, slot_key, base_glb, physics_preset, custom_texture
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?, ?, 0)
          `).run(...rowArgs, fabric, spec.slotKey, spec.baseGlb, spec.physicsPreset);
        }
      };
      const todayStr = new Date().toISOString().slice(0, 10);
      ensureSignatureItem('husband', 'accessory', 'briefcase', 'leather', [
        'husband',
        '이탈리안 풀그레인 레더 서류가방',
        'accessory',
        'briefcase',
        '브라운',
        '#5C3A24',
        JSON.stringify(['봄', '여름', '가을', '겨울']),
        -10,
        35,
        1,
        'formal',
        'Valextra 무드',
        490000,
        15,
        todayStr,
        '/seed/studio-briefcase.jpg',
        '왼손 그립 소켓 진자 물리(Pendulum Physics)가 적용된 비스포크 브리프케이스',
      ]);
      ensureSignatureItem('wife', 'accessory', 'tote', 'leather', [
        'wife',
        '페블 레더 쇼퍼 토트백',
        'accessory',
        'tote',
        '카멜',
        '#A87948',
        JSON.stringify(['봄', '여름', '가을', '겨울']),
        -10,
        35,
        1,
        'smart',
        'Polène 무드',
        420000,
        18,
        todayStr,
        '/seed/studio-tote.jpg',
        '보행 리듬에 따라 경쾌하게 흔들리는 쇼퍼 토트백',
      ]);
      ensureSignatureItem('husband', 'neckwear', 'scarf', 'wool', [
        'husband',
        '퓨어 캐시미어 프린지 머플러',
        'neckwear',
        'scarf',
        '카멜',
        '#B58E63',
        JSON.stringify(['가을', '겨울']),
        -12,
        11,
        0,
        'smart',
        'Johnstons of Elgin 무드',
        240000,
        9,
        todayStr,
        '/seed/studio-muffler.jpg',
        '소프트 클로스 지글 피직스가 적용된 캐시미어 머플러',
      ]);
    } catch {
      // ignore migration error
    }
  }

  // One-time migration: replace any SVG or blacklisted store-terracotta-cardigan.jpg garment images with studio packshots
  try {
    const legacyGarments = db
      .prepare(
        "SELECT id, category, subcategory FROM garments WHERE image_url LIKE 'data:image/svg+xml%' OR image_url = '/seed/store-terracotta-cardigan.jpg'"
      )
      .all();
    if (legacyGarments.length > 0) {
      const updateImg = db.prepare('UPDATE garments SET image_url = ? WHERE id = ?');
      for (const g of legacyGarments) {
        updateImg.run(getStudioSeedImageForGarment(g.category, g.subcategory), g.id);
      }
    }
    const glbFixes = [
      ['outer_padding', 'outer_jacket', 'drape_wind_garment'],
      ['bottom_chinos', 'bottom_slacks', 'drape_wind_garment'],
      ['dress_knit', 'dress_onepiece', 'hem_sway_skirt'],
      ['gloves_leather', 'gloves_short', 'rigid_fitted'],
      ['underwear_camisole', 'underwear_top', 'rigid_fitted'],
    ];
    const updateGlbStmt = db.prepare(
      'UPDATE garments SET base_glb = ?, physics_preset = ? WHERE base_glb = ?'
    );
    for (const [legacyGlb, nextGlb, nextPreset] of glbFixes) {
      updateGlbStmt.run(nextGlb, nextPreset, legacyGlb);
    }
  } catch {
    // ignore migration error
  }
}

export function seedIfEmpty(forceReset = false) {
  db.transaction(() => {
    if (forceReset) {
      // Never wipe real users' personal closets; only reset demo/sample closets!
      db.exec(`
        DELETE FROM shopping_checks WHERE closet_owner IN ('husband', 'wife', 'sample');
        DELETE FROM wear_logs WHERE closet_owner IN ('husband', 'wife', 'sample');
        DELETE FROM outfits WHERE closet_owner IN ('husband', 'wife', 'sample');
        DELETE FROM packing_lists WHERE closet_owner IN ('husband', 'wife', 'sample');
        DELETE FROM garments WHERE closet_owner IN ('husband', 'wife', 'sample');
      `);
    }

    // Always keep the isolated 'sample' closet populated for read-only Sample Demo mode
    ensureSampleClosetSeeded();

    if (!shouldSeedDemoAccounts(forceReset)) {
      return;
    }

    const nowIso = new Date().toISOString();
    const ensureDefaultUser = ({
      username,
      password,
      displayName,
      role,
      defaultCloset,
      closetName,
      email,
      ageGroup,
      age,
      heightCm,
      weightKg,
      gender,
      personalColor,
      skinToneHex,
      bodyShape,
      bodyFatPct,
      chestCm,
      waistCm,
      hipCm,
      headCm,
    }) => {
      const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      const vHash = computeVerificationHash(username, email, nowIso);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (
            username, email, password_hash, display_name, role, default_closet, closet_name,
            verified_at, verification_hash, age_group, age, height_cm, weight_kg, gender,
            personal_color, skin_tone_hex, profile_completed,
            body_shape, body_fat_pct, chest_cm, waist_cm, hip_cm, head_cm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        `).run(
          username,
          email,
          hashPassword(password),
          displayName,
          role,
          defaultCloset,
          closetName,
          nowIso,
          vHash,
          ageGroup,
          age,
          heightCm,
          weightKg,
          gender,
          personalColor,
          skinToneHex,
          bodyShape,
          bodyFatPct,
          chestCm,
          waistCm,
          hipCm,
          headCm
        );
      } else if (
        !existing.verified_at ||
        !existing.verification_hash ||
        !existing.profile_completed ||
        !existing.personal_color
      ) {
        db.prepare(`
          UPDATE users
          SET email = COALESCE(email, ?),
              closet_name = COALESCE(closet_name, ?),
              verified_at = COALESCE(verified_at, ?),
              verification_hash = COALESCE(verification_hash, ?),
              age_group = COALESCE(age_group, ?),
              age = COALESCE(age, ?),
              height_cm = COALESCE(height_cm, ?),
              weight_kg = COALESCE(weight_kg, ?),
              gender = COALESCE(gender, ?),
              personal_color = COALESCE(personal_color, ?),
              skin_tone_hex = COALESCE(skin_tone_hex, ?),
              profile_completed = 1,
              body_shape = COALESCE(body_shape, ?),
              body_fat_pct = COALESCE(body_fat_pct, ?),
              chest_cm = COALESCE(chest_cm, ?),
              waist_cm = COALESCE(waist_cm, ?),
              hip_cm = COALESCE(hip_cm, ?),
              head_cm = COALESCE(head_cm, ?)
          WHERE id = ?
        `).run(
          email,
          closetName,
          nowIso,
          vHash,
          ageGroup,
          age,
          heightCm,
          weightKg,
          gender,
          personalColor,
          skinToneHex,
          bodyShape,
          bodyFatPct,
          chestCm,
          waistCm,
          hipCm,
          headCm,
          existing.id
        );
      }
    };

    ensureDefaultUser({
      username: 'admin',
      password: process.env.ADMIN_INITIAL_PASSWORD || 'admin',
      displayName: '어드민 (남편)',
      role: 'admin',
      defaultCloset: 'husband',
      closetName: '남편의 사이버 아틀리에',
      email: 'admin@ainventory.kr',
      ageGroup: '30s',
      age: 34,
      heightCm: 178,
      weightKg: 73,
      gender: 'male',
      personalColor: 'autumn_warm',
      skinToneHex: '#DEC2A7',
      bodyShape: 'upper_developed',
      bodyFatPct: 14.8,
      chestCm: 102,
      waistCm: 79,
      hipCm: 96,
      headCm: 57.5,
    });

    ensureDefaultUser({
      username: 'husband',
      password: 'husband1234',
      displayName: '남편',
      role: 'member',
      defaultCloset: 'husband',
      closetName: '남편의 사이버 아틀리에',
      email: 'husband@ainventory.kr',
      ageGroup: '30s',
      age: 34,
      heightCm: 178,
      weightKg: 73,
      gender: 'male',
      personalColor: 'autumn_warm',
      skinToneHex: '#DEC2A7',
      bodyShape: 'upper_developed',
      bodyFatPct: 14.8,
      chestCm: 102,
      waistCm: 79,
      hipCm: 96,
      headCm: 57.5,
    });

    ensureDefaultUser({
      username: 'wife',
      password: 'wife1234',
      displayName: '와이프',
      role: 'member',
      defaultCloset: 'wife',
      closetName: '와이프의 시그니처 옷장',
      email: 'wife@ainventory.kr',
      ageGroup: '30s',
      age: 32,
      heightCm: 165,
      weightKg: 53,
      gender: 'female',
      personalColor: 'spring_warm',
      skinToneHex: '#ECD3BE',
      bodyShape: 'standard_balanced',
      bodyFatPct: 21.5,
      chestCm: 86,
      waistCm: 65,
      hipCm: 92,
      headCm: 54.8,
    });

    const demoGarmentCount = db
      .prepare("SELECT COUNT(*) as cnt FROM garments WHERE closet_owner IN ('husband', 'wife')")
      .get().cnt;
    if (demoGarmentCount > 0) {
      // Ensure all wear slots exist for husband and wife so 3D inventory is fully populated
      const husbandSlots = db
        .prepare("SELECT COUNT(DISTINCT category) as c FROM garments WHERE closet_owner = 'husband'")
        .get().c;
      if (husbandSlots < 8) {
        generateStatisticalWardrobeForUser(db, 'husband', {
          age_group: '30s',
          gender: 'male',
          personal_color: 'autumn_warm',
        });
      }
      const wifeSlots = db
        .prepare("SELECT COUNT(DISTINCT category) as c FROM garments WHERE closet_owner = 'wife'")
        .get().c;
      if (wifeSlots < 8) {
        generateStatisticalWardrobeForUser(db, 'wife', {
          age_group: '30s',
          gender: 'female',
          personal_color: 'spring_warm',
        });
      }
      return;
    }

    const insertGarment = db.prepare(`
      INSERT INTO garments (
        closet_owner, name, category, subcategory, color_name, color_hex,
        seasons, min_temp, max_temp, water_resistant, formality,
        brand, price, wear_count, last_worn_date, status, is_favorite, image_url, notes,
        fabric, slot_key, base_glb, physics_preset, custom_texture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const today = new Date();
    const fmtDate = (daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };

    const seedGarments = [
      // 남편 옷장 (husband) core signature items (indices 0..9)
      [
        'husband', '발수 코튼 싱글 맥 트렌치코트', 'outer', 'trench', '베이지', '#C4B193',
        JSON.stringify(['봄', '가을']), 7, 18, 1, 'smart',
        'ARKET', 290000, 14, fmtDate(4), 'active', 1, '/seed/beige-trench.jpg',
        '간절기 출근 및 비 오는 날 주력 아우터 (생활 발수 코팅)', 'gabardine',
      ],
      [
        'husband', '테일러드 싱글 울 블레이저', 'outer', 'blazer', '블랙', '#1E1F22',
        JSON.stringify(['봄', '가을', '겨울']), 5, 19, 0, 'formal',
        'COS', 350000, 9, fmtDate(9), 'active', 1, '/seed/black-blazer.jpg',
        '미팅 및 주말 레스토랑 외출용 미니멀 블레이저', 'wool',
      ],
      [
        'husband', '파인 메리노 울 크루넥 니트', 'top', 'knit', '네이비', '#1C2538',
        JSON.stringify(['봄', '가을', '겨울']), 4, 18, 0, 'smart',
        'COS', 135000, 16, fmtDate(2), 'active', 1, '/seed/navy-knit.jpg',
        '단품으로도 셔츠 레이어드용으로도 가장 손이 자주 가는 기본 니트', 'knit',
      ],
      [
        'husband', '캐시미어 블렌드 라운드 스웨터', 'top', 'knit', '네이비', '#222E46',
        JSON.stringify(['가을', '겨울']), 0, 15, 0, 'casual',
        '무신사 스탠다드', 59900, 1, fmtDate(180), 'active', 0, '/seed/navy-knit.jpg',
        '작년 세일 때 중복 구매해서 옷장 서랍에 잠자고 있는 니트', 'knit',
      ],
      [
        'husband', '크리스프 코튼 옥스포드 셔츠', 'top', 'shirt', '화이트', '#F2F1EC',
        JSON.stringify(['봄', '여름', '가을', '겨울']), 8, 26, 0, 'smart',
        '폴로 랄프로렌', 189000, 24, fmtDate(5), 'active', 1, '/seed/white-shirt.jpg',
        '사계절 내내 입는 에센셜 옥스포드 셔츠', 'cotton',
      ],
      [
        'husband', '오트밀 캐시미어 터틀넥 니트', 'top', 'knit', '크림', '#DDD3C2',
        JSON.stringify(['가을', '겨울']), -5, 13, 0, 'smart',
        '유니클로 U', 129000, 6, fmtDate(14), 'active', 0, '/seed/cream-knit.jpg',
        '추운 날 블레이저나 코트 이너로 착용', 'knit',
      ],
      [
        'husband', '울 블렌드 원턱 와이드 슬랙스', 'bottom', 'slacks', '차콜', '#35383E',
        JSON.stringify(['봄', '가을', '겨울']), 2, 22, 0, 'smart',
        'COS', 175000, 19, fmtDate(2), 'active', 1, '/seed/charcoal-slacks.jpg',
        '구김이 적고 실루엣이 깔끔한 주력 슬랙스', 'wool',
      ],
      [
        'husband', '셀비지 스트레이트 인디고 데님', 'bottom', 'denim', '인디고', '#284064',
        JSON.stringify(['봄', '여름', '가을', '겨울']), 3, 26, 1, 'casual',
        '리바이스 프리미엄', 159000, 27, fmtDate(1), 'active', 1, '/seed/indigo-denim.jpg',
        '주말 데일리 착용률 1위 청바지', 'denim',
      ],
      [
        'husband', '미니멀 화이트 스웨이드코트 스니커즈', 'shoes', 'sneakers', '화이트', '#EAE7E1',
        JSON.stringify(['봄', '여름', '가을', '겨울']), 0, 32, 0, 'casual',
        '커먼프로젝트 무드', 248000, 31, fmtDate(1), 'active', 1, '/seed/white-sneakers.jpg',
        '앞코 스웨이드 소재라 비 오는 날은 피하는 편', 'leather',
      ],
      [
        'husband', '클래식 스무스 레더 페니 로퍼', 'shoes', 'loafers', '블랙', '#1A1A1C',
        JSON.stringify(['봄', '여름', '가을', '겨울']), 0, 28, 1, 'formal',
        '버윅', 318000, 12, fmtDate(5), 'active', 1, '/seed/black-loafers.jpg',
        '비 오는 날이나 포멀 출근룩에 든든한 가죽 로퍼', 'leather',
      ],

      // 와이프 옷장 (wife) core signature items (indices 10..15)
      [
        'wife', '경량 올리브 퀼팅 라이너 자켓', 'outer', 'jacket', '카키/올리브', '#7D836D',
        JSON.stringify(['봄', '가을']), 6, 18, 1, 'casual',
        'ARKET', 195000, 11, fmtDate(3), 'active', 1, '/seed/olive-jacket.jpg',
        '가볍고 따뜻해서 산책 및 주말 마실용으로 최고', 'nylon',
      ],
      [
        'wife', '클래식 벨티드 맥 코트', 'outer', 'trench', '베이지', '#C4B193',
        JSON.stringify(['봄', '가을']), 8, 19, 1, 'smart',
        'COS', 320000, 8, fmtDate(7), 'active', 1, '/seed/beige-trench.jpg',
        '남편 맥코트와 시밀러룩으로 입기 좋은 베이지 코트', 'gabardine',
      ],
      [
        'wife', '소프트 캐시미어 터틀넥 풀오버', 'top', 'knit', '크림', '#DDD3C2',
        JSON.stringify(['가을', '겨울']), -3, 15, 0, 'smart',
        'TOTEME 무드', 260000, 10, fmtDate(4), 'active', 1, '/seed/cream-knit.jpg',
        '목 따가움 없는 포근한 오트밀 크림 니트', 'knit',
      ],
      [
        'wife', '릴랙스핏 포플린 화이트 셔츠', 'top', 'shirt', '화이트', '#F2F1EC',
        JSON.stringify(['봄', '여름', '가을']), 12, 27, 0, 'smart',
        'COS', 135000, 15, fmtDate(6), 'active', 1, '/seed/white-shirt.jpg',
        '단독 및 니트 레이어드 활용도 높은 셔츠', 'cotton',
      ],
      [
        'wife', '하이웨이스트 울 와이드 팬츠', 'bottom', 'slacks', '차콜', '#35383E',
        JSON.stringify(['봄', '가을', '겨울']), 2, 21, 0, 'smart',
        'ARKET', 190000, 14, fmtDate(3), 'active', 1, '/seed/charcoal-slacks.jpg',
        '다리가 길어 보이는 차콜 와이드 슬랙스', 'wool',
      ],
      [
        'wife', '클린 화이트 레더 스니커즈', 'shoes', 'sneakers', '화이트', '#EAE7E1',
        JSON.stringify(['봄', '여름', '가을', '겨울']), 0, 32, 0, 'casual',
        'VEJA', 210000, 22, fmtDate(3), 'active', 1, '/seed/white-sneakers.jpg',
        '어디에나 잘 어울리는 데일리 스니커즈', 'leather',
      ],
    ];

    const insertedIds = [];
    for (const g of seedGarments) {
      const category = g[2];
      const subcategory = g[3];
      const spec = resolveManifestSlotAndGlb(category, subcategory);
      const res = insertGarment.run(...g, spec.slotKey, spec.baseGlb, spec.physicsPreset);
      insertedIds.push(Number(res.lastInsertRowid));
    }

    // Also populate all 11 wear slots for husband and wife based on age/personal color benchmarks
    generateStatisticalWardrobeForUser(db, 'husband', {
      age_group: '30s',
      gender: 'male',
      personal_color: 'autumn_warm',
    });
    generateStatisticalWardrobeForUser(db, 'wife', {
      age_group: '30s',
      gender: 'female',
      personal_color: 'spring_warm',
    });

    const commuteItemIds = [insertedIds[0], insertedIds[4], insertedIds[6], insertedIds[9]].filter(Boolean);
    const weekendNavyIds = [insertedIds[2], insertedIds[7], insertedIds[8]].filter(Boolean);
    const casualCafeIds = [insertedIds[4], insertedIds[7], insertedIds[8]].filter(Boolean);
    const wifeWalkIds = [insertedIds[10], insertedIds[12], insertedIds[14], insertedIds[15]].filter(Boolean);

    // Seed initial outfits for husband & wife using actual inserted row IDs
    const insertOutfit = db.prepare(`
      INSERT INTO outfits (closet_owner, title, occasion, season, item_ids, memo, wear_count, last_worn_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const outfit1Id = Number(
      insertOutfit.run(
        'husband',
        '단정한 간절기 트렌치 출근룩',
        '출근룩',
        '봄/가을',
        JSON.stringify(commuteItemIds),
        '일교차 큰 날 실패 없는 베이지 트렌치 + 화이트 셔츠 + 차콜 슬랙스 조합',
        5,
        fmtDate(5)
      ).lastInsertRowid
    );
    const outfit2Id = Number(
      insertOutfit.run(
        'husband',
        '주말 미니멀 네이비 & 데님',
        '주말 데이트',
        '봄/가을',
        JSON.stringify(weekendNavyIds),
        '깔끔하고 편안한 주말 브런치 코디',
        8,
        fmtDate(2)
      ).lastInsertRowid
    );
    const outfit3Id = Number(
      insertOutfit.run(
        'wife',
        '어텀 올리브 & 크림 산책룩',
        '주말 데이트',
        '봄/가을',
        JSON.stringify(wifeWalkIds),
        '올리브 퀼팅 자켓에 포근한 크림 니트 매치',
        4,
        fmtDate(3)
      ).lastInsertRowid
    );

    // Seed recent OOTD wear logs referencing actual inserted garment & outfit IDs
    const insertLog = db.prepare(`
      INSERT INTO wear_logs (closet_owner, worn_date, outfit_id, item_ids, weather_summary, temp_c, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'worn')
    `);
    insertLog.run('husband', fmtDate(1), null, JSON.stringify(casualCafeIds), '맑음', 15, '가볍게 동네 카페 외출');
    insertLog.run('husband', fmtDate(2), outfit2Id, JSON.stringify(weekendNavyIds), '구름조금', 13, '와이프랑 성수동 쇼핑 데이트');
    insertLog.run('husband', fmtDate(5), outfit1Id, JSON.stringify(commuteItemIds), '비 조금', 11, '발수 트렌치코트 덕분에 쾌적했던 출근길');
    insertLog.run('wife', fmtDate(3), outfit3Id, JSON.stringify(wifeWalkIds), '맑음', 14, '올림픽공원 산책 코디');

    // Seed 1 sample past shopping check showing mindful savings
    db.prepare(`
      INSERT INTO shopping_checks (
        closet_owner, image_url, candidate_name, category, subcategory,
        color_name, color_hex, price, verdict, similar_count, max_similarity, decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'husband',
      '/seed/store-navy-sweater.jpg',
      '매장 촬영 · 다크 네이비 크루넥 니트',
      'top',
      'knit',
      '네이비',
      '#1E273B',
      89000,
      'skip',
      2,
      94,
      'passed'
    );
  });
}

export default db;
