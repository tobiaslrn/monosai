import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  addTaskModel,
  addTextModel,
  addTtsModel,
  expectReadiness,
  openTaskModels,
  saveApiKey,
  stubOpenRouter,
  taskReadiness,
  textModelReadiness,
  ttsReadiness,
} from './openrouter';
import { readSettingsRecord } from './storage';

const MODEL = 'vendor/text-model';
const KEY = 'sk-or-v1-e2e-placeholder';

function textModelSettings(stored: unknown): Record<string, unknown> {
  const value = (stored as { value?: unknown } | null)?.value;
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

test.describe('the model tree', () => {
  test('keeps the saved key secret', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page, KEY);
    await expect(page.getByTestId('api-key-input')).toHaveCount(0);
    expect(await page.content()).not.toContain(KEY);
    expect(JSON.stringify(await readSettingsRecord(page, 'text-model'))).not.toContain(KEY);
  });

  test('tests the text model on selection and restores it', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await expectReadiness(textModelReadiness(page), 'not-configured');

    // No Test button is pressed anywhere here: choosing the model is what runs
    // the compatibility test, and readiness is the whole of the answer.
    await addTextModel(page, MODEL);
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(textModelReadiness(page)).toContainText(MODEL);

    await page.reload();
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(textModelReadiness(page)).toContainText(MODEL);
  });

  test('offers a speech picker only speech models', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);

    await page.getByTestId('audio-model-picker').click();
    await expect(page.getByTestId('model-option-vendor/tts-model')).toBeVisible();
    await expect(page.getByTestId(`model-option-${MODEL}`)).toHaveCount(0);
  });

  test('routes grammar to its own tested model without disturbing the text model', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await addTaskModel(page, 'grammar', 'vendor/grammar-model');

    await expectReadiness(taskReadiness(page, 'grammar'), 'ready');
    await expectReadiness(taskReadiness(page, 'translation'), 'inherited');
    await expectReadiness(textModelReadiness(page), 'ready');

    const stored = textModelSettings(await readSettingsRecord(page, 'text-model'));
    expect(stored['grammarPresetId']).toEqual(expect.any(String));
    expect(stored['modelId']).toBe(MODEL);
  });

  test('returns a routed task to the text model', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await addTaskModel(page, 'translation', 'vendor/translator');
    await expectReadiness(taskReadiness(page, 'translation'), 'ready');

    await page.getByTestId('translation-model-picker').click();
    await page.getByTestId('model-picker-fallback').click();

    await expectReadiness(taskReadiness(page, 'translation'), 'inherited');
    expect(
      textModelSettings(await readSettingsRecord(page, 'text-model'))['translationPresetId'],
    ).toBeNull();
  });

  test('keeps a generation limit per model', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await addTaskModel(page, 'translation', 'vendor/translator');

    await page.getByTestId('story-token-budget-input').fill('20000');
    await page.getByTestId('story-token-budget-input').blur();
    const translationLimit = taskReadiness(page, 'translation').getByLabel('Token limit');
    await translationLimit.fill('8000');
    await translationLimit.blur();

    // Both limits are written before the reload, or the reload is what the
    // test would be measuring instead of the storage.
    await expect
      .poll(async () => textModelSettings(await readSettingsRecord(page, 'text-model')))
      .toMatchObject({
        storyTokenBudget: 20_000,
        presets: expect.arrayContaining([expect.objectContaining({ tokenBudget: 8_000 })]),
      });

    await page.reload();
    await expect(page.getByTestId('story-token-budget-input')).toHaveValue('20000');
    await openTaskModels(page);
    await expect(taskReadiness(page, 'translation').getByLabel('Token limit')).toHaveValue('8000');
    // The budget says nothing about compatibility, so the test still vouches.
    await expectReadiness(taskReadiness(page, 'translation'), 'ready');
  });

  test('refuses a generation limit outside the allowed range', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);

    await page.getByTestId('story-token-budget-input').fill('99');
    await page.getByTestId('story-token-budget-input').blur();

    await expect(page.getByTestId('story-token-budget-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByRole('alert')).toContainText('between 4096 and 32768');
    expect(textModelSettings(await readSettingsRecord(page, 'text-model'))['storyTokenBudget']).toBe(
      16_384,
    );
  });

  test('tests audio independently through its preview', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTtsModel(page, 'vendor/tts-model');
    await expectReadiness(ttsReadiness(page), 'untested');

    await page.getByTestId('test-tts').click();

    await expectReadiness(ttsReadiness(page), 'ready');
    // The preview plays itself; it never leaves a player for the learner to operate.
    await expect(page.locator('audio')).toHaveCount(1);
    await expect(page.locator('audio')).not.toHaveAttribute('controls', /.*/);
    await expectReadiness(textModelReadiness(page), 'not-configured');
  });

  test('shows offline failure without losing the chosen model', async ({ page, context }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    // The catalogue is in hand before the device drops, so what fails here is
    // the test the selection starts rather than the browsing that precedes it.
    await page.getByTestId('text-model-picker').click();
    await expect(page.getByTestId(`model-option-${MODEL}`)).toBeVisible();
    await context.setOffline(true);
    await page.getByTestId(`model-option-${MODEL}`).click();

    await expectReadiness(textModelReadiness(page), 'failed');
    await expect(page.getByRole('alert')).toContainText('offline');
    await expect(textModelReadiness(page)).toContainText(MODEL);

    // The failed status is the retry, and it succeeds once the device is back.
    await context.setOffline(false);
    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');
  });

  test('is accessible without horizontal overflow', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await openTaskModels(page);

    await expectNoSeriousAccessibilityViolations(page);
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
});
