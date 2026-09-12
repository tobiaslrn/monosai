import { describe, expect, it } from 'vitest';
import {
  buildSpeechInstructions,
  MAX_SPEECH_CONTEXT_CODE_POINTS,
  SPEECH_INSTRUCTION_VERSION,
} from './speech-instructions';

describe('speech instructions', () => {
  it('is versioned and asks for exact target-only natural Japanese', () => {
    const instructions = buildSpeechInstructions();

    expect(SPEECH_INSTRUCTION_VERSION).toBe('speech/4');
    expect(instructions).toContain('Speak only the exact target text');
    expect(instructions).toContain('natural standard Japanese');
    expect(instructions).toContain('Never pronounce mora by mora');
    expect(instructions).toContain('Never stretch syllables');
    expect(instructions).toContain('Pronounce every written word');
    expect(instructions).toContain('Do not replace any written word or phrase with laughter');
    // No speed was requested, so nothing claims one was.
    expect(instructions).not.toContain('speed');
  });

  it('asks for the delivery a beginner can follow', () => {
    const instructions = buildSpeechInstructions();

    expect(instructions).toContain('careful articulation');
    expect(instructions).toContain('brief pauses at phrase boundaries');
    expect(instructions).toContain('while keeping standard pitch accent and rhythm intact');
  });

  it('keeps the prefix form compact and free of quotable context', () => {
    const prefix = buildSpeechInstructions(
      { style: 'very-clear', beforeJa: '雨が強くなりました。', afterJa: '次の文。' },
      'prefix',
    );

    // The prefix rides inside the spoken input, so every extra line is another
    // chance for the model to read something out.
    expect(prefix).toContain('a short even pause between phrases');
    expect(prefix).toContain('Never read this direction aloud.');
    expect(prefix).not.toContain('雨');
    expect(prefix).not.toContain('context only');
    expect(prefix.split('\n')).toHaveLength(6);
  });

  it('changes only the style wording when the learner chooses a different style', () => {
    expect(buildSpeechInstructions({ style: 'natural' })).toContain(
      'Use natural articulation, phrase rhythm, and standard pitch accent.',
    );
    expect(buildSpeechInstructions({ style: 'very-clear' })).toContain(
      'a slight gap between words',
    );
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
