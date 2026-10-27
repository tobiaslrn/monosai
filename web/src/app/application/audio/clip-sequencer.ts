import type { EnrichmentRepository } from '../../domain/enrichment/enrichment-repository';
import type { SentenceId } from '../../domain/shared/ids';
import type { AudioPlayer, AudioSequenceClip, AudioTimeline } from './audio-player';
import type { ClipCatalogue, ClipPace } from './clip-catalogue';

/** Audio containers that can be appended to one native continuous resource. */
type SequenceMimeType = 'audio/mpeg' | 'audio/webm';
type ClipMimeType = AudioSequenceClip['mimeType'];

function isSequenceMimeType(mimeType: string): mimeType is SequenceMimeType {
  return mimeType === 'audio/mpeg' || mimeType === 'audio/webm';
}

/** A WAV clip can start a resource that is complete, but never one that grows. */
function isClipMimeType(mimeType: string): mimeType is ClipMimeType {
  return isSequenceMimeType(mimeType) || mimeType === 'audio/wav';
}

/**
 * The native resource a continuous session is playing, and where it starts.
 *
 * The resource covers a run of sentences from `baseIndex` rather than the whole
 * reading: a session started while generation is still going gets the clips
 * that exist, and the rest are appended to the same resource as they are made.
 * Its own indices are therefore offset from the reading's.
 */
interface LoadedSequence {
  timeline: AudioTimeline;
  /** Index in `refs` of the sentence the resource starts at. */
  readonly baseIndex: number;
  /** Whether the resource expects the learner's local rate or baked timing. */
  readonly pace: ClipPace;
  /** Cache keys appended so far, in reading order from `baseIndex`. */
  readonly keys: string[];
}

/** What building a resource came to, for the store to turn into transport state. */
export type SequenceBuild =
  /** The resource is loaded and playing, or held if a Pause was waiting. */
  | { readonly kind: 'built'; readonly startPaused: boolean }
  /** A newer load or a stop took over, so this one leaves everything alone. */
  | { readonly kind: 'superseded' }
  /**
   * No resource can be built, so the sentence is played as a single clip. Covers
   * a missing clip, a container that cannot grow, a WAV run short of the end,
   * and a browser without MediaSource.
   */
  | { readonly kind: 'per-sentence' }
  | { readonly kind: 'failed'; readonly message: string };

/** How a build asks the store whether it is still the load that counts. */
export interface SequenceBuildControl {
  /** False once a newer load or a stop has superseded this build. */
  readonly current: () => boolean;
  /** Whether a Pause arrived while the clips were read. Asked once, as the resource is built. */
  readonly startPaused: () => boolean;
  /** False if the learner left continuous mode while the resource was being assembled. */
  readonly continuous: () => boolean;
}

/** The calls the sequencer makes on the player. */
export type SequencePlayer = Pick<
  AudioPlayer,
  'playSequence' | 'extendSequence' | 'closeSequence' | 'setRate'
>;

/** What the sequencer drives, narrowed to the calls it makes. */
export interface ClipSequencerPorts {
  readonly player: SequencePlayer;
  readonly clips: Pick<EnrichmentRepository, 'getAudioByCacheKey'>;
  /** The rate a clip of this pace is played at. */
  readonly rateFor: (pace: ClipPace) => number;
}

type ClipRead =
  | { readonly kind: 'read'; readonly clips: AudioSequenceClip[]; readonly keys: string[] }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'failed'; readonly message: string }
  /** A clip the store cannot produce, or one in a container this resource cannot hold. */
  | { readonly kind: 'unusable' };

const SUPERSEDED = { kind: 'superseded' } as const;
const PER_SENTENCE = { kind: 'per-sentence' } as const;
const UNUSABLE = { kind: 'unusable' } as const;

/**
 * The one native resource a continuous reading is played from, and its growth.
 *
 * Builds it from the clips that exist, appends each sentence as it is stored,
 * seals it when nothing more will come, and maps between the reading's sentences
 * and the resource's own timeline. It decides nothing about transport: whether
 * the learner is playing, paused, or waiting is the store's, which asks this
 * what happened and turns the answer into state. Nothing here ever starts
 * sound that was not asked for, and nothing reaches storage but a clip's bytes.
 *
 * The WAV branches — a run of WAV can start a complete resource, never a
 * growing one — go when `audio/wav` can no longer be produced (ADR 0070).
 */
export class ClipSequencer {
  private current: LoadedSequence | null = null;
  /**
   * The append in flight, so two refreshes cannot append the same clip twice.
   *
   * `prepare` runs on every completed sentence of a generation run and is
   * routinely re-entered while an earlier call is still reading blobs.
   */
  private extending: Promise<boolean> | null = null;

  constructor(
    private readonly catalogue: ClipCatalogue,
    private readonly ports: ClipSequencerPorts,
  ) {}

  /** Whether a native resource is loaded. */
  get loaded(): boolean {
    return this.current !== null;
  }

  /** The loaded resource's timeline, whose duration grows while it is open. */
  get timeline(): AudioTimeline | null {
    return this.current?.timeline ?? null;
  }

  get pace(): ClipPace | null {
    return this.current?.pace ?? null;
  }

  /** Whether the loaded resource is still accepting clips. */
  get open(): boolean {
    return this.current?.timeline.open === true;
  }

  /** Drops the resource, because something else is about to be loaded or the session ended. */
  release(): void {
    this.current = null;
  }

  /**
   * Loads the clips that exist from one sentence on into one native resource.
   *
   * The run is contiguous from the start sentence rather than the whole
   * reading, so a session can begin while generation is still going. While it
   * is short of the end the resource is left **open**, and `extend` appends each
   * sentence as it is stored. That is what keeps a locked screen reading on: the
   * element never goes quiet between two sentences, so the document keeps the
   * media-playing reason not to be frozen, and the advance itself happens
   * inside the native pipeline rather than in an event handler.
   */
  async build(startIndex: number, control: SequenceBuildControl): Promise<SequenceBuild> {
    const refs = this.catalogue.refs();
    const run = this.catalogue.contiguousRunFrom(startIndex);
    const first = run[0];
    if (first === undefined) {
      return PER_SENTENCE;
    }
    const sentenceId = first.id;
    const read = await this.readClips(
      run,
      (ref) => this.catalogue.playable().get(ref.id)?.cacheKey,
      isClipMimeType,
      control.current,
    );
    if (read.kind === 'superseded') {
      return SUPERSEDED;
    }
    if (read.kind === 'failed') {
      return read;
    }
    if (read.kind === 'unusable') {
      return PER_SENTENCE;
    }

    const complete = startIndex + run.length === refs.length;
    const open = !complete && read.clips.every((clip) => isSequenceMimeType(clip.mimeType));
    if (!complete && !open) {
      // A WAV resource states its own length and cannot grow, so building one
      // over part of a reading would end the session at the frontier with no
      // way on. The per-sentence path waits there instead.
      return PER_SENTENCE;
    }

    // The last check inside the read was a hop ago. Nothing between this one and
    // the player waits, so a stop or a newer load cannot slip in after it.
    if (!control.current()) {
      return SUPERSEDED;
    }
    const startPaused = control.startPaused();
    try {
      this.ports.player.setRate(this.ports.rateFor(this.paceOf(sentenceId)));
      const timeline = await this.ports.player.playSequence(read.clips, {
        startIndex: 0,
        startPaused,
        open,
      });
      if (!control.current()) {
        return SUPERSEDED;
      }
      if (!control.continuous()) {
        // The learner selected sentence mode while the native resource was
        // being assembled. Replace the just-started resource before it can run
        // across its first boundary.
        return PER_SENTENCE;
      }
      this.current = {
        timeline,
        baseIndex: startIndex,
        pace: this.paceOf(sentenceId),
        keys: read.keys,
      };
    } catch {
      // Browsers without MPEG MediaSource retain the established foreground path.
      return control.current() ? PER_SENTENCE : SUPERSEDED;
    }
    return { kind: 'built', startPaused };
  }

  /**
   * Appends every sentence stored since the resource was last extended.
   *
   * Called from `prepare`, which the reader already re-runs on each completed
   * sentence of a generation run. Playback therefore learns of a clip from its
   * own read of what is stored, and still does not watch the job (ADR 0037).
   * Resolves true when the resource grew.
   */
  async extend(): Promise<boolean> {
    const sequence = this.current;
    if (sequence === null || !sequence.timeline.open || this.extending !== null) {
      return false;
    }
    this.extending = this.appendStoredClips(sequence);
    try {
      return await this.extending;
    } finally {
      this.extending = null;
    }
  }

  /** Declares the resource complete, so the element can reach its end. */
  seal(): void {
    const sequence = this.current;
    if (sequence?.timeline.open !== true) {
      return;
    }
    sequence.timeline = { ...sequence.timeline, open: false };
    this.ports.player.closeSequence();
  }

  /** Where a sentence starts in the loaded resource, or null if it is not in it. */
  timeOf(refIndex: number): number | null {
    const sequence = this.current;
    if (sequence === null) {
      return null;
    }
    const start = sequence.timeline.starts[refIndex - sequence.baseIndex];
    if (start === undefined) {
      return null;
    }
    // Never below the floor: audio evicted to make room for an append is no
    // longer there to seek to, and landing under it would stall the element.
    return Math.max(start, sequence.timeline.floor);
  }

  /** Where a sentence starts and ends in the loaded resource, or null if it is not in it. */
  spanOf(refIndex: number): { readonly start: number; readonly end: number } | null {
    const sequence = this.current;
    if (sequence === null) {
      return null;
    }
    const offset = refIndex - sequence.baseIndex;
    const start = sequence.timeline.starts[offset];
    if (start === undefined) {
      return null;
    }
    return { start, end: sequence.timeline.starts[offset + 1] ?? sequence.timeline.duration };
  }

  /** The sentence being heard at one time in the resource, and where it starts. */
  locate(elapsed: number): { readonly refIndex: number; readonly start: number } | null {
    const sequence = this.current;
    if (sequence === null) {
      return null;
    }
    let index = 0;
    let indexStart = 0;
    for (const [candidate, start] of sequence.timeline.starts.entries()) {
      if (candidate > 0 && start > elapsed) {
        break;
      }
      index = candidate;
      indexStart = start;
    }
    return { refIndex: sequence.baseIndex + index, start: indexStart };
  }

  /**
   * Clamps a time to what the resource actually holds.
   *
   * A lock-screen scrub can name a position past the frontier or below audio
   * that has been evicted.
   */
  clampTime(seconds: number): number | null {
    const timeline = this.timeline;
    return timeline === null
      ? null
      : Math.min(Math.max(seconds, timeline.floor), timeline.duration);
  }

  /** Index in `refs` of the last sentence appended to the resource, or -1. */
  appendedLimitIndex(): number {
    const sequence = this.current;
    return sequence === null ? -1 : sequence.baseIndex + sequence.timeline.starts.length - 1;
  }

  private async appendStoredClips(sequence: LoadedSequence): Promise<boolean> {
    const refs = this.catalogue.refs();
    const playable = this.catalogue.playable();
    // A current cache key can change while a resource is open, for example when
    // a regenerated clip replaces an older fallback. Appending that clip would
    // change the resource's source configuration, so it is sealed instead and
    // what is already in it plays out.
    const rekeyed = sequence.keys.some((key, offset) => {
      const ref = refs[sequence.baseIndex + offset];
      return ref === undefined || playable.get(ref.id)?.cacheKey !== key;
    });
    if (rekeyed) {
      this.seal();
      return false;
    }

    const available = this.catalogue.available();
    const pending: string[] = [];
    for (const ref of refs.slice(this.appendedLimitIndex() + 1)) {
      const clip = playable.get(ref.id);
      if (clip?.pace !== sequence.pace || !available.has(ref.id)) {
        break;
      }
      pending.push(clip.cacheKey);
    }
    if (pending.length === 0) {
      const nextRef = refs[this.appendedLimitIndex() + 1];
      const next = nextRef === undefined ? undefined : playable.get(nextRef.id);
      if (next !== undefined && next.pace !== sequence.pace) {
        this.seal();
      }
      return false;
    }

    const read = await this.readClips(
      pending,
      (cacheKey) => cacheKey,
      isSequenceMimeType,
      () => this.current === sequence,
    );
    // The read can resolve a hop before this runs, and a newer build may have
    // replaced the resource in between. Everything below acts on whatever is
    // current — the seal, and the player, which appends to any open resource —
    // so it must only run while this one still is.
    if (this.current !== sequence || read.kind === 'superseded') {
      return false;
    }
    if (read.kind !== 'read') {
      // Nothing that can go into this resource. Sealing keeps what is in it
      // playable and lets the element finish, rather than failing a session
      // over a sentence it has not reached yet.
      this.seal();
      return false;
    }

    try {
      const timeline = await this.ports.player.extendSequence(read.clips);
      if (this.current !== sequence) {
        return false;
      }
      sequence.timeline = timeline;
      sequence.keys.push(...read.keys);
    } catch {
      if (this.current === sequence) {
        this.seal();
      }
      return false;
    }
    const nextRef = refs[this.appendedLimitIndex() + 1];
    const next = nextRef === undefined ? undefined : playable.get(nextRef.id);
    if (nextRef === undefined || (next !== undefined && next.pace !== sequence.pace)) {
      this.seal();
    }
    return true;
  }

  /**
   * Reads the clips for a list of items, each once however often its key repeats.
   *
   * The key is asked for as each item is reached rather than up front, because
   * what is stored can change while an earlier clip is being read.
   */
  private async readClips<Item>(
    items: readonly Item[],
    cacheKeyOf: (item: Item) => string | undefined,
    accepts: (mimeType: string) => mimeType is ClipMimeType,
    current: () => boolean,
  ): Promise<ClipRead> {
    const byKey = new Map<string, AudioSequenceClip>();
    const clips: AudioSequenceClip[] = [];
    const keys: string[] = [];
    for (const item of items) {
      const cacheKey = cacheKeyOf(item);
      if (cacheKey === undefined) {
        return UNUSABLE;
      }
      let clip = byKey.get(cacheKey);
      if (clip === undefined) {
        const loaded = await this.ports.clips.getAudioByCacheKey(cacheKey);
        if (!current()) {
          return SUPERSEDED;
        }
        if (!loaded.ok) {
          return { kind: 'failed', message: loaded.error.message };
        }
        if (loaded.value === null || !accepts(loaded.value.mimeType)) {
          return UNUSABLE;
        }
        clip = { blob: loaded.value.blob, mimeType: loaded.value.mimeType };
        byKey.set(cacheKey, clip);
      }
      keys.push(cacheKey);
      clips.push(clip);
    }
    return { kind: 'read', clips, keys };
  }

  private paceOf(sentenceId: SentenceId): ClipPace {
    return this.catalogue.playable().get(sentenceId)?.pace ?? 'baked';
  }
}
