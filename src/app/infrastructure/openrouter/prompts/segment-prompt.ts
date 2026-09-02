import type { StorySegmentRequest } from '../../../domain/ai/story-request';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  asData,
  assemble,
  jsonConfigBlock,
  jsonDataBlock,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

const TASK_LAYER = [
  'Role: Write one bounded segment of a planned controlled-Japanese story.',
  'Goal: Continue the same story through the assigned beat without restarting, recapping, or jumping ahead.',
  'Success criteria:',
  '- Aim for the supplied number of Japanese sentences, with local indexes contiguous from 0.',
  '- Follow the assigned beat while remaining consistent with the cumulative summary and preceding Japanese.',
  '- Preserve causal and temporal continuity, character state, viewpoint, tone, and register.',
  '- Avoid repetitive templates, disconnected vocabulary display, and an artificial ending unless this is the final segment.',
  'Output semantics: `sentences` contains `{ index, textJa }`; `continuitySummaryEn` is a concise cumulative English summary for the next request and is not learner-visible.',
] as const;

const JSON_CONTRACT =
  'Return {"sentences":[{"index":integer,"textJa":string}],"continuitySummaryEn":string}. Include no other fields.';

export function buildSegmentPrompt(request: StorySegmentRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);
  const user = assemble([
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
    jsonDataBlock('story blueprint', request.blueprint),
    jsonConfigBlock('current segment', {
      index: request.segment.index,
      sentenceCount: request.segment.sentenceCount,
      beatEn: request.segment.beatEn,
      finalSegment: request.segment.index === request.blueprint.segments.length - 1,
    }),
    jsonDataBlock('continuity context', {
      continuitySummaryEn: request.continuitySummaryEn,
      precedingSentencesJa: request.precedingSentencesJa,
    }),
    asData('premise', request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style instructions', request.original.specialInstructions),
  ]);
  return { system, user, jsonContract: JSON_CONTRACT };
}
