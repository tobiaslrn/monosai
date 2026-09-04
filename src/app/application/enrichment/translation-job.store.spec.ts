import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { MAX_TRANSLATION_BATCH, translationTargets } from '../../domain/ai/translation-request';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import type { TextModelSettings } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { err, ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../../infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { StubTextProvider, modelTest } from '../../../testing/ai-fakes';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { TextModelStore } from '../settings/text-model.store';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import type { GrammarProfileSelection } from '../../domain/grammar/profile';
import { TranslationJobStore } from './translation-job.store';

const NOW = 1_700_600_000_000;
const SENTENCE_COUNT = 12;

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/** Twelve sentences, so a run has to plan two bounded batches rather than one. */
function longReading(seed = 1): ImportedReadingDraft {
  return importedReadingFixture({
    seed,
    paragraphTexts: [
      Array.from({ length: 7 }, (_value, index) => `文${String(index)}です。`),
      Array.from({ length: 5 }, (_value, index) => `段落${String(index)}です。`),
    ],
  });
}

interface JobTestBed {
  readonly db: MonosaiDatabase;
  readonly store: TranslationJobStore;
  readonly provider: StubTextProvider;
  readonly readings: DexieReadingRepository;
  readonly jobs: DexieJobRepository;
  readonly enrichment: DexieEnrichmentRepository;
  readonly draft: ImportedReadingDraft;
  /** A second reading, so cross-reading isolation can be asserted directly. */
  readonly other: ImportedReadingDraft;
  readonly settings: WritableSignal<TextModelSettings>;
}

async function configure(): Promise<JobTestBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const readings = new DexieReadingRepository(db, clock);
  const enrichment = new DexieEnrichmentRepository(db);
  const jobs = new DexieJobRepository(db, clock);
  const provider = new StubTextProvider(ok(modelTest()));
  const draft = longReading();
  const other = longReading(2);
  await readings.saveImportedReading(draft);
  await readings.saveImportedReading(other);

  const settings = signal<TextModelSettings>({
    modelId: 'vendor/text-model',
    lastTestFingerprint: 'fingerprint',
    lastTestedAt: NOW,
    storyTokenBudget: 16_384,
    structuredOutput: 'native-schema',
    reasoningEffort: null,
    activePresetId: null,
    presets: [],
  });

  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      TranslationJobStore,
      { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
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
      { provide: TextModelStore, useValue: { settings } },
      {
        provide: GrammarProfileStore,
        useValue: {
          loaded: signal(true),
          load: () => Promise.resolve(),
          selection: signal<GrammarProfileSelection>({
            presetId: 'mn-preset-starter',
            registerPreference: 'written',
          }),
        },
      },
    ],
  });

  provider.translateWith = (request) =>
    ok(
      translationTargets(request).map((sentence) => ({
        id: sentence.id,
        textEn: `EN ${sentence.textJa}`,
      })),
    );

  return {
    db,
    store: TestBed.inject(TranslationJobStore),
    provider,
    readings,
    jobs,
    enrichment,
    draft,
    other,
    settings,
  };
}

describe('TranslationJobStore', () => {
  let bed: JobTestBed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  it('translates a reading in sequential batches of at most the bounded size', async () => {
    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.translate).toBe(2);
    expect(
      bed.provider.translationRequests.map((request) => translationTargets(request).length),
    ).toEqual([MAX_TRANSLATION_BATCH, SENTENCE_COUNT - MAX_TRANSLATION_BATCH]);

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

  it('stores every translation and refreshes the reading summary', async () => {
    await bed.store.start(bed.draft.reading.id);

    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);

    const reading = await bed.readings.getReading(bed.draft.reading.id);
    expect(reading.ok && reading.value?.translationSummary).toEqual({
      total: SENTENCE_COUNT,
      completed: SENTENCE_COUNT,
      failed: 0,
    });
  });

  it('records a batch that failed for its own sentences and translates the rest', async () => {
    let call = 0;
    bed.provider.translateWith = (request) => {
      call += 1;
      return call === 1
        ? err(aiError('provider-unavailable', 'translation', 'The provider was unavailable.'))
        : ok(
            translationTargets(request).map((sentence) => ({
              id: sentence.id,
              textEn: `English for ${sentence.textJa}`,
            })),
          );
    };

    await bed.store.start(bed.draft.reading.id);

    // A blip on one batch used to strand every sentence after it. The failure
    // is recorded and the rest of the reading is still translated, which is the
    // split the audio job already drew (ADR 0035).
    expect(bed.provider.generationCalls.translate).toBeGreaterThan(1);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') {
      return;
    }
    expect(progress.counts.failed).toBe(MAX_TRANSLATION_BATCH);
    expect(progress.counts.completed).toBe(SENTENCE_COUNT - MAX_TRANSLATION_BATCH);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows[0].state).toBe('failed');
    expect(rows[0].failedItems.map((item) => item.errorCode)).toContain('provider-unavailable');
  });

  it('stops at the first batch when the refusal is about the setup', async () => {
    bed.provider.translateWith = () =>
      err(aiError('authentication', 'translation', 'That key was rejected.'));

    await bed.store.start(bed.draft.reading.id);

    // Exactly one request: every later batch would be refused identically, and
    // spending on that is not a service.
    expect(bed.provider.generationCalls.translate).toBe(1);

    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') {
      return;
    }
    expect(progress.error.source).toBe('provider');
    expect(progress.counts.completed).toBe(0);
    expect(progress.counts.failed).toBe(MAX_TRANSLATION_BATCH);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('failed');
  });

  it('retries a failed job as a fresh bounded attempt over what is still missing', async () => {
    bed.provider.translateWith = () =>
      err(aiError('provider-unavailable', 'translation', 'Unavailable.'));
    await bed.store.start(bed.draft.reading.id);

    bed.provider.translateWith = (request) =>
      ok(
        translationTargets(request).map((sentence) => ({
          id: sentence.id,
          textEn: `EN ${sentence.textJa}`,
        })),
      );
    await bed.store.retry(bed.draft.reading.id);

    expect(bed.store.progress().kind).toBe('complete');
    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);
  });

  it('keeps stored translations when cancelled and issues no further requests', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel(bed.draft.reading.id);
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.translate).toBe(1);
    expect(bed.store.progress().kind).toBe('cancelled');

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('cancelled');
  });

  it('reports stopped only after cancellation is durable, so a reload cannot resume it', async () => {
    let notifyCommitting!: () => void;
    const committing = new Promise<void>((resolve) => {
      notifyCommitting = resolve;
    });
    let releaseCommit!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const setState = bed.jobs.setState.bind(bed.jobs);
    vi.spyOn(bed.jobs, 'setState').mockImplementation(async (id, state) => {
      if (state === 'cancelled') {
        notifyCommitting();
        await release;
      }
      return setState(id, state);
    });
    bed.provider.beforeAnswer = () => {
      bed.store.cancel(bed.draft.reading.id);
    };

    const run = bed.store.start(bed.draft.reading.id);
    await committing;
    try {
      expect(bed.store.progress().kind).toBe('running');
      const active = await bed.jobs.findActive(bed.draft.reading.id, 'translate-reading');
      expect(active.ok && active.value).not.toBeNull();
    } finally {
      releaseCommit();
      await run;
    }

    expect(bed.store.progress().kind).toBe('cancelled');
    const calls = bed.provider.generationCalls.translate;
    await bed.store.resume(bed.draft.reading.id);
    expect(bed.store.progress().kind).toBe('idle');
    expect(bed.provider.generationCalls.translate).toBe(calls);
  });

  it('reports a failed cancellation write instead of claiming the job stopped', async () => {
    const failure = storageError('transaction-aborted', 'Cancellation could not be saved.');
    const setState = bed.jobs.setState.bind(bed.jobs);
    vi.spyOn(bed.jobs, 'setState').mockImplementation((id, state) =>
      state === 'cancelled' ? Promise.resolve(err(failure)) : setState(id, state),
    );
    bed.provider.beforeAnswer = () => {
      bed.store.cancel(bed.draft.reading.id);
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.store.progress()).toMatchObject({
      kind: 'failed',
      error: { source: 'storage', error: failure },
    });
  });

  it('resumes after a reload by reconciling with the cache and asking only for what is missing', async () => {
    // Stop after the first batch, leaving ten stored translations behind.
    let answered = 0;
    bed.provider.beforeAnswer = () => {
      answered += 1;
      if (answered === 1) {
        queueMicrotask(() => {
          bed.store.cancel(bed.draft.reading.id);
        });
      }
    };
    await bed.store.start(bed.draft.reading.id);

    const afterFirst = await bed.enrichment.listTranslations(bed.draft.reading.id);
    const completed = afterFirst.ok ? afterFirst.value.length : 0;
    expect(completed).toBe(MAX_TRANSLATION_BATCH);

    // A reload: a fresh store over the same database, with the cancelled job
    // reopened by starting the reading again.
    bed.provider.beforeAnswer = null;
    const before = bed.provider.translationRequests.length;
    await bed.store.start(bed.draft.reading.id);

    const requestedAfterResume = bed.provider.translationRequests
      .slice(before)
      .reduce((sum, request) => sum + translationTargets(request).length, 0);
    expect(requestedAfterResume).toBe(SENTENCE_COUNT - completed);

    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);
  });

  it('starts a new job instead of resuming one whose configuration changed', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel(bed.draft.reading.id);
    };
    await bed.store.start(bed.draft.reading.id);
    const first = await bed.db.assetJobs.toArray();
    expect(first).toHaveLength(1);

    // A different model means different cache keys, so nothing already stored
    // counts and the old job's remaining items no longer describe the work.
    bed.settings.update((current) => ({ ...current, modelId: 'vendor/other-model' }));
    bed.provider.beforeAnswer = null;
    await bed.store.start(bed.draft.reading.id);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(2);
    const fingerprints = new Set(rows.map((row) => row.configFingerprint));
    expect(fingerprints.size).toBe(2);
    // The new job covers every sentence, because no row carries the new key.
    const active = rows.find((row) => row.configFingerprint !== first[0].configFingerprint);
    expect(active?.orderedSentenceIds).toHaveLength(SENTENCE_COUNT);
  });

  it('does nothing when a reading has no unfinished job, so opening a reader is free', async () => {
    await bed.store.resume(bed.draft.reading.id);

    expect(bed.provider.generationCalls.translate).toBe(0);
    expect(bed.store.progress().kind).toBe('idle');
  });

  it('publishes progress under its own reading and reports idle for any other', async () => {
    await bed.store.start(bed.draft.reading.id);

    const mine = bed.store.progressFor(bed.draft.reading.id);
    expect(mine.kind).toBe('complete');
    expect(mine.kind !== 'idle' && mine.readingId).toBe(bed.draft.reading.id);
    expect(bed.store.progressFor(bed.other.reading.id).kind).toBe('idle');
    expect(bed.store.isRunningFor(bed.other.reading.id)).toBe(false);
  });

  it('reports a live run only to the reading it belongs to', async () => {
    const seen: { mine: boolean; other: boolean } = { mine: false, other: false };
    bed.provider.beforeAnswer = () => {
      seen.mine = bed.store.isRunningFor(bed.draft.reading.id);
      seen.other = bed.store.isRunningFor(bed.other.reading.id);
    };

    await bed.store.start(bed.draft.reading.id);

    expect(seen).toEqual({ mine: true, other: false });
  });

  it('ignores a stop pressed on a different reading', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel(bed.other.reading.id);
    };

    await bed.store.start(bed.draft.reading.id);

    // The run finished both batches: another reading's Stop reached nothing.
    expect(bed.provider.generationCalls.translate).toBe(2);
    expect(bed.store.progress().kind).toBe('complete');
  });

  it('ignores a dismiss pressed on a different reading', async () => {
    await bed.store.start(bed.draft.reading.id);

    bed.store.acknowledge(bed.other.reading.id);

    expect(bed.store.progress().kind).toBe('complete');
    bed.store.acknowledge(bed.draft.reading.id);
    expect(bed.store.progress().kind).toBe('idle');
  });

  it('refuses to dismiss a run that is still scheduling batches', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.acknowledge(bed.draft.reading.id);
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.store.progress().kind).toBe('complete');
  });

  it('finalizes its run when its reading is deleted, and says nothing to other readings', async () => {
    // Deleted once the first batch has been answered, so the run has stored
    // work to preserve and a second batch it must not ask for.
    const deletions: Promise<void>[] = [];
    bed.provider.beforeAnswer = () => {
      queueMicrotask(() => {
        if (deletions.length === 0) {
          deletions.push(bed.store.readingDeleted(bed.draft.reading.id));
        }
      });
    };

    await bed.store.start(bed.draft.reading.id);
    await Promise.all(deletions);

    // Cancelled at the first batch, so nothing was requested for a reading
    // that is about to stop existing.
    expect(bed.provider.generationCalls.translate).toBe(1);
    const progress = bed.store.progress();
    expect(progress.kind).toBe('deleted');
    expect(bed.store.progressFor(bed.other.reading.id).kind).toBe('idle');
    expect(bed.store.isRunningFor(bed.draft.reading.id)).toBe(false);

    // Translations already paid for survive the delete of everything else.
    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(MAX_TRANSLATION_BATCH);
  });

  it('leaves a run alone when a different reading is deleted', async () => {
    const deletions: Promise<void>[] = [];
    bed.provider.beforeAnswer = () => {
      if (deletions.length === 0) {
        deletions.push(bed.store.readingDeleted(bed.other.reading.id));
      }
    };

    await bed.store.start(bed.draft.reading.id);
    await Promise.all(deletions);

    expect(bed.provider.generationCalls.translate).toBe(2);
    expect(bed.store.progress().kind).toBe('complete');
  });

  it('refuses to run without a tested text model, without touching the provider', async () => {
    bed.settings.update((current) => ({ ...current, structuredOutput: null }));

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.translate).toBe(0);
    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') {
      return;
    }
    expect(progress.error.source).toBe('provider');
    expect(progress.error.source === 'provider' && progress.error.error.code).toBe(
      'capability-unsupported',
    );
  });

  it('translates an imported reading with the register but no story context', async () => {
    await bed.store.start(bed.draft.reading.id);

    // An imported reading has no premise and no provenance. That is a reading
    // to translate, not a run to refuse, so the request simply carries less.
    const request = bed.provider.translationRequests[0];
    expect(request.registerPreference).toBe('written');
    expect(request.premiseJa).toBeUndefined();
    expect(request.titleJa).toBeUndefined();
  });

  it('reads nothing beyond the sentence refs to queue a reading', async () => {
    const analyses: string[] = [];
    const original = bed.readings.loadTokenAnalyses.bind(bed.readings);
    bed.readings.loadTokenAnalyses = (ids) => {
      analyses.push(...ids);
      return original(ids);
    };

    await bed.store.enqueue(bed.draft.reading.id);

    // Queueing is one of the four reconciliation moments and runs for every
    // reading in the library; it must not load a reading's tokens to decide
    // there is work.
    expect(analyses).toEqual([]);
  });

  describe('queueing without spending', () => {
    it('creates a row and issues nothing', async () => {
      const outcome = await bed.store.enqueue(bed.draft.reading.id);

      expect(outcome.kind).toBe('queued');
      expect(bed.provider.generationCalls.translate).toBe(0);
      const row = await bed.jobs.findActive(bed.draft.reading.id, 'translate-reading');
      expect(row.ok && row.value?.state).toBe('queued');
    });

    it('queues nothing at all once a model change is the only thing missing', async () => {
      await bed.store.start(bed.draft.reading.id);
      expect(bed.store.progress().kind).toBe('complete');
      const spentOnFirstRun = bed.provider.generationCalls.translate;

      // Everything the reading has was produced under the old model, so its
      // cache keys all change. That must not be work.
      bed.settings.update((settings) => ({ ...settings, modelId: 'vendor/another-model' }));
      const outcome = await bed.store.enqueue(bed.draft.reading.id);

      expect(outcome.kind).toBe('nothing-to-do');
      expect(bed.provider.generationCalls.translate).toBe(spentOnFirstRun);
      const rows = await bed.jobs.listActive();
      expect(rows.ok && rows.value).toEqual([]);
    });

    it('still asks for everything when the learner wants it done again', async () => {
      await bed.store.start(bed.draft.reading.id);
      const spentOnFirstRun = bed.provider.generationCalls.translate;
      bed.settings.update((settings) => ({ ...settings, modelId: 'vendor/another-model' }));

      await bed.store.start(bed.draft.reading.id);

      expect(bed.provider.generationCalls.translate).toBeGreaterThan(spentOnFirstRun);
    });
  });
});
