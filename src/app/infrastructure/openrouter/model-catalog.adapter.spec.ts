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
  it('maps the SDK model response into the provider-independent capability shape', async () => {
    const catalog = new OpenRouterModelCatalog(
      new FakeCredentialRepository(),
      () => true,
      (_key, parts) => {
        expect(parts).toEqual({ author: 'google', slug: 'gemini-test' });
        return Promise.resolve(MODEL);
      },
    );

    const result = await catalog.discover('google/gemini-test');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        modelId: MODEL.id,
        supportedVoices: ['Kore', 'Puck'],
        reasoning: { supportedEfforts: ['high', 'low'], defaultEffort: 'low' },
      });
    }
  });

  it('rejects an invalid model ID without invoking the SDK', async () => {
    let called = false;
    const catalog = new OpenRouterModelCatalog(
      new FakeCredentialRepository(),
      () => true,
      () => {
        called = true;
        return Promise.resolve(MODEL);
      },
    );

    const result = await catalog.discover('not-a-model-id');

    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });
});
