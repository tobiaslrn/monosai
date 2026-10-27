import { describe, expect, it } from 'vitest';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { readingId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import {
  offerLabel,
  playbackFailureMessage,
  playbackSpeedAriaLabel,
  playbackSpeedLabel,
  positionLabel,
  stoppedRunFailure,
  stoppedRunLine,
  trackValueText,
} from './reading-player-copy';

const READING = readingId('00000000-0000-4000-8000-000000000001');
const COUNTS = { total: 13, requested: 9, completed: 4, failed: 1 };

describe('playbackFailureMessage', () => {
  it('is null when nothing went wrong', () => {
    expect(playbackFailureMessage(null)).toBeNull();
  });

  it('names the sentence playback stopped at', () => {
    expect(playbackFailureMessage({ kind: 'missing-clip', position: 3 })).toBe(
      'Sentence 3 has no audio for the voice you are using now. Playback stopped there.',
    );
    expect(playbackFailureMessage({ kind: 'not-generated', position: 4 })).toBe(
      'Sentence 4 has not been generated yet. Playback stopped there.',
    );
    expect(playbackFailureMessage({ kind: 'decode-failed', position: 5 })).toBe(
      'The audio for sentence 5 could not be played. Playback stopped there.',
    );
  });

  it('reports a storage failure in its own words', () => {
    expect(playbackFailureMessage({ kind: 'storage', message: 'Disk full' })).toBe(
      'Reading the saved audio failed: Disk full',
    );
  });
});

describe('stoppedRunLine', () => {
  it('says nothing about a run that is not over, or that never ran', () => {
    const quiet: AudioJobProgress[] = [
      { kind: 'idle' },
      { kind: 'preparing', readingId: READING },
      { kind: 'running', readingId: READING, counts: COUNTS },
      { kind: 'paused', readingId: READING, counts: COUNTS },
      { kind: 'complete', readingId: READING, counts: COUNTS },
      { kind: 'deleted', readingId: READING },
    ];

    expect(quiet.map((progress) => stoppedRunLine(progress, 4, 13))).toEqual(quiet.map(() => ''));
  });

  it('counts the reading as the track does, and the attempt as an attempt', () => {
    const line = stoppedRunLine({ kind: 'cancelled', readingId: READING, counts: COUNTS }, 6, 13);

    expect(line).toBe(
      'Stopped with 6 of 13 sentences ready. This attempt covered 4 of the 9 sentences it set out to read.',
    );
  });

  it('says a cancellation before any work was asked for was simply a stop', () => {
    const counts = { total: 13, requested: 0, completed: 0, failed: 0 };

    expect(stoppedRunLine({ kind: 'cancelled', readingId: READING, counts }, 0, 13)).toBe(
      'Stopped.',
    );
  });

  it('uses the singular for a single sentence', () => {
    const counts = { total: 13, requested: 1, completed: 0, failed: 1 };

    expect(stoppedRunLine({ kind: 'cancelled', readingId: READING, counts }, 12, 13)).toContain(
      'of the 1 sentence it set out',
    );
  });

  it('claims no position for a job that failed before it resolved what to send', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: { total: 13, requested: 0, completed: 0, failed: 0 },
      error: { source: 'provider', error: aiError('rate-limited', 'tts-synthesis', 'No.') },
      canRetry: true,
    };

    expect(stoppedRunLine(progress, 0, 13)).toBe('Audio could not be prepared.');
  });

  it('explains why a retry is no longer offered', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: { source: 'provider', error: aiError('rate-limited', 'tts-synthesis', 'Slow.') },
      canRetry: false,
    };

    expect(stoppedRunLine(progress, 4, 13)).toContain(' Trying again produced nothing');
    expect(stoppedRunLine({ ...progress, canRetry: true }, 4, 13)).not.toContain(
      'Trying again produced nothing',
    );
  });
});

describe('stoppedRunFailure', () => {
  it('is null unless the run failed', () => {
    expect(stoppedRunFailure({ kind: 'cancelled', readingId: READING, counts: COUNTS })).toBeNull();
    expect(stoppedRunFailure({ kind: 'idle' })).toBeNull();
  });

  it('says what the storage layer refused', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: { source: 'storage', error: storageError('unavailable', 'No room.') },
      canRetry: true,
    };

    expect(stoppedRunFailure(progress)).toBe('Saving failed: No room.');
  });

  it('says a provider failure in the words the reader uses everywhere', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: {
        source: 'provider',
        error: aiError('credit-exhausted', 'tts-synthesis', 'Payment Required'),
      },
      canRetry: true,
    };

    expect(stoppedRunFailure(progress)).not.toBeNull();
  });
});

describe('offerLabel', () => {
  it('counts the sentences of a reading with no audio, in the right number', () => {
    expect(offerLabel(0, 13)).toBe('13 sentences');
    expect(offerLabel(0, 1)).toBe('1 sentence');
  });

  it('counts what has audio once some does', () => {
    expect(offerLabel(4, 13)).toBe('4 of 13 sentences have audio');
  });
});

describe('positionLabel', () => {
  const base = { current: 0, pending: 0, sentenceCount: 13, settled: false } as const;

  it('says which sentence a session is waiting for', () => {
    expect(positionLabel({ ...base, status: 'waiting', pending: 6 })).toBe(
      'Waiting for sentence 6 of 13',
    );
  });

  it('says the reading finished, which is not the same as never started', () => {
    expect(positionLabel({ ...base, status: 'ended', current: 13, settled: true })).toBe(
      'Finished',
    );
  });

  it('says where the cursor is once there is one', () => {
    expect(positionLabel({ ...base, status: 'paused', current: 5 })).toBe('Sentence 5 of 13');
  });

  it('says a reading that was never started is ready, or not playing while it is being made', () => {
    expect(positionLabel({ ...base, status: 'idle', settled: true })).toBe('13 sentences ready');
    expect(positionLabel({ ...base, status: 'idle' })).toBe('Not playing');
  });
});

describe('trackValueText', () => {
  it('says where the thumb is and how much of the reading has audio', () => {
    expect(trackValueText(4, 13, 9)).toBe('Sentence 4 of 13, 9 of 13 with audio');
  });

  it('says the reading has not been started rather than a position of zero', () => {
    expect(trackValueText(0, 13, 0)).toBe('Not started, 0 of 13 with audio');
  });
});

describe('reading speed', () => {
  it('is shown as a multiplier and named in words', () => {
    expect(playbackSpeedLabel(0.9)).toBe('0.9×');
    expect(playbackSpeedAriaLabel(0.8)).toBe('Reading speed, 0.8 times');
  });
});
