import { Injectable, inject } from '@angular/core';
import type { GrammarReviewRequest } from '../../domain/ai/grammar-review-request';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { normalizeReview } from '../../domain/enrichment/grammar-normalization';
import type { GrammarAnalysisRecord, GrammarFinding } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

export type GrammarRunOutcome =
  | { readonly status: 'complete'; readonly records: readonly GrammarAnalysisRecord[] }
  | { readonly status: 'unavailable'; readonly records: readonly []; readonly reasonCode: string };

/**
 * Reviews a generated story's grammar in one automatic pass.
 *
 * Unlike translation, this is not cache-lookup-first: a freshly generated
 * story's sentences are new, so a cache hit is impossible on the only path
 * that reaches this service, and checking anyway would just be a wasted read
 * per sentence. Grammar review also has no batching bound in the domain
 * contracts, so the whole story is reviewed in one request.
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
    const request: GrammarReviewRequest = {
      profileGuidance,
      registerPreference,
      sentences: sentences.map((sentence) => ({ id: sentence.id, textJa: sentence.japaneseText })),
      promptVersion,
    };

    const reviewed = await this.provider.reviewGrammar(request, config, signal);
    if (!reviewed.ok) {
      return { status: 'unavailable', records: [], reasonCode: reviewed.error.code };
    }
    if (signal.aborted) {
      return { status: 'unavailable', records: [], reasonCode: 'cancelled' };
    }

    const sentenceIds = sentences.map((sentence) => sentence.id);
    const textById = new Map(sentences.map((sentence) => [sentence.id, sentence.japaneseText]));
    const normalized = normalizeReview(sentenceIds, reviewed.value, textById);

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

    const records: GrammarAnalysisRecord[] = sentences.map((sentence) => {
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
}
