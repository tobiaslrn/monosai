import { DOCUMENT, inject, type Provider } from '@angular/core';
import {
  TEXT_GENERATION_PROVIDER,
  TEXT_TO_SPEECH_PROVIDER,
} from '../../application/shared/ai-tokens';
import { CREDENTIAL_REPOSITORY } from '../../application/shared/repository-tokens';
import { createAudioDecoder } from './audio-decode';
import { OpenRouterClient } from './openrouter-client';
import { OpenRouterTextModelTester } from './text-model-test.adapter';
import { OpenRouterTtsTester } from './tts-test.adapter';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Binds the AI ports to the OpenRouter adapters.
 *
 * Both testers share one client, because the client is where the single
 * outbound request path, the credential boundary, and the retry limits live.
 * The ports stay separate so that a TTS failure cannot reach text readiness.
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
      useFactory: () => new OpenRouterTextModelTester(client()),
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
