import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter, map, merge, of, type Observable } from 'rxjs';
import type {
  AppUpdateChecker,
  AppUpdateCheckFailure,
  AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { err, ok, type Result } from '../../domain/shared/result';

/**
 * Wraps `SwUpdate` behind the `AppUpdateChecker` port.
 *
 * `SwUpdate.isEnabled` is false in development and in any browser without a
 * service worker, and that is reported as an explicit `unsupported` event
 * rather than silence, so the store never has to guess why nothing ever
 * arrives.
 */
@Injectable()
export class ServiceWorkerUpdateAdapter implements AppUpdateChecker {
  private readonly swUpdate = inject(SwUpdate);

  updates(): Observable<AppUpdateEvent> {
    if (!this.swUpdate.isEnabled) {
      return of<AppUpdateEvent>({ kind: 'unsupported' });
    }

    const versionEvents = this.swUpdate.versionUpdates.pipe(
      map((event): AppUpdateEvent | null => {
        if (event.type === 'VERSION_READY') {
          return { kind: 'ready' };
        }
        if (event.type === 'VERSION_INSTALLATION_FAILED') {
          return { kind: 'installation-failed', reason: event.error };
        }
        return null;
      }),
    );
    const unrecoverable = this.swUpdate.unrecoverable.pipe(
      map((event): AppUpdateEvent => ({ kind: 'unrecoverable', reason: event.reason })),
    );

    // `versionEvents` can emit `null` for event types the app does not act on
    // (VERSION_DETECTED, NO_NEW_VERSION_DETECTED); filter them out here rather
    // than widening the port's event union with states nothing consumes.
    return merge(versionEvents, unrecoverable).pipe(
      filter((event): event is AppUpdateEvent => event !== null),
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

  async activate(): Promise<Result<void, AppUpdateCheckFailure>> {
    if (!this.swUpdate.isEnabled) {
      return ok(undefined);
    }
    try {
      await this.swUpdate.activateUpdate();
      return ok(undefined);
    } catch (error) {
      return err({ message: messageOf(error) });
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The update check failed.';
}
