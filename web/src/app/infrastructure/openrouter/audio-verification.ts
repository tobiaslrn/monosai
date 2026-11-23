import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { AudioMimeType } from '../../domain/enrichment/records';
import { err, ok, type Result } from '../../domain/shared/result';
import { NO_AUDIO_DECODER } from '../../domain/audio/audio-decoder';
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
  /** How long the clip plays, as the browser decoded it. */
  readonly durationSeconds: number;
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

/**
 * The longest a clip may run for the text it was asked to read.
 *
 * Generous on purpose: a slow, clear reading of a short sentence with silence
 * at both ends stays well inside it. What it catches is a model that speaks
 * something besides the text — a delivery direction read aloud runs to most of
 * a minute however short the sentence — or that drones on garbled, as an
 * English-only model does on Japanese. Such a clip is the wrong audio, and
 * storing it would play it in every reading of that sentence.
 */
export function longestPlausibleSpeechSeconds(text: string): number {
  return 6 + 0.6 * Array.from(text).length;
}

/**
 * Whether a clip made with the direction spoke more than the clip made without it.
 *
 * Calibrated on live clips of the test phrase: correct readings ran 1.2–3.1 s
 * with or without the direction, while a model that read the context sentences
 * aloud ran 5.6 s and one that read part of the direction ran 3.9 s, against
 * about 1.4 s plain. Twice the plain length leaves room for a direction that
 * genuinely slows the reading; the second covers silence at the ends.
 */
export function spokeBeyondText(instructedSeconds: number, plainSeconds: number): boolean {
  return instructedSeconds > 2 * plainSeconds + 1;
}

/**
 * Refuses a clip that runs far longer than its text could take to read.
 *
 * Shared by the configuration test and synthesis for the same reason as
 * `verifyAudio`: the test may only pass a clip synthesis would keep.
 */
export function checkSpokenLength(
  verified: VerifiedAudio,
  text: string,
  context: AudioContext,
): Result<VerifiedAudio, AiError> {
  if (verified.durationSeconds <= longestPlausibleSpeechSeconds(text)) {
    return ok(verified);
  }
  return err(
    aiError(
      'audio-invalid',
      context.task,
      'The returned clip is far longer than the text it was asked to read.',
      {
        detail: {
          modelId: context.modelId,
          voiceId: context.voiceId,
          issueCode: 'unexpected-length',
        },
      },
    ),
  );
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
  const decoded = await decoder.decode(response.bytes, declaredMimeType);
  if (decoded.kind === 'no-decoder') {
    // Not this clip's fault and not the model's: no clip decodes here, so the
    // run stops rather than paying for more clips it would throw away.
    return err(
      aiError('unknown', context.task, 'This browser has no audio decoder.', {
        detail: {
          modelId: context.modelId,
          voiceId: context.voiceId,
          issueCode: NO_AUDIO_DECODER,
        },
      }),
    );
  }
  if (decoded.kind === 'undecodable') {
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
    durationSeconds: decoded.durationSeconds,
  });
}
