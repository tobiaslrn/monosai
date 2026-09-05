import {
  ErrorHandler,
  inject,
  isDevMode,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { LOGGER } from '../../application/shared/diagnostics';
import type { LoggerBuildInfo } from './browser-logger';
import { BrowserLogger } from './browser-logger';
import { RuntimeErrorHandler } from './runtime-error-handler';
import { RuntimeErrorListeners } from './runtime-error-listeners';

/** Binds redacted local diagnostics to the browser runtime. */
export function provideDiagnosticsLogging(
  build: LoggerBuildInfo,
): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: LOGGER,
      useFactory: () =>
        new BrowserLogger({
          development: isDevMode(),
          consoleRef: console,
          build,
        }),
    },
    {
      provide: ErrorHandler,
      useFactory: () => new RuntimeErrorHandler(inject(LOGGER)),
    },
    RuntimeErrorListeners,
    provideEnvironmentInitializer(() => inject(RuntimeErrorListeners)),
  ];
}
