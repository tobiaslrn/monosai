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
import {
  AUDIO_PLAYER,
  type AudioPlayer,
  type AudioSequenceClip,
  type AudioTimeline,
  type PlayOptions,
  type SequencePlayOptions,
} from './audio-player';
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
  /** Whether each clip was asked for already paused, in the order they arrived. */
  readonly startedPaused: boolean[] = [];
  stops = 0;
  pauses = 0;
  resumes = 0;
  restarts = 0;
  /** How far into the loaded clip playback has reached, as the element reports. */
  position = 0;
  /** Set to make the next `play` reject, standing in for an undecodable clip. */
  failNextPlay = false;
  /** Set to make the next `resume` reject, standing in for the autoplay policy. */
  failNextResume = false;
  sequenceSupported = false;
  readonly sequences: AudioSequenceClip[][] = [];
  private trackDuration = 0;

  private ended: (() => void) | null = null;

  play(clip: Blob, options?: PlayOptions): Promise<void> {
    if (this.failNextPlay) {
      this.failNextPlay = false;
      return Promise.reject(new Error('not decodable'));
    }
    this.played.push(clip);
    this.startedPaused.push(options?.startPaused === true);
    return Promise.resolve();
  }

  playSequence(
    clips: readonly AudioSequenceClip[],
    options?: SequencePlayOptions,
  ): Promise<AudioTimeline> {
    if (!this.sequenceSupported) {
      return Promise.reject(new Error('sequence unsupported'));
    }
    this.sequences.push([...clips]);
    this.position = options?.startIndex ?? 0;
    this.trackDuration = clips.length;
    this.startedPaused.push(options?.startPaused === true);
    return Promise.resolve({
      starts: clips.map((_, index) => index),
      duration: clips.length,
    });
  }

  pause(): void {
    this.pauses += 1;
  }

  resume(): Promise<void> {
    if (this.failNextResume) {
      this.failNextResume = false;
      return Promise.reject(new Error('autoplay refused'));
    }
    this.resumes += 1;
    return Promise.resolve();
  }

  elapsed(): number {
    return this.position;
  }

  duration(): number {
    return this.trackDuration;
  }

  seek(seconds: number): void {
    this.position = seconds;
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

  private timeUpdate: (() => void) | null = null;

  onTimeUpdate(handler: () => void): void {
    this.timeUpdate = handler;
  }

  moveTo(seconds: number): void {
    this.position = seconds;
    this.timeUpdate?.();
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
function storeClips(bed: PlaybackBed, count = SENTENCE_COUNT): Promise<void> {
  return storeClipsAt(bed, [...Array(count).keys()]);
}

/**
 * Writes clips for exactly these positions.
 *
 * Generation retries out of order and records per-sentence failures without
 * stopping a run, so a real available set can have holes in it rather than
 * only a frontier.
 */
async function storeClipsAt(bed: PlaybackBed, positions: readonly number[]): Promise<void> {
  const sentences = orderedSentences(bed.draft);
  const cacheKeys = new Map<SentenceId, string>(
    sentences.map((sentence) => [sentence.id, keyFor(bed, sentence.contentHash)]),
  );
  for (const index of positions) {
    const sentence = sentences[index];
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

      await bed.store.play();

      expect(bed.player.played).toHaveLength(1);
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.hasPlayableAudio()).toBe(true);
      expect(bed.store.failure()).toBeNull();
    });

    it('refuses, and names the sentence, when the one asked for has no clip', async () => {
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);

      await bed.store.playFrom(orderedSentences(bed.draft)[2].id);

      expect(bed.player.played).toEqual([]);
      expect(bed.store.status()).toBe('idle');
      expect(bed.store.failure()).toEqual({ kind: 'missing-clip', position: 3 });
    });

    it('reports how many sentences are ready to play', async () => {
      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);

      expect(bed.store.availableCount()).toBe(2);
      expect(bed.store.missingCount()).toBe(SENTENCE_COUNT - 2);
      expect(bed.store.hasPlayableAudio()).toBe(true);
    });

    it('opens the completeness figure once the last clip exists', async () => {
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
    it('discounts every clip when the voice changes under a complete set', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      expect(bed.store.canPlayWholeReading()).toBe(true);

      bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.missingCount()).toBe(SENTENCE_COUNT);
      // Nothing is playable either: a clip made by a voice that is no longer
      // configured is not this reading's audio any more.
      expect(bed.store.hasPlayableAudio()).toBe(false);
    });

    it('counts nothing when no tested configuration exists at all', async () => {
      await storeClips(bed);
      bed.readiness.set('not-configured');

      await bed.store.prepare(bed.reading);

      expect(bed.store.canPlayWholeReading()).toBe(false);
      expect(bed.store.hasPlayableAudio()).toBe(false);
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

    /**
     * Finishing is its own state. `stop()` cleared the cursor, so a reading
     * that had just been read to the end looked exactly like one that had never
     * been started: the bar dropped to zero, the highlight vanished, and the
     * last sentence could not be replayed.
     */
    it('ends at the last sentence, keeping the cursor there', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[SENTENCE_COUNT - 1].id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);
      expect(bed.store.currentPosition()).toBe(SENTENCE_COUNT);
      expect(bed.store.canGoPrevious()).toBe(true);
    });

    it('replays the last sentence from a finished reading', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[SENTENCE_COUNT - 1].id);
      bed.player.finishClip();
      await settle();
      bed.player.position = 4;

      await bed.store.previous();

      expect(bed.player.restarts).toBe(1);
      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);
    });

    /**
     * The control is labelled "restart this sentence, or go back to the one
     * before". At position one it used to do neither: it tore the session down,
     * at the one position where the learner has nothing else to press.
     */
    it('restarts the first sentence rather than stopping when Back is pressed on it', async () => {
      await bed.store.play();

      await bed.store.previous();

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
      await bed.store.playFrom(sentences[SENTENCE_COUNT - 1].id);

      await bed.store.next();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);
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
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('waiting');
      // The cursor stays where the learner is, so the reader keeps showing it.
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.store.pendingSentenceId()).toBe(sentences[2].id);
      expect(bed.store.pendingPosition()).toBe(3);
      expect(bed.player.played).toHaveLength(2);
    });

    it('reads on by itself once the clip it was waiting for is stored', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('waiting');

      await storeClips(bed, 3);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);
      expect(bed.store.pendingSentenceId()).toBeNull();
      expect(bed.player.played).toHaveLength(3);
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
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      bed.player.finishClip();
      await settle();
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
      await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1].id);

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
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('waiting');

      bed.store.abandonWaiting();

      expect(bed.store.status()).toBe('ended');
      expect(bed.store.pendingSentenceId()).toBeNull();
      // The cursor stays on the sentence that was heard, so Back still works.
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.store.failure()).toEqual({ kind: 'not-generated', position: 3 });
    });

    it('ignores a release when nothing is waiting', async () => {
      await bed.store.play();

      bed.store.abandonWaiting();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.failure()).toBeNull();
    });
  });

  /**
   * The learner hears a sentence, reads or translates it, and only then asks
   * for the next one. The session stays alive at the seam rather than ending
   * there, which is what separates this from the popover's one-shot play.
   */
  describe('one sentence at a time', () => {
    it('holds at the seam and loads nothing until it is told to go on', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('stepped');
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);
      expect(bed.player.played).toHaveLength(1);
    });

    it('plays the next sentence when it is told to', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();

      await bed.store.continueReading();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
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

      await bed.store.continueReading();

      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);
    });

    /**
     * Where continuing differs from Next: Next means "take me to a sentence
     * that exists" and does nothing at the frontier, and continuing means
     * "carry on", which the reading does as soon as the clip is stored.
     */
    it('waits at the frontier and reads on when the clip arrives', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed, 1);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.finishClip();
      await settle();
      expect(bed.store.status()).toBe('stepped');

      await bed.store.continueReading();

      expect(bed.store.status()).toBe('waiting');
      expect(bed.store.pendingSentenceId()).toBe(sentences[1].id);
      expect(bed.player.played).toHaveLength(1);

      await storeClips(bed, 2);
      await bed.store.prepare(bed.reading);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
    });

    it('still ends the reading at the last sentence', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1].id);

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
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      await bed.store.play();
      bed.player.position = 3;
      bed.player.finishClip();
      await settle();

      await bed.store.previous();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[0].id);
      expect(bed.player.restarts).toBe(1);
    });

    it('reads on without stopping once the mode is turned off', async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      bed.store.setStepMode(true);
      bed.store.setStepMode(false);
      await bed.store.play();

      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.player.played).toHaveLength(2);
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

    it('stops when this reading audio is cleared', () => {
      bed.store.readingAudioCleared(bed.reading.id);

      expect(bed.store.status()).toBe('idle');
      expect(bed.store.canPlayWholeReading()).toBe(false);
    });

    it('keeps playing when a different reading audio is cleared', () => {
      bed.store.readingAudioCleared(importedReadingFixture({ seed: 19 }).reading.id);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.canPlayWholeReading()).toBe(true);
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

  /**
   * The seam between two sentences. Reading on is not a state the transport
   * should render, and a Pause pressed while the next clip is being read from
   * storage is a press the learner made.
   */
  describe('the automatic advance', () => {
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
      bed.store.pause();
      expect(bed.store.status()).toBe('paused');

      await settle();

      expect(bed.store.status()).toBe('paused');
      expect(bed.store.currentPosition()).toBe(2);
      expect(bed.player.startedPaused.at(-1)).toBe(true);
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
      await bed.store.playFrom(sentences[1].id);

      expect(bed.store.canGoNext()).toBe(true);
      await bed.store.next();

      expect(bed.store.currentSentenceId()).toBe(sentences[3].id);
      expect(bed.store.currentPosition()).toBe(4);
    });

    it('steps back across the hole as well', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.playFrom(sentences[3].id);
      bed.player.position = 0;

      await bed.store.previous();

      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
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

      await bed.store.play();

      expect(bed.store.currentPosition()).toBe(3);
      expect(bed.store.status()).toBe('playing');
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

  describe('seeking along the track', () => {
    it('jumps a live session to the sentence it was dropped on', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.play();

      await bed.store.seekTo(3);

      expect(bed.store.currentSentenceId()).toBe(sentences[2].id);
      expect(bed.store.status()).toBe('playing');
    });

    /**
     * Aiming is not playing. Dragging the track of a reading that is not being
     * read says where to start, and starting is still the press of Play.
     */
    it('only moves the cursor while nothing is playing', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClips(bed);
      await bed.store.prepare(bed.reading);

      await bed.store.seekTo(2);

      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
      expect(bed.store.status()).toBe('idle');
      expect(bed.player.played).toHaveLength(0);
    });

    /** A hole is somewhere the drag passes over, not somewhere it lands. */
    it('snaps to the nearest sentence that has a clip', async () => {
      const sentences = orderedSentences(bed.draft);
      await storeClipsAt(bed, [0, 3]);
      await bed.store.prepare(bed.reading);

      await bed.store.seekTo(3);

      expect(bed.store.currentSentenceId()).toBe(sentences[3].id);
    });

    it('clamps a position outside the reading, and does nothing without audio', async () => {
      const sentences = orderedSentences(bed.draft);
      await bed.store.prepare(bed.reading);

      await bed.store.seekTo(99);

      expect(bed.store.currentSentenceId()).toBeNull();

      await storeClips(bed);
      await bed.store.prepare(bed.reading);
      await bed.store.seekTo(99);

      expect(bed.store.currentSentenceId()).toBe(sentences[SENTENCE_COUNT - 1].id);
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

    it('keeps partial readings on the progressive sentence path', async () => {
      await storeClips(bed, SENTENCE_COUNT - 1);
      await bed.store.prepare(bed.reading);
      bed.player.sequenceSupported = true;

      await bed.store.play();

      expect(bed.player.sequences).toEqual([]);
      expect(bed.player.played).toHaveLength(1);
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
  });

  describe('failures that are not the clip', () => {
    beforeEach(async () => {
      await storeClips(bed);
      await bed.store.prepare(bed.reading);
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

      await bed.store.resume();

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
      await bed.store.playSentence(sentences[0].id);
      bed.store.pause();

      await bed.store.resume(true);
      bed.player.finishClip();
      await settle();

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentSentenceId()).toBe(sentences[1].id);
    });

    /**
     * `playSentence` used to reach `load()` directly, so a sentence whose row
     * had gone tore the whole session down where `playFrom` merely named it.
     */
    it('names a missing sentence without tearing down the session', async () => {
      await storeClipsAt(bed, [0]);
      const third = orderedSentences(bed.draft)[2];
      await bed.db.audioAssets.where('sentenceId').equals(third.id).delete();
      await bed.store.prepare(bed.reading);
      await bed.store.play();

      await bed.store.playSentence(third.id);

      expect(bed.store.status()).toBe('playing');
      expect(bed.store.currentPosition()).toBe(1);
      expect(bed.store.failure()).toEqual({ kind: 'missing-clip', position: 3 });
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
    await bed.store.playFrom(orderedSentences(bed.draft)[SENTENCE_COUNT - 1].id);
    expect(bed.store.failure()).not.toBeNull();

    bed.store.acknowledgeFailure();

    expect(bed.store.failure()).toBeNull();
  });
});
