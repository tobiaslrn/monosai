import { InjectionToken, type Signal } from '@angular/core';

/**
 * Whether the browser believes it can reach the network.
 *
 * A port rather than a direct dependency because the application layer must
 * not reach into the shell: the preparation lane parks while a connection is
 * gone, and it has to be able to do that in a unit test with no `window`.
 *
 * `navigator.onLine` is a hint, not a guarantee — it says a network interface
 * exists, not that requests will succeed. It is used only to avoid starting
 * paid work that is certain to fail, never to decide that a failure happened.
 */
export interface NetworkStatus {
  readonly isOnline: Signal<boolean>;
}

export const NETWORK_STATUS = new InjectionToken<NetworkStatus>('monosai.network-status');
