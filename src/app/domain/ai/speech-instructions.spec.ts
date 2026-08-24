import { describe, expect, it } from 'vitest';
import {
  buildSpeechInstructions,
  MAX_SPEECH_CONTEXT_CODE_POINTS,
  SPEECH_INSTRUCTION_VERSION,
} from './speech-instructions';

describe('speech instructions', () => {
  it('is versioned and asks for exact target-only natural Japanese', () => {
    const instructions = buildSpeechInstructions();

    expect(SPEECH_INSTRUCTION_VERSION).toBe('speech/1');
    expect(instructions).toContain('Speak only the exact target text');
    expect(instructions).toContain('natural standard Japanese');
    expect(instructions).toContain('do not use unnatural mora-by-mora pronunciation');
  });

  it('caps each neighbor by Unicode code point and marks it as context only', () => {
    const rareKanji = String.fromCodePoint(0x20_000);
    const before = rareKanji.repeat(MAX_SPEECH_CONTEXT_CODE_POINTS + 20);
    const instructions = buildSpeechInstructions({ beforeJa: before, afterJa: '次の文。' });
    const captured = /Previous sentence \(context only\): "([^"]+)"/u.exec(instructions)?.[1];

    expect(Array.from(captured ?? '')).toHaveLength(MAX_SPEECH_CONTEXT_CODE_POINTS);
    expect(instructions).toContain('Next sentence (context only)');
    expect(instructions).toContain('Never add, repeat, translate, spell out, or speak the context');
  });
});
