import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { readBuildInfo } from './app/core/diagnostics/build-info';
import { safeErrorTypeOf } from './app/domain/shared/errors';
import { BrowserLogger } from './app/infrastructure/diagnostics/browser-logger';

const bootstrapLogger = new BrowserLogger({
  development: isDevMode(),
  consoleRef: console,
  build: readBuildInfo(),
});

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  bootstrapLogger.error('app.bootstrap.failed', {
    errorCode: 'bootstrap-failed',
    errorType: safeErrorTypeOf(error),
  });
});
