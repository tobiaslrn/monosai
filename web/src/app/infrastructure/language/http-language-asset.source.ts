import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetManifest } from '../../domain/language/language-assets';
import type { LanguageAssetSource } from '../../domain/language/language-runtime';
import { describeThrown } from '../../domain/shared/errors';
import { err, ok, type Result } from '../../domain/shared/result';
import { languageAssetManifestSchema } from './language-asset.schema';
import {
  loadValidatedAsset,
  pruneOtherBundles,
  type AssetFetchContext,
} from './language-asset-cache';

/**
 * Immutable bundle version. A new bundle is published under a new directory, so
 * a cached bundle URL never changes meaning and previously stored analyses keep
 * pointing at the assets that produced them.
 */
export const LANGUAGE_BUNDLE_VERSION = '1';

export function languageBundleUrl(documentBaseUrl: string): string {
  return new URL(`assets/language/${LANGUAGE_BUNDLE_VERSION}/`, documentBaseUrl).toString();
}

/**
 * Loads the language manifest from the application's own origin.
 *
 * The manifest is the root of trust for every other asset: it is schema
 * validated here, before it is cached or used, and each file it lists is then
 * proven against the digest it records before use. It is cached alongside those
 * files so that initialization works with no network at all, and a cached copy
 * that no longer validates is replaced by a fresh download.
 */
export class HttpLanguageAssetSource implements LanguageAssetSource {
  readonly baseUrl: string;
  private readonly context: AssetFetchContext;

  constructor(
    documentBaseUrl: string,
    fetchFn: typeof fetch,
    private readonly cacheStorage: CacheStorage | null,
  ) {
    this.baseUrl = languageBundleUrl(documentBaseUrl);
    this.context = {
      baseUrl: this.baseUrl,
      bundleVersion: LANGUAGE_BUNDLE_VERSION,
      fetchFn,
      cacheStorage,
    };
  }

  async loadManifest(): Promise<Result<LanguageAssetManifest, LanguageError>> {
    const manifest = await loadValidatedAsset(this.context, 'manifest.json', parseManifest);
    if (!manifest.ok && manifest.error.code !== 'asset-manifest-invalid') {
      return err(
        languageError(
          'assets-unavailable',
          'The language asset manifest could not be loaded.',
          manifest.error.cause,
        ),
      );
    }
    return manifest;
  }

  async pruneSupersededBundles(activeBundleVersion: string): Promise<void> {
    await pruneOtherBundles(this.cacheStorage, activeBundleVersion);
  }
}

/** Decodes and checks manifest bytes, whether cached or freshly downloaded. */
function parseManifest(bytes: Uint8Array): Result<LanguageAssetManifest, LanguageError> {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (thrown) {
    return err(
      languageError(
        'asset-manifest-invalid',
        'The language asset manifest is not valid JSON.',
        describeThrown(thrown),
      ),
    );
  }

  const parsed = languageAssetManifestSchema.safeParse(payload);
  if (!parsed.success) {
    return err(
      languageError(
        'asset-manifest-invalid',
        'The language asset manifest is not valid.',
        parsed.error.issues[0]?.message,
      ),
    );
  }
  if (parsed.data.bundleVersion !== LANGUAGE_BUNDLE_VERSION) {
    return err(
      languageError(
        'asset-manifest-invalid',
        'The language asset manifest is for a different bundle version.',
        `expected ${LANGUAGE_BUNDLE_VERSION}, found ${parsed.data.bundleVersion}`,
      ),
    );
  }
  return ok(parsed.data);
}
