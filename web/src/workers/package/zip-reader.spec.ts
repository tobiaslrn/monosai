import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackageResourceLimits } from './resource-limits';
import { openZipArchive } from './zip-reader';

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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
    // 32 MiB of zeros deflates to about 32 KiB. The directory claims 4 KiB, so
    // both checks made before inflating pass.
    const compressed = await deflateRaw(new Uint8Array(32 * 1024 * 1024));
    const archive = openZipArchive(zipWith('collection.anki21', compressed, 4096), limits);
    if (!archive.ok) throw new Error('the archive should open');

    const Original = globalThis.DecompressionStream;
    let produced = 0;
    class CountingDecompressionStream {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const inner = new Original(format);
        this.writable = inner.writable;
        this.readable = inner.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              produced += chunk.byteLength;
              controller.enqueue(chunk);
            },
          }),
        );
      }
    }
    vi.stubGlobal('DecompressionStream', CountingDecompressionStream);

    const read = await archive.value.read('collection.anki21');

    expect(!read.ok && read.error.code).toBe('package-resource-limit');
    // A chunk or two past the limit is the most a bounded reader can produce.
    expect(produced).toBeLessThan(4 * limits.maxMemberBytes);
  });
});
