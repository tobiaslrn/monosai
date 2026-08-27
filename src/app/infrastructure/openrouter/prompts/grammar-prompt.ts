import type { GrammarReviewRequest } from '../../../domain/ai/grammar-review-request';
import {
  PROTOCOL_LAYER,
  assemble,
  jsonConfigBlock,
  jsonDataBlock,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for reviewing sentences for notable grammar. */
const TASK_LAYER = [
  'Role: Review Japanese grammar as a precise, learner-focused language tutor.',
  'Goal: Flag every genuine construction above the supplied profile ceiling, then add the most pedagogically useful grammar in each target sentence.',
  'Success criteria:',
  '- Return at most three findings per sentence. When a sentence has more than three, keep the ones above the profile ceiling first and drop the merely useful ones.',
  '- Prefer complete constructions over isolated particles, and do not repeat the same construction within one sentence.',
  '- Explain what the construction does in this exact sentence, not merely its dictionary definition.',
  '- Write `explanationEn` as one or two plain sentences a beginner can read. Gloss any grammatical term you use.',
  '- Set `inProfile` to true when the construction is within the supplied profile and false when it exceeds that ceiling.',
  '- Use the sentence order as context only for disambiguation. Findings must remain attached to the sentence where the grammar occurs.',
  'When a finding is about a specific part of one sentence, set `spanJa` to that exact substring, copied character for character from that sentence. Set it to `null` for a sentence-level observation that is not about one span. Never paraphrase, normalize, or reorder a span.',
  'Output semantics: `findings` contains `{ sentenceId, label, explanationEn, confidence, inProfile, spanJa }`; `confidence` is "low", "medium", or "high" and states how sure you are the construction is present and correctly named.',
] as const;

const JSON_CONTRACT =
  'Return {"findings":[{"sentenceId":string,"label":string,"explanationEn":string,"confidence":"low"|"medium"|"high","inProfile":boolean,"spanJa":string|null}]}. Include no other fields.';

export function buildGrammarPrompt(request: GrammarReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([
    jsonConfigBlock('grammar profile', {
      guidance: request.profileGuidance,
      register: request.registerPreference,
    }),
    jsonDataBlock('sentences in reading order', request.sentences),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
