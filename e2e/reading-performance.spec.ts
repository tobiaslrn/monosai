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

async function furthestMountedParagraph(page: Page): Promise<number> {
  const positions = await page
    .locator('mn-reader-paragraph p')
    .evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute('data-paragraph-position'))),
    );
  return Math.max(-1, ...positions);
}

test.describe('reader performance at the 50,000-character budget', () => {
  test('mounts only a bounded paragraph window, not all 200 paragraphs', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./#/add');
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

    const dimensions = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(dimensions.documentHeight).toBeGreaterThan(dimensions.viewportHeight * 20);
  });

  test('preserves scroll distance and reaches the final paragraph directly with End', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('./#/add');
    await pasteAndContinue(page, FIXTURE.text);
    await saveAndOpenReader(page);

    const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    let furthestMounted = await furthestMountedParagraph(page);
    let previousScrollY = await page.evaluate(() => window.scrollY);
    for (let gesture = 0; gesture < 8; gesture += 1) {
      await page.evaluate(() => {
        window.scrollBy(0, 300);
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(previousScrollY);
      const nextScrollY = await page.evaluate(() => window.scrollY);
      expect(nextScrollY - previousScrollY).toBeGreaterThan(200);
      previousScrollY = nextScrollY;

      const nextFurthest = await furthestMountedParagraph(page);
      expect(nextFurthest).toBeGreaterThanOrEqual(furthestMounted);
      furthestMounted = nextFurthest;
      expect(await paragraphLocator(page).count()).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
    }

    const beforePageDown = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforePageDown);

    await page.keyboard.press('End');
    await expect(paragraphAtPosition(page, FIXTURE.paragraphCount - 1)).toBeVisible();
    await expect(paragraphAtPosition(page, 0)).not.toBeAttached();
    expect(await paragraphLocator(page).count()).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);

    const finalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(finalHeight).toBeGreaterThan(initialHeight * 0.9);
    expect(finalHeight).toBeLessThan(initialHeight * 1.1);
  });

  test('keeps virtual space usable at large text in Android portrait and landscape @mobile', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('./#/add');
    await pasteAndContinue(page, FIXTURE.text);
    await saveAndOpenReader(page);

    await page.getByRole('button', { name: 'Aids' }).click();
    await page.getByRole('group', { name: 'Reading aids' }).getByLabel('Text size').fill('2.5');
    await page.keyboard.press('Escape');
    await page.keyboard.press('End');
    await expect(paragraphAtPosition(page, FIXTURE.paragraphCount - 1)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    await page.setViewportSize({ width: 851, height: 393 });
    await page.keyboard.press('Home');
    await expect(paragraphAtPosition(page, 0)).toBeVisible();
    await page.keyboard.press('End');
    await expect(paragraphAtPosition(page, FIXTURE.paragraphCount - 1)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    expect(await paragraphLocator(page).count()).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
  });
});
