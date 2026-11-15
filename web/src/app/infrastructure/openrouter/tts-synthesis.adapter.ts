import type { AiError } from '../../domain/ai/ai-error';
import type { AudioPayload, TtsRequest } from '../../domain/ai/text-to-speech-provider';
import { resolveTtsVoice } from '../../domain/ai/tts-configuration';
import { ok, type Result } from '../../domain/shared/result';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import type { AudioDecoder } from './audio-decode';
import type { OpenRouterClient } from './openrouter-client';
import { SpeechRefusals } from './speech-attempts';
import { speechClip, type SpeechClipPorts } from './speech-clip';

const TASK = 'tts-synthesis';

/**
 * Synthesizes one sentence.
 *
 * The same request, refusal fallback, and verification as the configuration
 * test, because a clip produced here has to be exactly what that test proved
 * the provider can produce. Both go through `speechClip`, so the two cannot
 * drift (ADR 0018).
 *
 * Whether the direction is sent comes from what the test measured and the
 * settings stored, never from the model catalog: synthesis has to work with no
 * network beyond the provider itself.
 *
 * Retry, timeouts, size limits, and error mapping belong to the client and are
 * not repeated here.
 */
export class OpenRouterTtsSynthesizer {
  private readonly ports: SpeechClipPorts;

  constructor(
    client: OpenRouterClient,
    decoder: AudioDecoder,
    encoder: SpeechEncoder,
    refusals: SpeechRefusals = new SpeechRefusals(),
  ) {
    this.ports = { client, decoder, encoder, refusals };
  }

  async synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>> {
    const clip = await speechClip(this.ports, {
      task: TASK,
      modelId: input.modelId,
      voiceId: resolveTtsVoice(input.modelId, input.voiceId),
      text: input.text,
      speechStyle: input.speechStyle,
      speechPace: input.speechPace,
      instruction:
        input.speechInstructions === 'supported'
          ? {
              ...(input.beforeJa === undefined ? {} : { beforeJa: input.beforeJa }),
              ...(input.afterJa === undefined ? {} : { afterJa: input.afterJa }),
              style: input.speechStyle,
            }
          : undefined,
      signal,
    });
    return clip.ok
      ? ok({
          bytes: clip.value.verified.bytes,
          mimeType: clip.value.verified.mimeType,
          // The direction was carried, not necessarily obeyed.
          speechInstructionsApplied: clip.value.instructed,
        })
      : clip;
  }
}
