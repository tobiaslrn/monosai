import { Subject } from 'rxjs';
import type { Call } from '../app/engine/api/Call';
import type { ErrorDto } from '../app/engine/api/ErrorDto';
import type { Event } from '../app/engine/api/Event';
import type { CallResult, EngineClient } from '../app/engine/engine-client';

/**
 * An engine client for store and startup tests: answers every call from
 * `answer`, records the calls, and announces whatever a test passes to `emit`.
 */
export class FakeEngineClient implements EngineClient {
  readonly calls: Call[] = [];
  private readonly announced = new Subject<Event>();
  readonly events$ = this.announced.asObservable();

  constructor(
    // Ping is the only call, so every call is answered as a ping.
    private answer: (call: Call) => CallResult = () => ({ ok: true, reply: { type: 'pong' } }),
  ) {}

  call(call: Call): Promise<CallResult> {
    this.calls.push(call);
    return Promise.resolve(this.answer(call));
  }

  /** Every later call fails with `error`. */
  failWith(error: ErrorDto): void {
    this.answer = () => ({ ok: false, error });
  }

  emit(event: Event): void {
    this.announced.next(event);
  }
}
