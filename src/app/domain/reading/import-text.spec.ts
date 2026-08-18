import { describe, expect, it } from 'vitest';
import {
  countCharacters,
  decodeUtf8,
  MAXIMUM_IMPORT_CHARACTERS,
  normalizeImportedText,
  validateImportText,
} from './import-text';

describe('normalizeImportedText', () => {
  it('normalizes every line ending to a single newline', () => {
    expect(normalizeImportedText('一\r\n二\r三\n四')).toBe('一\n二\n三\n四');
  });

  it('strips a leading byte-order mark but keeps one that appears later', () => {
    expect(normalizeImportedText('﻿猫')).toBe('猫');
    expect(normalizeImportedText('猫﻿')).toBe('猫﻿');
  });

  it('changes nothing else about the text', () => {
    const text = '　全角スペースと  空白　を保つ。';
    expect(normalizeImportedText(text)).toBe(text);
  });
});

describe('countCharacters', () => {
  it('counts a surrogate pair as one character', () => {
    // "\u{20BB7}" is one Unicode character stored as two UTF-16 code units.
    expect('\u{20BB7}'.length).toBe(2);
    expect(countCharacters('\u{20BB7}')).toBe(1);
  });

  it('counts a combining mark as its own character', () => {
    expect(countCharacters('が')).toBe(2);
  });

  it('counts ordinary Japanese one character at a time', () => {
    expect(countCharacters('猫が寝た。')).toBe(5);
  });
});

describe('validateImportText', () => {
  it('accepts ordinary Japanese and reports its length', () => {
    const result = validateImportText('猫が寝た。');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.characterCount).toBe(5);
  });

  it('rejects whitespace-only input as empty', () => {
    const result = validateImportText('   \n　\t ');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('empty');
  });

  it('reports a file with no visible text distinctly from an empty paste', () => {
    const pasted = validateImportText('', 'empty');
    const file = validateImportText('', 'no-visible-text');
    expect(!pasted.ok && pasted.error.code).toBe('empty');
    expect(!file.ok && file.error.code).toBe('no-visible-text');
    if (pasted.ok || file.ok) {
      throw new Error('both inputs must be rejected');
    }
    expect(pasted.error.message).not.toBe(file.error.message);
  });

  it('accepts text at exactly the limit', () => {
    const result = validateImportText('あ'.repeat(MAXIMUM_IMPORT_CHARACTERS));
    expect(result.ok).toBe(true);
  });

  it('rejects one character over the limit and reports the count', () => {
    const result = validateImportText('あ'.repeat(MAXIMUM_IMPORT_CHARACTERS + 1));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('too-long');
    expect(!result.ok && result.error.characterCount).toBe(MAXIMUM_IMPORT_CHARACTERS + 1);
  });

  it('measures the limit in characters, so astral characters are not counted twice', () => {
    // 30,000 surrogate pairs are 60,000 UTF-16 code units but only 30,000
    // characters, which is under the stated limit.
    const result = validateImportText('\u{20BB7}'.repeat(30_000));
    expect(result.ok).toBe(true);
  });
});

describe('decodeUtf8', () => {
  it('decodes UTF-8 Japanese and normalizes its line endings', () => {
    const bytes = new TextEncoder().encode('猫が寝た。\r\n犬も寝た。');
    const result = decodeUtf8(bytes);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('猫が寝た。\n犬も寝た。');
  });

  it('strips a UTF-8 byte-order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('猫')]);
    const result = decodeUtf8(bytes);
    expect(result.ok && result.value).toBe('猫');
  });

  it('rejects bytes that are not UTF-8 rather than saving replacement characters', () => {
    // Shift_JIS bytes for "猫" are not a valid UTF-8 sequence.
    const result = decodeUtf8(new Uint8Array([0x94, 0x4c]));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('not-utf8');
  });

  it('rejects a lone surrogate encoding', () => {
    const result = decodeUtf8(new Uint8Array([0xed, 0xa0, 0x80]));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('not-utf8');
  });
});
