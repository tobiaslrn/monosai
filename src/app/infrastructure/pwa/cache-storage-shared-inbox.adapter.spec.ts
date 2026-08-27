import { beforeEach, describe, expect, it } from 'vitest';
import { CacheStorageSharedPackageInbox } from './cache-storage-shared-inbox.adapter';

const BASE = 'https://example.test/monosai/';
const INBOX_URL = `${BASE}shared-package`;
const NOW = 1_700_000_000_000;

/** Enough of Cache Storage to hold one entry, matched by URL. */
class FakeCache {
  readonly entries = new Map<string, Response>();

  match(url: string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(url));
  }

  put(url: string, response: Response): Promise<void> {
    this.entries.set(url, response);
    return Promise.resolve();
  }

  delete(url: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(url));
  }
}

function storage(cache: FakeCache): CacheStorage {
  return { open: () => Promise.resolve(cache) } as unknown as CacheStorage;
}

function shared(name: string, receivedAt: number, body = 'package-bytes'): Response {
  return new Response(body, {
    headers: {
      'x-monosai-file-name': encodeURIComponent(name),
      'x-monosai-received-at': String(receivedAt),
    },
  });
}

describe('CacheStorageSharedPackageInbox', () => {
  let cache: FakeCache;
  let inbox: CacheStorageSharedPackageInbox;

  beforeEach(() => {
    cache = new FakeCache();
    inbox = new CacheStorageSharedPackageInbox(storage(cache), BASE, () => NOW);
  });

  it('hands over a waiting package and empties the slot', async () => {
    await cache.put(INBOX_URL, shared('コア.apkg', NOW - 2000));

    const claimed = await inbox.claim();

    expect(claimed?.fileName).toBe('コア.apkg');
    expect(claimed?.receivedAt).toBe(NOW - 2000);
    expect(new TextDecoder().decode(await claimed!.bytes())).toBe('package-bytes');
    expect(cache.entries.size).toBe(0);
    expect(await inbox.claim()).toBeNull();
  });

  it('answers with nothing when no package is waiting', async () => {
    expect(await inbox.claim()).toBeNull();
  });

  it('drops a package left over from a session that never came back', async () => {
    await cache.put(INBOX_URL, shared('core.apkg', NOW - 60 * 60 * 1000));

    expect(await inbox.claim()).toBeNull();
    expect(cache.entries.size).toBe(0);
  });

  it('names the file safely when the header is missing or unusable', async () => {
    await cache.put(
      INBOX_URL,
      new Response('bytes', { headers: { 'x-monosai-received-at': String(NOW) } }),
    );

    expect((await inbox.claim())?.fileName).toBe('shared.apkg');
  });

  it('is simply empty where Cache Storage is unavailable', async () => {
    const withoutCaches = new CacheStorageSharedPackageInbox(undefined, BASE, () => NOW);

    expect(await withoutCaches.claim()).toBeNull();
    await expect(withoutCaches.clear()).resolves.toBeUndefined();
  });

  it('is simply empty where storage is blocked', async () => {
    const refusing = {
      open: () => Promise.reject(new Error('blocked')),
    } as unknown as CacheStorage;

    const blocked = new CacheStorageSharedPackageInbox(refusing, BASE, () => NOW);

    expect(await blocked.claim()).toBeNull();
  });

  it('clears a waiting package without importing it', async () => {
    await cache.put(INBOX_URL, shared('core.apkg', NOW));

    await inbox.clear();

    expect(cache.entries.size).toBe(0);
  });
});
