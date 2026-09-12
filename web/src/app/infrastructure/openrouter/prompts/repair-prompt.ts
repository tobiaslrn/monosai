import type { StoryRepairRequest } from '../../../domain/ai/text-generation-provider';
import { TITLE_INDEX, type ScopedRepairEntry } from '../../../domain/ai/repair-scope';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asData,
  asConfig,
  assemble,
  exceptionPolicySection,
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownLineValue,
  premiseContext,
  renderVocabularyMarkdown,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

/**
 * Versioned task instructions for a repair that also fixes the story's shape.
 *
 * The whole story is asked for here because the problems include its length,
 * which no per-sentence edit can fix. A repair that only has to replace words
 * uses the scoped task below instead.
 */
const TASK_LAYER = [
  'Role: Edit controlled Japanese reading material without weakening its constraints.',
  'Goal: Return the complete repaired story, changing only what is needed to fix every supplied problem.',
  'Success criteria:',
  '- Preserve already-valid wording, premise, meaning, ordering, register, and narrative continuity wherever possible.',
  '- Remove or rewrite every listed disallowed expression using only the vocabulary inventory or expressions the learner exception policy clearly allows. Do not keep it, gloss it, or evade validation by changing its script.',
  '- Keep the story near the requested length without adding disconnected filler.',
  '- Expressions listed under Already attempted expressions survived an earlier repair. Choose a different replacement for them rather than the one you would reach for first.',
  'Output semantics: return `titleJa` and a sentences array in reading order, with one Japanese sentence per entry.',
] as const;

/** Versioned task instructions for replacing words without touching the rest. */
const SCOPED_TASK_LAYER = [
  'Role: Edit individual sentences of controlled Japanese reading material.',
  'Goal: Rewrite only the supplied target entries so that no disallowed expression remains.',
  'Success criteria:',
  '- Return one replacement for every target index, and no entry for any other index.',
  '- Remove or rewrite every disallowed expression in that entry using only the vocabulary inventory or expressions the learner exception policy clearly allows. Do not keep it, gloss it, or evade validation by changing its script.',
  '- Keep each replacement the same sentence: same meaning, role, viewpoint, register, and length as far as the vocabulary allows. Do not merge, split, or reorder sentences.',
  '- Stay consistent with the surrounding context entries, which are shown for continuity and must not be returned.',
  '- Expressions listed under Already attempted expressions survived an earlier repair. Choose a different replacement for them rather than the one you would reach for first.',
  'Output semantics: `replacements` contains `{ index, textJa }` using the exact indexes supplied as targets. `titleJa` is the rewritten title, or `null` when the title is not a target.',
] as const;

const JSON_CONTRACT = 'Return {"titleJa":string,"sentences":[string]}. Include no other fields.';

const SCOPED_JSON_CONTRACT =
  'Return {"titleJa":string|null,"replacements":[{"index":integer,"textJa":string}]}. Include no other fields.';

export function buildRepairPrompt(request: StoryRepairRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);

  const user = assemble([
    ...sharedConfigBlocks(request),
    premiseContext(request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style', styleSection(request.original.specialInstructions)),
    asData('current story', currentStorySection(request)),
    asData('problems to fix', problemsSection(request)),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}

export function buildScopedRepairPrompt(
  request: StoryRepairRequest,
  entries: readonly ScopedRepairEntry[],
): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    SCOPED_TASK_LAYER.join('\n'),
  ]);

  const user = assemble([
    ...sharedConfigBlocks(request),
    premiseContext(request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style', styleSection(request.original.specialInstructions)),
    asData('story window', storyWindowSection(entries)),
    previousAttemptsSection(request.previouslyAttempted),
  ]);

  return { system, user, jsonContract: SCOPED_JSON_CONTRACT };
}

/** The learner settings both repair shapes send, in the same order. */
function sharedConfigBlocks(request: StoryRepairRequest): readonly string[] {
  return [
    asConfig('story settings', storySettings(request.original)),
    asConfig(
      'vocabulary inventory',
      renderVocabularyMarkdown(
        vocabularyInventory(
          request.original.allowedVocabulary,
          request.original.suggestedVocabulary,
          request.original.structuralBaseline,
          request.original.focusVocabulary,
        ),
      ),
    ),
    exceptionPolicySection(request.original.exceptionPolicy),
  ];
}

function storySettings(request: StoryRepairRequest['original']): string {
  return markdownDocument([
    markdownHeading(1, 'Story requirements'),
    markdownField('Requested sentence count', String(request.requestedSentenceCount)),
    markdownHeading(1, 'Grammar'),
    markdownField('Register', request.registerPreference),
    markdownDocument([markdownHeading(2, 'Guidance'), markdownLineValue(request.grammarGuidance)]),
  ]);
}

function styleSection(instructions: string): string {
  return markdownDocument([markdownHeading(1, 'Learner style'), markdownLineValue(instructions)]);
}

function currentStorySection(request: StoryRepairRequest): string {
  const sentences = [...request.candidate.sentences]
    .sort((left, right) => left.index - right.index)
    .map((sentence) => `[${String(sentence.index)}] ${markdownLineValue(sentence.textJa)}`);
  return markdownDocument([
    markdownHeading(1, 'Current story'),
    markdownDocument([markdownHeading(2, 'Title'), markdownLineValue(request.candidate.titleJa)]),
    markdownDocument([markdownHeading(2, 'Sentences'), sentences.join('\n')]),
  ]);
}

function problemsSection(request: StoryRepairRequest): string {
  const structureIssues = request.structureIssues.map((issue) => `${issue.code}: ${issue.message}`);
  const disallowed = request.unknownSpans.map((span) =>
    span.sentenceIndex === null
      ? `Title: ${span.surface}`
      : `Sentence ${String(span.sentenceIndex)}: ${span.surface}`,
  );
  return markdownDocument([
    markdownHeading(1, 'Problems to fix'),
    linesSection('Structure issues', structureIssues, 2, true),
    linesSection('Disallowed expressions', disallowed, 2, true),
    linesSection('Already attempted expressions', request.previouslyAttempted, 2, false),
  ]);
}

function storyWindowSection(entries: readonly ScopedRepairEntry[]): string {
  const context = entries.filter((entry) => entry.surfaces.length === 0);
  const targets = entries.filter((entry) => entry.surfaces.length > 0);
  const targetLines = targets.flatMap((entry) => [
    entry.index === TITLE_INDEX
      ? `Title: ${markdownLineValue(entry.textJa)}`
      : `[${String(entry.index)}] ${markdownLineValue(entry.textJa)}`,
    ...entry.surfaces.map((surface) => `Remove: ${markdownLineValue(surface)}`),
  ]);
  return markdownDocument([
    markdownHeading(1, 'Story window'),
    linesSection(
      'Context',
      context.map((entry) => `[${String(entry.index)}] ${markdownLineValue(entry.textJa)}`),
      2,
      false,
    ),
    markdownDocument([markdownHeading(2, 'Targets'), targetLines.join('\n')]),
  ]);
}

function previousAttemptsSection(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }
  return asData(
    'previous attempts',
    markdownDocument([
      markdownHeading(1, 'Already attempted expressions'),
      values.map((value) => markdownLineValue(value)).join('\n'),
    ]),
  );
}

function linesSection(
  heading: string,
  values: readonly string[],
  level: number,
  bullets: boolean,
): string {
  if (values.length === 0) {
    return '';
  }
  return markdownDocument([
    markdownHeading(level, heading),
    values.map((value) => `${bullets ? '- ' : ''}${markdownLineValue(value)}`).join('\n'),
  ]);
}
