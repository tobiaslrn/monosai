import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configurePlaybackBed,
  orderedSentences,
  SENTENCE_COUNT,
  settle,
  storeClips,
  storeClipsAt,
  type PlaybackBed,
} from '../../../testing/audio-playback-bed';
import { destroyTestDatabase } from '../../../testing/test-database';

describe('PlaybackResumption', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  /** Plays the first two sentences and runs off the end of what is stored. */
  async function playToTheFrontier(): Promise<void> {
    await bed.store.play();
    bed.player.finishClip();
    await settle();
    bed.player.finishClip();
    await settle();
  }

  describe('a paused session', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('resumes without reloading the clip', async () => {
      await bed.store.play();

      bed.store.pause();
      expect(bed.store.status()).toBe('paused');

      await bed.resumption.resume();
      expect(bed.store.status()).toBe('playing');
      expect(bed.player.resumes).toBe(1);
      expect(bed.player.played).toHaveLength(1);
    });

    it('resumes nothing that is not paused', async () => {
      await bed.store.play();

      await bed.resumption.resume();

      expect(bed.player.resumes).toBe(0);
    });

    /**
     * A browser refusing a resume it did not trace to a gesture is not an
     * undecodable clip. Reporting it as one destroyed the session and told the
     * learner their audio was broken.
     */
    it('stays paused when the browser refuses a resume', async () => {
      await bed.store.play();
      bed.store.pause();
      bed.player.failNextResume = true;

      await bed.resumption.resume();

      expect(bed.store.status()).toBe('paused');
      expect(bed.store.currentPosition()).toBe(1);
      expect(bed.store.failure()).toBeNull();
    });

    /**
     * The popover plays one sentence; the transport reads the reading. Resuming
     * from the transport used to keep the single-sentence flag, so the reading
     * stopped again at the end of that sentence with nothing explaining why.
     */
    it('reads on when a single sentence is resumed from the transport', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playSentence(sentences[0]!.id);
      bed.store.pause();

      await bed.resumption.resume(true);
      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
    });

    /**
     * A loaded machine makes every clip read take longer. Waiting for the
     * advance must not depend on how many tasks the read takes.
     */
    it('reads on however long the clip read after the seam takes', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playSentence(sentences[0]!.id);
      bed.store.pause();
      await bed.resumption.resume(true);
      const read = bed.enrichment.getAudioByCacheKey.bind(bed.enrichment);
      bed.enrichment.getAudioByCacheKey = async (cacheKey: string) => {
        const result = await read(cacheKey);
        await new Promise((resolve) => setTimeout(resolve, 0));
        return result;
      };

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
    });
  });

  /**
   * Reaching the end of what has been prepared is not the end of the reading.
   * The session waits there and reads on when the next clip is stored, which is
   * what makes generating and listening at the same time work (ADR 0034).
   */
  describe('waiting at the frontier', () => {
    beforeEach(async () => {
      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);
    });

    it('waits rather than stopping when the next clip does not exist yet', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.play();

      bed.player.finishClip();
      await settle();
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('waiting');
      // The cursor stays where the learner is, so the reader keeps showing it.
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
      expect(bed.store.pendingSentenceId()).toBe(sentences[2]!.id);
      expect(bed.store.pendingPosition()).toBe(3);
      expect(bed.player.played).toHaveLength(2);
    });

    it('reads on by itself once the clip it was waiting for is stored', async () => {
      const sentences = orderedSentences(bed.draft);
      await playToTheFrontier();
      expect(bed.store.status()).toBe('waiting');

      await storeClips(bed, 3);
      await bed.clips.refresh(bed.reading);
      await bed.resumption.continueIfPendingArrived();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
      expect(bed.store.pendingSentenceId()).toBeNull();
      expect(bed.player.played).toHaveLength(3);
    });

    it('tells the lock screen a waiting session is live, so it offers Pause', async () => {
      await playToTheFrontier();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.media.playbackStates.at(-1)).toBe('playing');
    });

    it('stays quiet when the clip lands after a lock-screen Pause while waiting', async () => {
      await playToTheFrontier();

      bed.media.handlers?.pause();
      expect(bed.store.status()).toBe('paused');
      expect(bed.media.playbackStates.at(-1)).toBe('paused');

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('paused');
      expect(bed.player.played).toHaveLength(2);
    });

    it('plays the clip that landed while paused when Play is pressed', async () => {
      const sentences = orderedSentences(bed.draft);
      await playToTheFrontier();
      bed.media.handlers?.pause();
      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
      expect(bed.player.played).toHaveLength(3);
      // The sentence that had ended is not played again.
      expect(bed.player.resumes).toBe(0);
    });

    it('waits again when Play follows Pause before the clip landed', async () => {
      const sentences = orderedSentences(bed.draft);
      await playToTheFrontier();
      bed.media.handlers?.pause();

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.store.pendingSentenceId()).toBe(sentences[2]!.id);
      expect(bed.player.resumes).toBe(0);
      expect(bed.media.playbackStates.at(-1)).toBe('playing');

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);
      await settle();
      expect(bed.store.status()).toBe('playing');
      expect(bed.player.played).toHaveLength(3);
    });

    it('lets go of a paused wait when the run that was filling it stops', async () => {
      await playToTheFrontier();
      bed.media.handlers?.pause();

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.failure()).toEqual({ kind: 'not-generated', position: 3 });
    });

    it('stays paused on a clip that landed during a paused wait when the run stops', async () => {
      const sentences = orderedSentences(bed.draft);
      await playToTheFrontier();
      bed.media.handlers?.pause();
      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('paused');
      expect(bed.store.failure()).toBeNull();

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
      expect(bed.player.played).toHaveLength(3);
      expect(bed.player.resumes).toBe(0);
    });

    it('keeps waiting while the clip it waits for has not been stored', async () => {
      await playToTheFrontier();

      await bed.resumption.continueIfPendingArrived();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.player.played).toHaveLength(2);
    });

    /**
     * The continuation belongs to a session the learner started. A clip
     * arriving while nothing is playing is metadata, and metadata makes no
     * sound.
     */
    it('makes no sound when clips arrive and nothing was started', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toEqual([]);
    });

    it('does not read on after the learner stopped a waiting session', async () => {
      await playToTheFrontier();
      bed.store.stop();

      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.pendingSentenceId()).toBeNull();
      expect(bed.player.played).toHaveLength(2);
    });

    it('offers Next only while some later sentence has a clip', async () => {
      await bed.store.play();
      expect(bed.store.canGoNext()).toBe(true);

      bed.player.finishClip();
      await settle();

      expect(bed.store.canGoNext()).toBe(false);
      await bed.store.next();
      expect(bed.player.played).toHaveLength(2);

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);
      expect(bed.store.canGoNext()).toBe(true);
    });

    it('ends at the end of the reading rather than waiting for a sentence after it', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1]!.id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.pendingSentenceId()).toBeNull();
    });

    /**
     * Nothing but the clip arriving ever left `waiting`, so a run that failed
     * or was cancelled parked the player at "Waiting for sentence N of M" for
     * good, with Play disabled, Next disabled, and no Stop in the transport.
     */
    it('lets go of a wait for a clip that is not coming', async () => {
      const sentences = orderedSentences(bed.draft);
      await playToTheFrontier();
      expect(bed.store.status()).toBe('waiting');

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.pendingSentenceId()).toBeNull();
      // The cursor stays on the sentence that was heard, so Back still works.
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
      expect(bed.store.failure()).toEqual({ kind: 'not-generated', position: 3 });
    });

    it('ignores a release when nothing is waiting', async () => {
      await bed.store.play();

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.failure()).toBeNull();
    });
  });

  /**
   * Where continuing differs from Next: Next means "take me to a sentence
   * that exists" and does nothing at the frontier, and continuing means
   * "carry on", which the reading does as soon as the clip is stored.
   */
  describe('continuing from a seam', () => {
    it('plays the next sentence when it is told to', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();

      await bed.resumption.continueReading();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
      expect(bed.player.played).toHaveLength(2);
    });

    /** A hole is not a wall here either: continuing lands on what was made. */
    it('continues across a sentence with no clip', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClipsAt(bed, [0, 2]);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('stepped');

      await bed.resumption.continueReading();

      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
    });

    it('waits at the frontier and reads on when the clip arrives', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('stepped');

      await bed.resumption.continueReading();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.store.pendingSentenceId()).toBe(sentences[1]!.id);
      expect(bed.player.played).toHaveLength(1);

      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
    });

    it('does nothing after the last sentence, where nothing is coming', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1]!.id);
      const before = bed.store.explicitNavigation();

      await bed.resumption.continueReading();

      expect(bed.store.pendingSentenceId()).toBeNull();
      expect(bed.store.explicitNavigation()).toBe(before);
    });
  });

  /**
   * Catching up with generation is a stall inside the resource, not a
   * teardown: the element holds where it ran out, and the append that follows
   * starts it again without a second Play.
   */
  describe('the frontier inside a growing track', () => {
    beforeEach(async () => {
      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
    });

    it('names the sentence it is holding for, and reads on when it arrives', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.play();

      bed.player.stall();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.store.pendingSentenceId()).toBe(sentences[2]!.id);

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);
      bed.player.unstall();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.pendingSentenceId()).toBeNull();
      expect(bed.player.played).toEqual([]);
    });

    it('holds a paused wait inside the track until Play, then waits again', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.play();
      bed.player.moveTo(1.5);
      bed.player.stall();
      expect(bed.media.playbackStates.at(-1)).toBe('playing');

      bed.media.handlers?.pause();
      expect(bed.store.status()).toBe('paused');
      expect(bed.player.pauses).toBe(1);

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.store.pendingSentenceId()).toBe(sentences[2]!.id);
    });

    it('reads on from a paused wait inside the track once the clip was appended', async () => {
      await bed.store.play();
      bed.player.moveTo(1.5);
      bed.player.stall();
      bed.media.handlers?.pause();
      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);
      expect(bed.store.status()).toBe('paused');

      bed.media.handlers?.play();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.pendingSentenceId()).toBeNull();
    });

    it('stays paused on a clip appended during a paused wait when the run stops', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.play();
      bed.player.moveTo(1.5);
      bed.player.stall();
      bed.media.handlers?.pause();
      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('paused');
      expect(bed.store.failure()).toBeNull();

      bed.media.handlers?.play();
      await settle();
      bed.player.unstall();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.pendingSentenceId()).toBeNull();
      bed.player.moveTo(2.5);
      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
    });

    it('lets go of a paused wait inside the track when its clip never came', async () => {
      await bed.store.play();
      bed.player.moveTo(1.5);
      bed.player.stall();
      bed.media.handlers?.pause();

      bed.resumption.stopExpectingClips();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.failure()).toEqual({ kind: 'not-generated', position: 3 });
    });

    it('does not wait inside a track that is paused', async () => {
      await bed.store.play();
      bed.store.pause();

      bed.resumption.noteFrontierReached();

      expect(bed.store.status()).toBe('paused');
    });

    it('seals the resource and lets go when the run that was filling it stops', async () => {
      await bed.store.play();
      bed.player.stall();

      bed.resumption.stopExpectingClips();

      expect(bed.player.closes).toBe(1);
      expect(bed.store.status()).toBe('ended');
      expect(bed.store.failure()).toEqual({ kind: 'not-generated', position: 3 });
    });
  });
});
