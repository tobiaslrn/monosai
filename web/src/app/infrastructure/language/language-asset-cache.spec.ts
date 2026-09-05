import { describe, expect, it } from 'vitest';
import { readBundleFile, readBundleManifest } from '../../../testing/language-runtime';
import type { LanguageAssetFile } from '../../domain/language/language-assets';
import {
  languageCacheName,
  loadAssetFile,
  loadAssetJson,
  pruneOtherBundles,
  type AssetFetchContext,
} from './language-asset-cache';

const BASE_URL = 'https://monosai.test/assets/language/1/';

function fileOf(path: 'structural-baseline.json' | 'grammar-presets.json'): LanguageAssetFile {
  const manifest = readBundleManifest();
  return path === 'structural-baseline.json'
    ? manifest.components.structuralBaseline.files[0]
    : manifest.components.grammarPresets.files[0];
}

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

interface Recorder {
  readonly fetchFn: typeof fetch;
  readonly calls: string[];
}

function recordingFetch(overrides: Readonly<Record<string, Uint8Array>> = {}): Recorder {
  const calls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL) => {
    const url = urlOf(input);
    calls.push(url);
    const path = url.slice(BASE_URL.length);
    const bytes = overrides[path] ?? readBundleFile(path);
    return Promise.resolve(new Response(bodyFor(bytes)));
  }) as typeof fetch;
  return { fetchFn, calls };
}

function contextWith(recorder: Recorder, cacheStorage: CacheStorage | null): AssetFetchContext {
  return { baseUrl: BASE_URL, bundleVersion: '1', fetchFn: recorder.fetchFn, cacheStorage };
}

describe('language asset cache', () => {
  it('downloads once and serves the second request from the cache', async () => {
    const recorder = recordingFetch();
    const { storage } = fakeCacheStorage();
    const context = contextWith(recorder, storage);
    const file = fileOf('structural-baseline.json');

    const first = await loadAssetFile(context, file);
    const second = await loadAssetFile(context, file);

    expect(first.ok && second.ok).toBe(true);
    expect(recorder.calls).toHaveLength(1);
  });

  it('recovers from a corrupted cache entry by downloading again', async () => {
    const recorder = recordingFetch();
    const { storage, caches } = fakeCacheStorage();
    const context = contextWith(recorder, storage);
    const file = fileOf('structural-baseline.json');

    await loadAssetFile(context, file);
    const url = `${BASE_URL}${file.path}`;
    caches.get(languageCacheName('1'))?.set(url, new TextEncoder().encode('corrupted'));

    const recovered = await loadAssetFile(context, file);

    expect(recovered.ok).toBe(true);
    expect(recorder.calls).toHaveLength(2);
  });

  it('reports an integrity mismatch when the served bytes are wrong', async () => {
    const file = fileOf('structural-baseline.json');
    const recorder = recordingFetch({
      'structural-baseline.json': new TextEncoder().encode('{"schemaVersion":1}'),
    });
    const result = await loadAssetFile(contextWith(recorder, null), file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('asset-integrity-mismatch');
    }
  });

  it('does not cache bytes that failed verification', async () => {
    const file = fileOf('structural-baseline.json');
    const recorder = recordingFetch({
      'structural-baseline.json': new TextEncoder().encode('{"schemaVersion":1}'),
    });
    const { storage, caches } = fakeCacheStorage();
    await loadAssetFile(contextWith(recorder, storage), file);

    expect(caches.get(languageCacheName('1'))?.size ?? 0).toBe(0);
  });

  it('works without Cache Storage at all', async () => {
    const recorder = recordingFetch();
    const result = await loadAssetFile(contextWith(recorder, null), fileOf('grammar-presets.json'));
    expect(result.ok).toBe(true);
  });

  it('decodes a verified JSON asset', async () => {
    const recorder = recordingFetch();
    const result = await loadAssetJson(contextWith(recorder, null), fileOf('grammar-presets.json'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { schemaVersion: number }).schemaVersion).toBe(1);
    }
  });

  it('removes cached bundles other than the active one', async () => {
    const { storage, caches } = fakeCacheStorage();
    await storage.open(languageCacheName('0'));
    await storage.open(languageCacheName('1'));
    await storage.open('unrelated-cache');

    await pruneOtherBundles(storage, '1');

    expect([...caches.keys()].sort()).toEqual([languageCacheName('1'), 'unrelated-cache']);
  });
});
