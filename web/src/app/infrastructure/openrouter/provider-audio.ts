import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import { err, ok, type Result } from '../../domain/shared/result';
import type { AudioContext } from './audio-verification';
import { isPcmMimeType, pcmFormatOf, pcmToWav } from './pcm-audio';
import type { AudioResponse } from './openrouter-client';

/**
 * Turning what a speech provider returns into what Monosai stores.
 *
 * Decided by the reply, not the model: whichever family answers with raw PCM —
 * Gemini, HeyGen, or the next one OpenRouter adds — is compressed, at the rate
 * its reply declares, and everything already in a container passes through to
 * verification. Raw PCM stored as it arrives costs about 2.8 MB a minute,
 * roughly fifteen times the compressed clip, so compressing it is part of
 * accepting the response, not a later tidy-up.
 *
 * This sits in one function that both the configuration test and sentence
 * synthesis call, for the reason ADR 0018 gives for the request body. A test
 * that proved a clip synthesis would not store proves nothing — and because the
 * test runs first, a browser whose encoder is broken says so in Settings, with
 * the sample, rather than part-way through a reading.
 */
export async function normalizeProviderAudio(
  response: AudioResponse,
  encoder: SpeechEncoder,
  context: AudioContext,
  signal?: AbortSignal,
): Promise<Result<AudioResponse, AiError>> {
  if (!isPcmMimeType(response.mimeType)) {
    return ok(response);
  }
  const format = pcmFormatOf(response.mimeType);
  const frameBytes = 2 * format.channels;
  if (response.bytes.byteLength === 0 || response.bytes.byteLength % frameBytes !== 0) {
    return err(
      aiError('audio-invalid', context.task, 'The provider returned audio Monosai cannot store.', {
        detail: {
          modelId: context.modelId,
          voiceId: context.voiceId,
          issueCode: 'malformed-pcm',
        },
      }),
    );
  }

  const encoded = await encoder.encode(
    {
      samples: new Int16Array(response.bytes),
      sampleRate: format.sampleRate,
      channels: format.channels,
    },
    signal,
  );

  if (encoded.ok) {
    return ok({ bytes: encoded.value.bytes, mimeType: encoded.value.mimeType });
  }
  if (encoded.error.code === 'cancelled') {
    return err(aiError('cancelled', context.task, 'The request was cancelled.'));
  }
  if (encoded.error.code === 'unsupported') {
    // No encoder here. The clip is stored uncompressed rather than refused: it
    // costs far more room, but a learner on such a browser still gets audio,
    // and the maintenance pass will compress it if they ever open a browser
    // that can.
    return ok(pcmToWav(response));
  }
  return err(
    aiError(
      'audio-invalid',
      context.task,
      'The returned clip could not be compressed for storage.',
      {
        detail: {
          modelId: context.modelId,
          voiceId: context.voiceId,
          issueCode: 'encode-failed',
        },
      },
    ),
  );
}
