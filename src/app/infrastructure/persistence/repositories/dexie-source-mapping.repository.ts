import { err, ok, type Result } from '../../../domain/shared/result';
import type { VocabularySourceId } from '../../../domain/shared/ids';
import type { VocabularySourceRepository } from '../../../domain/vocabulary/vocabulary-source-repository';
import type {
  VocabularySource,
  VocabularySourceCache,
} from '../../../domain/vocabulary/vocabulary-source';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  vocabularySourceCacheRowSchema,
  vocabularySourceRowSchema,
  type VocabularySourceCacheRow,
  type VocabularySourceRow,
} from '../schemas/vocabulary.schema';
import { runStorage } from './storage-operation';

/**
 * Source mappings are few, so enablement is filtered in memory rather than
 * indexed. Caches are read here but written by the vocabulary commit, which
 * replaces them in the same transaction as the snapshot they produced.
 */
export class DexieSourceMappingRepository implements VocabularySourceRepository {
  constructor(private readonly db: MonosaiDatabase) {}

  async list(): Promise<Result<readonly VocabularySource[], StorageError>> {
    const loaded = await runStorage('vocabularySources.list', () =>
      this.db.vocabularySources.toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(vocabularySourceRowSchema, loaded.value, 'vocabularySources');
    return parsed.ok
      ? ok(
          parsed.value
            .map(toSource)
            .sort(
              (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
            ),
        )
      : parsed;
  }

  async save(source: VocabularySource): Promise<Result<VocabularySource, StorageError>> {
    const row = parseRecord(
      vocabularySourceRowSchema,
      { ...source, v: ROW_VERSION },
      `vocabularySources:${source.id}`,
    );
    if (!row.ok) {
      return row;
    }
    const written = await runStorage('vocabularySources.put', () =>
      this.db.vocabularySources.put(row.value),
    );
    return written.ok ? ok(source) : written;
  }

  remove(id: VocabularySourceId): Promise<Result<void, StorageError>> {
    return runStorage('vocabularySources.delete', async () => {
      await this.db.transaction(
        'rw',
        [this.db.vocabularySources, this.db.vocabularySourceCaches],
        async () => {
          await this.db.vocabularySources.delete(id);
          await this.db.vocabularySourceCaches.delete(id);
        },
      );
    });
  }

  async setEnabled(
    id: VocabularySourceId,
    enabled: boolean,
  ): Promise<Result<VocabularySource, StorageError>> {
    const loaded = await runStorage('vocabularySources.get', () =>
      this.db.vocabularySources.get(id),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return err(storageError('not-found', 'That vocabulary source no longer exists.'));
    }
    const parsed = parseRecord(vocabularySourceRowSchema, loaded.value, `vocabularySources:${id}`);
    if (!parsed.ok) {
      return parsed;
    }
    const updated: VocabularySourceRow = { ...parsed.value, enabled };
    const written = await runStorage('vocabularySources.put', () =>
      this.db.vocabularySources.put(updated),
    );
    return written.ok ? ok(toSource(updated)) : written;
  }

  async readCaches(
    sourceIds: readonly VocabularySourceId[],
  ): Promise<Result<readonly VocabularySourceCache[], StorageError>> {
    const loaded = await runStorage('vocabularySourceCaches.read', () =>
      this.db.vocabularySourceCaches.bulkGet([...sourceIds]),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const rows = loaded.value.filter((row): row is VocabularySourceCacheRow => row !== undefined);
    const parsed = parseRecords(vocabularySourceCacheRowSchema, rows, 'vocabularySourceCaches');
    return parsed.ok ? ok(parsed.value.map(toCache)) : parsed;
  }
}

function toSource(row: VocabularySourceRow): VocabularySource {
  const { v: _version, ...source } = row;
  return source;
}

function toCache(row: VocabularySourceCacheRow): VocabularySourceCache {
  const { v: _version, ...cache } = row;
  return cache;
}
