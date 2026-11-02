import { describe, expect, it } from 'vitest';
import { sha256Hasher } from './sha256-hasher';
import { hashCanonical } from '../../domain/shared/hashing';

describe('hashCanonical', () => {
  it('is independent of property order', () => {
    expect(hashCanonical(sha256Hasher, 'translation', { a: 1, b: 2 })).toBe(
      hashCanonical(sha256Hasher, 'translation', { b: 2, a: 1 }),
    );
  });

  it('separates tasks by domain prefix', () => {
    expect(hashCanonical(sha256Hasher, 'translation', { a: 1 })).not.toBe(
      hashCanonical(sha256Hasher, 'grammar', { a: 1 }),
    );
  });

  it('reports the documented algorithm', () => {
    expect(sha256Hasher.algorithm).toBe('sha-256');
  });
});
