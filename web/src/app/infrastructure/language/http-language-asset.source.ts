import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetManifest } from '../../domain/language/language-assets';
import type { LanguageAssetSource } from '../../domain/language/language-runtime';
import { describeThrown } from '../../domain/shared/errors';
import { err, ok, type Result } from '../../domain/shared/result';
import { languageAssetManifestSchema } from './language-asset.schema';
import {
  loadUnverifiedAsset,
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
 * validated here, and each file it lists is then proven against the digest it
 * records before use. It is cached alongside those files so that initialization
 * works with no network at all.
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
    const bytes = await loadUnverifiedAsset(this.context, 'manifest.json');
    if (!bytes.ok) {
      return err(
        languageError(
          'assets-unavailable',
          'The language asset manifest could not be loaded.',
          bytes.error.cause,
        ),
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes.value));
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

  async pruneSupersededBundles(activeBundleVersion: string): Promise<void> {
    await pruneOtherBundles(this.cacheStorage, activeBundleVersion);
  }
}
