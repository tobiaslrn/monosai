import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import { resolveTtsVoice } from '../../domain/ai/tts-configuration';
import { err, ok, type Result } from '../../domain/shared/result';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import type { AudioDecoder } from './audio-decode';
import type { OpenRouterClient } from './openrouter-client';
import { spokeBeyondText } from './audio-verification';
import { SpeechRefusals, type SpeechAttempt } from './speech-attempts';
import { speechClip, type SpeechClipPorts } from './speech-clip';

const TASK = 'tts-test';

/**
 * The fixed phrase every TTS test synthesizes.
 *
 * A constant sentence keeps results comparable between attempts and keeps the
 * test from spending on anything longer than it needs. It is ordinary Japanese
 * so an unsupported-language failure surfaces here rather than mid-reading.
 */
export const TTS_TEST_PHRASE = 'これはテストです。';

/**
 * Neighbouring sentences sent with the test phrase as context.
 *
 * Synthesis sends the sentences around each one in its direction, so the test
 * sends the same kind of direction rather than one synthesis never sends.
 */
export const TTS_TEST_CONTEXT = {
  beforeJa: '今日は晴れています。',
  afterJa: '明日も晴れるでしょう。',
} as const;

/**
 * Verifies one exact TTS model, voice, speaking style, and pace against the provider.
 *
 * Failure here says nothing about the text model: the two configurations are
 * tested, stored, and reported separately, and TTS never blocks reading or
 * generation.
 *
 * The catalog leads and this test confirms: `config.attempt` says whether the
 * instruction channel should be tried. A provider can disagree in two ways. It
 * can refuse the field, which `requestSpeech` answers by dropping it; or it can
 * accept the field and read it aloud, which only the clip's length reveals,
 * and which `speechClip` answers by asking again without it. Whichever version
 * is kept is what synthesis will send from then on.
 *
 * What counts as storable audio lives in `audio-verification.ts`, shared with
 * synthesis, so a passing test can never accept a clip synthesis would refuse.
 */
export class OpenRouterTtsTester {
  private readonly ports: SpeechClipPorts;

  constructor(
    client: OpenRouterClient,
    decoder: AudioDecoder,
    encoder: SpeechEncoder,
    refusals: SpeechRefusals = new SpeechRefusals(),
  ) {
    this.ports = { client, decoder, encoder, refusals };
  }

  async testConfiguration(
    config: TtsConfig,
    signal?: AbortSignal,
  ): Promise<Result<TtsTest, AiError>> {
    const modelId = config.modelId.trim();
    if (modelId === '') {
      return err(aiError('model-not-found', TASK, 'No TTS model ID was given.'));
    }
    const voiceId = resolveTtsVoice(modelId, config.voiceId);
    const attempt: SpeechAttempt = {
      task: TASK,
      modelId,
      voiceId,
      text: TTS_TEST_PHRASE,
      speechStyle: config.speechStyle,
      speechPace: config.speechPace,
      instruction: config.attempt.instructions
        ? { ...TTS_TEST_CONTEXT, style: config.speechStyle }
        : undefined,
      ...(signal === undefined ? {} : { signal }),
    };
    let clip = await speechClip(this.ports, attempt);
    if (!clip.ok) {
      return clip;
    }
    // A direction or its context read aloud can still fit the generous
    // length bound, so the test — paid once per configuration, unlike
    // synthesis — also hears the phrase without it and compares the two.
    if (clip.value.instructed) {
      const plain = await speechClip(this.ports, { ...attempt, instruction: undefined });
      if (
        plain.ok &&
        spokeBeyondText(clip.value.verified.durationSeconds, plain.value.verified.durationSeconds)
      ) {
        clip = plain;
      }
    }
    const { verified, instructed } = clip.value;
    return ok({
      modelId,
      voiceId,
      // The honesty boundary: this says the direction was carried and not
      // read aloud, not that the model obeyed it.
      speechInstructionsApplied: instructed,
      mimeType: verified.declaredMimeType,
      byteLength: verified.bytes.byteLength,
      sample: new Blob([verified.bytes], { type: verified.declaredMimeType }),
    });
  }
}
