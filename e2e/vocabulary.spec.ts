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
  await expect(page.getByRole('menu', { name: 'Source kind' })).toBeVisible();
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
  test('uses one add-source menu and one unified empty list', async ({ page }) => {
    await openVocabulary(page);

    await expect(page.getByTestId('add-source')).toHaveCount(1);
    await expect(page.getByTestId('mapping-locked')).toContainText('No sources yet');
    await expect(page.getByTestId('current-snapshot')).toContainText('No words yet');
    await openAddSource(page);
    await expect(page.getByTestId('connect-ankiconnect')).toBeVisible();
    await expect(page.getByTestId('package-input')).toBeAttached();
    await expect(page.getByTestId('add-text-source')).toBeVisible();
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('dismisses the add-source menu without triggering another action', async ({ page }) => {
    await openVocabulary(page);
    const toggle = page.getByTestId('add-source');
    const menu = page.getByRole('menu', { name: 'Source kind' });

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
    await expect(rows.nth(1)).toContainText('Auto-sync');
    await expect(rows.nth(0).getByRole('checkbox', { name: 'Enabled' })).toBeChecked();
    await expect(rows.nth(1).getByRole('checkbox', { name: 'Enabled' })).toBeChecked();

    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].sourceKinds).toEqual(['text-list', 'anki-connect']);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('imports a package and applies its default mapping without a refresh step', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openVocabulary(page);
    await connectPackage(page, CONTRACT_PACKAGE);

    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('4', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('start-refresh')).toHaveCount(0);
    await expect(page.getByTestId('confirm-refresh')).toHaveCount(0);
    const snapshots = await readSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].uniqueEntryCount).toBe(4);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('uses the same pause and remove controls for every source kind', async ({ page }) => {
    await openVocabulary(page);
    await addTextList(page, 'Course words', '猫\n犬');
    const source = page.locator('li.source').filter({ hasText: 'Course words' });

    await source.getByRole('checkbox', { name: 'Enabled' }).uncheck();
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('0', {
      timeout: 60_000,
    });
    await source.getByRole('button', { name: 'Remove Course words' }).click();
    await expect(source).toHaveCount(0);
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

  test('keeps the current vocabulary when local Anki is unavailable', async ({ page }) => {
    await refuseAnkiConnect(page);
    await openVocabulary(page);
    await addLiveAnki(page);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Anki', { timeout: 30_000 });
    await expect(alert).toContainText('still current');
    expect(await readSnapshots(page)).toHaveLength(0);
  });

  test('refreshes an Anki source automatically after startup', async ({ page }) => {
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
    await expect(toast).toBeHidden({ timeout: 15_000 });
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
    await expect(page.getByTestId('current-snapshot').locator('.count')).toHaveText('4', {
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
