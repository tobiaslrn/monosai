import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities, type PaceControl } from './speech-capabilities';

const GEMINI = 'google/gemini-3.1-flash-tts-preview';
const OPENAI = 'openai/gpt-4o-mini-tts';

describe('declaredSpeechCapabilities', () => {
  it('refuses speed for Gemini even when the catalog lists the parameter', () => {
    // OpenRouter advertises `speed` for everything it proxies; Gemini ignores
    // it. Believing the catalog here would record a pace the learner never got.
    const capabilities = declaredSpeechCapabilities(GEMINI, ['speed', 'voice']);

    expect(capabilities.speed).toBe(false);
    expect(capabilities.pace).toBe('prompted');
  });

  it('gives Gemini the direction channel no catalog entry can declare', () => {
    expect(declaredSpeechCapabilities(GEMINI, ['voice']).instructions).toBe(true);
  });

  it('reads an empty parameter list as unknown, not as a model that can do neither', () => {
    // The catalog is fetched lazily and may not be in hand during a preview, so
    // both channels are tried and the provider's refusal decides.
    expect(declaredSpeechCapabilities(OPENAI, [])).toEqual({
      speed: true,
      instructions: true,
      pace: 'native',
    });
  });

  it('takes a non-empty list at its word', () => {
    expect(declaredSpeechCapabilities(OPENAI, ['voice'])).toEqual({
      speed: false,
      instructions: false,
      pace: 'fixed',
    });
    expect(declaredSpeechCapabilities(OPENAI, ['Instructions'])).toMatchObject({
      speed: false,
      instructions: true,
    });
    expect(declaredSpeechCapabilities(OPENAI, [' speed '])).toMatchObject({
      speed: true,
      instructions: false,
    });
  });

  it('derives every pace exhaustively from the two channels', () => {
    const cases: readonly { readonly parameters: readonly string[]; readonly pace: PaceControl }[] =
      [
        { parameters: ['speed', 'instructions'], pace: 'native' },
        { parameters: ['speed'], pace: 'native' },
        { parameters: ['instructions'], pace: 'prompted' },
        { parameters: ['voice'], pace: 'fixed' },
      ];

    for (const { parameters, pace } of cases) {
      expect(declaredSpeechCapabilities(OPENAI, parameters).pace).toBe(pace);
    }
  });
});
