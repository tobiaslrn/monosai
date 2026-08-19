import type { GenerationProvenance } from '../../../domain/ai/generation-provenance';
import type { GeneratedStory } from '../../../domain/reading/reading';
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
 * Refuses a generated save whose frozen validation still marks a word unknown.
 *
 * This is the storage-level half of "no unknown-containing result can enter the
 * library". The generation state machine refuses the same draft before it gets
 * here; both checks exist because a single one is a promise, and two
 * independent ones are an invariant. `not-in-snapshot` is refused alongside it:
 * that category belongs to imported readings, which follow the newest snapshot,
 * while a generated story is frozen against the snapshot it was written for.
 */
export function assertNoUnacceptedValidation(
  validations: readonly FrozenSentenceValidation[],
): void {
  for (const validation of validations) {
    for (const status of validation.tokenStatuses) {
      const category = status.validation.category;
      if (category === 'unknown' || category === 'not-in-snapshot') {
        throw new StorageRuleViolation(
          storageError(
            'conflict',
            'A generated story cannot be saved while any word is still unvalidated.',
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
