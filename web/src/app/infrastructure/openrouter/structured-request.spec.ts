import { describe, expect, it } from 'vitest';
import { openRouterHarness } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { TRUNCATED_REPLY_ISSUE_CODE } from '../../domain/ai/ai-error';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import type { StructuredOutputMemo } from '../../domain/ai/structured-output-memo';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type { GrammarReviewRequest } from '../../domain/ai/grammar-review-request';
import { sentenceId } from '../../domain/shared/ids';
import { OpenRouterEnricher } from './enrichment.adapter';

const NATIVE: TextTaskConfig = {
  modelId: FAKE_OPENROUTER.textModel,
  structuredOutput: 'native-schema',
};

const REQUEST: GrammarReviewRequest = {
  profileGuidance: 'Plain, short clauses only.',
  registerPreference: 'either',
  sentences: [{ id: sentenceId('s0'), textJa: 'ねこがいます。' }],
  promptVersion: 'grammar/1',
};

/** A memo that records what it was told, so a test can read the decision back. */
function recordingMemo(seeded: readonly string[] = []): StructuredOutputMemo & {
  readonly downgraded: string[];
} {
  const downgraded = [...seeded];
  return {
    downgraded,
    modeFor: (modelId: string): StructuredOutputMode | null =>
      downgraded.includes(modelId) ? 'json-contract' : null,
    rememberDowngrade: (modelId: string): void => {
      downgraded.push(modelId);
    },
  };
}

describe('StructuredTaskRunner truncation', () => {
  it('reports a reply stopped at the token limit as an output budget failure', async () => {
    const harness = openRouterHarness({ content: 'grammar-complete', truncatesReply: true });
    const enricher = new OpenRouterEnricher(harness.client);

    const result = await enricher.reviewGrammar(REQUEST, NATIVE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('context-budget-exceeded');
    expect(result.error.detail?.issueCode).toBe(TRUNCATED_REPLY_ISSUE_CODE);
  });

  it('spends no format recovery on it, because a new wrapper buys no room', async () => {
    const harness = openRouterHarness({ content: 'grammar-complete', truncatesReply: true });
    const enricher = new OpenRouterEnricher(harness.client);

    await enricher.reviewGrammar(REQUEST, NATIVE);

    expect(harness.server.callCount).toBe(1);
  });
});

describe('StructuredTaskRunner structured-output memo', () => {
  it('skips the native attempt entirely for a model already known to refuse it', async () => {
    const harness = openRouterHarness({ content: 'grammar-complete' });
    const memo = recordingMemo([FAKE_OPENROUTER.textModel]);
    const enricher = new OpenRouterEnricher(harness.client, memo);

    const result = await enricher.reviewGrammar(REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['response_format']).toBeUndefined();
  });

  it('remembers the refusal, so the second request is paid once per model', async () => {
    const harness = openRouterHarness({
      content: 'grammar-complete',
      supportsJsonSchema: false,
    });
    const memo = recordingMemo();
    const enricher = new OpenRouterEnricher(harness.client, memo);

    const first = await enricher.reviewGrammar(REQUEST, NATIVE);
    expect(first.ok).toBe(true);
    expect(harness.server.callCount).toBe(2);
    expect(memo.downgraded).toEqual([FAKE_OPENROUTER.textModel]);

    const second = await enricher.reviewGrammar(REQUEST, NATIVE);
    expect(second.ok).toBe(true);
    // One more request, not two: the refusal was discovered once.
    expect(harness.server.callCount).toBe(3);
  });
});

describe('the enrichment request boundary', () => {
  it('sends contracts a strict provider accepts', async () => {
    const harness = openRouterHarness({
      content: 'grammar-complete',
      rejectsArrayBounds: true,
    });
    const enricher = new OpenRouterEnricher(harness.client);

    const result = await enricher.reviewGrammar(REQUEST, NATIVE);

    expect(result.ok).toBe(true);
    // One request: the schema was accepted, so no recovery was needed.
    expect(harness.server.callCount).toBe(1);
  });

  it('asks for minimal reasoning, so the reply budget is spent on the reply', async () => {
    const harness = openRouterHarness({ content: 'grammar-complete' });
    const enricher = new OpenRouterEnricher(harness.client);

    await enricher.reviewGrammar(REQUEST, NATIVE);

    expect(harness.server.requests[0]?.body['reasoning']).toEqual({
      effort: 'minimal',
      exclude: true,
    });
  });
});
