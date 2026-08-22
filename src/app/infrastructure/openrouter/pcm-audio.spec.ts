import { describe, expect, it } from 'vitest';
import { geminiPcmToWav } from './pcm-audio';

describe('geminiPcmToWav', () => {
  it('wraps raw PCM in a 24 kHz mono WAV header without changing samples', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]).buffer;

    const result = geminiPcmToWav({ bytes: pcm, mimeType: 'audio/pcm;rate=24000' });
    const view = new DataView(result.bytes);

    expect(result.mimeType).toBe('audio/wav');
    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(result.bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect([...new Uint8Array(result.bytes.slice(44))]).toEqual([1, 2, 3, 4]);
  });

  it('leaves already-containerized audio untouched', () => {
    const response = { bytes: new ArrayBuffer(2), mimeType: 'audio/mpeg' };
    expect(geminiPcmToWav(response)).toBe(response);
  });
});
