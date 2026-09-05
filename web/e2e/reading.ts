import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared steps for the reading journeys.
 *
 * Every helper works with no Anki connection, no API key, and no network beyond
 * the application's own origin.
 */

export const SAMPLE_TEXT = '吾輩は猫である。名前はまだ無い。\n\nどこで生れたかとんと見当がつかぬ。';

/**
 * Builds a long import at the real 50,000-character budget: one short sentence
 * per paragraph, each carrying a distinct zero-padded marker so a test can
 * assert which paragraphs are mounted without depending on how the tokenizer
 * happens to segment filler text.
 */
export function buildLongImportFixture(paragraphCount = 200): {
  readonly text: string;
  readonly paragraphCount: number;
  readonly characterCount: number;
  readonly markerFor: (index: number) => string;
} {
  const markerFor = (index: number): string => `P${String(index).padStart(3, '0')}`;
  const paragraphs: string[] = [];
  for (let index = 0; index < paragraphCount; index += 1) {
    const marker = markerFor(index);
    const fillerLength = index === 0 ? 245 : 243;
    paragraphs.push(`${marker}${'あ'.repeat(fillerLength)}。`);
  }
  const text = paragraphs.join('\n\n');
  return { text, paragraphCount, characterCount: text.length, markerFor };
}

/** Fills the import form and waits for the direct-save action to be ready. */
export async function pasteAndContinue(page: Page, text: string): Promise<void> {
  await page.getByLabel('Japanese text').fill(text);
  await expect(page.getByRole('button', { name: 'Add story' })).toBeEnabled({
    timeout: 60_000,
  });
}

export async function saveAndOpenReader(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add story' }).click();
  await expect(page).toHaveURL(/#\/reader\//);
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
}

/** Imports one reading and returns to the library. */
export async function importReading(page: Page, text: string, title?: string): Promise<void> {
  await page.goto('./#/add');
  await page.getByLabel('Japanese text').fill(text);
  if (title !== undefined) {
    await page.getByLabel('Title (optional)').fill(title);
  }
  await page.getByRole('button', { name: 'Add story' }).click();
  await expect(page).toHaveURL(/#\/reader\//, { timeout: 60_000 });
}

/** The reader's sentence gesture window, with a small settling allowance. */
const TOUCH_TAP_WINDOW_MS = 300;

/** The width at which the reader is driven by a mouse rather than a finger. */
const DESKTOP_WIDTH_PX = 960;

/**
 * Taps an element with a finger.
 *
 * The word opens on the tap itself; the wait afterwards keeps the next tap out
 * of the sentence gesture window, so consecutive taps stay separate gestures.
 */
export async function tap(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error('nothing to tap: the target has no box');
  }
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(TOUCH_TAP_WINDOW_MS + 25);
}

/** Taps twice within the reader's sentence gesture window. */
export async function doubleTap(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error('nothing to double tap: the target has no box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(x, y);
}

/**
 * Opens a sentence the way the device in use opens one.
 *
 * The two gestures are deliberately different: a mouse clicks prose, while a
 * finger taps twice. A helper keeps every journey that needs an open sentence
 * from having to know which gesture it is running.
 */
export async function openSentence(page: Page, index = 0): Promise<void> {
  const sentence = page.locator('.sentence').nth(index);
  await expect(sentence).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= DESKTOP_WIDTH_PX) {
    await sentence.locator('.token.is-plain').first().click();
  } else {
    await doubleTap(page, sentence);
  }
  await expect(page.locator('mn-sentence-popover')).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(() =>
      page
        .locator('.mn-popover-pane .popover')
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe('none');
}

/** Counts rows in every store a reading owns, to prove a cascade left nothing. */
export async function countOwnedRows(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const request = indexedDB.open('monosai');
        request.onerror = () => {
          reject(new Error('could not open the Monosai database'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const stores = [
            'paragraphs',
            'sentences',
            'tokenAnalyses',
            'frozenValidations',
            'translations',
            'grammarAnalyses',
            'audioAssets',
            'readingProgress',
            'assetJobs',
            'generationProvenance',
            'readings',
          ].filter((name) => db.objectStoreNames.contains(name));
          const transaction = db.transaction(stores, 'readonly');
          const counts: Record<string, number> = {};
          let remaining = stores.length;
          for (const store of stores) {
            const count = transaction.objectStore(store).count();
            count.onsuccess = () => {
              counts[store] = count.result;
              remaining -= 1;
              if (remaining === 0) {
                db.close();
                resolve(counts);
              }
            };
          }
        };
      }),
  );
}

/** Blocks every request leaving the application origin. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}
