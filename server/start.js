import express from 'express';
import path from 'node:path';
import { createApiRouter } from './api.js';
import { ROOT_DIR, UPLOADS_DIR } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const distDir = path.join(ROOT_DIR, 'dist');

app.use('/api', createApiRouter());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(distDir));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`[A inventory] Server listening on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
