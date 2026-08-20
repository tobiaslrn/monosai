import type { EnrichmentRepository } from '../app/domain/enrichment/enrichment-repository';
import type {
  AudioAsset,
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../app/domain/enrichment/records';
import type { CompletionSummary, GrammarSummary } from '../app/domain/reading/summaries';
import type { AssetId, ReadingId, SentenceId } from '../app/domain/shared/ids';
import { err, ok, type Result } from '../app/domain/shared/result';
import type { StorageError } from '../app/domain/storage/storage-error';

/**
 * In-memory `EnrichmentRepository`, for specs that exercise translation cache
 * lookups without a real Dexie database.
 *
 * Only the methods the generated-story pipeline reads (`getTranslationByCacheKey`)
 * are meaningfully implemented; the rest keep the interface satisfied with the
 * same in-memory bookkeeping so a future spec can grow into them.
 */
export class FakeEnrichmentRepository implements EnrichmentRepository {
  /**
   * Which sentence ids each bounded per-sentence query was asked for, so a
   * spec can assert the reader reads only its mounted window.
   */
  readonly perSentenceQueries: { translations: SentenceId[][]; grammar: SentenceId[][] } = {
    translations: [],
    grammar: [],
  };

  translations: TranslationRecord[] = [];
  grammarAnalyses: GrammarAnalysisRecord[] = [];
  audio: AudioAsset[] = [];

  /** Set to make the next `getTranslationByCacheKey` call fail. */
  failGetTranslationWith: StorageError | null = null;

  /** Set to make the bounded per-sentence translation query fail. */
  failListTranslationsForSentencesWith: StorageError | null = null;

  getTranslationByCacheKey(
    cacheKey: string,
  ): Promise<Result<TranslationRecord | null, StorageError>> {
    if (this.failGetTranslationWith !== null) {
      return Promise.resolve(err(this.failGetTranslationWith));
    }
    return Promise.resolve(
      ok(this.translations.find((record) => record.cacheKey === cacheKey) ?? null),
    );
  }

  listTranslations(
    readingId: ReadingId,
  ): Promise<Result<readonly TranslationRecord[], StorageError>> {
    return Promise.resolve(
      ok(this.translations.filter((record) => record.readingId === readingId)),
    );
  }

  listTranslationsForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TranslationRecord[], StorageError>> {
    this.perSentenceQueries.translations.push([...sentenceIds]);
    if (this.failListTranslationsForSentencesWith !== null) {
      return Promise.resolve(err(this.failListTranslationsForSentencesWith));
    }
    const wanted = new Set(sentenceIds);
    return Promise.resolve(ok(this.translations.filter((record) => wanted.has(record.sentenceId))));
  }

  storeTranslation(record: TranslationRecord): Promise<Result<TranslationRecord, StorageError>> {
    this.translations.push(record);
    return Promise.resolve(ok(record));
  }

  getGrammarAnalysisByCacheKey(
    cacheKey: string,
  ): Promise<Result<GrammarAnalysisRecord | null, StorageError>> {
    return Promise.resolve(
      ok(this.grammarAnalyses.find((record) => record.cacheKey === cacheKey) ?? null),
    );
  }

  listGrammarAnalyses(
    readingId: ReadingId,
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>> {
    return Promise.resolve(
      ok(this.grammarAnalyses.filter((record) => record.readingId === readingId)),
    );
  }

  listGrammarAnalysesForSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly GrammarAnalysisRecord[], StorageError>> {
    this.perSentenceQueries.grammar.push([...sentenceIds]);
    const wanted = new Set(sentenceIds);
    return Promise.resolve(
      ok(this.grammarAnalyses.filter((record) => wanted.has(record.sentenceId))),
    );
  }

  storeGrammarAnalysis(
    record: GrammarAnalysisRecord,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>> {
    this.grammarAnalyses.push(record);
    return Promise.resolve(ok(record));
  }

  listAudioSummaries(
    readingId: ReadingId,
  ): Promise<Result<readonly AudioAssetSummary[], StorageError>> {
    return Promise.resolve(
      ok(
        this.audio
          .filter((asset) => asset.readingId === readingId)
          .map(({ blob: _blob, ...summary }) => summary),
      ),
    );
  }

  getAudioByCacheKey(cacheKey: string): Promise<Result<AudioAsset | null, StorageError>> {
    return Promise.resolve(ok(this.audio.find((asset) => asset.cacheKey === cacheKey) ?? null));
  }

  storeAudio(asset: AudioAsset): Promise<Result<AudioAssetSummary, StorageError>> {
    this.audio.push(asset);
    const { blob: _blob, ...summary } = asset;
    return Promise.resolve(ok(summary));
  }

  deleteAudio(id: AssetId): Promise<Result<void, StorageError>> {
    this.audio = this.audio.filter((asset) => asset.id !== id);
    return Promise.resolve(ok(undefined));
  }

  summarizeTranslations(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    const total = cacheKeys.size;
    const completed = [...cacheKeys.values()].filter((key) =>
      this.translations.some((record) => record.cacheKey === key),
    ).length;
    return Promise.resolve(ok({ total, completed, failed: total - completed }));
  }

  summarizeAudio(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<CompletionSummary, StorageError>> {
    const total = cacheKeys.size;
    const completed = [...cacheKeys.values()].filter((key) =>
      this.audio.some((asset) => asset.cacheKey === key),
    ).length;
    return Promise.resolve(ok({ total, completed, failed: total - completed }));
  }

  summarizeGrammar(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarSummary, StorageError>> {
    const analyzedSentenceCount = [...cacheKeys.values()].filter((key) =>
      this.grammarAnalyses.some((record) => record.cacheKey === key),
    ).length;
    if (analyzedSentenceCount === 0) {
      return Promise.resolve(ok({ state: 'not-requested' }));
    }
    return Promise.resolve(ok({ state: 'partial', analyzedSentenceCount, concernCount: 0 }));
  }

  listSentenceIdsMissingTranslation(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const missing = [...cacheKeys.entries()]
      .filter(([, key]) => !this.translations.some((record) => record.cacheKey === key))
      .map(([sentenceId]) => sentenceId);
    return Promise.resolve(ok(missing));
  }
}
