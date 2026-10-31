import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StorageFailure, storageError } from '../../domain/storage/storage-error';
import { AppInitializerService } from './app-initializer.service';
import { INITIALIZATION_STEP, type InitializationStep } from './initialization-step';

function step(name: string, run: () => Promise<void>): InitializationStep {
  return { name, run };
}

describe('AppInitializerService', () => {
  it('becomes ready when every step succeeds, in registration order', async () => {
    const order: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: INITIALIZATION_STEP,
          useValue: [
            step('first', () => {
              order.push('first');
              return Promise.resolve();
            }),
            step('second', () => {
              order.push('second');
              return Promise.resolve();
            }),
          ],
        },
      ],
    });

    const service = TestBed.inject(AppInitializerService);
    expect(service.state()).toEqual({ status: 'initializing' });

    await service.run();

    expect(order).toEqual(['first', 'second']);
    expect(service.state()).toEqual({ status: 'ready' });
  });

  it('is ready with no registered steps', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(AppInitializerService);
    await service.run();
    expect(service.state().status).toBe('ready');
  });

  it('stops at the first failing step and reports a redacted cause', async () => {
    let ranAfterFailure = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: INITIALIZATION_STEP,
          useValue: [
            step('database', () => Promise.reject(new Error('open blocked'))),
            step('later', () => {
              ranAfterFailure = true;
              return Promise.resolve();
            }),
          ],
        },
      ],
    });

    const service = TestBed.inject(AppInitializerService);
    await service.run();

    const state = service.state();
    expect(state.status).toBe('failed');
    if (state.status !== 'failed') {
      throw new Error('expected failed state');
    }
    expect(state.failure.error.code).toBe('initialization-failed');
    expect(state.failure.error.message).toBe('Monosai could not finish starting up.');
    expect(state.failure.error.cause).toBe('Error: open blocked');
    expect(state.failure.resetMayHelp).toBe(false);
    expect(ranAfterFailure).toBe(false);
  });

  it.each([
    ['migration-failed', true],
    ['corrupt-record', true],
    ['blocked', false],
    ['quota', false],
    ['unavailable', false],
    ['unknown', false],
  ] as const)(
    'reports a %s storage failure in its own words, offering a reset: %s',
    async (code, resetMayHelp) => {
      const error = storageError(code, 'The storage reason.', 'database.open: VersionError');
      TestBed.configureTestingModule({
        providers: [
          {
            provide: INITIALIZATION_STEP,
            useValue: [step('settings', () => Promise.reject(new StorageFailure(error)))],
          },
        ],
      });

      const service = TestBed.inject(AppInitializerService);
      await service.run();

      expect(service.state()).toEqual({
        status: 'failed',
        failure: { error, resetMayHelp },
      });
    },
  );

  it('can retry after a failure', async () => {
    let attempts = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: INITIALIZATION_STEP,
          useValue: [
            step('flaky', () => {
              attempts += 1;
              return attempts === 1 ? Promise.reject(new Error('transient')) : Promise.resolve();
            }),
          ],
        },
      ],
    });

    const service = TestBed.inject(AppInitializerService);
    await service.run();
    expect(service.state().status).toBe('failed');

    await service.run();
    expect(service.state().status).toBe('ready');
  });
});
