import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import type {
  GrammarReviewRequest,
  GrammarReviewResult,
} from '../../domain/ai/grammar-review-request';
import type { ModelTest, TextModelConfig } from '../../domain/ai/model-test';
import type { StoryPlotRequest } from '../../domain/ai/story-plot';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
  TextGenerationProvider,
  TextTaskConfig,
} from '../../domain/ai/text-generation-provider';
import type {
  TranslationBatchRequest,
  TranslationResponse,
} from '../../domain/ai/translation-request';
import { err, type Result } from '../../domain/shared/result';
import { retryOnRejection, untilAborted } from '../audio/lazy-load';
import type { OpenRouterEnricher } from './enrichment.adapter';
import type { OpenRouterStoryGenerator } from './story-generation.adapter';
import type { OpenRouterTextModelTester } from './text-model-test.adapter';

/** Supplies the generator on first use, so its prompts can be code-split. */
export type StoryGeneratorLoader = () => Promise<OpenRouterStoryGenerator>;

/** Supplies the enricher on first use, so its prompts can be code-split. */
export type EnricherLoader = () => Promise<OpenRouterEnricher>;

/**
 * The whole text port, composed from the adapters that implement it.
 *
 * Configuration testing, story generation, and enrichment share a client but
 * nothing else: the tester's job is to prove a model can be held to a
 * structure, the generator's is to write Japanese under a vocabulary
 * constraint, and the enricher's is to review and translate sentences that
 * already exist. Keeping them in separate files means none of them grows a
 * second responsibility, and this class exists only so the injection token
 * still resolves to one object.
 *
 * The generator and the enricher each arrive through a loader rather than the
 * constructor because their assembled prompts are several kilobytes that a
 * learner who only imports their own text never needs. The port's methods are
 * already asynchronous, so resolving either on first use costs nothing at the
 * call site, and the loaded instance is kept.
 *
 * A load that fails, a chunk that cannot be fetched offline or after a deploy,
 * answers with a failure result like any other, and the next call loads again.
 */
export class OpenRouterTextProvider implements TextGenerationProvider {
  private readonly generator: StoryGeneratorLoader;
  private readonly enricher: EnricherLoader;

  constructor(
    private readonly tester: OpenRouterTextModelTester,
    loadGenerator: StoryGeneratorLoader,
    loadEnricher: EnricherLoader,
    private readonly isOnline: () => boolean = () => true,
  ) {
    this.generator = retryOnRejection(loadGenerator);
    this.enricher = retryOnRejection(loadEnricher);
  }

  /** Loads an adapter and hands it the call, or reports why it could not be loaded. */
  private async withLoaded<A, T>(
    load: () => Promise<A>,
    task: AiTask,
    signal: AbortSignal | undefined,
    use: (adapter: A) => Promise<Result<T, AiError>>,
  ): Promise<Result<T, AiError>> {
    let adapter: A;
    try {
      adapter = await untilAborted(load(), signal);
    } catch {
      if (signal?.aborted === true) {
        return err(aiError('cancelled', task, 'The request was cancelled.'));
      }
      return err(
        this.isOnline()
          ? aiError('unknown', task, 'The code for this request could not be loaded.', {
              cause: 'chunk-load',
            })
          : aiError('offline', task, 'The device is offline.'),
      );
    }
    return use(adapter);
  }

  testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>> {
    return this.tester.testConfiguration(config, signal);
  }

  draftPlots(
    request: StoryPlotRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly string[], AiError>> {
    return this.withLoaded(this.generator, 'story-plots', signal, (adapter) =>
      adapter.draftPlots(request, config, signal),
    );
  }

  generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.withLoaded(this.generator, 'story-generation', signal, (adapter) =>
      adapter.generateStory(request, config, signal),
    );
  }

  repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.withLoaded(this.generator, 'story-repair', signal, (adapter) =>
      adapter.repairStory(request, config, signal),
    );
  }

  reviewExceptions(
    request: ExceptionReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly ExceptionDecision[], AiError>> {
    return this.withLoaded(this.generator, 'exception-review', signal, (adapter) =>
      adapter.reviewExceptions(request, config, signal),
    );
  }

  reviewGrammar(
    request: GrammarReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<GrammarReviewResult, AiError>> {
    return this.withLoaded(this.enricher, 'grammar-review', signal, (adapter) =>
      adapter.reviewGrammar(request, config, signal),
    );
  }

  translate(
    request: TranslationBatchRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<TranslationResponse, AiError>> {
    return this.withLoaded(this.enricher, 'translation', signal, (adapter) =>
      adapter.translate(request, config, signal),
    );
  }
}
