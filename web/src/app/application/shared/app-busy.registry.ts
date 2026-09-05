import { Injectable, computed, signal } from '@angular/core';

/**
 * Tracks work in progress that a controlled reload must never interrupt: an
 * unsaved import draft, a live generation run, or a running translation or
 * audio job.
 *
 * A signal-backed set of reasons rather than a boolean, so unrelated features
 * can register and clear their own busy state independently without one
 * clearing a reason another is still holding.
 */
@Injectable({ providedIn: 'root' })
export class AppBusyRegistry {
  private readonly reasonsSignal = signal<ReadonlyMap<string, string>>(new Map());

  readonly isBusy = computed(() => this.reasonsSignal().size > 0);

  /** The first registered reason, for a banner that can only show one line. */
  readonly busyReason = computed(() => {
    const reasons = this.reasonsSignal();
    return reasons.size === 0 ? null : [...reasons.values()][0];
  });

  /** Registers `label` under `key`, or clears it when `label` is null. */
  setBusy(key: string, label: string | null): void {
    this.reasonsSignal.update((current) => {
      const next = new Map(current);
      if (label === null) {
        next.delete(key);
      } else {
        next.set(key, label);
      }
      return next;
    });
  }
}
