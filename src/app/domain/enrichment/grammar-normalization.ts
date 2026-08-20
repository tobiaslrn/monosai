import type { ReviewedFinding } from '../ai/grammar-review-request';
import type { GrammarFinding } from '../enrichment/records';
import type { SentenceId } from '../shared/ids';

/**
 * Whether `offset` falls between the two UTF-16 code units of one character.
 *
 * A boundary at 0 or at the string's length is always between characters, so
 * only interior offsets need the surrogate check.
 */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) {
    return false;
  }
  const before = text.charCodeAt(offset - 1);
  const at = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff;
}

function isValidRange(text: string, start: number, end: number): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return false;
  }
  if (start < 0 || end > text.length || start >= end) {
    return false;
  }
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
    return false;
  }
  return true;
}

/**
 * Turns a provider's raw findings into what the app is willing to store.
 *
 * A finding naming a sentence outside the batch is dropped rather than kept:
 * it cannot be anchored to anything the caller has. A finding with an invalid
 * offset range is downgraded to sentence-level instead of dropped, because the
 * substance of the finding — the label and explanation — is still valid even
 * when the highlight is not. A blank label or explanation is dropped outright:
 * there is nothing salvageable to show.
 */
export function normalizeReview(
  sentenceIds: readonly SentenceId[],
  result: { readonly findings: readonly ReviewedFinding[] },
  sentenceTextById: ReadonlyMap<SentenceId, string>,
): readonly ReviewedFinding[] {
  const knownIds = new Set(sentenceIds);
  const normalized: ReviewedFinding[] = [];

  for (const finding of result.findings) {
    if (!knownIds.has(finding.sentenceId)) {
      continue;
    }
    if (finding.label.trim() === '' || finding.explanationEn.trim() === '') {
      continue;
    }

    const text = sentenceTextById.get(finding.sentenceId);
    const { startUtf16, endUtf16 } = finding;
    const keepOffsets =
      startUtf16 !== undefined &&
      endUtf16 !== undefined &&
      text !== undefined &&
      isValidRange(text, startUtf16, endUtf16);

    normalized.push(
      keepOffsets
        ? finding
        : { ...finding, startUtf16: undefined, endUtf16: undefined },
    );
  }

  return normalized;
}

export function concernCount(
  findings: readonly ReviewedFinding[] | readonly GrammarFinding[],
): number {
  return findings.filter((finding) => !finding.inProfile).length;
}
