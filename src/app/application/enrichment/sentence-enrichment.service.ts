import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type {
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { TextModelStore } from '../settings/text-model.store';
import { READING_REPOSITORY } from '../shared/repository-tokens';
import { AudioConfigurationService } from './audio-configuration.service';
import { AudioSynthesisService } from './audio-synthesis.service';
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
  private readonly audio = inject(AudioSynthesisService);
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly profile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);

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
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForTask'>>;
    const modelId =
      configurable.configForTask?.('grammar')?.modelId ?? this.textModel.settings().modelId;
    return (
      this.keys
        .grammarKeys(
          [sentence],
          modelId,
          PROMPT_VERSIONS.grammar,
          this.profile.liveProfileHash() ?? '',
        )
        .get(sentence.id) ?? ''
    );
  }

  /**
   * The cache key a clip of this sentence would be stored under now, or the
   * empty string when no tested configuration exists — which is never a stored
   * key, so an unconfigured reader simply never matches one.
   */
  audioKeyFor(sentence: Sentence): string {
    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      return '';
    }
    return (
      this.keys
        .audioKeys(
          [sentence],
          config.value.modelId,
          config.value.voiceId,
          config.value.optionsFingerprint,
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
    // The live profile hashes the preset prose, which lives in the language
    // bundle. Opening a reading does not need that bundle, so an analysis
    // requested moments after opening may be the first thing that does. This
    // waits for the local assets rather than refusing; it is a file read, not a
    // request.
    await this.language.initialize();

    const profileHash = this.profile.liveProfileHash();
    if (profileHash === null) {
      return err({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'grammar-review',
          'The grammar profile could not be resolved, because the language assets are unavailable.',
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

  /**
   * Reads one sentence aloud, because the learner asked for it.
   *
   * Resolves model, voice, and speed from `TtsStore` rather than
   * `TextModelStore`: speech is configured and tested separately, and a working
   * text model says nothing about whether a voice exists.
   */
  async synthesizeAudio(
    sentence: Sentence,
    readingId: ReadingId,
    signal: AbortSignal,
  ): Promise<EnrichmentResult<AudioAssetSummary>> {
    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      return err({ source: 'provider', error: config.error });
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      return err({ source: 'storage', error: refs.error });
    }
    // Keys for the whole reading: the write refreshes its summary in the same
    // transaction, and a summary computed from one sentence would be a lie.
    const cacheKeys = this.keys.audioKeys(
      refs.value,
      config.value.modelId,
      config.value.voiceId,
      config.value.optionsFingerprint,
    );
    const cacheKey = cacheKeys.get(sentence.id);
    if (cacheKey === undefined) {
      return err({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'tts-synthesis',
          'This sentence is no longer part of the reading.',
          { detail: { capability: 'text-to-speech' } },
        ),
      });
    }

    const produced = await this.audio.run(sentence, readingId, cacheKey, config.value, signal);
    if (!produced.ok) {
      return err({ source: 'provider', error: produced.error });
    }

    const stored = await this.audio.store(produced.value, cacheKeys);
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
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForTask'>>;
    const config =
      configurable.configForTask?.(task === 'grammar-review' ? 'grammar' : 'text') ??
      (settings.modelId !== '' && settings.structuredOutput !== null
        ? {
            modelId: settings.modelId,
            reasoningEffort: settings.reasoningEffort,
            structuredOutput: settings.structuredOutput,
            storyTokenBudget: settings.storyTokenBudget,
          }
        : null);
    if (config === null) {
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
      modelId: config.modelId,
      taskConfig: config,
      cacheKeys: keysFor(refs.value, config.modelId),
    });
  }
}
