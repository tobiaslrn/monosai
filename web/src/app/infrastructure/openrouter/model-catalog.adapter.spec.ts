import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { OpenRouterRequestContext } from './openrouter-client';
import { OpenRouterModelCatalog } from './model-catalog.adapter';

const MODEL = {
  id: 'google/gemini-test',
  name: 'Gemini Test',
  context_length: 32_768,
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
  },
  supported_parameters: ['reasoning', 'structured_outputs'],
  supported_voices: ['Kore', 'Puck'],
  reasoning: {
    supported_efforts: ['high', null, 'low'],
    default_effort: 'low',
    default_enabled: true,
    mandatory: false,
    supports_max_tokens: true,
  },
} as const;

class FakeOpenRouterClient {
  request: OpenRouterRequestContext | null = null;

  constructor(private readonly outcome: Result<unknown, AiError>) {}

  getJson<T>(request: OpenRouterRequestContext, schema: z.ZodType<T>): Promise<Result<T, AiError>> {
    this.request = request;
    if (!this.outcome.ok) {
      return Promise.resolve(err(this.outcome.error));
    }
    return Promise.resolve(ok(schema.parse(this.outcome.value)));
  }
}

describe('OpenRouterModelCatalog', () => {
  it('maps a listing into the provider-independent capability shape', async () => {
    const client = new FakeOpenRouterClient(ok({ data: [MODEL] }));
    const catalog = new OpenRouterModelCatalog(client);

    const result = await catalog.list('text');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      modelId: MODEL.id,
      name: MODEL.name,
      contextLength: MODEL.context_length,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['reasoning', 'structured_outputs'],
      supportedVoices: ['Kore', 'Puck'],
      reasoning: {
        supportedEfforts: ['high', 'low'],
        defaultEffort: 'low',
        defaultEnabled: true,
        mandatory: false,
        supportsMaxTokens: true,
      },
    });
  });

  it('asks for the requested modality with the model-discovery task', async () => {
    const client = new FakeOpenRouterClient(ok({ data: [] }));
    const catalog = new OpenRouterModelCatalog(client);

    await catalog.list('speech');

    expect(client.request?.path).toBe('/models?output_modalities=speech&limit=1000');
    expect(client.request?.task).toBe('model-discovery');
  });

  it('forwards cancellation to the shared client', async () => {
    const client = new FakeOpenRouterClient(ok({ data: [] }));
    const catalog = new OpenRouterModelCatalog(client);
    const controller = new AbortController();

    await catalog.list('text', controller.signal);

    expect(client.request?.signal).toBe(controller.signal);
  });

  it.each(['offline', 'authentication', 'cancelled'] as const)(
    'preserves a shared-client %s failure',
    async (code) => {
      const failure = aiError(code, 'model-discovery', `Test ${code} failure.`);
      const catalog = new OpenRouterModelCatalog(new FakeOpenRouterClient(err(failure)));

      const result = await catalog.list('text');

      expect(result).toEqual(err(failure));
    },
  );
});
