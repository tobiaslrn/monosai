import { describe, expect, it } from 'vitest';
import type * as z from 'zod';
import { FakeCredentialRepository } from '../../../testing/ai-fakes';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { OpenRouterClient, type OpenRouterRequestContext } from './openrouter-client';
import { OpenRouterModelCatalog } from './model-catalog.adapter';
import { MODELS_PATH } from './openrouter-endpoints';
import { modelCatalogResponseSchema } from './openrouter-response.schema';

const MODEL = {
  id: 'google/gemini-test',
  name: 'Gemini Test',
  context_length: 32_768,
  top_provider: {
    max_completion_tokens: 65_536,
  },
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
      maxCompletionTokens: MODEL.top_provider.max_completion_tokens,
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

  it('leaves the completion maximum unknown when the provider omits it', async () => {
    const { top_provider: _topProvider, ...withoutMaximum } = MODEL;
    const client = new FakeOpenRouterClient(ok({ data: [withoutMaximum] }));
    const catalog = new OpenRouterModelCatalog(client);

    const result = await catalog.list('text');

    expect(result.ok && result.value[0]?.maxCompletionTokens).toBeNull();
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

/**
 * One text-model entry as large as an average entry of the live catalogue
 * (476 text models, 925 136 bytes on 2026-11-21: about 1 950 bytes each).
 */
function catalogueEntry(index: number): Record<string, unknown> {
  return {
    id: `vendor/model-${String(index)}`,
    canonical_slug: `vendor/model-${String(index)}-20261101`,
    hugging_face_id: '',
    name: `Vendor: Model ${String(index)}`,
    created: 1_790_000_000,
    description: 'A general-purpose model. '.repeat(48),
    context_length: 131_072,
    architecture: {
      modality: 'text->text',
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'Other',
      instruct_type: null,
    },
    pricing: { prompt: '0.0000001', completion: '0.0000004' },
    top_provider: { context_length: 131_072, max_completion_tokens: 8_192, is_moderated: false },
    per_request_limits: null,
    supported_parameters: [
      'max_tokens',
      'temperature',
      'top_p',
      'stop',
      'response_format',
      'structured_outputs',
      'reasoning',
      'include_reasoning',
      'tools',
      'tool_choice',
    ],
    default_parameters: { temperature: null, top_p: null, frequency_penalty: null },
    supported_voices: null,
    knowledge_cutoff: null,
    expiration_date: null,
    links: { details: `/api/v1/models/vendor/model-${String(index)}/endpoints` },
  };
}

function catalogueOf(count: number): string {
  return JSON.stringify({
    data: Array.from({ length: count }, (_value, index) => catalogueEntry(index)),
  });
}

function servingClient(body: string): OpenRouterClient {
  return new OpenRouterClient({
    fetchFn: () =>
      Promise.resolve(
        new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    credentials: new FakeCredentialRepository(),
    isOnline: () => true,
    sleep: () => Promise.resolve(),
  });
}

describe('OpenRouterModelCatalog with a catalogue that keeps growing', () => {
  // The live catalogue sat at 88% of the general 1 MiB cap in November 2026.
  // 560 average entries is about two months of additions at that rate, and
  // 2 000 is about four times the catalogue at that time, the margin this
  // test keeps.
  it.each([560, 2_000])('lists every text model in a catalogue of %i models', async (count) => {
    const body = catalogueOf(count);
    expect(body.length).toBeGreaterThan(1024 * 1024);

    const listed = await new OpenRouterModelCatalog(servingClient(body)).list('text');

    expect(listed.ok && listed.value).toHaveLength(count);
  });

  it('keeps the tight cap for every answer other than the catalogue', async () => {
    const body = catalogueOf(560);

    const answered = await servingClient(body).getJson(
      { path: MODELS_PATH, task: 'model-discovery' },
      modelCatalogResponseSchema,
    );

    expect(!answered.ok && answered.error.detail?.issueCode).toBe('response-too-large');
  });
});
