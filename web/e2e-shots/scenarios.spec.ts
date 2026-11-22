import { expect, test } from '@playwright/test';
import { configureTextModel } from '../e2e/generation';
import { stubOpenRouter } from '../e2e/openrouter';
import { importReading, SAMPLE_TEXT } from '../e2e/reading';
import { expectSheetAtRest } from '../e2e/sheets';
import { capture } from './shots';

/**
 * The named scenarios. Each title is the name `--grep` picks it by and the
 * folder its captures go to, so no name may contain another. A scenario sets up
 * only what its screen needs, through the browser suite's own helpers.
 */

test('library', async ({ page }, testInfo) => {
  await importReading(page, SAMPLE_TEXT, 'A walk in the park');
  await importReading(page, '今日は雨です。傘を持って出かけました。');
  await page.goto('./#/library');
  await expect(page.getByTestId('reading-row')).toHaveCount(2);
  await capture(page, testInfo, 'library');
});

test('first-run', async ({ page }, testInfo) => {
  await page.goto('./#/library');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, testInfo, 'first-run');
});

test('settings', async ({ page }, testInfo) => {
  await page.goto('./#/settings');
  await expect(page.getByTestId('connect-openrouter')).toBeVisible();
  await capture(page, testInfo, 'settings');
});

test('text-models', async ({ page }, testInfo) => {
  await stubOpenRouter(page);
  await configureTextModel(page);
  await page.goto('./#/settings/text-models');
  await expect(page.getByTestId('text-model-picker')).toBeVisible();
  await capture(page, testInfo, 'text-models');
});

test('add-words', async ({ page }, testInfo) => {
  await page.goto('./#/words');
  await page.getByTestId('add-words').click();
  const dialog = page.getByRole('dialog', { name: 'Add words' });
  await expect(dialog).toBeVisible();
  await expectSheetAtRest(dialog);
  await capture(page, testInfo, 'add-words', { overlay: true });
});

test('story-options', async ({ page }, testInfo) => {
  await importReading(page, SAMPLE_TEXT, 'A walk in the park');
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
  await page.getByRole('button', { name: 'Story options', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Story options', exact: true });
  await expect(dialog).toBeVisible();
  await expectSheetAtRest(dialog);
  await capture(page, testInfo, 'story-options', { overlay: true });
});

test('help', async ({ page }, testInfo) => {
  await page.goto('./#/help');
  await expect(page.getByTestId('help-topic').first()).toBeVisible();
  await capture(page, testInfo, 'help');
});
