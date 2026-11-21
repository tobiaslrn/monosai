/** A streaming zstd decoder that hands each decoded block to its callback. */
export interface ZstdStream {
  push(chunk: Uint8Array, final?: boolean): void;
}

/** Creates a decoder. Loaded lazily so the cost lands only on version 3 packages. */
export type ZstdDecompressor = (ondata: (block: Uint8Array) => void) => ZstdStream;

const ZSTD_MAGIC = 0xfd2fb528;
/** Skippable frames use any magic from 0x184D2A50 to 0x184D2A5F. */
const SKIPPABLE_MAGIC_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;
const BLOCK_RLE = 1;
const BLOCK_RESERVED = 3;

/** Why a zstd member is refused before decoding starts. */
export interface ZstdHeaderProblem {
  /** `over-limit` when a frame asks for too much; `unreadable` when a header cannot be read. */
  readonly kind: 'over-limit' | 'unreadable';
  readonly reason: string;
}

/**
 * Finds the first frame whose header asks for more memory than `maxBytes`, or
 * that cannot be read in full.
 *
 * A decoder allocates a frame's window, or its whole declared content for a
 * single-segment frame, as soon as it reads the header, before a single byte
 * is decoded. Both sizes are the attacker's to choose, so they are checked
 * here, over every frame, before decoding starts. A header cut off by the end
 * of the data is refused too: a decoder reads as much of it as is there,
 * allocates the window it names, and only then finds the data missing.
 * Everything up to the end of the data must be a whole frame.
 */
export function checkZstdHeaders(bytes: Uint8Array, maxBytes: number): ZstdHeaderProblem | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = bytes.byteLength;
  const cutOff = (at: number): ZstdHeaderProblem => ({
    kind: 'unreadable',
    reason: `the zstd data ends inside a frame at byte ${String(at)}`,
  });
  let offset = 0;
  while (offset < length) {
    if (offset + 4 > length) {
      return cutOff(offset);
    }
    const magic = view.getUint32(offset, true);
    if ((magic & SKIPPABLE_MAGIC_MASK) >>> 0 === SKIPPABLE_MAGIC) {
      if (offset + 8 > length) {
        return cutOff(offset);
      }
      offset += 8 + view.getUint32(offset + 4, true);
      if (offset > length) {
        return cutOff(length);
      }
      continue;
    }
    if (magic !== ZSTD_MAGIC) {
      return { kind: 'unreadable', reason: `no zstd frame starts at byte ${String(offset)}` };
    }
    if (offset + 5 > length) {
      return cutOff(offset);
    }
    const descriptor = view.getUint8(offset + 4);
    const singleSegment = (descriptor >> 5) & 1;
    const hasChecksum = (descriptor >> 2) & 1;
    const dictionaryFlag = descriptor & 3;
    const sizeFlag = descriptor >> 6;
    let cursor = offset + 5;

    let window = 0;
    if (singleSegment === 0) {
      if (cursor + 1 > length) {
        return cutOff(offset);
      }
      const windowDescriptor = view.getUint8(cursor);
      const base = 2 ** (10 + (windowDescriptor >> 3));
      window = base + (base / 8) * (windowDescriptor & 7);
      cursor += 1;
    }
    cursor += dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const sizeBytes = sizeFlag === 0 ? singleSegment : 2 ** sizeFlag;
    if (cursor + sizeBytes > length) {
      return cutOff(offset);
    }
    let contentSize = 0;
    for (let index = sizeBytes - 1; index >= 0; index -= 1) {
      contentSize = contentSize * 256 + view.getUint8(cursor + index);
    }
    if (sizeBytes === 2) {
      contentSize += 256;
    }
    cursor += sizeBytes;
    if (singleSegment === 1) {
      window = contentSize;
    }
    if (window > maxBytes) {
      return {
        kind: 'over-limit',
        reason: `a zstd frame asks for a ${String(window)} byte window`,
      };
    }
    if (contentSize > maxBytes) {
      return { kind: 'over-limit', reason: `a zstd frame declares ${String(contentSize)} bytes` };
    }

    for (;;) {
      if (cursor + 3 > length) {
        return cutOff(offset);
      }
      const header =
        view.getUint8(cursor) |
        (view.getUint8(cursor + 1) << 8) |
        (view.getUint8(cursor + 2) << 16);
      const type = (header >> 1) & 3;
      if (type === BLOCK_RESERVED) {
        return { kind: 'unreadable', reason: `a zstd block at byte ${String(cursor)} is reserved` };
      }
      cursor += 3 + (type === BLOCK_RLE ? 1 : header >> 3);
      if ((header & 1) === 1) {
        break;
      }
    }
    offset = cursor + (hasChecksum === 1 ? 4 : 0);
    if (offset > length) {
      return cutOff(length);
    }
  }
  return null;
}

/** Thrown from inside the decoder's callback to stop it mid-stream. */
class OutputBudgetSpent extends Error {}

/**
 * Decompresses zstd data, stopping once the output outgrows `maxBytes`.
 *
 * The budget is held while blocks are produced rather than after the frame is
 * done, since a frame can expand by far more than a thousand times. `null`
 * means the budget ran out; any other decoder failure is thrown.
 */
export function decompressZstdWithin(
  bytes: Uint8Array,
  createDecoder: ZstdDecompressor,
  maxBytes: number,
): Uint8Array | null {
  const blocks: Uint8Array[] = [];
  let total = 0;
  const decoder = createDecoder((block) => {
    total += block.byteLength;
    if (total > maxBytes) {
      throw new OutputBudgetSpent();
    }
    blocks.push(block);
  });
  try {
    decoder.push(bytes, true);
  } catch (thrown) {
    if (thrown instanceof OutputBudgetSpent) {
      return null;
    }
    throw thrown;
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    output.set(block, offset);
    offset += block.byteLength;
  }
  return output;
}
