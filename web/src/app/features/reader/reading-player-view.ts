import type { PlaybackFailure, PlaybackStatus } from '../../application/audio/audio-playback.store';
import {
  isAudioRunInProgress,
  type AudioJobProgress,
} from '../../application/enrichment/audio-job.store';
import { PLAYBACK_RATES, type PlaybackRate } from '../../domain/settings/settings';
import { defined } from '../../domain/shared/invariant';
import type { IconName } from '../../shared-ui/icon/icon-set';
import {
  offerLabel,
  playbackFailureMessage,
  positionLabel,
  STALE_AUDIO_ANNOUNCEMENT,
  stoppedRunFailure,
  stoppedRunLine,
} from './reading-player-copy';

/** What the card has to say about generation, if anything. */
export type GenerationRail = 'running' | 'stopped' | 'offer' | 'none';

/**
 * The one contextual control, and what it is at this moment.
 *
 * Everything the card used to say in a band of prose and buttons — prepare
 * this, stop that, this failed — is one slot in the control row whose icon,
 * name and tint say which of them it currently is.
 */
export interface AuxAction {
  readonly kind: 'cancel' | 'generate' | 'retry' | 'dismiss';
  readonly icon: IconName;
  /** The accessible name, and the whole of what the button says out loud. */
  readonly label: string;
  /** The long version, for a pointer that rests on it. */
  readonly title: string;
  readonly tone: 'accent' | 'danger' | 'secondary';
}

/**
 * The big button in the middle, as data.
 *
 * One `<button>` is bound to this, so the element — and the focus on it —
 * survives every change between its meanings. `generating` is a run in
 * progress with nothing to play yet: the filled button stays exactly where it
 * was and is `aria-busy`, rather than turning into a dead Play.
 */
export interface CentreControl {
  readonly kind: 'generate' | 'generating' | 'play' | 'pause';
  readonly icon: IconName;
  /** The accessible name, and the tooltip. */
  readonly label: string;
  /** Unavailable: there is nothing to start, and no work that will provide it. */
  readonly disabled: boolean;
  /** Working: the control is holding a wait and ignores presses until it ends. */
  readonly busy: boolean;
}

/**
 * Everything the player decides from, read once from the stores.
 *
 * The decisions below are functions of this and nothing else, so each of them is
 * tested with a literal rather than with a store behind it.
 */
export interface PlayerFacts {
  readonly progress: AudioJobProgress;
  readonly status: PlaybackStatus;
  readonly failure: PlaybackFailure | null;
  readonly sentenceCount: number;
  /** How many sentences of the reading have a clip. */
  readonly availableCount: number;
  readonly position: number;
  readonly pendingPosition: number;
  readonly hasPlayableAudio: boolean;
  readonly canPlayWholeReading: boolean;
  readonly hasStaleAudio: boolean;
  readonly modelConfigured: boolean;
}

/**
 * What the rail says, resolved from the job first and the set second.
 *
 * A run that is going or has just stopped is what the learner is waiting on.
 * With nothing to report, the rail offers to prepare whatever is still
 * missing, and disappears entirely once nothing is.
 */
export function generationRail(facts: PlayerFacts): GenerationRail {
  const { progress } = facts;
  if (progress.kind === 'deleted') {
    return 'none';
  }
  if (isAudioRunInProgress(progress)) {
    return 'running';
  }
  if (facts.canPlayWholeReading) {
    // A run that stopped but left the reading complete has nothing to retry,
    // so it has nothing to say: the whole set is there and playable.
    return 'none';
  }
  if (progress.kind === 'failed' || progress.kind === 'cancelled') {
    return 'stopped';
  }
  if (facts.sentenceCount === 0) {
    return 'none';
  }
  return 'offer';
}

/** The run is parked between batches and will pick up on its own. */
function isParked(facts: PlayerFacts): boolean {
  return facts.progress.kind === 'paused';
}

/**
 * Whether the primary control is the setup link rather than a button.
 *
 * Nothing can be generated and nothing can be played without a tested model,
 * so the press that is worth making is the one that gets one. Playing wins:
 * a sound already going is never replaced by a link.
 */
export function setupNeeded(facts: PlayerFacts): boolean {
  return (
    facts.status !== 'playing' &&
    facts.sentenceCount > 0 &&
    !facts.modelConfigured &&
    !facts.hasPlayableAudio
  );
}

function playLabel(status: PlaybackStatus): string {
  switch (status) {
    case 'paused':
      return 'Resume';
    case 'stepped':
      // The one press whose meaning the position line cannot carry: the
      // cursor genuinely is on the sentence just heard, so the button is
      // where "and now the next one" has to be said.
      return 'Next sentence';
    case 'waiting':
      return 'Waiting for the next sentence';
    case 'ended':
      return 'Play again';
    default:
      return 'Play';
  }
}

/**
 * Play is pressable when it has somewhere to start.
 *
 * Waiting and loading are already-started sessions with nothing to press —
 * and no longer a dead end either way, because Stop is live beside them. Any
 * stored clip is enough to start on: clips arrive out of order, so requiring
 * sentence one left a learner with no way into audio they had paid for.
 */
function canPressPlay(facts: PlayerFacts): boolean {
  if (facts.status === 'paused' || facts.status === 'stepped') {
    return true;
  }
  if (facts.status === 'loading' || facts.status === 'waiting') {
    return false;
  }
  return facts.hasPlayableAudio;
}

/**
 * What the big button in the middle is.
 *
 * A reading with nothing to play has no use for a Play button, and the thing
 * a learner opening that player wants is the audio itself — so the primary
 * control is the one that makes it, in the same place and the same shape.
 * Once it has been pressed the control is still that button, busy, until the
 * first clip lands and it becomes Play.
 */
export function centreControl(facts: PlayerFacts): CentreControl {
  if (facts.status === 'playing') {
    return { kind: 'pause', icon: 'pause', label: 'Pause', disabled: false, busy: false };
  }
  const generating = generationRail(facts) === 'running';
  if (!facts.hasPlayableAudio) {
    if (generating) {
      return {
        kind: 'generating',
        icon: 'generate',
        // A parked run is waiting for its turn, in the words the reader's
        // story options already use for it.
        label: isParked(facts) ? 'Waiting to continue' : 'Generating audio',
        disabled: false,
        busy: true,
      };
    }
    if (facts.sentenceCount > 0 && facts.modelConfigured) {
      return {
        kind: 'generate',
        icon: 'generate',
        label: 'Generate audio',
        disabled: false,
        busy: false,
      };
    }
  }
  // A session that has started and is waiting on a clip is working, not
  // unavailable, while something is still making that clip.
  const busy = facts.status === 'loading' || (facts.status === 'waiting' && generating);
  return {
    kind: 'play',
    icon: 'play',
    label: playLabel(facts.status),
    disabled: !busy && !canPressPlay(facts),
    busy,
  };
}

/**
 * The one contextual control, in priority order.
 *
 * A failure is acknowledged before anything else is offered, because it is
 * the only state the card cannot leave on its own. A run being stopped or
 * retried comes next, and preparing what is missing last.
 */
export function auxAction(facts: PlayerFacts): AuxAction | null {
  const rail = generationRail(facts);
  if (rail === 'running') {
    return {
      kind: 'cancel',
      icon: 'stop',
      label: 'Stop generating audio',
      title: 'Stop generating audio',
      tone: 'accent',
    };
  }
  const playbackFailure = playbackFailureMessage(facts.failure);
  if (playbackFailure !== null) {
    return {
      kind: 'dismiss',
      icon: 'close',
      label: 'Dismiss',
      title: playbackFailure,
      tone: 'danger',
    };
  }
  if (rail === 'stopped') {
    const title = [
      stoppedRunLine(facts.progress, facts.availableCount, facts.sentenceCount),
      stoppedRunFailure(facts.progress) ?? '',
    ]
      .filter((part) => part !== '')
      .join(' ');
    // A retry that has been shown not to work is not offered. What is left to
    // do with the report is put it away, so that is what the button says: the
    // card cannot leave a settled failure on its own, and a control that
    // spends a request per missing sentence to reproduce the same answer is
    // not the way out of it.
    const retryable = facts.progress.kind !== 'failed' || facts.progress.canRetry;
    return retryable
      ? { kind: 'retry', icon: 'retry', label: 'Try again', title, tone: 'danger' }
      : { kind: 'dismiss', icon: 'close', label: 'Dismiss', title, tone: 'danger' };
  }
  if (!facts.modelConfigured) {
    // The centre control is the setup in this state, and one screen does not
    // offer the same link twice.
    return null;
  }
  if (rail === 'offer' && facts.hasPlayableAudio) {
    return {
      kind: 'generate',
      icon: 'generate',
      label: 'Generate audio',
      title: `Generate audio — ${offerLabel(facts.availableCount, facts.sentenceCount)}`,
      tone: 'accent',
    };
  }
  return null;
}

/**
 * How much of the reading has audio, over the whole reading.
 *
 * Deliberately not the percentage of the job: a retry covering the two
 * sentences a run missed is 50% done at one of them, and drawing that as half
 * the reading would be a lie about a nearly complete set.
 */
export function coveragePercent(count: number, sentenceCount: number): number {
  return sentenceCount === 0 ? 0 : Math.round((count / sentenceCount) * 100);
}

/**
 * Everything the card used to print, in one announcement.
 *
 * The position first, because it is what changes and what a learner listening
 * with a screen reader is following; then whatever the card would have said
 * beneath the controls, so nothing that was readable has become unsayable.
 */
export function announcement(facts: PlayerFacts): string {
  const rail = generationRail(facts);
  const parts = [
    positionLabel({
      status: facts.status,
      current: facts.position,
      pending: facts.pendingPosition,
      sentenceCount: facts.sentenceCount,
      settled: rail === 'none',
    }),
  ];
  const failure = playbackFailureMessage(facts.failure);
  if (failure !== null) {
    parts.push(failure);
  }
  const job = stoppedRunLine(facts.progress, facts.availableCount, facts.sentenceCount);
  if (job !== '') {
    parts.push(job);
  }
  const jobFailure = stoppedRunFailure(facts.progress);
  if (jobFailure !== null) {
    parts.push(jobFailure);
  }
  if (facts.hasStaleAudio) {
    parts.push(STALE_AUDIO_ANNOUNCEMENT);
  }
  if (rail === 'offer') {
    parts.push(
      `${offerLabel(facts.availableCount, facts.sentenceCount)} — audio can be generated.`,
    );
  }
  if (rail === 'running') {
    const state = isParked(facts) ? 'Waiting to continue' : 'Generating audio';
    const percent = coveragePercent(facts.availableCount, facts.sentenceCount);
    parts.push(`${state}, ${String(percent)}% of the reading ready.`);
  }
  return parts.join(' ');
}

/**
 * Whether two control descriptions say the same thing.
 *
 * The controls are rebuilt from the facts, and the facts change with every
 * sentence the reading crosses. Comparing by field keeps a control that did not
 * change the same object, so nothing bound to it re-evaluates for a tick that
 * did not touch it.
 */
export function sameControl<T extends object>(a: T | null, b: T | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/** The next reading speed in the cycle, wrapping at the end. */
export function nextPlaybackRate(current: PlaybackRate): PlaybackRate {
  const index = PLAYBACK_RATES.indexOf(current);
  return defined(PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length], 'nextPlaybackRate');
}
