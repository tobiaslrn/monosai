import type { DomainErrorBase } from '../shared/errors';
import type { AiTask } from './ai-task';

/**
 * Every failure an AI provider request can report.
 *
 * The variants are the ones named in the AI specification and the UI must
 * preserve every distinction they make: "your key is wrong", "that model does
 * not exist", and "the provider is having a bad day" need three different next
 * actions, and collapsing them would leave the learner guessing which of their
 * settings to change.
 */
export type AiErrorCode =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'authentication'
  | 'model-not-found'
  | 'capability-unsupported'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'malformed-response'
  | 'context-budget-exceeded'
  | 'audio-invalid'
  | 'unknown';

/**
 * The same variants as a value.
 *
 * The UI has to give every one of them its own wording, and only a runtime list
 * lets a test prove none was forgotten.
 */
export const ALL_AI_ERROR_CODES: readonly AiErrorCode[] = [
  'offline',
  'timeout',
  'cancelled',
  'authentication',
  'model-not-found',
  'capability-unsupported',
  'rate-limited',
  'provider-unavailable',
  'malformed-response',
  'context-budget-exceeded',
  'audio-invalid',
  'unknown',
];

/**
 * Structured facts a variant may carry, kept separate from `message` so the UI
 * can compose its own copy.
 *
 * Everything here is either a value the learner typed or a number the provider
 * reported. Response bodies, prompts, and the API key never appear: a field
 * that could hold provider content would eventually hold it.
 */
export interface AiErrorDetail {
  /** The exact model ID that was requested, echoed back for the error copy. */
  readonly modelId?: string;
  readonly voiceId?: string;
  /** Name of the provider capability that was missing, e.g. `structured-output`. */
  readonly capability?: string;
  readonly retryAfterMs?: number;
  readonly status?: number;
  /** Stable schema/validation issue identifier, never the offending content. */
  readonly issueCode?: string;
  /** Correlates a user-visible technical code with a development-only log line. */
  readonly correlationId?: string;
}

export type AiError = DomainErrorBase<'ai', AiErrorCode> & {
  readonly task: AiTask;
  readonly detail?: AiErrorDetail;
};

export interface AiErrorOptions {
  /** Redacted description of an underlying cause, for diagnostics only. */
  readonly cause?: string;
  readonly detail?: AiErrorDetail;
}

export function aiError(
  code: AiErrorCode,
  task: AiTask,
  message: string,
  options: AiErrorOptions = {},
): AiError {
  return {
    domain: 'ai',
    code,
    task,
    message,
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
  };
}

/**
 * Codes where repeating the identical request can plausibly succeed without
 * anything the learner controls changing.
 *
 * The AI specification limits automatic retries to rate limits, provider
 * outages, and network interruption. Authentication, unknown models, missing
 * capabilities, and schema failures are excluded on purpose: retrying them
 * spends money to reproduce the same answer. `unknown` is excluded because an
 * unclassified failure is exactly the case where a retry loop is least safe.
 */
const AUTOMATICALLY_RETRYABLE: readonly AiErrorCode[] = [
  'rate-limited',
  'provider-unavailable',
  'timeout',
];

export function isAutomaticallyRetryable(error: AiError): boolean {
  return AUTOMATICALLY_RETRYABLE.includes(error.code);
}
