import { describe, expect, it } from 'vitest';
import { encodeOpusWebm, resampleForOpus, type WebCodecsAudio } from './opus-encoding';

function samples(values: readonly number[]): Int16Array<ArrayBuffer> {
  return Int16Array.from(values);
}

describe('resampleForOpus', () => {
  it('passes a rate Opus accepts through untouched', () => {
    const input = { samples: samples([1, 2, 3]), sampleRate: 24_000, channels: 1 };
    expect(resampleForOpus(input)).toBe(input);
  });

  it('brings 44.1 kHz to 48 kHz and keeps the length in time', () => {
    const frames = 44_100;
    const ramp = Array.from({ length: frames }, (_, index) => index % 1000);
    const output = resampleForOpus({ samples: samples(ramp), sampleRate: 44_100, channels: 1 });

    expect(output.sampleRate).toBe(48_000);
    expect(output.channels).toBe(1);
    expect(output.samples.length).toBe(48_000);
    expect(output.samples[0]).toBe(0);
  });

  it('interpolates each channel of interleaved stereo on its own', () => {
    const left = [0, 100, 200, 300];
    const right = [-0, -100, -200, -300];
    const interleaved = left.flatMap((value, index) => [value, right[index] ?? 0]);
    const output = resampleForOpus({
      samples: samples(interleaved),
      sampleRate: 22_050,
      channels: 2,
    });

    expect(output.channels).toBe(2);
    for (let frame = 0; frame < output.samples.length / 2; frame += 1) {
      expect(output.samples[frame * 2]).toBeGreaterThanOrEqual(0);
      expect(output.samples[frame * 2 + 1]).toBeLessThanOrEqual(0);
    }
    expect(output.samples[output.samples.length - 2]).toBe(300);
    expect(output.samples[output.samples.length - 1]).toBe(-300);
  });
});

/** WebCodecs stand-in that records whether each input frame was closed. */
function recordingCodecs(options: { failOn?: 'output' } = {}) {
  const frames: { closed: boolean }[] = [];
  class FakeAudioEncoder {
    static isConfigSupported = () => Promise.resolve({ supported: true, config: {} });
    state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
    constructor(
      private readonly init: {
        output: (chunk: unknown, metadata: unknown) => void;
        error: (thrown: unknown) => void;
      },
    ) {}
    configure(): void {
      this.state = 'configured';
    }
    encode(): void {
      if (options.failOn === 'output') {
        this.init.error(new Error('encoder fell over'));
        return;
      }
      const head = new Uint8Array(19);
      head.set(new TextEncoder().encode('OpusHead'), 0);
      head[8] = 1;
      head[9] = 1;
      this.init.output(
        { byteLength: 8, timestamp: 0, copyTo: (target: Uint8Array) => target.fill(1) },
        { decoderConfig: { description: head } },
      );
    }
    flush(): Promise<void> {
      return Promise.resolve();
    }
    close(): void {
      this.state = 'closed';
    }
  }
  class FakeAudioData {
    closed = false;
    constructor() {
      frames.push(this);
    }
    close(): void {
      this.closed = true;
    }
  }
  return {
    frames,
    codecs: {
      AudioEncoder: FakeAudioEncoder,
      AudioData: FakeAudioData,
    } as unknown as WebCodecsAudio,
  };
}

const CLIP = { samples: new Int16Array(4800), sampleRate: 24_000, channels: 1 };

describe('encodeOpusWebm', () => {
  it('closes the frame it hands the encoder once the clip is encoded', async () => {
    const { frames, codecs } = recordingCodecs();

    const result = await encodeOpusWebm(CLIP, codecs);

    expect(result.ok).toBe(true);
    expect(frames).toHaveLength(1);
    expect(frames.every((frame) => frame.closed)).toBe(true);
  });

  it('closes the frame it hands the encoder when the encoder fails', async () => {
    const { frames, codecs } = recordingCodecs({ failOn: 'output' });

    const result = await encodeOpusWebm(CLIP, codecs);

    expect(result.ok).toBe(false);
    expect(frames.every((frame) => frame.closed)).toBe(true);
  });
});
