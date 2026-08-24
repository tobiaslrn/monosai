import type { ExceptionReviewRequest } from '../../../domain/ai/text-generation-provider';
import { PROTOCOL_LAYER, assemble, jsonDataBlock, type AssembledPrompt } from './prompt-layers';

/** Versioned task instructions for judging candidate unknowns against a policy. */
const TASK_LAYER = [
  'Role: Apply a learner-authored vocabulary exception policy conservatively.',
  'Goal: Decide whether each unreviewed lexical candidate is clearly allowed by that policy.',
  'Success criteria:',
  '- Judge every candidate independently and return every candidate id exactly once.',
  '- Consider every supplied occurrence context. Approve only when the policy clearly covers all relevant uses; otherwise reject.',
  '- Do not infer a broader exception than the learner wrote.',
  'Output semantics: `decisions` contains `{ candidateId, decision, explanationEn }`; `decision` is "approved" or "rejected".',
  '`explanationEn` is one plain English sentence saying which part of the policy applies and why. An explanation that only restates the verdict is discarded and the word stays unknown.',
] as const;

const JSON_CONTRACT =
  'Return {"decisions":[{"candidateId":string,"decision":"approved"|"rejected","explanationEn":string}]}. Include no other fields.';

export function buildExceptionPrompt(request: ExceptionReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([
    jsonDataBlock('learner exception policy', { text: request.policyText }),
    jsonDataBlock('candidates', request.candidates),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
