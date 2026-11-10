import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Waits for a docked sheet to finish rising from the edge it docks to.
 *
 * A sheet is measured and dragged where it comes to rest. While it is still
 * arriving its box is one frame of that slide rather than where it will sit,
 * and a press aimed at its handle lands wherever the handle has got to.
 */
export async function expectSheetAtRest(sheet: Locator): Promise<void> {
  // A floating overlay on a wide viewport, anchored or centred, carries no transform at all.
  await expect(sheet).toHaveCSS('transform', /^(matrix\(1, 0, 0, 1, 0, 0\)|none)$/);
}

/**
 * Waits until nothing on the page is still moving in time: an overlay arriving,
 * a fold opening, a step sliding in. A box measured mid-way is one frame of the
 * movement rather than where the thing will sit. Scroll-driven animations (a
 * top bar's edge) run for as long as the page exists and are not waited for.
 */
export async function expectMotionSettled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(animation.timeline instanceof DocumentTimeline) || animation.playState !== 'running',
      ),
  );
}
