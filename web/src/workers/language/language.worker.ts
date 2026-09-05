/// <reference lib="webworker" />
import { LanguageWorkerHost } from './language-worker-host';
import { createLinderaRuntime } from './lindera-tokenizer';

/**
 * Language worker entry point.
 *
 * It only wires browser globals into `LanguageWorkerHost`; all behaviour lives in
 * the host so it can be tested without a Worker.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = new LanguageWorkerHost({
  post: (message) => {
    scope.postMessage(message);
  },
  createTokenizer: createLinderaRuntime,
  fetchFn: (input, init) => scope.fetch(input, init),
  cacheStorage: typeof caches === 'undefined' ? null : caches,
});

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  void host.handleMessage(event.data);
});
