import { Injectable, computed, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import type { SentenceId } from '../../domain/shared/ids';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { EnrichmentKeysService } from '../enrichment/enrichment-keys.service';
import { ENRICHMENT_REPOSITORY, READING_REPOSITORY } from '../shared/repository-tokens';

/** Whether a clip expects the learner's local rate or carries baked timing. */
export type ClipPace = 'playback' | 'baked';

/** The one stored clip a sentence plays in this session. */
export interface PlayableClip {
  readonly cacheKey: string;
  readonly stale: boolean;
  readonly pace: ClipPace;
}

/**
 * What a refresh of the stored clips came to.
 *
 * `superseded` is a refresh a later one overtook; it changed nothing and its
 * caller has nothing to follow up. `failed` names the storage error, because
 * reporting it is the transport's business rather than the catalogue's.
 */
export type ClipsRefresh =
  | { readonly kind: 'refreshed' }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'failed'; readonly message: string };

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
 * Which clips exist for the reading being played, and which of them can play.
 *
 * The catalogue half of playback: it reads storage and answers questions, and
 * it never touches the player. Two figures are kept apart on purpose (ADR
 * 0072). *Coverage* counts only clips made under the configuration selected
 * now, because that is what says a set is finished. *Playable* also admits the
 * newest same-content clip made under older settings, marked stale, because
 * audio the learner already paid for should not go silent when a voice
 * changes.
 *
 * Generation can leave **holes** — the queue retries out of order and records
 * per-sentence failures without stopping a run — so the searches here move to
 * the nearest sentence that *has* a clip rather than only to a neighbour.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackClipsStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly audioConfig = inject(AudioConfigurationService);

  private readonly readingSignal = signal<Reading | null>(null);
  private readonly refsSignal = signal<readonly SentenceRef[]>([]);
  /** Cache keys for the configuration currently selected in Settings. */
  private readonly cacheKeysSignal = signal<ReadonlyMap<SentenceId, string>>(new Map());
  /** Sentences with a stored clip under the current key. Coverage only. */
  private readonly currentAvailableSignal = signal<ReadonlySet<SentenceId>>(new Set());
  /** One stored clip per sentence that can be played in this session. */
  private readonly playableSignal = signal<ReadonlyMap<SentenceId, PlayableClip>>(new Map());
  /** Sentences with any playable stored clip. Metadata only. */
  private readonly availableSignal = computed<ReadonlySet<SentenceId>>(
    () => new Set(this.playableSignal().keys()),
  );
  /** Number of playable sentences whose clip was made under older settings. */
  private readonly staleCountSignal = computed(
    () => [...this.playableSignal().values()].filter((clip) => clip.stale).length,
  );

  /** Latest-wins counter, so a stale read never narrows a fresher one. */
  private refreshToken = 0;

  readonly reading = this.readingSignal.asReadonly();
  /** The reading's sentences, in reading order, which is playback order. */
  readonly refs = this.refsSignal.asReadonly();
  /** The clip each playable sentence plays, by sentence. */
  readonly playable = this.playableSignal.asReadonly();

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

  /**
   * Reads which clips exist for a reading. Local only, and silent.
   *
   * Latest-wins: the reader re-runs this on every completed sentence of a
   * generation run, so two calls are routinely in flight, and an older, smaller
   * availability set settling last would make the frontier appear to move
   * backwards and strand a waiting session on a clip that had already arrived.
   */
  async refresh(reading: Reading): Promise<ClipsRefresh> {
    const previous = this.readingSignal();
    this.readingSignal.set(reading);
    const token = (this.refreshToken += 1);

    const refs = await this.readings.listSentenceRefs(reading.id);
    if (token !== this.refreshToken) {
      return { kind: 'superseded' };
    }
    if (!refs.ok) {
      // Availability could not be refreshed, so nothing is claimed to be
      // playable: offering a transport built on a set this call has just failed
      // to read would be offering controls that cannot be honoured.
      this.currentAvailableSignal.set(new Set());
      this.playableSignal.set(new Map());
      return { kind: 'failed', message: refs.error.message };
    }
    const ordered = [...refs.value].sort(
      (left, right) => left.positionInReading - right.positionInReading,
    );
    this.refsSignal.set(ordered);

    const config = this.audioConfig.resolve('tts-synthesis');
    const cacheKeys = config.ok
      ? this.keys.audioKeys(
          ordered,
          config.value.modelId,
          config.value.voiceId,
          config.value.optionsFingerprint,
          config.value.speechInstructions,
        )
      : new Map<SentenceId, string>();
    const configurationChanged =
      previous?.id !== reading.id || !sameCacheKeys(this.cacheKeysSignal(), cacheKeys);
    this.cacheKeysSignal.set(cacheKeys);
    if (configurationChanged) {
      this.currentAvailableSignal.set(new Set());
    }

    const summaries = await this.enrichment.listAudioSummaries(reading.id);
    if (token !== this.refreshToken) {
      return { kind: 'superseded' };
    }
    if (!summaries.ok) {
      this.currentAvailableSignal.set(new Set());
      this.playableSignal.set(new Map());
      return { kind: 'failed', message: summaries.error.message };
    }
    // Matched by key rather than by the row's own `sentenceId`: the audio table
    // is keyed by `cacheKey`, so two sentences with identical Japanese share one
    // clip and one row. Fallbacks are matched by content hash, which is the
    // safety line that prevents an edited sentence from inheriting old audio.
    const stored = new Map(summaries.value.map((summary) => [summary.cacheKey, summary]));
    const newestByContentHash = new Map<string, (typeof summaries.value)[number]>();
    for (const summary of summaries.value) {
      const previous = newestByContentHash.get(summary.sourceContentHash);
      if (previous === undefined || summary.createdAt > previous.createdAt) {
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
    return { kind: 'refreshed' };
  }

  /** Forgets every clip, keeping the reading and its sentences. */
  forgetClips(): void {
    this.cacheKeysSignal.set(new Map());
    this.currentAvailableSignal.set(new Set());
    this.playableSignal.set(new Map());
  }

  /** Forgets the reading as well as its clips. */
  forgetReading(): void {
    this.readingSignal.set(null);
    this.refsSignal.set([]);
    this.forgetClips();
  }

  /** The clip a sentence plays, when it has one. */
  clipFor(sentenceId: SentenceId | undefined): PlayableClip | undefined {
    return sentenceId === undefined ? undefined : this.playableSignal().get(sentenceId);
  }

  /** Whether one sentence can be started from right now. */
  isAvailable(sentenceId: SentenceId | null | undefined): boolean {
    return (
      sentenceId !== null && sentenceId !== undefined && this.availableSignal().has(sentenceId)
    );
  }

  /** Index of a sentence in reading order, or -1. */
  indexOf(sentenceId: SentenceId): number {
    return this.refsSignal().findIndex((ref) => ref.id === sentenceId);
  }

  /** One-based position of a sentence in the reading, or 0 when it is not in it. */
  positionOf(sentenceId: SentenceId): number {
    return this.indexOf(sentenceId) + 1;
  }

  /** The first sentence in reading order that has a clip. */
  firstAvailable(): SentenceId | undefined {
    const available = this.availableSignal();
    return this.refsSignal().find((ref) => available.has(ref.id))?.id;
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
    const hasClipAt = (position: number): boolean => {
      const ref = refs[position];
      return ref !== undefined && available.has(ref.id);
    };
    for (let distance = 0; distance < refs.length; distance += 1) {
      const before = index - distance;
      if (before >= 0 && hasClipAt(before)) {
        return before;
      }
      const after = index + distance;
      if (after < refs.length && hasClipAt(after)) {
        return after;
      }
    }
    return -1;
  }

  /**
   * The index of the nearest sentence in `direction` from `from` that has a
   * clip, or -1.
   *
   * A search rather than a neighbour check because generation can leave holes,
   * and a hole must not be a wall: every later sentence that was made is still
   * something the learner paid for and should be able to reach.
   */
  availableIndexFrom(from: SentenceId | null, direction: 1 | -1): number {
    if (from === null) {
      return -1;
    }
    const refs = this.refsSignal();
    const available = this.availableSignal();
    const start = refs.findIndex((ref) => ref.id === from);
    if (start === -1) {
      return -1;
    }
    for (let index = start + direction; index >= 0 && index < refs.length; index += direction) {
      const ref = refs[index];
      if (ref !== undefined && available.has(ref.id)) {
        return index;
      }
    }
    return -1;
  }

  /**
   * The sentences from one index on that have a clip, stopping at the first
   * that does not or whose pace differs from the first one's.
   */
  contiguousRunFrom(startIndex: number): readonly SentenceRef[] {
    const refs = this.refsSignal();
    const available = this.availableSignal();
    const playable = this.playableSignal();
    const run: SentenceRef[] = [];
    const firstRef = refs[startIndex];
    const first = firstRef === undefined ? undefined : playable.get(firstRef.id);
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
