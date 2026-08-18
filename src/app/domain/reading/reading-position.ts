import type { ParagraphId, SentenceId } from '../shared/ids';
import type { ReadingProgress } from './progress';

/** Where one sentence sits, resolved from bounded indexed lookups. */
export interface SentenceLocation {
  readonly sentenceId: SentenceId;
  readonly paragraphId: ParagraphId;
  readonly paragraphPosition: number;
  readonly positionInReading: number;
}

/**
 * How confidently a saved position was recovered. The reader states this rather
 * than silently pretending an approximate resume was exact.
 */
export type ResumeBasis =
  /** The saved sentence still exists. */
  | 'exact'
  /** The sentence changed, but its position resolved to a surviving one. */
  | 'nearest'
  /** Nothing usable survived, or the reading was never opened. */
  | 'beginning';

export interface ResumeTarget {
  readonly paragraphPosition: number;
  readonly sentenceId: SentenceId | null;
  readonly basis: ResumeBasis;
}

export const READING_START: ResumeTarget = {
  paragraphPosition: 0,
  sentenceId: null,
  basis: 'beginning',
};

/** Clamps a saved position into the reading's current sentence range. */
export function clampPosition(positionInReading: number, sentenceCount: number): number {
  if (sentenceCount <= 0 || !Number.isFinite(positionInReading)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(positionInReading), 0), sentenceCount - 1);
}

/**
 * Resolves where to reopen a reading.
 *
 * `location` is whatever survives at the saved position today. An exact match
 * resumes the saved sentence; a surviving sentence at the same position is the
 * nearest fallback; anything else starts at the beginning rather than guessing.
 */
export function resolveResumeTarget(
  progress: ReadingProgress | null,
  location: SentenceLocation | null,
): ResumeTarget {
  if (progress === null || location === null) {
    return READING_START;
  }
  return {
    paragraphPosition: location.paragraphPosition,
    sentenceId: location.sentenceId,
    basis:
      location.sentenceId === progress.sentenceId && location.paragraphId === progress.paragraphId
        ? 'exact'
        : 'nearest',
  };
}

/**
 * Share of the reading already read, as a fraction between 0 and 1.
 *
 * The current sentence counts as read, so finishing the last sentence reports
 * 100% rather than stalling one sentence short.
 */
export function progressFraction(positionInReading: number, sentenceCount: number): number {
  if (sentenceCount <= 0) {
    return 0;
  }
  const clamped = clampPosition(positionInReading, sentenceCount);
  return (clamped + 1) / sentenceCount;
}

export function progressPercent(positionInReading: number, sentenceCount: number): number {
  return Math.round(progressFraction(positionInReading, sentenceCount) * 100);
}

/** Whether a reading has been opened far enough to be worth resuming. */
export function isResumable(progress: ReadingProgress | null): boolean {
  return progress !== null && progress.positionInReading > 0;
}
