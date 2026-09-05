import { aiError, type AiError, type AiErrorDetail } from '../../domain/ai/ai-error';
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
  { match: 'response_format', capability: 'structured-output' },
  { match: 'json_schema', capability: 'structured-output' },
  { match: 'structured output', capability: 'structured-output' },
  { match: 'speed', capability: 'speed' },
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

function providerMessage(envelope: ProviderErrorEnvelope | null): string {
  return envelope?.error.message?.toLowerCase() ?? '';
}

export function capabilityFrom(envelope: ProviderErrorEnvelope | null): string {
  const message = providerMessage(envelope);
  const param = envelope?.error.param?.toLowerCase() ?? '';
  const haystack = `${param} ${message}`;
  return (
    CAPABILITY_KEYWORDS.find((entry) => haystack.includes(entry.match))?.capability ?? 'request'
  );
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
 * and a 5xx means waiting.
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
    const capability = capabilityFrom(envelope);
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
