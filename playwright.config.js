import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium';
const hasSystemChromium = fs.existsSync(systemChromium);

const PORT = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

const SWIFTSHADER_WEBGL_ARGS = [
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
      `sh -c "test -f dist/index.html || npm run build; PORT=${PORT} node server/start.js"`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 60000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    launchOptions: {
      ...(hasSystemChromium ? { executablePath: systemChromium } : {}),
      args: SWIFTSHADER_WEBGL_ARGS,
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
