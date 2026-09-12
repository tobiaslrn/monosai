import type { StoryGenerationRequest, StorySegmentPlan } from '../../../domain/ai/story-request';
import {
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  assemble,
  exceptionPolicySection,
  markdownBulletedList,
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownLineValue,
  premiseSection,
  renderVocabularyMarkdown,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

const TASK_LAYER = [
  'Role: Plan a long controlled-Japanese story before its Japanese segments are written.',
  'Goal: Create one short Japanese title and one concise English story beat for every supplied segment.',
  'Success criteria:',
  '- Create exactly one beat for every supplied segment, in the supplied order.',
  '- Make the beats form one coherent beginning, development, and ending faithful to the premise.',
  '- Keep each beat concrete enough to guide its segment without scripting individual sentences.',
  '- The Japanese title follows the supplied vocabulary, grammar, and register constraints. English beat descriptions are planning data and are not subject to the Japanese allowlist.',
  // The Japanese-output layer is deliberately absent here, because the beats
  // are English by design. The one Japanese string this task produces still
  // needs the guard, so it is stated for that field alone.
  '- Write `titleJa` as natural Japanese only: no romaji, no furigana, no translation, and no parenthetical gloss.',
  'Output semantics: `titleJa` is the final Japanese title; `beatsEn` contains one or two plain English sentences for each supplied segment, in order.',
] as const;

const JSON_CONTRACT = 'Return {"titleJa":string,"beatsEn":[string]}. Include no other fields.';

function storySettings(request: StoryGenerationRequest): string {
  return markdownDocument([
    markdownHeading(1, 'Story requirements'),
    markdownField('Requested sentence count', String(request.requestedSentenceCount)),
    markdownHeading(1, 'Grammar'),
    markdownField('Register', request.registerPreference),
    markdownDocument([markdownHeading(2, 'Guidance'), markdownLineValue(request.grammarGuidance)]),
  ]);
}

function segmentPlan(segments: readonly StorySegmentPlan[]): string {
  return markdownBulletedList(
    'Required segment plan',
    segments.map(
      (segment) => `Segment ${String(segment.index)}: ${String(segment.sentenceCount)} sentences`,
    ),
  );
}

function styleSection(instructions: string): string {
  return markdownDocument([markdownHeading(1, 'Learner style'), markdownLineValue(instructions)]);
}

export function buildBlueprintPrompt(
  request: StoryGenerationRequest,
  segments: readonly StorySegmentPlan[],
): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, STORY_POLICY_LAYER, TASK_LAYER.join('\n')]);
  const user = assemble([
    asConfig('story settings', storySettings(request)),
    asConfig(
      'vocabulary inventory',
      renderVocabularyMarkdown(
        vocabularyInventory(
          request.allowedVocabulary,
          request.suggestedVocabulary,
          request.structuralBaseline,
          request.focusVocabulary,
        ),
      ),
    ),
    exceptionPolicySection(request.exceptionPolicy),
    asConfig('segment plan', segmentPlan(segments)),
    premiseSection(request.premise),
    request.specialInstructions === undefined
      ? ''
      : asConfig('learner style', styleSection(request.specialInstructions)),
  ]);
  return { system, user, jsonContract: JSON_CONTRACT };
}
