import type { StoryGenerationRequest, StorySegmentPlan } from '../../../domain/ai/story-request';
import {
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  asData,
  assemble,
  jsonConfigBlock,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

const TASK_LAYER = [
  'Role: Plan a long controlled-Japanese story before its Japanese segments are written.',
  'Goal: Create one short Japanese title and one concise English story beat for every supplied segment.',
  'Success criteria:',
  '- Preserve the supplied segment indexes and sentence counts exactly and in order.',
  '- Make the beats form one coherent beginning, development, and ending faithful to the premise.',
  '- Keep each beat concrete enough to guide its segment without scripting individual sentences.',
  '- The Japanese title follows the supplied vocabulary, grammar, and register constraints. English beat descriptions are planning data and are not subject to the Japanese allowlist.',
  // The Japanese-output layer is deliberately absent here, because the beats
  // are English by design. The one Japanese string this task produces still
  // needs the guard, so it is stated for that field alone.
  '- Write `titleJa` as natural Japanese only: no romaji, no furigana, no translation, and no parenthetical gloss.',
  'Output semantics: `titleJa` is the final Japanese title; `segments` contains `{ index, sentenceCount, beatEn }`. A beat is one or two plain English sentences.',
] as const;

const JSON_CONTRACT =
  'Return {"titleJa":string,"segments":[{"index":integer,"sentenceCount":integer,"beatEn":string}]}. Include no other fields.';

export function buildBlueprintPrompt(
  request: StoryGenerationRequest,
  segments: readonly StorySegmentPlan[],
): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, STORY_POLICY_LAYER, TASK_LAYER.join('\n')]);
  const user = assemble([
    jsonConfigBlock('grammar profile', {
      guidance: request.grammarGuidance,
      register: request.registerPreference,
    }),
    jsonConfigBlock(
      'vocabulary inventory',
      vocabularyInventory(
        request.allowedVocabulary,
        request.suggestedVocabulary,
        request.structuralBaseline,
      ),
    ),
    jsonConfigBlock('required segment plan', segments),
    jsonConfigBlock('story requirements', {
      sentenceCount: { min: request.sentenceRange.min, max: request.sentenceRange.max },
    }),
    asData('premise', request.premise),
    request.specialInstructions === undefined
      ? ''
      : asConfig('learner style instructions', request.specialInstructions),
  ]);
  return { system, user, jsonContract: JSON_CONTRACT };
}
