import { describe, expect, it } from 'vitest';
import { vocabularyItemId } from '../shared/ids';
import { bunsetsuStarts, reviewedPhraseSpans } from './bunsetsu';
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
