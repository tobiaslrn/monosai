import { describe, expect, it } from 'vitest';
import { readBundleFile } from '../../../testing/language-runtime';
import { HttpLanguageAssetSource } from './http-language-asset.source';
import { languageCacheName } from './language-asset-cache';

const DOCUMENT_BASE = 'https://monosai.test/';
const MANIFEST_URL = 'https://monosai.test/assets/language/1/manifest.json';

function bodyFor(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function urlOf(request: RequestInfo | URL): string {
  if (typeof request === 'string') {
    return request;
  }
  return request instanceof URL ? request.toString() : request.url;
}

/** Minimal in-memory CacheStorage, enough for the cache-first contract. */
function fakeCacheStorage() {
  const caches = new Map<string, Map<string, Uint8Array>>();
  const storage: CacheStorage = {
    open: (name: string) => {
      const entries = caches.get(name) ?? new Map<string, Uint8Array>();
      caches.set(name, entries);
      const cache: Partial<Cache> = {
        match: (request: RequestInfo | URL) => {
          const bytes = entries.get(urlOf(request));
          return Promise.resolve(bytes === undefined ? undefined : new Response(bodyFor(bytes)));
        },
        put: async (request: RequestInfo | URL, response: Response) => {
          entries.set(urlOf(request), new Uint8Array(await response.arrayBuffer()));
        },
        delete: (request: RequestInfo | URL) => Promise.resolve(entries.delete(urlOf(request))),
      };
      return Promise.resolve(cache as Cache);
    },
    keys: () => Promise.resolve([...caches.keys()]),
    delete: (name: string) => Promise.resolve(caches.delete(name)),
    has: (name: string) => Promise.resolve(caches.has(name)),
    match: () => Promise.resolve(undefined),
  };
  return { storage, caches };
}

describe('HttpLanguageAssetSource manifest loading', () => {
  it('replaces a cached manifest that is not a manifest with a fresh download', async () => {
    const { storage, caches } = fakeCacheStorage();
    // An earlier visit cached a 200 error page in place of the manifest.
    const page = new TextEncoder().encode('<!doctype html><title>Sign in</title>');
    await storage.open(languageCacheName('1'));
    caches.get(languageCacheName('1'))!.set(MANIFEST_URL, page);
    const fetchFn = ((input: RequestInfo | URL) => {
      expect(urlOf(input)).toBe(MANIFEST_URL);
      return Promise.resolve(new Response(bodyFor(readBundleFile('manifest.json'))));
    }) as typeof fetch;

    const source = new HttpLanguageAssetSource(DOCUMENT_BASE, fetchFn, storage);
    const manifest = await source.loadManifest();

    expect(manifest.ok).toBe(true);
    const cached = caches.get(languageCacheName('1'))!.get(MANIFEST_URL)!;
    expect(new TextDecoder().decode(cached)).toBe(
      new TextDecoder().decode(readBundleFile('manifest.json')),
    );
  });

  it('caches nothing when the download is not a manifest either', async () => {
    const { storage, caches } = fakeCacheStorage();
    const page = new TextEncoder().encode('<!doctype html><title>Sign in</title>');
    const fetchFn = (() => Promise.resolve(new Response(bodyFor(page)))) as typeof fetch;

    const source = new HttpLanguageAssetSource(DOCUMENT_BASE, fetchFn, storage);
    const manifest = await source.loadManifest();

    expect(manifest.ok).toBe(false);
    expect(manifest.ok ? null : manifest.error.code).toBe('asset-manifest-invalid');
    expect(caches.get(languageCacheName('1'))?.has(MANIFEST_URL)).toBe(false);
  });

  it('uses a valid cached manifest without going to the network', async () => {
    const { storage } = fakeCacheStorage();
    const online = new HttpLanguageAssetSource(
      DOCUMENT_BASE,
      () => Promise.resolve(new Response(bodyFor(readBundleFile('manifest.json')))),
      storage,
    );
    expect((await online.loadManifest()).ok).toBe(true);

    const offline = new HttpLanguageAssetSource(
      DOCUMENT_BASE,
      () => Promise.reject(new TypeError('offline')),
      storage,
    );
    expect((await offline.loadManifest()).ok).toBe(true);
  });

  it('reports the manifest as unavailable when it cannot be downloaded', async () => {
    const { storage } = fakeCacheStorage();
    const source = new HttpLanguageAssetSource(
      DOCUMENT_BASE,
      () => Promise.reject(new TypeError('offline')),
      storage,
    );
    const manifest = await source.loadManifest();
    expect(manifest.ok ? null : manifest.error.code).toBe('assets-unavailable');
  });
});
