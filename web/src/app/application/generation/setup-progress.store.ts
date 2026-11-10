import { Injectable, computed, inject } from '@angular/core';
import { TextModelStore } from '../settings/text-model.store';
import { SourceMappingStore } from '../vocabulary/source-mapping.store';
import { VocabularyAvailabilityStore } from '../vocabulary/vocabulary-availability.store';
import {
  allPrerequisitesMet,
  prerequisiteChecks,
  type PrerequisiteCheck,
} from './generation-prerequisites';

/**
 * How far a learner is through setting Monosai up to write: their words and a
 * tested text model.
 *
 * These are exactly the checks the Generate screen blocks on, read from the
 * same function, so the Library's first steps and Generate's blockers can
 * never disagree about what is still missing. The connection is left out: it
 * is a moment, not a step of setting up.
 */
@Injectable({ providedIn: 'root' })
export class SetupProgressStore {
  private readonly textModel = inject(TextModelStore);
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly wordSources = inject(SourceMappingStore);

  /** False until the words have been read, so nothing is judged on a guess. */
  readonly known = computed(() => this.vocabulary.state().kind !== 'unknown');

  readonly checks = computed<readonly PrerequisiteCheck[]>(() => {
    const state = this.vocabulary.state();
    return prerequisiteChecks({
      hasSources: this.wordSources.sources().length > 0,
      textModelReadiness: this.textModel.readiness(),
      structuredOutput: this.textModel.structuredOutput(),
      snapshot: state.kind === 'known' ? state.snapshot : null,
    });
  });

  readonly words = computed(() => this.check('vocabulary'));
  /** Nothing to read words from yet: no source and no words. */
  readonly startingFromNothing = computed(() => {
    const state = this.vocabulary.state();
    const snapshot = state.kind === 'known' ? state.snapshot : null;
    return snapshot === null && this.wordSources.sources().length === 0;
  });
  readonly textModelCheck = computed(() => this.check('text-model'));

  /** Both steps done: a story can be written. */
  readonly complete = computed(() => allPrerequisitesMet(this.checks()));

  /** Reads what the checks depend on that nothing else has read yet. */
  load(): void {
    void this.vocabulary.refresh();
    void this.wordSources.load();
  }

  private check(id: PrerequisiteCheck['id']): PrerequisiteCheck {
    const found = this.checks().find((check) => check.id === id);
    if (found === undefined) {
      throw new Error(`No ${id} check`);
    }
    return found;
  }
}
