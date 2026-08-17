import type { Result } from '../shared/result';
import type { AssetId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { CompletionSummary } from '../reading/summaries';
import type {
  AudioAsset,
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from './records';

/**
 * Cached auxiliary results. Writes are idempotent by cache key and update the
 * owning reading's denormalized summary in the same transaction.
 */
export interface EnrichmentRepository {
  getTranslationByCacheKey(
    cacheKey: string,
  ): Promise<Result<TranslationRecord | null, StorageError>>;
  listTranslations(
    readingId: ReadingId,
  ): Promise<Result<readonly TranslationRecord[], StorageError>>;
  storeTranslation(record: TranslationRecord): Promise<Result<TranslationRecord, StorageError>>;

  getGrammarAnalysisByCacheKey(
    cacheKey: string,
  ): Promise<Result<GrammarAnalysisRecord | null, StorageError>>;
  listGrammarAnalyses(
    readingId: ReadingId,
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>>;
  storeGrammarAnalysis(
    record: GrammarAnalysisRecord,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>>;

  /** Metadata only; never loads blobs. */
  listAudioSummaries(
    readingId: ReadingId,
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>>;
  getAudioByCacheKey(cacheKey: string): Promise<Result<AudioAsset | null, StorageError>>;
  storeAudio(asset: AudioAsset): Promise<Result<AudioAssetSummary, StorageError>>;
  deleteAudio(id: AssetId): Promise<Result<void, StorageError>>;

  summarizeTranslations(
    readingId: ReadingId,
    configFingerprint: string,
  ): Promise<Result<CompletionSummary, StorageError>>;
  summarizeAudio(
    readingId: ReadingId,
    configFingerprint: string,
  ): Promise<Result<CompletionSummary, StorageError>>;
  listSentenceIdsMissingTranslation(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>>;
}
