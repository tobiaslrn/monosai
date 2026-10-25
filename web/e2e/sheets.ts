import { expect, type Locator } from '@playwright/test';

/**
 * Waits for a docked sheet to finish rising from the edge it docks to.
 *
 * A sheet is measured and dragged where it comes to rest. While it is still
 * arriving its box is one frame of that slide rather than where it will sit,
 * and a press aimed at its handle lands wherever the handle has got to.
 */
export async function expectSheetAtRest(sheet: Locator): Promise<void> {
  // An anchored panel on a wide viewport carries no transform at all.
  await expect(sheet).toHaveCSS('transform', /^(matrix\(1, 0, 0, 1, 0, 0\)|none)$/);
}
