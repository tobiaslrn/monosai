import { Injectable, inject } from '@angular/core';
import type { SentenceId } from '../../domain/shared/ids';
import { AUDIO_PLAYER } from './audio-player';
import { ClipSequencer } from './clip-sequencer';
import { PlaybackClipsStore } from './playback-clips.store';
import { PlaybackTransportStore } from './playback-transport.store';

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
 * Moves through a reading: starts, steps, seeks, replays, and the automatic
 * advance at the end of a sentence clip.
 *
 * Every move lands on a sentence that has a clip, because generation can leave
 * holes and a hole must not be a wall. Whether the move is a seek inside a
 * continuous track or a new load is the sequencer's to carry out; this decides
 * where to go.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackNavigator {
  private readonly player = inject(AUDIO_PLAYER);
  private readonly clips = inject(PlaybackClipsStore);
  private readonly transport = inject(PlaybackTransportStore);
  private readonly sequencer = inject(ClipSequencer);

  /**
   * Starts at the first sentence that has a clip.
   *
   * Not strictly the first sentence: a run that failed or is still filling in
   * can leave sentence one missing while the rest of the reading is ready, and
   * refusing to start there would make audio the learner has already paid for
   * unreachable from the transport.
   */
  play(): Promise<void> {
    const first = this.clips.firstAvailable();
    return first === undefined ? Promise.resolve() : this.startAt(first);
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
    if (!this.clips.isAvailable(sentenceId)) {
      // Reported the way `startAt` reports it: naming the sentence without
      // tearing down whatever session the learner already had.
      this.transport.fail({ kind: 'missing-clip', position: this.clips.positionOf(sentenceId) });
      return;
    }
    this.transport.countNavigation();
    this.transport.playOneSentence();
    this.transport.stopWaiting();
    await this.sequencer.load(sentenceId);
  }

  /**
   * Starts a reading session at one sentence.
   *
   * Refused only when *that* sentence has no clip. Whether the sentences after
   * it exist yet is not the business of this call: reading on waits for them.
   */
  async startAt(sentenceId: SentenceId): Promise<void> {
    if (!this.clips.isAvailable(sentenceId)) {
      this.transport.fail({ kind: 'missing-clip', position: this.clips.positionOf(sentenceId) });
      return;
    }
    this.transport.countNavigation();
    this.transport.readOn();
    this.transport.stopWaiting();
    if (this.sequencer.canUseTrack()) {
      await this.sequencer.loadTrack(sentenceId);
      return;
    }
    await this.sequencer.load(sentenceId);
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
    const refs = this.clips.refs();
    if (refs.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(Math.round(position), 1), refs.length);
    const index = this.clips.nearestAvailableIndex(clamped - 1);
    if (index === -1) {
      return;
    }
    const target = refs[index].id;
    if (this.transport.isActive()) {
      const time = this.sequencer.timeOf(index);
      if (time !== null) {
        this.transport.countNavigation();
        this.transport.moveTo(target);
        this.player.seek(time);
        this.transport.publishMetadata(index);
        this.sequencer.publishPosition();
        return;
      }
      // Outside the resource being played — a clip stored since it was built,
      // or one before the sentence it starts at. Starting there builds a new
      // resource from that sentence rather than seeking into silence.
      await this.startAt(target);
      return;
    }
    this.transport.countNavigation();
    this.transport.moveTo(target);
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
    if (this.transport.currentSentenceId() === null) {
      return Promise.resolve();
    }
    const currentStart =
      this.sequencer.timeOf(Math.max(this.transport.currentPosition() - 1, 0)) ?? 0;
    if (this.player.elapsed() - currentStart > REPLAY_WINDOW_SECONDS) {
      return this.replayCurrent();
    }
    return this.step(-1);
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
  async step(direction: 1 | -1): Promise<void> {
    const current = this.transport.currentSentenceId();
    if (current === null) {
      return;
    }
    const target = this.clips.availableIndexFrom(current, direction);
    if (target === -1) {
      if (direction === -1) {
        await this.replayCurrent();
      }
      return;
    }
    this.transport.countNavigation();
    this.transport.readOn();
    this.transport.stopWaiting();
    const time = this.sequencer.timeOf(target);
    if (time !== null) {
      this.transport.moveTo(this.clips.refs()[target].id);
      this.player.seek(time);
      try {
        await this.player.resume();
      } catch {
        this.transport.enter('paused');
        return;
      }
      this.transport.setStatus('playing');
      this.transport.publishMetadata(target);
      this.transport.announce();
      this.sequencer.publishPosition();
      return;
    }
    if (this.sequencer.hasTrack()) {
      // A sentence stored since the resource was built, or one before its
      // start. Starting there builds a resource from it rather than seeking
      // into audio the element does not have.
      await this.startAt(this.clips.refs()[target].id);
      return;
    }
    await this.sequencer.load(this.clips.refs()[target].id);
  }

  /** The automatic advance. Deliberately does not count as a navigation. */
  async advanceAfterEnd(): Promise<void> {
    const refs = this.clips.refs();
    const current = this.transport.currentSentenceId();
    if (current === null) {
      return;
    }
    if (this.sequencer.hasTrack()) {
      // A sealed resource can end at a pace boundary. Continue with the next
      // playable run rather than making the learner press Play again.
      const next = this.clips.availableIndexFrom(current, 1);
      if (next === -1) {
        this.sequencer.finish();
      } else {
        await this.startAt(refs[next].id);
      }
      return;
    }
    if (this.transport.readsOneSentence()) {
      this.sequencer.stop();
      return;
    }
    const target = refs.findIndex((ref) => ref.id === current) + 1;
    if (target >= refs.length) {
      this.sequencer.finish();
      return;
    }
    if (this.transport.stepMode()) {
      // The seam the learner asked for. The cursor stays on the sentence just
      // heard, nothing is loaded, and the session waits to be told to go on —
      // which is `continueReading`, from the transport or the headset.
      this.transport.enter('stepped');
      return;
    }
    const next = refs[target];
    if (!this.clips.isAvailable(next.id)) {
      // The frontier. The cursor stays on the sentence just heard, so the
      // reader keeps showing where the learner is, and the session waits for
      // the clip rather than reporting that the reading would not play.
      this.transport.waitFor(next.id);
      return;
    }
    await this.sequencer.load(next.id, { keepStatus: true });
  }

  /** Plays the loaded clip again from its start. Loads nothing and reads nothing. */
  private async replayCurrent(): Promise<void> {
    this.transport.countNavigation();
    this.transport.stopWaiting();
    try {
      const start = this.sequencer.timeOf(Math.max(this.transport.currentPosition() - 1, 0));
      if (start !== null) {
        this.player.seek(start);
        await this.player.resume();
      } else {
        await this.player.restart();
      }
    } catch {
      this.sequencer.stopWithFailure({
        kind: 'decode-failed',
        position: this.transport.currentPosition(),
      });
      return;
    }
    this.transport.enter('playing');
    this.sequencer.publishPosition();
  }
}
