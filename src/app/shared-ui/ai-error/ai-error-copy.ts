import type { AiError, AiErrorCode } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';

/**
 * Provider-failure copy, shared by every screen that can see one.
 *
 * It lives in `shared-ui` rather than inside Settings because Generate needs
 * exactly the same table: one feature reaching into another's internals for its
 * wording is how two tables that must agree start drifting apart.
 */

/**
 * What the learner is told about one provider failure.
 *
 * Every failure has to say what failed, what did not fail, whether anything was
 * saved, a primary next action, and a way out. Splitting those into fields
 * rather than one sentence is what stops a variant from quietly losing one of
 * them.
 */
export interface AiErrorCopy {
  readonly heading: string;
  readonly whatFailed: string;
  /** Always reassuring: a failed configuration test changes nothing stored. */
  readonly whatDidNot: string;
  readonly primaryAction: string;
  readonly escape: string;
}

/**
 * True for every variant: a test writes nothing until it passes, and no failure
 * here can reach readings, snapshots, or cached aids.
 */
export const NOTHING_CHANGED =
  'Nothing was changed. Your readings, vocabulary, and saved aids are untouched.';

const READ_WITHOUT_IT = 'Reading, importing, and your vocabulary work without this.';
const TRY_AGAIN = 'Try the test again in a moment.';

/**
 * English for all twelve provider failures.
 *
 * Exhaustive by type: adding a variant to `AiErrorCode` will not compile until
 * it has been given words here. Nothing in this table quotes the provider —
 * response bodies never reach the screen.
 */
export const AI_ERROR_COPY: Record<AiErrorCode, AiErrorCopy> = {
  offline: {
    heading: 'This device is offline',
    whatFailed: 'Monosai could not reach OpenRouter because there is no connection.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Reconnect, then run the test again.',
    escape: READ_WITHOUT_IT,
  },
  timeout: {
    heading: 'OpenRouter did not answer in time',
    whatFailed: 'The request was given up on before a reply arrived.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    escape: 'A slower model may need a second attempt.',
  },
  cancelled: {
    heading: 'Test cancelled',
    whatFailed: 'The test was stopped before it finished.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Run the test again when you are ready.',
    escape: READ_WITHOUT_IT,
  },
  authentication: {
    heading: 'OpenRouter refused the key',
    whatFailed: 'The saved key was rejected, or the account has no remaining credit.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Check the key on openrouter.ai, then save it again here.',
    escape: READ_WITHOUT_IT,
  },
  'model-not-found': {
    heading: 'That model was not found',
    whatFailed: 'OpenRouter does not offer a model with that exact ID.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Copy the exact model ID from the OpenRouter models page and test again.',
    escape: 'Model IDs are case sensitive and usually look like vendor/model-name.',
  },
  'capability-unsupported': {
    heading: 'This model cannot do what Monosai needs',
    whatFailed: 'The model refused part of the request Monosai has to make.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a different model or voice and test again.',
    escape: 'Ordinary chat working is not enough; generation needs exact structured replies.',
  },
  'rate-limited': {
    heading: 'OpenRouter is rate limiting this key',
    whatFailed: 'Too many requests reached the provider in a short time.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Wait a moment, then run the test again.',
    escape: READ_WITHOUT_IT,
  },
  'provider-unavailable': {
    heading: 'OpenRouter could not be reached',
    whatFailed: 'The provider did not answer, or answered with an error of its own.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    escape: READ_WITHOUT_IT,
  },
  'malformed-response': {
    heading: 'The reply could not be used',
    whatFailed: 'The model answered, but not in the exact shape Monosai requires.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different model and test again.',
    escape: 'A model that fails this cannot be used for generation.',
  },
  'context-budget-exceeded': {
    heading: 'The request was too large for this model',
    whatFailed: 'The model accepts less input than the request needed.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a model with a larger context and test again.',
    escape: READ_WITHOUT_IT,
  },
  'audio-invalid': {
    heading: 'The audio could not be played',
    whatFailed: 'The clip that came back was empty, in an unsupported format, or undecodable.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different TTS model or voice.',
    escape: 'Text-to-speech is optional and never blocks reading or generation.',
  },
  unknown: {
    heading: 'Something unexpected went wrong',
    whatFailed: 'The request failed in a way Monosai could not classify.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    escape: READ_WITHOUT_IT,
  },
};

/**
 * What was being attempted, in the learner's words.
 *
 * The failure table says what went wrong; this says what it went wrong during.
 * They are separate because the same rate limit needs the same explanation
 * whether it interrupted a configuration test or a repair, while "the test" and
 * "the repair" are not interchangeable words.
 *
 * Exhaustive by type: adding a task to `AiTask` will not compile until it has
 * been given words here.
 */
export const AI_TASK_COPY: Record<AiTask, string> = {
  'text-model-test': 'testing your text model',
  'tts-test': 'testing your voice',
  'story-generation': 'writing your story',
  'story-repair': 'repairing your story',
  'exception-review': 'checking your exception policy',
  'grammar-review': 'reviewing the grammar',
  translation: 'translating this sentence',
};

export function aiErrorCopy(error: AiError): AiErrorCopy {
  return AI_ERROR_COPY[error.code];
}

export function aiTaskCopy(task: AiTask): string {
  return AI_TASK_COPY[task];
}
