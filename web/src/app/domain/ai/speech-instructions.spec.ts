import { describe, expect, it } from 'vitest';
import {
  buildSpeechInstructions,
  MAX_SPEECH_CONTEXT_CODE_POINTS,
  SPEECH_INSTRUCTION_VERSION,
} from './speech-instructions';

describe('speech instructions', () => {
  it('is versioned and asks for exact target-only natural Japanese', () => {
    const instructions = buildSpeechInstructions();

    expect(SPEECH_INSTRUCTION_VERSION).toBe('speech/7');
    expect(instructions).toContain('Speak only the exact target text');
    expect(instructions).toContain('natural standard Japanese');
    expect(instructions).toContain('Never pronounce mora by mora');
    expect(instructions).toContain('Never stretch syllables');
    expect(instructions).toContain('Pronounce every written word');
    expect(instructions).toContain('Do not replace any written word or phrase with laughter');
    expect(instructions).toContain('Pace: use the ordinary speaking rate of a native speaker');
    expect(instructions).toContain('Keep this speaking rate steady throughout the sentence');
    expect(instructions).toContain('never insert silence between words or morae');
  });

  it.each([
    [
      'natural' as const,
      'Pace: use the ordinary speaking rate of a native speaker reading aloud to another adult native speaker.',
    ],
    ['slow' as const, 'Pace: use a moderately slower speaking rate for an intermediate learner'],
    [
      'very-slow' as const,
      'Pace: use a distinctly slower speaking rate for a beginner following the written text',
    ],
  ])('describes the %s pace in words, never as a number', (pace, description) => {
    const instructions = buildSpeechInstructions({ pace });

    expect(instructions).toContain(description);
    expect(instructions).toContain('Keep this speaking rate steady throughout the sentence');
    expect(instructions).not.toMatch(/\d/u);
  });

  it('asks for the delivery a beginner can follow', () => {
    const instructions = buildSpeechInstructions();

    expect(instructions).toContain('pronounce sounds precisely and clearly');
    expect(instructions).toContain('without over-enunciating');
    expect(instructions).toContain(
      'preserve connected phrasing, natural rhythm, and standard pitch accent',
    );
  });

  it('changes only the style wording when the learner chooses a different style', () => {
    expect(buildSpeechInstructions({ style: 'natural' })).toContain(
      'use natural articulation, connected phrasing, and standard pitch accent.',
    );
    expect(buildSpeechInstructions({ style: 'very-clear' })).toContain(
      'especially precise sound definition without over-enunciating or separating words',
    );
  });

  it.each(['natural', 'slow', 'very-slow'] as const)(
    'keeps articulation and %s pace from adding learner-style gaps',
    (pace) => {
      const clear = buildSpeechInstructions({ style: 'clear', pace });
      const veryClear = buildSpeechInstructions({ style: 'very-clear', pace });

      for (const instructions of [clear, veryClear]) {
        expect(instructions).toContain('Use fluent, connected Japanese phrasing');
        expect(instructions).toContain('keep every pause brief');
        expect(instructions).toContain('never insert silence between words or morae');
        expect(instructions).not.toContain('gap between words');
        expect(instructions).not.toContain('pause between phrases');
        expect(instructions).not.toContain('pauses at phrase boundaries');
      }
    },
  );

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
