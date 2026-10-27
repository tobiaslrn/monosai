import { Injectable, computed, inject, signal } from '@angular/core';
import { isPlaybackRate, type PlaybackRate } from '../../domain/settings/settings';
import type { SentenceId } from '../../domain/shared/ids';
import { AppSettingsStore } from '../settings/app-settings.store';
import { MEDIA_SESSION } from './media-session';
import { PlaybackClipsStore } from './playback-clips.store';

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

/**
 * How much of a reading title the lock screen is given.
 *
 * An import saved without an explicit title has its body text as its title, so
 * publishing it whole put a wall of Japanese on the notification.
 */
const MEDIA_ARTIST_LIMIT = 60;

/**
 * The state the transport renders, and the platform media session's view of it.
 *
 * Signals and their invariants only: nothing here reads storage or drives the
 * player. Every status change goes through `enter`, so the lock screen's
 * playing/paused state can never disagree with the player card's.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackTransportStore {
  private readonly clips = inject(PlaybackClipsStore);
  private readonly mediaSession = inject(MEDIA_SESSION);
  private readonly appSettings = inject(AppSettingsStore);

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

  /**
   * True while playing exactly one sentence rather than reading on.
   *
   * The sentence popover Play plays that sentence and stops, because the
   * learner asked about that sentence; the player Play reads the whole
   * reading. Both use the one element, so the difference has to live here
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

  /** Position of the sentence being read, one-based, or 0 when nothing is. */
  readonly currentPosition = computed(() => {
    const current = this.currentSignal();
    return current === null ? 0 : this.clips.positionOf(current);
  });

  /** Position of the sentence a waiting session is waiting for, or 0. */
  readonly pendingPosition = computed(() => {
    const pending = this.pendingSignal();
    return pending === null ? 0 : this.clips.positionOf(pending);
  });

  /**
   * Moves a live session to `status`, and tells the media session the same.
   *
   * `loading` is not announced: the lock screen keeps whatever it last showed
   * for the length of a read from storage.
   */
  enter(status: Exclude<PlaybackStatus, 'idle'>): void {
    this.setStatus(status);
    this.announce();
  }

  /**
   * Moves a live session to `status` without telling the media session yet.
   *
   * For a clip that has just landed, whose metadata has to reach the lock
   * screen before its playing state does; `announce` follows.
   */
  setStatus(status: Exclude<PlaybackStatus, 'idle'>): void {
    this.statusSignal.set(status);
  }

  /** Tells the media session the status the session is in. */
  announce(): void {
    const status = this.statusSignal();
    if (status !== 'loading' && status !== 'idle') {
      this.mediaSession.setPlaybackState(status === 'playing' ? 'playing' : 'paused');
    }
  }

  /** Whether the session plays exactly one sentence and stops at its end. */
  readsOneSentence(): boolean {
    return this.single;
  }

  /** The popover Play: this sentence, and then stop. */
  playOneSentence(): void {
    this.single = true;
  }

  /** The player Play: read on through the reading. */
  readOn(): void {
    this.single = false;
  }

  /** Ends the session: no cursor, nothing waited for, and an empty lock screen. */
  reset(): void {
    this.single = false;
    this.pendingSignal.set(null);
    this.statusSignal.set('idle');
    this.currentSignal.set(null);
    this.mediaSession.setPlaybackState('none');
    this.mediaSession.clear();
  }

  /** Moves the cursor. */
  moveTo(sentenceId: SentenceId): void {
    this.currentSignal.set(sentenceId);
  }

  /** Records a navigation the learner asked for. */
  countNavigation(): void {
    this.navigationSignal.update((count) => count + 1);
  }

  /** Holds a live session for a sentence that has no clip yet. */
  waitFor(sentenceId: SentenceId): void {
    this.pendingSignal.set(sentenceId);
    this.enter('waiting');
  }

  /** Forgets the sentence a session was waiting for. */
  stopWaiting(): void {
    this.pendingSignal.set(null);
  }

  fail(failure: PlaybackFailure): void {
    this.failureSignal.set(failure);
  }

  clearFailure(): void {
    this.failureSignal.set(null);
  }

  changeMode(mode: PlaybackMode): void {
    this.modeSignal.set(mode);
  }

  /** Persists the learner's local speech rate. */
  saveRate(rate: PlaybackRate): void {
    void this.appSettings.setReaderPreference('playbackRate', rate);
  }

  /** Puts the reading and the sentence at `index` on the lock screen. */
  publishMetadata(index: number): void {
    const readingTitle = mediaArtist(this.clips.reading()?.title ?? '');
    this.mediaSession.setMetadata({
      title: readingTitle === '' ? 'Japanese story' : readingTitle,
      artist: 'Monosai',
      album: `Sentence ${String(index + 1)} of ${String(this.clips.refs().length)}`,
    });
  }
}

/** A reading title short enough to read on a notification. */
function mediaArtist(title: string): string {
  const trimmed = title.trim();
  return trimmed.length <= MEDIA_ARTIST_LIMIT
    ? trimmed
    : `${trimmed.slice(0, MEDIA_ARTIST_LIMIT - 1)}…`;
}
