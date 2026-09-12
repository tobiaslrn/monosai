import type { AiError } from '../../domain/ai/ai-error';
import type { AudioPayload, TtsRequest } from '../../domain/ai/text-to-speech-provider';
import { isGeminiTtsModel, resolveTtsVoice } from '../../domain/ai/tts-configuration';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import { verifyAudio } from './audio-verification';
import type { AudioResponse, OpenRouterClient } from './openrouter-client';
import { AUDIO_REQUEST_TIMEOUT_MS, AUDIO_SPEECH_PATH } from './openrouter-endpoints';
import { geminiPcmToWav } from './pcm-audio';
import { buildSpeechRequestBody } from './speech-request';

const TASK = 'tts-synthesis';

/**
 * Synthesizes one sentence.
 *
 * The same request shape, the same capability fallback, and the same
 * verification as the configuration test, because a clip produced here has to
 * be exactly what that test proved the provider can produce. Both bodies come
 * out of `buildSpeechRequestBody`, so the two can no longer drift (ADR 0018).
 *
 * Which channels are asked for comes from what the test measured and the
 * settings stored, never from the model catalog: synthesis has to work with no
 * network beyond the provider itself.
 *
 * Retry, timeouts, size limits, and error mapping belong to the client and are
 * not repeated here.
 */
export class OpenRouterTtsSynthesizer {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly decoder: AudioDecoder,
  ) {}

  async synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>> {
    const resolved = { ...input, voiceId: resolveTtsVoice(input.modelId, input.voiceId) };
    let instructed = resolved.speechInstructions === 'supported';

    // A provider that advertised instructions but rejects them degrades to
    // exact-text synthesis, never failure.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.request(resolved, instructed, signal);
      if (response.ok) {
        return this.verify(response.value, resolved, instructed);
      }
      const refused = response.error.detail?.capability;
      if (response.error.code !== 'capability-unsupported') {
        return err(response.error);
      }
      if (refused === 'instructions' && instructed) {
        instructed = false;
        continue;
      }
      return err(response.error);
    }
    throw new Error('Unreachable TTS capability fallback state.');
  }

  private request(
    input: TtsRequest,
    instructed: boolean,
    signal: AbortSignal,
  ): Promise<Result<AudioResponse, AiError>> {
    return this.client.postAudio({
      path: AUDIO_SPEECH_PATH,
      task: TASK,
      modelId: input.modelId,
      voiceId: input.voiceId,
      timeoutMs: AUDIO_REQUEST_TIMEOUT_MS,
      signal,
      body: buildSpeechRequestBody({
        modelId: input.modelId,
        voiceId: input.voiceId,
        text: input.text,
        responseFormat: input.responseFormat,
        speechStyle: input.speechStyle,
        instruction: instructed
          ? {
              ...(input.beforeJa === undefined ? {} : { beforeJa: input.beforeJa }),
              ...(input.afterJa === undefined ? {} : { afterJa: input.afterJa }),
              style: input.speechStyle,
            }
          : undefined,
      }),
    });
  }

  private async verify(
    response: AudioResponse,
    input: TtsRequest,
    /**
     * The direction was carried, not necessarily obeyed: for Gemini it sat in
     * the prompt, elsewhere the field was not refused. Both are statements
     * about the request.
     */
    speechInstructionsApplied: boolean,
  ): Promise<Result<AudioPayload, AiError>> {
    const normalized = isGeminiTtsModel(input.modelId) ? geminiPcmToWav(response) : response;
    const verified = await verifyAudio(normalized, this.decoder, {
      task: TASK,
      modelId: input.modelId,
      voiceId: input.voiceId,
    });
    return verified.ok
      ? ok({
          bytes: verified.value.bytes,
          mimeType: verified.value.mimeType,
          speechInstructionsApplied,
        })
      : verified;
  }
}
