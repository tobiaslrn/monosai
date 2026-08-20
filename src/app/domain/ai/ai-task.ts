/**
 * The outbound provider tasks that exist today.
 *
 * Every `AiError` names the task it came from, because the same transport
 * failure needs different recovery wording depending on what was being
 * attempted. The union grows one entry per milestone as generation,
 * translation, grammar review, and synthesis arrive; it is deliberately not
 * declared ahead of the code that uses it.
 */
export type AiTask =
  | 'text-model-test'
  | 'tts-test'
  | 'story-generation'
  | 'story-repair'
  | 'exception-review'
  | 'grammar-review'
  | 'translation';

export const ALL_AI_TASKS: readonly AiTask[] = [
  'text-model-test',
  'tts-test',
  'story-generation',
  'story-repair',
  'exception-review',
  'grammar-review',
  'translation',
];
