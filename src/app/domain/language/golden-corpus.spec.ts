import { describe, expect, it } from 'vitest';
import { analyzeSentence, surfacesOf } from '../../../testing/language-runtime';
import { ANALYZER_VERSION, VALIDATOR_VERSION } from './analyzer-version';
import { tokensCoverSentence } from './analyzed-text';
import {
  GOLDEN_ANALYSIS_CASES,
  GOLDEN_CORPUS_VERSIONS,
  GOLDEN_ROUNDTRIP_TEXTS,
} from './golden-corpus';
import { readingAddsInformation } from './kana';

describe('golden language corpus', () => {
  it('is stamped with the analyzer and validator versions it was reviewed against', () => {
    expect(GOLDEN_CORPUS_VERSIONS.analyzerVersion).toBe(ANALYZER_VERSION);
    expect(GOLDEN_CORPUS_VERSIONS.validatorVersion).toBe(VALIDATOR_VERSION);
  });

  for (const testCase of GOLDEN_ANALYSIS_CASES) {
    it(`tokenizes ${testCase.name} as reviewed`, async () => {
      expect(await surfacesOf(testCase.text)).toEqual(testCase.surfaces);
    });

    it(`assigns the reviewed features for ${testCase.name}`, async () => {
      const tokens = await analyzeSentence(testCase.text);
      for (const [index, expected] of Object.entries(testCase.tokens ?? {})) {
        const token = tokens[Number(index)];
        expect(token, `token ${index} of ${testCase.name}`).toBeDefined();
        expect(token.surface).toBe(expected.surface);
        if (expected.lemma !== undefined) {
          expect(token.lemma).toBe(expected.lemma);
        }
        if (expected.readingHiragana !== undefined) {
          expect(token.readingHiragana).toBe(expected.readingHiragana);
        }
        if (expected.partOfSpeech !== undefined) {
          expect(token.partOfSpeech).toBe(expected.partOfSpeech);
        }
        if (expected.isPunctuation !== undefined) {
          expect(token.isPunctuation).toBe(expected.isPunctuation);
        }
      }
    });
  }

  for (const text of GOLDEN_ROUNDTRIP_TEXTS) {
    it(`preserves every character and offset of ${JSON.stringify(text)}`, async () => {
      const tokens = await analyzeSentence(text);
      expect(tokens.map((token) => token.surface).join('')).toBe(text);
      expect(tokensCoverSentence({ startUtf16: 0, endUtf16: text.length, text, tokens })).toBe(
        true,
      );
      for (const token of tokens) {
        expect(text.slice(token.startUtf16, token.endUtf16)).toBe(token.surface);
      }
    });
  }

  it('keeps astral characters whole across token boundaries', async () => {
    const text = '𠮷田さんは😀と書いた。';
    const tokens = await analyzeSentence(text);
    for (const token of tokens) {
      // A boundary inside a surrogate pair would produce a lone surrogate.
      expect(token.surface).toBe(token.surface.normalize('NFC'));
      expect(/[\uD800-\uDBFF]$/.test(token.surface)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(token.surface)).toBe(false);
    }
  });

  it('suppresses ruby that would repeat the kana surface', async () => {
    const tokens = await analyzeSentence('ねこがすきです');
    for (const token of tokens) {
      expect(readingAddsInformation(token.surface, token.readingHiragana ?? '')).toBe(false);
    }
  });

  it('offers ruby for kanji tokens whose reading differs from the surface', async () => {
    const tokens = await analyzeSentence('食べ物');
    const first = tokens[0];
    expect(readingAddsInformation(first.surface, first.readingHiragana ?? '')).toBe(true);
  });
});
