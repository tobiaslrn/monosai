import { describe, expect, it } from 'vitest';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { SPEECH_CODE_UNAVAILABLE } from '../../domain/ai/text-to-speech-provider';
import { AUDIO_CHECK_TIMED_OUT, NO_AUDIO_DECODER } from '../../domain/audio/audio-decoder';
import { readingId } from '../../domain/shared/ids';
import { NO_AUDIO_DECODER_MESSAGE } from '../../shared-ui/ai-error/ai-error-copy';
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
/** Asked for, and waiting on its row for the preparation lane. */
const QUEUED = { kind: 'queued', readingId: READING } as const;

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
    online: true,
    decoderMissing: false,
    decoderNotice: false,
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

  it('reports a request still waiting for its turn as going', () => {
    expect(generationRail(facts({ progress: QUEUED }))).toBe('running');
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

  // No model would make audio in this browser, so the player says why instead.
  it('gives way to the report of a browser with no audio decoder', () => {
    const missing = facts({ modelConfigured: false, decoderMissing: true, decoderNotice: true });

    expect(setupNeeded(missing)).toBe(false);
    expect(auxAction(missing)).toMatchObject({ kind: 'dismiss', title: NO_AUDIO_DECODER_MESSAGE });
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

  it('stays the busy Generate control while the request waits for the lane', () => {
    expect(centreControl(facts({ progress: QUEUED }))).toEqual({
      kind: 'generating',
      icon: 'generate',
      label: 'Waiting to continue',
      disabled: false,
      busy: true,
    });
    expect(centreControl(facts({ progress: QUEUED, online: false }))).toMatchObject({
      label: 'Waiting for connection',
      busy: true,
    });
    expect(centreControl(facts({ progress: PAUSED, online: false }))).toMatchObject({
      label: 'Waiting for connection',
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
      tone: 'action',
    });
  });

  it('is Stop while a request waits for the lane, and no longer offers Generate', () => {
    expect(auxAction(facts({ progress: QUEUED }))).toMatchObject({
      kind: 'cancel',
      label: 'Stop generating audio',
    });
    expect(auxAction(facts({ progress: QUEUED, ...PARTIAL }))).toMatchObject({ kind: 'cancel' });
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
    expect(action?.title).toContain('Stopped. 4 of 13 sentences ready.');
  });

  it('puts a retry that was shown not to work away instead of offering it', () => {
    const action = auxAction(facts({ progress: failed(false), ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'dismiss', label: 'Dismiss', tone: 'danger' });
    expect(action?.title).toContain('no longer offered');
  });

  it('offers no retry once speech code could not load, since only a reload helps', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: {
        source: 'provider',
        error: aiError('unknown', 'tts-synthesis', 'The speech code could not be loaded.', {
          detail: { issueCode: SPEECH_CODE_UNAVAILABLE },
        }),
      },
      canRetry: true,
    };

    const action = auxAction(facts({ progress, ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'dismiss', label: 'Dismiss' });
    expect(action?.title).toContain('Speech could not load.');
    // The card has no reload, so neither its tooltip nor its announcement asks for one.
    expect(action?.title).not.toMatch(/reload/iu);
    expect(announcement(facts({ progress, ...PARTIAL }))).toContain('Speech could not load.');
    expect(announcement(facts({ progress, ...PARTIAL }))).not.toMatch(/reload/iu);
  });

  it('offers no retry when the browser has no audio decoder', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: {
        source: 'provider',
        error: aiError('unknown', 'tts-synthesis', 'This browser has no audio decoder.', {
          detail: { issueCode: NO_AUDIO_DECODER },
        }),
      },
      canRetry: true,
    };

    const action = auxAction(facts({ progress, ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'dismiss', label: 'Dismiss' });
    expect(action?.title).toContain('This browser cannot make new audio.');
  });

  it('offers a retry when the decoder check did not answer in time', () => {
    const progress: AudioJobProgress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: {
        source: 'provider',
        error: aiError('unknown', 'tts-synthesis', 'The audio decoder did not answer.', {
          detail: { issueCode: AUDIO_CHECK_TIMED_OUT },
        }),
      },
      canRetry: true,
    };

    const action = auxAction(facts({ progress, ...PARTIAL }));

    expect(action).toMatchObject({ kind: 'retry' });
    expect(action?.title).toContain('This browser did not answer');
    expect(action?.title).not.toContain(NO_AUDIO_DECODER_MESSAGE);
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
      tone: 'action',
    });
  });

  it('offers nothing paid in a browser with no audio decoder, and reports why', () => {
    const missing = { decoderMissing: true, decoderNotice: true };
    const dismiss = {
      kind: 'dismiss',
      label: 'Dismiss',
      title: NO_AUDIO_DECODER_MESSAGE,
      tone: 'danger',
    };

    expect(centreControl(facts(missing))).toMatchObject({ kind: 'play', disabled: true });
    expect(auxAction(facts(missing))).toMatchObject(dismiss);
    expect(auxAction(facts({ ...missing, ...PARTIAL }))).toMatchObject(dismiss);
    // A stopped run is not offered again either: a retry is a paid request.
    expect(auxAction(facts({ ...missing, ...PARTIAL, progress: CANCELLED }))).toMatchObject({
      kind: 'dismiss',
    });
    // Put away, the report leaves nothing to press.
    expect(auxAction(facts({ ...PARTIAL, decoderMissing: true }))).toBeNull();
    expect(announcement(facts(missing))).toBe(`Not playing ${NO_AUDIO_DECODER_MESSAGE}`);
    expect(announcement(facts({ decoderMissing: true }))).toBe('Not playing');
  });

  /**
   * A run stopped by something else asks to be tried again, but with no
   * decoder no run can make audio: the decoder is all the report says, in the
   * words the player uses where no run stopped, beside a Dismiss.
   */
  it('gives only the missing decoder for a stopped run, whatever it met', () => {
    const unstopped = auxAction(facts({ ...PARTIAL, decoderMissing: true, decoderNotice: true }));
    for (const progress of [failed(true), failed(false), CANCELLED]) {
      const stopped = facts({ ...PARTIAL, progress, decoderMissing: true, decoderNotice: true });

      expect(auxAction(stopped)).toEqual(unstopped);
      expect(auxAction(stopped)).toMatchObject({
        kind: 'dismiss',
        title: NO_AUDIO_DECODER_MESSAGE,
      });
      expect(announcement(stopped)).toBe(`Not playing ${NO_AUDIO_DECODER_MESSAGE}`);
    }
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
    expect(announcement(facts({ progress: QUEUED, ...PARTIAL }))).toContain(
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

    expect(spoken).toContain('Could not read saved audio: Disk full');
    expect(spoken).toContain('Stopped. 4 of 13 sentences ready.');
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
