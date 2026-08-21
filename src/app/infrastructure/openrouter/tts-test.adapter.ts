import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import { verifyAudio } from './audio-verification';
import type { AudioResponse, OpenRouterClient } from './openrouter-client';
import { AUDIO_REQUEST_TIMEOUT_MS, AUDIO_SPEECH_PATH } from './openrouter-endpoints';

const TASK = 'tts-test';

/**
 * The fixed phrase every TTS test synthesizes.
 *
 * A constant sentence keeps results comparable between attempts and keeps the
 * test from spending on anything longer than it needs. It is ordinary Japanese
 * so an unsupported-language failure surfaces here rather than mid-reading.
 */
export const TTS_TEST_PHRASE = 'これはテストです。';

/** MP3 is requested because it is the format the audio cache stores. */
const REQUESTED_FORMAT = 'mp3';

/**
 * Verifies one exact TTS model, voice, and speed against the provider.
 *
 * Failure here says nothing about the text model: the two configurations are
 * tested, stored, and reported separately, and TTS never blocks reading or
 * generation. At most two requests are made — the configured one, and one
 * without `speed` if the provider refuses that parameter — so an unsupported
 * option is reported rather than silently pretended.
 *
 * What counts as storable audio lives in `audio-verification.ts`, shared with
 * synthesis, so a passing test can never accept a clip synthesis would refuse.
 */
export class OpenRouterTtsTester {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly decoder: AudioDecoder,
  ) {}

  async testConfiguration(
    config: TtsConfig,
    signal?: AbortSignal,
  ): Promise<Result<TtsTest, AiError>> {
    const modelId = config.modelId.trim();
    const voiceId = config.voiceId.trim();
    if (modelId === '') {
      return err(aiError('model-not-found', TASK, 'No TTS model ID was given.'));
    }
    if (voiceId === '') {
      return err(
        aiError('capability-unsupported', TASK, 'No voice ID was given.', {
          detail: { modelId, capability: 'voice' },
        }),
      );
    }

    const withSpeed = await this.synthesize(modelId, voiceId, config.speed, signal);
    if (withSpeed.ok) {
      return this.verify(withSpeed.value, modelId, voiceId, true);
    }

    const speedRefused =
      withSpeed.error.code === 'capability-unsupported' &&
      withSpeed.error.detail?.capability === 'speed';
    if (!speedRefused) {
      return err(withSpeed.error);
    }

    const withoutSpeed = await this.synthesize(modelId, voiceId, undefined, signal);
    if (!withoutSpeed.ok) {
      return err(withoutSpeed.error);
    }
    return this.verify(withoutSpeed.value, modelId, voiceId, false);
  }

  private synthesize(
    modelId: string,
    voiceId: string,
    speed: number | undefined,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AiError>> {
    return this.client.postAudio({
      path: AUDIO_SPEECH_PATH,
      task: TASK,
      modelId,
      voiceId,
      timeoutMs: AUDIO_REQUEST_TIMEOUT_MS,
      ...(signal === undefined ? {} : { signal }),
      body: {
        model: modelId,
        voice: voiceId,
        input: TTS_TEST_PHRASE,
        response_format: REQUESTED_FORMAT,
        ...(speed === undefined ? {} : { speed }),
      },
    });
  }

  private async verify(
    response: AudioResponse,
    modelId: string,
    voiceId: string,
    speedApplied: boolean,
  ): Promise<Result<TtsTest, AiError>> {
    const verified = await verifyAudio(response, this.decoder, { task: TASK, modelId, voiceId });
    if (!verified.ok) {
      return verified;
    }

    return ok({
      modelId,
      voiceId,
      speedApplied,
      mimeType: verified.value.declaredMimeType,
      byteLength: verified.value.bytes.byteLength,
      sample: new Blob([verified.value.bytes], { type: verified.value.declaredMimeType }),
    });
  }
}
