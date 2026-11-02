import { ok, type Result } from '../../../domain/shared/result';
import type { SnapshotId, VocabularySourceId } from '../../../domain/shared/ids';
import {
  toVocabularyExpression,
  type VocabularyExpression,
  type VocabularyItem,
  type VocabularyProvenance,
  type VocabularySnapshot,
} from '../../../domain/vocabulary/snapshot';
import { isIncludedInVocabulary } from '../../../domain/vocabulary/vocabulary-source';
import {
  mergePracticeEvidence,
  type PracticeEvidence,
} from '../../../domain/anki/practice-evidence';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../../domain/settings/settings';
import type {
  CapturedSourceObservation,
  SnapshotCommit,
  VocabularyBrowse,
  VocabularyCapture,
  VocabularyEntry,
  VocabularyRepository,
} from '../../../domain/vocabulary/vocabulary-repository';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import { SETTINGS_KEYS, appSettingsSchema } from '../schemas/settings.schema';
import {
  vocabularySourceCacheRowSchema,
  vocabularySourceRowSchema,
  vocabularyItemRowSchema,
  vocabularyProvenanceRowSchema,
  vocabularySnapshotRowSchema,
  type VocabularyItemRow,
  type VocabularySnapshotRow,
  type VocabularySourceCacheRow,
  type VocabularySourceRow,
} from '../schemas/vocabulary.schema';
import { assertUniqueIds } from './integrity';
import { StorageRuleViolation, runStorage, runStorageWithRules } from './storage-operation';

/**
 * The vocabulary table is a current-state cache, not a history log. A refresh
 * replaces its one snapshot and matcher inputs inside one transaction, so a
 * failed or cancelled refresh can never change what the reader sees.
 *
 * The same transaction upserts the sources and source caches the snapshot was
 * built from. They are the snapshot's inputs, so committing them separately
 * would let a storage failure leave a source stored without the vocabulary that
 * justifies it.
 */
export class DexieVocabularyRepository implements VocabularyRepository {
  constructor(private readonly db: MonosaiDatabase) {}

  commitSnapshot(commit: SnapshotCommit): Promise<Result<VocabularySnapshot, StorageError>> {
    return runStorageWithRules('vocabulary.commitSnapshot', async () => {
      assertUniqueIds(commit.items, 'vocabulary item');
      const uniqueExpressionCount = new Set(commit.items.map((item) => item.expressionHash)).size;
      if (commit.snapshot.uniqueEntryCount !== uniqueExpressionCount) {
        throw new StorageRuleViolation(
          storageError(
            'conflict',
            'The snapshot word count does not match its distinct expression hashes.',
          ),
        );
      }
      const itemIds = new Set<string>(commit.items.map((item) => item.id));
      if (commit.items.some((item) => item.snapshotId !== commit.snapshot.id)) {
        throw new StorageRuleViolation(
          storageError('conflict', 'A vocabulary item points at a different snapshot.'),
        );
      }
      for (const record of commit.provenance) {
        if (!itemIds.has(record.vocabularyItemId)) {
          throw new StorageRuleViolation(
            storageError('conflict', 'Provenance references an item outside this snapshot.'),
          );
        }
      }

      // Rows are validated before the transaction opens, so an unusable source
      // or cache fails the commit without aborting a write already under way.
      const sourceRows = commit.sources.map((source) => {
        const row = parseRecord(
          vocabularySourceRowSchema,
          { ...source, v: ROW_VERSION },
          `vocabularySources:${source.id}`,
        );
        if (!row.ok) {
          throw new StorageRuleViolation(row.error);
        }
        return row.value;
      });
      const cacheRows = commit.caches.map((cache) => {
        const row = parseRecord(
          vocabularySourceCacheRowSchema,
          { ...cache, v: ROW_VERSION },
          `vocabularySourceCaches:${cache.sourceId}`,
        );
        if (!row.ok) {
          throw new StorageRuleViolation(row.error);
        }
        return row.value;
      });

      let replacement = commit.snapshot;
      await this.db.transaction(
        'rw',
        [
          this.db.vocabularySnapshots,
          this.db.vocabularyItems,
          this.db.vocabularyProvenance,
          this.db.vocabularySources,
          this.db.vocabularySourceCaches,
          this.db.settings,
          this.db.readings,
          this.db.frozenValidations,
          this.db.generationProvenance,
        ],
        async () => {
          if (sourceRows.length > 0) {
            await this.db.vocabularySources.bulkPut(sourceRows);
          }
          if (cacheRows.length > 0) {
            await this.db.vocabularySourceCaches.bulkPut(cacheRows);
          }
          const current = await this.readAppSettingsWithinTransaction();
          const id = current.activeSnapshotId ?? commit.snapshot.id;
          await this.assertExpectedRevisionWithinTransaction(commit, id);
          replacement = id === commit.snapshot.id ? commit.snapshot : { ...commit.snapshot, id };
          const items = commit.items.map((item) => ({ ...item, snapshotId: id }));

          await this.db.vocabularySnapshots.clear();
          await this.db.vocabularyItems.clear();
          await this.db.vocabularyProvenance.clear();
          await this.db.vocabularySnapshots.add({ ...replacement, v: ROW_VERSION });
          await this.db.vocabularyItems.bulkAdd(items.map((item) => ({ ...item, v: ROW_VERSION })));
          await this.db.vocabularyProvenance.bulkAdd(
            commit.provenance.map((record) => ({ ...record, v: ROW_VERSION })),
          );
          await this.pointGeneratedStoriesAtCurrentSnapshotWithinTransaction(id);
          await this.db.settings.put({
            key: SETTINGS_KEYS.app,
            v: ROW_VERSION,
            value: { ...current, activeSnapshotId: id },
          });
        },
      );

      return replacement;
    });
  }

  async listSnapshots(): Promise<Result<readonly VocabularySnapshot[], StorageError>> {
    const loaded = await runStorage('vocabularySnapshots.list', () =>
      this.db.vocabularySnapshots.orderBy('createdAt').reverse().toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(vocabularySnapshotRowSchema, loaded.value, 'vocabularySnapshots');
    return parsed.ok ? ok(parsed.value.map(toSnapshot)) : parsed;
  }

  async getActiveSnapshot(): Promise<Result<VocabularySnapshot | null, StorageError>> {
    const settings = await runStorage('settings.get(app)', () =>
      this.db.settings.get(SETTINGS_KEYS.app),
    );
    if (!settings.ok) {
      return settings;
    }
    if (!settings.value) {
      return ok(null);
    }
    const parsed = parseRecord(appSettingsSchema, settings.value.value, 'settings:app');
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.value.activeSnapshotId === null) {
      return ok(null);
    }
    return this.getSnapshot(parsed.value.activeSnapshotId);
  }

  async getSnapshot(id: SnapshotId): Promise<Result<VocabularySnapshot | null, StorageError>> {
    const loaded = await runStorage('vocabularySnapshots.get', () =>
      this.db.vocabularySnapshots.get(id),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(vocabularySnapshotRowSchema, loaded.value, 'vocabularySnapshots');
    return parsed.ok ? ok(toSnapshot(parsed.value)) : parsed;
  }

  /**
   * Reads the vocabulary, its expressions, and its sources at one revision.
   *
   * One read transaction, so nothing in the result can describe two different
   * vocabularies. Paging these queries outside a transaction would let a
   * refresh replace every row between two batches and produce a capture that is
   * half one vocabulary and half another, with nothing afterwards able to tell.
   *
   * Items are projected to expressions inside the adapter, so analyzed token
   * sequences never travel with a capture: this is what a selection needs in
   * order to choose and to explain itself, not matcher input.
   */
  async captureVocabulary(): Promise<Result<VocabularyCapture | null, StorageError>> {
    const captured = await runStorageWithRules('vocabulary.capture', () =>
      this.db.transaction(
        'r',
        [
          this.db.settings,
          this.db.vocabularySnapshots,
          this.db.vocabularyItems,
          this.db.vocabularySources,
          this.db.vocabularySourceCaches,
        ],
        async () => {
          const activeId = (await this.readAppSettingsWithinTransaction()).activeSnapshotId;
          if (activeId === null) {
            return null;
          }
          const snapshotRow = await this.db.vocabularySnapshots.get(activeId);
          if (snapshotRow === undefined) {
            return null;
          }
          return {
            snapshotRow,
            items: await this.db.vocabularyItems.where('snapshotId').equals(activeId).toArray(),
            sources: await this.db.vocabularySources.toArray(),
            caches: await this.db.vocabularySourceCaches.toArray(),
          };
        },
      ),
    );
    if (!captured.ok) {
      return captured;
    }
    if (captured.value === null) {
      return ok(null);
    }

    const snapshot = parseRecord(
      vocabularySnapshotRowSchema,
      captured.value.snapshotRow,
      'vocabularySnapshots',
    );
    if (!snapshot.ok) {
      return snapshot;
    }
    const items = parseRecords(vocabularyItemRowSchema, captured.value.items, 'vocabularyItems');
    if (!items.ok) {
      return items;
    }
    const sources = parseRecords(
      vocabularySourceRowSchema,
      captured.value.sources,
      'vocabularySources',
    );
    if (!sources.ok) {
      return sources;
    }
    const caches = parseRecords(
      vocabularySourceCacheRowSchema,
      captured.value.caches,
      'vocabularySourceCaches',
    );
    if (!caches.ok) {
      return caches;
    }

    const cachesBySource = new Map(caches.value.map((cache) => [cache.sourceId, cache]));
    return ok({
      snapshot: toSnapshot(snapshot.value),
      expressions: mergeExpressions(items.value.map(toItem)),
      sources: sources.value
        .filter((source) => isIncludedInVocabulary(source))
        .map((source) => toObservation(source, cachesBySource.get(source.id))),
    });
  }

  /**
   * Reads the active items, their provenance, and current source observations
   * in one transaction. A refresh landing between separate queries must not
   * make the browser show words from one snapshot with sources from another.
   */
  async listVocabularyEntries(): Promise<Result<VocabularyBrowse | null, StorageError>> {
    const listed = await runStorageWithRules('vocabulary.entries', () =>
      this.db.transaction(
        'r',
        [
          this.db.settings,
          this.db.vocabularySnapshots,
          this.db.vocabularyItems,
          this.db.vocabularyProvenance,
          this.db.vocabularySources,
          this.db.vocabularySourceCaches,
        ],
        async () => {
          const activeId = (await this.readAppSettingsWithinTransaction()).activeSnapshotId;
          if (activeId === null) {
            return null;
          }
          const snapshotRow = await this.db.vocabularySnapshots.get(activeId);
          if (snapshotRow === undefined) {
            return null;
          }
          const items = await this.db.vocabularyItems
            .where('snapshotId')
            .equals(activeId)
            .toArray();
          const itemIds = items.map((item) => item.id);
          return {
            snapshotRow,
            items,
            provenance:
              itemIds.length === 0
                ? []
                : await this.db.vocabularyProvenance
                    .where('vocabularyItemId')
                    .anyOf(itemIds)
                    .toArray(),
            sources: await this.db.vocabularySources.toArray(),
            caches: await this.db.vocabularySourceCaches.toArray(),
          };
        },
      ),
    );
    if (!listed.ok) {
      return listed;
    }
    if (listed.value === null) {
      return ok(null);
    }

    const snapshot = parseRecord(
      vocabularySnapshotRowSchema,
      listed.value.snapshotRow,
      'vocabularySnapshots',
    );
    if (!snapshot.ok) {
      return snapshot;
    }
    const items = parseRecords(vocabularyItemRowSchema, listed.value.items, 'vocabularyItems');
    if (!items.ok) {
      return items;
    }
    const provenance = parseRecords(
      vocabularyProvenanceRowSchema,
      listed.value.provenance,
      'vocabularyProvenance',
    );
    if (!provenance.ok) {
      return provenance;
    }
    const sources = parseRecords(
      vocabularySourceRowSchema,
      listed.value.sources,
      'vocabularySources',
    );
    if (!sources.ok) {
      return sources;
    }
    const caches = parseRecords(
      vocabularySourceCacheRowSchema,
      listed.value.caches,
      'vocabularySourceCaches',
    );
    if (!caches.ok) {
      return caches;
    }

    const sourceIdsByItem = new Map<string, VocabularySourceId[]>();
    for (const row of provenance.value) {
      const sourceIds = sourceIdsByItem.get(row.vocabularyItemId) ?? [];
      if (!sourceIds.includes(row.sourceId)) {
        sourceIds.push(row.sourceId);
      }
      sourceIdsByItem.set(row.vocabularyItemId, sourceIds);
    }
    const cacheBySource = new Map(caches.value.map((cache) => [cache.sourceId, cache]));

    return ok({
      snapshot: toSnapshot(snapshot.value),
      entries: items.value.map((row) =>
        toVocabularyBrowseEntry(toItem(row), sourceIdsByItem.get(row.id) ?? []),
      ),
      sources: sources.value
        .filter((source) => isIncludedInVocabulary(source))
        .map((source) => toObservation(source, cacheBySource.get(source.id))),
    });
  }

  async listExpressionHashes(id: SnapshotId): Promise<Result<readonly string[], StorageError>> {
    const loaded = await runStorage('vocabularyItems.expressionHashes', () =>
      this.db.vocabularyItems.where('snapshotId').equals(id).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(vocabularyItemRowSchema, loaded.value, 'vocabularyItems');
    return parsed.ok ? ok(parsed.value.map(toItem).map((item) => item.expressionHash)) : parsed;
  }

  /** Streams matcher input in bounded batches so no query loads every item. */
  async *streamItems(id: SnapshotId, batchSize: number): AsyncIterable<readonly VocabularyItem[]> {
    let offset = 0;
    for (;;) {
      const batch = await this.db.vocabularyItems
        .where('snapshotId')
        .equals(id)
        .offset(offset)
        .limit(batchSize)
        .toArray();
      if (batch.length === 0) {
        return;
      }
      yield batch.map(toItem);
      offset += batch.length;
    }
  }

  async listProvenance(
    id: SnapshotId,
  ): Promise<Result<readonly VocabularyProvenance[], StorageError>> {
    const items = await runStorage('vocabularyItems.ids', () =>
      this.db.vocabularyItems.where('snapshotId').equals(id).primaryKeys(),
    );
    if (!items.ok) {
      return items;
    }
    const loaded = await runStorage('vocabularyProvenance.list', () =>
      this.db.vocabularyProvenance.where('vocabularyItemId').anyOf(items.value).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(
      vocabularyProvenanceRowSchema,
      loaded.value,
      'vocabularyProvenance',
    );
    if (!parsed.ok) {
      return parsed;
    }
    return ok(
      parsed.value.map((row) => {
        const { id: _rowId, v: _version, ...provenance } = row;
        return provenance;
      }),
    );
  }

  countStoriesUsingSnapshot(id: SnapshotId): Promise<Result<number, StorageError>> {
    return runStorage('readings.countBySnapshot', () =>
      this.db.readings
        .where('kind')
        .equals('generated')
        .filter((row) => row.kind === 'generated' && row.snapshotId === id)
        .count(),
    );
  }

  /**
   * Refuses a build prepared against a vocabulary that has since been replaced.
   *
   * Checked inside the write transaction, because the window between reading
   * and writing is the whole problem: another tab's refresh, or a source the
   * learner has just removed, must not be undone by content assembled before
   * either happened. The caller re-prepares against what is stored rather than
   * retrying the same stale build.
   */
  private async assertExpectedRevisionWithinTransaction(
    commit: SnapshotCommit,
    id: SnapshotId,
  ): Promise<void> {
    if (commit.expectedRevision === undefined) {
      return;
    }
    const stored = await this.db.vocabularySnapshots.get(id);
    // An absent vocabulary is not a conflict: there is nothing newer to lose.
    if (stored !== undefined && stored.revision !== commit.expectedRevision) {
      throw new StorageRuleViolation(
        storageError(
          'conflict',
          'Your vocabulary changed while this one was being prepared. Nothing was overwritten.',
        ),
      );
    }
  }

  private async readAppSettingsWithinTransaction(): Promise<AppSettings> {
    const existing = await this.db.settings.get(SETTINGS_KEYS.app);
    const current = existing
      ? parseRecord(appSettingsSchema, existing.value, 'settings:app')
      : null;
    if (current && !current.ok) {
      throw new StorageRuleViolation(current.error);
    }
    return current?.ok ? current.value : DEFAULT_APP_SETTINGS;
  }

  /** Existing generated stories keep their evidence but follow the one current id. */
  private async pointGeneratedStoriesAtCurrentSnapshotWithinTransaction(
    id: SnapshotId,
  ): Promise<void> {
    await this.db.readings
      .where('kind')
      .equals('generated')
      .modify((row) => {
        if (row.kind === 'generated') {
          Object.assign(row, { snapshotId: id });
        }
      });
    await this.db.frozenValidations.toCollection().modify((row) => {
      Object.assign(row, { snapshotId: id });
    });
    await this.db.generationProvenance.toCollection().modify((row) => {
      Object.assign(row, { snapshotId: id });
    });
  }
}

function toSnapshot(row: VocabularySnapshotRow): VocabularySnapshot {
  const { v: _version, ...snapshot } = row;
  return snapshot;
}

function toItem(row: VocabularyItemRow): VocabularyItem {
  const { v: _version, ...item } = row;
  return item;
}

function toVocabularyBrowseEntry(
  item: VocabularyItem,
  sourceIds: readonly VocabularySourceId[],
): VocabularyEntry {
  const readingHiragana = item.analyzedSequence
    .map((token) => token.readingHiragana ?? '')
    .join('');
  return {
    itemId: item.id,
    visibleExpression: item.visibleExpression,
    canonicalExpression: item.canonicalExpression,
    ...(readingHiragana === '' ? {} : { readingHiragana }),
    ...(item.meaning === undefined ? {} : { meaning: item.meaning }),
    ...(item.fsrsDifficulty === undefined ? {} : { fsrsDifficulty: item.fsrsDifficulty }),
    ...(item.firstReviewedAt === undefined ? {} : { firstReviewedAt: item.firstReviewedAt }),
    ...(item.firstReviewedPrecision === undefined
      ? {}
      : { firstReviewedPrecision: item.firstReviewedPrecision }),
    ...(item.lastReviewedAt === undefined ? {} : { lastReviewedAt: item.lastReviewedAt }),
    sourceIds,
  };
}

/**
 * One entry per canonical expression, merging what several items proved.
 *
 * A snapshot normally has one item per expression-and-meaning identity. This
 * projection merges items back to one expression for practice selection and
 * generation, retaining every distinct meaning rather than dropping a second
 * contribution.
 */
function mergeExpressions(items: readonly VocabularyItem[]): readonly VocabularyExpression[] {
  const byExpression = new Map<string, VocabularyExpression>();
  for (const item of items) {
    const expression = toVocabularyExpression(item);
    const existing = byExpression.get(expression.canonicalExpression);
    if (existing === undefined) {
      byExpression.set(expression.canonicalExpression, expression);
      continue;
    }
    byExpression.set(expression.canonicalExpression, {
      ...existing,
      itemIds: [...existing.itemIds, ...expression.itemIds],
      meanings: mergeMeanings(existing.meanings, expression.meanings),
      ...practiceOf(existing, expression),
      ...highestDifficulty(existing, expression),
    });
  }
  return [...byExpression.values()];
}

function mergeMeanings(left: readonly string[], right: readonly string[]): readonly string[] {
  const seen = new Set(left);
  const merged = [...left];
  for (const meaning of right) {
    if (seen.has(meaning)) {
      continue;
    }
    seen.add(meaning);
    merged.push(meaning);
  }
  return merged;
}

function practiceOf(
  left: VocabularyExpression,
  right: VocabularyExpression,
): { practice?: PracticeEvidence } {
  const merged = mergePracticeEvidence(left.practice, right.practice);
  return Object.keys(merged).length === 0 ? {} : { practice: merged };
}

function highestDifficulty(
  left: VocabularyExpression,
  right: VocabularyExpression,
): { fsrsDifficulty?: number } {
  const known = [left.fsrsDifficulty, right.fsrsDifficulty].filter(
    (value): value is number => value !== undefined,
  );
  return known.length === 0 ? {} : { fsrsDifficulty: Math.max(...known) };
}

/** What one included source contributed, and what its last read could prove. */
function toObservation(
  source: VocabularySourceRow,
  cache: VocabularySourceCacheRow | undefined,
): CapturedSourceObservation {
  return {
    sourceId: source.id,
    label: source.label,
    kind: source.kind,
    ...(source.kind === 'text-list' ? {} : { providerKind: source.providerKind }),
    automaticSync: source.kind === 'text-list' ? false : source.automaticSync,
    refreshedAt: cache?.refreshedAt ?? null,
    practice: cache?.practice ?? null,
    warnings: cache?.warnings ?? [],
  };
}
