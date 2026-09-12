/**
 * A minimal WebM writer for one Opus track.
 *
 * Speech clips are the only thing Monosai muxes, and they are uniform: one
 * mono Opus track, one known sample rate, every packet a keyframe, and the
 * whole clip in hand before a byte is written. A general muxer pays for
 * generality Monosai does not use — the widely used one reserves 8 KiB per
 * track for a codec-private element that Opus fills with 19 bytes, which on a
 * three-second sentence is most of the file. Writing the container here costs
 * about two hundred lines, keeps the clip at roughly eight percent over the
 * Opus payload, and leaves Monosai with no encoder or muxer dependency at all.
 *
 * Only what a browser needs to decode and to append through MediaSource is
 * written: no SeekHead, no Cues. A clip is seconds long and always loaded
 * whole, so an index into it would be larger than the seeking it saves.
 */

/** Matroska element ids, as the numbers they are written as. */
const ID = {
  ebml: 0x1a45dfa3,
  ebmlVersion: 0x4286,
  ebmlReadVersion: 0x42f7,
  ebmlMaxIdLength: 0x42f2,
  ebmlMaxSizeLength: 0x42f3,
  docType: 0x4282,
  docTypeVersion: 0x4287,
  docTypeReadVersion: 0x4285,
  segment: 0x18538067,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackUid: 0x73c5,
  trackType: 0x83,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  codecDelay: 0x56aa,
  seekPreRoll: 0x56bb,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  cluster: 0x1f43b675,
  clusterTimestamp: 0xe7,
  simpleBlock: 0xa3,
} as const;

/** One millisecond, in the nanoseconds Matroska counts timestamp scale in. */
const TIMESTAMP_SCALE_NS = 1_000_000;

/** Opus needs 80 ms of pre-roll before a seek target to decode cleanly. */
const SEEK_PRE_ROLL_NS = 80_000_000;

/**
 * How long one cluster may run.
 *
 * A block's timestamp is a signed 16-bit offset from its cluster, so a cluster
 * cannot span more than about 32 seconds. Well under that keeps the arithmetic
 * far from the edge at no measurable cost: a new cluster is about a dozen bytes.
 */
const CLUSTER_LIMIT_MS = 20_000;

/** One encoded Opus packet and when it starts. */
export interface OpusPacket {
  readonly data: Uint8Array;
  /** Microseconds from the start of the clip. */
  readonly timestampUs: number;
}

export interface OpusWebmInput {
  readonly packets: readonly OpusPacket[];
  /**
   * The encoder's own `OpusHead`, carried through untouched.
   *
   * Taken from the decoder configuration the encoder reports rather than built
   * here: it records the pre-skip the encoder actually used, and a value this
   * module guessed instead would clip the start of every sentence.
   */
  readonly codecPrivate: Uint8Array;
  readonly sampleRate: number;
  readonly channels: number;
  /** Total clip length in microseconds. */
  readonly durationUs: number;
}

/** A Matroska variable-length integer, in the smallest width that holds it. */
function vint(value: number): Uint8Array {
  for (let width = 1; width <= 8; width += 1) {
    const limit = 2 ** (7 * width) - 1;
    if (value < limit) {
      const out = new Uint8Array(width);
      let remaining = value;
      for (let index = width - 1; index >= 0; index -= 1) {
        out[index] = remaining & 0xff;
        remaining = Math.floor(remaining / 256);
      }
      out[0] |= 1 << (8 - width);
      return out;
    }
  }
  throw new Error('Value too large for a Matroska variable-length integer');
}

/** An element id, written as the bytes it is defined as rather than as a vint. */
function idBytes(id: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = id;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return new Uint8Array(bytes);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** An element with its payload, sized. */
function element(id: number, payload: Uint8Array): Uint8Array {
  return concat([idBytes(id), vint(payload.byteLength), payload]);
}

/** An unsigned integer payload, in the fewest bytes that carry it. */
function uint(value: number): Uint8Array {
  if (value === 0) {
    return new Uint8Array([0]);
  }
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    bytes.unshift(remaining % 256);
    remaining = Math.floor(remaining / 256);
  }
  return new Uint8Array(bytes);
}

function uintElement(id: number, value: number): Uint8Array {
  return element(id, uint(value));
}

function float64Element(id: number, value: number): Uint8Array {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setFloat64(0, value, false);
  return element(id, payload);
}

function stringElement(id: number, value: string): Uint8Array {
  return element(id, new TextEncoder().encode(value));
}

/** The 19-byte `OpusHead` carries pre-skip at bytes 10-11, little endian. */
function preSkipOf(codecPrivate: Uint8Array): number {
  if (codecPrivate.byteLength < 12) {
    return 0;
  }
  return codecPrivate[10] | (codecPrivate[11] << 8);
}

/**
 * A `SimpleBlock`: track number, a signed 16-bit offset from the cluster, and
 * the keyframe flag every Opus packet carries.
 */
function simpleBlock(relativeMs: number, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(4);
  header[0] = 0x81; // track number 1, as a one-byte vint
  new DataView(header.buffer).setInt16(1, relativeMs, false);
  header[3] = 0x80; // keyframe
  return element(ID.simpleBlock, concat([header, data]));
}

/** Writes one Opus track into a WebM file a browser will decode and append. */
export function muxOpusWebm(input: OpusWebmInput): Uint8Array {
  if (input.packets.length === 0) {
    throw new Error('A WebM clip needs at least one Opus packet');
  }

  const header = element(
    ID.ebml,
    concat([
      uintElement(ID.ebmlVersion, 1),
      uintElement(ID.ebmlReadVersion, 1),
      uintElement(ID.ebmlMaxIdLength, 4),
      uintElement(ID.ebmlMaxSizeLength, 8),
      stringElement(ID.docType, 'webm'),
      uintElement(ID.docTypeVersion, 4),
      uintElement(ID.docTypeReadVersion, 2),
    ]),
  );

  const info = element(
    ID.info,
    concat([
      uintElement(ID.timestampScale, TIMESTAMP_SCALE_NS),
      stringElement(ID.muxingApp, 'monosai'),
      stringElement(ID.writingApp, 'monosai'),
      float64Element(ID.duration, input.durationUs / 1000),
    ]),
  );

  const tracks = element(
    ID.tracks,
    element(
      ID.trackEntry,
      concat([
        uintElement(ID.trackNumber, 1),
        uintElement(ID.trackUid, 1),
        uintElement(ID.trackType, 2), // audio
        stringElement(ID.codecId, 'A_OPUS'),
        element(ID.codecPrivate, input.codecPrivate),
        uintElement(
          ID.codecDelay,
          Math.round((preSkipOf(input.codecPrivate) / 48_000) * 1_000_000_000),
        ),
        uintElement(ID.seekPreRoll, SEEK_PRE_ROLL_NS),
        element(
          ID.audio,
          concat([
            float64Element(ID.samplingFrequency, input.sampleRate),
            uintElement(ID.channels, input.channels),
          ]),
        ),
      ]),
    ),
  );

  const clusters: Uint8Array[] = [];
  let blocks: Uint8Array[] = [];
  let clusterStartMs = 0;
  const flush = (): void => {
    if (blocks.length === 0) {
      return;
    }
    clusters.push(
      element(ID.cluster, concat([uintElement(ID.clusterTimestamp, clusterStartMs), ...blocks])),
    );
    blocks = [];
  };

  for (const packet of input.packets) {
    const timestampMs = Math.round(packet.timestampUs / 1000);
    if (blocks.length === 0) {
      clusterStartMs = timestampMs;
    } else if (timestampMs - clusterStartMs >= CLUSTER_LIMIT_MS) {
      flush();
      clusterStartMs = timestampMs;
    }
    blocks.push(simpleBlock(timestampMs - clusterStartMs, packet.data));
  }
  flush();

  return concat([header, element(ID.segment, concat([info, tracks, ...clusters]))]);
}
