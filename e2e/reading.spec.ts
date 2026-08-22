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
  /**
   * An empty library is the first screen, not a form nobody asked for. It says
   * one line and offers the one button that fills it.
   */
  test('a first visit lands on an empty library and needs no setup', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/#\/library/);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New reading' })).toBeVisible();
  });

  test('New reading offers both ways in, and Paste text reaches the reader', async ({ page }) => {
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'New reading' }).click();
    const chooser = page.getByRole('dialog', { name: 'New reading' });
    await expect(chooser.getByRole('link', { name: 'Paste text' })).toBeVisible();
    await expect(chooser.getByRole('link', { name: 'Write with AI' })).toBeVisible();

    await chooser.getByRole('link', { name: 'Paste text' }).click();
    await expect(page).toHaveURL(/#\/add/);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
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
    await expect(wordDetails(page)).toContainText('cat');
    // The compact form summary keeps the dictionary facts visible even when
    // the word is already uninflected, while omitting a useless form line.
    await expect(wordDetails(page).locator('.dictionary-form')).toHaveText('猫');
    await expect(wordDetails(page).locator('.part-of-speech')).toHaveText('noun');
    await expect(wordDetails(page).locator('.form-line')).toHaveCount(0);
    // The sentence is not repeated here: the learner is looking at it.
    await expect(wordDetails(page)).not.toContainText('In this sentence');
    expect(external).toEqual([]);
  });

  test('anchors word details beside the word at every viewport', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();
    await expect(wordDetails(page)).toBeVisible();

    const pane = page.locator('.mn-popover-pane');
    await expect(pane).not.toHaveClass(/is-sheet/);

    const viewport = page.viewportSize();
    const tokenBox = await token.boundingBox();
    const cardBox = await pane.locator('.popover').boundingBox();
    expect(tokenBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(cardBox?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect(cardBox?.width ?? 0).toBeLessThan(viewport?.width ?? 0);

    const gapBelow = (cardBox?.y ?? 0) - ((tokenBox?.y ?? 0) + (tokenBox?.height ?? 0));
    const gapAbove = (tokenBox?.y ?? 0) - ((cardBox?.y ?? 0) + (cardBox?.height ?? 0));
    expect(Math.min(Math.abs(gapBelow), Math.abs(gapAbove))).toBeLessThan(40);
  });

  test('an inflected word is a compact lookup with no derivation controls', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, '僕には分からなかった。昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '分から');
    const details = wordDetails(page);

    await expect(details.locator('.surface')).toHaveText('分からなかった');
    await expect(details.locator('.reading')).toHaveText('わからなかった');
    await expect(details.locator('.dictionary-form')).toHaveText('分かる');
    await expect(details.locator('.part-of-speech')).toHaveText('verb');
    await expect(details.locator('.form-line')).toHaveText('Plain · negative · past');
    await expect(details.locator('.derivation, .step, .detail, .tinted')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('a polite negative past keeps only the high-level form labels', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, '昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '行き');
    const details = wordDetails(page);

    await expect(details.locator('.form-line')).toHaveText('Polite · negative · past');
    await expect(details).not.toContainText('行きませんです');
    await expect(details.locator('.derivation, .step, .detail')).toHaveCount(0);
  });

  test('reaches More from the keyboard and expands all dictionary meanings', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, '昨日は行く。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '行く');
    const details = wordDetails(page);
    const more = details.getByRole('button', { name: /^More/ });

    await expect(more).toBeVisible();
    await more.focus();
    await expect(more).toBeFocused();
    await more.press('Enter');

    await expect(details.locator('.more')).toHaveCount(0);
    await expect(details.locator('.glosses li').first()).toBeVisible();
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

  /**
   * With no Anki vocabulary set up there is nothing to mark, and the reader
   * says so by marking nothing. It used to print a notice above every reading
   * that could not be dismissed, which cost four lines on a phone to repeat
   * what the absence of underlines already said.
   */
  test('marks no words when vocabulary is not configured, and says nothing about it', async ({
    page,
  }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.is-warning-vocabulary')).toHaveCount(0);
    await expect(page.getByText(/Vocabulary markers are off/)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(/Anki/)).toHaveCount(0);
  });

  test('the reading surface is Japanese, with no controls printed on it', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    // Every button inside the text is a word. A sentence is reached by pressing
    // it, so nothing is printed for one.
    const buttons = page.locator('article.text button');
    expect(await buttons.count()).toBeGreaterThan(0);
    expect(await page.locator('article.text button:not(.token)').count()).toBe(0);
    await expect(page.locator('article.text [lang="en"]')).toHaveCount(0);
  });

  test('pressing the whitespace in a sentence opens it, and costs nothing', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '')) {
        external.push(request.url());
      }
    });

    await page.locator('.sentence').first().locator('.token.is-plain').first().click();

    // No model is configured, so the offer is all there is — and it is an
    // offer, never a request made on the reader's behalf.
    await expect(page.locator('mn-sentence-popover')).toBeVisible();
    await expect(page.locator('.mn-popover-pane')).not.toHaveClass(/is-sheet/);
    expect(external).toEqual([]);
  });

  test('the text scale changes the reading, and is remembered', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const paragraph = page.locator('mn-reader-paragraph p').first();
    const before = await paragraph.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );

    await page.getByRole('button', { name: 'Aids' }).click();
    await page.getByLabel('Text size').fill('1.5');
    await page.keyboard.press('Escape');

    await expect
      .poll(() =>
        paragraph.evaluate((element) =>
          Number.parseFloat(window.getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(before);

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    const afterReload = await paragraph.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );
    expect(afterReload).toBeGreaterThan(before);
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
test.describe('scenario 14 — library, filtering, deletion', () => {
  /**
   * A card shows the reading, not a report on it: the title, its opening in
   * Japanese, and one line saying when it arrived.
   */
  test('a card shows the reading opening in Japanese and one line of metadata', async ({
    page,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    const card = page.locator('mn-reading-card');
    await expect(card).toContainText('第一章');
    await expect(card.locator('.excerpt[lang="ja"]')).toContainText('吾輩は猫である');
    await expect(card).toContainText('today');
    // None of the counters the card used to be built from.
    await expect(card).not.toContainText('sentences');
    await expect(card).not.toContainText('none yet');
    await expect(card).not.toContainText('Last opened');
  });

  /** Chips are chrome until there are enough readings for filtering to help. */
  test('hides the filter chips on a shelf too small to need them', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Filter readings' })).toHaveCount(0);
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

  test('deleting one reading leaves the others on the shelf', async ({ page }) => {
    await importReading(page, '最初の話です。', '第一章');
    await importReading(page, '二番目の話です。', '第二章');
    await page.goto('/#/library');
    await expect(page.locator('mn-reading-card')).toHaveCount(2);

    await page.getByRole('button', { name: 'Actions for 第二章' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
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
    // Navigating inside the running application, because serving the shell
    // after a full reload is the service worker's job in Milestone 10. What
    // this proves is that listing the library needs nothing but local data.
    await page.getByRole('link', { name: '第一章' }).click();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to library' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
  });
});
