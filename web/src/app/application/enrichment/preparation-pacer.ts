import { Injectable } from '@angular/core';
import { PREPARATION_ORDER, type PreparationLayer } from '../../domain/enrichment/preparation';

/**
 * How many preparation requests may be in flight at once, across all three
 * layers together.
 *
 * One number rather than one per layer. Three separate ceilings meant the real
 * ceiling depended on which layers happened to be running, and made "audio is
 * idle" a reason for translation to go no faster. OpenRouter's own limits scale
 * with the account's credit balance and sit far above this for a paid key; only
 * `:free` model variants are tightly capped, and those announce themselves with
 * a 429 that {@link PreparationPacer.backOff} answers.
 */
export const PREPARATION_CONCURRENCY = 10;

/** A permit to have one request in flight. Released exactly once. */
export interface RequestPermit {
  release(): void;
}

interface Waiter {
  readonly position: number;
  readonly layer: number;
  /** Breaks ties between identical keys, so equal waiters keep arrival order. */
  readonly sequence: number;
  readonly signal: AbortSignal;
  readonly resolve: (permit: RequestPermit) => void;
  readonly reject: (reason: Error) => void;
  onAbort?: () => void;
}

/**
 * The order preparation fills a reading in, and the only thing that limits how
 * fast it does.
 *
 * Every request any layer wants to make asks here first, and permits are handed
 * to the lowest `(position, layer)` waiting — so sentence 1's English precedes
 * its grammar, which precedes its audio, which precedes sentence 40's English.
 * That single comparator is the whole "front to back across all three layers"
 * rule; the stores that call it know only about their own aid.
 *
 * It is deliberately not a rate limiter. Monosai sends no fixed throttle and no
 * token bucket: the only reactions to load are the concurrency cap and
 * {@link backOff}, which a real `rate-limited` refusal drives with the provider's
 * own `retryAfterMs`. Inventing a delay the provider did not ask for would slow
 * every learner to protect the few on capped free models.
 */
@Injectable({ providedIn: 'root' })
export class PreparationPacer {
  private inFlight = 0;
  private sequence = 0;
  /** Kept sorted by `(position, layer, sequence)`; the head is always next. */
  private readonly waiting: Waiter[] = [];
  /** Epoch milliseconds before which no new permit is granted. */
  private heldUntil = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Waits for a turn to make one request.
   *
   * Rejects with the abort reason when `signal` fires while still queued, which
   * is how cancellation reaches a batch that never started — nothing already
   * paid for is thrown away, because a granted permit is not revoked.
   */
  acquire(position: number, layer: PreparationLayer, signal?: AbortSignal): Promise<RequestPermit> {
    if (signal?.aborted === true) {
      return Promise.reject(abortReason(signal));
    }
    return new Promise<RequestPermit>((resolve, reject) => {
      this.sequence += 1;
      const waiter: Waiter = {
        position,
        layer: PREPARATION_ORDER.indexOf(layer),
        sequence: this.sequence,
        signal: signal ?? new AbortController().signal,
        resolve,
        reject,
      };
      if (signal !== undefined) {
        waiter.onAbort = (): void => {
          this.drop(waiter);
          reject(abortReason(signal));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.insert(waiter);
      this.pump();
    });
  }

  /**
   * Holds every *new* grant for `ms`, without touching what is in flight.
   *
   * A 429 says the provider wants fewer requests starting, not that the ones it
   * is already answering should be abandoned. Repeated calls extend the hold
   * rather than shortening it, so two limited requests cannot talk each other
   * into resuming early.
   */
  backOff(ms: number): void {
    if (ms <= 0) {
      return;
    }
    const until = Date.now() + ms;
    if (until <= this.heldUntil) {
      return;
    }
    this.heldUntil = until;
    this.scheduleRelease();
  }

  /** How many requests are in flight. Diagnostics and tests only. */
  get active(): number {
    return this.inFlight;
  }

  /** How many callers are waiting for a turn. Diagnostics and tests only. */
  get queued(): number {
    return this.waiting.length;
  }

  private insert(waiter: Waiter): void {
    const index = this.waiting.findIndex((candidate) => precedes(waiter, candidate));
    if (index < 0) {
      this.waiting.push(waiter);
    } else {
      this.waiting.splice(index, 0, waiter);
    }
  }

  private drop(waiter: Waiter): void {
    const index = this.waiting.indexOf(waiter);
    if (index >= 0) {
      this.waiting.splice(index, 1);
    }
  }

  private pump(): void {
    while (this.inFlight < PREPARATION_CONCURRENCY && this.waiting.length > 0) {
      if (Date.now() < this.heldUntil) {
        this.scheduleRelease();
        return;
      }
      const waiter = this.waiting.shift();
      if (waiter === undefined) {
        return;
      }
      if (waiter.onAbort !== undefined) {
        waiter.signal.removeEventListener('abort', waiter.onAbort);
      }
      this.inFlight += 1;
      waiter.resolve(this.permit());
    }
  }

  /** A permit that frees its slot once, however many times it is released. */
  private permit(): RequestPermit {
    let released = false;
    return {
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        this.inFlight -= 1;
        this.pump();
      },
    };
  }

  private scheduleRelease(): void {
    if (this.releaseTimer !== null) {
      return;
    }
    this.releaseTimer = setTimeout(
      () => {
        this.releaseTimer = null;
        this.pump();
      },
      Math.max(this.heldUntil - Date.now(), 0),
    );
  }
}

/**
 * The only reaction to provider load: a real 429, answered for as long as it
 * asked for.
 *
 * Called by every layer at the one place a refusal is classified, so a limited
 * key slows all three layers rather than only the one that met the limit.
 */
export function backOffOnRateLimit(
  pacer: PreparationPacer,
  error: { readonly code: string; readonly detail?: { readonly retryAfterMs?: number } },
): void {
  if (error.code !== 'rate-limited') {
    return;
  }
  pacer.backOff(error.detail?.retryAfterMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS);
}

/** Used only when a 429 arrives without a `Retry-After` Monosai could read. */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 2_000;

/** Strictly earlier in the reading, or the same place asked for first. */
function precedes(left: Waiter, right: Waiter): boolean {
  if (left.position !== right.position) {
    return left.position < right.position;
  }
  if (left.layer !== right.layer) {
    return left.layer < right.layer;
  }
  return left.sequence < right.sequence;
}

/**
 * The run's own abort reason, or a standard one when it gave none.
 *
 * Always an `Error`: a queued waiter's rejection travels through the same
 * `catch` as any other failure, and a non-error reason there is a value nobody
 * downstream can classify.
 */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
}
