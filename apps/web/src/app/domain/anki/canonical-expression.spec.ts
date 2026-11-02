import { describe, expect, it } from 'vitest';
import { sha256Hasher } from '../../infrastructure/hashing/sha256-hasher';
import { canonicalizeExpression, expressionHashOf } from './canonical-expression';

describe('canonicalizeExpression', () => {
  it('leaves an already canonical expression alone', () => {
    expect(canonicalizeExpression('ねこ')).toBe('ねこ');
  });

  it('unifies compatibility forms so the same word hashes the same', () => {
    expect(canonicalizeExpression('ｱｲｳ')).toBe(canonicalizeExpression('アイウ'));
  });

  it('unifies decomposed and composed kana', () => {
    expect(canonicalizeExpression('が')).toBe(canonicalizeExpression('が'));
  });

  it('does not strip punctuation, spacing, or separators', () => {
    expect(canonicalizeExpression('お腹 が 空いた')).toBe('お腹 が 空いた');
    expect(canonicalizeExpression('わたし/わたくし')).toBe('わたし/わたくし');
    expect(canonicalizeExpression('これはペンです。')).toBe('これはペンです。');
  });

  it('keeps distinct orthographies distinct', () => {
    expect(canonicalizeExpression('たべる')).not.toBe(canonicalizeExpression('食べる'));
  });
});

describe('expressionHashOf', () => {
  it('is stable for the same canonical expression', () => {
    expect(expressionHashOf(sha256Hasher, 'ねこ')).toBe(expressionHashOf(sha256Hasher, 'ねこ'));
  });

  it('differs for different expressions', () => {
    expect(expressionHashOf(sha256Hasher, 'ねこ')).not.toBe(expressionHashOf(sha256Hasher, '犬'));
  });
});
