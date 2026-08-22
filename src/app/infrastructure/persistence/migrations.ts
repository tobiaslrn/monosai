import type { Dexie, Transaction } from 'dexie';

interface SchemaVersion {
  readonly version: number;
  readonly stores: Record<string, string | null>;
  readonly upgrade?: (transaction: Transaction) => void | PromiseLike<void>;
}

/**
 * Schema history. One entry per monotonic version; a version's stores and its
 * upgrade function are declared together so transitions stay reviewable.
 *
 * Published entries are immutable. Add a new entry for every table, primary-key,
 * or index change, and an upgrade function when stored records need transforming.
 *
 * Indexes exist only for queries the specification requires. Large text, token
 * arrays, blobs, credentials, and policy text are never indexed.
 */
const CURRENT_STORES: Readonly<Record<string, string | null>> = {
  settings: '&key',
  credentials: '&key',
  sourceMappings: '&id, providerKind, [deckName+noteTypeName]',
  // One current row; the repository replaces it atomically on refresh.
  vocabularySnapshots: '&id, createdAt, uniqueEntryCount',
  vocabularyItems: '&id, snapshotId, [snapshotId+expressionHash]',
  vocabularyProvenance: '++id, vocabularyItemId, sourceMappingId',
  // Single row: the live profile is one difficulty preset, not a selection.
  grammarProfile: '&key',
  grammarProfileSnapshots: '&id, profileHash',
  readings: '&id, kind, createdAt, lastOpenedAt, [kind+createdAt]',
  paragraphs: '&id, readingId, [readingId+position]',
  sentences: '&id, readingId, paragraphId, [readingId+positionInReading]',
  tokenAnalyses: '&[sentenceId+analyzerVersion], sentenceId, readingId',
  frozenValidations: '&sentenceId, readingId, snapshotId',
  translations: '&cacheKey, sentenceId, readingId',
  grammarAnalyses: '&cacheKey, sentenceId, readingId, profileHash',
  audioAssets: '&cacheKey, id, sentenceId, readingId',
  assetJobs: '&id, readingId, kind, state, [readingId+kind]',
  generationProvenance: '&id, readingId',
};

export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: CURRENT_STORES,
  },
  {
    version: 2,
    // Earlier development builds changed v1 in place. Advancing to v2 makes
    // Dexie reconcile each installed v1's actual schema with this canonical one.
    stores: CURRENT_STORES,
  },
];

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].version;

/** Declares every schema version on the database instance, in order. */
export function applySchema(db: Dexie): void {
  for (const entry of SCHEMA_VERSIONS) {
    const version = db.version(entry.version).stores(entry.stores);
    if (entry.upgrade !== undefined) {
      version.upgrade(entry.upgrade);
    }
  }
}
