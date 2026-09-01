import type { AiError, AiErrorCode } from '../../domain/ai/ai-error';
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
 * Every failure has to say what failed, what did not fail, whether anything was
 * saved, a next action for each surface, and a way out. Splitting those into
 * fields rather than one sentence is what stops a variant from quietly losing
 * one of them.
 */
export interface AiErrorCopy {
  readonly heading: string;
  readonly whatFailed: string;
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
  readonly escape: string;
}

/**
 * True for every variant: a test writes nothing until it passes, and no failure
 * here can reach readings, snapshots, or cached aids.
 */
export const NOTHING_CHANGED =
  'Nothing was changed. Your readings, vocabulary, and saved aids are untouched.';

const READ_WITHOUT_IT = 'Reading, importing, and your vocabulary work without this.';
const TRY_TEST_AGAIN = 'Try the test again in a moment.';
const TRY_AGAIN_SOON = 'Try again in a moment.';

/**
 * English for all thirteen provider failures.
 *
 * Exhaustive by type: adding a variant to `AiErrorCode` will not compile until
 * it has been given words here. Nothing in this table quotes the provider —
 * response bodies, prompts, and the API key never reach the screen.
 */
export const AI_ERROR_COPY: Record<AiErrorCode, AiErrorCopy> = {
  offline: {
    heading: 'This device is offline',
    whatFailed: 'Monosai could not reach OpenRouter because there is no connection.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Reconnect, then run the test again.',
    retryAction: 'Reconnect, then try again.',
    escape: READ_WITHOUT_IT,
  },
  timeout: {
    heading: 'OpenRouter did not answer in time',
    whatFailed: 'The request was given up on before a reply arrived.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_TEST_AGAIN,
    retryAction: TRY_AGAIN_SOON,
    escape: 'A slower model may need a second attempt.',
  },
  cancelled: {
    // Not "Test cancelled": the same variant is reported mid-reading, where
    // there is no test to have cancelled.
    heading: 'Stopped before it finished',
    whatFailed: 'The request was stopped before a reply arrived.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Run the test again when you are ready.',
    retryAction: 'Start it again when you are ready.',
    escape: READ_WITHOUT_IT,
  },
  authentication: {
    heading: 'OpenRouter refused the key',
    whatFailed: 'The saved key was rejected by OpenRouter.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Check the key on openrouter.ai, then save it again here.',
    retryAction: 'Check the key on openrouter.ai, then save it again in Settings.',
    escape: READ_WITHOUT_IT,
  },
  'credit-exhausted': {
    heading: 'This OpenRouter account is out of credit',
    whatFailed: 'The key works, but the account behind it has no credit left to spend.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Add credit on openrouter.ai, then run the test again.',
    retryAction: 'Add credit on openrouter.ai, then try again.',
    escape: 'Saving the key again cannot help. Reading and your vocabulary work without this.',
  },
  'model-not-found': {
    heading: 'That model was not found',
    whatFailed: 'OpenRouter does not offer a model with that exact ID.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Copy the exact model ID from the OpenRouter models page and test again.',
    retryAction: 'Correct the model ID in Settings, then try again.',
    escape: 'Model IDs are case sensitive and usually look like vendor/model-name.',
  },
  'capability-unsupported': {
    heading: 'This model cannot do what Monosai needs',
    whatFailed: 'The model refused part of the request Monosai has to make.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a different model or voice and test again.',
    retryAction: 'Choose a different model or voice in Settings, then try again.',
    escape: 'Ordinary chat working is not enough; generation needs exact structured replies.',
  },
  'rate-limited': {
    heading: 'OpenRouter is rate limiting this key',
    whatFailed: 'Too many requests reached the provider in a short time.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Wait a moment, then run the test again.',
    retryAction: 'Wait a moment, then try again.',
    escape: READ_WITHOUT_IT,
  },
  'provider-unavailable': {
    heading: 'OpenRouter could not be reached',
    whatFailed: 'The provider did not answer, or answered with an error of its own.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_TEST_AGAIN,
    retryAction: TRY_AGAIN_SOON,
    escape: READ_WITHOUT_IT,
  },
  'malformed-response': {
    heading: 'The reply could not be used',
    whatFailed: 'The model answered, but not in the exact shape Monosai requires.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different model and test again.',
    retryAction: 'Choose a different model in Settings, then try again.',
    escape: 'A model that fails this cannot be used for generation.',
  },
  'context-budget-exceeded': {
    heading: 'The request was too large for this model',
    whatFailed: 'The model accepts less input than the request needed.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Choose a model with a larger context and test again.',
    retryAction: 'Choose a model with a larger context in Settings, then try again.',
    escape: READ_WITHOUT_IT,
  },
  'audio-invalid': {
    heading: 'The audio could not be played',
    whatFailed: 'The clip that came back was empty, in an unsupported format, or undecodable.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: 'Try a different TTS model or voice.',
    retryAction: 'Choose a different TTS model or voice in Settings, then try again.',
    escape: 'Text-to-speech is optional and never blocks reading or generation.',
  },
  unknown: {
    heading: 'Something unexpected went wrong',
    whatFailed: 'The request failed in a way Monosai could not classify.',
    whatDidNot: NOTHING_CHANGED,
    primaryAction: TRY_TEST_AGAIN,
    retryAction: TRY_AGAIN_SOON,
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
  'model-discovery': 'looking up model capabilities',
  'text-model-test': 'testing your text model',
  'tts-test': 'testing your voice',
  'story-generation': 'writing your story',
  'story-repair': 'repairing your story',
  'exception-review': 'checking your exception policy',
  'grammar-review': 'reviewing the grammar',
  translation: 'translating this sentence',
  'tts-synthesis': 'reading this sentence aloud',
};

export function aiErrorCopy(error: AiError): AiErrorCopy {
  if (
    error.code === 'capability-unsupported' &&
    (error.task === 'tts-test' || error.task === 'tts-synthesis')
  ) {
    return {
      ...AI_ERROR_COPY['capability-unsupported'],
      primaryAction: 'Check the exact TTS model and voice IDs, then test again.',
      retryAction: 'Check the TTS model and voice IDs in Settings, then try again.',
      escape: 'Voice names are model-specific and case sensitive. Text-to-speech is optional.',
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
