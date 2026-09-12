import type { StoryGenerationRequest } from '../../../domain/ai/story-request';
import {
  JAPANESE_OUTPUT_LAYER,
  PROTOCOL_LAYER,
  STORY_POLICY_LAYER,
  asConfig,
  assemble,
  exceptionPolicySection,
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownLineValue,
  premiseSection,
  renderVocabularyMarkdown,
  vocabularyInventory,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for writing a fresh story. */
const TASK_LAYER = [
  'Role: Write controlled Japanese reading material for one learner.',
  'Goal: Write one coherent story that follows the supplied premise and constraints.',
  'Success criteria:',
  '- Aim for the requested sentence count. Treat it as a length target while keeping the story coherent.',
  '- Give the story a recognizable beginning, development, and ending, with causal or temporal continuity.',
  '- Keep the Japanese natural within the learner constraints. Avoid repetitive sentence templates and do not showcase vocabulary or grammar for its own sake.',
  '- Stay faithful to the premise and any compatible learner style instructions.',
  'Output semantics:',
  '- `titleJa` is a short Japanese title governed by the same vocabulary and grammar constraints.',
  '- `sentences` is an array of Japanese sentences in reading order.',
  'Put exactly one sentence in each array entry. Do not put two sentences in one entry or split one sentence across entries.',
] as const;

const JSON_CONTRACT = 'Return {"titleJa":string,"sentences":[string]}. Include no other fields.';

function storySettings(request: StoryGenerationRequest): string {
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

export function buildStoryPrompt(request: StoryGenerationRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);

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
    premiseSection(request.premise),
    request.specialInstructions === undefined
      ? ''
      : asConfig('learner style', styleSection(request.specialInstructions)),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
