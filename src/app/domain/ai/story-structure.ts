import type { SentenceRange, StoryCandidate } from './story-request';

/**
 * What is wrong with a parsed candidate's shape.
 *
 * `format` issues mean the model did not answer the contract at all and a
 * format-recovery request is the response. `repairable` issues mean the answer
 * was well formed but says the wrong thing — a story of the wrong length is
 * still a story — so they go to a content repair and spend the repair budget
 * (ai-pipelines section 5).
 */
export type StructureSeverity = 'format' | 'repairable';

export type StructureIssueCode =
  | 'title-empty'
  | 'no-sentences'
  | 'sentence-empty'
  | 'duplicate-index'
  | 'non-contiguous-index'
  | 'sentence-count-out-of-range';

export interface StructureIssue {
  readonly code: StructureIssueCode;
  readonly severity: StructureSeverity;
  readonly message: string;
  /** The offending sentence's declared index, when one issue names a sentence. */
  readonly index?: number;
}

/**
 * Trims outer whitespace and nothing else.
 *
 * A model routinely pads a JSON string with a newline; that is packaging, not
 * content. Anything inside the trimmed text — including whitespace a learner
 * would find odd — is preserved, because stripping content here would make the
 * saved Japanese differ from what was validated.
 */
export function normalizeCandidate(candidate: StoryCandidate): StoryCandidate {
  return {
    titleJa: candidate.titleJa.trim(),
    sentences: candidate.sentences.map((sentence) => ({
      index: sentence.index,
      textJa: sentence.textJa.trim(),
    })),
  };
}

/**
 * Structural checks on an already-normalized candidate.
 *
 * Indexes must be unique and contiguous from zero, so the ordered sentences the
 * story is built from cannot depend on the order the model happened to emit.
 */
export function checkStoryStructure(
  candidate: StoryCandidate,
  range: SentenceRange,
): readonly StructureIssue[] {
  const issues: StructureIssue[] = [];

  if (candidate.titleJa === '') {
    issues.push({
      code: 'title-empty',
      severity: 'format',
      message: 'The reply contained no title.',
    });
  }

  if (candidate.sentences.length === 0) {
    issues.push({
      code: 'no-sentences',
      severity: 'format',
      message: 'The reply contained no sentences.',
    });
    return issues;
  }

  const seen = new Set<number>();
  for (const sentence of candidate.sentences) {
    if (sentence.textJa === '') {
      issues.push({
        code: 'sentence-empty',
        severity: 'format',
        message: 'One sentence was empty.',
        index: sentence.index,
      });
    }
    if (seen.has(sentence.index)) {
      issues.push({
        code: 'duplicate-index',
        severity: 'format',
        message: `Sentence number ${String(sentence.index)} appeared more than once.`,
        index: sentence.index,
      });
    }
    seen.add(sentence.index);
  }

  for (let expected = 0; expected < candidate.sentences.length; expected += 1) {
    if (!seen.has(expected)) {
      issues.push({
        code: 'non-contiguous-index',
        severity: 'format',
        message: `Sentence number ${String(expected)} was missing.`,
        index: expected,
      });
    }
  }

  if (candidate.sentences.length < range.min || candidate.sentences.length > range.max) {
    const requirement =
      range.min === range.max
        ? `exactly ${String(range.min)}`
        : `between ${String(range.min)} and ${String(range.max)}`;
    issues.push({
      code: 'sentence-count-out-of-range',
      severity: 'repairable',
      message: `The story has ${String(candidate.sentences.length)} sentences; it needs ${requirement}.`,
    });
  }

  return issues;
}

export function hasFormatFailure(issues: readonly StructureIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'format');
}

/** The sentences in index order, which is the order the story is saved in. */
export function orderedSentences(candidate: StoryCandidate): readonly string[] {
  return [...candidate.sentences]
    .sort((left, right) => left.index - right.index)
    .map((sentence) => sentence.textJa);
}
