import { sentencesWithoutStoredAid } from '../../domain/enrichment/preparation';
import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import {
  matchTranslations,
  planBatches,
  translationTargets,
  type EstablishedRendering,
  type TranslationWindowEntry,
} from '../../domain/ai/translation-request';
import type { TranslationRecord } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

/**
 * What the reading is, beyond the sentences themselves.
 *
 * The prompt asks for tone and register to be preserved, which needs the
 * register to have been stated somewhere; the title is subject matter that
 * resolves a surprising amount of ambiguity for two dozen characters.
 */
export interface TranslationContext {
  readonly titleJa?: string;
  readonly registerPreference?: string;
  readonly premiseJa?: string;
  /** Proper nouns and other terms whose English rendering should stay stable. */
  readonly consistencyTermsJa?: readonly string[];
  /**
   * Renderings an earlier call already settled.
   *
   * A caller that translates one reading in several calls — the whole-reading
   * job, which stores every answer before it asks the next question — passes
   * back what the previous call learned, so a name survives the boundary
   * between two independent requests.
   */
  readonly establishedRenderings?: readonly EstablishedRendering[];
}

/** Keeps terminology context useful without letting it become another story-sized payload. */
const MAX_ESTABLISHED_RENDERINGS = 20;

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
  /** Everything this call knows about how the reading's names were rendered. */
  readonly establishedRenderings: readonly EstablishedRendering[];
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
    context: TranslationContext = {},
  ): Promise<TranslationRunOutcome> {
    const records: TranslationRecord[] = [];
    const misses: Sentence[] = [];
    const positionById = new Map(sentences.map((sentence, index) => [sentence.id, index]));
    // English already settled for a position, whether from the cache or from an
    // earlier batch of this run. It travels with the context entries so that a
    // name rendered in one batch is rendered the same way in the next.
    const englishByPosition = new Map<number, string>();
    const establishedBySurface = new Map<string, EstablishedRendering>(
      (context.establishedRenderings ?? []).map((rendering) => [rendering.surfaceJa, rendering]),
    );
    const consistencyTerms = [...new Set(context.consistencyTermsJa ?? [])].filter(
      (surface) => surface.trim() !== '',
    );

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
        const position = positionById.get(sentence.id);
        if (position !== undefined) {
          englishByPosition.set(position, cached.value.textEn);
          rememberRenderings(
            establishedBySurface,
            consistencyTerms,
            sentence.japaneseText,
            cached.value.textEn,
          );
        }
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
      const window = buildWindow(sentences, batch, positionById, englishByPosition);
      const requested = translationTargets({ window, promptVersion });
      const targetText = requested.map((target) => target.textJa).join('\n');
      const establishedRenderings = [...establishedBySurface.values()]
        .filter((rendering) => targetText.includes(rendering.surfaceJa))
        .slice(0, MAX_ESTABLISHED_RENDERINGS);
      const answered = await this.provider.translate(
        {
          window,
          promptVersion,
          ...(context.titleJa === undefined ? {} : { titleJa: context.titleJa }),
          ...(context.registerPreference === undefined
            ? {}
            : { registerPreference: context.registerPreference }),
          ...(context.premiseJa === undefined ? {} : { premiseJa: context.premiseJa }),
          ...(establishedRenderings.length === 0 ? {} : { establishedRenderings }),
        },
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
        const position = positionById.get(sentence.id);
        if (position !== undefined) {
          englishByPosition.set(position, result.textEn);
        }
        rememberRenderings(
          establishedBySurface,
          consistencyTerms,
          sentence.japaneseText,
          result.textEn,
        );
      }
    }

    return {
      records,
      failures,
      error,
      establishedRenderings: [...establishedBySurface.values()],
    };
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

  /**
   * Sentences that have never been translated, under any configuration.
   *
   * What the preparation lane queues, as opposed to what *Prepare again* asks:
   * a cache key changes with the model, and a reading already prepared must not
   * be prepared a second time because the learner picked a different one.
   */
  async neverPreparedSentenceIds(
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const stored = await this.enrichment.listSentenceIdsWithStoredTranslation([
      ...cacheKeys.keys(),
    ]);
    return stored.ok ? ok(sentencesWithoutStoredAid(cacheKeys, stored.value)) : stored;
  }
}

function rememberRenderings(
  established: Map<string, EstablishedRendering>,
  terms: readonly string[],
  textJa: string,
  textEn: string,
): void {
  for (const surfaceJa of terms) {
    if (
      established.size >= MAX_ESTABLISHED_RENDERINGS ||
      established.has(surfaceJa) ||
      !textJa.includes(surfaceJa)
    ) {
      continue;
    }
    established.set(surfaceJa, { surfaceJa, exampleJa: textJa, exampleEn: textEn });
  }
}

/**
 * The ordered passage one batch sends: its targets plus each target's immediate
 * neighbours, deduplicated.
 *
 * A contiguous batch collapses to the batch plus two sentences, where the old
 * per-sentence before/after pair repeated most of the batch's Japanese a second
 * and third time. A scattered batch — cache hits interleaved with misses —
 * stays at worst the size the pairs would have been, and still without
 * duplicates.
 */
function buildWindow(
  sentences: readonly Sentence[],
  batch: readonly Sentence[],
  positionById: ReadonlyMap<SentenceId, number>,
  englishByPosition: ReadonlyMap<number, string>,
): readonly TranslationWindowEntry[] {
  const targets = new Set<number>();
  const included = new Set<number>();
  for (const sentence of batch) {
    const position = positionById.get(sentence.id);
    if (position === undefined) {
      continue;
    }
    targets.add(position);
    for (const neighbour of [position - 1, position, position + 1]) {
      if (neighbour >= 0 && neighbour < sentences.length) {
        included.add(neighbour);
      }
    }
  }

  return [...included]
    .sort((left, right) => left - right)
    .map((position) => {
      const sentence = sentences[position];
      const textEn = englishByPosition.get(position);
      return {
        textJa: sentence.japaneseText,
        targetId: targets.has(position) ? sentence.id : null,
        ...(targets.has(position) || textEn === undefined ? {} : { textEn }),
      };
    });
}
