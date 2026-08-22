import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  addTextModel,
  addTtsModel,
  expectReadiness,
  saveApiKey,
  stubOpenRouter,
  textModelReadiness,
  ttsReadiness,
} from './openrouter';
import { readSettingsRecord } from './storage';

const MODEL = 'vendor/text-model';
const KEY = 'sk-or-v1-e2e-placeholder';

test.describe('unified models', () => {
  test('keeps the saved key secret', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page, KEY);
    await expect(page.getByTestId('api-key-input')).toHaveValue('');
    expect(await page.content()).not.toContain(KEY);
    expect(JSON.stringify(await readSettingsRecord(page, 'text-model'))).not.toContain(KEY);
  });

  test('adds, tests, badges, defaults, and restores a text model', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    const row = page.getByTestId('model-row-vendor-text-model');
    await expect(row).toContainText('Story');
    await expect(row).toContainText('Translation');
    await expect(row).toContainText('Grammar');
    await expectReadiness(textModelReadiness(page), 'untested');
    await row.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(row).toContainText('Default text');
    await page.reload();
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(page.getByTestId('model-row-vendor-text-model')).toContainText('Default text');
  });

  test('rejects an incompatible capability in the add flow', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await page.getByTestId('add-model').click();
    await page.getByTestId('add-tts-model').click();
    await page.getByTestId('add-model-id').fill('vendor/plain-text-model');
    await page.getByTestId('dialog-discover-model').click();
    await expect(page.getByTestId('save-model-preset')).toBeDisabled();
  });

  test('uses a dedicated tested grammar-judgement default', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await page.getByTestId('model-row-vendor-text-model').getByTestId('test-text-model').click();
    await addTextModel(page, 'vendor/grammar-model');
    const grammarRow = page.getByTestId('model-row-vendor-grammar-model');
    await grammarRow.getByTestId('test-text-model').click();
    await page.getByTestId('default-grammar-model').selectOption({ index: 2 });
    await expect(grammarRow).toContainText('Grammar judgement');
    const stored = await readSettingsRecord(page, 'text-model');
    expect(
      typeof stored === 'object' && stored !== null
        ? (stored as { value?: { grammarPresetId?: unknown } }).value?.grammarPresetId
        : null,
    ).toEqual(expect.any(String));
  });

  test('removing a default leaves it visibly unconfigured', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    const row = page.getByTestId('model-row-vendor-text-model');
    await row.getByTestId('test-text-model').click();
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('left unconfigured');
    await page.getByRole('button', { name: 'Remove model' }).click();
    await expect(page.getByTestId('text-preset-select')).toHaveValue('');
    await expect(page.getByText('No models configured.')).toBeVisible();
  });

  test('tests audio independently and exposes only its audio default', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTtsModel(page, 'vendor/tts-model');
    const row = page.getByTestId('model-row-vendor-tts-model');
    await expect(row).toContainText('Audio');
    await row.getByTestId('test-tts').click();
    await expectReadiness(ttsReadiness(page), 'ready');
    await expect(row).toContainText('Default audio');
    await expect(row).not.toContainText('Story');
  });

  test('shows offline failure without losing the configured model', async ({ page, context }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await context.setOffline(true);
    await page.getByTestId('model-row-vendor-text-model').getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'failed');
    await expect(page.getByTestId('model-row-vendor-text-model')).toContainText('offline');
    await context.setOffline(false);
  });

  test('is accessible without horizontal overflow', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await page.getByTestId('model-row-vendor-text-model').getByTestId('test-text-model').click();
    await expectNoSeriousAccessibilityViolations(page);
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
});
