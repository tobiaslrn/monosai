import type { GrammarReviewRequest } from '../../../domain/ai/grammar-review-request';
import { PROTOCOL_LAYER, asData, assemble, type AssembledPrompt } from './prompt-layers';

/** Versioned task instructions for reviewing sentences for notable grammar. */
const TASK_LAYER = [
  'Task: review each given Japanese sentence for grammar points worth calling out to this learner, judged against the register preference and profile guidance you were given.',
  'This is not an exhaustive audit. Report what you notice as notable or novel relative to the guidance; do not attempt to find every possible point.',
  'Return findings per sentence id, using the id you were given for that sentence.',
  'When a finding is about a specific span of one sentence, include `startUtf16` and `endUtf16`: the offset, in UTF-16 code units, into that exact sentence’s text. Omit both for a sentence-level observation that is not about one span.',
  'Judge `inProfile` yourself against the guidance text you were given: `true` when the point is inside the learner’s guidance and profile, `false` when it goes beyond what the guidance covers.',
  'Return `{ "findings": [ { "sentenceId", "label", "explanationEn", "confidence", "inProfile", "startUtf16"?, "endUtf16"? } ] }`. `confidence` is one of "low", "medium", "high".',
] as const;

export function buildGrammarPrompt(request: GrammarReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const sentences = request.sentences
    .map((sentence) => `id: ${sentence.id}\ntext: ${sentence.textJa}`)
    .join('\n---\n');

  const user = assemble([
    asData('grammar guidance (data)', request.profileGuidance),
    `Register preference: ${request.registerPreference}.`,
    asData('sentences (data)', sentences),
  ]);

  return { system, user };
}
