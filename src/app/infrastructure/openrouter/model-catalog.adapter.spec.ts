import type { Model } from '@openrouter/sdk/models';
import { describe, expect, it } from 'vitest';
import { FakeCredentialRepository } from '../../../testing/ai-fakes';
import { OpenRouterModelCatalog } from './model-catalog.adapter';

const MODEL = {
  id: 'google/gemini-test',
  name: 'Gemini Test',
  contextLength: 32_768,
  architecture: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    modality: 'text->text',
  },
  supportedParameters: ['reasoning', 'structured_outputs'],
  supportedVoices: ['Kore', 'Puck'],
  reasoning: {
    supportedEfforts: ['high', 'low'],
    defaultEffort: 'low',
    defaultEnabled: true,
    mandatory: false,
    supportsMaxTokens: true,
  },
} as Model;

describe('OpenRouterModelCatalog', () => {
  it('maps a listing into the provider-independent capability shape', async () => {
    const catalog = new OpenRouterModelCatalog(
      new FakeCredentialRepository(),
      () => true,
      (_key, output) => {
        expect(output).toBe('text');
        return Promise.resolve([MODEL]);
      },
    );

    const result = await catalog.list('text');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      modelId: MODEL.id,
      supportedVoices: ['Kore', 'Puck'],
      reasoning: { supportedEfforts: ['high', 'low'], defaultEffort: 'low' },
    });
  });

  it('asks for the modality that was requested', async () => {
    let asked: string | null = null;
    const catalog = new OpenRouterModelCatalog(
      new FakeCredentialRepository(),
      () => true,
      (_key, output) => {
        asked = output;
        return Promise.resolve([]);
      },
    );

    await catalog.list('speech');

    expect(asked).toBe('speech');
  });

  it('reports being offline without invoking the SDK', async () => {
    let called = false;
    const catalog = new OpenRouterModelCatalog(
      new FakeCredentialRepository(),
      () => false,
      () => {
        called = true;
        return Promise.resolve([MODEL]);
      },
    );

    const result = await catalog.list('text');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('offline');
    expect(called).toBe(false);
  });

  it('names a rejected key rather than an unavailable provider', async () => {
    const catalog = new OpenRouterModelCatalog(new FakeCredentialRepository(), () => true, () => {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    });

    const result = await catalog.list('text');

    expect(!result.ok && result.error.code).toBe('authentication');
  });

  it('reports a cancelled listing as cancelled', async () => {
    const controller = new AbortController();
    const catalog = new OpenRouterModelCatalog(new FakeCredentialRepository(), () => true, () => {
      controller.abort();
      throw new Error('aborted');
    });

    const result = await catalog.list('text', controller.signal);

    expect(!result.ok && result.error.code).toBe('cancelled');
  });
});
