import { describe, expect, it } from 'vitest';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import type { GrammarReviewRequest } from '../../domain/ai/grammar-review-request';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type { TranslationBatchRequest } from '../../domain/ai/translation-request';
import { sentenceId } from '../../domain/shared/ids';

const NATIVE: TextTaskConfig = {
  modelId: FAKE_OPENROUTER.textModel,
  structuredOutput: 'native-schema',
};

const S0 = sentenceId('s0');
const S1 = sentenceId('s1');

function harness(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

const GRAMMAR_REQUEST: GrammarReviewRequest = {
  profileGuidance: 'Plain, short clauses only.',
  registerPreference: 'either',
  sentences: [
    { id: S0, textJa: 'ねこがいます。' },
    { id: S1, textJa: 'ねこはねかされました。' },
  ],
  promptVersion: 'grammar/1',
};

const TRANSLATION_REQUEST: TranslationBatchRequest = {
  window: [
    { targetId: S0, textJa: 'ねこがいます。' },
    { targetId: S1, textJa: 'ねこはねます。' },
  ],
  titleJa: 'ねこの一日',
  registerPreference: 'polite',
  promptVersion: 'translation/1',
};

describe('OpenRouterEnricher grammar review', () => {
  it('returns findings for a well-formed reply', async () => {
    const context = harness({ content: 'grammar-complete' });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.findings).toHaveLength(2);
    expect(result.value.findings[0]).toMatchObject({
      sentenceId: 's0',
      inProfile: true,
      spanJa: 'ねこが',
    });
    expect(result.value.findings[1]).toMatchObject({ sentenceId: 's1', inProfile: false });
    expect(context.server.callCount).toBe(1);
  });

  it('recovers once from a malformed reply, and does not retry again', async () => {
    const context = harness({
      content: 'grammar-unavailable',
      recoveryContent: 'grammar-complete',
    });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    expect(context.server.callCount).toBe(2);
  });

  it('gives up after one failed recovery attempt', async () => {
    const context = harness({ content: 'grammar-unavailable' });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(context.server.callCount).toBe(2);
  });
});

describe('OpenRouterEnricher translation', () => {
  it('returns matched translations for a well-formed reply', async () => {
    const context = harness({ content: 'translations-full' });

    const result = await context.text.translate(TRANSLATION_REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual([
      { id: S0, textEn: 'The cat is here.' },
      { id: S1, textEn: 'The cat sleeps.' },
    ]);
    expect(context.server.callCount).toBe(1);
  });

  it('sends ordinals and context in one window, and restores the caller ids', async () => {
    const context = harness({ content: 'translations-full' });
    const contextual: TranslationBatchRequest = {
      window: [
        { targetId: null, textJa: 'まえの文。', textEn: 'The sentence before.' },
        ...TRANSLATION_REQUEST.window,
      ],
      titleJa: 'ねこの一日',
      registerPreference: 'polite',
      promptVersion: 'translation/1',
    };

    await context.text.translate(contextual, NATIVE);

    const messages = context.server.requests[0].body['messages'] as readonly {
      content: string;
    }[];
    const user = messages[1].content;
    // No generated ids on the wire, and each sentence appears exactly once.
    expect(user).not.toContain('s0');
    expect(user).toContain('"targetIds":["1","2"]');
    expect(user).toContain('"readingTitleJa":"ねこの一日"');
    expect(user).toContain('"register":"polite"');
    expect(user).toContain('"textEn":"The sentence before."');
    expect(user.match(/ねこがいます。/gu)).toHaveLength(1);
  });

  it('rejects an answer for a context entry the batch did not ask about', async () => {
    const context = harness({ content: 'translations-full', recoveryContent: 'translations-full' });
    // Entry 0 is context, so ids "0" and "1" name one context entry and one
    // target — an extra translation, not a complete batch.
    const shifted: TranslationBatchRequest = {
      window: [{ targetId: null, textJa: 'まえの文。' }, ...TRANSLATION_REQUEST.window],
      promptVersion: 'translation/1',
    };

    const result = await context.text.translate(shifted, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
  });

  it('treats a duplicate id as malformed, spending at most one recovery', async () => {
    const context = harness({
      content: 'translations-duplicate-id',
      recoveryContent: 'translations-duplicate-id',
    });

    const result = await context.text.translate(TRANSLATION_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(context.server.callCount).toBe(2);
  });

  it('treats an extra id as malformed, spending at most one recovery', async () => {
    const context = harness({
      content: 'translations-extra-id',
      recoveryContent: 'translations-extra-id',
    });

    const result = await context.text.translate(TRANSLATION_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(context.server.callCount).toBe(2);
  });

  it('treats a partial reply as malformed', async () => {
    const context = harness({ content: 'translations-partial' });

    const result = await context.text.translate(TRANSLATION_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
  });
});
