import { describe, expect, it } from 'vitest';
import { technicalCode } from '../shared/errors';
import {
  ALL_ANKI_ERROR_CODES,
  ankiError,
  isRetryable,
  suggestsPackageFallback,
} from './anki-error';
import { canDiscover, canRefresh, type AnkiCapabilities } from './capabilities';

const CAPABLE: AnkiCapabilities = {
  apiVersion: '6',
  canDiscoverDecks: true,
  canDiscoverNoteTypes: true,
  canDiscoverFields: true,
  canFilterReviewed: true,
  canReadNoteFields: true,
  limitations: [],
};

describe('ankiError', () => {
  it('produces a copyable technical code', () => {
    expect(technicalCode(ankiError('timeout', 'Anki did not answer in time.'))).toBe(
      'anki/timeout',
    );
  });

  it('omits the cause when none was given', () => {
    expect(ankiError('unknown', 'x')).not.toHaveProperty('cause');
  });

  it('treats a stopped application as worth retrying', () => {
    expect(isRetryable(ankiError('not-running', 'x'))).toBe(true);
    expect(isRetryable(ankiError('timeout', 'x'))).toBe(true);
  });

  it('does not offer a retry for something Monosai cannot change by asking again', () => {
    expect(isRetryable(ankiError('origin-not-allowed', 'x'))).toBe(false);
    expect(isRetryable(ankiError('unsupported-action', 'x'))).toBe(false);
    expect(isRetryable(ankiError('package-schema-unsupported', 'x'))).toBe(false);
  });

  it('points at the package provider when the local connection cannot work', () => {
    expect(suggestsPackageFallback(ankiError('private-network-blocked', 'x'))).toBe(true);
    expect(suggestsPackageFallback(ankiError('review-evidence-unsupported', 'x'))).toBe(true);
  });

  it('does not suggest the package provider to a failed package import', () => {
    expect(suggestsPackageFallback(ankiError('package-unreadable', 'x'))).toBe(false);
    expect(suggestsPackageFallback(ankiError('package-resource-limit', 'x'))).toBe(false);
  });
});

describe('ALL_ANKI_ERROR_CODES', () => {
  it('lists every variant exactly once', () => {
    expect(new Set(ALL_ANKI_ERROR_CODES).size).toBe(ALL_ANKI_ERROR_CODES.length);
    expect(ALL_ANKI_ERROR_CODES).toHaveLength(21);
  });
});

describe('capabilities', () => {
  it('opens the mapping editor only once discovery is complete', () => {
    expect(canDiscover(CAPABLE)).toBe(true);
    expect(canDiscover({ ...CAPABLE, canDiscoverFields: false })).toBe(false);
  });

  it('blocks refresh when review eligibility cannot be proven', () => {
    expect(canRefresh(CAPABLE)).toBe(true);
    expect(canRefresh({ ...CAPABLE, canFilterReviewed: false })).toBe(false);
    expect(canRefresh({ ...CAPABLE, canReadNoteFields: false })).toBe(false);
  });
});
