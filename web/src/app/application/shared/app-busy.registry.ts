import { Injectable, computed, signal, type Signal } from '@angular/core';
import type { BusyWork } from '../../domain/shared/busy-work';

/**
 * Tracks work in progress that a controlled reload must never lose without
 * asking: stories being written or written but unsaved, an Anki package being
 * imported, and text typed on the Paste page.
 *
 * A signal-backed set of reasons rather than a boolean, so unrelated features
 * can hold their own busy state independently without one clearing a reason
 * another is still holding. A feature hands its busy state to `track` as a
 * signal, so the registry derives from it and nothing has to copy it across.
 * A reason says what the work is, not how to say it: each surface that names
 * it words it for itself.
 */
@Injectable({ providedIn: 'root' })
export class AppBusyRegistry {
  private readonly trackedReasons = signal<ReadonlyMap<string, Signal<BusyWork | null>>>(new Map());
  private readonly reasonsSignal = computed<readonly BusyWork[]>(() =>
    [...this.trackedReasons().values()].flatMap((reason) => reason() ?? []),
  );

  private readonly unloadAcceptedSignal = signal(false);

  readonly isBusy = computed(() => this.reasonsSignal().length > 0);

  /** Every piece of work in progress, in the order it was registered. */
  readonly work = this.reasonsSignal;

  /**
   * The learner confirmed a reload that loses this tab's work. A guard that
   * would ask the browser to confirm the unload stands down, so the same
   * question is never asked twice.
   */
  readonly unloadAccepted = this.unloadAcceptedSignal.asReadonly();

  acceptUnload(): void {
    this.unloadAcceptedSignal.set(true);
  }

  /**
   * Follows `reason` under `key` until the returned function releases it: the
   * key is busy whenever the signal holds work.
   */
  track(key: string, reason: Signal<BusyWork | null>): () => void {
    this.trackedReasons.update((current) => new Map(current).set(key, reason));
    return () => {
      this.trackedReasons.update((current) => {
        if (current.get(key) !== reason) {
          return current;
        }
        const next = new Map(current);
        next.delete(key);
        return next;
      });
    };
  }
}
