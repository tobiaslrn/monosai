import { describe, expect, it } from 'vitest';
import type { Hasher } from '../shared/hashing';
import { exceptionPolicyHash, normalizePolicyText } from './exception-policy-hash';

const hasher: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

describe('normalizePolicyText', () => {
  it('normalizes line endings, padding, and trailing spaces', () => {
    expect(normalizePolicyText('  Allow names.  \r\n\r\n\r\n  Allow places.  \n')).toBe(
      'Allow names.\n\nAllow places.',
    );
  });

  it('normalizes composition form', () => {
    expect(normalizePolicyText('が')).toBe(normalizePolicyText('か\u3099'));
  });
});

describe('exceptionPolicyHash', () => {
  it('is empty for an empty policy', () => {
    expect(exceptionPolicyHash(hasher, '')).toBe('');
    expect(exceptionPolicyHash(hasher, '   \n  ')).toBe('');
  });

  it('ignores edits that cannot change the instruction', () => {
    expect(exceptionPolicyHash(hasher, 'Allow proper nouns.')).toBe(
      exceptionPolicyHash(hasher, '  Allow proper nouns.\n\n'),
    );
  });

  it('changes when the instruction changes', () => {
    expect(exceptionPolicyHash(hasher, 'Allow proper nouns.')).not.toBe(
      exceptionPolicyHash(hasher, 'Allow proper nouns and numbers.'),
    );
  });
});
