import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { fixedClock } from '../../domain/shared/clock';
import { paragraphId, readingId, sentenceId, type SentenceId } from '../../domain/shared/ids';
import { ok, err } from '../../domain/shared/result';
import { modelTest, StubTextProvider } from '../../../testing/ai-fakes';
import { FakeEnrichmentRepository } from '../../../testing/enrichment-fakes';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';
import { GrammarAnalysisService } from './grammar-analysis.service';

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

describe('GrammarAnalysisService', () => {
  let provider: StubTextProvider;
  let service: GrammarAnalysisService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    provider = new StubTextProvider(ok(modelTest()));
    TestBed.configureTestingModule({
      providers: [
        GrammarAnalysisService,
        { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
        { provide: ENRICHMENT_REPOSITORY, useValue: new FakeEnrichmentRepository() },
        { provide: CLOCK, useValue: fixedClock(1_000) },
        { provide: ID_GENERATOR, useValue: sequentialIds() },
      ],
    });
    service = TestBed.inject(GrammarAnalysisService);
  });

  it('reviews the whole story in one request and returns one record per sentence', async () => {
    const list = sentences(3);
    provider.grammarQueue.push(
      ok({
        findings: [
          {
            sentenceId: list[1].id,
            label: 'て-form',
            explanationEn: 'Connects two clauses.',
            confidence: 'high' as const,
            inProfile: true,
          },
        ],
      }),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'profile-hash',
      'guidance',
      'either',
      'vendor/model',
      'grammar/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.status).toBe('complete');
    if (outcome.status !== 'complete') {
      return;
    }
    expect(outcome.records).toHaveLength(3);
    expect(provider.generationCalls.grammar).toBe(1);
    expect(outcome.records[0].findings).toEqual([]);
    expect(outcome.records[1].findings).toEqual([
      {
        label: 'て-form',
        explanationEn: 'Connects two clauses.',
        confidence: 'high',
        inProfile: true,
      },
    ]);
    expect(outcome.records.every((record) => record.profileHash === 'profile-hash')).toBe(true);
  });

  it('reports unavailable, not zero warnings, when the provider fails', async () => {
    const list = sentences(2);
    provider.grammarQueue.push(
      err(aiError('provider-unavailable', 'grammar-review', 'The provider is down.')),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'profile-hash',
      'guidance',
      'either',
      'vendor/model',
      'grammar/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome).toEqual({
      status: 'unavailable',
      records: [],
      reasonCode: 'provider-unavailable',
    });
  });

  it('reviews long stories in batches of at most four sentences', async () => {
    const list = sentences(9);
    provider.grammarQueue.push(ok({ findings: [] }), ok({ findings: [] }), ok({ findings: [] }));

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'profile-hash',
      'guidance',
      'either',
      'vendor/model',
      'grammar/2',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.status).toBe('complete');
    expect(provider.generationCalls.grammar).toBe(3);
    expect(provider.grammarRequests.map((request) => request.sentences.length)).toEqual([4, 4, 1]);
  });

  it('drops a finding for a sentence outside the batch rather than storing it', async () => {
    const list = sentences(1);
    provider.grammarQueue.push(
      ok({
        findings: [
          {
            sentenceId: sentenceId('not-in-batch'),
            label: 'x',
            explanationEn: 'x',
            confidence: 'low' as const,
            inProfile: false,
          },
        ],
      }),
    );

    const outcome = await service.run(
      list,
      READING_ID,
      keysFor(list),
      'profile-hash',
      'guidance',
      'either',
      'vendor/model',
      'grammar/1',
      { modelId: 'vendor/model', structuredOutput: 'native-schema' },
      new AbortController().signal,
    );

    expect(outcome.status).toBe('complete');
    if (outcome.status !== 'complete') {
      return;
    }
    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0].findings).toEqual([]);
  });
});
