import type { Result } from '../shared/result';
import type { AiError } from './ai-error';
import type { ModelTest, TextModelConfig } from './model-test';

/**
 * The text side of the AI boundary.
 *
 * Only configuration testing exists today. Story generation, repair, exception
 * review, grammar review, and translation are added to this port by the
 * milestones that implement them, so no method here is ever unimplemented.
 */
export interface TextGenerationProvider {
  testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>>;
}
