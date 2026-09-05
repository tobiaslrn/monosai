import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../application/shared/diagnostics';
import { LOGGER } from '../../application/shared/diagnostics';
import { RuntimeErrorListeners } from './runtime-error-listeners';

describe('RuntimeErrorListeners', () => {
  it('converts window errors and rejected promises to safe entries', () => {
    const error = vi.fn();
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      snapshot: () => [],
      clear: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: LOGGER, useValue: logger }, RuntimeErrorListeners],
    });

    TestBed.inject(RuntimeErrorListeners);
    const view = TestBed.inject(DOCUMENT).defaultView;
    expect(view).not.toBeNull();

    const thrown = new Error('private reading text');
    view?.dispatchEvent(new ErrorEvent('error', { error: thrown }));
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', {
      value: { prompt: 'private prompt' },
    });
    view?.dispatchEvent(rejection);

    expect(error).toHaveBeenNthCalledWith(1, 'runtime.window-error', {
      errorType: 'Error',
    });
    expect(error).toHaveBeenNthCalledWith(2, 'runtime.unhandled-rejection', {
      errorType: 'object',
    });
    expect(error).not.toHaveBeenCalledWith('runtime.window-error', thrown);
  });
});
