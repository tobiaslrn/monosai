import { Injectable, computed, signal, type Signal } from '@angular/core';

/**
 * Tracks work in progress that a controlled reload must never interrupt: an
 * unsaved import draft, a live generation run, or a running translation or
 * audio job.
 *
 * A signal-backed set of reasons rather than a boolean, so unrelated features
 * can register and clear their own busy state independently without one
 * clearing a reason another is still holding.
 *
 * A store whose busy state is already a signal hands that signal to `track`,
 * so the registry derives from it and nothing has to copy it across.
 */
@Injectable({ providedIn: 'root' })
export class AppBusyRegistry {
  private readonly setReasons = signal<ReadonlyMap<string, string>>(new Map());
  private readonly trackedReasons = signal<ReadonlyMap<string, Signal<string | null>>>(new Map());
  private readonly reasonsSignal = computed<ReadonlyMap<string, string>>(() => {
    const reasons = new Map(this.setReasons());
    for (const [key, reason] of this.trackedReasons()) {
      const label = reason();
      if (label !== null) {
        reasons.set(key, label);
      }
    }
    return reasons;
  });

  readonly isBusy = computed(() => this.reasonsSignal().size > 0);

  /** The first registered reason, for a banner that can only show one line. */
  readonly busyReason = computed(() => {
    const reasons = this.reasonsSignal();
    return reasons.size === 0 ? null : [...reasons.values()][0];
  });

  /** Registers `label` under `key`, or clears it when `label` is null. */
  setBusy(key: string, label: string | null): void {
    this.setReasons.update((current) => {
      const next = new Map(current);
      if (label === null) {
        next.delete(key);
      } else {
        next.set(key, label);
      }
      return next;
    });
  }

  /**
   * Follows `reason` under `key` until the returned function releases it: the
   * key is busy whenever the signal holds a label.
   */
  track(key: string, reason: Signal<string | null>): () => void {
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
