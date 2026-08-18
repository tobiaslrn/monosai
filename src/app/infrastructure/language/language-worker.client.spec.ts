import { describe, expect, it } from 'vitest';
import { LanguageWorkerClient, type LanguageWorkerChannel } from './language-worker.client';
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
    const client = new LanguageWorkerClient(channel);

    const first = client.segment('一。');
    const second = client.segment('二。');
    const [firstId, secondId] = channel.sent.map((message) => message.requestId);

    channel.deliver(segmentResponse(secondId, '二。'));
    channel.deliver(segmentResponse(firstId, '一。'));

    const firstResult = await first;
    const secondResult = await second;
    expect(firstResult.ok && firstResult.value[0].text).toBe('一。');
    expect(secondResult.ok && secondResult.value[0].text).toBe('二。');
  });

  it('cancels through the worker and ignores the late answer', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(channel);
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
    const client = new LanguageWorkerClient(channel);
    const controller = new AbortController();
    controller.abort();

    const result = await client.segment('猫。', controller.signal);
    expect(result.ok).toBe(false);
    expect(channel.sent).toHaveLength(0);
  });

  it('reports a protocol mismatch carried by a response envelope', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(channel);
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
    const client = new LanguageWorkerClient(channel);
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
    const client = new LanguageWorkerClient(channel);
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
    const client = new LanguageWorkerClient(channel);
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
    const client = new LanguageWorkerClient(channel);
    client.dispose();

    const result = await client.segment('猫。');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('worker-unavailable');
    }
  });

  it('passes a worker error through unchanged', async () => {
    const channel = fakeChannel();
    const client = new LanguageWorkerClient(channel);
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
});
