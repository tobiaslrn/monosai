import { describe, expect, it } from 'vitest';
import { openRouterHarness, type HarnessOptions } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';

function test(options: HarnessOptions = {}): ReturnType<typeof openRouterHarness> {
  return openRouterHarness(options);
}

async function run(options: HarnessOptions = {}): Promise<{
  harness: ReturnType<typeof openRouterHarness>;
  result: Awaited<ReturnType<ReturnType<typeof openRouterHarness>['text']['testConfiguration']>>;
}> {
  const harness = test(options);
  const result = await harness.text.testConfiguration({ modelId: FAKE_OPENROUTER.textModel });
  return { harness, result };
}

describe('OpenRouterTextModelTester structured output', () => {
  it('passes a model that answers the native schema', async () => {
    const { harness, result } = await run();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.structuredOutput).toBe('native-schema');
    expect(harness.server.callCount).toBe(1);
    expect(harness.server.requests[0]?.body['response_format']).toBeDefined();
  });

  it('accepts an answer the model wrapped in a code fence', async () => {
    const { result } = await run({ content: 'fenced' });

    expect(result.ok).toBe(true);
  });

  it('falls back to the JSON contract when the provider refuses the schema', async () => {
    const { harness, result } = await run({ supportsJsonSchema: false });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.structuredOutput).toBe('json-contract');
    expect(harness.server.callCount).toBe(2);
    expect(harness.server.requests[1]?.body['response_format']).toBeUndefined();
  });

  it('recovers once from a badly shaped first answer', async () => {
    const { harness, result } = await run({ content: 'prose', recoveryContent: 'valid' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.structuredOutput).toBe('json-contract');
    expect(harness.server.callCount).toBe(2);
  });

  it('never attempts more than one format recovery', async () => {
    const { harness, result } = await run({ content: 'prose', recoveryContent: 'prose' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('malformed-response');
    expect(harness.server.callCount).toBe(2);
  });

  it('fails a model whose JSON has the wrong shape', async () => {
    const { result } = await run({ content: 'wrong-shape', recoveryContent: 'wrong-shape' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('probe-shape');
  });

  it('fails a model whose JSON is cut off', async () => {
    const { result } = await run({ content: 'invalid-json', recoveryContent: 'invalid-json' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('not-json');
  });

  it('fails a model that answers with prose', async () => {
    const { result } = await run({ content: 'prose', recoveryContent: 'prose' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('not-json');
  });

  it('fails a model that answers with nothing', async () => {
    const { result } = await run({ content: 'empty', recoveryContent: 'empty' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.detail?.issueCode).toBe('empty-content');
  });
});

describe('OpenRouterTextModelTester failures', () => {
  it('does not retry a transport failure into a format recovery', async () => {
    const { harness, result } = await run({ status: 401 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('authentication');
    expect(harness.server.callCount).toBe(1);
  });

  it('names the unknown model so the copy can point at the field', async () => {
    const harness = test();

    const result = await harness.text.testConfiguration({ modelId: 'vendor/absent' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('model-not-found');
    expect(result.error.detail?.modelId).toBe('vendor/absent');
  });

  it('reports every failure against the text-model-test task', async () => {
    const { result } = await run({ status: 500 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.task).toBe('text-model-test');
  });
});
