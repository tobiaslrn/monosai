import type { Result } from '../shared/result';
import type { SourceMappingId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { SourceMapping } from './source-mapping';

export interface SourceMappingRepository {
  list(): Promise<Result<readonly SourceMapping[], StorageError>>;
  save(mapping: SourceMapping): Promise<Result<SourceMapping, StorageError>>;
  remove(id: SourceMappingId): Promise<Result<void, StorageError>>;
  setEnabled(id: SourceMappingId, enabled: boolean): Promise<Result<SourceMapping, StorageError>>;
}
