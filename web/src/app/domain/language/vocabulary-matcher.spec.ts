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

  describe('a match by reading alone', () => {
    const tooth: VocabularyItem = {
      id: vocabularyItemId('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
      visibleExpression: '歯',
      canonicalExpression: '歯',
      expressionHash: 'hash-歯',
      analyzedSequence: [{ surface: '歯', lemma: '歯', readingHiragana: 'は' }],
    };
    const god: VocabularyItem = {
      id: vocabularyItemId('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
      snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
      visibleExpression: '神',
      canonicalExpression: '神',
      expressionHash: 'hash-神',
      analyzedSequence: [{ surface: '神', lemma: '神', readingHiragana: 'かみ' }],
    };
    const matcher = compileVocabularyMatcher([tooth, god]);

    function token(fields: Partial<Token> & Pick<Token, 'surface'>): Token {
      return {
        id: `token-${fields.surface}`,
        startUtf16: 0,
        endUtf16: fields.surface.length,
        dictionaryKeys: [],
        isPunctuation: false,
        ...fields,
      };
    }

    it('never matches a word written in kanji', () => {
      expect(
        matcher.findNormalized(
          token({ surface: '紙', lemma: '紙', readingHiragana: 'かみ', partOfSpeech: 'noun' }),
        ),
      ).toBeNull();
    });

    it('never matches a particle', () => {
      expect(
        matcher.findNormalized(token({ surface: 'は', lemma: 'は', partOfSpeech: 'particle' })),
      ).toBeNull();
    });

    it('matches a kana spelling of a content word and says so', () => {
      expect(
        matcher.findNormalized(
          token({ surface: 'カミ', readingHiragana: 'かみ', partOfSpeech: 'noun' }),
        ),
      ).toEqual({ vocabularyItemIds: [god.id], basis: 'reading' });
    });
  });
});
