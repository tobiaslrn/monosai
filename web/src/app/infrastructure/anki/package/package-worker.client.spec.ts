import { describe, expect, it, vi } from 'vitest';
import {
  PACKAGE_PROTOCOL_VERSION,
  type PackageRequestMessage,
  type PackageResponseMessage,
} from './package-protocol';
import { PackageWorkerClient, type PackageWorkerChannel } from './package-worker.client';

interface Recorded {
  readonly channel: PackageWorkerChannel;
  readonly posted: PackageRequestMessage[];
  readonly transfers: (readonly Transferable[] | undefined)[];
  readonly terminated: () => number;
  respond(message: PackageResponseMessage): void;
}

function recordingChannel(): Recorded {
  const posted: PackageRequestMessage[] = [];
  const transfers: (readonly Transferable[] | undefined)[] = [];
  const listeners = new Set<(data: unknown) => void>();
  let terminations = 0;

  return {
    posted,
    transfers,
    terminated: () => terminations,
    respond: (message) => {
      for (const listener of listeners) {
        listener(message);
      }
    },
    channel: {
      post: (message, transfer) => {
        posted.push(message);
        transfers.push(transfer);
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      terminate: () => {
        terminations += 1;
      },
    },
  };
}

type SuccessfulOutcome = Extract<PackageResponseMessage['outcome'], { ok: true }>;

function success(requestId: string, operation: string, value: unknown): PackageResponseMessage {
  return {
    protocolVersion: PACKAGE_PROTOCOL_VERSION,
    requestId,
    outcome: { ok: true, result: { operation, value } as SuccessfulOutcome['result'] },
  };
}

describe('PackageWorkerClient', () => {
  it('transfers the archive rather than copying it', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    const archive = new ArrayBuffer(8);

    const pending = client.open(archive, 'wasm-url');
    expect(recorded.transfers[0]).toEqual([archive]);

    recorded.respond(success(recorded.posted[0].requestId, 'open', { memberName: 'x' }));
    await pending;
  });

  it('multiplexes concurrent requests by id', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);

    const first = client.discover();
    const second = client.extract({
      deckName: 'A',
      deckScope: 'deck-only',
      noteTypeName: 'B',
      expressionFieldName: 'C',
    });

    // Answered out of order on purpose.
    recorded.respond(success(recorded.posted[1].requestId, 'extract', { examined: 1, fields: [] }));
    recorded.respond(
      success(recorded.posted[0].requestId, 'discover', { decks: [], noteTypes: [] }),
    );

    const extracted = await second;
    const discovered = await first;
    expect(extracted.ok).toBe(true);
    expect(discovered.ok).toBe(true);
  });

  it('rejects a result for a different operation than requested', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);

    const pending = client.discover();
    recorded.respond(success(recorded.posted[0].requestId, 'extract', { examined: 0, fields: [] }));

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('malformed-response');
  });

  it('reports a protocol version mismatch', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);

    const pending = client.discover();
    recorded.respond({
      ...success(recorded.posted[0].requestId, 'discover', {}),
      protocolVersion: PACKAGE_PROTOCOL_VERSION + 1,
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unsupported-api');
  });

  it('answers cancelled immediately and tells the worker to stop', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    const controller = new AbortController();

    const pending = client.discover(controller.signal);
    controller.abort();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cancelled');

    const cancel = recorded.posted.find((message) => message.request.operation === 'cancel');
    expect(cancel?.request).toEqual({
      operation: 'cancel',
      payload: { targetRequestId: recorded.posted[0].requestId },
    });
  });

  it('ignores a late answer to a cancelled request', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    const controller = new AbortController();

    const pending = client.discover(controller.signal);
    controller.abort();
    await pending;

    // The answer arrives after the fact; nothing must be resolved by it.
    expect(() => {
      recorded.respond(success(recorded.posted[0].requestId, 'discover', {}));
    }).not.toThrow();
  });

  it('refuses a request that was aborted before it was sent', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    const controller = new AbortController();
    controller.abort();

    const result = await client.discover(controller.signal);
    expect(result.ok).toBe(false);
    expect(recorded.posted).toHaveLength(0);
  });

  it('settles pending requests and terminates the worker on dispose', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);

    const pending = client.discover();
    client.dispose();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cancelled');
    expect(recorded.terminated()).toBe(1);
  });

  it('terminates only once however often dispose is called', () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    client.dispose();
    client.dispose();
    expect(recorded.terminated()).toBe(1);
  });

  it('refuses new requests after dispose', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    client.dispose();

    const result = await client.discover();
    expect(result.ok).toBe(false);
    expect(recorded.posted).toHaveLength(0);
  });

  it('drops a response that is not a valid envelope', () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);
    const settled = vi.fn();

    void client.discover().then(settled);
    recorded.respond({ nonsense: true } as unknown as PackageResponseMessage);

    expect(settled).not.toHaveBeenCalled();
  });
});
