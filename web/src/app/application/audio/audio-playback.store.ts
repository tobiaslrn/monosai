import { Injectable, computed, inject } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import { isPlaybackRate, type PlaybackRate } from '../../domain/settings/settings';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AUDIO_PLAYER } from './audio-player';
import { ClipSequencer } from './clip-sequencer';
import { MEDIA_SESSION } from './media-session';
import { PlaybackClipsStore } from './playback-clips.store';
import { PlaybackMaintenance } from './playback-maintenance';
import { PlaybackNavigator } from './playback-navigator';
import { PlaybackResumption } from './playback-resumption';
import {
  PLAYBACK_MODES,
  PlaybackTransportStore,
  type PlaybackMode,
} from './playback-transport.store';

export { REPLAY_WINDOW_SECONDS } from './playback-navigator';
export {
  PLAYBACK_MODES,
  type PlaybackFailure,
  type PlaybackMode,
  type PlaybackStatus,
} from './playback-transport.store';

/**
 * Whole-reading playback: the one surface the rest of the application uses.
 *
 * Root-provided because `system-architecture.md` section 4 lists active audio
 * playback among the few application-wide signals: sound outlives the component
 * that started it, and a per-reader instance would leave one reading playing
 * behind another. It owns the wiring between the application's single
 * `AudioPlayer`, the platform media session, and the units that do the work:
 *
 * - `PlaybackClipsStore` — which clips exist for the reading, and which play;
 * - `PlaybackTransportStore` — the state the transport renders;
 * - `ClipSequencer` — getting clips into the player, sentence by sentence or as
 *   one continuous track that grows while it is generated (ADR 0039, ADR 0045);
 * - `PlaybackNavigator` — where a start, a step, a seek, or the automatic
 *   advance lands;
 * - `PlaybackResumption` — how a paused, stepped, or waiting session goes on;
 * - `PlaybackMaintenance` — stopping and forgetting when stored audio goes.
 *
 * Playback is **progressive at sentence granularity** (ADR 0034): a reading can
 * be started as soon as the sentence being started from has a clip, and reading
 * on waits at the frontier rather than stopping there. Nothing is streamed —
 * each clip is a whole file, and the unit that arrives is a sentence.
 *
 * **Nothing here ever starts on its own.** There is no effect that plays, no
 * autoplay after preparation, and `prepare` is a pair of local reads that leave
 * the player untouched. Every clip that is heard was asked for by a call from a
 * control the learner pressed.
 */
@Injectable({ providedIn: 'root' })
export class AudioPlaybackStore {
  private readonly player = inject(AUDIO_PLAYER);
  private readonly mediaSession = inject(MEDIA_SESSION);
  private readonly clips = inject(PlaybackClipsStore);
  private readonly transport = inject(PlaybackTransportStore);
  private readonly sequencer = inject(ClipSequencer);
  private readonly navigator = inject(PlaybackNavigator);
  private readonly resumption = inject(PlaybackResumption);
  private readonly maintenance = inject(PlaybackMaintenance);

  readonly status = this.transport.status;
  readonly currentSentenceId = this.transport.currentSentenceId;
  readonly failure = this.transport.failure;
  readonly explicitNavigation = this.transport.explicitNavigation;
  readonly pendingSentenceId = this.transport.pendingSentenceId;
  readonly mode = this.transport.mode;
  readonly playbackRate = this.transport.playbackRate;
  readonly stepMode = this.transport.stepMode;
  readonly reading = this.clips.reading;
  readonly isActive = this.transport.isActive;
  readonly sentenceCount = this.clips.sentenceCount;
  readonly missingCount = this.clips.missingCount;
  readonly currentPosition = this.transport.currentPosition;
  readonly availableCount = this.clips.availableCount;
  readonly hasPlayableAudio = this.clips.hasPlayableAudio;
  readonly hasStaleAudio = this.clips.hasStaleAudio;
  readonly canPlayWholeReading = this.clips.canPlayWholeReading;
  readonly pendingPosition = this.transport.pendingPosition;

  /** Whether Next has a later sentence with a clip to jump to. */
  readonly canGoNext = computed(
    () => this.clips.availableIndexFrom(this.transport.currentSentenceId(), 1) !== -1,
  );

  /**
   * Whether Back has anywhere to go.
   *
   * True whenever a sentence is current, because the first meaning of Back is
   * replaying the sentence being read, and that never depends on a neighbour.
   */
  readonly canGoPrevious = computed(() => this.transport.currentSentenceId() !== null);

  constructor() {
    this.player.onEnded(() => {
      void this.navigator.advanceAfterEnd();
    });
    this.player.onError(() => {
      this.sequencer.stopWithFailure({
        kind: 'decode-failed',
        position: this.transport.currentPosition(),
      });
    });
    this.player.onTimeUpdate(() => {
      this.sequencer.followPosition();
    });
    this.player.onStalled(() => {
      this.resumption.noteFrontierReached();
    });
    this.player.onResumed(() => {
      this.resumption.noteFrontierPassed();
    });
    this.mediaSession.setHandlers({
      play: () => {
        // A session held at a seam has nothing to resume, and a headset Play
        // there means the same as the transport's: read on.
        void (this.transport.status() === 'stepped'
          ? this.resumption.continueReading()
          : this.resumption.resume());
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
        this.sequencer.seekTime(seconds);
      },
    });
  }

  /**
   * Reads which clips exist for a reading. Local only, and silent.
   *
   * Called when the reader opens and again whenever stored audio may have
   * changed. Opening a reading therefore learns whether it can be played
   * without making a request and without making a sound. A session waiting
   * for a clip that has now been stored reads on, and an open continuous track
   * is given whatever has been stored since it was last extended.
   */
  async prepare(reading: Reading): Promise<void> {
    const previous = this.clips.reading();
    if (previous !== null && previous.id !== reading.id) {
      this.stop();
    }
    const refreshed = await this.clips.refresh(reading);
    if (refreshed.kind === 'superseded') {
      return;
    }
    if (refreshed.kind === 'failed') {
      this.transport.fail({ kind: 'storage', message: refreshed.message });
      return;
    }
    await this.resumption.continueIfPendingArrived();
    await this.sequencer.extend();
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
    const next = PLAYBACK_MODES.indexOf(this.transport.mode()) + 1;
    this.setMode(PLAYBACK_MODES[next % PLAYBACK_MODES.length] ?? this.transport.mode());
  }

  /** Persists and immediately applies the learner's local speech rate. */
  setPlaybackRate(rate: PlaybackRate): void {
    if (!isPlaybackRate(rate)) {
      return;
    }
    this.transport.saveRate(rate);
    this.sequencer.applyRate();
  }

  seekTo(position: number): Promise<void> {
    return this.navigator.seekTo(position);
  }

  play(): Promise<void> {
    return this.navigator.play();
  }

  /** Starts at one sentence — the player "start from the one being read". */
  playFrom(sentenceId: SentenceId): Promise<void> {
    return this.navigator.startAt(sentenceId);
  }

  /** Plays one sentence and stops at its end. */
  playSentence(sentenceId: SentenceId): Promise<void> {
    return this.navigator.playSentence(sentenceId);
  }

  pause(): void {
    this.sequencer.pause();
  }

  resume(continueReading = false): Promise<void> {
    return this.resumption.resume(continueReading);
  }

  /** The learner Stop. Leaves the cursor cleared and the lock screen empty. */
  stop(): void {
    this.sequencer.stop();
  }

  next(): Promise<void> {
    return this.navigator.step(1);
  }

  continueReading(): Promise<void> {
    return this.resumption.continueReading();
  }

  previous(): Promise<void> {
    return this.navigator.previous();
  }

  stopExpectingClips(): void {
    this.resumption.stopExpectingClips();
  }

  readingDeleted(readingId: ReadingId): void {
    this.maintenance.readingDeleted(readingId);
  }

  audioCacheCleared(): void {
    this.maintenance.audioCacheCleared();
  }

  readingAudioCleared(readingId: ReadingId): void {
    this.maintenance.readingAudioCleared(readingId);
  }

  /** Whether one sentence can be started from right now. */
  isAvailable(sentenceId: SentenceId | null): boolean {
    return this.clips.isAvailable(sentenceId);
  }

  /** Clears a reported failure once the surface that showed it is done with it. */
  acknowledgeFailure(): void {
    this.transport.clearFailure();
  }

  private setMode(mode: PlaybackMode): void {
    if (mode === this.transport.mode()) {
      return;
    }
    // Resolve the current sentence while this is still continuous. In sentence
    // mode the fallback boundary guard deliberately keeps the old cursor.
    if (mode === 'sentence' && this.sequencer.hasTrack()) {
      this.sequencer.followPosition();
    }
    this.transport.changeMode(mode);
    if (mode === 'sentence') {
      void this.sequencer.useCurrentSentenceClip();
    }
  }
}
