import { describe, expect, it } from 'vitest';
import { canonicalJson, normalizeLineEndings } from './canonical-json';

describe('canonicalJson', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }));
  });

  it('omits undefined properties but preserves explicit null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('normalizes line endings inside strings', () => {
    expect(canonicalJson('a\r\nb\rc')).toBe(JSON.stringify('a\nb\nc'));
  });

  it('serializes nested arrays and objects', () => {
    expect(canonicalJson({ list: [{ z: 1, a: 2 }, 'x'] })).toBe('{"list":[{"a":2,"z":1},"x"]}');
  });

  it('treats undefined array entries as null so positions stay stable', () => {
    expect(canonicalJson([1, undefined as never, 3])).toBe('[1,null,3]');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });
});

describe('normalizeLineEndings', () => {
  it('converts CRLF and lone CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});
