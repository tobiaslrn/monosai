import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioOptionsFingerprint } from '../../domain/enrichment/cache-keys';
import { assetId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { err } from '../../domain/shared/result';
import {
  configurePlaybackBed,
  keyFor,
  orderedSentences,
  PLAYBACK_NOW,
  SENTENCE_COUNT,
  storeClips,
  storeClipsAt,
  TEST_HASHER,
  type PlaybackBed,
} from '../../../testing/audio-playback-bed';
import { importedReadingFixture, uuid } from '../../../testing/persistence-fixtures';
import { destroyTestDatabase } from '../../../testing/test-database';

describe('PlaybackClipsStore', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  /**
   * Clips are keyed by the configuration that produced them, but playback can
   * use the newest same-content row while current-settings coverage remains
   * honest.
   */
  describe('audio saved in other settings', () => {
    it('plays the newest matching stored clip while coverage stays current-only', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);
      expect(bed.clips.hasStaleAudio()).toBe(false);

      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.availableCount()).toBe(0);
      expect(bed.clips.hasStaleAudio()).toBe(true);
      expect(bed.clips.hasPlayableAudio()).toBe(true);
      await bed.store.play();
      expect(bed.player.played).toHaveLength(1);
    });

    it('uses the newest summary for a content hash', async () => {
      await storeClipsAt(bed, [0]);
      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-c' }));
      await storeClipsAt(bed, [0]);
      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));

      await bed.clips.refresh(bed.reading);
      const first = orderedSentences(bed.draft)[0];

      expect(bed.clips.clipFor(first!.id)?.stale).toBe(true);
      await bed.store.playSentence(first!.id);
      const newest = await bed.enrichment.getAudioByCacheKey(
        keyFor(bed, first!.contentHash, 'voice-c'),
      );
      expect(newest.ok && newest.value).not.toBeNull();
      expect(await bed.player.played[0]?.text()).toBe(
        await (newest.ok ? newest.value?.blob.text() : Promise.resolve('')),
      );
    });

    it('does not fall back after a sentence was edited', async () => {
      const sentence = orderedSentences(bed.draft)[0];
      await bed.enrichment.storeAudio(
        {
          id: assetId(uuid(8900)),
          sentenceId: sentence!.id,
          readingId: bed.reading.id,
          sourceContentHash: 'hash-for-old-text',
          modelId: bed.settings().modelId,
          voiceId: 'voice-old',
          optionsFingerprint: 'old-options',
          mimeType: 'audio/mpeg',
          byteLength: 4,
          blob: new Blob(['old'], { type: 'audio/mpeg' }),
          cacheKey: 'old-edited-cache-key',
          createdAt: PLAYBACK_NOW + 100,
        },
        new Map(),
      );

      await bed.clips.refresh(bed.reading);

      expect(bed.clips.hasPlayableAudio()).toBe(false);
      expect(bed.clips.isAvailable(sentence!.id)).toBe(false);
    });

    it('reports them when the configuration is not ready, while keeping them playable', async () => {
      await storeClips(bed);
      bed.readiness.set('stale-test');

      await bed.clips.refresh(bed.reading);

      expect(bed.clips.availableCount()).toBe(0);
      expect(bed.clips.hasStaleAudio()).toBe(true);
      expect(bed.clips.hasPlayableAudio()).toBe(true);
    });

    it('uses a regenerated current clip instead of its fallback', async () => {
      await storeClipsAt(bed, [0]);
      bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));
      await bed.clips.refresh(bed.reading);
      expect(bed.clips.hasStaleAudio()).toBe(true);

      await storeClipsAt(bed, [0]);
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.availableCount()).toBe(1);
      expect(bed.clips.hasStaleAudio()).toBe(false);
    });

    it('reports nothing for a reading that has no clips anywhere', async () => {
      bed.readiness.set('stale-test');

      await bed.clips.refresh(bed.reading);

      expect(bed.clips.hasStaleAudio()).toBe(false);
    });

    it('marks clips stored without a pace as baked', async () => {
      await storeClipsAt(bed, [0], 'audio/mpeg', null);

      await bed.clips.refresh(bed.reading);

      expect(bed.clips.clipFor(orderedSentences(bed.draft)[0]!.id)?.pace).toBe('baked');
    });
  });

  describe('coverage of a partial set', () => {
    it('reports how many sentences are ready to play', async () => {
      await storeClips(bed, 2);
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.availableCount()).toBe(2);
      expect(bed.clips.missingCount()).toBe(SENTENCE_COUNT - 2);
      expect(bed.clips.hasPlayableAudio()).toBe(true);
    });

    it('keeps current coverage while a same-configuration refresh is pending', async () => {
      await storeClips(bed, 2);
      await bed.clips.refresh(bed.reading);

      let releaseSummaries!: () => void;
      const summariesGate = new Promise<void>((resolve) => {
        releaseSummaries = resolve;
      });
      let summariesRequested!: () => void;
      const summariesStarted = new Promise<void>((resolve) => {
        summariesRequested = resolve;
      });
      const originalListAudioSummaries = bed.enrichment.listAudioSummaries.bind(bed.enrichment);
      const listAudioSummaries = vi.spyOn(bed.enrichment, 'listAudioSummaries');
      listAudioSummaries.mockImplementation(async (readingId) => {
        summariesRequested();
        await summariesGate;
        return originalListAudioSummaries(readingId);
      });

      const refresh = bed.clips.refresh(bed.reading);
      await summariesStarted;

      expect(bed.clips.availableCount()).toBe(2);

      releaseSummaries();
      await refresh;
      expect(bed.clips.availableCount()).toBe(2);
    });

    it('opens the completeness figure once the last clip exists', async () => {
      await storeClips(bed, SENTENCE_COUNT - 1);
      await bed.clips.refresh(bed.reading);
      expect(bed.clips.canPlayWholeReading()).toBe(false);

      await storeClips(bed);
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.missingCount()).toBe(0);
      expect(bed.clips.canPlayWholeReading()).toBe(true);
    });

    /**
     * Clips produced by a voice the learner no longer uses are valid historical
     * output, and must not count toward current completeness
     * (`domain-and-data-model.md` section 6).
     */
    it('discounts every clip when the voice changes under a complete set', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);
      expect(bed.clips.canPlayWholeReading()).toBe(true);

      bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.canPlayWholeReading()).toBe(false);
      expect(bed.clips.hasStaleAudio()).toBe(true);
    });

    it('counts nothing when no tested configuration exists at all', async () => {
      await storeClips(bed);
      bed.readiness.set('not-configured');

      await bed.clips.refresh(bed.reading);

      expect(bed.clips.canPlayWholeReading()).toBe(false);
      expect(bed.clips.hasPlayableAudio()).toBe(true);
    });

    /**
     * The audio table is keyed by `cacheKey`, so two sentences with identical
     * Japanese share one clip and one row. Counting rows per sentence left the
     * second of them permanently uncovered and the gate permanently shut, on a
     * reading that had in fact been fully prepared. Sentences like `はい。`
     * repeat in real Japanese text, so this was not a corner case.
     */
    it('opens for a reading whose sentences share one clip', async () => {
      // Two sentences, identical Japanese, therefore one content hash, one
      // cache key, and one stored row for both.
      const duplicates = importedReadingFixture({
        seed: 5,
        paragraphTexts: [['はい。', 'はい。']],
      });
      await bed.readings.saveImportedReading(duplicates);
      const loaded = await bed.readings.getReading(duplicates.reading.id);
      if (!loaded.ok || loaded.value === null) {
        throw new Error('the duplicate fixture should save');
      }
      const shared = keyFor(bed, duplicates.sentences[0]!.contentHash);
      expect(keyFor(bed, duplicates.sentences[1]!.contentHash)).toBe(shared);

      await bed.enrichment.storeAudio(
        {
          id: assetId(uuid(8200)),
          sentenceId: duplicates.sentences[0]!.id,
          readingId: duplicates.reading.id,
          sourceContentHash: duplicates.sentences[0]!.contentHash,
          modelId: bed.settings().modelId,
          voiceId: bed.settings().voiceId,
          optionsFingerprint: audioOptionsFingerprint(TEST_HASHER, {
            responseFormat: 'mp3',
            speechStyle: bed.settings().speechStyle,
            speechPace: bed.settings().speechPace,
          }),
          pace: 'playback',
          mimeType: 'audio/mpeg',
          byteLength: 4,
          blob: new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'audio/mpeg' }),
          cacheKey: shared,
          createdAt: PLAYBACK_NOW,
        },
        new Map(duplicates.sentences.map((entry) => [entry.id, shared])),
      );

      await bed.clips.refresh(loaded.value);

      expect(bed.clips.sentenceCount()).toBe(2);
      expect(bed.clips.missingCount()).toBe(0);
      expect(bed.clips.canPlayWholeReading()).toBe(true);
    });
  });

  describe('refreshing', () => {
    it('names the reading at once, before anything has been read', () => {
      void bed.clips.refresh(bed.reading);

      expect(bed.clips.reading()).toBe(bed.reading);
    });

    /**
     * The reader re-runs a refresh on every stored sentence, so two are in
     * flight routinely. An older, smaller set settling last would move the
     * frontier backwards.
     */
    it('lets the latest refresh win over one it overtook', async () => {
      await storeClips(bed);
      const older = bed.clips.refresh(bed.reading);
      const newer = bed.clips.refresh(bed.reading);

      expect(await older).toEqual({ kind: 'superseded' });
      expect(await newer).toEqual({ kind: 'refreshed' });
      expect(bed.clips.availableCount()).toBe(SENTENCE_COUNT);
    });

    it('claims nothing is playable when stored audio cannot be read', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);
      vi.spyOn(bed.enrichment, 'listAudioSummaries').mockResolvedValue(
        err(storageError('unavailable', 'audio table unavailable')),
      );

      const refreshed = await bed.clips.refresh(bed.reading);

      expect(refreshed).toEqual({ kind: 'failed', message: 'audio table unavailable' });
      expect(bed.clips.hasPlayableAudio()).toBe(false);
      expect(bed.clips.hasStaleAudio()).toBe(false);
      expect(bed.clips.availableCount()).toBe(0);
    });

    it('claims nothing is playable when the sentences cannot be read', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);
      vi.spyOn(bed.readings, 'listSentenceRefs').mockResolvedValue(
        err(storageError('unavailable', 'sentences unavailable')),
      );

      const refreshed = await bed.clips.refresh(bed.reading);

      expect(refreshed).toEqual({ kind: 'failed', message: 'sentences unavailable' });
      expect(bed.clips.hasPlayableAudio()).toBe(false);
    });
  });

  describe('forgetting', () => {
    it('forgets clips but keeps the reading and its sentences', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);

      bed.clips.forgetClips();

      expect(bed.clips.hasPlayableAudio()).toBe(false);
      expect(bed.clips.canPlayWholeReading()).toBe(false);
      expect(bed.clips.sentenceCount()).toBe(SENTENCE_COUNT);
      expect(bed.clips.reading()?.id).toBe(bed.reading.id);
    });

    it('forgets the reading along with its clips', async () => {
      await storeClips(bed);
      await bed.clips.refresh(bed.reading);

      bed.clips.forgetReading();

      expect(bed.clips.reading()).toBeNull();
      expect(bed.clips.sentenceCount()).toBe(0);
      expect(bed.clips.hasPlayableAudio()).toBe(false);
    });
  });

  /** Sentences 1, 2 and 4 have clips; sentence 3 failed and was recorded. */
  describe('searching a reading with holes in it', () => {
    beforeEach(async () => {
      await storeClipsAt(bed, [0, 1, 3]);
      await bed.clips.refresh(bed.reading);
    });

    it('finds the next sentence with a clip across the hole, both ways', () => {
      const sentences = orderedSentences(bed.draft);

      expect(bed.clips.availableIndexFrom(sentences[1]!.id, 1)).toBe(3);
      expect(bed.clips.availableIndexFrom(sentences[3]!.id, -1)).toBe(1);
      expect(bed.clips.availableIndexFrom(sentences[3]!.id, 1)).toBe(-1);
      expect(bed.clips.availableIndexFrom(null, 1)).toBe(-1);
    });

    it('snaps to the nearest sentence with a clip, preferring the one before', () => {
      expect(bed.clips.nearestAvailableIndex(2)).toBe(1);
      expect(bed.clips.nearestAvailableIndex(3)).toBe(3);
    });

    it('stops a contiguous run at the hole', () => {
      expect(bed.clips.contiguousRunFrom(0)).toHaveLength(2);
      expect(bed.clips.contiguousRunFrom(2)).toEqual([]);
      expect(bed.clips.contiguousRunFrom(3)).toHaveLength(1);
    });

    it('names the first sentence with a clip', async () => {
      await bed.db.audioAssets
        .where('sentenceId')
        .equals(orderedSentences(bed.draft)[0]!.id)
        .delete();
      await bed.clips.refresh(bed.reading);

      expect(bed.clips.firstAvailable()).toBe(orderedSentences(bed.draft)[1]!.id);
    });
  });

  it('stops a contiguous run where the pace changes', async () => {
    await storeClipsAt(bed, [0], 'audio/mpeg', null);
    await storeClipsAt(bed, [1, 2, 3]);
    await bed.clips.refresh(bed.reading);

    expect(bed.clips.contiguousRunFrom(0)).toHaveLength(1);
    expect(bed.clips.contiguousRunFrom(1)).toHaveLength(3);
  });
});
