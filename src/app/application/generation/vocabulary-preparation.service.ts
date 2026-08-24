import { Injectable, inject } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { checkContextBudget, type ContextBudget } from '../../domain/ai/context-budget';
import type { StoryGenerationRequest } from '../../domain/ai/story-request';
import {
  paletteSizeFor,
  sampleWeightedPalette,
  type PaletteCandidate,
} from '../../domain/ai/suggestion-palette';
import { mergeSchedulingSignals } from '../../domain/anki/scheduling-signals';
import type { StoryForm } from '../../domain/reading/reading';
import type { SnapshotId, VocabularyItemId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import type { AnkiWordPriorityMode } from '../../domain/settings/settings';

/** Items read per streamed batch, matching the reader's classification path. */
const ITEM_BATCH_SIZE = 500;

export interface PreparedVocabulary {
  /** Deduplicated canonical expressions: the allowlist and validation authority. */
  readonly allowedVocabulary: readonly string[];
  /** Hidden inspiration sample; recorded in provenance, never displayed. */
  readonly suggestedVocabulary: readonly string[];
  readonly suggestedItemIds: readonly VocabularyItemId[];
  readonly uniqueExpressionCount: number;
}

/**
 * Builds the vocabulary half of a generation request.
 *
 * It streams the snapshot through the same bounded repository method the reader
 * uses rather than issuing a second whole-snapshot query, so a 1,800-entry
 * snapshot never exists as one array in two places at once.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyPreparationService {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly random = inject(RANDOM_SOURCE);

  /**
   * Reads the snapshot and samples a hidden palette.
   *
   * Deduplication is by canonical expression, because two Anki notes for the
   * same word are one word to the model and would otherwise weight the list.
   * The palette is sampled over item ids so provenance can name exactly what
   * was suggested, and the sampled expressions are what the prompt carries.
   */
  async prepare(
    snapshotId: SnapshotId,
    form: StoryForm,
    priorityMode: AnkiWordPriorityMode = 'uniform',
  ): Promise<Result<PreparedVocabulary, StorageError>> {
    const candidatesByExpression = new Map<string, PaletteCandidate>();

    for await (const batch of this.vocabulary.streamItems(snapshotId, ITEM_BATCH_SIZE)) {
      for (const item of batch) {
        if (item.canonicalExpression === '') {
          continue;
        }
        const existing = candidatesByExpression.get(item.canonicalExpression);
        if (existing === undefined) {
          candidatesByExpression.set(item.canonicalExpression, {
            id: item.id,
            ...mergeSchedulingSignals(undefined, item),
          });
        } else {
          candidatesByExpression.set(item.canonicalExpression, {
            ...existing,
            ...mergeSchedulingSignals(existing, item),
          });
        }
      }
    }

    const candidates = [...candidatesByExpression.values()];
    const expressionByItem = new Map(
      [...candidatesByExpression.entries()].map(([expression, candidate]) => [
        candidate.id,
        expression,
      ]),
    );
    const suggestedItemIds = sampleWeightedPalette(
      candidates,
      paletteSizeFor(form, candidates.length),
      priorityMode,
      this.random,
    );

    return ok({
      allowedVocabulary: [...candidatesByExpression.keys()],
      suggestedVocabulary: suggestedItemIds.map((id) => expressionByItem.get(id) ?? ''),
      suggestedItemIds,
      uniqueExpressionCount: candidates.length,
    });
  }

  /**
   * Refuses an assembled request that cannot fit, before it is paid for.
   *
   * Silently truncating would be worse than failing: the story would be written
   * against one vocabulary list and validated against another, and every
   * dropped word would come back as an unknown the learner cannot explain.
   */
  guardBudget(request: StoryGenerationRequest): Result<ContextBudget, AiError> {
    return checkContextBudget(request, 'story-generation');
  }
}
