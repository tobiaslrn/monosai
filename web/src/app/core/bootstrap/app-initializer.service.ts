import { Injectable, inject, signal } from '@angular/core';
import { describeThrown, safeErrorTypeOf } from '../../domain/shared/errors';
import { StorageFailure, resetMayRecover } from '../../domain/storage/storage-error';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { INITIALIZATION_STEP } from './initialization-step';
import type { BootstrapFailure, InitializationState } from './initialization-state';

/** What the recovery screen says and offers for whatever a step threw. */
function bootstrapFailureFrom(thrown: unknown): BootstrapFailure {
  if (thrown instanceof StorageFailure) {
    return { error: thrown.storageError, resetMayHelp: resetMayRecover(thrown.storageError) };
  }
  return {
    error: {
      domain: 'bootstrap',
      code: 'initialization-failed',
      message: 'Monosai could not finish starting up.',
      cause: describeThrown(thrown),
    },
    resetMayHelp: false,
  };
}

/**
 * Owns the startup sequence and its recoverable failure state.
 *
 * Navigation renders only after initialization succeeds; a failure shows the
 * recovery screen rather than looping reloads or deleting data. Deleting data
 * is only ever the learner's own choice from that screen.
 */
@Injectable({ providedIn: 'root' })
export class AppInitializerService {
  private readonly steps = inject(INITIALIZATION_STEP, { optional: true }) ?? [];
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  private readonly stateSignal = signal<InitializationState>({ status: 'initializing' });

  readonly state = this.stateSignal.asReadonly();

  async run(): Promise<void> {
    this.logger.info('app.initialization.started', { count: this.steps.length });
    this.stateSignal.set({ status: 'initializing' });
    for (const step of this.steps) {
      this.logger.debug('app.initialization.step.started', { step: step.name });
      try {
        await step.run();
        this.logger.debug('app.initialization.step.succeeded', { step: step.name });
      } catch (thrown) {
        const failure = bootstrapFailureFrom(thrown);
        this.logger.error('app.initialization.step.failed', {
          step: step.name,
          errorType: safeErrorTypeOf(thrown),
          errorCode: failure.error.code,
        });
        this.logger.error('app.initialization.failed', {
          step: step.name,
          errorCode: failure.error.code,
        });
        this.stateSignal.set({ status: 'failed', failure });
        return;
      }
    }
    this.stateSignal.set({ status: 'ready' });
    this.logger.info('app.initialization.succeeded', { count: this.steps.length });
  }
}
