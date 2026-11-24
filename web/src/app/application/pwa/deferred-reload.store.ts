import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { HoldingWork } from '../../domain/shared/busy-work';
import { AppUpdateStore } from './app-update.store';

/** Where a pressed Reload is: waiting for work, or due to ask about unsaved stories. */
type Press = { readonly kind: 'waiting' } | { readonly kind: 'asking'; readonly unsaved: number };

/**
 * A Reload the learner pressed to recover code this tab could not load.
 *
 * A reload would destroy work in progress, so a press while something is busy
 * waits and goes on the moment that work ends. An unsaved story never ends by
 * itself, so it is not waited for. Only when the reload is about to happen does
 * the press ask about the unsaved stories it would lose: at once when nothing
 * else is busy, or at the end of the wait. A story left unsaved during the wait
 * is therefore asked about with the rest, never dropped silently.
 *
 * Provided by the screen that offers the Reload: leaving the screen, or the
 * screen calling `cancel`, drops a reload still waiting, so nothing reloads the
 * app later out of nowhere.
 */
@Injectable()
export class DeferredReloadStore {
  private readonly update = inject(AppUpdateStore);
  private readonly press = signal<Press | null>(null);

  /** The work a pressed Reload is waiting for, or null when it is not waiting. */
  readonly waitingFor = computed<HoldingWork | null>(() =>
    this.press()?.kind === 'waiting' ? (this.update.holdingWork()[0] ?? null) : null,
  );

  /**
   * How many unsaved stories a pressed Reload would lose, now that nothing else
   * holds it, or null when no question is due. The screen asks, then `answer`s.
   */
  readonly asking = computed(() => {
    const press = this.press();
    return press?.kind === 'asking' ? press.unsaved : null;
  });

  constructor() {
    effect(() => {
      if (this.press()?.kind !== 'waiting' || this.update.holdingWork().length > 0) return;
      untracked(() => {
        const unsaved = this.update.unsavedStories();
        if (unsaved > 0) {
          this.press.set({ kind: 'asking', unsaved });
          return;
        }
        this.press.set(null);
        this.update.reloadNow();
      });
    });
  }

  /**
   * Reloads as soon as no running work would be lost, asking first about the
   * unsaved stories it would. A press already waiting or asking is left as it is.
   */
  request(): void {
    if (this.press() !== null) return;
    this.press.set({ kind: 'waiting' });
  }

  /**
   * The learner answered the question `asking` raised. Agreeing reloads, losing
   * the stories asked about and no more: the app refuses a reload that would
   * lose one nobody was asked about.
   */
  answer(reload: boolean): void {
    const press = this.press();
    if (press?.kind !== 'asking') return;
    this.press.set(null);
    if (reload) this.update.reloadNow(press.unsaved);
  }

  /** Drops a reload still waiting. A question already asked is the learner's to answer. */
  cancel(): void {
    if (this.press()?.kind === 'waiting') this.press.set(null);
  }
}
