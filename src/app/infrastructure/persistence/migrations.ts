import type { Dexie } from 'dexie';

/**
 * Schema history. One entry per monotonic version; a version's stores and its
 * upgrade function are declared together so transitions stay reviewable.
 *
 * Before the first stable release there is exactly one version and it is edited
 * in place: no user data exists to preserve, so a schema change drops local
 * databases rather than carrying a migration nobody will ever run. Add version 2
 * with the first release.
 *
 * Indexes exist only for queries the specification requires. Large text, token
 * arrays, blobs, credentials, and policy text are never indexed.
 */
export const SCHEMA_VERSIONS: readonly {
  readonly version: number;
  readonly stores: Record<string, string | null>;
}[] = [
  {
    version: 1,
    stores: {
      settings: '&key',
      credentials: '&key',
      sourceMappings: '&id, providerKind, [deckName+noteTypeName]',
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
    },
  },
];

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].version;

/** Declares every schema version on the database instance, in order. */
export function applySchema(db: Dexie): void {
  for (const entry of SCHEMA_VERSIONS) {
    db.version(entry.version).stores(entry.stores);
  }
}
