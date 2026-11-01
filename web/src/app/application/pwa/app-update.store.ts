import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import type { DatabaseLossCause } from '../../domain/storage/storage-error';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';

/** How a failed check or activation should be recovered from. */
export type AppUpdateRecovery = 'retry' | 'reload';

export type AppUpdateStatus =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'idle' }
  | { readonly kind: 'current' }
  | { readonly kind: 'available' }
  | { readonly kind: 'activating' }
  | { readonly kind: 'failed'; readonly message: string; readonly recovery: AppUpdateRecovery }
  /** This tab lost the database. Nothing ends it but a reload, so no check or event replaces it. */
  | { readonly kind: 'superseded'; readonly message: string };

const IDLE: AppUpdateStatus = { kind: 'idle' };

/** How often to re-check for an update while a tab stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** How long a reload waits for the update check before reloading anyway. */
const UPDATE_CHECK_TIMEOUT_MS = 5000;
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
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

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
    if (this.statusSignal().kind === 'superseded') {
      return;
    }
    if (!result.ok) {
      this.logger.warn('pwa.update.failed', {
        action: 'check',
        errorCode: 'check-failed',
        recovery: 'retry',
      });
      this.statusSignal.set({ kind: 'failed', message: result.error.message, recovery: 'retry' });
      return;
    }

    // SwUpdate emits NO_NEW_VERSION_DETECTED asynchronously. Keep a visible
    // result even when a platform resolves the check without emitting it.
    // Never overwrite an update that became ready while the check was pending.
    const status = this.statusSignal();
    if (status.kind === 'idle' || status.kind === 'current' || status.kind === 'failed') {
      this.statusSignal.set({ kind: 'current' });
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
      this.logger.warn('pwa.update.failed', {
        action: 'activate',
        errorCode: 'activation-failed',
        recovery: 'retry',
      });
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

  /**
   * Looks for a newer build and activates it before reloading, because a plain reload can serve
   * the cached build that is already running. Where there is nothing to activate, the check does
   * not answer in time (no worker is controlling the page), or activation fails, it just reloads.
   */
  async reloadIntoLatest(): Promise<void> {
    const timeout = new Promise<void>((resolve) => {
      if (this.view === null) {
        resolve();
        return;
      }
      this.view.setTimeout(resolve, UPDATE_CHECK_TIMEOUT_MS);
    });
    await Promise.race([this.check(), timeout]);
    if (this.statusSignal().kind === 'available') {
      await this.activate();
      if (this.statusSignal().kind !== 'failed') {
        return;
      }
    }
    this.reload();
  }

  /**
   * This tab lost its connection to the database: another tab upgraded or deleted it, or the
   * browser closed the connection. Nothing is reloaded for the learner, since that could lose
   * work in progress; the banner offers it. The first cause stays.
   */
  reportDatabaseLost(cause: DatabaseLossCause): void {
    if (this.statusSignal().kind === 'superseded') {
      return;
    }
    this.logger.warn('pwa.update.failed', {
      action: 'runtime',
      errorCode: cause === 'another-tab' ? 'database-superseded' : 'database-connection-closed',
      recovery: 'reload',
    });
    this.statusSignal.set({
      kind: 'superseded',
      message:
        cause === 'another-tab'
          ? 'Monosai was updated or reset in another tab, so this tab can no longer save.'
          : 'Monosai lost its connection to your saved data, so this tab can no longer save.',
    });
  }

  /**
   * Reloads a tab whose database is gone. Saving can never succeed here, so waiting for busy work
   * to finish is pointless; the caller confirms with the learner what the reload discards.
   */
  reloadSuperseded(): void {
    this.reload();
  }

  /** Returns to idle for the session; the next check re-offers the update. */
  dismiss(): void {
    if (this.statusSignal().kind === 'available') {
      this.statusSignal.set(IDLE);
    }
  }

  private onEvent(event: AppUpdateEvent): void {
    if (this.statusSignal().kind === 'superseded') {
      return;
    }
    switch (event.kind) {
      case 'unsupported':
        this.logger.debug('pwa.update.unsupported');
        this.statusSignal.set({ kind: 'unsupported' });
        return;
      case 'ready':
        this.logger.info('pwa.update.available');
        this.statusSignal.set({ kind: 'available' });
        return;
      case 'current':
        this.statusSignal.set({ kind: 'current' });
        return;
      case 'installation-failed':
        this.logger.error('pwa.update.failed', {
          action: 'install',
          errorCode: 'installation-failed',
          recovery: 'reload',
        });
        this.statusSignal.set({ kind: 'failed', message: event.reason, recovery: 'reload' });
        return;
      case 'unrecoverable':
        this.logger.error('pwa.update.failed', {
          action: 'runtime',
          errorCode: 'unrecoverable',
          recovery: 'reload',
        });
        this.statusSignal.set({ kind: 'failed', message: event.reason, recovery: 'reload' });
        return;
    }
  }
}
