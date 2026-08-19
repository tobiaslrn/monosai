import type { AiError } from '../../domain/ai/ai-error';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import type { ModelTest, TextModelConfig } from '../../domain/ai/model-test';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
  TextGenerationProvider,
  TextTaskConfig,
} from '../../domain/ai/text-generation-provider';
import type { Result } from '../../domain/shared/result';
import type { OpenRouterStoryGenerator } from './story-generation.adapter';
import type { OpenRouterTextModelTester } from './text-model-test.adapter';

/** Supplies the generator on first use, so its prompts can be code-split. */
export type StoryGeneratorLoader = () => Promise<OpenRouterStoryGenerator>;

/**
 * The whole text port, composed from the two adapters that implement it.
 *
 * Configuration testing and story generation share a client but nothing else:
 * the tester's job is to prove a model can be held to a structure, and the
 * generator's is to write Japanese under a vocabulary constraint. Keeping them
 * in separate files means neither grows a second responsibility, and this class
 * exists only so the injection token still resolves to one object.
 *
 * The generator arrives through a loader rather than the constructor because
 * the assembled prompts are several kilobytes that a learner who only imports
 * their own text never needs. The port's methods are already asynchronous, so
 * resolving it on first use costs nothing at the call site, and the loaded
 * instance is kept.
 */
export class OpenRouterTextProvider implements TextGenerationProvider {
  private generator: OpenRouterStoryGenerator | null = null;

  constructor(
    private readonly tester: OpenRouterTextModelTester,
    private readonly loadGenerator: StoryGeneratorLoader,
  ) {}

  private async generation(): Promise<OpenRouterStoryGenerator> {
    this.generator ??= await this.loadGenerator();
    return this.generator;
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
}
