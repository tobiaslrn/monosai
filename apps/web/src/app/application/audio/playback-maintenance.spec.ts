import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configurePlaybackBed,
  storeClips,
  type PlaybackBed,
} from '../../../testing/audio-playback-bed';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { destroyTestDatabase } from '../../../testing/test-database';

describe('PlaybackMaintenance', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configurePlaybackBed();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  describe('every stop trigger', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.play();
      expect(bed.store.status()).toBe('playing');
    });

    it('stops when the reading being read is deleted', () => {
      bed.maintenance.readingDeleted(bed.reading.id);

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.reading()).toBeNull();
      expect(bed.store.sentenceCount()).toBe(0);
    });

    it('leaves playback alone when a different reading is deleted', () => {
      bed.maintenance.readingDeleted(importedReadingFixture({ seed: 9 }).reading.id);

      expect(bed.store.status()).toBe('playing');
    });

    it('stops when the audio cache is cleared', () => {
      bed.maintenance.audioCacheCleared();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.failure()).toBeNull();
    });

    it('stops when this reading audio is cleared', () => {
      bed.maintenance.readingAudioCleared(bed.reading.id);

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
    });

    it('keeps playing when a different reading audio is cleared', () => {
      bed.maintenance.readingAudioCleared(importedReadingFixture({ seed: 19 }).reading.id);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.canPlayWholeReading()).toBe(true);
    });
  });

  it('forgets stale clips once the clips are actually deleted', async () => {
    await storeClips(bed);
    bed.settings.update((settings) => ({ ...settings, voiceId: 'voice-b' }));
    await bed.store.prepare(bed.reading);

    bed.maintenance.readingAudioCleared(bed.reading.id);

    expect(bed.store.hasStaleAudio()).toBe(false);
  });

  it('clears a reported failure along with the cache', async () => {
    await storeClips(bed, 1);
    await bed.store.prepare(bed.reading);
    bed.transport.fail({ kind: 'missing-clip', position: 3 });

    bed.maintenance.audioCacheCleared();

    expect(bed.store.failure()).toBeNull();
  });
});
