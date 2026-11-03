import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AudioPlaybackStore } from '../app/application/audio/audio-playback.store';
import {
  AUDIO_PLAYER,
  type AudioPlayer,
  type AudioSequenceClip,
  type AudioTimeline,
  type PlayOptions,
  type SequencePlayOptions,
} from '../app/application/audio/audio-player';
import { ClipSequencer } from '../app/application/audio/clip-sequencer';
import {
  MEDIA_SESSION,
  NO_MEDIA_SESSION,
  type MediaSessionHandlers,
  type MediaSessionMetadata,
} from '../app/application/audio/media-session';
import { PlaybackClipsStore } from '../app/application/audio/playback-clips.store';
import { PlaybackMaintenance } from '../app/application/audio/playback-maintenance';
import { PlaybackNavigator } from '../app/application/audio/playback-navigator';
import { PlaybackResumption } from '../app/application/audio/playback-resumption';
import { PlaybackTransportStore } from '../app/application/audio/playback-transport.store';
import { AppSettingsStore } from '../app/application/settings/app-settings.store';
import { TtsStore } from '../app/application/settings/tts.store';
import {
  ENRICHMENT_REPOSITORY,
  HASHER,
  READING_REPOSITORY,
} from '../app/application/shared/repository-tokens';
import { audioCacheKey, audioOptionsFingerprint } from '../app/domain/enrichment/cache-keys';
import type { AudioAsset } from '../app/domain/enrichment/records';
import type { Reading } from '../app/domain/reading/reading';
import type { ImportedReadingDraft } from '../app/domain/reading/reading-repository';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
  type TtsSettings,
} from '../app/domain/settings/settings';
import { fixedClock } from '../app/domain/shared/clock';
import type { Hasher } from '../app/domain/shared/hashing';
import { assetId, type SentenceId } from '../app/domain/shared/ids';
import type { MonosaiDatabase } from '../app/infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../app/infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieReadingRepository } from '../app/infrastructure/persistence/repositories/dexie-reading.repository';
import { importedReadingFixture, uuid } from './persistence-fixtures';
import { createTestDatabase } from './test-database';

/**
 * The shared bed for the playback units in `application/audio/`.
 *
 * Every unit is exercised against a real Dexie database holding a real reading
 * and real clips, and a player that records rather than plays, because the
 * claims the units make — which clip plays, where a session waits, what is
 * appended — are claims about what storage held when they read it.
 */

export const PLAYBACK_NOW = 1_700_600_000_000;
/** Sentences in the fixture reading: two paragraphs of two. */
export const SENTENCE_COUNT = 4;
export const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/**
 * A player that records rather than plays.
 *
 * "Nothing plays without an explicit call" is the claim the whole milestone
 * rests on, and it is only a testable claim because the element sits behind
 * this port (ADR 0024). `played` is the ledger of every clip that reached it.
 */
export class FakeAudioPlayer implements AudioPlayer {
  readonly played: Blob[] = [];
  /** Whether each clip was asked for already paused, in the order they arrived. */
  readonly startedPaused: boolean[] = [];
  /** Sentence-relative position at which each standalone clip was started. */
  readonly startedAt: number[] = [];
  readonly rates: number[] = [];
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
  /** Every clip appended to the open resource after it was built, in order. */
  readonly appended: AudioSequenceClip[][] = [];
  closes = 0;
  /** Set to make the next `extendSequence` reject, standing in for a refused append. */
  failNextExtend = false;
  private trackDuration = 0;
  private open = false;

  private ended: (() => void) | null = null;
  private errored: (() => void) | null = null;
  private timeUpdate: (() => void) | null = null;
  private stalled: (() => void) | null = null;
  private resumed: (() => void) | null = null;

  play(clip: Blob, options?: PlayOptions): Promise<void> {
    if (this.failNextPlay) {
      this.failNextPlay = false;
      return Promise.reject(new Error('not decodable'));
    }
    this.played.push(clip);
    this.startedPaused.push(options?.startPaused === true);
    this.position = Math.max(options?.startSeconds ?? 0, 0);
    this.startedAt.push(this.position);
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
    this.appended.push([]);
    this.position = options?.startIndex ?? 0;
    this.trackDuration = clips.length;
    this.open = options?.open === true;
    this.startedPaused.push(options?.startPaused === true);
    return Promise.resolve(this.timeline());
  }

  extendSequence(clips: readonly AudioSequenceClip[]): Promise<AudioTimeline> {
    if (this.failNextExtend) {
      this.failNextExtend = false;
      return Promise.reject(new Error('append refused'));
    }
    if (!this.open) {
      return Promise.reject(new Error('no open sequence'));
    }
    const sequence = this.sequences.at(-1);
    const appended = this.appended.at(-1);
    if (sequence === undefined || appended === undefined) {
      return Promise.reject(new Error('no open sequence'));
    }
    sequence.push(...clips);
    appended.push(...clips);
    this.trackDuration = sequence.length;
    return Promise.resolve(this.timeline());
  }

  closeSequence(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.closes += 1;
  }

  sequenceOpen(): boolean {
    return this.open;
  }

  /** One second per sentence, which makes a boundary and its index the same number. */
  private timeline(): AudioTimeline {
    const length = this.sequences.at(-1)?.length ?? 0;
    return {
      starts: Array.from({ length }, (_, index) => index),
      duration: length,
      open: this.open,
      floor: 0,
    };
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

  onError(handler: () => void): void {
    this.errored = handler;
  }

  setRate(rate: number): void {
    this.rates.push(rate);
  }

  onTimeUpdate(handler: () => void): void {
    this.timeUpdate = handler;
  }

  onStalled(handler: () => void): void {
    this.stalled = handler;
  }

  onResumed(handler: () => void): void {
    this.resumed = handler;
  }

  /** Runs out of appended audio, as the element's `waiting` event would. */
  stall(): void {
    this.stalled?.();
  }

  /** Starts producing sound again, as the element's `playing` event would. */
  unstall(): void {
    this.resumed?.();
  }

  moveTo(seconds: number): void {
    this.position = seconds;
    this.timeUpdate?.();
  }

  /** Ends the clip that is loaded, as the element's `ended` event would. */
  finishClip(): void {
    this.ended?.();
  }

  /** Reports a media error on the loaded clip, as the element's `error` event would. */
  failClip(): void {
    this.errored?.();
  }
}

/** What reached the lock screen, in order. */
export interface MediaSessionLedger {
  handlers: MediaSessionHandlers | null;
  readonly playbackStates: ('none' | 'playing' | 'paused')[];
  readonly metadata: MediaSessionMetadata[];
  readonly positionStates: (MediaPositionState | null)[];
  clears: number;
  /** Metadata and playback-state calls interleaved, as `metadata` or `state:<state>`. */
  readonly sequence: string[];
}

export interface PlaybackBed {
  readonly db: MonosaiDatabase;
  /** The facade, which also wires the player and the media session. */
  readonly store: AudioPlaybackStore;
  readonly clips: PlaybackClipsStore;
  readonly transport: PlaybackTransportStore;
  readonly sequencer: ClipSequencer;
  readonly navigator: PlaybackNavigator;
  readonly resumption: PlaybackResumption;
  readonly maintenance: PlaybackMaintenance;
  readonly player: FakeAudioPlayer;
  readonly media: MediaSessionLedger;
  readonly enrichment: DexieEnrichmentRepository;
  readonly readings: DexieReadingRepository;
  readonly draft: ImportedReadingDraft;
  readonly reading: Reading;
  readonly settings: WritableSignal<TtsSettings>;
  readonly readiness: WritableSignal<'ready' | 'not-configured' | 'stale-test'>;
  readonly readerPreferences: WritableSignal<ReaderPreferences>;
  readonly setReaderPreference: ReturnType<typeof vi.fn>;
  readonly positionStates: (MediaPositionState | null)[];
}

export async function configurePlaybackBed(): Promise<PlaybackBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(PLAYBACK_NOW);
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
    speechStyle: 'clear',
    speechPace: 'natural',
    lastTestFingerprint: 'fingerprint',
    lastTestedAt: PLAYBACK_NOW,
    activePresetId: null,
    presets: [],
  });
  const readiness = signal<'ready' | 'not-configured' | 'stale-test'>('ready');
  const readerPreferences = signal<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const setReaderPreference = vi.fn(
    (preference: keyof ReaderPreferences, value: unknown): Promise<void> => {
      readerPreferences.update((current) => Object.assign({}, current, { [preference]: value }));
      return Promise.resolve();
    },
  );
  const media: MediaSessionLedger = {
    handlers: null,
    playbackStates: [],
    metadata: [],
    positionStates: [],
    clears: 0,
    sequence: [],
  };
  const mediaSession = {
    ...NO_MEDIA_SESSION,
    setHandlers: (handlers: MediaSessionHandlers): void => {
      media.handlers = handlers;
    },
    setMetadata: (metadata: MediaSessionMetadata): void => {
      media.metadata.push(metadata);
      media.sequence.push('metadata');
    },
    setPlaybackState: (state: 'none' | 'playing' | 'paused'): void => {
      media.playbackStates.push(state);
      media.sequence.push(`state:${state}`);
    },
    setPositionState: (state: MediaPositionState | null): void => {
      media.positionStates.push(state);
    },
    clear: (): void => {
      media.clears += 1;
    },
  };
  const player = new FakeAudioPlayer();

  TestBed.configureTestingModule({
    providers: [
      AudioPlaybackStore,
      { provide: READING_REPOSITORY, useValue: readings },
      { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
      { provide: HASHER, useValue: TEST_HASHER },
      { provide: AUDIO_PLAYER, useValue: player },
      { provide: MEDIA_SESSION, useValue: mediaSession },
      { provide: TtsStore, useValue: { settings, readiness } },
      {
        provide: AppSettingsStore,
        useValue: { readerPreferences: readerPreferences.asReadonly(), setReaderPreference },
      },
    ],
  });

  const loaded = await readings.getReading(draft.reading.id);
  if (!loaded.ok || loaded.value === null) {
    throw new Error('fixture reading did not save');
  }

  return {
    db,
    // Injected first, so the player and media session are wired as in the app.
    store: TestBed.inject(AudioPlaybackStore),
    clips: TestBed.inject(PlaybackClipsStore),
    transport: TestBed.inject(PlaybackTransportStore),
    sequencer: TestBed.inject(ClipSequencer),
    navigator: TestBed.inject(PlaybackNavigator),
    resumption: TestBed.inject(PlaybackResumption),
    maintenance: TestBed.inject(PlaybackMaintenance),
    player,
    media,
    enrichment,
    readings,
    draft,
    reading: loaded.value,
    settings,
    readiness,
    readerPreferences,
    setReaderPreference,
    positionStates: media.positionStates,
  };
}

/**
 * Lets the automatic advance finish.
 *
 * Advancing loads the next clip from storage, so it is a real asynchronous
 * round trip rather than a microtask.
 */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The sentences in reading order, which is playback order. */
export function orderedSentences(draft: ImportedReadingDraft) {
  return [...draft.sentences].sort(
    (left, right) => left.positionInReading - right.positionInReading,
  );
}

export function keyFor(
  bed: PlaybackBed,
  contentHash: string,
  voiceId = bed.settings().voiceId,
): string {
  const settings = bed.settings();
  return audioCacheKey(
    TEST_HASHER,
    contentHash,
    settings.modelId,
    voiceId,
    audioOptionsFingerprint(TEST_HASHER, {
      responseFormat: 'mp3',
      speechStyle: settings.speechStyle,
      speechPace: settings.speechPace,
    }),
  );
}

/** Writes clips for the first `count` sentences under the current voice. */
export function storeClips(bed: PlaybackBed, count = SENTENCE_COUNT): Promise<void> {
  return storeClipsAt(bed, [...Array(count).keys()]);
}

/**
 * Writes clips for exactly these positions.
 *
 * Generation retries out of order and records per-sentence failures without
 * stopping a run, so a real available set can have holes in it rather than
 * only a frontier.
 */
export async function storeClipsAt(
  bed: PlaybackBed,
  positions: readonly number[],
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/webm' = 'audio/mpeg',
  pace: AudioAsset['pace'] | null = 'playback',
): Promise<void> {
  const sentences = orderedSentences(bed.draft);
  const cacheKeys = new Map<SentenceId, string>(
    sentences.map((sentence) => [sentence.id, keyFor(bed, sentence.contentHash)]),
  );
  for (const index of positions) {
    const sentence = sentences[index];
    const asset: AudioAsset = {
      id: assetId(uuid(8100 + index)),
      sentenceId: sentence!.id,
      readingId: bed.draft.reading.id,
      sourceContentHash: sentence!.contentHash,
      modelId: bed.settings().modelId,
      voiceId: bed.settings().voiceId,
      optionsFingerprint: audioOptionsFingerprint(TEST_HASHER, {
        responseFormat: 'mp3',
        speechStyle: bed.settings().speechStyle,
        speechPace: bed.settings().speechPace,
      }),
      ...(pace === null ? {} : { pace }),
      mimeType,
      byteLength: 4,
      blob: new Blob([new Uint8Array([1, 2, 3, index])], { type: mimeType }),
      cacheKey: keyFor(bed, sentence!.contentHash),
      createdAt: PLAYBACK_NOW + index,
    };
    await bed.enrichment.storeAudio(asset, cacheKeys);
  }
}
