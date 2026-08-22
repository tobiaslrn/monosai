import { Injectable, computed, inject, signal } from '@angular/core';
import { ankiError, type AnkiError } from '../../domain/anki/anki-error';
import type { AnkiVocabularyProvider, ExtractedEntry } from '../../domain/anki/anki-provider';
import type { AnkiCapabilities } from '../../domain/anki/capabilities';
import type { AnkiCatalog } from '../../domain/anki/catalog';
import { canDiscover, canRefresh } from '../../domain/anki/capabilities';
import {
  canRefreshMappings,
  resolveMappings,
  type MappingResolution,
} from '../../domain/anki/mapping-validation';
import type { LanguageError } from '../../domain/language/language-error';
import type { SourceMappingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import type { SnapshotStats, VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import type { SnapshotCommit } from '../../domain/vocabulary/vocabulary-repository';
import { LanguageStore } from '../language/language.store';
import { SourceMappingStore } from './source-mapping.store';
import { VocabularyClassificationService } from '../reading/vocabulary-classification.service';
import { AppSettingsStore } from '../settings/app-settings.store';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { SnapshotBuilder } from './snapshot-builder';

/** Anything that can go wrong before or during a commit. */
export type RefreshFailure = AnkiError | LanguageError | StorageError;

export interface RefreshSummary {
  readonly stats: SnapshotStats;
  readonly commit: SnapshotCommit;
}

/**
 * The refresh state machine.
 *
 * The states follow the workflow the specification names, and the ordering
 * matters: everything before `committing` can be cancelled or fail without
 * touching stored data, and `committing` is the one state that cannot be
 * cancelled because it is a single transaction that either replaces the current
 * vocabulary or leaves it exactly as it was.
 */
export type RefreshState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'probing' }
  | { readonly kind: 'discovering' }
  | { readonly kind: 'validating' }
  | { readonly kind: 'querying'; readonly mappingsDone: number; readonly mappingsTotal: number }
  | { readonly kind: 'extracting'; readonly examined: number; readonly total: number | null }
  | { readonly kind: 'analyzing'; readonly completed: number; readonly total: number }
  | { readonly kind: 'summarizing' }
  | { readonly kind: 'awaiting-confirmation'; readonly summary: RefreshSummary }
  | { readonly kind: 'committing' }
  | { readonly kind: 'complete'; readonly snapshot: VocabularySnapshot }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: RefreshFailure };

const IDLE: RefreshState = { kind: 'idle' };

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

/** States where a cancel request is still meaningful. */
const CANCELLABLE = new Set<RefreshState['kind']>([
  'probing',
  'discovering',
  'validating',
  'querying',
  'extracting',
  'analyzing',
  'summarizing',
  'awaiting-confirmation',
]);

/**
 * One vocabulary refresh, from connecting to a source through to an activated
 * snapshot.
 *
 * The store is provided by the Vocabulary page rather than at the root, so
 * leaving the screen discards whatever was in flight. Extracted field values
 * live only here and in the provider; nothing is written until the learner
 * confirms, and a failure or cancellation at any point before that leaves the
 * previously active vocabulary untouched.
 */
@Injectable()
export class VocabularyRefreshStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly builder = inject(SnapshotBuilder);
  private readonly settings = inject(AppSettingsStore);
  private readonly classification = inject(VocabularyClassificationService);
  private readonly language = inject(LanguageStore);
  private readonly sources = inject(SourceMappingStore);

  private readonly stateSignal = signal<RefreshState>(IDLE);
  private readonly capabilitiesSignal = signal<AnkiCapabilities | null>(null);
  private readonly catalogSignal = signal<AnkiCatalog | null>(null);
  private readonly warningsSignal = signal<readonly string[]>([]);
  private readonly announcementSignal = signal('');

  private provider: AnkiVocabularyProvider | null = null;
  private controller: AbortController | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly capabilities = this.capabilitiesSignal.asReadonly();
  readonly catalog = this.catalogSignal.asReadonly();

  /**
   * How the configured mappings line up with what the source actually has.
   *
   * Derived rather than stored, so repairing a stale mapping clears its warning
   * immediately instead of only when the next refresh runs.
   */
  readonly resolution = computed<MappingResolution | null>(() => {
    const catalog = this.catalogSignal();
    return catalog === null ? null : resolveMappings(this.sources.mappings(), catalog);
  });
  readonly warnings = this.warningsSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();

  readonly isBusy = computed(() => {
    const kind = this.stateSignal().kind;
    return kind !== 'idle' && kind !== 'complete' && kind !== 'cancelled' && kind !== 'failed';
  });
  readonly canCancel = computed(() => CANCELLABLE.has(this.stateSignal().kind));
  readonly mappingEditorEnabled = computed(() => {
    const capabilities = this.capabilitiesSignal();
    return capabilities !== null && canDiscover(capabilities) && this.catalogSignal() !== null;
  });

  /**
   * Connects to a source and discovers what can be mapped.
   *
   * Discovery follows the probe immediately because a mapping editor with no
   * catalog behind it can only offer free text, which the specification
   * forbids: every dropdown value has to come from the provider.
   */
  async connect(provider: AnkiVocabularyProvider): Promise<void> {
    this.releaseProvider();
    this.provider = provider;
    this.capabilitiesSignal.set(null);
    this.catalogSignal.set(null);
    this.warningsSignal.set([]);

    const signal = this.beginRun('probing');

    const probed = await provider.probe(signal);
    if (!probed.ok) {
      this.fail(probed.error);
      return;
    }
    this.capabilitiesSignal.set(probed.value);

    this.stateSignal.set({ kind: 'discovering' });
    const discovered = await provider.discover(signal);
    if (!discovered.ok) {
      this.fail(discovered.error);
      return;
    }
    this.catalogSignal.set(discovered.value);

    this.finishRun();
    this.stateSignal.set(IDLE);
    this.announce(
      `Connected. Found ${String(discovered.value.decks.length)} decks and ${String(
        discovered.value.noteTypes.length,
      )} note types.`,
    );
  }

  /**
   * Reads every enabled mapping and prepares a snapshot for confirmation.
   *
   * All enabled mappings are combined into one snapshot; there is deliberately
   * no per-mapping or per-generation source selection, and the mappings are
   * read from the store rather than passed in so a caller cannot refresh
   * against a list the editor is not showing. Nothing is stored here — the
   * result waits in `awaiting-confirmation` until the learner accepts it.
   */
  async refresh(): Promise<void> {
    const provider = this.provider;
    const capabilities = this.capabilitiesSignal();
    if (provider === null || capabilities === null) {
      this.fail(ankiError('not-running', 'Connect to a vocabulary source first.'));
      return;
    }
    if (!canRefresh(capabilities)) {
      this.fail(
        ankiError(
          'review-evidence-unsupported',
          'This source cannot show which cards you have reviewed, so Monosai cannot build a snapshot from it.',
        ),
      );
      return;
    }

    const signal = this.beginRun('validating');

    const resolution = this.resolution();
    if (resolution === null || !canRefreshMappings(resolution)) {
      this.fail(
        ankiError(
          'query-failed',
          resolution !== null && resolution.stale.length > 0
            ? 'Some vocabulary sources no longer match your collection. Repair or remove them, then refresh again.'
            : 'Enable at least one vocabulary source before refreshing.',
        ),
      );
      return;
    }

    // The language runtime tokenizes every expression, so it has to be ready
    // before anything is read rather than after a long extraction.
    const ready = await this.language.initialize();
    if (!ready) {
      this.fail(
        ankiError('unknown', 'Japanese language support could not be prepared for this refresh.'),
      );
      return;
    }

    const resolved = resolution.resolved;
    this.stateSignal.set({ kind: 'querying', mappingsDone: 0, mappingsTotal: resolved.length });

    const entries: ExtractedEntry[] = [];
    const warnings: string[] = [];
    const seenMappings = new Set<SourceMappingId>();

    for await (const event of provider.extractReviewed(resolved, signal)) {
      switch (event.kind) {
        case 'progress':
          if (!seenMappings.has(event.mappingId)) {
            seenMappings.add(event.mappingId);
          }
          this.stateSignal.set({
            kind: 'extracting',
            examined: event.examined,
            total: event.total,
          });
          break;
        case 'entry':
          entries.push(event.entry);
          break;
        case 'warning':
          warnings.push(event.message);
          break;
        case 'failed':
          if (event.error.code === 'cancelled') {
            this.cancelled();
          } else {
            this.fail(event.error);
          }
          return;
      }
    }

    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    const currentSnapshot = await this.vocabulary.getActiveSnapshot();
    if (!currentSnapshot.ok) {
      this.fail(currentSnapshot.error);
      return;
    }

    this.warningsSignal.set(warnings);
    this.stateSignal.set({ kind: 'analyzing', completed: 0, total: entries.length });

    const built = await this.builder.build(
      {
        entries,
        mappings: resolved,
        providerKinds: [provider.kind],
        warnings,
        ...(currentSnapshot.value === null ? {} : { snapshotId: currentSnapshot.value.id }),
      },
      (progress) => {
        this.stateSignal.set({
          kind: 'analyzing',
          completed: progress.completed,
          total: progress.total,
        });
      },
      signal,
    );
    if (!built.ok) {
      if (built.error.code === 'cancelled') {
        this.cancelled();
      } else {
        this.fail(built.error);
      }
      return;
    }
    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    this.stateSignal.set({ kind: 'summarizing' });
    this.finishRun();
    this.stateSignal.set({
      kind: 'awaiting-confirmation',
      summary: { stats: built.value.stats, commit: built.value.commit },
    });
    this.announce(
      `Found ${String(built.value.stats.uniqueExpressions)} unique expressions. Confirm to save them.`,
    );
  }

  /**
   * Replaces the prepared vocabulary and makes it current.
   *
   * This is the only non-cancellable state. The repository does the whole thing
   * in one transaction, so a failure here leaves the previous current vocabulary
   * exactly as it was, and the reader keeps classifying against it.
   */
  async confirm(): Promise<void> {
    const current = this.stateSignal();
    if (current.kind !== 'awaiting-confirmation') {
      return;
    }

    this.stateSignal.set({ kind: 'committing' });
    const committed = await this.vocabulary.commitSnapshot(current.summary.commit);
    if (!committed.ok) {
      this.stateSignal.set({ kind: 'failed', error: committed.error });
      this.announce('The current vocabulary could not be updated. Your previous one is unchanged.');
      return;
    }

    // The reader keeps a compiled matcher for whichever vocabulary it last saw,
    // and settings hold the current id, so both have to be told the world moved.
    await this.settings.reloadAppSettings();
    this.classification.invalidate();

    this.stateSignal.set({ kind: 'complete', snapshot: committed.value });
    this.announce(
      `Updated vocabulary with ${String(committed.value.uniqueEntryCount)} unique expressions.`,
    );
  }

  /** Abandons the prepared snapshot without writing anything. */
  discard(): void {
    if (this.stateSignal().kind !== 'awaiting-confirmation') {
      return;
    }
    this.stateSignal.set(IDLE);
    this.announce('Discarded. Your previous vocabulary is unchanged.');
  }

  cancel(): void {
    if (!this.canCancel()) {
      return;
    }
    if (this.stateSignal().kind === 'awaiting-confirmation') {
      this.discard();
      return;
    }
    this.controller?.abort();
  }

  /** Releases the provider and any in-flight work. Safe to call more than once. */
  dispose(): void {
    this.controller?.abort();
    this.controller = null;
    this.releaseProvider();
  }

  private beginRun(kind: 'probing' | 'validating'): AbortSignal {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.stateSignal.set({ kind });
    return controller.signal;
  }

  private finishRun(): void {
    this.controller = null;
  }

  private fail(error: RefreshFailure): void {
    this.finishRun();
    this.stateSignal.set({ kind: 'failed', error });
    this.announce(error.message);
  }

  private cancelled(): void {
    this.finishRun();
    this.stateSignal.set({ kind: 'cancelled' });
    this.announce(
      'Refresh cancelled. Nothing was saved and your previous vocabulary is unchanged.',
    );
  }

  private releaseProvider(): void {
    this.provider?.dispose();
    this.provider = null;
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}
