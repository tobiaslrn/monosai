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

/**
 * The size of everything that varies with the learner's configuration.
 *
 * The fixed protocol and policy layers are counted as a constant overhead
 * rather than re-measured, because they cannot change between runs of one
 * build and including them keeps the guard honest about the real total.
 */
export const FIXED_PROMPT_OVERHEAD_TOKENS = 1_200;

/**
 * Mirrors the Markdown input wire the prompt adapter sends: the focus, then
 * the suggestions, then the rest, with no expression in two sections.
 *
 * This intentionally lives in the domain as a small estimate rather than
 * importing the provider renderer. The domain owns the budget decision and
 * must remain independent of OpenRouter; the two representations therefore
 * share the same simple, documented wire rules instead of a shared builder.
 */
export function estimateRequestTokens(request: StoryGenerationRequest): number {
  const uniqueAllowed = [...new Set(request.allowedVocabulary)];
  const allowed = new Set(uniqueAllowed);
  const focusSeen = new Set<string>();
  const recentFocusVocabulary = (request.focusVocabulary ?? []).filter((word) => {
    if (!allowed.has(word.expression) || focusSeen.has(word.expression)) {
      return false;
    }
    focusSeen.add(word.expression);
    return true;
  });
  const focused = new Set(recentFocusVocabulary.map((word) => word.expression));
  const suggestedAllowedVocabulary = [...new Set(request.suggestedVocabulary)].filter(
    (value) => allowed.has(value) && !focused.has(value),
  );
  const suggested = new Set(suggestedAllowedVocabulary);
  const otherAllowedVocabulary = uniqueAllowed.filter(
    (value) => !suggested.has(value) && !focused.has(value),
  );
  const focusGroups: { readonly age: string; readonly values: string[] }[] = [];
  for (const word of recentFocusVocabulary) {
    const group = focusGroups.find((candidate) => candidate.age === word.firstSeen);
    if (group === undefined) {
      focusGroups.push({ age: word.firstSeen, values: [word.expression] });
    } else {
      group.values.push(word.expression);
    }
  }

  const vocabulary = [
    '# Vocabulary',
    ...(focusGroups.length === 0
      ? []
      : [
          '## Focus vocabulary',
          ...focusGroups.flatMap((group) => [`### ${group.age}`, ...group.values]),
        ]),
    ...(suggestedAllowedVocabulary.length === 0
      ? []
      : ['## Supporting vocabulary', ...suggestedAllowedVocabulary]),
    '## Other allowed vocabulary',
    ...otherAllowedVocabulary,
    ...(request.structuralBaseline.length === 0
      ? []
      : ['## Always-available forms', ...request.structuralBaseline]),
  ]
    .map(estimateLine)
    .join('\n\n');
  const storySettings = [
    '# Story requirements',
    `Requested sentence count: ${String(request.requestedSentenceCount)}`,
    '# Grammar',
    `Register: ${request.registerPreference}`,
    '## Guidance',
    request.grammarGuidance,
  ]
    .map(estimateLine)
    .join('\n\n');
  const variablePrompt = [
    estimateBlock('story settings', storySettings),
    estimateBlock('vocabulary inventory', vocabulary),
    request.exceptionPolicy === undefined
      ? ''
      : estimateBlock(
          'learner exception policy',
          `# Learner exception policy\n\n${request.exceptionPolicy}`,
        ),
    request.premise === ''
      ? 'No premise was supplied. Choose the topic yourself: one concrete, ordinary situation that this story is about.'
      : estimateBlock('premise', `# Premise\n\n${request.premise}`),
    request.specialInstructions === undefined
      ? ''
      : estimateBlock('learner style', `# Learner style\n\n${request.specialInstructions}`),
    request.requestedSentenceCount > 50
      ? estimateBlock(
          'segment plan',
          '# Required segment plan\n\n' +
            planStorySegmentsForEstimate(request.requestedSentenceCount),
        )
      : '',
  ]
    .filter((section) => section !== '')
    .join('\n\n');
  return FIXED_PROMPT_OVERHEAD_TOKENS + estimateTokens(variablePrompt);
}

function estimateBlock(label: string, body: string): string {
  return `<<<MONOSAI_CONFIG ${label}\n${body}\nMONOSAI_CONFIG>>>`;
}

function estimateLine(value: string): string {
  const escaped = value.replaceAll('\\', '\\\\').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
  return /^(?:#{1,6}|[-+*>`~]|\d+[.)])/u.test(escaped) ? `\\${escaped}` : escaped;
}

function planStorySegmentsForEstimate(sentenceCount: number): string {
  const segmentCount = Math.ceil(sentenceCount / 50);
  return Array.from(
    { length: segmentCount },
    (_, index) =>
      `- Segment ${String(index)}: ${String(Math.min(50, sentenceCount - index * 50))} sentences`,
  ).join('\n');
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
