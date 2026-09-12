import type { SpeechEncodeError } from '../../domain/audio/speech-encoder';

/**
 * Bumped whenever a request or response shape changes. A client and a worker
 * that disagree refuse to talk rather than guessing, which matters because a
 * service-worker update can leave an old worker script cached.
 */
export const SPEECH_ENCODER_PROTOCOL_VERSION = 1;

export interface EncodeRequest {
  readonly operation: 'encode';
  readonly payload: {
    /** 16-bit signed mono PCM, transferred rather than copied. */
    readonly samples: ArrayBuffer;
    readonly sampleRate: number;
    readonly channels: number;
  };
}

export interface CancelRequest {
  readonly operation: 'cancel';
  readonly payload: { readonly requestId: string };
}

export type SpeechEncoderRequest = EncodeRequest | CancelRequest;

export interface SpeechEncoderRequestMessage {
  readonly version: number;
  readonly requestId: string;
  readonly request: SpeechEncoderRequest;
}

export interface EncodeResult {
  readonly operation: 'encode';
  readonly value: { readonly bytes: ArrayBuffer };
}

export type SpeechEncoderResult = EncodeResult;

export type SpeechEncoderResponseMessage =
  | {
      readonly version: number;
      readonly requestId: string;
      readonly ok: true;
      readonly result: SpeechEncoderResult;
    }
  | {
      readonly version: number;
      readonly requestId: string;
      readonly ok: false;
      readonly error: SpeechEncodeError;
    };
