import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const PORT = 4300;
const BASE_URL = `http://127.0.0.1:${PORT}/monosai/`;
const PROCESS_ENV = env as Record<string, string | undefined>;
const IS_CI = PROCESS_ENV.CI === 'true';

/**
 * Exercises the production build through the service worker.
 *
 * `playwright.config.ts` runs `ng serve`, where the worker is disabled by
 * `isDevMode()` — offline reload and installability are unreachable there.
 * This config instead serves the real `pages` build (hashed asset URLs, the
 * worker, the manifest, the /monosai/ base path) through `serve-dist.mjs`,
 * exactly as GitHub Pages would.
 */
export default defineConfig({
  testDir: './e2e-pwa',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run build:pages && npm run serve-dist',
    env: { PORT: String(PORT) },
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 300_000,
  },
});
