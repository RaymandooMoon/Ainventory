import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const UTC_NOW_PG_EXPR =
  "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

const TABLES_WITHOUT_AUTO_ID = new Set([
  'sessions',
  'profile_configs',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'user_permission_overrides',
]);

/**
 * Replaces positional `?` placeholders with PostgreSQL `$1, $2, ...`
 * while preserving `?` characters inside single-quoted string literals.
 */
export function replacePositionalPlaceholders(sql) {
  let out = '';
  let paramIdx = 0;
  let inSingleQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") {
      out += ch;
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "'";
        i += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (!inSingleQuote && ch === '?') {
      paramIdx += 1;
      out += `$${paramIdx}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Translates SQLite-flavored DDL/DML statements used by Ainventory into
 * PostgreSQL 16 compatible SQL without altering semantic behavior.
 */
export function translateSqlForPostgres(rawSql) {
  let sql = String(rawSql || '');

  // Strip SQLite-only PRAGMA statements
  sql = sql.replace(/^\s*PRAGMA\s+[^;]+;?\s*$/gim, '');

  // Primary key autoincrement -> SERIAL PRIMARY KEY (int4 returns JS number natively)
  sql = sql.replace(
    /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi,
    'SERIAL PRIMARY KEY'
  );

  // SQLite ALTER TABLE ADD COLUMN -> idempotent ADD COLUMN IF NOT EXISTS
  sql = sql.replace(
    /\bALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)/gi,
    'ALTER TABLE $1 ADD COLUMN IF NOT EXISTS '
  );

  // SQLite datetime('now') defaults and runtime expressions -> UTC text format
  sql = sql.replace(
    /DEFAULT\s*\(\s*datetime\(\s*'now'\s*\)\s*\)/gi,
    `DEFAULT (${UTC_NOW_PG_EXPR})`
  );
  sql = sql.replace(/datetime\(\s*'now'\s*\)/gi, UTC_NOW_PG_EXPR);
  // SQLite datetime(col) wrapper on ISO/UTC text column -> raw column text comparison
  sql = sql.replace(/\bdatetime\(\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\)/gi, '$1');

  // INSERT OR IGNORE INTO ... -> INSERT INTO ... ON CONFLICT DO NOTHING
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');
    if (!/\bON\s+CONFLICT\b/i.test(sql)) {
      sql = sql.replace(/;\s*$/, '').trimEnd() + ' ON CONFLICT DO NOTHING';
    }
  }

  return replacePositionalPlaceholders(sql);
}

/**
 * For PostgreSQL INSERT statements targeting tables with a SERIAL `id` column,
 * appends `RETURNING id` so `.run()` returns `{ lastInsertRowid }` matching SQLite.
 */
export function appendReturningIdIfNeeded(pgSql) {
  const trimmed = String(pgSql || '').trim().replace(/;\s*$/, '');
  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/i);
  if (!insertMatch) return pgSql;
  if (/\bRETURNING\b/i.test(trimmed)) return pgSql;
  const tableName = insertMatch[1].toLowerCase();
  if (TABLES_WITHOUT_AUTO_ID.has(tableName)) return pgSql;
  return `${trimmed} RETURNING id`;
}

function normalizeRunParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  return args;
}

/**
 * Wraps a synchronous SQLite driver (`node:sqlite` or `sql.js`) behind the
 * unified asynchronous DatabaseAdapter interface so local dev and tests share
 * the exact same async contract as PostgreSQL.
 */
function wrapSyncSqliteDriver(rawDb, driverName, closeSync) {
  let txDepth = 0;

  const adapter = {
    dialect: 'sqlite',
    driver: driverName,
    async exec(sql) {
      rawDb.exec(sql);
    },
    async get(sql, ...args) {
      const params = normalizeRunParams(args);
      return rawDb.prepare(sql).get(...params);
    },
    async all(sql, ...args) {
      const params = normalizeRunParams(args);
      return rawDb.prepare(sql).all(...params);
    },
    async run(sql, ...args) {
      const params = normalizeRunParams(args);
      const res = rawDb.prepare(sql).run(...params);
      return {
        changes: Number(res?.changes ?? 0),
        lastInsertRowid: Number(res?.lastInsertRowid ?? 0),
      };
    },
    prepare(sql) {
      return {
        get: (...args) => adapter.get(sql, ...args),
        all: (...args) => adapter.all(sql, ...args),
        run: (...args) => adapter.run(sql, ...args),
      };
    },
    async transaction(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('db.transaction requires a callback function');
      }
      if (txDepth === 0) {
        rawDb.exec('BEGIN IMMEDIATE;');
        txDepth += 1;
        try {
          const result = await fn(adapter);
          txDepth -= 1;
          rawDb.exec('COMMIT;');
          if (typeof rawDb._flushAfterCommit === 'function') {
            rawDb._flushAfterCommit();
          }
          return result;
        } catch (err) {
          txDepth = Math.max(0, txDepth - 1);
          try {
            rawDb.exec('ROLLBACK;');
          } catch {
            // ignore rollback error
          }
          throw err;
        }
      }

      const spName = `sp_${txDepth}`;
      rawDb.exec(`SAVEPOINT ${spName};`);
      txDepth += 1;
      try {
        const result = await fn(adapter);
        txDepth -= 1;
        rawDb.exec(`RELEASE SAVEPOINT ${spName};`);
        return result;
      } catch (err) {
        txDepth -= 1;
        try {
          rawDb.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
          rawDb.exec(`RELEASE SAVEPOINT ${spName};`);
        } catch {
          // ignore savepoint cleanup error
        }
        throw err;
      }
    },
    async close() {
      closeSync();
    },
  };

  return {
    db: adapter,
    driver: driverName,
    dialect: 'sqlite',
    closeAndFlush: () => closeSync(),
  };
}

/**
 * Wraps a `pg.Pool` (or injected mock pool for unit tests) behind the unified
 * async DatabaseAdapter interface using `AsyncLocalStorage` for nested ACID
 * transactions and savepoints across concurrent HTTP requests.
 */
export function createPostgresAdapterFromPool(pool) {
  const txStore = new AsyncLocalStorage();
  let closed = false;

  const getExecutor = () => {
    const active = txStore.getStore();
    return active ? active.client : pool;
  };

  const adapter = {
    dialect: 'postgres',
    driver: 'pg',
    async exec(rawSql) {
      const pgSql = translateSqlForPostgres(rawSql).trim();
      if (!pgSql) return;
      await getExecutor().query(pgSql);
    },
    async get(rawSql, ...args) {
      const params = normalizeRunParams(args);
      const pgSql = translateSqlForPostgres(rawSql);
      const res = await getExecutor().query(pgSql, params);
      return res?.rows?.[0];
    },
    async all(rawSql, ...args) {
      const params = normalizeRunParams(args);
      const pgSql = translateSqlForPostgres(rawSql);
      const res = await getExecutor().query(pgSql, params);
      return Array.isArray(res?.rows) ? res.rows : [];
    },
    async run(rawSql, ...args) {
      const params = normalizeRunParams(args);
      const pgSql = appendReturningIdIfNeeded(translateSqlForPostgres(rawSql));
      const res = await getExecutor().query(pgSql, params);
      const firstId = res?.rows?.[0]?.id;
      return {
        changes: Number(res?.rowCount ?? 0),
        lastInsertRowid: firstId !== undefined && firstId !== null ? Number(firstId) : 0,
      };
    },
    prepare(sql) {
      return {
        get: (...args) => adapter.get(sql, ...args),
        all: (...args) => adapter.all(sql, ...args),
        run: (...args) => adapter.run(sql, ...args),
      };
    },
    async transaction(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('db.transaction requires a callback function');
      }
      const existing = txStore.getStore();
      if (existing) {
        const nextDepth = existing.depth + 1;
        const spName = `sp_${nextDepth}`;
        await existing.client.query(`SAVEPOINT ${spName}`);
        try {
          const result = await txStore.run(
            { client: existing.client, depth: nextDepth },
            () => fn(adapter)
          );
          await existing.client.query(`RELEASE SAVEPOINT ${spName}`);
          return result;
        } catch (err) {
          try {
            await existing.client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await existing.client.query(`RELEASE SAVEPOINT ${spName}`);
          } catch {
            // ignore savepoint rollback error
          }
          throw err;
        }
      }

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await txStore.run({ client, depth: 1 }, () => fn(adapter));
          await client.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback error
          }
          const pgCode = String(err?.code || '');
          const isRetryablePgConflict = pgCode === '40P01' || pgCode === '40001';
          if (isRetryablePgConflict && attempt < maxAttempts) {
            const delayMs = 20 * attempt + crypto.randomInt(5, 25);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          throw err;
        } finally {
          client.release();
        }
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (typeof pool.end === 'function') {
        await pool.end();
      }
    },
  };

  return {
    db: adapter,
    driver: 'pg',
    dialect: 'postgres',
    closeAndFlush: () => {
      void adapter.close();
    },
  };
}

/**
 * Instantiates either PostgreSQL (when `databaseUrl` is a postgres:// / postgresql:// URL,
 * e.g. Cloud SQL via Unix Socket on GCP Cloud Run) or local SQLite (`node:sqlite` / `sql.js`).
 * @param {{ databaseUrl?: string; dbPath?: string; forceSqlJs?: boolean }} [options]
 */
export async function createDatabaseAdapter({
  databaseUrl = process.env.DATABASE_URL || '',
  dbPath = '',
  forceSqlJs = Boolean(process.env.FORCE_SQLJS),
} = {}) {
  const cleanUrl = String(databaseUrl || '').trim();
  if (/^postgres(?:ql)?:\/\//i.test(cleanUrl)) {
    const pgMod = await import('pg');
    const pg = pgMod.default || pgMod;
    // Coerce INT8 (OID 20, e.g. COUNT(*) & BIGSERIAL) to JS numbers for SQLite parity
    if (pg?.types?.setTypeParser) {
      pg.types.setTypeParser(20, (val) => Number(val));
    }
    const isUnixSocket = cleanUrl.includes('/cloudsql/') || cleanUrl.includes('host=/');
    const useSsl =
      !isUnixSocket &&
      !/localhost|127\.0\.0\.1/i.test(cleanUrl) &&
      process.env.PGSSLMODE !== 'disable';

    const pool = new pg.Pool({
      connectionString: cleanUrl,
      max: Number(process.env.PG_POOL_MAX || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(useSsl ? { ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== '0' } } : {}),
    });

    return createPostgresAdapterFromPool(pool);
  }

  if (!dbPath) {
    throw new Error('dbPath is required when DATABASE_URL is not configured');
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (!forceSqlJs) {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const nativeDb = new DatabaseSync(dbPath);
      nativeDb.exec('PRAGMA journal_mode = WAL;');
      nativeDb.exec('PRAGMA foreign_keys = ON;');

      let closed = false;
      const closeAndFlush = () => {
        if (closed) return;
        closed = true;
        try {
          nativeDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {
          // ignore checkpoint error during shutdown
        }
        try {
          if (typeof nativeDb.close === 'function') {
            nativeDb.close();
          }
        } catch {
          // ignore close error
        }
      };

      return wrapSyncSqliteDriver(nativeDb, 'node:sqlite', closeAndFlush);
    } catch {
      // Fall through to pure-WASM sql.js for environments without node:sqlite
    }
  }

  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const initialBuf = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
  const wasmDb = initialBuf ? new SQL.Database(initialBuf) : new SQL.Database();
  wasmDb.exec('PRAGMA foreign_keys = ON;');

  let closed = false;
  let inTx = false;
  const flushToDiskAtomically = () => {
    if (closed) return;
    const buf = Buffer.from(wasmDb.export());
    const tmpPath = `${dbPath}.tmp.${process.pid}.${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    fs.writeFileSync(tmpPath, buf);
    fs.renameSync(tmpPath, dbPath);
  };

  const persist = () => {
    if (inTx || closed) return;
    flushToDiskAtomically();
  };

  const wasmRaw = {
    _flushAfterCommit: () => {
      inTx = false;
      flushToDiskAtomically();
    },
    exec(sql) {
      const trimmed = String(sql || '').trim().toUpperCase();
      if (trimmed.startsWith('BEGIN')) inTx = true;
      wasmDb.exec(sql);
      if (trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
        inTx = false;
      }
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
          const changes = wasmDb.exec('SELECT changes()')[0]?.values?.[0]?.[0] ?? 0;
          persist();
          return { lastInsertRowid: Number(lastId), changes: Number(changes) };
        },
      };
    },
  };

  const closeAndFlush = () => {
    if (closed) return;
    try {
      flushToDiskAtomically();
    } catch {
      // ignore flush error during shutdown
    }
    closed = true;
    try {
      wasmDb.close();
    } catch {
      // ignore close error
    }
  };

  return wrapSyncSqliteDriver(wasmRaw, 'sql.js', closeAndFlush);
}
