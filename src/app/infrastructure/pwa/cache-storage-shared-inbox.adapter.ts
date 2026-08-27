import type {
  SharedPackage,
  SharedPackageInbox,
} from '../../domain/platform/shared-package-inbox.port';

/** Must match what `public/monosai-sw.js` writes. */
const INBOX_CACHE = 'monosai-shared-inbox';
const INBOX_PATH = 'shared-package';
const FILE_NAME_HEADER = 'x-monosai-file-name';
const RECEIVED_AT_HEADER = 'x-monosai-received-at';

/**
 * How long a shared package stays claimable.
 *
 * A share is answered by a redirect straight into the app, so a claim happens
 * seconds later. An entry older than this belongs to a session that never came
 * back — importing it silently, days later, would look like Monosai changing
 * the vocabulary on its own, so it is dropped instead.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The service worker's single-slot handover, read from Cache Storage.
 *
 * Cache Storage rather than IndexedDB because the worker has to write the file
 * before any page exists to receive it, and this keeps Monosai's database out
 * of the worker entirely.
 */
export class CacheStorageSharedPackageInbox implements SharedPackageInbox {
  constructor(
    private readonly caches: CacheStorage | undefined,
    private readonly baseUri: string,
    private readonly now: () => number,
  ) {}

  async claim(): Promise<SharedPackage | null> {
    const cache = await this.open();
    if (cache === null) {
      return null;
    }
    const url = this.url();
    const response = await cache.match(url);
    // Removed as it is handed over: one share, one import.
    await cache.delete(url);
    if (response === undefined) {
      return null;
    }

    const receivedAt = Number(response.headers.get(RECEIVED_AT_HEADER) ?? '0');
    if (!Number.isFinite(receivedAt) || this.now() - receivedAt > MAX_AGE_MS) {
      return null;
    }
    const blob = await response.blob();
    return {
      fileName: decodeFileName(response.headers.get(FILE_NAME_HEADER)),
      receivedAt,
      bytes: () => blob.arrayBuffer(),
    };
  }

  async clear(): Promise<void> {
    const cache = await this.open();
    await cache?.delete(this.url());
  }

  private async open(): Promise<Cache | null> {
    if (this.caches === undefined) {
      return null;
    }
    try {
      return await this.caches.open(INBOX_CACHE);
    } catch {
      // Private windows and blocked storage answer this way; there is simply
      // nothing waiting, which is a normal state rather than a failure.
      return null;
    }
  }

  private url(): string {
    return new URL(INBOX_PATH, this.baseUri).toString();
  }
}

function decodeFileName(raw: string | null): string {
  if (raw === null || raw === '') {
    return 'shared.apkg';
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return 'shared.apkg';
  }
}
