import type { ExceptionReviewRequest } from '../../../domain/ai/text-generation-provider';
import {
  PROTOCOL_LAYER,
  assemble,
  jsonConfigBlock,
  jsonDataBlock,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for judging candidate unknowns against a policy. */
const TASK_LAYER = [
  'Role: Apply a learner-authored vocabulary exception policy conservatively.',
  'Context: each candidate is a word that appeared in a story generated for this learner and is not in the vocabulary they have reviewed. Approving one means the word stays in the story and the learner meets it as a word they have never studied. Rejecting one means the story is rewritten to avoid it.',
  'Goal: Decide whether each candidate is clearly allowed by the learner exception policy.',
  'Success criteria:',
  '- Judge every candidate independently and return every candidate id exactly once.',
  '- Consider every supplied occurrence context. Approve only when the policy clearly covers all relevant uses; otherwise reject.',
  '- Do not infer a broader exception than the learner wrote. The policy is the only ground for an approval: how common, easy, or guessable a word is does not matter unless the policy says it does.',
  'Output semantics: `decisions` contains `{ candidateId, decision, explanationEn }`; `decision` is "approved" or "rejected".',
  '`explanationEn` is one plain English sentence that names the part of the policy that applies and says why this word falls under it. An explanation that only restates the verdict is discarded and the word stays unknown.',
] as const;

const JSON_CONTRACT =
  'Return {"decisions":[{"candidateId":string,"decision":"approved"|"rejected","explanationEn":string}]}. Include no other fields.';

/**
 * Ids on the wire are the candidate's position in this request, not the
 * composed surface-and-lemma key the caller uses.
 *
 * A short ordinal is cheaper, is ordered in a way that helps a model keep its
 * place, and cannot be corrupted by mistranscribing a Japanese character. The
 * caller's keys are restored in the adapter.
 */
export function exceptionCandidateWireId(index: number): string {
  return String(index);
}

export function buildExceptionPrompt(request: ExceptionReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([
    jsonConfigBlock('learner exception policy', { text: request.policyText }),
    jsonDataBlock(
      'candidates',
      request.candidates.map((candidate, index) => ({
        id: exceptionCandidateWireId(index),
        surface: candidate.surface,
        ...(candidate.lemma === undefined ? {} : { lemma: candidate.lemma }),
        ...(candidate.readingHiragana === undefined
          ? {}
          : { readingHiragana: candidate.readingHiragana }),
        ...(candidate.partOfSpeech === undefined ? {} : { partOfSpeech: candidate.partOfSpeech }),
        contextsJa: candidate.contextsJa,
      })),
    ),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
