import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';

const SENTENCE = 'ねこがすきです。';

const REQUEST = {
  text: SENTENCE,
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'clear' as const,
  responseFormat: 'mp3' as const,
  speechInstructions: 'supported' as const,
} as const;

function run(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

describe('OpenRouterTtsSynthesizer', () => {
  it('sends the sentence with the exact model, voice, style, and format', async () => {
    const harness = run();
    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/mpeg');
    expect(result.value.speechInstructionsApplied).toBe(true);
    expect(result.value.bytes.byteLength).toBeGreaterThan(0);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body).toMatchObject({
      model: FAKE_OPENROUTER.ttsModel,
      voice: FAKE_OPENROUTER.voice,
      input: SENTENCE,
      response_format: 'mp3',
    });
    expect(String(harness.server.requests[0]?.body['instructions'])).toContain(
      'careful articulation',
    );
    expect(harness.server.requests[0]?.body['speed']).toBeUndefined();
  });

  it('falls back to exact-text synthesis when instructions are rejected', async () => {
    const harness = run({ supportsInstructions: false });
    const result = await harness.tts.synthesize(
      { ...REQUEST, beforeJa: '前の文。' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[0]?.body['instructions']).toBeDefined();
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['input']).toBe(SENTENCE);
    expect(result.value.speechInstructionsApplied).toBe(false);
  });

  it('sends contextual delivery instructions separately and never speaks the context', async () => {
    const harness = run();
    const result = await harness.tts.synthesize(
      {
        ...REQUEST,
        beforeJa: '雨が強くなりました。',
        afterJa: 'でも、ねこは帰りませんでした。',
      },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = harness.server.requests[0].body;
    expect(body['input']).toBe(SENTENCE);
    expect(body['input']).not.toContain('雨');
    expect(body['instructions']).toContain('雨が強くなりました。');
    expect(body['instructions']).toContain('Never add, repeat, translate');
  });

  it('synthesizes Gemini TTS with a prompted style and no speed option', async () => {
    const modelId = 'google/gemini-3.1-flash-tts-preview';
    const harness = run({ knownTtsModels: [modelId] });
    const result = await harness.tts.synthesize(
      { ...REQUEST, modelId, speechStyle: 'very-clear' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/mpeg');
    expect(result.value.speechInstructionsApplied).toBe(true);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['speed']).toBeUndefined();
    expect(harness.server.requests[0]?.body['response_format']).toBe('mp3');
    expect(String(harness.server.requests[0]?.body['input'])).toContain('a short even pause');
    expect(String(harness.server.requests[0]?.body['input']).endsWith(SENTENCE)).toBe(true);
  });

  it('keeps PCM as WAV when the Gemini route does not return MP3', async () => {
    const modelId = 'google/gemini-3.1-flash-tts-preview';
    const result = await run({ knownTtsModels: [modelId], audio: 'pcm' }).tts.synthesize(
      { ...REQUEST, modelId },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/wav');
  });

  it('rejects the same malformed and undecodable audio as the test adapter', async () => {
    for (const options of [
      { audio: 'wrong-mime' },
      { decodable: false },
      { audio: 'empty' },
      { audio: 'oversized' },
    ] satisfies HarnessOptions[]) {
      const result = await run(options).tts.synthesize(REQUEST, new AbortController().signal);
      expect(result.ok).toBe(false);
    }
  });

  it('reports server and voice failures without a capability retry', async () => {
    const serverFailure = await run({ status: 500 }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );
    expect(serverFailure.ok).toBe(false);
    if (!serverFailure.ok) expect(serverFailure.error.task).toBe('tts-synthesis');

    const harness = run();
    const voiceFailure = await harness.tts.synthesize(
      { ...REQUEST, voiceId: 'absent' },
      new AbortController().signal,
    );
    expect(voiceFailure.ok).toBe(false);
    expect(harness.server.callCount).toBe(1);
  });

  it('makes no request once the signal is already aborted', async () => {
    const harness = run();
    const controller = new AbortController();
    controller.abort();

    const result = await harness.tts.synthesize(REQUEST, controller.signal);

    expect(result.ok).toBe(false);
    expect(harness.server.callCount).toBe(0);
  });

  it('accepts and refuses exactly what the configuration test does', async () => {
    const tested = await run({ audio: 'wrong-mime' }).tts.testConfiguration({
      modelId: REQUEST.modelId,
      voiceId: REQUEST.voiceId,
      speechStyle: REQUEST.speechStyle,
      attempt: declaredSpeechCapabilities(REQUEST.modelId, []),
    });
    const synthesized = await run({ audio: 'wrong-mime' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(tested.ok).toBe(false);
    expect(synthesized.ok).toBe(false);
    if (tested.ok || synthesized.ok) return;
    expect(synthesized.error.code).toBe(tested.error.code);
    expect(synthesized.error.detail?.issueCode).toBe(tested.error.detail?.issueCode);
  });
});
