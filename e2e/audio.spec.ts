import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { configureTextModel, configureTts } from './generation';
import { countOwnedRows, importReading, openSentence } from './reading';
import { stubOpenRouter, type ProviderCalls, type StubOptions } from './openrouter';

/** Four sentences: short enough to prepare in full, long enough to fail partway. */
const SENTENCE_COUNT = 4;
const TEXT = Array.from(
  { length: SENTENCE_COUNT },
  (_value, index) => `これは第${String(index)}の文です。`,
).join('');

/**
 * The transport's Back control, which names both of the things it does: it
 * restarts the sentence being read, and steps back only at the start of one.
 */
const BACK_LABEL = 'Restart this sentence, or go back to the one before';

function sentencePopover(page: Page): Locator {
  return page.locator('mn-sentence-popover');
}

/** The fixed player is independent from the reader's CDK popovers. */
function audioPlayer(page: Page): Locator {
  return page.getByRole('region', { name: 'Reading audio' });
}

function audioButton(page: Page): Locator {
  return page.locator('.bar-actions').getByRole('button', { name: /^Audio/ });
}

async function openAudioPlayer(page: Page): Promise<void> {
  await audioButton(page).click();
  await expect(audioPlayer(page)).toBeVisible();
}

/** Waits for a whole-reading run to finish, which is the player becoming a transport. */
async function expectAudioReady(page: Page): Promise<void> {
  await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toBeVisible({
    timeout: 60_000,
  });
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

async function openReaderMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reading actions' }).click();
  await expect(page.getByRole('menu', { name: 'Reading actions' })).toBeVisible();
}

/** The sentence popover's own audio action, which is a label and nothing else. */
function sentenceAudioAction(page: Page, label: string): Locator {
  return sentencePopover(page).getByRole('button', { name: label, exact: true });
}

/** How many clips are stored, read from the database rather than the page. */
async function storedClipCount(page: Page): Promise<number> {
  return (await countOwnedRows(page))['audioAssets'] ?? 0;
}

function callCount(calls: ProviderCalls): number {
  return calls.urls.length;
}

/** How many synthesis requests have been made, ignoring text ones. */
function synthesisCount(calls: ProviderCalls): number {
  return calls.urls.filter((url) => url.includes('/audio/speech')).length;
}

/** A stubbed text model, a tested voice, and one imported reading in the reader. */
async function prepareReading(
  page: Page,
  text = TEXT,
  options: StubOptions = {},
): Promise<ProviderCalls> {
  const calls = await stubOpenRouter(page, { generation: {}, ...options });
  await configureTextModel(page);
  await configureTts(page);
  await importReading(page, text);
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
  return calls;
}

/**
 * End-to-end scenario 13: audio preparation, failure, cancellation, resumption,
 * completion, playback, and stopping.
 *
 * The rule Milestones 8B and 8C were built around extends to audio here:
 * opening a reading makes zero network requests, and nothing autoplays. Every
 * clip is paid for by an explicit action, and every sound follows a second one.
 */
test.describe('scenario 13 — audio preparation and playback', () => {
  test('generates audio for one sentence, and for that sentence only', async ({ page }) => {
    const calls = await prepareReading(page);
    const afterSetup = synthesisCount(calls);

    await openSentence(page);
    expect(synthesisCount(calls), 'opening a sentence synthesizes nothing').toBe(afterSetup);

    await sentenceAudioAction(page, 'Audio').click();
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible({ timeout: 15_000 });

    expect(synthesisCount(calls) - afterSetup, 'exactly one clip was requested').toBe(1);
    expect(await storedClipCount(page)).toBe(1);
  });

  test('serves a stored clip on a repeat and after a reload, without a request', async ({
    page,
  }) => {
    const calls = await prepareReading(page);
    await openSentence(page);
    await sentenceAudioAction(page, 'Audio').click();
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible({ timeout: 15_000 });
    const afterFirst = synthesisCount(calls);
    const callsAfterFirst = callCount(calls);

    // The same sentence again, in the same session.
    await dismissPopover(page);
    await openSentence(page);
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible();
    expect(synthesisCount(calls), 'a stored clip is offered, not re-made').toBe(afterFirst);

    // And after a reload, which is where the cache has to survive.
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(callCount(calls), 'opening a reading makes no request at all').toBe(callsAfterFirst);
    await openSentence(page);
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible();
    expect(synthesisCount(calls)).toBe(afterFirst);
  });

  test('opens a reading with stored audio silently, and plays nothing', async ({ page }) => {
    const calls = await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    const afterPreparation = callCount(calls);
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    // The player is closed by the reload, so nothing about audio is on the page
    // until it is asked for again — and asking costs nothing.
    await expect(audioPlayer(page)).toHaveCount(0);
    await openAudioPlayer(page);

    expect(callCount(calls), 'opening a prepared reading requests nothing').toBe(afterPreparation);
    // Nothing autoplays: the transport is offered, and the reading is silent
    // until the learner presses play.
    await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeDisabled();
    await expect(audioPlayer(page).getByRole('button', { name: 'Next sentence' })).toBeDisabled();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
  });

  test('opens the floating player before generation without a request or autoplay', async ({
    page,
  }) => {
    const calls = await prepareReading(page);
    const beforeOpen = callCount(calls);

    await expect(audioButton(page)).toHaveAttribute('aria-expanded', 'false');
    await openAudioPlayer(page);

    expect(callCount(calls), 'opening the player is local').toBe(beforeOpen);
    await expect(audioPlayer(page).getByRole('button', { name: 'Generate audio' })).toBeVisible();
    await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toHaveCount(0);
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(audioButton(page)).toHaveAttribute('aria-controls', 'reading-audio-player');
  });

  test('opens and closes from the header while a sentence popover is open', async ({ page }) => {
    await prepareReading(page);
    await openSentence(page);

    await audioButton(page).click();
    await expect(audioPlayer(page)).toBeVisible();
    await expect(sentencePopover(page)).toBeVisible();

    await audioButton(page).click();
    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(sentencePopover(page)).toBeVisible();
  });

  test('closing the player does not cancel generation', async ({ page }) => {
    await prepareReading(page, TEXT, { audioDelayMs: 2_000 });
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expect(audioPlayer(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await audioButton(page).click();
    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, being generated');

    await openAudioPlayer(page);
    await expect(
      audioPlayer(page).getByRole('button', { name: 'Stop', exact: true }),
    ).toBeVisible();
    await audioPlayer(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(audioPlayer(page).getByText('Stopped.')).toBeVisible({ timeout: 15_000 });
  });

  test('stays fixed at the bottom without horizontal overflow or dismissal', async ({ page }) => {
    await prepareReading(page, TEXT.repeat(20));
    await openAudioPlayer(page);

    const viewport = page.viewportSize();
    const initialBox = await audioPlayer(page).boundingBox();
    const style = await audioPlayer(page).evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return { position: computed.position, overflowY: computed.overflowY };
    });

    expect(style.position).toBe('fixed');
    expect(style.overflowY).toBe('auto');
    expect(initialBox).not.toBeNull();
    expect(initialBox?.x).toBeGreaterThanOrEqual(0);
    expect((initialBox?.x ?? 0) + (initialBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport?.width ?? 0,
    );
    expect((initialBox?.x ?? 0) + (initialBox?.width ?? 0) / 2).toBeCloseTo(
      (viewport?.width ?? 0) / 2,
      0,
    );
    expect(initialBox?.y ?? 0).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.mouse.click(2, 2);
    await page.keyboard.press('Escape');
    await expect(audioPlayer(page)).toBeVisible();

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const scrolledBox = await audioPlayer(page).boundingBox();
    expect(scrolledBox?.y).toBeCloseTo(initialBox?.y ?? 0, 0);
  });

  test('stops at the sentence that failed, keeps the earlier clips, and resumes there', async ({
    page,
  }) => {
    // The first entry answers the configuration test, which has to pass before
    // anything may be synthesized. Then two clips, then a refusal; the last
    // entry repeats, so the retry succeeds.
    //
    // 402 rather than a 5xx deliberately: the client auto-retries outages, so
    // the sentence that "fails" would otherwise succeed on a transport retry
    // and the run would never stop where this test needs it to.
    const calls = await prepareReading(page, TEXT, {
      audioSequence: [
        { kind: 'valid' },
        { kind: 'valid' },
        { kind: 'valid' },
        { kind: 'status', status: 402, message: 'Refused' },
        { kind: 'valid' },
      ],
    });
    const afterSetup = synthesisCount(calls);

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expect(audioPlayer(page).getByText(/Stopped at sentence 3 of 4/)).toBeVisible({
      timeout: 60_000,
    });

    // The clips already produced are kept: they cost money and are exactly as
    // playable individually as they were.
    expect(await storedClipCount(page)).toBe(2);
    expect(synthesisCount(calls) - afterSetup, 'nothing after the failure was scheduled').toBe(3);

    // The gate stays shut: a set with a hole in it cannot be played end to end,
    // so the player offers the failure and its recovery rather than a transport.
    await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Try again' }).click();
    await expectAudioReady(page);

    // Two more requests, for the sentence that failed and the one after it.
    expect(synthesisCount(calls) - afterSetup).toBe(5);
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  test('keeps completed clips when a run is stopped, and finishes them after a reload', async ({
    page,
  }) => {
    const calls = await prepareReading(page, TEXT, { audioDelayMs: 500 });

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    // Stopped in the middle rather than at the start, so what is asserted is
    // that finished clips survive rather than that none were made.
    await expect(audioPlayer(page).getByText(/Sentence 2 of 4/)).toBeVisible({ timeout: 30_000 });
    await audioPlayer(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(audioPlayer(page).getByText(/Sentences already read aloud were kept/)).toBeVisible(
      {
        timeout: 60_000,
      },
    );

    const stopped = await storedClipCount(page);
    expect(stopped, 'stopping keeps what it produced').toBeGreaterThan(0);
    expect(stopped).toBeLessThan(SENTENCE_COUNT);
    const afterStop = synthesisCount(calls);

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(synthesisCount(calls), 'a stopped run is not restarted on open').toBe(afterStop);

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    expect(synthesisCount(calls) - afterStop, 'only what was still missing was requested').toBe(
      SENTENCE_COUNT - stopped,
    );
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  test('plays the reading on request and stops through the header toggle', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();

    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await expect(audioPlayer(page).getByText(/Sentence \d+ of 4/)).toBeVisible();

    await audioButton(page).click();

    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, ready');
  });

  test('closing while paused clears the playback cursor', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, paused');
    await expect(audioPlayer(page).getByRole('button', { name: 'Resume' })).toBeVisible();

    await audioButton(page).click();

    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, ready');

    await openAudioPlayer(page);
    await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(audioPlayer(page).getByRole('button', { name: 'Resume' })).toHaveCount(0);
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeDisabled();
    await expect(audioPlayer(page).getByRole('button', { name: 'Next sentence' })).toBeDisabled();
  });

  test('navigates to the next and previous sentence without wrapping', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    await audioPlayer(page).getByRole('button', { name: 'Next sentence' }).click();
    await expect(audioPlayer(page).getByText('Sentence 2 of 4')).toBeVisible({ timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    // At the start of a sentence Back means the sentence before; a press once
    // one is under way restarts it instead, which the unit tests pin down.
    await audioPlayer(page).getByRole('button', { name: BACK_LABEL }).click();
    await expect(audioPlayer(page).getByText('Sentence 1 of 4')).toBeVisible({ timeout: 15_000 });
  });

  test('clearing the audio cache stops playback and empties the summaries', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);
    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Clear audio cache' }).click();
    await expect(page.getByText(/Audio cache cleared/)).toBeVisible();

    expect(await storedClipCount(page)).toBe(0);
  });

  test('deleting the reading stops playback', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);
    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await page.keyboard.press('Escape');

    await openReaderMenu(page);
    await page.getByRole('menuitem', { name: 'Delete reading' }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page).toHaveURL(/#\/library/);
    await expect(audioPlayer(page)).toHaveCount(0);
    expect(await storedClipCount(page)).toBe(0);
  });

  test('the reader stays accessible with the player visible and a sentence open', async ({
    page,
  }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    await expectNoSeriousAccessibilityViolations(page);

    await page.keyboard.press('Escape');
    await openSentence(page);
    await expect(sentencePopover(page)).toBeVisible();
    await expect(audioPlayer(page)).toBeVisible();
    await waitForPopoverSettled(page);

    await expectNoSeriousAccessibilityViolations(page);

    await dismissPopover(page);
    await page.locator('mn-reader-token button.token').first().click();
    await expect(page.getByRole('dialog', { name: 'Word details' })).toBeVisible();
    await expect(audioPlayer(page)).toBeVisible();
    await waitForPopoverSettled(page);

    await expectNoSeriousAccessibilityViolations(page);
  });
});
