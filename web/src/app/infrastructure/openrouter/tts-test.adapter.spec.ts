import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { NO_AUDIO_DECODER } from '../../domain/audio/audio-decoder';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { TTS_TEST_CONTEXT, TTS_TEST_PHRASE } from './tts-test.adapter';

const CONFIG = {
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'very-clear' as const,
  speechPace: 'natural' as const,
  attempt: declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, ['instructions']),
};

function run(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

describe('OpenRouterTtsTester', () => {
  it('synthesizes the fixed phrase with the selected speaking style', async () => {
    const harness = run();

    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/mpeg');
    expect(result.value.sample.size).toBe(result.value.byteLength);
    expect(harness.server.requests[0]?.body).toMatchObject({
      model: FAKE_OPENROUTER.ttsModel,
      voice: FAKE_OPENROUTER.voice,
      input: TTS_TEST_PHRASE,
      response_format: 'mp3',
    });
    expect(String(harness.server.requests[0]?.body['instructions'])).toContain(
      'especially precise sound definition without over-enunciating or separating words',
    );
    // The direction carries neighbouring sentences, as synthesis sends it.
    expect(String(harness.server.requests[0]?.body['instructions'])).toContain(
      TTS_TEST_CONTEXT.beforeJa,
    );
  });

  it('sends no paid request from a browser with no audio decoder', async () => {
    const harness = run({ decodable: 'missing' });

    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'unknown', task: 'tts-test', detail: { issueCode: NO_AUDIO_DECODER } },
    });
    expect(harness.server.callCount).toBe(0);
  });

  // Making an audio context is no proof of decoding: the check decodes a
  // clip of its own before one is bought.
  it('sends no paid request from a browser whose check clip does not decode', async () => {
    const harness = run({ decodable: 'fails-check' });

    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'unknown', task: 'tts-test', detail: { issueCode: NO_AUDIO_DECODER } },
    });
    expect(harness.server.callCount).toBe(0);
  });

  it('tries exactly the channels the catalog declared', async () => {
    const harness = run();
    const attempt = declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, ['voice']);

    const result = await harness.tts.testConfiguration({ ...CONFIG, attempt });

    expect(result.ok && result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[0]?.body['speed']).toBe(1);
  });

  it('measures a declared direction channel and reports its rejection', async () => {
    const harness = run({ supportsInstructions: false });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['speed']).toBe(1);
  });

  it('drops a refused speed after falling back from instructions', async () => {
    const harness = run({ supportsInstructions: false, supportsSpeed: false });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    expect(harness.server.callCount).toBe(3);
    expect(harness.server.requests[0]?.body['instructions']).toBeDefined();
    expect(harness.server.requests[0]?.body['speed']).toBeUndefined();
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['speed']).toBe(1);
    expect(harness.server.requests[2]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[2]?.body['speed']).toBeUndefined();
  });

  it('directs Gemini TTS through the instructions field, in PCM once MP3 is refused', async () => {
    const geminiModel = 'google/gemini-3.8-flash-lite-tts';
    const harness = run({ knownTtsModels: [geminiModel], pcmOnlyRate: 24_000 });
    const result = await harness.tts.testConfiguration({
      ...CONFIG,
      modelId: geminiModel,
      attempt: declaredSpeechCapabilities(geminiModel, ['voice']),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/webm');
    expect(result.value.speechInstructionsApplied).toBe(true);
    // MP3 refused, then PCM with the direction, then PCM without it to compare.
    expect(harness.server.requests.map((request) => request.body['response_format'])).toEqual([
      'mp3',
      'pcm',
      'pcm',
    ]);
    const accepted = harness.server.requests[1]!.body;
    expect(accepted['input']).toBe(TTS_TEST_PHRASE);
    expect(String(accepted['instructions'])).toContain('especially precise sound definition');
  });

  it('retries without a direction that was read aloud', async () => {
    const harness = run({ clipSeconds: [40, 1.5] });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[0]?.body['instructions']).toBeDefined();
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
    expect(harness.server.requests[1]?.body['speed']).toBe(1);
  });

  it('fails a model whose clip stays far longer than the phrase', async () => {
    const harness = run({ clipSeconds: [40, 40] });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('unexpected-length');
    expect(harness.server.callCount).toBe(2);
  });

  it('drops a direction whose context was read aloud, though it fits the length bound', async () => {
    const harness = run({ clipSeconds: [5.6, 1.4] });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
  });

  it('keeps a direction that only slows the reading', async () => {
    const harness = run({ clipSeconds: [3, 1.5] });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok && result.value.speechInstructionsApplied).toBe(true);
    expect(harness.server.callCount).toBe(2);
  });

  it('does not retry a long clip that carried no direction', async () => {
    const attempt = declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, ['voice']);
    const harness = run({ clipSeconds: [40] });
    const result = await harness.tts.testConfiguration({ ...CONFIG, attempt });

    expect(result.ok).toBe(false);
    expect(harness.server.callCount).toBe(1);
  });

  it('tests a model with no voice by leaving the voice out', async () => {
    const harness = run({ knownVoices: [''] });
    const result = await harness.tts.testConfiguration({ ...CONFIG, voiceId: '' });

    expect(result.ok).toBe(true);
    expect('voice' in harness.server.requests[0]!.body).toBe(false);
  });

  it('rejects an unknown voice as a capability failure', async () => {
    const harness = run();
    const result = await harness.tts.testConfiguration({ ...CONFIG, voiceId: 'absent' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('capability-unsupported');
    expect(result.error.detail?.capability).toBe('voice');
    expect(harness.server.callCount).toBe(1);
  });

  it('rejects an unknown model and invalid audio', async () => {
    const unknown = await run().tts.testConfiguration({ ...CONFIG, modelId: 'vendor/absent' });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error.code).toBe('model-not-found');

    const invalid = await run({ audio: 'wrong-mime' }).tts.testConfiguration(CONFIG);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.code).toBe('audio-invalid');
    expect(invalid.error.detail?.issueCode).toBe('unsupported-mime');
  });

  it('keeps malformed, undecodable, oversized, offline, and server failures typed', async () => {
    for (const options of [
      { audio: 'empty' },
      { audio: 'oversized' },
      { decodable: false },
      { online: false },
      { status: 500 },
    ] satisfies HarnessOptions[]) {
      const result = await run(options).tts.testConfiguration(CONFIG);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.task).toBe('tts-test');
    }
  });
});
