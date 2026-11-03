import { describe, expect, it } from 'vitest';
import { declaredSpeechCapabilities } from './speech-capabilities';

const GEMINI = 'google/gemini-3.1-flash-tts-preview';
const OPENAI = 'openai/gpt-4o-mini-tts';

describe('declaredSpeechCapabilities', () => {
  it('gives Gemini the prompted style channel even without a catalog entry', () => {
    expect(declaredSpeechCapabilities(GEMINI, ['voice'])).toEqual({
      instructions: true,
      styleControl: 'prompted',
    });
  });

  it('treats an empty parameter list as unknown and tries style instructions', () => {
    expect(declaredSpeechCapabilities(OPENAI, [])).toEqual({
      instructions: true,
      styleControl: 'prompted',
    });
  });

  it('takes a non-empty catalog list at its word', () => {
    expect(declaredSpeechCapabilities(OPENAI, ['voice'])).toEqual({
      instructions: false,
      styleControl: 'none',
    });
    expect(declaredSpeechCapabilities(OPENAI, ['Instructions'])).toEqual({
      instructions: true,
      styleControl: 'prompted',
    });
  });
});
