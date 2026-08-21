import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DictionaryQuery } from '../../domain/language/dictionary';
import {
  compileStructuralBaseline,
  type StructuralBaselineEntry,
} from '../../domain/language/structural-baseline';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
import { wordAt } from '../../domain/reading/token-grouping';
import type { TokenValidation } from '../../domain/reading/validation';
import { ok } from '../../domain/shared/result';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { LanguageStore } from '../language/language.store';
import { WordInspectorStore, type InspectedWord } from './word-inspector.store';

const TOPIC_MARKER: StructuralBaselineEntry = {
  id: 'sb-particle-wa',
  category: 'particle',
  forms: ['は'],
  partsOfSpeech: ['particle'],
  nameEn: 'は (topic marker)',
  descriptionEn: 'Marks the topic of the sentence.',
  exampleJa: '私は学生です。',
};

function token(): Token {
  return {
    id: 't1',
    startUtf16: 1,
    endUtf16: 2,
    surface: 'は',
    partOfSpeech: 'particle',
    dictionaryKeys: ['は'],
    isPunctuation: false,
  };
}

function sentence(): Sentence {
  return {
    id: sentenceId('11111111-1111-4111-8111-111111111111'),
    readingId: readingId('22222222-2222-4222-8222-222222222222'),
    paragraphId: paragraphId('33333333-3333-4333-8333-333333333333'),
    japaneseText: '私は学生です。',
    contentHash: 'h-sentence',
    positionInParagraph: 0,
    positionInReading: 0,
  };
}

function word(validation: TokenValidation | null): InspectedWord {
  return {
    token: token(),
    word: wordAt([token()], 0),
    sentence: sentence(),
    status: validation === null ? null : { tokenId: 't1', validation },
  };
}

describe('WordInspectorStore', () => {
  let baseline: ReturnType<typeof signal<readonly StructuralBaselineEntry[]>>;

  beforeEach(() => {
    baseline = signal<readonly StructuralBaselineEntry[]>([TOPIC_MARKER]);
    TestBed.configureTestingModule({
      providers: [
        WordInspectorStore,
        // The inspector never looks anything up in these cases; a lookup that
        // resolves empty keeps `inspect` from hanging if one is made.
        {
          provide: LANGUAGE_RUNTIME,
          useValue: { lookup: () => Promise.resolve(ok({ matchedBy: 'surface', entries: [] })) },
        },
        {
          provide: LanguageStore,
          useValue: {
            structuralBaseline: baseline,
            structuralBaselineMatcher: computed(() =>
              compileStructuralBaseline({ version: '1', entries: baseline() }),
            ),
          },
        },
      ],
    });
  });

  function store(): WordInspectorStore {
    return TestBed.inject(WordInspectorStore);
  }

  it('names the baseline form behind a structural match', async () => {
    const inspector = store();

    await inspector.inspect(word({ category: 'structural-baseline', ruleId: 'sb-particle-wa' }));

    expect(inspector.presentation()?.structuralForm).toEqual({
      nameEn: 'は (topic marker)',
      descriptionEn: 'Marks the topic of the sentence.',
      exampleJa: '私は学生です。',
    });
  });

  it('keeps the generic status text when the bundle no longer defines the id', async () => {
    // A stored analysis can outlive the baseline version that produced it.
    const inspector = store();

    await inspector.inspect(word({ category: 'structural-baseline', ruleId: 'sb-particle-gone' }));

    const presentation = inspector.presentation();
    expect(presentation?.structuralForm).toBeUndefined();
    expect(presentation?.label).toBe('Structural grammar');
  });

  it('leaves other categories untouched', async () => {
    const inspector = store();

    await inspector.inspect(word({ category: 'not-in-snapshot' }));

    expect(inspector.presentation()?.structuralForm).toBeUndefined();
    expect(inspector.presentation()?.label).toBe('Not in current vocabulary');
  });

  it('reports no status at all when vocabulary is not configured', async () => {
    const inspector = store();

    await inspector.inspect(word(null));

    expect(inspector.presentation()).toBeNull();
  });

  it('looks up the whole word under its dictionary form', async () => {
    // The あり of あります is spelled like 蟻, "ant". The query has to be about
    // the word — surface あります, lemma ある, tagged as a verb — or the reader
    // hands the learner an unrelated entry.
    const queries: DictionaryQuery[] = [];
    TestBed.overrideProvider(LANGUAGE_RUNTIME, {
      useValue: {
        lookup: (query: DictionaryQuery) => {
          queries.push(query);
          return Promise.resolve(ok({ matchedBy: 'lemma', entries: [] }));
        },
      },
    });
    const inflected: readonly Token[] = [
      { ...token(), id: 'v1', surface: 'あり', lemma: 'ある', partOfSpeech: 'verb' },
      { ...token(), id: 'v2', surface: 'ます', lemma: 'ます', partOfSpeech: 'auxiliary' },
    ];

    await store().inspect({
      token: inflected[1],
      word: wordAt(inflected, 1),
      sentence: sentence(),
      status: null,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ surface: 'あります', lemma: 'ある', partOfSpeech: 'verb' });
  });

  it('previews the same word a press would pin', async () => {
    const queries: DictionaryQuery[] = [];
    TestBed.overrideProvider(LANGUAGE_RUNTIME, {
      useValue: {
        lookup: (query: DictionaryQuery) => {
          queries.push(query);
          return Promise.resolve(
            ok({
              matchedBy: 'lemma',
              entries: [
                {
                  id: 'e1',
                  writtenForms: [],
                  readings: [],
                  senses: [{ partsOfSpeech: [], glossesEn: ['to be'] }],
                },
              ],
            }),
          );
        },
      },
    });
    const inflected: readonly Token[] = [
      { ...token(), id: 'v1', surface: 'あり', lemma: 'ある', partOfSpeech: 'verb' },
      { ...token(), id: 'v2', surface: 'ます', lemma: 'ます', partOfSpeech: 'auxiliary' },
    ];
    const inspector = store();

    await inspector.previewWord(wordAt(inflected, 0));

    expect(queries[0]).toMatchObject({ surface: 'あります', lemma: 'ある' });
    expect(inspector.preview()).toMatchObject({ glossEn: 'to be' });
    expect(inspector.preview()?.word.surface).toBe('あります');
  });

  it('resolves against the bundle that is loaded, not the one loaded at startup', async () => {
    const inspector = store();
    await inspector.inspect(word({ category: 'structural-baseline', ruleId: 'sb-particle-wa' }));
    expect(inspector.presentation()?.structuralForm?.nameEn).toBe('は (topic marker)');

    baseline.set([{ ...TOPIC_MARKER, nameEn: 'は (revised)' }]);

    expect(inspector.presentation()?.structuralForm?.nameEn).toBe('は (revised)');
  });
});
