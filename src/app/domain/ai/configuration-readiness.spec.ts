import { describe, expect, it } from 'vitest';
import { readinessOf, type ReadinessInput } from './configuration-readiness';

const BASE: ReadinessInput = {
  complete: true,
  hasCredential: true,
  savedFingerprint: 'fp',
  currentFingerprint: 'fp',
  lastAttemptFailed: false,
};

describe('readinessOf', () => {
  it('is ready when the stored result matches the configuration', () => {
    expect(readinessOf(BASE)).toBe('ready');
  });

  it('is not configured when a field is missing', () => {
    expect(readinessOf({ ...BASE, complete: false })).toBe('incomplete');
  });

  it('is not configured when no key is saved, whatever was tested before', () => {
    expect(readinessOf({ ...BASE, hasCredential: false })).toBe('no-credential');
  });

  it('is untested when nothing has been tried', () => {
    expect(readinessOf({ ...BASE, savedFingerprint: null })).toBe('untested');
  });

  it('is stale when the configuration moved on from the stored result', () => {
    expect(readinessOf({ ...BASE, currentFingerprint: 'other' })).toBe('stale');
  });

  it('reports the most recent failure ahead of an older success', () => {
    expect(readinessOf({ ...BASE, lastAttemptFailed: true })).toBe('failed');
  });

  it('prefers missing configuration over a failure', () => {
    expect(readinessOf({ ...BASE, complete: false, lastAttemptFailed: true })).toBe('incomplete');
  });
});
