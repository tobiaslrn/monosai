import type { AiTask } from './ai-task';

/**
 * The sampling temperature each text task is sent with.
 *
 * Left unset, every task inherits whatever default the current provider and
 * routing happen to use, which differs per model and can change underneath a
 * learner without anything in Monosai changing. That sits badly with the rest
 * of the design: prompts are content-hashed and enrichment is cached by prompt
 * version, which only means something if the same input tends towards the same
 * output.
 *
 * Judgement tasks — translation, both reviews, planning, and repair — have one
 * right answer shape, so they are pinned low. Writing a story does not: the
 * suggestion palette exists precisely so that two runs of the same premise
 * differ, and that variety is now chosen rather than inherited.
 */
const TEMPERATURES: Partial<Record<AiTask, number>> = {
  'text-model-test': 0,
  'story-generation': 0.9,
  'story-repair': 0.2,
  'exception-review': 0,
  'grammar-review': 0.1,
  translation: 0.2,
};

/** Planning has one right shape even though it shares the story-generation task. */
export const STORY_BLUEPRINT_TEMPERATURE = 0.2;

/** The temperature for a task, or `undefined` when it has no text sampling. */
export function temperatureForTask(task: AiTask): number | undefined {
  return TEMPERATURES[task];
}
