import type { LanguageAssetManifest } from '../app/domain/language/language-assets';
import type {
  LanguageRequestMessage,
  LanguageResponseMessage,
} from '../app/infrastructure/language/worker-protocol';
import { LanguageWorkerHost } from '../workers/language/language-worker-host';
import type { TokenizerRuntimeFactory } from '../workers/language/tokenizer-runtime';
import { readBundleFile, readBundleManifest, sharedTokenizerRuntime } from './language-runtime';

export const TEST_BASE_URL = 'https://monosai.test/assets/language/1/';

/**
 * Serves the committed bundle over a fake `fetch`, so worker tests exercise the
 * real assets, the real digests, and the real integrity check.
 */
export function bundleFetch(
  overrides: Readonly<Record<string, Uint8Array | 'missing'>> = {},
): typeof fetch {
  return (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.slice(TEST_BASE_URL.length);
    if (path in overrides && overrides[path] === 'missing') {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const override = path in overrides ? (overrides[path] as Uint8Array) : null;
    const bytes = override ?? readBundleFile(path);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return Promise.resolve(new Response(body, { status: 200 }));
  };
}

/** Reuses the shared tokenizer so each test does not re-instantiate WebAssembly. */
export const sharedTokenizerFactory: TokenizerRuntimeFactory = () => sharedTokenizerRuntime();

export const failingTokenizerFactory: TokenizerRuntimeFactory = () => {
  throw new Error('tokenizer runtime refused to start');
};

export interface HarnessOptions {
  readonly fetchFn?: typeof fetch;
  readonly createTokenizer?: TokenizerRuntimeFactory;
  readonly chunkCharacters?: number;
}

export interface WorkerHarness {
  readonly responses: LanguageResponseMessage[];
  readonly manifest: LanguageAssetManifest;
  send(message: LanguageRequestMessage): Promise<void>;
  responseFor(requestId: string): LanguageResponseMessage | undefined;
}

/**
 * Drives `LanguageWorkerHost` directly. Unit tests run without a Worker global,
 * and the host is the whole worker apart from its message wiring.
 */
export function createWorkerHarness(options: HarnessOptions = {}): WorkerHarness {
  const responses: LanguageResponseMessage[] = [];
  const host = new LanguageWorkerHost({
    post: (message) => responses.push(message),
    createTokenizer: options.createTokenizer ?? sharedTokenizerFactory,
    fetchFn: options.fetchFn ?? bundleFetch(),
    cacheStorage: null,
    ...(options.chunkCharacters === undefined ? {} : { chunkCharacters: options.chunkCharacters }),
    yieldControl: () => Promise.resolve(),
  });

  return {
    responses,
    manifest: readBundleManifest(),
    send: (message) => host.handleMessage(message),
    responseFor: (requestId) => responses.find((response) => response.requestId === requestId),
  };
}
