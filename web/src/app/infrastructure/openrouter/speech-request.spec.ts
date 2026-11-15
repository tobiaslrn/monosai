import { describe, expect, it } from 'vitest';
import { buildSpeechRequestBody } from './speech-request';

const SENTENCE = 'ねこがすきです。';
const BASE = {
  voiceId: 'sakura',
  text: SENTENCE,
  responseFormat: 'mp3',
  speechStyle: 'clear' as const,
  speechPace: 'natural' as const,
} as const;

describe('buildSpeechRequestBody', () => {
  it('sends an OpenAI-compatible direction as a top-level field', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'openai/gpt-4o-mini-tts',
      speechStyle: 'very-clear',
      speechPace: 'slow',
      instruction: { beforeJa: '雨が強くなりました。' },
    });

    expect(body).toMatchObject({
      model: 'openai/gpt-4o-mini-tts',
      voice: 'sakura',
      input: SENTENCE,
      response_format: 'mp3',
    });
    expect(String(body['instructions'])).toContain('雨が強くなりました。');
    expect(String(body['instructions'])).toContain(
      'especially precise sound definition without over-enunciating or separating words',
    );
    expect(String(body['instructions'])).toContain('a moderately slower speaking rate');
    expect(String(body['instructions'])).toContain('never insert silence between words or morae');
    expect(body['speed']).toBeUndefined();
  });

  it.each([
    ['natural' as const, 1],
    ['slow' as const, 0.9],
    ['very-slow' as const, 0.8],
  ])('sends numeric speed %s when no instruction channel is being asked for', (pace, speed) => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'openai/gpt-4o-mini-tts',
      speechPace: pace,
      instruction: undefined,
    });

    expect(body['speed']).toBe(speed);
    expect(body['instructions']).toBeUndefined();
    expect(body['input']).toBe(SENTENCE);
  });

  it('gives Gemini the same top-level direction and never folds it into the input', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      modelId: 'google/gemini-3.8-flash-lite-tts',
      responseFormat: 'pcm',
      speechStyle: 'very-clear',
      instruction: { beforeJa: '雨が強くなりました。' },
    });

    // A direction inside the spoken input is read aloud by the models that do
    // not recognise it as one; the input is only ever the sentence.
    expect(body['input']).toBe(SENTENCE);
    expect(body['response_format']).toBe('pcm');
    expect(String(body['instructions'])).toContain('especially precise sound definition');
    expect(body['speed']).toBeUndefined();
  });

  it('omits the voice when none is chosen, for models that pick their own', () => {
    const body = buildSpeechRequestBody({
      ...BASE,
      voiceId: '  ',
      modelId: 'fish-audio/s2-pro',
      instruction: undefined,
    });

    expect('voice' in body).toBe(false);
    expect(body['input']).toBe(SENTENCE);
  });
});
