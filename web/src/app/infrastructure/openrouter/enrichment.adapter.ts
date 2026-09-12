import type { AiError } from '../../domain/ai/ai-error';
import type {
  GrammarReviewRequest,
  GrammarReviewResult,
} from '../../domain/ai/grammar-review-request';
import type { StructuredOutputMemo } from '../../domain/ai/structured-output-memo';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import {
  matchTranslations,
  translationTargets,
  type TranslationBatchRequest,
  type TranslationProviderResult,
  type TranslationResult,
} from '../../domain/ai/translation-request';
import { err, ok, type Result } from '../../domain/shared/result';
import type { OpenRouterClient } from './openrouter-client';
import { ENRICHMENT_REQUEST_TIMEOUT_MS } from './openrouter-endpoints';
import {
  grammarReviewJsonSchema,
  grammarReviewSchema,
  translationGlossaryRepairJsonSchema,
  translationGlossaryRepairSchema,
  translationOpeningJsonSchema,
  translationOpeningSchema,
  translationTailJsonSchema,
  translationTailSchema,
  translationsSchema,
} from './openrouter-response.schema';
import { buildGrammarPrompt, grammarSentenceWireId } from './prompts/grammar-prompt';
import { buildTranslationPrompt, translationWireId } from './prompts/translation-prompt';
import { StructuredTaskRunner } from './structured-request';

/**
 * Reply budgets, sized from the request rather than fixed.
 *
 * Reviewing or translating a handful of sentences never needs the room a whole
 * story does, but a constant sized for a small batch is a budget a large one
 * runs out of — and a reply that stops at the limit reaches the learner as a
 * malformed answer rather than as the truncation it is. The per-entry figures
 * are generous for the English one sentence or one finding needs; the ceilings
 * exist so a miscounted batch cannot ask for a story-sized reply.
 */
const TRANSLATION_BASE_TOKENS = 512;
const TRANSLATION_TOKENS_PER_SENTENCE = 120;
const MAX_TRANSLATION_TOKENS = 4_096;

const GRAMMAR_BASE_TOKENS = 512;
const GRAMMAR_TOKENS_PER_SENTENCE = 180;
const MAX_GRAMMAR_TOKENS = 8_192;

function replyBudget(base: number, perEntry: number, entries: number, ceiling: number): number {
  return Math.min(base + perEntry * Math.max(entries, 1), ceiling);
}

/**
 * Grammar review and translation over the shared client.
 *
 * Only schema validation and mapping happen here. Whether a finding's quoted
 * span occurs in its sentence, whether its sentence id is one the caller
 * actually asked about, and how to downgrade or drop anything that fails those
 * checks are judgements `domain/enrichment` makes with context this adapter's
 * `read` function does not have — the caller's sentence texts and requested id
 * list. A
 * `matchTranslations` mismatch is the one exception: it is a
 * `malformed-response` here and spends the single format recovery, because
 * `domain/ai/translation-request` already defines that mismatch as
 * untrustworthy on its own terms.
 */
export class OpenRouterEnricher {
  private readonly runner: StructuredTaskRunner;

  constructor(client: OpenRouterClient, memo?: StructuredOutputMemo) {
    this.runner = new StructuredTaskRunner(client, memo);
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
      jsonSchema: grammarReviewJsonSchema(request.sentences.length),
      maxTokens: replyBudget(
        GRAMMAR_BASE_TOKENS,
        GRAMMAR_TOKENS_PER_SENTENCE,
        request.sentences.length,
        MAX_GRAMMAR_TOKENS,
      ),
      timeoutMs: ENRICHMENT_REQUEST_TIMEOUT_MS,
      read: readGrammarReview(request),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  translate(
    request: TranslationBatchRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<TranslationProviderResult, AiError>> {
    const targetCount = translationTargets(request).length;
    const kind = request.kind ?? 'tail';
    return this.runner.run<TranslationProviderResult>({
      task: 'translation',
      config,
      prompt: buildTranslationPrompt(request),
      jsonSchema:
        kind === 'opening'
          ? translationOpeningJsonSchema(targetCount)
          : kind === 'glossary-repair'
            ? translationGlossaryRepairJsonSchema()
            : translationTailJsonSchema(targetCount),
      maxTokens: replyBudget(
        TRANSLATION_BASE_TOKENS,
        TRANSLATION_TOKENS_PER_SENTENCE,
        targetCount,
        MAX_TRANSLATION_TOKENS,
      ),
      timeoutMs: ENRICHMENT_REQUEST_TIMEOUT_MS,
      read: readTranslations(request),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

function readGrammarReview(
  request: GrammarReviewRequest,
): (parsed: unknown) => Result<GrammarReviewResult, string> {
  const byWireId = new Map(
    request.sentences.map(
      (sentence, index) => [grammarSentenceWireId(index), sentence.id] as const,
    ),
  );

  return (parsed: unknown): Result<GrammarReviewResult, string> => {
    const payload = grammarReviewSchema.safeParse(parsed);
    if (!payload.success) {
      return err('grammar-review-shape');
    }
    const seen = new Set<string>();
    const findings: GrammarReviewResult['findings'][number][] = [];
    for (const finding of payload.data.findings) {
      const sentenceId = byWireId.get(finding.sentenceId);
      if (sentenceId === undefined) {
        return err('grammar-unknown-sentence');
      }
      if (seen.has(finding.sentenceId)) {
        return err('grammar-duplicate-sentence');
      }
      seen.add(finding.sentenceId);
      findings.push({
        sentenceId,
        label: finding.label,
        explanationEn: finding.explanationEn,
        confidence: finding.confidence,
        inProfile: finding.inProfile,
        ...(finding.spanJa === undefined || finding.spanJa === null
          ? {}
          : { spanJa: finding.spanJa }),
      });
    }
    return ok({ findings });
  };
}

/**
 * Restores the caller's sentence ids from the ordinals the prompt sent.
 *
 * An ordinal the request never issued is an extra translation, which
 * `matchTranslations` already defines as untrustworthy for the whole batch.
 */
function parseTranslations(
  parsed: unknown,
  kind: TranslationBatchRequest['kind'] | undefined,
): Result<
  {
    readonly translations: readonly { readonly id: string; readonly textEn: string }[];
    readonly glossary?: readonly { readonly surfaceJa: string; readonly renderingEn: string }[];
  },
  string
> {
  if (kind === 'opening') {
    const payload = translationOpeningSchema.safeParse(parsed);
    return payload.success ? ok(payload.data) : err('translations-shape');
  }
  if (kind === 'glossary-repair') {
    const payload = translationGlossaryRepairSchema.safeParse(parsed);
    return payload.success
      ? ok({ translations: [], glossary: payload.data.glossary })
      : err('glossary-repair-shape');
  }
  if (kind === undefined) {
    const payload = translationsSchema.safeParse(parsed);
    return payload.success ? ok(payload.data) : err('translations-shape');
  }
  const payload = translationTailSchema.safeParse(parsed);
  return payload.success ? ok(payload.data) : err('translations-shape');
}

function readTranslations(
  request: TranslationBatchRequest,
): (parsed: unknown) => Result<TranslationProviderResult, string> {
  const targets = translationTargets(request);
  const byWireId = new Map(
    request.window.flatMap((entry, index) =>
      entry.targetId === null ? [] : [[translationWireId(index), entry.targetId] as const],
    ),
  );

  return (parsed: unknown) => {
    const payload = parseTranslations(parsed, request.kind);
    if (!payload.ok) {
      return payload;
    }
    if (request.kind === 'glossary-repair') {
      return ok({ translations: [], glossary: payload.value.glossary ?? [] });
    }
    const returned: TranslationResult[] = [];
    for (const translation of payload.value.translations) {
      const id = byWireId.get(translation.id);
      if (id === undefined) {
        return err('translations-extra');
      }
      returned.push({ id, textEn: translation.textEn });
    }
    // Plan-aware callers validate per-sentence translations and the glossary
    // independently, so a missing or duplicate sentence cannot discard a
    // safely parsed glossary or unrelated valid translations.
    if (request.kind !== undefined) {
      return ok({
        translations: returned,
        ...(payload.value.glossary === undefined ? {} : { glossary: payload.value.glossary }),
      });
    }
    const matched = matchTranslations(targets, returned);
    if (!matched.ok) return err(`translations-${matched.error}`);
    return ok(matched.value);
  };
}
