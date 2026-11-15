import type { AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { SpeechContext, SpeechPace, SpeechStyle } from '../../domain/ai/speech-instructions';
import { ok, type Result } from '../../domain/shared/result';
import type { AudioResponse, OpenRouterClient } from './openrouter-client';
import { AUDIO_REQUEST_TIMEOUT_MS, AUDIO_SPEECH_PATH } from './openrouter-endpoints';
import { buildSpeechRequestBody, type SpeechResponseFormat } from './speech-request';

/**
 * What each model refused earlier in this session.
 *
 * A refusal costs a round trip but no credit, so it is paid once per model and
 * remembered rather than encoded into a list of model families that would go
 * stale the next time OpenRouter adds one. The configuration test and synthesis
 * share one instance, so a test that learned it spares every sentence after it.
 */
export class SpeechRefusals {
  private readonly formats = new Map<string, SpeechResponseFormat>();
  private readonly withoutSpeed = new Set<string>();

  /** MP3 unless this model refused it, because MP3 is stored as it arrives. */
  formatFor(modelId: string): SpeechResponseFormat {
    return this.formats.get(modelId) ?? 'mp3';
  }

  rememberFormat(modelId: string, format: SpeechResponseFormat): void {
    this.formats.set(modelId, format);
  }

  acceptsSpeed(modelId: string): boolean {
    return !this.withoutSpeed.has(modelId);
  }

  rememberNoSpeed(modelId: string): void {
    this.withoutSpeed.add(modelId);
  }
}

export interface SpeechAttempt {
  readonly task: Extract<AiTask, 'tts-test' | 'tts-synthesis'>;
  readonly modelId: string;
  readonly voiceId: string;
  readonly text: string;
  readonly speechStyle: SpeechStyle;
  readonly speechPace: SpeechPace;
  /** Direction to try first, or `undefined` to send none. */
  readonly instruction: SpeechContext | undefined;
  readonly signal?: AbortSignal;
}

export interface SpeechReply {
  readonly response: AudioResponse;
  /** Whether the request that succeeded carried the direction. */
  readonly instructed: boolean;
}

/**
 * Sends one speech request, stepping down through what the provider refuses.
 *
 * Each optional part of the request — the format, the direction, a numeric
 * speed — is changed at most once, and only when the provider names it in a refusal,
 * so the loop ends after at most one attempt per part. Anything else the
 * provider refuses is returned as it came.
 */
export async function requestSpeech(
  client: OpenRouterClient,
  refusals: SpeechRefusals,
  attempt: SpeechAttempt,
): Promise<Result<SpeechReply, AiError>> {
  const { modelId } = attempt;
  let instructed = attempt.instruction !== undefined;
  let speed = !instructed && refusals.acceptsSpeed(modelId);
  let format = refusals.formatFor(modelId);
  let formatSwitched = false;

  for (;;) {
    const response = await client.postAudio({
      path: AUDIO_SPEECH_PATH,
      task: attempt.task,
      modelId: attempt.modelId,
      voiceId: attempt.voiceId,
      timeoutMs: AUDIO_REQUEST_TIMEOUT_MS,
      ...(attempt.signal === undefined ? {} : { signal: attempt.signal }),
      body: buildSpeechRequestBody({
        modelId: attempt.modelId,
        voiceId: attempt.voiceId,
        text: attempt.text,
        responseFormat: format,
        speechStyle: attempt.speechStyle,
        speechPace: attempt.speechPace,
        speed,
        instruction: instructed ? attempt.instruction : undefined,
      }),
    });
    if (response.ok) {
      return ok({ response: response.value, instructed });
    }
    if (response.error.code !== 'capability-unsupported') {
      return response;
    }
    const refused = response.error.detail?.capability;
    // A remembered format can be wrong once OpenRouter routes the model to
    // another provider, so a refusal switches either way — once.
    if (refused === 'audio-format' && !formatSwitched) {
      format = format === 'mp3' ? 'pcm' : 'mp3';
      formatSwitched = true;
      refusals.rememberFormat(modelId, format);
      continue;
    }
    if (refused === 'instructions' && instructed) {
      instructed = false;
      speed = refusals.acceptsSpeed(modelId);
      continue;
    }
    if (refused === 'speed' && speed) {
      speed = false;
      refusals.rememberNoSpeed(modelId);
      continue;
    }
    return response;
  }
}
