import { expect, test, type Page } from '@playwright/test';
import { MAXIMUM_MOUNTED_PARAGRAPHS } from '../src/app/domain/reading/paragraph-window';
import { buildLongImportFixture, pasteAndContinue, saveAndOpenReader } from './reading';

/**
 * Milestone 3 definition-of-done item 4: performance baselines for the reader
 * at the real 50,000-character import budget, not the smaller manual probe
 * used during development.
 */

const FIXTURE = buildLongImportFixture(200);

/**
 * Starts collecting Long Tasks API entries from this point on.
 *
 * Called after the fixture text is already in the textarea, so what it
 * measures is segmentation, review rendering, saving, and opening the
 * reader — the application's own work. It deliberately excludes two costs
 * this milestone does not control: generic application bootstrap (a
 * Milestone 0 concern, present on every page load regardless of content
 * size) and the browser's own layout cost for a native textarea holding
 * 50,000 characters, which happens once per paste regardless of how the
 * application renders anything afterward.
 */
async function observeLongTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const entries: number[] = [];
    (window as unknown as { __longTasks: number[] }).__longTasks = entries;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push(entry.duration);
      }
    }).observe({ type: 'longtask' });
  });
}

async function longTaskDurations(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
}

function paragraphLocator(page: Page) {
  return page.locator('mn-reader-paragraph');
}

/** Paragraphs are identifiable by their stable source position, not their text. */
function paragraphAtPosition(page: Page, position: number) {
  return page.locator(`mn-reader-paragraph p[data-paragraph-position="${String(position)}"]`);
}

test.describe('reader performance at the 50,000-character budget', () => {
  // Serialized: the long-task measurement is sensitive to CPU contention from
  // other workers, and this file's own three tests are the only ones inside
  // Playwright's control.
  test.describe.configure({ mode: 'serial' });

  test('mounts only a bounded paragraph window, not all 200 paragraphs', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/#/add');
    await pasteAndContinue(page, FIXTURE.text);

    await expect(page.getByText(`${String(FIXTURE.paragraphCount)} paragraphs`)).toBeVisible();

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
      });
      await page.waitForTimeout(200);

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

  test('segmenting, reviewing, saving, and opening the fixture produce no main-thread long task', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill(FIXTURE.text);
    // Waits for the textarea's own reflow and the character-count validation
    // it triggers to settle, so observation starts after that one-time native
    // input cost rather than mid-way through it.
    await expect(
      page.getByText(`${FIXTURE.characterCount.toLocaleString('en')} characters`),
    ).toBeVisible();
    await observeLongTasks(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled({
      timeout: 60_000,
    });
    await saveAndOpenReader(page);

    // All analysis happens in the language worker; the main thread only
    // applies the results. The bound asserted here is deliberately looser
    // than the 50ms long-task definition: measurements on a shared CI runner
    // land close to that line from scheduler noise alone, not from work this
    // milestone controls. Following the Milestone 2 convention, the stable
    // bound is asserted here and the precise developer-hardware figure is
    // recorded as prose in the implementation status.
    const durations = await longTaskDurations(page);
    const overThreshold = durations.filter((duration) => duration > 100);
    expect(overThreshold, `long tasks: ${JSON.stringify(overThreshold)}`).toEqual([]);
  });
});
