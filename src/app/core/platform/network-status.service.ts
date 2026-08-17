import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** Tracks browser connectivity so features can present offline states explicitly. */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly onlineSignal = signal(this.view?.navigator.onLine ?? true);

  readonly isOnline = this.onlineSignal.asReadonly();

  constructor() {
    this.view?.addEventListener('online', () => {
      this.onlineSignal.set(true);
    });
    this.view?.addEventListener('offline', () => {
      this.onlineSignal.set(false);
    });
  }
}
