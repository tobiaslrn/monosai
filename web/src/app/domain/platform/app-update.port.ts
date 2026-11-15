import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Result } from '../shared/result';

/** The worker itself entered a broken state and needs a full reload to recover. */
export interface AppUpdateUnrecoverable {
  readonly kind: 'unrecoverable';
  readonly reason: string;
}

/**
 * The one platform event the app acts on. A new version is never announced: the service worker
 * downloads it in the background and the next page load uses it (ADR 0094).
 */
export type AppUpdateEvent = AppUpdateUnrecoverable;

/** Failure returned by `check()`. */
export interface AppUpdateCheckFailure {
  readonly message: string;
}

/**
 * Port over the platform's update mechanism.
 *
 * Kept free of `@angular/service-worker` so the domain and application layers
 * never depend on it directly; only the adapter in `infrastructure/pwa` does.
 */
export interface AppUpdateChecker {
  /** Emits every event the platform reports that needs the learner, for the lifetime of the app. */
  updates(): Observable<AppUpdateEvent>;

  /**
   * Asks the platform to look for a new version now and download it if there is one, so the next
   * page load uses it. Resolves once the download has finished or nothing was found.
   */
  check(): Promise<Result<void, AppUpdateCheckFailure>>;
}

export const APP_UPDATE_CHECKER = new InjectionToken<AppUpdateChecker>(
  'monosai.app-update-checker',
);

/**
 * Performs a controlled full reload. Injected rather than called directly on
 * `window` so the store's reload behaviour is unit-testable without a real
 * navigation.
 */
export const APP_RELOAD = new InjectionToken<() => void>('monosai.app-reload');
