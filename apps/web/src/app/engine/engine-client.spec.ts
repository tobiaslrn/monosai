import { describe, expect, it } from 'vitest';
import type { Inbound } from './api/Inbound';
import {
  ENGINE_STOPPED,
  WorkerEngineClient,
  type EnginePort,
  type WorkerMessage,
} from './engine-client';

/** A worker that records what the client posts and lets a test answer for it. */
class FakePort implements EnginePort {
  readonly posted: Inbound[] = [];
  private received: (message: WorkerMessage) => void = () => undefined;
  private failed: () => void = () => undefined;

  post(message: Inbound): void {
    this.posted.push(message);
  }

  listen(received: (message: WorkerMessage) => void, failed: () => void): void {
    this.received = received;
    this.failed = failed;
  }

  reply(message: WorkerMessage): void {
    this.received(message);
  }

  die(): void {
    this.failed();
  }

  /** The id of the request posted last. */
  lastId(): number {
    const last = this.posted.at(-1);
    if (last === undefined) {
      throw new Error('nothing was posted');
    }
    return last.id;
  }
}

const refusal = {
  domain: 'engine',
  code: 'open-in-another-tab',
  message: 'Monosai is open in another tab',
} as const;

describe('WorkerEngineClient', () => {
  it('posts a request and resolves with the reply to its id', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);

    const result = client.call({ type: 'ping' });
    expect(port.posted).toEqual([{ kind: 'request', id: 1, call: { type: 'ping' } }]);
    port.reply({ kind: 'response', outcome: 'ok', id: 1, reply: { type: 'pong' } });

    await expect(result).resolves.toEqual({ ok: true, reply: { type: 'pong' } });
  });

  it('resolves an engine error as a failed result rather than throwing', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);

    const result = client.call({ type: 'ping' });
    port.reply({ kind: 'response', outcome: 'err', id: port.lastId(), error: refusal });

    await expect(result).resolves.toEqual({ ok: false, error: refusal });
  });

  it('matches responses to requests by id, whatever order they arrive in', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);

    const first = client.call({ type: 'ping' });
    const second = client.call({ type: 'ping' });
    port.reply({ kind: 'response', outcome: 'err', id: 2, error: refusal });
    port.reply({ kind: 'response', outcome: 'ok', id: 1, reply: { type: 'pong' } });

    await expect(first).resolves.toEqual({ ok: true, reply: { type: 'pong' } });
    await expect(second).resolves.toEqual({ ok: false, error: refusal });
  });

  it('cancels in the engine and rejects when the signal aborts, then ignores the late reply', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);
    const controller = new AbortController();

    const result = client.call({ type: 'ping' }, { signal: controller.signal });
    const id = port.lastId();
    controller.abort(new Error('left the page'));

    await expect(result).rejects.toThrow('left the page');
    expect(port.posted.at(-1)).toEqual({ kind: 'cancel', id });
    expect(() => {
      port.reply({ kind: 'response', outcome: 'ok', id, reply: { type: 'pong' } });
    }).not.toThrow();
  });

  it('never sends a call whose signal already aborted', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);

    await expect(
      client.call({ type: 'ping' }, { signal: AbortSignal.abort(new Error('too late')) }),
    ).rejects.toThrow('too late');
    expect(port.posted).toEqual([]);
  });

  it('ends waiting and later calls as stopped once the worker dies', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);
    const waiting = client.call({ type: 'ping' });

    port.die();

    await expect(waiting).resolves.toEqual({ ok: false, error: ENGINE_STOPPED });
    await expect(client.call({ type: 'ping' })).resolves.toEqual({
      ok: false,
      error: ENGINE_STOPPED,
    });
    expect(port.posted).toHaveLength(1);
  });

  it('treats the shim reporting a failure like a dead worker', async () => {
    const port = new FakePort();
    const client = new WorkerEngineClient(port);
    const waiting = client.call({ type: 'ping' });

    port.reply({ kind: 'failed' });

    await expect(waiting).resolves.toEqual({ ok: false, error: ENGINE_STOPPED });
  });
});
