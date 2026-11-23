import { describe, expect, it } from 'vitest';
import { fakeAudioDecoder, FakeCredentialRepository } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER, FakeOpenRouterServer } from '../../../testing/openrouter-server';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import { SPEECH_CODE_UNAVAILABLE, type TtsRequest } from '../../domain/ai/text-to-speech-provider';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import { restartingSpeechEncoder } from '../audio/audio.providers';
import type { AudioDecoder } from './audio-decode';
import { OpenRouterClient } from './openrouter-client';
import { OpenRouterTextToSpeechProvider } from './openrouter-tts.provider';
import { SpeechRefusals } from './speech-attempts';
import { OpenRouterTtsSynthesizer } from './tts-synthesis.adapter';
import { OpenRouterTtsTester } from './tts-test.adapter';

const REQUEST = { text: 'ねこ。' } as TtsRequest;
const TESTER = {} as OpenRouterTtsTester;
const PAYLOAD = { ok: true } as const;

function synthesize(
  loader: () => Promise<OpenRouterTtsSynthesizer>,
  online: boolean,
): ReturnType<OpenRouterTextToSpeechProvider['synthesize']> {
  return new OpenRouterTextToSpeechProvider(TESTER, loader, () => online).synthesize(
    REQUEST,
    new AbortController().signal,
  );
}

describe('OpenRouterTextToSpeechProvider', () => {
  it('answers offline, rather than throwing, when the synthesizer cannot load offline', async () => {
    const result = await synthesize(() => Promise.reject(new TypeError('fetch')), false);

    expect(result).toMatchObject({ ok: false, error: { code: 'offline' } });
  });

  it('does not blame the connection when the synthesizer cannot load online', async () => {
    const result = await synthesize(() => Promise.reject(new TypeError('fetch')), true);

    expect(result).toMatchObject({ ok: false, error: { code: 'unknown' } });
  });

  it('marks a load that failed online as not being about the voice', async () => {
    const result = await synthesize(() => Promise.reject(new TypeError('fetch')), true);

    expect(result).toMatchObject({ error: { detail: { issueCode: SPEECH_CODE_UNAVAILABLE } } });
  });

  it('reports a throw from a loaded synthesizer as itself, not as a load or the connection', async () => {
    const synthesizer = {
      synthesize: () => Promise.reject(new TypeError('boom')),
    } as unknown as OpenRouterTtsSynthesizer;

    const result = await synthesize(() => Promise.resolve(synthesizer), false);

    expect(result).toMatchObject({ ok: false, error: { code: 'unknown' } });
    expect(result.ok ? undefined : result.error.detail?.issueCode).toBeUndefined();
    expect(result.ok ? '' : result.error.message).toContain('TypeError');
  });

  it('answers cancelled at once when stopped while the load is stalled', async () => {
    const controller = new AbortController();
    const provider = new OpenRouterTextToSpeechProvider(
      TESTER,
      () => new Promise(() => undefined),
      () => true,
    );

    const waiting = provider.synthesize(REQUEST, controller.signal);
    controller.abort();

    expect(await waiting).toMatchObject({ ok: false, error: { code: 'cancelled' } });
  });

  it('asks again after a failed load, so reconnecting is enough', async () => {
    let online = false;
    const synthesizer = {
      synthesize: () => Promise.resolve(PAYLOAD),
    } as unknown as OpenRouterTtsSynthesizer;
    const provider = new OpenRouterTextToSpeechProvider(
      TESTER,
      () => (online ? Promise.resolve(synthesizer) : Promise.reject(new TypeError('fetch'))),
      () => online,
    );
    const signal = new AbortController().signal;

    expect((await provider.synthesize(REQUEST, signal)).ok).toBe(false);
    online = true;
    expect((await provider.synthesize(REQUEST, signal)).ok).toBe(true);
  });
});

describe('OpenRouterTextToSpeechProvider wired to its adapters', () => {
  const request: TtsRequest = {
    text: 'ねこがすきです。',
    modelId: FAKE_OPENROUTER.ttsModel,
    voiceId: FAKE_OPENROUTER.voice,
    speechStyle: 'clear',
    speechPace: 'natural',
    responseFormat: 'mp3',
    speechInstructions: 'supported',
  };

  function wired(options: {
    readonly server: FakeOpenRouterServer;
    readonly decoder?: AudioDecoder;
    readonly encoder?: SpeechEncoder;
  }) {
    const client = new OpenRouterClient({
      fetchFn: options.server.fetch,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      correlationId: () => 'test-correlation',
    });
    const decoder = options.decoder ?? fakeAudioDecoder();
    // Wired as the app wires it, by default over an encoder chunk that cannot be fetched.
    const encoder =
      options.encoder ??
      restartingSpeechEncoder(() =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      );
    const refusals = new SpeechRefusals();
    return new OpenRouterTextToSpeechProvider(
      new OpenRouterTtsTester(client, decoder, encoder, refusals),
      () => Promise.resolve(new OpenRouterTtsSynthesizer(client, decoder, encoder, refusals)),
      () => true,
    );
  }

  it('keeps a paid PCM clip uncompressed when the encoder code cannot load', async () => {
    const server = new FakeOpenRouterServer({ pcmOnlyRate: 24_000 });

    const result = await wired({ server }).synthesize(request, new AbortController().signal);

    expect(server.requests.at(-1)?.body['response_format']).toBe('pcm');
    expect(result).toMatchObject({ ok: true, value: { mimeType: 'audio/wav' } });
  });

  it('answers a voice test with a Result when the encoder throws', async () => {
    const server = new FakeOpenRouterServer({ pcmOnlyRate: 24_000 });
    const throwing: SpeechEncoder = {
      encode: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    };

    const outcome = await wired({ server, encoder: throwing })
      .testConfiguration({
        modelId: FAKE_OPENROUTER.ttsModel,
        voiceId: FAKE_OPENROUTER.voice,
        speechStyle: 'clear',
        speechPace: 'natural',
        attempt: declaredSpeechCapabilities(FAKE_OPENROUTER.ttsModel, []),
      })
      .then(
        (result) => ({ settled: 'resolved' as const, result }),
        (error: unknown) => ({ settled: 'rejected' as const, error }),
      );

    expect(outcome).toMatchObject({
      settled: 'resolved',
      result: { ok: false, error: { code: 'unknown', task: 'tts-test' } },
    });
  });

  it('does not report a fault after the code loaded as code that could not load', async () => {
    const server = new FakeOpenRouterServer();
    const throwing: AudioDecoder = {
      available: () => true,
      decode: () => {
        throw new DOMException('Too many AudioContexts', 'NotSupportedError');
      },
    };

    const result = await wired({ server, decoder: throwing }).synthesize(
      request,
      new AbortController().signal,
    );

    expect(server.callCount).toBe(1);
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown' } });
    expect(result.ok ? undefined : result.error.detail?.issueCode).not.toBe(
      SPEECH_CODE_UNAVAILABLE,
    );
  });
});
