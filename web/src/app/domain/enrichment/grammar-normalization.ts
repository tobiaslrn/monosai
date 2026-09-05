import {
  MAX_GRAMMAR_FINDINGS_PER_SENTENCE,
  type NormalizedFinding,
  type ReviewedFinding,
} from '../ai/grammar-review-request';
import type { GrammarFinding } from '../enrichment/records';
import type { SentenceId } from '../shared/ids';

/**
 * Whether `offset` falls between the two UTF-16 code units of one character.
 *
 * A boundary at 0 or at the string's length is always between characters, so
 * only interior offsets need the surrogate check. A quoted span can still land
 * mid-pair if it happens to begin with a lone low surrogate, which is why the
 * check survives the move away from model-supplied offsets.
 */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) {
    return false;
  }
  const before = text.charCodeAt(offset - 1);
  const at = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff;
}

/**
 * Where a quoted span sits in its sentence, or `null` when it does not sit
 * anywhere in it.
 *
 * The first occurrence wins. A repeated span is genuinely ambiguous and the
 * model was not asked which one it meant, so highlighting the first is the only
 * answer that is never arbitrary in a different way.
 */
function locateSpan(text: string, spanJa: string): { start: number; end: number } | null {
  if (spanJa === '') {
    return null;
  }
  const start = text.indexOf(spanJa);
  if (start < 0) {
    return null;
  }
  const end = start + spanJa.length;
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
    return null;
  }
  return { start, end };
}

/**
 * Turns a provider's raw findings into what the app is willing to store.
 *
 * A finding naming a sentence outside the batch is dropped rather than kept: it
 * cannot be anchored to anything the caller has. A finding whose span is not
 * actually in its sentence is downgraded to sentence-level instead of dropped,
 * because the substance of the finding — the label and explanation — is still
 * valid even when the highlight is not, and losing good pedagogy to a bad quote
 * is the worse trade. A blank label or explanation is dropped outright: there
 * is nothing salvageable to show.
 *
 * Above-ceiling findings are kept ahead of merely useful ones when a sentence
 * has more than three, which is the priority the grammar prompt states.
 */
export function normalizeReview(
  sentenceIds: readonly SentenceId[],
  result: { readonly findings: readonly ReviewedFinding[] },
  sentenceTextById: ReadonlyMap<SentenceId, string>,
): readonly NormalizedFinding[] {
  const knownIds = new Set(sentenceIds);
  const candidates = new Map<SentenceId, NormalizedFinding[]>();

  for (const finding of result.findings) {
    if (!knownIds.has(finding.sentenceId)) {
      continue;
    }
    if (finding.label.trim() === '' || finding.explanationEn.trim() === '') {
      continue;
    }

    const text = sentenceTextById.get(finding.sentenceId);
    const located =
      finding.spanJa === undefined || text === undefined ? null : locateSpan(text, finding.spanJa);
    const normalized: NormalizedFinding = {
      sentenceId: finding.sentenceId,
      label: finding.label,
      explanationEn: finding.explanationEn,
      confidence: finding.confidence,
      inProfile: finding.inProfile,
      ...(located === null ? {} : { startUtf16: located.start, endUtf16: located.end }),
    };

    const existing = candidates.get(finding.sentenceId) ?? [];
    const identity = findingIdentity(normalized);
    if (existing.some((item) => findingIdentity(item) === identity)) {
      continue;
    }
    existing.push(normalized);
    candidates.set(finding.sentenceId, existing);
  }

  return sentenceIds.flatMap((sentenceId) => {
    const findings = candidates.get(sentenceId) ?? [];
    return findings
      .map((finding, index) => ({ finding, index }))
      .sort((left, right) => {
        const profilePriority = Number(left.finding.inProfile) - Number(right.finding.inProfile);
        return profilePriority === 0 ? left.index - right.index : profilePriority;
      })
      .slice(0, MAX_GRAMMAR_FINDINGS_PER_SENTENCE)
      .map(({ finding }) => finding);
  });
}

function findingIdentity(finding: NormalizedFinding): string {
  return JSON.stringify([
    finding.label.trim().toLowerCase(),
    finding.startUtf16 ?? null,
    finding.endUtf16 ?? null,
  ]);
}

export function concernCount(
  findings: readonly NormalizedFinding[] | readonly GrammarFinding[],
): number {
  return findings.filter((finding) => !finding.inProfile).length;
}
