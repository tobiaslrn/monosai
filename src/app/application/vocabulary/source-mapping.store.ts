import { Injectable, computed, inject, signal } from '@angular/core';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { vocabularySourceId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import type { AnkiProviderKind } from '../../domain/vocabulary/snapshot';
import type { DeckScope, SourceMapping } from '../../domain/vocabulary/source-mapping';
import type {
  TextListVocabularySource,
  VocabularySource,
} from '../../domain/vocabulary/vocabulary-source';
import { isIncludedInVocabulary } from '../../domain/vocabulary/vocabulary-source';
import { CLOCK, ID_GENERATOR, SOURCE_MAPPING_REPOSITORY } from '../shared/repository-tokens';

export interface NewMapping {
  readonly providerKind: AnkiProviderKind;
  readonly deckName: string;
  readonly deckScope: DeckScope;
  readonly noteTypeName: string;
  readonly expressionFieldName: string;
}

export type MappingEdit = Partial<NewMapping>;

/**
 * The learner's configured vocabulary sources.
 *
 * Mappings are few and long-lived, so the whole list is held in memory and
 * written through on every change. On a failed write the in-memory list is left
 * alone, so the screen keeps showing what is actually stored rather than an
 * edit that did not survive.
 */
@Injectable({ providedIn: 'root' })
export class SourceMappingStore {
  private readonly repository = inject(SOURCE_MAPPING_REPOSITORY);
  private readonly ids = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);

  private readonly sourcesSignal = signal<readonly VocabularySource[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly sources = this.sourcesSignal.asReadonly();
  readonly mappings = computed(() =>
    this.sourcesSignal().filter(
      (source): source is SourceMapping =>
        source.kind === 'anki-connect' || source.kind === 'anki-package',
    ),
  );
  readonly textLists = computed(() =>
    this.sourcesSignal().filter(
      (source): source is TextListVocabularySource => source.kind === 'text-list',
    ),
  );
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastFailure = this.failureSignal.asReadonly();

  /**
   * The sources whose words make up the combined vocabulary.
   *
   * Named for the consequence rather than for the stored flag: including a
   * source is what puts its words in the vocabulary, and it is a separate
   * decision from whether that source is read automatically.
   */
  readonly included = computed(() => this.sourcesSignal().filter(isIncludedInVocabulary));
  readonly hasIncluded = computed(() => this.included().length > 0);

  async load(): Promise<void> {
    const listed = await this.repository.list();
    if (!listed.ok) {
      this.failureSignal.set(listed.error);
      return;
    }
    this.sourcesSignal.set(sorted(listed.value));
    this.failureSignal.set(null);
    this.loadedSignal.set(true);
  }

  async add(mapping: NewMapping): Promise<SourceMapping | null> {
    const now = this.clock.now();
    const common = {
      id: vocabularySourceId(this.ids.nextId()),
      label: `Anki · ${mapping.deckName} · ${mapping.expressionFieldName}`,
      deckName: mapping.deckName,
      deckScope: mapping.deckScope,
      noteTypeName: mapping.noteTypeName,
      expressionFieldName: mapping.expressionFieldName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: null,
    };
    const created: SourceMapping =
      mapping.providerKind === 'package'
        ? { ...common, kind: 'anki-package', providerKind: 'package', automaticSync: false }
        : {
            ...common,
            kind: 'anki-connect',
            providerKind: mapping.providerKind,
            automaticSync: true,
          };
    return this.write(created, (current) => [...current, created]);
  }

  async update(id: VocabularySourceId, edit: MappingEdit): Promise<SourceMapping | null> {
    const existing = this.mappings().find((mapping) => mapping.id === id);
    if (existing === undefined) {
      return null;
    }
    const updated: SourceMapping = {
      ...existing,
      ...edit,
      label: `Anki · ${edit.deckName ?? existing.deckName} · ${edit.expressionFieldName ?? existing.expressionFieldName}`,
      updatedAt: this.clock.now(),
    };
    return this.write(updated, (current) =>
      current.map((mapping) => (mapping.id === id ? updated : mapping)),
    );
  }

  async addTextList(label: string, content: string): Promise<TextListVocabularySource | null> {
    const now = this.clock.now();
    const source: TextListVocabularySource = {
      id: vocabularySourceId(this.ids.nextId()),
      kind: 'text-list',
      label,
      content,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    return this.write(source, (current) => [...current, source]);
  }

  async updateTextList(
    id: VocabularySourceId,
    edit: { readonly label: string; readonly content: string },
  ): Promise<TextListVocabularySource | null> {
    const existing = this.textLists().find((source) => source.id === id);
    if (existing === undefined) {
      return null;
    }
    const now = this.clock.now();
    const updated: TextListVocabularySource = {
      ...existing,
      ...edit,
      updatedAt: now,
      lastSyncedAt: now,
    };
    return this.write(updated, (current) =>
      current.map((source) => (source.id === id ? updated : source)),
    );
  }

  async setAutomaticSync(id: VocabularySourceId, automaticSync: boolean): Promise<void> {
    const existing = this.mappings().find(
      (source) => source.id === id && source.kind === 'anki-connect',
    );
    if (existing === undefined) {
      return;
    }
    const updated = { ...existing, automaticSync, updatedAt: this.clock.now() };
    await this.write(updated, (current) =>
      current.map((source) => (source.id === id ? updated : source)),
    );
  }

  /** Adds this source's words to the combined vocabulary, or takes them out. */
  async setIncluded(id: VocabularySourceId, included: boolean): Promise<void> {
    const saved = await this.repository.setEnabled(id, included);
    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return;
    }
    this.failureSignal.set(null);
    this.sourcesSignal.update((current) =>
      current.map((source) => (source.id === id ? saved.value : source)),
    );
  }

  async remove(id: VocabularySourceId): Promise<void> {
    const removed = await this.repository.remove(id);
    if (!removed.ok) {
      this.failureSignal.set(removed.error);
      return;
    }
    this.failureSignal.set(null);
    this.sourcesSignal.update((current) => current.filter((source) => source.id !== id));
  }

  private async write<TSource extends VocabularySource>(
    source: TSource,
    apply: (current: readonly VocabularySource[]) => readonly VocabularySource[],
  ): Promise<TSource | null> {
    const saved = await this.repository.save(source);
    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return null;
    }
    this.failureSignal.set(null);
    this.sourcesSignal.update((current) => sorted(apply(current)));
    return saved.value as TSource;
  }
}

/** Oldest first, so the editor's order does not shift when one is edited. */
function sorted(sources: readonly VocabularySource[]): readonly VocabularySource[] {
  return [...sources].sort((left, right) => left.createdAt - right.createdAt);
}
