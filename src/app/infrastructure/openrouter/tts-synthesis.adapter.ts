import type { AiError } from '../../domain/ai/ai-error';
import type { AudioPayload, TtsRequest } from '../../domain/ai/text-to-speech-provider';
import { buildSpeechInstructions } from '../../domain/ai/speech-instructions';
import {
  isGeminiTtsModel,
  resolveTtsVoice,
  supportsTtsSpeed,
} from '../../domain/ai/tts-configuration';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import { verifyAudio } from './audio-verification';
import type { AudioResponse, OpenRouterClient } from './openrouter-client';
import { AUDIO_REQUEST_TIMEOUT_MS, AUDIO_SPEECH_PATH } from './openrouter-endpoints';
import { geminiPcmToWav } from './pcm-audio';

const TASK = 'tts-synthesis';

/**
 * Synthesizes one sentence.
 *
 * The same request shape, the same speed fallback, and the same verification as
 * the configuration test, because a clip produced here has to be exactly what
 * that test proved the provider can produce. At most two requests are made per
 * sentence — the configured one, and one without `speed` if the provider
 * refuses that parameter (ADR 0018) — and a refused speed is reported through
 * `speedApplied` rather than pretended.
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
    let speed = supportsTtsSpeed(resolved.modelId) ? resolved.speed : undefined;
    let instructions =
      resolved.speechInstructions === 'supported'
        ? buildSpeechInstructions({ beforeJa: resolved.beforeJa, afterJa: resolved.afterJa })
        : undefined;

    // One retry per optional capability. A provider that advertised either
    // parameter but rejects it degrades to exact-text synthesis, never failure.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request(resolved, speed, instructions, signal);
      if (response.ok) {
        return this.verify(
          response.value,
          resolved,
          speed !== undefined,
          instructions !== undefined,
        );
      }
      const refused = response.error.detail?.capability;
      if (response.error.code !== 'capability-unsupported') {
        return err(response.error);
      }
      if (refused === 'instructions' && instructions !== undefined) {
        instructions = undefined;
        continue;
      }
      if (refused === 'speed' && speed !== undefined) {
        speed = undefined;
        continue;
      }
      return err(response.error);
    }
    throw new Error('Unreachable TTS capability fallback state.');
  }

  private request(
    input: TtsRequest,
    speed: number | undefined,
    instructions: string | undefined,
    signal: AbortSignal,
  ): Promise<Result<AudioResponse, AiError>> {
    return this.client.postAudio({
      path: AUDIO_SPEECH_PATH,
      task: TASK,
      modelId: input.modelId,
      voiceId: input.voiceId,
      timeoutMs: AUDIO_REQUEST_TIMEOUT_MS,
      signal,
      body: {
        model: input.modelId,
        voice: input.voiceId,
        input: input.text,
        response_format: isGeminiTtsModel(input.modelId) ? 'pcm' : input.responseFormat,
        ...(speed === undefined ? {} : { speed }),
        ...(instructions === undefined ? {} : { instructions }),
      },
    });
  }

  private async verify(
    response: AudioResponse,
    input: TtsRequest,
    speedApplied: boolean,
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
          speedApplied,
          speechInstructionsApplied,
        })
      : verified;
  }
}
