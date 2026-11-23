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
 * 96 kbit/s mono deliberately favours perceptual quality over maximum storage
 * savings. It is four times the former setting that produced metallic speech
 * in a live listening test, while remaining roughly one quarter the size of
 * uncompressed 24 kHz, 16-bit mono PCM.
 *
 * The frame duration is the longest Opus offers. It does not change the audio;
 * it changes how many packets carry it, and every packet costs a few bytes of
 * container. At 20 ms a three-second sentence carries 151 packets, at 60 ms it
 * carries 51, which is the difference between 12% and 6% container overhead.
 */
const BITRATE = 96_000;
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

/** The only input rates Opus accepts. */
const OPUS_SAMPLE_RATES: readonly number[] = [8_000, 12_000, 16_000, 24_000, 48_000];
const OPUS_FULL_RATE = 48_000;

/**
 * Brings a clip to a rate Opus accepts.
 *
 * Providers answer at whatever rate their engine runs — 44.1 kHz is common —
 * and the encoder refuses anything off its list. Linear interpolation per
 * channel is enough for speech going into a 96 kbit/s codec, and upsampling to
 * 48 kHz loses nothing the source had.
 */
export function resampleForOpus(input: SpeechSamples): SpeechSamples {
  if (OPUS_SAMPLE_RATES.includes(input.sampleRate)) {
    return input;
  }
  const { channels } = input;
  const sourceFrames = input.samples.length / channels;
  const targetFrames = Math.max(1, Math.round((sourceFrames * OPUS_FULL_RATE) / input.sampleRate));
  const step = (sourceFrames - 1) / Math.max(1, targetFrames - 1);
  const samples = new Int16Array(targetFrames * channels);
  for (let frame = 0; frame < targetFrames; frame += 1) {
    const position = frame * step;
    const left = Math.floor(position);
    const right = Math.min(left + 1, sourceFrames - 1);
    const weight = position - left;
    for (let channel = 0; channel < channels; channel += 1) {
      const a = input.samples[left * channels + channel] ?? 0;
      const b = input.samples[right * channels + channel] ?? 0;
      samples[frame * channels + channel] = Math.round(a + (b - a) * weight);
    }
  }
  return { samples, sampleRate: OPUS_FULL_RATE, channels };
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
  source: SpeechSamples,
  codecs: WebCodecsAudio | null,
  signal?: AbortSignal,
): Promise<Result<EncodedSpeech, SpeechEncodeError>> {
  if (codecs === null) {
    return err(speechEncodeError('unsupported', 'This browser cannot compress audio for storage.'));
  }
  if (source.channels <= 0 || source.sampleRate <= 0) {
    return err(speechEncodeError('invalid-input', 'The clip declared no channels or rate.'));
  }
  if (source.samples.length === 0 || source.samples.length % source.channels !== 0) {
    return err(
      speechEncodeError('invalid-input', 'The clip does not hold whole frames for its channels.'),
    );
  }
  const input = resampleForOpus(source);
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

  // Closed here rather than left for garbage collection: the encoder keeps its
  // own reference, and a compression pass encodes clip after clip in one worker.
  let frame: AudioData | null = null;
  try {
    encoder.configure(config);
    frame = new codecs.AudioData({
      format: 's16',
      sampleRate: input.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: input.channels,
      timestamp: 0,
      data: input.samples,
    });
    encoder.encode(frame);
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
    frame?.close();
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
