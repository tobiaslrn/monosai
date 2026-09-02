import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { MAX_GRAMMAR_REVIEW_BATCH } from '../../domain/ai/grammar-review-request';
import type { GrammarProfileSnapshot } from '../../domain/grammar/profile';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { jobId } from '../../domain/shared/ids';
import { err, ok } from '../../domain/shared/result';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../../infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { StubTextProvider, modelTest } from '../../../testing/ai-fakes';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
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
import { GrammarAnalysisService } from './grammar-analysis.service';
import { GrammarJobStore } from './grammar-job.store';

const NOW = 1_700_700_000_000;
const SENTENCE_COUNT = 41;
const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

function longReading(seed = 1): ImportedReadingDraft {
  return importedReadingFixture({
    seed,
    paragraphTexts: [
      Array.from({ length: 21 }, (_value, index) => `文${String(index)}です。`),
      Array.from({ length: 20 }, (_value, index) => `段落${String(index)}です。`),
    ],
  });
}

function profile(hash = 'profile-hash'): GrammarProfileSnapshot {
  return {
    id: `profile-${hash}`,
    profileHash: hash,
    capturedAt: NOW,
    presetId: 'mn-preset-starter',
    resolvedGuidance: 'Use beginner grammar.',
    registerPreference: 'either',
    isCustomGuidance: false,
    structuralBaselineVersion: '1',
  };
}

interface GrammarJobTestBed {
  readonly db: MonosaiDatabase;
  readonly store: GrammarJobStore;
  readonly provider: StubTextProvider;
  readonly readings: DexieReadingRepository;
  readonly jobs: DexieJobRepository;
  readonly enrichment: DexieEnrichmentRepository;
  readonly draft: ImportedReadingDraft;
  readonly profile: WritableSignal<GrammarProfileSnapshot>;
}

async function configure(): Promise<GrammarJobTestBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const readings = new DexieReadingRepository(db, clock);
  const enrichment = new DexieEnrichmentRepository(db);
  const jobs = new DexieJobRepository(db, clock);
  const provider = new StubTextProvider(ok(modelTest()));
  const draft = longReading();
  await readings.saveImportedReading(draft);
  const capturedProfile = signal(profile());
  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      GrammarJobStore,
      GrammarAnalysisService,
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
      {
        provide: TextModelStore,
        useValue: {
          configForTask: () => ({
            modelId: 'vendor/grammar-model',
            structuredOutput: 'native-schema',
            reasoningEffort: null,
            storyTokenBudget: 8_192,
          }),
        },
      },
      {
        provide: GrammarProfileStore,
        useValue: { captureProfile: () => Promise.resolve(ok(capturedProfile())) },
      },
      { provide: LanguageStore, useValue: { initialize: () => Promise.resolve() } },
    ],
  });

  return {
    db,
    store: TestBed.inject(GrammarJobStore),
    provider,
    readings,
    jobs,
    enrichment,
    draft,
    profile: capturedProfile,
  };
}

describe('GrammarJobStore', () => {
  let bed: GrammarJobTestBed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  it('does nothing when resume finds no active job', async () => {
    await bed.store.resume(bed.draft.reading.id);

    expect(bed.provider.generationCalls.grammar).toBe(0);
    expect(bed.store.progress().kind).toBe('idle');
  });

  it('closes an active job when its profile fingerprint no longer matches', async () => {
    const sentenceIds = bed.draft.sentences.map((sentence) => sentence.id);
    await bed.jobs.create({
      id: jobId('00000000-0000-4000-8000-999999999999'),
      kind: 'analyze-reading',
      readingId: bed.draft.reading.id,
      state: 'running',
      orderedSentenceIds: sentenceIds,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: 'old-profile-fingerprint',
      createdAt: NOW,
      updatedAt: NOW,
    });
    bed.provider.grammarQueue.push(
      ok({ findings: [] }),
      ok({ findings: [] }),
      ok({ findings: [] }),
    );

    await bed.store.start(bed.draft.reading.id);

    const rows = await bed.db.assetJobs.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.configFingerprint === 'old-profile-fingerprint')?.state).toBe(
      'cancelled',
    );
    expect(new Set(rows.map((row) => row.configFingerprint)).size).toBe(2);
  });

  it('keeps every stored analysis when cancellation stops later batches', async () => {
    bed.provider.grammarQueue.push(ok({ findings: [] }));
    bed.provider.beforeAnswer = () => {
      queueMicrotask(() => {
        bed.store.cancel(bed.draft.reading.id);
      });
    };

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.grammar).toBe(1);
    expect(bed.store.progress().kind).toBe('cancelled');
    const stored = await bed.enrichment.listGrammarAnalyses(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(MAX_GRAMMAR_REVIEW_BATCH);
  });

  it('records one failed batch and still stores every successful later batch', async () => {
    bed.provider.grammarQueue.push(
      err(aiError('provider-unavailable', 'grammar-review', 'Unavailable.')),
      ok({ findings: [] }),
      ok({ findings: [] }),
    );

    await bed.store.start(bed.draft.reading.id);

    expect(bed.provider.generationCalls.grammar).toBe(3);
    const stored = await bed.enrichment.listGrammarAnalyses(bed.draft.reading.id);
    expect(stored.ok && stored.value).toHaveLength(SENTENCE_COUNT - MAX_GRAMMAR_REVIEW_BATCH);
    const progress = bed.store.progress();
    expect(progress.kind).toBe('failed');
    if (progress.kind !== 'failed') return;
    expect(progress.counts).toEqual({
      total: SENTENCE_COUNT,
      requested: SENTENCE_COUNT,
      completed: SENTENCE_COUNT - MAX_GRAMMAR_REVIEW_BATCH,
      failed: MAX_GRAMMAR_REVIEW_BATCH,
    });
  });
});
