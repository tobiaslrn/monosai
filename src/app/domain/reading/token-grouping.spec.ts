import { describe, expect, it } from 'vitest';
import { vocabularyItemId } from '../shared/ids';
import {
  bunsetsuGroups,
  bunsetsuStarts,
  reviewedPhraseSpans,
  wordAt,
  wordStarts,
} from './token-grouping';
import type { PartOfSpeech, Token } from './token';
import type { TokenStatusAssignment } from './validation';

/** Builds a sentence from `surface:pos` pairs, with offsets that tile the text. */
function sentence(...specs: readonly string[]): readonly Token[] {
  let cursor = 0;
  return specs.map((spec, index) => {
    const [surface, pos = ''] = spec.split(':');
    const startUtf16 = cursor;
    cursor += surface.length;
    return {
      id: `t${String(index)}`,
      startUtf16,
      endUtf16: cursor,
      surface,
      dictionaryKeys: [],
      isPunctuation: pos === 'punctuation',
      ...(pos === '' || pos === 'punctuation' ? {} : { partOfSpeech: pos as PartOfSpeech }),
    };
  });
}

/** The chunks the spacing aid would draw, joined for readability in failures. */
function chunks(tokens: readonly Token[], starts: readonly boolean[]): readonly string[] {
  const grouped: string[] = [];
  tokens.forEach((token, index) => {
    if (starts[index]) {
      grouped.push(token.surface);
    } else {
      grouped[grouped.length - 1] += token.surface;
    }
  });
  return grouped;
}

function group(...specs: readonly string[]): readonly string[] {
  const tokens = sentence(...specs);
  return chunks(tokens, bunsetsuStarts(tokens));
}

function groups(...specs: readonly string[]): readonly string[] {
  return bunsetsuGroups(sentence(...specs)).map((bunsetsu) => bunsetsu.surface);
}

function words(...specs: readonly string[]): readonly string[] {
  const tokens = sentence(...specs);
  return chunks(tokens, wordStarts(tokens));
}

describe('bunsetsuStarts', () => {
  it('keeps a particle with the word it marks', () => {
    expect(
      group('目:noun', 'が:particle', 'あり:verb', 'ます:auxiliary', '。:punctuation'),
    ).toEqual(['目が', 'あります。']);
  });

  it('keeps a conjugated verb whole instead of splitting off its ending', () => {
    expect(group('毎日:noun', '水:noun', 'を:particle', '飲み:verb', 'ます:auxiliary')).toEqual([
      '毎日',
      '水を',
      '飲みます',
    ]);
  });

  it('keeps a non-independent verb with the te-form it completes', () => {
    // ている is analyzed as 食べ + て + いる, and the いる is mapped to an auxiliary.
    expect(group('食べ:verb', 'て:particle', 'いる:auxiliary')).toEqual(['食べている']);
  });

  it('takes the word a prefix modifies into the prefix chunk', () => {
    expect(group('ご:prefix', '飯:noun', 'を:particle', '食べ:verb', 'ます:auxiliary')).toEqual([
      'ご飯を',
      '食べます',
    ]);
  });

  it('keeps a counter with its number', () => {
    expect(group('三:number', '匹:counter', 'の:particle', '猫:noun')).toEqual(['三匹の', '猫']);
  });

  it('keeps a suffix with its stem', () => {
    expect(group('田中:proper-noun', 'さん:suffix', 'は:particle')).toEqual(['田中さんは']);
  });

  it('gives a determiner a chunk of its own, as textbook spacing does', () => {
    expect(group('この:determiner', '子:noun', 'は:particle')).toEqual(['この', '子は']);
  });

  it('attaches punctuation rather than opening a chunk before it', () => {
    expect(group('家:noun', 'に:particle', 'い:verb', 'ます:auxiliary', '。:punctuation')).toEqual([
      '家に',
      'います。',
    ]);
  });

  it('opens a chunk for a token the analyzer could not tag', () => {
    // A mistagged content word standing alone is a smaller error than a clause
    // silently glued to its neighbour.
    expect(group('ねこ:noun', 'ぴょん')).toEqual(['ねこ', 'ぴょん']);
  });

  it('always opens on the first token, whatever it is tagged as', () => {
    expect(bunsetsuStarts(sentence('が:particle', '好き:adjective-na'))).toEqual([true, true]);
  });

  it('returns nothing for an empty sentence', () => {
    expect(bunsetsuStarts([])).toEqual([]);
  });

  it('never breaks inside a span that must be kept together', () => {
    const tokens = sentence('私:pronoun', 'は:particle', '女:noun', 'の:particle', '子:noun');
    const starts = bunsetsuStarts(tokens, [{ startTokenIndex: 2, endTokenIndex: 4 }]);

    expect(chunks(tokens, starts)).toEqual(['私は', '女の子']);
  });
});

describe('bunsetsuGroups', () => {
  it('materializes the existing bunsetsu rules without changing token surfaces', () => {
    const tokens = sentence(
      'ご:prefix',
      '名前:noun',
      'が:particle',
      'あり:verb',
      'ます:auxiliary',
      '三:number',
      '匹:counter',
      '田中:proper-noun',
      'さん:suffix',
      '。:punctuation',
      '未知',
    );

    const result = bunsetsuGroups(tokens);

    expect(result.map((bunsetsu) => bunsetsu.surface)).toEqual([
      'ご名前が',
      'あります',
      '三匹',
      '田中さん。',
      '未知',
    ]);
    expect(result.map((bunsetsu) => bunsetsu.span)).toEqual([
      { startTokenIndex: 0, endTokenIndex: 2 },
      { startTokenIndex: 3, endTokenIndex: 4 },
      { startTokenIndex: 5, endTokenIndex: 6 },
      { startTokenIndex: 7, endTokenIndex: 9 },
      { startTokenIndex: 10, endTokenIndex: 10 },
    ]);
    expect(result.flatMap((bunsetsu) => bunsetsu.tokens).map((token) => token.surface)).toEqual(
      tokens.map((token) => token.surface),
    );
  });

  it('keeps a reviewed phrase atomic even when its tokens would open groups', () => {
    const tokens = sentence('私:pronoun', 'は:particle', '女:noun', 'の:particle', '子:noun');

    expect(
      bunsetsuGroups(tokens, [{ startTokenIndex: 2, endTokenIndex: 4 }]).map(
        (bunsetsu) => bunsetsu.surface,
      ),
    ).toEqual(['私は', '女の子']);
  });

  it('returns no groups for an empty sentence', () => {
    expect(bunsetsuGroups([])).toEqual([]);
  });

  it('matches the grouping surface for an inflected phrase with punctuation', () => {
    expect(
      groups('名前:noun', 'が:particle', 'あり:verb', 'ます:auxiliary', '。:punctuation'),
    ).toEqual(['名前が', 'あります。']);
  });
});

describe('reviewedPhraseSpans', () => {
  const tokens = sentence('大:noun', '好き:adjective-na', 'です:auxiliary');

  function phrase(startTokenIndex: number, endTokenIndex: number): TokenStatusAssignment[] {
    return tokens.slice(startTokenIndex, endTokenIndex + 1).map((token) => ({
      tokenId: token.id,
      validation: {
        category: 'anki-phrase' as const,
        vocabularyItemId: vocabularyItemId('v1'),
        tokenSpan: { startTokenIndex, endTokenIndex },
      },
    }));
  }

  it('collects one span per phrase rather than one per covered token', () => {
    const statuses = new Map(phrase(0, 1).map((status) => [status.tokenId, status]));

    expect(reviewedPhraseSpans(tokens, statuses)).toEqual([
      { startTokenIndex: 0, endTokenIndex: 1 },
    ]);
  });

  it('ignores statuses that are not reviewed phrases', () => {
    const statuses = new Map<string, TokenStatusAssignment>([
      ['t0', { tokenId: 't0', validation: { category: 'not-in-snapshot' } }],
      ['t2', { tokenId: 't2', validation: { category: 'structural-baseline', ruleId: 'sb-desu' } }],
    ]);

    expect(reviewedPhraseSpans(tokens, statuses)).toEqual([]);
  });

  it('has no spans while vocabulary is not configured', () => {
    expect(reviewedPhraseSpans(tokens, null)).toEqual([]);
  });
});

describe('wordStarts', () => {
  it('keeps a conjugated verb whole, so its stem is never looked up alone', () => {
    // あり on its own is 蟻, "ant". The word is あります.
    expect(words('あり:verb', 'ます:auxiliary')).toEqual(['あります']);
  });

  it('leaves a particle a word of its own, unlike bunsetsu grouping', () => {
    // A particle is worth inspecting: it is what the learner does not know yet.
    expect(words('名前:noun', 'が:particle', 'あり:verb', 'ます:auxiliary')).toEqual([
      '名前',
      'が',
      'あります',
    ]);
  });

  it('keeps a helper verb with the te-form it completes', () => {
    expect(words('食べ:verb', 'て:particle', 'いる:auxiliary')).toEqual(['食べている']);
  });

  it('swallows no particle that is not binding a helper verb', () => {
    // The same て, with nothing after it to bind to.
    expect(words('食べ:verb', 'て:particle')).toEqual(['食べ', 'て']);
    expect(words('本:noun', 'で:particle', '猫:noun')).toEqual(['本', 'で', '猫']);
  });

  it('keeps a prefix, a suffix, and a counter with the word they belong to', () => {
    expect(words('ご:prefix', '飯:noun')).toEqual(['ご飯']);
    expect(words('田中:proper-noun', 'さん:suffix')).toEqual(['田中さん']);
    expect(words('三:number', '匹:counter')).toEqual(['三匹']);
  });

  it('never joins a word across punctuation', () => {
    expect(words('猫:noun', '。:punctuation', 'ます:auxiliary')).toEqual(['猫', '。', 'ます']);
  });
});

describe('wordAt', () => {
  const tokens = sentence(
    '名前:noun',
    'が:particle',
    'あり:verb',
    'ます:auxiliary',
    '。:punctuation',
  );

  it('resolves the same word from any part of it', () => {
    for (const index of [2, 3]) {
      const word = wordAt(tokens, index);
      expect(word.surface).toBe('あります');
      expect(word.span).toEqual({ startTokenIndex: 2, endTokenIndex: 3 });
    }
  });

  it('makes the content token the head, so the lemma looked up is the verb', () => {
    expect(wordAt(tokens, 3).head.surface).toBe('あり');
  });

  it('skips a prefix when choosing the head', () => {
    const prefixed = sentence('ご:prefix', '飯:noun');

    expect(wordAt(prefixed, 0).head.surface).toBe('飯');
    expect(wordAt(prefixed, 0).surface).toBe('ご飯');
  });

  it('composes the reading only when every part has one', () => {
    const complete = [
      { ...tokens[2], readingHiragana: 'あり' },
      { ...tokens[3], readingHiragana: 'ます' },
    ];
    expect(wordAt(complete, 0).readingHiragana).toBe('あります');
    expect(wordAt([complete[0], tokens[3]], 0).readingHiragana).toBeUndefined();
  });

  it('resolves a single-token word to itself', () => {
    expect(wordAt(tokens, 0)).toMatchObject({ surface: '名前', head: tokens[0] });
  });
});
