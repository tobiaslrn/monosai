import { describe, expect, it } from 'vitest';
import { isPcmMimeType, pcmFormatOf, pcmToWav } from './pcm-audio';

describe('pcmFormatOf', () => {
  it('reads the rate and channels a reply declares', () => {
    expect(pcmFormatOf('audio/pcm;rate=44100;channels=2')).toEqual({
      sampleRate: 44_100,
      channels: 2,
    });
    expect(pcmFormatOf('audio/pcm; rate=24000; channels=1')).toEqual({
      sampleRate: 24_000,
      channels: 1,
    });
  });

  it('falls back to 24 kHz mono when the reply names neither', () => {
    expect(pcmFormatOf('audio/pcm')).toEqual({ sampleRate: 24_000, channels: 1 });
    expect(pcmFormatOf('audio/pcm;rate=0;channels=abc')).toEqual({
      sampleRate: 24_000,
      channels: 1,
    });
  });

  it('does not take a rate from a longer parameter name', () => {
    expect(pcmFormatOf('audio/pcm;bitrate=128000').sampleRate).toBe(24_000);
  });

  it('reads quoted values and the other spellings of the rate', () => {
    expect(pcmFormatOf('audio/pcm; rate="44100"; channels="2"')).toEqual({
      sampleRate: 44_100,
      channels: 2,
    });
    expect(pcmFormatOf('audio/pcm;sample_rate=16000').sampleRate).toBe(16_000);
    expect(pcmFormatOf('audio/pcm; samplerate=22050 ;channels=1').sampleRate).toBe(22_050);
  });
});

describe('isPcmMimeType', () => {
  it('recognizes PCM by its base type only', () => {
    expect(isPcmMimeType('audio/pcm;rate=44100;channels=1')).toBe(true);
    expect(isPcmMimeType('AUDIO/PCM')).toBe(true);
    expect(isPcmMimeType('audio/mpeg')).toBe(false);
    expect(isPcmMimeType('audio/pcmx')).toBe(false);
  });
});

describe('pcmToWav', () => {
  it('wraps raw PCM in a WAV header at the declared rate without changing samples', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]).buffer;

    const result = pcmToWav({ bytes: pcm, mimeType: 'audio/pcm;rate=44100;channels=1' });
    const view = new DataView(result.bytes);

    expect(result.mimeType).toBe('audio/wav');
    expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(result.bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint32(28, true)).toBe(88_200);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect([...new Uint8Array(result.bytes.slice(44))]).toEqual([1, 2, 3, 4]);
  });

  it('assumes 24 kHz mono for PCM that names no rate', () => {
    const result = pcmToWav({ bytes: new ArrayBuffer(4), mimeType: 'audio/pcm' });
    expect(new DataView(result.bytes).getUint32(24, true)).toBe(24_000);
  });

  it('leaves already-containerized audio untouched', () => {
    const response = { bytes: new ArrayBuffer(2), mimeType: 'audio/mpeg' };
    expect(pcmToWav(response)).toBe(response);
  });
});
