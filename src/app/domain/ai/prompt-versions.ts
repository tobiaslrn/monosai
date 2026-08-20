/**
 * Versioned identifiers for the internal prompt assets.
 *
 * Provenance records these rather than the assembled prompt: the full text is
 * large, contains the learner's own words, and would be a second copy of data
 * the story already holds. A version is enough to say which instructions
 * produced a story, which is what reproducing or explaining one needs.
 *
 * Bump an entry whenever its prompt changes what the model is asked to do.
 * Bumping is not free — it makes previously generated stories describable only
 * by a version that is no longer in the build — so a copyedit that cannot
 * change behaviour keeps its version.
 */
export const PROMPT_VERSIONS = {
  story: 'story/1',
  repair: 'repair/1',
  'exception-review': 'exception-review/1',
  grammar: 'grammar/1',
  translation: 'translation/1',
} as const;

export type PromptTaskName = keyof typeof PROMPT_VERSIONS;

export const ALL_PROMPT_TASK_NAMES: readonly PromptTaskName[] = [
  'story',
  'repair',
  'exception-review',
  'grammar',
  'translation',
];

/** The map stored in provenance, as a plain record the row schema accepts. */
export function promptVersionRecord(): Readonly<Record<string, string>> {
  return { ...PROMPT_VERSIONS };
}
