import { Injectable, computed, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import { isPlaybackRate, type PlaybackRate } from '../../domain/settings/settings';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { EnrichmentKeysService } from '../enrichment/enrichment-keys.service';
import { ENRICHMENT_REPOSITORY, READING_REPOSITORY } from '../shared/repository-tokens';
import { AppSettingsStore } from '../settings/app-settings.store';
import { AUDIO_PLAYER } from './audio-player';
import { ClipCatalogue, type ClipPace } from './clip-catalogue';
import { ClipSequencer } from './clip-sequencer';
import { MEDIA_SESSION } from './media-session';
import { defined } from '../../domain/shared/invariant';

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
  /** Offset within the sentence clip, used when leaving a continuous resource. */
  readonly startSeconds?: number;
  /** Keeps a paused continuous session paused while its current clip is loaded. */
  readonly startPaused?: boolean;
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
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly player = inject(AUDIO_PLAYER);
  private readonly mediaSession = inject(MEDIA_SESSION);
  private readonly appSettings = inject(AppSettingsStore);

  private readonly catalogue = new ClipCatalogue({
    readings: inject(READING_REPOSITORY),
    enrichment: this.enrichment,
    cacheKeysFor: (refs) => {
      const config = this.audioConfig.resolve('tts-synthesis');
      return config.ok
        ? this.keys.audioKeys(
            refs,
            config.value.modelId,
            config.value.voiceId,
            config.value.optionsFingerprint,
            config.value.speechInstructions,
          )
        : new Map<SentenceId, string>();
    },
  });
  private readonly sequencer = new ClipSequencer(this.catalogue, {
    player: this.player,
    clips: this.enrichment,
    rateFor: (pace) => this.rateForPace(pace),
  });
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

  readonly status = this.statusSignal.asReadonly();
  readonly currentSentenceId = this.currentSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly explicitNavigation = this.navigationSignal.asReadonly();
  readonly pendingSentenceId = this.pendingSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly playbackRate = computed(() => {
    const rate = this.appSettings.readerPreferences().playbackRate;
    return isPlaybackRate(rate) ? rate : 1;
  });
  /** The one mode with behaviour behind it, named for what it does at a seam. */
  readonly stepMode = computed(() => this.modeSignal() === 'sentence');

  readonly isActive = computed(() => this.statusSignal() !== 'idle');

  // What is stored for the open reading, as the catalogue reports it.
  readonly reading = this.catalogue.reading;
  readonly sentenceCount = this.catalogue.sentenceCount;
  readonly missingCount = this.catalogue.missingCount;
  readonly availableCount = this.catalogue.availableCount;
  readonly hasPlayableAudio = this.catalogue.hasPlayableAudio;
  readonly hasStaleAudio = this.catalogue.hasStaleAudio;
  readonly canPlayWholeReading = this.catalogue.canPlayWholeReading;

  /** Position of the sentence being read, one-based, or 0 when nothing is. */
  readonly currentPosition = computed(() => {
    const current = this.currentSignal();
    return current === null ? 0 : this.catalogue.positionOf(current);
  });

  /** Position of the sentence a waiting session is waiting for, or 0. */
  readonly pendingPosition = computed(() => {
    const pending = this.pendingSignal();
    return pending === null ? 0 : this.catalogue.positionOf(pending);
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
    this.player.onStalled(() => {
      this.noteFrontierReached();
    });
    this.player.onResumed(() => {
      this.noteFrontierPassed();
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
   * Latest-wins, which the catalogue enforces: the reader re-runs this on every
   * completed sentence of a generation run, so two calls are routinely in flight.
   */
  async prepare(reading: Reading): Promise<void> {
    const previous = this.catalogue.reading();
    if (previous !== null && previous.id !== reading.id) {
      this.stop();
    }
    const refreshed = await this.catalogue.refresh(reading);
    if (refreshed.kind === 'superseded') {
      return;
    }
    if (refreshed.kind === 'unreadable') {
      this.failureSignal.set({ kind: 'storage', message: refreshed.message });
      return;
    }
    await this.continueIfPendingArrived();
    if (await this.sequencer.extend()) {
      this.publishMediaPosition();
    }
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
    if (this.sequencer.loaded) {
      // A continuous session waits inside its own resource. Appending the clip
      // is what reads on there, and loading it separately would replace the
      // resource the reading is playing from.
      return;
    }
    if (!this.catalogue.isAvailable(pending)) {
      return;
    }
    this.pendingSignal.set(null);
    await this.load(pending, { keepStatus: true });
  }

  /**
   * Turns one-sentence-at-a-time on or off.
   *
   * An active continuous resource is replaced with the current sentence clip
   * at the same position. Its native end is then the exact seam, instead of a
   * later `timeupdate` noticing the boundary after part of the next sentence
   * has already played. A session already held at a seam is left there, because
   * changing the mode is not a request to hear anything.
   */
  setStepMode(enabled: boolean): void {
    this.setMode(enabled ? 'sentence' : 'continuous');
  }

  /** Moves to the next posture in `PLAYBACK_MODES`, wrapping at the end. */
  cycleMode(): void {
    const next = PLAYBACK_MODES.indexOf(this.modeSignal()) + 1;
    this.setMode(defined(PLAYBACK_MODES[next % PLAYBACK_MODES.length], 'cycleMode'));
  }

  /** Persists and immediately applies the learner's local speech rate. */
  setPlaybackRate(rate: PlaybackRate): void {
    if (!isPlaybackRate(rate)) {
      return;
    }
    void this.appSettings.setReaderPreference('playbackRate', rate);
    this.player.setRate(this.rateForPace(this.loadedPace()));
    this.publishMediaPosition();
  }

  private setMode(mode: PlaybackMode): void {
    if (mode === this.modeSignal()) {
      return;
    }
    // Resolve the current sentence while this is still continuous. In sentence
    // mode the fallback boundary guard deliberately keeps the old cursor.
    if (mode === 'sentence' && this.sequencer.loaded) {
      this.followSequencePosition();
    }
    this.modeSignal.set(mode);
    if (mode === 'sentence') {
      void this.useCurrentSentenceClip();
    }
  }

  /**
   * Leaves a continuous resource without restarting the sentence being heard.
   *
   * Pausing first closes the IndexedDB read window in which the old resource
   * could otherwise cross the seam. The single clip resumes at the equivalent
   * sentence-relative offset and its native `ended` event stops exactly there.
   */
  private async useCurrentSentenceClip(): Promise<void> {
    const current = this.currentSignal();
    const status = this.statusSignal();
    if (
      !this.sequencer.loaded ||
      current === null ||
      (status !== 'playing' && status !== 'paused')
    ) {
      return;
    }
    const span = this.sequencer.spanOf(this.catalogue.positionOf(current) - 1);
    if (span === null) {
      return;
    }
    const elapsed = Math.min(
      Math.max(this.player.elapsed() - span.start, 0),
      Math.max(span.end - span.start, 0),
    );
    this.player.pause();
    await this.load(current, {
      startSeconds: elapsed,
      startPaused: status === 'paused',
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
    const refs = this.catalogue.refs();
    if (refs.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(Math.round(position), 1), refs.length);
    const index = this.catalogue.nearestAvailableIndex(clamped - 1);
    const target = refs[index]?.id;
    if (target === undefined) {
      return;
    }
    if (this.isActive()) {
      const time = this.sequencer.timeOf(index);
      if (time !== null) {
        this.navigationSignal.update((count) => count + 1);
        this.currentSignal.set(target);
        this.player.seek(time);
        this.publishMediaMetadata(index);
        this.publishMediaPosition();
        return;
      }
      // Outside the resource being played — a clip stored since it was built,
      // or one before the sentence it starts at. Starting there builds a new
      // resource from that sentence rather than seeking into silence.
      await this.startAt(target);
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.currentSignal.set(target);
  }

  play(): Promise<void> {
    const first = this.catalogue.firstAvailable();
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
    if (!this.catalogue.isAvailable(sentenceId)) {
      // Reported the way `startAt` reports it: naming the sentence without
      // tearing down whatever session the learner already had.
      const position = this.catalogue.positionOf(sentenceId);
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
    this.sequencer.release();
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
    const after = this.catalogue.refs()[this.catalogue.positionOf(current)];
    if (after === undefined) {
      // The last sentence. Nothing is coming, and the reading is over.
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    this.pendingSignal.set(after.id);
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
    const currentStart = this.sequencer.timeOf(Math.max(this.currentPosition() - 1, 0)) ?? 0;
    if (this.player.elapsed() - currentStart > REPLAY_WINDOW_SECONDS) {
      return this.replayCurrent();
    }
    return this.step(-1);
  }

  /**
   * Says that no more clips are coming for this reading.
   *
   * Two things follow, and both are about a session that would otherwise wait
   * for ever. A continuous resource is sealed, so the element reaches the end
   * of what was appended and finishes there rather than stalling at it. A
   * session already waiting is let go: nothing else ever leaves `waiting`, so a
   * run that failed or was cancelled used to park the player at "Waiting for
   * sentence N of M" with every transport control dead.
   *
   * The reader calls this when the job stops, because whether a job is still
   * running belongs to the reader rather than to playback.
   */
  stopExpectingClips(): void {
    this.sequencer.seal();
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
    if (this.catalogue.reading()?.id !== readingId) {
      return;
    }
    this.stop();
    this.catalogue.forgetReading();
  }

  /**
   * Stops because every clip has just been deleted.
   *
   * Called by the settings action before it reports success, so the learner is
   * never told the cache is empty while a clip from it is still playing.
   */
  audioCacheCleared(): void {
    this.stop();
    this.catalogue.forgetClips();
    this.failureSignal.set(null);
  }

  /** Stops and forgets clips only when they belong to the cleared reading. */
  readingAudioCleared(readingId: ReadingId): void {
    if (this.catalogue.reading()?.id !== readingId) {
      return;
    }
    this.audioCacheCleared();
  }

  /** Whether one sentence can be started from right now. */
  isAvailable(sentenceId: SentenceId | null): boolean {
    return this.catalogue.isAvailable(sentenceId);
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
    if (!this.catalogue.isAvailable(sentenceId)) {
      const position = this.catalogue.positionOf(sentenceId);
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
      const start = this.sequencer.timeOf(Math.max(this.currentPosition() - 1, 0));
      if (start !== null) {
        this.player.seek(start);
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
    const targetRef = this.catalogue.refs()[target];
    if (targetRef === undefined) {
      if (direction === -1) {
        await this.replayCurrent();
      }
      return;
    }
    this.navigationSignal.update((count) => count + 1);
    this.single = false;
    this.pendingSignal.set(null);
    const time = this.sequencer.timeOf(target);
    if (time !== null) {
      this.currentSignal.set(targetRef.id);
      this.player.seek(time);
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
    if (this.sequencer.loaded) {
      // A sentence stored since the resource was built, or one before its
      // start. Starting there builds a resource from it rather than seeking
      // into audio the element does not have.
      await this.startAt(targetRef.id);
      return;
    }
    await this.load(targetRef.id);
  }

  /** The automatic advance. Deliberately does not count as a navigation. */
  private async advanceAfterEnd(): Promise<void> {
    const refs = this.catalogue.refs();
    const current = this.currentSignal();
    if (current === null) {
      return;
    }
    if (this.sequencer.loaded) {
      // A sealed resource can end at a pace boundary. Continue with the next
      // playable run rather than making the learner press Play again.
      const next = refs[this.availableIndexFrom(1)];
      if (next === undefined) {
        this.finish();
      } else {
        await this.startAt(next.id);
      }
      return;
    }
    if (this.single) {
      this.stop();
      return;
    }
    const next = refs[this.catalogue.positionOf(current)];
    if (next === undefined) {
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
    if (!this.catalogue.isAvailable(next.id)) {
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

  /**
   * Whether this start can be one native resource.
   *
   * Continuous mode only: one-sentence-at-a-time stops at every seam, which is
   * the JavaScript the resource exists to remove. Everything else the resource
   * needs — clips to build it from, a container that can hold them, a browser
   * with MediaSource — is decided in `loadSequence`, which falls back to the
   * per-sentence path when any of it is missing.
   */
  private canUseSequence(): boolean {
    return this.modeSignal() === 'continuous';
  }

  /**
   * Loads the clips that exist from one sentence on into one native resource.
   *
   * `ClipSequencer` builds it; this turns what happened into transport state.
   * Whatever it cannot build, the sentence is played as a single clip instead.
   */
  private async loadSequence(sentenceId: SentenceId): Promise<void> {
    const token = (this.loadToken += 1);
    const startIndex = this.catalogue.positionOf(sentenceId) - 1;
    if (startIndex === -1) {
      return;
    }
    this.loading = true;
    this.statusSignal.set('loading');
    const built = await this.sequencer.build(startIndex, {
      current: () => token === this.loadToken,
      startPaused: () => this.pauseRequested,
      continuous: () => this.canUseSequence(),
    });
    // Resumed a hop after the sequencer settled, so a stop or a newer load may
    // have landed in between. Whatever it answered, acting on it now would
    // start, fail, or fall back for a load nobody is waiting on.
    if (token !== this.loadToken || built.kind === 'superseded') {
      return;
    }
    if (built.kind === 'failed') {
      this.loading = false;
      this.stopWithFailure({ kind: 'storage', message: built.message });
      return;
    }
    if (built.kind === 'per-sentence') {
      this.loading = false;
      await this.load(sentenceId);
      return;
    }
    this.loading = false;
    this.pauseRequested = false;
    this.currentSignal.set(sentenceId);
    this.statusSignal.set(built.startPaused ? 'paused' : 'playing');
    this.failureSignal.set(null);
    this.publishMediaMetadata(startIndex);
    this.mediaSession.setPlaybackState(built.startPaused ? 'paused' : 'playing');
    this.publishMediaPosition();
  }

  /**
   * The reading caught up with generation inside the resource.
   *
   * The element has run out of appended audio and is holding, not paused and
   * not ended. Saying `waiting` names the sentence it is holding for, exactly
   * as the per-sentence frontier does; nothing is unloaded, so the append that
   * follows reads on without a second Play.
   */
  private noteFrontierReached(): void {
    if (!this.sequencer.open || this.statusSignal() !== 'playing') {
      return;
    }
    const nextRef = this.catalogue.refs()[this.sequencer.appendedLimitIndex() + 1];
    if (nextRef === undefined) {
      return;
    }
    this.pendingSignal.set(nextRef.id);
    this.statusSignal.set('waiting');
    this.mediaSession.setPlaybackState('paused');
  }

  /** The appended clip arrived and the element started itself again. */
  private noteFrontierPassed(): void {
    if (!this.sequencer.loaded || this.statusSignal() !== 'waiting') {
      return;
    }
    this.pendingSignal.set(null);
    this.statusSignal.set('playing');
    this.mediaSession.setPlaybackState('playing');
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
    const position = this.catalogue.positionOf(sentenceId);
    const playable = this.catalogue.playable().get(sentenceId);
    if (playable === undefined) {
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }
    const cacheKey = playable.cacheKey;

    this.sequencer.release();
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

    const startPaused = this.pauseRequested || options?.startPaused === true;
    try {
      this.player.setRate(this.rateForPace(playable.pace));
      await this.player.play(clip.value.blob, {
        startPaused,
        ...(options?.startSeconds === undefined ? {} : { startSeconds: options.startSeconds }),
      });
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
    const located = this.sequencer.locate(this.player.elapsed());
    const ref = located === null ? undefined : this.catalogue.refs()[located.refIndex];
    if (located === null || ref === undefined) {
      return;
    }
    if (ref.id !== this.currentSignal()) {
      if (this.modeSignal() === 'sentence') {
        this.player.pause();
        this.statusSignal.set('stepped');
        this.mediaSession.setPlaybackState('paused');
        this.player.seek(located.start);
        // Keep the cursor on the sentence that was actually heard. Continuing
        // advances from it to `ref`; moving the cursor here skipped `ref` on the
        // next press and made the player jump straight to the sentence after it.
        this.publishMediaPosition();
        return;
      }
      this.currentSignal.set(ref.id);
      this.publishMediaMetadata(located.refIndex);
    }
    this.publishMediaPosition();
  }

  private seekSequenceTime(seconds: number): void {
    const time = this.sequencer.clampTime(seconds);
    if (time === null) {
      return;
    }
    this.player.seek(time);
    this.followSequencePosition();
  }

  private publishMediaMetadata(index: number): void {
    const readingTitle = mediaArtist(this.catalogue.reading()?.title ?? '');
    this.mediaSession.setMetadata({
      title: readingTitle === '' ? 'Japanese story' : readingTitle,
      artist: 'Monosai',
      album: `Sentence ${String(index + 1)} of ${String(this.catalogue.sentenceCount())}`,
    });
  }

  /**
   * Publishes where the reading is, over what has been appended so far.
   *
   * The duration of an open resource grows as the reading is generated, so the
   * lock-screen timeline lengthens behind the position rather than being wrong
   * about where the end is.
   */
  private publishMediaPosition(): void {
    const timeline = this.sequencer.timeline;
    if (timeline === null || timeline.duration <= 0) {
      this.mediaSession.setPositionState(null);
      return;
    }
    this.mediaSession.setPositionState({
      duration: timeline.duration,
      playbackRate: this.rateForPace(this.sequencer.pace ?? 'baked'),
      position: Math.min(Math.max(this.player.elapsed(), 0), timeline.duration),
    });
  }

  private loadedPace(): ClipPace {
    const pace = this.sequencer.pace;
    if (pace !== null) {
      return pace;
    }
    const current = this.currentSignal();
    return current === null ? 'baked' : (this.catalogue.playable().get(current)?.pace ?? 'baked');
  }

  private rateForPace(pace: ClipPace): number {
    return pace === 'playback' ? this.playbackRate() : 1;
  }

  /** The nearest sentence in `direction` from the current one that has a clip, or -1. */
  private availableIndexFrom(direction: 1 | -1): number {
    return this.catalogue.availableIndexFrom(this.currentSignal(), direction);
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
