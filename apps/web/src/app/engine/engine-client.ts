import { InjectionToken } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import type { Call } from './api/Call';
import type { ErrorDto } from './api/ErrorDto';
import type { Event } from './api/Event';
import type { Inbound } from './api/Inbound';
import type { Outbound } from './api/Outbound';
import type { Reply } from './api/Reply';
import type { RequestId } from './api/RequestId';

/** How a call to the engine ended: its reply, or why there is none. */
export type CallResult =
  { readonly ok: true; readonly reply: Reply } | { readonly ok: false; readonly error: ErrorDto };

/** The engine as stores and startup see it: typed calls, and what changed. */
export interface EngineClient {
  /**
   * Sends one call and resolves with its result. Aborting `signal` cancels
   * the call in the engine and rejects with the signal's reason.
   */
  call(call: Call, options?: { readonly signal?: AbortSignal }): Promise<CallResult>;
  /** Everything the engine announces, for stores to re-query what they show. */
  readonly events$: Observable<Event>;
}

export const ENGINE_CLIENT = new InjectionToken<EngineClient>('monosai.engine-client');

/**
 * What the worker shim posts: the engine's own messages, plus `failed` when the
 * module could not load or a message could not be handled at all.
 */
export type WorkerMessage = Outbound | { readonly kind: 'failed' };

/** The engine worker, reduced to what the client needs. */
export interface EnginePort {
  post(message: Inbound): void;
  /** Delivers every message from the worker, and calls `failed` if the worker dies. */
  listen(received: (message: WorkerMessage) => void, failed: () => void): void;
}

/** Every call made after the engine stopped, or still waiting when it did, ends with this. */
export const ENGINE_STOPPED: ErrorDto = {
  domain: 'engine',
  code: 'engine-stopped',
  message: 'The engine stopped and cannot answer until the page is reloaded.',
};

/**
 * Talks to the engine worker: numbers requests, keeps those in flight, settles
 * each with its response, and cancels a request whose signal aborts.
 */
export class WorkerEngineClient implements EngineClient {
  private nextId: RequestId = 1;
  private readonly pending = new Map<RequestId, (result: CallResult) => void>();
  private readonly announced = new Subject<Event>();
  private stopped = false;

  readonly events$ = this.announced.asObservable();

  constructor(private readonly port: EnginePort) {
    port.listen(
      (message) => {
        this.receive(message);
      },
      () => {
        this.stop();
      },
    );
  }

  call(call: Call, options: { readonly signal?: AbortSignal } = {}): Promise<CallResult> {
    const { signal } = options;
    if (signal?.aborted === true) {
      return Promise.reject(abortReason(signal));
    }
    if (this.stopped) {
      return Promise.resolve({ ok: false, error: ENGINE_STOPPED });
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<CallResult>((resolve, reject) => {
      const abort = (aborted: AbortSignal): void => {
        this.pending.delete(id);
        this.port.post({ kind: 'cancel', id });
        reject(abortReason(aborted));
      };
      const onAbort = (event: globalThis.Event): void => {
        if (event.target instanceof AbortSignal) {
          abort(event.target);
        }
      };
      this.pending.set(id, (result) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.port.post({ kind: 'request', id, call });
    });
  }

  private receive(message: WorkerMessage): void {
    switch (message.kind) {
      case 'response': {
        const settle = this.pending.get(message.id);
        // A response to a request cancelled here arrives after it was settled.
        if (settle === undefined) {
          return;
        }
        this.pending.delete(message.id);
        settle(
          message.outcome === 'ok'
            ? { ok: true, reply: message.reply }
            : { ok: false, error: message.error },
        );
        return;
      }
      case 'failed':
        this.stop();
        return;
    }
  }

  private stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const settle of this.pending.values()) {
      settle({ ok: false, error: ENGINE_STOPPED });
    }
    this.pending.clear();
    this.announced.complete();
  }
}

/** The signal's reason, as the error a cancelled call rejects with. */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('The call was cancelled.', 'AbortError');
}
