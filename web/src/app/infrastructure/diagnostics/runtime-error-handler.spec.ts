import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../application/shared/diagnostics';
import { RuntimeErrorHandler } from './runtime-error-handler';

describe('RuntimeErrorHandler', () => {
  it('logs only the thrown value type and never forwards the raw error', () => {
    const error = vi.fn();
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    };
    const thrown = new Error('learner text and secret should not be logged');

    new RuntimeErrorHandler(logger).handleError(thrown);

    expect(error).toHaveBeenCalledWith('runtime.angular-error', {
      errorType: 'Error',
    });
    expect(error).not.toHaveBeenCalledWith('runtime.angular-error', thrown);
  });
});
