import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiRouter } from './api.js';
import { ROOT_DIR, UPLOADS_DIR } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const distDir = path.join(ROOT_DIR, 'dist');

app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (process.env.ALLOW_PREVIEW_IFRAME !== '1') {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api', createApiRouter());
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(UPLOADS_DIR, { fallthrough: false })
);

app.use(express.static(distDir));

app.get('/{*splat}', (_req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.status(404).type('text/plain').send('Build output not found. Run npm run build first.');
    return;
  }
  res.sendFile(indexPath);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[A inventory] Server listening on http://${HOST}:${PORT}`);
});
server.keepAliveTimeout = 65000;
