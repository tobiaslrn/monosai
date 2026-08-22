import type { AudioResponse } from './openrouter-client';

const GEMINI_SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** Wraps Gemini's headerless 24 kHz, 16-bit mono PCM in a browser-decodable WAV container. */
export function geminiPcmToWav(response: AudioResponse): AudioResponse {
  if (!response.mimeType.toLowerCase().startsWith('audio/pcm')) {
    return response;
  }

  const headerSize = 44;
  const wav = new ArrayBuffer(headerSize + response.bytes.byteLength);
  const view = new DataView(wav);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const byteRate = GEMINI_SAMPLE_RATE * CHANNELS * bytesPerSample;

  writeAscii(0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, GEMINI_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, CHANNELS * bytesPerSample, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(36, 'data');
  view.setUint32(40, response.bytes.byteLength, true);
  new Uint8Array(wav, headerSize).set(new Uint8Array(response.bytes));
  return { bytes: wav, mimeType: 'audio/wav' };
}
