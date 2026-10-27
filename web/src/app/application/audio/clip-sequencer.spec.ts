import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('ClipSequencer', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  describe('local playback pace', () => {
    it('applies and persists the learner rate for playback-paced clips', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.readerPreferences.set({ ...bed.readerPreferences(), playbackRate: 0.8 });
      bed.player.sequenceSupported = true;

      await bed.store.play();

      expect(bed.player.rates.at(-1)).toBe(0.8);
      expect(bed.positionStates.at(-1)?.playbackRate).toBe(0.8);

      bed.store.setPlaybackRate(0.9);

      expect(bed.player.rates.at(-1)).toBe(0.9);
      expect(bed.setReaderPreference).toHaveBeenCalledWith('playbackRate', 0.9);
      expect(bed.positionStates.at(-1)?.playbackRate).toBe(0.9);
    });

    it('plays legacy clips with their baked pace', async () => {
      await storeClipsAt(bed, [0], 'audio/mpeg', null);
      await bed.store.prepare(bed.reading);

      await bed.sequencer.load(orderedSentences(bed.draft)[0].id);

      expect(bed.player.rates.at(-1)).toBe(1);
    });

    it('seals one pace run and continues into the next playable run', async () => {
      await storeClipsAt(bed, [0], 'audio/mpeg', null);
      await storeClipsAt(bed, [1, 2]);
      await bed.store.prepare(bed.reading);
      bed.readerPreferences.set({ ...bed.readerPreferences(), playbackRate: 0.8 });
      bed.player.sequenceSupported = true;

      await bed.store.play();
      await bed.sequencer.extend();
      expect(bed.player.closes).toBe(1);

      bed.player.finishClip();
      // Building the next run reads two clips from storage, which can take
      // longer than one task.
      await vi.waitFor(() => {
        expect(bed.store.currentPosition()).toBe(2);
      });

      expect(bed.player.sequences).toHaveLength(2);
      expect(bed.player.rates).toEqual([1, 0.8]);
      expect(bed.store.currentPosition()).toBe(2);
    });
  });

  describe('a sentence clip', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('reads the clip, plays it, and puts the sentence on the lock screen', async () => {
      const second = orderedSentences(bed.draft)[1];

      await bed.sequencer.load(second.id);

      expect(bed.player.played).toHaveLength(1);
      expect(bed.transport.status()).toBe('playing');
      expect(bed.transport.currentSentenceId()).toBe(second.id);
      expect(bed.media.metadata.at(-1)?.album).toBe(`Sentence 2 of ${String(SENTENCE_COUNT)}`);
    });

    it('names the sentence on the lock screen before saying it plays', async () => {
      await bed.sequencer.load(orderedSentences(bed.draft)[0].id);

      expect(bed.media.sequence).toEqual(['metadata', 'state:playing']);
    });

    it('stops when the learner presses Stop', async () => {
      await bed.store.play();

      bed.sequencer.stop();

      expect(bed.transport.status()).toBe('idle');
      expect(bed.transport.currentSentenceId()).toBeNull();
      expect(bed.player.stops).toBeGreaterThan(0);
    });

    it('stops and names the sentence when a clip cannot be decoded', async () => {
      await bed.store.play();
      bed.player.failNextPlay = true;

      await bed.store.next();

      expect(bed.transport.status()).toBe('idle');
      expect(bed.transport.failure()).toEqual({ kind: 'decode-failed', position: 2 });
    });

    it('stops and names the sentence when a clip has gone missing', async () => {
      await bed.store.play();
      const second = orderedSentences(bed.draft)[1];
      await bed.db.audioAssets.where('sentenceId').equals(second.id).delete();

      await bed.store.next();

      expect(bed.transport.status()).toBe('idle');
      expect(bed.transport.failure()).toEqual({ kind: 'missing-clip', position: 2 });
    });
  });

  /**
   * The seam between two sentences. Reading on is not a state the transport
   * should render, and a Pause pressed while the next clip is being read from
   * storage is a press the learner made.
   */
  describe('the load window', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('never reports loading between two sentences of one advance', async () => {
      await bed.store.play();

      bed.player.finishClip();
      // Synchronously after the clip ended, while the next one is being read.
      expect(bed.store.status()).toBe('playing');

      await settle();
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentPosition()).toBe(2);
    });

    it('reports loading for a jump the learner asked for', async () => {
      await bed.store.play();

      const jump = bed.store.next();
      expect(bed.store.status()).toBe('loading');

      await jump;
      expect(bed.store.status()).toBe('playing');
    });

    it('honours a Pause pressed while the next clip is being read', async () => {
      await bed.store.play();

      bed.player.finishClip();
      bed.sequencer.pause();
      expect(bed.store.status()).toBe('paused');

      await settle();

      expect(bed.store.status()).toBe('paused');
      expect(bed.store.currentPosition()).toBe(2);
      expect(bed.player.startedPaused.at(-1)).toBe(true);
    });

    it('starts nothing for a load a later one superseded', async () => {
      const sentences = orderedSentences(bed.draft);

      const first = bed.sequencer.load(sentences[0].id);
      const second = bed.sequencer.load(sentences[2].id);
      await Promise.all([first, second]);

      expect(bed.player.played).toHaveLength(1);
      expect(bed.transport.currentSentenceId()).toBe(sentences[2].id);
    });
  });

  describe('continuous background track', () => {
    it('loads a complete reading once and follows its native sentence boundaries', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.store.play();

      expect(bed.player.sequences).toHaveLength(1);
      expect(bed.player.sequences[0]).toHaveLength(SENTENCE_COUNT);
      expect(bed.player.played).toEqual([]);
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);

      bed.player.moveTo(2.2);
      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);

      await bed.store.next();
      expect(bed.player.position).toBe(3);
      expect(bed.store.currentSentenceId()).toBe(sentences[3].id);

      await bed.store.previous();
      expect(bed.player.position).toBe(2);
      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);
    });

    it('names the sentence on the lock screen before saying the track plays', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.sequencer.loadTrack(orderedSentences(bed.draft)[0].id);

      expect(bed.media.sequence).toEqual(['metadata', 'state:playing']);
    });

    it('loads a complete WebM reading as one native sequence', async () => {
      await storeClipsAt(bed, [0, 1, 2, 3], 'audio/webm');
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.store.play();

      expect(bed.player.sequences).toHaveLength(1);
      expect(bed.player.sequences[0]?.every((clip) => clip.mimeType === 'audio/webm')).toBe(true);
      expect(bed.player.played).toEqual([]);
    });

    it('keeps a partly generated WebM reading in one open resource', async () => {
      await storeClipsAt(bed, [0, 1], 'audio/webm');
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.store.play();
      await storeClipsAt(bed, [2], 'audio/webm');
      await bed.store.prepare(bed.reading);

      expect(bed.player.sequences[0]?.every((clip) => clip.mimeType === 'audio/webm')).toBe(true);
      expect(bed.player.appended[0]?.every((clip) => clip.mimeType === 'audio/webm')).toBe(true);
      expect(bed.player.sequenceOpen()).toBe(true);
      expect(bed.player.played).toEqual([]);
    });

    /**
     * A resource that starts partway through the reading indexes from its own
     * first sentence, so every boundary the store reads is offset from the
     * reading's. Getting that wrong highlights the wrong sentence and seeks to
     * the wrong place, and it is invisible while a resource always starts at
     * sentence one.
     */
    it('maps positions from the sentence the resource starts at', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.store.playFrom(sentences[2].id);

      expect(bed.player.sequences[0]).toHaveLength(2);
      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);

      bed.player.moveTo(1.2);
      expect(bed.store.currentSentenceId()).toBe(sentences[3].id);

      // Sentence 2 is not in this resource. Aiming at it builds one from there
      // rather than seeking into audio the element does not have.
      await bed.store.seekTo(2);

      expect(bed.player.sequences).toHaveLength(2);
      expect(bed.player.sequences[1]).toHaveLength(3);
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.player.played).toEqual([]);
    });

    it('falls back to sentence clips where the browser cannot build a track', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      await bed.sequencer.loadTrack(orderedSentences(bed.draft)[0].id);

      expect(bed.player.sequences).toEqual([]);
      expect(bed.player.played).toHaveLength(1);
      expect(bed.sequencer.hasTrack()).toBe(false);
      expect(bed.transport.status()).toBe('playing');
    });

    it('keeps one-sentence mode on the sentence path even with a complete set', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      bed.store.setStepMode(true);

      await bed.store.play();

      expect(bed.player.sequences).toEqual([]);
      expect(bed.player.played).toHaveLength(1);
    });

    it('changes a live continuous track without leaking into or skipping the next sentence', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.store.play();
      bed.player.moveTo(0.6);

      bed.store.setStepMode(true);
      await settle();

      expect(bed.player.pauses).toBe(1);
      expect(bed.player.played).toHaveLength(1);
      expect(bed.player.startedAt).toEqual([0.6]);
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);

      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('stepped');
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);

      await bed.store.continueReading();
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.player.startedAt).toEqual([0.6, 0]);
    });

    it('keeps a paused track paused at the same point when sentence mode is selected', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.store.play();
      bed.player.moveTo(0.4);
      bed.store.pause();

      bed.store.setStepMode(true);
      await settle();

      expect(bed.store.status()).toBe('paused');
      expect(bed.player.startedPaused).toEqual([false, true]);
      expect(bed.player.startedAt).toEqual([0.4]);
    });

    it('clamps a lock-screen scrub to what the track holds', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
      await bed.store.play();

      bed.sequencer.seekTime(99);

      expect(bed.player.position).toBe(SENTENCE_COUNT);
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);
    });
  });

  /**
   * A reading started while it is still being generated used to be sentence by
   * sentence for the whole session, and advancing between two sentences is
   * JavaScript — an event handler, a read from storage, a new source — which a
   * locked Android screen may never run. The resource is therefore built over
   * the clips that exist and left open, and each sentence is appended to it as
   * it is stored, so the element never goes quiet at a seam.
   */
  describe('a track that grows while it is generated', () => {
    beforeEach(async () => {
      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;
    });

    it('starts a partly generated reading on a resource left open', async () => {
      await bed.store.play();

      expect(bed.player.sequences[0]).toHaveLength(2);
      expect(bed.player.sequenceOpen()).toBe(true);
      expect(bed.player.played).toEqual([]);
      expect(bed.store.status()).toBe('playing');
      expect(bed.sequencer.nextToAppend()).toBe(2);
    });

    it('appends each sentence as it is stored, without loading a second clip', async () => {
      await bed.store.play();

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      expect(bed.player.appended[0]).toHaveLength(1);
      expect(bed.player.sequences[0]).toHaveLength(3);
      expect(bed.player.played).toEqual([]);
      expect(bed.player.sequenceOpen()).toBe(true);
    });

    it('seals the resource once the last sentence has been appended', async () => {
      await bed.store.play();

      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      expect(bed.player.sequences[0]).toHaveLength(SENTENCE_COUNT);
      expect(bed.player.closes).toBe(1);
      expect(bed.player.sequenceOpen()).toBe(false);
      expect(bed.sequencer.nextToAppend()).toBeNull();
    });

    it('seals only once', async () => {
      await bed.store.play();

      bed.sequencer.seal();
      bed.sequencer.seal();

      expect(bed.player.closes).toBe(1);
    });

    it('keeps fallback clips in an existing resource after a voice change', async () => {
      await bed.store.play();

      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));
      await bed.store.prepare(bed.reading);

      expect(bed.player.closes).toBe(0);
      expect(bed.player.sequences[0]).toHaveLength(2);
      expect(bed.player.sequenceOpen()).toBe(true);
    });

    it('seals when a clip already in the resource is regenerated', async () => {
      await bed.store.play();

      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));
      await bed.store.prepare(bed.reading);
      await storeClipsAt(bed, [0]);
      await bed.store.prepare(bed.reading);

      expect(bed.player.closes).toBe(1);
      expect(bed.player.sequences[0]).toHaveLength(2);
    });

    it('seals rather than failing the session when an append is refused', async () => {
      await bed.store.play();
      await storeClips(bed, 3);
      bed.player.failNextExtend = true;

      await bed.store.prepare(bed.reading);

      expect(bed.player.closes).toBe(1);
      expect(bed.player.sequences[0]).toHaveLength(2);
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.failure()).toBeNull();
    });

    /**
     * A WAV container states its own length, so a partial one could never grow
     * and the session would end at the frontier with no way on. The
     * per-sentence path waits there instead.
     */
    it('keeps a partly generated WAV reading on the sentence path', async () => {
      await bed.db.audioAssets.clear();
      await storeClipsAt(bed, [0, 1], 'audio/wav');
      await bed.store.prepare(bed.reading);

      await bed.store.play();

      expect(bed.player.sequences).toEqual([]);
      expect(bed.player.played).toHaveLength(1);
    });
  });
});
