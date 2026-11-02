import { describe, expect, it } from 'vitest';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { readingId } from '../../domain/shared/ids';
import {
  announcement,
  auxAction,
  centreControl,
  coveragePercent,
  generationRail,
  nextPlaybackRate,
  sameControl,
  setupNeeded,
  type PlayerFacts,
} from './reading-player-view';

const READING = readingId('00000000-0000-4000-8000-000000000001');
const COUNTS = { total: 13, requested: 13, completed: 4, failed: 0 };

const RUNNING: AudioJobProgress = { kind: 'running', readingId: READING, counts: COUNTS };
const PAUSED: AudioJobProgress = { kind: 'paused', readingId: READING, counts: COUNTS };
const CANCELLED: AudioJobProgress = { kind: 'cancelled', readingId: READING, counts: COUNTS };

function failed(canRetry: boolean): AudioJobProgress {
  return {
    kind: 'failed',
    readingId: READING,
    counts: COUNTS,
    error: {
      source: 'provider',
      error: aiError('rate-limited', 'tts-synthesis', 'Too many requests.'),
    },
    canRetry,
  };
}

/** A configured reading of thirteen sentences with nothing generated and nothing playing. */
function facts(overrides: Partial<PlayerFacts> = {}): PlayerFacts {
  return {
    progress: { kind: 'idle' },
    status: 'idle',
    failure: null,
    sentenceCount: 13,
    availableCount: 0,
    position: 0,
    pendingPosition: 0,
    hasPlayableAudio: false,
    canPlayWholeReading: false,
    hasStaleAudio: false,
    modelConfigured: true,
    ...overrides,
  };
}

/** Some of the reading has audio: the transport is live and the rest can be offered. */
const PARTIAL = { availableCount: 4, hasPlayableAudio: true } as const;

describe('generationRail', () => {
  it('reports a run that is going, preparing or parked between batches', () => {
    expect(generationRail(facts({ progress: { kind: 'preparing', readingId: READING } }))).toBe(
      'running',
    );
    expect(generationRail(facts({ progress: RUNNING }))).toBe('running');
    expect(generationRail(facts({ progress: PAUSED }))).toBe('running');
  });

  it('says nothing once the reading was deleted, whatever else is true', () => {
    expect(generationRail(facts({ progress: { kind: 'deleted', readingId: READING } }))).toBe(
      'none',
    );
  });

  it('reports a stopped run, unless it left the reading complete', () => {
    expect(generationRail(facts({ progress: CANCELLED, ...PARTIAL }))).toBe('stopped');
    expect(generationRail(facts({ progress: failed(true), ...PARTIAL }))).toBe('stopped');
    expect(
      generationRail(facts({ progress: failed(true), ...PARTIAL, canPlayWholeReading: true })),
    ).toBe('none');
  });

  it('offers what is missing, and nothing for a reading with no sentences', () => {
    expect(generationRail(facts())).toBe('offer');
    expect(generationRail(facts({ sentenceCount: 0 }))).toBe('none');
  });
});

describe('setupNeeded', () => {
  it('is the primary control when there is no model and nothing to play', () => {
    expect(setupNeeded(facts({ modelConfigured: false }))).toBe(true);
  });

  it('never replaces a sound that is going, a reading that can play, or a configured model', () => {
    expect(setupNeeded(facts({ modelConfigured: false, status: 'playing' }))).toBe(false);
    expect(setupNeeded(facts({ modelConfigured: false, ...PARTIAL }))).toBe(false);
    expect(setupNeeded(facts())).toBe(false);
    expect(setupNeeded(facts({ modelConfigured: false, sentenceCount: 0 }))).toBe(false);
  });
});

describe('centreControl', () => {
  it('is Generate for a reading with no audio, and unavailable without a model', () => {
    expect(centreControl(facts())).toEqual({
      kind: 'generate',
      icon: 'generate',
      label: 'Generate audio',
      disabled: false,
      busy: false,
    });
    expect(centreControl(facts({ modelConfigured: false }))).toMatchObject({
      kind: 'play',
      disabled: true,
      busy: false,
    });
  });

  it('stays the same control, busy and not disabled, while the first clip is made', () => {
    expect(centreControl(facts({ progress: RUNNING }))).toEqual({
      kind: 'generating',
      icon: 'generate',
      label: 'Generating audio',
      disabled: false,
      busy: true,
    });
  });

  it('says a parked run is waiting for its turn', () => {
    expect(centreControl(facts({ progress: PAUSED }))).toMatchObject({
      label: 'Waiting to continue',
      busy: true,
    });
  });

  it('is Pause while playing, whatever the run is doing', () => {
    expect(centreControl(facts({ status: 'playing', progress: RUNNING, ...PARTIAL }))).toEqual({
      kind: 'pause',
      icon: 'pause',
      label: 'Pause',
      disabled: false,
      busy: false,
    });
  });

  it('names the press Play will make', () => {
    const label = (overrides: Partial<PlayerFacts>): string =>
      centreControl(facts({ ...PARTIAL, ...overrides })).label;

    expect(label({})).toBe('Play');
    expect(label({ status: 'paused' })).toBe('Resume');
    expect(label({ status: 'stepped' })).toBe('Next sentence');
    expect(label({ status: 'ended' })).toBe('Play again');
    expect(label({ status: 'waiting' })).toBe('Waiting for the next sentence');
  });

  it('is pressable wherever it has somewhere to start', () => {
    const disabled = (overrides: Partial<PlayerFacts>): boolean =>
      centreControl(facts(overrides)).disabled;

    expect(disabled(PARTIAL)).toBe(false);
    expect(disabled({ ...PARTIAL, status: 'paused' })).toBe(false);
    expect(disabled({ status: 'stepped' })).toBe(false);
    expect(disabled({ status: 'ended', hasPlayableAudio: false, modelConfigured: false })).toBe(
      true,
    );
  });

  it('is busy, not disabled, while a clip loads or is being made', () => {
    expect(centreControl(facts({ ...PARTIAL, status: 'loading' }))).toMatchObject({
      disabled: false,
      busy: true,
    });
    expect(
      centreControl(facts({ ...PARTIAL, status: 'waiting', progress: RUNNING })),
    ).toMatchObject({ disabled: false, busy: true });
  });

  it('is unavailable, and not busy, when waiting on a clip nothing is making', () => {
    expect(centreControl(facts({ ...PARTIAL, status: 'waiting' }))).toMatchObject({
      disabled: true,
      busy: false,
    });
  });
});

describe('auxAction', () => {
  it('is Stop while a run is going, ahead of everything else', () => {
    const action = auxAction(
      facts({ progress: RUNNING, failure: { kind: 'missing-clip', position: 2 } }),
    );

    expect(action).toMatchObject({
      kind: 'cancel',
      icon: 'stop',
      label: 'Stop generating audio',
      tone: 'accent',
    });
  });

  it('acknowledges a playback failure before offering anything else', () => {
    const action = auxAction(
      facts({
        progress: failed(true),
        failure: { kind: 'decode-failed', position: 3 },
        ...PARTIAL,
      }),
    );

    expect(action).toMatchObject({ kind: 'dismiss', label: 'Dismiss', tone: 'danger' });
    expect(action?.title).toContain('sentence 3');
  });

  it('offers the run again after one that stopped, with the report as its tooltip', () => {
    const action = auxAction(facts({ progress: failed(true), ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'retry', icon: 'retry', label: 'Try again' });
    expect(action?.title).toContain('Stopped with 4 of 13 sentences ready.');
  });

  it('puts a retry that was shown not to work away instead of offering it', () => {
    const action = auxAction(facts({ progress: failed(false), ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'dismiss', label: 'Dismiss', tone: 'danger' });
    expect(action?.title).toContain('no longer offered');
  });

  it('retries a cancelled run, which has no reason not to be', () => {
    expect(auxAction(facts({ progress: CANCELLED, ...PARTIAL }))).toMatchObject({
      kind: 'retry',
    });
  });

  it('offers to prepare the rest beside a transport that can already play', () => {
    expect(auxAction(facts(PARTIAL))).toMatchObject({
      kind: 'generate',
      label: 'Generate audio',
      title: 'Generate audio — 4 of 13 sentences have audio',
      tone: 'accent',
    });
  });

  it('is empty when the centre control already is that action, or the model is missing', () => {
    expect(auxAction(facts())).toBeNull();
    expect(auxAction(facts({ ...PARTIAL, modelConfigured: false }))).toBeNull();
    expect(auxAction(facts({ ...PARTIAL, canPlayWholeReading: true }))).toBeNull();
  });
});

describe('coveragePercent', () => {
  it('is the share of the reading, rounded, and zero for an empty one', () => {
    expect(coveragePercent(4, 13)).toBe(31);
    expect(coveragePercent(13, 13)).toBe(100);
    expect(coveragePercent(0, 0)).toBe(0);
  });
});

describe('announcement', () => {
  it('leads with where the reading is', () => {
    expect(announcement(facts({ ...PARTIAL, position: 5, status: 'paused' }))).toMatch(
      /^Sentence 5 of 13 /,
    );
  });

  it('says a complete reading is ready, and a reading that was never started is not playing', () => {
    expect(announcement(facts({ availableCount: 13, canPlayWholeReading: true }))).toBe(
      '13 sentences ready',
    );
    expect(announcement(facts(PARTIAL))).toMatch(/^Not playing /);
  });

  it('says the offer, and how much of the reading a run has made', () => {
    expect(announcement(facts(PARTIAL))).toContain('4 of 13 sentences have audio — audio can be');
    expect(announcement(facts({ progress: RUNNING, ...PARTIAL }))).toContain(
      'Generating audio, 31% of the reading ready.',
    );
    expect(announcement(facts({ progress: PAUSED, ...PARTIAL }))).toContain(
      'Waiting to continue, 31% of the reading ready.',
    );
  });

  it('carries every report the card does not print, after the position', () => {
    const spoken = announcement(
      facts({
        progress: failed(true),
        failure: { kind: 'storage', message: 'Disk full' },
        hasStaleAudio: true,
        ...PARTIAL,
      }),
    );

    expect(spoken).toContain('Reading the saved audio failed: Disk full');
    expect(spoken).toContain('Stopped with 4 of 13 sentences ready.');
    expect(spoken).toContain('Some audio is from older settings.');
  });

  it('names the sentence a session is waiting for, and the end of the reading', () => {
    expect(announcement(facts({ ...PARTIAL, status: 'waiting', pendingPosition: 6 }))).toMatch(
      /^Waiting for sentence 6 of 13 /,
    );
    expect(announcement(facts({ ...PARTIAL, status: 'ended' }))).toMatch(/^Finished /);
  });
});

describe('nextPlaybackRate', () => {
  it('cycles through the three speeds and wraps', () => {
    expect(nextPlaybackRate(1)).toBe(0.9);
    expect(nextPlaybackRate(0.9)).toBe(0.8);
    expect(nextPlaybackRate(0.8)).toBe(1);
  });
});

describe('sameControl', () => {
  it('is true for controls that say the same thing, and false once a field differs', () => {
    const control = centreControl(facts(PARTIAL));

    expect(sameControl(control, { ...control })).toBe(true);
    expect(sameControl(control, { ...control, label: 'Pause' })).toBe(false);
    expect(sameControl(control, { ...control, busy: true })).toBe(false);
  });

  it('treats an empty slot as equal only to another empty slot', () => {
    const action = auxAction(facts(PARTIAL));

    expect(sameControl(null, null)).toBe(true);
    expect(sameControl(action, null)).toBe(false);
    expect(sameControl(null, action)).toBe(false);
  });
});
