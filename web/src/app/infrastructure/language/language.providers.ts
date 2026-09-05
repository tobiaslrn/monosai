import { DOCUMENT, inject, type Provider } from '@angular/core';
import { LOGGER, type Logger } from '../../application/shared/diagnostics';
import { LANGUAGE_ASSET_SOURCE, LANGUAGE_RUNTIME } from '../../application/shared/language-tokens';
import { HttpLanguageAssetSource } from './http-language-asset.source';
import { LanguageWorkerClient, workerChannel } from './language-worker.client';

function browserCaches(view: Window | null): CacheStorage | null {
  return view !== null && 'caches' in view ? view.caches : null;
}

/**
 * Binds the language ports to the worker-backed implementations.
 *
 * The worker module is created eagerly but does nothing until it is initialized,
 * so startup stays cheap: no asset is fetched until a feature asks for language
 * processing.
 */
export function provideLanguage(): Provider[] {
  return [
    {
      provide: LANGUAGE_ASSET_SOURCE,
      useFactory: () => {
        const documentRef = inject(DOCUMENT);
        return new HttpLanguageAssetSource(
          documentRef.baseURI,
          (input, init) => fetch(input, init),
          browserCaches(documentRef.defaultView),
        );
      },
    },
    {
      provide: LANGUAGE_RUNTIME,
      useFactory: () =>
        (() => {
          const logger = inject<Logger>(LOGGER);
          const worker = new Worker(
            new URL('../../../workers/language/language.worker', import.meta.url),
            { type: 'module', name: 'monosai-language' },
          );
          return new LanguageWorkerClient(
            workerChannel(worker, () => {
              logger.error('worker.failed', { worker: 'language' });
            }),
            logger,
          );
        })(),
    },
  ];
}
