import type { Result } from '../shared/result';
import type { PersistenceStatus } from './persistence-status';
import type { StorageError } from './storage-error';

/** Storage durability, usage reporting, and destructive maintenance actions. */
export interface StorageMaintenance {
  getPersistenceStatus(): Promise<PersistenceStatus>;
  requestPersistence(): Promise<PersistenceStatus>;
  /** Deletes audio blobs and audio jobs only. */
  clearAudioCache(): Promise<Result<void, StorageError>>;
  /** Deletes every Monosai database and cache after explicit confirmation. */
  resetAllData(): Promise<Result<void, StorageError>>;
}
