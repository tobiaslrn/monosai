import { describe, expect, it } from 'vitest';
import type { ModelCapabilities } from './model-catalog';
import {
  SUGGESTED_TEXT_MODEL_IDS,
  declaresStructuredOutput,
  suggestedTextModels,
} from './suggested-models';

function model(modelId: string, supportedParameters: readonly string[]): ModelCapabilities {
  return {
    modelId,
    name: modelId,
    contextLength: null,
    maxCompletionTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters,
    supportedVoices: [],
    reasoning: null,
  };
}

describe('suggested text models', () => {
  it('accepts either advertised structured-output mode', () => {
    expect(declaresStructuredOutput(model('a', ['structured_outputs']))).toBe(true);
    expect(declaresStructuredOutput(model('b', ['response_format']))).toBe(true);
    expect(declaresStructuredOutput(model('c', ['temperature']))).toBe(false);
  });

  it('keeps the curated order rather than the catalogue order', () => {
    const [first, second] = SUGGESTED_TEXT_MODEL_IDS;
    const catalogue = [
      model(second, ['structured_outputs']),
      model('other/model', ['structured_outputs']),
      model(first, ['response_format']),
    ];

    expect(suggestedTextModels(catalogue).map((entry) => entry.modelId)).toEqual([first, second]);
  });

  /**
   * A suggestion is a claim that the model works. An identifier OpenRouter has
   * retired, or one it no longer says can return structured output, stops being
   * suggested instead of leading somewhere that fails on the first request.
   */
  it('suggests nothing the catalogue cannot currently vouch for', () => {
    const [first] = SUGGESTED_TEXT_MODEL_IDS;

    expect(suggestedTextModels([])).toEqual([]);
    expect(suggestedTextModels([model(first, ['temperature'])])).toEqual([]);
  });
});
