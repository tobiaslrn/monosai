import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { MAX_TRANSLATION_BATCH, translationTargets } from '../../domain/ai/translation-request';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { fixedClock } from '../../domain/shared/clock';
import { paragraphId, readingId, sentenceId, type SentenceId } from '../../domain/shared/ids';
import { err, ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { modelTest, StubTextProvider } from '../../../testing/ai-fakes';
import { FakeEnrichmentRepository } from '../../../testing/enrichment-fakes';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';
import { TranslationService } from './translation.service';

const READING_ID = readingId('r1');

function sequentialIds(): { nextId: () => string } {
  let next = 0;
  return {
    nextId: () => {
      next += 1;
      return `id-${String(next)}`;
    },
  };
}

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

function keysFor(list: readonly Sentence[]): ReadonlyMap<SentenceId, string> {
  return new Map(list.map((sentence) => [sentence.id, `key-${sentence.id}`]));
}

describe('TranslationService', () => {
  let provider: StubTextProvider;
  let enrichment: FakeEnrichmentRepository;
  let service: TranslationService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    provider = new StubTextProvider(ok(modelTest()));
    enrichment = new FakeEnrichmentRepository();
    TestBed.configureTestingModule({
      providers: [
        TranslationService,
        { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
        { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
        { provide: CLOCK, useValue: fixedClock(1_000) },
        { provide: ID_GENERATOR, useValue: sequentialIds() },
      ],
    });
    service = TestBed.inject(TranslationService);
  });

  it('carries a neighbour and its finished English into the next batch', async () => {
    const list = sentences(MAX_TRANSLATION_BATCH + 2);
    provider.translateWith = (request) =>
      ok(
        translationTargets(request).map((sentence) => ({
          id: sentence.id,
          textEn: `EN ${sentence.textJa}`,
        })),
      );

    await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
      { titleJa: 'ねこの一日', registerPreference: 'polite' },
    );

    const second = provider.translationRequests[1];
    const carried = second.window[0];
    // The last sentence of the previous batch travels as context, with the
    // English it was just given, so names stay consistent across the boundary.
    expect(carried.targetId).toBeNull();
    expect(carried.textJa).toBe(`文${String(MAX_TRANSLATION_BATCH - 1)}。`);
    expect(carried.textEn).toBe(`EN 文${String(MAX_TRANSLATION_BATCH - 1)}。`);
    expect(second.titleJa).toBe('ねこの一日');
    expect(second.registerPreference).toBe('polite');
    expect(translationTargets(second)).toHaveLength(2);
  });

  it('carries an established proper-name rendering across non-adjacent batches', async () => {
    const list = sentences(MAX_TRANSLATION_BATCH + 2);
    list[0] = { ...list[0], japaneseText: '優希は家を出た。' };
    list[MAX_TRANSLATION_BATCH] = {
      ...list[MAX_TRANSLATION_BATCH],
      japaneseText: '夜に優希は帰った。',
    };
    provider.translateWith = (request) =>
      ok(
        translationTargets(request).map((sentence) => ({
          id: sentence.id,
          textEn:
            sentence.textJa === '優希は家を出た。'
              ? 'Yuki left home.'
              : sentence.textJa.includes('優希')
                ? 'Yuki returned at night.'
                : `EN ${sentence.textJa}`,
        })),
      );

    await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
      {
        premiseJa: '優希の一日。',
        consistencyTermsJa: ['優希'],
      },
    );

    expect(provider.translationRequests[1].premiseJa).toBe('優希の一日。');
    expect(provider.translationRequests[1].establishedRenderings).toEqual([
      {
        surfaceJa: '優希',
        exampleJa: '優希は家を出た。',
        exampleEn: 'Yuki left home.',
      },
    ]);
  });

  it('translates every sentence in one batch when the story is small', async () => {
    const list = sentences(3);
    provider.translationQueue.push(
      ok(list.map((sentence) => ({ id: sentence.id, textEn: `EN ${sentence.japaneseText}` }))),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(3);
    expect(outcome.failures).toHaveLength(0);
    expect(provider.generationCalls.translate).toBe(1);
    // One ordered window, each sentence once, rather than a before/after pair
    // per sentence repeating most of the batch two more times.
    expect(provider.translationRequests[0].window).toEqual([
      { targetId: list[0].id, textJa: '文0。' },
      { targetId: list[1].id, textJa: '文1。' },
      { targetId: list[2].id, textJa: '文2。' },
    ]);
    expect(outcome.records[0]).toMatchObject({
      sentenceId: list[0].id,
      readingId: READING_ID,
      sourceContentHash: 'hash-0',
      textEn: 'EN 文0。',
      modelId: 'vendor/model',
      promptVersion: 'translation/1',
    });
  });

  it('reuses a cached translation instead of calling the provider again', async () => {
    const list = sentences(1);
    const key = keysFor(list).get(list[0].id)!;
    enrichment.translations.push({
      id: 'cached',
      sentenceId: list[0].id,
      readingId: READING_ID,
      sourceContentHash: 'hash-0',
      textEn: 'Cached.',
      modelId: 'vendor/model',
      promptVersion: 'translation/1',
      cacheKey: key,
      createdAt: 0,
    });

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0]).toMatchObject({
      sentenceId: list[0].id,
      readingId: READING_ID,
      sourceContentHash: 'hash-0',
      textEn: 'Cached.',
      cacheKey: key,
    });
    expect(provider.generationCalls.translate).toBe(0);
  });

  it('rebuilds a cache hit against the current sentence and reading rather than the row it came from', async () => {
    const list = sentences(1);
    const key = keysFor(list).get(list[0].id)!;
    const foreignReadingId = readingId('some-other-reading');
    const foreignSentenceId = sentenceId('some-other-sentence');
    enrichment.translations.push({
      id: 'cached-elsewhere',
      sentenceId: foreignSentenceId,
      readingId: foreignReadingId,
      sourceContentHash: 'hash-0',
      textEn: 'Shared phrase, translated before.',
      modelId: 'vendor/model',
      promptVersion: 'translation/1',
      cacheKey: key,
      createdAt: 0,
    });

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0].sentenceId).toBe(list[0].id);
    expect(outcome.records[0].readingId).toBe(READING_ID);
    expect(outcome.records[0].sourceContentHash).toBe(list[0].contentHash);
    expect(outcome.records[0].id).not.toBe('cached-elsewhere');
  });

  it('falls through to the provider when the cache read itself fails', async () => {
    const list = sentences(1);
    enrichment.failGetTranslationWith = storageError('unavailable', 'x');
    provider.translationQueue.push(ok([{ id: list[0].id, textEn: 'EN.' }]));

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(1);
    expect(provider.generationCalls.translate).toBe(1);
  });

  it('splits into bounded batches and preserves order through ids', async () => {
    const list = sentences(MAX_TRANSLATION_BATCH + 2);
    provider.translationQueue.push(
      ok(
        list
          .slice(0, MAX_TRANSLATION_BATCH)
          .map((sentence) => ({ id: sentence.id, textEn: 'EN.' })),
      ),
      ok(list.slice(MAX_TRANSLATION_BATCH).map((sentence) => ({ id: sentence.id, textEn: 'EN.' }))),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(provider.generationCalls.translate).toBe(2);
    expect(outcome.records).toHaveLength(list.length);
    expect(outcome.failures).toHaveLength(0);
  });

  it('records every sentence in a failed batch as a failure, not a thrown error', async () => {
    const list = sentences(2);
    provider.translationQueue.push(
      err(aiError('provider-unavailable', 'translation', 'The provider is down.')),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(0);
    expect(outcome.failures).toEqual(list.map((sentence) => sentence.id));
  });

  it('rejects a batch whose returned ids do not match what was requested', async () => {
    const list = sentences(1);
    provider.translationQueue.push(ok([{ id: sentenceId('not-requested'), textEn: 'EN.' }]));

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.records).toHaveLength(0);
    expect(outcome.failures).toEqual([list[0].id]);
  });

  it('stops issuing batches once the signal is aborted, without throwing', async () => {
    const list = sentences(MAX_TRANSLATION_BATCH + 1);
    const controller = new AbortController();
    provider.beforeAnswer = () => {
      controller.abort();
    };
    provider.translationQueue.push(
      ok(
        list
          .slice(0, MAX_TRANSLATION_BATCH)
          .map((sentence) => ({ id: sentence.id, textEn: 'EN.' })),
      ),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'vendor/model',
      'translation/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      controller.signal,
    );

    expect(provider.generationCalls.translate).toBe(1);
    expect(outcome.records.length + outcome.failures.length).toBeLessThan(list.length);
  });
});
