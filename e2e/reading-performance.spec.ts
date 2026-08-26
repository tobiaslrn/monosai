import { expect, test, type Page } from '@playwright/test';
import { MAXIMUM_MOUNTED_PARAGRAPHS } from '../src/app/domain/reading/paragraph-window';
import { buildLongImportFixture, pasteAndContinue, saveAndOpenReader } from './reading';

/**
 * Milestone 3 definition-of-done item 4: performance baselines for the reader
 * at the real 50,000-character import budget, not the smaller manual probe
 * used during development.
 */

const FIXTURE = buildLongImportFixture(200);

function paragraphLocator(page: Page) {
  return page.locator('mn-reader-paragraph');
}

/** Paragraphs are identifiable by their stable source position, not their text. */
function paragraphAtPosition(page: Page, position: number) {
  return page.locator(`mn-reader-paragraph p[data-paragraph-position="${String(position)}"]`);
}

test.describe('reader performance at the 50,000-character budget', () => {
  test('mounts only a bounded paragraph window, not all 200 paragraphs', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/#/add');
    await pasteAndContinue(page, FIXTURE.text);

    await saveAndOpenReader(page);

    const mounted = await paragraphLocator(page).count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
    expect(mounted).toBeLessThan(FIXTURE.paragraphCount);

    // Opened at the beginning, so paragraph 0 is mounted and a late one, far
    // past the window, is not.
    await expect(paragraphAtPosition(page, 0)).toBeVisible();
    await expect(paragraphAtPosition(page, 199)).not.toBeAttached();
  });

  test('extends the window while scrolling and keeps it moving rather than growing without limit', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/#/add');
    await pasteAndContinue(page, FIXTURE.text);
    await saveAndOpenReader(page);

    // Repeatedly scroll further down. Each step lets the bottom sentinel
    // intersect and the store extend the window. Progress is tracked by the
    // furthest mounted paragraph position, not document height: once the
    // window is saturated at its bound, trimming the far side and mounting the
    // near side keep total height roughly constant even though the window
    // keeps sliding forward, so height alone would look like it had stalled.
    let furthestMounted = -1;
    for (let step = 0; step < 120 && furthestMounted < FIXTURE.paragraphCount - 1; step += 1) {
      // `window.scrollBy` rather than a mouse wheel, so this works the same
      // way under touch emulation on the Android project.
      await page.evaluate(() => {
        window.scrollBy(0, 4_000);
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              resolve();
            }),
          );
        });
      });

      const mounted = await paragraphLocator(page).count();
      expect(mounted).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);

      const positions = await page
        .locator('mn-reader-paragraph p')
        .evaluateAll((elements) =>
          elements.map((element) => Number(element.getAttribute('data-paragraph-position'))),
        );
      furthestMounted = Math.max(furthestMounted, ...positions);
    }

    // Having scrolled through the whole reading, the last paragraph was
    // reached and paragraph 0 is gone: the window moved forward instead of
    // growing without limit.
    expect(furthestMounted).toBe(FIXTURE.paragraphCount - 1);
    await expect(paragraphAtPosition(page, FIXTURE.paragraphCount - 1)).toBeVisible();
    await expect(paragraphAtPosition(page, 0)).not.toBeAttached();
    expect(await paragraphLocator(page).count()).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
  });
});
