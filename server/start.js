import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiRouter } from './api.js';
import { createCorsMiddleware } from './cors.js';
import db, { DB_DIALECT, ROOT_DIR, UPLOADS_DIR, closeAndFlushDatabase, storage } from './db.js';
import { createJsonGzipMiddleware } from './httpCompression.js';
import { createVtonRouter } from './vtonRouter.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
process.env.ALLOW_PREVIEW_IFRAME ??= '1';
const distDir = path.join(ROOT_DIR, 'dist');
const SESSION_SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

app.disable('x-powered-by');
if (
  process.env.TRUST_PROXY === '1' ||
  process.env.RENDER === 'true' ||
  Boolean(process.env.K_SERVICE)
) {
  app.set('trust proxy', 1);
}

const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob: https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://accounts.google.com/gsi/",
  "connect-src 'self' blob: data: https://accounts.google.com/gsi/ https://api.open-meteo.com https://appleid.apple.com https://staticimgly.com https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
];

const APP_CSP = [
  ...BASE_CSP_DIRECTIVES,
  process.env.ALLOW_PREVIEW_IFRAME === '1'
    ? ''
    : "frame-ancestors 'self' https://ainvtry.com https://www.ainvtry.com",
]
  .filter(Boolean)
  .join('; ');

const EMBED_APP_CSP = [
  ...BASE_CSP_DIRECTIVES,
  process.env.ALLOW_PREVIEW_IFRAME === '1'
    ? ''
    : "frame-ancestors 'self' https://ainvtry.com https://www.ainvtry.com",
]
  .filter(Boolean)
  .join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const isEmbedAppPath = req.path === '/app.html';
  if (process.env.ALLOW_PREVIEW_IFRAME !== '1' && !isEmbedAppPath) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), camera=(self), microphone=(), accelerometer=(self), gyroscope=(self)'
  );
  if (!req.path.startsWith('/uploads/')) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Content-Security-Policy', isEmbedAppPath ? EMBED_APP_CSP : APP_CSP);
  }
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const apiCorsMiddleware = createCorsMiddleware();
const uploadsCorsMiddleware = createCorsMiddleware({ methods: 'GET, HEAD, OPTIONS' });
app.use('/api', apiCorsMiddleware);
app.use('/api', createJsonGzipMiddleware());

app.get('/api/build-info', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    architecture: 'hig-2.5d',
    version: '2.5.0',
    dbDialect: DB_DIALECT,
    storageMode: storage.mode,
  });
});

app.use('/api/vton', createVtonRouter());
app.use('/api', createApiRouter());
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

function extractUploadAuthToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = String(req.headers.cookie || '');
  const match = cookieHeader.match(/(?:^|;\s*)ainventory_token=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getAllowedClosetsForUpload(userRow) {
  if (!userRow) return [];
  const defaultCloset = String(userRow.default_closet || '').trim();
  if (userRow.role === 'site_demo') return ['sample'];
  if (userRow.role === 'admin') {
    return Array.from(new Set(['husband', 'wife', 'sample', defaultCloset].filter(Boolean)));
  }
  if (defaultCloset === 'husband' || defaultCloset === 'wife') {
    return ['husband', 'wife', 'sample'];
  }
  return Array.from(new Set([defaultCloset, 'sample'].filter(Boolean)));
}

function inferImageContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

app.use(
  '/uploads',
  uploadsCorsMiddleware,
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  storage.mode === 'gcs'
    ? async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.status(405).end();
          return;
        }
        const filename = String(req.path || '').replace(/^\/+/, '');
        if (!/^[a-zA-Z0-9._-]{4,160}$/.test(filename) || filename.includes('..')) {
          res.status(400).type('text/plain').send('Invalid upload filename');
          return;
        }
        const token = extractUploadAuthToken(req);
        if (!token) {
          res.status(401).type('text/plain').send('Authentication required');
          return;
        }
        try {
          const session = await db
            .prepare(`
              SELECT s.expires_at, u.id, u.role, u.default_closet
              FROM sessions s
              JOIN users u ON u.id = s.user_id
              WHERE s.token = ?
            `)
            .get(token);
          if (!session || new Date(session.expires_at) < new Date()) {
            res.status(401).type('text/plain').send('Session expired');
            return;
          }
          const allowedClosets = getAllowedClosetsForUpload(session);
          if (allowedClosets.length === 0) {
            res.status(403).type('text/plain').send('Forbidden');
            return;
          }
          const uploadUrl = `/uploads/${filename}`;
          const placeholders = allowedClosets.map(() => '?').join(', ');
          const ownedGarment = await db
            .prepare(
              `SELECT id FROM garments
               WHERE closet_owner IN (${placeholders})
                 AND (image_url = ? OR back_image_url = ? OR original_front_url = ?)
               LIMIT 1`
            )
            .get(...allowedClosets, uploadUrl, uploadUrl, uploadUrl);
          const ownedCheck = ownedGarment
            ? ownedGarment
            : await db
                .prepare(
                  `SELECT id FROM shopping_checks
                   WHERE closet_owner IN (${placeholders}) AND image_url = ?
                   LIMIT 1`
                )
                .get(...allowedClosets, uploadUrl);

          if (!ownedCheck) {
            res.status(404).type('text/plain').send('Not Found');
            return;
          }

          const buffer = await storage.readUploadBuffer(filename);
          if (!buffer) {
            res.status(404).type('text/plain').send('Not Found');
            return;
          }
          res.setHeader('Content-Type', inferImageContentType(filename));
          res.setHeader('Cache-Control', 'private, max-age=300');
          if (req.method === 'HEAD') {
            res.setHeader('Content-Length', String(buffer.length));
            res.status(200).end();
            return;
          }
          res.status(200).send(buffer);
        } catch (err) {
          next(err);
        }
      }
    : express.static(UPLOADS_DIR, { fallthrough: false })
);

app.use(
  express.static(distDir, {
    etag: true,
    setHeaders: (res, filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('.html') || normalized.endsWith('.webmanifest')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (
        normalized.includes('/assets/') &&
        /-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(normalized)
      ) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (
        normalized.includes('/seed/') ||
        normalized.includes('/models/') ||
        normalized.includes('/textures/') ||
        normalized.includes('/assets/')
      ) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      }
    },
  })
);

app.get('/{*splat}', (req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    if (req.path === '/') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        service: 'ainventory-api',
        mode: 'api-only',
        healthCheck: '/api/build-info',
      });
      return;
    }
    res.status(404).type('text/plain').send('Build output not found. Run npm run build first.');
    return;
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(indexPath);
});

app.use((err, req, res, _next) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (req.path.startsWith('/api')) {
    if (status === 400 && err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: '잘못된 JSON 요청 본문입니다.', code: 'INVALID_JSON' });
      return;
    }
    if (status === 413) {
      res.status(413).json({ error: '요청 본문 크기가 허용 한도를 초과했습니다.', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    if (status >= 500) {
      const errCode = err?.code ? ` code=${err.code}` : '';
      console.error(
        `[Server] Unhandled API error (${req.method} ${req.originalUrl || req.path}${errCode}):`,
        err?.message || err
      );
    }
    res.status(status).json({
      error: status >= 500 ? '서버 내부 오류가 발생했습니다.' : String(err?.message || '요청을 처리할 수 없습니다.'),
    });
    return;
  }
  if (status >= 500) {
    console.error('[Server] Unhandled request error:', err?.message || err);
  }
  res.status(status).type('text/plain').send(status >= 500 ? 'Internal Server Error' : 'Bad Request');
});

const sessionSweepTimer = setInterval(async () => {
  try {
    await db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(new Date().toISOString());
  } catch (err) {
    console.warn('[Server] Expired session sweep warning:', err?.message || err);
  }
}, SESSION_SWEEP_INTERVAL_MS);
sessionSweepTimer.unref();

const server = app.listen(PORT, HOST, () => {
  process.stdout.write(
    `[A inventory 2.5D] Server listening on http://${HOST}:${PORT} (db=${DB_DIALECT}, storage=${storage.mode})\n`
  );
});
server.keepAliveTimeout = 65000;

let shuttingDown = false;
function handleGracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sessionSweepTimer);
  process.stdout.write(`[A inventory 2.5D] Received ${signal}, flushing database and closing server...\n`);
  const finalize = async () => {
    try {
      await closeAndFlushDatabase();
    } catch {
      // best-effort flush
    }
    process.exit(0);
  };
  server.close(() => {
    void finalize();
  });
  setTimeout(() => {
    void finalize();
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
