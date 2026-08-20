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

function menu(page: Page): Locator {
  return page.locator('mn-sentence-menu');
}

/**
 * Opens the sentence menu the way the current input device would.
 *
 * Desktop clicks the punctuation between words, which is sentence whitespace
 * rather than a token button; touch long-presses the sentence.
 */
async function openSentenceMenu(page: Page, index = 0): Promise<void> {
  const target = sentence(page, index);
  if (page.viewportSize() !== null && (page.viewportSize()?.width ?? 0) >= 960) {
    await target.locator('.token.is-plain').first().click();
  } else {
    const box = await target.boundingBox();
    await target.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: box?.x ?? 0,
      clientY: box?.y ?? 0,
    });
    await expect(menu(page)).toBeVisible({ timeout: 5_000 });
  }
  await expect(menu(page)).toBeVisible();
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

async function chooseMenuEntry(page: Page, name: RegExp): Promise<void> {
  await menu(page).getByRole('button', { name }).click();
  await expect(menu(page)).not.toBeAttached();
}

/**
 * How many sentences the reading has stored translations for.
 *
 * Read from the panel's own summary rather than by counting rendered
 * translations, which only ever shows the mounted paragraph window.
 */
async function storedTranslationCount(page: Page): Promise<number> {
  const line = await page.locator('mn-reading-status-panel').innerText();
  if (line.includes('Translations: complete')) {
    return page.locator('.sentence').count();
  }
  const matched = /Translations: (\d+) of (\d+)/.exec(line);
  return matched === null ? 0 : Number(matched[1]);
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
  test('translates and analyzes one sentence, then serves both from cache', async ({ page }) => {
    const calls = await prepareReading(page, SAMPLE_TEXT);

    const afterSetup = callCount(calls);
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(callCount(calls), 'opening a reading makes no request').toBe(afterSetup);

    await openSentenceMenu(page);
    await chooseMenuEntry(page, /Translate sentence/);
    await expect(page.locator('mn-sentence-translation').first()).toContainText('EN:');
    expect(callCount(calls) - afterSetup).toBe(1);

    await openSentenceMenu(page);
    await chooseMenuEntry(page, /Analyze grammar/);
    await expect(page.locator('mn-sentence-grammar').first()).toBeVisible();
    expect(callCount(calls) - afterSetup).toBe(2);

    // A reload re-reads both from storage, and asks for nothing.
    await page.reload();
    await expect(page.locator('mn-sentence-translation').first()).toContainText('EN:');
    await expect(page.locator('mn-sentence-grammar').first()).toBeVisible();
    expect(callCount(calls) - afterSetup).toBe(2);

    // Axe over the reader with both aids expanded, and again with the sentence
    // menu open over them.
    await expectNoSeriousAccessibilityViolations(page);

    await openSentenceMenu(page);
    await waitForPopoverSettled(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('marks an analysis stale after a preset change and keeps both rows', async ({ page }) => {
    const calls = await prepareReading(page, SAMPLE_TEXT);
    const readerUrl = page.url();

    await openSentenceMenu(page);
    await chooseMenuEntry(page, /Analyze grammar/);
    await expect(page.locator('mn-sentence-grammar').first()).toBeVisible();
    const afterFirstAnalysis = callCount(calls);

    await page.goto('/#/grammar');
    await page.getByRole('radio', { name: /Everyday forms/ }).check();
    await expect(page.getByTestId('grammar-confirmation')).toContainText('Everyday forms');

    await page.goto(readerUrl);
    await expect(page.locator('mn-sentence-grammar .stale').first()).toContainText(
      'earlier grammar profile',
    );
    expect(callCount(calls), 'a stale aid is never refreshed on its own').toBe(afterFirstAnalysis);

    await openSentenceMenu(page);
    await chooseMenuEntry(page, /Re-analyze grammar/);

    await expect(page.locator('mn-sentence-grammar .stale')).toHaveCount(0);
    expect(callCount(calls) - afterFirstAnalysis).toBe(1);
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

    await openSentenceMenu(page);
    await chooseMenuEntry(page, /Translate sentence/);

    // The Japanese is untouched and the failure is offered as a retry.
    await expect(sentence(page)).toContainText('吾輩');
    await openSentenceMenu(page);
    await expect(menu(page).getByRole('button', { name: /Retry translation/ })).toBeVisible();

    await chooseMenuEntry(page, /Retry translation/);
    await expect(page.locator('mn-sentence-translation').first()).toContainText('EN:');
    expect(callCount(calls)).toBeGreaterThan(afterSetup);
  });

  test('opens word details as a popover that Escape closes', async ({ page }) => {
    await prepareReading(page, SAMPLE_TEXT);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();

    const details = page.locator('mn-word-inspector');
    await expect(details).toBeVisible();
    await expect(page.locator('.mn-popover-pane')).toBeVisible();
    await waitForPopoverSettled(page);
    await expectNoSeriousAccessibilityViolations(page);

    await page.keyboard.press('Escape');

    await expect(details).not.toBeAttached();
    await expect(token).toBeFocused();
  });
});

/**
 * End-to-end scenario 12: a whole-reading translation is cancelled mid-run,
 * survives a reload, and resumes over only what is still missing.
 */
test.describe('scenario 12 — whole-reading translation', () => {
  test('cancels mid-run, keeps what was translated, and resumes after a reload', async ({
    page,
  }) => {
    // The second batch never answers, so cancelling it is a real interruption.
    await stubOpenRouter(page, { generation: { translations: ['ok', 'hang'] } });
    await configureTextModel(page);
    await importReading(page, LONG_TEXT);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    const panel = page.locator('mn-reading-status-panel');
    await expect(panel).toContainText('Translations: none yet');

    await panel.getByRole('button', { name: 'Translate whole reading' }).click();
    await expect(panel.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.locator('mn-sentence-translation').first()).toBeVisible({ timeout: 30_000 });

    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toContainText('Sentences already translated were kept.');

    expect(await storedTranslationCount(page)).toBeGreaterThan(0);

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
    await expect(page.locator('mn-sentence-translation').first()).toBeVisible();
    expect(callCount(resumeCalls), 'opening an interrupted reading resumes nothing').toBe(0);

    await panel.getByRole('button', { name: /Translate whole reading|Retry the rest/ }).click();
    await expect(panel).toContainText('Translations: complete', { timeout: 30_000 });
    await expect(panel).toContainText('Translation finished.');

    // Only the sentences that were still missing were asked for: one batch,
    // not a second pass over the whole reading.
    expect(callCount(resumeCalls)).toBe(1);
  });
});
