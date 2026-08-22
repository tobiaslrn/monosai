import { describe, expect, it } from 'vitest';
import { resolveTtsVoice, supportsTtsSpeed } from './tts-configuration';

describe('Gemini TTS configuration', () => {
  it('marks OpenRouter Gemini TTS models as not supporting speed', () => {
    expect(supportsTtsSpeed('google/gemini-3.1-flash-tts-preview')).toBe(false);
    expect(supportsTtsSpeed(' GOOGLE/GEMINI-2.5-PRO-TTS ')).toBe(false);
  });

  it('does not classify Gemini text models or other TTS providers as Gemini TTS', () => {
    expect(supportsTtsSpeed('google/gemini-2.5-flash')).toBe(true);
    expect(supportsTtsSpeed('openai/gpt-4o-mini-tts')).toBe(true);
  });

  it('uses Kore only when a Gemini TTS voice is omitted', () => {
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', '')).toBe('Kore');
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', ' Puck ')).toBe('Puck');
    expect(resolveTtsVoice('vendor/tts', '')).toBe('');
  });
});
