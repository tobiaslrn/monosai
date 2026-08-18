import { expect, type Page } from '@playwright/test';

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

/** Waits for the language bundle, which import needs but navigation never does. */
export async function pasteAndContinue(page: Page, text: string): Promise<void> {
  await page.getByLabel('Japanese text').fill(text);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled({
    timeout: 60_000,
  });
}

export async function saveAndOpenReader(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save reading' }).click();
  await expect(page).toHaveURL(/#\/reader\//);
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
}

/** Imports one reading and returns to the library. */
export async function importReading(page: Page, text: string, title?: string): Promise<void> {
  await page.goto('/#/add');
  await page.getByLabel('Japanese text').fill(text);
  if (title !== undefined) {
    await page.getByLabel('Title (optional)').fill(title);
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Save reading' }).click();
  await expect(page).toHaveURL(/#\/reader\//);
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
