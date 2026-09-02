import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  LONG_STRICT_STORY,
  SHORT_STORY,
  STORY_WITH_UNKNOWN,
  STRICT_STORY,
  openGenerate,
  prepareGeneration,
} from './generation';
import { stubOpenRouter } from './openrouter';
import { countOwnedRows } from './reading';
import { GENERATION_READY_STATE } from './state';
import { expectSettingPersisted } from './storage';

const PREMISE = 'A cat plays in the garden and meets a friend.';

/**
 * Setting up a key, a tested model, and a real vocabulary refresh loads two
 * workers and tokenizes sixty-two expressions, so these need more than the
 * default budget.
 */
const SETUP_TIMEOUT = 180_000;

test.describe('generate prerequisites', () => {
  test('names each missing prerequisite and links to the screen that fixes it @mobile @smoke', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    // Only what is missing is listed, one line each.
    await expect(page.locator('[data-check]')).toHaveCount(2);
    await expect(page.locator('[data-check="vocabulary"]')).toContainText('No vocabulary snapshot');
    await expect(page.getByTestId('generate')).toBeDisabled();

    // Voice is optional, so it never appears here at all.
    await expect(page.getByText(/Voice \(optional\)/)).toHaveCount(0);
    // What a generation sends is said once, above the button that sends it.
    await expect(page.getByTestId('form-sources')).toHaveCount(1);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('keeps the draft while the learner goes to fix a prerequisite', async ({ page }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('2');

    await page.locator('[data-check="text-model"]').getByRole('link').click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.getByRole('button', { name: 'Back to story' }).click();

    await expect(page.getByTestId('premise')).toHaveValue(PREMISE);
    await expect(page.getByTestId('story-length')).toHaveValue('2');

    await page.locator('[data-check="vocabulary"]').getByRole('link').click();
    await expect(page).toHaveURL(/#\/vocabulary\?from=generate$/);
    await page.getByRole('button', { name: 'Back to story' }).click();

    await expect(page.getByTestId('premise')).toHaveValue(PREMISE);
    await expect(page.getByTestId('story-length')).toHaveValue('2');
  });

  test('makes no provider request while the form is only being filled in', async ({ page }) => {
    const calls = await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('special-instructions').fill('Write it as a diary entry.');

    expect(calls.urls).toEqual([]);
  });

  test('remembers the Anki word-priority mode across a reload', async ({ page }) => {
    await openGenerate(page);

    const select = page.getByTestId('word-priority-select');
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue('uniform');
    await select.selectOption('difficult');
    await expectSettingPersisted(page, 'app', 'ankiWordPriorityMode', 'difficult');

    await page.reload();

    await expect(page.getByTestId('word-priority-select')).toHaveValue('difficult');
  });
});

test.describe('generating a story', () => {
  test.use({ storageState: GENERATION_READY_STATE });

  test('keeps the action discoverable and explains over-limit fields at laptop and phone sizes @mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await openGenerate(page);

    const generate = page.getByTestId('generate');
    await expect(generate).toBeInViewport();
    await expect(page.getByText('0 of 1,000 characters')).toHaveCount(2);
    await expect(page.getByText('0 of 2,000 characters')).toBeVisible();

    await page.getByTestId('premise').fill('あ'.repeat(1_001));
    await expect(page.getByRole('alert')).toContainText('Remove 1 character to continue.');
    await expect(generate).toBeDisabled();

    await page.setViewportSize({ width: 393, height: 727 });
    await generate.scrollIntoViewIfNeeded();
    await expect(generate).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('saves a strict story, lists it, and opens it in the reader @smoke', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await expect(page.getByTestId('generate')).toBeEnabled();
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('saved-title')).toHaveText(STRICT_STORY.titleJa, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('open-story')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your story is ready' })).toHaveCount(1);

    // Grammar review and translation really ran; their saved summaries are the
    // durable result after the temporary waiting message disappears.
    await expect(page.getByTestId('saved-summaries')).toContainText('Translations: complete');
    await expect(page.getByTestId('saved-summaries')).toContainText('Grammar: reviewed');

    await expectNoSeriousAccessibilityViolations(page);

    await page.goto('./#/library');
    const card = page.locator('mn-reading-card').first();
    await expect(card).toContainText(STRICT_STORY.titleJa);
    await expect(card).toContainText(/\d+ characters/);
    await expect(card).not.toContainText('庭で遊びます');
    await expect(card).not.toContainText('Translations:');

    // The card's title is the link into the reader.
    await card.getByRole('link', { name: STRICT_STORY.titleJa }).click();
    await expect(page).toHaveURL(/#\/reader\//);
    // The reader renders one button per token, so the sentence is asserted
    // through its element rather than as one text node.
    const firstSentence = page.locator('mn-reader-sentence').first();
    await expect(firstSentence).toBeVisible({ timeout: 60_000 });
    await expect(firstSentence).toContainText('庭');
  });

  test('saves a word two repairs could not replace and marks it in the reader', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, {
      generation: {
        stories: [STORY_WITH_UNKNOWN],
        repairs: [STORY_WITH_UNKNOWN, STORY_WITH_UNKNOWN],
      },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();

    // The story is in the library, and nothing warns about it here: the word
    // itself carries the warning, in the reader.
    await expect(page.getByTestId('saved-title')).toHaveText(STORY_WITH_UNKNOWN.titleJa, {
      timeout: 60_000,
    });
    await page.getByTestId('open-story').click();
    await expect(page).toHaveURL(/#\/reader\//);
    const marked = page.locator('.is-warning-vocabulary');
    await expect(marked.first()).toBeVisible({ timeout: 60_000 });
    await expect(marked.first()).toContainText('図書館');

    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page).not.toHaveURL(/#\/generate/);
  });

  test('saves a story that undershoots the requested length @smoke', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, {
      generation: { stories: [SHORT_STORY] },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('saved-title')).toHaveText(SHORT_STORY.titleJa, {
      timeout: 60_000,
    });

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(1);
    expect(rows['sentences']).toBe(2);
    expect(rows['frozenValidations']).toBe(2);
    expect(rows['generationProvenance']).toBe(1);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('cancelling mid-run saves nothing', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    // The story request never answers, so the run really is interrupted.
    await stubOpenRouter(page, { chat: { kind: 'hang' } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('cancel-generation')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('premise')).toHaveCount(0);
    await expect(page.getByTestId('generation-copy')).toContainText('Generating your story');
    await expect(page.locator('mn-generation-wait svg')).toHaveCount(0);
    const dots = page.locator('.loading-dots');
    await expect(dots).toHaveText('...');
    const title = page.locator('.status-title');
    const firstTitleX = await title.evaluate((element) => element.getBoundingClientRect().x);
    await page.waitForTimeout(350);
    const secondTitleX = await title.evaluate((element) => element.getBoundingClientRect().x);
    expect(secondTitleX).toBe(firstTitleX);
    expect(
      await page
        .locator('.loading-dots__reveal')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toMatch(/dots-reveal$/);
    await page.getByTestId('cancel-generation').click();

    await expect(page.getByRole('heading', { name: 'Generation stopped', level: 2 })).toBeVisible();

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
    expect(rows['generationProvenance']).toBe(0);
  });

  test('cancelling during the auxiliary stage stores no translation at all @smoke', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    // Everything up to acceptance answers normally; both auxiliary branches
    // stay in flight, so the cancel lands exactly where the specification says
    // nothing may have been written yet.
    await prepareGeneration(page, {
      generation: {
        stories: [STRICT_STORY],
        grammar: ['hang'],
        translations: ['hang'],
      },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();

    await expect(page.getByTestId('generation-copy')).toContainText(
      'Reviewing grammar and translating',
      {
        timeout: 60_000,
      },
    );
    await page.getByTestId('cancel-generation').click();

    await expect(page.getByRole('heading', { name: 'Generation stopped', level: 2 })).toBeVisible();

    // The story is discarded, and so is every translation that a branch might
    // already have produced: nothing is written before the single save.
    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
    expect(rows['sentences']).toBe(0);
    expect(rows['translations']).toBe(0);
    expect(rows['grammarAnalyses']).toBe(0);
    expect(rows['generationProvenance']).toBe(0);
  });

  test('saves a story whose grammar review failed and whose translation is partial @smoke', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    // Fifteen sentences make two translation batches: the first is answered,
    // the second comes back incomplete and is rejected whole.
    await prepareGeneration(page, {
      generation: {
        stories: [LONG_STRICT_STORY],
        grammar: ['unavailable'],
        translations: ['ok', 'partial'],
      },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('generate').click();

    // Locally valid Japanese still saves: an auxiliary failure is not a story
    // failure.
    await expect(page.getByTestId('saved-title')).toHaveText(LONG_STRICT_STORY.titleJa, {
      timeout: 60_000,
    });

    const summaries = page.getByTestId('saved-summaries');
    await expect(summaries).toContainText('Grammar: unavailable');
    await expect(summaries).toContainText('Translations: 10 of 15');

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(1);
    expect(rows['translations']).toBe(10);
    expect(rows['grammarAnalyses']).toBe(0);

    await page.goto('./#/library');
    const card = page.locator('mn-reading-card').first();
    await expect(card).toContainText(LONG_STRICT_STORY.titleJa);
    await expect(card).not.toContainText('Grammar:');
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

test.describe('generating in the background', () => {
  test.use({ storageState: GENERATION_READY_STATE });

  test('keeps writing while the learner is in the library @smoke', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    // Both auxiliary branches stay in flight, so the run is still working for
    // as long as this test needs it to be.
    await prepareGeneration(page, {
      generation: { stories: [STRICT_STORY], grammar: ['hang'], translations: ['hang'] },
    });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();
    await expect(page.getByTestId('generation-copy')).toContainText(
      'Reviewing grammar and translating',
      { timeout: 60_000 },
    );

    // Leaving used to abandon the run. In-app navigation only: a reload cannot
    // resume a request that is already open.
    await page.getByLabel('Back to library').click();
    await expect(page).toHaveURL(/#\/library$/);

    const row = page.locator('mn-generation-job-card');
    await expect(row).toContainText(PREMISE);
    await expect(row).toContainText('Being written');
    await expect(row).toContainText('Reviewing grammar and translating');

    // The row leads back to the run it started, not to a fresh form.
    await row.getByRole('link').click();
    await expect(page.getByTestId('generation-screen')).toBeVisible();
    await expect(page.getByTestId('generation-copy')).toContainText(
      'Reviewing grammar and translating',
    );

    // A stopped run keeps its row, so a failure the learner was away for is
    // still there to deal with.
    await page.getByTestId('cancel-generation').click();
    await expect(page.getByRole('heading', { name: 'Generation stopped', level: 2 })).toBeVisible();
    await page.getByLabel('Back to library').click();
    await expect(row).toContainText('Needs attention');

    await row.getByRole('button', { name: `Dismiss ${PREMISE}` }).click();
    await expect(page.locator('mn-generation-job-card')).toHaveCount(0);
    expect((await countOwnedRows(page))['readings']).toBe(0);
  });

  test('puts the finished story in the library the learner walked back to', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await page.getByTestId('premise').fill(PREMISE);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('generate').click();
    await expect(page.getByTestId('generation-screen')).toBeVisible();

    await page.getByLabel('Back to library').click();

    // The story arrives where the learner is, and the row it replaces goes.
    await expect(page.getByRole('link', { name: STRICT_STORY.titleJa })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('mn-generation-job-card')).toHaveCount(0);
    expect((await countOwnedRows(page))['readings']).toBe(1);
  });
});
