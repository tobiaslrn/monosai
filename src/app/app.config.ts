import {
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { AppInitializerService } from './core/bootstrap/app-initializer.service';
import { APP_ROUTES } from './core/routing/app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      APP_ROUTES,
      // Hash routing keeps deep links reloadable on GitHub Pages without
      // server rewrite configuration.
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideAppInitializer(() => {
      void inject(AppInitializerService).run();
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Never take control mid-form or mid-job; updates are user activated.
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
