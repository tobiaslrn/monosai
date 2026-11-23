import { describe, expect, it } from 'vitest';
import { openRouterHarness } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import type { StoryGenerationRequest } from '../../domain/ai/story-request';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { snapshotId } from '../../domain/shared/ids';
import { OpenRouterStoryGenerator } from './story-generation.adapter';
import { OpenRouterTextProvider } from './openrouter-text-provider';
import { OpenRouterTextModelTester } from './text-model-test.adapter';

const NATIVE: TextTaskConfig = {
  modelId: FAKE_OPENROUTER.textModel,
  structuredOutput: 'native-schema',
};

const REQUEST: StoryGenerationRequest = {
  form: 'micro',
  requestedSentenceCount: 5,
  premise: 'ねこが一日をすごす話。',
  allowedVocabulary: ['ねこ'],
  suggestedVocabulary: ['ねこ'],
  structuralBaseline: ['は'],
  grammarGuidance: 'Write single short clauses.',
  registerPreference: 'either',
  snapshotId: snapshotId('00000000-0000-4000-8000-000000000001'),
  grammarProfileHash: 'profile-hash',
  promptVersion: 'story/1',
};

const chunkFailure = (): Promise<never> =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

describe('OpenRouterTextProvider when its code cannot be loaded', () => {
  it('answers with a failure result instead of rejecting', async () => {
    const { client } = openRouterHarness();
    const provider = new OpenRouterTextProvider(
      new OpenRouterTextModelTester(client),
      chunkFailure,
      chunkFailure,
    );

    const outcome = await provider.generateStory(REQUEST, NATIVE).then(
      (result) => ({ rejected: false, result }),
      () => ({ rejected: true, result: null }),
    );

    expect(outcome.rejected).toBe(false);
    expect(outcome.result?.ok === false && outcome.result.error).toMatchObject({
      code: 'unknown',
      task: 'story-generation',
    });
  });

  it('says the device is offline when that is why the code did not load', async () => {
    const { client } = openRouterHarness();
    const provider = new OpenRouterTextProvider(
      new OpenRouterTextModelTester(client),
      chunkFailure,
      chunkFailure,
      () => false,
    );

    const result = await provider.repairStory(
      {
        original: REQUEST,
        candidate: { titleJa: 'ねこ', sentences: [{ index: 0, textJa: 'ねこがいます。' }] },
        unknownSpans: [],
        structureIssues: [],
        attempt: 1,
        previouslyAttempted: [],
        promptVersion: 'repair/1',
      },
      NATIVE,
    );

    expect(!result.ok && result.error).toMatchObject({ code: 'offline', task: 'story-repair' });
  });

  it('loads again on the next call after a failed load, and only once for concurrent calls', async () => {
    const context = openRouterHarness({ content: 'story' });
    let loads = 0;
    const provider = new OpenRouterTextProvider(
      new OpenRouterTextModelTester(context.client),
      () => {
        loads += 1;
        // Twice: a failed load is tried once more before it counts as failed.
        return loads <= 2
          ? chunkFailure()
          : Promise.resolve(new OpenRouterStoryGenerator(context.client));
      },
      chunkFailure,
    );

    expect((await provider.generateStory(REQUEST, NATIVE)).ok).toBe(false);
    const [first, second] = await Promise.all([
      provider.generateStory(REQUEST, NATIVE),
      provider.generateStory(REQUEST, NATIVE),
    ]);

    expect(first.ok && second.ok).toBe(true);
    expect(loads).toBe(3);
  });

  it('answers cancelled and sends nothing when cancelled while the code loads', async () => {
    const context = openRouterHarness({ content: 'story' });
    const provider = new OpenRouterTextProvider(
      new OpenRouterTextModelTester(context.client),
      () => new Promise<never>(() => undefined),
      chunkFailure,
    );
    const controller = new AbortController();

    const pending = provider.generateStory(REQUEST, NATIVE, controller.signal);
    controller.abort();
    const result = await pending;

    expect(!result.ok && result.error).toMatchObject({
      code: 'cancelled',
      task: 'story-generation',
    });
    expect(context.server.callCount).toBe(0);
  });
});
