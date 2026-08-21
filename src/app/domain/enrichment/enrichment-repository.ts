import type { Result } from '../shared/result';
import type { AssetId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { CompletionSummary, GrammarSummary } from '../reading/summaries';
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
  listTranslationsForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TranslationRecord[], StorageError>>;
  /**
   * `currentCacheKeys` is the caller's current cache key per sentence in the
   * reading; it is the only way the repository learns "current" without
   * reaching into settings, and lets the summary refresh happen inside the
   * same transaction as the write.
   */
  storeTranslation(
    record: TranslationRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<TranslationRecord, StorageError>>;

  getGrammarAnalysisByCacheKey(
    cacheKey: string,
  ): Promise<Result<GrammarAnalysisRecord | null, StorageError>>;
  listGrammarAnalyses(
    readingId: ReadingId,
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>>;
  listGrammarAnalysesForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>>;
  storeGrammarAnalysis(
    record: GrammarAnalysisRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>>;

  /** Metadata only; never loads blobs. */
  listAudioSummaries(
    readingId: ReadingId,
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>>;
  /**
   * Metadata for specific clips, bounded by their cache keys, so the reader
   * reads only the paragraphs it has mounted. Never loads blobs.
   *
   * Bounded by key rather than by sentence because the audio table is keyed by
   * `cacheKey`: two sentences with identical Japanese share one clip and one
   * row, so asking by sentence would miss it for one of them.
   */
  listAudioSummariesForCacheKeys(
    cacheKeys: readonly string[],
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>>;
  /** The playback read path: one clip, with its bytes, by cache key. */
  getAudioByCacheKey(cacheKey: string): Promise<Result<AudioAsset | null, StorageError>>;
  storeAudio(
    asset: AudioAsset,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<AudioAssetSummary, StorageError>>;
  deleteAudio(id: AssetId): Promise<Result<void, StorageError>>;

  summarizeTranslations(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>>;
  summarizeAudio(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>>;
  summarizeGrammar(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarSummary, StorageError>>;
  listSentenceIdsMissingTranslation(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>>;
  listSentenceIdsMissingAudio(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>>;
}
