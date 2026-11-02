import type { DomainErrorBase } from '../shared/errors';
import type { Result } from '../shared/result';

/**
 * Compressing speech for storage.
 *
 * Gemini answers with raw 24 kHz PCM, which is about ten times the size of the
 * MP3 the OpenAI-compatible models return for the same sentence. Storing it as
 * it arrives is what makes a library of readings expensive, so a clip is
 * compressed on the way in and the stored bytes are what the reader plays.
 *
 * The port is here rather than in infrastructure because three layers reach it:
 * the synthesis adapters that encode a new clip, the worker that does the work,
 * and the maintenance pass that re-encodes clips already on disk.
 */

export type SpeechEncodeErrorCode =
  /** The browser has no encoder for the codec, so nothing can be compressed. */
  | 'unsupported'
  /** The encoder was reached but refused or failed on this clip. */
  | 'encode-failed'
  /** The samples handed in were not shaped the way the encoder was told. */
  | 'invalid-input'
  | 'worker-unavailable'
  | 'cancelled'
  | 'unknown';

export type SpeechEncodeError = DomainErrorBase<'speech-encoder', SpeechEncodeErrorCode>;

export function speechEncodeError(
  code: SpeechEncodeErrorCode,
  message: string,
  cause?: string,
): SpeechEncodeError {
  return { domain: 'speech-encoder', code, message, ...(cause === undefined ? {} : { cause }) };
}

/** 16-bit signed mono PCM, as both Gemini and a stored WAV clip carry it. */
export interface SpeechSamples {
  /**
   * Backed by a plain `ArrayBuffer` rather than any buffer: these samples are
   * handed to the platform encoder, which does not accept a shared one.
   */
  readonly samples: Int16Array<ArrayBuffer>;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface EncodedSpeech {
  readonly bytes: ArrayBuffer;
  /** Opus in WebM: the one compressed form the reader can both store and append. */
  readonly mimeType: 'audio/webm';
}

export interface SpeechEncoder {
  /**
   * Compresses one clip.
   *
   * Whole-clip rather than streaming: a sentence is seconds long and is always
   * stored complete, so there is nothing for a caller to do with a partial
   * result except wait for the rest of it.
   */
  encode(
    input: SpeechSamples,
    signal?: AbortSignal,
  ): Promise<Result<EncodedSpeech, SpeechEncodeError>>;
}
