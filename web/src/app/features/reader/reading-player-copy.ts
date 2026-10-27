import type { PlaybackFailure, PlaybackStatus } from '../../application/audio/audio-playback.store';
import type {
  AudioJobCounts,
  AudioJobProgress,
} from '../../application/enrichment/audio-job.store';
import type { PlaybackRate } from '../../domain/settings/settings';
import { aiFailureMessage } from '../../shared-ui/ai-error/ai-error-copy';

/**
 * Everything the reading player says.
 *
 * The card prints almost nothing, so its words live in accessible names,
 * tooltips and one hidden live region. They are kept here, as plain functions of
 * plain numbers, because the wording is the contract: it is what a screen reader
 * hears and what the journeys assert, and it should be changed in one place and
 * read without a component around it.
 */

/** Said when playable clips were made with older settings. */
export const STALE_AUDIO_ANNOUNCEMENT =
  'Some audio is from older settings. It can still play; generating again replaces it.';

/** Why playback stopped on its own, said in terms of the sentence it stopped at. */
export function playbackFailureMessage(failure: PlaybackFailure | null): string | null {
  if (failure === null) {
    return null;
  }
  switch (failure.kind) {
    case 'missing-clip':
      return `Sentence ${String(failure.position)} has no audio for the voice you are using now. Playback stopped there.`;
    case 'not-generated':
      return `Sentence ${String(failure.position)} has not been generated yet. Playback stopped there.`;
    case 'decode-failed':
      return `The audio for sentence ${String(failure.position)} could not be played. Playback stopped there.`;
    case 'storage':
      return `Reading the saved audio failed: ${failure.message}`;
  }
}

/**
 * What a run that has stopped has to report.
 *
 * Only a stopped run has anything to say. A run in progress is reported by the
 * track and the ring alone; a count in words repeated what they showed.
 */
export function stoppedRunLine(
  progress: AudioJobProgress,
  availableCount: number,
  sentenceCount: number,
): string {
  switch (progress.kind) {
    // A paused run is still going as far as the learner is concerned: it
    // stopped to let something else through and picks up on its own.
    case 'idle':
    case 'complete':
    case 'deleted':
    case 'preparing':
    case 'running':
    case 'paused':
      return '';
    case 'cancelled':
      return progress.counts.requested === 0
        ? 'Stopped.'
        : `${readyLine(availableCount, sentenceCount)} ${attemptLine(progress.counts)}`;
    case 'failed': {
      // A job that failed before it resolved what to send has no position to
      // report; claiming one produced "sentence 1 of 0".
      if (progress.counts.requested === 0) {
        return 'Audio could not be prepared.';
      }
      const exhausted = progress.canRetry
        ? ''
        : ' Trying again produced nothing, so it is no longer offered: a different voice or model may read these sentences.';
      return `${readyLine(availableCount, sentenceCount)} ${attemptLine(progress.counts)}${exhausted}`;
    }
  }
}

/**
 * What the *reading* has, which is what the track beside this is drawing.
 *
 * Deliberately not the run's own numerator over the run's own denominator:
 * "0 of 4 ready" beside a bar drawn a third full read as "nothing is ready"
 * when a third of the reading was, and the two figures were measuring
 * different things under one form of words.
 */
function readyLine(availableCount: number, sentenceCount: number): string {
  return `Stopped with ${String(availableCount)} of ${String(sentenceCount)} sentences ready.`;
}

/** What this attempt did, said as an attempt rather than as the reading. */
function attemptLine(counts: AudioJobCounts): string {
  const missing = counts.requested;
  return `This attempt covered ${String(counts.completed)} of the ${String(missing)} ${missing === 1 ? 'sentence' : 'sentences'} it set out to read.`;
}

/** Why a run failed, in the words the rest of the reader uses; null when it did not. */
export function stoppedRunFailure(progress: AudioJobProgress): string | null {
  if (progress.kind !== 'failed') {
    return null;
  }
  if (progress.error.source === 'storage') {
    return `Saving failed: ${progress.error.error.message}`;
  }
  // The reader surface, because the settings table's action names a test this
  // screen does not have. Try again is the control right beside this.
  return aiFailureMessage(progress.error.error, 'reader');
}

/** What is still missing, when there is an offer to prepare it. */
export function offerLabel(availableCount: number, sentenceCount: number): string {
  if (availableCount === 0) {
    return `${String(sentenceCount)} ${sentenceCount === 1 ? 'sentence' : 'sentences'}`;
  }
  return `${String(availableCount)} of ${String(sentenceCount)} sentences have audio`;
}

/** Where the reading is, for the hidden live region. */
export function positionLabel(position: {
  readonly status: PlaybackStatus;
  readonly current: number;
  readonly pending: number;
  readonly sentenceCount: number;
  /** Nothing is left to prepare, so an unplayed reading is simply ready. */
  readonly settled: boolean;
}): string {
  const total = String(position.sentenceCount);
  if (position.status === 'waiting') {
    return `Waiting for sentence ${String(position.pending)} of ${total}`;
  }
  if (position.status === 'ended') {
    // Distinct from "N sentences ready", which is what a reading that was
    // never started says. Reaching the end used to be reported as a reset.
    return 'Finished';
  }
  if (position.current > 0) {
    return `Sentence ${String(position.current)} of ${total}`;
  }
  return position.settled ? `${total} sentences ready` : 'Not playing';
}

/** What the slider's value means, since its number alone says nothing. */
export function trackValueText(
  position: number,
  sentenceCount: number,
  availableCount: number,
): string {
  const where =
    position > 0 ? `Sentence ${String(position)} of ${String(sentenceCount)}` : 'Not started';
  return `${where}, ${String(availableCount)} of ${String(sentenceCount)} with audio`;
}

export function playbackSpeedLabel(rate: PlaybackRate): string {
  return `${String(rate)}×`;
}

export function playbackSpeedAriaLabel(rate: PlaybackRate): string {
  return `Reading speed, ${String(rate)} times`;
}
