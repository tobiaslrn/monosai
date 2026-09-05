import { InjectionToken } from '@angular/core';

/** One ordered startup task, e.g. opening the database or loading settings. */
export interface InitializationStep {
  readonly name: string;
  run(): Promise<void>;
}

export const INITIALIZATION_STEP = new InjectionToken<readonly InitializationStep[]>(
  'monosai.initialization-step',
);
