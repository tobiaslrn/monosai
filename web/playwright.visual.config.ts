import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import path from 'node:path';
import { env } from 'node:process';
import { VISUAL_STATE } from './e2e-visual/state';
import { CHROMIUM_EXECUTABLE_OVERRIDE } from './playwright.chromium';
import { worktreePorts } from './scripts/worktree-ports.mjs';

const PORT = worktreePorts().visual;
const BASE_URL = `http://127.0.0.1:${PORT}/monosai/`;
const PROCESS_ENV = env as Record<string, string | undefined>;
const IS_CI = PROCESS_ENV['CI'] === 'true';
const USE_PREBUILT_DIST = PROCESS_ENV['MONOSAI_PREBUILT_DIST'] === 'true';

/**
 * The screenshot baselines of the primitive gallery (`#/gallery`).
 *
 * It serves the `gallery` build, never the shipped one, and compares each
 * gallery page, and each overlay open, with the PNGs in
 * `e2e-visual/__screenshots__/`. Those are drawn in the pinned Playwright image
 * (`npm run visual` runs there through Docker; CI runs inside it), because the
 * same page rasterises differently on another machine's fonts. Only the
 * owner-triggered `visual-baselines` workflow writes them.
 *
 * Motion is reduced and animations are finished before every capture, and
 * `fonts.conf` fixes which faces draw the text, so two runs of one image are
 * identical to the pixel.
 */
const sharedUse: PlaywrightTestConfig['use'] = {
  baseURL: BASE_URL,
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
  launchOptions: {
    ...CHROMIUM_EXECUTABLE_OVERRIDE?.launchOptions,
    env: { ...PROCESS_ENV, FONTCONFIG_FILE: path.resolve('e2e-visual/fonts.conf') },
  },
};

const lanes = [
  {
    name: 'desktop',
    device: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
  { name: 'android', device: devices['Pixel 5'] },
] as const;
const themes = ['light', 'dark'] as const;

export default defineConfig({
  testDir: './e2e-visual',
  // One folder per project and nothing platform-specific in the name: the
  // baselines come from one image, so a suffix could only ever be wrong.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  outputDir: 'test-results/visual',
  fullyParallel: true,
  forbidOnly: IS_CI,
  // A capture is retried until two in a row agree; a test retry would only
  // hide a page that does not settle.
  retries: 0,
  ...(IS_CI ? { workers: 4 } : {}),
  reporter: IS_CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/visual' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/visual' }]],
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: sharedUse,
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...sharedUse, ...devices['Desktop Chrome'] },
    },
    ...lanes.flatMap((lane) =>
      themes.map((theme) => ({
        name: `${lane.name}-${theme}`,
        testIgnore: /.*\.setup\.ts/,
        dependencies: ['setup'],
        use: { ...sharedUse, ...lane.device, colorScheme: theme, storageState: VISUAL_STATE },
      })),
    ),
  ],
  webServer: {
    command: USE_PREBUILT_DIST
      ? 'npm run serve-dist'
      : 'node scripts/build-if-stale.mjs --gallery && npm run serve-dist',
    env: { PORT: String(PORT), DIST_DIR: 'dist/gallery/browser' },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
