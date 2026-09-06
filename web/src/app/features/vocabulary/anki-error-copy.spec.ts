import { describe, expect, it } from 'vitest';
import { ALL_ANKI_ERROR_CODES } from '../../domain/anki/anki-error';
import { ankiError } from '../../domain/anki/anki-error';
import { languageError } from '../../domain/language/language-error';
import { storageError } from '../../domain/storage/storage-error';
import { ANKI_LINKS } from './anki-links';
import {
  ANKI_ERROR_COPY,
  NOTHING_SAVED,
  connectFailureCopy,
  copyForFailure,
} from './anki-error-copy';

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
    expect(copy.heading).toContain('could not be updated');
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

/**
 * The connect panel asks a narrower question than the table above: the learner
 * has just pressed Anki, nothing happened, and there is exactly one thing to go
 * and fix. What that thing is depends on the platform, which is the whole
 * reason a single Anki entry can exist at all.
 */
describe('connectFailureCopy', () => {
  it('leads with recovery and offers the port as an advanced detail on desktop', () => {
    const copy = connectFailureCopy('desktop', ankiError('not-running', 'x'), 9999);

    expect(copy.headline).toBe('Anki is not answering.');
    expect(copy.paragraphs[0].link?.href).toBe(ANKI_LINKS.ankiConnectAddon);
    expect(copy.offersPort).toBe(true);
  });

  it('sends Android to the bridge, never to the add-on', () => {
    const copy = connectFailureCopy('android', ankiError('bridge-not-running', 'x'), 8765);

    const links = copy.paragraphs.flatMap((paragraph) =>
      paragraph.link === undefined ? [] : [paragraph.link.href],
    );
    expect(links).toContain(ANKI_LINKS.bridgeReleases);
    expect(links).not.toContain(ANKI_LINKS.ankiConnectAddon);
  });

  /** A claim about reading is worth little if the reader cannot check it. */
  it('backs the read-only promise with the bridge source on every Android failure', () => {
    for (const code of [
      'bridge-not-running',
      'ankidroid-not-installed',
      'ankidroid-permission-denied',
    ] as const) {
      const copy = connectFailureCopy('android', ankiError(code, 'x'), 8765);
      const links = copy.paragraphs.flatMap((paragraph) =>
        paragraph.link === undefined ? [] : [paragraph.link.href],
      );
      expect(links, code).toContain(ANKI_LINKS.bridgeSource);
    }
  });

  /** The bridge fixes its own port, so offering one would be a dead end. */
  it('never offers a port on Android', () => {
    for (const code of ALL_ANKI_ERROR_CODES) {
      expect(connectFailureCopy('android', ankiError(code, 'x'), 8765).offersPort, code).toBe(
        false,
      );
    }
  });

  it('still says something specific for a failure with no panel of its own', () => {
    const copy = connectFailureCopy('desktop', ankiError('origin-not-allowed', 'x'), 8765);

    expect(copy.headline).toBe(ANKI_ERROR_COPY['origin-not-allowed'].whatFailed);
    expect(copy.paragraphs[0].before).toBe(ANKI_ERROR_COPY['origin-not-allowed'].primaryAction);
  });
});
