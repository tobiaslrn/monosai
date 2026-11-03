import { describe, expect, it } from 'vitest';
import { snapshotId, vocabularyItemId } from '../shared/ids';
import type { Token } from '../reading/token';
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

  describe('an entry analyzed alone as several tokens', () => {
    // Alone, IPADIC reads 十分 as 十 + 分 (ten minutes); in これで十分です it is one token.
    const enough: VocabularyItem = {
      id: vocabularyItemId('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
      visibleExpression: '十分',
      canonicalExpression: '十分',
      expressionHash: 'hash-十分',
      analyzedSequence: [
        { surface: '十', lemma: '十', readingHiragana: 'じゅう' },
        { surface: '分', lemma: '分', readingHiragana: 'ふん' },
      ],
    };
    const matcher = compileVocabularyMatcher([enough]);

    function token(surface: string, readingHiragana?: string): Token {
      return {
        id: `token-${surface}`,
        startUtf16: 0,
        endUtf16: surface.length,
        surface,
        dictionaryKeys: [],
        isPunctuation: false,
        ...(readingHiragana === undefined ? {} : { readingHiragana }),
      };
    }

    it('matches the expression when running text keeps it as one token', () => {
      expect(matcher.findExact(token('十分', 'じゅうぶん'))).toEqual([enough.id]);
    });

    it('still matches the split tokens as a phrase', () => {
      expect(matcher.findPhraseAt([token('十'), token('分')], 0)).toMatchObject({
        vocabularyItemId: enough.id,
        endTokenIndex: 1,
      });
    });

    it('does not treat the pieces’ joined reading as the entry', () => {
      expect(matcher.findNormalized(token('じゅうふん'))).toBeNull();
      expect(matcher.findNormalized(token('分', 'ふん'))).toBeNull();
    });
  });
});
