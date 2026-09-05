import { describe, expect, it } from 'vitest';
import { DomMarkupTextExtractor } from './dom-markup-text';

describe('DomMarkupTextExtractor', () => {
  const extractor = new DomMarkupTextExtractor();

  it('returns plain text unchanged', () => {
    expect(extractor.toVisibleText('ねこ')).toBe('ねこ');
  });

  it('keeps the text of inline formatting and drops the tags', () => {
    expect(extractor.toVisibleText('<b>私</b>はアンです。')).toBe('私はアンです。');
  });

  it('decodes entities as part of reading visible text', () => {
    expect(extractor.toVisibleText('a&amp;b &lt;c&gt;')).toBe('a&b <c>');
  });

  it('contributes nothing from script, style, or media content', () => {
    expect(extractor.toVisibleText('<script>alert(1)</script>犬')).toBe('犬');
    expect(extractor.toVisibleText('<style>b{color:red}</style>猫')).toBe('猫');
    expect(extractor.toVisibleText('[sound:x.mp3]<img src="y.png">魚')).toBe('[sound:x.mp3]魚');
  });

  it('does not execute an inline event handler or resolve its attributes', () => {
    expect(extractor.toVisibleText('<img src=x onerror="alert(1)">鳥')).toBe('鳥');
  });

  it('turns a break into a newline', () => {
    expect(extractor.toVisibleText('一<br>二')).toBe('一\n二');
  });

  it('separates block elements onto their own lines without doubling', () => {
    expect(extractor.toVisibleText('<div>一</div><div>二</div>')).toBe('一\n二\n');
    expect(extractor.toVisibleText('一<div>二</div>')).toBe('一\n二\n');
  });

  it('preserves internal spacing exactly', () => {
    expect(extractor.toVisibleText('お腹 が 空いた')).toBe('お腹 が 空いた');
    expect(extractor.toVisibleText('わたし / あたし')).toBe('わたし / あたし');
  });

  it('preserves non-breaking space inside the value', () => {
    expect(extractor.toVisibleText('a&nbsp;b')).toBe('a b');
  });

  it('keeps surrogate pairs intact', () => {
    expect(extractor.toVisibleText('<b>𠮷</b>野')).toBe('𠮷野');
  });

  it('returns an empty string for markup with no visible text', () => {
    expect(extractor.toVisibleText('<script>alert(1)</script>')).toBe('');
  });
});
