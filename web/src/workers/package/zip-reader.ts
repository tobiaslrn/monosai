import { ankiError, type AnkiError } from '../../app/domain/anki/anki-error';
import { err, ok, type Result } from '../../app/domain/shared/result';
import type { PackageResourceLimits } from './resource-limits';

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_ZIP64_LOCATOR = 0x07064b50;
const SIGNATURE_ZIP64_EOCD = 0x06064b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

const EOCD_MIN_SIZE = 22;
/** The comment length field is 16 bits, so the record starts at most this far back. */
const EOCD_MAX_SEARCH = EOCD_MIN_SIZE + 0xffff;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** General purpose bit 0 marks an encrypted entry. */
const FLAG_ENCRYPTED = 0x0001;

const ZIP64_MARKER_32 = 0xffffffff;
const ZIP64_MARKER_16 = 0xffff;

export interface ZipEntry {
  readonly name: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

export interface ZipArchive {
  readonly entries: readonly ZipEntry[];
  read(name: string): Promise<Result<Uint8Array, AnkiError>>;
  has(name: string): boolean;
}

function unreadable(reason: string): AnkiError {
  return ankiError('package-unreadable', 'This file could not be read as an Anki package.', reason);
}

function overLimit(reason: string): AnkiError {
  return ankiError(
    'package-resource-limit',
    'This package is larger or more deeply compressed than Monosai will process.',
    reason,
  );
}

/**
 * Rejects names that only make sense to something writing them to disk.
 *
 * Nothing here is ever written out, so this is defence in depth rather than the
 * load-bearing protection — but a package containing such a path is malformed or
 * hostile either way, and refusing it early is cheaper than reasoning about what
 * else it might contain.
 */
function isUnsafeName(name: string): boolean {
  if (name.length === 0 || name.startsWith('/') || name.startsWith('\\')) {
    return true;
  }
  if (/^[a-zA-Z]:/u.test(name)) {
    return true;
  }
  return name.split(/[/\\]/u).includes('..');
}

function findEocd(view: DataView): number {
  const start = Math.max(0, view.byteLength - EOCD_MAX_SEARCH);
  for (let offset = view.byteLength - EOCD_MIN_SIZE; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === SIGNATURE_EOCD) {
      return offset;
    }
  }
  return -1;
}

interface DirectoryLocation {
  readonly offset: number;
  readonly count: number;
}

/**
 * Finds the central directory, following the ZIP64 records when the 32-bit
 * fields are saturated.
 *
 * A collection with more than 65,535 media files — which a long-running Anki
 * user reaches — writes those saturated values, and refusing to follow them
 * would fail on exactly the largest real packages.
 */
function locateDirectory(view: DataView, eocd: number): Result<DirectoryLocation, AnkiError> {
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count !== ZIP64_MARKER_16 && offset !== ZIP64_MARKER_32) {
    return ok({ offset, count });
  }

  const locator = eocd - 20;
  if (locator < 0 || view.getUint32(locator, true) !== SIGNATURE_ZIP64_LOCATOR) {
    return err(unreadable('zip64 end of central directory locator is missing'));
  }
  const zip64Eocd = Number(view.getBigUint64(locator + 8, true));
  if (
    zip64Eocd < 0 ||
    zip64Eocd + 56 > view.byteLength ||
    view.getUint32(zip64Eocd, true) !== SIGNATURE_ZIP64_EOCD
  ) {
    return err(unreadable('zip64 end of central directory record is missing'));
  }
  return ok({
    count: Number(view.getBigUint64(zip64Eocd + 32, true)),
    offset: Number(view.getBigUint64(zip64Eocd + 48, true)),
  });
}

/**
 * Reads the ZIP64 extra field of one central directory entry.
 *
 * Values appear in a fixed order but only when the matching 32-bit field is
 * saturated, so the cursor advances conditionally rather than by a fixed layout.
 */
function readZip64Extra(
  view: DataView,
  start: number,
  length: number,
  entry: { uncompressedSize: number; compressedSize: number; localHeaderOffset: number },
): void {
  let cursor = start;
  const end = start + length;
  while (cursor + 4 <= end) {
    const headerId = view.getUint16(cursor, true);
    const dataSize = view.getUint16(cursor + 2, true);
    if (headerId !== 0x0001) {
      cursor += 4 + dataSize;
      continue;
    }
    let field = cursor + 4;
    if (entry.uncompressedSize === ZIP64_MARKER_32 && field + 8 <= end) {
      entry.uncompressedSize = Number(view.getBigUint64(field, true));
      field += 8;
    }
    if (entry.compressedSize === ZIP64_MARKER_32 && field + 8 <= end) {
      entry.compressedSize = Number(view.getBigUint64(field, true));
      field += 8;
    }
    if (entry.localHeaderOffset === ZIP64_MARKER_32 && field + 8 <= end) {
      entry.localHeaderOffset = Number(view.getBigUint64(field, true));
    }
    return;
  }
}

/**
 * Inflates a raw deflate member.
 *
 * The bytes are pushed straight into the `DecompressionStream` and pulled back
 * out of its own readable side, rather than routed through a `Blob` or a
 * `Response`. Those belong to whichever realm supplies them, and piping one
 * realm's stream into another's fails; a stream only ever talks to itself here.
 */
async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const written = writer.write(data).then(() => writer.close());

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  await written;

  const inflated = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    inflated.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return inflated;
}

/**
 * Reads the central directory of a ZIP held entirely in memory.
 *
 * Only the directory is parsed up front; member bytes are decompressed on
 * demand, which is what lets the package pipeline list a collection's media
 * without ever touching it.
 */
export function openZipArchive(
  bytes: Uint8Array<ArrayBuffer>,
  limits: PackageResourceLimits,
): Result<ZipArchive, AnkiError> {
  if (bytes.byteLength > limits.maxArchiveBytes) {
    return err(overLimit(`archive is ${String(bytes.byteLength)} bytes`));
  }
  if (bytes.byteLength < EOCD_MIN_SIZE) {
    return err(unreadable('file is too small to be a zip archive'));
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) {
    return err(unreadable('no end of central directory record'));
  }

  const located = locateDirectory(view, eocd);
  if (!located.ok) {
    return located;
  }
  const { offset: directoryOffset, count } = located.value;
  if (count > limits.maxEntries) {
    return err(overLimit(`archive declares ${String(count)} entries`));
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;

  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== SIGNATURE_CENTRAL) {
      return err(unreadable(`central directory entry ${String(index)} is malformed`));
    }
    const flags = view.getUint16(cursor + 8, true);
    if ((flags & FLAG_ENCRYPTED) !== 0) {
      return err(unreadable('the archive is encrypted'));
    }

    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const sizes = {
      compressedSize: view.getUint32(cursor + 20, true),
      uncompressedSize: view.getUint32(cursor + 24, true),
      localHeaderOffset: view.getUint32(cursor + 42, true),
    };
    readZip64Extra(view, cursor + 46 + nameLength, extraLength, sizes);

    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (isUnsafeName(name)) {
      return err(unreadable(`entry name is not safe: ${name}`));
    }

    entries.push({
      name,
      compressionMethod: view.getUint16(cursor + 10, true),
      compressedSize: sizes.compressedSize,
      uncompressedSize: sizes.uncompressedSize,
      localHeaderOffset: sizes.localHeaderOffset,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  async function read(name: string): Promise<Result<Uint8Array, AnkiError>> {
    const entry = byName.get(name);
    if (entry === undefined) {
      return err(unreadable(`the archive has no member named ${name}`));
    }
    if (entry.uncompressedSize > limits.maxMemberBytes) {
      return err(overLimit(`${name} expands to ${String(entry.uncompressedSize)} bytes`));
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio
    ) {
      return err(
        overLimit(
          `${name} expands ${String(Math.round(entry.uncompressedSize / entry.compressedSize))} times`,
        ),
      );
    }

    const header = entry.localHeaderOffset;
    if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== SIGNATURE_LOCAL) {
      return err(unreadable(`${name} has no local file header`));
    }
    // The local header repeats the name and extra lengths, and they may differ
    // from the central directory's, so the data offset is taken from here.
    const dataStart =
      header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.byteLength) {
      return err(unreadable(`${name} extends past the end of the archive`));
    }
    const raw = bytes.subarray(dataStart, dataEnd);

    if (entry.compressionMethod === METHOD_STORED) {
      return ok(raw);
    }
    if (entry.compressionMethod !== METHOD_DEFLATE) {
      return err(
        ankiError(
          'package-schema-unsupported',
          'This package uses a compression method Monosai does not support.',
          `${name} uses method ${String(entry.compressionMethod)}`,
        ),
      );
    }

    let inflated: Uint8Array;
    try {
      inflated = await inflateRaw(raw);
    } catch {
      return err(unreadable(`${name} could not be decompressed`));
    }
    if (inflated.byteLength > limits.maxMemberBytes) {
      return err(overLimit(`${name} expanded to ${String(inflated.byteLength)} bytes`));
    }
    return ok(inflated);
  }

  return ok({
    entries,
    has: (name) => byName.has(name),
    read,
  });
}
