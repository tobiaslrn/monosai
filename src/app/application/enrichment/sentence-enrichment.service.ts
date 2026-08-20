import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { TextModelStore } from '../settings/text-model.store';
import { READING_REPOSITORY } from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { GrammarAnalysisService } from './grammar-analysis.service';
import { TranslationService } from './translation.service';

/** Which layer refused, so the reader can offer the right next action. */
export type EnrichmentFailure =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export type EnrichmentResult<T> = Result<T, EnrichmentFailure>;

/**
 * Everything one sentence's enrichment needs, resolved once per action so no
 * setting can change between the request and the write.
 */
interface SentenceContext {
  readonly modelId: string;
  readonly taskConfig: TextTaskConfig;
  /** Keys for the whole reading: the write refreshes its summary in the same
   * transaction, and a summary computed from one sentence would be a lie. */
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
}

/**
 * Translating or analysing exactly one sentence, on request.
 *
 * This is the imported reading's counterpart to the generated story's automatic
 * pass: same services, same cache keys, one sentence at a time and only when
 * the learner asks. Nothing here runs on its own — there is no effect, no
 * on-open trigger, and no prefetch anywhere in the call graph.
 */
@Injectable({ providedIn: 'root' })
export class SentenceEnrichmentService {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly grammar = inject(GrammarAnalysisService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly profile = inject(GrammarProfileStore);

  /** The cache key a translation of this sentence would be stored under now. */
  translationKeyFor(sentence: Sentence): string {
    return (
      this.keys
        .translationKeys([sentence], this.textModel.settings().modelId, PROMPT_VERSIONS.translation)
        .get(sentence.id) ?? ''
    );
  }

  /** The cache key an analysis of this sentence would be stored under now. */
  grammarKeyFor(sentence: Sentence): string {
    return (
      this.keys
        .grammarKeys(
          [sentence],
          this.textModel.settings().modelId,
          PROMPT_VERSIONS.grammar,
          this.profile.liveProfileHash() ?? '',
        )
        .get(sentence.id) ?? ''
    );
  }

  async translate(
    sentence: Sentence,
    readingId: ReadingId,
    signal: AbortSignal,
  ): Promise<EnrichmentResult<TranslationRecord>> {
    const context = await this.contextFor(readingId, 'translation', (refs, modelId) =>
      this.keys.translationKeys(refs, modelId, PROMPT_VERSIONS.translation),
    );
    if (!context.ok) {
      return context;
    }

    // `run` checks the cache before it sends anything, so a sentence whose
    // Japanese was already translated under this configuration costs no
    // request even when the reader asks for it again.
    const outcome = await this.translation.run(
      [sentence],
      readingId,
      context.value.cacheKeys,
      context.value.modelId,
      PROMPT_VERSIONS.translation,
      context.value.taskConfig,
      signal,
    );
    const record = outcome.records.at(0);
    if (record === undefined) {
      return err({
        source: 'provider',
        error:
          outcome.error ??
          aiError('cancelled', 'translation', 'The translation was stopped before it finished.'),
      });
    }

    const stored = await this.translation.store(record, context.value.cacheKeys);
    return stored.ok ? ok(stored.value) : err({ source: 'storage', error: stored.error });
  }

  async analyzeGrammar(
    sentence: Sentence,
    readingId: ReadingId,
    signal: AbortSignal,
  ): Promise<EnrichmentResult<GrammarAnalysisRecord>> {
    const profileHash = this.profile.liveProfileHash();
    if (profileHash === null) {
      return err({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'grammar-review',
          'The grammar profile is not ready yet.',
          { detail: { capability: 'grammar-profile' } },
        ),
      });
    }

    const context = await this.contextFor(readingId, 'grammar-review', (refs, modelId) =>
      this.keys.grammarKeys(refs, modelId, PROMPT_VERSIONS.grammar, profileHash),
    );
    if (!context.ok) {
      return context;
    }

    const outcome = await this.grammar.run(
      [sentence],
      readingId,
      context.value.cacheKeys,
      profileHash,
      this.profile.resolvedGuidance(),
      this.profile.selection().registerPreference,
      context.value.modelId,
      PROMPT_VERSIONS.grammar,
      context.value.taskConfig,
      signal,
    );
    const record = outcome.records.at(0);
    if (record === undefined) {
      return err({
        source: 'provider',
        error: aiError(
          outcome.status === 'unavailable' && outcome.reasonCode === 'cancelled'
            ? 'cancelled'
            : 'provider-unavailable',
          'grammar-review',
          'The grammar review did not produce an answer for this sentence.',
        ),
      });
    }

    const stored = await this.grammar.store(record, context.value.cacheKeys);
    return stored.ok ? ok(stored.value) : err({ source: 'storage', error: stored.error });
  }

  private async contextFor(
    readingId: ReadingId,
    task: 'translation' | 'grammar-review',
    keysFor: (
      refs: readonly { readonly id: SentenceId; readonly contentHash: string }[],
      modelId: string,
    ) => ReadonlyMap<SentenceId, string>,
  ): Promise<EnrichmentResult<SentenceContext>> {
    const settings = this.textModel.settings();
    const structuredOutput = settings.structuredOutput;
    if (settings.modelId === '' || structuredOutput === null) {
      return err({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          task,
          'No tested text model is available for this.',
          { detail: { capability: 'structured-output' } },
        ),
      });
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      return err({ source: 'storage', error: refs.error });
    }

    return ok({
      modelId: settings.modelId,
      taskConfig: { modelId: settings.modelId, structuredOutput },
      cacheKeys: keysFor(refs.value, settings.modelId),
    });
  }
}
