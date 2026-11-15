import react from '@vitejs/plugin-react';
import {
  defineConfig,
  loadEnv,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite';

function ainventoryBackendPlugin(): Plugin {
  const mountApi = async (server: ViteDevServer | PreviewServer): Promise<void> => {
    const [{ default: express }, { createApiRouter }, { createVtonRouter }, { UPLOADS_DIR }] =
      await Promise.all([
        import('express'),
        import('./server/api.js'),
        import('./server/vtonRouter.js'),
        import('./server/db.js'),
      ]);
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/build-info', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ architecture: 'hig-2.5d', version: '2.5.0' });
    });
    app.use('/api/vton', createVtonRouter());
    app.use('/api', createApiRouter());
    app.use('/uploads', express.static(UPLOADS_DIR));
    server.middlewares.use(app);
  };

  return {
    name: 'ainventory-backend',
    configureServer: async (server) => {
      process.env.ALLOW_MOCK_APPLE_AUTH ??= 'true';
      process.env.ALLOW_DEV_OTP_PREVIEW ??= 'true';
      await mountApi(server);
    },
    configurePreviewServer: mountApi,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, val] of Object.entries(env)) {
    if (process.env[key] === undefined && typeof val === 'string' && val.trim()) {
      process.env[key] = val.trim();
    }
  }

  return {
    plugins: [react(), ainventoryBackendPlugin()],
    optimizeDeps: {
      exclude: ['@imgly/background-removal', 'onnxruntime-web'],
    },
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
      chunkSizeWarningLimit: 1200,
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
            if (normId.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (
              normId.includes('node_modules/@imgly/') ||
              normId.includes('node_modules/onnxruntime-web/')
            ) {
              return 'vendor-imgly';
            }
            if (normId.includes('node_modules/@mediapipe/')) {
              return 'vendor-mediapipe';
            }
            if (normId.includes('node_modules/three/')) {
              return 'vendor-three';
            }
            return undefined;
          },
        },
      },
    },
  };
});
