import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';

/** Tracks browser connectivity so features can present offline states explicitly. */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  private readonly onlineSignal = signal(this.view?.navigator.onLine ?? true);

  readonly isOnline = this.onlineSignal.asReadonly();

  constructor() {
    this.view?.addEventListener('online', () => {
      this.onlineSignal.set(true);
      this.logger.info('runtime.network.changed', { online: true });
    });
    this.view?.addEventListener('offline', () => {
      this.onlineSignal.set(false);
      this.logger.warn('runtime.network.changed', { online: false });
    });
  }
}
