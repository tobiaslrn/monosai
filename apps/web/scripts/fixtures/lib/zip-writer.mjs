import { deflateRawSync } from 'node:zlib';
import { crc32 } from 'node:zlib';

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_EOCD = 0x06054b50;

export const STORED = 0;
export const DEFLATE = 8;

/**
 * Writes a ZIP archive.
 *
 * This is a fixture tool, not production code, so it stays deliberately
 * literal: every field the reader parses can be set by hand, which is what
 * lets the malformed and hostile fixtures declare sizes and compression
 * methods no real archiver would produce.
 */
export function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const source = Buffer.from(entry.data);
    const method = entry.method ?? STORED;
    const body = method === DEFLATE ? deflateRawSync(source) : source;
    const declaredUncompressed = entry.declaredUncompressedSize ?? source.length;
    const declaredCompressed = entry.declaredCompressedSize ?? body.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIGNATURE_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(source), 14);
    local.writeUInt32LE(declaredCompressed, 18);
    local.writeUInt32LE(declaredUncompressed, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(source), 16);
    central.writeUInt32LE(declaredCompressed, 20);
    central.writeUInt32LE(declaredUncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIGNATURE_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, eocd]);
}
