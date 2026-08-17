import { err, ok, type Result } from '../../../domain/shared/result';
import type { SourceMappingId } from '../../../domain/shared/ids';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { SourceMappingRepository } from '../../../domain/vocabulary/source-mapping-repository';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import { sourceMappingRowSchema, type SourceMappingRow } from '../schemas/vocabulary.schema';
import { runStorage } from './storage-operation';

/** Source mappings are few, so enablement is filtered in memory rather than indexed. */
export class DexieSourceMappingRepository implements SourceMappingRepository {
  constructor(private readonly db: MonosaiDatabase) {}

  async list(): Promise<Result<readonly SourceMapping[], StorageError>> {
    const loaded = await runStorage('sourceMappings.list', () => this.db.sourceMappings.toArray());
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(sourceMappingRowSchema, loaded.value, 'sourceMappings');
    return parsed.ok ? ok(parsed.value.map(toMapping)) : parsed;
  }

  async save(mapping: SourceMapping): Promise<Result<SourceMapping, StorageError>> {
    const written = await runStorage('sourceMappings.put', () =>
      this.db.sourceMappings.put({ ...mapping, v: ROW_VERSION }),
    );
    return written.ok ? ok(mapping) : written;
  }

  remove(id: SourceMappingId): Promise<Result<void, StorageError>> {
    return runStorage('sourceMappings.delete', async () => {
      await this.db.sourceMappings.delete(id);
    });
  }

  async setEnabled(
    id: SourceMappingId,
    enabled: boolean,
  ): Promise<Result<SourceMapping, StorageError>> {
    const loaded = await runStorage('sourceMappings.get', () => this.db.sourceMappings.get(id));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return err(storageError('not-found', 'That vocabulary source no longer exists.'));
    }
    const updated: SourceMappingRow = { ...loaded.value, enabled };
    const written = await runStorage('sourceMappings.put', () =>
      this.db.sourceMappings.put(updated),
    );
    return written.ok ? ok(toMapping(updated)) : written;
  }
}

function toMapping(row: SourceMappingRow): SourceMapping {
  const { v: _version, ...mapping } = row;
  return mapping;
}
