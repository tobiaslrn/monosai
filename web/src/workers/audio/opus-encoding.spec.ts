import { describe, expect, it } from 'vitest';
import { resampleForOpus } from './opus-encoding';

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
