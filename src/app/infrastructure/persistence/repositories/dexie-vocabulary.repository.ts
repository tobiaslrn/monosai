import { ok, type Result } from '../../../domain/shared/result';
import type { SnapshotId } from '../../../domain/shared/ids';
import type {
  VocabularyItem,
  VocabularyProvenance,
  VocabularySnapshot,
} from '../../../domain/vocabulary/snapshot';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../../domain/settings/settings';
import type {
  SnapshotCommit,
  VocabularyRepository,
} from '../../../domain/vocabulary/vocabulary-repository';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import { SETTINGS_KEYS, appSettingsSchema } from '../schemas/settings.schema';
import {
  vocabularySourceCacheRowSchema,
  vocabularySourceRowSchema,
  vocabularyItemRowSchema,
  vocabularyProvenanceRowSchema,
  vocabularySnapshotRowSchema,
  type VocabularyItemRow,
  type VocabularySnapshotRow,
} from '../schemas/vocabulary.schema';
import { assertUniqueIds } from './integrity';
import { StorageRuleViolation, runStorage, runStorageWithRules } from './storage-operation';

/**
 * The vocabulary table is a current-state cache, not a history log. A refresh
 * replaces its one snapshot and matcher inputs inside one transaction, so a
 * failed or cancelled refresh can never change what the reader sees.
 *
 * The same transaction upserts the sources and source caches the snapshot was
 * built from. They are the snapshot's inputs, so committing them separately
 * would let a storage failure leave a source stored without the vocabulary that
 * justifies it.
 */
export class DexieVocabularyRepository implements VocabularyRepository {
  constructor(private readonly db: MonosaiDatabase) {}

  commitSnapshot(commit: SnapshotCommit): Promise<Result<VocabularySnapshot, StorageError>> {
    return runStorageWithRules('vocabulary.commitSnapshot', async () => {
      assertUniqueIds(commit.items, 'vocabulary item');
      if (commit.snapshot.uniqueEntryCount !== commit.items.length) {
        throw new StorageRuleViolation(
          storageError('conflict', 'The snapshot entry count does not match its items.'),
        );
      }
      const itemIds = new Set<string>(commit.items.map((item) => item.id));
      if (commit.items.some((item) => item.snapshotId !== commit.snapshot.id)) {
        throw new StorageRuleViolation(
          storageError('conflict', 'A vocabulary item points at a different snapshot.'),
        );
      }
      for (const record of commit.provenance) {
        if (!itemIds.has(record.vocabularyItemId)) {
          throw new StorageRuleViolation(
            storageError('conflict', 'Provenance references an item outside this snapshot.'),
          );
        }
      }

      // Rows are validated before the transaction opens, so an unusable source
      // or cache fails the commit without aborting a write already under way.
      const sourceRows = commit.sources.map((source) => {
        const row = parseRecord(
          vocabularySourceRowSchema,
          { ...source, v: ROW_VERSION },
          `vocabularySources:${source.id}`,
        );
        if (!row.ok) {
          throw new StorageRuleViolation(row.error);
        }
        return row.value;
      });
      const cacheRows = commit.caches.map((cache) => {
        const row = parseRecord(
          vocabularySourceCacheRowSchema,
          { ...cache, v: ROW_VERSION },
          `vocabularySourceCaches:${cache.sourceId}`,
        );
        if (!row.ok) {
          throw new StorageRuleViolation(row.error);
        }
        return row.value;
      });

      let replacement = commit.snapshot;
      await this.db.transaction(
        'rw',
        [
          this.db.vocabularySnapshots,
          this.db.vocabularyItems,
          this.db.vocabularyProvenance,
          this.db.vocabularySources,
          this.db.vocabularySourceCaches,
          this.db.settings,
          this.db.readings,
          this.db.frozenValidations,
          this.db.generationProvenance,
        ],
        async () => {
          if (sourceRows.length > 0) {
            await this.db.vocabularySources.bulkPut(sourceRows);
          }
          if (cacheRows.length > 0) {
            await this.db.vocabularySourceCaches.bulkPut(cacheRows);
          }
          const current = await this.readAppSettingsWithinTransaction();
          const id = current.activeSnapshotId ?? commit.snapshot.id;
          replacement = id === commit.snapshot.id ? commit.snapshot : { ...commit.snapshot, id };
          const items = commit.items.map((item) => ({ ...item, snapshotId: id }));

          await this.db.vocabularySnapshots.clear();
          await this.db.vocabularyItems.clear();
          await this.db.vocabularyProvenance.clear();
          await this.db.vocabularySnapshots.add({ ...replacement, v: ROW_VERSION });
          await this.db.vocabularyItems.bulkAdd(items.map((item) => ({ ...item, v: ROW_VERSION })));
          await this.db.vocabularyProvenance.bulkAdd(
            commit.provenance.map((record) => ({ ...record, v: ROW_VERSION })),
          );
          await this.pointGeneratedStoriesAtCurrentSnapshotWithinTransaction(id);
          await this.db.settings.put({
            key: SETTINGS_KEYS.app,
            v: ROW_VERSION,
            value: { ...current, activeSnapshotId: id },
          });
        },
      );

      return replacement;
    });
  }

  async listSnapshots(): Promise<Result<readonly VocabularySnapshot[], StorageError>> {
    const loaded = await runStorage('vocabularySnapshots.list', () =>
      this.db.vocabularySnapshots.orderBy('createdAt').reverse().toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(vocabularySnapshotRowSchema, loaded.value, 'vocabularySnapshots');
    return parsed.ok ? ok(parsed.value.map(toSnapshot)) : parsed;
  }

  async getActiveSnapshot(): Promise<Result<VocabularySnapshot | null, StorageError>> {
    const settings = await runStorage('settings.get(app)', () =>
      this.db.settings.get(SETTINGS_KEYS.app),
    );
    if (!settings.ok) {
      return settings;
    }
    if (!settings.value) {
      return ok(null);
    }
    const parsed = parseRecord(appSettingsSchema, settings.value.value, 'settings:app');
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.value.activeSnapshotId === null) {
      return ok(null);
    }
    return this.getSnapshot(parsed.value.activeSnapshotId);
  }

  async getSnapshot(id: SnapshotId): Promise<Result<VocabularySnapshot | null, StorageError>> {
    const loaded = await runStorage('vocabularySnapshots.get', () =>
      this.db.vocabularySnapshots.get(id),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(vocabularySnapshotRowSchema, loaded.value, 'vocabularySnapshots');
    return parsed.ok ? ok(toSnapshot(parsed.value)) : parsed;
  }

  async listExpressionHashes(id: SnapshotId): Promise<Result<readonly string[], StorageError>> {
    const loaded = await runStorage('vocabularyItems.expressionHashes', () =>
      this.db.vocabularyItems.where('snapshotId').equals(id).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(vocabularyItemRowSchema, loaded.value, 'vocabularyItems');
    return parsed.ok ? ok(parsed.value.map(toItem).map((item) => item.expressionHash)) : parsed;
  }

  /** Streams matcher input in bounded batches so no query loads every item. */
  async *streamItems(id: SnapshotId, batchSize: number): AsyncIterable<readonly VocabularyItem[]> {
    let offset = 0;
    for (;;) {
      const batch = await this.db.vocabularyItems
        .where('snapshotId')
        .equals(id)
        .offset(offset)
        .limit(batchSize)
        .toArray();
      if (batch.length === 0) {
        return;
      }
      yield batch.map(toItem);
      offset += batch.length;
    }
  }

  async listProvenance(
    id: SnapshotId,
  ): Promise<Result<readonly VocabularyProvenance[], StorageError>> {
    const items = await runStorage('vocabularyItems.ids', () =>
      this.db.vocabularyItems.where('snapshotId').equals(id).primaryKeys(),
    );
    if (!items.ok) {
      return items;
    }
    const loaded = await runStorage('vocabularyProvenance.list', () =>
      this.db.vocabularyProvenance.where('vocabularyItemId').anyOf(items.value).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(
      vocabularyProvenanceRowSchema,
      loaded.value,
      'vocabularyProvenance',
    );
    if (!parsed.ok) {
      return parsed;
    }
    return ok(
      parsed.value.map((row) => {
        const { id: _rowId, v: _version, ...provenance } = row;
        return provenance;
      }),
    );
  }

  countStoriesUsingSnapshot(id: SnapshotId): Promise<Result<number, StorageError>> {
    return runStorage('readings.countBySnapshot', () =>
      this.db.readings
        .where('kind')
        .equals('generated')
        .filter((row) => row.kind === 'generated' && row.snapshotId === id)
        .count(),
    );
  }

  private async readAppSettingsWithinTransaction(): Promise<AppSettings> {
    const existing = await this.db.settings.get(SETTINGS_KEYS.app);
    const current = existing
      ? parseRecord(appSettingsSchema, existing.value, 'settings:app')
      : null;
    if (current && !current.ok) {
      throw new StorageRuleViolation(current.error);
    }
    return current?.ok ? current.value : DEFAULT_APP_SETTINGS;
  }

  /** Existing generated stories keep their evidence but follow the one current id. */
  private async pointGeneratedStoriesAtCurrentSnapshotWithinTransaction(
    id: SnapshotId,
  ): Promise<void> {
    await this.db.readings
      .where('kind')
      .equals('generated')
      .modify((row) => {
        if (row.kind === 'generated') {
          Object.assign(row, { snapshotId: id });
        }
      });
    await this.db.frozenValidations.toCollection().modify((row) => {
      Object.assign(row, { snapshotId: id });
    });
    await this.db.generationProvenance.toCollection().modify((row) => {
      Object.assign(row, { snapshotId: id });
    });
  }
}

function toSnapshot(row: VocabularySnapshotRow): VocabularySnapshot {
  const { v: _version, ...snapshot } = row;
  return snapshot;
}

function toItem(row: VocabularyItemRow): VocabularyItem {
  const { v: _version, ...item } = row;
  return item;
}
