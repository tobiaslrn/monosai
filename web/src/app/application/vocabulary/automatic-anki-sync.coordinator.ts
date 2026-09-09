import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import {
  isAutomaticAnkiSource,
  type AnkiConnectionKind,
  type AnkiVocabularySource,
  type VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import { CLOCK, VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import type { Clock } from '../../domain/shared/clock';
import { AnkiSourceReader, isTransientAnkiFailure } from './anki-source-reader';
import { VocabularySyncService } from './vocabulary-sync.service';

const COOLDOWN_MS = 60_000;
const START_DELAY_MS = 1_500;
const RETRY_INTERVAL_MS = 5 * 60_000;
const SUCCESS_VISIBLE_MS = 8_000;

export type AutomaticAnkiSyncStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'updated'; readonly snapshot: VocabularySnapshot }
  | { readonly kind: 'waiting'; readonly message: string }
  | { readonly kind: 'attention'; readonly message: string };

/**
 * Opportunistically refreshes configured live Anki sources while Monosai is
 * open, and is the one place a return from Anki is handled.
 *
 * The cooldown exists so an app that regains focus repeatedly does not hammer a
 * bridge, but the learner who studied three cards and came straight back is
 * exactly the case it would get wrong: their answers are the reason they
 * returned. A genuine hidden-to-visible transition therefore reads once past
 * the cooldown, and every other trigger in that moment — the focus event that
 * follows, a page asking on entry — joins that one read instead of starting
 * another.
 */
@Injectable()
export class AutomaticAnkiSyncCoordinator {
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);
  private readonly reader = inject(AnkiSourceReader);
  private readonly sync = inject(VocabularySyncService);
  private readonly clock = inject<Clock>(CLOCK);
  private readonly view = inject(DOCUMENT).defaultView;

  private readonly statusSignal = signal<AutomaticAnkiSyncStatus>({ kind: 'idle' });
  private readonly revisionSignal = signal<string | null>(null);
  private started = false;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | null = null;
  private followUp: Promise<void> | null = null;
  private hidden = false;

  readonly status = this.statusSignal.asReadonly();

  /**
   * The revision of the most recent committed vocabulary, or null before one.
   *
   * Separate from `status`, which speaks about words appearing and disappearing.
   * An evening of study commits a revision in which every word is the same and
   * everything they prove is different, and anything built on that evidence has
   * to notice. A word count is the one thing that cannot tell it.
   */
  readonly committedRevision = this.revisionSignal.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.hidden = this.view?.document.visibilityState === 'hidden';
    this.view?.setTimeout(() => void this.trigger(), START_DELAY_MS);
    this.view?.setInterval(() => {
      if (this.view?.document.visibilityState === 'visible') {
        void this.trigger();
      }
    }, RETRY_INTERVAL_MS);
    this.view?.document.addEventListener('visibilitychange', () => {
      if (this.view?.document.visibilityState === 'visible') {
        void this.resume();
      } else {
        this.hidden = true;
      }
    });
    this.view?.addEventListener('focus', () => void this.trigger());
  }

  /**
   * Handles the learner coming back, from Anki or from anywhere else.
   *
   * Only a real return does anything: repeated focus events inside one visible
   * session are ordinary triggers and stay behind the cooldown. A read that was
   * already running when they returned cannot contain the answers they gave
   * while away, so exactly one follow-up is queued behind it — one, however
   * many events arrive.
   */
  resume(): Promise<void> {
    if (!this.hidden) {
      // Still resolves with whatever this return already set going, so a caller
      // that awaits it is not told the refresh finished before it did.
      return this.followUp ?? this.inFlight ?? Promise.resolve();
    }
    this.hidden = false;
    return this.inFlight === null ? this.trigger(true) : this.scheduleFollowUp(this.inFlight);
  }

  private scheduleFollowUp(running: Promise<void>): Promise<void> {
    if (this.followUp !== null) {
      return this.followUp;
    }
    this.followUp = running
      .then(() => this.trigger(true))
      .finally(() => {
        this.followUp = null;
      });
    return this.followUp;
  }

  trigger(force = false): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    const now = this.clock.now();
    if (!force && now - this.lastAttemptAt < COOLDOWN_MS) {
      return Promise.resolve();
    }
    this.lastAttemptAt = now;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    const listed = await this.repository.list();
    if (!listed.ok) {
      this.statusSignal.set({ kind: 'attention', message: listed.error.message });
      return;
    }
    const sources = listed.value.filter(isAutomaticAnkiSource);
    if (sources.length === 0) {
      this.statusSignal.set({ kind: 'idle' });
      return;
    }

    this.statusSignal.set({ kind: 'checking' });
    const replacements: VocabularySourceCache[] = [];
    for (const providerKind of distinctProviderKinds(sources)) {
      const refreshed = await this.reader.read(
        providerKind,
        sources.filter((source) => source.providerKind === providerKind),
      );
      if (!refreshed.ok) {
        this.statusSignal.set({
          kind: isTransientAnkiFailure(refreshed.error) ? 'waiting' : 'attention',
          message: `${refreshed.error.message} Your current vocabulary was kept.`,
        });
        return;
      }
      replacements.push(...refreshed.value);
    }

    const previous = await this.repository.readCaches(replacements.map((cache) => cache.sourceId));
    if (!previous.ok) {
      this.statusSignal.set({ kind: 'attention', message: previous.error.message });
      return;
    }
    const previousById = new Map(previous.value.map((cache) => [cache.sourceId, cache]));
    const emptied = replacements.find(
      (cache) =>
        cache.entries.length === 0 && (previousById.get(cache.sourceId)?.entries.length ?? 0) > 0,
    );
    if (emptied !== undefined) {
      const source = sources.find((candidate) => candidate.id === emptied.sourceId);
      this.statusSignal.set({
        kind: 'attention',
        message: `${source?.label ?? 'An Anki source'} unexpectedly returned no vocabulary. Review it in Vocabulary settings; the current vocabulary was kept.`,
      });
      return;
    }

    const prepared = await this.sync.prepare({ caches: replacements });
    if (!prepared.ok) {
      this.statusSignal.set({
        kind: 'attention',
        message: `${prepared.error.message} Your current vocabulary was kept.`,
      });
      return;
    }
    const committed = await this.sync.commit(prepared.value);
    if (!committed.ok) {
      this.statusSignal.set({
        kind: 'attention',
        message: `${committed.error.message} Your current vocabulary was kept.`,
      });
      return;
    }
    // Published for every commit, including one whose word list is identical:
    // what those words proved about recent study is exactly what changed.
    this.revisionSignal.set(committed.value.revision);
    if (!prepared.value.vocabularyChanged) {
      this.statusSignal.set({ kind: 'idle' });
      return;
    }
    this.statusSignal.set({ kind: 'updated', snapshot: committed.value });
    this.view?.setTimeout(() => {
      const status = this.statusSignal();
      if (
        status.kind === 'updated' &&
        status.snapshot.id === committed.value.id &&
        status.snapshot.createdAt === committed.value.createdAt
      ) {
        this.statusSignal.set({ kind: 'idle' });
      }
    }, SUCCESS_VISIBLE_MS);
  }
}

function distinctProviderKinds(
  sources: readonly AnkiVocabularySource[],
): readonly AnkiConnectionKind[] {
  return [
    ...new Set(
      sources
        .map((source) => source.providerKind)
        .filter((kind): kind is AnkiConnectionKind => kind !== 'package'),
    ),
  ];
}
