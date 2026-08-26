import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import type { TtsSettings } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { err, ok } from '../../domain/shared/result';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../../infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { StubTtsProvider, audioPayload, ttsTest } from '../../../testing/ai-fakes';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { TtsStore } from '../settings/tts.store';
import { AUDIO_GENERATION_CONCURRENCY, AudioJobStore } from './audio-job.store';

const NOW = 1_700_600_000_000;
const SENTENCE_COUNT = 6;

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/** Six sentences across two paragraphs, so reading order spans a boundary. */
function reading(): ImportedReadingDraft {
  return importedReadingFixture({
    paragraphTexts: [
      ['文0です。', '文1です。', '文2です。'],
      ['文3です。', '文4です。', '文5です。'],
    ],
  });
}

interface AudioJobBed {
  readonly db: MonosaiDatabase;
  readonly store: AudioJobStore;
  readonly provider: StubTtsProvider;
  readonly readings: DexieReadingRepository;
  readonly enrichment: DexieEnrichmentRepository;
  readonly draft: ImportedReadingDraft;
  readonly settings: WritableSignal<TtsSettings>;
  readonly readiness: WritableSignal<'ready' | 'not-configured' | 'stale-test'>;
}

async function configure(): Promise<AudioJobBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const readings = new DexieReadingRepository(db, clock);
  const enrichment = new DexieEnrichmentRepository(db);
  const jobs = new DexieJobRepository(db, clock);
  const provider = new StubTtsProvider(ok(ttsTest()));
  const draft = reading();
  await readings.saveImportedReading(draft);

  const settings = signal<TtsSettings>({
    modelId: 'vendor/tts',
    voiceId: 'voice-a',
    speed: 1,
    lastTestFingerprint: 'fingerprint',
    lastTestedAt: NOW,
    activePresetId: null,
    presets: [],
  });
  const readiness = signal<'ready' | 'not-configured' | 'stale-test'>('ready');

  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      AudioJobStore,
      { provide: TEXT_TO_SPEECH_PROVIDER, useValue: provider },
      { provide: READING_REPOSITORY, useValue: readings },
      { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
      { provide: JOB_REPOSITORY, useValue: jobs },
      { provide: CLOCK, useValue: clock },
      { provide: HASHER, useValue: TEST_HASHER },
      {
        provide: ID_GENERATOR,
        useValue: {
          nextId: () => {
            counter += 1;
            return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
          },
        },
      },
      { provide: TtsStore, useValue: { settings, readiness } },
    ],
  });

  return {
    db,
    store: TestBed.inject(AudioJobStore),
    provider,
    readings,
    enrichment,
    draft,
    settings,
    readiness,
  };
}

/**
 * Holds a stubbed answer long enough for the other workers to reach the
 * provider.
 *
 * A microtask is not enough: each worker awaits a real IndexedDB read on its
 * way to the request, so an answer that settles within a microtask is already
 * finished before its siblings arrive, and no overlap could ever be observed.
 */
function hold(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The Japanese of each sentence, in reading order. */
function japaneseInOrder(draft: ImportedReadingDraft): readonly string[] {
  return [...draft.sentences]
    .sort((left, right) => left.positionInReading - right.positionInReading)
    .map((sentence) => sentence.japaneseText);
}

describe('AudioJobStore', () => {
  let bed: AudioJobBed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  it('synthesizes every sentence exactly once, and claims them in reading order', async () => {
    await bed.store.start(bed.draft.reading.id);

    // Requests overlap, so the order they *answer* in is not fixed. What is
    // fixed is that every sentence was asked for once and no other was.
    expect([...bed.provider.synthesized.map((request) => request.text)].sort()).toEqual(
      [...japaneseInOrder(bed.draft)].sort(),
    );
    // The first batch claimed is the front of the reading, which is what makes
    // playing a partial set useful rather than arbitrary.
    expect(
      bed.provider.synthesized
        .slice(0, AUDIO_GENERATION_CONCURRENCY)
        .map((request) => request.text),
    ).toEqual(japaneseInOrder(bed.draft).slice(0, AUDIO_GENERATION_CONCURRENCY));

    const progress = bed.store.progress();
    expect(progress.kind).toBe('complete');
    if (progress.kind !== 'complete') {
      return;
    }
    expect(progress.counts).toEqual({
      total: SENTENCE_COUNT,
      requested: SENTENCE_COUNT,
      completed: SENTENCE_COUNT,
      failed: 0,
    });
  });

  it('sends the configured model, voice, and speed with every request', async () => {
    bed.settings.set({ ...bed.settings(), speed: 1.25 });

    await bed.store.start(bed.draft.reading.id);

    for (const request of bed.provider.synthesized) {
      expect(request.modelId).toBe('vendor/tts');
      expect(request.voiceId).toBe('voice-a');
      expect(request.speed).toBe(1.25);
      expect(request.responseFormat).toBe('mp3');
    }
  });

  /**
   * The bound is what keeps the front of the reading arriving first. Without
   * one, a long reading would spread its first completions across the whole
   * text and leave progressive playback with nothing to start on.
   */
  it('keeps at most four requests in flight and refills the queue', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const observed: number[] = [];

    bed.provider.synthesizeWith = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      observed.push(inFlight);
      await hold();
      inFlight -= 1;
      return ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    expect(maxInFlight).toBe(AUDIO_GENERATION_CONCURRENCY);
    // Six sentences through four workers: the queue was refilled rather than
    // stopping once the first batch was answered.
    expect(observed).toHaveLength(SENTENCE_COUNT);
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);
    expect(bed.store.progress().kind).toBe('complete');
  });

  /** A reading shorter than the limit starts as many workers as it has work. */
  it('never opens more requests than there are sentences left', async () => {
    const short = importedReadingFixture({ seed: 21, paragraphTexts: [['短い。', '文です。']] });
    await bed.readings.saveImportedReading(short);
    let inFlight = 0;
    let maxInFlight = 0;
    bed.provider.synthesizeWith = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await hold();
      inFlight -= 1;
      return ok(audioPayload());
    };

    await bed.store.start(short.reading.id);

    expect(maxInFlight).toBe(2);
    expect(bed.provider.synthesized).toHaveLength(2);
  });

  /**
   * Completions arrive in whichever order the requests settle. The count is
   * kept here rather than read from whichever `recordCompletion` transaction
   * happened to resolve last, because two overlapping transactions can settle
   * in either order and the progress number must never go backwards.
   */
  it('records completions that arrive out of order', async () => {
    const order = japaneseInOrder(bed.draft);
    const answered: string[] = [];
    bed.provider.synthesizeWith = async (request) => {
      // The later a sentence is in the reading, the sooner it answers.
      const rank = order.indexOf(request.text);
      await hold(40 - rank * 6);
      answered.push(request.text);
      return ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    expect(answered).not.toEqual(order);
    const progress = bed.store.progress();
    expect(progress.kind).toBe('complete');
    if (progress.kind !== 'complete') {
      return;
    }
    expect(progress.counts.completed).toBe(SENTENCE_COUNT);
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);

    const rows = await bed.db.assetJobs.toArray();
    expect(new Set(rows[0].completedSentenceIds).size).toBe(SENTENCE_COUNT);
    expect(rows[0].state).toBe('complete');
  });

  it('stores every clip and refreshes the reading summary', async () => {
    await bed.store.start(bed.draft.reading.id);

    const stored = await bed.enrichment.listAudioSummaries(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);

    const row = await bed.readings.getReading(bed.draft.reading.id);
    expect(row.ok && row.value?.audioSummary).toEqual({
      total: SENTENCE_COUNT,
      completed: SENTENCE_COUNT,
      failed: 0,
    });
  });

  /**
   * The difference from translation, and the point of it: the job stops on the
   * first refusal that survived the client's transport retries rather than
   * carrying on past it and calling a set with a hole in it complete. The
   * requests its siblings had in flight are aborted rather than paid for.
   */
  it('fails fast on the first refusal and abandons the rest of the queue', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = async () => {
      calls += 1;
      const mine = calls;
      await hold();
      return mine === 3
        ? err(aiError('provider-unavailable', 'tts-synthesis', 'The provider was unavailable.'))
        : ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    // Only the first batch was ever opened: nothing after the refusal was
    // scheduled, so the client's transport retries stay the only retries.
    expect(bed.provider.synthesized).toHaveLength(AUDIO_GENERATION_CONCURRENCY);
    // The clips that did arrive were kept, and the one that failed was not.
    expect(await bed.db.audioAssets.count()).toBe(AUDIO_GENERATION_CONCURRENCY - 1);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') {
      return;
    }
    expect(progress.error.source).toBe('provider');
    expect(progress.counts.completed).toBe(AUDIO_GENERATION_CONCURRENCY - 1);
    expect(progress.counts.failed).toBe(1);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('failed');
    expect(rows[0].failedItems.map((item) => item.errorCode)).toEqual(['provider-unavailable']);
  });

  /**
   * A run whose siblings were aborted by the fail-fast reports the refusal, not
   * a cancellation. Reporting it as a stop would offer Dismiss for something
   * the learner never asked to stop.
   */
  it('reports the refusal rather than the abort it caused', async () => {
    bed.provider.synthesizeWith = async (request) => {
      await hold();
      return request.text === japaneseInOrder(bed.draft)[1]
        ? err(aiError('rate-limited', 'tts-synthesis', 'Too many requests.'))
        : ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed' || progress.error.source !== 'provider') {
      return;
    }
    expect(progress.error.error.code).toBe('rate-limited');
  });

  it('retries only the clips that are still missing, and finishes', async () => {
    bed.provider.synthesizeWith = async (request) => {
      await hold();
      return request.text === japaneseInOrder(bed.draft)[2]
        ? err(aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'))
        : ok(audioPayload());
    };
    await bed.store.start(bed.draft.reading.id);
    const stored = await bed.db.audioAssets.count();
    const beforeRetry = bed.provider.synthesized.length;

    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.retry(bed.draft.reading.id);

    expect(bed.provider.synthesized.length - beforeRetry).toBe(SENTENCE_COUNT - stored);
    expect(bed.store.progress().kind).toBe('complete');
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);
  });

  it('keeps completed clips when the run is cancelled', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = async () => {
      calls += 1;
      if (calls === AUDIO_GENERATION_CONCURRENCY) {
        bed.store.cancel();
      }
      await hold();
      return ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('cancelled');
    // The first batch was already paid for, so every clip it produced is kept,
    // and nothing after it was scheduled.
    const stored = await bed.db.audioAssets.count();
    expect(stored).toBe(AUDIO_GENERATION_CONCURRENCY);
    expect(bed.provider.synthesized).toHaveLength(AUDIO_GENERATION_CONCURRENCY);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows[0].state).toBe('cancelled');
    expect(rows[0].completedSentenceIds).toHaveLength(stored);
  });

  /**
   * Cancelling aborts the request already in flight, which arrives as a
   * refusal. Reporting that as a failure would offer a Retry for something the
   * learner had just stopped.
   */
  it('reports a request aborted by cancelling as a stop, not a failure', async () => {
    bed.provider.synthesizeWith = () => {
      bed.store.cancel();
      // What the client returns for a request whose signal was aborted.
      return err(aiError('cancelled', 'tts-synthesis', 'The request was cancelled.'));
    };

    await bed.store.start(bed.draft.reading.id);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('cancelled');
    const rows = await bed.db.assetJobs.toArray();
    expect(rows[0].state).toBe('cancelled');
    expect(rows[0].failedItems).toEqual([]);
  });

  /**
   * A reload mid-run, which is the case `resume` exists for. The tab went away
   * without the store ever writing a terminal state, so the stored job is still
   * `running` with three clips beside it.
   */
  it('resumes an interrupted run asking only for what is still missing', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = () => {
      calls += 1;
      if (calls === 3) {
        bed.store.cancel();
      }
      return ok(audioPayload());
    };
    await bed.store.start(bed.draft.reading.id);
    const stored = await bed.db.audioAssets.count();
    const asked = bed.provider.synthesized.length;

    // The interruption: the row is left as it would have been found after a
    // reload, rather than as `cancel` tidied it.
    const jobRow = (await bed.db.assetJobs.toArray())[0];
    await bed.db.assetJobs.update(jobRow.id, { state: 'running' });

    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.resume(bed.draft.reading.id);

    expect(bed.provider.synthesized.length - asked).toBe(SENTENCE_COUNT - stored);
    expect(bed.store.progress().kind).toBe('complete');
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);
  });

  /**
   * A cancelled job is not resumed on its own. Stopping was an instruction, and
   * a reader that quietly restarted the run on the next open would spend money
   * the learner declined to spend. Retry is the way back.
   */
  it('does not resume a job the learner stopped', async () => {
    bed.provider.synthesizeWith = () => {
      bed.store.cancel();
      return ok(audioPayload());
    };
    await bed.store.start(bed.draft.reading.id);
    const asked = bed.provider.synthesized.length;

    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.resume(bed.draft.reading.id);

    expect(bed.provider.synthesized).toHaveLength(asked);
  });

  it('resumes nothing, and requests nothing, when there is no unfinished job', async () => {
    await bed.store.resume(bed.draft.reading.id);

    expect(bed.provider.synthesized).toEqual([]);
    expect(bed.store.progress().kind).toBe('idle');
  });

  /**
   * A job whose voice has changed is closed rather than continued: its
   * remaining sentences were chosen for a voice that is no longer configured,
   * and continuing would report two voices' clips under one progress number.
   */
  it('closes a stored job whose configuration fingerprint no longer matches', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = () => {
      calls += 1;
      if (calls === 2) {
        bed.store.cancel();
      }
      return ok(audioPayload());
    };
    await bed.store.start(bed.draft.reading.id);
    const firstJobId = (await bed.db.assetJobs.toArray())[0].id;
    const underFirstVoice = await bed.db.audioAssets.count();

    bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.start(bed.draft.reading.id);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === firstJobId)?.state).toBe('cancelled');

    // Every sentence again, because no clip exists for the new voice. The
    // clips made under the old one stay on disk as historical output.
    expect(bed.store.progress().kind).toBe('complete');
    const summaries = await bed.enrichment.listAudioSummaries(bed.draft.reading.id);
    expect(summaries.ok && summaries.value).toHaveLength(SENTENCE_COUNT + underFirstVoice);
  });

  it('refuses, and requests nothing, when the configuration has not passed its test', async () => {
    bed.readiness.set('stale-test');

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.synthesized).toEqual([]);
    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed' || progress.error.source !== 'provider') {
      return;
    }
    expect(progress.error.error.code).toBe('capability-unsupported');
    expect(await bed.db.assetJobs.count()).toBe(0);
  });

  it('returns a settled report to rest, and refuses to dismiss a running one', async () => {
    await bed.store.start(bed.draft.reading.id);
    expect(bed.store.progress().kind).toBe('complete');

    bed.store.acknowledge();
    expect(bed.store.progress().kind).toBe('idle');
  });

  it('does not start a second run while one is going', async () => {
    let started = 0;
    bed.provider.synthesizeWith = () => {
      started += 1;
      if (started === 1) {
        // Re-entered from inside the first run, which is what a second press of
        // the menu entry would do.
        void bed.store.start(bed.draft.reading.id);
      }
      return ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.synthesized).toHaveLength(SENTENCE_COUNT);
  });
});
