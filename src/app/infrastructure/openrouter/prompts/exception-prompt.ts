import type { ExceptionReviewRequest } from '../../../domain/ai/text-generation-provider';
import {
  POLICY_LAYER,
  PROTOCOL_LAYER,
  asData,
  assemble,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for judging candidate unknowns against a policy. */
const TASK_LAYER = [
  'Task: decide, for each candidate word, whether the learner’s own exception policy allows it in a story even though the learner has not reviewed it.',
  'Judge each candidate independently and answer for every candidate exactly once, using the candidate id you were given.',
  'Return `{ "decisions": [ { "candidateId", "decision", "explanationEn", "category" } ] }` where `decision` is "approved" or "rejected".',
  '`explanationEn` is one plain English sentence saying which part of the policy applies and why. An explanation that only restates the verdict is discarded and the word stays unknown.',
  'When the policy does not clearly cover a candidate, reject it. Approval is not the safe default.',
] as const;

export function buildExceptionPrompt(request: ExceptionReviewRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, POLICY_LAYER, TASK_LAYER.join('\n')]);

  const candidates = request.candidates
    .map((candidate) =>
      [
        `id: ${candidate.id}`,
        `surface: ${candidate.surface}`,
        candidate.lemma === undefined ? '' : `lemma: ${candidate.lemma}`,
        candidate.readingHiragana === undefined ? '' : `reading: ${candidate.readingHiragana}`,
        candidate.partOfSpeech === undefined ? '' : `part of speech: ${candidate.partOfSpeech}`,
        `context: ${candidate.contextJa}`,
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    )
    .join('\n---\n');

  const user = assemble([
    asData('learner exception policy (data)', request.policyText),
    asData('candidates (data)', candidates),
  ]);

  return { system, user };
}
