import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.resolve(import.meta.dirname, 'site');
const srcDir = path.resolve(import.meta.dirname, 'src');

export default defineConfig({
  root: rootDir,
  publicDir: path.resolve(rootDir, 'public'),
  plugins: [react()],
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
      allow: [path.resolve(import.meta.dirname)],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    allowedHosts: true,
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-site'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: path.resolve(rootDir, 'index.html'),
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
          if (normId.includes('node_modules/three/')) {
            return 'vendor-three';
          }
          return undefined;
        },
      },
    },
  },
});
