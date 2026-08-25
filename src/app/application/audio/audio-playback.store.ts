import { Injectable, computed, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { EnrichmentKeysService } from '../enrichment/enrichment-keys.service';
import { ENRICHMENT_REPOSITORY, READING_REPOSITORY } from '../shared/repository-tokens';
import { AUDIO_PLAYER } from './audio-player';
import { MEDIA_SESSION } from './media-session';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * How far into a sentence Previous stops meaning "the sentence before".
 *
 * Past this point the learner has heard enough of this sentence to be asking
 * to hear it again — which is what a learner reaching for Previous mid-sentence
 * almost always wants, since the reason to press it is that the sentence went
 * by too fast. Before it, they are still at the seam and mean the one before.
 */
export const REPLAY_WINDOW_SECONDS = 1.5;

/**
 * Why playback stopped, when it was not the learner who stopped it.
 *
 * Each variant names the sentence it happened at, because "the reading would
 * not play" is not something a learner can act on and "sentence 14 has no clip
 * for the voice you are using now" is.
 */
export type PlaybackFailure =
  | { readonly kind: 'incomplete'; readonly missing: number }
  | { readonly kind: 'missing-clip'; readonly position: number }
  | { readonly kind: 'decode-failed'; readonly position: number }
  | { readonly kind: 'storage'; readonly message: string };

/**
 * Whole-reading playback.
 *
 * Root-provided because `system-architecture.md` section 4 lists active audio
 * playback among the few application-wide signals: sound outlives the component
 * that started it, and a per-reader instance would leave one reading playing
 * behind another. It owns the application's single `AudioPlayer`, the playback
 * cursor, and the complete-set gate.
 *
 * **Nothing here ever starts on its own.** There is no effect that plays, no
 * autoplay after preparation, and `prepare` is a pair of local reads that leave
 * the player untouched. Every clip that is heard was asked for by a call from a
 * control the learner pressed.
 */
@Injectable({ providedIn: 'root' })
export class AudioPlaybackStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly player = inject(AUDIO_PLAYER);
  private readonly mediaSession = inject(MEDIA_SESSION);

  private readonly readingSignal = signal<Reading | null>(null);
  private readonly refsSignal = signal<readonly SentenceRef[]>([]);
  private readonly cacheKeysSignal = signal<ReadonlyMap<SentenceId, string>>(new Map());
  /** Sentences with a stored clip under the current key. Metadata only. */
  private readonly availableSignal = signal<ReadonlySet<SentenceId>>(new Set());
  private readonly statusSignal = signal<PlaybackStatus>('idle');
  private readonly currentSignal = signal<SentenceId | null>(null);
  private readonly failureSignal = signal<PlaybackFailure | null>(null);
  /**
   * Increments on every navigation the learner asked for, and never on the
   * automatic advance between sentences.
   *
   * The reader watches it to re-enable automatic scrolling: a learner who
   * scrolled away has said where they want to look, and only an explicit Play,
   * Next, or Previous says they want to be taken back.
   */
  private readonly navigationSignal = signal(0);

  /** Generation counter, so a clip loaded for a superseded call never starts. */
  private loadToken = 0;
  /**
   * True while playing exactly one sentence rather than reading on.
   *
   * The sentence popover's Play plays that sentence and stops, because the
   * learner asked about that sentence; the player's Play reads the whole
   * reading. Both use this one element, so the difference has to live here
   * rather than in either caller.
   */
  private single = false;

  readonly status = this.statusSignal.asReadonly();
  readonly currentSentenceId = this.currentSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly explicitNavigation = this.navigationSignal.asReadonly();
  readonly reading = this.readingSignal.asReadonly();

  readonly isActive = computed(() => this.statusSignal() !== 'idle');

  readonly sentenceCount = computed(() => this.refsSignal().length);

  readonly missingCount = computed(() => {
    const available = this.availableSignal();
    return this.refsSignal().filter((ref) => !available.has(ref.id)).length;
  });

  /** Position of the sentence being read, one-based, or 0 when nothing is. */
  readonly currentPosition = computed(() => {
    const current = this.currentSignal();
    if (current === null) {
      return 0;
    }
    return this.refsSignal().findIndex((ref) => ref.id === current) + 1;
  });

  /**
   * The complete-set gate.
   *
   * True only when every sentence in the reading has a clip under the current
   * cache key. A reading whose clips were made by a voice that is no longer
   * configured is not playable, because playing it would silently mix voices —
   * and a set with one clip missing is not playable at all, because the player
   * would stop in the middle of it.
   */
  readonly canPlayWholeReading = computed(
    () => this.refsSignal().length > 0 && this.missingCount() === 0,
  );

  constructor() {
    this.player.onEnded(() => {
      void this.advanceAfterEnd();
    });
    this.player.onError(() => {
      this.stopWithFailure({ kind: 'decode-failed', position: this.currentPosition() });
    });
    this.mediaSession.setHandlers({
      play: () => {
        void this.resume();
      },
      pause: () => {
        this.pause();
      },
      stop: () => {
        this.stop();
      },
      next: () => {
        void this.next();
      },
      previous: () => {
        void this.previous();
      },
    });
  }

  /**
   * Reads which clips exist for a reading. Local only, and silent.
   *
   * Called when the reader opens and again whenever stored audio may have
   * changed. Opening a reading therefore learns whether it can be played
   * without making a request and without making a sound.
   */
  async prepare(reading: Reading): Promise<void> {
    const previous = this.readingSignal();
    if (previous !== null && previous.id !== reading.id) {
      this.stop();
    }
    this.readingSignal.set(reading);

    const refs = await this.readings.listSentenceRefs(reading.id);
    if (!refs.ok) {
      this.failureSignal.set({ kind: 'storage', message: refs.error.message });
      return;
    }
    const ordered = [...refs.value].sort(
      (left, right) => left.positionInReading - right.positionInReading,
    );
    this.refsSignal.set(ordered);

    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      // No tested voice means no current key, so nothing counts as available
      // and the gate stays shut — which is exactly what it should report.
      this.cacheKeysSignal.set(new Map());
      this.availableSignal.set(new Set());
      return;
    }
    const cacheKeys = this.keys.audioKeys(
      ordered,
      config.value.modelId,
      config.value.voiceId,
      config.value.optionsFingerprint,
      config.value.speechInstructions,
    );
    this.cacheKeysSignal.set(cacheKeys);

    const summaries = await this.enrichment.listAudioSummaries(reading.id);
    if (!summaries.ok) {
      this.failureSignal.set({ kind: 'storage', message: summaries.error.message });
      return;
    }
    // Matched by key rather than by the row's own `sentenceId`: the audio table
    // is keyed by `cacheKey`, so two sentences with identical Japanese share one
    // clip and one row. Comparing per row would leave the second of them
    // permanently uncovered and the gate permanently shut.
    const stored = new Set(summaries.value.map((summary) => summary.cacheKey));
    const available = new Set<SentenceId>();
    for (const ref of ordered) {
      const cacheKey = cacheKeys.get(ref.id);
      if (cacheKey !== undefined && stored.has(cacheKey)) {
        available.add(ref.id);
      }
    }
    this.availableSignal.set(available);
  }

  /** Starts at the beginning of the reading. Refused unless the gate is open. */
  play(): Promise<void> {
    const first = this.refsSignal().at(0);
    return first === undefined ? Promise.resolve() : this.startAt(first.id);
  }

  /** Starts at one sentence — the player's "start from the one being read". */
  playFrom(sentenceId: SentenceId): Promise<void> {
    return this.startAt(sentenceId);
  }

  /**
   * Plays one sentence and stops at its end.
   *
   * Not subject to the complete-set gate, which is a rule about reading a whole
   * reading aloud: one stored clip is exactly as playable on its own whether or
   * not its neighbours exist, and refusing it would leave the sentence the
   * learner just paid for unplayable.
   */
  async playSentence(sentenceId: SentenceId): Promise<void> {
    this.navigationSignal.update((count) => count + 1);
    this.single = true;
    await this.load(sentenceId);
  }

  pause(): void {
    if (this.statusSignal() !== 'playing') {
      return;
    }
    this.player.pause();
    this.statusSignal.set('paused');
    this.mediaSession.setPlaybackState('paused');
  }

  async resume(): Promise<void> {
    if (this.statusSignal() !== 'paused') {
      return;
    }
    try {
      await this.player.resume();
    } catch {
      this.stopWithFailure({ kind: 'decode-failed', position: this.currentPosition() });
      return;
    }
    this.statusSignal.set('playing');
    this.mediaSession.setPlaybackState('playing');
  }

  /** The learner's Stop. Leaves the cursor cleared and the lock screen empty. */
  stop(): void {
    this.loadToken += 1;
    this.single = false;
    this.player.stop();
    this.statusSignal.set('idle');
    this.currentSignal.set(null);
    this.mediaSession.setPlaybackState('none');
    this.mediaSession.clear();
  }

  next(): Promise<void> {
    return this.step(1);
  }

  /**
   * Back to the start of this sentence, and only then to the one before it.
   *
   * A learner presses Previous because a sentence went past too fast, so the
   * first press replays the sentence being read from its beginning; pressing
   * again at the start of one steps back. Jumping straight to the previous
   * sentence meant the sentence they actually wanted could only be reached by
   * going back and then forward again.
   */
  previous(): Promise<void> {
    if (this.currentSignal() !== null && this.player.elapsed() > REPLAY_WINDOW_SECONDS) {
      return this.replayCurrent();
    }
    return this.step(-1);
  }

  /**
   * Stops because the reading being read has been deleted.
   *
   * Takes the id rather than assuming, so deleting a different reading from the
   * library never silences the one that is playing.
   */
  readingDeleted(readingId: ReadingId): void {
    if (this.readingSignal()?.id !== readingId) {
      return;
    }
    this.stop();
    this.readingSignal.set(null);
    this.refsSignal.set([]);
    this.availableSignal.set(new Set());
  }

  /**
   * Stops because every clip has just been deleted.
   *
   * Called by the settings action before it reports success, so the learner is
   * never told the cache is empty while a clip from it is still playing.
   */
  audioCacheCleared(): void {
    this.stop();
    this.availableSignal.set(new Set());
    this.failureSignal.set(null);
  }

  /** Clears a reported failure once the surface that showed it is done with it. */
  acknowledgeFailure(): void {
    this.failureSignal.set(null);
  }

  private async startAt(sentenceId: SentenceId): Promise<void> {
    if (!this.canPlayWholeReading()) {
      this.failureSignal.set({ kind: 'incomplete', missing: this.missingCount() });
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    await this.load(sentenceId);
  }

  /** Plays the loaded clip again from its start. Loads nothing and reads nothing. */
  private async replayCurrent(): Promise<void> {
    this.navigationSignal.update((count) => count + 1);
    try {
      await this.player.restart();
    } catch {
      this.stopWithFailure({ kind: 'decode-failed', position: this.currentPosition() });
      return;
    }
    this.statusSignal.set('playing');
    this.mediaSession.setPlaybackState('playing');
  }

  private async step(offset: number): Promise<void> {
    const refs = this.refsSignal();
    const current = this.currentSignal();
    if (current === null) {
      return;
    }
    // A bounds check rather than `at`, deliberately: `at(-1)` is the last
    // sentence, so Previous on the first one would wrap to the end of the
    // reading instead of stopping.
    const target = refs.findIndex((ref) => ref.id === current) + offset;
    if (target < 0 || target >= refs.length) {
      this.stop();
      return;
    }
    const next = refs[target];
    this.navigationSignal.update((count) => count + 1);
    await this.load(next.id);
  }

  /** The automatic advance. Deliberately does not count as a navigation. */
  private async advanceAfterEnd(): Promise<void> {
    const refs = this.refsSignal();
    const current = this.currentSignal();
    if (current === null) {
      return;
    }
    if (this.single) {
      this.stop();
      return;
    }
    const target = refs.findIndex((ref) => ref.id === current) + 1;
    if (target >= refs.length) {
      this.stop();
      return;
    }
    await this.load(refs[target].id);
  }

  /**
   * Loads one clip by cache key and plays it.
   *
   * The clip is read immediately before it is played rather than held: a whole
   * reading's audio is far too much to keep in memory, and the object URL of
   * the sentence just finished is revoked as part of loading the next one.
   */
  private async load(sentenceId: SentenceId): Promise<void> {
    const token = (this.loadToken += 1);
    const position = this.refsSignal().findIndex((ref) => ref.id === sentenceId) + 1;
    const cacheKey = this.cacheKeysSignal().get(sentenceId);
    if (cacheKey === undefined) {
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }

    this.statusSignal.set('loading');
    const clip = await this.enrichment.getAudioByCacheKey(cacheKey);
    if (token !== this.loadToken) {
      return;
    }
    if (!clip.ok) {
      this.stopWithFailure({ kind: 'storage', message: clip.error.message });
      return;
    }
    if (clip.value === null) {
      // A clip that the summary said was there and the store cannot produce:
      // the configuration-incompatible missing clip the specification names.
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }

    try {
      await this.player.play(clip.value.blob);
    } catch {
      if (token === this.loadToken) {
        this.stopWithFailure({ kind: 'decode-failed', position });
      }
      return;
    }
    if (token !== this.loadToken) {
      return;
    }

    this.currentSignal.set(sentenceId);
    this.statusSignal.set('playing');
    this.failureSignal.set(null);
    this.mediaSession.setMetadata({
      title: `Sentence ${String(position)} of ${String(this.refsSignal().length)}`,
      artist: this.readingSignal()?.title ?? '',
      album: 'Monosai',
    });
    this.mediaSession.setPlaybackState('playing');
  }

  private stopWithFailure(failure: PlaybackFailure): void {
    this.stop();
    this.failureSignal.set(failure);
  }
}
