import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import {
  configurePlaybackBed,
  orderedSentences,
  SENTENCE_COUNT,
  settle,
  storeClips,
  type PlaybackBed,
} from '../../../testing/audio-playback-bed';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { destroyTestDatabase } from '../../../testing/test-database';

/**
 * The facade the rest of the application uses. What each unit behind it does
 * is specified next to that unit; this spec covers what only the facade does —
 * preparing, the mode control, the wiring of the player's and the media
 * session's events — and that every command reaches the unit that owns it.
 */
describe('AudioPlaybackStore', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  describe('nothing plays on its own', () => {
    it('makes no sound when a reading with a complete set is prepared', async () => {
      await storeClips(bed);

      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(true);
      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toEqual([]);
    });

    it('makes no sound when a reading with no audio is prepared', async () => {
      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.player.played).toEqual([]);
    });
  });

  describe('preparing', () => {
    it('stops one reading before preparing another', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.play();

      const other = importedReadingFixture({ seed: 9 });
      await bed.store.prepare({ ...bed.reading, id: other.reading.id, title: 'Another' });

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.currentSentenceId()).toBeNull();
    });

    it('reports a storage failure and claims nothing is playable', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      vi.spyOn(bed.enrichment, 'listAudioSummaries').mockResolvedValue(
        err(storageError('unavailable', 'audio table unavailable')),
      );

      await bed.store.prepare(bed.reading);

      expect(bed.store.failure()).toEqual({ kind: 'storage', message: 'audio table unavailable' });
      expect(bed.store.hasPlayableAudio()).toBe(false);
    });

    it('reads on from the frontier and grows an open track', async () => {
      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.store.play();

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      expect(bed.player.appended[0]).toHaveLength(1);
    });
  });

  describe('the mode cycle', () => {
    it('moves through every posture and back to the first', () => {
      expect(bed.store.mode()).toBe('continuous');
      expect(bed.store.stepMode()).toBe(false);

      bed.store.cycleMode();

      expect(bed.store.mode()).toBe('sentence');
      expect(bed.store.stepMode()).toBe(true);

      // Wrapping rather than stopping at the end: the control is pressed to
      // move on, and the posture after the last one is the first one again.
      bed.store.cycleMode();

      expect(bed.store.mode()).toBe('continuous');
    });
  });

  describe('the transport', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('walks the reading through its commands', async () => {
      const sentences = orderedSentences(bed.draft);

      await bed.store.play();
      await bed.store.next();
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);

      await bed.store.previous();
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);

      await bed.store.seekTo(SENTENCE_COUNT);
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);

      bed.store.pause();
      expect(bed.store.status()).toBe('paused');

      await bed.store.resume();
      expect(bed.store.status()).toBe('playing');

      bed.store.stop();
      expect(bed.store.status()).toBe('idle');
      expect(bed.store.currentSentenceId()).toBeNull();
      expect(bed.player.stops).toBeGreaterThan(0);
    });

    it('answers whether a sentence can be started from', () => {
      const sentences = orderedSentences(bed.draft);

      expect(bed.store.isAvailable(sentences[0].id)).toBe(true);
      expect(bed.store.isAvailable(null)).toBe(false);
    });

    it('clears a reported failure when the surface that showed it is done', async () => {
      await bed.db.audioAssets.clear();
      await storeClips(bed, SENTENCE_COUNT - 1);
      await bed.store.prepare(bed.reading);
      await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1].id);
      expect(bed.store.failure()).not.toBeNull();

      bed.store.acknowledgeFailure();

      expect(bed.store.failure()).toBeNull();
    });

    it('stops and forgets for each maintenance event', async () => {
      await bed.store.play();
      bed.store.readingAudioCleared(bed.reading.id);
      expect(bed.store.status()).toBe('idle');

      await bed.store.prepare(bed.reading);
      await bed.store.play();
      bed.store.audioCacheCleared();
      expect(bed.store.hasPlayableAudio()).toBe(false);

      await bed.store.prepare(bed.reading);
      bed.store.readingDeleted(bed.reading.id);
      expect(bed.store.reading()).toBeNull();
    });
  });

  describe('the player events', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('stops and names the sentence when the element reports an error', async () => {
      await bed.store.playFrom(orderedSentences(bed.draft)[1].id);

      bed.player.failClip();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'decode-failed', position: 2 });
    });

    it('reads on when a clip ends', async () => {
      await bed.store.play();

      bed.player.finishClip();
      await settle();

      expect(bed.store.currentPosition()).toBe(2);
    });
  });

  describe('the lock screen and headset', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('pauses, resumes, steps and stops from the media session', async () => {
      const sentences = orderedSentences(bed.draft);
      const handlers = bed.media.handlers;
      if (handlers === null) {
        throw new Error('the store should register media session handlers');
      }
      await bed.store.play();

      handlers.pause();
      expect(bed.store.status()).toBe('paused');
      expect(bed.media.playbackStates.at(-1)).toBe('paused');

      handlers.play();
      await settle();
      expect(bed.store.status()).toBe('playing');

      handlers.next();
      await settle();
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);

      handlers.previous();
      await settle();
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);

      handlers.stop();
      expect(bed.store.status()).toBe('idle');
      expect(bed.media.playbackStates.at(-1)).toBe('none');
      expect(bed.media.clears).toBeGreaterThan(0);
    });

    /** A session held at a seam has nothing to resume: a headset Play reads on. */
    it('reads on from a seam when Play is pressed on a headset', async () => {
      const sentences = orderedSentences(bed.draft);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('stepped');

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
    });

    it('seeks a continuous track to a lock-screen position', async () => {
      const sentences = orderedSentences(bed.draft);
      bed.player.sequenceSupported = true;
      await bed.store.play();

      bed.media.handlers?.seekTo(2.5);

      expect(bed.player.position).toBe(2.5);
      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);
    });
  });
});
