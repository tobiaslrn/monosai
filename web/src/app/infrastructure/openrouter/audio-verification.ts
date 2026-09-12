import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { AudioMimeType } from '../../domain/enrichment/records';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioDecoder } from './audio-decode';
import type { AudioResponse } from './openrouter-client';

/**
 * What "audio Monosai can store" means, in one place.
 *
 * The configuration test and sentence synthesis have to agree on it exactly: a
 * clip the test accepted but synthesis would refuse would make a passing test a
 * lie, and the reverse would store something the reader cannot play. Both
 * adapters call this rather than each carrying their own list.
 */

/**
 * MP3 is what is requested of the providers that offer a choice; `audio/webm`
 * is what Gemini's PCM becomes once Monosai has compressed it, and `audio/wav`
 * what it becomes on a browser that cannot compress at all.
 */
export const ACCEPTED_MIME_TYPES: readonly string[] = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
];

/** The stored MIME type every accepted response normalizes to. */
function storedMimeType(declared: string): AudioMimeType {
  if (declared === 'audio/wav') {
    return 'audio/wav';
  }
  return declared === 'audio/webm' ? 'audio/webm' : 'audio/mpeg';
}

export interface VerifiedAudio {
  readonly bytes: ArrayBuffer;
  readonly mimeType: AudioMimeType;
  /** The exact type header, normalized: `audio/mpeg; charset=…` is still MP3. */
  readonly declaredMimeType: string;
}

export interface AudioContext {
  readonly task: AiTask;
  readonly modelId: string;
  readonly voiceId: string;
  /**
   * Who produced the bytes being checked.
   *
   * Compressed Gemini clips are Monosai's own output, so "the provider returned
   * something undecodable" would be a false accusation — and would send a
   * learner to change a model that is working.
   */
  readonly origin?: 'provider' | 'encoder';
}

/** Strips parameters from a content type, so `audio/mpeg; rate=…` still matches. */
export function normalizeMimeType(contentType: string): string {
  return contentType.split(';')[0]?.trim() ?? '';
}

/**
 * Proves a response is a clip this browser can play, before anything stores it.
 *
 * A well-formed file this browser cannot decode is a failure the learner has to
 * be told about at the moment it is produced, not the first time they press
 * play, so decoding is part of accepting the response rather than part of
 * playback.
 */
export async function verifyAudio(
  response: AudioResponse,
  decoder: AudioDecoder,
  context: AudioContext,
): Promise<Result<VerifiedAudio, AiError>> {
  const declaredMimeType = normalizeMimeType(response.mimeType);
  if (!ACCEPTED_MIME_TYPES.includes(declaredMimeType)) {
    return err(
      aiError('audio-invalid', context.task, 'The provider returned audio Monosai cannot store.', {
        detail: {
          modelId: context.modelId,
          voiceId: context.voiceId,
          issueCode: 'unsupported-mime',
        },
      }),
    );
  }
  if (!(await decoder.canDecode(response.bytes, declaredMimeType))) {
    const fromEncoder = context.origin === 'encoder';
    return err(
      aiError(
        'audio-invalid',
        context.task,
        fromEncoder
          ? 'The compressed clip could not be decoded for playback.'
          : 'The returned clip could not be decoded for playback.',
        {
          detail: {
            modelId: context.modelId,
            voiceId: context.voiceId,
            issueCode: fromEncoder ? 'reencoded-undecodable' : 'undecodable',
          },
        },
      ),
    );
  }
  return ok({
    bytes: response.bytes,
    mimeType: storedMimeType(declaredMimeType),
    declaredMimeType,
  });
}
