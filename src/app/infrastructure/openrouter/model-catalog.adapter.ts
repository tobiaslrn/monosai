import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { ModelCapabilities, ModelCatalog } from '../../domain/ai/model-catalog';
import { ok, type Result } from '../../domain/shared/result';
import type { OpenRouterClient } from './openrouter-client';
import { MODELS_PATH } from './openrouter-endpoints';
import {
  modelCatalogResponseSchema,
  type ModelCatalogResponse,
} from './openrouter-response.schema';

const TASK = 'model-discovery';
type CatalogModel = ModelCatalogResponse['data'][number];

function capabilitiesOf(model: CatalogModel): ModelCapabilities {
  return {
    modelId: model.id,
    name: model.name,
    contextLength: model.context_length,
    inputModalities: model.architecture.input_modalities,
    outputModalities: model.architecture.output_modalities,
    supportedParameters: model.supported_parameters,
    supportedVoices: model.supported_voices ?? [],
    reasoning:
      model.reasoning === undefined
        ? null
        : {
            supportedEfforts:
              model.reasoning.supported_efforts?.filter(
                (effort): effort is NonNullable<typeof effort> => effort !== null,
              ) ?? null,
            defaultEffort: model.reasoning.default_effort ?? null,
            defaultEnabled: model.reasoning.default_enabled ?? null,
            mandatory: model.reasoning.mandatory,
            supportsMaxTokens: model.reasoning.supports_max_tokens ?? false,
          },
  };
}

/** Reads and validates the subset of OpenRouter model metadata Monosai uses. */
export class OpenRouterModelCatalog implements ModelCatalog {
  constructor(private readonly client: Pick<OpenRouterClient, 'getJson'>) {}

  async list(
    output: 'text' | 'speech',
    signal?: AbortSignal,
  ): Promise<Result<readonly ModelCapabilities[], AiError>> {
    const query = new URLSearchParams({
      output_modalities: output,
      limit: '1000',
    });
    const listed = await this.client.getJson(
      {
        path: `${MODELS_PATH}?${query.toString()}`,
        task: TASK,
        ...(signal === undefined ? {} : { signal }),
      },
      modelCatalogResponseSchema,
    );
    return listed.ok ? ok(listed.value.data.map(capabilitiesOf)) : listed;
  }
}
