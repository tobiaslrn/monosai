/**
 * Reading a PCM WAV container.
 *
 * Shared rather than owned by the player, because two unrelated callers need
 * the same bytes read the same way: playback, which joins WAV clips into one
 * resource, and the maintenance pass, which reads the samples back out of a
 * stored clip in order to compress it.
 */

export interface WaveFormat {
  readonly channels: number;
  readonly sampleRate: number;
  readonly byteRate: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
}

export interface ParsedWave {
  readonly format: WaveFormat;
  readonly data: Uint8Array;
}

function ascii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));
}

export function parseWave(bytes: ArrayBuffer): ParsedWave {
  const view = new DataView(bytes);
  if (view.byteLength < 44 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV container');
  }

  let format: WaveFormat | null = null;
  let data: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > view.byteLength) {
      throw new Error('Truncated WAV chunk');
    }
    if (id === 'fmt ') {
      if (size < 16 || view.getUint16(body, true) !== 1) {
        throw new Error('Unsupported WAV encoding');
      }
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = new Uint8Array(bytes, body, size);
    }
    offset = body + size + (size % 2);
  }
  if (format === null || data === null || format.byteRate === 0 || format.blockAlign === 0) {
    throw new Error('Incomplete WAV container');
  }
  if (data.byteLength % format.blockAlign !== 0) {
    throw new Error('Misaligned WAV audio data');
  }
  return { format, data };
}
