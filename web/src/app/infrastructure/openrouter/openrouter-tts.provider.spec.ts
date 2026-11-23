import { describe, expect, it } from 'vitest';
import { fakeAudioDecoder, FakeCredentialRepository } from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER, FakeOpenRouterServer } from '../../../testing/openrouter-server';
import { SPEECH_CODE_UNAVAILABLE, type TtsRequest } from '../../domain/ai/text-to-speech-provider';
import { restartingSpeechEncoder } from '../audio/audio.providers';
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

  it('classifies a chunk the synthesizer itself failed to load, such as the encoder', async () => {
    const synthesizer = {
      synthesize: () => Promise.reject(new TypeError('fetch')),
    } as unknown as OpenRouterTtsSynthesizer;

    const result = await synthesize(() => Promise.resolve(synthesizer), false);

    expect(result).toMatchObject({ ok: false, error: { code: 'offline' } });
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

describe('OpenRouterTextToSpeechProvider when the encoder code cannot load', () => {
  const request: TtsRequest = {
    text: 'ねこがすきです。',
    modelId: FAKE_OPENROUTER.ttsModel,
    voiceId: FAKE_OPENROUTER.voice,
    speechStyle: 'clear',
    speechPace: 'natural',
    responseFormat: 'mp3',
    speechInstructions: 'supported',
  };

  it('keeps a paid PCM clip uncompressed rather than throwing it away', async () => {
    const server = new FakeOpenRouterServer({ pcmOnlyRate: 24_000 });
    const client = new OpenRouterClient({
      fetchFn: server.fetch,
      credentials: new FakeCredentialRepository(),
      isOnline: () => true,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      correlationId: () => 'test-correlation',
    });
    const decoder = fakeAudioDecoder();
    // Wired as the app wires it, over an encoder chunk that cannot be fetched.
    const encoder = restartingSpeechEncoder(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    );
    const refusals = new SpeechRefusals();
    const tts = new OpenRouterTextToSpeechProvider(
      new OpenRouterTtsTester(client, decoder, encoder, refusals),
      () => Promise.resolve(new OpenRouterTtsSynthesizer(client, decoder, encoder, refusals)),
      () => true,
    );

    const result = await tts.synthesize(request, new AbortController().signal);

    expect(server.requests.at(-1)?.body['response_format']).toBe('pcm');
    expect(result).toMatchObject({ ok: true, value: { mimeType: 'audio/wav' } });
  });
});
