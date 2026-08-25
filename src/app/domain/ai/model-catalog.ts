import type { Result } from '../shared/result';
import type { AiError } from './ai-error';

export interface ModelCapabilities {
  readonly modelId: string;
  readonly name: string;
  readonly contextLength: number | null;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  readonly supportedParameters: readonly string[];
  readonly supportedVoices: readonly string[];
  readonly reasoning: {
    readonly supportedEfforts: readonly string[] | null;
    readonly defaultEffort: string | null;
    readonly defaultEnabled: boolean | null;
    readonly mandatory: boolean;
    readonly supportsMaxTokens: boolean;
  } | null;
}

export interface ModelCatalog {
  list(
    output: 'text' | 'speech',
    signal?: AbortSignal,
  ): Promise<Result<readonly ModelCapabilities[], AiError>>;
}
