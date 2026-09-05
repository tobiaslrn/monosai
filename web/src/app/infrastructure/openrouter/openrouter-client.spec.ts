import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  FakeCredentialRepository,
  failingCredentials,
  openRouterHarness,
} from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER, FakeOpenRouterServer } from '../../../testing/openrouter-server';
import type { AiError } from '../../domain/ai/ai-error';
import type { Result } from '../../domain/shared/result';
import type { Logger } from '../../application/shared/diagnostics';
import { OpenRouterClient } from './openrouter-client';
import { CHAT_COMPLETIONS_PATH, OPENROUTER_BASE_URL } from './openrouter-endpoints';
import { chatCompletionSchema } from './openrouter-response.schema';
import { MAX_AUTOMATIC_RETRIES } from './retry-policy';

const probe = {
  path: CHAT_COMPLETIONS_PATH,
  task: 'text-model-test',
  modelId: FAKE_OPENROUTER.textModel,
  body: { model: FAKE_OPENROUTER.textModel },
} as const;

function expectError<T>(result: Result<T, AiError>): AiError {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('expected a failure');
  }
  return result.error;
}

describe('OpenRouterClient requests', () => {
  it('sends the key as a bearer token to the OpenRouter origin only', async () => {
    const harness = openRouterHarness();

    await harness.client.postJson(probe, chatCompletionSchema);

    expect(harness.server.requests).toHaveLength(1);
    expect(harness.server.requests[0]?.apiKey).toBe(FAKE_OPENROUTER.apiKey);
    expect(harness.server.requests[0]?.path).toBe('/api/v1/chat/completions');
  });

  it('fails without a request when no key is saved', async () => {
    const harness = openRouterHarness({ credentials: new FakeCredentialRepository(null) });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'authentication',
    );
    expect(harness.server.callCount).toBe(0);
  });

  it('reports a broken credential store without claiming the key is wrong', async () => {
    const harness = openRouterHarness({ credentials: failingCredentials('unavailable') });

    const error = expectError(await harness.client.postJson(probe, chatCompletionSchema));

    expect(error.code).toBe('unknown');
    expect(error.cause).toBe('storage/unavailable');
  });

  it('refuses to send credentials to an address outside the configured origin', async () => {
    const server = new FakeOpenRouterServer();
    const client = new OpenRouterClient({
      fetchFn: server.fetch,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => Promise.resolve(),
      baseUrl: OPENROUTER_BASE_URL,
    });

    const error = expectError(
      await client.postJson({ ...probe, path: '/../../evil' }, chatCompletionSchema),
    );

    expect(error.code).toBe('unknown');
    expect(server.callCount).toBe(0);
  });
});

describe('OpenRouterClient response validation', () => {
  it('rejects a body that is not JSON', async () => {
    const harness = openRouterHarness({ contentType: 'text/html' });

    const error = expectError(await harness.client.postJson(probe, chatCompletionSchema));

    expect(error.code).toBe('malformed-response');
    expect(error.detail?.issueCode).toBe('content-type');
  });

  it('rejects a body that does not match the schema', async () => {
    const harness = openRouterHarness();

    const error = expectError(
      await harness.client.postJson(probe, z.object({ absent: z.string() })),
    );

    expect(error.code).toBe('malformed-response');
    expect(error.detail?.issueCode).toContain('absent');
  });

  it('refuses an oversized body before buffering it', async () => {
    const harness = openRouterHarness({ oversizedJson: true });

    expect(
      expectError(await harness.client.postJson(probe, chatCompletionSchema)).detail?.issueCode,
    ).toBe('response-too-large');
  });

  it('rejects an empty audio body', async () => {
    const harness = openRouterHarness({ audio: 'empty' });

    const error = expectError(
      await harness.client.postAudio({
        path: '/audio/speech',
        task: 'tts-test',
        body: { model: FAKE_OPENROUTER.ttsModel, voice: FAKE_OPENROUTER.voice },
      }),
    );

    expect(error.detail?.issueCode).toBe('empty-body');
  });

  it('names the schema path but never the payload in the issue code', async () => {
    const harness = openRouterHarness({ content: 'valid' });

    const error = expectError(
      await harness.client.postJson(probe, z.object({ choices: z.string() })),
    );

    expect(error.detail?.issueCode).toBe('choices:invalid_type');
  });
});

describe('OpenRouterClient transport handling', () => {
  it('reports a timeout distinctly from a cancellation', async () => {
    const harness = openRouterHarness({ delayMs: 50, timeoutMs: 1 });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'timeout',
    );
  });

  it('reports cancellation when the caller aborts mid-flight', async () => {
    const harness = openRouterHarness({ delayMs: 50 });
    const controller = new AbortController();
    const pending = harness.client.postJson(
      { ...probe, signal: controller.signal },
      chatCompletionSchema,
    );
    controller.abort();

    expect(expectError(await pending).code).toBe('cancelled');
  });

  it('reports an unreachable provider when the request fails while online', async () => {
    const harness = openRouterHarness({ transportFailure: true });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'provider-unavailable',
    );
  });

  it('reports offline when the connection dropped mid-request', async () => {
    const harness = openRouterHarness({ transportFailure: true, online: false });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'offline',
    );
    expect(harness.server.callCount).toBe(0);
  });
});

describe('OpenRouterClient bounded retry', () => {
  it('retries a rate limit and succeeds within the limit', async () => {
    const harness = openRouterHarness({ transientFailures: 2, transientStatus: 429 });

    const result = await harness.client.postJson(probe, chatCompletionSchema);

    expect(result.ok).toBe(true);
    expect(harness.server.callCount).toBe(3);
    expect(harness.sleeps).toHaveLength(2);
  });

  it('never makes more than the allowed number of attempts', async () => {
    const harness = openRouterHarness({ status: 503 });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'provider-unavailable',
    );
    expect(harness.server.callCount).toBe(MAX_AUTOMATIC_RETRIES + 1);
  });

  it('does not retry a failure the learner has to fix', async () => {
    for (const status of [401, 404, 400]) {
      const harness = openRouterHarness({ status });

      await harness.client.postJson(probe, chatCompletionSchema);

      expect(harness.server.callCount).toBe(1);
    }
  });

  it('does not retry a malformed response', async () => {
    const harness = openRouterHarness({ contentType: 'text/plain' });

    await harness.client.postJson(probe, chatCompletionSchema);

    expect(harness.server.callCount).toBe(1);
  });

  it('waits exactly as long as a short Retry-After asks', async () => {
    const harness = openRouterHarness({
      transientFailures: 1,
      transientStatus: 429,
      retryAfter: '2',
    });

    await harness.client.postJson(probe, chatCompletionSchema);

    expect(harness.sleeps).toEqual([2_000]);
  });

  it('gives up rather than waiting out a long Retry-After', async () => {
    const harness = openRouterHarness({
      transientFailures: 1,
      transientStatus: 429,
      retryAfter: '600',
    });

    expect(expectError(await harness.client.postJson(probe, chatCompletionSchema)).code).toBe(
      'rate-limited',
    );
    expect(harness.server.callCount).toBe(1);
    expect(harness.sleeps).toHaveLength(0);
  });

  it('stops retrying the moment the caller cancels', async () => {
    const harness = openRouterHarness({ status: 503 });
    const controller = new AbortController();
    const client = new OpenRouterClient({
      fetchFn: harness.server.fetch,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
    });

    const error = expectError(
      await client.postJson({ ...probe, signal: controller.signal }, chatCompletionSchema),
    );

    expect(error.code).toBe('cancelled');
    expect(harness.server.callCount).toBe(1);
  });
});

describe('OpenRouterClient redaction', () => {
  it('keeps the key out of every failure it can produce', async () => {
    for (const options of [
      { status: 401 },
      { status: 500 },
      { status: 429 },
      { contentType: 'text/html' },
      { transportFailure: true },
      { delayMs: 50, timeoutMs: 1 },
    ]) {
      const harness = openRouterHarness(options);

      const result = await harness.client.postJson(probe, chatCompletionSchema);

      expect(JSON.stringify(result)).not.toContain(FAKE_OPENROUTER.apiKey);
    }
  });

  it('logs safe request metadata without logging the request body or key', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const logger: Logger = {
      debug: vi.fn(),
      info,
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    };
    const harness = openRouterHarness();
    const client = new OpenRouterClient({
      fetchFn: harness.server.fetch,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => Promise.resolve(),
      logger,
    });

    await client.postJson(
      { ...probe, body: { ...probe.body, secretPrompt: 'private learner text' } },
      chatCompletionSchema,
    );

    const serializedCalls = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    expect(serializedCalls).not.toContain(FAKE_OPENROUTER.apiKey);
    expect(serializedCalls).not.toContain('private learner text');
    expect(serializedCalls).toContain(FAKE_OPENROUTER.textModel);
  });
});

describe('OpenRouterClient edge responses', () => {
  function clientWith(fetchFn: typeof fetch): OpenRouterClient {
    return new OpenRouterClient({
      fetchFn,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => Promise.resolve(),
      correlationId: () => 'cid',
    });
  }

  it('rejects a body that claims to be JSON but is not', async () => {
    const client = clientWith(() =>
      Promise.resolve(
        new Response('{"choices": ', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const error = expectError(await client.postJson(probe, chatCompletionSchema));

    expect(error.detail?.issueCode).toBe('invalid-json');
  });

  it('classifies a rejection whose body is not an error envelope', async () => {
    const client = clientWith(() =>
      Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 })),
    );

    const error = expectError(await client.postJson(probe, chatCompletionSchema));

    expect(error.code).toBe('provider-unavailable');
    expect(JSON.stringify(error)).not.toContain('html');
  });

  it('refuses an oversized body that declared no length', async () => {
    const client = clientWith(() =>
      Promise.resolve(
        new Response(new ArrayBuffer(9 * 1024 * 1024), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      ),
    );

    const error = expectError(
      await client.postAudio({
        path: '/audio/speech',
        task: 'tts-test',
        voiceId: 'sakura',
        body: {},
      }),
    );

    expect(error.detail?.issueCode).toBe('response-too-large');
  });

  it('treats a missing content type as no content type', async () => {
    const client = clientWith(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: {} })),
    );

    const error = expectError(await client.postJson(probe, chatCompletionSchema));

    expect(error.detail?.issueCode).toBe('content-type');
  });

  it('names the requested voice when a synthesis request is refused', async () => {
    const client = clientWith(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Unknown voice', param: 'voice' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const error = expectError(
      await client.postAudio({
        path: '/audio/speech',
        task: 'tts-test',
        modelId: 'vendor/tts-model',
        voiceId: 'sakura',
        body: {},
      }),
    );

    expect(error.detail?.voiceId).toBe('sakura');
    expect(error.detail?.capability).toBe('voice');
  });

  it('reports cancellation when the request was aborted rather than timing out', async () => {
    const controller = new AbortController();
    const client = clientWith(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });

    const error = expectError(
      await client.postJson({ ...probe, signal: controller.signal }, chatCompletionSchema),
    );

    expect(error.code).toBe('cancelled');
  });

  it('stops before waiting when the caller cancels during a retryable attempt', async () => {
    const controller = new AbortController();
    let calls = 0;
    const client = clientWith(() => {
      calls += 1;
      controller.abort();
      return Promise.resolve(new Response('{}', { status: 503 }));
    });

    const error = expectError(
      await client.postJson({ ...probe, signal: controller.signal }, chatCompletionSchema),
    );

    expect(error.code).toBe('cancelled');
    expect(calls).toBe(1);
  });
});
