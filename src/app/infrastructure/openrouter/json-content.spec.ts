import { describe, expect, it } from 'vitest';
import { extractJsonObject } from './json-content';

describe('extractJsonObject', () => {
  it('returns a bare object unchanged', () => {
    expect(extractJsonObject('{"ok":true}')).toBe('{"ok":true}');
  });

  it('unwraps a fenced code block', () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('takes the object out of surrounding commentary', () => {
    expect(extractJsonObject('Sure! {"ok":true} Hope that helps.')).toBe('{"ok":true}');
  });

  it('keeps nested objects balanced', () => {
    expect(extractJsonObject('{"a":{"b":1}} trailing')).toBe('{"a":{"b":1}}');
  });

  it('is not confused by braces inside strings', () => {
    expect(extractJsonObject('{"a":"}"}')).toBe('{"a":"}"}');
  });

  it('is not confused by an escaped quote', () => {
    expect(extractJsonObject('{"a":"\\""}')).toBe('{"a":"\\""}');
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });

  it('returns null for an unbalanced object', () => {
    expect(extractJsonObject('{"a": 1')).toBeNull();
  });
});
