import type { TranslationBatchRequest } from '../../../domain/ai/translation-request';
import { PROTOCOL_LAYER, assemble, jsonDataBlock, type AssembledPrompt } from './prompt-layers';

/** Versioned task instructions for translating sentences into English. */
const TASK_LAYER = [
  'Role: Translate Japanese reading material into natural English.',
  'Goal: Translate every target sentence faithfully, preserving its meaning, tone, and register.',
  'Success criteria:',
  '- Return exactly one translation for each target id, and use every target id exactly once.',
  '- Use `contextBeforeJa` and `contextAfterJa` only to resolve ambiguity. Do not translate or return the context unless it is itself a target.',
  '- Produce natural English without notes, explanations, invented details, or unnecessary literalness.',
  'Output semantics: `translations` contains `{ id, textEn }`. Never modify, correct, or echo the Japanese.',
] as const;

const JSON_CONTRACT =
  'Return {"translations":[{"id":string,"textEn":string}]}. Include no other fields.';

export function buildTranslationPrompt(request: TranslationBatchRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([jsonDataBlock('translation targets', request.sentences)]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
