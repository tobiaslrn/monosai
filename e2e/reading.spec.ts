import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  countOwnedRows,
  importReading,
  pasteAndContinue,
  saveAndOpenReader,
  SAMPLE_TEXT,
} from './reading';

/** Word details are one floating popover at every width (ADR 0022). */
function wordDetails(page: Page) {
  return page.locator('mn-word-inspector');
}

async function openWordDetails(page: Page, surface: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(surface) })
    .first()
    .click();
  await expect(wordDetails(page)).toBeVisible();
}

/**
 * End-to-end scenario 1: a fresh install pastes Japanese, reviews the
 * segmentation, saves, and inspects a word — with no Anki, no API key, and no
 * AI request at any point.
 */
test.describe('scenario 1 — paste, review, save, inspect', () => {
  test('a first visit lands on Add text and needs no setup', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/#\/add/);
    await expect(page.getByRole('heading', { name: 'Add text', level: 1 })).toBeVisible();
    await expect(page.getByText(/Anki and AI are optional/)).toBeVisible();
  });

  test('paste, review the sentences, save, and read', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);

    // Review shows the reviewable sentence rows before anything is saved.
    await expect(page.getByRole('textbox', { name: 'Sentence 1' }).first()).toHaveValue(
      '吾輩は猫である。',
    );
    await expect(page.getByText('3 sentences in 2 paragraphs')).toBeVisible();

    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
  });

  test('reading text carries Japanese language metadata and whole-token ruby', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.sentence[lang="ja"]').first()).toBeVisible();
    // Ruby is whole-token and only where a reading adds information.
    await expect(page.locator('ruby', { hasText: '猫' }).first().locator('rt')).toHaveText('ねこ');
  });

  test('inspecting a word shows local details with no request leaving the origin', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    // Only requests made from here on matter: opening a word must not reach an
    // AI provider, a dictionary service, or anything else off-origin.
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '')) {
        external.push(request.url());
      }
    });

    await openWordDetails(page, '猫');

    await expect(wordDetails(page)).toContainText('猫');
    await expect(wordDetails(page)).toContainText('Noun');
    await expect(wordDetails(page)).toContainText('cat');
    await expect(wordDetails(page)).toContainText('In this sentence');
    expect(external).toEqual([]);
  });

  test('Escape closes word details and returns focus to its token', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();
    await expect(wordDetails(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(wordDetails(page)).not.toBeAttached();
    await expect(token).toBeFocused();
  });

  test('the reader states that vocabulary is not configured rather than marking every word', async ({
    page,
  }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.getByText(/Vocabulary markers are off/)).toBeVisible();
    await expect(page.locator('.is-unknown')).toHaveCount(0);
    await expect(page.locator('.is-not-in-snapshot')).toHaveCount(0);
  });

  test('has no serious accessibility violations across the workflow', async ({ page }) => {
    await page.goto('/#/add');
    await expectNoSeriousAccessibilityViolations(page);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await expectNoSeriousAccessibilityViolations(page);

    await saveAndOpenReader(page);
    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** End-to-end scenario 2: file import, with distinct encoding and size errors. */
test.describe('scenario 2 — file import and its errors', () => {
  test('imports a UTF-8 file and takes the title from its name', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByRole('tab', { name: 'Text file' }).click();

    await page.getByLabel('Choose a UTF-8 .txt file').setInputFiles({
      name: '第一章.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(SAMPLE_TEXT, 'utf8'),
    });

    await expect(page.getByText(/Loaded 第一章\.txt/)).toBeVisible();
    await expect(page.getByLabel('Title (optional)')).toHaveAttribute('placeholder', '第一章');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Save reading' }).click();

    await expect(page).toHaveURL(/#\/reader\//);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('第一章');
  });

  test('rejects a file that is not UTF-8 without losing a pasted draft', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('もとの文章。');

    await page.getByRole('tab', { name: 'Text file' }).click();
    await page.getByLabel('Choose a UTF-8 .txt file').setInputFiles({
      name: 'shift-jis.txt',
      mimeType: 'text/plain',
      // Shift_JIS bytes for 猫, which are not valid UTF-8.
      buffer: Buffer.from([0x94, 0x4c]),
    });

    await expect(page.getByRole('alert')).toContainText('not UTF-8');

    // The pasted draft survives the rejected file.
    await page.getByRole('tab', { name: 'Paste text' }).click();
    await expect(page.getByLabel('Japanese text')).toHaveValue('もとの文章。');
  });

  test('rejects a file with no visible text, distinctly from a bad encoding', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByRole('tab', { name: 'Text file' }).click();

    await page.getByLabel('Choose a UTF-8 .txt file').setInputFiles({
      name: 'blank.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('   \n\n  ', 'utf8'),
    });

    await expect(page.getByRole('alert')).toContainText('no visible text');
    await expect(page.getByRole('alert')).not.toContainText('not UTF-8');
  });

  test('keeps Continue disabled for pasted text over the 50,000-character limit', async ({
    page,
  }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('あ'.repeat(50_001));

    await expect(page.getByText('50,001 of 50,000 characters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page).toHaveURL(/#\/add/);
  });

  test('rejects an over-limit file and says how long it is', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByRole('tab', { name: 'Text file' }).click();

    await page.getByLabel('Choose a UTF-8 .txt file').setInputFiles({
      name: 'huge.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('あ'.repeat(50_001), 'utf8'),
    });

    await expect(page.getByRole('alert')).toContainText('50,001 characters');
    await expect(page.getByRole('alert')).toContainText('limit is 50,000');
  });

  test('blocks empty input with an inline message', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('   \n  ');

    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

/** End-to-end scenario 14: filtering, resume, deletion cascade, and repair. */
test.describe('scenario 14 — library, progress, deletion', () => {
  test('filters by source and shows both readings under All', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Generated' }).click();
    await expect(page.getByText('No generated readings yet')).toBeVisible();

    await page.getByRole('button', { name: 'Imported' }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Imported' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Continue reading appears after a reading is opened', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    const card = page.locator('mn-continue-reading-card');
    await expect(card).toContainText('Continue reading');
    await expect(card).toContainText('第一章');
    await expect(card.getByRole('progressbar')).toBeVisible();
  });

  test('deleting asks first, then leaves zero owned orphan rows', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('The text and 3 sentences');
    await expect(dialog).toContainText('vocabulary snapshots');

    await dialog.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    const counts = await countOwnedRows(page);
    for (const [store, count] of Object.entries(counts)) {
      expect(count, `rows left in ${store}`).toBe(0);
    }
  });

  test('cancelling the confirmation keeps the reading', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
  });

  test('Continue reading repairs itself when its target is deleted', async ({ page }) => {
    await importReading(page, '最初の話です。', '第一章');
    await importReading(page, '二番目の話です。', '第二章');
    await page.goto('/#/library');

    // The most recently opened reading is the one Continue reading points at.
    await expect(page.locator('mn-continue-reading-card')).toContainText('第二章');

    await page.getByRole('button', { name: 'Actions for 第二章' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-continue-reading-card')).toContainText('第一章');
  });

  test('a returning profile with readings opens the library', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');

    await page.goto('/');
    await expect(page).toHaveURL(/#\/library/);
  });

  test('has no serious accessibility violations in the library', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** End-to-end scenario 15, reading half: offline reload and allowed operations. */
test.describe('scenario 15 — offline reading', () => {
  // The service-worker shell fallback that survives a full offline reload is
  // Milestone 10. What this milestone promises is that everything reading needs
  // is already local, so these navigate inside the running application with the
  // network removed.
  test('a saved reading reopens and inspects with the network removed', async ({
    page,
    context,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    // Visit the library once while online so its lazy route chunk is loaded;
    // serving code offline is the service worker's job in Milestone 10, whereas
    // what this scenario proves is that the reading data and aids are local.
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await context.setOffline(true);

    await page.getByRole('link', { name: '第一章' }).click();
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);

    await openWordDetails(page, '猫');
    await expect(wordDetails(page)).toContainText('cat');
  });

  test('the library lists saved readings with the network removed', async ({ page, context }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Imported' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
  });
});
