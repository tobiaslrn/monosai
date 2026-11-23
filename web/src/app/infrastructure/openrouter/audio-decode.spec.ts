import { describe, expect, it, vi } from 'vitest';
import { createAudioDecoder } from './audio-decode';

type Decode = (bytes: ArrayBuffer) => Promise<{ duration: number }>;

/** A context class whose instances decode with `decode`, or whose constructor throws. */
function contextClass(decode: Decode | 'refused') {
  const constructed = vi.fn();
  const closed = vi.fn(() => Promise.resolve());
  class FakeContext {
    constructor(...args: unknown[]) {
      constructed(...args);
      if (decode === 'refused') throw new DOMException('No context', 'NotSupportedError');
    }
    decodeAudioData(bytes: ArrayBuffer) {
      return (decode as Decode)(bytes);
    }
    close() {
      return closed();
    }
  }
  return { FakeContext, constructed, closed };
}

const decodes: Decode = () => Promise.resolve({ duration: 2.5 });
const rejects: Decode = () => Promise.reject(new DOMException('Bad data', 'EncodingError'));

function decoderFor(globals: Record<string, unknown>) {
  return createAudioDecoder(globals as unknown as Window);
}

describe('createAudioDecoder', () => {
  it('decodes with an offline context, which holds no audio device', async () => {
    const offline = contextClass(decodes);
    const live = contextClass(decodes);

    const outcome = await decoderFor({
      OfflineAudioContext: offline.FakeContext,
      AudioContext: live.FakeContext,
    }).decode(new ArrayBuffer(8), 'audio/wav');

    expect(outcome).toEqual({ kind: 'decoded', durationSeconds: 2.5 });
    expect(offline.constructed).toHaveBeenCalledOnce();
    expect(live.constructed).not.toHaveBeenCalled();
  });

  it('falls back to a live context, and closes it', async () => {
    const live = contextClass(decodes);

    const outcome = await decoderFor({
      OfflineAudioContext: contextClass('refused').FakeContext,
      webkitAudioContext: live.FakeContext,
    }).decode(new ArrayBuffer(8), 'audio/wav');

    expect(outcome).toEqual({ kind: 'decoded', durationSeconds: 2.5 });
    expect(live.closed).toHaveBeenCalledOnce();
  });

  it('finds bytes that do not decode undecodable', async () => {
    const outcome = await decoderFor({
      OfflineAudioContext: contextClass(rejects).FakeContext,
    }).decode(new ArrayBuffer(8), 'audio/wav');

    expect(outcome).toEqual({ kind: 'undecodable' });
  });

  it('says there is no decoder when no context can be made', async () => {
    expect(await decoderFor({}).decode(new ArrayBuffer(8), 'audio/wav')).toEqual({
      kind: 'no-decoder',
    });
    expect(
      await decoderFor({
        OfflineAudioContext: contextClass('refused').FakeContext,
        AudioContext: contextClass('refused').FakeContext,
      }).decode(new ArrayBuffer(8), 'audio/wav'),
    ).toEqual({ kind: 'no-decoder' });
  });

  it('decodes with the prefixed offline context older WebKit has, through callbacks', async () => {
    const constructed = vi.fn();
    class CallbackContext {
      constructor(...args: unknown[]) {
        constructed(...args);
      }
      decodeAudioData(
        _bytes: ArrayBuffer,
        success: (buffer: { duration: number }) => void,
      ): undefined {
        success({ duration: 1.25 });
        return undefined;
      }
    }

    const decoder = decoderFor({ webkitOfflineAudioContext: CallbackContext });

    expect(decoder.available()).toBe(true);
    expect(await decoder.decode(new ArrayBuffer(8), 'audio/wav')).toEqual({
      kind: 'decoded',
      durationSeconds: 1.25,
    });
    expect(constructed).toHaveBeenCalledWith(1, 1, 44_100);
  });

  it('knows before any clip that a browser with no context has no decoder', () => {
    expect(decoderFor({}).available()).toBe(false);
    expect(decoderFor({ AudioContext: contextClass(decodes).FakeContext }).available()).toBe(true);
  });

  it('remembers a browser whose contexts all refused as having no decoder', async () => {
    const offline = contextClass('refused');
    const decoder = decoderFor({ OfflineAudioContext: offline.FakeContext });
    expect(decoder.available()).toBe(true);

    expect(await decoder.decode(new ArrayBuffer(8), 'audio/wav')).toEqual({ kind: 'no-decoder' });

    expect(decoder.available()).toBe(false);
    expect(await decoder.decode(new ArrayBuffer(8), 'audio/wav')).toEqual({ kind: 'no-decoder' });
    expect(offline.constructed).toHaveBeenCalledOnce();
  });

  it('keeps bytes that do not decode a fault of the clip, not of the browser', async () => {
    const decoder = decoderFor({ OfflineAudioContext: contextClass(rejects).FakeContext });

    expect(await decoder.decode(new ArrayBuffer(8), 'audio/wav')).toEqual({ kind: 'undecodable' });
    expect(decoder.available()).toBe(true);
  });

  it('decodes a copy, so the clip it proved survives', async () => {
    const bytes = new ArrayBuffer(8);
    let given: ArrayBuffer | null = null;
    await decoderFor({
      OfflineAudioContext: contextClass((received) => {
        given = received;
        return Promise.resolve({ duration: 1 });
      }).FakeContext,
    }).decode(bytes, 'audio/wav');

    expect(given).not.toBe(bytes);
    expect(bytes.byteLength).toBe(8);
  });
});
