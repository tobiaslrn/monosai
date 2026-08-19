import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import type { TextToSpeechProvider } from '../../domain/ai/text-to-speech-provider';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
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

const ACCEPTED_MIME_TYPES: readonly string[] = ['audio/mpeg', 'audio/mp3'];

/**
 * Verifies one exact TTS model, voice, and speed against the provider.
 *
 * Failure here says nothing about the text model: the two configurations are
 * tested, stored, and reported separately, and TTS never blocks reading or
 * generation. At most two requests are made — the configured one, and one
 * without `speed` if the provider refuses that parameter — so an unsupported
 * option is reported rather than silently pretended.
 */
export class OpenRouterTtsTester implements TextToSpeechProvider {
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
    const mimeType = response.mimeType.split(';')[0]?.trim() ?? '';
    if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
      return err(
        aiError('audio-invalid', TASK, 'The provider returned audio Monosai cannot store.', {
          detail: { modelId, voiceId, issueCode: 'unsupported-mime' },
        }),
      );
    }
    if (!(await this.decoder.canDecode(response.bytes, mimeType))) {
      return err(
        aiError('audio-invalid', TASK, 'The returned clip could not be decoded for playback.', {
          detail: { modelId, voiceId, issueCode: 'undecodable' },
        }),
      );
    }

    return ok({
      modelId,
      voiceId,
      speedApplied,
      mimeType,
      byteLength: response.bytes.byteLength,
      sample: new Blob([response.bytes], { type: mimeType }),
    });
  }
}
