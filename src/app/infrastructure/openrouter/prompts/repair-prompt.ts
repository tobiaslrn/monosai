import type { StoryRepairRequest } from '../../../domain/ai/text-generation-provider';
import { orderedSentences } from '../../../domain/ai/story-structure';
import {
  JAPANESE_OUTPUT_LAYER,
  POLICY_LAYER,
  PROTOCOL_LAYER,
  asData,
  assemble,
  listBlock,
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
  'Task: repair a story you previously wrote so that it satisfies the vocabulary and structure rules.',
  'Change the smallest amount of text that fixes the listed problems. Preserve the premise, the meaning, the ordering, and the story form.',
  'Return the complete story in the same schema as before: `titleJa` plus `sentences` of `{ index, textJa }`, indexes contiguous from 0.',
  'Replace every listed word with something the allowed vocabulary covers. Do not keep it, gloss it, or write it in kana instead.',
] as const;

export function buildRepairPrompt(request: StoryRepairRequest): AssembledPrompt {
  const range = request.original.sentenceRange;
  const system = assemble([
    PROTOCOL_LAYER,
    POLICY_LAYER,
    JAPANESE_OUTPUT_LAYER,
    TASK_LAYER.join('\n'),
    `The repaired story must contain between ${String(range.min)} and ${String(range.max)} sentences.`,
  ]);

  const problems = [
    ...request.structureIssues.map((issue) => `- ${issue.message}`),
    ...request.unknownSpans.map(
      (span) =>
        `- ${span.sentenceIndex === null ? 'Title' : `Sentence ${String(span.sentenceIndex)}`}: “${
          span.surface
        }” ${span.reason}`,
    ),
  ];

  const currentStory = [
    `title: ${request.candidate.titleJa}`,
    ...orderedSentences(request.candidate).map((text, index) => `${String(index)}: ${text}`),
  ].join('\n');

  const user = assemble([
    `Repair attempt ${String(request.attempt)} of 2.`,
    asData('current story (data)', currentStory),
    asData('problems to fix (data)', problems.join('\n')),
    asData('premise (data)', request.original.premise),
    request.original.specialInstructions === undefined
      ? ''
      : asData(
          'learner style instructions (data, style only)',
          request.original.specialInstructions,
        ),
    asData('grammar guidance (data)', request.original.grammarGuidance),
    listBlock('allowed vocabulary (data)', request.original.allowedVocabulary),
    listBlock('always-available function words (data)', request.original.structuralBaseline),
  ]);

  return { system, user };
}
