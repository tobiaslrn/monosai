import type { Table } from 'dexie';
import { ok, type Result } from '../../../domain/shared/result';
import type { AssetId, ReadingId, SentenceId } from '../../../domain/shared/ids';
import type { CompletionSummary, GrammarSummary } from '../../../domain/reading/summaries';
import {
  NO_GRAMMAR_REVIEW,
  grammarComplete,
  grammarPartial,
} from '../../../domain/reading/summaries';
import { concernCount } from '../../../domain/enrichment/grammar-normalization';
import type {
  AudioAsset,
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../../domain/enrichment/records';
import type { EnrichmentRepository } from '../../../domain/enrichment/enrichment-repository';
import type { StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  audioAssetMetadataSchema,
  grammarAnalysisRowSchema,
  translationRowSchema,
  type AudioAssetStoredRow,
  type GrammarAnalysisRow,
  type TranslationRow,
} from '../schemas/enrichment.schema';
import { runStorage } from './storage-operation';

/**
 * Cached auxiliary results.
 *
 * Writes are idempotent by cache key, and the owning reading's denormalized
 * summary is recalculated in the same transaction so library cards stay honest
 * without loading sentence children or audio blobs.
 */
export class DexieEnrichmentRepository implements EnrichmentRepository {
  constructor(private readonly db: MonosaiDatabase) {}

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
    const written = await runStorage('translations.put', async () => {
      await this.db.transaction('rw', [this.db.translations, this.db.readings], async () => {
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
    const written = await runStorage('grammarAnalyses.put', async () => {
      await this.db.transaction('rw', [this.db.grammarAnalyses, this.db.readings], async () => {
        await this.db.grammarAnalyses.put({ ...record, v: ROW_VERSION });
        await this.refreshGrammarSummary(record.readingId, currentCacheKeys);
      });
    });
    return written.ok ? ok(record) : written;
  }

  /** Metadata only: list queries must never pull audio blobs into memory. */
  async listAudioSummaries(
    readingId: ReadingId,
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>> {
    const loaded = await runStorage('audioAssets.list', () =>
      this.db.audioAssets.where('readingId').equals(readingId).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    return toSummaries(loaded.value);
  }

  /**
   * The same metadata, bounded to specific sentences through the `sentenceId`
   * index, so the reader's mounted window never reads the whole reading — and,
   * like every list query here, never touches `bytes`.
   */
  /**
   * Metadata for a bounded set of clips, by cache key.
   *
   * Bounded by key rather than by sentence because the table is keyed by
   * `cacheKey`: two sentences with identical Japanese share one clip, and a
   * sentence-bounded read would miss the row for whichever of them did not
   * happen to be stored under its own id. One key per mounted sentence is the
   * same bound, resolved through the primary key, and it still never loads a
   * blob.
   */
  async listAudioSummariesForCacheKeys(
    cacheKeys: readonly string[],
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>> {
    const loaded = await runStorage('audioAssets.listForCacheKeys', () =>
      this.db.audioAssets
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
    const parsed = parseRecord(audioAssetMetadataSchema, stripBytes(loaded.value), 'audioAssets');
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

    const written = await runStorage('audioAssets.put', async () => {
      await this.db.transaction('rw', [this.db.audioAssets, this.db.readings], async () => {
        await this.db.audioAssets.put({ ...metadata, bytes, v: ROW_VERSION });
        await this.refreshAudioSummary(asset.readingId, currentCacheKeys);
      });
    });
    if (!written.ok) {
      return written;
    }
    return ok(metadata);
  }

  deleteAudio(id: AssetId): Promise<Result<void, StorageError>> {
    return runStorage('audioAssets.delete', async () => {
      await this.db.audioAssets.where('id').equals(id).delete();
    });
  }

  async summarizeTranslations(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return runStorage('translations.summarize', async () => {
      const completed = await this.currentTranslationCount(readingId, cacheKeys);
      return { total: cacheKeys.size, completed, failed: 0 };
    });
  }

  async summarizeAudio(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return runStorage('audioAssets.summarize', async () => {
      const completed = await this.currentAudioCount(readingId, cacheKeys);
      return { total: cacheKeys.size, completed, failed: 0 };
    });
  }

  async summarizeGrammar(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarSummary, StorageError>> {
    return runStorage('grammarAnalyses.summarize', () =>
      this.computeGrammarSummary(readingId, cacheKeys),
    );
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
    return [...new Set(keys as SentenceId[])];
  }

  async listSentenceIdsMissingTranslation(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const loaded = await runStorage('translations.keys', () =>
      this.db.translations.where('readingId').equals(readingId).primaryKeys(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const stored = new Set(loaded.value);
    const missing: SentenceId[] = [];
    for (const [sentenceId, cacheKey] of cacheKeys) {
      if (!stored.has(cacheKey)) {
        missing.push(sentenceId);
      }
    }
    return ok(missing);
  }

  async listSentenceIdsMissingAudio(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const loaded = await runStorage('audioAssets.keys', () =>
      this.db.audioAssets.where('readingId').equals(readingId).primaryKeys(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const stored = new Set(loaded.value);
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
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<number> {
    const stored = new Set(
      await this.db.translations.where('readingId').equals(readingId).primaryKeys(),
    );
    return [...cacheKeys.values()].filter((cacheKey) => stored.has(cacheKey)).length;
  }

  private async computeGrammarSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<GrammarSummary> {
    if (cacheKeys.size === 0) {
      return NO_GRAMMAR_REVIEW;
    }
    const rows = await this.db.grammarAnalyses.where('readingId').equals(readingId).toArray();
    const currentByKey = new Map(rows.map((row) => [row.cacheKey, row]));
    let analyzedSentenceCount = 0;
    let concern = 0;
    for (const cacheKey of cacheKeys.values()) {
      const row = currentByKey.get(cacheKey);
      if (row !== undefined) {
        analyzedSentenceCount += 1;
        concern += concernCount(row.findings);
      }
    }
    return analyzedSentenceCount === cacheKeys.size
      ? grammarComplete(concern)
      : grammarPartial(analyzedSentenceCount, concern);
  }

  private async refreshTranslationSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const completed = await this.currentTranslationCount(readingId, cacheKeys);
    await this.db.readings.update(readingId, {
      translationSummary: { total: cacheKeys.size, completed, failed: 0 },
    });
  }

  private async refreshGrammarSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const summary = await this.computeGrammarSummary(readingId, cacheKeys);
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
   * entry that synthesizes nothing and a Play gate that never opens.
   */
  private async currentAudioCount(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<number> {
    const stored = new Set(
      await this.db.audioAssets.where('readingId').equals(readingId).primaryKeys(),
    );
    return [...cacheKeys.values()].filter((cacheKey) => stored.has(cacheKey)).length;
  }

  private async refreshAudioSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<void> {
    const completed = await this.currentAudioCount(readingId, cacheKeys);
    await this.db.readings.update(readingId, {
      audioSummary: { total: cacheKeys.size, completed, failed: 0 },
    });
  }
}

/** Metadata for stored rows, validated and stripped of bytes and row version. */
function toSummaries(
  rows: readonly AudioAssetStoredRow[],
): Result<readonly AudioAssetSummary[], StorageError> {
  const parsed = parseRecords(audioAssetMetadataSchema, rows.map(stripBytes), 'audioAssets');
  return parsed.ok
    ? ok(
        parsed.value.map((row) => {
          const { v: _version, ...summary } = row;
          return summary;
        }),
      )
    : parsed;
}

function stripBytes(row: AudioAssetStoredRow): Omit<AudioAssetStoredRow, 'bytes'> {
  const { bytes: _bytes, ...metadata } = row;
  return metadata;
}

function toTranslation(row: TranslationRow): TranslationRecord {
  const { v: _version, ...record } = row;
  return record;
}

function toGrammarAnalysis(row: GrammarAnalysisRow): GrammarAnalysisRecord {
  const { v: _version, ...record } = row;
  return record;
}
