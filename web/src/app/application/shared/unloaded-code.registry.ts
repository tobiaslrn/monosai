import { Injectable, signal } from '@angular/core';

/**
 * Code this tab tried to load and could not, so only a reload brings it back.
 *
 * Some browsers remember a module that failed to load for the life of the page
 * and refuse it again without asking the network, so asking again cannot help,
 * however good the connection has become. What is recorded here is shown as the
 * app's own news, with the reload that does help, until the page is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class UnloadedCodeRegistry {
  private readonly speechSignal = signal(false);

  /** The code that reads sentences aloud could not be loaded in this tab. */
  readonly speech = this.speechSignal.asReadonly();

  reportSpeech(): void {
    this.speechSignal.set(true);
  }
}
