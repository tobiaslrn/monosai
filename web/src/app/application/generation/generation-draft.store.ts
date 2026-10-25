import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EMPTY_STORY_DIRECTION,
  addCustomOption,
  clearAxis,
  surpriseDirection,
  toggleOption,
  type CustomOptionIssue,
  type StoryDirection,
} from '../../domain/ai/story-direction';
import type { StoryAxis } from '../../domain/ai/story-direction-options';
import {
  MAX_SPECIAL_INSTRUCTIONS_LENGTH,
  DEFAULT_STORY_SENTENCES,
  normalizeStorySentenceCount,
  countCodePoints,
  validateStoryInput,
} from '../../domain/ai/story-request';
import type { Result } from '../../domain/shared/result';
import { RANDOM_SOURCE } from '../shared/repository-tokens';

/** The three steps of the story form: words, direction, plot. */
export type GenerationStep = 1 | 2 | 3;

/**
 * What the learner has chosen on the Generate form.
 *
 * It is provided at the root, unlike `GenerationStore`, for one reason: a
 * failed prerequisite links to Settings, Vocabulary, or Grammar, and the
 * specification requires the draft to survive that trip. Work in flight does
 * not — that lives in the page-scoped store and is discarded on leaving.
 *
 * The direction outlives a story on purpose: the next one starts from the same
 * choices, so a repeat story is Next, Next, Generate. Only the step goes back
 * to the start. Nothing here is persisted; a draft belongs to this session.
 */
@Injectable({ providedIn: 'root' })
export class GenerationDraftStore {
  private readonly random = inject(RANDOM_SOURCE);

  private readonly sentenceCountSignal = signal(DEFAULT_STORY_SENTENCES);
  private readonly instructionsSignal = signal('');
  private readonly stepSignal = signal<GenerationStep>(1);
  private readonly directionSignal = signal<StoryDirection>(EMPTY_STORY_DIRECTION);

  readonly sentenceCount = this.sentenceCountSignal.asReadonly();
  readonly specialInstructions = this.instructionsSignal.asReadonly();
  readonly step = this.stepSignal.asReadonly();
  readonly direction = this.directionSignal.asReadonly();

  readonly instructionsLength = computed(() => countCodePoints(this.instructionsSignal()));
  readonly instructionsLimit = MAX_SPECIAL_INSTRUCTIONS_LENGTH;

  /** The instructions are the one free text before the plot, and they have a limit. */
  readonly isValid = computed(
    () => validateStoryInput({ premise: '', specialInstructions: this.instructionsSignal() }).ok,
  );

  setSentenceCount(sentenceCount: number): void {
    this.sentenceCountSignal.set(normalizeStorySentenceCount(sentenceCount));
  }

  setSpecialInstructions(instructions: string): void {
    this.instructionsSignal.set(instructions);
  }

  setStep(step: GenerationStep): void {
    this.stepSignal.set(step);
  }

  toggleOption(axis: StoryAxis, value: string): void {
    this.directionSignal.update((direction) => toggleOption(direction, axis, value));
  }

  clearAxis(axis: StoryAxis): void {
    this.directionSignal.update((direction) => clearAxis(direction, axis));
  }

  addCustomOption(axis: StoryAxis, text: string): Result<StoryDirection, CustomOptionIssue> {
    const added = addCustomOption(this.directionSignal(), axis, text);
    if (added.ok) {
      this.directionSignal.set(added.value);
    }
    return added;
  }

  surprise(): void {
    this.directionSignal.update((direction) => surpriseDirection(direction, this.random));
  }

  /** A story was started: the next one begins at the words, with the same choices. */
  storyStarted(): void {
    this.stepSignal.set(1);
  }

  clear(): void {
    this.sentenceCountSignal.set(DEFAULT_STORY_SENTENCES);
    this.instructionsSignal.set('');
    this.stepSignal.set(1);
    this.directionSignal.set(EMPTY_STORY_DIRECTION);
  }
}
