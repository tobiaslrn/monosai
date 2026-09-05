import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';
import { INTRO_SEEN_STATE } from './e2e/state';

// Not 4200: `ng serve` owns that port, and the suite must never silently run
// against a development server someone left running.
const PORT = 4210;
// The production build bakes `<base href="/monosai/">` into index.html, so it
// can only be served from that path. Every `page.goto` is relative to this.
const BASE_URL = `http://127.0.0.1:${PORT}/monosai/`;
const PROCESS_ENV = env as Record<string, string | undefined>;
const IS_CI = PROCESS_ENV['CI'] === 'true';
const USE_PREBUILT_DIST = PROCESS_ENV['MONOSAI_PREBUILT_DIST'] === 'true';

/**
 * Chrome is the only officially supported browser family, so both projects use
 * Chromium: a Windows-like desktop viewport with keyboard/mouse and an
 * Android-like mobile viewport with touch.
 *
 * The desktop project runs every journey. The mobile project runs the ones
 * whose behavior actually differs on a phone — touch gestures, docked sheets,
 * narrow layouts, and the accessibility sweeps — tagged `@mobile`. Running the
 * whole suite twice cost more than an hour of machine time per run without
 * covering anything the desktop project had not already covered.
 *
 * The suite runs against the real `pages` build rather than `ng serve`: every
 * test starts with an empty browser cache, and the development bundles are
 * around 60MB across 76 requests per test against 1.4MB across 15.
 *
 * It is the same artifact that `e2e-pwa` and the deployment consume. The only
 * difference is that service workers are blocked here (see `use` below), so
 * this suite and the PWA suite together cover the shipped bundle with the
 * worker both dormant and live.
 */
export default defineConfig({
  testDir: './e2e',
  // The default command is the task/PR feedback lane. `npm run e2e:full`
  // overrides this grep and runs the complete browser regression suite.
  grep: /@smoke/,
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 4 : undefined,
  reporter: IS_CI ? [['blob'], ['github']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // The shipped bundle registers `ngsw-worker.js`. Letting it install would
    // put an asynchronous cache and an update lifecycle underneath 150-odd
    // journeys that are not about either. `e2e-pwa` covers the worker itself.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'desktop-chrome',
      testIgnore: /.*\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: INTRO_SEEN_STATE,
      },
    },
    {
      name: 'android-chrome',
      testIgnore: /.*\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'], storageState: INTRO_SEEN_STATE },
      grep: /(?=.*@mobile)(?=.*@smoke)/,
    },
  ],
  webServer: {
    command: USE_PREBUILT_DIST ? 'npm run serve-dist' : 'npm run build:pages && npm run serve-dist',
    env: { PORT: String(PORT) },
    url: BASE_URL,
    // A reused server would serve whatever was built last, which is the wrong
    // application as soon as anything under `src` changes.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
