import { expect, it } from 'vitest';
import type { AiErrorCode } from '../app/domain/ai/ai-error';
import type { GrammarReviewRequest } from '../app/domain/ai/grammar-review-request';
import { sentenceRangeForCount, type StoryGenerationRequest } from '../app/domain/ai/story-request';
import type { TextGenerationProvider } from '../app/domain/ai/text-generation-provider';
import { sentenceId, snapshotId } from '../app/domain/shared/ids';
import type { TextToSpeechProvider } from '../app/domain/ai/text-to-speech-provider';
import type { TranslationBatchRequest } from '../app/domain/ai/translation-request';
import type { Result } from '../app/domain/shared/result';
import type { HarnessOptions } from './ai-fakes';
import { FAKE_OPENROUTER } from './openrouter-server';

/**
 * Guarantees every AI provider implementation owes its callers, regardless of
 * which service is behind it.
 *
 * They are written once here and run against each adapter, so a second provider
 * cannot quietly weaken cancellation, offline behaviour, or credential
 * redaction. Service-specific behaviour — status mapping, retry counts, schema
 * handling — belongs in the adapter's own spec.
 */

export interface ProviderContext<TProvider> {
  readonly provider: TProvider;
  /** Requests that actually reached the wire, including retried attempts. */
  readonly requestCount: () => number;
}

export type TextProviderFactory = (
  options?: HarnessOptions,
) => ProviderContext<TextGenerationProvider>;

export type TtsProviderFactory = (
  options?: HarnessOptions,
) => ProviderContext<TextToSpeechProvider>;

function expectFailure<T>(result: Result<T, { code: AiErrorCode }>, code: AiErrorCode): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.error.code).toBe(code);
}

/** Serializes a result including Blob payloads, so nothing can hide a key. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry instanceof Blob ? `blob:${String(entry.size)}` : entry,
  );
}

/** A minimal but complete generation request, for the shared guarantees. */
const CONTRACT_STORY_REQUEST: StoryGenerationRequest = {
  form: 'micro',
  sentenceRange: sentenceRangeForCount(5),
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

const CONTRACT_TASK_CONFIG = {
  modelId: FAKE_OPENROUTER.textModel,
  structuredOutput: 'native-schema',
} as const;

/** A minimal but complete grammar review request, for the shared guarantees. */
const CONTRACT_GRAMMAR_REQUEST: GrammarReviewRequest = {
  profileGuidance: 'Plain, short clauses only.',
  registerPreference: 'either',
  sentences: [{ id: sentenceId('00000000-0000-4000-8000-000000000002'), textJa: 'ねこがいます。' }],
  promptVersion: 'grammar/1',
};

/** A minimal but complete translation request, for the shared guarantees. */
const CONTRACT_TRANSLATION_REQUEST: TranslationBatchRequest = {
  window: [
    {
      targetId: sentenceId('00000000-0000-4000-8000-000000000002'),
      textJa: 'ねこがいます。',
    },
  ],
  promptVersion: 'translation/1',
};

export function runTextProviderContract(create: TextProviderFactory): void {
  it('accepts a model that satisfies the compatibility probe', async () => {
    const result = await create().provider.testConfiguration({
      modelId: FAKE_OPENROUTER.textModel,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.modelId).toBe(FAKE_OPENROUTER.textModel);
  });

  it('rejects a blank model without spending a request', async () => {
    const context = create();

    expectFailure(await context.provider.testConfiguration({ modelId: '   ' }), 'model-not-found');
    expect(context.requestCount()).toBe(0);
  });

  it('reports a rejected key as authentication', async () => {
    expectFailure(
      await create({ apiKeys: ['other-key'] }).provider.testConfiguration({
        modelId: FAKE_OPENROUTER.textModel,
      }),
      'authentication',
    );
  });

  it('reports an offline device without spending a request', async () => {
    const context = create({ online: false });

    expectFailure(
      await context.provider.testConfiguration({ modelId: FAKE_OPENROUTER.textModel }),
      'offline',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('returns cancelled for a signal that is already aborted', async () => {
    const context = create();

    expectFailure(
      await context.provider.testConfiguration(
        { modelId: FAKE_OPENROUTER.textModel },
        AbortSignal.abort(),
      ),
      'cancelled',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('never puts the key in an error', async () => {
    const result = await create({ status: 500 }).provider.testConfiguration({
      modelId: FAKE_OPENROUTER.textModel,
    });

    expect(result.ok).toBe(false);
    expect(serialize(result)).not.toContain(FAKE_OPENROUTER.apiKey);
  });

  it('reports an offline device for a story without spending a request', async () => {
    const context = create({ online: false });

    expectFailure(
      await context.provider.generateStory(CONTRACT_STORY_REQUEST, CONTRACT_TASK_CONFIG),
      'offline',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('returns cancelled for a story whose signal is already aborted', async () => {
    const context = create();

    expectFailure(
      await context.provider.generateStory(
        CONTRACT_STORY_REQUEST,
        CONTRACT_TASK_CONFIG,
        AbortSignal.abort(),
      ),
      'cancelled',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('never puts the key in a generation error', async () => {
    const result = await create({ status: 500 }).provider.generateStory(
      CONTRACT_STORY_REQUEST,
      CONTRACT_TASK_CONFIG,
    );

    expect(result.ok).toBe(false);
    expect(serialize(result)).not.toContain(FAKE_OPENROUTER.apiKey);
  });

  it('reports an offline device for a grammar review without spending a request', async () => {
    const context = create({ online: false });

    expectFailure(
      await context.provider.reviewGrammar(CONTRACT_GRAMMAR_REQUEST, CONTRACT_TASK_CONFIG),
      'offline',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('returns cancelled for a grammar review whose signal is already aborted', async () => {
    const context = create();

    expectFailure(
      await context.provider.reviewGrammar(
        CONTRACT_GRAMMAR_REQUEST,
        CONTRACT_TASK_CONFIG,
        AbortSignal.abort(),
      ),
      'cancelled',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('never puts the key in a grammar review error', async () => {
    const result = await create({ status: 500 }).provider.reviewGrammar(
      CONTRACT_GRAMMAR_REQUEST,
      CONTRACT_TASK_CONFIG,
    );

    expect(result.ok).toBe(false);
    expect(serialize(result)).not.toContain(FAKE_OPENROUTER.apiKey);
  });

  it('reports an offline device for a translation without spending a request', async () => {
    const context = create({ online: false });

    expectFailure(
      await context.provider.translate(CONTRACT_TRANSLATION_REQUEST, CONTRACT_TASK_CONFIG),
      'offline',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('returns cancelled for a translation whose signal is already aborted', async () => {
    const context = create();

    expectFailure(
      await context.provider.translate(
        CONTRACT_TRANSLATION_REQUEST,
        CONTRACT_TASK_CONFIG,
        AbortSignal.abort(),
      ),
      'cancelled',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('never puts the key in a translation error', async () => {
    const result = await create({ status: 500 }).provider.translate(
      CONTRACT_TRANSLATION_REQUEST,
      CONTRACT_TASK_CONFIG,
    );

    expect(result.ok).toBe(false);
    expect(serialize(result)).not.toContain(FAKE_OPENROUTER.apiKey);
  });
}

export function runTtsProviderContract(create: TtsProviderFactory): void {
  const config = {
    modelId: FAKE_OPENROUTER.ttsModel,
    voiceId: FAKE_OPENROUTER.voice,
    speed: 1,
  };

  it('accepts a model and voice that produce decodable audio', async () => {
    const result = await create().provider.testConfiguration(config);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.voiceId).toBe(FAKE_OPENROUTER.voice);
    expect(result.value.byteLength).toBeGreaterThan(0);
  });

  it('rejects a blank model and a blank voice without spending a request', async () => {
    const context = create();

    expectFailure(
      await context.provider.testConfiguration({ ...config, modelId: ' ' }),
      'model-not-found',
    );
    expectFailure(
      await context.provider.testConfiguration({ ...config, voiceId: ' ' }),
      'capability-unsupported',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('reports a rejected key as authentication', async () => {
    expectFailure(
      await create({ apiKeys: ['other-key'] }).provider.testConfiguration(config),
      'authentication',
    );
  });

  it('reports an offline device without spending a request', async () => {
    const context = create({ online: false });

    expectFailure(await context.provider.testConfiguration(config), 'offline');
    expect(context.requestCount()).toBe(0);
  });

  it('returns cancelled for a signal that is already aborted', async () => {
    const context = create();

    expectFailure(
      await context.provider.testConfiguration(config, AbortSignal.abort()),
      'cancelled',
    );
    expect(context.requestCount()).toBe(0);
  });

  it('never puts the key in an error', async () => {
    const result = await create({ status: 500 }).provider.testConfiguration(config);

    expect(result.ok).toBe(false);
    expect(serialize(result)).not.toContain(FAKE_OPENROUTER.apiKey);
  });
}
