import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import type { DatabaseLossCause } from '../../domain/storage/storage-error';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';

export type AppUpdateStatus =
  | { readonly kind: 'idle' }
  /** The service worker broke. A reload recovers it, once no work would be lost. */
  | { readonly kind: 'failed'; readonly message: string }
  /** This tab lost the database. Nothing ends it but a reload, so no event replaces it. */
  | { readonly kind: 'superseded'; readonly message: string };

const IDLE: AppUpdateStatus = { kind: 'idle' };

/** How often to look for a new version while a tab stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** How long a reload waits for the update check before reloading anyway. */
const UPDATE_CHECK_TIMEOUT_MS = 5000;
/** First check waits past the app's own registerWhenStable:30000 registration delay. */
const INITIAL_CHECK_DELAY_MS = 31_000;

/**
 * Keeps the app current without asking the learner, and reports the states only a reload ends.
 *
 * A new version is downloaded in the background and the next page load uses it; nothing reloads a
 * running page for an update (ADR 0094). The checks here only make that download happen sooner
 * than the worker's own check on each launch.
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

  /**
   * Downloads a new version if there is one, so the next page load uses it. Silent: a failed check
   * changes nothing the learner sees, and the next one tries again.
   */
  async check(): Promise<void> {
    const result = await this.checker.check();
    if (!result.ok) {
      this.logger.warn('pwa.update.failed', {
        action: 'check',
        errorCode: 'check-failed',
        recovery: 'retry',
      });
    }
  }

  /**
   * Performs a plain controlled reload to recover from a broken worker state. Refuses while busy,
   * because the reload would destroy that work.
   */
  reloadNow(): void {
    if (this.busy.isBusy()) {
      return;
    }
    this.reload();
  }

  /**
   * Downloads a newer build, if there is one, before reloading: a page load uses the newest build
   * the worker holds, so a reload straight away could still serve this one. Where the check does
   * not answer in time (no worker is controlling the page), it just reloads.
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

  private onEvent(event: AppUpdateEvent): void {
    if (this.statusSignal().kind === 'superseded') {
      return;
    }
    this.logger.error('pwa.update.failed', {
      action: 'runtime',
      errorCode: 'unrecoverable',
      recovery: 'reload',
    });
    this.statusSignal.set({ kind: 'failed', message: event.reason });
  }
}
