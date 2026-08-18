import { describe, expect, it } from 'vitest';
import { paragraphId, readingId, sentenceId } from '../shared/ids';
import type { ReadingProgress } from './progress';
import {
  clampPosition,
  isResumable,
  progressFraction,
  progressPercent,
  READING_START,
  resolveResumeTarget,
  type SentenceLocation,
} from './reading-position';

const progress: ReadingProgress = {
  readingId: readingId('r1'),
  paragraphId: paragraphId('p2'),
  sentenceId: sentenceId('s5'),
  positionInReading: 5,
  lastOpenedAt: 1_000,
  updatedAt: 1_000,
};

const location: SentenceLocation = {
  sentenceId: sentenceId('s5'),
  paragraphId: paragraphId('p2'),
  paragraphPosition: 2,
  positionInReading: 5,
};

describe('resolveResumeTarget', () => {
  it('resumes the saved sentence when it still exists', () => {
    expect(resolveResumeTarget(progress, location)).toEqual({
      paragraphPosition: 2,
      sentenceId: sentenceId('s5'),
      basis: 'exact',
    });
  });

  it('falls back to the surviving sentence at the saved position', () => {
    const moved: SentenceLocation = {
      ...location,
      sentenceId: sentenceId('s9'),
      paragraphId: paragraphId('p3'),
      paragraphPosition: 3,
    };
    expect(resolveResumeTarget(progress, moved)).toEqual({
      paragraphPosition: 3,
      sentenceId: sentenceId('s9'),
      basis: 'nearest',
    });
  });

  it('starts at the beginning when nothing survives at the saved position', () => {
    expect(resolveResumeTarget(progress, null)).toEqual(READING_START);
  });

  it('starts at the beginning for a reading that was never opened', () => {
    expect(resolveResumeTarget(null, location)).toEqual(READING_START);
  });
});

describe('clampPosition', () => {
  it('keeps a position inside the reading', () => {
    expect(clampPosition(5, 10)).toBe(5);
  });

  it('clamps a position past the end onto the last sentence', () => {
    expect(clampPosition(99, 10)).toBe(9);
  });

  it('clamps a negative or non-finite position to the start', () => {
    expect(clampPosition(-3, 10)).toBe(0);
    expect(clampPosition(Number.NaN, 10)).toBe(0);
  });

  it('reports the start for an empty reading', () => {
    expect(clampPosition(4, 0)).toBe(0);
  });
});

describe('progressFraction', () => {
  it('counts the current sentence as read', () => {
    expect(progressFraction(0, 4)).toBe(0.25);
    expect(progressFraction(3, 4)).toBe(1);
  });

  it('reports the last sentence as complete rather than one short', () => {
    expect(progressPercent(19, 20)).toBe(100);
  });

  it('clamps a stale position past the end', () => {
    expect(progressPercent(50, 20)).toBe(100);
  });

  it('reports nothing for an empty reading', () => {
    expect(progressFraction(0, 0)).toBe(0);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe('isResumable', () => {
  it('is false for a reading opened but never scrolled', () => {
    expect(isResumable({ ...progress, positionInReading: 0 })).toBe(false);
  });

  it('is false with no saved progress at all', () => {
    expect(isResumable(null)).toBe(false);
  });

  it('is true once the learner moved past the first sentence', () => {
    expect(isResumable(progress)).toBe(true);
  });
});
