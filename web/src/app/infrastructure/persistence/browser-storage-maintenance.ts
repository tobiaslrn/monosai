import Dexie from 'dexie';
import { ok, type Result } from '../../domain/shared/result';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import type { StorageError } from '../../domain/storage/storage-error';
import type { ClearableReadingAid } from '../../domain/storage/storage-maintenance';
import { NO_GRAMMAR_REVIEW, type GrammarSummary } from '../../domain/reading/summaries';
import { DATABASE_NAME, type MonosaiDatabase } from './monosai-db';
import {
  runStorage,
  runStorageWithRules,
  StorageRuleViolation,
} from './repositories/storage-operation';
import {
  coverageByKey,
  grammarCoverageByKey,
  releaseReadingAids,
} from './repositories/shared-aid-rows';

/** The API key never leaves through an export, and audio is raw bytes JSON cannot hold. */
const TABLES_LEFT_OUT_OF_EXPORT: readonly string[] = ['credentials', 'audioAssets'];

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

  /**
   * Deletes one reading's audio atomically, leaving every other aid intact, and
   * every clip another reading with the same sentence still uses.
   *
   * The summary is counted again by the reading's current keys rather than
   * reset: a kept clip is still under one of them, so the reader still plays it,
   * and a summary of zero would contradict what it plays.
   */
  clearReadingAudio(
    readingId: ReadingId,
    currentCacheKeys: ReadonlyMap<SentenceId, string> | null,
  ): Promise<Result<void, StorageError>> {
    return runStorage('storage.clearReadingAudio', async () => {
      await this.db.transaction(
        'rw',
        [this.db.audioAssets, this.db.assetJobs, this.db.readings, this.db.sentences],
        async () => {
          const reading = await this.db.readings.get(readingId);
          if (reading === undefined) {
            return;
          }
          await releaseReadingAids(this.db, this.db.audioAssets, readingId, currentCacheKeys);
          await this.db.assetJobs
            .where('[readingId+kind]')
            .equals([readingId, 'prepare-audio'])
            .delete();
          await this.db.readings.update(readingId, {
            audioSummary:
              currentCacheKeys === null
                ? { total: reading.sentenceCount, completed: 0, failed: 0 }
                : await coverageByKey(this.db.audioAssets, currentCacheKeys),
          });
        },
      );
    });
  }

  clearReadingAid(
    readingId: ReadingId,
    layer: ClearableReadingAid,
    currentCacheKeys: ReadonlyMap<SentenceId, string> | null,
  ): Promise<Result<void, StorageError>> {
    return runStorage(`storage.clearReadingAid.${layer}`, async () => {
      const aidTable = layer === 'english' ? this.db.translations : this.db.grammarAnalyses;
      const jobKind = layer === 'english' ? 'translate-reading' : 'analyze-reading';
      const tables =
        layer === 'english'
          ? [aidTable, this.db.translationPlans, this.db.assetJobs, this.db.readings]
          : [aidTable, this.db.assetJobs, this.db.readings, this.db.sentences];
      await this.db.transaction('rw', tables, async () => {
        const reading = await this.db.readings.get(readingId);
        if (reading === undefined) return;
        if (layer === 'english') {
          await this.db.translations.where('readingId').equals(readingId).delete();
        } else {
          await releaseReadingAids(this.db, this.db.grammarAnalyses, readingId, currentCacheKeys);
        }
        if (layer === 'english') await this.db.translationPlans.delete(readingId);
        await this.db.assetJobs.where('[readingId+kind]').equals([readingId, jobKind]).delete();
        await this.db.readings.update(
          readingId,
          layer === 'english'
            ? { translationSummary: { total: reading.sentenceCount, completed: 0, failed: 0 } }
            : { grammarSummary: await this.grammarAfterClear(currentCacheKeys) },
        );
      });
    });
  }

  /**
   * What a cleared reading's grammar summary says: the analyses it still has by
   * key, which only another reading's kept rows can be. With none left it was
   * never asked for, as before any request, rather than reviewed for no
   * sentence at all.
   */
  private async grammarAfterClear(
    currentCacheKeys: ReadonlyMap<SentenceId, string> | null,
  ): Promise<GrammarSummary> {
    if (currentCacheKeys === null) return NO_GRAMMAR_REVIEW;
    const summary = await grammarCoverageByKey(this.db, currentCacheKeys);
    return summary.state === 'partial' && summary.analyzedSentenceCount === 0
      ? NO_GRAMMAR_REVIEW
      : summary;
  }

  /**
   * Opens the database without a schema, so reading it neither upgrades it nor
   * depends on this build understanding the version that wrote it.
   */
  exportData(): Promise<Result<Blob, StorageError>> {
    return runStorage('storage.export', async () => {
      const stored = new Dexie(this.db.name);
      try {
        await stored.open();
        const parts: string[] = [`{"databaseVersion":${JSON.stringify(stored.verno)},"tables":{`];
        const tables = stored.tables.filter(
          (table) => !TABLES_LEFT_OUT_OF_EXPORT.includes(table.name),
        );
        for (const [tableIndex, table] of tables.entries()) {
          const rows: unknown[] = await table.toArray();
          parts.push(`${tableIndex === 0 ? '' : ','}${JSON.stringify(table.name)}:[`);
          parts.push(rows.map((row) => JSON.stringify(row)).join(','));
          parts.push(']');
        }
        parts.push('}}');
        return new Blob(parts, { type: 'application/json' });
      } finally {
        stored.close();
      }
    });
  }

  resetAllData(): Promise<Result<void, StorageError>> {
    return runStorage('storage.reset', async () => {
      this.db.close();
      await Dexie.delete(DATABASE_NAME);
      await this.clearCaches();
    });
  }

  /**
   * Best effort. By now the data is gone, so a cache that will not clear must not
   * report the reset as failed and keep the learner on a screen describing data
   * that no longer exists. Whatever stays is only re-downloadable files.
   */
  private async clearCaches(): Promise<void> {
    try {
      if (this.caches) {
        for (const key of await this.caches.keys()) {
          await this.caches.delete(key);
        }
      }
    } catch {
      return;
    }
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
