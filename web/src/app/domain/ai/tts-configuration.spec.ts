import { describe, expect, it } from 'vitest';
import { preferredSpeechVoice, resolveTtsVoice } from './tts-configuration';

describe('Gemini TTS configuration', () => {
  it('uses Kore only when a Gemini TTS voice is omitted', () => {
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', '')).toBe('Kore');
    expect(resolveTtsVoice('google/gemini-3.1-flash-tts-preview', ' Puck ')).toBe('Puck');
    expect(resolveTtsVoice('vendor/tts', '')).toBe('');
  });
});

describe('preferredSpeechVoice', () => {
  it('picks a voice the catalog marks as Japanese', () => {
    expect(preferredSpeechVoice(['af_heart', 'jf_alpha', 'jm_kumo'])).toBe('jf_alpha');
    expect(preferredSpeechVoice(['en-US-Ava', 'ja-JP-Nanami'])).toBe('ja-JP-Nanami');
    expect(preferredSpeechVoice(['English_Graceful', 'Japanese_KindLady'])).toBe(
      'Japanese_KindLady',
    );
    expect(preferredSpeechVoice(['aura-2-thalia-en', 'aura-2-izanami-ja'])).toBe(
      'aura-2-izanami-ja',
    );
  });

  it('does not mistake a name that merely contains the letters for Japanese', () => {
    expect(preferredSpeechVoice(['Raja', 'Jasper'])).toBe('Raja');
  });

  it('falls back to the first voice, or none when the catalog lists none', () => {
    expect(preferredSpeechVoice(['alloy', 'nova'])).toBe('alloy');
    expect(preferredSpeechVoice([])).toBe('');
  });
});
