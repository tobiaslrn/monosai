import { describe, expect, it } from 'vitest';
import { SpeechEncoderClient, speechEncoderChannel } from './speech-encoder.client';

describe('speechEncoderChannel when the worker itself fails', () => {
  /** Stands in for a `Worker`: an event target that records what was posted. */
  function fakeWorker(): Worker & { posted: unknown[]; terminated: number } {
    const target = new EventTarget() as Worker & { posted: unknown[]; terminated: number };
    target.posted = [];
    target.terminated = 0;
    target.postMessage = (message: unknown) => {
      target.posted.push(message);
    };
    target.terminate = () => {
      target.terminated += 1;
    };
    return target;
  }

  const samples = () => ({
    samples: new Int16Array([1, 2, 3, 4]),
    sampleRate: 24_000,
    channels: 1,
  });

  it.each(['error', 'messageerror'])(
    'settles a pending encode with worker-unavailable once the worker reports %s',
    async (type) => {
      const worker = fakeWorker();
      const client = new SpeechEncoderClient(speechEncoderChannel(worker, () => undefined));

      const encoding = client.encode(samples());
      // The worker script failed to load, threw at top level, or was killed:
      // nothing will ever answer the request that was just posted.
      worker.dispatchEvent(new Event(type));

      const outcome = await Promise.race([
        encoding,
        new Promise<'still pending'>((resolve) =>
          setTimeout(() => {
            resolve('still pending');
          }, 50),
        ),
      ]);
      expect(outcome).not.toBe('still pending');
      expect(outcome !== 'still pending' && !outcome.ok && outcome.error.code).toBe(
        'worker-unavailable',
      );
      expect(client.stopped).toBe(true);
      expect(worker.terminated).toBe(1);
      const later = await client.encode(samples());
      expect(!later.ok && later.error.code).toBe('worker-unavailable');
    },
  );
});
