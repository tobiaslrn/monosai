import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../application/shared/diagnostics';
import {
  LanguageWorkerClient,
  workerChannel,
  type LanguageWorkerChannel,
} from './language-worker.client';
import {
  LANGUAGE_PROTOCOL_VERSION,
  type LanguageRequestMessage,
  type LanguageResponseMessage,
} from './worker-protocol';

interface FakeChannel extends LanguageWorkerChannel {
  readonly sent: LanguageRequestMessage[];
  readonly terminated: () => boolean;
  deliver(message: unknown): void;
  lastRequestId(operation: string): string;
}

function fakeChannel(): FakeChannel {
  const sent: LanguageRequestMessage[] = [];
  const listeners = new Set<(data: unknown) => void>();
  let terminated = false;
  return {
    sent,
    terminated: () => terminated,
    post: (message) => sent.push(message),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate: () => {
      terminated = true;
    },
    deliver: (message) => {
      for (const listener of listeners) {
        listener(message);
      }
    },
    lastRequestId: (operation) => {
      const match = [...sent].reverse().find((message) => message.request.operation === operation);
      return match?.requestId ?? '';
    },
  };
}

function errorLogger(): { readonly logger: Logger; readonly error: ReturnType<typeof vi.fn> } {
  const error = vi.fn();
  return {
    error,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    },
  };
}

function segmentResponse(requestId: string, text: string): LanguageResponseMessage {
  return {
    protocolVersion: LANGUAGE_PROTOCOL_VERSION,
    requestId,
    outcome: {
      ok: true,
      result: {
        operation: 'segment',
        value: [{ startUtf16: 0, endUtf16: text.length, text }],
      },
    },
  };
}

describe('LanguageWorkerClient', () => {
  it('routes concurrent responses back to the request that asked for them', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);

    const first = client.segment('一。');
    const second = client.segment('二。');
    const [firstId, secondId] = channel.sent.map((message) => message.requestId);

    channel.deliver(segmentResponse(secondId!, '二。'));
    channel.deliver(segmentResponse(firstId!, '一。'));

    const firstResult = await first;
    const secondResult = await second;
    expect(firstResult.ok && firstResult.value[0]!.text).toBe('一。');
    expect(secondResult.ok && secondResult.value[0]!.text).toBe('二。');
  });

  it('cancels through the worker and ignores the late answer', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const controller = new AbortController();

    const pending = client.segment('長い段落。', controller.signal);
    const requestId = channel.lastRequestId('segment');
    controller.abort();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cancelled');
    }

    const cancelMessage = channel.sent.find((message) => message.request.operation === 'cancel');
    expect(cancelMessage?.request).toEqual({
      operation: 'cancel',
      payload: { targetRequestId: requestId },
    });

    // A late answer must not resolve anything or throw.
    expect(() => {
      channel.deliver(segmentResponse(requestId, '長い段落。'));
    }).not.toThrow();
  });

  it('fails immediately when the signal is already aborted', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const controller = new AbortController();
    controller.abort();

    const result = await client.segment('猫。', controller.signal);
    expect(result.ok).toBe(false);
    expect(channel.sent).toHaveLength(0);
  });

  it('reports a protocol mismatch carried by a response envelope', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');
    const requestId = channel.lastRequestId('segment');

    channel.deliver({
      ...segmentResponse(requestId, '猫。'),
      protocolVersion: LANGUAGE_PROTOCOL_VERSION + 1,
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('protocol-version-mismatch');
    }
  });

  it('rejects a response that answers a different operation', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');
    const requestId = channel.lastRequestId('segment');

    channel.deliver({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: {
        ok: true,
        result: { operation: 'lookup', value: { matchedBy: 'none', entries: [] } },
      },
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-response');
    }
  });

  it('ignores messages that are not valid responses', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');
    const requestId = channel.lastRequestId('segment');

    channel.deliver({ nonsense: true });
    channel.deliver(null);
    channel.deliver(segmentResponse(requestId, '猫。'));

    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('settles pending requests when the worker is disposed', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');

    client.dispose();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('worker-terminated');
    }
    expect(channel.terminated()).toBe(true);
  });

  it('refuses new work after disposal instead of hanging', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    client.dispose();

    const result = await client.segment('猫。');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('worker-unavailable');
    }
  });

  it('passes a worker error through unchanged', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');
    const requestId = channel.lastRequestId('segment');

    channel.deliver({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: {
        ok: false,
        error: { domain: 'language', code: 'analysis-failed', message: 'nope' },
      },
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('analysis-failed');
    }
  });

  it('rejects a well-formed envelope whose result value is malformed', async () => {
    const channel = fakeChannel();
    const { logger, error } = errorLogger();
    const client = new LanguageWorkerClient(() => channel, logger);
    const pending = client.analyzeSentences(['猫。']);
    const requestId = channel.lastRequestId('analyze-sentences');

    channel.deliver({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: {
        ok: true,
        result: {
          operation: 'analyze-sentences',
          value: [{ startUtf16: 0, endUtf16: 2, text: '猫。', tokens: [{ id: 't1' }] }],
        },
      },
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-response');
      // Where it broke, never what it held.
      expect(result.error.cause).toContain('analyze-sentences: 0.tokens.0.');
      expect(result.error.cause).not.toContain('猫');
    }
    expect(error).toHaveBeenCalledWith('language.operation.failed', {
      operation: 'analyze-sentences',
      errorCode: 'invalid-response',
    });
  });

  it('rejects a worker error that is not a language error instead of hanging', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(() => channel);
    const pending = client.segment('猫。');
    const requestId = channel.lastRequestId('segment');

    channel.deliver({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: { ok: false, error: { domain: 'language', code: 'made-up', message: 'nope' } },
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-response');
      expect(result.error.cause).toBe('segment: code: invalid_value');
    }
  });
});

describe('LanguageWorkerClient over a worker that fails', () => {
  /** Stands in for a `Worker`: an event target that records what was posted. */
  function fakeWorker(): Worker & { posted: LanguageRequestMessage[]; stopped: boolean } {
    const target = new EventTarget() as Worker & {
      posted: LanguageRequestMessage[];
      stopped: boolean;
    };
    target.posted = [];
    target.stopped = false;
    target.postMessage = (message: LanguageRequestMessage) => {
      target.posted.push(message);
    };
    target.terminate = () => {
      target.stopped = true;
    };
    return target;
  }

  function answer(worker: Worker, message: LanguageRequestMessage, text: string): void {
    worker.dispatchEvent(
      new MessageEvent('message', { data: segmentResponse(message.requestId, text) }),
    );
  }

  it.each([
    ['reports an error', () => new Event('error')],
    ['sends an answer that cannot be read', () => new MessageEvent('messageerror')],
  ])('fails what is pending when the worker %s', async (_case, failure) => {
    const worker = fakeWorker();
    const client = new LanguageWorkerClient(() => workerChannel(worker));

    const segmenting = client.segment('猫が寝ている。');
    // A module that cannot load, or a worker that crashed, only says so here.
    worker.dispatchEvent(failure());

    const outcome = await segmenting;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('worker-terminated');
    }
    expect(worker.stopped).toBe(true);
  });

  it('starts a fresh worker for the next request and says the old state is gone', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = new LanguageWorkerClient(() => {
      const worker = fakeWorker();
      workers.push(worker);
      return workerChannel(worker);
    });
    const lost = vi.fn();
    client.onStateLost(lost);

    const first = client.segment('猫。');
    workers[0]?.dispatchEvent(new Event('error'));
    await first;
    expect(lost).toHaveBeenCalledTimes(1);

    const second = client.segment('犬。');
    expect(workers).toHaveLength(2);
    const fresh = workers[1];
    const request = fresh?.posted[0];
    if (fresh === undefined || request === undefined) throw new Error('nothing was posted');
    answer(fresh, request, '犬。');
    expect((await second).ok).toBe(true);

    // The dead worker is no longer listened to.
    workers[0]?.dispatchEvent(new Event('error'));
    expect(lost).toHaveBeenCalledTimes(1);
  });
});
