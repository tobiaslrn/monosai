import type { RegisterPreference } from '../grammar/presets';
import type { StoryForm } from '../reading/reading';
import type { SnapshotId } from '../shared/ids';
import { err, ok, type Result } from '../shared/result';

/** Inclusive bounds on how many sentences a form may contain. */
export interface SentenceRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The two story lengths, with the ranges from the AI specification.
 *
 * The range travels inside the request rather than being derived at the prompt,
 * because local validation judges the returned sentence count against exactly
 * the numbers the model was given.
 */
export const SENTENCE_RANGES: Readonly<Record<StoryForm, SentenceRange>> = {
  micro: { min: 4, max: 6 },
  short: { min: 13, max: 20 },
};

export const MAX_PREMISE_LENGTH = 1_000;
export const MAX_SPECIAL_INSTRUCTIONS_LENGTH = 1_000;

/**
 * Everything one story generation is judged and reproduced against.
 *
 * The structural baseline arrives as plain forms rather than as rule objects:
 * the enumerated rule catalog was removed in ADR 0014, and the model only needs
 * to be told which function words stay available when the allowlist otherwise
 * forbids everything outside the learner's reviewed vocabulary. See ADR 0019.
 */
export interface StoryGenerationRequest {
  readonly form: StoryForm;
  readonly sentenceRange: SentenceRange;
  readonly premise: string;
  readonly specialInstructions?: string;
  /** Canonical expressions the story may use. The local validation authority. */
  readonly allowedVocabulary: readonly string[];
  /** Inspiration only; never required, never displayed. */
  readonly suggestedVocabulary: readonly string[];
  /** Function words that count as readable regardless of the allowlist. */
  readonly structuralBaseline: readonly string[];
  readonly grammarGuidance: string;
  readonly registerPreference: RegisterPreference;
  readonly snapshotId: SnapshotId;
  readonly grammarProfileHash: string;
  readonly promptVersion: string;
}

/** One sentence exactly as the model returned it, before any local work. */
export interface CandidateSentence {
  readonly index: number;
  readonly textJa: string;
}

export interface StoryCandidate {
  readonly titleJa: string;
  readonly sentences: readonly CandidateSentence[];
}

export type StoryInputIssueCode =
  'premise-empty' | 'premise-too-long' | 'special-instructions-too-long';

export interface StoryInputIssue {
  readonly code: StoryInputIssueCode;
  readonly field: 'premise' | 'specialInstructions';
  readonly message: string;
}

/** The learner's own text, trimmed and proven to fit the documented limits. */
export interface ValidatedStoryInput {
  readonly premise: string;
  readonly specialInstructions?: string;
}

export interface StoryInputDraft {
  readonly premise: string;
  readonly specialInstructions?: string;
}

/**
 * Length in Unicode code points.
 *
 * The limit is stated to the learner in characters, so a rare kanji or an emoji
 * must count once rather than twice. Code points, not grapheme clusters: the
 * limit is a size guard on what is sent, not a typographic measurement, and a
 * locale-aware segmenter would make the same number depend on the locale.
 */
export function countCodePoints(text: string): number {
  let count = 0;
  for (const _character of text) {
    count += 1;
  }
  return count;
}

/**
 * Checks the two free-text fields before anything is spent.
 *
 * Length is measured in Unicode code points rather than UTF-16 units, because
 * the limit is stated to the learner in characters and an emoji or a rare kanji
 * would otherwise silently count twice.
 */
export function validateStoryInput(
  draft: StoryInputDraft,
): Result<ValidatedStoryInput, readonly StoryInputIssue[]> {
  const issues: StoryInputIssue[] = [];
  const premise = draft.premise.trim();
  const instructions = draft.specialInstructions?.trim() ?? '';

  if (premise === '') {
    issues.push({
      code: 'premise-empty',
      field: 'premise',
      message: 'Describe what the story should be about.',
    });
  } else if (countCodePoints(premise) > MAX_PREMISE_LENGTH) {
    issues.push({
      code: 'premise-too-long',
      field: 'premise',
      message: `Shorten the premise to ${String(MAX_PREMISE_LENGTH)} characters or fewer.`,
    });
  }

  if (countCodePoints(instructions) > MAX_SPECIAL_INSTRUCTIONS_LENGTH) {
    issues.push({
      code: 'special-instructions-too-long',
      field: 'specialInstructions',
      message: `Shorten the special instructions to ${String(
        MAX_SPECIAL_INSTRUCTIONS_LENGTH,
      )} characters or fewer.`,
    });
  }

  if (issues.length > 0) {
    return err(issues);
  }
  return ok({
    premise,
    ...(instructions === '' ? {} : { specialInstructions: instructions }),
  });
}
