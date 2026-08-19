import { type Provider } from '@angular/core';
import { MARKUP_TEXT_EXTRACTOR } from '../../application/shared/anki-tokens';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
import { DomMarkupTextExtractor } from './dom-markup-text';
import { PackageProviderAdapter, type PackageSource } from './package/package-provider.adapter';
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
): AnkiVocabularyProvider {
  const worker = new Worker(new URL('../../../workers/package/package.worker', import.meta.url), {
    type: 'module',
    name: 'monosai-package',
  });
  return new PackageProviderAdapter(
    new PackageWorkerClient(packageWorkerChannel(worker)),
    source,
    sqliteWasmUrl(baseUri),
  );
}

/**
 * Binds the Anki ports that have one implementation.
 *
 * Providers themselves are not registered here: each needs something only the
 * refresh has — the file the learner chose, or the endpoint they selected — so
 * they are created per refresh rather than injected as singletons.
 */
export function provideAnki(): Provider[] {
  return [
    {
      provide: MARKUP_TEXT_EXTRACTOR,
      useFactory: () => new DomMarkupTextExtractor(),
    },
  ];
}
