import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
import {
  suggestAnkiMapping,
  type AnkiMappingSuggestion,
} from '../../domain/vocabulary/suggest-anki-mapping';
import { SourceMappingStore } from './source-mapping.store';
import { VocabularyRefreshStore } from './vocabulary-refresh.store';
import { SnapshotHistoryStore } from './snapshot-history.store';

/** An uncommitted connection: neither source nor vocabulary exists until confirmation. */
@Injectable()
export class AnkiConnectionStore {
  readonly refresh = inject(VocabularyRefreshStore);
  private readonly sources = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private controller: AbortController | null = null;
  readonly selecting = signal(false);
  readonly sampling = signal(false);
  readonly suggested = signal(false);
  readonly selection = signal<AnkiMappingSuggestion>({
    deckName: '',
    noteTypeName: '',
    expressionFieldName: '',
  });
  readonly valid = computed(() => {
    const selection = this.selection();
    const catalog = this.refresh.catalog();
    return (
      catalog?.decks.some((deck) => deck.name === selection.deckName) === true &&
      catalog.noteTypes.some(
        (type) =>
          type.name === selection.noteTypeName &&
          type.fieldNames.includes(selection.expressionFieldName),
      )
    );
  });
  readonly preview = computed(() => {
    const state = this.refresh.state();
    return state.kind === 'awaiting-confirmation' ? state.summary : null;
  });
  readonly sampleWords = computed(() => {
    const commit = this.preview()?.prepared.commit;
    if (commit === undefined) return [];
    const ids = new Set(commit.sources.map((source) => source.id));
    const hashes = new Set(
      commit.provenance
        .filter((entry) => ids.has(entry.sourceId))
        .map((entry) => entry.vocabularyItemId),
    );
    return commit.items
      .filter((item) => hashes.has(item.id))
      .slice(0, 10)
      .map((item) => item.visibleExpression);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }

  async connect(provider: AnkiVocabularyProvider): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    const cancelled = () => controller.signal.aborted;
    this.controller = controller;
    this.selecting.set(false);
    await this.refresh.connect(provider);
    const catalog = this.refresh.catalog();
    if (catalog === null || cancelled()) return;
    this.sampling.set(true);
    const sampled = await provider.sampleFields?.(catalog, controller.signal);
    if (cancelled()) return;
    const suggestion = sampled?.ok ? suggestAnkiMapping(catalog, sampled.value) : null;
    this.selection.set(suggestion ?? { deckName: '', noteTypeName: '', expressionFieldName: '' });
    this.suggested.set(suggestion !== null);
    this.sampling.set(false);
    this.selecting.set(true);
    if (suggestion !== null) await this.prepare();
  }

  change(patch: Partial<AnkiMappingSuggestion>): void {
    this.refresh.discard();
    this.selection.update((current) => ({ ...current, ...patch }));
  }

  async prepare(): Promise<void> {
    if (!this.valid() || this.refresh.isBusy()) return;
    const source = this.sources.draft({
      ...this.selection(),
      providerKind: 'desktop-connect',
      deckScope: 'deck-only',
    });
    await this.refresh.refresh([source]);
  }

  async confirm(): Promise<void> {
    await this.refresh.confirm();
    if (this.refresh.state().kind === 'complete') {
      this.selecting.set(false);
      await this.history.load();
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.refresh.cancel();
    this.selecting.set(false);
    this.sampling.set(false);
  }
}
