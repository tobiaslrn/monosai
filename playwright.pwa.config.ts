import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const PORT = 4300;
const BASE_URL = `http://127.0.0.1:${PORT}/monosai/`;
const PROCESS_ENV = env as Record<string, string | undefined>;
const IS_CI = PROCESS_ENV['CI'] === 'true';
const USE_PREBUILT_DIST = PROCESS_ENV['MONOSAI_PREBUILT_DIST'] === 'true';

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
  workers: IS_CI ? 4 : undefined,
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // The worker, the manifest, and the base path do not vary with the viewport,
  // so this suite runs on one project; `playwright.config.ts` is where the
  // phone-sized journeys live.
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: USE_PREBUILT_DIST ? 'npm run serve-dist' : 'npm run build:pages && npm run serve-dist',
    env: { PORT: String(PORT) },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
