import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetFile } from '../../domain/language/language-assets';
import { err, ok, type Result } from '../../domain/shared/result';
import { describeThrown } from '../../domain/shared/errors';
import { digestHex } from './asset-integrity';

/** One cache per bundle version keeps old bundles usable until cleanup. */
export function languageCacheName(bundleVersion: string): string {
  return `monosai-language-${bundleVersion}`;
}

export interface AssetFetchContext {
  /** Absolute URL of the bundle directory, ending with a slash. */
  readonly baseUrl: string;
  readonly bundleVersion: string;
  readonly fetchFn: typeof fetch;
  readonly cacheStorage: CacheStorage | null;
}

async function openCache(context: AssetFetchContext): Promise<Cache | null> {
  if (context.cacheStorage === null) {
    return null;
  }
  try {
    return await context.cacheStorage.open(languageCacheName(context.bundleVersion));
  } catch {
    return null;
  }
}

async function fetchFromNetwork(
  context: AssetFetchContext,
  url: string,
): Promise<Result<Uint8Array, LanguageError>> {
  try {
    const response = await context.fetchFn(url, { cache: 'no-store' });
    if (!response.ok) {
      return err(
        languageError(
          'assets-unavailable',
          'A language asset could not be downloaded.',
          `status ${response.status} for ${url}`,
        ),
      );
    }
    return ok(new Uint8Array(await response.arrayBuffer()));
  } catch (thrown) {
    return err(
      languageError(
        'assets-unavailable',
        'A language asset could not be downloaded.',
        describeThrown(thrown),
      ),
    );
  }
}

async function verify(
  bytes: Uint8Array,
  file: LanguageAssetFile,
): Promise<Result<Uint8Array, LanguageError>> {
  if (bytes.byteLength !== file.bytes) {
    return err(
      languageError(
        'asset-integrity-mismatch',
        'A language asset does not match its recorded size.',
        `${file.path}: expected ${file.bytes} bytes, received ${bytes.byteLength}`,
      ),
    );
  }
  const digest = await digestHex(bytes);
  if (digest !== file.sha256) {
    return err(
      languageError(
        'asset-integrity-mismatch',
        'A language asset failed its integrity check.',
        `${file.path}: expected ${file.sha256}, computed ${digest}`,
      ),
    );
  }
  return ok(bytes);
}

/**
 * Loads one asset file, cache first, and proves it matches the manifest before
 * returning it.
 *
 * A corrupted cache entry is not fatal: the entry is dropped and the file is
 * downloaded once more. Only when freshly downloaded bytes also fail the check
 * does the caller receive `asset-integrity-mismatch`, so a damaged cache
 * recovers by itself while a genuinely wrong asset is never used.
 */
export async function loadAssetFile(
  context: AssetFetchContext,
  file: LanguageAssetFile,
): Promise<Result<Uint8Array, LanguageError>> {
  const url = new URL(file.path, context.baseUrl).toString();
  const cache = await openCache(context);

  if (cache !== null) {
    const cached = await cache.match(url).catch(() => undefined);
    if (cached !== undefined) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      const verified = await verify(bytes, file);
      if (verified.ok) {
        return verified;
      }
      await cache.delete(url).catch(() => false);
    }
  }

  const downloaded = await fetchFromNetwork(context, url);
  if (!downloaded.ok) {
    return downloaded;
  }
  const verified = await verify(downloaded.value, file);
  if (!verified.ok) {
    return verified;
  }
  if (cache !== null) {
    const body = new ArrayBuffer(verified.value.byteLength);
    new Uint8Array(body).set(verified.value);
    await cache.put(url, new Response(body)).catch(() => undefined);
  }
  return verified;
}

/** Loads and decodes a JSON asset that the manifest describes. */
export async function loadAssetJson(
  context: AssetFetchContext,
  file: LanguageAssetFile,
): Promise<Result<unknown, LanguageError>> {
  const bytes = await loadAssetFile(context, file);
  if (!bytes.ok) {
    return bytes;
  }
  try {
    return ok(JSON.parse(new TextDecoder().decode(bytes.value)));
  } catch (thrown) {
    return err(
      languageError(
        'asset-schema-invalid',
        'A language asset is not valid JSON.',
        `${file.path}: ${describeThrown(thrown)}`,
      ),
    );
  }
}

/**
 * Reads a bundle file that carries no digest of its own, cache first.
 *
 * Only the manifest is loaded this way, and only because it is the root of trust
 * that every other digest comes from. A cache-first read is safe because the
 * bundle URL is immutable: a new bundle is published under a new version
 * directory, so a cached entry can never become stale. Caching it is what makes
 * initialization work with no network at all.
 */
export async function loadUnverifiedAsset(
  context: AssetFetchContext,
  path: string,
): Promise<Result<Uint8Array, LanguageError>> {
  const url = new URL(path, context.baseUrl).toString();
  const cache = await openCache(context);

  if (cache !== null) {
    const cached = await cache.match(url).catch(() => undefined);
    if (cached !== undefined) {
      return ok(new Uint8Array(await cached.arrayBuffer()));
    }
  }

  const downloaded = await fetchFromNetwork(context, url);
  if (!downloaded.ok) {
    return downloaded;
  }
  if (cache !== null) {
    const body = new ArrayBuffer(downloaded.value.byteLength);
    new Uint8Array(body).set(downloaded.value);
    await cache.put(url, new Response(body)).catch(() => undefined);
  }
  return downloaded;
}

/** Removes every cached bundle other than the one being activated. */
export async function pruneOtherBundles(
  cacheStorage: CacheStorage | null,
  keepBundleVersion: string,
): Promise<void> {
  if (cacheStorage === null) {
    return;
  }
  const keep = languageCacheName(keepBundleVersion);
  const names = await cacheStorage.keys().catch(() => []);
  for (const name of names) {
    if (name.startsWith('monosai-language-') && name !== keep) {
      await cacheStorage.delete(name).catch(() => false);
    }
  }
}
