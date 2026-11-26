import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiRouter } from './api.js';
import { createCorsMiddleware } from './cors.js';
import db, { ROOT_DIR, UPLOADS_DIR, closeAndFlushDatabase } from './db.js';
import { createJsonGzipMiddleware } from './httpCompression.js';
import { createVtonRouter } from './vtonRouter.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
process.env.ALLOW_PREVIEW_IFRAME ??= '1';
const distDir = path.join(ROOT_DIR, 'dist');
const SESSION_SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true') {
  app.set('trust proxy', 1);
}

const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data: https://api.open-meteo.com https://appleid.apple.com https://staticimgly.com https://cdn.jsdelivr.net",
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
  res.json({ architecture: 'hig-2.5d', version: '2.5.0' });
});

app.use('/api/vton', createVtonRouter());
app.use('/api', createApiRouter());
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.use(
  '/uploads',
  uploadsCorsMiddleware,
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(UPLOADS_DIR, { fallthrough: false })
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
      console.error('[Server] Unhandled API error:', err?.message || err);
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

const sessionSweepTimer = setInterval(() => {
  try {
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  } catch (err) {
    console.warn('[Server] Expired session sweep warning:', err?.message || err);
  }
}, SESSION_SWEEP_INTERVAL_MS);
sessionSweepTimer.unref();

const server = app.listen(PORT, HOST, () => {
  process.stdout.write(`[A inventory 2.5D] Server listening on http://${HOST}:${PORT}\n`);
});
server.keepAliveTimeout = 65000;

let shuttingDown = false;
function handleGracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sessionSweepTimer);
  process.stdout.write(`[A inventory 2.5D] Received ${signal}, flushing database and closing server...\n`);
  server.close(() => {
    closeAndFlushDatabase();
    process.exit(0);
  });
  setTimeout(() => {
    closeAndFlushDatabase();
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
