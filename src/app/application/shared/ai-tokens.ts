import { InjectionToken } from '@angular/core';
import type { TextGenerationProvider } from '../../domain/ai/text-generation-provider';
import type { TextToSpeechProvider } from '../../domain/ai/text-to-speech-provider';

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
