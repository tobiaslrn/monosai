import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  addTaskModel,
  addTextModel,
  addTtsModel,
  expectReadiness,
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

/** Sets a token limit through its row and field dialog, and waits for the dialog to leave. */
async function setTokenLimit(page: Page, row: string, value: string): Promise<void> {
  await page.getByTestId(row).click();
  const field = page.getByTestId('token-limit-input');
  await field.fill(value);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(field).toBeHidden();
}

test.describe('the model tree', () => {
  test('keeps the saved key secret @smoke', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page, KEY);
    await expect(page.getByTestId('api-key-input')).toHaveCount(0);
    expect(await page.content()).not.toContain(KEY);
    expect(JSON.stringify(await readSettingsRecord(page, 'text-model'))).not.toContain(KEY);
  });

  /**
   * The key dialog and a picker are task dialogs: a press outside and Escape close them,
   * and focus goes back to the control that opened them.
   */
  test('puts the connection panel and a model picker away on a press outside or Escape @smoke @mobile', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');

    const connect = page.getByTestId('connect-openrouter');
    const connection = page.getByRole('dialog', { name: 'OpenRouter key' });
    await connect.click();
    await expect(connection).toBeVisible();
    // A press on the scrim only closes it.
    await page.mouse.click(2, 2);
    await expect(connection).toBeHidden();

    await connect.click();
    await expect(connection).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(connection).toBeHidden();
    await expect(connect).toBeFocused();

    await saveApiKey(page);
    await page.goto('./#/settings/text-models');

    const trigger = page.getByTestId('text-model-picker');
    const picker = page.getByRole('dialog', { name: 'Text model' });
    await trigger.click();
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('searchbox')).toBeFocused();
    await expect(page.getByTestId(`model-option-${MODEL}`)).toBeVisible();
    // A press on the scrim only closes it.
    await page.mouse.click(2, 2);
    await expect(picker).toBeHidden();

    await trigger.click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('asks for a key, refuses a blank one, and deletes the saved one after a confirmation', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    const connect = page.getByTestId('connect-openrouter');

    await connect.click();
    await page.getByTestId('save-key').click();
    await expect(page.getByRole('alert')).toContainText('Enter a key.');
    await expect(page.getByRole('button', { name: 'Delete key' })).toHaveCount(0);
    await page.getByTestId('api-key-input').fill(KEY);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByTestId('api-key-input')).toHaveAttribute('type', 'text');
    await page.getByTestId('save-key').click();
    await expect(page.getByTestId('api-key-input')).toBeHidden();
    await expect(connect).toHaveAccessibleDescription(/Key saved/);

    await connect.click();
    await page.getByRole('button', { name: 'Delete key' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Delete OpenRouter key?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Keep key' }).click();
    await expect(connect).toHaveAccessibleDescription(/Key saved/);

    await connect.click();
    await page.getByRole('button', { name: 'Delete key' }).click();
    await confirmation.getByRole('button', { name: 'Delete key' }).click();
    await expect(confirmation).toBeHidden();
    await expect(connect).toHaveAccessibleDescription(/Not connected/);
  });

  test('says a refused key was refused, on the row and under the field', async ({ page }) => {
    await stubOpenRouter(page, { chat: { kind: 'status', status: 401 } });
    await page.goto('./#/settings');
    await saveApiKey(page, KEY);
    await addTextModel(page, MODEL);
    await page.goto('./#/settings');

    const connect = page.getByTestId('connect-openrouter');
    await expect(connect).toHaveAccessibleDescription(/Key refused/);
    await connect.click();
    await expect(page.getByRole('alert')).toContainText('OpenRouter refused this key');
    await page.getByTestId('api-key-input').fill('a');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('tests the text model on selection and restores it', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await page.goto('./#/settings/text-models');
    await expectReadiness(textModelReadiness(page), 'incomplete');

    // No Test button is pressed anywhere here: choosing the model is what runs
    // the compatibility test, and readiness is the whole of the answer.
    await addTextModel(page, MODEL);
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(textModelReadiness(page)).toContainText(MODEL);

    await page.reload();
    await expectReadiness(textModelReadiness(page), 'ready');
    await expect(textModelReadiness(page)).toContainText(MODEL);

    // The overview names the model as the catalogue does, not by its id.
    await page.goto('./#/settings');
    await expect(page.getByTestId('open-text-models')).toHaveAccessibleDescription(
      /Ready Test text-model/,
    );
  });

  test('offers a speech picker only speech models', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await page.goto('./#/settings/voice');

    await page.getByTestId('audio-model-picker').click();
    await expect(page.getByTestId('model-option-vendor/tts-model')).toBeVisible();
    await expect(page.getByTestId(`model-option-${MODEL}`)).toHaveCount(0);
  });

  test('routes grammar to its own tested model without disturbing the text model', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
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
    await page.goto('./#/settings');
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
    await page.goto('./#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await addTaskModel(page, 'translation', 'vendor/translator');

    await setTokenLimit(page, 'story-token-limit', '20000');
    await setTokenLimit(page, 'translation-token-limit', '8000');

    // Both limits are written before the reload, or the reload is what the
    // test would be measuring instead of the storage.
    await expect
      .poll(async () => textModelSettings(await readSettingsRecord(page, 'text-model')))
      .toMatchObject({
        storyTokenBudget: 20_000,
        presets: expect.arrayContaining([expect.objectContaining({ tokenBudget: 8_000 })]),
      });

    await page.reload();
    await expect(page.getByTestId('story-token-limit')).toHaveAccessibleDescription(
      /20,000 · up to/,
    );
    await expect(page.getByTestId('translation-token-limit')).toHaveAccessibleDescription(
      /8,000 · up to/,
    );
    // The budget says nothing about compatibility, so the test still vouches.
    await expectReadiness(taskReadiness(page, 'translation'), 'ready');
  });

  test('refuses a generation limit outside the allowed range', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);

    await page.getByTestId('story-token-limit').click();
    const field = page.getByTestId('token-limit-input');
    await field.fill('99');

    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toContainText('Enter 4,096 to 65,536');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
    expect(
      textModelSettings(await readSettingsRecord(page, 'text-model'))['storyTokenBudget'],
    ).toBe(16_384);
  });

  test('tests audio independently through its preview', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await addTtsModel(page, 'vendor/tts-model');
    await expectReadiness(ttsReadiness(page), 'untested');

    await page.getByTestId('test-tts').click();

    await expectReadiness(ttsReadiness(page), 'ready');
    // The preview plays itself; it never leaves a player for the learner to operate.
    await expect(page.locator('audio')).toHaveCount(1);
    await expect(page.locator('audio')).not.toHaveAttribute('controls', /.*/);
    await page.goto('./#/settings/text-models');
    await expectReadiness(textModelReadiness(page), 'incomplete');
  });

  test('shows offline failure without losing the chosen model', async ({ page, context }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await page.goto('./#/settings/text-models');
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

  test('keeps enlarged settings rows aligned without horizontal overflow @mobile @smoke', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
    });

    const reasoningLabel = page.getByText('Reasoning', { exact: true }).first();
    const reasoningControl = page.getByRole('combobox', { name: 'Reasoning' }).first();
    const translation = taskReadiness(page, 'translation');
    const translationLabel = translation.getByText('Model', { exact: true });
    const translationControl = translation.getByTestId('translation-model-picker');
    for (const [label, control] of [
      [reasoningLabel, reasoningControl],
      [translationLabel, translationControl],
    ] as const) {
      const labelBox = await label.boundingBox();
      const controlBox = await control.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(controlBox).not.toBeNull();
      // The choice is the row's own words: it covers the label it is named by.
      expect(controlBox!.y).toBeLessThanOrEqual(labelBox!.y + 0.5);
      expect(controlBox!.y + controlBox!.height).toBeGreaterThanOrEqual(
        labelBox!.y + labelBox!.height - 0.5,
      );
    }

    await expectNoSeriousAccessibilityViolations(page);
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
});
