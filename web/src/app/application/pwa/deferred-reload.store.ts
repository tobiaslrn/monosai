import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { HoldingWork } from '../../domain/shared/busy-work';
import { AppUpdateStore } from './app-update.store';

/**
 * A Reload the learner pressed to recover code this tab could not load.
 *
 * A reload would destroy work in progress, so a press while something is busy
 * waits and reloads the moment that work ends. An unsaved story never ends by
 * itself, so it is not waited for: the screen asks the learner first and says
 * how many it agreed to lose. A story that becomes unsaved while the press
 * waits was never asked about, so the press is dropped rather than losing it.
 *
 * Provided by the screen that offers the Reload: leaving the screen, or the
 * screen calling `cancel`, drops a reload still waiting, so nothing reloads the
 * app later out of nowhere.
 */
@Injectable()
export class DeferredReloadStore {
  private readonly update = inject(AppUpdateStore);
  /** The unsaved stories the learner agreed to lose with the press, or null when not pressed. */
  private readonly pressed = signal<number | null>(null);

  /** How many unsaved stories a reload now would lose, to confirm before `request`. */
  readonly unsavedStories = this.update.unsavedStories;

  /** The work a pressed Reload is waiting for, or null when it is not waiting. */
  readonly waitingFor = computed<HoldingWork | null>(() =>
    this.pressed() === null ? null : (this.update.holdingWork()[0] ?? null),
  );

  constructor() {
    effect(() => {
      const accepted = this.pressed();
      if (accepted === null) return;
      if (this.update.unsavedStories() > accepted) {
        untracked(() => {
          this.cancel();
        });
        return;
      }
      if (this.update.holdingWork().length === 0) {
        untracked(() => {
          this.update.reloadNow(accepted);
        });
      }
    });
  }

  /**
   * Reloads now, or as soon as no work would be lost but the unsaved stories
   * the learner agreed to lose.
   */
  request(acceptedUnsaved = 0): void {
    this.pressed.set(acceptedUnsaved);
  }

  /** Drops a reload still waiting. */
  cancel(): void {
    this.pressed.set(null);
  }
}
