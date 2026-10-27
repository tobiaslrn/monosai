import type { AudioTimeline } from './audio-player';
import type { ClipPace } from './playback-clips.store';

/**
 * The native resource a continuous session is playing, and where it starts
 * (ADR 0039, ADR 0045).
 *
 * The resource covers a run of sentences from `baseIndex` rather than the whole
 * reading: a session started while generation is still going gets the clips
 * that exist, and the rest are appended to the same resource as they are made.
 * Its own indices are therefore offset from the reading's, and every method
 * here takes and returns indices in the reading so that offset lives in one
 * place.
 *
 * A record of what the player was given, not a handle on the player: nothing
 * here plays, appends, or seals anything on its own.
 */
export class ContinuousTrack {
  private timelineValue: AudioTimeline;
  private readonly appendedKeys: string[];

  constructor(
    timeline: AudioTimeline,
    /** Index in the reading of the sentence the resource starts at. */
    readonly baseIndex: number,
    /** Whether the resource expects the learner's local rate or baked timing. */
    readonly pace: ClipPace,
    keys: readonly string[],
  ) {
    this.timelineValue = timeline;
    this.appendedKeys = [...keys];
  }

  get timeline(): AudioTimeline {
    return this.timelineValue;
  }

  /** Whether more clips may still be appended. */
  get open(): boolean {
    return this.timelineValue.open;
  }

  /** Cache keys appended so far, in reading order from `baseIndex`. */
  get keys(): readonly string[] {
    return this.appendedKeys;
  }

  /** Where a sentence starts in the resource, or null if it is not in it. */
  timeOf(refIndex: number): number | null {
    const offset = refIndex - this.baseIndex;
    const start = offset < 0 ? undefined : this.timelineValue.starts[offset];
    if (start === undefined) {
      return null;
    }
    // Never below the floor: audio evicted to make room for an append is no
    // longer there to seek to, and landing under it would stall the element.
    return Math.max(start, this.timelineValue.floor);
  }

  /** Where a sentence starts and ends in the resource, or null if it is not in it. */
  span(refIndex: number): { readonly start: number; readonly end: number } | null {
    const offset = refIndex - this.baseIndex;
    const starts = this.timelineValue.starts;
    const start = offset < 0 ? undefined : starts[offset];
    if (start === undefined) {
      return null;
    }
    return { start, end: starts[offset + 1] ?? this.timelineValue.duration };
  }

  /** The sentence being heard at `elapsed`, as an index in the reading, and where it starts. */
  sentenceAt(elapsed: number): { readonly index: number; readonly start: number } {
    const starts = this.timelineValue.starts;
    let offset = 0;
    for (const [candidate, at] of starts.entries()) {
      if (candidate > 0 && at > elapsed) {
        break;
      }
      offset = candidate;
    }
    return { index: this.baseIndex + offset, start: starts[offset] ?? 0 };
  }

  /** Index in the reading of the last sentence appended, or one before `baseIndex` when empty. */
  lastIndex(): number {
    return this.baseIndex + this.timelineValue.starts.length - 1;
  }

  /**
   * A position the resource actually holds.
   *
   * A lock-screen scrub can name a position past the frontier or below audio
   * that has been evicted.
   */
  clamp(seconds: number): number {
    return Math.min(Math.max(seconds, this.timelineValue.floor), this.timelineValue.duration);
  }

  /** Records an append the player accepted. */
  extend(timeline: AudioTimeline, keys: readonly string[]): void {
    this.timelineValue = timeline;
    this.appendedKeys.push(...keys);
  }

  /**
   * Records that the resource is complete.
   *
   * Returns whether it was still open, which is whether the player has to be
   * told: sealing twice must not close the player's resource twice.
   */
  seal(): boolean {
    if (!this.timelineValue.open) {
      return false;
    }
    this.timelineValue = { ...this.timelineValue, open: false };
    return true;
  }
}
