import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StructuralBaselineEntry } from '../../domain/language/structural-baseline';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
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
        { provide: LanguageStore, useValue: { structuralBaseline: baseline } },
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

  it('resolves against the bundle that is loaded, not the one loaded at startup', async () => {
    const inspector = store();
    await inspector.inspect(word({ category: 'structural-baseline', ruleId: 'sb-particle-wa' }));
    expect(inspector.presentation()?.structuralForm?.nameEn).toBe('は (topic marker)');

    baseline.set([{ ...TOPIC_MARKER, nameEn: 'は (revised)' }]);

    expect(inspector.presentation()?.structuralForm?.nameEn).toBe('は (revised)');
  });
});
