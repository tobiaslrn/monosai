import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { MAX_TRANSLATION_BATCH } from '../../domain/ai/translation-request';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import type { TextModelSettings } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { err, ok } from '../../domain/shared/result';
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
import { TranslationJobStore } from './translation-job.store';

const NOW = 1_700_600_000_000;
const SENTENCE_COUNT = 12;

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/** Twelve sentences, so a run has to plan two bounded batches rather than one. */
function longReading(): ImportedReadingDraft {
  return importedReadingFixture({
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
  await readings.saveImportedReading(draft);

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
    ],
  });

  provider.translateWith = (request) =>
    ok(request.sentences.map((sentence) => ({ id: sentence.id, textEn: `EN ${sentence.textJa}` })));

  return {
    db,
    store: TestBed.inject(TranslationJobStore),
    provider,
    readings,
    jobs,
    enrichment,
    draft,
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
    expect(bed.provider.translationRequests.map((request) => request.sentences.length)).toEqual([
      MAX_TRANSLATION_BATCH,
      SENTENCE_COUNT - MAX_TRANSLATION_BATCH,
    ]);

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

  it('records a failed batch, stops scheduling, and never retries it itself', async () => {
    bed.provider.translateWith = () =>
      err(aiError('provider-unavailable', 'translation', 'The provider was unavailable.'));

    await bed.store.start(bed.draft.reading.id);

    // Exactly one request: the first batch failed and nothing was scheduled
    // after it, so the client's own transport retries stay the only retries.
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
    expect(rows[0].failedItems.map((item) => item.errorCode)).toContain('provider-unavailable');
  });

  it('retries a failed job as a fresh bounded attempt over what is still missing', async () => {
    bed.provider.translateWith = () =>
      err(aiError('provider-unavailable', 'translation', 'Unavailable.'));
    await bed.store.start(bed.draft.reading.id);

    bed.provider.translateWith = (request) =>
      ok(
        request.sentences.map((sentence) => ({ id: sentence.id, textEn: `EN ${sentence.textJa}` })),
      );
    await bed.store.retry(bed.draft.reading.id);

    expect(bed.store.progress().kind).toBe('complete');
    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);
  });

  it('keeps stored translations when cancelled and issues no further requests', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel();
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.translate).toBe(1);
    expect(bed.store.progress().kind).toBe('cancelled');

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('cancelled');
  });

  it('resumes after a reload by reconciling with the cache and asking only for what is missing', async () => {
    // Stop after the first batch, leaving ten stored translations behind.
    let answered = 0;
    bed.provider.beforeAnswer = () => {
      answered += 1;
      if (answered === 1) {
        queueMicrotask(() => {
          bed.store.cancel();
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
      .reduce((sum, request) => sum + request.sentences.length, 0);
    expect(requestedAfterResume).toBe(SENTENCE_COUNT - completed);

    const stored = await bed.enrichment.listTranslations(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT);
  });

  it('starts a new job instead of resuming one whose configuration changed', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel();
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
});
