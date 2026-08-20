import type { EnrichmentFailure } from '../../application/enrichment/sentence-enrichment.service';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/**
 * One per-sentence failure, in Monosai's words.
 *
 * Provider text never reaches the reader: a failure is rendered through the
 * shared copy table so the screen says what happened and what to do, and always
 * says what was not lost — the Japanese is stored and untouched by any of this.
 *
 * Shared by the two surfaces that can see one, because a translation failing in
 * the sentence popover and an analysis failing in the word popover are the same
 * event told to the same reader.
 */
export function describeEnrichmentFailure(failure: EnrichmentFailure | null): string | null {
  if (failure === null) {
    return null;
  }
  if (failure.source === 'storage') {
    return `Saving failed: ${failure.error.message} The sentence itself is unchanged.`;
  }
  const copy = aiErrorCopy(failure.error);
  return `${copy.heading} while ${aiTaskCopy(failure.error.task)}. ${copy.primaryAction}`;
}
