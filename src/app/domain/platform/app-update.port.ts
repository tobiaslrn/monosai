import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Result } from '../shared/result';

/**
 * A new version has finished downloading and is ready to activate.
 */
export interface AppUpdateReady {
  readonly kind: 'ready';
}

/** A new version was found but failed to install; the current version keeps running. */
export interface AppUpdateInstallationFailed {
  readonly kind: 'installation-failed';
  readonly reason: string;
}

/** The worker itself entered a broken state and needs a full reload to recover. */
export interface AppUpdateUnrecoverable {
  readonly kind: 'unrecoverable';
  readonly reason: string;
}

/** There is no service worker to check — development, or a browser without one. */
export interface AppUpdateUnsupported {
  readonly kind: 'unsupported';
}

export type AppUpdateEvent =
  AppUpdateReady | AppUpdateInstallationFailed | AppUpdateUnrecoverable | AppUpdateUnsupported;

/** Failure returned by `check()`; activation failures are reported as an `AppUpdateEvent`. */
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
  /** Emits every update-relevant event the platform reports, for the lifetime of the app. */
  updates(): Observable<AppUpdateEvent>;

  /** Asks the platform to check for a new version right now. */
  check(): Promise<Result<void, AppUpdateCheckFailure>>;

  /** Activates the already-downloaded version. Callers must reload afterwards themselves. */
  activate(): Promise<Result<void, AppUpdateCheckFailure>>;
}

export const APP_UPDATE_CHECKER = new InjectionToken<AppUpdateChecker>(
  'monosai.app-update-checker',
);

/**
 * Performs the controlled full reload after activation. Injected rather than
 * called directly on `window` so the store's reload behaviour is
 * unit-testable without a real navigation.
 */
export const APP_RELOAD = new InjectionToken<() => void>('monosai.app-reload');
