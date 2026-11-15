import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { openRouterHarness } from '../../../testing/ai-fakes';
import { SpeechRefusals } from './speech-attempts';

const SENTENCE = 'ねこがすきです。';

const SYNTHESIS = {
  text: SENTENCE,
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'clear' as const,
  speechPace: 'natural' as const,
  responseFormat: 'mp3' as const,
  speechInstructions: 'supported' as const,
} as const;

describe('SpeechRefusals', () => {
  it('remembers a refused format and a refused speed per model', () => {
    const refusals = new SpeechRefusals();
    refusals.rememberFormat('vendor/pcm-only', 'pcm');
    refusals.rememberNoSpeed('vendor/pcm-only');

    expect(refusals.formatFor('vendor/pcm-only')).toBe('pcm');
    expect(refusals.acceptsSpeed('vendor/pcm-only')).toBe(false);
    expect(refusals.formatFor('vendor/other')).toBe('mp3');
    expect(refusals.acceptsSpeed('vendor/other')).toBe(true);
  });
});

describe('requestSpeech', () => {
  it('steps down through every refused part once and then succeeds', async () => {
    const harness = openRouterHarness({
      pcmOnlyRate: 24_000,
      supportsInstructions: false,
      supportsSpeed: false,
    });

    const result = await harness.tts.synthesize(SYNTHESIS, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.speechInstructionsApplied).toBe(false);
    expect(harness.server.callCount).toBeLessThanOrEqual(4);
    const accepted = harness.server.requests.at(-1)!.body;
    expect(accepted['response_format']).toBe('pcm');
    expect(accepted['instructions']).toBeUndefined();
    expect(accepted['speed']).toBeUndefined();
  });

  it('lets synthesis reuse what the configuration test learned about the format', async () => {
    const harness = openRouterHarness({ pcmOnlyRate: 24_000 });

    const tested = await harness.tts.testConfiguration({
      modelId: FAKE_OPENROUTER.ttsModel,
      voiceId: FAKE_OPENROUTER.voice,
      speechStyle: 'clear',
      speechPace: 'natural',
      attempt: declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, ['instructions']),
    });
    expect(tested.ok).toBe(true);
    const afterTest = harness.server.callCount;

    const synthesized = await harness.tts.synthesize(SYNTHESIS, new AbortController().signal);
    expect(synthesized.ok).toBe(true);
    expect(harness.server.callCount).toBe(afterTest + 1);
    expect(harness.server.requests.at(-1)?.body['response_format']).toBe('pcm');
  });

  it('pays a refused speed once per model, not once per sentence', async () => {
    const harness = openRouterHarness({ supportsSpeed: false });
    const plain = { ...SYNTHESIS, speechInstructions: 'unsupported' as const };

    expect((await harness.tts.synthesize(plain, new AbortController().signal)).ok).toBe(true);
    expect(harness.server.callCount).toBe(2);
    expect((await harness.tts.synthesize(plain, new AbortController().signal)).ok).toBe(true);
    expect(harness.server.callCount).toBe(3);
    expect(harness.server.requests[2]?.body['speed']).toBeUndefined();
  });

  it('returns a refusal it cannot step past instead of retrying it', async () => {
    const harness = openRouterHarness();

    const result = await harness.tts.synthesize(
      { ...SYNTHESIS, voiceId: 'absent' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail?.capability).toBe('voice');
    expect(harness.server.callCount).toBe(1);
  });
});
