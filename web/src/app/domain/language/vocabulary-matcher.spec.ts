import { describe, expect, it } from 'vitest';
import { snapshotId, vocabularyItemId } from '../shared/ids';
import type { Token } from '../reading/token';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { compileVocabularyMatcher, spellingsContradict } from './vocabulary-matcher';

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

  describe('an inflected verb', () => {
    function entry(id: string, expression: string, reading: string): VocabularyItem {
      return {
        id: vocabularyItemId(`${id}0000-0000-4000-8000-000000000000`),
        snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
        visibleExpression: expression,
        canonicalExpression: expression,
        expressionHash: `hash-${expression}`,
        analyzedSequence: [{ surface: expression, lemma: expression, readingHiragana: reading }],
      };
    }
    const end = entry('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '終わり', 'おわり');
    const comeKana = entry('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'くる', 'くる');
    const wearKana = entry('44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'きる', 'きる');
    const matcher = compileVocabularyMatcher([end, comeKana, wearKana]);

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

    it('is matched by the reading of a stem the card spells', () => {
      const stem = token({
        surface: 'おわり',
        lemma: 'おわる',
        readingHiragana: 'おわり',
        partOfSpeech: 'verb',
        inflectionForm: 'continuative',
        verbConjugationFamily: 'godan',
      });
      expect(matcher.findNormalized(stem)).toEqual({
        vocabularyItemIds: [end.id],
        basis: 'reading',
      });
    });

    it('reads the kanji of 来る anew in its dictionary form', () => {
      const come = token({
        surface: '来',
        lemma: '来る',
        readingHiragana: 'き',
        partOfSpeech: 'verb',
        inflectionForm: 'continuative',
        verbConjugationFamily: 'irregular',
      });
      expect(matcher.findNormalized(come)).toEqual({
        vocabularyItemIds: [comeKana.id],
        basis: 'lemma',
      });
    });

    it('guesses no dictionary form for 来 of no known verb family', () => {
      const come = token({
        surface: '来',
        lemma: '来る',
        readingHiragana: 'き',
        partOfSpeech: 'verb',
        inflectionForm: 'continuative',
      });
      expect(matcher.findNormalized(come)).toBeNull();
    });
  });

  describe('a phrase', () => {
    const regards: VocabularyItem = {
      id: vocabularyItemId('ffffffff-ffff-4fff-8fff-ffffffffffff'),
      snapshotId: snapshotId('11111111-1111-4111-8111-111111111111'),
      visibleExpression: 'よろしくお願いします',
      canonicalExpression: 'よろしくお願いします',
      expressionHash: 'hash-よろしくお願いします',
      analyzedSequence: [
        { surface: 'よろしく', lemma: 'よろしく', readingHiragana: 'よろしく' },
        { surface: 'お願い', lemma: 'お願い', readingHiragana: 'おねがい' },
        { surface: 'し', lemma: 'する', readingHiragana: 'し' },
        { surface: 'ます', lemma: 'ます', readingHiragana: 'ます' },
      ],
    };
    const matcher = compileVocabularyMatcher([regards]);

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

    it('matches a word written in kanji where the phrase spells it in kana', () => {
      const tokens = [
        token({ surface: '宜しく', readingHiragana: 'よろしく', partOfSpeech: 'adverb' }),
        token({ surface: 'お願い', readingHiragana: 'おねがい', partOfSpeech: 'noun' }),
        token({ surface: 'し', lemma: 'する', readingHiragana: 'し', partOfSpeech: 'verb' }),
        token({ surface: 'ます', readingHiragana: 'ます', partOfSpeech: 'auxiliary' }),
      ];
      expect(matcher.findPhraseAt(tokens, 0)).toEqual({
        vocabularyItemId: regards.id,
        startTokenIndex: 0,
        endTokenIndex: 3,
        basis: 'normalized-form',
      });
    });

    it('matches a function word in kanji where the phrase spells it in kana', () => {
      const humble: VocabularyItem = {
        ...regards,
        analyzedSequence: [
          { surface: 'よろしく', lemma: 'よろしく', readingHiragana: 'よろしく' },
          { surface: 'お願い', lemma: 'お願い', readingHiragana: 'おねがい' },
          { surface: 'いたし', lemma: 'いたす', readingHiragana: 'いたし' },
          { surface: 'ます', lemma: 'ます', readingHiragana: 'ます' },
        ],
      };
      const tokens = [
        token({ surface: '宜しく', readingHiragana: 'よろしく', partOfSpeech: 'adverb' }),
        token({ surface: 'お願い', readingHiragana: 'おねがい', partOfSpeech: 'noun' }),
        token({
          surface: '致し',
          lemma: '致す',
          readingHiragana: 'いたし',
          partOfSpeech: 'auxiliary',
        }),
        token({ surface: 'ます', readingHiragana: 'ます', partOfSpeech: 'auxiliary' }),
      ];
      expect(compileVocabularyMatcher([humble]).findPhraseAt(tokens, 0)).toMatchObject({
        vocabularyItemId: humble.id,
        endTokenIndex: 3,
      });
    });
  });
});

describe('spellingsContradict', () => {
  it.each([
    ['紙', '神', true],
    ['分かる', '解る', true],
    ['猫', 'ねこ', false],
    ['ねこ', '猫', false],
    ['行なう', '行う', false],
    ['美味しい', 'おいしい', false],
    ['お茶', 'おちゃ', false],
    ['手伝う', 'てつだう', false],
    ['橋', '橋', false],
    ['子ども', '子供', false],
    ['子供', '子ども', false],
    ['友だち', '友達', false],
    ['友達', '友だち', false],
    ['ご飯', '御飯', false],
    ['御飯', 'ご飯', false],
    ['子', '子供', false],
    ['子供', '子', false],
    ['友', '友達', false],
    ['友達', '友', false],
    ['飯', '御飯', false],
    ['御飯', '飯', false],
    ['分', '解', true],
    ['解', '分', true],
    ['早', '速', true],
    ['速', '早', true],
    ['暑', '熱', true],
    ['熱', '暑', true],
    ['神', '紙', true],
    ['解る', '分かる', true],
    ['早い', '速い', true],
    ['速い', '早い', true],
    ['暑い', '熱い', true],
    ['熱い', '暑い', true],
  ])('%s against %s: %s', (left, right, expected) => {
    expect(spellingsContradict(left, right)).toBe(expected);
  });
});
