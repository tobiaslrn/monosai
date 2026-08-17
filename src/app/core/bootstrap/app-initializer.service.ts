import { Injectable, inject, signal } from '@angular/core';
import { describeThrown } from '../../domain/shared/errors';
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
  private readonly stateSignal = signal<InitializationState>({ status: 'initializing' });

  readonly state = this.stateSignal.asReadonly();

  async run(): Promise<void> {
    this.stateSignal.set({ status: 'initializing' });
    for (const step of this.steps) {
      try {
        await step.run();
      } catch (thrown) {
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
  }
}
