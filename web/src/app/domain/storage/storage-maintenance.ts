import type { Result } from '../shared/result';
import type { ReadingId } from '../shared/ids';
import type { PersistenceStatus } from './persistence-status';
import type { StorageError } from './storage-error';

/** Storage durability, usage reporting, and destructive maintenance actions. */
export interface StorageMaintenance {
  /** Reading the status can itself fail; a browser may refuse to estimate. */
  getPersistenceStatus(): Promise<Result<PersistenceStatus, StorageError>>;
  /** Asks for durable storage. The browser may grant, decline, or fail. */
  requestPersistence(): Promise<Result<PersistenceStatus, StorageError>>;
  /** Deletes audio blobs and audio jobs only. */
  clearAudioCache(): Promise<Result<void, StorageError>>;
  /** Deletes audio blobs and audio jobs owned by one reading only. */
  clearReadingAudio(readingId: ReadingId): Promise<Result<void, StorageError>>;
  /** Deletes every Monosai database and cache after explicit confirmation. */
  resetAllData(): Promise<Result<void, StorageError>>;
}
