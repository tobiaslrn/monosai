import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';
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

  test('reader aid switches are changed and remembered in the Aids panel', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await page.getByRole('button', { name: 'Aids' }).click();
    const furigana = page.getByRole('checkbox', { name: 'Furigana' });
    await expect(furigana).toBeChecked();
    await furigana.uncheck();
    await expectSettingPersisted(page, 'reader-preferences', 'furigana', false);
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByRole('button', { name: 'Aids' }).click();
    await expect(page.getByRole('checkbox', { name: 'Furigana' })).not.toBeChecked();
  });

  test('keeps every Reader action usable in the compact 320px header', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const header = page.locator('.bar-row');
    await expect(header.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(header.getByRole('button', { name: /^Audio/ })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Aids' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Reading actions' })).toHaveCount(0);

    const actions = header.locator('.bar-actions > button, .bar-actions > mn-reader-aids');
    await expect(actions).toHaveCount(2);
    await expect(actions.nth(0)).toHaveClass(/audio-button/);
    await expect(actions.nth(1)).toHaveJSProperty('tagName', 'MN-READER-AIDS');

    const bounds = await header.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
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

/** End-to-end scenario 2: pasted text validation. */
test.describe('scenario 2 — pasted text validation', () => {
  test('keeps Continue disabled for pasted text over the 50,000-character limit', async ({
    page,
  }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('あ'.repeat(50_001));

    await expect(page.getByText('50,001 of 50,000 characters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page).toHaveURL(/#\/add/);
  });

  test('blocks empty input with an inline message', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('   \n  ');

    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

/** End-to-end scenario 14: filtering, resume, deletion cascade, and repair. */
test.describe('scenario 14 — library, filtering, deletion', () => {
  /** A compact row identifies the reading without repeating its contents. */
  test('a dated library row shows the title and character count without a preview', async ({
    page,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    const card = page.locator('mn-reading-card');
    await expect(card).toContainText('第一章');
    await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toBeVisible();
    await expect(card).toContainText(/\d+ characters/);
    await expect(card).not.toContainText('吾輩は猫である');
    await expect(card).not.toContainText('sentences');
    await expect(card).not.toContainText('none yet');
    await expect(card).not.toContainText('Last opened');
    await expect(card.getByRole('button', { name: 'Read' })).toHaveCount(0);
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
    await expect(dialog).toContainText('reviewed vocabulary');

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
