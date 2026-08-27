import type { Result } from '../shared/result';
import type { VocabularySourceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { VocabularySource, VocabularySourceCache } from './vocabulary-source';

export interface VocabularySourceRepository {
  list(): Promise<Result<readonly VocabularySource[], StorageError>>;
  save(source: VocabularySource): Promise<Result<VocabularySource, StorageError>>;
  remove(id: VocabularySourceId): Promise<Result<void, StorageError>>;
  setEnabled(
    id: VocabularySourceId,
    enabled: boolean,
  ): Promise<Result<VocabularySource, StorageError>>;
  readCaches(
    sourceIds: readonly VocabularySourceId[],
  ): Promise<Result<readonly VocabularySourceCache[], StorageError>>;
}
