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

/**
 * Points the newest mapping at the deck that actually holds reviewed cards.
 *
 * A new mapping defaults to the first discovered deck, which is Anki's own
 * empty `Default`, so every refresh has to choose deliberately.
 */
async function selectCoreJapanese(page: Page): Promise<void> {
  const mapping = page.locator('.mapping').first();
  await expect(mapping).toBeVisible();
  await mapping.getByRole('combobox', { name: 'Deck' }).selectOption('Core Japanese');
  await mapping.getByRole('combobox', { name: 'Note type' }).selectOption('Basic');
  await mapping.getByRole('combobox', { name: 'Expression field' }).selectOption('Expression');
}

test.describe('vocabulary', () => {
  test('offers both sources and refuses to refresh before one is connected', async ({ page }) => {
    await openVocabulary(page);

    await expect(page.getByRole('button', { name: 'Test AnkiConnect access' })).toBeVisible();
    await expect(page.getByTestId('add-text-source')).toBeVisible();
    await expect(page.getByTestId('mapping-locked')).toBeVisible();
    await expect(page.getByTestId('start-refresh')).toBeDisabled();
    await expect(page.getByTestId('refresh-blocked')).toContainText('Connect to a vocabulary');
    await expect(page.getByTestId('current-snapshot')).toContainText('No vocabulary snapshot yet');

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('combines a pasted list with refreshed Anki vocabulary', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnkiConnect(page, {
      version: 6,
      requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
      deckNames: ['Core Japanese'],
      modelNames: ['Basic'],
      modelFieldNames: ['Expression'],
      findCards: [1, 2],
      cardsInfo: [
        { cardId: 1, note: 10, reps: 2, deckName: 'Core Japanese' },
        { cardId: 2, note: 11, reps: 4, deckName: 'Core Japanese' },
      ],
      notesInfo: [
        {
          noteId: 10,
          modelName: 'Basic',
          fields: { Expression: { value: 'ねこ', order: 0 } },
        },
        {
          noteId: 11,
          modelName: 'Basic',
          fields: { Expression: { value: '食べる', order: 0 } },
        },
      ],
    });
    await openVocabulary(page);

    await page.getByTestId('add-text-source').click();
    const editor = page.getByTestId('text-source-editor');
    await editor.getByRole('textbox', { name: 'List name' }).fill('My textbook');
    await page.getByTestId('text-source-content').fill('ねこ\n犬\nねこ\n\n青い 空');
    await expect(editor).toContainText('4 non-empty entries');
    await expect(editor).toContainText('1 exact duplicates');
    await page.getByTestId('save-text-source').click();

    await expect(page.getByTestId('current-snapshot')).toContainText('3 unique expressions', {
      timeout: 60_000,
    });

    await page.getByRole('button', { name: 'Test AnkiConnect access' }).click();
    await expect(page.getByTestId('add-mapping')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('add-mapping').click();
    await page.getByTestId('start-refresh').click();
    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('confirm-refresh').click();

    await expect(page.getByTestId('current-snapshot')).toContainText('4 unique expressions', {
      timeout: 60_000,
    });
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].sourceKinds).toEqual(['text-list', 'anki-connect']);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('imports a package, maps a field, and stores one current vocabulary row', async ({
    page,
  }) => {
    // Opening a package starts a worker and loads SQLite, and the refresh
    // tokenizes every expression, so this needs more than the default budget.
    test.setTimeout(120_000);
    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);

    // Every dropdown value comes from the package, never free text.
    await page.getByTestId('add-mapping').click();
    // Scoped to the mapping card: the section's own accessible name also
    // contains the word "decks".
    await selectCoreJapanese(page);

    await expect(page.getByTestId('start-refresh')).toBeEnabled();
    await page.getByTestId('start-refresh').click();

    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 30_000 });
    // Summary cards only: the extracted expressions are never listed.
    await expect(page.locator('mn-refresh-summary')).not.toContainText('ねこ');

    expect(await readSnapshots(page)).toHaveLength(0);

    await page.getByTestId('confirm-refresh').click();
    await expect(page.getByTestId('current-snapshot')).toContainText('Current', {
      timeout: 30_000,
    });

    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].uniqueEntryCount).toBe(4);
    const firstSnapshotId = snapshots[0].id;

    await page.getByTestId('start-refresh').click();
    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('confirm-refresh').click();
    await expect(page.getByTestId('current-snapshot')).toContainText('Current', {
      timeout: 30_000,
    });

    const replaced = await readSnapshots(page);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].id).toBe(firstSnapshotId);
    expect(replaced[0].uniqueEntryCount).toBe(4);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('discards a prepared refresh without changing vocabulary', async ({ page }) => {
    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);
    await page.getByTestId('add-mapping').click();
    await selectCoreJapanese(page);
    await page.getByTestId('start-refresh').click();

    await expect(page.getByTestId('discard-refresh')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('discard-refresh').click();

    await expect(page.getByTestId('start-refresh')).toBeVisible();
    expect(await readSnapshots(page)).toHaveLength(0);
  });

  test('saves nothing from a package with no review history', async ({ page }) => {
    await openVocabulary(page);
    await choosePackage(page, 'no-review-evidence.apkg');
    await expect(page.getByTestId('add-mapping')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('add-mapping').click();
    await selectCoreJapanese(page);
    await page.getByTestId('start-refresh').click();

    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('mn-refresh-summary')).toContainText('Nothing reviewed was found');
    await expect(page.getByTestId('refresh-warnings')).toContainText('has been reviewed');
  });

  test('names the exact failure for a package it cannot read', async ({ page }) => {
    await openVocabulary(page);
    await choosePackage(page, 'missing-reps-column.apkg');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('no review history', { timeout: 30_000 });
    await expect(alert).toContainText('still current');
    await expect(alert).toContainText('anki/package-review-data-missing');

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('names the exact failure when nothing is listening for a local connection', async ({
    page,
  }) => {
    await refuseAnkiConnect(page);
    await openVocabulary(page);

    await page.getByRole('button', { name: 'Test AnkiConnect access' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Anki', { timeout: 30_000 });
    await expect(alert).toContainText('still current');
    expect(await readSnapshots(page)).toHaveLength(0);
  });

  test('reads reviewed vocabulary over a local connection', async ({ page }) => {
    await stubAnkiConnect(page, {
      version: 6,
      requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
      deckNames: ['Core Japanese'],
      modelNames: ['Basic'],
      modelFieldNames: ['Expression', 'Meaning'],
      findCards: [1, 2],
      cardsInfo: [
        { cardId: 1, note: 10, reps: 3, deckName: 'Core Japanese' },
        { cardId: 2, note: 11, reps: 0, deckName: 'Core Japanese' },
      ],
      notesInfo: [
        {
          noteId: 10,
          modelName: 'Basic',
          fields: {
            Expression: { value: '<b>ねこ</b>', order: 0 },
            Meaning: { value: 'cat', order: 1 },
          },
        },
      ],
    });

    await openVocabulary(page);
    await page.getByRole('button', { name: 'Test AnkiConnect access' }).click();
    await expect(page.getByTestId('add-mapping')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('add-mapping').click();
    await page.getByTestId('start-refresh').click();

    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('confirm-refresh').click();

    await expect(page.getByTestId('current-snapshot')).toContainText('Current', {
      timeout: 30_000,
    });
    const snapshots = await readSnapshots(page);
    // The never-reviewed card contributes nothing.
    expect(snapshots[0].uniqueEntryCount).toBe(1);
  });

  test('refreshes an opted-in Anki source automatically after startup', async ({ page }) => {
    test.setTimeout(120_000);
    const response = (expressions: readonly string[]) => ({
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
    });
    await stubAnkiConnect(page, response(['ねこ']));
    await openVocabulary(page);
    await page.getByRole('button', { name: 'Test AnkiConnect access' }).click();
    await expect(page.getByTestId('add-mapping')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('add-mapping').click();
    await page.getByTestId('start-refresh').click();
    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('confirm-refresh').click();
    await expect(page.getByTestId('current-snapshot')).toContainText('1 unique expressions');

    await page.unrouteAll({ behavior: 'wait' });
    await stubAnkiConnect(page, response(['ねこ', '犬']));
    await page.reload();

    await expect(page.getByText('Vocabulary updated · 2 unique expressions')).toBeVisible({
      timeout: 60_000,
    });
    await expect
      .poll(async () => (await readSnapshots(page))[0]?.uniqueEntryCount, { timeout: 60_000 })
      .toBe(2);
  });

  test('leaves known words unmarked in the reader once current vocabulary is ready', async ({
    page,
  }) => {
    // An import and a full refresh in one test, each of which loads a worker.
    test.setTimeout(180_000);
    await importReading(page, 'ねこを見る。');
    const readerUrl = page.url();

    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);
    await page.getByTestId('add-mapping').click();
    await selectCoreJapanese(page);
    await page.getByTestId('start-refresh').click();
    await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('confirm-refresh').click();
    await expect(page.getByTestId('current-snapshot')).toContainText('Current', {
      timeout: 30_000,
    });

    // Reopened from its own URL, which is a cold start: the language worker
    // has to load before classification can say anything true.
    await page.goto(readerUrl);
    await expect(page.getByText('no reviewed Anki vocabulary is set up')).toHaveCount(0);

    // ねこ and 見る both came from the current vocabulary, and the reader marks warnings
    // only: a word the learner has reviewed is simply text, and nothing about
    // its status is worth printing anywhere, on the page or in word details.
    const known = page.getByRole('button', { name: /ねこ/ }).first();
    await expect(known).toBeVisible({ timeout: 60_000 });

    // Polled because a cold start classifies after the first paint: a
    // transient unmarked-but-unclassified word would also pass a single
    // check, so this keeps sampling across that window instead of racing it.
    await expect
      .poll(() => page.locator('.is-warning-vocabulary').count(), { timeout: 60_000 })
      .toBe(0);

    await known.click();
    await expect(page.locator('mn-word-inspector')).not.toContainText(
      'Add this expression to one of your vocabulary sources',
    );
  });
});
