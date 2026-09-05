import { describe, expect, it } from 'vitest';
import { MAXIMUM_SENTENCE_CHARACTERS, segmentParagraph, splitIntoParagraphs } from './segmentation';

function texts(paragraph: string): readonly string[] {
  return segmentParagraph(paragraph).map((segment) => segment.text);
}

/** Every segmenter result must be able to rebuild its input exactly. */
function expectExactTiling(paragraph: string): void {
  const segments = segmentParagraph(paragraph);
  expect(segments.map((segment) => segment.text).join('')).toBe(paragraph);
  let cursor = 0;
  for (const segment of segments) {
    expect(segment.startUtf16).toBe(cursor);
    expect(segment.endUtf16).toBeGreaterThan(segment.startUtf16);
    expect(paragraph.slice(segment.startUtf16, segment.endUtf16)).toBe(segment.text);
    cursor = segment.endUtf16;
  }
  expect(cursor).toBe(paragraph.length);
}

describe('segmentParagraph', () => {
  it('splits on Japanese full stops', () => {
    expect(texts('猫が寝た。犬も寝た。')).toEqual(['猫が寝た。', '犬も寝た。']);
  });

  it('keeps a run of terminators with the sentence it ends', () => {
    expect(texts('えっ！？本当に？')).toEqual(['えっ！？', '本当に？']);
  });

  it('does not split inside paired Japanese quotation marks', () => {
    expect(texts('「そうか。」と言った。')).toEqual(['「そうか。」と言った。']);
  });

  it('handles nested brackets', () => {
    expect(texts('彼は「これは『本』だ。」と答えた。')).toEqual([
      '彼は「これは『本』だ。」と答えた。',
    ]);
  });

  it('treats an ellipsis as a pause rather than a sentence end', () => {
    expect(texts('……そうかもしれない。')).toEqual(['……そうかもしれない。']);
  });

  it('does not split inside parentheses either, and ends after the following clause', () => {
    // Every bracket pair is treated alike: a terminator inside one is a pause,
    // because the clause after the closing bracket may continue the sentence.
    expect(texts('（もう遅い。）次へ進む。')).toEqual(['（もう遅い。）次へ進む。']);
  });

  it('absorbs a closing bracket that trails a terminator outside brackets', () => {
    expect(texts('もう遅い。」次へ進む。')).toEqual(['もう遅い。」', '次へ進む。']);
  });

  it('separates dialogue lines on newlines', () => {
    expect(texts('「行こう」\n「うん」')).toEqual(['「行こう」\n', '「うん」']);
  });

  it('keeps a trailing fragment without a terminator', () => {
    expect(texts('もう遅い。まだ')).toEqual(['もう遅い。', 'まだ']);
  });

  it('only ends on an ASCII full stop when a break follows', () => {
    expect(texts('Mr.Smithが来た。')).toEqual(['Mr.Smithが来た。']);
    expect(texts('That is all. Next.')).toEqual(['That is all. ', 'Next.']);
  });

  it('keeps inline spaces after a terminator with the sentence', () => {
    expect(texts('はい。　いいえ。')).toEqual(['はい。　', 'いいえ。']);
  });

  it('returns nothing for empty input', () => {
    expect(segmentParagraph('')).toEqual([]);
  });

  it('preserves every character for representative inputs', () => {
    for (const paragraph of [
      '猫が寝た。犬も寝た。',
      '「そうか。」と言った。',
      '……えっ！？「本当に？」\n次の行。',
      '𠮷田さんは😀と書いた。',
      'ABC 123 二〇二五年3月14日。',
      'が゙ぎ゚か゚',
      'unterminated「open bracket',
    ]) {
      expectExactTiling(paragraph);
    }
  });

  it('keeps surrogate pairs intact', () => {
    const segments = segmentParagraph('😀。😀。');
    expect(segments.map((segment) => segment.text)).toEqual(['😀。', '😀。']);
  });

  it('bounds an unpunctuated sentence while preserving every character', () => {
    const paragraph = '猫'.repeat(MAXIMUM_SENTENCE_CHARACTERS * 2 + 5);
    const segments = segmentParagraph(paragraph);
    expect(segments.map((segment) => Array.from(segment.text).length)).toEqual([
      MAXIMUM_SENTENCE_CHARACTERS,
      MAXIMUM_SENTENCE_CHARACTERS,
      5,
    ]);
    expect(segments.map((segment) => segment.text).join('')).toBe(paragraph);
  });

  it('uses a nearby Japanese comma as the bounded split', () => {
    const paragraph = `${'猫'.repeat(MAXIMUM_SENTENCE_CHARACTERS)}、犬`;
    expect(texts(paragraph)).toEqual([`${'猫'.repeat(MAXIMUM_SENTENCE_CHARACTERS)}、`, '犬']);
  });
});

describe('splitIntoParagraphs', () => {
  it('splits on blank lines and preserves every character', () => {
    const text = '一行目。\n続き。\n\n二段落目。';
    const paragraphs = splitIntoParagraphs(text);
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      '一行目。\n続き。\n\n',
      '二段落目。',
    ]);
    expect(paragraphs.map((paragraph) => paragraph.text).join('')).toBe(text);
  });

  it('returns one paragraph when there is no blank line', () => {
    expect(splitIntoParagraphs('一行だけ。').map((paragraph) => paragraph.text)).toEqual([
      '一行だけ。',
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(splitIntoParagraphs('')).toEqual([]);
  });
});
