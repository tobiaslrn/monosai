import type { AiTask } from './ai-task';
import { aiError, type AiError } from './ai-error';
import { err, ok, type Result } from '../shared/result';
import type { StoryGenerationRequest } from './story-request';

/**
 * Largest assembled request Monosai will send, from ai-pipelines section 4.
 *
 * The guard exists so a configuration that cannot fit fails before it is paid
 * for. Silently truncating the allowlist would be worse than failing: the
 * story would be generated against one vocabulary list and validated against
 * another, and every dropped word would come back as an unknown the learner
 * cannot explain.
 */
export const MAX_REQUEST_TOKENS = 60_000;

/**
 * A deliberately crude, deliberately deterministic token estimate.
 *
 * Real tokenization is the provider's, differs per model, and is not available
 * offline, so this approximates it from character classes: Japanese averages
 * close to one token per character on the tokenizers OpenRouter fronts, while
 * ASCII runs nearer four characters per token. Rounding up on both keeps the
 * estimate conservative, which is the only direction a budget guard may err.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const character of text) {
    if ((character.codePointAt(0) ?? 0) < 128) {
      ascii += 1;
    } else {
      wide += 1;
    }
  }
  return Math.ceil(ascii / 4) + wide;
}

function estimateList(values: readonly string[]): number {
  // One separator token per entry, which is what a delimited list costs.
  return values.reduce((total, value) => total + estimateTokens(value) + 1, 0);
}

/**
 * The size of everything that varies with the learner's configuration.
 *
 * The fixed protocol and policy layers are counted as a constant overhead
 * rather than re-measured, because they cannot change between runs of one
 * build and including them keeps the guard honest about the real total.
 */
export const FIXED_PROMPT_OVERHEAD_TOKENS = 1_200;

export function estimateRequestTokens(request: StoryGenerationRequest): number {
  return (
    FIXED_PROMPT_OVERHEAD_TOKENS +
    estimateTokens(request.premise) +
    estimateTokens(request.specialInstructions ?? '') +
    estimateTokens(request.grammarGuidance) +
    estimateList(request.allowedVocabulary) +
    estimateList(request.suggestedVocabulary) +
    estimateList(request.structuralBaseline)
  );
}

export interface ContextBudget {
  readonly estimatedTokens: number;
  readonly limit: number;
}

export function checkContextBudget(
  request: StoryGenerationRequest,
  task: AiTask,
): Result<ContextBudget, AiError> {
  const estimatedTokens = estimateRequestTokens(request);
  if (estimatedTokens > MAX_REQUEST_TOKENS) {
    return err(
      aiError(
        'context-budget-exceeded',
        task,
        'The vocabulary and grammar for this story do not fit in one request.',
        { detail: { issueCode: 'assembled-request-too-large' } },
      ),
    );
  }
  return ok({ estimatedTokens, limit: MAX_REQUEST_TOKENS });
}
