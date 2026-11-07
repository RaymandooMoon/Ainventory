import express from 'express';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createApiRouter } from './server/api.js';
import { UPLOADS_DIR } from './server/db.js';

function ainventoryBackendPlugin() {
  return {
    name: 'ainventory-backend',
    configureServer(server) {
      const app = express();
      app.use('/api', createApiRouter());
      app.use('/uploads', express.static(UPLOADS_DIR));
      server.middlewares.use(app);
    },
  };
}

export default defineConfig({
  plugins: [react(), ainventoryBackendPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
