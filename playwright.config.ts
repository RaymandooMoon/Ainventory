import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium: string = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium';
const hasSystemChromium: boolean = fs.existsSync(systemChromium);
const useHeadlessSwiftShader: boolean =
  hasSystemChromium || Boolean(process.env.CI) || process.platform === 'linux';

const PORT: number = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 4173);
const BASE_URL: string = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

const SWIFTSHADER_WEBGL_ARGS: string[] = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--ignore-certificate-errors',
  '--enable-webgl',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 75000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  webServer: {
    command:
      process.env.PLAYWRIGHT_WEB_COMMAND ||
      `node -e "const fs=require('node:fs'),cp=require('node:child_process');if(!fs.existsSync('dist/index.html'))cp.execSync('npm run build',{stdio:'inherit'});" && node server/start.js`,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 60000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    launchOptions: {
      ...(hasSystemChromium ? { executablePath: systemChromium } : {}),
      args: useHeadlessSwiftShader
        ? SWIFTSHADER_WEBGL_ARGS
        : ['--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'ios-notch',
      use: {
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      },
    },
    {
      name: 'android-foldable',
      use: {
        viewport: { width: 717, height: 841 },
        deviceScaleFactor: 2.6,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
});
