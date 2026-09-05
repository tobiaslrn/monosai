import { DOCUMENT, Injectable, inject } from '@angular/core';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import type { Logger } from '../../application/shared/diagnostics';
import { LOGGER } from '../../application/shared/diagnostics';

/** Captures browser-level failures that do not pass through Angular. */
@Injectable()
export class RuntimeErrorListeners {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly logger = inject<Logger>(LOGGER);

  constructor() {
    this.view?.addEventListener('error', (event) => {
      this.logger.error('runtime.window-error', {
        errorType: safeErrorTypeOf(event.error),
      });
      event.preventDefault();
    });
    this.view?.addEventListener('unhandledrejection', (event) => {
      this.logger.error('runtime.unhandled-rejection', {
        errorType: safeErrorTypeOf(event.reason),
      });
      event.preventDefault();
    });
  }
}
