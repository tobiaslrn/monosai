import { computed, signal } from '@angular/core';
import type { EnrichmentRepository } from '../../domain/enrichment/enrichment-repository';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingRepository, SentenceRef } from '../../domain/reading/reading-repository';
import type { SentenceId } from '../../domain/shared/ids';

/** Whether a clip expects the learner's local rate or has its timing baked in. */
export type ClipPace = 'playback' | 'baked';

/** The one stored clip a sentence is played from, and how it relates to Settings. */
export interface PlayableClip {
  readonly cacheKey: string;
  /** Made under older settings, and played only until it is regenerated. */
  readonly stale: boolean;
  readonly pace: ClipPace;
}

/** What reading the stored clips came to. */
export type CatalogueRefresh =
  | { readonly kind: 'refreshed' }
  /** A newer refresh began first, so this one claims nothing. */
  | { readonly kind: 'superseded' }
  /** Storage could not be read, and nothing is claimed to be playable. */
  | { readonly kind: 'unreadable'; readonly message: string };

/** What the catalogue reads, narrowed to the calls it makes. */
export interface ClipCatalogueSources {
  readonly readings: Pick<ReadingRepository, 'listSentenceRefs'>;
  readonly enrichment: Pick<EnrichmentRepository, 'listAudioSummaries'>;
  /** Cache keys under the configuration selected in Settings; empty when none resolves. */
  readonly cacheKeysFor: (refs: readonly SentenceRef[]) => ReadonlyMap<SentenceId, string>;
}

function sameCacheKeys(
  left: ReadonlyMap<SentenceId, string>,
  right: ReadonlyMap<SentenceId, string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [sentenceId, cacheKey] of left) {
    if (right.get(sentenceId) !== cacheKey) {
      return false;
    }
  }
  return true;
}

/**
 * Which sentences of the open reading have a clip that can be played.
 *
 * The playback store's half that only reads storage: it knows the reading's
 * sentences, the clip each can be played from, and how that compares with the
 * current settings, and it answers where the next or nearest playable sentence
 * is. It never plays, never touches the player, and never reports a failure
 * itself — a refresh says what happened and the store decides what to do.
 *
 * Coverage and playability are kept apart (ADR 0072). A sentence is *covered*
 * only by a clip under the current cache key; it is *playable* by that clip or
 * by the newest stored one whose source text is identical.
 */
export class ClipCatalogue {
  private readonly readingSignal = signal<Reading | null>(null);
  private readonly refsSignal = signal<readonly SentenceRef[]>([]);
  /** Sentences with a stored clip under the current key. Coverage only. */
  private readonly currentAvailableSignal = signal<ReadonlySet<SentenceId>>(new Set());
  /** One stored clip per sentence that can be played in this session. */
  private readonly playableSignal = signal<ReadonlyMap<SentenceId, PlayableClip>>(new Map());
  /** Sentences with any playable stored clip. Metadata only. */
  private readonly availableSignal = signal<ReadonlySet<SentenceId>>(new Set());
  /** Number of playable sentences whose clip was made under older settings. */
  private readonly staleCountSignal = signal(0);
  /** Cache keys for the configuration currently selected in Settings. */
  private cacheKeys: ReadonlyMap<SentenceId, string> = new Map();
  /** Generation counter, so a stale read never narrows a fresher one. */
  private refreshToken = 0;

  readonly reading = this.readingSignal.asReadonly();
  readonly refs = this.refsSignal.asReadonly();
  readonly playable = this.playableSignal.asReadonly();
  readonly available = this.availableSignal.asReadonly();

  readonly sentenceCount = computed(() => this.refsSignal().length);

  readonly missingCount = computed(() => {
    const available = this.currentAvailableSignal();
    return this.refsSignal().filter((ref) => !available.has(ref.id)).length;
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
  readonly hasPlayableAudio = computed(() => this.availableSignal().size > 0);

  /** At least one playable sentence uses a clip made with older settings. */
  readonly hasStaleAudio = computed(() => this.staleCountSignal() > 0);

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

  constructor(private readonly sources: ClipCatalogueSources) {}

  /**
   * Reads which clips exist for a reading. Local only, and silent.
   *
   * Latest-wins: the reader re-runs this on every completed sentence of a
   * generation run, so two calls are routinely in flight, and an older, smaller
   * availability set settling last would make the frontier appear to move
   * backwards and strand a waiting session on a clip that had already arrived.
   */
  async refresh(reading: Reading): Promise<CatalogueRefresh> {
    const previous = this.readingSignal();
    this.readingSignal.set(reading);
    const token = (this.refreshToken += 1);

    const refs = await this.sources.readings.listSentenceRefs(reading.id);
    if (token !== this.refreshToken) {
      return { kind: 'superseded' };
    }
    if (!refs.ok) {
      // Availability could not be refreshed, so nothing is claimed to be
      // playable: offering a transport built on a set this call has just failed
      // to read would be offering controls that cannot be honoured.
      this.clearAvailability();
      return { kind: 'unreadable', message: refs.error.message };
    }
    const ordered = [...refs.value].sort(
      (left, right) => left.positionInReading - right.positionInReading,
    );
    this.refsSignal.set(ordered);

    const cacheKeys = this.sources.cacheKeysFor(ordered);
    const configurationChanged =
      previous?.id !== reading.id || !sameCacheKeys(this.cacheKeys, cacheKeys);
    this.cacheKeys = cacheKeys;
    if (configurationChanged) {
      this.currentAvailableSignal.set(new Set());
    }

    const summaries = await this.sources.enrichment.listAudioSummaries(reading.id);
    if (token !== this.refreshToken) {
      return { kind: 'superseded' };
    }
    if (!summaries.ok) {
      this.clearAvailability();
      return { kind: 'unreadable', message: summaries.error.message };
    }
    // Matched by key rather than by the row's own `sentenceId`: the audio table
    // is keyed by `cacheKey`, so two sentences with identical Japanese share one
    // clip and one row. Fallbacks are matched by content hash, which is the
    // safety line that prevents an edited sentence from inheriting old audio.
    const stored = new Map(summaries.value.map((summary) => [summary.cacheKey, summary]));
    const newestByContentHash = new Map<string, (typeof summaries.value)[number]>();
    for (const summary of summaries.value) {
      const known = newestByContentHash.get(summary.sourceContentHash);
      if (known === undefined || summary.createdAt > known.createdAt) {
        newestByContentHash.set(summary.sourceContentHash, summary);
      }
    }
    const currentAvailable = new Set<SentenceId>();
    const playable = new Map<SentenceId, PlayableClip>();
    for (const ref of ordered) {
      const cacheKey = cacheKeys.get(ref.id);
      const current = cacheKey === undefined ? undefined : stored.get(cacheKey);
      if (current !== undefined) {
        currentAvailable.add(ref.id);
        playable.set(ref.id, {
          cacheKey: current.cacheKey,
          stale: false,
          pace: current.pace === 'playback' ? 'playback' : 'baked',
        });
        continue;
      }
      const fallback = newestByContentHash.get(ref.contentHash);
      if (fallback !== undefined) {
        playable.set(ref.id, {
          cacheKey: fallback.cacheKey,
          stale: true,
          pace: fallback.pace === 'playback' ? 'playback' : 'baked',
        });
      }
    }
    this.currentAvailableSignal.set(currentAvailable);
    this.playableSignal.set(playable);
    this.availableSignal.set(new Set(playable.keys()));
    this.staleCountSignal.set([...playable.values()].filter((clip) => clip.stale).length);
    return { kind: 'refreshed' };
  }

  /** Forgets the reading and everything known about it. */
  forgetReading(): void {
    this.readingSignal.set(null);
    this.refsSignal.set([]);
    this.forgetClips();
  }

  /** Forgets every clip, keeping the reading and its sentences. */
  forgetClips(): void {
    this.cacheKeys = new Map();
    this.clearAvailability();
  }

  private clearAvailability(): void {
    this.currentAvailableSignal.set(new Set());
    this.availableSignal.set(new Set());
    this.playableSignal.set(new Map());
    this.staleCountSignal.set(0);
  }

  /** Whether one sentence can be started from right now. */
  isAvailable(sentenceId: SentenceId | null): boolean {
    return sentenceId !== null && this.availableSignal().has(sentenceId);
  }

  /** Position of one sentence, one-based, or 0 when it is not in the reading. */
  positionOf(sentenceId: SentenceId): number {
    return this.refsSignal().findIndex((ref) => ref.id === sentenceId) + 1;
  }

  /** The first sentence that has a clip, which is not always sentence one. */
  firstAvailable(): SentenceRef | undefined {
    const available = this.availableSignal();
    return this.refsSignal().find((ref) => available.has(ref.id));
  }

  /**
   * The index of the nearest sentence in `direction` from one that has a clip, or -1.
   *
   * A search rather than a neighbour check because generation can leave holes,
   * and a hole must not be a wall: every later sentence that was made is still
   * something the learner paid for and should be able to reach.
   */
  availableIndexFrom(current: SentenceId | null, direction: 1 | -1): number {
    if (current === null) {
      return -1;
    }
    const refs = this.refsSignal();
    const available = this.availableSignal();
    const from = refs.findIndex((ref) => ref.id === current);
    if (from === -1) {
      return -1;
    }
    for (
      let index = from + direction, ref = refs[index];
      ref !== undefined;
      index += direction, ref = refs[index]
    ) {
      if (available.has(ref.id)) {
        return index;
      }
    }
    return -1;
  }

  /**
   * The sentence with a clip closest to one index, searching both ways.
   *
   * Ties go backwards, because a scrub that lands in a hole is aiming at the
   * text around it and the sentence before the gap is the one that leads into
   * what the learner pointed at.
   */
  nearestAvailableIndex(index: number): number {
    const refs = this.refsSignal();
    const available = this.availableSignal();
    for (let distance = 0; distance < refs.length; distance += 1) {
      const before = index - distance;
      const beforeRef = refs[before];
      if (beforeRef !== undefined && available.has(beforeRef.id)) {
        return before;
      }
      const after = index + distance;
      const afterRef = refs[after];
      if (afterRef !== undefined && available.has(afterRef.id)) {
        return after;
      }
    }
    return -1;
  }

  /** The sentences from one index on that have a clip, stopping at the first that does not. */
  contiguousRunFrom(startIndex: number): readonly SentenceRef[] {
    const refs = this.refsSignal();
    const available = this.availableSignal();
    const playable = this.playableSignal();
    const run: SentenceRef[] = [];
    const startRef = refs[startIndex];
    const first = startRef === undefined ? undefined : playable.get(startRef.id);
    if (first === undefined) {
      return run;
    }
    for (const ref of refs.slice(startIndex)) {
      const clip = playable.get(ref.id);
      if (!available.has(ref.id) || clip?.pace !== first.pace) {
        break;
      }
      run.push(ref);
    }
    return run;
  }
}
