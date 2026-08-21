import {
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import type { ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withInMemoryScrolling,
} from '@angular/router';
import { LanguageStore } from './application/language/language.store';
import { AppInitializerService } from './core/bootstrap/app-initializer.service';
import { provideInitializationSteps } from './core/bootstrap/initialization-steps';
import { ThemeSynchronizer } from './core/platform/theme-synchronizer.service';
import { APP_ROUTES } from './core/routing/app.routes';
import { provideAnki } from './infrastructure/anki/anki.providers';
import { provideLanguage } from './infrastructure/language/language.providers';
import { provideOpenRouter } from './infrastructure/openrouter/openrouter.providers';
import { providePersistence } from './infrastructure/persistence/persistence.providers';
import { providePwa } from './infrastructure/pwa/pwa.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      APP_ROUTES,
      // Hash routing keeps deep links reloadable on GitHub Pages without
      // server rewrite configuration.
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Route parameters reach components as signal inputs, so the reader takes
      // its reading id without injecting ActivatedRoute.
      withComponentInputBinding(),
    ),
    providePersistence(),
    provideLanguage(),
    provideAnki(),
    provideOpenRouter(),
    providePwa(),
    provideInitializationSteps(),
    provideAppInitializer(() => {
      // Keeps the document theme attribute in sync with persisted settings.
      inject(ThemeSynchronizer);
      const initializer = inject(AppInitializerService);
      const language = inject(LanguageStore);
      void initializer.run().then(() => {
        // Every reading path needs the tokenizer, so preparation starts on its
        // own once startup succeeds. It is deliberately not awaited and not a
        // startup step: navigation, the library, and settings must render while
        // the language bundle is still downloading.
        if (initializer.state().status === 'ready') {
          void language.initialize();
        }
      });
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Never take control mid-form or mid-job; updates are user activated.
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
