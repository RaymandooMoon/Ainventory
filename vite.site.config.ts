import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  defineConfig,
  loadEnv,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite';

const repoRoot = path.resolve(import.meta.dirname);
const rootDir = path.resolve(repoRoot, 'site');
const srcDir = path.resolve(repoRoot, 'src');
const rootPublicDir = path.resolve(repoRoot, 'public');
const siteOutDir = path.resolve(repoRoot, 'dist-site');

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
    name: 'ainventory-site-backend',
    configureServer: async (server) => {
      process.env.ALLOW_MOCK_APPLE_AUTH ??= 'true';
      process.env.ALLOW_DEV_OTP_PREVIEW ??= 'true';
      await mountApi(server);
    },
    configurePreviewServer: mountApi,
  };
}

/**
 * Serves root `/public/*` assets (`/seed`, `/models`, `/textures`, `/mediapipe`, `/assets`)
 * for the embedded real live app (`/app.html`) in dev/preview and copies them on site build.
 */
function rootPublicAssetFallbackPlugin(): Plugin {
  const mountStaticFallback = async (server: ViteDevServer | PreviewServer): Promise<void> => {
    server.middlewares.use((req, _res, next) => {
      if (req.url) {
        const [pathname, search] = req.url.split('?');
        if (pathname === '/report' || pathname === '/report/') {
          req.url = `/report/index.html${search ? `?${search}` : ''}`;
        }
      }
      next();
    });
    const { default: express } = await import('express');
    const staticApp = express();
    staticApp.disable('x-powered-by');
    staticApp.use(
      express.static(rootPublicDir, {
        index: false,
        fallthrough: true,
      })
    );
    server.middlewares.use(staticApp);
  };

  const copyDirNonDestructive = (src: string, dest: string): void => {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const from = path.join(src, entry.name);
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirNonDestructive(from, to);
      } else if (!fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
  };

  return {
    name: 'ainventory-root-public-fallback',
    configureServer: mountStaticFallback,
    configurePreviewServer: mountStaticFallback,
    closeBundle() {
      for (const subdir of ['seed', 'models', 'textures', 'mediapipe', 'assets']) {
        copyDirNonDestructive(path.join(rootPublicDir, subdir), path.join(siteOutDir, subdir));
      }
    },
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
    root: rootDir,
    publicDir: path.resolve(rootDir, 'public'),
    plugins: [
      tailwindcss(),
      react(),
      ainventoryBackendPlugin(),
      rootPublicAssetFallbackPlugin(),
    ],
    optimizeDeps: {
      entries: ['site/index.html', 'site/app.html'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'three',
        '@capacitor/core',
        '@capacitor/haptics',
        '@capacitor/app',
      ],
      exclude: ['@imgly/background-removal', 'onnxruntime-web'],
    },
    resolve: {
      alias: [
        {
          find: /^\/src\//,
          replacement: `${srcDir.replace(/\\/g, '/')}/`,
        },
      ],
    },
    server: {
      host: '0.0.0.0',
      port: Number(process.env.SITE_PORT || 3000),
      strictPort: true,
      allowedHosts: true,
      fs: {
        allow: [repoRoot],
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4174,
      allowedHosts: true,
    },
    build: {
      outDir: siteOutDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
          app: path.resolve(rootDir, 'app.html'),
        },
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
