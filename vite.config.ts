import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';

function ainventoryBackendPlugin(): Plugin {
  const mountApi = async (server: ViteDevServer | PreviewServer): Promise<void> => {
    const [{ default: express }, { createApiRouter }, { UPLOADS_DIR }] = await Promise.all([
      import('express'),
      import('./server/api.js'),
      import('./server/db.js'),
    ]);
    const app = express();
    app.use('/api', createApiRouter());
    app.use('/uploads', express.static(UPLOADS_DIR));
    server.middlewares.use(app);
  };

  return {
    name: 'ainventory-backend',
    configureServer: mountApi,
    configurePreviewServer: mountApi,
  };
}

export default defineConfig({
  plugins: [react(), ainventoryBackendPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['localhost', '127.0.0.1'],
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          const normId = id.replace(/\\/g, '/');
          if (
            normId.includes('node_modules/react/') ||
            normId.includes('node_modules/react-dom/') ||
            normId.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
