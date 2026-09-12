import {
  speechEncodeError,
  type EncodedSpeech,
  type SpeechEncodeError,
  type SpeechSamples,
} from '../../app/domain/audio/speech-encoder';
import { muxOpusWebm, type OpusPacket } from '../../app/domain/audio/webm-opus';
import { describeThrown } from '../../app/domain/shared/errors';
import { err, ok, type Result } from '../../app/domain/shared/result';

/**
 * Opus, at the settings speech is stored under.
 *
 * 24 kbit/s mono is well clear of where Opus starts to strain on a single
 * voice, and measured against the uncompressed 24 kHz WAV that Gemini clips are
 * stored as today it is about a fifteenth of the size.
 *
 * The frame duration is the longest Opus offers. It does not change the audio;
 * it changes how many packets carry it, and every packet costs a few bytes of
 * container. At 20 ms a three-second sentence carries 151 packets, at 60 ms it
 * carries 51, which is the difference between 12% and 6% container overhead.
 */
const BITRATE = 24_000;
const FRAME_DURATION_US = 60_000;

/**
 * The encoder constructors, taken as a dependency.
 *
 * Passing them in rather than reading globals is what lets the encoding be
 * tested without WebCodecs, and lets a browser without it fail with
 * `unsupported` at the boundary instead of a `ReferenceError` deeper in.
 */
export interface WebCodecsAudio {
  readonly AudioEncoder: typeof AudioEncoder;
  readonly AudioData: typeof AudioData;
}

/** Reads the encoder's `OpusHead`, whichever shape it reports the buffer in. */
function toBytes(description: AllowSharedBufferSource): Uint8Array {
  if (description instanceof ArrayBuffer) {
    return new Uint8Array(description.slice(0));
  }
  const view = description as ArrayBufferView;
  return new Uint8Array(
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer,
  );
}

/**
 * Compresses one clip of PCM into a WebM/Opus file.
 *
 * The whole clip goes into the encoder as a single `AudioData`: a sentence is
 * seconds long, and feeding it in pieces would buy nothing but a chance to get
 * the timestamps wrong.
 */
export async function encodeOpusWebm(
  input: SpeechSamples,
  codecs: WebCodecsAudio | null,
  signal?: AbortSignal,
): Promise<Result<EncodedSpeech, SpeechEncodeError>> {
  if (codecs === null) {
    return err(speechEncodeError('unsupported', 'This browser cannot compress audio for storage.'));
  }
  if (input.channels <= 0 || input.sampleRate <= 0) {
    return err(speechEncodeError('invalid-input', 'The clip declared no channels or rate.'));
  }
  if (input.samples.length === 0 || input.samples.length % input.channels !== 0) {
    return err(
      speechEncodeError('invalid-input', 'The clip does not hold whole frames for its channels.'),
    );
  }
  // Read through a call, never a narrowed property: the flag flips while the
  // encode is running, which is the only moment cancelling it matters.
  const cancelled = (): boolean => signal?.aborted === true;
  if (cancelled()) {
    return err(speechEncodeError('cancelled', 'The encode was cancelled.'));
  }

  const config: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: input.sampleRate,
    numberOfChannels: input.channels,
    bitrate: BITRATE,
    opus: { frameDuration: FRAME_DURATION_US },
  };

  try {
    const support = await codecs.AudioEncoder.isConfigSupported(config);
    if (support.supported !== true) {
      return err(
        speechEncodeError('unsupported', 'This browser cannot compress audio at these settings.'),
      );
    }
  } catch (thrown) {
    return err(
      speechEncodeError(
        'unsupported',
        'The audio encoder refused these settings.',
        describeThrown(thrown),
      ),
    );
  }

  const frames = input.samples.length / input.channels;

  /**
   * What the encoder hands back, gathered on one object.
   *
   * The encoder reports through callbacks, so everything it produces is written
   * from inside one; an object keeps that plain rather than scattering captured
   * variables the reader has to track separately.
   */
  const collected: {
    readonly packets: OpusPacket[];
    codecPrivate: Uint8Array | null;
    readonly failures: SpeechEncodeError[];
  } = { packets: [], codecPrivate: null, failures: [] };

  const encoder = new codecs.AudioEncoder({
    output: (chunk, metadata) => {
      const description = metadata?.decoderConfig?.description;
      if (description !== undefined && collected.codecPrivate === null) {
        collected.codecPrivate = toBytes(description);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      collected.packets.push({ data, timestampUs: chunk.timestamp });
    },
    error: (thrown) => {
      collected.failures.push(
        speechEncodeError(
          'encode-failed',
          'The audio encoder failed on this clip.',
          describeThrown(thrown),
        ),
      );
    },
  });

  try {
    encoder.configure(config);
    encoder.encode(
      new codecs.AudioData({
        format: 's16',
        sampleRate: input.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: input.channels,
        timestamp: 0,
        data: input.samples,
      }),
    );
    await encoder.flush();
  } catch (thrown) {
    return err(
      speechEncodeError(
        'encode-failed',
        'The audio encoder failed on this clip.',
        describeThrown(thrown),
      ),
    );
  } finally {
    if (encoder.state !== 'closed') {
      encoder.close();
    }
  }

  const failure = collected.failures.at(0);
  if (failure !== undefined) {
    return err(failure);
  }
  if (cancelled()) {
    return err(speechEncodeError('cancelled', 'The encode was cancelled.'));
  }
  const head = collected.codecPrivate;
  if (collected.packets.length === 0 || head === null) {
    return err(
      speechEncodeError('encode-failed', 'The audio encoder produced no compressed audio.'),
    );
  }

  try {
    const file = muxOpusWebm({
      packets: collected.packets,
      codecPrivate: head,
      sampleRate: input.sampleRate,
      channels: input.channels,
      durationUs: Math.round((frames / input.sampleRate) * 1_000_000),
    });
    return ok({
      bytes: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
      mimeType: 'audio/webm',
    });
  } catch (thrown) {
    return err(
      speechEncodeError(
        'encode-failed',
        'The compressed audio could not be packaged.',
        describeThrown(thrown),
      ),
    );
  }
}
