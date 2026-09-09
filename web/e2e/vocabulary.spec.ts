import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  choosePackage,
  connectAnki,
  connectPackage,
  openVocabulary,
  readSnapshots,
  refuseAnkiConnect,
  stubAnkiConnect,
} from './anki';
import { importReading } from './reading';

const CONTRACT_PACKAGE = 'contract-schema18-zstd.apkg';

async function openAddWords(page: Page): Promise<void> {
  await page.getByTestId('add-words').click();
  await expect(page.getByRole('dialog', { name: 'Add words' })).toBeVisible();
}

function row(page: Page, name: string): Locator {
  return page.getByTestId('source-row').filter({ hasText: name });
}

/** Opens one source's own page, which is where every setting for it lives. */
async function openSource(page: Page, name: string): Promise<void> {
  await row(page, name).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
}

async function backToWords(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Back to words' })
    .or(page.getByRole('link', { name: 'Back to words' }))
    .click();
  await expect(page.getByRole('heading', { name: 'What you can read', level: 1 })).toBeVisible();
}

async function addTextList(page: Page, name: string, content: string): Promise<void> {
  await openAddWords(page);
  await page.getByTestId('add-text-source').click();
  const editor = page.getByTestId('text-source-editor');
  await editor.getByRole('textbox', { name: 'List name' }).fill(name);
  await page.getByTestId('text-source-content').fill(content);
  await page.getByTestId('save-text-source').click();
}

async function addLiveAnki(page: Page, confirm = true): Promise<void> {
  await connectAnki(page);
  if (confirm) await page.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
}

function ankiAnswers(expressions: readonly string[], meanings = expressions.map(() => 'meaning')) {
  return {
    version: 6,
    requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
    deckNames: ['Core Japanese'],
    modelNames: ['Basic'],
    modelFieldNames: ['Expression', 'Meaning'],
    findCards: expressions.map((_, index) => index + 1),
    cardsInfo: expressions.map((_, index) => ({
      cardId: index + 1,
      note: index + 10,
      reps: 2,
      queue: 2,
      deckName: 'Core Japanese',
    })),
    notesInfo: expressions.map((expression, index) => ({
      noteId: index + 10,
      modelName: 'Basic',
      fields: {
        Expression: { value: expression, order: 0 },
        Meaning: { value: meanings[index] ?? 'meaning', order: 1 },
      },
    })),
  };
}

test.describe('vocabulary', () => {
  test('offers three ways in and one unified empty list @mobile', async ({ page }) => {
    await openVocabulary(page);

    await expect(page.getByTestId('add-words')).toHaveCount(1);
    await expect(page.getByTestId('no-sources')).toContainText('No sources yet');
    await expect(page.getByTestId('words-standing')).toHaveText('No words yet');

    await openAddWords(page);
    // One Anki entry, not two: the platform picks the adapter behind it.
    await expect(page.getByTestId('choose-anki')).toHaveCount(1);
    await expect(page.getByTestId('choose-package')).toBeVisible();
    await expect(page.getByTestId('package-input')).toBeAttached();
    await expect(page.getByTestId('add-text-source')).toBeVisible();
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);
    // The port is only ever touched when a connection fails.
    await expect(page.getByTestId('anki-connect-port')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('counts pasted entries grammatically and offers one exit @mobile', async ({ page }) => {
    await openVocabulary(page);
    await openAddWords(page);
    await page.getByTestId('add-text-source').click();

    const editor = page.getByTestId('text-source-editor');
    await expect(editor.getByText('0 non-empty entries')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);

    const content = page.getByTestId('text-source-content');
    await content.fill('猫');
    await expect(editor.getByText('1 non-empty entry')).toBeVisible();
    await content.fill('猫\n猫\n\n犬');
    await expect(
      editor.getByText(
        '3 non-empty entries · 1 exact duplicate will be merged · 1 blank line ignored',
      ),
    ).toBeVisible();
  });

  test('dismisses the Add words sheet without triggering another action', async ({ page }) => {
    await openVocabulary(page);
    const toggle = page.getByTestId('add-words');
    const sheet = page.getByRole('dialog', { name: 'Add words' });

    await openAddWords(page);
    await page.getByRole('heading', { name: 'Words', level: 2 }).click();
    await expect(sheet).toBeHidden();

    await toggle.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('previews Anki before combining it with pasted sources @smoke @mobile', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);

    await addTextList(page, 'My textbook', 'ねこ\n犬\nねこ\n\n青い 空');
    await expect(page.getByTestId('words-standing')).toHaveText('3 words', {
      timeout: 60_000,
    });

    await addLiveAnki(page, false);
    await expect(
      page.getByRole('button', { name: 'Confirm vocabulary', exact: true }),
    ).toBeVisible();
    expect((await readSnapshots(page))[0].uniqueEntryCount).toBe(3);
    await expect(page.getByTestId('source-row')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Review Anki source' })).toContainText('食べる');
    await page.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
    await expect(page.getByTestId('words-standing')).toHaveText('4 words', {
      timeout: 60_000,
    });

    const rows = page.getByTestId('source-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('My textbook');
    await expect(rows.nth(1)).toContainText('Anki');
    // The standing says where the words came from, once, above the rows.
    await expect(page.getByTestId('source-standing')).toContainText('from Pasted list + Anki');

    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].sourceKinds).toEqual(['text-list', 'anki-connect']);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('browses, filters, expands, and follows a meaning-mapped Anki entry @smoke @mobile', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['食べる', '見る'], ['eat', 'see']));
    await openVocabulary(page);
    await addTextList(page, 'My textbook', '飲む');
    await expect(page.getByTestId('words-standing')).toHaveText('1 word', {
      timeout: 60_000,
    });

    await addLiveAnki(page, false);
    const draft = page.getByRole('region', { name: 'Review Anki source' });
    await draft.getByLabel('Meaning field').selectOption('Meaning');
    await draft.getByRole('button', { name: 'Preview vocabulary', exact: true }).click();
    await draft.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
    await expect(page.getByTestId('words-standing')).toHaveText('3 words', {
      timeout: 60_000,
    });

    await page.getByTestId('browse-vocabulary').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vocabulary');
    await page.getByTestId('vocabulary-search').fill('eat');
    await expect(page.locator('mn-vocabulary-browse-row')).toHaveCount(1);
    await expect(page.locator('mn-vocabulary-browse-row')).toContainText('eat');

    await page.getByTestId('vocabulary-search').fill('');
    await page.getByTestId('vocabulary-filters').click();
    const filters = page.getByRole('dialog', { name: 'Filters' });
    await expect(filters).toBeVisible();
    await filters.getByLabel('First studied').selectOption('last-7-days');
    await filters.getByRole('button', { name: /Show/ }).click();
    await expect(page.locator('mn-vocabulary-browse-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.locator('mn-vocabulary-browse-row')).toHaveCount(3);

    const eatRow = page.locator('mn-vocabulary-browse-row').filter({ hasText: 'eat' });
    await eatRow.locator('summary').click();
    await expect(eatRow).toContainText('Contributing sources');
    await eatRow.getByRole('link', { name: /Anki/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Anki');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('imports a package and applies its default mapping without a refresh step @smoke', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);

    // The parent deck's three eligible reviewed expressions plus one reviewed
    // expression from Core Japanese::Verbs: package roots include subdecks.
    await expect(page.getByTestId('words-standing')).toHaveText('4 words', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);
    await expect(page.getByTestId('confirm-refresh')).toHaveCount(0);
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].uniqueEntryCount).toBe(4);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('re-importing the same deck replaces its source and keeps the others', async ({ page }) => {
    test.setTimeout(180_000);
    await openVocabulary(page);
    await addTextList(page, 'My textbook', '犬');
    await expect(page.getByTestId('words-standing')).toHaveText('1 word', {
      timeout: 60_000,
    });

    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('words-standing')).toHaveText('4 words', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('source-row')).toHaveCount(2);

    // The same deck again: one source, replaced in place, and the pasted list
    // is still there and still counted.
    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('package-import-complete')).toContainText('Replaced');
    await expect(page.getByTestId('words-standing')).toHaveText('4 words', {
      timeout: 60_000,
    });

    const rows = page.getByTestId('source-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'File' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'My textbook' })).toHaveCount(1);
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    await expectNoSeriousAccessibilityViolations(page);
  });

  /** A row is for choosing what to open; the settings are on the page it opens. */
  test('keeps every setting on the source page rather than on the row', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });

    await expect(row(page, 'Course words').getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByTestId('remove-source')).toHaveCount(0);

    await openSource(page, 'Course words');
    const counted = page.getByTestId('include-source');
    await expect(counted).toBeChecked();

    await counted.uncheck();
    await backToWords(page);
    await expect(page.getByTestId('words-standing')).toHaveText(
      '0 counted words · 2 words in 1 source',
      {
        timeout: 60_000,
      },
    );
    // Not counting is reversible: the source and everything read from it stay.
    await expect(row(page, 'Course words')).toContainText('not counted');

    await openSource(page, 'Course words');
    await page.getByTestId('include-source').check();
    await backToWords(page);
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });

    await openSource(page, 'Course words');
    await page.getByTestId('remove-source').click();
    await page.getByRole('button', { name: 'Remove permanently' }).click();
    await expect(page.getByTestId('no-sources')).toBeVisible({ timeout: 60_000 });
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('asks before removing a source and says what goes with it', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });
    await openSource(page, 'Course words');

    await page.getByTestId('remove-source').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Remove Course words?');
    await expect(dialog).toContainText('drops to none');
    await expect(dialog).toContainText('Count these words');
    // The safe answer is the one a stray Enter or Space would press.
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();

    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('include-source')).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('escapes the removal dialog without destroying the source', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    await openSource(page, 'Course words');

    await page.getByTestId('remove-source').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await backToWords(page);
    await expect(row(page, 'Course words')).toHaveCount(1);
  });

  test('separates counting a source from keeping it up to date', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);
    await addLiveAnki(page);
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });

    await openSource(page, 'Anki');
    // Turning off automatic reading is not a way to lose your vocabulary.
    await page.getByTestId('automatic-sync').uncheck();
    await expect(page.getByTestId('include-source')).toBeChecked();
    await backToWords(page);
    await expect(page.getByTestId('words-standing')).toHaveText('2 words');
    expect((await readSnapshots(page))[0].uniqueEntryCount).toBe(2);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('refreshes one source by hand after automatic reading is off', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ']));
    await openVocabulary(page);
    await addLiveAnki(page);
    await expect(page.getByTestId('words-standing')).toHaveText('1 word', {
      timeout: 60_000,
    });
    await openSource(page, 'Anki');
    await page.getByTestId('automatic-sync').uncheck();

    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '犬']));
    await page.getByTestId('sync-now').click();

    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(2);
    await backToWords(page);
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });
  });

  test('keeps the last good vocabulary when a manual refresh cannot reach Anki', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);
    await addLiveAnki(page);
    await expect(page.getByTestId('words-standing')).toHaveText('2 words', {
      timeout: 60_000,
    });
    await openSource(page, 'Anki');

    await page.unrouteAll({ behavior: 'wait' });
    await refuseAnkiConnect(page);
    await page.getByTestId('sync-now').click();

    const failure = page.getByTestId('source-attention');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    await expect(failure).toContainText('unchanged');
    expect((await readSnapshots(page))[0].uniqueEntryCount).toBe(2);

    // Retry is the same control, and it works once Anki answers again.
    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる', '犬']));
    await page.getByTestId('sync-now').click();
    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(3);
  });

  test('explains in the reader why every word is suddenly marked', async ({ page }) => {
    test.setTimeout(180_000);
    await importReading(page, 'ねこを見る。');
    const readerUrl = page.url();

    await openVocabulary(page);
    await addTextList(page, 'Course words', 'ねこ');
    await expect(page.getByTestId('words-standing')).toHaveText('1 word', {
      timeout: 60_000,
    });

    await openSource(page, 'Course words');
    await page.getByTestId('remove-source').click();
    await page.getByRole('button', { name: 'Remove permanently' }).click();
    // The last source is gone, so this is the standing of a fresh install
    // rather than a source that happens to contribute nothing.
    await expect(page.getByTestId('words-standing')).toHaveText('No words yet', {
      timeout: 60_000,
    });

    await page.goto(readerUrl);
    await page.getByRole('button', { name: 'Story options', exact: true }).click();
    const notice = page.getByTestId('reader-vocabulary-notice');
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toContainText('marked as new');
    await expect(notice.getByRole('link', { name: 'What you can read' })).toBeVisible();
  });

  test('names the exact failure for a package it cannot read', async ({ page }) => {
    await openVocabulary(page);
    await choosePackage(page, 'missing-reps-column.apkg');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('does not record which cards were reviewed', {
      timeout: 30_000,
    });
    await expect(alert).toContainText('current vocabulary and other sources are unchanged');
    await expect(alert).toContainText('anki/package-review-data-missing');
    // The code is printed with a way to look it up, and the export it asks for
    // with a way to do it.
    await expect(alert.getByRole('link', { name: /what this means/ })).toBeVisible();
    await expect(alert.getByRole('link', { name: /how to export/ })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('says what to install when local Anki is unavailable', async ({ page }) => {
    test.skip(
      test.info().project.name === 'android-chrome',
      'the desktop add-on is not what Android is missing',
    );
    await refuseAnkiConnect(page);
    await openVocabulary(page);
    await connectAnki(page);

    const failure = page.getByTestId('anki-connect-failed');
    await expect(failure).toBeVisible({ timeout: 30_000 });
    await expect(failure).toContainText('Anki is not answering');
    await expect(failure.getByRole('link', { name: /AnkiConnect add-on/ })).toBeVisible();
    await expect(failure).toContainText('anki/not-running');
    // The port lives here, behind a fold, beside the retry it changes.
    await expect(page.getByTestId('anki-connect-port')).toHaveValue('8765');
    await expect(page.getByTestId('anki-retry')).toBeVisible();
    expect(await readSnapshots(page)).toHaveLength(0);
  });

  test('refreshes an Anki source automatically after startup @smoke', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ']));
    await openVocabulary(page);
    await addLiveAnki(page);
    await expect(page.getByTestId('words-standing')).toHaveText('1 word', {
      timeout: 60_000,
    });

    await page.reload();
    await expect(page.getByTestId('vocabulary-sync-toast')).toHaveCount(0, { timeout: 15_000 });

    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '犬']));
    await page.reload();

    const toast = page.getByTestId('vocabulary-sync-toast');
    await expect(toast).toBeVisible({
      timeout: 60_000,
    });
    expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    expect(await toast.evaluate((element) => getComputedStyle(element).right)).toBe('16px');
    expect(await toast.evaluate((element) => getComputedStyle(element).bottom)).toBe('16px');
    await expect(toast).toContainText('Vocabulary updated · 2 words');
    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(2);
  });

  test('marks suspended words as new in the reader', async ({ page }) => {
    test.setTimeout(180_000);
    await importReading(page, 'ねこを見る。');
    const readerUrl = page.url();

    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('words-standing')).toHaveText('4 words', {
      timeout: 60_000,
    });

    await page.goto(readerUrl);
    const known = page.getByRole('button', { name: /ねこ/ }).first();
    await expect(known).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => page.locator('.is-warning-vocabulary').count(), { timeout: 60_000 })
      .toBe(1);
  });
});
