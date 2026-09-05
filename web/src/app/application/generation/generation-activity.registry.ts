import { Injectable, signal } from '@angular/core';

/**
 * How many stories are being written right now.
 *
 * A leaf with no dependencies of its own, which is the whole point. The
 * preparation lane holds while a generation runs, and a saved story queues its
 * own preparation, so the two subsystems have something to say to each other in
 * both directions — and a direct dependency each way would be a cycle.
 *
 * The generation jobs store publishes the count here; the lane reads it. Being
 * a leaf also keeps it out of the initial bundle's dependency graph: neither
 * heavy subsystem is pulled in merely because the other exists.
 */
@Injectable({ providedIn: 'root' })
export class GenerationActivityRegistry {
  private readonly runningSignal = signal(0);

  readonly runningCount = this.runningSignal.asReadonly();

  setRunningCount(count: number): void {
    this.runningSignal.set(count);
  }
}
