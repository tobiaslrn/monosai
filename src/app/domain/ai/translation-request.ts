import type { SentenceId } from '../shared/ids';
import { err, ok, type Result } from '../shared/result';

/** How many sentences one translation request may carry. */
export const MAX_TRANSLATION_BATCH = 10;

export interface TranslationBatchRequest {
  readonly sentences: readonly { readonly id: SentenceId; readonly textJa: string }[];
  readonly promptVersion: string;
}

export interface TranslationResult {
  readonly id: SentenceId;
  readonly textEn: string;
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
