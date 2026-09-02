import type { StoryGenerationRequest } from '../../../domain/ai/story-request';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  asData,
  assemble,
  jsonConfigBlock,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for writing a fresh story. */
const TASK_LAYER = [
  'Role: Write controlled Japanese reading material for one learner.',
  'Goal: Write one coherent story that follows the supplied premise and constraints.',
  'Success criteria:',
  '- Aim for `requestedSentenceCount` sentences. Treat it as a length target while keeping the story coherent.',
  '- Give the story a recognizable beginning, development, and ending, with causal or temporal continuity.',
  '- Keep the Japanese natural within the learner constraints. Avoid repetitive sentence templates and do not showcase vocabulary or grammar for its own sake.',
  '- Stay faithful to the premise and any compatible learner style instructions.',
  'Output semantics:',
  '- `titleJa` is a short Japanese title governed by the same vocabulary and grammar constraints.',
  '- `sentences` is in reading order and contains `{ index, textJa }`, with indexes starting at 0 and contiguous.',
  'One sentence per array entry. Do not put two sentences in one entry and do not split one sentence across entries.',
] as const;

const JSON_CONTRACT =
  'Return {"titleJa":string,"sentences":[{"index":integer,"textJa":string}]}. Include no other fields.';

export function buildStoryPrompt(request: StoryGenerationRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);

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
    jsonConfigBlock('story requirements', {
      requestedSentenceCount: request.requestedSentenceCount,
    }),
    asData('premise', request.premise),
    request.specialInstructions === undefined
      ? ''
      : asConfig('learner style instructions', request.specialInstructions),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
