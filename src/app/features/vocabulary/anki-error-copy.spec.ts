import { describe, expect, it } from 'vitest';
import { ALL_ANKI_ERROR_CODES } from '../../domain/anki/anki-error';
import { ankiError } from '../../domain/anki/anki-error';
import { languageError } from '../../domain/language/language-error';
import { storageError } from '../../domain/storage/storage-error';
import { ANKI_ERROR_COPY, NOTHING_SAVED, copyForFailure } from './anki-error-copy';

describe('ANKI_ERROR_COPY', () => {
  it('has words for every error variant', () => {
    for (const code of ALL_ANKI_ERROR_CODES) {
      expect(ANKI_ERROR_COPY[code], code).toBeDefined();
    }
    expect(Object.keys(ANKI_ERROR_COPY)).toHaveLength(ALL_ANKI_ERROR_CODES.length);
  });

  it('answers all five required questions for every variant', () => {
    for (const code of ALL_ANKI_ERROR_CODES) {
      const copy = ANKI_ERROR_COPY[code];
      expect(copy.heading.length, code).toBeGreaterThan(0);
      expect(copy.whatFailed.length, code).toBeGreaterThan(0);
      expect(copy.whatDidNot.length, code).toBeGreaterThan(0);
      expect(copy.primaryAction.length, code).toBeGreaterThan(0);
      expect(copy.escape.length, code).toBeGreaterThan(0);
    }
  });

  it('always states that nothing was saved', () => {
    for (const code of ALL_ANKI_ERROR_CODES) {
      expect(ANKI_ERROR_COPY[code].whatDidNot, code).toBe(NOTHING_SAVED);
    }
  });

  it('gives each variant its own wording rather than one generic message', () => {
    const headings = ALL_ANKI_ERROR_CODES.map((code) => ANKI_ERROR_COPY[code].whatFailed);
    // A few variants legitimately share an action, but none may share the
    // sentence describing what actually failed.
    expect(new Set(headings).size).toBe(headings.length);
  });

  it('never claims Monosai can install or configure Anki', () => {
    for (const code of ALL_ANKI_ERROR_CODES) {
      const copy = ANKI_ERROR_COPY[code];
      const text = `${copy.whatFailed} ${copy.primaryAction} ${copy.escape}`.toLowerCase();
      expect(text, code).not.toContain('monosai will install');
      expect(text, code).not.toContain('monosai can start');
      expect(text, code).not.toContain('install ankidroid');
    }
  });

  it('offers the package path when a local connection cannot work', () => {
    expect(ANKI_ERROR_COPY['review-evidence-unsupported'].primaryAction.toLowerCase()).toContain(
      'package',
    );
  });

  it('does not offer the package path to a failed package import', () => {
    expect(ANKI_ERROR_COPY['package-unreadable'].primaryAction.toLowerCase()).not.toContain(
      'export a package from anki and import it here',
    );
  });
});

describe('copyForFailure', () => {
  it('uses the Anki table for an Anki failure', () => {
    expect(copyForFailure(ankiError('timeout', 'x'))).toBe(ANKI_ERROR_COPY.timeout);
  });

  it('has its own words for a storage failure', () => {
    const copy = copyForFailure(storageError('quota', 'x'));
    expect(copy.heading).toContain('could not be saved');
    expect(copy.whatDidNot).toBe(NOTHING_SAVED);
  });

  it('has its own words for a language failure', () => {
    const copy = copyForFailure(languageError('assets-unavailable', 'x'));
    expect(copy.heading).toContain('language support');
  });

  it('falls back to the unknown variant for an unrecognized code', () => {
    expect(copyForFailure({ domain: 'anki', code: 'not-a-real-code' })).toBe(
      ANKI_ERROR_COPY.unknown,
    );
  });
});
