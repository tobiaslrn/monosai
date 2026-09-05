import { describe, expect, it, vi } from 'vitest';
import { NOOP_LOGGER, type Logger } from '../../../application/shared/diagnostics';
import { configureStorageLogger, runStorage } from './storage-operation';

describe('storage operation diagnostics', () => {
  it('logs operation names and typed failures without operation arguments', async () => {
    const debug = vi.fn();
    const error = vi.fn();
    const logger: Logger = {
      debug,
      info: vi.fn(),
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    };
    configureStorageLogger(logger);

    const thrown = new Error('blocked');
    Object.defineProperty(thrown, 'name', { value: 'QuotaExceededError' });
    const result = await runStorage('settings.get(secret-value)', () => Promise.reject(thrown));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected storage failure');
    }
    expect(result.error.code).toBe('quota');
    expect(debug).toHaveBeenCalledWith('storage.operation.started', { operation: 'settings.get' });
    expect(error).toHaveBeenCalledWith('storage.operation.failed', {
      errorDomain: 'storage',
      errorCode: 'quota',
      operation: 'settings.get',
    });

    configureStorageLogger(NOOP_LOGGER);
  });
});
