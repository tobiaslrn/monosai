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
import { expectSettingPersisted, readSettingsRecord } from './storage';

const MODEL = 'vendor/text-model';
const KEY = 'sk-or-v1-e2e-placeholder';

test.describe('OpenRouter key', () => {
  test('saves, replaces, and removes a key without ever showing it', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');

    await expect(page.getByTestId('credential-state')).toContainText('No key saved');

    await saveApiKey(page, KEY);
    await expect(page.getByTestId('api-key-input')).toHaveValue('');
    expect(await page.content()).not.toContain(KEY);

    await saveApiKey(page, 'sk-or-v1-replacement');
    expect(await page.content()).not.toContain('replacement');

    await page.getByTestId('remove-key').click();
    await expect(page.getByRole('alert')).toContainText('Removing the key');
    await page.getByTestId('confirm-remove-key').click();

    await expect(page.getByTestId('credential-state')).toContainText('No key saved');
  });

  test('keeps the key out of the DOM, storage reads, and the console', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    page.on('pageerror', (error) => logs.push(error.message));

    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page, KEY);

    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();
    await expect(page.getByTestId('credential-state')).toContainText('Key saved');

    expect(await page.content()).not.toContain(KEY);
    expect(logs.join('\n')).not.toContain(KEY);
    expect(JSON.stringify(await readSettingsRecord(page, 'text-model'))).not.toContain(KEY);
  });
});

test.describe('text model test', () => {
  test('saves and restores the story reasoning/output budget', async ({ page }) => {
    await page.goto('/#/settings');

    const budget = page.getByTestId('story-token-budget-input');
    await expect(budget).toHaveValue('16384');

    await budget.fill('24576');
    await page.getByTestId('save-story-token-budget').click();

    await expect(page.getByTestId('story-token-budget-state')).toContainText('Saved: 24,576');
    await expectSettingPersisted(page, 'text-model', 'storyTokenBudget', 24576);

    await page.reload();

    await expect(page.getByTestId('story-token-budget-input')).toHaveValue('24576');
  });

  test('passes and stays ready across a reload', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);

    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();

    await expectReadiness(textModelReadiness(page), 'ready');
    await expectSettingPersisted(page, 'text-model', 'modelId', MODEL);

    await page.reload();

    await expectReadiness(textModelReadiness(page), 'ready');
  });

  test('requires a test when the preset changes and goes stale when the key is replaced', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');

    await addTextModel(page, 'vendor/other-model');
    await expectReadiness(textModelReadiness(page), 'untested');

    await page.getByTestId('text-preset-select').selectOption({ index: 1 });
    await expectReadiness(textModelReadiness(page), 'untested');
    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');

    await saveApiKey(page, 'sk-or-v1-second');
    await expectReadiness(textModelReadiness(page), 'stale');
  });

  test('reads as not configured after the key is removed, keeping the model', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');

    await page.getByTestId('remove-key').click();
    await page.getByTestId('confirm-remove-key').click();

    await expectReadiness(textModelReadiness(page), 'not-configured');
    await expect(page.getByText(MODEL)).toBeVisible();
  });

  test('removes a registered model only after confirmation', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);
    await addTextModel(page, MODEL);

    await page.getByTestId('remove-text-model').click();
    await expect(page.getByRole('alertdialog', { name: 'Remove Test text model?' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove model' }).click();

    await expect(page.getByText('No registered text models')).toBeVisible();
    await expectReadiness(textModelReadiness(page), 'not-configured');
  });

  test.describe('failures', () => {
    const cases = [
      { status: 401, heading: 'OpenRouter refused the key' },
      { status: 404, heading: 'That model was not found' },
      { status: 429, heading: 'OpenRouter is rate limiting this key' },
      { status: 500, heading: 'OpenRouter could not be reached' },
    ];

    for (const { status, heading } of cases) {
      test(`reports HTTP ${String(status)} with its own recovery`, async ({ page }) => {
        await stubOpenRouter(page, { chat: { kind: 'status', status } });
        await page.goto('/#/settings');
        await saveApiKey(page);

        await addTextModel(page, MODEL);
        await page.getByTestId('test-text-model').click();

        await expect(page.getByText(heading)).toBeVisible();
        await expect(page.getByText('Nothing was changed.').first()).toBeVisible();
        expect(await readSettingsRecord(page, 'text-model')).toMatchObject({
          value: { lastTestFingerprint: null },
        });
      });
    }

    test('reports a model that cannot hold the structure', async ({ page }) => {
      await stubOpenRouter(page, { chat: { kind: 'prose' } });
      await page.goto('/#/settings');
      await saveApiKey(page);

      await addTextModel(page, MODEL);
      await page.getByTestId('test-text-model').click();

      await expect(page.getByText('The reply could not be used')).toBeVisible();
    });

    test('enters an offline state instead of hanging', async ({ page, context }) => {
      await stubOpenRouter(page);
      await page.goto('/#/settings');
      await saveApiKey(page);
      await addTextModel(page, MODEL);

      await context.setOffline(true);
      await page.getByTestId('test-text-model').click();

      await expect(page.getByText('This device is offline')).toBeVisible();
      await context.setOffline(false);
    });

    test('can be cancelled while the request is in flight', async ({ page }) => {
      await stubOpenRouter(page, { chat: { kind: 'hang' } });
      await page.goto('/#/settings');
      await saveApiKey(page);

      await addTextModel(page, MODEL);
      await page.getByTestId('test-text-model').click();
      await expect(page.getByTestId('cancel-text-test')).toBeVisible();

      await page.getByTestId('cancel-text-test').click();

      await expect(page.getByTestId('cancel-text-test')).toBeHidden();
      await expectReadiness(textModelReadiness(page), 'untested');
    });
  });
});

test.describe('TTS', () => {
  test('is independent of the text model', async ({ page }) => {
    await stubOpenRouter(page, {
      audio: { kind: 'status', status: 400, message: 'Unknown voice' },
    });
    await page.goto('/#/settings');
    await saveApiKey(page);

    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');

    await addTtsModel(page, 'vendor/tts-model');
    await page.getByTestId('test-tts').click();

    await expect(page.getByText('This model cannot do what Monosai needs')).toBeVisible();
    await expectReadiness(ttsReadiness(page), 'failed');
    await expectReadiness(textModelReadiness(page), 'ready');
  });

  test('rejects audio the browser cannot store', async ({ page }) => {
    await stubOpenRouter(page, { audio: { kind: 'wrong-mime' } });
    await page.goto('/#/settings');
    await saveApiKey(page);

    await addTtsModel(page, 'vendor/tts-model');
    await page.getByTestId('test-tts').click();

    await expect(page.getByText('The audio could not be played')).toBeVisible();
  });
});

test.describe('generation policy', () => {
  test('saves the policy and keeps it across a reload', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByTestId('policy-input').fill('Allow proper nouns for people and places.');
    await page.getByTestId('save-policy').click();

    await expect(page.getByTestId('policy-state')).toContainText('Policy saved');
    await expectSettingPersisted(
      page,
      'exception-policy',
      'text',
      'Allow proper nouns for people and places.',
    );

    await page.reload();

    await expect(page.getByTestId('policy-input')).toHaveValue(
      'Allow proper nouns for people and places.',
    );
  });
});

test.describe('no implicit provider requests', () => {
  test('makes no request while configuring, only when a test is pressed', async ({ page }) => {
    const calls = await stubOpenRouter(page);
    await page.goto('/#/settings');

    await saveApiKey(page);
    await addTextModel(page, MODEL);
    await addTtsModel(page, 'vendor/tts-model');
    await page.getByTestId('policy-input').fill('Allow proper nouns.');
    await page.getByTestId('save-policy').click();
    await expect(page.getByTestId('policy-state')).toContainText('Policy saved');

    expect(calls.urls).toHaveLength(2);

    await page.getByTestId('test-text-model').click();
    await expectReadiness(textModelReadiness(page), 'ready');

    expect(calls.urls).toHaveLength(3);
  });

  test('makes no request when the library or a reader route is opened', async ({ page }) => {
    const calls = await stubOpenRouter(page);
    await page.goto('/#/settings');
    await saveApiKey(page);

    await page.goto('/#/library');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(calls.urls).toHaveLength(0);
  });
});

test.describe('accessibility', () => {
  test('has no serious violations with the AI sections in a failed state', async ({ page }) => {
    await stubOpenRouter(page, { chat: { kind: 'status', status: 401 } });
    await page.goto('/#/settings');
    await saveApiKey(page);

    await addTextModel(page, MODEL);
    await page.getByTestId('test-text-model').click();
    await expect(page.getByText('OpenRouter refused the key')).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page);
  });
});
