/// <reference lib="webworker" />
import { PackageWorkerHost } from './package-worker-host';
import { sqlJsDatabaseFactory } from './sqlite-runtime';

/**
 * Package worker entry point.
 *
 * It only wires browser globals into `PackageWorkerHost`; all behaviour lives in
 * the host so it can be tested without a Worker. The zstd decoder is imported
 * lazily because only version 3 packages need it.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = new PackageWorkerHost({
  post: (message) => {
    scope.postMessage(message);
  },
  createDatabase: sqlJsDatabaseFactory,
  loadZstd: async () => {
    const { decompress } = await import('fzstd');
    return (input) => decompress(input);
  },
});

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  void host.handleMessage(event.data);
});
