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
    const metadata = loaded.value.map(stripBytes);
    const parsed = parseRecords(audioAssetMetadataSchema, metadata, 'audioAssets');
    return parsed.ok
      ? ok(
          parsed.value.map((row) => {
            const { v: _version, ...summary } = row;
            return summary;
          }),
        )
      : parsed;
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

  async storeAudio(asset: AudioAsset): Promise<Result<AudioAssetSummary, StorageError>> {
    const { blob, ...metadata } = asset;
    const bytes = await blob.arrayBuffer();

    const written = await runStorage('audioAssets.put', async () => {
      await this.db.transaction('rw', [this.db.audioAssets, this.db.readings], async () => {
        await this.db.audioAssets.put({ ...metadata, bytes, v: ROW_VERSION });
        await this.refreshAudioSummary(asset.readingId);
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
      const rows = await this.db.audioAssets.where('readingId').equals(readingId).toArray();
      const completed = rows.filter((row) => cacheKeys.get(row.sentenceId) === row.cacheKey).length;
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

  /**
   * A row counts as current only if its own `cacheKey` matches the caller's
   * current key for its specific sentence — the same reasoning
   * `listSentenceIdsMissingTranslation` already applies.
   */
  private async currentTranslationCount(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<number> {
    const rows = await this.db.translations.where('readingId').equals(readingId).toArray();
    return rows.filter((row) => cacheKeys.get(row.sentenceId) === row.cacheKey).length;
  }

  private async computeGrammarSummary(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<GrammarSummary> {
    if (cacheKeys.size === 0) {
      return NO_GRAMMAR_REVIEW;
    }
    const rows = await this.db.grammarAnalyses.where('readingId').equals(readingId).toArray();
    const currentRows = rows.filter((row) => cacheKeys.get(row.sentenceId) === row.cacheKey);
    const concern = currentRows.reduce((sum, row) => sum + concernCount(row.findings), 0);
    return currentRows.length === cacheKeys.size
      ? grammarComplete(concern)
      : grammarPartial(currentRows.length, concern);
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
   * `storeAudio` has no cache-key map to work from, so this stays a plain
   * reading-wide count capped at the sentence total, unlike the corrected
   * per-sentence-current logic in `summarizeAudio`.
   */
  private async refreshAudioSummary(readingId: ReadingId): Promise<void> {
    const reading = await this.db.readings.get(readingId);
    if (!reading) {
      return;
    }
    const completed = await this.db.audioAssets.where('readingId').equals(readingId).count();
    await this.db.readings.update(readingId, {
      audioSummary: {
        total: reading.sentenceCount,
        completed: Math.min(completed, reading.sentenceCount),
        failed: 0,
      },
    });
  }
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
