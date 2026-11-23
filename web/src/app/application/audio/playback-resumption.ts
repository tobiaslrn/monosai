import { Injectable, inject } from '@angular/core';
import { AUDIO_PLAYER } from './audio-player';
import { ClipSequencer } from './clip-sequencer';
import { PlaybackClipsStore } from './playback-clips.store';
import { PlaybackNavigator } from './playback-navigator';
import { PlaybackTransportStore } from './playback-transport.store';

/**
 * How a held session goes on, or is let go.
 *
 * A session is held in one of three ways: `paused` by the learner, `stepped`
 * at a seam by one-sentence-at-a-time, or `waiting` at the generation frontier
 * (ADR 0034, ADR 0045). Each has its own way back to `playing`, and `waiting`
 * also has a way out when the clips it waits for are not coming.
 *
 * **Nothing here starts a session.** Every path is reached only from a state
 * that cannot be entered without the learner pressing Play, which is what keeps
 * reading on by itself from being an autoplay.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackResumption {
  private readonly player = inject(AUDIO_PLAYER);
  private readonly clips = inject(PlaybackClipsStore);
  private readonly transport = inject(PlaybackTransportStore);
  private readonly sequencer = inject(ClipSequencer);
  private readonly navigator = inject(PlaybackNavigator);

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
    if (this.transport.status() !== 'paused') {
      return;
    }
    if (this.sequencer.resumePendingLoad()) {
      // Paused while the next clip was being read: that clip plays when it
      // lands, and the element still holds the sentence before it.
      if (continueReading) {
        this.transport.readOn();
      }
      return;
    }
    if (await this.resumeWait()) {
      return;
    }
    try {
      await this.player.resume();
    } catch {
      // Almost always the autoplay policy refusing a resume it did not trace to
      // a gesture. That is not an undecodable clip, and destroying the session
      // over it loses the place the learner had reached.
      this.transport.enter('paused');
      return;
    }
    if (continueReading) {
      // Only once the resume worked: a refused one leaves the session as it was.
      this.transport.readOn();
    }
    this.transport.enter('playing');
    this.sequencer.publishPosition();
  }

  /**
   * Takes up a wait at the frontier that a Pause interrupted.
   *
   * The clip may have been stored while the session was paused, in which case
   * it plays now; otherwise the session waits for it again. A sentence clip is
   * never resumed here: the element still holds the sentence that ended, and
   * resuming it would play that sentence again.
   *
   * Returns false when the paused session was not waiting, or has moved since,
   * so an ordinary resume follows.
   */
  private async resumeWait(): Promise<boolean> {
    const pending = this.transport.pendingSentenceId();
    if (pending === null) {
      return false;
    }
    const current = this.transport.currentSentenceId();
    if (current === null || this.clips.indexOf(pending) !== this.clips.indexOf(current) + 1) {
      // The learner moved the cursor while paused: the wait no longer applies.
      this.transport.stopWaiting();
      return false;
    }
    if (this.sequencer.hasTrack()) {
      try {
        await this.player.resume();
      } catch {
        this.transport.enter('paused');
        return true;
      }
      const nextToAppend = this.sequencer.nextToAppend();
      if (nextToAppend !== null && this.clips.indexOf(pending) >= nextToAppend) {
        // Nothing was appended while paused: the element holds again.
        this.transport.enter('waiting');
      } else {
        this.transport.stopWaiting();
        this.transport.enter('playing');
      }
      this.sequencer.publishPosition();
      return true;
    }
    if (this.clips.isAvailable(pending)) {
      this.transport.stopWaiting();
      await this.sequencer.load(pending);
      return true;
    }
    this.transport.enter('waiting');
    return true;
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
    const current = this.transport.currentSentenceId();
    if (current === null) {
      return;
    }
    const target = this.clips.availableIndexFrom(current, 1);
    if (target !== -1) {
      await this.navigator.step(1);
      return;
    }
    const refs = this.clips.refs();
    const upcoming = refs[this.clips.indexOf(current) + 1];
    if (upcoming === undefined) {
      // The last sentence. Nothing is coming, and the reading is over.
      return;
    }
    this.transport.countNavigation();
    this.transport.readOn();
    this.transport.waitFor(upcoming.id);
  }

  /**
   * Reads on when the clip a waiting session stopped at has been stored.
   *
   * This is not an autoplay. It is the continuation of a session the learner
   * started by pressing Play, which is why it is reached only from `waiting` —
   * a state that cannot be entered without that press.
   */
  async continueIfPendingArrived(): Promise<void> {
    const pending = this.transport.pendingSentenceId();
    if (pending === null || this.transport.status() !== 'waiting') {
      return;
    }
    if (this.sequencer.hasTrack()) {
      // A continuous session waits inside its own resource. Appending the clip
      // is what reads on there, and loading it separately would replace the
      // resource the reading is playing from.
      return;
    }
    if (!this.clips.isAvailable(pending)) {
      return;
    }
    this.transport.stopWaiting();
    await this.sequencer.load(pending, { keepStatus: true });
  }

  /**
   * The reading caught up with generation inside the resource.
   *
   * The element has run out of appended audio and is holding, not paused and
   * not ended. Saying `waiting` names the sentence it is holding for, exactly
   * as the per-sentence frontier does; nothing is unloaded, so the append that
   * follows reads on without a second Play.
   */
  noteFrontierReached(): void {
    const nextIndex = this.sequencer.nextToAppend();
    if (nextIndex === null || this.transport.status() !== 'playing') {
      return;
    }
    const upcoming = this.clips.refs()[nextIndex];
    if (upcoming === undefined) {
      return;
    }
    this.transport.waitFor(upcoming.id);
  }

  /** The appended clip arrived and the element started itself again. */
  noteFrontierPassed(): void {
    if (!this.sequencer.hasTrack() || this.transport.status() !== 'waiting') {
      return;
    }
    this.transport.stopWaiting();
    this.transport.enter('playing');
    this.sequencer.publishPosition();
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
    const status = this.transport.status();
    // A wait the learner paused ends too, or Play would take up a wait for a
    // clip that is no longer coming.
    const waits =
      status === 'waiting' || (status === 'paused' && this.transport.pendingSentenceId() !== null);
    if (!waits) {
      return;
    }
    const position = this.transport.pendingPosition();
    this.transport.stopWaiting();
    this.transport.enter('ended');
    this.transport.fail({ kind: 'not-generated', position });
  }
}
