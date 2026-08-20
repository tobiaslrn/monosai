import type { AiError } from '../../domain/ai/ai-error';
import type {
  GrammarReviewRequest,
  GrammarReviewResult,
} from '../../domain/ai/grammar-review-request';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import {
  matchTranslations,
  type TranslationBatchRequest,
  type TranslationResult,
} from '../../domain/ai/translation-request';
import { sentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { OpenRouterClient } from './openrouter-client';
import {
  GRAMMAR_REVIEW_JSON_SCHEMA,
  TRANSLATIONS_JSON_SCHEMA,
  grammarReviewSchema,
  translationsSchema,
} from './openrouter-response.schema';
import { buildGrammarPrompt } from './prompts/grammar-prompt';
import { buildTranslationPrompt } from './prompts/translation-prompt';
import { StructuredTaskRunner } from './structured-request';

/**
 * Reply budgets.
 *
 * Reviewing or translating a handful of sentences never needs the room a
 * whole story does, but still needs more than a single-word answer.
 */
const MAX_GRAMMAR_TOKENS = 2_048;
const MAX_TRANSLATION_TOKENS = 2_048;

/**
 * Grammar review and translation over the shared client.
 *
 * Only schema validation and mapping happen here. Whether a finding's offsets
 * are usable, whether its sentence id is one the caller actually asked about,
 * and dropping anything that fails those checks are judgements
 * `domain/enrichment` makes with context this adapter's `read` function does
 * not have — the caller's sentence texts and requested id list. A
 * `matchTranslations` mismatch is the one exception: it is a
 * `malformed-response` here and spends the single format recovery, because
 * `domain/ai/translation-request` already defines that mismatch as
 * untrustworthy on its own terms.
 */
export class OpenRouterEnricher {
  private readonly runner: StructuredTaskRunner;

  constructor(client: OpenRouterClient) {
    this.runner = new StructuredTaskRunner(client);
  }

  reviewGrammar(
    request: GrammarReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<GrammarReviewResult, AiError>> {
    return this.runner.run<GrammarReviewResult>({
      task: 'grammar-review',
      config,
      prompt: buildGrammarPrompt(request),
      jsonSchema: GRAMMAR_REVIEW_JSON_SCHEMA,
      maxTokens: MAX_GRAMMAR_TOKENS,
      read: readGrammarReview,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  translate(
    request: TranslationBatchRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly TranslationResult[], AiError>> {
    return this.runner.run<readonly TranslationResult[]>({
      task: 'translation',
      config,
      prompt: buildTranslationPrompt(request),
      jsonSchema: TRANSLATIONS_JSON_SCHEMA,
      maxTokens: MAX_TRANSLATION_TOKENS,
      read: readTranslations(request),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

function readGrammarReview(parsed: unknown): Result<GrammarReviewResult, string> {
  const payload = grammarReviewSchema.safeParse(parsed);
  if (!payload.success) {
    return err('grammar-review-shape');
  }
  return ok({
    findings: payload.data.findings.map((finding) => ({
      sentenceId: sentenceId(finding.sentenceId),
      label: finding.label,
      explanationEn: finding.explanationEn,
      confidence: finding.confidence,
      inProfile: finding.inProfile,
      ...(finding.startUtf16 === undefined ? {} : { startUtf16: finding.startUtf16 }),
      ...(finding.endUtf16 === undefined ? {} : { endUtf16: finding.endUtf16 }),
    })),
  });
}

function readTranslations(
  request: TranslationBatchRequest,
): (parsed: unknown) => Result<readonly TranslationResult[], string> {
  return (parsed: unknown) => {
    const payload = translationsSchema.safeParse(parsed);
    if (!payload.success) {
      return err('translations-shape');
    }
    const returned = payload.data.translations.map((translation) => ({
      id: sentenceId(translation.id),
      textEn: translation.textEn,
    }));
    const matched = matchTranslations(request.sentences, returned);
    return matched.ok ? ok(matched.value) : err(`translations-${matched.error}`);
  };
}
