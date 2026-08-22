import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const PORT = 4200;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Chrome is the only officially supported browser family, so both projects use
 * Chromium: a Windows-like desktop viewport with keyboard/mouse and an
 * Android-like mobile viewport with touch.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!env.CI,
  retries: env.CI ? 2 : 0,
  workers: env.CI ? 1 : undefined,
  reporter: env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
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
    command: `npm run start -- --port=${PORT} --host=127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !env.CI,
    timeout: 180_000,
  },
});
