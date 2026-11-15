import type { AiError } from '../../domain/ai/ai-error';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import { ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import {
  checkSpokenLength,
  longestPlausibleSpeechSeconds,
  verifyAudio,
  type AudioContext,
  type VerifiedAudio,
} from './audio-verification';
import type { OpenRouterClient } from './openrouter-client';
import { normalizeProviderAudio } from './provider-audio';
import { requestSpeech, type SpeechAttempt, type SpeechRefusals } from './speech-attempts';

export interface SpeechClipPorts {
  readonly client: OpenRouterClient;
  readonly refusals: SpeechRefusals;
  readonly decoder: AudioDecoder;
  readonly encoder: SpeechEncoder;
}

export interface SpeechClip {
  readonly verified: VerifiedAudio;
  /** Whether the clip that was kept was made with the direction. */
  readonly instructed: boolean;
}

/**
 * One storable clip of `attempt.text`, from request to verified audio.
 *
 * The configuration test and synthesis both come through here, so a test can
 * only pass what synthesis would keep (ADR 0018).
 *
 * A provider can accept the direction and read it aloud, which nothing but the
 * clip's length reveals. A clip that carried the direction and runs far longer
 * than its text is asked for once more without it; a clip that is still too
 * long is refused rather than stored.
 */
export async function speechClip(
  ports: SpeechClipPorts,
  attempt: SpeechAttempt,
): Promise<Result<SpeechClip, AiError>> {
  let heard = await hear(ports, attempt);
  if (
    heard.ok &&
    heard.value.instructed &&
    heard.value.verified.durationSeconds > longestPlausibleSpeechSeconds(attempt.text)
  ) {
    heard = await hear(ports, { ...attempt, instruction: undefined });
  }
  if (!heard.ok) {
    return heard;
  }
  const checked = checkSpokenLength(heard.value.verified, attempt.text, contextOf(attempt));
  return checked.ok ? ok({ verified: checked.value, instructed: heard.value.instructed }) : checked;
}

function contextOf(attempt: SpeechAttempt): AudioContext {
  return { task: attempt.task, modelId: attempt.modelId, voiceId: attempt.voiceId };
}

async function hear(
  ports: SpeechClipPorts,
  attempt: SpeechAttempt,
): Promise<Result<SpeechClip, AiError>> {
  const reply = await requestSpeech(ports.client, ports.refusals, attempt);
  if (!reply.ok) {
    return reply;
  }
  const context = contextOf(attempt);
  const normalized = await normalizeProviderAudio(
    reply.value.response,
    ports.encoder,
    context,
    attempt.signal,
  );
  if (!normalized.ok) {
    return normalized;
  }
  const verified = await verifyAudio(normalized.value, ports.decoder, {
    ...context,
    origin: normalized.value.mimeType === 'audio/webm' ? 'encoder' : 'provider',
  });
  return verified.ok
    ? ok({ verified: verified.value, instructed: reply.value.instructed })
    : verified;
}
