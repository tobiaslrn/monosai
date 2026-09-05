import Dexie from 'dexie';
import { ok, type Result } from '../../domain/shared/result';
import type { ReadingId } from '../../domain/shared/ids';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import type { StorageError } from '../../domain/storage/storage-error';
import { DATABASE_NAME, type MonosaiDatabase } from './monosai-db';
import {
  runStorage,
  runStorageWithRules,
  StorageRuleViolation,
} from './repositories/storage-operation';

/**
 * Storage durability and destructive maintenance.
 *
 * Persistence is requested only from an explicit user action; the browser may
 * still decline, which is reported rather than retried silently.
 *
 * Every method reports through `runStorage`, which is also what logs the
 * operation, so failures here are typed rather than thrown at the caller.
 */
export class BrowserStorageMaintenance implements StorageMaintenance {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly navigatorRef: Navigator | undefined,
    private readonly caches: CacheStorage | undefined,
  ) {}

  getPersistenceStatus(): Promise<Result<PersistenceStatus, StorageError>> {
    return runStorage('storage.status', async () => {
      const storage = this.navigatorRef?.storage;
      if (!storage) {
        return UNKNOWN_PERSISTENCE;
      }

      const supported = typeof storage.persist === 'function';
      const persisted = await storage.persisted();
      const estimate = await storage.estimate();
      return {
        supported,
        persisted,
        canRequest: supported && !persisted,
        usageBytes: estimate.usage ?? null,
        quotaBytes: estimate.quota ?? null,
      };
    });
  }

  /**
   * Asks the browser to keep Monosai data.
   *
   * The answer is whatever the status says afterwards: `persist()` resolving
   * is not a grant, and a browser that declines resolves `false` without
   * throwing. Both are reported rather than retried, and a thrown failure is
   * reported too — pressing a button that reports nothing is the same as a
   * button that does nothing.
   */
  requestPersistence(): Promise<Result<PersistenceStatus, StorageError>> {
    return runStorageWithRules('storage.persist', async () => {
      const storage = this.navigatorRef?.storage;
      if (typeof storage?.persist === 'function') {
        await storage.persist();
      }
      const status = await this.getPersistenceStatus();
      if (!status.ok) {
        throw new StorageRuleViolation(status.error);
      }
      return status.value;
    });
  }

  /** Deletes audio blobs and audio jobs only; readings and text stay intact. */
  clearAudioCache(): Promise<Result<void, StorageError>> {
    return runStorage('storage.clearAudio', async () => {
      await this.db.transaction(
        'rw',
        [this.db.audioAssets, this.db.assetJobs, this.db.readings],
        async () => {
          await this.db.audioAssets.clear();
          await this.db.assetJobs.where('kind').equals('prepare-audio').delete();
          const readings = await this.db.readings.toArray();
          for (const reading of readings) {
            await this.db.readings.update(reading.id, {
              audioSummary: { total: reading.sentenceCount, completed: 0, failed: 0 },
            });
          }
        },
      );
    });
  }

  /** Deletes one reading's audio atomically, leaving every other aid intact. */
  clearReadingAudio(readingId: ReadingId): Promise<Result<void, StorageError>> {
    return runStorage('storage.clearReadingAudio', async () => {
      await this.db.transaction(
        'rw',
        [this.db.audioAssets, this.db.assetJobs, this.db.readings],
        async () => {
          const reading = await this.db.readings.get(readingId);
          if (reading === undefined) {
            return;
          }
          await this.db.audioAssets.where('readingId').equals(readingId).delete();
          await this.db.assetJobs
            .where('[readingId+kind]')
            .equals([readingId, 'prepare-audio'])
            .delete();
          await this.db.readings.update(readingId, {
            audioSummary: { total: reading.sentenceCount, completed: 0, failed: 0 },
          });
        },
      );
    });
  }

  resetAllData(): Promise<Result<void, StorageError>> {
    return runStorage('storage.reset', async () => {
      this.db.close();
      await Dexie.delete(DATABASE_NAME);
      if (this.caches) {
        for (const key of await this.caches.keys()) {
          await this.caches.delete(key);
        }
      }
    });
  }
}

export function resolveMaintenanceDependencies(view: Window | null): {
  navigatorRef: Navigator | undefined;
  caches: CacheStorage | undefined;
} {
  return {
    navigatorRef: view?.navigator,
    caches: view && 'caches' in view ? view.caches : undefined,
  };
}

export { ok };
