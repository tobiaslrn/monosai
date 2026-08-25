import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audioCacheKey, audioOptionsFingerprint } from '../../domain/enrichment/cache-keys';
import type { AudioAsset } from '../../domain/enrichment/records';
import type { Reading } from '../../domain/reading/reading';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import type { TtsSettings } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { assetId, type SentenceId } from '../../domain/shared/ids';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../../infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { importedReadingFixture, uuid } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { ENRICHMENT_REPOSITORY, HASHER, READING_REPOSITORY } from '../shared/repository-tokens';
import { TtsStore } from '../settings/tts.store';
import { AUDIO_PLAYER, type AudioPlayer } from './audio-player';
import { AudioPlaybackStore } from './audio-playback.store';
import { MEDIA_SESSION, NO_MEDIA_SESSION } from './media-session';

const NOW = 1_700_600_000_000;
const SENTENCE_COUNT = 4;
const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/**
 * A player that records rather than plays.
 *
 * "Nothing plays without an explicit call" is the claim the whole milestone
 * rests on, and it is only a testable claim because the element sits behind
 * this port (ADR 0024). `played` is the ledger of every clip that reached it.
 */
class FakeAudioPlayer implements AudioPlayer {
  readonly played: Blob[] = [];
  stops = 0;
  pauses = 0;
  resumes = 0;
  restarts = 0;
  /** How far into the loaded clip playback has reached, as the element reports. */
  position = 0;
  /** Set to make the next `play` reject, standing in for an undecodable clip. */
  failNextPlay = false;

  private ended: (() => void) | null = null;

  play(clip: Blob): Promise<void> {
    if (this.failNextPlay) {
      this.failNextPlay = false;
      return Promise.reject(new Error('not decodable'));
    }
    this.played.push(clip);
    return Promise.resolve();
  }

  pause(): void {
    this.pauses += 1;
  }

  resume(): Promise<void> {
    this.resumes += 1;
    return Promise.resolve();
  }

  elapsed(): number {
    return this.position;
  }

  restart(): Promise<void> {
    this.restarts += 1;
    this.position = 0;
    return Promise.resolve();
  }

  stop(): void {
    this.stops += 1;
  }

  onEnded(handler: () => void): void {
    this.ended = handler;
  }

  onError(): void {
    // The decode failure this spec exercises arrives as a rejected `play`.
  }

  /** Ends the clip that is loaded, as the element's `ended` event would. */
  finishClip(): void {
    this.ended?.();
  }
}

interface PlaybackBed {
  readonly db: MonosaiDatabase;
  readonly store: AudioPlaybackStore;
  readonly player: FakeAudioPlayer;
  readonly enrichment: DexieEnrichmentRepository;
  readonly readings: DexieReadingRepository;
  readonly draft: ImportedReadingDraft;
  readonly reading: Reading;
  readonly settings: WritableSignal<TtsSettings>;
  readonly readiness: WritableSignal<'ready' | 'not-configured' | 'stale-test'>;
}

async function configure(): Promise<PlaybackBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const readings = new DexieReadingRepository(db, clock);
  const enrichment = new DexieEnrichmentRepository(db);
  const draft = importedReadingFixture({
    paragraphTexts: [
      ['文0です。', '文1です。'],
      ['文2です。', '文3です。'],
    ],
  });
  await readings.saveImportedReading(draft);

  const settings = signal<TtsSettings>({
    modelId: 'vendor/tts',
    voiceId: 'voice-a',
    speed: 1,
    lastTestFingerprint: 'fingerprint',
    lastTestedAt: NOW,
    activePresetId: null,
    presets: [],
  });
  const readiness = signal<'ready' | 'not-configured' | 'stale-test'>('ready');
  const player = new FakeAudioPlayer();

  TestBed.configureTestingModule({
    providers: [
      AudioPlaybackStore,
      { provide: READING_REPOSITORY, useValue: readings },
      { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
      { provide: HASHER, useValue: TEST_HASHER },
      { provide: AUDIO_PLAYER, useValue: player },
      { provide: MEDIA_SESSION, useValue: NO_MEDIA_SESSION },
      { provide: TtsStore, useValue: { settings, readiness } },
    ],
  });

  const loaded = await readings.getReading(draft.reading.id);
  if (!loaded.ok || loaded.value === null) {
    throw new Error('fixture reading did not save');
  }

  return {
    db,
    store: TestBed.inject(AudioPlaybackStore),
    player,
    enrichment,
    readings,
    draft,
    reading: loaded.value,
    settings,
    readiness,
  };
}

/**
 * Lets the automatic advance finish.
 *
 * Advancing loads the next clip from storage, so it is a real asynchronous
 * round trip rather than a microtask.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The sentences in reading order, which is playback order. */
function orderedSentences(draft: ImportedReadingDraft) {
  return [...draft.sentences].sort(
    (left, right) => left.positionInReading - right.positionInReading,
  );
}

function keyFor(bed: PlaybackBed, contentHash: string, voiceId = 'voice-a'): string {
  const settings = bed.settings();
  return audioCacheKey(
    TEST_HASHER,
    contentHash,
    settings.modelId,
    voiceId,
    audioOptionsFingerprint(TEST_HASHER, { responseFormat: 'mp3', speed: settings.speed }),
  );
}

/** Writes clips for the first `count` sentences under the current voice. */
async function storeClips(bed: PlaybackBed, count = SENTENCE_COUNT): Promise<void> {
  const sentences = orderedSentences(bed.draft);
  const cacheKeys = new Map<SentenceId, string>(
    sentences.map((sentence) => [sentence.id, keyFor(bed, sentence.contentHash)]),
  );
  for (const [index, sentence] of sentences.slice(0, count).entries()) {
    const asset: AudioAsset = {
      id: assetId(uuid(8100 + index)),
      sentenceId: sentence.id,
      readingId: bed.draft.reading.id,
      sourceContentHash: sentence.contentHash,
      modelId: bed.settings().modelId,
      voiceId: bed.settings().voiceId,
      optionsFingerprint: audioOptionsFingerprint(TEST_HASHER, {
        responseFormat: 'mp3',
        speed: bed.settings().speed,
      }),
      mimeType: 'audio/mpeg',
      byteLength: 4,
      blob: new Blob([new Uint8Array([1, 2, 3, index])], { type: 'audio/mpeg' }),
      cacheKey: keyFor(bed, sentence.contentHash),
      createdAt: NOW + index,
    };
    await bed.enrichment.storeAudio(asset, cacheKeys);
  }
}

describe('AudioPlaybackStore', () => {
  let bed: PlaybackBed;

  beforeEach(async () => {
    bed = await configure();
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

  describe('the complete-set gate', () => {
    it('refuses to start with one clip missing, and names how many', async () => {
      await storeClips(bed, SENTENCE_COUNT - 1);
      await bed.store.prepare(bed.reading);

      await bed.store.play();

      expect(bed.player.played).toEqual([]);
      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'incomplete', missing: 1 });
    });

    it('opens once the last clip exists', async () => {
      await storeClips(bed, SENTENCE_COUNT - 1);
      await bed.store.prepare(bed.reading);
      expect(bed.store.canPlayWholeReading()).toBe(false);

      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      expect(bed.store.missingCount()).toBe(0);
      expect(bed.store.canPlayWholeReading()).toBe(true);
    });

    /**
     * Clips produced by a voice the learner no longer uses are valid historical
     * output, and must not count toward current completeness
     * (`domain-and-data-model.md` section 6).
     */
    it('shuts again when the voice changes under a complete set', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      expect(bed.store.canPlayWholeReading()).toBe(true);

      bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.missingCount()).toBe(SENTENCE_COUNT);
    });

    it('shuts when no tested configuration exists at all', async () => {
      await storeClips(bed);
      bed.readiness.set('not-configured');

      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(false);
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
      const shared = keyFor(bed, duplicates.sentences[0].contentHash);
      expect(keyFor(bed, duplicates.sentences[1].contentHash)).toBe(shared);

      await bed.enrichment.storeAudio(
        {
          id: assetId(uuid(8200)),
          sentenceId: duplicates.sentences[0].id,
          readingId: duplicates.reading.id,
          sourceContentHash: duplicates.sentences[0].contentHash,
          modelId: bed.settings().modelId,
          voiceId: bed.settings().voiceId,
          optionsFingerprint: audioOptionsFingerprint(TEST_HASHER, {
            responseFormat: 'mp3',
            speed: bed.settings().speed,
          }),
          mimeType: 'audio/mpeg',
          byteLength: 4,
          blob: new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'audio/mpeg' }),
          cacheKey: shared,
          createdAt: NOW,
        },
        new Map(duplicates.sentences.map((entry) => [entry.id, shared])),
      );

      await bed.store.prepare(loaded.value);

      expect(bed.store.sentenceCount()).toBe(2);
      expect(bed.store.missingCount()).toBe(0);
      expect(bed.store.canPlayWholeReading()).toBe(true);
    });

    /** One clip is as playable on its own whether or not its neighbours exist. */
    it('plays one sentence even when the whole set is incomplete', async () => {
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);

      await bed.store.playSentence(orderedSentences(bed.draft)[0].id);

      expect(bed.player.played).toHaveLength(1);
      expect(bed.store.status()).toBe('playing');
    });
  });

  describe('walking the reading', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
    });

    it('starts at the first sentence and advances in reading order', async () => {
      const sentences = orderedSentences(bed.draft);

      await bed.store.play();
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);
      expect(bed.store.currentPosition()).toBe(1);

      for (let index = 1; index < SENTENCE_COUNT; index += 1) {
        bed.player.finishClip();
        await settle();
        expect(bed.store.currentSentenceId()).toBe(sentences[index].id);
      }
      expect(bed.player.played).toHaveLength(SENTENCE_COUNT);
    });

    it('starts from the sentence it was asked to start from', async () => {
      const third = orderedSentences(bed.draft)[2];

      await bed.store.playFrom(third.id);

      expect(bed.store.currentSentenceId()).toBe(third.id);
      expect(bed.store.currentPosition()).toBe(3);
    });

    it('stops at the end of the last sentence rather than wrapping', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[SENTENCE_COUNT - 1].id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.currentSentenceId()).toBeNull();
    });

    it('stops rather than wrapping when Previous is pressed on the first sentence', async () => {
      await bed.store.play();

      await bed.store.previous();

      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toHaveLength(1);
    });

    /**
     * Why Previous is not simply "one back": the reason to reach for it is that
     * the sentence being read went past too fast, so the first press has to be
     * able to answer that.
     */
    it('replays the sentence being read before stepping back to the one before', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[1].id);
      bed.player.position = 4;

      await bed.store.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.store.status()).toBe('playing');

      // Restarting put playback back at the beginning, where Previous means
      // the sentence before this one again.
      await bed.store.previous();

      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);
    });

    it('steps back rather than replaying when a sentence has only just started', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[1].id);
      bed.player.position = 0.4;

      await bed.store.previous();

      expect(bed.player.restarts).toBe(0);
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);
    });

    it('replays from the start of a paused sentence rather than resuming it', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[1].id);
      bed.player.position = 4;
      bed.store.pause();

      await bed.store.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.status()).toBe('playing');
    });

    it('pauses and resumes without reloading the clip', async () => {
      await bed.store.play();

      bed.store.pause();
      expect(bed.store.status()).toBe('paused');

      await bed.store.resume();
      expect(bed.store.status()).toBe('playing');
      expect(bed.player.resumes).toBe(1);
      expect(bed.player.played).toHaveLength(1);
    });

    it('plays one sentence and stops at its end rather than reading on', async () => {
      await bed.store.playSentence(orderedSentences(bed.draft)[0].id);

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

      await bed.store.play();
      expect(bed.store.explicitNavigation()).toBe(before + 1);

      bed.player.finishClip();
      await settle();
      expect(bed.store.explicitNavigation()).toBe(before + 1);

      await bed.store.next();
      expect(bed.store.explicitNavigation()).toBe(before + 2);

      await bed.store.previous();
      expect(bed.store.explicitNavigation()).toBe(before + 3);
    });
  });

  describe('every stop trigger', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.play();
      expect(bed.store.status()).toBe('playing');
    });

    it('stops when the learner presses Stop', () => {
      bed.store.stop();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.currentSentenceId()).toBeNull();
      expect(bed.player.stops).toBeGreaterThan(0);
    });

    it('stops when the reading being read is deleted', () => {
      bed.store.readingDeleted(bed.reading.id);

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
    });

    it('leaves playback alone when a different reading is deleted', () => {
      bed.store.readingDeleted(importedReadingFixture({ seed: 9 }).reading.id);

      expect(bed.store.status()).toBe('playing');
    });

    it('stops when the audio cache is cleared', () => {
      bed.store.audioCacheCleared();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.failure()).toBeNull();
    });

    it('stops and names the sentence when a clip cannot be decoded', async () => {
      bed.player.failNextPlay = true;

      await bed.store.next();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'decode-failed', position: 2 });
    });

    it('stops and names the sentence when a clip has gone missing', async () => {
      const second = orderedSentences(bed.draft)[1];
      await bed.db.audioAssets.where('sentenceId').equals(second.id).delete();

      await bed.store.next();

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'missing-clip', position: 2 });
    });
  });

  it('stops one reading before preparing another', async () => {
    await storeClips(bed);
    await bed.store.prepare(bed.reading);
    await bed.store.play();

    const other = importedReadingFixture({ seed: 9 });
    await bed.store.prepare({ ...bed.reading, id: other.reading.id, title: 'Another' });

    expect(bed.store.status()).toBe('idle');
    expect(bed.store.currentSentenceId()).toBeNull();
  });

  it('clears a reported failure when the surface that showed it is done', async () => {
    await storeClips(bed, SENTENCE_COUNT - 1);
    await bed.store.prepare(bed.reading);
    await bed.store.play();
    expect(bed.store.failure()).not.toBeNull();

    bed.store.acknowledgeFailure();

    expect(bed.store.failure()).toBeNull();
  });
});
