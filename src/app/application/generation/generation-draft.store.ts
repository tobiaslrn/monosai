import { Injectable, computed, signal } from '@angular/core';
import {
  MAX_PREMISE_LENGTH,
  MAX_SPECIAL_INSTRUCTIONS_LENGTH,
  DEFAULT_STORY_SENTENCES,
  normalizeStorySentenceCount,
  countCodePoints,
  validateStoryInput,
  type StoryInputDraft,
} from '../../domain/ai/story-request';

/**
 * What the learner has typed into the Generate form.
 *
 * It is provided at the root, unlike `GenerationStore`, for one reason: a
 * failed prerequisite links to Settings, Vocabulary, or Grammar, and the
 * specification requires the draft to survive that trip. Work in flight does
 * not — that lives in the page-scoped store and is discarded on leaving.
 *
 * Nothing here is persisted. A draft is a few seconds of typing, and writing it
 * to storage would outlive the intent it came from.
 */
@Injectable({ providedIn: 'root' })
export class GenerationDraftStore {
  private readonly sentenceCountSignal = signal(DEFAULT_STORY_SENTENCES);
  private readonly premiseSignal = signal('');
  private readonly instructionsSignal = signal('');

  readonly sentenceCount = this.sentenceCountSignal.asReadonly();
  readonly premise = this.premiseSignal.asReadonly();
  readonly specialInstructions = this.instructionsSignal.asReadonly();

  readonly premiseLength = computed(() => countCodePoints(this.premiseSignal()));
  readonly instructionsLength = computed(() => countCodePoints(this.instructionsSignal()));
  readonly premiseLimit = MAX_PREMISE_LENGTH;
  readonly instructionsLimit = MAX_SPECIAL_INSTRUCTIONS_LENGTH;

  readonly input = computed<StoryInputDraft>(() => ({
    premise: this.premiseSignal(),
    ...(this.instructionsSignal().trim() === ''
      ? {}
      : { specialInstructions: this.instructionsSignal() }),
  }));

  readonly isValid = computed(() => validateStoryInput(this.input()).ok);

  /** The issues to show beside the fields, empty while the draft is usable. */
  readonly issues = computed(() => {
    const validated = validateStoryInput(this.input());
    return validated.ok ? [] : validated.error;
  });

  setSentenceCount(sentenceCount: number): void {
    this.sentenceCountSignal.set(normalizeStorySentenceCount(sentenceCount));
  }

  setPremise(premise: string): void {
    this.premiseSignal.set(premise);
  }

  setSpecialInstructions(instructions: string): void {
    this.instructionsSignal.set(instructions);
  }

  clear(): void {
    this.sentenceCountSignal.set(DEFAULT_STORY_SENTENCES);
    this.premiseSignal.set('');
    this.instructionsSignal.set('');
  }
}
