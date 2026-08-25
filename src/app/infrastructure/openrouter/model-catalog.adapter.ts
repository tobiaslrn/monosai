import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { ModelCapabilities, ModelCatalog } from '../../domain/ai/model-catalog';
import type { CredentialRepository } from '../../domain/settings/credential-repository';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Model } from '@openrouter/sdk/models';

const TASK = 'model-discovery';
type ModelGetter = (
  apiKey: string,
  parts: { author: string; slug: string },
  signal?: AbortSignal,
) => Promise<Model>;
type ModelLister = (
  apiKey: string,
  output: 'text' | 'speech',
  signal?: AbortSignal,
) => Promise<readonly Model[]>;

const getWithSdk: ModelGetter = async (apiKey, parts, signal) => {
  const { OpenRouter } = await import('@openrouter/sdk');
  const sdk = new OpenRouter({
    apiKey,
    appTitle: 'Monosai',
    httpReferer: globalThis.location.origin,
    retryConfig: { strategy: 'none' },
  });
  const response = await sdk.models.get(parts, {
    fetchOptions: signal === undefined ? {} : { signal },
  });
  return response.data;
};

const listWithSdk: ModelLister = async (apiKey, output, signal) => {
  const { OpenRouter } = await import('@openrouter/sdk');
  const sdk = new OpenRouter({
    apiKey,
    appTitle: 'Monosai',
    httpReferer: globalThis.location.origin,
    retryConfig: { strategy: 'none' },
  });
  const page = await sdk.models.list(
    { outputModalities: output, limit: 1_000 },
    { fetchOptions: signal === undefined ? {} : { signal } },
  );
  return page.result.data;
};

function capabilitiesOf(model: Model): ModelCapabilities {
  return {
    modelId: model.id,
    name: model.name,
    contextLength: model.contextLength,
    inputModalities: model.architecture.inputModalities,
    outputModalities: model.architecture.outputModalities,
    supportedParameters: model.supportedParameters,
    supportedVoices: model.supportedVoices ?? [],
    reasoning:
      model.reasoning === undefined
        ? null
        : {
            supportedEfforts:
              model.reasoning.supportedEfforts?.filter(
                (effort): effort is NonNullable<typeof effort> => effort !== null,
              ) ?? null,
            defaultEffort: model.reasoning.defaultEffort ?? null,
            defaultEnabled: model.reasoning.defaultEnabled ?? null,
            mandatory: model.reasoning.mandatory,
            supportsMaxTokens: model.reasoning.supportsMaxTokens ?? false,
          },
  };
}

function modelParts(modelId: string): { author: string; slug: string } | null {
  const separator = modelId.indexOf('/');
  if (separator <= 0 || separator === modelId.length - 1) {
    return null;
  }
  return { author: modelId.slice(0, separator), slug: modelId.slice(separator + 1) };
}

function statusOf(thrown: unknown): number | null {
  if (typeof thrown !== 'object' || thrown === null) {
    return null;
  }
  const status: unknown = Reflect.get(thrown, 'statusCode') ?? Reflect.get(thrown, 'status');
  return typeof status === 'number' ? status : null;
}

/** Reads OpenRouter's normalized model metadata through its official TypeScript SDK. */
export class OpenRouterModelCatalog implements ModelCatalog {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly isOnline: () => boolean,
    private readonly getModel: ModelGetter = getWithSdk,
    private readonly listModels: ModelLister = listWithSdk,
  ) {}

  async discover(
    requestedModelId: string,
    signal?: AbortSignal,
  ): Promise<Result<ModelCapabilities, AiError>> {
    const modelId = requestedModelId.trim();
    const parts = modelParts(modelId);
    if (parts === null) {
      return err(aiError('model-not-found', TASK, 'The model ID is not in vendor/model form.'));
    }
    if (!this.isOnline()) {
      return err(aiError('offline', TASK, 'The device is offline.'));
    }

    const unlocked = await this.credentials.useApiKey(async (apiKey) => {
      try {
        const model = await this.getModel(apiKey, parts, signal);
        return ok(capabilitiesOf(model));
      } catch (thrown) {
        if (signal?.aborted === true) {
          return err(aiError('cancelled', TASK, 'Model discovery was cancelled.'));
        }
        const status = statusOf(thrown);
        if (status === 404) {
          return err(
            aiError('model-not-found', TASK, 'OpenRouter does not offer that exact model.', {
              detail: { modelId },
            }),
          );
        }
        if (status === 401 || status === 403) {
          return err(aiError('authentication', TASK, 'OpenRouter rejected the saved key.'));
        }
        return err(
          aiError('provider-unavailable', TASK, 'OpenRouter model discovery failed.', {
            detail: status === null ? undefined : { status },
          }),
        );
      }
    });

    return unlocked.ok
      ? unlocked.value
      : err(aiError('authentication', TASK, 'No usable OpenRouter key is saved.'));
  }

  async list(
    output: 'text' | 'speech',
    signal?: AbortSignal,
  ): Promise<Result<readonly ModelCapabilities[], AiError>> {
    if (!this.isOnline()) return err(aiError('offline', TASK, 'The device is offline.'));
    const unlocked = await this.credentials.useApiKey(async (apiKey) => {
      try {
        const models = await this.listModels(apiKey, output, signal);
        return ok<readonly ModelCapabilities[]>(models.map(capabilitiesOf));
      } catch (thrown) {
        if (signal?.aborted === true) {
          return err(aiError('cancelled', TASK, 'Model discovery was cancelled.'));
        }
        const status = statusOf(thrown);
        if (status === 401 || status === 403) {
          return err(aiError('authentication', TASK, 'OpenRouter rejected the saved key.'));
        }
        return err(aiError('provider-unavailable', TASK, 'OpenRouter model discovery failed.'));
      }
    });
    return unlocked.ok
      ? unlocked.value
      : err(aiError('authentication', TASK, 'No usable OpenRouter key is saved.'));
  }
}
