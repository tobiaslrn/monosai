import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { grammarCacheKey, translationCacheKey } from '../../domain/enrichment/cache-keys';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import type { GeneratedStory, ImportedReading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { DEFAULT_READER_PREFERENCES } from '../../domain/settings/settings';
import type { Hasher } from '../../domain/shared/hashing';
import { paragraphId, readingId, sentenceId, snapshotId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { modelTest, StubTextProvider } from '../../../testing/ai-fakes';
import { FakeEnrichmentRepository } from '../../../testing/enrichment-fakes';
import { ok } from '../../domain/shared/result';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { ENRICHMENT_REPOSITORY, HASHER } from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { SentenceAidsStore } from './sentence-aids.store';

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

describe('SentenceAidsStore', () => {
  let enrichment: FakeEnrichmentRepository;
  let provider: StubTextProvider;
  let profileHash: ReturnType<typeof signal<string | null>>;
  let store: SentenceAidsStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    enrichment = new FakeEnrichmentRepository();
    provider = new StubTextProvider(ok(modelTest()));
    profileHash = signal<string | null>(LIVE_PROFILE_HASH);

    TestBed.configureTestingModule({
      providers: [
        SentenceAidsStore,
        EnrichmentKeysService,
        { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
        { provide: HASHER, useValue: HASH },
        { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
        {
          provide: TextModelStore,
          useValue: { settings: signal({ modelId: MODEL_ID, structuredOutput: 'json-schema' }) },
        },
        { provide: GrammarProfileStore, useValue: { liveProfileHash: profileHash } },
        {
          provide: AppSettingsStore,
          useValue: { readerPreferences: signal(DEFAULT_READER_PREFERENCES) },
        },
      ],
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
});
