import { Injectable, computed, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { EnrichmentKeysService } from '../enrichment/enrichment-keys.service';
import { ENRICHMENT_REPOSITORY, READING_REPOSITORY } from '../shared/repository-tokens';
import { AUDIO_PLAYER, type AudioSequenceClip, type AudioTimeline } from './audio-player';
import { MEDIA_SESSION } from './media-session';

/**
 * `waiting` is a started session that has run out of prepared audio.
 *
 * It is not paused and it is not idle: the learner asked to be read to, the
 * reading has not finished, and the next clip is still being made. Saying so is
 * the whole difference between progressive playback and playback that stopped.
 *
 * `ended` is a session that reached the last sentence, or one whose wait was
 * let go. It keeps its cursor, so a finished reading is distinguishable from
 * one that was never started and the last sentence can still be replayed.
 *
 * `stepped` is a live session that has finished a sentence and is waiting to be
 * told to go on. Only one-sentence-at-a-time reaches it. It is not `paused` —
 * nothing was interrupted — and it is not `ended`, because the reading has not
 * finished: it is the seam the learner asked the reading to stop at.
 */
export type PlaybackStatus =
  'idle' | 'loading' | 'playing' | 'paused' | 'waiting' | 'stepped' | 'ended';

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
 * How a reading is read: straight through, or a sentence at a time.
 *
 * A cycle rather than a flag because the player presents it the way a media
 * player presents repeat — one control, pressed to move to the next posture.
 * There is one more posture to come (repeating a single sentence), and modelling
 * it as an ordered list now means adding it is one entry rather than a redesign.
 */
export type PlaybackMode = 'continuous' | 'sentence';

/** The order the mode control cycles through, wrapping at the end. */
export const PLAYBACK_MODES: readonly PlaybackMode[] = ['continuous', 'sentence'];

/**
 * How much of a reading title the lock screen is given.
 *
 * An import saved without an explicit title has its body text as its title, so
 * publishing it whole put a wall of Japanese on the notification.
 */
const MEDIA_ARTIST_LIMIT = 60;

/**
 * Why playback stopped, when it was not the learner who stopped it.
 *
 * Each variant names the sentence it happened at, because "the reading would
 * not play" is not something a learner can act on and "sentence 14 has no clip
 * for the voice you are using now" is.
 *
 * `not-generated` is the one that is nobody's fault: the run that would have
 * made the clip stopped, so the session waiting for it has been let go rather
 * than left waiting for something that is not coming.
 */
export type PlaybackFailure =
  | { readonly kind: 'missing-clip'; readonly position: number }
  | { readonly kind: 'not-generated'; readonly position: number }
  | { readonly kind: 'decode-failed'; readonly position: number }
  | { readonly kind: 'storage'; readonly message: string };

/** What a load is: something the learner pressed, or reading on by itself. */
interface LoadOptions {
  /**
   * Keeps the status the session already had while the clip is read.
   *
   * The automatic advance is not a state the transport should render. Setting
   * `loading` between two sentences swapped Pause for a disabled Play for the
   * length of an IndexedDB read, which flickered at every seam and swallowed
   * any press that landed in the window.
   */
  readonly keepStatus?: boolean;
}

/**
 * Whole-reading playback.
 *
 * Root-provided because `system-architecture.md` section 4 lists active audio
 * playback among the few application-wide signals: sound outlives the component
 * that started it, and a per-reader instance would leave one reading playing
 * behind another. It owns the application's single `AudioPlayer` and the
 * playback cursor.
 *
 * Playback is **progressive at sentence granularity** (ADR 0034): a reading can
 * be started as soon as the sentence being started from has a clip, and reading
 * on waits at the frontier rather than stopping there. Nothing is streamed —
 * each clip is a whole file, and the unit that arrives is a sentence.
 *
 * Generation can leave **holes**: the queue retries out of order and records
 * per-sentence failures without stopping a run. Navigation therefore moves to
 * the next sentence that *has* a clip rather than only to the immediate
 * neighbour, or one hole would make the rest of the reading unreachable.
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
  /**
   * Whether this reading has stored clips that the current settings cannot see.
   *
   * Clips are keyed by the configuration that produced them, so changing the
   * voice, model or speed hides every clip made under the previous one without
   * deleting a single row (ADR 0042). Coverage then falls to zero, which reads
   * as loss unless a surface can say what actually happened — so the same read
   * that counts what is available also counts what is stored and unreachable.
   */
  private readonly otherSettingsSignal = signal(false);
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
  /**
   * The sentence a started session is waiting for, when it has caught up with
   * generation. Null whenever nothing is waiting.
   */
  private readonly pendingSignal = signal<SentenceId | null>(null);
  /**
   * How the reading is read, of the postures in `PLAYBACK_MODES`.
   *
   * A study posture rather than a setting: the learner wants to hear a
   * sentence, read or translate it, and only then hear the next one. It is kept
   * here rather than persisted, so it survives navigation within the session
   * and costs no migration.
   */
  private readonly modeSignal = signal<PlaybackMode>('continuous');

  /** Generation counter, so a clip loaded for a superseded call never starts. */
  private loadToken = 0;
  /** The same, for `prepare`, so a stale read never narrows a fresher one. */
  private prepareToken = 0;
  /** Whether a clip read is in flight, so Pause knows there is no player to pause. */
  private loading = false;
  /** A Pause that arrived during a load, to be honoured when the clip lands. */
  private pauseRequested = false;
  /**
   * True while playing exactly one sentence rather than reading on.
   *
   * The sentence popover Play plays that sentence and stops, because the
   * learner asked about that sentence; the player Play reads the whole
   * reading. Both use this one element, so the difference has to live here
   * rather than in either caller.
   */
  private single = false;
  /** Sentence boundaries of the native whole-reading resource, when one is loaded. */
  private timeline: AudioTimeline | null = null;

  readonly status = this.statusSignal.asReadonly();
  readonly currentSentenceId = this.currentSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly explicitNavigation = this.navigationSignal.asReadonly();
  readonly pendingSentenceId = this.pendingSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  /** The one mode with behaviour behind it, named for what it does at a seam. */
  readonly stepMode = computed(() => this.modeSignal() === 'sentence');
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

  /** Sentences with a clip under the current cache key. */
  readonly availableCount = computed(() => this.refsSignal().length - this.missingCount());

  /**
   * Whether there is anything at all that could be played right now.
   *
   * This is what decides whether the player offers a transport, and what Play
   * is gated on: clips arrive out of order and a run can leave a hole at
   * sentence one, so requiring the *first* sentence would leave a learner
   * unable to play audio they have already paid for.
   */
  readonly hasPlayableAudio = computed(() => this.availableCount() > 0);

  /** Stored clips exist for this reading, made with audio settings no longer in use. */
  readonly hasAudioInOtherSettings = this.otherSettingsSignal.asReadonly();

  /**
   * Whether the reading is complete under the current voice.
   *
   * No longer a gate on playback (ADR 0034). It is what says the set is
   * finished — the library audio summary, and the player offer to prepare
   * whatever is still missing — and it still excludes clips made by a voice
   * that is no longer configured, because counting them would silently mix
   * voices into one completeness figure.
   */
  readonly canPlayWholeReading = computed(
    () => this.refsSignal().length > 0 && this.missingCount() === 0,
  );

  /** Position of the sentence a waiting session is waiting for, or 0. */
  readonly pendingPosition = computed(() => {
    const pending = this.pendingSignal();
    if (pending === null) {
      return 0;
    }
    return this.refsSignal().findIndex((ref) => ref.id === pending) + 1;
  });

  /** Whether Next has a later sentence with a clip to jump to. */
  readonly canGoNext = computed(() => this.availableIndexFrom(1) !== -1);

  /**
   * Whether Back has anywhere to go.
   *
   * True whenever a sentence is current, because the first meaning of Back is
   * replaying the sentence being read, and that never depends on a neighbour.
   */
  readonly canGoPrevious = computed(() => this.currentSignal() !== null);

  constructor() {
    this.player.onEnded(() => {
      void this.advanceAfterEnd();
    });
    this.player.onError(() => {
      this.stopWithFailure({ kind: 'decode-failed', position: this.currentPosition() });
    });
    this.player.onTimeUpdate(() => {
      this.followSequencePosition();
    });
    this.mediaSession.setHandlers({
      play: () => {
        // A session held at a seam has nothing to resume, and a headset Play
        // there means the same as the transport's: read on.
        void (this.statusSignal() === 'stepped' ? this.continueReading() : this.resume());
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
      seekTo: (seconds) => {
        this.seekSequenceTime(seconds);
      },
    });
  }

  /**
   * Reads which clips exist for a reading. Local only, and silent.
   *
   * Called when the reader opens and again whenever stored audio may have
   * changed. Opening a reading therefore learns whether it can be played
   * without making a request and without making a sound.
   *
   * Latest-wins: the reader re-runs this on every completed sentence of a
   * generation run, so two calls are routinely in flight, and an older, smaller
   * availability set settling last would make the frontier appear to move
   * backwards and strand a waiting session on a clip that had already arrived.
   */
  async prepare(reading: Reading): Promise<void> {
    const previous = this.readingSignal();
    if (previous !== null && previous.id !== reading.id) {
      this.stop();
    }
    this.readingSignal.set(reading);
    const token = (this.prepareToken += 1);

    const refs = await this.readings.listSentenceRefs(reading.id);
    if (token !== this.prepareToken) {
      return;
    }
    if (!refs.ok) {
      this.failureSignal.set({ kind: 'storage', message: refs.error.message });
      this.otherSettingsSignal.set(false);
      // Availability could not be refreshed, so nothing is claimed to be
      // playable: offering a transport built on a set this call has just failed
      // to read would be offering controls that cannot be honoured.
      this.availableSignal.set(new Set());
      return;
    }
    const ordered = [...refs.value].sort(
      (left, right) => left.positionInReading - right.positionInReading,
    );
    this.refsSignal.set(ordered);

    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      // No tested voice means no current key, so nothing counts as available
      // and the gate stays shut — which is exactly what it should report. What
      // is stored is still read, because a reading whose clips have just become
      // unreachable is exactly the case that must not look like deletion.
      this.cacheKeysSignal.set(new Map());
      this.availableSignal.set(new Set());
      const orphaned = await this.enrichment.listAudioSummaries(reading.id);
      if (token !== this.prepareToken) {
        return;
      }
      this.otherSettingsSignal.set(orphaned.ok && orphaned.value.length > 0);
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
    if (token !== this.prepareToken) {
      return;
    }
    if (!summaries.ok) {
      this.failureSignal.set({ kind: 'storage', message: summaries.error.message });
      this.availableSignal.set(new Set());
      this.otherSettingsSignal.set(false);
      return;
    }
    // Matched by key rather than by the row own `sentenceId`: the audio table
    // is keyed by `cacheKey`, so two sentences with identical Japanese share one
    // clip and one row. Comparing per row would leave the second of them
    // permanently uncovered and the gate permanently shut.
    const stored = new Set(summaries.value.map((summary) => summary.cacheKey));
    const current = new Set(cacheKeys.values());
    this.otherSettingsSignal.set(summaries.value.some((summary) => !current.has(summary.cacheKey)));
    const available = new Set<SentenceId>();
    for (const ref of ordered) {
      const cacheKey = cacheKeys.get(ref.id);
      if (cacheKey !== undefined && stored.has(cacheKey)) {
        available.add(ref.id);
      }
    }
    this.availableSignal.set(available);
    await this.continueIfPendingArrived();
  }

  /**
   * Reads on when the clip a waiting session stopped at has been stored.
   *
   * This is not an autoplay. It is the continuation of a session the learner
   * started by pressing Play, which is why it is reached only from `waiting` —
   * a state that cannot be entered without that press.
   */
  private async continueIfPendingArrived(): Promise<void> {
    const pending = this.pendingSignal();
    if (pending === null || this.statusSignal() !== 'waiting') {
      return;
    }
    if (!this.availableSignal().has(pending)) {
      return;
    }
    this.pendingSignal.set(null);
    await this.load(pending, { keepStatus: true });
  }

  /**
   * Starts at the first sentence that has a clip.
   *
   * Not strictly the first sentence: a run that failed or is still filling in
   * can leave sentence one missing while the rest of the reading is ready, and
   * refusing to start there would make audio the learner has already paid for
   * unreachable from the transport.
   */
  /**
   * Turns one-sentence-at-a-time on or off.
   *
   * Takes effect at the next seam. A session already held at one is left there
   * rather than read on from, because turning the mode off is not a request to
   * hear anything — continuing is still a press.
   */
  setStepMode(enabled: boolean): void {
    this.modeSignal.set(enabled ? 'sentence' : 'continuous');
  }

  /** Moves to the next posture in `PLAYBACK_MODES`, wrapping at the end. */
  cycleMode(): void {
    this.modeSignal.update((mode) => {
      const next = PLAYBACK_MODES.indexOf(mode) + 1;
      return PLAYBACK_MODES[next % PLAYBACK_MODES.length];
    });
  }

  /**
   * Moves the cursor to a position on the track, snapping to audio that exists.
   *
   * Positions are sentences, so the scrubber is discrete: there is nothing
   * between sentence 4 and sentence 5 to land on. A position with no clip snaps
   * to the nearest one that has, so a hole left by a failed sentence is a place
   * the drag passes over rather than a dead spot.
   *
   * A live session jumps and keeps reading; an idle one only moves its cursor.
   * Scrubbing is an explicit act, but it is an act of *aiming*, and starting a
   * reading that was not playing is still the press of Play.
   */
  async seekTo(position: number): Promise<void> {
    const refs = this.refsSignal();
    if (refs.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(Math.round(position), 1), refs.length);
    const index = this.nearestAvailableIndex(clamped - 1);
    if (index === -1) {
      return;
    }
    const target = refs[index].id;
    if (this.isActive()) {
      if (this.timeline !== null) {
        this.navigationSignal.update((count) => count + 1);
        this.currentSignal.set(target);
        this.player.seek(this.timeline.starts[index] ?? 0);
        this.publishMediaMetadata(index);
        this.publishMediaPosition();
        return;
      }
      await this.startAt(target);
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.currentSignal.set(target);
  }

  play(): Promise<void> {
    const available = this.availableSignal();
    const first = this.refsSignal().find((ref) => available.has(ref.id));
    return first === undefined ? Promise.resolve() : this.startAt(first.id);
  }

  /** Starts at one sentence — the player "start from the one being read". */
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
    if (!this.availableSignal().has(sentenceId)) {
      // Reported the way `startAt` reports it: naming the sentence without
      // tearing down whatever session the learner already had.
      const position = this.refsSignal().findIndex((ref) => ref.id === sentenceId) + 1;
      this.failureSignal.set({ kind: 'missing-clip', position });
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = true;
    this.pendingSignal.set(null);
    await this.load(sentenceId);
  }

  /**
   * Pauses, including while the next clip is still being read.
   *
   * A press during the load window used to be dropped, and the next sentence
   * then started anyway. It is now remembered, and the clip arrives paused.
   */
  pause(): void {
    const status = this.statusSignal();
    if (status !== 'playing' && status !== 'loading') {
      return;
    }
    if (this.loading) {
      this.pauseRequested = true;
    } else {
      this.player.pause();
    }
    this.statusSignal.set('paused');
    this.mediaSession.setPlaybackState('paused');
    this.publishMediaPosition();
  }

  /**
   * Resumes a paused session.
   *
   * `continueReading` is what separates the player Play from resuming a single
   * sentence the popover started: pressing the transport Play means "read on
   * from here", and leaving the single-sentence flag set made the reading stop
   * again at the end of that one sentence with nothing on screen explaining
   * why.
   */
  async resume(continueReading = false): Promise<void> {
    if (this.statusSignal() !== 'paused') {
      return;
    }
    if (continueReading) {
      this.single = false;
    }
    try {
      await this.player.resume();
    } catch {
      // Almost always the autoplay policy refusing a resume it did not trace to
      // a gesture. That is not an undecodable clip, and destroying the session
      // over it loses the place the learner had reached.
      this.statusSignal.set('paused');
      this.mediaSession.setPlaybackState('paused');
      return;
    }
    this.statusSignal.set('playing');
    this.mediaSession.setPlaybackState('playing');
    this.publishMediaPosition();
  }

  /** The learner Stop. Leaves the cursor cleared and the lock screen empty. */
  stop(): void {
    this.loadToken += 1;
    this.single = false;
    this.loading = false;
    this.pauseRequested = false;
    this.pendingSignal.set(null);
    this.timeline = null;
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
   * Reads on from a session held at a seam by one-sentence-at-a-time.
   *
   * Next with one difference: at the frontier it waits instead of doing
   * nothing. Next means "take me to a sentence that exists", so refusing at the
   * frontier is right for a headset press; continuing means "carry on with the
   * reading", and the reading carries on as soon as the clip is made. Named
   * rather than a flag on `next`, so the call site says which of the two it is.
   */
  async continueReading(): Promise<void> {
    const current = this.currentSignal();
    if (current === null) {
      return;
    }
    const target = this.availableIndexFrom(1);
    if (target !== -1) {
      await this.step(1);
      return;
    }
    const refs = this.refsSignal();
    const after = refs.findIndex((ref) => ref.id === current) + 1;
    if (after >= refs.length) {
      // The last sentence. Nothing is coming, and the reading is over.
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    this.pendingSignal.set(refs[after].id);
    this.statusSignal.set('waiting');
    this.mediaSession.setPlaybackState('paused');
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
    if (this.currentSignal() === null) {
      return Promise.resolve();
    }
    const currentStart = this.timeline?.starts[Math.max(this.currentPosition() - 1, 0)] ?? 0;
    if (this.player.elapsed() - currentStart > REPLAY_WINDOW_SECONDS) {
      return this.replayCurrent();
    }
    return this.step(-1);
  }

  /**
   * Lets go of a session waiting for a clip that is not coming.
   *
   * Nothing else ever leaves `waiting`, so a run that failed or was cancelled
   * used to park the player at "Waiting for sentence N of M" with every
   * transport control dead and the only escape a header toggle that threw the
   * session away. The reader calls this when the job stops, because whether a
   * job is still running belongs to the reader rather than to playback.
   */
  abandonWaiting(): void {
    if (this.statusSignal() !== 'waiting') {
      return;
    }
    const position = this.pendingPosition();
    this.pendingSignal.set(null);
    this.statusSignal.set('ended');
    this.mediaSession.setPlaybackState('paused');
    this.failureSignal.set({ kind: 'not-generated', position });
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
    this.otherSettingsSignal.set(false);
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
    this.otherSettingsSignal.set(false);
    this.failureSignal.set(null);
  }

  /** Stops and forgets clips only when they belong to the cleared reading. */
  readingAudioCleared(readingId: ReadingId): void {
    if (this.readingSignal()?.id !== readingId) {
      return;
    }
    this.audioCacheCleared();
  }

  /** Whether one sentence can be started from right now. */
  isAvailable(sentenceId: SentenceId | null): boolean {
    return sentenceId !== null && this.availableSignal().has(sentenceId);
  }

  /** Clears a reported failure once the surface that showed it is done with it. */
  acknowledgeFailure(): void {
    this.failureSignal.set(null);
  }

  /**
   * Starts a reading session at one sentence.
   *
   * Refused only when *that* sentence has no clip. Whether the sentences after
   * it exist yet is not the business of this call: reading on waits for them.
   */
  private async startAt(sentenceId: SentenceId): Promise<void> {
    if (!this.availableSignal().has(sentenceId)) {
      const position = this.refsSignal().findIndex((ref) => ref.id === sentenceId) + 1;
      this.failureSignal.set({ kind: 'missing-clip', position });
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    this.pendingSignal.set(null);
    if (this.canUseSequence()) {
      await this.loadSequence(sentenceId);
      return;
    }
    await this.load(sentenceId);
  }

  /** Plays the loaded clip again from its start. Loads nothing and reads nothing. */
  private async replayCurrent(): Promise<void> {
    this.navigationSignal.update((count) => count + 1);
    this.pendingSignal.set(null);
    try {
      if (this.timeline !== null) {
        const index = this.currentPosition() - 1;
        this.player.seek(this.timeline.starts[Math.max(index, 0)] ?? 0);
        await this.player.resume();
      } else {
        await this.player.restart();
      }
    } catch {
      this.stopWithFailure({ kind: 'decode-failed', position: this.currentPosition() });
      return;
    }
    this.statusSignal.set('playing');
    this.mediaSession.setPlaybackState('playing');
    this.publishMediaPosition();
  }

  /**
   * Moves to the nearest sentence in `direction` that has a clip.
   *
   * Never stops. Off the end of the reading it does nothing, because a headset
   * next-track press at the last sentence meant to hear the next sentence, not
   * to end the session; off the start it replays sentence one, which is what
   * the label of Back promises at the one position where the learner has no
   * other option.
   */
  private async step(direction: 1 | -1): Promise<void> {
    if (this.currentSignal() === null) {
      return;
    }
    const target = this.availableIndexFrom(direction);
    if (target === -1) {
      if (direction === -1) {
        await this.replayCurrent();
      }
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    this.pendingSignal.set(null);
    if (this.timeline !== null) {
      const targetRef = this.refsSignal()[target];
      this.currentSignal.set(targetRef.id);
      this.player.seek(this.timeline.starts[target] ?? 0);
      try {
        await this.player.resume();
      } catch {
        this.statusSignal.set('paused');
        this.mediaSession.setPlaybackState('paused');
        return;
      }
      this.statusSignal.set('playing');
      this.publishMediaMetadata(target);
      this.mediaSession.setPlaybackState('playing');
      this.publishMediaPosition();
      return;
    }
    await this.load(this.refsSignal()[target].id);
  }

  /** The automatic advance. Deliberately does not count as a navigation. */
  private async advanceAfterEnd(): Promise<void> {
    const refs = this.refsSignal();
    const current = this.currentSignal();
    if (current === null) {
      return;
    }
    if (this.timeline !== null) {
      this.finish();
      return;
    }
    if (this.single) {
      this.stop();
      return;
    }
    const target = refs.findIndex((ref) => ref.id === current) + 1;
    if (target >= refs.length) {
      this.finish();
      return;
    }
    if (this.stepMode()) {
      // The seam the learner asked for. The cursor stays on the sentence just
      // heard, nothing is loaded, and the session waits to be told to go on —
      // which is `continueReading`, from the transport or the headset.
      this.statusSignal.set('stepped');
      this.mediaSession.setPlaybackState('paused');
      return;
    }
    const next = refs[target];
    if (!this.availableSignal().has(next.id)) {
      // The frontier. The cursor stays on the sentence just heard, so the
      // reader keeps showing where the learner is, and the session waits for
      // the clip rather than reporting that the reading would not play.
      this.pendingSignal.set(next.id);
      this.statusSignal.set('waiting');
      this.mediaSession.setPlaybackState('paused');
      return;
    }
    await this.load(next.id, { keepStatus: true });
  }

  /**
   * The reading is over.
   *
   * Distinct from `stop()`, which is the learner ending a session: the cursor
   * stays on the last sentence, so the bar is full, the highlight holds, and
   * Back can replay the sentence that just finished. Snapping back to "N
   * sentences ready" made a completed reading indistinguishable from one that
   * had never been played.
   */
  private finish(): void {
    this.loadToken += 1;
    this.loading = false;
    this.pauseRequested = false;
    this.pendingSignal.set(null);
    this.statusSignal.set('ended');
    this.mediaSession.setPlaybackState('paused');
    this.publishMediaPosition();
  }

  private canUseSequence(): boolean {
    return this.modeSignal() === 'continuous' && this.canPlayWholeReading();
  }

  /** Loads every current clip into one native resource before playback starts. */
  private async loadSequence(sentenceId: SentenceId): Promise<void> {
    const token = (this.loadToken += 1);
    const refs = this.refsSignal();
    const startIndex = refs.findIndex((ref) => ref.id === sentenceId);
    if (startIndex === -1) {
      return;
    }
    this.loading = true;
    this.statusSignal.set('loading');
    const byKey = new Map<string, AudioSequenceClip>();
    const clips: AudioSequenceClip[] = [];
    for (const ref of refs) {
      const cacheKey = this.cacheKeysSignal().get(ref.id);
      if (cacheKey === undefined) {
        await this.load(sentenceId);
        return;
      }
      let clip = byKey.get(cacheKey);
      if (clip === undefined) {
        const loaded = await this.enrichment.getAudioByCacheKey(cacheKey);
        if (token !== this.loadToken) {
          return;
        }
        if (!loaded.ok) {
          this.loading = false;
          this.stopWithFailure({ kind: 'storage', message: loaded.error.message });
          return;
        }
        if (loaded.value === null) {
          await this.load(sentenceId);
          return;
        }
        if (loaded.value.mimeType !== 'audio/mpeg' && loaded.value.mimeType !== 'audio/wav') {
          await this.load(sentenceId);
          return;
        }
        clip = { blob: loaded.value.blob, mimeType: loaded.value.mimeType };
        byKey.set(cacheKey, clip);
      }
      clips.push(clip);
    }

    const startPaused = this.pauseRequested;
    try {
      const timeline = await this.player.playSequence(clips, { startIndex, startPaused });
      if (token !== this.loadToken) {
        return;
      }
      this.timeline = timeline;
    } catch {
      if (token === this.loadToken) {
        // Browsers without MPEG MediaSource retain the established foreground path.
        this.loading = false;
        await this.load(sentenceId);
      }
      return;
    }
    this.loading = false;
    this.pauseRequested = false;
    this.currentSignal.set(sentenceId);
    this.statusSignal.set(startPaused ? 'paused' : 'playing');
    this.failureSignal.set(null);
    this.publishMediaMetadata(startIndex);
    this.mediaSession.setPlaybackState(startPaused ? 'paused' : 'playing');
    this.publishMediaPosition();
  }

  /**
   * Loads one clip by cache key and plays it.
   *
   * The clip is read immediately before it is played rather than held: the
   * audio of a whole reading is far too much to keep in memory, and the object
   * URL of the sentence just finished is revoked as part of loading the next.
   */
  private async load(sentenceId: SentenceId, options?: LoadOptions): Promise<void> {
    const token = (this.loadToken += 1);
    const position = this.refsSignal().findIndex((ref) => ref.id === sentenceId) + 1;
    const cacheKey = this.cacheKeysSignal().get(sentenceId);
    if (cacheKey === undefined) {
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }

    this.timeline = null;
    this.loading = true;
    if (options?.keepStatus !== true) {
      this.statusSignal.set('loading');
    }
    const clip = await this.enrichment.getAudioByCacheKey(cacheKey);
    if (token !== this.loadToken) {
      return;
    }
    if (!clip.ok) {
      this.loading = false;
      this.stopWithFailure({ kind: 'storage', message: clip.error.message });
      return;
    }
    if (clip.value === null) {
      // A clip that the summary said was there and the store cannot produce:
      // the configuration-incompatible missing clip the specification names.
      this.loading = false;
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }

    const startPaused = this.pauseRequested;
    try {
      await this.player.play(clip.value.blob, { startPaused });
    } catch {
      if (token === this.loadToken) {
        this.loading = false;
        this.stopWithFailure({ kind: 'decode-failed', position });
      }
      return;
    }
    if (token !== this.loadToken) {
      return;
    }
    this.loading = false;
    this.pauseRequested = false;

    this.currentSignal.set(sentenceId);
    this.statusSignal.set(startPaused ? 'paused' : 'playing');
    this.failureSignal.set(null);
    this.publishMediaMetadata(position - 1);
    this.mediaSession.setPlaybackState(startPaused ? 'paused' : 'playing');
  }

  private followSequencePosition(): void {
    const timeline = this.timeline;
    if (timeline === null) {
      return;
    }
    const elapsed = this.player.elapsed();
    let index = 0;
    for (let candidate = 1; candidate < timeline.starts.length; candidate += 1) {
      if (timeline.starts[candidate] > elapsed) {
        break;
      }
      index = candidate;
    }
    const ref = this.refsSignal()[index];
    if (ref.id !== this.currentSignal()) {
      if (this.modeSignal() === 'sentence') {
        this.player.pause();
        this.statusSignal.set('stepped');
        this.mediaSession.setPlaybackState('paused');
        this.player.seek(timeline.starts[index]);
      }
      this.currentSignal.set(ref.id);
      this.publishMediaMetadata(index);
    }
    this.publishMediaPosition();
  }

  private seekSequenceTime(seconds: number): void {
    if (this.timeline === null) {
      return;
    }
    this.player.seek(seconds);
    this.followSequencePosition();
  }

  private publishMediaMetadata(index: number): void {
    const readingTitle = mediaArtist(this.readingSignal()?.title ?? '');
    this.mediaSession.setMetadata({
      title: readingTitle === '' ? 'Japanese reading' : readingTitle,
      artist: 'Monosai',
      album: `Sentence ${String(index + 1)} of ${String(this.refsSignal().length)}`,
    });
  }

  private publishMediaPosition(): void {
    if (this.timeline === null || this.timeline.duration <= 0) {
      this.mediaSession.setPositionState(null);
      return;
    }
    this.mediaSession.setPositionState({
      duration: this.timeline.duration,
      playbackRate: 1,
      position: Math.min(Math.max(this.player.elapsed(), 0), this.timeline.duration),
    });
  }

  /**
   * The index of the nearest sentence in `direction` that has a clip, or -1.
   *
   * A search rather than a neighbour check because generation can leave holes,
   * and a hole must not be a wall: every later sentence that was made is still
   * something the learner paid for and should be able to reach.
   */
  /**
   * The sentence with a clip closest to one index, searching both ways.
   *
   * Ties go backwards, because a scrub that lands in a hole is aiming at the
   * text around it and the sentence before the gap is the one that leads into
   * what the learner pointed at.
   */
  private nearestAvailableIndex(index: number): number {
    const refs = this.refsSignal();
    const available = this.availableSignal();
    for (let distance = 0; distance < refs.length; distance += 1) {
      const before = index - distance;
      if (before >= 0 && available.has(refs[before].id)) {
        return before;
      }
      const after = index + distance;
      if (after < refs.length && available.has(refs[after].id)) {
        return after;
      }
    }
    return -1;
  }

  private availableIndexFrom(direction: 1 | -1): number {
    const current = this.currentSignal();
    if (current === null) {
      return -1;
    }
    const refs = this.refsSignal();
    const available = this.availableSignal();
    const from = refs.findIndex((ref) => ref.id === current);
    if (from === -1) {
      return -1;
    }
    for (let index = from + direction; index >= 0 && index < refs.length; index += direction) {
      if (available.has(refs[index].id)) {
        return index;
      }
    }
    return -1;
  }

  private stopWithFailure(failure: PlaybackFailure): void {
    this.stop();
    this.failureSignal.set(failure);
  }
}

/** A reading title short enough to read on a notification. */
function mediaArtist(title: string): string {
  const trimmed = title.trim();
  return trimmed.length <= MEDIA_ARTIST_LIMIT
    ? trimmed
    : `${trimmed.slice(0, MEDIA_ARTIST_LIMIT - 1)}…`;
}
