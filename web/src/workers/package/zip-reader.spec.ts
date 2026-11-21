import { constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackageResourceLimits } from './resource-limits';
import { INFLATE_SLICE_BYTES, openZipArchive } from './zip-reader';

const PIECE_BYTES = 64 * 1024;

/**
 * A `DecompressionStream` that behaves the way browsers do: each written chunk
 * is inflated in full and every piece is enqueued before the next read, with
 * no regard for how much the reader has taken. It counts what it produces, so
 * a test can see what the stream itself allocated rather than what was read.
 */
function eagerInflation(counter: { produced: number }): TransformStream<BufferSource, Uint8Array> {
  let input = new Uint8Array(0);
  let emitted = 0;
  return new TransformStream<BufferSource, Uint8Array>({
    transform(chunk, controller) {
      const bytes =
        chunk instanceof ArrayBuffer
          ? new Uint8Array(chunk)
          : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const joined = new Uint8Array(input.byteLength + bytes.byteLength);
      joined.set(input);
      joined.set(bytes, input.byteLength);
      input = joined;
      const output = inflateRawSync(input, { finishFlush: constants.Z_SYNC_FLUSH });
      for (let offset = emitted; offset < output.byteLength; offset += PIECE_BYTES) {
        const piece = output.subarray(offset, Math.min(offset + PIECE_BYTES, output.byteLength));
        counter.produced += piece.byteLength;
        controller.enqueue(piece);
      }
      emitted = output.byteLength;
    },
  });
}

/** A one-member zip whose directory states whatever uncompressed size it is told to. */
function zipWith(
  name: string,
  data: Uint8Array,
  declaredUncompressedSize: number,
): Uint8Array<ArrayBuffer> {
  const nameBytes = new TextEncoder().encode(name);
  const local = 30 + nameBytes.length;
  const central = 46 + nameBytes.length;
  const bytes = new Uint8Array(local + data.length + central + 22);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, 8, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, declaredUncompressedSize, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  bytes.set(data, local);

  const directory = local + data.length;
  view.setUint32(directory, 0x02014b50, true);
  view.setUint16(directory + 10, 8, true);
  view.setUint32(directory + 20, data.length, true);
  view.setUint32(directory + 24, declaredUncompressedSize, true);
  view.setUint16(directory + 28, nameBytes.length, true);
  view.setUint32(directory + 42, 0, true);
  bytes.set(nameBytes, directory + 46);

  const eocd = directory + central;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, central, true);
  view.setUint32(eocd + 16, directory, true);
  return bytes;
}

describe('openZipArchive', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops inflating a member as soon as it outgrows the member limit', async () => {
    const limits: PackageResourceLimits = {
      maxArchiveBytes: 64 * 1024 * 1024,
      maxEntries: 10,
      maxMemberBytes: 256 * 1024,
      maxCompressionRatio: 250,
    };
    // 64 MiB of zeros deflates to about 64 KiB. The directory claims 4 KiB, so
    // both checks made before inflating pass.
    const compressed = new Uint8Array(deflateRawSync(new Uint8Array(64 * 1024 * 1024)));
    const archive = openZipArchive(zipWith('collection.anki21', compressed, 4096), limits);
    if (!archive.ok) throw new Error('the archive should open');

    const counter = { produced: 0 };
    vi.stubGlobal(
      'DecompressionStream',
      class {
        readonly writable: WritableStream<BufferSource>;
        readonly readable: ReadableStream<Uint8Array>;
        constructor() {
          const stream = eagerInflation(counter);
          this.writable = stream.writable;
          this.readable = stream.readable;
        }
      },
    );

    const read = await archive.value.read('collection.anki21');

    expect(!read.ok && read.error.code).toBe('package-resource-limit');
    // Deflate expands by at most 1032 times, so this is one slice's output: the
    // next slice was never handed over.
    expect(counter.produced).toBeLessThanOrEqual(1032 * INFLATE_SLICE_BYTES);
  });

  it('still inflates a member within the limit', async () => {
    const limits: PackageResourceLimits = {
      maxArchiveBytes: 64 * 1024 * 1024,
      maxEntries: 10,
      maxMemberBytes: 1024 * 1024,
      maxCompressionRatio: 250,
    };
    const original = new Uint8Array(200 * 1024).map((_, index) => (index * 7919) % 251);
    const compressed = new Uint8Array(deflateRawSync(original));
    const archive = openZipArchive(
      zipWith('collection.anki21', compressed, original.byteLength),
      limits,
    );
    if (!archive.ok) throw new Error('the archive should open');

    const read = await archive.value.read('collection.anki21');

    expect(read.ok && read.value).toEqual(original);
  });
});
