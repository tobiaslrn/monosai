import { ankiError, type AnkiError } from '../../app/domain/anki/anki-error';
import { err, ok, type Result } from '../../app/domain/shared/result';
import type { PackageResourceLimits } from './resource-limits';
import type { ZipArchive } from './zip-reader';

/**
 * The collection members Monosai knows how to open, newest first.
 *
 * A package written by a current Anki contains several of these at once: the
 * real database plus a legacy `collection.anki2` stub whose only content is a
 * note telling older clients to upgrade. Preferring the newest member is what
 * keeps the stub from being read as the collection.
 */
const SUPPORTED_MEMBERS = [
  { name: 'collection.anki21b', compression: 'zstd' },
  { name: 'collection.anki21', compression: 'none' },
  { name: 'collection.anki2', compression: 'none' },
] as const;

export type CollectionCompression = (typeof SUPPORTED_MEMBERS)[number]['compression'];

export interface LoadedCollection {
  readonly memberName: string;
  readonly compression: CollectionCompression;
  /** Package format version from `meta`, when the archive carries one. */
  readonly packageVersion: number | null;
  readonly bytes: Uint8Array;
}

const SQLITE_MAGIC = 'SQLite format 3\0';

/** Decompresses a zstd frame. Loaded lazily so the cost lands only on v3 packages. */
export type ZstdDecompressor = (input: Uint8Array) => Uint8Array;

/**
 * Reads the `meta` member, which is a protobuf holding just the package version.
 *
 * Rather than pull in a protobuf runtime for two bytes, this reads the single
 * varint field it needs and treats anything else as "no version stated", which
 * is also the honest answer for the older packages that have no `meta` at all.
 */
function readPackageVersion(meta: Uint8Array): number | null {
  if (meta.length >= 2 && meta[0] === 0x08) {
    let value = 0;
    let shift = 0;
    for (let index = 1; index < meta.length && index < 6; index += 1) {
      const byte = meta[index];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return value;
      }
      shift += 7;
    }
  }
  return null;
}

function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) {
    return false;
  }
  for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
    if (bytes[index] !== SQLITE_MAGIC.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

/**
 * Finds and decompresses the collection database inside an opened archive.
 *
 * Media is deliberately never touched: the entries are known from the central
 * directory, and not one of their bytes is read. That is what makes "package
 * parsing never extracts media" a property of the code rather than a promise.
 */
export async function loadCollection(
  archive: ZipArchive,
  decompressZstd: () => Promise<ZstdDecompressor>,
  limits: PackageResourceLimits,
): Promise<Result<LoadedCollection, AnkiError>> {
  const member = SUPPORTED_MEMBERS.find((candidate) => archive.has(candidate.name));
  if (member === undefined) {
    return err(
      ankiError(
        'package-schema-unsupported',
        'This package does not contain a collection database Monosai can open.',
        `members: ${archive.entries
          .map((entry) => entry.name)
          .slice(0, 8)
          .join(', ')}`,
      ),
    );
  }

  const packageVersion = archive.has('meta')
    ? await archive.read('meta').then((read) => (read.ok ? readPackageVersion(read.value) : null))
    : null;

  const read = await archive.read(member.name);
  if (!read.ok) {
    return read;
  }

  let bytes = read.value;
  if (member.compression === 'zstd') {
    const decompress = await decompressZstd();
    try {
      bytes = decompress(bytes);
    } catch (thrown) {
      return err(
        ankiError(
          'package-unreadable',
          'The collection inside this package could not be decompressed.',
          thrown instanceof Error ? thrown.message : 'zstd decompression failed',
        ),
      );
    }
    if (bytes.byteLength > limits.maxMemberBytes) {
      return err(
        ankiError(
          'package-resource-limit',
          'This package is larger or more deeply compressed than Monosai will process.',
          `${member.name} expanded to ${String(bytes.byteLength)} bytes`,
        ),
      );
    }
  }

  if (!looksLikeSqlite(bytes)) {
    return err(
      ankiError(
        'package-schema-unsupported',
        'The collection inside this package is not in a format Monosai can open.',
        `${member.name} is not a SQLite database`,
      ),
    );
  }

  return ok({
    memberName: member.name,
    compression: member.compression,
    packageVersion,
    bytes,
  });
}
