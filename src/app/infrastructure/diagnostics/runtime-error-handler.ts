import type { ErrorHandler } from '@angular/core';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import type { Logger } from '../../application/shared/diagnostics';

/** Angular ErrorHandler that records only safe error metadata. */
export class RuntimeErrorHandler implements ErrorHandler {
  constructor(private readonly logger: Logger) {}

  handleError(error: unknown): void {
    this.logger.error('runtime.angular-error', {
      errorType: safeErrorTypeOf(error),
    });
  }
}
