import type { TranslationBatchRequest } from '../../../domain/ai/translation-request';
import { PROTOCOL_LAYER, asData, assemble, type AssembledPrompt } from './prompt-layers';

/** Versioned task instructions for translating sentences into English. */
const TASK_LAYER = [
  'Task: translate each given Japanese sentence into natural English, one translation per sentence id.',
  'Never modify, correct, or echo back the Japanese. Write English only, in the `textEn` field.',
  'Each sentence is given on its own, with no surrounding chapter context. That is a deliberate default, not something missing that you should infer or ask about.',
  'Return `{ "translations": [ { "id", "textEn" } ] }`, with exactly one entry per requested id and each id used exactly once.',
] as const;

export function buildTranslationPrompt(request: TranslationBatchRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const sentences = request.sentences
    .map((sentence) => `id: ${sentence.id}\ntext: ${sentence.textJa}`)
    .join('\n---\n');

  const user = assemble([asData('sentences (data)', sentences)]);

  return { system, user };
}
