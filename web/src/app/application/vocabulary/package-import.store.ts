import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { ankiError, isRetryable, type AnkiError } from '../../domain/anki/anki-error';
import type { AnkiCatalog } from '../../domain/anki/catalog';
import type { AnkiVocabularyProvider, PackageSource } from '../../domain/anki/anki-provider';
import { canRefresh } from '../../domain/anki/capabilities';
import {
  planPackageImport,
  withDeck,
  withDeckScope,
  withExpressionField,
  withNoteType,
  withReplacement,
  type PackageImportPlan,
} from '../../domain/anki/package-import-plan';
import type { Result } from '../../domain/shared/result';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { vocabularySourceId } from '../../domain/shared/ids';
import { SHARED_PACKAGE_INBOX } from '../../domain/platform/shared-package-inbox.port';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { DeckScope, SourceMapping } from '../../domain/vocabulary/source-mapping';
import type { VocabularySourceCache } from '../../domain/vocabulary/vocabulary-source';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { PACKAGE_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { CLOCK, ID_GENERATOR } from '../shared/repository-tokens';
import { SourceMappingStore } from './source-mapping.store';
import { VocabularySyncService, type VocabularySyncFailure } from './vocabulary-sync.service';

export type PackageImportFailure = AnkiError | VocabularySyncFailure | StorageError;

export interface PackageImportOutcome {
  readonly deckName: string;
  /** True when an existing package source for that deck was replaced. */
  readonly replaced: boolean;
  readonly uniqueExpressions: number;
}

/**
 * One package import, from opening the file to a stored vocabulary.
 *
 * Everything before `committing` can be cancelled or fail without touching what
 * is stored, and `committing` is one transaction: a package that turns out to
 * be unreadable, or a learner who walks away from the deck chooser, leaves the
 * previous sources and vocabulary exactly as they were.
 */
export type PackageImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'inspecting' }
  | { readonly kind: 'selecting'; readonly plan: PackageImportPlan }
  | { readonly kind: 'importing'; readonly examined: number }
  | { readonly kind: 'committing' }
  | { readonly kind: 'complete'; readonly outcome: PackageImportOutcome }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'failed';
      readonly error: PackageImportFailure;
      /** True when the same file, unchanged, could still succeed. */
      readonly canRetry: boolean;
    };

const IDLE: PackageImportState = { kind: 'idle' };

/**
 * Imports an Anki package as a vocabulary source.
 *
 * The same use case serves the file picker and, later, a package shared into
 * Monosai from Android: both hand over a `PackageSource` and get identical
 * replacement, validation, and failure behaviour.
 */
@Injectable()
export class PackageImportStore {
  private readonly createProvider = inject(PACKAGE_PROVIDER_FACTORY);
  private readonly sources = inject(SourceMappingStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly busyRegistry = inject(AppBusyRegistry);
  private readonly inbox = inject(SHARED_PACKAGE_INBOX);
  private readonly ids = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);

  private readonly stateSignal = signal<PackageImportState>(IDLE);
  private readonly announcementSignal = signal('');

  private provider: AnkiVocabularyProvider | null = null;
  private controller: AbortController | null = null;
  /** Invalidates continuations from a cancelled or superseded async run. */
  private operation = 0;
  /** Kept so a failed import can be retried without asking for the file again. */
  private source: PackageSource | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();

  readonly isBusy = computed(() => {
    const kind = this.stateSignal().kind;
    return kind === 'inspecting' || kind === 'importing' || kind === 'committing';
  });
  readonly isActive = computed(() => {
    const kind = this.stateSignal().kind;
    return (
      kind === 'inspecting' || kind === 'selecting' || kind === 'importing' || kind === 'committing'
    );
  });
  readonly canCancel = computed(() => {
    const kind = this.stateSignal().kind;
    return kind === 'inspecting' || kind === 'selecting' || kind === 'importing';
  });
  readonly plan = computed(() => {
    const state = this.stateSignal();
    return state.kind === 'selecting' ? state.plan : null;
  });

  constructor() {
    // An update that reloaded the page mid-import would throw the file away, so
    // the whole flow — including a chooser waiting for an answer — counts as
    // busy until it reaches a terminal state or the page releases the store.
    effect(() => {
      this.busyRegistry.setBusy(
        'package-import',
        this.isActive() ? 'an Anki package is being imported' : null,
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.dispose();
    });
  }

  /** Opens a package and imports it, asking only about what it cannot settle. */
  async start(source: PackageSource): Promise<void> {
    this.controller?.abort();
    this.releaseProvider();
    this.source = source;
    const operation = ++this.operation;

    const controller = new AbortController();
    this.controller = controller;
    this.stateSignal.set({ kind: 'inspecting' });
    this.announce('Reading the Anki package…');

    await this.sources.load();
    if (!this.isCurrent(operation)) {
      return;
    }
    const loadFailure = this.sources.lastFailure();
    if (loadFailure !== null) {
      this.fail(loadFailure, operation);
      return;
    }

    const provider = this.createProvider(source);
    this.provider = provider;

    const probed = await provider.probe(controller.signal);
    if (!this.isCurrent(operation)) {
      provider.dispose();
      return;
    }
    if (!probed.ok) {
      this.fail(probed.error, operation);
      return;
    }
    if (!canRefresh(probed.value)) {
      this.fail(
        ankiError(
          'review-evidence-unsupported',
          'This package cannot show which cards you have reviewed, so Monosai cannot build vocabulary from it.',
        ),
        operation,
      );
      return;
    }
    if (probed.value.limitations.some((limitation) => limitation.code === 'no-review-history')) {
      this.fail(
        ankiError(
          'package-review-data-missing',
          'Nothing in this package has been reviewed. Export the deck again with scheduling information included, then share it.',
        ),
        operation,
      );
      return;
    }

    const discovered = await provider.discover(controller.signal);
    if (!this.isCurrent(operation)) {
      provider.dispose();
      return;
    }
    if (!discovered.ok) {
      this.fail(discovered.error, operation);
      return;
    }

    const plan = planPackageImport(discovered.value, this.storedPackageSources());
    if (!plan.ok) {
      this.fail(plan.error, operation);
      return;
    }

    if (plan.value.needsReview) {
      this.stateSignal.set({ kind: 'selecting', plan: plan.value });
      this.announce('Choose what to import from this package.');
      return;
    }
    await this.run(plan.value, operation);
  }

  /**
   * Takes a package the service worker received from Android's share sheet.
   *
   * The worker parks the file and redirects here, so this is the moment the
   * app first sees it. A share that the worker could not accept arrives the
   * same way, carrying why, so the learner is told rather than left looking at
   * a screen where nothing happened.
   */
  async receiveShared(marker: string, reason?: string): Promise<void> {
    if (marker === 'anki-package-failed') {
      try {
        await this.inbox.clear();
      } catch {
        // The worker already rejected the package; cleanup failure must not
        // hide the actionable reason it supplied.
      }
      this.stateSignal.set({ kind: 'failed', error: shareFailure(reason), canRetry: false });
      this.announce(shareFailure(reason).message);
      return;
    }
    if (marker !== 'anki-package') {
      return;
    }
    let shared;
    try {
      shared = await this.inbox.claim();
    } catch {
      const error = storageError('unavailable', 'The shared package could not be opened.');
      this.stateSignal.set({ kind: 'failed', error, canRetry: false });
      this.announce(`${error.message} Share it again from AnkiDroid.`);
      return;
    }
    if (shared === null) {
      const error = ankiError(
        'package-unreadable',
        'The shared package is no longer available. Share it again from AnkiDroid.',
      );
      this.stateSignal.set({ kind: 'failed', error, canRetry: false });
      this.announce(error.message);
      return;
    }
    await this.start({ fileName: shared.fileName, bytes: () => shared.bytes() });
  }

  /** Imports what the chooser is showing. */
  async confirm(): Promise<void> {
    const state = this.stateSignal();
    if (state.kind !== 'selecting') {
      return;
    }
    await this.run(state.plan, this.operation);
  }

  chooseDeck(deckName: string): void {
    this.replan((plan) => withDeck(this.catalogOf(plan), this.storedPackageSources(), deckName));
  }

  chooseNoteType(noteTypeName: string): void {
    this.replan((plan) =>
      withNoteType(this.catalogOf(plan), this.storedPackageSources(), plan, noteTypeName),
    );
  }

  chooseExpressionField(expressionFieldName: string): void {
    this.replan((plan) =>
      withExpressionField(
        this.catalogOf(plan),
        this.storedPackageSources(),
        plan,
        expressionFieldName,
      ),
    );
  }

  chooseReplacement(id: VocabularySourceId): void {
    this.replan((plan) =>
      withReplacement(this.catalogOf(plan), this.storedPackageSources(), plan, id),
    );
  }

  setDeckScope(deckScope: DeckScope): void {
    const state = this.stateSignal();
    if (state.kind !== 'selecting') {
      return;
    }
    this.stateSignal.set({ kind: 'selecting', plan: withDeckScope(state.plan, deckScope) });
  }

  /** Reads the same file again after a failure that could pass on a retry. */
  async retry(): Promise<void> {
    const source = this.source;
    if (source === null) {
      return;
    }
    await this.start(source);
  }

  cancel(): void {
    if (!this.canCancel()) {
      return;
    }
    this.controller?.abort();
    this.operation += 1;
    this.releaseProvider();
    this.stateSignal.set({ kind: 'cancelled' });
    this.announce('Import cancelled. Your vocabulary is unchanged.');
  }

  /** Clears a finished import so the panel stops showing it. */
  dismiss(): void {
    if (this.isBusy()) {
      return;
    }
    this.releaseProvider();
    this.source = null;
    this.stateSignal.set(IDLE);
  }

  /** Releases the worker and any run in flight. Safe to call more than once. */
  dispose(): void {
    this.controller?.abort();
    this.operation += 1;
    this.controller = null;
    this.releaseProvider();
    this.source = null;
    this.busyRegistry.setBusy('package-import', null);
  }

  private async run(plan: PackageImportPlan, operation: number): Promise<void> {
    const provider = this.provider;
    const controller = this.controller;
    if (provider === null || controller === null) {
      this.fail(ankiError('package-unreadable', 'This package is no longer open.'), operation);
      return;
    }

    const mapping = this.mappingFor(plan);
    this.stateSignal.set({ kind: 'importing', examined: 0 });
    this.announce(`Importing ${mapping.deckName}…`);

    const entries: VocabularySourceCache['entries'][number][] = [];
    const warnings: string[] = [];
    for await (const event of provider.extractReviewed([mapping], controller.signal)) {
      if (!this.isCurrent(operation)) {
        return;
      }
      switch (event.kind) {
        case 'progress':
          this.stateSignal.set({ kind: 'importing', examined: event.examined });
          break;
        case 'entry':
          entries.push({
            ...(event.entry.rawFieldValue === undefined
              ? {}
              : { rawValue: event.entry.rawFieldValue }),
            ...(event.entry.sourceNoteId === undefined
              ? {}
              : { sourceRecordId: event.entry.sourceNoteId }),
            ...(event.entry.reps === undefined ? {} : { reps: event.entry.reps }),
            ...(event.entry.lapseRatio === undefined ? {} : { lapseRatio: event.entry.lapseRatio }),
            ...(event.entry.easeFactor === undefined ? {} : { easeFactor: event.entry.easeFactor }),
          });
          break;
        case 'warning':
          warnings.push(event.message);
          break;
        case 'failed':
          if (event.error.code === 'cancelled') {
            this.cancelled(operation);
          } else {
            this.fail(event.error, operation);
          }
          return;
      }
    }
    if (controller.signal.aborted) {
      this.cancelled(operation);
      return;
    }
    if (entries.length === 0) {
      this.fail(
        ankiError(
          'package-review-data-missing',
          `No reviewed card in ${mapping.deckName} produced a word. Check the deck and field, or export the deck again with scheduling information.`,
        ),
        operation,
      );
      return;
    }

    const refreshedAt = this.clock.now();
    const cache: VocabularySourceCache = {
      sourceId: mapping.id,
      refreshedAt,
      entries,
      warnings,
    };
    const stored: SourceMapping = { ...mapping, updatedAt: refreshedAt, lastSyncedAt: refreshedAt };

    const prepared = await this.sync.prepare({ caches: [cache], sources: [stored] });
    if (!this.isCurrent(operation)) {
      return;
    }
    if (!prepared.ok) {
      this.fail(prepared.error, operation);
      return;
    }

    this.stateSignal.set({ kind: 'committing' });
    const committed = await this.sync.commit(prepared.value);
    if (!this.isCurrent(operation)) {
      return;
    }
    if (!committed.ok) {
      this.fail(committed.error, operation);
      return;
    }

    this.releaseProvider();
    await this.sources.load();
    if (!this.isCurrent(operation)) {
      return;
    }
    this.stateSignal.set({
      kind: 'complete',
      outcome: {
        deckName: stored.deckName,
        replaced: plan.replaces !== null,
        uniqueExpressions: committed.value.uniqueEntryCount,
      },
    });
    this.announce(
      `${plan.replaces === null ? 'Added' : 'Replaced'} ${stored.deckName}. Your vocabulary now has ${String(
        committed.value.uniqueEntryCount,
      )} unique expressions.`,
    );
  }

  /**
   * The source this import writes.
   *
   * Replacing keeps the stored identity and creation time, so a deck imported
   * every week stays one source with one history rather than a new one each
   * time, and stays enabled whether or not it was paused.
   */
  private mappingFor(plan: PackageImportPlan): SourceMapping {
    const existing = plan.replaces;
    const now = this.clock.now();
    return {
      id: existing?.id ?? vocabularySourceId(this.ids.nextId()),
      kind: 'anki-package',
      providerKind: 'package',
      label: `Anki · ${plan.selection.deckName} · ${plan.selection.expressionFieldName}`,
      deckName: plan.selection.deckName,
      deckScope: plan.selection.deckScope,
      noteTypeName: plan.selection.noteTypeName,
      expressionFieldName: plan.selection.expressionFieldName,
      enabled: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSyncedAt: now,
      automaticSync: false,
    };
  }

  private storedPackageSources(): readonly SourceMapping[] {
    return this.sources.mappings().filter((mapping) => mapping.kind === 'anki-package');
  }

  /**
   * The catalog behind a plan.
   *
   * A plan carries the options it was derived from, which is everything the
   * choice functions need, so the catalog does not have to be held separately.
   */
  private catalogOf(plan: PackageImportPlan): AnkiCatalog {
    return { decks: plan.deckOptions, noteTypes: plan.noteTypeOptions };
  }

  private replan(next: (plan: PackageImportPlan) => Result<PackageImportPlan, AnkiError>): void {
    const state = this.stateSignal();
    if (state.kind !== 'selecting') {
      return;
    }
    const replanned = next(state.plan);
    if (!replanned.ok) {
      this.fail(replanned.error);
      return;
    }
    this.stateSignal.set({ kind: 'selecting', plan: replanned.value });
  }

  private fail(error: PackageImportFailure, operation = this.operation): void {
    if (!this.isCurrent(operation)) {
      return;
    }
    this.controller = null;
    this.releaseProvider();
    this.stateSignal.set({
      kind: 'failed',
      error,
      canRetry: this.source !== null && canRetryAfter(error),
    });
    this.announce(`${error.message} Your vocabulary is unchanged.`);
  }

  private cancelled(operation: number): void {
    if (!this.isCurrent(operation)) {
      return;
    }
    this.controller = null;
    this.releaseProvider();
    this.stateSignal.set({ kind: 'cancelled' });
    this.announce('Import cancelled. Your vocabulary is unchanged.');
  }

  private releaseProvider(): void {
    this.provider?.dispose();
    this.provider = null;
  }

  private isCurrent(operation: number): boolean {
    return operation === this.operation;
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}

/**
 * Whether the same file, unchanged, could still succeed.
 *
 * A package that cannot be parsed, or that carries no review history, will fail
 * the same way every time: offering Retry there would waste the learner's time
 * instead of telling them to export the deck again.
 */
function canRetryAfter(error: PackageImportFailure): boolean {
  return error.domain === 'anki' ? isRetryable(error) : true;
}

/**
 * What the service worker could not accept, in the learner's terms.
 *
 * The reasons are the ones `public/monosai-sw.js` can redirect with; anything
 * else is treated as an unreadable share rather than trusted blindly.
 */
function shareFailure(reason: string | undefined): PackageImportFailure {
  switch (reason) {
    case 'wrong-type':
      return ankiError(
        'package-unreadable',
        'That file is not an Anki package. Share an .apkg or .colpkg export from AnkiDroid.',
      );
    case 'too-large':
      return ankiError(
        'package-resource-limit',
        'That package is larger than Monosai will process. Export a single deck rather than the whole collection.',
      );
    case 'storage-full':
      return storageError(
        'quota',
        'There was not enough room on this device to receive that package. Free some space and share it again.',
      );
    case 'no-file':
    case 'too-many-files':
      return ankiError(
        'package-unreadable',
        'Monosai needs exactly one Anki package. Share a single .apkg or .colpkg file.',
      );
    default:
      return ankiError('package-unreadable', 'That shared file could not be read as a package.');
  }
}
