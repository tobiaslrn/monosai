import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  choosePackage,
  connectPackage,
  openVocabulary,
  readSnapshots,
  refuseAnkiConnect,
  stubAnkiConnect,
} from './anki';
import { importReading } from './reading';

const CONTRACT_PACKAGE = 'contract-schema18-zstd.apkg';

async function openAddSource(page: Page): Promise<void> {
  await page.getByTestId('add-source').click();
  await expect(page.getByRole('dialog', { name: 'Add vocabulary source' })).toBeVisible();
}

async function addTextList(page: Page, name: string, content: string): Promise<void> {
  await openAddSource(page);
  await page.getByTestId('add-text-source').click();
  const editor = page.getByTestId('text-source-editor');
  await editor.getByRole('textbox', { name: 'List name' }).fill(name);
  await page.getByTestId('text-source-content').fill(content);
  await page.getByTestId('save-text-source').click();
}

async function addLiveAnki(page: Page): Promise<void> {
  await openAddSource(page);
  await page.getByTestId('choose-ankiconnect').click();
  await page.getByTestId('connect-ankiconnect').click();
}

function ankiAnswers(expressions: readonly string[]) {
  return {
    version: 6,
    requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
    deckNames: ['Core Japanese'],
    modelNames: ['Basic'],
    modelFieldNames: ['Expression'],
    findCards: expressions.map((_, index) => index + 1),
    cardsInfo: expressions.map((_, index) => ({
      cardId: index + 1,
      note: index + 10,
      reps: 2,
      deckName: 'Core Japanese',
    })),
    notesInfo: expressions.map((expression, index) => ({
      noteId: index + 10,
      modelName: 'Basic',
      fields: { Expression: { value: expression, order: 0 } },
    })),
  };
}

test.describe('vocabulary', () => {
  test('uses one add-source menu and one unified empty list @mobile', async ({ page }) => {
    await openVocabulary(page);

    await expect(page.getByTestId('add-source')).toHaveCount(1);
    await expect(page.getByTestId('mapping-locked')).toContainText('No sources yet');
    await expect(page.getByTestId('current-snapshot')).toContainText('No words yet');
    await openAddSource(page);
    await expect(page.getByTestId('choose-ankiconnect')).toBeVisible();
    await expect(page.getByTestId('package-input')).toBeAttached();
    await expect(page.getByTestId('add-text-source')).toBeVisible();
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('counts pasted entries grammatically and offers one exit @mobile', async ({ page }) => {
    await openVocabulary(page);
    await openAddSource(page);
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

  test('dismisses the add-source menu without triggering another action', async ({ page }) => {
    await openVocabulary(page);
    const toggle = page.getByTestId('add-source');
    const menu = page.getByRole('dialog', { name: 'Add vocabulary source' });

    await openAddSource(page);
    await page.getByRole('heading', { name: 'Sources', level: 2 }).click();
    await expect(menu).toBeHidden();

    await toggle.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('combines pasted and Anki sources automatically in the same list', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);

    await addTextList(page, 'My textbook', 'ねこ\n犬\nねこ\n\n青い 空');
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('3', {
      timeout: 60_000,
    });

    await addLiveAnki(page);
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('4', {
      timeout: 60_000,
    });
    const rows = page.locator('li.source');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('My textbook');
    await expect(rows.nth(1)).toContainText('Anki');
    await expect(rows.nth(1).getByRole('checkbox', { name: 'Sync automatically' })).toBeChecked();
    await expect(
      rows.nth(0).getByRole('checkbox', { name: 'Include in vocabulary' }),
    ).toBeChecked();
    await expect(
      rows.nth(1).getByRole('checkbox', { name: 'Include in vocabulary' }),
    ).toBeChecked();

    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].sourceKinds).toEqual(['text-list', 'anki-connect']);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('imports a package and applies its default mapping without a refresh step @smoke', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);

    // The parent deck's four reviewed expressions plus one reviewed expression
    // from Core Japanese::Verbs: package roots include their subdecks.
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('5', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);
    await expect(page.getByTestId('confirm-refresh')).toHaveCount(0);
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].uniqueEntryCount).toBe(5);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('re-importing the same deck replaces its source and keeps the others', async ({ page }) => {
    test.setTimeout(180_000);
    await openVocabulary(page);
    await addTextList(page, 'My textbook', '犬');
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('1', {
      timeout: 60_000,
    });

    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('5', {
      timeout: 60_000,
    });
    await expect(page.locator('li.source')).toHaveCount(2);

    // The same deck again: one source, replaced in place, and the pasted list
    // is still enabled and still counted.
    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('package-import-complete')).toContainText('Replaced');
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('5', {
      timeout: 60_000,
    });

    const rows = page.locator('li.source');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Anki package' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'My textbook' })).toHaveCount(1);
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('uses the same inclusion and remove controls for every source kind', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    const source = page.locator('li.source').filter({ hasText: 'Course words' });

    await source.getByRole('checkbox', { name: 'Include in vocabulary' }).uncheck();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('0', {
      timeout: 60_000,
    });
    // Excluding is reversible: the source and everything read from it stay.
    await expect(source).toHaveCount(1);
    await source.getByRole('checkbox', { name: 'Include in vocabulary' }).check();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2', {
      timeout: 60_000,
    });

    await source.getByRole('button', { name: 'Remove Course words' }).click();
    await page.getByRole('button', { name: 'Remove permanently' }).click();
    await expect(source).toHaveCount(0);
  });

  test('asks before removing a source and says what goes with it', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    const source = page.locator('li.source').filter({ hasText: 'Course words' });
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2', {
      timeout: 60_000,
    });

    await source.getByRole('button', { name: 'Remove Course words' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Remove Course words?');
    await expect(dialog).toContainText('drops to none');
    await expect(dialog).toContainText('Include in vocabulary');
    // The safe answer is the one a stray Enter or Space would press.
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();

    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog).toBeHidden();
    await expect(source).toHaveCount(1);
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('escapes the removal dialog without destroying the source', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    const source = page.locator('li.source').filter({ hasText: 'Course words' });

    await source.getByRole('button', { name: 'Remove Course words' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(source).toHaveCount(1);
  });

  test('separates including a source from syncing it automatically', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);
    await addLiveAnki(page);
    const source = page.locator('li.source').filter({ hasText: 'Anki' });
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2', {
      timeout: 60_000,
    });

    // Turning off automatic syncing is not a way to lose your vocabulary.
    await source.getByRole('checkbox', { name: 'Sync automatically' }).uncheck();
    await expect(source.getByRole('checkbox', { name: 'Include in vocabulary' })).toBeChecked();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2');
    expect((await readSnapshots(page))[0].uniqueEntryCount).toBe(2);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('syncs one source by hand after automatic syncing is off', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ']));
    await openVocabulary(page);
    await addLiveAnki(page);
    const source = page.locator('li.source').filter({ hasText: 'Anki' });
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('1', {
      timeout: 60_000,
    });
    await source.getByRole('checkbox', { name: 'Sync automatically' }).uncheck();

    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '犬']));
    await source.getByTestId('sync-now').click();

    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2', {
      timeout: 60_000,
    });
    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(2);
  });

  test('keeps the last good vocabulary when a manual sync cannot reach Anki', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる']));
    await openVocabulary(page);
    await addLiveAnki(page);
    const source = page.locator('li.source').filter({ hasText: 'Anki' });
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2', {
      timeout: 60_000,
    });

    await page.unrouteAll({ behavior: 'wait' });
    await refuseAnkiConnect(page);
    await source.getByTestId('sync-now').click();

    const failure = source.getByTestId('sync-failed');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    await expect(failure).toContainText('unchanged');
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('2');
    expect((await readSnapshots(page))[0].uniqueEntryCount).toBe(2);

    // Retry is the same control, and it works once Anki answers again.
    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, ankiAnswers(['ねこ', '食べる', '犬']));
    await source.getByTestId('sync-now').click();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('3', {
      timeout: 60_000,
    });
  });

  test('explains in the reader why every word is suddenly marked', async ({ page }) => {
    test.setTimeout(180_000);
    await importReading(page, 'ねこを見る。');
    const readerUrl = page.url();

    await openVocabulary(page);
    await addTextList(page, 'Course words', 'ねこ');
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('1', {
      timeout: 60_000,
    });

    const source = page.locator('li.source').filter({ hasText: 'Course words' });
    await source.getByRole('button', { name: 'Remove Course words' }).click();
    await page.getByRole('button', { name: 'Remove permanently' }).click();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('0', {
      timeout: 60_000,
    });

    await page.goto(readerUrl);
    await page.getByRole('button', { name: /Aids/ }).click();
    const notice = page.getByTestId('reader-vocabulary-notice');
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toContainText('marked as new');
    await expect(notice.getByRole('link', { name: 'Vocabulary settings' })).toBeVisible();
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
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('keeps the current vocabulary when local Anki is unavailable', async ({ page }) => {
    await refuseAnkiConnect(page);
    await openVocabulary(page);
    await addLiveAnki(page);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Anki', { timeout: 30_000 });
    await expect(alert).toContainText('still current');
    expect(await readSnapshots(page)).toHaveLength(0);
  });

  test('refreshes an Anki source automatically after startup @smoke', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, ankiAnswers(['ねこ']));
    await openVocabulary(page);
    await addLiveAnki(page);
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('1', {
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
    await expect(toast).toContainText('Vocabulary updated · 2 unique expressions');
    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(2);
  });

  test('leaves known words unmarked in the reader once vocabulary is ready', async ({ page }) => {
    test.setTimeout(180_000);
    await importReading(page, 'ねこを見る。');
    const readerUrl = page.url();

    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('5', {
      timeout: 60_000,
    });

    await page.goto(readerUrl);
    const known = page.getByRole('button', { name: /ねこ/ }).first();
    await expect(known).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => page.locator('.is-warning-vocabulary').count(), { timeout: 60_000 })
      .toBe(0);
  });
});
