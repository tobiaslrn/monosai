import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { countOwnedRows, importReading, openSentence } from './reading';
import { stubOpenRouter, type ProviderCalls, type StubOptions } from './openrouter';
import { TTS_READY_STATE } from './state';

/** Four sentences: short enough to prepare in full, long enough to fail partway. */
const SENTENCE_COUNT = 4;
const TEXT = Array.from(
  { length: SENTENCE_COUNT },
  (_value, index) => `これは第${String(index)}の文です。`,
).join('');

/**
 * Eight sentences: two full batches through the four-way queue.
 *
 * A reading that fits in one batch can never show a frontier, a refilled
 * queue, or a run that is still going while its beginning is being played.
 */
const LONG_SENTENCE_COUNT = 8;
const LONG_TEXT = Array.from(
  { length: LONG_SENTENCE_COUNT },
  (_value, index) => `これは第${String(index)}の長い文です。`,
).join('');

/** How many requests the job keeps open at once. */
const CONCURRENCY = 4;

/**
 * The transport's Back control, which names both of the things it does: it
 * restarts the sentence being read, and steps back only at the start of one.
 */
const BACK_LABEL = 'Restart this sentence, or go back to the one before';

/** The study posture that makes the reading stop at every sentence seam. */
const STEP_MODE_LABEL = 'One sentence at a time';

/**
 * How much of the reading has audio, read off the track.
 *
 * A run in progress prints no count any more — the quiet fill behind the
 * playback position is the whole report — so a test that needs to be sure a run
 * has produced something reads the bar rather than a sentence about it.
 */
async function generatedPercent(page: Page): Promise<number> {
  const width = await audioPlayer(page)
    .locator('.track .fill.generated')
    .evaluate((fill) => (fill as HTMLElement).style.inlineSize);
  return Number.parseFloat(width) || 0;
}

function sentencePopover(page: Page): Locator {
  return page.locator('mn-sentence-popover');
}

/** The fixed player is independent from the reader's CDK popovers. */
function audioPlayer(page: Page): Locator {
  return page.getByRole('region', { name: 'Reading audio' });
}

/**
 * What the player says, which is no longer what it prints.
 *
 * The card is two rows of controls and no prose: the position, the run and
 * every failure live in a hidden live region, so this is where the wording is
 * asserted.
 */
function playerStatus(page: Page): Locator {
  return audioPlayer(page).locator('[role="status"]');
}

function audioButton(page: Page): Locator {
  return page.locator('.bar-actions').getByRole('button', { name: /^Audio/ });
}

async function openAudioPlayer(page: Page): Promise<void> {
  await audioButton(page).click();
  await expect(audioPlayer(page)).toBeVisible();
}

/** Waits for the first clip, which is the point playback becomes possible. */
async function expectAudioPlayable(page: Page): Promise<void> {
  await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toBeEnabled({
    timeout: 60_000,
  });
}

/**
 * Waits for a whole-reading run to finish.
 *
 * Play appearing no longer means the run is over — it means the first clip
 * exists — so completeness is asserted through the offer to prepare the
 * remainder disappearing.
 */
async function expectAudioComplete(page: Page, total = SENTENCE_COUNT): Promise<void> {
  // The whole of what the player says, not a fragment of it: "Stopped with 2 of
  // 8 sentences ready." contains "8 sentences ready" too, and matching that
  // called a run that had failed a run that had finished.
  await expect(playerStatus(page)).toHaveText(`${String(total)} sentences ready`, {
    timeout: 60_000,
  });
  await expect(audioPlayer(page).getByRole('button', { name: 'Generate audio' })).toHaveCount(0);
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

/**
 * Stops a run from where that action lives.
 *
 * Not in the player: it is a reading-level audio action beside Delete audio,
 * and a permanent row for it made a card that floats over the reading taller
 * than the controls in it.
 */
async function stopGenerating(page: Page): Promise<void> {
  await openReaderMenu(page);
  await page.getByRole('menuitem', { name: 'Stop generating audio' }).click();
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
  test.use({ storageState: TTS_READY_STATE });

  test('generates audio for one sentence, and for that sentence only @smoke', async ({ page }) => {
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
    await expectAudioComplete(page);

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
    await expect(
      audioPlayer(page).getByRole('button', { name: 'Next sentence with audio' }),
    ).toBeDisabled();
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
    // A reading with no audio has nothing to play, so the button in the middle
    // is the one that makes it. The rest of the transport is reserved rather
    // than conditional, so the docked card does not change height under the
    // reading when the first clip lands.
    await expect(audioPlayer(page).getByRole('button', { name: 'Generate audio' })).toBeVisible();
    await expect(audioPlayer(page).getByRole('button', { name: 'Play' })).toHaveCount(0);
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeDisabled();
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
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, being generated', {
      timeout: 15_000,
    });

    await audioButton(page).click();
    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, being generated');

    await openAudioPlayer(page);
    await stopGenerating(page);
    await expect(playerStatus(page)).toContainText(/Stopped/, { timeout: 15_000 });
  });

  test('stays fixed at the bottom without horizontal overflow or dismissal @mobile', async ({
    page,
  }) => {
    await prepareReading(page, TEXT.repeat(20));
    await openAudioPlayer(page);

    const viewport = page.viewportSize();
    const initialBox = await audioPlayer(page).boundingBox();
    const style = await audioPlayer(page).evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return { position: computed.position, overflowY: computed.overflowY };
    });

    expect(style.position).toBe('fixed');
    // Nothing inside can grow any more — the card is two rows of controls and
    // no prose — so it never scrolls and never needs a bounded height.
    expect(style.overflowY).toBe('visible');
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

  test('fails fast, keeps the clips that arrived, and retries only the rest @smoke', async ({
    page,
  }) => {
    // The model compatibility test lives in the setup project, so the sequence
    // begins at the first synthesis request: the first batch of four is two
    // clips, a refusal, and a fourth clip. The last entry repeats, which is
    // what lets the retry finish everything still missing.
    //
    // 402 rather than a 5xx deliberately: the client auto-retries outages, so
    // the request that "fails" would otherwise succeed on a transport retry and
    // the run would never stop where this test needs it to.
    const calls = await prepareReading(page, LONG_TEXT, {
      audioSequence: [
        { kind: 'valid' },
        { kind: 'valid' },
        { kind: 'status', status: 402, message: 'Refused' },
        { kind: 'valid' },
        { kind: 'valid' },
      ],
    });
    const afterSetup = synthesisCount(calls);

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expect(playerStatus(page)).toContainText(/Stopped with \d+ of 8 sentences ready/, {
      timeout: 60_000,
    });

    // The clips already produced are kept: they cost money and are exactly as
    // playable individually as they were. Nothing beyond the first batch was
    // ever scheduled.
    expect(synthesisCount(calls) - afterSetup, 'the queue was abandoned, not drained').toBe(
      CONCURRENCY,
    );
    // Between one and three, not exactly three: the abort races the siblings
    // that had already been sent, so a request that had not answered yet is
    // cancelled rather than paid for. Which of them wins is the provider's
    // timing, and pinning it would be pinning the race.
    const kept = await storedClipCount(page);
    expect(kept, 'the clips that arrived were kept').toBeGreaterThan(0);
    expect(kept, 'the refused sentence produced nothing').toBeLessThan(CONCURRENCY);

    // A transport is offered at all, which is the whole difference from the
    // complete-set gate this replaced: a failed run used to leave the player
    // with nothing but its failure.
    //
    // Which sentence the refusal landed on is not asserted. The stub answers
    // in arrival order and four requests are in flight, so the 402 may reach
    // any of the first batch — including sentence one, which would correctly
    // leave Play disabled while the rest stays playable.
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expectAudioComplete(page, LONG_SENTENCE_COUNT);

    expect(
      synthesisCount(calls) - afterSetup - CONCURRENCY,
      'only the clips that were still missing were asked for again',
    ).toBe(LONG_SENTENCE_COUNT - kept);
    expect(await storedClipCount(page)).toBe(LONG_SENTENCE_COUNT);
  });

  /**
   * One sentence that will never be read used to end the run where it was met:
   * the sentences after it were never attempted, and Try again spent a request
   * per missing sentence to reproduce the same answer for as long as it was
   * pressed. The run now carries on past the hole and reports it, and the offer
   * to run it again is withdrawn once attempts have stopped producing clips.
   */
  test('carries on past a sentence it cannot read, and withdraws a dead retry', async ({
    page,
  }) => {
    // 503 rather than 402: an outage is retried by the transport and then
    // recorded as a failure of that sentence, where a refusal the client reads
    // as configuration-wide would correctly stop the whole run.
    const calls = await prepareReading(page, LONG_TEXT, {
      audioByText: (text) =>
        text.includes('第2の') ? { kind: 'status', status: 503, message: 'Unavailable' } : null,
    });
    const afterSetup = synthesisCount(calls);
    const player = audioPlayer(page);

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();

    // Seven of eight, which is the whole point: the five sentences after the
    // dead one were read rather than abandoned with it.
    await expect(playerStatus(page)).toContainText(
      `Stopped with ${String(LONG_SENTENCE_COUNT - 1)} of ${String(LONG_SENTENCE_COUNT)} sentences ready`,
      { timeout: 60_000 },
    );
    expect(await storedClipCount(page)).toBe(LONG_SENTENCE_COUNT - 1);
    const afterFirstRun = synthesisCount(calls);

    // One more attempt is offered, because an outage that has passed looks
    // exactly like this. It asks only for the sentence that is missing.
    const stopping = player.getByRole('button', { name: 'Stop generating audio' });
    await player.getByRole('button', { name: 'Try again' }).click();
    await expect(stopping).toBeVisible({ timeout: 30_000 });
    await expect(stopping).toHaveCount(0, { timeout: 60_000 });
    const spentOnRetry = synthesisCount(calls) - afterFirstRun;
    expect(spentOnRetry, 'a retry asks only for what is still missing').toBeLessThan(
      LONG_SENTENCE_COUNT,
    );
    expect(spentOnRetry, 'the missing sentence was asked for again').toBeGreaterThan(0);

    // The second attempt that produces nothing takes the offer away, and says
    // why rather than leaving the learner to discover it a press at a time.
    await player.getByRole('button', { name: 'Try again' }).click();
    await expect(stopping).toBeVisible({ timeout: 30_000 });
    await expect(stopping).toHaveCount(0, { timeout: 60_000 });
    await expect(player.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(playerStatus(page)).toContainText('Trying again produced nothing');

    const afterSecondRetry = synthesisCount(calls);
    await page.waitForTimeout(500);
    expect(synthesisCount(calls), 'nothing is spent once the retry is withdrawn').toBe(
      afterSecondRetry,
    );

    // What did arrive is still playable, and putting the report away leaves the
    // player with the transport rather than the failure.
    await player.getByRole('button', { name: 'Dismiss' }).click();
    await expect(player.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(synthesisCount(calls) - afterSetup).toBeGreaterThan(0);
  });

  test('never opens more than four synthesis requests at once', async ({ page }) => {
    const calls = await prepareReading(page, LONG_TEXT, { audioDelayMs: 300 });

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page, LONG_SENTENCE_COUNT);

    expect(calls.audio.peakConcurrency, 'the queue is bounded').toBe(CONCURRENCY);
    expect(await storedClipCount(page)).toBe(LONG_SENTENCE_COUNT);
  });

  test('plays the prepared beginning while the rest is still being made', async ({ page }) => {
    const calls = await prepareReading(page, LONG_TEXT, { audioDelayMs: 3_000 });

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioPlayable(page);

    // The run is still going, and the track is the only thing that says so: a
    // prefix has audio and the rest of the reading does not.
    expect(await generatedPercent(page)).toBeGreaterThan(0);
    expect(await generatedPercent(page)).toBeLessThan(100);
    expect(await storedClipCount(page)).toBeLessThan(LONG_SENTENCE_COUNT);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    expect(synthesisCount(calls), 'playing asks for nothing').toBeLessThanOrEqual(
      LONG_SENTENCE_COUNT + 1,
    );
  });

  test('waits where generation has got to, and reads on when the clip arrives', async ({
    page,
  }) => {
    // The second batch is held long enough that starting at the last sentence
    // of the first one is guaranteed to reach the frontier.
    await prepareReading(page, LONG_TEXT, { audioDelayMs: 3_000 });

    await openAudioPlayer(page);
    await audioPlayer(page).getByRole('button', { name: 'Generate audio' }).click();
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, being generated', {
      timeout: 15_000,
    });

    // Closing the player does not cancel the run, so the selection can be made
    // and captured while the first batch is still being prepared. The popover
    // is dismissed afterwards: the player captured the sentence on open, and a
    // modal popover would swallow the click on the transport beneath it.
    await audioButton(page).click();
    await expect(audioPlayer(page)).toHaveCount(0);
    await openSentence(page, CONCURRENCY - 1);
    await openAudioPlayer(page);
    await dismissPopover(page);

    const startHere = audioPlayer(page).getByRole('button', { name: 'Start from this sentence' });
    await expect(startHere).toBeVisible({ timeout: 60_000 });

    await startHere.click();
    await expect(playerStatus(page)).toContainText(`Sentence ${String(CONCURRENCY)} of 8`, {
      timeout: 15_000,
    });

    // Playback catches generation and says so rather than stopping.
    await expect(playerStatus(page)).toContainText(
      `Waiting for sentence ${String(CONCURRENCY + 1)} of 8`,
      { timeout: 30_000 },
    );

    // And reads on by itself once the clip it was waiting for is stored.
    await expect(playerStatus(page)).toContainText(`Sentence ${String(CONCURRENCY + 1)} of 8`, {
      timeout: 30_000,
    });
  });

  test('keeps completed clips when a run is stopped, and finishes them after a reload', async ({
    page,
  }) => {
    // Eight sentences through a four-wide queue, so there is a second batch to
    // stop before: a reading that fits in one batch is finished before a click
    // on Stop could land.
    const calls = await prepareReading(page, LONG_TEXT, { audioDelayMs: 2_000 });

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    // Stopped between the batches rather than at the start, so what is asserted
    // is that finished clips survive rather than that none were made.
    await expect.poll(() => generatedPercent(page), { timeout: 60_000 }).toBeGreaterThan(0);
    await stopGenerating(page);
    await expect(playerStatus(page)).toContainText(/Stopped with \d+ of 8 sentences ready/, {
      timeout: 60_000,
    });

    const stopped = await storedClipCount(page);
    expect(stopped, 'stopping keeps what it produced').toBeGreaterThan(0);
    expect(stopped).toBeLessThan(LONG_SENTENCE_COUNT);
    const afterStop = synthesisCount(calls);

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    expect(synthesisCount(calls), 'a stopped run is not restarted on open').toBe(afterStop);

    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page, LONG_SENTENCE_COUNT);

    expect(synthesisCount(calls) - afterStop, 'only what was still missing was requested').toBe(
      LONG_SENTENCE_COUNT - stopped,
    );
    expect(await storedClipCount(page)).toBe(LONG_SENTENCE_COUNT);
  });

  /**
   * Hiding the card to read the text underneath is not "stop reading to me".
   * Closing used to be the only stop there was, so it silenced the reading;
   * the transport now has a Stop of its own, and that is the one that stops.
   */
  test('plays the reading on request and keeps playing behind a closed player', async ({
    page,
  }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();

    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await expect(playerStatus(page)).toContainText(/Sentence \d+ of 4/);

    await audioButton(page).click();

    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', /^Audio, (playing|finished)/);

    // Reopening lands back on the live session rather than on a fresh player.
    await openAudioPlayer(page);
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, paused');
    await expect(audioPlayer(page).getByRole('button', { name: 'Resume' })).toBeVisible();
  });

  test('keeps a paused session across closing and reopening the player', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, paused');

    await audioButton(page).click();
    await expect(audioPlayer(page)).toHaveCount(0);
    await expect(audioButton(page)).toHaveAttribute('aria-label', 'Audio, paused');

    await openAudioPlayer(page);
    await expect(audioPlayer(page).getByRole('button', { name: 'Resume' })).toBeVisible();

    // The cursor is kept, and the sentence stays marked: a paused session is a
    // session, and there is no control that throws one away any more.
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1);
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeEnabled();
  });

  /**
   * Back at position one used to call stop: the session was torn down, the
   * cursor cleared, and the header reverted to "Audio, ready" — at the one
   * position where its own label promises to restart the sentence.
   */
  test('restarts the first sentence rather than ending the session @smoke', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(playerStatus(page)).toContainText('Sentence 1 of 4', { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    await audioPlayer(page).getByRole('button', { name: BACK_LABEL }).click();

    await expect(playerStatus(page)).toContainText('Sentence 1 of 4');
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1);
    await expect(audioButton(page)).not.toHaveAttribute('aria-label', 'Audio, ready');
  });

  /**
   * Reaching the end used to read as a reset: the bar dropped to zero, the
   * highlight vanished, and Back went dead, so a reading that had just been
   * read aloud looked exactly like one that had never been started.
   */
  test('says a reading finished rather than resetting the player', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();

    await expect(playerStatus(page)).toContainText('Finished', { timeout: 30_000 });
    await expect(audioPlayer(page).getByRole('button', { name: BACK_LABEL })).toBeEnabled();
    await expect(audioPlayer(page).getByRole('button', { name: 'Play again' })).toBeEnabled();
    // The track is a slider now: the thumb rests on the last sentence rather
    // than snapping back to the start of a reading that has just been read.
    await expect(
      audioPlayer(page).getByRole('slider', { name: 'Position in this reading' }),
    ).toHaveValue(String(SENTENCE_COUNT));
  });

  /**
   * Following a reading means keeping the sentence being read where it can be
   * read. Measured against the window rather than against what is left of it, a
   * sentence sitting behind the docked player counted as on screen, so following
   * downwards stopped at the first sentence to reach the player and left the
   * learner listening to something they could not see.
   */
  test('keeps the sentence being read clear of the header and the player @smoke', async ({
    page,
  }) => {
    // Short enough to prepare quickly, in a window short enough to scroll.
    // Separate paragraphs rather than one run of text: the reading has to be
    // taller than the window for parking a sentence to mean anything.
    await page.setViewportSize({ width: 900, height: 420 });
    await prepareReading(page, Array.from({ length: 6 }, () => TEXT).join('\n\n'));
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page, SENTENCE_COUNT * 6);

    // Into the middle of the reading, so there is document on both sides of the
    // cursor to scroll through. Dragging the track of a session that is not
    // playing moves the cursor and stays silent, which is all this needs.
    const track = audioPlayer(page).getByRole('slider', { name: 'Position in this reading' });
    await track.fill(String(SENTENCE_COUNT * 3));
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    // Park the sentence Next is about to move to inside the window but behind
    // the player, which is the one position the window test called visible.
    const parked = await page.evaluate(() => {
      const sentences = [...document.querySelectorAll('[data-sentence-id]')];
      const playing = document.querySelector('.sentence.is-playing');
      if (playing === null) {
        return null;
      }
      const target = sentences.at(sentences.indexOf(playing) + 1);
      if (target === undefined) {
        return null;
      }
      const player = document.querySelector('.audio-player-shell');
      if (player === null) {
        return null;
      }
      // Parked against the player's own top edge rather than the window's,
      // because that edge is where the two disagree and it moves with the
      // breakpoint the player docks at.
      window.scrollBy({
        top: target.getBoundingClientRect().bottom - player.getBoundingClientRect().top - 8,
        behavior: 'instant',
      });
      const box = target.getBoundingClientRect();
      return {
        insideTheWindow: box.top >= 0 && box.bottom <= window.innerHeight,
        behindThePlayer: box.bottom > player.getBoundingClientRect().top,
      };
    });
    // The bug needs both to hold, so the test says so rather than passing on a
    // sentence that was never parked anywhere interesting.
    expect(parked).toEqual({ insideTheWindow: true, behindThePlayer: true });

    await audioPlayer(page).getByRole('button', { name: 'Next sentence with audio' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const sentence = document.querySelector('.sentence.is-playing');
          const header = document.querySelector('.reader .bar');
          const player = document.querySelector('.audio-player-shell');
          if (sentence === null) {
            return null;
          }
          const box = sentence.getBoundingClientRect();
          const top = header?.getBoundingClientRect().bottom ?? 0;
          const bottom = player?.getBoundingClientRect().top ?? window.innerHeight;
          // A pixel of tolerance: a smooth scroll settles on fractional offsets.
          return box.top >= top - 1 && box.bottom <= bottom + 1;
        }),
      )
      .toBe(true);
  });

  test('navigates to the next and previous sentence without wrapping', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    await audioPlayer(page).getByRole('button', { name: 'Next sentence with audio' }).click();
    await expect(playerStatus(page)).toContainText('Sentence 2 of 4', { timeout: 15_000 });
    await audioPlayer(page).getByRole('button', { name: 'Pause' }).click();

    // At the start of a sentence Back means the sentence before; a press once
    // one is under way restarts it instead, which the unit tests pin down.
    await audioPlayer(page).getByRole('button', { name: BACK_LABEL }).click();
    await expect(playerStatus(page)).toContainText('Sentence 1 of 4', { timeout: 15_000 });
  });

  /**
   * The reading stops at the seam and stays there: the learner hears one
   * sentence, reads it, and asks for the next one. Without the mode this same
   * reading runs to the end on a single press.
   */
  test('stops at every sentence while one sentence at a time is on @smoke', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    const stepToggle = audioPlayer(page).getByRole('button', { name: STEP_MODE_LABEL });
    await stepToggle.click();
    await expect(stepToggle).toHaveAttribute('aria-pressed', 'true');

    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();

    const continueButton = audioPlayer(page).getByRole('button', {
      name: 'Next sentence',
      exact: true,
    });
    await expect(continueButton).toBeEnabled({ timeout: 30_000 });
    // Every later sentence has a clip, so only the mode is holding it here.
    await expect(playerStatus(page)).toContainText('Sentence 1 of 4');

    await continueButton.click();

    await expect(playerStatus(page)).toContainText('Sentence 2 of 4', { timeout: 15_000 });
  });

  test('deletes this reading audio and regenerates every sentence from scratch @mobile @smoke', async ({
    page,
  }) => {
    const calls = await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);
    const beforeDelete = synthesisCount(calls);

    await openReaderMenu(page);
    await page.getByRole('menuitem', { name: 'Delete audio' }).click();
    await expect(
      page.getByRole('heading', { name: 'Delete audio for this reading?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Delete audio', exact: true }).click();

    await expect(page.getByText(/Audio deleted/)).toBeVisible();
    await expect(audioPlayer(page).getByRole('button', { name: 'Generate audio' })).toBeVisible();
    expect(await storedClipCount(page)).toBe(0);

    await audioPlayer(page).getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    expect(synthesisCount(calls) - beforeDelete).toBe(SENTENCE_COUNT);
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  /**
   * The widest destructive action in the application asks first, and asks in
   * the same words as the narrower per-reading one beside it. It used to delete
   * every clip of every reading on one click, from a plain button sitting next
   * to a harmless one.
   */
  test('confirms before deleting every readings audio, and keeps it on cancel @smoke', async ({
    page,
  }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Delete saved audio' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('every reading on this device');
    // Cancelling is the safe outcome, and it is where focus starts.
    await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await storedClipCount(page), 'cancelling deletes nothing').toBe(SENTENCE_COUNT);

    await page.getByRole('button', { name: 'Delete saved audio' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete saved audio' }).click();
    await expect(page.getByText(/Saved audio deleted/)).toBeVisible();

    expect(await storedClipCount(page)).toBe(0);
    expect(await countOwnedRows(page).then((rows) => rows['readings'] ?? 0)).toBe(1);
  });

  /**
   * Playback belongs to the reading being read. It used to outlive the route,
   * and the Library has no transport, no banner and no pause — so a learner who
   * pressed Back was left with narration and no off switch anywhere.
   */
  test('ends the reading session when the reader is left @smoke', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);
    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole('link', { name: 'Back to library' }).first().click();
    await expect(page).toHaveURL(/#\/library/);

    // Nothing on the Library refers to playback, which is exactly why nothing
    // may still be playing behind it.
    await expect(
      page.getByRole('button', { name: /audio|play|pause|stop/i }),
      'the library offers no playback control',
    ).toHaveCount(0);

    // Reopening the reading finds a session that ended rather than one paused
    // somewhere in the middle: the cursor is cleared and the clips are all
    // still there.
    await page.goBack();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    await openAudioPlayer(page);
    await expect(playerStatus(page)).toHaveText(`${String(SENTENCE_COUNT)} sentences ready`);
    await expect(page.locator('.sentence.is-playing')).toHaveCount(0);
    expect(await storedClipCount(page)).toBe(SENTENCE_COUNT);
  });

  /**
   * Leaving the reading is not the same as leaving the application. A reading
   * being read aloud carries on while the document is in the background, which
   * is what ADR 0039's continuous resource and the media notification are for.
   *
   * A real background cannot be produced by browser automation — headless
   * Chromium reports every page as visible — so the document is told it is
   * hidden and the event is raised. What that proves is the half this policy
   * could regress: nothing in the application stops a session because the
   * document went away, and only leaving the reader does.
   */
  test('keeps reading aloud while the document is in the background', async ({ page }) => {
    await prepareReading(page, LONG_TEXT);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page, LONG_SENTENCE_COUNT);
    await audioPlayer(page).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.sentence.is-playing')).toHaveCount(1, { timeout: 15_000 });

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // The reading moves on by itself: either it has reached a later sentence or
    // it has reached the end. Both are a session that never stopped.
    await expect
      .poll(async () => (await playerStatus(page).textContent()) ?? '', { timeout: 30_000 })
      .toMatch(/Sentence [2-8] of 8|Finished/);
    await expect(audioPlayer(page).getByRole('button', { name: /Pause|Play again/ })).toBeVisible();
  });

  test('deleting the reading stops playback', async ({ page }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);
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

  test('the reader stays accessible with the player visible and a sentence open @mobile @smoke', async ({
    page,
  }) => {
    await prepareReading(page);
    await openAudioPlayer(page);
    await page.getByRole('button', { name: 'Generate audio' }).click();
    await expectAudioComplete(page);

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
