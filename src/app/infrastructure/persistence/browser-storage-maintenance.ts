import Dexie from 'dexie';
import type { Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { ok, type Result } from '../../domain/shared/result';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import type { StorageError } from '../../domain/storage/storage-error';
import { DATABASE_NAME, type MonosaiDatabase } from './monosai-db';
import { runStorage } from './repositories/storage-operation';

/**
 * Storage durability and destructive maintenance.
 *
 * Persistence is requested only from an explicit user action; the browser may
 * still decline, which is reported rather than retried silently.
 */
export class BrowserStorageMaintenance implements StorageMaintenance {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly navigatorRef: Navigator | undefined,
    private readonly caches: CacheStorage | undefined,
    private readonly logger?: Logger,
  ) {}

  async getPersistenceStatus(): Promise<PersistenceStatus> {
    try {
      const storage = this.navigatorRef?.storage;
      if (!storage) {
        return UNKNOWN_PERSISTENCE;
      }

      const persisted = await storage.persisted();
      const estimate = await storage.estimate();
      return {
        persisted,
        canRequest: typeof storage.persist === 'function' && !persisted,
        usageBytes: estimate.usage ?? null,
        quotaBytes: estimate.quota ?? null,
      };
    } catch (thrown) {
      this.logger?.error('storage.operation.failed', {
        operation: 'storage.status',
        errorCode: 'status-failed',
        errorType: safeErrorTypeOf(thrown),
      });
      throw thrown;
    }
  }

  async requestPersistence(): Promise<PersistenceStatus> {
    try {
      const storage = this.navigatorRef?.storage;
      if (typeof storage?.persist === 'function') {
        await storage.persist();
      }
    } catch (thrown) {
      this.logger?.error('storage.operation.failed', {
        operation: 'storage.persist',
        errorCode: 'persist-failed',
        errorType: safeErrorTypeOf(thrown),
      });
      throw thrown;
    }
    return this.getPersistenceStatus();
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
