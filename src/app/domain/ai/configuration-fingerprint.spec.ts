import { describe, expect, it } from 'vitest';
import type { Hasher } from '../shared/hashing';
import {
  NO_KEY_GENERATION,
  textModelFingerprint,
  ttsFingerprint,
} from './configuration-fingerprint';

const hasher: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

const TEXT = { modelId: 'vendor/text-model' };
const TTS = { modelId: 'vendor/tts-model', voiceId: 'sakura', speed: 1 };

describe('textModelFingerprint', () => {
  it('is stable for identical inputs', () => {
    expect(textModelFingerprint(hasher, 4, TEXT)).toBe(textModelFingerprint(hasher, 4, TEXT));
  });

  it('changes when the model changes', () => {
    expect(textModelFingerprint(hasher, 4, { modelId: 'vendor/other' })).not.toBe(
      textModelFingerprint(hasher, 4, TEXT),
    );
  });

  it('changes when the key generation changes', () => {
    expect(textModelFingerprint(hasher, 5, TEXT)).not.toBe(textModelFingerprint(hasher, 4, TEXT));
  });

  it('treats a removed key as its own generation', () => {
    expect(textModelFingerprint(hasher, NO_KEY_GENERATION, TEXT)).not.toBe(
      textModelFingerprint(hasher, 4, TEXT),
    );
  });

  it('never contains the API key, because it never receives one', () => {
    expect(textModelFingerprint(hasher, 4, TEXT)).not.toContain('sk-or');
  });
});

describe('ttsFingerprint', () => {
  it('changes when the model, the voice, or the speed changes', () => {
    const base = ttsFingerprint(hasher, 4, TTS);

    expect(ttsFingerprint(hasher, 4, { ...TTS, modelId: 'vendor/other' })).not.toBe(base);
    expect(ttsFingerprint(hasher, 4, { ...TTS, voiceId: 'kaede' })).not.toBe(base);
    expect(ttsFingerprint(hasher, 4, { ...TTS, speed: 1.25 })).not.toBe(base);
  });

  it('changes when the key generation changes', () => {
    expect(ttsFingerprint(hasher, 5, TTS)).not.toBe(ttsFingerprint(hasher, 4, TTS));
  });
});

describe('text and TTS readiness independence', () => {
  it('leaves the text fingerprint untouched when TTS settings change', () => {
    const text = textModelFingerprint(hasher, 4, TEXT);

    ttsFingerprint(hasher, 4, { ...TTS, voiceId: 'kaede', speed: 2 });

    expect(textModelFingerprint(hasher, 4, TEXT)).toBe(text);
  });

  it('leaves the TTS fingerprint untouched when the text model changes', () => {
    const tts = ttsFingerprint(hasher, 4, TTS);

    textModelFingerprint(hasher, 4, { modelId: 'vendor/changed' });

    expect(ttsFingerprint(hasher, 4, TTS)).toBe(tts);
  });

  it('produces different fingerprints for the same values under different domains', () => {
    expect(ttsFingerprint(hasher, 4, { modelId: 'same', voiceId: '', speed: 1 })).not.toBe(
      textModelFingerprint(hasher, 4, { modelId: 'same' }),
    );
  });
});
