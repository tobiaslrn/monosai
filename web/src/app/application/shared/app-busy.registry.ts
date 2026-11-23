import { Injectable, computed, signal, type Signal } from '@angular/core';
import type { BusyWork } from '../../domain/shared/busy-work';

/**
 * Tracks work in progress that a controlled reload must never interrupt: an
 * unsaved import draft, a live generation run, or a running translation or
 * audio job.
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

  readonly isBusy = computed(() => this.reasonsSignal().length > 0);

  /** The first registered work, for a surface that can only name one. */
  readonly busyWork = computed(() => this.reasonsSignal()[0] ?? null);

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
