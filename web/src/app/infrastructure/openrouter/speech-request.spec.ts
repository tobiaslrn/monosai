import { describe, expect, it } from 'vitest';
import { buildSpeechRequestBody } from './speech-request';

const SENTENCE = 'ねこがすきです。';
const BASE = {
  voiceId: 'sakura',
  text: SENTENCE,
  responseFormat: 'mp3',
} as const;

describe('buildSpeechRequestBody', () => {
  it('sends an OpenAI-compatible direction as a top-level field', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'openai/gpt-4o-mini-tts',
      speed: 0.7,
      instruction: { speed: 0.7, beforeJa: '雨が強くなりました。' },
    });

    expect(body).toMatchObject({
      model: 'openai/gpt-4o-mini-tts',
      voice: 'sakura',
      input: SENTENCE,
      response_format: 'mp3',
      speed: 0.7,
    });
    expect(String(body['instructions'])).toContain('雨が強くなりました。');
  });

  it('omits both optional channels when neither is being asked for', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'openai/gpt-4o-mini-tts',
      speed: undefined,
      instruction: undefined,
    });

    expect(body['speed']).toBeUndefined();
    expect(body['instructions']).toBeUndefined();
    expect(body['input']).toBe(SENTENCE);
  });

  it('gives Gemini a prefixed direction, native PCM, and no speed', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'google/gemini-3.1-flash-tts-preview',
      // Even a speed asked for here is dropped: Gemini ignores the parameter
      // rather than refusing it, so sending it would record a phantom setting.
      speed: 0.7,
      instruction: { speed: 0.7, beforeJa: '雨が強くなりました。' },
    });

    expect(body['response_format']).toBe('pcm');
    expect(body['speed']).toBeUndefined();
    expect(body['instructions']).toBeUndefined();
    const input = String(body['input']);
    expect(input).toContain('0.7× normal');
    // The sentence is last, and the compact prefix quotes no neighbour that
    // could be read aloud with it.
    expect(input.endsWith(SENTENCE)).toBe(true);
    expect(input).not.toContain('雨');
  });

  it('leaves the Gemini prompt exactly the sentence when no direction is sent', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'google/gemini-3.1-flash-tts-preview',
      speed: 0.7,
      instruction: undefined,
    });

    expect(body['input']).toBe(SENTENCE);
    expect(body['response_format']).toBe('pcm');
  });
});
