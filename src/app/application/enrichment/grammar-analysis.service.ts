import { sentencesWithoutStoredAid } from '../../domain/enrichment/preparation';
import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import {
  MAX_GRAMMAR_REVIEW_BATCH,
  type GrammarReviewRequest,
  type NormalizedFinding,
} from '../../domain/ai/grammar-review-request';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { planBatches } from '../../domain/ai/translation-request';
import { normalizeReview } from '../../domain/enrichment/grammar-normalization';
import type { GrammarAnalysisRecord, GrammarFinding } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

export type GrammarRunOutcome =
  | { readonly status: 'complete'; readonly records: readonly GrammarAnalysisRecord[] }
  | { readonly status: 'unavailable'; readonly records: readonly []; readonly reasonCode: string };

export type GrammarBatchOutcome =
  | { readonly status: 'complete'; readonly records: readonly GrammarAnalysisRecord[] }
  | { readonly status: 'unavailable'; readonly records: readonly []; readonly error: AiError };

/**
 * Reviews a generated story's grammar in bounded ordered batches.
 *
 * Unlike translation, this is not cache-lookup-first: a freshly generated
 * story's sentences are new, so a cache hit is impossible on the only path
 * that reaches this service, and checking anyway would just be a wasted read
 * per sentence. Batches keep long stories within predictable input and output
 * limits; one failed batch makes the optional review unavailable rather than
 * pretending the whole story was reviewed.
 */
@Injectable({ providedIn: 'root' })
export class GrammarAnalysisService {
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);

  async run(
    sentences: readonly Sentence[],
    readingId: ReadingId,
    keys: ReadonlyMap<SentenceId, string>,
    profileHash: string,
    profileGuidance: string,
    registerPreference: string,
    modelId: string,
    promptVersion: string,
    config: TextTaskConfig,
    signal: AbortSignal,
  ): Promise<GrammarRunOutcome> {
    const records: GrammarAnalysisRecord[] = [];
    for (const batch of planBatches(sentences, MAX_GRAMMAR_REVIEW_BATCH)) {
      if (signal.aborted) {
        return { status: 'unavailable', records: [], reasonCode: 'cancelled' };
      }
      const outcome = await this.runBatch(
        batch,
        readingId,
        keys,
        profileHash,
        profileGuidance,
        registerPreference,
        modelId,
        promptVersion,
        config,
        signal,
      );
      if (outcome.status === 'unavailable') {
        return { status: 'unavailable', records: [], reasonCode: outcome.error.code };
      }
      records.push(...outcome.records);
    }

    return { status: 'complete', records };
  }

  /** Reviews exactly one caller-planned batch without persisting it. */
  async runBatch(
    sentences: readonly Sentence[],
    readingId: ReadingId,
    keys: ReadonlyMap<SentenceId, string>,
    profileHash: string,
    profileGuidance: string,
    registerPreference: string,
    modelId: string,
    promptVersion: string,
    config: TextTaskConfig,
    signal: AbortSignal,
  ): Promise<GrammarBatchOutcome> {
    if (signal.aborted) {
      return {
        status: 'unavailable',
        records: [],
        error: aiError('cancelled', 'grammar-review', 'The grammar review was stopped.'),
      };
    }
    const request: GrammarReviewRequest = {
      profileGuidance,
      registerPreference,
      sentences: sentences.map((sentence) => ({
        id: sentence.id,
        textJa: sentence.japaneseText,
      })),
      promptVersion,
    };
    const reviewed = await this.provider.reviewGrammar(request, config, signal);
    if (!reviewed.ok) {
      return { status: 'unavailable', records: [], error: reviewed.error };
    }
    const sentenceIds = sentences.map((sentence) => sentence.id);
    const textById = new Map(sentences.map((sentence) => [sentence.id, sentence.japaneseText]));
    const normalized: readonly NormalizedFinding[] = normalizeReview(
      sentenceIds,
      reviewed.value,
      textById,
    );

    const findingsBySentence = new Map<SentenceId, GrammarFinding[]>();
    for (const finding of normalized) {
      const existing = findingsBySentence.get(finding.sentenceId) ?? [];
      existing.push({
        label: finding.label,
        explanationEn: finding.explanationEn,
        confidence: finding.confidence,
        inProfile: finding.inProfile,
        ...(finding.startUtf16 === undefined ? {} : { startUtf16: finding.startUtf16 }),
        ...(finding.endUtf16 === undefined ? {} : { endUtf16: finding.endUtf16 }),
      });
      findingsBySentence.set(finding.sentenceId, existing);
    }

    const records = sentences.map((sentence): GrammarAnalysisRecord => {
      const cacheKey = keys.get(sentence.id) ?? '';
      return {
        id: this.ids.nextId(),
        sentenceId: sentence.id,
        readingId,
        sourceContentHash: sentence.contentHash,
        profileHash,
        modelId,
        promptVersion,
        findings: findingsBySentence.get(sentence.id) ?? [],
        cacheKey,
        createdAt: this.clock.now(),
      };
    });

    return { status: 'complete', records };
  }

  /**
   * Persists one analysis and refreshes the reading's grammar summary in the
   * same transaction.
   *
   * Split from `run` for the same reason translation's is: the generated path
   * produces records that are written only inside `saveGeneratedStory`'s
   * transaction, while an imported reading analysed one sentence at a time
   * writes each one as it arrives.
   */
  store(
    record: GrammarAnalysisRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<GrammarAnalysisRecord, StorageError>> {
    return this.enrichment.storeGrammarAnalysis(record, currentCacheKeys);
  }

  /** Finds sentences that do not have a current analysis under these keys. */
  async missingSentenceIds(
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const rows = await this.enrichment.listGrammarAnalysesForCacheKeys([
      ...new Set(cacheKeys.values()),
    ]);
    if (!rows.ok) {
      return rows;
    }
    const storedKeys = new Set(rows.value.map((row) => row.cacheKey));
    return {
      ok: true,
      value: [...cacheKeys].filter(([, key]) => !storedKeys.has(key)).map(([id]) => id),
    };
  }

  /**
   * Sentences that have never been analysed, under any configuration.
   *
   * What the preparation lane queues, as opposed to what *Prepare again* asks:
   * a cache key changes with the model, and a reading already prepared must not
   * be prepared a second time because the learner picked a different one.
   */
  async neverPreparedSentenceIds(
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const stored = await this.enrichment.listSentenceIdsWithStoredGrammarAnalysis([
      ...cacheKeys.keys(),
    ]);
    return stored.ok ? ok(sentencesWithoutStoredAid(cacheKeys, stored.value)) : stored;
  }
}
