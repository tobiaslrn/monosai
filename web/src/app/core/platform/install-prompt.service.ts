import { DOCUMENT, Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { mediaQuerySignal } from './media-query';

/**
 * The non-standard `beforeinstallprompt` event. Not in the DOM lib typings
 * because it is a Chromium-only extension, not a web standard.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Captures `beforeinstallprompt` and exposes a single install action.
 *
 * Captures rather than lets the browser show its own mini-infobar
 * (`preventDefault()`), so the affordance lives in exactly one predictable
 * place: the App section of Settings.
 */
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly deferredPromptSignal = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installedSignal = signal(false);

  readonly canInstall = computed(() => this.deferredPromptSignal() !== null);
  readonly isStandalone: Signal<boolean> = mediaQuerySignal('(display-mode: standalone)');

  constructor() {
    this.view?.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPromptSignal.set(event as BeforeInstallPromptEvent);
    });
    this.view?.addEventListener('appinstalled', () => {
      this.deferredPromptSignal.set(null);
      this.installedSignal.set(true);
    });
  }

  /** Shows the captured browser install prompt. A no-op if none was captured. */
  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const deferred = this.deferredPromptSignal();
    if (deferred === null) {
      return 'unavailable';
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    this.deferredPromptSignal.set(null);
    return choice.outcome;
  }
}
