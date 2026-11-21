import { Decompress } from 'fzstd';
import { describe, expect, it } from 'vitest';
import { ok } from '../../app/domain/shared/result';
import { loadCollection } from './collection-loader';
import type { PackageResourceLimits } from './resource-limits';
import type { ZipArchive } from './zip-reader';
import type { ZstdDecompressor } from './zstd-bounds';

const LIMITS: PackageResourceLimits = {
  maxArchiveBytes: 64 * 1024 * 1024,
  maxEntries: 10,
  maxMemberBytes: 256 * 1024,
  maxCompressionRatio: 250,
};

const BLOCK = 128 * 1024;

/** One zstd frame of run-length blocks: a few bytes each, `BLOCK` bytes decoded. */
function runLengthFrame(blocks: number, header: readonly number[] = [0x00, 0x38]): Uint8Array {
  const bytes = [0x28, 0xb5, 0x2f, 0xfd, ...header];
  for (let index = 0; index < blocks; index += 1) {
    const last = index === blocks - 1 ? 1 : 0;
    const blockHeader = last | (1 << 1) | (BLOCK << 3);
    bytes.push(blockHeader & 0xff, (blockHeader >> 8) & 0xff, (blockHeader >> 16) & 0xff, 0);
  }
  return new Uint8Array(bytes);
}

function archiveOf(bytes: Uint8Array): ZipArchive {
  return {
    entries: [
      {
        name: 'collection.anki21b',
        compressionMethod: 0,
        compressedSize: bytes.byteLength,
        uncompressedSize: bytes.byteLength,
        localHeaderOffset: 0,
      },
    ],
    has: (name) => name === 'collection.anki21b',
    read: () => Promise.resolve(ok(bytes)),
  };
}

describe('loadCollection with a zstd collection', () => {
  it('stops decoding as soon as the output outgrows the member limit', async () => {
    let produced = 0;
    let decoders = 0;
    const counting: ZstdDecompressor = (ondata) => {
      decoders += 1;
      return new Decompress((block) => {
        produced += block.byteLength;
        ondata(block);
      });
    };

    // About 1 KiB that decodes to 39 MiB.
    const loaded = await loadCollection(
      archiveOf(runLengthFrame(312)),
      () => Promise.resolve(counting),
      LIMITS,
    );

    expect(!loaded.ok && loaded.error.code).toBe('package-resource-limit');
    expect(decoders).toBe(1);
    expect(produced).toBeLessThanOrEqual(LIMITS.maxMemberBytes + BLOCK);
  });

  it('refuses a frame that asks for a larger window before decoding anything', async () => {
    let decoders = 0;
    const counting: ZstdDecompressor = (ondata) => {
      decoders += 1;
      return new Decompress(ondata);
    };
    // A single-segment frame declaring 1 GiB of content, which a decoder would
    // allocate up front.
    const declared = [0xa0, 0x00, 0x00, 0x00, 0x40];

    const loaded = await loadCollection(
      archiveOf(runLengthFrame(1, declared)),
      () => Promise.resolve(counting),
      LIMITS,
    );

    expect(!loaded.ok && loaded.error.code).toBe('package-resource-limit');
    expect(decoders).toBe(0);
  });

  it('decodes a frame within the limit', async () => {
    const loaded = await loadCollection(
      archiveOf(runLengthFrame(1)),
      () => Promise.resolve((ondata) => new Decompress(ondata)),
      LIMITS,
    );

    // Run-length zeros are no SQLite database, so decoding got as far as the
    // format check rather than stopping at a limit.
    expect(!loaded.ok && loaded.error.code).toBe('package-schema-unsupported');
  });
});
