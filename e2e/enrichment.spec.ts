import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { configureTextModel } from './generation';
import { countOwnedRows, importReading, SAMPLE_TEXT } from './reading';
import { stubOpenRouter, type ProviderCalls } from './openrouter';

/** Enough sentences for a whole-reading job to need more than one batch. */
const SENTENCE_COUNT = 14;
const LONG_TEXT = Array.from(
  { length: SENTENCE_COUNT },
  (_value, index) => `これは第${String(index)}の文です。`,
).join('');

function sentence(page: Page, index = 0): Locator {
  return page.locator('.sentence').nth(index);
}

function sentencePopover(page: Page): Locator {
  return page.locator('mn-sentence-popover');
}

function wordDetails(page: Page): Locator {
  return page.locator('mn-word-inspector');
}

function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 960;
}

/**
 * Selects a sentence the way the current input device would.
 *
 * Desktop presses the punctuation between words, which is sentence whitespace
 * rather than a token button; touch long-presses the sentence. There is no
 * control to click either way — the press is the control.
 */
async function selectSentence(page: Page, index = 0): Promise<void> {
  const target = sentence(page, index);
  if (isDesktop(page)) {
    await target.locator('.token.is-plain').first().click();
  } else {
    const box = await target.boundingBox();
    await target.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: (box?.x ?? 0) + 2,
      clientY: (box?.y ?? 0) + 2,
    });
  }
  await expect(sentencePopover(page)).toBeVisible({ timeout: 5_000 });
}

/** Opens the word popover, which is where grammar lives. */
async function openWord(page: Page, surface: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(surface) })
    .first()
    .click();
  await expect(wordDetails(page)).toBeVisible();
}

/**
 * Waits for the popover's entrance fade to finish.
 *
 * Axe measures contrast against the colour on screen, and a card caught at
 * one-fifth opacity fails a check that the settled card passes.
 */
async function waitForPopoverSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('.mn-popover-pane .popover')
        .evaluate((element) => window.getComputedStyle(element).opacity),
    )
    .toBe('1');
}

async function dismissPopover(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.mn-popover-pane')).toHaveCount(0);
}

/** How many translations are stored, read from the database rather than the page. */
async function storedTranslationCount(page: Page): Promise<number> {
  return (await countOwnedRows(page))['translations'] ?? 0;
}

/** How many OpenRouter requests have been made so far. */
function callCount(calls: ProviderCalls): number {
  return calls.urls.length;
}

/** Sets up a stubbed model and one imported reading, open in the reader. */
async function prepareReading(page: Page, text: string): Promise<ProviderCalls> {
  const calls = await stubOpenRouter(page, { generation: {} });
  await configureTextModel(page);
  await importReading(page, text);
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
  return calls;
}

/**
 * End-to-end scenario 11: one imported sentence is translated and analysed on
 * request, served from cache afterwards, and re-analysed after the grammar
 * profile changes.
 */
test.describe('scenario 11 — per-sentence translation and grammar', () => {
  test('keeps grammar labels compact and opens their Details disclosure by keyboard', async ({
    page,
  }) => {
    await stubOpenRouter(page, { generation: { grammar: ['finding'] } });
    await configureTextModel(page);
    await importReading(page, SAMPLE_TEXT);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }).click();
    await expect(
      sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }),
    ).toHaveCount(0);
    await dismissPopover(page);

    await openWord(page, '吾輩');
    const details = wordDetails(page);
    await expect(details.locator('.grammar-labels')).toContainText('te-form');
    const disclosure = details.locator('.grammar-details summary');
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(details.locator('.grammar-details')).toHaveAttribute('open', '');
    await expect(details.locator('.grammar-explanations')).toBeVisible();
  });

  test('translates one sentence and analyzes another, then serves both from cache', async ({
    page,
  }) => {
    const calls = await prepareReading(page, SAMPLE_TEXT);

    const afterSetup = callCount(calls);
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(callCount(calls), 'opening a reading makes no request').toBe(afterSetup);

    // Selecting a sentence is free; only the button inside it spends anything.
    await selectSentence(page);
    expect(callCount(calls), 'opening a sentence makes no request').toBe(afterSetup);

    await sentencePopover(page).getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(sentencePopover(page)).toContainText('EN:');
    expect(callCount(calls) - afterSetup).toBe(1);
    await dismissPopover(page);

    // Grammar is asked for on the sentence, where everything that spends a
    // request lives, and read back at the word it is about.
    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }).click();
    // Polled rather than asserted on the popover's text: an assertion that the
    // offer is gone passes vacuously while the popover is still rendering.
    await expect.poll(() => callCount(calls) - afterSetup, { timeout: 30_000 }).toBe(2);
    await expect(
      sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }),
    ).toHaveCount(0);
    await dismissPopover(page);

    // The grammar review found nothing to say, so the AI grammar section is
    // correctly absent (0 findings shows no notes, by design). The word lookup
    // remains a compact local dictionary/form lookup.
    await openWord(page, '猫');
    await expect(wordDetails(page).locator('.dictionary-form')).toHaveText('猫');
    await expect(wordDetails(page).locator('.form-line')).toHaveCount(0);
    await dismissPopover(page);

    // A reload re-reads both from storage, and asks for nothing.
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    await selectSentence(page);
    await expect(sentencePopover(page)).toContainText('EN:');
    expect(callCount(calls) - afterSetup).toBe(2);

    await waitForPopoverSettled(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('keeps the reading surface free of English however much is stored', async ({ page }) => {
    const calls = await prepareReading(page, SAMPLE_TEXT);
    const afterSetup = callCount(calls);

    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(sentencePopover(page)).toContainText('EN:');
    await dismissPopover(page);

    // The translation exists, and the page it belongs to is unchanged by it.
    expect(await storedTranslationCount(page)).toBe(1);
    await expect(page.locator('article.text')).not.toContainText('EN:');
    expect(callCount(calls) - afterSetup).toBe(1);
  });

  test('marks an analysis stale after a preset change and keeps both rows', async ({ page }) => {
    const calls = await prepareReading(page, SAMPLE_TEXT);
    const readerUrl = page.url();
    const afterSetup = callCount(calls);

    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }).click();
    await expect.poll(() => callCount(calls), { timeout: 30_000 }).toBeGreaterThan(afterSetup);
    await expect(
      sentencePopover(page).getByRole('button', { name: 'Grammar', exact: true }),
    ).toHaveCount(0);
    const afterFirstAnalysis = callCount(calls);
    await dismissPopover(page);

    await page.goto('/#/grammar');
    await page.getByRole('radio', { name: /Everyday forms/ }).check();
    await expect(page.getByTestId('grammar-confirmation')).toContainText('Everyday forms');

    await page.goto(readerUrl);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(callCount(calls), 'a stale aid is never refreshed on its own').toBe(afterFirstAnalysis);

    await openWord(page, '猫');
    await expect(wordDetails(page)).toContainText('earlier grammar profile');
    await dismissPopover(page);

    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Grammar again', exact: true }).click();
    await expect.poll(() => callCount(calls) - afterFirstAnalysis, { timeout: 30_000 }).toBe(1);
    await expect(
      sentencePopover(page).getByRole('button', { name: 'Grammar again', exact: true }),
    ).toHaveCount(0);
    expect((await countOwnedRows(page))['grammarAnalyses'], 'the earlier analysis is kept').toBe(2);
  });

  test('keeps the sentence readable when a translation fails, and retries it', async ({ page }) => {
    const calls = await stubOpenRouter(page, {
      // Prose twice, so the adapter's one format recovery is spent too and the
      // request genuinely fails; the third answer is what the retry gets.
      generation: { translations: ['unavailable', 'unavailable', 'ok'] },
    });
    await configureTextModel(page);
    await importReading(page, SAMPLE_TEXT);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    const afterSetup = callCount(calls);

    await selectSentence(page);
    await sentencePopover(page).getByRole('button', { name: 'Translate', exact: true }).click();

    // The Japanese is untouched and the failure is offered as a retry.
    await expect(sentence(page)).toContainText('吾輩');
    await expect(sentencePopover(page).getByRole('alert')).toBeVisible({ timeout: 30_000 });

    await sentencePopover(page)
      .getByRole('button', { name: 'Translate again', exact: true })
      .click();
    await expect(sentencePopover(page)).toContainText('EN:', { timeout: 30_000 });
    expect(callCount(calls)).toBeGreaterThan(afterSetup);
  });

  test('opens one floating surface at a time, and closes it on Escape', async ({ page }) => {
    await prepareReading(page, SAMPLE_TEXT);

    await selectSentence(page);
    await expect(sentencePopover(page)).toBeVisible();

    // An open surface takes the next press as a dismissal, so reading the text
    // underneath is never a click that does two things at once.
    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await dismissPopover(page);

    await token.click();
    await expect(wordDetails(page)).toBeVisible();
    await expect(sentencePopover(page)).toHaveCount(0);
    await waitForPopoverSettled(page);
    await expectNoSeriousAccessibilityViolations(page);

    await page.keyboard.press('Escape');
    await expect(wordDetails(page)).not.toBeAttached();
    await expect(token).toBeFocused();
  });

  test('reaches the sentence from the word, without a pointer', async ({ page }) => {
    // The keyboard has no whitespace to aim at, so the route in is the word.
    // The control is laid out only while it holds focus.
    await prepareReading(page, SAMPLE_TEXT);

    await openWord(page, '猫');
    const route = wordDetails(page).getByRole('button', { name: 'Open this sentence' });
    await route.focus();
    await expect(route).toBeVisible();
    await route.press('Enter');

    await expect(sentencePopover(page)).toBeVisible();
    await expect(wordDetails(page)).toHaveCount(0);
  });
});

/**
 * End-to-end scenario 12: a whole-reading translation is cancelled mid-run,
 * survives a reload, and resumes over only what is still missing.
 */
test.describe('scenario 12 — whole-reading translation', () => {
  function progress(page: Page): Locator {
    return page.locator('mn-translation-progress');
  }

  async function startWholeReadingTranslation(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Reading actions' }).click();
    await page.getByRole('menuitem', { name: 'Translate reading' }).click();
  }

  test('cancels mid-run, keeps what was translated, and resumes after a reload', async ({
    page,
  }) => {
    // The second batch never answers, so cancelling it is a real interruption.
    await stubOpenRouter(page, { generation: { translations: ['ok', 'hang'] } });
    await configureTextModel(page);
    await importReading(page, LONG_TEXT);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    // Nothing reports on the reading until a job is actually running.
    await expect(progress(page).locator('.job')).toHaveCount(0);

    await startWholeReadingTranslation(page);
    await expect(progress(page).getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect.poll(() => storedTranslationCount(page), { timeout: 30_000 }).toBeGreaterThan(0);

    await progress(page).getByRole('button', { name: 'Stop' }).click();
    await expect(progress(page)).toContainText('Sentences already translated were kept.');

    // The cancelled batch's request is still held open by the stub, which is
    // what made it cancellable. It is released here so the resumed run is
    // measured against a stub that only the resume has used.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const resumeCalls = await stubOpenRouter(page, { generation: { translations: ['ok'] } });

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    // Part of the reading is translated and part is not, all of it survived the
    // reload, and nothing resumed on its own.
    const storedAfterReload = await storedTranslationCount(page);
    expect(storedAfterReload).toBeGreaterThan(0);
    expect(storedAfterReload).toBeLessThan(SENTENCE_COUNT);
    await expect(progress(page).locator('.job')).toHaveCount(0);
    expect(callCount(resumeCalls), 'opening an interrupted reading resumes nothing').toBe(0);

    await startWholeReadingTranslation(page);
    await expect(progress(page)).toContainText('Translation finished.', { timeout: 30_000 });
    expect(await storedTranslationCount(page)).toBe(SENTENCE_COUNT);

    // Only the sentences that were still missing were asked for: one batch,
    // not a second pass over the whole reading.
    expect(callCount(resumeCalls)).toBe(1);

    // And the report leaves the reader when it is dismissed.
    await progress(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(progress(page).locator('.job')).toHaveCount(0);
  });
});
