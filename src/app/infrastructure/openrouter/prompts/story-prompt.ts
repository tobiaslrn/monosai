import type { StoryGenerationRequest } from '../../../domain/ai/story-request';
import { POLICY_LAYER, PROTOCOL_LAYER, asData, assemble, listBlock } from './prompt-layers';

/** Versioned task instructions for writing a fresh story. */
const TASK_LAYER = [
  'Task: write one short Japanese story for this learner.',
  'Return an object with `titleJa` and `sentences`. `sentences` is an array of `{ index, textJa }` with indexes starting at 0, contiguous, and in reading order.',
  'One sentence per array entry. Do not put two sentences in one entry and do not split one sentence across entries.',
  'The title is Japanese, short, and uses the same vocabulary policy as the sentences.',
] as const;

export interface AssembledPrompt {
  readonly system: string;
  readonly user: string;
}

export function buildStoryPrompt(request: StoryGenerationRequest): AssembledPrompt {
  const system = assemble([
    PROTOCOL_LAYER,
    POLICY_LAYER,
    TASK_LAYER.join('\n'),
    `Write exactly between ${String(request.sentenceRange.min)} and ${String(
      request.sentenceRange.max,
    )} sentences.`,
  ]);

  const user = assemble([
    `Write a ${request.form} story of ${String(request.sentenceRange.min)}–${String(
      request.sentenceRange.max,
    )} sentences.`,
    asData('premise (data)', request.premise),
    request.specialInstructions === undefined
      ? ''
      : asData('learner style instructions (data, style only)', request.specialInstructions),
    asData('grammar guidance (data)', request.grammarGuidance),
    `Register preference: ${request.registerPreference}.`,
    listBlock('allowed vocabulary (data)', request.allowedVocabulary),
    listBlock('always-available function words (data)', request.structuralBaseline),
    listBlock('suggested vocabulary, inspiration only (data)', request.suggestedVocabulary),
  ]);

  return { system, user };
}
