import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.resolve(import.meta.dirname, 'site');

export default defineConfig({
  root: rootDir,
  publicDir: path.resolve(rootDir, 'public'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: true,
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
