import { env } from 'node:process';
import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * Playwright launches the Chromium build it pins and no other. A sandbox that
 * ships a different build and blocks the download CDN — Claude Code's cloud
 * environment does both — can therefore run no browser test at all unless it is
 * pointed at the browser it does have.
 *
 * `.claude/hooks/session-start.sh` sets this variable, and only when the pinned
 * build is genuinely missing. Everywhere else, including CI, it is unset and
 * Playwright resolves its own browser as usual.
 */
const executablePath = env['MONOSAI_CHROMIUM_EXECUTABLE'];

export const CHROMIUM_EXECUTABLE_OVERRIDE: PlaywrightTestConfig['use'] = executablePath
  ? { launchOptions: { executablePath } }
  : {};
