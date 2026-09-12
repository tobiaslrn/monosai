import { describe, expect, it, vi } from 'vitest';
import { SPEECH_ENCODER_PROTOCOL_VERSION } from '../../app/infrastructure/audio/speech-encoder-protocol';
import type { SpeechEncoderResponseMessage } from '../../app/infrastructure/audio/speech-encoder-protocol';
import { SpeechEncoderHost } from './speech-encoder-host';
import type { WebCodecsAudio } from './opus-encoding';

interface FakeChunk {
  readonly byteLength: number;
  readonly timestamp: number;
  copyTo(target: Uint8Array): void;
}

interface FakeMetadata {
  readonly decoderConfig: { readonly description: Uint8Array };
}

/** The failure code a response carries, or `undefined` when it succeeded. */
function errorCode(message: SpeechEncoderResponseMessage): string | undefined {
  return message.ok ? undefined : message.error.code;
}

/** A 19-byte `OpusHead`, as a real encoder reports its decoder configuration. */
function opusHead(): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1;
  head[9] = 1;
  return head;
}

/**
 * A stand-in for WebCodecs.
 *
 * The host is about message handling, so the encoder is faked rather than
 * driven: what matters here is that a request produces one response carrying
 * transferable bytes, and that a failure is reported rather than thrown.
 */
function fakeCodecs(options: { packets?: number; failOn?: 'configure' | 'output' } = {}) {
  const packets = options.packets ?? 2;
  class FakeAudioEncoder {
    static isConfigSupported = vi.fn(() => Promise.resolve({ supported: true, config: {} }));
    state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
    constructor(
      private readonly init: {
        output: (chunk: FakeChunk, metadata: FakeMetadata) => void;
        error: (thrown: unknown) => void;
      },
    ) {}
    configure(): void {
      if (options.failOn === 'configure') {
        throw new Error('refused');
      }
      this.state = 'configured';
    }
    encode(): void {
      if (options.failOn === 'output') {
        this.init.error(new Error('encoder fell over'));
        return;
      }
      for (let index = 0; index < packets; index += 1) {
        this.init.output(
          {
            byteLength: 8,
            timestamp: index * 60_000,
            copyTo: (target: Uint8Array) => target.fill(index + 1),
          },
          { decoderConfig: { description: opusHead() } },
        );
      }
    }
    flush(): Promise<void> {
      return Promise.resolve();
    }
    close(): void {
      this.state = 'closed';
    }
  }
  class FakeAudioData {
    readonly init: unknown;
    constructor(init: unknown) {
      this.init = init;
    }
  }
  return {
    AudioEncoder: FakeAudioEncoder,
    AudioData: FakeAudioData,
  } as unknown as WebCodecsAudio;
}

function encodeMessage(requestId = 'r1', samples = 4800) {
  return {
    version: SPEECH_ENCODER_PROTOCOL_VERSION,
    requestId,
    request: {
      operation: 'encode',
      payload: {
        samples: new Int16Array(samples).buffer,
        sampleRate: 24_000,
        channels: 1,
      },
    },
  };
}

function harness(codecs: WebCodecsAudio | null) {
  const posted: SpeechEncoderResponseMessage[] = [];
  const transfers: (readonly Transferable[] | undefined)[] = [];
  const host = new SpeechEncoderHost({
    post: (message, transfer) => {
      posted.push(message);
      transfers.push(transfer);
    },
    codecs: () => codecs,
  });
  return { host, posted, transfers };
}

describe('SpeechEncoderHost', () => {
  it('answers an encode with compressed bytes, handed over rather than copied', async () => {
    const { host, posted, transfers } = harness(fakeCodecs());

    await host.handleMessage(encodeMessage());

    expect(posted).toHaveLength(1);
    const message = posted[0];
    expect(message.ok).toBe(true);
    if (message.ok) {
      expect(message.result.value.bytes.byteLength).toBeGreaterThan(0);
      expect(transfers[0]).toStrictEqual([message.result.value.bytes]);
    }
  });

  it('refuses a message it cannot read rather than guessing at it', async () => {
    const { host, posted } = harness(fakeCodecs());

    await host.handleMessage({ requestId: 'r9', nonsense: true });

    expect(posted[0]).toMatchObject({ requestId: 'r9', ok: false });
    expect(errorCode(posted[0])).toBe('invalid-input');
  });

  it('refuses a client speaking a different protocol version', async () => {
    const { host, posted } = harness(fakeCodecs());

    await host.handleMessage({ ...encodeMessage(), version: SPEECH_ENCODER_PROTOCOL_VERSION + 1 });

    expect(errorCode(posted[0])).toBe('worker-unavailable');
  });

  it('reports a browser with no encoder instead of failing to start', async () => {
    const { host, posted } = harness(null);

    await host.handleMessage(encodeMessage());

    expect(errorCode(posted[0])).toBe('unsupported');
  });

  it('reports an encoder that fails on the clip', async () => {
    const { host, posted } = harness(fakeCodecs({ failOn: 'output' }));

    await host.handleMessage(encodeMessage());

    expect(errorCode(posted[0])).toBe('encode-failed');
  });

  it('drops a request cancelled before it ran', async () => {
    const { host, posted } = harness(fakeCodecs());

    void host.handleMessage({
      version: SPEECH_ENCODER_PROTOCOL_VERSION,
      requestId: 'c1',
      request: { operation: 'cancel', payload: { requestId: 'r1' } },
    });
    await host.handleMessage(encodeMessage('r1'));

    expect(posted).toHaveLength(1);
    expect(errorCode(posted[0])).toBe('cancelled');
  });

  it('runs encodes one at a time even when several arrive together', async () => {
    const { host, posted } = harness(fakeCodecs());

    await Promise.all([
      host.handleMessage(encodeMessage('r1')),
      host.handleMessage(encodeMessage('r2')),
      host.handleMessage(encodeMessage('r3')),
    ]);

    expect(posted.map((message) => message.requestId)).toStrictEqual(['r1', 'r2', 'r3']);
    expect(posted.every((message) => message.ok)).toBe(true);
  });
});
