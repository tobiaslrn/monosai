import { Injectable, inject, signal } from '@angular/core';
import { describeThrown, safeErrorTypeOf } from '../../domain/shared/errors';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { INITIALIZATION_STEP } from './initialization-step';
import type { InitializationState } from './initialization-state';

/**
 * Owns the startup sequence and its recoverable failure state.
 *
 * Navigation renders only after initialization succeeds; a failure shows the
 * recovery screen with Retry rather than looping reloads or deleting data.
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
        this.logger.error('app.initialization.step.failed', {
          step: step.name,
          errorType: safeErrorTypeOf(thrown),
          errorCode: 'initialization-failed',
        });
        this.logger.error('app.initialization.failed', {
          step: step.name,
          errorCode: 'initialization-failed',
        });
        this.stateSignal.set({
          status: 'failed',
          failure: {
            error: {
              domain: 'bootstrap',
              code: 'initialization-failed',
              message: `Monosai could not finish starting up (step: ${step.name}).`,
              cause: describeThrown(thrown),
            },
            resetMayHelp: true,
          },
        });
        return;
      }
    }
    this.stateSignal.set({ status: 'ready' });
    this.logger.info('app.initialization.succeeded', { count: this.steps.length });
  }
}
