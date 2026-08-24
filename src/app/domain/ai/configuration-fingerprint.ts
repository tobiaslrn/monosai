import { hashCanonical, type Hasher } from '../shared/hashing';
import type { TextModelConfig, TtsConfig } from './model-test';

/**
 * Revision of the provider request/response protocol this build speaks.
 *
 * It is part of both fingerprints so that changing how Monosai talks to the
 * provider retires old test results instead of letting a stale success vouch
 * for a request shape that was never tried.
 */
export const AI_ENDPOINT_VERSION = 'openrouter-v1';

/** Bumped when the text compatibility test itself changes what it proves. */
export const TEXT_MODEL_TEST_VERSION = 2;

/** Bumped when the TTS compatibility test itself changes what it proves. */
export const TTS_TEST_VERSION = 3;

/**
 * How many times the saved key has changed, used in place of the key.
 *
 * The credential's `updatedAt` is a generation counter: it moves on save,
 * replace, and removal, so a fingerprint built from it goes stale exactly when
 * the key changes. The key itself must never enter a fingerprint — a hash of a
 * secret is still derived from the secret, and fingerprints are persisted in
 * ordinary settings records.
 */
export type KeyGeneration = number;

/** No key is saved. Distinct from any real generation, so tests read as stale. */
export const NO_KEY_GENERATION: KeyGeneration = -1;

export function textModelFingerprint(
  hasher: Hasher,
  keyGeneration: KeyGeneration,
  config: TextModelConfig,
): string {
  return hashCanonical(hasher, 'text-model-test', {
    keyGeneration,
    modelId: config.modelId,
    reasoningEffort: config.reasoningEffort ?? null,
    endpointVersion: AI_ENDPOINT_VERSION,
    testVersion: TEXT_MODEL_TEST_VERSION,
  });
}

/**
 * Deliberately shares no input with the text fingerprint beyond the key
 * generation, which is why replacing a voice cannot disturb text readiness and
 * a TTS capability failure cannot imply anything about the text model.
 */
export function ttsFingerprint(
  hasher: Hasher,
  keyGeneration: KeyGeneration,
  config: TtsConfig,
): string {
  return hashCanonical(hasher, 'tts-test', {
    keyGeneration,
    modelId: config.modelId,
    voiceId: config.voiceId,
    speed: config.speed,
    speechInstructions: config.speechInstructions,
    endpointVersion: AI_ENDPOINT_VERSION,
    testVersion: TTS_TEST_VERSION,
  });
}
