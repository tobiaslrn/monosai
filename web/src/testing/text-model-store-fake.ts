import type { Signal } from '@angular/core';

/** The parts of the stored text-model settings a job's `plan` reads. */
export interface FakeTextModelSettings {
  readonly modelId: string;
  readonly reasoningEffort?: string | null;
  readonly structuredOutput?: 'native-schema' | 'json-contract' | null | undefined;
  readonly storyTokenBudget: number;
}

/**
 * A `TextModelStore` stand-in whose task configuration follows its settings.
 *
 * Every text lane resolves its model through `configForTask`, so a fake that
 * only exposes `settings` would let a store pass its tests while asking for a
 * model the real screens never selected. Deriving one from the other keeps a
 * spec that flips `modelId` or `structuredOutput` meaningful.
 */
export function fakeTextModelStore(settings: Signal<FakeTextModelSettings>): {
  readonly settings: Signal<FakeTextModelSettings>;
  configForTask(): {
    readonly modelId: string;
    readonly reasoningEffort: string | null;
    readonly structuredOutput: 'native-schema' | 'json-contract';
    readonly storyTokenBudget: number;
  } | null;
  requiresJsonContract(): boolean;
  recordStructuredOutputDowngrade(): Promise<void>;
} {
  return {
    settings,
    configForTask: () => {
      const current = settings();
      const structuredOutput = current.structuredOutput ?? null;
      if (current.modelId === '' || structuredOutput === null) {
        return null;
      }
      return {
        modelId: current.modelId,
        reasoningEffort: current.reasoningEffort ?? null,
        structuredOutput,
        storyTokenBudget: current.storyTokenBudget,
      };
    },
    requiresJsonContract: () => false,
    recordStructuredOutputDowngrade: () => Promise.resolve(),
  };
}
