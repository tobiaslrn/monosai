import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppUpdateStore } from './app-update.store';

/**
 * A Reload the learner pressed to recover code this tab could not load.
 *
 * A reload would destroy work in progress, so a press while something is busy
 * waits and reloads the moment that work ends. Provided by the screen that
 * offers the Reload: leaving the screen, or the screen calling `cancel`, drops
 * a reload still waiting, so nothing reloads the app later out of nowhere.
 */
@Injectable()
export class DeferredReloadStore {
  private readonly update = inject(AppUpdateStore);
  private readonly pressed = signal(false);

  /** The work a pressed Reload is waiting for, or null when it is not waiting. */
  readonly waitingFor = computed(() => (this.pressed() ? this.update.busyWork() : null));

  constructor() {
    effect(() => {
      if (this.pressed() && !this.update.isBusy()) {
        untracked(() => {
          this.update.reloadNow();
        });
      }
    });
  }

  /** Reloads now, or as soon as no work would be lost. */
  request(): void {
    this.pressed.set(true);
  }

  /** Drops a reload still waiting. */
  cancel(): void {
    this.pressed.set(false);
  }
}
