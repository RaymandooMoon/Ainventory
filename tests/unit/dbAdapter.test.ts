import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  appendReturningIdIfNeeded,
  createDatabaseAdapter,
  createPostgresAdapterFromPool,
  replacePositionalPlaceholders,
  translateSqlForPostgres,
} from '../../server/dbAdapter.js';

describe('server/dbAdapter.js — SQLite & PostgreSQL Dual Adapter', () => {
  it('replaces positional ? placeholders with $1..$N while ignoring single-quoted literals', () => {
    const sql = "SELECT * FROM users WHERE username = ? AND note != 'why?' AND role = ?";
    assert.equal(
      replacePositionalPlaceholders(sql),
      "SELECT * FROM users WHERE username = $1 AND note != 'why?' AND role = $2"
    );
  });

  it('translates SQLite DDL/DML syntax into valid PostgreSQL 16 SQL', () => {
    const createSql = `
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS user_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `;
    const translatedCreate = translateSqlForPostgres(createSql);
    assert.ok(!translatedCreate.includes('PRAGMA'));
    assert.ok(translatedCreate.includes('SERIAL PRIMARY KEY'));
    assert.ok(translatedCreate.includes("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'"));

    const alterSql = 'ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL';
    assert.equal(
      translateSqlForPostgres(alterSql),
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL'
    );

    const ignoreSql =
      'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)';
    assert.equal(
      translateSqlForPostgres(ignoreSql),
      'INSERT INTO role_permissions (role_code, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING'
    );
  });

  it('appends RETURNING id only for auto-increment tables in Postgres mode', () => {
    assert.equal(
      appendReturningIdIfNeeded('INSERT INTO users (username) VALUES ($1)'),
      'INSERT INTO users (username) VALUES ($1) RETURNING id'
    );
    assert.equal(
      appendReturningIdIfNeeded('INSERT INTO sessions (token, user_id) VALUES ($1, $2)'),
      'INSERT INTO sessions (token, user_id) VALUES ($1, $2)'
    );
    assert.equal(
      appendReturningIdIfNeeded('UPDATE users SET display_name = $1 WHERE id = $2'),
      'UPDATE users SET display_name = $1 WHERE id = $2'
    );
  });

  it('executes nested ACID transactions with SAVEPOINTs on a mock pg.Pool via AsyncLocalStorage', async () => {
    const queries: string[] = [];
    let released = false;
    const fakeClient = {
      async query(sql: string, params?: unknown[]) {
        queries.push(sql);
        if (sql.startsWith('INSERT INTO users')) {
          return { rows: [{ id: 42 }], rowCount: 1, params };
        }
        return { rows: [{ c: 1 }], rowCount: 1, params };
      },
      release() {
        released = true;
      },
    };
    const fakePool = {
      async connect() {
        return fakeClient;
      },
      async query(sql: string) {
        queries.push(`POOL:${sql}`);
        return { rows: [], rowCount: 0 };
      },
      async end() {},
    };

    const { db, dialect } = createPostgresAdapterFromPool(fakePool);
    assert.equal(dialect, 'postgres');

    const insertedId = await db.transaction(async () => {
      const res = await db.prepare('INSERT INTO users (username) VALUES (?)').run('alice');
      await db.transaction(async () => {
        await db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('Alice', res.lastInsertRowid);
      });
      return res.lastInsertRowid;
    });

    assert.equal(insertedId, 42);
    assert.equal(released, true);
    assert.deepEqual(queries, [
      'BEGIN',
      'INSERT INTO users (username) VALUES ($1) RETURNING id',
      'SAVEPOINT sp_2',
      'UPDATE users SET display_name = $1 WHERE id = $2',
      'RELEASE SAVEPOINT sp_2',
      'COMMIT',
    ]);

    await db.close();
  });

  it('rolls back failed nested transaction cleanly on local SQLite adapter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainv-dbadapter-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const { db, dialect, closeAndFlush } = await createDatabaseAdapter({
      databaseUrl: '',
      dbPath,
    });
    assert.equal(dialect, 'sqlite');

    try {
      await db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
      const ins = await db.prepare('INSERT INTO items (name) VALUES (?)').run('coat');
      assert.equal(ins.lastInsertRowid, 1);

      await assert.rejects(
        () =>
          db.transaction(async () => {
            await db.prepare('INSERT INTO items (name) VALUES (?)').run('scarf');
            throw new Error('force rollback');
          }),
        /force rollback/
      );

      const rows = await db.prepare('SELECT * FROM items').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'coat');
    } finally {
      closeAndFlush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('retries top-level PostgreSQL transaction on transient 40P01 deadlock and succeeds', async () => {
    let attempts = 0;
    let releases = 0;
    const queries: string[] = [];

    const fakePool = {
      async connect() {
        attempts += 1;
        const attemptNum = attempts;
        return {
          async query(sql: string) {
            queries.push(`A${attemptNum}:${sql}`);
            if (attemptNum === 1 && sql.startsWith('UPDATE users')) {
              const deadlockErr = new Error('deadlock detected') as Error & { code?: string };
              deadlockErr.code = '40P01';
              throw deadlockErr;
            }
            return { rows: [], rowCount: 1 };
          },
          release() {
            releases += 1;
          },
        };
      },
      async query() {
        return { rows: [], rowCount: 0 };
      },
      async end() {},
    };

    const { db } = createPostgresAdapterFromPool(fakePool);
    const out = await db.transaction(async () => {
      await db.prepare('UPDATE users SET handedness = ? WHERE id = ?').run('left', 7);
      return 'saved';
    });

    assert.equal(out, 'saved');
    assert.equal(attempts, 2);
    assert.equal(releases, 2);
    assert.deepEqual(queries, [
      'A1:BEGIN',
      'A1:UPDATE users SET handedness = $1 WHERE id = $2',
      'A1:ROLLBACK',
      'A2:BEGIN',
      'A2:UPDATE users SET handedness = $1 WHERE id = $2',
      'A2:COMMIT',
    ]);
    await db.close();
  });

  it('does not retry non-retryable PostgreSQL errors such as 23505 unique violations', async () => {
    let attempts = 0;
    const fakePool = {
      async connect() {
        attempts += 1;
        return {
          async query(sql: string) {
            if (sql.startsWith('INSERT')) {
              const err = new Error('duplicate key value') as Error & { code?: string };
              err.code = '23505';
              throw err;
            }
            return { rows: [], rowCount: 0 };
          },
          release() {},
        };
      },
      async query() {
        return { rows: [], rowCount: 0 };
      },
      async end() {},
    };

    const { db } = createPostgresAdapterFromPool(fakePool);
    await assert.rejects(
      () =>
        db.transaction(async () => {
          await db.prepare('INSERT INTO users (username) VALUES (?)').run('dup');
        }),
      /duplicate key value/
    );
    assert.equal(attempts, 1);
    await db.close();
  });
});
