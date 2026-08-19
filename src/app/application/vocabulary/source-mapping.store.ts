import { Injectable, computed, inject, signal } from '@angular/core';
import type { SourceMappingId } from '../../domain/shared/ids';
import { sourceMappingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import type { AnkiProviderKind } from '../../domain/vocabulary/snapshot';
import type { DeckScope, SourceMapping } from '../../domain/vocabulary/source-mapping';
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

  private readonly mappingsSignal = signal<readonly SourceMapping[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly mappings = this.mappingsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastFailure = this.failureSignal.asReadonly();

  readonly enabled = computed(() => this.mappingsSignal().filter((mapping) => mapping.enabled));
  readonly hasEnabled = computed(() => this.enabled().length > 0);

  async load(): Promise<void> {
    const listed = await this.repository.list();
    if (!listed.ok) {
      this.failureSignal.set(listed.error);
      return;
    }
    this.mappingsSignal.set(sorted(listed.value));
    this.failureSignal.set(null);
    this.loadedSignal.set(true);
  }

  async add(mapping: NewMapping): Promise<SourceMapping | null> {
    const now = this.clock.now();
    const created: SourceMapping = {
      id: sourceMappingId(this.ids.nextId()),
      ...mapping,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    return this.write(created, (current) => [...current, created]);
  }

  async update(id: SourceMappingId, edit: MappingEdit): Promise<SourceMapping | null> {
    const existing = this.mappingsSignal().find((mapping) => mapping.id === id);
    if (existing === undefined) {
      return null;
    }
    const updated: SourceMapping = { ...existing, ...edit, updatedAt: this.clock.now() };
    return this.write(updated, (current) =>
      current.map((mapping) => (mapping.id === id ? updated : mapping)),
    );
  }

  async setEnabled(id: SourceMappingId, enabled: boolean): Promise<void> {
    const saved = await this.repository.setEnabled(id, enabled);
    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return;
    }
    this.failureSignal.set(null);
    this.mappingsSignal.update((current) =>
      current.map((mapping) => (mapping.id === id ? saved.value : mapping)),
    );
  }

  async remove(id: SourceMappingId): Promise<void> {
    const removed = await this.repository.remove(id);
    if (!removed.ok) {
      this.failureSignal.set(removed.error);
      return;
    }
    this.failureSignal.set(null);
    this.mappingsSignal.update((current) => current.filter((mapping) => mapping.id !== id));
  }

  private async write(
    mapping: SourceMapping,
    apply: (current: readonly SourceMapping[]) => readonly SourceMapping[],
  ): Promise<SourceMapping | null> {
    const saved = await this.repository.save(mapping);
    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return null;
    }
    this.failureSignal.set(null);
    this.mappingsSignal.update((current) => sorted(apply(current)));
    return saved.value;
  }
}

/** Oldest first, so the editor's order does not shift when one is edited. */
function sorted(mappings: readonly SourceMapping[]): readonly SourceMapping[] {
  return [...mappings].sort((left, right) => left.createdAt - right.createdAt);
}
