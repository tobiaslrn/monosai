import { Injectable, computed, signal, type Signal } from '@angular/core';

/**
 * How many stories are being written right now.
 *
 * A leaf with no dependencies of its own, which is the whole point. The
 * preparation lane holds while a generation runs, and a saved story queues its
 * own preparation, so the two subsystems have something to say to each other in
 * both directions — and a direct dependency each way would be a cycle.
 *
 * The generation jobs store connects its count here; the lane reads it. Being
 * a leaf also keeps it out of the initial bundle's dependency graph: neither
 * heavy subsystem is pulled in merely because the other exists.
 */
@Injectable({ providedIn: 'root' })
export class GenerationActivityRegistry {
  private readonly source = signal<Signal<number> | null>(null);

  readonly runningCount = computed(() => this.source()?.() ?? 0);

  connect(runningCount: Signal<number>): void {
    this.source.set(runningCount);
  }
}
