import type { SentenceId } from '../shared/ids';
import { err, ok, type Result } from '../shared/result';

/** How many sentences one translation request may carry. */
export const MAX_TRANSLATION_BATCH = 10;

/**
 * One entry of the passage a translation request sends.
 *
 * The window is the batch's sentences plus the immediate neighbours of each,
 * in reading order and deduplicated. Sending one ordered passage rather than a
 * before/after pair per sentence says the same thing for roughly half the
 * Japanese, and gives the model the whole paragraph instead of a one-sentence
 * keyhole — which matters for a language that drops its subjects.
 */
export interface TranslationWindowEntry {
  readonly textJa: string;
  /** The sentence to translate, or `null` when this entry is context only. */
  readonly targetId: SentenceId | null;
  /**
   * English already produced for this entry earlier in the same run.
   *
   * Batches are independent requests, so nothing otherwise pins how a name or
   * a recurring term was rendered in the previous one. Carrying the neighbour's
   * finished English forward is what keeps 優希 from becoming both "Yuki" and
   * "Yuuki" inside one reading.
   */
  readonly textEn?: string;
}

/**
 * How a recurring surface was already rendered, shown by a translated use.
 *
 * A name is only stable across independent requests if each one is told how the
 * last one rendered it, so this travels forward through a reading rather than
 * being re-derived per batch.
 */
export interface EstablishedRendering {
  readonly surfaceJa: string;
  readonly exampleJa: string;
  readonly exampleEn: string;
}

export interface TranslationBatchRequest {
  readonly window: readonly TranslationWindowEntry[];
  /** The reading's Japanese title, when it has one, as subject-matter context. */
  readonly titleJa?: string;
  /** The register the Japanese was written for, so "preserve register" has a referent. */
  readonly registerPreference?: string;
  /** Earlier choices for recurring names or terms, represented by a translated use. */
  readonly establishedRenderings?: readonly EstablishedRendering[];
  /** The learner's premise, when generation supplied one, as story-level context. */
  readonly premiseJa?: string;
  readonly promptVersion: string;
}

export interface TranslationResult {
  readonly id: SentenceId;
  readonly textEn: string;
}

/** The entries a batch actually asks for, in reading order. */
export function translationTargets(
  request: TranslationBatchRequest,
): readonly { readonly id: SentenceId; readonly textJa: string }[] {
  return request.window.flatMap((entry) =>
    entry.targetId === null ? [] : [{ id: entry.targetId, textJa: entry.textJa }],
  );
}

/** Splits items into ordered, non-empty batches of at most `maxBatch`. */
export function planBatches<T>(
  items: readonly T[],
  maxBatch: number = MAX_TRANSLATION_BATCH,
): readonly (readonly T[])[] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += maxBatch) {
    batches.push(items.slice(index, index + maxBatch));
  }
  return batches;
}

/**
 * Matches a provider's returned translations back to what was requested.
 *
 * Rejects rather than partially accepting: a response with an extra, missing,
 * duplicate, or blank translation cannot be trusted to have translated the
 * rest correctly either, so the whole batch is retried or repaired together.
 */
export function matchTranslations(
  requested: readonly { readonly id: SentenceId; readonly textJa: string }[],
  returned: readonly TranslationResult[],
): Result<readonly TranslationResult[], string> {
  const requestedIds = new Set(requested.map((sentence) => sentence.id));
  const seen = new Set<SentenceId>();
  const byId = new Map<SentenceId, TranslationResult>();

  for (const result of returned) {
    if (!requestedIds.has(result.id)) {
      return err('extra');
    }
    if (seen.has(result.id)) {
      return err('duplicate');
    }
    seen.add(result.id);
    if (result.textEn.trim() === '') {
      return err('blank');
    }
    byId.set(result.id, result);
  }

  if (seen.size !== requestedIds.size) {
    return err('missing');
  }

  return ok(
    requested.map((sentence) => {
      const match = byId.get(sentence.id);
      if (match === undefined) {
        throw new Error('matchTranslations: internal invariant violated');
      }
      return match;
    }),
  );
}
