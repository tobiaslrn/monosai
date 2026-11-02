import { describe, expect, it } from 'vitest';
import { SPEECH_CODE_UNAVAILABLE, type TtsRequest } from '../../domain/ai/text-to-speech-provider';
import { OpenRouterTextToSpeechProvider } from './openrouter-tts.provider';
import type { OpenRouterTtsTester } from './tts-test.adapter';
import type { OpenRouterTtsSynthesizer } from './tts-synthesis.adapter';

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
