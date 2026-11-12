import { isTruncatedReply, type AiError, type AiErrorCode } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';

/**
 * Provider-failure copy, shared by every screen that can see one.
 *
 * It lives in `shared-ui` rather than inside Settings because Generate and the
 * reader need exactly the same table: one feature reaching into another's
 * internals for its wording is how two tables that must agree start drifting
 * apart.
 */

/**
 * Where a provider failure is being reported.
 *
 * The classification of a failure is the same everywhere — the same 429 is the
 * same 429 in Settings and mid-sentence — but the next step is not. The
 * settings panel has a Test button and nothing else; the reader has a retry for
 * the interrupted aid and no test at all. A surface is passed explicitly so a
 * new screen has to say which kind it is rather than inheriting wording written
 * for somewhere else.
 */
export type AiFailureSurface = 'settings-test' | 'reader';

/**
 * What the learner is told about one provider failure.
 *
 * Every failure is a title, one safety line and one next action for each
 * surface. Splitting those into fields rather than one sentence is what stops a
 * variant from quietly losing one of them.
 */
export interface AiErrorCopy {
  readonly heading: string;
  /** Always reassuring: a failed configuration test changes nothing stored. */
  readonly whatDidNot: string;
  /** Next step on the settings panel, where the control that repeats it is Test. */
  readonly primaryAction: string;
  /**
   * Next step where the interrupted task has its own retry control beside the
   * message, as every reader aid does. It never names the settings test, and it
   * never names a specific button, because the three reader surfaces label
   * theirs differently.
   */
  readonly retryAction: string;
}

/**
 * True for every variant: a test writes nothing until it passes, and no failure
 * here can reach readings, snapshots, or cached aids.
 */
export const NOTHING_CHANGED = 'Nothing was changed.';

const TRY_AGAIN = 'Try again.';
const TRY_AGAIN_SOON = 'Try again in a moment.';

/**
 * English for every provider failure.
 *
 * Exhaustive by type: adding a variant to `AiErrorCode` will not compile until
 * it has been given words here. Nothing in this table quotes the provider —
 * response bodies, prompts, and the API key never reach the screen.
 */
export const AI_ERROR_COPY: Record<AiErrorCode, AiErrorCopy> = {
  offline: {
    heading: 'Offline',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Reconnect, then try again.',
    retryAction: 'Reconnect, then try again.',
  },
  timeout: {
    heading: 'OpenRouter did not answer',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    retryAction: TRY_AGAIN,
  },
  cancelled: {
    // Not "Test cancelled": the same variant is reported mid-reading, where
    // there is no test to have cancelled.
    heading: 'Stopped',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    retryAction: TRY_AGAIN,
  },
  authentication: {
    heading: 'OpenRouter refused the key',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Check the key on openrouter.ai and save it again.',
    retryAction: 'Check the key on openrouter.ai and save it again in Settings.',
  },
  'credit-exhausted': {
    heading: 'Out of OpenRouter credit',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Add credit on openrouter.ai, then try again.',
    retryAction: 'Add credit on openrouter.ai, then try again.',
  },
  'model-not-found': {
    heading: 'Model not found',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Check the model ID in Settings.',
    retryAction: 'Check the model ID in Settings.',
  },
  'capability-unsupported': {
    heading: 'This model cannot be used',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a different model.',
    retryAction: 'Choose a different model in Settings.',
  },
  'rate-limited': {
    heading: 'Too many requests',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Wait a moment, then try again.',
    retryAction: 'Wait a moment, then try again.',
  },
  'provider-unavailable': {
    heading: 'OpenRouter could not be reached',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN_SOON,
    retryAction: TRY_AGAIN_SOON,
  },
  'malformed-response': {
    heading: 'The reply could not be used',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different model.',
    retryAction: 'Choose a different model in Settings.',
  },
  'context-budget-exceeded': {
    heading: 'Request too large for this model',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a model with a larger context.',
    retryAction: 'Choose a model with a larger context in Settings.',
  },
  'audio-invalid': {
    heading: 'Audio could not be played',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different audio model or voice.',
    retryAction: 'Choose a different audio model or voice in Settings.',
  },
  unknown: {
    heading: 'Something went wrong',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_AGAIN,
    retryAction: TRY_AGAIN,
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
  'model-discovery': 'looking up model capabilities',
  'text-model-test': 'testing your text model',
  'tts-test': 'testing your voice',
  'story-plots': 'drafting plots',
  'story-generation': 'writing your story',
  'story-repair': 'repairing your story',
  'exception-review': 'checking your exception policy',
  'grammar-review': 'reviewing the grammar',
  translation: 'translating this sentence',
  'tts-synthesis': 'reading this sentence aloud',
};

export function aiErrorCopy(error: AiError): AiErrorCopy {
  // The output ran out of room, not the input. The shared row's "the request
  // was too large" would send the learner to shorten something that was fine.
  if (isTruncatedReply(error)) {
    return {
      ...AI_ERROR_COPY['context-budget-exceeded'],
      heading: 'The reply was cut off',
      primaryAction: 'Try again, or choose a different model.',
      retryAction: 'Try again, or choose a different model.',
    };
  }
  if (
    error.code === 'capability-unsupported' &&
    (error.task === 'tts-test' || error.task === 'tts-synthesis')
  ) {
    return {
      ...AI_ERROR_COPY['capability-unsupported'],
      primaryAction: 'Check the voice ID in Settings.',
      retryAction: 'Check the voice ID in Settings.',
    };
  }
  return AI_ERROR_COPY[error.code];
}

export function aiTaskCopy(task: AiTask): string {
  return AI_TASK_COPY[task];
}

/** The one next step worth offering on this surface. */
export function aiErrorAction(error: AiError, surface: AiFailureSurface): string {
  const copy = aiErrorCopy(error);
  return surface === 'settings-test' ? copy.primaryAction : copy.retryAction;
}

/**
 * One provider failure as a single line, for surfaces that have room for a
 * sentence rather than a laid-out panel.
 *
 * What failed, what it interrupted, and what to do about it. The classification
 * is the shared table's, so the same status reads the same way on every screen;
 * only the action changes with the surface.
 */
export function aiFailureMessage(error: AiError, surface: AiFailureSurface): string {
  return `${aiErrorCopy(error).heading} while ${aiTaskCopy(error.task)}. ${aiErrorAction(error, surface)}`;
}
