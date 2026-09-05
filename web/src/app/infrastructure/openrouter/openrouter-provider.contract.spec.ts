import { describe } from 'vitest';
import { openRouterHarness } from '../../../testing/ai-fakes';
import {
  runTextProviderContract,
  runTtsProviderContract,
} from '../../../testing/ai-provider-contract';

describe('OpenRouter text provider contract', () => {
  runTextProviderContract((options) => {
    const harness = openRouterHarness(options);
    return { provider: harness.text, requestCount: () => harness.server.callCount };
  });
});

describe('OpenRouter TTS provider contract', () => {
  runTtsProviderContract((options) => {
    const harness = openRouterHarness(options);
    return { provider: harness.tts, requestCount: () => harness.server.callCount };
  });
});
