import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import type { SpeechContext } from '../../domain/ai/speech-instructions';
import { isGeminiTtsModel, resolveTtsVoice } from '../../domain/ai/tts-configuration';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import { verifyAudio } from './audio-verification';
import type { AudioResponse, OpenRouterClient } from './openrouter-client';
import { AUDIO_REQUEST_TIMEOUT_MS, AUDIO_SPEECH_PATH } from './openrouter-endpoints';
import { geminiPcmToWav } from './pcm-audio';
import { buildSpeechRequestBody } from './speech-request';

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
 * generation.
 *
 * The catalog leads and this test confirms: `config.attempt` says which
 * optional channels to try, and a provider refusal corrects a wrong
 * declaration. At most three requests are made — the declared one, and one
 * fewer channel per refusal — so an unsupported option is measured rather than
 * silently pretended.
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
    const voiceId = resolveTtsVoice(modelId, config.voiceId);
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

    let speed = config.attempt.speed ? config.speed : undefined;
    let instructed = config.attempt.instructions;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.synthesize(
        modelId,
        voiceId,
        speed,
        // The test phrase has no neighbours, so the direction carries only the
        // pace — the one channel a model without numeric `speed` has.
        instructed ? { speed: config.speed } : undefined,
        signal,
      );
      if (response.ok) {
        return this.verify(response.value, modelId, voiceId, speed !== undefined, instructed);
      }
      const refused = response.error.detail?.capability;
      if (response.error.code !== 'capability-unsupported') {
        return err(response.error);
      }
      if (refused === 'instructions' && instructed) {
        instructed = false;
        continue;
      }
      if (refused === 'speed' && speed !== undefined) {
        speed = undefined;
        continue;
      }
      return err(response.error);
    }
    throw new Error('Unreachable TTS test capability fallback state.');
  }

  private synthesize(
    modelId: string,
    voiceId: string,
    speed: number | undefined,
    instruction: SpeechContext | undefined,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AiError>> {
    return this.client.postAudio({
      path: AUDIO_SPEECH_PATH,
      task: TASK,
      modelId,
      voiceId,
      timeoutMs: AUDIO_REQUEST_TIMEOUT_MS,
      ...(signal === undefined ? {} : { signal }),
      body: buildSpeechRequestBody({
        modelId,
        voiceId,
        text: TTS_TEST_PHRASE,
        responseFormat: REQUESTED_FORMAT,
        speed,
        instruction,
      }),
    });
  }

  private async verify(
    response: AudioResponse,
    modelId: string,
    voiceId: string,
    speedApplied: boolean,
    /**
     * The honesty boundary: this says the direction was carried and the request
     * came back, not that the model obeyed it. For Gemini it means the prefix
     * was in the prompt; elsewhere it means the field was not refused.
     */
    speechInstructionsApplied: boolean,
  ): Promise<Result<TtsTest, AiError>> {
    const normalized = isGeminiTtsModel(modelId) ? geminiPcmToWav(response) : response;
    const verified = await verifyAudio(normalized, this.decoder, { task: TASK, modelId, voiceId });
    if (!verified.ok) {
      return verified;
    }

    return ok({
      modelId,
      voiceId,
      speedApplied,
      speechInstructionsApplied,
      mimeType: verified.value.declaredMimeType,
      byteLength: verified.value.bytes.byteLength,
      sample: new Blob([verified.value.bytes], { type: verified.value.declaredMimeType }),
    });
  }
}
