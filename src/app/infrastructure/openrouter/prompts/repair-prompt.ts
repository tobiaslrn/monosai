import type { StoryRepairRequest } from '../../../domain/ai/text-generation-provider';
import { orderedSentences } from '../../../domain/ai/story-structure';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asData,
  assemble,
  jsonDataBlock,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

/**
 * Versioned task instructions for a targeted repair.
 *
 * The model is asked for the whole story back rather than a patch, because
 * nothing returned here is trusted: the reply is reparsed and revalidated from
 * scratch, and a patch would only invite partial application.
 */
const TASK_LAYER = [
  'Role: Edit controlled Japanese reading material without weakening its constraints.',
  'Goal: Return the complete repaired story, changing only what is needed to fix every supplied problem.',
  'Success criteria:',
  '- Preserve already-valid wording, premise, meaning, ordering, register, and narrative continuity wherever possible.',
  '- Remove or rewrite every listed disallowed expression using only the vocabulary inventory. Do not keep it, gloss it, or evade validation by changing its script.',
  '- Restore the exact requested sentence count and keep the result coherent rather than appending disconnected filler.',
  'Output semantics: return `titleJa` and `sentences` of `{ index, textJa }`, with indexes contiguous from 0 and one sentence per entry.',
] as const;

const JSON_CONTRACT =
  'Return {"titleJa":string,"sentences":[{"index":integer,"textJa":string}]}. Include no other fields.';

export function buildRepairPrompt(request: StoryRepairRequest): AssembledPrompt {
  const range = request.original.sentenceRange;
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);

  const user = assemble([
    jsonDataBlock('grammar profile', {
      guidance: request.original.grammarGuidance,
      register: request.original.registerPreference,
    }),
    jsonDataBlock(
      'vocabulary inventory',
      vocabularyInventory(
        request.original.allowedVocabulary,
        request.original.suggestedVocabulary,
        request.original.structuralBaseline,
      ),
    ),
    jsonDataBlock('repair requirements', {
      form: request.original.form,
      sentenceCount: { min: range.min, max: range.max },
    }),
    asData('premise', request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asData('learner style instructions', request.original.specialInstructions),
    jsonDataBlock('current story', {
      titleJa: request.candidate.titleJa,
      sentences: orderedSentences(request.candidate),
    }),
    jsonDataBlock('problems to fix', {
      structureIssues: request.structureIssues,
      disallowedExpressions: request.unknownSpans,
    }),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
