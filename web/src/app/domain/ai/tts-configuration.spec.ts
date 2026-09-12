import { describe, expect, it } from 'vitest';
import { resolveTtsVoice } from './tts-configuration';

describe('Gemini TTS configuration', () => {
  it('uses Kore only when a Gemini TTS voice is omitted', () => {
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', '')).toBe('Kore');
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', ' Puck ')).toBe('Puck');
    expect(resolveTtsVoice('vendor/tts', '')).toBe('');
  });
});
