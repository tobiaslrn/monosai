import {
  isModerationRefusal,
  isTruncatedReply,
  type AiError,
  type AiErrorCode,
} from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import { SPEECH_CODE_UNAVAILABLE } from '../../domain/ai/text-to-speech-provider';
import { AUDIO_CHECK_TIMED_OUT, NO_AUDIO_DECODER } from '../../domain/audio/audio-decoder';

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
 * What the failure stopped: one `request`, such as a sentence's translation, or
 * a `run` over a whole story, which a single failed request ends.
 */
export type AiFailureScope = 'request' | 'run';

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
const OPEN_ANOTHER_BROWSER = 'Open Monosai in a current browser, such as Chrome.';

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

/**
 * The tasks that read differently when a whole story's run of them stopped:
 * one failed request stops the run, and naming its sentence on a card with no
 * sentence in view sent the learner to look for a fault in one.
 */
const AI_RUN_TASK_COPY: Partial<Record<AiTask, string>> = {
  translation: 'translating this story',
  'tts-synthesis': 'making audio for this story',
};

/** The title of a moderation refusal, shared with the troubleshooting guide. */
export const MODERATION_HEADING = 'OpenRouter flagged the text';

/** The title of speech code that could not load, shared with the troubleshooting guide. */
export const SPEECH_CODE_HEADING = 'Speech could not load';

/**
 * Monosai's own speech code could not be loaded in this tab.
 *
 * Not the request's fault and not any sentence's: no voice, model or retry
 * changes it, since some browsers refuse a module that failed once until the
 * page reloads. Reloading is the one step that works.
 */
function isSpeechCodeUnavailable(error: AiError): boolean {
  return error.detail?.issueCode === SPEECH_CODE_UNAVAILABLE;
}

/** The title of a browser with no audio decoder, shared with the troubleshooting guide. */
export const NO_AUDIO_DECODER_HEADING = 'This browser cannot make new audio';

/** A browser with no audio decoder, said the same wherever it is met. */
export const NO_AUDIO_DECODER_MESSAGE = `${NO_AUDIO_DECODER_HEADING}. ${OPEN_ANOTHER_BROWSER}`;

/**
 * This browser has nothing to decode audio with, so no clip can be checked
 * and none is kept. No voice, model or retry changes that; another browser
 * does.
 */
function isNoAudioDecoder(error: AiError): boolean {
  return error.detail?.issueCode === NO_AUDIO_DECODER;
}

/** The title of a decoder check that did not answer in time. */
export const AUDIO_CHECK_TIMED_OUT_HEADING = 'This browser did not answer';

/**
 * The browser's decoder did not answer the check in time. Unlike a missing
 * decoder this proves nothing about the browser, so trying again is the step.
 */
function isAudioCheckTimedOut(error: AiError): boolean {
  return error.detail?.issueCode === AUDIO_CHECK_TIMED_OUT;
}

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
  // No step is named: a reload is the one that works, and the surface that
  // can reload offers it as a control beside the message.
  if (isSpeechCodeUnavailable(error)) {
    return {
      ...AI_ERROR_COPY.unknown,
      heading: SPEECH_CODE_HEADING,
      primaryAction: '',
      retryAction: '',
    };
  }
  if (isNoAudioDecoder(error)) {
    return {
      ...AI_ERROR_COPY.unknown,
      heading: NO_AUDIO_DECODER_HEADING,
      primaryAction: OPEN_ANOTHER_BROWSER,
      retryAction: OPEN_ANOTHER_BROWSER,
    };
  }
  if (isAudioCheckTimedOut(error)) {
    return { ...AI_ERROR_COPY.unknown, heading: AUDIO_CHECK_TIMED_OUT_HEADING };
  }
  // The key worked and the model exists; its moderation check refused the text.
  // A different model is still the remedy, so only the title differs.
  if (isModerationRefusal(error)) {
    return { ...AI_ERROR_COPY['capability-unsupported'], heading: MODERATION_HEADING };
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
export function aiFailureMessage(
  error: AiError,
  surface: AiFailureSurface,
  scope: AiFailureScope = 'request',
): string {
  // Nothing the learner was doing caused it, so naming the task would only
  // send them to look for a fault in it.
  if (isSpeechCodeUnavailable(error)) {
    return `${SPEECH_CODE_HEADING}.`;
  }
  if (isNoAudioDecoder(error)) {
    return NO_AUDIO_DECODER_MESSAGE;
  }
  const task =
    (scope === 'run' ? AI_RUN_TASK_COPY[error.task] : undefined) ?? aiTaskCopy(error.task);
  return `${aiErrorCopy(error).heading} while ${task}. ${aiErrorAction(error, surface)}`;
}
