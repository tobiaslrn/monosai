import type { StoryRepairRequest } from '../../../domain/ai/text-generation-provider';
import { orderedSentences } from '../../../domain/ai/story-structure';
import {
  TITLE_INDEX,
  scopedRepairTargets,
  type ScopedRepairEntry,
} from '../../../domain/ai/repair-scope';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  assemble,
  jsonConfigBlock,
  jsonDataBlock,
  premiseContext,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

/** The one reason a span is listed, stated once instead of once per span. */
const DISALLOWED_REASON =
  'Every listed expression is outside the allowed vocabulary and was not approved by the learner exception policy.';

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
  '- Remove or rewrite every listed disallowed expression using only the vocabulary inventory. Do not keep it, gloss it, or evade validation by changing its script.',
  '- Keep the story near the requested length without adding disconnected filler.',
  '- Expressions listed under `alreadyAttempted` survived an earlier repair. Choose a different replacement for them rather than the one you would reach for first.',
  'Output semantics: return `titleJa` and `sentences` of `{ index, textJa }`, with indexes contiguous from 0 and one sentence per entry.',
] as const;

/** Versioned task instructions for replacing words without touching the rest. */
const SCOPED_TASK_LAYER = [
  'Role: Edit individual sentences of controlled Japanese reading material.',
  'Goal: Rewrite only the supplied target entries so that no disallowed expression remains.',
  'Success criteria:',
  '- Return one replacement for every target index, and no entry for any other index.',
  '- Remove or rewrite every disallowed expression in that entry using only the vocabulary inventory. Do not keep it, gloss it, or evade validation by changing its script.',
  '- Keep each replacement the same sentence: same meaning, role, viewpoint, register, and length as far as the vocabulary allows. Do not merge, split, or reorder sentences.',
  '- Stay consistent with the surrounding context entries, which are shown for continuity and must not be returned.',
  '- Expressions listed under `alreadyAttempted` survived an earlier repair. Choose a different replacement for them rather than the one you would reach for first.',
  'Output semantics: `replacements` contains `{ index, textJa }` using the exact indexes supplied as targets. `titleJa` is the rewritten title, or `null` when the title is not a target.',
] as const;

const JSON_CONTRACT =
  'Return {"titleJa":string,"sentences":[{"index":integer,"textJa":string}]}. Include no other fields.';

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
    jsonConfigBlock('repair requirements', {
      requestedSentenceCount: request.original.requestedSentenceCount,
      attempt: request.attempt,
      disallowedReason: DISALLOWED_REASON,
    }),
    premiseContext(request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style instructions', request.original.specialInstructions),
    jsonDataBlock('current story', {
      titleJa: request.candidate.titleJa,
      sentences: orderedSentences(request.candidate),
    }),
    jsonDataBlock('problems to fix', {
      structureIssues: request.structureIssues,
      disallowedExpressions: request.unknownSpans.map((span) => ({
        sentenceIndex: span.sentenceIndex,
        surface: span.surface,
      })),
      alreadyAttempted: request.previouslyAttempted,
    }),
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
    jsonConfigBlock('repair requirements', {
      attempt: request.attempt,
      disallowedReason: DISALLOWED_REASON,
      titleIndex: TITLE_INDEX,
      targetIndexes: scopedRepairTargets(entries).map((entry) => entry.index),
    }),
    premiseContext(request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style instructions', request.original.specialInstructions),
    jsonDataBlock(
      'story window in reading order',
      entries.map((entry) => ({
        index: entry.index,
        textJa: entry.textJa,
        ...(entry.surfaces.length === 0 ? {} : { disallowedExpressions: entry.surfaces }),
      })),
    ),
    jsonDataBlock('problems to fix', { alreadyAttempted: request.previouslyAttempted }),
  ]);

  return { system, user, jsonContract: SCOPED_JSON_CONTRACT };
}

/** The learner settings both repair shapes send, in the same order. */
function sharedConfigBlocks(request: StoryRepairRequest): readonly string[] {
  return [
    jsonConfigBlock('grammar profile', {
      guidance: request.original.grammarGuidance,
      register: request.original.registerPreference,
    }),
    jsonConfigBlock(
      'vocabulary inventory',
      vocabularyInventory(
        request.original.allowedVocabulary,
        request.original.suggestedVocabulary,
        request.original.structuralBaseline,
      ),
    ),
  ];
}
