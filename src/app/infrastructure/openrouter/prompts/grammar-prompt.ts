import type { GrammarReviewRequest } from '../../../domain/ai/grammar-review-request';
import { PROTOCOL_LAYER, assemble, jsonDataBlock, type AssembledPrompt } from './prompt-layers';

/** Versioned task instructions for reviewing sentences for notable grammar. */
const TASK_LAYER = [
  'Role: Review Japanese grammar as a precise, learner-focused language tutor.',
  'Goal: Identify the most pedagogically useful grammar in each target sentence and flag every genuine construction above the supplied profile ceiling.',
  'Success criteria:',
  '- Return at most three findings per sentence. Prefer complete constructions over isolated particles, and do not repeat the same construction within one sentence.',
  '- Explain what the construction does in this exact sentence, not merely its dictionary definition.',
  '- Set `inProfile` to true when the construction is within the supplied profile and false when it exceeds that ceiling.',
  '- Use the sentence order as context only for disambiguation. Findings must remain attached to the sentence where the grammar occurs.',
  'When a finding is about a specific span of one sentence, set `startUtf16` and `endUtf16`: the offset, in UTF-16 code units, into that exact sentence’s text. Set both to `null` for a sentence-level observation that is not about one span.',
  'Output semantics: `findings` contains `{ sentenceId, label, explanationEn, confidence, inProfile, startUtf16, endUtf16 }`; `confidence` is "low", "medium", or "high".',
] as const;

const JSON_CONTRACT =
  'Return {"findings":[{"sentenceId":string,"label":string,"explanationEn":string,"confidence":"low"|"medium"|"high","inProfile":boolean,"startUtf16":integer|null,"endUtf16":integer|null}]}. Include no other fields.';

export function buildGrammarPrompt(request: GrammarReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([
    jsonDataBlock('grammar profile', {
      guidance: request.profileGuidance,
      register: request.registerPreference,
    }),
    jsonDataBlock('sentences in reading order', request.sentences),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
