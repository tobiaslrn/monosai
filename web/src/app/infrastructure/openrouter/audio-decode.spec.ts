import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioDecoder, DECODE_TIMEOUT_MS, probeClip } from './audio-decode';

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
/** A decoder that never answers. */
const hangs: Decode = () => new Promise(() => undefined);
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
  // A decoder that never answers would stall a run, or a voice test, for good.
  describe('a decode that never answers', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives a clip up as undecodable, without waiting on the context to close', async () => {
      vi.useFakeTimers();
      const live = contextClass(hangs);
      live.closed.mockImplementation(() => new Promise(() => undefined));
      const decoder = decoderFor({ AudioContext: live.FakeContext });

      const outcome = decoder.decode(new ArrayBuffer(8), 'audio/wav');
      await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS - 1);
      let settled = false;
      void outcome.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await outcome).toEqual({ kind: 'undecodable' });
      expect(live.closed).toHaveBeenCalledOnce();
      expect(decoder.available()).toBe(true);
    });

    it('answers no to the check without remembering it, so the next check asks again', async () => {
      vi.useFakeTimers();
      let decode: Decode = hangs;
      const offline = contextClass((bytes) => decode(bytes));
      const decoder = decoderFor({ OfflineAudioContext: offline.FakeContext });

      const first = decoder.canDecode();
      await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS);
      expect(await first).toBe(false);
      expect(decoder.available()).toBe(true);

      decode = decodes;
      expect(await decoder.canDecode()).toBe(true);
      expect(offline.constructed).toHaveBeenCalledTimes(2);
    });
  });

  describe('the check before a clip is paid for', () => {
    // A browser can make a context and still decode nothing: making one is
    // not proof, so the check decodes a clip it carries.
    it('finds a browser whose contexts decode nothing to have no decoder', async () => {
      const decoder = decoderFor({ OfflineAudioContext: contextClass(rejects).FakeContext });

      expect(await decoder.canDecode()).toBe(false);
      expect(decoder.available()).toBe(false);
    });

    it('finds a browser whose contexts all refuse to have no decoder', async () => {
      const decoder = decoderFor({
        OfflineAudioContext: contextClass('refused').FakeContext,
        AudioContext: contextClass('refused').FakeContext,
      });

      expect(await decoder.canDecode()).toBe(false);
      expect(decoder.available()).toBe(false);
    });

    it('decodes its own clip once per tab, and closes the context', async () => {
      const given: ArrayBuffer[] = [];
      const offline = contextClass((bytes) => {
        given.push(bytes);
        return Promise.resolve({ duration: 0.016 });
      });
      const decoder = decoderFor({ OfflineAudioContext: offline.FakeContext });

      expect(await decoder.canDecode()).toBe(true);
      expect(await decoder.canDecode()).toBe(true);

      expect(given).toHaveLength(1);
      expect(new TextDecoder().decode(given[0]?.slice(0, 4))).toBe('RIFF');
      expect(offline.closed).toHaveBeenCalledOnce();
      expect(decoder.available()).toBe(true);
    });

    it('answers no at once for a browser with no context', async () => {
      expect(await decoderFor({}).canDecode()).toBe(false);
    });

    it('stays no once a clip found every context refused', async () => {
      let refuse = false;
      class Flaky {
        constructor() {
          if (refuse) throw new DOMException('No context', 'NotSupportedError');
        }
        decodeAudioData() {
          return Promise.resolve({ duration: 1 });
        }
      }
      const decoder = decoderFor({ OfflineAudioContext: Flaky });
      expect(await decoder.canDecode()).toBe(true);

      refuse = true;
      expect(await decoder.decode(new ArrayBuffer(8), 'audio/wav')).toEqual({ kind: 'no-decoder' });

      expect(await decoder.canDecode()).toBe(false);
    });

    it('carries a well-formed mono 16-bit WAV', () => {
      const clip = new DataView(probeClip());
      const text = (offset: number) =>
        String.fromCharCode(...new Uint8Array(clip.buffer, offset, 4));

      expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
      expect(clip.getUint32(4, true)).toBe(clip.byteLength - 8);
      expect(clip.getUint16(20, true)).toBe(1);
      expect(clip.getUint16(22, true)).toBe(1);
      expect(clip.getUint16(34, true)).toBe(16);
      expect(clip.getUint32(40, true)).toBe(clip.byteLength - 44);
      expect(clip.getUint32(40, true)).toBeGreaterThan(0);
    });
  });
});
