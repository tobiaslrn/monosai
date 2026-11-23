import { describe, expect, it } from 'vitest';
import { segmentParagraph } from '../language/segmentation';
import { buildImportDraft } from './import-structure';

function ids(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `id${String(counter)}`;
  };
}

/** Mirrors the pipeline: the worker segments, the draft builder groups. */
function build(text: string) {
  return buildImportDraft(text, segmentParagraph(text), ids());
}

describe('buildImportDraft', () => {
  it('groups sentences under the paragraph they came from', () => {
    const draft = build('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
    expect(draft.paragraphs).toHaveLength(2);
    expect(draft.paragraphs[0]!.sentences.map((s) => s.text)).toEqual(['猫が寝た。', '犬も寝た。']);
    expect(draft.paragraphs[1]!.sentences.map((s) => s.text)).toEqual(['鳥は飛んだ。']);
  });

  it('keeps the paragraph source slice exactly, including its trailing blank line', () => {
    const text = '猫が寝た。\n\n鳥は飛んだ。';
    const draft = build(text);
    expect(draft.paragraphs.map((p) => p.sourceText).join('')).toBe(text);
  });

  it('trims the line breaks that end a sentence out of stored Japanese', () => {
    const draft = build('「そうか。」\n「うん。」');
    expect(draft.paragraphs[0]!.sentences.map((s) => s.text)).toEqual([
      '「そうか。」',
      '「うん。」',
    ]);
  });

  it('drops paragraphs that hold nothing but whitespace', () => {
    const draft = build('猫が寝た。\n\n   \n\n鳥は飛んだ。');
    expect(draft.paragraphs).toHaveLength(2);
    expect(draft.paragraphs.flatMap((paragraph) => paragraph.sentences)).toHaveLength(2);
  });

  it('produces no paragraphs for whitespace-only text', () => {
    expect(build('  \n\n  ').paragraphs).toEqual([]);
  });

  it('leaves every sentence awaiting analysis', () => {
    const draft = build('猫が寝た。');
    expect(draft.paragraphs[0]!.sentences[0]!.tokens).toBeNull();
  });

  it('gives every sentence and paragraph a distinct id', () => {
    const draft = build('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
    const allIds = [
      ...draft.paragraphs.map((p) => p.id),
      ...draft.paragraphs.flatMap((p) => p.sentences.map((s) => s.id)),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('preserves interior spacing inside a sentence', () => {
    const draft = build('猫　が　寝た。');
    expect(draft.paragraphs[0]!.sentences[0]!.text).toBe('猫　が　寝た。');
  });

  it('keeps a single paragraph when there is no blank line', () => {
    const draft = build('一行目。\n二行目。\n三行目。');
    expect(draft.paragraphs).toHaveLength(1);
    expect(draft.paragraphs[0]!.sentences).toHaveLength(3);
  });

  it('handles text ending without a terminator', () => {
    const draft = build('終わりのない文');
    expect(draft.paragraphs[0]!.sentences.map((s) => s.text)).toEqual(['終わりのない文']);
  });
});

describe('buildImportDraft with indented paragraphs', () => {
  function expectSentencesInsideTheirParagraph(text: string): void {
    const draft = build(text);
    for (const paragraph of draft.paragraphs) {
      for (const sentence of paragraph.sentences) {
        expect(paragraph.sourceText).toContain(sentence.text);
      }
    }
  }

  it('keeps the first sentence of a full-width indented paragraph in that paragraph', () => {
    const text = '一行目。\n\n　二段落目です。三文目です。';
    const draft = build(text);
    expect(draft.paragraphs.map((p) => p.sentences.map((s) => s.text))).toEqual([
      ['一行目。'],
      ['二段落目です。', '三文目です。'],
    ]);
    expect(draft.paragraphs.map((p) => p.sourceText).join('')).toBe(text);
    expectSentencesInsideTheirParagraph(text);
  });

  it('keeps a one-sentence indented paragraph', () => {
    const draft = build('雨が降った。\n\n　傘を持っていた。');
    expect(draft.paragraphs.map((p) => p.sentences.map((s) => s.text))).toEqual([
      ['雨が降った。'],
      ['傘を持っていた。'],
    ]);
  });

  it('keeps the first sentence of an ASCII-indented paragraph in that paragraph', () => {
    const draft = build('一行目。\n\n  二段落目です。三文目です。');
    expect(draft.paragraphs.map((p) => p.sentences.map((s) => s.text))).toEqual([
      ['一行目。'],
      ['二段落目です。', '三文目です。'],
    ]);
  });
});
