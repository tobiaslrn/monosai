import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { STORY_WITH_UNKNOWN, STRICT_STORY, openGenerate, prepareGeneration } from './generation';
import { stubOpenRouter } from './openrouter';
import { countOwnedRows } from './reading';

const PREMISE = 'A cat plays in the garden and meets a friend.';

/**
 * Setting up a key, a tested model, and a real vocabulary refresh loads two
 * workers and tokenizes sixty-two expressions, so these need more than the
 * default budget.
 */
const SETUP_TIMEOUT = 180_000;

test.describe('generate prerequisites', () => {
  test('names each missing prerequisite and links to the screen that fixes it', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    const checks = page.locator('[data-check]');
    await expect(checks).toHaveCount(3);
    await expect(page.locator('[data-check="text-model"]')).toHaveAttribute(
      'data-satisfied',
      'false',
    );
    await expect(page.locator('[data-check="vocabulary"]')).toContainText('No vocabulary snapshot');
    await expect(page.locator('[data-check="premise"]')).toHaveAttribute('data-satisfied', 'false');
    await expect(page.getByTestId('generate')).toBeDisabled();

    // The preset is a read-only line, never a check, and TTS never blocks.
    await expect(page.getByTestId('preset-line')).toContainText('Grammar preset');
    await expect(page.getByTestId('tts-optional')).toContainText('optional');

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('keeps the draft while the learner goes to fix a prerequisite', async ({ page }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('premise').fill(PREMISE);
    await page.getByRole('radio', { name: /Short/ }).check();
    await expect(page.locator('[data-check="premise"]')).toHaveAttribute('data-satisfied', 'true');

    await page.locator('[data-check="text-model"]').getByRole('link').click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.goBack();

    await expect(page.getByTestId('premise')).toHaveValue(PREMISE);
    await expect(page.getByRole('radio', { name: /Short/ })).toBeChecked();
  });

  test('makes no provider request while the form is only being filled in', async ({ page }) => {
    const calls = await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('special-instructions').fill('Write it as a diary entry.');

    expect(calls.urls).toEqual([]);
  });
});

test.describe('generating a story', () => {
  test('saves a strict story, lists it, and opens it in the reader', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await expect(page.getByTestId('generate')).toBeEnabled();
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('saved-title')).toHaveText(STRICT_STORY.titleJa, {
      timeout: 60_000,
    });

    // Every stage the run passed reports done; the two Milestone 8 stages are
    // shown as skipped rather than quietly omitted.
    const stepper = page.locator('mn-generation-stepper');
    await expect(stepper.locator('li[data-status="complete"]').first()).toBeVisible();
    await expect(stepper.getByText('Reviewing grammar')).toBeVisible();

    await expectNoSeriousAccessibilityViolations(page);

    await page.goto('/#/library');
    const card = page.locator('mn-reading-card').first();
    await expect(card).toContainText(STRICT_STORY.titleJa);
    await expect(card).toContainText('Generated');

    // The card's title is the link into the reader.
    await card.getByRole('link', { name: STRICT_STORY.titleJa }).click();
    await expect(page).toHaveURL(/#\/reader\//);
    // The reader renders one button per token, so the sentence is asserted
    // through its element rather than as one text node.
    const firstSentence = page.locator('mn-reader-sentence').first();
    await expect(firstSentence).toBeVisible({ timeout: 60_000 });
    await expect(firstSentence).toContainText('庭');
  });

  test('shows an invalid draft and leaves the library empty', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, {
      generation: {
        stories: [STORY_WITH_UNKNOWN],
        repairs: [STORY_WITH_UNKNOWN, STORY_WITH_UNKNOWN],
      },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('invalid-draft-text')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('invalid-draft-issues')).toContainText('図書館');
    await expect(page.getByText('2 repair attempts')).toBeVisible();
    await expect(page.getByRole('button', { name: /save anyway/i })).toHaveCount(0);

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
    expect(rows['sentences']).toBe(0);
    expect(rows['frozenValidations']).toBe(0);
    expect(rows['generationProvenance']).toBe(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('cancelling mid-run saves nothing', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    // The story request never answers, so the run really is interrupted.
    await stubOpenRouter(page, { chat: { kind: 'hang' } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('cancel-generation')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('cancel-generation').click();

    await expect(page.getByTestId('generation-detail')).toContainText('Cancelled', {
      timeout: 30_000,
    });

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
    expect(rows['generationProvenance']).toBe(0);
  });

  test('reports a provider failure without adding anything to the library', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    await stubOpenRouter(page, { chat: { kind: 'status', status: 401 } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('failure-context')).toContainText('writing your story', {
      timeout: 60_000,
    });
    await expect(page.getByText('ai/authentication')).toBeVisible();

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
  });
});
