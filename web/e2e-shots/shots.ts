import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expectMotionSettled } from '../e2e/sheets';

/** Where the setup leaves a browser that has answered the first-use notices. */
export const SHOTS_STATE = path.join(process.cwd(), 'playwright', '.auth', 'shots-first-use.json');

/** The folder the captures go to; `MONOSAI_SHOTS_DIR` keeps a "before" set apart. */
export const SHOTS_DIR = path.resolve(process.env['MONOSAI_SHOTS_DIR'] ?? 'test-results/shots');

/**
 * Captures the page as it stands once nothing moves, to
 * `<SHOTS_DIR>/<scenario>/<project>.png`. A page is captured whole; with an
 * overlay open, the screen is, since the overlay is what the scenario is about.
 */
export async function capture(
  page: Page,
  testInfo: TestInfo,
  scenario: string,
  options: { readonly overlay?: boolean } = {},
): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await expectMotionSettled(page);
  await page.screenshot({
    path: path.join(SHOTS_DIR, scenario, `${testInfo.project.name}.png`),
    fullPage: options.overlay !== true,
    animations: 'disabled',
    caret: 'hide',
    // One pixel per CSS pixel: a phone capture at its device ratio is three times the size to read.
    scale: 'css',
  });
}
