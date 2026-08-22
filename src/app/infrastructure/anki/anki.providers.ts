import { DOCUMENT, inject, type Provider } from '@angular/core';
import { LOGGER, type Logger } from '../../application/shared/diagnostics';
import {
  ANKI_PROVIDER_FACTORY,
  MARKUP_TEXT_EXTRACTOR,
  PACKAGE_PROVIDER_FACTORY,
  type AnkiProviderFactory,
  type PackageProviderFactory,
} from '../../application/shared/anki-tokens';
import type { AnkiVocabularyProvider, PackageSource } from '../../domain/anki/anki-provider';
import { AndroidConnectAdapter } from './connect/android-connect.adapter';
import { ANDROID_ENDPOINTS, AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect/connect-client';
import { DesktopConnectAdapter } from './connect/desktop-connect.adapter';
import { DomMarkupTextExtractor } from './dom-markup-text';
import { PackageProviderAdapter } from './package/package-provider.adapter';
import { PackageWorkerClient, packageWorkerChannel } from './package/package-worker.client';

/** Where the SQLite runtime is served from, relative to the application base. */
const SQLITE_WASM_PATH = 'assets/sqlite/sql-wasm.wasm';

function sqliteWasmUrl(baseUri: string): string {
  return new URL(SQLITE_WASM_PATH, baseUri).toString();
}

/**
 * Creates a package provider for one chosen file.
 *
 * A fresh worker is started per package and terminated with the provider, which
 * is how the archive, the decompressed collection, and the SQLite heap are
 * actually returned to the browser.
 */
export function createPackageProvider(
  source: PackageSource,
  baseUri: string,
  logger?: Logger,
): AnkiVocabularyProvider {
  const worker = new Worker(new URL('../../../workers/package/package.worker', import.meta.url), {
    type: 'module',
    name: 'monosai-package',
  });
  return new PackageProviderAdapter(
    new PackageWorkerClient(
      packageWorkerChannel(worker, () => logger?.error('worker.failed', { worker: 'package' })),
      logger,
    ),
    source,
    sqliteWasmUrl(baseUri),
    logger,
  );
}

/**
 * Binds the Anki ports.
 *
 * Providers are created per refresh rather than as singletons: the package
 * provider owns a worker whose memory is only reclaimed by terminating it, and
 * a connection provider should not outlive the screen that opened it. Both
 * factories exist so a feature can ask for a provider without reaching into
 * infrastructure to construct one.
 */
export function provideAnki(): Provider[] {
  return [
    {
      provide: MARKUP_TEXT_EXTRACTOR,
      useFactory: () => new DomMarkupTextExtractor(),
    },
    {
      provide: PACKAGE_PROVIDER_FACTORY,
      useFactory: (): PackageProviderFactory => {
        const documentRef = inject(DOCUMENT);
        const logger = inject<Logger>(LOGGER);
        return (source) => createPackageProvider(source, documentRef.baseURI, logger);
      },
    },
    {
      provide: ANKI_PROVIDER_FACTORY,
      useFactory: (): AnkiProviderFactory => {
        const documentRef = inject(DOCUMENT);
        const pageOrigin = documentRef.defaultView?.location.origin ?? documentRef.baseURI;
        const fetchFn: typeof fetch = (input, init) => fetch(input, init);
        const logger = inject<Logger>(LOGGER);

        return (kind) =>
          kind === 'android-connect'
            ? new AndroidConnectAdapter(
                new AnkiConnectClient({
                  endpoints: ANDROID_ENDPOINTS,
                  fetchFn,
                  pageOrigin,
                  unreachableCode: 'bridge-not-running',
                  logger,
                }),
              )
            : new DesktopConnectAdapter(
                new AnkiConnectClient({
                  endpoints: DESKTOP_ENDPOINTS,
                  fetchFn,
                  pageOrigin,
                  unreachableCode: 'not-running',
                  logger,
                }),
              );
      },
    },
  ];
}
