import type { GrammarFinding } from './records';

/** The part of a token a finding span is matched against. */
export interface SpannedToken {
  readonly id: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}

/**
 * Which tokens a sentence's out-of-profile findings actually cover.
 *
 * Only findings that supply a span mark a token: a sentence-level finding
 * marks the sentence and nothing inside it, because pinning it to a single
 * word would say something the analysis never said
 * (`ux-ui-specification.md:178`). Findings inside the profile mark nothing at
 * all — they are explanations, not concerns.
 *
 * Both offsets are UTF-16 code-unit indexes into the same immutable sentence
 * text the tokens index into, so a token is covered when the two half-open
 * ranges overlap.
 */
export function tokensCoveredByConcerns(
  findings: readonly GrammarFinding[],
  tokens: readonly SpannedToken[],
): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const finding of findings) {
    const { startUtf16, endUtf16 } = finding;
    if (finding.inProfile || startUtf16 === undefined || endUtf16 === undefined) {
      continue;
    }
    for (const token of tokens) {
      if (token.startUtf16 < endUtf16 && startUtf16 < token.endUtf16) {
        covered.add(token.id);
      }
    }
  }
  return covered;
}

/**
 * The findings whose span covers one token.
 *
 * Used for the word popover's grammar line, so it keeps findings that are
 * inside the profile too: an explanation of a form the learner has already met
 * is exactly what word details are for. Findings without a span are not here;
 * they are `sentenceWideFindings`, and every word of the sentence shows them.
 */
export function findingsCoveringToken(
  findings: readonly GrammarFinding[],
  token: SpannedToken,
): readonly GrammarFinding[] {
  return findings.filter(
    (finding) =>
      finding.startUtf16 !== undefined &&
      finding.endUtf16 !== undefined &&
      token.startUtf16 < finding.endUtf16 &&
      finding.startUtf16 < token.endUtf16,
  );
}

/**
 * The findings that were said about the sentence rather than about any part of
 * it.
 *
 * A finding with no span marks nothing on the page, because pinning it to a
 * word would say something the analysis never said. It still has to be
 * readable, so every word of the sentence carries it — the reading surface has
 * no other surface to put it on.
 */
export function sentenceWideFindings(
  findings: readonly GrammarFinding[],
): readonly GrammarFinding[] {
  return findings.filter(
    (finding) => finding.startUtf16 === undefined || finding.endUtf16 === undefined,
  );
}
