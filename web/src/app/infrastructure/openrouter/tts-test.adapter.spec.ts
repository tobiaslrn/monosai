import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { TTS_TEST_PHRASE } from './tts-test.adapter';

const CONFIG = {
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'very-clear' as const,
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
      'a short even pause between phrases',
    );
  });

  it('tries exactly the channels the catalog declared', async () => {
    const harness = run();
    const attempt = declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, ['voice']);

    const result = await harness.tts.testConfiguration({ ...CONFIG, attempt });

    expect(result.ok && result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['instructions']).toBeUndefined();
  });

  it('measures a declared direction channel and reports its rejection', async () => {
    const harness = run({ supportsInstructions: false });
    const result = await harness.tts.testConfiguration(CONFIG);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['instructions']).toBeUndefined();
  });

  it('supports Gemini TTS with a prefixed style direction', async () => {
    const geminiModel = 'google/gemini-3.1-flash-tts-preview';
    const harness = run({ knownTtsModels: [geminiModel] });
    const result = await harness.tts.testConfiguration({
      ...CONFIG,
      modelId: geminiModel,
      attempt: declaredSpeechCapabilities(geminiModel, ['voice']),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mimeType).toBe('audio/webm');
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['instructions']).toBeUndefined();
    expect(String(harness.server.requests[0]?.body['input'])).toContain('a short even pause');
    expect(String(harness.server.requests[0]?.body['input']).endsWith(TTS_TEST_PHRASE)).toBe(true);
    expect(result.value.speechInstructionsApplied).toBe(true);
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
