import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import {
  SHORT_STORY,
  STORY_WITH_UNKNOWN,
  STRICT_STORY,
  openGenerate,
  prepareGeneration,
  reachPlots,
  writeStory,
} from './generation';
import { STUB_PLOTS, stubOpenRouter } from './openrouter';
import { countOwnedRows } from './reading';
import { GENERATION_READY_STATE } from './state';
import { expectSettingPersisted } from './storage';

/** The plot the stub drafts first, which is the one picked by default. */
const FIRST_PLOT = STUB_PLOTS[0];

/**
 * Setting up a key, a tested model, and a real vocabulary refresh loads two
 * workers and tokenizes sixty-two expressions, so these need more than the
 * default budget.
 */
const SETUP_TIMEOUT = 180_000;

/** One chip on the open Direction row. */
function chip(page: Page, axis: string, name: string) {
  return page.locator(`[data-axis="${axis}"] .chips`).getByRole('button', { name, exact: true });
}

async function openAxis(page: Page, axis: string): Promise<void> {
  const row = page.locator(`[data-axis="${axis}"]`);
  if ((await row.getAttribute('open')) === null) {
    await row.locator('summary').click();
  }
  await expect(row).toHaveAttribute('open', '');
}

test.describe('generate prerequisites', () => {
  test('names each missing prerequisite and links to the screen that fixes it @mobile @smoke', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    // Only what is missing is listed, one line each.
    await expect(page.locator('[data-check]')).toHaveCount(2);
    await expect(page.locator('[data-check="vocabulary"]')).toContainText('Add a word list');
    // Choosing words costs nothing; drafting plots is the first request.
    await expect(page.getByTestId('wizard-next')).toBeEnabled();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-next')).toBeDisabled();

    // Voice is optional, so it never appears here at all.
    await expect(page.getByText(/Voice \(optional\)/)).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('keeps the draft while the learner goes to fix a prerequisite', async ({ page }) => {
    await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('story-length').fill('2');
    await page.getByTestId('wizard-next').click();
    await chip(page, 'genre', 'Mystery').click();

    await page.locator('[data-check="text-model"]').getByRole('link').click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.getByRole('button', { name: 'Back to story' }).click();

    await expect(page.locator('[data-axis="genre"] [data-testid="axis-value"]')).toHaveText(
      'Mystery',
    );

    await page.locator('[data-check="vocabulary"]').getByRole('link').click();
    await expect(page).toHaveURL(/#\/reading-level\?from=generate(?:#words)?$/);
    await page.getByRole('button', { name: 'Back to story' }).click();

    await expect(chip(page, 'genre', 'Mystery')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Back to words' }).click();
    await expect(page.getByTestId('story-length')).toHaveValue('2');
  });

  test('makes no provider request while the form is only being filled in', async ({ page }) => {
    const calls = await stubOpenRouter(page);
    await openGenerate(page);

    await page.getByTestId('wizard-next').click();
    await chip(page, 'genre', 'Comedy').click();
    await page.getByTestId('surprise-direction').click();
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
    // The focus size belongs to Recently learned alone.
    await expect(page.getByTestId('focus-size-select')).toHaveCount(0);

    await page.getByTestId('word-priority-select').selectOption('recent');
    const focus = page.getByTestId('focus-size-select');
    await expect(focus).toHaveValue('50');
    await focus.selectOption('100');
    await expectSettingPersisted(page, 'app', 'recentFocusSize', 100);

    await page.reload();

    await expect(page.getByTestId('focus-size-select')).toHaveValue('100');
  });
});

test.describe('steering a story', () => {
  test.use({ storageState: GENERATION_READY_STATE });

  test('keeps the step action reachable and explains over-limit instructions @mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await openGenerate(page);
    await page.getByTestId('wizard-next').click();

    const next = page.getByTestId('wizard-next');
    await expect
      .poll(() =>
        next.evaluate((element) => getComputedStyle(element.closest('.action-bar')!).position),
      )
      .toBe('sticky');
    await expect(next).toBeInViewport();
    await expect(page.locator('#mn-instructions-count')).toHaveCount(0);

    await page.getByTestId('special-instructions').fill('あ'.repeat(800));
    await expect(page.locator('#mn-instructions-count')).toContainText('800 of 1,000 characters');

    await page.getByTestId('special-instructions').fill('あ'.repeat(1_001));
    await expect(page.getByRole('alert')).toContainText('Remove 1 character to continue.');
    await expect(next).toBeDisabled();

    await page.setViewportSize({ width: 393, height: 727 });
    await expect(next).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('chooses on one row at a time, keeps chips in place, and adds a custom choice', async ({
    page,
  }) => {
    await openGenerate(page);
    await page.getByTestId('wizard-next').click();

    const rows = page.locator('details.axis');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('details.axis[open]')).toHaveCount(1);
    await expect(page.locator('[data-axis="genre"]')).toHaveAttribute('open', '');

    const genreChips = page.locator('[data-axis="genre"] .chips button');
    const before = await genreChips.allTextContents();
    await chip(page, 'genre', 'Mystery').click();
    await chip(page, 'genre', 'Comedy').click();
    await chip(page, 'genre', 'Drama').click();
    expect(await genreChips.allTextContents()).toEqual(before);
    await expect(page.locator('[data-axis="genre"] [data-testid="axis-value"]')).toHaveText(
      'Comedy, Drama',
    );

    await openAxis(page, 'setting');
    await expect(page.locator('details.axis[open]')).toHaveCount(1);
    await page.locator('[data-axis="setting"] [data-custom-toggle]').click();
    const custom = page.getByTestId('custom-option');
    await expect(custom).toBeFocused();
    await custom.fill('Grandma’s kitchen');
    await custom.press('Enter');
    await expect(chip(page, 'setting', 'Grandma’s kitchen')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-axis="setting"] [data-custom-toggle]')).toBeFocused();

    // Escape closes the field without adding anything.
    await page.locator('[data-axis="setting"] [data-custom-toggle]').click();
    await page.getByTestId('custom-option').fill('Not this');
    await page.getByTestId('custom-option').press('Escape');
    await expect(page.getByTestId('custom-option')).toHaveCount(0);
    await expect(chip(page, 'setting', 'Not this')).toHaveCount(0);

    await page.getByTestId('surprise-direction').click();
    await expect(
      page.locator('[data-testid="axis-value"]').filter({ hasText: /^\s*Any\s*$/ }),
    ).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('sends the axes and three distinct turning points, then writes from the edited plot @smoke', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    // `prepareGeneration` keeps its route's record to itself; the newest route
    // answers, so this one records the bodies.
    const recorded = await stubOpenRouter(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await page.getByTestId('story-length').fill('0');
    await page.getByTestId('wizard-next').click();
    await chip(page, 'genre', 'Mystery').click();
    await openAxis(page, 'mood');
    await chip(page, 'mood', 'Heartwarming').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('plot-option')).toHaveCount(3);

    expect(recorded.plotRequests).toHaveLength(1);
    const plotRequest = recorded.plotRequests[0].user;
    expect(plotRequest.match(/^Genre: Mystery$/gm)).toHaveLength(3);
    expect(plotRequest.match(/^Mood: Heartwarming$/gm)).toHaveLength(3);
    const turns = [...plotRequest.matchAll(/^Turning point: (.+) \(/gm)].map((match) => match[1]);
    expect(turns).toHaveLength(3);
    expect(new Set(turns).size).toBe(3);
    // Setting was left on Any, so code rolled a different one for every card.
    expect(
      new Set([...plotRequest.matchAll(/^Setting: (.+)$/gm)].map((match) => match[1])).size,
    ).toBe(3);

    // The chips say who chose what: the learner's genre solid, rolled values dashed.
    const first = page.getByTestId('plot-option').first();
    await expect(first.locator('.mn-status-pill--dashed')).toHaveCount(3);
    await expect(first.locator('.mn-status-pill--accent')).toContainText('Turning point');

    await page.getByTestId('plot-option').nth(1).locator('input[type="radio"]').check();
    await page.getByTestId('plot-option').nth(1).getByTestId('edit-plot').click();
    const editor = page.getByTestId('plot-editor');
    await expect(editor).toBeFocused();
    const edited = `${STUB_PLOTS[1]} The dog comes too.`;
    await editor.fill(edited);
    await page.getByTestId('edit-plot').click();
    await expect(page.getByTestId('plot-option').nth(1)).toContainText('Edited');

    await page.getByTestId('generate').click();
    await expect(page.getByTestId('saved-title')).toHaveText(STRICT_STORY.titleJa, {
      timeout: 60_000,
    });

    expect(recorded.storyRequests).toHaveLength(1);
    const storyRequest = recorded.storyRequests[0].user;
    const premise = storyRequest.slice(storyRequest.indexOf('<<<MONOSAI_DATA premise'));
    expect(premise).toContain(`# Premise\n\n${edited}`);
    expect(premise).toContain('## Story direction');
    expect(premise).toContain('Genre: Mystery');
    expect(premise).toContain('Mood: Heartwarming');
  });

  test('regenerates every plot but the edited one, and goes back one step at a time', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    const calls = await stubOpenRouter(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await reachPlots(page);
    const texts = page.getByTestId('plot-text');
    const firstDraft = await texts.allTextContents();

    await page.getByTestId('edit-plot').click();
    await page.getByTestId('plot-editor').fill('My own plot about a lost glove.');
    await page.getByTestId('edit-plot').click();
    await page.getByTestId('regenerate-plots').click();

    await expect(texts.first()).toHaveText('My own plot about a lost glove.');
    await expect(texts.nth(1)).not.toHaveText(firstDraft[1]);
    await expect(texts.nth(2)).not.toHaveText(firstDraft[2]);
    expect(calls.plotRequests).toHaveLength(2);
    expect(calls.plotRequests[1].user).toContain('My own plot about a lost glove.');
    expect(calls.plotRequests[1].user.match(/^## Frame \d$/gm)).toHaveLength(2);

    // Back goes up one step; the plots were paid for and are still there.
    await page.getByRole('button', { name: 'Back to direction' }).click();
    await expect(page.getByRole('heading', { name: 'Direction', level: 2 })).toBeFocused();
    await page.getByTestId('wizard-next').click();
    await expect(texts.first()).toHaveText('My own plot about a lost glove.');
    expect(calls.plotRequests).toHaveLength(2);

    await page.getByRole('button', { name: 'Back to direction' }).click();
    await page.getByRole('button', { name: 'Back to words' }).click();
    await page.getByLabel('Back to library').click();
    await expect(page).toHaveURL(/#\/library$/);
  });

  test('says what failed when the plots cannot be drafted, and writes nothing', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    await stubOpenRouter(page, { plots: { kind: 'status', status: 429 } });

    await openGenerate(page);
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();

    await expect(page.getByTestId('plot-failure')).toContainText('Your choices are kept.');
    await expect(page.getByTestId('generate')).toBeDisabled();
    await expect(page.getByTestId('regenerate-plots')).toBeEnabled();
    expect((await countOwnedRows(page))['readings']).toBe(0);
  });
});

test.describe('generating a story', () => {
  test.use({ storageState: GENERATION_READY_STATE });

  test('saves a strict story, lists it, and opens it in the reader @smoke', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await writeStory(page);

    await expect(page.getByTestId('saved-title')).toHaveText(STRICT_STORY.titleJa, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('open-story')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your story is ready' })).toHaveCount(1);

    // The panel names what is still being made rather than reporting counts
    // that are all zero: the story is finished, its aids are not.
    await expect(page.getByTestId('saved-preparation')).toContainText(
      'Preparing English and grammar notes',
    );

    await expectNoSeriousAccessibilityViolations(page);

    await page.goto('./#/library');
    const card = page.locator('mn-reading-card').first();
    await expect(card).toContainText(STRICT_STORY.titleJa);
    // Home keeps a compact title and character count; the premise belongs to
    // the story, not the shelf row.
    await expect(card.locator('[mn-list-row-meta]')).toContainText(/\d+ characters/);
    await expect(card).not.toContainText(FIRST_PLOT);
    await expect(card).toContainText('Micro');
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

  test('saves a word the standard repair could not replace and marks it in the reader', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, {
      generation: {
        stories: [STORY_WITH_UNKNOWN],
        repairs: [STORY_WITH_UNKNOWN],
      },
    });

    await openGenerate(page);
    await writeStory(page);

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
    await writeStory(page);

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

  test('cancelling mid-run saves nothing, and hands the plots back', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    // The story request never answers, so the run really is interrupted. The
    // plots still arrive: they come before the story.
    await stubOpenRouter(page, { chat: { kind: 'hang' } });

    await openGenerate(page);
    await writeStory(page);

    await expect(page.getByTestId('cancel-generation')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plot-option')).toHaveCount(0);
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

    await page.getByRole('button', { name: 'Back to the form' }).click();
    await expect(page.getByTestId('plot-option')).toHaveCount(3);
    await expect(page.getByTestId('plot-text').first()).toHaveText(FIRST_PLOT);
  });

  test('puts the story in the library before its aids, then fills them in @smoke', async ({
    page,
  }) => {
    test.setTimeout(SETUP_TIMEOUT);
    // The aids answer slowly on purpose, so "the story is there and they are
    // not" is a state this test can stand in rather than a race it has to win.
    await prepareGeneration(page, {
      generation: {
        stories: [STRICT_STORY],
        grammar: ['ok'],
        translations: ['ok'],
        aidDelayMs: 2_000,
      },
    });

    await openGenerate(page);
    await writeStory(page);

    await expect(page.getByTestId('saved-title')).toHaveText(STRICT_STORY.titleJa, {
      timeout: 60_000,
    });

    // The save waited for nothing: the reading is whole and no aid row exists.
    const atSave = await countOwnedRows(page);
    expect(atSave['readings']).toBe(1);
    expect(atSave['sentences']).toBe(STRICT_STORY.sentences.length);
    expect(atSave['translations']).toBe(0);
    expect(atSave['grammarAnalyses']).toBe(0);
    await expect(page.getByTestId('saved-preparation')).toContainText(
      'Preparing English and grammar notes.',
    );

    await page.getByTestId('open-story').click();
    await expect(page).toHaveURL(/#\/reader\//);
    await expect(page.locator('mn-reader-sentence').first()).toBeVisible({ timeout: 60_000 });

    // The lane fills the declared layers in behind the open reader. Nothing is
    // reloaded and nothing is asked for: the aids simply become available.
    await expect
      .poll(async () => (await countOwnedRows(page))['translations'], { timeout: 60_000 })
      .toBe(STRICT_STORY.sentences.length);
    await expect
      .poll(async () => (await countOwnedRows(page))['grammarAnalyses'], { timeout: 60_000 })
      .toBe(STRICT_STORY.sentences.length);

    await page.locator('.sentence').first().click();
    const popover = page.locator('mn-sentence-popover');
    await expect(popover).toContainText('EN:');
    await expect(popover.getByRole('button', { name: 'Translate', exact: true })).toHaveCount(0);
  });

  test('reports a provider failure without adding anything to the library', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    await stubOpenRouter(page, { chat: { kind: 'status', status: 401 } });

    await openGenerate(page);
    await writeStory(page);

    await expect(page.getByTestId('failure-context')).toHaveCount(0, { timeout: 60_000 });

    const rows = await countOwnedRows(page);
    expect(rows['readings']).toBe(0);
  });
});

test.describe('generating in the background', () => {
  test.use({ storageState: GENERATION_READY_STATE });

  test('keeps writing while the learner is in the library @smoke', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });
    // The story request never answers, so the run is still working for as long
    // as this test needs it to be.
    await stubOpenRouter(page, { chat: { kind: 'hang' } });

    await openGenerate(page);
    await writeStory(page);
    await expect(page.getByTestId('generation-copy')).toContainText('Generating your story', {
      timeout: 60_000,
    });

    // Leaving used to abandon the run. In-app navigation only: a reload cannot
    // resume a request that is already open.
    await page.getByLabel('Back to library').click();
    await expect(page).toHaveURL(/#\/library$/);

    // The row is named by the plot the story is being written from.
    const row = page.locator('mn-generation-job-card');
    await expect(row).toContainText(FIRST_PLOT);
    await expect(row).toContainText('Being written');
    await expect(row).toContainText('Generating your story');

    // The row leads back to the run it started, not to a fresh form.
    await row.getByRole('link').click();
    await expect(page.getByTestId('generation-screen')).toBeVisible();
    await expect(page.getByTestId('generation-copy')).toContainText('Generating your story');

    // A stopped run keeps its row, so a failure the learner was away for is
    // still there to deal with.
    await page.getByTestId('cancel-generation').click();
    await expect(page.getByRole('heading', { name: 'Generation stopped', level: 2 })).toBeVisible();
    await page.getByLabel('Back to library').click();
    await expect(row).toContainText('Needs attention');

    await row.getByRole('button', { name: `Dismiss ${FIRST_PLOT}` }).click();
    await expect(page.locator('mn-generation-job-card')).toHaveCount(0);
    expect((await countOwnedRows(page))['readings']).toBe(0);
  });

  test('puts the finished story in the library the learner walked back to', async ({ page }) => {
    test.setTimeout(SETUP_TIMEOUT);
    await prepareGeneration(page, { generation: { stories: [STRICT_STORY] } });

    await openGenerate(page);
    await writeStory(page);
    await expect(page.getByTestId('generation-screen')).toBeVisible();

    await page.getByLabel('Back to library').click();

    // The story arrives where the learner is, and the row it replaces goes.
    await expect(page.getByRole('link', { name: STRICT_STORY.titleJa })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('mn-generation-job-card')).toHaveCount(0);
    expect((await countOwnedRows(page))['readings']).toBe(1);

    // A repeat story is Next, Next, Generate: the choices stay, the plots are new.
    await openGenerate(page);
    await reachPlots(page);
    await expect(page.getByTestId('plot-text').first()).not.toHaveText(FIRST_PLOT);
  });
});
