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
import { provideInitializationSteps } from './core/bootstrap/initialization-steps';
import { ThemeSynchronizer } from './core/platform/theme-synchronizer.service';
import { APP_ROUTES } from './core/routing/app.routes';
import { provideLanguage } from './infrastructure/language/language.providers';
import { providePersistence } from './infrastructure/persistence/persistence.providers';

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
    providePersistence(),
    provideLanguage(),
    provideInitializationSteps(),
    provideAppInitializer(() => {
      // Keeps the document theme attribute in sync with persisted settings.
      inject(ThemeSynchronizer);
      void inject(AppInitializerService).run();
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Never take control mid-form or mid-job; updates are user activated.
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
