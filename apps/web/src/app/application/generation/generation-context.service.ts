import { Injectable, inject } from '@angular/core';
import { aiError } from '../../domain/ai/ai-error';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { GrammarProfileSnapshot } from '../../domain/grammar/profile';
import type {
  AnkiWordPriorityMode,
  RecentFocusSize,
  VocabularyStrictness,
} from '../../domain/settings/settings';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { ExceptionPolicyStore } from '../settings/exception-policy.store';
import { GenerationSettingsStore } from '../settings/generation-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import type { GenerationFailure } from './generation-state';

/** The context captured before the first request and never re-read after it. */
export interface CapturedContext {
  readonly snapshot: VocabularySnapshot;
  readonly profile: GrammarProfileSnapshot;
  readonly policyText: string;
  readonly policyHash: string;
  readonly taskConfig: TextTaskConfig;
  readonly ankiWordPriorityMode: AnkiWordPriorityMode;
  readonly recentFocusSize: RecentFocusSize;
  readonly vocabularyStrictness: VocabularyStrictness;
  readonly repairBudget: number;
  /**
   * The aid layers the saved story declares. Captured like everything else
   * here, so switching the defaults while a story is being written changes the
   * next story rather than this one.
   */
  readonly preparationTargets: readonly PreparationLayer[];
}

/** Takes everything a run is judged against, once, before the run spends anything. */
@Injectable({ providedIn: 'root' })
export class GenerationContextService {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly policy = inject(ExceptionPolicyStore);
  private readonly generationSettings = inject(GenerationSettingsStore);
  private readonly textModel = inject(TextModelStore);

  /** Captures the snapshot, profile, policy, and model before anything is spent. */
  async capture(
    modelPresetId: string | null,
    ankiWordPriorityMode: AnkiWordPriorityMode,
    recentFocusSize: RecentFocusSize,
  ): Promise<
    | { readonly ok: true; readonly value: CapturedContext }
    | { readonly ok: false; readonly error: GenerationFailure }
  > {
    const vocabularyStrictness = this.generationSettings.vocabularyStrictness();
    const repairBudget = this.generationSettings.repairBudget();
    const preparationTargets = this.generationSettings.defaultPreparationTargets();
    const snapshot = await this.vocabulary.getActiveSnapshot();
    if (!snapshot.ok) {
      return { ok: false, error: snapshot.error };
    }
    if (snapshot.value === null) {
      return {
        ok: false,
        error: aiError('unknown', 'story-generation', 'There is no active vocabulary snapshot.', {
          detail: { issueCode: 'no-snapshot' },
        }),
      };
    }

    const profile = await this.grammar.captureProfile();
    if (!profile.ok) {
      return { ok: false, error: profile.error };
    }

    const settings = this.textModel.settings();
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForPreset'>>;
    const selected =
      modelPresetId === null
        ? (configurable.configForPreset?.(settings.activePresetId) ??
          (settings.modelId !== '' && settings.structuredOutput !== null
            ? {
                modelId: settings.modelId,
                reasoningEffort: settings.reasoningEffort,
                structuredOutput: settings.structuredOutput,
                storyTokenBudget: settings.storyTokenBudget,
              }
            : null))
        : (configurable.configForPreset?.(modelPresetId) ?? null);
    if (selected === null) {
      return {
        ok: false,
        error: aiError(
          'capability-unsupported',
          'story-generation',
          'No tested text model is available for generation.',
          { detail: { capability: 'structured-output' } },
        ),
      };
    }

    const policy = this.policy.policy();
    return {
      ok: true,
      value: {
        snapshot: snapshot.value,
        profile: profile.value,
        policyText: policy.text,
        policyHash: policy.policyHash,
        taskConfig: selected,
        ankiWordPriorityMode,
        recentFocusSize,
        vocabularyStrictness,
        repairBudget,
        preparationTargets,
      },
    };
  }
}
