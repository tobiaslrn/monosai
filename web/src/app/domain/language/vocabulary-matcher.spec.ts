import { describe, expect, it } from 'vitest';
import { snapshotId, vocabularyItemId } from '../shared/ids';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { compileVocabularyMatcher } from './vocabulary-matcher';

function item(id: string, meaning: string): VocabularyItem {
  return {
    id: vocabularyItemId(`${id}0000-0000-4000-8000-000000000000`),
    snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
    visibleExpression: '食べる',
    canonicalExpression: '食べる',
    expressionHash: 'hash-食べる',
    meaning,
    analyzedSequence: [{ surface: '食べる', readingHiragana: 'たべる' }],
  };
}

describe('compileVocabularyMatcher', () => {
  it('keeps an expression known when two meanings create two items', () => {
    const eat = item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'eat');
    const feed = item('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'feed');
    const matcher = compileVocabularyMatcher([eat, feed]);

    expect(
      matcher.findNormalized({
        id: 'token',
        startUtf16: 0,
        endUtf16: 3,
        surface: '食べる',
        dictionaryKeys: [],
        isPunctuation: false,
      }),
    ).toEqual({
      vocabularyItemIds: [eat.id, feed.id],
      basis: 'normalized-form',
    });
  });
});
