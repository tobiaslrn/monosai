import { describe, expect, it } from 'vitest';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { TTS_TEST_PHRASE } from './tts-test.adapter';

const CONFIG = {
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speed: 1.25,
};

function run(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

describe('OpenRouterTtsTester', () => {
  it('synthesizes the fixed phrase with the exact model, voice, and speed', async () => {
    const harness = run();

    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.speedApplied).toBe(true);
    expect(result.value.mimeType).toBe('audio/mpeg');
    expect(result.value.sample.size).toBe(result.value.byteLength);
    expect(harness.server.requests[0]?.body).toMatchObject({
      model: FAKE_OPENROUTER.ttsModel,
      voice: FAKE_OPENROUTER.voice,
      input: TTS_TEST_PHRASE,
      response_format: 'mp3',
      speed: 1.25,
    });
  });

  it('retries once without speed and reports that the setting was ignored', async () => {
    const harness = run({ supportsSpeed: false });

    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.speedApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['speed']).toBeUndefined();
  });

  it('verifies advertised speech instructions and reports rejection fallback', async () => {
    const supported = run();
    const accepted = await supported.tts.testConfiguration({
      ...CONFIG,
      speechInstructions: 'supported',
    });
    expect(accepted.ok && accepted.value.speechInstructionsApplied).toBe(true);
    expect(supported.server.requests[0]?.body['instructions']).toBeDefined();

    const rejected = run({ supportsInstructions: false });
    const fallback = await rejected.tts.testConfiguration({
      ...CONFIG,
      speechInstructions: 'supported',
    });
    expect(fallback.ok && fallback.value.speechInstructionsApplied).toBe(false);
    expect(rejected.server.callCount).toBe(2);
    expect(rejected.server.requests[1]?.body['instructions']).toBeUndefined();
  });

  it('supports Gemini TTS without claiming its ignored speed setting was applied', async () => {
    const geminiModel = 'google/gemini-3.1-flash-tts-preview';
    const harness = run({ knownTtsModels: [geminiModel] });

    const result = await harness.tts.testConfiguration({
      ...CONFIG,
      modelId: geminiModel,
    });

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

  it('rejects an unknown voice as a capability failure', async () => {
    const harness = run();

    const result = await harness.tts.testConfiguration({ ...CONFIG, voiceId: 'absent' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('capability-unsupported');
    expect(result.error.detail?.capability).toBe('voice');
    expect(harness.server.callCount).toBe(1);
  });

  it('rejects an unknown model', async () => {
    const result = await run().tts.testConfiguration({ ...CONFIG, modelId: 'vendor/absent' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('model-not-found');
  });

  it('rejects audio in a format the cache cannot store', async () => {
    const result = await run({ audio: 'wrong-mime' }).tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('unsupported-mime');
  });

  it('rejects a clip this browser cannot decode', async () => {
    const result = await run({ decodable: false }).tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('audio-invalid');
    expect(result.error.detail?.issueCode).toBe('undecodable');
  });

  it('rejects an empty clip', async () => {
    const result = await run({ audio: 'empty' }).tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
  });

  it('refuses an oversized clip', async () => {
    const result = await run({ audio: 'oversized' }).tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('response-too-large');
  });

  it('reports every failure against the tts-test task', async () => {
    const result = await run({ status: 500 }).tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.task).toBe('tts-test');
  });
});
