import type { Table } from 'dexie';
import { ok, type Result } from '../../../domain/shared/result';
import type { AssetId, ReadingId, SentenceId } from '../../../domain/shared/ids';
import type { CompletionSummary, GrammarSummary } from '../../../domain/reading/summaries';
import type {
  AudioMimeType,
  AudioAsset,
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../../domain/enrichment/records';
import type { EnrichmentRepository } from '../../../domain/enrichment/enrichment-repository';
import type { TranslationPlan } from '../../../domain/enrichment/translation-plan';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  audioAssetMetadataSchema,
  grammarAnalysisRowSchema,
  translationRowSchema,
  translationPlanRowSchema,
  type AudioAssetMetadata,
  type GrammarAnalysisRow,
  type TranslationRow,
  type TranslationPlanRow,
} from '../schemas/enrichment.schema';
import { clipMetadata, clipTables, deleteClipsWithId, putClip } from './clip-rows';
import { coverageByKey, grammarCoverageByKey, storedCacheKeys } from './shared-aid-rows';
import { StorageRuleViolation, runStorage, runStorageWithRules } from './storage-operation';

/**
 * Cached auxiliary results.
 *
 * Writes are idempotent by cache key, and the writing reading's denormalized
 * summary is recalculated in the same transaction so library cards stay honest
 * without loading sentence children or audio blobs.
 *
 * A row is shared by every sentence whose current key it is, in any reading, so
 * coverage is always asked by key. The row's own `readingId` and `sentenceId`
 * name the sentence it was last written for, which decides what a deletion
 * looks at first and nothing else.
 *
 * Every write that names a reading first checks, inside its own transaction,
 * that the reading still exists. A job can finish a request after the reading
 * was deleted, here or in another tab, and its row would otherwise outlive the
 * deletion with nothing left to remove it. The refusal is `not-found`, which
 * is not retried.
 */
export class DexieEnrichmentRepository implements EnrichmentRepository {
  constructor(private readonly db: MonosaiDatabase) {}

  async getTranslationPlan(
    readingId: ReadingId,
  ): Promise<Result<TranslationPlan | null, StorageError>> {
    const loaded = await runStorage('translationPlans.get', () =>
      this.db.translationPlans.get(readingId),
    );
    if (!loaded.ok) return loaded;
    if (loaded.value === undefined) return ok(null);
    const parsed = parseRecord(translationPlanRowSchema, loaded.value, 'translationPlans');
    return parsed.ok ? ok(toTranslationPlan(parsed.value)) : parsed;
  }

  async storeTranslationPlan(
    plan: TranslationPlan,
  ): Promise<Result<TranslationPlan, StorageError>> {
    const stored = await runStorageWithRules('translationPlans.put', async () => {
      await this.db.transaction('rw', [this.db.translationPlans, this.db.readings], async () => {
        await this.requireReading(plan.readingId);
        await this.db.translationPlans.put({ ...plan, v: ROW_VERSION });
      });
    });
    return stored.ok ? ok(plan) : stored;
  }

  async commitTranslationPlan(
    plan: TranslationPlan,
    translations: readonly TranslationRecord[],
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
    expectedInputFingerprint: string,
  ): Promise<Result<TranslationPlan, StorageError>> {
    const stored = await runStorageWithRules('translationPlans.commit', async () => {
      await this.db.transaction(
        'rw',
        [this.db.translationPlans, this.db.translations, this.db.readings],
        async () => {
          await this.requireReading(plan.readingId);
          const active = await this.db.translationPlans.get(plan.readingId);
          if (active?.inputFingerprint !== expectedInputFingerprint) {
            throw new Error('The active translation plan changed.');
          }
          if (
            active.state === 'ready' &&
            plan.state === 'ready' &&
            active.planFingerprint !== plan.planFingerprint
          ) {
            throw new Error('A different ready translation plan is already active.');
          }
          await this.db.translations.bulkPut(
            translations.map((translation) => ({ ...translation, v: ROW_VERSION })),
          );
          await this.db.translationPlans.put({ ...plan, v: ROW_VERSION });
          await this.refreshTranslationSummary(plan.readingId, currentCacheKeys);
        },
      );
    });
    return stored.ok ? ok(plan) : stored;
  }

  async storeTranslationForPlan(
    record: TranslationRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
    planFingerprint: string,
  ): Promise<Result<TranslationRecord, StorageError>> {
    const stored = await runStorageWithRules('translations.putForPlan', async () => {
      await this.db.transaction(
        'rw',
        [this.db.translationPlans, this.db.translations, this.db.readings],
        async () => {
          const active = await this.db.translationPlans.get(record.readingId);
          if (active?.state !== 'ready' || active.planFingerprint !== planFingerprint) {
            throw new Error('The active translation plan changed.');
          }
          await this.requireReading(record.readingId);
          await this.db.translations.put({ ...record, v: ROW_VERSION });
          await this.refreshTranslationSummary(record.readingId, currentCacheKeys);
        },
      );
    });
    return stored.ok ? ok(record) : stored;
  }

  async getTranslationByCacheKey(
    cacheKey: string,
  ): Promise<Result<TranslationRecord | null, StorageError>> {
    const loaded = await runStorage('translations.get', () => this.db.translations.get(cacheKey));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(translationRowSchema, loaded.value, 'translations');
    return parsed.ok ? ok(toTranslation(parsed.value)) : parsed;
  }

  async listTranslations(
    readingId: ReadingId,
  ): Promise<Result<readonly TranslationRecord[], StorageError>> {
    const loaded = await runStorage('translations.list', () =>
      this.db.translations.where('readingId').equals(readingId).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(translationRowSchema, loaded.value, 'translations');
    return parsed.ok ? ok(parsed.value.map(toTranslation)) : parsed;
  }

  async listTranslationsForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TranslationRecord[], StorageError>> {
    const loaded = await runStorage('translations.listForSentences', () =>
      this.db.translations
        .where('sentenceId')
        .anyOf([...sentenceIds])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(translationRowSchema, loaded.value, 'translations');
    return parsed.ok ? ok(parsed.value.map(toTranslation)) : parsed;
  }

  async listTranslationsForCacheKeys(
    cacheKeys: readonly string[],
  ): Promise<Result<readonly TranslationRecord[], StorageError>> {
    const loaded = await runStorage('translations.listForCacheKeys', () =>
      this.db.translations
        .where(':id')
        .anyOf([...cacheKeys])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(translationRowSchema, loaded.value, 'translations');
    return parsed.ok ? ok(parsed.value.map(toTranslation)) : parsed;
  }

  async storeTranslation(
    record: TranslationRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<TranslationRecord, StorageError>> {
    const written = await runStorageWithRules('translations.put', async () => {
      await this.db.transaction('rw', [this.db.translations, this.db.readings], async () => {
        await this.requireReading(record.readingId);
        await this.db.translations.put({ ...record, v: ROW_VERSION });
        await this.refreshTranslationSummary(record.readingId, currentCacheKeys);
      });
    });
    return written.ok ? ok(record) : written;
  }

  async getGrammarAnalysisByCacheKey(
    cacheKey: string,
  ): Promise<Result<GrammarAnalysisRecord | null, StorageError>> {
    const loaded = await runStorage('grammarAnalyses.get', () =>
      this.db.grammarAnalyses.get(cacheKey),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(grammarAnalysisRowSchema, loaded.value, 'grammarAnalyses');
    return parsed.ok ? ok(toGrammarAnalysis(parsed.value)) : parsed;
  }

  async listGrammarAnalyses(
    readingId: ReadingId,
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>> {
    const loaded = await runStorage('grammarAnalyses.list', () =>
      this.db.grammarAnalyses.where('readingId').equals(readingId).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(grammarAnalysisRowSchema, loaded.value, 'grammarAnalyses');
    return parsed.ok ? ok(parsed.value.map(toGrammarAnalysis)) : parsed;
  }

  async listGrammarAnalysesForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>> {
    const loaded = await runStorage('grammarAnalyses.listForSentences', () =>
      this.db.grammarAnalyses
        .where('sentenceId')
        .anyOf([...sentenceIds])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(grammarAnalysisRowSchema, loaded.value, 'grammarAnalyses');
    return parsed.ok ? ok(parsed.value.map(toGrammarAnalysis)) : parsed;
  }

  async listGrammarAnalysesForCacheKeys(
    cacheKeys: readonly string[],
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>> {
    const loaded = await runStorage('grammarAnalyses.listForCacheKeys', () =>
      this.db.grammarAnalyses
        .where(':id')
        .anyOf([...cacheKeys])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(grammarAnalysisRowSchema, loaded.value, 'grammarAnalyses');
    return parsed.ok ? ok(parsed.value.map(toGrammarAnalysis)) : parsed;
  }

  async storeGrammarAnalysis(
    record: GrammarAnalysisRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>> {
    const written = await runStorageWithRules('grammarAnalyses.put', async () => {
      await this.db.transaction('rw', [this.db.grammarAnalyses, this.db.readings], async () => {
        await this.requireReading(record.readingId);
        await this.db.grammarAnalyses.put({ ...record, v: ROW_VERSION });
        await this.refreshGrammarSummary(record.readingId, currentCacheKeys);
      });
    });
    return written.ok ? ok(record) : written;
  }

  /**
   * Metadata only, read from `audioSummaries`: a clip's row in `audioAssets`
   * carries its bytes, and reading the row reads them.
   */
  async listAudioSummaries(
    readingId: ReadingId,
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>> {
    const loaded = await runStorage('audioSummaries.list', () =>
      this.db.audioSummaries.where('readingId').equals(readingId).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    return toSummaries(loaded.value);
  }

  /**
   * Metadata for a bounded set of clips, by cache key.
   *
   * Bounded by key rather than by sentence because the table is keyed by
   * `cacheKey`: two sentences with identical Japanese share one clip, and a
   * sentence-bounded read would miss the row for whichever of them did not
   * happen to be stored under its own id. One key per mounted sentence is the
   * same bound, resolved through the primary key. Read from `audioSummaries`,
   * like the list above, so it never reads a clip's bytes.
   */
  async listAudioSummariesForCacheKeys(
    cacheKeys: readonly string[],
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>> {
    const loaded = await runStorage('audioSummaries.listForCacheKeys', () =>
      this.db.audioSummaries
        .where(':id')
        .anyOf([...cacheKeys])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    return toSummaries(loaded.value);
  }

  async getAudioByCacheKey(cacheKey: string): Promise<Result<AudioAsset | null, StorageError>> {
    const loaded = await runStorage('audioAssets.get', () => this.db.audioAssets.get(cacheKey));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(audioAssetMetadataSchema, clipMetadata(loaded.value), 'audioAssets');
    if (!parsed.ok) {
      return parsed;
    }
    const { v: _version, ...metadata } = parsed.value;
    return ok({
      ...metadata,
      blob: new Blob([loaded.value.bytes], { type: metadata.mimeType }),
    });
  }

  async storeAudio(
    asset: AudioAsset,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<AudioAssetSummary, StorageError>> {
    const { blob, ...metadata } = asset;
    const bytes = await blob.arrayBuffer();

    const written = await runStorageWithRules('audioAssets.put', async () => {
      await this.db.transaction('rw', [...clipTables(this.db), this.db.readings], async () => {
        await this.requireReading(asset.readingId);
        await putClip(this.db, { ...metadata, bytes, v: ROW_VERSION });
        await this.refreshAudioSummary(asset.readingId, currentCacheKeys);
      });
    });
    if (!written.ok) {
      return written;
    }
    return ok(metadata);
  }

  deleteAudio(id: AssetId): Promise<Result<void, StorageError>> {
    return runStorage('audioAssets.delete', () =>
      this.db.transaction('rw', clipTables(this.db), () => deleteClipsWithId(this.db, id)),
    );
  }

  /**
   * Read through the primary index only. Dexie answers this without
   * deserializing a row, so it never pulls a clip's bytes into memory.
   */
  listAudioCacheKeys(): Promise<Result<readonly string[], StorageError>> {
    return runStorage('audioAssets.cacheKeys', async () => {
      return this.db.audioAssets.toCollection().primaryKeys();
    });
  }

  replaceAudioBytes(replacement: {
    readonly cacheKey: string;
    readonly expectedMimeType: AudioMimeType;
    readonly expectedByteLength: number;
    readonly bytes: ArrayBuffer;
    readonly mimeType: AudioMimeType;
  }): Promise<Result<'replaced' | 'skipped', StorageError>> {
    return runStorage('audioAssets.replaceBytes', () =>
      // The clip's tables alone: the cache key does not change, so the reading's
      // summary counts exactly what it counted before and must not be touched.
      this.db.transaction('rw', clipTables(this.db), async () => {
        const current = await this.db.audioAssets.get(replacement.cacheKey);
        if (
          current?.mimeType !== replacement.expectedMimeType ||
          current.byteLength !== replacement.expectedByteLength
        ) {
          return 'skipped' as const;
        }
        await putClip(this.db, {
          ...current,
          bytes: replacement.bytes,
          mimeType: replacement.mimeType,
          byteLength: replacement.bytes.byteLength,
        });
        return 'replaced' as const;
      }),
    );
  }

  recountAudioSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<void, StorageError>> {
    return runStorage('audioAssets.recountSummary', () =>
      // An async scope, so Dexie keeps the transaction across the native
      // awaits inside the count.
      this.db.transaction('rw', [this.db.readings, this.db.audioAssets], async () => {
        await this.refreshAudioSummary(readingId, cacheKeys);
      }),
    );
  }

  recountGrammarSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<void, StorageError>> {
    return runStorage('grammarAnalyses.recountSummary', () =>
      this.db.transaction('rw', [this.db.readings, this.db.grammarAnalyses], async () => {
        await this.refreshGrammarSummary(readingId, cacheKeys);
      }),
    );
  }

  async summarizeTranslations(
    _readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return runStorage('translations.summarize', async () => {
      const completed = await this.currentTranslationCount(cacheKeys);
      return { total: cacheKeys.size, completed, failed: 0 };
    });
  }

  async summarizeAudio(
    _readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return runStorage('audioAssets.summarize', async () => {
      const completed = await this.currentAudioCount(cacheKeys);
      return { total: cacheKeys.size, completed, failed: 0 };
    });
  }

  async summarizeGrammar(
    _readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarSummary, StorageError>> {
    return runStorage('grammarAnalyses.summarize', () => grammarCoverageByKey(this.db, cacheKeys));
  }

  /**
   * Read through the `sentenceId` index only. Dexie returns the matching index
   * values without deserializing a record, so this stays cheap on `audioAssets`
   * and never pulls a clip's bytes into memory.
   */
  listSentenceIdsWithStoredTranslation(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return runStorage('translations.storedSentenceIds', () =>
      this.storedSentenceIds(this.db.translations, sentenceIds),
    );
  }

  listSentenceIdsWithStoredGrammarAnalysis(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return runStorage('grammarAnalyses.storedSentenceIds', () =>
      this.storedSentenceIds(this.db.grammarAnalyses, sentenceIds),
    );
  }

  listSentenceIdsWithStoredAudio(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return runStorage('audioAssets.storedSentenceIds', () =>
      this.storedSentenceIds(this.db.audioAssets, sentenceIds),
    );
  }

  private async storedSentenceIds(
    table: Table<{ readonly sentenceId: SentenceId }, string>,
    sentenceIds: readonly SentenceId[],
  ): Promise<readonly SentenceId[]> {
    if (sentenceIds.length === 0) {
      return [];
    }
    const keys = await table
      .where('sentenceId')
      .anyOf([...sentenceIds])
      .keys();
    // Answered from the ids asked about rather than the index keys, which Dexie
    // types loosely, so only an id the caller supplied can come back.
    const stored = new Set<unknown>(keys);
    return [...new Set(sentenceIds)].filter((id) => stored.has(id));
  }

  async listSentenceIdsMissingTranslation(
    _readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const loaded = await runStorage('translations.keys', () =>
      storedCacheKeys(this.db.translations, cacheKeys),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const stored = loaded.value;
    const missing: SentenceId[] = [];
    for (const [sentenceId, cacheKey] of cacheKeys) {
      if (!stored.has(cacheKey)) {
        missing.push(sentenceId);
      }
    }
    return ok(missing);
  }

  async listSentenceIdsMissingAudio(
    _readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const loaded = await runStorage('audioAssets.keys', () =>
      storedCacheKeys(this.db.audioAssets, cacheKeys),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const stored = loaded.value;
    const missing: SentenceId[] = [];
    for (const [sentenceId, cacheKey] of cacheKeys) {
      if (!stored.has(cacheKey)) {
        missing.push(sentenceId);
      }
    }
    return ok(missing);
  }

  /**
   * A row counts as current only if its own `cacheKey` matches the caller's
   * current key for its specific sentence — the same reasoning
   * `listSentenceIdsMissingTranslation` already applies.
   */
  private async currentTranslationCount(
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<number> {
    const stored = await storedCacheKeys(this.db.translations, cacheKeys);
    return [...cacheKeys.values()].filter((cacheKey) => stored.has(cacheKey)).length;
  }

  /** Fails the surrounding transaction when the reading was deleted meanwhile. */
  private async requireReading(readingId: ReadingId): Promise<void> {
    if ((await this.db.readings.where(':id').equals(readingId).count()) === 0) {
      throw new StorageRuleViolation(storageError('not-found', 'That reading no longer exists.'));
    }
  }

  private async refreshTranslationSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const completed = await this.currentTranslationCount(cacheKeys);
    await this.db.readings.update(readingId, {
      translationSummary: { total: cacheKeys.size, completed, failed: 0 },
    });
  }

  private async refreshGrammarSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const summary = await grammarCoverageByKey(this.db, cacheKeys);
    await this.db.readings.update(readingId, { grammarSummary: summary });
  }

  /**
   * Counts the sentences whose current cache key has a stored clip.
   *
   * Two things this is deliberately not. It is not a plain reading-wide row
   * count: that would let a clip produced by a model or voice that is no longer
   * configured report the reading as complete, and the whole-reading Play gate
   * is built directly on this number.
   *
   * It is also not a count of *rows*. `audioAssets` is keyed by `cacheKey`, so
   * two sentences with identical Japanese share one clip and therefore one row
   * — which is the point of a content-addressed cache. Counting rows would
   * report such a reading as permanently one clip short, leaving a Prepare
   * entry that synthesizes nothing and a Play gate that never opens. The same
   * holds across readings: a clip another reading stored under this key counts
   * here, wherever its row says it was last written.
   */
  private async currentAudioCount(cacheKeys: ReadonlyMap<SentenceId, string>): Promise<number> {
    return (await coverageByKey(this.db.audioAssets, cacheKeys)).completed;
  }

  private async refreshAudioSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const completed = await this.currentAudioCount(cacheKeys);
    await this.db.readings.update(readingId, {
      audioSummary: { total: cacheKeys.size, completed, failed: 0 },
    });
  }
}

/** Stored clip metadata, validated and stripped of its row version. */
function toSummaries(
  rows: readonly AudioAssetMetadata[],
): Result<readonly AudioAssetSummary[], StorageError> {
  const parsed = parseRecords(audioAssetMetadataSchema, rows, 'audioSummaries');
  return parsed.ok
    ? ok(
        parsed.value.map((row) => {
          const { v: _version, ...summary } = row;
          return summary;
        }),
      )
    : parsed;
}

function toTranslation(row: TranslationRow): TranslationRecord {
  const { v: _version, ...record } = row;
  return record;
}

function toTranslationPlan(row: TranslationPlanRow): TranslationPlan {
  const { v: _version, ...plan } = row;
  return plan;
}

function toGrammarAnalysis(row: GrammarAnalysisRow): GrammarAnalysisRecord {
  const { v: _version, ...record } = row;
  return record;
}
