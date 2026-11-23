import { describe, expect, it } from 'vitest';
import { ok } from '../../domain/shared/result';
import { restartingSpeechEncoder, type StoppableSpeechEncoder } from './audio.providers';

describe('restartingSpeechEncoder', () => {
  const samples = () => ({ samples: new Int16Array([1, 2]), sampleRate: 24_000, channels: 1 });

  function startCounting(): {
    start: () => Promise<StoppableSpeechEncoder & { stopped: boolean }>;
    started: (StoppableSpeechEncoder & { stopped: boolean })[];
  } {
    const started: (StoppableSpeechEncoder & { stopped: boolean })[] = [];
    return {
      started,
      start: () => {
        const encoder = {
          stopped: false,
          encode: () =>
            Promise.resolve(ok({ bytes: new ArrayBuffer(1), mimeType: 'audio/webm' as const })),
        };
        started.push(encoder);
        return Promise.resolve(encoder);
      },
    };
  }

  it('keeps one encoder while it is running', async () => {
    const { start, started } = startCounting();
    const encoder = restartingSpeechEncoder(start);

    await encoder.encode(samples());
    await encoder.encode(samples());

    expect(started).toHaveLength(1);
  });

  it('starts a new encoder for the next clip once its worker has stopped', async () => {
    const { start, started } = startCounting();
    const encoder = restartingSpeechEncoder(start);
    await encoder.encode(samples());

    const first = started[0];
    if (first === undefined) throw new Error('no encoder started');
    first.stopped = true;
    const outcomes = await Promise.all([encoder.encode(samples()), encoder.encode(samples())]);

    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    // Both clips found the stopped one; only one replacement was started.
    expect(started).toHaveLength(2);
    expect(started[1]?.stopped).toBe(false);
  });
});
