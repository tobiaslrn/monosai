import { InjectionToken } from '@angular/core';
import type { TextGenerationProvider } from '../../domain/ai/text-generation-provider';
import type { TextToSpeechProvider } from '../../domain/ai/text-to-speech-provider';
import type { ModelCatalog } from '../../domain/ai/model-catalog';
import type { StructuredOutputMemo } from '../../domain/ai/structured-output-memo';

/**
 * Injection tokens for the AI ports.
 *
 * Two tokens rather than one provider object, because text and speech are
 * configured, tested, and allowed to fail independently: nothing that consumes
 * one should be able to observe the state of the other.
 */
export const TEXT_GENERATION_PROVIDER = new InjectionToken<TextGenerationProvider>(
  'monosai.text-generation-provider',
);

export const TEXT_TO_SPEECH_PROVIDER = new InjectionToken<TextToSpeechProvider>(
  'monosai.text-to-speech-provider',
);

export const MODEL_CATALOG = new InjectionToken<ModelCatalog>('monosai.model-catalog');

/**
 * Where the request boundary records and reads structured-output downgrades.
 *
 * A token rather than a direct dependency because the memo has to reach the
 * stored text-model settings, and the adapter that consults it must not know
 * where settings live — nor be constructed after the store that owns them.
 */
export const STRUCTURED_OUTPUT_MEMO = new InjectionToken<StructuredOutputMemo>(
  'monosai.structured-output-memo',
);
