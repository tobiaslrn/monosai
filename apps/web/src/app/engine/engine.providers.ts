import type { Provider } from '@angular/core';
import {
  ENGINE_CLIENT,
  WorkerEngineClient,
  type EnginePort,
  type WorkerMessage,
} from './engine-client';

/**
 * The engine client, over a dedicated worker started the first time anything
 * injects it. Kept apart from the client so unit tests never load the worker.
 */
export function provideEngine(): Provider {
  return {
    provide: ENGINE_CLIENT,
    useFactory: () => {
      const worker = new Worker(new URL('./engine.worker', import.meta.url), {
        type: 'module',
        name: 'monosai-engine',
      });
      return new WorkerEngineClient(workerPort(worker));
    },
  };
}

function workerPort(worker: Worker): EnginePort {
  return {
    post: (message) => {
      worker.postMessage(message);
    },
    listen: (received, failed) => {
      // The shim posts only what the engine's contract and its own failure
      // message allow; the engine validated everything it answers.
      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
        received(event.data);
      });
      worker.addEventListener('error', failed);
      worker.addEventListener('messageerror', failed);
    },
  };
}
