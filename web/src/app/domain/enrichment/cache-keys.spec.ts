import { describe, expect, it } from 'vitest';
import type { Hasher } from '../shared/hashing';
import {
  audioCacheKey,
  audioConfigFingerprint,
  audioOptionsFingerprint,
  grammarCacheKey,
  translationCacheKey,
  translationConfigFingerprint,
} from './cache-keys';

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

describe('audioOptionsFingerprint', () => {
  it('is stable for identical options', () => {
    expect(audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' })).toBe(
      audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' }),
    );
  });

  it('changes when the style or the response format changes', () => {
    const base = audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' });

    expect(
      audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'very-clear' }),
    ).not.toBe(base);
    expect(
      audioOptionsFingerprint(HASHER, { responseFormat: 'opus', speechStyle: 'clear' }),
    ).not.toBe(base);
    expect(
      audioOptionsFingerprint(HASHER, {
        responseFormat: 'mp3',
        speechStyle: 'clear',
        speechInstructions: 'supported',
      }),
    ).not.toBe(base);
  });

  /**
   * The playback pace is part of the current clip identity, while the
   * instruction version is conditional on the instruction channel. This value
   * therefore changes once for the new provider-MP3 storage contract but
   * remains stable across future instruction wording changes for uninstructed
   * clips.
   */
  it('includes the local playback pace without an instruction version', () => {
    expect(audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' })).toBe(
      '46234b88',
    );
  });
});

describe('audioCacheKey', () => {
  const OPTIONS = audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' });
  const OTHER_STYLE = audioOptionsFingerprint(HASHER, {
    responseFormat: 'mp3',
    speechStyle: 'very-clear',
  });
  const OPUS = audioOptionsFingerprint(HASHER, { responseFormat: 'opus', speechStyle: 'clear' });

  it('is stable for identical inputs', () => {
    expect(audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS)).toBe(
      audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS),
    );
  });

  it('changes for the model, the voice, the style, and the format', () => {
    const base = audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS);

    expect(audioCacheKey(HASHER, 'content-hash', 'tts-b', 'voice-a', OPTIONS)).not.toBe(base);
    expect(audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-b', OPTIONS)).not.toBe(base);
    expect(audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OTHER_STYLE)).not.toBe(base);
    expect(audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPUS)).not.toBe(base);
  });

  it('changes when the sentence changes, and for nothing else', () => {
    const base = audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS);

    expect(audioCacheKey(HASHER, 'other-hash', 'tts-a', 'voice-a', OPTIONS)).not.toBe(base);
    // Same five inputs, computed again from scratch: nothing ambient — no
    // clock, no counter, no credential — may leak into a key that is compared
    // across sessions.
    expect(audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS)).toBe(base);
  });

  it('changes when either contextual neighbor changes', () => {
    const base = audioCacheKey(
      HASHER,
      'content-hash',
      'tts-a',
      'voice-a',
      OPTIONS,
      'before-a',
      'after-a',
    );

    expect(
      audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS, 'before-b', 'after-a'),
    ).not.toBe(base);
    expect(
      audioCacheKey(HASHER, 'content-hash', 'tts-a', 'voice-a', OPTIONS, 'before-a', 'after-b'),
    ).not.toBe(base);
  });

  /**
   * The credential must never reach a cache key. `ttsFingerprint` mixes it in
   * because it records whether a *test* still stands; a cache key is written to
   * disk in every audio row, and a key derived from a credential would put a
   * function of that credential on disk with it (ADR 0024).
   */
  it('takes no credential, so no stored key can be a function of one', () => {
    expect(audioCacheKey).toHaveLength(5);
    expect(audioConfigFingerprint).toHaveLength(4);
    expect(audioOptionsFingerprint).toHaveLength(2);
  });

  it('never collides with a translation key built from the same raw fields', () => {
    expect(audioCacheKey(HASHER, 'content-hash', 'model-a', 'voice-a', OPTIONS)).not.toBe(
      translationCacheKey(HASHER, 'content-hash', 'model-a', 'voice-a'),
    );
  });
});

describe('audioConfigFingerprint', () => {
  const OPTIONS = audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'clear' });

  it('does not vary with sentence content', () => {
    // It cannot: there is no parameter for it. A job compares one fingerprint
    // against the whole reading, so a per-sentence value could never match.
    expect(audioConfigFingerprint(HASHER, 'tts-a', 'voice-a', OPTIONS)).toBe(
      audioConfigFingerprint(HASHER, 'tts-a', 'voice-a', OPTIONS),
    );
  });

  it('changes when the model, the voice, or the options change', () => {
    const base = audioConfigFingerprint(HASHER, 'tts-a', 'voice-a', OPTIONS);

    expect(audioConfigFingerprint(HASHER, 'tts-b', 'voice-a', OPTIONS)).not.toBe(base);
    expect(audioConfigFingerprint(HASHER, 'tts-a', 'voice-b', OPTIONS)).not.toBe(base);
    expect(
      audioConfigFingerprint(
        HASHER,
        'tts-a',
        'voice-a',
        audioOptionsFingerprint(HASHER, { responseFormat: 'mp3', speechStyle: 'natural' }),
      ),
    ).not.toBe(base);
  });

  it('is not the cache key of the same configuration', () => {
    expect(audioConfigFingerprint(HASHER, 'tts-a', 'voice-a', OPTIONS)).not.toBe(
      audioCacheKey(HASHER, '', 'tts-a', 'voice-a', OPTIONS),
    );
  });
});
