import {
  DOCUMENT,
  EnvironmentInjector,
  isDevMode,
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
import { AutomaticAnkiSyncCoordinator } from './application/vocabulary/automatic-anki-sync.coordinator';
import { AppInitializerService } from './core/bootstrap/app-initializer.service';
import { provideInitializationSteps } from './core/bootstrap/initialization-steps';
import { NetworkStatusService } from './core/platform/network-status.service';
import { LOGGER, type Logger } from './application/shared/diagnostics';
import { ThemeSynchronizer } from './core/platform/theme-synchronizer.service';
import { NETWORK_STATUS } from './domain/platform/network-status.port';
import { HOST_PLATFORM, detectHostPlatform } from './domain/platform/host-platform';
import { APP_ROUTES } from './core/routing/app.routes';
import { provideAudioEncoding } from './infrastructure/audio/audio.providers';
import { provideAnki } from './infrastructure/anki/anki.providers';
import { provideDiagnosticsLogging } from './infrastructure/diagnostics/diagnostics.providers';
import { provideLanguage } from './infrastructure/language/language.providers';
import { provideOpenRouter } from './infrastructure/openrouter/openrouter.providers';
import { providePersistence } from './infrastructure/persistence/persistence.providers';
import { providePwa } from './infrastructure/pwa/pwa.providers';
import { readBuildInfo } from './core/diagnostics/build-info';

export const appConfig: ApplicationConfig = {
  providers: [
    AutomaticAnkiSyncCoordinator,
    provideDiagnosticsLogging(readBuildInfo()),
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
    // The shell owns the browser events; the application layer sees a signal.
    { provide: NETWORK_STATUS, useExisting: NetworkStatusService },
    // Decided once, at the edge, so nothing below reads `navigator` itself.
    {
      provide: HOST_PLATFORM,
      useFactory: () => {
        const view = inject(DOCUMENT).defaultView;
        return detectHostPlatform({
          userAgent: view?.navigator.userAgent ?? '',
          maxTouchPoints: view?.navigator.maxTouchPoints ?? 0,
        });
      },
    },
    providePersistence(),
    provideLanguage(),
    provideAnki(),
    provideAudioEncoding(),
    provideOpenRouter(),
    providePwa(),
    provideInitializationSteps(),
    provideAppInitializer(() => {
      // Keeps the document theme attribute in sync with persisted settings.
      inject(ThemeSynchronizer);
      const initializer = inject(AppInitializerService);
      const language = inject(LanguageStore);
      const automaticAnkiSync = inject(AutomaticAnkiSyncCoordinator);
      const injector = inject(EnvironmentInjector);
      const logger = inject<Logger>(LOGGER);
      void initializer.run().then(() => {
        // Every reading path needs the tokenizer, so preparation starts on its
        // own once startup succeeds. It is deliberately not awaited and not a
        // startup step: navigation, the library, and settings must render while
        // the language bundle is still downloading.
        if (initializer.state().status === 'ready') {
          void language.initialize();
          automaticAnkiSync.start();
          // Clips stored before Monosai compressed speech are re-encoded in
          // the background. Not a startup step and not awaited: it touches
          // nothing any screen is waiting for, and it stands aside the moment
          // the learner plays something. Imported here rather than at the top,
          // so none of the compression code is in the bundle every learner
          // downloads to read their first sentence.
          void import('./application/settings/audio-compression.store')
            .then(({ AudioCompressionStore }) => injector.get(AudioCompressionStore).run())
            .catch((thrown: unknown) => {
              // Background work nothing is waiting on, so it must not take the
              // application down with it — but a pass that never ran is not
              // allowed to look like a pass that found nothing to do.
              logger.error('worker.operation.failed', {
                worker: 'audio-compression',
                errorType: String(thrown),
              });
            });
        }
      });
    }),
    // Monosai's own worker, which handles the Android share target and then
    // hands everything else to Angular's `ngsw-worker.js` unchanged.
    provideServiceWorker('monosai-sw.js', {
      // Every optimized build emits Angular's worker; only `ng serve` does not.
      // Browser suites that need a quiet worker block registration through
      // Playwright rather than through a separate build.
      enabled: !isDevMode(),
      // Never take control mid-form or mid-job; updates are user activated.
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
