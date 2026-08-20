import type { Hasher } from '../shared/hashing';
import { hashCanonical } from '../shared/hashing';

/**
 * Cache keys and fingerprints for translation and grammar review.
 *
 * Every key is derived only from model id, prompt version, content hash, and
 * (for grammar) profile hash — never from an API key or any other secret, so a
 * cache key is safe to store and compare without touching credentials.
 */

export function translationCacheKey(
  hasher: Hasher,
  sentenceContentHash: string,
  modelId: string,
  promptVersion: string,
): string {
  return hashCanonical(hasher, 'translation', {
    sentenceContentHash,
    modelId,
    promptVersion,
  });
}

export function grammarCacheKey(
  hasher: Hasher,
  sentenceContentHash: string,
  profileHash: string,
  modelId: string,
  promptVersion: string,
): string {
  return hashCanonical(hasher, 'grammar-review', {
    sentenceContentHash,
    profileHash,
    modelId,
    promptVersion,
  });
}

/**
 * Whether a stored translation row still matches the current configuration.
 *
 * Deliberately excludes the sentence content hash: this fingerprint answers
 * "would a fresh translation under today's model and prompt look the same
 * shape as this row's configuration," which must not change per sentence.
 */
export function translationConfigFingerprint(
  hasher: Hasher,
  modelId: string,
  promptVersion: string,
): string {
  return hashCanonical(hasher, 'translation-config', {
    modelId,
    promptVersion,
  });
}
