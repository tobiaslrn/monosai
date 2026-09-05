import type { AiError } from '../../domain/ai/ai-error';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import type {
  GrammarReviewRequest,
  GrammarReviewResult,
} from '../../domain/ai/grammar-review-request';
import type { ModelTest, TextModelConfig } from '../../domain/ai/model-test';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
  TextGenerationProvider,
  TextTaskConfig,
} from '../../domain/ai/text-generation-provider';
import type {
  TranslationBatchRequest,
  TranslationResult,
} from '../../domain/ai/translation-request';
import type { Result } from '../../domain/shared/result';
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
 */
export class OpenRouterTextProvider implements TextGenerationProvider {
  private generator: OpenRouterStoryGenerator | null = null;
  private enricher: OpenRouterEnricher | null = null;

  constructor(
    private readonly tester: OpenRouterTextModelTester,
    private readonly loadGenerator: StoryGeneratorLoader,
    private readonly loadEnricher: EnricherLoader,
  ) {}

  private async generation(): Promise<OpenRouterStoryGenerator> {
    this.generator ??= await this.loadGenerator();
    return this.generator;
  }

  private async enrichment(): Promise<OpenRouterEnricher> {
    this.enricher ??= await this.loadEnricher();
    return this.enricher;
  }

  testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>> {
    return this.tester.testConfiguration(config, signal);
  }

  async generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return (await this.generation()).generateStory(request, config, signal);
  }

  async repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return (await this.generation()).repairStory(request, config, signal);
  }

  async reviewExceptions(
    request: ExceptionReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly ExceptionDecision[], AiError>> {
    return (await this.generation()).reviewExceptions(request, config, signal);
  }

  async reviewGrammar(
    request: GrammarReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<GrammarReviewResult, AiError>> {
    return (await this.enrichment()).reviewGrammar(request, config, signal);
  }

  async translate(
    request: TranslationBatchRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly TranslationResult[], AiError>> {
    return (await this.enrichment()).translate(request, config, signal);
  }
}
