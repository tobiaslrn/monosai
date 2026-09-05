import type { Result } from '../shared/result';
import type { StorageError } from '../storage/storage-error';
import type { GrammarProfileSelection, GrammarProfileSnapshot } from './profile';

export interface GrammarRepository {
  /** Never fails to yield a profile: a fresh install reads the default preset. */
  getSelection(): Promise<Result<GrammarProfileSelection, StorageError>>;
  setSelection(selection: GrammarProfileSelection): Promise<Result<void, StorageError>>;

  captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>>;
  getProfileCapture(id: string): Promise<Result<GrammarProfileSnapshot | null, StorageError>>;
}
