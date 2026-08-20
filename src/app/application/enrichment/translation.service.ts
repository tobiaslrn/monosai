import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { matchTranslations, planBatches } from '../../domain/ai/translation-request';
import type { TranslationRecord } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

export interface TranslationRunOutcome {
  readonly records: readonly TranslationRecord[];
  readonly failures: readonly SentenceId[];
  /**
   * Why the first failed batch failed, or null when nothing failed.
   *
   * The generated path only needs the count, but a whole-reading job has to
   * write a stable `errorCode` onto the persisted job item, and inventing one
   * from a bare sentence id would lose the distinction between "the provider is
   * down" and "the response did not match what was asked for".
   */
  readonly error: AiError | null;
}

/**
 * Translates a generated story's sentences, one cache-checked, bounded-batch
 * pass over the final accepted Japanese.
 *
 * `run` never throws and never fails as a whole: every per-sentence outcome is
 * captured in `records` or `failures` instead, because a translation batch
 * failing must never block saving Japanese that already passed validation.
 * This method only ever reads/writes the provider and the cache lookup — it
 * never calls `EnrichmentRepository.storeTranslation`, because the generated
 * path's rows are persisted only inside `saveGeneratedStory`'s single
 * transaction; writing them here first would let a cancelled run leave rows
 * behind.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);

  async run(
    sentences: readonly Sentence[],
    readingId: ReadingId,
    keys: ReadonlyMap<SentenceId, string>,
    modelId: string,
    promptVersion: string,
    config: TextTaskConfig,
    signal: AbortSignal,
  ): Promise<TranslationRunOutcome> {
    const records: TranslationRecord[] = [];
    const misses: Sentence[] = [];

    for (const sentence of sentences) {
      const cacheKey = keys.get(sentence.id);
      if (cacheKey === undefined) {
        misses.push(sentence);
        continue;
      }
      const cached = await this.enrichment.getTranslationByCacheKey(cacheKey);
      if (cached.ok && cached.value !== null) {
        // The cache key is content-addressed (contentHash + model + prompt),
        // not sentence- or reading-scoped, so the same key can be a hit for a
        // different sentence's earlier translation of identical Japanese. Only
        // the English text is reused; the record is rebuilt against this
        // sentence and reading so `assertEnrichmentConsistent` sees a row that
        // actually belongs to what is being saved.
        records.push({
          id: this.ids.nextId(),
          sentenceId: sentence.id,
          readingId,
          sourceContentHash: sentence.contentHash,
          textEn: cached.value.textEn,
          modelId: cached.value.modelId,
          promptVersion: cached.value.promptVersion,
          cacheKey,
          createdAt: this.clock.now(),
        });
      } else {
        misses.push(sentence);
      }
    }

    const failures: SentenceId[] = [];
    let error: AiError | null = null;
    const batches = planBatches(misses);

    for (const batch of batches) {
      if (signal.aborted) {
        break;
      }
      const requested = batch.map((sentence) => ({
        id: sentence.id,
        textJa: sentence.japaneseText,
      }));
      const answered = await this.provider.translate(
        { sentences: requested, promptVersion },
        config,
        signal,
      );
      if (!answered.ok) {
        failures.push(...batch.map((sentence) => sentence.id));
        error ??= answered.error;
        continue;
      }
      const matched = matchTranslations(requested, answered.value);
      if (!matched.ok) {
        failures.push(...batch.map((sentence) => sentence.id));
        error ??= aiError(
          'malformed-response',
          'translation',
          'The translations did not match the sentences that were sent.',
          { detail: { issueCode: matched.error } },
        );
        continue;
      }
      const sentenceById = new Map(batch.map((sentence) => [sentence.id, sentence]));
      for (const result of matched.value) {
        const sentence = sentenceById.get(result.id);
        if (sentence === undefined) {
          continue;
        }
        const cacheKey = keys.get(sentence.id);
        if (cacheKey === undefined) {
          continue;
        }
        records.push({
          id: this.ids.nextId(),
          sentenceId: sentence.id,
          readingId,
          sourceContentHash: sentence.contentHash,
          textEn: result.textEn,
          modelId,
          promptVersion,
          cacheKey,
          createdAt: this.clock.now(),
        });
      }
    }

    return { records, failures, error };
  }

  /**
   * Persists one translation and refreshes the reading's summary in the same
   * transaction.
   *
   * Kept separate from `run` so the generated path can produce records without
   * ever writing them: a cancelled generation then cannot have left a row
   * behind, rather than depending on someone remembering not to store one. The
   * whole-reading job and the imported per-sentence path call both in turn.
   */
  store(
    record: TranslationRecord,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<TranslationRecord, StorageError>> {
    return this.enrichment.storeTranslation(record, currentCacheKeys);
  }

  /**
   * Which sentences have no translation under the current keys.
   *
   * Completeness is "a row exists whose cache key is the current key for that
   * sentence", so a model or prompt change makes previously translated
   * sentences missing again without deleting anything.
   */
  missingSentenceIds(
    readingId: ReadingId,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return this.enrichment.listSentenceIdsMissingTranslation(readingId, currentCacheKeys);
  }
}
