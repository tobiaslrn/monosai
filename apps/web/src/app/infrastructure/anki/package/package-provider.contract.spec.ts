import { createPackageHarness, readAnkiFixture } from '../../../../testing/anki-package-harness';
import type { AnkiFixtureName } from '../../../../testing/anki-package-harness';
import { runProviderContract } from '../../../../testing/anki-provider-contract';
import { PackageProviderAdapter } from './package-provider.adapter';
import { PackageWorkerClient } from './package-worker.client';

/**
 * Runs the shared contract against the real package pipeline.
 *
 * Everything below the adapter is production code — the client, the protocol,
 * the worker host, the ZIP reader, the zstd decoder, and SQLite — driven over an
 * in-process channel instead of a real `Worker`. That is what makes a
 * disagreement with the reference fake meaningful: the two are answering the
 * same questions from genuinely different sources.
 */
function providerFor(fixture: AnkiFixtureName) {
  return () => {
    const harness = createPackageHarness();
    const client = new PackageWorkerClient(harness.channel);
    const provider = new PackageProviderAdapter(
      client,
      {
        fileName: fixture,
        bytes: () => Promise.resolve(readAnkiFixture(fixture)),
      },
      'unused-in-tests',
    );
    return { provider };
  };
}

runProviderContract(
  'package (schema 18, zstd)',
  {
    standard: providerFor('contract-schema18-zstd.apkg'),
    withoutReviewEvidence: providerFor('no-review-evidence.apkg'),
  },
  'package',
);

runProviderContract(
  'package (schema 18, deflate)',
  { standard: providerFor('contract-schema18-deflate.apkg') },
  'package',
);

runProviderContract(
  'package (schema 11, legacy JSON)',
  { standard: providerFor('contract-schema11.apkg') },
  'package',
);

runProviderContract(
  'package (.colpkg)',
  { standard: providerFor('contract-schema18-zstd.colpkg') },
  'package',
);
