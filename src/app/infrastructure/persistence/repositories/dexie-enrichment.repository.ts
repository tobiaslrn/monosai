import { ok, type Result } from '../../../domain/shared/result';
import type { AssetId, ReadingId, SentenceId } from '../../../domain/shared/ids';
import type { CompletionSummary } from '../../../domain/reading/summaries';
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

  async storeTranslation(
    record: TranslationRecord,
  ): Promise<Result<TranslationRecord, StorageError>> {
    const written = await runStorage('translations.put', async () => {
      await this.db.transaction('rw', [this.db.translations, this.db.readings], async () => {
        await this.db.translations.put({ ...record, v: ROW_VERSION });
        await this.refreshTranslationSummary(record.readingId);
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

  async storeGrammarAnalysis(
    record: GrammarAnalysisRecord,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>> {
    const written = await runStorage('grammarAnalyses.put', () =>
      this.db.grammarAnalyses.put({ ...record, v: ROW_VERSION }),
    );
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
    configFingerprint: string,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return this.summarize(readingId, configFingerprint, 'translations');
  }

  async summarizeAudio(
    readingId: ReadingId,
    configFingerprint: string,
  ): Promise<Result<CompletionSummary, StorageError>> {
    return this.summarize(readingId, configFingerprint, 'audioAssets');
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

  private async summarize(
    readingId: ReadingId,
    configFingerprint: string,
    table: 'translations' | 'audioAssets',
  ): Promise<Result<CompletionSummary, StorageError>> {
    const reading = await runStorage('readings.get', () => this.db.readings.get(readingId));
    if (!reading.ok) {
      return reading;
    }
    const total = reading.value?.sentenceCount ?? 0;

    const counted = await runStorage(`${table}.count`, () =>
      table === 'translations'
        ? this.db.translations
            .where('readingId')
            .equals(readingId)
            .filter((row) => row.modelId === configFingerprint)
            .count()
        : this.db.audioAssets
            .where('readingId')
            .equals(readingId)
            .filter((row) => row.optionsFingerprint === configFingerprint)
            .count(),
    );
    if (!counted.ok) {
      return counted;
    }

    return ok({ total, completed: Math.min(counted.value, total), failed: 0 });
  }

  private async refreshTranslationSummary(readingId: ReadingId): Promise<void> {
    const reading = await this.db.readings.get(readingId);
    if (!reading) {
      return;
    }
    const completed = await this.db.translations.where('readingId').equals(readingId).count();
    await this.db.readings.update(readingId, {
      translationSummary: {
        total: reading.sentenceCount,
        completed: Math.min(completed, reading.sentenceCount),
        failed: 0,
      },
    });
  }

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
