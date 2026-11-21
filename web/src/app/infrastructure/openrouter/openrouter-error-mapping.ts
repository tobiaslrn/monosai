import {
  aiError,
  MODERATION_CAPABILITY,
  type AiError,
  type AiErrorDetail,
} from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { ProviderErrorEnvelope } from './openrouter-response.schema';

/**
 * What the caller was asking for, so a status can be attributed to the setting
 * the learner would have to change.
 */
export interface RequestContext {
  readonly task: AiTask;
  readonly modelId?: string;
  readonly voiceId?: string;
}

/**
 * Provider wording that identifies which part of the request was refused.
 *
 * The message is read only to choose a code and a capability name; it is never
 * stored or shown. Matching is substring-based because OpenAI-compatible
 * providers agree on the vocabulary but not on the sentence.
 */
const CAPABILITY_KEYWORDS: readonly { readonly match: string; readonly capability: string }[] = [
  { match: 'instructions', capability: 'instructions' },
  { match: 'speed', capability: 'speed' },
  { match: 'response_format', capability: 'structured-output' },
  { match: 'json_schema', capability: 'structured-output' },
  { match: 'structured output', capability: 'structured-output' },
  { match: 'voice', capability: 'voice' },
  { match: 'response format', capability: 'audio-format' },
  { match: 'audio', capability: 'audio' },
];

/** Provider wording that means the exact model ID does not exist or is not reachable. */
const MODEL_KEYWORDS: readonly string[] = [
  'no endpoints found',
  'not a valid model',
  'model not found',
  'unknown model',
  'invalid model',
];

/**
 * Provider wording that means the request was longer than the model's context.
 *
 * Providers answer an oversized prompt with a plain 400 rather than a 413, and
 * that is not a capability the model lacks: a smaller request to the same model
 * succeeds, and a different request shape would be refused just the same.
 */
const CONTEXT_LENGTH_KEYWORDS: readonly string[] = [
  'context length',
  'context_length',
  'context window',
  'prompt is too long',
];

function providerMessage(envelope: ProviderErrorEnvelope | null): string {
  return envelope?.error.message?.toLowerCase() ?? '';
}

/**
 * What a speech refusal names, read before the general keywords.
 *
 * In a speech request `response_format` is the audio container, not structured
 * output, and refusals mention more than the part they refuse: "HeyGen Voice
 * only supports response_format …" refuses the format, not the voice, and
 * "speed is not supported for response_format pcm" refuses the speed. So an
 * exact `param` decides first, then the two optional parts by name, and only
 * then the format.
 */
const SPEECH_PARAMETERS: Readonly<Record<string, string>> = {
  response_format: 'audio-format',
  format: 'audio-format',
  instructions: 'instructions',
  speed: 'speed',
  voice: 'voice',
};

const SPEECH_TASKS: readonly AiTask[] = ['tts-test', 'tts-synthesis'];

function speechCapabilityFrom(param: string, message: string): string | undefined {
  const named = SPEECH_PARAMETERS[param];
  if (named !== undefined) return named;
  if (message.includes('instructions')) return 'instructions';
  if (message.includes('speed')) return 'speed';
  if (
    message.includes('response_format') ||
    message.includes('response format') ||
    (/\bformat\b/u.test(message) && /\b(?:mp3|pcm)\b/u.test(message))
  ) {
    return 'audio-format';
  }
  return undefined;
}

export function capabilityFrom(envelope: ProviderErrorEnvelope | null, task?: AiTask): string {
  const message = providerMessage(envelope);
  const param = envelope?.error.param?.toLowerCase() ?? '';
  if (task !== undefined && SPEECH_TASKS.includes(task)) {
    const speech = speechCapabilityFrom(param, message);
    if (speech !== undefined) return speech;
  }
  const haystack = `${param} ${message}`;
  return (
    CAPABILITY_KEYWORDS.find((entry) => haystack.includes(entry.match))?.capability ?? 'request'
  );
}

function mentionsContextLength(envelope: ProviderErrorEnvelope | null): boolean {
  const message = providerMessage(envelope);
  const code = envelope?.error.code;
  return (
    (typeof code === 'string' && code.toLowerCase().includes('context_length')) ||
    CONTEXT_LENGTH_KEYWORDS.some((keyword) => message.includes(keyword))
  );
}

/**
 * Whether a 403 is a moderation refusal rather than a refused key.
 *
 * OpenRouter answers 403 when a model that requires moderation flags the input,
 * and says so with `reasons` or `flagged_input` in the error metadata. The key
 * worked; telling the learner to fix it sends them to the one setting that
 * cannot help.
 */
function flaggedByModeration(envelope: ProviderErrorEnvelope | null): boolean {
  const metadata = envelope?.error.metadata;
  if (typeof metadata === 'object' && metadata !== null) {
    if ('reasons' in metadata || 'flagged_input' in metadata) return true;
  }
  const message = providerMessage(envelope);
  return message.includes('moderation') || message.includes('flagged');
}

function mentionsMissingModel(envelope: ProviderErrorEnvelope | null): boolean {
  const message = providerMessage(envelope);
  return MODEL_KEYWORDS.some((keyword) => message.includes(keyword));
}

/**
 * Reads `Retry-After` in either permitted form.
 *
 * Returns undefined rather than guessing when the header is absent or
 * unparsable, because a fabricated wait is worse than none: the caller's own
 * capped backoff already bounds the delay.
 */
export function parseRetryAfterMs(header: string | null, now: number): number | undefined {
  if (header === null || header.trim() === '') {
    return undefined;
  }
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) {
    return seconds <= 0 ? 0 : Math.round(seconds * 1000);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, date - now);
}

function detailOf(context: RequestContext, extra: AiErrorDetail): AiErrorDetail {
  return {
    ...(context.modelId === undefined ? {} : { modelId: context.modelId }),
    ...(context.voiceId === undefined ? {} : { voiceId: context.voiceId }),
    ...extra,
  };
}

/**
 * Turns an HTTP status into the variant whose recovery text is actually
 * actionable.
 *
 * The distinctions matter: a 401 means the key, a 402 means the balance, a 404
 * means the model ID, a 400 means the request shape this model cannot honour,
 * and a 408 or a 5xx means waiting.
 * Collapsing them into one "request failed" would make the settings screen
 * useless.
 */
export function mapHttpStatus(
  status: number,
  context: RequestContext,
  envelope: ProviderErrorEnvelope | null,
  retryAfterMs: number | undefined,
  correlationId: string,
): AiError {
  const { task } = context;

  if (status === 403 && flaggedByModeration(envelope)) {
    return aiError(
      'capability-unsupported',
      task,
      'The model refused the text after a moderation check.',
      {
        cause: 'HTTP 403',
        detail: detailOf(context, { status, capability: MODERATION_CAPABILITY }),
      },
    );
  }
  if (status === 401 || status === 403) {
    return aiError('authentication', task, 'The provider rejected the saved key.', {
      cause: `HTTP ${String(status)}`,
      detail: detailOf(context, { status }),
    });
  }
  if (status === 402) {
    // Credit exhaustion has its own variant because its only remedy is adding
    // credit: telling the learner to re-check a key that is working sends them
    // to the one place that cannot help. See ADR 0018.
    return aiError('credit-exhausted', task, 'The account has no remaining credit.', {
      cause: 'HTTP 402',
      detail: detailOf(context, { status }),
    });
  }
  if (status === 404) {
    return aiError('model-not-found', task, 'The provider does not offer that exact model.', {
      cause: 'HTTP 404',
      detail: detailOf(context, { status }),
    });
  }
  if (status === 408) {
    // The provider gave up waiting, which is a timeout like the client's own:
    // the same request can succeed, so it is retried rather than read as a
    // request shape the model cannot honour.
    return aiError('timeout', task, 'The provider did not answer in time.', {
      cause: 'HTTP 408',
      detail: detailOf(context, { status }),
    });
  }
  if (status === 413) {
    return aiError(
      'context-budget-exceeded',
      task,
      'The request was larger than the model accepts.',
      {
        cause: 'HTTP 413',
        detail: detailOf(context, { status }),
      },
    );
  }
  if (status === 429) {
    return aiError('rate-limited', task, 'The provider is rate limiting this key.', {
      cause: 'HTTP 429',
      detail: detailOf(context, {
        status,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      }),
    });
  }
  if (status >= 500) {
    return aiError('provider-unavailable', task, 'The provider could not answer right now.', {
      cause: `HTTP ${String(status)}`,
      detail: detailOf(context, { status }),
    });
  }
  if (status >= 400) {
    if (mentionsMissingModel(envelope)) {
      return aiError('model-not-found', task, 'The provider does not offer that exact model.', {
        cause: `HTTP ${String(status)}`,
        detail: detailOf(context, { status }),
      });
    }
    if (mentionsContextLength(envelope)) {
      return aiError(
        'context-budget-exceeded',
        task,
        'The request was larger than the model accepts.',
        {
          cause: `HTTP ${String(status)}`,
          detail: detailOf(context, { status }),
        },
      );
    }
    const capability = capabilityFrom(envelope, task);
    return aiError(
      'capability-unsupported',
      task,
      'This model cannot handle a request Monosai needs to make.',
      {
        cause: `HTTP ${String(status)}`,
        detail: detailOf(context, { status, capability }),
      },
    );
  }
  return aiError('unknown', task, 'The provider returned an unexpected response.', {
    cause: `HTTP ${String(status)}`,
    detail: detailOf(context, { status, correlationId }),
  });
}
