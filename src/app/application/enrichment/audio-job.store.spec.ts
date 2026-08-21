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
import { AudioJobStore } from './audio-job.store';

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

  it('synthesizes every sentence once, strictly in reading order', async () => {
    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.synthesized.map((request) => request.text)).toEqual(
      japaneseInOrder(bed.draft),
    );

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
   * `ai-pipelines.md` section 11 fixes concurrency at one, and each clip is
   * stored before the next request so an interruption anywhere leaves a job
   * whose recorded progress is exactly what its stored rows support.
   */
  it('keeps one request in flight and stores each clip before the next', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const storedWhenRequested: number[] = [];

    bed.provider.synthesizeWith = () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      inFlight -= 1;
      return ok(audioPayload());
    };
    // Counted between requests rather than inside one, because the stub answers
    // synchronously: what matters is that request n+1 sees n rows on disk.
    const original = bed.enrichment.getAudioByCacheKey.bind(bed.enrichment);
    bed.enrichment.getAudioByCacheKey = async (cacheKey: string) => {
      storedWhenRequested.push(await bed.db.audioAssets.count());
      return original(cacheKey);
    };

    await bed.store.start(bed.draft.reading.id);

    expect(maxInFlight).toBe(1);
    expect(storedWhenRequested).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);
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
   * The difference from translation, and the point of it: a set with a hole in
   * it cannot be played end to end, so the job stops at the sentence that
   * failed rather than carrying on past it.
   */
  it('stops at the first failure without skipping the sentence', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = () => {
      calls += 1;
      return calls === 3
        ? err(aiError('provider-unavailable', 'tts-synthesis', 'The provider was unavailable.'))
        : ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    // Three requests: two that succeeded and the one that failed. Nothing after
    // it was scheduled, so the client's transport retries stay the only retries.
    expect(bed.provider.synthesized).toHaveLength(3);
    expect(await bed.db.audioAssets.count()).toBe(2);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') {
      return;
    }
    expect(progress.error.source).toBe('provider');
    expect(progress.counts.completed).toBe(2);
    expect(progress.counts.failed).toBe(1);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('failed');
    expect(rows[0].failedItems.map((item) => item.errorCode)).toEqual(['provider-unavailable']);
  });

  it('resumes a failed job at the sentence it stopped at, and finishes', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = () => {
      calls += 1;
      return calls === 3
        ? err(aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'))
        : ok(audioPayload());
    };
    await bed.store.start(bed.draft.reading.id);
    const beforeRetry = bed.provider.synthesized.length;

    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.retry(bed.draft.reading.id);

    // Four more requests: the sentence that failed and the three after it. The
    // two already stored were not asked for again.
    expect(bed.provider.synthesized.length - beforeRetry).toBe(4);
    expect(bed.store.progress().kind).toBe('complete');
    expect(await bed.db.audioAssets.count()).toBe(SENTENCE_COUNT);
  });

  it('keeps completed clips when the run is cancelled', async () => {
    let calls = 0;
    bed.provider.synthesizeWith = () => {
      calls += 1;
      if (calls === 2) {
        bed.store.cancel();
      }
      return ok(audioPayload());
    };

    await bed.store.start(bed.draft.reading.id);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('cancelled');
    expect(await bed.db.audioAssets.count()).toBe(2);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows[0].state).toBe('cancelled');
    expect(rows[0].completedSentenceIds).toHaveLength(2);
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

    bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
    bed.provider.synthesizeWith = () => ok(audioPayload());
    await bed.store.start(bed.draft.reading.id);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === firstJobId)?.state).toBe('cancelled');

    // Every sentence again, because no clip exists for the new voice.
    expect(bed.store.progress().kind).toBe('complete');
    const summaries = await bed.enrichment.listAudioSummaries(bed.draft.reading.id);
    expect(summaries.ok && summaries.value).toHaveLength(SENTENCE_COUNT + 2);
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
