import { Injectable, computed, inject, signal } from '@angular/core';
import { ankiError, type AnkiError } from '../../domain/anki/anki-error';
import type { VocabularySourceId } from '../../domain/shared/ids';
import type { AnkiVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { supportsManualSync } from '../../domain/vocabulary/vocabulary-source';
import { VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import { AnkiSourceReader } from './anki-source-reader';
import { VocabularySyncService, type VocabularySyncFailure } from './vocabulary-sync.service';

export type ManualSyncFailure = AnkiError | VocabularySyncFailure;

export type ManualSyncState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'syncing'; readonly sourceId: VocabularySourceId }
  | { readonly kind: 'cancelled'; readonly sourceId: VocabularySourceId }
  | {
      readonly kind: 'failed';
      readonly sourceId: VocabularySourceId;
      readonly error: ManualSyncFailure;
    }
  | {
      readonly kind: 'complete';
      readonly sourceId: VocabularySourceId;
      readonly uniqueEntryCount: number;
    };

const IDLE: ManualSyncState = { kind: 'idle' };

/**
 * Reads the current abort state.
 *
 * `AbortSignal.aborted` is typed as a plain boolean, so checking it twice in one
 * function narrows it to `false` for the second check even though it can flip
 * between them. Going through a call keeps every check honest.
 */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Reads one live Anki source on demand.
 *
 * This is the manual counterpart to the background coordinator, for a learner
 * who turned automatic syncing off or whose last automatic attempt failed. It
 * shares the reader, so the two paths cannot disagree about what a complete
 * read is, and it shares the two guards that make a failed sync harmless:
 *
 * - nothing is written unless the whole read succeeded, and the commit is one
 *   transaction, so the previous vocabulary survives any failure intact;
 * - a source that suddenly reads as empty is refused rather than committed,
 *   because an emptied deck is far more often a half-open collection than a
 *   learner who deleted every card.
 *
 * There is deliberately no offline gate: AnkiConnect answers on the loopback
 * address, so a device with no network can still sync perfectly well. A
 * genuinely unreachable Anki fails the probe and is reported as such.
 */
@Injectable({ providedIn: 'root' })
export class ManualSourceSyncStore {
  private readonly reader = inject(AnkiSourceReader);
  private readonly sync = inject(VocabularySyncService);
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);

  private readonly stateSignal = signal<ManualSyncState>(IDLE);
  private controller: AbortController | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly announcement = signal('');

  readonly isSyncing = computed(() => this.stateSignal().kind === 'syncing');

  isSyncingSource(id: VocabularySourceId): boolean {
    const state = this.stateSignal();
    return state.kind === 'syncing' && state.sourceId === id;
  }

  /** The failure to show against one source, if that is the one that failed. */
  failureFor(id: VocabularySourceId): ManualSyncFailure | null {
    const state = this.stateSignal();
    return state.kind === 'failed' && state.sourceId === id ? state.error : null;
  }

  /** Clears a finished result so a card stops reporting an old outcome. */
  dismiss(): void {
    if (this.stateSignal().kind !== 'syncing') {
      this.stateSignal.set(IDLE);
    }
  }

  cancel(): void {
    if (this.stateSignal().kind !== 'syncing') {
      return;
    }
    this.controller?.abort();
  }

  async syncNow(source: AnkiVocabularySource): Promise<void> {
    if (this.stateSignal().kind === 'syncing' || !supportsManualSync(source)) {
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.stateSignal.set({ kind: 'syncing', sourceId: source.id });
    this.announcement.set(`Syncing ${source.label}…`);

    const read = await this.reader.read(source.providerKind, [source], controller.signal);
    if (!read.ok) {
      this.finish(source, read.error);
      return;
    }
    if (isAborted(controller.signal)) {
      this.cancelled(source);
      return;
    }

    const cache = read.value.find((candidate) => candidate.sourceId === source.id);
    if (cache === undefined) {
      this.finish(source, ankiError('query-failed', `${source.label} returned nothing to read.`));
      return;
    }

    const previous = await this.repository.readCaches([source.id]);
    if (!previous.ok) {
      this.finish(source, previous.error);
      return;
    }
    const had = previous.value.find((entry) => entry.sourceId === source.id)?.entries.length ?? 0;
    if (cache.entries.length === 0 && had > 0) {
      this.finish(
        source,
        ankiError(
          'query-failed',
          `${source.label} unexpectedly returned no vocabulary, so it was not applied.`,
        ),
      );
      return;
    }

    const prepared = await this.sync.prepare({ caches: [cache] }, undefined, controller.signal);
    if (!prepared.ok) {
      if (prepared.error.code === 'cancelled') {
        this.cancelled(source);
        return;
      }
      this.finish(source, prepared.error);
      return;
    }
    if (isAborted(controller.signal)) {
      this.cancelled(source);
      return;
    }

    // The one point of no return: a single transaction that either replaces the
    // vocabulary or leaves the previous one exactly as it was.
    const committed = await this.sync.commit(prepared.value);
    if (!committed.ok) {
      this.finish(source, committed.error);
      return;
    }
    this.controller = null;
    this.stateSignal.set({
      kind: 'complete',
      sourceId: source.id,
      uniqueEntryCount: committed.value.uniqueEntryCount,
    });
    this.announcement.set(
      `Synced ${source.label}. Your vocabulary has ${String(committed.value.uniqueEntryCount)} unique expressions.`,
    );
  }

  private cancelled(source: AnkiVocabularySource): void {
    this.controller = null;
    this.stateSignal.set({ kind: 'cancelled', sourceId: source.id });
    this.announcement.set(
      'Sync cancelled. Nothing was saved and your previous vocabulary is unchanged.',
    );
  }

  private finish(source: AnkiVocabularySource, error: ManualSyncFailure): void {
    this.controller = null;
    if (error.code === 'cancelled') {
      this.cancelled(source);
      return;
    }
    this.stateSignal.set({ kind: 'failed', sourceId: source.id, error });
    this.announcement.set(`${error.message} Your previous vocabulary is unchanged.`);
  }
}
