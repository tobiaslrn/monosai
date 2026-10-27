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

describe('PlaybackNavigator', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  describe('starting against a partial set', () => {
    /**
     * The change ADR 0034 makes: a reading with one clip missing at the end is
     * still a reading that can be listened to from the beginning. Waiting for
     * the last clip before allowing the first is the thing progressive playback
     * exists to stop doing.
     */
    it('starts from the beginning as soon as sentence one exists', async () => {
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);

      await bed.navigator.play();

      expect(bed.player.played).toHaveLength(1);
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.hasPlayableAudio()).toBe(true);
      expect(bed.store.failure()).toBeNull();
    });

    it('refuses, and names the sentence, when the one asked for has no clip', async () => {
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);

      await bed.navigator.startAt(orderedSentences(bed.draft)[2]!.id);

      expect(bed.player.played).toEqual([]);
      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'missing-clip', position: 3 });
    });

    /** One clip is as playable on its own whether or not its neighbours exist. */
    it('plays one sentence even when the whole set is incomplete', async () => {
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);

      await bed.navigator.playSentence(orderedSentences(bed.draft)[0]!.id);

      expect(bed.player.played).toHaveLength(1);
      expect(bed.store.status()).toBe('playing');
    });

    it('does nothing when there is nothing to play', async () => {
      await bed.store.prepare(bed.reading);

      await bed.navigator.play();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toBeNull();
    });
  });

  describe('walking the reading', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('starts at the first sentence and advances in reading order', async () => {
      const sentences = orderedSentences(bed.draft);

      await bed.navigator.play();
      expect(bed.store.currentSentenceId()).toBe(sentences[0]!.id);
      expect(bed.store.currentPosition()).toBe(1);

      for (let index = 1; index < SENTENCE_COUNT; index += 1) {
        bed.player.finishClip();
        await settle();
        expect(bed.store.currentSentenceId()).toBe(sentences[index]!.id);
      }
      expect(bed.player.played).toHaveLength(SENTENCE_COUNT);
    });

    it('starts from the sentence it was asked to start from', async () => {
      const third = orderedSentences(bed.draft)[2];

      await bed.navigator.startAt(third!.id);

      expect(bed.store.currentSentenceId()).toBe(third!.id);
      expect(bed.store.currentPosition()).toBe(3);
    });

    /**
     * Finishing is its own state. `stop()` cleared the cursor, so a reading
     * that had just been read to the end looked exactly like one that had never
     * been started: the bar dropped to zero, the highlight vanished, and the
     * last sentence could not be replayed.
     */
    it('ends at the last sentence, keeping the cursor there', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[SENTENCE_COUNT - 1]!.id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1]!.id);
      expect(bed.store.currentPosition()).toBe(SENTENCE_COUNT);
      expect(bed.store.canGoPrevious()).toBe(true);
    });

    it('replays the last sentence from a finished reading', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[SENTENCE_COUNT - 1]!.id);
      bed.player.finishClip();
      await settle();
      bed.player.position = 4;

      await bed.navigator.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1]!.id);
    });

    /**
     * The control is labelled "restart this sentence, or go back to the one
     * before". At position one it used to do neither: it tore the session down,
     * at the one position where the learner has nothing else to press.
     */
    it('restarts the first sentence rather than stopping when Back is pressed on it', async () => {
      await bed.navigator.play();

      await bed.navigator.previous();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentPosition()).toBe(1);
      expect(bed.player.restarts).toBe(1);
      expect(bed.player.played).toHaveLength(1);
    });

    /**
     * Next off the end is a press that means "the next sentence", not "end the
     * session". The transport disables it there, but a headset does not.
     */
    it('does nothing when Next is pressed at the last sentence', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[SENTENCE_COUNT - 1]!.id);

      await bed.navigator.step(1);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1]!.id);
    });

    /**
     * Why Previous is not simply "one back": the reason to reach for it is that
     * the sentence being read went past too fast, so the first press has to be
     * able to answer that.
     */
    it('replays the sentence being read before stepping back to the one before', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[1]!.id);
      bed.player.position = 4;

      await bed.navigator.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
      expect(bed.store.status()).toBe('playing');

      // Restarting put playback back at the beginning, where Previous means
      // the sentence before this one again.
      await bed.navigator.previous();

      expect(bed.store.currentSentenceId()).toBe(sentences[0]!.id);
    });

    it('steps back rather than replaying when a sentence has only just started', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[1]!.id);
      bed.player.position = 0.4;

      await bed.navigator.previous();

      expect(bed.player.restarts).toBe(0);
      expect(bed.store.currentSentenceId()).toBe(sentences[0]!.id);
    });

    it('replays from the start of a paused sentence rather than resuming it', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[1]!.id);
      bed.player.position = 4;
      bed.store.pause();

      await bed.navigator.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.status()).toBe('playing');
    });

    it('plays one sentence and stops at its end rather than reading on', async () => {
      await bed.navigator.playSentence(orderedSentences(bed.draft)[0]!.id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toHaveLength(1);
    });

    /**
     * The reader watches this to decide whether to scroll. A learner who
     * scrolled away has said where they want to look, and only an explicit
     * navigation says they want to be taken back — the automatic advance
     * between sentences does not.
     */
    it('counts explicit navigation, and never the automatic advance', async () => {
      const before = bed.store.explicitNavigation();

      await bed.navigator.play();
      expect(bed.store.explicitNavigation()).toBe(before + 1);

      bed.player.finishClip();
      await settle();
      expect(bed.store.explicitNavigation()).toBe(before + 1);

      await bed.navigator.step(1);
      expect(bed.store.explicitNavigation()).toBe(before + 2);

      await bed.navigator.previous();
      expect(bed.store.explicitNavigation()).toBe(before + 3);
    });

    /**
     * `playSentence` used to reach `load()` directly, so a sentence whose row
     * had gone tore the whole session down where `playFrom` merely named it.
     */
    it('names a missing sentence without tearing down the session', async () => {
      const third = orderedSentences(bed.draft)[2];
      await bed.db.audioAssets.where('sentenceId').equals(third!.id).delete();
      await bed.store.prepare(bed.reading);
      await bed.navigator.play();

      await bed.navigator.playSentence(third!.id);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentPosition()).toBe(1);
      expect(bed.store.failure()).toEqual({ kind: 'missing-clip', position: 3 });
    });
  });

  describe('moving around a reading with holes in it', () => {
    /** Sentences 1, 2 and 4 have clips; sentence 3 failed and was recorded. */
    beforeEach(async () => {
      await storeClipsAt(bed, [0, 1, 3]);
      await bed.store.prepare(bed.reading);
    });

    it('skips the hole rather than treating it as a wall', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[1]!.id);

      expect(bed.store.canGoNext()).toBe(true);
      await bed.navigator.step(1);

      expect(bed.store.currentSentenceId()).toBe(sentences[3]!.id);
      expect(bed.store.currentPosition()).toBe(4);
    });

    it('steps back across the hole as well', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.navigator.startAt(sentences[3]!.id);
      bed.player.position = 0;

      await bed.navigator.previous();

      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
    });

    /**
     * Clips arrive out of order, so a run can leave sentence one missing while
     * the rest of the reading is ready. Gating Play on the first sentence left
     * the learner with no way into audio they had already paid for.
     */
    it('starts at the first sentence that has a clip', async () => {
      await storeClipsAt(bed, [2, 3]);
      await bed.db.audioAssets
        .where('sentenceId')
        .anyOf(
          orderedSentences(bed.draft)
            .slice(0, 2)
            .map((sentence) => sentence.id),
        )
        .delete();
      await bed.store.prepare(bed.reading);

      await bed.navigator.play();

      expect(bed.store.currentPosition()).toBe(3);
      expect(bed.store.status()).toBe('playing');
    });
  });

  /**
   * The learner hears a sentence, reads or translates it, and only then asks
   * for the next one. The session stays alive at the seam rather than ending
   * there, which is what separates this from the popover's one-shot play.
   */
  describe('the seam in one sentence at a time', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('holds at the seam and loads nothing until it is told to go on', async () => {
      const sentences = orderedSentences(bed.draft);
      bed.store.setStepMode(true);
      await bed.navigator.play();

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('stepped');
      expect(bed.store.currentSentenceId()).toBe(sentences[0]!.id);
      expect(bed.player.played).toHaveLength(1);
    });

    it('still ends the reading at the last sentence', async () => {
      bed.store.setStepMode(true);
      await bed.navigator.startAt(orderedSentences(bed.draft)[SENTENCE_COUNT - 1]!.id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.pendingSentenceId()).toBeNull();
    });

    /**
     * No special case: the elapsed position sits at the end of the clip that
     * just finished, which is past the replay window, so Back means what it
     * always means there.
     */
    it('replays the sentence just heard when Back is pressed at a seam', async () => {
      const sentences = orderedSentences(bed.draft);
      bed.store.setStepMode(true);
      await bed.navigator.play();
      bed.player.position = 3;
      bed.player.finishClip();
      await settle();

      await bed.navigator.previous();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[0]!.id);
      expect(bed.player.restarts).toBe(1);
    });

    it('reads on without stopping once the mode is turned off', async () => {
      bed.store.setStepMode(true);
      bed.store.setStepMode(false);
      await bed.navigator.play();

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.player.played).toHaveLength(2);
    });
  });

  describe('seeking along the track', () => {
    it('jumps a live session to the sentence it was dropped on', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.navigator.play();

      await bed.navigator.seekTo(3);

      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
      expect(bed.store.status()).toBe('playing');
    });

    it('seeks inside a continuous track without building another', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.navigator.play();

      await bed.navigator.seekTo(3);

      expect(bed.player.sequences).toHaveLength(1);
      expect(bed.player.position).toBe(2);
      expect(bed.store.currentSentenceId()).toBe(sentences[2]!.id);
    });

    it('names the sentence a step lands on before saying it plays', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.navigator.play();
      bed.media.sequence.length = 0;

      await bed.navigator.step(1);

      expect(bed.player.sequences).toHaveLength(1);
      expect(bed.media.metadata.at(-1)?.album).toBe(`Sentence 2 of ${String(SENTENCE_COUNT)}`);
      expect(bed.media.sequence).toEqual(['metadata', 'state:playing']);
    });

    /**
     * Aiming is not playing. Dragging the track of a reading that is not being
     * read says where to start, and starting is still the press of Play.
     */
    it('only moves the cursor while nothing is playing', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      await bed.navigator.seekTo(2);

      expect(bed.store.currentSentenceId()).toBe(sentences[1]!.id);
      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toHaveLength(0);
    });

    /** A hole is somewhere the drag passes over, not somewhere it lands. */
    it('snaps to the nearest sentence that has a clip', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClipsAt(bed, [0, 3]);
      await bed.store.prepare(bed.reading);

      await bed.navigator.seekTo(3);

      expect(bed.store.currentSentenceId()).toBe(sentences[3]!.id);
    });

    it('clamps a position outside the reading, and does nothing without audio', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.prepare(bed.reading);

      await bed.navigator.seekTo(99);

      expect(bed.store.currentSentenceId()).toBeNull();

      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.navigator.seekTo(99);

      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1]!.id);
    });
  });
});
