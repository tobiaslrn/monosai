import { describe, expect, it, vi } from 'vitest';
import {
  type DiagnosticFields,
  type LogEntry,
  serializeDiagnostics,
} from '../../application/shared/diagnostics';
import { BrowserLogger, type LoggerConsole } from './browser-logger';

function build() {
  return { appVersion: '0.1.0', buildCommit: 'test-commit' };
}

function consoleFake(): LoggerConsole & {
  readonly debugSpy: ReturnType<typeof vi.fn>;
  readonly infoSpy: ReturnType<typeof vi.fn>;
  readonly warnSpy: ReturnType<typeof vi.fn>;
  readonly errorSpy: ReturnType<typeof vi.fn>;
} {
  const debug = vi.fn();
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  return {
    debug,
    info,
    warn,
    error,
    debugSpy: debug,
    infoSpy: info,
    warnSpy: warn,
    errorSpy: error,
  };
}

describe('BrowserLogger', () => {
  it('records and emits all levels in development', () => {
    const consoleRef = consoleFake();
    const logger = new BrowserLogger({
      development: true,
      consoleRef,
      build: build(),
      now: () => '2026-08-22T00:00:00.000Z',
    });

    logger.debug('worker.operation.succeeded', { operation: 'lookup' });
    logger.info('app.initialization.succeeded', { step: 'database' });
    logger.warn('pwa.update.failed', { errorCode: 'check-failed' });
    logger.error('runtime.angular-error', { errorType: 'TypeError' });

    expect(logger.snapshot().map((entry) => entry.level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ]);
    expect(consoleRef.debugSpy).toHaveBeenCalledOnce();
    expect(consoleRef.infoSpy).toHaveBeenCalledOnce();
    expect(consoleRef.warnSpy).toHaveBeenCalledOnce();
    expect(consoleRef.errorSpy).toHaveBeenCalledOnce();
    expect(logger.snapshot()[0]).toMatchObject({
      timestamp: '2026-08-22T00:00:00.000Z',
      appVersion: '0.1.0',
      buildCommit: 'test-commit',
    });
  });

  it('suppresses debug output in production', () => {
    const consoleRef = consoleFake();
    const logger = new BrowserLogger({ development: false, consoleRef, build: build() });

    logger.debug('worker.operation.succeeded', { operation: 'lookup' });
    logger.info('app.initialization.succeeded', { step: 'database' });

    expect(logger.snapshot()).toHaveLength(1);
    expect(consoleRef.debugSpy).not.toHaveBeenCalled();
    expect(consoleRef.infoSpy).toHaveBeenCalledOnce();
  });

  it('keeps only the newest entries and can be cleared', () => {
    const logger = new BrowserLogger({
      development: true,
      consoleRef: consoleFake(),
      build: build(),
      maxEntries: 2,
    });

    logger.info('job.started', { kind: 'first' });
    logger.info('job.started', { kind: 'second' });
    logger.info('job.started', { kind: 'third' });

    expect(logger.snapshot().map((entry) => entry.fields.kind)).toEqual(['second', 'third']);
    logger.clear();
    expect(logger.snapshot()).toEqual([]);
  });

  it('keeps only allowlisted scalar fields and bounds strings', () => {
    const logger = new BrowserLogger({
      development: true,
      consoleRef: consoleFake(),
      build: build(),
    });

    logger.error('runtime.unhandled-rejection', {
      errorType: 'Error',
      modelId: 'safe-model',
      prompt: 'must not be accepted',
      operation: 'x'.repeat(250),
    } as unknown as DiagnosticFields);

    const fields = logger.snapshot()[0]?.fields;
    expect(fields).toEqual({
      errorType: 'Error',
      modelId: 'safe-model',
      operation: `${'x'.repeat(200)}…`,
    });
    expect(fields).not.toHaveProperty('prompt');
  });

  it('serializes safe entries without adding non-entry values', () => {
    const entry: LogEntry = {
      level: 'error',
      event: 'runtime.angular-error',
      timestamp: '2026-08-22T00:00:00.000Z',
      appVersion: '0.1.0',
      buildCommit: 'test-commit',
      fields: { errorType: 'Error' },
    };

    expect(serializeDiagnostics([entry])).toBe(JSON.stringify(entry));
  });
});
