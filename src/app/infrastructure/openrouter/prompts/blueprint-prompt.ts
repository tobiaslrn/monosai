import type { StoryGenerationRequest, StorySegmentPlan } from '../../../domain/ai/story-request';
import {
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asData,
  assemble,
  jsonDataBlock,
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
  'Output semantics: `titleJa` is the final Japanese title; `segments` contains `{ index, sentenceCount, beatEn }`.',
] as const;

const JSON_CONTRACT =
  'Return {"titleJa":string,"segments":[{"index":integer,"sentenceCount":integer,"beatEn":string}]}. Include no other fields.';

export function buildBlueprintPrompt(
  request: StoryGenerationRequest,
  segments: readonly StorySegmentPlan[],
): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, STORY_POLICY_LAYER, TASK_LAYER.join('\n')]);
  const user = assemble([
    jsonDataBlock('grammar profile', {
      guidance: request.grammarGuidance,
      register: request.registerPreference,
    }),
    jsonDataBlock(
      'vocabulary inventory',
      vocabularyInventory(
        request.allowedVocabulary,
        request.suggestedVocabulary,
        request.structuralBaseline,
      ),
    ),
    jsonDataBlock('required segment plan', segments),
    jsonDataBlock('story requirements', {
      form: request.form,
      totalSentenceCount: request.sentenceRange.min,
    }),
    asData('premise', request.premise),
    request.specialInstructions === undefined
      ? ''
      : asData('learner style instructions', request.specialInstructions),
  ]);
  return { system, user, jsonContract: JSON_CONTRACT };
}
