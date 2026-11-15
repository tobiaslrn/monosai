import type { AudioResponse } from './openrouter-client';

export const BITS_PER_SAMPLE = 16;

/** What a PCM reply is assumed to be when its type names no rate or channels. */
export const DEFAULT_PCM_SAMPLE_RATE = 24_000;
export const DEFAULT_PCM_CHANNELS = 1;

export interface PcmFormat {
  readonly sampleRate: number;
  readonly channels: number;
}

/**
 * Whether a reply is headerless 16-bit little-endian PCM.
 *
 * OpenRouter labels it `audio/pcm` and states the shape as parameters
 * (`audio/pcm;rate=44100;channels=1`); the rate differs between providers, so
 * it is read from the reply rather than assumed.
 */
export function isPcmMimeType(mimeType: string): boolean {
  return mimeType.split(';')[0]?.trim().toLowerCase() === 'audio/pcm';
}

export function pcmFormatOf(mimeType: string): PcmFormat {
  // Values may be quoted (RFC 2045), and providers spell the rate more than one way.
  const parameter = (names: string): number | undefined => {
    const match = new RegExp(`(?:^|;)\\s*(?:${names})\\s*=\\s*"?(\\d+)"?\\s*(?:;|$)`, 'iu').exec(
      mimeType,
    );
    const value = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  return {
    sampleRate: parameter('rate|sample_rate|sample-rate|samplerate') ?? DEFAULT_PCM_SAMPLE_RATE,
    channels: parameter('channels') ?? DEFAULT_PCM_CHANNELS,
  };
}

/**
 * Wraps headerless PCM in a browser-decodable WAV container at the rate the
 * reply declared.
 *
 * The uncompressed fallback. Speech is normally compressed on the way in (see
 * `provider-audio.ts`); this is what a browser with no audio encoder stores
 * instead, because an expensive clip is still better than no clip.
 */
export function pcmToWav(response: AudioResponse): AudioResponse {
  if (!isPcmMimeType(response.mimeType)) {
    return response;
  }
  const { sampleRate, channels } = pcmFormatOf(response.mimeType);

  const headerSize = 44;
  const wav = new ArrayBuffer(headerSize + response.bytes.byteLength);
  const view = new DataView(wav);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const byteRate = sampleRate * channels * bytesPerSample;

  writeAscii(0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(36, 'data');
  view.setUint32(40, response.bytes.byteLength, true);
  new Uint8Array(wav, headerSize).set(new Uint8Array(response.bytes));
  return { bytes: wav, mimeType: 'audio/wav' };
}
