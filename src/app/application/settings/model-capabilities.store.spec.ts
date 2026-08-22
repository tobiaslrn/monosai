import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ModelCatalog, ModelCapabilities } from '../../domain/ai/model-catalog';
import { ok } from '../../domain/shared/result';
import { MODEL_CATALOG } from '../shared/ai-tokens';
import { ModelCapabilitiesStore } from './model-capabilities.store';

const CAPABILITIES: ModelCapabilities = {
  modelId: 'google/gemini-test',
  name: 'Gemini Test',
  contextLength: 32_768,
  inputModalities: ['text'],
  outputModalities: ['text'],
  supportedParameters: ['reasoning'],
  supportedVoices: ['Kore'],
  reasoning: null,
};

describe('ModelCapabilitiesStore', () => {
  it('keeps text and TTS discovery results independent', async () => {
    const catalog: ModelCatalog = {
      discover: (modelId) => Promise.resolve(ok({ ...CAPABILITIES, modelId })),
    };
    TestBed.configureTestingModule({
      providers: [ModelCapabilitiesStore, { provide: MODEL_CATALOG, useValue: catalog }],
    });
    const store = TestBed.inject(ModelCapabilitiesStore);

    await store.discover('text', 'google/text-model');
    await store.discover('tts', 'google/tts-model');

    expect(store.text().result?.modelId).toBe('google/text-model');
    expect(store.tts().result?.modelId).toBe('google/tts-model');
  });

  it('clears one target without disturbing the other', async () => {
    const catalog: ModelCatalog = {
      discover: (modelId) => Promise.resolve(ok({ ...CAPABILITIES, modelId })),
    };
    TestBed.configureTestingModule({
      providers: [ModelCapabilitiesStore, { provide: MODEL_CATALOG, useValue: catalog }],
    });
    const store = TestBed.inject(ModelCapabilitiesStore);
    await store.discover('text', 'google/text-model');
    await store.discover('tts', 'google/tts-model');

    store.clear('text');

    expect(store.text().result).toBeNull();
    expect(store.tts().result?.modelId).toBe('google/tts-model');
  });
});
