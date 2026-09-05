import { isRetryable } from '../../domain/storage/storage-error';
import type { EnrichmentFailure } from '../../application/enrichment/sentence-enrichment.service';
import { aiFailureMessage } from '../../shared-ui/ai-error/ai-error-copy';

/**
 * One per-sentence failure, in Monosai's words.
 *
 * Provider text never reaches the reader: a failure is rendered through the
 * shared copy table so the screen says what happened and what to do, and always
 * says what was not lost — the Japanese is stored and untouched by any of this.
 *
 * Shared by the surfaces that can see one, because a translation failing in the
 * sentence popover and an analysis failing in the word popover are the same
 * event told to the same reader. The `reader` surface is what keeps the next
 * step honest here: the settings panel's wording sends the learner to a test
 * that this screen does not have.
 */
export function describeEnrichmentFailure(failure: EnrichmentFailure | null): string | null {
  if (failure === null) {
    return null;
  }
  if (failure.source === 'storage') {
    return `Saving failed: ${failure.error.message} The sentence itself is unchanged.`;
  }
  return aiFailureMessage(failure.error, 'reader');
}

/** Configuration failures need a changed setting before another request can help. */
export function enrichmentNeedsSettings(failure: EnrichmentFailure | null): boolean {
  if (failure?.source !== 'provider')
    return failure?.source === 'storage' && !isRetryable(failure.error);
  switch (failure.error.code) {
    case 'authentication':
    case 'model-not-found':
    case 'capability-unsupported':
    case 'malformed-response':
    case 'context-budget-exceeded':
    case 'audio-invalid':
      return true;
    case 'offline':
    case 'timeout':
    case 'cancelled':
    case 'rate-limited':
    case 'provider-unavailable':
    case 'unknown':
    case 'credit-exhausted':
      return false;
  }
}

/**
 * Whether repeating the same request could plausibly succeed.
 *
 * Deliberately not the negation of {@link enrichmentNeedsSettings}: a model that
 * answered in prose may well answer in the required shape next time, so a
 * malformed response earns both a retry and the settings link that offers a
 * model better suited to the task. What is refused, missing, unsupported, over
 * budget, or unpaid cannot change until something else does.
 */
export function enrichmentCanRetry(failure: EnrichmentFailure | null): boolean {
  if (failure === null) return true;
  if (failure.source === 'storage') return isRetryable(failure.error);
  switch (failure.error.code) {
    case 'malformed-response':
    case 'offline':
    case 'timeout':
    case 'cancelled':
    case 'rate-limited':
    case 'provider-unavailable':
    case 'unknown':
      return true;
    case 'authentication':
    case 'model-not-found':
    case 'capability-unsupported':
    case 'context-budget-exceeded':
    case 'audio-invalid':
    case 'credit-exhausted':
      return false;
  }
}
