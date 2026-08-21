import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { AppBusyRegistry } from '../shared/app-busy.registry';

/** How a failed check or activation should be recovered from. */
export type AppUpdateRecovery = 'retry' | 'reload';

export type AppUpdateStatus =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'idle' }
  | { readonly kind: 'available' }
  | { readonly kind: 'activating' }
  | { readonly kind: 'failed'; readonly message: string; readonly recovery: AppUpdateRecovery };

const IDLE: AppUpdateStatus = { kind: 'idle' };

/** How often to re-check for an update while a tab stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** First check waits past the app's own registerWhenStable:30000 registration delay. */
const INITIAL_CHECK_DELAY_MS = 31_000;

/**
 * Update availability and controlled activation.
 *
 * `activate()` refuses outright while `AppBusyRegistry.isBusy()` is true —
 * this is the invariant the milestone requires, not a UI nicety: an update
 * must never seize control mid-form or mid-job.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateStore {
  private readonly checker = inject(APP_UPDATE_CHECKER);
  private readonly busy = inject(AppBusyRegistry);
  private readonly reload = inject(APP_RELOAD);
  private readonly view = inject(DOCUMENT).defaultView;

  private readonly statusSignal = signal<AppUpdateStatus>(IDLE);

  readonly status = this.statusSignal.asReadonly();
  readonly isBusy = this.busy.isBusy;
  readonly busyReason = this.busy.busyReason;
  readonly canActivate = computed(
    () => this.statusSignal().kind === 'available' && !this.busy.isBusy(),
  );

  constructor() {
    this.checker.updates().subscribe((event) => {
      this.onEvent(event);
    });

    this.view?.setTimeout(() => {
      void this.check();
    }, INITIAL_CHECK_DELAY_MS);
    this.view?.setInterval(() => {
      void this.check();
    }, CHECK_INTERVAL_MS);
    this.view?.document.addEventListener('visibilitychange', () => {
      if (this.view?.document.visibilityState === 'visible') {
        void this.check();
      }
    });
  }

  /** Asks the platform to check for a new version. A no-op where updates are unsupported. */
  async check(): Promise<void> {
    const result = await this.checker.check();
    if (!result.ok) {
      this.statusSignal.set({ kind: 'failed', message: result.error.message, recovery: 'retry' });
    }
  }

  /**
   * Activates the downloaded version and performs a controlled full reload.
   *
   * Refuses while busy work is in progress; callers should disable the
   * activation control in that case rather than relying on this being silent.
   */
  async activate(): Promise<void> {
    if (!this.canActivate()) {
      return;
    }
    this.statusSignal.set({ kind: 'activating' });
    const result = await this.checker.activate();
    if (!result.ok) {
      this.statusSignal.set({ kind: 'failed', message: result.error.message, recovery: 'retry' });
      return;
    }
    this.reload();
  }

  /**
   * Performs a plain controlled reload to recover from a broken worker state,
   * bypassing activation since there is no successfully downloaded version to
   * activate. Still refuses while busy, for the same reason activation does.
   */
  reloadNow(): void {
    if (this.busy.isBusy()) {
      return;
    }
    this.reload();
  }

  /** Returns to idle for the session; the next check re-offers the update. */
  dismiss(): void {
    if (this.statusSignal().kind === 'available') {
      this.statusSignal.set(IDLE);
    }
  }

  private onEvent(event: AppUpdateEvent): void {
    switch (event.kind) {
      case 'unsupported':
        this.statusSignal.set({ kind: 'unsupported' });
        return;
      case 'ready':
        this.statusSignal.set({ kind: 'available' });
        return;
      case 'installation-failed':
        this.statusSignal.set({ kind: 'failed', message: event.reason, recovery: 'reload' });
        return;
      case 'unrecoverable':
        this.statusSignal.set({ kind: 'failed', message: event.reason, recovery: 'reload' });
        return;
    }
  }
}
