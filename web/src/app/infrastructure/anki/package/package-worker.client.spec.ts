import { describe, expect, it, vi } from 'vitest';
import {
  PACKAGE_PROTOCOL_VERSION,
  type PackageRequestMessage,
  type PackageResponseMessage,
} from './package-protocol';
import {
  PackageWorkerClient,
  packageWorkerChannel,
  type PackageWorkerChannel,
} from './package-worker.client';

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

    recorded.respond(
      success(recorded.posted[0]!.requestId, 'open', {
        memberName: 'collection.anki21b',
        compression: 'zstd',
        packageVersion: 3,
        schemaVersion: 18,
        layout: 'normalized',
        deckCount: 1,
        noteTypeCount: 1,
        hasAnyReviewEvidence: true,
        mediaEntryCount: 0,
      }),
    );
    expect((await pending).ok).toBe(true);
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
    recorded.respond(
      success(recorded.posted[1]!.requestId, 'extract', { examined: 1, fields: [] }),
    );
    recorded.respond(
      success(recorded.posted[0]!.requestId, 'discover', { decks: [], noteTypes: [] }),
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
    recorded.respond(
      success(recorded.posted[0]!.requestId, 'extract', { examined: 0, fields: [] }),
    );

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
      ...success(recorded.posted[0]!.requestId, 'discover', {}),
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
      payload: { targetRequestId: recorded.posted[0]!.requestId },
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
      recorded.respond(success(recorded.posted[0]!.requestId, 'discover', {}));
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

  it('rejects a well-formed envelope whose result value is malformed', async () => {
    const recorded = recordingChannel();
    const error = vi.fn();
    const client = new PackageWorkerClient(recorded.channel, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    });

    const pending = client.discover();
    recorded.respond(
      success(recorded.posted[0]!.requestId, 'discover', { decks: [{ name: 7 }], noteTypes: [] }),
    );

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('malformed-response');
    expect(result.error.cause).toBe(
      'discover: decks.0.name: invalid_type; decks.0.hasChildren: invalid_type',
    );
    expect(error).toHaveBeenCalledWith('worker.operation.failed', {
      worker: 'package',
      operation: 'discover',
      errorCode: 'malformed-response',
    });
  });

  it('rejects a worker error that is not an Anki error instead of hanging', async () => {
    const recorded = recordingChannel();
    const client = new PackageWorkerClient(recorded.channel);

    const pending = client.discover();
    recorded.respond({
      protocolVersion: PACKAGE_PROTOCOL_VERSION,
      requestId: recorded.posted[0]!.requestId,
      outcome: {
        ok: false,
        error: { domain: 'anki', code: 'made-up', message: 'nope' },
      },
    } as unknown as PackageResponseMessage);

    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('malformed-response');
    expect(result.error.cause).toBe('discover: code: invalid_value');
  });
});

describe('packageWorkerChannel when the worker itself fails', () => {
  /** Stands in for a `Worker`: an event target that records what was posted. */
  function fakeWorker(): Worker & { posted: unknown[]; terminated: number } {
    const target = new EventTarget() as Worker & { posted: unknown[]; terminated: number };
    target.posted = [];
    target.terminated = 0;
    target.postMessage = (message: unknown) => {
      target.posted.push(message);
    };
    target.terminate = () => {
      target.terminated += 1;
    };
    return target;
  }

  it.each(['error', 'messageerror'])(
    'settles a pending request with an error once the worker reports %s',
    async (type) => {
      const worker = fakeWorker();
      const client = new PackageWorkerClient(packageWorkerChannel(worker, () => undefined));

      const opening = client.open(new ArrayBuffer(8), 'wasm');
      // The worker script failed to load, threw at top level, or was killed:
      // nothing will ever answer the request that was just posted.
      worker.dispatchEvent(new Event(type));

      const outcome = await Promise.race([
        opening,
        new Promise<'still pending'>((resolve) =>
          setTimeout(() => {
            resolve('still pending');
          }, 50),
        ),
      ]);
      expect(outcome).not.toBe('still pending');
      expect(outcome !== 'still pending' && !outcome.ok && outcome.error.code).toBe(
        'package-unreadable',
      );
      expect(worker.terminated).toBe(1);
      const later = await client.discover();
      expect(!later.ok && later.error.code).toBe('package-unreadable');
    },
  );
});
