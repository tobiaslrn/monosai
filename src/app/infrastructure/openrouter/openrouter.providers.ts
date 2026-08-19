import { DOCUMENT, inject, type Provider } from '@angular/core';
import {
  TEXT_GENERATION_PROVIDER,
  TEXT_TO_SPEECH_PROVIDER,
} from '../../application/shared/ai-tokens';
import { CREDENTIAL_REPOSITORY } from '../../application/shared/repository-tokens';
import { createAudioDecoder } from './audio-decode';
import { OpenRouterClient } from './openrouter-client';
import { OpenRouterTextProvider } from './openrouter-text-provider';
import { OpenRouterTextModelTester } from './text-model-test.adapter';
import { OpenRouterTtsTester } from './tts-test.adapter';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Binds the AI ports to the OpenRouter adapters.
 *
 * Every adapter shares one client, because the client is where the single
 * outbound request path, the credential boundary, and the retry limits live.
 * The ports stay separate so that a TTS failure cannot reach text readiness,
 * and the text port is composed from a tester and a generator so neither file
 * has to carry the other's job.
 */
export function provideOpenRouter(): Provider[] {
  const client = (): OpenRouterClient => {
    const view = inject(DOCUMENT).defaultView;
    return new OpenRouterClient({
      fetchFn: (input, init) => fetch(input, init),
      credentials: inject(CREDENTIAL_REPOSITORY),
      isOnline: () => view?.navigator.onLine ?? true,
      sleep: delay,
    });
  };

  return [
    {
      provide: TEXT_GENERATION_PROVIDER,
      useFactory: () => {
        const shared = client();
        return new OpenRouterTextProvider(
          new OpenRouterTextModelTester(shared),
          // Loaded on the first generation, so the prompt assets stay out of
          // the initial bundle for a learner who only imports their own text.
          async () =>
            new (await import('./story-generation.adapter')).OpenRouterStoryGenerator(shared),
        );
      },
    },
    {
      provide: TEXT_TO_SPEECH_PROVIDER,
      useFactory: () => {
        const view = inject(DOCUMENT).defaultView;
        return new OpenRouterTtsTester(client(), createAudioDecoder(view ?? globalThis.window));
      },
    },
  ];
}
