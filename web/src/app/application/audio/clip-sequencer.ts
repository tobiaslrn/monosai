import { Injectable, inject } from '@angular/core';
import type { SentenceId } from '../../domain/shared/ids';
import { ENRICHMENT_REPOSITORY } from '../shared/repository-tokens';
import { AUDIO_PLAYER, type AudioSequenceClip } from './audio-player';
import { ContinuousTrack } from './continuous-track';
import { MEDIA_SESSION } from './media-session';
import { PlaybackClipsStore, type ClipPace } from './playback-clips.store';
import { PlaybackTransportStore, type PlaybackFailure } from './playback-transport.store';

/** Audio containers that can be appended to one native continuous resource. */
type SequenceMimeType = 'audio/mpeg' | 'audio/webm';

function isSequenceMimeType(mimeType: string): mimeType is SequenceMimeType {
  return mimeType === 'audio/mpeg' || mimeType === 'audio/webm';
}

/** What a load is: something the learner pressed, or reading on by itself. */
export interface LoadOptions {
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
 * Gets stored clips into the application's one `AudioPlayer`.
 *
 * Two paths, and this is the only unit that knows which one is playing. A
 * **sentence clip** is read from storage immediately before it is played and
 * replaced at every seam. A **continuous track** (ADR 0039, ADR 0045) is one
 * native resource built from the contiguous run of clips from the sentence
 * being started from, left open while the reading is short of its end, and
 * grown as each sentence is stored, so a locked Android screen keeps reading:
 * the element never goes quiet between two sentences.
 *
 * It also owns the bookkeeping of a load in flight — the generation token that
 * stops a superseded clip from starting, and a Pause that arrived while a clip
 * was being read — because only the code that awaits storage can honour them.
 *
 * Which sentence to load, and when, is decided by its callers.
 */
@Injectable({ providedIn: 'root' })
export class ClipSequencer {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly player = inject(AUDIO_PLAYER);
  private readonly mediaSession = inject(MEDIA_SESSION);
  private readonly clips = inject(PlaybackClipsStore);
  private readonly transport = inject(PlaybackTransportStore);

  /** Generation counter, so a clip loaded for a superseded call never starts. */
  private loadToken = 0;
  /** Whether a clip read is in flight, so Pause knows there is no player to pause. */
  private loading = false;
  /** A Pause that arrived during a load, to be honoured when the clip lands. */
  private pauseRequested = false;
  /** The native continuous resource, when one is loaded. */
  private track: ContinuousTrack | null = null;
  /**
   * The append in flight, so two refreshes cannot append the same clip twice.
   *
   * `prepare` runs on every completed sentence of a generation run and is
   * routinely re-entered while an earlier call is still reading blobs.
   */
  private extending: Promise<void> | null = null;

  /** Whether a continuous track is loaded. */
  hasTrack(): boolean {
    return this.track !== null;
  }

  /** Where a sentence starts in the loaded track, or null if it is not in it. */
  timeOf(refIndex: number): number | null {
    return this.track?.timeOf(refIndex) ?? null;
  }

  /**
   * Index in the reading of the next sentence an open track is waiting to be
   * given, or null when no open track is loaded.
   */
  nextToAppend(): number | null {
    const track = this.track;
    return track?.open === true ? track.lastIndex() + 1 : null;
  }

  /**
   * Whether this start can be one native resource.
   *
   * Continuous mode only: one-sentence-at-a-time stops at every seam, which is
   * the JavaScript the resource exists to remove. Everything else the resource
   * needs — clips to build it from, a container that can hold them, a browser
   * with MediaSource — is decided in `loadTrack`, which falls back to the
   * per-sentence path when any of it is missing.
   */
  canUseTrack(): boolean {
    return this.transport.mode() === 'continuous';
  }

  /**
   * Pauses, including while the next clip is still being read.
   *
   * A press during the load window used to be dropped, and the next sentence
   * then started anyway. It is now remembered, and the clip arrives paused.
   */
  pause(): void {
    const status = this.transport.status();
    if (status !== 'playing' && status !== 'loading') {
      return;
    }
    if (this.loading) {
      this.pauseRequested = true;
    } else {
      this.player.pause();
    }
    this.transport.enter('paused');
    this.publishPosition();
  }

  /** The learner Stop. Leaves the cursor cleared and the lock screen empty. */
  stop(): void {
    this.loadToken += 1;
    this.loading = false;
    this.pauseRequested = false;
    this.track = null;
    this.player.stop();
    this.transport.reset();
  }

  stopWithFailure(failure: PlaybackFailure): void {
    this.stop();
    this.transport.fail(failure);
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
  finish(): void {
    this.loadToken += 1;
    this.loading = false;
    this.pauseRequested = false;
    this.transport.stopWaiting();
    this.transport.enter('ended');
    this.publishPosition();
  }

  /**
   * Loads one clip by cache key and plays it.
   *
   * The clip is read immediately before it is played rather than held: the
   * audio of a whole reading is far too much to keep in memory, and the object
   * URL of the sentence just finished is revoked as part of loading the next.
   */
  async load(sentenceId: SentenceId, options?: LoadOptions): Promise<void> {
    const token = (this.loadToken += 1);
    const position = this.clips.positionOf(sentenceId);
    const playable = this.clips.clipFor(sentenceId);
    if (playable === undefined) {
      this.stopWithFailure({ kind: 'missing-clip', position });
      return;
    }
    const cacheKey = playable.cacheKey;

    this.track = null;
    this.loading = true;
    if (options?.keepStatus !== true) {
      this.transport.enter('loading');
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
        startSeconds: options?.startSeconds,
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

    this.transport.moveTo(sentenceId);
    this.transport.setStatus(startPaused ? 'paused' : 'playing');
    this.transport.clearFailure();
    this.transport.publishMetadata(position - 1);
    this.transport.announce();
  }

  /**
   * Loads the clips that exist from one sentence on into one native resource.
   *
   * The run is contiguous from the start sentence rather than the whole
   * reading, so a session can begin while generation is still going. While it
   * is short of the end the resource is left **open**, and `extend` appends
   * each sentence as it is stored. That is what keeps a locked screen reading
   * on: the element never goes quiet between two sentences, so the document
   * keeps the media-playing reason not to be frozen, and the advance itself
   * happens inside the native pipeline rather than in an event handler.
   */
  async loadTrack(sentenceId: SentenceId): Promise<void> {
    const token = (this.loadToken += 1);
    const refs = this.clips.refs();
    const startIndex = this.clips.indexOf(sentenceId);
    if (startIndex === -1) {
      return;
    }
    const run = this.clips.contiguousRunFrom(startIndex);
    if (run.length === 0) {
      await this.load(sentenceId);
      return;
    }
    this.loading = true;
    this.transport.enter('loading');
    const byKey = new Map<string, AudioSequenceClip>();
    const clips: AudioSequenceClip[] = [];
    const keys: string[] = [];
    for (const ref of run) {
      const playable = this.clips.clipFor(ref.id);
      if (playable === undefined) {
        this.loading = false;
        await this.load(sentenceId);
        return;
      }
      const cacheKey = playable.cacheKey;
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
          this.loading = false;
          await this.load(sentenceId);
          return;
        }
        if (!isSequenceMimeType(loaded.value.mimeType) && loaded.value.mimeType !== 'audio/wav') {
          this.loading = false;
          await this.load(sentenceId);
          return;
        }
        clip = { blob: loaded.value.blob, mimeType: loaded.value.mimeType };
        byKey.set(cacheKey, clip);
      }
      keys.push(cacheKey);
      clips.push(clip);
    }

    const complete = startIndex + run.length === refs.length;
    const open = !complete && clips.every((clip) => isSequenceMimeType(clip.mimeType));
    if (!complete && !open) {
      // A WAV resource states its own length and cannot grow, so building one
      // over part of a reading would end the session at the frontier with no
      // way on. The per-sentence path waits there instead.
      this.loading = false;
      await this.load(sentenceId);
      return;
    }

    const startPaused = this.pauseRequested;
    try {
      this.player.setRate(this.rateForPace(this.clips.clipFor(sentenceId)?.pace ?? 'baked'));
      const timeline = await this.player.playSequence(clips, {
        startIndex: 0,
        startPaused,
        open,
      });
      if (token !== this.loadToken) {
        return;
      }
      if (!this.canUseTrack()) {
        // The learner selected sentence mode while the native resource was
        // being assembled. Replace the just-started resource before it can run
        // across its first boundary.
        this.loading = false;
        await this.load(sentenceId);
        return;
      }
      this.track = new ContinuousTrack(
        timeline,
        startIndex,
        this.clips.clipFor(sentenceId)?.pace ?? 'baked',
        keys,
      );
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
    this.transport.moveTo(sentenceId);
    this.transport.setStatus(startPaused ? 'paused' : 'playing');
    this.transport.clearFailure();
    this.transport.publishMetadata(startIndex);
    this.transport.announce();
    this.publishPosition();
  }

  /**
   * Appends every sentence stored since the track was last extended.
   *
   * Called from `prepare`, which the reader already re-runs on each completed
   * sentence of a generation run. Playback therefore learns of a clip from its
   * own read of what is stored, and still does not watch the job (ADR 0037).
   */
  async extend(): Promise<void> {
    const track = this.track;
    if (track === null || !track.open || this.extending !== null) {
      return;
    }
    this.extending = this.appendStoredClips(track);
    try {
      await this.extending;
    } finally {
      this.extending = null;
    }
  }

  /** Declares the track complete, so the element can reach its end. */
  seal(): void {
    if (this.track?.seal() === true) {
      this.player.closeSequence();
    }
  }

  /**
   * Leaves a continuous track without restarting the sentence being heard.
   *
   * Pausing first closes the IndexedDB read window in which the old resource
   * could otherwise cross the seam. The single clip resumes at the equivalent
   * sentence-relative offset and its native `ended` event stops exactly there.
   */
  async useCurrentSentenceClip(): Promise<void> {
    const track = this.track;
    const current = this.transport.currentSentenceId();
    const status = this.transport.status();
    if (track === null || current === null || (status !== 'playing' && status !== 'paused')) {
      return;
    }
    const span = track.span(this.clips.indexOf(current));
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
   * Maps the element's position in a track back to the sentence being heard.
   *
   * In one-sentence-at-a-time a crossed boundary is the seam the learner asked
   * to stop at, so the element is paused and put back at it.
   */
  followPosition(): void {
    const track = this.track;
    if (track === null) {
      return;
    }
    const heard = track.sentenceAt(this.player.elapsed());
    const refs = this.clips.refs();
    if (heard.index >= refs.length) {
      return;
    }
    const ref = refs[heard.index];
    if (ref.id !== this.transport.currentSentenceId()) {
      if (this.transport.mode() === 'sentence') {
        this.player.pause();
        this.transport.enter('stepped');
        this.player.seek(heard.start);
        // Keep the cursor on the sentence that was actually heard. Continuing
        // advances from it to `ref`; moving the cursor here skipped `ref` on the
        // next press and made the player jump straight to the sentence after it.
        this.publishPosition();
        return;
      }
      this.transport.moveTo(ref.id);
      this.transport.publishMetadata(heard.index);
    }
    this.publishPosition();
  }

  /** Seeks a track to a time, as the lock-screen scrubber asks for. */
  seekTime(seconds: number): void {
    const track = this.track;
    if (track === null) {
      return;
    }
    this.player.seek(track.clamp(seconds));
    this.followPosition();
  }

  /** Applies the learner's local speech rate to whatever is loaded. */
  applyRate(): void {
    this.player.setRate(this.rateForPace(this.loadedPace()));
    this.publishPosition();
  }

  /**
   * Publishes where the reading is, over what has been appended so far.
   *
   * The duration of an open resource grows as the reading is generated, so the
   * lock-screen timeline lengthens behind the position rather than being wrong
   * about where the end is.
   */
  publishPosition(): void {
    const timeline = this.track?.timeline;
    if (timeline === undefined || timeline.duration <= 0) {
      this.mediaSession.setPositionState(null);
      return;
    }
    this.mediaSession.setPositionState({
      duration: timeline.duration,
      playbackRate: this.rateForPace(this.track?.pace ?? 'baked'),
      position: Math.min(Math.max(this.player.elapsed(), 0), timeline.duration),
    });
  }

  private async appendStoredClips(track: ContinuousTrack): Promise<void> {
    const refs = this.clips.refs();
    const playable = this.clips.playable();
    // A current cache key can change while a resource is open, for example when
    // a regenerated clip replaces an older fallback. Appending that clip would
    // change the resource's source configuration, so it is sealed instead and
    // what is already in it plays out.
    const rekeyed =
      track.baseIndex + track.keys.length > refs.length ||
      track.keys.some(
        (key, offset) => playable.get(refs[track.baseIndex + offset].id)?.cacheKey !== key,
      );
    if (rekeyed) {
      this.seal();
      return;
    }

    const pending: { readonly cacheKey: string }[] = [];
    for (let index = track.lastIndex() + 1; index < refs.length; index += 1) {
      const clip = playable.get(refs[index].id);
      if (clip?.pace !== track.pace || !this.clips.isAvailable(refs[index].id)) {
        break;
      }
      pending.push({ cacheKey: clip.cacheKey });
    }
    if (pending.length === 0) {
      const next = playable.get(refs[track.lastIndex() + 1]?.id);
      if (next !== undefined && next.pace !== track.pace) {
        this.seal();
      }
      return;
    }

    const byKey = new Map<string, AudioSequenceClip>();
    const clips: AudioSequenceClip[] = [];
    for (const item of pending) {
      let clip = byKey.get(item.cacheKey);
      if (clip === undefined) {
        const loaded = await this.enrichment.getAudioByCacheKey(item.cacheKey);
        if (this.track !== track) {
          return;
        }
        if (!loaded.ok || loaded.value === null || !isSequenceMimeType(loaded.value.mimeType)) {
          // Nothing that can go into this resource. Sealing keeps what is in it
          // playable and lets the element finish, rather than failing a session
          // over a sentence it has not reached yet.
          this.seal();
          return;
        }
        clip = { blob: loaded.value.blob, mimeType: loaded.value.mimeType };
        byKey.set(item.cacheKey, clip);
      }
      clips.push(clip);
    }

    try {
      const timeline = await this.player.extendSequence(clips);
      if (this.track !== track) {
        return;
      }
      track.extend(
        timeline,
        pending.map((item) => item.cacheKey),
      );
    } catch {
      if (this.track === track) {
        this.seal();
      }
      return;
    }
    this.publishPosition();
    const nextIndex = track.lastIndex() + 1;
    const next = playable.get(refs[nextIndex]?.id);
    if (nextIndex >= refs.length || (next !== undefined && next.pace !== track.pace)) {
      this.seal();
    }
  }

  private loadedPace(): ClipPace {
    if (this.track !== null) {
      return this.track.pace;
    }
    const current = this.transport.currentSentenceId();
    return current === null ? 'baked' : (this.clips.clipFor(current)?.pace ?? 'baked');
  }

  private rateForPace(pace: ClipPace): number {
    return pace === 'playback' ? this.transport.playbackRate() : 1;
  }
}
