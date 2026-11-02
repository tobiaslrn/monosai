import { Injectable, inject } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { checkContextBudget, type ContextBudget } from '../../domain/ai/context-budget';
import { selectRecentFocus, type FocusWord } from '../../domain/ai/recent-focus';
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
import { CLOCK, RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import {
  DEFAULT_RECENT_FOCUS_SIZE,
  type AnkiWordPriorityMode,
  type RecentFocusSize,
} from '../../domain/settings/settings';

/** Items read per streamed batch, matching the reader's classification path. */
const ITEM_BATCH_SIZE = 500;

export interface PreparedVocabulary {
  /** Deduplicated canonical expressions: the allowlist and validation authority. */
  readonly allowedVocabulary: readonly string[];
  /** Hidden inspiration sample; recorded in provenance, never displayed. */
  readonly suggestedVocabulary: readonly string[];
  readonly suggestedItemIds: readonly VocabularyItemId[];
  /** Newest words first; empty outside Recently learned or without dates. */
  readonly focusVocabulary: readonly FocusWord[];
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
  private readonly clock = inject(CLOCK);

  /**
   * Reads the snapshot, chooses a focus under Recently learned, and samples a
   * hidden palette.
   *
   * Deduplication is by canonical expression, because two Anki notes for the
   * same word are one word to the model and would otherwise weight the list.
   * The palette is sampled over item ids so provenance can name exactly what
   * was suggested, and the sampled expressions are what the prompt carries.
   *
   * Under Recently learned the palette is drawn uniformly from the words
   * outside the focus, so it still varies stories and nothing is sent twice.
   */
  async prepare(
    snapshotId: SnapshotId,
    form: StoryForm,
    priorityMode: AnkiWordPriorityMode = 'uniform',
    focusSize: RecentFocusSize = DEFAULT_RECENT_FOCUS_SIZE,
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

    const focusVocabulary =
      priorityMode === 'recent'
        ? selectRecentFocus(
            [...candidatesByExpression].map(([expression, candidate]) => ({
              ...candidate,
              expression,
            })),
            focusSize,
            this.clock.now(),
          )
        : [];
    const focused = new Set(focusVocabulary.map((word) => word.expression));

    const expressionByItem = new Map<VocabularyItemId, string>();
    const paletteCandidates: PaletteCandidate[] = [];
    for (const [expression, candidate] of candidatesByExpression) {
      expressionByItem.set(candidate.id, expression);
      if (!focused.has(expression)) {
        paletteCandidates.push(candidate);
      }
    }
    const suggestedItemIds = sampleWeightedPalette(
      paletteCandidates,
      paletteSizeFor(form, paletteCandidates.length),
      priorityMode === 'difficult' ? 'difficult' : 'uniform',
      this.random,
    );

    return ok({
      allowedVocabulary: [...candidatesByExpression.keys()],
      suggestedVocabulary: suggestedItemIds.map((id) => expressionByItem.get(id) ?? ''),
      suggestedItemIds,
      focusVocabulary,
      uniqueExpressionCount: candidatesByExpression.size,
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
