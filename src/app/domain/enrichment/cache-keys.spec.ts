import { describe, expect, it } from 'vitest';
import type { Hasher } from '../shared/hashing';
import { grammarCacheKey, translationCacheKey, translationConfigFingerprint } from './cache-keys';

const HASHER: Hasher = {
  algorithm: 'test-fnv1a',
  hashText: (text) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  },
};

describe('translationCacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(translationCacheKey(HASHER, 'content-hash', 'model-a', 'translation/1')).toBe(
      translationCacheKey(HASHER, 'content-hash', 'model-a', 'translation/1'),
    );
  });

  it('changes when the content hash, model, or prompt version changes', () => {
    const base = translationCacheKey(HASHER, 'content-hash', 'model-a', 'translation/1');

    expect(translationCacheKey(HASHER, 'other-hash', 'model-a', 'translation/1')).not.toBe(base);
    expect(translationCacheKey(HASHER, 'content-hash', 'model-b', 'translation/1')).not.toBe(base);
    expect(translationCacheKey(HASHER, 'content-hash', 'model-a', 'translation/2')).not.toBe(base);
  });
});

describe('grammarCacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(grammarCacheKey(HASHER, 'content-hash', 'profile-hash', 'model-a', 'grammar/1')).toBe(
      grammarCacheKey(HASHER, 'content-hash', 'profile-hash', 'model-a', 'grammar/1'),
    );
  });

  it('changes when the profile hash changes', () => {
    const base = grammarCacheKey(HASHER, 'content-hash', 'profile-hash', 'model-a', 'grammar/1');

    expect(
      grammarCacheKey(HASHER, 'content-hash', 'other-profile', 'model-a', 'grammar/1'),
    ).not.toBe(base);
  });

  it('never collides with a translation cache key given the same raw fields', () => {
    const translation = translationCacheKey(HASHER, 'content-hash', 'model-a', 'grammar/1');
    const grammar = grammarCacheKey(HASHER, 'content-hash', 'profile-hash', 'model-a', 'grammar/1');

    expect(translation).not.toBe(grammar);
  });
});

describe('translationConfigFingerprint', () => {
  it('does not vary with sentence content', () => {
    const fingerprint = translationConfigFingerprint(HASHER, 'model-a', 'translation/1');

    expect(translationConfigFingerprint(HASHER, 'model-a', 'translation/1')).toBe(fingerprint);
  });

  it('changes when the model or prompt version changes', () => {
    const base = translationConfigFingerprint(HASHER, 'model-a', 'translation/1');

    expect(translationConfigFingerprint(HASHER, 'model-b', 'translation/1')).not.toBe(base);
    expect(translationConfigFingerprint(HASHER, 'model-a', 'translation/2')).not.toBe(base);
  });
});
