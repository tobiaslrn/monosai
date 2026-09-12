import { describe, expect, it } from 'vitest';
import { muxOpusWebm, type OpusPacket } from './webm-opus';

/** A 19-byte `OpusHead` with a pre-skip of 312 samples, as an encoder reports it. */
function opusHead(preSkip = 312): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1; // version
  head[9] = 1; // channels
  head[10] = preSkip & 0xff;
  head[11] = (preSkip >> 8) & 0xff;
  new DataView(head.buffer).setUint32(12, 24_000, true);
  return head;
}

function packets(count: number, frameUs = 60_000, size = 40): OpusPacket[] {
  return Array.from({ length: count }, (_value, index) => ({
    data: new Uint8Array(size).fill(index + 1),
    timestampUs: index * frameUs,
  }));
}

function mux(overrides: Partial<Parameters<typeof muxOpusWebm>[0]> = {}): Uint8Array {
  return muxOpusWebm({
    packets: packets(3),
    codecPrivate: opusHead(),
    sampleRate: 24_000,
    channels: 1,
    durationUs: 180_000,
    ...overrides,
  });
}

/** Finds an element id in the file, so a test can assert it was written. */
function indexOfId(file: Uint8Array, id: readonly number[]): number {
  outer: for (let start = 0; start <= file.byteLength - id.length; start += 1) {
    for (let offset = 0; offset < id.length; offset += 1) {
      if (file[start + offset] !== id[offset]) {
        continue outer;
      }
    }
    return start;
  }
  return -1;
}

describe('muxOpusWebm', () => {
  it('writes an EBML header declaring a webm document', () => {
    const file = mux();
    expect([...file.slice(0, 4)]).toStrictEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(indexOfId(file, [...new TextEncoder().encode('webm')])).toBeGreaterThan(0);
  });

  it('carries the encoder OpusHead through untouched', () => {
    const head = opusHead(456);
    const file = mux({ codecPrivate: head });
    const at = indexOfId(file, [...head]);
    expect(at).toBeGreaterThan(0);
    expect([...file.slice(at, at + head.byteLength)]).toStrictEqual([...head]);
  });

  it('derives codec delay from the OpusHead pre-skip', () => {
    // 312 samples at the 48 kHz Opus always reports in, as nanoseconds.
    const expected = Math.round((312 / 48_000) * 1_000_000_000);
    const file = mux({ codecPrivate: opusHead(312) });
    // CodecDelay is 0x56aa followed by its size and big-endian value.
    const at = indexOfId(file, [0x56, 0xaa]);
    expect(at).toBeGreaterThan(0);
    const size = file[at + 2] & 0x7f;
    let value = 0;
    for (let offset = 0; offset < size; offset += 1) {
      value = value * 256 + file[at + 3 + offset];
    }
    expect(value).toBe(expected);
  });

  it('writes one SimpleBlock per packet, carrying the payload', () => {
    const file = mux({ packets: packets(4) });
    let blocks = 0;
    for (let index = 0; index < file.byteLength - 1; index += 1) {
      if (file[index] === 0xa3 && file[index + 2] === 0x81) {
        blocks += 1;
      }
    }
    expect(blocks).toBe(4);
  });

  it('keeps the file close to the Opus payload it carries', () => {
    const payload = 51 * 180;
    const file = mux({ packets: packets(51, 60_000, 180), durationUs: 3_060_000 });
    // The container is a fixed header plus a few bytes per block; the point of
    // writing it here rather than taking a general muxer is that it stays small.
    expect(file.byteLength).toBeLessThan(payload * 1.15);
  });

  it('starts a new cluster before a block timestamp could overflow', () => {
    // A SimpleBlock offset is a signed 16-bit millisecond value, so a single
    // cluster cannot span more than about 32 seconds.
    const long = packets(1200, 60_000, 20); // 72 seconds
    const file = muxOpusWebm({
      packets: long,
      codecPrivate: opusHead(),
      sampleRate: 24_000,
      channels: 1,
      durationUs: 72_000_000,
    });
    let clusters = 0;
    for (let index = 0; index < file.byteLength - 3; index += 1) {
      if (
        file[index] === 0x1f &&
        file[index + 1] === 0x43 &&
        file[index + 2] === 0xb6 &&
        file[index + 3] === 0x75
      ) {
        clusters += 1;
      }
    }
    expect(clusters).toBeGreaterThan(1);
  });

  it('refuses a clip with no packets rather than writing an undecodable file', () => {
    expect(() => mux({ packets: [] })).toThrow(/at least one Opus packet/);
  });
});
