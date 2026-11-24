import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { AUDIO_CHECK_TIMED_OUT, NO_AUDIO_DECODER } from '../../domain/audio/audio-decoder';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';

const SENTENCE = 'ねこがすきです。';

const REQUEST = {
  text: SENTENCE,
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'clear' as const,
  speechPace: 'natural' as const,
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
      'pronounce sounds precisely and clearly without over-enunciating',
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
    expect(harness.server.requests[1]?.body['speed']).toBe(1);
    expect(result.value.speechInstructionsApplied).toBe(false);
  });

  it('drops a refused speed after falling back from instructions', async () => {
    const harness = run({ supportsInstructions: false, supportsSpeed: false });
    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(true);
    expect(harness.server.callCount).toBe(3);
    expect(harness.server.requests[0]?.body['instructions']).toBeDefined();
    expect(harness.server.requests[0]?.body['speed']).toBeUndefined();
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['speed']).toBe(1);
    expect(harness.server.requests[2]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[2]?.body['speed']).toBeUndefined();
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
    const body = harness.server.requests[0]!.body;
    expect(body['input']).toBe(SENTENCE);
    expect(body['input']).not.toContain('雨');
    expect(body['instructions']).toContain('雨が強くなりました。');
    expect(body['instructions']).toContain('Never add, repeat, translate');
  });

  it('steps down to PCM when a model refuses MP3, and remembers it', async () => {
    const modelId = 'google/gemini-3.8-flash-lite-tts';
    const harness = run({ knownTtsModels: [modelId], pcmOnlyRate: 24_000 });
    const first = await harness.tts.synthesize(
      { ...REQUEST, modelId, speechStyle: 'very-clear' },
      new AbortController().signal,
    );

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.mimeType).toBe('audio/webm');
    expect(first.value.speechInstructionsApplied).toBe(true);
    expect(harness.server.requests.map((request) => request.body['response_format'])).toEqual([
      'mp3',
      'pcm',
    ]);
    const accepted = harness.server.requests[1]!.body;
    expect(accepted['input']).toBe(SENTENCE);
    expect(String(accepted['instructions'])).toContain('especially precise sound definition');
    expect(accepted['speed']).toBeUndefined();

    const second = await harness.tts.synthesize(
      { ...REQUEST, modelId },
      new AbortController().signal,
    );
    expect(second.ok).toBe(true);
    expect(harness.server.callCount).toBe(3);
    expect(harness.server.requests[2]?.body['response_format']).toBe('pcm');
  });

  it('compresses PCM speech at any rate, and keeps it as WAV without an encoder', async () => {
    const compressed = await run({ pcmOnlyRate: 44_100 }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );
    expect(compressed.ok).toBe(true);
    if (!compressed.ok) return;
    expect(compressed.value.mimeType).toBe('audio/webm');
    expect(compressed.value.bytes.byteLength).toBeLessThan(2048);

    const uncompressed = await run({ pcmOnlyRate: 44_100, encoder: 'unsupported' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );
    expect(uncompressed.ok).toBe(true);
    if (!uncompressed.ok) return;
    expect(uncompressed.value.mimeType).toBe('audio/wav');
    // The WAV header carries the rate the reply declared, not an assumed one.
    expect(new DataView(uncompressed.value.bytes).getUint32(24, true)).toBe(44_100);
  });

  it('refuses PCM audio when encoding fails', async () => {
    const result = await run({ pcmOnlyRate: 24_000, encoder: 'fails' }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('encode-failed');
  });

  it('asks again without a direction that was read aloud', async () => {
    const harness = run({ clipSeconds: [48, 3] });
    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['input']).toBe(SENTENCE);
  });

  it('refuses a clip that stays far longer than its sentence could take to read', async () => {
    const harness = run({ clipSeconds: [48] });
    const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('unexpected-length');
    expect(harness.server.callCount).toBe(2);
  });

  it('synthesizes with no voice for a model that picks its own', async () => {
    const harness = run({ knownVoices: [''] });
    const result = await harness.tts.synthesize(
      { ...REQUEST, voiceId: '' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    expect('voice' in harness.server.requests[0]!.body).toBe(false);
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

  it('tells a clip that does not decode from a browser with nothing to decode it', async () => {
    const undecodable = await run({ decodable: false }).tts.synthesize(
      REQUEST,
      new AbortController().signal,
    );
    expect(undecodable).toMatchObject({
      ok: false,
      error: { code: 'audio-invalid', detail: { issueCode: 'undecodable' } },
    });

    const harness = run({ decodable: 'no-decoder' });
    const noDecoder = await harness.tts.synthesize(REQUEST, new AbortController().signal);
    expect(noDecoder).toMatchObject({
      ok: false,
      error: { code: 'unknown', detail: { issueCode: NO_AUDIO_DECODER } },
    });
    expect(harness.server.callCount).toBe(1);

    // Found out once, paid for once: the next sentence is not asked for.
    const again = await harness.tts.synthesize(REQUEST, new AbortController().signal);
    expect(again).toMatchObject({
      ok: false,
      error: { code: 'unknown', detail: { issueCode: NO_AUDIO_DECODER } },
    });
    expect(harness.server.callCount).toBe(1);
  });

  it.each(['missing', 'fails-check'] as const)(
    'asks for nothing in a browser with no audio decoder (%s)',
    async (decodable) => {
      const harness = run({ decodable });

      const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'unknown', task: 'tts-synthesis', detail: { issueCode: NO_AUDIO_DECODER } },
      });
      expect(harness.server.callCount).toBe(0);
    },
  );

  // A check that did not answer proves nothing about the browser: nothing is
  // paid for, the failure says so apart from a missing decoder, and the next
  // sentence asks again.
  it('asks for nothing, and reports a retryable failure, when the decoder check times out', async () => {
    const harness = run({ decodable: 'check-times-out' });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await harness.tts.synthesize(REQUEST, new AbortController().signal);
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'unknown',
          task: 'tts-synthesis',
          detail: { issueCode: AUDIO_CHECK_TIMED_OUT },
        },
      });
    }
    expect(harness.server.callCount).toBe(0);
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
      speechPace: REQUEST.speechPace,
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
