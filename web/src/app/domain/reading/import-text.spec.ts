import { describe, expect, it } from 'vitest';
import {
  countCharacters,
  MAXIMUM_IMPORT_CHARACTERS,
  normalizeImportedText,
  validateImportText,
  importAdvisories,
} from './import-text';

describe('normalizeImportedText', () => {
  it('normalizes every line ending to a single newline', () => {
    expect(normalizeImportedText('一\r\n二\r三\n四')).toBe('一\n二\n三\n四');
  });

  it('strips byte-order marks and other invisible format characters', () => {
    expect(normalizeImportedText('﻿猫')).toBe('猫');
    expect(normalizeImportedText('猫﻿\u200b犬')).toBe('猫犬');
  });

  it('strips controls while preserving tabs and normalized newlines', () => {
    expect(normalizeImportedText('猫\u0000\t犬\u0007\r\n鳥')).toBe('猫\t犬\n鳥');
  });

  it('changes nothing else about the text', () => {
    const text = '　全角スペースと  空白　を保つ。';
    expect(normalizeImportedText(text)).toBe(text);
  });
});

describe('importAdvisories', () => {
  it('warns when meaningful text has no Japanese script', () => {
    expect(importAdvisories('Hello world.').map((advisory) => advisory.code)).toEqual([
      'little-japanese',
    ]);
  });

  it('allows legitimate mixed Japanese text without that warning', () => {
    expect(importAdvisories('CSSで猫を描く。').map((advisory) => advisory.code)).not.toContain(
      'little-japanese',
    );
  });

  it('warns that an extreme unpunctuated run will be divided', () => {
    expect(importAdvisories('猫'.repeat(241)).map((advisory) => advisory.code)).toContain(
      'long-unpunctuated',
    );
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
