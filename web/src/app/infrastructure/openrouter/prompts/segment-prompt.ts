import type { StorySegmentRequest } from '../../../domain/ai/story-request';
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

const TASK_LAYER = [
  'Role: Write one bounded segment of a planned controlled-Japanese story.',
  'Goal: Continue the same story through the assigned beat without restarting, recapping, or jumping ahead.',
  'Success criteria:',
  '- Aim for the supplied number of Japanese sentences, in reading order.',
  '- Follow the assigned beat while remaining consistent with the cumulative summary and preceding Japanese.',
  '- Preserve causal and temporal continuity, character state, viewpoint, tone, and register.',
  '- Avoid repetitive templates, disconnected vocabulary display, and an artificial ending unless this is the final segment.',
  'Output semantics: `sentences` is an array of Japanese sentences in reading order; `continuitySummaryEn` is a concise cumulative English summary for the next request and is not learner-visible.',
] as const;

const JSON_CONTRACT =
  'Return {"sentences":[string],"continuitySummaryEn":string}. Include no other fields.';

function storySettings(request: StorySegmentRequest['original']): string {
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

function blueprintSection(request: StorySegmentRequest): string {
  const segmentSections = request.blueprint.segments.map((segment) =>
    markdownDocument([
      markdownHeading(
        2,
        `Segment ${String(segment.index)} — ${String(segment.sentenceCount)} sentences`,
      ),
      markdownLineValue(segment.beatEn),
    ]),
  );
  return markdownDocument([
    markdownHeading(1, 'Story blueprint'),
    markdownField('Title', request.blueprint.titleJa),
    ...segmentSections,
  ]);
}

function currentSegmentSection(request: StorySegmentRequest): string {
  return markdownDocument([
    markdownHeading(1, 'Current segment'),
    markdownField('Index', String(request.segment.index)),
    markdownField('Requested sentences', String(request.segment.sentenceCount)),
    markdownField(
      'Final segment',
      request.segment.index === request.blueprint.segments.length - 1 ? 'yes' : 'no',
    ),
    markdownDocument([
      markdownHeading(2, 'Assigned beat'),
      markdownLineValue(request.segment.beatEn),
    ]),
  ]);
}

function continuitySection(request: StorySegmentRequest): string {
  return markdownDocument([
    markdownHeading(1, 'Continuity'),
    request.continuitySummaryEn === '' ? '' : markdownLineValue(request.continuitySummaryEn),
    request.precedingSentencesJa.length === 0
      ? ''
      : markdownDocument([
          markdownHeading(2, 'Previous Japanese sentences'),
          request.precedingSentencesJa.map((sentence) => markdownLineValue(sentence)).join('\n'),
        ]),
  ]);
}

export function buildSegmentPrompt(request: StorySegmentRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    STORY_POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
  ]);
  const user = assemble([
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
    premiseContext(request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asConfig('learner style', styleSection(request.original.specialInstructions)),
    asData('story blueprint', blueprintSection(request)),
    asConfig('current segment', currentSegmentSection(request)),
    asData('continuity context', continuitySection(request)),
  ]);
  return { system, user, jsonContract: JSON_CONTRACT };
}
