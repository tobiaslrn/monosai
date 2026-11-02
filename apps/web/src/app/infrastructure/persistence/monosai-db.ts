import Dexie, { type PromiseExtended, type Table } from 'dexie';
import type { Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import {
  StorageFailure,
  storageError,
  type DatabaseLossCause,
} from '../../domain/storage/storage-error';
import { CURRENT_SCHEMA_VERSION, applySchema } from './migrations';
import { mapStorageFailure } from './storage-error-mapper';
import type {
  CredentialRow,
  ParagraphRow,
  ReadingRow,
  SentenceRow,
  SettingsRow,
  TokenAnalysisRow,
} from './rows';
import type {
  AudioAssetStoredRow,
  GrammarAnalysisRow,
  TranslationRow,
  TranslationPlanRow,
} from './schemas/enrichment.schema';
import type { AssetJobRow } from './schemas/job.schema';
import type { GrammarProfileRow, GrammarProfileSnapshotRow } from './schemas/grammar.schema';
import type {
  VocabularySourceRow,
  VocabularySourceCacheRow,
  VocabularyItemRow,
  VocabularyProvenanceRow,
  VocabularySnapshotRow,
} from './schemas/vocabulary.schema';
import type { FrozenValidationRow, GenerationProvenanceRow } from './schemas/generation.schema';

export const DATABASE_NAME = 'monosai';

const PROBE_RETRIES = 3;

function newerVersionFailure(version: number): StorageFailure {
  return new StorageFailure(
    storageError(
      'newer-version',
      'Your saved data comes from a newer version of Monosai, so this version cannot open it. Reloading may load the newer version.',
      `database.open: stored version ${version.toString()} is above ${(CURRENT_SCHEMA_VERSION * 10).toString()}`,
    ),
  );
}

/**
 * Dexie stores its schema version multiplied by ten, and its schema patch mode adds one to a
 * valid database's native version, so only a whole schema version above ours is newer.
 */
function isNewerThanApp(nativeVersion: number): boolean {
  return Math.floor(nativeVersion / 10) > CURRENT_SCHEMA_VERSION;
}

/**
 * The native version of the stored database, or null when there is none. It opens without a
 * version and aborts if that would create the database, so nothing is created or changed, and a
 * later open is not blocked. An upgrade running in another tab finishes before this resolves.
 */
function readStoredVersion(name: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let created = false;
    request.onupgradeneeded = () => {
      if (request.transaction !== null) {
        created = true;
        request.transaction.abort();
      }
    };
    request.onsuccess = () => {
      const { version } = request.result;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => {
      if (created) {
        resolve(null);
      } else {
        reject(request.error ?? new Error('The database could not be read.'));
      }
    };
  });
}

/**
 * Throws a storage failure when the stored database was written by a newer build.
 *
 * Dexie would open it anyway and could write to it or even upgrade it, so this runs first. A
 * probe that cannot answer is reported as a storage failure rather than waved through.
 *
 * It narrows the window rather than closing it: if another tab's upgrade lands between this probe
 * and Dexie's open, and a store the newer build removed is missing, Dexie raises the version by
 * one and recreates that store empty. No rows are deleted.
 */
export async function assertStoredSchemaNotNewer(name: string = DATABASE_NAME): Promise<void> {
  let version: number | null;
  for (let attempt = 0; ; attempt += 1) {
    try {
      version = await readStoredVersion(name);
      break;
    } catch (thrown) {
      // Chrome reports a transient UnknownError on a first open now and then; Dexie retries it.
      if (thrown instanceof Error && thrown.name === 'UnknownError' && attempt < PROBE_RETRIES) {
        continue;
      }
      throw new StorageFailure(mapStorageFailure(thrown, 'database.probe'));
    }
  }
  if (version !== null && isNewerThanApp(version)) {
    throw newerVersionFailure(version);
  }
}

/** Dexie database. Only repository adapters may touch these tables. */
export class MonosaiDatabase extends Dexie {
  readonly settings!: Table<SettingsRow, string>;
  readonly credentials!: Table<CredentialRow, string>;
  readonly vocabularySources!: Table<VocabularySourceRow, string>;
  readonly vocabularySourceCaches!: Table<VocabularySourceCacheRow, string>;
  readonly vocabularySnapshots!: Table<VocabularySnapshotRow, string>;
  readonly vocabularyItems!: Table<VocabularyItemRow, string>;
  readonly vocabularyProvenance!: Table<VocabularyProvenanceRow, number>;
  readonly grammarProfile!: Table<GrammarProfileRow, string>;
  readonly grammarProfileSnapshots!: Table<GrammarProfileSnapshotRow, string>;
  readonly readings!: Table<ReadingRow, string>;
  readonly paragraphs!: Table<ParagraphRow, string>;
  readonly sentences!: Table<SentenceRow, string>;
  readonly tokenAnalyses!: Table<TokenAnalysisRow, [string, string]>;
  readonly frozenValidations!: Table<FrozenValidationRow, string>;
  readonly translations!: Table<TranslationRow, string>;
  readonly translationPlans!: Table<TranslationPlanRow, string>;
  readonly grammarAnalyses!: Table<GrammarAnalysisRow, string>;
  readonly audioAssets!: Table<AudioAssetStoredRow, string>;
  readonly assetJobs!: Table<AssetJobRow, string>;
  readonly generationProvenance!: Table<GenerationProvenanceRow, string>;

  constructor(
    name: string = DATABASE_NAME,
    private readonly logger?: Logger,
  ) {
    // Never reopens by itself: after another connection changes the database, the next use must
    // fail visibly instead of silently reopening and writing to a version this build cannot read.
    super(name, { autoOpen: false });
    applySchema(this);
    this.on('versionchange', () => {
      this.reportLoss('another-tab');
    });
  }

  private readonly lossListeners: ((cause: DatabaseLossCause) => void)[] = [];

  /**
   * Calls the listener when the connection ends without this instance closing it: another
   * connection upgrades or deletes the database, or the browser closes the connection. The
   * instance stays closed, so the page must be reloaded. Registering once covers later opens.
   */
  onLoss(listener: (cause: DatabaseLossCause) => void): void {
    this.lossListeners.push(listener);
  }

  private reportLoss(cause: DatabaseLossCause): void {
    for (const listener of this.lossListeners) {
      listener(cause);
    }
  }

  override open(): PromiseExtended<Dexie> {
    this.logger?.debug('storage.operation.started', { operation: 'database.open' });
    return super.open().then(
      () => {
        const nativeVersion = this.backendDB().version;
        if (isNewerThanApp(nativeVersion)) {
          this.close();
          throw newerVersionFailure(nativeVersion);
        }
        // The browser fires this only for a close it forced, never for this instance's own close().
        this.backendDB().addEventListener('close', () => {
          this.reportLoss('connection-closed');
        });
        this.logger?.info('storage.operation.succeeded', {
          operation: 'database.open',
          schemaVersion: this.verno,
        });
        return this;
      },
      (thrown: unknown) => {
        this.logger?.error('storage.operation.failed', {
          operation: 'database.open',
          errorCode: 'open-failed',
          errorType: safeErrorTypeOf(thrown),
        });
        throw thrown;
      },
    );
  }
}
