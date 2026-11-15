import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY, map, type Observable } from 'rxjs';
import type {
  AppUpdateChecker,
  AppUpdateCheckFailure,
  AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { err, ok, type Result } from '../../domain/shared/result';

/**
 * Wraps `SwUpdate` behind the `AppUpdateChecker` port.
 *
 * Version events are not passed on. The worker downloads a new version by itself and serves it to
 * the next navigation, so there is nothing for the learner to do (ADR 0094). `SwUpdate.isEnabled`
 * is false in development and in any browser without a service worker; there everything is a
 * no-op.
 */
@Injectable()
export class ServiceWorkerUpdateAdapter implements AppUpdateChecker {
  private readonly swUpdate = inject(SwUpdate);

  updates(): Observable<AppUpdateEvent> {
    if (!this.swUpdate.isEnabled) {
      return EMPTY;
    }
    return this.swUpdate.unrecoverable.pipe(
      map((event): AppUpdateEvent => ({ kind: 'unrecoverable', reason: event.reason })),
    );
  }

  async check(): Promise<Result<void, AppUpdateCheckFailure>> {
    if (!this.swUpdate.isEnabled) {
      return ok(undefined);
    }
    try {
      await this.swUpdate.checkForUpdate();
      return ok(undefined);
    } catch (error) {
      return err({ message: messageOf(error) });
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The update check failed.';
}
