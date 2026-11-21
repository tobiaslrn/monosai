import type { Result } from '../shared/result';
import type { ReadingId, SentenceId } from '../shared/ids';
import type { PersistenceStatus } from './persistence-status';
import type { StorageError } from './storage-error';

export type ClearableReadingAid = 'english' | 'grammar';

/** Storage durability, usage reporting, and destructive maintenance actions. */
export interface StorageMaintenance {
  /** Reading the status can itself fail; a browser may refuse to estimate. */
  getPersistenceStatus(): Promise<Result<PersistenceStatus, StorageError>>;
  /** Asks for durable storage. The browser may grant, decline, or fail. */
  requestPersistence(): Promise<Result<PersistenceStatus, StorageError>>;
  /** Deletes audio blobs and audio jobs only. */
  clearAudioCache(): Promise<Result<void, StorageError>>;
  /**
   * Deletes one reading's clips and audio job, keeping a clip that is current
   * for it and that another reading with the same sentence can use.
   *
   * `currentCacheKeys` are the reading's current clip keys, or null when no
   * voice is configured. The reading's summary is counted again by them in the
   * same transaction, so a kept clip it still plays keeps counting.
   */
  clearReadingAudio(
    readingId: ReadingId,
    currentCacheKeys: ReadonlyMap<SentenceId, string> | null,
  ): Promise<Result<void, StorageError>>;
  /**
   * Deletes one reading's saved text aid and its resumable job atomically.
   *
   * For grammar, `currentCacheKeys` work as for audio: an analysis another
   * reading with the same sentence uses is kept and still counted. A
   * translation is never shared, so English takes null.
   */
  clearReadingAid(
    readingId: ReadingId,
    layer: ClearableReadingAid,
    currentCacheKeys: ReadonlyMap<SentenceId, string> | null,
  ): Promise<Result<void, StorageError>>;
  /**
   * Copies the stored rows into a JSON file, whatever schema version wrote them.
   * The API key and audio bytes are left out.
   */
  exportData(): Promise<Result<Blob, StorageError>>;
  /** Deletes every Monosai database and cache after explicit confirmation. */
  resetAllData(): Promise<Result<void, StorageError>>;
}
