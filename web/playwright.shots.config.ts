import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';
import { SHOTS_STATE } from './e2e-shots/shots';
import { CHROMIUM_EXECUTABLE_OVERRIDE } from './playwright.chromium';
import { worktreePorts } from './scripts/worktree-ports.mjs';

const PORT = worktreePorts().shots;
const BASE_URL = `http://127.0.0.1:${PORT}/monosai/`;
const PROCESS_ENV = env as Record<string, string | undefined>;
const USE_PREBUILT_DIST = PROCESS_ENV['MONOSAI_PREBUILT_DIST'] === 'true';

/**
 * Screenshots of the real application, for judging a visual change by eye.
 *
 * Each test in `e2e-shots/` is one named scenario: a route, the data it needs,
 * and the overlay it opens. Every scenario is captured on a desktop and an
 * Android-sized phone, each in light and dark, to
 * `test-results/shots/<scenario>/<project>.png` (or under `MONOSAI_SHOTS_DIR`),
 * and `npm run shots:sheet` lays them out on one page. Nothing is compared:
 * these are for looking at, before and after a change.
 *
 *   npm run shots -- --grep story-options
 *
 * It runs the same `pages` build as the browser suite, on a port of its own.
 */
export default defineConfig({
  testDir: './e2e-shots',
  // Not `test-results` itself: Playwright empties its output folder on every
  // run, and the captures of other scenarios must survive this one.
  outputDir: 'test-results/shots-runs',
  fullyParallel: true,
  retries: 0,
  // A scenario may import readings, which waits on the tokenizer.
  timeout: 120_000,
  reporter: [['list']],
  use: {
    ...CHROMIUM_EXECUTABLE_OVERRIDE,
    baseURL: BASE_URL,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    ...(['light', 'dark'] as const).flatMap((theme) => [
      {
        name: `desktop-${theme}`,
        testIgnore: /.*\.setup\.ts/,
        dependencies: ['setup'],
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1440, height: 900 },
          colorScheme: theme,
          storageState: SHOTS_STATE,
        },
      },
      {
        name: `android-${theme}`,
        testIgnore: /.*\.setup\.ts/,
        dependencies: ['setup'],
        use: { ...devices['Pixel 5'], colorScheme: theme, storageState: SHOTS_STATE },
      },
    ]),
  ],
  webServer: {
    command: USE_PREBUILT_DIST
      ? 'npm run serve-dist'
      : 'node scripts/build-if-stale.mjs && npm run serve-dist',
    env: { PORT: String(PORT) },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
