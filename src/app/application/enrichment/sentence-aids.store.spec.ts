import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { grammarCacheKey, translationCacheKey } from '../../domain/enrichment/cache-keys';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import type { GeneratedStory, ImportedReading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { DEFAULT_READER_PREFERENCES } from '../../domain/settings/settings';
import type { Hasher } from '../../domain/shared/hashing';
import { paragraphId, readingId, sentenceId, snapshotId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { autoAnswerAuxiliary, modelTest, StubTextProvider } from '../../../testing/ai-fakes';
import { FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { FakeEnrichmentRepository } from '../../../testing/enrichment-fakes';
import { err, ok } from '../../domain/shared/result';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { GrammarAnalysisService } from './grammar-analysis.service';
import { SentenceAidsStore } from './sentence-aids.store';
import { SentenceEnrichmentService } from './sentence-enrichment.service';
import { TranslationService } from './translation.service';

const READING_ID = readingId('r1');
const MODEL_ID = 'vendor/model';
const LIVE_PROFILE_HASH = 'profile-live';
const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

function sentences(count: number): Sentence[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: sentenceId(`s${String(index)}`),
    readingId: READING_ID,
    paragraphId: paragraphId('p1'),
    positionInReading: index,
    positionInParagraph: index,
    japaneseText: `文${String(index)}。`,
    contentHash: `hash-${String(index)}`,
  }));
}

function importedReading(): ImportedReading {
  return {
    id: READING_ID,
    kind: 'imported',
    title: 'Imported',
    createdAt: 1,
    updatedAt: 1,
    sentenceCount: 3,
    lastOpenedAt: null,
    characterCount: 30,
    translationSummary: { total: 3, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 3, completed: 0, failed: 0 },
    analyzerVersion: 'a1',
    importSource: 'paste',
    sourceTextHash: 'source-hash',
  };
}

function generatedStory(): GeneratedStory {
  return {
    id: READING_ID,
    kind: 'generated',
    title: 'Generated',
    createdAt: 1,
    updatedAt: 1,
    sentenceCount: 3,
    lastOpenedAt: null,
    characterCount: 30,
    translationSummary: { total: 3, completed: 3, failed: 0 },
    grammarSummary: { state: 'complete', concernCount: 0 },
    audioSummary: { total: 3, completed: 0, failed: 0 },
    analyzerVersion: 'a1',
    form: 'micro',
    premise: 'A cat explores the garden.',
    snapshotId: snapshotId('snap-1'),
    generationProvenanceId: 'prov-1',
    validationOutcome: { kind: 'strict' },
  };
}

function translationFor(sentence: Sentence, textEn: string, cacheKey?: string): TranslationRecord {
  return {
    id: `t-${sentence.id}`,
    sentenceId: sentence.id,
    readingId: READING_ID,
    sourceContentHash: sentence.contentHash,
    textEn,
    modelId: MODEL_ID,
    promptVersion: PROMPT_VERSIONS.translation,
    cacheKey:
      cacheKey ??
      translationCacheKey(HASH, sentence.contentHash, MODEL_ID, PROMPT_VERSIONS.translation),
    createdAt: 10,
  };
}

function analysisFor(
  sentence: Sentence,
  profileHash: string,
  inProfile = true,
): GrammarAnalysisRecord {
  return {
    id: `g-${sentence.id}-${profileHash}`,
    sentenceId: sentence.id,
    readingId: READING_ID,
    sourceContentHash: sentence.contentHash,
    profileHash,
    modelId: MODEL_ID,
    promptVersion: PROMPT_VERSIONS.grammar,
    findings: [
      {
        label: 'て-form',
        explanationEn: 'Joins two clauses.',
        confidence: 'medium',
        inProfile,
      },
    ],
    cacheKey: grammarCacheKey(
      HASH,
      sentence.contentHash,
      profileHash,
      MODEL_ID,
      PROMPT_VERSIONS.grammar,
    ),
    createdAt: 10,
  };
}

/** Everything the aids store and its enrichment service need, with fakes. */
function aidsProviders(
  enrichment: FakeEnrichmentRepository,
  readings: FakeReadingRepository,
  provider: StubTextProvider,
  liveProfileHash: ReturnType<typeof signal<string | null>>,
  modelId = MODEL_ID,
): unknown[] {
  let nextId = 0;
  return [
    SentenceAidsStore,
    SentenceEnrichmentService,
    TranslationService,
    GrammarAnalysisService,
    EnrichmentKeysService,
    { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
    { provide: READING_REPOSITORY, useValue: readings },
    { provide: HASHER, useValue: HASH },
    { provide: CLOCK, useValue: fixedClock(1_000) },
    {
      provide: ID_GENERATOR,
      useValue: {
        nextId: () => {
          nextId += 1;
          return `id-${String(nextId)}`;
        },
      },
    },
    { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
    {
      provide: TextModelStore,
      useValue: {
        settings: signal({ modelId, structuredOutput: modelId === '' ? null : 'json-schema' }),
      },
    },
    {
      provide: GrammarProfileStore,
      useValue: {
        liveProfileHash,
        resolvedGuidance: signal('Write short sentences.'),
        selection: signal({ presetId: 'mn-preset-basic', registerPreference: 'either' }),
      },
    },
    {
      provide: AppSettingsStore,
      useValue: { readerPreferences: signal(DEFAULT_READER_PREFERENCES) },
    },
    // The service waits for the language bundle before resolving the profile;
    // in a spec the profile hash is supplied directly, so it is already there.
    { provide: LanguageStore, useValue: { initialize: () => Promise.resolve(true) } },
  ];
}

describe('SentenceAidsStore', () => {
  let enrichment: FakeEnrichmentRepository;
  let readings: FakeReadingRepository;
  let provider: StubTextProvider;
  let profileHash: ReturnType<typeof signal<string | null>>;
  let store: SentenceAidsStore;

  /** Registers the reading's sentences, which reading-wide cache keys need. */
  function withSentences(list: readonly Sentence[]): readonly Sentence[] {
    readings.sentences = [...list];
    return list;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    enrichment = new FakeEnrichmentRepository();
    readings = new FakeReadingRepository();
    provider = new StubTextProvider(ok(modelTest()));
    autoAnswerAuxiliary(provider);
    profileHash = signal<string | null>(LIVE_PROFILE_HASH);

    TestBed.configureTestingModule({
      providers: aidsProviders(enrichment, readings, provider, profileHash),
    });
    store = TestBed.inject(SentenceAidsStore);
  });

  it('reads only the mounted sentences and reaches no provider', async () => {
    const window = sentences(2);
    enrichment.translations = [translationFor(window[0], 'Sentence zero.')];

    await store.load(importedReading(), window);

    expect(enrichment.perSentenceQueries.translations).toEqual([['s0', 's1']]);
    expect(enrichment.perSentenceQueries.grammar).toEqual([['s0', 's1']]);
    expect(provider.generationCalls).toEqual({
      story: 0,
      repair: 0,
      review: 0,
      grammar: 0,
      translate: 0,
    });
    expect(provider.calls).toBe(0);
  });

  it('exposes a stored translation, expanded by the default aid preference', async () => {
    const window = sentences(1);
    enrichment.translations = [translationFor(window[0], 'Sentence zero.')];

    await store.load(importedReading(), window);

    const aids = store.aids().get(window[0].id);
    expect(aids?.translation?.textEn).toBe('Sentence zero.');
    expect(aids?.translationVisible).toBe(true);
  });

  it('hides and re-shows one sentence without touching the global preference', async () => {
    const window = sentences(1);
    enrichment.translations = [translationFor(window[0], 'Sentence zero.')];
    await store.load(importedReading(), window);

    store.toggleTranslation(window[0].id);
    expect(store.aids().get(window[0].id)?.translationVisible).toBe(false);

    store.toggleTranslation(window[0].id);
    expect(store.aids().get(window[0].id)?.translationVisible).toBe(true);
  });

  it('marks an imported analysis judged against an older profile as stale', async () => {
    const window = sentences(1);
    enrichment.grammarAnalyses = [analysisFor(window[0], 'profile-old')];

    await store.load(importedReading(), window);

    const aids = store.aids().get(window[0].id);
    expect(aids?.grammar?.profileHash).toBe('profile-old');
    expect(aids?.grammarStale).toBe(true);
  });

  it('never marks a generated story stale, whatever the live profile is now', async () => {
    const window = sentences(1);
    enrichment.grammarAnalyses = [analysisFor(window[0], 'profile-captured')];

    await store.load(generatedStory(), window);

    expect(store.aids().get(window[0].id)?.grammarStale).toBe(false);
  });

  it('leaves an imported analysis current when it matches the live profile', async () => {
    const window = sentences(1);
    enrichment.grammarAnalyses = [analysisFor(window[0], LIVE_PROFILE_HASH)];

    await store.load(importedReading(), window);

    expect(store.aids().get(window[0].id)?.grammarStale).toBe(false);
  });

  it('counts only out-of-profile findings as concerns', async () => {
    const window = sentences(2);
    enrichment.grammarAnalyses = [
      analysisFor(window[0], LIVE_PROFILE_HASH, true),
      analysisFor(window[1], LIVE_PROFILE_HASH, false),
    ];

    await store.load(importedReading(), window);

    expect(store.aids().get(window[0].id)?.concernCount).toBe(0);
    expect(store.aids().get(window[1].id)?.concernCount).toBe(1);
  });

  it('keeps the reading readable when the aid read fails', async () => {
    enrichment.failListTranslationsForSentencesWith = storageError(
      'unavailable',
      'The database is closed.',
    );

    await store.load(importedReading(), sentences(1));

    expect(store.lastError()?.message).toBe('The database is closed.');
    expect(store.aids().get(sentenceId('s0'))?.translation ?? null).toBeNull();
  });

  it('drops the previous window when a new one is mounted', async () => {
    const first = sentences(2);
    enrichment.translations = [translationFor(first[0], 'Sentence zero.')];
    await store.load(importedReading(), first);

    await store.load(importedReading(), [first[1]]);

    expect([...store.aids().keys()]).toEqual(['s1']);
  });
  describe('explicit actions', () => {
    it('translates one sentence with exactly one request, and none on a repeat', async () => {
      const window = withSentences(sentences(1));
      await store.load(importedReading(), window);

      await store.translateSentence(window[0].id);
      expect(provider.generationCalls.translate).toBe(1);
      expect(store.aids().get(window[0].id)?.translation?.textEn).toBe('EN: 文0。');
      expect(enrichment.translations).toHaveLength(1);

      await store.translateSentence(window[0].id);
      expect(provider.generationCalls.translate).toBe(1);
    });

    it('serves a translation stored in an earlier session without a request', async () => {
      const window = withSentences(sentences(1));
      enrichment.translations = [translationFor(window[0], 'Sentence zero.')];
      await store.load(importedReading(), window);

      await store.translateSentence(window[0].id);

      expect(provider.generationCalls.translate).toBe(0);
    });

    it('leaves the sentence readable and offers a retry when translation fails', async () => {
      const window = withSentences(sentences(1));
      await store.load(importedReading(), window);
      provider.translationQueue.push(
        err(aiError('rate-limited', 'translation', 'Too many requests.')),
      );

      await store.translateSentence(window[0].id);

      const failed = store.aids().get(window[0].id);
      expect(failed?.translation).toBeNull();
      expect(failed?.translationAction.state).toBe('failed');
      expect(failed?.translationAction.error?.error.code).toBe('rate-limited');

      await store.translateSentence(window[0].id);

      const retried = store.aids().get(window[0].id);
      expect(retried?.translationAction.state).toBe('idle');
      expect(retried?.translation?.textEn).toBe('EN: 文0。');
    });

    it('analyzes grammar for the sentence that asked, and no other', async () => {
      const window = withSentences(sentences(2));
      await store.load(importedReading(), window);

      await store.analyzeGrammar(window[0].id);

      expect(provider.generationCalls.grammar).toBe(1);
      expect(store.aids().get(window[0].id)?.grammar).not.toBeNull();
      expect(store.aids().get(window[1].id)?.grammar).toBeNull();
    });

    it('re-analyzes after a profile change, keeping both rows', async () => {
      const window = withSentences(sentences(1));
      enrichment.grammarAnalyses = [analysisFor(window[0], 'profile-old')];
      await store.load(importedReading(), window);
      expect(store.aids().get(window[0].id)?.grammarStale).toBe(true);

      await store.analyzeGrammar(window[0].id);

      expect(provider.generationCalls.grammar).toBe(1);
      expect(enrichment.grammarAnalyses).toHaveLength(2);
      expect(enrichment.grammarAnalyses.map((record) => record.profileHash)).toEqual([
        'profile-old',
        LIVE_PROFILE_HASH,
      ]);
      expect(store.aids().get(window[0].id)?.grammarStale).toBe(false);
    });

    it('makes no request when the analysis is already current', async () => {
      const window = withSentences(sentences(1));
      enrichment.grammarAnalyses = [analysisFor(window[0], LIVE_PROFILE_HASH)];
      await store.load(importedReading(), window);

      await store.analyzeGrammar(window[0].id);

      expect(provider.generationCalls.grammar).toBe(0);
    });

    it('reports a missing text model as a failure instead of requesting anything', async () => {
      TestBed.resetTestingModule();
      const window = sentences(1);
      readings.sentences = [...window];
      TestBed.configureTestingModule({
        providers: aidsProviders(enrichment, readings, provider, profileHash, ''),
      });
      const bare = TestBed.inject(SentenceAidsStore);

      await bare.load(importedReading(), window);
      await bare.translateSentence(window[0].id);

      expect(provider.generationCalls.translate).toBe(0);
      expect(bare.aids().get(window[0].id)?.translationAction.error?.error.code).toBe(
        'capability-unsupported',
      );
    });
  });
});
