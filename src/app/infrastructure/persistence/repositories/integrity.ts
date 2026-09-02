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
 * Refuses a draft whose enrichment rows are inconsistent with its text or
 * with the summaries the reading claims to have. A translation or grammar
 * analysis that outlived the sentence it was written for — or a summary that
 * disagrees with the rows actually being saved — must never enter storage.
 */
export function assertEnrichmentConsistent(draft: GeneratedStoryDraft): void {
  const sentenceContentHashById = new Map(
    draft.sentences.map((sentence) => [sentence.id, sentence.contentHash]),
  );

  for (const translation of draft.translations) {
    const contentHash = sentenceContentHashById.get(translation.sentenceId);
    if (contentHash === undefined) {
      throw new StorageRuleViolation(
        storageError('conflict', 'A translation references a sentence that is not being saved.'),
      );
    }
    if (contentHash !== translation.sourceContentHash) {
      throw new StorageRuleViolation(
        storageError('conflict', 'A translation no longer matches its sentence content.'),
      );
    }
  }

  for (const analysis of draft.grammarAnalyses) {
    const contentHash = sentenceContentHashById.get(analysis.sentenceId);
    if (contentHash === undefined) {
      throw new StorageRuleViolation(
        storageError(
          'conflict',
          'A grammar analysis references a sentence that is not being saved.',
        ),
      );
    }
    if (contentHash !== analysis.sourceContentHash) {
      throw new StorageRuleViolation(
        storageError('conflict', 'A grammar analysis no longer matches its sentence content.'),
      );
    }
  }

  const { translationSummary, grammarSummary } = draft.reading;
  if (translationSummary.completed !== draft.translations.length) {
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

  if (grammarSummary.state === 'unavailable' && draft.grammarAnalyses.length !== 0) {
    throw new StorageRuleViolation(
      storageError(
        'conflict',
        'The grammar summary claims no analysis is available, but analyses are being saved.',
      ),
    );
  }
  if (
    grammarSummary.state === 'complete' &&
    draft.grammarAnalyses.length !== draft.sentences.length
  ) {
    throw new StorageRuleViolation(
      storageError(
        'conflict',
        'The grammar summary claims every sentence was analyzed, but the analyses being saved disagree.',
      ),
    );
  }
}
