import type { GenerationProvenance } from '../../../domain/ai/generation-provenance';
import type { GeneratedStory } from '../../../domain/reading/reading';
import type { GeneratedStoryDraft } from '../../../domain/reading/reading-repository';
import type { FrozenSentenceValidation } from '../../../domain/reading/validation';
import { storageError } from '../../../domain/storage/storage-error';
import { StorageRuleViolation } from './storage-operation';

/** Duplicate identities or positions abort the parent transaction. */
export function assertUniqueIds(records: readonly { readonly id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new StorageRuleViolation(
        storageError('conflict', `Duplicate ${label} identifier in one save.`),
      );
    }
    seen.add(record.id);
  }
}

export function assertUniquePositions(positions: readonly number[], label: string): void {
  const seen = new Set<number>();
  for (const position of positions) {
    if (seen.has(position)) {
      throw new StorageRuleViolation(
        storageError('conflict', `Duplicate ${label} position in one save.`),
      );
    }
    seen.add(position);
  }
}

/**
 * Refuses a generated save whose frozen validation defers to live vocabulary.
 *
 * `not-in-snapshot` belongs to imported readings, which follow the current
 * vocabulary; a generated story is frozen against the validation evidence
 * captured when it was written, so a status meaning "ask the snapshot" can
 * never be part of it.
 *
 * `unknown` is deliberately allowed. A word the repair budget could not
 * replace is saved marked rather than thrown away, and the reader underlines
 * it: the learner sees which words the story reaches beyond their vocabulary
 * instead of losing the story to them.
 */
export function assertNoSnapshotDependentValidation(
  validations: readonly FrozenSentenceValidation[],
): void {
  for (const validation of validations) {
    for (const status of validation.tokenStatuses) {
      if (status.validation.category === 'not-in-snapshot') {
        throw new StorageRuleViolation(
          storageError(
            'conflict',
            'A generated story cannot be saved with a validation that defers to the current vocabulary.',
          ),
        );
      }
    }
  }
}

/** A generated story is meaningless without the evidence that produced it. */
export function assertProvenanceComplete(
  provenance: GenerationProvenance,
  reading: GeneratedStory,
): void {
  const missing =
    provenance.id.length === 0 ||
    provenance.snapshotId.length === 0 ||
    provenance.grammarProfileSnapshotId.length === 0 ||
    provenance.modelId.length === 0 ||
    Object.keys(provenance.promptVersions).length === 0;

  if (missing) {
    throw new StorageRuleViolation(
      storageError('conflict', 'The generated story is missing its generation provenance.'),
    );
  }
  if (
    provenance.readingId !== reading.id ||
    provenance.snapshotId !== reading.snapshotId ||
    provenance.id !== reading.generationProvenanceId
  ) {
    throw new StorageRuleViolation(
      storageError('conflict', 'The generated story and its provenance describe different runs.'),
    );
  }
}

/**
 * Refuses a generated draft whose aid summaries claim more than it is saving.
 *
 * A generated story is written with its Japanese and nothing else: the
 * preparation lane produces every aid afterwards and refreshes the summary as
 * it stores each row (ADR 0047, ADR 0048). So the only consistent summary at
 * save time is one that claims nothing, and a summary claiming otherwise is a
 * count no stored row supports.
 */
export function assertEnrichmentConsistent(draft: GeneratedStoryDraft): void {
  const { translationSummary, grammarSummary } = draft.reading;

  if (translationSummary.completed !== 0) {
    throw new StorageRuleViolation(
      storageError(
        'conflict',
        'The translation summary does not match the translations being saved.',
      ),
    );
  }
  if (translationSummary.completed + translationSummary.failed > translationSummary.total) {
    throw new StorageRuleViolation(
      storageError('conflict', 'The translation summary counts do not add up.'),
    );
  }
  if (grammarSummary.state === 'complete') {
    throw new StorageRuleViolation(
      storageError(
        'conflict',
        'The grammar summary claims every sentence was analyzed, but the analyses being saved disagree.',
      ),
    );
  }
}
