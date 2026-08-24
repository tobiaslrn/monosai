import { describe, expect, it } from 'vitest';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';

const SENTENCE = 'ねこがすきです。';

const REQUEST = {
  text: SENTENCE,
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speed: 1.25,
  responseFormat: 'mp3',
} as const;

function run(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

/**
 * The adapter fixtures `testing-and-delivery.md` section 5 names: valid MP3,
 * wrong MIME, empty body, oversized body, and undecodable audio. Each has to
 * arrive as its own `audio-invalid` `issueCode` or its own client error, so a
 * learner is told which of the five happened rather than "audio failed".
 */
describe('OpenRouterTtsSynthesizer', () => {
  it('sends the sentence with the exact model, voice, speed, and format', async () => {
    const harness = run();

    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.mimeType).toBe('audio/mpeg');
    expect(result.value.speedApplied).toBe(true);
    expect(result.value.bytes.byteLength).toBeGreaterThan(0);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body).toMatchObject({
      model: FAKE_OPENROUTER.ttsModel,
      voice: FAKE_OPENROUTER.voice,
      input: SENTENCE,
      response_format: 'mp3',
      speed: 1.25,
    });
  });

  it('retries once without speed and records that the setting was ignored', async () => {
    const harness = run({ supportsSpeed: false });

    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // ADR 0018: a refused speed is reported rather than pretended, and the
    // fallback is one extra request and no more.
    expect(result.value.speedApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['speed']).toBeUndefined();
    expect(harness.server.requests[1]?.body['input']).toBe(SENTENCE);
  });

  it('sends contextual delivery instructions separately and never speaks the context', async () => {
    const harness = run();
    const result = await harness.tts.synthesize(
      {
        ...REQUEST,
        speechInstructions: 'supported',
        beforeJa: '雨が強くなりました。',
        afterJa: 'でも、ねこは帰りませんでした。',
      },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const body = harness.server.requests[0].body;
    expect(body['input']).toBe(SENTENCE);
    expect(body['input']).not.toContain('雨');
    expect(body['instructions']).toContain('雨が強くなりました。');
    expect(body['instructions']).toContain('Never add, repeat, translate');
    expect(result.value.speechInstructionsApplied).toBe(true);
  });

  it('falls back to exact-text synthesis when advertised instructions are rejected', async () => {
    const harness = run({ supportsInstructions: false });
    const result = await harness.tts.synthesize(
      { ...REQUEST, speechInstructions: 'supported', beforeJa: '前の文。' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[0]?.body['instructions']).toBeDefined();
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['input']).toBe(SENTENCE);
    expect(result.value.speechInstructionsApplied).toBe(false);
  });

  it('synthesizes with Gemini TTS without sending its unsupported speed option', async () => {
    const modelId = 'google/gemini-3.1-flash-tts-preview';
    const harness = run({ knownTtsModels: [modelId] });

    const result = await harness.tts.synthesize(
      { ...REQUEST, modelId },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.speedApplied).toBe(false);
    expect(result.value.mimeType).toBe('audio/wav');
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['speed']).toBeUndefined();
    expect(harness.server.requests[0]?.body['response_format']).toBe('pcm');
  });

  it('rejects audio in a format the cache cannot store', async () => {
    const result = await run({ audio: 'wrong-mime' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('unsupported-mime');
  });

  it('rejects a clip this browser cannot decode', async () => {
    const result = await run({ decodable: false }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('undecodable');
  });

  it('rejects an empty clip', async () => {
    const result = await run({ audio: 'empty' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
  });

  it('refuses an oversized clip', async () => {
    const result = await run({ audio: 'oversized' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('response-too-large');
  });

  it('reports every failure against the tts-synthesis task', async () => {
    const result = await run({ status: 500 }).tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.task).toBe('tts-synthesis');
  });

  it('rejects an unknown voice without a second request', async () => {
    const harness = run();

    const result = await harness.tts.synthesize(
      { ...REQUEST, voiceId: 'absent' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    // A refused *voice* must not trigger the speed fallback: only a refused
    // `speed` parameter does, and retrying anything else would double the cost
    // of a request that was never going to work.
    expect(result.error.code).toBe('capability-unsupported');
    expect(result.error.detail?.capability).toBe('voice');
    expect(harness.server.callCount).toBe(1);
  });

  it('makes no request at all once the signal is already aborted', async () => {
    const harness = run();
    const controller = new AbortController();
    controller.abort();

    const result = await harness.tts.synthesize(REQUEST, controller.signal);

    expect(result.ok).toBe(false);
    expect(harness.server.callCount).toBe(0);
  });

  /**
   * The tester and the synthesizer must agree exactly on what "audio Monosai
   * can store" means: a clip the test accepted but synthesis refuses would make
   * a passing configuration test a lie.
   */
  it('accepts and refuses exactly what the configuration test does', async () => {
    for (const options of [
      { audio: 'wrong-mime' },
      { decodable: false },
      { audio: 'empty' },
      { audio: 'oversized' },
    ] satisfies HarnessOptions[]) {
      const tested = await run(options).tts.testConfiguration({
        modelId: REQUEST.modelId,
        voiceId: REQUEST.voiceId,
        speed: REQUEST.speed,
      });
      const synthesized = await run(options).tts.synthesize(REQUEST, new AbortController().signal);

      expect(tested.ok).toBe(false);
      expect(synthesized.ok).toBe(false);
      if (tested.ok || synthesized.ok) {
        return;
      }
      expect(synthesized.error.code).toBe(tested.error.code);
      expect(synthesized.error.detail?.issueCode).toBe(tested.error.detail?.issueCode);
    }
  });
});
