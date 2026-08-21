import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { configureTextModel, configureTts } from './generation';
import { countOwnedRows, importReading } from './reading';
import { stubOpenRouter, type ProviderCalls, type StubOptions } from './openrouter';

/** Four sentences: short enough to prepare in full, long enough to fail partway. */
const SENTENCE_COUNT = 4;
const TEXT = Array.from(
  { length: SENTENCE_COUNT },
  (_value, index) => `これは第${String(index)}の文です。`,
).join('');

function sentence(page: Page, index = 0): Locator {
  return page.locator('.sentence').nth(index);
}

function sentencePopover(page: Page): Locator {
  return page.locator('mn-sentence-popover');
}

/**
 * The audio panel. It is a popover, so it exists only while it is open — the
 * header's audio button is the only thing about audio that is always there.
 */
function audioPanel(page: Page): Locator {
  return page.getByRole('group', { name: 'Reading audio' });
}

function audioButton(page: Page): Locator {
  return page.locator('.bar-actions').getByRole('button', { name: /^Audio/ });
}

async function openAudioPanel(page: Page): Promise<void> {
  await audioButton(page).click();
  await expect(audioPanel(page)).toBeVisible();
}

/** Waits for a whole-reading run to finish, which is the panel becoming a transport. */
async function expectAudioReady(page: Page): Promise<void> {
  await expect(audioPanel(page).getByRole('button', { name: 'Play this reading' })).toBeVisible({
    timeout: 60_000,
  });
}

function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 960;
}

/**
 * Selects a sentence the way the current input device would.
 *
 * There is no control printed on the page either way — the press is the
 * control — so audio for one sentence is reached only through the popover.
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
  await expect(page.getByRole('group', { name: 'Reading actions' })).toBeVisible();
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
async function prepareReading(page: Page, options: StubOptions = {}): Promise<ProviderCalls> {
  const calls = await stubOpenRouter(page, { generation: {}, ...options });
  await configureTextModel(page);
  await configureTts(page);
  await importReading(page, TEXT);
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

    await selectSentence(page);
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
    await selectSentence(page);
    await sentenceAudioAction(page, 'Audio').click();
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible({ timeout: 15_000 });
    const afterFirst = synthesisCount(calls);

    // The same sentence again, in the same session.
    await dismissPopover(page);
    await selectSentence(page);
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible();
    expect(synthesisCount(calls), 'a stored clip is offered, not re-made').toBe(afterFirst);

    // And after a reload, which is where the cache has to survive.
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(callCount(calls), 'opening a reading makes no request at all').toBe(callCount(calls));
    await selectSentence(page);
    await expect(sentenceAudioAction(page, 'Play')).toBeVisible();
    expect(synthesisCount(calls)).toBe(afterFirst);
  });

  test('opens a reading with stored audio silently, and plays nothing', async ({ page }) => {
    const calls = await prepareReading(page);
    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    const afterPreparation = callCount(calls);
    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();

    // The panel is closed by the reload, so nothing about audio is on the page
    // until it is asked for again — and asking costs nothing.
    await expect(audioPanel(page)).toHaveCount(0);
    await openAudioPanel(page);

    expect(callCount(calls), 'opening a prepared reading requests nothing').toBe(afterPreparation);
    // Nothing autoplays: the transport is offered, and the reading is silent
    // until the learner presses play.
    await expect(audioPanel(page).getByRole('button', { name: 'Stop' })).toBeDisabled();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
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
    const calls = await prepareReading(page, {
      audioSequence: [
        { kind: 'valid' },
        { kind: 'valid' },
        { kind: 'valid' },
        { kind: 'status', status: 402, message: 'Refused' },
        { kind: 'valid' },
      ],
    });
    const afterSetup = synthesisCount(calls);

    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expect(audioPanel(page).getByText(/Stopped at sentence 3 of 4/)).toBeVisible({
      timeout: 60_000,
    });

    // The clips already produced are kept: they cost money and are exactly as
    // playable individually as they were.
    expect(await storedClipCount(page)).toBe(2);
    expect(synthesisCount(calls) - afterSetup, 'nothing after the failure was scheduled').toBe(3);

    // The gate stays shut: a set with a hole in it cannot be played end to end,
    // so the panel offers the failure and its recovery rather than a transport.
    await expect(audioPanel(page).getByRole('button', { name: 'Play this reading' })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Try again' }).click();
    await expectAudioReady(page);

    // Two more requests, for the sentence that failed and the one after it.
    expect(synthesisCount(calls) - afterSetup).toBe(5);
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  test('keeps completed clips when a run is stopped, and finishes them after a reload', async ({
    page,
  }) => {
    const calls = await prepareReading(page, { audioDelayMs: 500 });

    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    // Stopped in the middle rather than at the start, so what is asserted is
    // that finished clips survive rather than that none were made.
    await expect(audioPanel(page).getByText(/Sentence 2 of 4/)).toBeVisible({ timeout: 30_000 });
    await audioPanel(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(audioPanel(page).getByText(/Sentences already read aloud were kept/)).toBeVisible({
      timeout: 60_000,
    });

    const stopped = await storedClipCount(page);
    expect(stopped, 'stopping keeps what it produced').toBeGreaterThan(0);
    expect(stopped).toBeLessThan(SENTENCE_COUNT);
    const afterStop = synthesisCount(calls);

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(synthesisCount(calls), 'a stopped run is not restarted on open').toBe(afterStop);

    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    expect(synthesisCount(calls) - afterStop, 'only what was still missing was requested').toBe(
      SENTENCE_COUNT - stopped,
    );
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  test('plays the reading on request and stops on request', async ({ page }) => {
    await prepareReading(page);
    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);

    await audioPanel(page).getByRole('button', { name: 'Play this reading' }).click();

    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await expect(audioPanel(page).getByText(/Sentence \d+ of 4/)).toBeVisible();

    await audioPanel(page).getByRole('button', { name: 'Stop' }).click();

    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
    await expect(audioPanel(page).getByRole('button', { name: 'Stop' })).toBeDisabled();
  });

  test('clearing the audio cache stops playback and empties the summaries', async ({ page }) => {
    await prepareReading(page);
    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);
    await audioPanel(page).getByRole('button', { name: 'Play this reading' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Clear audio cache' }).click();
    await expect(page.getByText(/Audio cache cleared/)).toBeVisible();

    expect(await storedClipCount(page)).toBe(0);
  });

  test('deleting the reading stops playback', async ({ page }) => {
    await prepareReading(page);
    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);
    await audioPanel(page).getByRole('button', { name: 'Play this reading' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await page.keyboard.press('Escape');

    await openReaderMenu(page);
    await page.getByRole('button', { name: 'Delete reading' }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page).toHaveURL(/#\/library/);
    await expect(audioPanel(page)).toHaveCount(0);
    expect(await storedClipCount(page)).toBe(0);
  });

  test('the reader stays accessible with the player visible and a sentence open', async ({
    page,
  }) => {
    await prepareReading(page);
    await openAudioPanel(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioReady(page);
    await waitForPopoverSettled(page);

    await expectNoSeriousAccessibilityViolations(page);

    await page.keyboard.press('Escape');
    await selectSentence(page);
    await expect(sentencePopover(page)).toBeVisible();
    await waitForPopoverSettled(page);

    await expectNoSeriousAccessibilityViolations(page);
  });
});
