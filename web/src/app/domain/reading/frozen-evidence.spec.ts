import { describe, expect, it } from 'vitest';
import { VALIDATOR_VERSION } from '../language/analyzer-version';
import { vocabularyItemId } from '../shared/ids';
import { withFrozenEvidence } from './frozen-evidence';
import type { PartOfSpeech, Token } from './token';
import type { TokenStatusAssignment, TokenValidation } from './validation';

function status(tokenId: string, validation: TokenValidation): TokenStatusAssignment {
  return { tokenId, validation };
}

/** Evidence as the current validator freezes it, unless a version is given. */
function frozen(
  tokenStatuses: readonly TokenStatusAssignment[],
  validatorVersion = VALIDATOR_VERSION,
) {
  return { validatorVersion, tokenStatuses };
}

const exception: TokenValidation = {
  category: 'policy-exception',
  exceptionId: 'ひかりくん',
  explanationEn: 'Character names are allowed by the policy.',
};
const known: TokenValidation = {
  category: 'anki-exact',
  vocabularyItemIds: [vocabularyItemId('v1')],
};
const notInSnapshot: TokenValidation = { category: 'not-in-snapshot' };
const unresolved: TokenValidation = { category: 'unknown', reason: 'unresolved-after-repair' };

describe('withFrozenEvidence', () => {
  it('keeps a policy exception the current snapshot cannot cover', () => {
    const merged = withFrozenEvidence(
      [status('t0', notInSnapshot)],
      frozen([status('t0', exception)]),
      [],
    );

    expect(merged).toEqual([status('t0', exception)]);
  });

  it('keeps a word the story was accepted on after it leaves the snapshot', () => {
    const merged = withFrozenEvidence(
      [status('t0', notInSnapshot)],
      frozen([status('t0', known)]),
      [],
    );

    expect(merged).toEqual([status('t0', known)]);
  });

  it('lets a word learned since the story was written stop being uncovered', () => {
    const merged = withFrozenEvidence(
      [status('t0', known)],
      frozen([status('t0', unresolved)]),
      [],
    );

    expect(merged).toEqual([status('t0', known)]);
  });

  it('leaves a word uncovered when neither source covers it', () => {
    const merged = withFrozenEvidence(
      [status('t0', notInSnapshot)],
      frozen([status('t0', unresolved)]),
      [],
    );

    expect(merged).toEqual([status('t0', notInSnapshot)]);
  });

  it('keeps the current status of a token the frozen evidence does not name', () => {
    const merged = withFrozenEvidence(
      [status('t0', notInSnapshot), status('t1', notInSnapshot)],
      frozen([status('t0', exception)]),
      [],
    );

    expect(merged).toEqual([status('t0', exception), status('t1', notInSnapshot)]);
  });

  it('returns the current statuses unchanged without frozen evidence', () => {
    const current = [status('t0', notInSnapshot)];

    expect(withFrozenEvidence(current, frozen([]), [])).toBe(current);
    expect(withFrozenEvidence(current, undefined, [])).toBe(current);
  });

  describe('evidence frozen before the matching rule', () => {
    const before = 'validator/1';
    function normalized(basis: string): TokenValidation {
      return { category: 'anki-normalized', vocabularyItemIds: [vocabularyItemId('v1')], basis };
    }
    function token(surface: string, partOfSpeech: PartOfSpeech, lemma?: string): Token {
      return {
        id: 't0',
        startUtf16: 0,
        endUtf16: surface.length,
        surface,
        ...(lemma === undefined ? {} : { lemma }),
        partOfSpeech,
        dictionaryKeys: [],
        isPunctuation: false,
      };
    }
    function merge(validation: TokenValidation, sentenceToken: Token, version = before) {
      return withFrozenEvidence(
        [status('t0', notInSnapshot)],
        frozen([status('t0', validation)], version),
        [sentenceToken],
      );
    }

    it('no longer covers a word written in kanji that only sounds like a reviewed word', () => {
      expect(merge(normalized('reading'), token('紙', 'noun'))).toEqual([
        status('t0', notInSnapshot),
      ]);
    });

    it('no longer covers a particle that only sounds like a reviewed word', () => {
      expect(merge(normalized('reading'), token('は', 'particle'))).toEqual([
        status('t0', notInSnapshot),
      ]);
    });

    it('no longer covers a particle recorded as matched by its written form', () => {
      // The particle は met the reviewed noun 歯 through 歯's reading.
      expect(merge(normalized('normalized-form'), token('は', 'particle'))).toEqual([
        status('t0', notInSnapshot),
      ]);
    });

    it('still covers a kana spelling of a reviewed word', () => {
      expect(merge(normalized('reading'), token('はし', 'noun'))).toEqual([
        status('t0', normalized('reading')),
      ]);
    });

    it('still covers a kana spelling of an inflected reviewed word', () => {
      expect(merge(normalized('lemma'), token('たべ', 'verb', 'たべる'))).toEqual([
        status('t0', normalized('lemma')),
      ]);
    });

    it('still covers a word written in kanji matched by its base form', () => {
      expect(merge(normalized('lemma'), token('食べ', 'verb', '食べる'))).toEqual([
        status('t0', normalized('lemma')),
      ]);
    });

    it('trusts a match by reading frozen under the matching rule', () => {
      // 猫 matched a reviewed ねこ when the story was written; the card has since gone.
      expect(merge(normalized('reading'), token('猫', 'noun'), VALIDATOR_VERSION)).toEqual([
        status('t0', normalized('reading')),
      ]);
    });
  });
});
