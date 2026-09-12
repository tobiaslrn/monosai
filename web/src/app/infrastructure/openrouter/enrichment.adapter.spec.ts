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

  it('counts an empty findings array as a complete review', async () => {
    const context = harness({ content: 'grammar-empty' });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result).toEqual({ ok: true, value: { findings: [] } });
    expect(context.server.callCount).toBe(1);
    // Sized from the batch: 512 plus 180 per sentence, so a large batch is not
    // asked to answer in a budget that fits a small one.
    expect(context.server.requests[0]?.body['max_tokens']).toBe(
      512 + 180 * GRAMMAR_REQUEST.sentences.length,
    );
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

  it('treats a truncated response as malformed with one bounded recovery', async () => {
    const context = harness({ content: 'grammar-truncated' });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(context.server.callCount).toBe(2);
  });

  it('treats a response beyond the transport limit as malformed with one recovery', async () => {
    const context = harness({ oversizedJson: true });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(result.error.detail?.issueCode).toBe('response-too-large');
    expect(context.server.callCount).toBe(2);
  });

  it('maps ordinal findings back to domain sentence ids', async () => {
    const context = harness({ content: 'grammar-complete' });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings.map((finding) => finding.sentenceId)).toEqual([S0, S1]);
  });

  it.each([
    ['grammar-unknown-sentence', 'grammar-unknown-sentence'],
    ['grammar-duplicate-sentence', 'grammar-duplicate-sentence'],
  ] as const)('rejects %s ordinals at the provider boundary', async (content, issueCode) => {
    const context = harness({ content, recoveryContent: content });

    const result = await context.text.reviewGrammar(GRAMMAR_REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail?.issueCode).toBe(issueCode);
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
    expect(user).toContain('[1] TARGET: ねこがいます。');
    expect(user).toContain('[2] TARGET: ねこはねます。');
    expect(user).toContain('## Reading title\n\nねこの一日');
    expect(user).toContain('Register: polite');
    expect(user).not.toContain('targetIds');
    expect(user).toContain('English: The sentence before.');
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

  it('uses the opening contract with a required glossary and no provider ids for candidates', async () => {
    const request: TranslationBatchRequest = {
      ...TRANSLATION_REQUEST,
      kind: 'opening',
      glossaryCandidates: [
        {
          surfaceJa: 'ねこ',
          kind: 'recurring-term',
          examples: [{ sentenceId: S0, textJa: 'ねこがいます。' }],
        },
      ],
    };
    const context = harness({ content: 'translations-opening' });

    const result = await context.text.translate(request, NATIVE);

    expect(result).toEqual({
      ok: true,
      value: {
        translations: [
          { id: S0, textEn: 'The cat is here.' },
          { id: S1, textEn: 'The cat sleeps.' },
        ],
        glossary: [{ surfaceJa: 'ねこ', renderingEn: 'cat' }],
      },
    });
    const body = context.server.requests[0]?.body ?? {};
    expect(body['response_format']).toMatchObject({
      json_schema: { name: 'monosai_translations' },
    });
    expect(JSON.stringify(body['response_format'])).toContain('TARGET ordinal');
    expect((body['messages'] as readonly { content: string }[])[1]?.content).not.toContain(S0);
  });

  it('uses the tail contract without requiring or returning a glossary', async () => {
    const request: TranslationBatchRequest = { ...TRANSLATION_REQUEST, kind: 'tail' };
    const context = harness({ content: 'translations-full' });

    const result = await context.text.translate(request, NATIVE);

    expect(result).toEqual({
      ok: true,
      value: {
        translations: [
          { id: S0, textEn: 'The cat is here.' },
          { id: S1, textEn: 'The cat sleeps.' },
        ],
      },
    });
    const schema = JSON.stringify(context.server.requests[0]?.body['response_format']);
    expect(schema).not.toContain('glossary');
  });

  it('uses a glossary-only response for glossary repair', async () => {
    const request: TranslationBatchRequest = {
      kind: 'glossary-repair',
      window: [{ targetId: null, textJa: 'ねこがいます。' }],
      glossaryCandidates: [
        {
          surfaceJa: 'ねこ',
          kind: 'recurring-term',
          examples: [{ sentenceId: S0, textJa: 'ねこがいます。' }],
        },
      ],
      openingTranslations: [{ textJa: 'ねこがいます。', textEn: 'The cat is here.' }],
      promptVersion: 'translation/5',
    };
    const context = harness({ content: 'translations-glossary-repair' });

    const result = await context.text.translate(request, NATIVE);

    expect(result).toEqual({
      ok: true,
      value: {
        translations: [],
        glossary: [{ surfaceJa: 'ねこ', renderingEn: 'cat' }],
      },
    });
    const schema = JSON.stringify(context.server.requests[0]?.body['response_format']);
    expect(schema).toContain('glossary');
    expect(schema).not.toContain('translations');
    const user = (context.server.requests[0]?.body['messages'] as readonly { content: string }[])[1]
      ?.content;
    expect(user).toContain('# Saved opening translations');
    expect(user).toContain('English: The cat is here.');
  });
});
