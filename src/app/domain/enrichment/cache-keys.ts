import type { Hasher } from '../shared/hashing';
import { hashCanonical } from '../shared/hashing';
import { SPEECH_INSTRUCTION_VERSION } from '../ai/speech-instructions';

/**
 * Cache keys and fingerprints for translation, grammar review, and audio.
 *
 * Every key is derived only from model id, prompt version, content hash, and
 * (for grammar) profile hash or (for audio) voice and synthesis options — never
 * from an API key or any other secret, so a cache key is safe to store and
 * compare without touching credentials. `ttsFingerprint`'s key generation
 * deliberately stays out of these: a test fingerprint records whether a
 * configuration was proved to work, while a cache key records what a stored
 * clip is, and replacing a key does not change any clip already produced.
 */

export function translationCacheKey(
  hasher: Hasher,
  sentenceContentHash: string,
  modelId: string,
  promptVersion: string,
  contextBeforeContentHash: string | null = null,
  contextAfterContentHash: string | null = null,
): string {
  return hashCanonical(hasher, 'translation', {
    sentenceContentHash,
    modelId,
    promptVersion,
    contextBeforeContentHash,
    contextAfterContentHash,
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

/** The whole-reading grammar configuration, including its immutable profile. */
export function grammarConfigFingerprint(
  hasher: Hasher,
  modelId: string,
  promptVersion: string,
  profileHash: string,
): string {
  return hashCanonical(hasher, 'grammar-review-config', {
    modelId,
    promptVersion,
    profileHash,
  });
}

/**
 * The canonical synthesis options a clip was produced under.
 *
 * Everything a provider is asked for that changes the audio itself, and nothing
 * else. It is hashed separately from the cache key because the stored
 * `AudioAsset` carries it as its own field: two clips that differ only in speed
 * are distinguishable without re-deriving the whole key.
 */
export function audioOptionsFingerprint(
  hasher: Hasher,
  options: {
    readonly responseFormat: string;
    readonly speed: number;
    readonly speechInstructions?: 'supported' | 'unsupported';
  },
): string {
  return hashCanonical(hasher, 'tts-options', {
    responseFormat: options.responseFormat,
    speed: options.speed,
    speechInstructions: options.speechInstructions ?? 'unsupported',
    speechInstructionVersion: SPEECH_INSTRUCTION_VERSION,
  });
}

export function audioCacheKey(
  hasher: Hasher,
  sentenceContentHash: string,
  modelId: string,
  voiceId: string,
  optionsFingerprint: string,
  contextBeforeContentHash: string | null = null,
  contextAfterContentHash: string | null = null,
): string {
  return hashCanonical(hasher, 'tts', {
    sentenceContentHash,
    modelId,
    voiceId,
    optionsFingerprint,
    contextBeforeContentHash,
    contextAfterContentHash,
  });
}

/**
 * Whether a stored audio row still matches the current configuration.
 *
 * Deliberately excludes the sentence content hash, for the same reason
 * `translationConfigFingerprint` does: a whole-reading job compares one
 * fingerprint against the job it may resume, and a fingerprint that changed per
 * sentence could never match.
 */
export function audioConfigFingerprint(
  hasher: Hasher,
  modelId: string,
  voiceId: string,
  optionsFingerprint: string,
): string {
  return hashCanonical(hasher, 'tts-config', {
    modelId,
    voiceId,
    optionsFingerprint,
  });
}
